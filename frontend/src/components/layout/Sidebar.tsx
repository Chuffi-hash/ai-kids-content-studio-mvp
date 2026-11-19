import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  SparklesIcon,
  BookOpenIcon,
  UsersIcon,
  FilmIcon,
  ImageIcon,
  LayersIcon,
  ChevronDownIcon,
} from "../common/Icons";
import { ThemeSelector } from "../common/ThemeToggle";

interface SimpleNavItem {
  type: "link";
  label: string;
  icon: React.ReactNode;
  path: string;
}

interface DropdownChild {
  label: string;
  icon: React.ReactNode;
  path: string;
}

interface DropdownNavItem {
  type: "dropdown";
  label: string;
  icon: React.ReactNode;
  basePath: string;
  children: DropdownChild[];
}

type NavEntry = SimpleNavItem | DropdownNavItem;

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const isCharactersActive =
    location.pathname === "/characters" || location.pathname.startsWith("/characters/");
  const isBackgroundsActive =
    location.pathname === "/backgrounds" || location.pathname.startsWith("/backgrounds/");
  const isAssetsActive =
    location.pathname === "/assets" || location.pathname.startsWith("/assets/");
  const isAnyAssetActive = isAssetsActive || isCharactersActive || isBackgroundsActive;

  const isFlowActive =
    location.pathname === "/integrations/google-flow" ||
    location.pathname === "/google-flow" ||
    location.pathname.startsWith("/integrations/");

  const [assetDropdownOpen, setAssetDropdownOpen] = useState(isAnyAssetActive);
  const [integrationsDropdownOpen, setIntegrationsDropdownOpen] = useState(isFlowActive);

  // Automatically expand if navigated into any asset or integration page
  useEffect(() => {
    if (isAnyAssetActive) {
      setAssetDropdownOpen(true);
    }
  }, [location.pathname, isAnyAssetActive]);

  useEffect(() => {
    if (isFlowActive) {
      setIntegrationsDropdownOpen(true);
    }
  }, [location.pathname, isFlowActive]);

  const navEntries: NavEntry[] = [
    {
      type: "link",
      label: "Create Story",
      icon: <SparklesIcon size={17} />,
      path: "/",
    },
    {
      type: "link",
      label: "Stories",
      icon: <BookOpenIcon size={17} />,
      path: "/stories",
    },
    {
      type: "dropdown",
      label: "Asset Library",
      icon: <LayersIcon size={17} />,
      basePath: "/assets",
      children: [
        {
          label: "All Assets",
          icon: <LayersIcon size={15} />,
          path: "/assets",
        },
        {
          label: "Characters",
          icon: <UsersIcon size={15} />,
          path: "/characters",
        },
        {
          label: "Backgrounds",
          icon: <ImageIcon size={15} />,
          path: "/backgrounds",
        },
      ],
    },
    {
      type: "link",
      label: "Production",
      icon: <FilmIcon size={17} />,
      path: "/production",
    },
    {
      type: "dropdown",
      label: "Integrations",
      icon: <SparklesIcon size={17} />,
      basePath: "/integrations/google-flow",
      children: [
        {
          label: "Google Flow",
          icon: <SparklesIcon size={15} />,
          path: "/integrations/google-flow",
        },
      ],
    },
  ];

  return (
    <aside className="sidebar">
      <div className="brand" onClick={() => navigate("/stories")} style={{ cursor: "pointer" }}>
        <div className="brand-mark">
          <SparklesIcon size={18} color="#ffffff" />
        </div>
        <div className="brand-text">
          <strong>Content Studio</strong>
          <span>Content Studio</span>
        </div>
      </div>

      <nav>
        {navEntries.map((entry) => {
          if (entry.type === "link") {
            const isActive = location.pathname === entry.path;
            return (
              <button
                key={entry.path}
                type="button"
                className={`nav-item ${isActive ? "active" : ""}`}
                onClick={() => navigate(entry.path)}
              >
                <span className="nav-icon">{entry.icon}</span>
                <span className="nav-label">{entry.label}</span>
              </button>
            );
          }

          // Dropdown nav item (Asset Library or Integrations)
          const isAssetGroup = entry.basePath === "/assets";
          const isDropdownOpen = isAssetGroup ? assetDropdownOpen : integrationsDropdownOpen;
          const setIsDropdownOpen = isAssetGroup ? setAssetDropdownOpen : setIntegrationsDropdownOpen;

          const isDropdownParentDirectActive = isAssetGroup
            ? isAssetsActive && !isCharactersActive && !isBackgroundsActive
            : isFlowActive;
          const isAnyChildActive = isAssetGroup ? isAnyAssetActive : isFlowActive;

          return (
            <div key={entry.basePath} className="nav-dropdown-group">
              <div
                className={`nav-item nav-dropdown-trigger ${
                  isDropdownParentDirectActive
                    ? "active"
                    : isAnyChildActive
                    ? "active-parent"
                    : ""
                }`}
                onClick={() => {
                  if (!isDropdownOpen) {
                    setIsDropdownOpen(true);
                    navigate(entry.basePath);
                  } else if (location.pathname === entry.basePath) {
                    setIsDropdownOpen(false);
                  } else {
                    navigate(entry.basePath);
                  }
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setIsDropdownOpen((prev) => !prev);
                  }
                }}
              >
                <div className="nav-item-content">
                  <span className="nav-icon">{entry.icon}</span>
                  <span className="nav-label">{entry.label}</span>
                </div>
                <button
                  type="button"
                  className={`nav-dropdown-chevron-btn ${isDropdownOpen ? "open" : ""}`}
                  title={isDropdownOpen ? `Collapse ${entry.label} menu` : `Expand ${entry.label} menu`}
                  aria-label={isDropdownOpen ? `Collapse ${entry.label} menu` : `Expand ${entry.label} menu`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDropdownOpen((prev) => !prev);
                  }}
                >
                  <ChevronDownIcon size={14} />
                </button>
              </div>

              {isDropdownOpen && (
                <div className="nav-dropdown-menu">
                  {entry.children.map((child) => {
                    const isChildActive =
                      child.path === "/assets"
                        ? isAssetsActive && !isCharactersActive && !isBackgroundsActive
                        : child.path === "/characters"
                        ? isCharactersActive
                        : child.path === "/backgrounds"
                        ? isBackgroundsActive
                        : child.path === "/integrations/google-flow"
                        ? isFlowActive
                        : location.pathname === child.path;

                    return (
                      <button
                        key={child.path}
                        type="button"
                        className={`nav-sub-item ${isChildActive ? "active" : ""}`}
                        onClick={() => navigate(child.path)}
                      >
                        <span className="nav-sub-icon">{child.icon}</span>
                        <span className="nav-sub-label">{child.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <ThemeSelector fullWidth />
      </div>
    </aside>
  );
}
