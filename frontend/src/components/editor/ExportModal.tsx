import React, { useState, useEffect } from 'react';
import { EditorStory, ExportJobStatus } from '../../types/editor';
import { startExport, pollExportStatus } from '../../services/editor.service';
import { formatTimeMs, formatDurationHuman } from '../../utils/timingEngine';
import { getApiUrl, resolveAssetUrl } from '../../utils/urlHelper';
import { CloseIcon, AlertTriangleIcon, CheckIcon } from '../common/Icons';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  story: EditorStory;
  totalDurationMs: number;
  selectedMusic: string | null;
  musicVolume: number;
  onExportSuccess: (videoUrl: string) => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  story,
  totalDurationMs,
  selectedMusic,
  musicVolume,
  onExportSuccess,
}) => {
  const [resolution, setResolution] = useState<'1080p' | '720p'>('720p');
  const [format, setFormat] = useState<'16:9' | '9:16' | '1:1' | '4:5'>('16:9');
  const [sceneScope, setSceneScope] = useState<'all' | 'single'>('all');
  const [selectedSceneId, setSelectedSceneId] = useState<string>(story.scenes[0]?.sceneId || '');
  const [job, setJob] = useState<ExportJobStatus | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll job status if processing
  useEffect(() => {
    if (!job || job.status === 'completed' || job.status === 'failed') return;

    const interval = setInterval(async () => {
      try {
        const updated = await pollExportStatus(job.id);
        setJob(updated);
        if (updated.status === 'completed' && updated.downloadUrl) {
          onExportSuccess(resolveAssetUrl(updated.downloadUrl));
        }
      } catch (err: any) {
        console.error('Failed to poll export status:', err);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [job?.id, job?.status, onExportSuccess]);

  if (!isOpen) return null;

  const handleStartExport = async () => {
    setIsStarting(true);
    setError(null);
    try {
      const { job: startedJob } = await startExport(story.storyId, {
        resolution,
        fps: 30,
        backgroundMusic: selectedMusic,
        musicVolume,
        format,
        selectedSceneIds: sceneScope === 'single' && selectedSceneId ? [selectedSceneId] : undefined,
      });
      setJob(startedJob);
    } catch (err: any) {
      console.error('Failed to start export:', err);
      setError(err.message || 'Failed to start video export');
    } finally {
      setIsStarting(false);
    }
  };

  const fullDownloadUrl = job?.downloadUrl ? resolveAssetUrl(job.downloadUrl) : null;

  return (
    <div className="ed-modal-backdrop" onClick={onClose}>
      <div className="ed-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ed-modal-header">
          <h2>Export Video — {story.title}</h2>
          <button type="button" className="ed-icon-btn" onClick={onClose} style={{ border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="ed-modal-body">
          {error && (
            <div className="ed-warning-box" style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: '#ef4444', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangleIcon size={14} color="#fca5a5" />
              <span>{error}</span>
            </div>
          )}

          {!job ? (
            <>
              <div className="ed-field-group">
                <label className="ed-field-label">Format & Aspect Ratio</label>
                <select
                  className="ed-select"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as any)}
                >
                  <option value="16:9">16:9 Landscape (YouTube, Desktop, TV)</option>
                  <option value="9:16">9:16 Vertical Reel / Short (YouTube Shorts, Instagram Reels, TikTok)</option>
                  <option value="1:1">1:1 Square (Instagram Feed, Square Post)</option>
                  <option value="4:5">4:5 Portrait (Instagram & Facebook Feed)</option>
                </select>
              </div>

              <div className="ed-field-group">
                <label className="ed-field-label">Resolution</label>
                <select
                  className="ed-select"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value as any)}
                >
                  <option value="720p">720p HD ({format === '9:16' ? '720 × 1280' : (format === '1:1' ? '720 × 720' : (format === '4:5' ? '720 × 900' : '1280 × 720'))}) — Fast Assembly</option>
                  <option value="1080p">1080p Full HD ({format === '9:16' ? '1080 × 1920' : (format === '1:1' ? '1080 × 1080' : (format === '4:5' ? '1080 × 1350' : '1920 × 1080'))}) — Best Quality</option>
                </select>
              </div>

              <div className="ed-field-group">
                <label className="ed-field-label">Export Scope</label>
                <select
                  className="ed-select"
                  value={sceneScope}
                  onChange={(e) => setSceneScope(e.target.value as any)}
                >
                  <option value="all">All Scenes ({story.scenes.length} scenes) — Complete Video</option>
                  <option value="single">Single Scene Highlight (Short Clip / Reel)</option>
                </select>
              </div>

              {sceneScope === 'single' && (
                <div className="ed-field-group">
                  <label className="ed-field-label">Select Scene to Export</label>
                  <select
                    className="ed-select"
                    value={selectedSceneId}
                    onChange={(e) => setSelectedSceneId(e.target.value)}
                  >
                    {story.scenes.map((s, idx) => (
                      <option key={s.sceneId} value={s.sceneId}>
                        Scene {s.number || idx + 1}: {s.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div
                style={{
                  background: 'var(--ed-bg)',
                  padding: '12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div>
                  <strong>Timeline Duration:</strong> {formatTimeMs(totalDurationMs)} ({formatDurationHuman(totalDurationMs)})
                </div>
                <div>
                  <strong>Total Scenes:</strong> {story.scenes.length} scenes
                </div>
                <div>
                  <strong>Soundtrack:</strong> {selectedMusic || 'Voice narration only'}
                </div>
                <div>
                  <strong>Assembly Pipeline:</strong> Real FFmpeg H.264 video rendering with AAC synchronized audio
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  {job.status === 'completed' ? (
                    <>
                      <CheckIcon size={14} color="#34d399" />
                      <span>Video Assembly Complete!</span>
                    </>
                  ) : job.status === 'failed' ? (
                    <>
                      <AlertTriangleIcon size={14} color="#ef4444" />
                      <span>Video Assembly Failed</span>
                    </>
                  ) : (
                    <span>Assembling Video Timeline...</span>
                  )}
                </span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '13px' }}>
                  {job.progress}%
                </span>
              </div>

              <div className="ed-progress-bar-container">
                <div
                  className="ed-progress-bar-fill"
                  style={{
                    width: `${job.progress}%`,
                    background: job.status === 'failed' ? '#ef4444' : undefined,
                  }}
                />
              </div>

              <p style={{ margin: 0, fontSize: '12px', color: 'var(--ed-text-muted)' }}>
                {job.stage}
              </p>

              {job.error && (
                <div className="ed-warning-box" style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: '#ef4444', color: '#fca5a5' }}>
                  {job.error}
                </div>
              )}

              {job.status === 'completed' && fullDownloadUrl && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                  <a
                    href={fullDownloadUrl}
                    download={job.filename || 'story-video.mp4'}
                    className="ed-btn-action primary"
                    style={{ textDecoration: 'none', textAlign: 'center' }}
                  >
                    ⬇ Download MP4 Video ({job.filename})
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="ed-modal-footer">
          {!job ? (
            <>
              <button className="ed-tool-btn" onClick={onClose}>
                Cancel
              </button>
              <button
                className="ed-btn-action primary"
                onClick={handleStartExport}
                disabled={isStarting || story.scenes.length === 0}
              >
                {isStarting ? 'Starting Export...' : 'Render & Export MP4'}
              </button>
            </>
          ) : (
            <button className="ed-btn-action" onClick={onClose}>
              {job.status === 'completed' ? 'Done' : 'Close in Background'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

