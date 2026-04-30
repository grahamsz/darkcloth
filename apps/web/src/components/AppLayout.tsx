import { Outlet } from "react-router-dom";
import { AppNav } from "./AppNav";

export function AppLayout() {
  return (
    <div className="app-shell">
      <AppNav />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
