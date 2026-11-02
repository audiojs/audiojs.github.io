# audio.js.org

The audiojs website: home, modules (`modules/`), utilities (`util/`), lab articles (`lab/`), archive. Static files, no build step on the server.

## Deploy

- A push to `main` publishes https://audio.js.org within a minute (GitHub Pages, "Deploy from branch: main"). No workflow, no other repo involved.
- audiojs.dev and audiojs.org redirect to audio.js.org at Cloudflare, path kept.

## Develop

- `npm run dev` serves the site as audio.js.org does: this repo at `/`, a checkout of audiojs/audio beside it (`../audio`, or `AUDIO=path`) at `/audio/`, else the live site's `/audio/` (`scripts/serve.mjs`).

## Before pushing

- Utility pages and the site bar are generated: after editing `scripts/util-pages.mjs`, `scripts/pages/*`, `scripts/bar.mjs` or `bar.css`, run `npm run build`.
- Run `npm run test:all` (utilities in Chromium, Firefox, WebKit; pages; lab; home). Needs the network: packages load from esm.sh.
- The home and the lab embed the playground from `/audio/playground/`: a change that needs a newer playground goes live only once audiojs/audio has deployed it.

## Not in this repo

- The playground is audiojs/audio's own Pages, served at `/audio/` (deployed by that repo's CI). Link to it as `/audio/playground/`, embed it with `/audio/playground/embed.js`.
- The design system's tokens (`/audio/assets/tokens.css`) and the logo's mark (`/audio/logo/mark.js`) come from there too.
- GitHub serves the org's other Pages repos under this domain: `/audio/`, `/web-audio-api/`, `/docs/`, `/test/`, `/stretch/`, `/beat/`, `/shift/`, `/web-audio-write/`. Never create folders with those names here.

## Keep

- `playground.html`, `editor.html`, `embed.js` at the root: forward the playground's old addresses (shared `#code=` links, embeds on other sites) to `/audio/playground/`.
- `sw.js` at the root: removes the playground's old service worker from browsers that registered it here.
- `funding.json`, `.well-known/`: the funding manifest.
- `CNAME`: `audio.js.org`, exactly as GitHub wrote it.
- `archive/2026/`: frozen snapshots of the old audiojs.dev home and the old audio.js.org page. Don't edit.
- The footer's credit for `home/blackbird.mp3` (Diana Tudor, xeno-canto 1059970, CC BY 4.0, an excerpt), while the home plays it.

## Home

- `index.html` + `home/`: the playground embedded (`<audio-repl>`) on the blackbird. Its attributes name what it shows (`controls`), its quick edits (`ops`) and its ground (`background="page"`: the page's own colour, read off the page). Test: `npm run test:home`.
- `home/index.js`: the header's mark, drawn live by `/audio/logo/mark.js`, moving with the playground's `mark` events; the links' ticks; the install button.
- Colours, sizes and motion are the design system's tokens. Black and white; one font, Geist (code in the tokens' mono). JS after the word in outline, as tall as its x.
- Links show a row of ticks on hover (`home/index.css`): the one under the pointer swells to fill its 4 px, the others thin with distance.

## Modules

- `modules/index.html` is generated: `npm run modules` reads the latest audio package's README and registry (unpkg) and writes it. `modules/index.js` (search) and `modules/modules.css` are written by hand.
