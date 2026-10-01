# Stripe Webhook Apps Script

Backend for Stripe webhooks. `Code.gs` here is a **copy** — the code that actually runs lives in Google
Apps Script, project "Padel Camp — Stripe Webhook", in a file named `Код.gs`.

Sibling project in this repo: [`infra/forms-apps-script/`](../forms-apps-script/README.md) handles the
site's forms. This one handles payments only.

## What it does

Stripe → Cloudflare Worker ([`infra/stripe-webhook-proxy/`](../stripe-webhook-proxy/README.md)) → this
script. `doPost` routes by payload:

| input | guard | does | returns |
|---|---|---|---|
| `view_content` | `VIEWCONTENT_RELAY_TOKEN` in the body | Meta CAPI `ViewContent` only | `OK` / `Forbidden` |
| `checkout.session.completed` with `payment_status: paid` | `WEBHOOK_TOKEN` in the query string | Confirmed Payments sheet + Telegram + Meta CAPI `Purchase` + GA4 Measurement Protocol `purchase` | `OK` |
| `checkout.session.completed`, not paid | — | nothing | `Not paid` |
| any other event type | — | nothing | `Ignored` |

Anything unexpected throws and returns `Error: <message>`, which the Worker translates to HTTP 502 so
Stripe retries. **That is deliberate** — see "Order matters" below.

## Why the Worker exists

Stripe's webhook endpoint points at `padelcamp-stripe-webhook-proxy.thepadelcampcy.workers.dev`, not at
this script's `/exec` URL. Apps Script's `/exec` sometimes answers with an HTTP 302, and Stripe does not
follow redirects for webhook responses. The Worker also verifies `Stripe-Signature` before forwarding, and
translates this script's plain-text replies into HTTP statuses.

## Order matters in `doPost`

The sequence is deliberate and should not be rearranged:

1. **Dedup first** (`paymentRowExists`) — before any Stripe API call, so retries cost nothing.
2. **Write the sheet row** (`appendPaymentRow`) — before anything that can throw. Money must be recorded
   even if attribution parsing or a downstream send fails.
3. **`parseAttribution` in its own try/catch** — since the row is already written, a throw here would
   produce `Error:` → 502 → Stripe retry → dedup hits → `OK`, and Meta CAPI, GA4 and Telegram would then
   never run for that purchase. The guard turns a crash into a purchase with no attribution.
4. **Meta CAPI, then GA4, then Telegram** — Telegram is last because it is the least reliable and the most
   likely to throw; it also has an email fallback so a failure is not silent.

## Where it lives

- Google Sheet `1eRs41v1VRVIKTOdovtrg9B1agOVEF6Bbw3zqC3Zz1jM` → sheet **Confirmed Payments**, columns
  `Timestamp, Session ID, Item, Amount, Currency, Name, Email`. `paymentRowExists` matches on column 2.
- Execution as **Me**, access **Anyone** (Stripe posts without auth; the Worker is what authenticates the
  caller, via the HMAC signature check, and this script's own `WEBHOOK_TOKEN` query-param check sits behind
  it as a second layer).

## Script Properties (Project Settings → Script Properties)

Never commit any of these values.

- `WEBHOOK_TOKEN` — query-param guard, checked in `doPost`.
- `GA4_API_SECRET` — GA4 Measurement Protocol secret.
- `GGL_STRP_READ_KEY` — Stripe restricted key, **Checkout Sessions: Read only**. Used to fetch `line_items`,
  because `checkout.session.completed` does not include them.
- `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN` — Conversions API.
- `VIEWCONTENT_RELAY_TOKEN` — guards the `view_content` relay. Also present in the public client bundle at
  `assets/js/pixels.js`; that is by design, it is a low-privilege token separate from `WEBHOOK_TOKEN`.
- `TELEGRAM_BOT_TOKEN` — `TELEGRAM_CHAT_ID` is the one value committed here, following the
  `forms-apps-script` precedent: it is `-1003709424120`. The old `-5208249757` is a dead pre-supergroup ID.

The web app `/exec` URL is **not** committed — it carries `WEBHOOK_TOKEN` in its query string. It lives in
the Worker's `APPS_SCRIPT_URL` secret (`npx wrangler secret put APPS_SCRIPT_URL`). Rotating the URL means
re-setting that secret too.

### Rotating a Script Property: no deploy needed

Script Properties apply **instantly** to every version and every deployment. Changing one takes effect on
the next request, so there is nothing to deploy afterwards. If you do end up in the Deploy menu (for a code
change), the two paths look alike but behave differently:

| Path | What it does | Consequence |
|---|---|---|
| **Deploy → Manage deployments → ✏️ existing deployment → Version: New version → Deploy** | publishes the current code under the existing deployment | `/exec` URL unchanged, nothing else to do — this is step 4 of "How to change" below |
| **Deploy → New deployment** | creates a **new** deployment with a **new** `/exec` URL | the Worker keeps posting to the old URL; the new one is only visible in the Apps Script UI |

If a new deployment is created by accident, every Stripe webhook gets a 502. Money still arrives and the
buyer is unaffected, but the Confirmed Payments row, Meta CAPI, GA4 Measurement Protocol and Telegram are
all skipped, and Stripe eventually disables the endpoint. Recovery is to either delete the stray deployment
or `npx wrangler secret put APPS_SCRIPT_URL` with the new URL and redeploy the Worker.

So for `GGL_STRP_READ_KEY`, the whole procedure is: create the new restricted key in Stripe → write it in
Project Settings → Script Properties → verify a real payment logs with `line_items` → revoke the old key.
No deployment step at all. Keep the new key at **Checkout Sessions: Read** and nothing else, since
`Code.gs` only fetches `line_items` with it.

## Item names

`resolveItemFromStripe` reads `lookup_key` off each Stripe Price and uses it as the short slug sent to Meta
CAPI `content_name` and GA4 `item_name`, so prices and promo codes can change without touching this script.
Set them in Stripe Dashboard → Prices:

| Price | `lookup_key` |
|---|---|
| Morning Camp | `morning_camp` |
| Evening Camp | `evening_camp` |
| Weekend Camp | `weekend_camp` |
| Media Package | `media_package` |

These must match the `data-purchase-item` slugs in the site's HTML. Until they are set, the slug falls back
to Stripe's free-text `li.description` and the item names stop matching. The script logs
`lookup_key missing for price …` when that happens.

## How to change

1. Edit `Code.gs` here.
2. Paste the whole file into the Apps Script editor, Ctrl+S.
3. Run `testParseAttribution` (select it → Run) and read the four `Logger` lines. It writes nothing and
   calls no external service, so it is safe on the live deployment.
4. **Deploy → Manage deployments → ✏️ the existing deployment → Version: New version → Deploy.**

   **Do not use "New deployment".** It creates a new web app URL, the Worker's `APPS_SCRIPT_URL` secret
   still points at the old one, and every Stripe webhook starts failing with a 502 while the Apps Script
   logs nothing useful. This is the failure that was investigated on 2026-09-29.
5. Commit the change here.

If someone edits the script directly in the Apps Script editor, copy it back here so the repo copy does not
go stale. That file was outside this repo until 2026-09-30, which is what made that investigation slow.
