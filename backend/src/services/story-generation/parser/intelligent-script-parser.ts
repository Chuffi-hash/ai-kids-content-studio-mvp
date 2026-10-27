/**
 * Intelligent Script Parser: Master Production Script & Storyboard Breakdown Engine.
 *
 * Attribution:
 * - Screenplay parsing patterns adapted under MIT License from screenplay-tools
 *   (Copyright (c) 2024 Ian Thomas) and screenplay-fountain (Animora Labs).
 * - Production breakdown and Project Look DNA adapted under Apache 2.0 License from
 *   ScriptBreak (Copyright (c) 2024 Sam Wasserman / Wasserman Productions).
 * - Multi-format support: Fountain, Markdown, Plain Text, Production Instructions,
 *   Devanagari Hindi preservation, and 2D animated rig character coordination.
 */

import {
  StoryboardIntermediateRepresentation,
  ParsedScene,
  ParsedDialogueLine,
  ScriptWarning,
  SourceRange,
  ProjectLookDNA,
  ProjectBibles,
} from './types.js';
import { FountainParser } from './fountain-parser.js';
import { ProductionBreakdownExtractor } from './production-breakdown.js';
import { PromptSynthesizer, DEFAULT_PROJECT_LOOK } from './prompt-synthesizer.js';

export interface ParseScriptOptions {
  language?: string;
  defaultTitle?: string;
  targetDuration?: number;
  visualStyle?: string;
  genre?: string;
  look?: Partial<ProjectLookDNA>;
}

export class IntelligentScriptParser {
  /**
   * Parses arbitrary scripts (Fountain, Markdown, Plain Text) into a validated
   * Storyboard Intermediate Representation.
   */
  public static parse(rawText: string, options: ParseScriptOptions = {}): StoryboardIntermediateRepresentation {
    const text = (rawText || '').trim();
    const warnings: ScriptWarning[] = [];

    const fountainParser = new FountainParser();
    const { nodes, titlePage } = fountainParser.parse(text);

    // 1. Extract Global Metadata (Title, Target Duration, Language, Logline, Lesson)
    let title = options.defaultTitle || titlePage['title'] || '';
    let language = options.language || titlePage['language'] || 'Hindi';
    let targetDurationSeconds = options.targetDuration || parseInt(titlePage['target duration'] || titlePage['duration'] || '60', 10);
    let logline = titlePage['logline'] || titlePage['synopsis'] || '';
    let lesson = titlePage['lesson'] || titlePage['moral'] || '';
    let genre = options.genre || titlePage['genre'] || 'Educational';

    // Check first heading if title not found in titlePage
    if (!title) {
      const firstHeading = nodes.find((n) => n.raw.startsWith('# ') || n.raw.startsWith('Title:'));
      if (firstHeading) {
        title = firstHeading.raw.replace(/^#+\s*(?:Title:\s*)?/, '').replace(/^Title:\s*/i, '').trim();
      }
    }
    if (!title) {
      title = 'Untitled Story';
    }

    // 2. Identify Character Declarations if present in script
    const declaredCharacters: Array<{ name: string; description?: string; role?: string; voice?: string }> = [];
    const lines = text.split(/\r?\n/);
    let inCharBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.match(/^##?\s*Characters/i)) {
        inCharBlock = true;
        continue;
      }
      if (inCharBlock) {
        if (line.startsWith('#') || line.match(/^Scene\s+\d+/i)) {
          inCharBlock = false;
        } else if (line.startsWith('-') || line.startsWith('*')) {
          const charLine = line.replace(/^[-*]\s*/, '');
          const match = charLine.match(/^([A-Za-z0-9\u0900-\u097F\s\-_]+?)(?:\s*\((.*?)\))?:\s*(.*)$/);
          if (match) {
            const charName = match[1].trim();
            const role = match[2] ? match[2].trim() : 'protagonist';
            const desc = match[3].trim();
            declaredCharacters.push({ name: charName, role, description: desc });
          }
        }
      }
    }

    // 3. Segment Nodes into Scenes
    interface RawSceneGroup {
      headingText: string;
      sceneNumber?: number;
      durationHint?: number;
      nodes: typeof nodes;
      startLine: number;
    }

    const sceneGroups: RawSceneGroup[] = [];
    let currentGroup: RawSceneGroup | null = null;

    for (const node of nodes) {
      if (node.type === 'scene_heading') {
        const headingNode = node as any;
        if (currentGroup) {
          sceneGroups.push(currentGroup);
        }
        currentGroup = {
          headingText: headingNode.location || headingNode.text,
          sceneNumber: headingNode.sceneNumber,
          durationHint: headingNode.durationHintSeconds,
          nodes: [],
          startLine: node.range.start.line,
        };
      } else {
        if (!currentGroup) {
          // Content before first scene heading (e.g. metadata or preamble)
          continue;
        }
        currentGroup.nodes.push(node);
      }
    }
    if (currentGroup) {
      sceneGroups.push(currentGroup);
    }

    // Fallback: If no scene headings were detected, treat the entire document as Scene 1
    if (sceneGroups.length === 0) {
      sceneGroups.push({
        headingText: title || 'Scene 1',
        sceneNumber: 1,
        nodes: nodes.filter((n) => n.type !== 'title_entry'),
        startLine: 1,
      });
      warnings.push({
        code: 'NO_SCENE_HEADINGS',
        message: 'No scene headings (e.g. "Scene 1: ...", "INT. / EXT.") were found. Grouped all content into Scene 1.',
        line: 1,
        severity: 'info',
      });
    }

    // 4. Build Structured Parsed Scenes
    const parsedScenes: ParsedScene[] = [];
    const allDetectedCharacters = new Set<string>();

    sceneGroups.forEach((group, index) => {
      const sceneNumber = group.sceneNumber || index + 1;
      let titleClean = group.headingText
        .replace(/^Scene\s+\d+[:\s—–-]*/i, '')
        .replace(/^दृश्य\s+\d+[:\s—–-]*/i, '')
        .trim();
      if (!titleClean) titleClean = `Scene ${sceneNumber}`;

      let sceneDuration = group.durationHint || 15;
      let durationConfidence: 'explicit' | 'estimated' = group.durationHint ? 'explicit' : 'estimated';
      let visualPrompt = '';
      let narration = '';
      const dialogueLines: ParsedDialogueLine[] = [];
      const characterActions: Array<{ characterName: string; action: string; description?: string }> = [];
      const explicitEffects: string[] = [];

      // Process nodes in this scene
      for (const node of group.nodes) {
        if (node.type === 'production_instruction') {
          const pi = node as any;
          if (pi.key === 'background_prompt') {
            visualPrompt = pi.value;
          } else if (pi.key === 'narration') {
            narration = narration ? `${narration} ${pi.value}` : pi.value;
          } else if (pi.key === 'duration') {
            const durMatch = pi.value.match(/(\d+)/);
            if (durMatch) {
              sceneDuration = parseInt(durMatch[1], 10);
              durationConfidence = 'explicit';
            }
          } else if (pi.key === 'effects') {
            const tokens = pi.value.split(/[,;]+/).map((s: string) => s.trim()).filter(Boolean);
            explicitEffects.push(...tokens);
          } else if (pi.key === 'character_action') {
            const cleanAction = pi.value.toLowerCase();
            let actionType = 'idle';
            if (cleanAction.includes('walk') || cleanAction.includes('move')) actionType = 'walk';
            else if (cleanAction.includes('wave') || cleanAction.includes('gesture')) actionType = 'wave';
            else if (cleanAction.includes('jump')) actionType = 'jump';
            else if (cleanAction.includes('point')) actionType = 'point';
            else if (cleanAction.includes('shiver')) actionType = 'shiver';

            characterActions.push({
              characterName: 'Earth',
              action: actionType,
              description: pi.value,
            });
          } else if (pi.key === 'dialogue_inline') {
            const meta = pi.metadata || {};
            const speaker = meta.speaker || 'Earth';
            allDetectedCharacters.add(speaker);
            dialogueLines.push({
              characterName: speaker,
              text: meta.speech || pi.value,
              emotion: meta.emotion,
              voice: IntelligentScriptParser.resolveDefaultVoice(speaker, language),
              sourceRange: node.range,
            });
          }
        } else if (node.type === 'dialogue') {
          const dNode = node as any;
          const speaker = dNode.characterName || 'Earth';
          allDetectedCharacters.add(speaker);
          dialogueLines.push({
            characterName: speaker,
            text: dNode.speech,
            emotion: dNode.emotion,
            voice: IntelligentScriptParser.resolveDefaultVoice(speaker, language),
            sourceRange: node.range,
          });
        } else if (node.type === 'action') {
          // If no narration yet, and this looks like a narration line
          if (!narration && !node.raw.startsWith('Effects:') && !node.raw.startsWith('Visual:')) {
            narration = node.text;
          }
        }
      }

      // If duration was not explicitly specified, calculate based on narration + dialogue word count
      if (durationConfidence === 'estimated') {
        const totalWords = (narration + ' ' + dialogueLines.map((d) => d.text).join(' ')).trim().split(/\s+/).length;
        sceneDuration = Math.max(12, Math.min(60, Math.ceil(totalWords / 2.5) + 4));
      }

      // 5. Run Production Breakdown Extractor (ScriptBreak-style)
      const breakdown = ProductionBreakdownExtractor.extractSceneBreakdown({
        title: titleClean,
        visualPrompt,
        narration,
        dialogueTexts: dialogueLines.map((d) => d.text),
        actionTexts: characterActions.map((a) => a.description || a.action),
        explicitEffects,
        characterNames: Array.from(allDetectedCharacters),
      });

      const suggestedOverlays = ProductionBreakdownExtractor.mapVfxToStudioOverlays(breakdown.vfx);

      // 6. Synthesize background prompt with Look DNA
      const finalPrompt = PromptSynthesizer.synthesizeBackgroundPrompt({
        explicitPrompt: visualPrompt,
        sceneTitle: titleClean,
        timeOfDay: breakdown.lighting.timeOfDay,
        look: options.look,
      });

      parsedScenes.push({
        sceneNumber,
        title: titleClean,
        location: titleClean,
        timeOfDay: breakdown.lighting.timeOfDay,
        durationSeconds: sceneDuration,
        durationConfidence,
        visualPrompt: finalPrompt,
        narration,
        dialogue: dialogueLines,
        characterActions: characterActions.length > 0 ? characterActions : [{ characterName: 'Earth', action: 'wave' }],
        breakdown,
        suggestedOverlays,
        shots: breakdown.shots.map((s) => ({ num: s.num, size: s.size, move: s.move, desc: s.desc || '' })),
        sourceRange: group.nodes.length > 0 ? { start: group.nodes[0].range.start, end: group.nodes[group.nodes.length - 1].range.end } : undefined,
      });
    });

    // Merge declared characters and detected characters
    for (const charName of allDetectedCharacters) {
      if (!declaredCharacters.some((c) => c.name.toLowerCase() === charName.toLowerCase())) {
        declaredCharacters.push({
          name: charName,
          role: 'protagonist',
          description: `Character ${charName}`,
          voice: IntelligentScriptParser.resolveDefaultVoice(charName, language),
        });
      }
    }

    const bibles = PromptSynthesizer.buildInitialBibles({
      characters: declaredCharacters,
      locations: parsedScenes.map((s) => ({ name: s.title, desc: s.visualPrompt })),
    });

    const calculatedTotalDuration = parsedScenes.reduce((acc, s) => acc + s.durationSeconds, 0);

    return {
      title,
      targetDurationSeconds: targetDurationSeconds || calculatedTotalDuration,
      language,
      logline,
      lesson,
      genre,
      look: { ...DEFAULT_PROJECT_LOOK, ...(options.look || {}) },
      bibles,
      scenes: parsedScenes,
      warnings,
      originalText: text,
    };
  }

  /**
   * Resolves the default Kokoro-82M TTS voice for any character according to language.
   * Earth strictly receives female Hindi voice 'hf_alpha' when language is Hindi.
   */
  public static resolveDefaultVoice(characterName: string, language: string = 'Hindi'): string {
    const clean = (characterName || '').trim().toLowerCase();
    const isHindi = language.toLowerCase().includes('hi');

    if (clean.includes('earth') || clean.includes('पृथ्वी') || clean.includes('terra')) {
      return isHindi ? 'hf_alpha' : 'af_heart';
    }
    if (clean.includes('pip') || clean.includes('bear')) {
      return isHindi ? 'hm_omega' : 'bm_george';
    }
    if (clean.includes('sammy') || clean.includes('squirrel')) {
      return isHindi ? 'hm_psi' : 'bm_daniel';
    }
    if (clean.includes('maya') || clean.includes('bird')) {
      return isHindi ? 'hf_beta' : 'af_sky';
    }
    return isHindi ? 'hf_alpha' : 'af_heart';
  }

  /**
   * Serializes a Storyboard Intermediate Representation to Fountain screenplay format.
   */
  public static serializeToFountain(ir: StoryboardIntermediateRepresentation): string {
    const lines: string[] = [];
    lines.push(`Title: ${ir.title}`);
    lines.push(`Language: ${ir.language}`);
    lines.push(`Target Duration: ${ir.targetDurationSeconds}s`);
    if (ir.logline) lines.push(`Logline: ${ir.logline}`);
    if (ir.lesson) lines.push(`Lesson: ${ir.lesson}`);
    lines.push('');

    for (const scene of ir.scenes) {
      lines.push(`.SCENE ${scene.sceneNumber}: ${scene.title.toUpperCase()} (${scene.durationSeconds}s)`);
      if (scene.visualPrompt) lines.push(`[[ Background: ${scene.visualPrompt} ]]`);
      if (scene.narration) lines.push(`NARRATOR\n${scene.narration}`);

      for (const d of scene.dialogue) {
        lines.push('');
        lines.push(d.characterName.toUpperCase());
        if (d.emotion) lines.push(`(${d.emotion})`);
        lines.push(d.text);
      }

      if (scene.suggestedOverlays.length > 0) {
        lines.push('');
        lines.push(`[[ Effects: ${scene.suggestedOverlays.map((o) => o.type).join(', ')} ]]`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Serializes a Storyboard Intermediate Representation to clean production Markdown.
   */
  public static serializeToMarkdown(ir: StoryboardIntermediateRepresentation): string {
    const lines: string[] = [];
    lines.push(`# ${ir.title}`);
    lines.push(`Language: ${ir.language}`);
    lines.push(`Target Duration: ${ir.targetDurationSeconds}s`);
    if (ir.logline) lines.push(`Logline: ${ir.logline}`);
    if (ir.lesson) lines.push(`Lesson: ${ir.lesson}`);
    lines.push('');

    for (const scene of ir.scenes) {
      lines.push(`## Scene ${scene.sceneNumber}: ${scene.title} (${scene.durationSeconds}s)`);
      if (scene.visualPrompt) lines.push(`Visual: ${scene.visualPrompt}`);
      if (scene.narration) lines.push(`Narration: ${scene.narration}`);

      for (const d of scene.dialogue) {
        const emo = d.emotion ? ` (${d.emotion})` : '';
        lines.push(`${d.characterName}${emo}: "${d.text}"`);
      }

      if (scene.suggestedOverlays.length > 0) {
        lines.push(`Effects: ${scene.suggestedOverlays.map((o) => o.type).join(', ')}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
