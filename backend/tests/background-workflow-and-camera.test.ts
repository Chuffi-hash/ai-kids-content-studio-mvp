import test from 'node:test';
import assert from 'node:assert';
import { PromptSynthesizer } from '../src/services/story-generation/parser/prompt-synthesizer.js';
import { FFmpegVideoProvider } from '../src/services/production/video-generation/providers/ffmpeg-video.provider.js';
import { VectorAnimationEngine, computeSceneCameraTransform } from '../src/services/animation/vector-animation.engine.js';

test('Background Workflow & Camera Direction Test Suite', async (t) => {
  await t.test('1. PromptSynthesizer — Injects distinct camera perspectives into environment prompt', () => {
    const rawScenePrompt = 'A cozy treehouse nestled in a giant oak tree at sunset';

    // Test 1.1: Eye-level wide shot
    const eyeLevelPrompt = PromptSynthesizer.synthesizeBackgroundPrompt({
      explicitPrompt: rawScenePrompt,
      sceneTitle: 'Treehouse Sunset',
      cameraDirection: 'Eye-level wide shot',
      aspectRatio: '16:9',
    });
    assert.ok(
      eyeLevelPrompt.includes("viewed from an eye-level wide perspective"),
      `Expected eye-level perspective in prompt: ${eyeLevelPrompt}`
    );

    // Test 1.2: High angle / Bird's eye view
    const birdsEyePrompt = PromptSynthesizer.synthesizeBackgroundPrompt({
      explicitPrompt: rawScenePrompt,
      sceneTitle: 'Treehouse Sunset',
      cameraDirection: "High angle / Bird's eye view",
      aspectRatio: '16:9',
    });
    assert.ok(
      birdsEyePrompt.includes("viewed from a high-angle bird's-eye perspective"),
      `Expected bird's eye perspective in prompt: ${birdsEyePrompt}`
    );

    // Test 1.3: Low-angle shot
    const lowAnglePrompt = PromptSynthesizer.synthesizeBackgroundPrompt({
      explicitPrompt: rawScenePrompt,
      sceneTitle: 'Treehouse Sunset',
      cameraDirection: 'Low-angle shot',
      aspectRatio: '16:9',
    });
    assert.ok(
      lowAnglePrompt.includes("viewed from a dramatic low-angle perspective"),
      `Expected low-angle perspective in prompt: ${lowAnglePrompt}`
    );

    // Test 1.4: Close-up
    const closeUpPrompt = PromptSynthesizer.synthesizeBackgroundPrompt({
      explicitPrompt: rawScenePrompt,
      sceneTitle: 'Treehouse Sunset',
      cameraDirection: 'Close-up',
      aspectRatio: '16:9',
    });
    assert.ok(
      closeUpPrompt.includes("viewed from an intimate close-up perspective"),
      `Expected close-up perspective in prompt: ${closeUpPrompt}`
    );

    // Test 1.5: Medium shot
    const mediumPrompt = PromptSynthesizer.synthesizeBackgroundPrompt({
      explicitPrompt: rawScenePrompt,
      sceneTitle: 'Treehouse Sunset',
      cameraDirection: 'Medium shot',
      aspectRatio: '16:9',
    });
    assert.ok(
      mediumPrompt.includes("viewed from a balanced medium perspective"),
      `Expected medium shot perspective in prompt: ${mediumPrompt}`
    );

    // Test 1.6: Over-the-shoulder shot
    const otsPrompt = PromptSynthesizer.synthesizeBackgroundPrompt({
      explicitPrompt: rawScenePrompt,
      sceneTitle: 'Treehouse Sunset',
      cameraDirection: 'Over-the-shoulder shot',
      aspectRatio: '16:9',
    });
    assert.ok(
      otsPrompt.includes("viewed from an over-the-shoulder depth perspective"),
      `Expected OTS perspective in prompt: ${otsPrompt}`
    );

    // Test 1.7: Wide establishing shot
    const establishingPrompt = PromptSynthesizer.synthesizeBackgroundPrompt({
      explicitPrompt: rawScenePrompt,
      sceneTitle: 'Treehouse Sunset',
      cameraDirection: 'Wide establishing shot',
      aspectRatio: '16:9',
    });
    assert.ok(
      establishingPrompt.includes("viewed as a wide scenic establishing backdrop"),
      `Expected wide establishing perspective in prompt: ${establishingPrompt}`
    );
  });

  await t.test('2. PromptSynthesizer — Aspect Ratio composition injection', () => {
    const prompt169 = PromptSynthesizer.synthesizeBackgroundPrompt({
      explicitPrompt: 'Enchanted forest clearing with ancient mossy stones',
      sceneTitle: 'Forest Clearing',
      aspectRatio: '16:9',
    });
    assert.ok(prompt169.includes('Cinematic 16:9 widescreen composition'), `Expected 16:9 in prompt: ${prompt169}`);

    const prompt916 = PromptSynthesizer.synthesizeBackgroundPrompt({
      explicitPrompt: 'Enchanted forest clearing with ancient mossy stones',
      sceneTitle: 'Forest Clearing',
      aspectRatio: '9:16',
    });
    assert.ok(prompt916.includes('Vertical 9:16 composition'), `Expected 9:16 in prompt: ${prompt916}`);

    const prompt11 = PromptSynthesizer.synthesizeBackgroundPrompt({
      explicitPrompt: 'Enchanted forest clearing with ancient mossy stones',
      sceneTitle: 'Forest Clearing',
      aspectRatio: '1:1',
    });
    assert.ok(prompt11.includes('Square 1:1 composition'), `Expected 1:1 in prompt: ${prompt11}`);
  });

  await t.test('3. PromptSynthesizer — Environment-only negative constraints & open central foreground', () => {
    const prompt = PromptSynthesizer.synthesizeBackgroundPrompt({
      explicitPrompt: 'Ancient crystal cave with glowing stalactites',
      sceneTitle: 'Crystal Cave',
      cameraDirection: 'Eye-level wide shot',
      aspectRatio: '16:9',
    });

    // Must enforce environment only and negative constraints
    assert.ok(prompt.includes('Environment only.'), `Prompt must specify Environment only: ${prompt}`);
    assert.ok(
      prompt.includes('No characters, people, figures, text, captions, subtitles, logos or watermarks. Backdrop only.'),
      `Prompt must include negative constraints: ${prompt}`
    );
    // Must preserve central foreground for separate 2D character overlay compositing
    assert.ok(
      prompt.includes('Keep the central foreground open for separately animated characters.'),
      `Prompt must keep central foreground open: ${prompt}`
    );
    // User prompt preserved
    assert.ok(prompt.includes('Ancient crystal cave with glowing stalactites'));
  });

  await t.test('4. FFmpeg Video Provider — Builds Ken Burns motion filters for camera movements', () => {
    const totalFrames = 120;
    const fps = 30;

    const staticRes = FFmpegVideoProvider.buildZoompanFilter({
      cameraMovement: 'static',
      totalFrames,
      fps,
    });
    assert.strictEqual(staticRes.zoomExpr, "'1.0'");

    const zoomInRes = FFmpegVideoProvider.buildZoompanFilter({
      cameraMovement: 'slow zoom in',
      totalFrames,
      fps,
    });
    assert.ok(zoomInRes.zoomExpr.includes('min(zoom+'));

    const zoomOutRes = FFmpegVideoProvider.buildZoompanFilter({
      cameraMovement: 'slow zoom out',
      totalFrames,
      fps,
    });
    assert.ok(zoomOutRes.zoomExpr.includes('max(1.15-'));

    const panLeftRes = FFmpegVideoProvider.buildZoompanFilter({
      cameraMovement: 'pan left',
      totalFrames,
      fps,
    });
    assert.ok(panLeftRes.xExpr.includes('(1-on/120)'));

    const panRightRes = FFmpegVideoProvider.buildZoompanFilter({
      cameraMovement: 'pan right',
      totalFrames,
      fps,
    });
    assert.ok(panRightRes.xExpr.includes('(on/120)'));

    const tiltUpRes = FFmpegVideoProvider.buildZoompanFilter({
      cameraMovement: 'tilt up',
      totalFrames,
      fps,
    });
    assert.ok(tiltUpRes.yExpr.includes('(1-on/120)'));

    const tiltDownRes = FFmpegVideoProvider.buildZoompanFilter({
      cameraMovement: 'tilt down',
      totalFrames,
      fps,
    });
    assert.ok(tiltDownRes.yExpr.includes('(on/120)'));
  });

  await t.test('5. Image Magic Bytes & Size Validation — Supports PNG, JPEG, WebP and rejects >15MB', () => {
    // Valid PNG magic bytes
    const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    // Valid JPEG magic bytes
    const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    // Valid WebP magic bytes: RIFF at 0..3 and WEBP at 8..11
    const validWebp = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // 'RIFF'
      0x24, 0x00, 0x00, 0x00, // length
      0x57, 0x45, 0x42, 0x50, // 'WEBP'
      0x56, 0x50, 0x38, 0x20  // 'VP8 '
    ]);

    // Validation helper matching backend implementation
    function validateBytes(buffer: Buffer): { valid: boolean; mimeType?: string; error?: string } {
      if (!buffer || buffer.length < 8) return { valid: false, error: 'File is empty or too small' };
      const MAX_SIZE = 15 * 1024 * 1024;
      if (buffer.length > MAX_SIZE) return { valid: false, error: 'Image file exceeds maximum allowed size of 15MB' };

      const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
                    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a;
      const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
      const isWebp = buffer.length >= 12 &&
                     buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
                     buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;

      if (isPng) return { valid: true, mimeType: 'image/png' };
      if (isJpeg) return { valid: true, mimeType: 'image/jpeg' };
      if (isWebp) return { valid: true, mimeType: 'image/webp' };
      return { valid: false, error: 'Only valid PNG and JPEG, and WebP image formats are supported' };
    }

    const pngRes = validateBytes(validPng);
    assert.strictEqual(pngRes.valid, true);
    assert.strictEqual(pngRes.mimeType, 'image/png');

    const jpegRes = validateBytes(validJpeg);
    assert.strictEqual(jpegRes.valid, true);
    assert.strictEqual(jpegRes.mimeType, 'image/jpeg');

    const webpRes = validateBytes(validWebp);
    assert.strictEqual(webpRes.valid, true);
    assert.strictEqual(webpRes.mimeType, 'image/webp');

    // Invalid format (e.g. GIF)
    const gifBytes = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00]);
    const gifRes = validateBytes(gifBytes);
    assert.strictEqual(gifRes.valid, false);

    // Oversize buffer (16MB)
    const oversizeBuffer = Buffer.alloc(16 * 1024 * 1024);
    oversizeBuffer[0] = 0x89;
    oversizeBuffer[1] = 0x50;
    oversizeBuffer[2] = 0x4e;
    oversizeBuffer[3] = 0x47;
    const oversizeRes = validateBytes(oversizeBuffer);
    assert.strictEqual(oversizeRes.valid, false);
    assert.ok(oversizeRes.error?.includes('15MB'));
  });

  await t.test('6. Vector Animation Camera Motion & 2D Roll Rotation Engine', () => {
    const width = 1280;
    const height = 720;
    const durationSec = 4.0;

    // 6.1 Static transform is identity
    const staticTransform = computeSceneCameraTransform({
      movement: 'static',
      rotation: 'none',
      timestampSec: 2.0,
      durationSec,
      width,
      height,
    });
    assert.strictEqual(staticTransform.scale, 1.0);
    assert.strictEqual(staticTransform.dx, 0);
    assert.strictEqual(staticTransform.dy, 0);
    assert.strictEqual(staticTransform.rotationDeg, 0);
    assert.strictEqual(staticTransform.transformString, 'translate(640, 360) rotate(0) scale(1) translate(-640, -360)');

    // 6.2 Zoom in progress: t=0 -> 1.0, t=1.0 -> 1.15
    const zoomStart = computeSceneCameraTransform({
      movement: 'slow zoom in',
      timestampSec: 0,
      durationSec,
      width,
      height,
    });
    const zoomEnd = computeSceneCameraTransform({
      movement: 'slow zoom in',
      timestampSec: 4.0,
      durationSec,
      width,
      height,
    });
    assert.strictEqual(zoomStart.scale, 1.0);
    assert.strictEqual(zoomEnd.scale, 1.15);

    // 6.3 Zoom out progress: t=0 -> 1.15, t=1.0 -> 1.0
    const zoomOutStart = computeSceneCameraTransform({
      movement: 'slow zoom out',
      timestampSec: 0,
      durationSec,
      width,
      height,
    });
    const zoomOutEnd = computeSceneCameraTransform({
      movement: 'slow zoom out',
      timestampSec: 4.0,
      durationSec,
      width,
      height,
    });
    assert.strictEqual(zoomOutStart.scale, 1.15);
    assert.strictEqual(zoomOutEnd.scale, 1.0);

    // 6.4 Pan left: scale=1.12, dx traverses horizontally
    const panLeftStart = computeSceneCameraTransform({
      movement: 'pan left',
      timestampSec: 0,
      durationSec,
      width,
      height,
    });
    const panLeftEnd = computeSceneCameraTransform({
      movement: 'pan left',
      timestampSec: 4.0,
      durationSec,
      width,
      height,
    });
    assert.strictEqual(panLeftStart.scale, 1.12);
    assert.ok(panLeftStart.dx < 0);
    assert.ok(panLeftEnd.dx > 0);

    // 6.5 Pan right: scale=1.12, dx traverses in opposite direction
    const panRightStart = computeSceneCameraTransform({
      movement: 'pan right',
      timestampSec: 0,
      durationSec,
      width,
      height,
    });
    const panRightEnd = computeSceneCameraTransform({
      movement: 'pan right',
      timestampSec: 4.0,
      durationSec,
      width,
      height,
    });
    assert.strictEqual(panRightStart.scale, 1.12);
    assert.ok(panRightStart.dx > 0);
    assert.ok(panRightEnd.dx < 0);

    // 6.6 Tilt up & Tilt down
    const tiltUp = computeSceneCameraTransform({
      movement: 'tilt up',
      timestampSec: 4.0,
      durationSec,
      width,
      height,
    });
    assert.strictEqual(tiltUp.scale, 1.12);
    assert.ok(tiltUp.dy > 0);

    const tiltDown = computeSceneCameraTransform({
      movement: 'tilt down',
      timestampSec: 4.0,
      durationSec,
      width,
      height,
    });
    assert.strictEqual(tiltDown.scale, 1.12);
    assert.ok(tiltDown.dy < 0);

    // 6.7 2D Roll Rotation (Clockwise & Anticlockwise) with degrees clamping
    const rollClockwise = computeSceneCameraTransform({
      rotation: 'clockwise',
      rotationDegrees: 15,
      timestampSec: 4.0,
      durationSec,
      width,
      height,
    });
    assert.strictEqual(rollClockwise.rotationDeg, 15);
    assert.ok(rollClockwise.scale >= 1.12, 'Scale should be at least 1.12 to avoid exposing stage corners during roll');

    const rollAnticlockwise = computeSceneCameraTransform({
      rotation: 'anticlockwise',
      rotationDegrees: 20,
      timestampSec: 4.0,
      durationSec,
      width,
      height,
    });
    assert.strictEqual(rollAnticlockwise.rotationDeg, -20);
    assert.ok(rollAnticlockwise.scale >= 1.12);

    // Degree clamping to max 45
    const clampedRoll = computeSceneCameraTransform({
      rotation: 'clockwise',
      rotationDegrees: 90,
      timestampSec: 4.0,
      durationSec,
      width,
      height,
    });
    assert.strictEqual(clampedRoll.rotationDeg, 45);

    // 6.8 VectorAnimationEngine.generateSvgFrame wraps all scene elements in scene-camera-root
    const engine = new VectorAnimationEngine();
    const animData = {
      version: 1,
      viewport: { width: 1280, height: 720 },
      cameraMovement: 'slow zoom in',
      cameraRotation: 'clockwise',
      cameraRotationDegrees: 12,
      background: { imageUrl: '', removed: true },
      characterInstances: [
        {
          instanceId: 'char-1',
          characterId: 'c1',
          assetType: 'vector_rig' as const,
          name: 'Hero',
          x: 640,
          y: 450,
          scale: 1.0,
          rotation: 0,
          flipX: false,
          zIndex: 1,
        },
      ],
      animationClips: [],
      overlays: [],
    };

    const svgOutput = engine.generateSvgFrame({
      animationData: animData,
      timestampSec: 4.0,
      durationSec: 4.0,
      width: 1280,
      height: 720,
    });

    assert.ok(svgOutput.includes('<g id="scene-camera-root"'), 'SVG frame must contain scene-camera-root');
    assert.ok(svgOutput.includes('rotate(12)'), 'SVG camera root transform must reflect rotation roll');
    assert.ok(svgOutput.includes('scale(1.15)'), 'SVG camera root transform must reflect zoom scale');

    const rootIdx = svgOutput.indexOf('id="scene-camera-root"');
    const bgIdx = svgOutput.indexOf('id="background-layer"');
    const charIdx = svgOutput.indexOf('id="characters-layer"');

    assert.ok(rootIdx < bgIdx, 'scene-camera-root must wrap background-layer');
    assert.ok(bgIdx < charIdx, 'background-layer must precede characters-layer');
  });

  await t.test('7. Background Lifecycle — Removal Persistence, Historical Asset Retention & Re-application', () => {
    // 7.1 Active background state
    const sceneActive = {
      id: 'sc-1',
      sceneId: 'sc-1',
      storyId: 'story-1',
      imageUrl: '/storage/scene-active.png',
      animationData: {
        background: {
          imageUrl: '/storage/scene-active.png',
          fit: 'cover' as const,
          source: 'ai_generated',
          removed: false,
        },
      },
    };

    // 7.2 Explicit background removal
    const sceneRemoved = {
      ...sceneActive,
      imageUrl: null,
      animationData: {
        ...sceneActive.animationData,
        background: {
          imageUrl: '',
          fit: 'cover' as const,
          removed: true,
        },
      },
    };

    // 7.3 GET /story/:storyId resolver simulation
    // When latestImage exists in DB (never deleted), verify resolvedImageUrl is null when removed=true
    const latestImageInDb = { id: 'img-1', imageUrl: '/storage/scene-historical.png' };

    function resolveSceneImage(scene: any, latestImage: any) {
      const isBgExplicitlyRemoved = Boolean(scene.animationData?.background?.removed);
      const resolvedImageUrl = isBgExplicitlyRemoved
        ? null
        : (scene.imageUrl || (latestImage ? latestImage.imageUrl : null));
      const resolvedImage = (!isBgExplicitlyRemoved && latestImage) ? latestImage : null;
      return { resolvedImageUrl, resolvedImage };
    }

    // With active background:
    const activeRes = resolveSceneImage(sceneActive, latestImageInDb);
    assert.strictEqual(activeRes.resolvedImageUrl, '/storage/scene-active.png');
    assert.notStrictEqual(activeRes.resolvedImage, null);

    // With removed background:
    const removedRes = resolveSceneImage(sceneRemoved, latestImageInDb);
    assert.strictEqual(removedRes.resolvedImageUrl, null, 'Must NOT resurrect historical image when background is explicitly removed');
    assert.strictEqual(removedRes.resolvedImage, null, 'Must NOT populate scene image object when background is explicitly removed');

    // 7.4 Re-application resets removed: false
    const sceneReapplied = {
      ...sceneRemoved,
      imageUrl: '/storage/scene-new.png',
      animationData: {
        ...sceneRemoved.animationData,
        background: {
          imageUrl: '/storage/scene-new.png',
          fit: 'cover' as const,
          source: 'imported',
          removed: false,
        },
      },
    };
    const reappliedRes = resolveSceneImage(sceneReapplied, latestImageInDb);
    assert.strictEqual(reappliedRes.resolvedImageUrl, '/storage/scene-new.png');
    assert.strictEqual(sceneReapplied.animationData.background.removed, false);

    // 7.5 Video Assembly Fallback Guard
    function resolveVideoAssemblyImagePath(scene: any, imagesInDb: any[]) {
      let imagePath = '';
      const isBgExplicitlyRemoved = Boolean(scene.animationData?.background?.removed);
      if (!isBgExplicitlyRemoved) {
        if (scene.imageUrl) {
          imagePath = scene.imageUrl;
        } else if (imagesInDb.length > 0 && imagesInDb[0].imageUrl) {
          imagePath = imagesInDb[0].imageUrl;
        }
      }
      return imagePath;
    }

    assert.strictEqual(
      resolveVideoAssemblyImagePath(sceneRemoved, [latestImageInDb]),
      '',
      'Video assembly must not resurrect historical images when background.removed is true'
    );
    assert.strictEqual(
      resolveVideoAssemblyImagePath(sceneActive, [latestImageInDb]),
      '/storage/scene-active.png'
    );
  });
});

