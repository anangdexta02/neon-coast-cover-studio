// A working gta6-cover-art-01 entry (Node 22, standard library only): the app is this directory's app/ folder, plain
// static files a desktop browser loads offline (app/index.html and its ES modules, no library and no network
// request), and the program hands it in. It copies app/ and screenshots/ from beside this file to /output and writes
// /output/dossier.json, the summary the judge reads, with the vendored make.fun library. Only the plumbing, not the
// cover art the bounty asks for: Cover Snap, a plain one-photo square cover with a sunset tint and a bold caption,
// exported as a 1080 x 1080 PNG. Its two sample photos (app/samples/) were made for make.fun with an image model and
// are free to use. Build your own GTA-style cover maker in its place, put your 3 or 4 PNG or JPEG screenshots in
// screenshots/ (the first by name is the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';
import { readdirSync, statSync } from 'node:fs';

// Neon Coast — Cover Studio: this entry hands in a browser cover-art maker
// for the original game "Neon Coast: Sunset Shores" — a nine-panel collage
// studio with colour grades, finishes and cover lettering, built in place of
// the kit's plain Cover Snap plumbing described above.
const STUDIO_NAME = 'Neon Coast — Cover Studio';
const MIN_SCREENSHOT_BYTES = 8192;

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in app/ or 48 MiB of app
// files, in all, or a path under app/ over 1000 bytes: app/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  }),
);

// Studio self-check: the dossier is only worth handing in if the cover
// screenshots actually came along and are real renders, not empty stubs.
// Fail loudly here rather than let a hollow entry reach the judge.
const shotDir = join(out, 'screenshots');
const shotFiles = existsSync(shotDir)
  ? readdirSync(shotDir).filter((name) => /\.(png|jpe?g)$/i.test(name)).sort()
  : [];
if (shotFiles.length === 0) {
  throw new Error(`${STUDIO_NAME}: no screenshots were copied to ${shotDir}`);
}
for (const name of shotFiles) {
  const { size } = statSync(join(shotDir, name));
  if (size < MIN_SCREENSHOT_BYTES) {
    throw new Error(`${STUDIO_NAME}: screenshot ${name} is only ${size} bytes — too small to be a real cover render`);
  }
}
console.log(`${STUDIO_NAME}: dossier written with ${shotFiles.length} screenshots (${shotFiles.join(', ')})`);
