import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchStory, StorybookStory } from '../services/storybook.service';
import { StoryOverview } from '../components/story/StoryOverview';
import { StoryEditForm } from '../components/story/StoryEditForm';
import { generateScenes } from '../services/content.service';
import { getApiUrl } from '../utils/urlHelper';
import { PageHeader } from '../components/common/PageHeader';
import { BackButton } from '../components/common/BackButton';
import { SceneGrid } from '../components/scenes/SceneGrid';
import { generateSceneImage, Scene } from '../services/scene.service';
import '../components/story/story-detail.css';
import '../components/scenes/scenes.css';

type Tab = 'overview' | 'characters' | 'scenes' | 'production';

export default function StoryDetailPage() {
  const { storyId } = useParams<{ storyId: string }>();
  const navigate = useNavigate();
  const [story, setStory] = useState<StorybookStory | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [generatingScenes, setGeneratingScenes] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (storyId) {
      loadStory();
    }
  }, [storyId]);

  async function loadStory() {
    try {
      setLoading(true);
      const data = await fetchStory(storyId!);
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

  function handleOpenStorybook() {
    if (story) {
      navigate(`/story/${story.storyId}/read`);
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
            <button className="secondary" onClick={handleOpenStorybook}>
              Read Story
            </button>
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
            <h2>Characters</h2>
            {story.characters && story.characters.length > 0 ? (
              <div className="character-list">
                {story.characters.map((character) => (
                  <div key={character.id} className="character-item">
                    <h3>{character.name}</h3>
                    <p className="muted">{character.species} · {character.personality}</p>
                    <p>{character.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No characters in this story.</p>
            )}
          </div>
        )}

        {activeTab === 'scenes' && (
          <div className="scenes-tab">
            {story.scenes && story.scenes.length > 0 ? (
              <SceneGrid
                scenes={story.scenes}
                storyId={story.storyId}
                characters={story.characters || []}
                onSceneClick={handleSceneClick}
                onGenerateImage={handleGenerateImage}
                generatingImage={generatingImage}
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
    </div>
  );
}
