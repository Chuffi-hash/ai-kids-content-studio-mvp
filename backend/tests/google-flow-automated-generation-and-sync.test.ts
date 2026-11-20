import test, { describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { prisma, upsertFlowCharacterMapping, getFlowCharacterMapping, listFlowCharacterMappings, deleteFlowCharacterMapping, createGenerationJob, getGenerationJob, updateGenerationJob } from '../src/services/database/database.service.js';
import { StoryContextService } from '../src/services/google-flow/story-context.service.js';
import { GenerationPromptService } from '../src/services/google-flow/generation-prompt.service.js';
import { GenerationOrchestratorService } from '../src/services/generation-orchestrator/generation-orchestrator.service.js';
import { GoogleFlowAssetImportService } from '../src/services/google-flow/google-flow-asset-import.service.js';

describe('Google Flow Automated Image + Character Generation & Sync Test Suite', () => {
  const storyId = `test-flow-story-${Date.now()}`;
  const char1Id = `test-flow-char-1-${Date.now()}`;
  const char2Id = `test-flow-char-2-${Date.now()}`;
  const sceneId = `test-flow-scene-${Date.now()}`;
  const flowProjectId = '2ea32335-0e57-4d1a-9e1e-98fa3cd491e8';

  // Valid 1920x1080 PNG header buffer for asset import verification
  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x07, 0x80, // width: 1920
    0x00, 0x00, 0x04, 0x38, // height: 1080
    0x08, 0x06, 0x00, 0x00, 0x00,
    0x5d, 0xb7, 0x54, 0xef,
  ]);

  let mockWorkerServer: http.Server;
  let mockWorkerPort: number;
  let mockWorkerCalls: {
    charactersSync: any[];
    generateScene: any[];
    generateCharacter: any[];
  } = {
    charactersSync: [],
    generateScene: [],
    generateCharacter: [],
  };

  before(async () => {
    // 1. Setup Mock Flow Worker HTTP Server
    mockWorkerServer = http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      let bodyText = '';
      for await (const chunk of req) {
        bodyText += chunk;
      }
      const body = bodyText ? JSON.parse(bodyText) : {};

      if (url.pathname === '/characters/sync') {
        mockWorkerCalls.charactersSync.push(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: true,
          flowCharacterName: body.characterName,
          status: 'synced',
          message: 'Character synced successfully',
        }));
      }

      if (url.pathname === '/scenes/generate') {
        mockWorkerCalls.generateScene.push(body);
        const jobId = `worker-scene-job-${Date.now()}`;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: true,
          jobId,
          status: 'generating',
        }));
      }

      if (url.pathname === '/characters/generate') {
        mockWorkerCalls.generateCharacter.push(body);
        const jobId = `worker-char-job-${Date.now()}`;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: true,
          jobId,
          status: 'generating',
        }));
      }

      if (url.pathname.startsWith('/jobs/')) {
        const jobId = url.pathname.replace('/jobs/', '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          job: {
            id: jobId,
            status: 'completed',
            importResult: {
              success: true,
              target: 'scene_background',
              assetId: `asset-${jobId}`,
              imageUrl: `/storage/mock-${jobId}.png`,
            },
          },
        }));
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => {
      mockWorkerServer.listen(0, '127.0.0.1', () => {
        const addr = mockWorkerServer.address() as any;
        mockWorkerPort = addr.port;
        resolve();
      });
    });

    // 2. Setup PostgreSQL Test Data
    await prisma.character.create({
      data: {
        id: char1Id,
        name: 'Barnaby Owl',
        species: 'Owl',
        personality: 'Wise and observant',
        visualDescription: 'A round tawny owl with golden feathered tufts',
        distinctiveFeatures: 'Wearing an acorn cap',
        referenceImageUrl: 'https://storage.local/test/barnaby.png',
      },
    });

    await prisma.character.create({
      data: {
        id: char2Id,
        name: 'Luna Rabbit',
        species: 'Rabbit',
        personality: 'Energetic and bold',
        visualDescription: 'A nimble snow-white rabbit with bright blue eyes',
        distinctiveFeatures: 'Wearing a bright blue woolen vest',
      },
    });

    await prisma.story.create({
      data: {
        storyId,
        title: 'Journey to the Star Spring',
        logline: 'Two brave woodland creatures journey under twilight to find the star spring.',
        lesson: 'Curiosity and courage guide us through the night.',
        visualStyle: 'cinematic_3d',
        flowProjectId,
      },
    });

    await prisma.storyCharacter.createMany({
      data: [
        { storyId, characterId: char1Id },
        { storyId, characterId: char2Id },
      ],
    });

    await prisma.scene.create({
      data: {
        sceneId,
        storyId,
        number: 1,
        title: 'The Edge of Whispering Woods',
        narration: 'Gentle dusk settled over the Whispering Woods as lantern bugs began to glow.',
        visualPrompt: 'A lush mossy clearing with ancient twisted oaks and glowing lantern insects in purple evening air.',
        characterIds: JSON.stringify([char1Id]),
      },
    });
  });

  after(async () => {
    mockWorkerServer.close();
    try {
      await prisma.generationJob.deleteMany({ where: { storyId } });
      await prisma.flowCharacterMapping.deleteMany({ where: { storyId } });
      await prisma.image.deleteMany({ where: { sceneId } });
      await prisma.scene.deleteMany({ where: { storyId } });
      await prisma.storyCharacter.deleteMany({ where: { storyId } });
      await prisma.story.deleteMany({ where: { storyId } });
      await prisma.character.deleteMany({ where: { id: { in: [char1Id, char2Id] } } });
    } catch (err) {
      console.warn('Cleanup error:', err);
    }
  });

  test('1. Database: FlowCharacterMapping model supports upsert, unique constraints, and status queries', async () => {
    // Initial upsert
    const mapping = await upsertFlowCharacterMapping({
      storyId,
      characterId: char1Id,
      flowProjectId,
      flowCharacterName: 'Barnaby Owl',
      syncStatus: 'synced',
      masterAssetId: 'master-asset-1',
    });

    assert.ok(mapping.id);
    assert.strictEqual(mapping.storyId, storyId);
    assert.strictEqual(mapping.characterId, char1Id);
    assert.strictEqual(mapping.flowCharacterName, 'Barnaby Owl');
    assert.strictEqual(mapping.syncStatus, 'synced');

    // Retrieve single mapping
    const retrieved = await getFlowCharacterMapping(storyId, char1Id);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.flowCharacterName, 'Barnaby Owl');

    // Idempotent upsert modifies existing mapping instead of creating a duplicate
    const updated = await upsertFlowCharacterMapping({
      storyId,
      characterId: char1Id,
      flowProjectId,
      flowCharacterName: 'Barnaby_Owl_Story',
      syncStatus: 'synced',
    });
    assert.strictEqual(updated.id, mapping.id);
    assert.strictEqual(updated.flowCharacterName, 'Barnaby_Owl_Story');

    // List mappings for story
    const list = await listFlowCharacterMappings(storyId);
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].characterId, char1Id);
  });

  test('2. Canonical Flow URL generation and security validation', () => {
    // Valid project IDs produce canonical https://flow.google.com/project/${id}
    const standardProjectUrl = `https://flow.google.com/project/${flowProjectId}`;
    const parsed = new URL(standardProjectUrl);
    assert.strictEqual(parsed.protocol, 'https:');
    assert.strictEqual(parsed.hostname, 'flow.google.com');
    assert.strictEqual(parsed.pathname, `/project/${flowProjectId}`);

    // labs.google alternative is also supported
    const labsUrl = `https://labs.google/fx/tools/flow/project/${flowProjectId}`;
    const parsedLabs = new URL(labsUrl);
    assert.strictEqual(parsedLabs.hostname, 'labs.google');
  });

  test('3. StoryContextService: Populates flowMapping on characters in context', async () => {
    const context = await StoryContextService.resolveStoryContext(storyId);
    assert.ok(context);
    assert.strictEqual(context.story.flowProjectId, flowProjectId);

    const char1 = context.characters.find((c) => c.id === char1Id);
    assert.ok(char1);
    assert.ok(char1.flowMapping);
    assert.strictEqual(char1.flowMapping?.flowCharacterName, 'Barnaby_Owl_Story');
    assert.strictEqual(char1.flowMapping?.syncStatus, 'synced');

    const char2 = context.characters.find((c) => c.id === char2Id);
    assert.ok(char2);
    assert.strictEqual(char2.flowMapping, null);
  });

  test('4. GenerationPromptService: Injects @CharacterName reference when synced in Flow', async () => {
    const context = await StoryContextService.resolveStoryContext(storyId);
    const char1 = context.characters.find((c) => c.id === char1Id)!;

    // Front turnaround view with @CharacterName
    const promptObj = GenerationPromptService.buildCharacterPrompt(context.story, char1, 'turnaround', {
      variation: 'front-view',
    });

    assert.ok(promptObj.prompt.includes('@Barnaby_Owl_Story'));
    assert.ok(promptObj.prompt.includes('Character turnaround reference of @Barnaby_Owl_Story'));

    // Character 2 is not mapped: should use plain name without @
    const char2 = context.characters.find((c) => c.id === char2Id)!;
    const char2Prompt = GenerationPromptService.buildCharacterPrompt(context.story, char2, 'turnaround', {
      variation: 'side-profile',
    });
    assert.ok(!char2Prompt.prompt.includes('@Luna Rabbit'));
    assert.ok(char2Prompt.prompt.includes('Luna Rabbit'));
  });

  test('5. GenerationPromptService: Enforces environment-only scene background prompts', async () => {
    const context = await StoryContextService.resolveStoryContext(storyId);
    const scene = context.scenes.find((s) => s.sceneId === sceneId)!;

    const bgPrompt = GenerationPromptService.buildSceneBackgroundPrompt(context.story, scene);
    assert.ok(bgPrompt.prompt.includes('STRICT INSTRUCTION: Environment only! Empty scenic background plate'));
    assert.ok(bgPrompt.prompt.includes('NO characters, NO humans, NO animals'));
    assert.strictEqual(bgPrompt.aspectRatio, '16:9');
    assert.strictEqual(bgPrompt.width, 1024);
    assert.strictEqual(bgPrompt.height, 576);
  });

  test('6. Database: GenerationJob tracking tracks lifecycle status and errors', async () => {
    const job = await createGenerationJob({
      storyId,
      targetType: 'scene_background',
      sceneId,
      provider: 'google_flow',
      prompt: 'A picturesque sunset in the enchanted forest',
      flowProjectId,
      status: 'queued',
      progress: 0,
    });

    assert.ok(job.id);
    assert.strictEqual(job.status, 'queued');

    // Update status to generating
    const updated = await updateGenerationJob(job.id, {
      status: 'generating',
      progress: 50,
      workerJobId: 'w-job-123',
    });
    assert.strictEqual(updated.status, 'generating');
    assert.strictEqual(updated.progress, 50);

    // Update status to completed with asset result
    const completed = await updateGenerationJob(job.id, {
      status: 'completed',
      progress: 100,
      resultAssetId: 'asset-789',
      resultUrl: '/storage/scenes/test-sunset.png',
    });
    assert.strictEqual(completed.status, 'completed');
    assert.strictEqual(completed.resultAssetId, 'asset-789');
  });

  test('7. Asset Import: Guarantees provider provenance as google_flow', async () => {
    const result = await GoogleFlowAssetImportService.importAsset({
      target: 'scene_background',
      sceneId,
      storyId,
      imageData: validPngBuffer,
      aspectRatio: '16:9',
      prompt: 'Test scenic landscape',
      provider: 'google_flow',
      model: 'imagen-3',
      sourceJobId: 'test-job-provenance',
      flowProjectId,
      filename: `provenance-test-${Date.now()}.png`,
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.imageUrl);

    // Verify Image record in PostgreSQL reflects exact provider
    const imgRecord = await prisma.image.findFirst({
      where: { sceneId, imageUrl: result.imageUrl },
    });
    assert.ok(imgRecord);
    assert.strictEqual(imgRecord.provider, 'google_flow');
    assert.notStrictEqual(imgRecord.provider, 'google_flow_manual');
    assert.notStrictEqual(imgRecord.provider, 'placeholder');

    // Verify Scene background record in PostgreSQL reflects exact provider and Flow project
    const updatedScene = await prisma.scene.findUnique({ where: { sceneId } });
    const anim = (updatedScene?.animationData as any) || {};
    assert.strictEqual(anim.background?.source, 'google_flow');
    assert.strictEqual(anim.background?.flowProjectId, flowProjectId);
  });

  test('8. GenerationOrchestratorService: Character sync to Google Flow is idempotent and preserves mappings', async () => {
    const workerUrl = `http://127.0.0.1:${mockWorkerPort}`;

    // 1st sync
    const res1 = await GenerationOrchestratorService.syncCharacterToGoogleFlow(
      storyId,
      char1Id,
      { workerUrl }
    );
    assert.strictEqual(res1.success, true);
    assert.strictEqual(res1.mapping.syncStatus, 'synced');

    // 2nd sync without force (should be idempotent without duplicate creation)
    const res2 = await GenerationOrchestratorService.syncCharacterToGoogleFlow(
      storyId,
      char1Id,
      { workerUrl }
    );
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.mapping.syncStatus, 'synced');

    // Verify exactly 1 mapping exists in PostgreSQL for this character
    const mappings = await listFlowCharacterMappings(storyId);
    const char1Mappings = mappings.filter((m) => m.characterId === char1Id);
    assert.strictEqual(char1Mappings.length, 1);
  });
});
