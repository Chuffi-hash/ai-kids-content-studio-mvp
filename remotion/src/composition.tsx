import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Composition,
  Img,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Video,
} from 'remotion';
import {
  AspectRatio,
  dimensions,
  frames,
  Scene,
  VideoManifest,
} from './manifest';
import { evaluateCharacterPose } from './characters/animation-evaluator';
import { getVectorRig } from './characters/rigs';
import { VectorCharacter } from './characters/VectorCharacter';
import { EducationalOverlayRenderer } from './overlays/EducationalOverlay';
import { getVideoTemplate, SubtitleTheme, VideoTemplate } from './templates';

const defaultManifest: VideoManifest = {
  fps: 30,
  resolution: '720p',
  format: '16:9',
  scenes: [
    {
      id: 'default-intro',
      durationMs: 3000,
      title: 'AI Kids Content Studio',
      caption: 'Remotion Production Renderer',
    },
  ],
};

/**
 * Computes deterministic 2D camera transform for pan, tilt, zoom, and 2D roll rotation.
 */
function computeCameraTransform(opts: {
  movement?: string;
  rotation?: string;
  rotationDegrees?: number;
  progress: number;
  width: number;
  height: number;
}) {
  const {
    movement = 'static',
    rotation = 'none',
    rotationDegrees = 10,
    progress: t,
    width,
    height,
  } = opts;

  const moveStr = movement.toLowerCase().trim();
  const rotStr = rotation.toLowerCase().trim();

  let scale = 1.0;
  let dx = 0;
  let dy = 0;
  let rotationDeg = 0;

  // Zoom, pan, tilt
  if (moveStr.includes('zoom in') || moveStr === 'zoom-in' || moveStr === 'slow zoom in') {
    scale = 1.0 + 0.15 * t;
  } else if (moveStr.includes('zoom out') || moveStr === 'zoom-out' || moveStr === 'slow zoom out') {
    scale = 1.15 - 0.15 * t;
  } else if (moveStr.includes('pan left') || moveStr === 'pan-left') {
    scale = 1.12;
    dx = (t - 0.5) * (width * 0.08);
  } else if (moveStr.includes('pan right') || moveStr === 'pan-right') {
    scale = 1.12;
    dx = (0.5 - t) * (width * 0.08);
  } else if (moveStr.includes('tilt up') || moveStr === 'tilt-up') {
    scale = 1.12;
    dy = (t - 0.5) * (height * 0.08);
  } else if (moveStr.includes('tilt down') || moveStr === 'tilt-down') {
    scale = 1.12;
    dy = (0.5 - t) * (height * 0.08);
  }

  // 2D Roll Rotation
  const degAmount = Math.max(0, Math.min(45, rotationDegrees));
  const isClockwise = rotStr.includes('clockwise') && !rotStr.includes('anti') && !rotStr.includes('counter');
  const isAnticlockwise = rotStr.includes('anti') || rotStr.includes('counter');

  if (isClockwise) {
    rotationDeg = t * degAmount;
  } else if (isAnticlockwise) {
    rotationDeg = -t * degAmount;
  }

  return { scale, dx, dy, rotationDeg };
}

interface SubtitleWordItem {
  text: string;
  startMs?: number;
  endMs?: number;
  originalIndex: number;
}

interface DisplaySubtitleChunk {
  words?: SubtitleWordItem[];
  text?: string;
}

/**
 * Breaks long subtitle paragraphs into digestible 1-2 line sentence/phrase chunks
 * that naturally sync with dialogue/narration timing instead of flooding the video canvas.
 */
function getSubtitleDisplayChunk(opts: {
  text: string;
  wordTimings?: Array<{ text: string; startMs: number; endMs: number }>;
  relativeMs: number;
  totalDurationMs: number;
  activeWordIndex: number;
}): DisplaySubtitleChunk {
  const { text, wordTimings, relativeMs, totalDurationMs, activeWordIndex } = opts;

  if (totalDurationMs > 0 && relativeMs > totalDurationMs + 250) {
    return { text: '' };
  }

  // Case 1: Word-level timings available
  if (wordTimings && wordTimings.length > 0) {
    const chunks: Array<Array<SubtitleWordItem>> = [];
    let currentChunk: Array<SubtitleWordItem> = [];

    for (let i = 0; i < wordTimings.length; i++) {
      const item = wordTimings[i];
      currentChunk.push({
        text: item.text,
        startMs: item.startMs,
        endMs: item.endMs,
        originalIndex: i,
      });

      const isTerminalPunct = /[.!?।॥]$/.test(item.text);
      const isSoftPunct = /[,:;]$/.test(item.text);
      const isChunkFull = currentChunk.length >= 9;
      const isNaturalSplit = isTerminalPunct || (isSoftPunct && currentChunk.length >= 5);

      if ((isNaturalSplit || isChunkFull || i === wordTimings.length - 1) && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
      }
    }

    if (chunks.length === 0) {
      return { text };
    }

    let activeChunk = chunks.find((c) => {
      const start = c[0].startMs ?? 0;
      const end = c[c.length - 1].endMs ?? start + 1000;
      return relativeMs >= start && relativeMs <= end;
    });

    if (!activeChunk && activeWordIndex >= 0) {
      activeChunk = chunks.find((c) => c.some((w) => w.originalIndex === activeWordIndex));
    }

    if (!activeChunk) {
      return { text: '' };
    }

    return { words: activeChunk };
  }

  // Case 2: Plain text string without word-level timings
  const tokens = text.match(/\S+/gu) || [];
  if (tokens.length === 0) {
    return { text: '' };
  }

  const textChunks: string[][] = [];
  let currentTokens: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    currentTokens.push(tok);
    const isTerminalPunct = /[.!?।॥]$/.test(tok);
    const isSoftPunct = /[,:;]$/.test(tok);
    const isFull = currentTokens.length >= 9;
    if ((isTerminalPunct || (isSoftPunct && currentTokens.length >= 5) || isFull || i === tokens.length - 1) && currentTokens.length > 0) {
      textChunks.push(currentTokens);
      currentTokens = [];
    }
  }

  if (textChunks.length <= 1) {
    return { text };
  }

  const progress = Math.max(0, Math.min(1, relativeMs / Math.max(1, totalDurationMs)));
  const chunkIdx = Math.min(textChunks.length - 1, Math.floor(progress * textChunks.length));
  return {
    text: textChunks[chunkIdx].join(' '),
  };
}

/**
 * Renders an intentional, vibrant storybook scenic backdrop (sky, sun, soft hills, grass, flowers)
 * ensuring that missing scene images never degrade into a dark void.
 */
function StorybookScenicBackdrop({
  width,
  height,
  sceneNumber = 1,
}: {
  width: number;
  height: number;
  sceneNumber?: number;
}) {
  const palettes = [
    {
      skyTop: '#60a5fa',
      skyBottom: '#fef08a',
      hillBack: '#86efac',
      hillFront: '#4ade80',
      sunColor: '#fde047',
      sunGlow: '#fef08a',
    },
    {
      skyTop: '#38bdf8',
      skyBottom: '#fed7aa',
      hillBack: '#6ee7b7',
      hillFront: '#22c55e',
      sunColor: '#fbbf24',
      sunGlow: '#fde68a',
    },
    {
      skyTop: '#818cf8',
      skyBottom: '#fbcfe8',
      hillBack: '#a7f3d0',
      hillFront: '#16a34a',
      sunColor: '#f59e0b',
      sunGlow: '#fed7aa',
    },
  ];
  const p = palettes[(sceneNumber - 1) % palettes.length];
  const groundY = Math.round(height * 0.72);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: 'absolute', top: 0, left: 0 }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`skyGrad-${sceneNumber}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.skyTop} />
          <stop offset="65%" stopColor={p.skyBottom} />
          <stop offset="100%" stopColor="#d9f99d" />
        </linearGradient>
        <radialGradient id={`sunGlow-${sceneNumber}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={p.sunGlow} stopOpacity="0.8" />
          <stop offset="40%" stopColor={p.sunColor} stopOpacity="0.4" />
          <stop offset="100%" stopColor={p.sunColor} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`hillBackGrad-${sceneNumber}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.hillBack} />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>
        <linearGradient id={`groundGrad-${sceneNumber}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.hillFront} />
          <stop offset="100%" stopColor="#166534" />
        </linearGradient>
      </defs>

      <rect width={width} height={height} fill={`url(#skyGrad-${sceneNumber})`} />

      <circle
        cx={Math.round(width * 0.82)}
        cy={Math.round(height * 0.22)}
        r={Math.round(Math.min(width, height) * 0.18)}
        fill={`url(#sunGlow-${sceneNumber})`}
      />
      <circle
        cx={Math.round(width * 0.82)}
        cy={Math.round(height * 0.22)}
        r={Math.round(Math.min(width, height) * 0.08)}
        fill={p.sunColor}
        opacity={0.95}
      />

      <g opacity={0.75} fill="#ffffff">
        <ellipse
          cx={Math.round(width * 0.25)}
          cy={Math.round(height * 0.20)}
          rx={Math.round(width * 0.09)}
          ry={Math.round(height * 0.045)}
        />
        <ellipse
          cx={Math.round(width * 0.29)}
          cy={Math.round(height * 0.17)}
          rx={Math.round(width * 0.06)}
          ry={Math.round(height * 0.04)}
        />
        <ellipse
          cx={Math.round(width * 0.21)}
          cy={Math.round(height * 0.19)}
          rx={Math.round(width * 0.05)}
          ry={Math.round(height * 0.035)}
        />

        <ellipse
          cx={Math.round(width * 0.62)}
          cy={Math.round(height * 0.28)}
          rx={Math.round(width * 0.075)}
          ry={Math.round(height * 0.038)}
        />
        <ellipse
          cx={Math.round(width * 0.66)}
          cy={Math.round(height * 0.26)}
          rx={Math.round(width * 0.05)}
          ry={Math.round(height * 0.032)}
        />
      </g>

      <path
        d={`M 0 ${Math.round(height * 0.68)} Q ${Math.round(width * 0.3)} ${Math.round(height * 0.58)} ${Math.round(width * 0.65)} ${Math.round(height * 0.65)} T ${width} ${Math.round(height * 0.62)} L ${width} ${height} L 0 ${height} Z`}
        fill={`url(#hillBackGrad-${sceneNumber})`}
        opacity={0.85}
      />

      <path
        d={`M 0 ${groundY} Q ${Math.round(width * 0.45)} ${Math.round(groundY - height * 0.04)} ${width} ${groundY} L ${width} ${height} L 0 ${height} Z`}
        fill={`url(#groundGrad-${sceneNumber})`}
      />

      <circle cx={Math.round(width * 0.12)} cy={Math.round(groundY + 12)} r={4} fill="#fde047" opacity={0.9} />
      <circle cx={Math.round(width * 0.28)} cy={Math.round(groundY + 18)} r={3.5} fill="#f43f5e" opacity={0.85} />
      <circle cx={Math.round(width * 0.52)} cy={Math.round(groundY + 14)} r={4} fill="#ffffff" opacity={0.9} />
      <circle cx={Math.round(width * 0.74)} cy={Math.round(groundY + 20)} r={3.5} fill="#fbbf24" opacity={0.85} />
      <circle cx={Math.round(width * 0.88)} cy={Math.round(groundY + 15)} r={4} fill="#ec4899" opacity={0.9} />
    </svg>
  );
}

function SceneView({
  scene,
  format,
  subtitleTheme = 'classic',
  template,
  isFirstScene = false,
  isLastScene = false,
  storyTitle,
  fps: fallbackFps = 30,
  width: fallbackWidth = 1280,
  height: fallbackHeight = 720,
}: {
  scene: Scene;
  format: AspectRatio;
  subtitleTheme?: SubtitleTheme;
  template: VideoTemplate;
  isFirstScene?: boolean;
  isLastScene?: boolean;
  storyTitle?: string;
  fps?: number;
  width?: number;
  height?: number;
}) {
  let frame = 0;
  try {
    frame = useCurrentFrame();
  } catch {
    frame = 0;
  }

  let configFps = fallbackFps;
  let configWidth = fallbackWidth;
  let configHeight = fallbackHeight;
  try {
    const vc = useVideoConfig();
    configFps = vc.fps;
    configWidth = vc.width;
    configHeight = vc.height;
  } catch {
    // Fall back safely to passed props if video context is unavailable
  }

  const fps = configFps;
  const width = configWidth;
  const height = configHeight;
  const totalFrames = frames(scene.durationMs, fps);
  const progress = Math.min(1, Math.max(0, frame / Math.max(1, totalFrames - 1)));
  const sceneRelativeMs = (frame / fps) * 1000;

  // Scene transition (cut vs fade)
  let sceneOpacity = 1.0;
  if (scene.transition?.type === 'fade') {
    const fadeDurationMs = Math.max(100, Math.min(2000, scene.transition.durationMs || 500));
    const fadeFrames = frames(fadeDurationMs, fps);
    const fadeIn = Math.min(1, frame / Math.max(1, fadeFrames));
    const fadeOut = Math.min(1, (totalFrames - 1 - frame) / Math.max(1, fadeFrames));
    sceneOpacity = Math.min(fadeIn, fadeOut);
  }

  // Resolve camera settings
  const rawMovement =
    scene.cameraMovement ||
    (typeof scene.camera === 'string' ? scene.camera : scene.camera?.movement) ||
    'static';
  const rawRotation =
    scene.cameraRotation ||
    (typeof scene.camera === 'object' ? scene.camera?.rotation : 'none') ||
    'none';
  const rawDegrees =
    scene.cameraRotationDegrees ||
    (typeof scene.camera === 'object' ? scene.camera?.rotationDegrees : 10) ||
    10;

  const { scale, dx, dy, rotationDeg } = computeCameraTransform({
    movement: rawMovement,
    rotation: rawRotation,
    rotationDegrees: rawDegrees,
    progress,
    width,
    height,
  });

  // Background resolution
  const bg = scene.background;
  const isBgRemoved = Boolean(bg?.removed);
  const bgUrl = isBgRemoved
    ? ''
    : bg?.imageUrl || scene.backgroundUrl || (scene.backgroundSrc ? staticFile(scene.backgroundSrc) : '');
  const rawFit = bg?.fit || 'cover';
  const objectFit: React.CSSProperties['objectFit'] = rawFit === 'contain' ? 'contain' : (rawFit === 'fill' ? 'fill' : 'cover');

  // Format Variant Overrides
  const formatVariant = scene.formatVariants?.[format];
  const charOverrides = formatVariant?.characterOverrides;
  const overlayOverrides = formatVariant?.overlayOverrides;

  // Coordinate adaptation for non-16:9 formats and storybook character scaling
  const instances = (scene.characterInstances || []).map((inst, instIdx, arr) => {
    let targetFlipX = inst.flipX;
    if (arr.length === 2 && targetFlipX === undefined) {
      const other = arr[1 - instIdx];
      if (other && inst.x > other.x) {
        targetFlipX = true;
      }
    }

    const override = charOverrides?.[inst.instanceId];
    if (override) {
      let ox = override.x !== undefined ? override.x : inst.x;
      let oy = override.y !== undefined ? override.y : inst.y;
      // Auto-recovery: if a previous drag placed character in the sky in 9:16 (y < 450), anchor safely
      if (format === '9:16' && oy < 450) {
        oy = Math.round(height * 0.63);
      }
      return {
        ...inst,
        x: ox,
        y: oy,
        scale: override.scale !== undefined ? override.scale : (inst.scale ?? 1.0),
        flipX: targetFlipX ?? inst.flipX,
      };
    }

    const rawScale = inst.scale ?? 1.0;
    const isSingleChar = arr.length === 1;

    if (format === '16:9' || (width === 1280 && height === 720)) {
      const s = width / 1280;
      return {
        ...inst,
        x: Math.round(inst.x * s),
        y: Math.round(inst.y * s),
        scale: Number((rawScale * s).toFixed(2)),
        flipX: targetFlipX ?? inst.flipX,
      };
    }

    if (format === '9:16' || width < height) {
      // 9:16 Portrait Reel:
      // Characters stand safely anchored above subtitle safe area (Y ~ 63% height).
      const scaleMult = isSingleChar ? 1.55 : 1.35;
      const boostedScale = Number((rawScale * scaleMult).toFixed(2));

      let newX = width / 2;
      if (arr.length === 2) {
        newX = instIdx === 0 ? Math.round(width * 0.32) : Math.round(width * 0.68);
      } else if (!isSingleChar) {
        const xOffset = inst.x - 640;
        newX = width / 2 + (xOffset * (width / 1280));
      }

      const newY = Math.round(height * 0.63);

      return {
        ...inst,
        x: Math.round(newX),
        y: newY,
        scale: boostedScale,
        flipX: targetFlipX ?? inst.flipX,
      };
    }

    if (format === '1:1') {
      const xOffset = inst.x - 640;
      const newX = width / 2 + (xOffset * (width / 1280));
      const scaleMult = isSingleChar ? 1.25 : 1.15;
      return {
        ...inst,
        x: Math.round(newX),
        y: Math.round(inst.y * (height / 720)),
        scale: Number((rawScale * scaleMult).toFixed(2)),
        flipX: targetFlipX ?? inst.flipX,
      };
    }

    if (format === '4:5') {
      const xOffset = inst.x - 640;
      const newX = width / 2 + (xOffset * (width / 1280));
      const scaleMult = isSingleChar ? 1.35 : 1.22;
      return {
        ...inst,
        x: Math.round(newX),
        y: Math.round(inst.y * (height / 720)),
        scale: Number((rawScale * scaleMult).toFixed(2)),
        flipX: targetFlipX ?? inst.flipX,
      };
    }

    return inst;
  });

  const sortedInstances = [...instances].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

  // Overlays
  const overlays = (scene.overlays || []).map((o) => {
    const override = overlayOverrides?.[o.id];
    if (override) {
      return {
        ...o,
        x: override.x !== undefined ? override.x : o.x,
        y: override.y !== undefined ? override.y : o.y,
        scale: override.scale !== undefined ? override.scale : o.scale,
      };
    }
    // Full-screen atmospheric effects (e.g. rain, snowfall, wind, lightning, rays) dynamically span the canvas
    const isFullScreenAtmospheric = [
      'rain',
      'snowfall',
      'wind',
      'falling_leaves',
      'sunshine_rays',
      'heat_shimmer',
      'fog_mist',
      'lightning',
    ].includes(o.type);

    if (isFullScreenAtmospheric) {
      return o;
    }

    if (o.x !== undefined && o.y !== undefined) {
      if (format === '16:9' && width !== 1280) {
        const s = width / 1280;
        return { ...o, x: Math.round(o.x * s), y: Math.round(o.y * s) };
      }
      if (format === '9:16' || width < height) {
        const xOffset = o.x - 640;
        const newX = width / 2 + (xOffset * (width / 1280));
        const yRatio = o.y / 720;
        return { ...o, x: Math.round(newX), y: Math.round(yRatio * height) };
      }
    }
    return o;
  });

  const belowOverlays = overlays.filter((o) => o.layerDepth === 'below_characters');
  const aboveOverlays = overlays.filter((o) => o.layerDepth !== 'below_characters');

  // Active dialogue line for subtitles
  const dialogues = scene.dialogues || [];
  const activeDialogue = dialogues.find(
    (d) => sceneRelativeMs >= d.startMs && sceneRelativeMs <= d.startMs + d.durationMs
  );

  const narrationUrl = scene.narration?.url || scene.narrationUrl;
  const narrStartMs = scene.narration?.startMs || 0;
  const narrationDurationMs = scene.narration?.durationMs || scene.durationMs;
  const isNarrationSpeaking = Boolean(
    narrationUrl &&
    sceneRelativeMs >= narrStartMs &&
    sceneRelativeMs <= narrStartMs + narrationDurationMs
  );

  const dialogueRelativeMs = activeDialogue ? sceneRelativeMs - activeDialogue.startMs : 0;
  const activeDialogueWordIndex = activeDialogue?.wordTimings?.findIndex(
    (word) => dialogueRelativeMs >= word.startMs && dialogueRelativeMs < word.endMs
  ) ?? -1;

  const narrativeRelativeMs = Math.max(0, sceneRelativeMs - narrStartMs);
  const narrationWordTimings = scene.narration?.wordTimings;
  const activeNarrWordIndex = narrationWordTimings?.findIndex(
    (w) => narrativeRelativeMs >= w.startMs && narrativeRelativeMs < w.endMs
  ) ?? -1;

  // Subtitle Payload: Character Dialogue takes priority; Narration is shown when narration speaks or caption exists
  const activeSubtitle = activeDialogue
    ? {
        type: 'dialogue' as const,
        speaker: activeDialogue.characterName,
        chunk: getSubtitleDisplayChunk({
          text: activeDialogue.text,
          wordTimings: activeDialogue.wordTimings,
          relativeMs: dialogueRelativeMs,
          totalDurationMs: activeDialogue.durationMs,
          activeWordIndex: activeDialogueWordIndex,
        }),
        activeWordIndex: activeDialogueWordIndex,
      }
    : (isNarrationSpeaking && (scene.narration?.text || scene.caption))
    ? {
        type: 'narration' as const,
        speaker: undefined,
        chunk: getSubtitleDisplayChunk({
          text: scene.narration?.text || scene.caption || '',
          wordTimings: narrationWordTimings,
          relativeMs: narrativeRelativeMs,
          totalDurationMs: narrationDurationMs,
          activeWordIndex: activeNarrWordIndex,
        }),
        activeWordIndex: activeNarrWordIndex,
      }
    : null;

  return (
    <AbsoluteFill style={{ backgroundColor: '#101726', overflow: 'hidden', opacity: sceneOpacity }}>
      {/* Camera 2D Transform Container */}
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(${rotationDeg}deg)`,
          transformOrigin: '50% 50%',
        }}
      >
        {/* Background Layer: Video Clip, Image Sequence, Background Image, or Storybook Scenic Canvas */}
        {scene.videoSrc ? (
          <AbsoluteFill>
            <Video
              src={scene.videoSrc.startsWith('http') || scene.videoSrc.startsWith('data:') ? scene.videoSrc : staticFile(scene.videoSrc)}
              style={{
                width: '100%',
                height: '100%',
                objectFit,
              }}
            />
          </AbsoluteFill>
        ) : scene.frames && scene.frames.length > 0 ? (
          <AbsoluteFill>
            <Img
              src={(() => {
                const idx = Math.min(scene.frames.length - 1, Math.floor(progress * scene.frames.length));
                const f = scene.frames[idx];
                return f.startsWith('http') || f.startsWith('data:') ? f : staticFile(f);
              })()}
              style={{
                width: '100%',
                height: '100%',
                objectFit,
              }}
            />
          </AbsoluteFill>
        ) : bgUrl ? (
          <AbsoluteFill>
            <Img
              src={bgUrl}
              style={{
                width: '100%',
                height: '100%',
                objectFit,
              }}
              onError={(e) => {
                console.warn('[Remotion] Scene background image load failed, falling back to storybook scenery:', e);
              }}
            />
          </AbsoluteFill>
        ) : (
          <StorybookScenicBackdrop
            width={width}
            height={height}
            sceneNumber={scene.sceneNumber || 1}
          />
        )}

        {/* Vector Characters & Overlays SVG Plane */}
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
        >
          {/* Below-Character Overlays */}
          {belowOverlays.map((o) => (
            <EducationalOverlayRenderer
              key={o.id}
              overlay={o}
              sceneRelativeMs={sceneRelativeMs}
              viewportWidth={width}
              viewportHeight={height}
            />
          ))}

          {/* Articulated Vector Characters */}
          {sortedInstances.map((inst) => {
            const rig = inst.customRig || getVectorRig(inst.characterId);
            const pose = evaluateCharacterPose(
              inst,
              scene.animationClips || [],
              sceneRelativeMs,
              scene.expressionCues || [],
              dialogues
            );
            return (
              <VectorCharacter
                key={inst.instanceId}
                rig={rig}
                pose={pose}
              />
            );
          })}

          {/* Above-Character Overlays */}
          {aboveOverlays.map((o) => (
            <EducationalOverlayRenderer
              key={o.id}
              overlay={o}
              sceneRelativeMs={sceneRelativeMs}
              viewportWidth={width}
              viewportHeight={height}
            />
          ))}
        </svg>
      </div>

      {/* Screen-Space Overlays: Scene Title with Template Visual Styling */}
      {scene.title && (
        <div
          style={{
            position: 'absolute',
            top: height * 0.05,
            left: width * 0.06,
            right: width * 0.06,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            pointerEvents: 'none',
          }}
        >
          {template.tagLabel && (
            <div
              style={{
                fontSize: Math.max(12, Math.round(width * 0.014)),
                fontWeight: 700,
                color: template.titleColor || '#ffffff',
                backgroundColor: template.titleBadgeBg || 'rgba(0,0,0,0.5)',
                border: `1px solid ${template.titleBadgeBorder || 'rgba(255,255,255,0.2)'}`,
                borderRadius: 20,
                padding: '3px 12px',
                marginBottom: 6,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                backdropFilter: 'blur(6px)',
              }}
            >
              {template.tagLabel}
            </div>
          )}
          <div
            style={{
              fontWeight: 800,
              fontSize: Math.max(24, Math.round(width * 0.032)),
              color: template.titleColor || '#ffffff',
              textShadow: '0 3px 12px rgba(0,0,0,0.85), 0 1px 3px rgba(0,0,0,0.9)',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              lineHeight: 1.2,
            }}
          >
            {scene.title}
          </div>
        </div>
      )}

      {/* Template Feature: Intro Card for intro-outro template */}
      {template.showIntroCard && isFirstScene && progress < 0.45 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.72)',
            backdropFilter: 'blur(10px)',
            opacity: progress < 0.35 ? 1 : Math.max(0, (0.45 - progress) / 0.1),
            transition: 'opacity 0.3s ease',
            pointerEvents: 'none',
            zIndex: 50,
          }}
        >
          <div
            style={{
              fontSize: Math.max(16, Math.round(width * 0.02)),
              fontWeight: 700,
              color: '#38bdf8',
              letterSpacing: 3,
              textTransform: 'uppercase',
              marginBottom: 12,
            }}
          >
            AI Kids Content Studio
          </div>
          <div
            style={{
              fontSize: Math.max(32, Math.round(width * 0.05)),
              fontWeight: 900,
              color: '#ffffff',
              textAlign: 'center',
              maxWidth: '80%',
              lineHeight: 1.2,
              textShadow: '0 4px 20px rgba(0,0,0,0.8)',
            }}
          >
            {storyTitle || scene.title || 'Adventure Story'}
          </div>
        </div>
      )}

      {/* Template Feature: Outro Card for intro-outro template */}
      {template.showOutroCard && isLastScene && progress > 0.65 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(12px)',
            opacity: Math.min(1, (progress - 0.65) / 0.15),
            pointerEvents: 'none',
            zIndex: 50,
          }}
        >
          <div
            style={{
              fontSize: Math.max(34, Math.round(width * 0.052)),
              fontWeight: 900,
              color: '#facc15',
              letterSpacing: 2,
              textShadow: '0 4px 20px rgba(0,0,0,0.8)',
              marginBottom: 10,
            }}
          >
            The End
          </div>
          <div
            style={{
              fontSize: Math.max(18, Math.round(width * 0.024)),
              fontWeight: 600,
              color: '#e2e8f0',
            }}
          >
            Thanks for watching!
          </div>
        </div>
      )}

      {/* Screen-Space Subtitles / Captions (Active Dialogue or Scene Caption / Narration) */}
      {activeSubtitle && (
        <div
          style={{
            position: 'absolute',
            bottom: Math.max(16, Math.round(height * 0.045)),
            left: width * 0.08,
            right: width * 0.08,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 40,
          }}
        >
          <div
            style={{
              backgroundColor: subtitleTheme === 'speech-bubble' ? '#ffffff' : (subtitleTheme === 'minimal' ? 'rgba(0,0,0,0.78)' : 'rgba(15, 23, 42, 0.90)'),
              border: subtitleTheme === 'speech-bubble' ? '1.5px solid rgba(15,23,42,0.12)' : '1px solid rgba(255, 255, 255, 0.2)',
              color: subtitleTheme === 'speech-bubble' ? '#0f172a' : '#ffffff',
              borderRadius: subtitleTheme === 'speech-bubble' ? '18px 18px 18px 4px' : (subtitleTheme === 'minimal' ? 6 : 12),
              padding: subtitleTheme === 'minimal' ? '6px 14px' : '8px 20px',
              maxWidth: width < height ? '90%' : '75%',
              maxHeight: Math.round(height * 0.22),
              overflow: 'hidden',
              textAlign: 'center',
              boxShadow: '0 8px 28px rgba(0, 0, 0, 0.55)',
              backdropFilter: 'blur(8px)',
            }}
          >
            {activeSubtitle.speaker && (
              <div
                style={{
                  fontSize: Math.max(11, Math.min(13, Math.round(width * 0.011))),
                  fontWeight: 700,
                  color: subtitleTheme === 'speech-bubble' ? '#2563eb' : '#38bdf8',
                  marginBottom: 3,
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                }}
              >
                {activeSubtitle.speaker}
              </div>
            )}
            <div
              style={{
                fontSize: Math.max(15, Math.min(22, Math.round((width < height ? height : width) * 0.016))),
                fontWeight: 600,
                color: subtitleTheme === 'speech-bubble' ? '#0f172a' : '#ffffff',
                lineHeight: 1.35,
                fontFamily: 'system-ui, -apple-system, "Noto Sans Devanagari", sans-serif',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {activeSubtitle.chunk.words && activeSubtitle.chunk.words.length > 0 ? (
                activeSubtitle.chunk.words.map((word, index) => (
                  <React.Fragment key={`w-${word.originalIndex ?? index}`}>
                    <span
                      style={{
                        color: subtitleTheme === 'karaoke' && word.originalIndex === activeSubtitle.activeWordIndex ? '#fde047' : 'inherit',
                        background: subtitleTheme === 'speech-bubble' && word.originalIndex === activeSubtitle.activeWordIndex ? 'rgba(59,130,246,0.14)' : 'transparent',
                        borderRadius: 3,
                        fontWeight: word.originalIndex === activeSubtitle.activeWordIndex ? 800 : 600,
                        textDecoration: subtitleTheme === 'karaoke' && word.originalIndex === activeSubtitle.activeWordIndex ? 'underline' : 'none',
                      }}
                    >
                      {word.text}
                    </span>{' '}
                  </React.Fragment>
                ))
              ) : (
                activeSubtitle.chunk.text
              )}
            </div>
          </div>
        </div>
      )}

      {/* Narration Audio: Strictly sequenced to startMs and durationMs */}
      {narrationUrl && (
        <Sequence
          from={frames(scene.narration?.startMs || 0, fps)}
          durationInFrames={frames(scene.narration?.durationMs || scene.durationMs, fps)}
        >
          <Audio
            src={narrationUrl}
            volume={scene.narration?.volume ?? 1.0}
            onError={(e) => console.warn('[Remotion] Narration audio error:', e)}
          />
        </Sequence>
      )}

      {/* Character Dialogue Audio Tracks */}
      {dialogues.map((d) => {
        const audioSrc = d.url || d.audioUrl;
        if (!audioSrc) return null;
        const fromFrame = frames(d.startMs, fps);
        const durationFrames = frames(d.durationMs, fps);
        return (
          <Sequence
            key={d.id}
            from={fromFrame}
            durationInFrames={durationFrames}
          >
            <Audio
              src={audioSrc}
              volume={d.volume ?? 1.0}
              onError={(e) => console.warn(`[Remotion] Dialogue audio error for ${d.characterName || (d as any).speaker || 'character'}:`, e)}
            />
          </Sequence>
        );
      })}

      {/* Pilot Audio Tracks & Additional Sound Effects */}
      {scene.audioTracks?.map((track, i) => (
        <Sequence
          key={`scene-audio-track-${i}`}
          from={frames(track.startMs, fps)}
          durationInFrames={frames(track.durationMs, fps)}
        >
          <Audio
            src={track.src.startsWith('http') || track.src.startsWith('data:') ? track.src : staticFile(track.src)}
            volume={track.volume}
            onError={(e) => console.warn(`[Remotion] Audio track error:`, e)}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

export function StoryVideo(rawProps?: { manifest?: VideoManifest } | VideoManifest) {
  const manifest: VideoManifest =
    (rawProps && 'manifest' in rawProps && rawProps.manifest)
      ? rawProps.manifest
      : (rawProps && 'scenes' in rawProps && Array.isArray((rawProps as any).scenes))
        ? (rawProps as VideoManifest)
        : defaultManifest;
  const fps = manifest?.fps ?? 30;
  const format = manifest?.format ?? '16:9';
  const template = getVideoTemplate(manifest?.templateId);
  const activeSubtitleTheme = manifest?.subtitleTheme || template.subtitleTheme;
  const dims = dimensions(format, manifest?.resolution || '720p');

  let offset = 0;

  return (
    <AbsoluteFill>
      {/* Background Music Track */}
      {manifest.backgroundMusic && (
        <Audio
          src={manifest.backgroundMusic}
          volume={manifest.musicVolume ?? 0.2}
          loop
          onError={(e) => console.warn('[Remotion] Background music error:', e)}
        />
      )}

      {/* Sequential Scenes */}
      {(manifest?.scenes || []).map((scene, idx, arr) => {
        const from = offset;
        const durationInFrames = frames(scene.durationMs, fps);
        offset += durationInFrames;

        return (
          <Sequence
            key={scene.id}
            from={from}
            durationInFrames={durationInFrames}
          >
            <SceneView
              scene={scene}
              format={format}
              subtitleTheme={activeSubtitleTheme}
              template={template}
              isFirstScene={idx === 0}
              isLastScene={idx === arr.length - 1}
              storyTitle={manifest?.storyTitle}
              fps={fps}
              width={dims.width}
              height={dims.height}
            />
          </Sequence>
        );
      })}

      {/* Guarantees an audio stream even when a story has no narration/dialogue. */}
      {manifest.silentAudioSrc && (
        <Audio
          src={
            manifest.silentAudioSrc.startsWith('data:') || manifest.silentAudioSrc.startsWith('http')
              ? manifest.silentAudioSrc
              : staticFile(manifest.silentAudioSrc)
          }
          volume={0}
          loop
          onError={(e) => console.warn('[Remotion] Silent audio track notice:', e)}
        />
      )}
    </AbsoluteFill>
  );
}

export function RemotionRoot() {
  const fps = defaultManifest.fps ?? 30;
  const { width, height } = dimensions(
    defaultManifest.format,
    defaultManifest.resolution
  );
  const totalFrames = defaultManifest.scenes.reduce(
    (n, s) => n + frames(s.durationMs, fps),
    0
  );

  return (
    <Composition
      id="StoryVideo"
      component={StoryVideo}
      durationInFrames={Math.max(1, totalFrames)}
      fps={fps}
      width={width}
      height={height}
      defaultProps={{ manifest: defaultManifest }}
      calculateMetadata={({ props }) => {
        const m = (props as { manifest?: VideoManifest })?.manifest || defaultManifest;
        const currentFps = m.fps ?? 30;
        const dims = dimensions(m.format, m.resolution);
        const duration = (m.scenes || []).reduce(
          (n, s) => n + frames(s.durationMs, currentFps),
          0
        );
        return {
          durationInFrames: Math.max(1, duration),
          fps: currentFps,
          width: dims.width,
          height: dims.height,
        };
      }}
    />
  );
}
