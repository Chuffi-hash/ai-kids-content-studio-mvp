import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Composition,
  Img,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { frames, type Scene, type VideoManifest } from './manifest.js';

const defaultManifest: VideoManifest = {
  version: 1,
  fps: 30,
  width: 1280,
  height: 720,
  silentAudioSrc: 'silent.wav',
  scenes: [{
    id: 'preview',
    title: 'AI Kids Content Studio',
    durationMs: 3000,
    audioTracks: [],
  }],
};

function SceneView({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const totalFrames = frames(scene.durationMs, fps);
  const safeFrame = Math.max(0, Math.min(totalFrames - 1, frame));
  const progress = totalFrames <= 1 ? 0 : safeFrame / (totalFrames - 1);
  const movement = (scene.cameraMovement || '').toLowerCase();

  let scale = 1;
  let translateX = 0;
  let translateY = 0;
  let rotation = 0;
  if (movement.includes('zoom in')) scale = 1 + progress * 0.15;
  else if (movement.includes('zoom out')) scale = 1.15 - progress * 0.15;
  else if (movement.includes('pan left')) { scale = 1.12; translateX = (progress - 0.5) * width * 0.08; }
  else if (movement.includes('pan right')) { scale = 1.12; translateX = (0.5 - progress) * width * 0.08; }
  else if (movement.includes('tilt up')) { scale = 1.12; translateY = (progress - 0.5) * height * 0.08; }
  else if (movement.includes('tilt down')) { scale = 1.12; translateY = (0.5 - progress) * height * 0.08; }

  const rotationText = (scene.cameraRotation || '').toLowerCase();
  const degrees = Math.max(0, Math.min(45, scene.cameraRotationDegrees ?? 10));
  if (rotationText.includes('clockwise') && !rotationText.includes('counter') && !rotationText.includes('anti')) rotation = progress * degrees;
  if (rotationText.includes('counter') || rotationText.includes('anti')) rotation = -progress * degrees;

  const cameraStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform: `translate(${translateX}px, ${translateY}px) rotate(${rotation}deg) scale(${scale})`,
  };

  return (
    <AbsoluteFill style={{ backgroundColor: '#101726', overflow: 'hidden', color: 'white', fontFamily: 'Arial, sans-serif' }}>
      {scene.frames?.length ? (
        <Img src={staticFile(scene.frames[Math.min(safeFrame, scene.frames.length - 1)])}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : scene.videoSrc ? (
        <OffthreadVideo src={staticFile(scene.videoSrc)} muted style={cameraStyle} />
      ) : scene.backgroundSrc ? (
        <Img src={staticFile(scene.backgroundSrc)} style={cameraStyle} />
      ) : (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: width * 0.08, textAlign: 'center' }}>
          <div style={{ fontSize: Math.max(32, width * 0.045), fontWeight: 800 }}>{scene.title}</div>
          {scene.caption && <div style={{ marginTop: 24, fontSize: Math.max(20, width * 0.026), lineHeight: 1.4 }}>{scene.caption}</div>}
        </AbsoluteFill>
      )}

      {scene.audioTracks.map((track, index) => {
        const from = frames(track.startMs, fps);
        const durationInFrames = Math.max(1, frames(track.durationMs, fps));
        return (
          <Sequence key={`${scene.id}-audio-${index}`} from={from} durationInFrames={durationInFrames}>
            <Audio src={staticFile(track.src)} volume={track.volume} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

export function StoryVideo({ manifest }: { manifest: VideoManifest }) {
  let offset = 0;
  return (
    <AbsoluteFill>
      {manifest.scenes.map((scene) => {
        const from = offset;
        const durationInFrames = frames(scene.durationMs, manifest.fps);
        offset += durationInFrames;
        return (
          <Sequence key={scene.id} from={from} durationInFrames={durationInFrames}>
            <SceneView scene={scene} />
          </Sequence>
        );
      })}
      {/* Guarantees an audio stream even when a story has no narration/dialogue. */}
      <Audio src={staticFile(manifest.silentAudioSrc)} volume={0} loop />
    </AbsoluteFill>
  );
}

export function RemotionRoot() {
  return (
    <Composition
      id="StoryVideo"
      component={StoryVideo}
      durationInFrames={defaultManifest.scenes.reduce((total, scene) => total + frames(scene.durationMs, defaultManifest.fps), 0)}
      fps={defaultManifest.fps}
      width={defaultManifest.width}
      height={defaultManifest.height}
      defaultProps={{ manifest: defaultManifest }}
    />
  );
}
