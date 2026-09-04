import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchStory, StorybookStory } from '../services/storybook.service';
import { StoryOverview } from '../components/story/StoryOverview';
import { StoryEditForm } from '../components/story/StoryEditForm';
import { generateScenes } from '../services/content.service';
import { getApiUrl } from '../utils/urlHelper';
import { PageHeader } from '../components/common/PageHeader';
import { BackButton } from '../components/common/BackButton';
import { SceneGrid } from '../components/scenes/SceneGrid';
import { generateSceneImage, Scene, deleteScene, restoreScene } from '../services/scene.service';
import CharacterCard from '../components/characters/CharacterCard';
import { Character, deleteCharacter, generateCharacterReferenceImage } from '../services/character.service';
import { ConfirmModal } from '../components/common/ConfirmModal';
import '../components/story/story-detail.css';
import '../components/scenes/scenes.css';

type Tab = 'overview' | 'characters' | 'scenes' | 'production';

export default function StoryDetailPage() {
  const { storyId } = useParams<{ storyId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [story, setStory] = useState<StorybookStory | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [generatingScenes, setGeneratingScenes] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [deleteCharacterConfirm, setDeleteCharacterConfirm] = useState<{ id: string; name: string } | null>(null);
  const [showDeletedScenes, setShowDeletedScenes] = useState(false);
  
  const activeTab = (searchParams.get('tab') as Tab) || 'overview';
  
  const setActiveTab = (tab: Tab) => {
    setSearchParams({ tab });
  };

  useEffect(() => {
    if (storyId) {
      loadStory();
    }
  }, [storyId, showDeletedScenes]);

  async function loadStory() {
    try {
      setLoading(true);
      const data = await fetchStory(storyId!, showDeletedScenes);
      setStory(data);
    } catch (error) {
      console.error('Failed to load story:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateScenes() {
    if (!story) return;

    setGeneratingScenes(true);
    setApiError(null);

    try {
      const generatedScenes = await generateScenes(
        story.storyId,
        {
          title: story.title,
          logline: story.logline,
          lesson: story.lesson,
        },
        story.characters || [],
      );

      // Reload story to get updated scenes
      await loadStory();
    } catch (error) {
      console.error(error);
      setApiError('Failed to generate scenes. Please try again.');
    } finally {
      setGeneratingScenes(false);
    }
  }

  function handleEditStory() {
    setIsEditing(true);
  }

  function handleCancelEdit() {
    setIsEditing(false);
  }

  async function handleSaveStory(data: {
    topic: string;
    audience: string;
    genre: string;
    visualStyle: string;
    lesson: string;
    characterIds: string[];
  }) {
    if (!story) return;

    try {
      setApiError(null);
      const API_URL = getApiUrl();
      const response = await fetch(`${API_URL}/api/content/story/${story!.storyId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic: data.topic,
          audience: data.audience,
          genre: data.genre,
          visualStyle: data.visualStyle,
          lesson: data.lesson,
          characterIds: data.characterIds,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to regenerate story');
      }

      setIsEditing(false);
      await loadStory();
    } catch (error) {
      console.error('Failed to regenerate story:', error);
      setApiError('Failed to regenerate story. Please try again.');
    }
  }


  async function handleGenerateImage(scene: Scene) {
    if (!story) return;

    setGeneratingImage(true);
    setApiError(null);

    try {
      const image = await generateSceneImage(
        scene.sceneId,
        story.storyId,
        story.characters || []
      );
      
      // Reload story to get updated scene data
      await loadStory();
    } catch (error) {
      console.error('Failed to generate image:', error);
      setApiError('Failed to generate image. Please try again.');
    } finally {
      setGeneratingImage(false);
    }
  }

  function handleSceneClick(scene: Scene) {
    navigate(`/stories/${story!.storyId}/scenes/${scene.sceneId}`);
  }

  async function handleDeleteCharacter(id: string, name: string) {
    try {
      setApiError(null);
      await deleteCharacter(id);
      setDeleteCharacterConfirm(null);
      loadStory();
    } catch (error) {
      console.error('Failed to delete character:', error);
      setApiError('Failed to delete character. Please try again.');
    }
  }

  async function handleRestoreScene(sceneId: string) {
    try {
      setApiError(null);
      await restoreScene(sceneId);
      loadStory();
    } catch (error) {
      console.error('Failed to restore scene:', error);
      setApiError('Failed to restore scene. Please try again.');
    }
  }

  async function handleDeleteScene(sceneId: string) {
    try {
      setApiError(null);
      await deleteScene(sceneId);
      loadStory();
    } catch (error) {
      console.error('Failed to delete scene:', error);
      setApiError('Failed to delete scene. Please try again.');
    }
  }

  async function handleGenerateCharacterReference(characterId: string) {
    try {
      setApiError(null);
      await generateCharacterReferenceImage(characterId);
      loadStory();
    } catch (error) {
      console.error('Failed to generate character reference image:', error);
      setApiError('Failed to generate character reference image. Please try again.');
    }
  }

  if (loading) {
    return <div className="page">Loading story...</div>;
  }

  if (!story) {
    return <div className="page">Story not found</div>;
  }

  return (
    <div className="page">
      <PageHeader
        title={story?.title || 'Story Details'}
        subtitle={story?.logline}
        actions={
          <div className="page-actions">
            <BackButton to="/stories" label="← Back to Stories" />
          </div>
        }
      />

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab ${activeTab === 'characters' ? 'active' : ''}`}
          onClick={() => setActiveTab('characters')}
        >
          Characters
        </button>
        <button
          className={`tab ${activeTab === 'scenes' ? 'active' : ''}`}
          onClick={() => setActiveTab('scenes')}
        >
          Scenes
        </button>
        <button
          className={`tab ${activeTab === 'production' ? 'active' : ''}`}
          onClick={() => setActiveTab('production')}
        >
          Production
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'overview' && (
          isEditing ? (
            <StoryEditForm
              story={story}
              characters={story.characters || []}
              onSave={handleSaveStory}
              onCancel={handleCancelEdit}
            />
          ) : (
            <StoryOverview
              story={story}
              onEdit={handleEditStory}
            />
          )
        )}

        {activeTab === 'characters' && (
          <div className="characters-tab">
            {story.characters && story.characters.length > 0 ? (
              <div className="character-grid">
                {story.characters.map((character) => (
                  <CharacterCard
                    key={character.id}
                    character={{
                      id: character.id,
                      name: character.name,
                      species: character.species,
                      personality: character.personality,
                      visualDescription: character.description,
                      distinctiveFeatures: '',
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      referenceImageUrl: character.referenceImageUrl || undefined,
                      canonicalAppearance: character.canonicalAppearance || undefined,
                    }}
                    onEdit={() => navigate('/characters')}
                    onDelete={() => handleDeleteCharacter(character.id, character.name)}
                    onGenerateReference={() => handleGenerateCharacterReference(character.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="characters-empty">
                <p className="muted">No characters in this story.</p>
                <button className="btn btn-primary" onClick={() => navigate('/characters')}>
                  Add Characters
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'scenes' && (
          <div className="scenes-tab">
            <div className="scenes-toolbar">
              <label className="scenes-filter-toggle">
                <input
                  type="checkbox"
                  checked={showDeletedScenes}
                  onChange={(e) => setShowDeletedScenes(e.target.checked)}
                />
                Show deleted scenes
              </label>
            </div>
            {story.scenes && story.scenes.length > 0 ? (
              <SceneGrid
                scenes={story.scenes.filter(scene => 
                  showDeletedScenes ? true : !scene.deletedAt
                )}
                storyId={story.storyId}
                characters={story.characters || []}
                onSceneClick={handleSceneClick}
                onGenerateImage={handleGenerateImage}
                generatingImage={generatingImage}
                onRestoreScene={showDeletedScenes ? handleRestoreScene : undefined}
                onDeleteScene={handleDeleteScene}
              />
            ) : (
              <div className="scenes-empty">
                <p className="muted">No scenes generated yet.</p>
                <button className="primary" onClick={handleGenerateScenes} disabled={generatingScenes}>
                  {generatingScenes ? 'Generating...' : 'Generate Scenes'}
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'production' && (
          <div className="production-tab">
            <h2>Production</h2>
            <p className="muted">Production features coming soon.</p>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={deleteCharacterConfirm !== null}
        title="Delete Character"
        message={`Are you sure you want to delete "${deleteCharacterConfirm?.name}" from this story? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={() => deleteCharacterConfirm && handleDeleteCharacter(deleteCharacterConfirm.id, deleteCharacterConfirm.name)}
        onCancel={() => setDeleteCharacterConfirm(null)}
      />
    </div>
  );
}
