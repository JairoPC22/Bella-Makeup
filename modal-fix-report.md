# Modal card fix — investigation and fix report

Date: 2026-09-16/17
Repo: `C:\Users\Jairo Peña\Downloads\BellaFront\BellaFront`

## Summary

The client was right: the modals were still genuinely broken, despite `Modal.css`
already containing what looked like a correct fix (`max-height: 90vh;
overflow-y: auto;` on `.modal`). That CSS was not the problem. The real bug was
one CSS property on a completely different, unrelated component:
`AppShell.css`.

## Investigation (live browser, before touching any code)

Backend (`localhost:4000/health`) and frontend (`localhost:5174`) dev servers were
already running and were reused. Logged in as `admin` / `BellaAdmin#2026` with
Playwright (already a project devDependency) and opened all four modals in the
app — there are exactly two modal-producing pages, each with a create and an
edit variant, both built on the shared `src/components/common/Modal.tsx`:

- Users → "Nuevo usuario" (`UserFormModal`, 7 fields: Nombre, Apellido, Nombre
  mostrado, Usuario, Correo, Contraseña, Rol)
- Users → "Editar" (same modal, edit mode, 6 fields — Contraseña hidden)
- Branches → "Nueva sucursal" (`BranchFormModal`, 5 fields)
- Branches → "Editar" (same modal, edit mode)

Screenshotted each at 1440x900, 1440x700, and 1280x720 → saved to
`.qa-screenshots-modal-fix/before/` (12 images).

### What was actually observed (before)

- `users-new-1440x900.png`, `users-new-1440x700.png`,
  `users-edit-1280x720.png`, etc.: the modal's **header (title + close
  button) and first field are completely missing/cut off above the visible
  area — even at the tallest tested viewport (1440x900)**. This is not a
  "long form doesn't fit a short viewport" problem; the modal was broken at
  every viewport size tested.
- `branches-new-1440x900.png`: by contrast, this modal (only 5 fields)
  rendered with its header visible and looked almost fine at this specific
  viewport — but the dark dimming backdrop clearly stops partway down the
  page (visible hard edge around y≈407, with plain page background below
  it instead of the dimmed overlay). The overlay was not covering the
  viewport, it was just close enough in this specific case that the modal
  card fit inside the truncated box anyway.

That inconsistency (Users modal badly clipped, Branches modal "mostly okay"
at the same code and same component) was the clue that the actual bug wasn't
in `Modal.css`'s sizing rules at all, but in how large a box the modal was
being confined to — a box that changed size depending on how tall the
underlying page's content happened to be.

### Root cause (confirmed via computed-style diagnostics, not guessed)

Used `page.evaluate()` to read `getBoundingClientRect()` and computed styles
for `.modal-overlay`, `.modal`, `.modal__header`, `.modal__body` live in the
browser. On the Users page at 1440x900, before any fix:

```
overlay.rect = { top: 101, bottom: 335, height: 234 }   // should be 0..900!
modal.rect   = { top: -99.5, bottom: 535.5, height: 635 }
```

`.modal-overlay` has `position: fixed; inset: 0`, which should make it cover
the entire viewport (0 to 900px tall). Instead it was confined to a 234px
box matching the height of the Users page's table content at that moment.

The cause: `src/components/layout/AppShell.css` line 5:

```css
.app-shell__page { animation: fade-in-up 0.45s var(--ease-premium) both; }
```

`fade-in-up` (`src/styles/global.css`) animates `transform: translateY(20px)
→ translateY(0)`. Because the animation uses `animation-fill-mode: both`,
the computed `transform` value on `.app-shell__page` **remains
`translateY(0)` forever after the animation finishes** (it never becomes
`none`). Per the CSS spec, any element with a non-`none` computed `transform`
becomes the **containing block for its `position: fixed` descendants**. Since
every page's content (including the modal, rendered inline as a child of the
page in the pre-fix code) lives inside `.app-shell__page`, the modal
overlay's `position: fixed; inset: 0` stopped being relative to the browser
viewport and instead became relative to that small, page-content-sized box —
which is why the overlay height (and therefore where the modal got
clipped) varied per page/route, and why the header + first field were
invisible above the confined box on the Users page.

This was introduced in commit `8fed555` ("premium login redesign + sitewide
animation/polish pass") — the same commit that added the `max-height`/
`overflow-y: auto` rules to `Modal.css` that an earlier pass presumably
pointed to as "the fix." That CSS was correct but never got a chance to work,
because the overlay it was sizing wasn't the viewport-sized box it was
supposed to be.

## The fix

### 1. `src/components/common/Modal.tsx`
Render the modal via a React portal to `document.body`
(`createPortal(..., document.body)`) instead of inline in the component
tree. This is the durable fix: it removes the modal from underneath
`.app-shell__page` (or any other ancestor that currently or in the future
gets a transform/animation/filter/`will-change`), so `position: fixed` is
always relative to the real viewport regardless of what animations exist
elsewhere in the app. Also added a small body-scroll-lock effect (`document
.body.style.overflow = "hidden"` while a modal is mounted) so the page
behind the modal can't scroll independently.

### 2. `src/components/common/Modal.css`
Restructured `.modal` into a column flexbox with a max-height budget and an
internally scrollable body, so long forms are never viewport-relative to
the wrong box again and also scroll gracefully at short viewports:

- `.modal-overlay` gets `padding: var(--space-4)` so the card never touches
  the viewport edge.
- `.modal` is `display:flex; flex-direction:column;
  max-height:calc(90vh - var(--space-4) * 2); overflow:hidden;` — the card
  itself no longer scrolls as a whole.
- `.modal__header` is `flex:0 0 auto` (pinned, non-shrinking) with its own
  padding and a `border-bottom` divider, so the title and close button stay
  visible at all times.
- `.modal__body` is `flex:1 1 auto; overflow-y:auto;` — this is the only
  scrollable region, so on a short viewport (e.g. 1440x700 with the
  7-field `UserFormModal`) the form scrolls internally while the header
  stays put and the "Guardar" button is always reachable by scrolling.
- Polish: the previously-unstyled `.user-form__error` (it had **no CSS rule
  anywhere in the codebase** — plain black text) and `.branch-form__error`
  are now styled as a proper pink error banner matching the premium error
  treatment from the login redesign (`rgba` tinted background, border,
  rounded corners, `color-pink-deep` text) instead of looking unfinished.
  Added a small `margin-top` on the submit button so it reads as
  intentionally grouped with the form above it rather than floating.

No changes were made to `tokens.css`, `RolesPage.css`, `BranchesPage.css`,
`src/pages/dashboard/`, `src/pages/products/`, or `src/pages/inventory/`,
per the constraints (another agent is working on those / they don't exist
as modals).

## Verification (after)

Re-ran the exact same Playwright script against all four modals at all
three viewports → `.qa-screenshots-modal-fix/after/` (13 images, including
one extra: `users-new-1440x700-scrolled-to-bottom.png`).

Live diagnostic re-check confirmed the overlay now correctly spans the full
viewport:

```
overlay.rect = { top: 0, bottom: 900, height: 900 }   // full 1440x900 viewport
modal.rect   = { top: 118, bottom: 782, height: 664 } // fully inside it
header.rect  = { top: 118, bottom: 185 }              // visible
```

Visual comparison, all 4 modals × 3 viewports:
- `users-new-*`, `users-edit-*`: header, all fields, and the Guardar button
  are now fully visible and centered at 1440x900 and 1280x720. At
  1440x700 the card is capped at 90vh and the last field/button are below
  the fold — but scrollable.
- `branches-new-*`, `branches-edit-*`: same — properly centered, dimmed
  backdrop now covers the entire viewport (not just part of it) at every
  size tested.

Explicit scroll-reachability check (worst case: `UserFormModal`, 1440x700 —
the shortest viewport with the most fields): scripted `modal__body.scrollTop
= scrollHeight` then re-measured the submit button's bounding rect:

```
Submit button after scroll: { top: 585, bottom: 617, viewportH: 700, fullyVisible: true }
Header after scroll:        { top: 84,  bottom: 108, text: "Nuevo usuario" }
```

Confirms: header stays pinned and visible, and the Guardar button becomes
fully visible once scrolled — see
`.qa-screenshots-modal-fix/after/users-new-1440x700-scrolled-to-bottom.png`.

### Screenshot index
- Before: `BellaFront/.qa-screenshots-modal-fix/before/{users-new,users-edit,branches-new,branches-edit}-{1440x900,1440x700,1280x720}.png`
- After: `BellaFront/.qa-screenshots-modal-fix/after/` — same 12 filenames, plus `users-new-1440x700-scrolled-to-bottom.png`

## `tsc` output

```
npx tsc -p tsconfig.app.json --noEmit
```
Zero errors (no output).

## Concerns

- At the shortest tested viewport (1440x700), the 7-field `UserFormModal`
  card is intentionally capped at ~90vh and requires scrolling to reach the
  submit button — this is expected/correct behavior for a form that long on
  a short viewport, not a bug, but worth knowing it's scroll-not-fit at that
  size.
- The root cause (`animation ... both` on an ancestor breaking descendant
  `position: fixed`) is a general footgun that could resurface anywhere else
  in the app that combines `position: fixed` overlays with animated
  ancestors (e.g. any future dropdown/tooltip/toast implemented with
  `position: fixed` instead of a portal). The portal fix in `Modal.tsx`
  makes the modal itself immune, but this is worth keeping in mind for other
  fixed-position UI added later by other workstreams.
- Left the throwaway Playwright capture/diagnostic scripts out of the
  screenshots folder (deleted after use); only the PNGs remain under
  `.qa-screenshots-modal-fix/`.
