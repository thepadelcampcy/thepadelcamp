/**
 * Tracking Pixels & Cookie Consent
 * =================================
 * Meta Pixel + Google Analytics 4 + Google Ads + Microsoft Clarity
 * GDPR-compliant: pixels only load after user consent
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

    const T = {
        en: {
            text: 'We use cookies and analytics tools to improve your experience. Learn more in our <a href="/privacy-policy.html">Privacy Policy</a>.',
            accept: 'Accept', decline: 'Decline'
        },
        ru: {
            text: 'Мы используем файлы cookie и аналитические инструменты для улучшения работы сайта. Подробнее в нашей <a href="/ru/privacy-policy.html">Политике конфиденциальности</a>.',
            accept: 'Принять', decline: 'Отклонить'
        },
        el: {
            text: 'Χρησιμοποιούμε cookies και εργαλεία ανάλυσης για να βελτιώσουμε την εμπειρία σας. Μάθετε περισσότερα στην <a href="/privacy-policy.html">Πολιτική Απορρήτου</a>.',
            accept: 'Αποδοχή', decline: 'Απόρριψη'
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
    loadAllPixels();
}

function declineCookies() {
    localStorage.setItem(CONSENT_KEY, 'declined');
    hideBanner();
}

function hideBanner() {
    const banner = document.getElementById('cookieConsent');
    if (banner) {
        banner.classList.remove('visible');
        setTimeout(() => banner.remove(), 300);
    }
}

// ─── Pixel Loaders ───────────────────────────────────────────────

function loadAllPixels() {
    loadMetaPixel();
    loadGA4();
    loadGoogleAds();
    loadClarity();
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

    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID;
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    window.gtag = gtag;
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
    if (localStorage.getItem(CONSENT_KEY) !== 'accepted') return;

    // Meta Pixel
    if (typeof fbq === 'function') {
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

    if (typeof clarity === 'function') {
        clarity('event', 'registration_submit');
    }
}

/**
 * Track a purchase/payment initiation
 */
function trackPurchase(data) {
    if (localStorage.getItem(CONSENT_KEY) !== 'accepted') return;

    if (typeof fbq === 'function') {
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
    if (typeof clarity === 'function') {
        clarity('event', 'initiate_checkout');
    }
}

/**
 * Track viewing a section of interest (e.g. pricing) — signals intent
 * without requiring the visitor to start a form, useful for retargeting
 * "looked but didn't convert" audiences.
 */
function trackViewContent(data) {
    if (localStorage.getItem(CONSENT_KEY) !== 'accepted') return;

    const contentName = data.name || 'padel_camp';
    const eventId = 'vc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);

    if (typeof fbq === 'function') {
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

    sendViewContentToServer(eventId, contentName);
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
    if (localStorage.getItem(CONSENT_KEY) !== 'accepted') return;

    if (typeof fbq === 'function') {
        fbq('track', 'Contact');
    }

    if (typeof gtag === 'function') {
        gtag('event', 'contact', {
            event_category: 'engagement',
            event_label: 'contact_form'
        });
    }

    if (typeof clarity === 'function') {
        clarity('event', 'contact_submit');
    }
}

/**
 * Track a service booking (massage, media package, etc.)
 */
function trackBooking(serviceName, value) {
    if (localStorage.getItem(CONSENT_KEY) !== 'accepted') return;

    if (typeof fbq === 'function') {
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

    if (typeof clarity === 'function') {
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
 */
function trackConfirmedPurchase(data) {
    if (localStorage.getItem(CONSENT_KEY) !== 'accepted') return;

    if (typeof fbq === 'function') {
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
    if (typeof clarity === 'function') {
        clarity('event', 'purchase_confirmed');
    }
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
    if (localStorage.getItem(CONSENT_KEY) !== 'accepted') return '';
    const gcid = getGA4ClientId();
    const fbc = getCookie('_fbc');
    const fbp = getCookie('_fbp');
    if (!gcid && !fbc && !fbp) return '';
    return encodeURIComponent([gcid, fbc, fbp].join('||'));
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
        if (localStorage.getItem(CONSENT_KEY) !== 'accepted') return;

        // WhatsApp click → back to Meta's standard Contact event (not a custom
        // event) so it stays selectable as an ad optimization goal in Ads
        // Manager. GA4 keeps its own distinct name (whatsapp_click) since GA4
        // has no such restriction on custom event names.
        var waLink = e.target.closest('a[href*="wa.me"], .whatsapp-float, .btn-whatsapp');
        if (waLink) {
            if (typeof fbq === 'function') {
                fbq('track', 'Contact', { content_name: 'whatsapp' });
            }
            if (typeof gtag === 'function') {
                gtag('event', 'whatsapp_click', {
                    method: 'whatsapp',
                    event_category: 'engagement',
                    transport_type: 'beacon'
                });
            }
            if (typeof clarity === 'function') {
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
            if (localStorage.getItem(CONSENT_KEY) !== 'accepted') return;
            if (typeof gtag === 'function') {
                gtag('event', 'click', {
                    event_category: 'social',
                    event_label: 'instagram',
                    transport_type: 'beacon'
                });
            }
            if (typeof fbq === 'function') {
                fbq('trackCustom', 'SocialClick', { platform: 'instagram' });
            }
        });
    });

    // Facebook float button
    document.querySelectorAll('.social-float-facebook').forEach(function(el) {
        el.addEventListener('click', function() {
            if (localStorage.getItem(CONSENT_KEY) !== 'accepted') return;
            if (typeof gtag === 'function') {
                gtag('event', 'click', {
                    event_category: 'social',
                    event_label: 'facebook',
                    transport_type: 'beacon'
                });
            }
            if (typeof fbq === 'function') {
                fbq('trackCustom', 'SocialClick', { platform: 'facebook' });
            }
        });
    });

    // Footer social links
    document.querySelectorAll('.footer-social a').forEach(function(el) {
        el.addEventListener('click', function() {
            if (localStorage.getItem(CONSENT_KEY) !== 'accepted') return;
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
            if (localStorage.getItem(CONSENT_KEY) !== 'accepted') return;
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

    if (consent === 'accepted') {
        loadAllPixels();
    } else if (!consent) {
        createConsentBanner();
    }
    // If 'declined' — do nothing, no banner, no pixels

    // Always init click tracking (events only fire if consent given)
    initSocialClickTracking();
});
