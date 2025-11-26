// ═══════════════════════════════════════════════════════════════════════════════
// CHROME API SHIM - CAMADA DE COMPATIBILIDADE PARA VERSÃO WEB
// ═══════════════════════════════════════════════════════════════════════════════
// Este arquivo simula as APIs do Chrome para que o código original da extensão
// funcione perfeitamente em ambiente web sem nenhuma modificação.
// ═══════════════════════════════════════════════════════════════════════════════

(function() {
    'use strict';

    window.__BLAZE_WEB_SHIM__ = true;

    console.log('%c🌐 Chrome Shim carregado - Modo WEB ativado', 'color: #00FF00; font-weight: bold; font-size: 14px;');

    // ═══════════════════════════════════════════════════════════════════════════════
    // STORAGE API SIMULATION
    // ═══════════════════════════════════════════════════════════════════════════════
    const storage = {
        local: {
            get: function(keys, callback) {
                try {
                    const allData = JSON.parse(localStorage.getItem('blazeAnalyzerData') || '{}');
                    
                    if (typeof keys === 'string') {
                        // Single key
                        const result = {};
                        if (allData[keys] !== undefined) {
                            result[keys] = allData[keys];
                        }
                        if (callback) callback(result);
                        return Promise.resolve(result);
                    } else if (Array.isArray(keys)) {
                        // Array of keys
                        const result = {};
                        keys.forEach(key => {
                            if (allData[key] !== undefined) {
                                result[key] = allData[key];
                            }
                        });
                        if (callback) callback(result);
                        return Promise.resolve(result);
                    } else if (keys === null || keys === undefined) {
                        // Get all data
                        if (callback) callback(allData);
                        return Promise.resolve(allData);
                    } else if (typeof keys === 'object') {
                        // Object with default values
                        const result = {};
                        Object.keys(keys).forEach(key => {
                            result[key] = allData[key] !== undefined ? allData[key] : keys[key];
                        });
                        if (callback) callback(result);
                        return Promise.resolve(result);
                    }
                } catch (error) {
                    console.error('Storage get error:', error);
                    if (callback) callback({});
                    return Promise.resolve({});
                }
            },

            set: function(data, callback) {
                try {
                    const currentLocalStorage = localStorage.getItem('blazeAnalyzerData');
                    const allData = JSON.parse(currentLocalStorage || '{}');
                    
                    Object.assign(allData, data);
                    localStorage.setItem('blazeAnalyzerData', JSON.stringify(allData));
                    
                    // Dispatch event for listeners
                    window.dispatchEvent(new CustomEvent('storage-changed', { 
                        detail: { changes: data, area: 'local' } 
                    }));
                    
                    if (callback) callback();
                    return Promise.resolve();
                } catch (error) {
                    console.error('❌ ERRO CRÍTICO NO STORAGE.SET:', error);
                    if (callback) callback();
                    return Promise.resolve();
                }
            },

            remove: function(keys, callback) {
                try {
                    const allData = JSON.parse(localStorage.getItem('blazeAnalyzerData') || '{}');
                    const keysArray = Array.isArray(keys) ? keys : [keys];
                    
                    keysArray.forEach(key => {
                        delete allData[key];
                    });
                    
                    localStorage.setItem('blazeAnalyzerData', JSON.stringify(allData));
                    if (callback) callback();
                    return Promise.resolve();
                } catch (error) {
                    console.error('Storage remove error:', error);
                    if (callback) callback();
                    return Promise.resolve();
                }
            },

            clear: function(callback) {
                try {
                    localStorage.removeItem('blazeAnalyzerData');
                    if (callback) callback();
                    return Promise.resolve();
                } catch (error) {
                    console.error('Storage clear error:', error);
                    if (callback) callback();
                    return Promise.resolve();
                }
            }
        },
        
        // ✅ ADICIONAR onChanged para evitar erro
        onChanged: {
            addListener: function(callback) {
                // Simular listener de mudanças no storage
                // (opcional: implementar se necessário)
                console.log('📡 chrome.storage.onChanged.addListener registrado');
            }
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════════
    // RUNTIME API SIMULATION
    // ═══════════════════════════════════════════════════════════════════════════════
    // Array para armazenar os listeners registrados
    const messageListeners = [];
    
    const runtime = {
        sendMessage: function(message, callback) {
            return new Promise((resolve) => {
                setTimeout(() => {
                    let responded = false;
                    const sendResponse = (response) => {
                        if (!responded) {
                            responded = true;
                            resolve(response);
                            if (callback) callback(response);
                        }
                    };
                    
                    let willRespondAsync = false;
                    messageListeners.forEach((listener) => {
                        try {
                            const result = listener(message, {}, sendResponse);
                            if (result === true) {
                                willRespondAsync = true;
                            }
                        } catch (error) {
                            console.error('Erro ao executar listener:', error);
                        }
                    });
                    
                    if (!responded && !willRespondAsync) {
                        const defaultResponse = { success: true };
                        resolve(defaultResponse);
                        if (callback) callback(defaultResponse);
                    }
                }, 0);
            });
        },

        onMessage: {
            addListener: function(callback) {
                messageListeners.push(callback);
            },
            removeListener: function(callback) {
                const index = messageListeners.indexOf(callback);
                if (index > -1) {
                    messageListeners.splice(index, 1);
                }
            }
        },

        lastError: null,

        getManifest: function() {
            return {
                version: '1.0.0',
                name: 'Blaze Double Analyzer',
                description: 'Análise de padrões do jogo Double da Blaze'
            };
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════════
    // TABS API SIMULATION
    // ═══════════════════════════════════════════════════════════════════════════════
    const tabs = {
        // ✅ ADICIONAR onRemoved para evitar erro
        onRemoved: {
            addListener: function(callback) {
                console.log('📡 chrome.tabs.onRemoved.addListener registrado (não faz nada no modo web)');
                // No modo web, não há abas para monitorar
            }
        },
        
        // ✅ ADICIONAR onUpdated para evitar erro
        onUpdated: {
            addListener: function(callback) {
                console.log('📡 chrome.tabs.onUpdated.addListener registrado (não faz nada no modo web)');
                // No modo web, não há abas para monitorar
            }
        },
        
        // ✅ ADICIONAR onActivated para evitar erro
        onActivated: {
            addListener: function(callback) {
                console.log('📡 chrome.tabs.onActivated.addListener registrado (não faz nada no modo web)');
                // No modo web, não há abas para monitorar
            }
        },
        
        query: function(queryInfo, callback) {
            const currentTab = {
                id: 1,
                url: 'https://blaze.com/pt/games/double',
                active: true,
                windowId: 1
            };
            
            const result = [currentTab];
            if (callback) callback(result);
            return Promise.resolve(result);
        },

        sendMessage: function(tabId, message, callback) {
            return new Promise((resolve) => {
                setTimeout(() => {
                    let responded = false;
                    const sendResponse = (response) => {
                        if (!responded) {
                            responded = true;
                            resolve(response);
                            if (callback) callback(response);
                        }
                    };
                    
                    let willRespondAsync = false;
                    messageListeners.forEach((listener) => {
                        try {
                            const result = listener(message, {}, sendResponse);
                            if (result === true) {
                                willRespondAsync = true;
                            }
                        } catch (error) {
                            console.error('Erro no listener:', error);
                        }
                    });
                    
                    if (!responded && !willRespondAsync) {
                        const defaultResponse = { success: true };
                        resolve(defaultResponse);
                        if (callback) callback(defaultResponse);
                    }
                }, 0);
            });
        },

        getCurrent: function(callback) {
            const currentTab = {
                id: 1,
                url: window.location.href,
                active: true
            };
            if (callback) callback(currentTab);
            return Promise.resolve(currentTab);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════════
    // ALARMS API SIMULATION (para setInterval/setTimeout)
    // ═══════════════════════════════════════════════════════════════════════════════
    const alarms = {
        create: function(name, alarmInfo) {
            const periodInMs = (alarmInfo.periodInMinutes || 1) * 60 * 1000;
            
            const intervalId = setInterval(() => {
                window.dispatchEvent(new CustomEvent('chrome-alarm', { 
                    detail: { name } 
                }));
            }, periodInMs);
            
            // Store interval ID for later clearing
            window.__chromeAlarms = window.__chromeAlarms || {};
            window.__chromeAlarms[name] = intervalId;
        },

        clear: function(name, callback) {
            if (window.__chromeAlarms && window.__chromeAlarms[name]) {
                clearInterval(window.__chromeAlarms[name]);
                delete window.__chromeAlarms[name];
            }
            if (callback) callback(true);
            return Promise.resolve(true);
        },

        onAlarm: {
            addListener: function(callback) {
                window.addEventListener('chrome-alarm', (event) => {
                    callback({ name: event.detail.name });
                });
            }
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════════
    // NOTIFICATIONS API SIMULATION
    // ═══════════════════════════════════════════════════════════════════════════════
    const notifications = {
        create: function(notificationId, options, callback) {
            console.log('📢 Notification:', options.title, '-', options.message);
            
            // Use browser's Notification API if available
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(options.title || 'Blaze Analyzer', {
                    body: options.message,
                    icon: options.iconUrl
                });
            }
            
            if (callback) callback(notificationId || 'notification-1');
            return Promise.resolve(notificationId || 'notification-1');
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════════
    // BROWSER ACTION API SIMULATION
    // ═══════════════════════════════════════════════════════════════════════════════
    const browserAction = {
        setBadgeText: function(details) {
            console.log('🔔 Badge text:', details.text);
            // Could update a UI element if needed
        },
        
        setBadgeBackgroundColor: function(details) {
            console.log('🎨 Badge color:', details.color);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════════
    // CREATE CHROME OBJECT
    // ═══════════════════════════════════════════════════════════════════════════════
    window.chrome = {
        storage: storage,
        runtime: runtime,
        tabs: tabs,
        alarms: alarms,
        notifications: notifications,
        browserAction: browserAction
    };

    // Also create browser object (for Firefox compatibility)
    window.browser = window.chrome;

    // ═══════════════════════════════════════════════════════════════════════════════
    // HELPER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════════
    
    // Request notification permission on load
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            console.log('Notification permission:', permission);
        });
    }

    // Initialize storage if empty
    if (!localStorage.getItem('blazeAnalyzerData')) {
        localStorage.setItem('blazeAnalyzerData', JSON.stringify({}));
        console.log('✅ Storage inicializado');
    }

    console.log('%c✅ Chrome Shim inicializado com sucesso!', 'color: #00FF00; font-weight: bold;');
    console.log('%c   • chrome.storage ✓', 'color: #00FF88;');
    console.log('%c   • chrome.runtime ✓', 'color: #00FF88;');
    console.log('%c   • chrome.tabs ✓', 'color: #00FF88;');
    console.log('%c   • chrome.alarms ✓', 'color: #00FF88;');
    console.log('%c   • chrome.notifications ✓', 'color: #00FF88;');

})();

