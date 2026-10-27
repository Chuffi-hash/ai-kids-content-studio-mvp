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

// Regex Constants (adapted from screenplay-tools with Unicode and Production Script extensions)
const REGEX_SCENE_HEADING_FOUNTAIN = /^\s*(?:(INT|EXT|EST|INT\.\/EXT|INT\/EXT|I\/E)(\.|\s)|(FADE IN:\s*))/i;
const REGEX_FORCED_SCENE_HEADING = /^\.([A-Za-z0-9\u0900-\u097F].*)$/;
const REGEX_MARKDOWN_SCENE_HEADING = /^#{1,4}\s*(?:Scene\s+(\d+)[:\s—–-]*|दृश्य\s+(\d+)[:\s—–-]*)(.*)$/i;
const REGEX_TEXT_SCENE_HEADING = /^(?:Scene\s+(\d+)[:\s—–-]*|दृश्य\s+(\d+)[:\s—–-]*)(.*)$/i;
const REGEX_HEADING_NUMBER_HASH = /#([a-zA-Z0-9\-.]+)#\s*$/;
const REGEX_DURATION_IN_HEADING = /\((\d+)\s*(?:s|sec|secs|seconds|सेकंड)\)/i;

const REGEX_TITLE_ENTRY = /^\s*([A-Za-z0-9 \-_]+?)\s*:\s*(.*?)\s*$/;
const REGEX_PARENTHETICAL = /^\s*\((.*)\)\s*$/;
const REGEX_FORCED_CHARACTER = /^\s*@([A-Za-z0-9\u0900-\u097F\s\-_]+?)(?:\s*\((.*?)\))?\s*$/;
const REGEX_ALL_CAPS_CHARACTER = /^([A-Z0-9\u0900-\u097F][A-Z0-9\u0900-\u097F\s\-_\.']{1,40})(?:\s*\((.*?)\))?(?:\s*\^\s*)?$/;
const REGEX_PRODUCTION_DIALOGUE_LINE = /^(\*{0,2})([A-Za-z0-9\u0900-\u097F\s\-_]+?)(?:\s+(?:dialogue|speech|लाइन))?(?:\s*[\(—–-]\s*(.*?)\s*[\)]|\s*—\s*(.*?))?\1\s*:\s*["“']?(.*?)["”']?\s*$/i;

const REGEX_PRODUCTION_INSTRUCTION = /^\s*(\*{0,2})([A-Za-z0-9\u0900-\u097F\s\-_]+?)\1\s*:\s*(.+)$/;
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

    for (let i = 0; i < this.rawLines.length; i++) {
      const lineNum = i + 1;
      const rawLine = this.rawLines[i];
      const trimmed = rawLine.trim();

      // Blank line
      if (!trimmed) {
        flushPendingDialogue(lineNum);
        continue;
      }

      const startPos = this.getPosition(lineNum, 1);
      const endPos = this.getPosition(lineNum, rawLine.length + 1);
      const range: SourceRange = { start: startPos, end: endPos };

      // 1. Title Page Parsing (At start of document)
      if (inTitlePage) {
        const titleMatch = trimmed.match(REGEX_TITLE_ENTRY);
        if (titleMatch && !trimmed.startsWith('#')) {
          const key = titleMatch[1].trim().toLowerCase();
          const val = titleMatch[2].trim();
          this.titlePage[key] = val;
          this.nodes.push({
            type: 'title_entry',
            text: `${key}: ${val}`,
            raw: rawLine,
            range,
            metadata: { key, value: val },
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
        this.nodes.push(sceneHeading);
        continue;
      }

      // 3. Explicit Production Instruction (e.g. Background Prompt, Narration, Effects, Action)
      const prodInstruction = this.matchProductionInstruction(trimmed, lineNum, range, rawLine);
      if (prodInstruction) {
        flushPendingDialogue(lineNum);
        this.nodes.push(prodInstruction);
        continue;
      }

      // 4. Transitions (e.g. CUT TO:, FADE OUT., > DISSOLVE TO:)
      const transMatch = trimmed.match(REGEX_TRANSITION);
      if (transMatch) {
        flushPendingDialogue(lineNum);
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
        currentCharacterCue = {
          name: charCue.characterName,
          extension: charCue.extension,
          parenthetical: charCue.parenthetical,
          line: lineNum,
        };
        this.nodes.push(charCue);
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
    // A. Markdown Scene Heading (e.g. "## Scene 1: Summer", "### Scene 2 — Monsoon (15s)")
    const mdMatch = trimmed.match(REGEX_MARKDOWN_SCENE_HEADING);
    if (mdMatch) {
      const sceneNum = parseInt(mdMatch[1] || mdMatch[2], 10);
      const titleRest = (mdMatch[3] || '').trim();
      const durMatch = titleRest.match(REGEX_DURATION_IN_HEADING);
      const cleanTitle = titleRest.replace(REGEX_DURATION_IN_HEADING, '').trim();

      return {
        type: 'scene_heading',
        sceneNumber: isNaN(sceneNum) ? undefined : sceneNum,
        location: cleanTitle || `Scene ${sceneNum}`,
        text: cleanTitle || `Scene ${sceneNum}`,
        raw: rawLine,
        range,
        durationHintSeconds: durMatch ? parseInt(durMatch[1], 10) : undefined,
      };
    }

    // B. Plain Text Scene Heading (e.g. "Scene 1: Summer", "Scene 2 (15s)")
    const txtMatch = trimmed.match(REGEX_TEXT_SCENE_HEADING);
    if (txtMatch && !trimmed.toLowerCase().includes('dialogue') && !trimmed.toLowerCase().includes('action')) {
      const sceneNum = parseInt(txtMatch[1] || txtMatch[2], 10);
      const titleRest = (txtMatch[3] || '').trim();
      const durMatch = titleRest.match(REGEX_DURATION_IN_HEADING);
      const cleanTitle = titleRest.replace(REGEX_DURATION_IN_HEADING, '').trim();

      return {
        type: 'scene_heading',
        sceneNumber: isNaN(sceneNum) ? undefined : sceneNum,
        location: cleanTitle || `Scene ${sceneNum}`,
        text: cleanTitle || `Scene ${sceneNum}`,
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
  ): ProductionInstructionNode | null {
    // 1. Check if this line is an inline production dialogue:
    // e.g. "Earth dialogue — surprised, playful: नमस्ते नन्हे दोस्तों!" or "Earth: नमस्ते!" or "**Earth (happy):** नमस्ते!"
    const dlgMatch = trimmed.match(/^(?:\*{1,2})?([A-Za-z0-9\u0900-\u097F\s\-_]+?)(?:\s+(?:dialogue|speech|लाइन))?(?:\s*[\(—–-]\s*(.*?)\s*[\)]|\s*[-—–]\s*(.*?))?(?::\*{1,2}|\*{1,2}:|:)\s*["“']?(.*?)["”']?\s*$/i);
    if (dlgMatch) {
      const rawSpeaker = dlgMatch[1].replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
      const emotion = (dlgMatch[2] || dlgMatch[3] || '').replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
      let speech = dlgMatch[4].trim();
      speech = speech.replace(/^["“]|["”]$/g, '').trim();

      const lowerSpeaker = rawSpeaker.toLowerCase();
      // Ensure it is not a reserved instruction like "Narration", "Background Prompt", "Effects", "Character Action", "Opening Caption"
      if (
        !['background', 'visual', 'narration', 'narrator', 'effects', 'action', 'character action', 'duration', 'opening caption', 'caption'].some((k) => lowerSpeaker.startsWith(k)) &&
        speech.length > 0
      ) {
        return {
          type: 'production_instruction',
          key: 'dialogue_inline',
          value: speech,
          text: speech,
          raw: rawLine,
          range,
          metadata: { speaker: rawSpeaker, emotion, speech },
        };
      }
    }

    const match = trimmed.match(REGEX_PRODUCTION_INSTRUCTION);
    if (!match) return null;

    const rawKey = match[2].trim().toLowerCase();
    const value = match[3].trim();

    // Map known production instruction keys
    let standardKey = '';
    if (rawKey.includes('background') || rawKey.includes('visual prompt') || rawKey === 'visual') {
      standardKey = 'background_prompt';
    } else if (rawKey.includes('narration') || rawKey === 'narrator' || rawKey.includes('voiceover')) {
      standardKey = 'narration';
    } else if (rawKey.includes('effect') || rawKey.includes('overlay')) {
      standardKey = 'effects';
    } else if (rawKey.includes('action') || rawKey.includes('character action')) {
      standardKey = 'character_action';
    } else if (rawKey.includes('speaking emotion') || rawKey.includes('emotion')) {
      standardKey = 'speaking_emotion';
    } else if (rawKey.includes('facial expression') || rawKey.includes('expression')) {
      standardKey = 'facial_expression';
    } else if (rawKey.includes('caption') || rawKey.includes('opening caption')) {
      standardKey = 'caption';
    } else if (rawKey.includes('duration')) {
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
