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
import type { DraftStoryboardResult } from '../story-importer.service.js';
import { randomUUID } from 'crypto';
import { FountainParser } from './fountain-parser.js';
import { ProductionBreakdownExtractor } from './production-breakdown.js';
import { PromptSynthesizer, DEFAULT_PROJECT_LOOK } from './prompt-synthesizer.js';
import {
  resolveEffectiveLanguage,
  resolveCanonicalVoiceForCharacter,
} from '../../audio-generation/language-resolver.service.js';

export const SUPPORTED_ANIMATION_ACTIONS = ['idle', 'walk', 'wave', 'jump', 'point'] as const;
export type SupportedAnimationAction = (typeof SUPPORTED_ANIMATION_ACTIONS)[number];

/**
 * Normalizes an arbitrary character action line into one of the supported 2D vector
 * animation kinematic states ('idle' | 'walk' | 'wave' | 'jump' | 'point').
 * If unmapped, defaults to 'idle', preserves the original action description,
 * and emits an actionable ScriptWarning.
 */
export function normalizeAnimationAction(
  rawAction: string,
  line?: number
): { action: SupportedAnimationAction; warning?: ScriptWarning } {
  const clean = (rawAction || '').toLowerCase().trim();

  // 1. Point / Directional gestures
  if (/\b(point|points|pointing|indicate|indicates|indicating|direct|directs|directing|show|shows|showing|aim|aims|aiming|gesture[s]?\s+toward|gesturing\s+toward|इशारा|दिखा)\b/i.test(clean)) {
    return { action: 'point' };
  }
  // 2. Walk synonyms
  if (/\b(walk|walks|walking|move|moves|moving|run|runs|running|approach|approaches|approaching|march|marches|marching|stroll|strolls|strolling|step|steps|stepping|enter|enters|entering|चलता|चलती|दौड़)\b/i.test(clean)) {
    return { action: 'walk' };
  }
  // 3. Wave synonyms
  if (/\b(wave|waves|waving|greet|greets|greeting|hello|gesture|gestures|gesturing|salute|salutes|saluting|beckon|beckons|beckoning|bye|लहरा|हाथ हिला)\b/i.test(clean)) {
    return { action: 'wave' };
  }
  // 4. Jump synonyms
  if (/\b(jump|jumps|jumping|hop|hops|hopping|bounce|bounces|bouncing|leap|leaps|leaping|skip|skips|skipping|कूद|उछल)\b/i.test(clean)) {
    return { action: 'jump' };
  }
  // 5. Idle / Neutral synonyms
  if (/\b(idle|idles|neutral|wait|waits|waiting|stand|stands|standing|listen|listens|listening|speak|speaks|speaking|talk|talks|talking|sit|sits|sitting|look|looks|looking|observe|observes|observing|rest|rests|resting|smile|smiles|smiling|float|floats|floating|शांत|खड़ा|बैठ|देख)\b/i.test(clean)) {
    return { action: 'idle' };
  }

  // Unsupported action: fallback to 'idle', preserve original in description, emit actionable warning
  const warning: ScriptWarning = {
    code: 'UNSUPPORTED_ACTION',
    message: `Action "${rawAction.trim()}" is not in the supported animation vocabulary (idle, walk, wave, jump, point). Defaulted to "idle".`,
    severity: 'warning',
    line: line || 1,
    suggestion: `Supported animation actions are: idle, walk, wave, jump, point. The original action text is preserved in the description.`,
  };
  return { action: 'idle', warning };
}

/**
 * Estimates scene duration based on language speech cadence, narration vs dialogue,
 * turn-taking pauses, and character action requirements.
 */
export function estimateSceneDuration(options: {
  narration: string;
  dialogueLines: Array<{ text: string }>;
  characterActions: Array<{ action: string }>;
  language: string;
}): number {
  const isHindi = (options.language || '').toLowerCase().includes('hi');
  const wordsPerSec = isHindi ? 1.9 : 2.2;

  const narrationWords = options.narration ? options.narration.trim().split(/\s+/).filter(Boolean).length : 0;
  const dialogueWords = options.dialogueLines.reduce((sum, d) => sum + d.text.trim().split(/\s+/).filter(Boolean).length, 0);

  const speechSecs = Math.ceil(narrationWords / wordsPerSec) + Math.ceil(dialogueWords / wordsPerSec);
  const dialoguePauseSecs = options.dialogueLines.length * 1.5;
  const actionBufferSecs = options.characterActions.length * 2.5;

  const calculated = Math.ceil(Math.max(speechSecs + dialoguePauseSecs, actionBufferSecs) + 3);
  return Math.max(12, Math.min(90, calculated));
}

export interface ParseScriptOptions {
  language?: string;
  defaultTitle?: string;
  targetDuration?: number;
  visualStyle?: string;
  genre?: string;
  look?: Partial<ProjectLookDNA>;
  existingCharacters?: Array<{ id: string; name: string; species?: string }>;
}

export class IntelligentScriptParser {
  /**
   * Alias for parse()
   */
  public static parseScript = IntelligentScriptParser.parse;

  /**
   * Parses arbitrary scripts (Fountain, Markdown, Plain Text) into a validated
   * Storyboard Intermediate Representation.
   */
  public static parse(rawText: string, options: ParseScriptOptions = {}): StoryboardIntermediateRepresentation {
    const text = (rawText || '').trim();
    const warnings: ScriptWarning[] = [];

    const fountainParser = new FountainParser();
    const { nodes, titlePage, warnings: astWarnings } = fountainParser.parse(text);
    if (Array.isArray(astWarnings)) {
      warnings.push(...astWarnings);
    }

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
    const declaredCharacters: Array<{ id?: string; name: string; description?: string; role?: string; voice?: string; species?: string }> = [];
    const lines = text.split(/\r?\n/);
    let inCharBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.match(/^##?\s*Characters/i)) {
        inCharBlock = true;
        continue;
      }
      if (inCharBlock) {
        if (line.startsWith('#') || line.match(/^Scene\s+\d+/i) || line.match(/^दृश्य\s+\d+/i)) {
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

    // Check for scene numbering gaps
    let prevSceneNum = 0;
    for (const g of sceneGroups) {
      if (g.sceneNumber !== undefined) {
        if (prevSceneNum > 0 && g.sceneNumber > prevSceneNum + 1) {
          warnings.push({
            code: 'SCENE_NUMBERING_GAP',
            message: `Scene numbering gap detected: jumped from Scene ${prevSceneNum} to Scene ${g.sceneNumber}.`,
            line: g.startLine,
            severity: 'warning',
            suggestion: 'Verify script scenes to ensure no scene was accidentally omitted.',
          });
        }
        prevSceneNum = g.sceneNumber;
      }
    }

    // 4. Build Structured Parsed Scenes
    const parsedScenes: ParsedScene[] = [];
    const allDetectedCharacters = new Set<string>();

    sceneGroups.forEach((group, index) => {
      const sceneNumber = group.sceneNumber || index + 1;
      let titleClean = group.headingText
        .replace(/^Scene\s*(?:\d+|[०-९]+)[:\s—–-]*/i, '')
        .replace(/^दृश्य\s*(?:\d+|[०-९]+)[:\s—–-]*/i, '')
        .trim();
      if (!titleClean) titleClean = `Scene ${sceneNumber}`;

      const canonicalLocName = PromptSynthesizer.normalizeLocationName(group.headingText) || titleClean;
      const locSlug = canonicalLocName.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30);
      const locationId = `loc_${locSlug}`;

      let sceneDuration = group.durationHint || 15;
      let durationConfidence: 'explicit' | 'estimated' = group.durationHint ? 'explicit' : 'estimated';
      let visualPrompt = '';
      let narration = '';
      const dialogueLines: ParsedDialogueLine[] = [];
      const characterActions: Array<{ characterName: string; action: string; description?: string }> = [];
      const explicitEffects: string[] = [];

      let pendingEmotion: string | undefined;
      let pendingExpression: string | undefined;

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
            let actor = (pi.actor || pi.metadata?.characterName || pi.metadata?.actor || '').trim();
            let actionText = pi.value.trim();

            // If actor was not parsed in label, check if value starts with a known character name:
            // e.g. "Krishna plays the flute", "Radha dances gracefully"
            if (!actor) {
              const knownNames = [
                ...declaredCharacters.map((c) => c.name),
                ...Array.from(allDetectedCharacters),
              ];
              for (const kn of knownNames) {
                const prefixRegex = new RegExp(`^${kn}\\s+(.*)$`, 'i');
                const m = actionText.match(prefixRegex);
                if (m) {
                  actor = kn;
                  actionText = m[1].trim();
                  break;
                }
              }
            }

            // If still no actor, check if dialogue lines exist in this scene
            if (!actor && dialogueLines.length > 0) {
              actor = dialogueLines[dialogueLines.length - 1].characterName;
            } else if (!actor && declaredCharacters.length > 0) {
              actor = declaredCharacters[0].name;
            }

            if (actor) {
              allDetectedCharacters.add(actor);
            }

            // Normalize action to animation engine vocabulary
            const norm = normalizeAnimationAction(actionText, node.range.start.line);
            if (norm.warning) {
              warnings.push(norm.warning);
            }

            characterActions.push({
              characterName: actor,
              action: norm.action,
              description: pi.value,
            });
          } else if (pi.key === 'speaking_emotion') {
            const emo = pi.value.trim();
            if (dialogueLines.length > 0) {
              dialogueLines[dialogueLines.length - 1].emotion = emo;
            } else {
              pendingEmotion = emo;
            }
          } else if (pi.key === 'facial_expression') {
            const expr = pi.value.trim();
            if (dialogueLines.length > 0) {
              dialogueLines[dialogueLines.length - 1].expression = expr;
            } else {
              pendingExpression = expr;
            }
          } else if (pi.key === 'dialogue_inline') {
            const meta = pi.metadata || {};
            let speaker = (meta.speaker || pi.actor || '').trim();
            if (!speaker) {
              if (dialogueLines.length > 0) {
                speaker = dialogueLines[dialogueLines.length - 1].characterName;
              } else if (declaredCharacters.length > 0) {
                speaker = declaredCharacters[0].name;
                warnings.push({
                  code: 'UNRESOLVED_SPEAKER',
                  message: `Dialogue line has no character name specified. Attributed to "${speaker}".`,
                  line: node.range.start.line,
                  severity: 'warning',
                });
              } else {
                speaker = 'Narrator';
              }
            }
            allDetectedCharacters.add(speaker);

            const emo = meta.emotion || pendingEmotion || 'cheerful';
            const expr = pendingExpression;
            pendingEmotion = undefined;
            pendingExpression = undefined;

            dialogueLines.push({
              id: randomUUID(),
              characterName: speaker,
              text: meta.speech || pi.value,
              emotion: emo,
              expression: expr,
              voice: IntelligentScriptParser.resolveDefaultVoice(speaker, language),
              sourceRange: node.range,
            });
          }
        } else if (node.type === 'dialogue') {
          const dNode = node as any;
          let speaker = (dNode.characterName || '').trim();
          if (!speaker) {
            if (dialogueLines.length > 0) {
              speaker = dialogueLines[dialogueLines.length - 1].characterName;
            } else if (declaredCharacters.length > 0) {
              speaker = declaredCharacters[0].name;
              warnings.push({
                code: 'UNRESOLVED_SPEAKER',
                message: `Dialogue line has no character name specified. Attributed to "${speaker}".`,
                line: node.range.start.line,
                severity: 'warning',
              });
            } else {
              speaker = 'Narrator';
            }
          }
          allDetectedCharacters.add(speaker);

          const emo = dNode.emotion || pendingEmotion || 'cheerful';
          const expr = pendingExpression;
          pendingEmotion = undefined;
          pendingExpression = undefined;

          dialogueLines.push({
            id: randomUUID(),
            characterName: speaker,
            text: dNode.speech,
            emotion: emo,
            expression: expr,
            voice: IntelligentScriptParser.resolveDefaultVoice(speaker, language),
            sourceRange: node.range,
          });
        } else if (node.type === 'action') {
          // If no narration yet, and this looks like a narration line
          if (!narration && !node.raw.startsWith('Effects:') && !node.raw.startsWith('Visual:') && !node.raw.startsWith('Action:') && !node.raw.startsWith('Character Action:')) {
            narration = node.text;
          }
        }
      }

      // If duration was not explicitly specified, calculate based on speech and action pacing
      if (durationConfidence === 'estimated') {
        sceneDuration = estimateSceneDuration({
          narration,
          dialogueLines,
          characterActions,
          language,
        });
        warnings.push({
          code: 'DURATION_ESTIMATED',
          message: `Scene ${sceneNumber} duration was not specified. Estimated at ${sceneDuration}s based on speech and action pacing.`,
          line: group.startLine,
          severity: 'info',
        });
      }

      // Fallback character action if none specified for this scene
      if (characterActions.length === 0) {
        const sceneChars = Array.from(new Set(dialogueLines.map((d) => d.characterName))).filter(Boolean);
        if (sceneChars.length > 0) {
          characterActions.push({
            characterName: sceneChars[0],
            action: 'idle',
            description: 'Default scene idle pose',
          });
        } else if (declaredCharacters.length > 0) {
          characterActions.push({
            characterName: declaredCharacters[0].name,
            action: 'idle',
            description: 'Default scene idle pose',
          });
        }
        // If pure narrator scene with no characters declared, characterActions remains empty []
      }

      // 5. Run Production Breakdown Extractor (ScriptBreak-style)
      const breakdown = ProductionBreakdownExtractor.extractSceneBreakdown({
        title: titleClean,
        locationText: canonicalLocName,
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
        locationName: canonicalLocName,
        timeOfDay: breakdown.lighting.timeOfDay,
        look: options.look,
      });

      parsedScenes.push({
        sceneNumber,
        title: titleClean,
        location: canonicalLocName,
        locationId,
        timeOfDay: breakdown.lighting.timeOfDay,
        durationSeconds: sceneDuration,
        durationConfidence,
        visualPrompt: finalPrompt,
        narration,
        dialogue: dialogueLines,
        characterActions,
        breakdown,
        suggestedOverlays,
        shots: breakdown.shots.map((s) => ({ num: s.num, size: s.size, move: s.move, desc: s.desc || '' })),
        sourceRange: group.nodes.length > 0 ? { start: group.nodes[0].range.start, end: group.nodes[group.nodes.length - 1].range.end } : undefined,
      });
    });

    // Merge declared characters and detected characters
    for (const charName of allDetectedCharacters) {
      if (charName.toLowerCase() === 'narrator' || charName === 'सूत्रधार' || charName === 'कथावाचक') {
        continue;
      }
      const existing = options.existingCharacters?.find((c) => c.name.toLowerCase() === charName.toLowerCase());
      if (!declaredCharacters.some((c) => c.name.toLowerCase() === charName.toLowerCase())) {
        declaredCharacters.push({
          id: existing?.id,
          name: charName,
          species: existing?.species,
          role: 'protagonist',
          description: `Character ${charName}`,
          voice: IntelligentScriptParser.resolveDefaultVoice(charName, language),
        });
      } else {
        const declared = declaredCharacters.find((c) => c.name.toLowerCase() === charName.toLowerCase());
        if (declared && existing) {
          declared.id = existing.id;
          declared.species = existing.species;
        }
      }
    }

    const bibles = PromptSynthesizer.buildInitialBibles({
      characters: declaredCharacters,
      locations: parsedScenes.map((s) => ({ name: s.location, id: s.locationId, desc: s.visualPrompt })),
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
      characters: declaredCharacters,
      scenes: parsedScenes,
      warnings,
      originalText: text,
    };
  }

  /**
   * Adapts a validated StoryboardIntermediateRepresentation to a backward-compatible DraftStoryboardResult.
   */
  public static adaptIRToDraftStoryboardResult(ir: StoryboardIntermediateRepresentation): DraftStoryboardResult {
    return {
      title: ir.title,
      targetDurationSeconds: ir.targetDurationSeconds,
      language: ir.language,
      logline: ir.logline,
      lesson: ir.lesson,
      characters: ir.characters.map((c: any) => ({
        id: c.id,
        name: c.name,
        species: c.species,
        role: c.role,
        voice: c.voice,
        description: c.description,
      })),
      scenes: ir.scenes.map((s) => ({
        sceneNumber: s.sceneNumber,
        title: s.title,
        durationSeconds: s.durationSeconds,
        visualPrompt: s.visualPrompt,
        narration: s.narration,
        dialogue: s.dialogue.map((d) => ({
          id: d.id,
          characterName: d.characterName,
          text: d.text,
          emotion: d.emotion,
          expression: d.expression,
          voice: d.voice,
        })),
        characterActions: s.characterActions,
        suggestedOverlays: s.suggestedOverlays,
        breakdown: s.breakdown,
        shots: s.shots,
      })),
      look: ir.look,
      warnings: ir.warnings,
    };
  }

  /**
   * Resolves the default Kokoro-82M TTS voice for any character according to language.
   * Earth strictly receives female Hindi voice 'hf_alpha' when language is Hindi.
   */
  public static resolveDefaultVoice(characterName: string, language: string = 'Hindi'): string {
    const effLang = resolveEffectiveLanguage({ lang: language });
    return resolveCanonicalVoiceForCharacter(characterName, effLang);
  }

  /**
   * Serializes a Storyboard Intermediate Representation to Fountain screenplay format.
   */
  public static serializeToFountain(ir: StoryboardIntermediateRepresentation | any): string {
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

      if (scene.suggestedOverlays && scene.suggestedOverlays.length > 0) {
        lines.push('');
        lines.push(`[[ Effects: ${scene.suggestedOverlays.map((o: any) => o.type).join(', ')} ]]`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Serializes a Storyboard Intermediate Representation to clean production Markdown.
   */
  public static serializeToMarkdown(ir: StoryboardIntermediateRepresentation | any): string {
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

      if (scene.suggestedOverlays && scene.suggestedOverlays.length > 0) {
        lines.push(`Effects: ${scene.suggestedOverlays.map((o: any) => o.type).join(', ')}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
