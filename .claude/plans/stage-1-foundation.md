# Stage 1 — Foundation

> Sub-plan for Stage 1 of [SESSION_3_IMPLEMENTATION.md](SESSION_3_IMPLEMENTATION.md). Read the master plan first.

## Goal

Replace the outdated `backend/` scaffold with the workspaces layout from the master plan. End the stage with both dev servers running and a Tailwind smoke test proving the toolchain works. Nothing app-specific yet — Prisma, Supabase, OpenAI, and Zod arrive in later stages.

## Prerequisites

From [STARTUP.md](../../STARTUP.md):

- **Required now:** Item 8 (Node 18+, npm 9+, Claude Code installed).
- **Not required yet:** Items 1-7. Stage 1 scaffolds only — no Supabase, no OpenAI, no Vercel, no Figma needed for this stage. `.env` doesn't need real values; `.env.example` is created with placeholders.

## Decisions baked in this stage

- **Tailwind v4** (current). Uses `@tailwindcss/vite` and CSS-based config — no `tailwind.config.ts`, no `postcss.config.js`.
- **`tsx`** for backend dev (faster cold reload than nodemon + ts-node).
- **ESLint v9 flat config** (`eslint.config.js`) at repo root.
- **Stage-1-only deps.** Each app's `package.json` lists only what Stage 1 needs. Stages 2-3 add Prisma, Supabase, OpenAI, Zod, pino, supertest as they wire them in.
- **Ports.** Backend `localhost:3001`, frontend `localhost:5173` (Vite default). Vite proxies `/api/*` → `http://localhost:3001`.
- **`npm` workspaces**, root orchestrates both packages.

## Files to delete

- `backend/` — entire directory. Outdated scaffolding from before the spec was finalized.

## Files to create

### Root

**`package.json`**
```json
{
  "name": "kitchenpal",
  "private": true,
  "workspaces": ["apps/*"],
  "scripts": {
    "dev": "concurrently -n api,web -c blue,magenta \"npm run dev -w apps/api\" \"npm run dev -w apps/web\"",
    "build": "npm run build -w apps/api && npm run build -w apps/web",
    "test": "npm run test -w apps/api && npm run test -w apps/web",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "concurrently": "^9.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0",
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0"
  }
}
```

**`tsconfig.base.json`** — strict mode, shared compiler options. Each app's `tsconfig.json` extends this.
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

**`eslint.config.js`** — flat config, TypeScript-aware, ignores `dist/` and `node_modules/`. Single root config covers both apps.

**`.prettierrc`** — `{ "semi": true, "singleQuote": true, "trailingComma": "all", "printWidth": 100 }` (or whatever house style — these are sensible defaults).

**`.env.example`** — every variable from SPEC §9 with placeholder values.
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
DATABASE_URL=postgresql://postgres.[ref]:[pw]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.[ref]:[pw]@aws-0-[region].pooler.supabase.com:5432/postgres?connection_limit=1
OPENAI_API_KEY=sk-...
```

**`.gitignore`** — replace current contents (the existing one is `backend/`-specific).
```
node_modules/
apps/*/node_modules/
dist/
apps/*/dist/
.env
.env.local
.vercel/
*.log
.DS_Store
Thumbs.db
```

**`README.md`** — minimal pointer (full README populated in Stage 7).
```
# KitchenPal

Personal recipe management app with an integrated AI layer.

- Setup prerequisites: [STARTUP.md](STARTUP.md)
- Product spec: [.claude/plans/SESSION_2_SPEC.md](.claude/plans/SESSION_2_SPEC.md)
- Implementation plan: [.claude/plans/SESSION_3_IMPLEMENTATION.md](.claude/plans/SESSION_3_IMPLEMENTATION.md)
- Living memory (decisions, errors): [CLAUDE.md](CLAUDE.md)

Local dev:
  npm install
  npm run dev
```

### `apps/api/`

**`apps/api/package.json`**
```json
{
  "name": "@kp/api",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/dev.ts",
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "express": "^5.0.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0"
  }
}
```

**`apps/api/tsconfig.json`**
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

**`apps/api/vitest.config.ts`** — minimal, inherits defaults.

**`apps/api/src/app.ts`** — Express factory.
```ts
import express from 'express';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}
```

**`apps/api/src/index.ts`** — Vercel handler entry (placeholder, not used in dev).
```ts
import { createApp } from './app.js';
export default createApp();
```

**`apps/api/src/dev.ts`** — local dev runner.
```ts
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3001);
createApp().listen(port, () => {
  console.log(`api listening on http://localhost:${port}`);
});
```

### `apps/web/`

**`apps/web/package.json`**
```json
{
  "name": "@kp/web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

**`apps/web/tsconfig.json`**
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src/**/*"]
}
```

**`apps/web/vite.config.ts`** — Vite + React + Tailwind v4 plugin + dev proxy to api.
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
```

**`apps/web/vitest.config.ts`** — minimal, jsdom env, inherits Vite config.

**`apps/web/index.html`** — standard Vite + React HTML shell mounting `#root`.

**`apps/web/src/index.css`** — Tailwind v4 entry.
```css
@import "tailwindcss";
```

**`apps/web/src/main.tsx`**
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

**`apps/web/src/App.tsx`** — smoke test proving Tailwind compiles.
```tsx
export default function App() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <h1 className="text-3xl font-semibold text-slate-800">
        KitchenPal — Stage 1 foundation ready
      </h1>
    </div>
  );
}
```

## Commands to run

```bash
# At repo root, after files are created
rm -rf backend
npm install
npm run dev
```

`npm install` will hoist deps to the root `node_modules/` and per-app `node_modules/` as workspaces dictate. `npm run dev` starts both servers via `concurrently`.

## Verification

1. **Install succeeds.** `npm install` exits 0. No peer-dep errors that block the build.
2. **`backend/` is gone.** `ls backend` fails.
3. **Backend health check.** `curl http://localhost:3001/api/health` returns `{ "ok": true }`.
4. **Frontend renders + Tailwind compiles.** Browser to `http://localhost:5173` shows the "Stage 1 foundation ready" message centered on a slate background. View the page source / DevTools and confirm the compiled CSS contains Tailwind utility classes (not raw `@import "tailwindcss"`).
5. **Vite proxy works.** From the dev server, hitting `http://localhost:5173/api/health` proxies through to the backend and returns the same JSON.
6. **Empty test suites pass.** `npm test` runs Vitest in both packages; both report "No tests found" and exit 0.
7. **TypeScript strict mode is on.** Editor shows red squiggles on a deliberate type error (verify by temporarily breaking a file, then reverting).

## Deferred to later stages

- **Prisma + schema.prisma + migrations** → Stage 2.
- **Supabase admin client, JWT verification middleware, profile upsert** → Stage 2.
- **`pino` / `pino-http` request logging** → Stage 2.
- **`zod`, `supertest`** → Stages 2-3 as needed.
- **OpenAI client** → Stage 3.
- **React Router, Supabase Auth client, AuthContext, ProtectedRoute, Nav** → Stage 4.
- **All app screens beyond the smoke-test page** → Stages 4-6.
- **Vercel project link + `vercel.json`** → Stage 7.

## Notes for the next agent (Stage 2)

- Backend uses ESM (`"type": "module"`) so imports use the `.js` extension even for TypeScript files (`import { createApp } from './app.js'`). Stage 2's Prisma client + middleware files must follow the same convention.
- Vite proxy is configured for `/api/*` only. If Stage 4 needs to call any non-`/api/*` path on the backend, extend the proxy config.
- Tailwind v4 reads config from CSS via `@theme` directive. If Stage 4 needs custom colors / spacing for Figma tokens, they go in `apps/web/src/index.css`, not a separate config file.
- ESLint flat config is at root. Stage 2 onward should add per-rule entries here, not create per-app eslint configs.

## Completion

When verification is green:
- Tick `[ ] Stage 1 — Foundation` in [SESSION_3_IMPLEMENTATION.md](SESSION_3_IMPLEMENTATION.md).
- Update CLAUDE.md Current State: `Last session: Session 8 — Stage 1 (Foundation)`, `Next action: Begin Stage 2 (Database & backend skeleton)`.
