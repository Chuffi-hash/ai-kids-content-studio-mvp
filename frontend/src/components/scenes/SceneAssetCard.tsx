import React from 'react';
import { resolveAssetUrl } from '../../utils/urlHelper';
import { ImageIcon, MicIcon, FilmIcon, VideoIcon } from '../common/Icons';

export type AssetType = 'image' | 'voice' | 'animation' | 'video';

export interface AssetStatus {
  status: 'completed' | 'generating' | 'pending' | 'failed';
  url?: string;
  metadata?: Record<string, any>;
}

interface SceneAssetCardProps {
  type: AssetType;
  asset: AssetStatus | null;
  onGenerate?: () => void;
  onRegenerate?: () => void;
  disabled?: boolean;
}

const assetLabels: Record<AssetType, string> = {
  image: 'Image',
  voice: 'Voice',
  animation: 'Animation',
  video: 'Video',
};

function renderAssetIcon(type: AssetType, size = 18) {
  switch (type) {
    case 'image':
      return <ImageIcon size={size} />;
    case 'voice':
      return <MicIcon size={size} />;
    case 'animation':
      return <FilmIcon size={size} />;
    case 'video':
      return <VideoIcon size={size} />;
    default:
      return <FilmIcon size={size} />;
  }
}

export function SceneAssetCard({ type, asset, onGenerate, onRegenerate, disabled }: SceneAssetCardProps) {
  const label = assetLabels[type];
  
  const getStatusBadge = () => {
    if (!asset) return <span className="asset-status-badge pending">Pending</span>;
    
    switch (asset.status) {
      case 'completed':
        return <span className="asset-status-badge completed">Ready</span>;
      case 'generating':
        return <span className="asset-status-badge generating">Generating...</span>;
      case 'failed':
        return <span className="asset-status-badge failed">Failed</span>;
      case 'pending':
        return <span className="asset-status-badge pending">Pending</span>;
      default:
        return null;
    }
  };

  const getPreview = () => {
    if (!asset || asset.status !== 'completed' || !asset.url) {
      return (
        <div className="asset-placeholder">
          <span className="asset-placeholder-icon">{renderAssetIcon(type, 28)}</span>
          <span className="asset-placeholder-text">No {label.toLowerCase()} yet</span>
        </div>
      );
    }

    if (type === 'image') {
      return (
        <img
          src={resolveAssetUrl(asset.url)}
          alt={label}
          className="asset-preview-image"
        />
      );
    }

    return (
      <div className="asset-preview-placeholder">
        <span className="asset-preview-icon">{renderAssetIcon(type, 28)}</span>
        <span className="asset-preview-text">{label} ready</span>
      </div>
    );
  };

  return (
    <div className="scene-asset-card">
      <div className="asset-card-header">
        <div className="asset-card-title">
          <span className="asset-icon">{renderAssetIcon(type, 16)}</span>
          <span>{label}</span>
        </div>
        {getStatusBadge()}
      </div>

      <div className="asset-card-preview">
        {getPreview()}
      </div>

      <div className="asset-card-actions">
        {asset?.status === 'completed' && onRegenerate && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onRegenerate}
            disabled={disabled}
          >
            Regenerate
          </button>
        )}
        {(!asset || asset.status !== 'completed') && onGenerate && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onGenerate}
            disabled={disabled || asset?.status === 'generating'}
          >
            {asset?.status === 'generating' ? 'Generating...' : `Generate ${label}`}
          </button>
        )}
      </div>
    </div>
  );
}
