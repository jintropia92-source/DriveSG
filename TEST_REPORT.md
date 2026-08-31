# DriveSG self-check report

This records the checks performed before packaging the consolidated iPhone Safari build.

## Automated/static checks passed

- `node --check boot.js`
- `node --check app.js`
- `python -m py_compile serve.py`
- Local HTTP smoke check returned `200 OK` for `index.html`.
- Every JavaScript `getElementById(...)` reference was checked against `index.html`; no referenced element IDs were missing.
- Core math test: project → unproject round-trip passed.
- Singapore boundary guard test: Woodlands accepted; a Johor-side latitude rejected.
- Road closest-point geometry test passed.
- Lane-aware road width calculation test passed.
- Merged road quad generation test passed.

## iPhone-class layout checks

A headless Chromium layout harness was used at **956 × 440**, touch/mobile emulation, DPR 3. This was a UI geometry check, not a substitute for Safari/WebGL testing.

Passed:

- Document viewport and scroll area remained exactly 956 × 440: no page overflow.
- Driving controls fit within the viewport.
- Location panel fit within the viewport.
- All eight preset starting areas fit on one landscape screen after the compact 3-column adjustment; panel `scrollHeight == clientHeight` in the layout test.
- Portrait 440 × 956 switched to the rotate-to-landscape gate.

## Reliability/design review completed

- iPhone safe areas use `env(safe-area-inset-*)`.
- `100dvh` plus `visualViewport` resize handling is used for Safari browser-chrome changes.
- Analog steering uses pointer capture and returns to centre on release/cancel.
- GO/BRAKE input clears on blur, cancel and lost pointer capture.
- Driving input is suppressed while the location panel is open.
- Browser gestures/context menu are suppressed over the game surface.
- WebGL pixel ratio is capped and adaptively lowered if measured FPS falls.
- Road meshes are merged instead of creating one draw call per segment.
- Buildings use `InstancedMesh` buckets instead of one draw call per building.
- Road proximity uses a 100 m spatial index rather than scanning every segment for routine on-road checks.
- Background road refresh fetches/builds before swapping, so a failed refresh keeps the current playable world.
- Manual location changes invalidate older background-refresh work to avoid stale-map race conditions.
- First-load live-map failure falls back to bundled demo roads.
- Mid-drive live-map refresh failure does not interrupt the currently loaded road world.
- Three.js boot tries three independent CDN sources.

## What I cannot confirm in this build environment

The build container cannot resolve the external CDN/Overpass hosts used by the live game. Therefore **I cannot confirm actual iPhone Safari WebGL frame rate, live Overpass response behaviour, or end-to-end real-device touch feel from this environment**.

Those require a real iPhone Safari smoke test after the folder is deployed to an HTTPS URL. The package is designed to make that test useful rather than fragile: it has explicit loading states, a demo-road fallback, adaptive rendering and non-destructive background map refreshes.
