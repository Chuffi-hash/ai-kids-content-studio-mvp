import assert from 'node:assert/strict';
import test from 'node:test';
import { frames, validateManifest, type VideoManifest } from './manifest.js';
import { evaluateEasing, evaluateCharacterPose } from './characters/animation-evaluator.js';
import { getHeadShapesForPose } from './characters/face-renderer.js';
import { getVectorRig } from './characters/rigs.js';

const validManifest = (): VideoManifest => ({
  version: 1,
  fps: 30,
  width: 1280,
  height: 720,
  silentAudioSrc: 'silent.wav',
  scenes: [{
    id: 'scene-1',
    title: 'Opening',
    durationMs: 3000,
    frames: ['assets/scene-1/frame-000000.png'],
    audioTracks: [{
      src: 'assets/scene-1/narration.wav',
      startMs: 0,
      durationMs: 3000,
      volume: 1,
    }],
  }],
});

test('accepts a valid local-asset timeline manifest', () => {
  assert.equal(validateManifest(validManifest()).scenes.length, 1);
});

test('rejects paths that escape the Remotion public directory', () => {
  const manifest = validManifest();
  manifest.scenes[0].frames = ['../outside.png'];
  assert.throws(() => validateManifest(manifest), /Invalid image sequence/);
});

test('rejects absolute and remote media URLs', () => {
  const manifest = validManifest();
  manifest.scenes[0].audioTracks![0].src = 'https://example.com/audio.wav';
  assert.throws(() => validateManifest(manifest), /Invalid audio asset/);
});

test('rejects duplicate scene ids', () => {
  const manifest = validManifest();
  manifest.scenes.push({ ...manifest.scenes[0] });
  assert.throws(() => validateManifest(manifest), /unique/);
});

test('rejects invalid audio gain and frame rates', () => {
  const manifest = validManifest();
  manifest.scenes[0].audioTracks![0].volume = 1.5;
  assert.throws(() => validateManifest(manifest), /Invalid audio timing or volume/);
  manifest.scenes[0].audioTracks![0].volume = 1;
  manifest.fps = 120;
  assert.throws(() => validateManifest(manifest), /fps must be 1-60/);
});

test('converts millisecond durations to at least one frame', () => {
  assert.equal(frames(0, 30), 1);
  assert.equal(frames(1000, 30), 30);
});

test('evaluates motion path easing functions accurately', () => {
  assert.equal(evaluateEasing('linear', 0.5), 0.5);
  assert.equal(evaluateEasing('easeIn', 0.5), 0.25);
  assert.equal(evaluateEasing('ease-in', 0.5), 0.25);
  assert.equal(evaluateEasing('easeOut', 0.5), 0.75);
  assert.equal(evaluateEasing('ease-out', 0.5), 0.75);
  assert.equal(evaluateEasing('easeInOut', 0.5), 0.5);
  assert.equal(evaluateEasing('ease-in-out', 0.5), 0.5);
  assert.equal(evaluateEasing('smoothStep', 0.5), 0.5);
  assert.equal(evaluateEasing('smooth-step', 0.5), 0.5);
  assert.equal(evaluateEasing('unknown-bezier', 0.5), 0.5); // safe fallback
});

test('character pose evaluator preserves rotation and speaker state', () => {
  const pose = evaluateCharacterPose({
    instanceId: 'char-1',
    characterId: 'char-bear',
    name: 'Pip',
    x: 640,
    y: 360,
    scale: 1.2,
    rotation: 15,
    flipX: false,
    zIndex: 1,
    isSpeaker: true,
  });

  assert.equal(pose.rotation, 15);
  assert.equal(pose.scale, 1.2);
  assert.equal(pose.isSpeaker, true);
});

test('character pose evaluator preserves and clips facing direction', () => {
  const defaultPose = evaluateCharacterPose({
    instanceId: 'char-1',
    characterId: 'char-bear',
    name: 'Pip',
    x: 640,
    y: 360,
    scale: 1.0,
    zIndex: 1,
    facingDirection: 'back',
  });
  assert.equal(defaultPose.facingDirection, 'back');

  // Clip overrides instance facing direction
  const clipPose = evaluateCharacterPose(
    {
      instanceId: 'char-1',
      characterId: 'char-bear',
      name: 'Pip',
      x: 640,
      y: 360,
      scale: 1.0,
      zIndex: 1,
      facingDirection: 'front',
    },
    [
      {
        id: 'clip-1',
        instanceId: 'char-1',
        startMs: 0,
        durationMs: 2000,
        facingDirection: 'right',
      },
    ],
    500
  );
  assert.equal(clipPose.facingDirection, 'right');
});

test('back-facing characters NEVER render eyes, eyebrows, or mouth', () => {
  const rig = getVectorRig('char-bear');
  const frontPose = evaluateCharacterPose({
    instanceId: 'c1',
    characterId: 'char-bear',
    name: 'Pip',
    x: 640,
    y: 360,
    scale: 1.0,
    zIndex: 1,
    facingDirection: 'front',
  });
  const frontShapes = getHeadShapesForPose(rig, frontPose);
  const frontHasEyesOrMouth = frontShapes.some((s) => s.tag === 'eyes' || s.tag === 'mouth');
  assert.ok(frontHasEyesOrMouth, 'Front-facing character must render eyes or mouth');

  // Back facing
  const backPose = evaluateCharacterPose({
    instanceId: 'c1',
    characterId: 'char-bear',
    name: 'Pip',
    x: 640,
    y: 360,
    scale: 1.0,
    zIndex: 1,
    facingDirection: 'back',
  });
  const backShapes = getHeadShapesForPose(rig, backPose);
  const backHasForbiddenShapes = backShapes.some(
    (s) => s.tag === 'eyes' || s.tag === 'eyebrows' || s.tag === 'mouth' || s.tag === 'nose' || s.tag === 'pupils' || s.tag === 'viseme'
  );
  assert.strictEqual(backHasForbiddenShapes, false, 'Back-facing character must NEVER have front eyes, eyebrows, nose or mouth');

  // Side profile view (left)
  const leftPose = evaluateCharacterPose({
    instanceId: 'c1',
    characterId: 'char-bear',
    name: 'Pip',
    x: 640,
    y: 360,
    scale: 1.0,
    zIndex: 1,
    facingDirection: 'left',
  });
  const leftShapes = getHeadShapesForPose(rig, leftPose);
  const profileEye = leftShapes.find((s) => s.tag === 'eyes');
  assert.ok(profileEye, 'Profile view must include a profile eye shape');
});

test('validates timeline manifest multi-format resolutions', () => {
  const base = validManifest();
  // 16:9 Landscape
  base.width = 1920;
  base.height = 1080;
  base.format = '16:9';
  assert.doesNotThrow(() => validateManifest(base));

  // 9:16 Shorts / Reels
  const vertical = validManifest();
  vertical.width = 1080;
  vertical.height = 1920;
  vertical.format = '9:16';
  assert.doesNotThrow(() => validateManifest(vertical));

  // 1:1 Square
  const square = validManifest();
  square.width = 1080;
  square.height = 1080;
  square.format = '1:1';
  assert.doesNotThrow(() => validateManifest(square));

  // 4:5 Portrait
  const portrait = validManifest();
  portrait.width = 1080;
  portrait.height = 1350;
  portrait.format = '4:5';
  assert.doesNotThrow(() => validateManifest(portrait));
});
