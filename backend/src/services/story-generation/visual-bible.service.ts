import {
  StoryVisualBible,
  ArtDirection,
  WorldIdentity,
  LightingAndColorIdentity,
  CompositionRules,
  DEFAULT_EXCLUSION_RULES,
} from "./visual-bible.types.js";
import {
  getStoryByStoryId,
  getStoryVisualBible,
  updateStoryVisualBible,
  getScenesByStoryId,
} from "../database/database.service.js";
import { PromptSynthesizer } from "./parser/prompt-synthesizer.js";

export class VisualBibleService {
  /**
   * Pre-defined art direction profiles mapped from visual style keywords.
   */
  public static readonly STYLE_PROFILES: Record<string, Partial<ArtDirection>> =
    {
      "cinematic storybook": {
        style:
          "Cinematic 3D storybook animation, Pixar and Disney animated render style",
        renderingTechnique:
          "High-end 3D CGI rendering with soft subsurface scattering and tangible tactile textures",
        visualQuality:
          "8K masterpiece, ultra-detailed cinematic storybook plate",
        levelOfDetail: "high",
        colorPalette:
          "Rich natural greens, golden honey ambers, soft warm sky teals, vibrant floral accents",
        textures:
          "Carved oak wood grain, velvet moss, smooth river stones, brushed felt, warm clay",
        lightingStyle:
          "Volumetric warm golden-hour illumination with soft ambient fill and gentle rim highlights",
        depthAndPerspective:
          "Three-point perspective with soft cinematic depth of field and layered atmospheric haze",
        realismOrStylization:
          "Stylized modern 3D feature animation environment",
        overallTone:
          "Joyful, uplifting, magical, heartwarming, safe and inviting for children",
      },
      "3d pixar cartoon": {
        style:
          "3D Pixar animated film style, stylized children's animated feature environment",
        renderingTechnique:
          "Octane/Redshift 3D render with clean rounded bevels, tactile material definition",
        visualQuality: "Masterpiece quality 3D animated environment plate",
        levelOfDetail: "high",
        colorPalette:
          "Vibrant saturated primary and warm secondary colors, cheerful natural tones",
        textures:
          "Polished wood, soft rounded foliage, smooth cobblestones, tactile earth",
        lightingStyle:
          "Bright warm sunlight with cheerful soft blue sky bounce and clean shadow gradients",
        depthAndPerspective:
          "Clear foreground-middleground-background separation with gentle tilt-shift softness",
        realismOrStylization: "Stylized modern 3D animated feature",
        overallTone:
          "Playful, friendly, adventurous, energetic, and educational",
      },
      "whimsical watercolor": {
        style:
          "Whimsical children's storybook watercolor and soft ink illustration",
        renderingTechnique:
          "Delicate watercolor wash on cold-press textured paper with soft bleeding pigments",
        visualQuality: "Detailed hand-painted editorial storybook art",
        levelOfDetail: "medium",
        colorPalette:
          "Pastel meadow greens, gentle sky blues, blush peach, soft lemon yellow, lavender shadows",
        textures:
          "Visible cotton paper grain, watercolor pigment granulation, delicate ink outlines",
        lightingStyle:
          "Soft glowing ambient morning daylight with gentle luminous washes",
        depthAndPerspective:
          "Gentle painterly depth with soft atmospheric fading in the distant horizon",
        realismOrStylization: "Classic storybook hand-painted illustration",
        overallTone:
          "Calm, dreamy, poetic, nostalgic, soothing, and imaginative",
      },
      "vector flat art": {
        style: "Modern colourful vector children's book illustration",
        renderingTechnique:
          "Clean crisp vector art with gentle gradients, geometric curves, and paper-cutout depth",
        visualQuality: "Sharp vector editorial illustration",
        levelOfDetail: "medium",
        colorPalette:
          "Bold contemporary color block palette: emerald green, mustard yellow, coral, sky blue",
        textures:
          "Subtle risograph stipple texture, matte paper feel, clean silhouette edges",
        lightingStyle:
          "Stylized graphical lighting with soft directional gradients",
        depthAndPerspective:
          "Layered flat planes creating a charming storybook diorama depth",
        realismOrStylization: "Stylized 2D graphic design illustration",
        overallTone:
          "Modern, educational, bold, structured, and visually engaging",
      },
      "retro comic book": {
        style:
          "Vintage children's story comic illustration with subtle halftone texture",
        renderingTechnique:
          "Crisp black line-art with retro screen-print ink fills and subtle halftone dot pattern",
        visualQuality: "Classic illustrated storybook comic plate",
        levelOfDetail: "medium",
        colorPalette:
          "Warm retro print palette: golden ochre, dusty sage, faded cobalt, sunset orange",
        textures:
          "Vintage print paper grain, slight ink bleed, subtle dot shading",
        lightingStyle:
          "Graphic cel-shaded ambient daylight with warm golden rim light",
        depthAndPerspective:
          "Dynamic comic panel staging with clear framing layers",
        realismOrStylization: "Stylized retro cartoon storybook",
        overallTone: "Adventurous, spirited, curious, retro charm",
      },
    };

  /**
   * Resolves art direction for a given style string or keyword.
   */
  public static resolveArtDirection(styleInput?: string | null): ArtDirection {
    const raw = (styleInput || "").toLowerCase().trim();
    let matchedProfile =
      VisualBibleService.STYLE_PROFILES["cinematic storybook"];

    if (raw.includes("watercolor")) {
      matchedProfile =
        VisualBibleService.STYLE_PROFILES["whimsical watercolor"];
    } else if (
      raw.includes("pixar") ||
      raw.includes("3d") ||
      raw.includes("cgi")
    ) {
      matchedProfile = VisualBibleService.STYLE_PROFILES["3d pixar cartoon"];
    } else if (raw.includes("vector") || raw.includes("flat")) {
      matchedProfile = VisualBibleService.STYLE_PROFILES["vector flat art"];
    } else if (raw.includes("comic") || raw.includes("retro")) {
      matchedProfile = VisualBibleService.STYLE_PROFILES["retro comic book"];
    }

    const defaultProfile =
      VisualBibleService.STYLE_PROFILES["cinematic storybook"];

    return {
      style: matchedProfile.style || defaultProfile.style!,
      renderingTechnique:
        matchedProfile.renderingTechnique || defaultProfile.renderingTechnique!,
      visualQuality:
        matchedProfile.visualQuality || defaultProfile.visualQuality!,
      levelOfDetail:
        matchedProfile.levelOfDetail || defaultProfile.levelOfDetail!,
      colorPalette: matchedProfile.colorPalette || defaultProfile.colorPalette!,
      textures: matchedProfile.textures || defaultProfile.textures!,
      lightingStyle:
        matchedProfile.lightingStyle || defaultProfile.lightingStyle!,
      depthAndPerspective:
        matchedProfile.depthAndPerspective ||
        defaultProfile.depthAndPerspective!,
      realismOrStylization:
        matchedProfile.realismOrStylization ||
        defaultProfile.realismOrStylization!,
      overallTone: matchedProfile.overallTone || defaultProfile.overallTone!,
    };
  }

  /**
   * Generates a complete, initial Story Visual Bible for a story from its metadata and scenes.
   */
  public static generateInitialBible(options: {
    storyId: string;
    title: string;
    logline?: string;
    genre?: string | null;
    visualStyle?: string | null;
    ageGroup?: string | null;
    sceneTitlesAndLocations?: Array<{
      title: string;
      location?: string;
      narration?: string;
    }>;
  }): StoryVisualBible {
    const {
      storyId,
      title,
      logline = "",
      genre,
      visualStyle,
      sceneTitlesAndLocations = [],
    } = options;

    const artDirection = VisualBibleService.resolveArtDirection(visualStyle);

    // Extract recurring locations and landmarks
    const locationsFound = new Set<string>();
    for (const sc of sceneTitlesAndLocations) {
      if (sc.location) {
        const canonical = PromptSynthesizer.normalizeLocationName(sc.location);
        if (canonical) locationsFound.add(canonical);
      }
      if (sc.title) {
        const canonical = PromptSynthesizer.normalizeLocationName(sc.title);
        if (canonical && !canonical.toLowerCase().startsWith("scene")) {
          locationsFound.add(canonical);
        }
      }
    }

    const recurringLocationsList = Array.from(locationsFound);
    if (recurringLocationsList.length === 0) {
      recurringLocationsList.push(
        "Enchanted Meadow",
        "Forest Pathway",
        "Storybook Grove",
      );
    }

    const worldDesc =
      logline && logline.trim().length > 10
        ? `A magical storybook setting for "${title}": ${logline}`
        : `An enchanting, safe, and wondrous children's storybook world for "${title}"`;

    const worldIdentity: WorldIdentity = {
      worldDescription: worldDesc,
      geography:
        "Gentle rolling hills, winding nature pathways, sun-drenched clearings, and lush friendly canopies",
      recurringLocations: recurringLocationsList,
      recognizableLandmarks: [
        "Ancient Great Oak with winding root hollows",
        "Sparkling crystal pebble stream with wooden crossing bridge",
        "Sunlit flower knoll with panoramic valley views",
      ],
      architecture:
        "Charming storybook wooden cottages, soft stone bridges, cozy hand-crafted timber elements",
      terrainAndVegetation:
        "Soft mossy lawns, vibrant wildflower patches, friendly weeping willows, and ancient leafy trees",
      recurringObjects: [
        "Carved wooden trail signs",
        "Weathered stone mileposts",
        "Gentle stream stepping stones",
      ],
      environmentalDesignRules: [
        "Rounded child-friendly contours and welcoming organic shapes",
        "Gentle slopes and inviting pathways",
        "Zero sharp, menacing, industrial or frightening environmental elements",
        "Rich, lush vegetation with healthy vibrant foliage",
      ],
    };

    const lightingAndColor: LightingAndColorIdentity = {
      dominantColors: ["#2E7D32", "#FFA000", "#4FC3F7"], // Forest green, golden amber, sky cyan
      secondaryColors: ["#FFF9C4", "#D7CCC8", "#CE93D8"], // Buttercream, soft earth, lilac
      lightingQuality:
        "Warm, luminous, golden sunlight with gentle atmospheric diffusion",
      contrast: "medium",
      warmth: "warm",
      shadows:
        "Soft-edged translucent umber shadows, never harsh or pitch black",
      atmosphericDepth:
        "Gentle sunbeams, soft distant atmospheric blue haze, glowing particles in light shafts",
    };

    const compositionRules: CompositionRules = {
      defaultCameraPerspective: "Eye-level wide establishing shot",
      environmentDepth:
        "Layered 3D storybook staging: framing foliage foreground, open acting middleground, scenic horizon background",
      layers: {
        foreground:
          "Low framing wildflowers, gentle grass blades, or pathway entrance near the camera base",
        middleground:
          "Open clear central staging area reserved exclusively for separately animated vector characters",
        background:
          "Lush tree canopies, rolling gentle hills, and soft sky with drifting storybook clouds",
      },
      characterPlacementZones: ["center", "left", "right", "open"],
      clearingRules:
        "Keep middleground center zone (40% to 70% frame height) open and free of large obstructing objects",
      defaultAspectRatio: "16:9",
    };

    const now = new Date().toISOString();

    return {
      version: 1,
      storyId,
      storyTitle: title,
      artDirection,
      worldIdentity,
      lightingAndColor,
      compositionRules,
      exclusionRules: DEFAULT_EXCLUSION_RULES,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Retrieves an existing Story Visual Bible from database, or auto-generates and persists one.
   */
  public static async getOrInitializeVisualBible(
    storyId: string,
  ): Promise<StoryVisualBible> {
    const existing = await getStoryVisualBible(storyId);
    if (
      existing &&
      typeof existing === "object" &&
      (existing as any).artDirection
    ) {
      return existing as unknown as StoryVisualBible;
    }

    const story = await getStoryByStoryId(storyId);
    if (!story) {
      throw new Error(`Story not found for ID: ${storyId}`);
    }

    const scenes = await getScenesByStoryId(storyId);
    const sceneTitlesAndLocations = scenes.map((s) => ({
      title: s.title,
      location:
        (s.animationData as any)?.background?.cameraDirection ||
        s.cameraDirection ||
        undefined,
      narration: s.narration,
    }));

    const bible = VisualBibleService.generateInitialBible({
      storyId: story.storyId,
      title: story.title,
      logline: story.logline,
      genre: story.genre,
      visualStyle: story.visualStyle,
      ageGroup: story.ageGroup,
      sceneTitlesAndLocations,
    });

    await updateStoryVisualBible(storyId, bible);
    return bible;
  }

  /**
   * Updates an existing Story Visual Bible with user edits, increments version number, and persists.
   */
  public static async updateVisualBible(
    storyId: string,
    updates: Partial<StoryVisualBible>,
  ): Promise<StoryVisualBible> {
    const current =
      await VisualBibleService.getOrInitializeVisualBible(storyId);

    const merged: StoryVisualBible = {
      ...current,
      ...updates,
      artDirection: {
        ...current.artDirection,
        ...(updates.artDirection || {}),
      },
      worldIdentity: {
        ...current.worldIdentity,
        ...(updates.worldIdentity || {}),
      },
      lightingAndColor: {
        ...current.lightingAndColor,
        ...(updates.lightingAndColor || {}),
      },
      compositionRules: {
        ...current.compositionRules,
        ...(updates.compositionRules || {}),
      },
      exclusionRules: {
        ...current.exclusionRules,
        ...(updates.exclusionRules || {}),
      },
      version: (current.version || 1) + 1,
      updatedAt: new Date().toISOString(),
    };

    await updateStoryVisualBible(storyId, merged);
    return merged;
  }
}
