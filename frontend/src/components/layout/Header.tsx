import { ThemeToggle } from "../common/ThemeToggle";

export default function Header() {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>AI Content Studio</h1>
        <span className="topbar-tag">Kids Media Studio</span>
      </div>
      <div className="topbar-actions">
        <ThemeToggle />
        <span className="status">MVP</span>
      </div>
    </header>
  );
}
