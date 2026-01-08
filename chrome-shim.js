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
    const STORAGE_KEY = 'blazeAnalyzerData';

    const isQuotaExceededError = (err) => {
        try {
            const name = err && err.name ? String(err.name) : '';
            const msg = err && err.message ? String(err.message) : '';
            return /QuotaExceededError/i.test(name) || /exceeded the quota/i.test(msg);
        } catch (_) {
            return false;
        }
    };

    const shallowClone = (obj) => {
        try {
            return (obj && typeof obj === 'object') ? { ...obj } : {};
        } catch (_) {
            return {};
        }
    };

    const capArray = (value, max = 200) => {
        if (!Array.isArray(value)) return value;
        const n = Math.max(0, Math.floor(Number(max) || 0));
        if (value.length <= n) return value;
        return value.slice(value.length - n);
    };

    const slimPatternDB = (db, maxPatterns = 500) => {
        try {
            if (!db || typeof db !== 'object') return db;
            const patterns = Array.isArray(db.patterns_found) ? db.patterns_found : [];
            const n = Math.max(0, Math.floor(Number(maxPatterns) || 0));
            const tail = n > 0 ? patterns.slice(patterns.length - n) : [];
            const slim = tail.map((p) => ({
                pattern: p && p.pattern,
                triggerColor: p && p.triggerColor,
                confidence: p && p.confidence,
                occurrences: p && p.occurrences,
                lastOccurrence: p && p.lastOccurrence
            }));
            return { ...db, patterns_found: slim };
        } catch (_) {
            return db;
        }
    };

    const slimEntriesHistory = (history, { max = 200, keepFullLast = 30 } = {}) => {
        try {
            if (!Array.isArray(history)) return history;
            const maxN = Math.max(0, Math.floor(Number(max) || 0));
            const keepN = Math.max(0, Math.floor(Number(keepFullLast) || 0));
            const tail = maxN > 0 ? history.slice(history.length - maxN) : [];
            const cut = Math.max(0, tail.length - keepN);
            const older = tail.slice(0, cut).map((e) => {
                if (!e || typeof e !== 'object') return e;
                const pd = e.patternData && typeof e.patternData === 'object' ? { ...e.patternData } : null;
                if (pd) {
                    delete pd.last14Spins;
                    delete pd.last10Spins;
                    delete pd.last5Spins;
                }
                return {
                    id: e.id,
                    createdAt: e.createdAt,
                    updatedAt: e.updatedAt,
                    color: e.color,
                    result: e.result,
                    confidence: e.confidence,
                    analysisMode: e.analysisMode,
                    diamondSourceLevel: e.diamondSourceLevel,
                    diamondN0: e.diamondN0,
                    patternData: pd || undefined
                };
            });
            const newer = tail.slice(cut);
            return [...older, ...newer];
        } catch (_) {
            return history;
        }
    };

    const slimSignalsHistory = (signalsHistory, { maxSignals = 200, keepFullLast = 20, dropHeavyStats = false } = {}) => {
        try {
            if (!signalsHistory || typeof signalsHistory !== 'object') return signalsHistory;
            const maxN = Math.max(0, Math.floor(Number(maxSignals) || 0));
            const keepN = Math.max(0, Math.floor(Number(keepFullLast) || 0));
            const next = { ...signalsHistory };

            const list = Array.isArray(next.signals) ? next.signals : [];
            const tail = maxN > 0 ? list.slice(list.length - maxN) : [];
            const cut = Math.max(0, tail.length - keepN);
            const older = tail.slice(0, cut).map((s) => {
                if (!s || typeof s !== 'object') return s;
                // Remover payload pesado dos sinais antigos (mantém o essencial pro "histórico")
                return {
                    timestamp: s.timestamp,
                    patternType: s.patternType,
                    patternName: s.patternName,
                    colorRecommended: s.colorRecommended,
                    finalConfidence: (s.finalConfidence != null ? s.finalConfidence : (s.rawConfidence != null ? s.rawConfidence : s.confidence)),
                    verified: s.verified,
                    colorThatCame: s.colorThatCame,
                    hit: s.hit
                };
            });
            const newer = tail.slice(cut);
            next.signals = [...older, ...newer];

            // Limitar performance recente (evita crescer infinito)
            if (Array.isArray(next.recentPerformance) && next.recentPerformance.length > 30) {
                next.recentPerformance = next.recentPerformance.slice(-30);
            }

            if (dropHeavyStats) {
                // Em quota alta, preservar apenas o histórico "humano" e contadores simples
                delete next.patternStats;
                delete next.contextStats;
                delete next.blockedPatterns;
                delete next.n0SelfLearning;
                delete next.n4SelfLearning;
                delete next.n4AutoTune;
            }

            return next;
        } catch (_) {
            return signalsHistory;
        }
    };

    const pruneStoreForQuota = (store, pass = 1) => {
        const next = shallowClone(store);
        try {
            if (next.signalsHistory) {
                next.signalsHistory = slimSignalsHistory(next.signalsHistory, {
                    maxSignals: pass === 1 ? 200 : 80,
                    keepFullLast: pass === 1 ? 20 : 10,
                    dropHeavyStats: pass >= 2
                });
            }
            if (next.entriesHistory) next.entriesHistory = slimEntriesHistory(next.entriesHistory, { max: pass === 1 ? 200 : 80, keepFullLast: pass === 1 ? 30 : 15 });
            // hotColorsHistory costuma ser um objeto grande; em quota alta, descartar (é reconstituível)
            if (pass >= 2 && next.hotColorsHistory) delete next.hotColorsHistory;
            if (next.realtimeHistory) next.realtimeHistory = capArray(next.realtimeHistory, pass === 1 ? 300 : 120);
            if (next.cachedHistory) next.cachedHistory = capArray(next.cachedHistory, pass === 1 ? 300 : 120);
            if (next.patternDB) next.patternDB = slimPatternDB(next.patternDB, pass === 1 ? 500 : 250);

            if (pass >= 3) {
                const essentialEntries = next.entriesHistory
                    ? slimEntriesHistory(next.entriesHistory, { max: 60, keepFullLast: 10 })
                    : undefined;
                const essentialSignals = next.signalsHistory
                    ? slimSignalsHistory(next.signalsHistory, { maxSignals: 60, keepFullLast: 10, dropHeavyStats: true })
                    : undefined;
                return {
                    analyzerConfig: next.analyzerConfig,
                    user: next.user,
                    analysis: next.analysis,
                    pattern: next.pattern,
                    lastSpin: next.lastSpin,
                    // ✅ Manter pelo menos um pouco de histórico (evita "sumir tudo" após recarregar)
                    ...(essentialEntries ? { entriesHistory: essentialEntries } : {}),
                    ...(essentialSignals ? { signalsHistory: essentialSignals } : {}),
                    recoveryModeEnabled: next.recoveryModeEnabled,
                    recoverySecure: next.recoverySecure,
                    recoveryData: next.recoveryData
                };
            }
        } catch (_) {}
        return next;
    };

    // Soft-caps (preventivo): evita crescer "infinito" e perder tudo no refresh quando o storage estoura quota.
    // Mantém histórico suficiente para o usuário, mas garante persistência estável ao longo de horas.
    const pruneStoreSoftCaps = (store) => {
        const next = shallowClone(store);
        try {
            // Históricos mais críticos para o usuário
            if (next.entriesHistory) {
                next.entriesHistory = slimEntriesHistory(next.entriesHistory, { max: 1200, keepFullLast: 80 });
            }
            if (next.signalsHistory) {
                // Preservar a lista "humana" de sinais e reduzir payload pesado (stats) preventivamente.
                next.signalsHistory = slimSignalsHistory(next.signalsHistory, { maxSignals: 1200, keepFullLast: 80, dropHeavyStats: true });
            }

            // Banco de padrões pode ser bem grande; manter uma cauda razoável.
            if (next.patternDB) {
                next.patternDB = slimPatternDB(next.patternDB, 800);
            }

            // Arrays auxiliares (se existirem no store) — manter sob controle
            if (next.realtimeHistory) next.realtimeHistory = capArray(next.realtimeHistory, 1200);
            if (next.cachedHistory) next.cachedHistory = capArray(next.cachedHistory, 1200);
        } catch (_) {}
        return next;
    };

    const tryPersistStore = (store) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(store || {}));
            return { ok: true, pruned: false };
        } catch (err) {
            if (!isQuotaExceededError(err)) return { ok: false, pruned: false, err };
        }

        // Passo 1
        const p1 = pruneStoreForQuota(store || {}, 1);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(p1));
            return { ok: true, pruned: true };
        } catch (err2) {
            if (!isQuotaExceededError(err2)) return { ok: false, pruned: false, err: err2 };
        }

        // Passo 2
        const p2 = pruneStoreForQuota(store || {}, 2);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(p2));
            return { ok: true, pruned: true };
        } catch (err3) {
            if (!isQuotaExceededError(err3)) return { ok: false, pruned: false, err: err3 };
        }

        // Passo 3 (essencial)
        const p3 = pruneStoreForQuota(store || {}, 3);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(p3));
            return { ok: true, pruned: true };
        } catch (err4) {
            return { ok: false, pruned: false, err: err4 };
        }
    };

    // Fonte da verdade em memória (evita travar UI quando quota estoura)
    let memoryStore = {};
    try {
        memoryStore = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
    } catch (_) {
        memoryStore = {};
    }

    const storage = {
        local: {
            get: function(keys, callback) {
                try {
                    const allData = memoryStore || {};
                    
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
                    const allData = memoryStore || {};
                    Object.assign(allData, data);
                    // ✅ Preventivo: aplicar soft-caps ANTES de persistir
                    // (evita o cenário "funciona a noite toda e some tudo no refresh")
                    const capped = pruneStoreSoftCaps(allData);
                    memoryStore = capped;

                    const persisted = tryPersistStore(capped);
                    if (!persisted.ok) {
                        console.error('❌ ERRO CRÍTICO NO STORAGE.SET:', persisted.err);
                    } else if (persisted.pruned) {
                        console.warn('⚠️ STORAGE.SET: quota estourada — dados foram podados para o painel continuar funcionando.');
                    }
                    
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
                    const allData = memoryStore || {};
                    const keysArray = Array.isArray(keys) ? keys : [keys];
                    
                    keysArray.forEach(key => {
                        delete allData[key];
                    });
                    
                    memoryStore = allData;
                    const persisted = tryPersistStore(allData);
                    if (!persisted.ok) {
                        console.error('Storage remove error:', persisted.err);
                    } else if (persisted.pruned) {
                        console.warn('⚠️ STORAGE.REMOVE: quota estourada — dados foram podados.');
                    }
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
                    memoryStore = {};
                    localStorage.removeItem(STORAGE_KEY);
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
                new Notification(options.title || 'Double Analyzer', {
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
    if (!localStorage.getItem(STORAGE_KEY)) {
        tryPersistStore({});
        memoryStore = {};
        console.log('✅ Storage inicializado');
    }

    console.log('%c✅ Chrome Shim inicializado com sucesso!', 'color: #00FF00; font-weight: bold;');
    console.log('%c   • chrome.storage ✓', 'color: #00FF88;');
    console.log('%c   • chrome.runtime ✓', 'color: #00FF88;');
    console.log('%c   • chrome.tabs ✓', 'color: #00FF88;');
    console.log('%c   • chrome.alarms ✓', 'color: #00FF88;');
    console.log('%c   • chrome.notifications ✓', 'color: #00FF88;');

})();

