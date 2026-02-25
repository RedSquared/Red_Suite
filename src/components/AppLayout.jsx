import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

export default function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <button
        type="button"
        className="app-menu-toggle"
        onClick={() => setMenuOpen((prev) => !prev)}
        aria-expanded={menuOpen}
        aria-label="Toggle navigation menu"
      >
        Menu
      </button>

      <aside className={`app-menu-panel ${menuOpen ? 'open' : ''}`}>
        <div className="app-brand">
          <h1>Red Suite</h1>
          <span className="app-brand-sub">EVE Utility Terminal</span>
        </div>
        <nav>
          <ul className="nav-links">
            <li>
              <NavLink to="/" end>
                Home
              </NavLink>
            </li>
            <li>
              <NavLink to="/eve-multisell">EVE Multisell</NavLink>
            </li>
            <li>
              <NavLink to="/eve-orders">EVE Orders</NavLink>
            </li>
          </ul>
        </nav>
      </aside>

      {menuOpen && <button type="button" className="app-menu-backdrop" onClick={() => setMenuOpen(false)} aria-label="Close navigation menu" />}

      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">Built by RedSquared · Powered by React + Vite</footer>
    </div>
  );
}
