import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import {
  VideoGenerationProvider,
  VideoGenerationInput,
  VideoGenerationOutput,
} from '../video-generation.provider.js';

export class GeminiVideoProvider implements VideoGenerationProvider {
  private apiKey: string | undefined;
  private model: string;
  private storageDir: string;

  constructor(options?: { apiKey?: string; model?: string; storageDir?: string }) {
    this.apiKey =
      options?.apiKey ||
      process.env.GOOGLE_GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY;
    this.model =
      options?.model ||
      process.env.GEMINI_VIDEO_MODEL ||
      'veo-2.0-generate-001';
    this.storageDir = options?.storageDir || process.env.STORAGE_DIR || './storage';
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  public getModel(): string {
    return this.model;
  }

  private toPublicUrl(relPath: string): string {
    const clean = relPath.replace(/\\/g, '/').replace(/^\/?storage\/?/, '');
    const origin = process.env.BACKEND_URL || 'http://localhost:5001';
    return `${origin}/storage/${clean}`;
  }

  /**
   * Saves video buffer to local storage directory under videos/.
   */
  private async saveVideoBuffer(buffer: Buffer, extension = 'mp4'): Promise<string> {
    const videoDir = path.resolve(process.cwd(), this.storageDir, 'videos');
    await fs.promises.mkdir(videoDir, { recursive: true });
    const filename = `gemini-video-${Date.now()}-${randomUUID().slice(0, 6)}.${extension}`;
    const filePath = path.join(videoDir, filename);
    await fs.promises.writeFile(filePath, buffer);
    const rel = path.relative(path.resolve(process.cwd(), this.storageDir), filePath);
    return this.toPublicUrl(rel);
  }

  /**
   * Generates a video using Google Gemini / Veo video generation API.
   */
  async generateVideo(input: VideoGenerationInput): Promise<VideoGenerationOutput> {
    const { prompt, imageUrl, duration = 4 } = input;

    // Check mock mode for test environments
    if (process.env.MOCK_GEMINI_VIDEO === 'true' || this.apiKey === 'mock-key') {
      console.log('[GeminiVideoProvider] Mock mode enabled, returning simulated video output');
      return {
        url: imageUrl || 'http://localhost:5001/storage/videos/mock-gemini-preview.mp4',
        duration,
        motionType: 'ai-motion',
        provider: 'gemini',
      };
    }

    if (!this.isConfigured()) {
      throw new Error(
        'Gemini Video Generation Provider is not configured. Missing GEMINI_API_KEY or GOOGLE_GEMINI_API_KEY in environment. Please configure your API key, or use the FFmpeg motion renderer.'
      );
    }

    if (!prompt && !imageUrl) {
      throw new Error('GeminiVideoProvider: either prompt or imageUrl must be provided');
    }

    const apiKey = this.apiKey!;
    console.log(
      `[GeminiVideoProvider] Starting video generation with model: ${this.model}, duration: ${duration}s`
    );

    // If an input image is provided, retrieve its buffer or base64
    let imageBase64: string | undefined;
    if (imageUrl) {
      try {
        if (imageUrl.startsWith('data:image')) {
          imageBase64 = imageUrl.replace(/^data:image\/\w+;base64,/, '');
        } else if (imageUrl.startsWith('http')) {
          const imgRes = await fetch(imageUrl);
          if (imgRes.ok) {
            const arr = await imgRes.arrayBuffer();
            imageBase64 = Buffer.from(arr).toString('base64');
          }
        } else if (fs.existsSync(imageUrl)) {
          const buf = await fs.promises.readFile(imageUrl);
          imageBase64 = buf.toString('base64');
        }
      } catch (err) {
        console.warn('[GeminiVideoProvider] Failed to load source image for conditioning:', err);
      }
    }

    // Call Google Generative AI Long-Running Video Operation
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:predictLongRunning?key=${apiKey}`;

    const instance: any = {
      prompt: prompt || 'high quality smooth children story animation video clip',
    };
    if (imageBase64) {
      instance.image = { bytesBase64Encoded: imageBase64 };
    }

    const requestBody = {
      instances: [instance],
      parameters: {
        aspectRatio: '16:9',
        durationSeconds: duration,
        personGeneration: 'allow_all',
      },
    };

    const initRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(60000),
    });

    if (!initRes.ok) {
      const errText = await initRes.text();
      let errorDetail = errText;
      try {
        const parsed = JSON.parse(errText);
        errorDetail = parsed.error?.message || errText;
      } catch {
        // use raw text
      }
      throw new Error(`Gemini Video Generation HTTP ${initRes.status}: ${errorDetail}`);
    }

    const initData = (await initRes.json()) as any;
    const operationName = initData.name;

    if (!operationName) {
      // Check if direct response without operation was returned
      if (initData.predictions?.[0]?.bytesBase64Encoded) {
        const buf = Buffer.from(initData.predictions[0].bytesBase64Encoded, 'base64');
        const url = await this.saveVideoBuffer(buf);
        return {
          url,
          duration,
          motionType: 'ai-motion',
          provider: 'gemini',
        };
      }
      throw new Error('Gemini Video API did not return an operation name or video prediction');
    }

    console.log(`[GeminiVideoProvider] Operation queued: ${operationName}. Polling for completion...`);

    // Poll operation until completion (max 180 seconds)
    const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${apiKey}`;
    let attempts = 0;
    const maxAttempts = 60; // 60 * 3s = 180s

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      attempts++;

      const pollRes = await fetch(pollUrl, {
        signal: AbortSignal.timeout(15000),
      });

      if (!pollRes.ok) {
        continue;
      }

      const pollData = (await pollRes.json()) as any;

      if (pollData.error) {
        throw new Error(`Gemini Video generation failed: ${pollData.error.message || 'Unknown error'}`);
      }

      if (pollData.done) {
        console.log(`[GeminiVideoProvider] Operation ${operationName} completed successfully.`);

        // Extract video data from response
        const generated =
          pollData.response?.generatedVideos?.[0] ||
          pollData.response?.predictions?.[0] ||
          pollData.response?.videos?.[0];

        if (generated?.video?.uri) {
          // Download video from URI
          const dlRes = await fetch(generated.video.uri);
          if (dlRes.ok) {
            const arr = await dlRes.arrayBuffer();
            const url = await this.saveVideoBuffer(Buffer.from(arr));
            return {
              url,
              duration,
              motionType: 'ai-motion',
              provider: 'gemini',
            };
          }
          return {
            url: generated.video.uri,
            duration,
            motionType: 'ai-motion',
            provider: 'gemini',
          };
        } else if (generated?.bytesBase64Encoded) {
          const buf = Buffer.from(generated.bytesBase64Encoded, 'base64');
          const url = await this.saveVideoBuffer(buf);
          return {
            url,
            duration,
            motionType: 'ai-motion',
            provider: 'gemini',
          };
        } else if (pollData.response?.uri) {
          return {
            url: pollData.response.uri,
            duration,
            motionType: 'ai-motion',
            provider: 'gemini',
          };
        }

        throw new Error('Gemini Video operation marked done but returned no video URI or data');
      }
    }

    throw new Error('Gemini Video generation timed out after 3 minutes');
  }
}
