import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  SparklesIcon,
  BookOpenIcon,
  UsersIcon,
  FilmIcon,
} from "../common/Icons";
import { ThemeSelector } from "../common/ThemeToggle";

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
}

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems: NavItem[] = [
    {
      label: "Create Story",
      icon: <SparklesIcon size={17} />,
      path: "/",
    },
    {
      label: "Stories",
      icon: <BookOpenIcon size={17} />,
      path: "/stories",
    },
    {
      label: "Characters",
      icon: <UsersIcon size={17} />,
      path: "/characters",
    },
    {
      label: "Production",
      icon: <FilmIcon size={17} />,
      path: "/production",
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
          <span>Kids Media Studio</span>
        </div>
      </div>

      <nav>
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              type="button"
              className={`nav-item ${isActive ? "active" : ""}`}
              onClick={() => navigate(item.path)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <ThemeSelector fullWidth />
      </div>
    </aside>
  );
}
