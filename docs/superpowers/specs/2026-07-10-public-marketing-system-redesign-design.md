# SnapShotPro public marketing system redesign

**Status:** Approved for implementation.
**Date:** 2026-07-10
**Scope:** Entire public marketing site. The editor is excluded from visual and functional changes.

## 1. Summary

Redesign the full SnapShotPro public marketing site as a bright editorial visual workspace that serves individual creators and product teams equally.

The redesign is a system-first targeted evolution:

- Preserve the existing logo, SnapShotPro name, cobalt brand color, routes, page purposes, SEO intent, factual claims, and editor behavior.
- Replace the global dark-glass treatment with a clearer, calmer, product-led marketing system.
- Make faster understanding and stronger trust the primary success criteria.
- Add moderate premium polish and full-site consistency as supporting goals.
- Add complete light, dark, and system appearances across all public marketing pages.
- Apply targeted copy polish without inventing features, customers, usage data, testimonials, or performance claims.
- Deliver and verify the finished product locally. Do not deploy, push, or create a pull request.

## 2. Design read

Reading this as: a preservation-first redesign of a multi-page product marketing site for creators and product teams, with a bright editorial language and a professional visual-workspace position.

Design settings:

- `DESIGN_VARIANCE: 7` - structured compositions with enough asymmetry to retain creative character.
- `MOTION_INTENSITY: 4` - restrained reveals, navigation transitions, and tactile feedback.
- `VISUAL_DENSITY: 4` - substantial and scannable without feeling crowded.

The site should feel trustworthy, capable, and creative. It should not read as a niche developer tool, an experimental agency portfolio, or a generic SaaS template.

### 2.1 Applied design skills

The implementation and review must apply all three design guides together:

- `design-taste-frontend` - audit-first preservation, anti-template discipline, real imagery, controlled page archetypes, motivated motion, and strict preflight review.
- `frontend-design` - subject-specific art direction, deliberate color/type/layout choices, a single justified aesthetic risk, and critique before and after building.
- `ui-ux-pro-max` - accessibility-first interaction rules, 44px minimum touch targets, semantic theme tokens, responsive and performance checks, and independent light/dark validation.

The local `ui-ux-pro-max` design-system search was run with the approved `7 / 4 / 4` dials. Its generic dark-glass, pink-accent, Inter, and cinematic-route-transition recommendations conflict with the user-approved brief and are rejected. Its product-proof pattern and measurable UX requirements are retained. User-approved brand and design decisions override database defaults.

### 2.2 Compact visual plan

Color roles:

- Canvas Ice - cool off-white page background.
- Paper - white raised and reading surfaces.
- Ink - near-black primary text.
- Utility Gray - accessible secondary text and rules.
- SnapShot Cobalt - existing brand action, link, focus, and selection color.
- Night Canvas and Night Surface - off-black and charcoal dark-mode foundations.

Type roles:

- Geist Display - restrained large headlines and category statements.
- Geist - body, navigation, controls, and labels.
- JetBrains Mono - code, shortcuts, dimensions, and genuine technical metadata only.

Layout concept:

- A bright editorial shell frames real product work using full-width bands, asymmetric media, disciplined gutters, and dark product stages where the editor needs contrast.
- Pages use spacing and rules before cards; repeated selectable objects are the exception.

### 2.3 Signature element: Output Ribbon

The one deliberate aesthetic risk is a full-bleed Output Ribbon on the homepage. It uses authentic SnapShotPro exports in several meaningful aspect ratios to show one source capture becoming polished launch, documentation, store, and social assets.

- The ribbon is product evidence, not a decorative marquee.
- It appears once on the site and does not loop continuously.
- Desktop may use one controlled horizontal composition with varied crop sizes.
- Mobile becomes a vertical or user-controlled scroll-snap sequence with visible controls and no gesture-only dependency.
- It provides the visual bridge from the hero into the workflow section and leaves a hint of subsequent content in the first viewport.
- Supporting pages use ordinary product-shot figures rather than repeating the signature.

## 3. Goals and success criteria

### 3.1 Primary goal

A first-time visitor should quickly understand that SnapShotPro is a browser visual workspace for turning screenshots into polished visual assets, then feel confident opening the studio.

### 3.2 Supporting goals

- Raise perceived product quality without making the site precious or intimidating.
- Make all public pages feel like one product system.
- Give creators and product teams equal recognition in examples and messaging.
- Replace generic or placeholder proof with authentic product evidence.
- Improve navigation, keyboard access, contrast, responsive behavior, and visual stability.
- Reduce page-local styling debt and establish maintainable shared primitives.

### 3.3 Observable outcomes

- The homepage communicates category, outcome, and primary action within the first viewport.
- The product is shown through real editor captures and exported results, not generic photography.
- Visitors can reach every existing public route through clear desktop, tablet, and mobile navigation.
- Specialized pages retain their search intent while looking and reading like members of the same system.
- Light, dark, and system appearances work consistently across route changes and page reloads.
- The production build succeeds and every public route is visually verified at representative viewports.

## 4. Preservation and scope locks

### 4.1 Preserve

- The existing logo SVG and favicon artwork.
- The `SnapShotPro` product name and casing.
- The existing cobalt identity, anchored by `#2348ff` and accessible related tones.
- Every existing public route and slug.
- Each page's purpose and search intent.
- Accurate privacy, open-source, local-processing, BYOK, cloud, export, and pricing claims.
- Existing analytics-sensitive links, IDs, and form contracts unless a verified migration is included.
- The Vite multi-page architecture and shared HTML-partial approach.
- The editor at `/editor/`, including its styles, functionality, interactions, and state.

### 4.2 Explicitly allowed

- Regrouping primary navigation labels into accessible menus while preserving all destinations.
- Targeted copy changes for clarity, consistency, terminology, and credibility.
- Recomposition of marketing sections within existing pages.
- Replacement of placeholder imagery with authentic local product assets.
- Consolidation of repeated inline CSS and page-local primitives into the shared marketing system.
- A new marketing-site appearance preference with System, Light, and Dark options.
- Metadata corrections and consistency improvements that preserve SEO intent.

### 4.3 Out of scope

- New editor features or marketing-only claims about unimplemented behavior.
- Editor redesign or refactoring.
- Route deletion, slug changes, redirects, or a framework migration.
- Invented testimonials, customer logos, customer names, usage metrics, awards, or performance data.
- A deployment, production push, pull request, or external publication.
- A brand-logo redesign or a replacement accent color.
- Marketing interactions that preconfigure or mutate editor state unless such deep links already work and are verified.

## 5. Product position and messaging

### 5.1 Category definition

Use one clear category throughout the public site:

> SnapShotPro is the browser visual workspace for turning screenshots into polished visuals.

The final copy may be tightened during implementation, but it must preserve this literal meaning.

### 5.2 Central concept

Use `one canvas` as the connective product idea. It explains how capture, composition, mockups, AI editing, brand consistency, scaling, motion, and export belong together without resorting to a long feature inventory.

### 5.3 Workflow vocabulary

Organize capabilities around four existing stages:

1. **Capture** - extension, paste, drag and drop, upload, URL import, recording, and code input.
2. **Compose** - backgrounds, frames, mockups, annotations, redaction, color, effects, and AI editing.
3. **Scale** - Open Canvas, Brand Kit, projects, version history, Merge Studio, campaigns, and batch production.
4. **Ship** - stills, motion, store sets, documents, sharing, tours, and supported export formats.

This is a messaging taxonomy, not new functionality.

### 5.4 Audience balance

Give equal visual and copy weight to:

- Individual creators making one strong visual, social post, portfolio image, README asset, or product mockup.
- Product and marketing teams producing launches, changelogs, documentation, campaigns, store sets, and consistent brand assets.

Avoid persona tabs or separate product experiences. Use representative examples and concise audience language inside the same system.

### 5.5 Copy rules

- Lead with outcomes, then explain relevant capabilities.
- Prefer short, concrete sentences and sentence-case headings.
- Preserve task-specific search phrases on acquisition pages.
- Use a single primary CTA label: `Open the studio`.
- Use `See examples` as the standard secondary CTA when the destination is visual proof.
- Use distinct CTA labels only for genuinely distinct destinations or in-page actions.
- Remove repeated filler such as `Keep going` and duplicated three-step templates.
- Remove generic marketing verbs and unverified superlatives.
- Consolidate repetitive `free`, `in your browser`, and `no account` language into a concise trust block.
- Describe local and hosted processing accurately. Do not imply that optional hosted AI runs locally.
- Reconcile `studio`, `editor`, feature names, and AI product names against one current vocabulary.
- Do not use em dashes in visible site copy.

## 6. Information architecture

### 6.1 Primary navigation

Desktop navigation:

- Product
- Tools
- Use cases
- Gallery
- Pricing
- Resources
- Open the studio
- Appearance

`Product` and `Resources` are accessible menus containing existing destinations. Appearance may be an icon button with an accessible name and tooltip at larger widths, but its expanded menu labels are textual.

No route is removed. The information architecture changes only the top-level grouping.

### 6.2 Responsive navigation states

- Full desktop: all primary labels, CTA, and appearance control on one line at no more than 80px height.
- Condensed tablet: reduce visible labels and move secondary destinations into the menus before clipping can occur.
- Mobile: a clear menu button opens the complete navigation. Public links must never simply disappear.
- Menus support pointer, keyboard, and touch input.
- Current route and expanded state are programmatically exposed.

### 6.3 Route contracts

- `/` - category definition, authentic product proof, workflow, audiences, trust, and conversion.
- `/features/` - complete Capture, Compose, Scale, and Ship capability map.
- `/tools/` - task-oriented directory of existing tools.
- `/use-cases/` - audience and outcome directory.
- `/gallery/` - authentic exported-result proof.
- `/pricing/` - clear free/open-source proposition, optional-service distinctions, and conversion.
- `/alternatives/` - dated, fair comparison and evaluation criteria.
- `/ai/` - AI suite overview.
- `/agent/` - conversational composition and editing contract.
- `/studio-intelligence/` - brand consistency and campaign-scale automation contract.
- `/extension/` - capture workflow and a valid extension-install destination when one exists.
- Task pages - focused search entry points with one job, one representative result, one workflow, relevant trust, and conversion.
- `/guide/`, `/faq/`, `/changelog/`, `/roadmap/`, `/about/` - education, objections, history, current direction, and origin.
- `/privacy/`, `/terms/` - readable and authoritative trust content without decorative distraction.

## 7. Page archetypes

### 7.1 Flagship media

Routes: homepage and gallery.

Structure:

- Full-bleed product-proof hero with readable text over a deliberately quiet region, not a split text/media card composition.
- One primary action and at most one secondary action.
- Authentic product imagery visible in the first viewport, with the Output Ribbon providing the homepage signature.
- Varied full-width editorial bands.
- Real proof immediately after the hero.
- No repetitive three-card feature row.

### 7.2 Product and solution

Routes: AI, Agent, Studio Intelligence, Extension, and specialized task pages.

Structure:

- One specific job and outcome.
- One authentic primary example.
- Concise supporting workflow or capability evidence.
- Relevant trust and limitation copy.
- One conversion path.
- Unique content rather than repeated SEO-page filler.

### 7.3 Directory and decision

Routes: Features, Tools, Use cases, Pricing, and Alternatives.

Structure:

- Compact purpose statement.
- Scannable categories, ruled indexes, filters, or comparisons.
- Strong cross-links to existing destinations.
- Cards only where repeated selectable objects require containers.
- Long lists grouped into meaningful clusters rather than bordered rows for every item.

### 7.4 Editorial and trust

Routes: About, Guide, FAQ, Changelog, Roadmap, Privacy, and Terms.

Structure:

- Compact editorial header.
- Readable constrained prose.
- Clear heading hierarchy and sparse dividers.
- Native disclosure controls where appropriate.
- Minimal ornament around authoritative content.

## 8. Visual system

### 8.1 Theme tokens

Use semantic CSS custom properties rather than page-specific literal colors.

Light appearance:

- Cool off-white page canvas.
- White raised surfaces.
- Near-black primary text.
- Accessible cool-gray secondary and metadata text.
- Existing deep cobalt for actions, links, focus, and selection.
- Pale cobalt wash only for selected or informative surfaces.

Dark appearance:

- Off-black page canvas, not pure black.
- Charcoal raised surfaces.
- Soft off-white primary text.
- Accessible cool-gray secondary text.
- The same recognizable cobalt identity, adjusted only where contrast requires it.

The page remains one coherent theme at a time. Sections may use small tonal variations within that theme, but they do not randomly invert.

### 8.2 Typography

- Preserve Geist as a deliberate two-role system: Geist Display behavior for headlines and Geist for body/UI text.
- Restrict JetBrains Mono to code, shortcuts, version data where genuinely needed, and technical metadata.
- Self-host production WOFF2 font assets under `public/fonts/` with `font-display: swap`.
- Use weight, scale, whitespace, and color for hierarchy.
- Avoid routine highlighted words, gradient text, excessive uppercase mono eyebrows, and negative tracking.
- Keep body measure near 65 characters with comfortable line height.
- Use balanced or pretty text wrapping where supported.
- Keep visible text at 16px or larger on mobile except short metadata that remains legible and nonessential.

### 8.3 Shape and material rules

- Functional controls and fields: approximately 4px radius.
- Media and bounded product surfaces: approximately 8px radius.
- Pills: only for status, compact segmented choices, or other pill-semantic controls.
- Page sections: unframed full-width bands with constrained inner layouts.
- Use whitespace, rules, alignment, and tonal surfaces before cards.
- Use restrained tinted shadows only when elevation communicates hierarchy.
- Remove global aurora, default glass material, gradient headlines, glow-heavy buttons, automatic card spotlights, and gratuitous tilt.
- Do not place cards inside cards.

### 8.4 Imagery

- Replace Picsum and generic placeholder imagery with local, authentic editor captures and exported results.
- Use existing verified local assets when they accurately represent the current product.
- Capture additional product states through the local app when required.
- Show inspectable results, not blurred or atmospheric decoration.
- Use a shared product-shot figure pattern with stable aspect ratio, explicit dimensions, correct eager/lazy loading, and useful alt text.
- Keep labels and captions outside images unless they communicate actual product state.
- Do not manufacture customer proof or fake brand logos.

### 8.5 Layout and responsiveness

- Use one constrained 12-column marketing grid with a maximum content width around 1280-1400px.
- Hero headline is no more than two lines on desktop; supporting copy is concise; primary action is visible in the first viewport.
- Desktop navigation remains on one line.
- Multi-column sections declare an explicit single-column mobile fallback below 768px.
- Fixed-format media uses stable aspect ratios to prevent layout shift.
- CTA labels do not wrap at desktop sizes.
- Every public page should use enough layout variety for its content without repeating the same composition section after section.

## 9. Appearance control

The public marketing site gains a complete appearance preference.

- First visit follows `prefers-color-scheme`.
- The Appearance menu offers System, Light, and Dark.
- Manual choice persists locally across all public pages.
- A small pre-render script applies the resolved appearance before visible paint to prevent a theme flash.
- The chosen mode updates `color-scheme`, theme metadata where practical, and semantic tokens.
- System mode responds to operating-system changes while the page is open.
- Light and dark modes use the same content and layout hierarchy.
- The preference is local and does not require an account or network call.
- The control has an accessible name, current selection state, keyboard support, and a tooltip when icon-only.

This is the only added user-facing capability in the redesign. It applies to public marketing pages, not the editor.

## 10. Shared implementation architecture

### 10.1 Retain the Vite MPA

Do not migrate to React, Next.js, or another framework. Preserve individual HTML entries and the Vite build.

### 10.2 Route manifest

Create one route manifest that owns:

- Route path and source file.
- Page archetype.
- Sitemap priority and change frequency.
- Primary navigation group and current-route state.
- Shared metadata defaults and per-route overrides.

Derive Rollup inputs and sitemap entries from this manifest so route registries cannot drift.

### 10.3 Shared partials

Keep and extend the existing partial injector:

- Shared mark.
- Shared navigation.
- Shared footer.
- Shared head content for fonts, favicon, theme initialization, and common metadata where Vite transformation is appropriate.
- Route context for body archetype classes and `aria-current`.

### 10.4 Shared CSS primitives

Rebuild `public/site.css` around:

- Semantic light and dark tokens.
- Container and 12-column layout primitives.
- Navigation, menus, appearance control, buttons, and links.
- Flagship, solution, directory, editorial, and legal headers.
- Product-shot figures.
- Section headers and band variants.
- Workflow sequences and ruled capability indexes.
- Comparison tables, FAQ, related links, trust blocks, closing CTA, and footer.
- Shared focus, hover, active, selected, loading, empty, and error treatments where applicable.
- Motion and reduced-motion behavior.

Remove repeated `.actions`, section-spacing inline styles, generic `.steps` collisions, and page-local copies of shared primitives.

### 10.5 Shared JavaScript

Keep marketing behavior small and progressively enhanced:

- Appearance resolution and persistence.
- Accessible primary navigation and menus.
- Current-page state where not fully generated at build time.
- IntersectionObserver-based reveals.
- Page-specific hooks only for genuine page behavior, such as gallery filtering.

Do not use scroll listeners or React-style state for continuous pointer and scroll values. Pointer effects are opt-in and must communicate feedback; they are not attached to every card.

## 11. Interaction and accessibility

- Add a shared skip link and `<main id="main">` landmark to every public page.
- Use logical heading order and semantic sections.
- Implement visible `:focus-visible` treatment across both appearances.
- Ensure keyboard, pointer, and touch access for navigation and menus.
- Provide at least 44px by 44px interactive hit areas on touch layouts and at least 8px between adjacent touch targets.
- Expose menu expansion, current page, current appearance, and gallery filter state programmatically.
- Gallery filters use `aria-pressed` or the appropriate single-selection pattern.
- Preserve native FAQ disclosure semantics.
- Meet WCAG AA contrast for body text, controls, metadata, placeholders, focus indicators, and both theme modes.
- Provide stable touch targets on mobile.
- Motion communicates hierarchy, feedback, or state change and respects `prefers-reduced-motion`.
- Keep micro-interactions between 150ms and 300ms, animate transform and opacity, and avoid blocking input during transitions.
- Marketing content remains understandable with animation and optional JavaScript disabled.
- Reserve image dimensions and font behavior to keep CLS below 0.1.
- Target LCP below 2.5 seconds and INP below 200ms on representative pages.

## 12. Content and trust corrections

Targeted copy polish includes the following required consistency work:

- Differentiate the contracts of `/ai/`, `/agent/`, and `/studio-intelligence/`.
- Reconcile Features, Changelog, Roadmap, FAQ, and editor-facing terminology against current shipped capabilities.
- Remove roadmap items that are already shipped or clearly label their remaining unshipped scope.
- Make Features a current, complete workflow map rather than an older 30-plus-tools inventory.
- Make Use cases equally recognizable to creators and product or marketing teams.
- Standardize `Open the studio` for links that all lead to `/editor/`.
- Do not imply contextual editor deep links until a deep link is verified.
- Replace repeated generic closing headings with page-specific outcomes.
- Correct the extension-install destination if a real listing exists; otherwise use honest availability language rather than linking to the generic store homepage.
- Preserve the responsible dating and caveat language on Alternatives.
- Tighten overlong descriptions and make canonical, Open Graph, Twitter, theme-color, and structured metadata consistent.
- Keep legal meaning intact. Visual and clarity work must not silently alter legal obligations or consent language.

## 13. Migration sequence

1. Establish the route manifest and shared head/route context.
2. Create the semantic light/dark tokens, appearance initializer, and base accessibility rules.
3. Build shared navigation, menus, appearance control, footer, grid, buttons, type, media, and section primitives.
4. Produce authentic local product assets with stable sizes and alt text.
5. Pilot the system on the homepage plus one representative route from each other archetype.
6. Verify the pilots across viewports and appearances; correct the shared system before broad migration.
7. Migrate the remaining routes family by family.
8. Apply targeted copy and metadata polish alongside each route migration.
9. Remove obsolete page-local CSS and unused dark-glass behavior only after its replacement is verified.
10. Run full build, route, accessibility, visual, metadata, and editor-boundary verification.

Large bespoke pages such as Changelog, Agent, AI, Studio Intelligence, Merge, and Code Screenshots may retain scoped illustration or timeline CSS, but they must use the shared tokens, shell, type, spacing, accessibility, and theme contracts.

## 14. Failure handling and progressive enhancement

- Default CSS respects the operating-system appearance even if preference JavaScript is unavailable.
- Navigation destinations remain available when enhanced menu behavior is unavailable.
- Missing media retains its allocated space and meaningful alternative text.
- Content never depends on an entrance animation to become visible.
- Theme persistence failures fall back to System mode without blocking the page.
- Page-specific filters fail to a complete, readable unfiltered list.
- Build-time route or metadata omissions fail verification before completion rather than silently shipping.

## 15. Verification

### 15.1 Automated and structural checks

- Run the production build.
- Confirm all route-manifest entries produce build inputs and sitemap entries.
- Check internal links and public asset references.
- Confirm no public route or canonical slug changed.
- Validate required titles, descriptions, canonicals, Open Graph, Twitter, theme-color, and structured data.
- Confirm all marketing images are local or intentionally external, load successfully, have intrinsic dimensions or stable aspect ratios, and have appropriate alt text.
- Scan visible marketing copy for placeholders, conflicting product names, unsupported claims, and em dashes.

### 15.2 Browser verification

Test representative routes from every archetype at minimum:

- Desktop: 1440 x 900.
- Laptop/tablet: 1024 x 768.
- Mobile: 390 x 844, 375 x 812, and 360 x 740.
- Landscape: representative phone and tablet widths.

For each representative route:

- Verify first-viewport hierarchy and CTA visibility.
- Verify full, condensed, and mobile navigation.
- Verify keyboard focus order, menu behavior, skip link, and current-route state.
- Verify browser zoom and text scaling to 200 percent without loss of content or function.
- Verify Light, Dark, and System appearances, including persistence and no visible flash.
- Verify reduced-motion behavior.
- Verify image framing, stable dimensions, text wrapping, and absence of horizontal overflow.
- Verify every touch target and adjacent-target gap at mobile widths.
- Verify hover, active, selected, loading, empty, and error states that exist on the route.

After the archetype checks, capture and inspect at least one full-page screenshot in both appearances for every public route. Run contrast and performance checks on the homepage and one representative page from each archetype.

### 15.3 Editor boundary

- Confirm `/editor/` opens from every primary CTA.
- Confirm editor styling, functionality, state, and build output are unchanged.
- Confirm the public appearance preference does not leak into or mutate editor preferences.
- Confirm no marketing link claims to preconfigure editor state unless the behavior is verified.

## 16. Delivery boundary

- The final product is implemented in this workspace and served at a local development or preview URL for review.
- Do not deploy to Vercel or any other host.
- Do not push a branch or create a pull request unless the user separately authorizes it.
- Preserve unrelated user changes and generated files already present in the worktree.

## 17. Acceptance checklist

The redesign is complete when:

- All 27 public marketing routes use the approved bright editorial system.
- The logo and cobalt identity are preserved.
- Creators and product teams receive equal recognition.
- The homepage communicates the category and outcome within the first viewport.
- Authentic local product imagery replaces generic placeholders.
- The homepage uses the single approved Output Ribbon signature, and no other route repeats it.
- Light, Dark, and System appearances work across all public pages.
- Navigation is complete and accessible at desktop, tablet, and mobile sizes.
- Shared primitives replace repeated page-local patterns without flattening page archetypes.
- Copy and metadata are clear, current, consistent, and factual.
- Required build, route, browser, accessibility, theme, metadata, and editor-boundary checks pass.
- The completed site is available locally and has not been deployed.
