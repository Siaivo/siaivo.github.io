(function initCustomHeadIcons() {
    var style = document.createElement('style');
    style.id = 'custom-head-icons-css';
    style.textContent = `
        /* Повертаємо відображення логотипу */
        body.mouse--controll:not(.true--mobile) .head__logo-icon,
        .head__logo-icon {
            display: block !important;
        }

        /* Ховаємо іконку меню */
        body.mouse--controll:not(.true--mobile) .head__menu-icon,
        body.true--mobile .head__menu-icon,
        .head__menu-icon {
            display: none !important;
        }
    `;
    document.head.appendChild(style);
})();
