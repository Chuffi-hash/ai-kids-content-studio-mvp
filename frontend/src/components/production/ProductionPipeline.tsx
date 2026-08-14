import { useState } from 'react';
import { ProductionState, ProductionScene } from '../../types/production';
import PipelineProgress from './PipelineProgress';
import SceneProductionList from './SceneProductionList';
import { generateSceneImage } from '../../services/production.service';
import './production-pipeline.css';

interface ProductionPipelineProps {
  productionState: ProductionState;
  onProductionStateChange: (newState: ProductionState) => void;
}

type TrackType = 'image' | 'voice' | 'animation' | 'video';

export default function ProductionPipeline({ productionState, onProductionStateChange }: ProductionPipelineProps) {
  const handleGenerateTrack = async (sceneId: string, trackType: TrackType) => {
    const scene = productionState.scenes.find(s => s.sceneId === sceneId);
    if (!scene) return;

    // Set status to generating (regardless of current status - handles both initial generation and regenerate)
    const updatedScenes = productionState.scenes.map(s => {
      if (s.sceneId === sceneId) {
        return {
          ...s,
          [trackType]: { ...s[trackType], status: 'generating' as const }
        };
      }
      return s;
    });

    onProductionStateChange({
      ...productionState,
      scenes: updatedScenes
    });

    try {
      let url = undefined;

      // Use real API for image generation
      if (trackType === 'image') {
        const result = await generateSceneImage(
          sceneId,
          scene.sceneNumber,
          scene.description,
          scene.title,
          scene.narration,
          productionState.storyId,
          productionState.storyTitle,
          productionState.storyLogline,
          productionState.storyLesson
        );
        url = result.imageUrl;
      } else {
        // Mock for other tracks (voice, animation, video)
        await new Promise(resolve => setTimeout(resolve, 2000));
        const success = Math.random() > 0.2;
        if (success) {
          url = `mock-url-${trackType}-${sceneId}`;
        } else {
          throw new Error('Mock generation failed');
        }
      }

      // Set status to completed with URL (replaces previous URL on regenerate)
      const finalScenes = productionState.scenes.map(s => {
        if (s.sceneId === sceneId) {
          return {
            ...s,
            [trackType]: {
              ...s[trackType],
              status: 'completed' as const,
              url
            }
          };
        }
        return s;
      });

      onProductionStateChange({
        ...productionState,
        scenes: finalScenes
      });
    } catch (error) {
      console.error(`Failed to generate ${trackType} for scene ${sceneId}:`, error);

      // Set status to failed (only if API request failed, not due to image loading issues)
      const failedScenes = productionState.scenes.map(s => {
        if (s.sceneId === sceneId) {
          return {
            ...s,
            [trackType]: {
              ...s[trackType],
              status: 'failed' as const
            }
          };
        }
        return s;
      });

      onProductionStateChange({
        ...productionState,
        scenes: failedScenes
      });
    }
  };

  return (
    <div className="production-pipeline">
      <div className="pipeline-header">
        <div>
          <p className="eyebrow">Production Pipeline</p>
          <h1>{productionState.storyTitle}</h1>
        </div>
      </div>

      <PipelineProgress currentStage={productionState.currentStage} />

      <div className="pipeline-content">
        <div className="section-header">
          <h2>Scene Production</h2>
          <p className="muted">Manage production for each scene</p>
        </div>

        <SceneProductionList 
          scenes={productionState.scenes} 
          onGenerateTrack={handleGenerateTrack}
        />
      </div>
    </div>
  );
}
