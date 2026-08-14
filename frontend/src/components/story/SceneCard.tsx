import { useEffect, useState } from 'react';
import { Scene } from '../../types/story';
import { getApiUrl } from '../../utils/urlHelper';

interface SceneCardProps {
  scene: Scene;
  storyId?: string;
  characters?: Array<{
    name: string;
    species: string;
    personality: string;
    description: string;
  }>;
}

export default function SceneCard({ scene, storyId, characters }: SceneCardProps) {
  const [generating, setGenerating] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sceneId = `scene-${scene.sceneNumber}`;

    async function loadSavedImage() {
      try {
        const response = await fetch(`${getApiUrl()}/api/content/scenes/${sceneId}/image`);
        if (!response.ok) return;

        const data = await response.json();
        if (!cancelled && data.success && data.image?.url) {
          setImageUrl(data.image.url);
        }
      } catch (loadError) {
        // A missing prior image is normal, so keep the empty preview without
        // displaying an error to the user.
        console.info(`No saved image found for ${sceneId}`, loadError);
      }
    }

    void loadSavedImage();
    return () => {
      cancelled = true;
    };
  }, [scene.sceneNumber]);

  const handleGenerateImage = async () => {
    setGenerating(true);
    setError(null);

    try {
      const API_URL = getApiUrl();
      const sceneId = `scene-${scene.sceneNumber}`;
      const response = await fetch(
        `${API_URL}/api/content/scenes/${sceneId}/image`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            description: scene.description,
            title: scene.description.split('.')[0] || `Scene ${scene.sceneNumber}`,
            characters: characters || [],
            storyId: storyId || 'default-story',
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to generate image');
      }

      const data = await response.json();
      if (data.success && data.image) {
        setImageUrl(data.image.url);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err) {
      console.error('Failed to generate image:', err);
      setError('Failed to generate image. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <article className="story-scene-card">
      <div className="story-scene-number" aria-label={`Scene ${scene.sceneNumber}`}>
        {scene.sceneNumber}
      </div>
      {imageUrl ? (
        <div className="story-scene-image-wrap">
          <img
            className="story-scene-image"
            src={`${getApiUrl()}${imageUrl}`}
            alt={`Illustration for scene ${scene.sceneNumber}`}
          />
        </div>
      ) : (
        <div className="story-scene-image-placeholder" aria-hidden="true">
          <span>✦</span>
          <small>Scene preview</small>
        </div>
      )}
      <div className="story-scene-content">
        <span className="story-scene-label">Scene {String(scene.sceneNumber).padStart(2, '0')}</span>
        <h3>{scene.description.split('.')[0] || `Scene ${scene.sceneNumber}`}</h3>
        <p className="story-scene-description">{scene.description}</p>
        <p className="story-scene-narration">{scene.narration}</p>
        {error && <p className="story-scene-error">{error}</p>}
        <button
          className="scene-image-action"
          onClick={handleGenerateImage}
          disabled={generating}
        >
          {generating ? 'Creating image…' : imageUrl ? '↻ Regenerate image' : '✦ Generate image'}
        </button>
      </div>
    </article>
  );
}
