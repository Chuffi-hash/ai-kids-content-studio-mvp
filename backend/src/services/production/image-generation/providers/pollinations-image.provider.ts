import {
  ImageGenerationProvider,
  ImageGenerationInput,
  ImageGenerationOutput,
} from "../image-generation.provider.js";
import { StorageService } from "../../../storage/storage.service.js";

const POLLINATIONS_IMAGE_URL = "https://image.pollinations.ai/prompt";
const REQUEST_TIMEOUT_MS = 60000; // 60 seconds
const MAX_RATE_LIMIT_RETRIES = 2;

export class PollinationsImageProvider implements ImageGenerationProvider {
  constructor(private storageService: StorageService) {}

  async generateImage(
    input: ImageGenerationInput,
  ): Promise<ImageGenerationOutput> {
    const { prompt, width = 1024, height = 1024 } = input;

    if (!prompt || prompt.trim().length === 0) {
      throw new Error("PollinationsImageProvider: prompt is required");
    }

    const encodedPrompt = encodeURIComponent(prompt.trim());
    const seed = Math.floor(Math.random() * 1_000_000);
    const model = process.env.POLLINATIONS_MODEL || "zimage";
    const url = `${POLLINATIONS_IMAGE_URL}/${encodedPrompt}?width=${width}&height=${height}&model=${model}&enhance=true&safe=true&nologo=true&seed=${seed}`;

    console.log(
      `[PollinationsImageProvider] Generating image with prompt: "${prompt.substring(0, 50)}..."`,
    );

    const response = await this.fetchWithRetry(url);

    if (!response.ok) {
      throw new Error(
        `PollinationsImageProvider: HTTP ${response.status} ${response.statusText}`,
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      throw new Error(
        `PollinationsImageProvider: unexpected content type "${contentType}"`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) {
      throw new Error(
        "PollinationsImageProvider: received empty image response",
      );
    }

    this.validateImageSignature(buffer, contentType);

    // Save via StorageService so the returned URL is served from /storage
    const extension = contentType === "image/jpeg" ? "jpg" : "png";
    const filename = `scene-${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`;
    const storageResult = await this.storageService.saveFile(
      buffer,
      filename,
      contentType,
    );
    console.log("[PollinationsImageProvider] Image saved successfully");

    return { url: storageResult.url };
  }

  private async fetchWithRetry(url: string): Promise<Response> {
    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: "GET",
          headers: { Accept: "image/*" },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        if (error instanceof Error && error.name === "TimeoutError") {
          throw new Error(`PollinationsImageProvider: request timed out after ${REQUEST_TIMEOUT_MS}ms`);
        }
        throw new Error(`PollinationsImageProvider: network error while requesting image: ${error instanceof Error ? error.message : String(error)}`);
      }

      if (response.status !== 429 || attempt === MAX_RATE_LIMIT_RETRIES) {
        return response;
      }

      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      const delayMs = Number.isFinite(retryAfterSeconds)
        ? Math.min(retryAfterSeconds * 1000, 10000)
        : 2000 * (attempt + 1);
      console.warn(`[PollinationsImageProvider] Rate limited; retrying in ${delayMs / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error("PollinationsImageProvider: rate limit retries exhausted");
  }

  private validateImageSignature(buffer: Buffer, contentType: string): void {
    const isJpeg = buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    if ((contentType === "image/jpeg" && !isJpeg) || (contentType === "image/png" && !isPng)) {
      throw new Error(`PollinationsImageProvider: response body does not match ${contentType}`);
    }
  }
}
