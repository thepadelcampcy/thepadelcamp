// =====================================================================
// Собрано на основе точного текущего кода, который ты прислал — это
// уже не реконструкция, а твой реальный Код.gs + все правки плана:
//   - parseAttribution() вместо .split('||') (base64url + фолбэк на старый формат)
//   - дедуп ДО обращения к Stripe API (paymentRowExists/appendPaymentRow вместо logPayment)
//   - resolveItemFromStripe теперь возвращает {label, slug}: label — человекочитаемое
//     имя для таблицы/Telegram, slug — короткое стабильное имя (lookup_key) для Meta/GA4
//   - notifyTelegram: muteHttpExceptions + email-фолбэк при сбое, вызывается последним
//   - убран мёртвый код (testMetaCAPI, testGA4, testStripeLookup)
//
// Всё остальное (doPost-скелет, sendToMetaCAPI, sendViewContentToMetaCAPI,
// sendToGA4, sha256Hex) — дословно твой текущий код, без изменений.
//
// Правка 2026-09-30: разбор client_reference_id обёрнут в try/catch. Раньше
// исключение здесь уходило в общий catch → 'Error: ...' → Worker отдавал 502 →
// Stripe повторял → дедуп отвечал 'OK'. Строка в таблице уже была записана,
// поэтому CAPI/GA4/Telegram по этой покупке не уходили никогда.
//
// Не забудь в Stripe Dashboard: lookup_key на 4 Price →
// morning_camp / evening_camp / weekend_camp / media_package
// =====================================================================

const props = PropertiesService.getScriptProperties();
const GA4_MEASUREMENT_ID = 'G-DDFNKFDZHR'; // не секрет, совпадает с GA4_ID в pixels.js
const GA4_API_SECRET = props.getProperty('GA4_API_SECRET');
const WEBHOOK_TOKEN = props.getProperty('WEBHOOK_TOKEN');
const SHEET_ID = '1eRs41v1VRVIKTOdovtrg9B1agOVEF6Bbw3zqC3Zz1jM'; // не секрет, ID таблицы
const TELEGRAM_BOT_TOKEN = props.getProperty('TELEGRAM_BOT_TOKEN');
const TELEGRAM_CHAT_ID = props.getProperty('TELEGRAM_CHAT_ID');
const META_PIXEL_ID = props.getProperty('META_PIXEL_ID');
const META_CAPI_ACCESS_TOKEN = props.getProperty('META_CAPI_ACCESS_TOKEN');
const VIEWCONTENT_RELAY_TOKEN = props.getProperty('VIEWCONTENT_RELAY_TOKEN');
const GGL_STRP_READ_KEY = props.getProperty('GGL_STRP_READ_KEY'); // Stripe restricted key, только Checkout Sessions: Read

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    if (body.type === 'view_content') {
      if (!VIEWCONTENT_RELAY_TOKEN || body.token !== VIEWCONTENT_RELAY_TOKEN) {
        return ContentService.createTextOutput('Forbidden').setMimeType(ContentService.MimeType.TEXT);
      }
      sendViewContentToMetaCAPI(body.event_id, body.content_name, body.fbc, body.fbp, body.url);
      return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
    }

    if (!e.parameter.token || e.parameter.token !== WEBHOOK_TOKEN) {
      return ContentService.createTextOutput('Forbidden').setMimeType(ContentService.MimeType.TEXT);
    }

    const event = body; // было: JSON.parse(e.postData.contents) — уже распарсено выше

    if (event.type !== 'checkout.session.completed') {
      return ContentService.createTextOutput('Ignored').setMimeType(ContentService.MimeType.TEXT);
    }

    const session = event.data.object;
    if (session.payment_status !== 'paid') {
      return ContentService.createTextOutput('Not paid').setMimeType(ContentService.MimeType.TEXT);
    }

    const sessionId = session.id;

    // --- дедуп ДО обращения к Stripe API, чтобы ретраи Stripe не тратили лишний вызов ---
    if (paymentRowExists(sessionId)) {
      return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
    }

    const amount = (session.amount_total || 0) / 100;
    const currency = (session.currency || 'eur').toUpperCase();
    const email = (session.customer_details && session.customer_details.email) || '';
    const name = (session.customer_details && session.customer_details.name) || '';

    const resolved = resolveItemFromStripe(sessionId) || { label: 'Unknown item (€' + amount + ')', slug: 'unknown_item' };
    appendPaymentRow(sessionId, resolved.label, amount, currency, name, email);

    // Разбор атрибуции — best effort. Строка уже записана, поэтому бросать здесь
    // нельзя: исключение превратится в 'Error:' → 502 → ретрай → дедуп → 'OK',
    // и CAPI/GA4/Telegram по этой покупке не уйдут уже никогда.
    let attr;
    try {
      attr = parseAttribution(session.client_reference_id);
    } catch (err) {
      Logger.log('parseAttribution failed, continuing without attribution: ' + err.message);
      attr = { gcid: '', fbc: '', fbp: '' };
    }
    const gaClientId = attr.gcid;
    const fbc = attr.fbc;
    const fbp = attr.fbp;

    // CAPI и GA4 — до Telegram, чтобы сбой уведомления не блокировал аналитику
    sendToMetaCAPI(sessionId, resolved.slug, amount, currency, email, fbc, fbp);
    sendToGA4(gaClientId, resolved.slug, amount, currency, sessionId);
    notifyTelegram(resolved.label, amount, currency, name, email);

    return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    return ContentService.createTextOutput('Error: ' + err.message).setMimeType(ContentService.MimeType.TEXT);
  }
}

// --- Дедупликация и запись в лист (заменяет старую logPayment) ---

function getPaymentSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName('Confirmed Payments');
  if (!sheet) {
    sheet = ss.insertSheet('Confirmed Payments');
    sheet.appendRow(['Timestamp', 'Session ID', 'Item', 'Amount', 'Currency', 'Name', 'Email']);
  }
  return sheet;
}

function paymentRowExists(sessionId) {
  const data = getPaymentSheet().getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === sessionId) return true;
  }
  return false;
}

function appendPaymentRow(sessionId, item, amount, currency, name, email) {
  getPaymentSheet().appendRow([new Date(), sessionId, item, amount, currency, name, email]);
}

// --- Разбор client_reference_id: base64url (с 29.09) + фолбэк на старый формат '||' ---

function parseAttribution(raw) {
  if (!raw) return { gcid: '', fbc: '', fbp: '' };
  if (raw.indexOf('||') !== -1) {
    const p = raw.split('||');
    return { gcid: p[0] || '', fbc: p[1] || '', fbp: p[2] || '' };
  }
  const s = raw.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = Utilities.newBlob(
    Utilities.base64Decode(s + '==='.slice((s.length + 3) % 4))
  ).getDataAsString();
  const p = decoded.split('||');
  return { gcid: p[0] || '', fbc: p[1] || '', fbp: p[2] || '' };
}

function notifyTelegram(item, amount, currency, name, email) {
  if (!TELEGRAM_BOT_TOKEN) return;

  const text = '✅ Payment confirmed!\n' +
    'Item: ' + item + '\n' +
    'Amount: ' + amount + ' ' + currency + '\n' +
    'Name: ' + (name || '—') + '\n' +
    'Email: ' + (email || '—');

  const response = UrlFetchApp.fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: text }),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  Logger.log('Telegram response code: ' + code);
  if (code !== 200) {
    MailApp.sendEmail('thepadelcampcy@gmail.com', 'Telegram notification failed', text);
  }
}

function sendToMetaCAPI(sessionId, item, amount, currency, email, fbc, fbp) {
  if (!META_CAPI_ACCESS_TOKEN) return;

  const userData = {};
  if (email) userData.em = [sha256Hex(email.trim().toLowerCase())];
  if (fbc) userData.fbc = fbc;
  if (fbp) userData.fbp = fbp;

  const payload = {
    data: [{
      event_name: 'Purchase',
      event_time: Math.floor(new Date().getTime() / 1000),
      event_id: sessionId,
      action_source: 'website',
      event_source_url: 'https://thepadelcamp.com.cy/thank-you.html',
      user_data: userData,
      custom_data: {
        value: amount,
        currency: currency,
        content_name: item
      }
    }]
  };

  const url = 'https://graph.facebook.com/v26.0/' + META_PIXEL_ID + '/events?access_token=' + META_CAPI_ACCESS_TOKEN;

  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    Logger.log('Meta CAPI response: ' + response.getContentText());
  } catch (err) {
    Logger.log('Meta CAPI error: ' + err.message);
  }
}

function sendViewContentToMetaCAPI(eventId, contentName, fbc, fbp, sourceUrl) {
  if (!META_CAPI_ACCESS_TOKEN) return;

  const userData = {};
  if (fbc) userData.fbc = fbc;
  if (fbp) userData.fbp = fbp;
  if (!userData.fbc && !userData.fbp) return;

  const payload = {
    data: [{
      event_name: 'ViewContent',
      event_time: Math.floor(new Date().getTime() / 1000),
      event_id: eventId,
      action_source: 'website',
      event_source_url: sourceUrl || 'https://thepadelcamp.com.cy/',
      user_data: userData,
      custom_data: { content_name: contentName || 'padel_camp', content_category: 'padel_camp' }
    }]
  };

  const url = 'https://graph.facebook.com/v26.0/' + META_PIXEL_ID + '/events?access_token=' + META_CAPI_ACCESS_TOKEN;

  try {
    const response = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
    Logger.log('Meta CAPI ViewContent response: ' + response.getContentText());
  } catch (err) {
    Logger.log('Meta CAPI ViewContent error: ' + err.message);
  }
}

function sendToGA4(clientId, item, amount, currency, sessionId) {
  if (!GA4_API_SECRET || !clientId) return;

  const payload = {
    client_id: clientId,
    events: [{
      name: 'purchase',
      params: {
        transaction_id: sessionId,
        value: amount,
        currency: currency,
        items: [{ item_name: item, price: amount }]
      }
    }]
  };

  const url = 'https://www.google-analytics.com/mp/collect?measurement_id=' + GA4_MEASUREMENT_ID + '&api_secret=' + GA4_API_SECRET;

  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    Logger.log('GA4 MP response code: ' + response.getResponseCode());
  } catch (err) {
    Logger.log('GA4 MP error: ' + err.message);
  }
}

function sha256Hex(input) {
  const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8);
  return rawHash.map(function(byte) {
    const v = (byte < 0 ? byte + 256 : byte).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

// Название и slug позиции берутся из Stripe (имя продукта + lookup_key),
// поэтому смена цен/промокодов/новых продуктов не требует правок скрипта.
// label — человекочитаемое имя (таблица, Telegram); slug — короткое стабильное
// имя из lookup_key (Meta content_name, GA4 item_name) — совпадает со слагом
// на самом сайте (morning_camp/evening_camp/weekend_camp/media_package).
function resolveItemFromStripe(sessionId) {
  if (!GGL_STRP_READ_KEY) return null;
  try {
    const response = UrlFetchApp.fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(sessionId) + '/line_items?limit=10', {
      headers: { Authorization: 'Bearer ' + GGL_STRP_READ_KEY },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      Logger.log('Stripe line_items error: ' + response.getContentText());
      return null;
    }
    const lines = JSON.parse(response.getContentText()).data || [];
    if (!lines.length) return null;

    const parts = lines.map(function(li) {
      const p = li.price || {};
      const qty = li.quantity > 1 ? ' x' + li.quantity : '';
      const label = li.description || p.nickname || p.product || 'Unknown item';
      if (!p.lookup_key) Logger.log('lookup_key missing for price ' + p.id);
      const slug = p.lookup_key || label;
      return { label: label + qty, slug: slug + qty };
    });

    return {
      label: parts.map(function(x) { return x.label; }).join(', '),
      slug: parts.map(function(x) { return x.slug; }).join(', ')
    };
  } catch (err) {
    Logger.log('Stripe line_items error: ' + err.message);
    return null;
  }
}

// Ручная проверка разбора client_reference_id. Запускается из редактора Apps
// Script (выбрать функцию → Run). Ничего не пишет в таблицу и не обращается к
// Stripe/Meta/GA4/Telegram, поэтому безопасно запускать на живом деплое.
// Последний случай — тот самый вход, который раньше ронял doPost целиком.
function testParseAttribution() {
  const raw = 'GA1.2.111.222||fb.1.155|abc.def||fb.1.155|xyz.789';
  const b64 = Utilities.base64Encode(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const cases = [
    { name: 'null', raw: null },
    { name: 'legacy ||', raw: raw },
    { name: 'base64url', raw: b64 },
    { name: 'not base64', raw: '!!!not-base64!!!' }
  ];
  cases.forEach(function (c) {
    let out;
    try { out = JSON.stringify(parseAttribution(c.raw)); }
    catch (e) { out = 'THROWS: ' + e.message; }
    Logger.log(c.name + ' -> ' + out);
  });
}
