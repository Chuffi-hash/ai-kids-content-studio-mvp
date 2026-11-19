import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectImageMime,
  parseImageDimensions,
  GoogleFlowAssetImportService,
} from '../src/services/google-flow/google-flow-asset-import.service.js';

describe('GoogleFlowAssetImportService & Validation', () => {
  // 1x1 valid PNG buffer
  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, // IHDR chunk length (13 bytes)
    0x49, 0x48, 0x44, 0x52, // "IHDR"
    0x00, 0x00, 0x07, 0x80, // width: 1920
    0x00, 0x00, 0x04, 0x38, // height: 1080
    0x08, 0x06, 0x00, 0x00, 0x00, // bit depth, color type, compression, filter, interlace
    0x5d, 0xb7, 0x54, 0xef, // CRC
  ]);

  // Valid JPEG header
  const validJpegBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ]);

  // Valid WebP header
  const validWebpBuffer = Buffer.from([
    0x52, 0x49, 0x46, 0x46, // "RIFF"
    0x24, 0x00, 0x00, 0x00, // length
    0x57, 0x45, 0x42, 0x50, // "WEBP"
    0x56, 0x50, 0x38, 0x20, // "VP8 "
  ]);

  it('1. detectImageMime: Accurately identifies PNG magic bytes', () => {
    const result = detectImageMime(validPngBuffer);
    assert.ok(result);
    assert.equal(result.mimeType, 'image/png');
    assert.equal(result.ext, 'png');
  });

  it('2. detectImageMime: Accurately identifies JPEG magic bytes', () => {
    const result = detectImageMime(validJpegBuffer);
    assert.ok(result);
    assert.equal(result.mimeType, 'image/jpeg');
    assert.equal(result.ext, 'jpg');
  });

  it('3. detectImageMime: Accurately identifies WebP magic bytes', () => {
    const result = detectImageMime(validWebpBuffer);
    assert.ok(result);
    assert.equal(result.mimeType, 'image/webp');
    assert.equal(result.ext, 'webp');
  });

  it('4. detectImageMime: Rejects unsupported formats and scripts', () => {
    const textBuffer = Buffer.from('<html><script>alert(1)</script></html>', 'utf8');
    assert.equal(detectImageMime(textBuffer), null);

    const emptyBuffer = Buffer.alloc(0);
    assert.equal(detectImageMime(emptyBuffer), null);
  });

  it('5. parseImageDimensions: Extracts dimensions from PNG header', () => {
    const dims = parseImageDimensions(validPngBuffer);
    assert.equal(dims.width, 1920);
    assert.equal(dims.height, 1080);
  });

  it('6. importAsset: Rejects payload exceeding 25MB limit', async () => {
    const oversizedBuffer = Buffer.alloc(26 * 1024 * 1024); // 26MB
    oversizedBuffer[0] = 0x89;
    oversizedBuffer[1] = 0x50;
    oversizedBuffer[2] = 0x4e;
    oversizedBuffer[3] = 0x47;

    await assert.rejects(
      async () => {
        await GoogleFlowAssetImportService.importAsset({
          target: 'scene_background',
          imageData: oversizedBuffer,
          sceneId: 'test-scene-1',
        });
      },
      /exceeds maximum 25MB limit/
    );
  });

  it('7. importAsset: Validates required target and target identifiers', async () => {
    // Missing target
    await assert.rejects(
      async () => {
        await GoogleFlowAssetImportService.importAsset({
          target: '' as any,
          imageData: validPngBuffer,
        });
      },
      /target is required/
    );

    // Missing sceneId for scene_background
    await assert.rejects(
      async () => {
        await GoogleFlowAssetImportService.importAsset({
          target: 'scene_background',
          imageData: validPngBuffer,
        });
      },
      /sceneId is required/
    );

    // Missing characterId for character_view
    await assert.rejects(
      async () => {
        await GoogleFlowAssetImportService.importAsset({
          target: 'character_view',
          imageData: validPngBuffer,
        });
      },
      /characterId is required/
    );
  });
});
