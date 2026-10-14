# Chrome Web Store listing: Glint Capture

Paste these fields into the Chrome Web Store developer dashboard when submitting.
Replace the landing-page "Add to Chrome" links and any listing URLs once the
extension is approved and its store ID is assigned.

## Name (≤ 45 chars)
Glint Capture: Screenshot & Edit

## Summary / short description (≤ 132 chars)
Capture any page (visible, full-page, or a region) and open it in the Glint studio to frame, annotate, and export.

## Category
Productivity  (secondary: Photos)

## Detailed description

Take the screenshot, then make it look like you meant it.

Glint Capture grabs any webpage in one click and opens it straight in the
Glint studio, where you can frame it, drop it on a background, add a device
mockup, annotate it, and export a clean image. No upload step, no account, no
watermark you did not ask for.

THREE WAYS TO CAPTURE
• Visible area: grab exactly what is on screen right now, at full resolution.
• Full page: capture an entire scrolling page in one shot. It scrolls, grabs
  each screen, and stitches them into one tall image, keeping sticky headers from
  repeating.
• Select a region: drag a box around just the part you want and capture it crisp
  at the page's pixel density.

EDIT IT RIGHT AWAY
Every capture opens a built-in quick editor: crop it, add padding and a background,
drop in arrows and text, and download a clean PNG. Need more? One click sends the
shot to the full Glint studio at snapshotpro.xyz for device frames, 3D
mockups, shadows, redaction, and exports in PNG, JPEG, or WebP.

PRIVATE BY DESIGN
The extension only touches a tab when you click it (the activeTab permission).
There is no background access to your browsing, no tracking, and no analytics in
the extension. The capture is handed to the Glint studio and nowhere else,
and the editor renders on your own machine. Glint is free and open source.

GREAT FOR
Product screenshots, bug reports, documentation, App Store and social images,
GitHub READMEs, design reviews, and anything that deserves to look finished.

Free. Open source. Just click and capture.

## Permission justifications (for review)
- activeTab: capture the current tab's screenshot only after the user clicks the
  toolbar button. No host access is requested for browsing in general.
- scripting: inject the capture worker into the active tab on demand for full-page
  scroll-and-stitch and the region-select overlay.
- tabs: open the Glint studio tab with the finished capture.
- storage: briefly hold one capture in transit (cleared after the studio reads it).
- host_permissions (snapshotpro.xyz): run the small bridge content script that
  hands the capture to the studio page. localhost is included for local testing.

## Privacy policy URL
https://snapshotpro.xyz/privacy/   (see the "Browser extension" section)

## Screenshots (1280×800 PNG, up to 5)
In ./screenshots/ (01-03 from scripts/build-store-shots.mjs):
  1. 01-modes.png      : the capture popup with the three modes
  2. 02-region.png     : a region selection on a page
  3. 04-quickedit.png  : the built-in quick editor (crop, background, arrow/text)
  4. 03-studio.png     : handing the shot off to the full studio

## Homepage / support
https://snapshotpro.xyz/extension/
