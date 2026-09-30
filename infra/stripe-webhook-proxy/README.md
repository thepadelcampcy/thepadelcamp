# Stripe webhook proxy

Cloudflare Worker that Stripe's webhook endpoint actually points at — **not** the Apps Script `/exec` URL directly. This has been true since 2026-09-15: Apps Script's `/exec` sometimes responds with an HTTP 302, and Stripe doesn't follow redirects for webhook responses, so events were silently failing. Re-check the endpoint URL in Stripe Dashboard → Webhooks if this ever seems out of date — this file is a point-in-time snapshot, not a live source of truth.

## What it does

- Verifies `Stripe-Signature` (HMAC-SHA256, with a 5-minute replay window) on every event except `view_content` — that path is a relay from the site's own browser JS ([pixels.js](../../assets/js/pixels.js)), which never carries a Stripe signature, and is instead gated by `VIEWCONTENT_RELAY_TOKEN`.
- Forwards the (unmodified) request body to Apps Script (`APPS_SCRIPT_URL`) with `redirect: 'manual'` and a 20 s deadline. **Success is decided by the redirect, not the reply body** (since 2026-09-30): Apps Script runs `doPost` during the POST and only then answers 302 to a one-time `script.googleusercontent.com/macros/echo` URL, so a 302 there → 200 `Accepted` to Stripe; the echo is read afterwards in `ctx.waitUntil` for the log only. Any other redirect, a timeout or a fetch error → 502, so Stripe retries (the script dedups by session id). A direct 200 reply is still translated as before: `OK`/`Ignored`/`Not paid` → 200, `Forbidden` → 403, anything else → 502.
- Why: reading the echo is what fails — slow (up to ~33 s), 404 (~21% in a 100-request probe) or an HTML page from a stray `doGet` (~11%) — while `doPost` itself ran in 100/100 probe requests, and a `sleep(10000)` test script showed the 302 waits for `doPost` to finish. Waiting for the echo made Stripe mark delivered events Failed. Because the script's reply no longer reaches Stripe, script failures are caught on the Apps Script side instead: failure alerts in `doPost` and a daily Stripe ↔ Confirmed Payments reconciliation ([Code.gs](../stripe-webhook-script/Code.gs)).

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

Logs are kept (Workers observability is enabled in `wrangler.toml`), so past requests can be read in the dashboard or via the observability API, not only live with `tail`. Each request logs its kind (`view_content`, or the Stripe event type + session id) and one of: `-> echo, accepted` with the POST time; `echo <status> <ms> <first 200 chars>` from the background read (the script's actual reply — `OK`, `Error: ...`, or Google's 404/HTML page); `unexpected redirect <host+path>`; `upstream fetch failed ... timeout`; or `reject: ...` for signature/token failures. Query strings are never logged (they carry the webhook token and one-time echo keys).

## Incidents

**2026-09-30 — Failed deliveries explained, proxy switched to redirect-based success.** Stripe marked `checkout.session.completed` deliveries Failed although the rows were written. Cause: the echo-read failures described above, plus Google holding the POST 12–48 s at times. Every `doGet` Failed in the webhook script's Executions that came through this Worker had a `doPost` Completed seconds before it — no data was lost. The 2026-09-29 incident below is almost certainly the same echo 404.

**2026-09-29 — one-off 502 with a Google "Page Not Found" body, cause never established.** A Dashboard Resend returned 502 whose body was Google's generic "Page Not Found" page. The next Resend, after a redeploy, logged `upstream 200 OK` and succeeded. `wrangler deploy` ships code, not secrets, so `APPS_SCRIPT_URL` was *not* the variable that changed — record this as unresolved, not fixed. The check that matters (a real signed request reaching Apps Script and getting a clean response) now passes reliably.

Diagnostic asymmetry worth remembering, because it caused most of the confusion: a browser GET on the Apps Script URL returns `Script function not found: doGet` when the deployment is live but has no `doGet`; the Worker calls `doPost`. That is a different failure from the "Page Not Found" body above — only the latter says anything about whether the URL resolved. Unconfirmed hypothesis: `APPS_SCRIPT_URL` pointed at a deployment with no `doPost`, so POSTing to `/exec` returns HTTP 404 with that body. To check, POST any JSON to the current URL — a `Script function not found: doPost` 404 confirms it.

