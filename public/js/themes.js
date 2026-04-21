// themes.js - Seasonal / monthly theme visual elements and schedulers
// Exposes window.SPP.themes
(function () {
    'use strict';

    const monthlyMessages = [
        { emoji: '❄️', title: 'Happy New Year!', subtitle: 'Fresh start, new goals! ⛷️' },
        { emoji: '💝', title: 'Love is in the air!', subtitle: 'Spread the love this February! 💕' },
        { emoji: '🌸', title: 'Spring has sprung!', subtitle: 'Time to bloom and grow! 🌱' },
        { emoji: '🌧️', title: 'April showers!', subtitle: 'Bringing May flowers! ☔' },
        { emoji: '🌺', title: 'May flowers!', subtitle: 'Beauty is everywhere! 🦋' },
        { emoji: '☀️', title: 'Summer vibes!', subtitle: 'Time to shine bright! 🏖️' },
        { emoji: '🏄', title: 'Beach time!', subtitle: "Surf's up! Catch the wave! 🌊" },
        { emoji: '🌅', title: 'Summer nights!', subtitle: 'Make wishes on shooting stars! ⭐' },
        { emoji: '🍂', title: 'Autumn leaves!', subtitle: 'Change is beautiful! 🍁' },
        { emoji: '🎃', title: 'Spooky season!', subtitle: 'Trick or treat! 👻' },
        { emoji: '🦃', title: 'Thanksgiving!', subtitle: 'Grateful for the team! 🙏' },
        { emoji: '🎄', title: 'Merry Christmas!', subtitle: 'Ho ho ho! 🎅' }
    ];

    const monthlyElementMap = [
        { emoji: '❄️', class: 'monthly-snowflake' },
        { emoji: '💝', class: 'monthly-heart' },
        { emoji: '🌸', class: 'monthly-flower' },
        { emoji: '💧', class: 'monthly-raindrop' },
        { emoji: '🌺', class: 'monthly-blossom' },
        { emoji: '☀️', class: 'monthly-sun' },
        { emoji: '🌊', class: 'monthly-wave' },
        { emoji: '⭐', class: 'monthly-star' },
        { emoji: '🍂', class: 'monthly-leaf' },
        { emoji: '🎃', class: 'monthly-pumpkin' },
        { emoji: '🦃', class: 'monthly-turkey' },
        { emoji: '🎁', class: 'monthly-gift' }
    ];

    const giftMessages = [
        '🎁 Merry Christmas!',
        '🎄 Ho ho ho!',
        '✨ Christmas magic!',
        '🎅 Santa was here!',
        '⭐ Make a wish!',
        '🔔 Jingle bells!',
        '❄️ Let it snow!',
        '🎊 Joy to the world!',
        '🕯️ Peace on earth!',
        '🎵 Skibidi boppy!',
        '👥 We wish for new young hires!',
        '🥖 Fugassa!'
    ];

    // --- Monthly theme ---

    function createMonthlyElement() {
        const month = new Date().getMonth();
        const element = monthlyElementMap[month];
        const el = document.createElement('div');
        el.className = element.class;
        el.textContent = element.emoji;
        el.style.left = `${Math.random() * 90 + 5}%`;
        el.style.top = month === 10 ? '50%' : '-50px';

        el.addEventListener('click', (e) => showMonthlyMessage(month, e));
        document.body.appendChild(el);

        // Durations must match the CSS animation durations for each element class
        const duration = month === 0 ? 14000
            : month === 3 ? 8000
            : month === 4 ? 14000
            : month === 8 ? 16000
            : month === 10 ? 5000
            : 6000;
        setTimeout(() => el.remove(), duration);
    }

    function showMonthlyMessage(month, event) {
        const msg = monthlyMessages[month];
        const popup = document.createElement('div');
        popup.className = 'fixed bg-gray-800 bg-opacity-95 text-white px-4 py-3 rounded-lg shadow-lg z-50 transition-all duration-300 border border-yellow-500';
        popup.style.maxWidth = '300px';
        popup.style.left = `${event.clientX}px`;
        popup.style.top = `${event.clientY - 80}px`;
        popup.style.transform = 'translateX(-50%)';
        popup.innerHTML = `
            <div class="text-center">
                <div class="text-3xl mb-1">${msg.emoji}</div>
                <div class="font-bold text-yellow-400">${msg.title}</div>
                <div class="text-sm text-gray-300">${msg.subtitle}</div>
            </div>
        `;

        document.body.appendChild(popup);

        setTimeout(() => {
            popup.style.opacity = '0';
            popup.style.transform = 'translateX(-50%) translateY(-10px)';
            setTimeout(() => popup.remove(), 300);
        }, 3000);
    }

    function scheduleMonthlyElements() {
        if (!document.body.classList.contains('monthly-theme')) return;
        setTimeout(() => {
            createMonthlyElement();
            scheduleMonthlyElements();
        }, 4000 + Math.random() * 6000);
    }

    // --- Halloween theme ---

    function createHalloweenElement() {
        if (!document.body.classList.contains('halloween-theme')) return;

        const elements = [
            { emoji: '🦇', class: 'halloween-bat' },
            { emoji: '🎃', class: 'halloween-pumpkin' },
            { emoji: '👻', class: 'halloween-ghost' },
            { emoji: '🕷️', class: 'halloween-spider' }
        ];

        const element = elements[Math.floor(Math.random() * elements.length)];
        const halloweenEl = document.createElement('div');

        if (element.class === 'halloween-spider') {
            const spiderClass = Math.random() < 0.5 ? 'halloween-spider' : 'halloween-spider-up';
            halloweenEl.className = `halloween-floating ${spiderClass}`;
        } else {
            halloweenEl.className = `halloween-floating ${element.class}`;
        }

        halloweenEl.textContent = element.emoji;
        if (element.class === 'halloween-spider') {
            halloweenEl.style.top = '0px';
            halloweenEl.style.left = `${Math.random() * 80 + 10}%`;
        } else {
            halloweenEl.style.top = `${Math.random() * 80 + 10}%`;
            halloweenEl.style.left = '-50px';
        }

        document.body.appendChild(halloweenEl);

        const animationDuration = element.class === 'halloween-bat' ? 12000
            : element.class === 'halloween-pumpkin' ? 18000
            : element.class === 'halloween-ghost' ? 14000
            : 8000;
        setTimeout(() => halloweenEl.remove(), animationDuration);
    }

    function scheduleHalloweenElements() {
        if (!document.body.classList.contains('halloween-theme')) return;
        setTimeout(() => {
            createHalloweenElement();
            scheduleHalloweenElements();
        }, 5000 + Math.random() * 10000);
    }

    function triggerHalloweenSparks() {
        if (!document.body.classList.contains('halloween-theme')) return;
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                const particle = document.createElement('div');
                particle.className = 'halloween-particle halloween-spark';
                particle.style.left = `${Math.random() * window.innerWidth}px`;
                particle.style.top = `${Math.random() * window.innerHeight}px`;
                document.body.appendChild(particle);
                setTimeout(() => particle.remove(), 3000);
            }, i * 200);
        }
    }

    // --- Christmas theme ---

    function showChristmasMessage(x, y, message) {
        const messageEl = document.createElement('div');
        messageEl.className = 'fixed pointer-events-none z-50 bg-red-600 text-white px-3 py-2 rounded-lg shadow-lg text-sm font-medium';
        messageEl.style.left = `${x}px`;
        messageEl.style.top = `${y - 40}px`;
        messageEl.style.transform = 'translateX(-50%)';
        messageEl.textContent = message;
        messageEl.style.opacity = '0';
        messageEl.style.transition = 'all 0.3s ease';

        document.body.appendChild(messageEl);

        setTimeout(() => {
            messageEl.style.opacity = '1';
            messageEl.style.transform = 'translateX(-50%) translateY(-10px)';
        }, 10);

        setTimeout(() => {
            messageEl.style.opacity = '0';
            messageEl.style.transform = 'translateX(-50%) translateY(-20px)';
            setTimeout(() => messageEl.remove(), 300);
        }, 2000);
    }

    function createChristmasElement() {
        if (!document.body.classList.contains('christmas-theme')) return;

        const elements = [
            { emoji: '❄️', class: 'christmas-snowflake' },
            { emoji: '🎄', class: 'christmas-tree' },
            { emoji: '🎅', class: 'christmas-santa' },
            { emoji: '🎁', class: 'christmas-gift' },
            { emoji: '⭐', class: 'christmas-star' }
        ];

        const element = elements[Math.floor(Math.random() * elements.length)];
        const christmasEl = document.createElement('div');
        christmasEl.className = `christmas-floating ${element.class}`;
        christmasEl.textContent = element.emoji;

        if (element.class !== 'christmas-snowflake') {
            christmasEl.style.cursor = 'pointer';
            christmasEl.style.pointerEvents = 'auto';
            christmasEl.addEventListener('click', (e) => {
                e.stopPropagation();
                const rect = christmasEl.getBoundingClientRect();
                let message;
                switch (element.class) {
                    case 'christmas-santa':
                        message = '🎅 Ho ho ho!';
                        break;
                    case 'christmas-tree':
                        message = '🎄 Merry Christmas!';
                        break;
                    case 'christmas-star':
                        message = '⭐ Wish upon a star!';
                        break;
                    case 'christmas-gift':
                        message = giftMessages[Math.floor(Math.random() * giftMessages.length)];
                        break;
                }
                showChristmasMessage(rect.left + rect.width / 2, rect.top, message);
            });
        }

        if (element.class === 'christmas-snowflake') {
            christmasEl.style.top = '-50px';
            christmasEl.style.left = `${Math.random() * 100}%`;
        } else {
            christmasEl.style.top = `${Math.random() * 80 + 10}%`;
            christmasEl.style.left = '-50px';
        }

        document.body.appendChild(christmasEl);

        const animationDuration = element.class === 'christmas-snowflake' ? 8000
            : element.class === 'christmas-tree' ? 15000
            : element.class === 'christmas-santa' ? 12000
            : 10000;
        setTimeout(() => christmasEl.remove(), animationDuration);
    }

    function scheduleChristmasElements() {
        if (!document.body.classList.contains('christmas-theme')) return;
        setTimeout(() => {
            createChristmasElement();
            scheduleChristmasElements();
        }, 3000 + Math.random() * 8000);
    }

    // --- Theme selector ---

    /**
     * Applies the chosen theme and starts the relevant background animations.
     * Valid values: 'dbz', 'monthly', 'halloween', 'christmas', 'dark'.
     */
    function applyTheme(theme) {
        document.body.className = '';
        document.body.removeAttribute('data-month');

        switch (theme) {
            case 'dbz':
                document.body.classList.add('dbz-bg', 'min-h-screen', 'text-white', 'overflow-hidden');
                break;
            case 'monthly': {
                const month = new Date().getMonth();
                document.body.classList.add('dbz-bg', 'min-h-screen', 'text-white', 'overflow-hidden', 'monthly-theme');
                document.body.setAttribute('data-month', month);
                scheduleMonthlyElements();
                break;
            }
            case 'halloween':
                document.body.classList.add('dbz-bg', 'min-h-screen', 'text-white', 'overflow-hidden', 'halloween-theme');
                scheduleHalloweenElements();
                break;
            case 'christmas':
                document.body.classList.add('dbz-bg', 'min-h-screen', 'text-white', 'overflow-hidden', 'christmas-theme');
                scheduleChristmasElements();
                break;
            case 'dark':
                document.body.classList.add('bg-gray-900', 'min-h-screen', 'text-white', 'overflow-hidden', 'dark-mode');
                break;
            default:
                document.body.classList.add('dbz-bg', 'min-h-screen', 'text-white', 'overflow-hidden');
        }
    }

    window.SPP = window.SPP || {};
    window.SPP.themes = {
        applyTheme,
        triggerHalloweenSparks,
        scheduleMonthlyElements,
        scheduleHalloweenElements,
        scheduleChristmasElements
    };
})();
