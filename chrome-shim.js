// ═══════════════════════════════════════════════════════════════════════════════
// CHROME API SHIM - CAMADA DE COMPATIBILIDADE PARA VERSÃO WEB
// ═══════════════════════════════════════════════════════════════════════════════
// Este arquivo simula as APIs do Chrome para que o código original da extensão
// funcione perfeitamente em ambiente web sem nenhuma modificação.
// ═══════════════════════════════════════════════════════════════════════════════

(function() {
    'use strict';

    console.log('%c🌐 Chrome Shim carregado - Modo WEB ativado', 'color: #00FF00; font-weight: bold; font-size: 14px;');

    // ═══════════════════════════════════════════════════════════════════════════════
    // STORAGE API SIMULATION
    // ═══════════════════════════════════════════════════════════════════════════════
    const storage = {
        local: {
            get: function(keys, callback) {
                try {
                    const allData = JSON.parse(localStorage.getItem('blazeAnalyzerData') || '{}');
                    
                    // Log APENAS se for analyzerConfig sendo carregado
                    const isLoadingConfig = (keys === 'analyzerConfig' || 
                                            (Array.isArray(keys) && keys.includes('analyzerConfig')) ||
                                            (typeof keys === 'object' && keys.analyzerConfig !== undefined));
                    
                    if (isLoadingConfig) {
                        console.log('');
                        console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00D4FF; font-weight: bold;');
                        console.log('%c║  📖 chrome.storage.local.get() - analyzerConfig          ║', 'color: #00D4FF; font-weight: bold;');
                        console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00D4FF; font-weight: bold;');
                        console.log('%c📊 analyzerConfig no localStorage:', 'color: #00D4FF; font-weight: bold;');
                        console.log(allData.analyzerConfig || '{não encontrado}');
                        
                        if (allData.analyzerConfig && allData.analyzerConfig.minPercentage) {
                            console.log('%c🎯 minPercentage:', 'color: #FFD700; font-weight: bold;', allData.analyzerConfig.minPercentage + '%');
                        }
                        console.log('');
                    }
                    
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
                    console.log('');
                    console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #FFD700; font-weight: bold;');
                    console.log('%c║  💾 chrome.storage.local.set() CHAMADO                   ║', 'color: #FFD700; font-weight: bold;');
                    console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #FFD700; font-weight: bold;');
                    console.log('%c📦 Dados recebidos para salvar:', 'color: #FFD700; font-weight: bold;');
                    console.log(data);
                    console.log('');
                    
                    // Ler dados atuais
                    const currentLocalStorage = localStorage.getItem('blazeAnalyzerData');
                    console.log('%c📊 localStorage ANTES:', 'color: #00AAFF; font-weight: bold;');
                    console.log(currentLocalStorage ? JSON.parse(currentLocalStorage) : '{vazio}');
                    console.log('');
                    
                    const allData = JSON.parse(currentLocalStorage || '{}');
                    
                    // Salvar valor ANTIGO de analyzerConfig se estiver sendo atualizado
                    if (data.analyzerConfig && allData.analyzerConfig) {
                        console.log('%c🔍 COMPARANDO analyzerConfig:', 'color: #00D4FF; font-weight: bold;');
                        console.log('%c   ANTES:', 'color: #FFA500;', allData.analyzerConfig);
                        console.log('%c   DEPOIS:', 'color: #00FF88;', data.analyzerConfig);
                        
                        // Comparar minPercentage especificamente
                        if (allData.analyzerConfig.minPercentage !== data.analyzerConfig.minPercentage) {
                            console.log('%c   🎯 minPercentage MUDOU:', 'color: #FFD700; font-weight: bold;');
                            console.log(`%c      ${allData.analyzerConfig.minPercentage}% → ${data.analyzerConfig.minPercentage}%`, 'color: #FFD700; font-weight: bold;');
                        }
                    }
                    
                    Object.assign(allData, data);
                    
                    console.log('%c💾 Salvando no localStorage...', 'color: #00FF88; font-weight: bold;');
                    localStorage.setItem('blazeAnalyzerData', JSON.stringify(allData));
                    
                    console.log('%c✅ SALVO COM SUCESSO!', 'color: #00FF00; font-weight: bold; font-size: 14px;');
                    console.log('');
                    
                    // Verificar se realmente salvou
                    const savedData = localStorage.getItem('blazeAnalyzerData');
                    const parsedSaved = JSON.parse(savedData);
                    console.log('%c📊 localStorage DEPOIS:', 'color: #00FF88; font-weight: bold;');
                    console.log(parsedSaved);
                    
                    if (data.analyzerConfig && parsedSaved.analyzerConfig) {
                        console.log('');
                        console.log('%c🔍 VERIFICAÇÃO FINAL - analyzerConfig.minPercentage:', 'color: #00D4FF; font-weight: bold;');
                        console.log(`%c   Salvo: ${parsedSaved.analyzerConfig.minPercentage}%`, 'color: #00FF88; font-weight: bold;');
                        console.log(`%c   Esperado: ${data.analyzerConfig.minPercentage}%`, 'color: #FFD700; font-weight: bold;');
                        
                        if (parsedSaved.analyzerConfig.minPercentage === data.analyzerConfig.minPercentage) {
                            console.log('%c   ✅ VALORES CONFEREM!', 'color: #00FF00; font-weight: bold; font-size: 14px;');
                        } else {
                            console.error('%c   ❌ VALORES NÃO CONFEREM!', 'color: #FF0000; font-weight: bold; font-size: 14px;');
                        }
                    }
                    console.log('');
                    
                    // Dispatch event for listeners
                    window.dispatchEvent(new CustomEvent('storage-changed', { 
                        detail: { changes: data, area: 'local' } 
                    }));
                    
                    if (callback) callback();
                    return Promise.resolve();
                } catch (error) {
                    console.error('%c❌ ERRO CRÍTICO NO STORAGE.SET:', 'color: #FF0000; font-weight: bold; font-size: 16px;');
                    console.error(error);
                    console.error(error.stack);
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
            console.log('%c📨 chrome.runtime.sendMessage capturado:', 'color: #00AAFF;', message);
            console.log('%c   🎯 ACTION:', 'color: #FFAA00; font-weight: bold;', message.action || 'SEM ACTION!');
            console.log('%c   📦 MENSAGEM COMPLETA:', 'color: #00AAFF;', JSON.stringify(message, null, 2));
            console.log('%c   📊 Listeners registrados: ' + messageListeners.length, 'color: #00AAFF; font-weight: bold;');
            
            // ✅ CRÍTICO: Retornar uma Promise que resolve com a RESPOSTA REAL!
            return new Promise((resolve) => {
                // Simular message passing - disparar TODOS os listeners registrados
                setTimeout(() => {
                    let responded = false;
                    const sendResponse = (response) => {
                        if (!responded) {
                            responded = true;
                            console.log('%c   ✅ sendResponse chamado com:', 'color: #00FF88;', response);
                            
                            // ✅ Resolver a Promise com a resposta REAL!
                            resolve(response);
                            
                            if (callback) {
                                callback(response);
                            }
                        }
                    };
                    
                    // Chamar todos os listeners registrados
                    let willRespondAsync = false;
                    if (messageListeners.length === 0) {
                        console.log('%c   ⚠️ NENHUM LISTENER REGISTRADO!', 'color: #FF0000; font-weight: bold;');
                    }
                    
                    messageListeners.forEach((listener, index) => {
                        try {
                            console.log('%c   📞 Chamando listener #' + (index + 1) + '...', 'color: #00AAFF;');
                            const result = listener(message, {}, sendResponse);
                            console.log('%c   📤 Listener #' + (index + 1) + ' retornou:', 'color: #00AAFF;', result);
                            // Se retornar true, significa que vai responder assincronamente
                            if (result === true) {
                                willRespondAsync = true;
                                console.log('%c   ⏳ Listener #' + (index + 1) + ' vai responder assincronamente', 'color: #FFA500; font-weight: bold;');
                            }
                        } catch (error) {
                            console.error('%c   ❌ Erro ao executar listener #' + (index + 1) + ':', 'color: #FF0000;', error);
                        }
                    });
                    
                    // ⚠️ CRÍTICO: Só responder com padrão se:
                    // 1. Ninguém respondeu ainda (!responded)
                    // 2. E nenhum listener disse que vai responder depois (!willRespondAsync)
                    if (!responded && !willRespondAsync) {
                        console.log('%c   📤 Nenhum listener respondeu - enviando resposta padrão', 'color: #FFA500;');
                        const defaultResponse = { success: true };
                        resolve(defaultResponse);
                        if (callback) {
                            callback(defaultResponse);
                        }
                    } else if (willRespondAsync && !responded) {
                        console.log('%c   ⏳ Aguardando resposta assíncrona do listener...', 'color: #00AAFF;');
                        // Não resolve ainda - vai resolver quando sendResponse for chamado
                    } else if (responded) {
                        console.log('%c   ✅ Resposta já enviada!', 'color: #00FF88; font-weight: bold;');
                    }
                }, 0);
            });
        },

        onMessage: {
            addListener: function(callback) {
                messageListeners.push(callback);
                console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00FF88; font-weight: bold;');
                console.log('%c📡 chrome.runtime.onMessage.addListener REGISTRADO!', 'color: #00FF88; font-weight: bold; font-size: 14px;');
                console.log('%c   📊 Total de listeners agora: ' + messageListeners.length, 'color: #00FF88; font-weight: bold;');
                console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00FF88; font-weight: bold;');
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
            // ⚠️ CRÍTICO: Retornar URL da Blaze para passar na verificação hasBlazeTabOpen()
            // Isso engana o background.js fazendo ele pensar que há uma aba da Blaze aberta
            const currentTab = {
                id: 1,
                url: 'https://blaze.com/pt/games/double', // URL FAKE - Faz passar no hasBlazeTabOpen()
                active: true,
                windowId: 1
            };
            
            console.log('📋 chrome.tabs.query simulado - Retornando aba FAKE da Blaze');
            
            const result = [currentTab];
            if (callback) callback(result);
            return Promise.resolve(result);
        },

        sendMessage: function(tabId, message, callback) {
            console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #FFD700; font-weight: bold;');
            console.log('%c📨 chrome.tabs.sendMessage capturado!', 'color: #FFD700; font-weight: bold;');
            console.log('%c   Type:', 'color: #FFD700;', message.type);
            console.log('%c   Data:', 'color: #FFD700;', message.data);
            console.log('%c   Action:', 'color: #FFD700;', message.action);
            console.log('%c   TabId:', 'color: #FFD700;', tabId);
            console.log('%c   Listeners registrados:', 'color: #FFD700;', messageListeners.length);
            console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #FFD700; font-weight: bold;');
            
            // ✅ CRÍTICO: Retornar uma Promise que resolve com a resposta REAL
            return new Promise((resolve) => {
                // ⚠️ CRÍTICO: Chamar os listeners de chrome.runtime.onMessage DIRETAMENTE
                // (content.js escuta via chrome.runtime.onMessage.addListener)
                setTimeout(() => {
                    let responded = false;
                    const sendResponse = (response) => {
                        if (!responded) {
                            responded = true;
                            console.log('%c   ✅ sendResponse chamado com:', 'color: #00FF88;', response);
                            resolve(response); // ✅ Resolver com a resposta REAL
                            if (callback) callback(response);
                        }
                    };
                    
                    console.log(`%c🔄 Chamando ${messageListeners.length} listener(s)...`, 'color: #00AAFF; font-weight: bold;');
                    
                    // Chamar todos os listeners registrados
                    let listenerCount = 0;
                    let willRespondAsync = false;
                    messageListeners.forEach((listener, index) => {
                        try {
                            console.log(`%c   → Listener ${index + 1}/${messageListeners.length}`, 'color: #00AAFF;');
                            // Passar a mensagem como se fosse de chrome.runtime.sendMessage
                            const result = listener(message, {}, sendResponse);
                            listenerCount++;
                            if (result === true) {
                                willRespondAsync = true;
                                console.log(`%c   ✅ Listener ${index + 1} aceitou (async)`, 'color: #00FF88;');
                            } else {
                                console.log(`%c   ✅ Listener ${index + 1} processou (sync)`, 'color: #00FF88;');
                            }
                        } catch (error) {
                            console.error(`%c   ❌ Erro no listener ${index + 1}:`, 'color: #FF0000;', error);
                        }
                    });
                    
                    console.log(`%c✅ ${listenerCount} listener(s) chamado(s) com sucesso!`, 'color: #00FF88; font-weight: bold;');
                    console.log('');
                    
                    // ⚠️ CRÍTICO: Só responder com padrão se ninguém respondeu E nenhum listener vai responder depois
                    if (!responded && !willRespondAsync) {
                        console.log('%c   📤 Nenhum listener respondeu - enviando resposta padrão', 'color: #FFA500;');
                        const defaultResponse = { success: true };
                        resolve(defaultResponse);
                        if (callback) callback(defaultResponse);
                    } else if (willRespondAsync && !responded) {
                        console.log('%c   ⏳ Aguardando resposta assíncrona do listener...', 'color: #00AAFF;');
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

