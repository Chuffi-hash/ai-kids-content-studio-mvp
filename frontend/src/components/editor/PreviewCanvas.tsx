import React, { useRef, useEffect, useState } from 'react';
import { EditorScene } from '../../types/editor';
import { CharacterInstance, VectorSceneData } from '../../types/animation';
import { VectorSceneCanvas } from './animation/VectorSceneCanvas';
import { formatTimeMs } from '../../utils/timingEngine';
import { resolveAssetUrl } from '../../utils/urlHelper';
import {
  PlayIcon,
  PauseIcon,
  VolumeHighIcon,
  VolumeMuteIcon,
  MaximizeIcon,
  FilmIcon,
  ImageIcon,
  SparklesIcon,
  AlertTriangleIcon,
} from '../common/Icons';

interface PreviewCanvasProps {
  activeScene: EditorScene | null;
  isPlaying: boolean;
  currentTimeMs: number;
  totalDurationMs: number;
  onTogglePlay: () => void;
  onSeek: (targetMs: number) => void;
  onGenerateImage?: () => void;
  isGeneratingImage?: boolean;
  isGeneratingVideo?: boolean;
  previewMode?: 'scene' | 'export';
  exportVideoUrl?: string | null;
  onTogglePreviewMode?: (mode: 'scene' | 'export') => void;
  selectedMusic?: string | null;
  musicVolume?: number;
  selectedInstanceId?: string | null;
  onSelectInstance?: (instanceId: string | null) => void;
  onUpdateInstance?: (instanceId: string, updates: Partial<CharacterInstance>) => void;
  onUpdateAnimationData?: (newData: VectorSceneData) => void;
}

export const PreviewCanvas: React.FC<PreviewCanvasProps> = ({
  activeScene,
  isPlaying,
  currentTimeMs,
  totalDurationMs,
  onTogglePlay,
  onSeek,
  onGenerateImage,
  isGeneratingImage,
  isGeneratingVideo,
  previewMode = 'scene',
  exportVideoUrl,
  onTogglePreviewMode,
  selectedMusic,
  musicVolume,
  selectedInstanceId,
  onSelectInstance,
  onUpdateInstance,
  onUpdateAnimationData,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [forceStillPreview, setForceStillPreview] = useState(false);
  const [previewVolume, setPreviewVolume] = useState<number>(1);

  // Sync playback state with underlying HTML5 video if playing a video asset
  useEffect(() => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.play().catch((err) => {
        // Autoplay restrictions or user interrupted
        console.warn('Preview video play interrupted:', err);
      });
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying]);

  // Sync video volume with preview volume state
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = previewVolume;
      videoRef.current.muted = previewVolume === 0;
    }
  }, [previewVolume]);

  // Sync video current time when seeking
  useEffect(() => {
    if (!videoRef.current) return;
    
    // In export mode, the video covers the full timeline
    if (previewMode === 'export') {
      const targetSec = currentTimeMs / 1000;
      if (Math.abs(videoRef.current.currentTime - targetSec) > 0.3) {
        videoRef.current.currentTime = targetSec;
      }
    } else if (activeScene) {
      // In scene mode, the scene has its own start offset on the global timeline
      const sceneOffsetMs = (activeScene as any).startTimeMs ?? activeScene.startMs ?? 0;
      const sceneRelativeSec = Math.max(0, (currentTimeMs - sceneOffsetMs) / 1000);
      if (Math.abs(videoRef.current.currentTime - sceneRelativeSec) > 0.3) {
        videoRef.current.currentTime = sceneRelativeSec;
      }
    }
  }, [currentTimeMs, previewMode, activeScene]);

  // Reset video error on scene or previewMode switch
  useEffect(() => {
    setVideoError(null);
  }, [activeScene?.sceneId, previewMode]);

  // Fullscreen canvas helper
  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        console.warn('Error attempting fullscreen:', err);
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.warn('Error exiting fullscreen:', err);
      });
    }
  };

  const mediaUrl = activeScene?.imageUrl || activeScene?.image?.imageUrl;
  const hasAnimation = Boolean(
    activeScene?.animationData &&
      (activeScene.animationData.characterInstances?.length > 0 || activeScene.animationData.background?.imageUrl)
  );

  const effectiveAnimationData: VectorSceneData | null = activeScene?.animationData
    ? {
        ...activeScene.animationData,
        background: activeScene.animationData.background?.imageUrl
          ? activeScene.animationData.background
          : mediaUrl
          ? { imageUrl: mediaUrl, fit: 'cover' }
          : undefined,
      }
    : null;

  return (
    <main className="ed-canvas-area ed-center-canvas" ref={containerRef}>
      {/* 16:9 Aspect Ratio Viewport */}
      <div className="ed-preview-viewport">
        {/* Preview Mode Badge Overlay */}
        <div className="ed-preview-badge-overlay">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            {previewMode === 'export' ? (
              <>
                <FilmIcon size={12} />
                <span>Full Movie Export</span>
              </>
            ) : (
              <span>Scene {(activeScene?.number ?? 1)}</span>
            )}
          </span>

          {/* 2D Vector Animation Indicator Badge */}
          {previewMode === 'scene' && hasAnimation && (
            <span
              style={{
                marginLeft: '4px',
                background: 'rgba(139, 92, 246, 0.22)',
                border: '1px solid rgba(139, 92, 246, 0.5)',
                color: '#c4b5fd',
                fontSize: '10px',
                borderRadius: '3px',
                padding: '1px 6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              <SparklesIcon size={10} />
              <span>2D Animation ({activeScene?.animationData?.characterInstances?.length || 0})</span>
            </span>
          )}

          {exportVideoUrl && (
            <button
              type="button"
              style={{
                marginLeft: '6px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: 'white',
                fontSize: '10px',
                borderRadius: '3px',
                padding: '2px 6px',
                cursor: 'pointer',
              }}
              onClick={() => onTogglePreviewMode && onTogglePreviewMode(previewMode === 'scene' ? 'export' : 'scene')}
            >
              Switch to {previewMode === 'scene' ? 'Full Movie' : 'Scene'}
            </button>
          )}

          {/* If scene has both animation/video or image/video, offer toggle */}
          {previewMode === 'scene' && activeScene?.videoUrl && (
            <button
              type="button"
              style={{
                marginLeft: '6px',
                background: forceStillPreview ? 'rgba(139, 92, 246, 0.45)' : 'rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                color: 'white',
                fontSize: '10px',
                borderRadius: '3px',
                padding: '2px 6px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
              onClick={() => setForceStillPreview(!forceStillPreview)}
              title={hasAnimation ? 'Toggle between 2D Animation canvas and rendered video clip' : 'Toggle between rendered video clip and still reference image'}
            >
              {forceStillPreview ? (
                <>
                  <FilmIcon size={11} />
                  <span>Switch to Video Clip</span>
                </>
              ) : hasAnimation ? (
                <>
                  <SparklesIcon size={11} />
                  <span>View 2D Canvas</span>
                </>
              ) : (
                <>
                  <ImageIcon size={11} />
                  <span>View Still Image</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Loading Overlay */}
        {(isGeneratingImage || isGeneratingVideo) && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(9, 14, 24, 0.85)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              zIndex: 20,
              color: '#ffffff',
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                border: '3px solid rgba(139, 92, 246, 0.25)',
                borderTopColor: '#8b5cf6',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <span style={{ fontSize: '13px', fontWeight: 600 }}>
              {isGeneratingImage ? 'Generating Scene Image...' : 'Rendering Video Clip (Ken Burns / AI)...'}
            </span>
          </div>
        )}

        {/* Content Rendering */}
        {videoError ? (
          <div className="ed-preview-empty-state">
            <AlertTriangleIcon size={36} color="#f87171" />
            <div className="ed-preview-empty-title">Video Playback Error</div>
            <div className="ed-preview-empty-desc">{videoError}</div>
            <button
              type="button"
              className="ed-btn-action"
              onClick={() => {
                setVideoError(null);
                if (videoRef.current) {
                  videoRef.current.load();
                }
              }}
            >
              Retry Video Playback
            </button>
          </div>
        ) : previewMode === 'export' && exportVideoUrl ? (
          <video
            ref={videoRef}
            src={resolveAssetUrl(exportVideoUrl)}
            className="ed-preview-media"
            controls={false}
            playsInline
            onError={() => setVideoError('Full movie export video failed to load.')}
          />
        ) : hasAnimation && !forceStillPreview && effectiveAnimationData ? (
          <VectorSceneCanvas
            animationData={effectiveAnimationData}
            currentTimeMs={currentTimeMs}
            sceneStartMs={(activeScene as any)?.startTimeMs ?? activeScene?.startMs ?? 0}
            selectedInstanceId={selectedInstanceId || null}
            onSelectInstance={onSelectInstance || (() => {})}
            onUpdateInstance={onUpdateInstance || (() => {})}
            onUpdateAnimationData={onUpdateAnimationData}
          />
        ) : activeScene?.videoUrl && !forceStillPreview ? (
          <video
            ref={videoRef}
            src={resolveAssetUrl(activeScene.videoUrl)}
            className="ed-preview-media"
            controls={false}
            playsInline
            onError={() => setVideoError('Scene video clip failed to load.')}
          />
        ) : mediaUrl ? (
          <img
            src={resolveAssetUrl(mediaUrl)}
            alt={activeScene?.title || 'Scene Preview'}
            className="ed-preview-media"
          />
        ) : (
          <div className="ed-preview-empty-state">
            <ImageIcon size={40} color="var(--color-text-faint)" />
            <div className="ed-preview-empty-title">
              {activeScene ? activeScene.title : 'No Scene Selected'}
            </div>
            <div className="ed-preview-empty-desc">
              {activeScene?.visualPrompt ||
                activeScene?.narration ||
                'This scene has no generated visuals yet. Click below to generate an AI image for this scene.'}
            </div>
            {onGenerateImage && activeScene && (
              <button
                type="button"
                className="ed-btn-action primary"
                onClick={onGenerateImage}
                disabled={isGeneratingImage}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <SparklesIcon size={14} />
                <span>{isGeneratingImage ? 'Generating Image...' : 'Generate Scene Image'}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Preview Transport Scrubber Bar */}
      <div className="ed-preview-controls-bar">
        <button
          type="button"
          className="ed-play-btn"
          style={{ width: '28px', height: '28px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={onTogglePlay}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {isPlaying ? <PauseIcon size={12} color="#ffffff" /> : <PlayIcon size={12} color="#ffffff" />}
        </button>

        <input
          type="range"
          className="ed-scrubber"
          min="0"
          max={Math.max(1000, totalDurationMs)}
          step="50"
          value={currentTimeMs}
          onChange={(e) => onSeek(parseInt(e.target.value, 10))}
        />

        <div style={{ fontFamily: 'monospace', fontSize: '12px', minWidth: '120px', textAlign: 'right' }}>
          <span>{formatTimeMs(currentTimeMs)}</span>
          <span style={{ color: 'var(--ed-text-faint)' }}> / {formatTimeMs(totalDurationMs)}</span>
        </div>

        {/* Preview volume control slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '6px' }}>
          <button
            type="button"
            className="ed-icon-btn"
            style={{ width: '24px', height: '24px', border: 'none', background: 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setPreviewVolume(previewVolume > 0 ? 0 : 1)}
            title={previewVolume > 0 ? 'Mute' : 'Unmute'}
          >
            {previewVolume === 0 ? <VolumeMuteIcon size={14} color="#94a3b8" /> : <VolumeHighIcon size={14} color="#94a3b8" />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={previewVolume}
            onChange={(e) => setPreviewVolume(parseFloat(e.target.value))}
            style={{ width: '55px', accentColor: 'var(--ed-accent)', cursor: 'pointer', height: '4px' }}
            title={`Preview Volume: ${Math.round(previewVolume * 100)}%`}
          />
        </div>

        <button
          type="button"
          className="ed-icon-btn"
          style={{ width: '28px', height: '28px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={handleToggleFullscreen}
          title="Toggle Fullscreen Canvas"
        >
          <MaximizeIcon size={14} />
        </button>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
};
