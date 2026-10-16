import React from 'react';
import { ProductionScene, ProductionStatus } from '../../types/production';
import { resolveAssetUrl } from '../../utils/urlHelper';
import { CheckIcon, CloseIcon, ImageIcon, MicIcon, ClapperboardIcon, FilmIcon } from '../common/Icons';

type TrackType = 'image' | 'voice' | 'animation' | 'video';

interface SceneProductionCardProps {
  scene: ProductionScene;
  onGenerateTrack: (sceneId: string, trackType: TrackType) => void;
}

function getStatusBadge(status: ProductionStatus) {
  const statusConfig = {
    pending: { label: 'Pending', className: 'status-badge--pending' },
    queued: { label: 'Queued', className: 'status-badge--queued' },
    generating: { label: 'Processing', className: 'status-badge--generating' },
    completed: { label: 'Ready', className: 'status-badge--completed' },
    failed: { label: 'Failed', className: 'status-badge--failed' },
  };

  const config = statusConfig[status];
  return (
    <span className={`status-badge ${config.className}`}>
      {status === 'completed' && <CheckIcon size={12} color="#34d399" />}
      {status === 'generating' && <span className="spinner" />}
      {status === 'pending' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />}
      {status === 'failed' && <CloseIcon size={10} color="#fca5a5" />}
      {config.label}
    </span>
  );
}

function ProductionTrack({ 
  icon, 
  label, 
  status, 
  onGenerate,
  showRegenerate 
}: { 
  icon: React.ReactNode; 
  label: string; 
  status: ProductionStatus;
  onGenerate: () => void;
  showRegenerate?: boolean;
}) {
  return (
    <div className="production-track">
      <span className="production-track-icon">{icon}</span>
      <span className="production-track-label">{label}</span>
      {getStatusBadge(status)}
      {status === 'pending' && (
        <button className="track-action track-action--generate" onClick={onGenerate}>
          Generate
        </button>
      )}
      {status === 'failed' && (
        <button className="track-action track-action--retry" onClick={onGenerate}>
          Retry
        </button>
      )}
      {status === 'completed' && showRegenerate && (
        <button className="track-action track-action--regenerate" onClick={onGenerate}>
          Regenerate
        </button>
      )}
    </div>
  );
}

export default function SceneProductionCard({ scene, onGenerateTrack }: SceneProductionCardProps) {
  const hasDistinctDescription = scene.description.trim().toLowerCase() !== scene.title.trim().toLowerCase();

  const handleImageLoad = (url: string) => {
    console.log(`[SceneImage] Loaded: ${url}`);
  };

  const handleImageError = (url: string) => {
    console.log(`[SceneImage] Failed to load: ${url}`);
  };

  return (
    <div className="scene-production-card">
      <div className="scene-production-header">
        <div className="scene-number">Scene {String(scene.sceneNumber).padStart(2, '0')}</div>
      </div>
      <h3 className="scene-title">{scene.title}</h3>
      <p className="scene-description">
        {hasDistinctDescription ? scene.description : scene.narration || 'No scene details available yet.'}
      </p>
      {hasDistinctDescription && scene.narration && (
        <p className="scene-narration"><span>Narration</span>{scene.narration}</p>
      )}

      {scene.image.status === 'completed' && scene.image.url && (
        <div className="generated-image">
          <img
            src={resolveAssetUrl(scene.image.url)}
            alt={`Scene ${scene.sceneNumber}`}
            onLoad={() => handleImageLoad(resolveAssetUrl(scene.image.url))}
            onError={() => handleImageError(resolveAssetUrl(scene.image.url))}
          />
        </div>
      )}

      <div className="production-tracks">
        <ProductionTrack 
          icon={<ImageIcon size={16} />} 
          label="Image" 
          status={scene.image.status} 
          onGenerate={() => onGenerateTrack(scene.sceneId, 'image')}
          showRegenerate={true}
        />
        <ProductionTrack 
          icon={<MicIcon size={16} />} 
          label="Voice" 
          status={scene.voice.status} 
          onGenerate={() => onGenerateTrack(scene.sceneId, 'voice')}
        />
        <ProductionTrack 
          icon={<ClapperboardIcon size={16} />} 
          label="Animation" 
          status={scene.animation.status} 
          onGenerate={() => onGenerateTrack(scene.sceneId, 'animation')}
        />
        <ProductionTrack 
          icon={<FilmIcon size={16} />} 
          label="Video" 
          status={scene.video.status} 
          onGenerate={() => onGenerateTrack(scene.sceneId, 'video')}
        />
      </div>
    </div>
  );
}
