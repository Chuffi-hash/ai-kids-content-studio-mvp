/**
 * Semantic AST, source position, production breakdown, and intermediate representation types.
 *
 * Attribution:
 * - Design patterns for semantic screenplay AST and source tracking adapted under MIT License
 *   from screenplay-tools (Copyright (c) 2024 Ian Thomas) and screenplay-fountain (Animora Labs).
 * - Production breakdown element categories, Look DNA, and bible models adapted under Apache 2.0
 *   from ScriptBreak (Copyright (c) 2024 Sam Wasserman / Wasserman Productions).
 */

export interface SourcePosition {
  line: number;
  column: number;
  offset: number;
}

export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}

export interface ScriptWarning {
  code: string;
  message: string;
  line: number;
  column?: number;
  severity: 'info' | 'warning' | 'error';
  suggestion?: string;
  sourceContext?: string;
}

export type FountainElementType =
  | 'title_entry'
  | 'scene_heading'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'action'
  | 'transition'
  | 'production_instruction'
  | 'caption'
  | 'note';

export interface FountainNode {
  type: FountainElementType;
  text: string;
  raw: string;
  range: SourceRange;
  metadata?: Record<string, any>;
}

export interface SceneHeadingNode extends FountainNode {
  type: 'scene_heading';
  sceneNumber?: number;
  intExt?: 'INT' | 'EXT' | 'INT/EXT';
  location: string;
  timeOfDay?: string;
  durationHintSeconds?: number;
}

export interface CharacterCueNode extends FountainNode {
  type: 'character';
  characterName: string;
  extension?: string; // e.g. V.O., O.S., CONT'D
  parenthetical?: string; // e.g. (smiling), (worried)
  isDual?: boolean;
}

export interface ParentheticalNode extends FountainNode {
  type: 'parenthetical';
  content: string;
}

export interface DialogueNode extends FountainNode {
  type: 'dialogue';
  characterName: string;
  speech: string;
  emotion?: string;
  parenthetical?: string;
  voice?: string;
}

export interface ProductionInstructionNode extends FountainNode {
  type: 'production_instruction';
  key: string; // e.g. 'background_prompt', 'narration', 'effects', 'action', 'emotion', 'expression'
  value: string;
}

/**
 * ScriptBreak-inspired production element breakdown.
 * Apache 2.0 Notice: Wasserman Productions / ScriptBreak element categories
 */
export interface ProductionBreakdown {
  cast: string[];
  locations: string[];
  props: string[];
  vfx: string[];
  lighting: {
    timeOfDay: string;
    description?: string;
  };
  sound: string[];
  shots: Array<{
    num: number;
    size: 'WIDE' | 'MEDIUM' | 'CLOSE_UP' | 'EXTREME_WIDE';
    move: 'STATIC' | 'PAN' | 'TILT' | 'TRACKING' | 'PUSH_IN';
    angle?: string;
    desc?: string;
  }>;
}

/**
 * ScriptBreak-inspired Project Look DNA.
 * Maintains visual style consistency across all scene prompts.
 */
export interface ProjectLookDNA {
  aspect: string;       // e.g. '9:16', '16:9', '1:1', '4:5'
  format: string;       // e.g. '3D Storybook Animation', '2D Vector Cartoon'
  lensing: string;      // e.g. '35mm Storybook Prime', 'Deep Focus'
  framing: string;      // e.g. 'Vertical Reel Open Center', 'Rule of Thirds'
  camera: string;       // e.g. 'Smooth gentle float', 'Static cinematic'
  lighting: string;     // e.g. 'Warm golden hour sunlight', 'Soft storybook ambient'
  palette: string;      // e.g. 'Vibrant natural greens and golden ambers'
  design: string;       // e.g. 'Enchanted storybook countryside with soft edges'
  tone: string;         // e.g. 'Inspiring, joyful, educational'
  avoid: string;        // e.g. 'No characters in background image, no text, no watermarks'
}

export interface CharacterBibleEntry {
  name: string;
  role?: string;
  species?: string;
  desc: string;
  voice?: string;
}

export interface LocationBibleEntry {
  name: string;
  desc: string;
  features?: string[];
}

export interface ProjectBibles {
  characters: Record<string, CharacterBibleEntry>;
  locations: Record<string, LocationBibleEntry>;
  props: Record<string, { desc: string }>;
}

export interface ParsedDialogueLine {
  id?: string;
  characterName: string;
  text: string;
  emotion?: string;
  expression?: string;
  voice?: string;
  parenthetical?: string;
  extension?: string;
  sourceRange?: SourceRange;
}

export interface ParsedScene {
  sceneNumber: number;
  title: string;
  slugline?: string;
  intExt?: 'INT' | 'EXT' | 'INT/EXT';
  location: string;
  timeOfDay?: string;
  durationSeconds: number;
  durationConfidence: 'explicit' | 'estimated';
  visualPrompt: string;
  narration: string;
  dialogue: ParsedDialogueLine[];
  characterActions: Array<{ characterName: string; action: string; description?: string }>;
  breakdown: ProductionBreakdown;
  suggestedOverlays: Array<{ id: string; type: string; label: string; color?: string }>;
  shots: Array<{ num: number; size: string; move: string; desc: string }>;
  sourceRange?: SourceRange;
}

/**
 * Validated Intermediate Representation connecting parsing, breakdown, and scene persistence.
 */
export interface StoryboardIntermediateRepresentation {
  title: string;
  targetDurationSeconds: number;
  language: string;
  logline: string;
  lesson: string;
  genre: string;
  look: ProjectLookDNA;
  bibles: ProjectBibles;
  scenes: ParsedScene[];
  warnings: ScriptWarning[];
  originalText: string;
}

