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
import {
  AspectRatioType,
  CharacterInstance,
  AnimationClip,
  ExpressionCue,
  SceneDialogue,
  VectorSceneData,
  FacialExpression,
  SpeakingDirection,
} from '../animation/vector-animation.engine.js';
import {
  prisma,
  createCharacter,
  getCharacterByName,
  getStoryByStoryId,
  updateStoryMetadata,
  getScenesByStoryId,
  createScene,
  getImagesBySceneId,
  createStory,
} from '../database/database.service.js';
import {
  buildRigFromAppearance,
  CHARACTER_PRESETS,
  DEFAULT_APPEARANCE,
} from '../animation/templates/custom-character-rig.js';
import { estimateSpeechDurationMs } from '../timing/timing.service.js';
import { generateVisemeCues } from '../audio-generation/viseme-generator.js';
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

export interface DraftDialogueLine {
  id?: string;
  characterName: string;
  text: string;
  emotion?: string;
  expression?: string;
  voice?: string;
}

export interface DraftOverlayItem {
  id: string;
  type: string;
  label: string;
  color?: string;
}

export interface DraftStoryboardScene {
  sceneNumber: number;
  title: string;
  durationSeconds: number;
  visualPrompt: string;
  narration: string;
  dialogue: DraftDialogueLine[];
  characterActions: Array<{ characterName: string; action: string; description?: string }>;
  suggestedOverlays: DraftOverlayItem[];
}

export interface DraftStoryboardResult {
  title: string;
  targetDurationSeconds: number;
  language: string;
  logline: string;
  lesson: string;
  characters: Array<{
    id?: string;
    name: string;
    species?: string;
    role?: string;
    voice?: string;
    description?: string;
  }>;
  scenes: DraftStoryboardScene[];
}

export interface ImportDraftScenesInput {
  storyId: string;
  scenes: DraftStoryboardScene[];
  importMode: 'replace' | 'append';
  updateStoryMetadata?: boolean;
  title?: string;
  targetDurationSeconds?: number;
  language?: string;
}

export interface CreateStoryFromDraftInput {
  title: string;
  targetDurationSeconds: number;
  language?: string;
  logline?: string;
  lesson?: string;
  genre?: string;
  visualStyle?: string;
  audience?: string;
  topic?: string;
  characters?: Array<{
    id?: string;
    name: string;
    species?: string;
    role?: string;
    voice?: string;
    description?: string;
  }>;
  scenes: DraftStoryboardScene[];
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
      console.warn('[StoryImporter] Initial dialogue audio generation notice:', err);
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
   * Parses Markdown or Screenplay formatted scripts by delegating to the unified
   * intelligent parser and mapping the draft result into a StructuredStory.
   */
  private static parseMarkdownOrTextStory(
    text: string,
    options?: { language?: string; defaultTitle?: string; genre?: string; visualStyle?: string; ageGroup?: string }
  ): StructuredStory {
    const draft = this.parseScriptForDraft(text, {
      language: options?.language,
      defaultTitle: options?.defaultTitle,
    });

    const characters: StructuredCharacter[] = draft.characters.map((c) => ({
      name: c.name,
      role: (c.role as any) || (c.name.toLowerCase().includes('earth') ? 'protagonist' : 'companion'),
      species: c.species || (c.name.toLowerCase().includes('earth') ? 'earth' : 'human'),
      description: c.description || `${c.name} in the story`,
      personality: 'friendly and expressive',
    }));

    const structuredScenes: StructuredScene[] = draft.scenes.map((s) => ({
      sceneNumber: s.sceneNumber,
      title: s.title,
      summary: s.visualPrompt || s.title,
      visualDescription: s.visualPrompt,
      location: 'Landscape',
      timeOfDay: 'Day',
      narration: s.narration || '',
      dialogue: s.dialogue.map((d) => ({
        characterName: d.characterName,
        text: d.text,
        emotion: d.emotion || 'cheerful',
      })),
      characterActions: s.characterActions || [],
      durationSeconds: s.durationSeconds,
    }));

    return {
      title: draft.title || options?.defaultTitle || 'Imported Story',
      logline: draft.logline || 'An inspiring journey exploring the beauty of nature and seasons.',
      lesson: draft.lesson || 'Understanding our beautiful world.',
      targetAudience: options?.ageGroup || '4-7 years',
      genre: options?.genre || 'Educational',
      estimatedDurationSeconds: draft.targetDurationSeconds || structuredScenes.reduce((acc, s) => acc + s.durationSeconds, 0),
      characters,
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

  /**
   * Intelligently parses Markdown, Plaintext, or Screenplay scripts into an editable DraftStoryboardResult.
   * Handles Devanagari Hindi, em-dashes, rich metadata extraction, separated narration vs dialogue,
   * actions, expressions, and overlays with 100% precision.
   */
  public static parseScriptForDraft(
    rawText: string,
    options?: {
      language?: string;
      defaultTitle?: string;
      targetDuration?: number;
      existingCharacters?: Array<{ id: string; name: string; species?: string }>;
    }
  ): DraftStoryboardResult {
    const text = (rawText || '').trim();
    if (!text) {
      throw new Error('Script text cannot be empty');
    }

    const lines = text.split('\n').map((l) => l.trim());

    // Detect if content contains Devanagari Hindi characters
    const hasDevanagari = /[\u0900-\u097F]/.test(text);
    let language = options?.language || (hasDevanagari ? 'Hindi' : 'Hindi');
    let title = options?.defaultTitle || '';
    let logline = '';
    let lesson = '';
    let targetDurationSeconds = options?.targetDuration || 0;

    const declaredCharacters: Array<{
      id?: string;
      name: string;
      species?: string;
      role?: string;
      voice?: string;
      description?: string;
    }> = [];
    const detectedCharacterNames = new Set<string>();

    interface RawSceneBlock {
      sceneNum: number;
      headerTitle: string;
      durationHint?: number;
      lines: string[];
    }

    const sceneBlocks: RawSceneBlock[] = [];
    let currentBlock: RawSceneBlock | null = null;
    let inPreamble = true;

    for (const rawLine of lines) {
      if (!rawLine) continue;

      if (inPreamble) {
        // Check if preamble has reached a scene header first
        const headerCheck = matchSceneHeader(rawLine, inPreamble);
        if (headerCheck) {
          inPreamble = false;
          currentBlock = { ...headerCheck, lines: [] };
          sceneBlocks.push(currentBlock);
          continue;
        }

        // Preamble Title
        const titleMatch = rawLine.match(/^(?:#\s*Title\s*:\s*|#\s+|(?:#\s*)?(?:\*{1,2})?Title(?::\*{1,2}|\*{1,2}:|:)\s*)(.*)$/i);
        if (titleMatch && !title) {
          title = titleMatch[1].replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
          continue;
        }

        // Preamble Language
        const langMatch = rawLine.match(/^(?:\*{1,2})?Language(?::\*{1,2}|\*{1,2}:|:)\s*(.*)$/i);
        if (langMatch) {
          const l = langMatch[1].replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
          if (l.toLowerCase().includes('eng')) {
            language = 'English';
          } else if (l.toLowerCase().includes('hin')) {
            language = 'Hindi';
          }
          continue;
        }

        // Preamble Target Duration
        const durMatch = rawLine.match(/^(?:\*{1,2})?(?:Target\s*Duration|Duration|Length)(?::\*{1,2}|\*{1,2}:|:)\s*(\d+)\s*(?:s|sec|seconds)?/i);
        if (durMatch && !targetDurationSeconds) {
          targetDurationSeconds = parseInt(durMatch[1], 10);
          continue;
        }

        // Preamble Logline / Summary
        const loglineMatch = rawLine.match(/^(?:\*{1,2})?(?:Logline|Summary|Topic)(?::\*{1,2}|\*{1,2}:|:)\s*(.*)$/i);
        if (loglineMatch && !logline) {
          logline = loglineMatch[1].replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
          continue;
        }

        // Preamble Lesson
        const lessonMatch = rawLine.match(/^(?:\*{1,2})?Lesson(?::\*{1,2}|\*{1,2}:|:)\s*(.*)$/i);
        if (lessonMatch && !lesson) {
          lesson = lessonMatch[1].replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
          continue;
        }

        // Preamble Characters declaration: "- Earth (Protagonist): ..."
        const charLineMatch = rawLine.match(/^[-*]\s*([A-Za-z0-9\s\u0900-\u097F]+?)(?:\s*\((.*?)\))?:\s*(.*)$/);
        if (charLineMatch) {
          const rawCharName = charLineMatch[1].replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
          const cleanName = cleanSpeakerName(rawCharName);
          if (!isReservedMetadataKey(cleanName)) {
            const roleOrSpecies = charLineMatch[2]?.trim() || '';
            const desc = charLineMatch[3]?.replace(/^\*{1,2}|\*{1,2}$/g, '').trim() || '';
            const isEarth = cleanName.toLowerCase().includes('earth') || cleanName.toLowerCase().includes('terra') || cleanName.includes('पृथ्वी');
            const isHindi = language === 'Hindi' || hasDevanagari;
            const assignedVoice = resolveDefaultVoiceForCharacter(cleanName, isHindi);

            declaredCharacters.push({
              name: cleanName,
              role: roleOrSpecies.toLowerCase().includes('protag') || isEarth ? 'protagonist' : 'companion',
              species: isEarth ? 'earth' : (roleOrSpecies || 'human'),
              description: desc || `${cleanName} in the story`,
              voice: assignedVoice,
            });
            detectedCharacterNames.add(cleanName);
            continue;
          }
        }
      } else {
        // Outside preamble, check for next scene start
        const headerCheck = matchSceneHeader(rawLine, inPreamble);
        if (headerCheck) {
          currentBlock = { ...headerCheck, lines: [] };
          sceneBlocks.push(currentBlock);
          continue;
        }

        if (currentBlock) {
          currentBlock.lines.push(rawLine);
        }
      }
    }

    // Fallback: If no Scene tags were found, split double-newlines into scenes
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

    const isHindi = language === 'Hindi' || hasDevanagari;

    const parsedScenes: DraftStoryboardScene[] = sceneBlocks.map((block) => {
      let visualPrompt = '';
      let narration = '';
      let sceneDurationSeconds = block.durationHint || 0;
      const dialogue: DraftDialogueLine[] = [];
      const characterActions: Array<{ characterName: string; action: string; description?: string }> = [];
      const explicitEffects: string[] = [];
      let pendingEmotion = '';
      let pendingExpression = '';

      for (const rawLine of block.lines) {
        const line = rawLine.trim();
        if (!line) continue;

        // 1. Duration
        const durMatch = line.match(/^(?:\*{1,2})?(?:Duration|Length|Time|Estimated\s+Duration|Scene\s+Duration|अवधि|समय)(?::\*{1,2}|\*{1,2}:|:)\s*(\d+)\s*(?:s|sec|seconds|सेकंड)?/i);
        if (durMatch) {
          sceneDurationSeconds = parseInt(durMatch[1], 10);
          continue;
        }

        // 2. Visual / Background description
        const visualMatch = line.match(/^(?:\*{1,2})?(?:Visual(?:\s*Prompt|\s*Description)?|Background(?:\s*Prompt|\s*Description)?|Image(?:\s*Prompt)?|Setting|Location|दृश्य|पृष्ठभूमि)(?::\*{1,2}|\*{1,2}:|:)\s*(.*)$/i);
        if (visualMatch) {
          const content = visualMatch[1].replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
          visualPrompt = visualPrompt ? `${visualPrompt} ${content}` : content;
          continue;
        }

        // 3. Explicit narration line
        const narrationMatch = line.match(/^(?:\*{1,2})?(?:Narration(?:\s*Script|\s*Text)?|Narrator|Voiceover|VO|V\.O\.|सूत्रधार|कथावाचक|वॉइसओवर)(?::\*{1,2}|\*{1,2}:|:)\s*(.*)$/i);
        if (narrationMatch) {
          const content = narrationMatch[1].replace(/^["“]|["”]$/g, '').replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
          narration = narration ? `${narration} ${content}` : content;
          continue;
        }

        // 4. Explicit effects / overlays line
        const effectsMatch = line.match(/^(?:\*{1,2})?(?:Effects?|Overlays?|Suggested\s+Overlays?|Atmosphere|Visual\s+Effects?|प्रभाव|मौसम\s*प्रभाव)(?::\*{1,2}|\*{1,2}:|:)\s*(.*)$/i);
        if (effectsMatch) {
          const rawList = effectsMatch[1].replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
          const tokens = rawList.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
          for (const tok of tokens) {
            const ovType = normalizeOverlayType(tok);
            if (ovType && !explicitEffects.includes(ovType)) {
              explicitEffects.push(ovType);
            }
          }
          continue;
        }

        // 5. Character Action line
        const actionMatch = line.match(/^(?:\*{1,2})?(?:Character\s+Action|Action|Pose|क्रिया|अभिनय|(?:([A-Za-z0-9\u0900-\u097F]+)\s+(?:Action|Pose|क्रिया|अभिनय)))(?::\*{1,2}|\*{1,2}:|:)\s*(.*)$/i);
        if (actionMatch) {
          let actorName = actionMatch[1] ? cleanSpeakerName(actionMatch[1]) : 'Earth';
          const actionText = (actionMatch[2] || '').replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
          if (actorName === 'Character' || isReservedMetadataKey(actorName)) {
            actorName = 'Earth';
          }
          const { action: normalizedAct, description: actDesc } = normalizeCharacterAction(actionText);
          characterActions.push({
            characterName: actorName,
            action: normalizedAct,
            description: actDesc,
          });
          continue;
        }

        // 6. Character Expression line
        const exprMatch = line.match(/^(?:\*{1,2})?(?:([A-Za-z0-9\s\u0900-\u097F]+?)\s+)?(?:Facial\s+Expression|Expression|Face|चेहरे\s*के\s*भाव|भाव-भंगिमा)(?::\*{1,2}|\*{1,2}:|:)\s*(.*)$/i);
        if (exprMatch) {
          const exprVal = exprMatch[2].replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
          pendingExpression = exprVal;
          if (dialogue.length > 0) {
            dialogue[dialogue.length - 1].expression = exprVal;
          }
          continue;
        }

        // 7. Speaking Emotion line
        const emoMatch = line.match(/^(?:\*{1,2})?(?:([A-Za-z0-9\s\u0900-\u097F]+?)\s+)?(?:Speaking\s+Emotion|Emotion|Speaking\s+Style|Tone|बोलने\s*का\s*भाव|ध्वनि\s*का\s*भाव)(?::\*{1,2}|\*{1,2}:|:)\s*(.*)$/i);
        if (emoMatch) {
          const emoVal = emoMatch[2].replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
          pendingEmotion = emoVal;
          if (dialogue.length > 0) {
            dialogue[dialogue.length - 1].emotion = emoVal;
          }
          continue;
        }

        // 8. Captions / Subtitles
        const capMatch = line.match(/^(?:\*{1,2})?(?:Opening\s+Caption|Closing\s+Caption|Caption|Title\s+Overlay|Subtitles?|शीर्षक|कैप्शन)(?::\*{1,2}|\*{1,2}:|:)\s*(.*)$/i);
        if (capMatch) {
          continue;
        }

        // 9. Dialogue Pattern A (Dash: "**Earth dialogue — surprised, playful:** ...")
        const dashMatch = line.match(/^(?:\*{1,2})?([A-Za-z0-9\s\u0900-\u097F]+?)(?:\s+dialogue|\s+speech|\s+संवाद|\s+बोली)?\s*[-—–]\s*(.*?)(?::\*{1,2}|\*{1,2}:|:)\s*(.*)$/i);
        if (dashMatch) {
          const rawSpeaker = dashMatch[1].replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
          const emotion = dashMatch[2].replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
          let speechText = (dashMatch[3] || '').trim();
          speechText = speechText.replace(/^["“]|["”]$/g, '').replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
          speechText = speechText.replace(/^["“]|["”]$/g, '').trim();

          const cleanSpeaker = cleanSpeakerName(rawSpeaker);
          if (!isReservedMetadataKey(cleanSpeaker) && speechText.length > 0) {
            const assignedVoice = resolveDefaultVoiceForCharacter(cleanSpeaker, isHindi);
            dialogue.push({
              id: randomUUID(),
              characterName: cleanSpeaker,
              text: speechText,
              emotion: emotion || pendingEmotion || 'cheerful',
              expression: pendingExpression,
              voice: assignedVoice,
            });
            detectedCharacterNames.add(cleanSpeaker);
            continue;
          }
        }

        // 10. Dialogue Pattern B (Colon / parens: "Earth: ...", "**Earth (happy):** ...", "Closing Dialogue: ...")
        const colonMatch = line.match(/^(?:\*{1,2})?([A-Za-z0-9\s\u0900-\u097F]+?)(?:\s*\((?:Emotion:\s*)?(.*?)\))?(?::\*{1,2}|\*{1,2}:|:)\s*(?:["“](.*?)["”]|(.*?))(?:\s*\((?:Emotion:\s*)?(.*?)\))?$/i);
        if (colonMatch) {
          const rawSpeaker = colonMatch[1].replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
          const emotionPre = colonMatch[2]?.trim();
          let speechText = (colonMatch[3] || colonMatch[4] || '').trim();
          speechText = speechText.replace(/^["“]|["”]$/g, '').replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
          speechText = speechText.replace(/^["“]|["”]$/g, '').trim();
          const emotionPost = colonMatch[5]?.trim();
          const emotion = emotionPost || emotionPre || pendingEmotion || 'cheerful';

          let cleanSpeaker = cleanSpeakerName(rawSpeaker);
          if (['closing dialogue', 'opening dialogue', 'dialogue', 'संवाद'].includes(rawSpeaker.toLowerCase())) {
            cleanSpeaker = 'Earth';
          }

          if (!isReservedMetadataKey(cleanSpeaker) && speechText.length > 0) {
            const assignedVoice = resolveDefaultVoiceForCharacter(cleanSpeaker, isHindi);
            dialogue.push({
              id: randomUUID(),
              characterName: cleanSpeaker,
              text: speechText,
              emotion,
              expression: pendingExpression,
              voice: assignedVoice,
            });
            detectedCharacterNames.add(cleanSpeaker);
            continue;
          }
        }

        // 11. Fallback for unmarked line: if no narration yet, and not a header or metadata line
        if (!narration && !line.startsWith('#') && !line.startsWith('**') && line.length > 5 && !isReservedMetadataKey(line.split(':')[0])) {
          narration = line;
        }
      }

      // Default duration if not specified
      if (!sceneDurationSeconds || sceneDurationSeconds <= 0) {
        const textLen = (narration.length || 0) + dialogue.reduce((acc, d) => acc + (d.text?.length || 0), 0);
        sceneDurationSeconds = Math.max(8, Math.min(25, Math.round(textLen / 12) + 4));
      }

      // Detect / build suggested overlays
      const durationMs = sceneDurationSeconds * 1000;
      const suggestedOverlays: DraftOverlayItem[] = [];

      if (explicitEffects.length > 0) {
        for (const eff of explicitEffects) {
          suggestedOverlays.push({
            id: `overlay-${eff}-${randomUUID().slice(0, 6)}`,
            type: eff,
            label: getOverlayLabel(eff),
            color: eff.includes('sun') ? '#fef08a' : eff.includes('rain') ? '#38bdf8' : eff.includes('snow') ? '#f8fafc' : eff.includes('leaf') || eff.includes('leaves') ? '#f97316' : '#fb923c',
          });
        }
      } else {
        const autoOverlays = StoryImporterService.detectOverlaysForScene(
          visualPrompt || '',
          block.headerTitle || '',
          durationMs
        );
        for (const ov of autoOverlays) {
          suggestedOverlays.push({
            id: ov.id,
            type: ov.type,
            label: getOverlayLabel(ov.type),
            color: ov.color,
          });
        }
      }

      return {
        sceneNumber: block.sceneNum,
        title: block.headerTitle,
        durationSeconds: sceneDurationSeconds,
        visualPrompt: visualPrompt || `${block.headerTitle} illustration`,
        narration: narration || '',
        dialogue,
        characterActions,
        suggestedOverlays,
      };
    });

    // Populate resolved characters list
    const finalCharacters: Array<{
      id?: string;
      name: string;
      species?: string;
      role?: string;
      voice?: string;
      description?: string;
    }> = [...declaredCharacters];

    for (const rawName of detectedCharacterNames) {
      const cleanName = cleanSpeakerName(rawName);
      if (isReservedMetadataKey(cleanName)) continue;
      if (!finalCharacters.some((c) => c.name.toLowerCase() === cleanName.toLowerCase())) {
        const lower = cleanName.toLowerCase();
        const isEarth = lower.includes('earth') || lower.includes('terra') || cleanName.includes('धरती') || cleanName.includes('पृथ्वी');
        const species = isEarth ? 'earth' : lower.includes('bear') ? 'bear' : 'human';
        const assignedVoice = resolveDefaultVoiceForCharacter(cleanName, isHindi);

        finalCharacters.push({
          name: cleanName,
          role: isEarth ? 'protagonist' : 'companion',
          species,
          description: `${cleanName} in the story`,
          voice: assignedVoice,
        });
      }
    }

    if (finalCharacters.length === 0) {
      finalCharacters.push({
        name: 'Earth',
        role: 'protagonist',
        species: 'earth',
        description: 'Earth the wise, smiling living planet',
        voice: isHindi ? 'hf_alpha' : 'bm_daniel',
      });
    }

    const calculatedTotalSeconds = parsedScenes.reduce((acc, s) => acc + s.durationSeconds, 0);

    return {
      title: title || 'Imported Storyboard',
      targetDurationSeconds: targetDurationSeconds > 0 ? targetDurationSeconds : calculatedTotalSeconds,
      language,
      logline: logline || 'An engaging educational storyboard for young learners.',
      lesson: lesson || 'Learning through nature and stories.',
      characters: finalCharacters,
      scenes: parsedScenes,
    };
  }

  /**
   * Commits reviewed/edited draft storyboard scenes into the database
   * for an existing story without triggering automated media generation.
   *
   * Creates real editable scenes, character instances, dialogue lines with Hindi voices,
   * expressions, educational overlays, but leaves imageUrl/audioUrl/videoUrl null so the user
   * can review, generate backgrounds and audio, and assemble independently.
   */
  public static async importDraftScenesToStory(
    input: ImportDraftScenesInput
  ): Promise<any[]> {
    const { storyId, scenes: draftScenes, importMode, updateStoryMetadata: shouldUpdateMeta, title, targetDurationSeconds, language } = input;

    const story = await getStoryByStoryId(storyId);
    if (!story) {
      throw new Error(`Story not found: ${storyId}`);
    }

    const isHindi = language ? language.toLowerCase().includes('hi') : true;

    // 1. Resolve and link characters (excluding reserved metadata keys)
    const charNamesSet = new Set<string>();
    for (const sc of draftScenes) {
      for (const d of sc.dialogue || []) {
        if (d.characterName) {
          const cleaned = cleanSpeakerName(d.characterName);
          if (!isReservedMetadataKey(cleaned)) {
            charNamesSet.add(cleaned);
          }
        }
      }
      for (const a of sc.characterActions || []) {
        if (a.characterName) {
          const cleaned = cleanSpeakerName(a.characterName);
          if (!isReservedMetadataKey(cleaned)) {
            charNamesSet.add(cleaned);
          }
        }
      }
    }

    if (charNamesSet.size === 0) {
      charNamesSet.add('Earth');
    }

    // In replace mode, clean up ghost characters and stale storyCharacter links
    if (importMode === 'replace') {
      const ghostNames = [
        'Duration',
        'Background Prompt',
        'Opening Caption',
        'Earth Speaking Emotion',
        'Earth Facial Expression',
        'Character Action',
        'Closing Dialogue',
        'Visual Prompt',
        'Narration',
      ];
      try {
        const ghostChars = await (prisma as any).character.findMany({
          where: { name: { in: ghostNames } },
          select: { id: true },
        });
        if (ghostChars.length > 0) {
          const ghostIds = ghostChars.map((c: any) => c.id);
          await (prisma as any).storyCharacter.deleteMany({ where: { characterId: { in: ghostIds } } });
          await (prisma as any).character.deleteMany({ where: { id: { in: ghostIds } } });
        }
      } catch (err) {
        console.warn('[StoryImporter] Ghost character cleanup notice:', err);
      }

      await (prisma as any).storyCharacter.deleteMany({ where: { storyId } });
    }

    const resolvedCharsMap = new Map<string, any>();
    const allLinkedChars: any[] = [];

    for (const name of charNamesSet) {
      const lower = name.toLowerCase();
      let charRecord = await getCharacterByName(name);
      if (!charRecord) {
        const isEarth = lower.includes('earth') || lower.includes('terra') || name.includes('पृथ्वी');
        const isBear = lower.includes('bear') || lower.includes('pip');
        const isRobot = lower.includes('robot');
        const isGirl = lower.includes('maya') || lower.includes('girl');

        let app: any;
        if (isEarth) {
          app = {
            ...CHARACTER_PRESETS.earth.appearance,
            voiceConfig: {
              voiceId: isHindi ? 'hf_alpha' : 'bm_daniel',
              speed: 1.0,
              style: 'cheerful',
              effect: 'normal',
            },
          };
        } else if (isBear) {
          app = CHARACTER_PRESETS.bear_cub.appearance;
        } else if (isRobot) {
          app = CHARACTER_PRESETS.robot.appearance;
        } else if (isGirl) {
          app = CHARACTER_PRESETS.kid_girl.appearance;
        } else {
          app = {
            ...DEFAULT_APPEARANCE,
            species: 'human',
            voiceConfig: {
              voiceId: isHindi ? 'hf_beta' : 'af_heart',
              speed: 1.0,
              style: 'cheerful',
              effect: 'normal',
            },
          };
        }

        charRecord = await createCharacter({
          id: randomUUID(),
          name,
          species: isEarth ? 'earth' : isBear ? 'bear' : 'human',
          personality: isEarth ? 'Smiling, wise living planet' : 'Friendly and curious',
          visualDescription: `${name} the character in the story`,
          distinctiveFeatures: isEarth ? 'Planet Earth continents' : 'Storybook character',
          canonicalAppearance: app,
        });
      }

      resolvedCharsMap.set(lower, charRecord);
      allLinkedChars.push(charRecord);

      // Link to story if not already linked
      const existingLink = await (prisma as any).storyCharacter.findFirst({
        where: { storyId, characterId: charRecord.id },
      });
      if (!existingLink) {
        await (prisma as any).storyCharacter.create({
          data: {
            id: randomUUID(),
            storyId,
            characterId: charRecord.id,
          },
        });
      }
    }

    // 2. Determine ordering and starting timestamps
    let runningTimeMs = 0;
    let startOrder = 1;
    let startNumber = 1;

    if (importMode === 'replace') {
      const oldScenes = await (prisma as any).scene.findMany({
        where: { storyId },
        select: { sceneId: true },
      });
      const oldSceneIds = oldScenes.map((s: any) => s.sceneId);
      if (oldSceneIds.length > 0) {
        await (prisma as any).image.deleteMany({ where: { sceneId: { in: oldSceneIds } } });
        await (prisma as any).sceneVersion.deleteMany({ where: { sceneId: { in: oldSceneIds } } });
        await (prisma as any).scene.deleteMany({ where: { storyId } });
      }
      runningTimeMs = 0;
      startOrder = 1;
      startNumber = 1;
    } else {
      const existingScenes = await getScenesByStoryId(storyId, false);
      if (existingScenes.length > 0) {
        const last = existingScenes[existingScenes.length - 1];
        runningTimeMs = last.endMs || 0;
        startOrder = (last.order || existingScenes.length) + 1;
        startNumber = (last.number || existingScenes.length) + 1;
      }
    }

    // 3. Create real scenes in database
    for (let i = 0; i < draftScenes.length; i++) {
      const draft = draftScenes[i];
      const sceneNum = startNumber + i;
      const order = startOrder + i;
      const durationSeconds = draft.durationSeconds || 10;
      const durationMs = Math.max(2000, durationSeconds * 1000);
      const startMs = runningTimeMs;
      const endMs = startMs + durationMs;
      runningTimeMs = endMs;

      // Identify scene characters
      const sceneCharRecords: any[] = [];
      const sceneCharNames = new Set<string>();
      for (const d of draft.dialogue || []) {
        if (d.characterName) {
          const cl = cleanSpeakerName(d.characterName);
          if (!isReservedMetadataKey(cl)) sceneCharNames.add(cl.toLowerCase());
        }
      }
      for (const a of draft.characterActions || []) {
        if (a.characterName) {
          const cl = cleanSpeakerName(a.characterName);
          if (!isReservedMetadataKey(cl)) sceneCharNames.add(cl.toLowerCase());
        }
      }

      if (sceneCharNames.size === 0 && allLinkedChars.length > 0) {
        sceneCharRecords.push(allLinkedChars[0]);
      } else {
        for (const cName of sceneCharNames) {
          const rec = resolvedCharsMap.get(cName);
          if (rec && !sceneCharRecords.some((c) => c.id === rec.id)) {
            sceneCharRecords.push(rec);
          }
        }
      }

      // Build character instances with rigs
      const count = sceneCharRecords.length;
      const characterInstances: CharacterInstance[] = sceneCharRecords.map((char, cIdx) => {
        const instanceId = `char-${char.id}-${sceneNum}-${cIdx}`;
        let xPos = 640;
        if (count === 2) {
          xPos = cIdx === 0 ? 460 : 820;
        } else if (count >= 3) {
          const step = 640 / (count + 1);
          xPos = 320 + (cIdx + 1) * step;
        }

        let app = char.canonicalAppearance;
        if (!app) {
          const isEarth = char.species === 'earth' || char.name?.toLowerCase().includes('earth');
          app = isEarth ? CHARACTER_PRESETS.earth.appearance : DEFAULT_APPEARANCE;
        }

        const rig = buildRigFromAppearance(char.id, char.name, app);

        return {
          instanceId,
          characterId: char.id,
          assetType: 'vector_rig',
          name: char.name?.toLowerCase() === 'earth' ? 'Earth' : char.name,
          x: Math.round(xPos),
          y: 470,
          scale: 1.0,
          rotation: 0,
          flipX: count === 2 && cIdx === 1,
          zIndex: cIdx + 1,
          customRig: rig,
          appearance: app,
        };
      });

      // Build sequential dialogue lines and expression cues
      const speechDurationMs = estimateSpeechDurationMs(draft.narration);
      let curDiagStartMs = speechDurationMs > 0 ? speechDurationMs + 500 : 500;
      const dialogueLines: SceneDialogue[] = [];
      const expressionCues: ExpressionCue[] = [];

      for (const d of draft.dialogue || []) {
        if (!d.text || !d.text.trim()) continue;
        const cleanedName = cleanSpeakerName(d.characterName || 'Earth');
        if (isReservedMetadataKey(cleanedName)) continue;
        const charNameLower = cleanedName.toLowerCase();
        const matchedChar = sceneCharRecords.find((c) => c.name.toLowerCase() === charNameLower) || sceneCharRecords[0];
        const matchedInst = characterInstances.find(
          (ci) => ci.name?.toLowerCase() === charNameLower || (matchedChar && ci.characterId === matchedChar.id)
        );

        let charVoice = d.voice;
        if (!charVoice) {
          charVoice = resolveDefaultVoiceForCharacter(cleanedName || matchedChar?.name || '', isHindi);
        }

        const { speakingDirection, facialExpression } = mapEmotionToDirectionAndExpression(d.emotion || 'cheerful');
        const lineDurationMs = Math.max(1500, estimateSpeechDurationMs(d.text));
        const visemeCues = generateVisemeCues(d.text, lineDurationMs);

        const dialogueItem: SceneDialogue = {
          id: d.id || randomUUID(),
          characterId: matchedChar?.id,
          characterInstanceId: matchedInst?.instanceId,
          characterName: cleanedName || matchedChar?.name || 'Earth',
          text: d.text,
          voice: charVoice,
          speakingDirection,
          speed: 1.0,
          startMs: curDiagStartMs,
          durationMs: lineDurationMs,
          visemeCues,
        };
        dialogueLines.push(dialogueItem);

        if (matchedInst) {
          expressionCues.push({
            id: randomUUID(),
            instanceId: matchedInst.instanceId,
            characterInstanceId: matchedInst.instanceId,
            characterId: matchedInst.characterId,
            expression: facialExpression,
            startMs: curDiagStartMs,
            durationMs: lineDurationMs + 400,
          });
        }

        curDiagStartMs += lineDurationMs + 400;
      }

      // Build EducationalOverlays from suggested overlays
      const overlays: EducationalOverlay[] = [];
      for (const sug of draft.suggestedOverlays || []) {
        const type = sug.type as EducationalOverlayType;
        const isAbove = ['rain', 'water_splashes', 'snowfall', 'falling_leaves', 'butterflies'].includes(type);
        overlays.push({
          id: sug.id || `overlay-${type}-${randomUUID().slice(0, 6)}`,
          type,
          startMs: 0,
          durationMs,
          x: 0,
          y: 0,
          color: sug.color || '#38bdf8',
          layerPosition: isAbove ? 'above_characters' : 'below_characters',
        });
      }

      // Build character animation clips
      const clips: AnimationClip[] = characterInstances.map((ci) => {
        let matchingAction = (draft.characterActions || []).find(
          (a) => cleanSpeakerName(a.characterName || '').toLowerCase() === ci.name?.toLowerCase()
        );
        if (!matchingAction && (draft.characterActions || []).length > 0) {
          matchingAction = draft.characterActions[0];
        }
        const act = matchingAction?.action || 'idle';
        return {
          clipId: `clip-${ci.instanceId}-${act}`,
          instanceId: ci.instanceId,
          action: (['idle', 'walk', 'wave', 'jump', 'point'].includes(act) ? act : 'idle') as any,
          startMs: 0,
          durationMs,
          loop: true,
        };
      });

      const animationData: VectorSceneData = {
        version: 1,
        viewport: { width: 1280, height: 720 },
        characterInstances,
        animationClips: clips,
        expressionCues,
        dialogueLines,
        overlays,
      };

      const sceneId = `${storyId}-scene-${sceneNum}-${randomUUID().slice(0, 6)}`;
      await createScene({
        id: randomUUID(),
        sceneId,
        storyId,
        title: draft.title || `Scene ${sceneNum}`,
        number: sceneNum,
        order,
        startMs,
        endMs,
        narration: draft.narration || '',
        visualPrompt: draft.visualPrompt || null,
        cameraDirection: 'Eye level wide establishing shot',
        characterIds: JSON.stringify(sceneCharRecords.map((c) => c.id)),
        estimatedDurationMs: durationMs,
        generationStatus: 'draft',
        imageUrl: null, // NOT automatically generated
        audioUrl: null, // NOT automatically generated
        videoUrl: null, // NOT automatically generated
        animationData,
      });
    }

    // 4. Update story metadata if requested
    if (shouldUpdateMeta) {
      const updateData: any = {};
      if (title && title.trim()) updateData.title = title.trim();
      if (targetDurationSeconds && targetDurationSeconds > 0) {
        updateData.targetDuration = targetDurationSeconds;
      }
      if (Object.keys(updateData).length > 0) {
        await updateStoryMetadata(storyId, updateData);
      }
    }

    // 5. Fetch and return all scenes for this story with formatting matching GET /story/:storyId
    const allScenes = await getScenesByStoryId(storyId, false);
    return await Promise.all(
      allScenes.map(async (scene: any) => {
        const images = await getImagesBySceneId(scene.sceneId);
        const latestImage = images.length > 0 ? images[0] : null;

        let parsedCharacterIds: string[] = [];
        if (scene.characterIds) {
          try {
            parsedCharacterIds = JSON.parse(scene.characterIds);
          } catch {
            parsedCharacterIds = [scene.characterIds];
          }
        }

        return {
          id: scene.id,
          sceneId: scene.sceneId,
          storyId: scene.storyId,
          title: scene.title,
          number: scene.number,
          order: scene.order ?? scene.number,
          startMs: scene.startMs ?? 0,
          endMs: scene.endMs ?? 0,
          narration: scene.narration,
          visualPrompt: scene.visualPrompt || null,
          cameraDirection: scene.cameraDirection || 'Eye level wide establishing shot',
          characterIds: parsedCharacterIds,
          imageUrl: scene.imageUrl || (latestImage ? latestImage.imageUrl : null),
          videoUrl: scene.videoUrl || null,
          audioUrl: scene.audioUrl || null,
          generationStatus: scene.generationStatus || 'draft',
          estimatedDurationMs: scene.estimatedDurationMs || 0,
          actualAudioDurationMs: scene.actualAudioDurationMs || null,
          generationError: scene.generationError || null,
          animationData: scene.animationData || null,
          versions: scene.versions || [],
          image: latestImage || null,
          createdAt: scene.createdAt,
          updatedAt: scene.updatedAt,
        };
      })
    );
  }

  /**
   * Creates a new story and commits reviewed draft storyboard scenes.
   */
  public static async createStoryFromDraft(
    input: CreateStoryFromDraftInput
  ): Promise<{ storyId: string; story: any; scenes: any[] }> {
    const storyId = `story-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const language = input.language || 'Hindi';
    const isHindi = language.toLowerCase().includes('hi');

    // 1. Create story record
    const storyRecord = await createStory({
      id: randomUUID(),
      storyId,
      title: input.title || 'Untitled Story',
      topic: input.topic || input.title || 'Educational Story',
      ageGroup: input.audience || '4-7 years',
      audience: input.audience || '4-7 years',
      targetDuration: input.targetDurationSeconds || 60,
      visualStyle: input.visualStyle || 'Storybook',
      genre: input.genre || 'Adventure',
      logline: input.logline,
      lesson: input.lesson,
    });

    // 2. Resolve characters
    const declaredCharacters = input.characters || [];
    for (const char of declaredCharacters) {
      if (!char.name) continue;
      const cleanName = cleanSpeakerName(char.name);
      if (isReservedMetadataKey(cleanName)) continue;
      let charRec = await getCharacterByName(cleanName);
      let charId = charRec?.id;
      if (!charRec) {
        const isEarth = cleanName.toLowerCase() === 'earth' || cleanName.toLowerCase().includes('earth');
        const app = isEarth
          ? {
              ...CHARACTER_PRESETS.earth.appearance,
              voiceConfig: {
                voiceId: isHindi ? 'hf_alpha' : 'bm_daniel',
                speed: 1.0,
                style: 'cheerful',
                effect: 'normal',
              },
            }
          : {
              ...DEFAULT_APPEARANCE,
              species: char.species || 'human',
              voiceConfig: {
                voiceId: isHindi ? 'hf_beta' : 'af_heart',
                speed: 1.0,
                style: 'cheerful',
                effect: 'normal',
              },
            };

        const created = await createCharacter({
          id: randomUUID(),
          name: isEarth ? 'Earth' : cleanName,
          species: char.species || (isEarth ? 'earth' : 'human'),
          personality: isEarth ? 'Smiling, wise living planet' : 'Friendly and curious',
          visualDescription: char.description || `${cleanName} the story character`,
          distinctiveFeatures: isEarth ? 'Planet Earth continents' : 'Storybook character',
          canonicalAppearance: app,
        });
        charId = created.id;
      }
      if (charId) {
        await (prisma as any).storyCharacter.create({
          data: {
            id: randomUUID(),
            storyId,
            characterId: charId,
          },
        }).catch(() => {});
      }
    }

    // 3. Persist scenes via importDraftScenesToStory
    const scenes = await this.importDraftScenesToStory({
      storyId,
      scenes: input.scenes,
      importMode: 'replace',
      updateStoryMetadata: true,
      title: input.title,
      targetDurationSeconds: input.targetDurationSeconds,
      language,
    });

    return { storyId, story: storyRecord, scenes };
  }
}

export const RESERVED_METADATA_KEYS = new Set([
  'duration',
  'scene duration',
  'length',
  'time',
  'estimated duration',
  'visual',
  'visual prompt',
  'visual description',
  'background',
  'background prompt',
  'background description',
  'image',
  'image prompt',
  'setting',
  'location',
  'narration',
  'narration script',
  'narration text',
  'narrator',
  'voiceover',
  'vo',
  'v.o.',
  'effects',
  'effect',
  'overlays',
  'overlay',
  'suggested overlays',
  'atmosphere',
  'visual effects',
  'action',
  'pose',
  'character action',
  'expression',
  'facial expression',
  'earth facial expression',
  'speaking emotion',
  'emotion',
  'earth speaking emotion',
  'speaking style',
  'tone',
  'caption',
  'opening caption',
  'closing caption',
  'closing dialogue',
  'opening dialogue',
  'title overlay',
  'subtitles',
  'camera',
  'camera direction',
  'transition',
  'shot',
  'scene',
  'title',
  'summary',
  'logline',
  'lesson',
  'अवधि',
  'समय',
  'दृश्य',
  'पृष्ठभूमि',
  'सूत्रधार',
  'कथावाचक',
  'वॉइसओवर',
  'प्रभाव',
  'मौसम प्रभाव',
  'क्रिया',
  'अभिनय',
  'चेहरे के भाव',
  'भाव-भंगिमा',
  'बोलने का भाव',
  'ध्वनि का भाव',
  'भाव',
  'कैप्शन',
  'शीर्षक',
]);

export function isReservedMetadataKey(str: string): boolean {
  if (!str) return false;
  const lower = str.trim().toLowerCase();
  return RESERVED_METADATA_KEYS.has(lower);
}

export function cleanSpeakerName(rawSpeaker: string): string {
  if (!rawSpeaker) return 'Earth';
  let cleaned = rawSpeaker
    .replace(/^[*_#\s]+|[*_#:\s]+$/g, '')
    .trim();

  // If passed "Earth dialogue — surprised" or "Earth: ...", take the first part before em-dash or dash with spaces
  if (cleaned.includes('—') || cleaned.includes('–')) {
    const parts = cleaned.split(/[—–]/);
    if (parts[0] && parts[0].trim().length > 1) {
      cleaned = parts[0].trim();
    }
  } else if (cleaned.includes(' - ')) {
    const parts = cleaned.split(' - ');
    if (parts[0] && parts[0].trim().length > 1) {
      cleaned = parts[0].trim();
    }
  }

  // Strip dialogue/speech/character suffixes
  cleaned = cleaned.replace(/\s+(?:dialogue|speech|speaking|line|lines|character|संवाद|बोली)$/i, '').trim();

  const lower = cleaned.toLowerCase();
  if (lower === 'earth' || lower === 'terra' || cleaned.includes('धरती') || cleaned.includes('पृथ्वी')) {
    return 'Earth';
  }
  if (lower === 'narrator' || cleaned.includes('सूत्रधार') || cleaned.includes('कथावाचक')) {
    return 'Narrator';
  }
  if (lower === 'pip' || lower.includes('bear')) {
    return 'Pip';
  }
  if (lower === 'maya' || lower.includes('girl')) {
    return 'Maya';
  }
  if (lower === 'sparky' || lower.includes('robot')) {
    return 'Sparky';
  }
  if (lower === 'milo') {
    return 'Milo';
  }
  if (lower === 'sammy') {
    return 'Sammy';
  }
  return cleaned;
}

export function normalizeOverlayType(rawTag: string): EducationalOverlayType | null {
  const clean = rawTag.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (clean.includes('sun') || clean.includes('ray') || clean.includes('beam') || clean.includes('धूप') || clean.includes('किरण')) {
    return 'sunshine_rays';
  }
  if (clean.includes('shimmer') || clean.includes('heat') || clean.includes('गर्मी')) {
    return 'heat_shimmer';
  }
  if (clean.includes('rain') || clean.includes('shower') || clean.includes('barish') || clean.includes('बारिश')) {
    return 'rain';
  }
  if (clean.includes('cloud') || clean.includes('बादल')) {
    return 'moving_clouds';
  }
  if (clean.includes('splash') || clean.includes('water') || clean.includes('पानी')) {
    return 'water_splashes';
  }
  if (clean.includes('snow') || clean.includes('ice') || clean.includes('बर्फ')) {
    return 'snowfall';
  }
  if (clean.includes('fog') || clean.includes('mist') || clean.includes('haze') || clean.includes('कोहरा')) {
    return 'fog_mist';
  }
  if (clean.includes('leaf') || clean.includes('leaves') || clean.includes('autumn') || clean.includes('पतझड़') || clean.includes('पत्ते')) {
    return 'falling_leaves';
  }
  if (clean.includes('bird') || clean.includes('पक्षी') || clean.includes('चिड़िया')) {
    return 'flying_birds';
  }
  if (clean.includes('butterfly') || clean.includes('butterflies') || clean.includes('तितली') || clean.includes('तितलियां')) {
    return 'butterflies';
  }
  if (clean.includes('highlight') || clean.includes('ring') || clean.includes('glow')) {
    return 'highlight_ring';
  }
  return null;
}

export function normalizeCharacterAction(rawAction: string): { action: 'idle' | 'walk' | 'wave' | 'jump' | 'point'; description: string } {
  const lower = rawAction.toLowerCase();
  let act: 'idle' | 'walk' | 'wave' | 'jump' | 'point' = 'idle';
  if (lower.includes('point') || lower.includes('gesture') || lower.includes('indicate') || lower.includes('इशारा') || lower.includes('gestures')) {
    act = 'point';
  } else if (lower.includes('wave') || lower.includes('greet') || lower.includes('हाथ हिला') || lower.includes('warning')) {
    act = 'wave';
  } else if (lower.includes('walk') || lower.includes('move') || lower.includes('float') || lower.includes('चल')) {
    act = 'walk';
  } else if (lower.includes('jump') || lower.includes('dance') || lower.includes('bounce') || lower.includes('कूद')) {
    act = 'jump';
  }
  return { action: act, description: rawAction.trim() };
}

export function matchSceneHeader(rawLine: string, inPreamble: boolean): { sceneNum: number; headerTitle: string; durationHint?: number } | null {
  const line = rawLine.trim();
  // 1. Matches: "## Scene 1: ...", "Scene 1: ...", "SCENE 1 - ...", "दृश्य 1: ..."
  let m = line.match(/^(?:#{1,4}\s*|\*{1,2}\s*)?(?:Scene|दृश्य)\s*(\d+)(?:[\s:.—)\-]+(.*)|$)/i);
  // 2. Matches: "## 1. ...", "### 1: ..."
  if (!m) {
    m = line.match(/^(?:#{1,4}\s+)(\d+)[\s:.—)\-]+(.*?)(?:\*{1,2})?$/i);
  }
  // 3. Matches: "1. गर्मी का कमाल!" (if not in preamble or contains exclamation/dash/parens)
  if (!m && !inPreamble) {
    m = line.match(/^(\d+)[\s:.—)\-]+(.*?)(?:\*{1,2})?$/i);
  }
  // 4. In preamble, if line is "1. गर्मी का कमाल!" or "**1. गर्मी का कमाल!**"
  if (!m && inPreamble) {
    const listMatch = line.match(/^(?:\*{1,2})?(\d+)\.\s+([\u0900-\u097F\w\s!?,.—\-]+?)(?:\*{1,2})?$/);
    if (listMatch) {
      const candidateTitle = listMatch[2].trim();
      // Ensure it's not a character or bullet like "1. Earth: ..."
      if (!candidateTitle.includes(':') && candidateTitle.length > 2) {
        m = listMatch;
      }
    }
  }

  if (!m) return null;

  const num = parseInt(m[1], 10);
  let sceneTitle = m[2]?.replace(/^\*{1,2}|\*{1,2}$/g, '').trim() || `Scene ${num}`;
  let durationHint: number | undefined;

  const durHeaderMatch = sceneTitle.match(/\((?:Duration:\s*)?(\d+)\s*(?:s|sec|seconds|सेकंड)?\)/i);
  if (durHeaderMatch) {
    durationHint = parseInt(durHeaderMatch[1], 10);
    sceneTitle = sceneTitle.replace(durHeaderMatch[0], '').trim();
  }

  return { sceneNum: num, headerTitle: sceneTitle || `Scene ${num}`, durationHint };
}

export function mapEmotionToDirectionAndExpression(emotion: string): {
  speakingDirection: SpeakingDirection;
  facialExpression: FacialExpression;
} {
  const emotionLower = (emotion || 'cheerful').toLowerCase();
  let speakingDirection: SpeakingDirection = 'cheerful';
  let facialExpression: FacialExpression = 'happy';

  if (emotionLower.includes('sad') || emotionLower.includes('gloomy') || emotionLower.includes('उदास')) {
    speakingDirection = 'sad';
    facialExpression = 'sad';
  } else if (
    emotionLower.includes('scare') ||
    emotionLower.includes('fear') ||
    emotionLower.includes('worr') ||
    emotionLower.includes('concern') ||
    emotionLower.includes('चिंतित') ||
    emotionLower.includes('डर')
  ) {
    speakingDirection = 'worried';
    facialExpression = 'scared';
  } else if (
    emotionLower.includes('surpris') ||
    emotionLower.includes('amaz') ||
    emotionLower.includes('wonder') ||
    emotionLower.includes('हैरान') ||
    emotionLower.includes('अचंभित')
  ) {
    speakingDirection = 'excited';
    facialExpression = 'surprised';
  } else if (
    emotionLower.includes('excit') ||
    emotionLower.includes('playful') ||
    emotionLower.includes('enthusiast') ||
    emotionLower.includes('उत्साहित') ||
    emotionLower.includes('चुलबुली')
  ) {
    speakingDirection = 'excited';
    facialExpression = 'happy';
  } else if (
    emotionLower.includes('curio') ||
    emotionLower.includes('thoughtful') ||
    emotionLower.includes('जिज्ञासु')
  ) {
    speakingDirection = 'curious';
    facialExpression = 'curious';
  } else if (
    emotionLower.includes('calm') ||
    emotionLower.includes('gentle') ||
    emotionLower.includes('peace') ||
    emotionLower.includes('शांत')
  ) {
    speakingDirection = 'calm';
    facialExpression = 'neutral';
  } else if (
    emotionLower.includes('angr') ||
    emotionLower.includes('serious') ||
    emotionLower.includes('गुस्सा')
  ) {
    speakingDirection = 'serious';
    facialExpression = 'angry';
  } else if (
    emotionLower.includes('sleep') ||
    emotionLower.includes('tired')
  ) {
    speakingDirection = 'calm';
    facialExpression = 'neutral';
  }

  return { speakingDirection, facialExpression };
}

export function resolveDefaultVoiceForCharacter(
  characterName: string,
  isHindi: boolean
): string {
  const lower = characterName.toLowerCase();
  if (isHindi) {
    if (lower.includes('earth') || lower.includes('terra') || characterName.includes('धरती') || characterName.includes('पृथ्वी')) {
      return 'hf_alpha';
    }
    if (lower.includes('maya') || lower.includes('girl') || lower.includes('aurat') || lower.includes('woman') || lower.includes('female')) {
      return 'hf_alpha';
    }
    return 'hf_beta';
  } else {
    if (lower.includes('earth') || lower.includes('terra')) {
      return 'bm_daniel';
    }
    if (lower.includes('bear') || lower.includes('pip')) {
      return 'bm_george';
    }
    if (lower.includes('robot')) {
      return 'bm_lewis';
    }
    if (lower.includes('girl') || lower.includes('maya')) {
      return 'af_bella';
    }
    return 'af_heart';
  }
}

export function getOverlayLabel(type: string): string {
  switch (type) {
    case 'sunshine_rays':
      return 'Sunshine Rays';
    case 'heat_shimmer':
      return 'Heat Shimmer';
    case 'rain':
      return 'Rain';
    case 'moving_clouds':
      return 'Moving Clouds';
    case 'water_splashes':
      return 'Water Splashes';
    case 'snowfall':
      return 'Snowfall';
    case 'fog_mist':
      return 'Fog & Mist';
    case 'falling_leaves':
      return 'Falling Autumn Leaves';
    case 'flying_birds':
      return 'Flying Birds';
    case 'butterflies':
      return 'Butterflies';
    case 'highlight_ring':
      return 'Highlight Glow';
    default:
      return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
