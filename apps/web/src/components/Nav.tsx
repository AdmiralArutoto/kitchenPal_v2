import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LogoMark from './LogoMark';

const links = [
  { to: '/home', label: 'Recipes' },
  { to: '/catalog', label: 'Collections' },
  { to: '/about', label: 'About' },
];

export default function Nav() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    navigate('/', { replace: true });
  }

  return (
    <header className="border-b border-black/10 bg-bg-card">
      <div className="mx-auto flex h-[71px] w-full max-w-[1562px] items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <LogoMark size={32} />
          <span className="text-xl font-semibold text-text-default">KitchenPal</span>
        </div>
        <nav className="flex items-center gap-6">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `text-sm font-medium transition-colors ${
                  isActive ? 'text-text-default' : 'text-text-muted hover:text-text-default'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1 text-xs font-medium text-text-footer-muted hover:text-text-default"
            aria-label="Logout"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <g
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </g>
            </svg>
            Logout
          </button>
        </nav>
      </div>
    </header>
  );
}
