import { ImageGenerationProvider } from './provider.interface.js';

export class ComfyUIProvider implements ImageGenerationProvider {
  private comfyUIUrl: string;

  constructor(comfyUIUrl: string) {
    this.comfyUIUrl = comfyUIUrl;
  }

  async generateImage(prompt: string): Promise<string> {
    // ComfyUI API endpoint for queueing prompts
    const queueUrl = `${this.comfyUIUrl}/prompt`;
    
    // Basic text-to-image workflow for ComfyUI
    // This is a simplified workflow - in production, you'd load a proper workflow JSON
    const workflow = {
      prompt: {
        // This is a placeholder workflow structure
        // Actual ComfyUI workflows are more complex and node-based
        "1": {
          "inputs": {
            "text": prompt,
            "clip": ["4", 1]
          },
          "class_type": "CLIPTextEncode"
        },
        "2": {
          "inputs": {
            "text": "",
            "clip": ["4", 1]
          },
          "class_type": "CLIPTextEncode"
        },
        "3": {
          "inputs": {
            "seed": 0,
            "steps": 20,
            "cfg": 8,
            "sampler_name": "euler",
            "scheduler": "normal",
            "denoise": 1,
            "model": ["4", 0],
            "positive": ["1", 0],
            "negative": ["2", 0],
            "latent_image": ["5", 0]
          },
          "class_type": "KSampler"
        },
        "4": {
          "inputs": {
            "ckpt_name": "model.safetensors"
          },
          "class_type": "CheckpointLoaderSimple"
        },
        "5": {
          "inputs": {
            "width": 512,
            "height": 512,
            "batch_size": 1
          },
          "class_type": "EmptyLatentImage"
        },
        "6": {
          "inputs": {
            "samples": ["3", 0],
            "vae": ["4", 2]
          },
          "class_type": "VAEDecode"
        },
        "7": {
          "inputs": {
            "filename_prefix": "ComfyUI",
            "images": ["6", 0]
          },
          "class_type": "SaveImage"
        }
      }
    };

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
              // Return the image URL via ComfyUI's view endpoint
              return `${this.comfyUIUrl}/view?filename=${imageName}&type=output`;
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
