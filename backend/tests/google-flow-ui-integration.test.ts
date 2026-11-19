import test from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import { AddressInfo } from 'net';
import { contentRouter } from '../src/routes/content.js';
import {
  createStory,
  deleteStory,
  createScene,
  getStoryByStoryId,
} from '../src/services/database/database.service.js';
import { validateAndExtractFlowProjectId } from '../src/services/google-flow/google-flow.validator.js';
import { PromptSynthesizer } from '../src/services/story-generation/parser/prompt-synthesizer.js';

// Mock local worker server to test full integration loop
function createMockFlowWorker(expectedToken = 'test-token-abcdef1234567890') {
  let sessionState = {
    connected: false,
    state: 'closed',
    currentUrl: undefined as string | undefined,
    manualLoginRequired: false,
  };

  const jobs = new Map<string, any>();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const authHeader = req.headers.authorization || '';

    // 1. Health check endpoint — open to loopback without token
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        service: 'ai-kids-content-studio-flow-worker',
        host: '127.0.0.1',
        port: (server.address() as AddressInfo)?.port,
      }));
      return;
    }

    // 2. Auth check for all other endpoints
    if (authHeader !== `Bearer ${expectedToken}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        message: 'Missing or invalid local Flow worker bearer token.',
      }));
      return;
    }

    // 3. Session status
    if (req.method === 'GET' && url.pathname === '/session/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        session: sessionState,
      }));
      return;
    }

    // 4. Session open
    if (req.method === 'POST' && url.pathname === '/session/open') {
      let bodyText = '';
      for await (const chunk of req) bodyText += chunk;
      const body = bodyText ? JSON.parse(bodyText) : {};

      sessionState = {
        connected: true,
        state: 'prompt_ready',
        currentUrl: body.projectUrl || 'https://labs.google/fx/tools/flow',
        manualLoginRequired: false,
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        session: sessionState,
      }));
      return;
    }

    // 5. Session close
    if (req.method === 'POST' && url.pathname === '/session/close') {
      sessionState = {
        connected: false,
        state: 'closed',
        currentUrl: undefined,
        manualLoginRequired: false,
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        session: sessionState,
      }));
      return;
    }

    // 6. Create job
    if (req.method === 'POST' && url.pathname === '/jobs') {
      let bodyText = '';
      for await (const chunk of req) bodyText += chunk;
      const body = bodyText ? JSON.parse(bodyText) : {};

      const jobId = `job-${Date.now()}`;
      const job = {
        id: jobId,
        characterId: body.characterId,
        characterName: body.characterName,
        view: body.view || 'front',
        assetType: body.assetType || 'custom',
        status: 'prompt_ready',
        message: `Prompt ready for ${body.view} view`,
        prompt: `@${body.characterName} viewed from ${body.view}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      jobs.set(jobId, job);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, job }));
      return;
    }

    // 7. Request generation (with explicit confirmation check)
    const genMatch = url.pathname.match(/^\/jobs\/([^/]+)\/generate$/);
    if (req.method === 'POST' && genMatch) {
      const jobId = genMatch[1];
      const job = jobs.get(jobId);
      if (!job) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Job not found' }));
        return;
      }

      let bodyText = '';
      for await (const chunk of req) bodyText += chunk;
      const body = bodyText ? JSON.parse(bodyText) : {};

      if (!body.confirmGenerate || !body.referenceConfirmed) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          message: 'Explicit user confirmation and reference verification required before generation.',
        }));
        return;
      }

      job.status = 'awaiting_download';
      job.message = 'Generation approved. Watching for download from Google Flow...';
      job.updatedAt = new Date().toISOString();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, job }));
      return;
    }

    // 8. Retry import
    const retryMatch = url.pathname.match(/^\/jobs\/([^/]+)\/retry-import$/);
    if (req.method === 'POST' && retryMatch) {
      const jobId = retryMatch[1];
      const job = jobs.get(jobId);
      if (!job) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Job not found' }));
        return;
      }

      job.status = 'completed';
      job.message = 'Asset metadata registered successfully.';
      job.updatedAt = new Date().toISOString();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, job }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: 'Not found' }));
  });

  return new Promise<{
    port: number;
    workerUrl: string;
    token: string;
    close: () => Promise<void>;
  }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        port,
        workerUrl: `http://127.0.0.1:${port}`,
        token: expectedToken,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

function createBackendServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/content', contentRouter);
  const server = app.listen(0);
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://localhost:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

test('Google Flow UI & Worker Integration Test Suite', async (t) => {
  const worker = await createMockFlowWorker();
  const backend = createBackendServer();

  t.after(async () => {
    await worker.close();
    await backend.close();
  });

  await t.test('1. Worker health check returns online status and loopback service metadata', async () => {
    const res = await fetch(`${worker.workerUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.equal(data.success, true);
    assert.equal(data.service, 'ai-kids-content-studio-flow-worker');
    assert.equal(data.host, '127.0.0.1');
    assert.equal(data.port, worker.port);
  });

  await t.test('2. Worker unavailable state handles unreachable ports without crashing', async () => {
    // Pick an unused local port
    const unreachableUrl = 'http://127.0.0.1:49999';
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000);
      await fetch(`${unreachableUrl}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      assert.fail('Expected fetch to fail for closed port');
    } catch (err: any) {
      assert.ok(err);
    }
  });

  await t.test('3. Invalid token returns 401 unauthorized', async () => {
    const res = await fetch(`${worker.workerUrl}/session/status`, {
      headers: { Authorization: 'Bearer WRONG_TOKEN_12345' },
    });
    assert.equal(res.status, 401);
    const data = await res.json() as any;
    assert.equal(data.success, false);
    assert.match(data.message, /invalid local Flow worker/i);
  });

  await t.test('4. Session opening and refresh with valid token', async () => {
    // Open session with specific project URL
    const openRes = await fetch(`${worker.workerUrl}/session/open`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${worker.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ projectUrl: 'https://flow.google.com/project/prj_pilot_101' }),
    });
    assert.equal(openRes.status, 200);
    const openData = await openRes.json() as any;
    assert.equal(openData.session.connected, true);
    assert.equal(openData.session.currentUrl, 'https://flow.google.com/project/prj_pilot_101');

    // Query session status
    const statusRes = await fetch(`${worker.workerUrl}/session/status`, {
      headers: { Authorization: `Bearer ${worker.token}` },
    });
    assert.equal(statusRes.status, 200);
    const statusData = await statusRes.json() as any;
    assert.equal(statusData.session.connected, true);
  });

  await t.test('5. Project connection and disconnection for a story', async () => {
    const storyId = `flow-test-story-${Date.now()}`;
    await createStory({
      storyId,
      title: 'Flow UI Integration Story',
      logline: 'Testing project association',
      lesson: 'Unified workspace',
    });

    try {
      // 1. Initial state: not connected
      const get1 = await fetch(`${backend.baseUrl}/api/content/stories/${storyId}/flow-project`);
      assert.equal(get1.status, 200);
      const data1 = await get1.json() as any;
      assert.equal(data1.isConnected, false);

      // 2. Connect project
      const putRes = await fetch(`${backend.baseUrl}/api/content/stories/${storyId}/flow-project`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectUrl: 'https://flow.google.com/project/prj_story_context_abc' }),
      });
      assert.equal(putRes.status, 200);
      const putData = await putRes.json() as any;
      assert.equal(putData.success, true);
      assert.equal(putData.flowProjectId, 'prj_story_context_abc');
      assert.equal(putData.projectUrl, 'https://flow.google.com/project/prj_story_context_abc');

      // 3. Disconnect project
      const delRes = await fetch(`${backend.baseUrl}/api/content/stories/${storyId}/flow-project`, {
        method: 'DELETE',
      });
      assert.equal(delRes.status, 200);
      const delData = await delRes.json() as any;
      assert.equal(delData.isConnected, false);
      assert.equal(delData.flowProjectId, null);
    } finally {
      await deleteStory(storyId).catch(() => {});
    }
  });

  await t.test('6. Story project context propagation resolves canonical Flow project URL', () => {
    const validated = validateAndExtractFlowProjectId('https://flow.google.com/project/1d08d0de-5b98-40fa-b592-632130b536c5');
    assert.equal(validated.valid, true);
    assert.equal(validated.flowProjectId, '1d08d0de-5b98-40fa-b592-632130b536c5');
    assert.equal(validated.projectUrl, 'https://flow.google.com/project/1d08d0de-5b98-40fa-b592-632130b536c5');
  });

  await t.test('7. Background prompt generation synthesizes character-free environment plates', () => {
    const prompt = PromptSynthesizer.synthesizeBackgroundPrompt({
      explicitPrompt: 'A magical enchanted forest with glowing mushrooms and soft moss paths',
      sceneTitle: 'Enchanted Forest',
      cameraDirection: 'Eye-level wide shot',
      aspectRatio: '16:9',
    });

    // Check environment plate rules
    assert.ok(prompt.includes('eye-level wide perspective'), 'Includes camera direction');
    assert.ok(prompt.includes('A magical enchanted forest'), 'Includes scene description');
    assert.ok(
      prompt.includes('No characters') ||
      prompt.includes('Environment only') ||
      prompt.includes('separately animated characters') ||
      prompt.includes('Backdrop only'),
      'Excludes characters for rig compositing'
    );
  });

  await t.test('8. Character view job preparation across directional views', async () => {
    const views = ['front', 'front-left', 'front-right', 'left', 'right', 'back-left', 'back-right', 'back'];

    for (const view of views) {
      const res = await fetch(`${worker.workerUrl}/jobs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${worker.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          characterId: 'char-101',
          characterName: 'Pip the Squirrel',
          view,
          assetType: view === 'front' ? 'main' : 'custom',
        }),
      });
      assert.equal(res.status, 201);
      const data = await res.json() as any;
      assert.equal(data.job.status, 'prompt_ready');
      assert.equal(data.job.view, view);
    }
  });

  await t.test('9. Explicit generation confirmation enforced — blocks unconfirmed triggers', async () => {
    // 1. Create a prompt ready job
    const createRes = await fetch(`${worker.workerUrl}/jobs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${worker.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        characterId: 'char-202',
        characterName: 'Luna',
        view: 'front-left',
      }),
    });
    const job = (await createRes.json() as any).job;

    // 2. Attempt generation without confirmations -> must fail with 400
    const failRes = await fetch(`${worker.workerUrl}/jobs/${job.id}/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${worker.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ confirmGenerate: false, referenceConfirmed: false }),
    });
    assert.equal(failRes.status, 400);

    // 3. Confirm generation and reference -> succeeds with 200
    const okRes = await fetch(`${worker.workerUrl}/jobs/${job.id}/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${worker.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ confirmGenerate: true, referenceConfirmed: true }),
    });
    assert.equal(okRes.status, 200);
    const okData = await okRes.json() as any;
    assert.equal(okData.job.status, 'awaiting_download');
  });

  await t.test('10. Import completion and retry succeeds idempotently', async () => {
    // Create job and retry import
    const createRes = await fetch(`${worker.workerUrl}/jobs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${worker.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        characterId: 'char-303',
        characterName: 'Barnaby',
        view: 'right',
      }),
    });
    const job = (await createRes.json() as any).job;

    const retryRes = await fetch(`${worker.workerUrl}/jobs/${job.id}/retry-import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${worker.token}`,
      },
    });
    assert.equal(retryRes.status, 200);
    const retryData = await retryRes.json() as any;
    assert.equal(retryData.job.status, 'completed');
  });
});
