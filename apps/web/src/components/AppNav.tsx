import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useDevelopmentTimerRuntime } from "../developmentTimerQueue";
import { isFilmSectionPath } from "./appNavPaths";

export function AppNav() {
  const { user } = useAuth();
  const { items: timerItems, endingSoon } = useDevelopmentTimerRuntime(user?.id);
  const location = useLocation();
  const isAdmin = user?.email.trim().toLowerCase() === "graha.ms@graha.ms";
  const gearSectionLinks = [
    { to: "/app/gear/cameras", label: "Cameras" },
    { to: "/app/gear/lenses", label: "Lenses" },
    { to: "/app/gear/filters", label: "Filters" },
  ];
  const filmSectionLinks = [
    { to: "/app/film/stocks", label: "Film Stocks" },
    { to: "/app/film/rolls", label: "Rolls" },
    { to: "/app/film/holders", label: "Film Holders" },
  ];
  const isGearSection = (() => {
    const { pathname } = location;
    return (
      pathname.startsWith("/app/gear/") ||
      pathname === "/app/gear" ||
      pathname === "/app/cameras" ||
      pathname === "/app/lenses" ||
      pathname === "/app/filters"
    );
  })();
  const isFilmSection = (() => {
    const { pathname } = location;
    return isFilmSectionPath(pathname);
  })();
  return (
    <nav className="app-nav" aria-label="App navigation">
      <div className="app-nav-primary">
        <Link className="brand" to="/app" aria-label="Darkcloth">
          <span className="brand-wordmark" aria-hidden="true">
            <span className="brand-wordmark-dark">dark</span>
            <span className="brand-wordmark-cloth">cloth</span>
          </span>
        </Link>
        <div className="app-nav-links">
          <NavLink to="/app/photos">Photos</NavLink>
          <NavLink to="/app/gear">Gear</NavLink>
          <NavLink
            to="/app/film"
            className={({ isActive }) => (isActive || isFilmSection ? "active" : "")}
          >
            Film
          </NavLink>
          {(timerItems.length > 0 || location.pathname.startsWith("/app/timer")) && (
            <NavLink
              to="/app/timer"
              className={({ isActive }) => [
                isActive ? "active" : "",
                endingSoon ? "app-nav-timer-alert" : "",
              ].filter(Boolean).join(" ")}
            >
              Timer
            </NavLink>
          )}
        </div>
        <div className="app-nav-user">
          <span className="app-nav-email">{user?.email}</span>
          {isAdmin && (
            <NavLink
              to="/app/admin"
              className={({ isActive }) => (isActive ? "app-nav-profile-link active" : "app-nav-profile-link")}
            >
              Admin
            </NavLink>
          )}
          <NavLink
            to="/app/profile"
            className={({ isActive }) => (isActive ? "app-nav-profile-link active" : "app-nav-profile-link")}
          >
            Profile
          </NavLink>
        </div>
      </div>
      {isGearSection && (
        <div className="app-nav-subnav" aria-label="Gear sections">
          {gearSectionLinks.map((link) => (
            <NavLink key={link.to} to={link.to}>
              {link.label}
            </NavLink>
          ))}
        </div>
      )}
      {isFilmSection && (
        <div className="app-nav-subnav" aria-label="Film sections">
          {filmSectionLinks.map((link) => (
            <NavLink key={link.to} to={link.to}>
              {link.label}
            </NavLink>
          ))}
        </div>
      )}
    </nav>
  );
}
