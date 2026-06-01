import { Link, NavLink } from 'react-router-dom';
import { useAddRecipe } from '../contexts/AddRecipeContext';
import LogoMark from './LogoMark';
import Button from './Button';
import AvatarMenu from './AvatarMenu';

const links = [
  { to: '/home', label: 'Home' },
  { to: '/catalog', label: 'Catalog' },
  { to: '/cookmode', label: 'Cook Mode' },
];

export default function Nav() {
  const { openAddRecipe } = useAddRecipe();

  return (
    <header className="border-b border-black/10 bg-bg-card">
      {/* Sheet is max-w-[1100px] with no padding; +48 (= 2×px-6) lands the logo/actions on its edges. */}
      <div className="relative mx-auto flex h-[71px] w-full max-w-[1148px] items-center justify-between px-6">
        {/* Logo — left, routes to Home */}
        <Link
          to="/home"
          aria-label="KitchenPal home"
          className="flex items-center gap-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <LogoMark size={32} />
          <span className="text-xl font-semibold text-text-default">KitchenPal</span>
        </Link>

        {/* Links — in normal flow on mobile (stay visible), absolutely centered on md+ so they
            don't shift with the side widths */}
        <nav className="flex items-center gap-4 md:absolute md:left-1/2 md:-translate-x-1/2 md:gap-8">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `text-sm font-medium transition-colors ${
                  isActive ? 'text-primary' : 'text-text-muted hover:text-text-default'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        {/* Actions — right */}
        <div className="flex items-center gap-3">
          <Button type="button" onClick={openAddRecipe} aria-label="Add Recipe">
            <PlusIcon />
            <span className="ml-2 hidden sm:inline">Add Recipe</span>
          </Button>
          <AvatarMenu />
        </div>
      </div>
    </header>
  );
}

function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
