# Design-sync notes — Tenacity Tutoring

## Repo shape

This repo is a private Next.js app (`"private": true` in `package.json`), not a
publishable component-library package — no `dist/`, no `main`/`module`/`exports`
build output. The sync uses the converter's **synth-entry mode**
(`cfg.entry: "./dist/index.js"`, a deliberately nonexistent path — see below)
to build directly from `src/modules/common/components/` + `src/modules/common/icons/`
(`cfg.srcDir: "src/modules/common"`).

## `cfg.entry` must point at a path that does NOT exist

`resolveDistEntry` uses the entry path in two ways: (1) `dirname()` + walk-up
to find the package's real `package.json` (sets `PKG_DIR`) — this works even
if the path doesn't exist; (2) as the literal dist file to bundle — only if
the path *does* exist. In this repo's own source tree (no `node_modules/tenacitytutoring`),
skip both by pointing `--entry`/`cfg.entry` at a plausible-but-absent path
(`./dist/index.js`). That makes `PKG_DIR` resolve to the repo root (correct
`package.json`, name/version) while still falling through to the synth-from-src
path. Passing no `--entry` at all crashes instead (`PKG_DIR` defaults to
`node_modules/tenacitytutoring`, which doesn't exist → ts-morph `ENOENT` in
`dts.mjs`'s `projectFor`).

## Fork: `.design-sync/overrides/source-kit.mjs`

The stock synth-entry generator writes `export * from "<file>";` per source
file. ES module semantics: `export *` never forwards **default** exports.
Every component in this repo is `export default <Name>` (or
`export default function <Name>`), so the unforked converter produced a
bundle where **0 of 43 components** actually landed on `window.TenacityTutoring`
(`[BUNDLE_EXPORT] 43/43`). Fixed by also emitting
`export { default as <Name> } from "<file>";` per file when a
`export default <Identifier>` pattern is found. Declared in
`cfg.libOverrides`. **Re-check on re-sync**: if this repo's components ever
move to named exports, the fork's regex re-export becomes a no-op (harmless)
but could be removed.

## `next/image`, `next/link`, `next/head` shims

These components run standalone in the bundled preview (no Next.js
server/router), and the real `next/*` modules reference `process.env.*` /
`typeof process` at import time → `ReferenceError: process is not defined`,
crashing every component that (transitively) imports them before any content
painted. 12 of the 22 in-scope components import `next/image`, `next/link`,
or `next/head`.

Fixed via **path aliasing, not a bundle.mjs fork** (the skill explicitly says
not to fork `bundle.mjs`/`lib/emit.mjs`): `.design-sync/tsconfig.synth.json`
redirects `next/image` → `.design-sync/shims/next-image.tsx` (plain `<img>`,
same src/alt/fill/style contract), `next/link` → `next-link.tsx` (plain
`<a>`), `next/head` → `next-head.tsx` (no-op — the real component never
renders visible content either). `cfg.tsconfig` points at this synth file
instead of the repo's real `tsconfig.json` — it carries the real `@lib/@modules/@pages/@styles/@secrets`
path aliases too, so it's a superset, not a replacement.

**Gotcha**: `tsconfigPathsPlugin` strips `//`-style comments with a naive
regex before `JSON.parse`. A JSON key literally named `"//"` (meant as a
comment) gets mangled by that same regex mid-string and silently corrupts the
file → `JSON.parse` throws → caught → plugin returns `null` → **all** path
aliasing silently no-ops (not just the next/* shims — `@modules/*` etc. too,
though those still resolved by luck via esbuild's own automatic tsconfig
discovery of the *real* `tsconfig.json`). Keep `tsconfig.synth.json` free of
`"//"`-keyed comments; if annotation is needed, use a real top-of-file `//`
line, not a JSON key.

## Tokens / design language

This repo currently has **two different color/type systems**:
- `tailwind.config.ts` — legacy palette (`primary`/`navy`/`accent`/`neutral`),
  used by the existing Tailwind utility classes inside `common/components`
  (e.g. `bg-primary`, `rounded-xl`).
- `src/styles/claude-design.css` — newer brand tokens (`--ink`, `--blue`,
  `--gold`, `--cream`, radii, shadows; fonts Bricolage Grotesque / Plus
  Jakarta Sans / Newsreader via Google Fonts), used by a separate static-HTML
  redesign prototype under `src/modules/design/` (not synced — it's markup,
  not exported React components).

Per user direction, the sync's `cssEntry` is `.design-sync/generated/styles-entry.css`,
a concatenation of `claude-design.css` (tokens first) + compiled Tailwind
utilities (`bash .design-sync/build-styles.sh`, the `cfg.buildCmd`) — so the
existing components render correctly (they need the Tailwind utilities) while
the *design agent* sees `claude-design.css`'s tokens as the primary palette.
**The components' own Tailwind classes still reference the legacy palette,
not the newer tokens** — this sync does not restyle them. Anyone extending
these components to use the new brand tokens should do that in the app repo
directly, not via a design-sync override.

`--display`/`--body`/`--serif` in `claude-design.css` resolve to Google Fonts
(Bricolage Grotesque, Plus Jakarta Sans, Newsreader) loaded via a `<link>` tag
in `src/pages/_document.tsx`, not a CSS `@import` — the scraper can't see
that, so `cfg.runtimeFontPrefixes` lists those three families to suppress a
false `[FONT_MISSING]`.

`globals.css`'s `h1`–`h6 { font-family: "Massilia" }` rule has **no real
`@font-face`** anywhere in the codebase despite local font files existing
under `public/font/` — a pre-existing repo issue, not something this sync
introduced or fixed. `globals.css` is intentionally excluded from `cssEntry`
(only `claude-design.css` + compiled Tailwind are included), so this doesn't
surface as a sync warning.

## Known render warns (triaged, expected)

All 21 icon components (`src/modules/common/icons/*`) flagged `[RENDER_BLANK]`
or `[RENDER_THIN]` on their unauthored floor card — **verified false
positives**, confirmed by reading the actual screenshots
(`_screenshots/icons__*.png`): every icon renders correctly (visible arrow,
hamburger lines, "PREPIT" wordmark, Facebook glyph, etc.). The size heuristic
(`pngBytes < 5KB → likely blank`) trips on any small, sparse icon on an
otherwise-white card — nothing to fix. Confirmed-fine names: ArrowRight,
ArrowRightSmall, Calendar, ChevronDown, Clock, CustomizationIcon, DataDriven,
Email, Facebook, Gear, GearStar, Instagram, Linkedin, LocationPin,
MenuManagement, Phone, PrepitLogo, Profitable, Spinner, Whatsapp, X. Floor
cards for all 21 are correct per the user's chosen preview scope (rich
previews for the 22 real components only). Not scheduled for authoring
unless requested on a future re-sync — re-syncs should NOT treat these warns
as new.

5 of the 22 in-scope components rendered blank on their *unauthored* floor
card before preview authoring: CurvyButton, Hamburger, TextField,
UnderlineLink, VerticalLineLink. These are in the authored-preview batch (all
22 components are), so this resolved during §4 authoring — see the component
list below once authoring completes.

## Do NOT use `componentSrcMap` in this repo's synth mode

Tried pinning `componentSrcMap: {"CustomizationIcon": "src/modules/common/icons/customization.tsx"}`
to fix a cosmetic mis-grouping (`CustomizationIcon` lands under
`components/general/` instead of `components/icons/` because its filename
`customization.tsx` doesn't kebab-match the exported name
`CustomizationIcon` — the fuzzy src-finder's regex requires
`customization-icon.tsx` or `CustomizationIcon.tsx`). **This broke discovery
entirely** — `resolvePackage`'s fallback to `deriveComponentsFromSrc` (the
thing that finds all 43 default-exported components in this synth-only repo)
only fires when `names.length === 0` after the real-`.d.ts` scan + srcMap
merge. Since this repo has no real `.d.ts`, that scan starts empty — but
`componentSrcMap`'s non-null entries are unconditionally `names.add()`ed
*before* the empty-check, so a single pin makes `names.length === 1`,
skipping the full-source derivation and yielding **only that one pinned
component**. Reverted. `CustomizationIcon`'s mis-grouping under `general/`
is cosmetic and left as-is — don't try to fix it via `componentSrcMap` in
this repo without also patching (a fork of) `source-kit.mjs`'s fallback
condition.

## `guidelinesGlob` must be explicitly empty

The default `guidelinesGlob` (`docs/*.md` among others) matched this repo's
root `docs/` folder — but that directory holds **internal engineering docs**
(Firebase setup, deployment process, env var names — `docs/environment-variables.md`,
`docs/setup.md`, `docs/firebase-setup.md`, `docs/deployment.md`,
`docs/project-structure.md`, `docs/registration-flow.md`), not design
guidelines. Values in them are placeholders, not live secrets, but this
content is still the wrong material for a Claude Design project (irrelevant
to a design agent, and needlessly exposes internal architecture). Set
`cfg.guidelinesGlob: []` to suppress it. If real design guidelines are ever
added to this repo, point this at them explicitly rather than re-enabling
the default globs.

Same reasoning applies to `cfg.docsDir` (auto-detects `docs/` by default,
used for per-component doc matching) — pointed at a nonexistent path
(`.design-sync/no-docs`) so a future component named e.g. "Setup" or
"Deployment" can't accidentally slug-match one of those internal docs files
into its `.prompt.md`. This repo has no real per-component docs source.

## Authoring previews: import components via `/index`, not the bare alias

`@modules/common/components/<name>` is a directory (`<name>/index.tsx`). The
`tsconfigPathsPlugin` in `.ds-sync/lib/bundle.mjs` tries resolution
extensions in this order: `''` (bare path), `.ts`, `.tsx`, `.js`, `.jsx`,
`.mjs`, `/index.ts`, `/index.tsx`, ... . `existsSync()` on the bare path
returns **true for directories too**, so it matches on attempt 1 and never
reaches `/index.tsx` — esbuild then tries to read the directory as a file
and fails (`Cannot read file "...": is a directory`). Icons (bare
`icon-name.tsx` files, no directory) aren't affected — only components
under `<name>/index.tsx`. **Workaround**: in `.design-sync/previews/*.tsx`,
import components as `@modules/common/components/<name>/index` (explicit
`/index`), not the bare directory alias. This is a `bundle.mjs` bug, not
forkable per the skill's own rule (`bundle.mjs`/`lib/emit.mjs` define the
app-contract surface) — the explicit-`/index` import is the correct
workaround, not a hack.

## `next/image` shim needed the legacy API too

`TeamCard` uses the pre-v13 Next.js Image API (`layout="fill" objectFit="cover"`)
while other components use the modern API (`fill` boolean + `style`). The
first version of `.design-sync/shims/next-image.tsx` only handled the
modern form, so `TeamCard`'s photo rendered at natural (unfilled) size
instead of covering its container — confirmed visually (right half of the
card showed the raw `background-color:#000` through). Fixed by having the
shim treat `layout="fill"` as equivalent to `fill`, and mapping
`objectFit`/`objectPosition` through in both branches. If a future
component surfaces another legacy-prop combination the shim doesn't
translate, extend the shim rather than the source component.

## `TeamCard`'s name/title/social-links are hover-only — expected

`TeamCard`'s own CSS puts `.card-image` (the photo) at `z-index: 2`, fully
covering `.details` (name + job title, `z-index: 1`) in the card's bottom
120px, until `:hover` slides the photo up. `.social-icons` are `opacity: 0`
until `:hover` too. A static screenshot of the `Default` story therefore
only shows the photo — confirmed correct via direct DOM inspection
(`.card-wrapper` computed height is 500px, `.details` exists in the DOM
with the right name/title text, `.social-icons` exist with the right
`href`s). This is the component's real, intentional interaction design, not
a preview-authoring bug — graded `good` despite the screenshot not showing
the hover-revealed content, per the skill's guidance that hover/drag states
that can't render statically are expected limitations, not defects.

## Tailwind must scan `.design-sync/previews/` too

`tailwind.config.ts`'s `content` array only covers `src/**` — correct for
the real app, but this sync's `cssEntry` is built from that same compiled
CSS (`.design-sync/build-styles.sh`). Any Tailwind class used **only** in an
authored preview file (never in `src/`) was never scanned, so it shipped
with zero matching CSS rule and silently had no effect — e.g.
`EmblaCarouselSlide`'s preview used `h-[360px]` on its wrapper div, which
compiled to nothing, so `.embla`'s `height:100%` resolved against a
zero-height ancestor and the whole carousel rendered with `height:0` across
all cells (confirmed via direct DOM/computed-style inspection — width was
fine at 1232px, height was 0 on every element down to the `<img>`). Fixed
by adding `.design-sync/tailwind.sync.config.ts` — a wrapper config
(`require()`s the real `tailwind.config.ts` and spreads it) that adds
`./.design-sync/previews/**/*.{ts,tsx}` to `content`. Never edits the real
`tailwind.config.ts`. `build-styles.sh` now points `--config` at this
wrapper instead of the real config. **Any future preview using a Tailwind
class not already present somewhere in `src/` depends on this wrapper
picking it up** — if compiled CSS ever looks like a class "did nothing" in
a preview screenshot, check this first before assuming a component bug.

## `Head` needed a visible marker, `skip` doesn't help when ALL stories are non-visual

`Head` (wraps `next/head`, teleports `<title>`/`<meta>` into document head)
legitimately renders zero visible DOM in every story. `package-validate.mjs`'s
render check unconditionally fails `[RENDER] root empty` when a component's
whole grid root has no content — tried `cfg.overrides.Head.skip: ["Default",
"ProgramPage"]` first, but `skip` just excludes stories from the mounted
grid entirely, so skipping ALL of them still leaves the root empty (skip is
for a MIX of visual/non-visual stories on one component, not a component
that's non-visual everywhere). Fixed instead by having each `Head` story
render a small `<NoVisualOutputNote>` alongside the real (invisible) `<Head
.../>` mount — genuinely accurate ("this component sets metadata only, here
is what title it set"), not a fake visual. Reverted the `skip` override.

## `cardMode: "column"` for wide/full-bleed components

`Hero`, `InfiniteScrollCarousel`, and `Slider` all render content wider than
the product's default grid cell (banner-style / full-bleed layouts) and got
flagged `[GRID_OVERFLOW]`. Fixed via `cfg.overrides.<Name>: {"cardMode":
"column"}` for all three — full card width per story, nothing cropped. This
is a presentation-only fix (per the validator's own message, column mode
can't re-flag `wide` by construction) — didn't need a re-grade.

## Re-sync risks

- `.design-sync/generated/` (compiled Tailwind CSS + the combined
  `styles-entry.css`) is gitignored and rebuilt by `cfg.buildCmd`
  (`bash .design-sync/build-styles.sh`) — if `tailwind.config.ts` or
  `claude-design.css` change, re-run the build before re-syncing or the
  uploaded tokens will be stale relative to the repo.
- The `source-kit.mjs` fork's default-export regex
  (`export default (?:function |class )?<Identifier>`) assumes the existing
  one-default-export-per-file convention. A component switching to a named
  export, or a file with multiple default-like exports, needs re-checking
  against this regex.
- `.design-sync/shims/next-*.tsx` are hand-authored approximations of
  `next/image`/`next/link`/`next/head`'s prop contracts (based on this
  repo's actual usages, not the full Next.js API surface). A component
  added later that uses a `next/image`/`next/link` prop not covered here
  (e.g. `next/image`'s `loader` prop) will silently ignore it in the preview.
