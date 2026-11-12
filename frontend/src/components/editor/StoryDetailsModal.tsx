import React, { useState, useEffect } from 'react';
import { EditorStory } from '../../types/editor';
import { Character, getAllCharacters } from '../../services/character.service';
import {
  saveStoryMetadata,
  setStoryCharacters,
  fetchStoryCharacters,
  regenerateStoryContent,
} from '../../services/editor.service';
import { CloseIcon, CheckIcon, PlusIcon, SparklesIcon, AlertTriangleIcon } from '../common/Icons';
import { useGoogleFlowProject } from '../../hooks/useGoogleFlowProject';

interface StoryDetailsModalProps {
  isOpen: boolean;
  story: EditorStory;
  onClose: () => void;
  onStoryUpdated: (updatedStory: Partial<EditorStory>) => void;
  onStoryRegenerated?: () => void;
  onOpenCharacterBuilder?: () => void;
}

export const StoryDetailsModal: React.FC<StoryDetailsModalProps> = ({
  isOpen,
  story,
  onClose,
  onStoryUpdated,
  onStoryRegenerated,
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
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'characters' | 'flow'>('details');

  // Google Flow project management hook
  const {
    flowProjectId,
    projectUrl: flowProjectUrl,
    isConnected: isFlowConnected,
    loading: isFlowLoading,
    error: flowError,
    connect: connectFlow,
    disconnect: disconnectFlow,
    openFlowProject,
  } = useGoogleFlowProject(story.storyId);
  const [flowInputUrl, setFlowInputUrl] = useState('');
  const [isEditingFlow, setIsEditingFlow] = useState(false);
  const [flowSuccessMsg, setFlowSuccessMsg] = useState<string | null>(null);
  const [flowLocalError, setFlowLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (flowProjectUrl) {
      setFlowInputUrl(flowProjectUrl);
      setIsEditingFlow(false);
    } else {
      setFlowInputUrl('');
      setIsEditingFlow(true);
    }
  }, [flowProjectUrl, isOpen]);

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

  const handleRegenerateStory = async () => {
    try {
      setIsRegenerating(true);
      setErrorMsg(null);

      const targetDurationSeconds =
        typeof targetDuration === 'number' && targetDuration > 0
          ? targetDuration
          : undefined;

      await regenerateStoryContent(story.storyId, {
        topic: topic.trim() || title.trim(),
        title: title.trim(),
        ageGroup: audience,
        desiredDurationSeconds: targetDurationSeconds,
        genre: genre.trim(),
        lesson: lesson.trim(),
        characterIds: linkedCharacterIds,
      });

      setShowRegenerateConfirm(false);
      onClose();
      if (onStoryRegenerated) {
        onStoryRegenerated();
      }
    } catch (err: any) {
      console.error('Failed to regenerate story:', err);
      setErrorMsg(err.message || 'Failed to regenerate story');
    } finally {
      setIsRegenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="ed-details-overlay" onClick={onClose}>
      <div className="ed-details-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="ed-details-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="ed-details-badge">Story Studio</span>
            <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ed-text)' }}>
              Story Details & Roles
            </span>
          </div>

          <button
            type="button"
            className="ed-btn ed-btn-ghost"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--ed-text-muted)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Story Regeneration Confirmation Dialog */}
        {showRegenerateConfirm && (
          <div
            style={{
              padding: '12px 18px',
              background: 'rgba(239, 68, 68, 0.12)',
              borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
              color: 'var(--ed-text)',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexShrink: 0,
            }}
          >
            <div>
              <div style={{ fontWeight: 600, color: '#ef4444', marginBottom: '2px' }}>
                ⚠️ Confirm Full Story Regeneration
              </div>
              <div style={{ color: 'var(--ed-text-muted)' }}>
                This will use AI to regenerate the entire narrative, replacing current scenes, dialogue, and character actions.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleRegenerateStory}
                disabled={isRegenerating}
                style={{ background: '#dc2626', borderColor: '#b91c1c', fontSize: '11px', padding: '6px 12px' }}
              >
                {isRegenerating ? 'Generating...' : 'Yes, Regenerate'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowRegenerateConfirm(false)}
                disabled={isRegenerating}
                style={{ fontSize: '11px', padding: '6px 12px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {errorMsg && (
          <div style={{ padding: '10px 16px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', borderBottom: '1px solid rgba(239, 68, 68, 0.25)', fontSize: '12px' }}>
            {errorMsg}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="ed-details-tabs">
          <button
            type="button"
            className={`ed-details-tab ${activeTab === 'details' ? 'active' : ''}`}
            onClick={() => setActiveTab('details')}
          >
            📖 Narrative & Metadata
          </button>
          <button
            type="button"
            className={`ed-details-tab ${activeTab === 'characters' ? 'active' : ''}`}
            onClick={() => setActiveTab('characters')}
          >
            👥 Characters ({linkedCharacterIds.length} linked)
          </button>
          <button
            type="button"
            className={`ed-details-tab ${activeTab === 'flow' ? 'active' : ''}`}
            onClick={() => setActiveTab('flow')}
          >
            <SparklesIcon size={12} color="#a78bfa" />
            <span>Google Flow Project</span>
            {isFlowConnected && (
              <span style={{ fontSize: '10px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '1px 6px', borderRadius: '10px' }}>
                Connected
              </span>
            )}
          </button>
        </div>

        {/* Tab Content */}
        <div className="ed-details-body">
          {/* TAB 1: DETAILS */}
          {activeTab === 'details' && (
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="ed-details-form-group">
                <label className="ed-details-label">Story Title *</label>
                <input
                  type="text"
                  className="ed-details-input"
                  style={{ width: '100%', fontSize: '14px' }}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Earth's Promise: The Four Seasons"
                  required
                />
              </div>

              <div className="ed-details-form-group">
                <label className="ed-details-label">Logline / Synopsis</label>
                <textarea
                  className="ed-details-textarea"
                  style={{ width: '100%', minHeight: '70px', fontSize: '13px', resize: 'vertical' }}
                  value={logline}
                  onChange={(e) => setLogline(e.target.value)}
                  placeholder="A concise summary of the story journey..."
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="ed-details-form-group">
                  <label className="ed-details-label">Target Audience / Age Group</label>
                  <select
                    className="ed-details-select"
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

                <div className="ed-details-form-group">
                  <label className="ed-details-label">Genre</label>
                  <select
                    className="ed-details-select"
                    style={{ width: '100%' }}
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                  >
                    <option value="Adventure">Adventure & Quest</option>
                    <option value="Bedtime">Bedtime & Calm</option>
                    <option value="Educational">Educational & Science</option>
                    <option value="Comedy">Fun & Playful / Comedy</option>
                    <option value="Fantasy">Magic & Fantasy</option>
                    <option value="Friendship">Friendship & Social</option>
                    <option value="Moral">Moral & Fable</option>
                    <option value="Sci-Fi">Sci-Fi & Space</option>
                    <option value="Nature">Nature & Animals</option>
                    <option value="Superhero">Action & Superhero</option>
                    <option value="Mystery">Mystery & Detective</option>
                    <option value="Rhymes">Nursery Rhyme & Music</option>
                    <option value="DailyLife">Everyday Life & Family</option>
                    {![
                      "Adventure", "Bedtime", "Educational", "Comedy", "Fantasy",
                      "Friendship", "Moral", "Sci-Fi", "Nature", "Superhero",
                      "Mystery", "Rhymes", "DailyLife"
                    ].includes(genre) && (
                      <option value={genre}>{genre}</option>
                    )}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
                <div className="ed-details-form-group">
                  <label className="ed-details-label">Moral Lesson / Theme</label>
                  <input
                    type="text"
                    className="ed-details-input"
                    style={{ width: '100%' }}
                    value={lesson}
                    onChange={(e) => setLesson(e.target.value)}
                    placeholder="e.g., Every season has a special purpose in nature"
                  />
                </div>

                <div className="ed-details-form-group">
                  <label className="ed-details-label">Target Duration (Seconds)</label>
                  <input
                    type="number"
                    min="1"
                    className="ed-details-input"
                    style={{ width: '100%' }}
                    value={targetDuration}
                    onChange={(e) =>
                      setTargetDuration(e.target.value === '' ? '' : parseInt(e.target.value, 10))
                    }
                    placeholder="e.g., 60"
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
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ed-text)' }}>
                    Connect Library Characters to this Story
                  </span>
                  <p style={{ fontSize: '11px', color: 'var(--ed-text-muted)', margin: '2px 0 0 0' }}>
                    Select which characters appear in this story. You can also build new characters in the Vector Rig Studio.
                  </p>
                </div>

                {onOpenCharacterBuilder && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
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
                <p style={{ color: 'var(--ed-text-muted)', fontSize: '12px' }}>Loading characters...</p>
              ) : allCharacters.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', background: 'var(--ed-surface-elevated)', borderRadius: '8px', border: '1px dashed var(--ed-border)' }}>
                  <p style={{ color: 'var(--ed-text-muted)', fontSize: '13px', margin: 0 }}>No characters in library yet.</p>
                  {onOpenCharacterBuilder && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
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
                        className={`ed-details-char-card ${isLinked ? 'selected' : ''}`}
                      >
                        <div
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            background: 'var(--ed-surface-hover)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '16px',
                            color: 'var(--ed-text)',
                            flexShrink: 0,
                          }}
                        >
                          {char.name ? char.name[0] : 'C'}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ed-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {char.name}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>
                            {char.species} {hasCustomAppearance ? '• Vector Rig' : ''}
                          </div>
                        </div>

                        <div
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '4px',
                            border: `1px solid ${isLinked ? 'var(--ed-accent)' : 'var(--ed-border)'}`,
                            background: isLinked ? 'var(--ed-accent)' : 'transparent',
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

          {/* TAB 3: GOOGLE FLOW PROJECT */}
          {activeTab === 'flow' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ padding: '12px 14px', background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.25)', borderRadius: '8px', fontSize: '13px', lineHeight: 1.4, color: 'var(--ed-text)' }}>
                <div style={{ fontWeight: 600, color: '#c4b5fd', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <SparklesIcon size={14} color="#8b5cf6" />
                  <span>Google Flow Workspace Integration</span>
                </div>
                <div style={{ color: 'var(--ed-text-muted)', fontSize: '12px' }}>
                  Optionally link this story to its dedicated Google Flow project to easily organize character sheets, pose references, and storybook backgrounds.
                </div>
              </div>

              {/* Status Row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px' }}>
                <span style={{ color: 'var(--ed-text-muted)', fontWeight: 600 }}>Connection Status:</span>
                {isFlowConnected ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.35)', color: '#34d399', fontWeight: 600 }}>
                    <CheckIcon size={12} />
                    <span>Connected</span>
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: '12px', background: 'rgba(148, 163, 184, 0.15)', border: '1px solid rgba(148, 163, 184, 0.3)', color: 'var(--ed-text-muted)', fontWeight: 600 }}>
                    <span>Not Connected</span>
                  </span>
                )}
                {flowProjectId && (
                  <span style={{ fontFamily: 'monospace', fontSize: '11px', background: 'var(--ed-bg-alt, rgba(0, 0, 0, 0.25))', padding: '3px 8px', borderRadius: '6px', color: 'var(--ed-text-muted)' }}>
                    ID: {flowProjectId}
                  </span>
                )}
              </div>

              {/* Alerts */}
              {(flowLocalError || flowError) && (
                <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '6px', color: '#fca5a5', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangleIcon size={13} color="#ef4444" />
                  <span>{flowLocalError || flowError}</span>
                </div>
              )}

              {flowSuccessMsg && (
                <div style={{ padding: '8px 12px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.35)', borderRadius: '6px', color: '#6ee7b7', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckIcon size={13} color="#10b981" />
                  <span>{flowSuccessMsg}</span>
                </div>
              )}

              {isFlowConnected && !isEditingFlow ? (
                <div style={{ background: 'var(--ed-bg-alt, rgba(15, 23, 42, 0.5))', border: '1px solid var(--ed-border, rgba(255, 255, 255, 0.08))', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--ed-text-muted)', marginBottom: '4px' }}>
                      Connected Project URL:
                    </div>
                    <a
                      href={flowProjectUrl || `https://flow.google.com/project/${flowProjectId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#38bdf8', textDecoration: 'none', fontSize: '13px', fontWeight: 500, wordBreak: 'break-all', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      {flowProjectUrl || `https://flow.google.com/project/${flowProjectId}`}
                      <span>↗</span>
                    </a>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => openFlowProject()}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      title="Open in Google Flow in new tab"
                    >
                      <span>Open Google Flow</span>
                      <span>↗</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setIsEditingFlow(true)}
                      disabled={isFlowLoading}
                    >
                      Update Project
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={async () => {
                        if (!window.confirm('Disconnect this Google Flow project from this story?')) return;
                        setFlowLocalError(null);
                        try {
                          await disconnectFlow();
                          onStoryUpdated({ flowProjectId: null });
                          setIsEditingFlow(true);
                          setFlowInputUrl('');
                          setFlowSuccessMsg('Project disconnected.');
                          setTimeout(() => setFlowSuccessMsg(null), 3000);
                        } catch (err: any) {
                          setFlowLocalError(err.message || 'Failed to disconnect');
                        }
                      }}
                      disabled={isFlowLoading}
                      style={{ color: '#fca5a5', borderColor: 'rgba(239, 68, 68, 0.35)' }}
                    >
                      Disconnect Project
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="ed-details-form-group" style={{ marginBottom: 0 }}>
                    <label className="ed-details-label" htmlFor="story-flow-input">
                      Google Flow Project URL or ID
                    </label>
                    <input
                      id="story-flow-input"
                      type="text"
                      className="ed-details-input"
                      placeholder="https://flow.google.com/project/1d08d0de-5b98-40fa-b592-632130b536c5"
                      value={flowInputUrl}
                      onChange={(e) => setFlowInputUrl(e.target.value)}
                      disabled={isFlowLoading}
                      style={{ width: '100%' }}
                    />
                    <div style={{ fontSize: '11px', color: 'var(--ed-text-muted)', marginTop: '4px' }}>
                      Paste the link from your browser address bar when working inside your Google Flow project.
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={isFlowLoading || !flowInputUrl.trim()}
                      onClick={async () => {
                        setFlowLocalError(null);
                        try {
                          const res = await connectFlow(flowInputUrl.trim());
                          onStoryUpdated({ flowProjectId: res.flowProjectId });
                          setIsEditingFlow(false);
                          setFlowSuccessMsg('Google Flow project connected successfully!');
                          setTimeout(() => setFlowSuccessMsg(null), 3500);
                        } catch (err: any) {
                          setFlowLocalError(err.message || 'Failed to connect');
                        }
                      }}
                    >
                      {isFlowLoading ? 'Connecting…' : isFlowConnected ? 'Update Project' : 'Connect Project'}
                    </button>
                    {isFlowConnected && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setIsEditingFlow(false);
                          setFlowInputUrl(flowProjectUrl || '');
                          setFlowLocalError(null);
                        }}
                        disabled={isFlowLoading}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="ed-details-footer">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowRegenerateConfirm(true)}
            disabled={isSaving || isRegenerating}
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              borderColor: '#ef4444',
              color: '#ef4444',
              fontSize: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Regenerate all story scenes and dialogue using AI"
          >
            <SparklesIcon size={13} />
            <span>Regenerate Story (AI)</span>
          </button>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onClose}
              disabled={isSaving || isRegenerating}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSave}
              disabled={isSaving || isRegenerating}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StoryDetailsModal;

