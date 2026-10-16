import React from 'react';
import {
  CharacterInstance,
  AnimationClip,
  VectorSceneData,
  AnimationActionType,
  MotionPath,
} from '../../../types/animation';
import { getVectorRig } from '../../../assets/characters/defaultCharacters';
import { TrashIcon, CheckIcon } from '../../common/Icons';

interface CharacterAnimationInspectorProps {
  instance: CharacterInstance;
  animationData: VectorSceneData;
  sceneDurationMs: number;
  onUpdateInstance: (instanceId: string, updates: Partial<CharacterInstance>) => void;
  onUpdateAnimationData: (newData: VectorSceneData) => void;
  onRemoveInstance: (instanceId: string) => void;
}

export const CharacterAnimationInspector: React.FC<CharacterAnimationInspectorProps> = ({
  instance,
  animationData,
  sceneDurationMs,
  onUpdateInstance,
  onUpdateAnimationData,
  onRemoveInstance,
}) => {
  const rig = getVectorRig(instance.characterId);
  const clips = animationData.animationClips || [];

  // Find clip for this instance or create default if none exists
  let clip = clips.find((c) => c.instanceId === instance.instanceId);
  if (!clip) {
    clip = {
      clipId: `clip-${Date.now()}`,
      instanceId: instance.instanceId,
      action: 'walk',
      startMs: 0,
      durationMs: sceneDurationMs || 5000,
      loop: true,
      motionMode: 'in_place',
    };
  }

  const handleUpdateClip = (clipUpdates: Partial<AnimationClip>) => {
    const existingIndex = clips.findIndex((c) => c.instanceId === instance.instanceId);
    let updatedClips: AnimationClip[];

    if (existingIndex >= 0) {
      updatedClips = clips.map((c, i) => (i === existingIndex ? { ...c, ...clipUpdates } : c));
    } else {
      updatedClips = [...clips, { ...clip!, ...clipUpdates }];
    }

    onUpdateAnimationData({
      ...animationData,
      animationClips: updatedClips,
    });
  };

  const handleLayerOrder = (direction: 'up' | 'down') => {
    const delta = direction === 'up' ? 1 : -1;
    onUpdateInstance(instance.instanceId, {
      zIndex: Math.max(0, (instance.zIndex || 1) + delta),
    });
  };

  return (
    <div className="char-animation-inspector" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 1. Header / Identity */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--ed-text)' }}>
            {instance.name || rig.name}
          </h4>
          <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>
            Vector Rig • {rig.species}
          </span>
        </div>
        <button
          type="button"
          className="ed-tool-btn danger"
          onClick={() => onRemoveInstance(instance.instanceId)}
          title="Remove character from scene"
          style={{ padding: '4px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        >
          <TrashIcon size={12} />
          <span>Remove</span>
        </button>
      </div>

      {/* 2. Position & Transform Controls */}
      <div className="ed-inspector-section">
        <label className="ed-field-label">Transform & Placement</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>X (Canvas px)</span>
            <input
              type="number"
              className="ed-input"
              value={instance.x}
              onChange={(e) => onUpdateInstance(instance.instanceId, { x: parseInt(e.target.value, 10) || 0 })}
            />
          </div>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>Y (Canvas px)</span>
            <input
              type="number"
              className="ed-input"
              value={instance.y}
              onChange={(e) => onUpdateInstance(instance.instanceId, { y: parseInt(e.target.value, 10) || 0 })}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>Scale ({Math.round(instance.scale * 100)}%)</span>
            <input
              type="range"
              min="0.3"
              max="2.5"
              step="0.05"
              value={instance.scale}
              onChange={(e) => onUpdateInstance(instance.instanceId, { scale: parseFloat(e.target.value) })}
              style={{ width: '100%', accentColor: 'var(--ed-accent)' }}
            />
          </div>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>Rotation ({instance.rotation}°)</span>
            <input
              type="range"
              min="-180"
              max="180"
              step="5"
              value={instance.rotation}
              onChange={(e) => onUpdateInstance(instance.instanceId, { rotation: parseInt(e.target.value, 10) })}
              style={{ width: '100%', accentColor: 'var(--ed-accent)' }}
            />
          </div>
        </div>

        {/* Flip & Layer ordering */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
          <button
            type="button"
            className={`ed-tool-btn ${instance.flipX ? 'primary' : ''}`}
            onClick={() => onUpdateInstance(instance.instanceId, { flipX: !instance.flipX })}
            style={{ flex: 1, fontSize: '11px' }}
          >
            {instance.flipX ? 'Facing Left ◄' : 'Facing Right ►'}
          </button>
          <button
            type="button"
            className="ed-tool-btn"
            onClick={() => handleLayerOrder('up')}
            style={{ fontSize: '11px' }}
            title="Bring Forward in Z-Index"
          >
            ▲ Layer
          </button>
          <button
            type="button"
            className="ed-tool-btn"
            onClick={() => handleLayerOrder('down')}
            style={{ fontSize: '11px' }}
            title="Send Backward in Z-Index"
          >
            ▼ Layer
          </button>
        </div>
      </div>

      {/* 3. Animation Clip Action Controls */}
      <div className="ed-inspector-section">
        <label className="ed-field-label">Animation Action</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginBottom: '12px' }}>
          {(['walk', 'wave', 'idle', 'jump'] as AnimationActionType[]).map((action) => (
            <button
              key={action}
              type="button"
              className={`ed-tool-btn ${clip?.action === action ? 'primary' : ''}`}
              style={{
                textTransform: 'capitalize',
                fontSize: '11px',
                padding: '6px 4px',
                background: clip?.action === action ? 'var(--ed-accent)' : undefined,
                color: clip?.action === action ? '#ffffff' : undefined,
              }}
              onClick={() => handleUpdateClip({ action })}
            >
              {action}
            </button>
          ))}
        </div>

        {/* 4. Dual Walking Modes if action is walk */}
        {clip?.action === 'walk' && (
          <div
            style={{
              padding: '10px',
              backgroundColor: 'var(--ed-surface-elevated)',
              borderRadius: '6px',
              border: '1px solid var(--ed-border)',
              marginBottom: '12px',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
              Walking Mode
            </span>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
              <button
                type="button"
                className={`ed-tool-btn ${clip.motionMode === 'in_place' || !clip.motionMode ? 'primary' : ''}`}
                style={{ flex: 1, fontSize: '11px' }}
                onClick={() => handleUpdateClip({ motionMode: 'in_place' })}
              >
                In-Place (Treadmill)
              </button>
              <button
                type="button"
                className={`ed-tool-btn ${clip.motionMode === 'motion_path' ? 'primary' : ''}`}
                style={{ flex: 1, fontSize: '11px' }}
                onClick={() =>
                  handleUpdateClip({
                    motionMode: 'motion_path',
                    motionPath: clip?.motionPath || {
                      startX: Math.max(100, instance.x - 250),
                      startY: instance.y,
                      endX: Math.min(1180, instance.x + 250),
                      endY: instance.y,
                      easing: 'easeInOut',
                    },
                  })
                }
              >
                Motion Path ➔
              </button>
            </div>

            {clip.motionMode === 'motion_path' && clip.motionPath && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <div>
                    <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 600 }}>Start (X, Y)</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <input
                        type="number"
                        className="ed-input"
                        style={{ fontSize: '11px', padding: '4px 6px' }}
                        value={clip.motionPath.startX}
                        onChange={(e) =>
                          handleUpdateClip({
                            motionPath: { ...clip!.motionPath!, startX: parseInt(e.target.value, 10) || 0 },
                          })
                        }
                      />
                      <input
                        type="number"
                        className="ed-input"
                        style={{ fontSize: '11px', padding: '4px 6px' }}
                        value={clip.motionPath.startY}
                        onChange={(e) =>
                          handleUpdateClip({
                            motionPath: { ...clip!.motionPath!, startY: parseInt(e.target.value, 10) || 0 },
                          })
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: 600 }}>End (X, Y)</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <input
                        type="number"
                        className="ed-input"
                        style={{ fontSize: '11px', padding: '4px 6px' }}
                        value={clip.motionPath.endX}
                        onChange={(e) =>
                          handleUpdateClip({
                            motionPath: { ...clip!.motionPath!, endX: parseInt(e.target.value, 10) || 0 },
                          })
                        }
                      />
                      <input
                        type="number"
                        className="ed-input"
                        style={{ fontSize: '11px', padding: '4px 6px' }}
                        value={clip.motionPath.endY}
                        onChange={(e) =>
                          handleUpdateClip({
                            motionPath: { ...clip!.motionPath!, endY: parseInt(e.target.value, 10) || 0 },
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    className="ed-tool-btn"
                    style={{ flex: 1, fontSize: '10px' }}
                    onClick={() =>
                      handleUpdateClip({
                        motionPath: {
                          ...clip!.motionPath!,
                          startX: instance.x,
                          startY: instance.y,
                        },
                      })
                    }
                  >
                    Start from Current (X, Y)
                  </button>
                  <button
                    type="button"
                    className="ed-tool-btn"
                    style={{ flex: 1, fontSize: '10px' }}
                    onClick={() =>
                      handleUpdateClip({
                        motionPath: {
                          ...clip!.motionPath!,
                          endX: instance.x,
                          endY: instance.y,
                        },
                      })
                    }
                  >
                    End at Current (X, Y)
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 5. Clip Timing & Speed Multiplier */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>Start Time (s)</span>
            <input
              type="number"
              step="0.1"
              min="0"
              max={sceneDurationMs / 1000}
              className="ed-input"
              value={clip?.startMs ? clip.startMs / 1000 : 0}
              onChange={(e) =>
                handleUpdateClip({ startMs: Math.round((parseFloat(e.target.value) || 0) * 1000) })
              }
            />
          </div>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>Duration (s)</span>
            <input
              type="number"
              step="0.1"
              min="0.5"
              max={sceneDurationMs / 1000}
              className="ed-input"
              value={clip?.durationMs ? clip.durationMs / 1000 : sceneDurationMs / 1000}
              onChange={(e) =>
                handleUpdateClip({ durationMs: Math.round((parseFloat(e.target.value) || 1) * 1000) })
              }
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
          <label style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={clip?.loop !== false}
              onChange={(e) => handleUpdateClip({ loop: e.target.checked })}
              style={{ accentColor: 'var(--ed-accent)' }}
            />
            <span>Loop Action Cycle</span>
          </label>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>Speed:</span>
            {[0.75, 1.0, 1.5].map((spd) => (
              <button
                key={spd}
                type="button"
                className={`ed-tool-btn ${clip?.speedMultiplier === spd || (!clip?.speedMultiplier && spd === 1.0) ? 'primary' : ''}`}
                style={{ fontSize: '10px', padding: '2px 5px' }}
                onClick={() => handleUpdateClip({ speedMultiplier: spd })}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

