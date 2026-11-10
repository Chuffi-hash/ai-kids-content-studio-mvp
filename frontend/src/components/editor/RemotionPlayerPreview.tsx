import React, { useEffect, useMemo, useState } from 'react';
import { Player } from '@remotion/player';
import { StoryVideo } from '../../../../remotion/src/composition';
import { dimensions, frames, VideoManifest } from '../../../../remotion/src/manifest';
import { fetchRemotionPreviewManifest } from '../../services/editor.service';

interface RemotionPlayerPreviewProps {
  storyId: string;
  format: string;
  refreshTrigger?: string | number;
}

export const RemotionPlayerPreview: React.FC<RemotionPlayerPreviewProps> = ({
  storyId,
  format,
  refreshTrigger,
}) => {
  const [manifest, setManifest] = useState<VideoManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [manualRefreshKey, setManualRefreshKey] = useState(0);

  const handleRefresh = () => {
    setManualRefreshKey((k) => k + 1);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchRemotionPreviewManifest(storyId, { format, resolution: '720p', fps: 30 })
      .then((result) => {
        if (active) setManifest(result);
      })
      .catch((reason) => {
        if (active) setError(reason?.message || 'Could not load Remotion preview');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [storyId, format, refreshTrigger, manualRefreshKey]);

  const config = useMemo(() => {
    if (!manifest) return null;
    const fps = manifest.fps || 30;
    const size = dimensions(manifest.format, manifest.resolution);
    const durationInFrames = manifest.scenes.reduce(
      (sum, scene) => sum + frames(scene.durationMs, fps),
      0
    );
    const totalDurationSec = (durationInFrames / fps).toFixed(1);
    return { fps, ...size, durationInFrames: Math.max(1, durationInFrames), totalDurationSec };
  }, [manifest]);

  if (loading) {
    return (
      <div className="ed-preview-empty-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#38bdf8', fontWeight: 600, fontSize: 15, marginBottom: 6 }}>
          Preparing Remotion composition preview…
        </div>
        <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
          Synthesizing vector rigs, expressions, and audio timeline
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ed-preview-empty-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ color: '#ef4444', fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
          Remotion Preview Unavailable
        </div>
        <p style={{ color: '#94a3b8', fontSize: 13, maxWidth: 440, marginBottom: 16, lineHeight: 1.4 }}>
          {error}
        </p>
        <button
          type="button"
          className="ed-btn-action"
          onClick={handleRefresh}
          style={{ cursor: 'pointer', padding: '8px 18px', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none', fontWeight: 600 }}
        >
          Retry Loading Preview
        </button>
      </div>
    );
  }

  if (!manifest || !config) {
    return (
      <div className="ed-preview-empty-state">
        <p>No preview data available for this story.</p>
        <button type="button" className="ed-btn-action" onClick={handleRefresh} style={{ marginTop: 12 }}>
          Reload
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        padding: '52px 14px 14px 14px',
        boxSizing: 'border-box',
      }}
    >
      {/* Composition Info Header Strip */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
          padding: '2px 4px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{manifest.scenes.length} {manifest.scenes.length === 1 ? 'scene' : 'scenes'}</span>
          <span>•</span>
          <span>{config.totalDurationSec}s</span>
          <span>•</span>
          <span>{config.width}×{config.height}</span>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          title="Reload Remotion composition manifest from saved scenes"
          style={{
            background: 'rgba(56, 189, 248, 0.15)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            color: '#38bdf8',
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 4,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          ↻ Refresh Manifest
        </button>
      </div>

      {/* Remotion Player Container */}
      <div
        style={{
          width: '100%',
          flex: 1,
          maxHeight: 'calc(100% - 32px)',
          aspectRatio: `${config.width} / ${config.height}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.7)',
          borderRadius: 8,
          overflow: 'hidden',
          background: '#090e17',
        }}
      >
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
          errorFallback={({ error }: { error: Error }) => {
            const errorMsg =
              error?.message ||
              (error as any)?.name ||
              (typeof error === 'string' ? error : JSON.stringify(error)) ||
              'Failed to render Remotion composition';
            console.error('[RemotionPlayerPreview] Composition error caught:', error);
            return (
              <div style={{ padding: 24, textAlign: 'center', color: '#f87171', background: '#0f172a', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: '#fca5a5' }}>
                  Remotion Composition Error
                </div>
                <div style={{ fontSize: 13, color: '#cbd5e1', maxWidth: 460, lineHeight: 1.4, marginBottom: 12, wordBreak: 'break-word' }}>
                  {errorMsg}
                </div>
                <button
                  type="button"
                  className="ed-btn-action"
                  onClick={handleRefresh}
                  style={{ padding: '6px 14px', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12 }}
                >
                  Reload Preview
                </button>
              </div>
            );
          }}
        />
      </div>
    </div>
  );
};
