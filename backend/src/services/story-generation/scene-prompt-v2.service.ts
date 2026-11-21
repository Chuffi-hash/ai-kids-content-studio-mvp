import { randomUUID } from 'crypto';
import {
  StoryVisualBible,
  SceneVisualSpecification,
  PromptHistoryEntry,
  DEFAULT_EXCLUSION_RULES,
} from './visual-bible.types.js';
import { VisualBibleService } from './visual-bible.service.js';
import { LocationContinuityService } from './location-continuity.service.js';
import {
  getStoryByStoryId,
  getSceneBySceneId,
  getScenesByStoryId,
  updateScene,
  createSceneVersion,
} from '../database/database.service.js';
import { PromptSynthesizer } from './parser/prompt-synthesizer.js';
import { VisualStylesService } from '../visual-styles/visual-styles.service.js';
import {
  ProjectVisualSettings,
  SceneVisualOverrides,
  ResolvedVisualSettings,
  StyleIntensity,
  ColorPalettePreset,
  SceneMoodPreset,
  LightingPreset,
  BackgroundComplexity,
  CharacterSafeArea,
} from '../visual-styles/visual-styles.types.js';

export interface PromptCompositionOptions {
  aspectRatio?: string;
  cameraDirection?: string;
  visualStyle?: string;
  styleIntensity?: StyleIntensity;
  colorPalette?: ColorPalettePreset;
  customColorPalette?: string;
  mood?: SceneMoodPreset;
  customMood?: string;
  lighting?: LightingPreset;
  customLighting?: string;
  backgroundComplexity?: BackgroundComplexity;
  characterSafeArea?: CharacterSafeArea;
  customStagingArea?: string;
  customInstructions?: string;
  isManualEdit?: boolean;
}

export interface PromptValidationResult {
  isValid: boolean;
  warnings: string[];
  cleanPrompt: string;
}

export class ScenePromptV2Service {
  /**
   * Analyzes a scene using full story context and produces a structured SceneVisualSpecification.
   */
  public static async analyzeScene(options: {
    storyId: string;
    sceneId: string;
    visualBible?: StoryVisualBible;
    overrides?: Partial<SceneVisualSpecification>;
    visualOverrides?: Partial<SceneVisualOverrides>;
  }): Promise<SceneVisualSpecification> {
    const { storyId, sceneId, overrides } = options;

    const story = await getStoryByStoryId(storyId);
    if (!story) {
      throw new Error(`Story not found for ID: ${storyId}`);
    }

    const scene = await getSceneBySceneId(sceneId);
    if (!scene) {
      throw new Error(`Scene not found for ID: ${sceneId}`);
    }

    const allScenes = await getScenesByStoryId(storyId);
    const sceneIndex = allScenes.findIndex((s) => s.sceneId === sceneId || s.id === sceneId);
    const prevScene = sceneIndex > 0 ? allScenes[sceneIndex - 1] : undefined;
    const nextScene = sceneIndex < allScenes.length - 1 ? allScenes[sceneIndex + 1] : undefined;

    const visualBible = options.visualBible || (await VisualBibleService.getOrInitializeVisualBible(storyId));

    // 1. Resolve Location & Continuity
    const locationName =
      overrides?.locationName ||
      LocationContinuityService.extractLocationName(
        scene.title,
        scene.visualPrompt || undefined,
        scene.narration
      );

    const locationId = overrides?.locationId || LocationContinuityService.resolveLocationId(locationName);
    const locationAnchors = LocationContinuityService.inferLocationAnchors(locationName, visualBible);

    // 2. Project Visual Settings & Scene Overrides
    const projectSettings: Partial<ProjectVisualSettings> =
      visualBible.projectVisualSettings ||
      (story as any).visualBible?.projectVisualSettings || {
        visualStyle: (story.visualStyle as any) || 'storybook_illustration',
        styleIntensity: 'balanced',
        colorPalette: 'vibrant',
        defaultLighting: 'soft_daylight',
        backgroundComplexity: 'balanced',
        aspectRatio: '16:9',
      };

    const animBg = ((scene.animationData as any)?.background || {});
    const existingSceneOverrides: Partial<SceneVisualOverrides> = animBg.visualOverrides || {};
    const sceneOverrides: SceneVisualOverrides = {
      ...existingSceneOverrides,
      ...(options.visualOverrides || {}),
      ...(overrides?.visualOverrides || {}),
    };

    // 3. Resolve Dynamic Attributes (Time of Day, Weather, Lighting, Camera)
    const combinedSceneText = `${scene.title} ${scene.visualPrompt || ''} ${scene.narration} ${scene.cameraDirection || ''}`;
    const timeOfDay = overrides?.timeOfDay || LocationContinuityService.detectTimeOfDay(combinedSceneText);
    const weather = overrides?.weather || LocationContinuityService.detectWeather(combinedSceneText);
    const season = overrides?.season || 'SPRING';

    // Intelligent Mood Inference from Scene Context
    const inferredMood = VisualStylesService.inferSceneMood(combinedSceneText);

    const aspectRatio =
      overrides?.aspectRatio ||
      sceneOverrides.aspectRatio ||
      animBg.aspectRatio ||
      visualBible.compositionRules.defaultAspectRatio ||
      '16:9';

    // Resolve Effective Visual Settings (Strict Inheritance: Scene Override -> Project Setting -> Default)
    const resolvedVisualSettings = VisualStylesService.resolveEffectiveVisualSettings({
      projectSettings,
      sceneOverrides,
      inferredMood,
      aspectRatio,
    });

    const mood = overrides?.mood || resolvedVisualSettings.mood;
    const lighting = overrides?.lighting || (
      resolvedVisualSettings.isLightingOverridden
        ? VisualStylesService.getLightingInstruction(resolvedVisualSettings.lighting, resolvedVisualSettings.customLighting)
        : LocationContinuityService.resolveLighting(timeOfDay, weather)
    );

    const rawCamera = overrides?.cameraPerspective || scene.cameraDirection || animBg.cameraDirection || visualBible.compositionRules.defaultCameraPerspective;
    const cameraPerspective = LocationContinuityService.normalizeCameraPerspective(rawCamera);

    // 4. Determine Character Placement Zone & Staging Clearance
    let characterPlacementZone: 'center' | 'left' | 'right' | 'open' = 'center';
    if (resolvedVisualSettings.characterSafeArea === 'open_left') {
      characterPlacementZone = 'left';
    } else if (resolvedVisualSettings.characterSafeArea === 'open_right') {
      characterPlacementZone = 'right';
    } else if (resolvedVisualSettings.characterSafeArea === 'open_foreground' || resolvedVisualSettings.characterSafeArea === 'open_background') {
      characterPlacementZone = 'open';
    } else {
      const charInstances = (scene.animationData as any)?.characterInstances || [];
      if (charInstances.length === 1) {
        const x = charInstances[0].x ?? 640;
        if (x < 500) characterPlacementZone = 'left';
        else if (x > 780) characterPlacementZone = 'right';
        else characterPlacementZone = 'center';
      } else if (charInstances.length > 1) {
        characterPlacementZone = 'open';
      }
    }

    const clearingDescription = VisualStylesService.getCharacterSafeAreaInstruction(
      resolvedVisualSettings.characterSafeArea,
      resolvedVisualSettings.customStagingArea
    );

    // 5. Layering Composition
    const composition = {
      foreground: `Low framing natural elements, gentle flowering blades and pathway entrance near bottom edge`,
      middleground: `Open clear ground plane. ${clearingDescription}`,
      background: locationAnchors.horizonStructure,
      characterPlacementZone,
      clearingDescription,
    };

    // 6. Environmental Changes from previous scene
    const prevText = prevScene ? `${prevScene.title} ${prevScene.visualPrompt || ''} ${prevScene.narration}` : '';
    const prevTimeOfDay = prevScene ? LocationContinuityService.detectTimeOfDay(prevText) : undefined;
    const prevWeather = prevScene ? LocationContinuityService.detectWeather(prevText) : undefined;

    const environmentalChanges = LocationContinuityService.detectEnvironmentalChanges(
      { timeOfDay, weather, visualDescription: scene.visualPrompt || '' },
      prevScene ? { timeOfDay: prevTimeOfDay, weather: prevWeather } : undefined
    );

    // 7. Continuity Instructions
    const continuityInstructions: string[] = [
      `Maintain exact spatial arrangement of ${locationName}`,
      `Permanent landmarks must match: ${locationAnchors.keyLandmarks.join(' and ')}`,
      `Color harmony: ${VisualStylesService.getColorPaletteInstruction(resolvedVisualSettings.colorPalette, resolvedVisualSettings.customColorPalette)}`,
    ];

    // 8. Clean visual description (without characters)
    let cleanVisualDesc = scene.visualPrompt || '';
    cleanVisualDesc = cleanVisualDesc
      .replace(/\b(pip|maya|aarav|bear|robot|earth|terra|children|child|boy|girl)\b[^,.;:]*/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanVisualDesc || cleanVisualDesc.length < 5) {
      cleanVisualDesc = `${locationName} under ${timeOfDay.toLowerCase()} light with ${weather.toLowerCase()} skies`;
    }

    const spec: SceneVisualSpecification = {
      storyId,
      sceneId,
      sceneNumber: scene.number || (sceneIndex + 1),
      sceneTitle: scene.title,
      sceneSummary: scene.narration.slice(0, 120),
      visualDescription: cleanVisualDesc,
      locationId,
      locationName,
      locationIdentity: locationAnchors.canonicalDesc,
      permanentAnchors: locationAnchors.features,
      timeOfDay,
      weather,
      season,
      mood,
      lighting,
      cameraPerspective,
      composition,
      environmentalObjects: locationAnchors.keyLandmarks,
      environmentalChanges,
      exclusionRules: DEFAULT_EXCLUSION_RULES.prohibitedElements,
      aspectRatio,
      continuityInstructions,
      resolvedVisualSettings,
      visualOverrides: sceneOverrides,
      ...(overrides || {}),
    };

    return spec;
  }

  /**
   * Composes a production-ready, character-free background image prompt
   * using the 15-section structured generation pipeline.
   */
  public static composePrompt(
    spec: SceneVisualSpecification,
    visualBible: StoryVisualBible,
    options?: PromptCompositionOptions
  ): string {
    const aspect = options?.aspectRatio || spec.aspectRatio || '16:9';
    const camera = options?.cameraDirection
      ? LocationContinuityService.normalizeCameraPerspective(options.cameraDirection)
      : spec.cameraPerspective;

    const aspectClause = PromptSynthesizer.formatAspectRatio(aspect);

    // Merge any ad-hoc composition options into resolved settings
    const baseResolved = spec.resolvedVisualSettings || VisualStylesService.resolveEffectiveVisualSettings({
      projectSettings: visualBible.projectVisualSettings,
      sceneOverrides: spec.visualOverrides,
      aspectRatio: aspect,
    });

    const overridesFromOptions: Partial<SceneVisualOverrides> = {};
    if (options?.visualStyle) overridesFromOptions.visualStyle = options.visualStyle as any;
    if (options?.styleIntensity) overridesFromOptions.styleIntensity = options.styleIntensity;
    if (options?.colorPalette) overridesFromOptions.colorPalette = options.colorPalette;
    if (options?.customColorPalette) overridesFromOptions.customColorPalette = options.customColorPalette;
    if (options?.mood) overridesFromOptions.mood = options.mood;
    if (options?.customMood) overridesFromOptions.customMood = options.customMood;
    if (options?.lighting) overridesFromOptions.lighting = options.lighting;
    if (options?.customLighting) overridesFromOptions.customLighting = options.customLighting;
    if (options?.backgroundComplexity) overridesFromOptions.backgroundComplexity = options.backgroundComplexity;
    if (options?.characterSafeArea) overridesFromOptions.characterSafeArea = options.characterSafeArea;
    if (options?.customStagingArea) overridesFromOptions.customStagingArea = options.customStagingArea;
    if (options?.customInstructions) overridesFromOptions.customInstructions = options.customInstructions;

    const resolved = (Object.keys(overridesFromOptions).length > 0)
      ? VisualStylesService.resolveEffectiveVisualSettings({
          projectSettings: visualBible.projectVisualSettings,
          sceneOverrides: {
            ...spec.visualOverrides,
            ...overridesFromOptions,
          },
          inferredMood: baseResolved.mood,
          aspectRatio: aspect,
        })
      : baseResolved;

    const parts: string[] = [];

    // SECTION 1: Project Visual Style
    parts.push(`${resolved.visualStyle.name} visual style. ${resolved.visualStyle.rendering}. ${resolved.visualStyle.texture}.`);

    // SECTION 2: Style Intensity
    parts.push(`${VisualStylesService.getIntensityInstruction(resolved.visualStyle, resolved.styleIntensity)}.`);

    // SECTION 3: Scene Context
    parts.push(`Storybook environment setting for "${spec.sceneTitle}".`);
    if (spec.visualDescription && spec.visualDescription.length > 5) {
      parts.push(`${spec.visualDescription}.`);
    }

    // SECTION 4: Environment & Location
    parts.push(`Environment setting: ${spec.locationName}.`);
    if (spec.locationIdentity) {
      parts.push(`${spec.locationIdentity}.`);
    }
    if (spec.permanentAnchors && spec.permanentAnchors.length > 0) {
      parts.push(`Permanent landscape features: ${spec.permanentAnchors.join(', ')}.`);
    }

    // SECTION 5: Dynamic Time of Day, Weather & Season
    const todLabel = spec.timeOfDay.toLowerCase().replace('_', ' ');
    const weatherLabel = spec.weather.toLowerCase();
    parts.push(`Atmosphere: ${todLabel} with ${weatherLabel} weather.`);

    // SECTION 6: Mood & Emotional Tone
    parts.push(`${VisualStylesService.getMoodInstruction(resolved.mood, resolved.customMood)}.`);

    // SECTION 7: Lighting
    const lightingInstruction = resolved.isLightingOverridden
      ? VisualStylesService.getLightingInstruction(resolved.lighting, resolved.customLighting)
      : spec.lighting;
    parts.push(`${lightingInstruction}.`);

    // SECTION 8: Color Palette
    parts.push(`${VisualStylesService.getColorPaletteInstruction(resolved.colorPalette, resolved.customColorPalette)}.`);

    // SECTION 9: Camera Perspective & Framing
    parts.push(`${camera}.`);
    parts.push(`${aspectClause}.`);

    // SECTION 10: Layered Composition
    parts.push(`Foreground: ${spec.composition.foreground}.`);
    parts.push(`Background horizon: ${spec.composition.background}.`);

    // SECTION 11: Character-Safe Staging
    const stagingInstruction = VisualStylesService.getCharacterSafeAreaInstruction(
      resolved.characterSafeArea,
      resolved.customStagingArea
    );
    parts.push(`${stagingInstruction}`);
    parts.push(`Open foreground and middleground space strictly reserved for separately animated 2D vector characters.`);

    // SECTION 12: Environment Details & Complexity
    parts.push(`${VisualStylesService.getComplexityInstruction(resolved.backgroundComplexity)}`);
    if (spec.environmentalObjects && spec.environmentalObjects.length > 0) {
      parts.push(`Key landmarks: ${spec.environmentalObjects.join(', ')}.`);
    }

    // SECTION 13: Continuity Instructions
    if (spec.continuityInstructions && spec.continuityInstructions.length > 0) {
      parts.push(`${spec.continuityInstructions.join('. ')}.`);
    }
    if (spec.environmentalChanges && spec.environmentalChanges.length > 0 && !spec.environmentalChanges[0].includes('Continuous')) {
      parts.push(`${spec.environmentalChanges.join('. ')}.`);
    }
    if (resolved.customInstructions) {
      parts.push(`${resolved.customInstructions}.`);
    }

    // SECTION 14: Output Format & Aspect Ratio
    parts.push(`Format: Single environment-only background plate in ${aspect} aspect ratio.`);
    parts.push(`--ar ${aspect}`);

    // SECTION 15: Strict Environment-Only Negative Constraints
    parts.push(`Environment plate only! Empty scenic background plate.`);
    parts.push(visualBible.exclusionRules?.negativePrompt || DEFAULT_EXCLUSION_RULES.negativePrompt);

    // Join and format clean sentence casing
    let prompt = parts.join(' ').replace(/\s+/g, ' ').replace(/\.{2,}/g, '.').trim();

    return prompt;
  }

  /**
   * Validates a composed or user-edited prompt to ensure environment-only compliance.
   */
  public static validatePrompt(prompt: string): PromptValidationResult {
    const warnings: string[] = [];
    if (!prompt || prompt.trim().length === 0) {
      return {
        isValid: false,
        warnings: ['Prompt is empty'],
        cleanPrompt: '',
      };
    }

    let clean = prompt.trim();
    const lower = clean.toLowerCase();

    // Isolate the positive scenic description from negative exclusions and clearance directives
    const positivePart = clean
      .replace(/Environment plate only[\s\S]*/i, '')
      .replace(/Open [\s\S]*?strictly reserved[\s\S]*/i, '')
      .replace(/(?:Character-safe staging|Composition staging):[\s\S]*?(?=\.|$)/gi, '')
      .replace(/\b(?:children's|child's)\b/gi, '')
      .toLowerCase();

    // Check for character presence in the scenic description
    const characterWords = ['boy', 'boys', 'girl', 'girls', 'child', 'children', 'person', 'people', 'human', 'humans', 'character', 'characters', 'robot', 'robots', 'bear', 'bears', 'animal', 'animals', 'crowd'];
    for (const w of characterWords) {
      const regex = new RegExp(`\\b${w}\\b`, 'i');
      if (regex.test(positivePart)) {
        warnings.push(`Detected potential character keyword "${w}". Background must be environment-only.`);
      }
    }

    // Check for video camera movement instructions (pan, zoom, tilt)
    if (/\b(zoom in|zoom out|pan left|pan right|tilt up|tilt down)\b/i.test(clean)) {
      warnings.push('Detected video motion keyword (e.g. pan/zoom). Video movement belongs to video assembly, not still image generation.');
    }

    // Ensure environment-only negative instruction exists
    if (!lower.includes('environment only') && !lower.includes('backdrop only')) {
      clean += ' Environment only. No characters, people, text or logos.';
    }

    // Ensure open foreground note exists
    if (!lower.includes('open') && !lower.includes('foreground')) {
      clean += ' Keep the central middleground clear for characters.';
    }

    return {
      isValid: warnings.length === 0,
      warnings,
      cleanPrompt: clean,
    };
  }

  /**
   * Saves or updates a prompt version for a scene.
   */
  public static async savePromptVersion(options: {
    sceneId: string;
    prompt: string;
    cameraPerspective?: string;
    aspectRatio?: string;
    locationId?: string;
    isManualEdit?: boolean;
    source?: string;
    specification?: SceneVisualSpecification;
  }): Promise<{ promptEntry: PromptHistoryEntry; totalVersions: number }> {
    const {
      sceneId,
      prompt,
      cameraPerspective = 'Eye-level wide establishing shot',
      aspectRatio = '16:9',
      locationId,
      isManualEdit = false,
      source = 'google_flow_manual',
      specification,
    } = options;

    const scene = await getSceneBySceneId(sceneId);
    if (!scene) {
      throw new Error(`Scene not found for ID: ${sceneId}`);
    }

    const currentAnim = ((scene.animationData || {}) as any);
    const currentBg = currentAnim.background || {};
    const existingHistory: PromptHistoryEntry[] = Array.isArray(currentBg.promptHistory)
      ? currentBg.promptHistory
      : [];

    const nextVersion = existingHistory.length + 1;
    const newEntry: PromptHistoryEntry = {
      id: randomUUID(),
      version: nextVersion,
      prompt,
      cameraPerspective,
      aspectRatio,
      locationId: locationId || currentBg.locationId,
      isManualEdit,
      source,
      createdAt: new Date().toISOString(),
      specification,
    };

    const updatedHistory = [newEntry, ...existingHistory].slice(0, 20); // Keep last 20 revisions

    const updatedAnimData = {
      ...currentAnim,
      background: {
        ...currentBg,
        prompt,
        cameraDirection: cameraPerspective,
        aspectRatio,
        locationId: locationId || currentBg.locationId,
        promptVersion: nextVersion,
        visualSpecification: specification || currentBg.visualSpecification,
        promptHistory: updatedHistory,
      },
    };

    await updateScene(sceneId, {
      visualPrompt: prompt,
      cameraDirection: cameraPerspective,
      animationData: updatedAnimData,
    });

    // Also persist to SceneVersion table for historical audit
    try {
      await createSceneVersion({
        id: randomUUID(),
        sceneId,
        versionNumber: nextVersion,
        prompt,
        cameraDirection: cameraPerspective,
        imageUrl: currentBg.imageUrl || scene.imageUrl,
        videoUrl: scene.videoUrl,
        audioUrl: scene.audioUrl,
        narration: scene.narration,
        durationMs: scene.estimatedDurationMs || 0,
      });
    } catch (err) {
      console.warn(`[ScenePromptV2] Could not write SceneVersion table:`, err);
    }

    return {
      promptEntry: newEntry,
      totalVersions: updatedHistory.length,
    };
  }

  /**
   * Retrieves prompt history for a scene.
   */
  public static async getPromptHistory(sceneId: string): Promise<PromptHistoryEntry[]> {
    const scene = await getSceneBySceneId(sceneId);
    if (!scene) return [];

    const currentAnim = (scene.animationData || {}) as any;
    const history = currentAnim.background?.promptHistory;
    if (Array.isArray(history) && history.length > 0) {
      return history;
    }

    // If no history array yet, create initial entry from current visualPrompt
    if (scene.visualPrompt) {
      return [
        {
          id: 'initial',
          version: 1,
          prompt: scene.visualPrompt,
          cameraPerspective: scene.cameraDirection || 'Eye-level wide establishing shot',
          aspectRatio: currentAnim.background?.aspectRatio || '16:9',
          isManualEdit: false,
          source: currentAnim.background?.source || 'ai_generated',
          createdAt: scene.createdAt.toISOString(),
        },
      ];
    }

    return [];
  }

  /**
   * Restores a specific prompt version from history.
   */
  public static async restorePromptVersion(
    sceneId: string,
    versionId: string
  ): Promise<PromptHistoryEntry> {
    const history = await ScenePromptV2Service.getPromptHistory(sceneId);
    const target = history.find((h) => h.id === versionId || String(h.version) === versionId);

    if (!target) {
      throw new Error(`Prompt version "${versionId}" not found in history for scene ${sceneId}`);
    }

    await ScenePromptV2Service.savePromptVersion({
      sceneId,
      prompt: target.prompt,
      cameraPerspective: target.cameraPerspective,
      aspectRatio: target.aspectRatio,
      locationId: target.locationId,
      isManualEdit: true,
      source: 'restored_from_history',
      specification: target.specification,
    });

    return target;
  }
}
