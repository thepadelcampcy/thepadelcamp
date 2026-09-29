// ============================================
// PADEL CAMP - WEBSITE FORMS → GOOGLE SHEETS + TELEGRAM
// ============================================
// Сайт шлёт сюда (GOOGLE_SCRIPT_URL в assets/js/main.js):
//   type: 'service'               — запись на услугу (частный урок и т.п.) с главной
//   type: 'post_payment_details'  — анкета после оплаты на thank-you.html
// Оплаты кемпа/медиапакета идут через Stripe → отдельный скрипт "Padel Camp — Stripe Webhook".
//
// Script Properties (Project Settings → Script Properties):
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

const props = PropertiesService.getScriptProperties();
const TELEGRAM_BOT_TOKEN = props.getProperty('TELEGRAM_BOT_TOKEN');
const TELEGRAM_CHAT_ID = props.getProperty('TELEGRAM_CHAT_ID');

// Admin email for notifications
const ADMIN_EMAIL = 'thepadelcampcy@gmail.com';

// Защита от спама: URL скрипта публичный (он в main.js), поэтому кто угодно может
// слать сюда запросы. В таблицу пишем всегда (реальные данные не теряем), а Telegram
// и письма шлём не чаще NOTIFY_LIMIT_PER_HOUR раз в час, и не больше
// CLIENT_EMAIL_LIMIT писем на один адрес за 6 часов (иначе можно израсходовать
// дневной лимит Gmail письмами на чужие адреса).
const NOTIFY_LIMIT_PER_HOUR = 30;
const CLIENT_EMAIL_LIMIT = 3;

// Main function - handles POST requests from the website
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const type = data.type;
    const notify = !overHourlyLimit();

    if (type === 'service') {
      handleServiceBooking(data, notify);
    } else if (type === 'post_payment_details') {
      handlePostPaymentDetails(data, notify);
    } else {
      Logger.log('Unknown form type: ' + type);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Data received'
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Error: ' + error);
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================
// SERVICE BOOKING
// ============================================
function handleServiceBooking(data, notify) {
  const sheet = getOrCreateSheet('Service Bookings');

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Timestamp', 'Service', 'Price', 'Name', 'Phone', 'Email', 'Notes'
    ]);
  }

  sheet.appendRow([
    new Date(),
    txt(data.service),
    '€' + data.price,
    txt(data.name),
    txt(data.phone),
    txt(data.email),
    txt(data.notes)
  ]);

  const message = `
🎓 <b>NEW SERVICE BOOKING!</b>

📦 <b>Service:</b> ${esc(val(data.service))}
💰 <b>Price:</b> €${esc(val(data.price))}

👤 <b>Name:</b> ${esc(val(data.name))}
📱 <b>Phone:</b> ${esc(val(data.phone))}
✉️ <b>Email:</b> ${esc(val(data.email))}

${data.notes ? '📝 <b>Notes:</b>\n' + esc(data.notes) : ''}

⏰ ${formatDate(new Date())}
  `.trim();

  if (!notify) return;
  sendTelegramMessage(message);
  sendAdminNotification('New Service Booking', message, data);
  sendConfirmationEmail(data.email, data.name, data);
}

// ============================================
// POST-PAYMENT DETAILS (thank-you.html)
// ============================================
function handlePostPaymentDetails(data, notify) {
  const sheet = getOrCreateSheet('Post-Payment Details');

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Timestamp', 'Session ID', 'Booking Type', 'Item', 'Amount',
      'Full Name', 'Phone', 'Email',
      'Experience', 'Frequency', 'Level', 'Shots', 'Improve', 'Competitive',
      'T-Shirt Size', 'Notes', 'Lang', 'Playtomic Level'
    ]);
  }
  // Колонку Playtomic добавили позже — дописываем заголовок в уже существующий лист
  if (sheet.getRange(1, 18).getValue() === '') {
    sheet.getRange(1, 18).setValue('Playtomic Level');
  }

  // старая форма (до новой анкеты) шлёт goals/skills, новая — improve/shots
  const shots = data.shots ? list(data.shots) : val(data.skills);
  const improve = list(data.improve || data.goals);

  sheet.appendRow([
    new Date(),
    val(data.sessionId),
    val(data.bookingType),
    val(data.item),
    val(data.value),
    txt(data.fullName),
    txt(data.phone),
    txt(data.email),
    val(data.experience),
    val(data.frequency),
    val(data.level),
    shots,
    improve,
    val(data.competitive),
    val(data.tshirt),
    txt(data.notes),
    val(data.lang),
    txt(data.playtomic)
  ]);

  let message = `
📝 <b>PLAYER DETAILS (after payment)</b>

📦 <b>Item:</b> ${esc(val(data.item))}${data.value ? ' (€' + esc(data.value) + ')' : ''}
👤 <b>Name:</b> ${esc(val(data.fullName))}
📱 <b>Phone:</b> ${esc(val(data.phone))}
✉️ <b>Email:</b> ${esc(val(data.email))}
`;

  if (data.bookingType === 'camp') {
    message += `
⏳ <b>Playing for:</b> ${esc(val(data.experience))}
📅 <b>Plays:</b> ${esc(val(data.frequency))}
🏅 <b>Playtomic:</b> ${esc(val(data.playtomic))}
🎯 <b>Level:</b> ${esc(val(data.level))}
🎾 <b>Shots / skills:</b> ${esc(shots)}
📈 <b>Wants to improve:</b> ${esc(improve)}
🏆 <b>Competitive:</b> ${esc(val(data.competitive))}
👕 <b>T-Shirt:</b> ${esc(val(data.tshirt))}
`;
  }

  if (data.notes) message += `\n📝 <b>Notes:</b>\n${esc(data.notes)}\n`;
  message += `\n⏰ ${formatDate(new Date())}`;

  if (!notify) return;
  sendTelegramMessage(message.trim());
  // Письмо админу — страховка на случай, если Telegram не доставит. Клиенту письмо
  // не шлём: чек он уже получил от Stripe.
  sendAdminNotification('Player Details (after payment)', message.trim(), data);
}

// ============================================
// ADMIN EMAIL NOTIFICATIONS
// ============================================

function sendAdminNotification(subject, telegramMessage, data) {
  const plainText = telegramMessage
    .replace(/<b>/g, '').replace(/<\/b>/g, '')
    .replace(/<i>/g, '').replace(/<\/i>/g, '');

  const name = data.fullName || data.name || 'Unknown';
  const email = data.email || '-';
  const phone = String(data.phone || '-');

  const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#111;padding:24px 30px;text-align:center;">
              <h1 style="color:#fff;margin:0;font-size:20px;">THE PADEL CAMP — ADMIN</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:30px;">
              <h2 style="color:#111;margin:0 0 20px;font-size:22px;">${subject}</h2>
              <pre style="background:#f8f9fa;padding:20px;border-radius:8px;font-family:Arial,sans-serif;font-size:14px;line-height:1.8;white-space:pre-wrap;color:#333;border:1px solid #e2e8f0;">${plainText}</pre>
              <p style="margin:20px 0 0;font-size:14px;color:#666;">
                Quick actions:
                <a href="https://wa.me/${phone.replace(/[^0-9]/g, '')}" style="color:#25D366;font-weight:bold;">WhatsApp</a> |
                <a href="mailto:${email}" style="color:#2d5f8a;font-weight:bold;">Reply by Email</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    MailApp.sendEmail({
      to: ADMIN_EMAIL,
      subject: '[Padel Camp] ' + subject + ' — ' + name,
      htmlBody: htmlBody,
      name: 'Padel Camp Notifications'
    });
  } catch (error) {
    Logger.log('Admin email error: ' + error);
  }
}

// ============================================
// CLIENT CONFIRMATION EMAIL (service booking)
// ============================================

function sendConfirmationEmail(email, name, data) {
  if (!email) return;

  const cache = CacheService.getScriptCache();
  const key = 'mail_' + String(email).trim().toLowerCase().slice(0, 200);
  const sent = Number(cache.get(key) || 0);
  if (sent >= CLIENT_EMAIL_LIMIT) {
    Logger.log('Client email limit reached for ' + email);
    return;
  }
  cache.put(key, String(sent + 1), 21600); // 6 часов — максимум для CacheService

  const isRu = data.lang === 'ru';

  const subject = isRu ? 'Ваше бронирование подтверждено!' : 'Your Booking Confirmed!';
  const htmlBody = buildEmailHtml(name, data, isRu);

  try {
    MailApp.sendEmail({
      to: email,
      subject: subject,
      htmlBody: htmlBody,
      name: 'The Padel Camp Cyprus'
    });
  } catch (error) {
    Logger.log('Email error: ' + error);
  }
}

function buildEmailHtml(name, data, isRu) {
  const row = (label, value) =>
    `<p style="color:#333;font-size:14px;margin:0 0 8px;"><strong>${label}:</strong> ${value}</p>`;

  const bookingDetails = [
    row(isRu ? 'Услуга' : 'Service', esc(val(data.service))),
    row(isRu ? 'Сумма' : 'Amount', `€${esc(val(data.price))}`)
  ].join('');

  const t = {
    greeting: isRu ? `Здравствуйте, ${esc(val(name))}!` : `Hello, ${esc(val(name))}!`,
    thankYou: isRu
      ? 'Спасибо за бронирование! Мы получили вашу заявку.'
      : 'Thank you for your booking! We have received your request.',
    detailsTitle: isRu ? 'Детали бронирования' : 'Booking Details',
    paymentTitle: isRu ? 'Оплата' : 'Payment',
    paymentText: isRu
      ? 'Чтобы подтвердить оплату, напишите нам в WhatsApp: <a href="https://wa.me/35797497756" style="color:#2d5f8a;font-weight:bold;">+357 97 497756</a>'
      : 'To confirm your payment, message us on WhatsApp: <a href="https://wa.me/35797497756" style="color:#2d5f8a;font-weight:bold;">+357 97 497756</a>',
    contactTitle: isRu ? 'Наши контакты' : 'Contact Us',
    questionsText: isRu
      ? 'Если у вас есть вопросы, свяжитесь с нами:'
      : 'If you have any questions, feel free to reach out:',
    seeYou: isRu ? 'Ждём вас на корте!' : 'See you on the court!',
    team: isRu ? 'Команда The Padel Camp' : 'The Padel Camp Team',
    footer: 'Limassol, Cyprus'
  };

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <tr>
            <td style="background: linear-gradient(135deg, #1a3a5c 0%, #2d5f8a 100%);padding:40px 30px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:26px;letter-spacing:1px;">THE PADEL CAMP</h1>
              <p style="color:#7cb8e0;margin:8px 0 0;font-size:14px;letter-spacing:2px;">CYPRUS 2026</p>
            </td>
          </tr>

          <tr>
            <td style="padding:35px 30px;">
              <h2 style="color:#1a3a5c;margin:0 0 10px;font-size:22px;">${t.greeting}</h2>
              <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 25px;">${t.thankYou}</p>

              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:25px;">
                <tr>
                  <td style="padding:20px;">
                    <h3 style="color:#1a3a5c;margin:0 0 15px;font-size:16px;">${t.detailsTitle}</h3>
                    ${bookingDetails}
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fff8e1;border-radius:8px;border:1px solid #ffe082;margin-bottom:25px;">
                <tr>
                  <td style="padding:20px;">
                    <h3 style="color:#f57f17;margin:0 0 8px;font-size:16px;">${t.paymentTitle}</h3>
                    <p style="color:#555;font-size:14px;line-height:1.6;margin:0;">${t.paymentText}</p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f7ff;border-radius:8px;border:1px solid #bbdefb;margin-bottom:25px;">
                <tr>
                  <td style="padding:20px;">
                    <h3 style="color:#1a3a5c;margin:0 0 8px;font-size:16px;">${t.contactTitle}</h3>
                    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 10px;">${t.questionsText}</p>
                    <p style="color:#333;font-size:14px;line-height:1.8;margin:0;">
                      <strong>WhatsApp:</strong> <a href="https://wa.me/35797497756" style="color:#2d5f8a;">+357 97 497756</a><br>
                      <strong>Email:</strong> <a href="mailto:thepadelcampcy@gmail.com" style="color:#2d5f8a;">thepadelcampcy@gmail.com</a><br>
                      <strong>Web:</strong> <a href="https://thepadelcamp.com.cy" style="color:#2d5f8a;">thepadelcamp.com.cy</a>
                    </p>
                  </td>
                </tr>
              </table>

              <p style="color:#1a3a5c;font-size:16px;font-weight:bold;margin:0 0 5px;">${t.seeYou}</p>
              <p style="color:#777;font-size:14px;margin:0;">${t.team}</p>
            </td>
          </tr>

          <tr>
            <td style="background-color:#1a3a5c;padding:20px 30px;text-align:center;">
              <p style="color:#7cb8e0;font-size:13px;margin:0;">${t.footer}</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// пустое → '-'
function val(v) {
  return (v === undefined || v === null || v === '') ? '-' : v;
}

// массив → "a, b, c" (пустой → '-'); если пришла строка — как есть
function list(arr) {
  if (!Array.isArray(arr)) return val(arr);
  return arr.length ? arr.join(', ') : '-';
}

// true, если за текущий час уведомлений уже больше NOTIFY_LIMIT_PER_HOUR
function overHourlyLimit() {
  const cache = CacheService.getScriptCache();
  const key = 'notify_' + Math.floor(Date.now() / 3600000);
  const n = Number(cache.get(key) || 0);
  cache.put(key, String(n + 1), 3600);
  if (n >= NOTIFY_LIMIT_PER_HOUR) {
    Logger.log('Hourly notify limit reached, skipping Telegram/email');
    return true;
  }
  return false;
}

// Таблица считает "+357..." / "=..." формулой (#ERROR!) — апостроф хранит как текст
function txt(v) {
  const s = String(val(v));
  return /^([=+@]|-.)/.test(s) ? "'" + s : s;
}

// Экранирование для Telegram parse_mode HTML (иначе "<" в тексте клиента ломает отправку)
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getOrCreateSheet(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  return sheet;
}

function sendTelegramMessage(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    Logger.log('Telegram not configured (Script Properties)');
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML'
    }),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() !== 200) {
      Logger.log('Telegram error ' + response.getResponseCode() + ': ' + response.getContentText());
    }
  } catch (error) {
    Logger.log('Telegram error: ' + error);
  }
}

function formatDate(date) {
  const options = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Athens'
  };

  return date.toLocaleDateString('en-US', options);
}

function testTelegramBot() {
  sendTelegramMessage('🎾 <b>Test!</b>\n\nGoogle Apps Script connected successfully! ✅');
}
