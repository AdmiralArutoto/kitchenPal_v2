import type { IncomingMessage, ServerResponse } from 'node:http';

// apps/api builds to ESM (apps/api/package.json has "type": "module"). This Vercel function is
// compiled as CommonJS (the repo root has no "type": "module"), so a static `import ... from` would
// become require() → ERR_REQUIRE_ESM at runtime. Load the built ESM Express app via dynamic
// import() (allowed from CommonJS), cache it across warm invocations, and resolve only once the
// response has finished so nothing is truncated. Local dev uses apps/api/src/dev.ts, not this file.
type NodeHandler = (req: IncomingMessage, res: ServerResponse) => void;

let appPromise: Promise<NodeHandler> | undefined;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!appPromise) {
    appPromise = import('../apps/api/dist/index.js').then(
      (m) => (m as { default: NodeHandler }).default,
    );
  }
  const app = await appPromise;
  await new Promise<void>((resolve) => {
    res.once('finish', resolve);
    res.once('close', resolve);
    app(req, res);
  });
}
