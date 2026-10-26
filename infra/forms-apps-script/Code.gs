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
  // Лид из формы "Notify me": сайт кладёт адрес в leadEmail (а не в email), чтобы
  // ниже не ушло письмо "Your Booking Confirmed!". Для таблицы и Telegram показываем его
  // как обычный email, а клиенту шлём короткое приветствие (sendLeadWelcomeEmail).
  const isLead = data.service === 'LEAD' && !!data.leadEmail;
  if (isLead) {
    // адрес теперь в колонке Email, поэтому строку "Email: ..." из заметок убираем (старый сайт её туда кладёт)
    const notes = String(data.notes || '').split(/\r?\n/).filter(l => !/^Email:\s/.test(l)).join('\n');
    data = Object.assign({}, data, { email: data.leadEmail, notes: notes });
  }

  const sheet = getOrCreateSheet('Service Bookings');

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Timestamp', 'Service', 'Price', 'Name', 'Phone', 'Email', 'Notes',
      'utm_source', 'utm_campaign', 'utm_content', 'utm_term'
    ]);
  }
  // utm_* добавили 21.10 — дописываем заголовки в уже существующий лист
  if (sheet.getRange(1, 8).getValue() === '') {
    sheet.getRange(1, 8, 1, 4).setValues([['utm_source', 'utm_campaign', 'utm_content', 'utm_term']]);
  }

  // колонка L: когда лиду ушло приветствие (23.10), чтобы считать, сколько писем ушло и сколько ответов
  if (sheet.getRange(1, 12).getValue() === '') sheet.getRange(1, 12).setValue('Welcome sent');

  sheet.appendRow([
    new Date(),
    txt(data.service),
    '€' + data.price,
    txt(data.name),
    txt(data.phone),
    txt(data.email),
    txt(data.notes),
    txt(data.utm_source),
    txt(data.utm_campaign),
    txt(data.utm_content),
    txt(data.utm_term)
  ]);
  const row = sheet.getLastRow();

  const message = `
🎓 <b>NEW SERVICE BOOKING!</b>

📦 <b>Service:</b> ${esc(val(data.service))}
💰 <b>Price:</b> €${esc(val(data.price))}

👤 <b>Name:</b> ${esc(val(data.name))}
📱 <b>Phone:</b> ${esc(val(data.phone))}
✉️ <b>Email:</b> ${esc(val(data.email))}

📣 <b>Ad:</b> ${esc(adLine(data))}

${data.notes ? '📝 <b>Notes:</b>\n' + esc(data.notes) : ''}

⏰ ${formatDate(new Date())}
  `.trim();

  if (!notify) return;
  sendTelegramMessage(message, leadWhatsAppButtons(data));
  sendAdminNotification('New Service Booking', message, data);
  if (isLead) {
    if (sendLeadWelcomeEmail(data.email, data.name, data)) sheet.getRange(row, 12).setValue(new Date());
  } else {
    sendConfirmationEmail(data.email, data.name, data);
  }
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

// true, если на этот адрес ещё можно слать письмо (не больше CLIENT_EMAIL_LIMIT за 6 часов)
function takeEmailSlot(email) {
  const cache = CacheService.getScriptCache();
  const key = 'mail_' + String(email).trim().toLowerCase().slice(0, 200);
  const sent = Number(cache.get(key) || 0);
  if (sent >= CLIENT_EMAIL_LIMIT) {
    Logger.log('Client email limit reached for ' + email);
    return false;
  }
  cache.put(key, String(sent + 1), 21600); // 6 часов — максимум для CacheService
  return true;
}

// Приветствие после подписки "Notify me": подтверждаем подписку и спрашиваем, что нужно
// для подбора (даты, жильё, уровень). Обычное личное письмо, без вёрстки.
function sendLeadWelcomeEmail(email, name, data) {
  if (!email || !takeEmailSlot(email)) return false;

  const isRu = data.lang === 'ru';
  const first = String(val(name)).trim().split(/\s+/)[0];
  // Готовое сообщение в WhatsApp: человек нажимает, и ему не нужно ничего придумывать
  const waText = isRu
    ? 'Здравствуйте! Хочу узнать про ваш следующий лагерь (январь/февраль).'
    : "Hi! I'd like to know about your next camp (January/February).";
  const wa = '<a href="https://wa.me/35797497756?text=' + encodeURIComponent(waText) + '">+357 97 497756</a>';
  const style = 'margin:0 0 12px 0';

  const subject = isRu ? 'Вы в списке - The Padel Camp Cyprus' : "You're on the list - The Padel Camp Cyprus";
  const htmlBody = isRu
    ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">
<p style="${style}">Здравствуйте, ${esc(first)}!</p>
<p style="${style}">Спасибо, что подписались. Следующий лагерь мы планируем на январь или февраль. Какие даты вам подошли бы больше?</p>
<p style="${style}">Просто ответьте на это письмо: «январь», «февраль» или «пока не знаю», либо напишите, какие даты вам удобны. Можно и в WhatsApp: ${wa}.</p>
<p style="${style}">С уважением,<br>Анастасия<br>The Padel Camp Cyprus</p>
<p style="margin:0"><a href="mailto:thepadelcampcy@gmail.com">thepadelcampcy@gmail.com</a><br><a href="https://thepadelcamp.com.cy">thepadelcamp.com.cy</a></p>
</div>`
    : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">
<p style="${style}">Hi ${esc(first)},</p>
<p style="${style}">Thanks for signing up. We're planning our next camp for January or February. Which dates would suit you better?</p>
<p style="${style}">Just reply to this email with "January", "February" or "not sure yet", or tell us the dates that work for you. You can also message us on WhatsApp: ${wa}.</p>
<p style="${style}">Kind regards,<br>Anastasia<br>The Padel Camp Cyprus</p>
<p style="margin:0"><a href="mailto:thepadelcampcy@gmail.com">thepadelcampcy@gmail.com</a><br><a href="https://thepadelcamp.com.cy">thepadelcamp.com.cy</a></p>
</div>`;

  try {
    MailApp.sendEmail({
      to: email,
      replyTo: ADMIN_EMAIL,
      subject: subject,
      htmlBody: htmlBody,
      name: 'The Padel Camp Cyprus'
    });
    return true;
  } catch (error) {
    Logger.log('Lead welcome email error: ' + error);
    return false;
  }
}

function sendConfirmationEmail(email, name, data) {
  if (!email || !takeEmailSlot(email)) return;

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
// Из какой рекламы пришёл клиент (последнее касание с UTM, см. pixels.js на сайте).
// utm_content = адсет, utm_term = объявление.
function adLine(data) {
  if (!data.utm_source) return 'unknown (no UTM: direct, organic or old page)';
  return [data.utm_source, data.utm_campaign, 'adset: ' + (data.utm_content || '-'), 'ad: ' + (data.utm_term || '-')].join(' / ');
}

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

// Кнопка «Написать в WhatsApp» под Telegram-уведомлением о лиде (service начинается с
// "LEAD"): wa.me/<номер лида> с готовым приветствием на языке страницы. Для остальных
// заявок и для мусорных номеров кнопки нет.
function leadWhatsAppButtons(data) {
  if (!/^LEAD/.test(val(data.service))) return null;

  let digits = String(data.phone || '').replace(/\D/g, '');
  if (digits.indexOf('00') === 0) digits = digits.slice(2);
  // Кипрский номер без кода страны (8 цифр, мобильные начинаются с 9)
  if (digits.length === 8 && digits.charAt(0) === '9') digits = '357' + digits;
  // Номер с нулём в начале = без кода страны, ссылка будет битой
  if (digits.charAt(0) === '0') return null;
  // Лишний «национальный» 0 сразу после кода страны (+44 07…, +972 05…) в WhatsApp не открывается.
  // Код страны: 1 цифра (1, 7), 2 цифры (из списка) или 3. Исключения, где 0 — часть номера: Италия 39, Кот-д'Ивуар 225, Бенин 229, Габон 241.
  const cc = /^[17]/.test(digits) ? digits.slice(0, 1)
    : /^(20|27|3[0-4]|36|39|4[013-9]|5[1-8]|6[0-6]|8[1246]|9[0-58])/.test(digits) ? digits.slice(0, 2)
    : digits.slice(0, 3);
  if (digits.charAt(cc.length) === '0' && ['39', '225', '229', '241'].indexOf(cc) === -1) {
    digits = cc + digits.slice(cc.length + 1);
  }
  if (digits.length < 9 || digits.length > 15) return null;

  const name = String(data.name || '').trim();
  const en = 'Hi' + (name ? ' ' + name : '') + '! This is The Padel Camp Cyprus. Thanks for signing up for our updates. How can we help?';
  const text = {
    en: en,
    ru: 'Здравствуйте' + (name ? ', ' + name : '') + '! Это The Padel Camp Cyprus. Спасибо, что оставили заявку. Чем можем помочь?',
    el: 'Γεια σας' + (name ? ' ' + name : '') + '! Εδώ το The Padel Camp Cyprus. Ευχαριστούμε που εγγραφήκατε. Πώς μπορούμε να βοηθήσουμε;'
  }[data.lang] || en;

  return [[{ text: '💬 Написать в WhatsApp', url: 'https://wa.me/' + digits + '?text=' + encodeURIComponent(text) }]];
}

function sendTelegramMessage(message, buttons) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    Logger.log('Telegram not configured (Script Properties)');
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const body = {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: 'HTML'
  };
  if (buttons) body.reply_markup = { inline_keyboard: buttons };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(body),
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
