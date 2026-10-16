import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchStory, StorybookStory, StorybookScene } from '../services/storybook.service';
import { generateSceneImage, updateScene, deleteScene } from '../services/scene.service';
import { PageHeader } from '../components/common/PageHeader';
import { BackButton } from '../components/common/BackButton';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { CloseIcon } from '../components/common/Icons';
import { SceneAssetCard, AssetStatus } from '../components/scenes/SceneAssetCard';
import SceneModal from '../components/scenes/SceneModal';
import '../components/scenes/scenes.css';

export default function SceneDetailPage() {
  const { storyId, sceneId } = useParams<{ storyId: string; sceneId: string }>();
  const navigate = useNavigate();
  const [story, setStory] = useState<StorybookStory | null>(null);
  const [scene, setScene] = useState<StorybookScene | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

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
      
      const foundScene = data.scenes.find(s => s.sceneId === sceneId);
      setScene(foundScene || null);
    } catch (error) {
      console.error('Failed to load story:', error);
      setApiError('Failed to load story. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateImage() {
    if (!scene || !story) return;

    setGeneratingImage(true);
    setApiError(null);

    try {
      const image = await generateSceneImage(
        scene.sceneId,
        story.storyId,
        story.characters || []
      );
      
      // Reload story to get updated scene data
      const data = await fetchStory(storyId!);
      setStory(data);
      const foundScene = data.scenes.find(s => s.sceneId === sceneId);
      setScene(foundScene || null);
    } catch (error) {
      console.error('Failed to generate image:', error);
      setApiError('Failed to generate image. Please try again.');
    } finally {
      setGeneratingImage(false);
    }
  }

  function handleEditScene() {
    setIsEditing(true);
  }

  async function handleUpdateScene(data: {
    title?: string;
    narration?: string;
    number?: number;
  }) {
    if (!scene) return;

    try {
      setApiError(null);
      await updateScene(scene.sceneId, data);
      setIsEditing(false);
      
      // Reload story to get updated scene data
      const updatedStory = await fetchStory(storyId!);
      setStory(updatedStory);
      const foundScene = updatedStory.scenes.find(s => s.sceneId === sceneId);
      setScene(foundScene || null);
    } catch (error) {
      console.error('Failed to update scene:', error);
      setApiError('Failed to update scene. Please try again.');
    }
  }

  function handleDeleteScene() {
    setDeleteConfirm(true);
  }

  async function confirmDeleteScene() {
    if (!scene) return;

    try {
      setApiError(null);
      await deleteScene(scene.sceneId);
      setDeleteConfirm(false);
      navigate(`/stories/${storyId}`);
    } catch (error) {
      console.error('Failed to delete scene:', error);
      setApiError('Failed to delete scene. Please try again.');
    }
  }

  if (loading) {
    return <div className="page">Loading scene...</div>;
  }

  if (!story || !scene) {
    return <div className="page">Scene not found</div>;
  }

  return (
    <div className="page">
      <PageHeader
        title={`${story.title} - Scene ${scene.number}`}
        subtitle={story.logline}
        actions={
          <div className="page-actions">
            <BackButton to={`/stories/${story.storyId}?tab=scenes`} label="Back to Scenes" />
            <button className="btn btn-secondary btn-sm" onClick={handleEditScene}>
              Edit Scene
            </button>
            <button className="btn btn-danger btn-sm" onClick={handleDeleteScene}>
              Delete Scene
            </button>
          </div>
        }
      />

      {apiError && (
        <div className="api-error">
          <span>{apiError}</span>
          <button onClick={() => setApiError(null)} className="error-close" aria-label="Dismiss error">
            <CloseIcon size={12} />
          </button>
        </div>
      )}

      <div className="scene-detail">
        <div className="scene-detail-section">
          <h2>Scene Description</h2>
          <p className="scene-description">{scene.title}</p>
        </div>

        <div className="scene-detail-section">
          <h2>Narration</h2>
          <p className="scene-narration-full">{scene.narration}</p>
        </div>

        <div className="scene-detail-section">
          <h2>Production Assets</h2>
          <div className="scene-assets-grid">
            <SceneAssetCard
              type="image"
              asset={scene.image ? {
                status: scene.image.status as any,
                url: scene.image.imageUrl,
              } : null}
              onGenerate={handleGenerateImage}
              onRegenerate={handleGenerateImage}
              disabled={generatingImage}
            />
            <SceneAssetCard
              type="voice"
              asset={null}
            />
            <SceneAssetCard
              type="animation"
              asset={null}
            />
            <SceneAssetCard
              type="video"
              asset={null}
            />
          </div>
        </div>
      </div>

      <SceneModal
        isOpen={isEditing}
        scene={scene ? {
          id: scene.id,
          sceneId: scene.sceneId,
          storyId: scene.storyId,
          title: scene.title,
          number: scene.number,
          narration: scene.narration,
          image: null,
        } : null}
        onSubmit={handleUpdateScene}
        onCancel={() => setIsEditing(false)}
      />

      <ConfirmModal
        isOpen={deleteConfirm}
        title="Delete Scene"
        message={`Are you sure you want to delete Scene ${scene?.number}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDeleteScene}
        onCancel={() => setDeleteConfirm(false)}
      />
    </div>
  );
}
