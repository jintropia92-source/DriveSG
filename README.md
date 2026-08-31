# DriveSG — iPhone Safari build

DriveSG is a Singapore-only, mobile-browser driving prototype designed around **iPhone Safari in landscape orientation**.

## What this build focuses on

- Two-thumb, landscape iPhone controls.
- Analog drag steering instead of tiny left/right buttons.
- Separate GO and BRAKE/reverse pedals with large touch targets.
- Real Singapore roads loaded from OpenStreetMap via Overpass.
- Background road-world refreshing as the car travels, rather than a hard local-world edge.
- Draw-call-conscious mobile rendering: merged road geometry and instanced simplified buildings.
- Spatially indexed road proximity checks for cheaper on-road detection.
- Adaptive internal render resolution to protect frame rate on mobile.
- Safari safe-area support, dynamic viewport handling, gesture suppression and portrait rotate gate.
- Location presets, Singapore search, random start and optional “Near me”.
- Last starting location remembered locally on the device.
- Bundled demo road graph if the first live road request fails.
- Multiple CDN fallbacks for the Three.js runtime dependency.

## Run locally

From this folder:

```bash
python serve.py
```

Then open the shown URL. For a real iPhone, the files need to be hosted on a URL the phone can reach (for example a simple HTTPS static host).

## Important runtime dependencies

The browser needs internet access for:

1. Three.js on first page load (the boot loader tries jsDelivr, cdnjs, then unpkg).
2. Live OpenStreetMap/Overpass road data.
3. Nominatim only when using text location search.

If Overpass fails on the initial load, DriveSG uses its bundled demo road network. If a background road refresh fails while already driving, it keeps the current loaded world rather than interrupting the drive.

## Product scope

This package intentionally prioritises **one good iPhone Safari experience**. Desktop keyboard handling remains only as a development convenience and is not part of the product UI.
