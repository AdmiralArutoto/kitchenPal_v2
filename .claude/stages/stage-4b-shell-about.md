# Stage 4b — App Shell + About

> Second slice of Stage 4 of [SESSION_3_IMPLEMENTATION.md](SESSION_3_IMPLEMENTATION.md). Pass 4a (Auth + scaffolding) is complete.

## Goal

Finish Stage 4. Build the persistent app shell (Nav + Footer + AuthedLayout), the Pill atom, and the real About route with profile read/write. Add `/catalog` as a placeholder so the Nav has a real target. End of pass: a logged-in user can browse Recipes / Collections / About in a consistent shell, view/edit their display name and dietary preferences, and log out.

## Prerequisites

- Pass 4a complete — auth chain, 8 atoms, color tokens, routes.
- Figma MCP connected — `get_design_context` on 8:8916 (about) gathered all nav + footer + about structure for this pass.

## Decisions baked in

- **6 new color tokens** added to `apps/web/src/index.css` `@theme`. All justified by Figma values that don't collapse to existing tokens.
- **Spec/Figma conflict — nav labels:** Figma uses "Recipes | Collections | About | Logout" instead of SPEC's "Home | Catalog | About" + user name. Going with Figma copy; route paths stay `/home`, `/catalog`, `/about` (just the link labels differ).
- **Spec/Figma conflict — About Save:** No global Save button. Display Name uses an inline Edit button (toggle to edit mode, Save inside that mode). Preferences add/remove fires `PUT /api/profile` per action.
- **Active-link styling:** active route → `text-text-default`. Inactive → `text-text-muted`. Logout → `text-text-footer-muted` + small SVG icon. The Figma frame shows the about page with "Recipes" highlighted — that's a Figma Make quirk, not the intended logic. Active state is route-bound.
- **`Card` gets a `variant` prop:** `shadow` (current default, used by AuthCard) | `bordered` (new, for About cards — 1px `border-border-subtle`, no shadow).
- **`Input` picks up disabled styles:** `disabled:bg-bg-page disabled:opacity-50 disabled:cursor-not-allowed`. Email field on About uses this.
- **AuthedLayout does not constrain width.** Each route sets its own max-width (About: `max-w-[896px]`; Home will pick its own in Stage 5).
- **Home placeholder loses the temporary Logout button** — Logout now lives in Nav. Home shrinks back to a clean "Stage 5 coming soon" stub.
- **Catalog placeholder** added: minimal stub inside AuthedLayout, real impl Stage 6.
- **Icons inline as SVG** with `currentColor` stroke/fill (Logout icon, user avatar icon, plus icon, × icon on Pill). No external icon library.

## Token additions

```css
@theme {
  /* ...existing tokens... */
  --color-bg-footer: #101828;
  --color-text-footer-muted: #99a1af;
  --color-accent-soft: #ffedd4;
  --color-pill-bg: #eceef2;
  --color-pill-text: #030213;
  --color-text-body: #364153;
}
```

## Files

### Created

| Path | Purpose |
|---|---|
| `apps/web/src/components/Nav.tsx` | White header bar, 71px tall. LogoMark `size={32}` + "KitchenPal" wordmark (left). Recipes / Collections / About `<NavLink>`s + Logout button (right). Active = `text-text-default`, inactive = `text-text-muted`. Logout calls `useAuth().signOut()` then navigates to `/`. |
| `apps/web/src/components/Footer.tsx` | Dark bar, 160px tall. Centered: LogoMark + white "KitchenPal", tagline, four placeholder links (href="#"). Uses `--color-bg-footer` and `--color-text-footer-muted`. |
| `apps/web/src/components/AuthedLayout.tsx` | `<><Nav /><main className="flex-1"><Outlet /></main><Footer /></>` inside `<div className="flex min-h-screen flex-col">`. No width constraint — routes set their own. |
| `apps/web/src/components/Pill.tsx` | Rounded-[8px] chip, `bg-pill-bg`, 12px Medium text in `text-pill-text`. Optional `onRemove?: () => void` renders × icon button on the right (16px round). |
| `apps/web/src/routes/Catalog.tsx` | Placeholder inside AuthedLayout, mirrors current Home placeholder shape. Stage 6 fills in. |

### Modified

| Path | Change |
|---|---|
| `apps/web/src/index.css` | Add the 6 new tokens to `@theme` |
| `apps/web/src/components/Card.tsx` | Add `variant: 'shadow' \| 'bordered'` prop (default `shadow`) |
| `apps/web/src/components/Input.tsx` | Add `disabled:bg-bg-page disabled:opacity-50 disabled:cursor-not-allowed` to className |
| `apps/web/src/components/index.ts` | Re-export Nav, Footer, AuthedLayout, Pill |
| `apps/web/src/routes/Home.tsx` | Remove the temporary Logout button + page wrapper — Home is now an inner content stub since AuthedLayout supplies Nav/Footer |
| `apps/web/src/routes/About.tsx` | **New file (was missing in 4a).** Full About impl per Figma 8:8916. Account Info card + About KitchenPal card. Reads `GET /api/profile` on mount; PUT on Edit save and per pill add/remove. |
| `apps/web/src/App.tsx` | Wrap protected routes in AuthedLayout layout route; add `/catalog` and `/about` routes |

### About route layout (notes for implementation)

`<main className="mx-auto w-full max-w-[896px] px-6 pt-12 pb-20 flex flex-col gap-8">`

**Account Info `<Card variant="bordered" padding="lg">`**
- Header row (with bottom border): `<div className="flex items-center gap-3 pb-4 border-b border-border-subtle/60">`
  - Avatar: 48px round circle, `bg-accent-soft`, with inline user-silhouette SVG (stroke `text-primary`)
  - `<h2 className="text-2xl font-semibold text-text-default">Account Info</h2>` + `<p className="text-sm text-text-muted">Manage your personal information</p>`
- Display Name row:
  - View mode: `<FormField label="Display Name">` with `<Input disabled value={name}>` and an `<Button variant="secondary" size="sm">Edit</Button>` next to the input
  - Edit mode (toggled): editable `<Input>` + Save + Cancel
  - On Save → `apiFetch<ProfileResponse>('/api/profile', { method: 'PUT', body: JSON.stringify({ name }) })`
- Email row: `<FormField label="Email" hint="Email cannot be changed">` with `<Input disabled value={email}>`
- Dietary Preferences row:
  - Label + description text
  - Pills wrap: `{preferences.map(p => <Pill key={p} onRemove={() => removePref(p)}>{p}</Pill>)}`
  - Add row: `<Input value={newPref} onChange...>` + `<Button variant="secondary" size="sm"><PlusIcon /> Add</Button>`
  - addPref / removePref → optimistic state update + `PUT /api/profile` with new preferences array; rollback on error

**About KitchenPal `<Card variant="bordered" padding="lg">`**
- `<h2 className="text-2xl font-semibold text-text-default pb-4 border-b border-border-subtle/60">About KitchenPal</h2>`
- Description paragraph: `<p className="text-base text-text-body"><b>KitchenPal</b> is your personal recipe management companion...</p>`
- Features: `<h3 className="text-lg font-semibold text-text-default">Features:</h3>` + `<ul className="pl-5 list-disc text-sm text-text-body space-y-1">` with 5 SPEC items
- Bottom section (with top border): Version / Purpose / Privacy lines (bold labels + regular values; Privacy in italic). Text color `text-text-muted`.

### Router shape after Pass 4b

```tsx
const router = createBrowserRouter([
  { path: '/', element: <Auth /> },
  { path: '/verify-email', element: <VerifyEmail /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AuthedLayout />,
        children: [
          { path: '/home', element: <Home /> },
          { path: '/catalog', element: <Catalog /> },
          { path: '/about', element: <About /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
```

## Commands

```bash
npm run dev    # both servers, expect Nav + Footer on every authed route
```

## Verification

1. `npm run build -w apps/web` — clean (TS + Vite).
2. `npm test` — backend still 36/36.
3. Visual fidelity to about frame (8:8916) at desktop:
   - Top nav present, white bg, logo + KitchenPal + 4 nav items
   - About link highlighted (text-default), others muted
   - Two stacked bordered cards (Account Info, About KitchenPal)
   - Dark footer with logo, tagline, 4 link placeholders
4. About read/write:
   - On load → Display Name + Email + preferences populate from `GET /api/profile`
   - Click Edit on Display Name → input becomes editable; type new name; Save → name persists across reload
   - Click × on a preference pill → pill removed; reload → still gone
   - Type a preference in input + Add → pill appears; reload → still there
5. Nav behavior:
   - Click Recipes/Collections/About → URL changes, active link highlights
   - Click Logout → returns to `/`
6. Hex-literal grep across `components/` and `routes/`: zero matches.
7. Mobile (375px): nav links wrap or stack acceptably; cards full-width with horizontal margin; footer text wraps.

## Deferred

- Real Home content → Stage 5.
- Real Catalog content (grid, search/sort/filter, modal, scaler, AI modifier, add recipe) → Stage 6.
- Toast on successful save (currently silent on success, error shown inline) → Stage 5 introduces Toast.
- Footer link content (About Us / Contact / Privacy / Terms targets) → out of MVP scope.
- Avatar / user display name in Nav — Figma omits it; SPEC mentioned it. Resolved by going Figma-only.

## Notes for Stage 5

- AuthedLayout is the page chrome — every Stage-5 + Stage-6 route mounts inside it.
- New token: introduce a `--color-recipe-card-tag` or similar if Stage 5/6 frames need it. So far we have a complete palette covering About; Home and Catalog frames may add 1-2 more tokens (mostly tag/badge colors).
- Pill is the canonical "tag chip" — Stage 5/6 will reuse it for recipe tags and the guided-flow pills.
- `apiFetch<T>` is the canonical request path. AbortController isn't wired yet; if Stage 5 needs to cancel in-flight requests (e.g. AI generation), extend `apiFetch` to accept a signal.

## Completion

When verification is green:
- Tick `[ ] Stage 4 — Frontend scaffold + auth + About` → `[x]` in [SESSION_3_IMPLEMENTATION.md](SESSION_3_IMPLEMENTATION.md) (now that 4a + 4b both landed).
- CLAUDE.md Current State → "Stage 4 complete — full auth + shell + About shipped. Stage 5 next."
- New Architecture Decisions: spec/Figma conflicts resolved Figma-way (logged); Card variants; new tokens table; AuthedLayout shape.
