import { Scene } from '../../services/scene.service';
import SceneForm from './SceneForm';

interface SceneModalProps {
  isOpen: boolean;
  scene?: Scene | null;
  onSubmit: (data: {
    title?: string;
    narration?: string;
    number?: number;
  }) => void;
  onCancel: () => void;
}

export default function SceneModal({ isOpen, scene, onSubmit, onCancel }: SceneModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <SceneForm
          scene={scene}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}
