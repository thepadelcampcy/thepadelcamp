# Stripe webhook proxy

Cloudflare Worker that Stripe's webhook endpoint actually points at — **not** the Apps Script `/exec` URL directly. This has been true since 2026-09-15: Apps Script's `/exec` sometimes responds with an HTTP 302, and Stripe doesn't follow redirects for webhook responses, so events were silently failing. Re-check the endpoint URL in Stripe Dashboard → Webhooks if this ever seems out of date — this file is a point-in-time snapshot, not a live source of truth.

## What it does

- Verifies `Stripe-Signature` (HMAC-SHA256, with a 5-minute replay window) on every event except `view_content` — that path is a relay from the site's own browser JS ([pixels.js](../../assets/js/pixels.js)), which never carries a Stripe signature, and is instead gated by `VIEWCONTENT_RELAY_TOKEN`.
- Forwards the (unmodified) request body to Apps Script (`APPS_SCRIPT_URL`) and translates its plain-text response into the right HTTP status for Stripe: `OK`/`Ignored`/`Not paid` → 200, `Forbidden` → 403, `Error: ...` or anything else → 502 (so Stripe retries real failures instead of them being silently swallowed).

Two layers of defense on the payment path, intentionally: this Worker's signature check, and Apps Script's own `WEBHOOK_TOKEN` query-param check behind it. Keep both — don't remove the Apps Script check as "redundant" once the signature check landed.

## Secrets (Cloudflare Worker secrets, never in this repo)

- `APPS_SCRIPT_URL` — the real Apps Script `/exec` URL, including its own token.
- `STRIPE_WEBHOOK_SIGNING_SECRET` — from Stripe Dashboard → Webhooks → this endpoint → signing secret. Live-mode only; this Worker doesn't currently handle test-mode traffic.
- `VIEWCONTENT_RELAY_TOKEN` — shared token for the `view_content` relay. Also present (necessarily, since it's a public relay) in the client bundle at [pixels.js:28](../../assets/js/pixels.js#L28) — this is a low-privilege gate by design, not a secret in the usual sense.

Set with `npx wrangler secret put <NAME>` from this directory. **Set secrets before deploying code that depends on them** — deploying the signature check before `STRIPE_WEBHOOK_SIGNING_SECRET` is set means every real Stripe event gets rejected until it is.

## Deploy

```
npx wrangler deploy
```

from this directory. No `package.json` here — `npx wrangler` fetches itself on first run and may prompt a Cloudflare login; that's expected.

## Debugging

`npx wrangler tail` from this directory streams live logs. The Apps Script side (`doPost` in `Код.gs`, project "Padel Camp — Stripe Webhook") is usually already working if requests are reaching it at all — check this Worker layer first when webhooks misbehave.
