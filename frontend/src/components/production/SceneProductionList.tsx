import { ProductionScene } from '../../types/production';
import SceneProductionCard from './SceneProductionCard';

type TrackType = 'image' | 'voice' | 'animation' | 'video';

interface SceneProductionListProps {
  scenes: ProductionScene[];
  onGenerateTrack: (sceneId: string, trackType: TrackType) => void;
}

export default function SceneProductionList({ scenes, onGenerateTrack }: SceneProductionListProps) {
  return (
    <div className="scene-production-list">
      {scenes.map((scene) => (
        <SceneProductionCard 
          key={scene.sceneId} 
          scene={scene} 
          onGenerateTrack={onGenerateTrack}
        />
      ))}
    </div>
  );
}
