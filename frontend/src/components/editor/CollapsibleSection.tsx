import React, { useState } from 'react';
import { ChevronDownIcon } from '../common/Icons';

export interface CollapsibleSectionProps {
  id?: string;
  title: string | React.ReactNode;
  subtitle?: string | React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  isOpen?: boolean;
  onToggle?: (isOpen: boolean) => void;
  headerActions?: React.ReactNode;
  variant?: 'default' | 'card' | 'workflow-a' | 'workflow-b' | 'subtle' | 'flow-card';
  storageKey?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  id,
  title,
  subtitle,
  icon,
  badge,
  defaultOpen = true,
  isOpen: controlledIsOpen,
  onToggle,
  headerActions,
  variant = 'card',
  storageKey,
  children,
  className = '',
  style,
  bodyStyle,
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState<boolean>(() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(`collapsible_${storageKey}`);
        if (saved !== null) {
          return saved === 'true';
        }
      } catch {}
    }
    return defaultOpen;
  });
  const isExpanded = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

  const handleToggle = () => {
    const next = !isExpanded;
    if (controlledIsOpen === undefined) {
      setInternalIsOpen(next);
      if (storageKey) {
        try {
          localStorage.setItem(`collapsible_${storageKey}`, String(next));
        } catch {}
      }
    }
    if (onToggle) {
      onToggle(next);
    }
  };

  // Determine variant-specific container styles
  let variantBorder = '1px solid var(--ed-border, var(--color-border))';
  let variantBg = 'var(--ed-surface-elevated, var(--color-surface, #161f33))';
  let headerBg = 'rgba(255, 255, 255, 0.02)';
  let titleColor = 'var(--ed-text, var(--color-text))';

  if (variant === 'workflow-a') {
    variantBorder = '1px solid rgba(16, 185, 129, 0.35)';
    variantBg = 'rgba(16, 185, 129, 0.02)';
    headerBg = 'rgba(16, 185, 129, 0.06)';
    titleColor = '#059669';
  } else if (variant === 'workflow-b') {
    variantBorder = '1px solid rgba(139, 92, 246, 0.35)';
    variantBg = 'rgba(139, 92, 246, 0.02)';
    headerBg = 'rgba(139, 92, 246, 0.06)';
    titleColor = '#8b5cf6';
  } else if (variant === 'subtle') {
    variantBorder = '1px solid var(--ed-border-subtle, rgba(255, 255, 255, 0.08))';
    variantBg = 'transparent';
    headerBg = 'transparent';
  } else if (variant === 'flow-card') {
    variantBorder = '1px solid var(--color-border, #202d45)';
    variantBg = 'var(--color-surface, #101726)';
    headerBg = 'transparent';
    titleColor = 'var(--color-text, #ffffff)';
  }

  const isFlowCard = variant === 'flow-card';

  return (
    <div
      id={id}
      className={`ed-collapsible-section ${isFlowCard ? 'flow-card ' : ''}${className}`}
      style={{
        border: variantBorder,
        borderRadius: isFlowCard ? 'var(--radius, 12px)' : '8px',
        background: variantBg,
        boxShadow: isFlowCard ? '0 4px 16px rgba(0, 0, 0, 0.2)' : undefined,
        overflow: 'hidden',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        ...style,
      }}
    >
      {/* Header bar */}
      <div
        className="ed-collapsible-header"
        onClick={handleToggle}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isFlowCard ? '16px 20px' : '10px 12px',
          background: headerBg,
          cursor: 'pointer',
          userSelect: 'none',
          borderBottom: isExpanded ? '1px solid var(--color-border, var(--ed-border))' : '1px solid transparent',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: isFlowCard ? '12px' : '8px', minWidth: 0, flex: 1 }}>
          {/* Chevron indicator */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-muted, var(--ed-text-muted))',
              transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.18s ease',
              flexShrink: 0,
            }}
          >
            <ChevronDownIcon size={isFlowCard ? 16 : 14} />
          </span>

          {/* Optional Icon */}
          {icon && (
            <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
              {icon}
            </span>
          )}

          {/* Title & Subtitle */}
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
            <span
              style={{
                fontSize: isFlowCard ? '16px' : '12px',
                fontWeight: isFlowCard ? 700 : 600,
                color: titleColor,
                letterSpacing: '0.01em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {title}
            </span>
            {subtitle && (
              <span
                style={{
                  fontSize: isFlowCard ? '12px' : '10px',
                  color: 'var(--color-text-secondary, var(--ed-text-muted))',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginTop: isFlowCard ? '4px' : '1px',
                }}
              >
                {subtitle}
              </span>
            )}
          </div>
        </div>

        {/* Right side: Badge and optional header action buttons */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {badge && (
            <div style={{ display: 'inline-flex', alignItems: 'center' }}>
              {badge}
            </div>
          )}
          {headerActions}
        </div>
      </div>

      {/* Collapsible Body — hidden with CSS to guarantee form and workflow state is never destroyed */}
      <div
        className="ed-collapsible-body"
        aria-hidden={!isExpanded}
        style={{
          display: isExpanded ? 'flex' : 'none',
          padding: isFlowCard ? '20px' : '12px',
          flexDirection: 'column',
          gap: isFlowCard ? '16px' : '12px',
          ...bodyStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
};

