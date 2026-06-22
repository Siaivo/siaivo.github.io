(function() {
    function initCompatibility() {
        if (!window.Lampa || !Lampa.Player || !Lampa.PlayerPlaylist) {
            setTimeout(initCompatibility, 50);
            return;
        }

        console.log('Compatibility', 'Player compatibility layer initialized');

        // Wrap Android.openPlayer if available to capture and log any native launch issues
        if (Lampa.Android && Lampa.Android.openPlayer) {
            const originalAndroidOpenPlayer = Lampa.Android.openPlayer;
            Lampa.Android.openPlayer = function(link, data) {
                console.log('Compatibility', 'Android.openPlayer called', { link, data });
                try {
                    originalAndroidOpenPlayer.call(Lampa.Android, link, data);
                } catch(e) {
                    console.log('Compatibility', 'Android.openPlayer ERROR: ' + e.message + ' ' + (e.stack || ''));
                }
            };
        }

        const originalPlay = Lampa.Player.play;
        const originalPlaylist = Lampa.Player.playlist;
        const originalRunas = Lampa.Player.runas;

        let pendingPlayData = null;
        let pendingPlaylist = null;
        let playTimeout = null;

        function cleanPlaylist(list) {
            if (!list || !Array.isArray(list)) return list;
            const cleaned = list.map(item => {
                if (!item || typeof item !== 'object') return item;
                let cleanItem = Object.assign({}, item);
                if ('playlist' in cleanItem) {
                    delete cleanItem.playlist;
                }
                return cleanItem;
            });
            // Filter out empty items or items without a URL
            return cleaned.filter(item => item && item.url);
        }

        function isExternal(player) {
            if (!player) return false;
            const internalPlayers = ['inner', 'lampa', 'tvos', 'tvosl', 'tvospro', 'ios'];
            return !internalPlayers.includes(player);
        }

        // Intercept runas to prevent plugins from overriding external player preference
        Lampa.Player.runas = function(need) {
            console.log('Compatibility', 'Player.runas called with: ' + need);
            
            const defaultPlayer = Lampa.Storage.field('player');
            if (isExternal(defaultPlayer) && (need === 'inner' || need === 'lampa')) {
                console.log('Compatibility', 'Ignoring runas(' + need + ') to respect external player: ' + defaultPlayer);
                return;
            }

            originalRunas.call(Lampa.Player, need);
        };

        Lampa.Player.play = function(data) {
            console.log('Compatibility', 'Player.play called', data);
            
            if (playTimeout) {
                clearTimeout(playTimeout);
                playTimeout = null;
            }

            pendingPlayData = data;
            pendingPlaylist = null;

            // Sanitize explicit launch_player overrides on data object
            if (pendingPlayData && pendingPlayData.launch_player) {
                const defaultPlayer = Lampa.Storage.field('player');
                if (isExternal(defaultPlayer) && (pendingPlayData.launch_player === 'inner' || pendingPlayData.launch_player === 'lampa')) {
                    console.log('Compatibility', 'Removing data.launch_player (' + pendingPlayData.launch_player + ') to respect external player: ' + defaultPlayer);
                    delete pendingPlayData.launch_player;
                }
            }

            if (pendingPlayData && pendingPlayData.playlist) {
                pendingPlayData.playlist = cleanPlaylist(pendingPlayData.playlist);
                if (pendingPlayData.playlist.length === 0) {
                    delete pendingPlayData.playlist;
                }
            }

            playTimeout = setTimeout(() => {
                playTimeout = null;
                if (pendingPlayData) {
                    if (pendingPlaylist && pendingPlaylist.length > 0 && !pendingPlayData.playlist) {
                        pendingPlayData.playlist = pendingPlaylist;
                    }
                    
                    // Fallback to active playlist if still missing
                    if (!pendingPlayData.playlist && Lampa.PlayerPlaylist) {
                        const activeList = Lampa.PlayerPlaylist.get();
                        if (activeList && activeList.length) {
                            pendingPlayData.playlist = cleanPlaylist(activeList);
                        }
                    }

                    if (pendingPlayData.playlist && pendingPlayData.playlist.length === 0) {
                        delete pendingPlayData.playlist;
                    }

                    console.log('Compatibility', 'Player.play executing original play', pendingPlayData);
                    try {
                        originalPlay.call(Lampa.Player, pendingPlayData);
                    } catch(e) {
                        console.log('Compatibility', 'originalPlay ERROR: ' + e.message + ' ' + (e.stack || ''));
                    }
                    
                    pendingPlayData = null;
                    pendingPlaylist = null;
                }
            }, 0);
        };

        Lampa.Player.playlist = function(list) {
            console.log('Compatibility', 'Player.playlist called', list);
            const cleanedList = cleanPlaylist(list);
            
            if (pendingPlayData) {
                pendingPlaylist = cleanedList;
                if (cleanedList && cleanedList.length > 0) {
                    pendingPlayData.playlist = cleanedList;
                } else {
                    delete pendingPlayData.playlist;
                }
            }

            originalPlaylist.call(Lampa.Player, cleanedList);
        };
    }

    initCompatibility();
})();
