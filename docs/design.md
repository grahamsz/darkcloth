# Phototracker Design Direction

Phototracker should feel like a quiet working archive for film photography.

The public homepage should show the product immediately: film, camera, lens, exposure, GPS, and reference image tracking. Avoid generic marketing visuals. The authenticated app should prioritize quick logging, scanning, and retrieval.

## Visual tokens

- Paper: `#f7f4ef` (warm off-white background)
- Ink: `#1f2320`
- Accent: `#2f695c` / strong `#184a40` (dark teal, muted forest)
- Warm: `#c67445` (used for frame numbers, sparse highlights)
- Muted: `#5d645f`
- Line: `#d7d0c5`
- Mono: JetBrains Mono → Cascadia Code → SF Mono for data fields

## Homepage log preview

The hero log preview card shows one frame inside a roll context. The roll header (film stock, ISO, process) sits above the frame, establishing the logbook concept. The frame number is rendered as a warm circle badge. Notes display in italic non-mono to distinguish freetext from data fields. The reference image is a placeholder striped gradient.

## Feature strip

Six items in a 3×2 grid. Each has a small 18px SVG icon in a teal-tinted 34×8 badge, uppercase label, and muted description. Icons are inline SVG — no icon library dependency.

## Typography

- Headings: Inter 750 weight (semi-bold+, non-standard but Inter supports it)
- Hero h1: fluid clamp(3rem, 7vw, 5.8rem), line-height 0.94
- Data/mono fields: `var(--mono)` stack, 0.84–0.87rem
