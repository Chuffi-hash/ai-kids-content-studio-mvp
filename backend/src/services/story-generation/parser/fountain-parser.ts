/**
 * Fountain and Production Screenplay Parser with Semantic AST & Source Position Tracking.
 *
 * Attribution:
 * - Parsing rules for Fountain scene headings, character cues, dialogue, parentheticals,
 *   and transitions adapted under MIT License from screenplay-tools (Copyright (c) 2024 Ian Thomas).
 * - Semantic AST structure, source-position tracking (line/col/offset), and error-resilient
 *   "never throws" warning architecture inspired by screenplay-fountain (Animora Labs, MIT).
 * - Extended with support for animated production scripts (Background Prompts, Narration,
 *   Speaking Emotions, Facial Expressions, and Multi-language/Devanagari text).
 */

import {
  SourcePosition,
  SourceRange,
  ScriptWarning,
  FountainNode,
  SceneHeadingNode,
  CharacterCueNode,
  ParentheticalNode,
  DialogueNode,
  ProductionInstructionNode,
} from './types.js';

export function parseDevanagariOrLatinNumber(str?: string): number | undefined {
  if (!str) return undefined;
  const devanagariDigits = '०१२३४५६७८९';
  const normalized = str.replace(/[०-९]/g, (d) => devanagariDigits.indexOf(d).toString());
  const num = parseInt(normalized, 10);
  return isNaN(num) ? undefined : num;
}

// Regex Constants (adapted from screenplay-tools with Unicode and Production Script extensions)
const REGEX_SCENE_HEADING_FOUNTAIN = /^\s*(?:(INT|EXT|EST|INT\.\/EXT|INT\/EXT|I\/E)(\.|\s)|(FADE IN:\s*))/i;
const REGEX_FORCED_SCENE_HEADING = /^\.([A-Za-z0-9\u0900-\u097F].*)$/;
const REGEX_MARKDOWN_SCENE_HEADING = /^#{1,4}\s*(?:\*{1,2})?(?:(?:(\d+|[०-९]+)\.\s*)?(?:Scene|दृश्य)\s*(\d+|[०-९]+)?[:\s—–-]*)(.*?)(?:\*{1,2})?$/i;
const REGEX_TEXT_SCENE_HEADING = /^(?:\*{1,2})?(?:(?:(\d+|[०-९]+)\.\s*)?(?:Scene|दृश्य)\s*(\d+|[०-९]+)?[:\s—–-]*)(.*?)(?:\*{1,2})?$/i;
const REGEX_HEADING_NUMBER_HASH = /#([a-zA-Z0-9\-.]+)#\s*$/;
const REGEX_DURATION_IN_HEADING = /\((\d+)\s*(?:s|sec|secs|seconds|सेकंड)\)/i;

const REGEX_TITLE_ENTRY = /^\s*(?:\*{1,2})?([A-Za-z0-9 \-_]+?)(?:\*{1,2})?\s*:\s*(.*?)\s*$/;
const REGEX_PARENTHETICAL = /^\s*\((.*)\)\s*$/;
const REGEX_FORCED_CHARACTER = /^\s*@([A-Za-z0-9\u0900-\u097F\s\-_]+?)(?:\s*\((.*?)\))?\s*$/;
const REGEX_ALL_CAPS_CHARACTER = /^([A-Z0-9\u0900-\u097F][A-Z0-9\u0900-\u097F\s\-_\.']{1,40})(?:\s*\((.*?)\))?(?:\s*\^\s*)?$/;
const REGEX_PRODUCTION_DIALOGUE_LINE = /^(\*{0,2})([A-Za-z0-9\u0900-\u097F\s\-_]+?)(?:\s+(?:dialogue|speech|लाइन))?(?:\s*[\(—–-]\s*(.*?)\s*[\)]|\s*—\s*(.*?))?\1\s*:\s*["“']?(.*?)["”']?\s*$/i;

const REGEX_PRODUCTION_INSTRUCTION = /^\s*(?:\*{1,2})?([A-Za-z0-9\u0900-\u097F\s\-_]+?)(?:\*{1,2})?\s*:\s*(?:\*{1,2})?(.*?)(?:\*{1,2})?$/;
const REGEX_TRANSITION = /^\s*(?:([A-Z\s]+TO:)|(>\s*[^<]+))\s*$/;

export interface FountainParserResult {
  nodes: FountainNode[];
  warnings: ScriptWarning[];
  titlePage: Record<string, string>;
}

export class FountainParser {
  private nodes: FountainNode[] = [];
  private warnings: ScriptWarning[] = [];
  private titlePage: Record<string, string> = {};

  private rawLines: string[] = [];
  private lineOffsets: number[] = [];

  constructor() {}

  /**
   * Parses arbitrary screenplay, Markdown, or plain-text production script into semantic AST nodes.
   * Guarantees non-destructive parsing: never throws, degrades ambiguous lines to action or warnings.
   */
  public parse(rawText: string): FountainParserResult {
    this.nodes = [];
    this.warnings = [];
    this.titlePage = {};

    this.rawLines = rawText.split(/\r?\n/);
    this.computeLineOffsets();

    let inTitlePage = true;
    let currentCharacterCue: {
      name: string;
      extension?: string;
      parenthetical?: string;
      line: number;
    } | null = null;
    let pendingDialogueLines: string[] = [];

    const flushPendingDialogue = (endLine: number) => {
      if (currentCharacterCue && pendingDialogueLines.length > 0) {
        const speech = pendingDialogueLines.join('\n').trim();
        const startPos = this.getPosition(currentCharacterCue.line, 1);
        const endPos = this.getPosition(endLine, 1);

        const dialogueNode: DialogueNode = {
          type: 'dialogue',
          characterName: currentCharacterCue.name,
          speech,
          text: speech,
          raw: speech,
          emotion: currentCharacterCue.parenthetical,
          parenthetical: currentCharacterCue.parenthetical,
          range: { start: startPos, end: endPos },
        };
        this.nodes.push(dialogueNode);
      }
      currentCharacterCue = null;
      pendingDialogueLines = [];
    };

    let pendingInstruction: ProductionInstructionNode | null = null;
    const flushPendingInstruction = () => {
      pendingInstruction = null;
    };

    for (let i = 0; i < this.rawLines.length; i++) {
      const lineNum = i + 1;
      const rawLine = this.rawLines[i];
      const trimmed = rawLine.trim();

      // Blank line
      if (!trimmed) {
        if (currentCharacterCue && pendingDialogueLines.length === 0) {
          continue;
        }
        if (pendingInstruction && !pendingInstruction.value) {
          continue;
        }
        flushPendingDialogue(lineNum);
        flushPendingInstruction();
        continue;
      }

      const startPos = this.getPosition(lineNum, 1);
      const endPos = this.getPosition(lineNum, rawLine.length + 1);
      const range: SourceRange = { start: startPos, end: endPos };

      // 1. Title Page Parsing (At start of document)
      if (inTitlePage) {
        const sceneHeading = this.matchSceneHeading(trimmed, lineNum, range, rawLine);
        if (sceneHeading) {
          inTitlePage = false;
          flushPendingDialogue(lineNum);
          flushPendingInstruction();
          this.nodes.push(sceneHeading);
          continue;
        }

        const titleMatch = trimmed.match(REGEX_TITLE_ENTRY);
        if (titleMatch) {
          const rawKey = titleMatch[1].replace(/^#+\s*/, '').trim().toLowerCase();
          const val = titleMatch[2].replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
          this.titlePage[rawKey] = val;
          this.nodes.push({
            type: 'title_entry',
            text: `${rawKey}: ${val}`,
            raw: rawLine,
            range,
            metadata: { key: rawKey, value: val },
          });
          continue;
        } else {
          // If we hit a non-title entry line, title page is finished
          inTitlePage = false;
        }
      }

      // 2. Scene Heading Check
      const sceneHeading = this.matchSceneHeading(trimmed, lineNum, range, rawLine);
      if (sceneHeading) {
        flushPendingDialogue(lineNum);
        flushPendingInstruction();
        this.nodes.push(sceneHeading);
        continue;
      }

      // 3. Explicit Production Instruction or Block Dialogue Header
      const prodOrCue = this.matchProductionInstruction(trimmed, lineNum, range, rawLine);
      if (prodOrCue) {
        flushPendingDialogue(lineNum);
        flushPendingInstruction();
        if (prodOrCue.type === 'character') {
          currentCharacterCue = {
            name: prodOrCue.characterName,
            extension: prodOrCue.extension,
            parenthetical: prodOrCue.parenthetical,
            line: lineNum,
          };
          this.nodes.push(prodOrCue);
        } else {
          this.nodes.push(prodOrCue);
          if (!prodOrCue.value && (
            prodOrCue.key === 'narration' ||
            prodOrCue.key === 'background_prompt' ||
            prodOrCue.key === 'character_action' ||
            prodOrCue.key === 'speaking_emotion' ||
            prodOrCue.key === 'facial_expression'
          )) {
            pendingInstruction = prodOrCue;
          }
        }
        continue;
      }

      // 4. Transitions (e.g. CUT TO:, FADE OUT., > DISSOLVE TO:)
      const transMatch = trimmed.match(REGEX_TRANSITION);
      if (transMatch) {
        flushPendingDialogue(lineNum);
        flushPendingInstruction();
        this.nodes.push({
          type: 'transition',
          text: trimmed.replace(/^>\s*/, ''),
          raw: rawLine,
          range,
        });
        continue;
      }

      // 5. Parenthetical following a Character Cue
      if (currentCharacterCue) {
        const parenMatch = trimmed.match(REGEX_PARENTHETICAL);
        if (parenMatch) {
          const parenText = parenMatch[1].trim();
          currentCharacterCue.parenthetical = parenText;
          const parentheticalNode: ParentheticalNode = {
            type: 'parenthetical',
            content: parenText,
            text: parenText,
            raw: rawLine,
            range,
          };
          this.nodes.push(parentheticalNode);
          continue;
        }

        // Subsequent line is dialogue speech
        pendingDialogueLines.push(trimmed);
        continue;
      }

      // 6. Character Cue check (Fountain all-caps / forced @ / Markdown bold)
      const charCue = this.matchCharacterCue(trimmed, lineNum, range, rawLine, i);
      if (charCue) {
        flushPendingDialogue(lineNum);
        flushPendingInstruction();
        currentCharacterCue = {
          name: charCue.characterName,
          extension: charCue.extension,
          parenthetical: charCue.parenthetical,
          line: lineNum,
        };
        this.nodes.push(charCue);
        continue;
      }

      // 6b. Pending multiline production instruction (e.g. Narration or Background prompt block)
      if (pendingInstruction) {
        pendingInstruction.value = pendingInstruction.value
          ? `${pendingInstruction.value} ${trimmed}`
          : trimmed;
        pendingInstruction.text = `${pendingInstruction.key}: ${pendingInstruction.value}`;
        continue;
      }

      // 7. General Action / Narration fallback
      this.nodes.push({
        type: 'action',
        text: trimmed,
        raw: rawLine,
        range,
      });
    }

    flushPendingDialogue(this.rawLines.length);
    flushPendingInstruction();

    return {
      nodes: this.nodes,
      warnings: this.warnings,
      titlePage: this.titlePage,
    };
  }

  private matchSceneHeading(
    trimmed: string,
    lineNum: number,
    range: SourceRange,
    rawLine: string
  ): SceneHeadingNode | null {
    // A. Markdown Scene Heading (e.g. "## Scene 1: Summer", "### Scene 2 — Monsoon (15s)", "# दृश्य १: गर्मी")
    const mdMatch = trimmed.match(REGEX_MARKDOWN_SCENE_HEADING);
    if (mdMatch) {
      const sceneNumRaw = mdMatch[2] || mdMatch[1];
      const sceneNum = parseDevanagariOrLatinNumber(sceneNumRaw);
      const titleRest = (mdMatch[3] || '').trim();
      const durMatch = titleRest.match(REGEX_DURATION_IN_HEADING);
      const cleanTitle = titleRest.replace(REGEX_DURATION_IN_HEADING, '').trim();

      return {
        type: 'scene_heading',
        sceneNumber: sceneNum,
        location: cleanTitle || `Scene ${sceneNum || lineNum}`,
        text: cleanTitle || `Scene ${sceneNum || lineNum}`,
        raw: rawLine,
        range,
        durationHintSeconds: durMatch ? parseInt(durMatch[1], 10) : undefined,
      };
    }

    // B. Plain Text Scene Heading (e.g. "Scene 1: Summer", "1. Scene 1: Summer", "Scene 2 (15s)")
    const txtMatch = trimmed.match(REGEX_TEXT_SCENE_HEADING);
    if (txtMatch && !trimmed.toLowerCase().includes('dialogue') && !trimmed.toLowerCase().includes('action')) {
      const sceneNumRaw = txtMatch[2] || txtMatch[1];
      const sceneNum = parseDevanagariOrLatinNumber(sceneNumRaw);
      const titleRest = (txtMatch[3] || '').trim();
      const durMatch = titleRest.match(REGEX_DURATION_IN_HEADING);
      const cleanTitle = titleRest.replace(REGEX_DURATION_IN_HEADING, '').trim();

      return {
        type: 'scene_heading',
        sceneNumber: sceneNum,
        location: cleanTitle || `Scene ${sceneNum || lineNum}`,
        text: cleanTitle || `Scene ${sceneNum || lineNum}`,
        raw: rawLine,
        range,
        durationHintSeconds: durMatch ? parseInt(durMatch[1], 10) : undefined,
      };
    }

    // C. Forced Scene Heading (".MEADOW - DAY")
    const forcedMatch = trimmed.match(REGEX_FORCED_SCENE_HEADING);
    if (forcedMatch) {
      const slug = forcedMatch[1].trim();
      return {
        type: 'scene_heading',
        location: slug,
        text: slug,
        raw: rawLine,
        range,
      };
    }

    // D. Standard Fountain Scene Heading ("INT. MEADOW - DAY", "EXT. MOUNTAIN - NIGHT")
    const fountainMatch = trimmed.match(REGEX_SCENE_HEADING_FOUNTAIN);
    if (fountainMatch) {
      const intExt = (fountainMatch[1] || 'EXT').toUpperCase() as 'INT' | 'EXT' | 'INT/EXT';
      const hashMatch = trimmed.match(REGEX_HEADING_NUMBER_HASH);
      const sceneNum = hashMatch ? parseInt(hashMatch[1], 10) : undefined;
      const cleanSlug = trimmed.replace(REGEX_HEADING_NUMBER_HASH, '').trim();

      // Extract time of day (e.g. "- DAY", "- NIGHT")
      const todMatch = cleanSlug.match(/[-–]\s*([A-Za-z]+)\s*$/);
      const timeOfDay = todMatch ? todMatch[1].toUpperCase() : undefined;

      return {
        type: 'scene_heading',
        intExt,
        sceneNumber: isNaN(sceneNum as any) ? undefined : sceneNum,
        location: cleanSlug,
        timeOfDay,
        text: cleanSlug,
        raw: rawLine,
        range,
      };
    }

    return null;
  }

  private matchProductionInstruction(
    trimmed: string,
    lineNum: number,
    range: SourceRange,
    rawLine: string
  ): ProductionInstructionNode | CharacterCueNode | null {
    // 1. Character Action with actor prefix or parenthetical
    // Matches:
    // - "Krishna Character Action: Plays the flute."
    // - "Earth Character Action: waves happily"
    // - "Action (Radha): dances gracefully"
    // - "Character Action (Krishna): Plays the flute."
    // - "Radha Action: dances gracefully"
    // - "Character Action: jumps with joy"
    // - "Action: waves happily"
    // - "**Earth Character Action:** waves happily"
    // - "कृष्ण क्रिया: बांसुरी बजाते हैं"
    // - "क्रिया (राधा): नृत्य करती है"
    const actionPattern = /^(?:\*{1,2})?(?:([A-Za-z0-9\u0900-\u097F\s\-_]+?)\s+)?(?:character\s+)?(?:action|क्रिया|अभिनय)(?:\s*[\(—–-]\s*([A-Za-z0-9\u0900-\u097F\s\-_]+?)\s*[\)])?(?::\*{1,2}|\*{1,2}:|:)\s*(.*)$/i;
    const actionMatch = trimmed.match(actionPattern);
    if (actionMatch) {
      let actor = (actionMatch[1] || actionMatch[2] || '').replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
      let actionValue = (actionMatch[3] || '').trim();

      return {
        type: 'production_instruction',
        key: 'character_action',
        value: actionValue,
        text: `character_action: ${actionValue}`,
        raw: rawLine,
        range,
        actor: actor || undefined,
        metadata: {
          originalKey: trimmed.split(':')[0],
          characterName: actor || undefined,
          actor: actor || undefined,
        },
      };
    }

    // 2. Speaking Emotion
    const emotionPattern = /^(?:\*{1,2})?(?:([A-Za-z0-9\u0900-\u097F\s\-_]+?)\s+)?(?:speaking\s+)?(?:emotion|भाव|बोलने का भाव)(?:\s*[\(—–-]\s*([A-Za-z0-9\u0900-\u097F\s\-_]+?)\s*[\)])?(?::\*{1,2}|\*{1,2}:|:)\s*(.*)$/i;
    const emotionMatch = trimmed.match(emotionPattern);
    if (emotionMatch) {
      const actor = (emotionMatch[1] || emotionMatch[2] || '').replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
      const val = (emotionMatch[3] || '').trim();
      return {
        type: 'production_instruction',
        key: 'speaking_emotion',
        value: val,
        text: `speaking_emotion: ${val}`,
        raw: rawLine,
        range,
        actor: actor || undefined,
        metadata: {
          originalKey: trimmed.split(':')[0],
          characterName: actor || undefined,
          actor: actor || undefined,
        },
      };
    }

    // 3. Facial Expression
    const expressionPattern = /^(?:\*{1,2})?(?:([A-Za-z0-9\u0900-\u097F\s\-_]+?)\s+)?(?:facial\s+)?(?:expression|चेहरे के भाव|अभिव्यक्ति)(?:\s*[\(—–-]\s*([A-Za-z0-9\u0900-\u097F\s\-_]+?)\s*[\)])?(?::\*{1,2}|\*{1,2}:|:)\s*(.*)$/i;
    const exprMatch = trimmed.match(expressionPattern);
    if (exprMatch) {
      const actor = (exprMatch[1] || exprMatch[2] || '').replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
      const val = (exprMatch[3] || '').trim();
      return {
        type: 'production_instruction',
        key: 'facial_expression',
        value: val,
        text: `facial_expression: ${val}`,
        raw: rawLine,
        range,
        actor: actor || undefined,
        metadata: {
          originalKey: trimmed.split(':')[0],
          characterName: actor || undefined,
          actor: actor || undefined,
        },
      };
    }

    // 4. Standard Production Instructions (Background Prompt, Narration, Effects, Caption, Duration, Camera)
    const match = trimmed.match(REGEX_PRODUCTION_INSTRUCTION);
    if (match) {
      const rawKey = (match[1] || '').trim().toLowerCase();
      const value = (match[2] || '').trim();

      let standardKey = '';
      if (rawKey.includes('background') || rawKey.includes('visual prompt') || rawKey === 'visual' || rawKey === 'दृश्य' || rawKey === 'पृष्ठभूमि') {
        standardKey = 'background_prompt';
      } else if (rawKey.includes('narration') || rawKey === 'narrator' || rawKey.includes('voiceover') || rawKey.includes('सूत्रधार') || rawKey.includes('कथावाचक')) {
        standardKey = 'narration';
      } else if (rawKey.includes('effect') || rawKey.includes('overlay') || rawKey.includes('प्रभाव')) {
        standardKey = 'effects';
      } else if (rawKey.includes('caption') || rawKey.includes('opening caption') || rawKey.includes('closing caption') || rawKey.includes('कैप्शन')) {
        standardKey = 'caption';
      } else if (rawKey.includes('duration') || rawKey.includes('अवधि') || rawKey.includes('समय')) {
        standardKey = 'duration';
      } else if (rawKey.includes('shot') || rawKey.includes('camera')) {
        standardKey = 'shot_instruction';
      }

      if (standardKey) {
        return {
          type: 'production_instruction',
          key: standardKey,
          value,
          text: `${standardKey}: ${value}`,
          raw: rawLine,
          range,
          metadata: { originalKey: match[2].trim() },
        };
      }
    }

    // 5. Production Dialogue Line (inline speech or block-style header):
    // e.g. "Earth dialogue — surprised, playful: नमस्ते नन्हे दोस्तों!" or "**Earth Dialogue — surprised, playful:**" or "Earth: नमस्ते!" or "**Earth (happy):**"
    const dlgMatch = trimmed.match(
      /^(?:\*{1,2})?([A-Za-z0-9\u0900-\u097F\s\-_]+?)(?:\s+(?:dialogue|speech|लाइन|संवाद))?(?:\s*[\(—–-]\s*(.*?)\s*[\)]|\s*[-—–]\s*(.*?))?(?::\*{1,2}|\*{1,2}:|:)\s*["“']?(.*?)["”']?\s*$/i
    );
    if (dlgMatch) {
      const rawSpeaker = dlgMatch[1].replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
      let emotion = (dlgMatch[2] || dlgMatch[3] || '').replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
      let speech = (dlgMatch[4] || '').trim();
      speech = speech.replace(/^["“]|["”]$/g, '').trim();

      const trailingEmoMatch = speech.match(/\s*\((?:Emotion|Tone|भाव|बोलने का भाव):\s*(.*?)\)\s*$/i);
      if (trailingEmoMatch) {
        emotion = trailingEmoMatch[1].trim();
        speech = speech.replace(/\s*\((?:Emotion|Tone|भाव|बोलने का भाव):\s*(.*?)\)\s*$/i, '').trim();
      }

      const lowerSpeaker = rawSpeaker.toLowerCase();
      // Ensure it is not a reserved instruction like "Narration", "Background Prompt", "Effects", "Character Action", "Opening Caption"
      const isReserved = [
        'background',
        'visual',
        'image',
        'narration',
        'narrator',
        'voiceover',
        'vo',
        'effects',
        'overlay',
        'action',
        'character action',
        'facial expression',
        'facial',
        'expression',
        'speaking emotion',
        'speaking style',
        'speaking',
        'emotion',
        'tone',
        'style',
        'duration',
        'length',
        'time',
        'opening caption',
        'closing caption',
        'caption',
        'title',
        'logline',
        'lesson',
        'scene',
        'setting',
        'location',
        'shot',
        'camera',
        'pose',
        'दृश्य',
        'पृष्ठभूमि',
        'सूत्रधार',
        'कथावाचक',
        'वॉइसओवर',
        'क्रिया',
        'अभिनय',
        'भाव',
        'चेहरे के भाव',
        'बोलने का भाव',
      ].some((k) => lowerSpeaker === k || lowerSpeaker.startsWith(k + ' ') || lowerSpeaker.endsWith(' ' + k));

      let cleanSpeaker = rawSpeaker;
      const genericModifiers = ['closing', 'opening', 'final', 'intro', 'outro', 'अंतिम', 'प्रारंभिक'];
      if (genericModifiers.includes(lowerSpeaker)) {
        cleanSpeaker = ''; // speaker unspecified, let scene character resolution attribute it
      }

      if (!isReserved) {
        if (speech.length > 0) {
          return {
            type: 'production_instruction',
            key: 'dialogue_inline',
            value: speech,
            text: speech,
            raw: rawLine,
            range,
            actor: cleanSpeaker || undefined,
            metadata: { speaker: cleanSpeaker, emotion, speech },
          };
        } else if (cleanSpeaker.length > 0) {
          // Block-style dialogue header: treat as a character cue so following line(s) become dialogue
          return {
            type: 'character',
            characterName: cleanSpeaker,
            parenthetical: emotion || undefined,
            text: cleanSpeaker,
            raw: rawLine,
            range,
          };
        }
      }
    }

    return null;
  }

  private matchCharacterCue(
    trimmed: string,
    lineNum: number,
    range: SourceRange,
    rawLine: string,
    lineIndex: number
  ): CharacterCueNode | null {
    // A. Forced Character: "@Earth" or "@Pip (smiling)"
    const forcedMatch = trimmed.match(REGEX_FORCED_CHARACTER);
    if (forcedMatch) {
      return {
        type: 'character',
        characterName: forcedMatch[1].trim(),
        parenthetical: forcedMatch[2] ? forcedMatch[2].trim() : undefined,
        text: forcedMatch[1].trim(),
        raw: rawLine,
        range,
      };
    }

    // B. Screenplay All-Caps Character Cue:
    // Must be preceded by a blank line or start of script, and must have a line following it
    const isPrevBlank = lineIndex === 0 || !this.rawLines[lineIndex - 1].trim();
    const hasNextLine = lineIndex + 1 < this.rawLines.length && Boolean(this.rawLines[lineIndex + 1].trim());

    if (isPrevBlank && hasNextLine) {
      const capsMatch = trimmed.match(REGEX_ALL_CAPS_CHARACTER);
      if (capsMatch && !trimmed.endsWith(':')) {
        const rawName = capsMatch[1].trim();
        // Check for extension like (V.O.) or (CONT'D)
        const extMatch = trimmed.match(/\((V\.O\.|O\.S\.|CONT'D)\)/i);
        const parenMatch = capsMatch[2] ? capsMatch[2].trim() : undefined;

        // Ensure it's not a common screenplay heading prefix like "FADE IN"
        if (!rawName.startsWith('INT') && !rawName.startsWith('EXT') && rawName !== 'FADE IN' && rawName !== 'THE END') {
          return {
            type: 'character',
            characterName: rawName.replace(/\((.*?)\)/g, '').trim(),
            extension: extMatch ? extMatch[1].toUpperCase() : undefined,
            parenthetical: parenMatch,
            text: rawName,
            raw: rawLine,
            range,
          };
        }
      }
    }

    return null;
  }

  private computeLineOffsets(): void {
    this.lineOffsets = [];
    let currentOffset = 0;
    for (const line of this.rawLines) {
      this.lineOffsets.push(currentOffset);
      currentOffset += line.length + 1; // +1 for newline
    }
  }

  private getPosition(line: number, col: number): SourcePosition {
    const zeroIndexedLine = Math.max(0, line - 1);
    const lineOffset = this.lineOffsets[zeroIndexedLine] || 0;
    return {
      line,
      column: col,
      offset: lineOffset + Math.max(0, col - 1),
    };
  }
}
