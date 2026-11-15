import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateResolvedBrandingPlacement,
  getCompositionDimensions,
  screenToComposition,
  compositionToScreen,
  SharedChannelBrandingConfig,
  AspectRatioFormat,
} from '../src/services/branding/sharedCompositionCoordinates';
import {
  calculateResponsiveCharacterPlacement,
  applyCharacterTransform,
  resetCharacterToAutoLayout,
  getCanvasDimensions,
} from '../../frontend/src/utils/characterPlacementEngine';
import { resolveDirectionalRig } from '../../frontend/src/utils/directionalRigResolver';
import { getVectorRig } from '../../frontend/src/assets/characters/defaultCharacters';
import { VectorSceneData, CharacterInstance } from '../../frontend/src/types/animation';

test('PART A: Character Transform, Auto-Layout & Directional Parity', async (t) => {
  const baseAnimationData: VectorSceneData = {
    characterInstances: [
      {
        instanceId: 'inst-pip',
        characterId: 'char-pip',
        name: 'Pip the Bear',
        x: 400,
        y: 480,
        scale: 1.0,
        rotation: 0,
        facingDirection: 'front',
        flipX: false,
        zIndex: 1,
      },
      {
        instanceId: 'inst-sammy',
        characterId: 'char-sammy',
        name: 'Sammy the Kid',
        x: 880,
        y: 480,
        scale: 1.0,
        rotation: 0,
        facingDirection: 'front',
        flipX: false,
        zIndex: 2,
      },
    ],
    animationClips: [
      {
        clipId: 'clip-1',
        instanceId: 'inst-pip',
        action: 'walk',
        startMs: 0,
        durationMs: 5000,
        motionMode: 'motion_path',
        motionPath: {
          startX: 400,
          startY: 480,
          endX: 600,
          endY: 480,
        },
      },
    ],
  };

  await t.test('1. Inspector X/Y changes & Canvas dragging in 16:9 canonical base', () => {
    const updated = applyCharacterTransform({
      animationData: baseAnimationData,
      instanceId: 'inst-pip',
      updates: { x: 450, y: 500 },
      format: '16:9',
    });

    const inst = updated.characterInstances.find((i) => i.instanceId === 'inst-pip');
    assert.equal(inst?.x, 450);
    assert.equal(inst?.y, 500);

    // Motion path shifted proportionally by dx = 50, dy = 20
    const clip = updated.animationClips?.find((c) => c.instanceId === 'inst-pip');
    assert.equal(clip?.motionPath?.startX, 450);
    assert.equal(clip?.motionPath?.startY, 500);
    assert.equal(clip?.motionPath?.endX, 650);
    assert.equal(clip?.motionPath?.endY, 500);
  });

  await t.test('2. Format-Specific Overrides - 9:16, 1:1, 4:5 maintain independent placement without mutating 16:9', () => {
    let animData = baseAnimationData;

    // Move in 9:16
    animData = applyCharacterTransform({
      animationData: animData,
      instanceId: 'inst-pip',
      updates: { x: 220, y: 800, scale: 1.2 },
      format: '9:16',
    });

    // Move in 1:1
    animData = applyCharacterTransform({
      animationData: animData,
      instanceId: 'inst-pip',
      updates: { x: 300, y: 550, scale: 0.9 },
      format: '1:1',
    });

    // Verify 16:9 canonical base is UNTOUCHED
    const basePip = animData.characterInstances.find((i) => i.instanceId === 'inst-pip');
    assert.equal(basePip?.x, 400);
    assert.equal(basePip?.y, 480);
    assert.equal(basePip?.scale, 1.0);

    // Verify 9:16 override
    const override916 = animData.formatVariants?.['9:16']?.characterOverrides?.['inst-pip'];
    assert.equal(override916?.x, 220);
    assert.equal(override916?.y, 800);
    assert.equal(override916?.scale, 1.2);

    // Verify 1:1 override
    const override11 = animData.formatVariants?.['1:1']?.characterOverrides?.['inst-pip'];
    assert.equal(override11?.x, 300);
    assert.equal(override11?.y, 550);
    assert.equal(override11?.scale, 0.9);
  });

  await t.test('3. Reset to Auto Layout restores responsive placement without clobbering other characters', () => {
    let animData = applyCharacterTransform({
      animationData: baseAnimationData,
      instanceId: 'inst-pip',
      updates: { x: 220, y: 800 },
      format: '9:16',
    });

    assert.ok(animData.formatVariants?.['9:16']?.characterOverrides?.['inst-pip']);

    const reset = resetCharacterToAutoLayout({
      animationData: animData,
      instanceId: 'inst-pip',
      format: '9:16',
    });

    assert.equal(reset.formatVariants?.['9:16']?.characterOverrides?.['inst-pip'], undefined);
  });

  await t.test('4. Eight-way facing directions produce genuine directional artwork changes', () => {
    const rig = getVectorRig('char-pip');
    const directions = ['front', 'front-left', 'front-right', 'left', 'right', 'back-left', 'back-right', 'back'] as const;

    directions.forEach((facing) => {
      const resolved = resolveDirectionalRig(rig, {
        x: 640,
        y: 480,
        scale: 1.0,
        rotation: 0,
        facingDirection: facing,
        torsoAngle: 0,
        torsoBobY: 0,
        chestScaleY: 1.0,
        headAngle: 0,
        leftArmAngle: 0,
        rightArmAngle: 0,
        leftForearmAngle: 0,
        rightForearmAngle: 0,
        leftLegAngle: 0,
        rightLegAngle: 0,
      });

      if (facing === 'back') {
        // Back view: NO eyes, eyebrows, nose, mouth, visemes
        const hasEyes = resolved.headShapes.some((s) => s.tag === 'eyes' || s.tag === 'mouth' || s.tag === 'nose');
        assert.equal(hasEyes, false, 'Back view must have no eyes, mouth or nose');
        assert.ok(resolved.tailShapes && resolved.tailShapes.length > 0, 'Back view has tail');
      } else if (facing === 'left' || facing === 'right') {
        // Profile view: profile eye shapes present
        const eyeShapes = resolved.headShapes.filter((s) => s.tag === 'eyes');
        assert.ok(eyeShapes.length > 0 && eyeShapes.length <= 2, 'Profile view has profile eye');
      } else if (facing === 'front') {
        // Front view: both eyes visible (pupils + highlights = 4 shapes)
        const eyeShapes = resolved.headShapes.filter((s) => s.tag === 'eyes');
        assert.equal(eyeShapes.length, 4, 'Front view has both eyes (pupils + highlights)');
      }
    });
  });

  await t.test('5. Dynamic multi-character placement avoids overlap & respects safe margins', () => {
    const placed = calculateResponsiveCharacterPlacement({
      instances: baseAnimationData.characterInstances,
      format: '9:16',
      canvasWidth: 720,
      canvasHeight: 1280,
    });

    assert.equal(placed.length, 2);
    // Two characters are separated with adequate horizontal distance
    const dist = Math.abs(placed[1].x - placed[0].x);
    assert.ok(dist >= 200, `Distance between characters is ${dist}px, expected >= 200px`);
    // Both characters rest on the ground contact zone
    assert.ok(placed[0].y > 800, 'Character 0 is anchored to lower ground zone');
    assert.ok(placed[1].y > 800, 'Character 1 is anchored to lower ground zone');
  });
});

test('PART B: Shared Branding Placement & Remotion Consistency', async (t) => {
  const sampleBranding: SharedChannelBrandingConfig = {
    enabled: true,
    logoUrl: 'http://localhost:5001/storage/branding/logo.png',
    position: 'bottom-right',
    width: 140,
    height: 50,
    padding: 24,
    opacity: 0.9,
    channelName: 'test',
    showChannelName: false, // Default is false: "test" must NOT appear
    showSocialHandle: false,
    formatPresets: {
      '16:9': {
        position: 'bottom-right',
        width: 140,
        height: 50,
        padding: 28,
      },
      '9:16': {
        position: 'bottom-right',
        width: 110,
        height: 42,
        padding: 36,
      },
      '1:1': {
        position: 'top-right',
        width: 120,
        height: 45,
        padding: 24,
      },
      '4:5': {
        position: 'top-left',
        width: 120,
        height: 45,
        padding: 26,
      },
    },
  };

  await t.test('1. Bottom-right position calculation in Editor Preview (854x480) vs Remotion 1080p (1920x1080)', () => {
    // Editor Preview container
    const preview = calculateResolvedBrandingPlacement({
      branding: sampleBranding,
      format: '16:9',
      containerWidth: 854,
      containerHeight: 480,
    });

    // Remotion 1080p Output
    const remotion = calculateResolvedBrandingPlacement({
      branding: sampleBranding,
      format: '16:9',
      containerWidth: 1920,
      containerHeight: 1080,
    });

    assert.equal(preview.visible, true);
    assert.equal(remotion.visible, true);

    // Relative position from bottom-right must match proportionally
    const previewRightMargin = 854 - (preview.x + preview.width);
    const previewBottomMargin = 480 - (preview.y + preview.height);
    const remotionRightMargin = 1920 - (remotion.x + remotion.width);
    const remotionBottomMargin = 1080 - (remotion.y + remotion.height);

    // Margins scale cleanly with container width/height
    const expectedRatio = 1920 / 854;
    assert.ok(Math.abs(remotionRightMargin / previewRightMargin - expectedRatio) < 0.2);
    assert.ok(Math.abs(remotionBottomMargin / previewBottomMargin - expectedRatio) < 0.2);

    // Crucially: Logo is at the BOTTOM-RIGHT in both, NOT floating in middle-right
    assert.ok(preview.y > 400, 'Preview logo is near bottom');
    assert.ok(preview.x > 700, 'Preview logo is near right');
    assert.ok(remotion.y > 900, 'Remotion logo is near bottom (y > 900 in 1080p)');
    assert.ok(remotion.x > 1650, 'Remotion logo is near right (x > 1650 in 1920p)');
  });

  await t.test('2. Unexpected "test" text is NOT shown unless showChannelName is explicitly true', () => {
    // When showChannelName is false (default)
    const hidden = calculateResolvedBrandingPlacement({
      branding: sampleBranding,
      format: '16:9',
      containerWidth: 1920,
      containerHeight: 1080,
    });
    assert.equal(hidden.showChannelName, false);
    assert.equal(hidden.channelName, undefined);

    // When showChannelName is explicitly enabled
    const visible = calculateResolvedBrandingPlacement({
      branding: { ...sampleBranding, showChannelName: true },
      format: '16:9',
      containerWidth: 1920,
      containerHeight: 1080,
    });
    assert.equal(visible.showChannelName, true);
    assert.equal(visible.channelName, 'test');
  });

  await t.test('3. Custom dragging coordinates via normalized [0.0 - 1.0] coordinates produce identical relative placement', () => {
    // User drags logo to bottom right: normalizedX = 0.88, normalizedY = 0.90
    const customBranding: SharedChannelBrandingConfig = {
      ...sampleBranding,
      formatPresets: {
        '16:9': {
          position: 'custom',
          normalizedX: 0.88,
          normalizedY: 0.90,
          width: 140,
          height: 50,
        },
      },
    };

    const preview = calculateResolvedBrandingPlacement({
      branding: customBranding,
      format: '16:9',
      containerWidth: 854,
      containerHeight: 480,
    });

    const remotion = calculateResolvedBrandingPlacement({
      branding: customBranding,
      format: '16:9',
      containerWidth: 1920,
      containerHeight: 1080,
    });

    // Fraction of width and height is identical
    const previewFracX = preview.x / 854;
    const previewFracY = preview.y / 480;
    const remotionFracX = remotion.x / 1920;
    const remotionFracY = remotion.y / 1080;

    assert.ok(Math.abs(previewFracX - remotionFracX) < 0.01, 'X fractions match');
    assert.ok(Math.abs(previewFracY - remotionFracY) < 0.01, 'Y fractions match');
  });

  await t.test('4. All 4 formats support independent positioning presets', () => {
    const formats: AspectRatioFormat[] = ['16:9', '9:16', '1:1', '4:5'];
    formats.forEach((fmt) => {
      const dims = getCompositionDimensions(fmt, '1080p');
      const placement = calculateResolvedBrandingPlacement({
        branding: sampleBranding,
        format: fmt,
        containerWidth: dims.width,
        containerHeight: dims.height,
      });

      assert.equal(placement.visible, true);
      assert.ok(placement.width > 0);
      assert.ok(placement.height > 0);
      assert.ok(placement.x >= 0 && placement.x + placement.width <= dims.width);
      assert.ok(placement.y >= 0 && placement.y + placement.height <= dims.height);
    });
  });

  await t.test('5. Timing visibility restricts logo outside active time window', () => {
    const timedBranding: SharedChannelBrandingConfig = {
      ...sampleBranding,
      alwaysVisible: false,
      startTimeMs: 2000,
      endTimeMs: 8000,
    };

    // At 1000ms: not yet visible
    const before = calculateResolvedBrandingPlacement({
      branding: timedBranding,
      format: '16:9',
      containerWidth: 1920,
      containerHeight: 1080,
      currentTimeMs: 1000,
    });
    assert.equal(before.visible, false);

    // At 5000ms: visible
    const during = calculateResolvedBrandingPlacement({
      branding: timedBranding,
      format: '16:9',
      containerWidth: 1920,
      containerHeight: 1080,
      currentTimeMs: 5000,
    });
    assert.equal(during.visible, true);

    // At 9000ms: hidden
    const after = calculateResolvedBrandingPlacement({
      branding: timedBranding,
      format: '16:9',
      containerWidth: 1920,
      containerHeight: 1080,
      currentTimeMs: 9000,
    });
    assert.equal(after.visible, false);
  });
});
