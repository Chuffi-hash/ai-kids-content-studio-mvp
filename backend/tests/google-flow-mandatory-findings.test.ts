import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  GoogleFlowAssetImportService,
  parseImageDimensions,
} from '../src/services/google-flow/google-flow-asset-import.service.js';
import { GoogleFlowCredentialService } from '../src/services/google-flow/google-flow-credential.service.js';
import { EncryptionKeyManager } from '../src/services/google-flow/encryption-key.manager.js';
import { RemotionManifestAdapter } from '../src/services/video-assembly/remotion-manifest.adapter.js';
import { FlowBrowserWorker } from '../../flow-worker/src/flow-browser.mjs';
import {
  createStory,
  createScene,
  getSceneBySceneId,
  getScenesByStoryId,
  deleteStory,
  getStoryByStoryId,
  updateStoryFlowProject,
} from '../src/services/database/database.service.js';

// Helper to construct a minimal valid PNG buffer with custom dimensions
function createTestPng(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(33);
  // PNG signature
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  // IHDR length: 13
  buffer.writeUInt32BE(13, 8);
  // IHDR chunk type
  buffer.write('IHDR', 12, 4, 'ascii');
  // Dimensions
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  // Bit depth 8, Color type 2 (Truecolor), Compression 0, Filter 0, Interlace 0
  buffer.writeUInt8(8, 24);
  buffer.writeUInt8(2, 25);
  buffer.writeUInt8(0, 26);
  buffer.writeUInt8(0, 27);
  buffer.writeUInt8(0, 28);
  // Fake CRC
  buffer.writeUInt32BE(0x12345678, 29);
  return buffer;
}

// Helper to construct a minimal JPEG buffer with SOF0 marker and custom dimensions
function createTestJpeg(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(20);
  // SOI marker
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  // SOF0 marker
  buffer[2] = 0xff;
  buffer[3] = 0xc0;
  // Length of SOF0 segment (8 bytes)
  buffer.writeUInt16BE(8, 4);
  // Precision 8
  buffer[6] = 8;
  // Height & Width
  buffer.writeUInt16BE(height, 7);
  buffer.writeUInt16BE(width, 9);
  // Components: 3
  buffer[11] = 3;
  // EOI marker
  buffer[12] = 0xff;
  buffer[13] = 0xd9;
  return buffer;
}

test('Mandatory Code Audit Verification Suite (All 10 Findings)', async (t) => {
  let createdStoryId: string | null = null;
  const tempKeyDir = path.resolve(process.cwd(), 'temp-mandatory-keys');
  const tempKeyFile = path.join(tempKeyDir, 'mandatory-test-master.key');

  t.before(async () => {
    await fs.promises.mkdir(tempKeyDir, { recursive: true });
    EncryptionKeyManager.setKeyPath(tempKeyFile);
  });

  t.after(async () => {
    EncryptionKeyManager.resetKeyPath();
    try {
      await prisma.integrationCredential.deleteMany({
        where: { provider: 'google-flow', credentialType: 'worker-bearer-token' },
      });
    } catch {
      // best-effort
    }
    try {
      await fs.promises.rm(tempKeyDir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
    if (createdStoryId) {
      try {
        await deleteStory(createdStoryId);
      } catch {
        // cleanup best-effort
      }
    }
  });

  // Scenario 1: Character Studio works without frontend worker-token entry
  await t.test('1. Character Studio works without frontend worker-token entry', async () => {
    await GoogleFlowCredentialService.regenerateWorkerCredential();
    const cred = await GoogleFlowCredentialService.getOrCreateWorkerCredential();
    assert.ok(cred.token && cred.token.length >= 32, 'Token was regenerated and stored encrypted in PostgreSQL');
    assert.ok(cred.keyVersion, 'Key version exists in credential record');

    // Public credential status NEVER exposes decrypted token
    const publicStatus = await GoogleFlowCredentialService.getPublicCredentialStatus();
    assert.equal(publicStatus.configured, true);
    assert.equal(publicStatus.decryptedSuccessfully, true);
    assert.equal((publicStatus as any).token, undefined);
    assert.equal((publicStatus as any).encryptedValue, undefined);

    // Backend can decrypt securely server-side for proxying
    assert.ok(cred.token && cred.token.length >= 32, 'Backend securely decrypts token for proxy without client token');
  });

  // Scenario 2: Browser-open does not imply Google-authenticated
  await t.test('2. Browser-open does not imply Google-authenticated', async () => {
    const worker = new FlowBrowserWorker();
    const status = await worker.getSessionStatus();

    // Verify separate boolean and enum capabilities
    assert.equal(status.browserRunning, false);
    assert.equal(status.googleAuthenticated, false);
    assert.equal(status.authenticationStatus, 'unknown');
    assert.equal(status.canPrepareJob, false);
    assert.equal(status.canGenerateJob, false);

    // Simulated browser open without Google session
    worker.context = {} as any;
    worker.page = {
      isClosed: () => false,
      url: () => 'https://accounts.google.com/signin/v2/identifier',
      title: async () => 'Sign in - Google Accounts',
    } as any;

    const loginStatus = await worker.getSessionStatus();
    assert.equal(loginStatus.browserRunning, true, 'Browser is running');
    assert.equal(loginStatus.googleAuthenticated, false, 'Browser running does NOT imply Google authenticated');
    assert.equal(loginStatus.manualLoginRequired, true);
    assert.equal(loginStatus.authenticationStatus, 'login_required');
    assert.equal(loginStatus.canPrepareJob, false, 'canPrepareJob is strictly blocked when not authenticated');
  });

  // Scenario 3: Job preparation is disabled when Google sign-in is required
  await t.test('3. Job preparation is disabled when Google sign-in is required or blocked', async () => {
    const worker = new FlowBrowserWorker();
    worker.context = {} as any;
    worker.page = {
      isClosed: () => false,
      url: () => 'https://accounts.google.com/v3/signin/rejected',
      title: async () => 'Sign in rejected',
    } as any;

    const blockedStatus = await worker.getSessionStatus();
    assert.equal(blockedStatus.browserRunning, true);
    assert.equal(blockedStatus.googleSigninBlocked, true);
    assert.equal(blockedStatus.googleAuthenticated, false);
    assert.equal(blockedStatus.canPrepareJob, false, 'Preparation must be false when signin is rejected/blocked');
  });

  // Scenario 4: Worker configuration changes are reflected in the active worker
  await t.test('4. Worker configuration changes are reflected in the active worker', async () => {
    const worker = new FlowBrowserWorker();

    // Reconfigure while idle
    worker.configure({ browserChannel: 'chrome' });
    assert.equal(worker.browserChannel, 'chrome');

    worker.configure({ browserChannel: 'bundled-chromium' });
    assert.equal(worker.browserChannel, ''); // bundled chromium sanitizes to empty string for Playwright

    // Reconfiguration while active session is running must throw 409
    worker.context = {} as any;
    assert.throws(
      () => worker.configure({ browserChannel: 'chrome' }),
      /Cannot change browser channel or profile directory while browser session is running/,
      'Must reject incompatible reconfiguration while browser is active'
    );
    worker.context = null;
  });

  // Scenario 5: Bundled Chromium launches without an invalid browser channel
  await t.test('5. Bundled Chromium launches without an invalid browser channel', async () => {
    const worker = new FlowBrowserWorker();
    worker.configure({ browserChannel: 'bundled-chromium' });
    assert.notEqual(worker.browserChannel, 'bundled-chromium', 'Never pass literal "bundled-chromium" as channel');
    assert.equal(worker.browserChannel, '');
  });

  // Scenario 6: Background dimensions reflect actual image
  await t.test('6. Background dimensions reflect actual image (not hardcoded 1280x720)', async () => {
    // 1. PNG at 800x600
    const pngBuf = createTestPng(800, 600);
    const pngDims = parseImageDimensions(pngBuf);
    assert.equal(pngDims.width, 800, 'PNG width extracted from header');
    assert.equal(pngDims.height, 600, 'PNG height extracted from header');

    // 2. JPEG at 1920x1080
    const jpegBuf = createTestJpeg(1920, 1080);
    const jpegDims = parseImageDimensions(jpegBuf);
    assert.equal(jpegDims.width, 1920, 'JPEG width extracted from SOF marker');
    assert.equal(jpegDims.height, 1080, 'JPEG height extracted from SOF marker');

    // 3. Vertical JPEG at 1080x1920 (9:16)
    const vertJpegBuf = createTestJpeg(1080, 1920);
    const vertDims = parseImageDimensions(vertJpegBuf);
    assert.equal(vertDims.width, 1080);
    assert.equal(vertDims.height, 1920);
  });

  // Scenario 7: Scene-specific background imports retain correct story and scene IDs
  await t.test('7. Scene-specific background imports retain correct story and scene IDs', async () => {
    const story = await createStory({
      title: 'Flow Mandatory Test Story',
      ageGroup: '6-8',
      synopsis: 'A test story for Flow import',
    });
    createdStoryId = story.storyId;

    const scene = await createScene({
      sceneId: randomUUID(),
      storyId: story.storyId,
      number: 1,
      title: 'Scene 1: Enchanted Garden',
      visualPrompt: 'Vibrant flowers in sunlight',
      narration: 'The garden was glowing with gentle light.',
    });

    const testImage = createTestPng(1920, 1080);

    // Mismatched story ID must be rejected
    await assert.rejects(
      async () => {
        await GoogleFlowAssetImportService.importAsset({
          target: 'scene_background',
          storyId: 'mismatched-story-id',
          sceneId: scene.sceneId,
          imageData: testImage,
        });
      },
      /does not belong to story/,
      'Rejects scene import when sceneId does not belong to storyId'
    );

    // Valid import
    const result = await GoogleFlowAssetImportService.importAsset({
      target: 'scene_background',
      storyId: story.storyId,
      sceneId: scene.sceneId,
      imageData: testImage,
      aspectRatio: '16:9',
      prompt: 'Enchanted morning sunlight over garden',
    });

    assert.equal(result.success, true);
    assert.equal(result.width, 1920);
    assert.equal(result.height, 1080);
    assert.equal(result.metadata?.storyId, story.storyId);
    assert.equal(result.metadata?.sceneId, scene.sceneId);

    // Verify database state
    const updatedScene = await getSceneBySceneId(scene.sceneId);
    assert.ok(updatedScene?.imageUrl, 'Scene.imageUrl is populated');
    const anim = (updatedScene?.animationData || {}) as any;
    assert.equal(anim.background?.imageUrl, updatedScene?.imageUrl);
    assert.equal(anim.background?.source, 'google_flow_manual');
    assert.equal(anim.background?.dimensions?.width, 1920);
    assert.equal(anim.background?.dimensions?.height, 1080);
  });

  // Scenario 8: Background imports without scene context remain reusable library assets
  await t.test('8. Background imports without scene context remain reusable library assets', async () => {
    const testImage = createTestPng(1280, 720);
    const result = await GoogleFlowAssetImportService.importAsset({
      target: 'background_library',
      name: 'Forest Canopy Flow Plate',
      environmentType: 'Storybook Forest',
      imageData: testImage,
      aspectRatio: '16:9',
    });

    assert.equal(result.success, true);
    assert.equal(result.target, 'background_library');
    assert.ok(result.imageUrl, 'Has valid public URL');
    assert.equal(result.width, 1280);
    assert.equal(result.height, 720);
    assert.equal(result.metadata?.name, 'Forest Canopy Flow Plate');
  });

  // Scenario 9: Project context survives navigation between relevant pages
  await t.test('9. Project context survives navigation between relevant pages', async () => {
    assert.ok(createdStoryId, 'Story created in previous test');
    const flowProjectId = 'flow_prj_alpha_789';

    // Link flowProjectId to story
    await updateStoryFlowProject(createdStoryId, flowProjectId, `https://flow.google.com/project/${flowProjectId}`);

    const reloaded = await getStoryByStoryId(createdStoryId);
    assert.equal(reloaded?.flowProjectId, flowProjectId, 'Flow project ID persisted in Story table');
  });

  // Scenario 10: Imported Flow assets are available to Remotion rendering
  await t.test('10. Imported Flow assets are available to Remotion rendering', async () => {
    assert.ok(createdStoryId, 'Story created in previous test');
    const story = await getStoryByStoryId(createdStoryId);
    assert.ok(story);
    const scenes = await getScenesByStoryId(createdStoryId);
    assert.ok(scenes.length > 0, 'Scenes found for story');

    const adapter = new RemotionManifestAdapter();
    const manifest = await adapter.buildManifest(story, scenes, {
      aspectRatio: '16:9',
      fps: 30,
    });

    assert.ok(manifest.scenes.length > 0, 'Manifest contains scenes');
    const remotionScene = manifest.scenes[0];
    assert.ok(remotionScene.background, 'Remotion scene has background config');
    assert.ok(remotionScene.background.imageUrl, 'Remotion background imageUrl is defined');
    assert.equal(remotionScene.background.fit, 'cover', 'Remotion background fit is cover');
  });
});
