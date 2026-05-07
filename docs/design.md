# Darkcloth Design Direction

Darkcloth is a field notebook for film photography.

The public homepage should show the product immediately: film, camera, lens, exposure, GPS, and reference image tracking. Avoid generic marketing visuals. The authenticated app should prioritize quick logging, scanning, and retrieval.
The page shell is dark cloth, with cream paper surfaces reserved for cards, forms, and data panes.

## Visual tokens

- Cloth: `#151110` / `#1d1714` for dark shell surfaces and the top nav
- Paper: `#f4eadf` / panel `#fbf7f1` for cards and working surfaces
- Ink: `#1d1714`
- Accent: `#30473f` (deep green-blue, used for nav focus and structural accents)
- Warm: `#b45a31` (safelight orange for primary actions and active states)
- Brass: `#9a7538` (frame numbers, labels, subtle highlights)
- Muted: `#685f56`
- Line: `#d7c6b1`
- Mono: JetBrains Mono → Cascadia Code → SF Mono for data fields

## Homepage log preview

The hero log preview card shows one frame inside a roll context. The roll header (film stock, ISO, process) sits above the frame, establishing the logbook concept. The frame number is rendered as a brass circle badge. Notes display in italic non-mono to distinguish freetext from data fields. The reference image is a placeholder striped gradient.

## Feature strip

Six items in a 3×2 grid. Each has a small 18px SVG icon in a cloth-tinted 34×8 badge, uppercase label, and muted description. Icons are inline SVG — no icon library dependency.

## Typography

- Headings: Inter 750 weight (semi-bold+, non-standard but Inter supports it)
- Hero h1: fluid clamp(3rem, 7vw, 5.8rem), line-height 0.94
- Data/mono fields: `var(--mono)` stack, 0.84–0.87rem

## Authenticated Navigation

- The top-level app nav uses `Photos`, `Gear`, and `Film`.
- The Film section groups `Film Stocks`, `Rolls`, and `Film Holders` under one parent instead of exposing a lone film-stock tab.
- Subnav pills should remain compact, single-line, and easy to scan on narrow screens.

## Exposure Controls

- Shutter capability is presented as one grouped control with a subdued toggle row and a quiet disabled state.
- The aperture picker should reserve enough horizontal room for labels such as `f/8 +1/3` and open without reflowing surrounding form fields.
- The location fill action sits directly above latitude and longitude, reads as a real form control, and collapses to a full-width tap target on mobile.

## Developer Docs

- The Redoc presentation should use the canonical film resource names consistently: `Film Stocks`, `Film Holders`, and `Rolls`.
- Keep the docs shell quiet and utilitarian so the API reference feels like part of the product rather than a separate marketing page.

## Development Profiles

- BTZS profile cards should keep chart canvases, validation tables, and source-file metadata readable at narrow widths without shrinking into illegibility.
- Empty chart states should read as explicit empty states, not placeholder plots.
