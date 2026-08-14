interface HeaderProps {
  view: 'generator' | 'production' | 'characters';
}

export default function Header({ view }: HeaderProps) {
  return (
    <header>
      {view === 'characters' ? (
        <div>
          <p className="eyebrow">AI CONTENT STUDIO</p>
        </div>
      ) : (
        <div>
          <p className="eyebrow">AI CONTENT STUDIO</p>
          <h1>Create a new episode</h1>
          <p className="muted">Build an original children's story from idea to YouTube.</p>
          <div className="status">● MVP</div>
        </div>
      )}
    </header>
  );
}
