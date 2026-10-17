import React, { useState, useEffect } from 'react';
import { EditorStory } from '../../types/editor';
import { Character, getAllCharacters } from '../../services/character.service';
import {
  saveStoryMetadata,
  setStoryCharacters,
  fetchStoryCharacters,
} from '../../services/editor.service';
import { CloseIcon, CheckIcon, PlusIcon, SparklesIcon } from '../common/Icons';

interface StoryDetailsModalProps {
  isOpen: boolean;
  story: EditorStory;
  onClose: () => void;
  onStoryUpdated: (updatedStory: Partial<EditorStory>) => void;
  onOpenCharacterBuilder?: () => void;
}

export const StoryDetailsModal: React.FC<StoryDetailsModalProps> = ({
  isOpen,
  story,
  onClose,
  onStoryUpdated,
  onOpenCharacterBuilder,
}) => {
  // Story details state
  const [title, setTitle] = useState(story.title || '');
  const [logline, setLogline] = useState(story.logline || '');
  const [lesson, setLesson] = useState(story.lesson || '');
  const [audience, setAudience] = useState(story.audience || '4-7 years');
  const [genre, setGenre] = useState(story.genre || 'Adventure');
  const [topic, setTopic] = useState(story.topic || '');
  const [targetDuration, setTargetDuration] = useState<number | ''>(
    story.targetDuration ? Math.round(story.targetDuration / 1000) : ''
  );

  // Characters management state
  const [allCharacters, setAllCharacters] = useState<Character[]>([]);
  const [linkedCharacterIds, setLinkedCharacterIds] = useState<string[]>(
    story.characters ? story.characters.map((c) => c.id) : []
  );
  const [isLoadingChars, setIsLoadingChars] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'characters'>('details');

  // Load characters on open
  useEffect(() => {
    if (isOpen) {
      setTitle(story.title || '');
      setLogline(story.logline || '');
      setLesson(story.lesson || '');
      setAudience(story.audience || '4-7 years');
      setGenre(story.genre || 'Adventure');
      setTopic(story.topic || '');
      setTargetDuration(
        story.targetDuration ? Math.round(story.targetDuration / 1000) : ''
      );
      setLinkedCharacterIds(
        story.characters ? story.characters.map((c) => c.id) : []
      );
      setErrorMsg(null);

      // Fetch all library characters
      setIsLoadingChars(true);
      getAllCharacters()
        .then((chars) => {
          setAllCharacters(chars);
        })
        .catch((err) => {
          console.error('Failed to load library characters:', err);
        })
        .finally(() => setIsLoadingChars(false));
    }
  }, [isOpen, story]);

  const handleToggleCharacter = (charId: string) => {
    setLinkedCharacterIds((prev) =>
      prev.includes(charId) ? prev.filter((id) => id !== charId) : [...prev, charId]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Story title is required');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMsg(null);

      const targetDurationMs =
        typeof targetDuration === 'number' && targetDuration > 0
          ? targetDuration * 1000
          : null;

      // 1. Update story metadata
      const updatedMetadata = await saveStoryMetadata(story.storyId, {
        title: title.trim(),
        logline: logline.trim(),
        lesson: lesson.trim(),
        audience: audience.trim(),
        genre: genre.trim(),
        topic: topic.trim(),
        targetDuration: targetDurationMs,
      });

      // 2. Update linked story characters
      const updatedChars = await setStoryCharacters(story.storyId, linkedCharacterIds);

      // 3. Notify parent
      onStoryUpdated({
        ...updatedMetadata,
        title: title.trim(),
        logline: logline.trim(),
        lesson: lesson.trim(),
        audience: audience.trim(),
        genre: genre.trim(),
        topic: topic.trim(),
        targetDuration: targetDurationMs,
        characters: updatedChars,
      });

      onClose();
    } catch (err: any) {
      console.error('Failed to save story details:', err);
      setErrorMsg(err.message || 'Failed to update story');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="char-builder-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="char-builder-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '800px', height: '620px' }}
      >
        {/* Modal Header */}
        <div className="char-builder-header">
          <div className="char-builder-header-left">
            <span className="char-builder-badge" style={{ borderColor: '#8b5cf6', color: '#c084fc', background: 'rgba(139, 92, 246, 0.15)' }}>
              Story Studio
            </span>
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc' }}>
              Story Details & Characters
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              className="char-builder-btn primary"
              onClick={handleSave}
              disabled={isSaving}
              style={{ background: '#8b5cf6' }}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              className="char-builder-close-btn"
              onClick={onClose}
              aria-label="Close"
            >
              <CloseIcon size={18} />
            </button>
          </div>
        </div>

        {errorMsg && <div className="char-builder-alert">{errorMsg}</div>}

        {/* Tab Navigation */}
        <div className="char-builder-tabs" style={{ background: '#0e1726' }}>
          <button
            type="button"
            className={`char-builder-tab ${activeTab === 'details' ? 'active' : ''}`}
            onClick={() => setActiveTab('details')}
          >
            📖 Narrative & Metadata
          </button>
          <button
            type="button"
            className={`char-builder-tab ${activeTab === 'characters' ? 'active' : ''}`}
            onClick={() => setActiveTab('characters')}
          >
            👥 Characters ({linkedCharacterIds.length} linked)
          </button>
        </div>

        {/* Tab Content */}
        <div className="char-builder-tab-body" style={{ padding: '20px', background: '#090d16', flex: 1, overflowY: 'auto' }}>
          {/* TAB 1: DETAILS */}
          {activeTab === 'details' && (
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="char-control-group">
                <label>Story Title *</label>
                <input
                  type="text"
                  className="char-builder-name-input"
                  style={{ width: '100%', fontSize: '14px' }}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Pip and Sammy's Forest Adventure"
                  required
                />
              </div>

              <div className="char-control-group">
                <label>Logline / Synopsis</label>
                <textarea
                  className="char-builder-name-input"
                  style={{ width: '100%', minHeight: '65px', fontSize: '13px', resize: 'vertical' }}
                  value={logline}
                  onChange={(e) => setLogline(e.target.value)}
                  placeholder="A concise summary of the story journey..."
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="char-control-group">
                  <label>Target Audience / Age Group</label>
                  <select
                    className="char-builder-name-input"
                    style={{ width: '100%' }}
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                  >
                    <option value="2-4 years">Toddlers (2-4 years)</option>
                    <option value="4-7 years">Early Readers (4-7 years)</option>
                    <option value="7-10 years">Kids (7-10 years)</option>
                    <option value="Family">Family / All Ages</option>
                  </select>
                </div>

                <div className="char-control-group">
                  <label>Genre</label>
                  <select
                    className="char-builder-name-input"
                    style={{ width: '100%' }}
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                  >
                    <option value="Adventure">Adventure</option>
                    <option value="Bedtime">Bedtime / Calm</option>
                    <option value="Educational">Educational / Learning</option>
                    <option value="Comedy">Fun & Comedy</option>
                    <option value="Fantasy">Magic & Fantasy</option>
                    <option value="Friendship">Friendship</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
                <div className="char-control-group">
                  <label>Moral Lesson / Theme</label>
                  <input
                    type="text"
                    className="char-builder-name-input"
                    style={{ width: '100%' }}
                    value={lesson}
                    onChange={(e) => setLesson(e.target.value)}
                    placeholder="e.g., Sharing and helping friends in need"
                  />
                </div>

                <div className="char-control-group">
                  <label>Target Duration (Seconds)</label>
                  <input
                    type="number"
                    min="1"
                    className="char-builder-name-input"
                    style={{ width: '100%' }}
                    value={targetDuration}
                    onChange={(e) =>
                      setTargetDuration(e.target.value === '' ? '' : parseInt(e.target.value, 10))
                    }
                    placeholder="e.g., 30"
                  />
                </div>
              </div>
            </form>
          )}

          {/* TAB 2: CHARACTERS */}
          {activeTab === 'characters' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                    Connect Library Characters to this Story
                  </span>
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0 0' }}>
                    Select which characters appear in this story. You can also build new characters in the Vector Rig Studio.
                  </p>
                </div>

                {onOpenCharacterBuilder && (
                  <button
                    type="button"
                    className="char-builder-btn primary"
                    onClick={() => {
                      onClose();
                      onOpenCharacterBuilder();
                    }}
                    style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <PlusIcon size={12} />
                    <span>Open Rig Studio</span>
                  </button>
                )}
              </div>

              {isLoadingChars ? (
                <p style={{ color: '#94a3b8', fontSize: '12px' }}>Loading characters...</p>
              ) : allCharacters.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', background: '#0e1726', borderRadius: '8px', border: '1px dashed #334155' }}>
                  <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>No characters in library yet.</p>
                  {onOpenCharacterBuilder && (
                    <button
                      type="button"
                      className="char-builder-btn primary"
                      onClick={() => {
                        onClose();
                        onOpenCharacterBuilder();
                      }}
                      style={{ marginTop: '12px', fontSize: '12px' }}
                    >
                      + Create First Character
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                  {allCharacters.map((char) => {
                    const isLinked = linkedCharacterIds.includes(char.id);
                    const hasCustomAppearance = char.canonicalAppearance?.version === 1;

                    return (
                      <div
                        key={char.id}
                        onClick={() => handleToggleCharacter(char.id)}
                        style={{
                          background: isLinked ? 'rgba(139, 92, 246, 0.15)' : '#0e1726',
                          border: `1px solid ${isLinked ? '#8b5cf6' : '#1e293b'}`,
                          borderRadius: '8px',
                          padding: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          transition: 'all 0.15s',
                        }}
                      >
                        <div
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            background: '#1e293b',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '16px',
                            color: '#e2e8f0',
                            flexShrink: 0,
                          }}
                        >
                          {char.name ? char.name[0] : 'C'}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {char.name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                            {char.species} {hasCustomAppearance ? '• Vector Rig' : ''}
                          </div>
                        </div>

                        <div
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '4px',
                            border: `1px solid ${isLinked ? '#8b5cf6' : '#334155'}`,
                            background: isLinked ? '#8b5cf6' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ffffff',
                            flexShrink: 0,
                          }}
                        >
                          {isLinked && <CheckIcon size={12} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StoryDetailsModal;

