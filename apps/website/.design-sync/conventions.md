## Two token systems — prefer the brand one for anything new

This library ships from a real app mid-redesign, so it carries **two** color/type systems:

- **`claude-design.css` brand tokens** (CSS custom properties, defined on `:root`) — the current brand direction. **Use these for any new layout, section, or typography you build.**
  - Color: `--ink` (#112d4f, deepest navy — headings/dark sections), `--navy` (#1b3f71), `--blue` (#1c71af, primary), `--blue-600`/`--blue-300`/`--blue-100`/`--blue-50` (tints), `--gold` (#5aa5e3, accent), `--cream` (#fbf8f3, page background), `--paper` (#ffffff), `--text` (#243a57, body text), `--muted` (#61728a, secondary text), `--line`/`--line-soft` (hairline borders).
  - Shape: `--r-sm` (12px), `--r` (18px), `--r-lg` (26px), `--r-pill` (999px).
  - Shadow: `--sh-sm`, `--sh`, `--sh-lg`.
  - Type: `--display` (Bricolage Grotesque — headings), `--body` (Plus Jakarta Sans — body text), `--serif` (Newsreader — italic/quote accents).
  - Apply as `style={{ color: "var(--ink)" }}` or in a stylesheet, e.g. `.card { border-radius: var(--r); box-shadow: var(--sh); font-family: var(--display); }`.

- **Tailwind utility classes** — the idiom the *existing* components (`Button`, `Card`, `TextField`, etc.) are already built with, e.g. `bg-primary`, `text-navy`, `bg-neutral-light`, `rounded-2xl`, `text-large-semi`. `primary`/`navy`/`accent`/`neutral` here are a **legacy palette** (`tailwind.config.ts`), close to but not identical to the brand tokens above (`primary` ≈ `--blue`, `navy` ≈ `--ink`/`--navy`). **Don't rewrite the shipped components to the new tokens** — compose with them as-is via their props; only reach for Tailwind classes yourself when extending or wrapping them, matching their existing look.

## Setup

No provider/wrapper is required — none of these components read from React context. Mount directly:
```jsx
const { Button } = window.TenacityTutoring;
<Button variant="primary">Book a free trial</Button>
```

## Images and links

Components render from a bundle built for this design tool, not a live Next.js app — `next/image`/`next/link`/`next/head` were swapped for plain `<img>`/`<a>`/no-op equivalents. Props behave the same (`src`, `alt`, `fill`, legacy `layout="fill" objectFit=...`, `href`), there's just no real image optimization or client-side routing — expected in this context, not a bug to work around.

## Where the truth lives

`styles.css` (root) is the full token + utility closure — read it before styling anything new. Per-component docs: `components/<group>/<Name>/<Name>.prompt.md`. Real source: `components/<group>/<Name>/<Name>.jsx` (thin re-export; logic lives in the bundle).

## Example composition

```jsx
const { Card, TeamCard } = window.TenacityTutoring;
<div style={{ display: "flex", gap: 24, padding: 32, background: "var(--cream)" }}>
  <Card image="/photo.jpg" />
  <TeamCard
    name="Jordan Lee"
    jobTitle="Maths Tutor"
    imageSrc="/headshot.jpg"
    socialLinks={[{ url: "#", icon: <Instagram size="20" /> }]}
  />
</div>
```
