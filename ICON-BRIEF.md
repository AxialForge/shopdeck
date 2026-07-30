# ShopDeck — app icon brief

Use this to generate a Windows application icon set. Hand this whole file to an
image/icon generator; it contains everything needed.

## What the app is
ShopDeck is a desktop **library for interactive work-item modules** — it stores,
organizes (in a nested folder tree), version-tracks, and opens self-contained
interactive documents. The first content type is manufacturing **tool-swap
timelines** (forged-part die-set history), but it is a general shop-floor tool
that will hold many kinds of work items. Audience: machinists / manufacturing
engineers, often on a shared network drive.

## Feel
Industrial, precise, calm, professional. Flat and modern — **no** gradients,
bevels, drop shadows, glossy/3D, or skeuomorphism. Should read clearly at 16×16
and look sharp at 256×256. A single confident mark, not a busy scene.

## Brand
- Primary accent — **AxialForge royal blue `#3b74f0`** (use `#1e50e5` if a deeper
  blue reads better on light backgrounds).
- Neutrals — near-black `#141416`, light `#f3f3f1`, mid-grey `#9a9ba2`.
- Two colors max besides the background. Blue + one neutral is ideal.

## Concept directions (pick one; all should be a bold, simple glyph)
1. **Stacked deck** — 2–3 offset rounded cards/layers (the "deck" of modules),
   the top one accented blue. Reads as a library/collection.
2. **Timeline/track motif** — a horizontal lane with a couple of segmented bars
   (echoes the tool-swap timeline), framed in a rounded square.
3. **Monogram "S"** — a geometric S formed from stacked bars, blue on neutral.

Prefer #1 or a fusion of #1+#2 (a stacked card whose face shows a tiny timeline
bar). Keep negative space generous.

## Deliverables
- A single **`icon.ico`** containing these square sizes: **16, 24, 32, 48, 64,
  128, 256** px (32-bit, alpha transparency). This is what Windows / electron-
  builder needs at `build/icon.ico`.
- Also provide a master **`icon.png` at 1024×1024** and a **512×512** for stores/
  docs, plus an optional monochrome version for small/disabled states.

## Rules
- Transparent background (no baked-in square plate unless the concept is a rounded
  tile — if so, use a subtle neutral tile, not white).
- Legible silhouette at 16px: test that the glyph is still recognizable when tiny.
- Centered, even optical margins; don't fill edge-to-edge.
- No text/words in the icon (the monogram concept's "S" is a shape, not a letter
  label). No photographic elements. Sentence-case everything in any mockups.

## Output naming
`icon.ico`, `icon-1024.png`, `icon-512.png`, `icon-mono.png`.
