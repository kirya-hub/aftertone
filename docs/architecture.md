# AFTERTONE / Acoustic Stage

Approved: Astro + TypeScript + GSAP/ScrollTrigger, static output. No backend, framework islands, canvas, authentication, storage, audio, or deployment.

## Boundaries

- Astro components own semantic content and static SVG illustrations. HTML is complete without JS.
- CSS owns layout, native sticky positioning, responsive design, focus and disclosure states.
- `motion.ts` owns GSAP choreography and responsive/reduced-motion cleanup.
- `scene-state.ts` owns bounded source coordinates, selection and position descriptions; pure functions make meaningful behavior testable.
- `demo.ts` owns pointer/keyboard/range bindings and synchronizes a single demo instance with its SVG and inspector.
- `main.ts` initializes and cleans up the page modules.

Fonts: self-hosted Manrope (editorial geometric display and readable body) and IBM Plex Mono (coordinates, source IDs, instrumentation). Original SVG/CSS diagrams, no external image dependencies. No commercial claims, testimonials or invented customer metrics. Capability demonstrations are explicitly conceptual.

## Motion map

1. Hero: a short shell/source/label entrance; headline is visible immediately.
2. Section reveals: shallow translation, never hiding primary content.
3. Spatial narrative: native sticky visual beside three readable chapters, scroll-linked source movement, shell perspective, contour stroke and orbit. Mobile uses the same static scene and readable text with smaller reveals. No ScrollTrigger pin, no scroll hijacking.
4. Playground: user-driven source positions; selected state, connection lines and text reflect actual state. No fake audio control.
5. Reduced motion: no GSAP choreography, native instant anchors, all information still present. No endless timelines.

## Stages and acceptance

1. Static content, visual system, responsive composition. Astro check + build + initial browser review.
2. Responsive GSAP lifecycle. Check + build + story/scroll/reduced-motion browser review.
3. Demo and supporting interactions. State tests + check + build + keyboard/pointer browser tests.
4. Production browser matrix, measured asset budgets, documented limitations, final checks and commit.

Native controls and static fallback reduce accessibility and failure risk. All dependencies are local and locked. Scene state is transient; no data is sent. SVG avoids a rendering engine and heavy media transfer. No infrastructure cost or remote services are required.
