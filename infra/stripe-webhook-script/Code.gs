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
  let rowWritten = false; // видна в catch: false = сама оплата не записана
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

    const looked = resolveItemFromStripe(sessionId);
    const resolved = looked || { label: 'Unknown item (€' + amount + ')', slug: 'unknown_item' };
    appendPaymentRow(sessionId, resolved.label, amount, currency, name, email);
    rowWritten = true;
    if (!looked) notifyUnknownItem(sessionId, resolved.label, stripeLookupError);

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
    sendToMetaCAPI(sessionId, resolved.slug, amount, currency, email, fbc, fbp, session.customer_details, resolved.numItems);
    sendToGA4(gaClientId, resolved.slug, amount, currency, sessionId, resolved.numItems);
    notifyTelegram(resolved.label, amount, currency, name, email);

    return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    notifyScriptError(rowWritten, err);
    return ContentService.createTextOutput('Error: ' + err.message).setMimeType(ContentService.MimeType.TEXT);
  }
}

// --- Оповещение о сбое внутри doPost (правка 2026-09-30) ---
// После перехода Worker на «302 = успех» текст 'Error: ...' до Stripe уже не
// доходит, поэтому о падении скрипта сообщаем сами. Троттлинг обязателен:
// Stripe повторяет доставку до трёх дней, и каждая попытка снова упадёт.

const ERROR_ALERT_LIMIT_PER_HOUR = 3;

function notifyScriptError(rowWritten, err) {
  if (!allowErrorAlert()) { Logger.log('script error (alert suppressed): ' + err.message); return; }
  const how = rowWritten
    ? 'Оплата в Confirmed Payments записана, но CAPI/GA4/Telegram по ней не ушли.'
    : 'Оплата в Confirmed Payments НЕ записана — нужен Resend этого события в Stripe.';
  sendAlert('⚠️ Скрипт вебхука упал\n' + how + '\nПричина: ' + err.message);
}

function allowErrorAlert() {
  const key = 'script_err_' + Math.floor(Date.now() / 3600000);
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get(key) || 0);
  cache.put(key, String(n + 1), 3600);
  return n < ERROR_ALERT_LIMIT_PER_HOUR;
}

// --- Ежедневная сверка Stripe ↔ Confirmed Payments (правка 2026-09-30) ---
// Страховка: если оплаченная сессия Stripe не нашлась в таблице, доставка
// потеряна. Сравниваются множества session id, а не количества: границы суток
// в EEST и в Stripe (UTC) не совпадают. В таблицу ничего не пишет.
// Запуск: один раз вручную reconcilePaymentsWithSheet, затем один раз
// setupReconcileTrigger (ежедневно в 9:00).

const RECONCILE_WINDOW_DAYS = 3;
const ALERT_EMAIL = 'thepadelcampcy@gmail.com';

function reconcilePaymentsWithSheet() {
  try {
    const to = Math.floor(Date.now() / 1000);
    const paid = listPaidSessions(to - RECONCILE_WINDOW_DAYS * 86400, to);

    const inSheet = new Set(
      getPaymentSheet().getRange('B2:B').getValues()
        .map(function (r) { return r[0]; })
        .filter(function (v) { return typeof v === 'string' && v.indexOf('cs_') === 0; })
    );
    const missing = paid.filter(function (s) { return !inSheet.has(s.id); });

    if (!missing.length) {
      Logger.log('reconcile OK: ' + paid.length + ' paid за ' + RECONCILE_WINDOW_DAYS + ' дн., все в таблице');
      return;
    }
    const when = Utilities.formatDate(new Date(), 'Europe/Nicosia', 'yyyy-MM-dd HH:mm');
    let text = '⚠️ Сверка Stripe и таблицы: оплата не попала в таблицу\n';
    text += 'Окно: ' + RECONCILE_WINDOW_DAYS + ' дн. до ' + when + '\n';
    text += 'Оплат в Stripe: ' + paid.length + ', из них в таблице: ' + (paid.length - missing.length) + '\n\n';
    missing.forEach(function (s) { text += '  ' + s.id + ' — ' + s.amount + ' ' + s.currency + '\n'; });
    text += '\nЧто делать: Stripe Dashboard -> Webhooks -> событие с этой session id -> Resend.\n';
    Logger.log(text);
    sendAlert(text);
  } catch (err) {
    // Сбой самой сверки обязан быть замечен — иначе страховка молчит именно
    // тогда, когда что-то сломалось.
    Logger.log('reconcile failed: ' + err.message);
    sendAlert('⚠️ Сверка Stripe и таблицы не выполнилась.\nПричина: ' + err.message);
  }
}

function setupReconcileTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'reconcilePaymentsWithSheet'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('reconcilePaymentsWithSheet').timeBased().everyDays(1).atHour(9).create();
}

function listPaidSessions(fromUnix, toUnix) {
  if (!GGL_STRP_READ_KEY) throw new Error('нет GGL_STRP_READ_KEY в Script Properties');
  const out = [];
  let startingAfter = null;
  for (let page = 0; page < 20; page++) {
    // payment_status проверяем в коде, а не фильтром запроса: на поддержку
    // такого фильтра в list не опираемся.
    const qs = [
      'status=complete',
      'created[gte]=' + fromUnix,
      'created[lt]=' + toUnix,
      'limit=100'
    ].join('&') + (startingAfter ? '&starting_after=' + encodeURIComponent(startingAfter) : '');

    const res = UrlFetchApp.fetch('https://api.stripe.com/v1/checkout/sessions?' + qs, {
      headers: { Authorization: 'Bearer ' + GGL_STRP_READ_KEY },
      muteHttpExceptions: true
    });
    // throw, а не частичный список: иначе ошибка Stripe выглядела бы как «всё сошлось».
    if (res.getResponseCode() !== 200) {
      throw new Error('Stripe sessions list ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
    }
    const json = JSON.parse(res.getContentText());
    (json.data || []).forEach(function (s) {
      if (s.payment_status !== 'paid') return;
      out.push({ id: s.id, amount: (s.amount_total || 0) / 100, currency: (s.currency || '').toUpperCase() });
    });
    if (!json.has_more || !json.data.length) break;
    startingAfter = json.data[json.data.length - 1].id;
  }
  return out;
}

// Тревога всегда идёт в оба канала: письмо нужно именно тогда, когда Telegram
// не сработал, поэтому успех Telegram не отменяет письмо.
function sendAlert(text) {
  try {
    const res = UrlFetchApp.fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: text, disable_web_page_preview: true }),
      muteHttpExceptions: true
    });
    Logger.log('alert telegram: ' + res.getResponseCode());
  } catch (err) { Logger.log('alert telegram failed: ' + err.message); }

  try {
    MailApp.sendEmail({ to: ALERT_EMAIL, subject: '[Padel Camp] Вебхук Stripe', body: text });
  } catch (err) { Logger.log('alert email failed: ' + err.message); }
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

function sendToMetaCAPI(sessionId, item, amount, currency, email, fbc, fbp, customer, numItems) {
  if (!META_CAPI_ACCESS_TOKEN) return;

  const userData = {};
  if (email) {
    userData.em = [sha256Hex(email.trim().toLowerCase())];
    userData.external_id = [sha256Hex(email.trim().toLowerCase())];
  }
  if (fbc) userData.fbc = fbc;
  if (fbp) userData.fbp = fbp;

  // Остальные ключи сопоставления из Stripe (п. 36b: EMQ был 6.07/10).
  // Нормализация по правилам Meta: lowercase, без пробелов; телефон — только
  // цифры с кодом страны (Stripe отдаёт E.164, "+" просто отбрасываем).
  const c = customer || {};
  const addr = c.address || {};
  const hashed = function(v) { return [sha256Hex(v)]; };
  if (c.phone) {
    const digits = String(c.phone).replace(/\D/g, '');
    if (digits) userData.ph = hashed(digits);
  }
  if (c.name) {
    const nameParts = String(c.name).trim().toLowerCase().split(/\s+/);
    if (nameParts[0]) userData.fn = hashed(nameParts[0]);
    if (nameParts.length > 1) userData.ln = hashed(nameParts.slice(1).join(' '));
  }
  if (addr.city) userData.ct = hashed(String(addr.city).toLowerCase().replace(/[^a-zÀ-ɏͰ-ϿЀ-ӿ]/g, ''));
  if (addr.postal_code) userData.zp = hashed(String(addr.postal_code).toLowerCase().replace(/\s/g, ''));
  if (addr.country) userData.country = hashed(String(addr.country).toLowerCase());

  const payload = {
    data: [{
      event_name: 'Purchase',
      event_time: Math.floor(new Date().getTime() / 1000),
      event_id: sessionId,
      action_source: 'website',
      event_source_url: 'https://thepadelcamp.com.cy/thank-you.html',
      user_data: userData,
      custom_data: Object.assign({
        value: amount,
        currency: currency,
        content_name: item
      }, numItems > 1 ? { num_items: numItems } : {})
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

function sendToGA4(clientId, item, amount, currency, sessionId, numItems) {
  if (!GA4_API_SECRET || !clientId) return;

  // price в GA4 — за единицу; при нескольких местах делим сумму на количество
  const gaItem = numItems > 1
    ? { item_name: item, price: amount / numItems, quantity: numItems }
    : { item_name: item, price: amount };

  const payload = {
    client_id: clientId,
    events: [{
      name: 'purchase',
      params: {
        transaction_id: sessionId,
        value: amount,
        currency: currency,
        items: [gaItem]
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
// Причина последнего null из resolveItemFromStripe — для алерта «Unknown item»
// (правка 2026-09-30): без неё алерт не даёт ни одной зацепки.
let stripeLookupError = null;

function resolveItemFromStripe(sessionId) {
  stripeLookupError = null;
  if (!GGL_STRP_READ_KEY) {
    stripeLookupError = 'GGL_STRP_READ_KEY не задан в Script Properties';
    return null;
  }
  try {
    const response = UrlFetchApp.fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(sessionId) + '/line_items?limit=10', {
      headers: { Authorization: 'Bearer ' + GGL_STRP_READ_KEY },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      stripeLookupError = 'Stripe line_items ' + response.getResponseCode() + ': ' + response.getContentText().slice(0, 300);
      Logger.log(stripeLookupError);
      return null;
    }
    const lines = JSON.parse(response.getContentText()).data || [];
    if (!lines.length) {
      stripeLookupError = 'Stripe вернул пустой line_items';
      Logger.log(stripeLookupError);
      return null;
    }

    const parts = lines.map(function(li) {
      const p = li.price || {};
      const qty = li.quantity > 1 ? ' x' + li.quantity : '';
      const label = li.description || p.nickname || p.product || 'Unknown item';
      if (!p.lookup_key) Logger.log('lookup_key missing for price ' + p.id);
      // " xN" только в человеческом названии (таблица, Telegram); slug уходит в
      // Meta/GA4 как content_name/item_name и должен совпадать с data-purchase-item
      const slug = p.lookup_key || label;
      return { label: label + qty, slug: slug, quantity: li.quantity || 1 };
    });

    return {
      label: parts.map(function(x) { return x.label; }).join(', '),
      slug: parts.map(function(x) { return x.slug; }).join(', '),
      numItems: parts.reduce(function(sum, x) { return sum + x.quantity; }, 0)
    };
  } catch (err) {
    stripeLookupError = 'Исключение при обращении к Stripe: ' + err.message;
    Logger.log(stripeLookupError);
    return null;
  }
}

// Алерт: оплата записана, но название позиции из Stripe получить не удалось.
// Без троттлинга: оплат единицы в месяц, а молчание дороже лишнего сообщения.
function notifyUnknownItem(sessionId, label, reason) {
  sendAlert(
    '⚠️ Название позиции не получено из Stripe\n' +
    'Оплата в Confirmed Payments записана как «' + label + '» — деньги и строка на месте.\n' +
    'session: ' + sessionId + '\n' +
    'Причина: ' + (reason || 'неизвестна') + '\n' +
    'Проверить: ключ GGL_STRP_READ_KEY в Script Properties и его права (Checkout Sessions: Read).'
  );
}

// Ручная проверка, что алерты реально доходят в Telegram и на почту.
// Ничего не пишет в таблицу и не обращается к Stripe — безопасно на живом деплое.
function testUnknownItemAlert() {
  notifyUnknownItem('cs_test_не_реальная_сессия', 'Unknown item (€123)', 'тест алерта, реальной ошибки нет');
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
