# AFTERTONE

An interactive spatial exhibition exploring how a signal becomes a sense of place. Six chapters combine typography, procedural sculptures and scroll-driven motion, with direct controls for perspective and shared paths.

This is a visual concept: it does not process audio or provide accounts, collaboration services or a backend.

## Chapters

| Chapter              | Experience                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| Immersive Experience | A WebGL sculpture introduces the exhibition and responds to the pointer.                                  |
| The Trace            | A ribbon emerges as the first spatial gesture.                                                            |
| Resonance Chamber    | Scrolling changes the camera through a layered chamber.                                                   |
| A Different Here     | Explore the sculpture with horizontal dragging, a keyboard-accessible slider, three viewpoints and Reset. |
| Common Ground        | Select and deselect three independent, intertwined paths.                                                 |
| Afterglow            | A closing sculpture returns the exhibition to a quiet sense of place.                                     |

## Stack

Astro static output, TypeScript, GSAP/ScrollTrigger and Three.js. The Hero owns a native WebGL renderer; the remaining chapters share one Three.js canvas. Fonts and fallback images are served locally.

## Getting started

Use **Node.js 24.22.1** (see `.node-version`) and npm. Dependency versions are pinned in `package-lock.json`.

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:4321>. Development and preview servers bind to loopback; project commands disable Astro telemetry.

## Production build

```sh
npm run build
npm run preview
```

The static output is written to `dist/`. Preview runs locally at <http://127.0.0.1:4321>; use `npm run preview -- --port 4173` to choose another port. These commands do not publish or deploy the site.

## Checks

```sh
npm run check
npm test
npm run format:check
```

Optional full Firefox verification, after building:

```sh
npm run test:browser
```

The browser runner requires already installed Firefox and geckodriver. It finds the binaries, selects free loopback ports and cleans up temporary browser profiles and processes. Override discovery with `FIREFOX_BINARY` and `GECKODRIVER_BINARY` when needed. Generated reports and screenshots stay local.

## Interaction and fallbacks

Chapter links work as native anchors. Perspective supports horizontal dragging, keyboard input and Front / Within / Above presets. Common Ground buttons toggle each path. Reduced motion keeps static compositions and explicit controls. Without WebGL, exported posters preserve the chapters and preset viewpoints; without JavaScript, the exhibition remains readable with native navigation.

The earlier concept is preserved at `/archive/`; `/hero-comparison/` and `/hero-directions/` contain historical prototypes.

## Documentation and limits

- [Architecture](docs/architecture.md)
- [Approved exhibition plan](docs/full-experience-phase-a.md)

The final review covered desktop/mobile Firefox, navigation, controls, reduced motion and fallbacks. Physical-device touch scrolling, Safari/Chromium and hardware-GPU performance have not been verified. Three.js produces a nonblocking bundle-size warning. Browser evidence and intermediate comparisons are retained locally and excluded from the release files.
