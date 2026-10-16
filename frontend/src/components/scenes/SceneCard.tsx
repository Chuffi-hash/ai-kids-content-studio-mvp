import { Scene } from '../../services/scene.service';
import { SceneStatus } from './SceneStatus';
import { SceneActions } from  './SceneActions';
import { resolveAssetUrl } from '../../utils/urlHelper';
import { ImageIcon } from '../common/Icons';

interface SceneCardProps {
  scene: Scene;
  storyId: string;
  characters: Array<{ name: string; species: string; personality: string; description: string }>;
  onClick: () => void;
  onGenerateImage: () => void;
  generatingImage?: boolean;
  onRestoreScene?: () => void;
  onDeleteScene?: () => void;
}

export function SceneCard({ scene, storyId, characters, onClick, onGenerateImage, generatingImage, onRestoreScene, onDeleteScene }: SceneCardProps) {
  const truncateNarration = (text: string, maxLength: number = 100) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className={`scene-card ${scene.deletedAt ? 'scene-card-deleted' : ''}`} onClick={scene.deletedAt ? undefined : onClick}>
      <div className="scene-card-header">
        <div className="scene-number-badge">Scene {scene.number}</div>
        <SceneStatus image={scene.image} />
      </div>

      <div className="scene-card-body">
        {scene.image && scene.image.status === 'completed' ? (
          <div className="scene-card-image">
            <img
              src={resolveAssetUrl(scene.image.imageUrl)}
              alt={`Scene ${scene.number}`}
              className="scene-thumbnail"
            />
          </div>
        ) : (
          <div className="scene-card-image scene-image-placeholder">
            <div className="placeholder-icon">
              <ImageIcon size={24} color="#64748b" />
            </div>
            <div className="placeholder-text">No image generated</div>
          </div>
        )}
        
        <div className="scene-card-content">
          <h3 className="scene-card-title">{scene.title}</h3>
          <p className="scene-card-narration">{truncateNarration(scene.narration)}</p>
        </div>
      </div>

      <div className="scene-card-footer">
        {onRestoreScene ? (
          <button
            className="btn btn-sm btn-secondary"
            onClick={(e) => {
              e.stopPropagation();
              onRestoreScene();
            }}
          >
            Restore
          </button>
        ) : (
          <>
            <SceneActions
              image={scene.image}
              onGenerateImage={(e: React.MouseEvent) => {
                e.stopPropagation();
                onGenerateImage();
              }}
              disabled={generatingImage}
            />
            {onDeleteScene && (
              <button
                className="btn btn-sm btn-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteScene();
                }}
              >
                Delete
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
