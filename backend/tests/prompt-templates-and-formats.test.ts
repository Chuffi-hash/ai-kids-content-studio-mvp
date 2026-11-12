import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSceneBackgroundPrompt,
  buildCharacterReferencePrompt,
} from '../src/services/character-studio/prompt-templates.js';
import { RemotionManifestAdapter } from '../src/services/video-assembly/remotion-manifest.adapter.js';

test('Prompt Templates - Format-specific background framing guidelines', () => {
  const p169 = buildSceneBackgroundPrompt({
    environmentType: 'lush green meadow',
    aspectRatio: '16:9',
  });
  assert.match(p169, /16:9 aspect ratio/i);
  assert.match(p169, /1920x1080/i);
  assert.match(p169, /Strictly NO characters/i);

  const p916 = buildSceneBackgroundPrompt({
    environmentType: 'vertical forest canopy',
    aspectRatio: '9:16',
  });
  assert.match(p916, /9:16 aspect ratio/i);
  assert.match(p916, /1080x1920/i);
  assert.match(p916, /safe action area/i);

  const p11 = buildSceneBackgroundPrompt({
    environmentType: 'cozy treehouse room',
    aspectRatio: '1:1',
  });
  assert.match(p11, /1:1 aspect ratio/i);
  assert.match(p11, /1080x1080/i);

  const p45 = buildSceneBackgroundPrompt({
    environmentType: 'magical garden',
    aspectRatio: '4:5',
  });
  assert.match(p45, /4:5 aspect ratio/i);
  assert.match(p45, /1080x1350/i);
});

test('Prompt Templates - Character facing direction & view direction guidelines', () => {
  const backPrompt = buildCharacterReferencePrompt({
    name: 'Pip',
    visualDescription: 'a cute brown bear with a blue vest',
    viewDirection: 'back',
  });
  assert.match(backPrompt, /facing directly away from camera/i);
  assert.match(backPrompt, /back view/i);
  assert.match(backPrompt, /NO eyes/i);
  assert.match(backPrompt, /NO mouth/i);

  const leftPrompt = buildCharacterReferencePrompt({
    name: 'Pip',
    visualDescription: 'a cute brown bear with a blue vest',
    viewDirection: 'left',
  });
  assert.match(leftPrompt, /side profile view/i);
  assert.match(leftPrompt, /far eye hidden/i);

  const frontPrompt = buildCharacterReferencePrompt({
    name: 'Pip',
    visualDescription: 'a cute brown bear with a blue vest',
    viewDirection: 'front',
  });
  assert.match(frontPrompt, /standing front view/i);
});

test('Remotion Manifest Adapter - Propagates facing direction and format variants', async () => {
  const adapter = new RemotionManifestAdapter();
  const manifest = await adapter.buildManifest(
    {
      storyId: 'story-test-formats',
      title: 'Multi-Format Test Story',
    },
    [
      {
        sceneId: 'scene-1',
        title: 'Scene 1',
        number: 1,
        narration: 'Once upon a time in a sunny meadow.',
        estimatedDurationMs: 3000,
        shots: [
          {
            shotId: 'shot-1',
            sceneId: 'scene-1',
            number: 1,
            title: 'Shot 1',
            durationMs: 3000,
            backgroundUrl: 'https://example.com/bg1.png',
            characterPlacements: [
              {
                instanceId: 'char-pip',
                characterId: 'char-bear',
                name: 'Pip',
                x: 640,
                y: 500,
                scale: 1.0,
                facingDirection: 'back',
                isSpeaker: false,
              },
            ],
          },
        ],
        animationData: {
          characterInstances: [
            {
              instanceId: 'char-pip',
              characterId: 'char-bear',
              name: 'Pip',
              x: 640,
              y: 500,
              scale: 1.0,
              facingDirection: 'back',
            },
          ],
          formatVariants: {
            '9:16': {
              width: 720,
              height: 1280,
              characterOverrides: {
                'char-pip': {
                  x: 360,
                  y: 800,
                  scale: 1.2,
                  facingDirection: 'back',
                },
              },
            },
          },
        },
      },
    ],
    { format: '9:16', embedBase64Images: false }
  );

  assert.ok(manifest);
  assert.strictEqual(manifest.scenes.length, 1);
  const sc = manifest.scenes[0];
  assert.strictEqual(sc.shots?.length, 1);
  const shot = sc.shots![0];
  assert.strictEqual(shot.characterPlacements?.[0].facingDirection, 'back');
  assert.strictEqual(sc.characterInstances?.[0].facingDirection, 'back');
  assert.strictEqual(sc.formatVariants?.['9:16']?.characterOverrides?.['char-pip']?.facingDirection, 'back');
});
