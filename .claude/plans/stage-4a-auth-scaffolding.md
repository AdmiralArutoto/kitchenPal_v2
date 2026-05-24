# Stage 4a — Auth + Scaffolding

> First slice of Stage 4 of [SESSION_3_IMPLEMENTATION.md](SESSION_3_IMPLEMENTATION.md). Pass 4b (Nav + Footer + AuthedLayout + Pill + About) follows.

## Goal

End-to-end auth chain on a real Supabase project. A user can sign up, see the verify-email screen, click the inbox link, log in, and land on a bare `/home` placeholder. This pass also seeds the design system (color tokens in `@theme`, the atom set: Button/Input/Card/FormField/LogoMark/TabToggle/AuthCard) that Pass 4b and Stages 5-6 reuse.

## Prerequisites

- Stage 3 done (backend feature-complete, 36/36 tests).
- `.env` contains the four backend Supabase vars **plus** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (STARTUP.md item 1 / item 7).
- Figma MCP connected (STARTUP.md item 4) — verified by `get_design_context` on the login frame.

## Decisions baked in

- **Color tokens from the Figma export** (not eyeballed):
  - `--color-primary` `#ff6900`, `--color-primary-hover` `#e85d00`
  - `--color-bg-page` `#f9fafb`, `--color-bg-card` `#ffffff`
  - `--color-bg-input` `#f3f3f5`, `--color-bg-toggle` `#f3f4f6`
  - `--color-text-default` `#101828`, `--color-text-muted` `#4a5565`, `--color-text-placeholder` `#717182`
  - `--color-border-subtle` `#e5e7eb`
- **Inter font** loaded via Google Fonts `<link>` in `index.html`; `--default-font-family` overrides in `@theme`.
- **Decorative background** (scattered emoji + soft color blobs from the Figma) skipped — polish pass after MVP.
- **Food image** at `apps/web/public/auth-side.jpg` (downloaded from Figma asset). Fallback: the orange-to-red gradient alone if download fails.
- **Logo** at `apps/web/public/logo.svg` if assets combine cleanly; else inline SVG inside `LogoMark.tsx`.
- **React Router v6** via `createBrowserRouter`. Three routes for Pass 4a: `/`, `/verify-email`, `/home`.
- **Vite `envDir: '../..'`** reads root `.env`.
- **Logout temporarily on Home placeholder** — moves into `Nav` in Pass 4b.

## Token sketch (from `get_design_context` on 8:9513)

- Card: 1024×456px, two 512px halves, `rounded-[16px]`, shadow `0px 20px 25px -5px rgba(0,0,0,0.1), 0px 8px 10px -6px rgba(0,0,0,0.1)`.
- Form column: 48px inner padding, 416px content width.
- Logo: 40px circle, primary background.
- Heading: 30/36 Inter Semi Bold.
- Tagline: 16/24 Inter Regular, muted text.
- TabToggle: 44px tall container, 4px padding, 36px tabs, `rounded-[10px]`/`rounded-[8px]`, 14/20 Inter Medium.
- Input: 36px tall, `rounded-[8px]`, 12px h-pad, 14/20 Inter Regular, transparent border, `bg-input`.
- Primary button: 36px tall, `rounded-[8px]`, 14/20 Inter Medium, white text.
- Image side: `linear-gradient(138deg, #ff6900, #fb2c36)` under photo at 90% opacity, plus a `bg-gradient-to-t from-[rgba(245,73,0,0.4)] to-transparent` overlay.

## Dependencies added

- `apps/web` deps: `react-router-dom@^6.26.0`, `@supabase/supabase-js@^2.45.0`
- `apps/web` devDeps: `prettier-plugin-tailwindcss@^0.6.0`

## Files created

| Path | Purpose |
|---|---|
| `apps/web/public/logo.svg` | Cookpot icon (or inline-fallback in LogoMark) |
| `apps/web/public/auth-side.jpg` | Food photo for the auth card right column |
| `apps/web/src/lib/supabase.ts` | Browser Supabase Auth client |
| `apps/web/src/lib/api.ts` | `apiFetch<T>(path, init?)` — attaches JWT from current session |
| `apps/web/src/types/api.ts` | Hand-mirrored response types (Profile, Recipe, Draft) |
| `apps/web/src/contexts/AuthContext.tsx` | `AuthProvider` + `useAuth()` |
| `apps/web/src/components/Button.tsx` | Variants: primary/secondary/ghost; sizes sm/md |
| `apps/web/src/components/Input.tsx` | Input with `bg-bg-input`, no visible border |
| `apps/web/src/components/Card.tsx` | White rounded card with shadow |
| `apps/web/src/components/FormField.tsx` | Label + input wrapper |
| `apps/web/src/components/LogoMark.tsx` | Orange circle + cookpot icon |
| `apps/web/src/components/TabToggle.tsx` | Generic two-tab segmented control |
| `apps/web/src/components/AuthCard.tsx` | Two-column card shell with form + image |
| `apps/web/src/components/ProtectedRoute.tsx` | Router guard |
| `apps/web/src/routes/Auth.tsx` | Login/Signup screen |
| `apps/web/src/routes/VerifyEmail.tsx` | Check-your-email screen with resend |
| `apps/web/src/routes/Home.tsx` | Placeholder with temporary Logout button |

## Files modified

| Path | Change |
|---|---|
| `apps/web/index.html` | Add Inter Google Fonts `<link>` |
| `apps/web/src/index.css` | Replace smoke test with `@theme` token block |
| `apps/web/src/App.tsx` | Replace smoke test with router root + AuthProvider |
| `apps/web/src/components/index.ts` | Re-export all 8 new components |
| `apps/web/vite.config.ts` | `envDir: path.resolve(__dirname, '../..')` |
| `apps/web/package.json` | New deps |
| `.gitignore` | Add `.tmp-figma/` |

## Commands

```bash
npm install
npm run dev    # both servers; auth screen on http://localhost:5173
```

## Verification

1. `npm run build -w apps/web` — clean (TS + Vite).
2. `npm test` — 36/36 backend tests still pass.
3. Auth chain end-to-end against real Supabase: sign up → verify email → log in → `/home`. Cross-checks: hit `/home` unauth → `/`; refresh `/verify-email` once verified → `/home`.
4. No hex literals in JSX: `Grep "#[0-9a-fA-F]{6}" apps/web/src/components apps/web/src/routes` returns empty.
5. Component barrel exports all 8 new components.
6. Visual fidelity to login frame (8:9513) ~90% at desktop width.

## Deferred to Pass 4b

- Nav, Footer, AuthedLayout, Pill, real About route, `/catalog` placeholder.
- Decorative Auth-screen background.

## Notes for Pass 4b

- Color tokens locked in `index.css`. Pass 4b adds one new token: `--color-bg-footer` (`#0f172a` ≈ slate-900).
- Atoms (Button, Input, Card, FormField, LogoMark) are stable. Pass 4b builds Nav/Footer on top, doesn't recreate.
- Home placeholder has a temp Logout — Pass 4b moves Logout into Nav and reverts Home to a clean placeholder.
- `AuthedLayout` will wrap `/home`, `/catalog`, `/about` under a single layout route. Slot Pass 4a's standalone `/home` route into the new structure.

## Completion

When verification passes:
- CLAUDE.md Current State → "Stage 4a complete — auth chain shipped; Pass 4b next."
- New Architecture Decisions logged.
- Master plan's `[ ] Stage 4` stays unchecked until 4b lands.
