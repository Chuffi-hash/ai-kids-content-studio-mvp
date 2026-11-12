import React, { useState, useRef, useEffect } from 'react';
import {
  ChannelBrandingConfig,
  AspectRatioKey,
  BrandingPosition,
  uploadBrandingFile,
  saveBrandingConfig,
} from '../../services/branding.service';
import { resolveAssetUrl } from '../../utils/urlHelper';

interface ChannelLogoModalProps {
  isOpen: boolean;
  onClose: () => void;
  storyId: string;
  currentBranding: ChannelBrandingConfig;
  onBrandingSaved: (saved: ChannelBrandingConfig) => void;
  activeFormat?: AspectRatioKey;
}

const POSITION_OPTIONS: Array<{ id: BrandingPosition; label: string; icon: string }> = [
  { id: 'top-right', label: 'Top Right', icon: '↗' },
  { id: 'top-left', label: 'Top Left', icon: '↖' },
  { id: 'bottom-right', label: 'Bottom Right', icon: '↘' },
  { id: 'bottom-left', label: 'Bottom Left', icon: '↙' },
  { id: 'custom', label: 'Custom (Draggable)', icon: '✥' },
];

const FORMAT_TABS: Array<{ id: AspectRatioKey; label: string; dim: string }> = [
  { id: '16:9', label: '16:9 Landscape', dim: '1920 × 1080' },
  { id: '9:16', label: '9:16 Vertical Reel', dim: '1080 × 1920' },
  { id: '1:1', label: '1:1 Square', dim: '1080 × 1080' },
  { id: '4:5', label: '4:5 Portrait', dim: '1080 × 1350' },
];

export const ChannelLogoModal: React.FC<ChannelLogoModalProps> = ({
  isOpen,
  onClose,
  storyId,
  currentBranding,
  onBrandingSaved,
  activeFormat = '16:9',
}) => {
  const [config, setConfig] = useState<ChannelBrandingConfig>({ ...currentBranding });
  const [selectedFormat, setSelectedFormat] = useState<AspectRatioKey>(activeFormat);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setConfig({ ...currentBranding });
    setSelectedFormat(activeFormat);
  }, [currentBranding, activeFormat, isOpen]);

  if (!isOpen) return null;

  // Active format-specific preset values or fallbacks
  const formatPreset = config.formatPresets?.[selectedFormat] || {};
  const currentPos = formatPreset.position || config.position || 'top-right';
  const currentPadding = formatPreset.padding ?? config.padding ?? 24;
  const currentWidth = formatPreset.width ?? config.width ?? 140;
  const currentHeight = formatPreset.height ?? config.height ?? 50;
  const currentOpacity = formatPreset.opacity ?? config.opacity ?? 0.9;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Logo image exceeds 5MB limit. Please choose a smaller image.');
      return;
    }

    // Validate type
    const validTypes = ['image/png', 'image/svg+xml', 'image/webp', 'image/jpeg'];
    if (!validTypes.includes(file.type) && !file.name.endsWith('.svg')) {
      setErrorMessage('Unsupported format. Please upload a PNG, SVG, WebP, or JPEG image.');
      return;
    }

    try {
      setIsUploading(true);
      setErrorMessage(null);
      const res = await uploadBrandingFile(file, 'logo', storyId);
      setConfig((prev) => ({
        ...prev,
        enabled: true,
        logoUrl: res.url,
        width: res.width ? Math.min(220, Math.round(res.width / 2)) : prev.width || 140,
        height: res.height ? Math.min(100, Math.round(res.height / 2)) : prev.height || 50,
      }));
      setSuccessMessage('Logo uploaded successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to upload logo image');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = () => {
    setConfig((prev) => ({
      ...prev,
      enabled: false,
      logoUrl: undefined,
    }));
  };

  const updateFormatPreset = (updates: Partial<typeof formatPreset>) => {
    setConfig((prev) => {
      const existing = prev.formatPresets || {};
      const target = existing[selectedFormat] || {};
      return {
        ...prev,
        formatPresets: {
          ...existing,
          [selectedFormat]: {
            ...target,
            ...updates,
          },
        },
      };
    });
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setErrorMessage(null);
      const saved = await saveBrandingConfig(config, storyId);
      onBrandingSaved(saved);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save channel branding');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(5px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '680px',
          maxWidth: '96vw',
          maxHeight: '90vh',
          backgroundColor: 'var(--ed-surface, #1e293b)',
          color: 'var(--ed-text, #f8fafc)',
          borderRadius: '12px',
          border: '1px solid var(--ed-border, rgba(255, 255, 255, 0.12))',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--ed-border, rgba(255, 255, 255, 0.08))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(30, 41, 59, 0.8))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>🏷️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Channel Identity & Logo Overlay</h3>
              <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--ed-text-muted, #94a3b8)' }}>
                Upload your channel branding and customize its overlay placement across all 4 formats.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--ed-text-muted, #94a3b8)',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {errorMessage && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #ef4444',
                color: '#fca5a5',
                fontSize: '12px',
              }}
            >
              ⚠️ {errorMessage}
            </div>
          )}

          {successMessage && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid #10b981',
                color: '#6ee7b7',
                fontSize: '12px',
              }}
            >
              ✓ {successMessage}
            </div>
          )}

          {/* Section 1: Logo File & Status */}
          <div
            style={{
              padding: '14px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  width: '90px',
                  height: '60px',
                  borderRadius: '6px',
                  backgroundColor: config.showBackgroundContainer
                    ? (config.containerBgColor || 'rgba(15, 23, 42, 0.7)')
                    : 'rgba(0, 0, 0, 0.3)',
                  border: '1px dashed rgba(255, 255, 255, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  padding: '4px',
                }}
              >
                {config.logoUrl ? (
                  <img
                    src={resolveAssetUrl(config.logoUrl)}
                    alt="Channel Logo"
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <span style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>No Logo</span>
                )}
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={config.enabled}
                      onChange={(e) => setConfig((prev) => ({ ...prev, enabled: e.target.checked }))}
                    />
                    <span>Enable Channel Logo in Video</span>
                  </label>
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {config.logoUrl ? 'Logo configured • Displays over video frame' : 'Upload transparent PNG, SVG, WebP or JPEG (Max 5MB)'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/svg+xml,image/webp,image/jpeg"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              <button
                type="button"
                className="ed-btn-action"
                style={{ padding: '6px 12px', fontSize: '12px', background: '#8b5cf6', borderColor: '#8b5cf6', color: '#ffffff' }}
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? 'Uploading...' : config.logoUrl ? 'Replace Logo' : 'Upload Logo'}
              </button>
              {config.logoUrl && (
                <button
                  type="button"
                  className="ed-tool-btn"
                  style={{ padding: '6px 10px', fontSize: '12px', color: '#f87171' }}
                  onClick={handleRemoveLogo}
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          {/* Section 2: Channel Info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                Channel / Creator Name (Optional)
              </label>
              <input
                type="text"
                className="studio-input"
                placeholder="e.g. Kids Magic Studio"
                value={config.channelName || ''}
                onChange={(e) => setConfig((prev) => ({ ...prev, channelName: e.target.value }))}
                style={{ width: '100%', fontSize: '12px', padding: '6px 10px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                Social Handle / Watermark Tag (Optional)
              </label>
              <input
                type="text"
                className="studio-input"
                placeholder="e.g. @KidsStoryTV"
                value={config.socialHandle || ''}
                onChange={(e) => setConfig((prev) => ({ ...prev, socialHandle: e.target.value }))}
                style={{ width: '100%', fontSize: '12px', padding: '6px 10px' }}
              />
            </div>
          </div>

          {/* Section 3: Format Configuration Tabs */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ed-text)' }}>
                Format-Specific Positioning & Size
              </label>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                Active Target: <strong>{selectedFormat}</strong>
              </span>
            </div>

            <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '6px', marginBottom: '14px' }}>
              {FORMAT_TABS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelectedFormat(f.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '11.5px',
                    fontWeight: selectedFormat === f.id ? 600 : 400,
                    backgroundColor: selectedFormat === f.id ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                    border: selectedFormat === f.id ? '1px solid #8b5cf6' : '1px solid transparent',
                    color: selectedFormat === f.id ? '#c4b5fd' : '#94a3b8',
                    cursor: 'pointer',
                  }}
                >
                  {f.label} <span style={{ opacity: 0.7, fontSize: '10px' }}>({f.dim})</span>
                </button>
              ))}
            </div>

            {/* Placement Controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Position Presets */}
              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  Overlay Position
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                  {POSITION_OPTIONS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        updateFormatPreset({ position: p.id });
                        setConfig((prev) => ({ ...prev, position: p.id }));
                      }}
                      style={{
                        padding: '6px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        backgroundColor: currentPos === p.id ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                        border: currentPos === p.id ? '1px solid #8b5cf6' : '1px solid rgba(255, 255, 255, 0.08)',
                        color: currentPos === p.id ? '#c4b5fd' : '#cbd5e1',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '2px',
                      }}
                    >
                      <span style={{ fontSize: '14px' }}>{p.icon}</span>
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sliders: Size, Padding, Opacity */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                    <span>Width: {currentWidth}px</span>
                  </div>
                  <input
                    type="range"
                    min="60"
                    max="320"
                    step="5"
                    value={currentWidth}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      const ratio = currentHeight / (currentWidth || 1);
                      updateFormatPreset({ width: val, height: Math.round(val * ratio) });
                      setConfig((prev) => ({ ...prev, width: val, height: Math.round(val * ratio) }));
                    }}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                    <span>Edge Padding: {currentPadding}px</span>
                  </div>
                  <input
                    type="range"
                    min="8"
                    max="60"
                    step="2"
                    value={currentPadding}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateFormatPreset({ padding: val });
                      setConfig((prev) => ({ ...prev, padding: val }));
                    }}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                    <span>Opacity: {Math.round(currentOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={currentOpacity}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateFormatPreset({ opacity: val });
                      setConfig((prev) => ({ ...prev, opacity: val }));
                    }}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* Custom Coordinates (if custom position chosen) */}
              {currentPos === 'custom' && (
                <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                  <div style={{ fontSize: '11px', color: '#c4b5fd', marginBottom: '8px' }}>
                    ✥ Drag logo on the video preview canvas, or adjust precise coordinates:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '10.5px', color: '#94a3b8' }}>X Coordinate (px): {config.customX || 0}</label>
                      <input
                        type="number"
                        className="studio-input"
                        value={config.customX || 0}
                        onChange={(e) => setConfig((prev) => ({ ...prev, customX: Number(e.target.value) }))}
                        style={{ width: '100%', fontSize: '11px', padding: '4px 8px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '10.5px', color: '#94a3b8' }}>Y Coordinate (px): {config.customY || 0}</label>
                      <input
                        type="number"
                        className="studio-input"
                        value={config.customY || 0}
                        onChange={(e) => setConfig((prev) => ({ ...prev, customY: Number(e.target.value) }))}
                        style={{ width: '100%', fontSize: '11px', padding: '4px 8px' }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Styling Options */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', marginBottom: '8px' }}>
                <input
                  type="checkbox"
                  checked={config.showBackgroundContainer ?? false}
                  onChange={(e) => setConfig((prev) => ({ ...prev, showBackgroundContainer: e.target.checked }))}
                />
                <span>Background Container Plate</span>
              </label>
              {config.showBackgroundContainer && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                  <input
                    type="color"
                    value={config.containerBgColor?.startsWith('#') ? config.containerBgColor : '#0f172a'}
                    onChange={(e) => setConfig((prev) => ({ ...prev, containerBgColor: e.target.value }))}
                    style={{ width: '32px', height: '24px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Solid container for non-transparent logos</span>
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', marginBottom: '8px' }}>
                <input
                  type="checkbox"
                  checked={config.showShadow ?? true}
                  onChange={(e) => setConfig((prev) => ({ ...prev, showShadow: e.target.checked }))}
                />
                <span>Soft Drop Shadow</span>
              </label>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                Adds contrast so logo stands out over bright or shifting background scenes.
              </div>
            </div>
          </div>

          {/* Section 5: Timing & Duration */}
          <div style={{ paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', marginBottom: '6px' }}>
              <input
                type="checkbox"
                checked={config.alwaysVisible ?? true}
                onChange={(e) => setConfig((prev) => ({ ...prev, alwaysVisible: e.target.checked }))}
              />
              <span>Visible for Entire Video (Default)</span>
            </label>
            {!config.alwaysVisible && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px' }}>
                <div>
                  <label style={{ fontSize: '10.5px', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Start Time (ms)</label>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    className="studio-input"
                    value={config.startTimeMs || 0}
                    onChange={(e) => setConfig((prev) => ({ ...prev, startTimeMs: Number(e.target.value) }))}
                    style={{ width: '100%', fontSize: '11px', padding: '4px 8px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10.5px', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>End Time (ms)</label>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    className="studio-input"
                    value={config.endTimeMs || 10000}
                    onChange={(e) => setConfig((prev) => ({ ...prev, endTimeMs: Number(e.target.value) }))}
                    style={{ width: '100%', fontSize: '11px', padding: '4px 8px' }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--ed-border, rgba(255, 255, 255, 0.08))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '10px',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          <button
            type="button"
            className="ed-tool-btn"
            onClick={onClose}
            style={{ padding: '6px 14px', fontSize: '12px' }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="ed-btn-action"
            disabled={isSaving}
            onClick={handleSave}
            style={{
              padding: '6px 18px',
              fontSize: '12px',
              background: '#8b5cf6',
              borderColor: '#8b5cf6',
              color: '#ffffff',
              fontWeight: 600,
            }}
          >
            {isSaving ? 'Saving...' : 'Save & Apply Branding'}
          </button>
        </div>
      </div>
    </div>
  );
};
