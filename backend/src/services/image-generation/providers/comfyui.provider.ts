import { ImageGenerationProvider } from '../image-generation.provider.js';
import { buildComfyUIWorkflow } from './comfyui.workflow.js';

export class ComfyUIProvider implements ImageGenerationProvider {
  private comfyUIUrl: string;

  constructor() {
    const comfyUIUrl = process.env.COMFYUI_URL;
    if (!comfyUIUrl) {
      throw new Error('COMFYUI_URL environment variable is required for ComfyUIProvider');
    }
    this.comfyUIUrl = comfyUIUrl;
  }

  async checkHealth(): Promise<boolean> {
    try {
      const systemStatsUrl = `${this.comfyUIUrl}/system_stats`;
      const response = await fetch(systemStatsUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      return response.ok;
    } catch (error) {
      console.error('ComfyUI health check failed:', error);
      return false;
    }
  }

  async generateImage(options: {
    prompt: string;
    width?: number;
    height?: number;
  }): Promise<{
    imageBuffer: Buffer;
    mimeType: string;
  }> {
    const { prompt, width = 512, height = 512 } = options;

    // ComfyUI API endpoint for queueing prompts
    const queueUrl = `${this.comfyUIUrl}/prompt`;

    // Build workflow using the workflow builder
    const workflow = buildComfyUIWorkflow({
      prompt,
      width,
      height,
    });

    try {
      const response = await fetch(queueUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: workflow.prompt }),
      });

      if (!response.ok) {
        throw new Error(`ComfyUI API error: ${response.statusText}`);
      }

      const data = await response.json();
      const promptId = data.prompt_id;

      // Poll for the result
      const historyUrl = `${this.comfyUIUrl}/history/${promptId}`;
      let attempts = 0;
      const maxAttempts = 60; // 60 seconds timeout

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const historyResponse = await fetch(historyUrl);
        if (historyResponse.ok) {
          const historyData = await historyResponse.json();
          if (historyData[promptId]) {
            const outputs = historyData[promptId].outputs;
            if (outputs && outputs['7'] && outputs['7'].images && outputs['7'].images.length > 0) {
              const imageName = outputs['7'].images[0].filename;
              // Download the image from ComfyUI's view endpoint
              const imageUrl = `${this.comfyUIUrl}/view?filename=${imageName}&type=output`;
              const imageResponse = await fetch(imageUrl);

              if (!imageResponse.ok) {
                throw new Error(`Failed to download image from ComfyUI: ${imageResponse.statusText}`);
              }

              const contentType = imageResponse.headers.get('content-type') || 'image/png';
              const arrayBuffer = await imageResponse.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);

              return {
                imageBuffer: buffer,
                mimeType: contentType,
              };
            }
          }
        }
        attempts++;
      }

      throw new Error('ComfyUI generation timeout');
    } catch (error) {
      console.error('ComfyUI generation failed:', error);
      throw error;
    }
  }
}
