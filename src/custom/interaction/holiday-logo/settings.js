/**
 * Налаштування для модуля святкового логотипу.
 * Додає компонент "siaivo" перед "account".
 */

import SettingsApi from '../../../interaction/settings/api'
import Storage from '../../../core/storage/storage'

function init() {
    if (!SettingsApi) return;

    SettingsApi.addParam({
        component: 'siaivo',
        param: {
            name: 'holiday_style',
            type: 'select',
            values: {
                '0': 'Вимкнено',
                '1': 'Стиль 1 (Кільце)',
                '2': 'Стиль 2 (Плашка)',
                '3': 'Стиль 3 (Кільце + Частинки)'
            },
            default: '3'
        },
        field: {
            name: 'Стиль святкової іконки',
            description: 'Як виглядатиме індикатор свята у шапці'
        },
        onChange: function (value) {
            Storage.set('holiday_style', value);
            // Викликаємо оновлення інтерфейсу
            window.dispatchEvent(new CustomEvent('holiday_style_changed', { detail: { value: value } }));
        }
    });
}

export default { init: init }
