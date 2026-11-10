import React, { useState, useEffect } from 'react';
import {
  BackgroundAsset,
  getAllBackgroundAssets,
  getBackgroundStudioTemplates,
  generateBackgroundAsset,
  importFlowBackgroundAsset,
  uploadBackgroundAsset,
} from '../services/studio.service';
import { SparklesIcon, PlusIcon, CloseIcon } from '../components/common/Icons';

export default function BackgroundsPage() {
  const [backgrounds, setBackgrounds] = useState<BackgroundAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFormat, setSelectedFormat] = useState<string>('all');
  const [selectedEnv, setSelectedEnv] = useState<string>('all');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Generate form state
  const [genEnv, setGenEnv] = useState('lush green forest');
  const [genDetails, setGenDetails] = useState('a winding dirt path with giant sunny trees, flowers, and gentle sunlight');
  const [genMood, setGenMood] = useState('cheerful and inviting');
  const [genStyle, setGenStyle] = useState('storybook_illustrated');
  const [genRatio, setGenRatio] = useState<'16:9' | '9:16' | '1:1' | '4:5'>('16:9');

  // Import form state
  const [importName, setImportName] = useState('');
  const [importEnv, setImportEnv] = useState('Storybook Scene');
  const [importData, setImportData] = useState('');
  const [importNotes, setImportNotes] = useState('');
  const [importRatio, setImportRatio] = useState<'16:9' | '9:16' | '1:1' | '4:5'>('16:9');

  useEffect(() => {
    loadBackgrounds();
  }, []);

  async function loadBackgrounds() {
    try {
      setLoading(true);
      const data = await getAllBackgroundAssets();
      setBackgrounds(data);
    } catch (err) {
      console.error('Failed to load backgrounds:', err);
    } finally {
      setLoading(false);
    }
  }

  const filteredBackgrounds = backgrounds.filter((bg) => {
    const matchFormat = selectedFormat === 'all' || bg.aspectRatio === selectedFormat;
    const matchEnv = selectedEnv === 'all' || bg.environmentType.toLowerCase().includes(selectedEnv.toLowerCase());
    return matchFormat && matchEnv;
  });

  async function handleGenerateSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setIsProcessing(true);
      setActionError(null);
      await generateBackgroundAsset({
        environmentType: genEnv,
        details: genDetails,
        mood: genMood,
        artStyle: genStyle,
        aspectRatio: genRatio,
      });
      setShowGenerateModal(false);
      await loadBackgrounds();
    } catch (err: any) {
      setActionError(err.message || 'Generation failed');
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleImportSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!importData) {
      setActionError('Please provide an image file or base64 data');
      return;
    }
    try {
      setIsProcessing(true);
      setActionError(null);
      await importFlowBackgroundAsset({
        name: importName || `Google Flow (${importEnv})`,
        environmentType: importEnv,
        imageBufferOrBase64: importData,
        notes: importNotes,
        aspectRatio: importRatio,
      });
      setShowImportModal(false);
      setImportData('');
      await loadBackgrounds();
    } catch (err: any) {
      setActionError(err.message || 'Import failed');
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleFileUpload(file: File) {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setImportData(base64);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div style={{ padding: '28px 36px', maxWidth: 1400, margin: '0 auto', color: 'var(--text-primary)' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>
              Background Studio
            </h1>
            <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 12, backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#0284c7' }}>
              Environment Manager
            </span>
          </div>
          <p style={{ margin: '6px 0 0 0', color: 'var(--text-secondary)', fontSize: 14 }}>
            Generate environment-only artwork, import scenes from Google Flow, and manage reusable storybook backdrops.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowImportModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 8 }}
          >
            Import from Google Flow
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowGenerateModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 8, fontWeight: 600 }}
          >
            <SparklesIcon size={16} />
            Generate Background
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, backgroundColor: 'var(--bg-secondary)', padding: 4, borderRadius: 8 }}>
          {['all', '16:9', '9:16', '1:1', '4:5'].map((ratio) => (
            <button
              key={ratio}
              type="button"
              onClick={() => setSelectedFormat(ratio)}
              style={{
                border: 'none',
                backgroundColor: selectedFormat === ratio ? 'var(--primary-color)' : 'transparent',
                color: selectedFormat === ratio ? '#ffffff' : 'var(--text-secondary)',
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {ratio === 'all' ? 'All Ratios' : ratio}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
          {['all', 'forest', 'village', 'cottage', 'meadow', 'castle', 'beach', 'mountains', 'space'].map((env) => (
            <button
              key={env}
              type="button"
              onClick={() => setSelectedEnv(env)}
              style={{
                border: selectedEnv === env ? '1px solid var(--primary-color)' : '1px solid var(--border-color)',
                backgroundColor: selectedEnv === env ? 'rgba(59, 130, 246, 0.08)' : 'var(--bg-primary)',
                color: selectedEnv === env ? 'var(--primary-color)' : 'var(--text-secondary)',
                padding: '5px 12px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'capitalize',
                cursor: 'pointer',
              }}
            >
              {env}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Backgrounds */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading background library...
        </div>
      ) : filteredBackgrounds.length === 0 ? (
        <div
          style={{
            padding: 80,
            textAlign: 'center',
            border: '2px dashed var(--border-color)',
            borderRadius: 16,
            backgroundColor: 'var(--bg-secondary)',
          }}
        >
          <div style={{ fontSize: 42, marginBottom: 12 }}>🎨</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px 0' }}>No backgrounds found</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 440, margin: '0 auto 20px auto' }}>
            Generate your first environment backdrop or import an illustrated scene from Google Flow.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowGenerateModal(true)}
            style={{ padding: '8px 18px', borderRadius: 8 }}
          >
            Generate Environment
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 20,
          }}
        >
          {filteredBackgrounds.map((bg) => (
            <div
              key={bg.id}
              style={{
                borderRadius: 12,
                overflow: 'hidden',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              }}
            >
              <div
                style={{
                  width: '100%',
                  aspectRatio: bg.aspectRatio === '9:16' ? '9/16' : '16/9',
                  maxHeight: 220,
                  backgroundColor: '#0f172a',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <img
                  src={bg.imageUrl}
                  alt={bg.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <span
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    padding: '3px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    backgroundColor: 'rgba(0,0,0,0.65)',
                    color: '#ffffff',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  {bg.aspectRatio}
                </span>
                <span
                  style={{
                    position: 'absolute',
                    bottom: 10,
                    left: 10,
                    padding: '3px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    backgroundColor: bg.provider === 'google_flow' ? 'rgba(59, 130, 246, 0.85)' : 'rgba(16, 185, 129, 0.85)',
                    color: '#ffffff',
                    textTransform: 'capitalize',
                  }}
                >
                  {bg.provider.replace('_', ' ')}
                </span>
              </div>

              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                  {bg.name}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {bg.description}
                </div>

                <div style={{ marginTop: 'auto', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {new Date(bg.createdAt).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      navigator.clipboard.writeText(bg.imageUrl);
                      alert('Background URL copied to clipboard!');
                    }}
                    style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6 }}
                  >
                    Copy Asset URL
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Generate Modal */}
      {showGenerateModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Generate Environment Background</h2>
              <button type="button" className="btn-icon" onClick={() => setShowGenerateModal(false)}>
                <CloseIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleGenerateSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {actionError && (
                  <div style={{ padding: 10, backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: 8, fontSize: 13 }}>
                    {actionError}
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    Environment Setting
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={genEnv}
                    onChange={(e) => setGenEnv(e.target.value)}
                    placeholder="e.g. lush green forest, cozy cottage room, kingdom castle"
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    Environment Details & Features
                  </label>
                  <textarea
                    className="form-textarea"
                    rows={3}
                    value={genDetails}
                    onChange={(e) => setGenDetails(e.target.value)}
                    placeholder="e.g. winding dirt path with giant sunny trees, flowers, rocks, sunlight"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                      Mood & Atmosphere
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={genMood}
                      onChange={(e) => setGenMood(e.target.value)}
                      placeholder="e.g. cheerful and inviting"
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                      Aspect Ratio
                    </label>
                    <select
                      className="form-select"
                      value={genRatio}
                      onChange={(e) => setGenRatio(e.target.value as any)}
                    >
                      <option value="16:9">16:9 Landscape</option>
                      <option value="9:16">9:16 Portrait Reel</option>
                      <option value="1:1">1:1 Square</option>
                      <option value="4:5">4:5 Vertical</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    Art Style
                  </label>
                  <select
                    className="form-select"
                    value={genStyle}
                    onChange={(e) => setGenStyle(e.target.value)}
                  >
                    <option value="storybook_illustrated">Storybook Illustrated (Classic Gouache)</option>
                    <option value="2d_cartoon">Clean 2D Modern Cartoon</option>
                    <option value="3d_pixar">3D Animated Style (Soft Lighting)</option>
                  </select>
                </div>

                <div style={{ padding: 12, backgroundColor: 'rgba(59, 130, 246, 0.08)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                  ✨ <strong>Prompt rule enforced:</strong> Generated backgrounds strictly contain no characters, text, or watermarks, leaving clear space for animation staging.
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowGenerateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isProcessing}>
                  {isProcessing ? 'Generating Background...' : 'Generate Background'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import from Google Flow Modal */}
      {showImportModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Import from Google Flow</h2>
              <button type="button" className="btn-icon" onClick={() => setShowImportModal(false)}>
                <CloseIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleImportSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {actionError && (
                  <div style={{ padding: 10, backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: 8, fontSize: 13 }}>
                    {actionError}
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    Background Name
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={importName}
                    onChange={(e) => setImportName(e.target.value)}
                    placeholder="e.g. Enchanted Forest Clearing"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                      Environment Type
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={importEnv}
                      onChange={(e) => setImportEnv(e.target.value)}
                      placeholder="e.g. Forest, Village, Bedroom"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                      Aspect Ratio
                    </label>
                    <select
                      className="form-select"
                      value={importRatio}
                      onChange={(e) => setImportRatio(e.target.value as any)}
                    >
                      <option value="16:9">16:9 Landscape</option>
                      <option value="9:16">9:16 Portrait Reel</option>
                      <option value="1:1">1:1 Square</option>
                      <option value="4:5">4:5 Vertical</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    Upload Exported Image (PNG/JPEG)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileUpload(e.target.files[0]);
                      }
                    }}
                    style={{ fontSize: 13 }}
                  />
                </div>

                {importData && (
                  <div style={{ textAlign: 'center', maxHeight: 180, overflow: 'hidden', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                    <img src={importData} alt="Preview" style={{ maxHeight: 180, objectFit: 'contain' }} />
                  </div>
                )}
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowImportModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isProcessing || !importData}>
                  {isProcessing ? 'Importing...' : 'Save to Library'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
