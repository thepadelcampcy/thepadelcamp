# Forms Apps Script

Backend for the website's forms. `Code.gs` here is a **copy** — the code that actually runs lives in Google Apps Script.

## What it does

The site POSTs JSON to `GOOGLE_SCRIPT_URL` (`assets/js/main.js`). `doPost` routes by `data.type`:

| `type` | Sent from | Writes to sheet | Also |
|---|---|---|---|
| `service` | "Book 1-on-1 / 2-on-1" form on the home pages (EN/RU/EL) | Service Bookings | Telegram, admin email, confirmation email to the client |
| `post_payment_details` | Follow-up questionnaire on `thank-you.html` | Post-Payment Details | Telegram, admin email (backup for Telegram) |

Anything else is ignored. Sheet rows are always written; Telegram/emails are rate-limited (30/hour, max 3 client emails per address per 6h) because the URL is public.

Camp **payments** are handled elsewhere: Stripe → Cloudflare Worker (`infra/stripe-webhook-proxy/`) → the separate Apps Script "Padel Camp — Stripe Webhook" (sheet Confirmed Payments). That script is not in this repo.

## Where it lives

- Google Sheet **"Padel Camp Registrations"** (owner thepadelcampcy@gmail.com) → Extensions → Apps Script.
- Web app deployment ID: `AKfycbyRFc1LgrjR1okUiCvZRepdiKKhM0u_BcIfJz0pfpJhnqDvkXpHCeUUQYiEVpt18CvLOA` (must match `GOOGLE_SCRIPT_URL`).
- Deployment settings: Execute as **Me**, access **Anyone**.

## Script Properties (Project Settings → Script Properties)

- `TELEGRAM_BOT_TOKEN` — never commit it here.
- `TELEGRAM_CHAT_ID` — group "Padel Camp Registrations". It was upgraded to a supergroup in Sept 2026; the old ID `-5208249757` no longer works, the current one is `-1003709424120`.

Changing a property takes effect immediately, with no redeploy needed.

## How to change the code

1. Edit `Code.gs` here.
2. Paste the whole file into the Apps Script editor (Ctrl+A → paste), Ctrl+S.
3. Optional: run `testTelegramBot` to confirm Telegram works.
4. **Deploy → Manage deployments → ✏️ the existing deployment → Version: New version → Deploy.**
   Do **not** use "New deployment": it creates a new URL and the site stops sending forms.
5. Commit the change here.

If someone edits the script directly in the Apps Script editor, copy it back here so the repo copy doesn't go stale.
