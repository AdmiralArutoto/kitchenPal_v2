# KitchenPal — Import Feature Technical Specification

**Status:** Planning
**Depends on:** `SESSION_2_SPEC.md` (base architecture, auth, recipe model), `DEV_INFRA.md` (Vercel + Supabase + Prisma setup)

---

## 1. Overview

The Import feature lets users paste a URL from a recipe website, Instagram (Reels), TikTok, or YouTube (Shorts and standard videos) and have KitchenPal extract a structured recipe automatically. The extracted draft is presented for review and editing before being saved to the user's vault.

Import is the **headline AI feature** of the product. Generation and modification exist but are secondary.

The feature is built in phases, ordered by reliability and engineering cost:

- **Phase 1 (MVP):** Recipe website import — JSON-LD parsing with HTML-to-LLM fallback. Easiest path, most reliable extraction, ships first.
- **Phase 2 (MVP):** YouTube + TikTok URL paste — video pipeline with yt-dlp + Whisper + LLM.
- **Phase 3 (MVP):** Instagram support with caption-fallback for IP-blocked cases.
- **Phase 4 (post-MVP):** iOS share-sheet integration (PWA share target).
- **Phase 5 (post-MVP):** Vision-on-frames extraction for videos with on-screen ingredients only.

This spec covers Phases 1–3. Phases 4–5 are explicitly out of scope.

---

## 2. User Flow

### 2.1 Happy Path

1. User taps **+ Add Recipe** on the Catalog screen
2. Sees three intake options: **Import / Create / Generate** (in priority order)
3. Taps **Import**
4. Paste-a-link screen appears with input field and supported-source indicators
5. User pastes URL → taps **Extract recipe**
6. Progress UI updates in real time (number of stages depends on source type)
7. Draft recipe appears in the same view
   - Website import: ~2–5 seconds
   - Video import: ~10–25 seconds
8. Draft is fully editable — every field can be corrected
9. Original source URL + creator handle (if extracted) shown at the top
10. User taps **Save** → recipe lands in vault with `source: "imported"` and source attribution preserved

### 2.2 Manual Fallback

If automatic extraction fails (paywall, private video, IP-blocked Instagram, page returns no parseable content), the user is offered a fallback:

- Error message explains what happened
- A textarea appears: *"Paste the caption or recipe text and we'll extract from that"*
- User pastes text → AI extraction runs against text only (single LLM call, ~3s)
- Same draft-review-edit-save flow as the happy path

### 2.3 Cancellation

User can cancel at any point during extraction. The in-flight request is aborted. No partial recipe is saved.

---

## 3. Tech Stack Additions

| Component | Tool | Used for |
|---|---|---|
| HTML fetching + parsing | `cheerio` (Node) | Website import — parse HTML, extract JSON-LD or main content |
| Video/audio fetching | `yt-dlp` (Python CLI) | Downloads audio + metadata + captions from social platforms |
| Transcription | OpenAI Whisper API (`whisper-1`) | Converts audio to text when caption is insufficient |
| Extraction | OpenAI Chat Completions API (`gpt-4o-mini`) | Parses transcript / caption / HTML into structured recipe JSON |
| Python runtime on Vercel | Vercel Python serverless functions | Hosts the yt-dlp pipeline alongside the Node Express app |

### Why both Node and Python

Website import is pure Node — `fetch` + `cheerio` is all that's needed. Video import requires Python because `yt-dlp` has no reliable Node equivalent across all three social platforms. Vercel supports mixed-language deployments natively — `api/import-pipeline.py` runs as a separate serverless function and is called from the Node Express layer via internal HTTP, but only when the URL is a video source. Website URLs never invoke Python.

### Vercel Pro plan required (video only)

The website import path runs comfortably within hobby plan's 10s timeout. Only the video pipeline (download + transcribe + extract) requires Pro plan's 60s limit. **Phase 1 can ship on hobby.** Phase 2 onward requires Pro.

---

## 4. System Architecture

```
User pastes URL in React UI
  │
  ▼
POST /api/import (Node/Express, public)
  │
  ├── Verify JWT, extract user_id
  ├── Validate URL → classify source type → normalize
  │
  ├── If WEBSITE ──► Node-only path
  │                    ├── fetch HTML
  │                    ├── parse with cheerio
  │                    ├── try JSON-LD Recipe extraction first
  │                    └── if absent/incomplete → send cleaned text to OpenAI
  │
  └── If VIDEO ────► Internal call to /api/import-pipeline (Python)
                       ├── yt-dlp downloads audio + metadata + caption
                       ├── If audio present and useful → Whisper transcribes
                       └── Caption + transcript + metadata → OpenAI extraction
  │
  ▼
Returns structured recipe draft to client (via SSE)
  │
  ▼
User reviews and edits draft locally (no DB write yet)
  │
  ▼
User taps Save → POST /api/recipes (existing route)
  │
  └── Recipe saved via Prisma with source="imported"
        + source_url, source_platform, source_creator populated
```

The Python function is **internal-only** — it does not verify JWTs and trusts requests from the Node layer. Vercel's serverless functions can call each other within the same project without exposing them publicly. Website imports never invoke Python.

---

## 5. API Routes

### `POST /api/import`

Main entry point. Streams progress events via Server-Sent Events and returns the draft. Same endpoint for website and video URLs — branching happens internally based on URL classification.

**Request:**

```json
{
  "url": "https://www.example-blog.com/best-pasta-recipe/"
}
```

**Response (SSE stream):**

```
event: progress
data: { "stage": "fetching" }

event: progress
data: { "stage": "extracting" }

event: done
data: {
  "draft": { ...recipe object... },
  "source_url": "https://www.example-blog.com/best-pasta-recipe/",
  "source_platform": "website",
  "source_creator": "Jane Smith"
}
```

Response time:
- Website URLs: 2–5 seconds typical
- Video URLs: 10–25 seconds typical

Progress events fire for both paths to keep UX consistent.

**Failure modes:**

- `400` — invalid URL
- `422` — extraction succeeded but no recipe content detected (returns empty draft + warning event)
- `500` — pipeline error (fetch, yt-dlp, Whisper, or LLM)
- `504` — timeout (rare on Pro plan, but handle it explicitly)

### `POST /api/import/text`

Manual fallback. Receives raw text instead of a URL.

**Request:**

```json
{
  "text": "Pasted caption or recipe text",
  "source_url": "https://...",
  "source_platform": "instagram",
  "source_creator": "@handle"
}
```

`source_url`, `source_platform`, and `source_creator` are optional — the user may not always have them.

**Response:** same draft format as `/api/import`, but no progress streaming (single LLM call, ~3s, regular JSON response).

### `/api/import-pipeline` (Python, internal-only)

Not exposed publicly. Called only by the Node `/api/import` route, and only for video URLs. Handles yt-dlp + Whisper + LLM extraction. Returns JSON. Treats requests as trusted (no JWT verification — that already happened in Node).

**Request:**

```json
{
  "url": "https://...",
  "platform": "instagram"
}
```

**Response:**

```json
{
  "draft": { ...recipe... },
  "source_creator": "@handle",
  "raw": {
    "caption": "...",
    "transcript": "..."
  }
}
```

`raw` is preserved for debugging and is not exposed to the client.

---

## 6. Data Model Changes

Add three fields to the `Recipe` model in `schema.prisma`:

```prisma
model Recipe {
  // ... existing fields ...

  sourceUrl       String?  @map("source_url")
  sourcePlatform  String?  @map("source_platform")
  sourceCreator   String?  @map("source_creator")
}
```

`sourcePlatform` values (free-form text, convention only):
- `"website"`
- `"youtube"`
- `"tiktok"`
- `"instagram"`

The `source` field (existing free-form text column) values:
- `"manual"` (existing)
- `"ai_generated"` (existing)
- `"ai_modified"` (existing)
- `"imported"` (new — set for all import-route recipes regardless of platform)

All three new fields are nullable. Only imported recipes populate them.

**Migration:** `add_recipe_import_columns`

```bash
npx prisma migrate dev --name add_recipe_import_columns
```

---

## 7. Per-Source Implementation Notes

### Recipe websites (Phase 1 — highest reliability)

The dominant pattern across recipe blogs is **schema.org `Recipe` JSON-LD** embedded in the HTML head as a `<script type="application/ld+json">` element. When present, it contains a fully structured recipe — name, ingredients, instructions, cooking time, servings, sometimes nutrition. No AI extraction is needed for the basics.

**Extraction pipeline:**

1. `fetch(url)` to retrieve HTML
2. Parse with `cheerio` and find all `<script type="application/ld+json">` blocks
3. `JSON.parse` each block; look for objects with `@type === "Recipe"` (or `@graph` arrays containing such an object)
4. If found → transform the schema.org Recipe object directly into KitchenPal's schema
5. If not found OR JSON-LD is incomplete → fall back to LLM extraction on cleaned page text

**JSON-LD → KitchenPal schema mapping:**

| schema.org Recipe field | KitchenPal field |
|---|---|
| `name` | `name` |
| `description` | `description` |
| `recipeIngredient[]` (array of strings) | `ingredients[]` — strings parsed into `{name, amount, unit}` via a small LLM call or regex |
| `recipeInstructions[]` | `steps[]` |
| `totalTime` (ISO 8601 duration) | `cooking_time` (minutes) |
| `recipeYield` | `servings` |
| `keywords` / `recipeCategory` / `recipeCuisine` | `tags[]` |
| `author.name` | `source_creator` |

`recipeIngredient` is a string array like `["2 cups flour", "1 tsp salt"]`. A parse step extracts structured `{name, amount, unit}` objects — small dedicated LLM call (~500ms) or a regex pass for the common cases.

**HTML fallback (no JSON-LD):**

When JSON-LD is missing, `cheerio` strips `<nav>`, `<footer>`, `<script>`, `<style>`, and ad/aside elements, then extracts the main content (prefer `<article>` or `<main>`, fall back to the largest text block). The cleaned text is sent to the same OpenAI extraction prompt used for video transcripts.

**Edge cases:**

- Paywalled sites (NYT Cooking, etc.) → fetch returns minimal HTML → fall back to manual paste
- Cloudflare-protected sites → fetch may be blocked or return a challenge page → fall back to manual paste
- JS-rendered SPAs without server-rendered HTML → fall back to manual paste
- Sites that load JSON-LD dynamically after page render → fall back to HTML extraction or manual paste

No allowlist of recipe sites is maintained. Any URL not matching a known video platform is attempted as a website import. Failure is graceful.

### YouTube (Phase 2 — high reliability)

- `yt-dlp` extracts video, audio, title, description, and auto-generated transcripts when present
- Description usually contains structured ingredient lists for cooking channels
- Whisper invoked only if no transcript available (saves cost and time)
- Lowest failure rate of the video platforms — start video integration here

### TikTok (Phase 2 — medium reliability)

- `yt-dlp` works for most public videos
- TikTok captions are usually short — Whisper transcription is essential
- Format changes on TikTok's side break extraction occasionally; pin `yt-dlp` version and update on a regular cadence
- Creator handle extracted from URL path (`/@username/video/...`) or metadata

### Instagram (Phase 3 — lowest reliability)

- Aggressive anti-scraping, especially harsh on Vercel's IP ranges
- For MVP: attempt direct extraction; if it fails, automatically offer the manual-paste fallback
- Caption + comments usually contain the recipe text
- Long-term: consider residential proxy service if reliability matters more than cost — but accept flakiness for MVP

### URL normalization and classification

Before routing, the Node layer:

- Strips tracking parameters (`?igsh=...`, `?si=...`, `?utm_*`, `?fbclid=...`)
- Classifies source type:
  - Hosts `instagram.com`, `tiktok.com`, `youtube.com`, `youtu.be` → video pipeline
  - Anything else → website pipeline
- Rejects shortened links (`bit.ly`, `t.co`, etc.) — too easy to abuse
- Returns a `platform` identifier used downstream

---

## 8. AI Extraction Prompt Design

**Model:** `gpt-4o-mini` — fast, cheap, good enough for structured extraction
**Temperature:** `0` (deterministic)
**Response format:** `{ type: "json_object" }` (forces JSON output)
**Token limit:** ~1500 output tokens

The same prompt and schema are used across three input types:
- Video imports (caption + transcript)
- Website imports without JSON-LD (cleaned HTML text)
- Manual text paste (user-provided text)

For JSON-LD website imports, the main LLM call is bypassed entirely. Only the ingredient-string parser runs (a separate small call).

### System prompt

> You extract structured recipes from text. The text may be a video caption, a transcript, a web page's main content, or pasted recipe text. Return only valid JSON matching the provided schema. If no recipe content is present, return `{"empty": true}`. Preserve original ingredient measurements when stated. If a measurement is implied but not stated, return `null` for that field. Do not invent ingredients, steps, or measurements that are not in the source material.

### User prompt template

```
Source: <platform>
Creator: <handle if known, else "unknown">
Content:
<caption + transcript, or cleaned HTML text, or pasted text>

Extract a recipe from the above into this exact JSON schema:
{
  "name": "string",
  "description": "string (1-2 sentences)",
  "ingredients": [
    { "name": "string", "amount": number | null, "unit": "string" | null }
  ],
  "steps": ["string"],
  "tags": ["string"],
  "cooking_time": number | null,
  "servings": number | null,
  "emoji": "string (single emoji that fits the dish)"
}
```

### Empty-response handling

If the model returns `{"empty": true}`, the API returns HTTP 422 and the frontend shows:

> "We couldn't find a recipe in this content. Try the manual paste option or check the link is correct."

---

## 9. UI Screens

### 9.1 Import entry screen

Reached from **+ Add Recipe → Import**.

- Heading: *"Import a recipe"*
- Subhead: *"Paste a link from a recipe site, Instagram, TikTok, or YouTube"*
- Input field for URL (paste detection auto-focuses on mount)
- Source badges: 🌐 Web / IG / TT / YT
- Primary button: **Extract recipe** (disabled until a valid URL is entered)
- Secondary link: *"Or paste recipe text instead"* → manual fallback view

### 9.2 Extraction in progress

- Same view, input field locked
- Progress steps shown with current stage highlighted:
  - Website path: ◯ Fetching page → ◯ Extracting recipe
  - Video path: ◯ Fetching video → ◯ Transcribing audio → ◯ Extracting recipe
- Cancel button visible throughout
- On cancel: abort the in-flight `fetch`, return to entry screen

### 9.3 Draft review

- Replaces the progress UI in place (same screen, no navigation)
- Top: small source attribution strip — *"From Jane Smith on example-blog.com"* or *"From @creator on Instagram"* with link icon
- All recipe fields editable (same form components as the manual Create flow)
- Two buttons:
  - **Save** → `POST /api/recipes` with `source: "imported"` and source fields populated
  - **Discard** → close and return to Catalog
- Field-level edits update local state only; no API call until Save is pressed

### 9.4 Manual fallback view

- Single textarea: *"Paste the recipe text or caption here"*
- Optional URL field if user wants to keep the source link for reference
- **Extract recipe** button → `POST /api/import/text`
- Lands on the same Draft review screen on success

---

## 10. Progress & Streaming

The `/api/import` route uses Server-Sent Events to push progress updates. Stage count varies by source type.

**Website import event sequence:**

```
event: progress  data: { "stage": "fetching" }
event: progress  data: { "stage": "extracting" }   // only fires if LLM fallback is used
event: done      data: { "draft": {...}, ... }
```

If JSON-LD is found, the extracting stage may be skipped entirely (done fires immediately after fetching + parsing).

**Video import event sequence:**

```
event: progress  data: { "stage": "fetching" }
event: progress  data: { "stage": "transcribing" }
event: progress  data: { "stage": "extracting" }
event: done      data: { "draft": {...}, ... }
```

**Backend pattern (Express):**

```js
res.writeHead(200, {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive"
});

res.write(`event: progress\ndata: ${JSON.stringify({ stage: "fetching" })}\n\n`);
// ... pipeline work ...
res.write(`event: done\ndata: ${JSON.stringify({ draft, ... })}\n\n`);
res.end();
```

**Frontend pattern (React):**

Use `fetch` with a streaming response reader (EventSource doesn't support POST). Same SSE format works.

---

## 11. Error Handling

| Failure | UX | Recovery |
|---|---|---|
| Invalid URL | Inline error on input field | User corrects URL |
| Website returns 4xx/5xx | *"We couldn't reach this page"* + auto-offer manual paste | Falls back to text route |
| Website has no JSON-LD and no extractable content | *"We couldn't find a recipe on this page"* + auto-offer manual paste | Falls back to text route |
| Paywall / Cloudflare blocking | *"This site appears to be protected — paste the text instead"* | Falls back to text route |
| JSON-LD malformed / partial | Continue with whatever was parsed; flag missing fields in draft review | User edits |
| Video private / unavailable | *"We couldn't access this video"* + auto-offer manual paste | Falls back to text route |
| `yt-dlp` failed | *"Something went wrong fetching this video"* + auto-offer manual paste | Falls back to text route |
| Whisper failed | Continue with caption only; show small inline note in draft review | Save still works |
| LLM returned `{"empty": true}` | *"We couldn't find a recipe in this content"* | User edits manually or discards |
| Network timeout | *"Took too long — try again"* + retry button | User retries |
| User cancels | Abort in-flight request | Return to entry screen |

All errors include the original URL pre-filled if the user wants to retry.

---

## 12. Success Criteria

### Phase 1 (Recipe websites)

- [ ] User can paste a recipe blog URL and see a structured draft within 5 seconds when JSON-LD is present
- [ ] User can paste a recipe blog URL and see a structured draft within 8 seconds when JSON-LD is absent (HTML fallback path)
- [ ] JSON-LD `recipeIngredient` strings are parsed into structured `{name, amount, unit}` objects
- [ ] Paywall, Cloudflare-blocked, or JS-only sites fail gracefully and offer manual paste
- [ ] Saved recipes have `source_platform: "website"` and the original URL preserved
- [ ] Author name (where extractable) populates `source_creator`

### Phase 2 (YouTube + TikTok)

- [ ] User can paste a YouTube URL and see a structured draft within 25 seconds
- [ ] User can paste a TikTok URL and see a structured draft within 25 seconds
- [ ] Progress UI updates in real time as stages complete
- [ ] All fields in the draft are editable before saving
- [ ] Saved recipes appear in the Catalog with `source: "imported"` and source attribution visible on the detail view
- [ ] Manual paste fallback (`POST /api/import/text`) works end-to-end
- [ ] User can cancel an in-flight extraction

### Phase 3 (Instagram)

- [ ] Public Instagram Reels extract successfully in the majority of cases
- [ ] When automatic extraction fails on Instagram, the manual paste fallback is offered automatically without user action
- [ ] Source attribution (URL + creator handle) is preserved for imported recipes from all platforms

### Data integrity (all phases)

- [ ] `source_url`, `source_platform`, `source_creator` are populated correctly on imported recipes
- [ ] Ingredients are stored as numbers where measurements are stated (consistent with existing schema rules)
- [ ] `source` field set to `"imported"` for all import-route recipes
- [ ] No user can see another user's import drafts or saved recipes

---

## 13. Out of Scope

- iOS share-sheet integration (Phase 4, future spec)
- Vision-based extraction from video frames (Phase 5, future spec)
- Importing from Pinterest and Facebook (could come later)
- Bulk import (multiple URLs at once)
- Background processing / queue (synchronous pipeline only for MVP)
- Saving the original video to user storage
- Following creators or tracking new content from them
- Detecting and warning on duplicate imports (same URL already in vault)
- Bypassing paywalls or anti-bot protections
- Headless browser rendering for JS-only SPA recipe sites
- Maintaining a per-site adapter library (we rely on schema.org JSON-LD as the standard)

---

## 14. Open Questions

- **Vercel Pro timing.** $20/mo is required before Phase 2 ships to production. Phase 1 (websites) ships on hobby. Decide when Pro is acquired based on when Phase 2 is ready to test live.
- **`yt-dlp` maintenance cadence.** Platform changes break extraction every few weeks. Decide between pinning a version (stable, becomes stale) vs. always-latest (current, occasionally broken). Recommendation: pin and update monthly.
- **Whisper costs.** ~$0.006/min of audio. Negligible at MVP scale, worth a budget monitor if volume grows.
- **Ingredient string parsing approach for JSON-LD.** Small dedicated LLM call vs. regex-based parser. LLM is more accurate but adds ~500ms and a small cost. Regex is free and instant but handles the long tail poorly. Recommendation: start with regex for common patterns (`"2 cups flour"`, `"1/2 tsp salt"`), fall back to LLM for anything regex can't parse.
- **Rate limiting per user.** Not needed for MVP, but flag for monitoring once usage data exists.
- **Vendor fallback for video extraction.** If `yt-dlp` + Python on Vercel proves unreliable, options include cobalt.tools API or RapidAPI social-media downloaders. Evaluate after Phase 2 has run in production for ~2 weeks.
