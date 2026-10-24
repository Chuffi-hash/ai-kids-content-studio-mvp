import {
  StructuredStory,
  StructuredScene,
  StructuredCharacter,
  StructuredDialogue,
  StructuredCharacterAction,
  PersistedStoryResult,
} from './story-generation.types.js';
import { CharacterResolutionService } from './character-resolution.service.js';
import { ScenePreparationService } from './scene-preparation.service.js';
import { StoryPersistenceService } from './story-persistence.service.js';
import { AudioGenerationService } from '../audio-generation/audio-generation.service.js';
import { EducationalOverlay, EducationalOverlayType } from '../animation/educational-overlay.renderer.js';
import { AspectRatioType } from '../animation/vector-animation.engine.js';
import { randomUUID } from 'crypto';

export interface StoryImportInput {
  rawText: string;
  title?: string;
  language?: string;
  genre?: string;
  visualStyle?: string;
  topic?: string;
  ageGroup?: string;
  format?: AspectRatioType;
}

export class StoryImporterService {
  /**
   * Intelligently parses Markdown, Screenplay, Plaintext, or JSON into a StructuredStory.
   */
  public static parseRawStoryText(
    rawText: string,
    options?: {
      language?: string;
      defaultTitle?: string;
      genre?: string;
      visualStyle?: string;
      ageGroup?: string;
    }
  ): StructuredStory {
    const text = (rawText || '').trim();
    if (!text) {
      throw new Error('Story text cannot be empty');
    }

    // 1. Attempt JSON parsing (direct or wrapped in markdown codeblock)
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, text];
    const candidateJson = jsonMatch[1]?.trim() || '';
    if (candidateJson.startsWith('{') && candidateJson.endsWith('}')) {
      try {
        const parsed = JSON.parse(candidateJson);
        if (Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
          return this.normalizeParsedJsonStory(parsed, options);
        }
      } catch {
        // Not valid JSON, continue with Markdown / Text parser
      }
    }

    // 2. Parse Markdown or Screenplay text
    return this.parseMarkdownOrTextStory(text, options);
  }

  /**
   * Full end-to-end import: parses raw script, resolves characters & consistency,
   * generates animation scenes with seasonal overlays, persists to database,
   * and auto-synthesizes Kokoro-82M Hindi/English audio.
   */
  public static async importAndPersistStory(
    input: StoryImportInput
  ): Promise<PersistedStoryResult> {
    const language = input.language || 'Hindi';
    const structuredStory = this.parseRawStoryText(input.rawText, {
      language,
      defaultTitle: input.title,
      genre: input.genre,
      visualStyle: input.visualStyle,
      ageGroup: input.ageGroup,
    });

    // 1. Resolve Characters & Consistency
    const { resolvedCharacters, characterMapByName } =
      await CharacterResolutionService.resolveStoryCharacters(
        structuredStory.characters,
        []
      );

    // 2. Reconcile scene dialogue and action names against resolved characters
    CharacterResolutionService.reconcileSceneCharacters(
      structuredStory.scenes,
      characterMapByName,
      resolvedCharacters[0]
    );

    // 3. Prepare Animation-ready Scenes
    const preparedScenes = ScenePreparationService.prepareScenes(
      structuredStory.scenes,
      characterMapByName,
      resolvedCharacters,
      structuredStory.estimatedDurationSeconds
    );

    // 4. Inject auto-detected weather / lighting educational overlays and format variant if set
    for (let i = 0; i < preparedScenes.length; i++) {
      const prepScene = preparedScenes[i];
      const sourceStructured = structuredStory.scenes[i];
      const detectedOverlays = this.detectOverlaysForScene(
        sourceStructured?.visualDescription || '',
        sourceStructured?.title || '',
        prepScene.estimatedDurationMs || 6000
      );

      if (prepScene.animationData) {
        if (input.format) {
          prepScene.animationData.activeFormat = input.format;
        }
        if (detectedOverlays.length > 0) {
          const existing = prepScene.animationData.overlays || [];
          prepScene.animationData.overlays = [...existing, ...detectedOverlays];
        }
      }
    }

    // 5. Persist Story, Characters, and Scenes inside an atomic transaction
    const persistedResult = await StoryPersistenceService.persistNewStory(
      structuredStory,
      preparedScenes,
      resolvedCharacters,
      {
        topic: input.topic || structuredStory.title,
        language,
        genre: input.genre || structuredStory.genre,
        visualStyle: input.visualStyle || 'Storybook',
        ageGroup: input.ageGroup || structuredStory.targetAudience,
      }
    );

    // 6. Auto-generate dialogue audio files via Kokoro-82M (best effort)
    try {
      const audioGen = new AudioGenerationService();
      await audioGen.generateAllStoryDialogues(persistedResult.storyId);
    } catch (err) {
      console.warn(`[StoryImporter] Initial dialogue audio generation notice:`, err);
    }

    return persistedResult;
  }

  /**
   * Normalizes a JSON story payload into the StructuredStory schema.
   */
  private static normalizeParsedJsonStory(
    parsed: any,
    options?: { language?: string; defaultTitle?: string; genre?: string; visualStyle?: string; ageGroup?: string }
  ): StructuredStory {
    const characters: StructuredCharacter[] = Array.isArray(parsed.characters)
      ? parsed.characters.map((c: any) => ({
          name: c.name || 'Character',
          role: c.role || 'protagonist',
          species: c.species || (c.name?.toLowerCase().includes('earth') ? 'earth' : 'human'),
          description: c.description || `${c.name || 'Character'} in the story`,
          personality: c.personality || 'friendly and helpful',
        }))
      : [];

    const scenes: StructuredScene[] = (parsed.scenes || []).map((s: any, idx: number) => {
      const dialogue: StructuredDialogue[] = Array.isArray(s.dialogue)
        ? s.dialogue.map((d: any) => ({
            characterName: d.characterName || d.speaker || 'Narrator',
            text: d.text || '',
            emotion: d.emotion || 'neutral',
          }))
        : [];

      return {
        sceneNumber: s.sceneNumber || idx + 1,
        title: s.title || `Scene ${idx + 1}`,
        summary: s.summary || s.narration || '',
        visualDescription: s.visualDescription || s.visualPrompt || s.visual || '',
        location: s.location || 'Landscape',
        timeOfDay: s.timeOfDay || 'Day',
        narration: s.narration || '',
        dialogue,
        characterActions: Array.isArray(s.characterActions) ? s.characterActions : [],
        durationSeconds: s.durationSeconds || Math.max(4, Math.round((s.narration?.length || 20) / 12)),
      };
    });

    return {
      title: parsed.title || options?.defaultTitle || 'Imported Story',
      logline: parsed.logline || parsed.topic || 'A wonderful educational story for young learners.',
      lesson: parsed.lesson || 'Understanding our beautiful world.',
      targetAudience: parsed.targetAudience || options?.ageGroup || '4-7 years',
      genre: parsed.genre || options?.genre || 'Educational',
      estimatedDurationSeconds: scenes.reduce((acc, s) => acc + s.durationSeconds, 0),
      characters,
      scenes,
    };
  }

  /**
   * Parses Markdown or Screenplay formatted scripts.
   */
  private static parseMarkdownOrTextStory(
    text: string,
    options?: { language?: string; defaultTitle?: string; genre?: string; visualStyle?: string; ageGroup?: string }
  ): StructuredStory {
    const lines = text.split('\n').map((l) => l.trim());

    let title = options?.defaultTitle || '';
    let logline = '';
    let lesson = '';
    const declaredCharacters: StructuredCharacter[] = [];
    const detectedCharacterNames = new Set<string>();

    // Scene splitting regex: matches "## Scene 1", "### Scene 1", "Scene 1:", "SCENE 1:"
    const sceneSplitRegex = /^(?:#{1,3}\s*)?Scene\s*(\d+)[\s:.\-—]*(.*)$/i;

    interface RawSceneBlock {
      sceneNum: number;
      headerTitle: string;
      lines: string[];
    }

    const sceneBlocks: RawSceneBlock[] = [];
    let currentBlock: RawSceneBlock | null = null;
    let inPreamble = true;

    for (const rawLine of lines) {
      if (!rawLine) continue;

      // Extract title from preamble (# Title: ... or Title: ...)
      if (inPreamble) {
        const titleMatch = rawLine.match(/^(?:#\s*Title\s*:\s*|#\s+|Title\s*:\s*)(.*)$/i);
        if (titleMatch && !title) {
          title = titleMatch[1].trim();
          continue;
        }

        const loglineMatch = rawLine.match(/^(?:Logline|Summary|Topic)\s*:\s*(.*)$/i);
        if (loglineMatch && !logline) {
          logline = loglineMatch[1].trim();
          continue;
        }

        const lessonMatch = rawLine.match(/^Lesson\s*:\s*(.*)$/i);
        if (lessonMatch && !lesson) {
          lesson = lessonMatch[1].trim();
          continue;
        }

        const charLineMatch = rawLine.match(/^[-*]\s*([A-Za-z0-9\s]+?)(?:\s*\((.*?)\))?:\s*(.*)$/);
        if (charLineMatch) {
          const charName = charLineMatch[1].trim();
          const roleOrSpecies = charLineMatch[2]?.trim() || '';
          const desc = charLineMatch[3]?.trim() || '';
          declaredCharacters.push({
            name: charName,
            role: roleOrSpecies.toLowerCase().includes('protag') ? 'protagonist' : 'companion',
            species: charName.toLowerCase().includes('earth') ? 'earth' : (roleOrSpecies || 'human'),
            description: desc || `${charName} in the story`,
            personality: 'friendly and expressive',
          });
          detectedCharacterNames.add(charName);
          continue;
        }
      }

      // Check for scene start
      const sceneMatch = rawLine.match(sceneSplitRegex);
      if (sceneMatch) {
        inPreamble = false;
        const num = parseInt(sceneMatch[1], 10);
        const sceneTitle = sceneMatch[2]?.trim() || `Scene ${num}`;
        currentBlock = {
          sceneNum: num,
          headerTitle: sceneTitle,
          lines: [],
        };
        sceneBlocks.push(currentBlock);
        continue;
      }

      if (currentBlock) {
        currentBlock.lines.push(rawLine);
      }
    }

    // Fallback: If no "Scene X" tags were found, split paragraphs into scenes
    if (sceneBlocks.length === 0) {
      const paragraphs = text
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      paragraphs.forEach((p, idx) => {
        sceneBlocks.push({
          sceneNum: idx + 1,
          headerTitle: `Scene ${idx + 1}`,
          lines: p.split('\n').map((l) => l.trim()),
        });
      });
    }

    const structuredScenes: StructuredScene[] = sceneBlocks.map((block) => {
      let visualPrompt = '';
      let narration = '';
      const dialogue: StructuredDialogue[] = [];
      const characterActions: StructuredCharacterAction[] = [];

      for (const line of block.lines) {
        // Visual / Background description
        const visualMatch = line.match(/^(?:Visual(?:\s*Prompt)?|Background|Image|Setting)\s*:\s*(.*)$/i);
        if (visualMatch) {
          visualPrompt = visualMatch[1].trim();
          continue;
        }

        // Explicit narration line
        const narrationMatch = line.match(/^(?:Narration|Narrator)\s*:\s*(.*)$/i);
        if (narrationMatch) {
          const content = narrationMatch[1].trim();
          narration = narration ? `${narration} ${content}` : content;
          continue;
        }

        // Dialogue line: "Speaker: dialogue (Emotion: happy)"
        const dialogueMatch = line.match(/^([A-Za-z0-9\s]+?)\s*:\s*(?:["“](.*?)["”]|(.*?))(?:\s*\((?:Emotion:\s*)?(.*?)\))?$/i);
        if (dialogueMatch) {
          const speaker = dialogueMatch[1].trim();
          const speechText = (dialogueMatch[2] || dialogueMatch[3] || '').trim();
          const emotion = (dialogueMatch[4] || 'happy').trim();

          // Exclude metadata headers
          if (!['visual', 'prompt', 'background', 'effects', 'action', 'setting', 'camera'].includes(speaker.toLowerCase())) {
            dialogue.push({
              characterName: speaker,
              text: speechText,
              emotion,
            });
            detectedCharacterNames.add(speaker);

            // Add corresponding character animation action
            characterActions.push({
              characterName: speaker,
              action: emotion.toLowerCase().includes('excit') ? 'wave' : 'idle',
            });
            continue;
          }
        }

        // If line is not a labeled field, treat as narration if no narration exists yet
        if (!narration && !line.startsWith('#') && !line.startsWith('**Effects') && line.length > 8) {
          narration = line;
        }
      }

      // If narration was empty, provide a clean fallback
      if (!narration) {
        narration = block.headerTitle || `Scene ${block.sceneNum}`;
      }

      const calculatedSec = Math.max(4, Math.round(narration.length / 10));

      return {
        sceneNumber: block.sceneNum,
        title: block.headerTitle,
        summary: narration,
        visualDescription: visualPrompt || `${block.headerTitle} educational landscape`,
        location: 'Nature landscape',
        timeOfDay: 'Day',
        narration,
        dialogue,
        characterActions,
        durationSeconds: calculatedSec,
      };
    });

    // Ensure all characters mentioned in dialogue or declarations exist
    const finalCharacters: StructuredCharacter[] = [...declaredCharacters];
    for (const name of detectedCharacterNames) {
      if (!finalCharacters.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
        const lower = name.toLowerCase();
        const species = lower.includes('earth') ? 'earth' : (lower.includes('bear') || lower.includes('pip') ? 'bear' : 'human');
        finalCharacters.push({
          name,
          role: lower.includes('earth') ? 'protagonist' : 'companion',
          species,
          description: `${name} the friendly character`,
          personality: 'kind and curious',
        });
      }
    }

    if (finalCharacters.length === 0) {
      finalCharacters.push({
        name: 'Earth',
        role: 'protagonist',
        species: 'earth',
        description: 'Earth the wise, smiling living planet',
        personality: 'caring and joyful',
      });
    }

    return {
      title: title || 'The Four Seasons Adventure',
      logline: logline || 'An inspiring journey exploring the beauty of nature and seasons.',
      lesson: lesson || 'Nature gives us wonderful gifts in every season.',
      targetAudience: options?.ageGroup || '4-7 years',
      genre: options?.genre || 'Educational',
      estimatedDurationSeconds: structuredScenes.reduce((acc, s) => acc + s.durationSeconds, 0),
      characters: finalCharacters,
      scenes: structuredScenes,
    };
  }

  /**
   * Intelligently detects and generates EducationalOverlay items
   * based on scene visual keywords (weather, lighting, educational markers).
   */
  public static detectOverlaysForScene(
    visualPrompt: string,
    title: string,
    durationMs: number
  ): EducationalOverlay[] {
    const combined = `${visualPrompt} ${title}`.toLowerCase();
    const overlays: EducationalOverlay[] = [];

    // Summer / Sunshine / Sun rays
    if (combined.includes('sun') || combined.includes('summer') || combined.includes('धूप') || combined.includes('ग्रीष्म')) {
      overlays.push({
        id: `overlay-sun-${randomUUID().slice(0, 6)}`,
        type: 'sunshine_rays',
        startMs: 0,
        durationMs,
        x: 0,
        y: 0,
        color: '#fef08a',
        layerPosition: 'below_characters',
      });
      overlays.push({
        id: `overlay-heat-${randomUUID().slice(0, 6)}`,
        type: 'heat_shimmer',
        startMs: 500,
        durationMs: durationMs - 500,
        x: 640,
        y: 540,
        color: '#fde047',
        layerPosition: 'below_characters',
      });
    }

    // Rain / Monsoon / Clouds / Water
    if (combined.includes('rain') || combined.includes('monsoon') || combined.includes('बारिश') || combined.includes('वर्षा') || combined.includes('cloud')) {
      overlays.push({
        id: `overlay-rain-${randomUUID().slice(0, 6)}`,
        type: 'rain',
        startMs: 0,
        durationMs,
        x: 0,
        y: 0,
        color: '#38bdf8',
        layerPosition: 'above_characters',
      });
      overlays.push({
        id: `overlay-clouds-${randomUUID().slice(0, 6)}`,
        type: 'moving_clouds',
        startMs: 0,
        durationMs,
        x: 0,
        y: 120,
        color: '#e2e8f0',
        layerPosition: 'below_characters',
      });
      overlays.push({
        id: `overlay-splash-${randomUUID().slice(0, 6)}`,
        type: 'water_splashes',
        startMs: 800,
        durationMs: durationMs - 800,
        x: 640,
        y: 620,
        color: '#7dd3fc',
        layerPosition: 'above_characters',
      });
    }

    // Winter / Snow / Cold / Fog
    if (combined.includes('snow') || combined.includes('winter') || combined.includes('सर्दी') || combined.includes('बर्फ') || combined.includes('fog')) {
      overlays.push({
        id: `overlay-snow-${randomUUID().slice(0, 6)}`,
        type: 'snowfall',
        startMs: 0,
        durationMs,
        x: 0,
        y: 0,
        color: '#f8fafc',
        layerPosition: 'above_characters',
      });
      overlays.push({
        id: `overlay-fog-${randomUUID().slice(0, 6)}`,
        type: 'fog_mist',
        startMs: 400,
        durationMs: durationMs - 400,
        x: 640,
        y: 550,
        color: '#f1f5f9',
        layerPosition: 'below_characters',
      });
    }

    // Autumn / Leaves / Wind / Birds
    if (combined.includes('autumn') || combined.includes('fall') || combined.includes('leaves') || combined.includes('पतझड़') || combined.includes('wind')) {
      overlays.push({
        id: `overlay-leaves-${randomUUID().slice(0, 6)}`,
        type: 'falling_leaves',
        startMs: 0,
        durationMs,
        x: 0,
        y: 0,
        color: '#f97316',
        layerPosition: 'above_characters',
      });
      overlays.push({
        id: `overlay-birds-${randomUUID().slice(0, 6)}`,
        type: 'flying_birds',
        startMs: 600,
        durationMs: durationMs - 600,
        x: 0,
        y: 140,
        color: '#334155',
        layerPosition: 'below_characters',
      });
    }

    // Butterflies / Garden / Spring
    if (combined.includes('butterfl') || combined.includes('spring') || combined.includes('garden') || combined.includes('बसंत') || combined.includes('तितली')) {
      overlays.push({
        id: `overlay-butterfly-${randomUUID().slice(0, 6)}`,
        type: 'butterflies',
        startMs: 400,
        durationMs: durationMs - 400,
        x: 640,
        y: 450,
        color: '#f43f5e',
        layerPosition: 'above_characters',
      });
    }

    return overlays;
  }
}
