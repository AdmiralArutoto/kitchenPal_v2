import type { ReactNode } from 'react';
import LogoMark from './LogoMark';

type Props = {
  children: ReactNode;
};

// 1024x456 two-column shell from Figma frame 8:9529.
// Form column left, brand gradient + food photo right.
// Stacks vertically below md.
export default function AuthCard({ children }: Props) {
  return (
    <div className="grid w-full max-w-[1024px] grid-cols-1 overflow-hidden rounded-2xl bg-bg-card shadow-[0px_20px_25px_-5px_rgba(0,0,0,0.1),0px_8px_10px_-6px_rgba(0,0,0,0.1)] md:min-h-[530px] md:grid-cols-2">
      <div className="flex flex-col gap-7 p-12">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center justify-center gap-2">
            <LogoMark size={40} />
            <span className="text-3xl font-semibold leading-9 text-text-default">KitchenPal</span>
          </div>
          <p className="text-base text-text-muted">Your personal recipe companion</p>
        </div>
        {children}
      </div>
      <div className="relative hidden min-h-[456px] bg-[linear-gradient(138deg,var(--color-primary)_0%,var(--color-gradient-end)_100%)] md:block">
        <img
          src="/auth-side.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-90"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-primary/40 to-transparent" />
      </div>
    </div>
  );
}
