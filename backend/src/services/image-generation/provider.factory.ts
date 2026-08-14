import { ImageGenerationProvider } from "./image-generation.provider.js";
import { MockImageProvider } from "./providers/mock-image.provider.js";
import { ComfyUIProvider } from "./providers/comfyui.provider.js";
import { PollinationsImageProvider } from "./providers/pollinations-image.provider.js";

export function getImageGenerationProvider(): ImageGenerationProvider {
  const providerType = process.env.IMAGE_PROVIDER || "mock";

  switch (providerType) {
    case "mock":
      return new MockImageProvider();
    case "comfyui":
      return new ComfyUIProvider();
    case "pollinations":
      return new PollinationsImageProvider();
    case "hosted":
      throw new Error(
        "HostedImageProvider is not yet implemented. Set IMAGE_PROVIDER=mock to use the mock provider.",
      );
    default:
      throw new Error(
        `Unsupported IMAGE_PROVIDER value: "${providerType}". Supported values: mock, comfyui, pollinations, hosted`,
      );
  }
}
