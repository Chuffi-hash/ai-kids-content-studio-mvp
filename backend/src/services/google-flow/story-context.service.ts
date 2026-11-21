import { prisma } from '../database/database.service.js';
import { isReservedMetadataKey, cleanSpeakerName } from '../story-generation/story-importer.service.js';

export interface BackgroundVersionContext {
  id: string;
  sceneId: string;
  version: number;
  provider: string;
  model?: string | null;
  prompt?: string | null;
  parentVersionId?: string | null;
  localImageId?: string | null;
  storageKey?: string | null;
  imageUrl?: string | null;
  width?: number | null;
  height?: number | null;
  aspectRatio?: string | null;
  status: string;
  createdAt: string | Date;
  googleFlowProjectId: string | null;
  googleFlowEditId: string | null;
  googleFlowEditUrl: string | null;
  googleFlowImageId: string | null;
  googleFlowImageRef: string | null;
  googleFlowImageSourceUrl: string | null;
  googleFlowParentAssetId: string | null;
  googleFlowPrompt: string | null;
  googleFlowVersion: number | null;
  providerMetadata: Record<string, any>;
  [key: string]: any;
}

export type GoogleFlowBackgroundVersionContext = BackgroundVersionContext;

export function serializeBackgroundVersion(version: any): BackgroundVersionContext {
  const providerMetadata =
    version?.providerMetadata && typeof version.providerMetadata === "object"
      ? version.providerMetadata as Record<string, any>
      : {};
  const isGoogleFlow = String(version?.provider || "").toLowerCase() === "google_flow";
  const googleFlowEditId = isGoogleFlow
    ? providerMetadata.googleFlowEditId || null
    : null;
  const googleFlowImageId = isGoogleFlow
    ? providerMetadata.googleFlowImageId || googleFlowEditId || null
    : null;

  return {
    ...version,
    googleFlowProjectId: isGoogleFlow ? providerMetadata.googleFlowProjectId || null : null,
    googleFlowEditId,
    googleFlowEditUrl: isGoogleFlow ? providerMetadata.googleFlowEditUrl || null : null,
    googleFlowImageId,
    googleFlowImageRef: isGoogleFlow ? providerMetadata.googleFlowImageRef || null : null,
    googleFlowImageSourceUrl: isGoogleFlow
      ? providerMetadata.googleFlowImageSourceUrl || providerMetadata.googleFlowImageRef || null
      : null,
    googleFlowParentAssetId: isGoogleFlow
      ? providerMetadata.googleFlowParentAssetId || null
      : null,
    googleFlowPrompt: isGoogleFlow
      ? providerMetadata.googleFlowPrompt || version?.prompt || null
      : null,
    googleFlowVersion: isGoogleFlow
      ? Number(providerMetadata.googleFlowVersion || version?.version || 0) || null
      : null,
    // Keep the original flexible JSON metadata while normalizing imageId.
    providerMetadata: isGoogleFlow
      ? {
          ...providerMetadata,
          googleFlowImageId,
        }
      : providerMetadata,
  };
}

export interface SceneContextItem {
  sceneId: string;
  id: string;
  number: number;
  order: number;
  title: string;
  narration: string;
  visualPrompt: string;
  cameraDirection: string;
  aspectRatio: string;
  hasBackground: boolean;
  backgroundUrl: string | null;
  backgroundImageId: string | null;
  googleFlowProjectId?: string | null;
  googleFlowEditId?: string | null;
  googleFlowEditUrl?: string | null;
  googleFlowPrompt?: string | null;
  googleFlowVersion?: number | null;
  googleFlowParentAssetId?: string | null;
  googleFlowImageId?: string | null;
  googleFlowImageRef?: string | null;
  googleFlowImageSourceUrl?: string | null;
  googleFlowVersions?: GoogleFlowBackgroundVersionContext[];
  activeBackgroundVersion?: number | null;
  totalBackgroundVersions?: number;
  backgroundVersions?: BackgroundVersionContext[];
  provider?: string | null;
  model?: string | null;
  location: string;
  timeOfDay: string;
  lighting: string;
  weather: string;
  environmentDescription: string;
  characterIds: string[];
  charactersInScene: Array<{ id: string; name: string; species?: string }>;
  animationData: Record<string, any> | null;
}

export interface CharacterContextItem {
  id: string;
  name: string;
  species: string;
  personality: string;
  visualDescription: string;
  clothing: string;
  distinctiveFeatures: string;
  canonicalAppearance: Record<string, any> | null;
  referenceImageUrl: string | null;
  referenceImagePrompt: string | null;
  hasMasterReference: boolean;
  scenesAppearedIn: Array<{ sceneId: string; number: number; title: string }>;
  scenesCount: number;
  flowMapping?: {
    flowCharacterName: string;
    flowProjectId: string;
    syncStatus: string;
    lastSyncedAt: string | null;
  } | null;
}

export interface StoryFlowContext {
  story: {
    id: string;
    storyId: string;
    title: string;
    logline: string;
    lesson: string;
    genre: string;
    targetAudience: string;
    visualStyle: string;
    aspectRatio: string;
    flowProjectId: string | null;
    productionStage: string;
    visualBible: Record<string, any> | null;
  };
  scenes: SceneContextItem[];
  characters: CharacterContextItem[];
  summary: {
    totalScenes: number;
    scenesWithBackground: number;
    missingBackgroundCount: number;
    missingBackgroundSceneIds: string[];
    totalCharacters: number;
    charactersWithMasterReference: number;
    missingReferenceCount: number;
    missingReferenceCharacterIds: string[];
  };
}

export class StoryContextService {
  /**
   * Resolves canonical story, all scenes, and all associated characters from PostgreSQL.
   */
  public static async resolveStoryContext(
    storyId: string,
    options?: { sceneId?: string; characterId?: string }
  ): Promise<StoryFlowContext> {
    if (!storyId || typeof storyId !== 'string') {
      throw new Error('storyId is required to resolve story context');
    }

    // 1. Fetch Story with associated StoryCharacters and Scenes
    const story = await prisma.story.findFirst({
      where: {
        OR: [{ storyId }, { id: storyId }],
      },
      include: {
        storyCharacters: {
          include: {
            character: true,
          },
        },
        scenes: {
          where: {
            deletedAt: null,
          },
          orderBy: [{ number: 'asc' }, { order: 'asc' }],
          include: {
            images: {
              where: { status: 'completed' },
              orderBy: { createdAt: 'desc' },
            },
            backgroundVersions: {
              orderBy: { version: 'asc' },
            },
          },
        },
      },
    });

    if (!story) {
      throw new Error(`Story not found: ${storyId}`);
    }

    // 2. Resolve Visual Bible & Global Aspect Ratio
    const visualBible = (story.visualBible || {}) as Record<string, any>;
    const defaultAspectRatio = visualBible.aspectRatio || '16:9';
    const visualStyle = story.visualStyle || visualBible.artStyle || 'storybook_illustrated';

    // 3. Map Characters & Story Flow Character Mappings
    const charactersMap = new Map<string, CharacterContextItem>();
    const mappings = await prisma.flowCharacterMapping.findMany({
      where: { storyId: story.storyId },
    });
    const mappingsMap = new Map(mappings.map((m) => [m.characterId, m]));

    for (const sc of story.storyCharacters) {
      const char = sc.character;
      if (!char || !char.name || isReservedMetadataKey(char.name)) continue;

      const cleanName = cleanSpeakerName(char.name) || char.name.replace(/^[-–—•*_#\s]+|[-–—•*_#:\s]+$/g, '').trim();
      if (!cleanName || isReservedMetadataKey(cleanName)) continue;

      const visualDesc = char.visualDescription || '';
      const clothing = char.distinctiveFeatures || '';
      const mapping = mappingsMap.get(char.id);

      charactersMap.set(char.id, {
        id: char.id,
        name: cleanName,
        species: char.species || 'Unknown',
        personality: char.personality || 'Friendly',
        visualDescription: visualDesc,
        clothing,
        distinctiveFeatures: char.distinctiveFeatures || '',
        canonicalAppearance: (char.canonicalAppearance || null) as Record<string, any> | null,
        referenceImageUrl: char.referenceImageUrl || null,
        referenceImagePrompt: char.referenceImagePrompt || null,
        hasMasterReference: Boolean(char.referenceImageUrl && char.referenceImageUrl.trim().length > 0),
        scenesAppearedIn: [],
        scenesCount: 0,
        flowMapping: mapping
          ? {
              flowCharacterName: mapping.flowCharacterName,
              flowProjectId: mapping.flowProjectId,
              syncStatus: mapping.syncStatus,
              lastSyncedAt: mapping.lastSyncedAt ? mapping.lastSyncedAt.toISOString() : null,
            }
          : null,
      });
    }

    // 4. Map Scenes & build Scene-Character relationship
    const sceneItems: SceneContextItem[] = [];

    for (const scene of story.scenes) {
      const animData = (scene.animationData || {}) as Record<string, any>;
      const bgData = animData.background || {};
      const isBgExplicitlyRemoved = Boolean(bgData.removed);

      // Build a normalized, provider-independent version array. Flow's
      // providerMetadata is flattened onto each item so the editor and image
      // generators can select a version without knowing the JSON nesting.
      const backgroundVersions = (scene.backgroundVersions || []).map(
        (version: any) => serializeBackgroundVersion(version),
      );
      const requestedActiveVersion =
        scene.activeBackgroundVersion ?? bgData.activeVersion ?? null;
      const activeVersionRecord =
        backgroundVersions.find((version) => version.version === requestedActiveVersion) ||
        backgroundVersions[backgroundVersions.length - 1] ||
        null;

      // Prefer the local Image row linked to the active version. This is
      // important after the user restores an older background version.
      const completedImage =
        (activeVersionRecord?.localImageId
          ? (scene.images || []).find((image: any) => image.id === activeVersionRecord.localImageId)
          : null) ||
        (scene.images && scene.images.length > 0 ? scene.images[0] : null);

      const activeVersionFlow = activeVersionRecord || {};
      const activeProviderMetadata =
        activeVersionFlow.providerMetadata && typeof activeVersionFlow.providerMetadata === "object"
          ? activeVersionFlow.providerMetadata
          : {};

      // Determine the selected background URL and verified asset readiness.
      let backgroundUrl: string | null = null;
      let backgroundImageId: string | null = null;
      let hasBackground = false;

      if (!isBgExplicitlyRemoved && scene.generationStatus !== 'failed' && bgData.status !== 'failed') {
        if (activeVersionRecord?.status === "completed" && activeVersionRecord.imageUrl) {
          backgroundUrl = activeVersionRecord.imageUrl;
          backgroundImageId = activeVersionRecord.localImageId || null;
          hasBackground = true;
        } else if (completedImage && completedImage.status === 'completed' && completedImage.imageUrl) {
          backgroundUrl = completedImage.imageUrl;
          backgroundImageId = completedImage.id;
          hasBackground = true;
        } else if (scene.imageUrl && scene.imageUrl.trim().length > 0) {
          backgroundUrl = scene.imageUrl.trim();
          hasBackground = true;
        } else if (bgData.imageUrl && bgData.imageUrl.trim().length > 0) {
          backgroundUrl = bgData.imageUrl.trim();
          backgroundImageId = bgData.imageId || null;
          hasBackground = true;
        }
      }

      // Parse scene character IDs
      const rawCharIds = scene.characterIds || '';
      let sceneCharIds: string[] = [];
      try {
        if (rawCharIds.startsWith('[') && rawCharIds.endsWith(']')) {
          sceneCharIds = JSON.parse(rawCharIds);
        } else if (rawCharIds.trim().length > 0) {
          sceneCharIds = rawCharIds.split(',').map((s) => s.trim()).filter(Boolean);
        }
      } catch {
        sceneCharIds = rawCharIds.split(',').map((s) => s.trim()).filter(Boolean);
      }

      // Check animationData for character instances as well
      if (Array.isArray(animData.characterInstances)) {
        for (const inst of animData.characterInstances) {
          if (inst.characterId && !sceneCharIds.includes(inst.characterId)) {
            const rawName = inst.name || '';
            const cleaned = cleanSpeakerName(rawName) || rawName.replace(/^[-–—•*_#\s]+|[-–—•*_#:\s]+$/g, '').trim();
            if (!cleaned || isReservedMetadataKey(rawName) || isReservedMetadataKey(cleaned)) {
              continue;
            }
            sceneCharIds.push(inst.characterId);
          }
        }
      }

      // Build characters in scene info and record character appearances
      const charactersInScene: Array<{ id: string; name: string; species?: string }> = [];

      for (const cId of sceneCharIds) {
        let charContext = charactersMap.get(cId);

        // If character wasn't in StoryCharacter table, try to find by ID
        if (!charContext) {
          try {
            const extraChar = await prisma.character.findUnique({ where: { id: cId } });
            if (extraChar && !isReservedMetadataKey(extraChar.name)) {
              const cleanExtraName = cleanSpeakerName(extraChar.name) || extraChar.name.replace(/^[-–—•*_#\s]+|[-–—•*_#:\s]+$/g, '').trim();
              if (cleanExtraName && !isReservedMetadataKey(cleanExtraName)) {
                charContext = {
                  id: extraChar.id,
                  name: cleanExtraName,
                species: extraChar.species || 'Unknown',
                personality: extraChar.personality || 'Friendly',
                visualDescription: extraChar.visualDescription || '',
                clothing: extraChar.distinctiveFeatures || '',
                distinctiveFeatures: extraChar.distinctiveFeatures || '',
                canonicalAppearance: (extraChar.canonicalAppearance || null) as Record<string, any> | null,
                referenceImageUrl: extraChar.referenceImageUrl || null,
                referenceImagePrompt: extraChar.referenceImagePrompt || null,
                hasMasterReference: Boolean(extraChar.referenceImageUrl && extraChar.referenceImageUrl.trim().length > 0),
                scenesAppearedIn: [],
                scenesCount: 0,
              };
              charactersMap.set(extraChar.id, charContext);
              }
            }
          } catch {
            // ignore
          }
        }

        if (charContext) {
          charactersInScene.push({
            id: charContext.id,
            name: charContext.name,
            species: charContext.species,
          });

          // Add appearance if not already present
          if (!charContext.scenesAppearedIn.some((s) => s.sceneId === scene.sceneId)) {
            charContext.scenesAppearedIn.push({
              sceneId: scene.sceneId,
              number: scene.number,
              title: scene.title || `Scene ${scene.number}`,
            });
            charContext.scenesCount = charContext.scenesAppearedIn.length;
          }
        }
      }

      // Extract environmental cues from visual prompt or narration
      const promptText = scene.visualPrompt || scene.narration || '';
      const cleanNarration = stripMarkdownProductionLabels(scene.narration || '');
      const cleanPrompt = stripMarkdownProductionLabels(scene.visualPrompt || scene.narration || '');
      const location = extractLocation(promptText, scene.title);
      const timeOfDay = extractTimeOfDay(promptText);
      const lighting = extractLighting(promptText, timeOfDay);
      const weather = extractWeather(promptText);

      sceneItems.push({
        sceneId: scene.sceneId,
        id: scene.id,
        number: scene.number,
        order: scene.order,
        title: scene.title || `Scene ${scene.number}`,
        narration: cleanNarration,
        visualPrompt: cleanPrompt,
        cameraDirection: scene.cameraDirection || bgData.cameraDirection || 'Eye-level wide shot',
        aspectRatio: bgData.aspectRatio || defaultAspectRatio,
        hasBackground,
        backgroundUrl,
        backgroundImageId,
        googleFlowProjectId:
          activeVersionFlow.googleFlowProjectId ||
          (completedImage as any)?.googleFlowProjectId ||
          bgData.googleFlowProjectId ||
          null,
        googleFlowEditId:
          activeVersionFlow.googleFlowEditId ||
          (completedImage as any)?.googleFlowEditId ||
          bgData.googleFlowEditId ||
          null,
        googleFlowEditUrl:
          activeVersionFlow.googleFlowEditUrl ||
          (completedImage as any)?.googleFlowEditUrl ||
          bgData.googleFlowEditUrl ||
          null,
        googleFlowPrompt:
          activeVersionFlow.googleFlowPrompt ||
          (completedImage as any)?.googleFlowPrompt ||
          bgData.googleFlowPrompt ||
          null,
        googleFlowVersion:
          activeVersionFlow.googleFlowVersion ??
          (completedImage as any)?.googleFlowVersion ??
          bgData.googleFlowVersion ??
          activeVersionRecord?.version ??
          null,
        googleFlowParentAssetId:
          activeVersionFlow.googleFlowParentAssetId ||
          (completedImage as any)?.googleFlowParentAssetId ||
          bgData.googleFlowParentAssetId ||
          null,
        // Flow edit URL /edit/{id} is the fallback stable media identifier
        // when Google Flow does not expose a separate DOM data-image-id.
        googleFlowImageId:
          activeVersionFlow.googleFlowImageId ||
          activeVersionFlow.googleFlowEditId ||
          (completedImage as any)?.googleFlowImageId ||
          (completedImage as any)?.googleFlowEditId ||
          bgData.googleFlowImageId ||
          bgData.googleFlowEditId ||
          null,
        googleFlowImageRef:
          activeVersionFlow.googleFlowImageRef ||
          (completedImage as any)?.googleFlowImageRef ||
          bgData.googleFlowImageRef ||
          null,
        googleFlowImageSourceUrl:
          activeVersionFlow.googleFlowImageSourceUrl ||
          activeProviderMetadata.googleFlowImageSourceUrl ||
          (completedImage as any)?.googleFlowImageSourceUrl ||
          bgData.googleFlowImageSourceUrl ||
          null,
        googleFlowVersions: backgroundVersions.filter(
          (version) => version.provider === "google_flow",
        ),
        activeBackgroundVersion:
          requestedActiveVersion ??
          activeVersionRecord?.version ??
          (completedImage as any)?.googleFlowVersion ??
          1,
        totalBackgroundVersions: backgroundVersions.length || (scene.images?.length || 0),
        backgroundVersions,
        provider: activeVersionRecord?.provider || bgData.provider || (completedImage as any)?.provider || null,
        model: activeVersionRecord?.model || bgData.model || (completedImage as any)?.model || null,
        location,
        timeOfDay,
        lighting,
        weather,
        environmentDescription: cleanPrompt || promptText,
        characterIds: sceneCharIds,
        charactersInScene,
        animationData: animData,
      });
    }

    // 5. Build summary metrics
    const characterList = Array.from(charactersMap.values());
    const scenesWithBg = sceneItems.filter((s) => s.hasBackground).length;
    const missingBgScenes = sceneItems.filter((s) => !s.hasBackground).map((s) => s.sceneId);
    const charsWithMaster = characterList.filter((c) => c.hasMasterReference).length;
    const missingRefChars = characterList.filter((c) => !c.hasMasterReference).map((c) => c.id);

    return {
      story: {
        id: story.id,
        storyId: story.storyId,
        title: story.title,
        logline: story.logline || '',
        lesson: story.lesson || '',
        genre: story.genre || 'Adventure',
        targetAudience: story.audience || story.ageGroup || 'Children 4-8',
        visualStyle,
        aspectRatio: defaultAspectRatio,
        flowProjectId: story.flowProjectId || null,
        productionStage: story.productionStage || 'script',
        visualBible,
      },
      scenes: sceneItems,
      characters: characterList,
      summary: {
        totalScenes: sceneItems.length,
        scenesWithBackground: scenesWithBg,
        missingBackgroundCount: missingBgScenes.length,
        missingBackgroundSceneIds: missingBgScenes,
        totalCharacters: characterList.length,
        charactersWithMasterReference: charsWithMaster,
        missingReferenceCount: missingRefChars.length,
        missingReferenceCharacterIds: missingRefChars,
      },
    };
  }
}

// ----------------------------------------------------
// Natural Language Environmental Extraction Helpers
// ----------------------------------------------------

function extractLocation(text: string, title?: string): string {
  const lower = `${title || ''} ${text}`.toLowerCase();
  if (lower.includes('forest') || lower.includes('woods')) return 'Lush Storybook Forest';
  if (lower.includes('village') || lower.includes('town')) return 'Quaint Village';
  if (lower.includes('cottage') || lower.includes('bedroom') || lower.includes('kitchen') || lower.includes('house')) return 'Cozy Cottage';
  if (lower.includes('meadow') || lower.includes('field') || lower.includes('hill')) return 'Sunny Meadow';
  if (lower.includes('river') || lower.includes('lake') || lower.includes('pond')) return 'Sparkling Riverbank';
  if (lower.includes('beach') || lower.includes('ocean') || lower.includes('sea')) return 'Sandy Ocean Beach';
  if (lower.includes('castle') || lower.includes('palace') || lower.includes('kingdom')) return 'Fairytale Castle';
  if (lower.includes('cave') || lower.includes('mountain')) return 'Misty Mountain';
  if (lower.includes('space') || lower.includes('star') || lower.includes('galaxy')) return 'Whimsical Space Orbit';
  if (lower.includes('classroom') || lower.includes('school')) return 'Colorful Classroom';
  return 'Scenic Outdoor Environment';
}

function extractTimeOfDay(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('night') || lower.includes('midnight') || lower.includes('moonlight') || lower.includes('stars')) return 'Night';
  if (lower.includes('sunset') || lower.includes('dusk') || lower.includes('twilight') || lower.includes('golden hour')) return 'Golden Hour / Sunset';
  if (lower.includes('sunrise') || lower.includes('dawn') || lower.includes('early morning')) return 'Dawn / Early Morning';
  if (lower.includes('afternoon')) return 'Warm Afternoon';
  return 'Bright Daytime';
}

function extractLighting(text: string, timeOfDay: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('magical glow') || lower.includes('luminescent') || lower.includes('sparkl')) return 'Magical Bioluminescent Glow';
  if (lower.includes('sunbeam') || lower.includes('sunlight') || lower.includes('bright sun')) return 'Dappled Sunlight & Sunbeams';
  if (lower.includes('cozy fireplace') || lower.includes('candle') || lower.includes('lantern')) return 'Warm Lantern & Hearth Light';
  if (timeOfDay === 'Night') return 'Soft Moonlit Glow with Twinkling Starlight';
  if (timeOfDay.includes('Sunset') || timeOfDay.includes('Golden')) return 'Warm Amber Sunset Rays';
  return 'Soft Natural Ambient Light';
}

function extractWeather(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('rain') || lower.includes('drizzle')) return 'Gentle Rain Shower';
  if (lower.includes('snow') || lower.includes('winter') || lower.includes('frost')) return 'Crisp Light Snowfall';
  if (lower.includes('mist') || lower.includes('fog')) return 'Dreamy Misty Air';
  if (lower.includes('breeze') || lower.includes('wind')) return 'Pleasant Gentle Breeze';
  return 'Clear & Sunny';
}

export function stripMarkdownProductionLabels(text: string): string {
  if (!text) return '';
  return text
    .replace(/^[*_#\s]*(?:Visual Direction|Visual Style|Environment|Camera Angle|Lighting|Narration|Action|Scene Description|Shot Instruction)\s*:?[\s*_#:]*\s*/i, '')
    .replace(/^[*_~`#\s]+|[*_~`#\s]+$/g, '')
    .trim();
}
