import test from 'node:test';
import assert from 'node:assert/strict';
import { RemotionManifestAdapter } from '../src/services/video-assembly/remotion-manifest.adapter.js';
import { calculateAuthoritativeSpeechSchedule } from '../src/services/audio-generation/speech-schedule.types.js';

test('Remotion Narration Data Contract & Validation Suite', async (t) => {
  const adapter = new RemotionManifestAdapter();

  const mockStory = {
    storyId: 'story-narration-test',
    title: 'Narration Contract Story',
    targetLanguage: 'hi',
  };

  await t.test('1. Valid English narration string is adapted correctly', async () => {
    const scene = {
      sceneId: 'scene-en',
      number: 1,
      title: 'English Scene',
      narration: 'Deep in the enchanted forest, Pip and Sammy discovered a glowing flower.',
      audioUrl: '/storage/audio/test-en.mp3',
      actualAudioDurationMs: 2500,
    };

    const manifest = await adapter.buildManifest(mockStory as any, [scene as any], {
      format: '16:9',
      resolution: '720p',
    });

    assert.equal(manifest.scenes.length, 1);
    assert.equal(manifest.scenes[0].caption, scene.narration);
    assert.equal(manifest.scenes[0].narration?.text, scene.narration);
    assert.equal(manifest.scenes[0].narration?.durationMs, 2500);
  });

  await t.test('2. Valid Hindi Devanagari narration string is preserved exactly without corruption', async () => {
    const hindiText = 'नमस्ते, यह हमारी प्यारी पृथ्वी की सुंदर और अनोखी कहानी है।';
    const scene = {
      sceneId: 'scene-hi',
      number: 1,
      title: 'Hindi Scene',
      narration: hindiText,
      audioUrl: '/storage/audio/test-hi.mp3',
      actualAudioDurationMs: 3000,
    };

    const manifest = await adapter.buildManifest(mockStory as any, [scene as any], {
      format: '16:9',
      resolution: '720p',
    });

    assert.equal(manifest.scenes[0].caption, hindiText);
    assert.equal(manifest.scenes[0].narration?.text, hindiText);
    assert.equal(manifest.scenes[0].narration?.durationMs, 3000);
  });

  await t.test('3. Missing / undefined narration is handled safely without throwing', async () => {
    const scene = {
      sceneId: 'scene-no-narration',
      number: 1,
      title: 'Dialogue Only Scene',
      // narration is undefined
      animationData: {
        dialogues: [
          { id: 'd1', characterName: 'Pip', text: 'Hello!', durationMs: 1200 },
        ],
      },
    };

    const manifest = await adapter.buildManifest(mockStory as any, [scene as any], {
      format: '16:9',
      resolution: '720p',
    });

    assert.equal(manifest.scenes.length, 1);
    assert.equal(manifest.scenes[0].caption, '');
    assert.equal(manifest.scenes[0].narration, undefined);
  });

  await t.test('4. Null narration is handled safely as empty narration', async () => {
    const scene = {
      sceneId: 'scene-null-narration',
      number: 1,
      title: 'Null Narration Scene',
      narration: null,
    };

    const manifest = await adapter.buildManifest(mockStory as any, [scene as any], {
      format: '16:9',
      resolution: '720p',
    });

    assert.equal(manifest.scenes.length, 1);
    assert.equal(manifest.scenes[0].caption, '');
    assert.equal(manifest.scenes[0].narration, undefined);
  });

  await t.test('5. Malformed narration object throws descriptive TypeError rather than silent coercion', async () => {
    const malformedScene = {
      sceneId: 'scene-malformed',
      number: 1,
      title: 'Malformed Object Scene',
      narration: { text: 'Object narration violates Prisma schema', audioUrl: '/audio.mp3' },
    };

    await assert.rejects(
      async () => {
        await adapter.buildManifest(mockStory as any, [malformedScene as any], {
          format: '16:9',
          resolution: '720p',
        });
      },
      (err: any) => {
        assert.ok(err instanceof TypeError, 'Must throw TypeError for non-string narration');
        assert.ok(err.message.includes('Invalid scene narration for scene'), 'Error message must identify invalid scene narration');
        assert.ok(err.message.includes('expected string, received object'), 'Error message must state expected string received object');
        return true;
      }
    );
  });

  await t.test('6. Malformed narration number/boolean throws descriptive TypeError', async () => {
    const numberScene = {
      sceneId: 'scene-number',
      number: 1,
      narration: 12345,
    };

    await assert.rejects(
      async () => {
        await adapter.buildManifest(mockStory as any, [numberScene as any], { format: '16:9' });
      },
      /expected string, received number/
    );
  });

  await t.test('7. calculateAuthoritativeSpeechSchedule rejects malformed narration text shape', () => {
    assert.throws(
      () => {
        calculateAuthoritativeSpeechSchedule({
          narration: {
            text: { invalid: true } as any,
          },
          dialogues: [],
        });
      },
      (err: any) => {
        assert.ok(err instanceof TypeError);
        assert.ok(err.message.includes('CalculateScheduleInput.narration.text must be a string'));
        return true;
      }
    );
  });
});
