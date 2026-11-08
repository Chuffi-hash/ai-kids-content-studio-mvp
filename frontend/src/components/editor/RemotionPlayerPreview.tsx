import React, { useEffect, useMemo, useState } from 'react';
import { Player } from '@remotion/player';
import { StoryVideo } from '../../../../remotion/src/composition';
import { dimensions, frames, VideoManifest } from '../../../../remotion/src/manifest';
import { fetchRemotionPreviewManifest } from '../../services/editor.service';

interface RemotionPlayerPreviewProps {
  storyId: string;
  format: string;
}

export const RemotionPlayerPreview: React.FC<RemotionPlayerPreviewProps> = ({ storyId, format }) => {
  const [manifest, setManifest] = useState<VideoManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchRemotionPreviewManifest(storyId, { format, resolution: '720p', fps: 30 })
      .then((result) => { if (active) setManifest(result); })
      .catch((reason) => { if (active) setError(reason?.message || 'Could not load Remotion preview'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [storyId, format]);

  const config = useMemo(() => {
    if (!manifest) return null;
    const fps = manifest.fps || 30;
    const size = dimensions(manifest.format, manifest.resolution);
    const durationInFrames = manifest.scenes.reduce((sum, scene) => sum + frames(scene.durationMs, fps), 0);
    return { fps, ...size, durationInFrames: Math.max(1, durationInFrames) };
  }, [manifest]);

  if (loading) return <div className="ed-preview-empty-state">Preparing Remotion composition preview…</div>;
  if (error) return <div className="ed-preview-empty-state"><strong>Remotion preview unavailable</strong><p>{error}</p></div>;
  if (!manifest || !config) return <div className="ed-preview-empty-state">No preview data available.</div>;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, boxSizing: 'border-box' }}>
      <div style={{ width: '100%', maxHeight: '100%', aspectRatio: `${config.width} / ${config.height}` }}>
        <Player
          component={StoryVideo}
          inputProps={{ manifest }}
          durationInFrames={config.durationInFrames}
          compositionWidth={config.width}
          compositionHeight={config.height}
          fps={config.fps}
          controls
          clickToPlay
          doubleClickToFullscreen
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
};
