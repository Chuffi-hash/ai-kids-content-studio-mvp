import { Scene } from '../../services/scene.service';
import { SceneCard } from './SceneCard';

interface SceneGridProps {
  scenes: Scene[];
  storyId: string;
  characters: Array<{ name: string; species: string; personality: string; description: string }>;
  onSceneClick: (scene: Scene) => void;
  onGenerateImage: (scene: Scene) => void;
  generatingImage?: boolean;
  onRestoreScene?: (sceneId: string) => void;
  onDeleteScene?: (sceneId: string) => void;
}

export function SceneGrid({ 
  scenes, 
  storyId, 
  characters, 
  onSceneClick, 
  onGenerateImage,
  generatingImage,
  onRestoreScene,
  onDeleteScene
}: SceneGridProps) {
  if (scenes.length === 0) {
    return (
      <div className="scenes-empty">
        <p className="muted">No scenes generated yet.</p>
      </div>
    );
  }

  return (
    <div className="scene-grid">
      {scenes.map((scene) => (
        <SceneCard
          key={scene.id}
          scene={scene}
          storyId={storyId}
          characters={characters}
          onClick={() => onSceneClick(scene)}
          onGenerateImage={() => onGenerateImage(scene)}
          generatingImage={generatingImage}
          onRestoreScene={scene.deletedAt && onRestoreScene ? () => onRestoreScene(scene.sceneId) : undefined}
          onDeleteScene={!scene.deletedAt && onDeleteScene ? () => onDeleteScene(scene.sceneId) : undefined}
        />
      ))}
    </div>
  );
}
