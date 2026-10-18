import test from 'node:test';
import assert from 'node:assert';
import 'dotenv/config';
import express from 'express';
import { AddressInfo } from 'net';
import { characterRouter } from '../src/routes/characters.js';
import { contentRouter } from '../src/routes/content.js';
import {
  createStory,
  createScene,
  getSceneBySceneId,
  deleteStory,
  createCharacter,
  getCharacterById,
  deleteCharacter,
} from '../src/services/database/database.service.js';
import {
  VectorAnimationEngine,
  VectorSceneData,
  FacialExpression,
  MouthShape,
  evaluatePose,
} from '../src/services/animation/vector-animation.engine.js';
import { getVectorRig } from '../src/services/animation/templates/default-characters.js';
import {
  getHeadShapesForPose,
  extractFaceAnchors,
  generateDynamicFaceShapes,
} from '../src/services/animation/face-renderer.js';
import { generateVisemeCues } from '../src/services/audio-generation/viseme-generator.js';

// Helper to launch ephemeral test server
function createTestServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use('/api/characters', characterRouter);
  app.use('/api/content', contentRouter);
  const server = app.listen(0);
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://localhost:${port}`;
  return {
    baseUrl,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test('Expressive Characters, Default Voices, and Lip-Sync Suite', async (t) => {
  const { baseUrl, close } = createTestServer();
  const testStoryId = `test-story-expr-${Date.now()}`;
  const testSceneId = `test-scene-expr-${Date.now()}`;
  const testCharId = `test-char-${Date.now()}`;

  t.after(async () => {
    try {
      await deleteStory(testStoryId);
    } catch {}
    try {
      await deleteCharacter(testCharId);
    } catch {}
    await close();
  });

  await t.test('1. Regression Safety — Neutral expression and rest mouth returns base shapes untouched', () => {
    const pipRig = getVectorRig('pip_the_bear');
    const baseHeadShapes = pipRig.parts.head.shapes;

    const pose = {
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      flipX: false,
      torsoBobY: 0,
      torsoAngle: 0,
      headAngle: 0,
      leftArmAngle: 0,
      rightArmAngle: 0,
      leftForearmAngle: 0,
      rightForearmAngle: 0,
      leftLegAngle: 0,
      rightLegAngle: 0,
      chestScaleY: 1,
      activeAction: 'idle',
      expression: 'neutral' as FacialExpression,
      mouthState: 'rest' as MouthShape,
      speaking: false,
    };

    const rendered = getHeadShapesForPose(pipRig, pose);
    assert.strictEqual(rendered.length, baseHeadShapes.length, 'Shape count should match base shapes');
    assert.deepStrictEqual(rendered, baseHeadShapes, 'Baseline shapes must be 100% identical when neutral');
  });

  await t.test('2. Dynamic Expressions — All 8 expressions render distinct eye and brow geometry', () => {
    const pipRig = getVectorRig('pip_the_bear');
    const expressions: FacialExpression[] = [
      'neutral',
      'happy',
      'sad',
      'angry',
      'surprised',
      'scared',
      'confused',
      'curious',
    ];

    const renderedExpressions: Record<string, string> = {};

    for (const expr of expressions) {
      const pose = {
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        flipX: false,
        torsoBobY: 0,
        torsoAngle: 0,
        headAngle: 0,
        leftArmAngle: 0,
        rightArmAngle: 0,
        leftForearmAngle: 0,
        rightForearmAngle: 0,
        leftLegAngle: 0,
        rightLegAngle: 0,
        chestScaleY: 1,
        activeAction: 'idle',
        expression: expr,
        mouthState: 'rest' as MouthShape,
        speaking: expr !== 'neutral', // test dynamic branch
      };

      const shapes = getHeadShapesForPose(pipRig, pose);
      assert(shapes.length > 0, `Shapes must be generated for ${expr}`);
      
      // Serialize face paths to ensure expressions are distinct
      const serialized = shapes.map((s) => s.d || `${s.type}-${s.cx}-${s.cy}`).join(';');
      renderedExpressions[expr] = serialized;
    }

    // Verify happy != sad, angry != surprised, etc.
    assert.notStrictEqual(renderedExpressions['happy'], renderedExpressions['sad'], 'Happy and sad must differ');
    assert.notStrictEqual(renderedExpressions['angry'], renderedExpressions['surprised'], 'Angry and surprised must differ');
    assert.notStrictEqual(renderedExpressions['scared'], renderedExpressions['curious'], 'Scared and curious must differ');
  });

  await t.test('3. Lip-Sync Mouth Shapes — All 5 mouth shapes render properly', () => {
    const sammyRig = getVectorRig('sammy_the_kid');
    const mouthShapes: MouthShape[] = ['rest', 'open', 'wide', 'round', 'closed'];
    const generatedShapes: Record<string, any[]> = {};

    for (const shape of mouthShapes) {
      const pose = {
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        flipX: false,
        torsoBobY: 0,
        torsoAngle: 0,
        headAngle: 0,
        leftArmAngle: 0,
        rightArmAngle: 0,
        leftForearmAngle: 0,
        rightForearmAngle: 0,
        leftLegAngle: 0,
        rightLegAngle: 0,
        chestScaleY: 1,
        activeAction: 'idle',
        expression: 'happy' as FacialExpression,
        mouthState: shape,
        speaking: true,
      };

      const shapes = getHeadShapesForPose(sammyRig, pose);
      const mouthShape = shapes.find((s) => s.tag === 'mouth');
      assert(mouthShape, `Mouth shape must be tagged and present for ${shape}`);
      generatedShapes[shape] = shapes;
    }

    // Verify open vs round vs closed mouth paths differ
    const openD = generatedShapes['open'].find((s) => s.tag === 'mouth')?.d;
    const roundD = generatedShapes['round'].find((s) => s.tag === 'mouth')?.d;
    const closedD = generatedShapes['closed'].find((s) => s.tag === 'mouth')?.d;
    assert.notStrictEqual(openD, roundD, 'Open and round mouth paths must differ');
    assert.notStrictEqual(roundD, closedD, 'Round and closed mouth paths must differ');
  });

  await t.test('4. Viseme Cadence Generator — Generates deterministic timed mouth cues from spoken text', () => {
    const text = 'Hello little bear, let us explore the tall mountain together!';
    const durationMs = 3200;

    const cues = generateVisemeCues(text, durationMs);
    assert(cues.length > 0, 'Viseme cues must be generated');

    // First cue should start at or near 0
    assert.strictEqual(cues[0].timeMs, 0, 'First cue should start at 0ms');

    // All cues must fall within duration
    for (const cue of cues) {
      assert(cue.timeMs >= 0, 'Cue timeMs must be >= 0');
      assert(cue.timeMs <= durationMs, 'Cue timeMs must be <= durationMs');
      assert(['rest', 'open', 'wide', 'round', 'closed'].includes(cue.shape), 'Must be valid mouth shape');
    }

    // Last cue should return to rest or closed
    const lastCue = cues[cues.length - 1];
    assert(['rest', 'closed'].includes(lastCue.shape), 'Speech should end in resting or closed state');
  });

  await t.test('5. Character Default Voice Endpoint — Persists Kokoro-82M voice in canonicalAppearance without DB migrations', async () => {
    // Create test character
    await createCharacter({
      id: testCharId,
      name: 'Oliver Owl',
      species: 'owl',
      personality: 'Wise and observant',
      visualDescription: 'A brown horned owl with round golden glasses',
      canonicalAppearance: {
        version: 1,
        species: 'owl',
      },
    });

    // 1. GET default voice before setting
    const getRes1 = await fetch(`${baseUrl}/api/characters/${testCharId}/voice`);
    assert.strictEqual(getRes1.status, 200);
    const body1 = await getRes1.json();
    assert(body1.voiceConfig, 'Should return default fallback voice config');

    // 2. PUT update voice config
    const updatePayload = {
      voiceId: 'bm_daniel',
      speed: 1.15,
      style: 'curious',
      effect: 'normal',
    };

    const putRes = await fetch(`${baseUrl}/api/characters/${testCharId}/voice`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload),
    });

    assert.strictEqual(putRes.status, 200);
    const putBody = await putRes.json();
    assert.strictEqual(putBody.success, true);
    assert.strictEqual(putBody.voiceConfig.voiceId, 'bm_daniel');
    assert.strictEqual(putBody.voiceConfig.speed, 1.15);
    assert.strictEqual(putBody.voiceConfig.style, 'curious');

    // 3. GET verify persistence in database
    const getRes2 = await fetch(`${baseUrl}/api/characters/${testCharId}/voice`);
    assert.strictEqual(getRes2.status, 200);
    const body2 = await getRes2.json();
    assert.strictEqual(body2.voiceConfig.voiceId, 'bm_daniel');
    assert.strictEqual(body2.voiceConfig.speed, 1.15);
    assert.strictEqual(body2.voiceConfig.style, 'curious');

    // Also verify direct DB read has canonicalAppearance.voiceConfig
    const dbChar = await getCharacterById(testCharId);
    assert.strictEqual((dbChar?.canonicalAppearance as any)?.voiceConfig?.voiceId, 'bm_daniel');
  });

  await t.test('6. Scene Dialogue Generation API — Synthesizes dialogue, probes duration, generates visemes, and saves to scene', async () => {
    // Create story and scene
    await createStory({
      id: testStoryId,
      storyId: testStoryId,
      title: 'Voice & Lip-Sync Adventure',
      genre: 'adventure',
      targetDuration: 10,
    });

    const initialAnimationData: VectorSceneData = {
      version: 1,
      viewport: { width: 1280, height: 720 },
      characterInstances: [
        {
          instanceId: 'inst-pip-1',
          characterId: 'pip_the_bear',
          name: 'Pip',
          x: 400,
          y: 420,
          scale: 1,
          rotation: 0,
          flipX: false,
          zIndex: 1,
        },
      ],
      animationClips: [],
      expressionCues: [
        {
          instanceId: 'inst-pip-1',
          expression: 'happy',
          startMs: 0,
          durationMs: 5000,
        },
      ],
      dialogueLines: [],
    };

    await createScene({
      sceneId: testSceneId,
      storyId: testStoryId,
      number: 1,
      order: 1,
      title: 'Forest Greeting',
      narration: 'The sun was shining high above the pine trees.',
      startMs: 0,
      endMs: 6000,
      animationData: initialAnimationData,
    });

    // POST /api/content/scenes/:sceneId/dialogue/generate
    const genRes = await fetch(`${baseUrl}/api/content/scenes/${testSceneId}/dialogue/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        characterId: 'pip_the_bear',
        characterInstanceId: 'inst-pip-1',
        characterName: 'Pip',
        text: 'Hello friends! Welcome to the enchanted forest!',
        voice: 'bm_george',
        speakingDirection: 'cheerful',
        speed: 1.0,
        startMs: 500,
      }),
    });

    assert.strictEqual(genRes.status, 200);
    const genBody = await genRes.json();
    assert.strictEqual(genBody.success, true);
    assert(genBody.dialogue, 'Dialogue object must be returned');
    assert(genBody.dialogue.audioUrl, 'Dialogue must contain generated audioUrl');
    assert(genBody.dialogue.durationMs > 0, 'Dialogue must have probed durationMs > 0');
    assert(Array.isArray(genBody.dialogue.visemeCues), 'Dialogue must contain viseme cues');
    assert(genBody.dialogue.visemeCues.length > 0, 'Viseme cues must not be empty');

    // Verify scene in database has the dialogue line attached
    const updatedScene = await getSceneBySceneId(testSceneId);
    const savedDialogues = (updatedScene?.animationData as any)?.dialogueLines || [];
    assert.strictEqual(savedDialogues.length, 1);
    assert.strictEqual(savedDialogues[0].text, 'Hello friends! Welcome to the enchanted forest!');
    assert.strictEqual(savedDialogues[0].characterName, 'Pip');
  });

  await t.test('7. Pose Evaluation with Expression and Dialogue — Animates speaker mouth and keeps listener at rest', () => {
    const pipInst = {
      instanceId: 'inst-pip',
      characterId: 'pip_the_bear',
      name: 'Pip',
      x: 300,
      y: 400,
      scale: 1,
      rotation: 0,
      flipX: false,
      zIndex: 1,
    };

    const sammyInst = {
      instanceId: 'inst-sammy',
      characterId: 'sammy_the_kid',
      name: 'Sammy',
      x: 800,
      y: 400,
      scale: 1,
      rotation: 0,
      flipX: true,
      zIndex: 1,
    };

    const expressionCues = [
      {
        instanceId: 'inst-pip',
        expression: 'happy' as FacialExpression,
        startMs: 0,
        durationMs: 5000,
      },
      {
        instanceId: 'inst-sammy',
        expression: 'surprised' as FacialExpression,
        startMs: 0,
        durationMs: 5000,
      },
    ];

    const dialogueLines = [
      {
        id: 'dlg-1',
        characterInstanceId: 'inst-pip',
        characterName: 'Pip',
        text: 'Look over there!',
        startMs: 1000,
        durationMs: 2000,
        visemeCues: [
          { timeMs: 0, shape: 'open' as MouthShape, durationMs: 400 },
          { timeMs: 400, shape: 'wide' as MouthShape, durationMs: 400 },
          { timeMs: 800, shape: 'round' as MouthShape, durationMs: 400 },
        ],
      },
    ];

    // At 1200ms: Pip is speaking (offset 200ms into dialogue, matches first cue 'open')
    const pipPoseAt1200 = evaluatePose(pipInst, [], 1200, expressionCues, dialogueLines);
    assert.strictEqual(pipPoseAt1200.expression, 'happy');
    assert.strictEqual(pipPoseAt1200.speaking, true);
    assert.strictEqual(pipPoseAt1200.mouthState, 'open');

    // At 1200ms: Sammy is NOT speaking, expression is 'surprised', mouthState is 'rest'
    const sammyPoseAt1200 = evaluatePose(sammyInst, [], 1200, expressionCues, dialogueLines);
    assert.strictEqual(sammyPoseAt1200.expression, 'surprised');
    assert.strictEqual(sammyPoseAt1200.speaking, false);
    assert.strictEqual(sammyPoseAt1200.mouthState, 'rest');

    // Before dialogue (500ms): Pip is NOT speaking yet
    const pipPoseAt500 = evaluatePose(pipInst, [], 500, expressionCues, dialogueLines);
    assert.strictEqual(pipPoseAt500.speaking, false);
    assert.strictEqual(pipPoseAt500.mouthState, 'rest');
  });

  await t.test('8. Full Vector Animation SVG & Resvg Frame Render with Expression and Lip-Sync', async () => {
    const engine = new VectorAnimationEngine();
    const sceneData: VectorSceneData = {
      version: 1,
      viewport: { width: 1280, height: 720 },
      characterInstances: [
        {
          instanceId: 'inst-pip',
          characterId: 'pip_the_bear',
          name: 'Pip',
          x: 640,
          y: 450,
          scale: 1,
          rotation: 0,
          flipX: false,
          zIndex: 1,
        },
      ],
      animationClips: [
        {
          clipId: 'c1',
          instanceId: 'inst-pip',
          action: 'idle',
          startMs: 0,
          durationMs: 5000,
          loop: true,
        },
      ],
      expressionCues: [
        {
          instanceId: 'inst-pip',
          expression: 'happy',
          startMs: 0,
          durationMs: 5000,
        },
      ],
      dialogueLines: [
        {
          id: 'dlg-1',
          characterInstanceId: 'inst-pip',
          characterName: 'Pip',
          text: 'Hello!',
          startMs: 0,
          durationMs: 2000,
          visemeCues: [
            { timeMs: 0, shape: 'open', durationMs: 500 },
          ],
        },
      ],
    };

    // 1. Generate SVG frame at 100ms
    const svg = engine.renderFrameToSVG(sceneData, 100);
    assert(svg.includes('<svg'), 'SVG must be valid root element');
    assert(svg.includes('viewBox="0 0 1280 720"'), 'SVG viewport must be 1280x720');
    assert(svg.includes('id="char-inst-pip"'), 'Must render Pip character rig group');

    // 2. Render frame to PNG buffer with Resvg
    const pngBuffer = engine.rasterizeSvgToPng(svg);
    assert(Buffer.isBuffer(pngBuffer), 'Must produce a Node.js Buffer');
    assert(pngBuffer.length > 1000, 'PNG buffer must contain rasterized image data');
    // PNG magic bytes: 0x89, 0x50, 0x4E, 0x47
    assert.strictEqual(pngBuffer[0], 0x89);
    assert.strictEqual(pngBuffer[1], 0x50);
    assert.strictEqual(pngBuffer[2], 0x4e);
    assert.strictEqual(pngBuffer[3], 0x47);
  });

  await t.test('9. Instant Instance Expression & Untagged Custom Rig Support', () => {
    // 1. Direct instance.expression without expressionCues
    const testInst = {
      instanceId: 'inst-custom-1',
      characterId: 'custom_boy',
      name: 'Tommy',
      x: 500,
      y: 400,
      scale: 1,
      rotation: 0,
      flipX: false,
      zIndex: 1,
      expression: 'sad' as FacialExpression,
    };

    const pose = evaluatePose(testInst, [], 0, [], []);
    assert.strictEqual(pose.expression, 'sad', 'Pose must reflect instance.expression immediately');

    // 2. Untagged custom rig where shapes have no semantic tags
    const untaggedRig = {
      id: 'untagged_char',
      name: 'Untagged Character',
      species: 'human',
      baseWidth: 100,
      baseHeight: 180,
      parts: {
        head: {
          pivot: { x: 0, y: -45 },
          shapes: [
            // Face base
            { type: 'circle' as const, cx: 0, cy: -50, r: 25, fill: '#ffdbac' },
            // Untagged static eyes
            { type: 'circle' as const, cx: -10, cy: -52, r: 4, fill: '#000000' },
            { type: 'circle' as const, cx: 10, cy: -52, r: 4, fill: '#000000' },
            // Untagged static mouth
            { type: 'path' as const, d: 'M -8 -36 Q 0 -30 8 -36', stroke: '#000000', strokeWidth: 2, fill: 'none' },
          ],
        },
        torso: { pivot: { x: 0, y: 0 }, shapes: [] },
        leftArm: { pivot: { x: -20, y: -20 }, shapes: [] },
        rightArm: { pivot: { x: 20, y: -20 }, shapes: [] },
        leftLeg: { pivot: { x: -15, y: 40 }, shapes: [] },
        rightLeg: { pivot: { x: 15, y: 40 }, shapes: [] },
      },
    };

    const expressivePose = {
      ...pose,
      expression: 'happy' as FacialExpression,
    };

    const headShapes = getHeadShapesForPose(untaggedRig as any, expressivePose);
    // Face base circle (r: 25) must be preserved
    const faceBase = headShapes.find((s) => s.type === 'circle' && s.r === 25);
    assert(faceBase, 'Face base should be preserved');
    // Static eyes (r: 4 at cy: -52) must be removed by heuristic
    const staticEyes = headShapes.filter((s) => s.type === 'circle' && s.r === 4 && s.cy === -52);
    assert.strictEqual(staticEyes.length, 0, 'Static untagged eyes should be removed');
    // Dynamic happy shapes should be added
    const dynamicHappyEyes = headShapes.filter((s) => s.tag === 'eyes');
    assert(dynamicHappyEyes.length > 0, 'Dynamic happy eye shapes must be injected');
  });
});

