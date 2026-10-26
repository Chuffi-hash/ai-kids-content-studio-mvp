import React from 'react';
import { useTheme, ThemeMode } from '../../context/ThemeContext';
import { SunIcon, MoonIcon, MonitorIcon } from './Icons';

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '', showLabel = true }) => {
  const { themeMode, effectiveTheme, toggleTheme } = useTheme();

  const modeConfig = {
    dark: {
      icon: <MoonIcon size={15} color="#c4b5fd" />,
      label: 'Dark Mode',
      title: 'Current theme: Dark. Click to switch to Light Mode',
    },
    light: {
      icon: <SunIcon size={15} color="#f59e0b" />,
      label: 'Light Mode',
      title: 'Current theme: Light. Click to switch to Auto (System)',
    },
    system: {
      icon: <MonitorIcon size={15} color="#38bdf8" />,
      label: `Auto (${effectiveTheme === 'dark' ? 'Dark' : 'Light'})`,
      title: `Current theme: Auto System (${effectiveTheme}). Click to switch to Dark Mode`,
    },
  };

  const current = modeConfig[themeMode] || modeConfig.dark;

  return (
    <button
      type="button"
      className={`theme-toggle-btn ${themeMode} ${className}`.trim()}
      onClick={toggleTheme}
      title={current.title}
      aria-label={`Toggle theme (currently ${themeMode})`}
    >
      <span className="theme-toggle-icon">{current.icon}</span>
      {showLabel && (
        <span className="theme-toggle-label">{current.label}</span>
      )}
    </button>
  );
};

export interface ThemeSelectorProps {
  className?: string;
  fullWidth?: boolean;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({ className = '', fullWidth = false }) => {
  const { themeMode, effectiveTheme, setThemeMode } = useTheme();

  const options: Array<{ mode: ThemeMode; label: string; icon: React.ReactNode; tooltip: string }> = [
    {
      mode: 'dark',
      label: 'Dark',
      icon: <MoonIcon size={13} color={themeMode === 'dark' ? '#c4b5fd' : 'currentColor'} />,
      tooltip: 'Dark Mode (Night)',
    },
    {
      mode: 'light',
      label: 'Light',
      icon: <SunIcon size={13} color={themeMode === 'light' ? '#f59e0b' : 'currentColor'} />,
      tooltip: 'Light Mode (Day)',
    },
    {
      mode: 'system',
      label: 'Auto',
      icon: <MonitorIcon size={13} color={themeMode === 'system' ? '#38bdf8' : 'currentColor'} />,
      tooltip: `System Auto (Currently: ${effectiveTheme})`,
    },
  ];

  return (
    <div
      className={`theme-segmented-control ed-theme-segmented-control ${fullWidth ? 'full-width' : ''} ${className}`.trim()}
      role="radiogroup"
      aria-label="Theme selector"
    >
      {options.map((opt) => {
        const isActive = themeMode === opt.mode;
        return (
          <button
            key={opt.mode}
            type="button"
            role="radio"
            aria-checked={isActive}
            className={`theme-segmented-btn ed-theme-segmented-btn ${isActive ? 'active' : ''}`}
            onClick={() => setThemeMode(opt.mode)}
            title={opt.tooltip}
          >
            <span className="theme-segmented-icon ed-theme-icon">{opt.icon}</span>
            <span className="theme-segmented-label ed-theme-btn-label">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
};


