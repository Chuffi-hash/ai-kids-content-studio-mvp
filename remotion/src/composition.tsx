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

function SceneView({
  scene,
  format,
  subtitleTheme = 'classic',
  template,
  isFirstScene = false,
  isLastScene = false,
  storyTitle,
}: {
  scene: Scene;
  format: AspectRatio;
  subtitleTheme?: SubtitleTheme;
  template: VideoTemplate;
  isFirstScene?: boolean;
  isLastScene?: boolean;
  storyTitle?: string;
}) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
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

  // Coordinate adaptation for non-16:9 formats
  const instances = (scene.characterInstances || []).map((inst) => {
    const override = charOverrides?.[inst.instanceId];
    if (override) {
      return {
        ...inst,
        x: override.x !== undefined ? override.x : inst.x,
        y: override.y !== undefined ? override.y : inst.y,
        scale: override.scale !== undefined ? override.scale : inst.scale,
      };
    }
    if (width === 1280 && height === 720) {
      return inst;
    }
    if (format === '16:9') {
      const s = width / 1280;
      return {
        ...inst,
        x: Math.round(inst.x * s),
        y: Math.round(inst.y * s),
        scale: Number(((inst.scale || 1.0) * s).toFixed(2)),
      };
    }
    if (format === '9:16' || width < height) {
      const xOffset = inst.x - 640;
      const newX = width / 2 + (xOffset * (width / 1280));
      const yRatio = inst.y / 720;
      const newY = yRatio * height;
      const scaleMult = height / 1280;
      const baseScale = (inst.scale || 1.0) <= 1.0 ? (inst.scale || 1.0) * 1.15 : (inst.scale || 1.0);
      return {
        ...inst,
        x: Math.round(newX),
        y: Math.round(newY),
        scale: Number((baseScale * scaleMult).toFixed(2)),
      };
    }
    if (format === '1:1') {
      const xOffset = inst.x - 640;
      const newX = width / 2 + (xOffset * (width / 1280));
      const yRatio = inst.y / 720;
      const newY = yRatio * height;
      const scaleMult = width / 720;
      return {
        ...inst,
        x: Math.round(newX),
        y: Math.round(newY),
        scale: Number(((inst.scale || 1.0) * scaleMult).toFixed(2)),
      };
    }
    if (format === '4:5') {
      const xOffset = inst.x - 640;
      const newX = width / 2 + (xOffset * (width / 1280));
      const yRatio = inst.y / 720;
      const newY = yRatio * height;
      const scaleMult = width / 720;
      return {
        ...inst,
        x: Math.round(newX),
        y: Math.round(newY),
        scale: Number(((inst.scale || 1.0) * 1.08 * scaleMult).toFixed(2)),
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
  const isNarrationSpeaking = Boolean(
    narrationUrl &&
    sceneRelativeMs >= 0 &&
    sceneRelativeMs <= (scene.narration?.durationMs || scene.durationMs)
  );

  const activeDialogueWordIndex = activeDialogue?.wordTimings?.findIndex(
    (word) => sceneRelativeMs - (activeDialogue?.startMs || 0) >= word.startMs
      && sceneRelativeMs - (activeDialogue?.startMs || 0) < word.endMs
  ) ?? -1;

  const narrationWordTimings = scene.narration?.wordTimings;
  const activeNarrWordIndex = narrationWordTimings?.findIndex(
    (w) => sceneRelativeMs >= w.startMs && sceneRelativeMs < w.endMs
  ) ?? -1;

  // Subtitle Payload: Character Dialogue takes priority; Narration is shown when narration speaks or caption exists
  const activeSubtitle = activeDialogue
    ? {
        type: 'dialogue' as const,
        speaker: activeDialogue.characterName,
        text: activeDialogue.text,
        wordTimings: activeDialogue.wordTimings,
        activeWordIndex: activeDialogueWordIndex,
      }
    : (scene.caption || (isNarrationSpeaking && scene.narration?.text))
    ? {
        type: 'narration' as const,
        speaker: undefined,
        text: scene.narration?.text || scene.caption || '',
        wordTimings: narrationWordTimings,
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
        {/* Background Layer: Video Clip, Image Sequence, Background Image, or Animated SVG Canvas */}
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
            />
          </AbsoluteFill>
        ) : (
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={{ position: 'absolute', top: 0, left: 0 }}
          >
            <rect width={width} height={height} fill="#101726" />
            <line
              x1={0}
              y1={Math.round(height * 0.75)}
              x2={width}
              y2={Math.round(height * 0.75)}
              stroke="#1e293b"
              strokeWidth={2}
            />
            <rect
              x={0}
              y={Math.round(height * 0.75)}
              width={width}
              height={Math.round(height * 0.25)}
              fill="#0d131f"
              opacity={0.6}
            />
          </svg>
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
            bottom: height * 0.07,
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
              backgroundColor: subtitleTheme === 'speech-bubble' ? '#fffdf5' : (subtitleTheme === 'minimal' ? 'rgba(0,0,0,0.72)' : 'rgba(15, 23, 42, 0.88)'),
              border: subtitleTheme === 'speech-bubble' ? '2px solid rgba(15,23,42,0.14)' : '1.5px solid rgba(255, 255, 255, 0.2)',
              color: subtitleTheme === 'speech-bubble' ? '#172033' : '#ffffff',
              borderRadius: subtitleTheme === 'speech-bubble' ? '22px 22px 22px 6px' : (subtitleTheme === 'minimal' ? 8 : 16),
              padding: subtitleTheme === 'minimal' ? '8px 16px' : '12px 24px',
              maxWidth: '85%',
              textAlign: 'center',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(8px)',
            }}
          >
            {activeSubtitle.speaker && (
              <div
                style={{
                  fontSize: Math.max(14, Math.round(width * 0.02)),
                  fontWeight: 700,
                  color: subtitleTheme === 'speech-bubble' ? '#2563eb' : '#38bdf8',
                  marginBottom: 4,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                }}
              >
                {activeSubtitle.speaker}
              </div>
            )}
            <div
              style={{
                fontSize: Math.max(20, Math.round(width * 0.028)),
                fontWeight: 600,
                color: subtitleTheme === 'speech-bubble' ? '#172033' : '#ffffff',
                lineHeight: 1.35,
                fontFamily: 'system-ui, -apple-system, "Noto Sans Devanagari", sans-serif',
              }}
            >
              {activeSubtitle.wordTimings && activeSubtitle.wordTimings.length > 0 ? (
                activeSubtitle.wordTimings.map((word, index) => (
                  <React.Fragment key={`word-${index}`}>
                    <span
                      style={{
                        color: subtitleTheme === 'karaoke' && index === activeSubtitle.activeWordIndex ? '#fde047' : 'inherit',
                        background: subtitleTheme === 'speech-bubble' && index === activeSubtitle.activeWordIndex ? 'rgba(59,130,246,0.12)' : 'transparent',
                        borderRadius: 4,
                        fontWeight: index === activeSubtitle.activeWordIndex ? 800 : 600,
                        textDecoration: subtitleTheme === 'karaoke' && index === activeSubtitle.activeWordIndex ? 'underline' : 'none',
                      }}
                    >
                      {word.text}
                    </span>{' '}
                  </React.Fragment>
                ))
              ) : (
                activeSubtitle.text
              )}
            </div>
          </div>
        </div>
      )}

      {/* Narration Audio */}
      {narrationUrl && (
        <Audio
          src={narrationUrl}
          volume={scene.narration?.volume ?? 1.0}
          onError={(e) => console.warn('[Remotion] Narration audio error:', e)}
        />
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
