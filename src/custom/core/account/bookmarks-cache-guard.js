/**
 * Порожні закладки/історія після збою кешу.
 *
 * Трекер account_bookmarks_sync спільний, а кеш закладок — окремий для кожного профілю.
 * Якщо запис кешу зник (різке вимкнення ТВ, зміна акаунта), а трекер свіжий, ядро
 * застосує changelog до порожнього списку й збереже порожнечу на 15 днів.
 * Скидаємо трекер — ядро завантажить повний дамп і саме перезапише кеш.
 */
import Bookmarks from '../../../core/account/bookmarks'
import Permit from '../../../core/account/permit'
import Cache from '../../../utils/cache'
import Arrays from '../../../utils/arrays'

const _originalUpdate = Bookmarks.update

Bookmarks.update = function (call) {
    if (!Permit.sync) return _originalUpdate(call)

    Cache.getData('other', 'account_bookmarks_' + Permit.account.profile.id)
        // Порожній масив теж вважаємо зламаним: так лікуються користувачі, у яких порожнеча вже збережена.
        // Акаунт без закладок качатиме дамп на кожен update, але дамп порожнього акаунта мізерний
        .then((data) => Arrays.isArray(data) && data.length > 0)
        .catch(() => false)
        .then((ok) => {
            if (ok) return

            console.warn('Account', 'bookmarks cache missing or empty, reset tracker for full dump')

            return Cache.rewriteData('other', 'account_bookmarks_sync', { version: 0, time: 0 }).catch(() => {})
        })
        .then(() => _originalUpdate(call))
}
