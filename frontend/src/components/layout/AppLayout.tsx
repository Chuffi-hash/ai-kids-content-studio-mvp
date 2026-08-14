import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  // Determine current view based on route
  const getCurrentView = (): 'generator' | 'production' | 'characters' => {
    if (location.pathname === '/characters') return 'characters';
    if (location.pathname === '/production') return 'production';
    return 'generator';
  };

  const currentView = getCurrentView();

  function handleNavigate(view: 'generator' | 'characters') {
    if (view === 'generator') {
      navigate('/');
    } else if (view === 'characters') {
      navigate('/characters');
    }
  }

  return (
    <div className="app">
      <Sidebar currentView={currentView} onNavigate={handleNavigate} />
      <main className="main">
        <Header view={currentView} />
        <Outlet />
      </main>
    </div>
  );
}
