# Verification record

## Stage 1 — static site

- Node 24.22.1, Astro 7.4.8. Production build succeeded.
- `astro check`: 0 errors, 0 warnings, 0 hints.
- Actual Firefox 158 / geckodriver 0.37.1: hero, approach, demo, FAQ screenshots at 1440×900 and 390×844; no horizontal overflow, FAQ disclosure opens; no BiDi console error entries.
- Browser window sizing initially hit Firefox's 500px minimum. Harness corrected to BiDi `browsingContext.setViewport`, asserts exact CSS viewport dimensions. The final stage-1 mobile images are actual 390px captures.
- Built-in browser host unavailable; no retry. Existing Firefox used without installing browser software.
- Visual inspection: desktop/mobile hero and approach, desktop demo. Interactive demo controls deliberately disabled at this stage.
- Screenshots: `screenshots/stage1-{1440,390}-{hero,approach,demo,faq}.png` (local artifacts, not versioned).
