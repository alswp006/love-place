# Handoff: love place — iOS app icon

## Overview

`love place` is a private travel-planning app used by exactly two people (a couple). This handoff delivers the iOS app icon: a flat, geometric mark of two map pins whose tilted teardrop bodies converge to form a heart-shaped silhouette. It reads "two people, one place" — not a literal heart sticker.

The icon is provided as:
- A rasterized **1024×1024 PNG** on solid background (the App Store submission asset).
- A **1024×1024 mark-only PNG** on transparent background (for splash screens, marketing, product surfaces).
- **Source SVG** for both (fully editable vector geometry).

## About the Design Files

The files in this bundle are **design deliverables**, not code to compile. Specifically:

- The **PNG files** are the final production assets. Drop them into the iOS project's `AppIcon.appiconset` (all required scaled sizes generated from the 1024 master) and use the transparent mark PNG anywhere the mark appears without the icon background (splash, in-app branding, marketing).
- The **SVG files** are the source of truth for the geometry. Use them if the icon ever needs to be re-exported at another size, recolored, or lightly modified. **Do not** ship SVG as the app icon itself — iOS requires PNG.
- The **preview HTML** is a design reference showing the icon at every real iOS render size under the squircle mask, and in a mock home-screen context. It is not production code.

There is no UI to reimplement here. The developer's job is to:
1. Generate the full set of iOS icon sizes from `love-place-icon-1024.png` (or the SVG).
2. Wire them into `AppIcon.appiconset` / `Contents.json`.
3. Use the transparent mark PNG wherever the icon appears outside the app icon slot.

## Fidelity

**High-fidelity.** The 1024×1024 PNG is the final production asset. Colors, geometry, and proportions are locked. Do not recolor or restyle without design review.

## Screens / Views

There is one deliverable: **the app icon**. No screens.

### App icon composition

- **Canvas**: 1024 × 1024, RGB, no transparency baked into the app-icon file (iOS applies its own squircle mask; you must submit a full-bleed square).
- **Background**: solid `#FDEBED` filling the entire canvas edge-to-edge. **No rounded corners baked in.** No gradient, no texture, no shadow.
- **Mark placement**: horizontally centered. Vertical center is roughly at y = 512 with the tip anchor at y = 780 and the topmost head arc at approximately y = 175. The mark occupies ~60% of the canvas height (comfortably inside iOS's ~62% safe area) and ~70% of the canvas width.
- **Mark**: two identical rose-colored map pins, each a classic teardrop (circular head + tangent lines converging to a point). The two pins are tilted 22° inward — the left pin rotates −22°, the right pin rotates +22°, both around a shared tip anchor at (512, 780). Their tips meet at that shared point. Their circular heads overlap slightly at the top center, forming the two lobes of a heart in silhouette; the V between the tips forms the heart's point.
- **Seam**: a 12px-wide gap in the background color `#FDEBED` runs along the boundary where the right pin overlaps the left pin. This gap makes the two pins read as distinct objects rather than one merged heart.
- **Pin holes**: each pin has a soft-pink circle (radius 52px in the 1024 canvas) at the exact center of its head. This is the universal map-pin cue and reinforces the "two travelers" reading.

### Geometry reference (exact values in the 1024 canvas)

- Pin head radius: **187.5px**
- Distance from head center to pin tip: **450px**
- Pin tangent-point angle (from vertical): `acos(187.5 / 450) ≈ 65.38°`
- Shared tip anchor: **(512, 780)**
- Left pin rotation: **−22°** around the tip anchor
- Right pin rotation: **+22°** around the tip anchor
- Left pin head center after rotation: **(343.4, 362.8)**
- Right pin head center after rotation: **(680.6, 362.8)**
- Seam stroke width: **12px** (in `#FDEBED`, painted under the right pin's fill)
- Pin-hole radius: **52px**, centered on each pin's head

The full construction is inline-commented in `icon.svg` for anyone who needs to regenerate or adjust.

## Interactions & Behavior

None. An app icon is a static image.

## State Management

None.

## Design Tokens

### Palette (locked — do not substitute)

| Token           | Hex       | Role                                            |
| --------------- | --------- | ----------------------------------------------- |
| `primary-rose`  | `#B03D5B` | Both pin bodies                                 |
| `soft-pink`     | `#F9CED4` | Pin-hole dots                                   |
| `background`    | `#FDEBED` | Icon background AND the negative-space seam    |
| `mint`          | `#007C59` | **Not used** in this icon (reserved for brand)  |

The mint accent was explicitly considered and excluded to keep the mark to 2 colors on the background — a stronger system-icon read. Do not add it back without design review.

### Geometry tokens

| Token                    | Value    |
| ------------------------ | -------- |
| Canvas                   | 1024×1024 |
| Head radius              | 187.5px  |
| Head-center to tip       | 450px    |
| Tilt (each pin, inward)  | 22°      |
| Tip anchor               | (512, 780) |
| Seam width               | 12px     |
| Pin-hole radius          | 52px     |

### Corner radius (host-applied, not baked)

iOS applies a squircle mask with approximately **22.37%** corner radius (`superellipse`). Do not bake this into the PNG. Submit a full-bleed square.

## Assets

All in this handoff folder:

| File                          | Size       | Use                                                            |
| ----------------------------- | ---------- | -------------------------------------------------------------- |
| `love-place-icon-1024.png`    | 1024×1024, opaque       | iOS App Store submission (master). Generate all required sizes from this. |
| `love-place-mark-1024.png`    | 1024×1024, transparent  | Splash screens, marketing, in-app branding, favicons, etc.     |
| `icon.svg`                    | vector                  | Source of truth for the full icon.                              |
| `icon_mark.svg`               | vector                  | Source of truth for the transparent mark.                       |
| `preview.html`                | HTML                    | Visual reference: icon under iOS squircle mask at every real render size, plus mock home-screen context. Not production code. |

## Generating iOS icon sizes

For an `AppIcon.appiconset`, generate the following from `love-place-icon-1024.png` (or, better, from `icon.svg` for crispness at small sizes). The PNG-only approach is fine — bicubic downscale from the 1024 master is what App Store Connect requires for the marketing icon anyway.

| Filename                | Size    | Idiom / usage                     |
| ----------------------- | ------- | --------------------------------- |
| `Icon-App-20@2x.png`    | 40×40   | iPhone/iPad notification @2x       |
| `Icon-App-20@3x.png`    | 60×60   | iPhone notification @3x            |
| `Icon-App-29@2x.png`    | 58×58   | iPhone/iPad settings @2x           |
| `Icon-App-29@3x.png`    | 87×87   | iPhone settings @3x                |
| `Icon-App-40@2x.png`    | 80×80   | iPhone/iPad Spotlight @2x          |
| `Icon-App-40@3x.png`    | 120×120 | iPhone Spotlight @3x               |
| `Icon-App-60@2x.png`    | 120×120 | iPhone app @2x                     |
| `Icon-App-60@3x.png`    | 180×180 | iPhone app @3x                     |
| `Icon-App-76@2x.png`    | 152×152 | iPad app @2x                       |
| `Icon-App-83.5@2x.png`  | 167×167 | iPad Pro app @2x                   |
| `ItunesArtwork@2x.png`  | 1024×1024 | App Store marketing icon         |

Suggested tooling: `sips` on macOS, ImageMagick, or Xcode's asset catalog (drop the 1024 into the "App Store 1024pt" slot and let Xcode generate the rest for modern targets that use single-size app icons).

If regenerating from SVG:

```bash
# Requires librsvg
rsvg-convert -w 180 -h 180 icon.svg -o Icon-App-60@3x.png
rsvg-convert -w 120 -h 120 icon.svg -o Icon-App-60@2x.png
# ...etc
```

## Files

Bundled in this handoff:
- `README.md` — this document
- `love-place-icon-1024.png` — final full-icon PNG
- `love-place-mark-1024.png` — final mark-only transparent PNG
- `icon.svg` — full-icon SVG source
- `icon_mark.svg` — mark-only SVG source
- `preview.html` — visual reference (design-time only; do not ship)
