import { Link } from 'react-router-dom';
import LogoMark from './LogoMark';

type FooterLink = { to: string; label: string };

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Product',
    links: [
      { to: '/home', label: 'Home' },
      { to: '/catalog', label: 'Catalog' },
    ],
  },
  {
    title: 'Company',
    links: [
      { to: '/about', label: 'About' },
      { to: '/contact', label: 'Contact' },
      { to: '/faq', label: 'FAQ' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { to: '/privacy', label: 'Privacy' },
      { to: '/terms', label: 'Terms' },
    ],
  },
];

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-bg-footer">
      <div className="mx-auto flex w-full max-w-[1148px] flex-col gap-8 px-6 py-8 md:flex-row md:items-start md:justify-between">
        {/* Brand + copyright */}
        <div className="flex flex-col gap-1.5">
          <Link to="/home" className="flex items-center gap-2">
            <LogoMark size={28} />
            <span className="text-lg font-semibold text-white">KitchenPal</span>
          </Link>
          <p className="text-sm text-text-footer-muted">
            Your destination for culinary inspiration.
          </p>
          <p className="text-xs text-text-footer-muted">
            © {year} KitchenPal. All rights reserved.
          </p>
        </div>

        {/* Link columns — grouped in a row on mobile; on md+ `contents` dissolves this wrapper so the
            columns become siblings of the brand and the row's justify-between spreads them evenly. */}
        <div className="flex flex-wrap gap-10 md:contents">
          {COLUMNS.map((col) => (
            <div key={col.title} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-white">
                {col.title}
              </h3>
              <ul className="flex flex-col gap-1.5">
                {col.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="text-sm text-text-footer-muted transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
