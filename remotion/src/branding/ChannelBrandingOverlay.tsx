import React from 'react';
import { Img, staticFile } from 'remotion';
import {
  AspectRatio,
  ChannelBrandingConfig,
  BrandingPosition,
} from '../manifest';

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

  // Timing check
  const isTimeVisible =
    branding.alwaysVisible ??
    (currentTimeMs >= (branding.startTimeMs || 0) &&
      currentTimeMs <= (branding.endTimeMs || Infinity));

  if (!isTimeVisible) {
    return null;
  }

  const preset = branding.formatPresets?.[format] || {};
  const pos: BrandingPosition = preset.position || branding.position || 'top-right';
  const padding = preset.padding ?? branding.padding ?? 24;
  const baseWidth = preset.width ?? branding.width ?? 140;
  const baseHeight = preset.height ?? branding.height ?? 50;
  const opacity = preset.opacity ?? branding.opacity ?? 0.9;

  // Responsive scale factor for 1080p vs 720p base
  const scale = Math.min(viewportWidth / 1280, viewportHeight / 720);
  const targetWidth = Math.round(baseWidth * Math.max(0.75, scale));
  const targetHeight = Math.round(baseHeight * Math.max(0.75, scale));
  const safePadding = Math.round(padding * Math.max(0.75, scale));

  let stylePos: React.CSSProperties = {};

  switch (pos) {
    case 'top-left':
      stylePos = {
        top: safePadding,
        left: safePadding,
      };
      break;
    case 'top-right':
      stylePos = {
        top: safePadding,
        right: safePadding,
      };
      break;
    case 'bottom-left':
      stylePos = {
        bottom: Math.max(safePadding, Math.round(viewportHeight * 0.16)), // Stay above caption zone
        left: safePadding,
      };
      break;
    case 'bottom-right':
      stylePos = {
        bottom: Math.max(safePadding, Math.round(viewportHeight * 0.16)), // Stay above caption zone
        right: safePadding,
      };
      break;
    case 'custom':
      stylePos = {
        left: preset.customX ?? branding.customX ?? safePadding,
        top: preset.customY ?? branding.customY ?? safePadding,
      };
      break;
  }

  const logoSrc = branding.logoUrl.startsWith('data:') || branding.logoUrl.startsWith('http')
    ? branding.logoUrl
    : staticFile(branding.logoUrl);

  return (
    <div
      style={{
        position: 'absolute',
        ...stylePos,
        zIndex: 35, // Layer 6: Above foreground effects (20), below captions (40)
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        opacity,
        pointerEvents: 'none',
        padding: branding.showBackgroundContainer ? '6px 12px' : 0,
        backgroundColor: branding.showBackgroundContainer
          ? branding.containerBgColor || 'rgba(15, 23, 42, 0.65)'
          : 'transparent',
        borderRadius: branding.borderRadius ?? 8,
        backdropFilter: branding.showBackgroundContainer ? 'blur(6px)' : undefined,
        boxShadow: branding.showShadow ? '0 4px 16px rgba(0,0,0,0.45)' : undefined,
      }}
    >
      <Img
        src={logoSrc}
        style={{
          width: targetWidth,
          height: targetHeight,
          objectFit: 'contain',
          display: 'block',
        }}
      />

      {(branding.channelName || branding.socialHandle) && (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {branding.channelName && (
            <span
              style={{
                fontSize: Math.max(11, Math.round(targetHeight * 0.3)),
                fontWeight: 800,
                color: '#ffffff',
                textShadow: '0 2px 8px rgba(0,0,0,0.8)',
                letterSpacing: 0.5,
                lineHeight: 1.1,
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              {branding.channelName}
            </span>
          )}
          {branding.socialHandle && (
            <span
              style={{
                fontSize: Math.max(9, Math.round(targetHeight * 0.24)),
                fontWeight: 600,
                color: '#94a3b8',
                lineHeight: 1.1,
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              {branding.socialHandle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
