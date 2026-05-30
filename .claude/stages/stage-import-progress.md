# Stage — Real Import Progress (SSE + polled stages)

**Status:** Shipped on `dev` (commit `92f9ffc`). Backend 100/100 tests green; api `tsc` + web build clean.
**Feature spec:** [.claude/plans/IMPORT_FEATURE_SPEC.md](../plans/IMPORT_FEATURE_SPEC.md).

## Goal

Replace the **fake timed checklist** ("Fetching → Extracting" on a timer) with **real, server-driven
progress** — the client shows the actual stage the pipeline is in (reading structured data, reading
with AI, fetching transcript, generating transcript, extracting, scraping…).

## Approach (decided)

Real mid-process stages require a live transport — a single JSON response can't carry them. Two are
used, matched to each source's execution model:
- **SSE (streaming)** for the **synchronous** sources (website + YouTube) — they finish in <60s, so
  one open request can stream stage events.
- **Polled stage** for **Instagram/TikTok** — they're already async (Apify holds the run; we poll),
  so the poll reports a real *coarse* stage. We don't open a long-lived SSE over Apify's 20–60s run
  (that would re-introduce the 60s-cap risk the async design avoids).

Paste/screenshot stay a simple busy button (out of scope).

## Stage vocabulary (`ImportStage`)

`fetching` · `reading-structured` · `ai-extracting` · `parsing-ingredients` · `fetching-transcript` ·
`transcribing` · `extracting` · `queued` · `scraping`

Real per-source sequences:
- **Website:** `fetching` → (`reading-structured` *JSON-LD* | `ai-extracting` *HTML fallback*) → `parsing-ingredients` (ingredient LLM) → done
- **YouTube:** `fetching-transcript` → `transcribing` (only on Supadata 202/AI-gen) → `extracting` → done
- **IG/TikTok (poll):** `queued`/`scraping` (Apify running) → `extracting` (cascade) → done

The client renders the stages as they arrive (latest = spinner, earlier = check) via a `stage→label` map.

## What was built

**Backend**
- `apps/api/src/lib/sse.ts` (new) — `startSse(res)` writes `event: progress|done|error` (chunked, no
  Content-Length, `X-Accel-Buffering: no`). Once the stream opens the status is 200, so failures are
  an `error` event carrying the intended status.
- `schemas/import.ts` — `ImportStage` union; `finalize?: boolean` on `ImportPollRequestSchema`.
- Extraction fns take an optional `onStage?: (s: ImportStage) => void` (default noop, so the social
  cascade's reuse of `extractFromWebsite` is unaffected): `lib/import/website.ts` and
  `lib/import/video.ts` emit at the real branches; `lib/supadata.ts` `fetchTranscript(url, onTranscribing?)`
  fires when it hits the 202 (AI-generate) path.
- `routes/import.ts`:
  - `POST /api/import` — website/YouTube → `startSse` + run the extractor with `onStage: sse.stage`,
    `sse.done(...)`/`sse.error(status,msg)` in try/catch. IG/TikTok unchanged (JSON `202 pending`).
    (Invalid-URL/shortener 400s still throw *before* the stream opens → normal JSON 400.)
  - `POST /api/import/poll` — `READY→queued`, `RUNNING→scraping`, `SUCCEEDED→{pending, stage:'extracting'}`
    (does NOT run the cascade); a `finalize:true` poll runs `getDatasetItems` + `runSocialCascade` → done.
    Stateless (no server-side job store).

**Frontend**
- `lib/api.ts` — extracted `authedFetch` (JWT + JSON headers → raw `Response`); `apiFetch` now wraps it.
- `lib/import.ts` — `importFromUrl(url, { onStage, signal })` branches on `Content-Type`: `text/event-stream`
  → a small SSE reader (`getReader()` + parse `event:`/`data:`) that fires `onStage`, resolves on `done`,
  throws `ApiError` on `error`; JSON → pre-stream error or the pending union. `pollImport(job, { finalize, signal })`.
- `types/api.ts` — `ImportStage`; `stage` on the pending poll result.
- `components/ImportModal.tsx` — `stages` state; `runUrlExtract` passes `onStage: pushStage`, and the
  IG/TikTok poll loop sets `finalize:true` once it sees `extracting`. `ExtractProgress` rewritten to
  render the real `stages` (timer removed). Cancel (AbortController) aborts the SSE read / poll loop.

## Decisions / tradeoffs

- **SSE errors are events, not HTTP statuses** — the stream is already 200, so the `error` event
  carries `{status, message}`; the client throws `ApiError(status, message)` to preserve the existing
  400-inline-vs-422-fallback behavior.
- **IG/TikTok `finalize` flag** — lets the poll surface a real `extracting` stage *before* the (long)
  cascade request, statelessly (no job store). The client sets `finalize:true` on the next poll after
  it sees `extracting`.
- **Coarse for IG/TikTok** — cascade sub-stages (comments vs transcript) are NOT streamed; that would
  require streaming the cascade phase. Agreed tier.

## Tests — `apps/api/src/tests/import.test.ts`

Website + YouTube route tests converted to assert the **SSE stream** (`parseSse`/`sseStages`/`sseDone`/
`sseError` helpers + `.buffer(true)`): expected stages present, `done` draft, and error cases now
assert an `error` event with the right status (200 stream, not an HTTP 4xx/5xx). Poll tests: `scraping`
while RUNNING, `extracting` on SUCCEEDED (cascade NOT run), `finalize:true` runs the cascade. 100 green.

## Verification

1. `npm run build` (api `tsc` + web) + `npm test` green.
2. Local `npm run dev`: import a JSON-LD site (`fetching → reading-structured → parsing-ingredients`),
   a no-JSON-LD site (`ai-extracting`), a YouTube video (`fetching-transcript → extracting`), and an
   IG/TikTok (`scraping → extracting → done`). Confirm Cancel aborts mid-stage.
3. **Vercel SSE buffering — the open risk.** Streaming works locally; on the preview, confirm
   `progress` events arrive **incrementally** (not all at once at the end). If buffered: verify no
   compression sits in front and that `X-Accel-Buffering: no` + chunked is honored.

## Follow-ups / out of scope
- Granular IG/TikTok cascade sub-stages (would stream the cascade phase).
- SSE for paste/screenshot.
