/**
 * Tracking Pixels & Cookie Consent
 * =================================
 * Meta Pixel + Google Analytics 4 + Google Ads + Microsoft Clarity
 * GDPR-compliant: Meta/Google Ads/Clarity load only after user consent;
 * GA4 loads always, in Google Consent Mode v2 (advanced) with cookieless
 * measurement pings.
 *
 * SETUP: Replace these placeholder IDs with your real ones:
 * 1. META_PIXEL_ID  → your Meta Pixel ID (e.g. '123456789012345')
 * 2. GA4_ID         → your GA4 Measurement ID (e.g. 'G-XXXXXXXXXX')
 * 3. GADS_ID        → your Google Ads ID (e.g. 'AW-XXXXXXXXX')
 * 4. CLARITY_ID     → your Microsoft Clarity Project ID (from clarity.microsoft.com)
 */

const META_PIXEL_ID = '838994425860514';
const GA4_ID = 'G-DDFNKFDZHR';
const GADS_ID = 'YOUR_GOOGLE_ADS_ID';
const CLARITY_ID = 'yisjvh4uxg';

const CONSENT_KEY = 'cookie_consent';

// Google Consent Mode v2 (advanced) defaults. The first four signals are
// exactly the ones Google requires for v2; functionality_storage and
// security_storage are granted because gtag.js cannot load at all without
// them. "Advanced" means GA4 is configured with everything denied: gtag.js
// then sends cookieless pings, so visits and purchases from visitors who
// decline or ignore the banner still reach GA4 (modelled, no cookies, no
// _ga). Meta Pixel, Google Ads and Clarity have no equivalent — they stay
// strictly opt-in and keep loading only on Accept.
const GA_CONSENT_DEFAULT = {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted',
    wait_for_update: 500
};

// Cloudflare Worker that relays browser-side events to the "Padel Camp —
// Stripe Webhook" Apps Script (which holds the real Meta CAPI credentials).
// Public URL, same trust level as GOOGLE_SCRIPT_URL below — protected by
// VIEWCONTENT_RELAY_TOKEN, a low-privilege token separate from the
// Stripe webhook's own token, since this one is necessarily public (visible
// in page source).
const CAPI_RELAY_URL = 'https://padelcamp-stripe-webhook-proxy.thepadelcampcy.workers.dev';
const VIEWCONTENT_RELAY_TOKEN = '5f254d8934df40c8e51f3c52f91c43956485ba57277587c6';

// ─── Cookie Consent Banner ───────────────────────────────────────

function createConsentBanner() {
    if (localStorage.getItem(CONSENT_KEY)) return;

    const pageLang = document.documentElement.lang;
    const lang = (pageLang === 'ru' || pageLang === 'el') ? pageLang : 'en';

    // Wording is deliberate: it asks for help rather than warning about
    // compliance, because the goal is more genuine acceptances. Both buttons
    // stay equally available — no hidden, greyed-out or preselected decline.
    // The cookie-free sentence is not optional: GA4 is configured in advanced
    // Consent Mode and transmits before the banner is even shown, so the
    // notice must not claim analytics waits for the answer.
    const T = {
        en: {
            text: 'Help us make this site better. With your permission we use cookies and analytics to see which pages are useful and where the site is confusing. Basic cookie-free analytics also counts every visit, whether or not you answer. We do not sell your data. Read our <a href="/privacy-policy.html">Privacy Policy</a>.',
            accept: 'Allow analytics', decline: 'No thanks'
        },
        ru: {
            text: 'Помогите нам сделать сайт лучше. С вашего разрешения мы используем cookie и аналитику, чтобы понять, какие страницы полезны, а где сайт путает. Базовый анализ без cookie также считает каждый заход, независимо от вашего ответа. Мы не продаём ваши данные. Подробнее в <a href="/ru/privacy-policy.html">Политике конфиденциальности</a>.',
            accept: 'Разрешить аналитику', decline: 'Не разрешать'
        },
        el: {
            text: 'Βοηθήστε μας να βελτιώσουμε τον ιστότοπο. Με την άδειά σας χρησιμοποιούμε cookies και εργαλεία ανάλυσης για να δούμε ποιες σελίδες είναι χρήσιμες και πού μπερδεύει ο ιστότοπος. Η βασική ανάλυση χωρίς cookies μετρά κάθε επίσκεψη, ανεξάρτητα από την απάντησή σας. Δεν πουλάμε τα δεδομένα σας. Μάθετε περισσότερα στην <a href="/privacy-policy.html">Πολιτική Απορρήτου</a>.',
            accept: 'Επίτρεψη ανάλυσης', decline: 'Όχι, ευχαριστώ'
        }
    }[lang];

    const banner = document.createElement('div');
    banner.id = 'cookieConsent';
    banner.className = 'cookie-consent';
    banner.innerHTML = `
        <div class="cookie-consent-inner">
            <p class="cookie-consent-text">
                ${T.text}
            </p>
            <div class="cookie-consent-buttons">
                <button class="cookie-btn cookie-btn-accept" onclick="acceptCookies()">
                    ${T.accept}
                </button>
                <button class="cookie-btn cookie-btn-decline" onclick="declineCookies()">
                    ${T.decline}
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(banner);
    // Trigger animation
    requestAnimationFrame(() => banner.classList.add('visible'));
}

function acceptCookies() {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    hideBanner();
    // Update first, then load the opt-in pixels, so the very first fbq/clarity
    // call is not made under a still-denied Google consent state.
    updateGoogleConsent(true);
    loadAllPixels();
}

function declineCookies() {
    localStorage.setItem(CONSENT_KEY, 'declined');
    hideBanner();
    // Declining is a real answer, not a "no answer": send the update so
    // gtag.js stops waiting and keeps sending cookieless pings.
    updateGoogleConsent(false);
}

function hideBanner() {
    const banner = document.getElementById('cookieConsent');
    if (banner) {
        banner.classList.remove('visible');
        setTimeout(() => banner.remove(), 300);
    }
}

// Single source of truth for "did this visitor accept?". Every Meta Pixel and
// Clarity call below must go through it — a helper that forgets would ship a
// tracking event without consent, and with nine copies of this expression
// drifting apart that was one edit away.
function hasConsented() {
    return localStorage.getItem(CONSENT_KEY) === 'accepted';
}

// ─── Pixel Loaders ───────────────────────────────────────────────

// Dev/preview safety: these IDs are the real production Meta Pixel/GA4/
// Clarity accounts. While reachable via localhost or a temporary tunnel
// (not the real thepadelcamp.com.cy domain), skip loading the actual SDKs
// so test clicks don't pollute production analytics — every trackX() call
// below already no-ops safely when fbq/gtag/clarity aren't defined, it just
// logs to the console instead so wiring can still be verified locally.
var IS_PRODUCTION_HOST = location.hostname === 'thepadelcamp.com.cy' || location.hostname === 'www.thepadelcamp.com.cy';

// GA4 is the one pixel that loads before consent, because Consent Mode v2
// advanced only produces its modelled pings if gtag.js is present from the
// first page view. Meta/Clarity/Google Ads stay behind the banner.
var ga4Loaded = false;

function loadAllPixels() {
    if (!IS_PRODUCTION_HOST) {
        console.log('[pixels.js] Non-production host (' + location.hostname + ') — using console-only stub pixels instead of real Meta/GA4/Clarity.');
        window.fbq = function() { console.log('[stub fbq]', Array.prototype.slice.call(arguments)); };
        window.gtag = function() { console.log('[stub gtag]', Array.prototype.slice.call(arguments)); };
        window.clarity = function() { console.log('[stub clarity]', Array.prototype.slice.call(arguments)); };
        return;
    }
    loadGA4();
    loadMetaPixel();
    loadGoogleAds();
    loadClarity();
}

// Flip the four Google consent signals after the visitor answers. Granted
// means Accept; denied keeps advanced mode active (pings continue, cookies
// do not). wait_for_update in the default is cleared by this call.
function updateGoogleConsent(granted) {
    if (typeof gtag !== 'function') return;
    gtag('consent', 'update', {
        ad_storage: granted ? 'granted' : 'denied',
        ad_user_data: granted ? 'granted' : 'denied',
        ad_personalization: granted ? 'granted' : 'denied',
        analytics_storage: granted ? 'granted' : 'denied'
    });
}

function loadMetaPixel() {
    if (META_PIXEL_ID === 'YOUR_META_PIXEL_ID') return;

    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');

    fbq('init', META_PIXEL_ID);
    fbq('track', 'PageView');
}

function loadGA4() {
    if (GA4_ID === 'YOUR_GA4_MEASUREMENT_ID') return;
    if (ga4Loaded) return;
    ga4Loaded = true;

    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID;
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    window.gtag = gtag;
    // Must be queued before 'config' — Google reads the state that is in
    // effect when the config event is processed.
    gtag('consent', 'default', GA_CONSENT_DEFAULT);
    gtag('js', new Date());
    gtag('config', GA4_ID);
}

function loadGoogleAds() {
    if (GADS_ID === 'YOUR_GOOGLE_ADS_ID') return;

    // Google Ads uses the same gtag.js — just add the config
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    if (!window.gtag) window.gtag = gtag;
    gtag('config', GADS_ID);
}

function loadClarity() {
    if (CLARITY_ID === 'YOUR_CLARITY_PROJECT_ID') return;

    (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", CLARITY_ID);

    // Since 2025-10-31 Clarity requires an explicit consent signal for
    // visitors from the EEA/UK/CH to get full tracking (session cookies,
    // custom events included) — this was never being sent, only ever
    // called here since loadClarity() only runs after our own cookie
    // banner was accepted (or was already accepted on a return visit).
    clarity('consent');
}

// ─── Event Tracking Helpers ──────────────────────────────────────

/**
 * Track a registration/lead event across all pixels
 * Call this after a successful form submission
 */
function trackRegistration(data) {
    var consented = hasConsented();

    // Meta Pixel
    if (consented && typeof fbq === 'function') {
        fbq('track', 'Lead', {
            content_name: data.type || 'camp_registration',
            content_category: data.camp || 'padel_camp',
            value: data.value || 0,
            currency: 'EUR'
        });
    }

    // GA4
    if (typeof gtag === 'function') {
        gtag('event', 'generate_lead', {
            event_category: 'registration',
            event_label: data.type || 'camp_registration',
            value: data.value || 0,
            currency: 'EUR'
        });
    }

    if (consented && typeof clarity === 'function') {
        clarity('event', 'registration_submit');
    }
}

/**
 * Track a purchase/payment initiation
 */
function trackPurchase(data) {
    var consented = hasConsented();

    if (consented && typeof fbq === 'function') {
        fbq('track', 'InitiateCheckout', {
            content_name: data.camp || 'padel_camp',
            value: data.value || 0,
            currency: 'EUR'
        });
    }

    if (typeof gtag === 'function') {
        gtag('event', 'begin_checkout', {
            event_category: 'payment',
            event_label: data.camp || 'padel_camp',
            value: data.value || 0,
            currency: 'EUR'
        });
    }

    // Explicit Clarity event for the Stripe click — Clarity's own auto-detected
    // "Smart Events" were misfiring on the WhatsApp confirmation link instead
    // of this one, so we mark the real moment ourselves.
    if (consented && typeof clarity === 'function') {
        clarity('event', 'initiate_checkout');
    }
}

/**
 * Track viewing a section of interest (e.g. pricing) — signals intent
 * without requiring the visitor to start a form, useful for retargeting
 * "looked but didn't convert" audiences.
 */
function trackViewContent(data) {
    var consented = hasConsented();

    const contentName = data.name || 'padel_camp';
    const eventId = 'vc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);

    if (consented && typeof fbq === 'function') {
        fbq('track', 'ViewContent', {
            content_name: contentName,
            content_category: 'padel_camp'
        }, { eventID: eventId });
    }

    if (typeof gtag === 'function') {
        gtag('event', 'view_item', {
            event_category: 'engagement',
            event_label: contentName
        });
    }

    // The relay ships _fbc/_fbp to Meta CAPI, so it stays behind consent too.
    if (consented) sendViewContentToServer(eventId, contentName);
}

/**
 * Relays ViewContent to Meta CAPI server-side (via the Cloudflare Worker →
 * Apps Script), using the same event_id as the browser pixel call above so
 * Meta dedupes them. Improves CAPI event coverage for ad-blocked/iOS
 * visitors, same rationale as the Purchase CAPI backstop.
 */
function sendViewContentToServer(eventId, contentName) {
    const fbc = getCookie('_fbc');
    const fbp = getCookie('_fbp');
    if (!fbc && !fbp) return; // nothing for Meta to match this visitor on

    fetch(CAPI_RELAY_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            token: VIEWCONTENT_RELAY_TOKEN,
            type: 'view_content',
            event_id: eventId,
            content_name: contentName,
            fbc: fbc,
            fbp: fbp,
            url: location.href
        })
    }).catch(function() {});
}

/**
 * Track a contact form submission
 */
function trackContact() {
    var consented = hasConsented();

    if (consented && typeof fbq === 'function') {
        fbq('track', 'Contact');
    }

    if (typeof gtag === 'function') {
        gtag('event', 'contact', {
            event_category: 'engagement',
            event_label: 'contact_form'
        });
    }

    if (consented && typeof clarity === 'function') {
        clarity('event', 'contact_submit');
    }
}

/**
 * Track a service booking (massage, media package, etc.)
 */
function trackBooking(serviceName, value) {
    var consented = hasConsented();

    if (consented && typeof fbq === 'function') {
        fbq('track', 'Schedule', {
            content_name: serviceName,
            value: value || 0,
            currency: 'EUR'
        });
    }

    if (typeof gtag === 'function') {
        // Own event name (not begin_checkout) — trackPurchase() below already
        // uses begin_checkout for the camp Stripe-click step; reusing it here
        // for service bookings was collapsing two different funnels into one
        // GA4 event.
        gtag('event', 'book_service', {
            event_category: 'booking',
            event_label: serviceName,
            value: value || 0,
            currency: 'EUR'
        });
    }

    if (consented && typeof clarity === 'function') {
        clarity('event', 'booking_submit');
    }
}

/**
 * Track a CONFIRMED purchase — call only from the post-payment thank-you
 * page (i.e. after Stripe actually redirects back), never on link click.
 *
 * data.eventId (the Stripe Checkout Session ID) is passed through as Meta's
 * eventID so this browser-side Purchase event dedupes against the matching
 * server-side Conversions API event sent by the Apps Script webhook using
 * the same session ID.
 *
 * Offline (cash/barter) purchases pass data.em / data.ph — the buyer's email
 * and phone from the questionnaire, handed to the pixel as advanced matching
 * (it hashes them itself) — and data.metaOnly, which keeps them out of GA4
 * and Clarity: those count website sales only.
 */
function trackConfirmedPurchase(data) {
    // Order matters here and must not be reshuffled:
    //   1. Meta Purchase (advanced matching, then the tracked event)
    //   2. metaOnly return — offline sales reach Meta only, never GA4
    //   3. GA4 purchase — NOT consent-gated, so decliners still get their
    //      single purchase signal (the server-side Measurement Protocol event
    //      is a no-op for them: it needs the GA4 client id, which only travels
    //      in client_reference_id after consent)
    //   4. Clarity
    var consented = hasConsented();

    if (consented && (data.em || data.ph) && typeof fbq === 'function') {
        var userData = {};
        if (data.em) userData.em = data.em.toLowerCase();
        if (data.ph) userData.ph = data.ph.replace(/\D/g, '');
        fbq('init', META_PIXEL_ID, userData);
    }

    if (consented && typeof fbq === 'function') {
        var fbData = {
            value: data.value || 0,
            currency: 'EUR',
            content_name: data.item || 'padel_camp'
        };
        if (data.eventId) {
            fbq('track', 'Purchase', fbData, { eventID: data.eventId });
        } else {
            fbq('track', 'Purchase', fbData);
        }
    }

    if (data.metaOnly) return;

    if (typeof gtag === 'function') {
        gtag('event', 'purchase', {
            value: data.value || 0,
            currency: 'EUR',
            transaction_id: data.eventId || ('T_' + Date.now()),
            items: [{ item_name: data.item || 'padel_camp', price: data.value || 0 }]
        });
    }

    // Clarity's own auto-detected "Order success" Smart Event was empty/
    // unconfigured — this is the real, code-driven equivalent.
    if (consented && typeof clarity === 'function') {
        clarity('event', 'purchase_confirmed');
    }
}

/**
 * SHA-256 of a string as hex (Promise). Resolves to '' where WebCrypto is
 * unavailable (non-HTTPS preview hosts); callers skip the event then.
 */
function sha256Hex(str) {
    if (!window.crypto || !window.crypto.subtle) {
        console.log('[pixels.js] WebCrypto unavailable, skipping hash');
        return Promise.resolve('');
    }
    return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
        return Array.from(new Uint8Array(buf)).map(function (b) {
            return ('0' + b.toString(16)).slice(-2);
        }).join('');
    });
}

// ─── Stripe Attribution Passthrough ──────────────────────────────

/**
 * Read a cookie value by name.
 */
function getCookie(name) {
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : '';
}

/**
 * GA4's client_id lives inside the _ga cookie as GA1.2.XXXXXXXXXX.YYYYYYYYYY —
 * the client_id itself is the last two dot-separated segments.
 */
function getGA4ClientId() {
    const ga = getCookie('_ga');
    if (!ga) return '';
    const parts = ga.split('.');
    return parts.length >= 4 ? parts[2] + '.' + parts[3] : '';
}

/**
 * Packs GA4's client_id and Meta's _fbc/_fbp cookies into one string for
 * Stripe's client_reference_id field, so the Apps Script webhook can forward
 * real session/ad-click attribution to GA4 Measurement Protocol and Meta
 * CAPI. Without this, server-side purchase events can't be tied back to the
 * visitor's original session/ad click.
 */
function buildStripeAttributionParam() {
    // Deliberately not hasConsented(): this one is an early return, not a
    // branch around a pixel call, and it guards the one value that must never
    // leave the browser without consent — keep the check local and inverted.
    if (localStorage.getItem(CONSENT_KEY) !== 'accepted') return '';
    const gcid = getGA4ClientId();
    const fbc = getCookie('_fbc');
    const fbp = getCookie('_fbp');
    if (!gcid && !fbc && !fbp) return '';
    const packed = [gcid, fbc, fbp].join('||');
    // Stripe silently drops client_reference_id containing characters outside
    // [A-Za-z0-9_-]; gcid/fbc/fbp contain dots and the separator is '|'.
    // base64url keeps everything in the allowed set. Inputs are ASCII, so
    // btoa() is safe here (it throws on chars > U+00FF).
    // NOTE: this only fixes the charset problem, it is not encryption and adds
    // no confidentiality — fbc/fbp/GA4 client_id are pseudonymized personal
    // identifiers, trivially decodable by anyone with the URL. Per Stripe's
    // own docs: "make sure [client_reference_id] doesn't include sensitive
    // information... only share Payment Links that have URL parameters with
    // intended recipients." This param must never end up in a Payment Link
    // that gets shared publicly (email, QR code, social).
    const encoded = btoa(packed).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    // Check the actual encoded length against Stripe's 200-char cap.
    if (encoded.length > 200) {
        console.warn('[pixels.js] attribution string too long, dropped');
        return '';
    }
    return encoded;
}

/**
 * Appends the packed attribution string to a Stripe link as client_reference_id.
 */
function appendStripeAttribution(url) {
    const param = buildStripeAttributionParam();
    if (!param) return url;
    return url + (url.indexOf('?') > -1 ? '&' : '?') + 'client_reference_id=' + param;
}

// ─── Social & WhatsApp Click Tracking ────────────────────────────

function initSocialClickTracking() {
    // WhatsApp & Stripe — event delegation for dynamic elements
    document.addEventListener('click', function(e) {
        var consented = hasConsented();

        // WhatsApp click → back to Meta's standard Contact event (not a custom
        // event) so it stays selectable as an ad optimization goal in Ads
        // Manager. GA4 keeps its own distinct name (whatsapp_click) since GA4
        // has no such restriction on custom event names.
        var waLink = e.target.closest('a[href*="wa.me"], .whatsapp-float, .btn-whatsapp');
        if (waLink) {
            if (consented && typeof fbq === 'function') {
                fbq('track', 'Contact', { content_name: 'whatsapp' });
            }
            if (typeof gtag === 'function') {
                gtag('event', 'whatsapp_click', {
                    method: 'whatsapp',
                    event_category: 'engagement',
                    transport_type: 'beacon'
                });
            }
            if (consented && typeof clarity === 'function') {
                clarity('event', 'whatsapp_click');
            }
        }

        // Stripe link click → InitiateCheckout (FB Pixel + GA4).
        // NOT a Purchase yet — the customer hasn't paid, just clicked toward
        // Stripe. The real Purchase event fires from thank-you.html, after
        // Stripe redirects back post-payment.
        var stripeLink = e.target.closest('a[href*="buy.stripe.com"], a[href*="book.stripe.com"]');
        if (stripeLink) {
            var value = parseFloat(stripeLink.dataset.purchaseValue) || 0;
            var item = stripeLink.dataset.purchaseItem || 'padel_camp';
            if (typeof trackPurchase === 'function') {
                trackPurchase({ camp: item, value: value });
            }
        }
    });

    // Instagram float button
    document.querySelectorAll('.social-float-instagram').forEach(function(el) {
        el.addEventListener('click', function() {
            var consented = hasConsented();
            if (typeof gtag === 'function') {
                gtag('event', 'click', {
                    event_category: 'social',
                    event_label: 'instagram',
                    transport_type: 'beacon'
                });
            }
            if (consented && typeof fbq === 'function') {
                fbq('trackCustom', 'SocialClick', { platform: 'instagram' });
            }
        });
    });

    // Facebook float button
    document.querySelectorAll('.social-float-facebook').forEach(function(el) {
        el.addEventListener('click', function() {
            var consented = hasConsented();
            if (typeof gtag === 'function') {
                gtag('event', 'click', {
                    event_category: 'social',
                    event_label: 'facebook',
                    transport_type: 'beacon'
                });
            }
            if (consented && typeof fbq === 'function') {
                fbq('trackCustom', 'SocialClick', { platform: 'facebook' });
            }
        });
    });

    // Footer social links
    document.querySelectorAll('.footer-social a').forEach(function(el) {
        el.addEventListener('click', function() {
            var label = el.getAttribute('aria-label') || 'unknown';
            if (typeof gtag === 'function') {
                gtag('event', 'click', {
                    event_category: 'social',
                    event_label: label.toLowerCase(),
                    transport_type: 'beacon'
                });
            }
        });
    });

    // Email button
    document.querySelectorAll('a[href^="mailto:"]').forEach(function(el) {
        el.addEventListener('click', function() {
            if (typeof gtag === 'function') {
                gtag('event', 'click', {
                    event_category: 'social',
                    event_label: 'email',
                    transport_type: 'beacon'
                });
            }
        });
    });
}

// ─── Initialize ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
    var consent = localStorage.getItem(CONSENT_KEY);

    // Consent Mode v2 advanced: gtag.js goes out on every page view, with all
    // four signals denied, so GA4 still receives cookieless pings from
    // visitors who decline or ignore the banner. On a non-production host
    // (localhost, tunnel) the real SDK stays off — loadAllPixels() installs
    // console stubs instead once consent is given.
    if (IS_PRODUCTION_HOST) loadGA4();

    if (consent === 'accepted') {
        // Returning visitor: repeat the decision instead of relying on the
        // stored default, so a granted state survives a cached pixels.js.
        updateGoogleConsent(true);
        loadAllPixels();
    } else if (!consent) {
        createConsentBanner();
    }
    // If 'declined' — the denied default stands, GA4 pings keep coming, no
    // banner and no Meta/Clarity.

    // Always init click tracking. GA4 events fire for everyone (cookieless
    // pings when consent is missing); Meta and Clarity calls inside are
    // individually gated on consent.
    initSocialClickTracking();
});
