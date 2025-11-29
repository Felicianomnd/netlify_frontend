// Content script for Blaze Double Analyzer
(function() {
    'use strict';
    
    const scriptStartTime = Date.now();
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00AAFF; font-weight: bold;');
    console.log('%c🚀 CONTENT.JS INICIANDO...', 'color: #00AAFF; font-weight: bold; font-size: 14px;');
    console.log('%c   Versão WEB', 'color: #00AAFF;');
    console.log('%c⏱️ [TIMING] Início do script:', new Date().toLocaleTimeString());
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00AAFF; font-weight: bold;');
    console.log('');
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // 🧹 LIMPEZA AUTOMÁTICA DO CONSOLE A CADA 1 MINUTO
    // ═══════════════════════════════════════════════════════════════════════════════
    // Evita acúmulo de logs após horas de uso, prevenindo travamentos
    // DESATIVADO TEMPORARIAMENTE PARA DEBUG
    /*
    setInterval(() => {
        console.clear();
        console.log('%c🧹 Console limpo automaticamente (executado a cada 1 minuto)', 'color: #00AAFF; font-weight: bold;');
    }, 60000); // 60000ms = 1 minuto
    */
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // VARIÁVEL GLOBAL: Controle de exibição do histórico por camadas
    // ═══════════════════════════════════════════════════════════════════════════════
    let currentHistoryDisplayLimit = 500; // Começa exibindo 500, pode aumentar em camadas de 500
    let currentHistoryData = []; // Armazenar histórico atual para re-renderizar
    let autoPatternSearchTriggered = false; // Impede disparos automáticos repetidos
    let suppressAutoPatternSearch = false; // Evita busca automática após reset manual
    
    const SESSION_STORAGE_KEYS = ['authToken', 'user', 'lastAuthCheck'];
    let forceLogoutAlreadyTriggered = false;
    let activeUserMenuKeyHandler = null;

    const MARTINGALE_PROFILE_DEFAULTS = Object.freeze({
        standard: { maxGales: 0, consecutiveMartingale: false },
        diamond: { maxGales: 0, consecutiveMartingale: false }
    });

    function clampMartingaleMax(value, fallback = 0) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            const fallbackNumeric = Number(fallback);
            return Math.max(0, Math.min(200, Number.isFinite(fallbackNumeric) ? Math.floor(fallbackNumeric) : 0));
        }
        return Math.max(0, Math.min(200, Math.floor(numeric)));
    }

    function sanitizeMartingaleProfilesFromConfig(config = {}) {
        const sanitized = {
            standard: { ...MARTINGALE_PROFILE_DEFAULTS.standard },
            diamond: { ...MARTINGALE_PROFILE_DEFAULTS.diamond }
        };
        const sourceProfiles = config && typeof config.martingaleProfiles === 'object'
            ? config.martingaleProfiles
            : null;

        ['standard', 'diamond'].forEach(mode => {
            const rawProfile = sourceProfiles && typeof sourceProfiles[mode] === 'object' ? sourceProfiles[mode] : {};
            const fallbackProfile = MARTINGALE_PROFILE_DEFAULTS[mode];
            const inheritedMax = rawProfile.maxGales != null ? rawProfile.maxGales : config.maxGales;
            const inheritedConsecutive = rawProfile.consecutiveMartingale != null
                ? rawProfile.consecutiveMartingale
                : config.consecutiveMartingale;
            sanitized[mode] = {
                maxGales: clampMartingaleMax(inheritedMax, fallbackProfile.maxGales),
                consecutiveMartingale: typeof inheritedConsecutive === 'boolean'
                    ? inheritedConsecutive
                    : fallbackProfile.consecutiveMartingale
            };
        });

        return sanitized;
    }

    function getTabSpecificAIMode(defaultValue) {
        const tabSpecificModeStr = sessionStorage.getItem('tabSpecificAIMode');
        if (tabSpecificModeStr !== null) {
            try {
                return !!JSON.parse(tabSpecificModeStr);
            } catch (error) {
                console.warn('⚠️ Não foi possível interpretar tabSpecificAIMode do sessionStorage:', error);
            }
        }
        return !!defaultValue;
    }

    function applyActiveMartingaleToLegacyFields(config, modeKey, profiles) {
        if (!config || !profiles) return;
        const profile = profiles[modeKey] || MARTINGALE_PROFILE_DEFAULTS[modeKey];
        config.maxGales = profile.maxGales;
        config.consecutiveMartingale = profile.consecutiveMartingale;
    }

    function getAuthPageUrl() {
        try {
            if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
                return chrome.runtime.getURL('auth.html');
            }
        } catch (error) {
            console.warn('⚠️ Não foi possível obter URL via chrome.runtime.getURL:', error);
        }
        return 'auth.html';
    }

    function getStoredUserData() {
        try {
            const raw = localStorage.getItem('user');
            if (raw) {
                return JSON.parse(raw);
            }
        } catch (error) {
            console.warn('⚠️ Não foi possível ler dados do usuário da sessão:', error);
        }
        return null;
    }

    function getPlanLabel(plan, price) {
        const priceDisplay = (() => {
            if (price === null || price === undefined) return null;
            const numeric = Number(price);
            if (!Number.isNaN(numeric)) {
                return numeric.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            }
            if (typeof price === 'string' && price.trim()) {
                return price.trim();
            }
            return null;
        })();

        switch (plan) {
            case '1month':
                return priceDisplay ? `Plano 1 Mês • ${priceDisplay}` : 'Plano 1 Mês';
            case '3months':
                return priceDisplay ? `Plano 3 Meses • ${priceDisplay}` : 'Plano 3 Meses';
            default:
                return plan ? (priceDisplay ? `${plan} • ${priceDisplay}` : plan) : 'Não informado';
        }
    }

    function getPlanBadge(plan, status) {
        if (status === 'blocked') return 'BLOQUEADO';
        if (status === 'expired') return 'EXPIRADO';
        if (status === 'pending') return 'PENDENTE';
        switch (plan) {
            case '1month':
                return 'PLANO 1 MÊS';
            case '3months':
                return 'PLANO 3 MESES';
            default:
                return plan ? plan.toUpperCase() : 'PREMIUM';
        }
    }

    function formatDate(date) {
        try {
            const d = new Date(date);
            if (Number.isNaN(d.getTime())) return 'Data indisponível';
            return new Intl.DateTimeFormat('pt-BR', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            }).format(d);
        } catch (error) {
            return 'Data indisponível';
        }
    }

    function getDaysRemainingInfo(expiresAt, status) {
        if (status === 'pending') {
            return { text: 'Aguardando ativação', alert: false };
        }
        if (!expiresAt) {
            return { text: 'Sem data de expiração', alert: false };
        }

        const expires = new Date(expiresAt);
        if (Number.isNaN(expires.getTime())) {
            return { text: 'Data indisponível', alert: false };
        }

        const now = new Date();
        const diffMs = expires.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / 86400000);

        if (diffDays > 1) {
            return { text: `${diffDays} dias`, alert: diffDays <= 3 };
        }
        if (diffDays === 1) {
            return { text: '1 dia', alert: true };
        }
        if (diffDays === 0) {
            return { text: 'Expira hoje', alert: true };
        }

        const overdue = Math.abs(diffDays);
        return {
            text: `Expirado há ${overdue} dia${overdue === 1 ? '' : 's'}`,
            alert: true
        };
    }

    function clearSessionStorageKeys() {
        try {
            SESSION_STORAGE_KEYS.forEach(key => {
                localStorage.removeItem(key);
            });
        } catch (error) {
            console.error('❌ Erro ao limpar localStorage da sessão:', error);
        }

        try {
            if (typeof chrome !== 'undefined' && chrome.storage?.local?.remove) {
                chrome.storage.local.remove(SESSION_STORAGE_KEYS, () => {
                    if (chrome.runtime?.lastError) {
                        console.warn('⚠️ Erro ao remover sessão do chrome.storage.local:', chrome.runtime.lastError.message);
                    }
                });
            }
        } catch (error) {
            console.error('❌ Erro ao limpar chrome.storage.local da sessão:', error);
        }
    }

    function forceLogout(reason = 'Sessão inválida') {
        if (forceLogoutAlreadyTriggered) {
            return;
        }

        forceLogoutAlreadyTriggered = true;
        console.warn('⚠️ Sessão será encerrada. Motivo:', reason);

        clearSessionStorageKeys();

        try {
            if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
                chrome.runtime.sendMessage({ action: 'FORCE_LOGOUT', reason });
            }
        } catch (error) {
            console.error('❌ Erro ao notificar background sobre logout forçado:', error);
        }

        try {
            alert('Sua sessão foi encerrada. Faça login novamente.\n\nMotivo: ' + reason);
        } catch (error) {
            console.warn('⚠️ Não foi possível mostrar alerta de logout:', error);
        }

        const loginUrl = getAuthPageUrl();
        try {
            const newWindow = window.open(loginUrl, '_blank');
            if (!newWindow) {
                window.location.href = loginUrl;
            }
        } catch (error) {
            console.warn('⚠️ Não foi possível abrir nova aba. Redirecionando...');
            window.location.href = loginUrl;
        }
    }
    
    // Resetar dados ao iniciar nova sessão de página (apenas uma vez por aba)
    function resetSessionIfNeeded() {
        try {
            const sessionFlagKey = 'doubleAnalyzerResetDone';
            if (!sessionStorage.getItem(sessionFlagKey)) {
                sessionStorage.setItem(sessionFlagKey, '1');
                // ✅ Não resetar doubleHistory (agora usa cache em memória no background)
                chrome.storage.local.set({
                    lastSpin: null,
                    analysis: null,
                    pattern: null
                }, function() {
                    console.log('Double Analyzer: estados resetados no início da sessão.');
                });
            }
        } catch (e) {
            console.error('Erro ao resetar sessão:', e);
        }
    }
    // Executa o reset assim que o script carregar (somente quando a aba é nova)
    resetSessionIfNeeded();

    // ═══════════════════════════════════════════════════════════════════════════════
    // FUNÇÃO: Modal de confirmação customizado (substitui confirm() nativo)
    // ═══════════════════════════════════════════════════════════════════════════════
    function showCustomConfirm(message, targetElement) {
        return new Promise((resolve) => {
            // Encontrar a sidebar principal
            const sidebar = document.getElementById('blaze-double-analyzer');
        
            // Criar modal simples (sem overlay escuro)
        const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                background: #1a2c38;
                border: 2px solid #ff003f;
                border-radius: 8px;
                padding: 16px;
                width: 90%;
                max-width: 340px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.8), 0 0 10px rgba(255, 0, 63, 0.3);
                z-index: 999999;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                box-sizing: border-box;
            `;
        
            // Calcular posição: sempre no topo da sidebar, centralizado
            const isMobile = window.innerWidth <= 768;
            
            if (sidebar && !isMobile) {
            const rect = sidebar.getBoundingClientRect();
                
                // Posicionar no topo da sidebar (logo abaixo do header)
                modal.style.top = (rect.top + 80) + 'px';  // 80px do topo para ficar abaixo do "Double Analyzer"
                modal.style.left = (rect.left + (rect.width / 2)) + 'px';
                modal.style.transform = 'translateX(-50%)';
            } else {
                // Mobile ou fallback: centralizar na tela
                modal.style.top = '50%';
                modal.style.left = '50%';
                modal.style.transform = 'translate(-50%, -50%)';
            }
            
            // Mensagem
            const messageEl = document.createElement('div');
            messageEl.style.cssText = `
                color: #ffffff;
                font-size: 14px;
                margin-bottom: 12px;
                text-align: center;
                line-height: 1.4;
            `;
            messageEl.textContent = message;
            
            // Container dos botões
            const buttonsContainer = document.createElement('div');
            buttonsContainer.style.cssText = `
                display: flex;
                gap: 8px;
                justify-content: center;
            `;
            
            // Botão Cancelar
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancelar';
            cancelBtn.style.cssText = `
                flex: 1;
                padding: 8px 16px;
                background: rgba(255, 255, 255, 0.05);
                color: #8da2bb;
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 4px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
            `;
            cancelBtn.onmouseover = () => {
                cancelBtn.style.background = 'rgba(255, 255, 255, 0.1)';
                cancelBtn.style.color = '#fff';
                cancelBtn.style.borderColor = 'rgba(255, 255, 255, 0.25)';
            };
            cancelBtn.onmouseout = () => {
                cancelBtn.style.background = 'rgba(255, 255, 255, 0.05)';
                cancelBtn.style.color = '#8da2bb';
                cancelBtn.style.borderColor = 'rgba(255, 255, 255, 0.15)';
            };
            cancelBtn.onclick = () => {
                if (modal.parentNode === document.body) {
                    document.body.removeChild(modal);
                }
                resolve(false);
            };
            
            // Botão OK
            const okBtn = document.createElement('button');
            okBtn.textContent = 'OK';
            okBtn.style.cssText = `
                flex: 1;
                padding: 8px 16px;
                background: #ff003f;
                color: #ffffff;
                border: 1px solid #ff003f;
                border-radius: 4px;
                font-size: 13px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s ease;
            `;
            okBtn.onmouseover = () => {
                okBtn.style.background = '#e6003a';
                okBtn.style.transform = 'scale(1.05)';
            };
            okBtn.onmouseout = () => {
                okBtn.style.background = '#ff003f';
                okBtn.style.transform = 'scale(1)';
            };
            okBtn.onclick = () => {
                if (modal.parentNode === document.body) {
                    document.body.removeChild(modal);
                }
                resolve(true);
            };
            
            // Montar modal
            buttonsContainer.appendChild(cancelBtn);
            buttonsContainer.appendChild(okBtn);
            modal.appendChild(messageEl);
            modal.appendChild(buttonsContainer);
            
            // Adicionar ao body
            document.body.appendChild(modal);
            
            // Focar no botão OK
            okBtn.focus();
            
            // Permitir ESC para cancelar e Enter para confirmar
            const keyHandler = (e) => {
                if (e.key === 'Escape') {
                    cancelBtn.click();
                    document.removeEventListener('keydown', keyHandler);
                } else if (e.key === 'Enter') {
                    okBtn.click();
                    document.removeEventListener('keydown', keyHandler);
                }
            };
            document.addEventListener('keydown', keyHandler);
            
            // Fechar ao clicar fora
            setTimeout(() => {
                const clickOutside = (e) => {
                    if (!modal.contains(e.target)) {
                        cancelBtn.click();
                        document.removeEventListener('click', clickOutside);
                    }
                };
                document.addEventListener('click', clickOutside);
            }, 100);
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // FUNÇÃO: Alerta customizado (substitui alert() nativo)
    // ═══════════════════════════════════════════════════════════════════════════════
    function showCustomAlert(message, type = 'info') {
        return new Promise((resolve) => {
            // Cores baseadas no tipo - Paleta Blaze
            const colors = {
                success: '#00ff88',
                error: '#ff003f',
                warning: '#FFD700',
                info: '#00d4ff'
            };
            
            const color = colors[type] || colors.info;
            
            // Criar modal simples (centralizado)
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: #1a2c38;
                border: 2px solid ${color};
                border-radius: 8px;
                padding: 16px;
                width: 90%;
                min-width: 280px;
                max-width: 400px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.8), 0 0 10px ${color}40;
                z-index: 999999;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                box-sizing: border-box;
            `;
        
            // Mensagem
            const messageEl = document.createElement('div');
            messageEl.style.cssText = `
                color: #ffffff;
                font-size: 14px;
                margin-bottom: 12px;
                text-align: center;
                line-height: 1.4;
                white-space: pre-line;
            `;
            messageEl.textContent = message;
            
            // Botão OK
            const okBtn = document.createElement('button');
            okBtn.textContent = 'OK';
            const textColor = (type === 'error' || type === 'warning') ? '#ffffff' : '#1a2c38';
            okBtn.style.cssText = `
                width: 100%;
                padding: 8px 16px;
                background: ${color};
                color: ${textColor};
                border: 1px solid ${color};
                border-radius: 4px;
                font-size: 13px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s ease;
            `;
            okBtn.onmouseover = () => {
                okBtn.style.transform = 'scale(1.05)';
                okBtn.style.opacity = '0.9';
            };
            okBtn.onmouseout = () => {
                okBtn.style.transform = 'scale(1)';
                okBtn.style.opacity = '1';
            };
            okBtn.onclick = () => {
                if (modal.parentNode === document.body) {
                    document.body.removeChild(modal);
                }
                resolve(true);
            };
        
            // Montar modal
            modal.appendChild(messageEl);
            modal.appendChild(okBtn);
            document.body.appendChild(modal);
            
            // Focar no botão OK
            okBtn.focus();
            
            // Permitir Enter/ESC para fechar
            const keyHandler = (e) => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                    okBtn.click();
                    document.removeEventListener('keydown', keyHandler);
                }
            };
            document.addEventListener('keydown', keyHandler);
        
            // Fechar ao clicar fora
        setTimeout(() => {
                const clickOutside = (e) => {
                    if (!modal.contains(e.target)) {
                        okBtn.click();
                        document.removeEventListener('click', clickOutside);
                    }
                };
                document.addEventListener('click', clickOutside);
            }, 100);
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // FUNÇÃO: Mostrar modal customizado para aviso da chave API
    // ═══════════════════════════════════════════════════════════════════════════════
    function showAIKeyWarningModal(callback) {
        // Criar modal simples e responsivo
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #1a2c38;
            border: 2px solid #FFD700;
            border-radius: 8px;
            padding: 20px;
            width: 90%;
            max-width: 420px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.8), 0 0 10px rgba(255, 215, 0, 0.3);
            z-index: 999999;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            box-sizing: border-box;
        `;
        
        // Título com ícone
        const header = document.createElement('div');
        header.style.cssText = `
            text-align: center;
            margin-bottom: 16px;
        `;
        header.innerHTML = `
            <div style="font-size: 36px; margin-bottom: 8px;">⚠️</div>
            <h3 style="margin: 0; color: #FFD700; font-size: 18px;">Análise Nível Diamante Bloqueada</h3>
        `;
        
        // Mensagem
        const message = document.createElement('div');
        message.style.cssText = `
            color: #cdd6e8;
            font-size: 14px;
            line-height: 1.6;
            text-align: center;
            margin-bottom: 16px;
        `;
        message.innerHTML = `
            <p style="margin: 0 0 12px 0;">A <strong>Análise Nível Diamante</strong> utiliza análise avançada por padrões com sistema de auto-aprendizado.</p>
            <p style="margin: 0; font-size: 13px; color: #8da2bb;">Sistema 100% JavaScript - sem necessidade de chave API externa.</p>
        `;
        
        // Container dos botões
        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-top: 16px;
        `;
        
        // Botão "Configurar Chave API" (principal - destaque)
        const configBtn = document.createElement('button');
        configBtn.textContent = '🔑 Configurar Chave API';
        configBtn.style.cssText = `
            width: 100%;
            padding: 12px 16px;
            background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
            color: #1a2c38;
            border: 1px solid rgba(255, 215, 0, 0.5);
            border-radius: 6px;
            font-size: 14px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s ease;
        `;
        configBtn.onmouseover = () => {
            configBtn.style.transform = 'scale(1.05)';
            configBtn.style.boxShadow = '0 4px 12px rgba(255, 215, 0, 0.4)';
        };
        configBtn.onmouseout = () => {
            configBtn.style.transform = 'scale(1)';
            configBtn.style.boxShadow = 'none';
        };
        configBtn.onclick = () => {
            if (modal.parentNode === document.body) {
                document.body.removeChild(modal);
            }
            
            // ✅ Tornar o campo de chave API visível (forçar exibição)
            const aiApiKeyField = document.getElementById('cfgAiApiKey');
            if (aiApiKeyField) {
                const settingItem = aiApiKeyField.closest('.setting-item');
                if (settingItem) {
                    settingItem.style.display = '';
                    settingItem.style.animation = 'highlight-field 2s ease';
                    // Marcar que este campo foi forçado a ser visível
                    settingItem.setAttribute('data-force-visible', 'true');
                    
                    // Adicionar animação de destaque temporária
                    const style = document.createElement('style');
                    style.textContent = `
                        @keyframes highlight-field {
                            0%, 100% { background: transparent; }
                            50% { background: rgba(255, 215, 0, 0.15); }
                        }
                    `;
                    document.head.appendChild(style);
                    
                    // Scroll até o campo
                    settingItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    
                    // Dar foco no campo após um pequeno delay (para o scroll terminar)
                    setTimeout(() => {
                        aiApiKeyField.focus();
                        
                        // Destacar o campo por 3 segundos
                        aiApiKeyField.style.border = '2px solid #FFD700';
                        aiApiKeyField.style.boxShadow = '0 0 10px rgba(255, 215, 0, 0.5)';
                        
                        setTimeout(() => {
                            aiApiKeyField.style.border = '';
                            aiApiKeyField.style.boxShadow = '';
                        }, 3000);
                    }, 500);
                }
            }
            
            callback(false); // Não ativa o modo IA ainda
        };
        
        // Botão OK (secundário)
        const okBtn = document.createElement('button');
        okBtn.textContent = 'Voltar';
        okBtn.style.cssText = `
            width: 100%;
            padding: 10px 16px;
            background: transparent;
            color: #8da2bb;
            border: 1px solid #445566;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
        `;
        okBtn.onmouseover = () => {
            okBtn.style.background = '#2a3a48';
            okBtn.style.color = '#cdd6e8';
        };
        okBtn.onmouseout = () => {
            okBtn.style.background = 'transparent';
            okBtn.style.color = '#8da2bb';
        };
        okBtn.onclick = () => {
            if (modal.parentNode === document.body) {
                document.body.removeChild(modal);
            }
            callback(false); // ✅ Retorna false - NÃO ativa o modo IA
        };
        
        // Montar modal
        buttonsContainer.appendChild(configBtn);
        buttonsContainer.appendChild(okBtn);
        modal.appendChild(header);
        modal.appendChild(message);
        modal.appendChild(buttonsContainer);
        document.body.appendChild(modal);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // FUNÇÃO: Ativar/Desativar modo IA
    // ═══════════════════════════════════════════════════════════════════════════════
    function activateAIMode(config, newAIMode, toggleElement) {
        // Atualizar configuração
        config.aiMode = newAIMode;
        config.martingaleProfiles = sanitizeMartingaleProfilesFromConfig(config);
        const activeModeKey = newAIMode ? 'diamond' : 'standard';
        applyActiveMartingaleToLegacyFields(config, activeModeKey, config.martingaleProfiles);
        
        // ✅ LOG DE DEBUG
        console.log('🔧 Salvando aiMode no storage:', newAIMode);
        console.log('🔧 Config completa sendo salva:', config);
        
        // ═══════════════════════════════════════════════════════════════════════════════
        // ✅ SOLUÇÃO: Salvar modo específico da ABA no sessionStorage
        // ═══════════════════════════════════════════════════════════════════════════════
        // sessionStorage é ISOLADO POR ABA - cada aba mantém sua própria configuração
        console.log(`%c💾 Salvando modo ESPECÍFICO desta ABA no sessionStorage...`, 'color: #00FF88; font-weight: bold;');
        sessionStorage.setItem('tabSpecificAIMode', JSON.stringify(newAIMode));
        console.log(`%c✅ Modo desta aba: ${newAIMode ? '💎 DIAMANTE' : '⚙️ PADRÃO'}`, 'color: #00FF88; font-weight: bold;');
        
        // ✅ Também salvar no chrome.storage.local (para ser padrão de novas abas)
        chrome.storage.local.set({ analyzerConfig: config }, function() {
            console.log('✅ Configuração global salva com sucesso!');
            updateAIModeUI(toggleElement, newAIMode);
            console.log(`🤖 Modo IA ${newAIMode ? 'ATIVADO' : 'DESATIVADO'}`);
            
            // ✅ Remover flag de forçar visibilidade quando IA for ativado
            if (newAIMode) {
                const aiApiKeyField = document.getElementById('cfgAiApiKey');
                if (aiApiKeyField) {
                    const settingItem = aiApiKeyField.closest('.setting-item');
                    if (settingItem) {
                        settingItem.removeAttribute('data-force-visible');
                    }
                }
            }
            
            // ✅ Habilitar/Desabilitar campos irrelevantes para IA
            toggleAIConfigFields(newAIMode);
            // ✅ Recarregar configurações para refletir perfis específicos de cada modo
            setTimeout(loadSettings, 0);
            
            // 🧠 Se modo IA foi ativado, atualizar status e iniciar intervalo
            if (newAIMode) {
                const modeApiStatus = document.getElementById('modeApiStatus');
                if (modeApiStatus) {
                    console.log('%c🧠 Modo IA ATIVADO! Iniciando atualização do status...', 'color: #00CED1; font-weight: bold;');
                    
                    // ✅ TENTAR MÚLTIPLAS VEZES PARA GARANTIR (importante no mobile)
                    const tentarAtualizar = async (tentativa = 1, maxTentativas = 3) => {
                        await atualizarStatusMemoriaAtiva(modeApiStatus);
                        
                        // Se ainda estiver "Inicializando..." e não for a última tentativa, tentar novamente
                        if (modeApiStatus.textContent.includes('Inicializando') && tentativa < maxTentativas) {
                            console.log(`%c🔄 Tentativa ${tentativa}/${maxTentativas} - Ainda inicializando, tentando novamente em 2s...`, 'color: #FFA500;');
                            setTimeout(() => tentarAtualizar(tentativa + 1, maxTentativas), 2000);
                        }
                    };
                    
                    // Primeira tentativa após 1 segundo
                    setTimeout(() => tentarAtualizar(), 1000);
                    
                    // ✅ INICIAR INTERVALO DE ATUALIZAÇÃO PERIÓDICA
                    iniciarAtualizacaoMemoria();
                }
            } else {
                // Se desativou, parar intervalo
                if (intervaloAtualizacaoMemoria) {
                    clearInterval(intervaloAtualizacaoMemoria);
                    intervaloAtualizacaoMemoria = null;
                    console.log('%c🛑 Intervalo de atualização da memória parado.', 'color: #FFA500;');
                }
            }
            
            // ❌ NÃO SINCRONIZAR aiMode - cada dispositivo tem seu próprio modo ativo!
            // As configurações (minPercentage, aiApiKey, etc) são sincronizadas via botão Salvar
            
            // ✅ RE-RENDERIZAR ENTRADAS PARA FILTRAR POR MODO
            chrome.storage.local.get(['entriesHistory'], function(res) {
                if (res && res.entriesHistory) {
                    console.log(`🔄 Re-renderizando entradas para modo ${newAIMode ? 'DIAMANTE' : 'PADRÃO'}...`);
                    console.log(`   Total de entradas no histórico: ${res.entriesHistory.length}`);
                    renderEntriesPanel(res.entriesHistory);
                    console.log('✅ Entradas filtradas e exibidas!');
                }
            });
            
            // Notificar background.js
            chrome.runtime.sendMessage({
                action: 'aiModeChanged',
                aiMode: newAIMode
            });
        });
    }
    // ═══════════════════════════════════════════════════════════════════════════════
    // FUNÇÃO: Mostrar/Ocultar campos baseado no modo (IA ou Padrão)
    // ═══════════════════════════════════════════════════════════════════════════════
    function toggleAIConfigFields(isAIMode) {
        // ✅ CAMPOS DO MODO PADRÃO: Ocultar quando IA está ativa
        const standardModeFields = [
            'cfgHistoryDepth',       // ✅ NOVO: Profundidade de Análise (giros) - VÁLIDO APENAS NO MODO PADRÃO
            'cfgMinOccurrences',     // Ocorrências mínima (modo padrão)
            'cfgMaxOccurrences',     // Quantidade máxima de ocorrências
            'cfgMinPatternSize',     // Tamanho mínimo do padrão
            'cfgMaxPatternSize',     // Tamanho máximo do padrão
            'cfgWinPercentOthers',   // WIN% das demais ocorrências
            'cfgRequireTrigger'      // Exigir cor de disparo
        ];
        
        standardModeFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                // Ocultar o elemento pai (setting-item) completamente
                const settingItem = field.closest('.setting-item');
                if (settingItem) {
                    settingItem.style.display = isAIMode ? 'none' : '';
                }
            }
        });
        
        // ✅ Campos do Modo Diamante removidos - agora usa apenas o modal "Configurar Níveis Diamante"
        
        // ✅ CAMPOS COMPARTILHADOS: Destacar quando IA está ativa (são usados em ambos os modos)
        const sharedFields = [
            { id: 'cfgMinOccurrences', label: 'Confiança mínima (%)' },
            { id: 'cfgMinInterval', label: 'Distância mínima entre sinais' }
        ];
        
        sharedFields.forEach(({ id, label }) => {
            const field = document.getElementById(id);
            if (field) {
                if (isAIMode) {
                    // Destacar que estes campos SÃO respeitados pela IA
                    field.style.border = '2px solid rgba(0, 255, 136, 0.5)';
                    field.title = `✅ A IA respeita esta configuração: ${label}`;
                } else {
                    field.style.border = '';
                    field.title = '';
                }
            }
        });
        
        // ✅ BANCO DE PADRÕES: Ocultar quando Nível Diamante está ativo
        // O Banco de Padrões só é usado no modo de análise padrão
        const patternBankSection = document.querySelector('.pattern-bank-section');
        if (patternBankSection) {
            if (isAIMode) {
                // Modo Diamante: OCULTAR banco de padrões
                patternBankSection.style.display = 'none';
                console.log('📂 Banco de Padrões ocultado (Modo Nível Diamante ativo)');
            } else {
                // Modo Padrão: MOSTRAR banco de padrões
                patternBankSection.style.display = '';
                console.log('📂 Banco de Padrões visível (Modo Padrão ativo)');
            }
        }
        
        // ✅ VISUAL FEEDBACK: Mudar cor de fundo quando Nível Diamante está ativo
        // Fundo da extensão: 15% mais claro | Header: 25% mais verde
        const sidebar = document.getElementById('blaze-double-analyzer');
        if (sidebar) {
            if (isAIMode) {
                // Modo Diamante: ATIVAR visual diferenciado
                sidebar.classList.add('diamond-mode-active');
                console.log('💎 Visual Nível Diamante ativado (fundo +15% claro, header +25% verde)');
            } else {
                // Modo Padrão: REMOVER visual diferenciado
                sidebar.classList.remove('diamond-mode-active');
                console.log('📊 Visual Modo Padrão ativado (cores normais)');
            }
        }
        
        // ✅ BOTÕES DE PADRÕES CUSTOMIZADOS: Visíveis apenas no Nível Diamante
        // (Padrão Quente, Padrões Ativos, Adicionar Modelo)
        const customPatternsContainer = document.getElementById('customPatternsContainer');
        if (customPatternsContainer) {
            if (isAIMode) {
                // Modo Diamante: MOSTRAR botões de padrões customizados
                customPatternsContainer.style.display = '';
                console.log('🔥 Botões de Padrões Customizados visíveis (Modo Nível Diamante)');
            } else {
                // Modo Padrão: OCULTAR botões de padrões customizados
                customPatternsContainer.style.display = 'none';
                console.log('🔒 Botões de Padrões Customizados ocultos (Modo Padrão)');
            }
        }
        
        // ✅ INTENSIDADE DE SINAIS: Visível apenas no Nível Diamante
        const signalIntensityContainer = document.getElementById('signalIntensityContainer');
        if (signalIntensityContainer) {
            if (isAIMode) {
                // Modo Diamante: MOSTRAR seletor de intensidade
                signalIntensityContainer.style.display = '';
                console.log('🎚️ Seletor de Intensidade de Sinais visível (Modo Nível Diamante)');
            } else {
                // Modo Padrão: OCULTAR seletor de intensidade
                signalIntensityContainer.style.display = 'none';
                console.log('🔒 Seletor de Intensidade de Sinais oculto (Modo Padrão)');
            }
        }

        
    }
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // FUNÇÃO: Atualizar visual do toggle de modo IA
    // ═══════════════════════════════════════════════════════════════════════════════
    function updateAIModeUI(toggleElement, isActive) {
        if (!toggleElement) return;
        
        console.log('%c═══════════════════════════════════════════════════════════', 'color: #FFD700; font-weight: bold;');
        console.log('%c⚙️ [DEBUG updateAIModeUI]', 'color: #FFD700; font-weight: bold;');
        console.log('%c   isActive:', 'color: #FFD700;', isActive);
        
        const modeName = toggleElement.querySelector('.mode-name');
        const modeApiContainer = toggleElement.querySelector('.mode-api-container');
        const modeApiStatus = document.getElementById('modeApiStatus');
        const titleBadge = document.getElementById('titleBadge');
        
        if (isActive) {
            // 🔍 LOG: Altura ANTES
            const heightBefore = window.getComputedStyle(toggleElement).height;
            console.log('%c   📏 Toggle ANTES:', 'color: #FFA500;', heightBefore);
            
            toggleElement.classList.add('active');
            
            // ✅ FORÇAR TAMANHO FIXO DO CONTAINER PAI
            toggleElement.style.cssText = `
                min-height: 80px !important;
                max-height: 80px !important;
                height: auto !important;
                overflow: hidden !important;
                padding: 6px 12px !important;
                gap: 0 !important;
            `;
            
            console.log('%c   ✅ Estilos inline aplicados ao toggle', 'color: #00FF88;');
            console.log('%c   🎨 cssText:', 'color: #FFFF00;', toggleElement.style.cssText);
            
            // 🔍 LOG: Altura DEPOIS
            const heightAfter = window.getComputedStyle(toggleElement).height;
            console.log('%c   📏 Toggle DEPOIS:', 'color: #00FFFF;', heightAfter);
            
            if (modeName) modeName.textContent = '💎 Análise Diamante Ativa';
            
            // ✅ Mudar badge para IA
            if (titleBadge) {
                titleBadge.textContent = 'IA';
                titleBadge.classList.add('badge-ia');
            }
            
            // 🧠 Atualizar status dinâmico da memória ativa
            if (modeApiContainer && modeApiStatus) {
                modeApiContainer.style.display = 'block';
                atualizarStatusMemoriaAtiva(modeApiStatus);
            }
            
            console.log('%c═══════════════════════════════════════════════════════════', 'color: #FFD700; font-weight: bold;');
        } else {
            toggleElement.classList.remove('active');
            
            // ✅ REMOVER ESTILOS INLINE
            toggleElement.style.cssText = '';
            
            if (modeName) modeName.textContent = 'Ativar Modo Diamante';
            
            // ✅ Mudar badge para PREMIUM
            if (titleBadge) {
                titleBadge.textContent = 'PREMIUM';
                titleBadge.classList.remove('badge-ia');
            }
            
            // ✅ FORÇAR OCULTAR CONTAINER
            if (modeApiContainer) {
                modeApiContainer.style.display = 'none';
                console.log('%c🚫 Container IA OCULTO (modo DESATIVADO)', 'color: #FF6666; font-weight: bold;');
            }
            if (modeApiStatus) {
                modeApiStatus.textContent = '';
            }
            
            // ✅ PARAR INTERVALO DE ATUALIZAÇÃO
            if (intervaloAtualizacaoMemoria) {
                clearInterval(intervaloAtualizacaoMemoria);
                intervaloAtualizacaoMemoria = null;
                console.log('%c🛑 Intervalo parado (modo DESATIVADO)', 'color: #FFA500; font-weight: bold;');
            }
        }
    }

    // 🧠 Atualizar status da memória ativa na interface
    async function atualizarStatusMemoriaAtiva(elemento) {
        // ✅ VERIFICAR SE O MODO IA ESTÁ ATIVO - SE NÃO, NÃO FAZER NADA
        const aiModeToggle = document.querySelector('.ai-mode-toggle.active');
        if (!aiModeToggle) {
            console.log('%c🚫 [atualizarStatusMemoriaAtiva] Modo IA NÃO está ativo - ignorando', 'color: #FFA500; font-weight: bold;');
            return;
        }
        
        const modeApiContainer = document.querySelector('.mode-api-container');
        
        console.log('%c═══════════════════════════════════════════════════════════', 'color: #00CED1; font-weight: bold;');
        console.log('%c🧠 [DEBUG atualizarStatusMemoriaAtiva]', 'color: #00CED1; font-weight: bold;');
        
        // 🔍 LOG: Tamanhos NO INÍCIO
        if (modeApiContainer && aiModeToggle) {
            const containerHeight = window.getComputedStyle(modeApiContainer).height;
            const toggleHeight = window.getComputedStyle(aiModeToggle).height;
            console.log('%c   📏 NO INÍCIO:', 'color: #FFA500;', {
                container: containerHeight,
                toggle: toggleHeight
            });
        }
        
        // ✅ VERIFICAR SE ESTÁ EM ANÁLISE PROGRESSIVA - NÃO SOBRESCREVER!
        const isProgressiveAnalysis = currentAnalysisStatus && (
            currentAnalysisStatus.includes('Nível') ||
            currentAnalysisStatus.includes('Iniciando análise') ||
            currentAnalysisStatus.includes('Barreira') ||
            currentAnalysisStatus.includes('aprovado') ||
            currentAnalysisStatus.includes('rejeitado') ||
            currentAnalysisStatus.includes('Rejeitado') ||
            currentAnalysisStatus.includes('Análise:') ||
            currentAnalysisStatus.includes('Aguarde novo giro')
        );
        
        if (isProgressiveAnalysis) {
            console.log('%c⏸️ [atualizarStatusMemoriaAtiva] ANÁLISE PROGRESSIVA EM ANDAMENTO - NÃO atualizar', 'color: #FFA500; font-weight: bold;');
            console.log('%c   Status atual:', 'color: #FFA500;', currentAnalysisStatus);
            console.log('%c═══════════════════════════════════════════════════════════', 'color: #00CED1; font-weight: bold;');
            return; // ✅ NÃO sobrescrever durante análise progressiva
        }
        
        console.log('%c╔══════════════════════════════════════════════════════════╗', 'color: #00CED1; font-weight: bold;');
        console.log('%c║  🧠 [CONTENT] INICIANDO ATUALIZAÇÃO DO STATUS          ║', 'color: #00CED1; font-weight: bold;');
        console.log('%c╚══════════════════════════════════════════════════════════╝', 'color: #00CED1; font-weight: bold;');
        
        try {
            console.log('%c📤 [CONTENT] Enviando mensagem GET_MEMORIA_ATIVA_STATUS...', 'color: #00CED1;');
            console.log('%c   Elemento alvo:', 'color: #00CED1;', elemento);
            console.log('%c   chrome.runtime exists?', 'color: #00CED1;', !!chrome.runtime);
            console.log('%c   chrome.runtime.sendMessage exists?', 'color: #00CED1;', !!chrome.runtime.sendMessage);
            
            // Pedir status da memória ativa do background.js
            const response = await chrome.runtime.sendMessage({ action: 'GET_MEMORIA_ATIVA_STATUS' });
            
            console.log('%c╔══════════════════════════════════════════════════════════╗', 'color: #00FF88; font-weight: bold;');
            console.log('%c║  📥 [CONTENT] RESPOSTA RECEBIDA!                       ║', 'color: #00FF88; font-weight: bold;');
            console.log('%c╚══════════════════════════════════════════════════════════╝', 'color: #00FF88; font-weight: bold;');
            console.log('%c   Resposta completa:', 'color: #00FF88;', response);
            console.log('%c   response.status exists?', 'color: #00FF88;', !!response?.status);
            
            if (response && response.status) {
                const status = response.status;
                console.log('%c✅ [CONTENT] Status válido recebido!', 'color: #00FF88; font-weight: bold;');
                console.log('%c   📊 Detalhes do status:', 'color: #00FF88;');
                console.log('%c      ├─ inicializada:', 'color: #00FF88;', status.inicializada);
                console.log('%c      ├─ totalAtualizacoes:', 'color: #00FF88;', status.totalAtualizacoes);
                console.log('%c      ├─ tempoUltimaAtualizacao:', 'color: #00FF88;', status.tempoUltimaAtualizacao);
                console.log('%c      └─ totalGiros:', 'color: #00FF88;', status.totalGiros);
                
                const modeApiContainer = document.querySelector('.mode-api-container');
                
                if (!status.inicializada) {
                    // Memória está inicializando
                    console.log('%c🟠 [UI] Atualizando para: Inicializando IA...', 'color: #FFA500; font-weight: bold;');
                    elemento.textContent = '⚡ Inicializando...';
                    // ✅ NÃO mexer no display - já está gerenciado pelo updateAIModeUI
                } else {
                    // Memória está ativa
                    const updates = status.totalAtualizacoes || 0;
                    
                    console.log('%c🟢 [UI] Atualizando para: Memória ativada', 'color: #00FF00; font-weight: bold;');
                    
                    elemento.textContent = `Memória ativada • ${updates} análises`;
                    // ✅ NÃO mexer no display - já está gerenciado pelo updateAIModeUI
                }
                
                console.log('%c✅ [UI] Texto do elemento após atualização:', 'color: #00FF88;', elemento.textContent);
                
                // 🔍 LOG: Tamanhos NO FINAL
                if (modeApiContainer && aiModeToggle) {
                    const containerHeightFinal = window.getComputedStyle(modeApiContainer).height;
                    const toggleHeightFinal = window.getComputedStyle(aiModeToggle).height;
                    console.log('%c   📏 NO FINAL:', 'color: #00FFFF;', {
                        container: containerHeightFinal,
                        toggle: toggleHeightFinal
                    });
                }
            } else {
                uiLog('⚠️ [CONTENT] Resposta inválida ou vazia!', response);
                elemento.textContent = 'Memória ativada';
                return;
            }
        } catch (error) {
            console.error('%c╔══════════════════════════════════════════════════════════╗', 'color: #FF0000; font-weight: bold;');
            console.error('%c║  ❌ [CONTENT] ERRO AO OBTER STATUS!                    ║', 'color: #FF0000; font-weight: bold;');
            console.error('%c╚══════════════════════════════════════════════════════════╝', 'color: #FF0000; font-weight: bold;');
            console.error('%c   Erro:', 'color: #FF0000;', error);
            console.error('%c   Stack:', 'color: #FF0000;', error.stack);
            elemento.textContent = 'Memória ativada';
            // ✅ NÃO mexer no display - já está gerenciado pelo updateAIModeUI
        }
        
        // 🔍 LOG: Tamanhos NO FIM TOTAL
        if (modeApiContainer && aiModeToggle) {
            const containerHeightEnd = window.getComputedStyle(modeApiContainer).height;
            const toggleHeightEnd = window.getComputedStyle(aiModeToggle).height;
            console.log('%c   📏 NO FIM TOTAL:', 'color: #FF00FF;', {
                container: containerHeightEnd,
                toggle: toggleHeightEnd
            });
            console.log('%c   🎨 Estilos inline finais do container:', 'color: #FFFF00;', modeApiContainer.style.cssText);
            console.log('%c   🎨 Estilos inline finais do toggle:', 'color: #FFFF00;', aiModeToggle.style.cssText);
        }
        
        console.log('%c═══════════════════════════════════════════════════════════', 'color: #00CED1; font-weight: bold;');
        console.log('');
    }
    
    // 🔍 DEBUG: MutationObserver para rastrear mudanças de altura
    function setupHeightObserver() {
        const aiModeToggle = document.querySelector('.ai-mode-toggle');
        const modeApiContainer = document.querySelector('.mode-api-container');
        
        if (!aiModeToggle || !modeApiContainer) return;
        
        const observer = new MutationObserver((mutations) => {
            if (!ENABLE_VERBOSE_UI_LOGS) return;
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
                    const toggleHeight = window.getComputedStyle(aiModeToggle).height;
                    const containerHeight = window.getComputedStyle(modeApiContainer).height;
                    
                    uiLog('🚨 [MUTATION OBSERVER] Mudança detectada!', {
                        target: mutation.target,
                        attribute: mutation.attributeName,
                        toggleHeight,
                        containerHeight
                    });
                    console.trace();
                }
            });
        });
        
        observer.observe(aiModeToggle, { 
            attributes: true, 
            attributeFilter: ['style', 'class']
        });
        
        observer.observe(modeApiContainer, { 
            attributes: true, 
            attributeFilter: ['style', 'class']
        });
        
        uiLog('🔍 MutationObserver ativo para rastrear mudanças de altura');
    }
    
    // ⚡ Atualizar status da memória ativa periodicamente (a cada 5 segundos)
    let intervaloAtualizacaoMemoria = null;
    
    function iniciarAtualizacaoMemoria() {
        // Limpar intervalo anterior se existir
        if (intervaloAtualizacaoMemoria) {
            clearInterval(intervaloAtualizacaoMemoria);
        }
        
        // Atualizar a cada 5 segundos quando modo IA estiver ativo
        intervaloAtualizacaoMemoria = setInterval(async () => {
            try {
                const result = await storageCompat.get(['analyzerConfig']);
                if (result.analyzerConfig && result.analyzerConfig.aiMode) {
                    const modeApiStatus = document.getElementById('modeApiStatus');
                    if (modeApiStatus) {
                        await atualizarStatusMemoriaAtiva(modeApiStatus);
                    }
                }
            } catch (error) {
                console.warn('⚠️ Erro ao atualizar status da memória:', error);
            }
        }, 5000); // 5 segundos
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // 🎯 SISTEMA DE PADRÕES CUSTOMIZADOS (NÍVEL DIAMANTE)
    // ═══════════════════════════════════════════════════════════════════════════════
    
    let customPatternsData = []; // Array de padrões customizados
    
const DIAMOND_LEVEL_DEFAULTS = {
    n0History: 2000,
    n0Window: 100,
    n1HotPattern: 60,
    n2Recent: 5,
    n2Previous: 15,
    n3Alternance: 12,
    n3PatternLength: 4,
    n3ThresholdPct: 75,
    n3MinOccurrences: 1,
    n3AllowBackoff: false,
    n3IgnoreWhite: false,
    n4Persistence: 20,
    n5MinuteBias: 60,
    n6RetracementWindow: 80,
    n7DecisionWindow: 20,
    n7HistoryWindow: 100,
    n8Barrier: 50,
    n9History: 100,
    n9NullThreshold: 8,
    n9PriorStrength: 1,
    // N8 - Walk-forward Não-Sobreposto (exibido como tal, ainda usa chave N10 internamente)
    n10Window: 20,
    n10History: 500,
    n10Analyses: 600,
    n10MinWindows: 8,
    n10ConfMin: 60
};

const WHITE_PROTECTION_MODE = Object.freeze({
    PROFIT: 'profit',
    NEUTRAL: 'neutral'
});

const WHITE_PROTECTION_MODE_DESCRIPTIONS = Object.freeze({
    [WHITE_PROTECTION_MODE.PROFIT]: 'O branco cobre todas as perdas acumuladas e ainda entrega o mesmo lucro do estágio atual.',
    [WHITE_PROTECTION_MODE.NEUTRAL]: 'O branco apenas devolve tudo que foi apostado (cor + brancos), finalizando zerado neste ciclo.'
});

const AUTO_BET_DEFAULTS = Object.freeze({
    enabled: false,
    simulationOnly: true,
    baseStake: 2,
    galeMultiplier: 2,
    delayMs: 1500,
    stopWin: 0,
    stopLoss: 0,
    simulationBankRoll: 5000,
    whitePayoutMultiplier: 14,
    whiteProtection: false,
    inverseModeEnabled: false,
    whiteProtectionMode: WHITE_PROTECTION_MODE.PROFIT
});

const AUTO_BET_RUNTIME_DEFAULTS = Object.freeze({
    profit: 0,
    totalWins: 0,
    totalLosses: 0,
    totalProfitEarned: 0,
    totalLossSpent: 0,
    blockedReason: null,
    lastProcessedEntryTimestamp: null,
    openCycle: null,
    simulationBalanceBase: AUTO_BET_DEFAULTS.simulationBankRoll,
    simulationBalance: AUTO_BET_DEFAULTS.simulationBankRoll,
    inverseNextBaseFactor: 1,
    inverseCycleBaseFactor: 1
});

const AUTO_BET_HISTORY_KEY = 'autoBetHistory';
const AUTO_BET_HISTORY_LIMIT = 150;

const uiCurrencyFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
});

let cachedAutoBetAvailability = { hasReal: false, hasSimulation: false };
let entriesTabsReady = false;
let entriesTabsBound = false;
let activeEntriesTab = 'entries';
let autoBetHistoryUnsubscribe = null;

function formatCurrencyBRL(value) {
    const numeric = Number(value);
    return uiCurrencyFormatter.format(Number.isFinite(numeric) ? numeric : 0);
}

function formatCycleStageLabel(rawStage, index = 0) {
    if (!rawStage) {
        return index === 0 ? 'E1' : `G${index}`;
    }
    const normalized = String(rawStage).toUpperCase();
    if (normalized === 'ENTRADA' || normalized === 'G0') {
        return 'E1';
    }
    return normalized;
}

function setAutoBetAvailabilityState(state = {}) {
    cachedAutoBetAvailability = {
        hasReal: !!state.hasReal,
        hasSimulation: !!state.hasSimulation
    };
    applyAutoBetAvailabilityToUI();
}

function sanitizeAutoBetConfig(raw) {
    const base = raw && typeof raw === 'object' ? raw : {};
    const getNumber = (value, fallback) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    };
    const sanitized = {
        ...AUTO_BET_DEFAULTS
    };
    sanitized.enabled = !!base.enabled;
    sanitized.simulationOnly = base.simulationOnly === undefined
        ? AUTO_BET_DEFAULTS.simulationOnly
        : !!base.simulationOnly;
    sanitized.baseStake = Math.max(0.01, getNumber(base.baseStake, AUTO_BET_DEFAULTS.baseStake));
    sanitized.galeMultiplier = Math.max(1, getNumber(base.galeMultiplier, AUTO_BET_DEFAULTS.galeMultiplier));
    sanitized.delayMs = Math.max(0, Math.round(getNumber(base.delayMs, AUTO_BET_DEFAULTS.delayMs)));
    sanitized.stopWin = Math.max(0, getNumber(base.stopWin, AUTO_BET_DEFAULTS.stopWin));
    sanitized.stopLoss = Math.max(0, getNumber(base.stopLoss, AUTO_BET_DEFAULTS.stopLoss));
    sanitized.simulationBankRoll = Math.max(0, getNumber(base.simulationBankRoll, AUTO_BET_DEFAULTS.simulationBankRoll));
    sanitized.whiteProtection = !!base.whiteProtection;
    sanitized.whitePayoutMultiplier = Math.max(2, getNumber(base.whitePayoutMultiplier, AUTO_BET_DEFAULTS.whitePayoutMultiplier));
    sanitized.whiteProtectionMode = normalizeWhiteProtectionMode(base.whiteProtectionMode);
    sanitized.inverseModeEnabled = !!base.inverseModeEnabled;
    return sanitized;
}

function normalizeWhiteProtectionMode(mode) {
    return mode === WHITE_PROTECTION_MODE.NEUTRAL ? WHITE_PROTECTION_MODE.NEUTRAL : WHITE_PROTECTION_MODE.PROFIT;
}

function setWhiteProtectionModeUI(mode) {
    const normalized = normalizeWhiteProtectionMode(mode);
    const hiddenInput = document.getElementById('autoBetWhiteMode');
    if (hiddenInput) {
        hiddenInput.value = normalized;
    }
    const buttons = document.querySelectorAll('.white-mode-btn');
    buttons.forEach((btn) => {
        const isActive = btn.dataset.whiteMode === normalized;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    const description = document.getElementById('whiteProtectionModeDescription');
    if (description) {
        description.textContent = WHITE_PROTECTION_MODE_DESCRIPTIONS[normalized];
    }
}

function setWhiteProtectionModeAvailability(enabled) {
    const wrapper = document.getElementById('whiteProtectionModeWrapper');
    if (!wrapper) return;
    wrapper.classList.toggle('white-mode-disabled', !enabled);
    wrapper.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    const buttons = wrapper.querySelectorAll('button.white-mode-btn');
    buttons.forEach((btn) => {
        btn.disabled = !enabled;
    });
}

const ENABLE_VERBOSE_UI_LOGS = false;
const originalConsoleLog = console.log.bind(console);
const uiLog = (...args) => {
    if (ENABLE_VERBOSE_UI_LOGS) {
        originalConsoleLog(...args);
    }
};
console.log = uiLog;

let trainingConnectionState = null;
let trainingSpinLogged = false;
let lastTrainingSpinData = null;
let lastModeSnapshot = null;
let analyzerActive = true;
let analyzerToggleBusy = false;
let autoBetSummaryVisible = true;
let analyzerAutoPausedReason = null;
let analyzerConfigSnapshot = null;
let bankProgressTimeout = null;

function applyAutoBetSummaryVisibility() {
    const summary = document.getElementById('autoBetSummary');
    const collapsed = document.getElementById('autoBetSummaryCollapsed');
    const hideBtn = document.getElementById('autoBetHideBtn');
    if (summary) {
        summary.classList.toggle('hidden', !autoBetSummaryVisible);
    }
    if (collapsed) {
        collapsed.classList.toggle('visible', !autoBetSummaryVisible);
    }
    if (hideBtn) {
        hideBtn.textContent = autoBetSummaryVisible ? 'Ocultar' : 'Mostrar saldo';
    }
}

function setAutoBetSummaryVisibility(isVisible, source = 'user') {
    autoBetSummaryVisible = !!isVisible;
    try {
        localStorage.setItem('autoBetSummaryVisible', autoBetSummaryVisible ? '1' : '0');
    } catch (e) {
        // ignore
    }
    applyAutoBetSummaryVisibility();
    console.log(`[AUTO-BET] Visibilidade do resumo alterada (${source}):`, autoBetSummaryVisible ? 'visível' : 'oculto');
    
    updateAnalyzerConfigPartial({ autoBetSummaryVisible: autoBetSummaryVisible })
        .catch(error => console.warn('⚠️ Não foi possível persistir autoBetSummaryVisible:', error));
}

async function initAutoBetSummaryVisibilityControls() {
    let initializedFromConfig = false;
    try {
        const stored = await storageCompat.get(['analyzerConfig']);
        const config = stored?.analyzerConfig || {};
        if (typeof config.autoBetSummaryVisible === 'boolean') {
            autoBetSummaryVisible = config.autoBetSummaryVisible;
            initializedFromConfig = true;
            try {
                localStorage.setItem('autoBetSummaryVisible', autoBetSummaryVisible ? '1' : '0');
            } catch (e) {
                // ignore
            }
        }
    } catch (error) {
        console.warn('⚠️ Erro ao carregar visibilidade do saldo sincronizada:', error);
    }
    
    if (!initializedFromConfig) {
        try {
            const saved = localStorage.getItem('autoBetSummaryVisible');
            if (saved === '0') {
                autoBetSummaryVisible = false;
            }
        } catch (e) {
            // ignore
        }
    }
    
    const hideBtn = document.getElementById('autoBetHideBtn');
    const showBtn = document.getElementById('autoBetShowBtn');
    if (hideBtn) {
        hideBtn.addEventListener('click', () => setAutoBetSummaryVisibility(false, 'hide-btn'));
    }
    if (showBtn) {
        showBtn.addEventListener('click', () => setAutoBetSummaryVisibility(true, 'show-btn'));
    }
    applyAutoBetSummaryVisibility();
    
    updateAnalyzerConfigPartial({ autoBetSummaryVisible: autoBetSummaryVisible })
        .catch(error => console.warn('⚠️ Não foi possível sincronizar estado inicial do saldo:', error));
}

function logTrainingConnectionStatus(isConnected, force = false) {
    if (!force && trainingConnectionState === isConnected) return;
    trainingConnectionState = isConnected;
    const headerColor = isConnected ? '#00C853' : '#FF5252';
    const detailColor = isConnected ? '#69F0AE' : '#FF8A80';
    const labelColor = isConnected ? '#1B5E20' : '#B71C1C';
    originalConsoleLog(`%c╔══════════════════════════════════════════════════╗`, `color:${headerColor}; font-weight:bold;`);
    originalConsoleLog(`%c║  Treinamento • API de Giros ↔ Servidor (Render)  ║`, `color:${headerColor}; font-weight:bold;`);
    originalConsoleLog(`%c║  Status: %c${isConnected ? 'CONEXÃO ATIVA ✅' : 'SEM CONEXÃO ⛔'}                       %c║`, `color:${headerColor}; font-weight:bold;`, `color:${labelColor}; font-weight:bold;`, `color:${headerColor}; font-weight:bold;`);
    if (isConnected) {
        originalConsoleLog(`%c║  Origem: Blaze Giros API (Render)                ║`, `color:${detailColor}; font-weight:bold;`);
        originalConsoleLog(`%c║  Destino: Painel Web (content.js)                ║`, `color:${detailColor}; font-weight:bold;`);
        originalConsoleLog(`%c║  Fluxo: Servidor ➜ WebSocket ➜ Site             ║`, `color:${detailColor}; font-weight:bold;`);
    } else {
        originalConsoleLog(`%c║  Aguardando reconexão automática...             ║`, `color:${detailColor}; font-weight:bold;`);
    }
    originalConsoleLog(`%c╚══════════════════════════════════════════════════╝`, `color:${headerColor}; font-weight:bold;`);
    originalConsoleLog(`%cℹ️  Execute window.showTrainingStatus() para atualizar este bloco.`, `color:${detailColor}; font-weight:bold;`);
}

function formatSpinColorLabel(color) {
    if (color === 'red') return '🔴 Vermelho';
    if (color === 'black') return '⚫ Preto';
    if (color === 'white') return '⚪ Branco';
    return color || 'N/D';
}

function logTrainingLastSpin(spin, force = false) {
    if (!spin) return;
    if (!force && trainingSpinLogged) return;
    trainingSpinLogged = true;
    lastTrainingSpinData = spin;
    const detailColor = '#40C4FF';
    const labelColor = '#01579B';
    const valueColor = '#0277BD';
    const ts = spin.timestamp ? new Date(spin.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'N/D';
    originalConsoleLog(`%c📥 Treinamento • Último giro recebido do servidor`, `color:${detailColor}; font-weight:bold;`);
    originalConsoleLog(`%c   • Número: %c${spin.number ?? 'N/D'} %c| Cor: %c${formatSpinColorLabel(spin.color)}`, `color:${labelColor}; font-weight:bold;`, `color:${valueColor}; font-weight:bold;`, `color:${labelColor}; font-weight:bold;`, `color:${valueColor}; font-weight:bold;`);
    originalConsoleLog(`%c   • Timestamp (local): %c${ts}`, `color:${labelColor}; font-weight:bold;`, `color:${valueColor}; font-weight:bold;`);
    originalConsoleLog(`%c   • Origem: API de Giros (Render) ➜ WebSocket ➜ Painel`, `color:${detailColor}; font-weight:bold;`);
    originalConsoleLog(`%cℹ️  Use window.showTrainingStatus() para capturar novamente.`, `color:${detailColor}; font-weight:bold;`);
}

function logAnalyzerToggleStatus(isActive, source = 'Painel') {
    const headerColor = isActive ? '#00E676' : '#FF5252';
    const detailColor = isActive ? '#1B5E20' : '#B71C1C';
    const infoColor = isActive ? '#B9F6CA' : '#FFCDD2';
    const icon = isActive ? '✅' : '⛔';
    const statusLabel = isActive ? 'ANÁLISE ATIVADA' : 'ANÁLISE DESATIVADA';
    const timestamp = new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    originalConsoleLog(`%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, `color:${headerColor}; font-weight:bold;`);
    originalConsoleLog(`%c${icon} ${statusLabel}`, `color:${detailColor}; font-weight:bold; font-size:14px;`);
    originalConsoleLog(`%cFonte: ${source}`, `color:${infoColor}; font-weight:bold;`);
    originalConsoleLog(`%cHorário: ${timestamp}`, `color:${infoColor}; font-weight:bold;`);
    originalConsoleLog(`%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, `color:${headerColor}; font-weight:bold;`);
}

window.showTrainingStatus = function showTrainingStatus() {
    logTrainingConnectionStatus(trainingConnectionState ?? false, true);
    logTrainingLastSpin(lastTrainingSpinData, true);
};

const DIAMOND_LEVEL_ENABLE_DEFAULTS = Object.freeze({
    n0: true,
    n1: true,
    n2: true,
    n3: true,
    n4: true,
    n5: true,
    n6: true,
    n7: true,
    n8: true,
    n9: true,
    n10: true
});
    // Função para mostrar notificação toast (simples e rápida)
    function showToast(message, duration = 2000) {
        // Remover toast anterior se existir
        const existingToast = document.getElementById('customToast');
        if (existingToast) {
            existingToast.remove();
        }
        
        const toast = document.createElement('div');
        toast.id = 'customToast';
        toast.className = 'custom-toast';
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        // Mostrar com animação
        setTimeout(() => toast.classList.add('show'), 10);
        
        // Remover após duração
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
    
    function sendRuntimeMessage(payload) {
        return new Promise(resolve => {
            if (!chrome?.runtime?.sendMessage) {
                resolve(null);
                return;
            }
            try {
                chrome.runtime.sendMessage(payload, response => {
                    if (chrome.runtime.lastError) {
                        console.warn('chrome.runtime.sendMessage falhou:', chrome.runtime.lastError.message);
                        resolve(null);
                    } else {
                        resolve(response);
                    }
                });
            } catch (error) {
                console.warn('Erro ao enviar mensagem runtime:', error);
                resolve(null);
            }
        });
    }

    async function pauseAnalysisForAutoBet(reason = 'Auto stop') {
        const normalizedReason = reason || 'Auto stop';
        if (!analyzerActive && analyzerAutoPausedReason === normalizedReason) {
            return;
        }
        const response = await sendRuntimeMessage({ action: 'SET_ANALYSIS_ENABLED', enabled: false, source: 'AUTO_BET_STOP' });
        if (response && response.status === 'ok') {
            analyzerAutoPausedReason = normalizedReason;
            updateAnalyzerToggleUI(false, { log: true, source: normalizedReason });
            await persistAnalyzerState(false);
            showToast(`${normalizedReason}. Análises pausadas automaticamente.`, 2600);
        }
    }

    async function syncAnalyzerToggleStatus() {
        const response = await sendRuntimeMessage({ action: 'GET_ANALYSIS_STATUS' });
        if (response && typeof response.enabled === 'boolean') {
            updateAnalyzerToggleUI(response.enabled);
            persistAnalyzerState(response.enabled);
            return;
        }
        updateAnalyzerToggleUI(true);
        persistAnalyzerState(true);
    }
    
    async function initializeAnalyzerToggleState() {
        try {
            const stored = await storageCompat.get(['analyzerConfig']);
            const config = stored?.analyzerConfig;
            if (config && typeof config.analysisEnabled === 'boolean') {
                const desiredState = config.analysisEnabled;
                updateAnalyzerToggleUI(desiredState);
                await sendRuntimeMessage({ action: 'SET_ANALYSIS_ENABLED', enabled: desiredState });
                return;
            }
        } catch (error) {
            console.warn('⚠️ Erro ao carregar estado da análise do storage:', error);
        }
        await syncAnalyzerToggleStatus();
    }

    function updateAnalyzerToggleUI(isActive, options = {}) {
        const previousState = analyzerActive;
        analyzerActive = !!isActive;
        const opts = options || {};
        const shouldLog = !!opts.log;
        const logSource = typeof opts.source === 'string' && opts.source.trim().length
            ? opts.source.trim()
            : 'Painel';
        
        const toggleBtn = document.getElementById('toggleAnalyzerBtn');
        if (!toggleBtn) return;
        toggleBtn.classList.toggle('active', analyzerActive);
        const label = toggleBtn.querySelector('.toggle-label');
        if (label) {
            label.textContent = analyzerActive ? 'Análise ativa' : 'Ativar análise';
        }
        toggleBtn.title = analyzerActive ? 'Desativar análises' : 'Ativar análises';
        
        if (shouldLog && previousState !== analyzerActive) {
            logAnalyzerToggleStatus(analyzerActive, logSource);
        }
    }

    async function handleAnalyzerToggle() {
        if (analyzerToggleBusy) return;
        analyzerToggleBusy = true;
        const toggleBtn = document.getElementById('toggleAnalyzerBtn');
        if (toggleBtn) toggleBtn.classList.add('loading');
        const targetState = !analyzerActive;
        try {
            const response = await sendRuntimeMessage({ action: 'SET_ANALYSIS_ENABLED', enabled: targetState });
            const success = response && response.status === 'ok';
            if (success) {
                updateAnalyzerToggleUI(targetState, { log: true, source: 'Botão "Ativar análise"' });
                await persistAnalyzerState(targetState);
                if (targetState) {
                    analyzerAutoPausedReason = null;
                }
                showToast(targetState ? 'Análises ativadas' : 'Análises pausadas', 1800);
            } else {
                showToast(targetState ? 'Não foi possível ativar as análises' : 'Não foi possível pausar as análises', 2200);
                await syncAnalyzerToggleStatus();
            }
        } finally {
            analyzerToggleBusy = false;
            if (toggleBtn) toggleBtn.classList.remove('loading');
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // 🎯 CRIAR MODAL DE VISUALIZAÇÃO DO BANCO DE PADRÕES
    // ═══════════════════════════════════════════════════════════════════════════════
    function createBankPatternsModal() {
        console.log('ℹ️ Banco de padrões visual desativado nesta versão.');
        return;
        const modalHTML = `
            <div id="bankPatternsModal" class="bank-patterns-modal" style="display: none;">
                <div class="bank-patterns-modal-overlay"></div>
                <div class="bank-patterns-modal-content">
                    <div class="bank-patterns-modal-header">
                        <h3>📂 Banco de Padrões (<span id="bankModalPatternsCount">0</span>)</h3>
                        <button class="bank-patterns-modal-close" id="closeBankPatternsModal">✕</button>
                    </div>
                    
                    <div class="bank-patterns-filters">
                        <input type="text" id="bankPatternSearch" placeholder="🔍 Filtrar padrões..." class="bank-pattern-search-input">
                        <select id="bankPatternFilter" class="bank-pattern-filter-select">
                            <option value="all">Todos</option>
                            <option value="high">Alta (≥80%)</option>
                            <option value="medium">Média (60-79%)</option>
                            <option value="low">Baixa (<60%)</option>
                        </select>
                        </div>
                        
                    <div class="bank-patterns-modal-body">
                        <div id="bankPatternsList"></div>
                            </div>
                </div>
                        </div>
                        
            <div id="patternDetailsModal" class="bank-patterns-modal" style="display: none;">
                <div class="bank-patterns-modal-overlay"></div>
                <div class="bank-patterns-modal-content">
                    <div class="bank-patterns-modal-header">
                        <h3>📊 Ocorrências do Padrão</h3>
                        <button class="bank-patterns-modal-close" id="closePatternDetailsModal">✕</button>
                            </div>
                    
                    <div class="bank-patterns-modal-body">
                        <div id="patternDetailsContent"></div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Event listeners - Modal principal
        const modal = document.getElementById('bankPatternsModal');
        const closeBtn = document.getElementById('closeBankPatternsModal');
        const overlay = modal.querySelector('.bank-patterns-modal-overlay');
        const searchInput = document.getElementById('bankPatternSearch');
        const filterSelect = document.getElementById('bankPatternFilter');
        
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        
        overlay.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        
        // Filtros em tempo real
        searchInput.addEventListener('input', () => {
            renderBankPatterns();
        });
        
        filterSelect.addEventListener('change', () => {
            renderBankPatterns();
        });
        
        // Event listeners - Modal de detalhes
        const detailsModal = document.getElementById('patternDetailsModal');
        const closeDetailsBtn = document.getElementById('closePatternDetailsModal');
        const detailsOverlay = detailsModal.querySelector('.bank-patterns-modal-overlay');
        
        closeDetailsBtn.addEventListener('click', () => {
            detailsModal.style.display = 'none';
        });
        
        detailsOverlay.addEventListener('click', () => {
            detailsModal.style.display = 'none';
        });
        
        console.log('✅ Modal do Banco de Padrões criado');
        
        // Adicionar CSS específico para o banco de padrões
        const style = document.createElement('style');
        style.textContent = `
            .view-patterns-btn {
                padding: 8px 12px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: #fff;
                border: 1px solid rgba(102, 126, 234, 0.5);
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
                font-weight: 600;
                transition: all 0.2s ease;
                white-space: nowrap;
            }
            
            .view-patterns-btn:hover {
                background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
                box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
                transform: translateY(-1px);
            }
            
            .view-patterns-btn:active {
                transform: translateY(0);
            }
            
            .bank-patterns-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 999999;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .bank-patterns-modal-overlay {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.85);
            }
            
            .bank-patterns-modal-content {
                position: relative;
                background: #0f1f2a;
                border: 2px solid #ff003f;
                border-radius: 8px;
                max-width: 420px;
                width: 95%;
                max-height: 90vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.8);
                z-index: 1;
            }
            
            .bank-patterns-modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 16px;
                background: linear-gradient(135deg, #1a2c38 0%, #0f1f2a 100%);
                border-bottom: 2px solid #ff003f;
            }
            
            .bank-patterns-modal-header h3 {
                margin: 0;
                color: #fff;
                font-size: 16px;
                font-weight: 700;
            }
            
            .bank-patterns-modal-close {
                background: transparent;
                border: 1px solid #ff003f;
                color: #ff003f;
                width: 28px;
                height: 28px;
                border-radius: 4px;
                font-size: 18px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
            }
            
            .bank-patterns-modal-close:hover {
                background: #ff003f;
                color: #fff;
                transform: scale(1.05);
            }
            
            .bank-patterns-filters {
                display: flex;
                gap: 8px;
                padding: 12px;
                background: #1a2c38;
                border-bottom: 1px solid #2a3c48;
            }
            
            .bank-pattern-search-input {
                flex: 1;
                padding: 8px;
                background: #0f1f2a;
                border: 1px solid #2a3c48;
                border-radius: 4px;
                color: #fff;
                font-size: 12px;
            }
            
            .bank-pattern-filter-select {
                padding: 8px;
                background: #0f1f2a;
                border: 1px solid #2a3c48;
                border-radius: 4px;
                color: #fff;
                font-size: 12px;
            }
            
            .bank-patterns-modal-body {
                flex: 1;
                overflow-y: auto;
                padding: 12px;
            }
            
            .bank-pattern-item {
                background: linear-gradient(135deg, #1a2c38 0%, #0f1f2a 100%);
                border: 1px solid #2a3c48;
                border-radius: 6px;
                margin-bottom: 10px;
                padding: 10px;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .bank-pattern-item:hover {
                border-color: #ff003f;
                box-shadow: 0 2px 8px rgba(255, 0, 63, 0.3);
                transform: translateY(-1px);
            }
            
            .bank-pattern-sequence-row {
                display: flex;
                align-items: center;
                gap: 3px;
                margin-bottom: 8px;
                flex-wrap: wrap;
            }
            
            .bank-pattern-sequence-row .spin-history-item-wrap {
                margin: 0;
            }
            
            .bank-pattern-sequence-row .spin-history-quadrado {
                width: 28px;
                height: 28px;
                font-size: 11px;
            }
            
            .bank-pattern-info-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 8px;
                margin-top: 6px;
                padding-top: 6px;
                border-top: 1px solid #2a3c48;
            }
            
            .bank-pattern-info-item {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
            }
            
            .bank-pattern-info-label {
                font-size: 9px;
                color: #8da2bb;
                font-weight: 600;
            }
            
            .bank-pattern-info-value {
                font-size: 11px;
                color: #fff;
                font-weight: 700;
            }
            
            .bank-pattern-info-value.conf-high {
                color: #2ecc71;
            }
            
            .bank-pattern-info-value.conf-medium {
                color: #f39c12;
            }
            
            .bank-pattern-info-value.conf-low {
                color: #e74c3c;
            }
            
            .btn-delete-bank-pattern {
                background: transparent;
                color: #ff003f;
                border: 1px solid #ff003f;
                border-radius: 4px;
                padding: 4px 10px;
                cursor: pointer;
                font-size: 10px;
                font-weight: 600;
                transition: all 0.2s ease;
            }
            
            .btn-delete-bank-pattern:hover {
                background: #ff003f;
                color: #fff;
                transform: scale(1.05);
            }
            
            .custom-pattern-modal-body .diamond-level-title {
                font-size: 11px;
                font-weight: 600;
                color: #00d4ff;
                margin-bottom: 4px;
                display: block;
            }
            
            .custom-pattern-modal-body .diamond-level-note {
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                gap: 2px;
                font-size: 8px !important;
                font-weight: 400;
                font-family: 'Inter', 'Segoe UI', sans-serif;
                color: rgba(200, 214, 233, 0.56) !important;
                margin: 4px 0 4px 0;
                line-height: 1.22;
                max-width: 100%;
            }

            .custom-pattern-modal-body .diamond-level-subnote {
                display: block;
                font-size: 8px !important;
                font-weight: 400;
                font-family: 'Inter', 'Segoe UI', sans-serif;
                color: rgba(200, 214, 233, 0.56) !important;
                margin-top: 3px;
                line-height: 1.14;
            }
            
            .diamond-level-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                margin-bottom: 6px;
            }
            
            .diamond-level-switch {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
                user-select: none;
            }
            
            .diamond-level-switch input {
                display: none;
            }
            
            .diamond-level-switch .switch-track {
                position: relative;
                width: 34px;
                height: 18px;
                background: rgba(255, 255, 255, 0.18);
                border-radius: 999px;
                transition: background 0.2s ease;
            }
            
            .diamond-level-switch .switch-thumb {
                position: absolute;
                top: 2px;
                left: 2px;
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: #a8b5ff;
                transition: transform 0.2s ease, background 0.2s ease;
            }
            
            .diamond-level-switch .switch-label {
                font-size: 9px;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: rgba(200, 214, 233, 0.7);
                font-weight: 600;
            }
            
            .diamond-level-switch input:checked + .switch-track {
                background: rgba(0, 212, 255, 0.45);
            }
            
            .diamond-level-switch input:checked + .switch-track .switch-thumb {
                transform: translateX(16px);
                background: #00d4ff;
            }
            
            .diamond-level-switch input:checked ~ .switch-label {
                color: #00d4ff;
            }
            
            .diamond-level-field.level-disabled {
                opacity: 0.55;
            }
            
            .diamond-level-field.level-disabled .diamond-level-switch .switch-label {
                color: rgba(200, 214, 233, 0.4);
            }
            
            .diamond-level-field.level-disabled .diamond-level-title {
                color: rgba(0, 212, 255, 0.45);
            }
            
            .pattern-details-list {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            
            .pattern-occurrence-item {
                background: linear-gradient(135deg, #1a2c38 0%, #0f1f2a 100%);
                border: 1px solid #2a3c48;
                border-radius: 6px;
                padding: 12px;
            }
            
            .occurrence-timestamp {
                font-size: 11px;
                color: #8da2bb;
                margin-bottom: 8px;
                font-weight: 600;
            }
        `;
        document.head.appendChild(style);
    }

    function createDiamondLevelsModal() {
        if (document.getElementById('diamondLevelsModal')) return;
        const modalHTML = `
            <div id="diamondLevelsModal" class="custom-pattern-modal" style="display: none;">
                <div class="custom-pattern-modal-overlay"></div>
                <div class="custom-pattern-modal-content">
                    <div class="custom-pattern-modal-header">
                        <h3>Configurar Níveis Diamante</h3>
                        <button class="custom-pattern-modal-close" id="closeDiamondLevelsModal">Fechar</button>
                    </div>
                    <div class="custom-pattern-modal-body">
                        <div class="diamond-level-field" data-level="n0">
                            <div class="diamond-level-header">
                                <div class="diamond-level-title">N0 - Detector de Branco</div>
                                <label class="diamond-level-switch">
                                    <input type="checkbox" class="diamond-level-toggle-input" id="diamondLevelToggleN0" checked />
                                    <span class="switch-track"><span class="switch-thumb"></span></span>
                                    <span class="switch-label">ATIVO</span>
                                </label>
                            </div>
                            <div class="diamond-level-note">
                                Roda 1000 estratégias em janelas NÃO-sobrepostas para detectar BRANCO com alta confiança. Pode bloquear todos os demais níveis quando a probabilidade é alta.
                            </div>
                            <div class="diamond-level-double">
                                <div>
                                    <span>Histórico analisado (N)</span>
                                    <input type="number" id="diamondN0History" min="500" max="5000" value="2000" />
                                    <span class="diamond-level-subnote">
                                        Recomendado: 2000 giros (mín. 500 • máx. 5000)
                                    </span>
                                </div>
                                <div>
                                    <span>Tamanho da janela W (giros)</span>
                                    <input type="number" id="diamondN0Window" min="25" max="250" value="100" />
                                    <span class="diamond-level-subnote">
                                        Recomendado: 100 giros (mín. 25 • máx. 250)
                                    </span>
                                </div>
                            </div>
                            <label class="checkbox-label" style="margin-top: 10px;">
                                <input type="checkbox" id="diamondN0AllowBlockAll" checked />
                                Permitir bloqueio total (BLOCK ALL) — desmarque para usar apenas como alerta
                            </label>
                        </div>
                        <div class="diamond-level-field" data-level="n1">
                            <div class="diamond-level-header">
                                <div class="diamond-level-title">N1 - Padrão Quente (giros analisados)</div>
                                <label class="diamond-level-switch">
                                    <input type="checkbox" class="diamond-level-toggle-input" id="diamondLevelToggleN1" checked />
                                    <span class="switch-track"><span class="switch-thumb"></span></span>
                                    <span class="switch-label">ATIVO</span>
                                </label>
                            </div>
                            <div class="diamond-level-note">
                                Busca padrões que se repetem no histórico. Valores menores = mais ágil porém menos estável. Valores maiores = mais robusto porém menos sensível.
                            </div>
                            <input type="number" id="diamondN1HotPattern" min="12" max="200" value="60" />
                            <span class="diamond-level-subnote">
                                Recomendado: 60 giros para equilíbrio entre estabilidade e agilidade
                            </span>
                        </div>
                        <div class="diamond-level-field" data-level="n2">
                            <div class="diamond-level-header">
                                <div class="diamond-level-title">N2 - Momentum</div>
                                <label class="diamond-level-switch">
                                    <input type="checkbox" class="diamond-level-toggle-input" id="diamondLevelToggleN2" checked />
                                    <span class="switch-track"><span class="switch-thumb"></span></span>
                                    <span class="switch-label">ATIVO</span>
                                </label>
                            </div>
                            <div class="diamond-level-note">
                                Detecta aceleração comparando giros recentes com anteriores. Quanto menor a diferença entre janelas, mais rápido detecta mudanças.
                            </div>
                            <div class="diamond-level-double">
                                <div>
                                    <span>Janela recente</span>
                                    <input type="number" id="diamondN2Recent" min="2" max="20" value="5" />
                                    <span class="diamond-level-subnote">
                                        Últimos giros (recomendado: 5)
                                    </span>
                                </div>
                                <div>
                                    <span>Janela anterior</span>
                                    <input type="number" id="diamondN2Previous" min="3" max="200" value="15" />
                                    <span class="diamond-level-subnote">
                                        Base de comparação (deve ser > recente)
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div class="diamond-level-field" data-level="n3">
                            <div class="diamond-level-header">
                                <div class="diamond-level-title">N3 - Alternância (janela)</div>
                                <label class="diamond-level-switch">
                                    <input type="checkbox" class="diamond-level-toggle-input" id="diamondLevelToggleN3" checked />
                                    <span class="switch-track"><span class="switch-thumb"></span></span>
                                    <span class="switch-label">ATIVO</span>
                                </label>
                            </div>
                            <div class="diamond-level-note">
                Motor inteligente baseado em n-grams: reconhece sequências reais e só vota quando a probabilidade condicional histórica está acima do limiar configurado.
                            </div>
            <div class="diamond-level-double">
                <div>
                    <span>Histórico analisado (giros)</span>
                    <input type="number" id="diamondN3Alternance" min="1" value="12" />
                            <span class="diamond-level-subnote">
                        Recomendado: 50-80 giros (mín. 1)
                            </span>
                        </div>
                <div>
                    <span>Comprimento da janela L</span>
                    <input type="number" id="diamondN3PatternLength" min="3" max="8" value="4" />
                    <span class="diamond-level-subnote">
                        Padrão comparado (ex.: L=4 → 🔴⚫🔴⚫)
                    </span>
                </div>
            </div>
            <div class="diamond-level-double">
                <div>
                    <span>Rigor mínimo (%)</span>
                    <input type="number" id="diamondN3ThresholdPct" min="50" max="95" value="75" />
                    <span class="diamond-level-subnote">
                        Probabilidade mínima exigida para votar
                    </span>
                </div>
                <div>
                    <span>Ocorrências mínimas</span>
                    <input type="number" id="diamondN3MinOccurrences" min="1" max="50" value="1" />
                    <span class="diamond-level-subnote">
                        Janela precisa aparecer pelo menos N vezes
                    </span>
                </div>
            </div>
            <label class="checkbox-label" style="margin-top: 6px;">
                <input type="checkbox" id="diamondN3AllowBackoff" />
                Permitir backoff (tentar janelas menores quando faltar histórico)
            </label>
            <label class="checkbox-label" style="margin-top: 4px;">
                <input type="checkbox" id="diamondN3IgnoreWhite" />
                Ignorar previsões de <strong>branco</strong> (força voto NULO ao invés de WHITE)
            </label>
                        </div>
                        <div class="diamond-level-field" data-level="n4">
                            <div class="diamond-level-header">
                                <div class="diamond-level-title">N4 - Persistência / Ciclos (janela)</div>
                                <label class="diamond-level-switch">
                                    <input type="checkbox" class="diamond-level-toggle-input" id="diamondLevelToggleN4" checked />
                                    <span class="switch-track"><span class="switch-thumb"></span></span>
                                    <span class="switch-label">ATIVO</span>
                                </label>
                            </div>
                            <div class="diamond-level-note">
                                Analisa sequências consecutivas da mesma cor para prever continuação ou reversão. Janelas maiores = análise de ciclos mais longos.
                            </div>
                            <input type="number" id="diamondN4Persistence" min="20" max="120" value="20" />
                            <span class="diamond-level-subnote">
                                Recomendado: 20-40 giros para detectar padrões de persistência
                            </span>
                        </div>
                        <div class="diamond-level-field" data-level="n5">
                            <div class="diamond-level-header">
                                <div class="diamond-level-title">N5 - Ritmo por Giro (amostras)</div>
                                <label class="diamond-level-switch">
                                    <input type="checkbox" class="diamond-level-toggle-input" id="diamondLevelToggleN5" checked />
                                    <span class="switch-track"><span class="switch-thumb"></span></span>
                                    <span class="switch-label">ATIVO</span>
                                </label>
                            </div>
                            <div class="diamond-level-note">
                                Detecta viés temporal por minuto e posição do giro (1º ou 2º giro de cada minuto). Mais amostras = análise mais confiável porém menos sensível.
                            </div>
                            <input type="number" id="diamondN5MinuteBias" min="10" max="200" value="60" />
                            <span class="diamond-level-subnote">
                                Recomendado: 60 amostras para equilibrar confiabilidade e sensibilidade
                            </span>
                        </div>
                        <div class="diamond-level-field" data-level="n6">
                            <div class="diamond-level-header">
                                <div class="diamond-level-title">N6 - Retração Histórica (janela)</div>
                                <label class="diamond-level-switch">
                                    <input type="checkbox" class="diamond-level-toggle-input" id="diamondLevelToggleN6" checked />
                                    <span class="switch-track"><span class="switch-thumb"></span></span>
                                    <span class="switch-label">ATIVO</span>
                                </label>
                            </div>
                            <div class="diamond-level-note">
                                Verifica se a sequência atual está próxima do máximo histórico, prevendo reversão ou continuação. Janelas maiores = contexto mais amplo.
                            </div>
                            <input type="number" id="diamondN6Retracement" min="30" max="120" value="80" />
                            <span class="diamond-level-subnote">
                                Recomendado: 80 giros para análise robusta de retração
                            </span>
                        </div>
                        <div class="diamond-level-field" data-level="n7">
                            <div class="diamond-level-header">
                                <div class="diamond-level-title">N7 - Continuidade Global</div>
                                <label class="diamond-level-switch">
                                    <input type="checkbox" class="diamond-level-toggle-input" id="diamondLevelToggleN7" checked />
                                    <span class="switch-track"><span class="switch-thumb"></span></span>
                                    <span class="switch-label">ATIVO</span>
                                </label>
                            </div>
                            <div class="diamond-level-note">
                                Avalia se as decisões recentes da IA mantêm consistência com o histórico de acertos. Ajuda a calibrar confiança baseada em performance real.
                            </div>
                            <div class="diamond-level-double">
                                <div>
                                    <span>Decisões analisadas</span>
                                    <input type="number" id="diamondN7DecisionWindow" min="10" max="50" value="20" />
                                    <span class="diamond-level-subnote">
                                        Últimas decisões avaliadas (rec: 20)
                                    </span>
                                </div>
                                <div>
                                    <span>Histórico base (giros)</span>
                                    <input type="number" id="diamondN7HistoryWindow" min="50" max="200" value="100" />
                                    <span class="diamond-level-subnote">
                                        Total de decisões de referência (≥ decisões analisadas)
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div class="diamond-level-field" data-level="n8">
                            <div class="diamond-level-header">
                                <div class="diamond-level-title">N8 - Walk-forward não-sobreposto</div>
                                <label class="diamond-level-switch">
                                    <input type="checkbox" class="diamond-level-toggle-input" id="diamondLevelToggleN8" checked />
                                    <span class="switch-track"><span class="switch-thumb"></span></span>
                                    <span class="switch-label">ATIVO</span>
                                </label>
                            </div>
                            <div class="diamond-level-note">
                                Testa diversas estratégias em janelas NÃO-sobrepostas para escolher a melhor combinação e aplicar na janela mais recente, sem olhar o futuro.
                            </div>
                            <div class="diamond-level-double">
                                <div>
                                    <span>Histórico base (giros)</span>
                                    <input type="number" id="diamondN10History" min="100" max="2000" value="500" />
                                    <span class="diamond-level-subnote">
                                        Total de giros usados no walk-forward (ex.: 500, 1000, 2000)
                                    </span>
                                </div>
                                <div>
                                    <span>Tamanho da janela W (giros)</span>
                                    <input type="number" id="diamondN10Window" min="5" max="50" value="20" />
                                    <span class="diamond-level-subnote">
                                        Giros por janela NÃO-sobreposta. Recomendado: 20.
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div class="diamond-level-field" data-level="n9">
                            <div class="diamond-level-header">
                                <div class="diamond-level-title">N9 - Barreira Final (janela)</div>
                                <label class="diamond-level-switch">
                                    <input type="checkbox" class="diamond-level-toggle-input" id="diamondLevelToggleN9" checked />
                                    <span class="switch-track"><span class="switch-thumb"></span></span>
                                    <span class="switch-label">ATIVO</span>
                                </label>
                            </div>
                            <div class="diamond-level-note">
                                Última validação de segurança: verifica se a sequência prevista tem precedente histórico. Valores maiores = filtro mais rigoroso, menos sinais porém mais seguros.
                            </div>
                            <input type="number" id="diamondN8Barrier" min="1" value="50" />
                            <span class="diamond-level-subnote">
                                Recomendado: 50 giros para filtro equilibrado de segurança
                            </span>
                        </div>
                        <div class="diamond-level-field" data-level="n10">
                            <div class="diamond-level-header">
                                <div class="diamond-level-title">N10 - Calibração Bayesiana</div>
                                <label class="diamond-level-switch">
                                    <input type="checkbox" class="diamond-level-toggle-input" id="diamondLevelToggleN10" checked />
                                    <span class="switch-track"><span class="switch-thumb"></span></span>
                                    <span class="switch-label">ATIVO</span>
                                </label>
                            </div>
                            <div class="diamond-level-note">
                                Calcula probabilidades reais de cada cor (🔴/⚫/⚪) usando estatística bayesiana. Ajusta a força dos outros níveis e só vota quando há diferença significativa entre cores.
                            </div>
                            <div class="diamond-level-double">
                                <div>
                                    <span>Histórico base</span>
                                    <input type="number" id="diamondN9History" min="30" max="400" value="100" />
                                    <span class="diamond-level-subnote">
                                        Giros usados no cálculo de probabilidades (rec: 100)
                                    </span>
                                </div>
                                <div>
                                    <span>Limiar nulo (%)</span>
                                    <input type="number" id="diamondN9NullThreshold" min="2" max="20" value="8" />
                                    <span class="diamond-level-subnote">
                                        Diferença mínima para votar (abaixo = voto nulo)
                                    </span>
                                </div>
                            </div>
                            <div class="diamond-level-double">
                                <div>
                                    <span>Força do prior</span>
                                    <input type="number" id="diamondN9PriorStrength" step="0.1" min="0.2" max="5" value="1" />
                                    <span class="diamond-level-subnote">
                                        Peso do histórico geral: maior = mais conservador
                                    </span>
                                </div>
                                <div style="font-size: 11px; color: #8da2bb; padding-top: 8px;">
                                    Prior Dirichlet: α = [prior, prior, prior × 0.5]<br>
                                    Branco tem metade do peso por ser mais raro
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="custom-pattern-modal-footer">
                        <button class="btn-secondary" id="diamondLevelsCancelBtn">Cancelar</button>
                        <button class="btn-hot-pattern" id="diamondLevelsSaveBtn">Salvar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const modal = document.getElementById('diamondLevelsModal');
        const closeBtn = document.getElementById('closeDiamondLevelsModal');
        const cancelBtn = document.getElementById('diamondLevelsCancelBtn');
        const overlay = modal.querySelector('.custom-pattern-modal-overlay');
        const closeModal = () => { modal.style.display = 'none'; };
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', closeModal);
        initializeDiamondLevelToggles();
    }

    function updateDiamondLevelToggleVisual(toggle) {
        if (!toggle) return;
        const field = toggle.closest('.diamond-level-field');
        if (field) {
            field.classList.toggle('level-disabled', !toggle.checked);
        }
        const label = field ? field.querySelector('.switch-label') : null;
        if (label) {
            label.textContent = toggle.checked ? 'ATIVO' : 'INATIVO';
        }
    }

    function initializeDiamondLevelToggles() {
        const toggles = document.querySelectorAll('.diamond-level-toggle-input');
        toggles.forEach(toggle => {
            if (!toggle.dataset.listenerAttached) {
                toggle.addEventListener('change', () => updateDiamondLevelToggleVisual(toggle));
                toggle.dataset.listenerAttached = '1';
            }
            updateDiamondLevelToggleVisual(toggle);
        });
    }

    function refreshDiamondLevelToggleStates() {
        const toggles = document.querySelectorAll('.diamond-level-toggle-input');
        toggles.forEach(updateDiamondLevelToggleVisual);
    }

    function populateDiamondLevelsForm(config) {
        const windows = (config && config.diamondLevelWindows) || {};
        const legacyKeyMap = {
            n6RetracementWindow: 'n8RetracementWindow',
            n7DecisionWindow: 'n10DecisionWindow',
            n7HistoryWindow: 'n10HistoryWindow',
            n8Barrier: 'n6Barrier',
            n0History: 'n0TotalHistory',
            n0Window: 'n0WindowSize'
        };
        const getValue = (key, def) => {
            const direct = Number(windows[key]);
            if (Number.isFinite(direct) && direct > 0) return direct;
            const legacyKey = legacyKeyMap[key];
            if (legacyKey) {
                const legacyValue = Number(windows[legacyKey]);
                if (Number.isFinite(legacyValue) && legacyValue > 0) return legacyValue;
            }
            return def;
        };
        const setInput = (id, value) => {
            const input = document.getElementById(id);
            if (input) input.value = value;
        };
        const setCheckbox = (id, value) => {
            const input = document.getElementById(id);
            if (input) input.checked = !!value;
        };
        const getBoolean = (key, def) => {
            if (Object.prototype.hasOwnProperty.call(windows, key)) {
                const raw = windows[key];
                if (typeof raw === 'boolean') return raw;
                if (typeof raw === 'string') {
                    const lowered = raw.toLowerCase();
                    if (lowered === 'true') return true;
                    if (lowered === 'false') return false;
                }
                const numeric = Number(raw);
                if (Number.isFinite(numeric)) {
                    return numeric > 0;
                }
            }
            return def;
        };
        setInput('diamondN0History', getValue('n0History', DIAMOND_LEVEL_DEFAULTS.n0History));
        setInput('diamondN0Window', getValue('n0Window', DIAMOND_LEVEL_DEFAULTS.n0Window));
        const allowBlockCheckbox = document.getElementById('diamondN0AllowBlockAll');
        if (allowBlockCheckbox) {
            if (config && Object.prototype.hasOwnProperty.call(config, 'n0AllowBlockAll')) {
                allowBlockCheckbox.checked = !!config.n0AllowBlockAll;
            } else {
                allowBlockCheckbox.checked = true;
            }
        }
        setInput('diamondN1HotPattern', getValue('n1HotPattern', DIAMOND_LEVEL_DEFAULTS.n1HotPattern));
        setInput('diamondN2Recent', getValue('n2Recent', DIAMOND_LEVEL_DEFAULTS.n2Recent));
        setInput('diamondN2Previous', getValue('n2Previous', DIAMOND_LEVEL_DEFAULTS.n2Previous));
        setInput('diamondN3Alternance', getValue('n3Alternance', DIAMOND_LEVEL_DEFAULTS.n3Alternance));
        setInput('diamondN3PatternLength', getValue('n3PatternLength', DIAMOND_LEVEL_DEFAULTS.n3PatternLength));
        setInput('diamondN3ThresholdPct', getValue('n3ThresholdPct', DIAMOND_LEVEL_DEFAULTS.n3ThresholdPct));
        setInput('diamondN3MinOccurrences', getValue('n3MinOccurrences', DIAMOND_LEVEL_DEFAULTS.n3MinOccurrences));
        setCheckbox('diamondN3AllowBackoff', getBoolean('n3AllowBackoff', DIAMOND_LEVEL_DEFAULTS.n3AllowBackoff));
        setCheckbox('diamondN3IgnoreWhite', getBoolean('n3IgnoreWhite', DIAMOND_LEVEL_DEFAULTS.n3IgnoreWhite));
        setInput('diamondN4Persistence', getValue('n4Persistence', DIAMOND_LEVEL_DEFAULTS.n4Persistence));
        setInput('diamondN5MinuteBias', getValue('n5MinuteBias', DIAMOND_LEVEL_DEFAULTS.n5MinuteBias));
        setInput('diamondN6Retracement', getValue('n6RetracementWindow', DIAMOND_LEVEL_DEFAULTS.n6RetracementWindow));
        setInput('diamondN7DecisionWindow', getValue('n7DecisionWindow', DIAMOND_LEVEL_DEFAULTS.n7DecisionWindow));
        setInput('diamondN7HistoryWindow', getValue('n7HistoryWindow', DIAMOND_LEVEL_DEFAULTS.n7HistoryWindow));
        setInput('diamondN8Barrier', getValue('n8Barrier', DIAMOND_LEVEL_DEFAULTS.n8Barrier));
        setInput('diamondN9History', getValue('n9History', DIAMOND_LEVEL_DEFAULTS.n9History));
        setInput('diamondN9NullThreshold', getValue('n9NullThreshold', DIAMOND_LEVEL_DEFAULTS.n9NullThreshold));
        setInput('diamondN9PriorStrength', getValue('n9PriorStrength', DIAMOND_LEVEL_DEFAULTS.n9PriorStrength));
        setInput('diamondN10Window', getValue('n10Window', DIAMOND_LEVEL_DEFAULTS.n10Window));
        setInput('diamondN10History', getValue('n10History', DIAMOND_LEVEL_DEFAULTS.n10History));

        const enabledConfig = (config && config.diamondLevelEnabled) || {};
        const getEnabled = (key) => {
            if (Object.prototype.hasOwnProperty.call(enabledConfig, key)) {
                return !!enabledConfig[key];
            }
            return !!DIAMOND_LEVEL_ENABLE_DEFAULTS[key];
        };
        const setToggle = (id, key) => {
            const toggle = document.getElementById(id);
            if (toggle) {
                toggle.checked = getEnabled(key);
            }
        };
        setToggle('diamondLevelToggleN0', 'n0');
        setToggle('diamondLevelToggleN1', 'n1');
        setToggle('diamondLevelToggleN2', 'n2');
        setToggle('diamondLevelToggleN3', 'n3');
        setToggle('diamondLevelToggleN4', 'n4');
        setToggle('diamondLevelToggleN5', 'n5');
        setToggle('diamondLevelToggleN6', 'n6');
        setToggle('diamondLevelToggleN7', 'n7');
        setToggle('diamondLevelToggleN8', 'n8');
        setToggle('diamondLevelToggleN9', 'n9');
        setToggle('diamondLevelToggleN10', 'n10');
        initializeDiamondLevelToggles();
        refreshDiamondLevelToggleStates();
    }

    function openDiamondLevelsModal() {
        const modal = document.getElementById('diamondLevelsModal');
        if (!modal) return;
        storageCompat.get(['analyzerConfig']).then(res => {
            populateDiamondLevelsForm(res.analyzerConfig || {});
            const container = document.getElementById('blaze-double-analyzer');
            const content = modal.querySelector('.custom-pattern-modal-content');
            if (container && content) {
                const rect = container.getBoundingClientRect();
                content.style.maxWidth = `${rect.width}px`;
                content.style.width = '100%';
            }
            modal.style.display = 'flex';
        }).catch(() => {
            populateDiamondLevelsForm({});
            const container = document.getElementById('blaze-double-analyzer');
            const content = modal.querySelector('.custom-pattern-modal-content');
            if (container && content) {
                const rect = container.getBoundingClientRect();
                content.style.maxWidth = `${rect.width}px`;
                content.style.width = '100%';
            }
            modal.style.display = 'flex';
        });
    }

    async function saveDiamondLevels() {
        const modal = document.getElementById('diamondLevelsModal');
        const getNumber = (id, min, max, fallback) => {
            const el = document.getElementById(id);
            if (!el) return fallback;
            let value = Number(el.value);
            if (!Number.isFinite(value)) value = fallback;
            if (Number.isFinite(min)) {
                value = Math.max(min, value);
            }
            if (Number.isFinite(max)) {
                value = Math.min(max, value);
            }
            return value;
        };
        const getToggleValue = (id, fallback = true) => {
            const el = document.getElementById(id);
            if (!el) return fallback;
            return !!el.checked;
        };
        const getCheckboxValue = (id, fallback = false) => {
            const el = document.getElementById(id);
            if (!el) return fallback;
            return !!el.checked;
        };
        const newWindows = {
            n0History: getNumber('diamondN0History', 500, 5000, DIAMOND_LEVEL_DEFAULTS.n0History),
            n0Window: getNumber('diamondN0Window', 25, 250, DIAMOND_LEVEL_DEFAULTS.n0Window),
            n1HotPattern: getNumber('diamondN1HotPattern', 12, 200, DIAMOND_LEVEL_DEFAULTS.n1HotPattern),
            n2Recent: getNumber('diamondN2Recent', 2, 20, DIAMOND_LEVEL_DEFAULTS.n2Recent),
            n2Previous: getNumber('diamondN2Previous', 3, 200, DIAMOND_LEVEL_DEFAULTS.n2Previous),
            n3Alternance: getNumber('diamondN3Alternance', 1, null, DIAMOND_LEVEL_DEFAULTS.n3Alternance),
            n3PatternLength: getNumber('diamondN3PatternLength', 3, 8, DIAMOND_LEVEL_DEFAULTS.n3PatternLength),
            n3ThresholdPct: getNumber('diamondN3ThresholdPct', 50, 95, DIAMOND_LEVEL_DEFAULTS.n3ThresholdPct),
            n3MinOccurrences: getNumber('diamondN3MinOccurrences', 1, 50, DIAMOND_LEVEL_DEFAULTS.n3MinOccurrences),
            n3AllowBackoff: getCheckboxValue('diamondN3AllowBackoff', DIAMOND_LEVEL_DEFAULTS.n3AllowBackoff),
            n3IgnoreWhite: getCheckboxValue('diamondN3IgnoreWhite', DIAMOND_LEVEL_DEFAULTS.n3IgnoreWhite),
            n4Persistence: getNumber('diamondN4Persistence', 20, 120, DIAMOND_LEVEL_DEFAULTS.n4Persistence),
            n5MinuteBias: getNumber('diamondN5MinuteBias', 10, 200, DIAMOND_LEVEL_DEFAULTS.n5MinuteBias),
            n6RetracementWindow: getNumber('diamondN6Retracement', 30, 120, DIAMOND_LEVEL_DEFAULTS.n6RetracementWindow),
            n7DecisionWindow: getNumber('diamondN7DecisionWindow', 10, 50, DIAMOND_LEVEL_DEFAULTS.n7DecisionWindow),
            n7HistoryWindow: getNumber('diamondN7HistoryWindow', 50, 200, DIAMOND_LEVEL_DEFAULTS.n7HistoryWindow),
            n8Barrier: getNumber('diamondN8Barrier', 1, null, DIAMOND_LEVEL_DEFAULTS.n8Barrier),
            n9History: getNumber('diamondN9History', 30, 400, DIAMOND_LEVEL_DEFAULTS.n9History),
            n9NullThreshold: getNumber('diamondN9NullThreshold', 2, 20, DIAMOND_LEVEL_DEFAULTS.n9NullThreshold),
            n9PriorStrength: getNumber('diamondN9PriorStrength', 0.2, 5, DIAMOND_LEVEL_DEFAULTS.n9PriorStrength),
            n10Window: getNumber('diamondN10Window', 5, 50, DIAMOND_LEVEL_DEFAULTS.n10Window),
            n10History: getNumber('diamondN10History', 100, 2000, DIAMOND_LEVEL_DEFAULTS.n10History)
        };
        const newEnabled = {
            n0: getToggleValue('diamondLevelToggleN0', DIAMOND_LEVEL_ENABLE_DEFAULTS.n0),
            n1: getToggleValue('diamondLevelToggleN1', DIAMOND_LEVEL_ENABLE_DEFAULTS.n1),
            n2: getToggleValue('diamondLevelToggleN2', DIAMOND_LEVEL_ENABLE_DEFAULTS.n2),
            n3: getToggleValue('diamondLevelToggleN3', DIAMOND_LEVEL_ENABLE_DEFAULTS.n3),
            n4: getToggleValue('diamondLevelToggleN4', DIAMOND_LEVEL_ENABLE_DEFAULTS.n4),
            n5: getToggleValue('diamondLevelToggleN5', DIAMOND_LEVEL_ENABLE_DEFAULTS.n5),
            n6: getToggleValue('diamondLevelToggleN6', DIAMOND_LEVEL_ENABLE_DEFAULTS.n6),
            n7: getToggleValue('diamondLevelToggleN7', DIAMOND_LEVEL_ENABLE_DEFAULTS.n7),
            n8: getToggleValue('diamondLevelToggleN8', DIAMOND_LEVEL_ENABLE_DEFAULTS.n8),
            n9: getToggleValue('diamondLevelToggleN9', DIAMOND_LEVEL_ENABLE_DEFAULTS.n9),
            n10: getToggleValue('diamondLevelToggleN10', DIAMOND_LEVEL_ENABLE_DEFAULTS.n10)
        };

        if (newWindows.n2Previous <= newWindows.n2Recent) {
            alert('A janela anterior do Momentum (N2) deve ser maior que a janela recente.');
            return;
        }

        if (newWindows.n7HistoryWindow < newWindows.n7DecisionWindow) {
            alert('O histórico base do N7 deve ser maior ou igual ao número de decisões analisadas.');
            return;
        }

        const allowBlockCheckbox = document.getElementById('diamondN0AllowBlockAll');
        const allowBlockAll = allowBlockCheckbox ? !!allowBlockCheckbox.checked : true;

        try {
            const storageData = await storageCompat.get(['analyzerConfig']);
            const currentConfig = storageData.analyzerConfig || {};
            const updatedConfig = {
                ...currentConfig,
                diamondLevelWindows: {
                    ...(currentConfig.diamondLevelWindows || {}),
                    ...newWindows
                },
                diamondLevelEnabled: {
                    ...currentConfig.diamondLevelEnabled,
                    ...newEnabled
                },
                minuteSpinWindow: newWindows.n5MinuteBias,
                n0AllowBlockAll: allowBlockAll
            };

            await storageCompat.set({ analyzerConfig: updatedConfig });
            try {
                chrome.runtime.sendMessage({ action: 'applyConfig' });
            } catch (error) {
                console.warn('⚠️ Não foi possível notificar background sobre nova configuração dos níveis:', error);
            }
            const shouldSync = getSyncConfigPreference();
            if (shouldSync) {
                try {
                    await syncConfigToServer(updatedConfig);
                } catch (syncError) {
                    console.warn('⚠️ Erro ao sincronizar configurações dos níveis com o servidor:', syncError);
                }
            }
            if (modal) modal.style.display = 'none';
            showToast('Configuração dos níveis atualizada!', 2200);
        } catch (err) {
            console.error('❌ Erro ao salvar configurações dos níveis diamante:', err);
            alert('Não foi possível salvar as configurações dos níveis. Tente novamente.');
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // 🎯 RENDERIZAR LISTA DE PADRÕES DO BANCO
    // ═══════════════════════════════════════════════════════════════════════════════
    function renderBankPatterns() {
        if (!document.getElementById('bankPatternsModal')) {
            return;
        }
        console.log('📂 Renderizando lista de padrões do banco...');
        
        const allData = JSON.parse(localStorage.getItem('blazeAnalyzerData') || '{}');
        const db = allData.patternDB || { patterns_found: [] };
        const patterns = db.patterns_found || [];
        
        const listContainer = document.getElementById('bankPatternsList');
        const countElement = document.getElementById('bankModalPatternsCount');
        const searchInput = document.getElementById('bankPatternSearch');
        const filterSelect = document.getElementById('bankPatternFilter');
        
        if (!listContainer) return;
        
        // Aplicar filtros
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        const filterType = filterSelect ? filterSelect.value : 'all';
        
        const filteredPatterns = patterns.filter(p => {
            // Filtro de busca
            if (searchTerm) {
                const patternStr = (p.pattern || []).join('-').toLowerCase();
                const triggerStr = (p.triggerColor || '').toLowerCase();
                if (!patternStr.includes(searchTerm) && !triggerStr.includes(searchTerm)) {
                    return false;
                }
            }
            
            // Filtro de confiança
            const conf = p.confidence || 0;
            if (filterType === 'high' && conf < 80) return false;
            if (filterType === 'medium' && (conf < 60 || conf >= 80)) return false;
            if (filterType === 'low' && conf >= 60) return false;
            
            return true;
        });
        
        // Atualizar contador
        if (countElement) {
            countElement.textContent = filteredPatterns.length;
        }
        
        // Renderizar lista
        if (filteredPatterns.length === 0) {
            listContainer.innerHTML = `
                <div style="padding: 40px; text-align: center; color: #8da2bb; font-size: 14px;">
                    ${searchTerm || filterType !== 'all' ? '🔍 Nenhum padrão encontrado com os filtros aplicados' : '📂 Banco vazio - clique em "Buscar Padrões" para descobrir'}
                            </div>
            `;
            return;
        }
        
        // Ordenar por confiança (maior primeiro)
        filteredPatterns.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
        
        // ✅ RENDERIZAR PADRÕES COM OS MESMOS ÍCONES DO HISTÓRICO
        const patternsHTML = filteredPatterns.map((p, patternIndex) => {
            const pattern = p.pattern || [];
            const trigger = p.triggerColor || 'N/A';
            const conf = p.confidence || 0;
            const occurrences = p.occurrences || 0;
            
            // Classe de confiança
            let confClass = 'conf-low';
            if (conf >= 80) confClass = 'conf-high';
            else if (conf >= 60) confClass = 'conf-medium';
            
            // ✅ ORDEM INVERSA: Cor de Disparo → Padrão (sentido correto do histórico)
            // Renderizar sequência com os mesmos ícones do histórico
            const sequenceHTML = pattern.map((color, idx) => {
                const isWhite = color === 'white';
                const number = isWhite ? 0 : (color === 'red' ? Math.floor(Math.random() * 7) + 1 : Math.floor(Math.random() * 7) + 8); // Mock number
                return `
                    <div class="spin-history-item-wrap">
                        <div class="spin-history-quadrado ${color}">
                            ${isWhite ? blazeWhiteSVG(14) : `<span>${number}</span>`}
                        </div>
                                </div>
                `;
            }).join('');
            
            // Ícone do trigger (cor de disparo) - COM NÚMERO REAL
            const triggerNumber = trigger === 'white' ? 0 : (trigger === 'red' ? Math.floor(Math.random() * 7) + 1 : Math.floor(Math.random() * 7) + 8);
            const triggerHTML = trigger !== 'N/A' ? `
                <div class="spin-history-item-wrap" title="Cor de Disparo">
                    <div class="spin-history-quadrado ${trigger}" style="opacity: 0.7; border: 2px dashed rgba(255, 255, 255, 0.5);">
                        ${trigger === 'white' ? blazeWhiteSVG(14) : `<span>${triggerNumber}</span>`}
                            </div>
                        </div>
            ` : '';
            
            // Última ocorrência com horário
            const lastOccurrence = p.lastOccurrence || Date.now();
            const lastDate = new Date(lastOccurrence);
            const lastTime = lastDate.toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            return `
                <div class="bank-pattern-item" onclick="showPatternDetails(${patternIndex})" data-pattern-index="${patternIndex}">
                    <div class="bank-pattern-sequence-row">
                        ${triggerHTML}
                        ${trigger !== 'N/A' && pattern.length > 0 ? '<span style="color: #ff003f; font-weight: bold; margin: 0 2px; font-size: 14px;">→</span>' : ''}
                        ${sequenceHTML}
                                    </div>
                    
                    <div class="bank-pattern-info-row">
                        <div class="bank-pattern-info-item">
                            <span class="bank-pattern-info-label">Ocorrências</span>
                            <span class="bank-pattern-info-value">${occurrences}x</span>
                                    </div>
                        <div class="bank-pattern-info-item">
                            <span class="bank-pattern-info-label">Confiança</span>
                            <span class="bank-pattern-info-value ${confClass}">${conf.toFixed(1)}%</span>
                                </div>
                        <div class="bank-pattern-info-item">
                            <span class="bank-pattern-info-label">Última</span>
                            <span class="bank-pattern-info-value" style="font-size: 9px;">${lastTime}</span>
                            </div>
                        <button class="btn-delete-bank-pattern" onclick="event.stopPropagation(); deleteBankPattern(${patternIndex})">
                            Excluir
                        </button>
                        </div>
                </div>
            `;
        }).join('');
        
        listContainer.innerHTML = patternsHTML;
        
        console.log(`✅ ${filteredPatterns.length} padrões renderizados`);
    }
    // ═══════════════════════════════════════════════════════════════════════════════
    // 👁️ MOSTRAR DETALHES DE UM PADRÃO ESPECÍFICO (ÚLTIMAS 5 OCORRÊNCIAS)
    // ═══════════════════════════════════════════════════════════════════════════════
    window.showPatternDetails = async function(patternIndex) {
        if (!document.getElementById('patternDetailsModal')) {
            console.log('ℹ️ Visualização de detalhes de padrões está desativada.');
            return;
        }
        console.log(`👁️ Mostrando detalhes do padrão índice ${patternIndex}...`);
        
        const allData = JSON.parse(localStorage.getItem('blazeAnalyzerData') || '{}');
        const db = allData.patternDB || { patterns_found: [] };
        const patterns = db.patterns_found || [];
        
        // Aplicar os mesmos filtros para encontrar o padrão correto
        const searchInput = document.getElementById('bankPatternSearch');
        const filterSelect = document.getElementById('bankPatternFilter');
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        const filterType = filterSelect ? filterSelect.value : 'all';
        
        const filteredPatterns = patterns.filter(p => {
            if (searchTerm) {
                const patternStr = (p.pattern || []).join('-').toLowerCase();
                const triggerStr = (p.triggerColor || '').toLowerCase();
                if (!patternStr.includes(searchTerm) && !triggerStr.includes(searchTerm)) {
                    return false;
                }
            }
            const conf = p.confidence || 0;
            if (filterType === 'high' && conf < 80) return false;
            if (filterType === 'medium' && (conf < 60 || conf >= 80)) return false;
            if (filterType === 'low' && conf >= 60) return false;
            return true;
        });
        
        filteredPatterns.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
        
        const pattern = filteredPatterns[patternIndex];
        if (!pattern) {
            console.error('❌ Padrão não encontrado!');
            return;
        }
        
        // Abrir modal de detalhes
        const detailsModal = document.getElementById('patternDetailsModal');
        const detailsContent = document.getElementById('patternDetailsContent');
        
        if (!detailsModal || !detailsContent) {
            console.error('❌ Modal de detalhes não encontrado!');
            return;
        }
        
        // ✅ BUSCAR HISTÓRICO COMPLETO PARA ENCONTRAR AS OCORRÊNCIAS REAIS
        chrome.runtime.sendMessage({ action: 'getFullHistory' }, function(response) {
            const history = response?.history || [];
            console.log(`📊 Histórico completo: ${history.length} giros`);
            
            // Buscar últimas 5 ocorrências do padrão no histórico
            const occurrences = findPatternOccurrences(history, pattern.pattern, pattern.triggerColor, 5);
            
            // ✅ RENDERIZAR PADRÃO E ÚLTIMAS 5 OCORRÊNCIAS
            const occurrencesHTML = `
                <div class="pattern-details-summary">
                    <h4 style="color: #ff003f; margin: 0 0 10px 0; font-size: 14px;">Padrão:</h4>
                    <div class="bank-pattern-sequence-row" style="margin-bottom: 12px; justify-content: center;">
                        ${pattern.pattern.map((color, idx) => {
                            const isWhite = color === 'white';
                            const number = isWhite ? 0 : (color === 'red' ? Math.floor(Math.random() * 7) + 1 : Math.floor(Math.random() * 7) + 8);
                            return `
                                <div class="spin-history-item-wrap">
                                    <div class="spin-history-quadrado ${color}">
                                        ${isWhite ? blazeWhiteSVG(14) : `<span>${number}</span>`}
                    </div>
                </div>
                            `;
                        }).join('')}
                    </div>
                    <div style="display: flex; justify-content: space-around; margin-bottom: 16px; padding: 10px; background: #1a2c38; border-radius: 6px;">
                        <div style="text-align: center;">
                            <div style="font-size: 9px; color: #8da2bb;">Ocorrências</div>
                            <div style="font-size: 14px; color: #fff; font-weight: bold;">${pattern.occurrences}x</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 9px; color: #8da2bb;">Confiança</div>
                            <div style="font-size: 14px; color: ${pattern.confidence >= 80 ? '#2ecc71' : pattern.confidence >= 60 ? '#f39c12' : '#e74c3c'}; font-weight: bold;">${pattern.confidence.toFixed(1)}%</div>
                        </div>
                        </div>
                    </div>
                    
                <h4 style="color: #ff003f; margin: 16px 0 10px 0; font-size: 14px;">Últimas 5 Ocorrências:</h4>
                <div class="pattern-details-list">
                    ${occurrences.length > 0 ? occurrences.map((occ, idx) => `
                        <div class="pattern-occurrence-item">
                            <div class="occurrence-timestamp">${occ.timestamp}</div>
                            <div class="bank-pattern-sequence-row">
                                ${occ.spins.map(spin => `
                                    <div class="spin-history-item-wrap">
                                        <div class="spin-history-quadrado ${spin.color}">
                                            ${spin.color === 'white' ? blazeWhiteSVG(14) : `<span>${spin.number}</span>`}
                    </div>
                                        <div class="spin-history-time">${spin.time}</div>
                </div>
                                `).join('')}
                            </div>
                        </div>
                    `).join('') : `
                        <div style="padding: 20px; text-align: center; color: #8da2bb; font-size: 12px;">
                            📂 Histórico insuficiente para exibir ocorrências
                        </div>
                    `}
            </div>
        `;
        
            detailsContent.innerHTML = occurrencesHTML;
            detailsModal.style.display = 'flex';
            
            console.log(`✅ Modal de detalhes aberto com ${occurrences.length} ocorrências`);
        });
    };
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // 🔍 ENCONTRAR OCORRÊNCIAS DE UM PADRÃO NO HISTÓRICO
    // ═══════════════════════════════════════════════════════════════════════════════
    function findPatternOccurrences(history, patternColors, triggerColor, maxOccurrences = 5) {
        const occurrences = [];
        const patternLength = patternColors.length;
        
        // Percorrer histórico do mais recente para o mais antigo
        for (let i = 0; i < history.length - patternLength; i++) {
            // Verificar se a cor de disparo bate
            if (triggerColor && triggerColor !== 'N/A') {
                if (i > 0 && history[i - 1].color !== triggerColor) {
                    continue;
                }
            }
            
            // Verificar se o padrão bate
            let matches = true;
            for (let j = 0; j < patternLength; j++) {
                if (history[i + j].color !== patternColors[j]) {
                    matches = false;
                    break;
                }
            }
            
            if (matches) {
                // Encontrou uma ocorrência! Coletar os spins
                const spins = [];
                
                // Adicionar cor de disparo se houver
                if (triggerColor && triggerColor !== 'N/A' && i > 0) {
                    const triggerSpin = history[i - 1];
                    spins.push({
                        number: triggerSpin.number,
                        color: triggerSpin.color,
                        time: new Date(triggerSpin.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    });
                }
                
                // Adicionar os spins do padrão
                for (let j = 0; j < patternLength; j++) {
                    const spin = history[i + j];
                    spins.push({
                        number: spin.number,
                        color: spin.color,
                        time: new Date(spin.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    });
                }
                
                occurrences.push({
                    timestamp: new Date(history[i].timestamp).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    }),
                    spins: spins
                });
                
                if (occurrences.length >= maxOccurrences) break;
            }
        }
        
        return occurrences;
    }
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // 🗑️ DELETAR PADRÃO DO BANCO
    // ═══════════════════════════════════════════════════════════════════════════════
    window.deleteBankPattern = function(index) {
        if (!document.getElementById('bankPatternsModal')) {
            console.log('ℹ️ Exclusão via modal do banco de padrões está desativada.');
            return;
        }
        console.log(`🗑️ Deletando padrão do banco (índice ${index})...`);
        
        // Confirmar exclusão
        if (!confirm('❌ Tem certeza que deseja deletar este padrão?\n\nEsta ação não pode ser desfeita.')) {
            return;
        }
        
        try {
            // Carregar padrões atuais
            const allData = JSON.parse(localStorage.getItem('blazeAnalyzerData') || '{}');
            const db = allData.patternDB || { patterns_found: [] };
            const patterns = db.patterns_found || [];
            
            // Aplicar filtros para encontrar o padrão correto
            const searchInput = document.getElementById('bankPatternSearch');
            const filterSelect = document.getElementById('bankPatternFilter');
            const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
            const filterType = filterSelect ? filterSelect.value : 'all';
            
            const filteredPatterns = patterns.filter(p => {
                // Filtro de busca
                if (searchTerm) {
                    const patternStr = (p.pattern || []).join('-').toLowerCase();
                    const triggerStr = (p.triggerColor || '').toLowerCase();
                    if (!patternStr.includes(searchTerm) && !triggerStr.includes(searchTerm)) {
                        return false;
                    }
                }
                
                // Filtro de confiança
                const conf = p.confidence || 0;
                if (filterType === 'high' && conf < 80) return false;
                if (filterType === 'medium' && (conf < 60 || conf >= 80)) return false;
                if (filterType === 'low' && conf >= 60) return false;
                
                return true;
            });
            
            // Ordenar igual à renderização
            filteredPatterns.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
            
            // Encontrar o padrão no array ORIGINAL (não filtrado)
            const patternToDelete = filteredPatterns[index];
            if (!patternToDelete) {
                console.error('❌ Padrão não encontrado!');
                alert('❌ Erro: Padrão não encontrado');
                return;
            }
            
            const originalIndex = patterns.findIndex(p => 
                JSON.stringify(p.pattern) === JSON.stringify(patternToDelete.pattern) &&
                p.triggerColor === patternToDelete.triggerColor &&
                p.confidence === patternToDelete.confidence
            );
            
            if (originalIndex === -1) {
                console.error('❌ Padrão não encontrado no array original!');
                alert('❌ Erro: Padrão não encontrado');
                return;
            }
            
            console.log(`🎯 Padrão encontrado no índice original: ${originalIndex}`);
            console.log('📋 Padrão:', patternToDelete);
            
            // Remover padrão
            patterns.splice(originalIndex, 1);
            
            // Salvar de volta
            db.patterns_found = patterns;
            allData.patternDB = db;
            localStorage.setItem('blazeAnalyzerData', JSON.stringify(allData));
        
            console.log(`✅ Padrão deletado! Total restante: ${patterns.length}`);
            
            // Atualizar UI
            renderBankPatterns();
            loadPatternBank();
            
            // Notificar sucesso
            alert(`✅ Padrão deletado com sucesso!\n\nTotal de padrões: ${patterns.length}`);
            
        } catch (error) {
            console.error('❌ Erro ao deletar padrão:', error);
            alert('❌ Erro ao deletar padrão. Veja o console para detalhes.');
        }
    };
    
    // Criar modal de padrões customizados
    function createCustomPatternModal() {
        const btnHotPattern = document.getElementById('btnHotPattern');
        if (!btnHotPattern) {
            console.warn('⚠️ Elemento do Padrão Quente não encontrado (custom patterns removidos)');
            return;
        }
        
        // Garantir aparência/estado padrão
        btnHotPattern.classList.add('active');
        btnHotPattern.style.cursor = 'default';
        btnHotPattern.title = 'Padrão Quente gerenciado automaticamente';
        
        // Atualizar estado local e exibir status
        setHotPatternState(true);
        showHotPatternStatus('searching');
        
        // Notificar background para manter o modo ativo
        chrome.runtime.sendMessage({ action: 'enableHotPattern' });
        
        // Solicitar análise inicial após pequeno atraso
        setTimeout(() => {
            chrome.runtime.sendMessage({ action: 'requestImmediateAnalysis' });
        }, 500);
        
        console.log('🔥 Padrão Quente inicializado (modelos customizados desativados)');
    }
    
    // Configurar listeners do modal
    function setupCustomPatternModalListeners() {
        const modal = document.getElementById('customPatternModal');
        const closeBtn = document.getElementById('closeCustomPatternModal');
        const cancelBtn = document.getElementById('cancelCustomPattern');
        const saveBtn = document.getElementById('saveCustomPattern');
        const addColorBtn = document.getElementById('addColorToSequence');
        const overlay = modal.querySelector('.custom-pattern-modal-overlay');
        
        // Fechar modal
        closeBtn.addEventListener('click', () => closeCustomPatternModal());
        cancelBtn.addEventListener('click', () => closeCustomPatternModal());
        overlay.addEventListener('click', () => closeCustomPatternModal());
        
        // Adicionar cor à sequência
        addColorBtn.addEventListener('click', () => showColorPicker());
        
        // Salvar modelo
        saveBtn.addEventListener('click', () => saveCustomPatternModel());
        
        // Botão "Adicionar Modelo" na sidebar
        setTimeout(() => {
            const btnAdd = document.getElementById('btnAddCustomPattern');
            if (btnAdd) {
                btnAdd.addEventListener('click', () => openCustomPatternModal());
            }
            
            // Botão "Ver Padrões Ativos"
            const btnView = document.getElementById('btnViewCustomPatterns');
            if (btnView) {
                btnView.addEventListener('click', () => {
                    const modal = document.getElementById('viewPatternsModal');
                    if (modal) {
                        modal.style.display = 'flex';
                        
                        // ✅ CENTRALIZAR MODAL COM BASE NA POSIÇÃO DA EXTENSÃO (com delay para renderização)
                        setTimeout(() => {
                            const sidebar = document.getElementById('blaze-double-analyzer');
                            if (sidebar) {
                                const rect = sidebar.getBoundingClientRect();
                                const modalContent = modal.querySelector('.custom-pattern-modal-content');
                                
                                if (modalContent) {
                                    // Centralizar horizontalmente com a sidebar
                                    const sidebarCenterX = rect.left + (rect.width / 2);
                                    const modalWidth = modalContent.offsetWidth || 500;
                                    let leftPosition = sidebarCenterX - (modalWidth / 2);
                                    
                                    // Garantir que o modal não saia da tela
                                    const margin = 20;
                                    if (leftPosition < margin) leftPosition = margin;
                                    if (leftPosition + modalWidth > window.innerWidth - margin) {
                                        leftPosition = window.innerWidth - modalWidth - margin;
                                    }
                                    
                                    // Centralizar verticalmente na tela
                                    const modalHeight = modalContent.offsetHeight || 400;
                                    let topPosition = (window.innerHeight - modalHeight) / 2;
                                    if (topPosition < margin) topPosition = margin;
                                    
                                    modalContent.style.left = leftPosition + 'px';
                                    modalContent.style.top = topPosition + 'px';
                                    modalContent.style.transform = 'none';
                                }
                            }
                        }, 10);
                    }
                });
            }
            
            // Botão "🔥 Padrão Quente" - SEMPRE ATIVO E AUTOMÁTICO
            const btnHotPattern = document.getElementById('btnHotPattern');
            if (btnHotPattern) {
                // ATIVAR AUTOMATICAMENTE ao carregar
                btnHotPattern.classList.add('active');
                setHotPatternState(true);
                
                // Mostrar "Buscando..."
                showHotPatternStatus('searching');
                
                console.log('🔥 Modo Padrão Quente ATIVADO AUTOMATICAMENTE');
                
                // Notificar background.js
                chrome.runtime.sendMessage({ 
                    action: 'enableHotPattern' 
                });
                
                // Buscar padrão AUTOMATICAMENTE após 500ms
                setTimeout(() => {
                    console.log('📡 Solicitando análise automática inicial...');
                    chrome.runtime.sendMessage({ 
                        action: 'requestImmediateAnalysis' 
                    });
                }, 500);
                
                // Remover funcionalidade de clique (agora é sempre ativo)
                btnHotPattern.style.cursor = 'default';
                btnHotPattern.title = 'Padrão Quente sempre ativo (atualiza automaticamente)';
            }
        }, 100);
    }
    
    // Abrir modal
    function openCustomPatternModal() {
        const modal = document.getElementById('customPatternModal');
        modal.style.display = 'flex';
        
        // Resetar campos
        document.getElementById('customPatternName').value = '';
        document.getElementById('customPatternSequence').innerHTML = '';
        document.querySelectorAll('input[name="beforeColor"]').forEach(radio => {
            radio.checked = radio.value === 'red-white'; // ✅ Padrão: Vermelho ou Branco
        });
        
        // ✅ Carregar preferência de sincronização
        const syncCheckbox = document.getElementById('syncPatternToAccount');
        if (syncCheckbox) {
            syncCheckbox.checked = getSyncPatternPreference();
            console.log(`🔄 Preferência de sincronização carregada: ${syncCheckbox.checked ? 'ATIVADA' : 'DESATIVADA'}`);
        }
        
        console.log('🎯 Modal de padrão customizado aberto');
    }
    
    // Fechar modal
    function closeCustomPatternModal() {
        const modal = document.getElementById('customPatternModal');
        modal.style.display = 'none';
        
        // Resetar botão de salvar (remover modo edição)
        const saveBtn = document.getElementById('saveCustomPattern');
        if (saveBtn) {
            saveBtn.textContent = '💾 Salvar Modelo';
            saveBtn.removeAttribute('data-editing-id');
        }
        
        console.log('❌ Modal de padrão customizado fechado');
    }
    
    // Mostrar seletor de cor
    function showColorPicker() {
        const sequenceDiv = document.getElementById('customPatternSequence');
        
        // Criar popup temporário para escolher cor (com quadradinhos visuais)
        const colorPickerHTML = `
            <div class="color-picker-popup">
                <button class="color-choice-visual red" data-color="red">
                    <span class="spin-color-circle red"></span>
                </button>
                <button class="color-choice-visual black" data-color="black">
                    <span class="spin-color-circle black"></span>
                </button>
                <button class="color-choice-visual white" data-color="white">
                    <span class="spin-color-circle white"></span>
                </button>
            </div>
        `;
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = colorPickerHTML;
        const popup = tempDiv.firstElementChild;
        
        // Posicionar popup
        sequenceDiv.appendChild(popup);
        
        // Event listeners para escolha de cor
        popup.querySelectorAll('.color-choice-visual').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color;
                addColorToSequence(color);
                popup.remove();
            });
        });
    }
    
    // Adicionar cor à sequência
    function addColorToSequence(color) {
        const sequenceDiv = document.getElementById('customPatternSequence');
        
        const colorBadge = document.createElement('div');
        colorBadge.className = `sequence-color-item ${color}`;
        colorBadge.dataset.color = color;
        colorBadge.innerHTML = `<span class="spin-color-circle-small ${color}"></span>`;
        
        // Adicionar evento de clique para remover (ao invés de botão visível)
        colorBadge.addEventListener('click', function() {
            this.remove();
        });
        
        sequenceDiv.appendChild(colorBadge);
        
        console.log(`➕ Cor ${color} adicionada à sequência`);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // 🌐 API HELPER - SINCRONIZAÇÃO COM SERVIDOR
      // ═══════════════════════════════════════════════════════════════
      // 🌐 CONFIGURAÇÃO DE URLs - DUAS APIS SEPARADAS
      // ═══════════════════════════════════════════════════════════════
      
      const API_URLS = {
          // API de Giros (coleta, histórico, padrões de análise)
          giros: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
              ? 'http://localhost:3001'
              : 'https://blaze-giros-api-v2-sx14.onrender.com',
          
          // API de Autenticação (usuários, admin, padrões customizados)
          auth: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
              ? 'http://localhost:3000'
              : 'https://blaze-analyzer-api-v2-z8s3.onrender.com'
      };
      
      // Obter URL da API de Giros
      function getGirosApiUrl() {
          return API_URLS.giros;
      }
      
      // Obter URL da API de Auth (para compatibilidade com código antigo)
      function getApiUrl() {
          return API_URLS.auth;
      }

    // ═══════════════════════════════════════════════════════════════════════════════
    // 💾 ADAPTADOR DE STORAGE (chrome.storage.local ou fallback em localStorage)
    // ═══════════════════════════════════════════════════════════════════════════════

    const hasChromeStorage = typeof chrome !== 'undefined' &&
                             chrome?.storage &&
                             chrome.storage?.local;

    function deserializeFromLocalStorage(rawValue, fallbackValue = undefined) {
        if (rawValue === null || rawValue === undefined) return fallbackValue;
        try {
            return JSON.parse(rawValue);
        } catch (error) {
            console.warn('⚠️ Não foi possível converter valor do localStorage. Retornando bruto.', error);
            return rawValue;
        }
    }

    function serializeForLocalStorage(value) {
        try {
            return JSON.stringify(value);
        } catch (error) {
            console.error('❌ Não foi possível serializar valor para o localStorage:', error);
            return JSON.stringify(null);
        }
    }

    function fallbackStorageGet(request) {
        const result = {};

        if (Array.isArray(request)) {
            request.forEach((key) => {
                result[key] = deserializeFromLocalStorage(localStorage.getItem(key));
            });
        } else if (typeof request === 'string') {
            result[request] = deserializeFromLocalStorage(localStorage.getItem(request));
        } else if (request && typeof request === 'object') {
            Object.keys(request).forEach((key) => {
                const stored = localStorage.getItem(key);
                result[key] = stored === null || stored === undefined
                    ? request[key]
                    : deserializeFromLocalStorage(stored);
            });
        }

        return result;
    }

    function fallbackStorageSet(items) {
        if (!items || typeof items !== 'object') return;
        Object.entries(items).forEach(([key, value]) => {
            localStorage.setItem(key, serializeForLocalStorage(value));
        });
    }

    function fallbackStorageRemove(keys) {
        if (Array.isArray(keys)) {
            keys.forEach((key) => localStorage.removeItem(key));
        } else if (typeof keys === 'string') {
            localStorage.removeItem(keys);
        }
    }

    const storageCompat = {
        async get(request) {
            if (hasChromeStorage) {
                return await new Promise((resolve, reject) => {
                    try {
                        chrome.storage.local.get(request, (items) => {
                            const err = chrome.runtime?.lastError;
                            if (err) {
                                console.error('❌ Erro em chrome.storage.local.get:', err);
                                reject(new Error(err.message || err));
                            } else {
                                resolve(items);
                            }
                        });
                    } catch (error) {
                        reject(error);
                    }
                });
            }

            const fallback = fallbackStorageGet(request);
            return fallback;
        },

        async set(items) {
            if (hasChromeStorage) {
                return await new Promise((resolve, reject) => {
                    try {
                        chrome.storage.local.set(items, () => {
                            const err = chrome.runtime?.lastError;
                            if (err) {
                                console.error('❌ Erro em chrome.storage.local.set:', err);
                                reject(new Error(err.message || err));
                            } else {
                                resolve(true);
                            }
                        });
                    } catch (error) {
                        reject(error);
                    }
                });
            }

            fallbackStorageSet(items);
            return true;
        },

        async remove(keys) {
            if (hasChromeStorage) {
                return await new Promise((resolve, reject) => {
                    try {
                        chrome.storage.local.remove(keys, () => {
                            const err = chrome.runtime?.lastError;
                            if (err) {
                                console.error('❌ Erro em chrome.storage.local.remove:', err);
                                reject(new Error(err.message || err));
                            } else {
                                resolve(true);
                            }
                        });
                    } catch (error) {
                        reject(error);
                    }
                });
            }

            fallbackStorageRemove(keys);
            return true;
        }
    };

const autoBetHistoryStore = (() => {
    let cache = [];
    let initialized = false;
    const listeners = new Set();

    async function init() {
        if (initialized) return cache;
        try {
            const stored = await storageCompat.get([AUTO_BET_HISTORY_KEY]);
            const raw = stored[AUTO_BET_HISTORY_KEY];
            cache = Array.isArray(raw) ? raw : [];
        } catch (error) {
            console.warn('AutoBetHistory: falha ao carregar histórico:', error);
            cache = [];
        }
        initialized = true;
        return cache;
    }

    function getSnapshot() {
        return cache.map(item => ({
            ...item,
            stages: Array.isArray(item.stages)
                ? item.stages.map(stage => ({ ...stage }))
                : []
        }));
    }

    function clamp() {
        if (cache.length > AUTO_BET_HISTORY_LIMIT) {
            cache = cache.slice(0, AUTO_BET_HISTORY_LIMIT);
        }
    }

    function persist() {
        storageCompat.set({ [AUTO_BET_HISTORY_KEY]: cache })
            .catch(err => console.warn('AutoBetHistory: falha ao salvar histórico:', err));
    }

    function notify() {
        const snapshot = getSnapshot();
        listeners.forEach(listener => {
            try {
                listener(snapshot);
            } catch (error) {
                console.warn('AutoBetHistory: listener falhou:', error);
            }
        });
    }

    function upsert(record) {
        if (!record || !record.id) return;
        const nextRecord = {
            status: 'pending',
            stages: [],
            createdAt: Date.now(),
            totalColorInvested: 0,
            totalWhiteInvested: 0,
            ...record
        };
        const idx = cache.findIndex(item => item.id === nextRecord.id);
        if (idx >= 0) {
            cache[idx] = { ...cache[idx], ...nextRecord };
        } else {
            cache.unshift(nextRecord);
        }
        clamp();
        persist();
        notify();
    }

    function patch(id, updater) {
        if (!id || typeof updater !== 'function') return;
        const idx = cache.findIndex(item => item.id === id);
        if (idx === -1) return;
        const current = cache[idx];
        const draft = {
            ...current,
            stages: Array.isArray(current.stages)
                ? current.stages.map(stage => ({ ...stage }))
                : []
        };
        const next = updater(draft);
        if (!next) return;
        cache[idx] = { ...current, ...next };
        clamp();
        persist();
        notify();
    }

    function subscribe(listener) {
        if (typeof listener !== 'function') return () => {};
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    function clear() {
        cache = [];
        persist();
        notify();
    }

    return {
        init,
        getAll: () => getSnapshot(),
        upsert,
        patch,
        subscribe,
        clear
    };
})();

autoBetHistoryStore.init().catch(error => console.warn('AutoBetHistory: inicialização antecipada falhou:', error));

    // ═══════════════════════════════════════════════════════════════════════════════
    // 🎯 AUTOAPOSTA - CONTROLADOR LOCAL
    // ═══════════════════════════════════════════════════════════════════════════════
    const autoBetManager = (() => {
        let config = { ...AUTO_BET_DEFAULTS };
        let runtime = { ...AUTO_BET_RUNTIME_DEFAULTS };
        let uiRefs = null;
        const betCardRefs = {
            red: {},
            black: {},
            white: {}
        };
        const betCardState = {
            red: { stage: '—', amount: 0, active: false },
            black: { stage: '—', amount: 0, active: false },
            white: { stage: '—', amount: 0, active: false }
        };
        const betCardEntries = {
            red: [],
            black: [],
            white: []
        };
        const betCardLosses = {
            red: [],
            black: [],
            white: []
        };
        const betCardResetTimers = {
            red: null,
            black: null,
            white: null
        };
        let pendingTimeouts = [];
        let isExecuting = false;
        let storageListenerAttached = false;
        let stylesInjected = false;
        let lastHandledAnalysisSignature = null;

        const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
        const nativeValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

        const COLOR_INPUT_SELECTORS = {
            red: [
                'input[data-color="red"]',
                '.bet-input.red input',
                '.double__bet-input--red input',
                '.bet-input-wrapper.red input',
                '.color-card.red input',
                'input[name="bet_amount_red"]'
            ],
            black: [
                'input[data-color="black"]',
                '.bet-input.black input',
                '.double__bet-input--black input',
                '.bet-input-wrapper.black input',
                '.color-card.black input',
                'input[name="bet_amount_black"]'
            ],
            white: [
                'input[data-color="white"]',
                '.bet-input.white input',
                '.double__bet-input--white input',
                '.color-card.white input',
                'input[name="bet_amount_white"]'
            ]
        };

        const COLOR_BUTTON_SELECTORS = {
            red: [
                'button[data-color="red"]',
                '.bet-button.red',
                '.double__bet-button--red',
                '.color-card.red button'
            ],
            black: [
                'button[data-color="black"]',
                '.bet-button.black',
                '.double__bet-button--black',
                '.color-card.black button'
            ],
            white: [
                'button[data-color="white"]',
                '.bet-button.white',
                '.double__bet-button--white',
                '.color-card.white button'
            ]
        };

        init();

        return {
            onSidebarReady,
            handleAnalysis,
            handleEntriesUpdate,
            resetRuntime: () => resetRuntimeState(true),
            applyConfigOverride
        };

        async function init() {
            ensureStyles();
            await autoBetHistoryStore.init();
            await reloadConfig();
            await reloadRuntime();
            broadcastAutoBetAvailability();
            updateStatusUI();
            if (chrome?.storage?.onChanged && !storageListenerAttached) {
                chrome.storage.onChanged.addListener(handleStorageChange);
                storageListenerAttached = true;
            }
            window.__autoBetManager = window.__autoBetManager || {
                enable() { config.enabled = true; updateStatusUI('Ativado manualmente'); },
                disable() { config.enabled = false; updateStatusUI('Desativado manualmente'); }
            };
        }

        async function reloadConfig() {
            try {
                const stored = await storageCompat.get(['analyzerConfig']);
                config = sanitizeAutoBetConfig(stored?.analyzerConfig?.autoBetConfig);
                updateSimulationSnapshots();
                broadcastAutoBetAvailability();
            } catch (error) {
                console.warn('AutoBet: erro ao carregar configuração:', error);
                config = { ...AUTO_BET_DEFAULTS };
                updateSimulationSnapshots();
                broadcastAutoBetAvailability();
            }
        }

        async function reloadRuntime() {
            try {
                const stored = await storageCompat.get(['autoBetRuntime']);
                runtime = { ...AUTO_BET_RUNTIME_DEFAULTS, ...(stored.autoBetRuntime || {}) };
            } catch (error) {
                runtime = { ...AUTO_BET_RUNTIME_DEFAULTS };
            }
            updateSimulationSnapshots();
        }

        function persistRuntime(silent = false) {
            storageCompat.set({ autoBetRuntime: runtime }).catch(error => {
                if (!silent) {
                    console.warn('AutoBet: erro ao salvar estado:', error);
                }
            });
        }

        function handleStorageChange(changes, area) {
            if (area !== 'local') return;
            if (changes.analyzerConfig) {
                const newConfig = changes.analyzerConfig.newValue || {};
                config = sanitizeAutoBetConfig(newConfig.autoBetConfig);
                updateSimulationSnapshots();
                broadcastAutoBetAvailability();
                hydratePanel();
                updateStatusUI();
            }
            if (changes.autoBetRuntime) {
                runtime = { ...AUTO_BET_RUNTIME_DEFAULTS, ...(changes.autoBetRuntime.newValue || {}) };
                updateSimulationSnapshots();
                updateStatusUI();
            }
        }

        function getInitialBalanceValue() {
            // Se modo real estiver ativo e houver saldo da Blaze, usar o saldo real
            if (config.enabled) {
                try {
                    const savedSession = localStorage.getItem('blazeSession');
                    if (savedSession) {
                        const sessionData = JSON.parse(savedSession);
                        if (sessionData.user && sessionData.user.balance) {
                            const blazeBalance = parseFloat(sessionData.user.balance.replace(',', '.')) || 0;
                            return Math.max(0, blazeBalance);
                        }
                    }
                } catch (error) {
                    console.warn('⚠️ Erro ao buscar saldo da Blaze:', error);
                }
            }
            // Caso contrário, usar saldo simulado
            return Math.max(0, Number(config.simulationBankRoll) || AUTO_BET_DEFAULTS.simulationBankRoll);
        }

        function updateSimulationSnapshots() {
            const baseValue = getInitialBalanceValue();
            runtime.simulationBalanceBase = baseValue;
            runtime.simulationBalance = baseValue + (Number(runtime.profit) || 0);
        }

        function applyConfigOverride(newConfig = {}) {
            config = sanitizeAutoBetConfig({
                ...config,
                ...newConfig
            });
            if (typeof newConfig.whiteProtection === 'boolean') {
                config.whiteProtection = !!newConfig.whiteProtection;
            }
            updateSimulationSnapshots();
            broadcastAutoBetAvailability();
            hydratePanel();
            updateStatusUI();
            if (!config.whiteProtection) {
                setWhiteProtectionDisabled();
            } else if (!betCardState.white.active) {
                updateBetCard('white', {
                    stage: '—',
                    amountText: formatCurrency(0),
                    status: 'Aguardando sinal',
                    variant: null
                });
            }
            if (!config.inverseModeEnabled) {
                runtime.inverseNextBaseFactor = 1;
                runtime.inverseCycleBaseFactor = 1;
            }
        }

        function ensureStyles() {
            if (stylesInjected) return;
            const style = document.createElement('style');
            style.id = 'auto-bet-styles';
            style.textContent = `
                .auto-bet-summary {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    margin-bottom: 8px;
                    padding: 12px;
                    border: none;
                    border-radius: 4px;
                    background: #1a2332;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                }
                .auto-bet-summary.hidden {
                    display: none;
                }
                .auto-bet-summary-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 12px;
                }
                .auto-bet-summary-title {
                    font-size: 12px;
                    font-weight: 700;
                    letter-spacing: 0.6px;
                    text-transform: uppercase;
                    color: rgba(255, 255, 255, 0.75);
                }
                .auto-bet-summary-body {
                    display: flex;
                    align-items: stretch;
                    gap: 12px;
                }
                .auto-bet-active-bets {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 8px;
                    margin-top: 6px;
                }
                .bet-entry-card {
                    border-radius: 5px;
                    padding: 6px 10px;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    min-height: 46px;
                    border: none;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
                    transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
                    position: relative;
                    overflow: hidden;
                }
                .bet-entry-card::before,
                .bet-entry-card::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    border-radius: inherit;
                    pointer-events: none;
                    opacity: 0;
                    transition: opacity 0.2s ease;
                }
                .bet-entry-card::after {
                    background: rgba(0, 0, 0, 0.15);
                }
                .bet-entry-card .bet-entry-top {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 4px;
                }
                .bet-entry-card .bet-entry-amount {
                    font-size: 13px;
                    font-weight: 700;
                }
                .bet-entry-card .bet-entry-stage {
                    font-size: 9px;
                    font-weight: 700;
                    letter-spacing: 0.3px;
                    text-transform: uppercase;
                }
                .bet-entry-card .bet-entry-status {
                    font-size: 9.5px;
                    font-weight: 500;
                    opacity: 0.82;
                }
                .bet-entry-details {
                    font-size: 9px;
                    font-weight: 500;
                    opacity: 0.7;
                }
                .bet-entry-red {
                    background: linear-gradient(120deg, #f2415f, #d8223f);
                    color: #fff;
                }
                .bet-entry-white {
                    background: #fcfcfd;
                    color: #1b2735;
                    box-shadow: 0 3px 10px rgba(15, 23, 42, 0.2);
                }
                .bet-entry-black {
                    background: linear-gradient(120deg, #111827, #1e2a3d);
                    color: #e4efff;
                }
                .bet-entry-card.bet-result-pending {
                    border-color: rgba(0, 212, 255, 0.65);
                    box-shadow: 0 0 0 2px rgba(0, 212, 255, 0.35);
                }
                .bet-entry-card.bet-result-win {
                    background: linear-gradient(135deg, #1caf6c, #0f9a57);
                    color: #e3ffe8;
                    box-shadow: 0 0 10px rgba(16, 185, 129, 0.4);
                }
                .bet-entry-card.bet-result-loss {
                    background: linear-gradient(135deg, #b61b37, #8d142a);
                    color: #ffe4e6;
                    box-shadow: 0 0 10px rgba(244, 63, 94, 0.35);
                }
                .bet-entry-card.bet-result-win::before,
                .bet-entry-card.bet-result-loss::before {
                    display: none;
                }
                .bet-entry-card.bet-entry-active-red {
                    filter: saturate(0.8) brightness(0.9);
                }
                .bet-entry-card.bet-entry-active-black {
                    filter: brightness(1.1);
                }
                .bet-entry-card.bet-entry-active-white {
                    filter: brightness(0.9);
                }
                .auto-bet-summary-metrics {
                    flex: 1;
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
                    gap: 10px;
                }
                .auto-bet-summary-item {
                    background: #0f1720;
                    border: none;
                    border-radius: 3px;
                    padding: 8px 10px;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .auto-bet-summary-item span {
                    font-size: 10px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    color: #7d8597;
                }
                .auto-bet-summary-item span.positive-label {
                    color: #4caf50;
                }
                .auto-bet-summary-item span.negative-label {
                    color: #ef5350;
                }
                .auto-bet-summary-item span.neutral-label {
                    color: #f5f7ff;
                }
                .auto-bet-summary-item strong {
                    font-size: 13px;
                    color: #fff;
                }
                .auto-bet-summary-item strong.positive-value {
                    color: #4caf50;
                }
                .auto-bet-summary-item strong.negative-value {
                    color: #ef5350;
                }
                .auto-bet-summary-item strong.neutral-value {
                    color: #f5f7ff;
                }
                .auto-bet-hide-btn {
                    border: none;
                    background: none;
                    color: #7d8597;
                    font-size: 11px;
                    font-weight: 600;
                    letter-spacing: 0.3px;
                    text-transform: uppercase;
                    cursor: pointer;
                    transition: color 0.2s ease;
                    padding: 0;
                }
                .auto-bet-hide-btn:hover {
                    color: #ffffff;
                }
                .auto-bet-summary-collapsed {
                    display: none;
                    justify-content: center;
                    margin-bottom: 8px;
                }
                .auto-bet-summary-collapsed.visible {
                    display: flex;
                }
                .auto-bet-summary-collapsed button {
                    border: none;
                    background: #1a2332;
                    color: #e5e7eb;
                    font-size: 11px;
                    font-weight: 600;
                    letter-spacing: 0.3px;
                    text-transform: uppercase;
                    border-radius: 3px;
                    padding: 8px 24px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .auto-bet-summary-collapsed button:hover {
                    background: #0f1720;
                    color: #ffffff;
                }
                .auto-bet-actions {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    min-width: 64px;
                    align-items: stretch;
                }
                .auto-bet-config-launcher {
                    width: 100%;
                    min-width: 0;
                    border-radius: 3px;
                    border: none;
                    background: #0f1720;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    min-height: 48px;
                }
                .auto-bet-config-launcher.loading {
                    opacity: 0.6;
                    pointer-events: none;
                }
                .auto-bet-config-launcher:hover {
                    background: #111921;
                }
                .toggle-analyzer-btn {
                    flex-direction: column;
                    gap: 6px;
                    padding: 8px 6px;
                }
                .toggle-label {
                    font-size: 11px;
                    font-weight: 600;
                    color: #7d8597;
                    text-transform: uppercase;
                    letter-spacing: .3px;
                }
                .toggle-indicator {
                    width: 44px;
                    height: 24px;
                    border-radius: 999px;
                    background: #3d4859;
                    position: relative;
                    transition: background .2s;
                }
                .toggle-indicator::after {
                    content: '';
                    position: absolute;
                    top: 3px;
                    left: 3px;
                    width: 18px;
                    height: 18px;
                    border-radius: 50%;
                    background: #8d95a5;
                    transition: all .2s;
                }
                .toggle-analyzer-btn.active .toggle-indicator {
                    background: #ef4444;
                }
                .toggle-analyzer-btn.active .toggle-indicator::after {
                    transform: translateX(20px);
                    background: #ffffff;
                }
                .auto-bet-config-bars {
                    display: flex;
                    flex-direction: column;
                    gap: 5px;
                    width: 18px;
                }
                .auto-bet-config-bars span {
                    display: block;
                    height: 3px;
                    border-radius: 999px;
                    background: #fff;
                }
                body.auto-bet-modal-open {
                    overflow: hidden;
                }
                .auto-bet-modal {
                    position: fixed;
                    inset: 0;
                    display: none;
                    align-items: center;
                    justify-content: center;
                    z-index: 999999;
                }
                .auto-bet-modal-overlay {
                    position: absolute;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.85);
                    backdrop-filter: blur(4px);
                }
                .auto-bet-modal-content {
                    position: relative;
                    background: #1a2332;
                    border-radius: 4px;
                    border: none;
                    width: calc(100% - 32px);
                    max-width: 100%;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }
                .auto-bet-modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 18px 20px;
                    border-bottom: none;
                    background: #1a2332;
                }
                .auto-bet-modal-header h3 {
                    margin: 0;
                    font-size: 18px;
                    color: #ffffff;
                    font-weight: 700;
                }
                .auto-bet-modal-close {
                    background: transparent;
                    border: none;
                    color: #5a6b84;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    padding: 4px 8px;
                    border-radius: 3px;
                    display: inline-flex;
                    align-items: center;
                    gap: 0;
                    transition: all 0.2s ease;
                }
                .auto-bet-modal-close:hover {
                    color: #8d95a5;
                }
                .auto-bet-modal-body {
                    padding: 20px;
                    max-height: 65vh;
                    overflow-y: auto;
                    background: #1a2332;
                }
                .blaze-login-section {
                    margin-bottom: 20px;
                }
                .blaze-login-card {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    padding: 16px;
                    border-radius: 4px;
                    border: none;
                    background: #0f1720;
                }
                .blaze-login-header {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .blaze-login-status {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 12px;
                    border-radius: 3px;
                    background: #1a2332;
                }
                .login-status-indicator {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    flex-shrink: 0;
                }
                .login-status-indicator.disconnected {
                    background: #6b7280;
                }
                .login-status-indicator.connecting {
                    background: #fbbf24;
                    animation: pulse 1.5s ease-in-out infinite;
                }
                .login-status-indicator.connected {
                    background: #10b981;
                }
                .login-status-indicator.error {
                    background: #ef4444;
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                .login-status-text {
                    font-size: 13px;
                    font-weight: 500;
                    color: #9ca3af;
                }
                .blaze-login-form {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .toggle-password-btn {
                    position: absolute;
                    right: 12px;
                    top: 50%;
                    transform: translateY(-50%);
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: opacity 0.2s ease;
                }
                .toggle-password-btn:hover {
                    opacity: 0.7;
                }
                .eye-icon {
                    font-size: 16px;
                    user-select: none;
                }
                .blaze-login-btn {
                    width: 100%;
                    padding: 12px 20px;
                    border-radius: 3px;
                    border: none;
                    background: #ef4444;
                    color: #ffffff;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    margin-top: 4px;
                }
                .blaze-login-btn:hover {
                    background: #dc2626;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
                }
                .blaze-login-btn:active {
                    transform: translateY(0);
                }
                .blaze-login-btn:disabled {
                    background: #3d4859;
                    color: #6b7280;
                    cursor: not-allowed;
                    transform: none;
                    box-shadow: none;
                }
                .blaze-login-info {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .login-info-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 12px;
                    border-radius: 3px;
                    background: #1a2332;
                }
                .login-info-label {
                    font-size: 13px;
                    color: #7d8597;
                    font-weight: 400;
                }
                .login-info-value {
                    font-size: 14px;
                    color: #e5e7eb;
                    font-weight: 600;
                }
                .blaze-logout-btn {
                    width: 100%;
                    padding: 10px 20px;
                    border-radius: 3px;
                    border: none;
                    background: #3d4859;
                    color: #e5e7eb;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .blaze-logout-btn:hover {
                    background: #4b5563;
                }
                .blaze-logout-btn:active {
                    transform: scale(0.98);
                }
                .auto-bet-mode-layout {
                    display: grid;
                    grid-template-columns: 1fr auto 1fr;
                    gap: 12px;
                    align-items: stretch;
                    margin-bottom: 16px;
                }
                @media (max-width: 600px) {
                    .auto-bet-mode-layout {
                        grid-template-columns: 1fr;
                        gap: 12px;
                    }
                    .auto-bet-divider {
                        display: none;
                    }
                }
                .auto-bet-mode-card {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    padding: 16px;
                    border-radius: 4px;
                    border: none;
                    background: #0f1720;
                    transition: all 0.2s ease;
                }
                .auto-bet-mode-card.simulation-mode {
                    max-width: none;
                }
                .auto-bet-mode-card .mode-card-title {
                    font-size: 15px;
                    font-weight: 700;
                    color: #ffffff;
                    letter-spacing: 0;
                    margin-bottom: 4px;
                }
                .auto-bet-mode-card .mode-card-subtitle {
                    margin: 0;
                    font-size: 13px;
                    color: #9ca3af;
                    line-height: 1.3;
                }
                .auto-bet-divider {
                    width: 1px;
                    background: #2d3748;
                }
                .mode-toggle {
                    position: relative;
                    display: block;
                    border: none;
                    border-radius: 3px;
                    padding: 12px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    background: transparent;
                }
                .mode-toggle input {
                    position: absolute;
                    opacity: 0;
                    pointer-events: none;
                }
                .mode-toggle-content {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                }
                .mode-toggle-label {
                    font-size: 14px;
                    font-weight: 600;
                    color: #e5e7eb;
                }
                .mode-toggle-switch {
                    width: 44px;
                    height: 24px;
                    border-radius: 999px;
                    background: #3d4859;
                    position: relative;
                    transition: background 0.2s ease;
                    flex-shrink: 0;
                }
                .mode-toggle-switch::after {
                    content: '';
                    position: absolute;
                    top: 3px;
                    left: 3px;
                    width: 18px;
                    height: 18px;
                    border-radius: 50%;
                    background: #8d95a5;
                    transition: all 0.2s ease;
                }
                .mode-toggle input:checked + .mode-toggle-content .mode-toggle-switch {
                    background: #ef4444;
                }
                .mode-toggle input:checked + .mode-toggle-content .mode-toggle-switch::after {
                    transform: translateX(20px);
                    background: #ffffff;
                }
                .mode-toggle input:checked + .mode-toggle-content .mode-toggle-label {
                    color: #ffffff;
                }
                .mode-toggle-hint {
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.6);
                    margin: 4px 0 0 4px;
                }
                .auto-bet-field {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .auto-bet-field span {
                    font-size: 13px;
                    color: #7d8597;
                    font-weight: 400;
                }
                .auto-bet-field input {
                    width: 100%;
                    padding: 12px 14px;
                    border-radius: 3px;
                    border: none;
                    background: #0d1419;
                    color: #e5e7eb;
                    font-weight: 500;
                    font-size: 15px;
                    transition: background 0.2s ease;
                    box-sizing: border-box;
                }
                .auto-bet-field input:hover {
                    background: #111921;
                }
                .auto-bet-field input:focus {
                    outline: none;
                    background: #0d1419;
                }
                .white-protection-mode {
                    margin-top: 12px;
                    padding: 14px;
                    border-radius: 3px;
                    border: none;
                    background: #0f1720;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    transition: all 0.2s ease;
                }
                .white-mode-header {
                    display: flex;
                    justify-content: space-between;
                    font-size: 12px;
                    letter-spacing: 0;
                    text-transform: uppercase;
                    color: #7d8597;
                    font-weight: 500;
                }
                .white-mode-options {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                    gap: 10px;
                }
                .white-mode-btn {
                    border-radius: 3px;
                    border: none;
                    background: #0d1419;
                    padding: 12px;
                    text-align: left;
                    color: #ffffff;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .white-mode-btn:hover {
                    background: #111921;
                }
                .white-mode-btn.active {
                    background: rgba(102, 126, 234, 0.15);
                    box-shadow: inset 0 0 0 2px #667eea;
                }
                .white-mode-btn:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }
                .white-mode-title {
                    font-size: 14px;
                    font-weight: 600;
                    color: #ffffff;
                }
                .white-mode-subtitle {
                    font-size: 13px;
                    color: #7d8597;
                    line-height: 1.3;
                }
                .white-mode-description {
                    font-size: 13px;
                    color: #7d8597;
                    line-height: 1.4;
                }
                .white-mode-disabled {
                    opacity: 0.5;
                    pointer-events: none;
                }
                .auto-bet-checkbox {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px;
                    border: 1px dashed rgba(255, 255, 255, 0.2);
                    border-radius: 8px;
                }
                .auto-bet-shared-grid {
                    margin-top: 16px;
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 12px;
                }
                @media (max-width: 600px) {
                    .auto-bet-shared-grid {
                        grid-template-columns: 1fr;
                    }
                }
                .auto-bet-section-title {
                    margin-top: 16px;
                    margin-bottom: 8px;
                    font-size: 13px;
                    font-weight: 500;
                    letter-spacing: 0;
                    text-transform: none;
                    color: #7d8597;
                }
                .auto-bet-martingale-grid {
                    margin-top: 10px;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 14px;
                    align-items: stretch;
                }
                .auto-bet-martingale-grid .mode-toggle {
                    flex: 1 1 260px;
                    border: none;
                    border-radius: 3px;
                    padding: 12px;
                    background: transparent;
                }
                .auto-bet-martingale-grid .mode-toggle .mode-toggle-content {
                    width: 100%;
                    justify-content: space-between;
                    gap: 12px;
                }
                .auto-bet-martingale-grid .auto-bet-field {
                    flex: 1 1 220px;
                }
                .auto-bet-modal-footer {
                    display: flex;
                    justify-content: space-between;
                    gap: 12px;
                    padding: 16px 20px;
                    border-top: none;
                    background: #1a2332;
                }
                .auto-bet-modal-footer button {
                    position: relative;
                    overflow: hidden;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
                }
                .auto-bet-modal-footer button .button-label {
                    pointer-events: none;
                }
                .auto-bet-modal-footer button.btn-pressed {
                    transform: translateY(1px) scale(0.98);
                    box-shadow: 0 8px 18px rgba(0, 212, 255, 0.2);
                }
                .auto-bet-modal-footer button::after {
                    content: '';
                    width: 0;
                    height: 0;
                    border: 2px solid transparent;
                    border-radius: 50%;
                    border-top-color: transparent;
                    opacity: 0;
                    display: inline-block;
                    transition: opacity 0.2s ease, width 0.2s ease, height 0.2s ease, margin-left 0.2s ease;
                }
                .auto-bet-modal-footer button.is-busy {
                    pointer-events: none;
                    opacity: 0.9;
                }
                .auto-bet-modal-footer button.is-busy::after {
                    width: 16px;
                    height: 16px;
                    border-color: rgba(255, 255, 255, 0.25);
                    border-top-color: #00e5ff;
                    opacity: 1;
                    margin-left: 4px;
                    animation: autoBetButtonSpinner 0.75s linear infinite;
                }
                @keyframes autoBetButtonSpinner {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .auto-bet-reset,
                .auto-bet-save-btn {
                    flex: 1;
                    padding: 14px 20px;
                    border-radius: 3px;
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                    border: none;
                    transition: all 0.2s ease;
                    letter-spacing: 0;
                }
                .auto-bet-reset {
                    background: #2d3748;
                    color: #a0aec0;
                    border: none;
                }
                .auto-bet-reset:hover {
                    background: #374151;
                }
                .auto-bet-save-btn {
                    background: #ef4444;
                    color: #ffffff;
                    border: none;
                }
                .auto-bet-save-btn:hover {
                    background: #dc2626;
                }
                @media (max-width: 520px) {
                    .auto-bet-summary-body {
                        flex-direction: column;
                    }
                    .auto-bet-active-bets {
                        grid-template-columns: 1fr;
                    }
                    .auto-bet-actions {
                        flex-direction: row;
                        justify-content: center;
                    }
                    .auto-bet-mode-layout {
                        flex-direction: column;
                    }
                    .auto-bet-divider {
                        width: 100%;
                        height: 1px;
                        margin: 10px 0;
                    }
                    .auto-bet-mode-card.simulation-mode {
                        max-width: none;
                    }
                }
            `;
            document.head.appendChild(style);
            stylesInjected = true;
        }

        function onSidebarReady() {
            ensureStyles();
            uiRefs = {
                profit: document.getElementById('autoBetMetricProfit'),
                loss: document.getElementById('autoBetMetricLoss'),
                initialBalance: document.getElementById('autoBetInitialBalance'),
                currentBalance: document.getElementById('autoBetCurrentBalance'),
                configBtn: document.getElementById('autoBetConfigBtn')
            };
            betCardRefs.red = {
                card: document.getElementById('autoBetRedCard'),
                stage: document.getElementById('autoBetRedStage'),
                amount: document.getElementById('autoBetRedAmount'),
                status: document.getElementById('autoBetRedStatus'),
                entries: document.getElementById('autoBetRedEntries')
            };
            betCardRefs.black = {
                card: document.getElementById('autoBetBlackCard'),
                stage: document.getElementById('autoBetBlackStage'),
                amount: document.getElementById('autoBetBlackAmount'),
                status: document.getElementById('autoBetBlackStatus'),
                entries: document.getElementById('autoBetBlackEntries')
            };
            betCardRefs.white = {
                card: document.getElementById('autoBetWhiteCard'),
                stage: document.getElementById('autoBetWhiteStage'),
                amount: document.getElementById('autoBetWhiteAmount'),
                status: document.getElementById('autoBetWhiteStatus'),
                entries: document.getElementById('autoBetWhiteEntries')
            };
            hydratePanel();
            resetActiveBetCards(config.whiteProtection);
            const autoBetWhiteToggle = document.getElementById('autoBetWhiteProtection');
            if (autoBetWhiteToggle) {
                autoBetWhiteToggle.checked = !!config.whiteProtection;
                setWhiteProtectionModeAvailability(!!config.whiteProtection);
                autoBetWhiteToggle.addEventListener('change', (event) => {
                    const checked = !!event.target.checked;
                    config.whiteProtection = checked;
                    setWhiteProtectionModeAvailability(checked);
                    if (!checked) {
                        setWhiteProtectionDisabled();
                    } else if (!betCardState.white.active) {
                        updateBetCard('white', {
                            stage: '—',
                            amountText: formatCurrency(0),
                            status: 'Aguardando sinal',
                            variant: null
                        });
                    }
                });
            }
            const whiteModeButtons = document.querySelectorAll('.white-mode-btn');
            whiteModeButtons.forEach((btn) => {
                btn.addEventListener('click', () => {
                    if (!config.whiteProtection || btn.disabled) return;
                    const selectedMode = normalizeWhiteProtectionMode(btn.dataset.whiteMode);
                    if (selectedMode === config.whiteProtectionMode) return;
                    config.whiteProtectionMode = selectedMode;
                    setWhiteProtectionModeUI(selectedMode);
                });
            });
            updateStatusUI();
        }

        function hydratePanel() {
            const entries = [
                ['autoBetEnabled', config.enabled, true],
                ['autoBetSimulationOnly', config.simulationOnly, true],
                ['autoBetWhiteProtection', config.whiteProtection, true],
                ['autoBetInverseMode', config.inverseModeEnabled, true],
                ['autoBetBaseStake', config.baseStake],
                ['autoBetGaleMultiplier', config.galeMultiplier],
                ['autoBetStopWin', config.stopWin],
                ['autoBetStopLoss', config.stopLoss],
                ['autoBetSimulationBank', config.simulationBankRoll]
            ];
            entries.forEach(([id, value, isCheckbox]) => {
                const el = document.getElementById(id);
                if (!el) return;
                if (isCheckbox) {
                    el.checked = !!value;
                } else if (value !== undefined && value !== null) {
                    el.value = value;
                }
            });
            setWhiteProtectionModeUI(config.whiteProtectionMode);
            setWhiteProtectionModeAvailability(!!config.whiteProtection);
            if (!config.whiteProtection) {
                setWhiteProtectionDisabled();
            } else if (!betCardState.white.active) {
                updateBetCard('white', {
                    stage: '—',
                    amountText: formatCurrency(0),
                    status: 'Aguardando sinal',
                    variant: null
                });
            }
        }

        function updateStatusUI(message) {
            if (!uiRefs) return;
            const shouldDisplayBalances = !!config.simulationOnly || !!config.enabled;
            
            const statusText = (() => {
                if (message) return message;
                if (!config.enabled) return 'Desativada';
                if (runtime.blockedReason === 'STOP_WIN') return 'Pausado • Stop WIN';
                if (runtime.blockedReason === 'STOP_LOSS') return 'Pausado • Stop LOSS';
                if (config.simulationOnly) return 'Simulação ativa';
                return 'Operando (real)';
            })();
            if (uiRefs.configBtn) {
                uiRefs.configBtn.setAttribute('title', `Configurar autoaposta • ${statusText}`);
                uiRefs.configBtn.setAttribute('aria-label', `Configurar autoaposta • ${statusText}`);
            }
            const realizedProfit = shouldDisplayBalances ? Number(runtime.profit || 0) : 0;
            const pendingExposure = shouldDisplayBalances && runtime.openCycle
                ? (getColorExposure() + getWhiteExposure())
                : 0;
            const profitValue = realizedProfit > 0 ? realizedProfit : 0;
            const lossValue = shouldDisplayBalances ? Math.max(0, -(realizedProfit)) : 0;
            if (uiRefs.profit) {
                uiRefs.profit.textContent = formatCurrency(profitValue);
            }
            if (uiRefs.loss) {
                uiRefs.loss.textContent = formatCurrency(lossValue);
            }
            const initialBalance = shouldDisplayBalances ? getInitialBalanceValue() : 0;
            if (uiRefs.initialBalance) {
                uiRefs.initialBalance.textContent = formatCurrency(initialBalance);
            }
            if (uiRefs.currentBalance) {
                const currentBalanceValue = shouldDisplayBalances
                    ? initialBalance + realizedProfit - pendingExposure
                    : 0;
                const balanceDelta = currentBalanceValue - initialBalance;
                const balanceClass = balanceDelta > 0
                    ? 'positive-value'
                    : balanceDelta < 0
                        ? 'negative-value'
                        : 'neutral-value';
                uiRefs.currentBalance.classList.remove('positive-value', 'negative-value', 'neutral-value');
                uiRefs.currentBalance.classList.add(balanceClass);
                uiRefs.currentBalance.textContent = formatCurrency(currentBalanceValue);
            }
        }

        function broadcastAutoBetAvailability() {
            setAutoBetAvailabilityState({
                hasReal: !!config.enabled,
                hasSimulation: !!config.simulationOnly
            });
        }

        function extractAnalysisConfidence(analysis) {
            if (!analysis) return null;
            if (typeof analysis.confidence === 'number') return analysis.confidence;
            if (typeof analysis.score === 'number') return analysis.score;
            if (typeof analysis.percentage === 'number') return analysis.percentage;
            return null;
        }

        function recordCycleStart(analysis) {
            if (!runtime.openCycle?.id) return;
            autoBetHistoryStore.upsert({
                id: runtime.openCycle.id,
                createdAt: runtime.openCycle.createdAt,
                color: runtime.openCycle.color,
                confidence: extractAnalysisConfidence(analysis),
                mode: runtime.openCycle.mode,
                status: 'pending',
                stages: [],
                executionMode: config.enabled ? 'real' : 'simulation',
                totalColorInvested: 0,
                totalWhiteInvested: 0
            });
        }

        function recordCycleStage(stageInfo, amount, color) {
            if (!runtime.openCycle?.id || !Number.isFinite(amount)) return;
            autoBetHistoryStore.patch(runtime.openCycle.id, (record) => {
                const stages = Array.isArray(record.stages) ? [...record.stages] : [];
                const rawStage = stageInfo?.label || 'G0';
                stages.push({
                    rawStage,
                    stageLabel: formatCycleStageLabel(rawStage, stages.length),
                    amount,
                    color,
                    timestamp: Date.now()
                });
                const totalColorInvested = Number((record.totalColorInvested || 0) + amount);
                return {
                    stages,
                    lastAmount: amount,
                    entryColor: color,
                    totalColorInvested,
                    status: 'pending'
                };
            });
        }

        function recordWhiteProtectionAmount(amount) {
            if (!runtime.openCycle?.id || !Number.isFinite(amount)) return;
            autoBetHistoryStore.patch(runtime.openCycle.id, (record) => ({
                totalWhiteInvested: Number((record.totalWhiteInvested || 0) + amount)
            }));
        }

        function finalizeHistoryRecord(outcome, delta, latestEntry, meta = {}) {
            if (!runtime.openCycle?.id) return;
            autoBetHistoryStore.patch(runtime.openCycle.id, (record) => {
                const profitValue = Number.isFinite(delta) ? Number(delta.toFixed(2)) : null;
                const status = outcome === 'WIN' ? 'win' : outcome === 'LOSS' ? 'loss' : outcome;
                const resultNumber = typeof latestEntry?.number === 'number'
                    ? latestEntry.number
                    : (typeof meta.resultNumber === 'number' ? meta.resultNumber : record.resultNumber ?? null);
                return {
                    status,
                    profit: profitValue,
                    resultColor: latestEntry?.color ?? meta.resultColor ?? record.resultColor ?? null,
                    resultNumber,
                    resultTimestamp: latestEntry?.timestamp || meta.resultTimestamp || Date.now(),
                    totalColorInvested: meta.totalColorInvested ?? record.totalColorInvested ?? 0,
                    totalWhiteInvested: meta.totalWhiteInvested ?? record.totalWhiteInvested ?? 0,
                    totalInvested: meta.totalInvested ?? record.totalInvested ?? 0,
                    lastAmount: meta.lastAmount ?? record.lastAmount ?? null,
                    confidence: record.confidence ?? (typeof latestEntry?.confidence === 'number' ? latestEntry.confidence : record.confidence ?? null)
                };
            });
        }

        function cancelPendingHistoryRecord(reason = 'cancelled') {
            if (!runtime.openCycle?.id) return;
            autoBetHistoryStore.patch(runtime.openCycle.id, (record) => {
                if (record.status && record.status !== 'pending') {
                    return null;
                }
                return {
                    status: reason,
                    profit: 0,
                    resultColor: null,
                    resultNumber: null,
                    resultTimestamp: Date.now()
                };
            });
        }

        function formatCurrency(value) {
            return currencyFormatter.format(Number.isFinite(value) ? value : 0);
        }

        function formatSignedCurrency(value) {
            const abs = formatCurrency(Math.abs(value || 0));
            return `${value >= 0 ? '+' : '-'}${abs}`;
        }

        function getBetCardRefs(type) {
            return betCardRefs[type] || {};
        }

        function getEntriesDisplay(type) {
            const entries = betCardEntries[type] || [];
            if (!entries.length) return '—';
            const parts = entries.map(value => formatCurrency(value));
            return parts.join(' + ');
        }

        function getLossSummary(type) {
            const losses = betCardLosses[type] || [];
            if (!losses.length) return null;
            const latest = losses[losses.length - 1];
            return `LOSS -${formatCurrency(latest)}`;
        }

        function recordLoss(type, amount) {
            const value = Number(amount || 0);
            if (!(value > 0)) return;
            betCardLosses[type] = betCardLosses[type] || [];
            betCardLosses[type].push(value);
        }

        function updateBetCard(type, { stage, amountText, status, variant, entriesText }) {
            const refs = getBetCardRefs(type);
            if (!refs.card) return;
            const classes = ['bet-result-win', 'bet-result-loss', 'bet-result-pending'];
            refs.card.classList.remove(...classes);
            if (variant) {
                refs.card.classList.add(`bet-result-${variant}`);
            }
            const activeClasses = ['bet-entry-active-red', 'bet-entry-active-black', 'bet-entry-active-white'];
            refs.card.classList.remove(...activeClasses);
            if (variant === 'pending') {
                refs.card.classList.add(`bet-entry-active-${type}`);
            }
            if (refs.stage && stage !== undefined) {
                refs.stage.textContent = stage || '—';
            }
            if (refs.amount && amountText !== undefined) {
                refs.amount.textContent = amountText;
            }
            if (refs.status && status !== undefined) {
                refs.status.textContent = status;
            }
            if (refs.entries) {
                const text = entriesText !== undefined ? entriesText : getEntriesDisplay(type);
                refs.entries.textContent = text;
            }
        }

        function clearCardResetTimer(key) {
            if (betCardResetTimers[key]) {
                clearTimeout(betCardResetTimers[key]);
                betCardResetTimers[key] = null;
            }
        }

        function scheduleCardReset(key, statusText = 'Aguardando sinal') {
            clearCardResetTimer(key);
            betCardResetTimers[key] = setTimeout(() => {
                if (key === 'white') {
                    setWhiteCardIdle(statusText);
                } else {
                    setColorCardIdle(key, statusText);
                }
            }, 5000);
        }

        function resetActiveBetCards(isWhiteEnabled = true) {
            setColorCardIdle('red');
            setColorCardIdle('black');
            setWhiteCardIdle(isWhiteEnabled ? 'Aguardando sinal' : 'Proteção desativada');
        }

        function resolveColorKey(color) {
            return color === 'black' ? 'black' : 'red';
        }

        function setColorCardIdle(color, statusText = 'Aguardando sinal') {
            const key = resolveColorKey(color);
            clearCardResetTimer(key);
            betCardState[key] = { stage: '—', amount: 0, active: false };
            betCardEntries[key] = [];
            betCardLosses[key] = [];
            updateBetCard(key, {
                stage: '—',
                amountText: formatCurrency(0),
                status: statusText,
                variant: null,
                entriesText: getEntriesDisplay(key)
            });
        }

        function setColorBetPending(color, stage, amount) {
            const key = resolveColorKey(color);
            const opposite = key === 'red' ? 'black' : 'red';
            betCardState[key] = betCardState[key] || { stage: '—', amount: 0, active: false };
            betCardState[opposite] = betCardState[opposite] || { stage: '—', amount: 0, active: false };
            clearCardResetTimer(key);
            betCardState[key] = { stage, amount, active: true };
            betCardEntries[key] = betCardEntries[key] || [];
            if ((stage || '').toUpperCase() === 'G0') {
                betCardEntries[key] = [];
                betCardLosses[key] = [];
            }
            betCardEntries[key].push(amount);
            const lossSummary = getLossSummary(key);
            const statusText = lossSummary || 'Aguardando resultado';
            updateBetCard(key, {
                stage,
                amountText: formatCurrency(amount),
                status: statusText,
                variant: 'pending'
            });
            if (!betCardState[opposite].active) {
                setColorCardIdle(opposite);
            }
        }

        function setWhiteBetPending(stage, amount) {
            clearCardResetTimer('white');
            betCardState.white = { stage, amount, active: true };
            betCardEntries.white = betCardEntries.white || [];
            if ((stage || '').toUpperCase() === 'G0') {
                betCardEntries.white = [];
                betCardLosses.white = [];
            }
            betCardEntries.white.push(amount);
            const lossSummary = getLossSummary('white');
            const statusText = lossSummary || 'Aguardando resultado';
            updateBetCard('white', {
                stage,
                amountText: formatCurrency(amount),
                status: statusText,
                variant: 'pending'
            });
        }

        function setWhiteCardIdle(statusText = (config.whiteProtection ? 'Aguardando sinal' : 'Proteção desativada')) {
            clearCardResetTimer('white');
            betCardState.white = { stage: '—', amount: 0, active: false };
            betCardEntries.white = [];
            betCardLosses.white = [];
            updateBetCard('white', {
                stage: '—',
                amountText: formatCurrency(0),
                status: statusText,
                variant: null,
                entriesText: getEntriesDisplay('white')
            });
        }

        function setWhiteProtectionDisabled() {
            setWhiteCardIdle('Proteção desativada');
            setWhiteProtectionModeAvailability(false);
        }

        function setColorBetResult(color, stage, amount, netValue, options = {}) {
            const { scheduleReset = true } = options;
            const key = resolveColorKey(color);
            betCardState[key] = betCardState[key] || { stage: '—', amount: 0, active: false };
            betCardState[key].active = false;
            betCardState[key].stage = stage || betCardState[key].stage || '—';
            betCardState[key].amount = amount;
            const isLoss = typeof netValue === 'number' && netValue < 0;
            const lossSummary = isLoss ? getLossSummary(key) : null;
            const statusText = netValue === undefined || netValue === null
                ? 'Resultado pendente'
                : (netValue >= 0
                    ? `WIN ${formatSignedCurrency(netValue)}`
                    : (lossSummary || `LOSS ${formatSignedCurrency(netValue)}`));
            updateBetCard(key, {
                stage: betCardState[key].stage,
                amountText: formatCurrency(amount),
                status: statusText,
                variant: netValue === undefined || netValue === null
                    ? null
                    : (netValue >= 0 ? 'win' : 'loss')
            });
            if (scheduleReset) {
                scheduleCardReset(key, 'Aguardando sinal');
            }
        }

        function setWhiteBetResult(stage, amount, netValue, options = {}) {
            const { scheduleReset = true, idleStatus } = options;
            betCardState.white.active = false;
            const isLoss = typeof netValue === 'number' && netValue < 0;
            const lossSummary = isLoss ? getLossSummary('white') : null;
            const statusText = netValue === undefined || netValue === null
                ? 'Resultado pendente'
                : (netValue >= 0
                    ? `WIN ${formatSignedCurrency(netValue)}`
                    : (lossSummary || `LOSS ${formatSignedCurrency(netValue)}`));
            updateBetCard('white', {
                stage: stage || betCardState.white.stage || '—',
                amountText: formatCurrency(amount),
                status: statusText,
                variant: netValue === undefined || netValue === null
                    ? null
                    : (netValue >= 0 ? 'win' : 'loss')
            });
            if (scheduleReset) {
                const nextStatus = idleStatus || (config.whiteProtection ? 'Aguardando sinal' : 'Proteção desativada');
                scheduleCardReset('white', nextStatus);
            }
        }

        function markIntermediateLoss() {
            if (!runtime.openCycle || !runtime.openCycle.bets || !runtime.openCycle.bets.length) return;
            const lostBet = runtime.openCycle.bets[runtime.openCycle.bets.length - 1];
            const lostAmount = Number(lostBet.amount || 0);
            if (lostAmount > 0) {
                const colorKey = resolveColorKey(lostBet.color || runtime.openCycle.color);
                recordLoss(colorKey, lostAmount);
                const fallbackStage = betCardState[colorKey]?.stage || 'G0';
                setColorBetResult(colorKey, lostBet.stage || fallbackStage, lostAmount, -lostAmount, { scheduleReset: false });
            }
            const whiteBet = getLastWhiteBetForStage(lostBet.stage);
            if (whiteBet && whiteBet.amount) {
                const whiteAmount = Number(whiteBet.amount || 0);
                recordLoss('white', whiteAmount);
                setWhiteBetResult(whiteBet.stage || lostBet.stage, whiteAmount, -whiteAmount, { scheduleReset: false });
            } else if (config.whiteProtection) {
                updateBetCard('white', {
                    stage: lostBet.stage || betCardState.white.stage || '—',
                    amountText: formatCurrency(0),
                    status: 'Sem proteção neste estágio',
                    variant: null
                });
            }
        }

        function getLastWhiteBetForStage(stage) {
            if (!runtime.openCycle || !runtime.openCycle.whiteBets) return null;
            for (let i = runtime.openCycle.whiteBets.length - 1; i >= 0; i--) {
                const wb = runtime.openCycle.whiteBets[i];
                if (!stage || wb.stage === stage) {
                    return wb;
                }
            }
            return null;
        }

        function isAutomationActive() {
            return !!config.enabled || !!config.simulationOnly;
        }

        function handleAnalysis(analysis) {
            if (!isAutomationActive() || runtime.blockedReason) return;
            if (!analysis || !analysis.color) return;
            const normalizedColor = normalizeColor(analysis.color);
            if (!normalizedColor) return;
            const stageInfo = normalizeStage(analysis.phase);
            const analysisId = analysis?.createdOnTimestamp || analysis?.timestamp || Date.now();
            const nextSignature = `${analysisId}|${stageInfo.label}|${normalizedColor}`;
            if (nextSignature === lastHandledAnalysisSignature) {
                return;
            }
            lastHandledAnalysisSignature = nextSignature;
            linkCycle(stageInfo, normalizedColor, analysis);
            const amount = calculateBetAmount(stageInfo.index);
            if (!Number.isFinite(amount) || amount <= 0) return;
            if (!ensureBankBeforePlacingBet(stageInfo, normalizedColor, amount)) {
                return;
            }
            registerPlannedBet(stageInfo, amount, normalizedColor);
            scheduleExecution({ color: normalizedColor, amount, stage: stageInfo.label });
            if (config.whiteProtection && normalizedColor !== 'white') {
                registerWhiteProtectionBet(stageInfo);
            }
        }

        function handleEntriesUpdate(entries) {
            if (!Array.isArray(entries) || !entries.length) return;
            if (!isAutomationActive() && !runtime.openCycle) return;
            const latest = entries[0];
            if (!latest || runtime.lastProcessedEntryTimestamp === latest.timestamp) return;
            runtime.lastProcessedEntryTimestamp = latest.timestamp;
            if (!runtime.openCycle) return;
            const isWin = latest.result === 'WIN';
            const isFinalLoss = latest.result === 'LOSS' && (latest.finalResult === 'RET' || !hasContinuationFlag(latest));
            if (isWin) {
                finalizeCycle('WIN', latest);
            } else if (isFinalLoss) {
                finalizeCycle('LOSS', latest);
            } else {
                markIntermediateLoss();
                persistRuntime(true);
            }
        }

        function resetRuntimeState(forceMessage) {
            pendingTimeouts.forEach(id => clearTimeout(id));
            pendingTimeouts = [];
             if (runtime.openCycle) {
                cancelPendingHistoryRecord('cancelled');
            }
            runtime = { ...AUTO_BET_RUNTIME_DEFAULTS };
            lastHandledAnalysisSignature = null;
            updateSimulationSnapshots();
            persistRuntime();
            updateStatusUI(forceMessage ? 'Resetada manualmente' : undefined);
            resetActiveBetCards(config.whiteProtection);
        }

        function linkCycle(stageInfo, color, analysis) {
            const analysisId = analysis?.createdOnTimestamp || analysis?.timestamp || Date.now();
            if (!runtime.openCycle || stageInfo.index === 0) {
                runtime.openCycle = {
                    id: analysisId,
                    color,
                    stage: stageInfo.label,
                    bets: [],
                    whiteBets: [],
                    createdAt: Date.now(),
                    mode: analysis?.analysisMode || (getTabSpecificAIMode(false) ? 'diamond' : 'standard')
                };
            } else {
                runtime.openCycle.stage = stageInfo.label;
                runtime.openCycle.color = color;
                runtime.openCycle.whiteBets = runtime.openCycle.whiteBets || [];
            }
            if (config.inverseModeEnabled) {
                if (stageInfo.index === 0) {
                    runtime.inverseCycleBaseFactor = Math.max(1, Number(runtime.inverseNextBaseFactor || 1));
                }
            } else {
                runtime.inverseCycleBaseFactor = 1;
                runtime.inverseNextBaseFactor = 1;
            }
            persistRuntime(true);
            updateStatusUI();
            if (stageInfo.index === 0) {
                recordCycleStart(analysis);
            }
        }

        function registerPlannedBet(stageInfo, amount, color) {
            if (!runtime.openCycle) return;
            runtime.openCycle.bets = runtime.openCycle.bets || [];
            runtime.openCycle.bets.push({
                stage: stageInfo.label,
                amount,
                color,
                timestamp: Date.now()
            });
            recordCycleStage(stageInfo, amount, color);
            persistRuntime(true);
            updateStatusUI();
            setColorBetPending(color, stageInfo.label, amount);
        }

        function getNextColorStageIndex(fallbackIndex = 0) {
            if (!runtime.openCycle || !Array.isArray(runtime.openCycle.bets)) {
                return fallbackIndex;
            }
            return runtime.openCycle.bets.length;
        }

        function getColorExposure() {
            if (!runtime.openCycle || !Array.isArray(runtime.openCycle.bets)) return 0;
            return runtime.openCycle.bets.reduce((sum, bet) => sum + Number(bet.amount || 0), 0);
        }

        function getWhiteExposure() {
            if (!runtime.openCycle || !Array.isArray(runtime.openCycle.whiteBets)) return 0;
            return runtime.openCycle.whiteBets.reduce((sum, bet) => sum + Number(bet.amount || 0), 0);
        }

        function getPendingExposureTotal() {
            return getColorExposure() + getWhiteExposure();
        }

        function getAvailableBankCeiling() {
            return getInitialBalanceValue() + Number(runtime.profit || 0);
        }

        function estimateWhiteProtectionPreview(exposureAfterColor, colorBetAmount) {
            const payoutMultiplier = Math.max(2, Number(config.whitePayoutMultiplier) || AUTO_BET_DEFAULTS.whitePayoutMultiplier);
            const gainMultiplier = payoutMultiplier - 1;
            const mode = normalizeWhiteProtectionMode(config.whiteProtectionMode);
            const targetProfit = mode === WHITE_PROTECTION_MODE.NEUTRAL ? 0 : Math.max(0.01, Number(colorBetAmount) || 0);
            const numerator = exposureAfterColor + targetProfit;
            const required = gainMultiplier > 0
                ? numerator / gainMultiplier
                : numerator;
            return Number(Math.max(0.01, required).toFixed(2));
        }

        function projectNextExposureSnapshot(color, amount) {
            const colorAmount = Number(amount || 0);
            const pendingExposure = getPendingExposureTotal();
            const exposureAfterColor = pendingExposure + colorAmount;
            const shouldEstimateWhite = !!config.whiteProtection && color !== 'white';
            const projectedWhite = shouldEstimateWhite
                ? estimateWhiteProtectionPreview(exposureAfterColor, colorAmount)
                : 0;
            const totalAfter = exposureAfterColor + projectedWhite;
            return {
                pendingExposure,
                exposureAfterColor,
                projectedWhite,
                totalAfter,
                availableBank: getAvailableBankCeiling()
            };
        }

        function ensureBankBeforePlacingBet(stageInfo, color, amount) {
            const snapshot = projectNextExposureSnapshot(color, amount);
            if (snapshot.totalAfter <= snapshot.availableBank + 0.0001) {
                return true;
            }
            handleInsufficientBank(stageInfo, snapshot);
            return false;
        }

        async function markLatestContinuingEntryAsRet(reasonTag = 'BANK_ZERO') {
            try {
                const stored = await storageCompat.get(['entriesHistory']);
                const entries = Array.isArray(stored?.entriesHistory) ? [...stored.entriesHistory] : [];
                if (!entries.length) return;
                const targetIndex = entries.findIndex(entry =>
                    entry &&
                    entry.result === 'LOSS' &&
                    !entry.finalResult &&
                    hasContinuationFlag(entry)
                );
                if (targetIndex === -1) return;
                const updatedEntry = { ...entries[targetIndex] };
                Object.keys(updatedEntry).forEach((key) => {
                    if (key.startsWith('continuingToG')) {
                        delete updatedEntry[key];
                    }
                });
                updatedEntry.finalResult = 'RET';
                updatedEntry.stopReason = reasonTag;
                entries[targetIndex] = updatedEntry;
                await storageCompat.set({ entriesHistory: entries });
                window.requestAnimationFrame(() => renderEntriesPanel(entries));
            } catch (error) {
                console.warn('AutoBet: erro ao finalizar entrada pendente por saldo insuficiente:', error);
            }
        }

        function forfeitCycleDueToBalance(reasonTag = 'INSUFFICIENT_BANK') {
            markLatestContinuingEntryAsRet(reasonTag);
            if (!runtime.openCycle) {
                cancelPendingHistoryRecord('insufficient_bank');
                return;
            }
            const syntheticEntry = {
                result: 'LOSS',
                finalResult: reasonTag,
                color: runtime.openCycle.color,
                timestamp: Date.now(),
                number: null
            };
            finalizeCycle('LOSS', syntheticEntry);
        }

        function handleInsufficientBank(stageInfo, snapshot) {
            const readableStage = stageInfo?.label || 'próxima aposta';
            const shortfall = Math.max(0, snapshot.totalAfter - snapshot.availableBank);
            const shortfallText = formatCurrency(shortfall);
            uiLog(`[AutoBet] Saldo insuficiente (${readableStage}). Faltam ${shortfallText} para continuar o ciclo.`);
            forfeitCycleDueToBalance();
            runtime.blockedReason = 'BANK_ZERO';
            updateStatusUI('Banca insuficiente');
            persistRuntime();
            showToast(`Saldo insuficiente: faltam ${shortfallText} para continuar o ciclo.`, 4200);
            pauseAnalysisForAutoBet('Saldo insuficiente para continuar');
        }

        function calculateWhiteBetAmount() {
            const payoutMultiplier = Math.max(2, Number(config.whitePayoutMultiplier) || AUTO_BET_DEFAULTS.whitePayoutMultiplier);
            const gainMultiplier = payoutMultiplier - 1;
            const exposuresBefore = getColorExposure() + getWhiteExposure();
            const mode = normalizeWhiteProtectionMode(config.whiteProtectionMode);
            const lastColorBet = runtime.openCycle && runtime.openCycle.bets && runtime.openCycle.bets.length
                ? Number(runtime.openCycle.bets[runtime.openCycle.bets.length - 1].amount || 0)
                : (config.inverseModeEnabled
                    ? getInverseInitialAmount()
                    : Math.max(0.01, Number(config.baseStake) || AUTO_BET_DEFAULTS.baseStake));
            const targetProfit = mode === WHITE_PROTECTION_MODE.NEUTRAL ? 0 : Math.max(0.01, lastColorBet);
            const numerator = exposuresBefore + targetProfit;
            const required = gainMultiplier > 0
                ? numerator / gainMultiplier
                : numerator;
            return Number(Math.max(0.01, required).toFixed(2));
        }

        function registerWhiteProtectionBet(stageInfo) {
            if (!runtime.openCycle) return;
            runtime.openCycle.whiteBets = runtime.openCycle.whiteBets || [];
            const amount = calculateWhiteBetAmount();
            runtime.openCycle.whiteBets.push({
                stage: stageInfo.label,
                amount,
                timestamp: Date.now()
            });
            recordWhiteProtectionAmount(amount);
            persistRuntime(true);
            updateStatusUI();
            setWhiteBetPending(stageInfo.label, amount);
            scheduleExecution({ color: 'white', amount, stage: `${stageInfo.label}-WHITE`, isWhite: true }, 200);
        }

        function scheduleExecution(order, offsetMs = 0) {
            const baseDelay = Math.max(0, Number(config.delayMs) || 0);
            const totalDelay = Math.max(0, baseDelay + offsetMs);
            const timeoutId = setTimeout(() => {
                executeBet(order).finally(() => {
                    pendingTimeouts = pendingTimeouts.filter(id => id !== timeoutId);
                });
            }, totalDelay);
            pendingTimeouts.push(timeoutId);
        }

        async function executeBet(order) {
            if (!order || isExecuting) return;
            isExecuting = true;
            try {
                const amountString = Number(order.amount).toFixed(2);
                if (config.simulationOnly) {
                    uiLog(`[AutoBet] Simulação • ${order.stage} → ${order.color.toUpperCase()} • ${amountString}`);
                    return;
                }
                const input = findBetInput(order.color);
                const button = findBetButton(order.color);
                if (!input || !button) {
                    console.warn('[AutoBet] Controles da Blaze não encontrados para', order.color);
                    runtime.lastError = 'missing_controls';
                    persistRuntime(true);
                    return;
                }
                setInputValue(input, amountString);
                await waitFor(80);
                button.click();
                runtime.lastError = null;
                persistRuntime(true);
                uiLog(`[AutoBet] Aposta enviada • ${order.stage.toUpperCase()} • ${order.color.toUpperCase()} • ${amountString}`);
            } catch (error) {
                console.error('[AutoBet] Erro ao executar aposta:', error);
                runtime.lastError = error.message;
                persistRuntime(true);
            } finally {
                isExecuting = false;
            }
        }

        function findBetInput(color) {
            return findFirstElement(COLOR_INPUT_SELECTORS[color] || []);
        }

        function findBetButton(color) {
            return findFirstElement(COLOR_BUTTON_SELECTORS[color] || []);
        }

        function findFirstElement(selectors) {
            for (const selector of selectors) {
                const el = document.querySelector(selector);
                if (el) return el;
            }
            return null;
        }

        function setInputValue(target, value) {
            if (!target) return;
            if (nativeValueSetter) {
                nativeValueSetter.call(target, value);
            } else {
                target.value = value;
            }
            target.dispatchEvent(new Event('input', { bubbles: true }));
            target.dispatchEvent(new Event('change', { bubbles: true }));
        }

        function waitFor(ms = 50) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        function normalizeColor(color) {
            const lowered = String(color || '').toLowerCase();
            if (lowered.startsWith('r')) return 'red';
            if (lowered.startsWith('b') && lowered !== 'branco') return 'black';
            if (lowered.startsWith('w') || lowered === 'branco') return 'white';
            return null;
        }

        function normalizeStage(phase) {
            if (!phase || phase === 'ENTRADA') return { label: 'G0', index: 0 };
            const match = /g(\d+)/i.exec(phase);
            if (match) {
                const idx = parseInt(match[1], 10) || 0;
                return { label: `G${idx}`, index: idx };
            }
            return { label: 'G0', index: 0 };
        }

        function calculateBetAmount(stageIndex = 0) {
            if (config.inverseModeEnabled) {
                return calculateInverseBetAmount();
            }
            const multiplier = Math.max(1, Number(config.galeMultiplier) || 1);
            const base = Math.max(0.01, Number(config.baseStake) || AUTO_BET_DEFAULTS.baseStake);
            const exponent = getNextColorStageIndex(stageIndex);
            return Number((base * Math.pow(multiplier, exponent)).toFixed(2));
        }

        function getInverseInitialAmount() {
            const base = Math.max(0.01, Number(config.baseStake) || AUTO_BET_DEFAULTS.baseStake);
            const factor = Math.max(1, Number(runtime.inverseCycleBaseFactor || runtime.inverseNextBaseFactor || 1));
            return Number((base * factor).toFixed(2));
        }

        function calculateInverseBetAmount() {
            const initialAmount = getInverseInitialAmount();
            const betsCount = runtime.openCycle && Array.isArray(runtime.openCycle.bets)
                ? runtime.openCycle.bets.length
                : 0;
            if (betsCount === 0) {
                return initialAmount;
            }
            if (betsCount === 1) {
                return initialAmount;
            }
            const multiplier = Math.max(1, Number(config.galeMultiplier) || 1);
            const lastBet = runtime.openCycle.bets[betsCount - 1];
            const prevAmount = Number(lastBet.amount || initialAmount);
            return Number((prevAmount * multiplier).toFixed(2));
        }

        function hasContinuationFlag(entry) {
            return Object.keys(entry || {}).some(key => key.startsWith('continuingToG'));
        }

        function finalizeCycle(outcome, latestEntry = null) {
            if (!runtime.openCycle || !runtime.openCycle.bets || !runtime.openCycle.bets.length) {
                cancelPendingHistoryRecord('cancelled');
                runtime.openCycle = null;
                updateSimulationSnapshots();
                persistRuntime(true);
                updateStatusUI();
                resetActiveBetCards(config.whiteProtection);
                return;
            }
            const bets = runtime.openCycle.bets;
            const whiteBets = runtime.openCycle.whiteBets || [];
            const totalColorInvested = bets.reduce((sum, bet) => sum + Number(bet.amount || 0), 0);
            const totalWhiteInvested = whiteBets.reduce((sum, bet) => sum + Number(bet.amount || 0), 0);
            const totalInvested = totalColorInvested + totalWhiteInvested;
            let delta = 0;
            if (outcome === 'WIN') {
                const lastBet = bets[bets.length - 1];
                const payoutMultiplier = runtime.openCycle.color === 'white'
                    ? (config.whitePayoutMultiplier || 14)
                    : 2;
                delta = (lastBet.amount * payoutMultiplier) - totalInvested;
                runtime.totalWins = (runtime.totalWins || 0) + 1;
            } else {
                delta = -totalInvested;
                runtime.totalLosses = (runtime.totalLosses || 0) + 1;
            }
            if (delta >= 0) {
                runtime.totalProfitEarned = Number((runtime.totalProfitEarned || 0) + delta);
            } else {
                runtime.totalLossSpent = Number((runtime.totalLossSpent || 0) + Math.abs(delta));
            }
            runtime.profit = Number((Number(runtime.profit || 0) + delta).toFixed(2));

            const lastBet = bets[bets.length - 1] || null;
            const betColor = resolveColorKey(lastBet?.color || runtime.openCycle?.color);
            const lastStageLabel = lastBet?.stage || betCardState[betColor]?.stage || 'G0';
            const displayAmount = Number(lastBet?.amount || totalColorInvested);
            const payoutMultiplier = runtime.openCycle.color === 'white'
                ? (config.whitePayoutMultiplier || 14)
                : 2;
            const shouldCountWhiteAsWin = !!analyzerConfigSnapshot?.whiteProtectionAsWin;
            const whiteBetPlaced = totalWhiteInvested > 0;
            const treatWhiteAsLoss = runtime.openCycle.color === 'white'
                && (!whiteBetPlaced || !config.whiteProtection);

            const adjustedOutcome = treatWhiteAsLoss
                ? 'LOSS'
                : (outcome === 'WIN' && runtime.openCycle.color === 'white' && !shouldCountWhiteAsWin
                    ? 'LOSS'
                    : outcome);
            const colorNet = adjustedOutcome === 'WIN'
                ? Number(((displayAmount * payoutMultiplier) - totalColorInvested).toFixed(2))
                : -totalColorInvested;
            if (adjustedOutcome === 'LOSS') {
                recordLoss(betColor, displayAmount);
            }
            setColorBetResult(betColor, lastStageLabel, displayAmount, colorNet);

            if (whiteBetPlaced) {
                const whiteStage = betCardState.white.stage !== '—' ? betCardState.white.stage : lastStageLabel;
                const whiteNet = adjustedOutcome === 'WIN'
                    ? totalWhiteInvested * (config.whitePayoutMultiplier || 14) - totalWhiteInvested
                    : -totalWhiteInvested;
                if (whiteNet < 0) {
                    recordLoss('white', totalWhiteInvested);
                }
                setWhiteBetResult(whiteStage, totalWhiteInvested, whiteNet);
            } else {
                const whiteStatus = config.whiteProtection
                    ? 'Proteção desativada (ciclo atual)'
                    : 'Proteção desativada';
                setWhiteCardIdle(whiteStatus);
            }

            finalizeHistoryRecord(adjustedOutcome, delta, latestEntry, {
                totalInvested,
                totalColorInvested,
                totalWhiteInvested,
                lastAmount: displayAmount
            });

            runtime.openCycle = null;
            evaluateStops();
            updateSimulationSnapshots();
            if (config.inverseModeEnabled) {
                const multiplier = Math.max(1, Number(config.galeMultiplier) || 1);
                runtime.inverseNextBaseFactor = adjustedOutcome === 'WIN' ? multiplier : 1;
            } else {
                runtime.inverseNextBaseFactor = 1;
                runtime.inverseCycleBaseFactor = 1;
            }
            persistRuntime();
            updateStatusUI();
        }

        function evaluateStops() {
            const previousReason = runtime.blockedReason;
            let nextReason = null;
            if (config.stopWin > 0 && runtime.profit >= config.stopWin) {
                nextReason = 'STOP_WIN';
            } else if (config.stopLoss > 0 && runtime.profit <= -config.stopLoss) {
                nextReason = 'STOP_LOSS';
            }
            const currentBank = getInitialBalanceValue() + Number(runtime.profit || 0);
            if (currentBank <= 0) {
                nextReason = nextReason || 'BANK_ZERO';
            }
            if (nextReason) {
                runtime.blockedReason = nextReason;
                if (nextReason !== previousReason) {
                    const label = nextReason === 'STOP_WIN'
                        ? 'Stop WIN atingido'
                        : nextReason === 'STOP_LOSS'
                            ? 'Stop LOSS atingido'
                            : 'Banca esgotada';
                    pauseAnalysisForAutoBet(label);
                }
            } else if (previousReason && (previousReason.startsWith('STOP') || previousReason === 'BANK_ZERO')) {
                runtime.blockedReason = null;
            }
        }
    })();
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // 🔄 GERENCIAMENTO DE PREFERÊNCIAS DE SINCRONIZAÇÃO
    // ═══════════════════════════════════════════════════════════════════════════════
    
    // Salvar preferência de sincronização de padrões
    function saveSyncPatternPreference(shouldSync) {
        localStorage.setItem('syncPatternsToAccount', shouldSync ? 'true' : 'false');
        console.log(`💾 Preferência de sincronização de padrões salva: ${shouldSync ? 'ATIVADA' : 'DESATIVADA'}`);
    }
    
    // Carregar preferência de sincronização de padrões
    function getSyncPatternPreference() {
        const pref = localStorage.getItem('syncPatternsToAccount');
        // Padrão: true (sempre sincronizar se não houver preferência salva)
        return pref === null ? true : pref === 'true';
    }
    
    // Salvar preferência de sincronização de configurações
    function saveSyncConfigPreference(shouldSync) {
        localStorage.setItem('syncConfigToAccount', shouldSync ? 'true' : 'false');
        console.log(`💾 Preferência de sincronização de configurações salva: ${shouldSync ? 'ATIVADA' : 'DESATIVADA'}`);
    }
    
    // Carregar preferência de sincronização de configurações
    function getSyncConfigPreference() {
        const pref = localStorage.getItem('syncConfigToAccount');
        // Padrão: true (sempre sincronizar se não houver preferência salva)
        return pref === null ? true : pref === 'true';
    }

function areValuesEqual(a, b) {
    if (a === b) return true;
    if (typeof a === 'object' && typeof b === 'object') {
        try {
            return JSON.stringify(a) === JSON.stringify(b);
        } catch (error) {
            return false;
        }
    }
    return false;
}

async function updateAnalyzerConfigPartial(partial, options = {}) {
    if (!partial || typeof partial !== 'object') return null;
    const { respectSyncPreference = true } = options;
    
    try {
        const stored = await storageCompat.get(['analyzerConfig']);
        const currentConfig = stored?.analyzerConfig || {};
        let hasChanges = false;
        const updatedConfig = { ...currentConfig };
        
        Object.keys(partial).forEach((key) => {
            const newValue = partial[key];
            if (!areValuesEqual(updatedConfig[key], newValue)) {
                updatedConfig[key] = newValue;
                hasChanges = true;
            }
        });
        
        if (!hasChanges) {
            return currentConfig;
        }
        
        await storageCompat.set({ analyzerConfig: updatedConfig });
        
        const shouldSync = respectSyncPreference ? getSyncConfigPreference() : true;
        if (shouldSync) {
            try {
                await syncConfigToServer(updatedConfig);
            } catch (error) {
                console.warn('⚠️ Não foi possível sincronizar configurações com o servidor:', error);
            }
        }
        
        return updatedConfig;
    } catch (error) {
        console.warn('⚠️ Erro ao atualizar configuração parcial:', error);
        return null;
    }
}

async function persistAnalyzerState(newState) {
    try {
        await updateAnalyzerConfigPartial({ analysisEnabled: !!newState });
    } catch (error) {
        console.warn('⚠️ Não foi possível persistir estado da análise:', error);
    }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // 🔥 MODO PADRÃO QUENTE
    // ═══════════════════════════════════════════════════════════════════════════════
    
    // Obter estado do modo Padrão Quente
    function getHotPatternState() {
        const state = localStorage.getItem('hotPatternMode');
        return state === 'true';
    }
    
    // Salvar estado do modo Padrão Quente
    function setHotPatternState(isActive) {
        localStorage.setItem('hotPatternMode', isActive ? 'true' : 'false');
        console.log(`🔥 Modo Padrão Quente: ${isActive ? 'ATIVADO' : 'DESATIVADO'}`);
    }
    
    // Mostrar status visual do Padrão Quente (DENTRO DO BOTÃO)
    function showHotPatternStatus(status, patternData = null) {
        const btn = document.getElementById('btnHotPattern');
        if (!btn) return;
        
        if (status === 'disabled') {
            btn.innerHTML = 'Padrão Quente';
            btn.style.height = 'auto';
            btn.style.padding = '8px 14px';
            return;
        }
        
        if (status === 'searching') {
            btn.style.height = 'auto';
            btn.style.padding = '12px 14px';
            btn.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 4px; align-items: center;">
                    <div style="font-size: 12px; font-weight: 600;">🔍 Buscando...</div>
                    <div style="font-size: 9px; opacity: 0.7;">Analisando últimos 75 giros</div>
                </div>
            `;
        } else if (status === 'found' && patternData) {
            // ✅ FORMATO CORRETO:
            // [🔴] → [⚫ 19:27] → [🔴 19:26] → [🔴 19:25]
            //  ↑         ↑ padrão histórico (mais recente ao mais antigo)
            // previsão
            // (FUTURO)
            
            // 1. Criar ícone da PREVISÃO (SEM horário, pois é o FUTURO)
            const predictionHTML = `<span class="spin-color-circle-small ${patternData.prediction}"></span>`;
            
            // 2. Criar ícones do PADRÃO com horários de CADA giro
            const patternCirclesHTML = patternData.pattern.map((color, index) => {
                let timeString = '';
                
                // Se temos os timestamps de cada giro do padrão
                if (patternData.patternTimestamps && patternData.patternTimestamps[index]) {
                    const date = new Date(patternData.patternTimestamps[index]);
                    const hours = String(date.getHours()).padStart(2, '0');
                    const minutes = String(date.getMinutes()).padStart(2, '0');
                    timeString = `${hours}:${minutes}`;
                }
                
                if (timeString) {
                    return `<span class="spin-color-circle-small ${color}" style="position: relative; display: inline-flex; align-items: center; justify-content: center;">
                        <span style="position: absolute; font-size: 7px; font-weight: bold; color: white; text-shadow: 0 0 3px rgba(0,0,0,1), 0 0 2px rgba(0,0,0,1); z-index: 1; line-height: 1;">${timeString}</span>
                    </span>`;
                } else {
                    return `<span class="spin-color-circle-small ${color}"></span>`;
                }
            }).join('');
            
            btn.style.height = 'auto';
            btn.style.padding = '10px 14px';
            btn.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 6px; align-items: center; width: 100%;">
                    <div style="font-size: 11px; font-weight: 600;">Padrão Quente</div>
                    <div style="display: flex; gap: 4px; align-items: center; justify-content: center;">
                        ${predictionHTML}
                        <span style="font-size: 10px; font-weight: bold;">→</span>
                        ${patternCirclesHTML}
                    </div>
                    <div style="font-size: 9px; opacity: 0.8;">
                        ${patternData.occurrences} ocorrência${patternData.occurrences > 1 ? 's' : ''}
                    </div>
                </div>
            `;
        } else if (status === 'not_found') {
            btn.style.height = 'auto';
            btn.style.padding = '12px 14px';
            btn.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 4px; align-items: center;">
                    <div style="font-size: 12px; font-weight: 600;">⚠️ Não encontrado</div>
                    <div style="font-size: 9px; opacity: 0.7;">Nenhum padrão com 100% WIN</div>
                </div>
            `;
        }
    }
    // Sincronizar padrões com o servidor
    async function syncPatternsToServer(patterns) {
        console.log('');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('💾 SINCRONIZANDO PADRÕES COM O SERVIDOR');
        console.log('═══════════════════════════════════════════════════════════');
        
        const token = localStorage.getItem('authToken');
        if (!token) {
            console.log('❌ Usuário não autenticado - salvando apenas localmente');
            console.log('═══════════════════════════════════════════════════════════');
            return false;
        }
        
        console.log('✅ Token de autenticação encontrado');
        console.log('📦 Padrões a serem salvos:', patterns.length);
        patterns.forEach((p, i) => {
            console.log(`   ${i + 1}. ${p.name} (${p.sequence.join(' → ')})`);
        });
        console.log('');
        
        try {
            const apiUrl = getApiUrl();
            console.log('🌐 Enviando para:', `${apiUrl}/api/user/custom-patterns`);
            
            const response = await fetch(`${apiUrl}/api/user/custom-patterns`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ patterns })
            });
            
            console.log('📨 Status da resposta:', response.status, response.statusText);
            
            if (!response.ok) {
                console.error('❌ Servidor retornou erro:', response.status);
                if (response.status === 401 || response.status === 403) {
                    forceLogout('Sessão encerrada ao sincronizar padrões');
                    console.log('═══════════════════════════════════════════════════════════');
                    return false;
                }
                const errorText = await response.text();
                console.error('❌ Resposta:', errorText);
                console.log('═══════════════════════════════════════════════════════════');
                return false;
            }
            
            const data = await response.json();
            console.log('📋 Resposta do servidor:', data);
            
            if (data.success) {
                console.log('✅✅✅ PADRÕES SINCRONIZADOS COM SUCESSO!');
                console.log('═══════════════════════════════════════════════════════════');
                console.log('');
                return true;
            } else {
                console.error('❌ Servidor retornou sucesso=false:', data.error);
                console.log('═══════════════════════════════════════════════════════════');
                return false;
            }
        } catch (error) {
            console.error('❌❌❌ ERRO CRÍTICO na requisição:', error);
            console.error('📋 Stack:', error.stack);
            console.log('═══════════════════════════════════════════════════════════');
            console.log('');
            return false;
        }
    }
    
    // Carregar padrões do servidor
    async function loadPatternsFromServer() {
        console.log('');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('📥 CARREGANDO PADRÕES DO SERVIDOR');
        console.log('═══════════════════════════════════════════════════════════');
        
        const token = localStorage.getItem('authToken');
        if (!token) {
            console.log('❌ Usuário não autenticado - carregando apenas do localStorage');
            console.log('═══════════════════════════════════════════════════════════');
            return null;
        }
        
        console.log('✅ Token de autenticação encontrado');
        console.log('');
        
        try {
            const apiUrl = getApiUrl();
            console.log('🌐 Buscando de:', `${apiUrl}/api/user/custom-patterns`);
            
            const response = await fetch(`${apiUrl}/api/user/custom-patterns`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            console.log('📨 Status da resposta:', response.status, response.statusText);
            
            // ✅ VERIFICAR STATUS ANTES DE PARSEAR JSON
            if (!response.ok) {
                console.error('❌ Servidor retornou erro:', response.status);
                const errorText = await response.text();
                console.error('❌ Resposta:', errorText);
                
                if (response.status === 401 || response.status === 403) {
                    forceLogout('Sessão não autorizada ao carregar padrões');
                    console.log('═══════════════════════════════════════════════════════════');
                    return null;
                }
                
                console.log('═══════════════════════════════════════════════════════════');
                return null;
            }
            
            const data = await response.json();
            console.log('📋 Resposta do servidor:', data);
            
            if (data.success) {
                console.log('✅✅✅ PADRÕES CARREGADOS COM SUCESSO!');
                console.log('📦 Total de padrões:', data.patterns.length);
                data.patterns.forEach((p, i) => {
                    console.log(`   ${i + 1}. ${p.name} (${p.sequence.join(' → ')})`);
                });
                console.log('═══════════════════════════════════════════════════════════');
                console.log('');
                return data.patterns;
            } else {
                console.error('❌ Servidor retornou sucesso=false:', data.error);
                console.log('═══════════════════════════════════════════════════════════');
                return null;
            }
        } catch (error) {
            console.error('❌❌❌ ERRO CRÍTICO ao carregar padrões:', error);
            console.error('📋 Stack:', error.stack);
            console.log('═══════════════════════════════════════════════════════════');
            console.log('');
            return null;
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // 🔧 SINCRONIZAÇÃO DE CONFIGURAÇÕES COM O SERVIDOR
    // ═══════════════════════════════════════════════════════════════════════════════
    
    // Salvar configurações no servidor
    async function syncConfigToServer(config) {
        const token = localStorage.getItem('authToken');
        if (!token) {
            console.log('⚠️ Usuário não autenticado - salvando apenas localmente');
            return false;
        }
        
        try {
            // ✅ REMOVER aiMode da sincronização - cada dispositivo tem seu próprio modo!
            const configToSync = { ...config };
            delete configToSync.aiMode;
            
            const apiUrl = getApiUrl();
            const response = await fetch(`${apiUrl}/api/user/settings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ settings: configToSync })
            });
            
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    forceLogout('Sessão não autorizada ao sincronizar configurações');
                    return false;
                }
                return false;
            }
            
            const data = await response.json();
            
            if (data.success) {
                console.log('✅ Configurações sincronizadas com a conta do usuário');
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('❌ Erro ao sincronizar configurações:', error);
            return false;
        }
    }
    
    // Carregar configurações do servidor
    async function loadConfigFromServer() {
        const token = localStorage.getItem('authToken');
        if (!token) {
            console.log('⚠️ Usuário não autenticado - carregando apenas do localStorage');
            return null;
        }
        
        try {
            const apiUrl = getApiUrl();
            const response = await fetch(`${apiUrl}/api/user/settings`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    forceLogout('Sessão não autorizada ao carregar configurações');
                    return null;
                }
                return null;
            }
            
            const data = await response.json();
            
            if (data.success && data.settings) {
                console.log('✅ Configurações carregadas do servidor');
                return data.settings;
            }
            
            return null;
        } catch (error) {
            console.error('❌ Erro ao carregar configurações do servidor:', error);
            return null;
        }
    }
    
    // Salvar modelo customizado
    async function saveCustomPatternModel() {
        const name = document.getElementById('customPatternName').value.trim();
        const sequenceDiv = document.getElementById('customPatternSequence');
        const colorBadges = sequenceDiv.querySelectorAll('.sequence-color-item');
        const beforeColorRadio = document.querySelector('input[name="beforeColor"]:checked');
        const saveBtn = document.getElementById('saveCustomPattern');
        
        // Verificar se está em modo edição
        const editingId = saveBtn ? saveBtn.getAttribute('data-editing-id') : null;
        const isEditMode = !!editingId;
        
        // Validações
        if (!name) {
            alert('❌ Por favor, digite um nome para o modelo!');
            return;
        }
        
        if (colorBadges.length < 2) {
            alert('❌ A sequência deve ter pelo menos 2 cores!');
            return;
        }
        
        // Extrair sequência
        const sequence = Array.from(colorBadges).map(badge => badge.dataset.color);
        const beforeColor = beforeColorRadio ? beforeColorRadio.value : 'any';
        
        // Salvar no storage local
        try {
            const result = await storageCompat.get(['customPatterns']);
            let patterns = result.customPatterns || [];
            
            if (isEditMode) {
                // MODO EDIÇÃO: Atualizar padrão existente
                console.log('📝 MODO EDIÇÃO ATIVO');
                console.log('   ID do padrão sendo editado:', editingId);
                console.log('   Total de padrões antes:', patterns.length);
                
                const index = patterns.findIndex(p => p.id === editingId);
                console.log('   Índice encontrado:', index);
                
                if (index !== -1) {
                    const oldPattern = {...patterns[index]};
                    patterns[index] = {
                        ...patterns[index],
                        name: name,
                        sequence: sequence,
                        beforeColor: beforeColor,
                        updatedAt: new Date().toISOString()
                    };
                    console.log('✏️ Padrão ATUALIZADO:');
                    console.log('   Antes:', oldPattern);
                    console.log('   Depois:', patterns[index]);
                    console.log('   Total de padrões depois:', patterns.length);
                } else {
                    console.error('❌ ERRO: Padrão não encontrado para editar!');
                }
            } else {
                // MODO CRIAÇÃO: Criar novo padrão
                console.log('➕ MODO CRIAÇÃO ATIVO');
                const newPattern = {
                    id: 'custom_' + Date.now(),
                    name: name,
                    sequence: sequence,
                    beforeColor: beforeColor,
                    active: true,
                    createdAt: new Date().toISOString()
                };
                patterns.push(newPattern);
                console.log('✅ Novo padrão criado:', newPattern);
                console.log('   Total de padrões:', patterns.length);
            }
            
            await storageCompat.set({ customPatterns: patterns });
            
            // ✅ VERIFICAR SE DEVE SINCRONIZAR COM O SERVIDOR
            const syncCheckbox = document.getElementById('syncPatternToAccount');
            const shouldSync = syncCheckbox ? syncCheckbox.checked : true;
            
            // Salvar preferência do usuário
            if (syncCheckbox) {
                saveSyncPatternPreference(shouldSync);
            }
            
            if (shouldSync) {
                console.log('☁️ Sincronização ATIVADA - enviando para o servidor...');
                const synced = await syncPatternsToServer(patterns);
                if (synced) {
                    console.log('✅ Padrão sincronizado com a conta do usuário');
                } else {
                    console.log('⚠️ Não foi possível sincronizar (usuário pode não estar autenticado)');
                }
            } else {
                console.log('💾 Sincronização DESATIVADA - salvando apenas localmente');
                console.log('✅ Padrão salvo apenas no dispositivo');
            }
            
            // Resetar botão (remover modo edição)
            if (saveBtn) {
                saveBtn.textContent = '💾 Salvar Modelo';
                saveBtn.removeAttribute('data-editing-id');
            }
            
            // Fechar modal de criação
            closeCustomPatternModal();
            
            // Atualizar lista
            await loadCustomPatternsList();
            
            // ✅ Se estava editando, reabrir modal de visualização
            if (isEditMode) {
                setTimeout(() => {
                    const viewModal = document.getElementById('viewPatternsModal');
                    if (viewModal) {
                        viewModal.style.display = 'flex';
                        
                        // ✅ CENTRALIZAR MODAL COM BASE NA POSIÇÃO DA EXTENSÃO (com delay extra para renderização)
                        setTimeout(() => {
                            const sidebar = document.getElementById('blaze-double-analyzer');
                            if (sidebar) {
                                const rect = sidebar.getBoundingClientRect();
                                const modalContent = viewModal.querySelector('.custom-pattern-modal-content');
                                
                                if (modalContent) {
                                    // Centralizar horizontalmente com a sidebar
                                    const sidebarCenterX = rect.left + (rect.width / 2);
                                    const modalWidth = modalContent.offsetWidth || 500;
                                    let leftPosition = sidebarCenterX - (modalWidth / 2);
                                    
                                    // Garantir que o modal não saia da tela
                                    const margin = 20;
                                    if (leftPosition < margin) leftPosition = margin;
                                    if (leftPosition + modalWidth > window.innerWidth - margin) {
                                        leftPosition = window.innerWidth - modalWidth - margin;
                                    }
                                    
                                    // Centralizar verticalmente na tela
                                    const modalHeight = modalContent.offsetHeight || 400;
                                    let topPosition = (window.innerHeight - modalHeight) / 2;
                                    if (topPosition < margin) topPosition = margin;
                                    
                                    modalContent.style.left = leftPosition + 'px';
                                    modalContent.style.top = topPosition + 'px';
                                    modalContent.style.transform = 'none';
                                }
                            }
                        }, 10);
                        
                        console.log('✅ Modal de visualização reaberto e centralizado após edição');
                    }
                }, 100);
            }
            
            // Notificar background.js para atualizar cache imediatamente
            console.log('📤 Enviando atualização para background.js...');
            console.log(`   Total de padrões: ${patterns.length}`);
            if (isEditMode) {
                const editedPattern = patterns.find(p => p.id === editingId);
                console.log(`   Padrão editado: "${editedPattern?.name}"`);
                console.log(`   Nova sequência: [${editedPattern?.sequence.join(' → ')}]`);
            }
            
            chrome.runtime.sendMessage({ 
                type: 'CUSTOM_PATTERNS_UPDATED', 
                data: patterns 
            }, (response) => {
                if (response?.success) {
                    console.log('✅ Background.js confirmou atualização do cache!');
                } else {
                    console.warn('⚠️ Sem resposta do background.js');
                }
            });
            
            // Toast simples (2 segundos)
            const message = isEditMode ? '✓ Padrão atualizado' : '✓ Modelo salvo';
            showToast(message + (synced ? ' e sincronizado' : ''));
            
        } catch (error) {
            console.error('❌ Erro ao salvar modelo:', error);
            showToast('✗ Erro ao salvar');
        }
    }
    
    // Carregar lista de modelos customizados
    async function loadCustomPatternsList() {
        try {
            let patterns = [];
            
            // ✅ VERIFICAR SE USUÁRIO QUER SINCRONIZAR
            const shouldSync = getSyncPatternPreference();
            
            if (shouldSync) {
                console.log('☁️ Sincronização de padrões ATIVADA - tentando carregar do servidor...');
                // ✅ TENTAR CARREGAR DO SERVIDOR PRIMEIRO (se autenticado)
                const serverPatterns = await loadPatternsFromServer();
                
                if (serverPatterns !== null) {
                    // Carregar do servidor e atualizar localStorage
                    patterns = serverPatterns;
                    await storageCompat.set({ customPatterns: patterns });
                    console.log('✅ Padrões carregados do servidor e sincronizados localmente');
                } else {
                    // Carregar do localStorage (fallback se servidor falhar)
                    const result = await storageCompat.get(['customPatterns']);
                    patterns = result.customPatterns || [];
                    console.log('⚠️ Não foi possível carregar do servidor - usando padrões locais');
                }
            } else {
                console.log('💾 Sincronização de padrões DESATIVADA - usando APENAS padrões locais');
                // Carregar APENAS do localStorage
                const result = await storageCompat.get(['customPatterns']);
                patterns = result.customPatterns || [];
                console.log('✅ Padrões carregados do localStorage');
            }
            
            // Atualizar contador no botão
            const patternsCountSpan = document.getElementById('patternsCount');
            const btnViewPatterns = document.getElementById('btnViewCustomPatterns');
            
            if (patternsCountSpan) {
                patternsCountSpan.textContent = patterns.length;
            }
            
            if (btnViewPatterns) {
                btnViewPatterns.style.display = patterns.length > 0 ? 'block' : 'none';
            }
            
            // Preencher modal de visualização
            const viewPatternsList = document.getElementById('viewPatternsList');
            const modalPatternsCount = document.getElementById('modalPatternsCount');
            
            if (modalPatternsCount) {
                modalPatternsCount.textContent = patterns.length;
            }
            
            if (viewPatternsList) {
                if (patterns.length === 0) {
                    viewPatternsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Nenhum padrão criado ainda</div>';
                } else {
                    // Inverter a ordem para mostrar o mais recente primeiro
                    const patternsReversed = [...patterns].reverse();
                    
                    // ✅ Mensagem de análise dinâmica UMA VEZ no topo
                    let dynamicAnalysisInfo = `
                        <div style="margin-bottom: 12px; padding: 6px 10px; background: rgba(255, 255, 255, 0.03); border-left: 2px solid rgba(255, 255, 255, 0.2); border-radius: 3px;">
                            <div style="font-size: 8px; color: rgba(255, 255, 255, 0.7); line-height: 1.2;">
                                <strong style="color: rgba(255, 255, 255, 0.9);">Análise Dinâmica:</strong> Quando estes padrões aparecerem, a IA analisará automaticamente qual cor teve ≥70% de frequência no histórico.
                            </div>
                        </div>
                    `;
                    
                    viewPatternsList.innerHTML = dynamicAnalysisInfo + patternsReversed.map((pattern, index) => {
                        // ✅ Marcar o primeiro da lista invertida como "RECENTE" (último cadastrado)
                        const isNewest = (index === 0);
                        
                        // ✅ Cor anterior com texto DENTRO do ícone (METADE/METADE para combinações)
                        let beforeColorHTML = '';
                        if (pattern.beforeColor === 'red-white') {
                            // Ícone dividido QUADRADO: metade vermelha, metade branca (MESMAS CORES E TAMANHO DOS OUTROS)
                            beforeColorHTML = `
                                <div style="position: relative; display: inline-block;">
                                    <span style="display: block; width: 24px; height: 24px; border-radius: 4px; background: linear-gradient(to right, #ff0000 0%, #ff0000 50%, #ffffff 50%, #ffffff 100%); border: 1px solid rgba(255, 255, 255, 0.2); box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);"></span>
                                    <span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 6px; color: rgba(0,0,0,0.9); font-weight: bold; white-space: nowrap; pointer-events: none; text-shadow: 0 0 2px rgba(255,255,255,0.8);">ANT</span>
                                </div>
                            `;
                        } else if (pattern.beforeColor === 'black-white') {
                            // Ícone dividido QUADRADO: metade preta, metade branca (MESMAS CORES E TAMANHO DOS OUTROS)
                            beforeColorHTML = `
                                <div style="position: relative; display: inline-block;">
                                    <span style="display: block; width: 24px; height: 24px; border-radius: 4px; background: linear-gradient(to right, #2a2a2a 0%, #2a2a2a 50%, #ffffff 50%, #ffffff 100%); border: 1px solid rgba(255, 255, 255, 0.2); box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);"></span>
                                    <span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 6px; color: rgba(255,255,255,0.9); font-weight: bold; white-space: nowrap; pointer-events: none; text-shadow: 0 0 2px rgba(0,0,0,0.8);">ANT</span>
                                </div>
                            `;
                        } else {
                            // Ícone único normal
                            beforeColorHTML = `
                                <div style="position: relative; display: inline-block;">
                                    <span class="spin-color-circle-small ${pattern.beforeColor}"></span>
                                    <span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 6px; color: rgba(255,255,255,0.7); font-weight: bold; white-space: nowrap; pointer-events: none;">ANT</span>
                                </div>
                            `;
                        }
                        
                        // ✅ Construir a sequência com setas DENTRO dos ícones
                        const sequenceHTML = pattern.sequence.map((color, idx) => {
                            const isLast = (idx === pattern.sequence.length - 1);
                            
                            if (isLast) {
                                // Último ícone: sem texto (cor será definida pela IA dinamicamente)
                                return `
                                    <div style="position: relative; display: inline-block;">
                                        <span class="spin-color-circle-small ${color}"></span>
                                    </div>
                                `;
                            } else {
                                // Ícones intermediários: adicionar seta dentro
                                return `
                                    <div style="position: relative; display: inline-block;">
                                        <span class="spin-color-circle-small ${color}"></span>
                                        <span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 10px; color: rgba(255,255,255,0.5); font-weight: bold; pointer-events: none;">→</span>
                                    </div>
                                `;
                            }
                        }).join('');
                        
                        return `
                            <div class="view-pattern-item" style="${isNewest ? 'border: 2px solid #ef4444; box-shadow: 0 0 8px rgba(239, 68, 68, 0.3);' : ''}">
                                <div class="view-pattern-name">
                                    ${pattern.name}
                                    ${isNewest ? '<span style="background: #ef4444; color: #ffffff; font-size: 9px; padding: 2px 6px; border-radius: 3px; margin-left: 8px; font-weight: bold;">MAIS RECENTE</span>' : ''}
                                </div>
                                <div style="display: flex; align-items: center; gap: 2px; flex-wrap: wrap; margin-top: 6px;">
                                    ${beforeColorHTML}
                                    ${sequenceHTML}
                                </div>
                                <div style="position: absolute; top: 8px; right: 8px; display: flex; gap: 10px; align-items: center;">
                                    <button style="background: transparent; border: none; color: #00d4ff; font-size: 11px; cursor: pointer; padding: 4px 8px; transition: all 0.2s; font-weight: bold;" 
                                            onmouseover="this.style.color='#00ff88'; this.style.textDecoration='underline';" 
                                            onmouseout="this.style.color='#00d4ff'; this.style.textDecoration='none';"
                                            onclick="editCustomPatternFromView('${pattern.id}')" 
                                            title="Editar padrão">Editar</button>
                                    <button style="background: transparent; border: none; color: #ff6666; font-size: 16px; cursor: pointer; padding: 4px; transition: all 0.2s;" 
                                            onmouseover="this.style.opacity='1'; this.style.transform='scale(1.2)';" 
                                            onmouseout="this.style.opacity='0.6'; this.style.transform='scale(1)';"
                                            onclick="removeCustomPatternFromView('${pattern.id}')" 
                                            title="Remover padrão">✕</button>
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            }
            
            console.log(`📋 ${patterns.length} modelo(s) customizado(s) carregado(s)`);
            
        } catch (error) {
            console.error('❌ Erro ao carregar modelos:', error);
        }
    }
    
    // Editar modelo customizado (do modal de visualização)
    window.editCustomPatternFromView = async function(patternId) {
        try {
            const result = await storageCompat.get(['customPatterns']);
            const patterns = result.customPatterns || [];
            const pattern = patterns.find(p => p.id === patternId);
            
            if (!pattern) {
                showToast('✗ Padrão não encontrado');
                return;
            }
            
            console.log('✏️ Editando padrão:', pattern);
            
            // Fechar modal de visualização
            const viewModal = document.getElementById('viewPatternsModal');
            if (viewModal) {
                viewModal.style.display = 'none';
            }
            
            // Abrir modal de criação em modo edição (IDs CORRETOS)
            const modal = document.getElementById('customPatternModal');
            if (!modal) {
                console.error('❌ Modal customPatternModal não encontrado!');
                showToast('✗ Erro ao abrir editor');
                return;
            }
            
            modal.style.display = 'flex';
            
            // Preencher campos com dados do padrão (IDs CORRETOS)
            const nameInput = document.getElementById('customPatternName');
            const sequenceDiv = document.getElementById('customPatternSequence');
            const saveBtn = document.getElementById('saveCustomPattern');
            
            console.log('📝 Preenchendo campos...');
            console.log('   Nome input:', nameInput);
            console.log('   Sequência div:', sequenceDiv);
            console.log('   Botão salvar:', saveBtn);
            
            // Preencher nome
            if (nameInput) {
                nameInput.value = pattern.name;
                console.log('   ✅ Nome preenchido:', pattern.name);
            }
            
            // Limpar e reconstruir sequência (MESMO FORMATO DO ORIGINAL)
            if (sequenceDiv) {
                sequenceDiv.innerHTML = '';
                pattern.sequence.forEach((color, index) => {
                    const colorBadge = document.createElement('div');
                    colorBadge.className = `sequence-color-item ${color}`;
                    colorBadge.dataset.color = color;
                    colorBadge.innerHTML = `<span class="spin-color-circle-small ${color}"></span>`;
                    
                    // Adicionar evento de clique para remover (igual ao original)
                    colorBadge.addEventListener('click', function() {
                        this.remove();
                    });
                    
                    sequenceDiv.appendChild(colorBadge);
                });
                console.log('   ✅ Sequência reconstruída:', pattern.sequence);
            }
            
            // Selecionar cor anterior (radio buttons)
            const beforeColorRadio = document.querySelector(`input[name="beforeColor"][value="${pattern.beforeColor}"]`);
            if (beforeColorRadio) {
                beforeColorRadio.checked = true;
                console.log('   ✅ Cor anterior selecionada:', pattern.beforeColor);
            }
            
            // Mudar botão para modo "Salvar Edição"
            if (saveBtn) {
                saveBtn.textContent = '💾 Salvar Edição';
                saveBtn.setAttribute('data-editing-id', patternId);
                console.log('   ✅ Botão configurado para modo edição');
            }
            
            // ✅ Carregar preferência de sincronização
            const syncCheckbox = document.getElementById('syncPatternToAccount');
            if (syncCheckbox) {
                syncCheckbox.checked = getSyncPatternPreference();
                console.log(`   🔄 Preferência de sincronização carregada: ${syncCheckbox.checked ? 'ATIVADA' : 'DESATIVADA'}`);
            }
            
            console.log('✅ Modal de edição aberto com sucesso!');
            
        } catch (error) {
            console.error('❌ Erro ao editar padrão:', error);
            showToast('✗ Erro ao editar');
        }
    };
    
    // Remover modelo customizado (do modal de visualização)
    window.removeCustomPatternFromView = async function(patternId) {
        try {
            console.log('');
            console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #FF6666; font-weight: bold;');
            console.log('%c║  🗑️ REMOVENDO PADRÃO CUSTOMIZADO                        ║', 'color: #FF6666; font-weight: bold;');
            console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #FF6666; font-weight: bold;');
            console.log(`   ID do padrão: ${patternId}`);
            console.log('');
            
            const result = await storageCompat.get(['customPatterns']);
            let patterns = result.customPatterns || [];
            
            console.log(`📊 ANTES da exclusão: ${patterns.length} padrão(ões)`);
            patterns.forEach((p, idx) => {
                console.log(`   ${idx + 1}. "${p.name}" (ID: ${p.id}) ${p.id === patternId ? '← 🎯 ESTE SERÁ REMOVIDO' : ''}`);
            });
            console.log('');
            
            const patternToRemove = patterns.find(p => p.id === patternId);
            if (patternToRemove) {
                console.log(`%c🎯 Padrão encontrado para remoção: "${patternToRemove.name}"`, 'color: #FF6666; font-weight: bold;');
                console.log(`   Sequência: ${patternToRemove.sequence.join(' → ')}`);
            } else {
                console.log(`%c❌ ERRO: Padrão ${patternId} NÃO encontrado!`, 'color: #FF0000; font-weight: bold;');
                showToast('✗ Padrão não encontrado');
                return;
            }
            console.log('');
            
            patterns = patterns.filter(p => p.id !== patternId);
            
            console.log(`📊 DEPOIS da exclusão: ${patterns.length} padrão(ões)`);
            if (patterns.length > 0) {
                patterns.forEach((p, idx) => {
                    console.log(`   ${idx + 1}. "${p.name}" (ID: ${p.id})`);
                });
            } else {
                console.log('   (Nenhum padrão restante)');
            }
            console.log('');
            
            await storageCompat.set({ customPatterns: patterns });
            console.log('%c✅ Storage local atualizado!', 'color: #00FF88; font-weight: bold;');
            console.log('');
            
            // ✅ VERIFICAR SE DEVE SINCRONIZAR REMOÇÃO COM O SERVIDOR
            const shouldSync = getSyncPatternPreference();
            let synced = false;
            
            if (shouldSync) {
                console.log('☁️ Sincronização ATIVADA - enviando remoção para o servidor...');
                synced = await syncPatternsToServer(patterns);
                if (synced) {
                    console.log('✅ Remoção sincronizada com o servidor');
                } else {
                    console.log('⚠️ Não foi possível sincronizar remoção');
                }
            } else {
                console.log('💾 Sincronização DESATIVADA - removendo apenas localmente');
            }
            console.log('');
            
            // Atualizar lista
            loadCustomPatternsList();
            
            // Notificar background.js
            console.log('%c📤 ENVIANDO ATUALIZAÇÃO PARA BACKGROUND.JS...', 'color: #FFD700; font-weight: bold;');
            console.log(`   Tipo: CUSTOM_PATTERNS_UPDATED`);
            console.log(`   Total de padrões: ${patterns.length}`);
            chrome.runtime.sendMessage({ 
                type: 'CUSTOM_PATTERNS_UPDATED', 
                data: patterns 
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('%c❌ ERRO ao enviar mensagem:', 'color: #FF0000; font-weight: bold;', chrome.runtime.lastError);
                } else {
                    console.log('%c✅ Mensagem enviada com sucesso para background.js!', 'color: #00FF88; font-weight: bold;');
                }
            });
            console.log('');
            
            // Toast
            showToast('✓ Modelo removido' + (synced ? ' e sincronizado' : ''));
            
        } catch (error) {
            console.error('❌ Erro ao remover modelo:', error);
            showToast('✗ Erro ao remover');
        }
    };
    // Create sidebar
    function createSidebar() {
        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #FFD700; font-weight: bold;');
        console.log('%c🔨 EXECUTANDO createSidebar()...', 'color: #FFD700; font-weight: bold;');
        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #FFD700; font-weight: bold;');
        
        // Remove existing sidebar if any
        const existingSidebar = document.getElementById('blaze-double-analyzer');
        if (existingSidebar) {
            console.log('%c🗑️ Removendo sidebar existente...', 'color: #FFA500;');
            existingSidebar.remove();
        } else {
            console.log('%c✅ Nenhuma sidebar existente encontrada', 'color: #00FF88;');
        }
        if (autoBetHistoryUnsubscribe) {
            autoBetHistoryUnsubscribe();
            autoBetHistoryUnsubscribe = null;
        }
        entriesTabsReady = false;
        entriesTabsBound = false;
        activeEntriesTab = 'entries';
        
        console.log('%c🏗️ Criando elemento sidebar...', 'color: #00AAFF;');
        
        // Create sidebar container
        const sidebar = document.createElement('div');
        sidebar.id = 'blaze-double-analyzer';
        
        console.log('%c📝 Adicionando HTML interno...', 'color: #00AAFF;');
        
        sidebar.innerHTML = `
            <div class="resize-handles">
                <div class="resize-handle resize-n"></div>
                <div class="resize-handle resize-s"></div>
                <div class="resize-handle resize-e"></div>
                <div class="resize-handle resize-w"></div>
                <div class="resize-handle resize-ne"></div>
                <div class="resize-handle resize-nw"></div>
                <div class="resize-handle resize-se"></div>
                <div class="resize-handle resize-sw"></div>
            </div>
            <div class="analyzer-header" id="sidebarHeader">
                <div class="header-content">
                    <div class="header-main">
                    <h3 class="header-title">Double Analyzer <span class="title-badge" id="titleBadge">PREMIUM</span></h3>
                        <button type="button" class="user-menu-toggle" id="userMenuToggle" title="Abrir informações da conta" aria-controls="userMenuPanel" aria-expanded="false">
                            <span></span>
                            <span></span>
                            <span></span>
                        </button>
                    </div>
                    <div class="ai-mode-toggle" id="aiModeToggle" title="Ativar/Desativar Modo Diamante">
                        <span class="mode-name">Ativar Modo Diamante</span>
                        <div class="mode-api-container" style="display: none;">
                            <div class="mode-api-header-simple">
                                <span class="mode-api-title-simple">IA</span>
                            </div>
                            <div class="mode-api-status" id="modeApiStatus"></div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="user-menu-panel" id="userMenuPanel" role="region" aria-labelledby="userMenuTitle">
                <div class="user-menu-header">
                    <div class="user-menu-title" id="userMenuTitle">Minha Conta</div>
                    <button type="button" class="user-menu-close" id="userMenuClose">Fechar</button>
                </div>
                <div class="user-menu-body">
                    <div class="user-info-item">
                        <span class="user-info-label">Nome</span>
                        <span class="user-info-value" id="userMenuName">—</span>
                    </div>
                    <div class="user-info-item">
                        <span class="user-info-label">Email</span>
                        <span class="user-info-value" id="userMenuEmail">—</span>
                    </div>
                    <div class="user-info-item">
                        <span class="user-info-label">Plano</span>
                        <span class="user-info-value plan" id="userMenuPlan">—</span>
                    </div>
                    <div class="user-info-item">
                        <span class="user-info-label">Ativado em</span>
                        <span class="user-info-value" id="userMenuPurchase">—</span>
                    </div>
                    <div class="user-info-item">
                        <span class="user-info-label">Dias restantes</span>
                        <span class="user-info-value" id="userMenuDays">—</span>
                    </div>
                </div>
                <div class="user-menu-footer">
                    <button type="button" class="user-menu-logout" id="userMenuLogout">Sair da conta</button>
                </div>
            </div>
            <div class="analyzer-content" id="analyzerContent">
            <div class="auto-bet-summary" id="autoBetSummary">
                <div class="auto-bet-summary-header">
                    <span class="auto-bet-summary-title">Saldo</span>
                    <button type="button" class="auto-bet-hide-btn" id="autoBetHideBtn">Ocultar</button>
                    </div>
                <div class="auto-bet-summary-body">
                    <div class="auto-bet-summary-metrics">
                        <div class="auto-bet-summary-item">
                            <span class="neutral-label">Saldo inicial</span>
                            <strong id="autoBetInitialBalance" class="neutral-value">R$ 0,00</strong>
                    </div>
                        <div class="auto-bet-summary-item">
                            <span class="neutral-label">Lucro</span>
                            <strong id="autoBetMetricProfit" class="positive-value">R$ 0,00</strong>
                </div>
                        <div class="auto-bet-summary-item">
                            <span class="neutral-label">Perdas</span>
                            <strong id="autoBetMetricLoss" class="negative-value">R$ 0,00</strong>
                        </div>
                        <div class="auto-bet-summary-item">
                            <span class="neutral-label">Saldo atual</span>
                            <strong id="autoBetCurrentBalance" class="neutral-value">R$ 0,00</strong>
                    </div>
                    </div>
                    <div class="auto-bet-actions">
                        <button class="auto-bet-config-launcher toggle-analyzer-btn" id="toggleAnalyzerBtn" title="Desativar análises">
                            <span class="toggle-label">Ativar análise</span>
                            <span class="toggle-indicator"></span>
                        </button>
                        <button class="auto-bet-config-launcher config-btn" id="autoBetConfigBtn" title="Configurar autoaposta">
                            <span class="auto-bet-config-bars">
                                <span></span><span></span><span></span>
                            </span>
                        </button>
                    </div>
                </div>
            </div>
            <div class="auto-bet-summary-collapsed" id="autoBetSummaryCollapsed">
                <button type="button" id="autoBetShowBtn">Ver saldo</button>
                </div>
                
            <div class="analysis-lastspin-row">
                 <div class="analysis-section highlight-panel">
                     <h4 id="analysisModeTitle">Aguardando Análise</h4>
                    <div class="analysis-card">
                     <div class="confidence-meter">
                         <div class="confidence-bar">
                             <div class="confidence-fill" id="confidenceFill"></div>
                         </div>
                         <div class="confidence-text" id="confidenceText">0%</div>
                     </div>
                     
                     <div class="suggestion-box" id="suggestionBox">
                         <div class="suggestion-color-wrapper">
                             <div class="suggestion-color" id="suggestionColor"></div>
                            <div class="suggestion-stage" id="suggestionStage"></div>
                         </div>
                        </div>
                     </div>
                </div>
                
                <div class="last-spin-section highlight-panel">
                    <h4>Último Giro</h4>
                    <div class="spin-display center" id="lastSpinDisplay">
                        <div class="spin-number" id="lastSpinNumber">-</div>
                        <div class="spin-meta">
                            <div class="spin-time" id="lastSpinTime">--:--</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="entries-section">
            <div class="entries-panel" id="entriesPanel">
                    <div class="entries-tabs-bar" id="entriesTabs">
                        <button type="button" class="entries-tab active" data-tab="entries">Sinais</button>
                        <button type="button" class="entries-tab" data-tab="bets" aria-disabled="true">Apostas</button>
                    </div>
                <div class="entries-header">
                    <span class="entries-hit" id="entriesHit">Acertos: 0/0 (0%)</span>
                </div>
                    <div class="entries-content">
                        <div class="entries-view" data-view="entries">
                <div class="entries-list" id="entriesList"></div>
                        </div>
                        <div class="entries-view" data-view="bets" hidden>
                            <div class="bets-container" id="betsContainer">
                                <div class="bets-empty">Nenhuma aposta registrada ainda.</div>
                            </div>
                        </div>
                    </div>
                </div>
                 </div>
                
                <div class="pattern-section">
                    <h4>Padrão</h4>
                    <div class="pattern-info" id="patternInfo">
                        Nenhum padrão detectado
                    </div>
                </div>
                
                <div class="pattern-bank-section">
                    <h4>📂 Banco de Padrões</h4>
                    <div class="bank-progress" id="bankProgress" aria-live="polite" style="display:none;">
                        <span class="bank-progress-text" id="bankProgressText"></span>
                    </div>
                    <div class="bank-stats" id="bankStats">
                        <div class="bank-loading">Carregando...</div>
                    </div>
                    <div class="bank-capacity">
                        <div class="capacity-bar">
                            <div class="capacity-fill" id="capacityFill" style="width: 0%"></div>
                        </div>
                        <div class="capacity-text">
                            <span id="bankTotal">0</span> / <span id="bankLimit">3000</span> padrões
                            (<span id="bankPercent">0</span>%)
                        </div>
                    </div>
                    <div class="bank-confidence">
                        <div class="conf-item conf-high">
                            <span class="conf-dot">●</span>
                            <span class="conf-label">Alta (≥80%):</span>
                            <span class="conf-value" id="confHigh">0</span>
                        </div>
                        <div class="conf-item conf-medium">
                            <span class="conf-dot">●</span>
                            <span class="conf-label">Média (60-79%):</span>
                            <span class="conf-value" id="confMedium">0</span>
                        </div>
                        <div class="conf-item conf-low">
                            <span class="conf-dot">●</span>
                            <span class="conf-label">Baixa (<60%):</span>
                            <span class="conf-value" id="confLow">0</span>
                        </div>
                    </div>
                    <div class="bank-buttons">
                        <button id="refreshBankBtn" class="refresh-bank-btn">Buscar Padrões (30s)</button>
                        <button id="resetBankBtn" class="reset-bank-btn">Resetar Padrões</button>
                    </div>
                </div>
                
                <div class="observer-section">
                    <h4>Calibrador de porcentagens</h4>
                    <div class="observer-stats" id="observerStats">
                        <div class="observer-loading">Carregando...</div>
                    </div>
                    <div class="observer-calibration">
                        <div class="calibration-label">Fator de Calibração:</div>
                        <div class="calibration-value" id="calibrationFactor">100%</div>
                    </div>
                    <div class="observer-accuracy">
                        <div class="accuracy-item">
                            <span class="accuracy-label">Total monitorado:</span>
                            <span class="accuracy-value" id="observerTotal">0</span>
                        </div>
                        <div class="accuracy-item">
                            <span class="accuracy-label">Taxa real:</span>
                            <span class="accuracy-value" id="observerWinRate">0%</span>
                        </div>
                    </div>
                    <div class="observer-by-confidence">
                        <div class="obs-conf-item">
                            <span class="obs-conf-label">Alta (≥80%):</span>
                            <span class="obs-conf-stat" id="obsHigh">Prev: -- | Real: --</span>
                        </div>
                        <div class="obs-conf-item">
                            <span class="obs-conf-label">Média (60-79%):</span>
                            <span class="obs-conf-stat" id="obsMedium">Prev: -- | Real: --</span>
                        </div>
                        <div class="obs-conf-item">
                            <span class="obs-conf-label">Baixa (<60%):</span>
                            <span class="obs-conf-stat" id="obsLow">Prev: -- | Real: --</span>
                        </div>
                    </div>
                    <button id="refreshObserverBtn" class="refresh-observer-btn">🔄 Atualizar</button>
                </div>
                
                <div class="settings-section">
                    <h4>Configurações</h4>
                    <div class="settings-grid">
                        <div class="setting-item" id="historyDepthSetting">
                            <span class="setting-label">Profundidade de Análise (giros):</span>
                            <input type="number" id="cfgHistoryDepth" min="100" max="2000" value="500" title="Quantidade de giros para análise e busca de padrões (100-2000) - VÁLIDO APENAS NO MODO PADRÃO" placeholder="Ex: 500 giros" />
                        </div>
                        <div class="setting-item">
                            <span class="setting-label">Ocorrências mínima:</span>
                            <input type="number" id="cfgMinOccurrences" min="1" value="2" />
                        </div>
                        <div class="setting-item">
                            <span class="setting-label">Ocorrências MÁXIMAS (0 = sem limite):</span>
                            <input type="number" id="cfgMaxOccurrences" min="0" value="0" placeholder="0 = sem limite" />
                        </div>
                        <div class="setting-item">
                            <span class="setting-label">Intervalo entre padrões (giros):</span>
                            <input
                                type="number"
                                id="cfgMinInterval"
                                min="0"
                                value="2"
                                title="Quantidade mínima de giros entre OCORRÊNCIAS do MESMO padrão (0 = não limita, considera todas as ocorrências). Padrões diferentes podem aparecer em sequência normalmente."
                                placeholder="Ex: 2 giros (0 = sem intervalo entre ocorrências do mesmo padrão)" />
                        </div>
                        <div class="setting-item">
                            <span class="setting-label">Tamanho MÍNIMO do padrão (giros):</span>
                            <input type="number" id="cfgMinPatternSize" min="2" value="2" />
                        </div>
                        <div class="setting-item">
                            <span class="setting-label">Tamanho MÁXIMO do padrão (0 = sem limite):</span>
                            <input type="number" id="cfgMaxPatternSize" min="0" value="0" placeholder="0 = sem limite" />
                        </div>
                        <div class="setting-item">
                            <span class="setting-label">WIN% das demais ocorrências:</span>
                            <input type="number" id="cfgWinPercentOthers" min="0" max="100" value="100" />
                        </div>
                        <div class="setting-item setting-row">
                            <label class="checkbox-label"><input type="checkbox" id="cfgRequireTrigger" checked /> Exigir cor de disparo</label>
                        </div>
                        <div class="setting-item setting-row">
                            <span class="setting-label">Telegram Chat ID:</span>
                            <div style="display: flex; gap: 4px; flex: 1; align-items: stretch;">
                                <input type="password" id="cfgTgChatId" placeholder="Digite seu Chat ID" style="flex: 1;" />
                                <button type="button" id="toggleTgId" class="toggle-visibility-btn" title="Mostrar/Ocultar">
                                    <svg class="eye-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M12 5C7 5 2.73 8.11 1 12.5C2.73 16.89 7 20 12 20C17 20 21.27 16.89 23 12.5C21.27 8.11 17 5 12 5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                        <circle cx="12" cy="12.5" r="3.5" stroke="currentColor" stroke-width="2"/>
                                    </svg>
                                    <svg class="eye-off-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: none;">
                                        <path d="M3 3L21 21M10.5 10.7C9.8 11.5 9.5 12.5 10 13.5C10.5 14.5 11.5 15 12.5 15C13.3 15 14.1 14.6 14.7 14M17 17C15.5 18.5 13.8 19.5 12 19.5C7 19.5 2.73 16.39 1 12C2.1 9.6 3.8 7.6 6 6.3M12 5.5C17 5.5 21.27 8.61 23 13C22.4 14.4 21.5 15.7 20.4 16.8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        
                        <!-- ═══════════════════════════════════════════════════════ -->
                        <!-- MODELOS CUSTOMIZADOS DE ANÁLISE (NÍVEL DIAMANTE) -->
                        <!-- ═══════════════════════════════════════════════════════ -->
                        <div class="setting-item setting-row" id="customPatternsContainer" style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #333;">
                            <div class="hot-pattern-actions">
                                <button id="btnHotPattern" class="btn-hot-pattern">
                                    Padrão Quente
                                </button>
                                <button id="diamondLevelsBtn" class="btn-hot-pattern btn-diamond-levels">
                                    Configurar Níveis Diamante
                                </button>
                            </div>
                        </div>
                        
                        <!-- ═══════════════════════════════════════════════════════ -->
                        <!-- INTENSIDADE DE SINAIS (NÍVEL DIAMANTE) -->
                        <!-- ═══════════════════════════════════════════════════════ -->
                        <div class="setting-item setting-row" id="signalIntensityContainer" style="margin-top: 15px;">
                            <div style="width: 100%; display: flex; flex-direction: column; gap: 8px;">
                                <label style="font-size: 13px; color: #ffffff; font-weight: 600; text-align: center;">
                                    Intensidade de Sinais
                                </label>
                                <select id="signalIntensitySelect" style="
                                    width: 100%;
                                    padding: 10px 12px;
                                    font-size: 13px;
                                    font-weight: 600;
                                    color: #ffffff;
                                    background: #1a1a1a;
                                    border: 1px solid #333;
                                    border-radius: 8px;
                                    cursor: pointer;
                                    transition: all 0.3s ease;
                                    outline: none;
                                    text-align: center;
                                ">
                                    <option value="aggressive" style="background: #1a1a1a; color: #fff;">🔥 AGRESSIVO (score ≥ 25%)</option>
                                    <option value="moderate" selected style="background: #1a1a1a; color: #fff;">⚖️ MODERADO (score ≥ 45%)</option>
                                    <option value="conservative" style="background: #1a1a1a; color: #fff;">🛡️ CONSERVADOR (score ≥ 65%)</option>
                                </select>
                                <div style="font-size: 11px; color: #888; text-align: center; padding: 0 10px;">
                                    Pontuação contínua • Define o score mínimo para enviar sinal
                                </div>
                            </div>
                        </div>
                        
                        <!-- Opção de sincronização com a conta -->
                        <div class="setting-item setting-row" style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #333;">
                            <label class="checkbox-label" style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="syncConfigToAccount" checked style="cursor: pointer;">
                                <span style="font-size: 13px; color: #00d4ff;">
                                    ☁️ Sincronizar configurações
                                </span>
                            </label>
                        </div>
                        
                    </div>
                    <button id="cfgSaveBtn" class="cfg-save-btn">Salvar</button>
                </div>
                
                <div class="stats-section">
                    <h4>Histórico de Giros</h4>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <span class="stat-label">Total:</span>
                            <span class="stat-value" id="totalSpins">0</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Atualização:</span>
                            <span class="stat-value" id="lastUpdate">-</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="auto-bet-modal" id="autoBetModal" style="display:none;">
                <div class="auto-bet-modal-overlay"></div>
                <div class="auto-bet-modal-content">
                    <div class="auto-bet-modal-header">
                        <h3>Configurar Autoaposta</h3>
                        <button type="button" class="auto-bet-modal-close" id="closeAutoBetModal">
                            Fechar
                        </button>
                    </div>
                    <div class="auto-bet-modal-body">
                        <!-- Seção de Login Blaze -->
                        <div class="blaze-login-section">
                            <div class="blaze-login-card">
                                <div class="blaze-login-header">
                                    <div class="mode-card-title">🔐 Conectar conta Blaze</div>
                                    <p class="mode-card-subtitle">Faça login para usar o modo real</p>
                                </div>
                                <div class="blaze-login-status" id="blazeLoginStatus">
                                    <span class="login-status-indicator disconnected"></span>
                                    <span class="login-status-text">Desconectado</span>
                                </div>
                                <div class="blaze-login-form" id="blazeLoginForm">
                                    <div class="auto-bet-field">
                                        <span>Email</span>
                                        <input type="email" id="blazeEmail" placeholder="seu@email.com" />
                                    </div>
                                    <div class="auto-bet-field">
                                        <span>Senha</span>
                                        <div style="position: relative;">
                                            <input type="password" id="blazePassword" placeholder="••••••••" />
                                            <button type="button" class="toggle-password-btn" id="toggleBlazePassword" aria-label="Mostrar senha">
                                                <span class="eye-icon">👁️</span>
                                            </button>
                                        </div>
                                    </div>
                                    <button type="button" class="blaze-login-btn" id="blazeLoginBtn">
                                        <span class="button-label">Conectar</span>
                                    </button>
                                </div>
                                <div class="blaze-login-info" id="blazeLoginInfo" style="display:none;">
                                    <div class="login-info-item">
                                        <span class="login-info-label">Usuário:</span>
                                        <span class="login-info-value" id="blazeUserEmail">-</span>
                                    </div>
                                    <div class="login-info-item">
                                        <span class="login-info-label">Saldo:</span>
                                        <span class="login-info-value" id="blazeUserBalance">R$ -</span>
                                    </div>
                                    <button type="button" class="blaze-logout-btn" id="blazeLogoutBtn">
                                        <span class="button-label">Desconectar</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="auto-bet-mode-layout">
                            <div class="auto-bet-mode-card real-mode">
                                <div>
                                    <div class="mode-card-title">Modo real</div>
                                    <p class="mode-card-subtitle">Utiliza o saldo da sua conta Blaze</p>
                                </div>
                                <label class="mode-toggle">
                                    <input type="checkbox" id="autoBetEnabled" disabled />
                                    <div class="mode-toggle-content">
                                        <span class="mode-toggle-label">Ativar aposta real</span>
                                        <span class="mode-toggle-switch"></span>
                                    </div>
                                </label>
                                <p class="mode-toggle-hint" style="margin-top: 8px; font-size: 12px; color: #ff6b6b;">
                                    ⚠️ Conecte sua conta Blaze acima para ativar
                                </p>
                            </div>
                            <div class="auto-bet-divider"></div>
                            <div class="auto-bet-mode-card simulation-mode">
                                <div>
                                    <div class="mode-card-title">Simulador</div>
                                    <p class="mode-card-subtitle">Acompanhe resultados sem apostar</p>
                                </div>
                                <label class="mode-toggle">
                                    <input type="checkbox" id="autoBetSimulationOnly" checked />
                                    <div class="mode-toggle-content">
                                        <span class="mode-toggle-label">Simular entradas</span>
                                        <span class="mode-toggle-switch"></span>
                                    </div>
                                </label>
                                <div class="auto-bet-field">
                                    <span>Banca para simulação (R$)</span>
                                    <input type="number" id="autoBetSimulationBank" min="0" step="1" value="5000" />
                                </div>
                            </div>
                        </div>
                        <div class="auto-bet-shared-grid">
                            <div class="auto-bet-field">
                                <span>Entrada base (R$)</span>
                                <input type="number" id="autoBetBaseStake" min="0.01" step="0.01" value="2" />
                            </div>
                            <div class="auto-bet-field">
                                <span>Multiplicador por Gale</span>
                                <input type="number" id="autoBetGaleMultiplier" min="1" step="0.1" value="2" />
                            </div>
                            <div class="auto-bet-field">
                                <span>Stop WIN (R$)</span>
                                <input type="number" id="autoBetStopWin" min="0" step="1" value="0" />
                            </div>
                            <div class="auto-bet-field">
                                <span>Stop LOSS (R$)</span>
                                <input type="number" id="autoBetStopLoss" min="0" step="1" value="0" />
                            </div>
                        </div>
                        <div class="auto-bet-section-title">Estratégia de Martingale</div>
                        <div class="auto-bet-martingale-grid">
                            <label class="mode-toggle" style="margin:0;">
                                <input type="checkbox" id="cfgConsecutiveMartingale" />
                                <div class="mode-toggle-content">
                                    <span class="mode-toggle-label">Martingale consecutivo</span>
                                    <span class="mode-toggle-switch"></span>
                                </div>
                            </label>
                            <div class="auto-bet-field">
                                <span>Quantidade de Gales (0-200)</span>
                                <input type="number" id="cfgMaxGales" min="0" max="200" value="0" />
                            </div>
                        </div>
                        <label class="mode-toggle" style="margin-top: 8px;">
                            <input type="checkbox" id="autoBetWhiteProtection" />
                            <div class="mode-toggle-content">
                                <span class="mode-toggle-label">Proteção no branco</span>
                                <span class="mode-toggle-switch"></span>
                            </div>
                        </label>
                        <div class="white-protection-mode white-mode-disabled" id="whiteProtectionModeWrapper" aria-disabled="true">
                            <div class="white-mode-header">
                                <span>Modo da proteção no branco</span>
                                <span>Escolha sua estratégia</span>
                            </div>
                            <div class="white-mode-options" role="group" aria-label="Modo da proteção no branco">
                                <button type="button" class="white-mode-btn active" data-white-mode="profit" aria-pressed="true">
                                    <span class="white-mode-title">Lucro igual à cor</span>
                                    <span class="white-mode-subtitle">Branco cobre as perdas e mantém o lucro do estágio.</span>
                                </button>
                                <button type="button" class="white-mode-btn" data-white-mode="neutral" aria-pressed="false">
                                    <span class="white-mode-title">Somente cobrir perdas</span>
                                    <span class="white-mode-subtitle">Branco devolve tudo que foi apostado, sem lucro.</span>
                                </button>
                            </div>
                            <p class="white-mode-description" id="whiteProtectionModeDescription">
                                O branco cobre todas as perdas acumuladas e ainda entrega o mesmo lucro do estágio atual.
                            </p>
                            <input type="hidden" id="autoBetWhiteMode" value="profit" />
                        </div>
                        <label class="mode-toggle" style="margin-top: 12px;">
                            <input type="checkbox" id="autoBetInverseMode" />
                            <div class="mode-toggle-content">
                                <span class="mode-toggle-label">Modo inverso (G1 plano)</span>
                                <span class="mode-toggle-switch"></span>
                            </div>
                        </label>
                        <p class="mode-toggle-hint">
                            Mantém G1 com o mesmo valor da entrada base e dobra apenas no G2. Após cada WIN, o próximo sinal inicia dobrado.
                        </p>
                    </div>
                    <div class="auto-bet-modal-footer">
                        <button type="button" class="auto-bet-reset" id="autoBetResetRuntimeModal"><span class="button-label">Resetar ciclo</span></button>
                        <button type="button" class="auto-bet-save-btn" id="autoBetSaveConfig"><span class="button-label">Salvar autoaposta</span></button>
                    </div>
                </div>
            </div>
        `;
        
        const userMenuToggle = sidebar.querySelector('#userMenuToggle');
        const userMenuPanel = sidebar.querySelector('#userMenuPanel');
        const userMenuClose = sidebar.querySelector('#userMenuClose');
        const userMenuLogout = sidebar.querySelector('#userMenuLogout');
        const userMenuName = sidebar.querySelector('#userMenuName');
        const userMenuEmail = sidebar.querySelector('#userMenuEmail');
        const userMenuPlan = sidebar.querySelector('#userMenuPlan');
        const userMenuPurchase = sidebar.querySelector('#userMenuPurchase');
        const userMenuDays = sidebar.querySelector('#userMenuDays');
        const titleBadge = sidebar.querySelector('#titleBadge');

        const setUserMenuState = (open) => {
            if (!userMenuPanel || !userMenuToggle) {
                return;
            }

            if (open) {
                populateUserMenu();
                userMenuPanel.classList.add('open');
                userMenuToggle.classList.add('active');
                userMenuToggle.setAttribute('aria-expanded', 'true');
            } else {
                userMenuPanel.classList.remove('open');
                userMenuToggle.classList.remove('active');
                userMenuToggle.setAttribute('aria-expanded', 'false');
            }
        };

        const populateUserMenu = () => {
            const user = getStoredUserData();
            const displayName = user?.name ? user.name : 'Não informado';
            const displayEmail = user?.email ? user.email : 'Não informado';
            const expiresAt = user?.expiresAt || user?.plan?.expiresAt || user?.planExpiresAt;
            const createdAt = user?.activatedAt || user?.plan?.activatedAt || user?.createdAt || user?.plan?.createdAt;
            const rawPrice = user?.plan?.price ?? user?.planPrice ?? user?.selectedPlanPrice ?? user?.plan?.amount;
            const daysInfo = getDaysRemainingInfo(expiresAt, user?.status);
            const planLabel = getPlanLabel(user?.selectedPlan, rawPrice);
            const purchaseDate = createdAt ? formatDate(createdAt) : 'Não disponível';
            const badgeText = (() => {
                if (user?.status === 'blocked') return 'BLOQUEADO';
                if (user?.status === 'expired') return 'EXPIRADO';
                if (user?.status === 'pending') return 'PENDENTE';
                return 'PREMIUM';
            })();

            if (userMenuName) {
                userMenuName.textContent = displayName;
            }
            if (userMenuEmail) {
                userMenuEmail.textContent = displayEmail;
            }
            if (userMenuPlan) {
                userMenuPlan.textContent = planLabel;
            }
            if (userMenuPurchase) {
                userMenuPurchase.textContent = purchaseDate;
            }
            if (userMenuDays) {
                userMenuDays.textContent = daysInfo.text;
                userMenuDays.classList.toggle('alert', !!daysInfo.alert);
            }
            if (titleBadge) {
                titleBadge.textContent = badgeText;
            }
        };

        populateUserMenu();

        if (userMenuToggle) {
            const toggleHandler = () => {
                const isOpen = userMenuPanel?.classList.contains('open');
                setUserMenuState(!isOpen);
            };

            userMenuToggle.addEventListener('click', toggleHandler);
            userMenuToggle.addEventListener('mousedown', (event) => event.stopPropagation());
            userMenuToggle.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true });
        }

        if (userMenuClose) {
            userMenuClose.addEventListener('click', () => setUserMenuState(false));
        }

        if (userMenuLogout) {
            userMenuLogout.addEventListener('click', () => {
                setUserMenuState(false);
                forceLogout('Logout manual');
            });
        }

        if (activeUserMenuKeyHandler) {
            document.removeEventListener('keydown', activeUserMenuKeyHandler);
        }

        const handleUserMenuKeyDown = (event) => {
            if (event.key === 'Escape' && userMenuPanel?.classList.contains('open')) {
                setUserMenuState(false);
            }
        };

        document.addEventListener('keydown', handleUserMenuKeyDown);
        activeUserMenuKeyHandler = handleUserMenuKeyDown;
        
        // Add to page
        console.log('%c➕ Adicionando sidebar ao document.body...', 'color: #00AAFF;');
        console.log('%c   document.body existe?', 'color: #00AAFF;', document.body ? '✅ SIM' : '❌ NÃO');
        
        if (!document.body) {
            console.error('%c❌ ERRO CRÍTICO: document.body não existe!', 'color: #FF0000; font-weight: bold;');
            return;
        }
        
        try {
        document.body.appendChild(sidebar);
            console.log('%c✅ appendChild executado com sucesso!', 'color: #00FF88;');
        } catch (error) {
            console.error('%c❌ ERRO ao adicionar sidebar ao DOM:', 'color: #FF0000; font-weight: bold;', error);
            return;
        }
        initEntriesTabs();
        setEntriesTab(activeEntriesTab);
        setupAutoBetHistoryUI();
        if (autoBetManager && typeof autoBetManager.onSidebarReady === 'function') {
            setTimeout(() => autoBetManager.onSidebarReady(), 0);
        }

        const autoBetConfigBtn = document.getElementById('autoBetConfigBtn');
        const autoBetModal = document.getElementById('autoBetModal');
        const autoBetModalOverlay = autoBetModal ? autoBetModal.querySelector('.auto-bet-modal-overlay') : null;
        const autoBetModalContent = autoBetModal ? autoBetModal.querySelector('.auto-bet-modal-content') : null;
        const closeAutoBetModalBtn = document.getElementById('closeAutoBetModal');
        const autoBetSaveConfigBtn = document.getElementById('autoBetSaveConfig');
        const autoBetResetRuntimeModalBtn = document.getElementById('autoBetResetRuntimeModal');
        let autoBetModalEscHandler = null;
        let autoBetModalResizeHandler = null;

        const triggerButtonFeedback = (button) => {
            if (!button) return;
            button.classList.add('btn-pressed');
            setTimeout(() => button.classList.remove('btn-pressed'), 220);
        };

        const setButtonBusyState = (button, busy, busyLabel) => {
            if (!button) return;
            const labelEl = button.querySelector('.button-label');
            if (labelEl && !labelEl.dataset.defaultLabel) {
                labelEl.dataset.defaultLabel = labelEl.textContent.trim();
            }
            const fallbackDefault = labelEl
                ? (labelEl.dataset.defaultLabel || labelEl.textContent.trim())
                : (button.dataset.defaultLabel || button.textContent.trim());
            if (!labelEl && !button.dataset.defaultLabel) {
                button.dataset.defaultLabel = fallbackDefault;
            }
            button.classList.toggle('is-busy', !!busy);
            button.disabled = !!busy;
            const nextLabel = busy && busyLabel ? busyLabel : fallbackDefault;
            if (labelEl) {
                labelEl.textContent = nextLabel;
            } else {
                button.textContent = nextLabel;
            }
        };

        const syncAutoBetModalWidth = () => {
            if (!autoBetModalContent) return;
            const sidebarEl = document.getElementById('blaze-double-analyzer');
            const sidebarWidth = sidebarEl ? sidebarEl.getBoundingClientRect().width : window.innerWidth;
            const viewportLimit = window.innerWidth - 32;
            const target = Math.max(320, Math.min(sidebarWidth - 24, sidebarWidth, viewportLimit));
            autoBetModalContent.style.width = `${target}px`;
        };

        const closeAutoBetModal = () => {
            if (!autoBetModal) return;
            autoBetModal.style.display = 'none';
            document.body.classList.remove('auto-bet-modal-open');
            if (autoBetModalEscHandler) {
                document.removeEventListener('keydown', autoBetModalEscHandler);
                autoBetModalEscHandler = null;
            }
            if (autoBetModalResizeHandler) {
                window.removeEventListener('resize', autoBetModalResizeHandler);
                autoBetModalResizeHandler = null;
            }
        };

        const openAutoBetModal = () => {
            if (!autoBetModal) return;
            syncAutoBetModalWidth();
            autoBetModal.style.display = 'flex';
            document.body.classList.add('auto-bet-modal-open');
            autoBetModalEscHandler = (event) => {
                if (event.key === 'Escape') {
                    closeAutoBetModal();
                }
            };
            document.addEventListener('keydown', autoBetModalEscHandler);
            if (!autoBetModalResizeHandler) {
                autoBetModalResizeHandler = () => syncAutoBetModalWidth();
                window.addEventListener('resize', autoBetModalResizeHandler);
            }
        };

        if (autoBetConfigBtn) {
            autoBetConfigBtn.addEventListener('click', openAutoBetModal);
        }
        if (autoBetModalOverlay) {
            autoBetModalOverlay.addEventListener('click', closeAutoBetModal);
        }
        if (closeAutoBetModalBtn) {
            closeAutoBetModalBtn.addEventListener('click', closeAutoBetModal);
        }
        if (autoBetSaveConfigBtn) {
            autoBetSaveConfigBtn.addEventListener('click', async () => {
                triggerButtonFeedback(autoBetSaveConfigBtn);
                setButtonBusyState(autoBetSaveConfigBtn, true, 'Salvando...');
                try {
                    const shouldClose = await saveSettings();
                    if (shouldClose !== false) {
                        closeAutoBetModal();
                    }
                } finally {
                    setButtonBusyState(autoBetSaveConfigBtn, false);
                }
            });
        }
        if (autoBetResetRuntimeModalBtn) {
            autoBetResetRuntimeModalBtn.addEventListener('click', () => {
                triggerButtonFeedback(autoBetResetRuntimeModalBtn);
                setButtonBusyState(autoBetResetRuntimeModalBtn, true, 'Resetando...');
                try {
                    if (autoBetManager && typeof autoBetManager.resetRuntime === 'function') {
                        autoBetManager.resetRuntime();
                    }
                } finally {
                    setTimeout(() => setButtonBusyState(autoBetResetRuntimeModalBtn, false), 450);
                }
            });
        }
        // ═══════════════════════════════════════════════════════════════
        // 🔐 BLAZE LOGIN - Gerenciamento de conexão com conta Blaze
        // ═══════════════════════════════════════════════════════════════
        const BLAZE_AUTH_API = 'https://blaze-analyzer-api-v2-z8s3.onrender.com/api/blaze';
        let blazeSessionData = null;
        
        const blazeLoginElements = {
            status: document.getElementById('blazeLoginStatus'),
            form: document.getElementById('blazeLoginForm'),
            info: document.getElementById('blazeLoginInfo'),
            email: document.getElementById('blazeEmail'),
            password: document.getElementById('blazePassword'),
            loginBtn: document.getElementById('blazeLoginBtn'),
            logoutBtn: document.getElementById('blazeLogoutBtn'),
            togglePasswordBtn: document.getElementById('toggleBlazePassword'),
            userEmail: document.getElementById('blazeUserEmail'),
            userBalance: document.getElementById('blazeUserBalance'),
            autoBetEnabled: document.getElementById('autoBetEnabled')
        };
        
        console.log('%c🔍 [BLAZE LOGIN] Verificando elementos...', 'color: #fbbf24; font-weight: bold;');
        console.log('📋 Elementos encontrados:', {
            loginBtn: !!blazeLoginElements.loginBtn,
            email: !!blazeLoginElements.email,
            password: !!blazeLoginElements.password,
            status: !!blazeLoginElements.status
        });
        
        if (!blazeLoginElements.loginBtn) {
            console.error('❌ ERRO CRÍTICO: Botão de login não encontrado! ID: blazeLoginBtn');
        } else {
            console.log('✅ Botão de login encontrado!');
        }
        
        const updateBlazeLoginUI = (state, message = '', data = null) => {
            if (!blazeLoginElements.status) return;
            
            const statusIndicator = blazeLoginElements.status.querySelector('.login-status-indicator');
            const statusText = blazeLoginElements.status.querySelector('.login-status-text');
            
            if (statusIndicator) {
                statusIndicator.className = `login-status-indicator ${state}`;
            }
            if (statusText) {
                statusText.textContent = message;
            }
            
            if (state === 'connected' && data) {
                if (blazeLoginElements.form) blazeLoginElements.form.style.display = 'none';
                if (blazeLoginElements.info) {
                    blazeLoginElements.info.style.display = 'flex';
                    if (blazeLoginElements.userEmail) {
                        const displayName = data.user?.username || data.user?.email || '-';
                        blazeLoginElements.userEmail.textContent = displayName;
                    }
                    if (blazeLoginElements.userBalance) {
                        const balance = data.user?.balance || '0,00';
                        blazeLoginElements.userBalance.textContent = `R$ ${balance}`;
                    }
                }
                if (blazeLoginElements.autoBetEnabled) {
                    blazeLoginElements.autoBetEnabled.disabled = false;
                    const modeHint = document.querySelector('.real-mode .mode-toggle-hint');
                    if (modeHint) modeHint.style.display = 'none';
                }
            } else {
                if (blazeLoginElements.form) blazeLoginElements.form.style.display = 'flex';
                if (blazeLoginElements.info) blazeLoginElements.info.style.display = 'none';
                if (blazeLoginElements.autoBetEnabled) {
                    blazeLoginElements.autoBetEnabled.disabled = true;
                    blazeLoginElements.autoBetEnabled.checked = false;
                    const modeHint = document.querySelector('.real-mode .mode-toggle-hint');
                    if (modeHint) modeHint.style.display = 'block';
                }
            }
        };
        
        const handleBlazeLogin = async () => {
            const email = blazeLoginElements.email?.value.trim();
            const password = blazeLoginElements.password?.value;
            
            console.log('%c🔐 [BLAZE LOGIN] Iniciando login...', 'color: #fbbf24; font-weight: bold;');
            console.log(`📧 Email: ${email}`);
            console.log(`🔗 API URL: ${BLAZE_AUTH_API}/login`);
            
            if (!email || !password) {
                console.warn('⚠️ Email ou senha vazios!');
                alert('Por favor, preencha email e senha.');
                return;
            }
            
            updateBlazeLoginUI('connecting', 'Conectando...');
            setButtonBusyState(blazeLoginElements.loginBtn, true, 'Conectando...');
            
            try {
                console.log('%c📤 Enviando requisição para o servidor...', 'color: #60a5fa; font-weight: bold;');
                
                // Criar AbortController para timeout de 20 minutos (1200000ms)
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1200000);
                
                const response = await fetch(`${BLAZE_AUTH_API}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                console.log(`📥 Resposta recebida - Status: ${response.status} ${response.statusText}`);
                console.log(`📋 Headers:`, response.headers);
                
                const result = await response.json();
                console.log('📦 Dados da resposta:', result);
                
                if (result.success && result.data) {
                    blazeSessionData = result.data;
                    localStorage.setItem('blazeSession', JSON.stringify(blazeSessionData));
                    console.log('%c✅ Login Blaze realizado com sucesso!', 'color: #10b981; font-weight: bold;');
                    console.log('🍪 Cookies salvos:', result.data.cookies?.length || 0);
                    console.log('👤 Dados do usuário:', {
                        email: result.data.user?.email,
                        username: result.data.user?.username,
                        balance: result.data.user?.balance
                    });
                    updateBlazeLoginUI('connected', 'Conectado', result.data);
                    startBalancePolling(); // Iniciar polling automático
                    alert('✅ Conectado com sucesso à sua conta Blaze!');
                } else {
                    console.error('❌ Login falhou:', result);
                    throw new Error(result.error || 'Falha ao conectar');
                }
            } catch (error) {
                console.error('%c❌ ERRO CRÍTICO no login:', 'color: #ef4444; font-weight: bold;', error);
                console.error('Stack trace:', error.stack);
                
                let errorMessage = error.message;
                if (error.name === 'AbortError') {
                    errorMessage = 'Tempo limite excedido (20 minutos). O servidor pode estar offline.';
                }
                
                updateBlazeLoginUI('error', 'Erro ao conectar');
                alert(`❌ Erro ao conectar: ${errorMessage}`);
            } finally {
                setButtonBusyState(blazeLoginElements.loginBtn, false);
                console.log('%c🏁 Processo de login finalizado', 'color: #6b7280; font-weight: bold;');
            }
        };
        
        const handleBlazeLogout = () => {
            stopBalancePolling(); // Parar polling automático
            blazeSessionData = null;
            localStorage.removeItem('blazeSession');
            updateBlazeLoginUI('disconnected', 'Desconectado');
            if (blazeLoginElements.password) blazeLoginElements.password.value = '';
            console.log('%c🔐 Logout Blaze realizado', 'color: #6b7280; font-weight: bold;');
        };
        
        const togglePasswordVisibility = () => {
            if (!blazeLoginElements.password) return;
            const type = blazeLoginElements.password.type === 'password' ? 'text' : 'password';
            blazeLoginElements.password.type = type;
            const eyeIcon = blazeLoginElements.togglePasswordBtn?.querySelector('.eye-icon');
            if (eyeIcon) {
                eyeIcon.textContent = type === 'password' ? '👁️' : '👁️‍🗨️';
            }
        };
        
        // Event Listeners para Login Blaze
        console.log('%c🎯 [BLAZE LOGIN] Adicionando event listeners...', 'color: #10b981; font-weight: bold;');
        
        if (blazeLoginElements.loginBtn) {
            console.log('✅ Adicionando listener ao botão de login...');
            blazeLoginElements.loginBtn.addEventListener('click', () => {
                console.log('%c🖱️ BOTÃO DE LOGIN CLICADO!', 'color: #ef4444; font-weight: bold; font-size: 16px;');
                handleBlazeLogin();
            });
            console.log('✅ Listener adicionado com sucesso!');
        } else {
            console.error('❌ Não foi possível adicionar listener: botão não existe!');
        }
        
        if (blazeLoginElements.logoutBtn) {
            blazeLoginElements.logoutBtn.addEventListener('click', handleBlazeLogout);
        }
        if (blazeLoginElements.togglePasswordBtn) {
            blazeLoginElements.togglePasswordBtn.addEventListener('click', togglePasswordVisibility);
        }
        if (blazeLoginElements.password) {
            blazeLoginElements.password.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleBlazeLogin();
            });
        }
        
        console.log('%c✅ [BLAZE LOGIN] Sistema de login inicializado!', 'color: #10b981; font-weight: bold;');
        
        // ═══════════════════════════════════════════════════════════════
        // 💰 ATUALIZAÇÃO AUTOMÁTICA DE SALDO (POLLING)
        // ═══════════════════════════════════════════════════════════════
        let balancePollingInterval = null;
        
        const fetchBalance = async () => {
            if (!blazeSessionData || (!blazeSessionData.accessToken && !blazeSessionData.cookies)) {
                console.warn('⚠️ [BLAZE] Sem sessão ativa para buscar saldo');
                return;
            }
            
            try {
                console.log('%c💰 [BLAZE] Buscando saldo com', blazeSessionData.accessToken ? 'ACCESS_TOKEN' : 'cookies', 'color: #fbbf24; font-weight: bold;');
                
                const response = await fetch(`${BLAZE_AUTH_API}/balance`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        accessToken: blazeSessionData.accessToken,
                        cookies: blazeSessionData.cookies,
                        cookieHeader: blazeSessionData.cookieHeader
                    })
                });
                
                if (response.ok) {
                    const result = await response.json();
                    
                    if (result.success && result.balance) {
                        // Extrair saldo total (real + bonus)
                        let totalBalance = 0;
                        
                        if (result.balance.balance !== undefined) {
                            totalBalance = parseFloat(result.balance.balance) || 0;
                        } else if (result.balance.real !== undefined && result.balance.bonus !== undefined) {
                            totalBalance = (parseFloat(result.balance.real) || 0) + (parseFloat(result.balance.bonus) || 0);
                        }
                        
                        const balanceFormatted = totalBalance.toFixed(2).replace('.', ',');
                        
                        console.log(`💰 [BLAZE] Saldo atualizado: R$ ${balanceFormatted}`);
                        
                        // Atualizar UI do login
                        if (blazeLoginElements.userBalance) {
                            blazeLoginElements.userBalance.textContent = `R$ ${balanceFormatted}`;
                        }
                        
                        // Atualizar sessão armazenada
                        if (blazeSessionData.user) {
                            blazeSessionData.user.balance = balanceFormatted;
                            localStorage.setItem('blazeSession', JSON.stringify(blazeSessionData));
                        }
                        
                        // Forçar atualização dos saldos na UI principal (se modo real estiver ativo)
                        if (typeof updateStatusUI === 'function') {
                            updateStatusUI();
                        }
                    }
                } else {
                    console.warn('⚠️ [BLAZE] Erro ao buscar saldo:', response.status);
                }
            } catch (error) {
                console.warn('⚠️ [BLAZE] Erro ao buscar saldo:', error.message);
            }
        };
        
        const startBalancePolling = () => {
            if (balancePollingInterval) {
                clearInterval(balancePollingInterval);
            }
            
            console.log('%c🔄 [BLAZE] Iniciando atualização automática de saldo...', 'color: #10b981; font-weight: bold;');
            
            // Primeira busca imediata
            fetchBalance();
            
            // Polling a cada 10 segundos
            balancePollingInterval = setInterval(fetchBalance, 10000);
            
            console.log('%c✅ [BLAZE] Atualização automática ativa (10s)', 'color: #10b981; font-weight: bold;');
        };
        
        const stopBalancePolling = () => {
            if (balancePollingInterval) {
                clearInterval(balancePollingInterval);
                balancePollingInterval = null;
                console.log('%c⏸️ [BLAZE] Atualização automática pausada', 'color: #6b7280; font-weight: bold;');
            }
        };
        
        // Restaurar sessão salva
        try {
            const savedSession = localStorage.getItem('blazeSession');
            if (savedSession) {
                blazeSessionData = JSON.parse(savedSession);
                updateBlazeLoginUI('connected', 'Conectado', blazeSessionData);
                startBalancePolling(); // Iniciar polling se já está conectado
                console.log('%c🔐 Sessão Blaze restaurada do localStorage', 'color: #10b981; font-weight: bold;');
            }
        } catch (error) {
            console.warn('⚠️ Não foi possível restaurar sessão Blaze:', error);
            localStorage.removeItem('blazeSession');
        }
        
        const toggleAnalyzerBtn = document.getElementById('toggleAnalyzerBtn');
        if (toggleAnalyzerBtn) {
            toggleAnalyzerBtn.addEventListener('click', handleAnalyzerToggle);
        }
        initAutoBetSummaryVisibilityControls();
        initializeAnalyzerToggleState();
        
        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00FF88; font-weight: bold;');
        console.log('%c✅ SIDEBAR CRIADA COM SUCESSO!', 'color: #00FF88; font-weight: bold; font-size: 14px;');
        console.log('%c   Sidebar injetada no DOM', 'color: #00FF88;');
        console.log('%c   ID: blaze-double-analyzer', 'color: #00FF88;');
        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00FF88; font-weight: bold;');
        
        // 🔍 DEBUG: Iniciar observador de mudanças de altura
        setTimeout(() => {
            setupHeightObserver();
        }, 1000);
        console.log('');
        
        // ═══════════════════════════════════════════════════════════════
        // 🎯 CRIAR MODAL DE PADRÕES CUSTOMIZADOS E BANCO
        // ═══════════════════════════════════════════════════════════════
        createCustomPatternModal();
        createDiamondLevelsModal();
        
        // ✅ Carregar padrões customizados imediatamente após criar a sidebar
        console.log('%c🎯 Carregando padrões customizados...', 'color: #00d4ff; font-weight: bold;');
        
        // 🧠 NÃO iniciar o intervalo automaticamente - só quando o modo IA for ativado
        console.log('%c🧠 Sistema de memória ativa preparado (aguardando ativação do modo IA)', 'color: #00CED1; font-weight: bold;');
        
        // ⚡ CARREGAR HISTÓRICO DO SERVIDOR (agora que a sidebar existe)
        console.log('%c⏱️ [TIMING] Sidebar criada! Carregando histórico...', 'color: #00FF88; font-weight: bold;');
        setTimeout(startAutoHistoryUpdate, 0);
        
        // Load saved position and size
        loadSidebarState(sidebar);
        
        // Update scaling based on initial size
        updateScaling(sidebar);
        
        // Wire clear entries history (content-script context; inline handlers won't work)
        const clearEntriesBtn = document.getElementById('clearEntriesBtn');
        if (clearEntriesBtn) {
            clearEntriesBtn.addEventListener('click', function() {
                // Usar modal customizado em vez do confirm() nativo
                showCustomConfirm('Limpar histórico de entradas?', clearEntriesBtn).then(confirmed => {
                    if (confirmed) {
                        clearEntriesHistory();
                }
                });
            });
        }
        
        // ✅ Toggle de modo IA
        const aiModeToggle = document.getElementById('aiModeToggle');
        if (aiModeToggle) {
            // ═══════════════════════════════════════════════════════════════════════════════
            // ✅ SOLUÇÃO: Carregar modo específico da ABA primeiro (sessionStorage)
            // ═══════════════════════════════════════════════════════════════════════════════
            // Carregar estado inicial
            chrome.storage.local.get(['analyzerConfig'], async function(result) {
                const config = result.analyzerConfig || {};
                
                // ✅ VERIFICAR SE ESTA ABA JÁ TEM UMA CONFIGURAÇÃO PRÓPRIA (sessionStorage)
                const tabSpecificModeStr = sessionStorage.getItem('tabSpecificAIMode');
                let isAIMode = config.aiMode || false; // Padrão do chrome.storage.local
                
                if (tabSpecificModeStr !== null) {
                    // ✅ Esta aba tem uma configuração específica! Usar ela!
                    isAIMode = JSON.parse(tabSpecificModeStr);
                    console.log(`%c🔄 ABA ESPECÍFICA: Usando modo salvo desta aba (${isAIMode ? '💎 DIAMANTE' : '⚙️ PADRÃO'})`, 'color: #00FF88; font-weight: bold;');
                } else {
                    // ✅ Primeira vez nesta aba, usar padrão global e salvar no sessionStorage
                    console.log(`%c🆕 NOVA ABA: Usando modo padrão global (${isAIMode ? '💎 DIAMANTE' : '⚙️ PADRÃO'})`, 'color: #FFA500; font-weight: bold;');
                    sessionStorage.setItem('tabSpecificAIMode', JSON.stringify(isAIMode));
                }
                
                // ✅ Atualizar config com o modo específico desta aba
                config.aiMode = isAIMode;
                
                updateAIModeUI(aiModeToggle, isAIMode);
                
                // ✅ GARANTIR que o container está oculto se modo está DESATIVADO
                if (!isAIMode) {
                    const modeApiContainer = aiModeToggle.querySelector('.mode-api-container');
                    if (modeApiContainer) {
                        modeApiContainer.style.display = 'none';
                        console.log('%c✅ Container IA forçado a ocultar (modo DESATIVADO)', 'color: #00FF88; font-weight: bold;');
                    }
                }
                
                // ✅ Aplicar estado dos campos ao carregar
                toggleAIConfigFields(isAIMode);
                
                // 🧠 Se modo IA já estiver ativo, atualizar status imediatamente
                if (isAIMode) {
                    console.log('%c🧠 Modo IA já ativo! Atualizando status da memória...', 'color: #00CED1; font-weight: bold;');
                    const modeApiStatus = document.getElementById('modeApiStatus');
                    if (modeApiStatus) {
                        // ✅ TENTAR MÚLTIPLAS VEZES PARA GARANTIR (importante no mobile)
                        const tentarAtualizar = async (tentativa = 1, maxTentativas = 3) => {
                            await atualizarStatusMemoriaAtiva(modeApiStatus);
                            
                            // Se ainda estiver "Inicializando..." e não for a última tentativa, tentar novamente
                            if (modeApiStatus.textContent.includes('Inicializando') && tentativa < maxTentativas) {
                                console.log(`%c🔄 Tentativa ${tentativa}/${maxTentativas} - Ainda inicializando, tentando novamente em 2s...`, 'color: #FFA500;');
                                setTimeout(() => tentarAtualizar(tentativa + 1, maxTentativas), 2000);
                            }
                        };
                        
                        // Primeira tentativa após 1 segundo
                        setTimeout(() => tentarAtualizar(), 1000);
                        
                        // ✅ INICIAR INTERVALO DE ATUALIZAÇÃO PERIÓDICA
                        iniciarAtualizacaoMemoria();
                    }
                }
            });
            
            // Listener de clique
            aiModeToggle.addEventListener('click', function() {
                // ✅ BUSCAR CONFIGURAÇÃO MAIS RECENTE DO STORAGE (pode ter sido salva agora)
                chrome.storage.local.get(['analyzerConfig'], function(result) {
                    // ✅ IMPORTANTE: Mesclar com DEFAULT para garantir que temos todos os campos
                    // ✅ CONFIGURAÇÕES PADRÃO OTIMIZADAS (sincronizadas com background.js)
                    const DEFAULT_CONFIG = {
                        historyDepth: 500,
                        minOccurrences: 2,
                        maxOccurrences: 0,
                        minIntervalSpins: 2,
                        minPatternSize: 3,
                        maxPatternSize: 0,
                        winPercentOthers: 100,
                        requireTrigger: true,
                        consecutiveMartingale: false,
                        maxGales: 0,
                        martingaleProfiles: {
                            standard: { maxGales: 0, consecutiveMartingale: false },
                            diamond: { maxGales: 0, consecutiveMartingale: false }
                        },
                        telegramChatId: '',
                        signalIntensity: 'moderate',
                        aiApiKey: '',
                        aiMode: false,
                        whiteProtectionAsWin: false
                    };
                    
                    const config = { ...DEFAULT_CONFIG, ...(result.analyzerConfig || {}) };
                    
                    // ✅ USAR O MODO ESPECÍFICO DESTA ABA (sessionStorage) EM VEZ DO GLOBAL
                    const tabSpecificModeStr = sessionStorage.getItem('tabSpecificAIMode');
                    if (tabSpecificModeStr !== null) {
                        config.aiMode = JSON.parse(tabSpecificModeStr);
                    }
                    
                    const newAIMode = !config.aiMode;
                    
                    // ✅ LOG DE DEBUG - Ver o que foi carregado
                    console.log('🔧 Config carregada do storage:', {
                        aiMode: config.aiMode
                    });
                    
                    // ✅ Ativar direto (não precisa mais de chave API - sistema é 100% JavaScript)
                    activateAIMode(config, newAIMode, aiModeToggle);
                });
            });
        }
        
        // ═══════════════════════════════════════════════════════════════
        // 🔒 SEGURANÇA - Botões de Mostrar/Ocultar (Telegram ID e API Key)
        // ═══════════════════════════════════════════════════════════════
        
        const toggleTgIdBtn = document.getElementById('toggleTgId');
        const cfgTgChatId = document.getElementById('cfgTgChatId');
        
        if (toggleTgIdBtn && cfgTgChatId) {
            const eyeIcon = toggleTgIdBtn.querySelector('.eye-icon');
            const eyeOffIcon = toggleTgIdBtn.querySelector('.eye-off-icon');
            
            toggleTgIdBtn.addEventListener('click', function() {
                if (cfgTgChatId.type === 'password') {
                    cfgTgChatId.type = 'text';
                    eyeIcon.style.display = 'none';
                    eyeOffIcon.style.display = 'block';
                    console.log('👁️ Telegram ID visível');
                } else {
                    cfgTgChatId.type = 'password';
                    eyeIcon.style.display = 'block';
                    eyeOffIcon.style.display = 'none';
                    console.log('🔒 Telegram ID oculto');
                }
            });
        }
        
        const toggleApiKeyBtn = document.getElementById('toggleApiKey');
        const cfgAiApiKey = document.getElementById('cfgAiApiKey');
        
        if (toggleApiKeyBtn && cfgAiApiKey) {
            const eyeIcon = toggleApiKeyBtn.querySelector('.eye-icon');
            const eyeOffIcon = toggleApiKeyBtn.querySelector('.eye-off-icon');
            
            toggleApiKeyBtn.addEventListener('click', function() {
                if (cfgAiApiKey.type === 'password') {
                    cfgAiApiKey.type = 'text';
                    eyeIcon.style.display = 'none';
                    eyeOffIcon.style.display = 'block';
                    console.log('👁️ API Key visível');
                } else {
                    cfgAiApiKey.type = 'password';
                    eyeIcon.style.display = 'block';
                    eyeOffIcon.style.display = 'none';
                    console.log('🔒 API Key oculta');
                }
            });
        }
        
        // Add drag and resize functionality
        makeDraggable(sidebar);
        makeResizable(sidebar);
        
        return sidebar;
    }
    
    // === NOVO: Função para renderizar histórico de giros coloridos (tipo Blaze) ===
    // Gera SVG do branco no estilo oficial da Blaze (gota com losango e 4 pinos)
    function blazeWhiteSVG(size = 20) {
        return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2.5C10.2 4.4 4.5 8.9 4.5 13.9C4.5 18.4 7.8 21.5 12 21.5C16.2 21.5 19.5 18.4 19.5 13.9C19.5 8.9 13.8 4.4 12 2.5Z" fill="#FF3B5B"/>
  <polygon points="12,7 17,12 12,17 7,12" fill="#FFFFFF"/>
  <circle cx="10.4" cy="10.4" r="0.9" fill="#FF3B5B"/>
  <circle cx="13.6" cy="10.4" r="0.9" fill="#FF3B5B"/>
  <circle cx="10.4" cy="13.6" r="0.9" fill="#FF3B5B"/>
  <circle cx="13.6" cy="13.6" r="0.9" fill="#FF3B5B"/>
</svg>`;
    }

    // Cache de assinatura do histórico para evitar re-render desnecessário
    let lastHistorySignature = '';
    function getHistorySignature(history) {
        try {
            return history.slice(0, 30).map(s => s.timestamp).join('|');
        } catch (_) {
            return '';
        }
    }

    // Cache para evitar flutuação desnecessária da análise
    let lastAnalysisSignature = '';
    let currentAnalysisStatus = 'Aguardando análise...';
    let modeApiStatusTypingInterval = null;

    const escapeHtml = (text = '') => String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const highlightDiamondStatus = (html = '') => {
        return String(html).replace(/(N(?:10|[1-9]))/g, '<span class="diamond-status-tag">$1</span>');
    };
    
    // Função para mostrar padrão quando clicar na entrada
    function showPatternForEntry(entry) {
        if (!entry || !entry.patternData) {
            console.log('❌ Nenhum padrão disponível para esta entrada');
            showNoPatternModal(entry);
            return;
        }
        
        try {
            // Parsear o padrão
            let parsed;
            const desc = entry.patternData.patternDescription;
            
            // ✅ VERIFICAR SE É ANÁLISE DE IA
            if (typeof desc === 'string' && desc.trim().startsWith('🤖')) {
                // É análise de IA - NÃO fazer parse
                parsed = desc;
            } else {
                // É análise padrão - fazer parse do JSON
                parsed = typeof desc === 'string' ? JSON.parse(desc) : desc;
            }
            
            // Criar modal para mostrar o padrão
            const modal = document.createElement('div');
            modal.className = 'pattern-modal';
            modal.innerHTML = `
                <div class="pattern-modal-content">
                    <div class="pattern-modal-header">
                        <h3>Padrão da Entrada</h3>
                        <button class="pattern-modal-close">Fechar</button>
                    </div>
                    <div class="pattern-modal-body">
                        <div class="entry-info">
                            <div class="entry-color-info">
                                <span class="entry-label">Cor:</span>
                                <div class="entry-color-display ${entry.color}">
                                    ${entry.color === 'white' ? blazeWhiteSVG(18) : ''}
                                </div>
                                <span class="entry-color-name">${entry.color === 'red' ? 'Vermelho' : entry.color === 'black' ? 'Preto' : 'Branco'}</span>
                            </div>
                            <div class="entry-confidence">
                                <span class="entry-label">Confiança:</span>
                                <span class="entry-confidence-value">${entry.confidence.toFixed(1)}%</span>
                            </div>
                            <div class="entry-result">
                                <span class="entry-label">Resultado:</span>
                                <span class="entry-result-value ${entry.result === 'WIN' ? 'win-text' : 'loss-text'}">${entry.result}</span>
                            </div>
                        </div>
                        <div class="pattern-details">
                            ${renderPatternVisual(parsed)}
                        </div>
                    </div>
                </div>
            `;
            
            // Anexar o modal DENTRO da extensão para casar 100% com a largura/altura
                const sidebar = document.getElementById('blaze-double-analyzer');
                if (sidebar) {
                // Garantir que o container seja relativo
                if (getComputedStyle(sidebar).position === 'static') {
                    sidebar.style.position = 'relative';
                }
                sidebar.appendChild(modal);
            } else {
                // Fallback raro: se não achar a sidebar, cai para body
                document.body.appendChild(modal);
                    }
            
            // Eventos do modal
            const closeBtn = modal.querySelector('.pattern-modal-close');
            const removeModal = function() {
                if (modal.parentElement) {
                    modal.parentElement.removeChild(modal);
                }
                document.removeEventListener('keydown', handleEsc);
            };
            
            // Fechar ao clicar no botão
            closeBtn.onclick = removeModal;
            
            // Fechar ao clicar fora do conteúdo
            modal.onclick = function(e) {
                if (e.target === modal) {
                    removeModal();
                }
            };
            
            // Fechar com ESC
            const handleEsc = function(e) {
                if (e.key === 'Escape') {
                    removeModal();
                }
            };
            document.addEventListener('keydown', handleEsc);
            
        } catch (error) {
            console.error('Erro ao mostrar padrão da entrada:', error);
            showNoPatternModal(entry);
        }
    }
    
    // Função para mostrar modal quando não há padrão disponível
    function showNoPatternModal(entry) {
        const modal = document.createElement('div');
        modal.className = 'pattern-modal';
        modal.innerHTML = `
            <div class="pattern-modal-content">
                <div class="pattern-modal-header">
                    <h3>Padrão Não Disponível</h3>
                    <button class="pattern-modal-close">Fechar</button>
                </div>
                <div class="pattern-modal-body">
                    <div class="no-pattern-info">
                        <p>Esta entrada foi registrada antes da implementação do sistema de padrões.</p>
                        <p>Não é possível mostrar o padrão que gerou esta entrada.</p>
                        <div class="entry-summary">
                            <div class="entry-summary-item">
                                <span class="summary-label">Entrada:</span>
                                <div class="entry-color-display ${entry.color}">
                                    ${entry.color === 'white' ? blazeWhiteSVG(16) : ''}
                                </div>
                                <span class="summary-value">${entry.color === 'red' ? 'Vermelho' : entry.color === 'black' ? 'Preto' : 'Branco'} (${entry.number})</span>
                            </div>
                            <div class="entry-summary-item">
                                <span class="summary-label">Resultado:</span>
                                <span class="summary-value ${entry.result === 'WIN' ? 'win-text' : 'loss-text'}">${entry.result}</span>
                            </div>
                            <div class="entry-summary-item">
                                <span class="summary-label">Horário:</span>
                                <span class="summary-value">${new Date(entry.timestamp).toLocaleString('pt-BR')}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Adicionar ao body
        document.body.appendChild(modal);
        
        // ✅ CENTRALIZAR MODAL COM BASE NA POSIÇÃO DA EXTENSÃO (com delay para renderização)
        setTimeout(() => {
            const sidebar = document.getElementById('blaze-double-analyzer');
            if (sidebar) {
                const rect = sidebar.getBoundingClientRect();
                const modalContent = modal.querySelector('.pattern-modal-content');
                
                if (modalContent) {
                    // Centralizar horizontalmente com a sidebar
                    const sidebarCenterX = rect.left + (rect.width / 2);
                    const modalWidth = modalContent.offsetWidth || 500;
                    const leftPosition = sidebarCenterX - (modalWidth / 2);
                    
                    // Centralizar verticalmente no viewport
                    const modalHeight = modalContent.offsetHeight || 300;
                    const viewportHeight = window.innerHeight;
                    const topPosition = (viewportHeight - modalHeight) / 2;
                    
                    // Garantir que não saia da tela (margens mínimas)
                    const finalLeft = Math.max(20, Math.min(leftPosition, window.innerWidth - modalWidth - 20));
                    const finalTop = Math.max(20, topPosition);
                    
                    modalContent.style.position = 'fixed';
                    modalContent.style.left = `${finalLeft}px`;
                    modalContent.style.top = `${finalTop}px`;
                    modalContent.style.transform = 'none'; // Remove transform padrão
                    
                    console.log('✅ Modal "sem padrão" centralizado com a extensão:', {
                        sidebarRect: rect,
                        modalWidth: modalWidth,
                        modalHeight: modalHeight,
                        finalPosition: { left: finalLeft, top: finalTop }
                    });
                }
            }
        }, 10);
        
        // Eventos do modal
        const closeBtn = modal.querySelector('.pattern-modal-close');
        closeBtn.onclick = function() {
            document.body.removeChild(modal);
        };
        
        // Fechar ao clicar fora do modal
        modal.onclick = function(e) {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        };
        
        // Fechar com ESC
        const handleEsc = function(e) {
            if (e.key === 'Escape') {
                document.body.removeChild(modal);
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }
    
    // Função auxiliar para renderizar análise IA COM círculos coloridos
    function renderAIAnalysisWithSpins(aiData, last5Spins) {
        console.log('%c🎨 RENDERIZANDO IA COM CÍRCULOS!', 'color: #00FF00; font-weight: bold; font-size: 14px;');
        
        // Renderizar círculos coloridos
        const spinsHTML = last5Spins.map((spin, index) => {
            const isWhite = spin.color === 'white';
            const colorName = spin.color === 'red' ? 'Vermelho' : spin.color === 'black' ? 'Preto' : 'Branco';
            return `<div class="spin-history-item-wrap" title="${colorName}: ${spin.number}" style="display: inline-block; margin: 0 4px;">
                <div class="spin-history-quadrado ${spin.color}">
                    ${isWhite ? blazeWhiteSVG(24) : `<span>${spin.number}</span>`}
                </div>
                <div class="spin-history-time" style="font-size: 10px; text-align: center;">${index === 0 ? 'Recente' : `${index + 1}º`}</div>
            </div>`;
        }).join('');
        
        return `<div style="
            background: rgba(20, 20, 30, 0.95);
            border: 1px solid rgba(100, 100, 200, 0.3);
            border-radius: 8px;
            padding: 15px;
            margin: 10px 0;
        ">
            <div style="margin: 12px 0;">
                <div style="color: #b794f6; font-weight: bold; font-size: 15px; margin-bottom: 8px;">
                    ${aiData.color === 'red' ? '🔴 Entrar na cor VERMELHA' : aiData.color === 'black' ? '⚫ Entrar na cor PRETA' : '⚪ Entrar na cor BRANCA'}
                </div>
                <div style="color: #e8e8ff; font-size: 12px; margin-bottom: 5px;">
                    Confiança: ${aiData.confidence.toFixed(1)}%
                </div>
            </div>
            
            <div style="
                border-top: 1px solid rgba(100, 100, 200, 0.2);
                padding-top: 12px;
                margin-top: 12px;
            ">
                <div style="
                    color: #b794f6;
                    font-weight: bold;
                    font-size: 13px;
                    margin-bottom: 8px;
                ">💡 ÚLTIMOS 10 GIROS:</div>
                
                <div style="
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 6px;
                    padding: 12px;
                    margin: 8px 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    flex-wrap: wrap;
                ">
                    ${spinsHTML}
                </div>
            </div>
            
            <div style="
                border-top: 1px solid rgba(100, 100, 200, 0.2);
                padding-top: 12px;
                margin-top: 12px;
            ">
                <div style="
                    color: #b794f6;
                    font-weight: bold;
                    font-size: 13px;
                    margin-bottom: 8px;
                ">💎 RACIOCÍNIO:</div>
                <div style="
                    white-space: pre-wrap;
                    font-family: 'Segoe UI', 'Roboto', monospace;
                    font-size: 11.5px;
                    line-height: 1.5;
                    color: #d0d0e8;
                ">${aiData.reasoning
                    .replace(/N1 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N1</span> -')
                    .replace(/N2 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N2</span> -')
                    .replace(/N3 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N3</span> -')
                    .replace(/N4 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N4</span> -')
                    .replace(/N5 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N5</span> -')
                    .replace(/N6 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N6</span> -')
                    .replace(/N7 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N7</span> -')
                    .replace(/N8 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N8</span> -')
                    .replace(/N9 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N9</span> -')
                    .replace(/N10 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N10</span> -')
                    .replace(/🗳️/g, '<span style="color: #FFD700; font-weight: bold;">🗳️</span>')
                    .replace(/🏆/g, '<span style="color: #FFD700; font-weight: bold;">🏆</span>')
                    .replace(/🎚️/g, '<span style="color: #b794f6; font-weight: bold;">🎚️</span>')
                    .replace(/🎯/g, '<span style="color: #00FF88; font-weight: bold;">🎯</span>')
                    .replace(/📊/g, '<span style="color: #00d4ff; font-weight: bold;">📊</span>')
                }</div>
            </div>
        </div>`;
    }
    
    // Função auxiliar para renderizar análise IA SEM círculos (formato antigo)
    function renderAIAnalysisOldFormat(aiData) {
        const reasoning = (aiData.reasoning || 'Análise por IA')
            .replace(/N1 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N1</span> -')
            .replace(/N2 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N2</span> -')
            .replace(/N3 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N3</span> -')
            .replace(/N4 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N4</span> -')
            .replace(/N5 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N5</span> -')
            .replace(/N6 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N6</span> -')
            .replace(/N7 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N7</span> -')
            .replace(/N8 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N8</span> -')
            .replace(/N9 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N9</span> -')
            .replace(/N10 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N10</span> -')
            .replace(/🗳️/g, '<span style="color: #FFD700; font-weight: bold;">🗳️</span>')
            .replace(/🏆/g, '<span style="color: #FFD700; font-weight: bold;">🏆</span>')
            .replace(/🎚️/g, '<span style="color: #b794f6; font-weight: bold;">🎚️</span>')
            .replace(/🎯/g, '<span style="color: #00FF88; font-weight: bold;">🎯</span>')
            .replace(/📊/g, '<span style="color: #00d4ff; font-weight: bold;">📊</span>');
        
        return `<div style="
            background: rgba(20, 20, 30, 0.95);
            border: 1px solid rgba(100, 100, 200, 0.3);
            border-radius: 8px;
            padding: 15px;
            margin: 10px 0;
        ">
            <div style="
                color: #b794f6;
                font-weight: bold;
                font-size: 13px;
                margin-bottom: 10px;
            ">💎 RACIOCÍNIO:</div>
            <div style="
                white-space: pre-wrap;
                font-family: 'Segoe UI', 'Roboto', monospace;
                font-size: 11.5px;
                line-height: 1.5;
                color: #d0d0e8;
                margin: 0;
            ">${reasoning}</div>
        </div>`;
    }
    // Função para renderizar padrão visualmente com números e horários completos
    function renderPatternVisual(parsed, patternData = null) {
        console.log('🔍 renderPatternVisual chamado com:', typeof parsed, parsed);
        console.log('🔍 patternData:', patternData);
        
        // ✅ VERIFICAR SE JÁ É UM OBJETO JSON ESTRUTURADO DE IA
        if (typeof parsed === 'object' && parsed !== null && parsed.type === 'AI_ANALYSIS') {
            console.log('%c✅ DETECTADO: JSON ESTRUTURADO DE IA!', 'color: #00FF00; font-weight: bold;');
            console.log('%c   🎲 last5Spins no objeto:', 'color: #00FF00;', parsed.last5Spins);
            console.log('%c   🎲 patternData:', 'color: #00FF00;', patternData);
            
            // Usar last5Spins do parsed OU do patternData
            const last5Spins = parsed.last5Spins || (patternData && patternData.last5Spins) || [];
            console.log('%c   🎯 last5Spins final a usar:', 'color: #00FFFF; font-weight: bold;', last5Spins);
            
            if (last5Spins.length > 0) {
                // Renderizar com círculos coloridos
                return renderAIAnalysisWithSpins(parsed, last5Spins);
            } else {
                console.log('%c⚠️ last5Spins vazio - renderizando formato antigo', 'color: #FFAA00;');
                return renderAIAnalysisOldFormat(parsed);
            }
        }
        
        // Se for JSON bruto, tentar extrair informações úteis
        if (typeof parsed === 'string') {
            console.log('📝 É string, verificando se é IA...');
            console.log('📝 Primeiros 50 caracteres:', parsed.substring(0, 50));
            console.log('📝 Começa com 🤖?', parsed.trim().startsWith('🤖'));
            
            // ✅ PRIORIDADE 1: Verificar se last5Spins vem direto no objeto patternData
            let aiData = null;
            if (patternData && patternData.last5Spins && patternData.last5Spins.length > 0) {
                console.log('%c🎯 [PRIORITY 1] last5Spins ENCONTRADO DIRETO NO OBJETO!', 'color: #00FF00; font-weight: bold;');
                console.log('%c   📊 Quantidade:', 'color: #00FF00;', patternData.last5Spins.length);
                console.log('%c   🎲 Dados:', 'color: #00FF00;', patternData.last5Spins);
                
                // Criar aiData com os dados diretos
                try {
                    const jsonParsed = JSON.parse(parsed);
                    aiData = {
                        type: 'AI_ANALYSIS',
                        color: jsonParsed.color || 'unknown',
                        confidence: jsonParsed.confidence || 0,
                        last5Spins: patternData.last5Spins, // ✅ USAR DIRETO DO OBJETO
                        reasoning: jsonParsed.reasoning || 'Análise por IA'
                    };
                } catch (e) {
                    // Se parsing falhar, criar estrutura mínima
                    aiData = {
                        type: 'AI_ANALYSIS',
                        color: 'unknown',
                        confidence: 0,
                        last5Spins: patternData.last5Spins,
                        reasoning: 'Análise por IA'
                    };
                }
                console.log('%c✅ aiData criado com sucesso!', 'color: #00FF00; font-weight: bold;', aiData);
            } else {
                // ✅ PRIORIDADE 2: Tentar fazer parse do JSON (fallback)
                console.log('%c⚠️ [PRIORITY 2] last5Spins NÃO veio direto - Tentando JSON parse...', 'color: #FFAA00;');
                try {
                    // Tentar fazer parse como JSON (novo formato estruturado)
                    const jsonParsed = JSON.parse(parsed);
                    if (jsonParsed.type === 'AI_ANALYSIS') {
                        aiData = jsonParsed;
                        console.log('%c🔍 [CONTENT.JS] JSON PARSED COM SUCESSO!', 'color: #00FFFF; font-weight: bold;');
                        console.log('%c   📦 Tipo:', 'color: #00FFFF;', aiData.type);
                        console.log('%c   🎯 Cor:', 'color: #00FFFF;', aiData.color);
                        console.log('%c   📊 Confiança:', 'color: #00FFFF;', aiData.confidence);
                        console.log('%c   🎲 last5Spins existe?', 'color: #00FFFF;', aiData.last5Spins ? '✅ SIM' : '❌ NÃO');
                        if (aiData.last5Spins) {
                            console.log('%c   🎲 last5Spins.length:', 'color: #00FFFF;', aiData.last5Spins.length);
                            console.log('%c   🎲 Dados:', 'color: #00FFFF;', aiData.last5Spins);
                        }
                    }
                } catch (e) {
                    console.log('%c⚠️ [CONTENT.JS] NÃO É JSON - Verificando texto...', 'color: #FFAA00;');
                    // Não é JSON estruturado, verificar se é texto antigo
                    if (parsed.trim().startsWith('🤖')) {
                        aiData = { type: 'AI_ANALYSIS_OLD', text: parsed };
                        console.log('%c✅ [CONTENT.JS] Texto IA antigo detectado', 'color: #00FFFF;');
                    }
                }
            }
            
            if (aiData) {
                console.log('✅ DETECTADO: Análise por IA - renderizando com círculos coloridos');
                
                // Se for formato novo (estruturado com last5Spins)
                if (aiData.last5Spins && aiData.last5Spins.length > 0) {
                    console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00FF00; font-weight: bold; font-size: 14px;');
                    console.log('%c║  🎨 RENDERIZANDO COM CÍRCULOS COLORIDOS!                 ║', 'color: #00FF00; font-weight: bold; font-size: 14px;');
                    console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00FF00; font-weight: bold; font-size: 14px;');
                    console.log('%c   📊 Quantidade de giros para renderizar:', 'color: #00FF00; font-weight: bold;', aiData.last5Spins.length);
                    
                    // Mostrar cada giro que será renderizado
                    aiData.last5Spins.forEach((spin, index) => {
                        console.log(`%c   ${index + 1}. ${spin.color.toUpperCase()} (${spin.number})`, 
                            `color: ${spin.color === 'red' ? '#FF0000' : spin.color === 'black' ? '#FFFFFF' : '#00FF00'}; font-weight: bold;`);
                    });
                    console.log('');
                    
                    // Renderizar círculos coloridos igual ao histórico
                    const spinsHTML = aiData.last5Spins.map((spin, index) => {
                        const isWhite = spin.color === 'white';
                        const colorName = spin.color === 'red' ? 'Vermelho' : spin.color === 'black' ? 'Preto' : 'Branco';
                        return `<div class="spin-history-item-wrap" title="${colorName}: ${spin.number}" style="display: inline-block; margin: 0 4px;">
                            <div class="spin-history-quadrado ${spin.color}">
                                ${isWhite ? blazeWhiteSVG(24) : `<span>${spin.number}</span>`}
                            </div>
                            <div class="spin-history-time" style="font-size: 10px; text-align: center;">${index === 0 ? 'Recente' : `${index + 1}º`}</div>
                        </div>`;
                    }).join('');
                    
                    return `<div style="
                        background: rgba(20, 20, 30, 0.95);
                        border: 1px solid rgba(100, 100, 200, 0.3);
                        border-radius: 8px;
                        padding: 15px;
                        margin: 10px 0;
                    ">
                        <div style="margin: 12px 0;">
                            <div style="color: #b794f6; font-weight: bold; font-size: 15px; margin-bottom: 8px;">
                                ${aiData.color === 'red' ? '🔴 Entrar na cor VERMELHA' : aiData.color === 'black' ? '⚫ Entrar na cor PRETA' : '⚪ Entrar na cor BRANCA'}
                            </div>
                            <div style="color: #e8e8ff; font-size: 12px; margin-bottom: 5px;">
                                Confiança: ${aiData.confidence.toFixed(1)}%
                            </div>
                        </div>
                        
                        <div style="
                            border-top: 1px solid rgba(100, 100, 200, 0.2);
                            padding-top: 12px;
                            margin-top: 12px;
                        ">
                            <div style="
                                color: #b794f6;
                                font-weight: bold;
                                font-size: 13px;
                                margin-bottom: 8px;
                            ">💡 ÚLTIMOS 5 GIROS ANALISADOS:</div>
                            
                            <div style="
                                background: rgba(0, 0, 0, 0.2);
                                border-radius: 6px;
                                padding: 12px;
                                margin: 8px 0;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                gap: 8px;
                                flex-wrap: wrap;
                            ">
                                ${spinsHTML}
                            </div>
                        </div>
                        
                        <div style="
                            border-top: 1px solid rgba(100, 100, 200, 0.2);
                            padding-top: 12px;
                            margin-top: 12px;
                        ">
                            <div style="
                                color: #b794f6;
                                font-weight: bold;
                                font-size: 13px;
                                margin-bottom: 8px;
                            ">💎 RACIOCÍNIO:</div>
                            <div style="
                                white-space: pre-wrap;
                                font-family: 'Segoe UI', 'Roboto', monospace;
                                font-size: 11.5px;
                                line-height: 1.5;
                                color: #d0d0e8;
                            ">${aiData.reasoning
                                .replace(/N1 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N1</span> -')
                                .replace(/N2 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N2</span> -')
                                .replace(/N3 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N3</span> -')
                                .replace(/N4 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N4</span> -')
                                .replace(/N5 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N5</span> -')
                                .replace(/N6 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N6</span> -')
                                .replace(/N7 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N7</span> -')
                                .replace(/N8 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N8</span> -')
                                .replace(/N9 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N9</span> -')
                                .replace(/🗳️/g, '<span style="color: #FFD700; font-weight: bold;">🗳️</span>')
                                .replace(/🏆/g, '<span style="color: #FFD700; font-weight: bold;">🏆</span>')
                                .replace(/🎚️/g, '<span style="color: #b794f6; font-weight: bold;">🎚️</span>')
                                .replace(/🎯/g, '<span style="color: #00FF88; font-weight: bold;">🎯</span>')
                                .replace(/📊/g, '<span style="color: #00d4ff; font-weight: bold;">📊</span>')
                            }</div>
                        </div>
                    </div>`;
                } else {
                    // Formato antigo (texto simples)
                    console.log('%c⚠️ CAIU NO ELSE - Formato antigo (sem círculos)', 'color: #FF0000; font-weight: bold;');
                    console.log('%c   ❓ Motivo: last5Spins não encontrado ou vazio', 'color: #FF0000;');
                    console.log('%c   📦 aiData completo:', 'color: #FF0000;', aiData);
                    
                    const reasoning = (aiData.text || aiData.reasoning || 'Análise por IA')
                        .replace(/N1 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N1</span> -')
                        .replace(/N2 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N2</span> -')
                        .replace(/N3 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N3</span> -')
                        .replace(/N4 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N4</span> -')
                        .replace(/N5 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N5</span> -')
                        .replace(/N6 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N6</span> -')
                        .replace(/N7 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N7</span> -')
                        .replace(/N8 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N8</span> -')
                        .replace(/N9 -/g, '<span style="color: #00d4ff; font-weight: bold; font-size: 12px;">N9</span> -')
                        .replace(/🗳️/g, '<span style="color: #FFD700; font-weight: bold;">🗳️</span>')
                        .replace(/🏆/g, '<span style="color: #FFD700; font-weight: bold;">🏆</span>')
                        .replace(/🎚️/g, '<span style="color: #b794f6; font-weight: bold;">🎚️</span>')
                        .replace(/🎯/g, '<span style="color: #00FF88; font-weight: bold;">🎯</span>')
                        .replace(/📊/g, '<span style="color: #00d4ff; font-weight: bold;">📊</span>');
                    
                    return `<div style="
                        background: rgba(20, 20, 30, 0.95);
                        border: 1px solid rgba(100, 100, 200, 0.3);
                        border-radius: 8px;
                        padding: 15px;
                        margin: 10px 0;
                    ">
                        <div style="
                            color: #b794f6;
                            font-weight: bold;
                            font-size: 13px;
                            margin-bottom: 10px;
                        ">💎 RACIOCÍNIO:</div>
                        <div style="
                            white-space: pre-wrap;
                            font-family: 'Segoe UI', 'Roboto', monospace;
                            font-size: 11.5px;
                            line-height: 1.5;
                            color: #d0d0e8;
                            margin: 0;
                        ">${reasoning}</div>
                    </div>`;
                }
            }
            
            console.log('📝 Não é IA, tentando fazer JSON.parse...');
            console.log('📦 Tipo do parsed:', typeof parsed);
            console.log('📦 Conteúdo do parsed:', parsed);
            
            // Tentar fazer parse JSON para outros formatos
            try {
                parsed = JSON.parse(parsed);
                console.log('✅ JSON.parse bem-sucedido!');
                console.log('✅ Estrutura parseada:', Object.keys(parsed));
            } catch (e) {
                console.error('❌ ERRO no JSON.parse:', e);
                console.error('❌ Tipo:', typeof parsed);
                console.error('❌ Conteúdo:', parsed);
                console.error('❌ Primeiros 200 chars:', String(parsed).substring(0, 200));
                
                // ✅ FALLBACK: Se não conseguir parsear, criar estrutura mínima
                if (typeof parsed === 'string') {
                    console.log('🔄 Criando estrutura fallback...');
                    parsed = {
                        expected_next: null,
                        colorAnalysis: null,
                        fallback: true,
                        originalText: parsed
                    };
                } else {
                    return `<div class="pattern-error">Erro ao processar padrão: ${e.message}</div>`;
                }
            }
        }

        // Extrair informações do padrão de cores
        let patternInfo = '';
        let occurrences = 1;
        let occurrenceTimes = [];
        let lastOccurrenceNumbers = [];
        let lastOccurrenceTimestamps = [];
        let patternName = '';
        
        if (parsed.colorAnalysis && parsed.colorAnalysis.pattern) {
            const colors = parsed.colorAnalysis.pattern;
            const colorNames = colors.map(c => c === 'red' ? 'Vermelho' : c === 'black' ? 'Preto' : 'Branco');
            // Render como ícones/color badges em linha
            const icons = colors.map(c => `<span class="pattern-dot ${c}"></span>`).join(' ');
            patternInfo = `Sequência: ${icons}`;
            occurrences = parsed.colorAnalysis.occurrences || 1;
            occurrenceTimes = parsed.colorAnalysis.occurrenceTimes || [];
            lastOccurrenceNumbers = parsed.colorAnalysis.allOccurrenceNumbers || [];
            lastOccurrenceTimestamps = parsed.colorAnalysis.allOccurrenceTimestamps || [];
            patternName = parsed.colorAnalysis.patternType || parsed.patternType || '';
            var triggerColor = parsed.colorAnalysis.triggerColor || null;
            var allTriggerNumbers = parsed.colorAnalysis.allTriggerNumbers || [];
            var allTriggerTimestamps = parsed.colorAnalysis.allTriggerTimestamps || [];
            var allTriggerColors = parsed.colorAnalysis.allTriggerColors || [];
        }
        
        // Se não tem análise de cores, tentar outras análises
        if (!patternInfo) {
            if (parsed.numberAnalysis) {
                patternInfo = `Padrão Numérico: ${parsed.numberAnalysis.pattern}`;
                occurrences = parsed.numberAnalysis.occurrences || 1;
            } else if (parsed.timeAnalysis) {
                patternInfo = `Padrão Temporal: ${parsed.timeAnalysis.pattern}`;
                occurrences = parsed.timeAnalysis.occurrences || 1;
            } else if (parsed.correlationAnalysis) {
                patternInfo = `Correlação: ${parsed.correlationAnalysis.pattern}`;
                occurrences = parsed.correlationAnalysis.occurrences || 1;
            } else if (parsed.frequencyAnalysis) {
                patternInfo = `Frequência: ${parsed.frequencyAnalysis.pattern}`;
                occurrences = parsed.frequencyAnalysis.occurrences || 1;
            } else if (parsed.fallback) {
                // Se é fallback, mostrar mensagem genérica
                const expectedColor = parsed.expected_next || 'unknown';
                const colorEmoji = expectedColor === 'red' ? '🔴' : expectedColor === 'black' ? '⚫' : expectedColor === 'white' ? '⚪' : '❓';
                const colorName = expectedColor === 'red' ? 'Vermelho' : expectedColor === 'black' ? 'Preto' : expectedColor === 'white' ? 'Branco' : 'Desconhecida';
                patternInfo = `${colorEmoji} Análise de Padrões → ${colorName}`;
                console.log(`🔄 Usando fallback, cor: ${colorName}`);
            } else if (parsed.expected_next) {
                // Se tem cor esperada mas sem padrão detalhado
                const expectedColor = parsed.expected_next;
                const colorEmoji = expectedColor === 'red' ? '🔴' : expectedColor === 'black' ? '⚫' : expectedColor === 'white' ? '⚪' : '❓';
                const colorName = expectedColor === 'red' ? 'Vermelho' : expectedColor === 'black' ? 'Preto' : expectedColor === 'white' ? 'Branco' : 'Desconhecida';
                patternInfo = `${colorEmoji} Previsão: ${colorName}`;
                console.log(`🎯 Cor prevista: ${colorName}`);
            } else {
                patternInfo = `Padrão detectado`;
                console.log('⚠️ Nenhuma informação específica do padrão disponível');
            }
        }
        
        // Construir HTML com ocorrências completas
        let html = `<div class="pattern-summary">
            <div class="pattern-title">Padrão Detectado${patternName ? ` • ${patternName}` : ''}</div>
            ${(() => {
                // Buscar informações de assertividade em diferentes locais (igual Telegram)
                let s = null;
                if (parsed.colorAnalysis && parsed.colorAnalysis.summary) {
                    s = parsed.colorAnalysis.summary;
                } else if (parsed.colorAnalysis && parsed.colorAnalysis.assertiveness) {
                    s = parsed.colorAnalysis.assertiveness;
                } else if (parsed.assertiveness) {
                    s = parsed.assertiveness;
                } else if (parsed.summary) {
                    s = parsed.summary;
                }
                
                if (!s) return '';
                const totalOcc = s.occurrences || 0;
                const sampleMin = s.sampleMin || 0;
                const totalWins = (typeof s.wins === 'number') ? s.wins : 0;
                const totalLosses = (typeof s.losses === 'number') ? s.losses : 0;
                const totalWinPct = (typeof s.winPct === 'number' ? s.winPct : 0);
                const totalLossPct = (typeof s.lossPct === 'number') ? s.lossPct : Math.max(0, 100 - totalWinPct);
                
                // Demais (excluindo rigor mínimo) - agora usando valores corretos
                const othersWins = (typeof s.othersWins === 'number') ? s.othersWins : 0;
                const othersLosses = (typeof s.othersLosses === 'number') ? s.othersLosses : 0;
                // ✅ CORREÇÃO: Não usar fallback incorreto de othersWins + othersLosses
                // othersCount é o número correto de "demais ocorrências" (total - amostra mínima)
                const othersCount = (typeof s.othersCount === 'number') ? s.othersCount : 0;
                const othersWinPct = othersCount > 0 ? (othersWins / othersCount) * 100 : 0;
                
                return `<div class="pattern-agg-row simple">
                    <span class="agg-text strong">${totalOcc} ocorrências</span>
                    <span class="agg-sep">•</span>
                    <span class="agg-text">WIN 100%/${sampleMin}</span>
                    <span class="agg-sep">•</span>
                    <span class="agg-text">Demais: WIN ${othersWins} (${othersWinPct.toFixed(0)}%)</span>
                    <span class="agg-sep">•</span>
                    <span class="agg-text loss">LOSS ${othersLosses} (${((othersCount > 0 ? (othersLosses/othersCount)*100 : 0)).toFixed(2)}%)</span>
                </div>`;
            })()}
            <div class="pattern-description">${patternInfo}</div>`;

        // Estatísticas agregadas (wins/losses) se presentes
        if (parsed.colorAnalysis && parsed.colorAnalysis.assertiveness && parsed.colorAnalysis.assertiveness.assertividade_final != null) {
            const agg = parsed.assertiveness && parsed.assertiveness.summary ? parsed.assertiveness.summary : null;
        }

        // Mostrar contagem e win/loss se disponíveis no description
        let winLoss = null;
        if (parsed.colorAnalysis && parsed.colorAnalysis.summary) {
            winLoss = parsed.colorAnalysis.summary;
        } else if (parsed.colorAnalysis && parsed.colorAnalysis.assertiveness) {
            winLoss = parsed.colorAnalysis.assertiveness;
        } else if (parsed.assertiveness) {
            winLoss = parsed.assertiveness;
        } else if (parsed.summary) {
            winLoss = parsed.summary;
        }
        const len = winLoss?.patternLength || (parsed.colorAnalysis?.pattern?.length || null);
        const occLabel = `${occurrences} ocorrência${occurrences > 1 ? 's' : ''}`;
        const rigorLabel = (winLoss && typeof winLoss.othersCount === 'number') ? `${winLoss.othersCount} restante${winLoss.othersCount===1?'':'s'} (rigor)` : '';
        html += `<div class="pattern-meta">
            <span class="badge badge-green">${occLabel}</span>
            ${rigorLabel ? `<span class="meta-muted">${rigorLabel}</span>` : ''}
            ${len ? `<span class="meta-muted">Tamanho do padrão: ${len} giros</span>` : ''}
        </div>`;
        
        // Priorizar occurrenceDetails se disponível (novo formato detalhado)
        const occDetails = parsed.colorAnalysis?.occurrenceDetails || [];
        const hasDetails = occDetails.length > 0;
        
        // Mostrar cada ocorrência completa com números e horários
        if (hasDetails || (lastOccurrenceNumbers.length > 0 && lastOccurrenceTimestamps.length > 0)) {
            html += `<div class="pattern-occurrences">
                <div class="occurrences-title">Ocorrências encontradas:</div>`;
            
            // Usar occurrenceDetails se disponível, senão usar arrays antigos
            const maxOccurrences = hasDetails ? Math.min(occDetails.length, 5) : Math.min(lastOccurrenceNumbers.length, 5);
            
            for (let i = 0; i < maxOccurrences; i++) {
                // Se temos occurrenceDetails, usar; senão usar arrays antigos
                let occurrenceNumbers, occurrenceTimestamps, trigNum, trigTs, trigClr;
                let occDetail = null;
                
                if (hasDetails) {
                    occDetail = occDetails[i];
                    const detailNumbers = Array.isArray(occDetail?.sequence_numbers) ? occDetail.sequence_numbers : [];
                    const detailTimestamps = Array.isArray(occDetail?.sequence_timestamps) ? occDetail.sequence_timestamps : [];
                    occurrenceNumbers = detailNumbers.length > 0 ? detailNumbers : (lastOccurrenceNumbers[i] || []);
                    occurrenceTimestamps = detailTimestamps.length > 0 ? detailTimestamps : (lastOccurrenceTimestamps[i] || []);
                    trigNum = occDetail.trigger_number != null
                        ? occDetail.trigger_number
                        : (occDetail.giro_numbers && occDetail.giro_numbers.length > 0
                            ? occDetail.giro_numbers[0]
                            : (allTriggerNumbers ? allTriggerNumbers[i] : null));
                    trigTs = occDetail.trigger_timestamp || occDetail.timestamp || (allTriggerTimestamps ? allTriggerTimestamps[i] : null);
                    trigClr = occDetail.cor_disparo || (allTriggerColors ? allTriggerColors[i] : triggerColor);
                } else {
                    occurrenceNumbers = lastOccurrenceNumbers[i];
                    occurrenceTimestamps = lastOccurrenceTimestamps[i];
                    trigNum = allTriggerNumbers ? allTriggerNumbers[i] : null;
                    trigTs = allTriggerTimestamps ? allTriggerTimestamps[i] : null;
                    trigClr = allTriggerColors ? allTriggerColors[i] : triggerColor;
                }
                
                if (!occurrenceNumbers || !occurrenceTimestamps || occurrenceNumbers.length === 0) continue;
                
                // Usar o timestamp do primeiro giro da ocorrência
                const timeStr = new Date(occurrenceTimestamps[0]).toLocaleString('pt-BR', { 
                    day: '2-digit', 
                    month: '2-digit', 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                
                // Ícone de aviso se cor de disparo for inválida
                const invalidIcon = (occDetail && occDetail.flag_invalid_disparo) ? 
                    ` <span class="invalid-trigger-icon" title="${occDetail.invalid_reason || 'Cor de disparo inválida'}">⚠️</span>` : '';
                
                html += `<div class="occurrence-item">
                    <div class="occurrence-header">Ocorrência ${i + 1} - ${timeStr}${invalidIcon}</div>
                    <div class="occurrence-sequence">`;
                
                // Renderizar cada giro da ocorrência IGUAL AO HISTÓRICO DE GIROS
                const colors = parsed.colorAnalysis ? parsed.colorAnalysis.pattern : [];
                const expected = (parsed.expected_next || parsed.expectedNext || parsed.colorAnalysis?.expected_next || parsed.colorAnalysis?.suggestedColor || parsed?.color) || null;

                // 1) Desenhar primeiro a COR ESPERADA e o separador "=" na extrema esquerda
                if (expected) {
                    const expColor = expected === 'red' ? 'red' : expected === 'black' ? 'black' : 'white';
                    const expInner = expColor === 'white' ? blazeWhiteSVG(13) : `<span></span>`;
                    html += `<div class="pattern-spin">
                        <div class="pattern-quadrado ${expColor}">${expInner}</div>
                        <div class="pattern-time"></div>
                    </div>
                    <div class="pattern-sep">=</div>`;
                }

                // 2) Em seguida, desenhar a sequência do padrão normalmente
                colors.forEach((color, idx) => {
                    const number = occurrenceNumbers[idx] || '';
                    const timestamp = occurrenceTimestamps[idx] || '';
                    
                    // Formatar timestamp igual ao histórico (hora:minuto)
                    const timeStr = new Date(timestamp).toLocaleString('pt-BR', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                    });
                    
                    // Determinar cor para exibição
                    const displayColor = color === 'red' ? 'red' : color === 'black' ? 'black' : 'white';
                    const isWhite = color === 'white';
                    const inner = isWhite ? blazeWhiteSVG(13) : `<span>${number}</span>`;
                    
                    // Destacar a cor de disparo (trigger) com anel adicional e rótulo
                    const isTrigger = triggerColor && idx === 0 && triggerColor === (colors[0] === 'red' ? 'black' : colors[0] === 'black' ? 'red' : (colors[0] === 'white' ? 'red' : 'red')) ? false : false;
                    // Observação: o trigger é a cor imediatamente ANTERIOR à sequência; como renderizamos apenas a sequência,
                    // vamos exibir um chip antes da sequência indicando a Trigger.
                    
                    html += `<div class="pattern-spin">
                        <div class="pattern-quadrado ${displayColor}">${inner}</div>
                        <div class="pattern-time">${timeStr}</div>
                    </div>`;
                });

                
                // Se houver triggerColor, desenhar um quadrado de trigger no mesmo estilo com contorno amarelo
                if (trigClr) {
                    const trigTime = trigTs ? new Date(trigTs).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
                    const isTrigWhite = trigClr === 'white';
                    const innerTrig = isTrigWhite ? blazeWhiteSVG(13) : `<span>${trigNum}</span>`;
                    // Adicionar classe de alerta se cor de disparo for inválida
                    const invalidClass = (occDetail && occDetail.flag_invalid_disparo) ? ' invalid-trigger' : '';
                    html += `<div class="pattern-spin trigger-spin">
                        <div class="pattern-quadrado ${trigClr} trigger-highlight${invalidClass}">${innerTrig}</div>
                        <div class="pattern-time">${trigTime}</div>
                    </div>`;
                }
                
                html += `</div></div>`;
            }
            
            html += `</div>`;
        }
        
        // Mostrar contribuições das análises se disponível
        if (parsed.contributions) {
            html += `<div class="analysis-contributions">
                <div class="contrib-title">📈 Contribuições:</div>`;
            
            Object.entries(parsed.contributions).forEach(([type, value]) => {
                const typeName = {
                    'color': 'Cores',
                    'number': 'Números', 
                    'time': 'Temporal',
                    'correlation': 'Correlação',
                    'frequency': 'Frequência'
                }[type] || type;
                
                html += `<div class="contrib-item">${typeName}: ${value.toFixed(1)}%</div>`;
            });
            
            html += `</div>`;
        }
        
        html += `</div>`;
        
        return html;
    }

    function renderSpinHistory(history = []) {
        uiLog('═══════════════════════════════════════════════════════════');
        uiLog('🎨 RENDERIZANDO HISTÓRICO DE GIROS NA UI');
        uiLog('   Total de giros recebidos:', history.length);
        uiLog('   Primeiro giro:', history[0]);
        uiLog('   Último giro:', history[history.length - 1]);
        uiLog('═══════════════════════════════════════════════════════════');
        
        // ✅ Salvar histórico globalmente para poder re-renderizar com mais giros
        currentHistoryData = history;
        
        const totalSpins = history.length;
        const displayLimit = currentHistoryDisplayLimit; // Usar limite dinâmico
        const displayingCount = Math.min(totalSpins, displayLimit);
        const hasMore = totalSpins > displayLimit;
        const remainingSpins = totalSpins - displayLimit;
        
        return `
        <div class="spin-history-label">
            <span>ÚLTIMOS GIROS</span>
            <div class="spin-count-info">
                <span class="displaying-count">Exibindo ${displayingCount} de ${totalSpins}</span>
                ${hasMore ? '<span class="more-indicator" title="Mostrando os mais recentes">📊 +' + remainingSpins + ' no servidor</span>' : ''}
            </div>
        </div>
        <div class="spin-history-bar-blaze">
            ${history.slice(0, displayLimit).map((spin, index) => {
                let isWhite = spin.color === 'white';
                const time = new Date(spin.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return `<div class="spin-history-item-wrap" title="${isWhite ? 'Branco' : spin.color==='red' ? 'Vermelho' : 'Preto'}: ${spin.number} - ${time}">
                    <div class="spin-history-quadrado ${spin.color}">
                        ${isWhite ? blazeWhiteSVG(20) : `<span>${spin.number}</span>`}
                    </div>
                    <div class="spin-history-time">${time}</div>
                </div>`;
            }).join('')}
        </div>
        ${hasMore ? `
        <div style="text-align: center; margin-top: 12px; margin-bottom: 15px; padding: 8px 0;">
            <button id="loadMoreHistoryBtn" class="load-more-history-btn">
                Carregar Mais ${remainingSpins > 500 ? '(+500)' : '(+' + remainingSpins + ')'}
            </button>
        </div>
        ` : ''}`;
    }
    // Update sidebar with new data
    function updateSidebar(data) {
        const lastSpinNumber = document.getElementById('lastSpinNumber');
        const confidenceFill = document.getElementById('confidenceFill');
        const confidenceText = document.getElementById('confidenceText');
        const suggestionColor = document.getElementById('suggestionColor');
        const patternInfo = document.getElementById('patternInfo');
        const totalSpins = document.getElementById('totalSpins');
        const lastUpdate = document.getElementById('lastUpdate');
        // Não resetar o estágio imediatamente; somente quando realmente não houver Gale ativo
        
        if (data.lastSpin) {
            const spin = data.lastSpin;
            // Número com o mesmo estilo do histórico (quadrado com anel)
            lastSpinNumber.className = `spin-number ${spin.color}`;
            if (spin.color === 'white') {
                lastSpinNumber.innerHTML = blazeWhiteSVG(20);
            } else {
                lastSpinNumber.textContent = `${spin.number}`;
            }
            const lastSpinTime = document.getElementById('lastSpinTime');
            if (lastSpinTime) {
                try {
                    const t = new Date(spin.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    lastSpinTime.textContent = t;
                } catch(_) { lastSpinTime.textContent = ''; }
            }
        }
        
        if (Object.prototype.hasOwnProperty.call(data, 'analysis')) {
            if (data.analysis) {
                const analysis = data.analysis;
                const confidence = analysis.confidence;
                const phaseLabel = (analysis.phase && analysis.phase !== 'ENTRADA' && analysis.phase !== 'G0')
                    ? analysis.phase.toUpperCase()
                    : '';
                
                // Só atualiza UI se a análise mudou (evita flutuação a cada 2s)
                const analysisSig = `${analysis.suggestion}|${analysis.color}|${confidence.toFixed(2)}|${phaseLabel}|${analysis.createdOnTimestamp || analysis.timestamp || ''}`;
                if (analysisSig !== lastAnalysisSignature) {
                    lastAnalysisSignature = analysisSig;
                    // Update confidence meter
                    confidenceFill.style.width = `${confidence}%`;
                    confidenceText.textContent = `${confidence.toFixed(1)}%`;
                    
                    // Update suggestion
                    // ✅ VERIFICAR SE É ANÁLISE DIAMANTE
                    const isDiamondMode = analysis.patternDescription && 
                                          (analysis.patternDescription.includes('NÍVEL DIAMANTE') || 
                                           analysis.patternDescription.includes('5 Níveis'));
                    const suggestionTitle = isDiamondMode ? 'Análise por IA' : analysis.suggestion;
                    if (suggestionColor) {
                        suggestionColor.setAttribute('title', suggestionTitle || '');
                    }
                    // Cor sugerida com o mesmo estilo do histórico (quadrado com anel)
                    suggestionColor.className = `suggestion-color suggestion-color-box ${analysis.color}`;
                    
                    // Conteúdo do círculo de cor
                    if (analysis.color === 'white') {
                        suggestionColor.innerHTML = blazeWhiteSVG(20);
                    } else {
                        suggestionColor.innerHTML = ''; // Vazio para vermelho/preto (o círculo vem do CSS)
                    }
                    
                    console.log('📊 Cor sugerida atualizada:', analysis.color);
                }
                
                // Update pattern info - sempre usar renderização amigável
                if (Object.prototype.hasOwnProperty.call(data, 'pattern') && data.pattern) {
                    try {
                        console.log('');
                        console.log('🔍 ===== PROCESSANDO PADRÃO NA UI =====');
                        console.log('🔍 data.pattern:', data.pattern);
                        console.log('🔍 data.pattern.description (tipo):', typeof data.pattern.description);
                        console.log('🔍 data.pattern.description (primeiros 100 chars):', 
                            data.pattern.description ? data.pattern.description.substring(0, 100) : 'null');
                        
                        let parsed = data.pattern.description;
                        
                        // ✅ VERIFICAR SE É ANÁLISE DE IA
                        // Pode ser: texto começando com 🤖 OU JSON com type: 'AI_ANALYSIS'
                        let isAIAnalysis = false;
                        
                        // Verificar se é texto antigo com 🤖
                        if (typeof parsed === 'string' && parsed.trim().startsWith('🤖')) {
                            console.log('✅ DETECTADO: Análise por IA (formato texto antigo)');
                            isAIAnalysis = true;
                            patternInfo.innerHTML = renderPatternVisual(parsed, data.pattern);
                        } else {
                            // Fazer parse do JSON
                            parsed = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
                            
                            // ✅ VERIFICAR TIPO DE ANÁLISE
                            if (parsed.type === 'AI_ANALYSIS') {
                                console.log('✅ DETECTADO: Análise por IA (formato JSON estruturado)');
                                console.log('🎲 last5Spins no JSON:', parsed.last5Spins);
                                isAIAnalysis = true;
                                patternInfo.innerHTML = renderPatternVisual(parsed, data.pattern);
                            } else if (parsed.type === 'custom_pattern') {
                                console.log('✅ DETECTADO: Padrão Customizado');
                                console.log('📋 Nome:', parsed.name);
                                console.log('🎯 Sequência:', parsed.sequence.join(' → '));
                                console.log('📊 Ocorrências:', parsed.occurrences);
                                console.log('🎲 Próxima cor esperada:', parsed.expected_next);
                                
                                // Renderizar padrão customizado
                                const colorEmoji = parsed.expected_next === 'red' ? '🔴' : 
                                                 parsed.expected_next === 'black' ? '⚫' : '⚪';
                                const colorName = parsed.expected_next === 'red' ? 'VERMELHO' : 
                                                parsed.expected_next === 'black' ? 'PRETO' : 'BRANCO';
                                
                                patternInfo.innerHTML = `
                                    <div style="padding: 12px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">
                                        <div style="font-size: 14px; font-weight: bold; color: var(--text-primary); margin-bottom: 8px;">
                                            🎯 ${parsed.name}
                                        </div>
                                        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">
                                            Sequência: ${parsed.sequence.join(' → ')}
                                        </div>
                                        <div style="font-size: 13px; color: var(--text-primary); font-weight: bold; margin-top: 8px;">
                                            ${colorEmoji} Recomendação: ${colorName}
                                        </div>
                                        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                                            ${parsed.occurrences} ocorrência(s) | ${parsed.stats.red}% ⭕ ${parsed.stats.black}% ⚫ ${parsed.stats.white}% ⚪
                                        </div>
                                    </div>
                                `;
                            } else {
                                console.log('📝 Análise padrão detectada');
                                // anexar summary vindo do analysis se existir
                                if (data.analysis && data.analysis.summary) parsed.summary = data.analysis.summary;
                                patternInfo.innerHTML = renderPatternVisual(parsed, data.pattern);
                            }
                        }
                        
                        // ✅ ATUALIZAR TÍTULO DO MODO DE ANÁLISE
                        const analysisModeTitle = document.getElementById('analysisModeTitle');
                        if (analysisModeTitle) {
                            if (isAIAnalysis) {
                                analysisModeTitle.textContent = 'Análise por Inteligência Artificial';
                            } else {
                                analysisModeTitle.textContent = 'Análise por Sistema Padrão';
                            }
                        }
                        console.log('✅ Padrão processado com sucesso!');
                        console.log('🔍 =====================================');
                        console.log('');
                    } catch(e) {
                        console.error('❌ ===== ERRO AO PROCESSAR PADRÃO =====');
                        console.error('❌ Erro:', e);
                        console.error('❌ Stack:', e.stack);
                        console.error('❌ data.pattern:', data.pattern);
                        console.error('❌ data.pattern.description:', data.pattern.description);
                        console.error('❌ ======================================');
                        patternInfo.innerHTML = `<div class="pattern-error">Erro ao processar padrão</div>`;
                    }
                }
                
                // ✅ Update G1 status - LÓGICA CORRETA baseada no Martingale
                // Verificar estado do Martingale para mostrar o indicador correto
                storageCompat.get(['martingaleState']).then((result = {}) => {
                    const martingaleState = result.martingaleState;
                    
                    if (martingaleState && martingaleState.active) {
                        // ✅ LÓGICA CORRETA BASEADA NO NÚMERO DE LOSSES:
                        // - G1 = 1 LOSS anterior
                        // - G2 = 2 LOSSes anteriores  
                        // - G3 = 3 LOSSes anteriores
                        const lossCount = martingaleState.lossCount || 0;
                        let nextGale = '';
                        
                        if (lossCount === 1) {
                            nextGale = 'G1';
                        } else if (lossCount === 2) {
                            nextGale = 'G2';
                        } else if (lossCount === 3) {
                            nextGale = 'G3';
                        } else if (lossCount > 3) {
                            nextGale = `G${lossCount}`;
                        }
                        
                        console.log('🔍 DEBUG INDICADOR GALE:', {
                            lossCount: lossCount,
                            nextGale: nextGale,
                            martingaleActive: martingaleState.active,
                            currentStage: martingaleState.stage
                        });
                        
                        if (nextGale) {
                            setSuggestionStage(nextGale);
                            console.log('✅ INDICADOR ATIVADO:', nextGale, 'para', lossCount, 'LOSSes');
                        } else {
                            setSuggestionStage('');
                        }
                    } else {
                        setSuggestionStage('');
                        console.log('⚠️ Indicador desativado - Martingale não ativo');
                    }
                }).catch(error => {
                    console.warn('⚠️ Não foi possível ler martingaleState:', error);
                    setSuggestionStage('');
                });
                
                // status indicator removed; entries panel shows progress
            } else {
                // Sem análise ativa: mostrar feedback de busca ou coleta de dados
                lastAnalysisSignature = '';
                confidenceFill.style.width = '0%';
                confidenceText.textContent = '0%';
                
                // ✅ RESETAR TÍTULO DO MODO DE ANÁLISE
                const analysisModeTitle = document.getElementById('analysisModeTitle');
                if (analysisModeTitle) {
                    analysisModeTitle.textContent = 'Aguardando Análise';
                }
                
                renderSuggestionStatus(currentAnalysisStatus);
                
                // ✅ LIMPAR INFORMAÇÕES DO PADRÃO (remove dados das 6 fases do Modo Diamante)
                patternInfo.textContent = 'Nenhum padrão detectado';
                patternInfo.title = '';
                setSuggestionStage('');
                // status indicator removed; entries panel shows progress
            }
        }
        
        // Update stats (totalSpins agora vem do servidor)
        // O totalSpins é atualizado apenas por updateHistoryUIFromServer()
        
        lastUpdate.textContent = new Date().toLocaleTimeString();

        // Atualizar painel de entradas se disponível
        if (data.entriesHistory) {
            renderEntriesPanel(data.entriesHistory);
        } else {
            // Buscar do storage se não foi fornecido
            try {
                chrome.storage.local.get(['entriesHistory'], function(res) {
                    if (res && res.entriesHistory) {
                        renderEntriesPanel(res.entriesHistory);
                    }
                });
            } catch(_) {}
        }

        // HISTÓRICO agora vem EXCLUSIVAMENTE do servidor (updateHistoryUIFromServer)
        // Não renderizar histórico a partir de data.history (memória local)
        // O histórico é atualizado INSTANTANEAMENTE via WebSocket quando há novo giro
        
        // FORÇAR VISIBILIDADE do container de histórico (se existir)
            const historyContainer = document.getElementById('spin-history-bar-ext');
            if (historyContainer) {
                historyContainer.style.display = 'block';
                historyContainer.style.visibility = 'visible';
                historyContainer.style.opacity = '1';
        }
    }
    
    function renderSuggestionStatus(statusText) {
        const suggestionColor = document.getElementById('suggestionColor');
        if (!suggestionColor) return;
        const normalized = typeof statusText === 'string' ? statusText : '';
        suggestionColor.removeAttribute('title');
        
        if (normalized && normalized.includes('Aguardando')) {
            suggestionColor.className = 'suggestion-color suggestion-color-box neutral waiting';
            suggestionColor.innerHTML = '<span class="hourglass-icon">⏳</span>';
        } else if (normalized && normalized.includes('Coletando')) {
            suggestionColor.className = 'suggestion-color suggestion-color-box neutral loading';
            suggestionColor.innerHTML = '<div class="spinner"></div>';
        } else {
            suggestionColor.className = 'suggestion-color suggestion-color-box neutral loading';
            suggestionColor.innerHTML = '<div class="spinner"></div>';
        }
    }

    function setSuggestionStage(label) {
        const suggestionStage = document.getElementById('suggestionStage');
        const wrapper = suggestionStage?.closest('.suggestion-color-wrapper');
        if (!suggestionStage) return;
        if (label) {
            suggestionStage.textContent = label;
            suggestionStage.classList.add('visible');
            if (wrapper) wrapper.classList.add('has-stage');
        } else {
            suggestionStage.textContent = '';
            suggestionStage.classList.remove('visible');
            if (wrapper) wrapper.classList.remove('has-stage');
        }
    }
    
    // Render de lista de entradas (WIN/LOSS)
    function renderEntriesPanel(entries) {
        const list = document.getElementById('entriesList');
        const hitEl = document.getElementById('entriesHit');
        
        if (!list || !hitEl) {
            return;
        }
        
        // ═══════════════════════════════════════════════════════════════
        // ✅ NOVO: DETECTAR MODO DE ANÁLISE ATIVO
        // ═══════════════════════════════════════════════════════════════
        const aiModeToggle = document.querySelector('.ai-mode-toggle.active');
        const isDiamondMode = !!aiModeToggle;
        const currentMode = isDiamondMode ? 'diamond' : 'standard';
        
        console.log(`🔍 Modo de análise ativo: ${currentMode.toUpperCase()}`);
        
        // ═══════════════════════════════════════════════════════════════
        // ✅ FILTRAR ENTRADAS POR MODO DE ANÁLISE
        // ═══════════════════════════════════════════════════════════════
        // Mostrar apenas entradas do modo ativo
        // ✅ Entradas antigas sem analysisMode → tratar como MODO PADRÃO
        const entriesByMode = entries.filter(e => {
            // ✅ Entradas antigas sem analysisMode → tratar como MODO PADRÃO
            const entryMode = e.analysisMode || 'standard';
            
            // Mostrar apenas se for do modo ativo
            return entryMode === currentMode;
        });
        
        console.log(`   Total de entradas: ${entries.length}`);
        console.log(`   Entradas do modo ${currentMode}: ${entriesByMode.length}`);
        
        // ═══════════════════════════════════════════════════════════════
        // ✅ FILTRAR ENTRADAS - MOSTRAR APENAS RESULTADOS FINAIS
        // ═══════════════════════════════════════════════════════════════
        // REGRA DE EXIBIÇÃO:
        // - WIN (qualquer estágio) → SEMPRE MOSTRAR
        // - LOSS intermediário (continuando para próximo Gale) → NUNCA MOSTRAR
        // - LOSS final (RET ou fim de ciclo) → SEMPRE MOSTRAR
        
        const filteredEntries = entriesByMode.filter(e => {
            // ✅ Sempre mostrar WINs (qualquer estágio)
            if (e.result === 'WIN') return true;
            
            // ✅ Para LOSSes, verificar se é FINAL ou INTERMEDIÁRIO
            if (e.result === 'LOSS') {
                // Se tem finalResult === 'RET', é LOSS FINAL → MOSTRAR
                if (e.finalResult === 'RET') return true;
                
                // Verificar se está continuando para próximo Gale
                let isContinuing = false;
                for (let key in e) {
                    if (key.startsWith('continuingToG')) {
                        isContinuing = true;
                        break;
                    }
                }
                
                // Se está continuando → ESCONDER (LOSS intermediário)
                if (isContinuing) return false;
                
                // Se não está continuando e não é RET → MOSTRAR (LOSS final sem Gales configurados)
                return true;
            }
            
            // Fallback: mostrar por padrão
            return true;
        });
        
        console.log(`📊 Entradas: ${entries.length} total | ${entriesByMode.length} do modo ${currentMode} | ${filteredEntries.length} exibidas (${entriesByMode.length - filteredEntries.length} LOSSes intermediários ocultos)`);
        
        // Renderizar apenas as entradas filtradas
        const items = filteredEntries.map((e, idx) => {
            // ✅ CORREÇÃO: Usar índice da lista filtrada para manter referência correta
            const entryIndex = idx;
            const time = new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const cls = e.color;
            const badge = e.color === 'white' ? blazeWhiteSVG(16) : `<span>${e.number}</span>`;
            const isWin = e.result === 'WIN';
            
            // ═══════════════════════════════════════════════════════════════
            // ✅ SISTEMA DE MARTINGALE - INDICADORES VISUAIS
            // ═══════════════════════════════════════════════════════════════
            
            let barClass = isWin ? 'win' : 'loss';
            let stageText = '';
            
            if (e.martingaleStage) {
                // Novo sistema de Martingale (suporta G1 até G200)
                if (isWin) {
                    // WIN - mostrar onde ganhou
                    if (e.martingaleStage === 'ENTRADA' || e.wonAt === 'ENTRADA') {
                        stageText = 'WIN';
                    } else if (e.martingaleStage && e.martingaleStage.startsWith('G')) {
                        // G1, G2, G3... G200 (com G em branco)
                        const galeNum = e.martingaleStage.substring(1);
                        stageText = `WIN <span style="color: white;">G${galeNum}</span>`;
                    }
                } else {
                    // LOSS - mostrar tipo
                    if (e.finalResult === 'RET') {
                        // LOSS FINAL (RET) - mostrar em qual Gale perdeu
                        const stage = e.martingaleStage || e.phase;
                        if (stage === 'ENTRADA' || stage === 'G0') {
                            stageText = 'LOSS'; // Perdeu na entrada sem Gales
                        } else if (stage && stage.startsWith('G')) {
                            const galeNum = stage.substring(1);
                            stageText = `LOSS <span style="color: white;">G${galeNum}</span>`; // G em branco
                        } else {
                            stageText = 'LOSS';
                        }
                    } else {
                        // Verificar se está continuando para próximo Gale
                        let isContinuing = false;
                        let nextGale = '';
                        
                        // Buscar qualquer flag de continuação (continuingToG1, continuingToG2, continuingToG3...)
                        for (let key in e) {
                            if (key.startsWith('continuingToG')) {
                                isContinuing = true;
                                nextGale = key.substring('continuingTo'.length); // Extrai "G1", "G2", etc
                                break;
                            }
                        }
                        
                        if (isContinuing) {
                            // Deixar G em branco também na seta
                            stageText = `LOSS ➜<span style="color: white;">${nextGale}</span>`;
                        } else {
                            stageText = 'LOSS';
                        }
                    }
                }
            } else {
                // Sistema antigo (compatibilidade)
                const phaseDigit = e.phase === 'G1' ? '1' : (e.phase === 'G2' ? '2' : '');
                if (phaseDigit) {
                    stageText = isWin ? `WIN <span style="color: white;">G${phaseDigit}</span>` : `LOSS <span style="color: white;">G${phaseDigit}</span>`;
                } else {
                    stageText = isWin ? 'WIN' : 'LOSS';
                }
            }
            
            const title = `Giro: ${e.number} • Cor: ${e.color} • ${time} • Resultado: ${e.result}${e.martingaleStage ? ' • Estágio: '+e.martingaleStage : ''}${e.confidence? ' • Confiança: '+e.confidence.toFixed(1)+'%' : ''}`;
            
            // CORREÇÃO: Sempre usar a confidence original que foi exibida no sinal
            const confTop = (typeof e.confidence === 'number') ? `${e.confidence.toFixed(0)}%` : '';
            
            // Barrinha visual (sem texto)
            const resultBar = `<div class="entry-result-bar ${barClass}"></div>`;
            
            // Estágio do Martingale (abaixo da %)
            const stageLabel = stageText ? `<div class="entry-stage ${barClass}">${stageText}</div>` : '';
            
            return `<div class="entry-item-wrap clickable-entry" title="${title}" data-entry-index="${entryIndex}">
                ${confTop ? `<div class="entry-conf-top">${confTop}</div>` : ''}
                ${stageLabel}
                <div class="entry-item">
                    <div class="entry-box ${cls}">${badge}</div>
                    ${resultBar}
                </div>
                <div class="entry-time">${time}</div>
            </div>`;
        }).join('');
        
        // ═══════════════════════════════════════════════════════════════
        // ✅ INDICADOR DE GALE ATIVO (BOLINHA PISCANDO NO TOPO)
        // ═══════════════════════════════════════════════════════════════
        storageCompat.get(['martingaleState', 'analysis']).then((result = {}) => {
            const martingaleState = result.martingaleState;
            const analysis = result.analysis;
            
            let galeActiveIndicator = '';
            
            // Verificar se há Martingale ativo
            if (martingaleState && martingaleState.active) {
                // ✅ CORREÇÃO: Criar um item de entrada fake para a bolinha pulsante
                // Isso fará ela ocupar o lugar padrão do último sinal
                // Determinar o número do Gale baseado no lossCount
                const lossCount = martingaleState.lossCount || 0;
                const galeNumber = lossCount;
                
                galeActiveIndicator = `
                    <div class="entry-item-wrap gale-active-indicator">
                        <div class="entry-item">
                            <div class="gale-pulse-circle">${galeNumber}</div>
                        </div>
                    </div>
                `;
            }
            
            // Inserir indicador no TOPO + itens
            list.innerHTML = galeActiveIndicator + (items || '<div class="no-history">Sem entradas registradas</div>');
            
            // ✅ CORREÇÃO: Adicionar evento de clique para mostrar padrão usando o array filtrado correto
            const clickableEntries = list.querySelectorAll('.clickable-entry');
            clickableEntries.forEach((entryEl) => {
                entryEl.addEventListener('click', function() {
                    const entryIndex = parseInt(this.getAttribute('data-entry-index'), 10);
                    // ✅ USAR O ARRAY FILTRADO (filteredEntries) EM VEZ DO ARRAY COMPLETO (entries)
                    const entry = filteredEntries[entryIndex];
                    if (entry) {
                        showPatternForEntry(entry);
                    }
                });
            });
        }).catch(error => {
            console.warn('⚠️ Não foi possível ler martingaleState/analysis:', error);
            list.innerHTML = items || '<div class="no-history">Sem entradas registradas</div>';
        });
        
        // ═══════════════════════════════════════════════════════════════
        // ✅ CALCULAR ESTATÍSTICAS DOS CICLOS COMPLETOS E TOTAL DE ENTRADAS
        // ═══════════════════════════════════════════════════════════════
        const totalCycles = filteredEntries.length;
        const wins = filteredEntries.filter(e => e.result === 'WIN').length;
        const losses = totalCycles - wins;
        const pct = totalCycles ? ((wins/totalCycles)*100).toFixed(1) : '0.0';
        // ✅ Contar apenas entradas do modo ativo, não de todos os modos
        const totalEntries = entriesByMode.length;
        
        // Mostrar placar WIN/LOSS com porcentagem e total de entradas
        const clearButtonHTML = `<button type="button" class="clear-entries-btn" id="clearEntriesBtn" title="Limpar histórico">Limpar</button>`;
        hitEl.innerHTML = `<span class="win-score">WIN: ${wins}</span> <span class="loss-score">LOSS: ${losses}</span> <span class="percentage">(${pct}%)</span> <span class="total-entries">• Entradas: ${totalEntries} ${clearButtonHTML}</span>`;
        const inlineClearBtn = document.getElementById('clearEntriesBtn');
        if (inlineClearBtn) {
            inlineClearBtn.addEventListener('click', function(event) {
                event.preventDefault();
                event.stopPropagation();
                clearEntriesHistory();
            });
        }
    }

    function initEntriesTabs() {
        const tabsContainer = document.getElementById('entriesTabs');
        if (!tabsContainer) {
            return;
        }
        entriesTabsReady = true;
        if (!entriesTabsBound) {
            tabsContainer.addEventListener('click', (event) => {
                const button = event.target.closest('.entries-tab');
                if (!button) return;
                if (button.getAttribute('aria-disabled') === 'true') return;
                const tab = button.dataset.tab;
                if (!tab) return;
                setEntriesTab(tab);
            });
            entriesTabsBound = true;
        }
        applyAutoBetAvailabilityToUI();
    }

    function setEntriesTab(tab) {
        if (tab !== 'entries' && tab !== 'bets') {
            tab = 'entries';
        }
        activeEntriesTab = tab;
        const entriesView = document.querySelector('.entries-view[data-view="entries"]');
        const betsView = document.querySelector('.entries-view[data-view="bets"]');
        if (entriesView) {
            entriesView.hidden = tab !== 'entries';
        }
        if (betsView) {
            betsView.hidden = tab !== 'bets';
        }
        const hitEl = document.getElementById('entriesHit');
        if (hitEl) {
            hitEl.style.display = tab === 'entries' ? 'inline-flex' : 'none';
        }
        const entriesHeader = document.querySelector('.entries-header');
        if (entriesHeader) {
            entriesHeader.style.display = tab === 'entries' ? 'flex' : 'none';
        }
        document.querySelectorAll('.entries-tab').forEach((button) => {
            button.classList.toggle('active', button.dataset.tab === tab);
        });
    }

    function setupAutoBetHistoryUI() {
        autoBetHistoryStore.init()
            .then(() => {
                if (autoBetHistoryUnsubscribe) {
                    autoBetHistoryUnsubscribe();
                    autoBetHistoryUnsubscribe = null;
                }
                renderAutoBetHistoryPanel(autoBetHistoryStore.getAll());
                autoBetHistoryUnsubscribe = autoBetHistoryStore.subscribe(renderAutoBetHistoryPanel);
            })
            .catch(error => console.warn('AutoBetHistory: falha ao inicializar UI:', error));
    }

    function renderAutoBetHistoryPanel(history) {
        const container = document.getElementById('betsContainer');
        if (!container) return;
        const shouldShow = cachedAutoBetAvailability.hasReal || cachedAutoBetAvailability.hasSimulation;
        if (!shouldShow) {
            container.innerHTML = `<div class="bets-empty">Disponível apenas quando Aposta real ou Simulação estiverem ativos.</div>`;
            return;
        }
        const data = Array.isArray(history) ? history : autoBetHistoryStore.getAll();
        if (!data.length) {
            container.innerHTML = `<div class="bets-empty">Nenhuma aposta registrada ainda.</div>`;
            return;
        }
        const rows = data.map(renderBetHistoryRow).join('');
        container.innerHTML = `
            <div class="bets-table-wrapper">
                <table class="bets-table">
                    <thead>
                        <tr>
                            <th>Horário</th>
                            <th>Sequência</th>
                            <th>Preço</th>
                            <th>Entrada</th>
                            <th>Resultado</th>
                            <th>Lucro</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    function renderBetHistoryRow(record) {
        const timeSource = record?.createdAt || record?.updatedAt || Date.now();
        const time = formatBetTime(timeSource);
        const sequence = formatBetSequence(record?.stages);
        const price = record?.lastAmount != null ? formatCurrencyBRL(record.lastAmount) : '—';
        const entryPill = renderBetColorPill(record?.entryColor);
        const resultPill = renderBetResult(record);
        const profit = formatBetProfit(record);
        const statusClass = record?.status ? `bet-status-${record.status}` : 'bet-status-pending';
        return `<tr class="${statusClass}">
            <td>${time}</td>
            <td>${sequence}</td>
            <td>${price}</td>
            <td>${entryPill}</td>
            <td>${resultPill}</td>
            <td>${profit}</td>
        </tr>`;
    }

    function formatBetTime(timestamp) {
        try {
            return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (_) {
            return '--:--';
        }
    }

    function formatBetSequence(stages) {
        if (!Array.isArray(stages) || !stages.length) {
            return '—';
        }
        return stages.map((stage, index) => stage?.stageLabel || formatCycleStageLabel(stage?.rawStage, index)).join(' ');
    }

    function renderBetColorPill(color) {
        const normalized = normalizeBetColor(color);
        const labelMap = {
            red: 'Vermelho',
            black: 'Preto',
            white: 'Branco',
            neutral: '—'
        };
        return `<span class="bet-color-pill ${normalized}" title="${labelMap[normalized] || '—'}" aria-label="${labelMap[normalized] || '—'}"></span>`;
    }

    function normalizeBetColor(color) {
        const lowered = String(color || '').toLowerCase();
        if (lowered.startsWith('r')) return 'red';
        if (lowered.startsWith('b') && lowered !== 'branco') return 'black';
        if (lowered === 'branco' || lowered.startsWith('w')) return 'white';
        return 'neutral';
    }

    function renderBetResult(record) {
        if (!record || record.status === 'pending') {
            return `<span class="bet-result-pill pending"><span class="pending-indicator"></span></span>`;
        }
        if (record.status === 'cancelled') {
            return `<span class="bet-result-pill neutral">—</span>`;
        }
        if (record.resultColor) {
            const colorClass = normalizeBetColor(record.resultColor);
            const numberLabel = record.resultNumber !== undefined && record.resultNumber !== null
                ? record.resultNumber
                : '—';
            return `<span class="bet-result-pill ${colorClass}">${numberLabel}</span>`;
        }
        return `<span class="bet-result-pill neutral">—</span>`;
    }

    function formatBetProfit(record) {
        if (!record || record.status === 'pending') {
            return `<span class="bet-profit neutral">—</span>`;
        }
        const profitValue = Number(record.profit || 0);
        const isPositive = profitValue > 0;
        const isNegative = profitValue < 0;
        const cssClass = isPositive ? 'positive' : isNegative ? 'negative' : 'neutral';
        if (!isPositive && !isNegative) {
            return `<span class="bet-profit ${cssClass}">${formatCurrencyBRL(0)}</span>`;
        }
        const formatted = `${isPositive ? '+' : '-'}${formatCurrencyBRL(Math.abs(profitValue))}`;
        return `<span class="bet-profit ${cssClass}">${formatted}</span>`;
    }

    function applyAutoBetAvailabilityToUI() {
        const betsTab = document.querySelector('.entries-tab[data-tab="bets"]');
        const shouldShow = cachedAutoBetAvailability.hasReal || cachedAutoBetAvailability.hasSimulation;
        if (betsTab) {
            betsTab.style.display = shouldShow ? 'inline-flex' : 'none';
            betsTab.setAttribute('aria-disabled', shouldShow ? 'false' : 'true');
        }
        if (!shouldShow && activeEntriesTab === 'bets') {
            setEntriesTab('entries');
        }
        if (entriesTabsReady) {
            renderAutoBetHistoryPanel();
        }
    }
    
    // Clear entries history function
    function clearEntriesHistory() {
        // ✅ NOVO: Limpar APENAS entradas do modo ativo
        chrome.storage.local.get(['entriesHistory'], function(result) {
            const allEntries = result.entriesHistory || [];
            
            // Detectar qual modo está ativo
            const aiModeToggle = document.querySelector('.ai-mode-toggle.active');
            const isDiamondMode = !!aiModeToggle;
            const currentMode = isDiamondMode ? 'diamond' : 'standard';
            
            console.log(`🗑️ Limpando entradas do modo: ${currentMode.toUpperCase()}`);
            console.log(`   Total de entradas antes: ${allEntries.length}`);
            
            // ✅ FILTRAR: Remover entradas do modo atual, manter de outros modos
            const filteredEntries = allEntries.filter(e => {
                // ✅ Entradas antigas sem analysisMode → tratar como MODO PADRÃO
                const entryMode = e.analysisMode || 'standard';
                
                // Manter apenas se for de OUTRO modo
                const shouldKeep = entryMode !== currentMode;
                
                console.log(`      Entrada: ${e.result} ${e.color || ''} | Modo: ${entryMode} | ${shouldKeep ? 'MANTER ✅' : 'REMOVER ❌'}`);
                
                return shouldKeep;
            });
            
            console.log(`   Total de entradas depois: ${filteredEntries.length}`);
            console.log(`   Entradas removidas: ${allEntries.length - filteredEntries.length}`);
            
            chrome.storage.local.set({ entriesHistory: filteredEntries }, function() {
                console.log(`✅ Histórico de entradas do modo ${currentMode} limpo`);
                renderEntriesPanel(filteredEntries);
                
                // ✅ Notificar background.js para limpar o calibrador também
                chrome.runtime.sendMessage({ 
                    action: 'clearEntriesAndObserver' 
                }, function(response) {
                    if (response && response.status === 'success') {
                        console.log('✅ Calibrador sincronizado após limpar entradas');
                        // Atualizar UI do calibrador
                        loadObserverStats();
                    }
                });

                // ✅ Novo: limpar também o histórico da aba de apostas
                if (autoBetHistoryStore && typeof autoBetHistoryStore.clear === 'function') {
                    autoBetHistoryStore.clear();
                    renderAutoBetHistoryPanel([]);
                }
            });
        });
    }
    
    // Setup clear history menu functionality
    function setupClearHistoryMenu() {
        const clearBtn = document.getElementById('clearHistoryBtn');
        const clearDropdown = document.getElementById('clearDropdown');
        
        if (clearBtn && clearDropdown) {
            // Toggle dropdown
            clearBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                clearDropdown.style.display = clearDropdown.style.display === 'block' ? 'none' : 'block';
            });
            
            // Opções do dropdown
            const clearOptions = clearDropdown.querySelectorAll('.clear-option');
            clearOptions.forEach(option => {
                option.addEventListener('click', function() {
                    const amount = this.getAttribute('data-amount');
                    const amountText = amount === 'all' ? 'todo o histórico' : `últimos ${amount} giros`;
                    
                    showCustomConfirm(`Limpar ${amountText} e recarregar?`, this).then(confirmed => {
                        if (confirmed) {
                        clearHistorySelective(amount);
                    }
                    clearDropdown.style.display = 'none';
                    });
                });
            });
            
            // Fechar dropdown ao clicar fora
            document.addEventListener('click', function() {
                clearDropdown.style.display = 'none';
            });
        }
    }
    
    // Clear history selective function
    function clearHistorySelective(amount) {
        if (amount === 'all') {
            // Limpar tudo (exceto histórico que agora é em cache no background)
            chrome.storage.local.set({
                lastSpin: null,
                analysis: null,
                pattern: null
            }, function() {
                console.log('Histórico limpo (cache será renovado do servidor)');
                lastHistorySignature = '';
                loadInitialData();
            });
        } else {
            // Histórico agora é gerenciado em cache no background (não no storage)
            console.log('❌ Limpeza parcial não disponível com cache em memória');
            console.log('💡 Use o botão "Resetar Padrões" para limpar padrões locais');
        }
    }
    
    // Load saved sidebar state
    function loadSidebarState(sidebar) {
        try {
            // ✅ SEMPRE CENTRALIZAR NO MEIO DA TELA (ignorar posição salva)
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            
            // Usar largura e altura salvas ou padrão
            let width = 300;
            let height = 600;
            
            const saved = localStorage.getItem('blazeSidebarState');
            if (saved) {
                const state = JSON.parse(saved);
                width = state.width || 300;
                height = state.height || 600;
            }
            
            // Calcular posição centralizada
            const left = (windowWidth - width) / 2;
            const top = (windowHeight - height) / 2;
            
            // Aplicar posição centralizada
            sidebar.style.left = Math.max(0, left) + 'px';
            sidebar.style.top = Math.max(0, top) + 'px';
            sidebar.style.width = width + 'px';
            sidebar.style.height = height + 'px';
            
            console.log('📍 Sidebar centralizada:', { left, top, width, height });
        } catch (e) {
            console.error('Erro ao carregar estado da sidebar:', e);
        }
    }
    
    // Save sidebar state
    function saveSidebarState(sidebar) {
        try {
            const state = {
                left: parseInt(sidebar.style.left) || 0,
                top: parseInt(sidebar.style.top) || 0,
                width: parseInt(sidebar.style.width) || 300,
                height: parseInt(sidebar.style.height) || 600
            };
            localStorage.setItem('blazeSidebarState', JSON.stringify(state));
        } catch (e) {
            console.error('Erro ao salvar estado da sidebar:', e);
        }
    }
    
    // Make sidebar draggable
    function makeDraggable(element) {
        const header = document.getElementById('sidebarHeader');
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        
        // ✅ INICIALIZAR COM A POSIÇÃO ATUAL DA SIDEBAR
        let xOffset = parseInt(element.style.left) || 0;
        let yOffset = parseInt(element.style.top) || 0;
        
        header.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);
        
        function dragStart(e) {
            // ✅ PEGAR A POSIÇÃO ATUAL NO MOMENTO DO CLIQUE
            xOffset = parseInt(element.style.left) || 0;
            yOffset = parseInt(element.style.top) || 0;
            
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            
            if (e.target === header || header.contains(e.target)) {
                isDragging = true;
                header.style.cursor = 'grabbing';
            }
        }
        
        function drag(e) {
            if (isDragging) {
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
                
                xOffset = currentX;
                yOffset = currentY;
                
                element.style.left = currentX + 'px';
                element.style.top = currentY + 'px';
            }
        }
        
        function dragEnd(e) {
            initialX = currentX;
            initialY = currentY;
            isDragging = false;
            header.style.cursor = 'grab';
            saveSidebarState(element);
        }
    }
    // Make sidebar resizable
    function makeResizable(element) {
        const handles = element.querySelectorAll('.resize-handle');
        
        handles.forEach(handle => {
            handle.addEventListener('mousedown', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                const startX = e.clientX;
                const startY = e.clientY;
                const startWidth = parseInt(document.defaultView.getComputedStyle(element).width, 10);
                const startHeight = parseInt(document.defaultView.getComputedStyle(element).height, 10);
                const startLeft = parseInt(document.defaultView.getComputedStyle(element).left, 10);
                const startTop = parseInt(document.defaultView.getComputedStyle(element).top, 10);
                
                function doResize(e) {
                    const deltaX = e.clientX - startX;
                    const deltaY = e.clientY - startY;
                    
                    if (handle.classList.contains('resize-e')) {
                        element.style.width = (startWidth + deltaX) + 'px';
                    }
                    if (handle.classList.contains('resize-s')) {
                        element.style.height = (startHeight + deltaY) + 'px';
                    }
                    if (handle.classList.contains('resize-w')) {
                        element.style.width = (startWidth - deltaX) + 'px';
                        element.style.left = (startLeft + deltaX) + 'px';
                    }
                    if (handle.classList.contains('resize-n')) {
                        element.style.height = (startHeight - deltaY) + 'px';
                        element.style.top = (startTop + deltaY) + 'px';
                    }
                    if (handle.classList.contains('resize-se')) {
                        element.style.width = (startWidth + deltaX) + 'px';
                        element.style.height = (startHeight + deltaY) + 'px';
                    }
                    if (handle.classList.contains('resize-sw')) {
                        element.style.width = (startWidth - deltaX) + 'px';
                        element.style.height = (startHeight + deltaY) + 'px';
                        element.style.left = (startLeft + deltaX) + 'px';
                    }
                    if (handle.classList.contains('resize-ne')) {
                        element.style.width = (startWidth + deltaX) + 'px';
                        element.style.height = (startHeight - deltaY) + 'px';
                        element.style.top = (startTop + deltaY) + 'px';
                    }
                    if (handle.classList.contains('resize-nw')) {
                        element.style.width = (startWidth - deltaX) + 'px';
                        element.style.height = (startHeight - deltaY) + 'px';
                        element.style.left = (startLeft + deltaX) + 'px';
                        element.style.top = (startTop + deltaY) + 'px';
                    }
                    
                    // Update scaling based on new width
                    updateScaling(element);
                }
                
                function stopResize() {
                    document.removeEventListener('mousemove', doResize);
                    document.removeEventListener('mouseup', stopResize);
                    saveSidebarState(element);
                }
                
                document.addEventListener('mousemove', doResize);
                document.addEventListener('mouseup', stopResize);
            });
        });
    }
    
    // Update scaling based on sidebar width
    function updateScaling(element) {
        const width = parseInt(element.style.width) || 300;
        const content = element.querySelector('.analyzer-content');
        
        if (width >= 1000) {
            // Extra large - full screen
            content.style.setProperty('--icon-scale', '2');
            content.style.setProperty('--font-scale', '1.4');
            content.style.setProperty('--spacing-scale', '1.6');
        } else if (width >= 600) {
            // Large
            content.style.setProperty('--icon-scale', '1.5');
            content.style.setProperty('--font-scale', '1.2');
            content.style.setProperty('--spacing-scale', '1.3');
        } else {
            // Normal
            content.style.setProperty('--icon-scale', '1');
            content.style.setProperty('--font-scale', '1');
            content.style.setProperty('--spacing-scale', '1');
        }
    }
    
function cloneModeSnapshot(snapshot) {
    try {
        return JSON.parse(JSON.stringify(snapshot));
    } catch (error) {
        return snapshot;
    }
}

function logFullModeSnapshot(snapshot) {
    const headerColor = snapshot.aiMode ? '#4FC3F7' : '#26C6DA';
    originalConsoleLog(`%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, `color: ${headerColor}; font-weight: bold;`);
    originalConsoleLog(`%c📋 ${snapshot.modeLabel} • ${snapshot.context}`, `color: ${headerColor}; font-weight: bold;`);
    originalConsoleLog(`%c   • Modo ativo: ${snapshot.aiMode ? 'Diamante' : 'Padrão'}`, `color: ${headerColor};`);
    originalConsoleLog(`%c   • Histórico analisado: ${snapshot.historyAvailable || 0} giros`, `color: ${headerColor};`);
    originalConsoleLog(`%c   • Intensidade: ${snapshot.signalIntensity || 'moderate'}`, `color: ${headerColor};`);
    originalConsoleLog(`%c   • Martingale: ${snapshot.galeSummary} (máx ${snapshot.galeSettings?.maxGales || 0} | consecutivo ${snapshot.galeSettings?.consecutiveMartingale ? 'sim' : 'não'})`, `color: ${headerColor};`);
    originalConsoleLog(`%c   • Proteção no Branco: ${snapshot.whiteProtectionAsWin ? 'Conta como WIN' : 'Conta como LOSS'}`, `color: ${headerColor};`);

    if (snapshot.aiMode) {
        const status = snapshot.memoriaAtiva || {};
        const memText = status.inicializada
            ? `Ativa • ${status.totalAtualizacoes || 0} atualizações`
            : 'Inicializando...';
        originalConsoleLog(`%c   • Memória IA: ${memText}`, `color: ${headerColor};`);
        originalConsoleLog(`%c   • Níveis ativos: ${snapshot.enabledDiamondLevels || 0}/11`, `color: ${headerColor};`);
        (snapshot.diamondLevels || []).forEach(level => {
            const mark = level.enabled ? '✅' : '⛔';
            originalConsoleLog(`%c      ${mark} ${level.id}: ${level.detail}`, `color: ${level.enabled ? '#00E676' : '#FF7043'};`);
        });
    } else if (snapshot.standardConfig) {
        const cfg = snapshot.standardConfig;
        originalConsoleLog(`%c   • Configurações do modo padrão:`, `color: ${headerColor};`);
        originalConsoleLog(`%c      - Profundidade: ${cfg.historyDepth || 500} giros`, `color: ${headerColor};`);
        originalConsoleLog(`%c      - Ocorrências mínimas: ${cfg.minOccurrences || 2}`, `color: ${headerColor};`);
        originalConsoleLog(`%c      - Intervalo mínimo: ${cfg.minIntervalSpins || 0} giros`, `color: ${headerColor};`);
        originalConsoleLog(`%c      - Tamanho do padrão: ${cfg.minPatternSize || 3} a ${cfg.maxPatternSize || '∞'}`, `color: ${headerColor};`);
        originalConsoleLog(`%c      - WIN% restante mínima: ${cfg.winPercentOthers || 100}%`, `color: ${headerColor};`);
    }

    originalConsoleLog(`%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, `color: ${headerColor}; font-weight: bold;`);
}

function logModeSnapshotUpdates(snapshot) {
    const headerColor = '#1976D2';
    originalConsoleLog(`%c╔══════════════════════════════════════════════════╗`, `color:${headerColor}; font-weight:bold;`);
    originalConsoleLog(`%c║  Atualização do modo ${snapshot.aiMode ? 'Diamante' : 'Padrão'}                   ║`, `color:${headerColor}; font-weight:bold;`);
}

function logModeSnapshotUI(snapshot) {
    if (!snapshot) return;
        const snapshotWhite =
            snapshot.whiteProtectionAsWin ??
            snapshot.standardConfig?.whiteProtectionAsWin ??
            snapshot.diamondSettings?.whiteProtectionAsWin ??
            false;
        analyzerConfigSnapshot = { whiteProtectionAsWin: !!snapshotWhite };
    try {
        const prev = lastModeSnapshot;
        if (!prev || prev.modeLabel !== snapshot.modeLabel || prev.aiMode !== snapshot.aiMode) {
            logFullModeSnapshot(snapshot);
            lastModeSnapshot = cloneModeSnapshot(snapshot);
            return;
        }

        const generalChanges = [];
        const pushChange = (label, prevValue, currentValue, formatter = (v) => v) => {
            if (prevValue === currentValue) return;
            generalChanges.push({
                label,
                prev: formatter(prevValue),
                curr: formatter(currentValue)
            });
        };

        pushChange('Histórico analisado', prev.historyAvailable, snapshot.historyAvailable, v => `${v || 0} giros`);
        pushChange('Intensidade', prev.signalIntensity, snapshot.signalIntensity);
        pushChange('Martingale', prev.galeSummary, snapshot.galeSummary);
        pushChange('Proteção no Branco', prev.whiteProtectionAsWin, snapshot.whiteProtectionAsWin, v => v ? 'Conta como WIN' : 'Conta como LOSS');

        if (snapshot.aiMode) {
            const prevMem = prev.memoriaAtiva || {};
            const currMem = snapshot.memoriaAtiva || {};
            const prevText = prevMem.inicializada ? `Ativa • ${prevMem.totalAtualizacoes || 0} updates` : 'Inicializando...';
            const currText = currMem.inicializada ? `Ativa • ${currMem.totalAtualizacoes || 0} updates` : 'Inicializando...';
            pushChange('Memória IA', prevText, currText);
            pushChange('Níveis ativos', prev.enabledDiamondLevels, snapshot.enabledDiamondLevels, v => `${v || 0}/11`);
        } else if (snapshot.standardConfig && prev.standardConfig) {
            const cfgPrev = prev.standardConfig;
            const cfgCurr = snapshot.standardConfig;
            ['historyDepth', 'minOccurrences', 'minIntervalSpins', 'minPatternSize', 'maxPatternSize', 'winPercentOthers'].forEach(key => {
                pushChange(key, cfgPrev[key], cfgCurr[key]);
            });
        }

        const levelChanges = [];
        if (snapshot.aiMode && prev.aiMode) {
            const prevMap = new Map();
            (prev.diamondLevels || []).forEach(level => prevMap.set(level.id, level));
            (snapshot.diamondLevels || []).forEach(level => {
                const previousLevel = prevMap.get(level.id);
                if (!previousLevel) {
                    levelChanges.push({ type: 'new', level });
                    return;
                }
                if (previousLevel.enabled !== level.enabled) {
                    levelChanges.push({ type: level.enabled ? 'enabled' : 'disabled', level });
                } else if (previousLevel.detail !== level.detail) {
                    levelChanges.push({ type: 'detail', level });
                }
            });
        }

        if (generalChanges.length === 0 && levelChanges.length === 0) {
            lastModeSnapshot = cloneModeSnapshot(snapshot);
            return;
        }

        const headerColor = '#1976D2';
        originalConsoleLog(`%c╔══════════════════════════════════════════════════╗`, `color:${headerColor}; font-weight:bold;`);
        originalConsoleLog(`%c║  Atualização do modo ${snapshot.aiMode ? 'Diamante' : 'Padrão'}                   ║`, `color:${headerColor}; font-weight:bold;`);

        generalChanges.forEach(change => {
            const changeColor = '#80CBC4';
            originalConsoleLog(`%c║  ${change.label}: %c${change.prev} %c→ %c${change.curr}`, `color:${headerColor}; font-weight:bold;`, `color:#FF8A65; font-weight:bold;`, `color:${headerColor}; font-weight:bold;`, `color:${changeColor}; font-weight:bold;`);
        });

        if (levelChanges.length) {
            originalConsoleLog(`%c║  Níveis ajustados:`, `color:${headerColor}; font-weight:bold;`);
            levelChanges.forEach(change => {
                const level = change.level;
                if (change.type === 'enabled') {
                    originalConsoleLog(`%c║   • ${level.id} ativado: ${level.detail}`, 'color:#00E676; font-weight:bold;');
                } else if (change.type === 'disabled') {
                    originalConsoleLog(`%c║   • ${level.id} desativado`, 'color:#FF5252; font-weight:bold;');
                } else {
                    originalConsoleLog(`%c║   • ${level.id} atualizado: ${level.detail}`, 'color:#29B6F6; font-weight:bold;');
                }
            });
        }

        originalConsoleLog(`%c╚══════════════════════════════════════════════════╝`, `color:${headerColor}; font-weight:bold;`);
        lastModeSnapshot = cloneModeSnapshot(snapshot);
    } catch (error) {
        originalConsoleLog('%c❌ Falha ao processar MODE_SNAPSHOT na UI:', 'color: #FF5252;', error, snapshot);
    }
}

    function requestModeSnapshot(reason = 'content_init') {
        if (!chrome?.runtime?.sendMessage) return;
        try {
            chrome.runtime.sendMessage({ action: 'REQUEST_MODE_SNAPSHOT', reason })
                .catch(err => console.warn('⚠️ Falha ao solicitar MODE_SNAPSHOT:', err));
        } catch (error) {
            console.warn('⚠️ Erro ao solicitar MODE_SNAPSHOT:', error);
        }
    }
    
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'NEW_ANALYSIS') {
            const messageMode = request.data && request.data.analysisMode ? request.data.analysisMode : null;
            const tabMode = getTabSpecificAIMode(false) ? 'diamond' : 'standard';

            if (messageMode && messageMode !== tabMode) {
                console.log(`%c⚠️ [NEW_ANALYSIS] Ignorado (modo ${messageMode} ≠ aba ${tabMode})`, 'color: #FFA500; font-weight: bold;');
                sendResponse && sendResponse({ accepted: false, reason: 'mode_mismatch' });
                return;
            }

            console.log('%c🔍 [NEW_ANALYSIS] Recebido!', 'color: #00FFFF; font-weight: bold;');
            console.log('%c   📦 request.data:', 'color: #00FFFF;', request.data);
            console.log('%c   🎲 last5Spins existe?', 'color: #00FFFF;', request.data.last5Spins ? '✅ SIM' : '❌ NÃO');
            if (request.data.last5Spins) {
                console.log('%c   🎲 last5Spins.length:', 'color: #00FFFF;', request.data.last5Spins.length);
                console.log('%c   🎲 Dados:', 'color: #00FFFF;', request.data.last5Spins);
            }
            
            updateSidebar({
                analysis: request.data,
                pattern: {
                    description: request.data.patternDescription,
                    last5Spins: request.data.last5Spins // ✅ PASSAR DIRETAMENTE
                }
            });
            if (autoBetManager && typeof autoBetManager.handleAnalysis === 'function') {
                autoBetManager.handleAnalysis(request.data);
            }
        } else if (request.type === 'NEW_SPIN') {
            console.log('%c⚡ NOVO GIRO!', 'color: #00ff88; font-weight: bold;');
            
            // ⚡⚡⚡ ATUALIZAÇÃO INSTANTÂNEA - OPERAÇÕES SÍNCRONAS APENAS! ⚡⚡⚡
            if (request.data && request.data.lastSpin) {
                const newSpin = request.data.lastSpin;
                logTrainingLastSpin(newSpin);
                
                // ✅ 1. ATUALIZAR ÚLTIMO GIRO (síncrono, super rápido!)
                const lastSpinNumber = document.getElementById('lastSpinNumber');
                const lastSpinTime = document.getElementById('lastSpinTime');
                
                if (lastSpinNumber) {
                    lastSpinNumber.className = `spin-number ${newSpin.color}`;
                    if (newSpin.color === 'white') {
                        lastSpinNumber.innerHTML = blazeWhiteSVG(20);
                    } else {
                        lastSpinNumber.textContent = newSpin.number;
                    }
                }
                
                if (lastSpinTime) {
                    try {
                        const t = new Date(newSpin.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                        lastSpinTime.textContent = t;
                    } catch(e) {}
                }
                
                // ✅ 2. ATUALIZAR HISTÓRICO (síncrono, usando requestAnimationFrame para performance)
                requestAnimationFrame(() => {
                    updateHistoryUIInstant(newSpin);
                });
                
                // ✅ SE O HISTÓRICO COMPLETO FOI ENVIADO, USAR ELE (sincronização inicial)
                if (request.data.history && request.data.history.length > 0) {
                    // Atualizar histórico global
                    currentHistoryData = request.data.history;
                    
                    // Re-renderizar usando requestAnimationFrame
                    requestAnimationFrame(() => {
                    let historyContainer = document.getElementById('spin-history-bar-ext');
                    if (historyContainer) {
                        historyContainer.innerHTML = renderSpinHistory(currentHistoryData);
                    } else {
                        // Criar container se não existir
                        const statsSection = document.querySelector('.stats-section');
                        if (statsSection) {
                            const wrap = document.createElement('div');
                            wrap.id = 'spin-history-bar-ext';
                            wrap.innerHTML = renderSpinHistory(currentHistoryData);
                            statsSection.appendChild(wrap);
                        }
                    }
                    });
                }
            } else {
                console.error('❌ ERRO: Dados do giro inválidos!', request.data);
            }
        } else if (request.type === 'CLEAR_ANALYSIS') {
            // ✅ LIMPAR STATUS DE ANÁLISE E FORÇAR RESET COMPLETO DA UI
            currentAnalysisStatus = 'Aguardando análise...';
            updateSidebar({ analysis: null, pattern: null });
        } else if (request.type === 'PATTERN_BANK_UPDATE') {
            // Atualizar banco de padrões quando novos forem descobertos
            console.log('📂 Banco de padrões atualizado');
            loadPatternBank();
        } else if (request.type === 'ENTRIES_UPDATE') {
            // Atualizar histórico de entradas (WIN/LOSS)
            updateSidebar({ entriesHistory: request.data });
            
            if (autoBetManager && typeof autoBetManager.handleEntriesUpdate === 'function') {
                autoBetManager.handleEntriesUpdate(request.data);
            }
        } else if (request.type === 'OBSERVER_UPDATE') {
            // Atualizar Calibrador de porcentagens automaticamente
            console.log('╔═══════════════════════════════════════════════════════════╗');
            console.log('║  📊 OBSERVER_UPDATE RECEBIDO!                            ║');
            console.log('╚═══════════════════════════════════════════════════════════╝');
            console.log('📊 Dados recebidos:', request.data);
            updateObserverUI(request.data);
            console.log('✅ updateObserverUI executado!');
        } else if (request.type === 'HOT_PATTERN_FOUND') {
            // Padrão quente encontrado!
            console.log('🔥 Padrão Quente ENCONTRADO!', request.data);
            
            // Cancelar timeout
            if (window.hotPatternTimeout) {
                clearTimeout(window.hotPatternTimeout);
                window.hotPatternTimeout = null;
            }
            
            showHotPatternStatus('found', request.data);
        } else if (request.type === 'HOT_PATTERN_NOT_FOUND') {
            // Nenhum padrão quente encontrado
            console.log('⚠️ Nenhum padrão quente encontrado');
            
            // Cancelar timeout
            if (window.hotPatternTimeout) {
                clearTimeout(window.hotPatternTimeout);
                window.hotPatternTimeout = null;
            }
            
            showHotPatternStatus('not_found');
        } else if (request.type === 'HOT_PATTERN_SEARCHING') {
            // Padrão foi abandonado, buscando novo
            console.log('🔍 Padrão abandonado - buscando novo automaticamente...');
            showHotPatternStatus('searching');
        } else if (request.type === 'WEBSOCKET_STATUS') {
            // ✅ GERENCIAR STATUS DO WEBSOCKET
            isWebSocketConnected = request.data.connected;
            
            logTrainingConnectionStatus(!!request.data.connected);
            
            if (request.data.connected) {
                stopHistoryPolling();
            } else {
                startHistoryPolling();
            }
        } else if (request.type === 'ANALYSIS_STATUS') {
            // Alinhar leitura com emissor (dados vêm em request.data.status)
            const status = request.data && request.data.status ? request.data.status : request.status;
            updateAnalysisStatus(status);
        } else if (request.type === 'INITIAL_SEARCH_START') {
            // ✅ BUSCA DE PADRÕES (MODO PADRÃO) - EXIBIR APENAS NO BANCO DE PADRÕES
            console.log('🔍 Busca inicial de padrões iniciada (30s)');
            showBankProgressMessage('🔍 Buscando padrões... 30s restantes • 0/5000', { variant: 'info' });
        } else if (request.type === 'INITIAL_SEARCH_PROGRESS') {
            // ✅ ATUALIZAR CRONÔMETRO DECRESCENTE NO BANCO DE PADRÕES
            const total = request.data.total || 0;
            const remaining = request.data.remaining || 0;
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            console.log(`🔍 Busca inicial: ${total}/5000 padrões | ${minutes}m ${seconds}s restantes`);
            
            showBankProgressMessage(`🔍 Buscando... ${minutes}m ${seconds}s • ${total}/5000`, { variant: 'info' });
            loadPatternBank(); // Atualizar UI do banco
        } else if (request.type === 'INITIAL_SEARCH_COMPLETE') {
            // ✅ BUSCA CONCLUÍDA
            const total = request.data.total || 0;
            console.log(`✅ Busca inicial concluída: ${total} padrões únicos encontrados!`);
            
            showBankProgressMessage(`✅ Busca concluída! ${total} padrão(ões) encontrados.`, {
                variant: 'success',
                autoHide: 5000
            });
            loadPatternBank(); // Atualizar UI do banco
            
            // Reabilitar botão de busca
            const btn = document.getElementById('refreshBankBtn');
            if (btn) {
                btn.textContent = 'Buscar Padrões (30s)';
                btn.disabled = false;
            }
        } else if (request.type === 'MODE_SNAPSHOT') {
            const snapshot = request.data || request.snapshot || null;
            logModeSnapshotUI(snapshot);
        }
    });
    
    // ✅ Confirmar que o listener foi registrado
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00FF88; font-weight: bold;');
    console.log('%c✅ CONTENT.JS LISTENER REGISTRADO!', 'color: #00FF88; font-weight: bold;');
    console.log('%c   chrome.runtime.onMessage.addListener → PRONTO', 'color: #00FF88;');
    console.log('%c   Aguardando mensagens: NEW_ANALYSIS, NEW_SPIN, etc', 'color: #00FF88;');
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00FF88; font-weight: bold;');
    console.log('');

    requestModeSnapshot('content_init');
    
    // Load initial data (com retry safe) - SEM histórico (vem do servidor)
    function loadInitialData() {
        try {
            chrome.storage.local.get(['lastSpin', 'analysis', 'pattern', 'entriesHistory'], function(result) {
                // Só chama updateSidebar se a extensão não foi invalidada/descarregada
                if (chrome && chrome.runtime && chrome.runtime.id) {
                    console.log('Dados iniciais carregados:', result);
                    
                    // Atualizar sidebar com análise e último giro
                    updateSidebar(result);
                    
                    // ✅ CARREGAR HISTÓRICO DE ENTRADAS (WIN/LOSS)
                    if (result.entriesHistory && result.entriesHistory.length > 0) {
                        console.log('📋 Carregando histórico de entradas:', result.entriesHistory.length, 'entradas');
                        renderEntriesPanel(result.entriesHistory);
                        if (autoBetManager && typeof autoBetManager.handleEntriesUpdate === 'function') {
                            autoBetManager.handleEntriesUpdate(result.entriesHistory);
                        }
                    } else {
                        console.log('📋 Nenhuma entrada no histórico ainda');
                        renderEntriesPanel([]);
                    }
                    
                    if (result.analysis && autoBetManager && typeof autoBetManager.handleAnalysis === 'function') {
                        autoBetManager.handleAnalysis(result.analysis);
                    }
                    
                    // ✅ CARREGAR CALIBRADOR DE PORCENTAGENS
                    console.log('📊 Carregando estatísticas do Calibrador de porcentagens...');
                    loadObserverStats();
                }
            });
        } catch (e) {
            console.error('Erro ao carregar dados:', e);
            // Provável context invalidated; tenta em 2 segundos
            setTimeout(loadInitialData, 2000);
        }
    }
    
    // Initialize sidebar when page loads
    console.log('%c🔍 VERIFICANDO ESTADO DO DOCUMENTO...', 'color: #00AAFF; font-weight: bold;');
    console.log(`%c   document.readyState: ${document.readyState}`, 'color: #00AAFF;');
    
    if (document.readyState === 'loading') {
        console.log('%c   → Aguardando DOMContentLoaded...', 'color: #FFA500;');
        document.addEventListener('DOMContentLoaded', function() {
            const domLoadTime = Date.now() - scriptStartTime;
            console.log(`%c✅ DOMContentLoaded em ${domLoadTime}ms`, 'color: #00FF88;');
            console.log('%c⚡ Criando sidebar IMEDIATAMENTE...', 'color: #00FF88;');
            setTimeout(createSidebar, 0); // Criar imediatamente
            setTimeout(loadInitialData, 100); // 100ms depois
        });
    } else {
        const domReadyTime = Date.now() - scriptStartTime;
        console.log(`%c✅ Documento já carregado (${domReadyTime}ms)`, 'color: #00FF88;');
        console.log('%c⚡ Criando sidebar IMEDIATAMENTE...', 'color: #00FF88;');
        setTimeout(createSidebar, 0); // Criar imediatamente
        setTimeout(loadInitialData, 100); // 100ms depois
    }
    
    // Update data every 3 seconds
    // ⚠️ OTIMIZADO: Mudado de 3s para 30s para reduzir consumo de bandwidth
    setInterval(loadInitialData, 30000); // 30 segundos em vez de 3
    
    // FORÇAR ATUALIZAÇÃO DO HISTÓRICO A CADA 2 SEGUNDOS (agora busca do servidor)
    setInterval(function() {
        try {
            // ✅ Atualização automática já está em updateHistoryUIFromServer() a cada 3s
            // Não precisa mais buscar de chrome.storage.local
            console.log('ℹ️ Histórico atualizado automaticamente pelo servidor');
        } catch (e) {
            console.error('Erro na atualização forçada:', e);
        }
    }, 2000);
    
    // Função para atualizar status de análise real
    function updateAnalysisStatus(status) {
        currentAnalysisStatus = status;
        
        // ✅ VERIFICAR SE O MODO IA ESTÁ ATIVO
        const aiModeToggle = document.querySelector('.ai-mode-toggle.active');
        const isAIMode = !!aiModeToggle;
        
        uiLog('═══════════════════════════════════════════════════════════');
        uiLog('🔍 [DEBUG updateAnalysisStatus]');
        uiLog('   Status:', status);
        uiLog('   Modo IA ativo?', isAIMode);
        
        // ✅ SE O MODO IA NÃO ESTIVER ATIVO, MOSTRAR NA CAIXA EMBAIXO (modo padrão)
        if (!isAIMode) {
            console.log('%c   📍 Modo PADRÃO - exibindo na caixa de sugestão', 'color: #FFD700; font-weight: bold;');
            // Em modo padrão não há gale ativo controlado pela IA
            setSuggestionStage('');
            renderSuggestionStatus(status);
            return; // NÃO atualizar o cabeçalho
        }
        
        // ✅ MODO IA ATIVO - ATUALIZAR O CABEÇALHO
        console.log('%c   💎 Modo DIAMANTE - exibindo no cabeçalho', 'color: #00FF88; font-weight: bold;');
        const modeApiStatus = document.getElementById('modeApiStatus');
        const modeApiContainer = document.querySelector('.mode-api-container');
        
        if (modeApiStatus) {
            if (modeApiStatusTypingInterval) {
                clearInterval(modeApiStatusTypingInterval);
                modeApiStatusTypingInterval = null;
            }

            const finalText = typeof status === 'string' ? status : String(status || '');
            const totalChars = finalText.length;
            const stepSize = totalChars > 0 ? Math.max(1, Math.ceil(totalChars / 10)) : 1;
            const baseSpeed = totalChars > 0 ? 24 : 24;

            const renderFrame = (visibleChars) => {
                if (visibleChars <= 0) {
                    modeApiStatus.innerHTML = '<span class="typing-caret"></span>';
                    return;
                }
                const partial = escapeHtml(finalText.slice(0, visibleChars));
                const highlighted = highlightDiamondStatus(partial);
                if (visibleChars < totalChars) {
                    modeApiStatus.innerHTML = `${highlighted}<span class="typing-caret"></span>`;
                } else {
                    modeApiStatus.innerHTML = highlighted;
                }
            };

            if (totalChars === 0) {
                modeApiStatus.innerHTML = '';
                modeApiStatus.removeAttribute('data-typing');
            } else {
                modeApiStatus.setAttribute('data-typing', 'true');
                let visible = 0;
                renderFrame(0);

                const typeNext = () => {
                    visible = Math.min(totalChars, visible + stepSize);
                    renderFrame(visible);
                    if (visible >= totalChars) {
                        if (modeApiStatusTypingInterval) {
                            clearInterval(modeApiStatusTypingInterval);
                            modeApiStatusTypingInterval = null;
                        }
                        modeApiStatus.removeAttribute('data-typing');
                    }
                };

                typeNext();
                if (visible < totalChars) {
                    modeApiStatusTypingInterval = setInterval(typeNext, baseSpeed);
                }
            }
            console.log('%c   ✅ Texto atualizado:', 'color: #00FF00;', finalText);
            
            if (modeApiContainer) {
                // 🔍 LOG: Tamanhos ANTES
                const heightBefore = window.getComputedStyle(modeApiContainer).height;
                const toggleHeightBefore = aiModeToggle ? window.getComputedStyle(aiModeToggle).height : 'N/A';
                console.log('%c   📏 ANTES:', 'color: #FFA500;', {
                    container: heightBefore,
                    toggle: toggleHeightBefore
                });
                
                // ✅ NÃO mexer no display - já está gerenciado pelo updateAIModeUI
                
                // ✅ APLICAR ESTILOS FIXOS (UMA VEZ SÓ)
                if (!modeApiContainer.hasAttribute('data-styled')) {
                    modeApiContainer.setAttribute('data-styled', 'true');
                    
                    // Container principal - TAMANHO ABSOLUTO FIXO
                    modeApiContainer.style.cssText = `
                        display: block !important;
                        position: relative !important;
                        margin-top: 8px !important;
                        margin-bottom: 0 !important;
                        min-height: 50px !important;
                        max-height: 50px !important;
                        height: 50px !important;
                        min-width: 100% !important;
                        max-width: 100% !important;
                        width: 100% !important;
                        box-sizing: border-box !important;
                        background: linear-gradient(135deg, rgba(0, 255, 136, 0.08) 0%, rgba(0, 212, 255, 0.08) 100%) !important;
                        border: none !important;
                        border-radius: 8px !important;
                        padding: 8px 12px !important;
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
                        backdrop-filter: blur(10px) !important;
                        overflow: hidden !important;
                        flex-grow: 0 !important;
                        flex-shrink: 0 !important;
                        flex-basis: 50px !important;
                    `;
                    
                    // Header simples
                    const headerSimple = modeApiContainer.querySelector('.mode-api-header-simple');
                    if (headerSimple) {
                        headerSimple.style.cssText = `
                            display: block !important;
                            text-align: center !important;
                            padding-bottom: 4px !important;
                            padding-top: 0 !important;
                            margin-bottom: 4px !important;
                            margin-top: 0 !important;
                            border-bottom: 1px solid rgba(0, 255, 136, 0.2) !important;
                            max-height: 18px !important;
                            height: 18px !important;
                            overflow: hidden !important;
                        `;
                        
                        const titleSimple = headerSimple.querySelector('.mode-api-title-simple');
                        if (titleSimple) {
                            titleSimple.style.cssText = `
                                font-size: 11px !important;
                                font-weight: 700 !important;
                                color: rgba(0, 255, 136, 0.95) !important;
                                text-transform: uppercase !important;
                                letter-spacing: 1px !important;
                                display: inline-block !important;
                                line-height: 14px !important;
                            `;
                        }
                    }
                    
                    // Status - FIXO
                    modeApiStatus.style.cssText = `
                        display: block !important;
                        font-size: 10px !important;
                        font-weight: 500 !important;
                        color: rgba(255, 255, 255, 0.9) !important;
                        line-height: 1.2 !important;
                        text-align: center !important;
                        overflow: hidden !important;
                        white-space: nowrap !important;
                        text-overflow: ellipsis !important;
                        max-height: 14px !important;
                        height: 14px !important;
                        padding: 0 !important;
                        margin: 0 !important;
                    `;
                    
                    console.log('%c   ✅ Estilos aplicados pela primeira vez', 'color: #00FF88;');
                }
                
                // 🔍 LOG: Tamanhos DEPOIS
                const heightAfter = window.getComputedStyle(modeApiContainer).height;
                const toggleHeightAfter = aiModeToggle ? window.getComputedStyle(aiModeToggle).height : 'N/A';
                console.log('%c   📏 DEPOIS:', 'color: #00FFFF;', {
                    container: heightAfter,
                    toggle: toggleHeightAfter,
                    mudou: heightBefore !== heightAfter
                });
                
                // 🔍 LOG: Estilos inline aplicados
                console.log('%c   🎨 Estilos inline do container:', 'color: #FFFF00;', modeApiContainer.style.cssText);
                if (aiModeToggle) {
                    console.log('%c   🎨 Estilos inline do toggle:', 'color: #FFFF00;', aiModeToggle.style.cssText);
                }
            }
            
            uiLog('✅ [updateAnalysisStatus] Atualizado cabeçário:', status);
            uiLog('═══════════════════════════════════════════════════════════');
        }
        
    }

    // Carregar e aplicar configurações na UI
    // ═══════════════════════════════════════════════════════════════
    // 🔧 FUNÇÃO: Exibir modal com o prompt padrão
    // ═══════════════════════════════════════════════════════════════
    function showPromptModal(title, promptText, readOnly = true) {
        // Criar overlay escuro
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
        `;
        
        // Criar modal
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
            border: 2px solid #FF00FF;
            border-radius: 12px;
            padding: 25px;
            max-width: 80%;
            max-height: 80%;
            overflow: auto;
            box-shadow: 0 10px 50px rgba(255, 0, 255, 0.5);
        `;
        
        // Título
        const modalTitle = document.createElement('div');
        modalTitle.textContent = title;
        modalTitle.style.cssText = `
            color: #FF00FF;
            font-weight: bold;
            font-size: 18px;
            margin-bottom: 20px;
            text-align: center;
            text-shadow: 0 0 10px rgba(255, 0, 255, 0.7);
        `;
        
        // Textarea com o prompt
        const textarea = document.createElement('textarea');
        textarea.value = promptText;
        textarea.readOnly = readOnly;
        textarea.style.cssText = `
            width: 100%;
            height: 500px;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            background: #0a0a0a;
            color: #00FF88;
            border: 1px solid #444;
            border-radius: 6px;
            padding: 15px;
            line-height: 1.6;
            resize: vertical;
            ${readOnly ? 'cursor: default;' : ''}
        `;
        
        // Botão de copiar
        const copyBtn = document.createElement('button');
        copyBtn.textContent = '📋 Copiar Prompt';
        copyBtn.style.cssText = `
            margin-top: 15px;
            margin-right: 10px;
            padding: 12px 20px;
            background: linear-gradient(135deg, #1a4d2e 0%, #2d7a4f 100%);
            color: #fff;
            border: 1px solid #00FF88;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: bold;
            transition: all 0.3s;
        `;
        copyBtn.addEventListener('click', function() {
            textarea.select();
            document.execCommand('copy');
            copyBtn.textContent = '✅ Copiado!';
            setTimeout(() => {
                copyBtn.textContent = '📋 Copiar Prompt';
            }, 2000);
        });
        
        // Botão de fechar
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✖️ Fechar';
        closeBtn.style.cssText = `
            margin-top: 15px;
            padding: 12px 20px;
            background: linear-gradient(135deg, #4d1a1a 0%, #7a2d2d 100%);
            color: #fff;
            border: 1px solid #FF6666;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: bold;
            transition: all 0.3s;
        `;
        closeBtn.addEventListener('click', function() {
            document.body.removeChild(overlay);
        });
        
        // Hover effects
        copyBtn.addEventListener('mouseover', function() {
            this.style.transform = 'scale(1.05)';
            this.style.boxShadow = '0 5px 20px rgba(0, 255, 136, 0.4)';
        });
        copyBtn.addEventListener('mouseout', function() {
            this.style.transform = 'scale(1)';
            this.style.boxShadow = 'none';
        });
        
        closeBtn.addEventListener('mouseover', function() {
            this.style.transform = 'scale(1.05)';
            this.style.boxShadow = '0 5px 20px rgba(255, 102, 102, 0.4)';
        });
        closeBtn.addEventListener('mouseout', function() {
            this.style.transform = 'scale(1)';
            this.style.boxShadow = 'none';
        });
        
        // Botões container
        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.cssText = 'display: flex; gap: 10px; justify-content: center;';
        buttonsContainer.appendChild(copyBtn);
        buttonsContainer.appendChild(closeBtn);
        
        // Montar modal
        modal.appendChild(modalTitle);
        modal.appendChild(textarea);
        modal.appendChild(buttonsContainer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Fechar ao clicar fora do modal
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
            }
        });
    }
    
    async function loadSettings() {
        try {
            // ✅ CARREGAR CONFIGURAÇÃO LOCAL ATUAL PRIMEIRO (para preservar aiMode)
            const localResult = await storageCompat.get(['analyzerConfig']);
            const localConfig = localResult.analyzerConfig || {};
            const localAIMode = localConfig.aiMode; // Preservar modo ativo local
            
            // ✅ VERIFICAR SE USUÁRIO QUER SINCRONIZAR
            const shouldSync = getSyncConfigPreference();
            
            if (shouldSync) {
                console.log('☁️ Sincronização ATIVADA - tentando carregar do servidor...');
                // ✅ TENTAR CARREGAR DO SERVIDOR (se autenticado)
                const serverConfig = await loadConfigFromServer();
                
                if (serverConfig) {
                    // Se tem configuração no servidor, mesclar com aiMode local
                    console.log('✅ Usando configurações do servidor (sincronizado)');
                    const mergedConfig = {
                        ...serverConfig,
                        aiMode: localAIMode // ✅ PRESERVAR aiMode local
                    };
                    await storageCompat.set({ analyzerConfig: mergedConfig });
                } else {
                    console.log('⚠️ Não foi possível carregar do servidor - usando configuração local');
                }
            } else {
                console.log('💾 Sincronização DESATIVADA - usando APENAS configuração local');
            }
            
            // Carregar do localStorage (que agora pode ter sido atualizado do servidor)
            chrome.storage.local.get(['analyzerConfig'], function(res) {
                const cfg = res && res.analyzerConfig ? res.analyzerConfig : {};
                const sanitizedProfiles = sanitizeMartingaleProfilesFromConfig(cfg);
                cfg.martingaleProfiles = sanitizedProfiles;
                const currentAIMode = getTabSpecificAIMode(cfg.aiMode || false);
                const activeModeKey = currentAIMode ? 'diamond' : 'standard';
                const activeMartingaleProfile = sanitizedProfiles[activeModeKey];
                
                if (typeof cfg.autoBetSummaryVisible === 'boolean') {
                    autoBetSummaryVisible = cfg.autoBetSummaryVisible;
                    applyAutoBetSummaryVisibility();
                }
                
                if (typeof cfg.analysisEnabled === 'boolean') {
                    updateAnalyzerToggleUI(cfg.analysisEnabled);
                    sendRuntimeMessage({ action: 'SET_ANALYSIS_ENABLED', enabled: cfg.analysisEnabled }).catch(() => {});
                }
                
                const histDepth = document.getElementById('cfgHistoryDepth');
                const minOcc = document.getElementById('cfgMinOccurrences');
                const maxOcc = document.getElementById('cfgMaxOccurrences');
                const minInt = document.getElementById('cfgMinInterval');
                const minSize = document.getElementById('cfgMinPatternSize');
                const maxSize = document.getElementById('cfgMaxPatternSize');
                const winPct = document.getElementById('cfgWinPercentOthers');
                const reqTrig = document.getElementById('cfgRequireTrigger');
                const consecutiveMartingale = document.getElementById('cfgConsecutiveMartingale');
                const maxGales = document.getElementById('cfgMaxGales');
                const tgChatId = document.getElementById('cfgTgChatId');
                if (histDepth) histDepth.value = cfg.historyDepth != null ? cfg.historyDepth : 2000;
                if (minOcc) minOcc.value = cfg.minOccurrences != null ? cfg.minOccurrences : 1;
                if (maxOcc) maxOcc.value = cfg.maxOccurrences != null ? cfg.maxOccurrences : 0;
                if (minInt) minInt.value = cfg.minIntervalSpins != null ? cfg.minIntervalSpins : 0;
                if (minSize) minSize.value = cfg.minPatternSize != null ? cfg.minPatternSize : 3;
                if (maxSize) maxSize.value = cfg.maxPatternSize != null ? cfg.maxPatternSize : 0;
                if (winPct) winPct.value = cfg.winPercentOthers != null ? cfg.winPercentOthers : 25;
                if (reqTrig) reqTrig.checked = cfg.requireTrigger != null ? cfg.requireTrigger : true;
                if (consecutiveMartingale) consecutiveMartingale.checked = activeMartingaleProfile.consecutiveMartingale;
                if (maxGales) maxGales.value = activeMartingaleProfile.maxGales;
                if (tgChatId) tgChatId.value = cfg.telegramChatId || '';
                const setAutoBetInput = (id, value, isCheckbox = false) => {
                    const el = document.getElementById(id);
                    if (!el) return;
                    if (isCheckbox) {
                        el.checked = !!value;
                    } else if (value !== undefined && value !== null) {
                        el.value = value;
                    }
                };
                const mergedAutoBetConfig = {
                    ...(cfg.autoBetConfig || {})
                };
                if (mergedAutoBetConfig.whiteProtection === undefined && typeof cfg.whiteProtectionAsWin === 'boolean') {
                    mergedAutoBetConfig.whiteProtection = !!cfg.whiteProtectionAsWin;
                }
                const autoBetConfig = sanitizeAutoBetConfig(mergedAutoBetConfig);
                setAutoBetInput('autoBetEnabled', autoBetConfig.enabled, true);
                setAutoBetInput('autoBetSimulationOnly', autoBetConfig.simulationOnly, true);
                setAutoBetInput('autoBetBaseStake', autoBetConfig.baseStake);
                setAutoBetInput('autoBetGaleMultiplier', autoBetConfig.galeMultiplier);
                setAutoBetInput('autoBetStopWin', autoBetConfig.stopWin);
                setAutoBetInput('autoBetStopLoss', autoBetConfig.stopLoss);
                setAutoBetInput('autoBetSimulationBank', autoBetConfig.simulationBankRoll);
                setWhiteProtectionModeUI(autoBetConfig.whiteProtectionMode);
                setWhiteProtectionModeAvailability(!!autoBetConfig.whiteProtection);
                setAutoBetInput('autoBetInverseMode', autoBetConfig.inverseModeEnabled, true);
                
                // 🎚️ Carregar intensidade de sinais
                const signalIntensitySelect = document.getElementById('signalIntensitySelect');
                if (signalIntensitySelect) {
                    signalIntensitySelect.value = cfg.signalIntensity || 'moderate';
                    console.log(`🎚️ Intensidade carregada: ${cfg.signalIntensity || 'moderate'}`);
                }
                
                // ✅ Aplicar visibilidade dos campos baseado no modo IA (considerando modo específico da aba)
                toggleAIConfigFields(currentAIMode);
                
                // ✅ Carregar preferência de sincronização de configurações
                const syncConfigCheckbox = document.getElementById('syncConfigToAccount');
                if (syncConfigCheckbox) {
                    syncConfigCheckbox.checked = getSyncConfigPreference();
                    console.log(`🔄 Preferência de sincronização de configurações carregada: ${syncConfigCheckbox.checked ? 'ATIVADA' : 'DESATIVADA'}`);
                }
            });
        } catch (e) { console.error('Erro ao carregar configurações:', e); }
    }
    function saveSettings() {
        console.log('');
        console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00D4FF; font-weight: bold;');
        console.log('%c║  💾 SALVANDO CONFIGURAÇÕES                                ║', 'color: #00D4FF; font-weight: bold;');
        console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00D4FF; font-weight: bold;');
        console.log('');
        
        // ✅ Feedback visual IMEDIATO para o usuário
        const btn = document.getElementById('cfgSaveBtn');
        if (btn) {
            btn.textContent = 'Salvando...';
            btn.style.background = '#1976d2';
        }
        
        // ✅ BUSCAR CONFIGURAÇÃO ATUAL PRIMEIRO (para preservar aiMode e outros estados)
        return new Promise((resolve) => {
        chrome.storage.local.get(['analyzerConfig'], async function(result) {
            try {
                const currentConfig = result.analyzerConfig || {};
                const martingaleProfiles = sanitizeMartingaleProfilesFromConfig(currentConfig);
                console.log('📊 Configuração atual:', currentConfig);
                
                // ✅ CAPTURAR VALORES COM VERIFICAÇÃO DE EXISTÊNCIA
                const getElementValue = (id, defaultValue, isCheckbox = false) => {
                    const el = document.getElementById(id);
                    if (!el) {
                        console.warn(`⚠️ Elemento "${id}" não encontrado - usando padrão: ${defaultValue}`);
                        return defaultValue;
                    }
                    return isCheckbox ? !!el.checked : (el.value || defaultValue);
                };
                
                const historyDepth = Math.max(100, Math.min(2000, parseInt(getElementValue('cfgHistoryDepth', '2000'), 10)));
                const minOcc = Math.max(parseInt(getElementValue('cfgMinOccurrences', '1'), 10), 1);
                const maxOcc = Math.max(parseInt(getElementValue('cfgMaxOccurrences', '0'), 10), 0);
                const minInt = Math.max(parseInt(getElementValue('cfgMinInterval', '0'), 10), 0);
                let minSize = Math.max(parseInt(getElementValue('cfgMinPatternSize', '2'), 10), 2);
                let maxSize = Math.max(parseInt(getElementValue('cfgMaxPatternSize', '0'), 10), 0);
                const winPct = Math.max(0, Math.min(100, parseInt(getElementValue('cfgWinPercentOthers', '25'), 10)));
                const reqTrig = getElementValue('cfgRequireTrigger', false, true);
                const consecutiveMartingaleSelected = getElementValue('cfgConsecutiveMartingale', false, true);
                const autoBetWhiteProtectionValue = getElementValue('autoBetWhiteProtection', AUTO_BET_DEFAULTS.whiteProtection, true);
                const tgChatId = String(getElementValue('cfgTgChatId', '')).trim();
                
                // 🎚️ Intensidade de sinais
                const signalIntensitySelect = document.getElementById('signalIntensitySelect');
                const signalIntensity = signalIntensitySelect ? signalIntensitySelect.value : 'moderate';
                const autoBetRawConfig = {
                    enabled: getElementValue('autoBetEnabled', false, true),
                    simulationOnly: getElementValue('autoBetSimulationOnly', true, true),
                    baseStake: getElementValue('autoBetBaseStake', AUTO_BET_DEFAULTS.baseStake),
                    galeMultiplier: getElementValue('autoBetGaleMultiplier', AUTO_BET_DEFAULTS.galeMultiplier),
                    stopWin: getElementValue('autoBetStopWin', AUTO_BET_DEFAULTS.stopWin),
                    stopLoss: getElementValue('autoBetStopLoss', AUTO_BET_DEFAULTS.stopLoss),
                    simulationBankRoll: getElementValue('autoBetSimulationBank', AUTO_BET_DEFAULTS.simulationBankRoll),
                    whitePayoutMultiplier: AUTO_BET_DEFAULTS.whitePayoutMultiplier,
                    whiteProtectionMode: normalizeWhiteProtectionMode(getElementValue('autoBetWhiteMode', AUTO_BET_DEFAULTS.whiteProtectionMode)),
                    inverseModeEnabled: getElementValue('autoBetInverseMode', AUTO_BET_DEFAULTS.inverseModeEnabled, true),
                    whiteProtection: autoBetWhiteProtectionValue
                };
                const sanitizedAutoBetConfig = sanitizeAutoBetConfig(autoBetRawConfig);
                const whiteProtectionSetting = sanitizedAutoBetConfig.whiteProtection;
                if (autoBetManager && typeof autoBetManager.applyConfigOverride === 'function') {
                    autoBetManager.applyConfigOverride(sanitizedAutoBetConfig);
                }
                
                // ✅ RESETAR HISTÓRICO DE SINAIS (limpar penalidades de losses consecutivos)
                console.log('%c🔄 Resetando histórico de sinais (limpar losses consecutivos)...', 'color: #00D4FF; font-weight: bold;');
                await storageCompat.set({
                    signalsHistory: {
                        totalSignals: 0,
                        wins: 0,
                        losses: 0,
                        consecutiveLosses: 0,
                        consecutiveWins: 0,
                        lastSignalTimestamp: null,
                        recent: []
                    }
                });
                console.log('%c✅ Histórico de sinais resetado!', 'color: #00FF88; font-weight: bold;');
                
                console.log('📝 Valores capturados dos campos:');
                console.log('   • minOccurrences:', minOcc);
                console.log('   • maxOccurrences:', maxOcc);
                console.log('   • minIntervalSpins:', minInt);
                console.log('   • minPatternSize:', minSize);
                console.log('   • maxPatternSize:', maxSize);
                console.log('   • winPercentOthers:', winPct + '%');
                console.log('   • signalIntensity:', signalIntensity);
                
                // ✅ VALIDAÇÃO: maxOccurrences não pode ser menor que minOccurrences (se não for 0)
                if (maxOcc > 0 && maxOcc < minOcc) {
                    alert(`❌ ERRO: Ocorrências MÁXIMAS (${maxOcc}) não pode ser menor que MÍNIMAS (${minOcc})!\n\nAjuste os valores e tente novamente.`);
                    if (btn) {
                        btn.textContent = 'Salvar';
                        btn.style.background = '';
                    }
                    return;
                }
                
                // ✅ VALIDAÇÃO: maxPatternSize não pode ser menor que minPatternSize (se não for 0)
                if (maxSize > 0 && maxSize < minSize) {
                    alert(`❌ ERRO: Tamanho MÁXIMO do padrão (${maxSize}) não pode ser menor que MÍNIMO (${minSize})!\n\n⚠️ Isso impede qualquer padrão de ser encontrado!\n\nAjuste os valores e tente novamente.`);
                    if (btn) {
                        btn.textContent = 'Salvar';
                        btn.style.background = '';
                    }
                    return;
                }
                
                // ✅ PRESERVAR aiMode ESPECÍFICO DESTA ABA (sessionStorage)
                const tabSpecificModeStr = sessionStorage.getItem('tabSpecificAIMode');
                let tabSpecificAIMode = getTabSpecificAIMode(currentConfig.aiMode || false);
                
                if (tabSpecificModeStr !== null) {
                    console.log(`%c🔒 Preservando aiMode específico desta aba: ${tabSpecificAIMode ? '💎 DIAMANTE' : '⚙️ PADRÃO'}`, 'color: #00FF88; font-weight: bold;');
                }

                const activeModeKey = tabSpecificAIMode ? 'diamond' : 'standard';
                const maxGalesInput = parseInt(getElementValue('cfgMaxGales', String(martingaleProfiles[activeModeKey].maxGales)), 10);
                const maxGales = clampMartingaleMax(maxGalesInput, martingaleProfiles[activeModeKey].maxGales);
                const updatedProfiles = {
                    ...martingaleProfiles,
                    [activeModeKey]: {
                        maxGales,
                        consecutiveMartingale: consecutiveMartingaleSelected
                    }
                };
                
                // ✅ MESCLAR com configuração atual para preservar aiMode e outros estados
                const cfg = {
                    ...currentConfig, // Preservar configurações existentes
                    aiMode: tabSpecificAIMode, // ✅ USAR MODO ESPECÍFICO DESTA ABA!
                    historyDepth: historyDepth,
                    minOccurrences: minOcc,
                    maxOccurrences: maxOcc,
                    minIntervalSpins: minInt,
                    minPatternSize: minSize,
                    maxPatternSize: maxSize,
                    winPercentOthers: winPct,
                    requireTrigger: reqTrig,
                    whiteProtectionAsWin: whiteProtectionSetting,
                    telegramChatId: tgChatId,
                    signalIntensity: signalIntensity,
                    martingaleProfiles: updatedProfiles,
                    autoBetConfig: sanitizedAutoBetConfig,
                    analysisEnabled: analyzerActive,
                    autoBetSummaryVisible: autoBetSummaryVisible
                };
                applyActiveMartingaleToLegacyFields(cfg, activeModeKey, updatedProfiles);
                
                console.log('');
                console.log('%c💾 Salvando em chrome.storage.local...', 'color: #00FF88; font-weight: bold;');
                console.log('   aiMode preservado (específico desta aba):', cfg.aiMode);
                console.log('   Objeto completo:', cfg);
                
                chrome.storage.local.set({ analyzerConfig: cfg }, async function() {
                    if (chrome.runtime.lastError) {
                        console.error('%c❌ ERRO ao salvar no storage!', 'color: #FF0000; font-weight: bold;');
                        console.error(chrome.runtime.lastError);
                        showConfigFeedback(false);
                        resolve(false);
                        return;
                    }
                    
                    console.log('%c✅ SALVO NO STORAGE COM SUCESSO!', 'color: #00FF00; font-weight: bold;');
                    console.log('');
                    
                    // ✅ VERIFICAR SE DEVE SINCRONIZAR COM SERVIDOR
                    const syncCheckbox = document.getElementById('syncConfigToAccount');
                    const shouldSync = syncCheckbox ? syncCheckbox.checked : true;
                    
                    // Salvar preferência do usuário
                    if (syncCheckbox) {
                        saveSyncConfigPreference(shouldSync);
                    }
                    
                    if (shouldSync) {
                        console.log('☁️ Sincronização de configurações ATIVADA - enviando para o servidor...');
                        syncConfigToServer(cfg).catch(err => {
                            console.warn('⚠️ Não foi possível sincronizar com servidor:', err);
                        });
                    } else {
                        console.log('💾 Sincronização de configurações DESATIVADA - salvando apenas localmente');
                    }
                    
                    // Pedir para o background aplicar imediatamente e dar feedback
                    console.log('%c📡 Enviando mensagem para background.js...', 'color: #00D4FF; font-weight: bold;');
                    try {
                        chrome.runtime.sendMessage({ action: 'applyConfig' }, function(resp) {
                            console.log('%c📨 Resposta recebida do background.js:', 'color: #00FF88; font-weight: bold;', resp);
                            
                            if (chrome.runtime.lastError) {
                                console.error('%c❌ Erro ao comunicar com background:', 'color: #FF6666; font-weight: bold;');
                                console.error(chrome.runtime.lastError);
                                // ✅ MESMO COM ERRO NA COMUNICAÇÃO, OS DADOS JÁ FORAM SALVOS!
                                console.log('%c⚠️ MAS: Configurações JÁ FORAM SALVAS no storage!', 'color: #FFA500; font-weight: bold;');
                                showConfigFeedback(true); // Mostrar sucesso porque salvou
                            } else {
                                // ✅ ACEITAR AMBOS OS FORMATOS DE RESPOSTA:
                                // - {status: 'applied'} quando background.js responde corretamente
                                // - {success: true} quando chrome-shim.js responde por padrão
                                // Como já salvamos em chrome.storage.local, qualquer resposta sem erro = sucesso!
                                const isSuccess = resp && (resp.status === 'applied' || resp.success === true);
                                console.log('%c✅ CONFIGURAÇÕES APLICADAS E ATIVAS!', 'color: #00FF00; font-weight: bold; font-size: 14px;');
                                console.log('');
                                showConfigFeedback(isSuccess);
                            }
                            resolve(true);
                        });
                    } catch (e) {
                        console.error('%c❌ Exception ao enviar mensagem:', 'color: #FF0000; font-weight: bold;', e);
                        // ✅ MESMO COM ERRO, OS DADOS JÁ FORAM SALVOS!
                        console.log('%c⚠️ MAS: Configurações JÁ FORAM SALVAS no storage!', 'color: #FFA500; font-weight: bold;');
                        showConfigFeedback(true); // Mostrar sucesso porque salvou
                        resolve(true);
                    }
                });
            } catch (e) {
                console.error('%c❌ ERRO CRÍTICO ao processar configurações:', 'color: #FF0000; font-weight: bold;', e);
                console.error(e.stack);
                showConfigFeedback(false);
                resolve(false);
            }
        }); // Fecha chrome.storage.local.get
        });
    }

    function showConfigFeedback(success) {
        const btn = document.getElementById('cfgSaveBtn');
        if (!btn) {
            console.warn('⚠️ Botão cfgSaveBtn não encontrado para feedback visual');
            return;
        }
        
        console.log('%c🎨 Mostrando feedback visual:', 'color: #00D4FF; font-weight: bold;', success ? '✅ SUCESSO' : '❌ ERRO');
        
        if (success) {
            btn.textContent = '✅ Salvo!';
            btn.style.background = '#2e7d32';
            btn.style.color = '#fff';
        } else {
            btn.textContent = '❌ Erro';
            btn.style.background = '#b71c1c';
            btn.style.color = '#fff';
        }
        
        setTimeout(function(){
            btn.textContent = 'Salvar';
            btn.style.background = '';
            btn.style.color = '';
        }, 2000);
    }

    // ========== BANCO DE PADRÕES ==========
    
    function showBankProgressMessage(message, options = {}) {
        const container = document.getElementById('bankProgress');
        const textElement = document.getElementById('bankProgressText');
        if (!container || !textElement) return;
        
        const variant = options.variant || 'info';
        container.classList.remove('bank-progress--info', 'bank-progress--success', 'bank-progress--error');
        container.classList.add(`bank-progress--${variant}`);
        
        textElement.textContent = message;
        container.style.display = 'block';
        
        if (bankProgressTimeout) {
            clearTimeout(bankProgressTimeout);
            bankProgressTimeout = null;
        }
        
        if (typeof options.autoHide === 'number' && options.autoHide > 0) {
            bankProgressTimeout = setTimeout(() => {
                hideBankProgressMessage();
            }, options.autoHide);
        }
    }
    
    function hideBankProgressMessage() {
        const container = document.getElementById('bankProgress');
        const textElement = document.getElementById('bankProgressText');
        if (!container || !textElement) return;
        container.style.display = 'none';
        textElement.textContent = '';
        
        if (bankProgressTimeout) {
            clearTimeout(bankProgressTimeout);
            bankProgressTimeout = null;
        }
    }
    
    // Função para atualizar a UI do banco de padrões
    function updatePatternBankUI(data) {
        const total = data.total || 0;
        const limit = data.limit || 3000;
        const percentage = total > 0 ? ((total / limit) * 100).toFixed(1) : 0;
        const high = data.byConfidence?.high || 0;
        const medium = data.byConfidence?.medium || 0;
        const low = data.byConfidence?.low || 0;
        
        // Atualizar elementos
        const bankTotal = document.getElementById('bankTotal');
        const bankLimit = document.getElementById('bankLimit');
        const bankPercent = document.getElementById('bankPercent');
        const capacityFill = document.getElementById('capacityFill');
        const confHigh = document.getElementById('confHigh');
        const confMedium = document.getElementById('confMedium');
        const confLow = document.getElementById('confLow');
        const bankStats = document.getElementById('bankStats');
        
        if (bankTotal) bankTotal.textContent = total;
        if (bankLimit) bankLimit.textContent = limit;
        if (bankPercent) bankPercent.textContent = percentage;
        if (capacityFill) capacityFill.style.width = percentage + '%';
        if (confHigh) confHigh.textContent = high;
        if (confMedium) confMedium.textContent = medium;
        if (confLow) confLow.textContent = low;
        
        // Remover loading
        if (bankStats) {
            bankStats.innerHTML = '';
        }
    }
    
    // Função para carregar dados do banco
    function loadPatternBank() {
        chrome.storage.local.get(['patternDB', 'analyzerConfig'], function(result) {
            const db = result.patternDB || { patterns_found: [] };
            const total = db.patterns_found ? db.patterns_found.length : 0;
            const analyzerConfig = result.analyzerConfig || {};
            const isDiamondModeActive = !!analyzerConfig.aiMode;
            
            if (!isDiamondModeActive) {
                if (!suppressAutoPatternSearch && total === 0 && !autoPatternSearchTriggered) {
                    autoPatternSearchTriggered = true;
                    console.log('🔁 Banco de padrões vazio. Iniciando busca automática de padrões (30s)...');
                    chrome.runtime.sendMessage({ action: 'startPatternSearch' }, function(response) {
                        if (response && response.status === 'already_running') {
                            console.log('ℹ️ Busca automática já está em andamento.');
                        } else if (response && response.status === 'insufficient_data') {
                            console.warn('⚠️ Histórico insuficiente para busca automática:', response.message || '');
                            autoPatternSearchTriggered = false; // tentar novamente quando dados chegarem
                        } else if (response && response.status === 'error') {
                            console.error('❌ Erro ao iniciar busca automática de padrões:', response.error);
                            autoPatternSearchTriggered = false; // permitir nova tentativa
                        } else if (!response) {
                            console.warn('⚠️ Resposta indefinida ao iniciar busca automática de padrões.');
                            autoPatternSearchTriggered = false;
                        }
                    });
                } else if (total > 0) {
                    autoPatternSearchTriggered = true;
                }
            } else {
                // Modo Diamante: nenhuma busca automática deve acontecer.
                // Mantém flag habilitada apenas se já houver padrões carregados.
                autoPatternSearchTriggered = total > 0;
            }
            
            // Agrupar por confiança
            const byConfidence = { high: 0, medium: 0, low: 0 };
            
            if (db.patterns_found) {
                db.patterns_found.forEach(p => {
                    const conf = p.confidence || 0;
                    if (conf >= 80) byConfidence.high++;
                    else if (conf >= 60) byConfidence.medium++;
                    else byConfidence.low++;
                });
            }
            
            updatePatternBankUI({
                total: total,
                limit: 5000,
                byConfidence: byConfidence
            });
        });
    }
    
    // Função para atualizar UI do observador
    function updateObserverUI(stats) {
        const observerStats = document.getElementById('observerStats');
        if (!observerStats) return;
        
        // Limpar loading
        observerStats.innerHTML = '';
        
        // ✅ Verificar se está em modo de coleta (< 10 entradas)
        const isCollecting = stats.total < 10;
        
        // Atualizar calibração
        const calibrationFactor = document.getElementById('calibrationFactor');
        if (calibrationFactor) {
            if (isCollecting) {
                calibrationFactor.textContent = '100.0% (coletando dados)';
                calibrationFactor.style.color = '#ffa500'; // Laranja
            } else {
                calibrationFactor.textContent = (stats.calibrationFactor * 100).toFixed(1) + '%';
                calibrationFactor.style.color = ''; // Cor padrão
            }
        }
        
        // Atualizar totais
        const observerTotal = document.getElementById('observerTotal');
        if (observerTotal) {
            if (isCollecting) {
                observerTotal.textContent = `${stats.total}/10`;
                observerTotal.style.color = '#ffa500'; // Laranja
            } else {
                observerTotal.textContent = stats.total;
                observerTotal.style.color = ''; // Cor padrão
            }
        }
        
        const observerWinRate = document.getElementById('observerWinRate');
        if (observerWinRate) {
            observerWinRate.textContent = stats.winRate.toFixed(1) + '%';
            if (isCollecting) {
                observerWinRate.style.color = '#ffa500'; // Laranja
            } else {
                observerWinRate.style.color = ''; // Cor padrão
            }
        }
        
        // Atualizar por faixa de confiança
        const obsHigh = document.getElementById('obsHigh');
        if (obsHigh) {
            const high = stats.byConfidence.high;
            if (high.total > 0) {
                obsHigh.textContent = `Prev: ${high.predicted.toFixed(0)}% | Real: ${high.actual.toFixed(0)}%`;
            } else {
                obsHigh.textContent = 'Sem dados';
            }
        }
        
        const obsMedium = document.getElementById('obsMedium');
        if (obsMedium) {
            const medium = stats.byConfidence.medium;
            if (medium.total > 0) {
                obsMedium.textContent = `Prev: ${medium.predicted.toFixed(0)}% | Real: ${medium.actual.toFixed(0)}%`;
            } else {
                obsMedium.textContent = 'Sem dados';
            }
        }
        
        const obsLow = document.getElementById('obsLow');
        if (obsLow) {
            const low = stats.byConfidence.low;
            if (low.total > 0) {
                obsLow.textContent = `Prev: ${low.predicted.toFixed(0)}% | Real: ${low.actual.toFixed(0)}%`;
            } else {
                obsLow.textContent = 'Sem dados';
            }
        }
    }
    
    // Função para carregar dados do observador
    function loadObserverStats() {
        console.log('📡 Enviando mensagem: getObserverStats...');
        chrome.runtime.sendMessage({ action: 'getObserverStats' }, function(response) {
            console.log('📡 Resposta recebida:', response);
            if (response && response.status === 'success') {
                console.log('✅ Stats do observador recebidas:', response.stats);
                updateObserverUI(response.stats);
            } else {
                console.error('❌ Erro ao carregar stats do observador:', response);
            }
        });
    }
    
    // Event listener para botão de atualizar
    document.addEventListener('click', function(e) {
        if (e.target && e.target.id === 'diamondLevelsBtn') {
            e.preventDefault();
            openDiamondLevelsModal();
        }

        if (e.target && e.target.id === 'diamondLevelsSaveBtn') {
            e.preventDefault();
            saveDiamondLevels();
        }
        
        if (e.target && e.target.id === 'refreshBankBtn') {
            e.preventDefault();
            const btn = e.target;
            btn.textContent = 'Buscando padrões...';
            btn.disabled = true;
            
            suppressAutoPatternSearch = false;
            autoPatternSearchTriggered = false;
            
            // Enviar mensagem para background.js iniciar busca de 30s
            chrome.runtime.sendMessage({ action: 'startPatternSearch' }, function(response) {
                if (response && response.status === 'started') {
                    console.log('✅ Busca de padrões iniciada!');
                    // O botão será reabilitado quando a busca terminar (via INITIAL_SEARCH_COMPLETE)
                } else if (response && response.status === 'already_running') {
                    btn.textContent = 'Busca em andamento...';
                    setTimeout(function() {
                        btn.textContent = 'Buscar Padrões (30s)';
                        btn.disabled = false;
                    }, 2000);
                } else if (response && response.status === 'insufficient_data') {
                    btn.textContent = 'Histórico insuficiente';
                    setTimeout(function() {
                        btn.textContent = 'Buscar Padrões (30s)';
                        btn.disabled = false;
                    }, 2000);
                }
            });
        }
        
        if (e.target && e.target.id === 'refreshObserverBtn') {
            e.preventDefault();
            const btn = e.target;
            btn.textContent = '⚙️ Calibrando...';
            btn.disabled = true;
            
            // ✅ Recalibrar observador manualmente
            chrome.runtime.sendMessage({ action: 'recalibrateObserver' }, function(response) {
                if (response && response.status === 'success') {
                    console.log('✅ Observador recalibrado manualmente!');
                    updateObserverUI(response.stats);
                } else {
                    console.error('❌ Erro ao recalibrar observador');
                }
                
                setTimeout(function() {
                    btn.textContent = '🔄 Atualizar';
                    btn.disabled = false;
                }, 500);
            });
        }
        
        if (e.target && e.target.id === 'resetBankBtn') {
            e.preventDefault();
            const btn = e.target;
            
            // Confirmação antes de resetar
            showCustomConfirm('Deseja realmente LIMPAR todos os padrões?\n\nEsta ação não pode ser desfeita.\n\nClique em OK para continuar.', btn).then(confirmar => {
            if (!confirmar) return;
            
            btn.textContent = 'Resetando...';
            btn.disabled = true;
            suppressAutoPatternSearch = true;
            autoPatternSearchTriggered = true;
            
                console.log('%c🗑️ LIMPANDO PADRÕES DIRETAMENTE DO LOCALSTORAGE...', 'color: #FF0000; font-weight: bold; font-size: 14px;');
                
                try {
                    // ✅ LIMPAR DIRETAMENTE DO LOCALSTORAGE (não depende do listener)
                    const allData = JSON.parse(localStorage.getItem('blazeAnalyzerData') || '{}');
                    
                    // Limpar apenas os padrões, preservando o resto
                    delete allData.patternDB;
                    delete allData.currentAnalysis;
                    
                    // Salvar de volta
                    localStorage.setItem('blazeAnalyzerData', JSON.stringify(allData));
                    
                    console.log('%c✅ PADRÕES LIMPOS COM SUCESSO!', 'color: #00FF88; font-weight: bold; font-size: 14px;');
                    
                    chrome.runtime.sendMessage({ action: 'resetPatterns' }, function(response) {
                        if (response && response.status === 'success') {
                    btn.textContent = 'Resetado!';
                    loadPatternBank();
                        } else {
                            console.error('%c❌ ERRO AO RESETAR PADRÕES NO BACKGROUND:', 'color: #FF0000; font-weight: bold;', response);
                            btn.textContent = 'Erro ao resetar';
                            suppressAutoPatternSearch = false;
                            autoPatternSearchTriggered = false;
                        }
                    
                    setTimeout(function() {
                        btn.textContent = 'Resetar Padrões';
                        btn.disabled = false;
                    }, 2000);
                    });
                } catch (error) {
                    console.error('%c❌ ERRO AO LIMPAR PADRÕES:', 'color: #FF0000; font-weight: bold;', error);
                    btn.textContent = 'Erro ao resetar';
                    suppressAutoPatternSearch = false;
                    autoPatternSearchTriggered = false;
                    setTimeout(function() {
                        btn.textContent = 'Resetar Padrões';
                        btn.disabled = false;
                    }, 2000);
                }
            });
        }
    });

    // Wire salvar configurações
    document.addEventListener('click', function(e) {
        if (e.target && e.target.id === 'cfgSaveBtn') {
            e.preventDefault();
            saveSettings();
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════════
    // ATUALIZAÇÃO AUTOMÁTICA DO HISTÓRICO DE GIROS DO SERVIDOR
    // ═══════════════════════════════════════════════════════════════════════════════
    
    const API_URL = 'https://blaze-giros-api-v2-sx14.onrender.com';
    let isUpdatingHistory = false;
    let lastHistoryUpdate = null;
    let isWebSocketConnected = true; // Assume conectado inicialmente
    let historyPollingInterval = null; // Intervalo de polling para histórico
    
    // Buscar giros do servidor (TODOS os 2000)
    async function fetchHistoryFromServer() {
        if (isUpdatingHistory) return;
        
        try {
            isUpdatingHistory = true;
            
            const startTime = Date.now();
            console.log('⏱️ [TIMING] Iniciando fetch em:', new Date().toLocaleTimeString());
            
            const response = await fetch(`${API_URL}/api/giros?limit=2000`, {
                signal: AbortSignal.timeout(8000)
            });
            
            const fetchTime = Date.now() - startTime;
            console.log(`⏱️ [TIMING] Fetch completou em ${fetchTime}ms`);
            
            if (!response.ok) {
                throw new Error(`Servidor offline - Status ${response.status}`);
            }
            
            const data = await response.json();
            
            const totalTime = Date.now() - startTime;
            console.log(`⏱️ [TIMING] JSON parseado em ${totalTime}ms total`);
            
            if (data.success && data.data) {
                console.log(`✅ ${data.data.length} giros carregados em ${totalTime}ms`);
                lastHistoryUpdate = new Date();
                return data.data;
            }
            
            return [];
        } catch (error) {
            const totalTime = Date.now() - (Date.now() - 8000);
            console.error(`❌ [TIMING] Erro após timeout/erro:`, error.message);
            return [];
        } finally {
            isUpdatingHistory = false;
        }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // 🚀 ATUALIZAÇÃO INSTANTÂNEA DO HISTÓRICO (SEM REQUISIÇÃO HTTP)
    // ═══════════════════════════════════════════════════════════════
    function updateHistoryUIInstant(newSpin) {
        if (!newSpin || !newSpin.number) return;
        
        // ✅ ADICIONAR NOVO GIRO NO INÍCIO DO HISTÓRICO LOCAL
        if (currentHistoryData.length > 0) {
            // Verificar se já existe (evitar duplicatas)
            const exists = currentHistoryData.some(spin => 
                spin.timestamp === newSpin.timestamp || 
                (spin.number === newSpin.number && Math.abs(new Date(spin.timestamp) - new Date(newSpin.timestamp)) < 2000)
            );
            
            if (!exists) {
                currentHistoryData.unshift(newSpin);
                // Manter no máximo 2000 giros em memória
                if (currentHistoryData.length > 2000) {
                    currentHistoryData = currentHistoryData.slice(0, 2000);
                }
            }
        } else {
            // 🆕 Se não há histórico ainda, inicializar com o novo giro
            currentHistoryData = [newSpin];
        }
        
        // ✅ RE-RENDERIZAR HISTÓRICO INSTANTANEAMENTE
        let historyContainer = document.getElementById('spin-history-bar-ext');
        
        // 🆕 Se o container não existe, criar ele primeiro!
        if (!historyContainer) {
            const statsSection = document.querySelector('.stats-section');
            if (statsSection) {
                const wrap = document.createElement('div');
                wrap.id = 'spin-history-bar-ext';
                wrap.innerHTML = renderSpinHistory(currentHistoryData);
                statsSection.appendChild(wrap);
                
                // 🆕 Adicionar event listener para o botão "Carregar Mais" (criação inicial)
                const loadMoreBtn = document.getElementById('loadMoreHistoryBtn');
                if (loadMoreBtn) {
                    loadMoreBtn.addEventListener('click', function handleLoadMore() {
                        const remaining = currentHistoryData.length - currentHistoryDisplayLimit;
                        const increment = 500;
                        const addAmount = remaining > increment ? increment : remaining;
                        
                        currentHistoryDisplayLimit += addAmount;
                        console.log(`📊 Carregando mais ${addAmount} giros. Total exibido: ${currentHistoryDisplayLimit}`);
                        
                        const container = document.getElementById('spin-history-bar-ext');
                        if (container) {
                            container.innerHTML = renderSpinHistory(currentHistoryData);
                        }
                        
                        // Re-adicionar event listener
                        const newLoadMoreBtn = document.getElementById('loadMoreHistoryBtn');
                        if (newLoadMoreBtn) {
                            newLoadMoreBtn.addEventListener('click', handleLoadMore);
                        }
                    });
                }
                return; // Container criado com sucesso!
            }
            return;
        }
        
        // Container já existe - apenas atualizar
        if (currentHistoryData.length > 0) {
            // SALVAR posição do scroll (sempre no topo para novos giros)
            historyContainer.innerHTML = renderSpinHistory(currentHistoryData);
            historyContainer.style.display = 'block';
            
            // ✅ Re-adicionar event listener para o botão "Carregar Mais"
            const loadMoreBtn = document.getElementById('loadMoreHistoryBtn');
            if (loadMoreBtn) {
                loadMoreBtn.addEventListener('click', function handleLoadMore() {
                    const remaining = currentHistoryData.length - currentHistoryDisplayLimit;
                    const increment = 500;
                    const addAmount = remaining > increment ? increment : remaining;
                    
                    currentHistoryDisplayLimit += addAmount;
                    console.log(`📊 Carregando mais ${addAmount} giros. Total exibido: ${currentHistoryDisplayLimit}`);
                    
                    historyContainer.innerHTML = renderSpinHistory(currentHistoryData);
                    
                    // Re-adicionar event listener
                    const newLoadMoreBtn = document.getElementById('loadMoreHistoryBtn');
                    if (newLoadMoreBtn) {
                        newLoadMoreBtn.addEventListener('click', handleLoadMore);
                    }
                });
            }
        }
        
        // ✅ ATUALIZAR TOTAL DE GIROS
        const totalSpins = document.getElementById('totalSpins');
        if (totalSpins) {
            totalSpins.textContent = currentHistoryData.length;
        }
    }
    // ═══════════════════════════════════════════════════════════════
    // 🌐 ATUALIZAÇÃO COMPLETA DO HISTÓRICO (COM REQUISIÇÃO HTTP)
    // ═══════════════════════════════════════════════════════════════
    // Atualizar UI com giros do servidor
    async function updateHistoryUIFromServer() {
        const spins = await fetchHistoryFromServer();
        
        // ✅ ATUALIZAR currentHistoryData com os giros do servidor
        if (spins && spins.length > 0) {
            currentHistoryData = spins;
        }
        
        if (spins && spins.length > 0) {
            // Atualizar o elemento de histórico
            const historyContainer = document.getElementById('spin-history-bar-ext');
            
            if (historyContainer) {
                // ✅ SALVAR posição do scroll ANTES de atualizar (container interno com scroll)
                const scrollContainer = historyContainer.querySelector('.spin-history-bar-blaze');
                let scrollPosition = 0;
                let wasScrolledDown = false;
                
                if (scrollContainer) {
                    scrollPosition = scrollContainer.scrollTop;
                    wasScrolledDown = scrollPosition > 10; // Se estava rolando a lista (mais de 10px)
                }
                
                historyContainer.innerHTML = renderSpinHistory(spins);
                historyContainer.style.display = 'block';
                
                // ✅ RESTAURAR posição do scroll DEPOIS de atualizar (só se não estava no topo)
                if (wasScrolledDown && scrollPosition > 0) {
                    setTimeout(() => {
                        const newScrollContainer = historyContainer.querySelector('.spin-history-bar-blaze');
                        if (newScrollContainer) {
                            newScrollContainer.scrollTop = scrollPosition;
                            
                            requestAnimationFrame(() => {
                                const finalContainer = historyContainer.querySelector('.spin-history-bar-blaze');
                                if (finalContainer && finalContainer.scrollTop !== scrollPosition) {
                                    finalContainer.scrollTop = scrollPosition;
                                }
                            });
                        }
                    }, 50);
                }
                
                // ✅ Adicionar event listener para o botão "Carregar Mais"
                const loadMoreBtn = document.getElementById('loadMoreHistoryBtn');
                if (loadMoreBtn) {
                    loadMoreBtn.addEventListener('click', function() {
                        const remaining = spins.length - currentHistoryDisplayLimit;
                        const increment = 500;
                        const addAmount = remaining > increment ? increment : remaining;
                        
                        currentHistoryDisplayLimit += addAmount;
                        console.log(`📊 Carregando mais ${addAmount} giros. Total exibido agora: ${currentHistoryDisplayLimit}`);
                        
                        // Re-renderizar com novo limite
                        historyContainer.innerHTML = renderSpinHistory(currentHistoryData);
                        
                        // Adicionar event listener novamente (botão foi recriado)
                        const newLoadMoreBtn = document.getElementById('loadMoreHistoryBtn');
                        if (newLoadMoreBtn) {
                            newLoadMoreBtn.addEventListener('click', arguments.callee);
                        }
                    });
                }
            } else {
                // Se container não existe, criar
                const statsSection = document.querySelector('.stats-section');
                if (statsSection) {
                    const wrap = document.createElement('div');
                    wrap.id = 'spin-history-bar-ext';
                    wrap.innerHTML = renderSpinHistory(spins);
                    statsSection.appendChild(wrap);
                    
                    // ✅ Adicionar event listener para o botão "Carregar Mais" (criação inicial)
                    const loadMoreBtn = document.getElementById('loadMoreHistoryBtn');
                    if (loadMoreBtn) {
                        loadMoreBtn.addEventListener('click', function() {
                            const remaining = spins.length - currentHistoryDisplayLimit;
                            const increment = 500;
                            const addAmount = remaining > increment ? increment : remaining;
                            
                            currentHistoryDisplayLimit += addAmount;
                            console.log(`📊 Carregando mais ${addAmount} giros. Total exibido agora: ${currentHistoryDisplayLimit}`);
                            
                            // Re-renderizar com novo limite
                            wrap.innerHTML = renderSpinHistory(currentHistoryData);
                            
                            // Adicionar event listener novamente (botão foi recriado)
                            const newLoadMoreBtn = document.getElementById('loadMoreHistoryBtn');
                            if (newLoadMoreBtn) {
                                newLoadMoreBtn.addEventListener('click', arguments.callee);
                            }
                        });
                    }
                }
            }
            
            // Atualizar último giro também
            if (spins[0]) {
                const lastSpin = spins[0];
                updateSidebar({ lastSpin: lastSpin });
            }
            
            // Atualizar total de giros
            const totalSpins = document.getElementById('totalSpins');
            if (totalSpins) {
                totalSpins.textContent = spins.length;
            }
        } else {
            // ⚠️ Nenhum giro disponível ainda
            const historyContainer = document.getElementById('spin-history-bar-ext');
            if (!historyContainer) {
                // Criar container com mensagem de "aguardando giros"
                const statsSection = document.querySelector('.stats-section');
                if (statsSection) {
                    const wrap = document.createElement('div');
                    wrap.id = 'spin-history-bar-ext';
                    wrap.innerHTML = `
                        <div class="spin-history-label">
                            <span>ÚLTIMOS GIROS</span>
                            <div class="spin-count-info">
                                <span class="displaying-count">Aguardando servidor...</span>
                            </div>
                        </div>
                        <div class="spin-history-bar-blaze" style="text-align: center; padding: 20px; color: #888;">
                            ⏳ Aguardando primeiro giro da Blaze...
                        </div>
                    `;
                    statsSection.appendChild(wrap);
                }
            }
            
            // Atualizar total de giros como 0
            const totalSpins = document.getElementById('totalSpins');
            if (totalSpins) {
                totalSpins.textContent = '0';
            }
        }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // 🔄 POLLING DE FALLBACK PARA HISTÓRICO (quando WebSocket cai)
    // ═══════════════════════════════════════════════════════════════
    function startHistoryPolling() {
        // Se já está rodando, não iniciar novamente
        if (historyPollingInterval) return;
        
        console.log('');
        console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #FF6B00; font-weight: bold;');
        console.log('%c║  🔄 POLLING DE HISTÓRICO ATIVADO                         ║', 'color: #FF6B00; font-weight: bold;');
        console.log('%c║  WebSocket desconectado - atualizando via HTTP          ║', 'color: #FF6B00; font-weight: bold;');
        console.log('%c║  Frequência: a cada 2 segundos                          ║', 'color: #FF6B00; font-weight: bold;');
        console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #FF6B00; font-weight: bold;');
        console.log('');
        
        // ✅ Atualizar histórico a cada 2 segundos via HTTP
        historyPollingInterval = setInterval(() => {
            console.log('🔄 Atualizando histórico via HTTP (WebSocket offline)...');
            updateHistoryUIFromServer();
        }, 2000); // A cada 2 segundos
    }
    
    function stopHistoryPolling() {
        if (historyPollingInterval) {
            clearInterval(historyPollingInterval);
            historyPollingInterval = null;
            console.log('✅ Polling de histórico parado - WebSocket reconectado');
        }
    }
    
    // Iniciar histórico (atualiza instantaneamente via WebSocket)
    function startAutoHistoryUpdate() {
        console.log('⏱️ [TIMING] startAutoHistoryUpdate() chamado em:', new Date().toLocaleTimeString());
        
        // ✅ Carregar histórico inicial UMA VEZ (ao abrir extensão)
        updateHistoryUIFromServer();
    }
    
    // Carregar configurações e banco de padrões ao iniciar
    setTimeout(loadSettings, 1800);
    setTimeout(loadPatternBank, 2000);
    setTimeout(loadObserverStats, 2200);
    
    // ⚠️ REMOVIDO: O histórico agora é carregado APÓS a sidebar ser criada
    // Ver createSidebar() para o novo local de inicialização
    
})();