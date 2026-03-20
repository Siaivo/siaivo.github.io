import Api from '../core/api/api'

function resolve(oncomplite, payload) {
    if (typeof oncomplite === 'function') {
        oncomplite(payload)
    }
}

let cub = Api.sources && Api.sources.cub

if (cub) {
    cub.reactionsGet = function(params, oncomplite) {
        resolve(oncomplite, { results: [] })
    }

    cub.discussGet = function(params, oncomplite) {
        resolve(oncomplite, { results: [] })
    }

    cub.discovery = function() {
        return {
            title: 'CUB',
            params: {
                save: false
            },
            search: function(params, oncomplite) {
                resolve(oncomplite, [])
            },
            onMore: function(params, close) {
                if (typeof close === 'function') close()
            },
            onCancel: function() { }
        }
    }
}

if (typeof Api.availableDiscovery === 'function') {
    let base = Api.availableDiscovery.bind(Api)

    Api.availableDiscovery = function() {
        return base().filter(function(source) {
            return source && source.title !== 'CUB'
        })
    }
}
