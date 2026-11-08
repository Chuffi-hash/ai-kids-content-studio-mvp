import fs from 'fs';
import path from 'path';
import { getImagesBySceneId } from '../database/database.service.js';
import { getVectorRig, VectorRigDefinition } from '../animation/templates/default-characters.js';
import { buildRigFromAppearance } from '../animation/templates/custom-character-rig.js';

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5';

export interface RemotionManifestAdapterOptions {
  resolution?: '720p' | '1080p';
  fps?: number;
  format?: '16:9' | '9:16' | '1:1' | '4:5' | 'custom';
  backgroundMusic?: string | null;
  musicVolume?: number;
  selectedSceneIds?: string[];
  targetDurationSec?: number;
  serverOrigin?: string; // e.g. http://localhost:5001
  embedBase64Images?: boolean;
  templateId?: string;
  subtitleTheme?: 'classic' | 'karaoke' | 'speech-bubble' | 'minimal';
}

export interface RemotionManifest {
  version: string | number;
  storyId: string;
  storyTitle: string;
  fps: number;
  resolution: '720p' | '1080p';
  format: AspectRatio;
  backgroundMusic?: string;
  musicVolume?: number;
  templateId?: string;
  subtitleTheme?: 'classic' | 'karaoke' | 'speech-bubble' | 'minimal';
  scenes: RemotionScene[];
}

export interface RemotionScene {
  id: string;
  sceneNumber: number;
  durationMs: number;
  title?: string;
  caption?: string;
  background?: {
    imageUrl?: string;
    fit?: 'cover' | 'contain';
    removed?: boolean;
  };
  cameraMovement?: string;
  cameraRotation?: string;
  cameraRotationDegrees?: number;
  narration?: {
    url: string;
    durationMs?: number;
    volume?: number;
  };
  dialogues?: Array<{
    id: string;
    characterName: string;
    characterInstanceId?: string;
    characterId?: string;
    text: string;
    url?: string;
    audioUrl?: string;
    startMs: number;
    durationMs: number;
    volume?: number;
    facialExpression?: string;
    emotion?: string;
    speakingDirection?: string;
    visemeCues?: Array<{
      timeMs: number;
      shape: 'rest' | 'open' | 'wide' | 'round' | 'closed';
      durationMs: number;
    }>;
    wordTimings?: Array<{ text: string; startMs: number; endMs: number }>;
  }>;
  characterInstances?: Array<{
    instanceId: string;
    characterId: string;
    name?: string;
    x: number;
    y: number;
    scale: number;
    rotation: number;
    flipX: boolean;
    zIndex: number;
    customRig?: VectorRigDefinition;
    expression?: string;
  }>;
  animationClips?: Array<{
    clipId: string;
    instanceId: string;
    action: 'idle' | 'walk' | 'wave' | 'jump' | 'point';
    startMs: number;
    durationMs: number;
    loop: boolean;
    speedMultiplier?: number;
    motionMode?: 'in_place' | 'motion_path';
    motionPath?: {
      startX: number;
      startY: number;
      endX: number;
      endY: number;
      easing?: 'linear' | 'easeInOut' | 'easeIn' | 'easeOut';
    };
  }>;
  expressionCues?: Array<{
    id?: string;
    instanceId?: string;
    characterInstanceId?: string;
    characterId?: string;
    expression: string;
    startMs: number;
    durationMs: number;
  }>;
  overlays?: Array<{
    id: string;
    type: 'location_pin' | 'route_line' | 'highlight_ring' | 'directional_arrow' | 'callout_label';
    x: number;
    y: number;
    scale?: number;
    rotation?: number;
    color?: string;
    label?: string;
    endX?: number;
    endY?: number;
    radius?: number;
    startMs?: number;
    durationMs?: number;
    layerDepth?: 'below_characters' | 'above_characters';
  }>;
  formatVariants?: Record<string, any>;
}

function estimateWordTimings(text: string, durationMs: number) {
  const tokens = text.match(/\\S+/gu) || [];
  if (tokens.length === 0) return [];
  // Proportional timing is a fallback, not forced alignment. Longer words receive
  // slightly more time; punctuation adds a small pause to improve readability.
  const weights = tokens.map((token) => {
    const letters = Math.max(1, token.replace(/[^\\p{L}\\p{N}]/gu, '').length);
    const pause = /[.!?।,:;]$/.test(token) ? 0.18 : 0;
    return letters + pause;
  });
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  return tokens.map((token, index) => {
    const startMs = cursor;
    cursor = index === tokens.length - 1
      ? durationMs
      : cursor + (durationMs * weights[index]) / total;
    return { text: token, startMs: Math.round(startMs), endMs: Math.round(cursor) };
  });
}

export class RemotionManifestAdapter {
  private serverOrigin: string;
  private storageDir: string;

  constructor(options?: { serverOrigin?: string; storageDir?: string }) {
    const port = process.env.PORT || '5001';
    this.serverOrigin = options?.serverOrigin || process.env.BACKEND_URL || `http://localhost:${port}`;
    this.storageDir = options?.storageDir || process.env.STORAGE_DIR || './storage';
  }

  /**
   * Resolves a relative or /storage/ URL to an absolute URL or local path.
   */
  public resolveAssetUrl(assetUrl?: string | null): string {
    if (!assetUrl) return '';
    if (assetUrl.startsWith('data:') || /^https?:\/\//i.test(assetUrl) || assetUrl.startsWith('file:')) {
      return assetUrl;
    }
    const cleanPath = assetUrl.startsWith('/') ? assetUrl : `/${assetUrl}`;
    return `${this.serverOrigin}${cleanPath}`;
  }

  /**
   * Resolves a storage path to a local absolute disk path.
   */
  public resolveLocalPath(urlPath: string): string {
    if (urlPath.startsWith('/storage/')) {
      return path.join(process.cwd(), urlPath.replace(/^\//, ''));
    }
    const match = urlPath.match(/\/storage\/(.+)$/);
    if (match) {
      return path.join(process.cwd(), this.storageDir, match[1]);
    }
    return path.resolve(urlPath);
  }

  /**
   * Converts a local image file into a base64 Data URI if it exists.
   */
  public convertLocalImageToDataUri(imagePathOrUrl?: string | null): string {
    if (!imagePathOrUrl) return '';
    if (imagePathOrUrl.startsWith('data:') || /^https?:\/\//i.test(imagePathOrUrl)) {
      return imagePathOrUrl;
    }
    const localPath = this.resolveLocalPath(imagePathOrUrl);
    if (fs.existsSync(localPath)) {
      try {
        const ext = path.extname(localPath).toLowerCase().replace('.', '') || 'png';
        const mimeType = ext === 'jpg' ? 'jpeg' : ext;
        const fileBuf = fs.readFileSync(localPath);
        return `data:image/${mimeType};base64,${fileBuf.toString('base64')}`;
      } catch (err) {
        console.warn(`[RemotionAdapter] Failed to convert ${localPath} to data URI:`, err);
      }
    }
    return this.resolveAssetUrl(imagePathOrUrl);
  }

  /**
   * Adapts story and scene database models into a validated Remotion Manifest (ManifestV2).
   */
  public async buildManifest(
    story: any,
    allScenes: any[],
    options: RemotionManifestAdapterOptions = {}
  ): Promise<RemotionManifest> {
    const {
      resolution = '720p',
      fps = 30,
      format = '16:9',
      backgroundMusic,
      musicVolume = 0.2,
      selectedSceneIds,
      embedBase64Images = true,
      templateId = 'kids-story',
      subtitleTheme,
    } = options;

    const normalizedFormat: AspectRatio =
      format === '9:16' || format === '1:1' || format === '4:5' ? format : '16:9';

    let scenes = allScenes;
    if (Array.isArray(selectedSceneIds) && selectedSceneIds.length > 0) {
      const filtered = allScenes.filter(
        (s) => selectedSceneIds.includes(s.sceneId) || selectedSceneIds.includes(s.id)
      );
      if (filtered.length > 0) {
        scenes = filtered;
      }
    }

    if (!scenes || scenes.length === 0) {
      throw new Error('Cannot build Remotion manifest: No scenes available');
    }

    const adaptedScenes: RemotionScene[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const sceneNum = scene.number || i + 1;
      const animData = scene.animationData || {};

      // 1. Duration calculation (matching VideoAssemblyService logic)
      let durationSec = 4;
      if (scene.endMs && scene.startMs && scene.endMs > scene.startMs) {
        durationSec = (scene.endMs - scene.startMs) / 1000;
      } else if (scene.estimatedDurationMs && scene.estimatedDurationMs > 0) {
        durationSec = scene.estimatedDurationMs / 1000;
      }

      if (scene.actualAudioDurationMs && scene.actualAudioDurationMs > 0) {
        const audioSec = scene.actualAudioDurationMs / 1000;
        if (audioSec > durationSec) {
          durationSec = audioSec;
        }
      }

      const rawDialogues = Array.isArray(animData.dialogueLines)
        ? animData.dialogueLines
        : (Array.isArray(animData.dialogues) ? animData.dialogues : []);

      for (const line of rawDialogues) {
        const lineEndSec = ((line.startMs || 0) + (line.durationMs || 0)) / 1000;
        if (lineEndSec > durationSec) {
          durationSec = lineEndSec;
        }
      }
      durationSec = Math.max(1.5, Math.min(120, durationSec));
      const durationMs = Math.round(durationSec * 1000);

      // 2. Background image resolution
      const isBgExplicitlyRemoved = Boolean(animData.background?.removed);
      let backgroundConfig: RemotionScene['background'] = undefined;

      if (isBgExplicitlyRemoved) {
        backgroundConfig = {
          imageUrl: '',
          fit: 'cover',
          removed: true,
        };
      } else {
        let rawBgUrl = animData.background?.imageUrl || scene.imageUrl;
        if (!rawBgUrl) {
          const images = await getImagesBySceneId(scene.sceneId || scene.id);
          if (images.length > 0 && images[0].imageUrl) {
            rawBgUrl = images[0].imageUrl;
          }
        }

        if (rawBgUrl) {
          const resolvedBg = embedBase64Images
            ? this.convertLocalImageToDataUri(rawBgUrl)
            : this.resolveAssetUrl(rawBgUrl);

          backgroundConfig = {
            imageUrl: resolvedBg,
            fit: animData.background?.fit || 'cover',
            removed: false,
          };
        }
      }

      // 3. Narration Audio resolution
      let narrationConfig: RemotionScene['narration'] = undefined;
      if (scene.audioUrl) {
        narrationConfig = {
          url: this.resolveAssetUrl(scene.audioUrl),
          durationMs: scene.actualAudioDurationMs || durationMs,
          volume: 1.0,
        };
      }

      // 4. Character Instances with self-contained rig embedding
      const rawInstances = animData.characterInstances || [];
      const adaptedInstances: RemotionScene['characterInstances'] = rawInstances.map((inst: any) => {
        const hasHeadTags = inst.customRig?.parts?.head?.shapes?.some(
          (s: any) => s.tag === 'eyes' || s.tag === 'mouth'
        );

        let rig: VectorRigDefinition;
        if (inst.customRig && hasHeadTags) {
          rig = inst.customRig;
        } else if (inst.appearance) {
          rig = buildRigFromAppearance(inst.characterId, inst.name || 'Character', inst.appearance);
        } else if (inst.customRig) {
          rig = inst.customRig;
        } else {
          rig = getVectorRig(inst.characterId);
        }

        return {
          instanceId: inst.instanceId,
          characterId: inst.characterId,
          name: inst.name,
          x: inst.x,
          y: inst.y,
          scale: inst.scale ?? 1.0,
          rotation: inst.rotation ?? 0,
          flipX: Boolean(inst.flipX),
          zIndex: inst.zIndex ?? 1,
          expression: inst.expression || 'neutral',
          customRig: rig,
        };
      });

      // 5. Animation Clips
      const adaptedClips = (animData.animationClips || []).map((clip: any) => ({
        clipId: clip.clipId,
        instanceId: clip.instanceId,
        action: clip.action || 'idle',
        startMs: clip.startMs || 0,
        durationMs: clip.durationMs || durationMs,
        loop: clip.loop ?? true,
        speedMultiplier: clip.speedMultiplier ?? 1.0,
        motionMode: clip.motionMode || 'in_place',
        motionPath: clip.motionPath,
      }));

      // 6. Expression Cues
      const adaptedExpCues = (animData.expressionCues || []).map((cue: any) => ({
        id: cue.id,
        instanceId: cue.instanceId || cue.characterInstanceId,
        characterInstanceId: cue.characterInstanceId || cue.instanceId,
        characterId: cue.characterId,
        expression: cue.expression || 'neutral',
        startMs: cue.startMs || 0,
        durationMs: cue.durationMs || 1000,
      }));

      // 7. Dialogue Lines with audio URL resolution
      const adaptedDialogues = rawDialogues.map((line: any) => ({
        id: line.id,
        characterName: line.characterName || 'Character',
        characterInstanceId: line.characterInstanceId,
        characterId: line.characterId,
        text: line.text || '',
        url: line.audioUrl ? this.resolveAssetUrl(line.audioUrl) : (line.url ? this.resolveAssetUrl(line.url) : undefined),
        audioUrl: line.audioUrl ? this.resolveAssetUrl(line.audioUrl) : undefined,
        startMs: line.startMs || 0,
        durationMs: line.durationMs || 2000,
        volume: typeof line.volume === 'number' ? Math.max(0, Math.min(1, line.volume)) : 1.0,
        facialExpression: line.facialExpression,
        emotion: line.emotion,
        speakingDirection: line.speakingDirection,
        visemeCues: line.visemeCues,
        wordTimings: Array.isArray(line.wordTimings) && line.wordTimings.length > 0
          ? line.wordTimings
          : estimateWordTimings(line.text || '', Math.max(250, line.durationMs || 2000)),
      }));

      // 8. Educational Overlays
      const adaptedOverlays = (animData.overlays || []).map((o: any) => ({
        id: o.id,
        type: o.type,
        x: o.x,
        y: o.y,
        scale: o.scale,
        rotation: o.rotation,
        color: o.color,
        label: o.label,
        endX: o.endX,
        endY: o.endY,
        radius: o.radius,
        startMs: o.startMs,
        durationMs: o.durationMs,
        layerDepth: o.layerPosition === 'below_characters' || (o.zIndex !== undefined && o.zIndex < 0)
          ? 'below_characters' as const
          : 'above_characters' as const,
      }));

      // 9. Camera settings
      const cameraMovement = animData.cameraMovement || scene.cameraMovement || 'static';
      const cameraRotation = animData.cameraRotation || 'none';
      const cameraRotationDegrees = animData.cameraRotationDegrees ?? 10;

      adaptedScenes.push({
        id: scene.sceneId || scene.id || `scene-${sceneNum}`,
        sceneNumber: sceneNum,
        durationMs,
        title: scene.title || `Scene ${sceneNum}`,
        caption: scene.narration || scene.caption || '',
        background: backgroundConfig,
        cameraMovement,
        cameraRotation,
        cameraRotationDegrees,
        narration: narrationConfig,
        dialogues: adaptedDialogues,
        characterInstances: adaptedInstances,
        animationClips: adaptedClips,
        expressionCues: adaptedExpCues,
        overlays: adaptedOverlays,
        formatVariants: animData.formatVariants,
      });
    }

    // Resolve background music URL if present
    let resolvedBgm: string | undefined = undefined;
    if (backgroundMusic && backgroundMusic !== 'none') {
      if (backgroundMusic.startsWith('/storage/')) {
        resolvedBgm = this.resolveAssetUrl(backgroundMusic);
      } else if (fs.existsSync(backgroundMusic)) {
        resolvedBgm = backgroundMusic;
      } else {
        const candidate = path.join(process.cwd(), this.storageDir, 'music', `${backgroundMusic}.mp3`);
        if (fs.existsSync(candidate)) {
          resolvedBgm = this.resolveAssetUrl(`/storage/music/${backgroundMusic}.mp3`);
        } else {
          resolvedBgm = this.resolveAssetUrl(backgroundMusic);
        }
      }
    }

    return {
      version: '2.0.0',
      storyId: story.storyId || story.id || 'story',
      storyTitle: story.title || 'Untitled Story',
      fps,
      resolution,
      format: normalizedFormat,
      backgroundMusic: resolvedBgm,
      musicVolume,
      templateId,
      subtitleTheme,
      scenes: adaptedScenes,
    };
  }
}
