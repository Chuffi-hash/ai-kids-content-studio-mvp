import React from 'react';
import {
  ClapperboardIcon,
  UsersIcon,
  ImageIcon,
  VideoIcon,
  MusicIcon,
  SparklesIcon,
  SettingsIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '../common/Icons';

export type SidebarSection =
  | 'scenes'
  | 'characters'
  | 'images'
  | 'videos'
  | 'audio'
  | 'scene_settings'
  | 'rig'
  | 'dialogue'
  | 'overlays';

interface SidebarNavigationProps {
  activeSection: SidebarSection;
  onSelectSection: (section: SidebarSection) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  counts?: {
    scenes?: number;
    characters?: number;
    images?: number;
    videos?: number;
    audio?: number;
    rig?: number;
    dialogue?: number;
    overlays?: number;
  };
}

export const SidebarNavigation: React.FC<SidebarNavigationProps> = ({
  activeSection,
  onSelectSection,
  isCollapsed,
  onToggleCollapse,
  counts = {},
}) => {
  const assetItems: Array<{
    id: SidebarSection;
    label: string;
    icon: React.ReactNode;
    count?: number;
  }> = [
    {
      id: 'scenes',
      label: 'Scenes',
      icon: <ClapperboardIcon size={16} />,
      count: counts.scenes,
    },
    {
      id: 'characters',
      label: 'Characters',
      icon: <UsersIcon size={16} />,
      count: counts.characters,
    },
    {
      id: 'images',
      label: 'Images',
      icon: <ImageIcon size={16} />,
      count: counts.images,
    },
    {
      id: 'videos',
      label: 'Clips',
      icon: <VideoIcon size={16} />,
      count: counts.videos,
    },
    {
      id: 'audio',
      label: 'Audio',
      icon: <MusicIcon size={16} />,
      count: counts.audio,
    },
  ];

  const toolItems: Array<{
    id: SidebarSection;
    label: string;
    icon: React.ReactNode;
    count?: number;
  }> = [
    {
      id: 'scene_settings',
      label: 'Scene Settings',
      icon: <SettingsIcon size={16} />,
    },
    {
      id: 'rig',
      label: '2D Rig',
      icon: <SparklesIcon size={16} color="#a78bfa" />,
      count: counts.rig,
    },
    {
      id: 'dialogue',
      label: 'Dialogue',
      icon: <span style={{ fontSize: '15px', lineHeight: 1 }}>👄</span>,
      count: counts.dialogue,
    },
    {
      id: 'overlays',
      label: 'Overlays',
      icon: <span style={{ fontSize: '15px', lineHeight: 1 }}>📍</span>,
      count: counts.overlays,
    },
  ];

  const renderNavButton = (item: {
    id: SidebarSection;
    label: string;
    icon: React.ReactNode;
    count?: number;
  }) => {
    const isActive = activeSection === item.id;
    return (
      <button
        key={item.id}
        type="button"
        className={`ed-sidebar-nav-btn ${isActive ? 'active' : ''}`}
        onClick={() => onSelectSection(item.id)}
        title={isCollapsed ? `${item.label}${item.count !== undefined ? ` (${item.count})` : ''}` : undefined}
        aria-label={item.label}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: isCollapsed ? '0' : '10px',
          justifyContent: isCollapsed ? 'center' : 'flex-start',
          width: '100%',
          padding: isCollapsed ? '10px 0' : '9px 12px',
          background: isActive ? 'rgba(139, 92, 246, 0.16)' : 'transparent',
          border: 'none',
          borderLeft: isActive ? '3px solid #8b5cf6' : '3px solid transparent',
          color: isActive ? '#f8fafc' : 'var(--ed-text-muted)',
          cursor: 'pointer',
          borderRadius: isCollapsed ? '6px' : '0 6px 6px 0',
          fontSize: '12px',
          fontWeight: isActive ? 600 : 500,
          transition: 'all 0.15s ease',
          position: 'relative',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '20px',
            height: '20px',
            color: isActive ? '#c4b5fd' : 'inherit',
            flexShrink: 0,
          }}
        >
          {item.icon}
        </div>

        {!isCollapsed && (
          <span
            style={{
              flex: 1,
              textAlign: 'left',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.label}
          </span>
        )}

        {item.count !== undefined && item.count > 0 && (
          <span
            style={{
              fontSize: '10px',
              fontFamily: 'monospace',
              padding: '1px 5px',
              borderRadius: '10px',
              background: isActive ? 'rgba(139, 92, 246, 0.35)' : 'rgba(255, 255, 255, 0.08)',
              color: isActive ? '#fbcfe8' : 'var(--ed-text-faint)',
              fontWeight: 700,
              flexShrink: 0,
              marginLeft: isCollapsed ? '0' : 'auto',
              position: isCollapsed ? 'absolute' : 'static',
              top: isCollapsed ? '2px' : undefined,
              right: isCollapsed ? '4px' : undefined,
            }}
          >
            {item.count}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside
      className={`ed-primary-sidebar ${isCollapsed ? 'collapsed' : 'expanded'}`}
      style={{
        width: isCollapsed ? '54px' : '168px',
        background: 'var(--ed-surface)',
        borderRight: '1px solid var(--ed-border)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        flexShrink: 0,
        height: '100%',
        boxSizing: 'border-box',
        transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        overflowX: 'hidden',
        overflowY: 'auto',
        zIndex: 25,
      }}
    >
      {/* Top Group: Primary Story Assets */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '8px 0', gap: '2px' }}>
        {!isCollapsed && (
          <div
            style={{
              padding: '6px 14px',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ed-text-faint)',
            }}
          >
            Story Assets
          </div>
        )}
        {assetItems.map(renderNavButton)}

        {/* Section Divider */}
        <div
          style={{
            margin: '10px 10px',
            borderTop: '1px solid var(--ed-border)',
            opacity: 0.8,
          }}
        />

        {/* Second Group: Scene Tools (Vertically Organized) */}
        {!isCollapsed && (
          <div
            style={{
              padding: '4px 14px 6px',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ed-text-faint)',
            }}
          >
            Scene Tools
          </div>
        )}
        {toolItems.map(renderNavButton)}
      </div>

      {/* Bottom Footer: Collapse / Expand Toggle */}
      <div
        style={{
          borderTop: '1px solid var(--ed-border)',
          padding: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'flex-end',
        }}
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          title={isCollapsed ? 'Expand navigation sidebar' : 'Collapse sidebar to icons'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'transparent',
            border: 'none',
            color: 'var(--ed-text-muted)',
            cursor: 'pointer',
            padding: '6px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            width: isCollapsed ? 'auto' : '100%',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          {isCollapsed ? <ChevronRightIcon size={14} /> : <ChevronLeftIcon size={14} />}
          {!isCollapsed && <span>Collapse Sidebar</span>}
        </button>
      </div>
    </aside>
  );
};

