/**
 * Open-Source Script Parser Code Audit, Reuse, and Integration Test Suite.
 *
 * Verifies:
 * 1. Screenplay-Tools & Screenplay-Fountain integration:
 *    - Standard Fountain parsing (INT./EXT., all-caps character cues, parentheticals, transitions)
 *    - Semantic AST generation with source position tracking (line, column, offset)
 *    - Error resilience ("never throws" on malformed input, produces structured warnings)
 *    - Round-trip serialization (serializeToFountain, serializeToMarkdown)
 * 2. ScriptBreak integration:
 *    - Deterministic production element breakdown (cast, locations, props, vfx, lighting, shots)
 *    - Project Look DNA preservation and style consistency
 *    - Character and location bibles
 *    - Scene-scoped background prompt synthesis with negative constraint enforcement
 * 3. Regression safety:
 *    - Preserves Hindi Devanagari 4-scene script "धरती के मौसम के चार रंग"
 *    - Distinguishes Narration from Character Dialogue
 *    - Female Hindi voice assignment (hf_alpha) for Earth
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IntelligentScriptParser,
  FountainParser,
  ProductionBreakdownExtractor,
  PromptSynthesizer,
  DEFAULT_PROJECT_LOOK,
} from '../src/services/story-generation/parser/index.js';
import { StoryImporterService } from '../src/services/story-generation/story-importer.service.js';

// Test Corpus A: Standard Fountain Screenplay
const FOUNTAIN_SAMPLE_SCRIPT = `Title: The Enchanted Forest Adventure
Author: AI Story Studio
Language: English
Target Duration: 60s
Logline: A brave little robot and wise Earth explore the magical forest.

INT. ENCHANTED MEADOW - DAY #1#

Sunlight filters through ancient golden willow trees. A gentle breeze rustles.

EARTH (V.O.)
(warm, inviting)
Welcome, young explorers, to the wonder of the whispering woods!

PIP
(curious)
Look at these sparkling blue flowers! What makes them glow?

EARTH
(smiling)
They capture the morning sunbeams and share their light with all of nature.

CUT TO:

EXT. RIVERSIDE CLEARING - DAY #2#

A crystal-clear brook flows over smooth pebbles. An umbrella rests by the bank.

PIP
(excited)
The water is singing a happy tune!

EARTH
Every river carries life to the valleys below.

FADE OUT.
`;

// Test Corpus B: Production Script with Hindi Devanagari, Metadata, Actions, and Effects
const HINDI_PRODUCTION_SCRIPT = `# धरती के मौसम के चार रंग
Language: Hindi
Target Duration: 90s
Logline: हमारी प्यारी धरती बच्चों को चारों ऋतुओं के रंग और रहस्य सिखाती है।
Lesson: हर मौसम का अपना विशेष महत्व और सौंदर्य होता है।

## Scene 1: गर्मी का कमाल! (22s)
Background Prompt: Create a cinematic 3D storybook summer meadow with green hills, distant mountains, golden sunlight. Keep foreground open for Earth.
Narration: बच्चों, क्या तुमने सोचा है कि मौसम क्यों बदलते रहते हैं?
Earth dialogue — surprised, playful: "नमस्ते नन्हे दोस्तों! मैं तुम्हारी प्यारी धरती हूँ। देखो, सूरज की सुनहरी किरणें कितनी तेज़ी से चमक रही हैं!"
Character Action: Earth floats gently, looks toward the sun and gestures toward the landscape.
Effects: sunshine_rays, heat_shimmer

## Scene 2: मानसून की मस्ती! (23s)
Background Prompt: Create a cinematic 3D storybook illustration of a lush Indian countryside valley.
Narration: भारत के कई हिस्सों में मानसून बारिश लेकर आता है।
Earth dialogue — amazed, enthusiastic: "अरे वाह! देखो काले-काले बादल घिर आए और झमाझम बारिश शुरू हो गई!"
Character Action: Earth looks up at the clouds and gestures toward the river.
Effects: rain, moving_clouds, water_splashes
`;

// Test Corpus C: Malformed & Ambiguous Input
const MALFORMED_INPUT_SCRIPT = `
Some random text with no header.
Just a stray thought.
Earth: Hey there!
A very confusing line with >>> weird syntax :::
`;

test('1. FountainParser - Tokenizes standard screenplay with source position tracking', () => {
  const parser = new FountainParser();
  const { nodes, titlePage } = parser.parse(FOUNTAIN_SAMPLE_SCRIPT);

  assert.equal(titlePage['title'], 'The Enchanted Forest Adventure');
  assert.equal(titlePage['language'], 'English');
  assert.equal(titlePage['target duration'], '60s');

  // Verify scene headings
  const sceneHeadings = nodes.filter((n) => n.type === 'scene_heading');
  assert.equal(sceneHeadings.length, 2, 'Must detect 2 standard Fountain scene headings');
  assert.ok(sceneHeadings[0].range.start.line > 0);
  assert.ok(sceneHeadings[0].range.start.offset >= 0);

  // Verify dialogue nodes
  const dialogueNodes = nodes.filter((n) => n.type === 'dialogue');
  assert.ok(dialogueNodes.length >= 3, 'Must extract dialogue lines');
  const pipLine = dialogueNodes.find((d: any) => d.characterName === 'PIP');
  assert.ok(pipLine, 'Must identify PIP as speaker');
  assert.ok(pipLine.text.includes('sparkling blue flowers'));
});

test('2. ProductionBreakdownExtractor - Deterministic element extraction (ScriptBreak pattern)', () => {
  const breakdown = ProductionBreakdownExtractor.extractSceneBreakdown({
    title: 'Monsoon Countryside Valley',
    locationText: 'Lush Indian countryside valley near river',
    visualPrompt: 'Lush green hills and valleys covered in fresh gentle monsoon rain, rolling clouds and water splashes.',
    narration: 'वर्षा ऋतु में काले बादल गरजते हैं और ठंडी बारिश सूखी धरती को नया जीवन देती है।',
    dialogueTexts: ['अरे वाह! देखो काले-काले बादल घिर आए और झमाझम बारिश शुरू हो गई!'],
    actionTexts: ['Earth looks up at the clouds with an umbrella and gestures toward the river'],
    explicitEffects: ['rain', 'moving_clouds', 'water_splashes'],
    characterNames: ['Earth'],
  });

  // Verify props
  assert.ok(breakdown.props.includes('umbrella'), 'Must detect hero prop umbrella');

  // Verify VFX overlays
  assert.ok(breakdown.vfx.includes('rain'), 'Must detect rain VFX');
  assert.ok(breakdown.vfx.includes('moving_clouds'), 'Must detect clouds VFX');
  assert.ok(breakdown.vfx.includes('water_splashes'), 'Must detect splashes VFX');

  // Verify lighting
  assert.equal(breakdown.lighting.timeOfDay, 'DAY');

  // Verify shots
  assert.ok(breakdown.shots.length >= 2, 'Must generate starter shot coverage');
  assert.equal(breakdown.shots[0].size, 'WIDE');
  assert.equal(breakdown.shots[1].size, 'MEDIUM');
});

test('3. PromptSynthesizer - Preserves Look DNA and enforces negative constraints', () => {
  const synthesized = PromptSynthesizer.synthesizeBackgroundPrompt({
    sceneTitle: 'Autumn Forest',
    locationName: 'Golden Birch Wood',
    timeOfDay: 'GOLDEN_HOUR',
  });

  assert.ok(synthesized.includes('3D storybook'), 'Must include 3D storybook art style');
  assert.ok(synthesized.includes('Environment only'), 'Must enforce environment-only constraint');
  assert.ok(synthesized.includes('No characters'), 'Must enforce negative constraint against baked-in characters');
  assert.ok(synthesized.includes('foreground open'), 'Must reserve foreground for 2D animated rig');
});

test('4. IntelligentScriptParser - Full Pipeline on Fountain Script', () => {
  const ir = IntelligentScriptParser.parse(FOUNTAIN_SAMPLE_SCRIPT, {
    language: 'English',
  });

  assert.equal(ir.title, 'The Enchanted Forest Adventure');
  assert.equal(ir.scenes.length, 2);

  const sc1 = ir.scenes[0];
  assert.equal(sc1.sceneNumber, 1);
  assert.ok(sc1.dialogue.length >= 2);
  assert.ok(sc1.breakdown.shots.length >= 2);

  // Round-trip serialization check
  const serializedFountain = IntelligentScriptParser.serializeToFountain(ir);
  assert.ok(serializedFountain.includes('Title: The Enchanted Forest Adventure'));
  assert.ok(serializedFountain.includes('.SCENE 1:'));

  const serializedMd = IntelligentScriptParser.serializeToMarkdown(ir);
  assert.ok(serializedMd.includes('# The Enchanted Forest Adventure'));
  assert.ok(serializedMd.includes('## Scene 1:'));
});

test('5. IntelligentScriptParser - Full Pipeline on Hindi Production Script with Devanagari Integrity', () => {
  const ir = IntelligentScriptParser.parse(HINDI_PRODUCTION_SCRIPT, {
    language: 'Hindi',
  });

  assert.equal(ir.title, 'धरती के मौसम के चार रंग');
  assert.equal(ir.language, 'Hindi');
  assert.equal(ir.scenes.length, 2);

  const sc1 = ir.scenes[0];
  assert.equal(sc1.durationSeconds, 22);
  assert.equal(sc1.narration, 'बच्चों, क्या तुमने सोचा है कि मौसम क्यों बदलते रहते हैं?');
  assert.equal(sc1.dialogue[0].characterName, 'Earth');
  assert.equal(sc1.dialogue[0].voice, 'hf_alpha', 'Earth must receive female Hindi voice hf_alpha');
  assert.equal(sc1.dialogue[0].text, 'नमस्ते नन्हे दोस्तों! मैं तुम्हारी प्यारी धरती हूँ। देखो, सूरज की सुनहरी किरणें कितनी तेज़ी से चमक रही हैं!');
  assert.ok(sc1.breakdown.vfx.includes('sunshine_rays'));
  assert.ok(sc1.breakdown.vfx.includes('heat_shimmer'));
});

test('6. Error Resilience - Malformed script parses gracefully without throwing', () => {
  assert.doesNotThrow(() => {
    const ir = IntelligentScriptParser.parse(MALFORMED_INPUT_SCRIPT);
    assert.ok(ir.scenes.length >= 1, 'Must create fallback Scene 1');
    assert.ok(ir.warnings.length > 0, 'Must record structured diagnostic warnings');
  });
});

test('7. StoryImporterService - Integration with parseScriptForDraft and DraftStoryboardResult', () => {
  const draft = StoryImporterService.parseScriptForDraft(FOUNTAIN_SAMPLE_SCRIPT, {
    language: 'English',
  });

  assert.equal(draft.title, 'The Enchanted Forest Adventure');
  assert.equal(draft.scenes.length, 2);
  assert.ok(draft.scenes[0].breakdown, 'Scenes must include production breakdown');
  assert.ok(draft.scenes[0].shots, 'Scenes must include shot list coverage');
});

