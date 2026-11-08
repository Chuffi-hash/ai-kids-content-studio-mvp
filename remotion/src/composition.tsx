import React from 'react';
import { AbsoluteFill, Audio, Composition, Img, interpolate, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { dimensions, frames, type Scene, type VideoManifest } from './manifest.js';

const defaultManifest: VideoManifest = { scenes: [{ id: 'preview', durationMs: 3000, title: 'AI Kids Content Studio', caption: 'Remotion rendering pilot' }] };

function SceneView({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const length = frames(scene.durationMs, fps);
  const progress = Math.min(1, frame / Math.max(1, length - 1));
  const camera = scene.camera ?? 'static';
  const scale = camera === 'zoom-in' ? 1 + progress * 0.12 : camera === 'zoom-out' ? 1.12 - progress * 0.12 : 1.06;
  const translateX = camera === 'pan-left' ? -progress * width * 0.08 : camera === 'pan-right' ? progress * width * 0.08 : 0;
  return <AbsoluteFill style={{ backgroundColor: '#101827', overflow: 'hidden', color: 'white', fontFamily: 'Arial, sans-serif' }}>
    {scene.backgroundUrl && <AbsoluteFill style={{ transform: `translateX(${translateX}px) scale(${scale})` }}>
      <Img src={scene.backgroundUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </AbsoluteFill>}
    {scene.title && <div style={{ position: 'absolute', top: height * 0.07, left: width * 0.06, right: width * 0.06, fontWeight: 800, fontSize: Math.max(28, width * 0.038), textShadow: '0 3px 12px #000' }}>{scene.title}</div>}
    {scene.caption && <div style={{ position: 'absolute', bottom: height * 0.08, left: width * 0.06, right: width * 0.06, textAlign: 'center', fontWeight: 700, fontSize: Math.max(24, width * 0.033), textShadow: '0 3px 12px #000', background: '#0009', borderRadius: 16, padding: 18 }}>{scene.caption}</div>}
    {(scene.overlays ?? []).map((o, i) => {
      const start = frames(o.startMs, fps);
      const end = start + frames(o.durationMs, fps);
      if (frame < start || frame >= end) return null;
      const opacity = interpolate(frame, [start, start + Math.min(8, end - start)], [0, 1], { extrapolateRight: 'clamp' });
      return <div key={i} style={{ position: 'absolute', left: `${o.x ?? 50}%`, top: `${o.y ?? 50}%`, transform: 'translate(-50%, -50%)', fontSize: Math.max(22, width * 0.035), fontWeight: 800, color: '#fff', background: '#000a', borderRadius: 12, padding: '10px 20px', opacity, whiteSpace: 'pre-wrap', textAlign: 'center' }}>{o.text}</div>;
    })}
    {scene.narrationUrl && <Audio src={scene.narrationUrl} />}
  </AbsoluteFill>;
}
export function StoryVideo({ manifest }: { manifest: VideoManifest }) {
  const fps = manifest.fps ?? 30;
  let offset = 0;
  return <AbsoluteFill>{manifest.scenes.map((scene) => {
    const from = offset;
    const durationInFrames = frames(scene.durationMs, fps);
    offset += durationInFrames;
    return <Sequence key={scene.id} from={from} durationInFrames={durationInFrames}>
      <SceneView scene={scene} />
    </Sequence>;
  })}</AbsoluteFill>;
}
export function RemotionRoot() {
  const fps = defaultManifest.fps ?? 30;
  const { width, height } = dimensions(defaultManifest.format, defaultManifest.resolution);
  return <Composition id="StoryVideo" component={StoryVideo} durationInFrames={defaultManifest.scenes.reduce((n, s) => n + frames(s.durationMs, fps), 0)} fps={fps} width={width} height={height} defaultProps={{ manifest: defaultManifest }} />;
}
