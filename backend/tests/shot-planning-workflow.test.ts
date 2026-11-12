import test from 'node:test';
import assert from 'node:assert';
import 'dotenv/config';
import express from 'express';
import { AddressInfo } from 'net';
import * as fs from 'fs';
import * as path from 'path';
import { ShotDirectorService, PlanSceneShotsParams } from '../src/services/scene-director/shot-director.service.js';
import { normalizeCameraMovement, CinematicShotData } from '../src/services/scene-director/scene-director.types.js';
import { shotRouter } from '../src/routes/shots.js';
import { RemotionManifestAdapter } from '../src/services/video-assembly/remotion-manifest.adapter.js';

async function createTestServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use('/api/shots', shotRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    baseUrl,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test('Camera Movement Normalization Contract across Pipeline', () => {
  // Verifies all variations and casing map to canonical types
  assert.strictEqual(normalizeCameraMovement('slow_zoom_in'), 'slow_zoom_in');
  assert.strictEqual(normalizeCameraMovement('slow zoom in'), 'slow_zoom_in');
  assert.strictEqual(normalizeCameraMovement('SLOW_ZOOM_IN'), 'slow_zoom_in');
  assert.strictEqual(normalizeCameraMovement('push_in'), 'slow_zoom_in');
  assert.strictEqual(normalizeCameraMovement('push in'), 'slow_zoom_in');
  assert.strictEqual(normalizeCameraMovement('zoom_in'), 'slow_zoom_in');

  assert.strictEqual(normalizeCameraMovement('zoom_out'), 'zoom_out');
  assert.strictEqual(normalizeCameraMovement('pull_out'), 'zoom_out');
  assert.strictEqual(normalizeCameraMovement('slow zoom out'), 'zoom_out');

  assert.strictEqual(normalizeCameraMovement('pan_left'), 'pan_left');
  assert.strictEqual(normalizeCameraMovement('pan-left'), 'pan_left');
  assert.strictEqual(normalizeCameraMovement('pan left'), 'pan_left');

  assert.strictEqual(normalizeCameraMovement('pan_right'), 'pan_right');
  assert.strictEqual(normalizeCameraMovement('pan-right'), 'pan_right');

  assert.strictEqual(normalizeCameraMovement('tilt_up'), 'tilt_up');
  assert.strictEqual(normalizeCameraMovement('tilt_down'), 'tilt_down');

  assert.strictEqual(normalizeCameraMovement('tracking'), 'tracking');
  assert.strictEqual(normalizeCameraMovement('truck'), 'tracking');
  assert.strictEqual(normalizeCameraMovement('dolly'), 'dolly');

  assert.strictEqual(normalizeCameraMovement('static'), 'static');
  assert.strictEqual(normalizeCameraMovement(''), 'static');
  assert.strictEqual(normalizeCameraMovement(undefined), 'static');
});

test('Shot Director Planning produces Valid Multi-Shot Breakdowns', () => {
  const sceneParams: PlanSceneShotsParams = {
    storyId: 'story-test-1',
    sceneId: 'scene-test-1',
    sceneNumber: 1,
    sceneTitle: 'The Sunny Meadow Discovery',
    narration: 'Milo and Pip walked through the blossoming flower fields.',
    visualPrompt: 'Sunlit flower fields with gentle rolling green hills and morning mist.',
    durationMs: 18000,
    characterInstances: [
      { instanceId: 'inst-1', characterId: 'char-milo', name: 'Milo', x: 460, y: 480, scale: 1.0 },
      { instanceId: 'inst-2', characterId: 'char-pip', name: 'Pip', x: 820, y: 480, scale: 1.0 },
    ],
    dialogueLines: [
      { characterName: 'Milo', text: 'Look at those butterflies!', emotion: 'excited' },
      { characterName: 'Pip', text: 'They are leading us to the cave!', emotion: 'happy' },
    ],
  };

  const shots = ShotDirectorService.planShotsRuleEngine(sceneParams);

  // 1. Should generate 2 or 3 distinct shots
  assert.ok(shots.length >= 2 && shots.length <= 4, `Expected 2-4 shots, got ${shots.length}`);

  // 2. Sum of shot durations should match scene duration
  const totalDuration = shots.reduce((sum, s) => sum + s.durationMs, 0);
  assert.strictEqual(totalDuration, 18000, 'Sum of shot durations must equal total scene duration');

  // 3. Timeline cursors startMs and endMs must be continuous without gaps
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    if (i === 0) {
      assert.strictEqual(s.startMs, 0);
    } else {
      assert.strictEqual(s.startMs, shots[i - 1].endMs, `Shot ${i + 1} startMs must equal Shot ${i} endMs`);
    }
    assert.ok(s.endMs > s.startMs, 'Shot endMs must be greater than startMs');
  }

  // 4. Background prompts must be strictly environment-only
  for (const s of shots) {
    assert.ok(s.backgroundPrompt && s.backgroundPrompt.length > 20, 'Background prompt must be non-empty');
    assert.strictEqual(s.backgroundPrompt.toLowerCase().includes('milo'), false, 'Background prompt must not include character names');
    assert.strictEqual(s.backgroundPrompt.toLowerCase().includes('pip'), false, 'Background prompt must not include character names');
    assert.ok(s.videoPrompt && s.videoPrompt.length > 10, 'Video prompt must be non-empty');
  }

  // 5. Character placements must be present and directed
  for (const s of shots) {
    assert.strictEqual(s.characterPlacements.length, 2, 'Both characters must be staged in every shot');
    for (const cp of s.characterPlacements) {
      assert.ok(cp.x >= 100 && cp.x <= 1180, `Placement X (${cp.x}) out of bounds`);
      assert.ok(cp.y >= 300 && cp.y <= 650, `Placement Y (${cp.y}) out of bounds`);
      assert.ok(cp.scale >= 0.8 && cp.scale <= 1.6, `Scale (${cp.scale}) out of bounds`);
      assert.ok(['idle', 'walk', 'wave', 'jump', 'point'].includes(cp.action), `Invalid action: ${cp.action}`);
    }
  }
});

test('Non-Destructive Reconciliation Preserves User Edits & Approved Assets', () => {
  const initialParams: PlanSceneShotsParams = {
    storyId: 'story-recon-1',
    sceneId: 'scene-recon-1',
    sceneNumber: 1,
    sceneTitle: 'Ancient Enchanted Forest',
    narration: 'They stepped quietly into the ancient trees.',
    visualPrompt: 'Massive glowing moss-covered redwood trees with floating motes.',
    durationMs: 14000,
    characterInstances: [
      { instanceId: 'inst-1', characterId: 'char-milo', name: 'Milo', x: 500, y: 480, scale: 1.0 },
    ],
  };

  const initialShots = ShotDirectorService.planShotsRuleEngine(initialParams);
  assert.ok(initialShots.length >= 2);

  // User edits Shot 1: approves it, edits title, edits custom prompt, attaches asset
  const userEditedShot1: CinematicShotData = {
    ...initialShots[0],
    title: 'Custom User Directed Shot 1',
    backgroundPrompt: 'User customized environment: Ultra-glowing cyan mushrooms under starlight',
    promptHistory: [
      ...initialShots[0].promptHistory,
      {
        version: 2,
        backgroundPrompt: 'User customized environment: Ultra-glowing cyan mushrooms under starlight',
        videoPrompt: initialShots[0].videoPrompt,
        createdAt: new Date().toISOString(),
        approved: true,
        notes: 'User tweak',
      },
    ],
    backgroundUrl: '/storage/shots/shot-bg-custom-12345.png',
    approvalStatus: 'approved',
    productionStatus: 'ready',
    characterPlacements: [
      { ...initialShots[0].characterPlacements[0], x: 300, y: 450, action: 'wave' },
    ],
  };

  const existingShots = [userEditedShot1, initialShots[1]];

  // Now trigger regeneration (e.g. scene duration updated to 16000ms)
  const regeneratedPlannedShots = ShotDirectorService.planShotsRuleEngine({
    ...initialParams,
    durationMs: 16000,
  });

  const reconciled = ShotDirectorService.reconcileShots(regeneratedPlannedShots, existingShots);

  assert.strictEqual(reconciled.length, regeneratedPlannedShots.length);

  // Reconciled Shot 1 must preserve user-directed work:
  const reconShot1 = reconciled[0];
  assert.strictEqual(reconShot1.shotId, userEditedShot1.shotId, 'Stable shot ID must be preserved');
  assert.strictEqual(reconShot1.title, 'Custom User Directed Shot 1', 'User edited title must be preserved');
  assert.strictEqual(reconShot1.backgroundPrompt, 'User customized environment: Ultra-glowing cyan mushrooms under starlight', 'Custom prompt must be preserved');
  assert.strictEqual(reconShot1.backgroundUrl, '/storage/shots/shot-bg-custom-12345.png', 'Approved asset URL must not be overwritten');
  assert.strictEqual(reconShot1.approvalStatus, 'approved', 'Approval status must be preserved');
  assert.strictEqual(reconShot1.characterPlacements[0].x, 300, 'Custom character placement X must be preserved');
  assert.strictEqual(reconShot1.characterPlacements[0].action, 'wave', 'Custom character action must be preserved');

  // Timeline cursors must be smoothly re-aligned
  assert.strictEqual(reconShot1.startMs, 0);
  assert.strictEqual(reconciled[1].startMs, reconShot1.endMs);
});

test('Real Shot Asset Upload & File Magic Byte Validation', async () => {
  // 1. Create a valid 1x1 PNG buffer with magic bytes
  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG magic bytes
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
  ]);

  const base64Png = `data:image/png;base64,${validPngBuffer.toString('base64')}`;

  // Direct router test without relying on Windows network socket loopback
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use('/api/shots', shotRouter);

  let responseData: any = null;
  let statusCode = 200;

  const mockReq: any = {
    method: 'POST',
    url: '/test-shot-asset-upload/asset/upload',
    params: { shotId: 'test-shot-asset-upload' },
    body: {
      fileData: base64Png,
      filename: 'storybook-shot-bg.png',
      type: 'image',
    },
    headers: {},
  };

  const mockRes: any = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      responseData = data;
      return this;
    },
  };

  // Test the upload handler route directly
  await new Promise<void>((resolve, reject) => {
    // Find upload route layer in shotRouter
    const layer = (shotRouter.stack as any[]).find(
      (l) => l.route && l.route.path === '/:shotId/asset/upload'
    );
    assert.ok(layer, 'Upload route /:shotId/asset/upload must be registered on shotRouter');
    layer.route.stack[0].handle(mockReq, mockRes, (err: any) => {
      if (err) reject(err);
      else resolve();
    }).then(() => resolve()).catch(reject);
  });

  assert.strictEqual(statusCode, 200, `Expected 200, got ${statusCode}`);
  assert.strictEqual(responseData?.success, true);
  assert.ok(
    responseData?.url && responseData.url.startsWith('/storage/shots/'),
    `Expected /storage/shots/... path, got ${responseData?.url}`
  );

  // Verify file actually exists on local filesystem
  const diskPath = path.join(process.cwd(), responseData.url.replace(/^\//, ''));
  assert.strictEqual(fs.existsSync(diskPath), true, `Uploaded file must exist on disk at ${diskPath}`);

  // Clean up test file
  try { fs.unlinkSync(diskPath); } catch {}
});

test('Remotion Manifest Adapter integrates Multi-Shot Breakdowns', async () => {
  const adapter = new RemotionManifestAdapter();

  const story = {
    id: 'story-manifest-test',
    storyId: 'story-manifest-test',
    title: 'Multi-Shot Manifest Story',
  };

  const scenes = [
    {
      id: 'scene-1',
      sceneId: 'scene-1',
      number: 1,
      title: 'Scene 1',
      narration: 'A sunny afternoon in the park.',
      startMs: 0,
      endMs: 12000,
      shots: [
        {
          shotId: 'shot-1-1',
          number: 1,
          title: 'Shot 1: Wide',
          durationMs: 6000,
          startMs: 0,
          endMs: 6000,
          shotType: 'wide_establishing',
          cameraMovement: 'slow_zoom_in',
          backgroundUrl: '/storage/shots/shot-1.png',
          characterPlacements: [
            { instanceId: 'inst-1', characterId: 'char-1', x: 450, y: 480, scale: 1.0, flipX: false },
          ],
        },
        {
          shotId: 'shot-1-2',
          number: 2,
          title: 'Shot 2: Medium',
          durationMs: 6000,
          startMs: 6000,
          endMs: 12000,
          shotType: 'medium_twoshot',
          cameraMovement: 'pan_right',
          videoUrl: '/storage/videos/shot-2.mp4',
          characterPlacements: [
            { instanceId: 'inst-1', characterId: 'char-1', x: 600, y: 480, scale: 1.2, flipX: true },
          ],
        },
      ],
      animationData: {
        characterInstances: [
          { instanceId: 'inst-1', characterId: 'char-1', x: 450, y: 480, scale: 1.0 },
        ],
      },
    },
  ];

  const manifest = await adapter.buildManifest(story, scenes);

  assert.strictEqual(manifest.scenes.length, 1);
  const sc = manifest.scenes[0];
  assert.ok(sc.shots && sc.shots.length === 2, 'Remotion scene must contain adapted shots');

  const shot1 = sc.shots[0];
  assert.strictEqual(shot1.id, 'shot-1-1');
  assert.strictEqual(shot1.shotType, 'wide_establishing');
  assert.strictEqual(shot1.cameraMovement, 'slow_zoom_in');
  assert.ok(shot1.backgroundUrl && shot1.backgroundUrl.includes('/storage/shots/shot-1.png'));
  assert.strictEqual(shot1.characterPlacements?.[0].x, 450);

  const shot2 = sc.shots[1];
  assert.strictEqual(shot2.id, 'shot-1-2');
  assert.ok(shot2.videoUrl && shot2.videoUrl.includes('/storage/videos/shot-2.mp4'));
  assert.strictEqual(shot2.characterPlacements?.[0].flipX, true);
});
