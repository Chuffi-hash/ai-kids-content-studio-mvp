import test, { describe, it } from 'node:test';
import assert from 'node:assert';
import 'dotenv/config';
import { GeminiVideoProvider } from '../src/services/production/video-generation/providers/gemini-video.provider.js';
import { getVideoGenerationProvider } from '../src/services/production/production-provider.factory.js';

describe('GeminiVideoProvider & Factory Tests', () => {
  it('factory instantiates GeminiVideoProvider when workflow=gemini or VIDEO_PROVIDER=gemini', () => {
    const provider1 = getVideoGenerationProvider('gemini');
    assert.ok(provider1 instanceof GeminiVideoProvider);

    const prev = process.env.VIDEO_PROVIDER;
    process.env.VIDEO_PROVIDER = 'gemini';
    try {
      const provider2 = getVideoGenerationProvider();
      assert.ok(provider2 instanceof GeminiVideoProvider);
    } finally {
      process.env.VIDEO_PROVIDER = prev;
    }
  });

  it('throws error when Gemini API key is missing', async () => {
    const prev1 = process.env.GEMINI_API_KEY;
    const prev2 = process.env.GOOGLE_GEMINI_API_KEY;
    const prev3 = process.env.MOCK_GEMINI_VIDEO;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GEMINI_API_KEY;
    delete process.env.MOCK_GEMINI_VIDEO;

    try {
      const provider = new GeminiVideoProvider();
      assert.strictEqual(provider.isConfigured(), false);

      await assert.rejects(
        async () => {
          await provider.generateVideo({
            prompt: 'A boy walking along a sunny path',
          });
        },
        /Gemini Video Generation Provider is not configured/i
      );
    } finally {
      if (prev1) process.env.GEMINI_API_KEY = prev1;
      if (prev2) process.env.GOOGLE_GEMINI_API_KEY = prev2;
      if (prev3) process.env.MOCK_GEMINI_VIDEO = prev3;
    }
  });

  it('returns valid simulated output in mock mode without live network call', async () => {
    const prev = process.env.MOCK_GEMINI_VIDEO;
    process.env.MOCK_GEMINI_VIDEO = 'true';
    try {
      const provider = new GeminiVideoProvider();

      const result = await provider.generateVideo({
        prompt: 'Forest scene panning right',
        duration: 5,
      });

      assert.strictEqual(result.provider, 'gemini');
      assert.strictEqual(result.duration, 5);
      assert.strictEqual(result.motionType, 'ai-motion');
      assert.ok(result.url);
    } finally {
      process.env.MOCK_GEMINI_VIDEO = prev;
    }
  });

  it('submits long running video operation and polls to completion', async () => {
    const provider = new GeminiVideoProvider({ apiKey: 'test-video-key' });
    const originalFetch = globalThis.fetch;

    let callCount = 0;
    globalThis.fetch = (async (url: any) => {
      callCount++;
      const urlStr = String(url);

      if (urlStr.includes(':predictLongRunning')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            name: 'operations/test-video-op-12345',
          }),
        } as any;
      }

      if (urlStr.includes('operations/test-video-op-12345')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            name: 'operations/test-video-op-12345',
            done: true,
            response: {
              generatedVideos: [
                {
                  video: {
                    uri: 'https://storage.googleapis.com/test-bucket/generated-animation.mp4',
                  },
                },
              ],
            },
          }),
        } as any;
      }

      // Download from generated URI
      if (urlStr.includes('generated-animation.mp4')) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => new Uint8Array([0, 1, 2, 3]).buffer,
        } as any;
      }

      return {
        ok: false,
        status: 404,
        text: async () => 'Not found',
      } as any;
    }) as any;

    try {
      const result = await provider.generateVideo({
        prompt: 'Boy running happily in the meadow',
        duration: 3,
      });

      assert.strictEqual(result.provider, 'gemini');
      assert.strictEqual(result.duration, 3);
      assert.ok(result.url.includes('.mp4'));
      assert.ok(callCount >= 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
