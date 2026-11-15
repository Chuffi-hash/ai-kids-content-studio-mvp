import React from 'react';
import { Img, staticFile } from 'remotion';
import {
  AspectRatio,
  ChannelBrandingConfig,
} from '../manifest';
import { calculateResolvedBrandingPlacement } from '../sharedCompositionCoordinates';

interface ChannelBrandingOverlayProps {
  branding?: ChannelBrandingConfig;
  format: AspectRatio;
  viewportWidth: number;
  viewportHeight: number;
  currentTimeMs?: number;
}

export const ChannelBrandingOverlay: React.FC<ChannelBrandingOverlayProps> = ({
  branding,
  format,
  viewportWidth,
  viewportHeight,
  currentTimeMs = 0,
}) => {
  if (!branding || !branding.enabled || !branding.logoUrl) {
    return null;
  }

  const placement = calculateResolvedBrandingPlacement({
    branding: branding as any,
    format: format as any,
    containerWidth: viewportWidth,
    containerHeight: viewportHeight,
    currentTimeMs,
  });

  if (!placement.visible) {
    return null;
  }

  const logoSrc = branding.logoUrl.startsWith('data:') || branding.logoUrl.startsWith('http')
    ? branding.logoUrl
    : staticFile(branding.logoUrl);

  return (
    <div
      style={{
        position: 'absolute',
        left: placement.x,
        top: placement.y,
        zIndex: 35, // Layer 6: Above foreground effects (20), below captions (40)
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        opacity: placement.opacity,
        pointerEvents: 'none',
        padding: placement.showBackground ? '6px 12px' : 0,
        backgroundColor: placement.backgroundColor,
        borderRadius: placement.borderRadius,
        backdropFilter: placement.showBackground ? 'blur(6px)' : undefined,
        boxShadow: placement.showShadow ? '0 4px 16px rgba(0,0,0,0.45)' : undefined,
      }}
    >
      <Img
        src={logoSrc}
        style={{
          width: placement.width,
          height: placement.height,
          objectFit: 'contain',
          display: 'block',
        }}
      />

      {(placement.showChannelName || placement.showSocialHandle) && (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {placement.showChannelName && placement.channelName && (
            <span
              style={{
                fontSize: Math.max(11, Math.round(placement.height * 0.3)),
                fontWeight: 800,
                color: '#ffffff',
                textShadow: '0 2px 8px rgba(0,0,0,0.8)',
                letterSpacing: 0.5,
                lineHeight: 1.1,
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              {placement.channelName}
            </span>
          )}
          {placement.showSocialHandle && placement.socialHandle && (
            <span
              style={{
                fontSize: Math.max(9, Math.round(placement.height * 0.24)),
                fontWeight: 600,
                color: '#94a3b8',
                lineHeight: 1.1,
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              {placement.socialHandle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
