import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchStory, StorybookStory, StorybookScene } from '../services/storybook.service';
import { generateSceneImage, Scene } from '../services/scene.service';
import { PageHeader } from '../components/common/PageHeader';
import { BackButton } from '../components/common/BackButton';
import '../components/scenes/scenes.css';

export default function SceneDetailPage() {
  const { storyId, sceneId } = useParams<{ storyId: string; sceneId: string }>();
  const navigate = useNavigate();
  const [story, setStory] = useState<StorybookStory | null>(null);
  const [scene, setScene] = useState<StorybookScene | null>(null);
  const [loading, setLoading] = useState(true);
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
      
      // Update scene with new image
      setScene({
        ...scene,
        image: {
          id: image.id,
          sceneId: image.sceneId,
          provider: image.provider,
          model: image.model,
          prompt: image.prompt,
          storageKey: image.storageKey,
          imageUrl: image.imageUrl,
          width: image.width,
          height: image.height,
          status: image.status,
        },
      });
    } catch (error) {
      console.error('Failed to generate image:', error);
      setApiError('Failed to generate image. Please try again.');
    } finally {
      setGeneratingImage(false);
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
            <BackButton to={`/stories/${story.storyId}`} label="← Back to Story" />
          </div>
        }
      />

      {apiError && (
        <div className="api-error">
          {apiError}
          <button onClick={() => setApiError(null)} className="error-close">✕</button>
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
          <h2>Image</h2>
          <div className="scene-image-section">
            {scene.image && scene.image.status === 'completed' ? (
              <div className="scene-image-display">
                <img
                  src={scene.image.imageUrl}
                  alt={`Scene ${scene.number}`}
                  className="scene-full-image"
                />
              </div>
            ) : (
              <div className="scene-image-placeholder">
                <span className="placeholder-icon">🖼️</span>
                <p>No image generated yet</p>
              </div>
            )}

            <button
              className="primary"
              onClick={handleGenerateImage}
              disabled={generatingImage}
            >
              {generatingImage ? 'Generating...' : (scene.image ? 'Regenerate Image' : 'Generate Image')}
            </button>
          </div>
        </div>

        <div className="scene-detail-section">
          <h2>Voice</h2>
          <p className="muted">Voice generation coming soon.</p>
        </div>

        <div className="scene-detail-section">
          <h2>Animation</h2>
          <p className="muted">Animation features coming soon.</p>
        </div>

        <div className="scene-detail-section">
          <h2>Video</h2>
          <p className="muted">Video generation coming soon.</p>
        </div>
      </div>
    </div>
  );
}
