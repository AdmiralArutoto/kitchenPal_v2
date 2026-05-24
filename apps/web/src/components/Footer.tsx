import LogoMark from './LogoMark';

const links = ['About Us', 'Contact', 'Privacy', 'Terms'];

export default function Footer() {
  return (
    <footer className="bg-bg-footer">
      <div className="mx-auto flex h-[160px] w-full max-w-[1024px] flex-col items-center justify-center gap-3 px-6">
        <div className="flex items-center gap-2">
          <LogoMark size={32} />
          <span className="text-xl font-semibold text-white">KitchenPal</span>
        </div>
        <p className="text-base text-text-footer-muted">
          Your destination for culinary inspiration
        </p>
        <ul className="flex items-center gap-8">
          {links.map((label) => (
            <li key={label}>
              <a
                href="#"
                className="text-base font-medium text-text-footer-muted hover:text-white"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
