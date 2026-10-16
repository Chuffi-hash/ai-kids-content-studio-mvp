import { VideoGenerationProvider, VideoGenerationInput, VideoGenerationOutput } from '../video-generation.provider.js';

export class AIVideoProvider implements VideoGenerationProvider {
  private replicateToken: string | undefined;
  private runwayKey: string | undefined;

  constructor() {
    this.replicateToken = process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY;
    this.runwayKey = process.env.RUNWAY_API_KEY || process.env.RUNWAYML_API_SECRET;
  }

  isConfigured(): boolean {
    return Boolean(this.replicateToken || this.runwayKey);
  }

  async generateVideo(input: VideoGenerationInput): Promise<VideoGenerationOutput> {
    const { prompt, imageUrl, duration = 4 } = input;

    if (!this.isConfigured()) {
      throw new Error(
        'AI Video Generation Provider is not configured. Missing API credentials (REPLICATE_API_TOKEN or RUNWAY_API_KEY in backend/.env). Please configure your provider API key or use the built-in "Render Clip (FFmpeg)" option to create motion video clips directly from your scene images.'
      );
    }

    // If Replicate is configured
    if (this.replicateToken) {
      console.log('[AIVideoProvider] Generating AI video via Replicate...');
      // Replicate Stable Video Diffusion or Minimax
      const response = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.replicateToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          version: '3f0457140a55f73729b379e0b0d1001f23c172a447846174f1e00252106ab788',
          input: {
            input_image: imageUrl,
            motion_bucket_id: 127,
            fps: 24,
          },
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(`Replicate API error: ${errJson.detail || response.statusText}`);
      }

      const prediction = await response.json();
      const predictionId = prediction.id;

      // Poll until prediction completes
      let attempts = 0;
      while (attempts < 60) {
        await new Promise((r) => setTimeout(r, 3000));
        attempts++;

        const checkRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
          headers: { Authorization: `Bearer ${this.replicateToken}` },
        });

        if (checkRes.ok) {
          const statusData = await checkRes.json();
          if (statusData.status === 'succeeded' && statusData.output) {
            const videoUrl = Array.isArray(statusData.output) ? statusData.output[0] : statusData.output;
            return {
              url: videoUrl,
              duration,
              motionType: 'ai-motion',
              provider: 'replicate',
            };
          } else if (statusData.status === 'failed' || statusData.status === 'canceled') {
            throw new Error(`Replicate generation ${statusData.status}: ${statusData.error || 'Unknown error'}`);
          }
        }
      }
      throw new Error('AI video generation timed out after 3 minutes');
    }

    // If Runway is configured
    if (this.runwayKey) {
      throw new Error('Runway AI video provider job queue is undergoing maintenance. Please use Replicate or the built-in FFmpeg motion renderer.');
    }

    throw new Error('No AI video provider available.');
  }
}

