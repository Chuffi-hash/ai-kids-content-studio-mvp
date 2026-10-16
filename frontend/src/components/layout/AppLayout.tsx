import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function AppLayout() {
  const location = useLocation();
  const isEditorRoute = /^\/stories\/[^/]+$/.test(location.pathname) && !location.pathname.endsWith('/new');

  if (isEditorRoute) {
    return <Outlet />;
  }

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <Header />
        <div className="main-inner">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
