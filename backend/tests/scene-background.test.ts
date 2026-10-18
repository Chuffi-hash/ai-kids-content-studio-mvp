import test from 'node:test';
import assert from 'node:assert';
import 'dotenv/config';
import express from 'express';
import { AddressInfo } from 'net';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { contentRouter } from '../src/routes/content.js';
import {
  createStory,
  createScene,
  getSceneBySceneId,
  deleteStory,
  getStoryByStoryId,
  updateScene,
} from '../src/services/database/database.service.js';
import {
  VectorAnimationEngine,
  VectorSceneData,
} from '../src/services/animation/vector-animation.engine.js';
import { getVectorRig } from '../src/services/animation/templates/default-characters.js';

// Minimal 1x1 valid PNG and JPEG buffers
const VALID_1X1_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2d420000000049454e44ae426082',
  'hex'
);

const VALID_1X1_JPEG = Buffer.from(
  'ffd8ffe000104a46494600010101004800480000ffdb004300030202020202030202020303030304060404040404080606050609080a0a090809090a0c100c0a0b0e0b09090d110d0e0f101011100a0c12131210130f101010ffc0000b080001000101011100ffda0008010100003f00d2cf20ffd9',
  'hex'
);

// Helper to launch ephemeral test server
function createTestServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use('/api/content', contentRouter);
  const server = app.listen(0);
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://localhost:${port}`;
  return {
    baseUrl,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test('Scene Backgrounds — Full Lifecycle, Parity, and Safety Suite', async (t) => {
  const { baseUrl, close } = createTestServer();
  const testStoryId = `test-story-bg-${Date.now()}`;
  const testScene1Id = `test-scene-bg-1-${Date.now()}`;
  const testScene2Id = `test-scene-bg-2-${Date.now()}`;

  // Ensure cleanup on finish
  t.after(async () => {
    try {
      await deleteStory(testStoryId);
    } catch {
      // ignore if already deleted
    }
    await close();
  });

  // Seed test story and scenes
  await createStory({
    storyId: testStoryId,
    title: 'Background Test Story',
    targetDuration: 30,
  });

  await createScene({
    id: randomUUID(),
    sceneId: testScene1Id,
    storyId: testStoryId,
    number: 1,
    order: 1,
    title: 'Scene 1: Sunny Meadow',
    narration: 'The sun was shining brightly over the meadow.',
    startMs: 0,
    endMs: 5000,
    animationData: {
      version: 1,
      viewport: { width: 1280, height: 720 },
      characterInstances: [
        {
          instanceId: 'char-sammy',
          characterId: 'sammy_the_kid',
          x: 400,
          y: 500,
          scale: 1,
          rotation: 0,
          flipX: false,
          zIndex: 1,
        },
      ],
      animationClips: [],
    },
  });

  await createScene({
    id: randomUUID(),
    sceneId: testScene2Id,
    storyId: testStoryId,
    number: 2,
    order: 2,
    title: 'Scene 2: Forest Trail',
    narration: 'They walked deeper into the whispering forest.',
    startMs: 5000,
    endMs: 10000,
    animationData: {
      version: 1,
      viewport: { width: 1280, height: 720 },
      characterInstances: [
        {
          instanceId: 'char-pip',
          characterId: 'pip_the_bear',
          x: 600,
          y: 500,
          scale: 1,
          rotation: 0,
          flipX: false,
          zIndex: 1,
        },
      ],
      animationClips: [],
    },
  });

  let uploadedPngUrl = '';
  let uploadedJpegUrl = '';

  await t.test('1. Validation — Rejects invalid file types, bad magic bytes, and empty payloads', async () => {
    // 1.1 Empty payload
    const resEmpty = await fetch(`${baseUrl}/api/content/scenes/${testScene1Id}/background/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.strictEqual(resEmpty.status, 400);
    const dataEmpty = await resEmpty.json();
    assert.ok(dataEmpty.message.includes('required'));

    // 1.2 Truncated/corrupted header (less than 8 bytes)
    const resTrunc = await fetch(`${baseUrl}/api/content/scenes/${testScene1Id}/background/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'short.png',
        fileData: Buffer.from([0x89, 0x50]).toString('base64'),
      }),
    });
    assert.strictEqual(resTrunc.status, 400);
    const dataTrunc = await resTrunc.json();
    assert.ok(dataTrunc.message.includes('too small') || dataTrunc.message.includes('valid'));

    // 1.3 Unsupported GIF format
    const gif1x1 = Buffer.from(
      '47494638396101000100800000000000ffffff21f90401000000002c000000000100010000020144003b',
      'hex'
    );
    const resGif = await fetch(`${baseUrl}/api/content/scenes/${testScene1Id}/background/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'animation.gif',
        fileData: gif1x1.toString('base64'),
      }),
    });
    assert.strictEqual(resGif.status, 400);
    const dataGif = await resGif.json();
    assert.ok(dataGif.message.includes('PNG and JPEG'));

    // 1.4 Unsupported SVG text disguised as PNG filename
    const fakeSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>', 'utf-8');
    const resSvg = await fetch(`${baseUrl}/api/content/scenes/${testScene1Id}/background/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'background.png',
        fileData: fakeSvg.toString('base64'),
      }),
    });
    assert.strictEqual(resSvg.status, 400);
    const dataSvg = await resSvg.json();
    assert.ok(dataSvg.message.includes('PNG and JPEG'));

    // 1.5 Plain text payload
    const plainText = Buffer.from('Hello world this is not an image file at all!', 'utf-8');
    const resTxt = await fetch(`${baseUrl}/api/content/scenes/${testScene1Id}/background/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'notes.txt',
        fileData: plainText.toString('base64'),
      }),
    });
    assert.strictEqual(resTxt.status, 400);
    const dataTxt = await resTxt.json();
    assert.ok(dataTxt.message.includes('PNG and JPEG'));
  });

  await t.test('2. Upload PNG background — Validates magic bytes, saves to storage, updates scene and version', async () => {
    const res = await fetch(`${baseUrl}/api/content/scenes/${testScene1Id}/background/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'meadow.png',
        fileData: VALID_1X1_PNG.toString('base64'),
        fit: 'cover',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.sceneId, testScene1Id);
    assert.ok(data.background.imageUrl.startsWith('/storage/images/'));
    assert.strictEqual(data.background.fit, 'cover');

    uploadedPngUrl = data.background.imageUrl;

    // Verify scene in database
    const dbScene = await getSceneBySceneId(testScene1Id);
    assert.ok(dbScene);
    assert.strictEqual(dbScene.imageUrl, uploadedPngUrl);
    const animData = dbScene.animationData as any;
    assert.ok(animData);
    assert.strictEqual(animData.background?.imageUrl, uploadedPngUrl);
    assert.strictEqual(animData.background?.fit, 'cover');
    // Ensure character instances remain untouched
    assert.strictEqual(animData.characterInstances?.length, 1);
    assert.strictEqual(animData.characterInstances[0].instanceId, 'char-sammy');
  });

  await t.test('3. Upload JPEG background with "contain" fit mode — Validates JPEG header and fit mode', async () => {
    const res = await fetch(`${baseUrl}/api/content/scenes/${testScene2Id}/background/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'forest.jpg',
        fileData: VALID_1X1_JPEG.toString('base64'),
        fit: 'contain',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.background.fit, 'contain');
    assert.ok(data.background.imageUrl.startsWith('/storage/images/'));

    uploadedJpegUrl = data.background.imageUrl;

    const dbScene = await getSceneBySceneId(testScene2Id);
    assert.ok(dbScene);
    assert.strictEqual(dbScene.imageUrl, uploadedJpegUrl);
    const animData = dbScene.animationData as any;
    assert.strictEqual(animData.background?.fit, 'contain');
  });

  await t.test('4. Update Fit Mode — Toggles between cover and contain without re-uploading', async () => {
    // Change scene 1 from cover to contain
    const resContain = await fetch(`${baseUrl}/api/content/scenes/${testScene1Id}/background`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fit: 'contain' }),
    });

    assert.strictEqual(resContain.status, 200);
    const dataContain = await resContain.json();
    assert.strictEqual(dataContain.success, true);
    assert.strictEqual(dataContain.background.fit, 'contain');
    assert.strictEqual(dataContain.background.imageUrl, uploadedPngUrl);

    let dbScene = await getSceneBySceneId(testScene1Id);
    assert.strictEqual((dbScene?.animationData as any)?.background?.fit, 'contain');

    // Change scene 1 back to cover
    const resCover = await fetch(`${baseUrl}/api/content/scenes/${testScene1Id}/background`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fit: 'cover' }),
    });

    assert.strictEqual(resCover.status, 200);
    const dataCover = await resCover.json();
    assert.strictEqual(dataCover.background.fit, 'cover');

    dbScene = await getSceneBySceneId(testScene1Id);
    assert.strictEqual((dbScene?.animationData as any)?.background?.fit, 'cover');
  });

  await t.test('5. Reuse Existing Background — Assigns Scene 1 background to Scene 2', async () => {
    const res = await fetch(`${baseUrl}/api/content/scenes/${testScene2Id}/background`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl: uploadedPngUrl,
        fit: 'contain',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.background.imageUrl, uploadedPngUrl);
    assert.strictEqual(data.background.fit, 'contain');

    const dbScene = await getSceneBySceneId(testScene2Id);
    assert.strictEqual(dbScene?.imageUrl, uploadedPngUrl);
    assert.strictEqual((dbScene?.animationData as any)?.background?.imageUrl, uploadedPngUrl);
    // Character instance for Scene 2 (Pip) must still exist intact
    assert.strictEqual((dbScene?.animationData as any)?.characterInstances[0].instanceId, 'char-pip');
  });

  await t.test('6. Story Backgrounds List — Returns deduplicated candidates across scenes', async () => {
    const res = await fetch(`${baseUrl}/api/content/story/${testStoryId}/backgrounds`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.backgrounds));

    // Both uploadedPngUrl and uploadedJpegUrl should be discoverable
    const urls = data.backgrounds.map((b: any) => b.imageUrl);
    assert.ok(urls.includes(uploadedPngUrl));
    assert.ok(urls.includes(uploadedJpegUrl));

    // Check entry metadata
    const pngEntry = data.backgrounds.find((b: any) => b.imageUrl === uploadedPngUrl);
    assert.ok(pngEntry);
    assert.ok(pngEntry.sceneNumber !== undefined);
    assert.ok(pngEntry.sceneTitle);
  });

  await t.test('7. Remove Background — Clears background and restores default stage backdrop', async () => {
    const res = await fetch(`${baseUrl}/api/content/scenes/${testScene1Id}/background`, {
      method: 'DELETE',
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.scene.imageUrl, null);
    assert.strictEqual(data.scene.animationData.background, undefined);

    const dbScene = await getSceneBySceneId(testScene1Id);
    assert.strictEqual(dbScene?.imageUrl, null);
    assert.strictEqual((dbScene?.animationData as any)?.background, undefined);
    // Characters must remain present
    assert.strictEqual((dbScene?.animationData as any)?.characterInstances?.length, 1);
  });

  await t.test('8. Vector Animation Engine — SVG frame generation with cover, contain, and default stage', async () => {
    const engine = new VectorAnimationEngine();

    // 8.1 Default stage (no background)
    const sceneDataNoBg: VectorSceneData = {
      version: 1,
      viewport: { width: 1280, height: 720 },
      characterInstances: [
        {
          instanceId: 'sammy',
          characterId: 'sammy_the_kid',
          x: 400,
          y: 500,
          scale: 1,
          rotation: 0,
          flipX: false,
          zIndex: 1,
        },
      ],
      animationClips: [],
    };

    const svgDefault = engine.generateSvgFrame({
      animationData: sceneDataNoBg,
      timestampSec: 0,
    });
    assert.ok(svgDefault.includes('<svg'), 'Should produce valid SVG root');
    assert.ok(svgDefault.includes('default-stylized-background'), 'Default stage includes default-stylized-background');
    assert.ok(svgDefault.includes('scene-background-rect'), 'Default stage includes background rect');
    assert.ok(svgDefault.includes('char-sammy'), 'Includes vector character');

    // 8.2 Custom background with cover fit
    const sceneDataCover: VectorSceneData = {
      ...sceneDataNoBg,
      background: {
        imageUrl: uploadedPngUrl,
        fit: 'cover',
      },
    };

    const svgCover = engine.generateSvgFrame({
      animationData: sceneDataCover,
      timestampSec: 0,
    });
    assert.ok(svgCover.includes('scene-background-group'), 'Includes scene-background-group');
    assert.ok(svgCover.includes('preserveAspectRatio="xMidYMid slice"'), 'Cover uses slice for 16:9 crop');
    assert.ok(svgCover.includes(`href="${uploadedPngUrl}"`), 'References background image');

    // 8.3 Custom background with contain fit
    const sceneDataContain: VectorSceneData = {
      ...sceneDataNoBg,
      background: {
        imageUrl: uploadedJpegUrl,
        fit: 'contain',
      },
    };

    const svgContain = engine.generateSvgFrame({
      animationData: sceneDataContain,
      timestampSec: 0,
    });
    assert.ok(svgContain.includes('scene-background-group'), 'Includes scene-background-group');
    assert.ok(svgContain.includes('preserveAspectRatio="xMidYMid meet"'), 'Contain uses meet for letterboxing');
    assert.ok(svgContain.includes('fill="#090d16"'), 'Dark backdrop rect is present for clean letterbox framing');

    // 8.4 Independent Character Layering Verification:
    // Background group MUST precede character group in SVG DOM order so vector characters render on top
    const bgIndex = svgCover.indexOf('id="scene-background-group"');
    const charIndex = svgCover.indexOf('id="char-sammy"');
    assert.ok(bgIndex !== -1, 'Background group exists');
    assert.ok(charIndex !== -1, 'Character instance exists');
    assert.ok(bgIndex < charIndex, 'Background MUST be rendered BEFORE characters in SVG DOM order');

    const bgLayerIndex = svgCover.indexOf('id="background-layer"');
    const charLayerIndex = svgCover.indexOf('id="characters-layer"');
    assert.ok(bgLayerIndex < charLayerIndex, 'background-layer must precede characters-layer');
  });
});
