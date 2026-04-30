import { NavLink, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function AppNav() {
  const { user, logout } = useAuth();

  return (
    <nav className="app-nav" aria-label="App navigation">
      <Link className="brand" to="/app">Phototracker</Link>
      <div className="app-nav-links">
        <NavLink to="/app/photos">Photos</NavLink>
        <NavLink to="/app/rolls">Rolls</NavLink>
        <NavLink to="/app/cameras">Cameras</NavLink>
        <NavLink to="/app/lenses">Lenses</NavLink>
        <NavLink to="/app/films">Film</NavLink>
      </div>
      <div className="app-nav-user">
        <span className="app-nav-email">{user?.email}</span>
        <button className="link-btn" onClick={logout}>Sign out</button>
      </div>
    </nav>
  );
}
