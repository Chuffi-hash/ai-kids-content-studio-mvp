import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { VisualStylesService, VISUAL_STYLE_PRESETS } from '../src/services/visual-styles/visual-styles.service.js';
import { DynamicPromptBuilderService } from '../src/services/prompt-builder/dynamic-prompt-builder.service.js';
import { CopyrightSafetyService } from '../src/services/prompt-builder/copyright-safety.service.js';
import { ProviderCapabilitiesService, PROVIDER_CAPABILITIES } from '../src/services/image-generation/provider-capabilities.js';
import { AssetRightsService } from '../src/services/asset-rights/asset-rights.service.js';
import { BrandingService } from '../src/services/branding/branding.service.js';

describe('Dynamic Visual Generation, Branding & Rights Management', () => {
  const branding = new BrandingService();

  test('Part A.1: Evaluates and exposes all 11 visual style presets', () => {
    const presets = VisualStylesService.getAllPresets();
    assert.equal(presets.length, 11, 'Should define exactly 11 visual style presets');

    const expectedIds = [
      '2d_cartoon',
      'storybook_illustrated',
      '3d_animated',
      '3d_pixar',
      'photorealistic',
      'cinematic',
      'anime',
      'watercolor',
      'claymation',
      'fantasy_illustration',
      'custom',
    ];

    for (const expectedId of expectedIds) {
      const preset = VisualStylesService.getPreset(expectedId);
      assert.ok(preset, `Preset '${expectedId}' must exist`);
      assert.ok(preset.name, `Preset '${expectedId}' must have a name`);
      assert.ok(preset.rendering, `Preset '${expectedId}' must have rendering characteristics`);
      assert.ok(preset.lighting, `Preset '${expectedId}' must have lighting characteristics`);
      assert.ok(preset.texture, `Preset '${expectedId}' must have texture instructions`);
      assert.ok(preset.colorPalette, `Preset '${expectedId}' must have color palette instructions`);
      assert.ok(preset.negativePrompt.length > 0, `Preset '${expectedId}' must have negative prompt`);
    }
  });

  test('Part A.2: Advisory visual consistency assistant evaluates combinations without silent overrides', () => {
    // Scenario A: Photorealistic background + 3D Pixar character (contrast pairing)
    const resA = VisualStylesService.evaluateStyleCompatibility('photorealistic', '3d_pixar');
    assert.equal(resA.matchLevel, 'contrast');
    assert.equal(resA.compatible, true, 'Advisory guidance never blocks user selection');
    assert.ok(resA.suggestedAdjustments.length > 0);

    // Scenario B: 2D Cartoon background + 2D Cartoon character (perfect harmony)
    const resB = VisualStylesService.evaluateStyleCompatibility('2d_cartoon', '2d_cartoon');
    assert.equal(resB.matchLevel, 'perfect');
    assert.equal(resB.compatible, true);

    // Scenario C: Cinematic Fantasy background + 3D stylized character
    const resC = VisualStylesService.evaluateStyleCompatibility('fantasy_illustration', '3d_pixar');
    assert.equal(resC.matchLevel, 'harmonious');
    assert.equal(resC.compatible, true);

    // Scenario D: Watercolor background + Illustrated character
    const resD = VisualStylesService.evaluateStyleCompatibility('watercolor', 'storybook_illustrated');
    assert.equal(resD.matchLevel, 'harmonious');
    assert.equal(resD.compatible, true);

    // Potential clash detection (Claymation + Anime) advisory warning without hard block
    const resClash = VisualStylesService.evaluateStyleCompatibility('claymation', 'anime');
    assert.equal(resClash.matchLevel, 'clashing');
    assert.equal(resClash.compatible, true, 'Advisory warning must not block user choice');
    assert.ok(resClash.warning && resClash.warning.length > 0);
  });

  test('Part A.3: Dynamic Prompt Builder Mode 1 (environment-only) vs Mode 2 (complete scene with disclaimer)', () => {
    // Mode 1: Environment-only (strict empty background plate for vector/raster character staging)
    const mode1Result = DynamicPromptBuilderService.buildBackgroundPrompt({
      environmentType: 'Lush green forest meadow with glowing fireflies',
      styleId: 'fantasy_illustration',
      aspectRatio: '16:9',
      mode: 'environment_only',
    });
    assert.equal(mode1Result.metadata.mode, 'environment_only');
    assert.ok(mode1Result.negativePrompt.includes('people') || mode1Result.negativePrompt.includes('human'));
    assert.strictEqual(mode1Result.metadata.disclaimer, undefined);

    // Mode 2: Complete AI scene with embedded characters
    const mode2Result = DynamicPromptBuilderService.buildBackgroundPrompt({
      environmentType: 'Crystal cave on Mars',
      characters: [{ name: 'Sammy', species: 'Astronaut boy', description: 'holding a compass' }],
      styleId: 'cinematic',
      aspectRatio: '9:16',
      mode: 'complete_scene',
    });
    assert.equal(mode2Result.metadata.mode, 'complete_scene');
    assert.ok(mode2Result.metadata.isCompleteSceneWithEmbeddedCharacters);
    assert.strictEqual(mode2Result.metadata.areCharactersIndependentlyAnimated, false);
    assert.ok(mode2Result.metadata.disclaimer && mode2Result.metadata.disclaimer.includes('embedded'));
  });

  test('Part A.4: Copyright guardrails detect protected franchises and living artist emulation', () => {
    const cleanPrompt = CopyrightSafetyService.inspectPrompt('A smiling young bear in a bright blue shirt in the woods');
    assert.equal(cleanPrompt.safe, true);
    assert.equal(cleanPrompt.warnings.length, 0);

    const franchisePrompt = CopyrightSafetyService.inspectPrompt('Generate Mickey Mouse and Pikachu having tea with SpongeBob');
    assert.equal(franchisePrompt.safe, false);
    assert.ok(franchisePrompt.warnings.length >= 2);
    assert.ok(franchisePrompt.flaggedTerms.includes('mickey mouse') || franchisePrompt.flaggedTerms.includes('pikachu'));

    const artistPrompt = CopyrightSafetyService.inspectPrompt('A whimsical landscape painted in the style of Hayao Miyazaki and Studio Ghibli');
    assert.equal(artistPrompt.safe, false);
    assert.ok(artistPrompt.warnings.some((w) => w.toLowerCase().includes('artist') || w.toLowerCase().includes('franchise')));
  });

  test('Part C: Provider capabilities matrix and asset rights provenance', () => {
    const geminiCap = ProviderCapabilitiesService.getCapability('gemini');
    assert.ok(geminiCap);
    assert.equal(geminiCap.watermarkFree, true, 'Gemini output is watermark-free via official API');
    assert.equal(geminiCap.commercialUseStatus, 'verified_commercial');

    const record = AssetRightsService.createProvenanceRecord({
      assetId: 'asset-bg-123',
      assetType: 'background',
      provider: 'gemini',
      model: 'imagen-3.0-generate-002',
      originalPrompt: 'Serene mountain valley at sunset',
      stylePreset: 'cinematic',
      aspectRatio: '16:9',
      dimensions: { width: 1920, height: 1080 },
    });

    assert.equal(record.commercialUseStatus, 'verified_commercial');
    assert.equal(record.watermarkStatus, 'watermark_free');
    assert.ok(record.generatedAt);

    const summary = AssetRightsService.generatePublishingRightsSummary([record]);
    assert.equal(summary.eligibleForCommercialUse, true);
    assert.equal(summary.watermarkFreeCount, 1);
  });

  test('Part B: Channel Branding layout, safe-area calculations across all 4 formats', () => {
    const testBranding = {
      channelName: 'Kids Magic TV',
      logoUrl: '/storage/branding/logo.png',
      enabled: true,
      position: 'top-right' as const,
      opacity: 0.9,
      width: 140,
      height: 50,
      padding: 24,
      alwaysVisible: true,
    };

    // 16:9 Landscape
    const layout169 = BrandingService.calculatePlacement(testBranding, '16:9', 1920, 1080);
    assert.ok(layout169.visible);
    assert.ok(layout169.x > 0);
    assert.ok(layout169.y >= 0);

    // 9:16 Vertical Short (must respect top safe-margin)
    const layout916 = BrandingService.calculatePlacement(testBranding, '9:16', 1080, 1920);
    assert.ok(layout916.visible);
    assert.ok(layout916.y >= 18, '9:16 vertical must have top safe margin');

    // 1:1 Square
    const layout11 = BrandingService.calculatePlacement(testBranding, '1:1', 1080, 1080);
    assert.ok(layout11.visible);

    // 4:5 Portrait
    const layout45 = BrandingService.calculatePlacement(testBranding, '4:5', 1080, 1350);
    assert.ok(layout45.visible);
  });
});
