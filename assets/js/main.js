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
                const headerHeight = document.querySelector('.header').offsetHeight;
                const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - headerHeight;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
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
 * Massage Booking Form Modal
 */
function openMassageBookingForm(duration, price) {
    const modal = document.getElementById('massageBookingModal');
    const infoEl = document.getElementById('selectedMassageInfo');
    const durationInput = document.getElementById('massageDuration');
    const priceInput = document.getElementById('massagePrice');

    if (modal && infoEl && durationInput && priceInput) {
        // Update the displayed info
        const lang = getPageLang();
        const minText = { en: 'min', ru: 'мин', el: 'λεπτά' };
        infoEl.textContent = `${duration} ${minText[lang]} — €${price}`;

        // Set hidden form values
        durationInput.value = duration;
        priceInput.value = price;

        // Close main massage modal if open
        closeMassageModal();

        // Open booking form modal
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeMassageBookingModal() {
    const modal = document.getElementById('massageBookingModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';

        // Reset form
        const form = document.getElementById('massageBookingForm');
        if (form) {
            form.reset();
        }
    }
}

/**
 * Massage Modal
 */
function openMassageModal() {
    const modal = document.getElementById('massageModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeMassageModal() {
    const modal = document.getElementById('massageModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

/**
 * Media Package Modal
 */
function openMediaPackageModal() {
    const modal = document.getElementById('mediaPackageModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeMediaPackageModal() {
    const modal = document.getElementById('mediaPackageModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
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
    const pricingSection = document.getElementById('pricing');
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
        closeMassageModal();
        closeMassageBookingModal();
        closeServiceBookingModal();
        closeMediaPackageModal();
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
    const massageModal = document.getElementById('massageModal');
    const massageBookingModal = document.getElementById('massageBookingModal');
    const serviceBookingModal = document.getElementById('serviceBookingModal');
    const mediaPackageModal = document.getElementById('mediaPackageModal');
    if (e.target === venueModal) {
        closeVenueModal();
    }
    if (e.target === massageModal) {
        closeMassageModal();
    }
    if (e.target === massageBookingModal) {
        closeMassageBookingModal();
    }
    if (e.target === serviceBookingModal) {
        closeServiceBookingModal();
    }
    if (e.target === mediaPackageModal) {
        closeMediaPackageModal();
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

/**
 * Registration Modal
 */
function openRegistrationModal(campType) {
    const modal = document.getElementById('registrationModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Pre-select camp type if specified
        if (campType === '6-day' || campType === '4-day' || campType === '2-day') {
            document.querySelector('input[name="camp"][value="' + campType + '"]').checked = true;
        }
        updateCampSelection();
    }
}

function closeRegistrationModal() {
    const modal = document.getElementById('registrationModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function updateCampSelection() {
    const selectedCamp = document.querySelector('input[name="camp"]:checked');
    const infoEl = document.getElementById('selectedCampInfo');

    if (selectedCamp && infoEl) {
        if (selectedCamp.value === '6-day') {
            infoEl.textContent = '6-Day Camp';
        } else if (selectedCamp.value === '4-day') {
            infoEl.textContent = '4-Day Camp';
        } else {
            infoEl.textContent = '2-Day Camp';
        }
    }
}

// Close registration modal on escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeRegistrationModal();
    }
});

// Close registration modal on backdrop click
document.addEventListener('click', function(e) {
    const modal = document.getElementById('registrationModal');
    if (e.target === modal) {
        closeRegistrationModal();
    }
});

// Registration form submission
document.addEventListener('DOMContentLoaded', function() {
    const registrationForm = document.getElementById('registrationForm');
    const registrationModal = document.getElementById('registrationModal');

    // Only attach handler when the modal exists (main page) to avoid
    // duplicate submissions on standalone registration pages which have
    // their own inline handlers.
    if (registrationForm && registrationModal) {
        registrationForm.addEventListener('submit', function(e) {
            e.preventDefault();
            if (isBotSubmission(this)) return;

            // Validate at least one goal is selected
            const goals = document.querySelectorAll('input[name="goals"]:checked');
            if (goals.length === 0) {
                alert('Please select at least one goal for the camp.');
                return;
            }

            // Collect form data
            const formData = new FormData(this);
            const data = {
                type: 'camp',
                camp: formData.get('camp'),
                fullName: formData.get('fullName'),
                phone: formData.get('phone'),
                email: formData.get('email'),
                level: formData.get('level'),
                goals: Array.from(goals).map(g => g.value),
                skills: formData.get('skills'),
                tshirt: formData.get('tshirt'),
                consent: formData.get('consent') ? true : false,
                lang: document.documentElement.lang || 'en'
            };

            console.log('Registration data:', data);

            // Отправляем данные в Google Sheets + Telegram
            sendToGoogleSheets(data).catch(err => console.log('Send error:', err));

            // Track registration event
            const lang = getPageLang();
            const nameMap = {
                en: { '6-day': '6-Day Camp', '4-day': '4-Day Camp', '2-day': '2-Day Camp' },
                ru: { '6-day': '6-дневный лагерь', '4-day': '4-дневный лагерь', '2-day': '2-дневный лагерь' },
                el: { '6-day': '6ήμερο Camp', '4-day': '4ήμερο Camp', '2-day': '2ήμερο Camp' }
            };
            if (typeof trackRegistration === 'function') {
                trackRegistration({ type: 'camp_registration', camp: data.camp, value: 0 });
            }

            const campName = nameMap[lang][data.camp] || '';

            const T = {
                en: {
                    heading: 'Application Received!', thanks: 'Thank you', next: 'What\'s Next?',
                    body: 'We\'re moving the camp to November 2026 — exact dates and prices will be announced soon. We\'ll contact you as soon as they\'re confirmed.',
                    contactAt: 'We\'ll reach out to you at:', close: 'Close'
                },
                ru: {
                    heading: 'Заявка получена!', thanks: 'Спасибо', next: 'Что дальше?',
                    body: 'Мы переносим кемп на ноябрь 2026 — точные даты и цены объявим совсем скоро. Свяжемся с вами, как только всё будет готово.',
                    contactAt: 'Мы свяжемся с вами по:', close: 'Закрыть'
                },
                el: {
                    heading: 'Η Αίτηση Ελήφθη!', thanks: 'Ευχαριστούμε', next: 'Τι Ακολουθεί;',
                    body: 'Μεταφέρουμε το camp για Νοέμβριο 2026 — οι ακριβείς ημερομηνίες και τιμές θα ανακοινωθούν σύντομα. Θα επικοινωνήσουμε μαζί σας μόλις οριστικοποιηθούν.',
                    contactAt: 'Θα επικοινωνήσουμε μαζί σας στο:', close: 'Κλείσιμο'
                }
            }[lang];

            // Show lead-capture confirmation screen
            const modalContent = document.querySelector('.registration-modal-content');
            modalContent.innerHTML = `
                <button class="registration-modal-close" onclick="closeRegistrationModal()">&times;</button>
                <div class="payment-success">
                    <div class="payment-success-icon">✓</div>
                    <h2>${T.heading}</h2>
                    <p class="payment-success-subtitle">${T.thanks}, ${data.fullName}!</p>

                    <div class="payment-details-box">
                        <h3>${T.next}</h3>
                        <p class="payment-camp">${campName}</p>
                        <p>${T.body}</p>

                        <div class="massage-booking-success-info">
                            <p><strong>${T.contactAt}</strong></p>
                            <p>📞 ${data.phone}<br>✉️ ${data.email}</p>
                        </div>
                    </div>

                    <button onclick="closeRegistrationModal()" class="btn btn-primary btn-block">
                        ${T.close}
                    </button>
                </div>
            `;
        });
    }

    // Update booking buttons to open modal
    const bookLimassol = document.getElementById('bookLimassol');
    const bookLarnaca = document.getElementById('bookLarnaca');

    if (bookLimassol) {
        bookLimassol.addEventListener('click', function(e) {
            e.preventDefault();
            openRegistrationModal('6-day');
        });
    }

    if (bookLarnaca) {
        bookLarnaca.addEventListener('click', function(e) {
            e.preventDefault();
            openRegistrationModal('2-day');
        });
    }

    // Hero CTA buttons — scroll to pricing section
    const heroCta = document.querySelector('.hero-cta a[href="#pricing"]');
    if (heroCta) {
        heroCta.addEventListener('click', function(e) {
            e.preventDefault();
            document.getElementById('pricing').scrollIntoView({ behavior: 'smooth' });
        });
    }

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

    // Massage Booking Form Submission
    const massageBookingForm = document.getElementById('massageBookingForm');
    if (massageBookingForm) {
        massageBookingForm.addEventListener('submit', function(e) {
            e.preventDefault();
            if (isBotSubmission(this)) return;

            // Collect form data
            const formData = new FormData(this);
            const data = {
                type: 'massage',
                duration: formData.get('massageDuration'),
                price: formData.get('massagePrice'),
                name: formData.get('massageName'),
                phone: formData.get('massagePhone'),
                email: formData.get('massageEmail'),
                notes: formData.get('massageNotes'),
                lang: document.documentElement.lang || 'en'
            };

            console.log('Massage booking data:', data);

            // Отправляем данные в Google Sheets + Telegram
            sendToGoogleSheets(data).catch(err => console.log('Send error:', err));

            // Track massage booking event
            if (typeof trackBooking === 'function') {
                trackBooking('massage_' + data.duration, parseFloat(data.price) || 0);
            }

            // Determine language
            const lang = getPageLang();

            const T = {
                en: {
                    thanks: 'Thank you', massage: 'Massage', min: 'min', next: 'What\'s Next?',
                    body: 'The camp is moving to November 2026 — exact dates will be announced soon. We\'ll confirm your massage booking once they\'re set.',
                    contactAt: 'We\'ll reach out to you at:', close: 'Close'
                },
                ru: {
                    thanks: 'Спасибо', massage: 'Массаж', min: 'мин', next: 'Что дальше?',
                    body: 'Кемп переносится на ноябрь 2026 — точные даты объявим скоро. Подтвердим вашу запись на массаж, как только всё будет готово.',
                    contactAt: 'Мы свяжемся с вами по:', close: 'Закрыть'
                },
                el: {
                    thanks: 'Ευχαριστούμε', massage: 'Μασάζ', min: 'λεπτά', next: 'Τι Ακολουθεί;',
                    body: 'Το camp μεταφέρεται για Νοέμβριο 2026 — οι ακριβείς ημερομηνίες θα ανακοινωθούν σύντομα. Θα επιβεβαιώσουμε την κράτησή σας για μασάζ μόλις οριστικοποιηθούν.',
                    contactAt: 'Θα επικοινωνήσουμε μαζί σας στο:', close: 'Κλείσιμο'
                }
            }[lang];

            // Show lead-capture confirmation screen
            const modalContent = document.querySelector('#massageBookingModal .massage-booking-modal-content');
            modalContent.innerHTML = `
                <button class="massage-modal-close" onclick="closeMassageBookingModal()">&times;</button>
                <div class="payment-success">
                    <div class="payment-success-icon">✓</div>
                    <h2>${T.thanks}, ${data.name}!</h2>
                    <p class="payment-success-subtitle">${T.massage} ${data.duration} ${T.min}</p>

                    <div class="payment-details-box">
                        <h3>${T.next}</h3>
                        <p>${T.body}</p>

                        <div class="massage-booking-success-info">
                            <p><strong>${T.contactAt}</strong></p>
                            <p>📞 ${data.phone}<br>✉️ ${data.email}</p>
                        </div>
                    </div>

                    <button onclick="closeMassageBookingModal()" class="btn btn-primary btn-block">
                        ${T.close}
                    </button>
                </div>
            `;
        });
    }

    // Media Package Form Submission
    const mediaPackageForm = document.getElementById('mediaPackageForm');
    if (mediaPackageForm) {
        mediaPackageForm.addEventListener('submit', function(e) {
            e.preventDefault();
            if (isBotSubmission(this)) return;

            // Collect form data
            const formData = new FormData(this);
            const data = {
                type: 'media',
                name: formData.get('mediaPackageName'),
                phone: formData.get('mediaPackagePhone'),
                email: formData.get('mediaPackageEmail'),
                notes: formData.get('mediaPackageNotes'),
                lang: document.documentElement.lang || 'en'
            };

            console.log('Media Package booking data:', data);

            // Отправляем данные в Google Sheets + Telegram
            sendToGoogleSheets(data).catch(err => console.log('Send error:', err));

            // Track media package booking event
            if (typeof trackBooking === 'function') {
                trackBooking('media_package', 150);
            }

            // Determine language
            const lang = getPageLang();

            const T = {
                en: {
                    thanks: 'Thank you', subtitle: 'Media Package', next: 'What\'s Next?',
                    body: 'The camp is moving to November 2026 — exact dates will be announced soon. We\'ll confirm your media package booking once they\'re set.',
                    contactAt: 'We\'ll reach out to you at:', close: 'Close'
                },
                ru: {
                    thanks: 'Спасибо', subtitle: 'Медиапакет «На память»', next: 'Что дальше?',
                    body: 'Кемп переносится на ноябрь 2026 — точные даты объявим скоро. Подтвердим ваш медиапакет, как только всё будет готово.',
                    contactAt: 'Мы свяжемся с вами по:', close: 'Закрыть'
                },
                el: {
                    thanks: 'Ευχαριστούμε', subtitle: 'Πακέτο Media', next: 'Τι Ακολουθεί;',
                    body: 'Το camp μεταφέρεται για Νοέμβριο 2026 — οι ακριβείς ημερομηνίες θα ανακοινωθούν σύντομα. Θα επιβεβαιώσουμε το πακέτο media σας μόλις οριστικοποιηθούν.',
                    contactAt: 'Θα επικοινωνήσουμε μαζί σας στο:', close: 'Κλείσιμο'
                }
            }[lang];

            // Show lead-capture confirmation screen
            const modalContent = document.querySelector('#mediaPackageModal .massage-booking-modal-content');
            modalContent.innerHTML = `
                <button class="massage-modal-close" onclick="closeMediaPackageModal()">&times;</button>
                <div class="payment-success">
                    <div class="payment-success-icon">✓</div>
                    <h2>${T.thanks}, ${data.name}!</h2>
                    <p class="payment-success-subtitle">${T.subtitle}</p>

                    <div class="payment-details-box">
                        <h3>${T.next}</h3>
                        <p>${T.body}</p>

                        <div class="massage-booking-success-info">
                            <p><strong>${T.contactAt}</strong></p>
                            <p>📞 ${data.phone}<br>✉️ ${data.email}</p>
                        </div>
                    </div>

                    <button onclick="closeMediaPackageModal()" class="btn btn-primary btn-block">
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
