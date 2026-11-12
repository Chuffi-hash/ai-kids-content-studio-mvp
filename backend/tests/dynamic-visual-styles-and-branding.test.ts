import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { VisualStylesService } from '../src/services/visual-styles/visual-styles.service';
import { DynamicPromptBuilderService } from '../src/services/prompt-builder/dynamic-prompt-builder.service';
import { CopyrightSafetyService } from '../src/services/prompt-builder/copyright-safety.service';
import { PROVIDER_CAPABILITIES_MATRIX, getProviderCapability } from '../src/services/image-generation/provider-capabilities';
import { AssetRightsService } from '../src/services/asset-rights/asset-rights.service';
import { BrandingService } from '../src/services/branding/branding.service';

describe('Dynamic Visual Generation, Branding & Rights Management', () => {
  const visualStyles = new VisualStylesService();
  const promptBuilder = new DynamicPromptBuilderService();
  const copyrightSafety = new CopyrightSafetyService();
  const assetRights = new AssetRightsService();
  const branding = new BrandingService();

  test('Part A.1: Evaluates and exposes all 11 visual style presets', () => {
    const presets = visualStyles.getPresets();
    assert.equal(presets.length, 11, 'Should define exactly 11 visual style presets');

    const expectedIds = [
      '2d_cartoon',
      '2d_storybook',
      '3d_animated',
      '3d_pixar',
      'realistic',
      'cinematic',
      'anime',
      'watercolor',
      'clay_animation',
      'fantasy_illustration',
      'custom',
    ];

    for (const expectedId of expectedIds) {
      const preset = visualStyles.getPreset(expectedId);
      assert.ok(preset, `Preset '${expectedId}' must exist`);
      assert.ok(preset.name, `Preset '${expectedId}' must have a name`);
      assert.ok(preset.renderingCharacteristics, `Preset '${expectedId}' must have rendering characteristics`);
      assert.ok(preset.lightingCharacteristics, `Preset '${expectedId}' must have lighting characteristics`);
      assert.ok(preset.textureInstructions, `Preset '${expectedId}' must have texture instructions`);
      assert.ok(preset.colorPaletteInstructions, `Preset '${expectedId}' must have color palette instructions`);
      assert.ok(preset.negativePrompts.length > 0, `Preset '${expectedId}' must have negative prompts`);
    }
  });

  test('Part A.2: Advisory visual consistency assistant evaluates combinations without silent overrides', () => {
    // Scenario A: Photorealistic background + 3D Pixar character
    const resA = visualStyles.evaluateStyleCompatibility('realistic', '3d_pixar');
    assert.equal(resA.recommended, false);
    assert.ok(resA.contrastRatio > 0.4);
    assert.ok(resA.warnings.length > 0, 'Scenario A should provide advisory warning');

    // Scenario B: 2D Cartoon background + 2D Vector character
    const resB = visualStyles.evaluateStyleCompatibility('2d_cartoon', '2d_cartoon');
    assert.equal(resB.recommended, true);
    assert.equal(resB.clashSeverity, 'none');

    // Scenario C: Cinematic Fantasy background + 3D stylized character
    const resC = visualStyles.evaluateStyleCompatibility('cinematic', '3d_animated');
    assert.ok(resC.score >= 60);

    // Scenario D: Watercolor background + Illustrated character
    const resD = visualStyles.evaluateStyleCompatibility('watercolor', '2d_storybook');
    assert.equal(resD.recommended, true);
    assert.equal(resD.clashSeverity, 'none');
  });

  test('Part A.3: Dynamic Prompt Builder Mode 1 (environment-only) vs Mode 2 (complete scene with disclaimer)', () => {
    // Mode 1: Environment-only (strict empty background for vector/raster character staging)
    const mode1Result = promptBuilder.buildBackgroundPrompt({
      description: 'Lush green forest meadow with glowing fireflies',
      stylePreset: 'fantasy_illustration',
      aspectRatio: '16:9',
      mode: 'environment_only',
    });
    assert.equal(mode1Result.mode, 'environment_only');
    assert.ok(mode1Result.negativePrompt.includes('people'));
    assert.ok(mode1Result.negativePrompt.includes('characters'));
    assert.strictEqual(mode1Result.disclaimer, undefined);

    // Mode 2: Complete AI scene with embedded characters
    const mode2Result = promptBuilder.buildBackgroundPrompt({
      description: 'A boy astronaut and his cute robotic dog exploring a red crystal cave on Mars',
      stylePreset: 'cinematic',
      aspectRatio: '9:16',
      mode: 'complete_scene',
    });
    assert.equal(mode2Result.mode, 'complete_scene');
    assert.ok(mode2Result.isCompleteSceneWithEmbeddedCharacters);
    assert.strictEqual(mode2Result.areCharactersIndependentlyAnimated, false);
    assert.ok(mode2Result.disclaimer && mode2Result.disclaimer.includes('embedded'));
  });

  test('Part A.4: Copyright guardrails detect protected franchises and living artist emulation', () => {
    const cleanPrompt = copyrightSafety.checkAndSanitize('A smiling young bear in a bright blue shirt in the woods');
    assert.equal(cleanPrompt.isSafe, true);
    assert.equal(cleanPrompt.warnings.length, 0);

    const franchisePrompt = copyrightSafety.checkAndSanitize('Generate Mickey Mouse and Pikachu having tea with SpongeBob');
    assert.equal(franchisePrompt.isSafe, false);
    assert.ok(franchisePrompt.warnings.length >= 2);
    assert.ok(franchisePrompt.blockedTerms.includes('Mickey Mouse') || franchisePrompt.blockedTerms.includes('Pikachu'));

    const artistPrompt = copyrightSafety.checkAndSanitize('A whimsical landscape painted in the style of Hayao Miyazaki and Studio Ghibli');
    assert.equal(artistPrompt.isSafe, false);
    assert.ok(artistPrompt.warnings.some((w) => w.includes('living artist') || w.includes('franchise')));
  });

  test('Part C: Provider capabilities matrix and asset rights provenance', () => {
    const geminiCap = getProviderCapability('gemini');
    assert.ok(geminiCap);
    assert.equal(geminiCap.providerWatermark, false, 'Gemini Imagen 3 is watermark-free via official API');
    assert.equal(geminiCap.commercialUseAllowed, true);

    const record = assetRights.createProvenanceRecord({
      assetId: 'asset-bg-123',
      assetType: 'background',
      provider: 'gemini',
      model: 'imagen-3.0-generate-002',
      promptUsed: 'Serene mountain valley at sunset',
      stylePreset: 'cinematic',
      aspectRatio: '16:9',
      nativeDimensions: { width: 1920, height: 1080 },
    });

    assert.equal(record.commercialStatus, 'verified_commercial');
    assert.equal(record.hasProviderWatermark, false);
    assert.ok(record.generationTimestamp);

    const summary = assetRights.getPublishingRightsSummary([record]);
    assert.equal(summary.overallPublishingStatus, 'ready_for_commercial_use');
    assert.equal(summary.watermarkFree, true);
  });

  test('Part B: Channel Branding layout, safe-area calculations across all 4 formats', () => {
    const testBranding = {
      channelName: 'Kids Magic TV',
      logoUrl: '/storage/branding/logo.png',
      enabled: true,
      positionPreset: 'top-right' as const,
      opacity: 0.9,
      sizePercent: 12,
      paddingPx: 24,
      alwaysVisible: true,
    };

    // 16:9 Landscape
    const layout169 = branding.calculateOverlayLayout(testBranding, '16:9', 1920, 1080);
    assert.ok(layout169.visible);
    assert.ok(layout169.top !== undefined);
    assert.ok(layout169.right !== undefined);
    assert.equal(layout169.zIndex, 35, 'Branding must sit at zIndex 35');

    // 9:16 Vertical Short (must respect top status bar / notch safe-margin)
    const layout916 = branding.calculateOverlayLayout(testBranding, '9:16', 1080, 1920);
    assert.ok(layout916.visible);
    assert.ok(layout916.top !== undefined && layout916.top >= 36, '9:16 vertical must have top safe margin >= 36px');

    // 1:1 Square
    const layout11 = branding.calculateOverlayLayout(testBranding, '1:1', 1080, 1080);
    assert.ok(layout11.visible);

    // 4:5 Portrait
    const layout45 = branding.calculateOverlayLayout(testBranding, '4:5', 1080, 1350);
    assert.ok(layout45.visible);
  });
});
