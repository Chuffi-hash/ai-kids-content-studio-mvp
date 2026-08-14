interface SidebarProps {
  currentView: 'generator' | 'production' | 'characters';
  onNavigate: (view: 'generator' | 'characters') => void;
}

export default function Sidebar({ currentView, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">AI</div>
        <div>
          <strong>Kids Studio</strong>
          <span>Content Factory</span>
        </div>
      </div>

      <nav>
        <button 
          className={`nav-item ${currentView === 'generator' ? 'active' : ''}`}
          onClick={() => onNavigate('generator')}
        >
          🏠 Dashboard
        </button>
        <button className="nav-item">📚 Projects</button>
        <button 
          className={`nav-item ${currentView === 'characters' ? 'active' : ''}`}
          onClick={() => onNavigate('characters')}
        >
          🧸 Characters
        </button>
        <button className="nav-item">🎞️ Videos</button>
        <button className="nav-item">⚙️ Settings</button>
      </nav>
    </aside>
  );
}
