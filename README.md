# ANTEROOM — Meetings & Events audience site

Marketing site for ANTEROOM, a film studio for the hotel industry. Exported from Claude Design and restructured as a static site for Vercel. No backend.

## Routes

| Route | File | Notes |
|---|---|---|
| `/` | `index.html` | Meetings & Events audience page — the hub |
| `/audiences` | `audiences.html` | The eight audiences |
| `/process` | `process.html` | Eleven-stage production process |
| `/languages` | `languages.html` | Language and localisation |
| `/pricing` | `pricing.html` | Three published tiers |
| `/studio` | `studio.html` | About the studio |
| `/start-a-brief` | `start-a-brief.html` | Primary CTA destination |
| `/send-one-photograph` | `send-one-photograph.html` | Secondary CTA destination |

Clean URLs are handled by `cleanUrls: true` in `vercel.json` — no build step, Vercel serves the files directly.

## How the pages render

These are Claude Design `.dc` documents. Each page is a `<x-dc>` template plus a `DCLogic` class, rendered at runtime by `support.js`, which pulls React 18.3.1, ReactDOM and Babel standalone from unpkg. `image-slot.js` powers the user-fillable image placeholders; their crop state lives in `.image-slots.state.json` next to the pages.

Two consequences worth knowing:

Rendering is entirely client-side, so crawlers that do not execute JavaScript see an empty shell. Fine for a soft launch, worth fixing before the site carries real search or paid traffic — the fix is a build-time prerender that snapshots each page's rendered DOM to static HTML.

The runtime fetches roughly 1.5 MB from unpkg before first paint, most of it Babel. Self-hosting those three files, or precompiling, removes both the weight and the third-party dependency.

## The forms do not send anything

`/start-a-brief` and `/send-one-photograph` collect input and then set a local `sent` flag. Nothing is posted anywhere. A visitor completes the flow, sees a confirmation, and no record of them exists. The footer's promise that "a producer replies within one working day" cannot currently be kept.

Fixing this without adding a backend means pointing each form at a hosted form endpoint (Formspree, Web3Forms, or a Vercel serverless function) in the `send` handler.

## Local preview

```
python3 -m http.server 8000
```

Then open http://localhost:8000. Clean URLs will not resolve locally the way they do on Vercel; use `/pricing.html` when previewing this way.

## Not included

Six pages from the Claude Design project are deliberately left out of the deployment: `ANTEROOM.dc.html` (the earlier single-file version of the whole site), `ANTEROOM Meetings.dc.html` (superseded by v2, which is now `/`), `ANTEROOM Dial.dc.html` (links to two pages that do not exist in the project), `ANTEROOM Reel.dc.html`, `ANTEROOM The Day.dc.html`, and `ANTEROOM Palette.dc.html` (an internal colour reference). All six remain in the original export at `../_extract/` if any should be brought back.

## Source

Claude Design project *Meetings & Events audience site*. Re-export and re-run the restructure if the design changes.
