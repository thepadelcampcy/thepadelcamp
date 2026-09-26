/**
 * Padel Camp Cyprus - Main JavaScript
 * ===================================
 */

// Google Apps Script URL для отправки данных
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyRFc1LgrjR1okUiCvZRepdiKKhM0u_BcIfJz0pfpJhnqDvkXpHCeUUQYiEVpt18CvLOA/exec';

// Anti-spam: page load timestamp, used to reject submissions that arrive
// too fast to be a human (bots that auto-fill + submit instantly)
const PAGE_LOAD_TIME = Date.now();
const MIN_SUBMIT_DELAY_MS = 3000;

// Anti-spam check for form submit handlers: honeypot field must stay empty
// (bots that auto-fill every input trip it) and submission must not be
// suspiciously instant. Returns true if the submission looks like a bot.
function isBotSubmission(form) {
    const honeypot = form.querySelector('.hp-field');
    if (honeypot && honeypot.value) return true;
    if (Date.now() - PAGE_LOAD_TIME < MIN_SUBMIT_DELAY_MS) return true;
    return false;
}

// Current page language (en / ru / el), used to pick the right text for
// modals that are shared between index.html, ru/index.html and el/index.html.
function getPageLang() {
    const lang = document.documentElement.lang;
    return (lang === 'ru' || lang === 'el') ? lang : 'en';
}

// Функция для отправки данных в Google Sheets + Telegram
function sendToGoogleSheets(data) {
    return fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
    });
}

document.addEventListener('DOMContentLoaded', function() {
    // Initialize all modules
    initMobileMenu();
    initSmoothScroll();
    initCountdown();
    initProgramTabs();
    initMassageCalendar();
    initFAQ();
    initHeaderScroll();
    initContactForm();
    initAnimations();
    initPricingViewTracking();

    // Static Stripe links (no form in front of them) need attribution
    // applied on load, since there's no JS-generated innerHTML step to
    // hook into like the camp/massage flows.
    ['mediaPackageStripeLink', 'morningStripeLink', 'eveningStripeLink', 'weekendStripeLink'].forEach(function(id) {
        var link = document.getElementById(id);
        if (link && typeof appendStripeAttribution === 'function') {
            link.href = appendStripeAttribution(link.href);
        }
    });
});

/**
 * Mobile Menu Toggle
 */
function initMobileMenu() {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const nav = document.getElementById('nav');
    const navLinks = document.querySelectorAll('.nav-list a');

    if (mobileMenuBtn && nav) {
        mobileMenuBtn.addEventListener('click', function() {
            this.classList.toggle('active');
            nav.classList.toggle('active');
            document.body.style.overflow = nav.classList.contains('active') ? 'hidden' : '';
        });

        // Close menu when clicking a link
        navLinks.forEach(link => {
            link.addEventListener('click', function() {
                mobileMenuBtn.classList.remove('active');
                nav.classList.remove('active');
                document.body.style.overflow = '';
            });
        });

        // Close menu when clicking outside
        document.addEventListener('click', function(e) {
            if (!nav.contains(e.target) && !mobileMenuBtn.contains(e.target) && nav.classList.contains('active')) {
                mobileMenuBtn.classList.remove('active');
                nav.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }
}

/**
 * Smooth Scrolling for Anchor Links
 */
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');

            if (targetId === '#') return;

            const target = document.querySelector(targetId);
            if (target) {
                // scroll-margin-top (see CSS) handles the header offset —
                // reading .header's live offsetHeight here was wrong: on
                // this design the header shrinks from 25vh to 70px once
                // .scrolled kicks in, so a click from the very top used the
                // large pre-scroll height and landed short of the target.
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}

/**
 * Countdown Timer
 */
function initCountdown() {
    // Camp start date: October 5, 2026
    const campDate = new Date('October 5, 2026 09:00:00').getTime();

    const daysEl = document.getElementById('days');
    const hoursEl = document.getElementById('hours');
    const minutesEl = document.getElementById('minutes');
    const secondsEl = document.getElementById('seconds');

    if (!daysEl || !hoursEl || !minutesEl || !secondsEl) return;

    function updateCountdown() {
        const now = new Date().getTime();
        const distance = campDate - now;

        if (distance < 0) {
            daysEl.textContent = '00';
            hoursEl.textContent = '00';
            minutesEl.textContent = '00';
            secondsEl.textContent = '00';
            return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        daysEl.textContent = days.toString().padStart(2, '0');
        hoursEl.textContent = hours.toString().padStart(2, '0');
        minutesEl.textContent = minutes.toString().padStart(2, '0');
        secondsEl.textContent = seconds.toString().padStart(2, '0');
    }

    updateCountdown();
    setInterval(updateCountdown, 1000);
}

/**
 * Program Tabs (Limassol / Larnaca)
 */
function initProgramTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const programContents = document.querySelectorAll('.program-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const targetTab = this.dataset.tab;

            // Remove active class from all
            tabBtns.forEach(b => b.classList.remove('active'));
            programContents.forEach(c => c.classList.remove('active'));

            // Add active class to clicked
            this.classList.add('active');
            const targetContent = document.getElementById(targetTab);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });

    // Program details accordion (View details)
    const detailsButtons = document.querySelectorAll('.btn-view-details');

    detailsButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const block = this.closest('.program-details-block');
            if (!block) return;

            const isActive = block.classList.contains('active');
            block.classList.toggle('active', !isActive);
            this.setAttribute('aria-expanded', String(!isActive));
            this.textContent = isActive ? this.dataset.labelView : this.dataset.labelHide;
        });
    });
}

/**
 * Massage Booking Calendar (Simplified - no calendar needed)
 */
function initMassageCalendar() {
    // Calendar no longer needed - booking handled directly through session cards
}

/**
 * Service Booking Form Modal
 */
function openServiceBookingForm(serviceName, price) {
    const modal = document.getElementById('serviceBookingModal');
    const titleEl = document.getElementById('serviceBookingTitle');
    const infoEl = document.getElementById('selectedServiceInfo');
    const serviceNameInput = document.getElementById('serviceName');
    const priceInput = document.getElementById('servicePrice');

    if (modal && infoEl && serviceNameInput && priceInput) {
        // Update the displayed info
        const lang = getPageLang();
        const titleText = { en: 'Book Service', ru: 'Забронировать услугу', el: 'Κράτηση Υπηρεσίας' };
        const hourText = { en: 'hour', ru: 'час', el: 'ώρα' };

        if (titleEl) {
            titleEl.textContent = titleText[lang];
        }

        const priceText = serviceName.includes('hour') || serviceName.includes('час') || serviceName.includes('ώρα')
            ? `€${price} / ${hourText[lang]}`
            : `€${price}`;

        infoEl.textContent = `${serviceName} — ${priceText}`;

        // Set hidden form values
        serviceNameInput.value = serviceName;
        priceInput.value = price;

        // Open booking form modal
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeServiceBookingModal() {
    const modal = document.getElementById('serviceBookingModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';

        // Reset form
        const form = document.getElementById('serviceBookingForm');
        if (form) {
            form.reset();
        }
    }
}

/**
 * FAQ Accordion
 */
function initFAQ() {
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');

        question.addEventListener('click', function() {
            const isActive = item.classList.contains('active');

            // Close all FAQ items
            faqItems.forEach(i => i.classList.remove('active'));

            // Open clicked item if it wasn't active
            if (!isActive) {
                item.classList.add('active');
            }
        });
    });

    // Approach Accordion (Goals/Methodology)
    const approachItems = document.querySelectorAll('.approach-item');

    approachItems.forEach(item => {
        const question = item.querySelector('.approach-question');

        question.addEventListener('click', function() {
            const isActive = item.classList.contains('active');

            // Close all approach items
            approachItems.forEach(i => i.classList.remove('active'));

            // Open clicked item if it wasn't active
            if (!isActive) {
                item.classList.add('active');
            }
        });
    });
}

/**
 * Header Scroll Effect
 */
function initHeaderScroll() {
    const header = document.querySelector('.header');

    if (!header) return;

    let lastScroll = 0;

    window.addEventListener('scroll', function() {
        const currentScroll = window.pageYOffset;

        if (currentScroll > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }

        lastScroll = currentScroll;
    });
}

/**
 * Contact Form Handling
 */
function initContactForm() {
    const contactForm = document.getElementById('contactForm');

    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();

            // Get form data
            const formData = new FormData(this);
            const data = Object.fromEntries(formData.entries());

            // Here you would typically send the data to a server
            // For now, we'll show a success message

            // Create success message
            const successMsg = document.createElement('div');
            successMsg.className = 'form-success';
            successMsg.innerHTML = `
                <div style="text-align: center; padding: 30px;">
                    <span style="font-size: 50px;">✅</span>
                    <h3 style="margin: 20px 0 10px;">Message Sent!</h3>
                    <p style="color: #6B7280;">We'll get back to you within 24 hours.</p>
                </div>
            `;

            // Replace form with success message
            contactForm.innerHTML = '';
            contactForm.appendChild(successMsg);

            // Track contact form event
            if (typeof trackContact === 'function') {
                trackContact();
            }

            // Log data (for development)
            console.log('Form submitted:', data);
        });
    }

}

/**
 * Scroll Animations (Intersection Observer)
 */
function initAnimations() {
    const animatedElements = document.querySelectorAll('.feature-card, .service-card, .price-card, .coach-card, .schedule-day');

    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        });

        animatedElements.forEach(el => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(30px)';
            el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            observer.observe(el);
        });
    }
}

/**
 * Fires a ViewContent/view_item event once when the visitor actually scrolls
 * the pricing section into view — signals "looked at prices but didn't act"
 * for retargeting, separate from Lead/InitiateCheckout which only fire once
 * someone starts the registration/payment flow.
 */
function initPricingViewTracking() {
    const pricingSection = document.getElementById('program');
    if (!pricingSection || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                if (typeof trackViewContent === 'function') {
                    trackViewContent({ name: 'pricing' });
                }
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.3 });

    observer.observe(pricingSection);
}

/**
 * Utility: Format date for different locales
 */
function formatDate(date, locale = 'en') {
    const options = {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    };
    return new Date(date).toLocaleDateString(locale, options);
}

/**
 * Venue Gallery Modal
 */
const venueImages = [
    'assets/images/venue/court-1.jpg',
    'assets/images/venue/court-2.jpg',
    'assets/images/venue/court-3.jpg',
    'assets/images/venue/facilities.jpg',
    'assets/images/venue/clubhouse.jpg',
    'assets/images/venue/lounge.jpg'
];
let currentVenueSlide = 0;

function openVenueModal(index) {
    currentVenueSlide = index;
    const modal = document.getElementById('venueModal');
    const img = document.getElementById('venueModalImg');
    if (modal && img) {
        img.src = venueImages[index];
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeVenueModal() {
    const modal = document.getElementById('venueModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function changeVenueSlide(direction) {
    currentVenueSlide += direction;
    if (currentVenueSlide >= venueImages.length) currentVenueSlide = 0;
    if (currentVenueSlide < 0) currentVenueSlide = venueImages.length - 1;

    const img = document.getElementById('venueModalImg');
    if (img) {
        img.src = venueImages[currentVenueSlide];
    }
}

// Close modal on escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeVenueModal();
        closeServiceBookingModal();
    }
    if (e.key === 'ArrowRight') {
        changeVenueSlide(1);
    }
    if (e.key === 'ArrowLeft') {
        changeVenueSlide(-1);
    }
});

// Close modal on backdrop click
document.addEventListener('click', function(e) {
    const venueModal = document.getElementById('venueModal');
    const serviceBookingModal = document.getElementById('serviceBookingModal');
    if (e.target === venueModal) {
        closeVenueModal();
    }
    if (e.target === serviceBookingModal) {
        closeServiceBookingModal();
    }
});

/**
 * Gallery Video Lightbox
 */
function openVideoLightbox(src) {
    const modal = document.getElementById('videoLightbox');
    const video = document.getElementById('videoLightboxPlayer');
    if (!modal || !video) return;

    video.src = src;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    video.play();
}

function closeVideoLightbox() {
    const modal = document.getElementById('videoLightbox');
    const video = document.getElementById('videoLightboxPlayer');
    if (!modal || !video) return;

    video.pause();
    video.removeAttribute('src');
    video.load();
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

function toggleGallery() {
    const grid = document.querySelector('.gallery-grid');
    const btn = document.getElementById('galleryToggleBtn');
    if (!grid || !btn) return;

    const collapsed = grid.classList.toggle('collapsed');
    btn.textContent = collapsed ? btn.dataset.labelMore : btn.dataset.labelLess;
}

document.addEventListener('click', function(e) {
    const trigger = e.target.closest('.gallery-video');
    if (trigger) {
        const src = trigger.getAttribute('data-video-src');
        if (src) openVideoLightbox(src);
        return;
    }
    if (e.target.id === 'videoLightbox') closeVideoLightbox();
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeVideoLightbox();
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const trigger = e.target.closest('.gallery-video');
    if (trigger) {
        e.preventDefault();
        const src = trigger.getAttribute('data-video-src');
        if (src) openVideoLightbox(src);
    }
});

/**
 * Active Navigation Link Highlight
 */
function initActiveNavHighlight() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link');

    window.addEventListener('scroll', function() {
        let current = '';
        const headerHeight = document.querySelector('.header').offsetHeight;

        sections.forEach(section => {
            const sectionTop = section.offsetTop - headerHeight - 100;
            const sectionBottom = sectionTop + section.offsetHeight;

            if (window.pageYOffset >= sectionTop && window.pageYOffset < sectionBottom) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
    });
}

// Initialize active nav highlight
initActiveNavHighlight();

// Registration now goes straight through direct Stripe Payment Links (see
// index.html) instead of this custom lead-capture modal — the modal, its
// open/close helpers and its submit handler were removed along with it.
document.addEventListener('DOMContentLoaded', function() {
    // Service Booking Form Submission
    const serviceBookingForm = document.getElementById('serviceBookingForm');
    if (serviceBookingForm) {
        serviceBookingForm.addEventListener('submit', function(e) {
            e.preventDefault();
            if (isBotSubmission(this)) return;

            // Collect form data
            const formData = new FormData(this);
            const data = {
                type: 'service',
                service: formData.get('serviceName'),
                price: formData.get('servicePrice'),
                name: formData.get('serviceBookingName'),
                phone: formData.get('serviceBookingPhone'),
                email: formData.get('serviceBookingEmail'),
                notes: formData.get('serviceBookingNotes'),
                lang: document.documentElement.lang || 'en'
            };

            console.log('Service booking data:', data);

            // Отправляем данные в Google Sheets + Telegram
            sendToGoogleSheets(data).catch(err => console.log('Send error:', err));

            // Track service booking event
            if (typeof trackBooking === 'function') {
                trackBooking(data.service, parseFloat(data.price) || 0);
            }

            // Determine language
            const lang = getPageLang();
            const hourText = { en: 'hour', ru: 'час', el: 'ώρα' };

            const priceText = data.service.includes('hour') || data.service.includes('час') || data.service.includes('ώρα')
                ? `€${data.price} / ${hourText[lang]}`
                : `€${data.price}`;

            const T = {
                en: {
                    heading: 'Booking Request Submitted!', thanks: 'Thank you', next: 'What\'s Next?',
                    contactSoon: 'We will contact you shortly to confirm your booking.', contactAt: 'We will contact you at:',
                    note: 'Note:', noteText: 'Payment will be arranged after confirmation.', close: 'Close'
                },
                ru: {
                    heading: 'Запрос отправлен!', thanks: 'Спасибо', next: 'Что дальше?',
                    contactSoon: 'Мы свяжемся с вами в ближайшее время для подтверждения бронирования.', contactAt: 'Мы свяжемся с вами по:',
                    note: 'Примечание:', noteText: 'Оплата будет произведена после подтверждения.', close: 'Закрыть'
                },
                el: {
                    heading: 'Το Αίτημα Κράτησης Στάλθηκε!', thanks: 'Ευχαριστούμε', next: 'Τι Ακολουθεί;',
                    contactSoon: 'Θα επικοινωνήσουμε μαζί σας σύντομα για να επιβεβαιώσουμε την κράτησή σας.', contactAt: 'Θα επικοινωνήσουμε μαζί σας στο:',
                    note: 'Σημείωση:', noteText: 'Η πληρωμή θα κανονιστεί μετά την επιβεβαίωση.', close: 'Κλείσιμο'
                }
            }[lang];

            // Show success message
            const modalContent = document.querySelector('#serviceBookingModal .massage-booking-modal-content');
            modalContent.innerHTML = `
                <button class="massage-modal-close" onclick="closeServiceBookingModal()">&times;</button>
                <div class="payment-success">
                    <div class="payment-success-icon">✓</div>
                    <h2>${T.heading}</h2>
                    <p class="payment-success-subtitle">${T.thanks}, ${data.name}!</p>

                    <div class="payment-details-box">
                        <h3>${T.next}</h3>
                        <p class="payment-camp">${data.service} — ${priceText}</p>

                        <div class="massage-booking-success-info">
                            <p>${T.contactSoon}</p>
                            <p><strong>${T.contactAt}</strong></p>
                            <p>📞 ${data.phone}<br>✉️ ${data.email}</p>
                        </div>

                        <div class="payment-note">
                            <strong>${T.note}</strong> ${T.noteText}
                        </div>
                    </div>

                    <button onclick="closeServiceBookingModal()" class="btn btn-primary btn-block">
                        ${T.close}
                    </button>
                </div>
            `;
        });
    }

});

/**
 * Download Payment Details PDF
 */
function downloadPaymentDetails(fullName, campName, amount) {
    // Download the bank details PDF certificate
    const link = document.createElement('a');
    link.href = 'assets/Padel_Camp_Bank_Details.pdf';
    link.download = 'Padel_Camp_Bank_Details.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
