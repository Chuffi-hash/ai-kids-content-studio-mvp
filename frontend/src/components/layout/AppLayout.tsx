import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function AppLayout() {
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
