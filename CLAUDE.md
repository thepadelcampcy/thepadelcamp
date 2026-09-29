# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Static marketing/booking site for **The Padel Camp Cyprus** (thepadelcamp.com.cy), a padel training camp event. Plain HTML/CSS/JS — no framework, no build step, no package.json. Deployed via GitHub Pages (see `CNAME`).

`infra/forms-apps-script/` is **not** part of the deployed site: it's the repo copy of the Google Apps Script behind `GOOGLE_SCRIPT_URL` in `main.js` (service bookings + thank-you.html post-payment questionnaire → Google Sheet + Telegram). The live code runs in Apps Script; see that folder's README for how to deploy and keep the copy in sync.

## Working locally

There is no build/lint/test tooling in this repo. Just edit the HTML/CSS/JS files directly and preview with any static file server, e.g.:

```
python -m http.server 8000
```

or open the HTML files directly in a browser.

## Architecture

### Bilingual pages via full duplication, not i18n

The site is EN/RU with **no templating or i18n framework** — each language is a fully separate set of HTML files:

- English pages live at the repo root: `index.html`, `partners.html`, `terms.html`, `privacy-policy.html`, `register/*.html`.
- Russian pages live under `ru/`, mirroring the same structure: `ru/index.html`, `ru/partners.html`, `ru/register/*.html`, etc.
- Root-level `*-ru.html` files (`index-ru.html`, `partners-ru.html`, `terms-ru.html`, `privacy-policy-ru.html`) are **legacy redirect stubs** — each is a 12-line meta-refresh page pointing to the corresponding `/ru/...` page. They exist only to preserve old URLs; don't add real content to them.

Because content is duplicated rather than generated, **any structural change (header, modals, footer, form markup) made to an EN page must be manually mirrored in its RU counterpart**, and vice versa. `index.html` and `ru/index.html` are the largest and most important pair (1163 lines each).

All pages share one stylesheet, `assets/css/style.css` (~4400 lines) — there's no per-page or per-language CSS.

### Shared JS, no bundler

- `assets/js/main.js` — all interactive behavior for the main pages: mobile menu, countdown timer, program tabs, FAQ/approach accordions, header scroll effect, venue gallery modal, and every booking/registration form (camp registration, service booking, massage booking, media package).
- `assets/js/pixels.js` — GDPR-gated analytics: shows a cookie consent banner, and only loads Meta Pixel / GA4 / Google Ads (`META_PIXEL_ID`, `GA4_ID`, `GADS_ID` constants at the top) after the user accepts. `trackRegistration`, `trackBooking`, `trackContact` are the event helpers other code calls into; they no-op unless consent was accepted (checked via `localStorage['cookie_consent']`).

### Form submission flow

All forms (registration, massage booking, service booking, media package) funnel through `sendToGoogleSheets()` in `main.js`, which POSTs JSON to a single Google Apps Script Web App URL (`GOOGLE_SCRIPT_URL` constant, `mode: 'no-cors'` so the response isn't read). That script forwards submissions to Google Sheets + Telegram — it isn't part of this repo.

After submit, the JS swaps the modal's inner HTML in place to show a payment screen: a Stripe Checkout link plus a QR code image (`assets/qr/*.jpeg`) for bank transfer, then a WhatsApp deep link (`wa.me/...`) to confirm payment. Stripe links, QR image paths, and prices are hardcoded per price tier directly in the submit handlers in `main.js` — when a price or Stripe link changes, update it there (and in the mirrored RU copy path if the flow differs per language).

### Pages outside the site nav

`docs/*.html` (`email-padel-massage.html`, `email-private-lessons.html`) are standalone HTML email templates, not linked from site navigation and not part of the deployed page structure.

### SEO/meta plumbing

Every page pair cross-references its counterpart via `<link rel="alternate" hreflang="en|ru">` and sets a `canonical` URL — keep these in sync when adding or renaming pages, and update `sitemap.xml` accordingly.

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
