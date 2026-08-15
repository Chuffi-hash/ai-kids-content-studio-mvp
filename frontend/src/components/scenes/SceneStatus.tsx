import { SceneImage } from '../../services/scene.service';

interface SceneStatusProps {
  image: SceneImage | null;
}

export function SceneStatus({ image }: SceneStatusProps) {
  if (!image) {
    return <span className="scene-status scene-status-pending">No Image</span>;
  }

  switch (image.status) {
    case 'completed':
      return <span className="scene-status scene-status-completed">Ready</span>;
    case 'generating':
      return <span className="scene-status scene-status-generating">Generating</span>;
    case 'pending':
      return <span className="scene-status scene-status-pending">Pending</span>;
    case 'failed':
      return <span className="scene-status scene-status-failed">Failed</span>;
    default:
      return <span className="scene-status scene-status-pending">Unknown</span>;
  }
}
