import test from 'node:test';
import assert from 'node:assert';
import 'dotenv/config';
import express from 'express';
import { AddressInfo } from 'net';
import { contentRouter } from '../src/routes/content.js';
import {
  createStory,
  deleteStory,
  getStoryByStoryId,
} from '../src/services/database/database.service.js';
import { validateAndExtractFlowProjectId } from '../src/services/google-flow/google-flow.validator.js';

function createTestServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/content', contentRouter);
  const server = app.listen(0);
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://localhost:${port}`;
  return {
    baseUrl,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test('Google Flow URL Validator Unit Tests', () => {
  // 1. Valid full Google Flow URLs
  const validUrl1 = validateAndExtractFlowProjectId('https://flow.google.com/project/1d08d0de-5b98-40fa-b592-632130b536c5');
  assert.strictEqual(validUrl1.valid, true);
  assert.strictEqual(validUrl1.flowProjectId, '1d08d0de-5b98-40fa-b592-632130b536c5');
  assert.strictEqual(validUrl1.projectUrl, 'https://flow.google.com/project/1d08d0de-5b98-40fa-b592-632130b536c5');

  // URL with trailing slash and query params
  const validUrl2 = validateAndExtractFlowProjectId('https://flow.google.com/project/proj-12345/?tab=scenes');
  assert.strictEqual(validUrl2.valid, true);
  assert.strictEqual(validUrl2.flowProjectId, 'proj-12345');

  // URL without https prefix
  const validUrl3 = validateAndExtractFlowProjectId('flow.google.com/project/alpha-beta-999');
  assert.strictEqual(validUrl3.valid, true);
  assert.strictEqual(validUrl3.flowProjectId, 'alpha-beta-999');

  // Raw project ID
  const validRawId = validateAndExtractFlowProjectId('1d08d0de-5b98-40fa-b592-632130b536c5');
  assert.strictEqual(validRawId.valid, true);
  assert.strictEqual(validRawId.flowProjectId, '1d08d0de-5b98-40fa-b592-632130b536c5');

  // 2. Invalid inputs
  // Empty
  assert.strictEqual(validateAndExtractFlowProjectId('').valid, false);
  // Invalid host
  const invalidHost = validateAndExtractFlowProjectId('https://malicious.com/project/123456');
  assert.strictEqual(invalidHost.valid, false);
  assert.match(invalidHost.error || '', /Invalid host/);

  // Missing project ID
  const missingId = validateAndExtractFlowProjectId('https://flow.google.com/about');
  assert.strictEqual(missingId.valid, false);
});

test('Google Flow Story Integration API Endpoints', async (t) => {
  const { baseUrl, close } = createTestServer();
  const testStoryId = `test-flow-story-${Date.now()}`;

  t.after(async () => {
    try {
      await deleteStory(testStoryId);
    } catch {
      // safe cleanup
    }
    await close();
  });

  // Create test story
  await createStory({
    storyId: testStoryId,
    title: 'Flow Test Story',
    logline: 'Testing Google Flow connection',
    lesson: 'Connections work cleanly',
  });

  // 1. GET flow project when not connected
  const getInitial = await fetch(`${baseUrl}/api/content/stories/${testStoryId}/flow-project`);
  assert.strictEqual(getInitial.status, 200);
  const initialData = (await getInitial.json()) as any;
  assert.strictEqual(initialData.isConnected, false);
  assert.strictEqual(initialData.flowProjectId, null);

  // 2. PUT connect valid Google Flow project
  const connectRes = await fetch(`${baseUrl}/api/content/stories/${testStoryId}/flow-project`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectUrl: 'https://flow.google.com/project/1d08d0de-5b98-40fa-b592-632130b536c5',
    }),
  });
  assert.strictEqual(connectRes.status, 200);
  const connectData = (await connectRes.json()) as any;
  assert.strictEqual(connectData.success, true);
  assert.strictEqual(connectData.isConnected, true);
  assert.strictEqual(connectData.flowProjectId, '1d08d0de-5b98-40fa-b592-632130b536c5');
  assert.strictEqual(connectData.projectUrl, 'https://flow.google.com/project/1d08d0de-5b98-40fa-b592-632130b536c5');

  // Verify in database directly
  const dbStory = await getStoryByStoryId(testStoryId);
  assert.strictEqual((dbStory as any)?.flowProjectId, '1d08d0de-5b98-40fa-b592-632130b536c5');

  // 3. GET flow project when connected
  const getConnected = await fetch(`${baseUrl}/api/content/story/${testStoryId}/flow-project`);
  assert.strictEqual(getConnected.status, 200);
  const connectedData = (await getConnected.json()) as any;
  assert.strictEqual(connectedData.isConnected, true);
  assert.strictEqual(connectedData.flowProjectId, '1d08d0de-5b98-40fa-b592-632130b536c5');
  assert.strictEqual(connectedData.projectUrl, 'https://flow.google.com/project/1d08d0de-5b98-40fa-b592-632130b536c5');

  // 4. PUT update with raw UUID
  const updateRes = await fetch(`${baseUrl}/api/content/stories/${testStoryId}/flow-project`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      flowProjectId: 'aabbcc-112233-445566',
    }),
  });
  assert.strictEqual(updateRes.status, 200);
  const updateData = (await updateRes.json()) as any;
  assert.strictEqual(updateData.flowProjectId, 'aabbcc-112233-445566');

  // 5. PUT with invalid URL should fail with 400
  const invalidRes = await fetch(`${baseUrl}/api/content/stories/${testStoryId}/flow-project`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectUrl: 'https://notgoogle.com/project/fake-id',
    }),
  });
  assert.strictEqual(invalidRes.status, 400);

  // 6. DELETE disconnect project
  const deleteRes = await fetch(`${baseUrl}/api/content/stories/${testStoryId}/flow-project`, {
    method: 'DELETE',
  });
  assert.strictEqual(deleteRes.status, 200);
  const deleteData = (await deleteRes.json()) as any;
  assert.strictEqual(deleteData.isConnected, false);
  assert.strictEqual(deleteData.flowProjectId, null);

  // Verify DB state after disconnect
  const dbAfterDelete = await getStoryByStoryId(testStoryId);
  assert.strictEqual((dbAfterDelete as any)?.flowProjectId, null);
});
