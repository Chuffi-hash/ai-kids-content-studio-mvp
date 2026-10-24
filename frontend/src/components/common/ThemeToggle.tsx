import React from 'react';
import { useTheme, ThemeMode } from '../../context/ThemeContext';
import { SunIcon, MoonIcon, MonitorIcon } from './Icons';

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '', showLabel = true }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      className={`theme-toggle-btn ${theme} ${className}`}
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      aria-label="Toggle theme"
    >
      <span className="theme-toggle-icon">
        {theme === 'dark' ? (
          <SunIcon size={15} color="#fbbf24" />
        ) : (
          <MoonIcon size={15} color="#4f46e5" />
        )}
      </span>
      {showLabel && (
        <span className="theme-toggle-label">
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </span>
      )}
    </button>
  );
};

export const ThemeSelector: React.FC<{ className?: string }> = ({ className = '' }) => {
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
    <div className={`ed-theme-segmented-control ${className}`} role="radiogroup" aria-label="Theme selector">
      {options.map((opt) => {
        const isActive = themeMode === opt.mode;
        return (
          <button
            key={opt.mode}
            type="button"
            role="radio"
            aria-checked={isActive}
            className={`ed-theme-segmented-btn ${isActive ? 'active' : ''}`}
            onClick={() => setThemeMode(opt.mode)}
            title={opt.tooltip}
          >
            <span className="ed-theme-icon">{opt.icon}</span>
            <span className="ed-theme-btn-label">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
};


