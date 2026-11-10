import test from 'node:test';
import assert from 'node:assert/strict';
import { CharacterPromptBuilderService } from '../src/services/character-studio/character-prompt-builder.service.js';
import { CharacterReferenceService } from '../src/services/character-studio/character-reference.service.js';
import { CharacterGenerationService } from '../src/services/character-studio/character-generation.service.js';

test('Character Studio 2.0 - Prompt Builder with all fields', () => {
  const builder = new CharacterPromptBuilderService();

  const promptResult = builder.buildPrompt({
    characterName: 'Milo',
    characterDescription: 'small brown bear, round face, large expressive dark eyes',
    species: 'Bear',
    age: '8',
    direction: 'three_quarter_left',
    action: 'jumping',
    expression: 'happy',
    framing: 'full_body',
    clothingInstructions: 'blue hoodie, yellow shorts, white sneakers',
    backgroundInstructions: 'clean transparent white background',
    artStyle: '2d_cartoon',
    customInstructions: 'holding a red balloon',
    generationType: 'pose',
    referenceImageUrl: 'http://localhost:5001/storage/characters/char-1/main.png',
  });

  assert.ok(promptResult.prompt.includes('Milo'), 'Prompt should mention character name');
  assert.ok(promptResult.prompt.includes('three-quarter angle view facing slightly to the left'), 'Prompt should include direction');
  assert.ok(promptResult.prompt.includes('jumping enthusiastically in mid-air'), 'Prompt should include action');
  assert.ok(promptResult.prompt.includes('cheerful friendly smile'), 'Prompt should include expression');
  assert.ok(promptResult.prompt.includes('blue hoodie'), 'Prompt should include clothing');
  assert.ok(promptResult.prompt.includes('holding a red balloon'), 'Prompt should include custom instructions');
  assert.ok(promptResult.prompt.includes('Visual consistency rule: Strictly match the master visual reference character'), 'Prompt should reinforce identity consistency');
  assert.ok(promptResult.negativePrompt.includes('photo'), 'Negative prompt should be populated');
});

test('Character Studio 2.0 - Direction-specific and custom action prompt generation', () => {
  const builder = new CharacterPromptBuilderService();

  const leftWalk = builder.buildPrompt({
    characterName: 'Milo',
    characterDescription: 'cute boy in hoodie',
    direction: 'left',
    action: 'walking',
    generationType: 'pose',
  });
  assert.ok(leftWalk.prompt.includes('facing left in full profile'), 'Should contain facing left');
  assert.ok(leftWalk.prompt.includes('mid-stride walking dynamically'), 'Should contain walking');

  const customAction = builder.buildPrompt({
    characterName: 'Milo',
    characterDescription: 'cute boy in hoodie',
    action: 'custom',
    customAction: 'balancing a book on head while standing on one foot',
    generationType: 'custom',
  });
  assert.ok(customAction.prompt.includes('balancing a book on head while standing on one foot'), 'Should support custom action');
});

test('Character Studio 2.0 - Custom prompt preservation', () => {
  const builder = new CharacterPromptBuilderService();

  const customText = 'My hand-crafted custom prompt for Milo with precise camera angle';
  const customNegative = 'bad lighting, extra ears';

  const result = builder.buildPrompt({
    characterName: 'Milo',
    characterDescription: 'cute boy',
    generationType: 'custom',
    customCombinedPrompt: customText,
    negativePrompt: customNegative,
  });

  assert.equal(result.prompt, customText, 'Manual prompt edit must be preserved exactly without overwrite');
  assert.equal(result.negativePrompt, customNegative, 'Manual negative prompt must be preserved');
});

test('Character Studio 2.0 - Reference Service animation action mapping', () => {
  const refService = new CharacterReferenceService();

  assert.equal(refService.mapActionToRigAction('standing naturally'), 'idle');
  assert.equal(refService.mapActionToRigAction('sitting comfortably'), 'idle');
  assert.equal(refService.mapActionToRigAction('mid-stride walking'), 'walk');
  assert.equal(refService.mapActionToRigAction('energetically running'), 'walk');
  assert.equal(refService.mapActionToRigAction('jumping enthusiastically in mid-air'), 'jump');
  assert.equal(refService.mapActionToRigAction('warmly waving one hand'), 'wave');
  assert.equal(refService.mapActionToRigAction('playfully dancing'), 'wave');
  assert.equal(refService.mapActionToRigAction('pointing clearly with finger'), 'point');
});

test('Character Studio 2.0 - Provider capabilities check and error handling', () => {
  const genService = new CharacterGenerationService();

  const geminiCap = genService.getProviderCapabilities('gemini');
  assert.equal(geminiCap.provider, 'gemini');
  assert.equal(geminiCap.model, 'imagen-3.0-generate-002');
  assert.equal(geminiCap.supportsReferenceImage, false);
  assert.ok(geminiCap.notes.includes('Direct image-to-image conditioning is not supported'), 'Notes should clearly inform user of provider limitations');

  const pollinationsCap = genService.getProviderCapabilities('pollinations');
  assert.equal(pollinationsCap.provider, 'pollinations');
  assert.equal(pollinationsCap.supportsReferenceImage, false);
});

test('Character Studio 2.0 - Gemini failure without silent fallback', async () => {
  const genService = new CharacterGenerationService();
  const oldKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    await assert.rejects(
      async () => {
        await genService.generateCharacterAsset({
          characterId: 'test-char',
          promptData: {
            characterName: 'Milo',
            characterDescription: 'bear in hoodie',
            generationType: 'main',
          },
          provider: 'gemini',
        });
      },
      /Gemini API key is not configured/,
      'Must throw explicit error and never silently fall back to Pollinations'
    );
  } finally {
    if (oldKey) process.env.GEMINI_API_KEY = oldKey;
  }
});
