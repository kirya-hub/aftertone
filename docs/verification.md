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
