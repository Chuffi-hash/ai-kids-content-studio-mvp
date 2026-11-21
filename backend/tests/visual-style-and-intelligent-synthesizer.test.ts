import test from 'node:test';
import assert from 'node:assert';
import { VisualStylesService, VISUAL_STYLE_PRESETS } from '../src/services/visual-styles/visual-styles.service.js';
import { CanonicalVisualStyleId, StyleIntensity, CharacterSafeArea } from '../src/services/visual-styles/visual-styles.types.js';
import { ScenePromptV2Service } from '../src/services/story-generation/scene-prompt-v2.service.js';
import { DynamicPromptBuilderService } from '../src/services/prompt-builder/dynamic-prompt-builder.service.js';
import { GenerationPromptService } from '../src/services/google-flow/generation-prompt.service.js';
import { StoryVisualBible, SceneVisualSpecification, DEFAULT_EXCLUSION_RULES } from '../src/services/story-generation/visual-bible.types.js';

test('Project Visual Style & Intelligent Scene Background Prompt Synthesizer Suite', async (t) => {

  // Test 1: All 10 Canonical Visual Styles
  await t.test('1. All 10 Canonical Visual Styles produce distinct, rich, character-free guidelines', () => {
    const canonicalStyles: CanonicalVisualStyleId[] = [
      'cinematic',
      'cartoon',
      'anime',
      '3d_animation',
      'storybook_illustration',
      'stylized_realism',
      'fantasy_illustration',
      'watercolor',
      'pixel_art',
      'custom',
    ];

    const generatedPrompts = new Set<string>();

    for (const styleId of canonicalStyles) {
      const preset = VisualStylesService.getPreset(styleId);
      assert.ok(preset, `Preset should exist for ${styleId}`);
      assert.ok(preset.name, `Preset should have a name for ${styleId}`);
      assert.ok(preset.rendering, `Preset should have rendering definition for ${styleId}`);
      assert.ok(preset.negativePrompt, `Preset should have negative prompt for ${styleId}`);

      // Ensure style ID maps back
      if (styleId !== 'custom') {
        assert.ok(preset.id === styleId || preset.id.includes(styleId), `ID should match for ${styleId}`);
      }

      // Check prompt composition for each style
      const mockBible: StoryVisualBible = {
        version: 1,
        storyId: 'story-test-styles',
        storyTitle: 'Test World Journey',
        artDirection: {
          style: preset.name,
          renderingTechnique: preset.rendering,
          visualQuality: 'Masterpiece 8K plate',
          levelOfDetail: 'high',
          colorPalette: preset.colorPalette,
          textures: preset.texture,
          lightingStyle: preset.lighting,
          depthAndPerspective: preset.depth,
          realismOrStylization: preset.visualTreatment,
          overallTone: preset.atmosphere,
        },
        worldIdentity: {
          worldDescription: 'Enchanted kingdom landscape',
          geography: 'Hills, streams, ancient groves',
          recurringLocations: ['Ancient Sunlit Grove'],
          recognizableLandmarks: ['Great Hollow Banyan'],
          terrainAndVegetation: 'Mossy riverbanks',
          recurringObjects: ['Carved stone markers'],
          environmentalDesignRules: ['Natural contours'],
        },
        lightingAndColor: {
          dominantColors: ['#2E7D32', '#FFA000'],
          secondaryColors: ['#FFF9C4'],
          lightingQuality: 'Warm golden volumetric light',
          contrast: 'medium',
          warmth: 'warm',
          shadows: 'Soft translucent',
          atmosphericDepth: 'Gentle haze',
        },
        compositionRules: {
          defaultCameraPerspective: 'Eye-level wide shot',
          environmentDepth: 'Three planes',
          layers: {
            foreground: 'Framing wildflowers',
            middleground: 'Open stage ground',
            background: 'Misty hills',
          },
          characterPlacementZones: ['center'],
          clearingRules: 'Keep center clear',
          defaultAspectRatio: '16:9',
        },
        exclusionRules: DEFAULT_EXCLUSION_RULES,
        projectVisualSettings: {
          visualStyle: styleId,
          styleIntensity: 'balanced',
          colorPalette: 'vibrant',
          defaultLighting: 'soft_daylight',
          backgroundComplexity: 'balanced',
          aspectRatio: '16:9',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const mockSpec: SceneVisualSpecification = {
        storyId: 'story-test-styles',
        sceneId: `scene-${styleId}`,
        sceneNumber: 1,
        sceneTitle: 'Arrival at the Sacred Grove',
        sceneSummary: 'The empty scenic entrance to the ancient forest.',
        visualDescription: 'Sunlit ancient grove with mossy stones and clear stream',
        locationId: 'loc_sacred_grove_123',
        locationName: 'Sacred Ancient Grove',
        locationIdentity: 'Distant rolling mountains with canopy trees',
        permanentAnchors: ['Ancient Stone Gateway', 'Whispering Brook'],
        timeOfDay: 'MORNING',
        weather: 'CLEAR',
        mood: 'peaceful',
        lighting: 'Warm morning sunlight through tree branches',
        cameraPerspective: 'Eye-level wide establishing shot',
        composition: {
          foreground: 'Low ferns and wild clover',
          middleground: 'Open level clearing for character rigs',
          background: 'Ancient towering trees against morning sky',
          characterPlacementZone: 'center',
          clearingDescription: 'Keep central clearing open for animated characters.',
        },
        environmentalObjects: ['Mossy stones', 'Crystal brook'],
        environmentalChanges: [],
        exclusionRules: DEFAULT_EXCLUSION_RULES.prohibitedElements,
        aspectRatio: '16:9',
        continuityInstructions: ['Preserve location landmarks'],
      };

      const prompt = ScenePromptV2Service.composePrompt(mockSpec, mockBible, {
        visualStyle: styleId,
        aspectRatio: '16:9',
      });

      // Verify uniqueness and quality
      assert.ok(prompt.length > 50, `Prompt for ${styleId} should be comprehensive`);
      assert.ok(prompt.includes('Environment plate only'), `Prompt for ${styleId} must have environment plate only`);
      assert.ok(prompt.includes('--ar 16:9'), `Prompt for ${styleId} must include aspect ratio flag`);

      // Ensure no character entities leaked in scenic prompt
      const validation = ScenePromptV2Service.validatePrompt(prompt);
      assert.strictEqual(validation.isValid, true, `Validation should pass for ${styleId}`);

      generatedPrompts.add(prompt);
    }

    // All canonical styles should yield distinct prompts
    assert.strictEqual(generatedPrompts.size, canonicalStyles.length, 'Each canonical style must yield a unique prompt');
  });

  // Test 2: Style Intensity Modifiers
  await t.test('2. Style Intensity (subtle, balanced, strong) modifies visual prompt directives', () => {
    const preset = VisualStylesService.getPreset('watercolor');

    const subtleInstruction = VisualStylesService.getIntensityInstruction(preset, 'subtle');
    const balancedInstruction = VisualStylesService.getIntensityInstruction(preset, 'balanced');
    const strongInstruction = VisualStylesService.getIntensityInstruction(preset, 'strong');

    assert.ok(subtleInstruction.toLowerCase().includes('subtle'), 'Subtle instruction should contain "subtle"');
    assert.ok(balancedInstruction.toLowerCase().includes('visual style'), 'Balanced instruction should contain "visual style"');
    assert.ok(strongInstruction.toLowerCase().includes('strong'), 'Strong instruction should contain "strong"');

    // They must all be different
    assert.notStrictEqual(subtleInstruction, balancedInstruction);
    assert.notStrictEqual(balancedInstruction, strongInstruction);
  });

  // Test 3: Inheritance Chain (Scene Override -> Project Setting -> Default)
  await t.test('3. Inheritance Chain: Scene Override -> Project Setting -> System Default', () => {
    // 3A. Fallback to System Default when nothing specified
    const def = VisualStylesService.resolveEffectiveVisualSettings({});
    assert.strictEqual(def.visualStyle.id, 'storybook_illustration');
    assert.strictEqual(def.isStyleOverridden, false);
    assert.strictEqual(def.styleIntensity, 'balanced');
    assert.strictEqual(def.colorPalette, 'vibrant');
    assert.strictEqual(def.lighting, 'soft_daylight');
    assert.strictEqual(def.characterSafeArea, 'open_center');

    // 3B. Inherit from Project Setting
    const fromProject = VisualStylesService.resolveEffectiveVisualSettings({
      projectSettings: {
        visualStyle: 'cinematic',
        styleIntensity: 'strong',
        colorPalette: 'warm',
        defaultLighting: 'golden_hour',
        backgroundComplexity: 'detailed',
        aspectRatio: '9:16',
      },
    });
    assert.strictEqual(fromProject.visualStyle.id, 'cinematic');
    assert.strictEqual(fromProject.isStyleOverridden, false);
    assert.strictEqual(fromProject.styleIntensity, 'strong');
    assert.strictEqual(fromProject.colorPalette, 'warm');
    assert.strictEqual(fromProject.lighting, 'golden_hour');
    assert.strictEqual(fromProject.backgroundComplexity, 'detailed');
    assert.strictEqual(fromProject.aspectRatio, '9:16');

    // 3C. Scene Override takes precedence over Project Setting
    const withSceneOverride = VisualStylesService.resolveEffectiveVisualSettings({
      projectSettings: {
        visualStyle: 'cinematic',
        styleIntensity: 'balanced',
        colorPalette: 'warm',
      },
      sceneOverrides: {
        visualStyle: 'anime',
        styleIntensity: 'strong',
        colorPalette: 'pastel',
        characterSafeArea: 'open_left',
      },
    });
    assert.strictEqual(withSceneOverride.visualStyle.id, 'anime');
    assert.strictEqual(withSceneOverride.isStyleOverridden, true);
    assert.strictEqual(withSceneOverride.styleIntensity, 'strong');
    assert.strictEqual(withSceneOverride.isIntensityOverridden, true);
    assert.strictEqual(withSceneOverride.colorPalette, 'pastel');
    assert.strictEqual(withSceneOverride.isPaletteOverridden, true);
    assert.strictEqual(withSceneOverride.characterSafeArea, 'open_left');
    assert.strictEqual(withSceneOverride.isStagingOverridden, true);
  });

  // Test 4: Intelligent Scene Mood Inference
  await t.test('4. Intelligent Scene Mood Inference detects mood from scene text and dialogue', () => {
    assert.strictEqual(VisualStylesService.inferSceneMood('A magical enchanted portal glowing with fairy dust'), 'magical');
    assert.strictEqual(VisualStylesService.inferSceneMood('Careful, dark creepy shadows are hiding in the fog'), 'suspenseful');
    assert.strictEqual(VisualStylesService.inferSceneMood('Running across the mountains on an epic adventure to explore'), 'adventurous');
    assert.strictEqual(VisualStylesService.inferSceneMood('Tears streamed down, feeling alone and missing home'), 'emotional');
    assert.strictEqual(VisualStylesService.inferSceneMood('Laughing and smiling in the sunny playground together with friends'), 'happy');
    assert.strictEqual(VisualStylesService.inferSceneMood('A quiet calm stream under a peaceful twilight breeze'), 'peaceful');
    assert.strictEqual(VisualStylesService.inferSceneMood('An ancient secret cavern with a hidden puzzle lock'), 'mysterious');
    assert.strictEqual(VisualStylesService.inferSceneMood('A fierce lightning storm clashing over the peaks'), 'dramatic');
  });

  // Test 5: Character-Safe Staging Clearance Across Aspect Ratios
  await t.test('5. Character-Safe Staging guarantees open staging areas across aspect ratios', () => {
    const areas: CharacterSafeArea[] = [
      'open_center',
      'open_left',
      'open_right',
      'open_foreground',
      'open_background',
    ];

    for (const area of areas) {
      const instruction = VisualStylesService.getCharacterSafeAreaInstruction(area);
      assert.ok(instruction.length > 20);
      assert.ok(instruction.toLowerCase().includes('character-safe') || instruction.toLowerCase().includes('open'));
    }

    // DynamicPromptBuilder supports staging and ratios
    const res16_9 = DynamicPromptBuilderService.buildBackgroundPrompt({
      environmentType: 'Enchanted Forest Clearing',
      aspectRatio: '16:9',
      characterSafeArea: 'open_center',
    });
    assert.ok(res16_9.generatedPrompt.includes('16:9'));
    assert.ok(res16_9.generatedPrompt.toLowerCase().includes('open'));

    const res9_16 = DynamicPromptBuilderService.buildBackgroundPrompt({
      environmentType: 'Tall Mountain Spire',
      aspectRatio: '9:16',
      characterSafeArea: 'open_left',
    });
    assert.ok(res9_16.generatedPrompt.includes('9:16'));
    assert.ok(res9_16.generatedPrompt.toLowerCase().includes('left'));

    const res1_1 = DynamicPromptBuilderService.buildBackgroundPrompt({
      environmentType: 'Cozy Cottage Hearth',
      aspectRatio: '1:1',
      characterSafeArea: 'open_foreground',
    });
    assert.ok(res1_1.generatedPrompt.includes('1:1'));
  });

  // Test 6: Strict Environment-Only Validation
  await t.test('6. Strict Environment-Only Validation catches prohibited keywords and motion terms', () => {
    // Character presence should be rejected
    const badPrompt1 = 'A sunny meadow with two young boys walking along the path. Environment plate only.';
    const val1 = ScenePromptV2Service.validatePrompt(badPrompt1);
    assert.strictEqual(val1.isValid, false);
    assert.ok(val1.warnings.some((w) => w.includes('boy')));

    // Video motion keyword should be rejected
    const badPrompt2 = 'A sunny mountain valley, slowly pan right and zoom in on the waterfall. Environment plate only.';
    const val2 = ScenePromptV2Service.validatePrompt(badPrompt2);
    assert.strictEqual(val2.isValid, false);
    assert.ok(val2.warnings.some((w) => w.includes('pan') || w.includes('zoom')));

    // Clean scenic prompt should pass
    const goodPrompt = 'Storybook Illustration visual style. A peaceful sunlit meadow with wildflowers and a winding cobblestone path. Open central middleground space strictly reserved for separately animated characters. Environment plate only! No humans, characters, faces, text or watermarks. --ar 16:9';
    const val3 = ScenePromptV2Service.validatePrompt(goodPrompt);
    assert.strictEqual(val3.isValid, true);
    assert.strictEqual(val3.warnings.length, 0);
  });

  // Test 7: Multi-Provider Compatibility (Google Flow, Gemini, In-App Studio)
  await t.test('7. Multi-Provider Compatibility: Google Flow and In-App synthesizers inherit visual style', () => {
    // Google Flow generation prompt
    const flowResult = GenerationPromptService.buildSceneBackgroundPrompt(
      { visualStyle: 'Anime', aspectRatio: '16:9' },
      {
        sceneId: 'sc-1',
        title: 'Ghibli Style Meadows',
        location: 'Whispering Grassland',
        timeOfDay: 'Morning',
        lighting: 'Soft diffuse daylight',
        weather: 'Clear',
      }
    );
    assert.ok(flowResult.prompt.includes('Anime visual style'), 'Google Flow prompt must inherit visual style');
    assert.ok(flowResult.prompt.includes('STRICT INSTRUCTION: Environment only!'), 'Must include strict environment directive');
    assert.strictEqual(flowResult.aspectRatio, '16:9');
    assert.strictEqual(flowResult.width, 1024);
    assert.strictEqual(flowResult.height, 576);

    // In-App dynamic prompt builder
    const dynamicResult = DynamicPromptBuilderService.buildBackgroundPrompt({
      environmentType: 'Storybook Forest Path',
      styleId: '3d_animation',
      styleIntensity: 'strong',
      aspectRatio: '16:9',
      characterSafeArea: 'open_center',
    });
    assert.ok(dynamicResult.generatedPrompt.includes('3D Animation'), 'Must include 3D Animation');
    assert.ok(dynamicResult.negativePrompt.includes('people'), 'Negative prompt must forbid people');
  });
});
