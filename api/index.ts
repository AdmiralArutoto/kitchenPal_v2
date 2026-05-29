// Vercel serverless entry. Re-exports the Express app (apps/api/src/index.ts already does
// `export default createApp()`, the Vercel Node handler contract). Imported from the built dist —
// `npm run vercel-build` runs before function bundling, so dist/ exists. Local dev uses
// apps/api/src/dev.ts instead; this file is only used by Vercel.
export { default } from '../apps/api/dist/index.js';
