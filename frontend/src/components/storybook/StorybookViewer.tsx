import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { fetchStory, StorybookStory, StorybookScene } from '../../services/storybook.service';
import { resolveAssetUrl } from '../../utils/urlHelper';
import './storybook-viewer.css';

interface StorybookViewerProps {
  storyId?: string;
}

type LoadingState = 'loading' | 'loaded' | 'error' | 'not-found' | 'empty';

export default function StorybookViewer({ storyId: propStoryId }: StorybookViewerProps) {
  const { storyId: paramStoryId } = useParams<{ storyId: string }>();
  const storyId = propStoryId || paramStoryId || '';
  const [story, setStory] = useState<StorybookStory | null>(null);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [loadingState, setLoadingState] = useState<LoadingState>('loading');
  const [imageError, setImageError] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (storyId) {
      loadStory();
    }
  }, [storyId]);

  const loadStory = async () => {
    setLoadingState('loading');
    try {
      const data = await fetchStory(storyId);
      
      if (!data) {
        setLoadingState('not-found');
        return;
      }

      if (!data.scenes || data.scenes.length === 0) {
        setLoadingState('empty');
        setStory(data);
        return;
      }

      setStory(data);
      setLoadingState('loaded');
    } catch (error) {
      console.error('Failed to load story:', error);
      setLoadingState('error');
    }
  };

  const handlePrevious = useCallback(() => {
    if (currentSceneIndex > 0) {
      setCurrentSceneIndex(currentSceneIndex - 1);
    }
  }, [currentSceneIndex]);

  const handleNext = useCallback(() => {
    if (story && currentSceneIndex < story.scenes.length - 1) {
      setCurrentSceneIndex(currentSceneIndex + 1);
    }
  }, [story, currentSceneIndex]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      handlePrevious();
    } else if (e.key === 'ArrowRight') {
      handleNext();
    }
  }, [handlePrevious, handleNext]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleImageError = (sceneId: string) => {
    setImageError(prev => ({ ...prev, [sceneId]: true }));
  };

  if (loadingState === 'loading') {
    return (
      <div className="storybook-viewer">
        <div className="storybook-loading">
          <div className="spinner"></div>
          <p>Loading story...</p>
        </div>
      </div>
    );
  }

  if (loadingState === 'error') {
    return (
      <div className="storybook-viewer">
        <div className="storybook-error">
          <h2>Unable to Load Story</h2>
          <p>There was an error loading this story. Please try again later.</p>
          <button className="primary" onClick={loadStory}>Retry</button>
        </div>
      </div>
    );
  }

  if (loadingState === 'not-found') {
    return (
      <div className="storybook-viewer">
        <div className="storybook-error">
          <h2>Story Not Found</h2>
          <p>This story could not be found. It may have been deleted or the ID is incorrect.</p>
        </div>
      </div>
    );
  }

  if (loadingState === 'empty' || !story || story.scenes.length === 0) {
    return (
      <div className="storybook-viewer">
        <div className="storybook-empty">
          <h2>No Scenes Available</h2>
          <p>This story doesn't have any scenes yet.</p>
        </div>
      </div>
    );
  }

  const currentScene = story.scenes[currentSceneIndex];
  const isFirstScene = currentSceneIndex === 0;
  const isLastScene = currentSceneIndex === story.scenes.length - 1;

  const renderImageState = () => {
    const image = currentScene.image;

    if (!image) {
      return (
        <div className="image-placeholder">
          <span className="placeholder-icon">🖼️</span>
          <p>No image available</p>
        </div>
      );
    }

    if (image.status === 'failed') {
      return (
        <div className="image-error">
          <span className="error-icon">⚠️</span>
          <p>Image generation failed</p>
        </div>
      );
    }

    if (image.status === 'generating' || image.status === 'pending') {
      return (
        <div className="image-loading">
          <div className="spinner"></div>
          <p>Generating image...</p>
        </div>
      );
    }

    if (imageError[currentScene.sceneId]) {
      return (
        <div className="image-error">
          <span className="error-icon">⚠️</span>
          <p>Failed to load image</p>
        </div>
      );
    }

    const imageUrl = resolveAssetUrl(image.imageUrl);

    return (
      <img
        src={imageUrl}
        alt={`Scene ${currentScene.number}: ${currentScene.title}`}
        className="scene-image"
        onError={() => handleImageError(currentScene.sceneId)}
      />
    );
  };

  return (
    <div className="storybook-viewer">
      <div className="storybook-container">
        <header className="storybook-header">
          <h1 className="storybook-title">{story.title}</h1>
          <div className="scene-counter">
            Scene {currentScene.number} of {story.scenes.length}
          </div>
        </header>

        <div className="scene-display">
          <div className="scene-image-container">
            {renderImageState()}
          </div>

          <div className="scene-narration">
            {currentScene.narration || currentScene.title}
          </div>
        </div>

        <div className="scene-navigation">
          <button
            className="nav-button"
            onClick={handlePrevious}
            disabled={isFirstScene}
            aria-label="Previous scene"
          >
            ← Previous
          </button>

          <div className="progress-indicator">
            {story.scenes.map((_, index) => (
              <div
                key={index}
                className={`progress-dot ${index === currentSceneIndex ? 'active' : ''}`}
                aria-label={`Scene ${index + 1}`}
              />
            ))}
          </div>

          <button
            className="nav-button"
            onClick={handleNext}
            disabled={isLastScene}
            aria-label="Next scene"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
