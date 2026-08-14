import { ImageGenerationProvider } from "./image-generation/image-generation.provider.js";
import { MockImageProvider } from "./image-generation/providers/mock-image.provider.js";
import { HostedImageProvider } from "./image-generation/providers/hosted-image.provider.js";
import { HuggingFaceImageProvider } from "./image-generation/providers/huggingface-image.provider.js";
import { PollinationsImageProvider } from "./image-generation/providers/pollinations-image.provider.js";
import { VideoGenerationProvider } from "./video-generation/video-generation.provider.js";
import { MockVideoProvider } from "./video-generation/providers/mock-video.provider.js";
import { LocalStorageService } from "../storage/local-storage.service.js";

export function getImageGenerationProvider(): ImageGenerationProvider {
  const providerType = process.env.IMAGE_PROVIDER || "mock";

  switch (providerType) {
    case "mock":
      return new MockImageProvider();
    case "hosted":
      return new HostedImageProvider();
    case "huggingface":
      return new HuggingFaceImageProvider(new LocalStorageService());
    case "pollinations":
      return new PollinationsImageProvider(new LocalStorageService());
    case "comfyui":
      throw new Error(
        "ComfyUIProvider is not yet implemented. Set IMAGE_PROVIDER=mock to use the mock provider.",
      );
    default:
      throw new Error(
        `Unsupported IMAGE_PROVIDER value: "${providerType}". Supported values: mock, hosted, huggingface, pollinations, comfyui`,
      );
  }
}

export function getVideoGenerationProvider(): VideoGenerationProvider {
  const providerType = process.env.VIDEO_PROVIDER || "mock";

  switch (providerType) {
    case "mock":
      return new MockVideoProvider();
    case "runway":
      throw new Error(
        "RunwayProvider is not yet implemented. Set VIDEO_PROVIDER=mock to use the mock provider.",
      );
    case "pika":
      throw new Error(
        "PikaProvider is not yet implemented. Set VIDEO_PROVIDER=mock to use the mock provider.",
      );
    default:
      throw new Error(
        `Unsupported VIDEO_PROVIDER value: "${providerType}". Supported values: mock, runway, pika`,
      );
  }
}
