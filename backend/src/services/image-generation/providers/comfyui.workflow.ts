export interface ComfyUIWorkflowParams {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  seed?: number;
}

export interface ComfyUIWorkflow {
  prompt: Record<string, unknown>;
}

export function buildComfyUIWorkflow(params: ComfyUIWorkflowParams): ComfyUIWorkflow {
  const {
    prompt,
    negativePrompt = 'blurry, bad quality, distorted, ugly, low resolution',
    width = 512,
    height = 512,
    seed = Math.floor(Math.random() * 1000000),
  } = params;

  return {
    prompt: {
      "1": {
        inputs: {
          text: prompt,
          clip: ["4", 1]
        },
        class_type: "CLIPTextEncode"
      },
      "2": {
        inputs: {
          text: negativePrompt,
          clip: ["4", 1]
        },
        class_type: "CLIPTextEncode"
      },
      "3": {
        inputs: {
          seed,
          steps: 20,
          cfg: 7,
          sampler_name: "euler",
          scheduler: "normal",
          denoise: 1,
          model: ["4", 0],
          positive: ["1", 0],
          negative: ["2", 0],
          latent_image: ["5", 0]
        },
        class_type: "KSampler"
      },
      "4": {
        inputs: {
          ckpt_name: "v1-5-pruned-emaonly.safetensors"
        },
        class_type: "CheckpointLoaderSimple"
      },
      "5": {
        inputs: {
          width,
          height,
          batch_size: 1
        },
        class_type: "EmptyLatentImage"
      },
      "6": {
        inputs: {
          samples: ["3", 0],
          vae: ["4", 2]
        },
        class_type: "VAEDecode"
      },
      "7": {
        inputs: {
          filename_prefix: "ComfyUI",
          images: ["6", 0]
        },
        class_type: "SaveImage"
      }
    }
  };
}
