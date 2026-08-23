export default {
    feed: true,
    services: false,
    mirrors: false,
    // Захист від модерації стору нам не потрібен — примусово вмикаємо торренти
    // та вимикаємо демо/режим лише для читання.
    torrents_use: true,
    demo: false,
    read_only: false,
    disable_features: {
        dmca: true,
        lgbt: true,
        reactions: true,
        discuss: true,
        ai: true,
        subscribe: true,
        persons: false,
        ads: true,
        install_proxy: true,
        blacklist: true,
        metadata: true,
        remote_configuration: true,
    }
}
