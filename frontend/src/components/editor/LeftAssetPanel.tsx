import React, { useState, useEffect, useRef } from 'react';
import { EditorStory, EditorScene, EditorCharacter } from '../../types/editor';
import { formatTimeMs, formatDurationHuman } from '../../utils/timingEngine';
import { resolveAssetUrl } from '../../utils/urlHelper';
import { fetchMusicTracks, uploadAudioFile, MusicTrackInfo } from '../../services/editor.service';
import { Character, getAllCharacters } from '../../services/character.service';
import {
  ClapperboardIcon,
  UsersIcon,
  ImageIcon,
  VideoIcon,
  MicIcon,
  MusicIcon,
  TrashIcon,
  CheckIcon,
  PlusIcon,
  PlayIcon,
  PauseIcon,
  VolumeHighIcon,
  VolumeMuteIcon,
  AlertTriangleIcon,
  FilmIcon,
  SparklesIcon,
} from '../common/Icons';

export type AssetTab = 'scenes' | 'characters' | 'images' | 'videos' | 'audio' | 'music';

interface LeftAssetPanelProps {
  story: EditorStory;
  scenes: EditorScene[];
  activeSceneId: string | null;
  onSelectScene: (sceneId: string) => void;
  onAddScene: () => void;
  onDuplicateScene: (sceneId: string) => void;
  onDeleteScene: (sceneId: string) => void;
  onMoveScene?: (sceneId: string, direction: 'up' | 'down') => void;
  onReorderScene?: (fromIndex: number, toIndex: number) => void;
  onOpenCharacterBuilder?: () => void;
  onGenerateImage: (sceneId: string) => Promise<void>;
  onGenerateVoice: (sceneId: string) => Promise<void>;
  onGenerateVideo: (sceneId: string, workflow?: 'ffmpeg' | 'ai') => Promise<void>;
  onToggleCharacterForScene: (characterId: string, sceneId: string) => void;
  onSelectMediaForScene: (sceneId: string, mediaUrl: string, type: 'image' | 'video') => void;
  selectedMusic: string | null;
  onSelectMusic: (musicTrack: string | null) => void;
  musicVolume: number;
  onMusicVolumeChange: (volume: number) => void;
  generatingImageForScene: string | null;
  generatingVoiceForScene: string | null;
  generatingVideoForScene: string | null;
  onGenerateCharacterReference: (characterId: string) => Promise<void>;
  onAddCharacterToScene?: (
    sceneId: string,
    characterId: string,
    customData?: { name: string; appearance?: any; rig?: any }
  ) => void;
  onSetBackgroundForScene?: (sceneId: string, imageUrl: string) => void;
}

export const LeftAssetPanel: React.FC<LeftAssetPanelProps> = ({
  story,
  scenes,
  activeSceneId,
  onSelectScene,
  onAddScene,
  onDuplicateScene,
  onDeleteScene,
  onMoveScene,
  onReorderScene,
  onOpenCharacterBuilder,
  onGenerateImage,
  onGenerateVoice,
  onGenerateVideo,
  onToggleCharacterForScene,
  onSelectMediaForScene,
  selectedMusic,
  onSelectMusic,
  musicVolume,
  onMusicVolumeChange,
  generatingImageForScene,
  generatingVoiceForScene,
  generatingVideoForScene,
  onGenerateCharacterReference,
  onAddCharacterToScene,
  onSetBackgroundForScene,
}) => {
  const [activeTab, setActiveTab] = useState<AssetTab>('scenes');
  const [previewingAudio, setPreviewingAudio] = useState<string | null>(null);
  const [musicTracks, setMusicTracks] = useState<MusicTrackInfo[]>([]);
  const [libraryCharacters, setLibraryCharacters] = useState<Character[]>([]);
  const [isUploadingAudio, setIsUploadingAudio] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [draggedSceneIdx, setDraggedSceneIdx] = useState<number | null>(null);
  const [dragOverSceneIdx, setDragOverSceneIdx] = useState<number | null>(null);

  // Load library characters for 2D custom rig insertion
  useEffect(() => {
    getAllCharacters()
      .then((chars) => setLibraryCharacters(chars))
      .catch((err) => console.warn('Could not load library characters:', err));
  }, [activeTab]);

  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeScene = scenes.find((s) => s.sceneId === activeSceneId) || scenes[0];

  // Stop any playing audio preview cleanly
  const stopAudio = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = '';
      currentAudioRef.current = null;
    }
    setPreviewingAudio(null);
  };

  // Stop audio whenever tab changes or component unmounts
  useEffect(() => {
    stopAudio();
    return () => stopAudio();
  }, [activeTab]);

  // Load music tracks from server
  const loadMusicTracks = async () => {
    try {
      const tracks = await fetchMusicTracks();
      setMusicTracks(tracks);
    } catch (err) {
      console.warn('Could not load dynamic music tracks, using fallback presets:', err);
      setMusicTracks([
        { id: 'gentle-storybook', label: 'Gentle Storybook (Calm & Warm)', isPreset: true },
        { id: 'playful-adventure', label: 'Playful Adventure (Upbeat & Cheerful)', isPreset: true },
        { id: 'whimsical-forest', label: 'Whimsical Forest (Magical & Light)', isPreset: true },
        { id: 'none', label: 'No Background Music (Voice Only)', isPreset: true },
      ]);
    }
  };

  useEffect(() => {
    loadMusicTracks();
  }, []);

  // Collect all unique images generated in this project
  const allImages = scenes
    .filter((s) => s.imageUrl || s.image?.imageUrl)
    .map((s) => ({
      sceneId: s.sceneId,
      sceneTitle: s.title,
      url: s.imageUrl || s.image?.imageUrl || '',
      prompt: s.visualPrompt || s.title,
    }));

  // Collect all unique videos generated in this project
  const allVideos = scenes
    .filter((s) => s.videoUrl)
    .map((s) => ({
      sceneId: s.sceneId,
      sceneTitle: s.title,
      url: s.videoUrl || '',
    }));

  const handlePlayAudioPreview = (audioUrl: string) => {
    if (previewingAudio === audioUrl) {
      stopAudio();
    } else {
      stopAudio();
      setPreviewingAudio(audioUrl);
      const audio = new Audio(resolveAssetUrl(audioUrl));
      currentAudioRef.current = audio;
      audio.onended = () => {
        setPreviewingAudio(null);
        currentAudioRef.current = null;
      };
      audio.play().catch((err) => {
        console.warn('Audio playback error:', err);
        setPreviewingAudio(null);
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingAudio(true);
      setUploadError(null);
      const res = await uploadAudioFile(file, 'music');
      // Reload tracks list
      await loadMusicTracks();
      // Select uploaded track
      onSelectMusic(res.url);
    } catch (err: any) {
      console.error('Audio upload error:', err);
      setUploadError(err.message || 'Failed to upload audio file');
    } finally {
      setIsUploadingAudio(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };


  return (
    <aside className="ed-asset-panel">
      {/* Tab Navigation */}
      <div className="ed-asset-tabs-header">
        <button
          type="button"
          className={`ed-asset-tab-btn ${activeTab === 'scenes' ? 'active' : ''}`}
          onClick={() => setActiveTab('scenes')}
        >
          <span className="tab-icon"><ClapperboardIcon size={14} /></span>
          <span>Scenes</span>
        </button>
        <button
          type="button"
          className={`ed-asset-tab-btn ${activeTab === 'characters' ? 'active' : ''}`}
          onClick={() => setActiveTab('characters')}
        >
          <span className="tab-icon"><UsersIcon size={14} /></span>
          <span>Characters</span>
        </button>
        <button
          type="button"
          className={`ed-asset-tab-btn ${activeTab === 'images' ? 'active' : ''}`}
          onClick={() => setActiveTab('images')}
        >
          <span className="tab-icon"><ImageIcon size={14} /></span>
          <span>Images</span>
        </button>
        <button
          type="button"
          className={`ed-asset-tab-btn ${activeTab === 'videos' ? 'active' : ''}`}
          onClick={() => setActiveTab('videos')}
        >
          <span className="tab-icon"><VideoIcon size={14} /></span>
          <span>Clips</span>
        </button>
        <button
          type="button"
          className={`ed-asset-tab-btn ${activeTab === 'audio' ? 'active' : ''}`}
          onClick={() => setActiveTab('audio')}
        >
          <span className="tab-icon"><MicIcon size={14} /></span>
          <span>Audio</span>
        </button>
        <button
          type="button"
          className={`ed-asset-tab-btn ${activeTab === 'music' ? 'active' : ''}`}
          onClick={() => setActiveTab('music')}
        >
          <span className="tab-icon"><MusicIcon size={14} /></span>
          <span>Music</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="ed-asset-tab-content">
        {/* 1. SCENES TAB */}
        {activeTab === 'scenes' && (
          <>
            <div className="ed-asset-section-title">
              <span>Project Scenes ({scenes.length})</span>
              <button
                className="ed-tool-btn"
                onClick={onAddScene}
                style={{ background: 'var(--ed-surface-elevated)' }}
              >
                + Add Scene
              </button>
            </div>

            {scenes.map((scene, idx) => {
              const isSelected = scene.sceneId === activeSceneId;
              const duration = scene.endMs > scene.startMs ? scene.endMs - scene.startMs : scene.estimatedDurationMs || 5000;
              const isDragging = draggedSceneIdx === idx;
              const isDragOver = dragOverSceneIdx === idx;

              return (
                <div
                  key={scene.sceneId}
                  className={`ed-asset-item-card ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
                  onClick={() => onSelectScene(scene.sceneId)}
                  draggable={true}
                  onDragStart={(e) => {
                    setDraggedSceneIdx(idx);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(idx));
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverSceneIdx !== idx) {
                      setDragOverSceneIdx(idx);
                    }
                  }}
                  onDragLeave={(e) => {
                    if (e.currentTarget === e.target) {
                      setDragOverSceneIdx(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedSceneIdx !== null && draggedSceneIdx !== idx) {
                      if (onReorderScene) {
                        onReorderScene(draggedSceneIdx, idx);
                      } else if (onMoveScene) {
                        const dir = idx < draggedSceneIdx ? 'up' : 'down';
                        onMoveScene(scenes[draggedSceneIdx].sceneId, dir);
                      }
                    }
                    setDraggedSceneIdx(null);
                    setDragOverSceneIdx(null);
                  }}
                  onDragEnd={() => {
                    setDraggedSceneIdx(null);
                    setDragOverSceneIdx(null);
                  }}
                >
                  <div
                    className="ed-asset-drag-handle"
                    title="Drag to reorder scene"
                    onClick={(e) => e.stopPropagation()}
                  >
                    ⠿
                  </div>
                  <div className="ed-asset-thumb">
                    {scene.imageUrl || scene.image?.imageUrl ? (
                      <img src={resolveAssetUrl(scene.imageUrl || scene.image?.imageUrl)} alt={scene.title} />
                    ) : (
                      <span>#{idx + 1}</span>
                    )}
                  </div>
                  <div className="ed-asset-info">
                    <div className="ed-asset-title">{scene.title}</div>
                    <div className="ed-asset-subtitle">
                      {formatDurationHuman(duration)} • {scene.narration ? `${scene.narration.slice(0, 30)}...` : 'No narration'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="ed-icon-btn"
                      onClick={() => onDuplicateScene(scene.sceneId)}
                      title="Duplicate Scene"
                      style={{ width: '22px', height: '22px', fontSize: '11px' }}
                    >
                      ⎘
                    </button>
                    {scenes.length > 1 && (
                      <button
                        type="button"
                        className="ed-icon-btn"
                        onClick={() => onDeleteScene(scene.sceneId)}
                        title="Delete Scene"
                        style={{ width: '22px', height: '22px', fontSize: '11px', color: '#f87171', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <TrashIcon size={11} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* 2. CHARACTERS TAB */}
        {activeTab === 'characters' && (
          <>
            <div className="ed-asset-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>2D Vector Character Rigs</span>
              {onOpenCharacterBuilder && (
                <button
                  type="button"
                  className="ed-tool-btn"
                  onClick={onOpenCharacterBuilder}
                  style={{ fontSize: '10px', background: 'rgba(59, 130, 246, 0.2)', borderColor: '#3b82f6', color: '#60a5fa' }}
                >
                  + Rig Studio
                </button>
              )}
            </div>

            {/* Pip the Bear */}
            <div className="ed-character-card" style={{ border: '1px solid #3b82f6', background: 'rgba(59, 130, 246, 0.08)' }}>
              <div className="ed-char-avatar" style={{ background: '#78350f', color: '#fef3c7', fontSize: '20px' }}>
                🐻
              </div>
              <div className="ed-asset-info">
                <div className="ed-asset-title">Pip the Bear</div>
                <div className="ed-asset-subtitle">Friendly Grizzly • Fully Rigged Vector</div>
                <div style={{ marginTop: '6px' }}>
                  <button
                    type="button"
                    className="ed-btn-action primary"
                    style={{ fontSize: '11px', padding: '4px 10px' }}
                    onClick={() => activeScene && onAddCharacterToScene && onAddCharacterToScene(activeScene.sceneId, 'pip_the_bear')}
                  >
                    + Add to Active Scene
                  </button>
                </div>
              </div>
            </div>

            {/* Sammy the Kid */}
            <div className="ed-character-card" style={{ border: '1px solid #10b981', background: 'rgba(16, 185, 129, 0.08)' }}>
              <div className="ed-char-avatar" style={{ background: '#065f46', color: '#d1fae5', fontSize: '20px' }}>
                🧒
              </div>
              <div className="ed-asset-info">
                <div className="ed-asset-title">Sammy the Kid</div>
                <div className="ed-asset-subtitle">Curious Explorer • Fully Rigged Vector</div>
                <div style={{ marginTop: '6px' }}>
                  <button
                    type="button"
                    className="ed-btn-action primary"
                    style={{ fontSize: '11px', padding: '4px 10px', background: '#10b981', borderColor: '#10b981' }}
                    onClick={() => activeScene && onAddCharacterToScene && onAddCharacterToScene(activeScene.sceneId, 'sammy_the_kid')}
                  >
                    + Add to Active Scene
                  </button>
                </div>
              </div>
            </div>

            {/* Custom Built Characters from Library */}
            {libraryCharacters.filter((c) => c.canonicalAppearance?.version === 1).map((char) => (
              <div key={char.id} className="ed-character-card" style={{ border: '1px solid #8b5cf6', background: 'rgba(139, 92, 246, 0.08)' }}>
                <div className="ed-char-avatar" style={{ background: '#3b0764', color: '#f3e8ff', fontSize: '18px' }}>
                  🎨
                </div>
                <div className="ed-asset-info">
                  <div className="ed-asset-title">{char.name}</div>
                  <div className="ed-asset-subtitle">{char.species} • Custom Vector Rig</div>
                  <div style={{ marginTop: '6px' }}>
                    <button
                      type="button"
                      className="ed-btn-action primary"
                      style={{ fontSize: '11px', padding: '4px 10px', background: '#8b5cf6', borderColor: '#8b5cf6' }}
                      onClick={() =>
                        activeScene &&
                        onAddCharacterToScene &&
                        onAddCharacterToScene(activeScene.sceneId, char.id, {
                          name: char.name,
                          appearance: char.canonicalAppearance,
                        })
                      }
                    >
                      + Add to Active Scene
                    </button>
                  </div>
                </div>
              </div>
            ))}

            <div className="ed-asset-section-title" style={{ marginTop: '12px' }}>
              <span>Story AI Characters ({story.characters?.length || 0})</span>
            </div>
            {story.characters && story.characters.length > 0 ? (
              story.characters.map((char) => {
                const isAttached = activeScene?.characterIds?.includes(char.id);

                return (
                  <div key={char.id} className="ed-character-card">
                    <div className="ed-char-avatar">
                      {char.referenceImageUrl ? (
                        <img src={resolveAssetUrl(char.referenceImageUrl)} alt={char.name} />
                      ) : (
                        <span>{char.name[0]}</span>
                      )}
                    </div>
                    <div className="ed-asset-info">
                      <div className="ed-asset-title">{char.name} ({char.species})</div>
                      <div className="ed-asset-subtitle">{char.personality}</div>
                      <div style={{ marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          className="ed-tool-btn"
                          style={{
                            fontSize: '10px',
                            background: isAttached ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
                            borderColor: isAttached ? '#3b82f6' : 'var(--ed-border)',
                          }}
                          onClick={() => activeScene && onToggleCharacterForScene(char.id, activeScene.sceneId)}
                        >
                          {isAttached ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <CheckIcon size={11} /> In Scene
                            </span>
                          ) : (
                            '+ Add to Scene'
                          )}
                        </button>
                        {!char.referenceImageUrl && (
                          <button
                            className="ed-tool-btn"
                            style={{ fontSize: '10px' }}
                            onClick={() => onGenerateCharacterReference(char.id)}
                          >
                            Gen Reference
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p style={{ fontSize: '12px', color: 'var(--ed-text-muted)' }}>
                No characters found in this story.
              </p>
            )}
          </>
        )}

        {/* 3. IMAGES TAB */}
        {activeTab === 'images' && (
          <>
            <div className="ed-asset-section-title">
              <span>Generated Images ({allImages.length})</span>
              {activeScene && (
                <button
                  className="ed-tool-btn"
                  onClick={() => onGenerateImage(activeScene.sceneId)}
                  disabled={generatingImageForScene === activeScene.sceneId}
                >
                  {generatingImageForScene === activeScene.sceneId ? 'Generating...' : '+ Gen for Active'}
                </button>
              )}
            </div>

            {allImages.length > 0 ? (
              allImages.map((img, i) => (
                <div
                  key={i}
                  className="ed-asset-item-card"
                  onClick={() => activeScene && onSelectMediaForScene(activeScene.sceneId, img.url, 'image')}
                  title="Click to assign to currently selected scene"
                >
                  <div className="ed-asset-thumb" style={{ width: '64px', height: '42px' }}>
                    <img src={resolveAssetUrl(img.url)} alt={img.prompt} />
                  </div>
                  <div className="ed-asset-info">
                    <div className="ed-asset-title">{img.sceneTitle}</div>
                    <div className="ed-asset-subtitle">{img.prompt}</div>
                    <div style={{ marginTop: '4px', display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="ed-tool-btn"
                        style={{ fontSize: '10px', padding: '2px 6px' }}
                        onClick={() => activeScene && onSetBackgroundForScene && onSetBackgroundForScene(activeScene.sceneId, img.url)}
                        title="Set as 2D Animation Canvas Background"
                      >
                        Set as 2D BG
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 8px', color: 'var(--ed-text-muted)', fontSize: '12px' }}>
                <p>No images generated yet.</p>
                {activeScene && (
                  <button
                    className="ed-btn-action primary"
                    style={{ marginTop: '8px' }}
                    onClick={() => onGenerateImage(activeScene.sceneId)}
                    disabled={generatingImageForScene === activeScene.sceneId}
                  >
                    {generatingImageForScene === activeScene.sceneId ? 'Generating Image...' : 'Generate Scene Image'}
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* 4. VIDEO CLIPS TAB */}
        {activeTab === 'videos' && (
          <>
            <div className="ed-asset-section-title">
              <span>Video Clips ({allVideos.length})</span>
              {activeScene && (
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    className="ed-tool-btn"
                    onClick={() => onGenerateVideo(activeScene.sceneId, 'ffmpeg')}
                    disabled={generatingVideoForScene === activeScene.sceneId}
                    title="Render Ken Burns motion video from image"
                  >
                    {generatingVideoForScene === activeScene.sceneId ? 'Rendering...' : '+ FFmpeg'}
                  </button>
                  <button
                    className="ed-tool-btn"
                    onClick={() => onGenerateVideo(activeScene.sceneId, 'ai')}
                    disabled={generatingVideoForScene === activeScene.sceneId}
                    title="Generate video via AI video model"
                  >
                    + AI Video
                  </button>
                </div>
              )}
            </div>

            {allVideos.length > 0 ? (
              allVideos.map((vid, i) => (
                <div
                  key={i}
                  className="ed-asset-item-card"
                  onClick={() => activeScene && onSelectMediaForScene(activeScene.sceneId, vid.url, 'video')}
                >
                  <div className="ed-asset-thumb" style={{ width: '64px', height: '42px' }}>
                    <video src={resolveAssetUrl(vid.url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div className="ed-asset-info">
                    <div className="ed-asset-title">{vid.sceneTitle}</div>
                    <div className="ed-asset-subtitle">Rendered MP4 Clip</div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 8px', color: 'var(--ed-text-muted)', fontSize: '12px' }}>
                <p>No video clips rendered yet.</p>
                {activeScene && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                    <button
                      type="button"
                      className="ed-btn-action primary"
                      onClick={() => onGenerateVideo(activeScene.sceneId, 'ffmpeg')}
                      disabled={generatingVideoForScene === activeScene.sceneId}
                      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <FilmIcon size={14} />
                      <span>{generatingVideoForScene === activeScene.sceneId ? 'Rendering Clip...' : 'Render Motion Clip (FFmpeg)'}</span>
                    </button>
                    <button
                      type="button"
                      className="ed-btn-action"
                      onClick={() => onGenerateVideo(activeScene.sceneId, 'ai')}
                      disabled={generatingVideoForScene === activeScene.sceneId}
                      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <SparklesIcon size={14} />
                      <span>Generate AI Video</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* 5. NARRATION & AUDIO TAB */}
        {activeTab === 'audio' && (
          <>
            <div className="ed-asset-section-title">
              <span>Narration Audio Tracks</span>
              {activeScene && (
                <button
                  className="ed-tool-btn"
                  onClick={() => onGenerateVoice(activeScene.sceneId)}
                  disabled={generatingVoiceForScene === activeScene.sceneId}
                >
                  {generatingVoiceForScene === activeScene.sceneId ? 'Generating...' : '+ Gen Voice'}
                </button>
              )}
            </div>

            {scenes.map((scene) => {
              const isSelected = scene.sceneId === activeSceneId;
              const isPlayingThis = previewingAudio === scene.audioUrl;

              return (
                <div
                  key={scene.sceneId}
                  className={`ed-asset-item-card ${isSelected ? 'selected' : ''}`}
                  style={{ flexDirection: 'column', alignItems: 'stretch' }}
                  onClick={() => onSelectScene(scene.sceneId)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div className="ed-asset-title">Scene {scene.number}: {scene.title}</div>
                    {scene.actualAudioDurationMs ? (
                      <span className="ed-audio-badge-verified" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <CheckIcon size={11} /> {(scene.actualAudioDurationMs / 1000).toFixed(1)}s
                      </span>
                    ) : (
                      <span className="ed-audio-badge-estimated">
                        Draft
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--ed-text-muted)', margin: '4px 0', lineHeight: 1.3 }}>
                    {scene.narration ? (
                      scene.narration.length > 70 ? `${scene.narration.slice(0, 70)}...` : scene.narration
                    ) : (
                      <em>(Empty narration)</em>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }} onClick={(e) => e.stopPropagation()}>
                    {scene.audioUrl && (
                      <button
                        type="button"
                        className="ed-tool-btn"
                        onClick={() => handlePlayAudioPreview(scene.audioUrl!)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        {isPlayingThis ? <><PauseIcon size={12} /> Stop Voice</> : <><PlayIcon size={12} /> Preview Voice</>}
                      </button>
                    )}
                    <button
                      className="ed-tool-btn"
                      onClick={() => onGenerateVoice(scene.sceneId)}
                      disabled={generatingVoiceForScene === scene.sceneId || !scene.narration}
                    >
                      {generatingVoiceForScene === scene.sceneId ? 'Generating...' : scene.audioUrl ? 'Regen Voice' : 'Gen Voice (TTS)'}
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* 6. MUSIC TAB */}
        {activeTab === 'music' && (
          <>
            <div className="ed-asset-section-title">
              <span>Soundtracks & Audio Files</span>
              <button
                type="button"
                className="ed-tool-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAudio}
                title="Upload MP3, WAV, AAC, or M4A audio file"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                <PlusIcon size={12} />
                <span>{isUploadingAudio ? 'Uploading...' : 'Upload Audio'}</span>
              </button>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="audio/*"
              style={{ display: 'none' }}
            />

            {uploadError && (
              <div className="ed-warning-box" style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: '#ef4444', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangleIcon size={14} color="#fca5a5" />
                <span>{uploadError}</span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {musicTracks.map((track) => {
                const trackIdentifier = track.url || track.id;
                const isSelected = selectedMusic === trackIdentifier || (track.id === 'none' && (selectedMusic === null || selectedMusic === 'none'));
                const isPlayingThis = previewingAudio === track.url;

                return (
                  <div
                    key={track.id}
                    className={`ed-music-item ${isSelected ? 'active' : ''}`}
                    onClick={() => onSelectMusic(track.id === 'none' ? null : trackIdentifier)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                      {track.url && (
                        <button
                          type="button"
                          className="ed-audio-btn-sm"
                          style={{ width: '22px', height: '22px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePlayAudioPreview(track.url!);
                          }}
                          title={isPlayingThis ? 'Stop track' : 'Preview track'}
                        >
                          {isPlayingThis ? <PauseIcon size={10} color="#ffffff" /> : <PlayIcon size={10} color="#ffffff" />}
                        </button>
                      )}
                      <span style={{ fontSize: '12px', fontWeight: isSelected ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {track.label}
                      </span>
                    </div>
                    {isSelected && (
                      <span style={{ color: 'var(--ed-accent)', display: 'inline-flex' }}>
                        <CheckIcon size={13} />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: '16px' }}>
              <div className="ed-field-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Soundtrack Volume ({Math.round(musicVolume * 100)}%)</span>
                {musicVolume === 0 ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#94a3b8' }}>
                    <VolumeMuteIcon size={13} /> Muted
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', color: '#94a3b8' }}>
                    <VolumeHighIcon size={13} />
                  </span>
                )}
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={musicVolume}
                onChange={(e) => onMusicVolumeChange(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--ed-accent)', marginTop: '8px' }}
              />
            </div>
          </>
        )}
      </div>
    </aside>
  );
};

