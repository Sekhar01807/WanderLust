// Multi-Currency Real-Time Conversion Engine
(function() {
    const RATES = {
        INR: { symbol: '₹', rate: 1, label: 'INR (₹)' },
        USD: { symbol: '$', rate: 0.012, label: 'USD ($)' },
        EUR: { symbol: '€', rate: 0.011, label: 'EUR (€)' },
        GBP: { symbol: '£', rate: 0.0095, label: 'GBP (£)' }
    };

    window.getSavedCurrency = function() {
        return localStorage.getItem('userCurrency') || 'INR';
    };

    window.formatPrice = function(basePriceInINR, targetCurrency) {
        const curr = targetCurrency || getSavedCurrency();
        const config = RATES[curr] || RATES.INR;
        const converted = Math.round(basePriceInINR * config.rate);
        return `${config.symbol} ${converted.toLocaleString('en-US')}`;
    };

    window.updateCurrencyDisplay = function(selectedCurr) {
        const curr = selectedCurr || getSavedCurrency();
        localStorage.setItem('userCurrency', curr);
        const config = RATES[curr] || RATES.INR;

        // Update active currency label in navbar dropdown if present
        const currentBtnText = document.getElementById('currentCurrencyText');
        if (currentBtnText) {
            currentBtnText.textContent = curr;
        }

        // Update all elements with data-base-price attribute
        document.querySelectorAll('[data-base-price]').forEach(el => {
            const basePrice = parseFloat(el.getAttribute('data-base-price'));
            if (!isNaN(basePrice)) {
                const isNight = el.getAttribute('data-price-type') === 'night';
                const formatted = window.formatPrice(basePrice, curr);
                el.textContent = isNight ? `${formatted} / Night` : formatted;
            }
        });
    };

    document.addEventListener('DOMContentLoaded', () => {
        window.updateCurrencyDisplay();

        // Listen for currency dropdown changes
        document.querySelectorAll('.currency-select-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const newCurr = item.getAttribute('data-currency');
                if (newCurr) {
                    window.updateCurrencyDisplay(newCurr);
                }
            });
        });
    });
})();
