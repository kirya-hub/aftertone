# Verification record

## Stage 1 — static site

- Node 24.22.1, Astro 7.4.8. Production build succeeded.
- `astro check`: 0 errors, 0 warnings, 0 hints.
- Actual Firefox 158 / geckodriver 0.37.1: hero, approach, demo, FAQ screenshots at 1440×900 and 390×844; no horizontal overflow, FAQ disclosure opens; no BiDi console error entries.
- Browser window sizing initially hit Firefox's 500px minimum. Harness corrected to BiDi `browsingContext.setViewport`, asserts exact CSS viewport dimensions. The final stage-1 mobile images are actual 390px captures.
- Built-in browser host unavailable; no retry. Existing Firefox used without installing browser software.
- Visual inspection: desktop/mobile hero and approach, desktop demo. Interactive demo controls deliberately disabled at this stage.
- Screenshots: `screenshots/stage1-{1440,390}-{hero,approach,demo,faq}.png` (local artifacts, not versioned).

## Stage 2 — meaningful motion

- `astro check`: 0 errors/warnings/hints. Production build passed.
- Firefox: hero entrance; three scroll chapter states (active 0/1/2); fast bottom/top scroll; resize to 390px; desktop shell transforms reverted to identity on mobile; reduced-motion preference produced the static scene. No console errors.
- Visual inspection: animated hero and intermediate chapter 2. Screenshots: `stage2-hero.png`, `stage2-story-{0,1,2}.png`, `stage2-mobile-story.png`, `stage2-reduced-story.png`.
- A test initially expected CSS `none` after GSAP cleanup; Firefox correctly retained an equivalent identity SVG matrix. The assertion now accepts both representations; no movement remained.

## Stage 3 — interactive playground

- Five state tests passed (reset independence, valid selection, immutable bounded movement, non-finite input, direction/coordinate semantics).
- `astro check`: 0 errors/warnings/hints after adding local `@types/node` for test typing. Production build passed.
- Real Firefox WebDriver input: select source; source arrow key; native slider keyboard adjustment; mouse drag; connection line synchronization; reset; source selection when markers overlap; mobile menu link closes menu; FAQ Enter opens disclosure. No horizontal overflow or console errors.
- Firefox WebDriver emulated **touch pointer** drag passed at 390×844. This is not a physical-device test.
- Native horizontal range ArrowDown decreases its value, as expected. Test expectation corrected; source ArrowDown still moves toward the bottom of the scene.
- Screenshots inspected: `stage3-desktop-demo-moved.png`, `stage3-mobile-demo-field.png`. Also captured inspector and mobile menu.

## Stage 4 — production validation and final review

Production URL: `http://127.0.0.1:4173`. Firefox 158.0 / geckodriver 0.37.1, Node.js 24.22.1. Full results: `browser-results.json`; asset sizes: `performance.json`.

### Results

- Production build passed. `astro check`: **0 errors, 0 warnings, 0 hints**. **5/5** state tests passed. `prettier --check .` passed. `git diff --check` passed. ESLint is not configured; formatting is not described as lint.
- Exact CSS viewports **1440×900, 1280×800, 768×1024, 390×844, 360×844** all passed. All major sections and intermediate spatial story states were captured. No horizontal overflow in the checked states.
- Three primary CTA links reach the playground; all anchor targets exist; anchor refresh restores the initial scene. Fast scrolling down/up, resize during the story and narrow refresh passed. No ScrollTrigger pin spacers are used.
- Mouse drag, source selection, SVG line sync, native sliders, arrow keys, Shift arrows, movement boundaries, overlap selection and reset passed. Firefox WebDriver emulated touch drag passed; physical touch hardware was not tested.
- Mobile menu opens, closes on its link and Escape; FAQ opens with pointer and Enter. Skip link and keyboard focus indicator checked; range `aria-valuetext` reflects coordinates.
- Reduced-motion scene stays static and the demo still works. With JavaScript disabled, content, SVG, native menu and FAQ remain usable; disabled scene controls have a noscript explanation.
- **0 console error entries** in the normal and reduced-motion Firefox sessions.
- Screenshots inspected individually at key points and via five overview sheets covering every main section. `screenshots/overview-{1440,1280,768,390,360}.png` are local overview artifacts. Final individual captures use `final-*` names. Screenshot PNGs are intentionally not committed.

### Measurements and scope

- All emitted JS: **47,235 bytes gzip (46.1 KiB)**, calculated from the production file. Raw JS: 122,035 bytes.
- Total page assets, including HTML/CSS/JS, both fonts and favicon: **241,372 bytes (235.7 KiB)** raw. Both target size budgets are met. Font license text files are excluded from transfer totals; they are not requested by the page.
- First-load Resource Timing transfer (navigation + 5 resources): **107,727 bytes (105.2 KiB)** on the local preview server. This is an observed transfer, distinct from calculated gzip sizes.
- Firefox LCP observations from the final local run: **128 / 60 / 47 / 50 / 48 ms**, in viewport order above. The first is a fresh browser session; later navigations can use browser cache. Unthrottled loopback measurements are not deployment, slow-network or field benchmarks.
- Firefox does not expose `layout-shift` in `PerformanceObserver.supportedEntryTypes`. **CLS is unmeasured**, not reported as zero. FPS and Lighthouse scores were not measured.
- No automated full WCAG audit, screenreader testing, other browser engine, physical phone or slow-network verification. Basic keyboard and contrast checks are narrower than an accessibility certification.

### Two final visual refinement iterations

1. A CSS hover transition competed with GSAP's entrance transform on the hero CTA, leaving 14px of offset. GSAP now animates only CTA opacity; a browser assertion checks the final gap to its caption. Also improved narrow hero wrapping, body readability and accent contrast (final large coral-section emphasis exceeds 3:1).
2. Line breaks hidden on mobile had joined words in some subheadings. Added explicit spaces and browser regression assertions. No further automatic visual refinement performed.

The no-JavaScript harness initially waited on an asynchronous font Promise and timed out. It now skips that asynchronous wait when page scripting is disabled; the actual no-JS scenario passed. The browser's 500px minimum window size was avoided throughout final testing by using exact BiDi viewports.

Own code/diff review checked DOM text updates, source bounds, pointer cancellation/capture, listener disposal, reduced-motion cleanup, local assets and no unrequested remote operations. No independent agent/session review was performed, as requested. No agents, backend, audio assets, canvas, extra animation libraries, publishing or system configuration changes were introduced.
