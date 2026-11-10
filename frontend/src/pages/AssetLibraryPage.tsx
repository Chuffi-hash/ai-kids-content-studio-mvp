import React, { useState, useEffect } from 'react';
import { getAllCharacters, Character } from '../services/character.service';
import { getAllBackgroundAssets, BackgroundAsset } from '../services/studio.service';
import { useNavigate } from 'react-router-dom';

export default function AssetLibraryPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'all' | 'characters' | 'backgrounds'>('all');
  const [characters, setCharacters] = useState<Character[]>([]);
  const [backgrounds, setBackgrounds] = useState<BackgroundAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [chars, bgs] = await Promise.all([
          getAllCharacters().catch(() => []),
          getAllBackgroundAssets().catch(() => []),
        ]);
        setCharacters(chars);
        setBackgrounds(bgs);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filteredChars = characters.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.species.toLowerCase().includes(search.toLowerCase())
  );

  const filteredBgs = backgrounds.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.environmentType.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: '28px 36px', maxWidth: 1400, margin: '0 auto', color: 'var(--text-primary)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>
            Production Asset Library
          </h1>
          <p style={{ margin: '6px 0 0 0', color: 'var(--text-secondary)', fontSize: 14 }}>
            Central repository of reusable characters, environment backgrounds, and audio profiles across all story projects.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/characters')}
            style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13 }}
          >
            Character Studio
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/backgrounds')}
            style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13 }}
          >
            Background Studio
          </button>
        </div>
      </div>

      {/* Tabs and Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 16 }}>
        <div style={{ display: 'flex', gap: 6, backgroundColor: 'var(--bg-secondary)', padding: 4, borderRadius: 8 }}>
          {(['all', 'characters', 'backgrounds'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                border: 'none',
                backgroundColor: activeTab === tab ? 'var(--primary-color)' : 'transparent',
                color: activeTab === tab ? '#ffffff' : 'var(--text-secondary)',
                padding: '7px 16px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {tab === 'all' ? `All Assets (${characters.length + backgrounds.length})` : tab === 'characters' ? `Characters (${characters.length})` : `Backgrounds (${backgrounds.length})`}
            </button>
          ))}
        </div>

        <input
          type="text"
          className="form-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search assets by name or type..."
          style={{ maxWidth: 300 }}
        />
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading asset repository...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {/* Characters Section */}
          {(activeTab === 'all' || activeTab === 'characters') && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                  Characters ({filteredChars.length})
                </h2>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => navigate('/characters')}
                  style={{ fontSize: 13, color: 'var(--primary-color)', cursor: 'pointer', background: 'none', border: 'none' }}
                >
                  Manage Characters →
                </button>
              </div>

              {filteredChars.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', backgroundColor: 'var(--bg-secondary)', borderRadius: 10, color: 'var(--text-secondary)', fontSize: 13 }}>
                  No characters found.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
                  {filteredChars.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => navigate('/characters')}
                      style={{
                        padding: 16,
                        borderRadius: 12,
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        transition: 'transform 0.15s ease',
                      }}
                    >
                      <div
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 28,
                          backgroundColor: 'var(--bg-tertiary)',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {c.referenceImageUrl ? (
                          <img src={c.referenceImageUrl} alt={c.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span style={{ fontSize: 24 }}>👤</span>
                        )}
                      </div>
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                          {c.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {c.species} • {c.personality}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Backgrounds Section */}
          {(activeTab === 'all' || activeTab === 'backgrounds') && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                  Backgrounds & Environments ({filteredBgs.length})
                </h2>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => navigate('/backgrounds')}
                  style={{ fontSize: 13, color: 'var(--primary-color)', cursor: 'pointer', background: 'none', border: 'none' }}
                >
                  Manage Backgrounds →
                </button>
              </div>

              {filteredBgs.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', backgroundColor: 'var(--bg-secondary)', borderRadius: 10, color: 'var(--text-secondary)', fontSize: 13 }}>
                  No backgrounds found.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                  {filteredBgs.map((b) => (
                    <div
                      key={b.id}
                      onClick={() => navigate('/backgrounds')}
                      style={{
                        borderRadius: 12,
                        overflow: 'hidden',
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ width: '100%', height: 140, backgroundColor: '#0f172a' }}>
                        <img src={b.imageUrl} alt={b.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div style={{ padding: 12 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                          {b.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                          {b.environmentType} • {b.aspectRatio}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
