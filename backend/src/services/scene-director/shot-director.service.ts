import { randomUUID } from 'crypto';
import {
  ShotType,
  CameraAngleType,
  CameraMovementType,
  CinematicShotData,
  DirectedCharacterPlacement,
  ShotComposition,
  PromptVersionRecord,
} from './scene-director.types.js';
import { PromptSynthesizer } from '../story-generation/parser/prompt-synthesizer.js';
import {
  prisma,
  getShotsByStoryId,
  getShotsBySceneId,
  getShotById,
  updateShot,
  replaceSceneShots,
  CreateShotInput,
} from '../database/database.service.js';

export interface PlanSceneShotsParams {
  storyId: string;
  sceneId: string;
  sceneNumber: number;
  sceneTitle: string;
  narration?: string;
  visualPrompt?: string;
  durationMs?: number;
  dialogueLines?: Array<{ id?: string; characterName: string; text: string; emotion?: string }>;
  characterInstances?: Array<{
    instanceId: string;
    characterId: string;
    name?: string;
    x?: number;
    y?: number;
    scale?: number;
  }>;
  visualBible?: any;
  aspectRatio?: string;
  visualStyle?: string;
}

export class ShotDirectorService {
  /**
   * Generates a multi-shot cinematic breakdown for a single scene (2-4 shots).
   * Ensures non-destructive character vector staging, separate environment-only background prompts,
   * and dedicated video prompts for optional manual Flow/Veo workflows.
   */
  public static planShotsForScene(params: PlanSceneShotsParams): CinematicShotData[] {
    const {
      storyId,
      sceneId,
      sceneNumber,
      sceneTitle,
      narration = '',
      visualPrompt = '',
      durationMs = 15000,
      dialogueLines = [],
      characterInstances = [],
      visualBible,
      aspectRatio = '16:9',
      visualStyle = 'Cinematic 3D storybook animation, Pixar / Disney aesthetic',
    } = params;

    const totalDuration = Math.max(3000, durationMs);
    const hasDialogue = dialogueLines.length > 0;
    const charCount = characterInstances.length;

    // Decide shot count based on scene length and narrative weight
    let shotCount = 2;
    if (totalDuration >= 20000 || (hasDialogue && dialogueLines.length >= 2 && totalDuration >= 14000)) {
      shotCount = 3;
    }
    if (totalDuration >= 35000) {
      shotCount = 4;
    }

    // Determine shot ratios
    let durationRatios: number[] = [];
    if (shotCount === 2) {
      durationRatios = [0.45, 0.55];
    } else if (shotCount === 3) {
      durationRatios = [0.35, 0.40, 0.25];
    } else {
      durationRatios = [0.25, 0.35, 0.25, 0.15];
    }

    const shots: CinematicShotData[] = [];
    let currentStartMs = 0;

    // Extract location from visual prompt or title
    const cleanLocation = PromptSynthesizer.normalizeLocationName(visualPrompt) ||
      PromptSynthesizer.normalizeLocationName(sceneTitle) ||
      sceneTitle;

    for (let i = 0; i < shotCount; i++) {
      const shotNum = i + 1;
      const shotDuration = Math.round(totalDuration * durationRatios[i]);
      const shotEndMs = i === shotCount - 1 ? totalDuration : currentStartMs + shotDuration;
      const shotId = `shot-${sceneId}-${shotNum}-${randomUUID().slice(0, 6)}`;

      let shotType: ShotType = 'wide_establishing';
      let cameraAngle: CameraAngleType = 'eye_level';
      let cameraMovement: CameraMovementType = 'static';
      let shotTitle = '';
      let shotDescription = '';
      let composition: ShotComposition = {};
      let requiredProps: string[] = [];
      let requiredEffects: string[] = [];

      // Shot 1: Establishing environment & character entrance
      if (shotNum === 1) {
        shotType = 'wide_establishing';
        cameraAngle = 'eye_level';
        cameraMovement = 'slow_zoom_in';
        shotTitle = `Shot 1: ${cleanLocation} - Wide Establishing`;
        shotDescription = `Wide scenic opening establishing the atmosphere of ${cleanLocation}.`;
        composition = {
          foreground: 'Open central clearing framed by soft foliage and ambient light',
          middleground: 'Ground stage where characters enter the scene',
          background: `Scenic panorama of ${cleanLocation} with distant landscape`,
          depthOfField: 'deep',
          characterPlacementZone: charCount <= 1 ? 'center' : 'two_shot_split',
        };
      } else if (shotNum === 2) {
        // Shot 2: Dialogue exchange / Action focus
        if (hasDialogue) {
          shotType = charCount === 2 ? 'medium_twoshot' : 'closeup_speaker';
          cameraAngle = 'eye_level';
          cameraMovement = 'static';
          shotTitle = `Shot 2: ${dialogueLines[0]?.characterName || 'Hero'} Dialogue Delivery`;
          shotDescription = `Medium framing capturing character expressions and spoken dialogue line.`;
        } else {
          shotType = 'medium';
          cameraAngle = 'low_angle';
          cameraMovement = 'pan_right';
          shotTitle = `Shot 2: Mid-Scene Motion & Discovery`;
          shotDescription = `Medium framing following character exploration through the stage.`;
        }
        composition = {
          foreground: 'Clear foreground unobstructed for character upper body gestures',
          middleground: 'Primary speaking character and listener interaction space',
          background: `Softly blurred storybook backdrop of ${cleanLocation}`,
          depthOfField: 'medium',
          characterPlacementZone: 'center',
        };
      } else if (shotNum === 3) {
        // Shot 3: Reaction or climactic character gesture
        shotType = hasDialogue && dialogueLines.length >= 2 ? 'closeup_speaker' : 'character_focus';
        cameraAngle = 'high_angle';
        cameraMovement = 'push_in';
        shotTitle = `Shot 3: Emotional Reaction & Discovery`;
        shotDescription = `Closer cinematic shot emphasizing expressive character reaction and environmental shift.`;
        composition = {
          foreground: 'Dynamic shallow depth of field focusing on character face and eyes',
          middleground: 'Character gesturing or reacting with expressive emotion',
          background: 'Artistic blurred backdrop with atmospheric bokeh',
          depthOfField: 'shallow',
          characterPlacementZone: 'center',
        };
      } else {
        // Shot 4: Resolving wider shot or transition out
        shotType = 'wide_establishing';
        cameraAngle = 'eye_level';
        cameraMovement = 'zoom_out';
        shotTitle = `Shot 4: Scene Conclusion & Transition`;
        shotDescription = `Scenic pullback concluding the scene actions and leading into the next narrative beat.`;
        composition = {
          foreground: 'Open stage with characters resolving their action',
          middleground: 'Balanced two-shot or group pose',
          background: `Full environmental vista of ${cleanLocation}`,
          depthOfField: 'deep',
          characterPlacementZone: 'two_shot_split',
        };
      }

      // Staging character instances for this shot
      const placements: DirectedCharacterPlacement[] = characterInstances.map((ci, cIdx) => {
        let x = ci.x ?? 640;
        let y = ci.y ?? 470;
        let scale = ci.scale ?? 1.0;
        let flipX = false;
        let action: DirectedCharacterPlacement['action'] = 'idle';
        let expression: DirectedCharacterPlacement['expression'] = 'happy';

        if (shotType === 'wide_establishing') {
          if (charCount === 1) {
            x = 640;
          } else if (charCount === 2) {
            x = cIdx === 0 ? 460 : 820;
            flipX = cIdx === 1;
          }
          action = shotNum === 1 && cIdx === 0 ? 'walk' : 'idle';
          scale = 1.0;
        } else if (shotType === 'closeup_speaker') {
          x = 640;
          scale = 1.35;
          action = 'idle';
          expression = 'excited';
        } else {
          // medium / two-shot / character_focus
          if (charCount === 2) {
            x = cIdx === 0 ? 500 : 780;
            flipX = cIdx === 1;
          }
          action = cIdx === 0 ? 'wave' : 'idle';
          scale = 1.15;
        }

        // Align with dialogue emotion if available
        if (dialogueLines[0]?.emotion) {
          const em = dialogueLines[0].emotion.toLowerCase();
          if (em.includes('happy') || em.includes('cheerful')) expression = 'happy';
          else if (em.includes('excited')) expression = 'excited';
          else if (em.includes('surprised')) expression = 'surprised';
          else if (em.includes('curious') || em.includes('thinking')) expression = 'curious';
        }

        return {
          instanceId: ci.instanceId,
          characterId: ci.characterId,
          name: ci.name || `Character ${cIdx + 1}`,
          x: Math.round(x),
          y: Math.round(y),
          scale: Number(scale.toFixed(2)),
          flipX,
          zIndex: cIdx + 1,
          action,
          expression,
          isSpeaker: cIdx === 0 && hasDialogue,
        };
      });

      // Per-shot background image prompt: strictly environment only, NO characters, NO text
      const backgroundPrompt = PromptSynthesizer.synthesizeBackgroundPrompt({
        explicitPrompt: visualPrompt,
        sceneTitle,
        locationName: cleanLocation,
        timeOfDay: 'DAY',
        cameraDirection: shotType === 'wide_establishing' ? 'Eye-level wide shot' : `${shotType.replace(/_/g, ' ')} view`,
        aspectRatio,
        visualStyle,
      });

      // Per-shot video prompt for optional manual Google Flow / Veo generation
      const videoPrompt = PromptSynthesizer.synthesizeVideoPrompt({
        locationName: cleanLocation,
        cameraMovement,
        cameraAngle,
        shotType,
        visualStyle,
        atmosphereEffects: requiredEffects,
        motionIntensity: shotType === 'closeup_speaker' ? 2 : 4,
      });

      const initialHistory: PromptVersionRecord[] = [
        {
          version: 1,
          backgroundPrompt,
          videoPrompt,
          createdAt: new Date().toISOString(),
          approved: false,
          notes: 'Initial AI production breakdown',
        },
      ];

      shots.push({
        shotId,
        sceneId,
        storyId,
        number: shotNum,
        order: shotNum,
        title: shotTitle,
        description: shotDescription,
        durationMs: shotDuration,
        shotType,
        cameraAngle,
        cameraMovement,
        lighting: 'Soft warm storybook illumination with gentle fill lighting',
        composition,
        characterPlacements: placements,
        requiredProps,
        requiredEffects,
        startMs: currentStartMs,
        endMs: shotEndMs,
        transition: {
          type: shotNum === 1 ? 'fade' : 'cut',
          durationMs: shotNum === 1 ? 500 : 300,
        },
        backgroundPrompt,
        videoPrompt,
        promptHistory: initialHistory,
        backgroundUrl: null,
        videoUrl: null,
        assetStatus: 'pending',
        approvalStatus: 'pending',
        productionStatus: 'draft',
      });

      currentStartMs = shotEndMs;
    }

    return shots;
  }

  /**
   * Plans and persists cinematic shot breakdowns for all scenes in a story.
   */
  public static async planShotsForStory(storyId: string, options?: { forceRegenerate?: boolean }): Promise<CinematicShotData[]> {
    const story = await prisma.story.findUnique({
      where: { storyId },
      include: {
        scenes: {
          where: { deletedAt: null },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!story) {
      throw new Error(`Story ${storyId} not found`);
    }

    // Check if shots already exist
    const existingShots = await getShotsByStoryId(storyId);
    if (existingShots.length > 0 && !options?.forceRegenerate) {
      return existingShots.map(this.mapPrismaRecordToShotData);
    }

    const allPlannedShots: CinematicShotData[] = [];

    for (const sc of story.scenes) {
      const animData = (sc.animationData as any) || {};
      const charInstances = animData.characterInstances || [];
      const dialogueLines = animData.dialogueLines || [];

      const sceneShots = this.planShotsForScene({
        storyId,
        sceneId: sc.sceneId,
        sceneNumber: sc.number,
        sceneTitle: sc.title,
        narration: sc.narration,
        visualPrompt: sc.visualPrompt || animData.background?.prompt || '',
        durationMs: sc.endMs > sc.startMs ? sc.endMs - sc.startMs : sc.estimatedDurationMs || 15000,
        dialogueLines,
        characterInstances: charInstances,
        visualBible: story.visualBible,
        aspectRatio: (animData.background?.aspectRatio) || '16:9',
        visualStyle: story.visualStyle || undefined,
      });

      // Persist to database atomically per scene
      const createInputs: CreateShotInput[] = sceneShots.map((s) => ({
        shotId: s.shotId,
        storyId: s.storyId,
        sceneId: s.sceneId,
        number: s.number,
        order: s.order,
        title: s.title,
        description: s.description,
        durationMs: s.durationMs,
        shotType: s.shotType,
        cameraAngle: s.cameraAngle,
        cameraMovement: s.cameraMovement,
        lighting: s.lighting,
        shotDirection: { composition: s.composition, requiredProps: s.requiredProps, requiredEffects: s.requiredEffects },
        characterInstructions: { placements: s.characterPlacements },
        backgroundPrompt: s.backgroundPrompt,
        videoPrompt: s.videoPrompt,
        promptHistory: s.promptHistory,
        backgroundUrl: s.backgroundUrl,
        videoUrl: s.videoUrl,
        assetStatus: s.assetStatus,
        approvalStatus: s.approvalStatus,
        productionStatus: s.productionStatus,
      }));

      await replaceSceneShots(storyId, sc.sceneId, createInputs);
      allPlannedShots.push(...sceneShots);
    }

    // Update story production stage to 'shot_planning'
    await prisma.story.update({
      where: { storyId },
      data: { productionStage: 'shot_planning' },
    });

    return allPlannedShots;
  }

  /**
   * Regenerates a shot prompt (background, video, or both) and appends the old version to history.
   */
  public static async regenerateShotPrompt(
    shotId: string,
    type: 'background' | 'video' | 'both',
    instructions?: string
  ): Promise<CinematicShotData> {
    const shot = await getShotById(shotId);
    if (!shot) {
      throw new Error(`Shot ${shotId} not found`);
    }

    const currentHistory: PromptVersionRecord[] = Array.isArray(shot.promptHistory)
      ? (shot.promptHistory as any)
      : [];

    const newVersionNum = currentHistory.length + 1;
    let newBgPrompt = shot.backgroundPrompt || '';
    let newVidPrompt = shot.videoPrompt || '';

    if (type === 'background' || type === 'both') {
      newBgPrompt = PromptSynthesizer.synthesizeBackgroundPrompt({
        explicitPrompt: instructions ? `${instructions}. ${shot.backgroundPrompt}` : shot.backgroundPrompt || '',
        sceneTitle: shot.title || `Shot ${shot.number}`,
        locationName: shot.title || '',
        cameraDirection: shot.shotType || 'wide_establishing',
      });
    }

    if (type === 'video' || type === 'both') {
      newVidPrompt = PromptSynthesizer.synthesizeVideoPrompt({
        locationName: shot.title || '',
        cameraMovement: shot.cameraMovement || 'slow_zoom_in',
        cameraAngle: shot.cameraAngle || 'eye_level',
        shotType: shot.shotType || 'wide_establishing',
      });
    }

    const newVersion: PromptVersionRecord = {
      version: newVersionNum,
      backgroundPrompt: newBgPrompt,
      videoPrompt: newVidPrompt,
      createdAt: new Date().toISOString(),
      approved: false,
      notes: instructions ? `Regenerated with notes: ${instructions}` : 'Regenerated prompt variant',
    };

    const updated = await updateShot(shotId, {
      backgroundPrompt: newBgPrompt,
      videoPrompt: newVidPrompt,
      promptHistory: [...currentHistory, newVersion],
      approvalStatus: 'pending',
    });

    return this.mapPrismaRecordToShotData(updated);
  }

  /**
   * Approves a shot's prompts and production directions.
   */
  public static async approveShot(shotId: string): Promise<CinematicShotData> {
    const updated = await updateShot(shotId, {
      approvalStatus: 'approved',
      productionStatus: 'ready',
    });
    return this.mapPrismaRecordToShotData(updated);
  }

  /**
   * Associates an imported or uploaded image or video asset with a shot.
   */
  public static async associateAsset(
    shotId: string,
    asset: { type: 'image' | 'video'; url: string }
  ): Promise<CinematicShotData> {
    const updates: any = {
      assetStatus: 'imported',
      productionStatus: 'ready',
    };

    if (asset.type === 'image') {
      updates.backgroundUrl = asset.url;
    } else {
      updates.videoUrl = asset.url;
    }

    const updated = await updateShot(shotId, updates);
    return this.mapPrismaRecordToShotData(updated);
  }

  /**
   * Helper to map a Prisma Shot record into the typed CinematicShotData contract.
   */
  public static mapPrismaRecordToShotData(rec: any): CinematicShotData {
    const shotDir = (rec.shotDirection as any) || {};
    const charInst = (rec.characterInstructions as any) || {};

    return {
      shotId: rec.shotId,
      sceneId: rec.sceneId,
      storyId: rec.storyId,
      number: rec.number,
      order: rec.order,
      title: rec.title || `Shot ${rec.number}`,
      description: rec.description || '',
      durationMs: rec.durationMs,
      shotType: (rec.shotType as ShotType) || 'wide_establishing',
      cameraAngle: (rec.cameraAngle as CameraAngleType) || 'eye_level',
      cameraMovement: (rec.cameraMovement as CameraMovementType) || 'static',
      lighting: rec.lighting || 'Natural ambient lighting',
      composition: shotDir.composition || {},
      characterPlacements: charInst.placements || [],
      requiredProps: shotDir.requiredProps || [],
      requiredEffects: shotDir.requiredEffects || [],
      startMs: 0,
      endMs: rec.durationMs,
      transition: {
        type: rec.number === 1 ? 'fade' : 'cut',
        durationMs: 300,
      },
      backgroundPrompt: rec.backgroundPrompt || '',
      videoPrompt: rec.videoPrompt || '',
      promptHistory: Array.isArray(rec.promptHistory) ? rec.promptHistory : [],
      backgroundUrl: rec.backgroundUrl,
      videoUrl: rec.videoUrl,
      assetStatus: (rec.assetStatus as any) || 'pending',
      approvalStatus: (rec.approvalStatus as any) || 'pending',
      productionStatus: (rec.productionStatus as any) || 'draft',
    };
  }
}
