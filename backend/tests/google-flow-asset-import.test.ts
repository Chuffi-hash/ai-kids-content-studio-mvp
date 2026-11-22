import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectImageMime,
  parseImageDimensions,
  GoogleFlowAssetImportService,
} from '../src/services/google-flow/google-flow-asset-import.service.js';

import { resolveGoogleFlowReferences } from '../src/services/google-flow/google-flow-asset-import.service.js';
import {
  serializeBackgroundVersion,
  serializeBackgroundVersions,
  serializeBackgroundVersionHistory,
  stripProviderMetadataFromAnimationBackground,
} from '../src/services/google-flow/story-context.service.js';

describe('Canonical background history response contract', () => {
  it('returns one backgroundVersions array for mixed providers, never a parallel googleFlowVersions array', () => {
    const history = serializeBackgroundVersionHistory([
      {
        id: 'version-2',
        sceneId: 'scene-1',
        version: 2,
        provider: 'google_flow',
        prompt: 'Updated Flow background',
        providerMetadata: {
          googleFlowEditId: 'flow-edit-2',
          googleFlowProjectId: 'flow-project',
          googleFlowImageRef: 'https://flow.google.com/asb/image-2',
        },
      },
      {
        id: 'version-1',
        sceneId: 'scene-1',
        version: 1,
        provider: 'gemini',
        prompt: 'Original Gemini background',
        providerMetadata: { requestId: 'gemini-request-1' },
      },
    ], 2);

    assert.deepEqual(Object.keys(history), [
      'activeBackgroundVersion',
      'totalBackgroundVersions',
      'backgroundVersions',
    ]);
    assert.equal(Object.hasOwn(history, 'googleFlowVersions'), false);
    assert.equal(history.activeBackgroundVersion, 2);
    assert.equal(history.totalBackgroundVersions, 2);
    assert.deepEqual(history.backgroundVersions.map((version) => version.version), [1, 2]);
    assert.equal(Object.hasOwn(history.backgroundVersions[1], 'googleFlowEditId'), false);
    assert.equal(history.backgroundVersions[1].prompt, 'Updated Flow background');
    assert.deepEqual(history.backgroundVersions[1].providerMetadata.googleFlow, {
      projectId: 'flow-project',
      editId: 'flow-edit-2',
      editUrl: 'https://flow.google.com/project/flow-project/edit/flow-edit-2',
      imageId: 'flow-edit-2',
      imageRef: 'https://flow.google.com/asb/image-2',
      imageSourceUrl: 'https://flow.google.com/asb/image-2',
      parentAssetId: null,
    });
  });

  it('returns an empty canonical history for missing or malformed input', () => {
    assert.deepEqual(serializeBackgroundVersions(null), []);
    assert.deepEqual(serializeBackgroundVersions({}), []);
    assert.deepEqual(serializeBackgroundVersionHistory(null), {
      activeBackgroundVersion: null,
      totalBackgroundVersions: 0,
      backgroundVersions: [],
    });
  });

  it('removes provider-specific duplicate fields from animationData.background', () => {
    const animationData = {
      version: 1,
      background: {
        imageUrl: '/storage/images/bg.webp',
        imageId: 'local-image-id',
        fit: 'cover',
        source: 'google_flow',
        googleFlowProjectId: 'flow-project',
        googleFlowEditId: 'flow-edit',
        googleFlowEditUrl: 'https://flow.google.com/project/flow-project/edit/flow-edit',
        googleFlowImageId: 'flow-edit',
        googleFlowImageRef: 'https://flow.google.com/asb/image',
        googleFlowVersion: 1,
        providerMetadata: { googleFlow: { editId: 'flow-edit' } },
      },
    };

    const cleaned = stripProviderMetadataFromAnimationBackground(animationData);

    assert.equal(cleaned.background.imageUrl, '/storage/images/bg.webp');
    assert.equal(cleaned.background.imageId, 'local-image-id');
    assert.equal(cleaned.background.fit, 'cover');
    assert.equal(Object.hasOwn(cleaned.background, 'googleFlowEditId'), false);
    assert.equal(Object.hasOwn(cleaned.background, 'googleFlowImageId'), false);
    assert.equal(Object.hasOwn(cleaned.background, 'providerMetadata'), false);
  });
});

describe('Google Flow version metadata normalization', () => {
  it('derives project, edit and image IDs from the Google Flow edit URL', () => {
    const refs = resolveGoogleFlowReferences({
      googleFlowEditUrl:
        'https://flow.google.com/project/2ea32335-0e57-4d1a-9e1e-98fa3cd491e8/edit/07e0e7fb-74f2-4e20-b797-d123238c8352',
      googleFlowImageId: null,
    });

    assert.equal(refs.googleFlowProjectId, '2ea32335-0e57-4d1a-9e1e-98fa3cd491e8');
    assert.equal(refs.googleFlowEditId, '07e0e7fb-74f2-4e20-b797-d123238c8352');
    assert.equal(refs.googleFlowImageId, '07e0e7fb-74f2-4e20-b797-d123238c8352');
    assert.equal(
      refs.googleFlowEditUrl,
      'https://flow.google.com/project/2ea32335-0e57-4d1a-9e1e-98fa3cd491e8/edit/07e0e7fb-74f2-4e20-b797-d123238c8352',
    );
  });

  it('preserves an explicit Google Flow image ID when one is available', () => {
    const refs = resolveGoogleFlowReferences({
      googleFlowEditUrl:
        'https://flow.google.com/project/project-1/edit/edit-1',
      googleFlowImageId: 'provider-image-id',
    });

    assert.equal(refs.googleFlowImageId, 'provider-image-id');
    assert.equal(refs.googleFlowEditId, 'edit-1');
  });

  it('keeps Google Flow metadata in one nested providerMetadata.googleFlow object', () => {
    const version = serializeBackgroundVersion({
      id: 'version-row-1',
      sceneId: 'scene-1',
      version: 2,
      provider: 'google_flow',
      prompt: 'A meadow environment',
      providerMetadata: {
        sourceJobId: 'job-1',
        googleFlowProjectId: 'project-1',
        googleFlowEditId: 'edit-2',
        googleFlowEditUrl: 'https://flow.google.com/project/project-1/edit/edit-2',
        googleFlowImageId: null,
        googleFlowImageRef: 'https://flow.google.com/asb/image-ref',
        googleFlowPrompt: 'A meadow environment',
      },
    });

    assert.equal(version.version, 2);
    assert.equal(version.prompt, 'A meadow environment');
    assert.equal(version.providerMetadata.sourceJobId, 'job-1');
    assert.deepEqual(version.providerMetadata.googleFlow, {
      projectId: 'project-1',
      editId: 'edit-2',
      editUrl: 'https://flow.google.com/project/project-1/edit/edit-2',
      imageId: 'edit-2',
      imageRef: 'https://flow.google.com/asb/image-ref',
      imageSourceUrl: 'https://flow.google.com/asb/image-ref',
      parentAssetId: null,
    });

    // There must not be a second flattened copy on the version object.
    assert.equal(Object.hasOwn(version, 'googleFlowProjectId'), false);
    assert.equal(Object.hasOwn(version, 'googleFlowEditId'), false);
    assert.equal(Object.hasOwn(version, 'googleFlowImageId'), false);
    assert.equal(Object.hasOwn(version, 'googleFlowVersion'), false);
  });

  it('keeps a provider-specific Flow prompt only when it differs from the canonical version prompt', () => {
    const version = serializeBackgroundVersion({
      id: 'version-row-3',
      sceneId: 'scene-1',
      version: 3,
      provider: 'google_flow',
      prompt: 'Normalized background prompt',
      providerMetadata: {
        googleFlow: {
          projectId: 'project-1',
          editId: 'edit-3',
          prompt: 'Provider-specific prompt override',
        },
      },
    });

    assert.equal(version.prompt, 'Normalized background prompt');
    assert.equal(
      version.providerMetadata.googleFlow?.prompt,
      'Provider-specific prompt override',
    );
  });

  it('preserves non-Google providers without manufacturing Flow metadata', () => {
    const version = serializeBackgroundVersion({
      id: 'version-row-2',
      sceneId: 'scene-1',
      version: 3,
      provider: 'gemini',
      prompt: 'A meadow',
      providerMetadata: { requestId: 'gemini-request-1' },
    });

    assert.equal(version.providerMetadata.requestId, 'gemini-request-1');
    assert.equal(Object.hasOwn(version.providerMetadata, 'googleFlow'), false);
    assert.equal(Object.hasOwn(version, 'googleFlowImageId'), false);
  });
});

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
