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
    const validTypes = ['image/png', 'image/svg+xml', 'image/webp', 'image/jpeg', 'image/jpg'];
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
      setTimeout(() => setSuccessMessage(null), 3500);
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
        backgroundColor: 'rgba(2, 6, 23, 0.78)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
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
          width: '700px',
          maxWidth: '96vw',
          maxHeight: '92vh',
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          borderRadius: '14px',
          border: '1px solid #334155',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.22), #0f172a)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '22px' }}>🏷️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.01em' }}>
                Channel Identity & Logo Overlay
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                Upload your channel branding and customize overlay placement across all 4 formats.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '6px 10px',
              borderRadius: '6px',
              lineHeight: 1,
              transition: 'color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#ffffff';
              e.currentTarget.style.backgroundColor = '#1e293b';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#94a3b8';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '22px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {errorMessage && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #ef4444',
                color: '#fca5a5',
                fontSize: '12.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>⚠️</span>
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid #10b981',
                color: '#6ee7b7',
                fontSize: '12.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>✓</span>
              <span>{successMessage}</span>
            </div>
          )}

          {/* Section 1: Logo File & Status */}
          <div
            style={{
              padding: '16px',
              borderRadius: '10px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '96px',
                  height: '64px',
                  borderRadius: '8px',
                  backgroundColor: config.showBackgroundContainer
                    ? (config.containerBgColor || '#0f172a')
                    : '#0b0f19',
                  border: '1.5px dashed #475569',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  padding: '6px',
                  flexShrink: 0,
                }}
              >
                {config.logoUrl ? (
                  <img
                    src={resolveAssetUrl(config.logoUrl)}
                    alt="Channel Logo"
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <span style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 500, textAlign: 'center' }}>
                    No Logo
                  </span>
                )}
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13.5px', fontWeight: 600, color: '#f8fafc' }}>
                    <input
                      type="checkbox"
                      checked={config.enabled}
                      onChange={(e) => setConfig((prev) => ({ ...prev, enabled: e.target.checked }))}
                      style={{ width: '16px', height: '16px', accentColor: '#8b5cf6', cursor: 'pointer' }}
                    />
                    <span>Enable Channel Logo in Video</span>
                  </label>
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                  {config.logoUrl
                    ? 'Logo configured • Automatically positioned & rendered'
                    : 'Upload transparent PNG, SVG, WebP or JPEG (Max 5MB)'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/svg+xml,image/webp,image/jpeg,image/jpg"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              <button
                type="button"
                style={{
                  padding: '8px 16px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#ffffff',
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 8px rgba(124, 58, 237, 0.35)',
                  transition: 'opacity 0.15s, transform 0.15s',
                }}
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? 'Uploading...' : config.logoUrl ? 'Replace Logo' : 'Upload Logo'}
              </button>
              {config.logoUrl && (
                <button
                  type="button"
                  style={{
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontWeight: 500,
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    borderRadius: '6px',
                    color: '#fca5a5',
                    cursor: 'pointer',
                  }}
                  onClick={handleRemoveLogo}
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          {/* Section 2: Channel Info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0', display: 'block', marginBottom: '6px' }}>
                Channel / Creator Name (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Kids Magic Studio"
                value={config.channelName || ''}
                onChange={(e) => setConfig((prev) => ({ ...prev, channelName: e.target.value }))}
                style={{
                  width: '100%',
                  fontSize: '12.5px',
                  padding: '8px 12px',
                  backgroundColor: '#0b0f19',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0', display: 'block', marginBottom: '6px' }}>
                Social Handle / Watermark Tag (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. @KidsStoryTV"
                value={config.socialHandle || ''}
                onChange={(e) => setConfig((prev) => ({ ...prev, socialHandle: e.target.value }))}
                style={{
                  width: '100%',
                  fontSize: '12.5px',
                  padding: '8px 12px',
                  backgroundColor: '#0b0f19',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Section 3: Format Configuration Tabs */}
          <div
            style={{
              padding: '16px',
              borderRadius: '10px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <label style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
                Format-Specific Positioning & Size
              </label>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                Active Target: <strong style={{ color: '#a78bfa' }}>{selectedFormat}</strong>
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #334155', paddingBottom: '10px', marginBottom: '16px', overflowX: 'auto' }}>
              {FORMAT_TABS.map((f) => {
                const isActive = selectedFormat === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedFormat(f.id)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: isActive ? 700 : 500,
                      backgroundColor: isActive ? '#7c3aed' : '#0f172a',
                      border: isActive ? '1px solid #a78bfa' : '1px solid #334155',
                      color: isActive ? '#ffffff' : '#cbd5e1',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease',
                      boxShadow: isActive ? '0 2px 8px rgba(124, 58, 237, 0.4)' : 'none',
                    }}
                  >
                    <span>{f.label}</span>
                    <span style={{ opacity: isActive ? 0.9 : 0.6, fontSize: '10.5px' }}>({f.dim})</span>
                  </button>
                );
              })}
            </div>

            {/* Placement Controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Position Presets */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0', display: 'block', marginBottom: '8px' }}>
                  Overlay Position
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                  {POSITION_OPTIONS.map((p) => {
                    const isSelected = currentPos === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          updateFormatPreset({ position: p.id });
                          setConfig((prev) => ({ ...prev, position: p.id }));
                        }}
                        style={{
                          padding: '10px 8px',
                          borderRadius: '8px',
                          fontSize: '11.5px',
                          fontWeight: isSelected ? 700 : 500,
                          backgroundColor: isSelected ? 'rgba(124, 58, 237, 0.28)' : '#0f172a',
                          border: isSelected ? '1.5px solid #8b5cf6' : '1px solid #334155',
                          color: isSelected ? '#ffffff' : '#cbd5e1',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'all 0.15s ease',
                          boxShadow: isSelected ? '0 2px 8px rgba(139, 92, 246, 0.3)' : 'none',
                        }}
                      >
                        <span style={{ fontSize: '16px', color: isSelected ? '#a78bfa' : '#94a3b8' }}>{p.icon}</span>
                        <span>{p.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sliders: Size, Padding, Opacity */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: '6px' }}>
                    <span style={{ color: '#e2e8f0', fontWeight: 600 }}>Width</span>
                    <span style={{ color: '#a78bfa', fontWeight: 600 }}>{currentWidth}px</span>
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
                    style={{ width: '100%', accentColor: '#8b5cf6', cursor: 'pointer' }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: '6px' }}>
                    <span style={{ color: '#e2e8f0', fontWeight: 600 }}>Edge Padding</span>
                    <span style={{ color: '#a78bfa', fontWeight: 600 }}>{currentPadding}px</span>
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
                    style={{ width: '100%', accentColor: '#8b5cf6', cursor: 'pointer' }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: '6px' }}>
                    <span style={{ color: '#e2e8f0', fontWeight: 600 }}>Opacity</span>
                    <span style={{ color: '#a78bfa', fontWeight: 600 }}>{Math.round(currentOpacity * 100)}%</span>
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
                    style={{ width: '100%', accentColor: '#8b5cf6', cursor: 'pointer' }}
                  />
                </div>
              </div>

              {/* Custom Coordinates (if custom position chosen) */}
              {currentPos === 'custom' && (
                <div style={{ padding: '12px 14px', borderRadius: '8px', backgroundColor: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
                  <div style={{ fontSize: '12px', color: '#c4b5fd', fontWeight: 600, marginBottom: '8px' }}>
                    ✥ Drag logo on the video preview canvas, or adjust precise coordinates:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: '#cbd5e1', display: 'block', marginBottom: '4px' }}>
                        X Coordinate (px): {config.customX || 0}
                      </label>
                      <input
                        type="number"
                        value={config.customX || 0}
                        onChange={(e) => setConfig((prev) => ({ ...prev, customX: Number(e.target.value) }))}
                        style={{
                          width: '100%',
                          fontSize: '12px',
                          padding: '6px 10px',
                          backgroundColor: '#0b0f19',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          color: '#f8fafc',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#cbd5e1', display: 'block', marginBottom: '4px' }}>
                        Y Coordinate (px): {config.customY || 0}
                      </label>
                      <input
                        type="number"
                        value={config.customY || 0}
                        onChange={(e) => setConfig((prev) => ({ ...prev, customY: Number(e.target.value) }))}
                        style={{
                          width: '100%',
                          fontSize: '12px',
                          padding: '6px 10px',
                          backgroundColor: '#0b0f19',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          color: '#f8fafc',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Styling Options */}
          <div
            style={{
              padding: '16px',
              borderRadius: '10px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
            }}
          >
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#f8fafc', cursor: 'pointer', marginBottom: '6px' }}>
                <input
                  type="checkbox"
                  checked={config.showBackgroundContainer ?? false}
                  onChange={(e) => setConfig((prev) => ({ ...prev, showBackgroundContainer: e.target.checked }))}
                  style={{ width: '16px', height: '16px', accentColor: '#8b5cf6', cursor: 'pointer' }}
                />
                <span>Background Container Plate</span>
              </label>
              <div style={{ fontSize: '11.5px', color: '#94a3b8', marginBottom: '8px' }}>
                Adds a solid background behind non-transparent or JPEG logos.
              </div>
              {config.showBackgroundContainer && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="color"
                    value={config.containerBgColor?.startsWith('#') ? config.containerBgColor : '#0f172a'}
                    onChange={(e) => setConfig((prev) => ({ ...prev, containerBgColor: e.target.value }))}
                    style={{ width: '36px', height: '28px', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer', backgroundColor: 'transparent' }}
                  />
                  <span style={{ fontSize: '11.5px', color: '#cbd5e1' }}>Container Color</span>
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#f8fafc', cursor: 'pointer', marginBottom: '6px' }}>
                <input
                  type="checkbox"
                  checked={config.showShadow ?? true}
                  onChange={(e) => setConfig((prev) => ({ ...prev, showShadow: e.target.checked }))}
                  style={{ width: '16px', height: '16px', accentColor: '#8b5cf6', cursor: 'pointer' }}
                />
                <span>Soft Drop Shadow</span>
              </label>
              <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                Adds contrast so the logo stands out over bright or shifting backgrounds.
              </div>
            </div>
          </div>

          {/* Section 5: Timing & Duration */}
          <div
            style={{
              padding: '16px',
              borderRadius: '10px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#f8fafc', cursor: 'pointer', marginBottom: '6px' }}>
              <input
                type="checkbox"
                checked={config.alwaysVisible ?? true}
                onChange={(e) => setConfig((prev) => ({ ...prev, alwaysVisible: e.target.checked }))}
                style={{ width: '16px', height: '16px', accentColor: '#8b5cf6', cursor: 'pointer' }}
              />
              <span>Visible for Entire Video (Default)</span>
            </label>
            {!config.alwaysVisible && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '12px' }}>
                <div>
                  <label style={{ fontSize: '11.5px', color: '#cbd5e1', display: 'block', marginBottom: '4px' }}>
                    Start Time (ms)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={config.startTimeMs || 0}
                    onChange={(e) => setConfig((prev) => ({ ...prev, startTimeMs: Number(e.target.value) }))}
                    style={{
                      width: '100%',
                      fontSize: '12px',
                      padding: '6px 10px',
                      backgroundColor: '#0b0f19',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11.5px', color: '#cbd5e1', display: 'block', marginBottom: '4px' }}>
                    End Time (ms)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={config.endTimeMs || 10000}
                    onChange={(e) => setConfig((prev) => ({ ...prev, endTimeMs: Number(e.target.value) }))}
                    style={{
                      width: '100%',
                      fontSize: '12px',
                      padding: '6px 10px',
                      backgroundColor: '#0b0f19',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '12px',
            backgroundColor: '#0b0f19',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              fontSize: '12.5px',
              fontWeight: 500,
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#cbd5e1',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#334155')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            style={{
              padding: '8px 22px',
              fontSize: '12.5px',
              fontWeight: 600,
              background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
              border: 'none',
              borderRadius: '6px',
              color: '#ffffff',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 10px rgba(124, 58, 237, 0.4)',
              transition: 'transform 0.15s, opacity 0.15s',
            }}
          >
            {isSaving ? 'Saving...' : 'Save & Apply Branding'}
          </button>
        </div>
      </div>
    </div>
  );
};
