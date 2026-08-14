import { ImageGenerationProvider } from "../image-generation.provider.js";

const POLLINATIONS_IMAGE_URL = "https://image.pollinations.ai/prompt";
const DEFAULT_WIDTH = 576;
const DEFAULT_HEIGHT = 576;
const REQUEST_TIMEOUT_MS = 60000; // 60 seconds
const MAX_RATE_LIMIT_RETRIES = 2;

export class PollinationsImageProvider implements ImageGenerationProvider {
  async generateImage(options: {
    prompt: string;
    width?: number;
    height?: number;
  }): Promise<{
    imageBuffer: Buffer;
    mimeType: string;
  }> {
    const { prompt, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT } = options;

    if (!prompt || prompt.trim().length === 0) {
      throw new Error("PollinationsImageProvider: prompt is required");
    }

    const encodedPrompt = encodeURIComponent(prompt.trim());
    const seed = Math.floor(Math.random() * 1_000_000);
    const model = process.env.POLLINATIONS_MODEL || "zimage";
    const url = `${POLLINATIONS_IMAGE_URL}/${encodedPrompt}?width=${width}&height=${height}&model=${model}&enhance=true&safe=true&nologo=true&seed=${seed}`;

    const response = await this.fetchWithRetry(url, prompt);

    if (!response.ok) {
      throw new Error(
        `PollinationsImageProvider: HTTP ${response.status} ${response.statusText} for prompt "${prompt}"`,
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      throw new Error(
        `PollinationsImageProvider: unexpected content type "${contentType}" for prompt "${prompt}"`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) {
      throw new Error(
        `PollinationsImageProvider: received empty image response for prompt "${prompt}"`,
      );
    }

    // Validate the body is actually image data (reject HTML/JSON/error pages)
    const magic = buffer.subarray(0, 8).toString("hex");
    const isJpeg = magic.startsWith("ffd8ff");
    const isPng = magic.startsWith("89504e470d0a1a0a");
    const isGif = magic.startsWith("47494638");
    const isWebp =
      magic.startsWith("52494646") &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP";
    const isSvg =
      buffer.subarray(0, 5).toString("ascii").toLowerCase().includes("<svg") ||
      buffer.subarray(0, 5).toString("ascii").toLowerCase().includes("<?xml");

    if (!isJpeg && !isPng && !isGif && !isWebp && !isSvg) {
      throw new Error(
        `PollinationsImageProvider: response body is not image data (content-type "${contentType}", first bytes: ${magic}) for prompt "${prompt}"`,
      );
    }

    console.log(
      `[PollinationsImageProvider] Response status: ${response.status}, content-type: ${contentType}, size: ${buffer.length} bytes`,
    );

    return {
      imageBuffer: buffer,
      mimeType: contentType,
    };
  }

  private async fetchWithRetry(url: string, prompt: string): Promise<Response> {
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
          throw new Error(`PollinationsImageProvider: request timed out after ${REQUEST_TIMEOUT_MS}ms for prompt "${prompt}"`);
        }
        throw new Error(`PollinationsImageProvider: network error while requesting image for prompt "${prompt}": ${error instanceof Error ? error.message : String(error)}`);
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
}
