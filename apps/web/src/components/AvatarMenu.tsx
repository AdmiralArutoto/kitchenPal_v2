import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useProfile } from '../hooks/useProfile';

// Avatar button at the top-right of the nav. Opens a dropdown with Account / Settings / Log out
// (logout moved here from the nav bar). The avatar image lives in Supabase auth user_metadata, so it
// rides in the session — falls back to the user's initial when none is set.
export default function AvatarMenu() {
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const avatarUrl =
    typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null;
  const name = profile?.name?.trim() || null;
  const email = user?.email ?? null;
  const initial = (name?.[0] ?? email?.[0] ?? '?').toUpperCase();

  function go(path: string) {
    setOpen(false);
    navigate(path);
  }

  async function handleLogout() {
    setOpen(false);
    await signOut();
    navigate('/', { replace: true });
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full ring-1 ring-border-subtle transition-shadow hover:ring-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <AvatarImage avatarUrl={avatarUrl} initial={initial} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-xl border border-border-subtle bg-bg-card shadow-[0px_10px_7.5px_-1px_rgba(0,0,0,0.1),0px_4px_3px_-1px_rgba(0,0,0,0.1)]"
        >
          <div className="flex items-center gap-3 border-b border-border-subtle p-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full">
              <AvatarImage avatarUrl={avatarUrl} initial={initial} />
            </span>
            <div className="flex min-w-0 flex-col">
              {name && (
                <span className="truncate text-sm font-semibold text-text-default">{name}</span>
              )}
              {email && <span className="truncate text-xs text-text-muted">{email}</span>}
            </div>
          </div>

          <div className="py-1">
            <MenuItem icon={<UserIcon />} label="Account" onClick={() => go('/account')} />
            <MenuItem icon={<GearIcon />} label="Settings" onClick={() => go('/settings')} />
          </div>

          <div className="border-t border-border-subtle py-1">
            <MenuItem icon={<LogoutIcon />} label="Log out" onClick={handleLogout} danger />
          </div>
        </div>
      )}
    </div>
  );
}

function AvatarImage({ avatarUrl, initial }: { avatarUrl: string | null; initial: string }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className="h-full w-full object-cover" />;
  }
  return (
    <span className="flex h-full w-full items-center justify-center bg-accent-soft text-sm font-semibold text-accent-text">
      {initial}
    </span>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-bg-toggle ${
        danger ? 'text-danger' : 'text-text-default'
      }`}
    >
      <span className={danger ? 'text-danger' : 'text-text-muted'}>{icon}</span>
      {label}
    </button>
  );
}

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
