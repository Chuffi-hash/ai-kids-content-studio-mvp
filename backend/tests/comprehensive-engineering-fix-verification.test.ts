import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAuthoritativeSpeechSchedule,
  INITIAL_PAUSE_MS,
  SPEECH_GAP_MS,
} from '../src/services/audio-generation/speech-schedule.types.js';
import { sanitizeErrorMessage } from '../src/services/audio-generation/audio-generation.service.js';
import {
  calculateResponsiveCharacterPlacement,
} from '../../remotion/src/characters/placement-engine.js';
import {
  resetCharacterToAutoLayout,
} from '../../frontend/src/utils/characterPlacementEngine.js';
import {
  verifyImageMagicBytes,
  sanitizeSvg,
  BrandingService,
} from '../src/services/branding/branding.service.js';
import { evaluateCharacterPose } from '../../remotion/src/characters/animation-evaluator.js';
import { calculateAuthoritativeSpeechSchedule as remotionSpeechSchedule } from '../../remotion/src/speech-schedule.js';

test('1. Authoritative Speech Schedule parity and non-overlapping calculation', () => {
  assert.equal(INITIAL_PAUSE_MS, 250, 'Initial pause must be 250ms');
  assert.equal(SPEECH_GAP_MS, 350, 'Speech gap must be 350ms');

  const schedule = calculateAuthoritativeSpeechSchedule({
    narration: {
      text: 'Welcome to the magical enchanted forest.',
      durationMs: 3000,
    },
    dialogues: [
      {
        id: 'dlg-1',
        characterId: 'char-pip',
        characterName: 'Pip',
        text: 'Look at the glowing flowers!',
        durationMs: 2000,
      },
      {
        id: 'dlg-2',
        characterId: 'char-sammy',
        characterName: 'Sammy',
        text: 'They shine so brightly!',
        durationMs: 1500,
      },
    ],
  });

  // Narration starts at INITIAL_PAUSE_MS = 250ms, ends at 250 + 3000 = 3250ms
  assert.equal(schedule.narrationStartMs, 250);
  assert.equal(schedule.narrationDurationMs, 3000);
  const narrItem = schedule.items.find((i) => i.id === 'narration');
  assert.ok(narrItem);
  assert.equal(narrItem.startMs, 250);
  assert.equal(narrItem.endMs, 3250);

  // dlg-1 starts at narrEndMs (3250) + SPEECH_GAP_MS (350) = 3600ms, ends at 3600 + 2000 = 5600ms
  const dlg1 = schedule.items.find((i) => i.id === 'dlg-1');
  assert.ok(dlg1);
  assert.equal(dlg1.startMs, 3600);
  assert.equal(dlg1.endMs, 5600);

  // dlg-2 starts at dlg1.endMs (5600) + SPEECH_GAP_MS (350) = 5950ms, ends at 5950 + 1500 = 7450ms
  const dlg2 = schedule.items.find((i) => i.id === 'dlg-2');
  assert.ok(dlg2);
  assert.equal(dlg2.startMs, 5950);
  assert.equal(dlg2.endMs, 7450);

  assert.equal(schedule.hasUnintendedOverlap, false);
  assert.equal(schedule.overlaps.length, 0);
  assert.equal(schedule.totalSpeechDurationMs, 7450);

  // Verify Remotion calculation parity
  const remotionCalc = remotionSpeechSchedule({
    narration: { text: 'Welcome', durationMs: 3000 },
    dialogues: [
      { id: 'dlg-1', durationMs: 2000 },
      { id: 'dlg-2', durationMs: 1500 },
    ],
  });
  assert.equal(remotionCalc.narrationStartMs, schedule.narrationStartMs);
  assert.equal(remotionCalc.items[1].startMs, dlg1.startMs);
  assert.equal(remotionCalc.items[2].startMs, dlg2.startMs);
});

test('2. Intentional simultaneous speech vs unintended collision detection', () => {
  // Unintended overlap: user manually dragged dlg-2 to overlap with dlg-1 without allowSimultaneous
  const collidingSchedule = calculateAuthoritativeSpeechSchedule({
    narration: null,
    dialogues: [
      { id: 'd1', characterName: 'Pip', durationMs: 3000, startMs: 250 },
      { id: 'd2', characterName: 'Sammy', durationMs: 3000, startMs: 1000, allowSimultaneous: false },
    ],
  });
  // Without allowSimultaneous, sequential positioning prevents collision:
  assert.equal(collidingSchedule.hasUnintendedOverlap, false);
  assert.equal(collidingSchedule.items[1].startMs, 250 + 3000 + 350);

  // Intentional overlap: allowSimultaneous = true
  const simultaneousSchedule = calculateAuthoritativeSpeechSchedule({
    narration: null,
    dialogues: [
      { id: 'd1', characterName: 'Pip', durationMs: 3000, startMs: 250 },
      { id: 'd2', characterName: 'Sammy', durationMs: 2000, startMs: 500, allowSimultaneous: true },
    ],
  });
  assert.equal(simultaneousSchedule.items[1].startMs, 500);
  assert.equal(simultaneousSchedule.overlaps.length, 1);
  assert.equal(simultaneousSchedule.overlaps[0].isIntentional, true);
  assert.equal(simultaneousSchedule.hasUnintendedOverlap, false);
});

test('3. API key redaction in sanitized error messages', () => {
  const dirtyMsg1 = 'Fish Audio error: Bearer fish_live_abcdef1234567890abcdef1234567890 rejected';
  const clean1 = sanitizeErrorMessage(dirtyMsg1);
  assert.ok(!clean1.includes('fish_live_'), 'API key must be redacted');
  assert.ok(clean1.includes('[REDACTED]') || clean1.includes('[HASH_REDACTED]'));

  const dirtyMsg2 = 'Failed request with key="sk-1234567890abcdef1234567890abcdef"';
  const clean2 = sanitizeErrorMessage(dirtyMsg2);
  assert.ok(!clean2.includes('sk-1234567890'), 'Secret must be redacted');
});

test('4. Character transform manual override detection (rotation, flipX, zIndex)', () => {
  const instances = [
    {
      instanceId: 'inst-1',
      characterId: 'pip',
      name: 'Pip',
      x: 300,
      y: 480,
      scale: 1.0,
      facingDirection: 'front' as const,
    },
    {
      instanceId: 'inst-2',
      characterId: 'sammy',
      name: 'Sammy',
      x: 800,
      y: 480,
      scale: 1.0,
      facingDirection: 'front' as const,
    },
  ];

  // Override ONLY rotation and flipX on inst-1 for vertical 9:16
  const formatVariants = {
    '9:16': {
      characterOverrides: {
        'inst-1': {
          rotation: 15,
          flipX: true,
          zIndex: 10,
        },
      },
    },
  };

  const placed916 = calculateResponsiveCharacterPlacement({
    instances,
    format: '9:16',
    canvasWidth: 1080,
    canvasHeight: 1920,
    formatVariants: formatVariants as any,
  });

  const placedPip = placed916.find((p) => p.instanceId === 'inst-1');
  assert.ok(placedPip);
  assert.equal(placedPip.isOverridden, true, 'inst-1 must be marked overridden even if only rotation/flipX/zIndex are set');
  assert.equal(placedPip.rotation, 15);
  assert.equal(placedPip.flipX, true);
  assert.equal(placedPip.zIndex, 10);

  // inst-2 has no overrides and should be auto-placed cleanly
  const placedSammy = placed916.find((p) => p.instanceId === 'inst-2');
  assert.ok(placedSammy);
  assert.equal(placedSammy.isAutoPlaced, true);
});

test('5. Reset character to auto layout in 9:16 and 16:9', () => {
  const animData: any = {
    version: 1,
    characterInstances: [
      { instanceId: 'pip', characterId: 'pip', name: 'Pip', x: 400, y: 500, scale: 1.2, rotation: 10 },
    ],
    formatVariants: {
      '9:16': {
        characterOverrides: {
          pip: { x: 500, y: 1200, scale: 1.5, rotation: 20 },
        },
      },
    },
  };

  // Reset 9:16 override
  const reset916 = resetCharacterToAutoLayout({
    animationData: animData,
    instanceId: 'pip',
    format: '9:16',
  });
  assert.equal(reset916.formatVariants?.['9:16']?.characterOverrides?.['pip'], undefined, '9:16 override must be removed');
  assert.equal(reset916.characterInstances[0].rotation, 10, '16:9 base instance must remain untouched');

  // Reset 16:9 base
  const reset169 = resetCharacterToAutoLayout({
    animationData: animData,
    instanceId: 'pip',
    format: '16:9',
  });
  assert.equal(reset169.characterInstances[0].rotation, 0);
  assert.equal(reset169.characterInstances[0].scale, 1.0);
  assert.equal(reset169.characterInstances[0].y, 480);
});

test('6. Channel branding security validations and magic byte checking', async () => {
  const brandingService = new BrandingService();

  // Test 1: storyId path traversal injection rejection
  await assert.rejects(
    async () => {
      await brandingService.uploadBrandingAsset({
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        originalFilename: 'logo.png',
        mimeType: 'image/png',
        assetType: 'logo',
        storyId: '../traversal/attack',
      });
    },
    /illegal characters|path traversal/i,
    'Must reject path traversal storyId'
  );

  // Test 2: AssetType whitelist rejection
  await assert.rejects(
    async () => {
      await brandingService.uploadBrandingAsset({
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        originalFilename: 'logo.png',
        mimeType: 'image/png',
        assetType: 'malicious_shell' as any,
      });
    },
    /Invalid assetType/i,
    'Must reject unwhitelisted assetType'
  );

  // Test 3: Extension and MIME mismatch rejection
  await assert.rejects(
    async () => {
      await brandingService.uploadBrandingAsset({
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        originalFilename: 'logo.jpg',
        mimeType: 'image/png',
      });
    },
    /does not match file extension/i,
    'Must reject mismatched extension and MIME'
  );

  // Test 4: Magic byte verification on fake content
  assert.equal(verifyImageMagicBytes(Buffer.from('not an image at all'), 'png'), false);
  assert.equal(verifyImageMagicBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'png'), true);
  assert.equal(verifyImageMagicBytes(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'jpg'), true);

  // Test 5: SVG sanitization stripping <script> and onload handlers
  const maliciousSvg = `<svg xmlns="http://www.w3.org/2000/svg" onload="alert('xss')">
    <script>alert('pwned')</script>
    <circle cx="50" cy="50" r="40" fill="red" />
  </svg>`;
  const sanitized = sanitizeSvg(maliciousSvg);
  assert.ok(!sanitized.includes('<script>'), 'Must strip <script> tag');
  assert.ok(!sanitized.includes('onload='), 'Must strip onload attribute');
  assert.ok(sanitized.includes('<circle'), 'Must preserve valid SVG shapes');
});

test('7. Animation evaluator preserves explicit fallback action over ambient idle', () => {
  // Test character with explicit instance action 'wave' while ambient idle clip is active
  const result = evaluateCharacterPose(
    {
      instanceId: 'inst-sammy',
      characterId: 'sammy',
      action: 'wave',
      x: 640,
      y: 480,
      scale: 1.0,
      facingDirection: 'front',
    } as any,
    [
      {
        id: 'clip-idle',
        instanceId: 'inst-sammy',
        action: 'idle',
        startMs: 0,
        durationMs: 10000,
        loop: true,
      } as any,
    ],
    1500
  );

  assert.equal(result.activeAction, 'wave', 'Explicit instance action must not be overwritten by ambient idle clip');
  assert.ok(result.leftArmAngle !== 0 || result.rightArmAngle !== 0, 'Wave action angles should be evaluated');
});
