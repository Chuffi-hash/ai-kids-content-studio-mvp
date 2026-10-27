/**
 * Parser Module Index & Public API.
 *
 * Provides:
 * - IntelligentScriptParser: master parser for Fountain, Markdown, and plain-text production scripts.
 * - FountainParser: semantic AST tokenizer and position tracker (screenplay-tools & screenplay-fountain).
 * - ProductionBreakdownExtractor: deterministic element extraction (ScriptBreak).
 * - PromptSynthesizer: Project Look DNA and background prompt synthesizer (ScriptBreak).
 * - Types and interfaces.
 */

export * from './types.js';
export * from './fountain-parser.js';
export * from './production-breakdown.js';
export * from './prompt-synthesizer.js';
export * from './intelligent-script-parser.js';

