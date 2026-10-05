import IndexedDB from '../../utils/db'

// Кілька записів за одну readonly-транзакцію: getData() відкриває транзакцію на кожен ключ, а
// getData() без ключа читає всю таблицю. Повертає {key: value}, відсутні ключі пропускає.
// Не падає, як getDataAnyCase(): на помилці віддає те, що встигло прочитатись.
// return_meta - як у getData(): цілий запис {key, value, time} замість value.
IndexedDB.prototype.getMany = function(store_name, keys, return_meta = false){
    return new Promise((resolve) => {
        let result = {}

        if (!this.db || !keys.length) {
            return resolve(result)
        }

        let transaction

        // transaction() кидає синхронно, якщо таблиці нема
        try {
            transaction = this.db.transaction([store_name], 'readonly')
        }
        catch (e) {
            this.log(e, store_name)

            return resolve(result)
        }

        let store = transaction.objectStore(store_name)

        keys.forEach(key => {
            let request = store.get(key)

            request.onsuccess = () => {
                if (request.result) {
                    result[key] = return_meta ? request.result : request.result.value
                }
            }
        })

        transaction.oncomplete = () => resolve(result)

        transaction.onabort = () => {
            this.log(transaction.error || 'An error occurred while retrieving data', store_name)

            resolve(result)
        }
    })
}
