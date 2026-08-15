import { SceneImage } from '../../services/scene.service';

interface SceneActionsProps {
  image: SceneImage | null;
  onGenerateImage: (e: React.MouseEvent) => void;
  disabled?: boolean;
}

export function SceneActions({ image, onGenerateImage, disabled }: SceneActionsProps) {
  return (
    <button
      className="scene-action-button"
      onClick={onGenerateImage}
      disabled={disabled}
    >
      {image ? 'Regenerate Image' : 'Generate Image'}
    </button>
  );
}
