---
name: Glint
colors:
  background: '#0d0d0f'
  on-background: '#f2f2f0'
  surface: '#0d0d0f'
  surface-dim: '#0a0a0c'
  surface-bright: '#24242a'
  surface-container-lowest: '#0a0a0c'
  surface-container-low: '#121214'
  surface-container: '#151518'
  surface-container-high: '#1c1c20'
  surface-container-highest: '#24242a'
  on-surface: '#ecedf1'
  on-surface-variant: '#9a9ca8'
  outline: '#8a8d99'
  outline-variant: '#2a2a2f'
  inverse-surface: '#f4f4f3'
  inverse-on-surface: '#15161a'
  surface-tint: '#f2a93b'
  primary: '#f2a93b'
  on-primary: '#141416'
  primary-container: '#c47a14'
  on-primary-container: '#141416'
  inverse-primary: '#c47a14'
  secondary: '#e8913a'
  on-secondary: '#141416'
  tertiary: '#e8613a'
  on-tertiary: '#141416'
  success: '#34d399'
  error: '#f87171'
  on-error: '#141416'
typography:
  display-lg:
    fontFamily: Funnel Display
    fontSize: 80px
    fontWeight: '600'
    lineHeight: 82px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Funnel Display
    fontSize: 56px
    fontWeight: '600'
    lineHeight: 58px
    letterSpacing: -0.025em
  title-md:
    fontFamily: Funnel Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.025em
  body-lg:
    fontFamily: Funnel Sans
    fontSize: 19px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Funnel Sans
    fontSize: 15.5px
    fontWeight: '400'
    lineHeight: 23px
  ui-md:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: -0.1px
  ui-label:
    fontFamily: Geist
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 1.2px
  mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
rounded:
  sm: 6px
  md: 10px
  lg: 14px
  full: 999px
spacing:
  unit: 4px
  control-gap: 14px
  panel-padding: 20px
  card-gap: 16px
  page-gutter: clamp(20px, 5vw, 64px)
  section: clamp(72px, 10vw, 128px)
  max-width: 1200px
---

# Design System: Glint

Extracted from source on 2026-11-19: `src/styles.css` (the editor),
`public/site.css` (the marketing site) and `src/share/viewer.css` (share pages).
Glint has two surfaces that share one palette but differ in type and shape, so
each section below says which surface a rule belongs to.

## 1. Visual Theme & Atmosphere

Glint looks like a darkroom with one warm light on. Every base is a neutral
graphite that is never pure black, text is a soft off-white, and a single amber
does all the pointing: the primary button, the active control, the focus ring,
the dot beside a section title. There is no second accent, no blue or purple
chrome, and no gradient text. Where amber is a fill, the text on it is dark ink,
never white.

The marketing site leans into film. A faint film grain sits over the whole page,
a warm light leak bleeds in from the top right corner, and product shots get a
single streak of light (the "glint") that crosses them once when they scroll into
view. Headlines are large, tight and solid colored, with generous open space
around them, in the manner of an Apple product page. One section on the homepage
flips to solid amber with ink text, like a safelight. The editor is the opposite
temperament: dense, quiet and tool-like, with frosted glass bars, small uppercase
labels and a dotted stage behind the canvas so the work is the brightest thing on
screen.

**Key characteristics**

- Dark first. The site is dark only; the editor also has a light theme.
- Neutral graphite, cool-leaning grays, one warm accent.
- Flat surfaces separated by hairlines, not heavy shadows.
- Sharp 6px corners on cards and media, full pills on buttons and chips.
- Motion is short and eased, and it switches off under reduced motion.

## 2. Color Palette & Roles

### Primary Foundation

| Name | Hex | Role |
|:---|:---|:---|
| Darkroom Graphite | `#0d0d0f` | Page and app background on both surfaces |
| Sunken Graphite | `#0a0a0c` | Recessed areas on the site |
| Panel Graphite | `#151518` (site: `#121214`) | Editor sidebar, dialogs, command palette |
| Raised Graphite | `#1c1c20` (site: `#18181b`) | Inputs, secondary buttons, site cards |
| Lifted Graphite | `#24242a` | Hover surfaces, floating toolbar, menus |
| Hairline | white at 7 to 10% | Borders and dividers; 18% for a stronger line |
| Frosted Glass | `#151518` at 74% with a 24px blur | Editor header, sidebar, toasts; the site nav uses `#0d0d0f` at 60 to 78% |

Editor light theme: Paper Gray `#f4f4f3` (background), Soft White `#fafaf9`
(panels), Fog `#ebebea` (inputs), Pure White `#ffffff` (raised), with hairlines
of ink at 8%.

### Accent & Interactive

| Name | Hex | Role |
|:---|:---|:---|
| Glint Amber | `#f2a93b` | The one accent: primary buttons, slider thumbs, active marks, selection and guides on the canvas, text selection |
| Amber Highlight | `#f6bb5e` | Hover and pressed state of amber fills; top of the logo gradient |
| Deep Amber | `#c47a14` | Borders and focus rings on light backgrounds, where Glint Amber is too faint |
| Burnt Amber | `#e8913a` | Secondary amber in the editor |
| Ember Coral | `#e8613a` | Logo gradient end and the light leak only; never a UI color |
| Ink on Amber | `#141416` | All text and icons on an amber fill |
| Amber Wash | amber at 12 to 14% | Soft active backgrounds; amber at 40% for accent borders |

### Typography & Text Hierarchy

| Name | Hex | Role |
|:---|:---|:---|
| Off-White Ink | `#f2f2f0` (editor: `#ecedf1`) | Headlines and primary text |
| Soft Gray | `#b4b4b0` (editor: `#9a9ca8`) | Body copy, labels, secondary text |
| Quiet Gray | `#8d8d89` (editor: `#8a8d99`) | Hints and metadata; the lightest gray that still passes 4.5:1 |
| Graphite Ink | `#15161a` | Primary text in the light theme, and active text there in place of amber |

### Functional States

| Name | Hex | Role |
|:---|:---|:---|
| Mint Success | `#34d399` | Success toasts and confirm buttons (text on it is `#042f2e`) |
| Soft Red | `#f87171` | Errors and destructive actions |

There is no separate warning or info color. Info uses the neutral text colors.

## 3. Typography Rules

**Marketing site.** Headlines use **Funnel Display**, a wide, confident display
sans; everything else uses **Funnel Sans**, its plainer companion. Both are
self-hosted variable fonts (weights 300 to 800).

**Editor and share pages.** **Geist**, a neutral geometric sans that stays
legible at 11 to 13px, with **JetBrains Mono** for numbers, dimensions and
timestamps.

### Hierarchy & Weights

| Level | Surface | Size | Weight | Tracking | Line height |
|:---|:---|:---|:---|:---|:---|
| Page headline (H1) | Site | 40 to 80px, fluid | 600 | -0.025em | 1.02 |
| Section headline (H2) | Site | 32 to 56px, fluid | 600 | -0.025em | 1.04 |
| Closing headline | Site | 36 to 68px, fluid | 600 | -0.025em | tight |
| Card title (H3) | Site | 20px | 600 | -0.025em | normal |
| Lede | Site | 18 to 21px | 400 | normal | 1.5 |
| Body | Site | 15.5 to 19px | 400 | normal | 1.5 |
| Eyebrow | Site | 17 to 22px, sentence case | 600 | -0.01em | normal |
| Button | Site | 14.5 to 15.5px | 600 | -0.01em | normal |
| Logo / dialog title | Editor | 16 to 17px | 600 | -0.2 to -0.3px | normal |
| Control text, buttons | Editor | 13px | 500 | -0.1px | normal |
| Section title | Editor | 11px, uppercase | 600 | 1.2px | normal |
| Control label | Editor | 11px, uppercase | 500 | 0.3px | normal |
| Values, sizes, times | Editor | 10 to 11px mono | 400 to 500 | normal | normal |

### Spacing Principles

- Site headlines are large and tight; body text is relaxed at 1.5. Headline
  blocks are capped near 48 characters wide so they break into short lines.
- Site labels are sentence case. The editor is the only place that uses small
  uppercase labels with wide tracking.
- Headline accents are a solid color. No gradient text.

## 4. Component Stylings

### Buttons

- **Site primary:** a full pill filled with Glint Amber and Ink on Amber text,
  comfortable padding (11px by 22px, larger variant 15px by 30px). Flat: no
  glow and no lift. Hover brightens to Amber Highlight; press shrinks it very
  slightly. A trailing arrow slides 3px on hover.
- **Site secondary (ghost):** a pill of faint frosted glass with a hairline
  border and off-white text; the border brightens on hover.
- **Editor primary:** a compact rectangle with 6px corners, amber fill, ink
  text, 8px by 16px padding. Hover brightens, lifts 1px and adds a soft amber
  glow.
- **Editor secondary:** Raised Graphite fill with a hairline border; hover
  moves to Lifted Graphite.
- **Focus:** a 2px amber outline, offset 1 to 2px (Deep Amber in light theme).
- **Timing:** 0.15 to 0.25s with a smooth ease-out; a springy 0.4s curve is
  reserved for playful moments.

### Cards & Product Shots

- **Site cards:** flat Raised Graphite tiles with 6px corners, a hairline
  border and roomy padding (26 to 34px). No glass sheen and no lift; hover only
  strengthens the border. Icons sit bare in amber at 30px, with no badge behind
  them.
- **Product shots:** real editor output, 6px corners, full bleed in their
  frame, with the glint streak on first view and on hover. Large shots may
  carry a deep, soft drop shadow.
- **Editor dialogs and the command palette:** Panel Graphite, 14px corners, a
  hairline border and a large soft shadow. Toasts and the floating toolbar use
  10px corners.

### Navigation

- **Site:** a 66px sticky bar of dark frosted glass that gains a hairline once
  the page scrolls. Each section opens a full-width flyout laid out in three
  columns; links turn amber on hover. Below 980px the bar becomes a menu button
  that opens a full-screen list, where a section slides in as its own page with
  a back button. Product pages add a 52px sticky sub-bar with the page name,
  section links and one small button.
- **Editor:** a 52px frosted header with a faint amber line along its bottom
  edge, a narrow icon rail of stacked icon-plus-label tabs, and one 360px
  frosted panel beside it (320px on tablets).

### Inputs & Forms

- Text inputs and selects: Raised Graphite fill, hairline border, 6px corners,
  9px by 12px padding, 13px text.
- Sliders: a 4px graphite track with a 14px round amber thumb.
- Switches: a 40 by 22px pill; the knob is gray when off and the pill turns
  amber when on.
- Preset tiles: 44px tall swatches with 6px corners; the active one gets an
  amber border.
- Each control sits under a small uppercase label.

### Glint-Specific Components

- **Sidebar section:** 20px padding, a hairline underneath, and a title row
  with a 5px amber dot before an uppercase label. Sections collapse to their
  title.
- **Canvas stage:** graphite with a faint 22px dot grid, so it reads as a work
  surface. The empty state is a 600 by 400 drop zone with a dashed amber border,
  20px corners and a barely-there amber wash.
- **Safelight section (site):** one full-width band of solid amber with ink
  text. Use it once per page at most.
- **Logo:** a four-point sparkle on a rounded tile with an amber-to-coral
  gradient (`#f6bb5e` to `#e8613a`).

## 5. Layout Principles

### Grid & Structure

- Site content sits in a 1200px container (760px for narrow text pages) with a
  fluid side gutter of 20 to 64px.
- Card grids are two, three or four equal columns with a 16px gap. Feature rows
  are two equal columns, picture beside text. The footer is five columns.
- The editor is a fixed, full-height app: header on top, icon rail and panel on
  the left, canvas filling the rest. It does not scroll as a page.

### Whitespace Strategy

- Base unit is 4px. Controls sit 6 to 14px apart; panels pad 20px.
- Site sections breathe: 72 to 128px above and below, and page heads open with
  64 to 128px. Closing sections end on open space, one line and one button.
- The editor is dense by design. Space comes from hairlines and grouping, not
  from large gaps.

### Alignment & Visual Balance

- Site heroes and closing sections are centered; feature chapters are left
  aligned with the picture carrying the weight.
- Depth is quiet: hairlines first, frosted glass for bars, shadows only for
  things that float (dialogs, menus, toasts, large product shots).
- Atmosphere is fixed to the viewport: grain at 16% opacity over everything and
  one light leak in the top right. Grain is removed under high-contrast settings.

### Responsive Behavior & Touch

- Desktop first, with max-width breakpoints. Site: 1000, 980 (nav becomes the
  phone menu), 860, 760, 700, 560 and 460px. Editor: 1024 and 767px.
- Grids step down to two columns, then one. The sub-bar hides its button and
  lets its links scroll sideways.
- The editor has extra rules for touch (`pointer: coarse`, `hover: none`) to
  enlarge targets and drop hover-only affordances.
- Reduced motion turns off the glint streak and reveal animations; reduced
  transparency replaces frosted glass with solid fills.

## 6. Design System Notes for Stitch Generation

### Language to Use

- "Dark graphite interface, never pure black, with a single warm amber accent."
- "Darkroom mood: film grain, one warm light leak in the top right corner."
- "Large, tight, solid-color headlines with lots of open space, like an Apple
  product page."
- "Flat cards with sharp 6px corners and hairline borders; pill-shaped buttons."
- "Dark ink text on amber buttons."
- Avoid: gradients on text, blue or purple accents, glowing buttons, large
  rounded card corners, stock photos, white text on amber.

### Color References

- Darkroom Graphite `#0d0d0f` (background)
- Raised Graphite `#18181b` (cards)
- Off-White Ink `#f2f2f0` (headlines), Soft Gray `#b4b4b0` (body)
- Glint Amber `#f2a93b` (the only accent), Amber Highlight `#f6bb5e` (hover)
- Ink on Amber `#141416` (text on amber)
- Mint Success `#34d399`, Soft Red `#f87171`

### Component Prompts

- "A centered hero on a dark graphite page with subtle film grain: a small
  amber sparkle logo, a very large tight off-white headline in a wide display
  sans, one line of soft gray text, an amber pill button with dark text and a
  frosted glass pill button beside it, then a large product screenshot with
  sharp 6px corners below."
- "A row of three flat feature cards on dark graphite: slightly lighter
  graphite fill, hairline border, 6px corners, a bare amber line icon, a 20px
  semibold title and two lines of soft gray text. No shadows."
- "A dense editor sidebar in dark frosted glass, 360px wide: sections divided
  by hairlines, each with a tiny uppercase gray title and an amber dot, small
  uppercase control labels, thin sliders with round amber thumbs, pill switches
  that turn amber when on, and a compact amber primary button with dark text."

### Incremental Iteration

- Keep one accent per screen. If a second color is asked for, use a neutral.
- When a screen looks generic, sharpen card corners to 6px and remove shadows
  before changing colors.
- For site screens ask for Funnel Display headlines and Funnel Sans text; for
  tool screens ask for Geist at 13px with 11px uppercase labels.
- Ask for the amber safelight band or the film grain by name; add at most one
  amber band per page.
