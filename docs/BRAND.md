# Dealz Brand Guidelines

> Direction **04 · MONO — "Quiet confidence."** Derived from `docs/Dealz Design MD.zip`
> (board `04`) and implemented across the public marketing site (`src/pages/site`,
> `src/components/marketing`, `src/components/layout/site-*`).

## Positioning

The honest way to buy refurbished tech — watch it tested live, ask anything, buy with a
30-day warranty. Audience: foreigners living in Japan today; the Japanese market next, via
the kaitori (買取) buy-back business. Personality: **techy · modern · sharp** — confident,
precise, never gimmicky.

The system is **monochrome ink & paper + a single bold accent**. Restraint signals quality:
the brand says less, with a lot of room to breathe. The red accent never exceeds a small
signal (the logo dot, a `LIVE` badge, a headline full-stop).

---

## Palette

| Role | Name | Hex | Token |
|------|------|-----|-------|
| Base text / dark surfaces | Ink | `#16140F` | `--color-brand-ink` |
| Secondary text | Umber | `#4A463E` | `--color-brand-umber` |
| Muted / captions | Ash | `#A39E92` | `--color-brand-ash` |
| Page background | Paper | `#F3F1EC` | `--color-brand-paper` |
| **Accent (sparing)** | **Signal** | `#FF2D16` | `--color-brand-signal` |

Tailwind utilities: `bg-brand-paper`, `text-brand-ink`, `text-brand-signal`, etc.
Tokens are defined in `src/index.css` (`@theme`) and apply **only** to marketing/site
surfaces — the admin panel and shop keep the default shadcn theme.

---

## Typography — role-based

| Role | Family | Token / utility | Used for |
|------|--------|-----------------|----------|
| **Logo** | **Nexa** | `--font-logo` / `font-logo` | wordmark + `d.` mark **only** |
| Text | Sora | `--font-brand` / `font-brand` | titles, subtitles, body, buttons |
| Data | Space Mono | `--font-data` / `font-data` | captions, specs, prices, grades, labels |

- **Display/headings**: Sora, bold/extrabold, tight tracking (`-0.03` to `-0.045em`). Geometric and
  sharp — chosen over the curvier Bricolage Grotesque to fit the "techy · modern · sharp" personality.
- **Data voice**: Space Mono in UPPERCASE with wide tracking for labels (e.g. `GRADE A · 30-DAY WARRANTY`, `¥124,000`).

### Logo font: Nexa (self-hosted)

Nexa is a **commercial** font (Fontfabric) and is **not** loaded from Google Fonts. The
licensed files are served statically from `public/fonts/nexa/`:

| File | Weight |
|------|--------|
| `nexa-bold.woff2` | 700 |
| `nexa-heavy.woff2` | 800–900 (logo default) |

`@font-face` declarations live in `src/index.css`. See `public/fonts/nexa/README.md`.

**Interim fallback:** until the licensed Nexa files are added, the logo uses **Montserrat**
(loaded from Google Fonts) — the closest free geometric match to Nexa Heavy — then Sora.
Stack: `'Nexa', 'Montserrat', 'Sora', …`. Real Nexa takes precedence automatically once present.
Alternatives if a different feel is wanted: **Jost** (more circular) or **Outfit** (modern geometric).

Text/headings and the data voice are unchanged — **only the logo wordmark/mark use Nexa.**

Web fonts are loaded in `index.html`: Bricolage Grotesque + Space Mono (Google Fonts),
plus existing Inter / Noto Sans JP. Noto Sans JP also backs Japanese glyphs in the logo
fallback stack.

---

## Logo

- **Wordmark**: lowercase `dealz` followed by a single **red full-stop** (`.`). The accent
  never grows beyond the dot — discipline is the brand.
- **App-icon mark**: lowercase `d` with a red full-stop inside a rounded **ink** square
  (`rounded-[22%]`, paper `d`, signal-red dot).
- Components: `src/components/marketing/dealz-logo.tsx` (`<DealzWordmark>`, `<DealzMark>`).
  Use `invert` on dark (ink) surfaces.

---

## Usage notes

- Generous negative space; restraint over decoration.
- Red is reserved for tiny signals only (logo dot, `LIVE` badge outline, a headline period).
  Do not use red for broad fills or large areas.
- Implemented surfaces: landing (`/`), About, FAQ, Testimonials, Our Story, and Legal pages,
  all wrapped in `SiteLayout` (`src/components/layout/site-layout.tsx`).
