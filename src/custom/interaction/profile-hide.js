/**
 * open--profile ховаємо, якщо користувач НЕ авторизований у CUB.
 * Стандартний profile.js створює елемент завжди — ми його прибираємо
 * поки немає Permit.token, і показуємо знову при вході.
 */

(function () {
    function tryApply() {
        if (!window.Lampa || !Lampa.Account) {
            setTimeout(tryApply, 100)
            return
        }

        applyVisibility()

        if (Lampa.Storage && Lampa.Storage.listener) {
            Lampa.Storage.listener.follow('change', function (e) {
                if (e.name === 'account' || e.name === 'account_use') {
                    applyVisibility()
                }
            })
        }
    }

    function applyVisibility() {
        var el = document.querySelector('.head .open--profile')
        if (!el) return

        var token =
            Lampa.Account &&
            Lampa.Account.Permit &&
            Lampa.Account.Permit.token

        if (token) {
            el.classList.remove('hide')
        } else {
            el.classList.add('hide')
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryApply)
    } else {
        tryApply()
    }
})()
