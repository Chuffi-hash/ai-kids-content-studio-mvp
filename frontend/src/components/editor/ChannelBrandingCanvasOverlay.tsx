import React, { useState, useRef, useEffect } from 'react';
import { ChannelBrandingConfig, AspectRatioKey, BrandingPosition } from '../../services/branding.service';
import { resolveAssetUrl } from '../../utils/urlHelper';

interface ChannelBrandingCanvasOverlayProps {
  branding?: ChannelBrandingConfig | null;
  format: string;
  currentTimeMs: number;
  onUpdateBranding?: (branding: ChannelBrandingConfig) => void;
  onOpenModal?: () => void;
}

export const ChannelBrandingCanvasOverlay: React.FC<ChannelBrandingCanvasOverlayProps> = ({
  branding,
  format,
  currentTimeMs,
  onUpdateBranding,
  onOpenModal,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  if (!branding || !branding.enabled || !branding.logoUrl) {
    return null;
  }

  // Check timing visibility
  const isTimeVisible =
    branding.alwaysVisible ||
    (currentTimeMs >= (branding.startTimeMs || 0) &&
      currentTimeMs <= (branding.endTimeMs || Infinity));

  if (!isTimeVisible) {
    return null;
  }

  const formatKey = (format as AspectRatioKey) || '16:9';
  const preset = branding.formatPresets?.[formatKey] || {};
  const pos: BrandingPosition = preset.position || branding.position || 'top-right';
  const padding = preset.padding ?? branding.padding ?? 24;
  const width = preset.width ?? branding.width ?? 140;
  const height = preset.height ?? branding.height ?? 50;
  const opacity = preset.opacity ?? branding.opacity ?? 0.9;

  // Custom dragged coordinates
  const customX = preset.customX ?? branding.customX;
  const customY = preset.customY ?? branding.customY;

  // Compute position styling relative to the preview viewport (0 to 100% or absolute px)
  const style: React.CSSProperties = {
    position: 'absolute',
    width: `${width}px`,
    height: `${height}px`,
    opacity,
    zIndex: 35, // Layer 6: above visuals/characters, below system overlays
    cursor: isDragging ? 'grabbing' : 'grab',
    userSelect: 'none',
    transition: isDragging ? 'none' : 'all 0.15s ease-out',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: `${branding.borderRadius ?? 8}px`,
    backgroundColor: branding.showBackgroundContainer
      ? (branding.containerBgColor || 'rgba(15, 23, 42, 0.7)')
      : 'transparent',
    padding: branding.showBackgroundContainer ? '4px 8px' : '0px',
    boxShadow: branding.showShadow ? '0 4px 12px rgba(0, 0, 0, 0.45)' : 'none',
  };

  if (pos === 'custom' && customX !== undefined && customY !== undefined) {
    style.left = `${customX}px`;
    style.top = `${customY}px`;
  } else {
    switch (pos) {
      case 'top-left':
        style.top = `${padding}px`;
        style.left = `${padding}px`;
        break;
      case 'top-right':
        style.top = `${padding}px`;
        style.right = `${padding}px`;
        break;
      case 'bottom-left':
        // Safe area above captions
        style.bottom = `${padding + 32}px`;
        style.left = `${padding}px`;
        break;
      case 'bottom-right':
      default:
        style.bottom = `${padding + 32}px`;
        style.right = `${padding}px`;
        break;
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();

    const parent = overlayRef.current?.parentElement;
    if (!parent) return;

    const parentRect = parent.getBoundingClientRect();
    const currentLeft = overlayRef.current ? overlayRef.current.offsetLeft : 0;
    const currentTop = overlayRef.current ? overlayRef.current.offsetTop : 0;

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: currentLeft,
      initY: currentTop,
    };
    setIsDragging(true);

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!dragStartRef.current) return;
      const dx = moveEvent.clientX - dragStartRef.current.startX;
      const dy = moveEvent.clientY - dragStartRef.current.startY;
      const newX = Math.max(0, Math.min(parentRect.width - width, dragStartRef.current.initX + dx));
      const newY = Math.max(0, Math.min(parentRect.height - height, dragStartRef.current.initY + dy));

      if (overlayRef.current) {
        overlayRef.current.style.left = `${newX}px`;
        overlayRef.current.style.top = `${newY}px`;
        overlayRef.current.style.right = 'auto';
        overlayRef.current.style.bottom = 'auto';
      }
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      setIsDragging(false);

      if (dragStartRef.current && overlayRef.current) {
        const finalX = overlayRef.current.offsetLeft;
        const finalY = overlayRef.current.offsetTop;

        if (onUpdateBranding) {
          const updatedPresets = {
            ...(branding.formatPresets || {}),
            [formatKey]: {
              ...preset,
              position: 'custom' as const,
              customX: finalX,
              customY: finalY,
            },
          };
          onUpdateBranding({
            ...branding,
            position: 'custom',
            customX: finalX,
            customY: finalY,
            formatPresets: updatedPresets,
          });
        }
      }
      dragStartRef.current = null;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  return (
    <div
      ref={overlayRef}
      style={style}
      onPointerDown={handlePointerDown}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpenModal?.();
      }}
      title="Channel Logo Overlay (Drag to reposition, double-click to edit settings)"
    >
      <img
        src={resolveAssetUrl(branding.logoUrl)}
        alt="Channel Logo"
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          pointerEvents: 'none',
        }}
      />
      {branding.socialHandle && (
        <span
          style={{
            position: 'absolute',
            bottom: '-14px',
            fontSize: '9px',
            color: 'rgba(255, 255, 255, 0.75)',
            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {branding.socialHandle}
        </span>
      )}
    </div>
  );
};
