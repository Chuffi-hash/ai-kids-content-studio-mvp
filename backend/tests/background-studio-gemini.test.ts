import test, { describe, it } from 'node:test';
import assert from 'node:assert';
import 'dotenv/config';
import { BackgroundStudioService } from '../src/services/background-studio/background-studio.service.js';

describe('BackgroundStudioService - Gemini & Google Flow Integration', () => {
  it('strictly throws error if provider=gemini but GEMINI_API_KEY is not configured', async () => {
    const prev1 = process.env.GEMINI_API_KEY;
    const prev2 = process.env.GOOGLE_GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GEMINI_API_KEY;

    try {
      const service = new BackgroundStudioService();
      await assert.rejects(
        async () => {
          await service.generateBackground({
            environmentType: 'lush green forest',
            details: 'dirt path with sunny giant trees and gentle sunlight',
            provider: 'gemini',
          });
        },
        /Gemini API key is not configured/i
      );
    } finally {
      if (prev1) process.env.GEMINI_API_KEY = prev1;
      if (prev2) process.env.GOOGLE_GEMINI_API_KEY = prev2;
    }
  });

  it('generates and persists background with provider=gemini when key is configured', async () => {
    const prev = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    const fakeBase64 = Buffer.from('fake-storybook-background-bytes').toString('base64');
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/png',
                    data: fakeBase64,
                  },
                },
              ],
            },
          },
        ],
      }),
    })) as any;

    try {
      const service = new BackgroundStudioService();
      const asset = await service.generateBackground({
        environmentType: 'Lush Forest',
        details: 'a winding dirt path with giant sunny trees, flowers, and gentle sunlight',
        mood: 'cheerful and inviting',
        artStyle: 'storybook_illustrated',
        aspectRatio: '16:9',
        provider: 'gemini',
      });

      assert.strictEqual(asset.provider, 'gemini');
      assert.strictEqual(asset.aspectRatio, '16:9');
      assert.strictEqual(asset.width, 1280);
      assert.strictEqual(asset.height, 720);
      assert.ok(asset.imageUrl.includes('/storage/backgrounds/'));
      assert.ok(asset.prompt.includes('NO characters') && asset.prompt.includes('NO text'));
    } finally {
      globalThis.fetch = originalFetch;
      if (prev) process.env.GEMINI_API_KEY = prev;
    }
  });

  it('imports Google Flow background export with provider=google_flow attribution', async () => {
    const service = new BackgroundStudioService();
    const testImage = Buffer.from('google-flow-exported-image').toString('base64');

    const asset = await service.importFromGoogleFlow({
      name: 'Google Flow Forest Clearing',
      environmentType: 'Forest Clearing',
      imageBufferOrBase64: testImage,
      notes: 'Exported from Google Flow project',
      aspectRatio: '16:9',
    });

    assert.strictEqual(asset.provider, 'google_flow');
    assert.strictEqual(asset.name, 'Google Flow Forest Clearing');
    assert.ok(asset.imageUrl.includes('/storage/backgrounds/'));
    assert.ok(asset.tags?.includes('google_flow'));
  });
});
