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
            infoEl.textContent = '6-Day Camp — €900';
        } else if (selectedCamp.value === '4-day') {
            infoEl.textContent = '4-Day Camp — €650';
        } else {
            infoEl.textContent = '2-Day Camp — €350';
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
            const priceMap = { '6-day': 900, '4-day': 650, '2-day': 350 };
            const nameMap = {
                en: { '6-day': '6-Day Camp (October 5-10)', '4-day': '4-Day Camp (October 5-8)', '2-day': '2-Day Camp (October 9-10)' },
                ru: { '6-day': '6-дневный лагерь (5-10 октября)', '4-day': '4-дневный лагерь (5-8 октября)', '2-day': '2-дневный лагерь (9-10 октября)' },
                el: { '6-day': '6ήμερο Camp (5-10 Οκτωβρίου)', '4-day': '4ήμερο Camp (5-8 Οκτωβρίου)', '2-day': '2ήμερο Camp (9-10 Οκτωβρίου)' }
            };
            const stripeMap = {
                '6-day': 'https://book.stripe.com/14A9AV1OL4oXg4Vfy4cEw0f',
                '4-day': 'https://book.stripe.com/14A28t651f3B5qhclScEw0g',
                '2-day': 'https://book.stripe.com/eVq6oJalhaNlg4V5XucEw0h'
            };
            const priceNum = priceMap[data.camp] || 0;
            if (typeof trackRegistration === 'function') {
                trackRegistration({ type: 'camp_registration', camp: data.camp, value: priceNum });
            }

            // Create payment details
            const campName = nameMap[lang][data.camp] || '';
            const stripeLink = stripeMap[data.camp] || '';

            const T = {
                en: {
                    heading: 'Registration Submitted!', thanks: 'Thank you', complete: 'Complete Your Payment',
                    amount: 'Amount:', option1: 'Option 1: Pay Online with Stripe', secure: 'Secure online payment with card',
                    pay: 'Pay with Stripe', or: 'OR', option2: 'Option 2: Bank Transfer', bank: 'Contact us on WhatsApp for bank details',
                    important: 'Important:', confirm: 'After payment, please confirm via WhatsApp', whatsappBtn: 'Confirm Payment via WhatsApp',
                    whatsappMsg: (camp, name) => `Hi! I have completed the payment for ${camp}. Name: ${name}`
                },
                ru: {
                    heading: 'Регистрация отправлена!', thanks: 'Спасибо', complete: 'Завершите оплату',
                    amount: 'Сумма:', option1: 'Вариант 1: Оплата онлайн через Stripe', secure: 'Безопасная онлайн-оплата картой',
                    pay: 'Оплатить через Stripe', or: 'ИЛИ', option2: 'Вариант 2: Банковский перевод', bank: 'Свяжитесь с нами в WhatsApp для банковских реквизитов',
                    important: 'Важно:', confirm: 'После оплаты подтвердите через WhatsApp', whatsappBtn: 'Подтвердить оплату через WhatsApp',
                    whatsappMsg: (camp, name) => `Привет! Я завершил(а) оплату за ${camp}. Имя: ${name}`
                },
                el: {
                    heading: 'Η Εγγραφή Στάλθηκε!', thanks: 'Ευχαριστούμε', complete: 'Ολοκληρώστε την Πληρωμή',
                    amount: 'Ποσό:', option1: 'Επιλογή 1: Online Πληρωμή με Stripe', secure: 'Ασφαλής online πληρωμή με κάρτα',
                    pay: 'Πληρωμή με Stripe', or: 'Ή', option2: 'Επιλογή 2: Τραπεζικό Έμβασμα', bank: 'Επικοινωνήστε μαζί μας στο WhatsApp για τραπεζικά στοιχεία',
                    important: 'Σημαντικό:', confirm: 'Μετά την πληρωμή, επιβεβαιώστε μέσω WhatsApp', whatsappBtn: 'Επιβεβαίωση Πληρωμής μέσω WhatsApp',
                    whatsappMsg: (camp, name) => `Γεια! Ολοκλήρωσα την πληρωμή για ${camp}. Όνομα: ${name}`
                }
            }[lang];

            // Show payment details screen
            const modalContent = document.querySelector('.registration-modal-content');
            modalContent.innerHTML = `
                <button class="registration-modal-close" onclick="closeRegistrationModal()">&times;</button>
                <div class="payment-success">
                    <div class="payment-success-icon">✓</div>
                    <h2>${T.heading}</h2>
                    <p class="payment-success-subtitle">${T.thanks}, ${data.fullName}!</p>

                    <div class="payment-details-box">
                        <h3>${T.complete}</h3>
                        <p class="payment-amount">${T.amount} <strong>€${priceNum}</strong></p>
                        <p class="payment-camp">${campName}</p>

                        <div class="payment-options">
                            <div class="payment-option">
                                <h4>${T.option1}</h4>
                                <p class="payment-option-desc">${T.secure}</p>
                                <a href="${stripeLink}" target="_blank" class="btn btn-primary btn-block" data-purchase-value="${priceNum}" data-purchase-item="${campName}">
                                    💳 ${T.pay}
                                </a>
                            </div>

                            <div class="payment-divider">${T.or}</div>

                            <div class="payment-option">
                                <h4>${T.option2}</h4>
                                <p class="payment-option-desc">${T.bank}</p>
                            </div>
                        </div>

                        <div class="payment-note">
                            <strong>${T.important}</strong> ${T.confirm}
                        </div>
                    </div>

                    <div class="payment-actions">
                        <a href="https://wa.me/35797497756?text=${encodeURIComponent(T.whatsappMsg(campName, data.fullName))}" target="_blank" class="btn btn-whatsapp btn-block">
                            ${T.whatsappBtn}
                        </a>
                    </div>
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

            // Select Stripe link and QR based on price
            let stripeLink, qrImage;
            if (data.price === '75') {
                stripeLink = 'https://buy.stripe.com/14AeVfeBx2gPaKBclScEw07';
                qrImage = 'assets/qr/massage-75-qr.jpeg';
            } else if (data.price === '60') {
                stripeLink = 'https://buy.stripe.com/4gMcN79hdaNlaKB1HecEw08';
                qrImage = 'assets/qr/massage-60-qr.jpeg';
            } else {
                // Default to €45 link for 30 min
                stripeLink = 'https://buy.stripe.com/6oU5kF2SP08H05X71ycEw09';
                qrImage = 'assets/qr/massage-qr.jpeg';
            }

            const T = {
                en: {
                    thanks: 'Thank you', massage: 'Massage', min: 'min', choose: 'Choose Payment Method',
                    option1: 'Option 1: Pay Online', secure: 'Secure card payment', pay: 'Pay with Stripe', or: 'OR',
                    option2: 'Option 2: Bank Transfer', scan: 'Scan QR code for details', important: 'Important:',
                    confirm: 'After payment, please confirm via WhatsApp', whatsappBtn: 'Confirm Payment via WhatsApp',
                    whatsappMsg: (d, p, n) => `Hi! I have paid for massage (${d} min, €${p}). Name: ${n}`
                },
                ru: {
                    thanks: 'Спасибо', massage: 'Массаж', min: 'мин', choose: 'Выберите способ оплаты',
                    option1: 'Вариант 1: Оплата онлайн', secure: 'Безопасная оплата картой', pay: 'Оплатить через Stripe', or: 'ИЛИ',
                    option2: 'Вариант 2: Банковский перевод', scan: 'Отсканируйте QR-код', important: 'Важно:',
                    confirm: 'После оплаты подтвердите через WhatsApp', whatsappBtn: 'Подтвердить оплату через WhatsApp',
                    whatsappMsg: (d, p, n) => `Привет! Я оплатил(а) массаж (${d} мин, €${p}). Имя: ${n}`
                },
                el: {
                    thanks: 'Ευχαριστούμε', massage: 'Μασάζ', min: 'λεπτά', choose: 'Επιλέξτε Τρόπο Πληρωμής',
                    option1: 'Επιλογή 1: Online Πληρωμή', secure: 'Ασφαλής πληρωμή με κάρτα', pay: 'Πληρωμή με Stripe', or: 'Ή',
                    option2: 'Επιλογή 2: Τραπεζικό Έμβασμα', scan: 'Σαρώστε τον κωδικό QR για λεπτομέρειες', important: 'Σημαντικό:',
                    confirm: 'Μετά την πληρωμή, επιβεβαιώστε μέσω WhatsApp', whatsappBtn: 'Επιβεβαίωση Πληρωμής μέσω WhatsApp',
                    whatsappMsg: (d, p, n) => `Γεια! Πλήρωσα για μασάζ (${d} λεπτά, €${p}). Όνομα: ${n}`
                }
            }[lang];

            // Show payment options
            const modalContent = document.querySelector('#massageBookingModal .massage-booking-modal-content');
            modalContent.innerHTML = `
                <button class="massage-modal-close" onclick="closeMassageBookingModal()">&times;</button>
                <div class="payment-success">
                    <div class="payment-success-icon">✓</div>
                    <h2>${T.thanks}, ${data.name}!</h2>
                    <p class="payment-success-subtitle">${T.massage} ${data.duration} ${T.min} — €${data.price}</p>

                    <div class="payment-details-box">
                        <h3>${T.choose}</h3>

                        <div class="payment-options">
                            <div class="payment-option">
                                <h4>${T.option1}</h4>
                                <p class="payment-option-desc">${T.secure}</p>
                                <a href="${stripeLink}" target="_blank" class="btn btn-primary btn-block" data-purchase-value="${data.price}" data-purchase-item="massage_${data.duration}min">
                                    💳 ${T.pay}
                                </a>
                            </div>

                            <div class="payment-divider">${T.or}</div>

                            <div class="payment-option">
                                <h4>${T.option2}</h4>
                                <p class="payment-option-desc">${T.scan}</p>
                                <div class="qr-code-container">
                                    <img src="${qrImage}" alt="Payment QR Code" class="qr-code">
                                </div>
                            </div>
                        </div>

                        <div class="payment-note">
                            <strong>${T.important}</strong> ${T.confirm}
                        </div>
                    </div>

                    <div class="payment-actions" style="margin-top: 20px;">
                        <a href="https://wa.me/35797497756?text=${encodeURIComponent(T.whatsappMsg(data.duration, data.price, data.name))}" target="_blank" class="btn btn-whatsapp btn-block">
                            ${T.whatsappBtn}
                        </a>
                    </div>
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
                    thanks: 'Thank you', subtitle: 'Media Package — €130', choose: 'Choose Payment Method',
                    option1: 'Option 1: Pay Online', secure: 'Secure card payment', pay: 'Pay with Stripe', or: 'OR',
                    option2: 'Option 2: Bank Transfer', scan: 'Scan QR code for details', important: 'Important:',
                    confirm: 'After payment, please confirm via WhatsApp', whatsappBtn: 'Confirm Payment via WhatsApp',
                    whatsappMsg: (n) => `Hi! I have paid for Media Package (€130). Name: ${n}`
                },
                ru: {
                    thanks: 'Спасибо', subtitle: 'Медиапакет «На память» — €130', choose: 'Выберите способ оплаты',
                    option1: 'Вариант 1: Оплата онлайн', secure: 'Безопасная оплата картой', pay: 'Оплатить через Stripe', or: 'ИЛИ',
                    option2: 'Вариант 2: Банковский перевод', scan: 'Отсканируйте QR-код', important: 'Важно:',
                    confirm: 'После оплаты подтвердите через WhatsApp', whatsappBtn: 'Подтвердить оплату через WhatsApp',
                    whatsappMsg: (n) => `Привет! Я оплатил(а) медиапакет (€130). Имя: ${n}`
                },
                el: {
                    thanks: 'Ευχαριστούμε', subtitle: 'Πακέτο Media — €130', choose: 'Επιλέξτε Τρόπο Πληρωμής',
                    option1: 'Επιλογή 1: Online Πληρωμή', secure: 'Ασφαλής πληρωμή με κάρτα', pay: 'Πληρωμή με Stripe', or: 'Ή',
                    option2: 'Επιλογή 2: Τραπεζικό Έμβασμα', scan: 'Σαρώστε τον κωδικό QR για λεπτομέρειες', important: 'Σημαντικό:',
                    confirm: 'Μετά την πληρωμή, επιβεβαιώστε μέσω WhatsApp', whatsappBtn: 'Επιβεβαίωση Πληρωμής μέσω WhatsApp',
                    whatsappMsg: (n) => `Γεια! Πλήρωσα για το Πακέτο Media (€130). Όνομα: ${n}`
                }
            }[lang];

            // Show payment options
            const modalContent = document.querySelector('#mediaPackageModal .massage-booking-modal-content');
            modalContent.innerHTML = `
                <button class="massage-modal-close" onclick="closeMediaPackageModal()">&times;</button>
                <div class="payment-success">
                    <div class="payment-success-icon">✓</div>
                    <h2>${T.thanks}, ${data.name}!</h2>
                    <p class="payment-success-subtitle">${T.subtitle}</p>

                    <div class="payment-details-box">
                        <h3>${T.choose}</h3>

                        <div class="payment-options">
                            <div class="payment-option">
                                <h4>${T.option1}</h4>
                                <p class="payment-option-desc">${T.secure}</p>
                                <a href="https://buy.stripe.com/9B65kF8d9bRpbOFclScEw0a" target="_blank" class="btn btn-primary btn-block" data-purchase-value="130" data-purchase-item="media_package">
                                    💳 ${T.pay}
                                </a>
                            </div>

                            <div class="payment-divider">${T.or}</div>

                            <div class="payment-option">
                                <h4>${T.option2}</h4>
                                <p class="payment-option-desc">${T.scan}</p>
                                <div class="qr-code-container">
                                    <img src="assets/qr/media-package-qr.jpeg" alt="Payment QR Code" class="qr-code">
                                </div>
                            </div>
                        </div>

                        <div class="payment-note">
                            <strong>${T.important}</strong> ${T.confirm}
                        </div>
                    </div>

                    <div class="payment-actions" style="margin-top: 20px;">
                        <a href="https://wa.me/35797497756?text=${encodeURIComponent(T.whatsappMsg(data.name))}" target="_blank" class="btn btn-whatsapp btn-block">
                            ${T.whatsappBtn}
                        </a>
                    </div>
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
