import type { Response } from 'express';
import type { ImportStage } from '../schemas/import.js';

export type SseStream = {
  stage: (stage: ImportStage) => void;
  done: (payload: unknown) => void;
  error: (status: number, message: string) => void;
};

// Opens a Server-Sent Events stream on the response (chunked — no Content-Length). `stage` emits a
// progress event; `done`/`error` write a final event and end the stream. Once started the HTTP
// status is 200 and can't change, so failures are sent as an `error` event carrying the intended
// status for the client to act on (e.g. fall back to manual paste).
export function startSse(res: Response): SseStream {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable proxy buffering so events arrive incrementally
  });

  const write = (event: 'progress' | 'done' | 'error', data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  return {
    stage: (stage) => write('progress', { stage }),
    done: (payload) => {
      write('done', payload);
      res.end();
    },
    error: (status, message) => {
      write('error', { status, message });
      res.end();
    },
  };
}
