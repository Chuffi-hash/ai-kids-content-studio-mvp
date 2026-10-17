import { test } from 'node:test';
import assert from 'node:assert';
import { randomUUID } from 'crypto';
import {
  VectorAnimationEngine,
  evaluatePose,
  VectorSceneData,
  CharacterInstance,
  AnimationClip,
} from '../src/services/animation/vector-animation.engine.js';
import {
  buildRigFromAppearance,
  DEFAULT_APPEARANCE,
  CHARACTER_PRESETS,
  CustomCharacterAppearance,
} from '../src/services/animation/templates/custom-character-rig.js';
import {
  createCharacter,
  getCharacterById,
  updateCharacter,
  deleteCharacter,
  createStory,
  deleteStory,
  linkStoryCharacter,
  unlinkStoryCharacter,
  setStoryCharacters,
  getCharactersByStoryId,
  updateStoryMetadata,
  getStoryByStoryId,
} from '../src/services/database/database.service.js';

test('Custom Character Rig - Generation & Joint Articulation', () => {
  const customApp: CustomCharacterAppearance = {
    ...DEFAULT_APPEARANCE,
    species: 'human',
    head: { shape: 'round', size: 1.1, skinColor: '#fed7aa' },
    hair: { style: 'ponytail', color: '#b45309' },
    torso: {
      shape: 'standard',
      width: 1.05,
      height: 1.0,
      clothingStyle: 'hoodie',
      shirtColor: '#ec4899',
      pattern: 'star',
    },
    legs: {
      length: 1.1,
      thickness: 1.0,
      pantsStyle: 'pants',
      pantsColor: '#6366f1',
      shoeStyle: 'sneakers',
      shoeColor: '#ffffff',
    },
  };

  const rig = buildRigFromAppearance('test-char-1', 'Maya Hero', customApp);

  assert.strictEqual(rig.id, 'custom-rig-test-char-1');
  assert.strictEqual(rig.name, 'Maya Hero');
  assert.strictEqual(rig.species, 'human');
  assert.ok(rig.viewBox, 'ViewBox must be defined');

  // Verify all 7 articulated joints exist
  assert.ok(rig.parts.torso, 'Torso must exist');
  assert.ok(rig.parts.head, 'Head must exist');
  assert.ok(rig.parts.leftArm, 'Left arm must exist');
  assert.ok(rig.parts.rightArm, 'Right arm must exist');
  assert.ok(rig.parts.rightForearm, 'Right forearm must exist for waving action');
  assert.ok(rig.parts.leftLeg, 'Left leg must exist');
  assert.ok(rig.parts.rightLeg, 'Right leg must exist');

  // Verify pivots
  assert.strictEqual(typeof rig.parts.torso.pivot.x, 'number');
  assert.strictEqual(typeof rig.parts.torso.pivot.y, 'number');
  assert.strictEqual(typeof rig.parts.head.pivot.x, 'number');
  assert.strictEqual(typeof rig.parts.head.pivot.y, 'number');
  assert.strictEqual(typeof rig.parts.rightForearm.pivot.x, 'number');
  assert.strictEqual(typeof rig.parts.rightForearm.pivot.y, 'number');

  // Verify shapes exist on all parts
  assert.ok(rig.parts.torso.shapes.length > 0, 'Torso must have shapes');
  assert.ok(rig.parts.head.shapes.length > 0, 'Head must have shapes');
  assert.ok(rig.parts.leftLeg.shapes.length > 0, 'Left leg must have shapes');
  assert.ok(rig.parts.rightLeg.shapes.length > 0, 'Right leg must have shapes');
});

test('Custom Character Rig - Presets Library Verification', () => {
  const presetKeys = Object.keys(CHARACTER_PRESETS);
  assert.ok(presetKeys.length >= 4, 'Must provide at least 4 presets (boy, girl, bear, robot)');
  assert.ok(presetKeys.includes('kid_boy'));
  assert.ok(presetKeys.includes('kid_girl'));
  assert.ok(presetKeys.includes('bear_cub'));
  assert.ok(presetKeys.includes('robot'));

  for (const key of presetKeys) {
    const p = CHARACTER_PRESETS[key];
    const rig = buildRigFromAppearance(`preset-${key}`, p.label, p.appearance);
    assert.ok(rig.parts.torso);
    assert.ok(rig.parts.head);
    assert.ok(rig.parts.rightForearm);
  }
});

test('Custom Character - Kinematics & Deterministic Pose Evaluation', () => {
  const customApp = CHARACTER_PRESETS['kid_girl'].appearance;
  const rig = buildRigFromAppearance('maya-test', 'Maya', customApp);

  const instance: CharacterInstance = {
    instanceId: 'inst-maya',
    characterId: 'maya-test',
    assetType: 'vector_rig',
    name: 'Maya',
    x: 400,
    y: 500,
    scale: 1.0,
    rotation: 0,
    flipX: false,
    zIndex: 1,
    customRig: rig,
    appearance: customApp,
  };

  // 1. Idle pose evaluation
  const idleClips: AnimationClip[] = [
    {
      clipId: 'c1',
      instanceId: 'inst-maya',
      action: 'idle',
      startMs: 0,
      durationMs: 4000,
      loop: true,
    },
  ];
  const idlePose = evaluatePose(instance, idleClips, 1000);
  assert.strictEqual(idlePose.activeAction, 'idle');
  assert.strictEqual(idlePose.x, 400);
  assert.strictEqual(idlePose.y, 500);

  // 2. Wave pose evaluation (right forearm articulates)
  const waveClips: AnimationClip[] = [
    {
      clipId: 'c2',
      instanceId: 'inst-maya',
      action: 'wave',
      startMs: 0,
      durationMs: 2000,
      loop: true,
    },
  ];
  const wavePoseMid = evaluatePose(instance, waveClips, 500);
  assert.strictEqual(wavePoseMid.activeAction, 'wave');
  assert.notStrictEqual(wavePoseMid.rightForearmAngle, 0, 'Forearm angle must articulate during wave');

  // 3. Motion path walk evaluation with auto-flip
  const walkClips: AnimationClip[] = [
    {
      clipId: 'c3',
      instanceId: 'inst-maya',
      action: 'walk',
      motionMode: 'motion_path',
      motionPath: { startX: 200, startY: 450, endX: 800, endY: 450 },
      startMs: 0,
      durationMs: 2000,
      loop: false,
    },
  ];
  const walkPoseMid = evaluatePose(instance, walkClips, 1000);
  assert.strictEqual(walkPoseMid.activeAction, 'walk');
  assert.ok(walkPoseMid.x > 200 && walkPoseMid.x < 800, 'X must interpolate along motion path');
  assert.strictEqual(walkPoseMid.flipX, false, 'Moving right should have flipX = false');
});

test('VectorAnimationEngine - Renders Custom Character to SVG and PNG Buffer', () => {
  const engine = new VectorAnimationEngine();
  const customApp = CHARACTER_PRESETS['kid_boy'].appearance;
  const rig = buildRigFromAppearance('sammy-custom', 'Sammy Boy', customApp);

  const sceneData: VectorSceneData = {
    version: 1,
    viewport: { width: 1280, height: 720 },
    characterInstances: [
      {
        instanceId: 'c-inst-1',
        characterId: 'sammy-custom',
        name: 'Sammy Boy',
        x: 640,
        y: 480,
        scale: 1.0,
        rotation: 0,
        flipX: false,
        zIndex: 1,
        customRig: rig,
        appearance: customApp,
      },
    ],
    animationClips: [
      {
        clipId: 'clip-walk',
        instanceId: 'c-inst-1',
        action: 'walk',
        startMs: 0,
        durationMs: 3000,
        loop: true,
        motionMode: 'in_place',
      },
    ],
  };

  const svgXml = engine.generateSvgFrame({
    animationData: sceneData,
    timestampSec: 1.5,
    width: 1280,
    height: 720,
  });
  assert.ok(svgXml.includes('<svg'), 'Rendered output must contain valid SVG tag');
  assert.ok(svgXml.includes('id="char-c-inst-1"'), 'Rendered SVG must contain character group id');

  const pngBuffer = engine.rasterizeSvgToPng(svgXml, 1280);
  assert.ok(Buffer.isBuffer(pngBuffer), 'Rasterized output must be a Buffer');
  assert.ok(pngBuffer.length > 5000, 'PNG buffer must have non-trivial size');
  // Check PNG signature: 89 50 4E 47 0D 0A 1A 0A
  assert.strictEqual(pngBuffer[0], 0x89);
  assert.strictEqual(pngBuffer[1], 0x50);
  assert.strictEqual(pngBuffer[2], 0x4e);
  assert.strictEqual(pngBuffer[3], 0x47);
});

test('Database Persistence - Custom Character CRUD & Duplication', async () => {
  const testId = `test-char-${randomUUID()}`;
  const customApp = CHARACTER_PRESETS['robot'].appearance;

  // 1. Create custom character with canonicalAppearance
  const created = await createCharacter({
    id: testId,
    name: `Test Robot Hero ${randomUUID().slice(0, 6)}`,
    species: 'Robot',
    personality: 'Curious and helpful',
    visualDescription: 'A shiny silver robot with cyan glowing eyes',
    distinctiveFeatures: 'Silver metal casing, blue visor',
    canonicalAppearance: customApp,
  });

  assert.ok(created, 'Character must be created');
  assert.strictEqual(created.species, 'Robot');
  assert.deepStrictEqual(created.canonicalAppearance, customApp);

  // 2. Fetch by ID
  const fetched = await getCharacterById(created.id);
  assert.ok(fetched);
  assert.deepStrictEqual(fetched.canonicalAppearance, customApp);

  // 3. Update character appearance
  const updatedApp = {
    ...customApp,
    head: { ...customApp.head, skinColor: '#64748b' },
  };
  const updated = await updateCharacter(created.id, {
    canonicalAppearance: updatedApp,
  });
  assert.deepStrictEqual(updated.canonicalAppearance, updatedApp);

  // 4. Clean up test character
  await deleteCharacter(created.id);
  const deletedCheck = await getCharacterById(created.id);
  assert.strictEqual(deletedCheck, null);
});

test('Database Persistence - Story Characters Linking & Unlinking', async () => {
  const testStoryId = `story-test-${randomUUID()}`;
  const testCharId = `char-link-test-${randomUUID()}`;

  // 1. Create temporary story
  await createStory({
    id: randomUUID(),
    storyId: testStoryId,
    title: 'Test Link Story',
    logline: 'A test story for character linking',
    lesson: 'Teamwork',
  });

  // 2. Create temporary character
  const character = await createCharacter({
    id: testCharId,
    name: `Link Hero ${randomUUID().slice(0, 6)}`,
    species: 'Human',
    personality: 'Friendly',
    visualDescription: 'Test hero for story linking',
    distinctiveFeatures: 'None',
  });

  try {
    // 3. Link character to story
    await linkStoryCharacter({
      id: randomUUID(),
      storyId: testStoryId,
      characterId: character.id,
    });

    let linked = await getCharactersByStoryId(testStoryId);
    assert.strictEqual(linked.length, 1);
    assert.strictEqual(linked[0].id, character.id);

    // 4. Unlink character
    await unlinkStoryCharacter(testStoryId, character.id);
    linked = await getCharactersByStoryId(testStoryId);
    assert.strictEqual(linked.length, 0);

    // 5. Set story characters in bulk
    await setStoryCharacters(testStoryId, [character.id]);
    linked = await getCharactersByStoryId(testStoryId);
    assert.strictEqual(linked.length, 1);

    // 6. Update story metadata without re-triggering AI
    await updateStoryMetadata(testStoryId, {
      title: 'Updated Test Title',
      genre: 'Adventure',
      audience: '4-7 years',
      targetDuration: 45000,
    });
    const updatedStory = await getStoryByStoryId(testStoryId);
    assert.strictEqual(updatedStory?.title, 'Updated Test Title');
    assert.strictEqual(updatedStory?.genre, 'Adventure');
    assert.strictEqual(updatedStory?.audience, '4-7 years');
    assert.strictEqual(updatedStory?.targetDuration, 45000);
  } finally {
    // Clean up temporary records safely
    await deleteStory(testStoryId);
    await deleteCharacter(character.id);
  }
});
