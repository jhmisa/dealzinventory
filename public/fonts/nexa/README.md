# Nexa (logo typeface)

Nexa is a **commercial** font (Fontfabric) used for the Dealz logo wordmark/mark.
It is **not** loaded from Google Fonts — drop the licensed font files here so they
are served statically from `/fonts/nexa/...`.

Required files (filenames must match exactly; `.woff2` is enough, `.woff` optional):

| File | Weight | Used for |
|------|--------|----------|
| `nexa-bold.woff2` | 700 | logo (regular) |
| `nexa-heavy.woff2` | 800–900 | logo (extra bold — current default) |

The `@font-face` rules live in `src/index.css`; the type token is `--font-logo`.
Until these files are present, the logo automatically falls back to
**Bricolage Grotesque** (no errors, just a different look).

To convert `.otf`/`.ttf` → `.woff2`, use e.g. https://www.fontsquirrel.com/tools/webfont-generator
or `woff2_compress`.
