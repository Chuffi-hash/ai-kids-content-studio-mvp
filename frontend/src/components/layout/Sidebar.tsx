import { useNavigate, useLocation } from "react-router-dom";

interface NavItem {
  label: string;
  icon: string;
  path: string;
}

const navItems: NavItem[] = [
  { label: "Create Story", icon: "✦", path: "/" },
  { label: "Stories", icon: "▤", path: "/stories" },
  { label: "Characters", icon: "◉", path: "/characters" },
  { label: "Production", icon: "▶", path: "/production" },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">AI</div>
        <div className="brand-text">
          <strong>Content Studio</strong>
          <span>Story Studio</span>
        </div>
      </div>

      <nav>
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              className={`nav-item ${isActive ? "active" : ""}`}
              onClick={() => navigate(item.path)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
