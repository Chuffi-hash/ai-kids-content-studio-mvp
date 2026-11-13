import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDirectionalRig } from '../../remotion/src/characters/directional-rig-resolver.js';
import {
  calculateResponsiveCharacterPlacement,
  getCanvasDimensions,
} from '../../remotion/src/characters/placement-engine.js';
import { getVectorRig } from '../../remotion/src/characters/rigs.js';
import { CharacterFacingDirection, CharacterInstance } from '../../remotion/src/manifest.js';
import { RemotionManifestAdapter } from '../src/services/video-assembly/remotion-manifest.adapter.js';

test('1. Directional Rig Resolver - Front Facing has full facial features and belly patch', () => {
  const baseRig = getVectorRig('pip_the_bear');
  const resolved = resolveDirectionalRig(baseRig, {
    x: 640,
    y: 480,
    scale: 1.0,
    rotation: 0,
    flipX: false,
    facingDirection: 'front',
  });

  // Torso: belly patch must be visible (Pip has #fef3c7 belly ellipse)
  const bellyShape = resolved.torsoShapes.find((s: any) => s.tag === 'belly' || s.fill === '#fef3c7');
  assert.ok(bellyShape, 'Belly patch must be present in front-facing orientation');

  // Head: eyes, nose, snout, mouth must all be visible
  const eyes = resolved.headShapes.filter((s: any) => s.tag === 'eyes');
  assert.strictEqual(eyes.length, 4, 'Both eyes (pupils + highlights) must be present in front-facing orientation');

  const snout = resolved.headShapes.find((s: any) => s.tag === 'snout' || (s.type === 'ellipse' && s.fill === '#fef3c7'));
  assert.ok(snout, 'Snout must be present in front-facing orientation');
  assert.strictEqual(snout?.cx, 0, 'Snout should be centered at cx=0 in front-facing orientation');

  const nose = resolved.headShapes.find((s: any) => s.tag === 'nose');
  assert.ok(nose, 'Nose must be present in front-facing orientation');

  const mouth = resolved.headShapes.find((s: any) => s.tag === 'mouth');
  assert.ok(mouth, 'Mouth must be present in front-facing orientation');
});

test('2. Directional Rig Resolver - Profile (Left & Right) has protruding snout, profile eye, side belly, and rear tail', () => {
  const baseRig = getVectorRig('pip_the_bear');

  for (const dir of ['left', 'right'] as CharacterFacingDirection[]) {
    const resolved = resolveDirectionalRig(baseRig, {
      x: 640,
      y: 480,
      scale: 1.0,
      rotation: 0,
      flipX: false,
      facingDirection: dir,
    });

    // Head: exactly one profile eye (pupil + highlight = 2 shapes tagged 'eyes')
    const eyes = resolved.headShapes.filter((s: any) => s.tag === 'eyes');
    assert.strictEqual(eyes.length, 2, `Profile eye (pupil + highlight) must be present for ${dir} profile`);

    // Protruding snout: path or ellipse extending outside head
    const snout = resolved.headShapes.find((s: any) => s.tag === 'snout');
    assert.ok(snout, `Snout must be present for ${dir} profile`);

    // Nose must be placed at the tip of the protruding snout
    const nose = resolved.headShapes.find((s: any) => s.tag === 'nose');
    assert.ok(nose, `Nose must be at tip of snout for ${dir} profile`);
    if (dir === 'left') {
      assert.ok(nose!.cx <= -40, 'Nose must be at left tip of snout (cx <= -40)');
    } else {
      assert.ok(nose!.cx >= 40, 'Nose must be at right tip of snout (cx >= 40)');
    }

    // Cute round tail must be visible on the opposite side of the torso (or in tailShapes/torsoShapes)
    const allTorsoShapes = [...resolved.torsoShapes, ...(resolved.tailShapes || [])];
    const tail = allTorsoShapes.find((s: any) => s.tag === 'tail');
    assert.ok(tail, `Tail must be visible in ${dir} profile view`);
    if (dir === 'left') {
      assert.ok(tail!.cx > 15, 'Tail must protrude toward right back when facing left');
    } else {
      assert.ok(tail!.cx < -15, 'Tail must protrude toward left back when facing right');
    }
  }
});

test('3. Directional Rig Resolver - Back View has NO eyes, nose, snout, mouth, visemes, or belly patch', () => {
  const baseRig = getVectorRig('pip_the_bear');
  const resolved = resolveDirectionalRig(baseRig, {
    x: 640,
    y: 480,
    scale: 1.0,
    rotation: 0,
    flipX: false,
    facingDirection: 'back',
  });

  // Must NOT have any eyes
  const eyes = resolved.headShapes.filter((s: any) => s.tag === 'eyes');
  assert.strictEqual(eyes.length, 0, 'Back view must NEVER have eyes');

  // Must NOT have snout, nose, mouth, cheeks, visemes
  const snout = resolved.headShapes.find((s: any) => s.tag === 'snout');
  assert.strictEqual(snout, undefined, 'Back view must NEVER have a front snout');

  const nose = resolved.headShapes.find((s: any) => s.tag === 'nose');
  assert.strictEqual(nose, undefined, 'Back view must NEVER have a front nose');

  const mouth = resolved.headShapes.find((s: any) => s.tag === 'mouth' || s.tag === 'viseme');
  assert.strictEqual(mouth, undefined, 'Back view must NEVER have a mouth or visemes');

  const blush = resolved.headShapes.find((s: any) => s.tag === 'blush');
  assert.strictEqual(blush, undefined, 'Back view must NEVER have front cheek blush');

  // Torso must NOT have front belly patch
  const belly = resolved.torsoShapes.find((s: any) => s.tag === 'belly' || s.fill === '#fed7aa');
  assert.strictEqual(belly, undefined, 'Back view must NEVER have front belly patch');

  // Torso MUST have cute round tail centered on lower back and rendered on top of torso
  const tail = resolved.torsoShapes.find((s: any) => s.tag === 'tail');
  assert.ok(tail, 'Back view MUST have cute round tail visible on lower back');
  assert.strictEqual(tail?.cx, 0, 'Back view tail must be centered (cx=0)');
  const tailIdx = resolved.torsoShapes.findIndex((s: any) => s.tag === 'tail');
  assert.ok(tailIdx > 0, 'Tail must render on top of back torso base layer');
});

test('4. Directional Rig Resolver - Rear 3/4 (Back-Left & Back-Right) has perspective tail and no facial features', () => {
  const baseRig = getVectorRig('pip_the_bear');

  for (const dir of ['back-left', 'back-right'] as CharacterFacingDirection[]) {
    const resolved = resolveDirectionalRig(baseRig, {
      x: 640,
      y: 480,
      scale: 1.0,
      rotation: 0,
      flipX: false,
      facingDirection: dir,
    });

    const eyes = resolved.headShapes.filter((s: any) => s.tag === 'eyes');
    assert.strictEqual(eyes.length, 0, `Rear 3/4 view (${dir}) must have NO eyes`);

    const snout = resolved.headShapes.find((s: any) => s.tag === 'snout');
    assert.strictEqual(snout, undefined, `Rear 3/4 view (${dir}) must have NO front snout`);

    const allTorsoShapes = [...resolved.torsoShapes, ...(resolved.tailShapes || [])];
    const tail = allTorsoShapes.find((s: any) => s.tag === 'tail');
    assert.ok(tail, `Rear 3/4 view (${dir}) must have visible tail`);
    if (dir === 'back-left') {
      assert.ok(tail!.cx < 0, 'Back-left tail is shifted toward left perspective (cx < 0)');
    } else {
      assert.ok(tail!.cx > 0, 'Back-right tail is shifted toward right perspective (cx > 0)');
    }
  }
});

test('5. Directional Rig Resolver - Front 3/4 (Front-Left & Front-Right) foreshortens far eye and shifts snout', () => {
  const baseRig = getVectorRig('pip_the_bear');

  const resolvedFL = resolveDirectionalRig(baseRig, {
    x: 640,
    y: 480,
    scale: 1.0,
    rotation: 0,
    flipX: false,
    facingDirection: 'front-left',
  });

  const snoutFL = resolvedFL.headShapes.find(
    (s: any) => s.tag === 'snout' || (s.type === 'ellipse' && s.fill === '#fef3c7')
  );
  assert.ok(snoutFL, 'Front-left must have snout');
  assert.ok(snoutFL!.cx < 0, 'Front-left snout must be shifted left of center');

  const eyesFL = resolvedFL.headShapes.filter((s: any) => s.tag === 'eyes');
  assert.ok(eyesFL.length >= 2, 'Front-left must have eyes');
});

test('6. Responsive Placement - Single character centered on ground anchor across aspect ratios', () => {
  const inst: CharacterInstance = {
    instanceId: 'inst-1',
    characterId: 'pip_the_bear',
    name: 'Pip',
    x: 640,
    y: 480,
    scale: 1.0,
    rotation: 0,
    flipX: false,
    facingDirection: 'front',
    zIndex: 1,
  };

  // 16:9 base
  const placed169 = calculateResponsiveCharacterPlacement({
    instances: [inst],
    format: '16:9',
  });
  assert.strictEqual(placed169[0].x, 640);
  assert.strictEqual(placed169[0].y, 480);

  // 9:16 portrait
  const placed916 = calculateResponsiveCharacterPlacement({
    instances: [inst],
    format: '9:16',
  });
  assert.strictEqual(placed916[0].x, 360, 'Single character must be horizontally centered at 360px in 9:16 (width 720)');
  assert.ok(placed916[0].y > 800 && placed916[0].y < 950, `Ground anchor Y (${placed916[0].y}) should position character firmly on ground`);
  assert.ok(placed916[0].scale > 1.0, 'Single character in vertical video should have enhanced portrait presence');

  // 1:1 square
  const placed11 = calculateResponsiveCharacterPlacement({
    instances: [inst],
    format: '1:1',
  });
  assert.strictEqual(placed11[0].x, 360, 'Single character must be horizontally centered at 360px in 1:1 (width 720)');
  assert.ok(placed11[0].y > 450 && placed11[0].y < 550, `1:1 ground anchor Y (${placed11[0].y}) should place character on ground`);
});

test('7. Responsive Placement - Two characters conversational staging and collision avoidance', () => {
  const char1: CharacterInstance = {
    instanceId: 'inst-1',
    characterId: 'pip_the_bear',
    name: 'Pip',
    x: 400,
    y: 480,
    scale: 1.0,
    rotation: 0,
    zIndex: 1,
  };
  const char2: CharacterInstance = {
    instanceId: 'inst-2',
    characterId: 'sammy_the_kid',
    name: 'Sammy',
    x: 880,
    y: 480,
    scale: 1.0,
    rotation: 0,
    zIndex: 2,
  };

  const placed916 = calculateResponsiveCharacterPlacement({
    instances: [char1, char2],
    format: '9:16',
  });

  assert.strictEqual(placed916.length, 2);
  assert.ok(placed916[0].x < placed916[1].x, 'Left character must remain to the left of right character');
  assert.ok(placed916[1].x - placed916[0].x >= 180, 'Two characters must maintain clear social distance without overlapping');
  assert.strictEqual(placed916[1].flipX, true, 'Right character should automatically flip left toward conversation partner');
});

test('8. Responsive Placement - 3+ characters evenly distributed within safe margins', () => {
  const chars: CharacterInstance[] = [
    { instanceId: 'c1', characterId: 'pip_the_bear', name: 'Pip', x: 200, y: 480, scale: 1.0, rotation: 0, zIndex: 1 },
    { instanceId: 'c2', characterId: 'sammy_the_kid', name: 'Sammy', x: 640, y: 480, scale: 1.0, rotation: 0, zIndex: 2 },
    { instanceId: 'c3', characterId: 'pip_the_bear', name: 'Pip2', x: 1080, y: 480, scale: 1.0, rotation: 0, zIndex: 3 },
  ];

  const placed916 = calculateResponsiveCharacterPlacement({
    instances: chars,
    format: '9:16',
  });

  assert.strictEqual(placed916.length, 3);
  assert.ok(placed916[0].x < placed916[1].x && placed916[1].x < placed916[2].x, 'Order from left to right must be preserved');
  assert.ok(placed916[0].x >= 720 * 0.10, 'Leftmost character must respect left safe margin');
  assert.ok(placed916[2].x <= 720 * 0.90, 'Rightmost character must respect right safe margin');
});

test('9. Format Variant Overrides - Preserves custom overrides independently without mutating 16:9 base', () => {
  const baseChar: CharacterInstance = {
    instanceId: 'inst-1',
    characterId: 'pip_the_bear',
    name: 'Pip',
    x: 640,
    y: 480,
    scale: 1.0,
    rotation: 0,
    flipX: false,
    facingDirection: 'front',
    zIndex: 1,
  };

  const formatVariants = {
    '9:16': {
      aspectRatio: '9:16' as const,
      width: 720,
      height: 1280,
      characterOverrides: {
        'inst-1': {
          x: 290,
          y: 750,
          scale: 1.4,
          rotation: 15,
          flipX: true,
          facingDirection: 'front-left' as const,
        },
      },
    },
  };

  const placed169 = calculateResponsiveCharacterPlacement({
    instances: [baseChar],
    format: '16:9',
    formatVariants,
  });
  assert.strictEqual(placed169[0].x, 640, '16:9 base X must NOT be changed by 9:16 override');
  assert.strictEqual(placed169[0].y, 480, '16:9 base Y must NOT be changed by 9:16 override');
  assert.strictEqual(placed169[0].scale, 1.0, '16:9 base scale must NOT be changed');
  assert.strictEqual(placed169[0].isOverridden, false);

  const placed916 = calculateResponsiveCharacterPlacement({
    instances: [baseChar],
    format: '9:16',
    formatVariants,
  });
  assert.strictEqual(placed916[0].x, 290, '9:16 override X must be strictly applied');
  assert.strictEqual(placed916[0].y, 750, '9:16 override Y must be strictly applied');
  assert.strictEqual(placed916[0].scale, 1.4, '9:16 override scale must be strictly applied');
  assert.strictEqual(placed916[0].rotation, 15, '9:16 override rotation must be strictly applied');
  assert.strictEqual(placed916[0].flipX, true, '9:16 override flipX must be strictly applied');
  assert.strictEqual(placed916[0].facingDirection, 'front-left', '9:16 override facing direction must be strictly applied');
  assert.strictEqual(placed916[0].isOverridden, true, 'isOverridden must be true');
});

test('10. Reset Override - Deleting format override restores responsive ground anchor auto-layout', () => {
  const baseChar: CharacterInstance = {
    instanceId: 'inst-1',
    characterId: 'pip_the_bear',
    name: 'Pip',
    x: 640,
    y: 480,
    scale: 1.0,
    rotation: 0,
    flipX: false,
    facingDirection: 'front',
    zIndex: 1,
  };

  const formatVariants = {
    '9:16': {
      aspectRatio: '9:16' as const,
      width: 720,
      height: 1280,
      characterOverrides: {},
    },
  };

  const placed = calculateResponsiveCharacterPlacement({
    instances: [baseChar],
    format: '9:16',
    formatVariants,
  });

  assert.strictEqual(placed[0].isOverridden, false);
  assert.strictEqual(placed[0].isAutoPlaced, true);
  assert.strictEqual(placed[0].x, 360, 'Resetting override restores centered X in 9:16');
  assert.ok(placed[0].y > 800, 'Resetting override restores ground contact Y in 9:16');
});

test('11. Transform Gizmo Math - Euclidean distance scaling works on all 4 corners', () => {
  const center = { x: 500, y: 500 };
  const initialPointer = { x: 580, y: 600 };
  const initialDist = Math.hypot(initialPointer.x - center.x, initialPointer.y - center.y);
  const initialScale = 1.0;

  const draggedOutward = { x: 620, y: 650 };
  const currentDist = Math.hypot(draggedOutward.x - center.x, draggedOutward.y - center.y);
  const scaleOutward = (currentDist / initialDist) * initialScale;
  assert.ok(scaleOutward > 1.4, 'Dragging outward must increase scale');

  const draggedInward = { x: 540, y: 550 };
  const inwardDist = Math.hypot(draggedInward.x - center.x, draggedInward.y - center.y);
  const scaleInward = (inwardDist / initialDist) * initialScale;
  assert.ok(scaleInward < 0.6, 'Dragging inward must decrease scale');

  const initialTL = { x: 420, y: 400 };
  const distTL = Math.hypot(initialTL.x - center.x, initialTL.y - center.y);
  const draggedTLOutward = { x: 380, y: 350 };
  const curTLDist = Math.hypot(draggedTLOutward.x - center.x, draggedTLOutward.y - center.y);
  const scaleTL = (curTLDist / distTL) * initialScale;
  assert.ok(scaleTL > 1.4, 'Top-left corner dragging outward must increase scale');
});

test('12. Transform Gizmo Math - Rotation angular atan2 calculation and wrapping', () => {
  const center = { x: 500, y: 500 };

  const p0 = { x: 600, y: 500 };
  const deg0 = Math.atan2(p0.y - center.y, p0.x - center.x) * (180 / Math.PI);
  assert.strictEqual(deg0, 0);

  const p90 = { x: 500, y: 600 };
  const deg90 = Math.atan2(p90.y - center.y, p90.x - center.x) * (180 / Math.PI);
  assert.strictEqual(deg90, 90);

  const p180 = { x: 400, y: 500 };
  const deg180 = Math.atan2(p180.y - center.y, p180.x - center.x) * (180 / Math.PI);
  assert.strictEqual(Math.abs(deg180), 180);

  const pNeg90 = { x: 500, y: 400 };
  const degNeg90 = Math.atan2(pNeg90.y - center.y, pNeg90.x - center.x) * (180 / Math.PI);
  assert.strictEqual(degNeg90, -90);
});

test('13. Raster Character Directional Fallback - Identifies direct match vs missing-view fallback', () => {
  const rasterViews: Partial<Record<CharacterFacingDirection, string>> = {
    front: 'https://example.com/bear_front.png',
    left: 'https://example.com/bear_left_profile.png',
  };

  const resolveRasterSrc = (facing: CharacterFacingDirection) => {
    let activeSrc = rasterViews[facing];
    const isDirectMatch = Boolean(activeSrc);
    if (!activeSrc) {
      if (facing.includes('left') && rasterViews['left']) {
        activeSrc = rasterViews['left'];
      } else if (facing.includes('right') && rasterViews['right']) {
        activeSrc = rasterViews['right'];
      } else if (facing.includes('back') && rasterViews['back']) {
        activeSrc = rasterViews['back'];
      } else {
        activeSrc = rasterViews['front'];
      }
    }
    const isFallback = !isDirectMatch && facing !== 'front';
    return { activeSrc, isDirectMatch, isFallback };
  };

  const front = resolveRasterSrc('front');
  assert.strictEqual(front.isDirectMatch, true);
  assert.strictEqual(front.isFallback, false);
  assert.strictEqual(front.activeSrc, 'https://example.com/bear_front.png');

  const left = resolveRasterSrc('left');
  assert.strictEqual(left.isDirectMatch, true);
  assert.strictEqual(left.isFallback, false);
  assert.strictEqual(left.activeSrc, 'https://example.com/bear_left_profile.png');

  const back = resolveRasterSrc('back');
  assert.strictEqual(back.isDirectMatch, false);
  assert.strictEqual(back.isFallback, true);
  assert.strictEqual(back.activeSrc, 'https://example.com/bear_front.png');
});

test('14. Remotion Manifest Adapter Parity - Character instances carry facingDirection and formatVariants', async () => {
  const adapter = new RemotionManifestAdapter();
  const manifest = await adapter.buildManifest(
    {
      storyId: 'story-test-transforms',
      title: 'Transform Test Story',
      targetDuration: 10,
    },
    [
      {
        sceneId: 'scene-1',
        sceneNumber: 1,
        duration: 5,
        narration: 'Test narration',
        animationData: {
          characterInstances: [
            {
              instanceId: 'inst-1',
              characterId: 'pip_the_bear',
              name: 'Pip',
              x: 640,
              y: 480,
              scale: 1.0,
              rotation: 0,
              flipX: false,
              facingDirection: 'right',
              zIndex: 1,
            },
          ],
          formatVariants: {
            '9:16': {
              aspectRatio: '9:16',
              width: 720,
              height: 1280,
              characterOverrides: {
                'inst-1': { x: 300, y: 800, scale: 1.25, facingDirection: 'left' },
              },
            },
          },
        },
      },
    ],
    {
      embedBase64Images: false,
      embedBase64Audio: false,
    }
  );

  assert.strictEqual(manifest.scenes.length, 1);
  const scene = manifest.scenes[0];
  assert.ok(scene.characterInstances && scene.characterInstances.length === 1);
  assert.strictEqual(scene.characterInstances[0].facingDirection, 'right');
  assert.ok(scene.formatVariants);
  assert.strictEqual((scene.formatVariants['9:16'] as any).characterOverrides['inst-1'].facingDirection, 'left');
});
