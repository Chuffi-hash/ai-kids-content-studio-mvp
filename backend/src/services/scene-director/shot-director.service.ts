import { randomUUID } from 'crypto';
import { z } from 'zod';
import {
  ShotType,
  CameraAngleType,
  CameraMovementType,
  CinematicShotData,
  DirectedCharacterPlacement,
  ShotComposition,
  PromptVersionRecord,
  normalizeCameraMovement,
} from './scene-director.types.js';
import { PromptSynthesizer } from '../story-generation/parser/prompt-synthesizer.js';
import {
  prisma,
  getShotsByStoryId,
  getShotsBySceneId,
  getShotById,
  updateShot,
  reconcileAndUpsertSceneShots,
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
  existingShots?: CinematicShotData[];
}

const ShotAiOutputSchema = z.object({
  shots: z.array(
    z.object({
      number: z.number().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      durationMs: z.number().optional(),
      shotType: z.string().optional(),
      cameraAngle: z.string().optional(),
      cameraMovement: z.string().optional(),
      lighting: z.string().optional(),
      backgroundPrompt: z.string(),
      videoPrompt: z.string().optional(),
      characterPlacements: z.array(
        z.object({
          characterId: z.string().optional(),
          instanceId: z.string().optional(),
          name: z.string().optional(),
          x: z.number().optional(),
          y: z.number().optional(),
          scale: z.number().optional(),
          flipX: z.boolean().optional(),
          action: z.string().optional(),
          expression: z.string().optional(),
        })
      ).optional(),
    })
  ).min(1),
});

export class ShotDirectorService {
  /**
   * Generates a multi-shot cinematic breakdown for a single scene (2-4 shots) via deterministic rule engine.
   * Ensures non-destructive character vector staging, separate environment-only background prompts,
   * and dedicated video prompts for optional manual Flow/Veo workflows.
   */
  public static planShotsRuleEngine(params: PlanSceneShotsParams): CinematicShotData[] {
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
   * Maps AI-generated structured shots into CinematicShotData contracts with complete defaults.
   */
  private static mapAiShotsToCinematicData(
    rawShots: Array<any>,
    params: PlanSceneShotsParams
  ): CinematicShotData[] {
    const { storyId, sceneId, sceneTitle, visualPrompt = '', durationMs = 15000, characterInstances = [] } = params;
    const cleanLocation = PromptSynthesizer.normalizeLocationName(visualPrompt) ||
      PromptSynthesizer.normalizeLocationName(sceneTitle) ||
      sceneTitle;

    let cursorMs = 0;
    const totalDuration = Math.max(3000, durationMs);
    const rawSum = rawShots.reduce(
      (acc, s) => acc + (typeof s.durationMs === 'number' && s.durationMs > 0 ? s.durationMs : 0),
      0
    );
    const durationScale = rawSum > 0 ? totalDuration / rawSum : 1;

    return rawShots.map((st, idx) => {
      const shotNum = st.number || idx + 1;
      const rawDur = typeof st.durationMs === 'number' && st.durationMs > 0
        ? st.durationMs
        : Math.round(totalDuration / rawShots.length);
      const sStart = cursorMs;
      const isLast = idx === rawShots.length - 1;
      const sDur = isLast ? Math.max(1000, totalDuration - sStart) : Math.round(rawDur * durationScale);
      const sEnd = isLast ? totalDuration : sStart + sDur;
      cursorMs = sEnd;

      const normalizedMove = normalizeCameraMovement(st.cameraMovement || 'slow_zoom_in');
      const shotType = (st.shotType as ShotType) || (shotNum === 1 ? 'wide_establishing' : 'medium_twoshot');
      const cameraAngle = (st.cameraAngle as CameraAngleType) || 'eye_level';

      // Reconcile character placements
      const placements: DirectedCharacterPlacement[] = characterInstances.map((ci, cIdx) => {
        const found = (st.characterPlacements || []).find((p: any) =>
          p.characterId === ci.characterId || p.instanceId === ci.instanceId || p.name === ci.name
        );
        return {
          instanceId: ci.instanceId,
          characterId: ci.characterId,
          name: ci.name || `Character ${cIdx + 1}`,
          x: found?.x ?? (characterInstances.length === 2 ? (cIdx === 0 ? 460 : 820) : (ci.x ?? 640)),
          y: found?.y ?? (ci.y ?? 470),
          scale: found?.scale ?? (ci.scale ?? 1.0),
          flipX: found?.flipX ?? (characterInstances.length === 2 && cIdx === 1),
          zIndex: cIdx + 1,
          action: (found?.action as any) || (shotNum === 1 && cIdx === 0 ? 'walk' : 'idle'),
          expression: (found?.expression as any) || 'happy',
        };
      });

      const bgPrompt = PromptSynthesizer.synthesizeBackgroundPrompt({
        explicitPrompt: st.backgroundPrompt || visualPrompt,
        sceneTitle,
        locationName: cleanLocation,
        cameraDirection: shotType === 'wide_establishing' ? 'Eye-level wide shot' : `${shotType.replace(/_/g, ' ')} view`,
      });

      const vidPrompt = st.videoPrompt || PromptSynthesizer.synthesizeVideoPrompt({
        locationName: cleanLocation,
        cameraMovement: normalizedMove,
        cameraAngle,
        shotType,
      });

      const initialHistory: PromptVersionRecord[] = [
        {
          version: 1,
          backgroundPrompt: bgPrompt,
          videoPrompt: vidPrompt,
          createdAt: new Date().toISOString(),
          approved: false,
          notes: 'AI Production Planning',
        },
      ];

      return {
        shotId: `shot-${sceneId}-${shotNum}-${randomUUID().slice(0, 6)}`,
        sceneId,
        storyId,
        number: shotNum,
        order: shotNum,
        title: st.title || `Shot ${shotNum}: ${cleanLocation}`,
        description: st.description || `Cinematic shot ${shotNum}`,
        durationMs: sDur,
        shotType,
        cameraAngle,
        cameraMovement: normalizedMove,
        lighting: st.lighting || 'Soft warm storybook illumination with gentle fill lighting',
        composition: {
          foreground: 'Open ground framed by natural atmosphere',
          middleground: 'Character staging area',
          background: `Scenic panorama of ${cleanLocation}`,
          depthOfField: 'deep',
        },
        characterPlacements: placements,
        requiredProps: [],
        requiredEffects: [],
        startMs: sStart,
        endMs: sEnd,
        transition: {
          type: shotNum === 1 ? 'fade' : 'cut',
          durationMs: shotNum === 1 ? 500 : 300,
        },
        backgroundPrompt: bgPrompt,
        videoPrompt: vidPrompt,
        promptHistory: initialHistory,
        backgroundUrl: null,
        videoUrl: null,
        assetStatus: 'pending',
        approvalStatus: 'pending',
        productionStatus: 'draft',
      };
    });
  }

  /**
   * Plans cinematic shots using active AI model (Gemini or OpenAI) with bounded repair & fallback.
   */
  public static async planShotsWithAI(params: PlanSceneShotsParams): Promise<{ shots: CinematicShotData[]; provider: string }> {
    const geminiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!geminiKey && !openaiKey) {
      return { shots: this.planShotsRuleEngine(params), provider: 'fallback_rule_engine' };
    }

    const {
      sceneTitle,
      narration = '',
      visualPrompt = '',
      durationMs = 15000,
      dialogueLines = [],
      characterInstances = [],
    } = params;

    const promptText = `You are a cinematic animation director directing Scene ${params.sceneNumber}: "${sceneTitle}".
Scene Duration: ${durationMs}ms
Narration: "${narration}"
Visual Prompt: "${visualPrompt}"
Characters Present: ${characterInstances.map(c => `${c.name || 'Character'} (id: ${c.characterId})`).join(', ') || 'None'}
Dialogue Lines:
${dialogueLines.map(d => `- ${d.characterName}: "${d.text}" (${d.emotion || 'neutral'})`).join('\n') || 'None'}

Direct this scene into 2 to 4 distinct cinematic shots.
CRITICAL RULES:
1. Divide the total duration (${durationMs}ms) across the shots so their durations sum to ${durationMs}.
2. shotType MUST be one of: "wide_establishing", "medium_twoshot", "closeup_speaker", "character_focus", "extreme_wide", "medium", "closeup", "over_the_shoulder".
3. cameraMovement MUST be one of: "slow_zoom_in", "zoom_out", "pan_left", "pan_right", "tilt_up", "tilt_down", "tracking", "dolly", "push_in", "pull_out", "static".
4. cameraAngle MUST be one of: "eye_level", "low_angle", "high_angle", "birds_eye".
5. backgroundPrompt: MUST BE STRICTLY ENVIRONMENT ONLY! Describe scenery, landscape, lighting, colors, props, time of day. NEVER include characters, children, faces, animals, or humans in backgroundPrompt.
6. videoPrompt: Describe camera motion through this environment for video generation.
7. characterPlacements: Provide coordinates (x: 100-1180, y: 400-520), scale (0.8-1.4), action ("idle", "walk", "wave", "jump", "point"), expression ("happy", "excited", "curious", "surprised", "neutral").

Return ONLY a valid JSON object matching this structure:
{
  "shots": [
    {
      "number": 1,
      "title": "Shot 1 Title",
      "description": "Shot summary",
      "durationMs": 7500,
      "shotType": "wide_establishing",
      "cameraAngle": "eye_level",
      "cameraMovement": "slow_zoom_in",
      "lighting": "Warm morning sunlight with soft rim light",
      "backgroundPrompt": "A lush storybook meadow with rolling green hills...",
      "videoPrompt": "Slow cinematic push-in towards rolling green meadow under sunlit sky...",
      "characterPlacements": []
    }
  ]
}`;

    try {
      let rawJson = '';
      let usedProvider = 'gemini';

      if (geminiKey) {
        const model = process.env.GEMINI_TEXT_MODEL || 'gemini-2.0-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.4,
            },
          }),
        });
        if (res.ok) {
          const data: any = await res.json();
          rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          usedProvider = `gemini:${model}`;
        }
      }

      if (!rawJson && openaiKey) {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'You are an expert cinematic animation director. Output only valid JSON.' },
              { role: 'user', content: promptText },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.4,
          }),
        });
        if (res.ok) {
          const data: any = await res.json();
          rawJson = data.choices?.[0]?.message?.content || '';
          usedProvider = 'openai:gpt-4o-mini';
        }
      }

      if (rawJson) {
        const cleaned = rawJson.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        const validated = ShotAiOutputSchema.safeParse(parsed);
        if (validated.success && validated.data.shots.length > 0) {
          const mapped = this.mapAiShotsToCinematicData(validated.data.shots, params);
          return { shots: mapped, provider: usedProvider };
        }
      }
    } catch (err: any) {
      console.warn('[ShotDirectorService] AI planning failed, utilizing fallback rule engine:', err.message);
    }

    return { shots: this.planShotsRuleEngine(params), provider: 'fallback_rule_engine' };
  }

  /**
   * Reconciles freshly planned shots with existing shots to preserve user work:
   * - Preserves user-edited titles and descriptions
   * - Preserves custom/edited prompts, history, approvals, and attached assets (backgroundUrl, videoUrl)
   * - Preserves manual character placement adjustments
   * - Re-aligns startMs and endMs timeline cursors cleanly
   */
  public static reconcileShots(
    newShots: CinematicShotData[],
    existingShots: CinematicShotData[]
  ): CinematicShotData[] {
    if (!existingShots || existingShots.length === 0) {
      return newShots;
    }

    let cursorMs = 0;
    return newShots.map((ns, idx) => {
      // Find matching existing shot by order/number or shotId
      const existing = existingShots.find((es) => es.number === ns.number || es.shotId === ns.shotId) ||
        existingShots[idx];

      if (!existing) {
        const sEnd = cursorMs + ns.durationMs;
        const res = { ...ns, startMs: cursorMs, endMs: sEnd };
        cursorMs = sEnd;
        return res;
      }

      const isApproved = existing.approvalStatus === 'approved';
      const hasCustomPrompt = existing.promptHistory && existing.promptHistory.length > 1;
      const hasAsset = Boolean(existing.backgroundUrl || existing.videoUrl);

      // Preserve stable shot ID
      const preservedId = existing.shotId || ns.shotId;

      // Preserve background and video prompt if user approved or regenerated
      const backgroundPrompt = (isApproved || hasCustomPrompt) && existing.backgroundPrompt
        ? existing.backgroundPrompt
        : ns.backgroundPrompt;

      const videoPrompt = (isApproved || hasCustomPrompt) && existing.videoPrompt
        ? existing.videoPrompt
        : ns.videoPrompt;

      const promptHistory = existing.promptHistory && existing.promptHistory.length > 0
        ? existing.promptHistory
        : ns.promptHistory;

      // Retain asset references
      const backgroundUrl = existing.backgroundUrl || ns.backgroundUrl;
      const videoUrl = existing.videoUrl || ns.videoUrl;
      const assetStatus = hasAsset ? existing.assetStatus : ns.assetStatus;
      const approvalStatus = existing.approvalStatus || ns.approvalStatus;

      // Re-align timeline cursors
      const durationMs = existing.durationMs || ns.durationMs;
      const sStart = cursorMs;
      const sEnd = cursorMs + durationMs;
      cursorMs = sEnd;

      return {
        ...ns,
        shotId: preservedId,
        title: existing.title || ns.title,
        description: existing.description || ns.description,
        durationMs,
        startMs: sStart,
        endMs: sEnd,
        shotType: existing.shotType || ns.shotType,
        cameraAngle: existing.cameraAngle || ns.cameraAngle,
        cameraMovement: existing.cameraMovement || ns.cameraMovement,
        lighting: existing.lighting || ns.lighting,
        backgroundPrompt,
        videoPrompt,
        promptHistory,
        backgroundUrl,
        videoUrl,
        assetStatus,
        approvalStatus,
        productionStatus: hasAsset || isApproved ? 'ready' : ns.productionStatus,
        characterPlacements: existing.characterPlacements && existing.characterPlacements.length > 0
          ? existing.characterPlacements
          : ns.characterPlacements,
      };
    });
  }

  /**
   * Plans cinematic shot breakdown for a single scene with reconciliation.
   */
  public static planShotsForScene(params: PlanSceneShotsParams): CinematicShotData[] {
    const planned = this.planShotsRuleEngine(params);
    if (params.existingShots && params.existingShots.length > 0) {
      return this.reconcileShots(planned, params.existingShots);
    }
    return planned;
  }

  /**
   * Plans and persists cinematic shot breakdowns for all scenes in a story with reconciliation.
   */
  public static async planShotsForStory(
    storyId: string,
    options?: { forceRegenerate?: boolean; useAI?: boolean }
  ): Promise<{ shots: CinematicShotData[]; provider: string }> {
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

    const shouldRunAi = options?.useAI ?? true;
    let dominantProvider = shouldRunAi ? 'ai' : 'deterministic_rule_engine';

    // Check if shots already exist
    const existingStoryShots = await getShotsByStoryId(storyId);
    if (existingStoryShots.length > 0 && !options?.forceRegenerate) {
      return {
        shots: existingStoryShots.map(this.mapPrismaRecordToShotData),
        provider: 'persisted_database',
      };
    }

    const allPlannedShots: CinematicShotData[] = [];

    for (const sc of story.scenes) {
      const animData = (sc.animationData as any) || {};
      const charInstances = animData.characterInstances || [];
      const dialogueLines = animData.dialogueLines || [];
      const existingSceneShots = existingStoryShots
        .filter((es: any) => es.sceneId === sc.sceneId)
        .map(this.mapPrismaRecordToShotData);

      const params: PlanSceneShotsParams = {
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
        existingShots: existingSceneShots,
      };

      let sceneShots: CinematicShotData[];
      if (shouldRunAi) {
        const aiResult = await this.planShotsWithAI(params);
        dominantProvider = aiResult.provider;
        sceneShots = existingSceneShots.length > 0
          ? this.reconcileShots(aiResult.shots, existingSceneShots)
          : aiResult.shots;
      } else {
        sceneShots = this.planShotsForScene(params);
        dominantProvider = 'deterministic_rule_engine';
      }

      // Persist to database atomically per scene non-destructively
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

      await reconcileAndUpsertSceneShots(storyId, sc.sceneId, createInputs);
      allPlannedShots.push(...sceneShots);
    }

    // Update story production stage to 'shot_planning'
    await prisma.story.update({
      where: { storyId },
      data: { productionStage: 'shot_planning' },
    });

    return { shots: allPlannedShots, provider: dominantProvider };
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
   * Restores a previous prompt version from shot history.
   */
  public static async restorePromptVersion(
    shotId: string,
    version: number
  ): Promise<CinematicShotData> {
    const shot = await getShotById(shotId);
    if (!shot) {
      throw new Error(`Shot ${shotId} not found`);
    }

    const currentHistory: PromptVersionRecord[] = Array.isArray(shot.promptHistory)
      ? (shot.promptHistory as any)
      : [];

    const targetVersion = currentHistory.find((v) => v.version === version);
    if (!targetVersion) {
      throw new Error(`Version ${version} not found in shot ${shotId} history`);
    }

    const newVersionNum = currentHistory.length + 1;
    const restoredRecord: PromptVersionRecord = {
      version: newVersionNum,
      backgroundPrompt: targetVersion.backgroundPrompt,
      videoPrompt: targetVersion.videoPrompt,
      createdAt: new Date().toISOString(),
      approved: false,
      notes: `Restored from version ${version}`,
    };

    const updated = await updateShot(shotId, {
      backgroundPrompt: targetVersion.backgroundPrompt,
      videoPrompt: targetVersion.videoPrompt,
      promptHistory: [...currentHistory, restoredRecord],
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
