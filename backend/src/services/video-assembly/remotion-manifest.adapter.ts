import fs from 'fs';
import path from 'path';
import { getImagesBySceneId, getShotsBySceneId } from '../database/database.service.js';
import { getVectorRig, VectorRigDefinition } from '../animation/templates/default-characters.js';
import { buildRigFromAppearance } from '../animation/templates/custom-character-rig.js';
import { BrandingService } from '../branding/branding.service.js';
import { ChannelBrandingConfig } from '../branding/branding.types.js';

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5';

export interface AudioSegment {
  speakerId: string;
  speakerType: 'narrator' | 'character';
  text: string;
  audioSrc: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  volume: number;
  language?: string;
  priority?: number;
  wordTimings?: Array<{ text: string; startMs: number; endMs: number }>;
}

export interface AudioTimelineValidationResult {
  valid: boolean;
  overlaps: Array<{
    sceneId: string;
    sceneNumber: number;
    speaker1: string;
    speaker2: string;
    range: string;
    overlapMs: number;
  }>;
}

export function validateAudioTimeline(scenes: RemotionScene[]): AudioTimelineValidationResult {
  const overlaps: AudioTimelineValidationResult['overlaps'] = [];

  for (const sc of scenes) {
    const segments = sc.audioSchedule || [];
    for (let i = 0; i < segments.length; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        const a = segments[i];
        const b = segments[j];
        const overlapStart = Math.max(a.startMs, b.startMs);
        const overlapEnd = Math.min(a.endMs, b.endMs);
        const overlapMs = overlapEnd - overlapStart;

        // Flags unexpected voice overlaps greater than 50ms
        if (overlapMs > 50) {
          overlaps.push({
            sceneId: sc.id,
            sceneNumber: sc.sceneNumber,
            speaker1: a.speakerId,
            speaker2: b.speakerId,
            range: `${overlapStart}ms - ${overlapEnd}ms`,
            overlapMs,
          });
        }
      }
    }
  }

  return {
    valid: overlaps.length === 0,
    overlaps,
  };
}

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
  embedBase64Audio?: boolean;
  templateId?: string;
  subtitleTheme?: 'classic' | 'karaoke' | 'speech-bubble' | 'minimal';
  branding?: ChannelBrandingConfig;
  excludeMusicFromRemotion?: boolean;
  excludeSilentAudio?: boolean;
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
  silentAudioSrc?: string;
  templateId?: string;
  subtitleTheme?: 'classic' | 'karaoke' | 'speech-bubble' | 'minimal';
  branding?: ChannelBrandingConfig;
  scenes: RemotionScene[];
}

export interface RemotionScene {
  id: string;
  sceneNumber: number;
  durationMs: number;
  title?: string;
  caption?: string;
  shotType?: string;
  shots?: Array<{
    id: string;
    shotNumber: number;
    durationMs: number;
    shotType?: string;
    cameraMovement?: string;
    cameraAngle?: string;
    backgroundUrl?: string;
    videoUrl?: string;
    startMs: number;
    endMs: number;
    transition?: {
      type?: string;
      durationMs?: number;
    };
    characterPlacements?: any[];
  }>;
  background?: {
    imageUrl?: string;
    fit?: 'cover' | 'contain' | 'fill';
    removed?: boolean;
    inheritedFromScene?: number;
  };
  cameraMovement?: string;
  cameraRotation?: string;
  cameraRotationDegrees?: number;
  narration?: {
    url: string;
    startMs?: number;
    durationMs?: number;
    volume?: number;
    text?: string;
    wordTimings?: Array<{ text: string; startMs: number; endMs: number }>;
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
    allowSimultaneous?: boolean;
  }>;
  audioSchedule?: AudioSegment[];
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
    type: string;
    x?: number;
    y?: number;
    scale?: number;
    rotation?: number;
    color?: string;
    fillColor?: string;
    textColor?: string;
    strokeWidth?: number;
    fontSize?: number;
    label?: string;
    title?: string;
    endX?: number;
    endY?: number;
    targetX?: number;
    targetY?: number;
    radius?: number;
    radiusX?: number;
    radiusY?: number;
    width?: number;
    height?: number;
    icon?: string;
    style?: string;
    animationStyle?: string;
    hasConnectorLine?: boolean;
    pulseSpeedMs?: number;
    progressDurationMs?: number;
    pathD?: string;
    startMs?: number;
    durationMs?: number;
    layerDepth?: 'below_characters' | 'above_characters';
  }>;
  formatVariants?: Record<string, any>;
  transition?: {
    type?: 'cut' | 'fade';
    durationMs?: number;
  };
}

function estimateWordTimings(text: string, durationMs: number) {
  const tokens = text.match(/\S+/gu) || [];
  if (tokens.length === 0) return [];
  // Proportional timing is an explicitly documented fallback, not forced alignment.
  // Longer words receive slightly more time; punctuation adds a small pause to improve readability.
  // Handles both Hindi (Devanagari letters + marks) and English words.
  const weights = tokens.map((token) => {
    const letters = Math.max(1, token.replace(/[^\p{L}\p{M}\p{N}]/gu, '').length);
    const pause = /[.!?।॥,:;]$/.test(token) ? 0.2 : 0;
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
    if (!urlPath) return '';
    if (urlPath.startsWith('/storage/')) {
      return path.resolve(process.cwd(), this.storageDir, urlPath.replace(/^\/storage\//, ''));
    }
    if (urlPath.startsWith('storage/')) {
      return path.resolve(process.cwd(), this.storageDir, urlPath.replace(/^storage\//, ''));
    }
    const match = urlPath.match(/\/storage\/(.+)$/);
    if (match) {
      return path.resolve(process.cwd(), this.storageDir, match[1]);
    }
    return path.resolve(urlPath);
  }

  /**
   * Converts a local image file into a base64 Data URI if it exists.
   */
  public convertLocalImageToDataUri(imagePathOrUrl?: string | null): string {
    if (!imagePathOrUrl) return '';
    if (imagePathOrUrl.startsWith('data:')) {
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
   * Converts a local audio file into a base64 Data URI if it exists,
   * allowing offline Remotion rendering without depending on a running HTTP server.
   */
  public convertLocalAudioToDataUri(audioPathOrUrl?: string | null): string {
    if (!audioPathOrUrl) return '';
    if (audioPathOrUrl.startsWith('data:')) {
      return audioPathOrUrl;
    }
    const localPath = this.resolveLocalPath(audioPathOrUrl);
    if (fs.existsSync(localPath)) {
      try {
        const ext = path.extname(localPath).toLowerCase().replace('.', '') || 'wav';
        const mimeType = ext === 'mp3' ? 'mpeg' : (ext === 'ogg' ? 'ogg' : 'wav');
        const fileBuf = fs.readFileSync(localPath);
        return `data:audio/${mimeType};base64,${fileBuf.toString('base64')}`;
      } catch (err) {
        console.warn(`[RemotionAdapter] Failed to convert audio ${localPath} to data URI:`, err);
      }
    }
    return this.resolveAssetUrl(audioPathOrUrl);
  }

  /**
   * Resolves background music into a browser-accessible URL without exposing raw local disk paths.
   */
  public resolveMusicUrl(musicSource?: string | null): string | undefined {
    if (!musicSource || musicSource === 'none') return undefined;

    // Direct HTTP(S) or data URL
    if (musicSource.startsWith('data:') || /^https?:\/\//i.test(musicSource)) {
      return musicSource;
    }

    // Direct /storage/ path
    if (musicSource.startsWith('/storage/')) {
      return this.resolveAssetUrl(musicSource);
    }
    if (musicSource.startsWith('storage/')) {
      return this.resolveAssetUrl(`/${musicSource}`);
    }

    const absStorageDir = path.resolve(process.cwd(), this.storageDir);

    // Named track without extension e.g. "playful"
    const candidates = [
      path.join(absStorageDir, 'music', `${musicSource}.mp3`),
      path.join(absStorageDir, 'music', `${musicSource}.wav`),
      path.join(absStorageDir, 'music', musicSource),
    ];
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        const relToStorage = path.relative(absStorageDir, cand).replace(/\\/g, '/');
        return this.resolveAssetUrl(`/storage/${relToStorage}`);
      }
    }

    // If it's a local filesystem path within storageDir
    const absPath = path.resolve(musicSource);
    if (absPath.startsWith(absStorageDir) && fs.existsSync(absPath)) {
      const relToStorage = path.relative(absStorageDir, absPath).replace(/\\/g, '/');
      return this.resolveAssetUrl(`/storage/${relToStorage}`);
    }

    // If file exists locally outside storageDir, copy it to storage/music
    if (fs.existsSync(absPath)) {
      try {
        const musicStorageDir = path.join(absStorageDir, 'music');
        if (!fs.existsSync(musicStorageDir)) fs.mkdirSync(musicStorageDir, { recursive: true });
        const ext = path.extname(absPath) || '.mp3';
        const targetFilename = `imported-bgm-${path.basename(absPath, ext)}${ext}`;
        const targetPath = path.join(musicStorageDir, targetFilename);
        if (!fs.existsSync(targetPath)) {
          fs.copyFileSync(absPath, targetPath);
        }
        return this.resolveAssetUrl(`/storage/music/${targetFilename}`);
      } catch (err) {
        console.warn(`[RemotionAdapter] Could not copy local music to storage:`, err);
      }
    }

    // Avoid exposing raw filesystem paths to the browser
    if (/^[a-zA-Z]:[\\/]/.test(musicSource) || musicSource.startsWith('/')) {
      console.warn(`[RemotionAdapter] Inaccessible music path: ${musicSource}`);
      return undefined;
    }

    return this.resolveAssetUrl(`/storage/music/${musicSource}`);
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
      embedBase64Audio = false,
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

    // Resolve Channel Branding Configuration
    const brandingService = new BrandingService({ storageDir: this.storageDir });
    const rawBranding = options.branding || (story?.storyId ? await brandingService.getBrandingConfig(story.storyId) : undefined);
    let resolvedBranding: ChannelBrandingConfig | undefined = undefined;
    if (rawBranding && rawBranding.enabled && rawBranding.logoUrl) {
      resolvedBranding = {
        ...rawBranding,
        logoUrl: embedBase64Images
          ? this.convertLocalImageToDataUri(rawBranding.logoUrl)
          : this.resolveAssetUrl(rawBranding.logoUrl),
        secondaryLogoUrl: rawBranding.secondaryLogoUrl
          ? (embedBase64Images ? this.convertLocalImageToDataUri(rawBranding.secondaryLogoUrl) : this.resolveAssetUrl(rawBranding.secondaryLogoUrl))
          : undefined,
        subscribeBadgeUrl: rawBranding.subscribeBadgeUrl
          ? (embedBase64Images ? this.convertLocalImageToDataUri(rawBranding.subscribeBadgeUrl) : this.resolveAssetUrl(rawBranding.subscribeBadgeUrl))
          : undefined,
      };
    }

    const adaptedScenes: RemotionScene[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const sceneNum = scene.number || i + 1;
      const animData = scene.animationData || {};

      // 1. Background image resolution with Story Continuity Fallback
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
          try {
            const images = await getImagesBySceneId(scene.sceneId || scene.id);
            if (images && images.length > 0 && images[0].imageUrl) {
              rawBgUrl = images[0].imageUrl;
            }
          } catch {
            // DB image query unavailable in offline or standalone test environment
          }
        }

        // Story Continuity Fallback:
        // If this scene has no background image, inherit from the nearest preceding scene in the story
        let inheritedFromSceneNum: number | undefined = undefined;
        if (!rawBgUrl) {
          for (let p = i - 1; p >= 0; p--) {
            const prevScene = scenes[p];
            const prevAnim = prevScene.animationData || {};
            if (prevAnim.background?.removed) continue;
            let candidateBg = prevAnim.background?.imageUrl || prevScene.imageUrl;
            if (!candidateBg) {
              try {
                const prevImages = await getImagesBySceneId(prevScene.sceneId || prevScene.id);
                if (prevImages && prevImages.length > 0 && prevImages[0].imageUrl) {
                  candidateBg = prevImages[0].imageUrl;
                }
              } catch {
                // DB image query unavailable
              }
            }
            if (candidateBg) {
              rawBgUrl = candidateBg;
              inheritedFromSceneNum = prevScene.number || p + 1;
              break;
            }
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
            inheritedFromScene: inheritedFromSceneNum,
          };
        }
      }

      // 1b. Multi-shot cinematic breakdown adaptation (if present on scene or in database)
      let rawShots = Array.isArray(scene.shots) ? scene.shots : [];
      if (rawShots.length === 0) {
        try {
          rawShots = await getShotsBySceneId(scene.sceneId || scene.id);
        } catch {
          // DB query unavailable in offline test environments
        }
      }

      let adaptedShots: RemotionScene['shots'] = undefined;
      if (rawShots.length > 0) {
        let shotCursorMs = 0;
        adaptedShots = rawShots.map((st: any, sIdx: number) => {
          const sDur = st.durationMs || 5000;
          const sStart = typeof st.startMs === 'number' ? st.startMs : shotCursorMs;
          const sEnd = typeof st.endMs === 'number' ? st.endMs : sStart + sDur;
          shotCursorMs = sEnd;

          let shotBg = st.backgroundUrl;
          if (shotBg && embedBase64Images) {
            shotBg = this.convertLocalImageToDataUri(shotBg);
          } else if (shotBg) {
            shotBg = this.resolveAssetUrl(shotBg);
          }

          const rawCharPlacements = (st.characterInstructions as any)?.placements || st.characterPlacements;
          const charPlacements = Array.isArray(rawCharPlacements)
            ? rawCharPlacements.map((cp: any) => {
                const charType = cp.characterType || (cp.imageUrl ? 'raster' : 'vector');
                let cpImg = cp.imageUrl;
                let cpViews = cp.directionalViews;
                if (embedBase64Images && cpImg) {
                  cpImg = this.convertLocalImageToDataUri(cpImg);
                }
                if (embedBase64Images && cpViews) {
                  const converted: Record<string, string> = {};
                  for (const [dir, u] of Object.entries(cpViews)) {
                    converted[dir] = this.convertLocalImageToDataUri(u as string);
                  }
                  cpViews = converted;
                }
                return {
                  instanceId: cp.instanceId,
                  characterId: cp.characterId,
                  characterType: charType,
                  imageUrl: cpImg,
                  directionalViews: cpViews,
                  name: cp.name,
                  x: cp.x,
                  y: cp.y,
                  scale: cp.scale,
                  rotation: typeof cp.rotation === 'number' ? cp.rotation : 0,
                  flipX: Boolean(cp.flipX),
                  facingDirection: cp.facingDirection || 'front',
                  action: cp.action,
                  expression: cp.expression,
                  zIndex: cp.zIndex,
                  isSpeaker: Boolean(cp.isSpeaker),
                };
              })
            : undefined;

          const shotTransition = (st as any).transition ||
            (st.shotDirection as any)?.transition ||
            ((st as any).transitionType ? { type: (st as any).transitionType, durationMs: (st as any).transitionDurationMs || 500 } : undefined);

          return {
            id: st.shotId || st.id || `shot-${sceneNum}-${sIdx + 1}`,
            shotNumber: st.number || sIdx + 1,
            durationMs: sDur,
            shotType: st.shotType,
            cameraMovement: st.cameraMovement,
            cameraAngle: st.cameraAngle,
            backgroundUrl: shotBg,
            videoUrl: st.videoUrl ? this.resolveAssetUrl(st.videoUrl) : undefined,
            startMs: sStart,
            endMs: sEnd,
            transition: shotTransition,
            characterPlacements: charPlacements,
          };
        });
      }

      // 2. Audio Scheduling & Overlap Prevention Model
      const INITIAL_PAUSE_MS = 250;
      const SPEECH_TURN_GAP_MS = 380;
      const SCENE_END_BUFFER_MS = 500;

      let narrationConfig: RemotionScene['narration'] = undefined;
      let narrationDurationMs = 0;
      let narrStartMs = 0;
      let narrEndMs = 0;

      if (scene.audioUrl) {
        const resolvedNarrationAudio = embedBase64Audio
          ? this.convertLocalAudioToDataUri(scene.audioUrl)
          : this.resolveAssetUrl(scene.audioUrl);

        narrationDurationMs = scene.actualAudioDurationMs && scene.actualAudioDurationMs > 0
          ? scene.actualAudioDurationMs
          : (scene.narration ? Math.max(1500, Math.round(scene.narration.length * 75)) : 2500);

        narrStartMs = typeof scene.narrationStartMs === 'number' ? scene.narrationStartMs : INITIAL_PAUSE_MS;
        narrEndMs = narrStartMs + narrationDurationMs;

        narrationConfig = {
          url: resolvedNarrationAudio,
          startMs: narrStartMs,
          durationMs: narrationDurationMs,
          volume: 1.0,
          text: scene.narration,
          wordTimings: scene.narration ? estimateWordTimings(scene.narration, narrationDurationMs) : undefined,
        };
      }

      // Schedule dialogue lines sequentially after narration (or from INITIAL_PAUSE_MS if no narration)
      let currentAudioCursorMs = narrEndMs > 0 ? narrEndMs + SPEECH_TURN_GAP_MS : INITIAL_PAUSE_MS;
      const rawDialogues = Array.isArray(animData.dialogueLines)
        ? animData.dialogueLines
        : (Array.isArray(animData.dialogues) ? animData.dialogues : []);

      const adaptedDialogues: NonNullable<RemotionScene['dialogues']> = [];
      const audioSchedule: AudioSegment[] = [];

      if (narrationConfig) {
        audioSchedule.push({
          speakerId: 'narrator',
          speakerType: 'narrator',
          text: scene.narration || '',
          audioSrc: narrationConfig.url,
          startMs: narrStartMs,
          endMs: narrEndMs,
          durationMs: narrationDurationMs,
          volume: 1.0,
          language: story.targetLanguage || 'hi',
          priority: 10,
          wordTimings: narrationConfig.wordTimings,
        });
      }

      for (let dIdx = 0; dIdx < rawDialogues.length; dIdx++) {
        const line = rawDialogues[dIdx];
        const rawAudio = line.audioUrl || line.url;
        const resolvedAudio = rawAudio
          ? (embedBase64Audio ? this.convertLocalAudioToDataUri(rawAudio) : this.resolveAssetUrl(rawAudio))
          : undefined;

        const lineDurationMs = line.durationMs && line.durationMs > 0
          ? line.durationMs
          : (line.text ? Math.max(1200, Math.round(line.text.length * 70)) : 2000);

        let lineStartMs: number;
        if (line.allowSimultaneous) {
          lineStartMs = typeof line.startMs === 'number' ? line.startMs : currentAudioCursorMs;
        } else {
          if (typeof line.startMs === 'number' && line.startMs >= currentAudioCursorMs) {
            lineStartMs = line.startMs;
          } else {
            lineStartMs = currentAudioCursorMs;
          }
        }

        const lineEndMs = lineStartMs + lineDurationMs;
        currentAudioCursorMs = Math.max(currentAudioCursorMs, lineEndMs + SPEECH_TURN_GAP_MS);

        const adaptedLine = {
          id: line.id || `dlg-${sceneNum}-${dIdx + 1}`,
          characterName: line.characterName || 'Character',
          characterInstanceId: line.characterInstanceId,
          characterId: line.characterId,
          text: line.text || '',
          url: resolvedAudio,
          audioUrl: resolvedAudio,
          startMs: lineStartMs,
          durationMs: lineDurationMs,
          volume: typeof line.volume === 'number' ? Math.max(0, Math.min(1, line.volume)) : 1.0,
          facialExpression: line.facialExpression,
          emotion: line.emotion,
          speakingDirection: line.speakingDirection,
          visemeCues: line.visemeCues,
          wordTimings: Array.isArray(line.wordTimings) && line.wordTimings.length > 0
            ? line.wordTimings
            : estimateWordTimings(line.text || '', lineDurationMs),
          allowSimultaneous: Boolean(line.allowSimultaneous),
        };

        adaptedDialogues.push(adaptedLine);

        if (resolvedAudio) {
          audioSchedule.push({
            speakerId: adaptedLine.characterId || adaptedLine.characterInstanceId || adaptedLine.characterName,
            speakerType: 'character',
            text: adaptedLine.text,
            audioSrc: resolvedAudio,
            startMs: lineStartMs,
            endMs: lineEndMs,
            durationMs: lineDurationMs,
            volume: adaptedLine.volume,
            language: story.targetLanguage || 'hi',
            priority: 5,
            wordTimings: adaptedLine.wordTimings,
          });
        }
      }

      // Compute final scene duration (ensures audio is never truncated)
      let durationSec = 4;
      if (scene.endMs && scene.startMs && scene.endMs > scene.startMs) {
        durationSec = (scene.endMs - scene.startMs) / 1000;
      } else if (scene.estimatedDurationMs && scene.estimatedDurationMs > 0) {
        durationSec = scene.estimatedDurationMs / 1000;
      }

      const totalAudioEndMs = Math.max(
        narrEndMs,
        adaptedDialogues.reduce((max, d) => Math.max(max, d.startMs + d.durationMs), 0)
      );

      const requiredAudioDurationSec = totalAudioEndMs > 0
        ? (totalAudioEndMs + SCENE_END_BUFFER_MS) / 1000
        : 0;

      durationSec = Math.max(durationSec, requiredAudioDurationSec, 2.0);
      durationSec = Math.min(120, durationSec);
      const durationMs = Math.round(durationSec * 1000);

      // 3. Character Instances with storybook staging heuristics
      const rawInstances = animData.characterInstances || scene.characterInstances || (scene as any).characters || [];
      const adaptedInstances: RemotionScene['characterInstances'] = rawInstances.map((inst: any, instIdx: number) => {
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

        // Two-character conversational staging heuristic:
        // When two characters are in the scene and positioned left & right,
        // ensure character on the right faces left toward character on the left.
        let flipX = Boolean(inst.flipX);
        if (rawInstances.length === 2 && inst.flipX === undefined) {
          const other = rawInstances[1 - instIdx];
          if (other && inst.x > other.x) {
            flipX = true;
          }
        }

        const charType = inst.characterType || (inst.imageUrl ? 'raster' : 'vector');
        let imgUrl = inst.imageUrl;
        let directionalViews = inst.directionalViews;
        if (embedBase64Images && imgUrl) {
          imgUrl = this.convertLocalImageToDataUri(imgUrl);
        }
        if (embedBase64Images && directionalViews) {
          const convertedViews: Record<string, string> = {};
          for (const [dir, vUrl] of Object.entries(directionalViews)) {
            convertedViews[dir] = this.convertLocalImageToDataUri(vUrl as string);
          }
          directionalViews = convertedViews;
        }

        return {
          instanceId: inst.instanceId,
          characterId: inst.characterId,
          characterType: charType,
          imageUrl: imgUrl,
          directionalViews,
          name: inst.name,
          x: inst.x,
          y: inst.y,
          scale: inst.scale ?? 1.0,
          rotation: inst.rotation ?? 0,
          flipX,
          facingDirection: inst.facingDirection || 'front',
          zIndex: inst.zIndex ?? (instIdx + 1),
          expression: inst.expression || 'neutral',
          isSpeaker: Boolean(inst.isSpeaker),
          customRig: rig,
        };
      });

      // 5. Animation Clips
      const adaptedClips = (animData.animationClips || scene.animationClips || []).map((clip: any) => ({
        clipId: clip.clipId,
        instanceId: clip.instanceId,
        action: clip.action || 'idle',
        facingDirection: clip.facingDirection,
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

      // 7. Educational Overlays
      const adaptedOverlays = (animData.overlays || []).map((o: any) => ({
        id: o.id,
        type: o.type,
        x: o.x ?? 640,
        y: o.y ?? 360,
        scale: o.scale ?? 1,
        rotation: o.rotation ?? 0,
        color: o.color,
        fillColor: o.fillColor,
        textColor: o.textColor,
        strokeWidth: o.strokeWidth,
        fontSize: o.fontSize,
        label: o.label,
        title: o.title,
        endX: o.endX ?? o.targetX,
        endY: o.endY ?? o.targetY,
        targetX: o.targetX ?? o.endX,
        targetY: o.targetY ?? o.endY,
        radius: o.radius,
        radiusX: o.radiusX,
        radiusY: o.radiusY,
        width: o.width,
        height: o.height,
        icon: o.icon,
        style: o.style,
        animationStyle: o.animationStyle,
        hasConnectorLine: o.hasConnectorLine,
        pulseSpeedMs: o.pulseSpeedMs,
        progressDurationMs: o.progressDurationMs,
        pathD: o.pathD,
        startMs: o.startMs ?? 0,
        durationMs: o.durationMs ?? durationMs,
        layerDepth: (o.layerDepth === 'below_characters' || o.layerPosition === 'below_characters' || (o.zIndex !== undefined && o.zIndex < 0))
          ? 'below_characters' as const
          : 'above_characters' as const,
      }));

      // 8. Camera settings & transitions
      const cameraMovement = animData.cameraMovement || scene.cameraMovement || 'static';
      const cameraRotation = animData.cameraRotation || 'none';
      const cameraRotationDegrees = animData.cameraRotationDegrees ?? 10;
      const transition = animData.transition || scene.transition || { type: 'fade', durationMs: 200 };

      adaptedScenes.push({
        id: scene.sceneId || scene.id || `scene-${sceneNum}`,
        sceneNumber: sceneNum,
        durationMs,
        title: scene.title || `Scene ${sceneNum}`,
        caption: scene.caption || '',
        shotType: scene.shotType || animData.shotType || 'wide_establishing',
        shots: adaptedShots,
        background: backgroundConfig,
        cameraMovement,
        cameraRotation,
        cameraRotationDegrees,
        narration: narrationConfig,
        dialogues: adaptedDialogues,
        audioSchedule,
        characterInstances: adaptedInstances,
        animationClips: adaptedClips,
        expressionCues: adaptedExpCues,
        overlays: adaptedOverlays,
        formatVariants: animData.formatVariants || scene.formatVariants,
        transition,
      });
    }

    // Resolve background music URL if present (unless excluded for audio mastering ducking stage)
    const resolvedBgm = options.excludeMusicFromRemotion
      ? undefined
      : this.resolveMusicUrl(backgroundMusic);

    return {
      version: '2.0.0',
      storyId: story.storyId || story.id || 'story',
      storyTitle: story.title || 'Untitled Story',
      fps,
      resolution,
      format: normalizedFormat,
      backgroundMusic: resolvedBgm,
      musicVolume,
      silentAudioSrc: options.excludeSilentAudio ? undefined : 'silent.wav',
      templateId,
      subtitleTheme,
      branding: resolvedBranding,
      scenes: adaptedScenes,
    };
  }
}
