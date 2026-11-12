import React, { useState, useEffect } from 'react';
import { CinematicShot, EditorScene } from '../../types/editor';
import {
  fetchShotsForStory,
  planShotsForStory,
  updateShotData,
  regenerateShotPrompt,
  approveShotPrompt,
  associateShotAsset,
  deleteShotRecord,
} from '../../services/shot.service';
import {
  SparklesIcon,
  CheckIcon,
  TrashIcon,
  AlertTriangleIcon,
  CameraIcon,
  PlayIcon,
  ImageIcon,
} from '../common/Icons';

interface ShotPlanningPanelProps {
  storyId: string;
  activeSceneId?: string | null;
  scenes?: EditorScene[];
  flowProjectId?: string | null;
  onShotUpdated?: (shot: CinematicShot) => void;
}

export const ShotPlanningPanel: React.FC<ShotPlanningPanelProps> = ({
  storyId,
  activeSceneId,
  scenes = [],
  flowProjectId,
  onShotUpdated,
}) => {
  const [shots, setShots] = useState<CinematicShot[]>([]);
  const [loading, setLoading] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedShotId, setCopiedShotId] = useState<string | null>(null);
  const [copiedVideoShotId, setCopiedVideoShotId] = useState<string | null>(null);
  const [editingShotId, setEditingShotId] = useState<string | null>(null);

  useEffect(() => {
    if (storyId) {
      loadShots();
    }
  }, [storyId]);

  const loadShots = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchShotsForStory(storyId);
      setShots(res.shots || []);
    } catch (err: any) {
      console.warn('[ShotPlanningPanel] Notice loading shots:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePlanShots = async (forceRegenerate: boolean = false) => {
    setPlanning(true);
    setError(null);
    try {
      const res = await planShotsForStory(storyId, forceRegenerate);
      setShots(res.shots || []);
    } catch (err: any) {
      setError(err.message || 'Failed to plan cinematic shots');
    } finally {
      setPlanning(false);
    }
  };

  const handleUpdateField = async (shotId: string, updates: Partial<CinematicShot>) => {
    try {
      const res = await updateShotData(shotId, updates);
      setShots((prev) => prev.map((s) => (s.shotId === shotId ? res.shot : s)));
      onShotUpdated?.(res.shot);
    } catch (err: any) {
      setError(err.message || 'Failed to update shot');
    }
  };

  const handleRegeneratePrompt = async (shotId: string, type: 'background' | 'video' | 'both') => {
    try {
      const res = await regenerateShotPrompt(shotId, type);
      setShots((prev) => prev.map((s) => (s.shotId === shotId ? res.shot : s)));
      onShotUpdated?.(res.shot);
    } catch (err: any) {
      setError(err.message || 'Failed to regenerate prompt');
    }
  };

  const handleApproveShot = async (shotId: string) => {
    try {
      const res = await approveShotPrompt(shotId);
      setShots((prev) => prev.map((s) => (s.shotId === shotId ? res.shot : s)));
      onShotUpdated?.(res.shot);
    } catch (err: any) {
      setError(err.message || 'Failed to approve shot');
    }
  };

  const handleCopyPrompt = (shotId: string, text: string, isVideo: boolean = false) => {
    navigator.clipboard.writeText(text);
    if (isVideo) {
      setCopiedVideoShotId(shotId);
      setTimeout(() => setCopiedVideoShotId(null), 2500);
    } else {
      setCopiedShotId(shotId);
      setTimeout(() => setCopiedShotId(null), 2500);
    }
  };

  const handleOpenGoogleFlow = () => {
    const url = flowProjectId
      ? `https://flow.google.com/project/${flowProjectId}`
      : 'https://flow.google.com';
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleAssetUpload = async (shotId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video');
    const objectUrl = URL.createObjectURL(file);

    try {
      const res = await associateShotAsset(shotId, {
        type: isVideo ? 'video' : 'image',
        url: objectUrl,
      });
      setShots((prev) => prev.map((s) => (s.shotId === shotId ? res.shot : s)));
      onShotUpdated?.(res.shot);
    } catch (err: any) {
      setError(err.message || 'Failed to associate uploaded asset');
    }
  };

  // Filter shots if activeSceneId is provided, or show all
  const filteredShots = activeSceneId
    ? shots.filter((s) => s.sceneId === activeSceneId)
    : shots;

  return (
    <div className="shot-planning-container" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CameraIcon size={16} />
            <span>Cinematic Shot Breakdown</span>
            <span style={{ fontSize: '11px', background: 'rgba(124, 58, 237, 0.15)', color: '#8b5cf6', padding: '2px 8px', borderRadius: '12px' }}>
              {filteredShots.length} Shots
            </span>
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--ed-text-muted, #64748b)' }}>
            Each scene is directed into multiple camera angles, environment-only background prompts, and staging.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="ed-btn-action primary"
            onClick={() => handlePlanShots(shots.length > 0)}
            disabled={planning}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px' }}
          >
            <SparklesIcon size={13} />
            <span>{planning ? 'Planning Shots...' : shots.length > 0 ? 'Regenerate Shots' : 'Plan Shots with AI'}</span>
          </button>

          <button
            type="button"
            className="ed-btn-action"
            onClick={handleOpenGoogleFlow}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px', background: 'rgba(56, 189, 248, 0.15)', color: '#0284c7', borderColor: 'rgba(56, 189, 248, 0.4)' }}
            title="Open connected Google Flow workspace to generate assets manually"
          >
            <span>Open Google Flow</span>
            <span>↗</span>
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#dc2626', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangleIcon size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Empty State */}
      {filteredShots.length === 0 && !loading && !planning && (
        <div style={{ padding: '28px 16px', textAlign: 'center', background: 'var(--ed-surface-elevated, #f8fafc)', border: '1px dashed var(--ed-border, #cbd5e1)', borderRadius: '10px' }}>
          <CameraIcon size={32} color="#94a3b8" />
          <h4 style={{ margin: '10px 0 4px 0', fontSize: '14px', fontWeight: 600 }}>No Cinematic Shots Planned Yet</h4>
          <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: '#64748b', maxWidth: '380px', marginInline: 'auto' }}>
            Transform this scene into multiple camera setups with tailored background prompts, video prompts, and character staging.
          </p>
          <button
            type="button"
            className="ed-btn-action primary"
            onClick={() => handlePlanShots(false)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <SparklesIcon size={13} />
            <span>Generate Shot Breakdown</span>
          </button>
        </div>
      )}

      {/* Shot Cards List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {filteredShots.map((shot, idx) => {
          const isApproved = shot.approvalStatus === 'approved';
          const hasAsset = Boolean(shot.backgroundUrl || shot.videoUrl);

          return (
            <div
              key={shot.shotId}
              style={{
                background: 'var(--ed-surface, #ffffff)',
                border: '1px solid ' + (isApproved ? 'rgba(16, 185, 129, 0.4)' : 'var(--ed-border, #e2e8f0)'),
                borderRadius: '10px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              {/* Shot Top Row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, background: '#7c3aed', color: '#ffffff', padding: '2px 8px', borderRadius: '4px' }}>
                    Shot {shot.number}
                  </span>
                  <input
                    type="text"
                    value={shot.title}
                    onChange={(e) => handleUpdateField(shot.shotId, { title: e.target.value })}
                    style={{ fontSize: '13px', fontWeight: 600, border: 'none', background: 'transparent', outline: 'none', color: 'var(--ed-text, #0f172a)' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    {(shot.durationMs / 1000).toFixed(1)}s
                  </span>

                  <button
                    type="button"
                    onClick={() => handleApproveShot(shot.shotId)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      padding: '3px 8px',
                      borderRadius: '12px',
                      border: '1px solid ' + (isApproved ? 'rgba(16, 185, 129, 0.4)' : 'var(--ed-border, #cbd5e1)'),
                      background: isApproved ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                      color: isApproved ? '#059669' : '#64748b',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    <CheckIcon size={11} />
                    <span>{isApproved ? 'Approved' : 'Approve Shot'}</span>
                  </button>
                </div>
              </div>

              {/* Shot Framing & Camera Controls */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', fontSize: '11.5px' }}>
                <div>
                  <label style={{ display: 'block', color: '#64748b', marginBottom: '2px', fontWeight: 500 }}>Shot Type</label>
                  <select
                    value={shot.shotType}
                    onChange={(e) => handleUpdateField(shot.shotId, { shotType: e.target.value })}
                    style={{ width: '100%', padding: '4px 6px', borderRadius: '4px', border: '1px solid var(--ed-border, #cbd5e1)', background: 'var(--ed-surface, #fff)', fontSize: '12px' }}
                  >
                    <option value="wide_establishing">Wide Establishing</option>
                    <option value="medium_twoshot">Medium Two-Shot</option>
                    <option value="closeup_speaker">Close-Up Speaker</option>
                    <option value="character_focus">Character Focus</option>
                    <option value="extreme_wide">Extreme Wide</option>
                    <option value="medium">Medium</option>
                    <option value="closeup">Close-Up</option>
                    <option value="over_the_shoulder">Over the Shoulder</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', color: '#64748b', marginBottom: '2px', fontWeight: 500 }}>Camera Movement</label>
                  <select
                    value={shot.cameraMovement}
                    onChange={(e) => handleUpdateField(shot.shotId, { cameraMovement: e.target.value })}
                    style={{ width: '100%', padding: '4px 6px', borderRadius: '4px', border: '1px solid var(--ed-border, #cbd5e1)', background: 'var(--ed-surface, #fff)', fontSize: '12px' }}
                  >
                    <option value="static">Static</option>
                    <option value="slow_zoom_in">Slow Zoom In</option>
                    <option value="zoom_out">Zoom Out</option>
                    <option value="pan_left">Pan Left</option>
                    <option value="pan_right">Pan Right</option>
                    <option value="tracking">Tracking Shot</option>
                    <option value="push_in">Cinematic Push-In</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', color: '#64748b', marginBottom: '2px', fontWeight: 500 }}>Camera Angle</label>
                  <select
                    value={shot.cameraAngle}
                    onChange={(e) => handleUpdateField(shot.shotId, { cameraAngle: e.target.value })}
                    style={{ width: '100%', padding: '4px 6px', borderRadius: '4px', border: '1px solid var(--ed-border, #cbd5e1)', background: 'var(--ed-surface, #fff)', fontSize: '12px' }}
                  >
                    <option value="eye_level">Eye Level</option>
                    <option value="low_angle">Low Angle</option>
                    <option value="high_angle">High Angle</option>
                    <option value="birds_eye">Bird's-Eye View</option>
                  </select>
                </div>
              </div>

              {/* Background Prompt Card (Environment Only) */}
              <div style={{ background: 'var(--ed-surface-elevated, #f8fafc)', border: '1px solid var(--ed-border, #e2e8f0)', borderRadius: '6px', padding: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ed-text, #0f172a)' }}>
                    🌄 Environment Background Prompt (No Characters)
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => handleCopyPrompt(shot.shotId, shot.backgroundPrompt, false)}
                      style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--ed-border, #cbd5e1)', background: '#fff', cursor: 'pointer' }}
                    >
                      {copiedShotId === shot.shotId ? '✓ Copied' : 'Copy Prompt'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRegeneratePrompt(shot.shotId, 'background')}
                      style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--ed-border, #cbd5e1)', background: '#fff', cursor: 'pointer' }}
                    >
                      ↻ Regenerate (v{shot.promptHistory?.length || 1})
                    </button>
                  </div>
                </div>
                <textarea
                  rows={2}
                  value={shot.backgroundPrompt}
                  onChange={(e) => handleUpdateField(shot.shotId, { backgroundPrompt: e.target.value })}
                  style={{ width: '100%', boxSizing: 'border-box', fontSize: '12px', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--ed-border, #cbd5e1)', background: 'var(--ed-surface, #fff)', fontFamily: 'inherit', resize: 'vertical' }}
                />
              </div>

              {/* Video Prompt Card (For Google Flow / Veo) */}
              <div style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '6px', padding: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#0369a1' }}>
                    🎥 Video Generation Prompt (Google Flow / Veo)
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => handleCopyPrompt(shot.shotId, shot.videoPrompt, true)}
                      style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(56, 189, 248, 0.3)', background: '#fff', color: '#0284c7', cursor: 'pointer' }}
                    >
                      {copiedVideoShotId === shot.shotId ? '✓ Copied' : 'Copy Video Prompt'}
                    </button>
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: '11.5px', color: '#334155', lineHeight: 1.4 }}>
                  {shot.videoPrompt}
                </p>
              </div>

              {/* Asset Attachment / Import Footer */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {shot.backgroundUrl && (
                    <img
                      src={shot.backgroundUrl}
                      alt="Shot Asset"
                      style={{ width: '48px', height: '28px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    />
                  )}
                  <span style={{ fontSize: '11px', color: hasAsset ? '#059669' : '#64748b' }}>
                    {hasAsset ? '✓ Custom Asset Linked' : 'Using default stage backdrop'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '4px', border: '1px solid var(--ed-border, #cbd5e1)', background: 'var(--ed-surface, #fff)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <ImageIcon size={12} />
                    <span>Upload Asset</span>
                    <input
                      type="file"
                      accept="image/*,video/*"
                      onChange={(e) => handleAssetUpload(shot.shotId, e)}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
export default ShotPlanningPanel;
