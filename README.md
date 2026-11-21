# Neon Coast — Cover Studio

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/anangdexta02/neon-coast-cover-studio/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard)
[![reward](https://make.fun/badge/gta6-cover-art-01/anangdexta02/neon-coast-cover-studio/reward.svg)](https://make.fun/bounty/gta6-cover-art-01)

A browser cover-art maker for **Neon Coast: Sunset Shores**, an original
sunset-noir driving game. Build a game cover the way the big studios do:
lay out a photo collage, grade it, finish it, and letter it — then export
a print-ready PNG.

## What it does

- **Eight collage layouts** — nine-up grid, hero + stack, duo, trio, quad,
  stack, strip and single — over a photo library of six AI-generated
  Sunset Shores photos (plus your own uploads, by file picker or drag & drop).
- **Seven colour grades** — Clean, Vice, Golden Hour, Neon Nights, Noir,
  Teal Heat and Faded Postcard — each a real per-pixel photographic
  pipeline (channel curves, saturation, duotone ink), applied per panel
  or globally, with per-panel overrides.
- **Panel editing** — click to select, then zoom, rotate, flip and nudge
  each photo inside its panel; cover-fit math guarantees rotated panels
  never show an empty corner.
- **Finishes** — duotone ink, seeded film grain, vignette, a luminance
  halftone pass and a cream gallery frame.
- **Cover lettering** — letterspaced banner, an auto-fitting Anton title
  (sunset / neon / gold / white fills), a Pacifico script subtitle, a
  0–5 heat-star rating, a rotated corner ribbon and a round 18+ badge.
- **Studio workflow** — undo/redo (60 steps, one per drag or edit),
  four canvas aspects, localStorage persistence for sample-only covers,
  and one-click PNG export at 1080×1080, 1080×1920, 1600×900 or 2400×2400.

Rendering is fully deterministic — the same state always paints the same
cover — which is how the screenshots in `screenshots/` were produced
(`?shot=cover` and `?shot=editor` scenes, see `shots.json`).

## Run it

```sh
node --experimental-strip-types serve.ts
```

then open <http://localhost:8080>. No build step and no network: the app
is plain static files (`app/index.html` and its ES modules) with the
display fonts vendored under `app/fonts/`.

To hand the entry in the way the grader does:

```sh
MAKEFUN_OUTPUT_DIR=out node --experimental-strip-types main.ts
```

which copies `app/` and `screenshots/` out and writes `dossier.json`,
after checking the screenshots are present and non-trivial.
