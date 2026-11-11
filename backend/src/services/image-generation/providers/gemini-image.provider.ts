import { ImageGenerationProvider } from '../image-generation.provider.js';

export interface GeminiImageOptions {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '4:5';
  referenceImageBuffer?: Buffer;
  referenceImageBase64?: string;
  referenceImageMimeType?: string;
}

export class GeminiImageProvider implements ImageGenerationProvider {
  private apiKey?: string;
  private model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    this.apiKey =
      options?.apiKey ||
      process.env.GOOGLE_GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY;
    this.model =
      options?.model ||
      process.env.GEMINI_IMAGE_MODEL ||
      'gemini-2.5-flash-image';
  }

  public getModel(): string {
    return this.model;
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * Generates an image using Google Generative AI APIs.
   * Supports Nano Banana models (gemini-2.5-flash-image / gemini-3.1-flash-image)
   * with inline reference image conditioning, and backwards compatibility with imagen-*.
   */
  async generateImage(
    options: {
      prompt: string;
      negativePrompt?: string;
      width?: number;
      height?: number;
      aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '4:5';
      referenceImageBuffer?: Buffer;
      referenceImageBase64?: string;
      referenceImageMimeType?: string;
    }
  ): Promise<{
    imageBuffer: Buffer;
    mimeType: string;
  }> {
    const apiKey =
      this.apiKey ||
      process.env.GOOGLE_GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error(
        'Gemini API key is not configured. Please set GEMINI_API_KEY or GOOGLE_GEMINI_API_KEY in your environment.'
      );
    }

    const {
      prompt,
      negativePrompt,
      aspectRatio = '1:1',
      referenceImageBuffer,
      referenceImageBase64,
      referenceImageMimeType = 'image/png',
    } = options;

    if (!prompt || prompt.trim().length === 0) {
      throw new Error('GeminiImageProvider: prompt is required');
    }

    // Determine reference image base64 if provided
    let inlineRefBase64: string | undefined;
    if (referenceImageBase64) {
      inlineRefBase64 = referenceImageBase64.replace(/^data:image\/\w+;base64,/, '');
    } else if (referenceImageBuffer) {
      inlineRefBase64 = referenceImageBuffer.toString('base64');
    }

    // Route 1: Legacy Imagen model (:predict)
    if (this.model.startsWith('imagen-')) {
      return await this.generateWithImagenLegacy({
        apiKey,
        prompt,
        negativePrompt,
        aspectRatio,
      });
    }

    // Route 2: Modern Gemini image generation (:generateContent)
    return await this.generateWithGeminiContent({
      apiKey,
      prompt,
      negativePrompt,
      inlineRefBase64,
      refMimeType: referenceImageMimeType,
    });
  }

  /**
   * Generates image via modern Gemini generateContent API (e.g. gemini-2.5-flash-image)
   */
  private async generateWithGeminiContent(options: {
    apiKey: string;
    prompt: string;
    negativePrompt?: string;
    inlineRefBase64?: string;
    refMimeType: string;
  }): Promise<{ imageBuffer: Buffer; mimeType: string }> {
    const { apiKey, prompt, negativePrompt, inlineRefBase64, refMimeType } = options;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${apiKey}`;

    const parts: any[] = [];

    // If reference image conditioning is provided, add inlineData part first
    if (inlineRefBase64) {
      parts.push({
        inlineData: {
          mimeType: refMimeType || 'image/png',
          data: inlineRefBase64,
        },
      });
    }

    let finalPromptText = prompt;
    if (negativePrompt && negativePrompt.trim().length > 0) {
      finalPromptText += `\nAvoid: ${negativePrompt.trim()}`;
    }

    parts.push({ text: finalPromptText });

    const requestBody = {
      contents: [
        {
          parts,
        },
      ],
      generationConfig: {
        responseModalities: ['IMAGE'],
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const errBody = await res.text();
      let errorDetail = errBody;
      try {
        const parsed = JSON.parse(errBody);
        errorDetail = parsed.error?.message || errBody;
      } catch {
        // use raw text
      }
      throw new Error(`Gemini Image Generation HTTP ${res.status}: ${errorDetail}`);
    }

    const data = (await res.json()) as any;
    const candidateParts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = candidateParts.find((p: any) => p.inlineData?.data);

    if (!imagePart || !imagePart.inlineData?.data) {
      const textPart = candidateParts.find((p: any) => p.text);
      const detail = textPart?.text || 'No image data returned in response candidates';
      throw new Error(`Gemini Image Generation Error: ${detail}`);
    }

    const mimeType = imagePart.inlineData.mimeType || 'image/png';
    const imageBuffer = Buffer.from(imagePart.inlineData.data, 'base64');

    return {
      imageBuffer,
      mimeType,
    };
  }

  /**
   * Legacy Imagen model support (:predict)
   */
  private async generateWithImagenLegacy(options: {
    apiKey: string;
    prompt: string;
    negativePrompt?: string;
    aspectRatio: string;
  }): Promise<{ imageBuffer: Buffer; mimeType: string }> {
    const { apiKey, prompt, negativePrompt, aspectRatio } = options;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:predict?key=${apiKey}`;

    const parameters: any = {
      sampleCount: 1,
      aspectRatio,
      outputMimeType: 'image/png',
    };

    if (negativePrompt && negativePrompt.trim().length > 0) {
      parameters.negativePrompt = negativePrompt.trim();
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const errBody = await res.text();
      let errorDetail = errBody;
      try {
        const parsed = JSON.parse(errBody);
        errorDetail = parsed.error?.message || errBody;
      } catch {
        // use raw text
      }
      throw new Error(`Gemini Imagen API HTTP ${res.status}: ${errorDetail}`);
    }

    const data = (await res.json()) as any;
    const b64 = data.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) {
      throw new Error('Gemini Imagen API returned successful status but no image predictions');
    }

    return {
      imageBuffer: Buffer.from(b64, 'base64'),
      mimeType: 'image/png',
    };
  }
}
