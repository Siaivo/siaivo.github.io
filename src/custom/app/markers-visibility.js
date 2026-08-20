import Storage from '../../core/storage/storage'

function updateVisibility() {
    let use = Storage.field('account_use')
    let visible = (use === true || use === 'true')
    
    $('.head__markers').replaceWith($('<div>').addClass('head__split'));
}

function init() {
    if (!window.Lampa || !Lampa.Listener) {
        setTimeout(init, 50)
        return
    }

    // Watch for changes in Storage
    Storage.listener.follow('change', (e) => {
        if (e.name === 'account_use') {
            updateVisibility()
        }
    })

    // Initialize when Lampa indicates the app is ready
    Lampa.Listener.follow('app', (e) => {
        if (e.type === 'ready') {
            updateVisibility()
        }
    })

    // If app is already ready, run immediately
    if (window.appready) {
        updateVisibility()
    }
}

// Start waiting for Lampa to be available
init()
