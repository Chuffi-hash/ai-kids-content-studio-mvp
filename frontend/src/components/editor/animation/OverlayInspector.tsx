import React from 'react';
import { EducationalOverlay, EducationalOverlayType, VectorSceneData } from '../../../types/animation';
import { TrashIcon } from '../../common/Icons';

interface OverlayInspectorProps {
  animationData: VectorSceneData;
  selectedOverlayId: string | null;
  onSelectOverlay: (overlayId: string | null) => void;
  onUpdateOverlay: (overlayId: string, updates: Partial<EducationalOverlay>) => void;
  onAddOverlay: (type: EducationalOverlayType) => void;
  onDeleteOverlay: (overlayId: string) => void;
  onDuplicateOverlay?: (overlayId: string) => void;
  onReorderOverlay?: (overlayId: string, direction: 'up' | 'down') => void;
  playheadMs?: number;
}

const COLOR_SWATCHES = [
  '#ef4444', // Red
  '#f59e0b', // Amber / Gold
  '#38bdf8', // Sky Cyan
  '#10b981', // Emerald Green
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#ffffff', // White
  '#0f172a', // Slate
];

export const OverlayInspector: React.FC<OverlayInspectorProps> = ({
  animationData,
  selectedOverlayId,
  onSelectOverlay,
  onUpdateOverlay,
  onAddOverlay,
  onDeleteOverlay,
  onDuplicateOverlay,
  onReorderOverlay,
  playheadMs = 0,
}) => {
  const overlays = animationData.overlays || [];
  const selectedOverlay = overlays.find((o) => o.id === selectedOverlayId) || null;

  const getOverlayIcon = (type: EducationalOverlayType) => {
    switch (type) {
      case 'location_pin': return '📍';
      case 'route_line': return '〰️';
      case 'highlight_ring': return '⭕';
      case 'arrow_pointer': return '↗️';
      case 'callout_label': return '🏷️';
      case 'spotlight': return '🔦';
      case 'glow': return '💫';
      case 'sparkles': return '✨';
      case 'flying_birds': return '🦅';
      case 'moving_clouds': return '☁️';
      case 'title_card': return '🎬';
      default: return '✨';
    }
  };

  const getOverlayTypeName = (type: EducationalOverlayType) => {
    switch (type) {
      case 'location_pin': return 'Location Pin';
      case 'route_line': return 'Route Line';
      case 'highlight_ring': return 'Highlight Ring';
      case 'arrow_pointer': return 'Directional Arrow';
      case 'callout_label': return 'Callout Label';
      case 'spotlight': return 'Stage Spotlight';
      case 'glow': return 'Atmospheric Glow';
      case 'sparkles': return 'Magic Sparkles';
      case 'flying_birds': return 'Flying Birds';
      case 'moving_clouds': return 'Moving Clouds';
      case 'title_card': return 'Title Card';
      default: return 'Overlay';
    }
  };

  return (
    <div className="overlay-inspector" style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '12px' }}>
      {/* 1. Header & Add Overlay Buttons */}
      <div style={{ background: 'var(--ed-surface-elevated, #161f33)', padding: '12px', borderRadius: '8px', border: '1px solid var(--ed-border, #1e293b)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontWeight: 600, color: 'var(--ed-text, #f8fafc)', fontSize: '13px' }}>
            Educational Overlays & VFX ({overlays.length})
          </span>
        </div>

        {/* Quick Add Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
          <button
            type="button"
            className="ed-tool-btn"
            style={{ padding: '6px 4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}
            onClick={() => onAddOverlay('location_pin')}
            title="Add a geographic map pin / marker"
          >
            <span>📍</span> Pin
          </button>
          <button
            type="button"
            className="ed-tool-btn"
            style={{ padding: '6px 4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}
            onClick={() => onAddOverlay('route_line')}
            title="Add an animated drawing route line"
          >
            <span>〰️</span> Route
          </button>
          <button
            type="button"
            className="ed-tool-btn"
            style={{ padding: '6px 4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}
            onClick={() => onAddOverlay('highlight_ring')}
            title="Add a pulsing area highlight circle"
          >
            <span>⭕</span> Ring
          </button>
          <button
            type="button"
            className="ed-tool-btn"
            style={{ padding: '6px 4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}
            onClick={() => onAddOverlay('arrow_pointer')}
            title="Add an arrow pointer to direct attention"
          >
            <span>↗️</span> Arrow
          </button>
          <button
            type="button"
            className="ed-tool-btn"
            style={{ padding: '6px 4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}
            onClick={() => onAddOverlay('callout_label')}
            title="Add an educational title or callout badge"
          >
            <span>🏷️</span> Callout
          </button>
          <button
            type="button"
            className="ed-tool-btn"
            style={{ padding: '6px 4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}
            onClick={() => onAddOverlay('spotlight')}
            title="Add a dramatic stage spotlight beam"
          >
            <span>🔦</span> Spotlight
          </button>
          <button
            type="button"
            className="ed-tool-btn"
            style={{ padding: '6px 4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}
            onClick={() => onAddOverlay('glow')}
            title="Add a soft pulsing atmospheric aura"
          >
            <span>💫</span> Glow
          </button>
          <button
            type="button"
            className="ed-tool-btn"
            style={{ padding: '6px 4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}
            onClick={() => onAddOverlay('sparkles')}
            title="Add twinkling star particles"
          >
            <span>✨</span> Sparkles
          </button>
          <button
            type="button"
            className="ed-tool-btn"
            style={{ padding: '6px 4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}
            onClick={() => onAddOverlay('flying_birds')}
            title="Add animated flying birds in the sky"
          >
            <span>🦅</span> Birds
          </button>
          <button
            type="button"
            className="ed-tool-btn"
            style={{ padding: '6px 4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}
            onClick={() => onAddOverlay('moving_clouds')}
            title="Add drifting clouds across scene"
          >
            <span>☁️</span> Clouds
          </button>
          <button
            type="button"
            className="ed-tool-btn"
            style={{ padding: '6px 4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center', gridColumn: 'span 2' }}
            onClick={() => onAddOverlay('title_card')}
            title="Add a cinematic topic title or banner"
          >
            <span>🎬</span> Title Card
          </button>
        </div>
      </div>

      {/* 2. Scene Overlays List */}
      {overlays.length > 0 && (
        <div style={{ background: 'var(--ed-surface-elevated, #161f33)', padding: '10px', borderRadius: '8px', border: '1px solid var(--ed-border, #1e293b)' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted, #94a3b8)', marginBottom: '8px' }}>
            OVERLAYS IN SCENE
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '140px', overflowY: 'auto' }}>
            {overlays.map((o, idx) => {
              const isSelected = o.id === selectedOverlayId;
              return (
                <div
                  key={o.id}
                  onClick={() => onSelectOverlay(o.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: '5px',
                    background: isSelected ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                    border: isSelected ? '1px solid #38bdf8' : '1px solid transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                    <span style={{ fontSize: '14px' }}>{getOverlayIcon(o.type)}</span>
                    <span style={{ fontWeight: isSelected ? 600 : 400, color: isSelected ? '#38bdf8' : 'var(--ed-text, #f8fafc)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {o.label || o.title || getOverlayTypeName(o.type)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {onReorderOverlay && (
                      <>
                        <button
                          type="button"
                          className="btn-icon"
                          style={{ fontSize: '10px', padding: '2px 4px', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                          onClick={(e) => { e.stopPropagation(); onReorderOverlay(o.id, 'up'); }}
                          disabled={idx === 0}
                          title="Move layer up"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          style={{ fontSize: '10px', padding: '2px 4px', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                          onClick={(e) => { e.stopPropagation(); onReorderOverlay(o.id, 'down'); }}
                          disabled={idx === overlays.length - 1}
                          title="Move layer down"
                        >
                          ▼
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="btn-icon"
                      style={{ background: 'transparent', border: 'none', color: '#f43f5e', cursor: 'pointer', padding: '2px' }}
                      onClick={(e) => { e.stopPropagation(); onDeleteOverlay(o.id); }}
                      title="Delete overlay"
                    >
                      <TrashIcon size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Selected Overlay Properties Editor */}
      {selectedOverlay ? (
        <div style={{ background: 'var(--ed-surface-elevated, #161f33)', padding: '12px', borderRadius: '8px', border: '1px solid var(--ed-border, #1e293b)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--ed-border, #1e293b)', paddingBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '16px' }}>{getOverlayIcon(selectedOverlay.type)}</span>
              <span style={{ fontWeight: 600, color: 'var(--ed-text, #f8fafc)', fontSize: '13px' }}>
                {getOverlayTypeName(selectedOverlay.type)} Properties
              </span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {onDuplicateOverlay && (
                <button
                  type="button"
                  className="ed-tool-btn"
                  style={{ fontSize: '11px', padding: '2px 8px' }}
                  onClick={() => onDuplicateOverlay(selectedOverlay.id)}
                  title="Duplicate this overlay"
                >
                  Duplicate
                </button>
              )}
              <button
                type="button"
                className="btn-icon"
                style={{ background: 'transparent', border: 'none', color: '#f43f5e', cursor: 'pointer' }}
                onClick={() => onDeleteOverlay(selectedOverlay.id)}
                title="Delete overlay"
              >
                <TrashIcon size={13} />
              </button>
            </div>
          </div>

          {/* Layer Composition Position */}
          <div>
            <label style={{ fontSize: '11px', color: 'var(--ed-text-muted, #94a3b8)', display: 'block', marginBottom: '4px' }}>
              Layer Depth
            </label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className="ed-tool-btn"
                style={{
                  flex: 1,
                  fontSize: '11px',
                  padding: '5px',
                  background: selectedOverlay.layerPosition !== 'below_characters' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                  borderColor: selectedOverlay.layerPosition !== 'below_characters' ? '#38bdf8' : 'var(--ed-border, #1e293b)',
                  color: selectedOverlay.layerPosition !== 'below_characters' ? '#38bdf8' : 'var(--ed-text-muted)',
                }}
                onClick={() => onUpdateOverlay(selectedOverlay.id, { layerPosition: 'above_characters', zIndex: 5 })}
              >
                In Front of Characters
              </button>
              <button
                type="button"
                className="ed-tool-btn"
                style={{
                  flex: 1,
                  fontSize: '11px',
                  padding: '5px',
                  background: selectedOverlay.layerPosition === 'below_characters' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                  borderColor: selectedOverlay.layerPosition === 'below_characters' ? '#38bdf8' : 'var(--ed-border, #1e293b)',
                  color: selectedOverlay.layerPosition === 'below_characters' ? '#38bdf8' : 'var(--ed-text-muted)',
                }}
                onClick={() => onUpdateOverlay(selectedOverlay.id, { layerPosition: 'below_characters', zIndex: -1 })}
              >
                Behind Characters
              </button>
            </div>
          </div>

          {/* Label / Text Content */}
          {(selectedOverlay.type === 'callout_label' || selectedOverlay.type === 'location_pin') && (
            <div>
              <label style={{ fontSize: '11px', color: 'var(--ed-text-muted, #94a3b8)', display: 'block', marginBottom: '4px' }}>
                Text Label
              </label>
              <input
                type="text"
                className="ed-input"
                style={{ width: '100%', padding: '6px 8px', fontSize: '12px', background: '#0b101b', border: '1px solid #1e293b', borderRadius: '4px', color: '#ffffff' }}
                value={selectedOverlay.label || selectedOverlay.title || ''}
                placeholder="e.g. Mount Everest or Pacific Ocean"
                onChange={(e) => onUpdateOverlay(selectedOverlay.id, { label: e.target.value })}
              />
            </div>
          )}

          {/* Callout Subtitle / Description */}
          {selectedOverlay.type === 'callout_label' && (
            <div>
              <label style={{ fontSize: '11px', color: 'var(--ed-text-muted, #94a3b8)', display: 'block', marginBottom: '4px' }}>
                Subtitle / Description
              </label>
              <input
                type="text"
                className="ed-input"
                style={{ width: '100%', padding: '6px 8px', fontSize: '12px', background: '#0b101b', border: '1px solid #1e293b', borderRadius: '4px', color: '#ffffff' }}
                value={selectedOverlay.title || ''}
                placeholder="e.g. Highest Peak on Earth"
                onChange={(e) => onUpdateOverlay(selectedOverlay.id, { title: e.target.value })}
              />
            </div>
          )}

          {/* Coordinates (X, Y) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--ed-text-muted, #94a3b8)', display: 'block', marginBottom: '4px' }}>
                Position X
              </label>
              <input
                type="number"
                className="ed-input"
                style={{ width: '100%', padding: '5px 8px', fontSize: '12px', background: '#0b101b', border: '1px solid #1e293b', borderRadius: '4px', color: '#ffffff' }}
                value={selectedOverlay.x}
                onChange={(e) => onUpdateOverlay(selectedOverlay.id, { x: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--ed-text-muted, #94a3b8)', display: 'block', marginBottom: '4px' }}>
                Position Y
              </label>
              <input
                type="number"
                className="ed-input"
                style={{ width: '100%', padding: '5px 8px', fontSize: '12px', background: '#0b101b', border: '1px solid #1e293b', borderRadius: '4px', color: '#ffffff' }}
                value={selectedOverlay.y}
                onChange={(e) => onUpdateOverlay(selectedOverlay.id, { y: Number(e.target.value) || 0 })}
              />
            </div>
          </div>

          {/* Target Coordinates (for Route, Arrow, Connector) */}
          {(selectedOverlay.type === 'route_line' || selectedOverlay.type === 'arrow_pointer' || selectedOverlay.type === 'callout_label') && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--ed-text-muted, #94a3b8)', display: 'block', marginBottom: '4px' }}>
                  Target X
                </label>
                <input
                  type="number"
                  className="ed-input"
                  style={{ width: '100%', padding: '5px 8px', fontSize: '12px', background: '#0b101b', border: '1px solid #1e293b', borderRadius: '4px', color: '#ffffff' }}
                  value={selectedOverlay.targetX ?? selectedOverlay.x + 150}
                  onChange={(e) => onUpdateOverlay(selectedOverlay.id, { targetX: Number(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--ed-text-muted, #94a3b8)', display: 'block', marginBottom: '4px' }}>
                  Target Y
                </label>
                <input
                  type="number"
                  className="ed-input"
                  style={{ width: '100%', padding: '5px 8px', fontSize: '12px', background: '#0b101b', border: '1px solid #1e293b', borderRadius: '4px', color: '#ffffff' }}
                  value={selectedOverlay.targetY ?? selectedOverlay.y + 60}
                  onChange={(e) => onUpdateOverlay(selectedOverlay.id, { targetY: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
          )}

          {/* Callout Leader Line Toggle */}
          {selectedOverlay.type === 'callout_label' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="callout-leader-toggle"
                checked={selectedOverlay.hasConnectorLine || false}
                onChange={(e) => onUpdateOverlay(selectedOverlay.id, { hasConnectorLine: e.target.checked })}
              />
              <label htmlFor="callout-leader-toggle" style={{ fontSize: '11px', color: 'var(--ed-text, #f8fafc)', cursor: 'pointer' }}>
                Draw Leader Line to Target
              </label>
            </div>
          )}

          {/* Timing: Start & Duration */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--ed-text-muted, #94a3b8)', display: 'block', marginBottom: '4px' }}>
                Start Time (sec)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                className="ed-input"
                style={{ width: '100%', padding: '5px 8px', fontSize: '12px', background: '#0b101b', border: '1px solid #1e293b', borderRadius: '4px', color: '#ffffff' }}
                value={Number((selectedOverlay.startMs / 1000).toFixed(2))}
                onChange={(e) => onUpdateOverlay(selectedOverlay.id, { startMs: Math.round(Number(e.target.value) * 1000) })}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--ed-text-muted, #94a3b8)', display: 'block', marginBottom: '4px' }}>
                Duration (sec)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                className="ed-input"
                style={{ width: '100%', padding: '5px 8px', fontSize: '12px', background: '#0b101b', border: '1px solid #1e293b', borderRadius: '4px', color: '#ffffff' }}
                value={Number(((selectedOverlay.durationMs || 5000) / 1000).toFixed(2))}
                onChange={(e) => onUpdateOverlay(selectedOverlay.id, { durationMs: Math.round(Number(e.target.value) * 1000) })}
              />
            </div>
          </div>

          {/* Route Line: Draw Duration */}
          {selectedOverlay.type === 'route_line' && (
            <div>
              <label style={{ fontSize: '11px', color: 'var(--ed-text-muted, #94a3b8)', display: 'block', marginBottom: '4px' }}>
                Draw Animation Speed (sec): {((selectedOverlay.progressDurationMs || 2000) / 1000).toFixed(1)}s
              </label>
              <input
                type="range"
                min="500"
                max="6000"
                step="250"
                style={{ width: '100%' }}
                value={selectedOverlay.progressDurationMs || 2000}
                onChange={(e) => onUpdateOverlay(selectedOverlay.id, { progressDurationMs: Number(e.target.value) })}
              />
            </div>
          )}

          {/* Color Selection & Swatches */}
          <div>
            <label style={{ fontSize: '11px', color: 'var(--ed-text-muted, #94a3b8)', display: 'block', marginBottom: '6px' }}>
              Color Theme
            </label>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
              {COLOR_SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: swatch,
                    border: (selectedOverlay.color || '').toLowerCase() === swatch.toLowerCase() ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                  onClick={() => onUpdateOverlay(selectedOverlay.id, { color: swatch })}
                  title={swatch}
                />
              ))}
              <input
                type="color"
                value={selectedOverlay.color || '#38bdf8'}
                onChange={(e) => onUpdateOverlay(selectedOverlay.id, { color: e.target.value })}
                style={{ width: '24px', height: '24px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
                title="Custom color"
              />
            </div>
          </div>

          {/* Dimensions / Stroke Width */}
          {selectedOverlay.type === 'highlight_ring' && (
            <div>
              <label style={{ fontSize: '11px', color: 'var(--ed-text-muted, #94a3b8)', display: 'block', marginBottom: '4px' }}>
                Radius: {selectedOverlay.radius || 45}px
              </label>
              <input
                type="range"
                min="20"
                max="200"
                step="5"
                style={{ width: '100%' }}
                value={selectedOverlay.radius || 45}
                onChange={(e) => onUpdateOverlay(selectedOverlay.id, { radius: Number(e.target.value) })}
              />
            </div>
          )}

          {(selectedOverlay.type === 'route_line' || selectedOverlay.type === 'arrow_pointer') && (
            <div>
              <label style={{ fontSize: '11px', color: 'var(--ed-text-muted, #94a3b8)', display: 'block', marginBottom: '4px' }}>
                Line Thickness: {selectedOverlay.strokeWidth || 4}px
              </label>
              <input
                type="range"
                min="2"
                max="12"
                step="1"
                style={{ width: '100%' }}
                value={selectedOverlay.strokeWidth || 4}
                onChange={(e) => onUpdateOverlay(selectedOverlay.id, { strokeWidth: Number(e.target.value) })}
              />
            </div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '16px', color: 'var(--ed-text-muted, #94a3b8)', fontSize: '12px' }}>
          Select an overlay on the canvas or click a button above to add one.
        </div>
      )}
    </div>
  );
};

