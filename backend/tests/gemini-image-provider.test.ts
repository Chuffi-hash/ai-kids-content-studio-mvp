import test, { describe, it } from 'node:test';
import assert from 'node:assert';
import 'dotenv/config';
import { GeminiImageProvider } from '../src/services/image-generation/providers/gemini-image.provider.js';
import { getImageGenerationProvider } from '../src/services/image-generation/provider.factory.js';

describe('GeminiImageProvider & Factory Tests', () => {
  it('factory instantiates GeminiImageProvider when IMAGE_PROVIDER=gemini', () => {
    const prev = process.env.IMAGE_PROVIDER;
    process.env.IMAGE_PROVIDER = 'gemini';
    try {
      const provider = getImageGenerationProvider();
      assert.ok(provider instanceof GeminiImageProvider);
    } finally {
      process.env.IMAGE_PROVIDER = prev;
    }
  });

  it('throws descriptive error if GEMINI_API_KEY is not configured', async () => {
    const prev1 = process.env.GEMINI_API_KEY;
    const prev2 = process.env.GOOGLE_GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GEMINI_API_KEY;

    try {
      const provider = new GeminiImageProvider();
      assert.strictEqual(provider.isConfigured(), false);

      await assert.rejects(
        async () => {
          await provider.generateImage({
            prompt: 'A cute 2D cartoon boy named Milo',
          });
        },
        /Gemini API key is not configured/i
      );
    } finally {
      if (prev1) process.env.GEMINI_API_KEY = prev1;
      if (prev2) process.env.GOOGLE_GEMINI_API_KEY = prev2;
    }
  });

  it('throws descriptive error if prompt is empty', async () => {
    const provider = new GeminiImageProvider({ apiKey: 'test-key-12345' });

    await assert.rejects(
      async () => {
        await provider.generateImage({
          prompt: '   ',
        });
      },
      /prompt is required/i
    );
  });

  it('calls modern generateContent endpoint with responseModalities IMAGE and returns buffer', async () => {
    const fakePngBase64 = Buffer.from('fake-png-image-binary-data').toString('base64');
    const originalFetch = globalThis.fetch;

    let calledUrl = '';
    let calledBody: any = null;

    globalThis.fetch = (async (url: any, options: any) => {
      calledUrl = String(url);
      calledBody = JSON.parse(options.body as string);
      return {
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
                      data: fakePngBase64,
                    },
                  },
                ],
              },
            },
          ],
        }),
      } as any;
    }) as any;

    try {
      const provider = new GeminiImageProvider({
        apiKey: 'test-api-key',
        model: 'gemini-2.5-flash-image',
      });

      const result = await provider.generateImage({
        prompt: 'A friendly 8-10 year old boy named Milo wearing yellow hoodie',
        aspectRatio: '16:9',
      });

      assert.ok(calledUrl.includes('models/gemini-2.5-flash-image:generateContent?key=test-api-key'));
      assert.deepStrictEqual(calledBody.generationConfig.responseModalities, ['IMAGE']);
      assert.ok(calledBody.contents[0].parts[0].text.includes('Milo wearing yellow hoodie'));
      assert.strictEqual(result.mimeType, 'image/png');
      assert.strictEqual(result.imageBuffer.toString(), 'fake-png-image-binary-data');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('passes inline reference image data for character consistency', async () => {
    const refBuffer = Buffer.from('master-reference-character-png');
    const fakeResultBase64 = Buffer.from('consistent-turnaround-sheet').toString('base64');
    const originalFetch = globalThis.fetch;

    let calledBody: any = null;

    globalThis.fetch = (async (_url: any, options: any) => {
      calledBody = JSON.parse(options.body as string);
      return {
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
                      data: fakeResultBase64,
                    },
                  },
                ],
              },
            },
          ],
        }),
      } as any;
    }) as any;

    try {
      const provider = new GeminiImageProvider({
        apiKey: 'test-api-key',
        model: 'gemini-2.5-flash-image',
      });

      const result = await provider.generateImage({
        prompt: 'Character turnaround sheet with front, side, and back views for Milo',
        referenceImageBuffer: refBuffer,
        referenceImageMimeType: 'image/png',
      });

      assert.strictEqual(calledBody.contents[0].parts.length, 2);
      assert.strictEqual(calledBody.contents[0].parts[0].inlineData.mimeType, 'image/png');
      assert.strictEqual(calledBody.contents[0].parts[0].inlineData.data, refBuffer.toString('base64'));
      assert.ok(calledBody.contents[0].parts[1].text.includes('turnaround sheet'));
      assert.strictEqual(result.imageBuffer.toString(), 'consistent-turnaround-sheet');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('uses legacy :predict endpoint when configured with imagen-* model', async () => {
    const fakeImagenBase64 = Buffer.from('imagen-generated-data').toString('base64');
    const originalFetch = globalThis.fetch;

    let calledUrl = '';
    let calledBody: any = null;

    globalThis.fetch = (async (url: any, options: any) => {
      calledUrl = String(url);
      calledBody = JSON.parse(options.body as string);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          predictions: [
            {
              bytesBase64Encoded: fakeImagenBase64,
            },
          ],
        }),
      } as any;
    }) as any;

    try {
      const provider = new GeminiImageProvider({
        apiKey: 'test-api-key',
        model: 'imagen-3.0-generate-002',
      });

      const result = await provider.generateImage({
        prompt: 'Storybook forest background with giant trees',
        aspectRatio: '16:9',
      });

      assert.ok(calledUrl.includes('models/imagen-3.0-generate-002:predict?key=test-api-key'));
      assert.strictEqual(calledBody.instances[0].prompt, 'Storybook forest background with giant trees');
      assert.strictEqual(calledBody.parameters.aspectRatio, '16:9');
      assert.strictEqual(result.imageBuffer.toString(), 'imagen-generated-data');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws descriptive error on HTTP failures from Gemini API', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { message: 'Invalid API argument or model quota exceeded' } }),
    })) as any;

    try {
      const provider = new GeminiImageProvider({ apiKey: 'test-api-key' });
      await assert.rejects(
        async () => {
          await provider.generateImage({
            prompt: 'Scene with characters',
          });
        },
        /Invalid API argument or model quota exceeded/i
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
