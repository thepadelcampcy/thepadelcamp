# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Static marketing/booking site for **The Padel Camp Cyprus** (thepadelcamp.com.cy), a padel training camp event. Plain HTML/CSS/JS — no framework, no build step, no package.json. Deployed via GitHub Pages (see `CNAME`).

The repo also holds a few things that are **not** part of the deployed site: `infra/stripe-webhook-proxy/` (a small Cloudflare Worker that proxies Stripe webhook POSTs to the Google Apps Script backend, worked around because Apps Script's 302 redirect breaks Stripe's webhook delivery — deployed separately via `wrangler`, not GitHub Pages), `infra/forms-apps-script/` (repo copy of the Google Apps Script behind `GOOGLE_SCRIPT_URL` in `main.js` — service bookings + thank-you.html post-payment questionnaire → Google Sheet + Telegram), `infra/stripe-webhook-script/` (repo copy of the separate "Padel Camp — Stripe Webhook" Apps Script — Confirmed Payments sheet + Telegram + Meta CAPI + GA4 Measurement Protocol, fed by the Worker above), and `marketing/` (social media content calendars/briefs, not code). Both Apps Script copies are copies: the live code runs in Google Apps Script, and each folder's README says how to deploy without changing the web app URL.

## Deploy

No CI — GitHub Pages serves directly from the `main` branch (no `.github/workflows`). Pushing to `main` deploys to production (thepadelcamp.com.cy) within a minute or two. To preview changes, do it locally (e.g. `npx http-server`) or via a temporary tunnel (e.g. `npx cloudflared tunnel --url http://localhost:PORT`) before pushing.

**There is a second live site: `old.thepadelcamp.com.cy`** (the previous design). Its source is in the private repo `thepadelcampcy/padelcamp-classic` — it is **not** in this repository, and there is no shared source of truth. It is not staging: it accepts real payments and is indexable. It shares the Stripe Payment Links, the GA4 measurement ID, the Meta Pixel ID and the forms Apps Script URL with the main site, so purchases from it are recorded in the same sheet and the same Telegram and are *not* a separate funnel. But **changes pushed here do not reach it** — after changing `assets/js/pixels.js`, `assets/js/main.js` or `thank-you.html`, decide explicitly whether `old.` needs the same edit and apply it there separately. It has already drifted in `main.js` and in `privacy-policy.html`. Its local clone is `C:\Users\igora\OneDrive\Рабочий стол\padelcamp-classic` (pushing to its `main` deploys `old.` via Cloudflare Pages in ~1 min, not GitHub Pages — its `CNAME` file still says `thepadelcamp.com.cy`, a leftover from the shared history that Cloudflare ignores) — edit `old.` there, `git pull` first, and don't use the `classic` remote of this repo for it, so the two histories can't be pushed into each other. Google Consent Mode v2 has been ported to both sites (old. in `3e0c6c7`, 01.10.2026), so the two now measure the same way; anything changed here afterwards still needs porting separately.

**`style.css` and `main.js` are cache-busted with a `?v=N` query string** on every single HTML page (20+ files). Whenever you change either file, bump `N` in *all* pages that reference it, not just the one you're testing — otherwise returning visitors' browsers keep serving the stale cached copy. Grep for `style.css?v=` / `main.js?v=` to find every reference before bumping.

## Working locally

There is no build/lint/test tooling in this repo. Just edit the HTML/CSS/JS files directly and preview with any static file server, e.g.:

```
python -m http.server 8000
```

or open the HTML files directly in a browser.

## Architecture

### Trilingual pages via full duplication, not i18n

The site is EN/RU/EL with **no templating or i18n framework** — each language is a fully separate set of HTML files:

- English pages live at the repo root: `index.html`, `partners.html`, `terms.html`, `privacy-policy.html`, `register/*.html`.
- Russian pages live under `ru/`, mirroring the same structure: `ru/index.html`, `ru/partners.html`, `ru/terms.html`, `ru/privacy-policy.html`, `ru/register/*.html`, etc.
- Greek pages live under `el/`, but with **narrower coverage** than EN/RU — only `el/index.html`, `el/partners.html`, and `el/register/*.html` exist (no `el/terms.html` or `el/privacy-policy.html`).
- Root-level `*-ru.html` files (`index-ru.html`, `partners-ru.html`, `terms-ru.html`, `privacy-policy-ru.html`) are **legacy redirect stubs** — each is a 12-line meta-refresh page pointing to the corresponding `/ru/...` page. They exist only to preserve old URLs; don't add real content to them.
- `register/`, `ru/register/`, and `el/register/` each also contain `3-day.html`, `5-day.html`, and `5-day-book.html` — these are **orphaned leftovers from a previous camp-length lineup** (before the current 2/4/6-day structure) and aren't linked from anywhere live. Don't treat them as broken pages to fix; leave them alone unless asked.

Because content is duplicated rather than generated, **any structural change (header, modals, footer, form markup) made to an EN page must be manually mirrored in its RU (and, where it exists, EL) counterpart**, and vice versa. `index.html`, `ru/index.html`, and `el/index.html` are the largest and most important set.

All pages share one stylesheet, `assets/css/style.css` (~4400+ lines) — there's no per-page or per-language CSS.

### Shared JS, no bundler

- `assets/js/main.js` — all interactive behavior for the main pages: mobile menu, countdown timer, program tabs, FAQ/approach accordions, header scroll effect, venue gallery modal, and every booking/registration form (camp registration, service booking, massage booking, media package).
- `assets/js/pixels.js` — analytics and consent: shows a cookie consent banner, and runs in Google Consent Mode v2 (advanced). **GA4 loads on every page view with all four v2 signals denied**, so declining or ignoring the banner still produces cookieless measurement pings (`gcs=G100`, no `_ga` cookie) — that is why `loadGA4()` is called before the consent branch in `DOMContentLoaded`. Meta Pixel / Google Ads / Microsoft Clarity (`META_PIXEL_ID`, `GA4_ID`, `GADS_ID`, `CLARITY_ID` at the top) remain strictly opt-in and load only after Accept. `trackRegistration`, `trackBooking`, `trackContact`, `trackPurchase`, `trackViewContent` and `trackConfirmedPurchase` send their `gtag('event', …)` regardless of consent, and gate only their Meta and Clarity calls behind `hasConsented()` (`localStorage['cookie_consent'] === 'accepted'`); `buildStripeAttributionParam` stays gated separately because it packs `_fbc`/`_fbp`/GA4 `client_id` into a Stripe URL.

### Form submission flow

All forms (registration, massage booking, service booking, media package) funnel through `sendToGoogleSheets()` in `main.js`, which POSTs JSON to a single Google Apps Script Web App URL (`GOOGLE_SCRIPT_URL` constant, `mode: 'no-cors'` so the response isn't read). That script forwards submissions to Google Sheets + Telegram — it isn't part of this repo.

After submit, the JS swaps the modal's inner HTML in place to show a payment screen: a Stripe Checkout link plus a QR code image (`assets/qr/*.jpeg`) for bank transfer, then a WhatsApp deep link (`wa.me/...`) to confirm payment. Stripe links, QR image paths, and prices are hardcoded per price tier directly in the submit handlers in `main.js` — when a price or Stripe link changes, update it there (and in the mirrored RU copy path if the flow differs per language).

### thank-you.html links

Every Stripe Payment Link (camps, media, the three massage links that aren't in this repo) redirects to `thank-you.html?type=…&item=…&value=…&session_id={CHECKOUT_SESSION_ID}`. The page reports a browser Purchase **only** when `session_id` starts with `cs_` — anything else is not a Stripe sale. A new Payment Link must keep `session_id={CHECKOUT_SESSION_ID}` in its redirect, or its browser Purchase silently disappears. The questionnaire is English-only by design.

Links the owners send by hand (base `https://thepadelcamp.com.cy/thank-you.html`):
- **Offline client** (cash or barter, barter counts as a sale): `?offline=1&item=morning_camp` — once per purchase. Nothing on open; after the questionnaire is submitted, a Meta-only Purchase goes out with the entered email/phone, amount from `itemPrices` in the page (morning_camp 770, evening_camp 890, weekend_camp 380, media_package 130, massage-30/60/75 = 45/60/75). Not sent to GA4.
- **Resend** to a Stripe payer, or the link for other participants of a multi-seat order: take `cs_…` from the Confirmed Payments sheet, `?session_id=cs_…&item=…&resend=1`. Questionnaire works, no Purchase.
- **Test**: append `&test=1` to any link — no Purchase anywhere. All three flags (`offline`, `resend`, `test`) work with any value or none (`&test`, `test=2`, `&offline`). The questionnaire still posts to the sheet and Telegram, so delete test rows there.

**Secrets never live in this repo.** Stripe/Telegram tokens and the webhook signing secret live in Google Apps Script's Script Properties or Cloudflare Worker secrets (`npx wrangler secret put` in `infra/stripe-webhook-proxy/`) — never hardcoded in a committed file. This repo is public via GitHub Pages, so anything committed here is permanent regardless of later edits or history rewrites.

### Header logo has two swapped images tied to scroll state

The sticky header shows a large logo (`assets/images/logo-large.png`/`.webp`) before scrolling and swaps to a smaller one (`assets/images/logo.png`/`.webp`) once scrolled, via a `.logo-img-large`/`.logo-img-small` pair of `<picture>` elements toggled by CSS off the `.scrolled` class. `main.js` adds `.scrolled` to `.header` once `window.pageYOffset > 50`.

Sizing/position rules for this exist twice — once unscoped (desktop) near the top of `style.css`, once inside the `@media (max-width: 768px)` block (mobile) — and they don't cleanly layer: the unscoped `.header.scrolled .logo.logo-center` rule has *higher specificity* (more chained classes) than a plain mobile-only `.logo.logo-center` override, so it silently wins on mobile too unless the mobile override repeats the full `.header.scrolled .logo.logo-center` selector. When touching header/logo CSS, check both blocks and match specificity, not just add a rule that "should" apply at that breakpoint. Also, `position` (`relative` vs `absolute`) can't be CSS-transitioned smoothly — animating a scroll-triggered position swap looks janky; these rules intentionally use `transition: none` on the logo/position properties instead.

### Pages outside the site nav

`docs/*.html` (`email-padel-massage.html`, `email-private-lessons.html`) are standalone HTML email templates, not linked from site navigation and not part of the deployed page structure.

### SEO/meta plumbing

Every page cross-references its EN/RU (and EL, where it exists) counterparts via `<link rel="alternate" hreflang="en|ru|el">` and sets a `canonical` URL — keep these in sync when adding or renaming pages, and update `sitemap.xml` accordingly.

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
