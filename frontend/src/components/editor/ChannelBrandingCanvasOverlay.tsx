import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { ChannelBrandingConfig, AspectRatioKey } from '../../services/branding.service';
import { resolveAssetUrl } from '../../utils/urlHelper';
import {
  calculateResolvedBrandingPlacement,
  AspectRatioFormat,
} from '../../utils/sharedCompositionCoordinates';

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
  const [containerDim, setContainerDim] = useState<{ width: number; height: number }>({ width: 854, height: 480 });

  const formatKey = (format as AspectRatioKey) || '16:9';

  // Measure parent container viewport
  useLayoutEffect(() => {
    const parent = overlayRef.current?.parentElement;
    if (!parent) return;

    const updateDim = () => {
      const rect = parent.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerDim({ width: rect.width, height: rect.height });
      }
    };

    updateDim();

    const ro = new ResizeObserver(updateDim);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [formatKey]);

  if (!branding || !branding.enabled || !branding.logoUrl) {
    return null;
  }

  const placement = calculateResolvedBrandingPlacement({
    branding: branding as any,
    format: formatKey as AspectRatioFormat,
    containerWidth: containerDim.width,
    containerHeight: containerDim.height,
    currentTimeMs,
  });

  if (!placement.visible) {
    return null;
  }

  // Handle pointer drag
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();

    const parent = overlayRef.current?.parentElement;
    if (!parent) return;

    const parentRect = parent.getBoundingClientRect();
    const currentLeft = overlayRef.current ? overlayRef.current.offsetLeft : placement.x;
    const currentTop = overlayRef.current ? overlayRef.current.offsetTop : placement.y;

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: currentLeft,
      initY: currentTop,
    };
    setIsDragging(true);

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!dragStartRef.current || !overlayRef.current) return;
      const dx = moveEvent.clientX - dragStartRef.current.startX;
      const dy = moveEvent.clientY - dragStartRef.current.startY;
      const newX = Math.max(0, Math.min(parentRect.width - placement.width, dragStartRef.current.initX + dx));
      const newY = Math.max(0, Math.min(parentRect.height - placement.height, dragStartRef.current.initY + dy));

      overlayRef.current.style.left = `${newX}px`;
      overlayRef.current.style.top = `${newY}px`;
      overlayRef.current.style.right = 'auto';
      overlayRef.current.style.bottom = 'auto';
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      setIsDragging(false);

      if (dragStartRef.current && overlayRef.current) {
        const finalX = overlayRef.current.offsetLeft;
        const finalY = overlayRef.current.offsetTop;

        // Calculate precision normalized coordinates [0.0 - 1.0]
        const normX = Number(Math.max(0, Math.min(1, finalX / parentRect.width)).toFixed(4));
        const normY = Number(Math.max(0, Math.min(1, finalY / parentRect.height)).toFixed(4));

        const baseW = formatKey === '16:9' ? 1280 : 720;
        const baseH = formatKey === '16:9' ? 720 : (formatKey === '9:16' ? 1280 : 720);

        if (onUpdateBranding) {
          const currentPresets = branding.formatPresets || {};
          const currentPreset = currentPresets[formatKey] || {};

          const updatedPresets = {
            ...currentPresets,
            [formatKey]: {
              ...currentPreset,
              position: 'custom' as const,
              normalizedX: normX,
              normalizedY: normY,
              customX: Math.round(normX * baseW),
              customY: Math.round(normY * baseH),
            },
          };

          onUpdateBranding({
            ...branding,
            position: 'custom',
            normalizedX: normX,
            normalizedY: normY,
            customX: Math.round(normX * baseW),
            customY: Math.round(normY * baseH),
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
      style={{
        position: 'absolute',
        left: isDragging ? undefined : `${placement.x}px`,
        top: isDragging ? undefined : `${placement.y}px`,
        width: `${placement.width}px`,
        height: `${placement.height}px`,
        opacity: placement.opacity,
        zIndex: 35, // Layer 6: above visuals/characters, below system overlays
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        transition: isDragging ? 'none' : 'all 0.15s ease-out',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        borderRadius: `${placement.borderRadius}px`,
        backgroundColor: placement.backgroundColor,
        padding: placement.showBackground ? '4px 8px' : '0px',
        boxShadow: placement.showShadow ? '0 4px 12px rgba(0, 0, 0, 0.45)' : 'none',
      }}
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

      {(placement.showChannelName || placement.showSocialHandle) && (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {placement.showChannelName && placement.channelName && (
            <span
              style={{
                fontSize: `${Math.max(10, Math.round(placement.height * 0.28))}px`,
                fontWeight: 800,
                color: '#ffffff',
                textShadow: '0 1px 4px rgba(0,0,0,0.85)',
                lineHeight: 1.1,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}
            >
              {placement.channelName}
            </span>
          )}
          {placement.showSocialHandle && placement.socialHandle && (
            <span
              style={{
                fontSize: `${Math.max(9, Math.round(placement.height * 0.22))}px`,
                color: 'rgba(255, 255, 255, 0.8)',
                textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
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
