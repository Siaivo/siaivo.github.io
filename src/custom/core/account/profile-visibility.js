/**
 * open--profile: ховаємо, якщо користувач не авторизований у CUB.
 *
 * Перевизначає Profile.update — єдиний вхідний момент,
 * через який profile.js керує іконкою профілю.
 */
import Profile from '../../../core/account/profile'

const _originalUpdate = Profile.update

Profile.update = function () {
    // Викликаємо оригінальний update (малює іконку)
    if (_originalUpdate) _originalUpdate.call(this)

    // Тепер керуємо видимістю
    var el = $('.head .open--profile')

    if (!el.length) return

    var hasToken = !!(
        window.Lampa &&
        Lampa.Account &&
        Lampa.Account.Permit &&
        Lampa.Account.Permit.token
    )

    if (hasToken) {
        el.removeClass('hide')
    } else {
        el.addClass('hide')
    }
}
