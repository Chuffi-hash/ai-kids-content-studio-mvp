import React, { useRef, useEffect, useState } from "react";
import { EditorScene } from "../../types/editor";
import { CharacterInstance, VectorSceneData, AspectRatioType } from "../../types/animation";
import { VectorSceneCanvas } from "./animation/VectorSceneCanvas";
import { formatTimeMs } from "../../utils/timingEngine";
import { resolveAssetUrl } from "../../utils/urlHelper";
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
} from "../common/Icons";

interface PreviewCanvasProps {
  activeScene: EditorScene | null;
  isPlaying: boolean;
  currentTimeMs: number;
  totalDurationMs: number;
  onTogglePlay: () => void;
  onSeek: (targetMs: number) => void;
  masterVolume?: number;
  isMuted?: boolean;
  onVolumeChange?: (volume: number) => void;
  onToggleMute?: () => void;
  onGenerateImage?: () => void;
  isGeneratingImage?: boolean;
  isGeneratingVideo?: boolean;
  previewMode?: "scene" | "export";
  exportVideoUrl?: string | null;
  onTogglePreviewMode?: (mode: "scene" | "export") => void;
  selectedMusic?: string | null;
  musicVolume?: number;
  selectedInstanceId?: string | null;
  onSelectInstance?: (instanceId: string | null) => void;
  onUpdateInstance?: (
    instanceId: string,
    updates: Partial<CharacterInstance>,
  ) => void;
  selectedOverlayId?: string | null;
  onSelectOverlay?: (overlayId: string | null) => void;
  onUpdateOverlay?: (overlayId: string, updates: any) => void;
  onUpdateAnimationData?: (newData: VectorSceneData) => void;
  activeFormat?: AspectRatioType;
  onFormatChange?: (format: AspectRatioType) => void;
}

export const PreviewCanvas: React.FC<PreviewCanvasProps> = ({
  activeScene,
  isPlaying,
  currentTimeMs,
  totalDurationMs,
  onTogglePlay,
  onSeek,
  masterVolume = 1.0,
  isMuted = false,
  onVolumeChange,
  onToggleMute,
  onGenerateImage,
  isGeneratingImage,
  isGeneratingVideo,
  previewMode = "scene",
  exportVideoUrl,
  onTogglePreviewMode,
  selectedMusic,
  musicVolume,
  selectedInstanceId,
  onSelectInstance,
  onUpdateInstance,
  selectedOverlayId,
  onSelectOverlay,
  onUpdateOverlay,
  onUpdateAnimationData,
  activeFormat: propsActiveFormat,
  onFormatChange,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [forceStillPreview, setForceStillPreview] = useState(false);
  const [activeFormat, setActiveFormat] = useState<AspectRatioType>(
    propsActiveFormat || "16:9"
  );
  const [showSafeGuides, setShowSafeGuides] = useState<boolean>(true);

  // Sync format purely with global preview format prop if supplied
  useEffect(() => {
    if (propsActiveFormat) {
      setActiveFormat(propsActiveFormat);
    }
  }, [propsActiveFormat]);

  const handleFormatChange = (fmt: AspectRatioType) => {
    setActiveFormat(fmt);
    if (onFormatChange) {
      onFormatChange(fmt);
    }
    // Format switcher above the canvas is strictly a preview viewport control.
    // It does NOT mutate or auto-save per-scene aspect ratios to the database.
  };

  // Scrubber drag management to avoid fighting with the 60fps playback loop
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [scrubValue, setScrubValue] = useState<number>(currentTimeMs);

  useEffect(() => {
    if (!isScrubbing) {
      setScrubValue(currentTimeMs);
    }
  }, [currentTimeMs, isScrubbing]);

  // Sync playback state with underlying HTML5 video if playing a video asset
  useEffect(() => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.play().catch((err) => {
        // Autoplay restrictions or user interrupted
        console.warn("Preview video play interrupted:", err);
      });
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying]);

  // Sync video volume with master volume and mute state
  useEffect(() => {
    if (videoRef.current) {
      const effectiveVol = isMuted ? 0 : Math.max(0, Math.min(1, masterVolume));
      videoRef.current.volume = effectiveVol;
      videoRef.current.muted = effectiveVol === 0;
    }
  }, [masterVolume, isMuted]);

  // Sync video current time when seeking
  useEffect(() => {
    if (!videoRef.current) return;

    // In export mode, the video covers the full timeline
    if (previewMode === "export") {
      const targetSec = currentTimeMs / 1000;
      if (Math.abs(videoRef.current.currentTime - targetSec) > 0.3) {
        videoRef.current.currentTime = targetSec;
      }
    } else if (activeScene) {
      // In scene mode, the scene has its own start offset on the global timeline
      const sceneOffsetMs =
        (activeScene as any).startTimeMs ?? activeScene.startMs ?? 0;
      const sceneRelativeSec = Math.max(
        0,
        (currentTimeMs - sceneOffsetMs) / 1000,
      );
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
        console.warn("Error attempting fullscreen:", err);
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.warn("Error exiting fullscreen:", err);
      });
    }
  };

  const mediaUrl = activeScene?.imageUrl || activeScene?.image?.imageUrl;
  const hasAnimation = Boolean(
    activeScene?.animationData &&
    ((activeScene.animationData.characterInstances?.length ?? 0) > 0 ||
      (activeScene.animationData.overlays?.length ?? 0) > 0 ||
      activeScene.animationData.background?.imageUrl),
  );

  const effectiveAnimationData: VectorSceneData | null =
    activeScene?.animationData
      ? {
          ...activeScene.animationData,
          background: activeScene.animationData.background?.imageUrl
            ? activeScene.animationData.background
            : mediaUrl
              ? { imageUrl: mediaUrl, fit: "cover" }
              : undefined,
        }
      : null;

  return (
    <main className="ed-canvas-area ed-center-canvas" ref={containerRef}>
      {/* Dynamic Aspect Ratio Viewport */}
      <div
        className={`ed-preview-viewport format-${activeFormat.replace(":", "-")}`}
      >
        {/* Mobile Reel / Shorts Safe Area Guidelines */}
        {activeFormat === "9:16" && showSafeGuides && (
          <div className="ed-safe-area-guide">
            <div className="ed-safe-area-header">
              <span>Top UI / Profile Safe Area</span>
            </div>
            <div className="ed-safe-area-center">
              <div className="ed-safe-area-badge">
                Vertical Reel / Short Action Zone
              </div>
            </div>
            <div className="ed-safe-area-footer">
              <span>Bottom Captions & Action Safe Area</span>
            </div>
          </div>
        )}

        {/* Preview Mode Badge Overlay */}
        <div className="ed-preview-badge-overlay">
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
          >
            {previewMode === "export" ? (
              <>
                <FilmIcon size={12} />
                <span>Full Movie Export</span>
              </>
            ) : (
              <span>Scene {activeScene?.number ?? 1}</span>
            )}
          </span>

          {/* 2D Vector Animation Indicator Badge */}
          {previewMode === "scene" && hasAnimation && (
            <span
              style={{
                marginLeft: "4px",
                background: "rgba(139, 92, 246, 0.22)",
                border: "1px solid rgba(139, 92, 246, 0.5)",
                color: "#c4b5fd",
                fontSize: "10px",
                borderRadius: "3px",
                padding: "1px 6px",
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
              }}
            >
              <SparklesIcon size={10} />
              <span>
                2D Animation (
                {activeScene?.animationData?.characterInstances?.length || 0})
              </span>
            </span>
          )}

          {exportVideoUrl && (
            <button
              type="button"
              style={{
                marginLeft: "6px",
                background: "rgba(255, 255, 255, 0.1)",
                border: "none",
                color: "white",
                fontSize: "10px",
                borderRadius: "3px",
                padding: "2px 6px",
                cursor: "pointer",
              }}
              onClick={() =>
                onTogglePreviewMode &&
                onTogglePreviewMode(
                  previewMode === "scene" ? "export" : "scene",
                )
              }
            >
              Switch to {previewMode === "scene" ? "Full Movie" : "Scene"}
            </button>
          )}

          {/* If scene has both animation/video or image/video, offer toggle */}
          {previewMode === "scene" && activeScene?.videoUrl && (
            <button
              type="button"
              style={{
                marginLeft: "6px",
                background: forceStillPreview
                  ? "rgba(139, 92, 246, 0.45)"
                  : "rgba(255, 255, 255, 0.15)",
                border: "1px solid rgba(255, 255, 255, 0.25)",
                color: "white",
                fontSize: "10px",
                borderRadius: "3px",
                padding: "2px 6px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
              onClick={() => setForceStillPreview(!forceStillPreview)}
              title={
                hasAnimation
                  ? "Toggle between 2D Animation canvas and rendered video clip"
                  : "Toggle between rendered video clip and still reference image"
              }
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

          {/* Format Switcher Pills */}
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            {[
              { id: "16:9", label: "16:9 Land" },
              { id: "9:16", label: "9:16 Reel" },
              { id: "1:1", label: "1:1 Sq" },
              { id: "4:5", label: "4:5 Post" },
            ].map((fmt) => (
              <button
                key={fmt.id}
                type="button"
                style={{
                  background:
                    activeFormat === fmt.id
                      ? fmt.id === "9:16"
                        ? "#ec4899"
                        : "var(--ed-accent)"
                      : "rgba(255, 255, 255, 0.1)",
                  border:
                    "1px solid " +
                    (activeFormat === fmt.id
                      ? fmt.id === "9:16"
                        ? "#ec4899"
                        : "var(--ed-accent)"
                      : "rgba(255, 255, 255, 0.2)"),
                  color: "white",
                  fontSize: "10px",
                  borderRadius: "4px",
                  padding: "2px 6px",
                  cursor: "pointer",
                  fontWeight: activeFormat === fmt.id ? 600 : 400,
                }}
                onClick={() => handleFormatChange(fmt.id as AspectRatioType)}
              >
                {fmt.label}
              </button>
            ))}
            {activeFormat === "9:16" && (
              <button
                type="button"
                style={{
                  background: showSafeGuides
                    ? "rgba(56, 189, 248, 0.25)"
                    : "rgba(255, 255, 255, 0.1)",
                  border:
                    "1px solid " +
                    (showSafeGuides ? "#38bdf8" : "rgba(255, 255, 255, 0.2)"),
                  color: showSafeGuides ? "#7dd3fc" : "#94a3b8",
                  fontSize: "10px",
                  borderRadius: "4px",
                  padding: "2px 6px",
                  cursor: "pointer",
                }}
                onClick={() => setShowSafeGuides(!showSafeGuides)}
                title="Toggle mobile safe area guidelines"
              >
                Guides {showSafeGuides ? "On" : "Off"}
              </button>
            )}
          </div>
        </div>

        {/* Loading Overlay */}
        {(isGeneratingImage || isGeneratingVideo) && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(9, 14, 24, 0.85)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
              zIndex: 20,
              color: "#ffffff",
            }}
          >
            <div
              style={{
                width: "36px",
                height: "36px",
                border: "3px solid rgba(139, 92, 246, 0.25)",
                borderTopColor: "#8b5cf6",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <span style={{ fontSize: "13px", fontWeight: 600 }}>
              {isGeneratingImage
                ? "Generating Scene Image..."
                : "Rendering Video Clip (Ken Burns / AI)..."}
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
        ) : previewMode === "export" && exportVideoUrl ? (
          <video
            ref={videoRef}
            src={resolveAssetUrl(exportVideoUrl)}
            className="ed-preview-media"
            controls={false}
            playsInline
            onError={() =>
              setVideoError("Full movie export video failed to load.")
            }
          />
        ) : hasAnimation && !forceStillPreview && effectiveAnimationData ? (
          <VectorSceneCanvas
            animationData={effectiveAnimationData}
            currentTimeMs={currentTimeMs}
            sceneStartMs={
              (activeScene as any)?.startTimeMs ?? activeScene?.startMs ?? 0
            }
            activeFormat={activeFormat}
            selectedInstanceId={selectedInstanceId || null}
            onSelectInstance={onSelectInstance || (() => {})}
            onUpdateInstance={onUpdateInstance || (() => {})}
            selectedOverlayId={selectedOverlayId || null}
            onSelectOverlay={onSelectOverlay}
            onUpdateOverlay={onUpdateOverlay}
            onUpdateAnimationData={onUpdateAnimationData}
          />
        ) : activeScene?.videoUrl && !forceStillPreview ? (
          <video
            ref={videoRef}
            src={resolveAssetUrl(activeScene.videoUrl)}
            className="ed-preview-media"
            controls={false}
            playsInline
            onError={() => setVideoError("Scene video clip failed to load.")}
          />
        ) : mediaUrl ? (
          <img
            src={resolveAssetUrl(mediaUrl)}
            alt={activeScene?.title || "Scene Preview"}
            className="ed-preview-media"
          />
        ) : (
          <div className="ed-preview-empty-state">
            <ImageIcon size={40} color="var(--color-text-faint)" />
            <div className="ed-preview-empty-title">
              {activeScene ? activeScene.title : "No Scene Selected"}
            </div>
            <div className="ed-preview-empty-desc">
              {activeScene?.visualPrompt ||
                activeScene?.narration ||
                "This scene has no generated visuals yet. Click below to generate an AI image for this scene."}
            </div>
            {onGenerateImage && activeScene && (
              <button
                type="button"
                className="ed-btn-action primary"
                onClick={onGenerateImage}
                disabled={isGeneratingImage}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <SparklesIcon size={14} />
                <span>
                  {isGeneratingImage
                    ? "Generating Image..."
                    : "Generate Scene Image"}
                </span>
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
          style={{
            width: "28px",
            height: "28px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={onTogglePlay}
          title={isPlaying ? "Pause (Space)" : "Play (Space)"}
        >
          {isPlaying ? (
            <PauseIcon size={12} color="#ffffff" />
          ) : (
            <PlayIcon size={12} color="#ffffff" />
          )}
        </button>

        <input
          type="range"
          className="ed-scrubber"
          min="0"
          max={Math.max(1, totalDurationMs)}
          step="1"
          value={isScrubbing ? scrubValue : currentTimeMs}
          onPointerDown={() => setIsScrubbing(true)}
          onPointerUp={() => {
            setIsScrubbing(false);
            onSeek(scrubValue);
          }}
          onChange={(e) => {
            const val = Number(e.target.value);
            setScrubValue(val);
            onSeek(val);
          }}
          onKeyDown={(e) => {
            const stepMs = e.shiftKey ? 2000 : 500;
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              onSeek(Math.max(0, currentTimeMs - stepMs));
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              onSeek(Math.min(totalDurationMs, currentTimeMs + stepMs));
            } else if (e.key === "Home") {
              e.preventDefault();
              onSeek(0);
            } else if (e.key === "End") {
              e.preventDefault();
              onSeek(totalDurationMs);
            }
          }}
          title={`Playhead: ${formatTimeMs(currentTimeMs)} (Drag or click to seek)`}
        />

        <div
          style={{
            fontFamily: "monospace",
            fontSize: "12px",
            minWidth: "120px",
            textAlign: "right",
          }}
        >
          <span>{formatTimeMs(currentTimeMs)}</span>
          <span style={{ color: "var(--ed-text-faint)" }}>
            {" "}
            / {formatTimeMs(totalDurationMs)}
          </span>
        </div>

        {/* Master volume control slider */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            marginLeft: "6px",
          }}
        >
          <button
            type="button"
            className="ed-icon-btn"
            style={{
              width: "26px",
              height: "26px",
              border: "none",
              background: "transparent",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
            onClick={onToggleMute || (() => {})}
            title={isMuted || masterVolume === 0 ? "Unmute" : "Mute"}
          >
            {isMuted || masterVolume === 0 ? (
              <VolumeMuteIcon size={15} color="#f87171" />
            ) : (
              <VolumeHighIcon size={15} color="#c4b5fd" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : masterVolume}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (onVolumeChange) onVolumeChange(val);
            }}
            className="ed-volume-slider"
            title={`Master Volume: ${Math.round((isMuted ? 0 : masterVolume) * 100)}%`}
          />
          <span
            style={{
              fontSize: "11px",
              color: "var(--ed-text-muted)",
              fontFamily: "monospace",
              minWidth: "28px",
            }}
          >
            {Math.round((isMuted ? 0 : masterVolume) * 100)}%
          </span>
        </div>

        <button
          type="button"
          className="ed-icon-btn"
          style={{
            width: "28px",
            height: "28px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
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
