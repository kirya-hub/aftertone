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
