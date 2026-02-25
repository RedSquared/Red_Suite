import { NavLink, Outlet } from 'react-router-dom';

export default function AppLayout() {
  return (
    <div className="app-shell">
      <header className="app-header">
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
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">Built by RedSquared · Powered by React + Vite</footer>
    </div>
  );
}
