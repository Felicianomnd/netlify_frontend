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
    // 🧹 LIMPEZA AUTOMÁTICA DO CONSOLE A CADA 10 MINUTOS
    // ═══════════════════════════════════════════════════════════════════════════════
    // Evita acúmulo de logs após horas de uso, prevenindo travamentos
    // Esta limpeza é apenas VISUAL (console) - não afeta dados ou análises
    // ═══════════════════════════════════════════════════════════════════════════════
    let memoryCleanupInterval = setInterval(() => {
        try {
            // Limpeza suave do console (apenas visual, não afeta funcionalidade)
            if (console.clear) {
                console.clear();
            }
            console.log('%c🧹 Limpeza automática de memória executada', 'color: #00FF88; font-weight: bold;');
            console.log('%c   Próxima limpeza em 10 minutos', 'color: #888;');
        } catch (error) {
            console.warn('⚠️ Erro na limpeza automática:', error);
        }
    }, 600000); // 10 minutos (600.000ms)
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // VARIÁVEL GLOBAL: Controle de exibição do histórico por camadas
    // ═══════════════════════════════════════════════════════════════════════════════
    let currentHistoryDisplayLimit = 500; // Normal: começa exibindo 500 (camadas de 500)
    let currentHistoryDisplayLimitExpanded = 1500; // Fullscreen do Histórico: começa maior para preencher o espaço
    let currentHistoryData = []; // Armazenar histórico atual para re-renderizar
    let autoPatternSearchTriggered = false; // Impede disparos automáticos repetidos
    let suppressAutoPatternSearch = false; // Evita busca automática após reset manual
    // ✅ Manter o último sinal de recuperação (por modo) para não “sumir” após desativar (WIN)
    let lastRecoveryEntryByMode = { standard: null, diamond: null };
    
    const SESSION_STORAGE_KEYS = ['authToken', 'user', 'lastAuthCheck'];
    let forceLogoutAlreadyTriggered = false;
    let activeUserMenuKeyHandler = null;

    const MARTINGALE_PROFILE_DEFAULTS = Object.freeze({
        // consecutiveGales = quantos gales são IMEDIATOS (consecutivos) antes de aguardar novo sinal
        standard: { maxGales: 0, consecutiveMartingale: false, consecutiveGales: 0 },
        diamond: { maxGales: 0, consecutiveMartingale: false, consecutiveGales: 0 }
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
            const maxGales = clampMartingaleMax(inheritedMax, fallbackProfile.maxGales);
            const rawConsecutiveGales = rawProfile.consecutiveGales != null
                ? Number(rawProfile.consecutiveGales)
                : (typeof inheritedConsecutive === 'boolean' && inheritedConsecutive ? maxGales : 0);
            const consecutiveGales = Math.max(0, Math.min(maxGales, Math.floor(Number.isFinite(rawConsecutiveGales) ? rawConsecutiveGales : 0)));
            sanitized[mode] = {
                maxGales,
                consecutiveGales,
                // legado: agora significa "tem parte consecutiva"
                consecutiveMartingale: consecutiveGales > 0
            };
        });

        return sanitized;
    }

    // ✅ Modo IA é global por conta (sincronizado). Não usar sessionStorage por aba.
    function getTabSpecificAIMode(defaultValue) {
        return !!defaultValue;
    }

    function applyActiveMartingaleToLegacyFields(config, modeKey, profiles) {
        if (!config || !profiles) return;
        const profile = profiles[modeKey] || MARTINGALE_PROFILE_DEFAULTS[modeKey];
        config.maxGales = profile.maxGales;
        config.consecutiveMartingale = !!profile.consecutiveMartingale;
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

    function getProfileCompletionSnapshot(user) {
        const missing = [];
        if (!user || typeof user !== 'object') {
            return { complete: false, missing: ['Telefone', 'CPF', 'CEP', 'Rua', 'Número', 'Bairro', 'Cidade', 'Estado'] };
        }
        const digits = (value) => String(value || '').replace(/\D/g, '');
        const phoneDigits = digits(user.phone);
        const cpfDigits = digits(user.cpf);
        const addr = typeof user.address === 'string'
            ? (() => { try { return JSON.parse(user.address); } catch (_) { return null; } })()
            : (user.address || null);
        const zipDigits = digits(addr?.zipCode);
        const street = String(addr?.street || '').trim();
        const number = String(addr?.number || '').trim();
        const neighborhood = String(addr?.neighborhood || '').trim();
        const city = String(addr?.city || '').trim();
        const state = String(addr?.state || '').trim();

        if (phoneDigits.length < 10) missing.push('Telefone');
        if (cpfDigits.length !== 11) missing.push('CPF');
        if (zipDigits.length !== 8) missing.push('CEP');
        if (!street) missing.push('Rua');
        if (!number) missing.push('Número');
        if (!neighborhood) missing.push('Bairro');
        if (!city) missing.push('Cidade');
        if (state.length !== 2) missing.push('Estado');

        return { complete: missing.length === 0, missing };
    }

    function buildProfileIncompleteMessage(missingFields = []) {
        const fields = missingFields.length ? missingFields.join(', ') : 'Dados do cadastro';
        return `
            Para ativar o <strong>Nível Diamante (Modo IA)</strong>, finalize seu cadastro na aba <strong>Minha Conta</strong> e clique em <strong>Salvar Dados</strong>.
            <br><br>
            <strong>Campos pendentes:</strong> ${fields}
        `;
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
                padding: 0;
                width: 90%;
                max-width: 340px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.8), 0 0 10px rgba(255, 0, 63, 0.3);
                z-index: 999999;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                box-sizing: border-box;
                overflow: hidden;
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
            
            // Cabeçalho com título e botão fechar (mesmo estilo do header principal)
            const header = document.createElement('div');
            header.className = 'modal-header-minimal';
            
            const headerTitle = document.createElement('h3');
            headerTitle.textContent = 'Confirmação';
            
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'modal-header-close';
            closeBtn.textContent = 'Fechar';
            closeBtn.onclick = () => {
                if (modal.parentNode === document.body) {
                    document.body.removeChild(modal);
                }
                resolve(false);
            };
            
            header.appendChild(headerTitle);
            header.appendChild(closeBtn);
            
            // Corpo do modal
            const modalBody = document.createElement('div');
            modalBody.className = 'modal-body-scrollable';
            modalBody.style.cssText = `
                padding: 16px;
            `;
            
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
            
            // Montar botões
            buttonsContainer.appendChild(cancelBtn);
            buttonsContainer.appendChild(okBtn);
            
            // Montar corpo do modal
            modalBody.appendChild(messageEl);
            modalBody.appendChild(buttonsContainer);
            
            // Montar modal completo
            modal.appendChild(header);
            modal.appendChild(modalBody);
            
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
            
            const titles = {
                success: 'Sucesso',
                error: 'Erro',
                warning: 'Aviso',
                info: 'Informação'
            };
            
            const color = colors[type] || colors.info;
            const title = titles[type] || titles.info;
            
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
                padding: 0;
                width: 90%;
                min-width: 280px;
                max-width: 400px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.8), 0 0 10px ${color}40;
                z-index: 999999;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                box-sizing: border-box;
                overflow: hidden;
            `;
            
            // Cabeçalho com título e botão fechar (mesmo estilo do header principal)
            const header = document.createElement('div');
            header.className = 'modal-header-minimal';
            
            const headerTitle = document.createElement('h3');
            headerTitle.textContent = title;
            
            const closeHeaderBtn = document.createElement('button');
            closeHeaderBtn.type = 'button';
            closeHeaderBtn.className = 'modal-header-close';
            closeHeaderBtn.textContent = 'Fechar';
            closeHeaderBtn.onclick = () => {
                if (modal.parentNode === document.body) {
                    document.body.removeChild(modal);
                }
                resolve(true);
            };
            
            header.appendChild(headerTitle);
            header.appendChild(closeHeaderBtn);
            
            // Corpo do modal
            const modalBody = document.createElement('div');
            modalBody.className = 'modal-body-scrollable';
            modalBody.style.cssText = `
                padding: 16px;
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
        
            // Montar corpo do modal
            modalBody.appendChild(messageEl);
            modalBody.appendChild(okBtn);
            
            // Montar modal completo
            modal.appendChild(header);
            modal.appendChild(modalBody);
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
            padding: 0;
            width: 90%;
            max-width: 420px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.8), 0 0 10px rgba(255, 215, 0, 0.3);
            z-index: 999999;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            box-sizing: border-box;
            overflow: hidden;
        `;
        
        // Cabeçalho com título e botão fechar (mesmo estilo do header principal)
        const header = document.createElement('div');
        header.className = 'modal-header-minimal';
        
        const headerTitle = document.createElement('h3');
        headerTitle.textContent = 'Análise Nível Diamante Bloqueada';
        
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'modal-header-close';
        closeBtn.textContent = 'Fechar';
        closeBtn.onclick = () => {
            if (modal.parentNode === document.body) {
                document.body.removeChild(modal);
            }
        };
        
        header.appendChild(headerTitle);
        header.appendChild(closeBtn);
        
        // Corpo do modal
        const modalBody = document.createElement('div');
        modalBody.className = 'modal-body-scrollable';
        modalBody.style.cssText = `
            padding: 20px;
        `;
        
        // Ícone de aviso
        const iconDiv = document.createElement('div');
        iconDiv.style.cssText = `
            text-align: center;
            font-size: 36px;
            margin-bottom: 12px;
        `;
        iconDiv.textContent = '⚠️';
        
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
        
        // Montar botões
        buttonsContainer.appendChild(configBtn);
        buttonsContainer.appendChild(okBtn);
        
        // Montar corpo do modal
        modalBody.appendChild(iconDiv);
        modalBody.appendChild(message);
        modalBody.appendChild(buttonsContainer);
        
        // Montar modal completo
        modal.appendChild(header);
        modal.appendChild(modalBody);
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
        
        // ✅ Salvar no storage global (por conta/dispositivo)
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
            
            // ✅ Sincronizar modo/config com a conta (se preferência estiver ativa)
            try {
                const shouldSync = getSyncConfigPreference();
                if (shouldSync) {
                    syncConfigToServer(config).catch(err => console.warn('⚠️ Falha ao sincronizar modo IA com servidor:', err));
                }
            } catch (_) {}
            
            // ✅ RE-RENDERIZAR ENTRADAS PARA FILTRAR POR MODO
            chrome.storage.local.get(['entriesHistory'], function(res) {
                if (res && res.entriesHistory) {
                    console.log(`🔄 Re-renderizando entradas para modo ${newAIMode ? 'DIAMANTE' : 'PADRÃO'}...`);
                    console.log(`   Total de entradas no histórico: ${res.entriesHistory.length}`);
                    renderEntriesPanel(res.entriesHistory);
                    // ✅ Atualizar também o painel de saldo (Simulador) ao trocar de modo,
                    // mesmo que não chegue uma nova ENTRIES_UPDATE naquele instante.
                    try {
                        if (autoBetManager && typeof autoBetManager.handleEntriesUpdate === 'function') {
                            autoBetManager.handleEntriesUpdate(res.entriesHistory);
                        }
                    } catch (_) {}
                    // ✅ Atualizar card dos Sinais de entrada ao trocar de modo (Premium/Diamante)
                    try { scheduleMasterSignalStatsRefresh(0); } catch (_) {}
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
        // ✅ Atualizar título/destaque do setor principal no modal "Configurar Simulador"
        // IA (Diamante) vs Premium (Padrão)
        try {
            const modeSection = document.querySelector('#autoBetAccordion .auto-bet-acc-section[data-acc-key="mode"]');
            const titleEl = modeSection ? modeSection.querySelector('.auto-bet-acc-title') : null;
            if (titleEl) {
                titleEl.textContent = isAIMode ? 'CONFIGURAÇÃO DO MODO IA' : 'CONFIGURAÇÃO DO MODO PREMIUM';
            }
            if (modeSection) {
                modeSection.setAttribute('data-mode', isAIMode ? 'ia' : 'premium');
            }
        } catch (_) {}

        // ✅ CAMPOS DO MODO PADRÃO: Ocultar quando IA está ativa
        const standardModeFields = [
            'cfgHistoryDepth',       // ✅ Profundidade de Análise (giros) - VÁLIDO APENAS NO MODO PADRÃO
            'cfgMinOccurrences',     // Ocorrências mínima (modo padrão)
            'cfgMaxOccurrences',     // Quantidade máxima de ocorrências
            'cfgPatternInterval',    // Intervalo entre padrões (modo padrão)
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
        
        // ✅ CAMPOS EXCLUSIVOS DO MODO DIAMANTE
        const diamondOnlyFields = [
            // (vazio)
        ];
        
        diamondOnlyFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                // Pode estar na tela principal (setting-item) ou dentro do modal do simulador (auto-bet-field)
                const wrapper = field.closest('.setting-item') || field.closest('.auto-bet-field');
                if (wrapper) {
                    wrapper.style.display = isAIMode ? '' : 'none';
                }
            }
        });
        
        // ✅ CAMPOS COMPARTILHADOS: Destacar quando IA está ativa (são usados em ambos os modos)
        const sharedFields = [
            { id: 'cfgMinOccurrences', label: 'Confiança mínima (%)' }
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

        // ✅ Botão exclusivo do modo padrão (Premium): ocultar no modo Diamante
        const standardSimContainer = document.getElementById('standardSimulationContainer');
        if (standardSimContainer) {
            standardSimContainer.style.display = isAIMode ? 'none' : '';
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
        
        // ✅ CONTROLES DO MODO DIAMANTE: visíveis apenas quando IA estiver ativa
        const diamondLevelsContainer = document.getElementById('diamondLevelsContainer');
        if (diamondLevelsContainer) {
            diamondLevelsContainer.style.display = isAIMode ? '' : 'none';
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
    // FUNÇÃO: Atualizar visual do toggle de modo IA (NOVO - SWITCH)
    // ═══════════════════════════════════════════════════════════════════════════════
    function updateAIModeUI(toggleElement, isActive) {
        // Obter elementos principais
        const aiSwitch = document.getElementById('aiModeToggle');
        const aiLabel = document.getElementById('aiToggleLabel');
        const titleBadge = document.getElementById('titleBadge');
        const header = document.querySelector('.da-header');

        // Toggle Element pode ser passado como argumento ou buscado
        const targetElement = aiSwitch || toggleElement;
        
        if (!targetElement) return;
        
        if (isActive) {
            // ATIVAR MODO IA
            targetElement.classList.add('active');
            
            if (aiLabel) aiLabel.textContent = 'AI ON';
            
            if (titleBadge) {
                titleBadge.textContent = 'Análise por IA';
                titleBadge.classList.add('badge-ia');
            }
            
            // Adicionar classe no header para linha indicadora
            if (header) {
                header.classList.add('ai-active');
                }
        } else {
            // DESATIVAR MODO (Análise Padrão)
            targetElement.classList.remove('active');
            
            if (aiLabel) aiLabel.textContent = 'AI OFF';

            if (titleBadge) {
                titleBadge.textContent = 'Análise Premium';
                titleBadge.classList.remove('badge-ia');
            }
            
            // Remover classe no header
            if (header) {
                header.classList.remove('ai-active');
            }
            
            // Parar updates se houver
            if (intervaloAtualizacaoMemoria) {
                clearInterval(intervaloAtualizacaoMemoria);
                intervaloAtualizacaoMemoria = null;
            }
        }
    }


    // 🧠 Atualizar status da memória ativa na interface (DESATIVADO - Painel removido)
    async function atualizarStatusMemoriaAtiva(elemento) {
        // Função desativada pois o painel de status foi removido da interface
        // Mantida apenas para evitar erros se chamada de outros lugares
            return;
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
    n1WindowSize: 20,
    n1PrimaryRequirement: 15,
    n1SecondaryRequirement: 3,
    n1MaxEntries: 1,
    // N2 (novo): janela base única (W). O código ajusta automaticamente.
    n2Recent: 10,
    n2Previous: 10,
    n3Alternance: 12,
    n3PatternLength: 10,
    // ✅ Rigor do N3 (modo normal): probabilidade mínima global (Entrada+G1) para votar
    n3BaseThresholdPct: 60,
    // ✅ Rigor da janela (janela deslizante): probabilidade mínima (Entrada+G1) considerando a janela anterior
    n3ThresholdPct: 75,
    n3MinOccurrences: 1,
    n3AllowBackoff: false,
    n3IgnoreWhite: false,
    n4Persistence: 2000,
    // ✅ N4: permitir mudar a cor no Gale (G1/G2) quando estiver rodando "somente N4"
    n4DynamicGales: true,
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
    // ✅ Saldo por entrada: valor “pendente” (entrada feita e aguardando resultado), separado por modo.
    // - diamante: pendente do modo Diamante
    // - standard: pendente do modo Premium/Padrão
    pendingExposureByMode: { diamond: 0, standard: 0 },
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
let masterEntriesBackfillLock = false;
let autoBetHistoryUnsubscribe = null;

// ═══════════════════════════════════════════════════════════════
// 👑 SINAIS DE ENTRADA: "Limpar" não deve apagar a aba IA.
// Implementação: cutoff por modo (standard/diamond) para esconder do painel Sinais/Gráfico,
// mantendo o histórico completo em entriesHistory (usado pela aba IA).
// ═══════════════════════════════════════════════════════════════
const MASTER_CLEAR_CUTOFF_KEY = 'masterEntriesClearCutoffByMode';
let masterEntriesClearCutoffByMode = { standard: 0, diamond: 0 };

// ✅ IA: cutoff próprio para o botão "Limpar" da aba IA (não afetar Sinais/Gráfico)
const ENTRIES_CLEAR_CUTOFF_KEY = 'entriesClearCutoffByMode';
let entriesClearCutoffByMode = { standard: 0, diamond: 0 };

function loadMasterEntriesClearCutoff() {
    try {
        chrome.storage.local.get([MASTER_CLEAR_CUTOFF_KEY], (res) => {
            const raw = res && res[MASTER_CLEAR_CUTOFF_KEY] ? res[MASTER_CLEAR_CUTOFF_KEY] : null;
            if (raw && typeof raw === 'object') {
                masterEntriesClearCutoffByMode = {
                    standard: Number(raw.standard) || 0,
                    diamond: Number(raw.diamond) || 0
                };
            }
        });
    } catch (_) {}
}

function loadEntriesClearCutoff() {
    try {
        chrome.storage.local.get([ENTRIES_CLEAR_CUTOFF_KEY], (res) => {
            const raw = res && res[ENTRIES_CLEAR_CUTOFF_KEY] ? res[ENTRIES_CLEAR_CUTOFF_KEY] : null;
            if (raw && typeof raw === 'object') {
                entriesClearCutoffByMode = {
                    standard: Number(raw.standard) || 0,
                    diamond: Number(raw.diamond) || 0
                };
            }
        });
    } catch (_) {}
}

function getMasterEntriesCutoffMs(modeKey) {
    const key = modeKey === 'diamond' ? 'diamond' : 'standard';
    return Number(masterEntriesClearCutoffByMode && masterEntriesClearCutoffByMode[key]) || 0;
}

function getEntriesCutoffMs(modeKey) {
    const key = modeKey === 'diamond' ? 'diamond' : 'standard';
    return Number(entriesClearCutoffByMode && entriesClearCutoffByMode[key]) || 0;
}

function getEntryTimestampMs(entry) {
    try {
        // ✅ IA Bootstrap: manter timestamp real para exibição, mas usar visibleAtTimestamp para cutoff/visibilidade.
        const t = (entry && entry.visibleAtTimestamp != null)
            ? entry.visibleAtTimestamp
            : (entry && entry.timestamp != null ? entry.timestamp : null);
        const ms = (typeof t === 'number') ? t : Date.parse(String(t));
        return Number.isFinite(ms) ? ms : 0;
    } catch (_) {
        return 0;
    }
}

// Carregar cutoff uma vez (best-effort)
loadMasterEntriesClearCutoff();
loadEntriesClearCutoff();

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
// ✅ Painel (saldo) sempre visível — removido toggle "Painel" do header a pedido do usuário
let autoBetSummaryVisible = true;
let analyzerAutoPausedReason = null;
let analyzerConfigSnapshot = null;
let bankProgressTimeout = null;

function applyAutoBetSummaryVisibility() {
    const summary = document.getElementById('autoBetSummary');
    if (summary) {
        // Sempre visível
        summary.classList.remove('hidden');
    }
}

function setAutoBetSummaryVisibility(isVisible, source = 'user') {
    // Toggle removido: manter sempre visível
    autoBetSummaryVisible = true;
    applyAutoBetSummaryVisibility();
}

async function initAutoBetSummaryVisibilityControls() {
    autoBetSummaryVisible = true;
    applyAutoBetSummaryVisibility();
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
    // Suporta:
    // - showToast('Mensagem', 2000)
    // - showToast('Mensagem', 'success'|'error'|'info', 2000)
    function showToast(message, variantOrDuration = 2000, maybeDuration) {
        const text = String(message || '').trim();

        let variant = 'info';
        let duration = 2000;
        if (typeof variantOrDuration === 'number') {
            duration = variantOrDuration;
        } else if (typeof variantOrDuration === 'string') {
            variant = variantOrDuration;
            duration = (typeof maybeDuration === 'number' && Number.isFinite(maybeDuration)) ? maybeDuration : 2000;
        }

        // Remover toast anterior se existir
        const existingToast = document.getElementById('customToast');
        if (existingToast) {
            try { existingToast.remove(); } catch (_) {}
        }

        const toast = document.createElement('div');
        toast.id = 'customToast';
        toast.className = `custom-toast custom-toast-${variant}`;

        const icon = document.createElement('div');
        icon.className = 'custom-toast-icon';
        if (variant === 'success') {
            icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg>`;
        } else if (variant === 'error') {
            icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18"></path><path d="M6 6l12 12"></path></svg>`;
        } else {
            icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 18h.01"></path><path d="M12 14a4 4 0 0 0-4-4"></path><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"></path></svg>`;
        }

        const msg = document.createElement('div');
        msg.className = 'custom-toast-text';
        msg.textContent = text || (variant === 'success' ? 'Confirmado' : variant === 'error' ? 'Erro' : 'Aviso');

        toast.appendChild(icon);
        toast.appendChild(msg);
        document.body.appendChild(toast);

        // Mostrar com animação
        setTimeout(() => toast.classList.add('show'), 10);

        // Remover após duração
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                try { toast.remove(); } catch (_) {}
            }, 300);
        }, duration);
    }
    
    // ========= FEEDBACK GLOBAL DE SALVAR (CENTRO DA TELA) =========
    let saveStatusTimeout = null;
    
    function ensureSaveStatusOverlay() {
        let overlay = document.getElementById('saveStatusOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'saveStatusOverlay';
            overlay.className = 'save-status-overlay';
            overlay.innerHTML = `
                <div class="save-status-bubble">
                    <div class="save-status-spinner" id="saveStatusSpinner"></div>
                    <div class="save-status-check" id="saveStatusCheck" style="display:none;">
                        <div class="save-status-check-icon"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        return overlay;
    }
    
    function showGlobalSaveLoading() {
        const overlay = ensureSaveStatusOverlay();
        const spinner = document.getElementById('saveStatusSpinner');
        const check = document.getElementById('saveStatusCheck');
        if (!overlay || !spinner || !check) return;
        
        if (saveStatusTimeout) {
            clearTimeout(saveStatusTimeout);
            saveStatusTimeout = null;
        }
        
        spinner.style.display = 'block';
        check.style.display = 'none';
        overlay.style.display = 'flex';
    }
    
    function showGlobalSaveSuccess(durationMs = 1500) {
        const overlay = ensureSaveStatusOverlay();
        const spinner = document.getElementById('saveStatusSpinner');
        const check = document.getElementById('saveStatusCheck');
        if (!overlay || !spinner || !check) return;
        
        spinner.style.display = 'none';
        check.style.display = 'flex';
        overlay.style.display = 'flex';
        
        if (saveStatusTimeout) {
            clearTimeout(saveStatusTimeout);
        }
        saveStatusTimeout = setTimeout(() => {
            overlay.style.display = 'none';
            spinner.style.display = 'block';
            check.style.display = 'none';
        }, durationMs);
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
                    <div class="bank-patterns-modal-header modal-header-minimal">
                        <h3>📂 Banco de Padrões (<span id="bankModalPatternsCount">0</span>)</h3>
                        <button class="bank-patterns-modal-close modal-header-close" id="closeBankPatternsModal" type="button">Fechar</button>
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
                    <div class="bank-patterns-modal-header modal-header-minimal">
                        <h3>📊 Ocorrências do Padrão</h3>
                        <button class="bank-patterns-modal-close modal-header-close" id="closePatternDetailsModal" type="button">Fechar</button>
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
            const sidebarEl = document.getElementById('blaze-double-analyzer');
            const isCompactMode = sidebarEl && sidebarEl.classList.contains('compact-mode');

            // ✅ Desregistrar do sistema de janelas flutuantes apenas no modo compacto
            if (isDesktop() && isCompactMode) {
                floatingWindows.unregister('bankPatternsModal');
            }
            modal.style.display = 'none';
        });
        
        overlay.addEventListener('click', () => {
            // ✅ Overlay só fecha em mobile
            if (!isDesktop()) {
                const sidebarEl = document.getElementById('blaze-double-analyzer');
                const isCompactMode = sidebarEl && sidebarEl.classList.contains('compact-mode');
                if (isDesktop() && isCompactMode) {
                    floatingWindows.unregister('bankPatternsModal');
                }
            modal.style.display = 'none';
            }
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
            const sidebarEl = document.getElementById('blaze-double-analyzer');
            const isCompactMode = sidebarEl && sidebarEl.classList.contains('compact-mode');

            // ✅ Desregistrar do sistema de janelas flutuantes apenas no modo compacto
            if (isDesktop() && isCompactMode) {
                floatingWindows.unregister('patternDetailsModal');
            }
            detailsModal.style.display = 'none';
        });
        
        detailsOverlay.addEventListener('click', () => {
            // ✅ Overlay só fecha em mobile
            if (!isDesktop()) {
                const sidebarEl = document.getElementById('blaze-double-analyzer');
                const isCompactMode = sidebarEl && sidebarEl.classList.contains('compact-mode');
                if (isDesktop() && isCompactMode) {
                    floatingWindows.unregister('patternDetailsModal');
                }
            detailsModal.style.display = 'none';
            }
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
                cursor: pointer;
                user-select: none;
                /* ✅ evitar área clicável gigantesca (ex.: label ocupando a linha inteira) */
                flex: 0 0 auto;
                width: auto;
                max-width: 80px;
            }
            
            .diamond-level-switch input[type="checkbox"] {
                appearance: none;
                -webkit-appearance: none;
                width: 44px;
                height: 24px;
                border-radius: 999px;
                background: #3d4859;
                position: relative;
                cursor: pointer;
                border: none;
                outline: none;
                flex-shrink: 0;
                transition: background 0.2s ease;
            }
            
            .diamond-level-switch input[type="checkbox"]::after {
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
            
            .diamond-level-switch input[type="checkbox"]:checked {
                background: #ef4444;
            }
            
            .diamond-level-switch input[type="checkbox"]:checked::after {
                transform: translateX(20px);
                background: #ffffff;
            }
            
            .diamond-level-switch .switch-track {
                display: none;
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
                background: #0f1720; /* mesmo tom das cartas do simulador */
                border: none;
                border-radius: 4px;
                padding: 12px;
            }
            
            .occurrence-timestamp {
                font-size: 11px;
                color: #8da2bb;
                margin-bottom: 8px;
                font-weight: 600;
            }

            .diamond-sim-toolbar {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 12px;
                padding: 0;
                background: transparent;
                border: none;
                border-radius: 0;
            }

            .diamond-sim-level-wrapper {
                position: relative;
            }

            .diamond-sim-dropdown {
                position: absolute;
                top: calc(100% + 6px);
                left: 0;
                width: 260px;
                background: #0f1720;
                border: 1px solid rgba(0, 212, 255, 0.2);
                border-radius: 8px;
                box-shadow: 0 12px 24px rgba(0, 0, 0, 0.45);
                padding: 6px;
                z-index: 10000003;
            }

            .diamond-sim-option {
                padding: 8px 10px;
                font-size: 12px;
                color: #c8d6e9;
                border-radius: 6px;
                cursor: pointer;
                user-select: none;
                background: transparent;
                border: 1px solid transparent;
                width: 100%;
                text-align: left;
            }

            .diamond-sim-option:hover {
                background: rgba(239, 68, 68, 0.16);
                color: #ffffff;
            }

            .diamond-sim-summary {
                font-size: 12px;
                color: #c8d6e9;
                line-height: 1.45;
                margin-bottom: 10px;
            }

            .diamond-sim-progress {
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 12px;
                color: #c8d6e9;
                margin-top: 10px;
                margin-bottom: 10px;
            }

            .diamond-sim-progress .spinner {
                width: 14px;
                height: 14px;
                border: 2px solid rgba(0, 212, 255, 0.25);
                border-top-color: #00ffa3;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }

            .sim-entries-list {
                max-height: 320px;
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
                <div class="custom-pattern-modal-header modal-header-minimal">
                        <h3>Configurar Níveis</h3>
                    <button class="custom-pattern-modal-close modal-header-close" id="closeDiamondLevelsModal" type="button">Fechar</button>
                    </div>
                    <div class="custom-pattern-modal-body">
                        <div class="diamond-sim-toolbar">
                            <button type="button" class="btn-save-pattern" id="diamondSimulateAllBtn">Simular todos</button>
                            <div class="diamond-sim-level-wrapper">
                                <button type="button" class="btn-hot-pattern" id="diamondSimulateLevelBtn">Simular ▾</button>
                                <div class="diamond-sim-dropdown" id="diamondSimulateLevelDropdown" style="display:none;">
                                    <button type="button" class="diamond-sim-option" data-level="N0">N0 - Detector de Branco</button>
                                    <button type="button" class="diamond-sim-option" data-level="N1">N1 - Zona Segura</button>
                                    <button type="button" class="diamond-sim-option" data-level="N2">N2 - Ritmo Autônomo</button>
                                    <button type="button" class="diamond-sim-option" data-level="N3">N3 - Alternância</button>
                                    <button type="button" class="diamond-sim-option" data-level="N4">N4 - Autointeligente</button>
                                    <button type="button" class="diamond-sim-option" data-level="N5">N5 - Ritmo por Giro</button>
                                    <button type="button" class="diamond-sim-option" data-level="N6">N6 - Retração Histórica</button>
                                    <button type="button" class="diamond-sim-option" data-level="N7">N7 - Continuidade Global</button>
                                    <button type="button" class="diamond-sim-option" data-level="N8">N8 - Walk-forward</button>
                                    <button type="button" class="diamond-sim-option" data-level="N9">N9 - Barreira Final</button>
                                    <button type="button" class="diamond-sim-option" data-level="N10">N10 - Calibração Bayesiana</button>
                                </div>
                            </div>
                        </div>
                        <div class="diamond-level-field" data-level="n0">
                            <div class="diamond-level-header">
                                <div class="diamond-level-title">N0 - Detector de Branco</div>
                                <label class="diamond-level-switch checkbox-label">
                                    <input type="checkbox" class="diamond-level-toggle-input" id="diamondLevelToggleN0" checked />
                                    <span class="switch-track"></span>
                                </label>
                            </div>
                            <div class="diamond-level-note">
                                Roda 1000 estratégias em janelas NÃO-sobrepostas para detectar BRANCO com alta confiança. Pode bloquear todos os demais níveis quando a probabilidade é alta.
                            </div>
                            <div class="diamond-level-double">
                                <div>
                                    <span>Histórico analisado (N)</span>
                                    <input type="number" id="diamondN0History" min="500" max="10000" value="2000" />
                                    <span class="diamond-level-subnote">
                                        Recomendado: 2000 giros (mín. 500 • máx. 10000)
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
                                <div class="diamond-level-title">N1 - Zona Segura</div>
                                <label class="diamond-level-switch checkbox-label">
                                    <input type="checkbox" class="diamond-level-toggle-input" id="diamondLevelToggleN1" checked />
                                    <span class="switch-track"></span>
                                </label>
                            </div>
                            <div class="diamond-level-note">
                                Identifica áreas de predominância absoluta. A zona só gera sinal quando a última cor confirma a cor dominante configurada pelos requisitos mínimos.
                            </div>
                            <div class="diamond-level-double">
                                <div>
                                    <span>Janela analisada (giros)</span>
                                    <input type="number" id="diamondN1WindowSize" min="5" max="120" value="20" />
                            <span class="diamond-level-subnote">
                                        Recomendado: 20 giros (mín. 5 • máx. 120)
                                    </span>
                                </div>
                                <div>
                                    <span>Requisito mínimo A</span>
                                    <input type="number" id="diamondN1PrimaryRequirement" min="5" max="120" value="15" />
                                    <span class="diamond-level-subnote">
                                        Dominância mínima exigida para uma cor
                                    </span>
                                </div>
                            </div>
                            <div class="diamond-level-double">
                                <div>
                                    <span>Requisito mínimo B</span>
                                    <input type="number" id="diamondN1SecondaryRequirement" min="1" max="120" value="3" />
                                    <span class="diamond-level-subnote">
                                        Confirmação da cor adversária (ex.: 3 giros)
                                    </span>
                                </div>
                                <div>
                                    <span>Entradas consecutivas</span>
                                    <input type="number" id="diamondN1MaxEntries" min="1" max="10" value="1" />
                                    <span class="diamond-level-subnote">
                                        Quantas entradas realizar enquanto a zona estiver ativa.
                                    </span>
                                </div>
                            </div>
                            <div class="diamond-level-subnote">
                                Sinal só ocorre quando a última cor da janela confirma a dominante.
                            </div>
                            <span class="diamond-level-subnote">
                                Exemplo: Janela 20 • mín A 15 • mín B 3 → dominância absoluta e confirmação pela última cor.
                            </span>
                        </div>
                        <div class="diamond-level-field" data-level="n2">
                            <div class="diamond-level-header">
                                <div class="diamond-level-title">N2 - Ritmo Autônomo</div>
                                <label class="diamond-level-switch checkbox-label">
                                    <input type="checkbox" class="diamond-level-toggle-input" id="diamondLevelToggleN2" checked />
                                    <span class="switch-track"></span>
                                </label>
                            </div>
                            <div class="diamond-level-note">
                                Detecta o <strong>ritmo real do momento</strong> (duplas e sequências). Você define apenas uma <strong>janela base (W)</strong> e o N2 ajusta sozinho quando “encolhe/expande” e quando entra.
                            </div>
                            <div class="diamond-level-double">
                                <div>
                                    <span>Janela base W (giros)</span>
                                    <input type="number" id="diamondN2Recent" min="6" max="200" value="10" />
                                    <span class="diamond-level-subnote">
                                        Recomendado: 10 (o N2 ajusta automaticamente para menos/mais conforme o contexto)
                                    </span>
                                </div>
                                </div>
                            <div class="diamond-level-subnote">
                                Branco <strong>quebra</strong> apenas quando interrompe uma cor “sozinha” (ex.: <strong>R W</strong> ou <strong>B W</strong>). Em <strong>RR W RR</strong> ele é só separador. O N2 usa base histórica de ocorrências e evita entrada no “topo” da sequência.
                            </div>
                        </div>
                        <div class="diamond-level-field" data-level="n3">
                            <div class="diamond-level-header">
                                <div class="diamond-level-title">N3 - Alternância (janela)</div>
                                <label class="diamond-level-switch checkbox-label">
                                    <input type="checkbox" class="diamond-level-toggle-input" id="diamondLevelToggleN3" checked />
                                    <span class="switch-track"></span>
                                </label>
                            </div>
                            <div class="diamond-level-note">
                                Detecta alternância real (simples/dupla/tripla). O branco quebra a alternância.
                            </div>
                            <div class="diamond-level-double">
                                <div>
                                    <span>Janela anterior (giros)</span>
                                    <input type="number" id="diamondN3PatternLength" min="1" max="200" value="10" />
                                    <span class="diamond-level-subnote">
                                        Giros ANTES da alternância (não inclui os giros da formação). Ex.: em <strong>RR BB</strong>, analisa os giros anteriores ao <strong>RR</strong>.
                                    </span>
                            </div>
                <div>
                    <span>Histórico analisado (giros)</span>
                                    <input type="number" id="diamondN3Alternance" min="4" max="400" value="12" />
                            <span class="diamond-level-subnote">
                                        Recomendado: 50-80 giros (mín. 4)
                            </span>
                                </div>
            </div>
            <div class="diamond-level-double">
                <div>
                    <span>Rigor do N3 (%)</span>
                    <input type="number" id="diamondN3BaseThresholdPct" min="50" max="95" value="60" />
                    <span class="diamond-level-subnote">
                        Probabilidade mínima global (Entrada + G1) no histórico analisado, para o N3 votar
                    </span>
                </div>
                <div>
                    <span>Rigor da janela (%)</span>
                    <input type="number" id="diamondN3ThresholdPct" min="50" max="95" value="75" />
                    <span class="diamond-level-subnote">
                        Probabilidade mínima (Entrada + G1) usando a janela anterior (janela deslizante)
                    </span>
                </div>
            </div>
            <div class="diamond-level-double">
                <div>
                    <span>Ocorrências mínimas (janela)</span>
                    <input type="number" id="diamondN3MinOccurrences" min="1" max="50" value="1" />
                    <span class="diamond-level-subnote">
                        A janela anterior precisa aparecer pelo menos N vezes (para validar a janela)
                    </span>
                </div>
                <div>
                    <label class="checkbox-label" style="margin-top: 18px;">
                <input type="checkbox" id="diamondN3AllowBackoff" />
                Permitir backoff (tentar padrões menores quando faltar histórico)
            </label>
            <div class="diamond-level-subnote" style="margin-top: 6px;">
                Observação: branco sempre quebra a alternância (não é considerado dentro do padrão).
                    </div>
                </div>
            </div>
                        </div>
                        <div class="diamond-level-field" data-level="n4">
                            <div class="diamond-level-header">
                                <div class="diamond-level-title">N4 - Autointeligente (histórico)</div>
                                <label class="diamond-level-switch checkbox-label">
                                    <input type="checkbox" class="diamond-level-toggle-input" id="diamondLevelToggleN4" checked />
                                    <span class="switch-track"></span>
                                </label>
                            </div>
                            <div class="diamond-level-note">
                                Aprende do histórico cru (n-grams adaptativos) e decide RED/BLACK/WHITE ou NULO. Histórico maior = mais contexto; menor = mais sensível ao momento.
                            </div>
                            <input type="number" id="diamondN4Persistence" min="10" max="10000" value="2000" />
                            <span class="diamond-level-subnote">
                                Recomendado: 2000 giros (mín. 10 • máx. 10000)
                            </span>
                            <label class="checkbox-label" style="margin-top: 10px;">
                                <input type="checkbox" id="diamondN4DynamicGales" checked />
                                Permitir mudar a cor no Gale (G1/G2)
                            </label>
                            <div class="diamond-level-subnote" style="margin-top: 6px;">
                                Se desativado, mantém a cor da <b>entrada inicial</b> até o final do ciclo (G1/G2 não mudam a cor).
                            </div>
                        </div>
                        <div class="diamond-level-field" data-level="n5">
                            <div class="diamond-level-header">
                                <div class="diamond-level-title">N5 - Ritmo por Giro (amostras)</div>
                                <label class="diamond-level-switch checkbox-label">
                                    <input type="checkbox" class="diamond-level-toggle-input" id="diamondLevelToggleN5" checked />
                                    <span class="switch-track"></span>
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
                                <label class="diamond-level-switch checkbox-label">
                                    <input type="checkbox" class="diamond-level-toggle-input" id="diamondLevelToggleN6" checked />
                                    <span class="switch-track"></span>
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
                                <label class="diamond-level-switch checkbox-label">
                                    <input type="checkbox" class="diamond-level-toggle-input" id="diamondLevelToggleN7" checked />
                                    <span class="switch-track"></span>
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
                                <label class="diamond-level-switch checkbox-label">
                                    <input type="checkbox" class="diamond-level-toggle-input" id="diamondLevelToggleN8" checked />
                                    <span class="switch-track"></span>
                                </label>
                            </div>
                            <div class="diamond-level-note">
                                Testa diversas estratégias em janelas NÃO-sobrepostas para escolher a melhor combinação e aplicar na janela mais recente, sem olhar o futuro.
                            </div>
                            <div class="diamond-level-double">
                                <div>
                                    <span>Histórico base (giros)</span>
                                    <input type="number" id="diamondN10History" min="100" max="10000" value="500" />
                                    <span class="diamond-level-subnote">
                                        Total de giros usados no walk-forward (ex.: 500, 1000, 2000, 5000, 10000)
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
                                <label class="diamond-level-switch checkbox-label">
                                    <input type="checkbox" class="diamond-level-toggle-input" id="diamondLevelToggleN9" checked />
                                    <span class="switch-track"></span>
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
                                <label class="diamond-level-switch checkbox-label">
                                    <input type="checkbox" class="diamond-level-toggle-input" id="diamondLevelToggleN10" checked />
                                    <span class="switch-track"></span>
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
                        <button class="btn-hot-pattern" id="diamondLevelsRestoreBtn" type="button" title="Restaura as configurações que estavam antes de você abrir este modal">Restaurar configurações</button>
                        <button class="btn-hot-pattern" id="diamondLevelsSaveBtn" type="button">Salvar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const modal = document.getElementById('diamondLevelsModal');
        const closeBtn = document.getElementById('closeDiamondLevelsModal');
        const overlay = modal.querySelector('.custom-pattern-modal-overlay');
        
        const closeModal = async () => {
            const sidebarEl = document.getElementById('blaze-double-analyzer');
            const isCompactMode = sidebarEl && sidebarEl.classList.contains('compact-mode');

            // ✅ Se existir "Padrão da Entrada" aberto, fechar antes de sair
            try { closeEntryPatternModalIfOpen(); } catch (_) {}

            // ✅ Se estiver saindo a partir da simulação, persistir ajustes automaticamente
            try {
                const isSimActive = modal.classList.contains('diamond-sim-active');
                if (isSimActive) {
                    await saveDiamondLevels({ silent: true, skipSync: true });
                }
            } catch (_) {}

            // ✅ Se estiver na tela de simulação, limpar e voltar para a tela normal
            try {
                exitDiamondSimulationView({ cancelIfRunning: true, clear: true, closeModal: false });
            } catch (_) {}

            // ✅ Desregistrar do sistema de janelas flutuantes apenas no modo compacto
            if (isDesktop() && isCompactMode) {
                floatingWindows.unregister('diamondLevelsModal');
            }
            modal.style.display = 'none';
        };
        
        closeBtn.addEventListener('click', () => { closeModal(); });
        
        // ✅ Overlay só fecha em mobile
        overlay.addEventListener('click', () => {
            if (!isDesktop()) {
                closeModal();
            }
        });
        
        initializeDiamondLevelToggles();
        ensureDiamondSimulationView();
        initializeDiamondSimulationControls();
        initDiamondLevelsAccordion();
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // ⚙️ SIMULAÇÃO (PASSADO) - MODO PADRÃO / ANÁLISE PREMIUM
    //  - UI igual ao simulador Diamante, mas roda o verificador de padrões salvos (modo padrão)
    //  - Sem "Simular todos" (existe apenas um modo)
    // ═══════════════════════════════════════════════════════════════════════════════

    let standardSimulationJobId = null;
    let standardSimulationRunning = false;
    let standardOptimizationJobId = null;
    let standardOptimizationRunning = false;
    let standardSimBusyKind = null; // 'simulate' | 'optimize' | null
    let standardSimPeriodPreset = '12h';
    let standardSimHistoryLimit = 1440;
    let standardSimHistoryLimitRaw = 1440;
    let standardSimHasResults = false;
    let standardSimActiveTab = 'signals';
    let standardSimMovedNodes = [];
    let standardSimResizeHandler = null;
    let standardSimWasFittedToCompactSidebar = false;

    function fitStandardSimModalToCompactSidebar(modal) {
        try {
            if (!modal) return;
            const sidebarEl = document.getElementById('blaze-double-analyzer');
            const isCompactMode = sidebarEl && sidebarEl.classList.contains('compact-mode');
            const isDesktopEnv = typeof isDesktop === 'function' ? isDesktop() : (window.innerWidth > 768);
            if (!isDesktopEnv || !isCompactMode || !sidebarEl) return;
            if (sidebarEl.classList.contains('fullscreen-mode')) return;

            const content = modal.querySelector('.custom-pattern-modal-content');
            if (!content) return;

            const rect = sidebarEl.getBoundingClientRect();
            content.style.position = 'fixed';
            content.style.left = `${rect.left}px`;
            content.style.top = `${rect.top}px`;
            content.style.width = `${rect.width}px`;
            content.style.height = `${rect.height}px`;
            content.style.maxWidth = 'none';
            content.style.maxHeight = 'none';
            content.style.transform = 'none';
            content.style.margin = '0';
            content.style.borderRadius = '0';
            content.style.zIndex = '1000002';

            standardSimWasFittedToCompactSidebar = true;
        } catch (_) {}
    }

    function resetStandardSimModalSizing(modal) {
        try {
            if (!modal) return;
            const content = modal.querySelector('.custom-pattern-modal-content');
            if (!content) return;
            if (!standardSimWasFittedToCompactSidebar) return;

            content.style.left = '';
            content.style.top = '';
            content.style.width = '';
            content.style.height = '';
            content.style.maxWidth = '';
            content.style.maxHeight = '';
            content.style.transform = '';
            content.style.margin = '';
            content.style.position = '';
            content.style.borderRadius = '';
            content.style.zIndex = '';
        } catch (_) {}
        standardSimWasFittedToCompactSidebar = false;
    }

    function createStandardSimulationModal() {
        if (document.getElementById('standardSimulationModal')) return;
        const modalHTML = `
            <div id="standardSimulationModal" class="custom-pattern-modal" style="display: none;">
                <div class="custom-pattern-modal-overlay"></div>
                <div class="custom-pattern-modal-content">
                    <div class="custom-pattern-modal-header modal-header-minimal">
                        <h3>Simulação</h3>
                        <button class="custom-pattern-modal-close" id="closeStandardSimulationModal" type="button">Fechar</button>
                    </div>
                    <div class="custom-pattern-modal-body">
                        <div id="standardSimPeriodContainer" class="diamond-sim-period"></div>
                        <div class="standard-sim-config-wrap">
                            <div class="diamond-sim-period-title" style="margin-top: 10px;">Configurações (Análise Premium)</div>
                            <div id="standardSimConfigContainer" class="settings-grid"></div>
                        </div>
                        <div class="diamond-sim-view-body">
                            <div id="standardSimulationSummary" class="diamond-sim-summary">
                                Selecione o período e clique em <strong>Simular</strong> para ver o resultado aqui.
                            </div>
                            <div id="standardSimulationProgress" class="diamond-sim-progress" style="display:none;">
                                <div class="spinner"></div>
                                <div id="standardSimulationProgressText">Simulando...</div>
                                <div style="flex:1;"></div>
                                <button type="button" class="btn-save-pattern" id="standardSimulationCancelBtn" style="max-width: 140px;">Cancelar</button>
                            </div>

                            <div class="entries-tabs-bar" id="standardSimTabs" style="margin-top: 8px;" hidden>
                                <button type="button" class="entries-tab active" data-tab="signals">IA</button>
                                <button type="button" class="entries-tab" data-tab="chart">Gráfico</button>
                            </div>

                            <div class="diamond-sim-tabview" data-view="signals" hidden>
                                <div class="entries-header" style="margin-top: 8px;">
                                    <div id="standardSimEntriesHit" class="entries-hit"></div>
                                </div>
                                <div id="standardSimEntriesList" class="entries-list sim-entries-list"></div>
                            </div>

                            <div class="diamond-sim-tabview" data-view="chart" hidden>
                                <div class="diamond-sim-chart-wrap">
                                    <div class="diamond-sim-chart-row win">
                                        <div class="diamond-sim-chart-label">WIN</div>
                                        <div class="diamond-sim-chart-bar">
                                            <div class="diamond-sim-chart-fill" id="standardSimChartWinFill" style="width:0%"></div>
                                        </div>
                                        <div class="diamond-sim-chart-value" id="standardSimChartWinValue">0 (0%)</div>
                                    </div>
                                    <div class="diamond-sim-chart-row loss">
                                        <div class="diamond-sim-chart-label">LOSS</div>
                                        <div class="diamond-sim-chart-bar">
                                            <div class="diamond-sim-chart-fill" id="standardSimChartLossFill" style="width:0%"></div>
                                        </div>
                                        <div class="diamond-sim-chart-value" id="standardSimChartLossValue">0 (0%)</div>
                                    </div>
                                    <div class="diamond-sim-chart-foot" id="standardSimChartFoot">Entradas: 0</div>

                                    <div class="diamond-sim-equity-metrics">
                                        <div class="diamond-sim-equity-metric">
                                            <span class="label">Saldo</span>
                                            <span class="value" id="standardSimEquityBalance">R$ 0,00</span>
                                        </div>
                                        <div class="diamond-sim-equity-metric">
                                            <span class="label">Perdas</span>
                                            <span class="value" id="standardSimEquityLoss">R$ 0,00</span>
                                        </div>
                                    </div>

                                    <div class="diamond-sim-ticks-layer" id="standardSimTicksLayer">
                                        <svg class="diamond-sim-ticks-svg" id="standardSimTicksSvg" viewBox="0 0 1000 160" preserveAspectRatio="none" aria-label="Gráfico por entrada">
                                            <path id="standardSimTicksBaseline" d="" />
                                            <path id="standardSimTicksMaxLine" d="" />
                                            <path id="standardSimTicksMinLine" d="" />
                                            <path id="standardSimTicksCurrentLine" d="" />
                                            <path id="standardSimTicksWinPath" d="" />
                                            <path id="standardSimTicksLossPath" d="" />
                                        </svg>
                                        <div class="diamond-sim-guide-label max" id="standardSimGuideMax"></div>
                                        <div class="diamond-sim-guide-label min" id="standardSimGuideMin"></div>
                                        <div class="diamond-sim-guide-label cur" id="standardSimGuideCur"></div>
                                        <div class="diamond-sim-direction" id="standardSimGuideDir"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="custom-pattern-modal-footer standard-sim-footer">
                        <button type="button" class="btn-hot-pattern" id="standardSimulationClearBtn">Limpar</button>
                        <button type="button" class="btn-hot-pattern" id="standardSimulationOptimizeBtn">Otimizar (100)</button>
                        <button type="button" class="btn-save-pattern" id="standardSimulationRunBtn">Simular</button>
                        <button type="button" class="btn-hot-pattern" id="standardSimulationSaveCloseBtn" title="Salva as configurações e fecha a simulação">Salvar e fechar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const modal = document.getElementById('standardSimulationModal');
        const overlay = modal.querySelector('.custom-pattern-modal-overlay');
        const closeBtn = document.getElementById('closeStandardSimulationModal');
        const saveCloseBtn = document.getElementById('standardSimulationSaveCloseBtn');

        const restoreStandardSimMovedNodes = () => {
            if (!Array.isArray(standardSimMovedNodes) || standardSimMovedNodes.length === 0) return;
            // restaurar em ordem reversa para manter posições estáveis
            const toRestore = standardSimMovedNodes.slice().reverse();
            standardSimMovedNodes = [];
            toRestore.forEach(({ node, parent, nextSibling }) => {
                try {
                    if (!node || !parent) return;
                    if (nextSibling && nextSibling.parentNode === parent) parent.insertBefore(node, nextSibling);
                    else parent.appendChild(node);
                } catch (_) {}
            });
        };

        const moveStandardConfigFieldsIntoModal = () => {
            const container = document.getElementById('standardSimConfigContainer');
            if (!container) return;
            // já movido
            if (container.dataset.moved === '1') return;

            // IDs do modo padrão (Análise Premium)
            const ids = [
                'cfgHistoryDepth',
                'cfgMinOccurrences',
                'cfgMaxOccurrences',
                'cfgPatternInterval',
                'cfgMinPatternSize',
                'cfgMaxPatternSize',
                'cfgWinPercentOthers',
                'cfgRequireTrigger'
            ];

            const moved = [];
            ids.forEach((id) => {
                const input = document.getElementById(id);
                if (!input) return;
                const item = input.closest ? input.closest('.setting-item') : null;
                if (!item) return;
                const parent = item.parentNode;
                if (!parent) return;
                // evitar mover novamente se já está no container
                if (item.parentNode === container) return;
                moved.push({ node: item, parent, nextSibling: item.nextSibling });
            });

            // mover na ordem original (conforme ids)
            moved.forEach(({ node }) => container.appendChild(node));
            if (moved.length) {
                standardSimMovedNodes = moved;
                container.dataset.moved = '1';
            }
        };

        const closeModal = () => {
            try { closeEntryPatternModalIfOpen(); } catch (_) {}
            try { clearStandardSimulationResultsOnly({ cancelIfRunning: true }); } catch (_) {}
            try { restoreStandardSimMovedNodes(); } catch (_) {}
            try {
                const container = document.getElementById('standardSimConfigContainer');
                if (container) container.dataset.moved = '0';
            } catch (_) {}
            try {
                if (standardSimResizeHandler) {
                    window.removeEventListener('resize', standardSimResizeHandler);
                    standardSimResizeHandler = null;
                }
            } catch (_) {}
            try { resetStandardSimModalSizing(modal); } catch (_) {}
            modal.style.display = 'none';
        };

        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (saveCloseBtn && !saveCloseBtn.dataset.listenerAttached) {
            saveCloseBtn.addEventListener('click', async () => {
                try {
                    await saveSettings();
                } catch (_) {}
                closeModal();
            });
            saveCloseBtn.dataset.listenerAttached = '1';
        }
        if (overlay) {
            overlay.addEventListener('click', () => {
                if (!isDesktop()) closeModal();
            });
        }

        const tabsBar = document.getElementById('standardSimTabs');
        if (tabsBar && !tabsBar.dataset.listenerAttached) {
            tabsBar.addEventListener('click', (event) => {
                const btn = event.target && event.target.closest ? event.target.closest('.entries-tab') : null;
                if (!btn) return;
                const tab = btn.dataset.tab;
                setStandardSimActiveTab(tab);
            });
            tabsBar.dataset.listenerAttached = '1';
        }

        const clearBtn = document.getElementById('standardSimulationClearBtn');
        const optimizeBtn = document.getElementById('standardSimulationOptimizeBtn');
        const runBtn = document.getElementById('standardSimulationRunBtn');
        const cancelBtn = document.getElementById('standardSimulationCancelBtn');

        if (clearBtn && !clearBtn.dataset.listenerAttached) {
            clearBtn.addEventListener('click', () => clearStandardSimulationResultsOnly({ cancelIfRunning: true }));
            clearBtn.dataset.listenerAttached = '1';
        }
        if (runBtn && !runBtn.dataset.listenerAttached) {
            runBtn.addEventListener('click', () => startStandardSimulation());
            runBtn.dataset.listenerAttached = '1';
        }
        if (optimizeBtn && !optimizeBtn.dataset.listenerAttached) {
            optimizeBtn.addEventListener('click', () => startStandardOptimization());
            optimizeBtn.dataset.listenerAttached = '1';
        }
        if (cancelBtn && !cancelBtn.dataset.listenerAttached) {
            cancelBtn.addEventListener('click', () => {
                try {
                    if (standardOptimizationRunning && standardOptimizationJobId) {
                        chrome.runtime.sendMessage({ action: 'STANDARD_OPTIMIZE_CANCEL', jobId: standardOptimizationJobId });
                        return;
                    }
                    if (standardSimulationJobId) {
                        chrome.runtime.sendMessage({ action: 'STANDARD_SIMULATE_CANCEL', jobId: standardSimulationJobId });
                    }
                } catch (err) {
                    console.warn('⚠️ Falha ao cancelar simulação padrão:', err);
                }
            });
            cancelBtn.dataset.listenerAttached = '1';
        }
    }

    function openStandardSimulationModal() {
        createStandardSimulationModal();
        const modal = document.getElementById('standardSimulationModal');
        if (!modal) return;

        // 🖥️ Desktop (Dashboard novo): modal acoplado no workspace (lado direito)
        dockModalToDesktopWorkspace(modal);
        modal.style.display = 'flex';

        // ✅ Desktop + modo compacto: abrir no exato tamanho do painel compactado (sem modal “menorzinho”)
        fitStandardSimModalToCompactSidebar(modal);
        if (!standardSimResizeHandler) {
            standardSimResizeHandler = () => {
                fitStandardSimModalToCompactSidebar(modal);
            };
            window.addEventListener('resize', standardSimResizeHandler);
        }

        // mover os campos do modo padrão pra dentro do modal (igual ao fluxo do Diamante)
        try {
            const container = document.getElementById('standardSimConfigContainer');
            if (container) container.dataset.moved = '0';
        } catch (_) {}
        try {
            // função está no escopo de createStandardSimulationModal, então reexecutamos via recriação segura:
            // se o modal já existe, chamamos a função local pelo evento de abertura (fallback via dispatch)
            // Aqui fazemos direto: os elementos já existem e podem ser movidos novamente se necessário.
            const container = document.getElementById('standardSimConfigContainer');
            if (container && container.dataset.moved !== '1') {
                // duplicar a lógica local (sem depender de closures)
                const ids = [
                    'cfgHistoryDepth',
                    'cfgMinOccurrences',
                    'cfgMaxOccurrences',
                    'cfgPatternInterval',
                    'cfgMinPatternSize',
                    'cfgMaxPatternSize',
                    'cfgWinPercentOthers',
                    'cfgRequireTrigger'
                ];
                const moved = [];
                ids.forEach((id) => {
                    const input = document.getElementById(id);
                    if (!input) return;
                    const item = input.closest ? input.closest('.setting-item') : null;
                    if (!item) return;
                    const parent = item.parentNode;
                    if (!parent) return;
                    if (item.parentNode === container) return;
                    moved.push({ node: item, parent, nextSibling: item.nextSibling });
                });
                moved.forEach(({ node }) => container.appendChild(node));
                if (moved.length) {
                    standardSimMovedNodes = moved;
                    container.dataset.moved = '1';
                }
            }
        } catch (_) {}

        standardSimHasResults = false;
        setStandardSimResultsVisible(false);
        setStandardSimActiveTab('signals');
        standardSimPeriodPreset = '12h';
        standardSimHistoryLimit = 1440;
        standardSimHistoryLimitRaw = 1440;
        renderStandardSimPeriodSelector();
        setStandardSimPeriodPreset('12h');
        clearStandardSimulationResultsOnly({ cancelIfRunning: true });
        updateStandardSimPreRunSummary();
    }

    function setStandardSimResultsVisible(visible) {
        const tabs = document.getElementById('standardSimTabs');
        const signalsView = document.querySelector('#standardSimulationModal .diamond-sim-tabview[data-view="signals"]');
        const chartView = document.querySelector('#standardSimulationModal .diamond-sim-tabview[data-view="chart"]');
        if (!visible) {
            if (tabs) tabs.hidden = true;
            if (signalsView) signalsView.hidden = true;
            if (chartView) chartView.hidden = true;
            return;
        }
        if (tabs) tabs.hidden = false;
        setStandardSimActiveTab(standardSimActiveTab || 'signals');
    }

    function setStandardSimActiveTab(tab) {
        standardSimActiveTab = tab || 'signals';
        const tabsBar = document.getElementById('standardSimTabs');
        if (tabsBar) {
            const tabs = tabsBar.querySelectorAll('.entries-tab');
            tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        }
        const views = document.querySelectorAll('#standardSimulationModal .diamond-sim-tabview');
        views.forEach(v => {
            const isActive = v.getAttribute('data-view') === tab;
            if (isActive) v.removeAttribute('hidden');
            else v.setAttribute('hidden', '');
        });
    }

    function setStandardSimulationLoading(isLoading, text = 'Simulando...', kind = 'simulate') {
        const k = kind === 'optimize' ? 'optimize' : 'simulate';
        standardSimBusyKind = isLoading ? k : null;
        standardSimulationRunning = isLoading ? (k === 'simulate') : false;
        standardOptimizationRunning = isLoading ? (k === 'optimize') : false;

        const progress = document.getElementById('standardSimulationProgress');
        const progressText = document.getElementById('standardSimulationProgressText');
        if (progress) progress.style.display = isLoading ? 'flex' : 'none';
        if (progressText) progressText.textContent = text;

        const runBtn = document.getElementById('standardSimulationRunBtn');
        const optimizeBtn = document.getElementById('standardSimulationOptimizeBtn');
        const clearBtn = document.getElementById('standardSimulationClearBtn');
        if (runBtn) runBtn.disabled = isLoading;
        if (optimizeBtn) optimizeBtn.disabled = isLoading;
        if (clearBtn) clearBtn.disabled = isLoading;
    }

    function updateStandardSimulationProgress(data) {
        if (!standardSimulationRunning) return;
        if (data && data.jobId && standardSimulationJobId && data.jobId !== standardSimulationJobId) return;
        const processed = Number(data && data.processed) || 0;
        const total = Number(data && data.total) || 0;
        const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
        setStandardSimulationLoading(true, `Simulando... ${processed}/${total} (${pct}%)`, 'simulate');
    }

    function updateStandardOptimizationProgress(data) {
        if (!standardOptimizationRunning) return;
        if (data && data.jobId && standardOptimizationJobId && data.jobId !== standardOptimizationJobId) return;
        const trial = Number(data && data.trial) || 0;
        const total = Number(data && data.totalTrials) || 0;
        const pct = total > 0 ? Math.min(100, Math.round((trial / total) * 100)) : 0;
        const best = data && data.best ? data.best : null;
        const minPct = Number(data && data.minPct) || 95;
        const recommendedFound = !!(data && data.recommendedFound);
        const bestText = best
            ? (recommendedFound
                ? ` • melhor≥${minPct}%: ${Number(best.pct || 0).toFixed(1)}% (${best.totalCycles || 0} ciclos)`
                : ` • melhor: ${Number(best.pct || 0).toFixed(1)}% (<${minPct}%)`)
            : '';
        setStandardSimulationLoading(true, `Otimizando... ${trial}/${total} (${pct}%)${bestText}`, 'optimize');
    }

    function updateStandardSimPreRunSummary() {
        const summary = document.getElementById('standardSimulationSummary');
        if (!summary) return;
        const preset = DIAMOND_SIM_PERIOD_PRESETS.find(p => p.id === standardSimPeriodPreset) || null;
        const spins = preset ? preset.spins : (standardSimHistoryLimitRaw ?? standardSimHistoryLimit);
        const approx = spins ? formatApproxHoursFromSpins(spins) : '—';
        const periodLabel = preset ? (preset.id === '10k' ? approx : preset.label) : 'Personalizado';
        summary.innerHTML =
            `Selecione o período e clique em <strong>Simular</strong>.<br>` +
            `Período: <strong>${periodLabel}</strong> • Giros: <strong>${spins || '—'}</strong> • Tempo: <strong>${approx}</strong>`;
    }

    function setStandardSimPeriodPreset(presetId, { updateSummary = true } = {}) {
        const preset = DIAMOND_SIM_PERIOD_PRESETS.find(p => p.id === presetId) || DIAMOND_SIM_PERIOD_PRESETS[3];
        standardSimPeriodPreset = preset.id;
        standardSimHistoryLimit = preset.spins;
        standardSimHistoryLimitRaw = preset.spins;

        const container = document.getElementById('standardSimPeriodContainer');
        if (container) {
            const btns = container.querySelectorAll('.diamond-sim-period-option');
            btns.forEach(btn => btn.classList.toggle('active', btn.dataset.preset === standardSimPeriodPreset));
        }
        const customInput = document.getElementById('standardSimCustomSpinsInput');
        if (customInput) customInput.value = String(standardSimHistoryLimit);
        if (updateSummary) updateStandardSimPreRunSummary();
    }

    function setStandardSimCustomHistoryLimit(spins, { updateSummary = true, syncInput = false } = {}) {
        const clamped = clampDiamondSimHistoryLimit(spins);
        if (clamped == null) return;
        standardSimPeriodPreset = 'custom';
        standardSimHistoryLimit = clamped;
        standardSimHistoryLimitRaw = clamped;

        const container = document.getElementById('standardSimPeriodContainer');
        if (container) {
            const btns = container.querySelectorAll('.diamond-sim-period-option');
            btns.forEach(btn => btn.classList.remove('active'));
        }
        const customInput = document.getElementById('standardSimCustomSpinsInput');
        if (syncInput && customInput) customInput.value = String(standardSimHistoryLimit);
        if (updateSummary) updateStandardSimPreRunSummary();
    }

    function renderStandardSimPeriodSelector() {
        const container = document.getElementById('standardSimPeriodContainer');
        if (!container) return;
        const optionsHtml = DIAMOND_SIM_PERIOD_PRESETS.map(p => {
            const approx = formatApproxHoursFromSpins(p.spins);
            const displayText = p.id === '10k' ? `${approx}` : `${p.label}`;
            const title = p.id === '10k'
                ? `Banco completo: ${p.spins} giros • ${approx}`
                : `${p.spins} giros • ${approx}`;
            return `<button type="button" class="diamond-sim-period-option" data-preset="${p.id}" title="${title}">${displayText}</button>`;
        }).join('');

        container.innerHTML = `
            <div class="diamond-sim-period-title">Período da simulação</div>
            <div class="diamond-sim-period-options">${optionsHtml}</div>
            <div class="diamond-sim-custom-row">
                <div class="diamond-sim-custom-label">Giros (personalizado)</div>
                <input id="standardSimCustomSpinsInput" class="diamond-sim-custom-input" type="number" inputmode="numeric" min="10" max="10000" step="1" />
                <div class="diamond-sim-custom-suffix">máx 10.000</div>
            </div>
            <div class="diamond-sim-period-note">Estimativa: ${DIAMOND_SIM_SPINS_PER_MINUTE} giros/min</div>
        `;

        if (!container.dataset.listenerAttached) {
            container.addEventListener('click', (event) => {
                const btn = event.target && event.target.closest ? event.target.closest('.diamond-sim-period-option') : null;
                if (!btn) return;
                const preset = btn.dataset.preset;
                setStandardSimPeriodPreset(preset);
            });
            container.dataset.listenerAttached = '1';
        }

        const customInput = document.getElementById('standardSimCustomSpinsInput');
        if (customInput && !customInput.dataset.listenerAttached) {
            customInput.value = String(standardSimHistoryLimit);
            customInput.addEventListener('input', () => {
                const raw = String(customInput.value || '');
                standardSimPeriodPreset = 'custom';
                if (!raw) {
                    standardSimHistoryLimitRaw = null;
                    updateStandardSimPreRunSummary();
                    return;
                }
                const numeric = Number(raw);
                if (!Number.isFinite(numeric)) return;
                standardSimHistoryLimitRaw = Math.floor(numeric);
                updateStandardSimPreRunSummary();
            });
            customInput.addEventListener('blur', () => {
                const raw = String(customInput.value || '').trim();
                const clamped = clampDiamondSimHistoryLimit(raw);
                if (clamped == null) {
                    setStandardSimPeriodPreset('12h');
                    return;
                }
                setStandardSimCustomHistoryLimit(clamped, { syncInput: true });
            });
            customInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    customInput.blur();
                }
            });
            customInput.dataset.listenerAttached = '1';
        }
    }

    function clearStandardSimulationResultsOnly({ cancelIfRunning = false } = {}) {
        if (cancelIfRunning && standardSimulationRunning && standardSimulationJobId) {
            try { chrome.runtime.sendMessage({ action: 'STANDARD_SIMULATE_CANCEL', jobId: standardSimulationJobId }); } catch (_) {}
        }
        if (cancelIfRunning && standardOptimizationRunning && standardOptimizationJobId) {
            try { chrome.runtime.sendMessage({ action: 'STANDARD_OPTIMIZE_CANCEL', jobId: standardOptimizationJobId }); } catch (_) {}
        }
        standardSimulationJobId = null;
        standardSimulationRunning = false;
        standardOptimizationJobId = null;
        standardOptimizationRunning = false;
        standardSimBusyKind = null;

        const summary = document.getElementById('standardSimulationSummary');
        const list = document.getElementById('standardSimEntriesList');
        const hitEl = document.getElementById('standardSimEntriesHit');
        const progress = document.getElementById('standardSimulationProgress');
        const progressText = document.getElementById('standardSimulationProgressText');
        if (summary) summary.innerHTML = 'Selecione o período e clique em <strong>Simular</strong> para ver o resultado aqui.';
        if (list) list.innerHTML = '';
        if (hitEl) hitEl.innerHTML = '';
        if (progress) progress.style.display = 'none';
        if (progressText) progressText.textContent = 'Simulando...';

        renderStandardSimulationChart({ wins: 0, losses: 0, totalCycles: 0, totalEntries: 0 });
        renderStandardSimulationTickChart([]);
        setStandardSimActiveTab('signals');
        standardSimHasResults = false;
        setStandardSimResultsVisible(false);
    }

    function renderStandardSimulationChart({ wins = 0, losses = 0, totalCycles = 0, totalEntries = 0 } = {}) {
        const winFill = document.getElementById('standardSimChartWinFill');
        const lossFill = document.getElementById('standardSimChartLossFill');
        const winValue = document.getElementById('standardSimChartWinValue');
        const lossValue = document.getElementById('standardSimChartLossValue');
        const foot = document.getElementById('standardSimChartFoot');
        const denom = totalCycles > 0 ? totalCycles : 0;
        const winPct = denom ? (wins / denom) * 100 : 0;
        const lossPct = denom ? (losses / denom) * 100 : 0;
        if (winFill) winFill.style.width = `${Math.max(0, Math.min(100, winPct)).toFixed(1)}%`;
        if (lossFill) lossFill.style.width = `${Math.max(0, Math.min(100, lossPct)).toFixed(1)}%`;
        if (winValue) winValue.textContent = `${wins} (${winPct.toFixed(1)}%)`;
        if (lossValue) lossValue.textContent = `${losses} (${lossPct.toFixed(1)}%)`;
        if (foot) foot.textContent = `Entradas: ${totalEntries}`;
    }

    // Tick chart (traços) com zoom/pan — igual ao simulador Diamante, mas com IDs próprios
    let standardSimTickZoomState = { points: 0, zoom: 1, x: 0, baseW: 1, baseH: 160 };
    let standardSimLastEntriesForChart = [];

    function attachStandardSimZoomHandlers(svg) {
        if (!svg || svg.dataset.zoomBound === '1') return;
        svg.addEventListener('wheel', (event) => {
            try { event.preventDefault(); } catch (_) {}

            const state = standardSimTickZoomState || { points: 0, zoom: 1, x: 0, baseW: 1, baseH: 120 };
            const bbox = svg.getBoundingClientRect();
            if (!bbox || bbox.width <= 0) return;

            const mouseRatioX = Math.max(0, Math.min(1, (event.clientX - bbox.left) / bbox.width));
            const mouseVx = (state.x || 0) + mouseRatioX * (state.baseW / (state.zoom || 1));

            const delta = Math.sign(event.deltaY || 0);
            const zoomFactor = delta < 0 ? 1.12 : 1 / 1.12;
            let nextZoom = (state.zoom || 1) * zoomFactor;
            nextZoom = Math.max(0.6, Math.min(10, nextZoom));

            const nextWidth = state.baseW / nextZoom;
            let nextX = mouseVx - mouseRatioX * nextWidth;
            nextX = Math.max(0, Math.min(Math.max(0, state.baseW - nextWidth), nextX));

            standardSimTickZoomState = { ...state, zoom: nextZoom, x: nextX };
            renderStandardSimulationTickChart(standardSimLastEntriesForChart);
        }, { passive: false });

        let dragging = false;
        let dragStartClientX = 0;
        let dragStartX = 0;

        const onPointerDown = (event) => {
            if (!event || event.button !== 0) return;
            dragging = true;
            dragStartClientX = event.clientX;
            dragStartX = standardSimTickZoomState?.x || 0;
            try { svg.setPointerCapture(event.pointerId); } catch (_) {}
            svg.style.cursor = 'grabbing';
        };
        const onPointerMove = (event) => {
            if (!dragging) return;
            const state = standardSimTickZoomState || { points: 0, zoom: 1, x: 0, baseW: 1, baseH: 120 };
            const bbox = svg.getBoundingClientRect();
            if (!bbox || bbox.width <= 0) return;
            const viewW = state.baseW / (state.zoom || 1);
            const dxPx = event.clientX - dragStartClientX;
            const dxV = (dxPx / bbox.width) * viewW;
            let nextX = dragStartX - dxV;
            nextX = Math.max(0, Math.min(Math.max(0, state.baseW - viewW), nextX));
            standardSimTickZoomState = { ...state, x: nextX };
            renderStandardSimulationTickChart(standardSimLastEntriesForChart);
        };
        const onPointerUp = () => {
            if (!dragging) return;
            dragging = false;
            svg.style.cursor = 'grab';
        };

        svg.addEventListener('pointerdown', onPointerDown);
        svg.addEventListener('pointermove', onPointerMove);
        svg.addEventListener('pointerup', onPointerUp);
        svg.addEventListener('pointercancel', onPointerUp);
        svg.style.cursor = 'grab';
        svg.dataset.zoomBound = '1';
    }

    function renderStandardSimulationTickChart(entries) {
        const balanceEl = document.getElementById('standardSimEquityBalance');
        const lossEl = document.getElementById('standardSimEquityLoss');
        const svg = document.getElementById('standardSimTicksSvg');
        const baselineEl = document.getElementById('standardSimTicksBaseline');
        const maxLineEl = document.getElementById('standardSimTicksMaxLine');
        const minLineEl = document.getElementById('standardSimTicksMinLine');
        const currentLineEl = document.getElementById('standardSimTicksCurrentLine');
        const winPathEl = document.getElementById('standardSimTicksWinPath');
        const lossPathEl = document.getElementById('standardSimTicksLossPath');
        if (!balanceEl || !lossEl || !svg || !baselineEl || !maxLineEl || !minLineEl || !currentLineEl || !winPathEl || !lossPathEl) return;

        attachStandardSimZoomHandlers(svg);

        const allEntries = Array.isArray(entries) ? entries : [];
        standardSimLastEntriesForChart = allEntries;
        const rawConfig = (latestAnalyzerConfig && latestAnalyzerConfig.autoBetConfig) ? latestAnalyzerConfig.autoBetConfig : null;
        const autoBetConfig = (typeof sanitizeAutoBetConfig === 'function')
            ? sanitizeAutoBetConfig(rawConfig)
            : (rawConfig || {});

        const snapshot = computeDiamondSimulationProfitSnapshot(allEntries, autoBetConfig);
        balanceEl.textContent = formatCurrencyBRL(snapshot.balance);
        lossEl.textContent = formatCurrencyBRL(snapshot.loss);

        const stageIndexFromEntry = (e) => getStageIndexFromEntryLike(e);
        const resolveBetColor = (e) => {
            const raw = e && e.patternData && e.patternData.color ? e.patternData.color : null;
            const c = String(raw || '').toLowerCase();
            if (c === 'red' || c === 'black' || c === 'white') return c;
            return 'red';
        };

        const attemptsChron = allEntries
            .filter(e => e && (e.result === 'WIN' || e.result === 'LOSS'))
            .slice()
            .reverse();

        const vbH = 160;
        const padY = 8;
        const n = attemptsChron.length;
        const contentW = Math.max(1, n - 1);
        // ✅ UX: com poucas entradas, não “esticar” a barra para ocupar a tela inteira.
        // Mantém um viewBox mínimo para a barra ter um tamanho normal (sem virar um bloco gigante).
        const vbW = (n <= 3) ? 30 : contentW;
        if (!standardSimTickZoomState || standardSimTickZoomState.points !== n || standardSimTickZoomState.baseW !== vbW) {
            standardSimTickZoomState = { points: n, zoom: 1, x: 0, baseW: vbW, baseH: vbH };
        } else {
            standardSimTickZoomState = { ...standardSimTickZoomState, baseW: vbW, baseH: vbH };
        }
        const state = standardSimTickZoomState;
        const viewW = state.baseW / (state.zoom || 1);
        const viewX = Math.max(0, Math.min(Math.max(0, state.baseW - viewW), state.x || 0));
        standardSimTickZoomState = { ...state, x: viewX };
        svg.setAttribute('viewBox', `${viewX.toFixed(3)} 0 ${viewW.toFixed(3)} ${vbH}`);

        const galeMult = Math.max(1, Number(snapshot.galeMult) || 2);
        const baseStake = Math.max(0.01, Number(snapshot.baseStake) || 2);
        const whitePayoutMultiplier = Math.max(2, Number(autoBetConfig.whitePayoutMultiplier ?? 14) || 14);

        const deltas = attemptsChron.map(e => {
            const stageIdx = stageIndexFromEntry(e);
            const stake = Number((baseStake * Math.pow(galeMult, stageIdx)).toFixed(2));
            const betColor = resolveBetColor(e);
            const payoutMult = betColor === 'white' ? whitePayoutMultiplier : 2;
            const delta = e.result === 'WIN'
                ? Number((stake * (payoutMult - 1)).toFixed(2))
                : Number((-stake).toFixed(2));
            return { e, delta };
        });

        let yPrevValue = 0;
        const segments = deltas.map(({ e, delta }, idx) => {
            const yNextValue = Number((yPrevValue + delta).toFixed(2));
            const seg = { idx, e, delta, y0: yPrevValue, y1: yNextValue };
            yPrevValue = yNextValue;
            return seg;
        });

        const values = [0, ...segments.map(s => s.y0), ...segments.map(s => s.y1)];
        let minV = Math.min(...values);
        let maxV = Math.max(...values);
        if (!Number.isFinite(minV) || !Number.isFinite(maxV)) { minV = -1; maxV = 1; }
        if (Math.abs(maxV - minV) < 0.01) { maxV += 1; minV -= 1; }
        const range = maxV - minV;
        minV -= range * 0.08;
        maxV += range * 0.08;

        const yScale = (val) => {
            const t = (val - minV) / (maxV - minV);
            return (vbH - padY) - (t * (vbH - padY * 2));
        };

        const yZero = yScale(0);
        const xStart = viewX;
        const xEnd = viewX + viewW;

        baselineEl.setAttribute('d', `M ${xStart.toFixed(2)} ${yZero.toFixed(2)} L ${xEnd.toFixed(2)} ${yZero.toFixed(2)}`);
        baselineEl.setAttribute('fill', 'none');
        baselineEl.setAttribute('stroke', 'rgba(200,214,233,0.22)');
        baselineEl.setAttribute('stroke-width', '0.7');
        baselineEl.setAttribute('vector-effect', 'non-scaling-stroke');

        const maxGuideVal = Math.max(...values);
        const minGuideVal = Math.min(...values);
        const currentGuideVal = segments.length ? segments[segments.length - 1].y1 : 0;
        const yMax = yScale(maxGuideVal);
        const yMin = yScale(minGuideVal);
        const yCur = yScale(currentGuideVal);

        maxLineEl.setAttribute('d', `M ${xStart.toFixed(2)} ${yMax.toFixed(2)} L ${xEnd.toFixed(2)} ${yMax.toFixed(2)}`);
        maxLineEl.setAttribute('fill', 'none');
        maxLineEl.setAttribute('stroke', 'rgba(34,197,94,0.55)');
        maxLineEl.setAttribute('stroke-width', '0.55');
        maxLineEl.setAttribute('vector-effect', 'non-scaling-stroke');

        minLineEl.setAttribute('d', `M ${xStart.toFixed(2)} ${yMin.toFixed(2)} L ${xEnd.toFixed(2)} ${yMin.toFixed(2)}`);
        minLineEl.setAttribute('fill', 'none');
        minLineEl.setAttribute('stroke', 'rgba(239,68,68,0.55)');
        minLineEl.setAttribute('stroke-width', '0.55');
        minLineEl.setAttribute('vector-effect', 'non-scaling-stroke');

        currentLineEl.setAttribute('d', `M ${xStart.toFixed(2)} ${yCur.toFixed(2)} L ${xEnd.toFixed(2)} ${yCur.toFixed(2)}`);
        currentLineEl.setAttribute('fill', 'none');
        currentLineEl.setAttribute('stroke', 'rgba(255,255,255,0.6)');
        currentLineEl.setAttribute('stroke-width', '0.55');
        currentLineEl.setAttribute('vector-effect', 'non-scaling-stroke');

        let dWin = '';
        let dLoss = '';
        const xOffset = vbW - contentW;
        for (const s of segments) {
            const xRaw = (n === 1 ? 0 : s.idx);
            const x = (n <= 3) ? Math.min(vbW - 0.5, xOffset + xRaw) : xRaw;
            const y0 = yScale(s.y0);
            const y1 = yScale(s.y1);
            const pathSeg = `M ${x} ${y0.toFixed(2)} L ${x} ${y1.toFixed(2)} `;
            if (s.delta >= 0) dWin += pathSeg;
            else dLoss += pathSeg;
        }

        const strokeW = n > 600 ? '0.22' : (n > 300 ? '0.35' : (n > 120 ? '0.55' : '0.85'));
        winPathEl.setAttribute('d', dWin.trim());
        winPathEl.setAttribute('fill', 'none');
        winPathEl.setAttribute('stroke', '#22c55e');
        winPathEl.setAttribute('stroke-width', strokeW);
        winPathEl.setAttribute('stroke-linecap', 'butt');

        lossPathEl.setAttribute('d', dLoss.trim());
        lossPathEl.setAttribute('fill', 'none');
        lossPathEl.setAttribute('stroke', '#ef4444');
        lossPathEl.setAttribute('stroke-width', strokeW);
        lossPathEl.setAttribute('stroke-linecap', 'butt');

        const layer = svg.parentElement;
        const labelMax = layer ? layer.querySelector('#standardSimGuideMax') : null;
        const labelMin = layer ? layer.querySelector('#standardSimGuideMin') : null;
        const labelCur = layer ? layer.querySelector('#standardSimGuideCur') : null;
        const dir = layer ? layer.querySelector('#standardSimGuideDir') : null;
        if (dir) dir.textContent = 'Esquerda: Antigo • Direita: Recente';

        const bbox = svg.getBoundingClientRect();
        if (bbox && bbox.height > 0) {
            const yToPx = (y) => (y / vbH) * bbox.height;
            const maxBal = snapshot.initialBank + maxGuideVal;
            const minBal = snapshot.initialBank + minGuideVal;
            const curBal = snapshot.initialBank + currentGuideVal;

            const plusText = (v) => `+${formatCurrencyBRL(Math.abs(v))}`;
            const minusText = (v) => `-${formatCurrencyBRL(Math.abs(v))}`;

            const maxTop = Math.max(0, yToPx(yMax) - 14);
            const minTop = Math.min(bbox.height - 12, yToPx(yMin) + 4);
            let curTop = Math.max(0, yToPx(yCur) - 14);
            if (Math.abs(curTop - minTop) < 14) {
                curTop = Math.max(0, minTop - 18);
            }

            if (labelMax) {
                labelMax.textContent = `${plusText(maxGuideVal)}`;
                labelMax.title = `Máximo: ${formatCurrencyBRL(maxBal)}`;
                labelMax.style.top = `${maxTop}px`;
            }
            if (labelMin) {
                labelMin.textContent = `${minusText(minGuideVal)}`;
                labelMin.title = `Mínimo: ${formatCurrencyBRL(minBal)}`;
                labelMin.style.top = `${minTop}px`;
            }
            if (labelCur) {
                labelCur.textContent = `${formatCurrencyBRL(curBal)}`;
                labelCur.title = `Atual: ${formatCurrencyBRL(curBal)}`;
                labelCur.style.top = `${curTop}px`;
                labelCur.style.left = 'auto';
                labelCur.style.right = '8px';
            }
        }
    }

    function renderStandardSimulationEntries(entries) {
        const list = document.getElementById('standardSimEntriesList');
        const hitEl = document.getElementById('standardSimEntriesHit');
        if (!list || !hitEl) return;

        const allEntries = Array.isArray(entries) ? entries : [];
        const filteredEntries = allEntries.filter(e => {
            if (!e) return false;
            if (e.result === 'WIN') return true;
            if (e.result === 'LOSS') {
                if (e.finalResult === 'RED' || e.finalResult === 'RET') return true;
                let isContinuing = false;
                for (let key in e) {
                    if (key.startsWith('continuingToG')) { isContinuing = true; break; }
                }
                if (isContinuing) return false;
                return true;
            }
            return true;
        });

        const items = filteredEntries.map((e, idx) => {
            const entryIndex = idx;
            const time = new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const cls = e.color;
            const badge = e.color === 'white' ? blazeWhiteSVG(16) : `<span>${e.number}</span>`;
            const isWin = e.result === 'WIN';

            let barClass = isWin ? 'win' : 'loss';
            let stageText = '';
            if (e.martingaleStage) {
                if (isWin) {
                    if (e.martingaleStage === 'ENTRADA' || e.wonAt === 'ENTRADA') stageText = 'WIN';
                    else if (e.martingaleStage && e.martingaleStage.startsWith('G')) {
                        const galeNum = e.martingaleStage.substring(1);
                        stageText = `WIN <span style="color: white;">G${galeNum}</span>`;
                    }
                } else {
                    if (e.finalResult === 'RED' || e.finalResult === 'RET') {
                        const stage = e.martingaleStage || e.phase;
                        if (stage === 'ENTRADA' || stage === 'G0') stageText = 'LOSS';
                        else if (stage && stage.startsWith('G')) {
                            const galeNum = stage.substring(1);
                            stageText = `LOSS <span style="color: white;">G${galeNum}</span>`;
                        } else stageText = 'LOSS';
                    } else {
                        let isContinuing = false;
                        let nextGale = '';
                        for (let key in e) {
                            if (key.startsWith('continuingToG')) {
                                isContinuing = true;
                                nextGale = key.substring('continuingTo'.length);
                                break;
                            }
                        }
                        stageText = isContinuing ? `LOSS ➜<span style="color: white;">${nextGale}</span>` : 'LOSS';
                    }
                }
            } else {
                const phaseDigit = e.phase === 'G1' ? '1' : (e.phase === 'G2' ? '2' : '');
                stageText = phaseDigit ? (isWin ? `WIN <span style="color: white;">G${phaseDigit}</span>` : `LOSS <span style="color: white;">G${phaseDigit}</span>`) : (isWin ? 'WIN' : 'LOSS');
            }

            const confTop = (typeof e.confidence === 'number') ? `${e.confidence.toFixed(0)}%` : '';
            const resultBar = `<div class="entry-result-bar ${barClass}"></div>`;
            const stageLabel = stageText ? `<div class="entry-stage ${barClass}">${stageText}</div>` : '';
            const title = `Giro: ${e.number} • Cor: ${e.color} • ${time} • Resultado: ${e.result}${e.martingaleStage ? ' • Estágio: '+e.martingaleStage : ''}${e.confidence? ' • Confiança: '+e.confidence.toFixed(1)+'%' : ''}`;

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

        list.innerHTML = items || '<div class="no-history">Sem entradas registradas</div>';

        const totalCycles = filteredEntries.length;
        const wins = filteredEntries.filter(e => e.result === 'WIN').length;
        const losses = totalCycles - wins;
        const pct = totalCycles ? ((wins / totalCycles) * 100).toFixed(1) : '0.0';
        const totalEntries = allEntries.length;
        hitEl.innerHTML = `<span class="win-score">WIN: ${wins}</span> <span class="loss-score">LOSS: ${losses}</span> <span class="percentage">(${pct}%)</span> <span class="total-entries">• Ciclos: ${totalEntries}</span>`;

        renderStandardSimulationChart({ wins, losses, totalCycles, totalEntries });
        renderStandardSimulationTickChart(allEntries);

        const clickableEntries = list.querySelectorAll('.clickable-entry');
        clickableEntries.forEach((entryEl) => {
            entryEl.addEventListener('click', function() {
                const entryIndex = parseInt(this.getAttribute('data-entry-index'), 10);
                const entry = filteredEntries[entryIndex];
                if (entry) showPatternForEntry(entry);
            });
        });
    }

    async function buildStandardConfigSnapshotFromUI() {
        const storageData = await storageCompat.get(['analyzerConfig']);
        const currentConfig = storageData.analyzerConfig || {};

        const getNum = (id, fallback) => {
            const el = document.getElementById(id);
            if (!el) return fallback;
            const n = Number(el.value);
            return Number.isFinite(n) ? n : fallback;
        };
        const getBool = (id, fallback) => {
            const el = document.getElementById(id);
            if (!el) return fallback;
            return !!el.checked;
        };

        const historyDepth = Math.max(100, Math.min(10000, Math.floor(getNum('cfgHistoryDepth', currentConfig.historyDepth ?? 500))));
        const minOcc = Math.max(1, Math.floor(getNum('cfgMinOccurrences', currentConfig.minOccurrences ?? 2)));
        const maxOcc = Math.max(0, Math.floor(getNum('cfgMaxOccurrences', currentConfig.maxOccurrences ?? 0)));
        const patternInterval = Math.max(0, Math.floor(getNum('cfgPatternInterval', currentConfig.minIntervalSpins ?? 0)));
        const minSize = Math.max(2, Math.floor(getNum('cfgMinPatternSize', currentConfig.minPatternSize ?? 3)));
        const maxSize = Math.max(0, Math.floor(getNum('cfgMaxPatternSize', currentConfig.maxPatternSize ?? 0)));
        const winPct = Math.max(0, Math.min(100, Math.floor(getNum('cfgWinPercentOthers', currentConfig.winPercentOthers ?? 100))));
        const reqTrig = getBool('cfgRequireTrigger', currentConfig.requireTrigger ?? true);

        // snapshot para simulação: forçar Modo Padrão
        return {
            ...currentConfig,
            aiMode: false,
            historyDepth,
            minOccurrences: minOcc,
            maxOccurrences: maxOcc,
            minIntervalSpins: patternInterval,
            minPatternSize: minSize,
            maxPatternSize: maxSize,
            winPercentOthers: winPct,
            requireTrigger: reqTrig
        };
    }

    async function startStandardSimulation() {
        try {
            if (standardSimulationRunning || standardOptimizationRunning) return;
            createStandardSimulationModal();
            setStandardSimActiveTab('signals');
            setStandardSimResultsVisible(false);
            setStandardSimulationLoading(true, 'Simulando...', 'simulate');

            const summary = document.getElementById('standardSimulationSummary');
            if (summary) summary.innerHTML = 'Preparando simulação...';

            const cfg = await buildStandardConfigSnapshotFromUI();

            standardSimulationJobId = `std-sim-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            const resolvedHistoryLimit =
                standardSimPeriodPreset === 'custom'
                    ? (clampDiamondSimHistoryLimit(standardSimHistoryLimitRaw) ?? clampDiamondSimHistoryLimit(standardSimHistoryLimit) ?? 1440)
                    : (clampDiamondSimHistoryLimit(standardSimHistoryLimit) ?? 1440);

            chrome.runtime.sendMessage({
                action: 'STANDARD_SIMULATE_PAST',
                jobId: standardSimulationJobId,
                historyLimit: resolvedHistoryLimit,
                config: cfg
            }, (response) => {
                const err = chrome.runtime.lastError;
                if (err) {
                    setStandardSimulationLoading(false);
                    standardSimulationJobId = null;
                    if (summary) summary.innerHTML = `❌ Falha ao simular: ${err.message || err}`;
                    return;
                }
                if (!response) {
                    setStandardSimulationLoading(false);
                    standardSimulationJobId = null;
                    if (summary) summary.innerHTML = '❌ Falha ao simular: resposta inválida';
                    return;
                }
                if (response.status === 'cancelled') {
                    setStandardSimulationLoading(false);
                    standardSimulationJobId = null;
                    if (summary) summary.innerHTML = '⏹️ Simulação cancelada.';
                    return;
                }
                if (response.status !== 'success') {
                    setStandardSimulationLoading(false);
                    standardSimulationJobId = null;
                    if (summary) summary.innerHTML = `❌ Falha ao simular: ${response.error || 'resposta inválida'}`;
                    return;
                }

                standardSimulationJobId = response.jobId || null;
                const meta = response.meta || {};
                const stats = response.stats || {};

                if (summary) {
                    const from = meta.fromTimestamp ? new Date(meta.fromTimestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
                    const to = meta.toTimestamp ? new Date(meta.toTimestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
                    const avail = Number(meta.availableHistory || 0);
                    const req = Number(meta.requestedHistoryLimit || 0);
                    const used = Number(meta.usedHistoryLimit || meta.totalSpins || 0);
                    summary.innerHTML =
                        `<strong>Simulação • Modo Premium</strong><br>` +
                        `Giros analisados: <strong>${meta.totalSpins || 0}</strong><br>` +
                        `Disponível: <strong>${avail || '—'}</strong> • Solicitado: <strong>${req || '—'}</strong> • Usado: <strong>${used || '—'}</strong><br>` +
                        `Período: <strong>${from}</strong> → <strong>${to}</strong><br>` +
                        `Sinais gerados: <strong>${meta.totalSignals || 0}</strong> • Ciclos: <strong>${stats.totalCycles || 0}</strong>`;
                }

                renderStandardSimulationEntries(response.entries || []);
                standardSimHasResults = true;
                setStandardSimResultsVisible(true);
                setStandardSimulationLoading(false);
            });
        } catch (error) {
            setStandardSimulationLoading(false);
            standardSimulationJobId = null;
            const summary = document.getElementById('standardSimulationSummary');
            if (summary) summary.innerHTML = `❌ Falha ao simular: ${error.message || error}`;
        }
    }

    async function startStandardOptimization() {
        try {
            if (standardSimulationRunning || standardOptimizationRunning) return;
            createStandardSimulationModal();
            setStandardSimActiveTab('signals');
            setStandardSimResultsVisible(false);
            setStandardSimulationLoading(true, 'Otimizando... (0/100)', 'optimize');

            const summary = document.getElementById('standardSimulationSummary');
            if (summary) summary.innerHTML = 'Preparando otimização (100 configurações)...';

            const cfg = await buildStandardConfigSnapshotFromUI();

            const resolvedHistoryLimit =
                standardSimPeriodPreset === 'custom'
                    ? (clampDiamondSimHistoryLimit(standardSimHistoryLimitRaw) ?? clampDiamondSimHistoryLimit(standardSimHistoryLimit) ?? 1440)
                    : (clampDiamondSimHistoryLimit(standardSimHistoryLimit) ?? 1440);

            standardOptimizationJobId = `std-opt-${Date.now()}-${Math.random().toString(16).slice(2)}`;

            chrome.runtime.sendMessage({
                action: 'STANDARD_OPTIMIZE_PAST',
                jobId: standardOptimizationJobId,
                trials: 100,
                historyLimit: resolvedHistoryLimit,
                config: cfg
            }, async (response) => {
                const err = chrome.runtime.lastError;
                if (err) {
                    setStandardSimulationLoading(false);
                    standardOptimizationJobId = null;
                    if (summary) summary.innerHTML = `❌ Falha ao otimizar: ${err.message || err}`;
                    return;
                }
                if (!response) {
                    setStandardSimulationLoading(false);
                    standardOptimizationJobId = null;
                    if (summary) summary.innerHTML = '❌ Falha ao otimizar: resposta inválida';
                    return;
                }
                if (response.status === 'cancelled') {
                    setStandardSimulationLoading(false);
                    standardOptimizationJobId = null;
                    if (summary) summary.innerHTML = '⏹️ Otimização cancelada.';
                    return;
                }
                if (response.status !== 'success') {
                    setStandardSimulationLoading(false);
                    standardOptimizationJobId = null;
                    if (summary) summary.innerHTML = `❌ Falha ao otimizar: ${response.error || 'resposta inválida'}`;
                    return;
                }

                standardOptimizationJobId = response.jobId || null;

                const meta = response.meta || {};
                const minPct = Number(response.minPct) || 95;
                const recommendedFound = !!response.recommendedFound;
                const recommended = response.recommended || null;
                const bestOverall = response.bestOverall || null;
                const bestCfg = response.config || null;

                // aplicar somente os campos do modo padrão se atingir o mínimo
                const applyStandardConfigToInputs = (cfgObj) => {
                    if (!cfgObj) return false;
                    const setVal = (id, value) => {
                        const el = document.getElementById(id);
                        if (el && value != null && value !== '') el.value = String(value);
                    };
                    const setCheck = (id, value) => {
                        const el = document.getElementById(id);
                        if (el && typeof value === 'boolean') el.checked = value;
                    };
                    setVal('cfgHistoryDepth', cfgObj.historyDepth);
                    setVal('cfgMinOccurrences', cfgObj.minOccurrences);
                    setVal('cfgMaxOccurrences', cfgObj.maxOccurrences);
                    setVal('cfgPatternInterval', cfgObj.minIntervalSpins);
                    setVal('cfgMinPatternSize', cfgObj.minPatternSize);
                    setVal('cfgMaxPatternSize', cfgObj.maxPatternSize);
                    setVal('cfgWinPercentOthers', cfgObj.winPercentOthers);
                    setCheck('cfgRequireTrigger', !!cfgObj.requireTrigger);
                    return true;
                };

                if (recommendedFound && bestCfg) {
                    try { applyStandardConfigToInputs(bestCfg); } catch (_) {}
                }

                const from = meta.fromTimestamp ? new Date(meta.fromTimestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
                const to = meta.toTimestamp ? new Date(meta.toTimestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
                const avail = Number(meta.availableHistory || 0);
                const req = Number(meta.requestedHistoryLimit || 0);
                const used = Number(meta.usedHistoryLimit || meta.totalSpins || 0);

                if (summary) {
                    if (recommendedFound && recommended) {
                        summary.innerHTML =
                            `<strong>Melhor configuração (${response.trials || 100} testes) • Modo Premium</strong><br>` +
                            `Giros analisados: <strong>${meta.totalSpins || 0}</strong><br>` +
                            `Disponível: <strong>${avail || '—'}</strong> • Solicitado: <strong>${req || '—'}</strong> • Usado: <strong>${used || '—'}</strong><br>` +
                            `Período: <strong>${from}</strong> → <strong>${to}</strong><br>` +
                            `Assertividade: <strong>${Number(recommended.pct || 0).toFixed(1)}%</strong> • Ciclos: <strong>${recommended.totalCycles || 0}</strong> • Sinais: <strong>${recommended.totalSignals || 0}</strong>`;
                    } else {
                        const pctOverall = bestOverall ? Number(bestOverall.pct || 0) : 0;
                        const cyclesOverall = bestOverall ? (bestOverall.totalCycles || 0) : 0;
                        summary.innerHTML =
                            `<strong>Nenhuma configuração atingiu ${minPct}% (${response.trials || 100} testes) • Modo Premium</strong><br>` +
                            `Giros analisados: <strong>${meta.totalSpins || 0}</strong><br>` +
                            `Disponível: <strong>${avail || '—'}</strong> • Solicitado: <strong>${req || '—'}</strong> • Usado: <strong>${used || '—'}</strong><br>` +
                            `Período: <strong>${from}</strong> → <strong>${to}</strong><br>` +
                            `Melhor encontrada: <strong>${pctOverall.toFixed(1)}%</strong> • Ciclos: <strong>${cyclesOverall}</strong><br>` +
                            `<span style="color:#8da2bb;">(A configuração NÃO foi aplicada automaticamente porque ficou abaixo do mínimo.)</span>`;
                    }
                }

                renderStandardSimulationEntries(response.entries || []);
                standardSimHasResults = true;
                setStandardSimResultsVisible(true);
                setStandardSimulationLoading(false);
            });
        } catch (error) {
            setStandardSimulationLoading(false);
            standardOptimizationJobId = null;
            const summary = document.getElementById('standardSimulationSummary');
            if (summary) summary.innerHTML = `❌ Falha ao otimizar: ${error.message || error}`;
        }
    }

    // Snapshot para restaurar configurações (estado ao abrir o modal / último "Salvar")
    let diamondLevelsRestoreSnapshot = null;
    function setDiamondLevelsRestoreSnapshot(config) {
        try {
            diamondLevelsRestoreSnapshot = config ? JSON.parse(JSON.stringify(config)) : {};
        } catch (_) {
            diamondLevelsRestoreSnapshot = config ? { ...config } : {};
        }
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
        // ✅ Guard: não permitir ativar/desativar clicando fora do switch
        try {
            const labels = document.querySelectorAll('#diamondLevelsModal .diamond-level-switch');
            labels.forEach(label => {
                if (!label || label.dataset.clickGuardAttached) return;
                label.addEventListener('click', (event) => {
                    const target = event && event.target ? event.target : null;
                    const clickedCheckbox = target && (target.tagName === 'INPUT' || (typeof target.closest === 'function' && target.closest('input[type="checkbox"]')));
                    if (clickedCheckbox) return; // clique em cima do switch -> ok
                    // clique fora do switch (mas dentro do label por algum motivo) -> bloquear
                    try { event.preventDefault(); } catch (_) {}
                    try { event.stopPropagation(); } catch (_) {}
                }, true);
                label.dataset.clickGuardAttached = '1';
            });
        } catch (_) {}

        const toggles = document.querySelectorAll('.diamond-level-toggle-input');
        toggles.forEach(toggle => {
            if (!toggle.dataset.listenerAttached) {
                toggle.addEventListener('change', () => {
                    updateDiamondLevelToggleVisual(toggle);
                    enforceSignalIntensityAvailability();
                });
                toggle.dataset.listenerAttached = '1';
            }
            updateDiamondLevelToggleVisual(toggle);
        });
        enforceSignalIntensityAvailability();
    }

    function refreshDiamondLevelToggleStates() {
        const toggles = document.querySelectorAll('.diamond-level-toggle-input');
        toggles.forEach(updateDiamondLevelToggleVisual);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ✅ ACCORDION: organizar níveis dentro do modal "Configurar Níveis"
    // - Ao abrir: tudo fechado
    // - Clicar no nível abre/fecha, e abre um fechando os demais
    // - Clique no switch NÃO abre/fecha (apenas ativa/desativa)
    // ═══════════════════════════════════════════════════════════════════════
    function initDiamondLevelsAccordion() {
        try {
            const modal = document.getElementById('diamondLevelsModal');
            if (!modal) return;
            const body = modal.querySelector('.custom-pattern-modal-body');
            if (!body) return;
            if (modal.dataset.diamondLevelsAccordionInit === '1') return;
            modal.dataset.diamondLevelsAccordionInit = '1';

            const fields = Array.from(modal.querySelectorAll('.diamond-level-field'));
            if (!fields.length) return;

            // ✅ Preparar estrutura (header + body wrapper) e caret
            fields.forEach((field) => {
                if (!field || field.querySelector('.diamond-level-acc-body')) return;
                const header = field.querySelector('.diamond-level-header');
                if (!header) return;

                header.classList.add('diamond-level-acc-header');
                header.setAttribute('role', 'button');
                header.setAttribute('tabindex', '0');
                header.setAttribute('aria-expanded', 'false');

                const levelKey = field.getAttribute('data-level') || '';
                const bodyId = levelKey ? `diamondLevelAccBody-${levelKey}` : '';

                const bodyWrap = document.createElement('div');
                bodyWrap.className = 'diamond-level-acc-body';
                if (bodyId) bodyWrap.id = bodyId;
                if (bodyWrap.id) header.setAttribute('aria-controls', bodyWrap.id);

                // ✅ Caret como item separado no header (igual ao accordion do simulador)
                try {
                    const existing = header.querySelector('.diamond-level-acc-caret');
                    if (existing) existing.remove();
                } catch (_) {}
                const caret = document.createElement('span');
                caret.className = 'diamond-level-acc-caret';
                caret.setAttribute('aria-hidden', 'true');
                caret.textContent = '▾';
                // Header original é: [title] [switch]. Colocar caret por último (à direita).
                // (Se o switch não existir por algum motivo, ainda assim adiciona no fim)
                const sw = header.querySelector('.diamond-level-switch');
                if (sw && sw.parentNode === header) {
                    header.insertBefore(caret, sw.nextSibling);
                } else {
                    header.appendChild(caret);
                }

                // mover todo conteúdo (exceto header) para dentro do body wrapper
                const toMove = Array.from(field.children).filter((el) => el !== header);
                toMove.forEach((el) => bodyWrap.appendChild(el));
                field.appendChild(bodyWrap);
            });

            const setAllClosed = () => {
                fields.forEach((field) => {
                    if (!field) return;
                    field.classList.remove('is-open');
                    const header = field.querySelector('.diamond-level-header');
                    if (header) header.setAttribute('aria-expanded', 'false');
                });
            };

            const setOpenField = (targetField) => {
                fields.forEach((field) => {
                    if (!field) return;
                    const isTarget = field === targetField;
                    field.classList.toggle('is-open', isTarget);
                    const header = field.querySelector('.diamond-level-header');
                    if (header) header.setAttribute('aria-expanded', isTarget ? 'true' : 'false');
                });
            };

            const toggleField = (field) => {
                if (!field) return;
                const isOpen = field.classList.contains('is-open');
                if (isOpen) setAllClosed();
                else setOpenField(field);
            };

            const isSwitchClick = (event) => {
                const target = event && event.target ? event.target : null;
                if (!target) return false;
                if (typeof target.closest === 'function' && target.closest('.diamond-level-switch')) return true;
                if (typeof target.closest === 'function' && target.closest('input[type="checkbox"]')) return true;
                return false;
            };

            fields.forEach((field) => {
                const header = field ? field.querySelector('.diamond-level-header') : null;
                if (!header || header.dataset.accordionAttached === '1') return;

                header.addEventListener('click', (event) => {
                    if (isSwitchClick(event)) return;
                    try { event.preventDefault(); } catch (_) {}
                    toggleField(field);
                });

                header.addEventListener('keydown', (event) => {
                    if (!event) return;
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    if (isSwitchClick(event)) return;
                    try { event.preventDefault(); } catch (_) {}
                    toggleField(field);
                });

                header.dataset.accordionAttached = '1';
            });

            // ✅ Modal inicia com tudo fechado
            setAllClosed();
        } catch (err) {
            console.warn('⚠️ Falha ao iniciar accordion do configurar níveis:', err);
        }
    }

    function resetDiamondLevelsAccordionClosed() {
        try {
            const modal = document.getElementById('diamondLevelsModal');
            if (!modal) return;
            const fields = Array.from(modal.querySelectorAll('.diamond-level-field'));
            fields.forEach((field) => {
                if (!field) return;
                field.classList.remove('is-open');
                const header = field.querySelector('.diamond-level-header');
                if (header) header.setAttribute('aria-expanded', 'false');
            });
        } catch (_) {}
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // 💎 SIMULAÇÃO NO PASSADO (BACKTEST) - MODO DIAMANTE (SEM MISTURAR COM O REAL)
    // ═══════════════════════════════════════════════════════════════════════════════

    let diamondSimulationJobId = null;
    let diamondSimulationRunning = false;
    let diamondOptimizationJobId = null;
    let diamondOptimizationRunning = false;
    let diamondSimBusyKind = null; // 'simulate' | 'optimize' | null
    let diamondSimCurrentMode = null;
    let diamondSimCurrentLevelId = null;
    let diamondOptimizationActiveLevelId = null; // usado para prefixar progresso quando otimizando em lote (modo "all")
    let diamondSimMovedNodes = [];
    let diamondSimHiddenNodes = [];
    let diamondSimPeriodPreset = '12h'; // padrão: 12 horas
    let diamondSimHistoryLimit = 1440; // 12h * 120 giros/h
    let diamondSimHistoryLimitRaw = 1440; // valor digitado (pode estar “em edição”)
    let diamondSimHasResults = false;
    let diamondSimActiveTab = 'signals';

    const DIAMOND_SIM_SPINS_PER_MINUTE = 2;
    const DIAMOND_SIM_SPINS_PER_HOUR = 120; // 2 giros/min * 60 min
    const DIAMOND_SIM_PERIOD_PRESETS = [
        { id: '1h', label: '1h', spins: 1 * DIAMOND_SIM_SPINS_PER_HOUR },
        { id: '2h', label: '2h', spins: 2 * DIAMOND_SIM_SPINS_PER_HOUR },
        { id: '5h', label: '5h', spins: 5 * DIAMOND_SIM_SPINS_PER_HOUR },
        { id: '12h', label: '12h', spins: 12 * DIAMOND_SIM_SPINS_PER_HOUR },
        { id: '10k', label: '10k', spins: 10000 }
    ];

    function clampDiamondSimHistoryLimit(raw) {
        const n = Number(raw);
        if (!Number.isFinite(n)) return null;
        // mínimo útil: 10 giros; máximo: 10k
        return Math.max(10, Math.min(10000, Math.floor(n)));
    }

    function resolveDiamondSimHistoryLimitFromUI(fallback = 1440) {
        const resolved =
            diamondSimPeriodPreset === 'custom'
                ? (clampDiamondSimHistoryLimit(diamondSimHistoryLimitRaw) ?? clampDiamondSimHistoryLimit(diamondSimHistoryLimit))
                : clampDiamondSimHistoryLimit(diamondSimHistoryLimit);
        return resolved ?? fallback;
    }

    function readDiamondSimNumberInput(id) {
        const el = document.getElementById(id);
        if (!el) return null;
        const n = Number(el.value);
        if (!Number.isFinite(n)) return null;
        return Math.floor(n);
    }

    function ensureDiamondSimHistoryLimitAtLeast(minSpins) {
        const required = clampDiamondSimHistoryLimit(minSpins);
        if (required == null) return resolveDiamondSimHistoryLimitFromUI();
        const current = resolveDiamondSimHistoryLimitFromUI();
        if (current < required) {
            // ✅ torna o período "custom" e sincroniza o input superior
            setDiamondSimCustomHistoryLimit(required, { syncInput: true });
            return required;
        }
        return current;
    }

    function bindDiamondSimPeriodToLevelHistory(levelId) {
        const upper = String(levelId || '').toUpperCase();
        // IDs que representam "Histórico analisado (giros)" (campos que exigem mais giros no topo)
        const ids =
            upper === 'N0' ? ['diamondN0History']
            : upper === 'N3' ? ['diamondN3Alternance']
            : upper === 'N4' ? ['diamondN4Persistence']
            : upper === 'N7' ? ['diamondN7HistoryWindow']
            : upper === 'N8' ? ['diamondN10History']
            : upper === 'N10' ? ['diamondN9History']
            : [];

        if (!ids.length) return;

        const syncFromField = () => {
            // pegar o maior valor entre os ids mapeados (caso exista mais de 1)
            let max = null;
            ids.forEach((id) => {
                const v = readDiamondSimNumberInput(id);
                if (Number.isFinite(v)) {
                    max = max == null ? v : Math.max(max, v);
                }
            });
            if (max != null) ensureDiamondSimHistoryLimitAtLeast(max);
        };

        ids.forEach((id) => {
            const el = document.getElementById(id);
            if (!el || el.dataset.diamondSimPeriodSyncAttached === '1') return;
            el.addEventListener('change', syncFromField);
            el.addEventListener('blur', syncFromField);
            el.dataset.diamondSimPeriodSyncAttached = '1';
        });

        // ✅ sincronizar imediatamente ao abrir o nível na simulação
        syncFromField();
    }

    function formatApproxHoursFromSpins(spins) {
        const s = Math.max(0, Number(spins) || 0);
        if (!s) return '0h';

        const totalMinutes = s / DIAMOND_SIM_SPINS_PER_MINUTE;
        const totalHours = totalMinutes / 60;

        // < 1h: manter simples
        if (totalHours < 1) return `${Math.max(1, Math.round(totalMinutes))}m`;

        // >= 24h: mostrar em dias + horas + minutos (mais proporcional ao restante do UI)
        if (totalHours >= 24) {
            const totalMinsRounded = Math.round(totalMinutes);
            const days = Math.floor(totalMinsRounded / (60 * 24));
            const remAfterDays = totalMinsRounded - days * 60 * 24;
            const hours = Math.floor(remAfterDays / 60);
            const mins = remAfterDays - hours * 60;

            const parts = [];
            if (days > 0) parts.push(`${days} dia${days === 1 ? '' : 's'}`);
            if (hours > 0) parts.push(`${hours} hora${hours === 1 ? '' : 's'}`);
            if (mins > 0) parts.push(`${mins} minuto${mins === 1 ? '' : 's'}`);

            // sempre mostrar algo legível
            if (!parts.length) return '0h';
            return parts.join(' e ');
        }

        // 1h..23h: manter compacto com h/m
        const wholeHours = Math.floor(totalHours);
        const mins = Math.round((totalHours - wholeHours) * 60);
        if (mins <= 0) return `${wholeHours}h`;
        return `${wholeHours}h ${mins}m`;
    }

    function setDiamondSimResultsVisible(visible) {
        const tabs = document.getElementById('diamondSimTabs');
        const signalsView = document.querySelector('#diamondSimView .diamond-sim-tabview[data-view="signals"]');
        const chartView = document.querySelector('#diamondSimView .diamond-sim-tabview[data-view="chart"]');
        if (!visible) {
            if (tabs) tabs.hidden = true;
            if (signalsView) signalsView.hidden = true;
            if (chartView) chartView.hidden = true;
            return;
        }
        if (tabs) tabs.hidden = false;
        // ✅ importante: não mostrar as duas views ao mesmo tempo
        setDiamondSimActiveTab(diamondSimActiveTab || 'signals');
    }

    function updateDiamondSimRunButtonLabel() {
        const runBtn = document.getElementById('diamondSimulationRunBtn');
        if (!runBtn) return;
        runBtn.textContent = diamondSimHasResults ? 'Simular novamente' : 'Simular';
    }

    function updateDiamondSimPreRunSummary() {
        const summary = document.getElementById('diamondSimulationSummary');
        if (!summary) return;
        const preset = DIAMOND_SIM_PERIOD_PRESETS.find(p => p.id === diamondSimPeriodPreset) || null;
        const spins = preset ? preset.spins : (diamondSimHistoryLimitRaw ?? diamondSimHistoryLimit);
        const approx = spins ? formatApproxHoursFromSpins(spins) : '—';
        const periodLabel = preset
            ? (preset.id === '10k' ? approx : preset.label)
            : 'Personalizado';
        summary.innerHTML =
            `Selecione o período e clique em <strong>Simular</strong>.<br>` +
            `Período: <strong>${periodLabel}</strong> • Giros: <strong>${spins || '—'}</strong> • Tempo: <strong>${approx}</strong>`;
    }

    function setDiamondSimPeriodPreset(presetId, { updateSummary = true } = {}) {
        const preset = DIAMOND_SIM_PERIOD_PRESETS.find(p => p.id === presetId) || DIAMOND_SIM_PERIOD_PRESETS[3];
        diamondSimPeriodPreset = preset.id;
        diamondSimHistoryLimit = preset.spins;
        diamondSimHistoryLimitRaw = preset.spins;

        const container = document.getElementById('diamondSimPeriodContainer');
        if (container) {
            const btns = container.querySelectorAll('.diamond-sim-period-option');
            btns.forEach(btn => btn.classList.toggle('active', btn.dataset.preset === diamondSimPeriodPreset));
        }
        const customInput = document.getElementById('diamondSimCustomSpinsInput');
        if (customInput) customInput.value = String(diamondSimHistoryLimit);
        if (updateSummary) updateDiamondSimPreRunSummary();
    }

    function setDiamondSimCustomHistoryLimit(spins, { updateSummary = true, syncInput = false } = {}) {
        const clamped = clampDiamondSimHistoryLimit(spins);
        if (clamped == null) return;
        diamondSimPeriodPreset = 'custom';
        diamondSimHistoryLimit = clamped;
        diamondSimHistoryLimitRaw = clamped;

        const container = document.getElementById('diamondSimPeriodContainer');
        if (container) {
            const btns = container.querySelectorAll('.diamond-sim-period-option');
            btns.forEach(btn => btn.classList.remove('active'));
        }
        const customInput = document.getElementById('diamondSimCustomSpinsInput');
        if (syncInput && customInput) customInput.value = String(diamondSimHistoryLimit);
        if (updateSummary) updateDiamondSimPreRunSummary();
    }

    function renderDiamondSimPeriodSelector() {
        const container = document.getElementById('diamondSimPeriodContainer');
        if (!container) return;
        const optionsHtml = DIAMOND_SIM_PERIOD_PRESETS.map(p => {
            const approx = formatApproxHoursFromSpins(p.spins);
            const displayText = p.id === '10k' ? `${approx}` : `${p.label}`;
            const title = p.id === '10k'
                ? `Banco completo: ${p.spins} giros • ${approx}`
                : `${p.spins} giros • ${approx}`;
            return `<button type="button" class="diamond-sim-period-option" data-preset="${p.id}" title="${title}">${displayText}</button>`;
        }).join('');

        container.innerHTML = `
            <div class="diamond-sim-period-title">Período da simulação</div>
            <div class="diamond-sim-period-options">${optionsHtml}</div>
            <div class="diamond-sim-custom-row">
                <div class="diamond-sim-custom-label">Giros (personalizado)</div>
                <input id="diamondSimCustomSpinsInput" class="diamond-sim-custom-input" type="number" inputmode="numeric" min="10" max="10000" step="1" />
                <div class="diamond-sim-custom-suffix">máx 10.000</div>
            </div>
            <div class="diamond-sim-period-note">Estimativa: ${DIAMOND_SIM_SPINS_PER_MINUTE} giros/min</div>
        `;

        if (!container.dataset.listenerAttached) {
            container.addEventListener('click', (event) => {
                const btn = event.target && event.target.closest ? event.target.closest('.diamond-sim-period-option') : null;
                if (!btn) return;
                const preset = btn.dataset.preset;
                setDiamondSimPeriodPreset(preset);
            });
            container.dataset.listenerAttached = '1';
        }

        const customInput = document.getElementById('diamondSimCustomSpinsInput');
        if (customInput && !customInput.dataset.listenerAttached) {
            customInput.value = String(diamondSimHistoryLimit);
            // ✅ IMPORTANTE: não reescrever o valor enquanto o usuário digita (senão não consegue apagar/substituir)
            customInput.addEventListener('input', () => {
                const raw = String(customInput.value || '');
                diamondSimPeriodPreset = 'custom';
                if (!raw) {
                    diamondSimHistoryLimitRaw = null;
                    updateDiamondSimPreRunSummary();
                    return;
                }
                const numeric = Number(raw);
                if (!Number.isFinite(numeric)) return;
                diamondSimHistoryLimitRaw = Math.floor(numeric);
                updateDiamondSimPreRunSummary();
            });
            customInput.addEventListener('blur', () => {
                const raw = String(customInput.value || '').trim();
                const clamped = clampDiamondSimHistoryLimit(raw);
                if (clamped == null) {
                    // volta para o padrão se ficou vazio/inválido
                    setDiamondSimPeriodPreset('12h');
                    return;
                }
                // aqui sim aplicamos o clamp e sincronizamos o input
                setDiamondSimCustomHistoryLimit(clamped, { syncInput: true });
            });
            customInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    customInput.blur();
                }
            });
            customInput.dataset.listenerAttached = '1';
        }
    }

    function openDiamondSimulationSetup(mode, levelId = null) {
        ensureDiamondSimulationView();
        enterDiamondSimulationView({ titleText: 'Simulação' });
        applyDiamondSimMode(mode, levelId);

        // Ao entrar na tela: não rodar simulação automaticamente
        diamondSimHasResults = false;
        setDiamondSimResultsVisible(false);
        updateDiamondSimRunButtonLabel();
        renderDiamondSimPeriodSelector();
        setDiamondSimPeriodPreset('12h');

        // Limpar apenas os resultados (mantém campos/config do nível na tela)
        clearDiamondSimulationResultsOnly({ cancelIfRunning: true });
        updateDiamondSimPreRunSummary();
    }

    function ensureDiamondSimulationView() {
        const levelsModal = document.getElementById('diamondLevelsModal');
        const body = levelsModal ? levelsModal.querySelector('.custom-pattern-modal-body') : null;
        if (!levelsModal || !body) return;

        if (document.getElementById('diamondSimView')) return;

        const view = document.createElement('div');
        view.id = 'diamondSimView';
        view.className = 'diamond-sim-view';
        view.style.display = 'none';
        view.innerHTML = `
            <div id="diamondSimPeriodContainer" class="diamond-sim-period"></div>
            <div id="diamondSimConfigContainer" class="diamond-sim-config"></div>
            <div class="diamond-sim-view-body">
                <div id="diamondSimulationSummary" class="diamond-sim-summary">
                    Configure e clique em <strong>Simular</strong> para ver o resultado aqui.
                </div>
                <div id="diamondSimulationProgress" class="diamond-sim-progress" style="display:none;">
                    <div class="spinner"></div>
                    <div id="diamondSimulationProgressText">Simulando...</div>
                    <div style="flex:1;"></div>
                    <button type="button" class="btn-save-pattern" id="diamondSimulationCancelBtn" style="max-width: 140px;">Cancelar</button>
                </div>

                <div class="entries-tabs-bar" id="diamondSimTabs" style="margin-top: 8px;" hidden>
                    <button type="button" class="entries-tab active" data-tab="signals">IA</button>
                    <button type="button" class="entries-tab" data-tab="chart">Gráfico</button>
                </div>

                <div class="diamond-sim-tabview" data-view="signals" hidden>
                    <div class="entries-header" style="margin-top: 8px;">
                        <div id="diamondSimEntriesHit" class="entries-hit"></div>
                    </div>
                    <div id="diamondSimEntriesList" class="entries-list sim-entries-list"></div>
                </div>

                <div class="diamond-sim-tabview" data-view="chart" hidden>
                    <div class="diamond-sim-chart-wrap">
                        <div class="diamond-sim-chart-row win">
                            <div class="diamond-sim-chart-label">WIN</div>
                            <div class="diamond-sim-chart-bar">
                                <div class="diamond-sim-chart-fill" id="diamondSimChartWinFill" style="width:0%"></div>
                            </div>
                            <div class="diamond-sim-chart-value" id="diamondSimChartWinValue">0 (0%)</div>
                        </div>
                        <div class="diamond-sim-chart-row loss">
                            <div class="diamond-sim-chart-label">LOSS</div>
                            <div class="diamond-sim-chart-bar">
                                <div class="diamond-sim-chart-fill" id="diamondSimChartLossFill" style="width:0%"></div>
                            </div>
                            <div class="diamond-sim-chart-value" id="diamondSimChartLossValue">0 (0%)</div>
                        </div>
                        <div class="diamond-sim-chart-foot" id="diamondSimChartFoot">Entradas: 0</div>

                        <div class="diamond-sim-equity-metrics">
                            <div class="diamond-sim-equity-metric">
                                <span class="label">Saldo</span>
                                <span class="value" id="diamondSimEquityBalance">R$ 0,00</span>
                            </div>
                            <div class="diamond-sim-equity-metric">
                                <span class="label">Lucro</span>
                                <span class="value" id="diamondSimEquityProfit">R$ 0,00</span>
                            </div>
                            <div class="diamond-sim-equity-metric">
                                <span class="label">Perdas (bruto)</span>
                                <span class="value" id="diamondSimEquityLoss">R$ 0,00</span>
                            </div>
                        </div>

                        <div class="diamond-sim-ticks-layer" id="diamondSimTicksLayer">
                            <svg class="diamond-sim-ticks-svg" id="diamondSimTicksSvg" viewBox="0 0 1000 160" preserveAspectRatio="none" aria-label="Gráfico por entrada">
                                <path id="diamondSimTicksBaseline" d="" />
                                <path id="diamondSimTicksMaxLine" d="" />
                                <path id="diamondSimTicksMinLine" d="" />
                                <path id="diamondSimTicksCurrentLine" d="" />
                                <path id="diamondSimTicksWinPath" d="" />
                                <path id="diamondSimTicksLossPath" d="" />
                            </svg>
                            <div class="diamond-sim-guide-label max" id="diamondSimGuideMax"></div>
                            <div class="diamond-sim-guide-label min" id="diamondSimGuideMin"></div>
                            <div class="diamond-sim-guide-label cur" id="diamondSimGuideCur"></div>
                            <div class="diamond-sim-direction" id="diamondSimGuideDir"></div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="diamond-sim-view-footer">
                <button type="button" class="btn-hot-pattern" id="diamondSimulationOptimizeBtn">Otimizar (100)</button>
                <button type="button" class="btn-save-pattern" id="diamondSimulationRunBtn">Simular novamente</button>
                <button type="button" class="btn-hot-pattern" id="diamondSimulationClearCloseBtn" title="Salva as configurações e fecha a simulação">Salvar e fechar</button>
            </div>
        `;

        // Inserir no topo do body
        body.insertBefore(view, body.firstChild);

        const optimizeBtn = document.getElementById('diamondSimulationOptimizeBtn');
        const runBtn = document.getElementById('diamondSimulationRunBtn');
        const clearCloseBtn = document.getElementById('diamondSimulationClearCloseBtn');
        const cancelBtn = document.getElementById('diamondSimulationCancelBtn');
        const tabsBar = document.getElementById('diamondSimTabs');

        if (tabsBar && !tabsBar.dataset.listenerAttached) {
            tabsBar.addEventListener('click', (event) => {
                const btn = event.target && event.target.closest ? event.target.closest('.entries-tab') : null;
                if (!btn) return;
                const tab = btn.dataset.tab;
                setDiamondSimActiveTab(tab);
            });
            tabsBar.dataset.listenerAttached = '1';
        }

        if (clearCloseBtn && !clearCloseBtn.dataset.listenerAttached) {
            // ✅ Salvar e fechar: persistir ajustes do nível (sem precisar clicar em "Salvar"), depois voltar para configurar níveis
            clearCloseBtn.addEventListener('click', async () => {
                try { await saveDiamondLevels({ silent: true, skipSync: true }); } catch (_) {}
                exitDiamondSimulationView({ cancelIfRunning: true, clear: true, closeModal: false });
            });
            clearCloseBtn.dataset.listenerAttached = '1';
        }
        if (runBtn && !runBtn.dataset.listenerAttached) {
            runBtn.addEventListener('click', () => {
                const mode = diamondSimCurrentMode || 'level';
                const levelId = diamondSimCurrentLevelId || null;
                if (mode === 'level' && !levelId) {
                    showCenteredNotice('Selecione um nível para simular.');
                    return;
                }
                startDiamondSimulation(mode, levelId);
            });
            runBtn.dataset.listenerAttached = '1';
        }
        if (optimizeBtn && !optimizeBtn.dataset.listenerAttached) {
            optimizeBtn.addEventListener('click', () => {
                const mode = diamondSimCurrentMode || 'level';
                const levelId = diamondSimCurrentLevelId || null;
                if (mode === 'all') {
                    startDiamondOptimizationAllActive();
                    return;
                }
                if (mode !== 'level' || !levelId) {
                    showCenteredNotice('Selecione um nível (ex.: N1) para otimizar.');
                    return;
                }
                startDiamondOptimization(levelId);
            });
            optimizeBtn.dataset.listenerAttached = '1';
        }
        if (cancelBtn && !cancelBtn.dataset.listenerAttached) {
            cancelBtn.addEventListener('click', () => {
                try {
                    if (diamondOptimizationRunning && diamondOptimizationJobId) {
                        chrome.runtime.sendMessage({ action: 'DIAMOND_OPTIMIZE_CANCEL', jobId: diamondOptimizationJobId });
                        return;
                    }
                    if (diamondSimulationJobId) {
                        chrome.runtime.sendMessage({ action: 'DIAMOND_SIMULATE_CANCEL', jobId: diamondSimulationJobId });
                    }
                } catch (err) {
                    console.warn('⚠️ Falha ao cancelar simulação:', err);
                }
            });
            cancelBtn.dataset.listenerAttached = '1';
        }
    }

    function setDiamondSimActiveTab(tab) {
        diamondSimActiveTab = tab || 'signals';
        const tabsBar = document.getElementById('diamondSimTabs');
        if (tabsBar) {
            const tabs = tabsBar.querySelectorAll('.entries-tab');
            tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        }
        const views = document.querySelectorAll('#diamondSimView .diamond-sim-tabview');
        views.forEach(v => {
            const isActive = v.getAttribute('data-view') === tab;
            if (isActive) v.removeAttribute('hidden');
            else v.setAttribute('hidden', '');
        });
    }

    function renderDiamondSimulationChart({ wins = 0, losses = 0, totalCycles = 0, totalEntries = 0 } = {}) {
        const winFill = document.getElementById('diamondSimChartWinFill');
        const lossFill = document.getElementById('diamondSimChartLossFill');
        const winValue = document.getElementById('diamondSimChartWinValue');
        const lossValue = document.getElementById('diamondSimChartLossValue');
        const foot = document.getElementById('diamondSimChartFoot');

        const denom = totalCycles > 0 ? totalCycles : 0;
        const winPct = denom ? (wins / denom) * 100 : 0;
        const lossPct = denom ? (losses / denom) * 100 : 0;

        if (winFill) winFill.style.width = `${Math.max(0, Math.min(100, winPct)).toFixed(1)}%`;
        if (lossFill) lossFill.style.width = `${Math.max(0, Math.min(100, lossPct)).toFixed(1)}%`;
        if (winValue) winValue.textContent = `${wins} (${winPct.toFixed(1)}%)`;
        if (lossValue) lossValue.textContent = `${losses} (${lossPct.toFixed(1)}%)`;
        if (foot) foot.textContent = `Entradas: ${totalEntries}`;
    }

    // ═══════════════════════════════════════════════════════════════
    // ✅ GRÁFICO NO MODO REAL (mesmos estilos do simulador)
    // ═══════════════════════════════════════════════════════════════

    function renderEntriesChart({ wins = 0, losses = 0, totalCycles = 0, totalEntries = 0 } = {}) {
        const winFill = document.getElementById('entriesChartWinFill');
        const lossFill = document.getElementById('entriesChartLossFill');
        const winValue = document.getElementById('entriesChartWinValue');
        const lossValue = document.getElementById('entriesChartLossValue');
        const foot = document.getElementById('entriesChartFoot');

        const denom = totalCycles > 0 ? totalCycles : 0;
        const winPct = denom ? (wins / denom) * 100 : 0;
        const lossPct = denom ? (losses / denom) * 100 : 0;

        if (winFill) winFill.style.width = `${Math.max(0, Math.min(100, winPct)).toFixed(1)}%`;
        if (lossFill) lossFill.style.width = `${Math.max(0, Math.min(100, lossPct)).toFixed(1)}%`;
        if (winValue) winValue.textContent = `${wins} (${winPct.toFixed(1)}%)`;
        if (lossValue) lossValue.textContent = `${losses} (${lossPct.toFixed(1)}%)`;
        if (foot) foot.textContent = `Entradas: ${totalEntries}`;
    }

    // ═══════════════════════════════════════════════════════════════
    // ✅ Helpers: Martingale stage -> índice (0=ENTRADA/G0, 1=G1, 2=G2...)
    //    Importante para o gráfico: algumas entradas intermediárias são inferidas via continuingToGx
    // ═══════════════════════════════════════════════════════════════
    function getStageIndexFromEntryLike(entry) {
        const raw = (entry && (entry.martingaleStage || entry.wonAt || entry.phase))
            ? String(entry.martingaleStage || entry.wonAt || entry.phase)
            : '';
        const s = raw.toUpperCase();
        if (s === 'ENTRADA' || s === 'G0') return 0;
        const m = s.match(/^G(\d+)$/);
        if (m) {
            const n = Number(m[1]);
            return Number.isFinite(n) && n >= 0 ? n : 0;
        }

        // Fallback: continuingToG2=true => este LOSS ocorreu em G1 (índice 1)
        if (entry && typeof entry === 'object') {
            for (const key in entry) {
                if (!Object.prototype.hasOwnProperty.call(entry, key)) continue;
                if (!entry[key]) continue;
                const mm = String(key).match(/^continuingToG(\d+)$/i);
                if (mm) {
                    const next = Number(mm[1]);
                    if (Number.isFinite(next) && next >= 1) return Math.max(0, next - 1);
                }
            }
        }
        return 0;
    }

    function computeEntriesProfitSnapshot(allEntries, autoBetConfig) {
        const cfg = autoBetConfig && typeof autoBetConfig === 'object' ? autoBetConfig : {};
        const initialBank = Number(cfg.simulationBankRoll ?? 5000) || 5000;
        const entries = Array.isArray(allEntries) ? allEntries : [];

        // ✅ Regra do painel:
        // - Lucro/Perdas = resultado LÍQUIDO de ciclos finalizados (WIN/RED)
        // - Perdas intermediárias (G0/G1...) NÃO contam como "perda" se o ciclo fechou WIN.
        // - Não recalcular passado com config atual: preferir campos gravados no entry (stake/cycleNetProfit).
        const finals = entries.filter(e => e && (e.finalResult === 'WIN' || e.finalResult === 'RED' || e.finalResult === 'RET'));

        const inferNetFromSnapshots = (e) => {
            const base = Math.max(0.01, Number(e?.baseStakeSnapshot ?? cfg.baseStake ?? 2) || 2);
            const mult = Math.max(1, Number(e?.galeMultiplierSnapshot ?? cfg.galeMultiplier ?? 2) || 2);
            const stageIdx = getStageIndexFromEntryLike(e);
            const stake = Number(e?.stakeAmount) || Number((base * Math.pow(mult, stageIdx)).toFixed(2));
            const totalInvested = (() => {
                let sum = 0;
                for (let i = 0; i <= stageIdx; i++) sum += base * Math.pow(mult, i);
                return Number(sum.toFixed(2));
            })();
            const payoutMult = Math.max(2, Number(e?.payoutMultiplier) || 2);
            if (e?.finalResult === 'WIN') return Number(((stake * payoutMult) - totalInvested).toFixed(2));
            return Number((-totalInvested).toFixed(2));
        };

        let profitNet = 0;
        let profitEarned = 0;
        let lossSpent = 0;

        for (const e of finals) {
            let net = Number(e?.cycleNetProfit);
            if (!Number.isFinite(net)) {
                net = inferNetFromSnapshots(e);
            }
            profitNet = Number((profitNet + net).toFixed(2));
            if (net > 0) profitEarned = Number((profitEarned + net).toFixed(2));
            else if (net < 0) lossSpent = Number((lossSpent + Math.abs(net)).toFixed(2));
        }

        // ✅ "Perdas" exibido = somente quando o resultado líquido está negativo
        const lossDisplay = profitNet < 0 ? Math.abs(profitNet) : 0;

        const balance = Number((initialBank + profitNet).toFixed(2));
        return { initialBank, balance, profit: profitNet, profitEarned, loss: lossDisplay, lossSpent };
    }

    let entriesTickZoomState = { points: 0, zoom: 1, x: 0, baseW: 1, baseH: 160 };
    let entriesLastEntriesForChart = [];

    function attachEntriesZoomHandlers(svg) {
        if (!svg || svg.dataset.zoomBound === '1') return;

        svg.addEventListener('wheel', (event) => {
            try { event.preventDefault(); } catch (_) {}

            const state = entriesTickZoomState || { points: 0, zoom: 1, x: 0, baseW: 1, baseH: 120 };
            const bbox = svg.getBoundingClientRect();
            if (!bbox || bbox.width <= 0) return;

            const mouseRatioX = Math.max(0, Math.min(1, (event.clientX - bbox.left) / bbox.width));
            const mouseVx = (state.x || 0) + mouseRatioX * (state.baseW / (state.zoom || 1));

            const delta = Math.sign(event.deltaY || 0);
            const zoomFactor = delta < 0 ? 1.12 : 1 / 1.12;
            let nextZoom = (state.zoom || 1) * zoomFactor;
            nextZoom = Math.max(0.6, Math.min(10, nextZoom));

            const nextWidth = state.baseW / nextZoom;
            let nextX = mouseVx - mouseRatioX * nextWidth;
            nextX = Math.max(0, Math.min(Math.max(0, state.baseW - nextWidth), nextX));

            entriesTickZoomState = { ...state, zoom: nextZoom, x: nextX };
            renderEntriesTickChart(entriesLastEntriesForChart);
        }, { passive: false });

        let dragging = false;
        let dragStartClientX = 0;
        let dragStartX = 0;

        const onPointerDown = (event) => {
            if (!event || event.button !== 0) return;
            dragging = true;
            dragStartClientX = event.clientX;
            dragStartX = entriesTickZoomState?.x || 0;
            try { svg.setPointerCapture(event.pointerId); } catch (_) {}
            svg.style.cursor = 'grabbing';
        };
        const onPointerMove = (event) => {
            if (!dragging) return;
            const state = entriesTickZoomState || { points: 0, zoom: 1, x: 0, baseW: 1, baseH: 120 };
            const bbox = svg.getBoundingClientRect();
            if (!bbox || bbox.width <= 0) return;
            const viewW = state.baseW / (state.zoom || 1);
            const dxPx = event.clientX - dragStartClientX;
            const dxV = (dxPx / bbox.width) * viewW;
            let nextX = dragStartX - dxV;
            nextX = Math.max(0, Math.min(Math.max(0, state.baseW - viewW), nextX));
            entriesTickZoomState = { ...state, x: nextX };
            renderEntriesTickChart(entriesLastEntriesForChart);
        };
        const onPointerUp = () => {
            if (!dragging) return;
            dragging = false;
            svg.style.cursor = 'grab';
        };

        svg.addEventListener('pointerdown', onPointerDown);
        svg.addEventListener('pointermove', onPointerMove);
        svg.addEventListener('pointerup', onPointerUp);
        svg.addEventListener('pointercancel', onPointerUp);

        svg.style.cursor = 'grab';
        svg.dataset.zoomBound = '1';
    }

    function renderEntriesTickChart(entries) {
        const balanceEl = document.getElementById('entriesEquityBalance');
        const lossEl = document.getElementById('entriesEquityLoss');
        const svg = document.getElementById('entriesTicksSvg');
        const baselineEl = document.getElementById('entriesTicksBaseline');
        const maxLineEl = document.getElementById('entriesTicksMaxLine');
        const minLineEl = document.getElementById('entriesTicksMinLine');
        const currentLineEl = document.getElementById('entriesTicksCurrentLine');
        const winPathEl = document.getElementById('entriesTicksWinPath');
        const lossPathEl = document.getElementById('entriesTicksLossPath');
        if (!balanceEl || !lossEl || !svg || !baselineEl || !maxLineEl || !minLineEl || !currentLineEl || !winPathEl || !lossPathEl) return;

        attachEntriesZoomHandlers(svg);

        const allEntries = Array.isArray(entries) ? entries : [];
        entriesLastEntriesForChart = allEntries;
        const rawConfig = (latestAnalyzerConfig && latestAnalyzerConfig.autoBetConfig) ? latestAnalyzerConfig.autoBetConfig : null;
        const autoBetConfig = (typeof sanitizeAutoBetConfig === 'function')
            ? sanitizeAutoBetConfig(rawConfig)
            : (rawConfig || {});

        const snapshot = computeEntriesProfitSnapshot(allEntries, autoBetConfig);
        balanceEl.textContent = formatCurrencyBRL(snapshot.balance);
        lossEl.textContent = formatCurrencyBRL(snapshot.loss);

        const stageIndexFromEntry = (e) => getStageIndexFromEntryLike(e);
        const resolveBetColor = (e) => {
            const raw = e && e.patternData && e.patternData.color ? e.patternData.color : null;
            const c = String(raw || '').toLowerCase();
            if (c === 'red' || c === 'black' || c === 'white') return c;
            return 'red';
        };

        const attemptsChron = allEntries
            .filter(e => e && (e.result === 'WIN' || e.result === 'LOSS'))
            .slice()
            .reverse();

        const vbH = 160;
        const padY = 8;
        const n = attemptsChron.length;
        const contentW = Math.max(1, n - 1);
        const vbW = (n <= 3) ? 30 : contentW;
        if (!entriesTickZoomState || entriesTickZoomState.points !== n || entriesTickZoomState.baseW !== vbW) {
            entriesTickZoomState = { points: n, zoom: 1, x: 0, baseW: vbW, baseH: vbH };
        } else {
            entriesTickZoomState = { ...entriesTickZoomState, baseW: vbW, baseH: vbH };
        }
        const state = entriesTickZoomState;
        const viewW = state.baseW / (state.zoom || 1);
        const viewX = Math.max(0, Math.min(Math.max(0, state.baseW - viewW), state.x || 0));
        entriesTickZoomState = { ...state, x: viewX };
        svg.setAttribute('viewBox', `${viewX.toFixed(3)} 0 ${viewW.toFixed(3)} ${vbH}`);

        const galeMult = Math.max(1, Number(autoBetConfig.galeMultiplier ?? 2) || 2);
        const baseStake = Math.max(0.01, Number(autoBetConfig.baseStake ?? 2) || 2);
        const whitePayoutMultiplier = Math.max(2, Number(autoBetConfig.whitePayoutMultiplier ?? 14) || 14);

        const deltas = attemptsChron.map(e => {
            const stageIdx = stageIndexFromEntry(e);
            const stake = Number(e?.stakeAmount) || Number((baseStake * Math.pow(galeMult, stageIdx)).toFixed(2));
            const betColor = String(e?.betColor || (e?.patternData?.color ?? '')).toLowerCase() || resolveBetColor(e);
            const payoutMult = Math.max(2, Number(e?.payoutMultiplier) || (betColor === 'white' ? whitePayoutMultiplier : 2));
            const delta = e.result === 'WIN'
                ? Number((stake * (payoutMult - 1)).toFixed(2))
                : Number((-stake).toFixed(2));
            return { e, delta };
        });

        let yPrevValue = 0;
        const segments = deltas.map(({ e, delta }, idx) => {
            const yNextValue = Number((yPrevValue + delta).toFixed(2));
            const seg = { idx, e, delta, y0: yPrevValue, y1: yNextValue };
            yPrevValue = yNextValue;
            return seg;
        });

        const values = [0, ...segments.map(s => s.y0), ...segments.map(s => s.y1)];
        let minV = Math.min(...values);
        let maxV = Math.max(...values);
        if (!Number.isFinite(minV) || !Number.isFinite(maxV)) { minV = -1; maxV = 1; }
        if (Math.abs(maxV - minV) < 0.01) { maxV += 1; minV -= 1; }
        const range = maxV - minV;
        minV -= range * 0.08;
        maxV += range * 0.08;

        const yScale = (val) => {
            const t = (val - minV) / (maxV - minV);
            return (vbH - padY) - (t * (vbH - padY * 2));
        };

        const yZero = yScale(0);
        const xStart = viewX;
        const xEnd = viewX + viewW;

        baselineEl.setAttribute('d', `M ${xStart.toFixed(2)} ${yZero.toFixed(2)} L ${xEnd.toFixed(2)} ${yZero.toFixed(2)}`);
        baselineEl.setAttribute('fill', 'none');
        baselineEl.setAttribute('stroke', 'rgba(200,214,233,0.22)');
        baselineEl.setAttribute('stroke-width', '0.7');
        baselineEl.setAttribute('vector-effect', 'non-scaling-stroke');

        const maxGuideVal = Math.max(...values);
        const minGuideVal = Math.min(...values);
        const currentGuideVal = segments.length ? segments[segments.length - 1].y1 : 0;
        const yMax = yScale(maxGuideVal);
        const yMin = yScale(minGuideVal);
        const yCur = yScale(currentGuideVal);

        maxLineEl.setAttribute('d', `M ${xStart.toFixed(2)} ${yMax.toFixed(2)} L ${xEnd.toFixed(2)} ${yMax.toFixed(2)}`);
        maxLineEl.setAttribute('fill', 'none');
        maxLineEl.setAttribute('stroke', 'rgba(34,197,94,0.55)');
        maxLineEl.setAttribute('stroke-width', '0.55');
        maxLineEl.setAttribute('vector-effect', 'non-scaling-stroke');

        minLineEl.setAttribute('d', `M ${xStart.toFixed(2)} ${yMin.toFixed(2)} L ${xEnd.toFixed(2)} ${yMin.toFixed(2)}`);
        minLineEl.setAttribute('fill', 'none');
        minLineEl.setAttribute('stroke', 'rgba(239,68,68,0.55)');
        minLineEl.setAttribute('stroke-width', '0.55');
        minLineEl.setAttribute('vector-effect', 'non-scaling-stroke');

        currentLineEl.setAttribute('d', `M ${xStart.toFixed(2)} ${yCur.toFixed(2)} L ${xEnd.toFixed(2)} ${yCur.toFixed(2)}`);
        currentLineEl.setAttribute('fill', 'none');
        currentLineEl.setAttribute('stroke', 'rgba(255,255,255,0.6)');
        currentLineEl.setAttribute('stroke-width', '0.55');
        currentLineEl.setAttribute('vector-effect', 'non-scaling-stroke');

        let dWin = '';
        let dLoss = '';
        const xOffset = vbW - contentW;
        for (const s of segments) {
            const xRaw = (n === 1 ? 0 : s.idx);
            const x = (n <= 3) ? Math.min(vbW - 0.5, xOffset + xRaw) : xRaw;
            const y0 = yScale(s.y0);
            const y1 = yScale(s.y1);
            const pathSeg = `M ${x} ${y0.toFixed(2)} L ${x} ${y1.toFixed(2)} `;
            if (s.delta >= 0) dWin += pathSeg;
            else dLoss += pathSeg;
        }

        const strokeW = n > 600 ? '0.22' : (n > 300 ? '0.35' : (n > 120 ? '0.55' : '0.85'));

        winPathEl.setAttribute('d', dWin.trim());
        winPathEl.setAttribute('fill', 'none');
        winPathEl.setAttribute('stroke', '#22c55e');
        winPathEl.setAttribute('stroke-width', strokeW);
        winPathEl.setAttribute('stroke-linecap', 'butt');

        lossPathEl.setAttribute('d', dLoss.trim());
        lossPathEl.setAttribute('fill', 'none');
        lossPathEl.setAttribute('stroke', '#ef4444');
        lossPathEl.setAttribute('stroke-width', strokeW);
        lossPathEl.setAttribute('stroke-linecap', 'butt');

        const layer = svg.parentElement;
        const labelMax = layer ? layer.querySelector('#entriesGuideMax') : null;
        const labelMin = layer ? layer.querySelector('#entriesGuideMin') : null;
        const labelCur = layer ? layer.querySelector('#entriesGuideCur') : null;
        const dir = layer ? layer.querySelector('#entriesGuideDir') : null;
        if (dir) dir.textContent = 'Esquerda: Antigo • Direita: Recente';

        const bbox = svg.getBoundingClientRect();
        if (bbox && bbox.height > 0) {
            const yToPx = (y) => (y / vbH) * bbox.height;
            const maxBal = snapshot.initialBank + maxGuideVal;
            const minBal = snapshot.initialBank + minGuideVal;
            const curBal = snapshot.initialBank + currentGuideVal;

            const plusText = (v) => `+${formatCurrencyBRL(Math.abs(v))}`;
            const minusText = (v) => `-${formatCurrencyBRL(Math.abs(v))}`;

            const maxTop = Math.max(0, yToPx(yMax) - 14);
            const minTop = Math.min(bbox.height - 12, yToPx(yMin) + 4);
            let curTop = Math.max(0, yToPx(yCur) - 14);
            if (Math.abs(curTop - minTop) < 14) {
                curTop = Math.max(0, minTop - 18);
            }

            if (labelMax) {
                labelMax.textContent = `${plusText(maxGuideVal)}`;
                labelMax.title = `Máximo: ${formatCurrencyBRL(maxBal)}`;
                labelMax.style.top = `${maxTop}px`;
            }
            if (labelMin) {
                labelMin.textContent = `${minusText(minGuideVal)}`;
                labelMin.title = `Mínimo: ${formatCurrencyBRL(minBal)}`;
                labelMin.style.top = `${minTop}px`;
            }
            if (labelCur) {
                labelCur.textContent = `${formatCurrencyBRL(curBal)}`;
                labelCur.title = `Atual: ${formatCurrencyBRL(curBal)}`;
                labelCur.style.top = `${curTop}px`;
                labelCur.style.left = 'auto';
                labelCur.style.right = '8px';
            }
        }
    }

    function computeDiamondSimulationProfitSnapshot(allEntries, autoBetConfig) {
        const entries = Array.isArray(allEntries) ? allEntries : [];
        const cfg = autoBetConfig && typeof autoBetConfig === 'object' ? autoBetConfig : {};
        const initialBank = Number(cfg.simulationBankRoll ?? 5000) || 5000;
        const baseStake = Math.max(0.01, Number(cfg.baseStake ?? 2) || 2);
        const galeMult = Math.max(1, Number(cfg.galeMultiplier ?? 2) || 2);
        const whitePayoutMultiplier = Math.max(2, Number(cfg.whitePayoutMultiplier ?? 14) || 14);

        const stageIndexFromEntry = (e) => getStageIndexFromEntryLike(e);

        const resolveBetColor = (e) => {
            const raw =
                (e && e.analysis && e.analysis.color) ? e.analysis.color
                : (e && e.patternData && e.patternData.color) ? e.patternData.color
                : (e && e.betColor) ? e.betColor
                : null;
            const c = String(raw || '').toLowerCase();
            if (c === 'red' || c === 'black' || c === 'white') return c;
            if (c === 'vermelho') return 'red';
            if (c === 'preto') return 'black';
            if (c === 'branco') return 'white';
            return 'red';
        };

        const attemptsChron = entries
            .filter(e => e && (e.result === 'WIN' || e.result === 'LOSS'))
            .slice()
            .reverse();

        let profitNet = 0;
        let profitEarned = 0;
        let lossSpent = 0;

        for (const e of attemptsChron) {
            const stageIdx = stageIndexFromEntry(e);
            const stake = Number((baseStake * Math.pow(galeMult, stageIdx)).toFixed(2));
            const betColor = resolveBetColor(e);
            const payoutMult = betColor === 'white' ? whitePayoutMultiplier : 2;
            const delta = e.result === 'WIN'
                ? Number((stake * (payoutMult - 1)).toFixed(2))
                : Number((-stake).toFixed(2));

            profitNet = Number((profitNet + delta).toFixed(2));
            if (delta > 0) profitEarned = Number((profitEarned + delta).toFixed(2));
            else if (delta < 0) lossSpent = Number((lossSpent + Math.abs(delta)).toFixed(2));
        }

        const balance = Number((initialBank + profitNet).toFixed(2));
        return {
            initialBank,
            balance,
            profit: profitNet,
            profitEarned,
            loss: lossSpent,
            lossSpent,
            baseStake,
            galeMult
        };
    }

    let diamondSimTickZoomState = { points: 0, zoom: 1, x: 0, baseW: 1, baseH: 160 };
    let diamondSimLastEntriesForChart = [];

    function attachDiamondSimZoomHandlers(svg) {
        if (!svg || svg.dataset.zoomBound === '1') return;
        // Zoom horizontal com wheel, ancorado no mouse
        svg.addEventListener('wheel', (event) => {
            try {
                event.preventDefault();
            } catch (_) {}

            const state = diamondSimTickZoomState || { points: 0, zoom: 1, x: 0, baseW: 1, baseH: 120 };
            const bbox = svg.getBoundingClientRect();
            if (!bbox || bbox.width <= 0) return;

            const mouseRatioX = Math.max(0, Math.min(1, (event.clientX - bbox.left) / bbox.width));
            const mouseVx = (state.x || 0) + mouseRatioX * (state.baseW / (state.zoom || 1));

            const delta = Math.sign(event.deltaY || 0);
            const zoomFactor = delta < 0 ? 1.12 : 1 / 1.12;
            let nextZoom = (state.zoom || 1) * zoomFactor;
            nextZoom = Math.max(0.6, Math.min(10, nextZoom));

            const nextWidth = state.baseW / nextZoom;
            let nextX = mouseVx - mouseRatioX * nextWidth;
            nextX = Math.max(0, Math.min(Math.max(0, state.baseW - nextWidth), nextX));

            diamondSimTickZoomState = { ...state, zoom: nextZoom, x: nextX };
            // rerender para manter linhas guia e labels corretos (sem "encolher" com o zoom)
            renderDiamondSimulationTickChart(diamondSimLastEntriesForChart);
        }, { passive: false });

        // Arrastar para pan (somente eixo X)
        let dragging = false;
        let dragStartClientX = 0;
        let dragStartX = 0;

        const onPointerDown = (event) => {
            if (!event || event.button !== 0) return;
            dragging = true;
            dragStartClientX = event.clientX;
            dragStartX = diamondSimTickZoomState?.x || 0;
            try { svg.setPointerCapture(event.pointerId); } catch (_) {}
            svg.style.cursor = 'grabbing';
        };
        const onPointerMove = (event) => {
            if (!dragging) return;
            const state = diamondSimTickZoomState || { points: 0, zoom: 1, x: 0, baseW: 1, baseH: 120 };
            const bbox = svg.getBoundingClientRect();
            if (!bbox || bbox.width <= 0) return;
            const viewW = state.baseW / (state.zoom || 1);
            const dxPx = event.clientX - dragStartClientX;
            const dxV = (dxPx / bbox.width) * viewW;
            let nextX = dragStartX - dxV;
            nextX = Math.max(0, Math.min(Math.max(0, state.baseW - viewW), nextX));
            diamondSimTickZoomState = { ...state, x: nextX };
            renderDiamondSimulationTickChart(diamondSimLastEntriesForChart);
        };
        const onPointerUp = () => {
            if (!dragging) return;
            dragging = false;
            svg.style.cursor = 'grab';
        };

        svg.addEventListener('pointerdown', onPointerDown);
        svg.addEventListener('pointermove', onPointerMove);
        svg.addEventListener('pointerup', onPointerUp);
        svg.addEventListener('pointercancel', onPointerUp);

        svg.dataset.zoomBound = '1';
    }

    function renderDiamondSimulationTickChart(entries) {
        const balanceEl = document.getElementById('diamondSimEquityBalance');
        const profitEl = document.getElementById('diamondSimEquityProfit');
        const lossEl = document.getElementById('diamondSimEquityLoss');
        const svg = document.getElementById('diamondSimTicksSvg');
        const baselineEl = document.getElementById('diamondSimTicksBaseline');
        const maxLineEl = document.getElementById('diamondSimTicksMaxLine');
        const minLineEl = document.getElementById('diamondSimTicksMinLine');
        const currentLineEl = document.getElementById('diamondSimTicksCurrentLine');
        const winPathEl = document.getElementById('diamondSimTicksWinPath');
        const lossPathEl = document.getElementById('diamondSimTicksLossPath');
        if (!balanceEl || !profitEl || !lossEl || !svg || !baselineEl || !maxLineEl || !minLineEl || !currentLineEl || !winPathEl || !lossPathEl) return;

        attachDiamondSimZoomHandlers(svg);

        const allEntries = Array.isArray(entries) ? entries : [];
        diamondSimLastEntriesForChart = allEntries;
        const rawConfig = (latestAnalyzerConfig && latestAnalyzerConfig.autoBetConfig) ? latestAnalyzerConfig.autoBetConfig : null;
        const autoBetConfig = (typeof sanitizeAutoBetConfig === 'function')
            ? sanitizeAutoBetConfig(rawConfig)
            : (rawConfig || {});

        const snapshot = computeDiamondSimulationProfitSnapshot(allEntries, autoBetConfig);
        balanceEl.textContent = formatCurrencyBRL(snapshot.balance);
        profitEl.textContent = snapshot.profit >= 0
            ? `+${formatCurrencyBRL(snapshot.profit)}`
            : formatCurrencyBRL(snapshot.profit);
        lossEl.textContent = formatCurrencyBRL(snapshot.loss);

        const stageIndexFromEntry = (e) => getStageIndexFromEntryLike(e);
        const resolveBetColor = (e) => {
            const raw = e && e.patternData && e.patternData.color ? e.patternData.color : null;
            const c = String(raw || '').toLowerCase();
            if (c === 'red' || c === 'black' || c === 'white') return c;
            return 'red';
        };

        // ✅ Agora é cumulativo (como no seu desenho): cada tracinho começa onde o anterior terminou.
        // Ordem: igual aos sinais (histórico é newest-first) → inverter para desenhar da esquerda p/ direita em ordem cronológica.
        const attemptsChron = allEntries
            .filter(e => e && (e.result === 'WIN' || e.result === 'LOSS'))
            .slice()
            .reverse();

        const vbH = 160;
        const padY = 8;
        const n = attemptsChron.length;
        const contentW = Math.max(1, n - 1);
        const vbW = (n <= 3) ? 30 : contentW;
        // manter zoom se for o mesmo dataset; caso contrário resetar
        if (!diamondSimTickZoomState || diamondSimTickZoomState.points !== n || diamondSimTickZoomState.baseW !== vbW) {
            diamondSimTickZoomState = { points: n, zoom: 1, x: 0, baseW: vbW, baseH: vbH };
        } else {
            diamondSimTickZoomState = { ...diamondSimTickZoomState, baseW: vbW, baseH: vbH };
        }
        const state = diamondSimTickZoomState;
        const viewW = state.baseW / (state.zoom || 1);
        const viewX = Math.max(0, Math.min(Math.max(0, state.baseW - viewW), state.x || 0));
        diamondSimTickZoomState = { ...state, x: viewX };
        svg.setAttribute('viewBox', `${viewX.toFixed(3)} 0 ${viewW.toFixed(3)} ${vbH}`);

        const galeMult = Math.max(1, Number(snapshot.galeMult) || 2);
        const baseStake = Math.max(0.01, Number(snapshot.baseStake) || 2);
        const whitePayoutMultiplier = Math.max(2, Number(autoBetConfig.whitePayoutMultiplier ?? 14) || 14);

        // deltas por tentativa (impacto real da entrada): LOSS = -stake; WIN = +stake*(payout-1)
        const deltas = attemptsChron.map(e => {
            const stageIdx = stageIndexFromEntry(e);
            const stake = Number((baseStake * Math.pow(galeMult, stageIdx)).toFixed(2));
            const betColor = resolveBetColor(e);
            const payoutMult = betColor === 'white' ? whitePayoutMultiplier : 2;
            const delta = e.result === 'WIN'
                ? Number((stake * (payoutMult - 1)).toFixed(2))
                : Number((-stake).toFixed(2));
            return { e, delta };
        });

        // série cumulativa
        let yPrevValue = 0;
        const segments = deltas.map(({ e, delta }, idx) => {
            const yNextValue = Number((yPrevValue + delta).toFixed(2));
            const seg = { idx, e, delta, y0: yPrevValue, y1: yNextValue };
            yPrevValue = yNextValue;
            return seg;
        });

        const values = [0, ...segments.map(s => s.y0), ...segments.map(s => s.y1)];
        let minV = Math.min(...values);
        let maxV = Math.max(...values);
        if (!Number.isFinite(minV) || !Number.isFinite(maxV)) { minV = -1; maxV = 1; }
        if (Math.abs(maxV - minV) < 0.01) { maxV += 1; minV -= 1; }
        // padding proporcional
        const range = maxV - minV;
        minV -= range * 0.08;
        maxV += range * 0.08;

        const yScale = (val) => {
            const t = (val - minV) / (maxV - minV);
            return (vbH - padY) - (t * (vbH - padY * 2));
        };

        // baseline no zero (lucro 0)
        const yZero = yScale(0);
        // Linhas devem ocupar SEMPRE toda a janela visível (não "encolher" com o zoom)
        const xStart = viewX;
        const xEnd = viewX + viewW;

        baselineEl.setAttribute('d', `M ${xStart.toFixed(2)} ${yZero.toFixed(2)} L ${xEnd.toFixed(2)} ${yZero.toFixed(2)}`);
        baselineEl.setAttribute('fill', 'none');
        baselineEl.setAttribute('stroke', 'rgba(200,214,233,0.22)');
        baselineEl.setAttribute('stroke-width', '0.7');
        baselineEl.setAttribute('vector-effect', 'non-scaling-stroke');

        // linhas guia: topo (máximo), fundo (mínimo) e atual (último ponto)
        const maxGuideVal = Math.max(...values);
        const minGuideVal = Math.min(...values);
        const currentGuideVal = segments.length ? segments[segments.length - 1].y1 : 0;
        const yMax = yScale(maxGuideVal);
        const yMin = yScale(minGuideVal);
        const yCur = yScale(currentGuideVal);

        maxLineEl.setAttribute('d', `M ${xStart.toFixed(2)} ${yMax.toFixed(2)} L ${xEnd.toFixed(2)} ${yMax.toFixed(2)}`);
        maxLineEl.setAttribute('fill', 'none');
        maxLineEl.setAttribute('stroke', 'rgba(34,197,94,0.55)');
        maxLineEl.setAttribute('stroke-width', '0.55');
        maxLineEl.setAttribute('vector-effect', 'non-scaling-stroke');

        minLineEl.setAttribute('d', `M ${xStart.toFixed(2)} ${yMin.toFixed(2)} L ${xEnd.toFixed(2)} ${yMin.toFixed(2)}`);
        minLineEl.setAttribute('fill', 'none');
        minLineEl.setAttribute('stroke', 'rgba(239,68,68,0.55)');
        minLineEl.setAttribute('stroke-width', '0.55');
        minLineEl.setAttribute('vector-effect', 'non-scaling-stroke');

        currentLineEl.setAttribute('d', `M ${xStart.toFixed(2)} ${yCur.toFixed(2)} L ${xEnd.toFixed(2)} ${yCur.toFixed(2)}`);
        currentLineEl.setAttribute('fill', 'none');
        currentLineEl.setAttribute('stroke', 'rgba(255,255,255,0.6)');
        currentLineEl.setAttribute('stroke-width', '0.55');
        currentLineEl.setAttribute('vector-effect', 'non-scaling-stroke');

        // desenhar segmentos verticais começando do fim do anterior (efeito "andando")
        let dWin = '';
        let dLoss = '';
        const xOffset = vbW - contentW;
        for (const s of segments) {
            const xRaw = (n === 1 ? 0 : s.idx);
            const x = (n <= 3) ? Math.min(vbW - 0.5, xOffset + xRaw) : xRaw;
            const y0 = yScale(s.y0);
            const y1 = yScale(s.y1);
            const pathSeg = `M ${x} ${y0.toFixed(2)} L ${x} ${y1.toFixed(2)} `;
            if (s.delta >= 0) dWin += pathSeg;
            else dLoss += pathSeg;
        }

        // deixar mais "colado" quando há poucos pontos
        const strokeW = n > 600 ? '0.22' : (n > 300 ? '0.35' : (n > 120 ? '0.55' : '0.85'));

        winPathEl.setAttribute('d', dWin.trim());
        winPathEl.setAttribute('fill', 'none');
        winPathEl.setAttribute('stroke', '#22c55e');
        winPathEl.setAttribute('stroke-width', strokeW);
        winPathEl.setAttribute('stroke-linecap', 'butt');

        lossPathEl.setAttribute('d', dLoss.trim());
        lossPathEl.setAttribute('fill', 'none');
        lossPathEl.setAttribute('stroke', '#ef4444');
        lossPathEl.setAttribute('stroke-width', strokeW);
        lossPathEl.setAttribute('stroke-linecap', 'butt');

        // Labels de valores nas linhas (no início da janela visível)
        const layer = svg.parentElement;
        const labelMax = layer ? layer.querySelector('#diamondSimGuideMax') : null;
        const labelMin = layer ? layer.querySelector('#diamondSimGuideMin') : null;
        const labelCur = layer ? layer.querySelector('#diamondSimGuideCur') : null;
        const dir = layer ? layer.querySelector('#diamondSimGuideDir') : null;
        if (dir) {
            dir.textContent = 'Esquerda: Antigo • Direita: Recente';
        }
        const bbox = svg.getBoundingClientRect();
        if (bbox && bbox.height > 0) {
            const yToPx = (y) => (y / vbH) * bbox.height;
            const maxBal = snapshot.initialBank + maxGuideVal;
            const minBal = snapshot.initialBank + minGuideVal;
            const curBal = snapshot.initialBank + currentGuideVal;

            // Texto curto (como você pediu): só +R$xx / -R$xx
            const plusText = (v) => `+${formatCurrencyBRL(Math.abs(v))}`;
            const minusText = (v) => `-${formatCurrencyBRL(Math.abs(v))}`;

            const maxTop = Math.max(0, yToPx(yMax) - 14);     // acima da linha verde
            const minTop = Math.min(bbox.height - 12, yToPx(yMin) + 4); // abaixo da linha vermelha
            let curTop = Math.max(0, yToPx(yCur) - 14);       // acima da linha branca

            // evitar sobreposição vertical entre ATUAL e MIN quando estiverem próximos
            if (Math.abs(curTop - minTop) < 14) {
                curTop = Math.max(0, minTop - 18);
            }

            if (labelMax) {
                labelMax.textContent = `${plusText(maxGuideVal)}`;
                labelMax.title = `Máximo: ${formatCurrencyBRL(maxBal)}`;
                labelMax.style.top = `${maxTop}px`;
            }
            if (labelMin) {
                labelMin.textContent = `${minusText(minGuideVal)}`;
                labelMin.title = `Mínimo: ${formatCurrencyBRL(minBal)}`;
                labelMin.style.top = `${minTop}px`;
            }
            if (labelCur) {
                labelCur.textContent = `${formatCurrencyBRL(curBal)}`;
                labelCur.title = `Atual: ${formatCurrencyBRL(curBal)}`;
                labelCur.style.top = `${curTop}px`;
                labelCur.style.left = 'auto';
                labelCur.style.right = '8px';
            }
        }
    }

    function clearDiamondSimulationResultsOnly({ cancelIfRunning = false } = {}) {
        if (cancelIfRunning && diamondSimulationRunning && diamondSimulationJobId) {
            try {
                chrome.runtime.sendMessage({ action: 'DIAMOND_SIMULATE_CANCEL', jobId: diamondSimulationJobId });
            } catch (_) {}
        }
        if (cancelIfRunning && diamondOptimizationRunning && diamondOptimizationJobId) {
            try {
                chrome.runtime.sendMessage({ action: 'DIAMOND_OPTIMIZE_CANCEL', jobId: diamondOptimizationJobId });
            } catch (_) {}
        }
        diamondSimulationJobId = null;
        diamondSimulationRunning = false;
        diamondOptimizationJobId = null;
        diamondOptimizationRunning = false;
        diamondSimBusyKind = null;

        const summary = document.getElementById('diamondSimulationSummary');
        const list = document.getElementById('diamondSimEntriesList');
        const hitEl = document.getElementById('diamondSimEntriesHit');
        const progress = document.getElementById('diamondSimulationProgress');
        const progressText = document.getElementById('diamondSimulationProgressText');
        if (summary) summary.innerHTML = 'Selecione o período e clique em <strong>Simular</strong> para ver o resultado aqui.';
        if (list) list.innerHTML = '';
        if (hitEl) hitEl.innerHTML = '';
        if (progress) progress.style.display = 'none';
        if (progressText) progressText.textContent = 'Simulando...';

        renderDiamondSimulationChart({ wins: 0, losses: 0, totalCycles: 0, totalEntries: 0 });
        renderDiamondSimulationTickChart([]);
        setDiamondSimActiveTab('signals');
        diamondSimHasResults = false;
        setDiamondSimResultsVisible(false);
        updateDiamondSimRunButtonLabel();

        const allBtn = document.getElementById('diamondSimulateAllBtn');
        const levelBtn = document.getElementById('diamondSimulateLevelBtn');
        if (allBtn) allBtn.disabled = false;
        if (levelBtn) levelBtn.disabled = false;
    }

    function resetDiamondSimulationViewUI() {
        diamondSimulationJobId = null;
        diamondSimulationRunning = false;
        diamondOptimizationJobId = null;
        diamondOptimizationRunning = false;
        diamondSimBusyKind = null;
        const summary = document.getElementById('diamondSimulationSummary');
        const list = document.getElementById('diamondSimEntriesList');
        const hitEl = document.getElementById('diamondSimEntriesHit');
        const progress = document.getElementById('diamondSimulationProgress');
        const progressText = document.getElementById('diamondSimulationProgressText');
        const configContainer = document.getElementById('diamondSimConfigContainer');

        if (summary) summary.innerHTML = 'Selecione o período e clique em <strong>Simular</strong> para ver o resultado aqui.';
        if (list) list.innerHTML = '';
        if (hitEl) hitEl.innerHTML = '';
        if (progress) progress.style.display = 'none';
        if (progressText) progressText.textContent = 'Simulando...';
        if (configContainer) configContainer.innerHTML = '';
        renderDiamondSimulationChart({ wins: 0, losses: 0, totalCycles: 0, totalEntries: 0 });
        renderDiamondSimulationTickChart([]);
        setDiamondSimActiveTab('signals');
        diamondSimHasResults = false;
        setDiamondSimResultsVisible(false);
        updateDiamondSimRunButtonLabel();

        const allBtn = document.getElementById('diamondSimulateAllBtn');
        const levelBtn = document.getElementById('diamondSimulateLevelBtn');
        if (allBtn) allBtn.disabled = false;
        if (levelBtn) levelBtn.disabled = false;
    }

    const DIAMOND_LEVELS_MODAL_DEFAULT_TITLE = 'Configurar Níveis';

    function setDiamondLevelsModalTitle(text) {
        const headerTitle = document.querySelector('#diamondLevelsModal .custom-pattern-modal-header h3');
        if (headerTitle) headerTitle.textContent = text || DIAMOND_LEVELS_MODAL_DEFAULT_TITLE;
    }

    function restoreDiamondSimMovedNodes() {
        // Recolocar nodes movidos para o local original
        const items = Array.isArray(diamondSimMovedNodes) ? diamondSimMovedNodes : [];
        items.forEach(item => {
            if (!item || !item.node || !item.parent) return;
            try {
                if (item.nextSibling && item.nextSibling.parentNode === item.parent) {
                    item.parent.insertBefore(item.node, item.nextSibling);
                } else {
                    item.parent.appendChild(item.node);
                }
            } catch (_) {}
        });
        diamondSimMovedNodes = [];

        // Reexibir nodes escondidos
        const hidden = Array.isArray(diamondSimHiddenNodes) ? diamondSimHiddenNodes : [];
        hidden.forEach(node => {
            try { node.classList.remove('diamond-sim-hidden'); } catch (_) {}
        });
        diamondSimHiddenNodes = [];
    }

    function applyDiamondSimMode(mode, levelId) {
        restoreDiamondSimMovedNodes();
        diamondSimCurrentMode = mode;
        diamondSimCurrentLevelId = levelId || null;

        const levelsModal = document.getElementById('diamondLevelsModal');
        const body = levelsModal ? levelsModal.querySelector('.custom-pattern-modal-body') : null;
        const configContainer = document.getElementById('diamondSimConfigContainer');
        if (!levelsModal || !body || !configContainer) return;

        configContainer.innerHTML = '';

        if (mode === 'level' && levelId) {
            const key = String(levelId).toLowerCase(); // N1 -> n1
            const field = body.querySelector(`.diamond-level-field[data-level="${key}"]`);
            if (field) {
                // ✅ Na simulação, manter o nível aberto para o usuário ver/editar os campos
                try {
                    field.classList.add('is-open');
                    const header = field.querySelector('.diamond-level-header');
                    if (header) header.setAttribute('aria-expanded', 'true');
                } catch (_) {}
                diamondSimMovedNodes.push({ node: field, parent: field.parentNode, nextSibling: field.nextSibling });
                configContainer.appendChild(field);

                // ✅ Se o usuário configurar "Histórico analisado (giros)" no nível (ex.: N3=2000),
                // automaticamente elevar o período superior para não exigir duplicidade.
                try { bindDiamondSimPeriodToLevelHistory(levelId); } catch (_) {}
            }

            // esconder os demais níveis para focar no nível selecionado
            const others = body.querySelectorAll('.diamond-level-field');
            others.forEach(el => {
                if (!el) return;
                if (field && el === field) return;
                el.classList.add('diamond-sim-hidden');
                diamondSimHiddenNodes.push(el);
            });
        }
        // modo "all": mostrar SOMENTE níveis ATIVOS (todos os níveis com toggle ligado)
        // (quando o usuário clica em "Simular todos", ele quer "todos os ativados")
        if (mode === 'all') {
            const fields = body.querySelectorAll('.diamond-level-field');
            fields.forEach(el => {
                if (!el) return;
                const toggle = el.querySelector('.diamond-level-toggle-input');
                const enabled = toggle ? !!toggle.checked : !el.classList.contains('level-disabled');
                if (!enabled) {
                    el.classList.add('diamond-sim-hidden');
                    diamondSimHiddenNodes.push(el);
                }
            });
        }
    }

    function enterDiamondSimulationView({ titleText, subtitleText } = {}) {
        const levelsModal = document.getElementById('diamondLevelsModal');
        const view = document.getElementById('diamondSimView');
        if (!levelsModal || !view) return;

        // subtítulo removido (evitar duplicidade com o nome do nível)

        setDiamondLevelsModalTitle(titleText || 'Simulação');
        levelsModal.classList.add('diamond-sim-active');
        view.style.display = 'flex';
    }

    function exitDiamondSimulationView({ cancelIfRunning = false, clear = true, closeModal = false } = {}) {
        const levelsModal = document.getElementById('diamondLevelsModal');
        const view = document.getElementById('diamondSimView');
        if (!levelsModal || !view) return;

        // ✅ Ao sair da simulação, nunca manter o modal de "Padrão da Entrada" pendurado
        try { closeEntryPatternModalIfOpen(); } catch (_) {}

        if (cancelIfRunning && diamondSimulationRunning && diamondSimulationJobId) {
            try {
                chrome.runtime.sendMessage({ action: 'DIAMOND_SIMULATE_CANCEL', jobId: diamondSimulationJobId });
            } catch (_) {}
        }
        if (cancelIfRunning && diamondOptimizationRunning && diamondOptimizationJobId) {
            try {
                chrome.runtime.sendMessage({ action: 'DIAMOND_OPTIMIZE_CANCEL', jobId: diamondOptimizationJobId });
            } catch (_) {}
        }

        levelsModal.classList.remove('diamond-sim-active');
        view.style.display = 'none';

        restoreDiamondSimMovedNodes();

        if (clear) {
            resetDiamondSimulationViewUI();
        }

        setDiamondLevelsModalTitle(DIAMOND_LEVELS_MODAL_DEFAULT_TITLE);

        if (closeModal) {
            const sidebarEl = document.getElementById('blaze-double-analyzer');
            const isCompactMode = sidebarEl && sidebarEl.classList.contains('compact-mode');
            try {
                if (typeof isDesktop === 'function' && isDesktop() && isCompactMode && typeof floatingWindows !== 'undefined' && floatingWindows && typeof floatingWindows.unregister === 'function') {
                    floatingWindows.unregister('diamondLevelsModal');
                }
            } catch (_) {}
            levelsModal.style.display = 'none';
        }
    }

    function setDiamondSimulationLoading(isLoading, text = 'Simulando...', kind = 'simulate') {
        const k = kind === 'optimize' ? 'optimize' : 'simulate';
        diamondSimBusyKind = isLoading ? k : null;
        diamondSimulationRunning = isLoading ? (k === 'simulate') : false;
        diamondOptimizationRunning = isLoading ? (k === 'optimize') : false;
        const progress = document.getElementById('diamondSimulationProgress');
        const progressText = document.getElementById('diamondSimulationProgressText');
        if (progress) progress.style.display = isLoading ? 'flex' : 'none';
        if (progressText) progressText.textContent = text;

        const allBtn = document.getElementById('diamondSimulateAllBtn');
        const levelBtn = document.getElementById('diamondSimulateLevelBtn');
        const runBtn = document.getElementById('diamondSimulationRunBtn');
        const optimizeBtn = document.getElementById('diamondSimulationOptimizeBtn');
        if (allBtn) allBtn.disabled = isLoading;
        if (levelBtn) levelBtn.disabled = isLoading;
        if (runBtn) runBtn.disabled = isLoading;
        if (optimizeBtn) optimizeBtn.disabled = isLoading;
    }

    function updateDiamondSimulationProgress(data) {
        if (!diamondSimulationRunning) return;
        if (data && data.jobId && diamondSimulationJobId && data.jobId !== diamondSimulationJobId) {
            return;
        }
        const processed = Number(data && data.processed) || 0;
        const total = Number(data && data.total) || 0;
        const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
        setDiamondSimulationLoading(true, `Simulando... ${processed}/${total} (${pct}%)`, 'simulate');
    }

    function updateDiamondOptimizationProgress(data) {
        if (!diamondOptimizationRunning) return;
        if (data && data.jobId && diamondOptimizationJobId && data.jobId !== diamondOptimizationJobId) {
            return;
        }
        const levelLabel = (data && data.levelId)
            ? String(data.levelId).toUpperCase()
            : (diamondOptimizationActiveLevelId ? String(diamondOptimizationActiveLevelId).toUpperCase() : '');
        const trial = Number(data && data.trial) || 0;
        const total = Number(data && data.totalTrials) || 0;
        const pct = total > 0 ? Math.min(100, Math.round((trial / total) * 100)) : 0;
        const best = data && data.best ? data.best : null;
        const minPct = Number(data && data.minPct) || 95;
        const recommendedFound = !!(data && data.recommendedFound);
        const bestText = best
            ? (recommendedFound
                ? ` • melhor≥${minPct}%: ${Number(best.pct || 0).toFixed(1)}% (${best.totalCycles || 0} ciclos)`
                : ` • melhor: ${Number(best.pct || 0).toFixed(1)}% (<${minPct}%)`)
            : '';
        const prefix = levelLabel ? `${levelLabel} • ` : '';
        setDiamondSimulationLoading(true, `${prefix}Otimizando... ${trial}/${total} (${pct}%)${bestText}`, 'optimize');
    }

    function renderDiamondSimulationEntries(entries) {
        const list = document.getElementById('diamondSimEntriesList');
        const hitEl = document.getElementById('diamondSimEntriesHit');
        if (!list || !hitEl) return;

        const allEntries = Array.isArray(entries) ? entries : [];
        const filteredEntries = allEntries.filter(e => {
            if (!e) return false;
            if (e.result === 'WIN') return true;
            if (e.result === 'LOSS') {
                if (e.finalResult === 'RED' || e.finalResult === 'RET') return true;
                let isContinuing = false;
                for (let key in e) {
                    if (key.startsWith('continuingToG')) {
                        isContinuing = true;
                        break;
                    }
                }
                if (isContinuing) return false;
                return true;
            }
            return true;
        });

        const items = filteredEntries.map((e, idx) => {
            const entryIndex = idx;
            const time = new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const cls = e.color;
            const badge = e.color === 'white' ? blazeWhiteSVG(16) : `<span>${e.number}</span>`;
            const isWin = e.result === 'WIN';

            let barClass = isWin ? 'win' : 'loss';
            let stageText = '';
            if (e.martingaleStage) {
                if (isWin) {
                    if (e.martingaleStage === 'ENTRADA' || e.wonAt === 'ENTRADA') {
                        stageText = 'WIN';
                    } else if (e.martingaleStage && e.martingaleStage.startsWith('G')) {
                        const galeNum = e.martingaleStage.substring(1);
                        stageText = `WIN <span style="color: white;">G${galeNum}</span>`;
                    }
                } else {
                    if (e.finalResult === 'RED' || e.finalResult === 'RET') {
                        const stage = e.martingaleStage || e.phase;
                        if (stage === 'ENTRADA' || stage === 'G0') {
                            stageText = 'LOSS';
                        } else if (stage && stage.startsWith('G')) {
                            const galeNum = stage.substring(1);
                            stageText = `LOSS <span style="color: white;">G${galeNum}</span>`;
                        } else {
                            stageText = 'LOSS';
                        }
                    } else {
                        let isContinuing = false;
                        let nextGale = '';
                        for (let key in e) {
                            if (key.startsWith('continuingToG')) {
                                isContinuing = true;
                                nextGale = key.substring('continuingTo'.length);
                                break;
                            }
                        }
                        stageText = isContinuing ? `LOSS ➜<span style="color: white;">${nextGale}</span>` : 'LOSS';
                    }
                }
            } else {
                const phaseDigit = e.phase === 'G1' ? '1' : (e.phase === 'G2' ? '2' : '');
                stageText = phaseDigit ? (isWin ? `WIN <span style="color: white;">G${phaseDigit}</span>` : `LOSS <span style="color: white;">G${phaseDigit}</span>`) : (isWin ? 'WIN' : 'LOSS');
            }

            const confTop = (typeof e.confidence === 'number') ? `${e.confidence.toFixed(0)}%` : '';
            const resultBar = `<div class="entry-result-bar ${barClass}"></div>`;
            const stageLabel = stageText ? `<div class="entry-stage ${barClass}">${stageText}</div>` : '';
            const title = `Giro: ${e.number} • Cor: ${e.color} • ${time} • Resultado: ${e.result}${e.martingaleStage ? ' • Estágio: '+e.martingaleStage : ''}${e.confidence? ' • Confiança: '+e.confidence.toFixed(1)+'%' : ''}`;

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

        list.innerHTML = items || '<div class="no-history">Sem entradas registradas</div>';

        const totalCycles = filteredEntries.length;
        const wins = filteredEntries.filter(e => e.result === 'WIN').length;
        const losses = totalCycles - wins;
        const pct = totalCycles ? ((wins / totalCycles) * 100).toFixed(1) : '0.0';
        const totalEntries = allEntries.length;
        hitEl.innerHTML = `<span class="win-score">WIN: ${wins}</span> <span class="loss-score">LOSS: ${losses}</span> <span class="percentage">(${pct}%)</span> <span class="total-entries">• Ciclos: ${totalEntries}</span>`;

        // ✅ Atualizar gráfico com os mesmos dados
        renderDiamondSimulationChart({ wins, losses, totalCycles, totalEntries });
        // ✅ Atualizar gráfico por entrada (traços) usando o peso (ENTRADA/G1/G2...) do simulador
        renderDiamondSimulationTickChart(allEntries);

        const clickableEntries = list.querySelectorAll('.clickable-entry');
        clickableEntries.forEach((entryEl) => {
            entryEl.addEventListener('click', function() {
                const entryIndex = parseInt(this.getAttribute('data-entry-index'), 10);
                const entry = filteredEntries[entryIndex];
                if (entry) {
                    showPatternForEntry(entry);
                }
            });
        });
    }

    async function buildDiamondConfigSnapshotFromModal() {
        const getNumber = (id, min, max, fallback) => {
            const el = document.getElementById(id);
            if (!el) return fallback;
            let value = Number(el.value);
            if (!Number.isFinite(value)) value = fallback;
            if (Number.isFinite(min)) value = Math.max(min, value);
            if (Number.isFinite(max)) value = Math.min(max, value);
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

        const n2W = getNumber('diamondN2Recent', 6, 200, DIAMOND_LEVEL_DEFAULTS.n2Recent);
        // ✅ Migração N4: versões antigas usavam 20-120 como "janela". Agora é "Histórico".
        // Para não quebrar configs antigas: 20 => 2000, 60 => 6000, 120 => 10000 (clamp).
        let n4History = getNumber('diamondN4Persistence', null, null, DIAMOND_LEVEL_DEFAULTS.n4Persistence);
        if (Number.isFinite(n4History) && n4History >= 20 && n4History <= 120) {
            n4History = n4History * 100;
        }
        n4History = Math.max(10, Math.min(10000, Math.floor(Number.isFinite(n4History) ? n4History : DIAMOND_LEVEL_DEFAULTS.n4Persistence)));
        const newWindows = {
            n0History: getNumber('diamondN0History', 500, 10000, DIAMOND_LEVEL_DEFAULTS.n0History),
            n0Window: getNumber('diamondN0Window', 25, 250, DIAMOND_LEVEL_DEFAULTS.n0Window),
            n1WindowSize: getNumber('diamondN1WindowSize', 5, 120, DIAMOND_LEVEL_DEFAULTS.n1WindowSize),
            n1PrimaryRequirement: getNumber('diamondN1PrimaryRequirement', 5, 200, DIAMOND_LEVEL_DEFAULTS.n1PrimaryRequirement),
            n1SecondaryRequirement: getNumber('diamondN1SecondaryRequirement', 1, 200, DIAMOND_LEVEL_DEFAULTS.n1SecondaryRequirement),
            n1MaxEntries: getNumber('diamondN1MaxEntries', 1, 20, DIAMOND_LEVEL_DEFAULTS.n1MaxEntries),
            // N2 (novo): janela base única (W). Mantemos n2Previous espelhado por compatibilidade.
            n2Recent: n2W,
            n2Previous: n2W,
            n3Alternance: getNumber('diamondN3Alternance', 1, null, DIAMOND_LEVEL_DEFAULTS.n3Alternance),
            n3PatternLength: getNumber('diamondN3PatternLength', 1, 200, DIAMOND_LEVEL_DEFAULTS.n3PatternLength),
            n3BaseThresholdPct: getNumber('diamondN3BaseThresholdPct', 50, 95, DIAMOND_LEVEL_DEFAULTS.n3BaseThresholdPct),
            n3ThresholdPct: getNumber('diamondN3ThresholdPct', 50, 95, DIAMOND_LEVEL_DEFAULTS.n3ThresholdPct),
            n3MinOccurrences: getNumber('diamondN3MinOccurrences', 1, 50, DIAMOND_LEVEL_DEFAULTS.n3MinOccurrences),
            n3AllowBackoff: getCheckboxValue('diamondN3AllowBackoff', DIAMOND_LEVEL_DEFAULTS.n3AllowBackoff),
            n3IgnoreWhite: getCheckboxValue('diamondN3IgnoreWhite', DIAMOND_LEVEL_DEFAULTS.n3IgnoreWhite),
            n4Persistence: n4History,
            n4DynamicGales: getCheckboxValue('diamondN4DynamicGales', DIAMOND_LEVEL_DEFAULTS.n4DynamicGales),
            n5MinuteBias: getNumber('diamondN5MinuteBias', 10, 200, DIAMOND_LEVEL_DEFAULTS.n5MinuteBias),
            n6RetracementWindow: getNumber('diamondN6Retracement', 30, 120, DIAMOND_LEVEL_DEFAULTS.n6RetracementWindow),
            n7DecisionWindow: getNumber('diamondN7DecisionWindow', 10, 50, DIAMOND_LEVEL_DEFAULTS.n7DecisionWindow),
            n7HistoryWindow: getNumber('diamondN7HistoryWindow', 50, 200, DIAMOND_LEVEL_DEFAULTS.n7HistoryWindow),
            n8Barrier: getNumber('diamondN8Barrier', 1, null, DIAMOND_LEVEL_DEFAULTS.n8Barrier),
            n9History: getNumber('diamondN9History', 30, 400, DIAMOND_LEVEL_DEFAULTS.n9History),
            n9NullThreshold: getNumber('diamondN9NullThreshold', 2, 20, DIAMOND_LEVEL_DEFAULTS.n9NullThreshold),
            n9PriorStrength: getNumber('diamondN9PriorStrength', 0.2, 5, DIAMOND_LEVEL_DEFAULTS.n9PriorStrength),
            n10Window: getNumber('diamondN10Window', 5, 50, DIAMOND_LEVEL_DEFAULTS.n10Window),
            n10History: getNumber('diamondN10History', 100, 10000, DIAMOND_LEVEL_DEFAULTS.n10History)
        };

        // N2: n2Previous espelhado, sem validação min/max (o código ajusta automaticamente)
        if (newWindows.n7HistoryWindow < newWindows.n7DecisionWindow) {
            throw new Error('O histórico base do N7 deve ser maior ou igual ao número de decisões analisadas.');
        }

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

        const allowBlockCheckbox = document.getElementById('diamondN0AllowBlockAll');
        const allowBlockAll = allowBlockCheckbox ? !!allowBlockCheckbox.checked : true;

        const storageData = await storageCompat.get(['analyzerConfig']);
        const currentConfig = storageData.analyzerConfig || {};
        const signalIntensitySelect = document.getElementById('signalIntensitySelect');
        const signalIntensity = signalIntensitySelect
            ? (signalIntensitySelect.value === 'conservative' ? 'conservative' : 'aggressive')
            : (currentConfig.signalIntensity === 'conservative' ? 'conservative' : 'aggressive');

        return {
            ...currentConfig,
            aiMode: true,
            signalIntensity,
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
    }

    async function startDiamondSimulation(mode, levelId = null) {
        try {
            if (diamondSimulationRunning || diamondOptimizationRunning) return;
            ensureDiamondSimulationView();

            const levelLabel = mode === 'level' ? String(levelId || '').toUpperCase() : 'TODOS';
            // manter a tela de simulação aberta (sem texto duplicado no cabeçalho)
            enterDiamondSimulationView({ titleText: 'Simulação' });
            applyDiamondSimMode(mode, levelId);

            // ✅ ao rodar novamente, evitar “vazar” o gráfico na aba Sinais
            setDiamondSimActiveTab('signals');
            setDiamondSimResultsVisible(false);
            setDiamondSimulationLoading(true, 'Simulando...', 'simulate');

            const summary = document.getElementById('diamondSimulationSummary');
            if (summary) {
                summary.innerHTML = `Preparando simulação...`;
            }
            const cfg = await buildDiamondConfigSnapshotFromModal();

            // ✅ Simular: garantir que o "Período da simulação" tenha giros suficientes
            // para o modo atual, sem causar confusão:
            // - modo "all": usar o MAIOR histórico entre os níveis ATIVOS (evita duplicidade)
            // - modo "level": usar APENAS o histórico do nível selecionado (não “puxar” 10k por causa de outros níveis)
            try {
                const windows = cfg && cfg.diamondLevelWindows ? cfg.diamondLevelWindows : {};
                const enabled = cfg && cfg.diamondLevelEnabled ? cfg.diamondLevelEnabled : {};
                const upper = (mode === 'level' && levelId) ? String(levelId).toUpperCase() : '';
                const requiredHistory = (() => {
                    if (mode === 'level' && upper) {
                        if (upper === 'N0') return Number(windows.n0History) || 0;
                        if (upper === 'N3') return Number(windows.n3Alternance) || 0;
                        if (upper === 'N4') return Number(windows.n4Persistence) || 0;
                        if (upper === 'N7') return Number(windows.n7HistoryWindow) || 0;
                        if (upper === 'N8') return Number(windows.n10History) || 0;
                        if (upper === 'N10') return Number(windows.n9History) || 0;
                        return 0;
                    }
                    // mode=all: maior exigência dentre níveis ativos
                    return Math.max(
                        enabled.n0 ? (Number(windows.n0History) || 0) : 0,
                        enabled.n3 ? (Number(windows.n3Alternance) || 0) : 0,
                        enabled.n4 ? (Number(windows.n4Persistence) || 0) : 0,
                        enabled.n7 ? (Number(windows.n7HistoryWindow) || 0) : 0,
                        enabled.n8 ? (Number(windows.n10History) || 0) : 0,
                        enabled.n10 ? (Number(windows.n9History) || 0) : 0
                    );
                })();
                if (requiredHistory > 0) {
                    ensureDiamondSimHistoryLimitAtLeast(requiredHistory);
                }
            } catch (_) {}

            // ✅ Permite cancelar durante a execução (jobId definido ANTES do request)
            diamondSimulationJobId = `diamond-sim-${Date.now()}-${Math.random().toString(16).slice(2)}`;

            // ✅ Simulação respeita o período do usuário, mas precisa ser compatível com o "Histórico analisado" do nível.
            // Ex.: se o N3 estiver com histórico 2000 e o período estiver 200, elevamos para 2000 automaticamente.
            if (mode === 'level' && levelId) {
                try { bindDiamondSimPeriodToLevelHistory(levelId); } catch (_) {}
            }
            const resolvedHistoryLimit = resolveDiamondSimHistoryLimitFromUI(1440);

            const requestPayload = {
                action: 'DIAMOND_SIMULATE_PAST',
                mode: mode === 'level' ? 'level' : 'all',
                levelId: mode === 'level' ? levelId : null,
                jobId: diamondSimulationJobId,
                historyLimit: resolvedHistoryLimit,
                config: cfg
            };

            chrome.runtime.sendMessage(requestPayload, (response) => {
                const err = chrome.runtime.lastError;
                if (err) {
                    console.warn('⚠️ Erro na simulação:', err);
                    setDiamondSimulationLoading(false);
                    diamondSimulationJobId = null;
                    if (summary) summary.innerHTML = `❌ Falha ao simular: ${err.message || err}`;
                    return;
                }
                if (!response) {
                    setDiamondSimulationLoading(false);
                    diamondSimulationJobId = null;
                    if (summary) summary.innerHTML = `❌ Falha ao simular: resposta inválida`;
                    return;
                }
                if (response.status === 'cancelled') {
                    setDiamondSimulationLoading(false);
                    diamondSimulationJobId = null;
                    if (summary) summary.innerHTML = '⏹️ Simulação cancelada.';
                    return;
                }
                if (response.status !== 'success') {
                    setDiamondSimulationLoading(false);
                    diamondSimulationJobId = null;
                    if (summary) summary.innerHTML = `❌ Falha ao simular: ${response && response.error ? response.error : 'resposta inválida'}`;
                    return;
                }

                diamondSimulationJobId = response.jobId || null;
                const meta = response.meta || {};
                const stats = response.stats || {};
                const label = response.label || (mode === 'level' ? `Nível ${levelId}` : 'Todos os níveis');

                if (summary) {
                    const from = meta.fromTimestamp ? new Date(meta.fromTimestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
                    const to = meta.toTimestamp ? new Date(meta.toTimestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
                    const avail = Number(meta.availableHistory || 0);
                    const req = Number(meta.requestedHistoryLimit || 0);
                    const used = Number(meta.usedHistoryLimit || meta.totalSpins || 0);
                    const baseline = meta.baseline || null;
                    let baselineText = '';
                    if (baseline && baseline.freq && baseline.steps) {
                        const pBest = Number(baseline.pBest || 0);
                        const steps = Number(baseline.steps || 1);
                        const pCycle = Number(baseline.pCycle || 0);
                        const breakEven = (baseline.breakEvenPcycle != null) ? Number(baseline.breakEvenPcycle) : null;
                        const bestColor = baseline.bestColor ? String(baseline.bestColor).toUpperCase() : 'RB';
                        baselineText =
                            `<br>` +
                            `Baseline (histórico): <strong>${bestColor}</strong> ~ <strong>${(pBest * 100).toFixed(1)}%</strong> • BaseP(ciclo ${steps} tent.) <strong>${(pCycle * 100).toFixed(1)}%</strong>` +
                            (breakEven != null ? ` • Break-even (martingale 2x): <strong>${(breakEven * 100).toFixed(1)}%</strong>` : '');
                    }
                    summary.innerHTML =
                        `<strong>${label}</strong><br>` +
                        `Giros analisados: <strong>${meta.totalSpins || 0}</strong><br>` +
                        `Disponível: <strong>${avail || '—'}</strong> • Solicitado: <strong>${req || '—'}</strong> • Usado: <strong>${used || '—'}</strong><br>` +
                        `Período: <strong>${from}</strong> → <strong>${to}</strong><br>` +
                        `Sinais gerados: <strong>${meta.totalSignals || 0}</strong> • Ciclos: <strong>${stats.totalCycles || 0}</strong>` +
                        baselineText;
                }

                renderDiamondSimulationEntries(response.entries || []);
                diamondSimHasResults = true;
                setDiamondSimResultsVisible(true);
                updateDiamondSimRunButtonLabel();
                setDiamondSimulationLoading(false);
            });
        } catch (error) {
            console.warn('⚠️ Falha ao iniciar simulação:', error);
            setDiamondSimulationLoading(false);
            diamondSimulationJobId = null;
            const summary = document.getElementById('diamondSimulationSummary');
            if (summary) summary.innerHTML = `❌ Falha ao simular: ${error.message || error}`;
        }
    }

    async function startDiamondOptimization(levelId) {
        try {
            if (diamondSimulationRunning || diamondOptimizationRunning) return;
            ensureDiamondSimulationView();

            enterDiamondSimulationView({ titleText: 'Simulação' });
            applyDiamondSimMode('level', levelId);

            setDiamondSimActiveTab('signals');
            setDiamondSimResultsVisible(false);
            setDiamondSimulationLoading(true, 'Otimizando... (0/100)', 'optimize');

            const summary = document.getElementById('diamondSimulationSummary');
            if (summary) summary.innerHTML = `Preparando otimização (100 configurações)...`;

            const cfg = await buildDiamondConfigSnapshotFromModal();
            // ✅ Otimização NÃO deve depender do "Período da simulação" (usuário).
            // Use o máximo possível (até 10k) para encontrar a melhor configuração.
            const resolvedHistoryLimit = 10000;

            diamondOptimizationJobId = `diamond-opt-${Date.now()}-${Math.random().toString(16).slice(2)}`;

            chrome.runtime.sendMessage({
                action: 'DIAMOND_OPTIMIZE_PAST',
                levelId,
                jobId: diamondOptimizationJobId,
                trials: 100,
                historyLimit: resolvedHistoryLimit,
                config: cfg
            }, async (response) => {
                const err = chrome.runtime.lastError;
                if (err) {
                    console.warn('⚠️ Erro na otimização:', err);
                    setDiamondSimulationLoading(false);
                    diamondOptimizationJobId = null;
                    if (summary) summary.innerHTML = `❌ Falha ao otimizar: ${err.message || err}`;
                    return;
                }
                if (!response) {
                    setDiamondSimulationLoading(false);
                    diamondOptimizationJobId = null;
                    if (summary) summary.innerHTML = `❌ Falha ao otimizar: resposta inválida`;
                    return;
                }
                if (response.status === 'cancelled') {
                    setDiamondSimulationLoading(false);
                    diamondOptimizationJobId = null;
                    if (summary) summary.innerHTML = '⏹️ Otimização cancelada.';
                    return;
                }
                if (response.status !== 'success') {
                    setDiamondSimulationLoading(false);
                    diamondOptimizationJobId = null;
                    if (summary) summary.innerHTML = `❌ Falha ao otimizar: ${response && response.error ? response.error : 'resposta inválida'}`;
                    return;
                }

                diamondOptimizationJobId = response.jobId || null;

                const meta = response.meta || {};
                const minPct = Number(response.minPct) || 95;
                const recommendedFound = !!response.recommendedFound;
                const recommended = response.recommended || null;
                const bestOverall = response.bestOverall || null;
                const bestCfg = response.config || null;

                const applyOptimizedLevelWindowsToForm = (targetLevelId, cfgObj) => {
                    if (!cfgObj || !cfgObj.diamondLevelWindows) return false;
                    const windows = cfgObj.diamondLevelWindows;
                    const upper = String(targetLevelId || '').toUpperCase();
                    const setVal = (id, value) => {
                        const el = document.getElementById(id);
                        if (el && value != null && value !== '') el.value = String(value);
                    };
                    const setCheck = (id, value) => {
                        const el = document.getElementById(id);
                        if (el && typeof value === 'boolean') el.checked = value;
                    };
                    if (upper === 'N1') {
                        setVal('diamondN1WindowSize', windows.n1WindowSize);
                        setVal('diamondN1PrimaryRequirement', windows.n1PrimaryRequirement);
                        setVal('diamondN1SecondaryRequirement', windows.n1SecondaryRequirement);
                        setVal('diamondN1MaxEntries', windows.n1MaxEntries);
                        return true;
                    }
                    if (upper === 'N2') {
                        setVal('diamondN2Recent', windows.n2Recent);
                        return true;
                    }
                    if (upper === 'N3') {
                        setVal('diamondN3Alternance', windows.n3Alternance);
                        setVal('diamondN3PatternLength', windows.n3PatternLength);
                        setVal('diamondN3BaseThresholdPct', windows.n3BaseThresholdPct);
                        setVal('diamondN3ThresholdPct', windows.n3ThresholdPct);
                        setVal('diamondN3MinOccurrences', windows.n3MinOccurrences);
                        setCheck('diamondN3AllowBackoff', !!windows.n3AllowBackoff);
                        setCheck('diamondN3IgnoreWhite', !!windows.n3IgnoreWhite);
                        return true;
                    }
                    if (upper === 'N4') {
                        setVal('diamondN4Persistence', windows.n4Persistence);
                        setCheck('diamondN4DynamicGales', !!windows.n4DynamicGales);
                        return true;
                    }
                    return false;
                };

                // ✅ Só aplicar automaticamente se atingir o mínimo (>=95% por padrão)
                if (recommendedFound && bestCfg) {
                    try {
                        // ⚠️ CRÍTICO: NÃO aplicar diamondLevelEnabled do simulador no formulário,
                        // senão desativa outros níveis e bagunça as configurações do usuário.
                        // Aqui aplicamos SOMENTE os campos do nível otimizado.
                        applyOptimizedLevelWindowsToForm(levelId, bestCfg);
                        refreshDiamondLevelToggleStates();
                    } catch (e) {
                        console.warn('⚠️ Falha ao aplicar melhor configuração no formulário:', e);
                    }
                }

                const from = meta.fromTimestamp ? new Date(meta.fromTimestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
                const to = meta.toTimestamp ? new Date(meta.toTimestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
                const avail = Number(meta.availableHistory || 0);
                const req = Number(meta.requestedHistoryLimit || 0);
                const used = Number(meta.usedHistoryLimit || meta.totalSpins || 0);

                if (summary) {
                    if (recommendedFound && recommended) {
                        summary.innerHTML =
                            `<strong>Melhor configuração (${response.trials || 100} testes) • ${String(levelId || '').toUpperCase()}</strong><br>` +
                            `Giros analisados: <strong>${meta.totalSpins || 0}</strong><br>` +
                            `Disponível: <strong>${avail || '—'}</strong> • Solicitado: <strong>${req || '—'}</strong> • Usado: <strong>${used || '—'}</strong><br>` +
                            `Período: <strong>${from}</strong> → <strong>${to}</strong><br>` +
                            `Assertividade: <strong>${Number(recommended.pct || 0).toFixed(1)}%</strong> • Ciclos: <strong>${recommended.totalCycles || 0}</strong> • Sinais: <strong>${recommended.totalSignals || 0}</strong> • Score: <strong>${Number(recommended.score || 0).toFixed(2)}</strong>`;
                    } else {
                        const pctOverall = bestOverall ? Number(bestOverall.pct || 0) : 0;
                        const cyclesOverall = bestOverall ? (bestOverall.totalCycles || 0) : 0;
                        const scoreOverall = bestOverall ? Number(bestOverall.score || 0) : 0;
                        summary.innerHTML =
                            `<strong>Nenhuma configuração atingiu ${minPct}% (${response.trials || 100} testes) • ${String(levelId || '').toUpperCase()}</strong><br>` +
                            `Giros analisados: <strong>${meta.totalSpins || 0}</strong><br>` +
                            `Disponível: <strong>${avail || '—'}</strong> • Solicitado: <strong>${req || '—'}</strong> • Usado: <strong>${used || '—'}</strong><br>` +
                            `Período: <strong>${from}</strong> → <strong>${to}</strong><br>` +
                            `Melhor encontrada: <strong>${pctOverall.toFixed(1)}%</strong> • Ciclos: <strong>${cyclesOverall}</strong> • Score: <strong>${scoreOverall.toFixed(2)}</strong><br>` +
                            `<span style="color:#8da2bb;">(A configuração NÃO foi aplicada automaticamente porque ficou abaixo do mínimo.)</span>`;
                    }
                }

                renderDiamondSimulationEntries(response.entries || []);
                diamondSimHasResults = true;
                setDiamondSimResultsVisible(true);
                updateDiamondSimRunButtonLabel();
                setDiamondSimulationLoading(false);
            });
        } catch (error) {
            console.warn('⚠️ Falha ao iniciar otimização:', error);
            setDiamondSimulationLoading(false);
            diamondOptimizationJobId = null;
            const summary = document.getElementById('diamondSimulationSummary');
            if (summary) summary.innerHTML = `❌ Falha ao otimizar: ${error.message || error}`;
        }
    }

    async function startDiamondOptimizationAllActive() {
        try {
            if (diamondSimulationRunning || diamondOptimizationRunning) return;
            ensureDiamondSimulationView();

            enterDiamondSimulationView({ titleText: 'Simulação' });
            applyDiamondSimMode('all');
            setDiamondSimActiveTab('signals');
            setDiamondSimResultsVisible(false);

            const summary = document.getElementById('diamondSimulationSummary');
            if (summary) summary.innerHTML = `Preparando otimização em lote...`;

            // ✅ Otimização em lote NÃO deve depender do "Período da simulação" (usuário).
            // Use o máximo possível (até 10k) para encontrar a melhor configuração.
            const resolvedHistoryLimit = 10000;

            // Ordem fixa dos votantes (modo diamante)
            const ordered = ['N1','N2','N3','N4','N5','N6','N7','N8'];
            const active = ordered.filter(id => {
                const el = document.getElementById(`diamondLevelToggle${id}`);
                return el ? !!el.checked : false;
            });

            // Pedido atual: otimizar em lote N1..N4 (se estiverem ativos)
            const OPTIMIZABLE = new Set(['N1','N2','N3','N4']);
            const targets = active.filter(id => OPTIMIZABLE.has(id));
            const skipped = active.filter(id => !OPTIMIZABLE.has(id));

            if (targets.length === 0) {
                showCenteredNotice('Nenhum nível elegível para otimização em lote.\n\nAtive pelo menos N1, N2, N3 ou N4 (em Configurar Níveis) e tente novamente.');
                return;
            }

            setDiamondSimulationLoading(true, `Otimização em lote... (0/${targets.length})`, 'optimize');

            const sendOptimize = (payload) => new Promise((resolve, reject) => {
                try {
                    chrome.runtime.sendMessage(payload, (resp) => {
                        const err = chrome.runtime.lastError;
                        if (err) reject(err);
                        else resolve(resp);
                    });
                } catch (e) {
                    reject(e);
                }
            });

            const applyOptimizedLevelWindowsToForm = (targetLevelId, cfgObj) => {
                if (!cfgObj || !cfgObj.diamondLevelWindows) return false;
                const windows = cfgObj.diamondLevelWindows;
                const upper = String(targetLevelId || '').toUpperCase();
                const setVal = (id, value) => {
                    const el = document.getElementById(id);
                    if (el && value != null && value !== '') el.value = String(value);
                };
                const setCheck = (id, value) => {
                    const el = document.getElementById(id);
                    if (el && typeof value === 'boolean') el.checked = value;
                };
                if (upper === 'N1') {
                    setVal('diamondN1WindowSize', windows.n1WindowSize);
                    setVal('diamondN1PrimaryRequirement', windows.n1PrimaryRequirement);
                    setVal('diamondN1SecondaryRequirement', windows.n1SecondaryRequirement);
                    setVal('diamondN1MaxEntries', windows.n1MaxEntries);
                    return true;
                }
                if (upper === 'N2') {
                    setVal('diamondN2Recent', windows.n2Recent);
                    return true;
                }
                if (upper === 'N3') {
                    setVal('diamondN3Alternance', windows.n3Alternance);
                    setVal('diamondN3PatternLength', windows.n3PatternLength);
                    setVal('diamondN3BaseThresholdPct', windows.n3BaseThresholdPct);
                    setVal('diamondN3ThresholdPct', windows.n3ThresholdPct);
                    setVal('diamondN3MinOccurrences', windows.n3MinOccurrences);
                    setCheck('diamondN3AllowBackoff', !!windows.n3AllowBackoff);
                    setCheck('diamondN3IgnoreWhite', !!windows.n3IgnoreWhite);
                    return true;
                }
                if (upper === 'N4') {
                    setVal('diamondN4Persistence', windows.n4Persistence);
                    return true;
                }
                return false;
            };

            const results = [];
            let cfg = await buildDiamondConfigSnapshotFromModal();

            for (let i = 0; i < targets.length; i++) {
                const levelId = targets[i];
                diamondOptimizationActiveLevelId = levelId;

                if (summary) {
                    summary.innerHTML = `<strong>Otimização em lote</strong><br>` +
                        `Otimizando <strong>${String(levelId).toUpperCase()}</strong> (${i + 1}/${targets.length})...`;
                }

                diamondOptimizationJobId = `diamond-opt-${Date.now()}-${Math.random().toString(16).slice(2)}`;

                const resp = await sendOptimize({
                    action: 'DIAMOND_OPTIMIZE_PAST',
                    levelId,
                    jobId: diamondOptimizationJobId,
                    trials: 100,
                    historyLimit: resolvedHistoryLimit,
                    config: cfg
                });

                if (!resp || resp.status === 'cancelled') {
                    setDiamondSimulationLoading(false);
                    diamondOptimizationJobId = null;
                    diamondOptimizationActiveLevelId = null;
                    if (summary) summary.innerHTML = '⏹️ Otimização em lote cancelada.';
                    return;
                }
                if (resp.status !== 'success') {
                    setDiamondSimulationLoading(false);
                    diamondOptimizationJobId = null;
                    diamondOptimizationActiveLevelId = null;
                    if (summary) summary.innerHTML = `❌ Falha ao otimizar ${String(levelId).toUpperCase()}: ${resp && resp.error ? resp.error : 'resposta inválida'}`;
                    return;
                }

                const minPct = Number(resp.minPct) || 95;
                const recommendedFound = !!resp.recommendedFound;
                const bestCfg = resp.config || null;
                const bestOverall = resp.bestOverall || null;
                const recommended = resp.recommended || null;

                let applied = false;
                if (recommendedFound && bestCfg) {
                    try {
                        applied = applyOptimizedLevelWindowsToForm(levelId, bestCfg);
                        refreshDiamondLevelToggleStates();
                    } catch (_) {
                        applied = false;
                    }
                }

                results.push({
                    levelId,
                    minPct,
                    recommendedFound,
                    recommended,
                    bestOverall,
                    applied
                });

                // Recalcular snapshot (para o próximo nível levar em conta os campos aplicados)
                cfg = await buildDiamondConfigSnapshotFromModal();
            }

            diamondOptimizationActiveLevelId = null;
            setDiamondSimulationLoading(false);
            diamondOptimizationJobId = null;

            const rows = results.map(r => {
                const lvl = String(r.levelId || '').toUpperCase();
                const pct = r.recommendedFound && r.recommended
                    ? Number(r.recommended.pct || 0)
                    : (r.bestOverall ? Number(r.bestOverall.pct || 0) : 0);
                const cycles = r.recommendedFound && r.recommended
                    ? (r.recommended.totalCycles || 0)
                    : (r.bestOverall ? (r.bestOverall.totalCycles || 0) : 0);
                const status = (r.recommendedFound && r.applied)
                    ? '✅ aplicado'
                    : `❌ <${r.minPct}% (não aplicado)`;
                return `<div style="display:flex; justify-content:space-between; gap:10px; padding: 4px 0;">
                            <span><strong>${lvl}</strong></span>
                            <span>${pct.toFixed(1)}% • ${cycles} ciclos • ${status}</span>
                        </div>`;
            }).join('');

            const skippedText = skipped.length
                ? `<div style="margin-top:8px; color:#8da2bb;">Ativos mas não otimizados em lote: ${skipped.join(', ')}</div>`
                : '';

            if (summary) {
                summary.innerHTML =
                    `<strong>Otimização em lote concluída</strong><br>` +
                    rows +
                    skippedText +
                    `<div style="margin-top:10px; color:#8da2bb;">Agora clique em <strong>Simular</strong> para ver o resultado com as configurações aplicadas (somente as ≥95%).</div>`;
            }
        } catch (error) {
            console.warn('⚠️ Falha ao iniciar otimização em lote:', error);
            setDiamondSimulationLoading(false);
            diamondOptimizationJobId = null;
            diamondOptimizationActiveLevelId = null;
            const summary = document.getElementById('diamondSimulationSummary');
            if (summary) summary.innerHTML = `❌ Falha ao otimizar em lote: ${error.message || error}`;
        }
    }

    function initializeDiamondSimulationControls() {
        const allBtn = document.getElementById('diamondSimulateAllBtn');
        const levelBtn = document.getElementById('diamondSimulateLevelBtn');
        const dropdown = document.getElementById('diamondSimulateLevelDropdown');

        if (allBtn && !allBtn.dataset.listenerAttached) {
            allBtn.addEventListener('click', () => openDiamondSimulationSetup('all'));
            allBtn.dataset.listenerAttached = '1';
        }

        if (levelBtn && dropdown && !levelBtn.dataset.listenerAttached) {
            const closeDropdown = () => { dropdown.style.display = 'none'; };
            const toggleDropdown = () => {
                dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
            };
            levelBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                toggleDropdown();
            });
            dropdown.addEventListener('click', (event) => {
                const target = event.target;
                const option = (target && typeof target.closest === 'function')
                    ? target.closest('.diamond-sim-option')
                    : null;
                if (!option) return;
                const levelId = option.dataset.level;
                closeDropdown();
                openDiamondSimulationSetup('level', levelId);
            });
            document.addEventListener('click', (event) => {
                if (!dropdown.contains(event.target) && event.target !== levelBtn) {
                    closeDropdown();
                }
            });
            levelBtn.dataset.listenerAttached = '1';
        }
    }

const VOTING_LEVEL_DOM_IDS = ['N1','N2','N3','N4','N5','N6','N7','N8'];
const VOTING_LEVEL_CONFIG_KEYS = ['n1','n2','n3','n4','n5','n6','n7','n8'];
let latestAnalyzerConfig = null;

function areAllVotingLevelsEnabledFromConfig(config) {
    const enabledMap = (config && config.diamondLevelEnabled) || {};
    return VOTING_LEVEL_CONFIG_KEYS.every(key => {
        if (Object.prototype.hasOwnProperty.call(enabledMap, key)) {
            return !!enabledMap[key];
        }
        return !!DIAMOND_LEVEL_ENABLE_DEFAULTS[key];
    });
}

function showCenteredNotice(message, options = {}) {
    const existing = document.getElementById('centeredNotice');
    if (existing) existing.remove();
    const {
        title = 'Atenção',
        autoHide = 4000
    } = options;

    // ✅ Reutiliza o estilo padrão de modais (mesma paleta do "Configurar Simulador")
    const wrapper = document.createElement('div');
    wrapper.id = 'centeredNotice';
    wrapper.className = 'custom-pattern-modal';
    wrapper.style.display = 'flex';
    wrapper.style.zIndex = '10000000';
    wrapper.innerHTML = `
        <div class="custom-pattern-modal-overlay"></div>
        <div class="custom-pattern-modal-content" style="max-width: 520px;">
            <div class="custom-pattern-modal-header modal-header-minimal">
                <h3>${title}</h3>
                <button class="custom-pattern-modal-close modal-header-close" id="centeredNoticeCloseBtn" type="button">Fechar</button>
        </div>
            <div class="custom-pattern-modal-body" style="text-align: center;">
                <div style="font-size: 13px; line-height: 1.45; color: #c8d6e9;">
            ${message}
                </div>
            </div>
            <div class="custom-pattern-modal-footer" style="justify-content: center;">
                <button type="button" class="btn-save-pattern" id="centeredNoticeOkBtn" style="max-width: 240px;">Entendi</button>
            </div>
        </div>
    `;

    const close = () => wrapper.remove();
    const overlay = wrapper.querySelector('.custom-pattern-modal-overlay');
    const closeBtn = wrapper.querySelector('#centeredNoticeCloseBtn');
    const okBtn = wrapper.querySelector('#centeredNoticeOkBtn');

    if (closeBtn) closeBtn.addEventListener('click', close);
    if (okBtn) okBtn.addEventListener('click', close);
    if (overlay) {
        // ✅ Mantém o comportamento padrão: overlay fecha somente no mobile
        overlay.addEventListener('click', () => {
            if (typeof isDesktop === 'function' && !isDesktop()) {
                close();
            }
        });
    }

    document.body.appendChild(wrapper);
    if (autoHide > 0) {
        setTimeout(() => {
            if (document.getElementById('centeredNotice')) {
                close();
            }
        }, autoHide);
    }
}

function areAllVotingLevelsEnabled() {
    const domDisabled = getDisabledVotingLevelsFromDOM();
    if (domDisabled) {
        return domDisabled.length === 0;
    }
    return getDisabledVotingLevelsFromConfig(latestAnalyzerConfig).length === 0;
}

function getDisabledVotingLevelsFromConfig(config) {
    const enabledMap = (config && config.diamondLevelEnabled) || {};
    const disabled = [];
    VOTING_LEVEL_CONFIG_KEYS.forEach((key, idx) => {
        const enabled = Object.prototype.hasOwnProperty.call(enabledMap, key)
            ? !!enabledMap[key]
            : !!DIAMOND_LEVEL_ENABLE_DEFAULTS[key];
        if (!enabled) {
            disabled.push(VOTING_LEVEL_DOM_IDS[idx]);
        }
    });
    return disabled;
}

function getDisabledVotingLevelsFromDOM() {
    let domFound = false;
    const disabled = [];
    VOTING_LEVEL_DOM_IDS.forEach(levelId => {
        const checkbox = document.getElementById(`diamondLevelToggle${levelId}`);
        if (checkbox) {
            domFound = true;
            if (!checkbox.checked) {
                disabled.push(levelId);
            }
        }
    });
    return domFound ? disabled : null;
}

function getDisabledVotingLevelsSnapshot() {
    const domDisabled = getDisabledVotingLevelsFromDOM();
    if (domDisabled) return domDisabled;
    return getDisabledVotingLevelsFromConfig(latestAnalyzerConfig);
}

function ensureSignalIntensityCustomUI() {
    const select = document.getElementById('signalIntensitySelect');
    const uiButton = document.getElementById('signalIntensitySelectUi');
    const dropdown = document.getElementById('signalIntensityDropdown');
    const label = document.getElementById('signalIntensitySelectedLabel');
    if (!select || !uiButton || !dropdown || !label) return;

    const setValue = (value) => {
        const normalized = value === 'conservative' ? 'conservative' : 'aggressive';
        select.value = normalized;
        label.textContent = normalized === 'conservative' ? 'Conservador' : 'Agressivo';
        dropdown.querySelectorAll('.signal-intensity-option').forEach((opt) => {
            const isSelected = opt.dataset.value === normalized;
            opt.classList.toggle('selected', isSelected);
            opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        });
    };

    const closeDropdown = () => {
        dropdown.style.display = 'none';
        uiButton.setAttribute('aria-expanded', 'false');
        uiButton.classList.remove('open');
    };

    const openDropdown = () => {
        dropdown.style.display = 'block';
        uiButton.setAttribute('aria-expanded', 'true');
        uiButton.classList.add('open');
    };

    if (!uiButton.dataset.listenerAttached) {
        uiButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const isOpen = dropdown.style.display !== 'none';
            if (isOpen) closeDropdown();
            else openDropdown();
        });

        uiButton.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                const isOpen = dropdown.style.display !== 'none';
                if (isOpen) closeDropdown();
                else openDropdown();
            } else if (event.key === 'Escape') {
                closeDropdown();
            }
        });

        dropdown.addEventListener('click', (event) => {
            const optionEl = event.target.closest('.signal-intensity-option');
            if (!optionEl) return;
            const value = optionEl.dataset.value;
            if (value === 'conservative' && optionEl.classList.contains('disabled')) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            setValue(value);
            closeDropdown();
            enforceSignalIntensityAvailability({ source: 'user' });
        });

        document.addEventListener('click', (event) => {
            if (!uiButton.contains(event.target) && !dropdown.contains(event.target)) {
                closeDropdown();
            }
        });

        uiButton.dataset.listenerAttached = '1';
    }

    // Sync UI with current select value
    setValue(select.value);
}

function enforceSignalIntensityAvailability(options = {}) {
    const select = document.getElementById('signalIntensitySelect');
    if (!select) return;
    ensureSignalIntensityCustomUI();

    const conservativeOption = select.querySelector('option[value="conservative"]');
    const disabledVotingLevels = getDisabledVotingLevelsSnapshot();
    const allVotingLevelsActive = disabledVotingLevels.length === 0;
    const disabledText = disabledVotingLevels.length ? disabledVotingLevels.join(', ') : '';

    if (conservativeOption) {
        conservativeOption.disabled = !allVotingLevelsActive;
    }

    // Atualizar estado do item "Conservador" dentro do dropdown (com mensagem EMBUTIDA)
    const conservativeUiOption = document.querySelector('#signalIntensityDropdown .signal-intensity-option[data-value="conservative"]');
    const hintBox = document.getElementById('signalIntensityConservativeHint');
    const hintText = document.getElementById('signalIntensityConservativeHintText');
    if (conservativeUiOption) {
        conservativeUiOption.classList.toggle('disabled', !allVotingLevelsActive);
    }
    if (hintBox && hintText) {
        if (!allVotingLevelsActive) {
            hintText.innerHTML =
                `Para ativar, deixe todos os níveis votantes <strong>N1–N8</strong> ativos em <strong>Configurar Níveis</strong>.` +
                (disabledText ? `<br><strong>Desativados agora:</strong> ${disabledText}` : '');
            hintBox.style.display = 'block';
        } else {
            hintText.innerHTML = '';
            hintBox.style.display = 'none';
        }
    }

    // Segurança extra: se alguém tentar forçar "conservative", desfaz e opcionalmente notifica
    if (!allVotingLevelsActive && select.value === 'conservative') {
        select.value = 'aggressive';
        ensureSignalIntensityCustomUI();
        if (options && options.source === 'user') {
            showCenteredNotice(
                `Não dá para ativar o modo <strong>Conservador</strong> sem todos os níveis votantes <strong>N1–N8</strong> ativos.` +
                (disabledText ? `<br><br><strong>Desativados agora:</strong> ${disabledText}` : ''),
                { title: 'Modo Conservador', autoHide: 6500 }
            );
        }
    }
}

    function populateDiamondLevelsForm(config) {
        const windows = (config && config.diamondLevelWindows) || {};
        const legacyKeyMap = {
            n6RetracementWindow: 'n8RetracementWindow',
            n7DecisionWindow: 'n10DecisionWindow',
            n7HistoryWindow: 'n10HistoryWindow',
            n8Barrier: 'n6Barrier',
            n0History: 'n0TotalHistory',
            n0Window: 'n0WindowSize',
            n1WindowSize: 'n1HotPattern'
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
        setInput('diamondN1WindowSize', getValue('n1WindowSize', DIAMOND_LEVEL_DEFAULTS.n1WindowSize));
        setInput('diamondN1PrimaryRequirement', getValue('n1PrimaryRequirement', DIAMOND_LEVEL_DEFAULTS.n1PrimaryRequirement));
        setInput('diamondN1SecondaryRequirement', getValue('n1SecondaryRequirement', DIAMOND_LEVEL_DEFAULTS.n1SecondaryRequirement));
        setInput('diamondN1MaxEntries', getValue('n1MaxEntries', DIAMOND_LEVEL_DEFAULTS.n1MaxEntries));
        setInput('diamondN2Recent', getValue('n2Recent', DIAMOND_LEVEL_DEFAULTS.n2Recent));
        setInput('diamondN3Alternance', getValue('n3Alternance', DIAMOND_LEVEL_DEFAULTS.n3Alternance));
        setInput('diamondN3PatternLength', getValue('n3PatternLength', DIAMOND_LEVEL_DEFAULTS.n3PatternLength));
        setInput('diamondN3BaseThresholdPct', getValue('n3BaseThresholdPct', DIAMOND_LEVEL_DEFAULTS.n3BaseThresholdPct));
        setInput('diamondN3ThresholdPct', getValue('n3ThresholdPct', DIAMOND_LEVEL_DEFAULTS.n3ThresholdPct));
        setInput('diamondN3MinOccurrences', getValue('n3MinOccurrences', DIAMOND_LEVEL_DEFAULTS.n3MinOccurrences));
        setCheckbox('diamondN3AllowBackoff', getBoolean('n3AllowBackoff', DIAMOND_LEVEL_DEFAULTS.n3AllowBackoff));
        setCheckbox('diamondN3IgnoreWhite', getBoolean('n3IgnoreWhite', DIAMOND_LEVEL_DEFAULTS.n3IgnoreWhite));
        // ✅ Migração N4: versões antigas usavam 20-120 como "janela". Agora é "Histórico".
        // Para não quebrar configs antigas: 20 => 2000, 60 => 6000, 120 => 10000 (clamp).
        const n4LegacyRaw = getValue('n4Persistence', DIAMOND_LEVEL_DEFAULTS.n4Persistence);
        const n4Normalized = (() => {
            const v = Number(n4LegacyRaw);
            if (!Number.isFinite(v) || v <= 0) return DIAMOND_LEVEL_DEFAULTS.n4Persistence;
            const scaled = (v >= 20 && v <= 120) ? (v * 100) : v;
            return Math.max(10, Math.min(10000, Math.floor(scaled)));
        })();
        setInput('diamondN4Persistence', n4Normalized);
        setCheckbox('diamondN4DynamicGales', getBoolean('n4DynamicGales', DIAMOND_LEVEL_DEFAULTS.n4DynamicGales));
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
        enforceSignalIntensityAvailability();
        initializeDiamondLevelToggles();
        refreshDiamondLevelToggleStates();
    }

    function openDiamondLevelsModal() {
        const modal = document.getElementById('diamondLevelsModal');
        if (!modal) return;
        storageCompat.get(['analyzerConfig']).then(res => {
            const cfg = res.analyzerConfig || {};
            populateDiamondLevelsForm(cfg);
            // ✅ Capturar snapshot para "Restaurar configurações"
            setDiamondLevelsRestoreSnapshot(cfg);
            
            // ✅ Mobile: manter comportamento atual
            if (!isDesktop()) {
            const container = document.getElementById('blaze-double-analyzer');
            const content = modal.querySelector('.custom-pattern-modal-content');
            if (container && content) {
                const rect = container.getBoundingClientRect();
                content.style.maxWidth = `${rect.width}px`;
                content.style.width = '100%';
            }
            }
            
            // 🖥️ Desktop (Dashboard novo): modal fica acoplado no workspace (lado direito)
            dockModalToDesktopWorkspace(modal);
            modal.style.display = 'flex';

            // ✅ Sempre abrir com todos os níveis fechados (accordion)
            try {
                initDiamondLevelsAccordion();
                resetDiamondLevelsAccordionClosed();
            } catch (_) {}
            
            const sidebarEl = document.getElementById('blaze-double-analyzer');
            const isCompactMode = sidebarEl && sidebarEl.classList.contains('compact-mode');

            // ✅ Registrar no sistema de janelas flutuantes somente no modo compacto (Desktop)
            if (isDesktop() && isCompactMode) {
                floatingWindows.register('diamondLevelsModal');
            }
        }).catch(() => {
            populateDiamondLevelsForm({});
            
            // ✅ Mobile: manter comportamento atual
            if (!isDesktop()) {
            const container = document.getElementById('blaze-double-analyzer');
            const content = modal.querySelector('.custom-pattern-modal-content');
            if (container && content) {
                const rect = container.getBoundingClientRect();
                content.style.maxWidth = `${rect.width}px`;
                content.style.width = '100%';
            }
            }
            
            // 🖥️ Desktop (Dashboard novo): modal fica acoplado no workspace (lado direito)
            dockModalToDesktopWorkspace(modal);
            modal.style.display = 'flex';

            // ✅ Sempre abrir com todos os níveis fechados (accordion)
            try {
                initDiamondLevelsAccordion();
                resetDiamondLevelsAccordionClosed();
            } catch (_) {}
            
            const sidebarEl = document.getElementById('blaze-double-analyzer');
            const isCompactMode = sidebarEl && sidebarEl.classList.contains('compact-mode');

            // ✅ Registrar no sistema de janelas flutuantes somente no modo compacto (Desktop)
            if (isDesktop() && isCompactMode) {
                floatingWindows.register('diamondLevelsModal');
            }
        });
    }

    async function saveDiamondLevels(options = {}) {
        const { silent = false, skipSync = false } = options || {};
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
        const n2W = getNumber('diamondN2Recent', 6, 200, DIAMOND_LEVEL_DEFAULTS.n2Recent);
        // ✅ Migração N4: versões antigas usavam 20-120 como "janela". Agora é "Histórico".
        // Para não quebrar configs antigas: 20 => 2000, 60 => 6000, 120 => 10000 (clamp).
        let n4History = getNumber('diamondN4Persistence', null, null, DIAMOND_LEVEL_DEFAULTS.n4Persistence);
        if (Number.isFinite(n4History) && n4History >= 20 && n4History <= 120) {
            n4History = n4History * 100;
        }
        n4History = Math.max(10, Math.min(10000, Math.floor(Number.isFinite(n4History) ? n4History : DIAMOND_LEVEL_DEFAULTS.n4Persistence)));
        const newWindows = {
            n0History: getNumber('diamondN0History', 500, 10000, DIAMOND_LEVEL_DEFAULTS.n0History),
            n0Window: getNumber('diamondN0Window', 25, 250, DIAMOND_LEVEL_DEFAULTS.n0Window),
            n1WindowSize: getNumber('diamondN1WindowSize', 5, 120, DIAMOND_LEVEL_DEFAULTS.n1WindowSize),
            n1PrimaryRequirement: getNumber('diamondN1PrimaryRequirement', 5, 200, DIAMOND_LEVEL_DEFAULTS.n1PrimaryRequirement),
            n1SecondaryRequirement: getNumber('diamondN1SecondaryRequirement', 1, 200, DIAMOND_LEVEL_DEFAULTS.n1SecondaryRequirement),
            n1MaxEntries: getNumber('diamondN1MaxEntries', 1, 20, DIAMOND_LEVEL_DEFAULTS.n1MaxEntries),
            // N2 (novo): janela base única (W). Mantemos n2Previous espelhado por compatibilidade.
            n2Recent: n2W,
            n2Previous: n2W,
            n3Alternance: getNumber('diamondN3Alternance', 1, null, DIAMOND_LEVEL_DEFAULTS.n3Alternance),
            n3PatternLength: getNumber('diamondN3PatternLength', 1, 200, DIAMOND_LEVEL_DEFAULTS.n3PatternLength),
            n3BaseThresholdPct: getNumber('diamondN3BaseThresholdPct', 50, 95, DIAMOND_LEVEL_DEFAULTS.n3BaseThresholdPct),
            n3ThresholdPct: getNumber('diamondN3ThresholdPct', 50, 95, DIAMOND_LEVEL_DEFAULTS.n3ThresholdPct),
            n3MinOccurrences: getNumber('diamondN3MinOccurrences', 1, 50, DIAMOND_LEVEL_DEFAULTS.n3MinOccurrences),
            n3AllowBackoff: getCheckboxValue('diamondN3AllowBackoff', DIAMOND_LEVEL_DEFAULTS.n3AllowBackoff),
            n3IgnoreWhite: getCheckboxValue('diamondN3IgnoreWhite', DIAMOND_LEVEL_DEFAULTS.n3IgnoreWhite),
            n4Persistence: n4History,
            // ✅ FIX: o toggle "Permitir mudar a cor no Gale (G1/G2)" deve persistir (não voltar sozinho)
            n4DynamicGales: getCheckboxValue('diamondN4DynamicGales', DIAMOND_LEVEL_DEFAULTS.n4DynamicGales),
            n5MinuteBias: getNumber('diamondN5MinuteBias', 10, 200, DIAMOND_LEVEL_DEFAULTS.n5MinuteBias),
            n6RetracementWindow: getNumber('diamondN6Retracement', 30, 120, DIAMOND_LEVEL_DEFAULTS.n6RetracementWindow),
            n7DecisionWindow: getNumber('diamondN7DecisionWindow', 10, 50, DIAMOND_LEVEL_DEFAULTS.n7DecisionWindow),
            n7HistoryWindow: getNumber('diamondN7HistoryWindow', 50, 200, DIAMOND_LEVEL_DEFAULTS.n7HistoryWindow),
            n8Barrier: getNumber('diamondN8Barrier', 1, null, DIAMOND_LEVEL_DEFAULTS.n8Barrier),
            n9History: getNumber('diamondN9History', 30, 400, DIAMOND_LEVEL_DEFAULTS.n9History),
            n9NullThreshold: getNumber('diamondN9NullThreshold', 2, 20, DIAMOND_LEVEL_DEFAULTS.n9NullThreshold),
            n9PriorStrength: getNumber('diamondN9PriorStrength', 0.2, 5, DIAMOND_LEVEL_DEFAULTS.n9PriorStrength),
            n10Window: getNumber('diamondN10Window', 5, 50, DIAMOND_LEVEL_DEFAULTS.n10Window),
            n10History: getNumber('diamondN10History', 100, 10000, DIAMOND_LEVEL_DEFAULTS.n10History)
        };
        if (newWindows.n1WindowSize < 5) {
            newWindows.n1WindowSize = 5;
        }
        if (newWindows.n1PrimaryRequirement >= newWindows.n1WindowSize) {
            newWindows.n1PrimaryRequirement = Math.max(1, newWindows.n1WindowSize - 1);
        }
        if (newWindows.n1SecondaryRequirement >= newWindows.n1WindowSize) {
            newWindows.n1SecondaryRequirement = Math.max(1, newWindows.n1WindowSize - 2);
        }
        if (newWindows.n1SecondaryRequirement >= newWindows.n1PrimaryRequirement) {
            newWindows.n1SecondaryRequirement = Math.max(1, newWindows.n1PrimaryRequirement - 1);
        }
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

        // N2: n2Previous espelhado, sem validação min/max (o código ajusta automaticamente)

        if (newWindows.n7HistoryWindow < newWindows.n7DecisionWindow) {
            if (!silent) {
            alert('O histórico base do N7 deve ser maior ou igual ao número de decisões analisadas.');
            return;
            }
            newWindows.n7HistoryWindow = Math.max(newWindows.n7DecisionWindow, DIAMOND_LEVEL_DEFAULTS.n7HistoryWindow);
        }

        const allowBlockCheckbox = document.getElementById('diamondN0AllowBlockAll');
        const allowBlockAll = allowBlockCheckbox ? !!allowBlockCheckbox.checked : true;

        try {
            // Feedback global: início do salvamento
            if (!silent) showGlobalSaveLoading();
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
                latestAnalyzerConfig = updatedConfig;
                // ✅ Atualizar snapshot do "Restaurar" para o estado recém-salvo
                setDiamondLevelsRestoreSnapshot(updatedConfig);
                enforceSignalIntensityAvailability();
            try {
                chrome.runtime.sendMessage({ action: 'applyConfig' });
            } catch (error) {
                console.warn('⚠️ Não foi possível notificar background sobre nova configuração dos níveis:', error);
            }
            const shouldSync = !skipSync && getSyncConfigPreference();
            if (shouldSync) {
                try {
                    await syncConfigToServer(updatedConfig);
                } catch (syncError) {
                    console.warn('⚠️ Erro ao sincronizar configurações dos níveis com o servidor:', syncError);
                }
            }
            // Não fechar o modal automaticamente; apenas mostrar sucesso
            if (!silent) showGlobalSaveSuccess(1500);
        } catch (err) {
            console.error('❌ Erro ao salvar configurações dos níveis diamante:', err);
            if (!silent) {
            alert('Não foi possível salvar as configurações dos níveis. Tente novamente.');
            }
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
            
            const sidebarEl = document.getElementById('blaze-double-analyzer');
            const isCompactMode = sidebarEl && sidebarEl.classList.contains('compact-mode');
            
            // ✅ Registrar no sistema de janelas flutuantes somente no modo compacto (Desktop)
            if (isDesktop() && isCompactMode) {
                floatingWindows.register('patternDetailsModal');
            }
            
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
            
        }, 100);
    }
    
    // Abrir modal
    function openCustomPatternModal() {
        const modal = document.getElementById('customPatternModal');
        // 🖥️ Desktop (Dashboard novo): modal acoplado no workspace (lado direito)
        dockModalToDesktopWorkspace(modal);
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
              : 'https://blaze-giros-api-v2-1.onrender.com',
          
          // API de Autenticação (usuários, admin, padrões customizados)
          auth: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
              ? 'http://localhost:3000'
              : 'https://blaze-analyzer-api-v2.onrender.com'
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

storageCompat.get(['analyzerConfig']).then(res => {
    latestAnalyzerConfig = res.analyzerConfig || null;
    enforceSignalIntensityAvailability();
}).catch(() => {});

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
        // ✅ snapshot do histórico de entradas (para cálculo de saldo por modo)
        // Precisa existir ANTES do init() (init chama updateStatusUI imediatamente).
        let autoBetEntriesSnapshot = [];
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

                // ✅ Atualizar imediatamente o formulário dos Níveis Diamante (sem recarregar página)
                try {
                    populateDiamondLevelsForm(newConfig || {});
                    refreshDiamondLevelToggleStates();
                    showSyncSpinner();
                } catch (err) {
                    console.warn('⚠️ Erro ao atualizar UI dos Níveis Diamante após sync:', err);
                }
            }
            if (changes.autoBetRuntime) {
                runtime = { ...AUTO_BET_RUNTIME_DEFAULTS, ...(changes.autoBetRuntime.newValue || {}) };
                updateSimulationSnapshots();
                updateStatusUI();
            }
        }

        // Pequena animação de sincronização no centro da tela (2s)
        let syncSpinnerTimeout = null;
        function showSyncSpinner() {
            try {
                let spinner = document.getElementById('diamondSyncSpinner');
                if (!spinner) {
                    spinner = document.createElement('div');
                    spinner.id = 'diamondSyncSpinner';
                    spinner.style.cssText = `
                        position: fixed;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        z-index: 9999999;
                        width: 64px;
                        height: 64px;
                        border-radius: 50%;
                        border: 5px solid rgba(255,255,255,0.2);
                        border-top-color: #ef4444;
                        animation: diamondSyncSpin 0.8s linear infinite;
                        background: rgba(0,0,0,0.35);
                        box-shadow: 0 8px 24px rgba(0,0,0,0.45);
                    `;
                    const style = document.createElement('style');
                    style.textContent = `@keyframes diamondSyncSpin { to { transform: translate(-50%, -50%) rotate(360deg); } }`;
                    document.head.appendChild(style);
                    document.body.appendChild(spinner);
                } else {
                    spinner.style.display = 'block';
                }
                clearTimeout(syncSpinnerTimeout);
                syncSpinnerTimeout = setTimeout(() => hideSyncSpinner(), 2000);
            } catch (err) {
                console.warn('⚠️ Erro ao exibir spinner de sync:', err);
            }
        }
        function hideSyncSpinner() {
            const spinner = document.getElementById('diamondSyncSpinner');
            if (spinner) {
                spinner.style.display = 'none';
            }
        }

        function getInitialBalanceValue() {
            // Se modo real estiver ativo e houver saldo da Blaze, usar o saldo real
            if (config.enabled) {
                try {
                    const savedSession = localStorage.getItem('blazeSession');
                    if (savedSession) {
                        const sessionData = JSON.parse(savedSession);
                        
                        let blazeBalance = 0;
                        
                        // Tentar pegar do array balance (formato da API)
                        if (sessionData.balance && Array.isArray(sessionData.balance) && sessionData.balance.length > 0) {
                            blazeBalance = parseFloat(sessionData.balance[0].balance) || 0;
                            console.log(`💰 [getInitialBalanceValue] Saldo do array: R$ ${blazeBalance.toFixed(2)}`);
                        }
                        // Tentar pegar de user.balance (pode ser string ou número)
                        else if (sessionData.user && sessionData.user.balance) {
                            const userBalance = sessionData.user.balance;
                            if (typeof userBalance === 'string') {
                                blazeBalance = parseFloat(userBalance.replace(',', '.')) || 0;
                            } else {
                                blazeBalance = parseFloat(userBalance) || 0;
                            }
                            console.log(`💰 [getInitialBalanceValue] Saldo do user: R$ ${blazeBalance.toFixed(2)}`);
                        }
                        
                        if (blazeBalance > 0) {
                            console.log(`✅ [getInitialBalanceValue] Usando saldo REAL da Blaze: R$ ${blazeBalance.toFixed(2)}`);
                            return Math.max(0, blazeBalance);
                        }
                    }
                } catch (error) {
                    console.warn('⚠️ Erro ao buscar saldo da Blaze:', error);
                }
            }
            // Caso contrário, usar saldo simulado
            console.log(`🎮 [getInitialBalanceValue] Usando saldo SIMULADO: R$ ${Number(config.simulationBankRoll) || AUTO_BET_DEFAULTS.simulationBankRoll}`);
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
                    align-items: stretch;
                    justify-content: flex-start;
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
                    border-radius: 0;
                    border: none;
                    width: 100%;
                    height: 100%;
                    max-width: 100%;
                    max-height: 100%;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }
                .auto-bet-modal-body {
                    padding: 20px;
                    flex: 1;
                    max-height: none;
                    overflow-y: auto;
                    background: #1a2332;
                }
                .auto-bet-mode-layout {
                    display: flex;
                    flex-direction: column;
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
                    background: rgba(239, 68, 68, 0.15);
                    box-shadow: inset 0 0 0 2px #ef4444;
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
            // ✅ Após reload, o entriesHistory pode chegar antes da UI estar pronta.
            // Como updateStatusUI depende de uiRefs, chamamos aqui para recalcular o painel
            // usando o snapshot já carregado (não “zerar” no refresh).
            updateStatusUI();
            // ✅ Garantir: ao abrir a sidebar (ex.: refresh), puxar o histórico do storage e recalcular
            // sem depender de chegar um novo sinal/ENTRIES_UPDATE.
            try {
                storageCompat.get(['entriesHistory']).then((res = {}) => {
                    try {
                        const entries = Array.isArray(res.entriesHistory) ? res.entriesHistory : [];
                        autoBetEntriesSnapshot = entries;
                        updateStatusUI();
                    } catch (_) {}
                }).catch(() => {});
            } catch (_) {}
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

        function getActiveAnalysisModeKey() {
            const aiModeToggle = document.querySelector('.ai-mode-toggle.active');
            return aiModeToggle ? 'diamond' : 'standard';
        }

        // ✅ Saldo por entrada (pendente) separado por modo (Diamante vs Premium)
        function ensurePendingExposureShape() {
            const cur = runtime && typeof runtime === 'object' ? runtime.pendingExposureByMode : null;
            if (!cur || typeof cur !== 'object') {
                runtime.pendingExposureByMode = { diamond: 0, standard: 0 };
                return;
            }
            if (!Number.isFinite(Number(cur.diamond))) cur.diamond = 0;
            if (!Number.isFinite(Number(cur.standard))) cur.standard = 0;
            runtime.pendingExposureByMode = cur;
        }

        function setPendingExposureForMode(modeKey, value) {
            ensurePendingExposureShape();
            const k = modeKey === 'diamond' ? 'diamond' : 'standard';
            runtime.pendingExposureByMode[k] = Math.max(0, Number(value) || 0);
        }

        function addPendingExposureForMode(modeKey, delta) {
            ensurePendingExposureShape();
            const k = modeKey === 'diamond' ? 'diamond' : 'standard';
            runtime.pendingExposureByMode[k] = Math.max(0, Number(runtime.pendingExposureByMode[k] || 0) + (Number(delta) || 0));
        }

        function filterEntriesSnapshotByMode(allEntries, modeKey) {
            const entriesArr = Array.isArray(allEntries) ? allEntries : [];
            const hasExplicitMode = entriesArr.some(e => e && (e.analysisMode === 'diamond' || e.analysisMode === 'standard'));
            return entriesArr.filter(e => {
                if (!e) return false;
                const m = (e.analysisMode === 'diamond' || e.analysisMode === 'standard')
                    ? e.analysisMode
                    : (hasExplicitMode ? 'legacy' : 'standard');
                return m === modeKey;
            });
        }

        function updateStatusUI(message) {
            if (!uiRefs) return;
            // ✅ Mostrar saldo sempre que houver histórico (mesmo se autoaposta estiver desativada),
            // porque o simulador é por entrada (WIN/LOSS) e não depende do modo de execução.
            const shouldDisplayBalances = !!config.simulationOnly || !!config.enabled || (Array.isArray(autoBetEntriesSnapshot) && autoBetEntriesSnapshot.length > 0);
            
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
            // ✅ Importante: separar saldo do simulador por modo (Diamante vs Premium).
            // Agora, "Apostas" acompanha o fluxo principal (IA), então o resultado realizado vem do autoBetHistory
            // sem depender de isMaster.
            const activeMode = getActiveAnalysisModeKey();
            const cutoffMs = (() => {
                try {
                    return Number(getEntriesCutoffMs(activeMode)) || 0;
                } catch (_) {
                    return 0;
                }
            })();
            const entriesForMode = (() => {
                try {
                    const byMode = filterEntriesSnapshotByMode(autoBetEntriesSnapshot, activeMode);
                    if (!cutoffMs) return byMode;
                    return byMode.filter(e => getEntryTimestampMs(e) >= cutoffMs);
                } catch (_) {
                    return [];
                }
            })();

            // ✅ Regra do Painel (pedido do usuário):
            // O Painel de saldo deve refletir TODAS as entradas exibidas na aba IA/Gráfico.
            // Portanto, calcular SEMPRE pelo entriesHistory (snapshot) com o mesmo filtro de modo/cutoff,
            // e NÃO por um store paralelo (autoBetHistoryStore) que pode conter apenas parte do histórico.
            let realizedProfitNet = 0;
            try {
                if (shouldDisplayBalances && entriesForMode.length) {
                    const snapshot = computeEntriesProfitSnapshot(entriesForMode, config);
                    realizedProfitNet = Number(snapshot && snapshot.profit) || 0;
                } else {
                    realizedProfitNet = 0;
                }
            } catch (_) {
                realizedProfitNet = 0;
            }
            // ✅ Exibição: "Lucro" e "Perdas" são o resultado líquido.
            // Se ainda está positivo, Perdas deve ficar 0 (perdas apenas quando abaixo do saldo inicial).
            const realizedProfitEarned = shouldDisplayBalances ? Math.max(0, realizedProfitNet) : 0;
            const realizedLossSpent = shouldDisplayBalances ? Math.max(0, -realizedProfitNet) : 0;

            // ✅ Pendente: entrada feita e aguardando resultado (desconta no saldo atual imediatamente),
            // separado por modo e sem misturar com realizado.
            ensurePendingExposureShape();
            const pendingExposure = shouldDisplayBalances
                ? Number(runtime?.pendingExposureByMode?.[activeMode] || 0)
                : 0;
            // ✅ Lucro/Perdas devem refletir o MESMO delta do Saldo Atual.
            // Se tem entrada pendente, ela reduz o "lucro disponível" (não faz sentido lucro ficar maior que saldo atual - saldo inicial).
            const netAfterPending = shouldDisplayBalances ? Number((realizedProfitNet - pendingExposure).toFixed(2)) : 0;
            const profitValue = shouldDisplayBalances ? Math.max(0, netAfterPending) : 0;
            const lossValue = shouldDisplayBalances ? Math.max(0, -netAfterPending) : 0;
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
                    ? initialBalance + netAfterPending
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
                isMaster: !!(analysis && analysis.masterSignal && analysis.masterSignal.active),
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
            // ✅ NOVO: só executar autoaposta/simulação em SINAL DE ENTRADA
            if (!(analysis && analysis.masterSignal && analysis.masterSignal.active)) {
                return;
            }
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
            // ✅ Sempre manter um snapshot para o simulador de saldo (mesmo vazio),
            // para que alternar modos e limpar histórico atualize o painel corretamente.
            autoBetEntriesSnapshot = Array.isArray(entries) ? entries : [];
            if (!autoBetEntriesSnapshot.length) {
                updateStatusUI();
                return;
            }
            if (!isAutomationActive() && !runtime.openCycle) {
                updateStatusUI();
                return;
            }
            const latest = autoBetEntriesSnapshot[0];
            if (!latest || runtime.lastProcessedEntryTimestamp === latest.timestamp) {
                updateStatusUI();
                return;
            }
            runtime.lastProcessedEntryTimestamp = latest.timestamp;
            if (!runtime.openCycle) {
                updateStatusUI();
                return;
            }
            
            const isWin = latest.result === 'WIN';
            const isFinalLoss = latest.result === 'LOSS' && ((latest.finalResult === 'RED' || latest.finalResult === 'RET') || !hasContinuationFlag(latest));
            if (isWin) {
                finalizeCycle('WIN', latest);
            } else if (isFinalLoss) {
                finalizeCycle('LOSS', latest);
            } else {
                markIntermediateLoss();
                persistRuntime(true);
                updateStatusUI();
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
                    mode: analysis?.analysisMode || (document.querySelector('.ai-mode-toggle.active') ? 'diamond' : 'standard')
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
            const activeModeKey = runtime.openCycle.mode || getActiveAnalysisModeKey();
            const isFirstBetInCycle = runtime.openCycle.bets.length === 0;
            if (isFirstBetInCycle) {
                // ✅ Novo ciclo: limpar exposição acumulada do modo antes de começar a somar novamente
                setPendingExposureForMode(activeModeKey, 0);
            }
            runtime.openCycle.bets.push({
                stage: stageInfo.label,
                amount,
                color,
                timestamp: Date.now()
            });
            // ✅ Entrada feita → descontar imediatamente no saldo atual (pendente) do modo correspondente.
            // Lucro/Perdas só mudam quando o resultado sair (WIN/LOSS no histórico).
            addPendingExposureForMode(activeModeKey, amount);
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
                updatedEntry.finalResult = 'RED';
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
            // ✅ Proteção no branco faz parte da mesma entrada pendente (somar no pendente do modo).
            addPendingExposureForMode(runtime.openCycle.mode || getActiveAnalysisModeKey(), amount);
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
                // ✅ Segurança: ao finalizar/resetar, não deixar pendentes “vazando” entre modos.
                if (runtime && typeof runtime === 'object') {
                    runtime.pendingExposureByMode = { diamond: 0, standard: 0 };
                }
                updateSimulationSnapshots();
                persistRuntime(true);
                updateStatusUI();
                resetActiveBetCards(config.whiteProtection);
                return;
            }
            // ✅ Ciclo finalizado → pendente do modo atual deve zerar.
            setPendingExposureForMode(runtime.openCycle.mode || getActiveAnalysisModeKey(), 0);
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

    // ═══════════════════════════════════════════════════════════════════════════════
    // ☁️ UI: Toggle "Sincronizar configurações" (fora da seção de modo, fácil acesso)
    // ═══════════════════════════════════════════════════════════════════════════════

    let syncConfigToggleEnabled = true;

    function updateSyncConfigToggleUI(isEnabled) {
        syncConfigToggleEnabled = !!isEnabled;
        const toggleBtn = document.getElementById('syncConfigToggleBtn');
        if (!toggleBtn) return;
        toggleBtn.classList.toggle('active', syncConfigToggleEnabled);
        const label = toggleBtn.querySelector('.toggle-label');
        if (label) {
            label.textContent = syncConfigToggleEnabled ? 'Sincronização ativa' : 'Sincronizar configs';
        }
        toggleBtn.title = syncConfigToggleEnabled
            ? 'Sincronizar configurações com a conta (ATIVO)'
            : 'Sincronizar configurações com a conta (DESATIVADO)';

        // manter checkbox compatível (usado em load/save)
        const chk = document.getElementById('syncConfigToAccount');
        if (chk && typeof chk.checked === 'boolean') {
            chk.checked = syncConfigToggleEnabled;
        }
    }

    function initializeSyncConfigToggleState() {
        try {
            const enabled = getSyncConfigPreference();
            updateSyncConfigToggleUI(enabled);
        } catch (_) {
            updateSyncConfigToggleUI(true);
        }
    }

    function bindSyncConfigToggleUI() {
        const toggleBtn = document.getElementById('syncConfigToggleBtn');
        if (!toggleBtn || toggleBtn.dataset.bound === '1') return;
        toggleBtn.dataset.bound = '1';
        toggleBtn.addEventListener('click', async () => {
            const chk = document.getElementById('syncConfigToAccount');
            const current = chk ? !!chk.checked : !!getSyncConfigPreference();
            const next = !current;
            try {
                if (chk) chk.checked = next;
            } catch (_) {}
            try { saveSyncConfigPreference(next); } catch (_) {}
            updateSyncConfigToggleUI(next);
            try { showToast(next ? 'Sincronização ativada' : 'Sincronização desativada', 1800); } catch (_) {}

            // ✅ Persistir preferência na conta, para todos os dispositivos respeitarem
            try {
                const stored = await storageCompat.get(['analyzerConfig']);
                const currentConfig = stored?.analyzerConfig || {};
                const updatedConfig = { ...currentConfig, syncConfigToAccount: next };
                await storageCompat.set({ analyzerConfig: updatedConfig });
                // Sempre enviar para o servidor (mesmo ao desativar), pois é a própria preferência
                await syncConfigToServer(updatedConfig);
            } catch (error) {
                console.warn('⚠️ Não foi possível persistir preferência de sincronização na conta:', error);
            }
        });
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
    // 🛡️ ZONA SEGURA - VISUAL NO BOTÃO DE STATUS
    // ═══════════════════════════════════════════════════════════════════════════════
    
    function renderSafeZoneStatus(meta) {
        const btn = document.getElementById('btnSafeZone');
        if (!btn) return;
        
            btn.style.height = 'auto';
        btn.style.padding = '12px 14px';
        btn.title = 'Zona Segura monitora predominâncias fortes e confirmações';
        
        if (!meta) {
            btn.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 4px; align-items: center;">
                    <div style="font-size: 12px; font-weight: 600;">Zona Segura</div>
                    <div class="safe-zone-status-pill status-idle">Aguardando histórico</div>
                </div>
            `;
            return;
        }
        
        if (!meta.zoneActive) {
            let reasonLabel = 'Requisitos não atendidos';
            if (meta.reason === 'insufficient_history') reasonLabel = 'Histórico insuficiente';
            if (meta.reason === 'entry_limit_reached') reasonLabel = 'Limite atingido';
            btn.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 4px; align-items: center;">
                    <div style="font-size: 12px; font-weight: 600;">Zona Segura</div>
                    <div class="safe-zone-status-pill status-idle">${reasonLabel}</div>
                </div>
            `;
            return;
        }
        
        const dominantLabel = meta.dominant
            ? `${meta.dominant.toUpperCase()} • ${meta.counts[meta.dominant]}/${meta.windowSize}`
            : 'Dominância ativa';
        const secondaryLabel = meta.secondary
            ? `${meta.secondary.toUpperCase()} • ${meta.counts[meta.secondary]}`
            : 'Sem requisito B';
        const statusClass = meta.reason === 'entry_limit_reached'
            ? 'status-idle'
            : (meta.signal ? 'status-ready' : 'status-waiting');
        const statusText = meta.reason === 'entry_limit_reached'
            ? 'Limite de entradas atingido'
            : (meta.signal ? 'Confirmado! Entrar no próximo giro' : 'Aguardando última cor');
        const entriesInfo = meta.maxEntries
            ? `${Math.min(meta.entriesUsed || 0, meta.maxEntries)}/${meta.maxEntries}`
            : `${meta.entriesUsed || 0}`;
        
            btn.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 6px; align-items: center; width: 100%;">
                <div style="font-size: 11px; font-weight: 600;">Zona Segura</div>
                <div style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
                    <div class="safe-zone-row">
                        <span class="safe-zone-label">Dominante</span>
                        <span class="safe-zone-value">${dominantLabel}</span>
                    </div>
                    <div class="safe-zone-row">
                        <span class="safe-zone-label">Suporte</span>
                        <span class="safe-zone-value">${secondaryLabel}</span>
                    </div>
                    <div class="safe-zone-row">
                        <span class="safe-zone-label">Entradas</span>
                        <span class="safe-zone-value">${entriesInfo}</span>
                    </div>
                </div>
                <div class="safe-zone-status-pill ${statusClass}">${statusText}</div>
                </div>
            `;
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
            // ✅ Sincronizar TODA a configuração da conta (inclui modo Premium/Diamante)
            const configToSync = { ...config };
            
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
            // Feedback global: início do salvamento
            showGlobalSaveLoading();
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
            
            // Feedback global: sucesso
            showGlobalSaveSuccess(1500);
            
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
                <div class="resize-handle resize-w"></div>
                <div class="resize-handle resize-nw"></div>
                <div class="resize-handle resize-sw"></div>
            </div>
            
            <!-- HEADER MINIMALISTA - SEM BOTÕES VOLUMOSOS -->
            <div class="da-header">
                <!-- 1. Left: Brand -->
                <div class="da-brand">
                    <img id="daAppLogo" class="da-app-logo" alt="Logo" style="display:none;">
                    <span class="da-app-name" id="daAppName">Double</span>
                    <span class="title-badge" id="titleBadge">Análise Premium</span>
                            </div>

                <!-- 2. Center: Simple Controls -->
                <div class="da-controls-group">
                    <button type="button" class="header-link ai-mode-toggle" id="aiModeToggle" title="Ativar/Desativar IA">
                        <span id="aiToggleLabel">AI OFF</span>
                    </button>
                        </div>

                <!-- 3. Right: User -->
                <div class="da-user-actions">
                    <button class="header-link user-menu-toggle" id="userMenuToggle" title="Minha Conta">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                    </button>
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

                    <!-- ✅ Telegram Chat ID (fora das configurações do modo) -->
                    <div class="user-info-item-editable">
                        <span class="user-info-label">Telegram Chat ID</span>
                        <div style="display: flex; gap: 6px; align-items: stretch;">
                            <input type="password" class="profile-input" id="cfgTgChatId" placeholder="Digite seu Chat ID" style="flex: 1; min-width: 0;" />
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
                    
                    <div class="profile-divider">Configurações</div>
                    
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
                    <div class="user-info-item">
                        <button type="button" class="view-mode-toggle-btn" id="betModeToggleBtn" title="Alternar entre modo completo e modo aposta">
                            <span id="betViewLabel">Modo Completo</span>
                        </button>
                    </div>
                    
                    <!-- CAMPOS EDITÁVEIS DE PERFIL -->
                    <div class="profile-divider">Dados Pessoais</div>
                    
                    <div class="user-info-item">
                        <span class="user-info-label">Email</span>
                        <span class="user-info-value" id="userMenuEmail">—</span>
                    </div>
                    
                    <div class="user-info-item-editable phone-field">
                        <div class="user-info-label-row">
                            <span class="user-info-label">Telefone</span>
                            <button type="button" class="profile-edit-link" id="editPhoneBtn" style="display: none;">Editar</button>
                        </div>
                        <input type="tel" class="profile-input" id="profilePhone" />
                    </div>
                    
                    <div class="user-info-item-editable">
                        <span class="user-info-label">CPF</span>
                        <input type="text" class="profile-input" id="profileCpf" maxlength="14" />
                    </div>
                    
                    <div class="profile-divider">Endereço</div>
                    
                    <div class="user-info-item-editable">
                        <span class="user-info-label">CEP</span>
                        <input type="text" class="profile-input" id="profileZipCode" maxlength="9" />
                    </div>
                    <div class="user-info-item-editable">
                        <span class="user-info-label">Rua</span>
                        <input type="text" class="profile-input" id="profileStreet" />
                    </div>
                    <div class="user-info-row">
                        <div class="user-info-item-editable user-info-number">
                            <span class="user-info-label">Número</span>
                            <input type="text" class="profile-input" id="profileNumber" />
                        </div>
                        <div class="user-info-item-editable user-info-complement">
                            <span class="user-info-label">Complemento</span>
                            <input type="text" class="profile-input" id="profileComplement" />
                        </div>
                    </div>
                    <div class="user-info-item-editable">
                        <span class="user-info-label">Bairro</span>
                        <input type="text" class="profile-input" id="profileNeighborhood" />
                    </div>
                    <div class="user-info-row">
                        <div class="user-info-item-editable user-info-city">
                            <span class="user-info-label">Cidade</span>
                            <input type="text" class="profile-input" id="profileCity" />
                        </div>
                        <div class="user-info-item-editable user-info-state">
                            <span class="user-info-label">Estado</span>
                            <input type="text" class="profile-input" id="profileState" maxlength="2" />
                        </div>
                    </div>
                    
                    <button type="button" class="save-profile-btn" id="saveProfileBtn">
                        <span class="button-label">Salvar Dados</span>
                    </button>
                </div>
                <div class="user-menu-footer">
                    <button type="button" class="user-menu-logout" id="userMenuLogout">Sair da conta</button>
                </div>
            </div>
            <div class="analyzer-content" id="analyzerContent">
            <div class="analyzer-default-view" id="analyzerDefaultView">
            <div class="auto-bet-summary" id="autoBetSummary">
                <div class="auto-bet-summary-header">
                    <span class="auto-bet-summary-title">Painel</span>
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
                
            <div class="analysis-lastspin-row">
                 <div class="analysis-section highlight-panel">
                     <h4 id="analysisModeTitle">Aguardando sinal</h4>
                    <div class="analysis-card">
                     <div class="confidence-meter">
                         <div class="confidence-bar">
                             <div class="confidence-fill" id="confidenceFill"></div>
                         </div>
                         <div class="confidence-text" id="confidenceText">0%</div>
                     </div>
                     
                     <div class="suggestion-box" id="suggestionBox">
                         <div class="suggestion-color-wrapper">
                             <!-- Estado inicial: sem sinal => spinner sempre (persistente após reload) -->
                             <div class="suggestion-color suggestion-color-box neutral loading" id="suggestionColor"><div class="spinner"></div></div>
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
                        <button type="button" class="entries-tab active" data-tab="entries">IA</button>
                        <button type="button" class="entries-tab" data-tab="master">Recuperação</button>
                        <button type="button" class="entries-tab" data-tab="chart">Gráfico</button>
                    </div>
                <div class="entries-header">
                    <span class="entries-hit" id="entriesHit">Acertos: 0/0 (0%)</span>
                    <span class="entries-hit" id="masterEntriesHit" style="display:none;">Recuperação: desativada</span>
                </div>
                    <div class="entries-content">
                        <div class="entries-view" data-view="master" hidden>
                            <div class="entries-list" id="masterEntriesList"></div>
                        </div>
                        <div class="entries-view" data-view="entries">
                            <div class="entries-list-wrap" id="entriesListWrap">
                                <div class="entries-list" id="entriesList"></div>
                                <!-- ✅ Toggle: expandir histórico (tela cheia) -->
                                <div class="ia-tests-toggle" id="iaTestsToggle" style="display:none;">
                                    <button type="button" class="ia-tests-toggle-btn" id="iaTestsToggleBtn" aria-label="Expandir histórico (tela cheia)" title="Expandir histórico (tela cheia)">
                                        <svg class="ia-tests-toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
                                            <path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm0-4h2V7h3V5H5v5zm14 9h-5v-2h3v-3h2v5zm-5-14h5v5h-2V7h-3V5z"/>
                                        </svg>
                                    </button>
                                </div>
                                <!-- ✅ Vidro desfocado (mostra apenas o "vulto" do conteúdo) -->
                                <div class="ia-bootstrap-glass" id="iaBootstrapGlass" style="display:none;"></div>
                                <!-- ✅ IA VIVA: aparece quando a aba IA está vazia (após Limpar ou primeira abertura) -->
                                <div class="ia-bootstrap-overlay" id="iaBootstrapOverlay" style="display:none;">
                                    <div class="ia-bootstrap-orb" id="iaBootstrapOrb" data-state="idle">
                                        <button type="button" class="ai-orb-btn" id="iaBootstrapBtn" title="Analisar histórico">
                                            <span class="ai-orb-smoke" aria-hidden="true"></span>
                                            <span class="ai-orb-liquid" aria-hidden="true"></span>
                                            <span class="ai-orb-fog fog1" aria-hidden="true"></span>
                                            <span class="ai-orb-fog fog2" aria-hidden="true"></span>
                                            <span class="ai-orb-label">IA</span>
                                            <span class="ai-orb-check" aria-hidden="true">✓</span>
                                        </button>
                                        <div class="ia-bootstrap-text" id="iaBootstrapText" role="status" aria-live="polite">Analisar histórico</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="entries-view" data-view="chart" hidden>
                            <div class="diamond-sim-chart-wrap">
                                <div class="diamond-sim-chart-row win">
                                    <div class="diamond-sim-chart-label">WIN</div>
                                    <div class="diamond-sim-chart-bar">
                                        <div class="diamond-sim-chart-fill" id="entriesChartWinFill" style="width:0%"></div>
                    </div>
                                    <div class="diamond-sim-chart-value" id="entriesChartWinValue">0 (0%)</div>
                </div>
                                <div class="diamond-sim-chart-row loss">
                                    <div class="diamond-sim-chart-label">LOSS</div>
                                    <div class="diamond-sim-chart-bar">
                                        <div class="diamond-sim-chart-fill" id="entriesChartLossFill" style="width:0%"></div>
                                    </div>
                                    <div class="diamond-sim-chart-value" id="entriesChartLossValue">0 (0%)</div>
                                </div>
                                <div class="diamond-sim-chart-foot" id="entriesChartFoot">Entradas: 0</div>

                                <div class="diamond-sim-equity-metrics">
                                    <div class="diamond-sim-equity-metric">
                                        <span class="label">Saldo</span>
                                        <span class="value" id="entriesEquityBalance">R$ 0,00</span>
                                    </div>
                                    <div class="diamond-sim-equity-metric">
                                        <span class="label">Perdas</span>
                                        <span class="value" id="entriesEquityLoss">R$ 0,00</span>
                                    </div>
                                </div>

                                <div class="diamond-sim-ticks-layer" id="entriesTicksLayer">
                                    <svg class="diamond-sim-ticks-svg" id="entriesTicksSvg" viewBox="0 0 1000 160" preserveAspectRatio="none" aria-label="Gráfico por entrada">
                                        <path id="entriesTicksBaseline" d="" />
                                        <path id="entriesTicksMaxLine" d="" />
                                        <path id="entriesTicksMinLine" d="" />
                                        <path id="entriesTicksCurrentLine" d="" />
                                        <path id="entriesTicksWinPath" d="" />
                                        <path id="entriesTicksLossPath" d="" />
                                    </svg>
                                    <div class="diamond-sim-guide-label max" id="entriesGuideMax"></div>
                                    <div class="diamond-sim-guide-label min" id="entriesGuideMin"></div>
                                    <div class="diamond-sim-guide-label cur" id="entriesGuideCur"></div>
                                    <div class="diamond-sim-direction" id="entriesGuideDir"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                 </div>
                
                <div class="pattern-section">
                    <h4>Padrão</h4>
                    <div class="pattern-info" id="patternInfo">
                        
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
                    <h4>Recuperação segura</h4>
                    <!-- ✅ Sistema Híbrido (FASE 2): legado. Mantido apenas por compatibilidade, mas oculto em todas as telas. -->
                    <div class="observer-hybrid" id="observerHybrid" style="display:none;">
                        <div class="observer-hybrid-row">
                            <span class="observer-hybrid-label">Sistema híbrido</span>
                            <select class="observer-hybrid-select" id="entryGateHybridMode" title="Camadas da Fase 2 (todas juntas ou somente um nível)">
                                <option value="auto">Híbrido (todos)</option>
                                <option value="manual">Somente 1 nível</option>
                            </select>
                        </div>
                        <div class="observer-hybrid-row" id="entryGateHybridManualRow">
                            <span class="observer-hybrid-label">Nível</span>
                            <select class="observer-hybrid-select" id="entryGateHybridManualLevel" title="Operar SOMENTE neste nível (1 = mais rígido, 3 = mais volume)">
                                <option value="1">Nível 1</option>
                                <option value="2">Nível 2</option>
                                <option value="3">Nível 3</option>
                            </select>
                        </div>
                        <div class="observer-hybrid-row" id="entryGateHybridAutoRow" style="display:none;">
                            <span class="observer-hybrid-label">Meta</span>
                            <input class="observer-hybrid-input" id="entryGateHybridTarget" type="number" min="10" max="200" step="1" inputmode="numeric" title="Meta aproximada de sinais (modo híbrido)" />
                        </div>
                    </div>
                    <div class="observer-stats" id="observerStats">
                        <div class="observer-loading">Carregando...</div>
                    </div>
                    <div class="observer-calibration">
                        <div class="calibration-label">Próximo sinal:</div>
                        <div class="calibration-value" id="calibrationFactor">—</div>
                    </div>
                    <div class="observer-accuracy">
                        <div class="accuracy-item">
                            <span class="accuracy-label">Sinais analisados:</span>
                            <span class="accuracy-value" id="observerTotal">0</span>
                        </div>
                        <div class="accuracy-item">
                            <span class="accuracy-label">Alvos/Distâncias:</span>
                            <span class="accuracy-value" id="observerWinRate">0%</span>
                        </div>
                    </div>
                    <div class="observer-by-confidence">
                        <div class="obs-conf-item">
                            <span class="obs-conf-label">Entrada:</span>
                            <span class="obs-conf-stat" id="obsHigh">—</span>
                        </div>
                        <div class="obs-conf-item">
                            <span class="obs-conf-label">G1:</span>
                            <span class="obs-conf-stat" id="obsMedium">—</span>
                        </div>
                        <div class="obs-conf-item">
                            <span class="obs-conf-label">G2:</span>
                            <span class="obs-conf-stat" id="obsLow">—</span>
                        </div>
                    </div>
                    <!-- Atualização é automática (debounce). Botão removido. -->
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
            </div> <!-- fim analyzer-default-view -->
            
            <!-- MODO APOSTA / VISUALIZAÇÃO SIMPLIFICADA -->
            <div class="bet-mode-view" id="betModeView" style="display:none;">
                <div class="bet-mode-card">
                    <div class="bet-mode-card-title">Aposta agora</div>
                    <div class="bet-mode-meter">
                        <div class="confidence-bar">
                            <div class="confidence-fill" id="betModeConfidenceFill"></div>
            </div>
                        <div class="bet-mode-confidence-text" id="betModeConfidenceText">0%</div>
                    </div>
                    <div class="bet-mode-block">
                        <div class="bet-mode-suggestion" id="betModeSuggestion"></div>
                    </div>
                </div>
                <div class="bet-mode-card">
                    <div class="bet-mode-card-title">Último giro</div>
                    <div class="bet-mode-block">
                        <div class="bet-mode-lastspin">
                            <div class="bet-mode-lastspin-number" id="betModeLastSpinNumber">-</div>
                            <div class="bet-mode-lastspin-time" id="betModeLastSpinTime">--:--</div>
                        </div>
                    </div>
                </div>
            </div> <!-- fim bet-mode-view -->
            <div class="auto-bet-modal" id="autoBetModal" style="display:none;">
                <div class="auto-bet-modal-overlay"></div>
                <div class="auto-bet-modal-content">
                <div class="auto-bet-modal-header modal-header-minimal">
                        <h3>Configurações ativas</h3>
                    <button type="button" class="auto-bet-modal-close modal-header-close" id="closeAutoBetModal">
                            Fechar
                        </button>
                    </div>
                    <div class="auto-bet-modal-body">
                        <!-- ✅ Preferência global (IA + Premium): sincronizar configurações -->
                        <div class="sync-config-toggle-wrap" id="syncConfigToggleWrap">
                            <button class="auto-bet-config-launcher toggle-analyzer-btn" id="syncConfigToggleBtn" type="button" title="Sincronizar configurações com a conta">
                                <span class="toggle-label">Sincronização ativa</span>
                                <span class="toggle-indicator"></span>
                            </button>
                            <!-- Mantém compatibilidade: saveSettings/loadSettings leem o checkbox -->
                            <input type="checkbox" id="syncConfigToAccount" checked style="display:none" />
                        </div>
                        <div class="auto-bet-accordion" id="autoBetAccordion">
                            <!-- 1) CONFIGURAÇÃO DO MODO -->
                            <div class="auto-bet-acc-section" data-acc-key="mode">
                                <button type="button" class="auto-bet-acc-header" aria-expanded="false" aria-controls="autoBetAccBody-mode">
                                    <span class="auto-bet-acc-title">Configuração do modo</span>
                                    <span class="auto-bet-acc-caret" aria-hidden="true">▾</span>
                                </button>
                                <div class="auto-bet-acc-body" id="autoBetAccBody-mode">
                                    <!-- ✅ Mover o container inteiro de Configurações para dentro do modal (ambos os modos) -->
                                    <div class="settings-section settings-section-mode" style="margin-top: 0;">
                    <div class="settings-grid">
                        <div class="setting-item" id="historyDepthSetting">
                            <span class="setting-label">Profundidade de Análise (giros):</span>
                            <input type="number" id="cfgHistoryDepth" min="100" max="10000" value="500" title="Quantidade de giros para análise e busca de padrões (100-10000) - VÁLIDO APENAS NO MODO PADRÃO" placeholder="Ex: 500 giros" />
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
                                id="cfgPatternInterval"
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
                        <!-- Simulação no passado (Modo Padrão / Análise Premium) -->
                        <div class="setting-item setting-row" id="standardSimulationContainer" style="margin-top: 10px;">
                            <div class="hot-pattern-actions">
                                <button id="standardSimulationBtn" class="btn-hot-pattern btn-standard-test-config" type="button" title="Simular/otimizar esta configuração no passado (sem olhar o futuro)">
                                    Testar configurações
                                </button>
                            </div>
                        </div>
                        
                        <!-- ═══════════════════════════════════════════════════════ -->
                        <!-- NÍVEL DIAMANTE (IA): CONFIGURAR NÍVEIS -->
                        <!-- ═══════════════════════════════════════════════════════ -->
                        <div class="setting-item setting-row" id="diamondLevelsContainer" style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #333;">
                            <div class="hot-pattern-actions">
                                <button id="diamondLevelsBtn" class="btn-hot-pattern btn-diamond-levels">
                                    Configurar Níveis
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
                                <!-- Select real fica oculto (usado para persistência/config), UI é um dropdown custom -->
                                <select id="signalIntensitySelect" style="display:none">
                                    <option value="aggressive" selected>Agressivo</option>
                                    <option value="conservative">Conservador</option>
                                </select>
                                <div class="signal-intensity-select-wrapper">
                                    <button type="button" id="signalIntensitySelectUi" class="signal-intensity-select-ui" aria-haspopup="listbox" aria-expanded="false">
                                        <span id="signalIntensitySelectedLabel">Agressivo</span>
                                        <span class="signal-intensity-caret">▾</span>
                                    </button>
                                    <div id="signalIntensityDropdown" class="signal-intensity-dropdown" role="listbox" style="display:none;">
                                        <button type="button" class="signal-intensity-option" data-value="aggressive" role="option" aria-selected="true">
                                            <div class="opt-title">Agressivo</div>
                                        </button>
                                        <button type="button" class="signal-intensity-option" data-value="conservative" role="option" aria-selected="false">
                                            <div class="opt-title">Conservador</div>
                                            <div class="opt-hint" id="signalIntensityConservativeHint" style="display:none;">
                                                <div class="opt-divider"></div>
                                                <div class="opt-hint-text" id="signalIntensityConservativeHintText"></div>
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                    </div>
                </div>
                        </div>
                        </div>

                            <!-- 2) MARTINGALE -->
                            <div class="auto-bet-acc-section" data-acc-key="martingale">
                                <button type="button" class="auto-bet-acc-header" aria-expanded="false" aria-controls="autoBetAccBody-martingale">
                                    <span class="auto-bet-acc-title">Martingale</span>
                                    <span class="auto-bet-acc-caret" aria-hidden="true">▾</span>
                                </button>
                                <div class="auto-bet-acc-body" id="autoBetAccBody-martingale">
                                    <div class="auto-bet-section-title">Estratégia de Martingale</div>
                                    <div class="auto-bet-martingale-settings">
                                        <div class="auto-bet-field">
                                            <span>Quantidade de Gales (0-200)</span>
                                            <input type="number" id="cfgMaxGales" min="0" max="200" value="0" />
                                            <div class="mode-toggle-hint" style="margin-left: 0;">
                                                Quantos gales tentar no ciclo. <strong>0</strong> = sem gales.
                    </div>
                </div>

                                        <div class="auto-bet-martingale-row">
                                            <div class="auto-bet-martingale-text">
                                                <div class="auto-bet-martingale-title">Gales consecutivos</div>
                                                <div class="mode-toggle-hint" style="margin: 0;">
                                                    Quando ativado, o próximo Gale é enviado no <strong>próximo giro</strong> (mesma cor), sem esperar novo sinal.
            </div>
                    </div>
                                            <label class="mode-toggle auto-bet-toggle-compact" style="margin:0;">
                                                <input type="checkbox" id="cfgConsecutiveMartingale" />
                                                <div class="mode-toggle-content">
                                                    <span class="mode-toggle-label">Ativar</span>
                                                    <span class="mode-toggle-switch"></span>
                    </div>
                                            </label>
                </div>

                                        <div id="consecutiveGalesWrapper" class="auto-bet-martingale-dependent">
                                            <div class="auto-bet-field">
                                                <span>Consecutivo até (G)</span>
                                                <input type="number" id="cfgConsecutiveGales" min="0" max="200" value="0" />
                                                <div class="mode-toggle-hint" style="margin-left: 0;">
                                                    Ex.: <strong>1</strong> = G1 imediato • <strong>2</strong> = G1 e G2 imediatos
                        </div>
                    </div>
                </div>
                    </div>
                                </div>
                            </div>

                            <!-- 3) SIMULADOR DE BANCA -->
                            <div class="auto-bet-acc-section" data-acc-key="bank">
                                <button type="button" class="auto-bet-acc-header" aria-expanded="false" aria-controls="autoBetAccBody-bank">
                                    <span class="auto-bet-acc-title">Simulador de banca</span>
                                    <span class="auto-bet-acc-caret" aria-hidden="true">▾</span>
                                </button>
                                <div class="auto-bet-acc-body" id="autoBetAccBody-bank">
                        <div class="auto-bet-mode-layout">
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
                                </div>
                            </div>

                            <!-- 4) PROTEÇÃO NO BRANCO -->
                            <div class="auto-bet-acc-section" data-acc-key="whiteProtection">
                                <button type="button" class="auto-bet-acc-header" aria-expanded="false" aria-controls="autoBetAccBody-whiteProtection">
                                    <span class="auto-bet-acc-title">Proteção no branco</span>
                                    <span class="auto-bet-acc-caret" aria-hidden="true">▾</span>
                                </button>
                                <div class="auto-bet-acc-body" id="autoBetAccBody-whiteProtection">
                                    <label class="mode-toggle" style="margin-top: 0;">
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
                                </div>
                            </div>

                            <!-- 5) MODO INVERSO -->
                            <div class="auto-bet-acc-section" data-acc-key="inverseMode">
                                <button type="button" class="auto-bet-acc-header" aria-expanded="false" aria-controls="autoBetAccBody-inverseMode">
                                    <span class="auto-bet-acc-title">Modo inverso</span>
                                    <span class="auto-bet-acc-caret" aria-hidden="true">▾</span>
                                </button>
                                <div class="auto-bet-acc-body" id="autoBetAccBody-inverseMode">
                                    <label class="mode-toggle" style="margin-top: 0;">
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
                            </div>
                        </div>
                    </div>
                    <div class="auto-bet-modal-footer">
                        <button type="button" class="auto-bet-reset" id="autoBetResetRuntimeModal"><span class="button-label">Resetar ciclo</span></button>
                        <button type="button" class="auto-bet-save-btn" id="autoBetSaveConfig"><span class="button-label">Salvar</span></button>
                    </div>
                </div>
            </div>

        `;
        
        const userMenuToggle = sidebar.querySelector('#userMenuToggle');
        const userMenuPanel = sidebar.querySelector('#userMenuPanel');
        const daHeader = sidebar.querySelector('.da-header');
        const userMenuClose = sidebar.querySelector('#userMenuClose');
        const userMenuLogout = sidebar.querySelector('#userMenuLogout');
        const userMenuName = sidebar.querySelector('#userMenuName');
        const userMenuEmail = sidebar.querySelector('#userMenuEmail');
        const userMenuPlan = sidebar.querySelector('#userMenuPlan');
        const userMenuPurchase = sidebar.querySelector('#userMenuPurchase');
        const userMenuDays = sidebar.querySelector('#userMenuDays');
        const titleBadge = sidebar.querySelector('#titleBadge');

        let compactMenuListenersAttached = false;
        let compactMenuAnimationFrame = null;
        let compactAnchorRemovalTimeout = null;

        const scheduleCompactMenuReposition = () => {
            if (!userMenuPanel || !userMenuPanel.classList.contains('compact-anchored')) {
                return;
            }
            if (compactMenuAnimationFrame) {
                cancelAnimationFrame(compactMenuAnimationFrame);
            }
            compactMenuAnimationFrame = requestAnimationFrame(() => {
                compactMenuAnimationFrame = null;
                repositionCompactMenuPanel();
            });
        };

        const attachCompactMenuListeners = () => {
            if (compactMenuListenersAttached) return;
            window.addEventListener('resize', scheduleCompactMenuReposition);
            window.addEventListener('scroll', scheduleCompactMenuReposition, true);
            compactMenuListenersAttached = true;
        };

        const detachCompactMenuListeners = () => {
            if (!compactMenuListenersAttached) return;
            window.removeEventListener('resize', scheduleCompactMenuReposition);
            window.removeEventListener('scroll', scheduleCompactMenuReposition, true);
            compactMenuListenersAttached = false;
        };

        function repositionCompactMenuPanel() {
            if (!userMenuPanel || !userMenuPanel.classList.contains('compact-anchored')) {
                return;
            }

            const sidebarRect = sidebar.getBoundingClientRect();
            const headerHeight = (() => {
                try {
                    const headerRect = daHeader?.getBoundingClientRect();
                    if (headerRect && Number.isFinite(headerRect.height)) {
                        return headerRect.height;
                    }
                } catch (_) {}
                return 60;
            })();

            let panelWidth = Math.min(320, Math.max(260, sidebarRect.width - 20));
            if (!Number.isFinite(panelWidth) || panelWidth <= 0) {
                panelWidth = 300;
            }

            const minMargin = 16;
            let left = sidebarRect.right - panelWidth;
            if (left < minMargin) {
                left = minMargin;
            }

            const top = Math.max(minMargin, sidebarRect.top + headerHeight);
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800;
            const maxHeight = Math.max(260, viewportHeight - top - minMargin);

            userMenuPanel.style.left = `${Math.round(left)}px`;
            userMenuPanel.style.right = 'auto';
            userMenuPanel.style.top = `${Math.round(top)}px`;
            userMenuPanel.style.width = `${Math.round(panelWidth)}px`;
            userMenuPanel.style.maxHeight = `${Math.round(maxHeight)}px`;
        }

        const enableCompactMenuAnchoring = () => {
            if (!userMenuPanel) return;
            if (compactAnchorRemovalTimeout) {
                clearTimeout(compactAnchorRemovalTimeout);
                compactAnchorRemovalTimeout = null;
            }
            userMenuPanel.classList.remove('compact-closing');
            userMenuPanel.classList.add('compact-anchored');
            scheduleCompactMenuReposition();
            attachCompactMenuListeners();
        };

        const disableCompactMenuAnchoring = ({ delay = false } = {}) => {
            if (!userMenuPanel) return;

            const cleanup = () => {
                userMenuPanel.classList.remove('compact-anchored');
                userMenuPanel.classList.remove('compact-closing');
                detachCompactMenuListeners();
                if (compactMenuAnimationFrame) {
                    cancelAnimationFrame(compactMenuAnimationFrame);
                    compactMenuAnimationFrame = null;
                }
                userMenuPanel.style.left = '';
                userMenuPanel.style.right = '';
                userMenuPanel.style.top = '';
                userMenuPanel.style.width = '';
                userMenuPanel.style.maxHeight = '';
            };

            if (compactAnchorRemovalTimeout) {
                clearTimeout(compactAnchorRemovalTimeout);
                compactAnchorRemovalTimeout = null;
            }

            if (delay && userMenuPanel.classList.contains('compact-anchored')) {
                userMenuPanel.classList.add('compact-closing');
                compactAnchorRemovalTimeout = window.setTimeout(() => {
                    compactAnchorRemovalTimeout = null;
                    cleanup();
                }, 220);
                return;
            }

            cleanup();
        };

        // Format helpers (must be defined before populateUserMenu uses them)
        const formatPhone = (value) => {
            if (!value) return '';
            const numbers = value.replace(/\D/g, '');
            if (numbers.length <= 10) {
                return numbers.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
            }
            return numbers.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
        };

        const formatCPF = (value) => {
            if (!value) return '';
            const numbers = value.replace(/\D/g, '');
            return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4');
        };

        const formatCEP = (value) => {
            if (!value) return '';
            const numbers = value.replace(/\D/g, '');
            return numbers.replace(/(\d{5})(\d{0,3})/, '$1-$2');
        };

        const setUserMenuState = (open) => {
            if (!userMenuPanel || !userMenuToggle) {
                return;
            }

            if (open) {
                populateUserMenu();
                
                // ✅ GARANTIR que o badge reflita o modo de análise correto após popular o menu
                chrome.storage.local.get(['analyzerConfig'], function(result) {
                    const config = result.analyzerConfig || {};
                    const isAIMode = !!config.aiMode;
                    
                    const aiModeToggle = sidebar.querySelector('#aiModeToggle');
                    if (aiModeToggle && titleBadge) {
                        updateAIModeUI(aiModeToggle, isAIMode);
                    }
                });
                
                userMenuPanel.classList.add('open');
                userMenuToggle.classList.add('active');
                userMenuToggle.setAttribute('aria-expanded', 'true');

                if (sidebar.classList.contains('compact-mode')) {
                    enableCompactMenuAnchoring();
            } else {
                    disableCompactMenuAnchoring();
                }
            } else {
                // Fechar sem animação: remover transition temporariamente
                userMenuPanel.style.transition = 'none';
                userMenuPanel.classList.remove('open');
                userMenuToggle.classList.remove('active');
                userMenuToggle.setAttribute('aria-expanded', 'false');
                
                // Restaurar transition após um frame para futuras aberturas
                requestAnimationFrame(() => {
                    userMenuPanel.style.transition = '';
                });
                
                if (sidebar.classList.contains('compact-mode')) {
                    disableCompactMenuAnchoring();
                } else {
                    disableCompactMenuAnchoring();
                }
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
            // ✅ NÃO TOCAR NO titleBadge AQUI - ele é controlado pelo modo de análise (IA ou Premium)
            // O badge reflete o modo de análise ativo, não o status do usuário

            fillProfileInputs(user);
            syncProfileFieldState(user);
        };

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

        // Profile inputs
        const saveProfileBtn = sidebar.querySelector('#saveProfileBtn');
        const editPhoneBtn = sidebar.querySelector('#editPhoneBtn');
        const profilePhoneInput = sidebar.querySelector('#profilePhone');
        const profileCpfInput = sidebar.querySelector('#profileCpf');
        const profileZipCodeInput = sidebar.querySelector('#profileZipCode');
        const profileStreetInput = sidebar.querySelector('#profileStreet');
        const profileNumberInput = sidebar.querySelector('#profileNumber');
        const profileComplementInput = sidebar.querySelector('#profileComplement');
        const profileNeighborhoodInput = sidebar.querySelector('#profileNeighborhood');
        const profileCityInput = sidebar.querySelector('#profileCity');
        const profileStateInput = sidebar.querySelector('#profileState');
        const addressInputs = [
            profileZipCodeInput,
            profileStreetInput,
            profileNumberInput,
            profileComplementInput,
            profileNeighborhoodInput,
            profileCityInput,
            profileStateInput
        ];
        let isPhoneEditing = false;
        let lastProfileUserData = null;

        // Apply formatting on input
        if (profilePhoneInput) {
            profilePhoneInput.addEventListener('input', (e) => {
                e.target.value = formatPhone(e.target.value);
            });
        }
        if (profileCpfInput) {
            profileCpfInput.addEventListener('input', (e) => {
                e.target.value = formatCPF(e.target.value);
            });
        }
        if (profileZipCodeInput) {
            profileZipCodeInput.addEventListener('input', (e) => {
                e.target.value = formatCEP(e.target.value);
            });
        }
        if (profileStateInput) {
            profileStateInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.toUpperCase();
            });
        }

        const setInputReadOnly = (input, readOnly) => {
            if (!input) return;
            input.readOnly = !!readOnly;
            input.classList.toggle('input-readonly', !!readOnly);
        };

        const parseAddressData = (address) => {
            if (!address) return null;
            if (typeof address === 'string') {
                try {
                    return JSON.parse(address);
                } catch (_error) {
                    return null;
                }
            }
            return address;
        };

        const fillProfileInputs = (user) => {
            const addr = parseAddressData(user?.address);
            if (profilePhoneInput) {
                profilePhoneInput.value = user?.phone ? formatPhone(user.phone) : '';
            }
            if (profileCpfInput) {
                profileCpfInput.value = user?.cpf ? formatCPF(user.cpf) : '';
            }
            if (profileZipCodeInput) {
                profileZipCodeInput.value = addr?.zipCode ? formatCEP(addr.zipCode) : '';
            }
            if (profileStreetInput) {
                profileStreetInput.value = addr?.street || '';
            }
            if (profileNumberInput) {
                profileNumberInput.value = addr?.number || '';
            }
            if (profileComplementInput) {
                profileComplementInput.value = addr?.complement || '';
            }
            if (profileNeighborhoodInput) {
                profileNeighborhoodInput.value = addr?.neighborhood || '';
            }
            if (profileCityInput) {
                profileCityInput.value = addr?.city || '';
            }
            if (profileStateInput) {
                profileStateInput.value = addr?.state ? addr.state.toUpperCase() : '';
            }
        };

        const syncProfileFieldState = (user) => {
            if (user) {
                lastProfileUserData = user;
            } else if (!lastProfileUserData) {
                lastProfileUserData = getStoredUserData();
            }

            const persistedUser = lastProfileUserData || {};
            const phoneSaved = Boolean(persistedUser.phone);

            if (editPhoneBtn) {
                editPhoneBtn.style.display = phoneSaved ? 'inline-flex' : 'none';
                editPhoneBtn.textContent = isPhoneEditing ? 'Cancelar' : 'Editar';
            }
            setInputReadOnly(profilePhoneInput, phoneSaved && !isPhoneEditing);

            const cpfSaved = Boolean(persistedUser.cpf);
            setInputReadOnly(profileCpfInput, cpfSaved);

            const addressObj = parseAddressData(persistedUser.address);
            const addressSaved = Boolean(addressObj && Object.values(addressObj).some((value) => !!value));
            addressInputs.forEach((input) => setInputReadOnly(input, addressSaved));
        };

        const saveProfile = async () => {
            if (!saveProfileBtn) return;

            const phone = profilePhoneInput?.value.replace(/\D/g, '') || '';
            const cpf = profileCpfInput?.value.replace(/\D/g, '') || '';
            const address = {
                zipCode: profileZipCodeInput?.value.replace(/\D/g, '') || '',
                street: profileStreetInput?.value || '',
                number: profileNumberInput?.value || '',
                complement: profileComplementInput?.value || '',
                neighborhood: profileNeighborhoodInput?.value || '',
                city: profileCityInput?.value || '',
                state: profileStateInput?.value?.toUpperCase() || ''
            };

            saveProfileBtn.disabled = true;
            showGlobalSaveLoading();

            try {
                const token = localStorage.getItem('authToken');
                if (!token) {
                    showToast('Você precisa estar autenticado', 'error');
                    saveProfileBtn.disabled = false;
                    const overlay = document.getElementById('saveStatusOverlay');
                    if (overlay) overlay.style.display = 'none';
                    return;
                }

                const API_URL = getApiUrl();

                const response = await fetch(`${API_URL}/api/auth/profile`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ phone, cpf, address })
                });

                const data = await response.json();

                if (data.success) {
                    chrome.storage.local.get(['user'], (result) => {
                        const userData = result.user || {};
                        const updatedUser = { ...userData, ...data.user };
                        chrome.storage.local.set({ user: updatedUser });
                        try {
                            // ✅ Manter compatibilidade com pontos do código que leem o usuário do localStorage
                            localStorage.setItem('user', JSON.stringify(updatedUser));
                        } catch (error) {
                            console.warn('⚠️ Não foi possível atualizar localStorage.user após salvar perfil:', error);
                        }
                    });

                    fillProfileInputs(data.user);
                    isPhoneEditing = false;
                    syncProfileFieldState(data.user);
                    showGlobalSaveSuccess(1500);
                    showToast('Dados salvos com sucesso!', 'success');
                } else {
                    const overlay = document.getElementById('saveStatusOverlay');
                    if (overlay) overlay.style.display = 'none';
                    showToast(data.error || 'Erro ao salvar', 'error');
                }
            } catch (error) {
                console.error('Erro ao salvar dados:', error);
                const overlay = document.getElementById('saveStatusOverlay');
                if (overlay) overlay.style.display = 'none';
                showToast('Erro ao conectar com o servidor', 'error');
            } finally {
                saveProfileBtn.disabled = false;
            }
        };

        if (saveProfileBtn) {
            saveProfileBtn.addEventListener('click', saveProfile);
        }

        if (editPhoneBtn) {
            editPhoneBtn.addEventListener('click', () => {
                const hasPhoneSaved = Boolean(lastProfileUserData?.phone);
                if (!hasPhoneSaved) {
                    return;
                }
                isPhoneEditing = !isPhoneEditing;
                if (!isPhoneEditing && profilePhoneInput) {
                    profilePhoneInput.value = lastProfileUserData?.phone ? formatPhone(lastProfileUserData.phone) : '';
                }
                syncProfileFieldState();
                if (isPhoneEditing && profilePhoneInput) {
                    setTimeout(() => {
                        profilePhoneInput.focus();
                        const value = profilePhoneInput.value;
                        try {
                            profilePhoneInput.setSelectionRange(value.length, value.length);
                        } catch (_error) {
                            // ignore selection errors
                        }
                    }, 0);
                }
            });
        }

        populateUserMenu();

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

        // Branding (web app): usar cache da landing para mostrar logo + "Double" no header
        try {
            const KEY = 'lp_brand_cache_v1';
            const raw = localStorage.getItem(KEY);
            const data = raw ? JSON.parse(raw) : null;
            const brand = data && typeof data.brand === 'string' ? data.brand : 'Double';
            const logo = data && typeof data.logo === 'string' ? data.logo : '';

            const nameEl = sidebar.querySelector('#daAppName');
            const logoEl = sidebar.querySelector('#daAppLogo');
            const shortBrand = String(brand || '').trim().split(/\s+/)[0] || 'Double';
            if (nameEl) nameEl.textContent = shortBrand;

            if (logo && logoEl) {
                logoEl.src = logo;
                logoEl.style.display = 'block';
            } else if (logoEl) {
                logoEl.style.display = 'none';
            }
        } catch (_) {}
        
        // ✅ Garantir spinner imediato após reload (antes de qualquer mensagem do background)
        try {
            renderSuggestionStatus(currentAnalysisStatus || 'Aguardando análise...');
        } catch (_) {
            // noop
        }
        
        const betModeToggleBtn = document.getElementById('betModeToggleBtn');
        const betViewLabel = document.getElementById('betViewLabel');
        
        if (betModeToggleBtn) {
            betModeToggleBtn.addEventListener('click', () => {
                console.log('🔄 Alternando modo de aposta...');
                const current = getDisplayMode();
                const next = current === 'bet' ? 'default' : 'bet';
                setDisplayMode(next);
                applyDisplayMode(next);
                setUserMenuState(false);
            });
        }
        
        // ✅ NOVO: Layout fixo de Desktop (substitui compacto/tela cheia)
        // - Sidebar de configurações fixa à esquerda
        // - Cards à direita com expansão por seção
        if (isDesktop()) {
            try {
                applyDesktopDashboardLayout(sidebar);
            } catch (err) {
                console.warn('⚠️ Falha ao aplicar layout desktop (dashboard):', err);
            }
        }
        // Aplicar modo de exibição salvo (completo ou aposta)
        applyDisplayMode(getDisplayMode());
        
        initEntriesTabs();
        setEntriesTab(activeEntriesTab);
        // ✅ Controles do Sistema Híbrido (FASE 2) dentro de "Sinais de entrada"
        initEntryGateHybridControls().catch(() => {});
        // ✅ IA Viva: garantir binding inicial (overlay aparece quando IA está vazia)
        try { bindIABootstrapButton(); } catch (_) {}
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

        // ═══════════════════════════════════════════════════════════════════════
        // ✅ ACCORDION: organizar setores dentro do modal "Configurar Simulador"
        // - Clicar em um setor abre e fecha os demais (sempre 1 aberto)
        // ═══════════════════════════════════════════════════════════════════════
        const initAutoBetAccordion = () => {
            try {
                if (!autoBetModal) return;
                const accordion = autoBetModal.querySelector('#autoBetAccordion');
                if (!accordion || accordion.dataset.initialized === '1') return;
                accordion.dataset.initialized = '1';

                const sections = Array.from(accordion.querySelectorAll('.auto-bet-acc-section'));
                if (!sections.length) return;

                const setAllClosed = () => {
                    sections.forEach((section) => {
                        section.classList.remove('is-open');
                        const header = section.querySelector('.auto-bet-acc-header');
                        if (header) {
                            header.setAttribute('aria-expanded', 'false');
                        }
                    });
                };

                const setOpenSection = (targetSection) => {
                    sections.forEach((section) => {
                        const isTarget = section === targetSection;
                        section.classList.toggle('is-open', isTarget);
                        const header = section.querySelector('.auto-bet-acc-header');
                        if (header) {
                            header.setAttribute('aria-expanded', isTarget ? 'true' : 'false');
                        }
                    });
                };

                sections.forEach((section) => {
                    const header = section.querySelector('.auto-bet-acc-header');
                    if (!header) return;
                    header.addEventListener('click', (event) => {
                        event.preventDefault();
                        // ✅ Pode fechar o que já está aberto. Caso contrário, abre e fecha os demais.
                        const isOpen = section.classList.contains('is-open');
                        if (isOpen) {
                            setAllClosed();
                        } else {
                            setOpenSection(section);
                        }
                    });
                });

                // ✅ Ao abrir o modal, iniciar com tudo fechado (usuário escolhe o que abrir)
                setAllClosed();
            } catch (err) {
                console.warn('⚠️ Falha ao iniciar accordion do simulador:', err);
            }
        };

        const initConsecutiveMartingaleUI = () => {
            try {
                const toggle = document.getElementById('cfgConsecutiveMartingale');
                const wrapper = document.getElementById('consecutiveGalesWrapper');
                const input = document.getElementById('cfgConsecutiveGales');
                if (!toggle || !wrapper) return;

                const apply = () => {
                    const enabled = !!toggle.checked;
                    wrapper.style.display = enabled ? '' : 'none';
                    if (input) {
                        input.disabled = !enabled;
                    }
                };

                toggle.addEventListener('change', apply);
                apply();
            } catch (err) {
                console.warn('⚠️ Falha ao iniciar UI de gales consecutivos:', err);
            }
        };

        initAutoBetAccordion();
        initConsecutiveMartingaleUI();

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
            // ✅ Mobile deve ser fullscreen (sem cálculos de largura)
            if (!isDesktop()) {
                autoBetModalContent.style.width = '100%';
                autoBetModalContent.style.maxWidth = '100%';
                return;
            }
            const sidebarEl = document.getElementById('blaze-double-analyzer');
            const sidebarWidth = sidebarEl ? sidebarEl.getBoundingClientRect().width : window.innerWidth;
            const viewportLimit = window.innerWidth - 32;
            const target = Math.max(320, Math.min(sidebarWidth - 24, sidebarWidth, viewportLimit));
            autoBetModalContent.style.width = `${target}px`;
        };

        const closeAutoBetModal = () => {
            if (!autoBetModal) return;

            // 🖥️ Desktop (Dashboard novo): configs ficam fixas — não fechar
            try {
                const container = document.getElementById('blaze-double-analyzer');
                const isDashboardDesktop = isDesktop() && container && container.classList.contains('da-desktop-dashboard');
                if (isDashboardDesktop) {
                    autoBetModal.style.display = 'block';
                    return;
                }
            } catch (_) {}
            
            const sidebarEl = document.getElementById('blaze-double-analyzer');
            const isCompactMode = sidebarEl && sidebarEl.classList.contains('compact-mode');

            // ✅ Desregistrar do sistema de janelas flutuantes apenas no modo compacto (Desktop)
            if (isDesktop() && isCompactMode) {
                floatingWindows.unregister('autoBetModal');
            }
            
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

        const openAutoBetModal = async () => {
            if (!autoBetModal) return;

            // 🖥️ Desktop (Dashboard novo): configurações ficam fixas na coluna da esquerda
            // Então aqui apenas rola até a seção (não abre modal/flutuante).
            try {
                const container = document.getElementById('blaze-double-analyzer');
                const isDashboardDesktop = isDesktop() && container && container.classList.contains('da-desktop-dashboard');
                if (isDashboardDesktop) {
                    autoBetModal.style.display = 'block';
                    autoBetModal.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    return;
                }
            } catch (_) {}
            
            autoBetModal.style.display = 'flex';
            document.body.classList.add('auto-bet-modal-open');

            // ✅ Sempre abrir com tudo fechado (usuário escolhe o setor)
            try {
                const accordion = autoBetModal.querySelector('#autoBetAccordion');
                if (accordion) {
                    const sections = Array.from(accordion.querySelectorAll('.auto-bet-acc-section'));
                    sections.forEach((section) => {
                        section.classList.remove('is-open');
                        const header = section.querySelector('.auto-bet-acc-header');
                        if (header) header.setAttribute('aria-expanded', 'false');
                    });
                }
            } catch (_) {}
            
            const sidebarEl = document.getElementById('blaze-double-analyzer');
            const isCompactMode = sidebarEl && sidebarEl.classList.contains('compact-mode');
            const isDesktopEnv = isDesktop();

            // ✅ Desktop + modo compacto: janelas flutuantes ao lado
            if (isDesktopEnv && isCompactMode) {
                floatingWindows.register('autoBetModal');
                // Em modo compacto, largura é controlada pelo gerenciador de janelas
            } else if (!isDesktopEnv) {
                // ✅ Mobile: fullscreen (sem sobras laterais)
                if (autoBetModalContent) {
                    autoBetModalContent.style.width = '100%';
                    autoBetModalContent.style.maxWidth = '100%';
                }
            } else {
                // Desktop em tela cheia: ocupar 100% da largura do painel
                if (autoBetModalContent) {
                    autoBetModalContent.style.width = '100%';
                }
            }
            
            autoBetModalEscHandler = (event) => {
                if (event.key === 'Escape') {
                    closeAutoBetModal();
                }
            };
            document.addEventListener('keydown', autoBetModalEscHandler);
            if (!autoBetModalResizeHandler) {
                autoBetModalResizeHandler = () => {
                    if (isDesktop()) {
                        floatingWindows.repositionAll();
                        return;
                    }
                    // ✅ Mobile: mantém fullscreen
                    if (autoBetModalContent) {
                        autoBetModalContent.style.width = '100%';
                        autoBetModalContent.style.maxWidth = '100%';
                    }
                };
                window.addEventListener('resize', autoBetModalResizeHandler);
            }
        };

        if (autoBetConfigBtn) {
            autoBetConfigBtn.addEventListener('click', openAutoBetModal);
        }
        if (autoBetModalOverlay) {
            // ✅ Overlay só fecha em mobile
            autoBetModalOverlay.addEventListener('click', () => {
                if (!isDesktop()) {
                    closeAutoBetModal();
                }
            });
        }
        if (closeAutoBetModalBtn) {
            closeAutoBetModalBtn.addEventListener('click', closeAutoBetModal);
        }
        if (autoBetSaveConfigBtn) {
            autoBetSaveConfigBtn.addEventListener('click', async () => {
                triggerButtonFeedback(autoBetSaveConfigBtn);
                setButtonBusyState(autoBetSaveConfigBtn, true, 'Salvando...');
                try {
                    // Salvar configurações, mantendo o modal aberto
                    await saveSettings();
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
                    // ✅ Pedido: "Resetar ciclo" também deve resetar o Painel (saldo/lucro/perdas),
                    // mas NÃO deve limpar o histórico da IA (sinais).
                    try {
                        if (autoBetHistoryStore && typeof autoBetHistoryStore.clear === 'function') {
                            autoBetHistoryStore.clear();
                        }
                    } catch (_) {}
                    if (autoBetManager && typeof autoBetManager.resetRuntime === 'function') {
                        autoBetManager.resetRuntime();
                    }
                } finally {
                    setTimeout(() => setButtonBusyState(autoBetResetRuntimeModalBtn, false), 450);
                }
            });
        }
        // 🎯 Modais do sistema
        createDiamondLevelsModal();
        
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
        
        // ✅ Botão de ativar/desativar análise
        const toggleAnalyzerBtn = document.getElementById('toggleAnalyzerBtn');
        if (toggleAnalyzerBtn) {
            toggleAnalyzerBtn.addEventListener('click', handleAnalyzerToggle);
        }
        // ✅ Toggle de sincronização (configs)
        try {
            bindSyncConfigToggleUI();
            initializeSyncConfigToggleState();
        } catch (_) {}
        initAutoBetSummaryVisibilityControls();
        initializeAnalyzerToggleState();
        
        // ✅ Toggle de modo IA
        const aiModeToggle = document.getElementById('aiModeToggle');
        if (aiModeToggle) {
            // Carregar estado inicial (modo IA é global/sincronizado por conta)
            chrome.storage.local.get(['analyzerConfig', 'user'], async function(result) {
                const config = result.analyzerConfig || {};
                const user = result.user || getStoredUserData();
                let isAIMode = !!config.aiMode;

                // 🔒 REGRA: só permitir IA se cadastro estiver completo (Minha Conta)
                const profileStatus = getProfileCompletionSnapshot(user);
                if (isAIMode && !profileStatus.complete) {
                    console.warn('🔒 Bloqueando Modo IA: cadastro incompleto.', profileStatus.missing);
                    isAIMode = false;
                    config.aiMode = false;
                    chrome.storage.local.set({ analyzerConfig: config });
                    try {
                        const shouldSync = getSyncConfigPreference();
                        if (shouldSync) {
                            syncConfigToServer(config).catch(err => console.warn('⚠️ Falha ao sincronizar desativação do IA (cadastro incompleto):', err));
                        }
                    } catch (_) {}
                    showToast('⚠️ Cadasto incompleto — Nível Diamante desativado.', 2600);
                }
                
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
                chrome.storage.local.get(['analyzerConfig', 'user'], function(result) {
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
                    const user = result.user || getStoredUserData();
                    
                    const newAIMode = !config.aiMode;

                    // 🔒 REGRA: só permitir ativar IA se cadastro estiver completo (Minha Conta)
                    if (newAIMode) {
                        const profileStatus = getProfileCompletionSnapshot(user);
                        if (!profileStatus.complete) {
                            showCenteredNotice(buildProfileIncompleteMessage(profileStatus.missing), {
                                title: 'Cadastro incompleto',
                                autoHide: 0
                            });
                            try {
                                // Abrir Minha Conta para o usuário completar o cadastro
                                if (typeof setUserMenuState === 'function') {
                                    setUserMenuState(true);
                                } else {
                                    const userMenuToggle = document.getElementById('userMenuToggle');
                                    if (userMenuToggle) userMenuToggle.click();
                                }
                                // Focar no primeiro campo pendente (se existir no DOM)
                                const fieldMap = {
                                    'Telefone': 'profilePhone',
                                    'CPF': 'profileCpf',
                                    'CEP': 'profileZipCode',
                                    'Rua': 'profileStreet',
                                    'Número': 'profileNumber',
                                    'Bairro': 'profileNeighborhood',
                                    'Cidade': 'profileCity',
                                    'Estado': 'profileState'
                                };
                                const firstMissing = profileStatus.missing[0];
                                const targetId = firstMissing ? fieldMap[firstMissing] : null;
                                const el = targetId ? document.getElementById(targetId) : null;
                                if (el && typeof el.focus === 'function') {
                                    setTimeout(() => el.focus(), 0);
                                }
                            } catch (error) {
                                console.warn('⚠️ Falha ao abrir Minha Conta após bloqueio do IA:', error);
                            }
                            return;
                        }
                    }
                    
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
        
        // ✅ Desktop: sem drag/resize (novo layout fixo). Mobile mantém comportamento atual.
        if (!isDesktop()) {
            makeDraggable(sidebar);
            makeResizable(sidebar);
        }
        
        return sidebar;
    }
    
    // === NOVO: Função para renderizar histórico de giros coloridos (tipo Blaze) ===
    // Ícone oficial da Blaze usado no "branco" (0). Fonte: logo-icon.svg da própria Blaze (copiado, sem recriar).
    function blazeWhiteSVG(size = 20) {
        return `<svg width="${size}" height="${size}" viewBox="0 0 25 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
<path fill-rule="evenodd" clip-rule="evenodd" d="M20.3383 21.9877L14.1521 28.1739C13.4995 28.8264 12.6149 29.1068 11.7634 29.0143C11.1232 28.9447 10.5011 28.6647 10.0103 28.1739L3.82407 21.9877C3.25263 21.4162 2.9667 20.6668 2.96631 19.9178C2.96591 19.168 3.25184 18.4182 3.82407 17.8459L10.0103 11.6597C10.6455 11.0246 11.4993 10.7422 12.3294 10.8122C12.9941 10.8683 13.6435 11.1507 14.1521 11.6597L20.3383 17.8459C20.9098 18.4174 21.1957 19.1664 21.1961 19.9154C21.1965 20.6656 20.9106 21.4154 20.3383 21.9877ZM23.7636 17.7513L23.7692 17.7489L23.7387 17.6666C23.7158 17.6065 23.6968 17.5464 23.6719 17.4871L19.9201 7.3873L17.662 10.6222L12.0835 0C12.0835 0 3.28798 13.0824 1.05677 16.4182L1.06151 16.4186C-0.577694 18.8677 -0.319455 22.2101 1.84335 24.3729L7.62506 30.1543C10.086 32.6152 14.0763 32.6152 16.5369 30.1543L22.3186 24.3729C24.11 22.5811 24.581 19.9837 23.7636 17.7513Z" fill="#F12C4C"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M12.0808 13.9292C11.0759 13.9292 10.2612 14.7439 10.2612 15.7487C10.2612 16.7536 11.0759 17.5683 12.0808 17.5683C13.0856 17.5683 13.9003 16.7536 13.9003 15.7487C13.9003 14.7439 13.0856 13.9292 12.0808 13.9292Z" fill="#F12C4C"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M12.0808 22.2656C11.0759 22.2656 10.2612 23.0803 10.2612 24.0852C10.2612 25.09 11.0759 25.9047 12.0808 25.9047C13.0856 25.9047 13.9003 25.09 13.9003 24.0852C13.9003 23.0803 13.0856 22.2656 12.0808 22.2656Z" fill="#F12C4C"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M16.2492 18.0972C15.2443 18.0972 14.4297 18.9118 14.4297 19.9167C14.4297 20.9216 15.2443 21.7362 16.2492 21.7362C17.2541 21.7362 18.0688 20.9216 18.0688 19.9167C18.0688 18.9118 17.2541 18.0972 16.2492 18.0972Z" fill="#F12C4C"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M6.09277 19.9167C6.09277 20.9216 6.90743 21.7362 7.91271 21.7362C8.91759 21.7362 9.73224 20.9216 9.73224 19.9167C9.73224 18.9118 8.91759 18.0972 7.91271 18.0972C6.90743 18.0972 6.09277 18.9118 6.09277 19.9167Z" fill="#F12C4C"/>
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
    function closeEntryPatternModalIfOpen() {
        const existing = document.getElementById('daEntryPatternModal');
        if (!existing) return;
        try {
            if (typeof existing.__daCleanup === 'function') existing.__daCleanup();
            else existing.remove();
        } catch (_) {
            try { existing.remove(); } catch (_) {}
        }
    }

    function showPatternForEntry(entry) {
        // ✅ Modal único: sempre fechar o anterior antes de abrir outro
        closeEntryPatternModalIfOpen();

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
            modal.id = 'daEntryPatternModal';
            modal.className = 'pattern-modal';
            modal.innerHTML = `
                <div class="pattern-modal-content">
                    <div class="pattern-modal-header modal-header-minimal">
                        <h3>Padrão da Entrada</h3>
                        <button class="pattern-modal-close" type="button">Fechar</button>
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
            
            // ✅ Sempre anexar na camada mais alta disponível:
            // - Se existir um .custom-pattern-modal aberto (ex.: Simulação/Configurar níveis), anexar nele
            //   para não ficar "por baixo" (stacking context do #blaze-double-analyzer).
            // - Caso contrário, anexar na sidebar.
            const openCustomModals = Array.from(document.querySelectorAll('.custom-pattern-modal'))
                .filter(el => el && getComputedStyle(el).display !== 'none');
            const topCustomModal = openCustomModals.length > 0 ? openCustomModals[openCustomModals.length - 1] : null;
            // ✅ Importante: anexar no CONTENT do modal (caixa), não no wrapper tela-cheia.
            // Assim, em modo compacto o padrão não vira tela cheia e o clique em "Fechar" não fecha o modal pai.
            const topLayerContainer =
                (topCustomModal && topCustomModal.querySelector('.custom-pattern-modal-content'))
                    ? topCustomModal.querySelector('.custom-pattern-modal-content')
                    : (() => {
                        const root = (document.getElementById('blaze-double-analyzer') || document.body);
                        // 🖥️ Desktop (Dashboard novo): anexar no workspace (lado direito) para manter sidebar fixa
                        try {
                            if (isDesktop() && root && root.classList && root.classList.contains('da-desktop-dashboard')) {
                                return root.querySelector('.da-desktop-main') || root;
                            }
                        } catch (_) {}
                        return root;
                    })();

            if (topLayerContainer !== document.body && getComputedStyle(topLayerContainer).position === 'static') {
                topLayerContainer.style.position = 'relative';
                }
            topLayerContainer.appendChild(modal);
            
            // Eventos do modal
            const closeBtn = modal.querySelector('.pattern-modal-close');
            const contentEl = modal.querySelector('.pattern-modal-content');
            const removeModal = function() {
                if (modal.parentElement) {
                    modal.parentElement.removeChild(modal);
                }
                document.removeEventListener('keydown', handleEsc);
            };
            // Permitir remoção segura por outros cliques
            modal.__daCleanup = removeModal;
            
            // ✅ Evitar "click-through": NÃO usar capture no container inteiro (isso pode quebrar cliques internos).
            // Em vez disso, paramos o bubble para não atingir o modal de simulação por trás.
            const stopBubble = (e) => {
                try { e.stopPropagation(); } catch (_) {}
            };
            if (contentEl) {
                contentEl.addEventListener('pointerdown', stopBubble);
                contentEl.addEventListener('click', stopBubble);
            }
            modal.addEventListener('pointerdown', stopBubble);
            modal.addEventListener('click', (e) => {
                stopBubble(e);
                if (e.target === modal) {
                    // clique no backdrop -> fecha só o padrão
                    removeModal();
                }
            });

            // Fechar ao clicar no botão (fecha só este modal)
            if (closeBtn) {
                closeBtn.addEventListener('pointerdown', stopBubble);
                closeBtn.addEventListener('click', (e) => {
                    stopBubble(e);
                    e.preventDefault();
                    removeModal();
                });
            }
            
            // Fechar com ESC
            const handleEsc = function(e) {
                if (e.key === 'Escape') {
                    try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
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
        // ✅ Modal único: sempre fechar o anterior antes de abrir outro
        closeEntryPatternModalIfOpen();

        const modal = document.createElement('div');
        modal.id = 'daEntryPatternModal';
        modal.className = 'pattern-modal';
        modal.innerHTML = `
            <div class="pattern-modal-content">
                <div class="pattern-modal-header modal-header-minimal">
                    <h3>Padrão Não Disponível</h3>
                    <button class="pattern-modal-close" type="button">Fechar</button>
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
        
        // ✅ Mesmo comportamento do modal principal: anexar na camada mais alta disponível
        const openCustomModals = Array.from(document.querySelectorAll('.custom-pattern-modal'))
            .filter(el => el && getComputedStyle(el).display !== 'none');
        const topCustomModal = openCustomModals.length > 0 ? openCustomModals[openCustomModals.length - 1] : null;
        const topLayerContainer =
            (topCustomModal && topCustomModal.querySelector('.custom-pattern-modal-content'))
                ? topCustomModal.querySelector('.custom-pattern-modal-content')
                : (() => {
                    const root = (document.getElementById('blaze-double-analyzer') || document.body);
                    // 🖥️ Desktop (Dashboard novo): anexar no workspace (lado direito)
                    try {
                        if (isDesktop() && root && root.classList && root.classList.contains('da-desktop-dashboard')) {
                            return root.querySelector('.da-desktop-main') || root;
                        }
                    } catch (_) {}
                    return root;
                })();

        if (topLayerContainer !== document.body && getComputedStyle(topLayerContainer).position === 'static') {
            topLayerContainer.style.position = 'relative';
        }
        topLayerContainer.appendChild(modal);
        
        // Eventos do modal
        const closeBtn = modal.querySelector('.pattern-modal-close');
        const contentEl = modal.querySelector('.pattern-modal-content');
        const removeModal = function() {
            try {
                if (modal.parentElement) modal.parentElement.removeChild(modal);
            } catch (_) {}
            document.removeEventListener('keydown', handleEsc);
        };
        modal.__daCleanup = removeModal;

        const stopBubble = (e) => {
            try { e.stopPropagation(); } catch (_) {}
        };
        if (contentEl) {
            contentEl.addEventListener('pointerdown', stopBubble);
            contentEl.addEventListener('click', stopBubble);
        }
        modal.addEventListener('pointerdown', stopBubble);
        modal.addEventListener('click', (e) => {
            stopBubble(e);
            if (e.target === modal) removeModal();
        });

        if (closeBtn) {
            closeBtn.addEventListener('pointerdown', stopBubble);
            closeBtn.addEventListener('click', (e) => {
                stopBubble(e);
                e.preventDefault();
                removeModal();
            });
        }
        
        // Fechar com ESC
        const handleEsc = function(e) {
            if (e.key === 'Escape') {
                removeModal();
            }
        };
        document.addEventListener('keydown', handleEsc);
    }
    
    // Função auxiliar para renderizar análise IA COM círculos coloridos
    function renderAIAnalysisWithSpins(aiData, last5Spins, options = {}) {
        console.log('%c🎨 RENDERIZANDO IA COM CÍRCULOS!', 'color: #00FF00; font-weight: bold; font-size: 14px;');
        const showSpins = !((options && typeof options === 'object') && options.showSpins === false);

        const parseDiamondReasoning = (raw = '') => {
            const meta = { mode: null, score: null, decision: null, confidence: null };
            const levels = [];
            const lines = String(raw || '')
                .split('\n')
                .map(l => String(l || '').trim())
                .filter(Boolean);

            const normalizeColor = (token = '') => {
                const t = String(token || '').trim().toLowerCase();
                if (t === 'red' || t === 'vermelho') return 'red';
                if (t === 'black' || t === 'preto') return 'black';
                if (t === 'white' || t === 'branco') return 'white';
                return null;
            };

            const colorLabel = (color) => {
                if (color === 'red') return 'Vermelho';
                if (color === 'black') return 'Preto';
                if (color === 'white') return 'Branco';
                return '—';
            };

            const detectVoteColor = (text) => {
                const m = String(text || '').match(/\b(RED|BLACK|WHITE)\b/i);
                if (!m) return null;
                return normalizeColor(m[1]);
            };

            const stripLeadingSymbols = (text) => {
                // Remove emojis/símbolos no início (compatibilidade com registros antigos)
                // Ex.: "🎯 DECISÃO: RED" -> "DECISÃO: RED"
                // Ex.: "📊 Confiança: 78%" -> "Confiança: 78%"
                return String(text || '').replace(/^[^A-Za-zÀ-ÿ0-9]+/g, '').trim();
            };

            lines.forEach((line) => {
                const cleanLine = stripLeadingSymbols(line);
                // Meta
                const modeMatch = cleanLine.match(/^\s*Modo:\s*(.+)\s*$/i);
                if (modeMatch) {
                    meta.mode = modeMatch[1].trim();
                    return;
                }
                const scoreMatch = cleanLine.match(/^\s*Score combinado:\s*([0-9]+(?:\.[0-9]+)?)\s*%\s*$/i);
                if (scoreMatch) {
                    meta.score = Number(scoreMatch[1]);
                    return;
                }
                const decisionMatch = cleanLine.match(/^\s*DECIS(Ã|A)O:\s*([A-Za-z]+)\s*$/i);
                if (decisionMatch) {
                    meta.decision = normalizeColor(decisionMatch[2]);
                    return;
                }
                const confMatch = cleanLine.match(/^\s*Confian(ç|c)a:\s*([0-9]+(?:\.[0-9]+)?)\s*%\s*$/i);
                if (confMatch) {
                    meta.confidence = Number(confMatch[2]);
                    return;
                }

                // Level lines
                const idxN = cleanLine.indexOf('N');
                const candidate = idxN >= 0 ? cleanLine.slice(idxN) : cleanLine;
                const m = candidate.match(/\bN(10|[0-9])\b\s*-\s*([^→]+?)\s*→\s*(.+)\s*$/i);
                if (!m) return;

                const id = `N${m[1]}`;
                const name = m[2].trim();
                const statusRaw = m[3].trim();
                const statusClean = stripLeadingSymbols(statusRaw);

                // Filtrar níveis desativados para reduzir poluição (pedido do usuário)
                if (/DESATIVADO/i.test(statusClean)) return;

                let main = statusClean;
                let detail = '';
                const paren = statusClean.match(/^(.+?)\s*\((.*)\)\s*$/);
                if (paren) {
                    main = paren[1].trim();
                    detail = paren[2].trim();
                } else if (statusClean.includes(' • ')) {
                    const parts = statusClean.split(' • ').map(p => p.trim()).filter(Boolean);
                    main = parts[0] || statusRaw;
                    detail = parts.slice(1).join(' • ');
                }

                const pctMatch = statusClean.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
                const pct = pctMatch ? Number(pctMatch[1]) : null;
                const voteColor = detectVoteColor(main) || detectVoteColor(statusClean);
                const badgeText = (() => {
                    if (voteColor) return `Voto: ${colorLabel(voteColor)}`;
                    if (/NULO/i.test(main)) return 'Nulo';
                    if (/BLOQUEADO/i.test(main)) return 'Bloqueado';
                    if (/APROVADO/i.test(main)) return 'Aprovado';
                    return main;
                })();

                levels.push({
                    id,
                    name,
                    voteColor,
                    pct,
                    badgeText,
                    detail
                });
            });

            const order = { N0: 0, N1: 1, N2: 2, N3: 3, N4: 4, N5: 5, N6: 6, N7: 7, N8: 8, N9: 9, N10: 10 };
            levels.sort((a, b) => (order[a.id] ?? 99) - (order[b.id] ?? 99));

            return { meta, levels };
        };

        const renderDiamondReasoningBlocks = (rawReasoning = '') => {
            const { meta, levels } = parseDiamondReasoning(rawReasoning);

            const fmtPct = (value) => (typeof value === 'number' && Number.isFinite(value)) ? `${value.toFixed(1)}%` : '—';
            const colorLabel = (color) => (color === 'red' ? 'Vermelho' : color === 'black' ? 'Preto' : color === 'white' ? 'Branco' : '—');

            const decisionText = meta.decision ? colorLabel(meta.decision) : (aiData && aiData.color ? colorLabel(aiData.color) : '—');
            const modeText = meta.mode ? meta.mode : '—';
            const scoreText = (typeof meta.score === 'number' && Number.isFinite(meta.score)) ? `${meta.score.toFixed(1)}%` : '—';
            const confFallback = (aiData && typeof aiData.confidence === 'number' && Number.isFinite(aiData.confidence)) ? aiData.confidence : null;
            const confValue = (typeof meta.confidence === 'number' && Number.isFinite(meta.confidence)) ? meta.confidence : confFallback;
            const confText = (typeof confValue === 'number' && Number.isFinite(confValue)) ? `${confValue.toFixed(0)}%` : '—';

            const summary = `
                <div class="diamond-reasoning-summary">
                    <div class="diamond-summary-card">
                        <div class="diamond-summary-label">Modo</div>
                        <div class="diamond-summary-value">${escapeHtml(modeText)}</div>
                    </div>
                    <div class="diamond-summary-card">
                        <div class="diamond-summary-label">Score</div>
                        <div class="diamond-summary-value">${escapeHtml(scoreText)}</div>
                    </div>
                    <div class="diamond-summary-card">
                        <div class="diamond-summary-label">Decisão</div>
                        <div class="diamond-summary-value">${escapeHtml(decisionText)}</div>
                    </div>
                    <div class="diamond-summary-card">
                        <div class="diamond-summary-label">Confiança</div>
                        <div class="diamond-summary-value">${escapeHtml(confText)}</div>
                    </div>
                </div>
            `;

            const cards = levels.map((lvl) => {
                const badgeClass = lvl.voteColor ? `badge-${lvl.voteColor}` : 'badge-neutral';
                const pctText = fmtPct(lvl.pct);
                const pctHtml = lvl.pct != null ? `<div class="diamond-level-pct">${escapeHtml(pctText)}</div>` : '';
                const detailHtml = lvl.detail ? `<div class="diamond-level-detail">${escapeHtml(lvl.detail)}</div>` : '';
                return `
                    <div class="diamond-level-card">
                        <div class="diamond-level-top">
                            <div class="diamond-level-id">${escapeHtml(lvl.id)}</div>
                            <div class="diamond-level-name">${escapeHtml(lvl.name)}</div>
                            <div class="diamond-level-badge ${badgeClass}">${escapeHtml(lvl.badgeText)}</div>
                        </div>
                        ${pctHtml}
                        ${detailHtml}
                    </div>
                `;
            }).join('');

            return `
                <div class="diamond-reasoning">
                    ${summary}
                    <div class="diamond-levels-grid">
                        ${cards || `<div class="diamond-reasoning-empty">Nenhum nível ativo gerou detalhes para este sinal.</div>`}
                    </div>
                </div>
            `;
        };

        const spinsCount = Array.isArray(last5Spins) ? last5Spins.length : 0;
        const spinsHTML = (Array.isArray(last5Spins) ? last5Spins : []).map((spin, index) => {
            const isWhite = spin.color === 'white';
            const colorName = spin.color === 'red' ? 'Vermelho' : spin.color === 'black' ? 'Preto' : 'Branco';
            return `<div class="spin-history-item-wrap" title="${colorName}: ${spin.number}">
                <div class="spin-history-quadrado ${spin.color}">
                    ${isWhite ? blazeWhiteSVG(24) : `<span>${spin.number}</span>`}
                </div>
                <div class="spin-history-time">${index === 0 ? 'Recente' : `${index + 1}º`}</div>
            </div>`;
        }).join('');

        const safeColorClass = (aiData.color === 'red' || aiData.color === 'black' || aiData.color === 'white') ? aiData.color : '';
        const entryColorText = aiData.color === 'red'
            ? 'VERMELHA'
            : aiData.color === 'black'
                ? 'PRETA'
                : aiData.color === 'white'
                    ? 'BRANCA'
                    : '—';

        const spinsSection = (showSpins && spinsCount > 0) ? `
            <div class="ai-entry-section">
                <div class="ai-entry-section-title">Últimos ${spinsCount} giros</div>
                <div class="ai-entry-spins">${spinsHTML}</div>
            </div>
        ` : '';

        return `
            <div class="ai-entry-analysis">
                <div class="ai-entry-head">
                    <div class="ai-entry-action">
                        Entrar na cor <span class="ai-entry-action-color ${safeColorClass}">${escapeHtml(entryColorText)}</span>
                    </div>
                    <div class="ai-entry-confidence">
                        Confiança <span class="ai-entry-confidence-value">${escapeHtml(Number(aiData.confidence || 0).toFixed(1))}%</span>
                    </div>
                </div>

                ${spinsSection}

                <div class="ai-entry-section">
                    <div class="ai-entry-section-title">Raciocínio</div>
                    ${renderDiamondReasoningBlocks(aiData.reasoning || '')}
                </div>
            </div>
        `;
    }
    
    // Função auxiliar para renderizar análise IA SEM círculos (formato antigo)
    function renderAIAnalysisOldFormat(aiData) {
        // Fallback: sem lista de giros, mas ainda renderiza o raciocínio em blocos (mesmo layout)
        const dummySpins = [];
        return renderAIAnalysisWithSpins(
            {
                ...aiData,
                confidence: typeof aiData.confidence === 'number' ? aiData.confidence : 0,
                reasoning: aiData.text || aiData.reasoning || ''
            },
            dummySpins
        );
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
            const hideInlineSpins = !!(patternData && patternData.__daPatternCard);
            
            if (last5Spins.length > 0) {
                // Renderizar com círculos coloridos
                return renderAIAnalysisWithSpins(parsed, last5Spins, { showSpins: !hideInlineSpins });
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
                const hideInlineSpins = !!(patternData && patternData.__daPatternCard);
                
                // Se for formato novo (estruturado com last5Spins)
                if (aiData.last5Spins && aiData.last5Spins.length > 0) {
                    return renderAIAnalysisWithSpins(aiData, aiData.last5Spins, { showSpins: !hideInlineSpins });
                } else {
                    return renderAIAnalysisOldFormat(aiData);
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

    function isHistoryCardExpanded() {
        try {
            const root = document.getElementById('blaze-double-analyzer');
            if (!root || !root.classList.contains('da-desktop-dashboard')) return false;
            const card = document.querySelector('#analyzerDefaultView .stats-section');
            return !!(card && card.classList.contains('da-card-is-expanded'));
        } catch (_) {
            return false;
        }
    }

    function getHistoryDisplayLimit() {
        return isHistoryCardExpanded() ? currentHistoryDisplayLimitExpanded : currentHistoryDisplayLimit;
    }

    function bumpHistoryDisplayLimitBy(delta) {
        const inc = Math.max(0, Math.floor(Number(delta) || 0));
        if (!inc) return;
        if (isHistoryCardExpanded()) {
            currentHistoryDisplayLimitExpanded += inc;
        } else {
            currentHistoryDisplayLimit += inc;
        }
    }

    function bindHistoryLoadMoreIndicator() {
        try {
            const el = document.getElementById('historyLoadMoreIndicator');
            if (!el) return;
            const handler = () => {
                try {
                    const base = Array.isArray(currentHistoryData) ? currentHistoryData.length : 0;
                    const limitNow = getHistoryDisplayLimit();
                    const remaining = base - limitNow;
                    const increment = 500;
                    const addAmount = remaining > increment ? increment : Math.max(0, remaining);
                    if (addAmount <= 0) return;
                    bumpHistoryDisplayLimitBy(addAmount);
                    console.log(`📊 Carregando mais ${addAmount} giros. Total exibido agora: ${getHistoryDisplayLimit()}`);
                    const container = document.getElementById('spin-history-bar-ext');
                    if (container) {
                        container.innerHTML = renderSpinHistory(currentHistoryData);
                        bindHistoryLoadMoreIndicator();
                    }
                } catch (_) {}
            };
            el.onclick = handler;
            el.onkeydown = (e) => {
                const k = e && e.key ? String(e.key) : '';
                if (k === 'Enter' || k === ' ') {
                    try { e.preventDefault(); } catch (_) {}
                    handler();
                }
            };
        } catch (_) {}
    }

    function ensureHistoryFullscreenFillsSpace() {
        try {
            if (!isDesktop() || !isHistoryCardExpanded()) return;
            const container = document.getElementById('spin-history-bar-ext');
            const bar = container ? container.querySelector('.spin-history-bar-blaze') : null;
            if (!bar) return;

            // Se o usuário já rolou, não forçar re-render (evita "pular" posição)
            try { if (bar.scrollTop > 10) return; } catch (_) {}

            const rect = bar.getBoundingClientRect();
            if (!rect || rect.width <= 0 || rect.height <= 0) return;

            const item = bar.querySelector('.spin-history-item-wrap');
            const itemRect = item ? item.getBoundingClientRect() : null;
            const itemW = itemRect && itemRect.width > 0 ? itemRect.width : 40;
            const itemH = itemRect && itemRect.height > 0 ? itemRect.height : 52;
            const cols = Math.max(1, Math.floor(rect.width / itemW));
            const rows = Math.max(1, Math.floor(rect.height / itemH));
            const needed = cols * (rows + 2); // +2 linhas de buffer
            const chunk = 500;
            const requiredChunk = Math.max(chunk, Math.ceil(needed / chunk) * chunk);
            const total = Array.isArray(currentHistoryData) ? currentHistoryData.length : 0;
            const target = Math.min(total || 0, Math.max(currentHistoryDisplayLimitExpanded, requiredChunk));
            if (target > currentHistoryDisplayLimitExpanded) {
                currentHistoryDisplayLimitExpanded = target;
                container.innerHTML = renderSpinHistory(currentHistoryData);
                bindHistoryLoadMoreIndicator();
            }
        } catch (_) {}
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
        const displayLimit = getHistoryDisplayLimit(); // Normal vs fullscreen
        const displayingCount = Math.min(totalSpins, displayLimit);
        const hasMore = totalSpins > displayLimit;
        const remainingSpins = totalSpins - displayLimit;

        let isDashboardDesktop = false;
        try {
            const root = document.getElementById('blaze-double-analyzer');
            isDashboardDesktop = !!(isDesktop() && root && root.classList.contains('da-desktop-dashboard'));
        } catch (_) {}
        
        return `
        <div class="spin-history-label">
            <span>ÚLTIMOS GIROS</span>
            <div class="spin-count-info">
                <span class="displaying-count">Exibindo ${hasMore
                    ? `<span class="displaying-num" id="historyLoadMoreIndicator" role="button" tabindex="0" title="Carregar +500">${displayingCount}</span>`
                    : `<span class="displaying-num">${displayingCount}</span>`
                }</span>
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
        `;
    }

    // ═══════════════════════════════════════════════════════════════
    // ✅ PADRÃO (CARD): sempre visível + sempre mostrar últimos 10 giros
    // Pedido do usuário:
    // - O container "Padrão" NÃO pode sumir quando não tem sinal/padrão.
    // - Após receber resultado, não pode ficar "limpo".
    // - Deve sempre exibir os últimos 10 giros (independente da aba ativa).
    // ═══════════════════════════════════════════════════════════════

    const PATTERN_LAST_SPINS_LIMIT = 14;

    function getPatternLastSpinsSnapshot(limit = PATTERN_LAST_SPINS_LIMIT) {
        try {
            const n = Math.max(0, Number(limit) || 0);
            const arr = Array.isArray(currentHistoryData) ? currentHistoryData : [];
            return arr.slice(0, n);
        } catch (_) {
            return [];
        }
    }

    function renderPatternLastSpinsItems(spins = []) {
        const list = Array.isArray(spins) ? spins : [];
        if (!list.length) {
            return `<div class="no-history" style="padding:8px 4px;">Aguardando giros...</div>`;
        }
        return list.map((spin, index) => {
            const color = (spin && typeof spin.color === 'string') ? spin.color.toLowerCase() : '';
            const safeColor = (color === 'red' || color === 'black' || color === 'white') ? color : 'red';
            const isWhite = safeColor === 'white';
            const number = (spin && spin.number != null) ? spin.number : '';
            const time = (() => {
                try {
                    const t = (spin && spin.timestamp != null) ? spin.timestamp : null;
                    return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                } catch (_) {
                    return '';
                }
            })();
            const label = index === 0 ? 'Recente' : `${index + 1}º`;
            const title = `${safeColor === 'red' ? 'Vermelho' : safeColor === 'black' ? 'Preto' : 'Branco'}: ${number}${time ? ' - ' + time : ''}`;
            return `<div class="spin-history-item-wrap" title="${escapeHtml(title)}">
                <div class="spin-history-quadrado ${safeColor}">
                    ${isWhite ? blazeWhiteSVG(20) : `<span>${escapeHtml(String(number))}</span>`}
                </div>
                <div class="spin-history-time">${escapeHtml(label)}</div>
            </div>`;
        }).join('');
    }

    function ensurePatternInfoLayout(patternInfoEl, limit = PATTERN_LAST_SPINS_LIMIT) {
        if (!patternInfoEl) return { mainEl: null, rowEl: null };
        const safeLimit = Math.max(1, Number(limit) || 10);

        // Block: últimos giros
        let spinsBlock = patternInfoEl.querySelector('#patternLastSpinsBlock');
        if (!spinsBlock) {
            spinsBlock = document.createElement('div');
            spinsBlock.id = 'patternLastSpinsBlock';
            spinsBlock.className = 'pattern-last-spins';
            spinsBlock.innerHTML = `
                <div class="ai-entry-section ai-entry-section--pattern-spins">
                    <div class="ai-entry-section-title">Últimos ${safeLimit} giros</div>
                    <div class="ai-entry-spins" id="patternLastSpinsRow"></div>
                </div>
            `;
            patternInfoEl.insertBefore(spinsBlock, patternInfoEl.firstChild);
        } else {
            const titleEl = spinsBlock.querySelector('.ai-entry-section-title');
            if (titleEl) titleEl.textContent = `Últimos ${safeLimit} giros`;
            // Garantir que fique no TOPO
            try {
                if (patternInfoEl.firstChild !== spinsBlock) {
                    patternInfoEl.insertBefore(spinsBlock, patternInfoEl.firstChild);
                }
            } catch (_) {}
        }

        let rowEl = spinsBlock.querySelector('#patternLastSpinsRow');
        if (!rowEl) {
            rowEl = document.createElement('div');
            rowEl.id = 'patternLastSpinsRow';
            rowEl.className = 'ai-entry-spins';
            spinsBlock.appendChild(rowEl);
        }

        // Wrapper: conteúdo principal do padrão (para não “sumir”)
        let mainEl = patternInfoEl.querySelector('#patternMainContent');
        if (!mainEl) {
            mainEl = document.createElement('div');
            mainEl.id = 'patternMainContent';
            mainEl.className = 'pattern-main';

            // Mover tudo que já existe (exceto o bloco de últimos giros) para dentro do wrapper
            const nodes = Array.from(patternInfoEl.childNodes).filter(node => node !== spinsBlock);
            nodes.forEach(node => {
                try { mainEl.appendChild(node); } catch (_) {}
            });

            // ✅ Padrão: "Últimos giros" no topo, conteúdo abaixo
            patternInfoEl.appendChild(mainEl);
        } else {
            // Garantir ordem (bloco de giros no topo)
            try {
                if (spinsBlock && patternInfoEl.firstChild !== spinsBlock) {
                    patternInfoEl.insertBefore(spinsBlock, patternInfoEl.firstChild);
                }
                if (spinsBlock && mainEl.previousSibling !== spinsBlock) {
                    // colocar conteúdo logo após o bloco
                    patternInfoEl.insertBefore(mainEl, spinsBlock.nextSibling);
                }
            } catch (_) {}
        }

        return { mainEl, rowEl };
    }

    function setPatternMainContent(patternInfoEl, html, { expanded = false } = {}) {
        try {
            const { mainEl } = ensurePatternInfoLayout(patternInfoEl, PATTERN_LAST_SPINS_LIMIT);
            if (!mainEl) return;
            const nextHtml = (typeof html === 'string') ? html : '';
            mainEl.innerHTML = nextHtml;
            try {
                patternInfoEl.classList.toggle('pattern-expanded', !!expanded);
            } catch (_) {}
        } catch (_) {}
    }

    function refreshPatternLastSpins(patternInfoEl, limit = PATTERN_LAST_SPINS_LIMIT) {
        try {
            const { mainEl, rowEl } = ensurePatternInfoLayout(patternInfoEl, limit);
            if (!rowEl) return;
            rowEl.innerHTML = renderPatternLastSpinsItems(getPatternLastSpinsSnapshot(limit));
            // ✅ Não mostrar mensagem quando não há padrão (pedido do usuário)
        } catch (_) {}
    }
    // Update sidebar with new data
    function updateSidebar(data) {
        // ═══════════════════════════════════════════════════════════════
        // 👑 SINAL DE ENTRADA - OVERLAY NO TOPO DO PAINEL (Saldo/Lucro/Perdas...)
        // ═══════════════════════════════════════════════════════════════
        // Nota: funções/estado ficam fora para evitar recriar a cada updateSidebar
        const lastSpinNumber = document.getElementById('lastSpinNumber');
        const confidenceFill = document.getElementById('confidenceFill');
        const confidenceText = document.getElementById('confidenceText');
        const suggestionColor = document.getElementById('suggestionColor');
        const patternInfo = document.getElementById('patternInfo');
        const patternSection = document.querySelector('.pattern-section');
        const totalSpins = document.getElementById('totalSpins');
        const lastUpdate = document.getElementById('lastUpdate');
        // Não resetar o estágio imediatamente; somente quando realmente não houver Gale ativo

        // ✅ Pedido: Card "Padrão" deve ser SEMPRE visível e SEMPRE mostrar os últimos 10 giros
        // (inclusive quando chega apenas lastSpin e quando a análise some após o resultado).
        try { if (patternSection) patternSection.style.display = ''; } catch (_) {}
        try { refreshPatternLastSpins(patternInfo, PATTERN_LAST_SPINS_LIMIT); } catch (_) {}
        
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
            
            // Atualizar modo aposta com último giro
            syncBetModeView();
        }
        
        if (Object.prototype.hasOwnProperty.call(data, 'analysis')) {
            // ✅ Recuperação: sinais internos (fase 1 "silenciosa") nunca devem aparecer no UI.
            if (data.analysis && data.analysis.hiddenInternal) {
                data.analysis = null;
                // também não renderizar padrão/overlay vindo desse sinal
                if (Object.prototype.hasOwnProperty.call(data, 'pattern')) {
                    data.pattern = null;
                }
            }

            if (data.analysis) {
                const analysis = data.analysis;
                const confidence = analysis.confidence;
                // ✅ Nova regra: IA é a "fase principal". Sempre tratar o sinal como aposta do usuário.
                // (Fase 2 / "Sinal de entrada" deixa de ser o fluxo principal.)
                const isEntrySignal = false;
                const phaseLabel = (analysis.phase && analysis.phase !== 'ENTRADA' && analysis.phase !== 'G0')
                    ? analysis.phase.toUpperCase()
                    : '';
                const analysisCardEl = document.querySelector('.analysis-section .analysis-card');

                // ✅ Voltar a mostrar "Padrão encontrado" também para sinais da IA (fase principal).
                // Mostrar o bloco sempre que existir analysis/patternDescription.
                try {
                    const hasPattern = !!(analysis && analysis.patternDescription);
                    if (patternSection) {
                        // ✅ Nunca esconder o card de Padrão
                        patternSection.style.display = '';
                    }
                    if (patternInfo) {
                        if (hasPattern) {
                            patternInfo.classList.add('pattern-expanded');
                        } else {
                            // ✅ Nunca deixar vazio (o card ficava “sumindo/limpo”)
                            setPatternMainContent(patternInfo, '', { expanded: false });
                            try { refreshPatternLastSpins(patternInfo, PATTERN_LAST_SPINS_LIMIT); } catch (_) {}
                        }
                    }
                } catch (_) {}
                
                // Só atualiza UI se a análise mudou (evita flutuação a cada 2s)
                const analysisSig = `${isEntrySignal ? 'ENTRY' : 'RAW'}|${analysis.color}|${confidence.toFixed(2)}|${phaseLabel}|${analysis.createdOnTimestamp || analysis.timestamp || ''}`;
                if (analysisSig !== lastAnalysisSignature) {
                    lastAnalysisSignature = analysisSig;
                    
                    // ✅ Voltar a exibir sinais no topo (Aguardando sinal), como antes:
                    // - Sinal normal: aparece aqui em cima
                    // - Sinal de entrada: também aparece e recebe destaque (fundo branco no desktop)
                    confidenceFill.style.width = `${confidence}%`;
                    confidenceText.textContent = `${confidence.toFixed(1)}%`;

                    if (analysisCardEl) {
                        analysisCardEl.classList.toggle('da-entry-signal-highlight', isEntrySignal);
                    }

                    if (suggestionColor) {
                        suggestionColor.removeAttribute('data-gale');
                        suggestionColor.className = `suggestion-color suggestion-color-box ${analysis.color}`;
                        suggestionColor.setAttribute('title', isEntrySignal ? 'Sinal de entrada' : 'Sinal');
                        // Estilo "Apostas": anel girando aguardando resultado
                        suggestionColor.innerHTML = `<span class="pending-indicator"></span>`;
                    }

                    // Mostrar estágio quando existir (G1/G2...), senão ocultar
                    try { setSuggestionStage(phaseLabel || ''); } catch (_) {}
                    // ✅ Fallback: em alguns fluxos o "stage" pode estar apenas no martingaleState (e não em analysis.phase).
                    // Ex.: entrou no G1/G2 e o topo precisa mostrar o rótulo dentro do ícone.
                    if (!phaseLabel) {
                        try {
                            storageCompat.get(['martingaleState']).then((res = {}) => {
                                const ms = res.martingaleState;
                                const stage = ms && ms.active ? String(ms.stage || '').toUpperCase().trim() : '';
                                if (stage && stage !== 'G0' && stage !== 'ENTRADA') {
                                    try { setSuggestionStage(stage); } catch (_) {}
                                }
                            }).catch(() => {});
                        } catch (_) {}
                    }

                    // Sincronizar visual do modo aposta
                    syncBetModeView();

                    // ✅ Recuperação: a aba mostra apenas o sinal de recuperação (quando existir)
                    try { renderRecoverySignalPreview(analysis); } catch (_) {}
                }
                
                // Update pattern info - renderizar para sinais IA (fase principal)
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
                            setPatternMainContent(
                                patternInfo,
                                renderPatternVisual(
                                    parsed,
                                    (data.pattern && typeof data.pattern === 'object')
                                        ? { ...data.pattern, __daPatternCard: true }
                                        : { __daPatternCard: true }
                                ),
                                { expanded: true }
                            );
                        } else {
                            // Fazer parse do JSON
                            parsed = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
                            
                            // ✅ VERIFICAR TIPO DE ANÁLISE
                            if (parsed.type === 'AI_ANALYSIS') {
                                console.log('✅ DETECTADO: Análise por IA (formato JSON estruturado)');
                                console.log('🎲 last5Spins no JSON:', parsed.last5Spins);
                                isAIAnalysis = true;
                                setPatternMainContent(
                                    patternInfo,
                                    renderPatternVisual(
                                        parsed,
                                        (data.pattern && typeof data.pattern === 'object')
                                            ? { ...data.pattern, __daPatternCard: true }
                                            : { __daPatternCard: true }
                                    ),
                                    { expanded: true }
                                );
                            } else {
                                console.log('📝 Análise padrão detectada');
                                // anexar summary vindo do analysis se existir
                                if (data.analysis && data.analysis.summary) parsed.summary = data.analysis.summary;
                                setPatternMainContent(
                                    patternInfo,
                                    renderPatternVisual(
                                        parsed,
                                        (data.pattern && typeof data.pattern === 'object')
                                            ? { ...data.pattern, __daPatternCard: true }
                                            : { __daPatternCard: true }
                                    ),
                                    { expanded: true }
                                );
                            }
                        }
                        
                        // ✅ Não atualizar título aqui (agora o topo exibe apenas Sinal de entrada)
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
                        setPatternMainContent(patternInfo, `<div class="pattern-error">Erro ao processar padrão</div>`, { expanded: false });
                    }
                }
                
                if (analysis.safeZone) {
                    renderSafeZoneStatus(analysis.safeZone);
                } else {
                    renderSafeZoneStatus(null);
                }

                // ✅ Overlay removido: agora o Sinal de entrada aparece destacado AQUI em cima.
                try { hideMasterSignalOverlay(); } catch (_) {}

                // ✅ Título do bloco superior: agora é sinal (não análise)
                try {
                    const analysisModeTitle = document.getElementById('analysisModeTitle');
                    if (analysisModeTitle) {
                        analysisModeTitle.textContent = isEntrySignal ? 'Sinal de entrada' : 'Aguardando sinal';
                    }
                } catch (_) {}
                
                // ✅ Estágio (G1/G2...) no topo:
                // Agora é tratado acima via `analysis.phase` (phaseLabel) + fallback do `martingaleState.stage`.
                // Não sobrescrever aqui, para não apagar o rótulo no modo IA.
                
                // status indicator removed; entries panel shows progress
            } else {
                // Sem análise ativa: mostrar feedback de busca ou coleta de dados
                lastAnalysisSignature = '';
                confidenceFill.style.width = '0%';
                confidenceText.textContent = '0%';
                try {
                    const analysisCardEl = document.querySelector('.analysis-section .analysis-card');
                    if (analysisCardEl) analysisCardEl.classList.remove('da-entry-signal-highlight');
                } catch (_) {}
                
                // ✅ RESETAR TÍTULO DO BLOCO (agora é sinal)
                const analysisModeTitle = document.getElementById('analysisModeTitle');
                if (analysisModeTitle) {
                    analysisModeTitle.textContent = 'Aguardando sinal';
                }
                // Resetar também o resumo do modo aposta
                syncBetModeView();

                // ✅ Recuperação: se estava mostrando um sinal de recuperação, limpar quando não houver análise
                try { renderRecoverySignalPreview(null); } catch (_) {}

                // ✅ Se houver Martingale ativo (G1/G2...) no storage, reconstruir o "sinal em andamento"
                // mesmo após refresh/atualização, para não sumir do topo e do card de Padrão.
                const msFromData = data && data.martingaleState ? data.martingaleState : null;
                const renderFromMartingale = (ms) => {
                    try {
                        if (!ms || !ms.active) return false;
                        const stage = String(ms.stage || '').toUpperCase().trim();
                        if (!stage || !stage.startsWith('G') || stage === 'G0') return false;
                        const a = ms.analysisData && typeof ms.analysisData === 'object' ? ms.analysisData : null;
                        if (a && a.hiddenInternal) return false;
                        const rawColor = ms.currentColor || ms.entryColor || (a ? a.color : null);
                        const color = (rawColor ? String(rawColor).toLowerCase().trim() : '');
                        if (!(color === 'red' || color === 'black' || color === 'white')) return false;

                        // Confiança (se existir) + spinner
                        const conf = (a && typeof a.confidence === 'number') ? a.confidence : 0;
                        confidenceFill.style.width = `${Math.max(0, Math.min(100, Number(conf) || 0))}%`;
                        confidenceText.textContent = `${Number(conf || 0).toFixed(1)}%`;

                        if (suggestionColor) {
                            suggestionColor.className = `suggestion-color suggestion-color-box ${color}`;
                            suggestionColor.setAttribute('title', `IA • Aguardando resultado (${stage})`);
                            suggestionColor.innerHTML = `<span class="pending-indicator"></span>`;
                        }
                        try { setSuggestionStage(stage); } catch (_) {}

                        // Card "Padrão"
                        try {
                            const hasPattern = !!(a && a.patternDescription);
                            // ✅ Nunca esconder o card de Padrão (pedido do usuário)
                            if (patternSection) patternSection.style.display = '';
                            if (patternInfo) {
                                if (!hasPattern) {
                                    // ✅ Nunca deixar vazio após resultado/refresh
                                    setPatternMainContent(patternInfo, '', { expanded: false });
                                    try { refreshPatternLastSpins(patternInfo, PATTERN_LAST_SPINS_LIMIT); } catch (_) {}
                                } else {
                                    patternInfo.classList.add('pattern-expanded');
                                    // Reusar renderer já existente
                                    const desc = a.patternDescription;
                                    try {
                                        // tenta parse quando for JSON; senão renderiza string
                                        const parsed = (typeof desc === 'string') ? (() => {
                                            try { return JSON.parse(desc); } catch (_) { return desc; }
                                        })() : desc;
                                        setPatternMainContent(
                                            patternInfo,
                                            renderPatternVisual(parsed, {
                                                description: desc,
                                                last5Spins: a.last5Spins || a.last10Spins || [],
                                                __daPatternCard: true
                                            }),
                                            { expanded: true }
                                        );
                                        try { refreshPatternLastSpins(patternInfo, PATTERN_LAST_SPINS_LIMIT); } catch (_) {}
                                    } catch (_) {
                                        setPatternMainContent(patternInfo, `<pre class="pattern-raw">${escapeHtml(String(desc || ''))}</pre>`, { expanded: true });
                                        try { refreshPatternLastSpins(patternInfo, PATTERN_LAST_SPINS_LIMIT); } catch (_) {}
                                    }
                                }
                            }
                        } catch (_) {}

                        // Manter modo aposta sincronizado
                        syncBetModeView();
                        return true;
                    } catch (_) {
                        return false;
                    }
                };

                let didRender = false;
                try { didRender = renderFromMartingale(msFromData); } catch (_) {}
                if (!didRender) {
                    try {
                        storageCompat.get(['martingaleState']).then((res = {}) => {
                            const ms = res.martingaleState;
                            if (!renderFromMartingale(ms)) {
                                renderSuggestionStatus(currentAnalysisStatus);
                                try { if (patternSection) patternSection.style.display = ''; } catch (_) {}
                                try { setPatternMainContent(patternInfo, '', { expanded: false }); } catch (_) {}
                                try { refreshPatternLastSpins(patternInfo, PATTERN_LAST_SPINS_LIMIT); } catch (_) {}
                                try { patternInfo.title = ''; } catch (_) {}
                                try { patternInfo?.classList?.remove('pattern-expanded'); } catch (_) {}
                                setSuggestionStage('');
                                try { hideMasterSignalOverlay(); } catch (_) {}
                            }
                        }).catch(() => {
                            renderSuggestionStatus(currentAnalysisStatus);
                            try { if (patternSection) patternSection.style.display = ''; } catch (_) {}
                            try { setPatternMainContent(patternInfo, '', { expanded: false }); } catch (_) {}
                            try { refreshPatternLastSpins(patternInfo, PATTERN_LAST_SPINS_LIMIT); } catch (_) {}
                            try { patternInfo.title = ''; } catch (_) {}
                            try { patternInfo?.classList?.remove('pattern-expanded'); } catch (_) {}
                            setSuggestionStage('');
                            try { hideMasterSignalOverlay(); } catch (_) {}
                        });
                    } catch (_) {
                        renderSuggestionStatus(currentAnalysisStatus);
                        try { if (patternSection) patternSection.style.display = ''; } catch (_) {}
                        try { setPatternMainContent(patternInfo, '', { expanded: false }); } catch (_) {}
                        try { refreshPatternLastSpins(patternInfo, PATTERN_LAST_SPINS_LIMIT); } catch (_) {}
                        try { patternInfo.title = ''; } catch (_) {}
                        try { patternInfo?.classList?.remove('pattern-expanded'); } catch (_) {}
                        setSuggestionStage('');
                        try { hideMasterSignalOverlay(); } catch (_) {}
                    }
                }
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

    // ═══════════════════════════════════════════════════════════════
    // 👑 SINAL DE ENTRADA - OVERLAY (aparece sobre o topo do painel)
    // ═══════════════════════════════════════════════════════════════
    let masterSignalOverlayEl = null;
    let masterSignalOverlaySignature = null;

    function getMasterSignalOverlayTarget() {
        const primary = document.getElementById('autoBetSummary');
        if (primary && primary.offsetParent !== null) return primary;
        return primary || null;
    }

    function normalizeOverlayPhaseLabel(phase) {
        const p = String(phase || '').toUpperCase().trim();
        if (!p || p === 'G0' || p === 'ENTRADA') return 'ENTRADA';
        return p;
    }

    function normalizeOverlayColor(color) {
        const c = String(color || '').toLowerCase().trim();
        if (c === 'red' || c === 'black' || c === 'white') return c;
        return 'neutral';
    }

    function ensureMasterSignalOverlay() {
        const target = getMasterSignalOverlayTarget();
        if (!target) return null;

        if (!masterSignalOverlayEl || !masterSignalOverlayEl.isConnected) {
            masterSignalOverlayEl = document.createElement('div');
            masterSignalOverlayEl.id = 'masterSignalOverlay';
            masterSignalOverlayEl.className = 'master-signal-overlay';
            masterSignalOverlayEl.style.display = 'none';
            // Não bloquear clique dos controles (toggle/config) por baixo
            masterSignalOverlayEl.style.pointerEvents = 'none';

            // Garantir contexto de posicionamento
            try {
                const pos = window.getComputedStyle(target).position;
                if (!pos || pos === 'static') {
                    target.style.position = 'relative';
                }
            } catch (_) {}

            target.appendChild(masterSignalOverlayEl);
        } else if (masterSignalOverlayEl.parentElement !== target) {
            // Se alternou modo compacto/colapsado, mover overlay para o container certo
            try { masterSignalOverlayEl.remove(); } catch (_) {}
            masterSignalOverlayEl = null;
            masterSignalOverlaySignature = null;
            return ensureMasterSignalOverlay();
        }

        return masterSignalOverlayEl;
    }

    function showMasterSignalOverlay(analysis) {
        const overlay = ensureMasterSignalOverlay();
        if (!overlay) return;

        const color = normalizeOverlayColor(analysis?.color);
        const phaseLabel = normalizeOverlayPhaseLabel(analysis?.phase);
        const confidence = (typeof analysis?.confidence === 'number') ? Number(analysis.confidence) : null;
        const ms = analysis && typeof analysis === 'object' ? analysis.masterSignal : null;
        const diamondSrc = (ms && ms.diamondSourceLevel) ? ms.diamondSourceLevel : (analysis ? analysis.diamondSourceLevel : null);
        const diamondId = diamondSrc && diamondSrc.id ? String(diamondSrc.id) : '';
        const diamondStats = (ms && ms.diamondSourceLevelStats) ? ms.diamondSourceLevelStats : null;
        const diamondPct = (diamondStats && typeof diamondStats.hitRate === 'number')
            ? (diamondStats.hitRate * 100).toFixed(1)
            : '';

        const sig = `${analysis?.createdOnTimestamp || analysis?.timestamp || ''}|${color}|${phaseLabel}|${confidence != null ? confidence.toFixed(1) : ''}|${diamondId}|${diamondPct}`;
        if (sig === masterSignalOverlaySignature && overlay.style.display !== 'none') {
            return;
        }
        masterSignalOverlaySignature = sig;

        const colorLabel = color === 'red' ? 'VERMELHO' : color === 'black' ? 'PRETO' : color === 'white' ? 'BRANCO' : '—';
        const confText = confidence != null ? `${confidence.toFixed(1)}%` : '—';
        const levelText = diamondId
            ? ` • Nível: <b>${diamondId}</b>${diamondPct ? ` (${diamondPct}%)` : ''}`
            : '';

        overlay.innerHTML = `
            <div class="master-signal-content">
                <div class="master-signal-left">
                    <div class="master-signal-badge">SINAL DE ENTRADA</div>
                    <div class="master-signal-action">ENTRAR AGORA</div>
                    <div class="master-signal-meta">Fase: <b>${phaseLabel}</b> • Confiança: <b>${confText}</b>${levelText}</div>
                </div>
                <div class="master-signal-right">
                    <div class="master-signal-color-box ${color}" aria-label="${colorLabel}" title="${colorLabel}">
                        <div class="master-signal-color-label">${colorLabel}</div>
                    </div>
                </div>
            </div>
        `;

        overlay.style.display = 'flex';
    }

    function hideMasterSignalOverlay() {
        if (!masterSignalOverlayEl) return;
        masterSignalOverlayEl.style.display = 'none';
        masterSignalOverlaySignature = null;
    }
    
    function renderSuggestionStatus(statusText) {
        const suggestionColor = document.getElementById('suggestionColor');
        if (!suggestionColor) return;
        const normalized = typeof statusText === 'string' ? statusText : '';
        suggestionColor.removeAttribute('title');
        
        // Regra nova: se NÃO há sinal visível, sempre mostrar o spinner (sensação de análise rodando)
        // Vale para modo padrão e modo diamante.
            suggestionColor.className = 'suggestion-color suggestion-color-box neutral loading';
            suggestionColor.innerHTML = '<div class="spinner"></div>';
        
        // Sincronizar com modo aposta
        syncBetModeView();
    }

    function setSuggestionStage(label) {
        const suggestionStage = document.getElementById('suggestionStage');
        const wrapper = suggestionStage?.closest('.suggestion-color-wrapper');
        // ✅ Novo: indicador fica DENTRO do quadrado da cor (como no visual de "Apostas")
        // O elemento lateral (suggestionStage) não é mais usado.
        if (suggestionStage) {
            suggestionStage.textContent = '';
            suggestionStage.classList.remove('visible');
        }
        if (wrapper) wrapper.classList.remove('has-stage');

        const suggestionColor = document.getElementById('suggestionColor');
        if (suggestionColor) {
            if (label) {
                suggestionColor.setAttribute('data-gale', String(label));
            } else {
                suggestionColor.removeAttribute('data-gale');
            }
        }
        
        // Atualizar visual do modo aposta (usa mesma cor/estágio)
        syncBetModeView();
    }

    // ═══════════════════════════════════════════════════════════════
    // 📊 ADMIN TRACKING (SERVER): Snapshot de Sinais/Gráfico + Histórico de "Limpar"
    // ═══════════════════════════════════════════════════════════════
    // Objetivo: enviar para a API os dados mínimos para o admin acompanhar:
    // - WIN/LOSS/%/Entradas
    // - deltas do gráfico (tick chart)
    // - evento quando o usuário clica em "Limpar"

    let lastSignalPanelSnapshotKey = '';
    let lastSignalPanelSnapshotSentAt = 0;
    let signalPanelSnapshotInFlight = false;

    async function getAuthTokenForServerSync() {
        // 1) localStorage (web)
        try {
            const token = localStorage.getItem('authToken');
            if (token) return token;
        } catch (_) {}

        // 2) chrome.storage.local (extensão / web-shim)
        try {
            if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
                const data = await new Promise((resolve) => {
                    chrome.storage.local.get(['authToken'], (result) => {
                        if (chrome.runtime?.lastError) {
                            resolve({});
                        } else {
                            resolve(result || {});
                        }
                    });
                });
                if (data && data.authToken) return data.authToken;
            }
        } catch (_) {}

        return null;
    }

    function getTimeoutSignal(ms) {
        try {
            return AbortSignal.timeout(ms);
        } catch (_) {
            return undefined;
        }
    }

    function computeSignalPanelChartDeltas(entries, autoBetConfig) {
        const allEntries = Array.isArray(entries) ? entries : [];
        const cfg = autoBetConfig && typeof autoBetConfig === 'object' ? autoBetConfig : {};
        const galeMult = Math.max(1, Number(cfg.galeMultiplier ?? 2) || 2);
        const baseStake = Math.max(0.01, Number(cfg.baseStake ?? 2) || 2);
        const whitePayoutMultiplier = Math.max(2, Number(cfg.whitePayoutMultiplier ?? 14) || 14);

        const attemptsChron = allEntries
            .filter(e => e && (e.result === 'WIN' || e.result === 'LOSS'))
            .slice()
            .reverse();

        const deltas = attemptsChron.map(e => {
            const stageIdx = (typeof getStageIndexFromEntryLike === 'function') ? getStageIndexFromEntryLike(e) : 0;
            const stake = Number(e?.stakeAmount) || Number((baseStake * Math.pow(galeMult, stageIdx)).toFixed(2));
            const betColor = String(e?.betColor || (e?.patternData?.color ?? '')).toLowerCase();
            const payoutMult = Math.max(2, Number(e?.payoutMultiplier) || (betColor === 'white' ? whitePayoutMultiplier : 2));
            const delta = e.result === 'WIN'
                ? Number((stake * (payoutMult - 1)).toFixed(2))
                : Number((-stake).toFixed(2));
            return delta;
        });

        // limitar para evitar payload infinito
        return deltas.slice(-800);
    }

    async function postSignalPanelSnapshotToServer(payload) {
        try {
            const token = await getAuthTokenForServerSync();
            if (!token) return;

            const API_URL = getApiUrl();
            await fetch(`${API_URL}/api/auth/signal-panel/snapshot`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload || {}),
                signal: getTimeoutSignal(6000)
            });
        } catch (_) {
            // silencioso (não poluir console do usuário)
        }
    }

    function queueSignalPanelSnapshotToServer(payload) {
        try {
            const now = Date.now();
            const key = JSON.stringify(payload || {});
            // throttle:
            // - se NÃO mudou: enviar no máximo a cada 60s (suficiente pro admin acompanhar)
            // - se mudou: permitir envio mais rápido (8s) para refletir entradas recentes
            const samePayload = key === lastSignalPanelSnapshotKey;
            const minIntervalMs = samePayload ? 60000 : 8000;
            if ((now - lastSignalPanelSnapshotSentAt) < minIntervalMs) return;
            if (signalPanelSnapshotInFlight) return;

            lastSignalPanelSnapshotKey = key;
            lastSignalPanelSnapshotSentAt = now;
            signalPanelSnapshotInFlight = true;
            Promise.resolve(postSignalPanelSnapshotToServer(payload))
                .finally(() => { signalPanelSnapshotInFlight = false; });
        } catch (_) {}
    }

    async function postSignalPanelClearEventToServer(mode) {
        try {
            const token = await getAuthTokenForServerSync();
            if (!token) return;

            const API_URL = getApiUrl();
            await fetch(`${API_URL}/api/auth/signal-panel/clear`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    mode: mode === 'diamond' ? 'diamond' : 'standard',
                    clearedAt: new Date().toISOString()
                }),
                signal: getTimeoutSignal(6000)
            });
        } catch (_) {
            // silencioso
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
        let iaHold = (() => {
            try { return isIABootstrapHoldActive(currentMode); } catch (_) { return false; }
        })();
        
        console.log(`🔍 Modo de análise ativo: ${currentMode.toUpperCase()}`);

        // ✅ Política para entradas antigas sem analysisMode:
        // Se já existem entradas com analysisMode explícito, NÃO tratar "sem analysisMode" como standard
        // (evita “entradas fantasma” vindas de histórico antigo).
        const hasExplicitMode = Array.isArray(entries) && entries.some(e =>
            e && (e.analysisMode === 'diamond' || e.analysisMode === 'standard')
        );
        const resolveEntryMode = (e) => {
            const m = e && typeof e.analysisMode === 'string' ? e.analysisMode : null;
            if (m === 'diamond' || m === 'standard') return m;
            return hasExplicitMode ? 'legacy' : 'standard';
        };
        
        // ═══════════════════════════════════════════════════════════════
        // ✅ FILTRAR ENTRADAS POR MODO DE ANÁLISE
        // ═══════════════════════════════════════════════════════════════
        // Mostrar apenas entradas do modo ativo
        const entriesByMode = entries.filter(e => {
            // Mostrar apenas se for do modo ativo
            const entryMode = resolveEntryMode(e);
            return entryMode === currentMode;
        });

        // ✅ Cutoff da aba IA: quando o usuário clica "Limpar" na IA, esconder TUDO que está na IA (inclui mestres),
        // mas sem afetar Sinais/Gráfico/Apostas (que usam outro cutoff).
        const entriesCutoffMs = getEntriesCutoffMs(currentMode);
        let entriesByModeForIA = entriesByMode.filter(e => getEntryTimestampMs(e) >= entriesCutoffMs);
        
        // ✅ Novo: Gráfico/Apostas devem acompanhar a mesma janela da IA (o que o usuário vê em IA).
        // Portanto: usar o MESMO cutoff da IA (entriesCutoffMs), sem depender de isMaster.
        let entriesByModeForChart = entriesByModeForIA;

        // ✅ IA VIVA (HOLD):
        // - Após "Limpar", manter vazio e com a bolinha ATÉ o usuário clicar em "Analisar histórico".
        // - Porém, se chegaram NOVOS ciclos após o cutoff, o HOLD deve ser desligado automaticamente
        //   (pedido do usuário: se veio sinal/resultado, a bolinha deve sumir e o histórico não pode "sumir").
        if (iaHold && entriesByModeForIA.length > 0) {
            try { setIABootstrapHoldActive(currentMode, false); } catch (_) {}
            iaHold = false;
        }
        if (iaHold) {
            entriesByModeForIA = [];
            entriesByModeForChart = [];
        }
        
        console.log(`   Total de entradas: ${entries.length}`);
        console.log(`   Entradas do modo ${currentMode}: ${entriesByMode.length} (IA>=cutoff=${entriesByModeForIA.length})`);
        
        // ═══════════════════════════════════════════════════════════════
        // ✅ FILTRAR ENTRADAS - MOSTRAR APENAS RESULTADOS FINAIS
        // ═══════════════════════════════════════════════════════════════
        // REGRA DE EXIBIÇÃO:
        // - WIN (qualquer estágio) → SEMPRE MOSTRAR
        // - LOSS intermediário (continuando para próximo Gale) → NUNCA MOSTRAR
        // - LOSS final (RED ou fim de ciclo) → SEMPRE MOSTRAR
        
        const filteredEntries = entriesByModeForIA.filter(e => {
            // ✅ Sempre mostrar WINs (qualquer estágio)
            if (e.result === 'WIN') return true;
            
            // ✅ Para LOSSes, verificar se é FINAL ou INTERMEDIÁRIO
            if (e.result === 'LOSS') {
                // Se tem finalResult === 'RED' (ou legado 'RET'), é LOSS FINAL → MOSTRAR
                if (e.finalResult === 'RED' || e.finalResult === 'RET') return true;
                
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

        // ✅ Guardar o último sinal de recuperação visível (para exibir na aba "Recuperação" mesmo após desativar)
        try {
            const latestRecovery = filteredEntries.find(e => e && e.recoveryMode);
            if (latestRecovery) {
                lastRecoveryEntryByMode[currentMode] = latestRecovery;
            }
        } catch (_) {}
        
        console.log(`📊 Entradas: ${entries.length} total | IA ${entriesByModeForIA.length} do modo ${currentMode} | ${filteredEntries.length} exibidas (${entriesByModeForIA.length - filteredEntries.length} LOSSes intermediários ocultos)`);
        
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
                    if (e.finalResult === 'RED' || e.finalResult === 'RET') {
                        // LOSS FINAL (RED) - mostrar em qual Gale perdeu
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
            
            const title = `Giro: ${e.number} • Cor: ${e.color} • ${time} • Resultado: ${e.result}` +
                `${e.martingaleStage ? ' • Estágio: '+e.martingaleStage : ''}` +
                `${e.confidence? ' • Confiança: '+e.confidence.toFixed(1)+'%' : ''}` +
                `${e.isMaster ? ' • SINAL DE ENTRADA' : ''}`;
            
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
        // ✅ INDICADOR DE ENTRADA PENDENTE / GALE ATIVO (NO TOPO)
        // Agora mostra a COR recomendada (estilo Apostas) + spinner,
        // e o G1/G2 aparece DENTRO da cor (data-gale).
        // ═══════════════════════════════════════════════════════════════
        storageCompat.get(['martingaleState', 'analysis']).then((result = {}) => {
            const martingaleState = result.martingaleState;
            const analysis = result.analysis;

            const normColor = (value) => {
                const raw = String(value || '').toLowerCase().trim();
                if (raw === 'red' || raw === 'vermelho') return 'red';
                if (raw === 'black' || raw === 'preto') return 'black';
                if (raw === 'white' || raw === 'branco') return 'white';
                return null;
            };
            const isDiamondAnalysis = (a) => {
                try {
                    const desc = a && a.patternDescription ? String(a.patternDescription) : '';
                    if (a && a.diamondSourceLevel) return true;
                    return desc.includes('NÍVEL DIAMANTE') || desc.includes('5 Níveis');
                } catch (_) {
                    return false;
                }
            };
            const resolveAnalysisMode = (a) => (isDiamondAnalysis(a) ? 'diamond' : 'standard');
            const isEntrySignal = (a) => !!(a && a.masterSignal && a.masterSignal.active);

            let pendingIndicator = '';

            // ✅ Indicador pendente (entrada/gale em andamento)
            // Regras:
            // - Se existir `analysis` pendente no storage: mostrar (entrada/G1/G2…)
            // - Se `analysis` estiver null (ex.: G2 aguardando novo sinal por causa de "Consecutivo até (G)=1"):
            //   ainda assim mostrar se o `martingaleState` estiver ativo em G1/G2...
            const hasAnalysisPending = !!(analysis && !analysis.hiddenInternal);
            const ms = (martingaleState && typeof martingaleState === 'object') ? martingaleState : null;
            const stageFromMs = ms ? String(ms.stage || '').toUpperCase().trim() : '';
            const hasGalePendingFromMs = !!(ms && ms.active && stageFromMs.startsWith('G') && stageFromMs !== 'G0');
            const shouldShowPending = hasAnalysisPending || hasGalePendingFromMs;

            if (shouldShowPending) {
                const parseMs = (v) => {
                    try {
                        if (v == null) return 0;
                        if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
                        const n = Number(v);
                        if (Number.isFinite(n)) return n;
                        const ms = Date.parse(String(v));
                        return Number.isFinite(ms) ? ms : 0;
                    } catch (_) {
                        return 0;
                    }
                };

                // Se faltar timestamp (estado corrompido) OU estiver muito velho (travado), pedir reset no background.
                const rawTs = hasAnalysisPending
                    ? (analysis && analysis.createdOnTimestamp != null ? analysis.createdOnTimestamp : null)
                    : (ms && ms.entryTimestamp != null ? ms.entryTimestamp : null);
                const hasTimestamp = rawTs != null && String(rawTs).trim().length > 0;
                const aMs = parseMs(rawTs);
                const nowMs = Date.now();
                const STALE_MS = 3 * 60 * 1000; // 3min (bem conservador)
                const isStale = (aMs > 0 && nowMs > aMs && (nowMs - aMs) > STALE_MS);

                if (!hasTimestamp || isStale) {
                    const reason = !hasTimestamp ? 'missing_timestamp_ui' : 'stale_pending_ui';
                    try { chrome.runtime.sendMessage({ action: 'FORCE_CLEAR_PENDING', reason }, () => {}); } catch (_) {}
                } else {
                    const color = normColor(hasAnalysisPending ? analysis?.color : (ms?.currentColor || ms?.entryColor));
                    const stage = String((hasAnalysisPending ? (analysis?.phase || '') : stageFromMs) || '').toUpperCase().trim();
                    const galeLabel = (stage && stage.startsWith('G') && stage !== 'G0') ? stage : '';

                    if (color) {
                        const isMasterPending = hasAnalysisPending ? isEntrySignal(analysis) : false;
                        const galeAttr = galeLabel ? ` data-gale="${galeLabel}"` : '';
                        const titleBase = isMasterPending ? 'Sinal de entrada' : 'IA';
                        const title = galeLabel ? `${titleBase} • Aguardando resultado (${galeLabel})` : `${titleBase} • Aguardando resultado`;
                        pendingIndicator = `
                            <div class="entry-item-wrap gale-active-indicator" title="${title}">
                                <div class="entry-conf-top gale-placeholder">&nbsp;</div>
                                <div class="entry-stage gale-placeholder">&nbsp;</div>
                                <div class="entry-item">
                                    <div class="entry-box ${color} pending-ring"${galeAttr}></div>
                                    <div class="entry-result-bar win" style="opacity:0;"></div>
                                </div>
                                <div class="entry-time gale-placeholder">&nbsp;</div>
                            </div>
                        `;
                    }
                }
            }

            // ✅ IA VIVA: sem “vidro/ofuscado”. Manter apenas a bolinha (CTA) quando a IA estiver vazia.
            const isIA = (activeEntriesTab === 'entries');
            try {
                bindIATestsToggle();
                applyIAVisibilityState(filteredEntries.length, pendingIndicator);
                if (isIA) {
                    bindIABootstrapButton();
                    setIABootstrapHasHistory(filteredEntries.length > 0);
                    // Mostrar CTA apenas quando não há histórico visível (cutoff) e não está rodando
                    const showCta = !iaBootstrapBusy && filteredEntries.length === 0;
                    setIABootstrapState(iaBootstrapBusy ? 'loading' : 'idle', showCta ? 'Analisar histórico' : '');
                }
            } catch (_) {}

            // Inserir indicador no TOPO + itens (o vidro desfoca o conteúdo real)
            list.innerHTML = pendingIndicator + (items || (isIA ? '' : '<div class="no-history">Sem entradas registradas</div>'));
            // (Recuperação) não espelhar lista completa da IA — a aba Recuperação mostra apenas 1 sinal (o de recuperação).
            
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
            const isIA = (activeEntriesTab === 'entries');
            list.innerHTML = items || (isIA ? '' : '<div class="no-history">Sem entradas registradas</div>');
        });
        
        // ═══════════════════════════════════════════════════════════════
        // ✅ ESTATÍSTICAS (IA) — permanece para a aba IA
        // ═══════════════════════════════════════════════════════════════
        const totalCycles = filteredEntries.length;
        const wins = filteredEntries.filter(e => e.result === 'WIN').length;
        const losses = totalCycles - wins;
        const pct = totalCycles ? ((wins / totalCycles) * 100).toFixed(1) : '0.0';

        // ✅ “Entradas” (contador) deve representar CICLOS FINALIZADOS (o que você vê em IA).
        const totalEntries = totalCycles;

        // ═══════════════════════════════════════════════════════════════
        // ✅ GRÁFICO — acompanhar dados da aba IA (o que o usuário entra agora)
        // ═══════════════════════════════════════════════════════════════
        // Usar as mesmas "finais" já calculadas para IA
        const chartTotalCycles = filteredEntries.length;
        const chartWins = filteredEntries.filter(e => e.result === 'WIN').length;
        const chartLosses = chartTotalCycles - chartWins;
        const chartPct = chartTotalCycles ? ((chartWins / chartTotalCycles) * 100).toFixed(1) : '0.0';

        // Para o tick chart precisamos das TENTATIVAS do ciclo (ENTRADA/G1/G2…),
        // então aqui passamos o histórico completo da IA (mesma janela/cutoff).
        const chartAttempts = entriesByModeForChart;
        
        // Mostrar placar WIN/LOSS com porcentagem e total de entradas
        const clearButtonHTML = `<button type="button" class="clear-entries-btn" id="clearEntriesBtn" title="Limpar histórico">Limpar</button>`;
        hitEl.innerHTML = `<span class="win-score">WIN: ${wins}</span> <span class="loss-score">LOSS: ${losses}</span> <span class="percentage">(${pct}%)</span> <span class="total-entries">• Ciclos: ${totalEntries} ${clearButtonHTML}</span>`;
        const inlineClearBtn = document.getElementById('clearEntriesBtn');
        if (inlineClearBtn) {
            inlineClearBtn.addEventListener('click', function(event) {
                event.preventDefault();
                event.stopPropagation();
                clearEntriesHistory();
            });
        }

        // ✅ Atualizar gráfico do modo real (usa o mesmo estilo do simulador)
        try {
            renderEntriesChart({ wins: chartWins, losses: chartLosses, totalCycles: chartTotalCycles, totalEntries: chartTotalCycles });
            renderEntriesTickChart(chartAttempts);
        } catch (err) {
            console.warn('⚠️ Falha ao atualizar gráfico do modo real:', err);
        }

        // ✅ Enviar snapshot para o servidor (Admin acompanhar)
        // Agora inclui também "Saldo" e "Perdas" (igual ao gráfico exibido para o usuário).
        try {
            const rawConfig = (latestAnalyzerConfig && latestAnalyzerConfig.autoBetConfig) ? latestAnalyzerConfig.autoBetConfig : null;
            const autoBetConfig = (typeof sanitizeAutoBetConfig === 'function')
                ? sanitizeAutoBetConfig(rawConfig)
                : (rawConfig || {});
            const equity = (typeof computeEntriesProfitSnapshot === 'function')
                ? computeEntriesProfitSnapshot(chartAttempts, autoBetConfig)
                : null;
            const initialBank = Number(equity?.initialBank ?? autoBetConfig?.simulationBankRoll ?? 5000) || 5000;
            const deltas = computeSignalPanelChartDeltas(chartAttempts, autoBetConfig);
            const fallbackProfit = deltas.reduce((acc, v) => acc + (Number.isFinite(Number(v)) ? Number(v) : 0), 0);
            const balanceRaw = Number(equity?.balance);
            const lossRaw = Number(equity?.loss);
            const balance = Number.isFinite(balanceRaw)
                ? balanceRaw
                : Number((initialBank + fallbackProfit).toFixed(2));
            const lossMoney = Number.isFinite(lossRaw)
                ? Math.max(0, lossRaw)
                : (fallbackProfit < 0 ? Number(Math.abs(fallbackProfit).toFixed(2)) : 0);
            const pctNum = Number(chartPct);
            queueSignalPanelSnapshotToServer({
                mode: currentMode,
                stats: {
                    wins: chartWins,
                    losses: chartLosses,
                    entries: chartTotalCycles,
                    pct: Number.isFinite(pctNum) ? pctNum : 0
                },
                chart: {
                    initialBank,
                    balance,
                    loss: lossMoney,
                    deltas
                }
            });
        } catch (_) {}

        // ✅ Sempre manter painel "Sinais" sincronizado (sem depender do usuário trocar de aba)
        try { renderMasterEntriesPanel(entries); } catch (_) {}
    }

    // ✅ Nova aba: Recuperação (ativação manual)
    let recoveryModeEnabled = false;
    let recoveryModeStatusText = 'Desativada';
    // Snapshot do entriesHistory mais recente (para renderizar o histórico de Recuperação sem depender de fetch async)
    let recoveryEntriesSourceCache = [];

    function renderRecoverySignalPreview(analysisOverride = null) {
        try {
            if (!recoveryModeEnabled) return;
            // ✅ Não sobrescrever a lista (histórico) aqui.
            // Apenas re-renderizar o painel completo com o "preview pendente" no topo.
            const hasOverride = arguments.length > 0;
            if (hasOverride) {
                renderRecoveryPanel(recoveryEntriesSourceCache, analysisOverride);
            } else {
                renderRecoveryPanel(recoveryEntriesSourceCache);
            }
        } catch (_) {}
    }

    function clearRecoveryEntriesHistory(modeKey) {
        const key = modeKey === 'diamond' ? 'diamond' : 'standard';
        const now = Date.now();

        // 1) Cutoff do painel Recuperação (não apagar entriesHistory; só esconder do painel)
        masterEntriesClearCutoffByMode = {
            standard: Number(masterEntriesClearCutoffByMode.standard) || 0,
            diamond: Number(masterEntriesClearCutoffByMode.diamond) || 0
        };
        masterEntriesClearCutoffByMode[key] = now;
        try {
            chrome.storage.local.set({ [MASTER_CLEAR_CUTOFF_KEY]: masterEntriesClearCutoffByMode }, function() {});
        } catch (_) {}

        // 2) Limpar fallback persistente do "último sinal" (para não reaparecer após refresh)
        try { lastRecoveryEntryByMode[key] = null; } catch (_) {}
        try {
            storageCompat.get(['lastRecoveryEntryByMode']).then((res = {}) => {
                const raw = res && res.lastRecoveryEntryByMode && typeof res.lastRecoveryEntryByMode === 'object'
                    ? res.lastRecoveryEntryByMode
                    : {};
                const next = { ...raw, [key]: null };
                try { chrome.storage.local.set({ lastRecoveryEntryByMode: next }, function() {}); } catch (_) {}
            }).catch(() => {});
        } catch (_) {}

        // 3) Re-render imediato (usa cache)
        try { renderRecoveryPanel(recoveryEntriesSourceCache); } catch (_) {}
    }

    function renderRecoveryPanel(entriesOverride, analysisOverride) {
        const hasAnalysisOverride = arguments.length >= 2;
        const list = document.getElementById('masterEntriesList');
        const hitEl = document.getElementById('masterEntriesHit');
        if (!list || !hitEl) return;

        const aiModeToggle = document.querySelector('.ai-mode-toggle.active');
        const isDiamondMode = !!aiModeToggle;
        const currentMode = isDiamondMode ? 'diamond' : 'standard';

        const btnLabel = recoveryModeEnabled ? 'Desativar' : 'Recuperar';
        const statusText = recoveryModeEnabled
            ? (recoveryModeStatusText || '')
            : 'Desativada • clique em “Recuperar” após um RED';

        const allEntries = Array.isArray(entriesOverride)
            ? entriesOverride
            : (Array.isArray(recoveryEntriesSourceCache) ? recoveryEntriesSourceCache : []);

        // Mesmo resolveEntryMode da IA (para separar standard/diamond corretamente)
        const hasExplicitMode = Array.isArray(allEntries) && allEntries.some(e =>
            e && (e.analysisMode === 'diamond' || e.analysisMode === 'standard')
        );
        const resolveEntryMode = (e) => {
            const m = e && typeof e.analysisMode === 'string' ? e.analysisMode : null;
            if (m === 'diamond' || m === 'standard') return m;
            return hasExplicitMode ? 'legacy' : 'standard';
        };

        // Cutoff do painel Recuperação (limpar sem afetar IA)
        const cutoffMs = getMasterEntriesCutoffMs(currentMode);
        const recoveryEntries = allEntries
            .filter(e => resolveEntryMode(e) === currentMode)
            .filter(e => getEntryTimestampMs(e) >= cutoffMs)
            .filter(e => e && e.recoveryMode);

        // Atualizar "último" (fallback) — agora é o primeiro do histórico
        try {
            if (recoveryEntries && recoveryEntries.length > 0) {
                lastRecoveryEntryByMode[currentMode] = recoveryEntries[0];
            }
        } catch (_) {}

        // Estatísticas do histórico de Recuperação
        const totalCycles = recoveryEntries.length;
        const wins = recoveryEntries.filter(e => e && e.result === 'WIN').length;
        const losses = totalCycles - wins;
        const pct = totalCycles ? ((wins / totalCycles) * 100).toFixed(1) : '0.0';

        const clearButtonHTML = `<button type="button" class="clear-entries-btn" id="clearRecoveryBtn" title="Limpar histórico de recuperação">Limpar</button>`;
        hitEl.innerHTML = `
            <button type="button" class="recovery-toggle-btn" id="recoveryToggleBtn" aria-pressed="${recoveryModeEnabled ? 'true' : 'false'}">${btnLabel}</button>
            <span class="recovery-status" id="recoveryStatusText">${statusText}</span>
            <span class="win-score">WIN: ${wins}</span>
            <span class="loss-score">LOSS: ${losses}</span>
            <span class="percentage">(${pct}%)</span>
            <span class="total-entries">• Ciclos: ${totalCycles} ${clearButtonHTML}</span>
        `;

        // Render do histórico (múltiplos sinais) — NÃO pode sumir ao ativar Recuperar.
        const items = recoveryEntries.map((entry) => {
            try {
                const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const cls = entry.color;
                const badge = entry.color === 'white' ? blazeWhiteSVG(16) : `<span>${entry.number}</span>`;
                const isWin = entry.result === 'WIN';
                const barClass = isWin ? 'win' : 'loss';

                // Reaproveitar lógica de label (G1/G2...) igual IA
                const stageRaw = (entry.martingaleStage || entry.phase || entry.wonAt || '').toString().toUpperCase().trim();
                let stageText = isWin ? 'WIN' : 'LOSS';
                if (stageRaw && stageRaw.startsWith('G') && stageRaw !== 'G0' && stageRaw !== 'ENTRADA') {
                    const galeNum = stageRaw.substring(1);
                    stageText = isWin
                        ? `WIN <span style="color: white;">G${galeNum}</span>`
                        : `LOSS <span style="color: white;">G${galeNum}</span>`;
                }

                const confTop = (typeof entry.confidence === 'number') ? `${entry.confidence.toFixed(0)}%` : '';
                const title = `Recuperação • Giro: ${entry.number} • ${time} • Resultado: ${entry.result}`;
                return `
                    <div class="entry-item-wrap" title="${title}">
                        ${confTop ? `<div class="entry-conf-top">${confTop}</div>` : ''}
                        <div class="entry-stage ${barClass}">${stageText}</div>
                        <div class="entry-item">
                            <div class="entry-box ${cls}">${badge}</div>
                            <div class="entry-result-bar ${barClass}"></div>
                        </div>
                        <div class="entry-time">${time}</div>
                    </div>
                `;
            } catch (_) {
                return '';
            }
        }).join('');

        const historyHtml = items || '<div class="no-history">Sem sinais de recuperação registrados</div>';

        // Preview pendente (quando Recuperar está ativo e já existe sinal liberado aguardando resultado)
        const normColor = (value) => {
            const raw = String(value || '').toLowerCase().trim();
            if (raw === 'red' || raw === 'vermelho') return 'red';
            if (raw === 'black' || raw === 'preto') return 'black';
            if (raw === 'white' || raw === 'branco') return 'white';
            return null;
        };
        const isDiamondAnalysis = (a) => {
            try {
                const desc = a && a.patternDescription ? String(a.patternDescription) : '';
                if (a && a.diamondSourceLevel) return true;
                return desc.includes('NÍVEL DIAMANTE') || desc.includes('5 Níveis');
            } catch (_) {
                return false;
            }
        };
        const resolveAnalysisMode = (a) => (isDiamondAnalysis(a) ? 'diamond' : 'standard');
        const stageLabelFrom = (a, ms) => {
            const s1 = a && a.phase ? String(a.phase).toUpperCase().trim() : '';
            if (s1 && s1.startsWith('G') && s1 !== 'G0') return s1;
            const s2 = ms && ms.stage ? String(ms.stage).toUpperCase().trim() : '';
            if (s2 && s2.startsWith('G') && s2 !== 'G0') return s2;
            return '';
        };
        const buildPendingIndicator = (analysis, martingaleState) => {
            try {
                if (!analysis || typeof analysis !== 'object') return '';
                if (!analysis.recoveryMode || analysis.hiddenInternal) return '';
                const aMode = resolveAnalysisMode(analysis);
                if (aMode !== currentMode) return '';
                const color = normColor(analysis.color);
                if (!color) return '';
                const galeLabel = stageLabelFrom(analysis, martingaleState);
                const galeAttr = galeLabel ? ` data-gale="${galeLabel}"` : '';
                const title = galeLabel ? `Recuperação • Aguardando resultado (${galeLabel})` : 'Recuperação • Aguardando resultado';
                return `
                    <div class="entry-item-wrap gale-active-indicator" title="${title}">
                        <div class="entry-conf-top gale-placeholder">&nbsp;</div>
                        <div class="entry-stage gale-placeholder">&nbsp;</div>
                        <div class="entry-item">
                            <div class="entry-box ${color} pending-ring"${galeAttr}></div>
                            <div class="entry-result-bar win" style="opacity:0;"></div>
                        </div>
                        <div class="entry-time gale-placeholder">&nbsp;</div>
                    </div>
                `;
            } catch (_) {
                return '';
            }
        };

        const applyListHtml = (pendingHtml) => {
            const pending = pendingHtml ? String(pendingHtml) : '';
            list.innerHTML = pending + historyHtml;
        };

        if (recoveryModeEnabled) {
            if (hasAnalysisOverride) {
                storageCompat.get(['martingaleState']).then((res = {}) => {
                    applyListHtml(buildPendingIndicator(analysisOverride, res.martingaleState));
                }).catch(() => {
                    applyListHtml(buildPendingIndicator(analysisOverride, null));
                });
            } else {
                storageCompat.get(['analysis', 'martingaleState']).then((res = {}) => {
                    applyListHtml(buildPendingIndicator(res.analysis, res.martingaleState));
                }).catch(() => {
                    applyListHtml('');
                });
            }
        } else {
            applyListHtml('');
        }

        const btn = document.getElementById('recoveryToggleBtn');
        if (btn) {
            btn.onclick = (event) => {
                try { event.preventDefault(); event.stopPropagation(); } catch (_) {}
                const next = !recoveryModeEnabled;
                recoveryModeEnabled = next;
                recoveryModeStatusText = next ? '' : 'Desativada';
                renderRecoveryPanel(recoveryEntriesSourceCache);
                try {
                    chrome.runtime.sendMessage({ action: 'SET_RECOVERY_MODE', enabled: next }, function() {});
                } catch (_) {}
            };
        }

        const clearBtn = document.getElementById('clearRecoveryBtn');
        if (clearBtn) {
            clearBtn.onclick = (event) => {
                try { event.preventDefault(); event.stopPropagation(); } catch (_) {}
                clearRecoveryEntriesHistory(currentMode);
            };
        }
    }

    function renderMasterEntriesPanel(entries) {
        // Master virou "Recuperação": não renderizar mais o histórico antigo de Sinal de entrada
        if (Array.isArray(entries)) {
            recoveryEntriesSourceCache = entries;
        }
        storageCompat.get(['recoveryMode']).then((res = {}) => {
            recoveryModeEnabled = !!(res.recoveryMode && res.recoveryMode.enabled);
            renderRecoveryPanel(recoveryEntriesSourceCache);
        }).catch(() => {
            renderRecoveryPanel(recoveryEntriesSourceCache);
        });
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
        // ✅ Aba "Apostas" removida (pedido): manter apenas IA / Recuperação / Gráfico
        if (tab === 'bets') {
            tab = 'entries';
        }
        if (tab !== 'master' && tab !== 'entries' && tab !== 'chart') {
            tab = 'entries';
        }
        activeEntriesTab = tab;
        const masterView = document.querySelector('.entries-view[data-view="master"]');
        const entriesView = document.querySelector('.entries-view[data-view="entries"]');
        const chartView = document.querySelector('.entries-view[data-view="chart"]');
        if (masterView) {
            masterView.hidden = tab !== 'master';
        }
        if (entriesView) {
            entriesView.hidden = tab !== 'entries';
        }
        if (chartView) {
            chartView.hidden = tab !== 'chart';
        }
        const hitEl = document.getElementById('entriesHit');
        const masterHitEl = document.getElementById('masterEntriesHit');
        if (hitEl) hitEl.style.display = tab === 'entries' ? 'inline-flex' : 'none';
        if (masterHitEl) masterHitEl.style.display = tab === 'master' ? 'inline-flex' : 'none';
        const entriesHeader = document.querySelector('.entries-header');
        if (entriesHeader) {
            entriesHeader.style.display = (tab === 'entries' || tab === 'master') ? 'flex' : 'none';
        }
        const tabsContainer = document.getElementById('entriesTabs');
        const scope = tabsContainer || document;
        scope.querySelectorAll('.entries-tab').forEach((button) => {
            button.classList.toggle('active', button.dataset.tab === tab);
        });

        // ✅ Vidro desfocado: sempre ativo na aba IA (entries), independente de ter histórico ou não.
        // ✅ Bolinha IA: sempre visível por cima do vidro (aba IA).
        try {
            const isIA = (tab === 'entries');
            bindIATestsToggle();
            applyIAVisibilityState();
            if (isIA) {
                bindIABootstrapButton();
                // Heurística: se já há cards na lista, ocultar o CTA ("Analisar histórico")
                let hasAny = false;
                try {
                    const list = document.getElementById('entriesList');
                    hasAny = !!(list && list.querySelector('.entry-item-wrap'));
                } catch (_) {}
                setIABootstrapHasHistory(hasAny);
                const showCta = !iaBootstrapBusy && !hasAny;
                setIABootstrapState(iaBootstrapBusy ? 'loading' : 'idle', showCta ? 'Analisar histórico' : '');
            }
        } catch (_) {}
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
        // ✅ Agora a aba Apostas acompanha os sinais da IA (fluxo principal):
        // mostrar TODOS os ciclos do modo ativo, sem depender de isMaster.
        const currentMode = document.querySelector('.ai-mode-toggle.active') ? 'diamond' : 'standard';
        const byMode = (Array.isArray(data) ? data : []).filter(r => r && (r.mode || 'standard') === currentMode);
        if (!byMode.length) {
            container.innerHTML = `<div class="bets-empty">Nenhuma aposta registrada ainda.</div>`;
            return;
        }
        const rows = byMode.map(renderBetHistoryRow).join('');
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
        // ✅ Aba "Apostas" removida (pedido): não exibir/gerenciar tab de apostas aqui.
        // Mantemos apenas um fallback defensivo caso algum estado antigo tente abrir "bets".
        if (activeEntriesTab === 'bets') {
            setEntriesTab('entries');
        }
    }
    
    // Clear entries history function
    function clearEntriesHistory() {
        chrome.storage.local.get(['entriesHistory'], function(result) {
            const allEntries = result.entriesHistory || [];

            // Detectar qual modo está ativo
            const aiModeToggle = document.querySelector('.ai-mode-toggle.active');
            const isDiamondMode = !!aiModeToggle;
            const currentMode = isDiamondMode ? 'diamond' : 'standard';

            console.log(`🗑️ Limpando ABA IA (modo ${currentMode.toUpperCase()}) via cutoff — sem afetar Sinais/Gráfico`);

            const now = Date.now();
            entriesClearCutoffByMode = {
                standard: Number(entriesClearCutoffByMode.standard) || 0,
                diamond: Number(entriesClearCutoffByMode.diamond) || 0
            };
            entriesClearCutoffByMode[currentMode] = now;

            try {
                chrome.storage.local.set({ [ENTRIES_CLEAR_CUTOFF_KEY]: entriesClearCutoffByMode }, function() {
                    console.log('✅ Cutoff salvo para aba IA:', entriesClearCutoffByMode);
                });
            } catch (_) {}

            // ✅ Pedido: após limpar, voltar e manter a bolinha/CTA até o usuário clicar em "Analisar histórico"
            try { setIABootstrapHoldActive(currentMode, true); } catch (_) {}
            try {
                iaBootstrapBusy = false;
                setIABootstrapState('idle', 'Analisar histórico');
            } catch (_) {}

            // ✅ Pedido: ao clicar em "Limpar" na IA, resetar o Painel (saldo/lucro/perdas).
            // O Painel é calculado via autoBetHistory + runtime (pendências), então zeramos ambos.
            try {
                if (autoBetHistoryStore && typeof autoBetHistoryStore.clear === 'function') {
                    autoBetHistoryStore.clear();
                }
            } catch (_) {}
            try {
                if (autoBetManager && typeof autoBetManager.resetRuntime === 'function') {
                    autoBetManager.resetRuntime();
                }
            } catch (_) {}

            // Re-renderizar IA com cutoff aplicado (Sinais/Gráfico continuam usando seu próprio cutoff)
            renderEntriesPanel(allEntries);

            // Atualizar card "Sinais de entrada" (Fase 2) e recomputar masterSignal do analysis atual
            // (agora a Fase 2 respeita o cutoff da IA).
            try { scheduleMasterSignalStatsRefresh(0); } catch (_) {}
            try { chrome.runtime.sendMessage({ action: 'RECOMPUTE_MASTER_SIGNAL', mode: currentMode }, function() {}); } catch (_) {}
        });
    }

        // Limpar histórico APENAS dos Sinais de entrada (modo ativo)
    function clearMasterEntriesHistory() {
        chrome.storage.local.get(['entriesHistory'], function(result) {
            const allEntries = result.entriesHistory || [];

            const aiModeToggle = document.querySelector('.ai-mode-toggle.active');
            const isDiamondMode = !!aiModeToggle;
            const currentMode = isDiamondMode ? 'diamond' : 'standard';

            console.log(`🗑️ Limpando ABA SINAIS (modo ${currentMode.toUpperCase()}) via cutoff — mantendo histórico da IA`);

            // 1) Setar cutoff por modo (não apagar entriesHistory)
            const now = Date.now();
            masterEntriesClearCutoffByMode = {
                standard: Number(masterEntriesClearCutoffByMode.standard) || 0,
                diamond: Number(masterEntriesClearCutoffByMode.diamond) || 0
            };
            masterEntriesClearCutoffByMode[currentMode] = now;

            try {
                chrome.storage.local.set({ [MASTER_CLEAR_CUTOFF_KEY]: masterEntriesClearCutoffByMode }, function() {
                    console.log('✅ Cutoff salvo para aba Sinais/Gráfico:', masterEntriesClearCutoffByMode);
                });
            } catch (_) {}

            // 📌 Registrar evento de "Limpar" no servidor (admin acompanhar) — este é o "Limpar" de Sinais/Gráfico.
            // (não bloquear UX; silencioso)
            try { postSignalPanelClearEventToServer(currentMode); } catch (_) {}

            // 2) Resetar autoBet (mestre-only) e limpar histórico de apostas (mestre-only)
            try {
                if (autoBetManager && typeof autoBetManager.resetRuntime === 'function') {
                    autoBetManager.resetRuntime();
                }
            } catch (err) {
                console.warn('⚠️ Falha ao resetar autoBetRuntime após limpar Sinais:', err);
            }

            try {
                if (autoBetHistoryStore && typeof autoBetHistoryStore.clear === 'function') {
                    autoBetHistoryStore.clear();
                    renderAutoBetHistoryPanel([]);
                }
            } catch (_) {}

            // 3) Re-renderizar UI mantendo entriesHistory intacto (IA não pode ser afetada)
            try { renderEntriesPanel(allEntries); } catch (_) {}
            try { scheduleMasterSignalStatsRefresh(0); } catch (_) {}
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
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // 🪟 SISTEMA DE JANELAS FLUTUANTES (Modais Desktop)
    // ═══════════════════════════════════════════════════════════════════════════════
    
    const floatingWindows = {
        windows: [],
        
        register(windowId) {
            if (!this.windows.includes(windowId)) {
                this.windows.push(windowId);
                this.repositionAll();
                console.log('🪟 Janela registrada:', windowId, '| Total:', this.windows.length);
            }
        },
        
        unregister(windowId) {
            const index = this.windows.indexOf(windowId);
            if (index > -1) {
                this.windows.splice(index, 1);
                console.log('🪟 Janela removida:', windowId, '| Total:', this.windows.length);
                
                if (this.windows.length > 0) {
                    // Ainda há janelas abertas → manter layout em colunas
                    this.repositionAll();
                } else {
                    // Nenhuma janela aberta → restaurar posição/ tamanho original da sidebar
                    const sidebar = document.getElementById('blaze-double-analyzer');
                    if (sidebar && sidebar.classList.contains('compact-mode')) {
                        try {
                            loadSidebarState(sidebar);
                        } catch (e) {
                            console.warn('⚠️ Erro ao restaurar estado da sidebar após fechar janelas flutuantes:', e);
                        }
                    }
                }
            }
        },
        
        repositionAll() {
            if (!isDesktop() || this.windows.length === 0) return;
            
            const sidebar = document.getElementById('blaze-double-analyzer');
            if (!sidebar) return;

            // Em modo tela cheia o painel ocupa toda a largura da tela.
            // Não há espaço lateral para janelas; nesse caso, deixamos os modais
            // se comportarem como antes (ocupando a própria tela) e não reposicionamos.
            if (sidebar.classList.contains('fullscreen-mode')) {
                return;
            }
            
            // Pegar dimensões atuais da sidebar
            const sidebarRect = sidebar.getBoundingClientRect();
            const sidebarHeight = sidebarRect.height;
            const sidebarTop = sidebarRect.top;
            
            // Total de colunas (sidebar + janelas flutuantes)
            const totalColumns = 1 + this.windows.length;
            const gap = 12;   // espaço entre colunas
            const margin = 20; // margem lateral
            
            const totalAvailable = window.innerWidth - (margin * 2);
            let columnWidth = (totalAvailable - ((totalColumns - 1) * gap)) / totalColumns;
            const minWidth = 320;
            
            if (columnWidth < minWidth) {
                columnWidth = Math.max(minWidth, totalAvailable / totalColumns);
            }
            
            const getLeftForIndex = (index) => margin + index * (columnWidth + gap);
            
            // Posicionar a própria sidebar como primeira coluna
            sidebar.style.position = 'fixed';
            sidebar.style.left = getLeftForIndex(0) + 'px';
            sidebar.style.top = sidebarTop + 'px';
            sidebar.style.width = columnWidth + 'px';
            sidebar.style.height = sidebarHeight + 'px';
            
            // Posicionar cada janela flutuante nas colunas seguintes
            this.windows.forEach((windowId, index) => {
                const modal = document.getElementById(windowId);
                if (!modal) return;
                
                const content = modal.querySelector('[class*="modal-content"]');
                if (!content) return;
                
                const leftPosition = getLeftForIndex(index + 1);
                
                content.style.position = 'fixed';
                content.style.left = leftPosition + 'px';
                content.style.top = sidebarTop + 'px';
                content.style.width = columnWidth + 'px';
                content.style.height = sidebarHeight + 'px';
                content.style.maxWidth = 'none';
                content.style.maxHeight = 'none';
                content.style.transform = 'none';
                content.style.margin = '0';
                
                console.log(`🪟 Janela ${index + 1}/${this.windows.length}:`, {
                    id: windowId,
                    left: leftPosition,
                    width: columnWidth
                });
            });
        }
    };
    
    // Atualizar posições quando redimensionar janela
    window.addEventListener('resize', () => {
        if (isDesktop()) {
            floatingWindows.repositionAll();
        }
    });
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // 🖥️ MODO TELA CHEIA vs MODO COMPACTO (Desktop apenas)
    // ═══════════════════════════════════════════════════════════════════════════════
    
    function isDesktop() {
        return window.innerWidth > 768;
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // 🖥️ NOVO LAYOUT DESKTOP (Dashboard)
    // - Substitui "modo compacto" e "tela cheia" no desktop
    // - Sidebar de configurações fixa à esquerda
    // - Cards à direita, com expansão por seção (mantendo sidebar fixa)
    // ═══════════════════════════════════════════════════════════════════════════════
    function applyDesktopDashboardLayout(sidebar) {
        if (!sidebar || !isDesktop()) return;

        // Marcar modo desktop
        sidebar.classList.add('da-desktop-dashboard');
        // Garantir que os modos antigos não "vazem" estilos
        sidebar.classList.remove('compact-mode');
        sidebar.classList.remove('fullscreen-mode');

        // Forçar fullscreen do container no desktop (inclusive na versão web, que usa !important no index.html)
        try {
            sidebar.style.setProperty('position', 'fixed', 'important');
            sidebar.style.setProperty('inset', '0', 'important');
            sidebar.style.setProperty('top', '0', 'important');
            sidebar.style.setProperty('left', '0', 'important');
            sidebar.style.setProperty('right', '0', 'important');
            sidebar.style.setProperty('bottom', '0', 'important');
            sidebar.style.setProperty('width', '100%', 'important');
            sidebar.style.setProperty('height', '100%', 'important');
            sidebar.style.setProperty('max-width', '100%', 'important');
            sidebar.style.setProperty('max-height', '100%', 'important');
        } catch (_) {}

        // Evitar scroll da página "por trás"
        try {
            document.documentElement.style.overflow = 'hidden';
            document.body.style.overflow = 'hidden';
        } catch (_) {}

        // Criar shell (idempotente)
        let shell = sidebar.querySelector('.da-desktop-shell');
        let settingsSidebar = sidebar.querySelector('.da-desktop-sidebar');
        let settingsScroll = sidebar.querySelector('.da-desktop-sidebar-scroll');
        let main = sidebar.querySelector('.da-desktop-main');

        if (!shell) {
            shell = document.createElement('div');
            shell.className = 'da-desktop-shell';

            settingsSidebar = document.createElement('aside');
            settingsSidebar.className = 'da-desktop-sidebar';

            settingsScroll = document.createElement('div');
            settingsScroll.className = 'da-desktop-sidebar-scroll';

            main = document.createElement('main');
            main.className = 'da-desktop-main';

            settingsSidebar.appendChild(settingsScroll);
            shell.appendChild(settingsSidebar);
            shell.appendChild(main);

            const header = sidebar.querySelector('.da-header');
            if (header && header.parentNode === sidebar) {
                header.insertAdjacentElement('afterend', shell);
            } else {
                sidebar.appendChild(shell);
            }
        }

        // Esconder handles de resize (dashboard não é redimensionável)
        const resizeHandles = sidebar.querySelector('.resize-handles');
        if (resizeHandles) {
            resizeHandles.style.display = 'none';
        }

        // Mover elementos existentes para o layout novo
        const analyzerContent = sidebar.querySelector('#analyzerContent');
        if (analyzerContent && main && analyzerContent.parentNode !== main) {
            main.appendChild(analyzerContent);
        }

        // ✅ Desktop: renomear card "Sinais de entrada" (onde ficam os dados do print) para "Recuperação segura"
        // e remover/ocultar UI do "Sistema híbrido" (não usado).
        try {
            const h = sidebar.querySelector('.observer-section > h4');
            if (h) h.textContent = 'Recuperação segura';
        } catch (_) {}
        try {
            const hybrid = sidebar.querySelector('#observerHybrid');
            if (hybrid) hybrid.style.display = 'none';
        } catch (_) {}

        const userMenuPanel = sidebar.querySelector('#userMenuPanel');
        if (userMenuPanel && settingsScroll && userMenuPanel.parentNode !== settingsScroll) {
            // 🖥️ Desktop: "Minha conta" fica na coluna esquerda, mas fechada por padrão (accordion)
            settingsScroll.appendChild(userMenuPanel);
        }

        // 🧾 Ações fixas da sidebar (ex.: Modo Aposta) devem ficar FORA da caixa "Minha conta"
        try {
            if (settingsScroll) {
                let actions = sidebar.querySelector('.da-desktop-sidebar-actions');
                if (!actions) {
                    actions = document.createElement('div');
                    actions.className = 'da-desktop-sidebar-actions';
                    // colocar logo após "Minha conta" (ou no topo, se ainda não estiver)
                    if (userMenuPanel && userMenuPanel.parentNode === settingsScroll) {
                        userMenuPanel.insertAdjacentElement('afterend', actions);
                    } else {
                        settingsScroll.insertAdjacentElement('afterbegin', actions);
                    }
                }

                // ✅ Pedido: mover o botão "Ativar análise" para a coluna esquerda,
                // acima de todas as configurações (sem alterar lógica do toggle).
                const analyzerToggleBtn = sidebar.querySelector('#toggleAnalyzerBtn');
                if (analyzerToggleBtn && analyzerToggleBtn.parentNode !== actions) {
                    // Inserir no topo (acima do botão "Modo Aposta")
                    actions.insertAdjacentElement('afterbegin', analyzerToggleBtn);
                }

                // ✅ Pedido: mover "Sincronizar configurações" para fora e deixar de fácil acesso (igual Análise ativa)
                const syncWrap = sidebar.querySelector('#syncConfigToggleWrap');
                if (syncWrap && syncWrap.parentNode !== actions) {
                    // Colocar logo após o botão "Análise ativa"
                    if (analyzerToggleBtn && analyzerToggleBtn.parentNode === actions) {
                        analyzerToggleBtn.insertAdjacentElement('afterend', syncWrap);
                    } else {
                        actions.insertAdjacentElement('afterbegin', syncWrap);
                    }
                }

                const betBtn = sidebar.querySelector('#betModeToggleBtn');
                const betWrapper = betBtn && betBtn.closest ? betBtn.closest('.user-info-item') : null;
                if (betWrapper && betWrapper.parentNode !== actions) {
                    actions.appendChild(betWrapper);
                }
            }
        } catch (_) {}

        const autoBetModal = sidebar.querySelector('#autoBetModal');
        if (autoBetModal && settingsScroll && autoBetModal.parentNode !== settingsScroll) {
            // No desktop, as configurações ficam sempre visíveis na sidebar da esquerda
            autoBetModal.style.display = 'block';
            settingsScroll.appendChild(autoBetModal);
        }

        // Inicializar colapsáveis da sidebar (Minha conta fechada por padrão)
        initDesktopSidebarSettings(sidebar);

        // Inicializar cards/expansão (idempotente)
        initDesktopDashboardCards(sidebar);
    }

    function initDesktopDashboardCards(root) {
        if (!root || !isDesktop()) return;
        const analyzerDefaultView = root.querySelector('#analyzerDefaultView');
        if (!analyzerDefaultView) return;

        // ✅ Idempotente: o DOM pode sobreviver a reloads (classes/data-attrs ficam),
        // mas os event listeners não. Então:
        // - sempre re-registra cards (sem duplicar botões)
        // - garante que o listener do clique esteja bound apenas 1x
        if (root.dataset.daCardsInitialized !== '1') {
            root.dataset.daCardsInitialized = '1';
        }

        const registerCard = (el, cardId, options = {}) => {
            if (!el) return;
            el.classList.add('da-card');
            el.dataset.daCard = cardId;
            const expandable = options && options.expandable === false ? false : true;
            el.dataset.daExpandable = expandable ? '1' : '0';

            // Remover botão se não deve expandir
            const existingBtn = el.querySelector('.da-card-expand');
            if (!expandable) {
                if (existingBtn) {
                    try { existingBtn.remove(); } catch (_) {}
                }
                return;
            }

            // ✅ Importante: se já existe um botão (DOM persistiu), garantir que ele
            // aponte para o card correto. Isso evita bugs tipo: clicar no fullscreen do
            // "Histórico de Giros" e expandir "Padrão" por causa de data-daExpand antigo.
            if (existingBtn) {
                try {
                    existingBtn.dataset.daExpand = cardId;
                    existingBtn.setAttribute('aria-label', 'Expandir/Recolher');
                    existingBtn.setAttribute('title', 'Expandir');
                } catch (_) {}
            }

            if (!existingBtn) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'da-card-expand';
                btn.setAttribute('aria-label', 'Expandir/Recolher');
                btn.setAttribute('title', 'Expandir');
                btn.dataset.daExpand = cardId;
                btn.innerHTML = `
                    <svg class="da-icon da-icon-expand" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm0-4h2V7h3V5H5v5zm14 9h-5v-2h3v-3h2v5zm-5-14h5v5h-2V7h-3V5z"/>
                    </svg>
                    <svg class="da-icon da-icon-collapse" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="currentColor" d="M7 9h2V7h3V5H5v7h2V9zm12 0v3h-3v2h5V5h-7v2h3v2h2zm-7 10v-2H9v-3H7v7h7v-2h-2zm2-3h3v3h2v-7h-7v2h2v2z"/>
                    </svg>
                `;
                el.appendChild(btn);
            }
        };

        // Mapear cards do painel atual (abas/seções existentes)
        // ❌ Sem ícone de expandir: Painel (saldo), Aguardando sinal, Último giro, Sinais de entrada
        registerCard(root.querySelector('#autoBetSummary'), 'panel', { expandable: false });
        registerCard(root.querySelector('#analyzerDefaultView .analysis-section'), 'analysis', { expandable: false });
        registerCard(root.querySelector('#analyzerDefaultView .last-spin-section'), 'lastspin', { expandable: false });
        // ❌ Sem ícone extra de expandir aqui: a aba IA já tem o expand interno (vidro/IA).
        registerCard(root.querySelector('#analyzerDefaultView .entries-section'), 'entries', { expandable: false });
        registerCard(root.querySelector('#analyzerDefaultView .pattern-section'), 'pattern');
        // ❌ Banco de padrões não precisa de "tela cheia" (pedido do usuário)
        registerCard(root.querySelector('#analyzerDefaultView .pattern-bank-section'), 'bank', { expandable: false });
        registerCard(root.querySelector('#analyzerDefaultView .observer-section'), 'observer', { expandable: false });
        registerCard(root.querySelector('#analyzerDefaultView .stats-section'), 'history');

        const isInteractiveTarget = (target) => {
            if (!target || !(target instanceof Element)) return false;
            const selector = 'button, a, input, select, textarea, label, [role="button"], [contenteditable="true"], .clickable-entry, .entries-tab, .spin-history-item';
            return !!target.closest(selector);
        };

        // Delegação: clique no card (área vazia) ou no botão de expandir
        if (root.dataset.daCardsClickBound !== '1') {
            root.dataset.daCardsClickBound = '1';
            root.addEventListener('click', (event) => {
                const btn = event.target && event.target.closest ? event.target.closest('.da-card-expand') : null;
                if (btn) {
                    event.preventDefault();
                    const cardId = btn.dataset.daExpand;
                    const current = root.dataset.daExpanded || '';
                    setDesktopExpandedCard(root, current === cardId ? '' : cardId);
                    return;
                }

                const card = event.target && event.target.closest ? event.target.closest('.da-card[data-da-card]') : null;
                if (!card) return;
                if (card.dataset.daExpandable === '0') return;
                if (isInteractiveTarget(event.target)) return;

                // Evitar conflitos com cliques dentro do conteúdo (ex.: lista de entradas).
                // Só permitir expandir ao clicar no "topo" do card (faixa do título).
                try {
                    const rect = card.getBoundingClientRect();
                    const y = (event.clientY || 0) - rect.top;
                    if (y > 64) return;
                } catch (_) {}

                const cardId = card.dataset.daCard || '';
                if (!cardId) return;
                const current = root.dataset.daExpanded || '';
                if (current && current !== cardId) return; // já está expandido em outro card

                setDesktopExpandedCard(root, current === cardId ? '' : cardId);
            });
        }
    }

    function initDesktopSidebarSettings(root) {
        if (!root || !isDesktop()) return;
        if (root.dataset.daSidebarSettingsInitialized === '1') return;
        root.dataset.daSidebarSettingsInitialized = '1';

        const userMenuPanel = root.querySelector('#userMenuPanel');
        if (userMenuPanel) {
            userMenuPanel.classList.add('da-settings-account');

            // ✅ Por padrão: fechado
            let shouldOpen = false;
            try {
                const saved = localStorage.getItem('daDesktopAccountOpen');
                shouldOpen = saved === '1';
            } catch (_) {}

            userMenuPanel.classList.toggle('da-collapsed', !shouldOpen);

            const header = userMenuPanel.querySelector('.user-menu-header');
            if (header && header.dataset.daToggleBound !== '1') {
                header.dataset.daToggleBound = '1';
                header.addEventListener('click', (event) => {
                    try {
                        // Não colapsar se clicou em algo interativo dentro do header
                        const t = event && event.target;
                        if (t && t.closest && t.closest('button, a, input, select, textarea')) {
                            return;
                        }
                    } catch (_) {}

                    const isCollapsed = userMenuPanel.classList.toggle('da-collapsed');
                    try {
                        localStorage.setItem('daDesktopAccountOpen', isCollapsed ? '0' : '1');
                    } catch (_) {}
                });
            }
        }
    }

    function setDesktopExpandedCard(root, cardIdRaw) {
        if (!root) return;
        const cardId = String(cardIdRaw || '').trim();

        if (!cardId) {
            delete root.dataset.daExpanded;
            root.classList.remove('da-dashboard-expanded');
            const expandedCards = root.querySelectorAll('.da-card.da-card-is-expanded');
            expandedCards.forEach(c => c.classList.remove('da-card-is-expanded'));
            return;
        }

        root.dataset.daExpanded = cardId;
        root.classList.add('da-dashboard-expanded');
        const cards = root.querySelectorAll('.da-card[data-da-card]');
        cards.forEach((c) => c.classList.toggle('da-card-is-expanded', c.dataset.daCard === cardId));

        // Garantir foco/scroll no card expandido
        const active = root.querySelector(`.da-card[data-da-card="${cardId}"]`);
        if (active) {
            try {
                active.scrollIntoView({ block: 'start', behavior: 'smooth' });
            } catch (_) {}
        }

        // ✅ Histório de Giros: ao entrar em fullscreen, preencher a área automaticamente
        if (cardId === 'history') {
            try {
                setTimeout(() => {
                    try { bindHistoryLoadMoreIndicator(); } catch (_) {}
                    try { ensureHistoryFullscreenFillsSpace(); } catch (_) {}
                }, 60);
            } catch (_) {}
        }
    }

    function dockModalToDesktopWorkspace(modalEl) {
        try {
            const container = document.getElementById('blaze-double-analyzer');
            if (!isDesktop() || !container || !container.classList.contains('da-desktop-dashboard')) {
                return false;
            }
            const main = container.querySelector('.da-desktop-main');
            if (!main || !modalEl) return false;
            if (modalEl.parentNode !== main) {
                main.appendChild(modalEl);
            }
            modalEl.classList.add('da-docked-modal');
            return true;
        } catch (_) {
            return false;
        }
    }
    
    function getViewMode() {
        try {
            const saved = localStorage.getItem('sidebarViewMode');
            return saved || 'fullscreen'; // Padrão: tela cheia
        } catch (e) {
            return 'fullscreen';
        }
    }
    
    function setViewMode(mode) {
        try {
            localStorage.setItem('sidebarViewMode', mode);
        } catch (e) {
            console.error('Erro ao salvar modo de visualização:', e);
        }
    }
    
    // ========= MODO DE EXIBIÇÃO (COMPLETO x APOSTA) =========
    function getDisplayMode() {
        try {
            const saved = localStorage.getItem('sidebarDisplayMode');
            return saved === 'bet' ? 'bet' : 'default';
        } catch (e) {
            return 'default';
        }
    }
    
    function setDisplayMode(mode) {
        try {
            localStorage.setItem('sidebarDisplayMode', mode === 'bet' ? 'bet' : 'default');
        } catch (e) {
            console.error('Erro ao salvar modo de exibição (aposta):', e);
        }
    }
    
    function syncBetModeView() {
        const suggestionBox = document.getElementById('suggestionBox');
        const colorSource = document.getElementById('suggestionColor');
        const suggestionTarget = document.getElementById('betModeSuggestion');
        if (suggestionTarget) {
            // Mantém a classe fixa do container no modo aposta
            suggestionTarget.className = 'bet-mode-suggestion';
            suggestionTarget.innerHTML = '';
            const hasValidColor = colorSource && (
                colorSource.classList.contains('red') ||
                colorSource.classList.contains('black') ||
                colorSource.classList.contains('white')
            );
            if (hasValidColor) {
                // Clona apenas o quadrado de cor, removendo qualquer texto como "Cor indicada"
                const cloned = colorSource.cloneNode(true);
                cloned.id = 'betModeSuggestionColor';
                suggestionTarget.appendChild(cloned);
            } else {
                // Sem cor válida → não exibir nada
                suggestionTarget.innerHTML = '';
            }
            // Preserva o title apenas como tooltip, se existir
            if (suggestionBox) {
                const title = suggestionBox.getAttribute('title') || '';
                if (title) suggestionTarget.setAttribute('title', title);
                else suggestionTarget.removeAttribute('title');
            } else {
                suggestionTarget.removeAttribute('title');
            }
        }
        
        const lastSpinSource = document.getElementById('lastSpinNumber');
        const lastSpinTarget = document.getElementById('betModeLastSpinNumber');
        if (lastSpinSource && lastSpinTarget) {
            lastSpinTarget.className = lastSpinSource.className;
            lastSpinTarget.innerHTML = lastSpinSource.innerHTML;
        }
        
        const lastSpinTimeSource = document.getElementById('lastSpinTime');
        const lastSpinTimeTarget = document.getElementById('betModeLastSpinTime');
        if (lastSpinTimeSource && lastSpinTimeTarget) {
            lastSpinTimeTarget.textContent = lastSpinTimeSource.textContent || '';
        }
        
        // Sincronizar barra de confiança (porcentagem)
        const srcFill = document.getElementById('confidenceFill');
        const srcText = document.getElementById('confidenceText');
        const dstFill = document.getElementById('betModeConfidenceFill');
        const dstText = document.getElementById('betModeConfidenceText');
        if (srcFill && dstFill) {
            dstFill.style.width = srcFill.style.width || '0%';
        }
        if (srcText && dstText) {
            dstText.textContent = srcText.textContent || '0%';
        }
    }
    
    function applyDisplayMode(mode) {
        const defaultView = document.getElementById('analyzerDefaultView');
        const betView = document.getElementById('betModeView');
        const betLabel = document.getElementById('betViewLabel');
        const sidebar = document.getElementById('blaze-double-analyzer');
        const aiToggle = document.getElementById('aiModeToggle');
        if (!defaultView || !betView) return;
        
        const isBet = mode === 'bet';
        
        defaultView.style.display = isBet ? 'none' : '';
        betView.style.display = isBet ? 'flex' : 'none';
        
        if (sidebar) {
            if (isBet) {
                sidebar.classList.add('bet-display-mode');
            } else {
                sidebar.classList.remove('bet-display-mode');
            }
        }
        
        if (isBet) {
            syncBetModeView();
        }

        // 🖥️ Desktop (Dashboard novo): ao alternar modo (aposta/completo), sempre sair de qualquer card expandido
        try {
            if (sidebar && sidebar.classList && sidebar.classList.contains('da-desktop-dashboard')) {
                setDesktopExpandedCard(sidebar, '');
            }
        } catch (_) {}
        
        // Label SEMPRE mostra o modo para o qual o usuário vai mudar ao clicar
        if (betLabel) {
            betLabel.textContent = isBet ? 'Modo Completo' : 'Modo Aposta';
        }
        
        // Atualizar cabeçalho (texto do modo) de acordo com o display
        if (aiToggle) {
            const isActive = aiToggle.classList.contains('active');
            updateAIModeUI(aiToggle, isActive);
        }
    }
    
    function applyFullscreenMode(sidebar) {
        if (!sidebar || !isDesktop()) return;
        
        sidebar.classList.add('fullscreen-mode');
        sidebar.classList.remove('compact-mode');

        // Permite CSS de modais fullscreen mesmo quando o modal é anexado no <body>
        try {
            document.body.classList.add('da-ext-fullscreen');
        } catch (e) {
            // noop
        }
        
        // Tela cheia: ocupar 100% da área útil da janela, sem bordas
        sidebar.style.left = '0px';
        sidebar.style.top = '0px';
        sidebar.style.right = '0px';
        sidebar.style.bottom = '0px';
        sidebar.style.width = '100%';
        sidebar.style.height = '100%';

        // Remover scroll da página para evitar faixa da barra de rolagem na direita
        try {
            document.documentElement.style.overflow = 'hidden';
            document.body.style.overflow = 'hidden';
        } catch (e) {
            console.warn('Não foi possível bloquear o scroll da página em tela cheia:', e);
        }
        
        console.log('✅ Modo Tela Cheia ativado');
    }
    
    function applyCompactMode(sidebar) {
        if (!sidebar || !isDesktop()) return;
        
        sidebar.classList.add('compact-mode');
        sidebar.classList.remove('fullscreen-mode');

        // Remover flag usada para modais fullscreen
        try {
            document.body.classList.remove('da-ext-fullscreen');
        } catch (e) {
            // noop
        }

        // Restaurar comportamento padrão de scroll da página
        try {
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';
        } catch (e) {
            console.warn('Não foi possível restaurar o scroll da página ao sair de tela cheia:', e);
        }
        
        // Modo compacto: restaurar tamanho/posição salva ou padrão
        const saved = localStorage.getItem('blazeSidebarState');
        let width = 300;
        let height = 600;
        
        if (saved) {
            const state = JSON.parse(saved);
            width = state.width || 300;
            height = state.height || 600;
        }
        
        // Centralizar
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const left = (windowWidth - width) / 2;
        const top = (windowHeight - height) / 2;
        
        sidebar.style.left = Math.max(0, left) + 'px';
        sidebar.style.top = Math.max(0, top) + 'px';
        sidebar.style.width = width + 'px';
        sidebar.style.height = height + 'px';
        
        console.log('✅ Modo Compacto ativado');
    }
    
    function toggleViewMode(sidebar, labelElement) {
        if (!sidebar || !isDesktop()) return;
        
        const currentMode = getViewMode();
        const newMode = currentMode === 'fullscreen' ? 'compact' : 'fullscreen';
        
        setViewMode(newMode);
        
        if (newMode === 'fullscreen') {
            applyFullscreenMode(sidebar);
            if (labelElement) labelElement.textContent = 'Modo Compacto';
        } else {
            applyCompactMode(sidebar);
            if (labelElement) labelElement.textContent = 'Tela Cheia';
        }
    }
    
    // Load saved sidebar state
    function loadSidebarState(sidebar) {
        try {
            if (!isDesktop()) {
                // Mobile: manter comportamento atual
                return;
            }

            // ✅ DESKTOP (NOVO): sempre usar o layout Dashboard (sidebar fixa + cards)
            applyDesktopDashboardLayout(sidebar);
            console.log('📍 Layout Desktop (Dashboard) aplicado');
        } catch (e) {
            console.error('Erro ao carregar estado da sidebar:', e);
        }
    }
    
    // Save sidebar state (apenas para modo compacto)
    function saveSidebarState(sidebar) {
        try {
            // Só salvar se estiver em modo compacto
            if (sidebar.classList.contains('compact-mode')) {
                const state = {
                    left: parseInt(sidebar.style.left) || 0,
                    top: parseInt(sidebar.style.top) || 0,
                    width: parseInt(sidebar.style.width) || 300,
                    height: parseInt(sidebar.style.height) || 600
                };
                localStorage.setItem('blazeSidebarState', JSON.stringify(state));
            }
        } catch (e) {
            console.error('Erro ao salvar estado da sidebar:', e);
        }
    }
    
    // REMOVER função antiga loadSidebarState (já substituída acima)
    /*
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
    */
    
    // Make sidebar draggable
    function makeDraggable(element) {
        const header = element.querySelector('.da-header');
        if (!header) {
            console.warn('⚠️ makeDraggable: header não encontrado');
            return;
        }
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
                
                // ✅ LIMITES: impedir que a sidebar saia totalmente da tela
                const rect = element.getBoundingClientRect();
                const width = rect.width;
                const height = rect.height;
                const maxLeft = window.innerWidth - 80; // deixa no mínimo ~80px visíveis quando arrastado para a direita
                const minLeft = Math.min(0, window.innerWidth - width); // não deixar passar além da borda esquerda
                const maxTop = window.innerHeight - 80; // não colar fora da parte de baixo
                const minTop = 0; // topo não passa para cima da viewport
                
                // Aplicar limites
                if (currentX < minLeft) currentX = minLeft;
                if (currentX > maxLeft) currentX = maxLeft;
                if (currentY < minTop) currentY = minTop;
                if (currentY > maxTop) currentY = maxTop;
                
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
    originalConsoleLog(`%c   • Proteção no Branco: ${snapshot.whiteProtectionAsWin ? 'Ativa' : 'Desativada'}`, `color: ${headerColor};`);

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
        pushChange('Proteção no Branco', prev.whiteProtectionAsWin, snapshot.whiteProtectionAsWin, v => v ? 'Ativa' : 'Desativada');

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
            // ✅ Modo atual é global (por conta) e deve refletir o toggle real da UI (AI ON/OFF)
            const tabMode = document.querySelector('.ai-mode-toggle.active') ? 'diamond' : 'standard';

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
            
            const analysisPayload = request.data || null;
            const isHiddenInternal = !!(analysisPayload && analysisPayload.hiddenInternal);
            const effectiveMode = (messageMode === 'diamond' || messageMode === 'standard') ? messageMode : tabMode;

            // ✅ IA VIVA: se a bolinha está em HOLD (após "Limpar") e chegou um sinal visível,
            // então devemos DESLIGAR o HOLD automaticamente:
            // - bolinha some
            // - histórico passa a registrar/exibir normalmente (o resultado não "some" depois)
            try {
                if (!isHiddenInternal && analysisPayload) {
                    if (isIABootstrapHoldActive(effectiveMode)) {
                        setIABootstrapHoldActive(effectiveMode, false);
                        // Forçar reavaliação imediata do overlay (sem esperar ENTRIES_UPDATE)
                        try { applyIAVisibilityState(iaBootstrapLastEntriesCount, 'pending'); } catch (_) {}
                    }
                }
            } catch (_) {}

            updateSidebar({
                analysis: analysisPayload,
                pattern: {
                    description: analysisPayload ? analysisPayload.patternDescription : null,
                    last5Spins: analysisPayload ? analysisPayload.last5Spins : null // ✅ PASSAR DIRETAMENTE
                }
            });

            // ✅ Recuperação segura: sinais internos (hiddenInternal) não podem acionar auto-bet nem "vazar" para UI normal.
            if (!isHiddenInternal && autoBetManager && typeof autoBetManager.handleAnalysis === 'function') {
                autoBetManager.handleAnalysis(analysisPayload);
            }

            // ✅ Atualizar card dos Sinais de entrada (pode mudar status/contador)
            if (!isHiddenInternal) {
                try { scheduleMasterSignalStatsRefresh(); } catch (_) {}
            } else {
                // Mesmo oculto, se for sinal de recuperação (recoveryMode=true), garantir refresh do painel.
                try { renderRecoveryPanel(); } catch (_) {}
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
        } else if (request.type === 'ANALYZER_CONFIG_UPDATED') {
            try {
                const cfg = request.analyzerConfig || {};
                populateDiamondLevelsForm(cfg);
                refreshDiamondLevelToggleStates();
                showSyncSpinner();
            } catch (err) {
                console.warn('⚠️ Erro ao aplicar config sincronizada (ANALYZER_CONFIG_UPDATED):', err);
            }
        } else if (request.type === 'AI_MODE_BLOCKED_PROFILE') {
            try {
                const missing = (request.data && Array.isArray(request.data.missing)) ? request.data.missing : (request.missing || []);
                const aiToggle = document.getElementById('aiModeToggle');
                if (aiToggle) {
                    updateAIModeUI(aiToggle, false);
                }
                toggleAIConfigFields(false);
                showCenteredNotice(buildProfileIncompleteMessage(missing), {
                    title: 'Cadastro incompleto',
                    autoHide: 0
                });
            } catch (err) {
                console.warn('⚠️ Falha ao processar AI_MODE_BLOCKED_PROFILE:', err);
            }
        } else if (request.type === 'CLEAR_ANALYSIS') {
            // ✅ LIMPAR STATUS DE ANÁLISE E FORÇAR RESET COMPLETO DA UI
            currentAnalysisStatus = 'Aguardando análise...';
            updateSidebar({ analysis: null, pattern: null });
            renderSafeZoneStatus(null);

            // ✅ Fix de corrida (G1/G2): em alguns fluxos o background envia CLEAR_ANALYSIS
            // antes de o `martingaleState` atualizado estar disponível no storage.
            // Re-checar rapidamente e re-renderizar o topo (Aguardando sinal) com o estágio correto.
            try {
                setTimeout(() => {
                    try {
                        storageCompat.get(['martingaleState']).then((res = {}) => {
                            const ms = res.martingaleState;
                            if (ms && ms.active) {
                                updateSidebar({ analysis: null, martingaleState: ms });
                            }
                        }).catch(() => {});
                    } catch (_) {}
                }, 120);
            } catch (_) {}
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
            // (Fase 2 removida do fluxo principal)
        } else if (request.type === 'RECOVERY_MODE_UPDATE') {
            // ✅ Atualização do modo Recuperação (ativação manual)
            try {
                const data = request.data || {};
                if (typeof data.enabled === 'boolean') {
                    recoveryModeEnabled = !!data.enabled;
                }
                if (typeof data.statusText === 'string') {
                    recoveryModeStatusText = data.statusText;
                } else if (typeof data.state === 'string') {
                    // fallback simples
                    recoveryModeStatusText = data.state;
                }
                try { renderRecoveryPanel(); } catch (_) {}
            } catch (err) {
                console.warn('⚠️ Falha ao processar RECOVERY_MODE_UPDATE:', err);
            }
        } else if (request.type === 'OBSERVER_UPDATE') {
            // ✅ Compat: OBSERVER_UPDATE antigo pode continuar chegando.
            // O card agora mostra dados do SINAL DE ENTRADA, então fazemos refresh via action dedicada.
            try { scheduleMasterSignalStatsRefresh(); } catch (_) {}
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
        } else if (request.type === 'DIAMOND_SIMULATION_PROGRESS') {
            updateDiamondSimulationProgress(request.data || {});
        } else if (request.type === 'DIAMOND_SIMULATION_CANCELLED') {
            const cancelledJobId = request.data && request.data.jobId ? request.data.jobId : null;
            if (cancelledJobId && diamondSimulationJobId && cancelledJobId !== diamondSimulationJobId) {
                return;
            }
            setDiamondSimulationLoading(false);
            diamondSimulationJobId = null;
            const summary = document.getElementById('diamondSimulationSummary');
            if (summary) summary.innerHTML = '⏹️ Simulação cancelada.';
        } else if (request.type === 'DIAMOND_OPTIMIZATION_PROGRESS') {
            updateDiamondOptimizationProgress(request.data || {});
        } else if (request.type === 'DIAMOND_OPTIMIZATION_CANCELLED') {
            const cancelledJobId = request.data && request.data.jobId ? request.data.jobId : null;
            if (cancelledJobId && diamondOptimizationJobId && cancelledJobId !== diamondOptimizationJobId) {
                return;
            }
            setDiamondSimulationLoading(false);
            diamondOptimizationJobId = null;
            const summary = document.getElementById('diamondSimulationSummary');
            if (summary) summary.innerHTML = '⏹️ Otimização cancelada.';
        } else if (request.type === 'STANDARD_SIMULATION_PROGRESS') {
            updateStandardSimulationProgress(request.data || {});
        } else if (request.type === 'STANDARD_SIMULATION_CANCELLED') {
            const cancelledJobId = request.data && request.data.jobId ? request.data.jobId : null;
            if (cancelledJobId && standardSimulationJobId && cancelledJobId !== standardSimulationJobId) {
                return;
            }
            setStandardSimulationLoading(false);
            standardSimulationJobId = null;
            const summary = document.getElementById('standardSimulationSummary');
            if (summary) summary.innerHTML = '⏹️ Simulação cancelada.';
        } else if (request.type === 'STANDARD_OPTIMIZATION_PROGRESS') {
            updateStandardOptimizationProgress(request.data || {});
        } else if (request.type === 'STANDARD_OPTIMIZATION_CANCELLED') {
            const cancelledJobId = request.data && request.data.jobId ? request.data.jobId : null;
            if (cancelledJobId && standardOptimizationJobId && cancelledJobId !== standardOptimizationJobId) {
                return;
            }
            setStandardSimulationLoading(false);
            standardOptimizationJobId = null;
            const summary = document.getElementById('standardSimulationSummary');
            if (summary) summary.innerHTML = '⏹️ Otimização cancelada.';
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
            chrome.storage.local.get(['lastSpin', 'analysis', 'pattern', 'martingaleState', 'entriesHistory', MASTER_CLEAR_CUTOFF_KEY, ENTRIES_CLEAR_CUTOFF_KEY], function(result) {
                // Só chama updateSidebar se a extensão não foi invalidada/descarregada
                if (chrome && chrome.runtime && chrome.runtime.id) {
                    console.log('Dados iniciais carregados:', result);

                    // ✅ Garantir que o cutoff do "Limpar" da aba Sinais/Gráfico esteja carregado antes do primeiro render
                    try {
                        const raw = result && result[MASTER_CLEAR_CUTOFF_KEY] ? result[MASTER_CLEAR_CUTOFF_KEY] : null;
                        if (raw && typeof raw === 'object') {
                            masterEntriesClearCutoffByMode = {
                                standard: Number(raw.standard) || 0,
                                diamond: Number(raw.diamond) || 0
                            };
                        }
                    } catch (_) {}

                    // ✅ Cutoff da aba IA (para o botão "Limpar" da IA)
                    try {
                        const raw = result && result[ENTRIES_CLEAR_CUTOFF_KEY] ? result[ENTRIES_CLEAR_CUTOFF_KEY] : null;
                        if (raw && typeof raw === 'object') {
                            entriesClearCutoffByMode = {
                                standard: Number(raw.standard) || 0,
                                diamond: Number(raw.diamond) || 0
                            };
                        }
                    } catch (_) {}
                    
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
    
    // ✅ [OTIMIZAÇÃO] Interval redundante removido - atualização já acontece via WebSocket e updateHistoryUIFromServer()
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // 💓 HEARTBEAT - Sistema de detecção de usuários online
    // ═══════════════════════════════════════════════════════════════════════════════
    let heartbeatInterval = null;
    let heartbeatFailures = 0;
    const MAX_HEARTBEAT_FAILURES = 3;
    
    async function sendHeartbeat() {
        try {
            const token = localStorage.getItem('authToken');
            if (!token) {
                stopHeartbeat();
                return;
            }
            
            const API_URL = getApiUrl();
            const response = await fetch(`${API_URL}/api/auth/heartbeat`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                signal: AbortSignal.timeout(5000) // Timeout de 5 segundos
            });
            
            if (response.ok) {
                heartbeatFailures = 0; // Resetar contador de falhas
            } else {
                heartbeatFailures++;
                if (heartbeatFailures >= MAX_HEARTBEAT_FAILURES) {
                    console.log('💓 Heartbeat desativado após múltiplas falhas');
                    stopHeartbeat();
                }
            }
        } catch (error) {
            heartbeatFailures++;
            if (heartbeatFailures >= MAX_HEARTBEAT_FAILURES) {
                console.log('💓 Heartbeat desativado após múltiplas falhas de conexão');
                stopHeartbeat();
            }
            // Silencioso - não mostrar erro no console
        }
    }
    
    // Enviar heartbeat a cada 30 segundos
    function startHeartbeat() {
        if (heartbeatInterval) return; // Já está rodando
        
        heartbeatFailures = 0; // Resetar contador
        sendHeartbeat(); // Enviar imediatamente
        heartbeatInterval = setInterval(sendHeartbeat, 30000); // 30 segundos
        console.log('💓 Sistema de heartbeat iniciado');
    }
    
    // Parar heartbeat
    function stopHeartbeat() {
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
        }
    }
    
    // Iniciar heartbeat se usuário estiver autenticado
    if (localStorage.getItem('authToken')) {
        startHeartbeat();
    }
    
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
                
                // ✅ APLICAR ESTILOS FIXOS (REMOVIDO PARA USAR CSS EXTERNO)
                /* 
                if (!modeApiContainer.hasAttribute('data-styled')) {
                    modeApiContainer.setAttribute('data-styled', 'true');
                    // Estilos removidos para usar classes CSS
                }
                */

                
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
            padding: 0;
            max-width: 80%;
            max-height: 80%;
            overflow: hidden;
            box-shadow: 0 10px 50px rgba(255, 0, 255, 0.5);
            display: flex;
            flex-direction: column;
        `;
        
        // Cabeçalho com título e botão fechar (mesmo estilo do header principal)
        const header = document.createElement('div');
        header.className = 'modal-header-minimal';
        
        const headerTitle = document.createElement('h3');
        headerTitle.textContent = title;
        
        const closeHeaderBtn = document.createElement('button');
        closeHeaderBtn.type = 'button';
        closeHeaderBtn.className = 'modal-header-close';
        closeHeaderBtn.textContent = 'Fechar';
        closeHeaderBtn.onclick = () => {
            document.body.removeChild(overlay);
        };
        
        header.appendChild(headerTitle);
        header.appendChild(closeHeaderBtn);
        
        // Corpo do modal
        const modalBody = document.createElement('div');
        modalBody.className = 'modal-body-scrollable';
        modalBody.style.cssText = `
            padding: 25px;
            overflow: auto;
            flex: 1;
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
        
        // Montar corpo do modal
        modalBody.appendChild(textarea);
        modalBody.appendChild(buttonsContainer);
        
        // Montar modal completo
        modal.appendChild(header);
        modal.appendChild(modalBody);
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
            // ✅ Preferência de sincronização precisa ser respeitada em TODOS os dispositivos.
            // Para isso, sempre tentamos buscar do servidor e, se vier `syncConfigToAccount`,
            // usamos como fonte de verdade da conta.
            const localPref = getSyncConfigPreference();
            const serverConfig = await loadConfigFromServer();
            const serverPref = (serverConfig && typeof serverConfig.syncConfigToAccount === 'boolean')
                ? serverConfig.syncConfigToAccount
                : null;
            const effectivePref = (serverPref !== null) ? serverPref : localPref;

            // Se o servidor informar a preferência, refletir localmente (UI + localStorage)
            if (serverPref !== null && serverPref !== localPref) {
                try { saveSyncConfigPreference(serverPref); } catch (_) {}
                try { updateSyncConfigToggleUI(serverPref); } catch (_) {}
            }

            if (effectivePref) {
                console.log('☁️ Sincronização ATIVADA - carregando configurações da conta...');
                if (serverConfig) {
                    console.log('✅ Usando configurações do servidor (sincronizado)');
                    await storageCompat.set({ analyzerConfig: serverConfig });
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
                const activeModeKey = cfg.aiMode ? 'diamond' : 'standard';
                const activeMartingaleProfile = sanitizedProfiles[activeModeKey];
                
                // ✅ Painel (saldo) sempre visível — ignorar configs antigas de visibilidade
                try { applyAutoBetSummaryVisibility(); } catch (_) {}
                
                if (typeof cfg.analysisEnabled === 'boolean') {
                    updateAnalyzerToggleUI(cfg.analysisEnabled);
                    sendRuntimeMessage({ action: 'SET_ANALYSIS_ENABLED', enabled: cfg.analysisEnabled }).catch(() => {});
                }
                
                const histDepth = document.getElementById('cfgHistoryDepth');
                const minOcc = document.getElementById('cfgMinOccurrences');
                const maxOcc = document.getElementById('cfgMaxOccurrences');
                const patternInt = document.getElementById('cfgPatternInterval');
                const minSize = document.getElementById('cfgMinPatternSize');
                const maxSize = document.getElementById('cfgMaxPatternSize');
                const winPct = document.getElementById('cfgWinPercentOthers');
                const reqTrig = document.getElementById('cfgRequireTrigger');
                const consecutiveMartingale = document.getElementById('cfgConsecutiveMartingale');
                const consecutiveGales = document.getElementById('cfgConsecutiveGales');
                const maxGales = document.getElementById('cfgMaxGales');
                const tgChatId = document.getElementById('cfgTgChatId');
                if (histDepth) histDepth.value = cfg.historyDepth != null ? cfg.historyDepth : 2000;
                if (minOcc) minOcc.value = cfg.minOccurrences != null ? cfg.minOccurrences : 1;
                if (maxOcc) maxOcc.value = cfg.maxOccurrences != null ? cfg.maxOccurrences : 0;
                if (patternInt) patternInt.value = cfg.minIntervalSpins != null ? cfg.minIntervalSpins : 0;
                if (minSize) minSize.value = cfg.minPatternSize != null ? cfg.minPatternSize : 3;
                if (maxSize) maxSize.value = cfg.maxPatternSize != null ? cfg.maxPatternSize : 0;
                if (winPct) winPct.value = cfg.winPercentOthers != null ? cfg.winPercentOthers : 25;
                if (reqTrig) reqTrig.checked = cfg.requireTrigger != null ? cfg.requireTrigger : true;
                if (consecutiveMartingale) consecutiveMartingale.checked = activeMartingaleProfile.consecutiveMartingale;
                if (consecutiveGales) consecutiveGales.value = activeMartingaleProfile.consecutiveGales != null ? activeMartingaleProfile.consecutiveGales : 0;
                if (maxGales) maxGales.value = activeMartingaleProfile.maxGales;
                if (tgChatId) tgChatId.value = cfg.telegramChatId || '';

                // ✅ UI: esconder/mostrar "Consecutivo até (G)" quando o toggle estiver desligado
                try {
                    const wrapper = document.getElementById('consecutiveGalesWrapper');
                    const input = document.getElementById('cfgConsecutiveGales');
                    if (wrapper && consecutiveMartingale) {
                        const enabled = !!consecutiveMartingale.checked;
                        wrapper.style.display = enabled ? '' : 'none';
                        if (input) input.disabled = !enabled;
                    }
                } catch (_) {}
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
                latestAnalyzerConfig = cfg;
                const signalIntensitySelect = document.getElementById('signalIntensitySelect');
                if (signalIntensitySelect) {
                    const intensityValue = cfg.signalIntensity === 'conservative' ? 'conservative' : 'aggressive';
                    signalIntensitySelect.value = intensityValue;
                    console.log(`🎚️ Intensidade carregada: ${intensityValue}`);
                    enforceSignalIntensityAvailability();
                }
                
                // ✅ Aplicar visibilidade dos campos baseado no modo IA (considerando modo específico da aba)
                toggleAIConfigFields(currentAIMode);
                
                // ✅ Carregar preferência de sincronização de configurações
                const syncConfigCheckbox = document.getElementById('syncConfigToAccount');
                if (syncConfigCheckbox) {
                    const enabled = getSyncConfigPreference();
                    syncConfigCheckbox.checked = enabled;
                    try { updateSyncConfigToggleUI(enabled); } catch (_) {}
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
        
        // Referência ao botão (para validações que resetam visual em caso de erro)
        const btn = document.getElementById('autoBetSaveConfig') || document.getElementById('cfgSaveBtn');
        
        // ✅ Feedback global de salvamento (bolinha no centro)
        showGlobalSaveLoading();
        
        // ✅ BUSCAR CONFIGURAÇÃO ATUAL PRIMEIRO (para preservar aiMode e outros estados)
        return new Promise((resolve) => {
        chrome.storage.local.get(['analyzerConfig'], async function(result) {
            try {
                const currentConfig = result.analyzerConfig || {};
                const previousAutoBetConfig = sanitizeAutoBetConfig(currentConfig.autoBetConfig);
                const signalIntensitySelect = document.getElementById('signalIntensitySelect');
                const signalIntensity = signalIntensitySelect ? signalIntensitySelect.value : 'aggressive';
                const votingLevelsEnabled = areAllVotingLevelsEnabledFromConfig(currentConfig);
                if (signalIntensity === 'conservative' && !votingLevelsEnabled) {
                    const overlay = document.getElementById('saveStatusOverlay');
                    if (overlay) overlay.style.display = 'none';
                    if (btn) {
                        btn.textContent = 'Salvar';
                    }
                    if (signalIntensitySelect) {
                        signalIntensitySelect.value = 'aggressive';
                    }
                    enforceSignalIntensityAvailability();
                    const disabledVotingLevels = getDisabledVotingLevelsFromConfig(currentConfig);
                    const disabledText = disabledVotingLevels.length ? disabledVotingLevels.join(', ') : '';
                    showCenteredNotice(
                        `Para usar o modo <strong>Conservador</strong>, ative todos os níveis votantes <strong>N1–N8</strong> em <strong>Configurar Níveis</strong>.` +
                        (disabledText ? `<br><br><strong>Desativados agora:</strong> ${disabledText}` : ''),
                        { title: 'Modo Conservador', autoHide: 7000 }
                    );
                    resolve(false);
                    return;
                }
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
                
                const historyDepth = Math.max(100, Math.min(10000, parseInt(getElementValue('cfgHistoryDepth', '2000'), 10)));
                const minOcc = Math.max(parseInt(getElementValue('cfgMinOccurrences', '1'), 10), 1);
                const maxOcc = Math.max(parseInt(getElementValue('cfgMaxOccurrences', '0'), 10), 0);
                const patternInterval = Math.max(parseInt(getElementValue('cfgPatternInterval', '0'), 10), 0);
                let minSize = Math.max(parseInt(getElementValue('cfgMinPatternSize', '2'), 10), 2);
                let maxSize = Math.max(parseInt(getElementValue('cfgMaxPatternSize', '0'), 10), 0);
                const winPct = Math.max(0, Math.min(100, parseInt(getElementValue('cfgWinPercentOthers', '25'), 10)));
                const reqTrig = getElementValue('cfgRequireTrigger', false, true);
                const consecutiveMartingaleSelected = getElementValue('cfgConsecutiveMartingale', false, true);
                const consecutiveGalesRaw = parseInt(getElementValue('cfgConsecutiveGales', '0'), 10);
                const autoBetWhiteProtectionValue = getElementValue('autoBetWhiteProtection', AUTO_BET_DEFAULTS.whiteProtection, true);
                const tgChatId = String(getElementValue('cfgTgChatId', '')).trim();
                
                // 🎚️ Intensidade de sinais
                const autoBetRawConfig = {
                    enabled: false, // Auto-bet sempre desabilitado (apenas simulação)
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

                // ✅ Fix “não mudar o passado”:
                // Antes de aplicar um novo baseStake/galeMultiplier, congelar os ciclos já finalizados
                // no entriesHistory com o valor que valia NA ÉPOCA (config anterior).
                const freezeFinalEntriesFinanceIfNeeded = async (prevCfg, nextCfg) => {
                    try {
                        const prevBase = Number(prevCfg?.baseStake);
                        const nextBase = Number(nextCfg?.baseStake);
                        const prevMult = Number(prevCfg?.galeMultiplier);
                        const nextMult = Number(nextCfg?.galeMultiplier);
                        if (!Number.isFinite(prevBase) || !Number.isFinite(nextBase) || !Number.isFinite(prevMult) || !Number.isFinite(nextMult)) {
                            return;
                        }
                        if (prevBase === nextBase && prevMult === nextMult) {
                            return;
                        }
                        const stored = await storageCompat.get(['entriesHistory']);
                        const entries = Array.isArray(stored?.entriesHistory) ? [...stored.entriesHistory] : [];
                        if (!entries.length) return;

                        let changed = false;
                        const round2 = (v) => {
                            const n = Number(v);
                            return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
                        };
                        const payoutForColor = (betColor) => {
                            const c = String(betColor || '').toLowerCase();
                            if (c === 'white' || c === 'branco') {
                                const wm = Number(prevCfg?.whitePayoutMultiplier ?? AUTO_BET_DEFAULTS.whitePayoutMultiplier);
                                return Math.max(2, Number.isFinite(wm) ? wm : 14);
                            }
                            return 2;
                        };

                        const patched = entries.map((e) => {
                            if (!e || (e.finalResult !== 'WIN' && e.finalResult !== 'RED' && e.finalResult !== 'RET')) return e;
                            // Se já está “congelado”, não mexer
                            if (Number.isFinite(Number(e.cycleNetProfit)) && Number.isFinite(Number(e.baseStakeSnapshot)) && Number.isFinite(Number(e.galeMultiplierSnapshot))) {
                                return e;
                            }
                            const stageIdx = getStageIndexFromEntryLike(e);
                            const base = Math.max(0.01, Number(prevCfg?.baseStake) || AUTO_BET_DEFAULTS.baseStake);
                            const mult = Math.max(1, Number(prevCfg?.galeMultiplier) || AUTO_BET_DEFAULTS.galeMultiplier);
                            const stakeAmount = round2(base * Math.pow(mult, stageIdx));
                            let totalInvested = 0;
                            for (let i = 0; i <= stageIdx; i++) totalInvested += base * Math.pow(mult, i);
                            totalInvested = round2(totalInvested);

                            const betColor = e.betColor || e.patternData?.color || null;
                            const payoutMultiplier = Math.max(2, Number(e.payoutMultiplier) || payoutForColor(betColor));
                            const cycleNetProfit = e.finalResult === 'WIN'
                                ? round2((stakeAmount * payoutMultiplier) - totalInvested)
                                : round2(-totalInvested);

                            changed = true;
                            return {
                                ...e,
                                betColor: betColor || e.betColor || null,
                                stakeAmount: Number(e.stakeAmount) || stakeAmount,
                                baseStakeSnapshot: Number(e.baseStakeSnapshot) || base,
                                galeMultiplierSnapshot: Number(e.galeMultiplierSnapshot) || mult,
                                payoutMultiplier: Number(e.payoutMultiplier) || payoutMultiplier,
                                cycleTotalInvested: Number(e.cycleTotalInvested) || totalInvested,
                                cycleNetProfit: Number(e.cycleNetProfit) || cycleNetProfit
                            };
                        });

                        if (changed) {
                            await storageCompat.set({ entriesHistory: patched });
                            try { window.requestAnimationFrame(() => renderEntriesPanel(patched)); } catch (_) {}
                        }
                    } catch (err) {
                        console.warn('⚠️ Não foi possível congelar valores do histórico antes de salvar config:', err);
                    }
                };
                await freezeFinalEntriesFinanceIfNeeded(previousAutoBetConfig, sanitizedAutoBetConfig);
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
                console.log('   • minIntervalSpins (entre padrões):', patternInterval);
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
                
                // ✅ Modo IA é global/sincronizado por conta
                const activeModeKey = (currentConfig && currentConfig.aiMode) ? 'diamond' : 'standard';
                const maxGalesInput = parseInt(getElementValue('cfgMaxGales', String(martingaleProfiles[activeModeKey].maxGales)), 10);
                const maxGales = clampMartingaleMax(maxGalesInput, martingaleProfiles[activeModeKey].maxGales);
                let consecutiveGales = Math.max(0, Math.min(maxGales, Number.isFinite(consecutiveGalesRaw) ? consecutiveGalesRaw : 0));
                if (!consecutiveMartingaleSelected) {
                    consecutiveGales = 0;
                } else if (maxGales > 0) {
                    // Checkbox ligado: mínimo 1
                    consecutiveGales = Math.max(1, consecutiveGales);
                }
                const updatedProfiles = {
                    ...martingaleProfiles,
                    [activeModeKey]: {
                        maxGales,
                        consecutiveGales,
                        consecutiveMartingale: consecutiveGales > 0
                    }
                };
                
                // ✅ MESCLAR com configuração atual para preservar aiMode e outros estados
                const cfg = {
                    ...currentConfig, // Preservar configurações existentes
                    aiMode: !!(currentConfig && currentConfig.aiMode),
                    syncConfigToAccount: getSyncConfigPreference(),
                    historyDepth: historyDepth,
                    minOccurrences: minOcc,
                    maxOccurrences: maxOcc,
                    minIntervalSpins: patternInterval,
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
                    autoBetSummaryVisible: true
                };
                applyActiveMartingaleToLegacyFields(cfg, activeModeKey, updatedProfiles);
                
                console.log('');
                console.log('%c💾 Salvando em chrome.storage.local...', 'color: #00FF88; font-weight: bold;');
                console.log('   aiMode (global):', cfg.aiMode);
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
                    latestAnalyzerConfig = cfg;
                    enforceSignalIntensityAvailability();
                    
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
        // Feedback principal agora é o indicador global no centro da tela.
        console.log('%c🎨 Feedback de salvamento (success = ' + success + ')', 'color: #00D4FF; font-weight: bold;');
        
        if (success) {
            // Mostra o tique verde e esconde depois de ~1.5s
            showGlobalSaveSuccess(1500);
        } else {
            // Em caso de erro, apenas some com o overlay/spinner
            const overlay = document.getElementById('saveStatusOverlay');
            const spinner = document.getElementById('saveStatusSpinner');
            const check = document.getElementById('saveStatusCheck');
            if (overlay) overlay.style.display = 'none';
            if (spinner) spinner.style.display = 'block';
            if (check) check.style.display = 'none';
        }
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
    
    // ═══════════════════════════════════════════════════════════════
    // 👑 SISTEMA HÍBRIDO (FASE 2) — UI (Aba "Sinais de entrada")
    // ═══════════════════════════════════════════════════════════════
    let entryGateHybridBound = false;

    function sanitizeMasterSignalV2Config(raw) {
        const obj = raw && typeof raw === 'object' ? raw : {};
        const mode = String(obj.levelMode || 'auto').toLowerCase().trim();
        const levelMode = mode === 'manual' ? 'manual' : 'auto';
        const clampInt = (v, min, max, fallback) => {
            const n = Math.floor(Number(v));
            if (!Number.isFinite(n)) return fallback;
            return Math.max(min, Math.min(max, n));
        };
        return {
            enabled: Object.prototype.hasOwnProperty.call(obj, 'enabled') ? !!obj.enabled : true,
            levelMode,
            manualLevel: clampInt(obj.manualLevel, 1, 3, 2),
            autoTargetSignals: clampInt(obj.autoTargetSignals, 10, 200, 50)
        };
    }

    function applyEntryGateHybridVisibility(levelMode) {
        const manualRow = document.getElementById('entryGateHybridManualRow');
        const autoRow = document.getElementById('entryGateHybridAutoRow');
        if (manualRow) manualRow.style.display = (levelMode === 'manual') ? 'flex' : 'none';
        if (autoRow) autoRow.style.display = (levelMode === 'auto') ? 'flex' : 'none';
    }

    async function persistMasterSignalV2Config(partialUpdate = {}) {
        try {
            const stored = await storageCompat.get(['analyzerConfig']);
            const current = stored?.analyzerConfig || {};
            const prev = sanitizeMasterSignalV2Config(current.masterSignalV2 || {});
            const merged = sanitizeMasterSignalV2Config({ ...prev, ...(partialUpdate || {}) });
            const updated = { ...current, masterSignalV2: merged };

            await storageCompat.set({ analyzerConfig: updated });

            // Aplicar config no background + recomputar masterSignal do modo atual
            try { chrome.runtime.sendMessage({ action: 'applyConfig' }, function() {}); } catch (_) {}
            const currentMode = document.querySelector('.ai-mode-toggle.active') ? 'diamond' : 'standard';
            try { chrome.runtime.sendMessage({ action: 'RECOMPUTE_MASTER_SIGNAL', mode: currentMode }, function() {}); } catch (_) {}

            // Atualizar card de stats (debounced)
            try { scheduleMasterSignalStatsRefresh(350); } catch (_) {}
        } catch (e) {
            console.warn('⚠️ Falha ao salvar config do Sistema Híbrido (FASE 2):', e);
        }
    }

    async function initEntryGateHybridControls(force = false) {
        try {
            if (entryGateHybridBound && !force) return;
            const modeSel = document.getElementById('entryGateHybridMode');
            const levelSel = document.getElementById('entryGateHybridManualLevel');
            const targetInput = document.getElementById('entryGateHybridTarget');
            if (!modeSel || !levelSel || !targetInput) return;

            const stored = await storageCompat.get(['analyzerConfig']);
            const cfg = sanitizeMasterSignalV2Config(stored?.analyzerConfig?.masterSignalV2 || {});

            modeSel.value = cfg.levelMode;
            levelSel.value = String(cfg.manualLevel);
            targetInput.value = String(cfg.autoTargetSignals);
            applyEntryGateHybridVisibility(cfg.levelMode);

            if (!entryGateHybridBound) {
                modeSel.addEventListener('change', () => {
                    const nextMode = String(modeSel.value || '').toLowerCase().trim() === 'manual' ? 'manual' : 'auto';
                    applyEntryGateHybridVisibility(nextMode);
                    persistMasterSignalV2Config({ levelMode: nextMode });
                });
                levelSel.addEventListener('change', () => {
                    const lvl = Math.max(1, Math.min(3, Math.floor(Number(levelSel.value) || 2)));
                    persistMasterSignalV2Config({ manualLevel: lvl });
                });
                targetInput.addEventListener('change', () => {
                    const tgt = Math.max(10, Math.min(200, Math.floor(Number(targetInput.value) || 50)));
                    targetInput.value = String(tgt);
                    persistMasterSignalV2Config({ autoTargetSignals: tgt });
                });
                entryGateHybridBound = true;
            }
        } catch (e) {
            console.warn('⚠️ Falha ao inicializar controles do Sistema Híbrido (FASE 2):', e);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // 🤖 IA VIVA — Bootstrap do histórico na aba IA (20 ciclos iniciais)
    // ═══════════════════════════════════════════════════════════════
    let iaBootstrapBusy = false;
    let iaBootstrapBound = false;
    let iaTestsBound = false;
    let iaFullscreenKeyHandler = null;
    const IA_FULLSCREEN_OVERLAY_ID = 'da-ia-fullscreen-overlay';
    const IA_FULLSCREEN_PLACEHOLDER_ID = 'da-ia-entries-panel-placeholder';
    const IA_FULLSCREEN_ICON = `
        <svg class="ia-tests-toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm0-4h2V7h3V5H5v5zm14 9h-5v-2h3v-3h2v5zm-5-14h5v5h-2V7h-3V5z"/>
        </svg>
    `;
    const IA_FULLSCREEN_EXIT_ICON = `
        <svg class="ia-tests-toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm11 8h-3v-3h-2v5h5v-2zm-3-8V5h-2v5h5V8h-3z"/>
        </svg>
    `;
    const iaBackdropSupported = (() => {
        try {
            return !!(
                (window.CSS && typeof window.CSS.supports === 'function') &&
                (window.CSS.supports('backdrop-filter', 'blur(2px)') || window.CSS.supports('-webkit-backdrop-filter', 'blur(2px)'))
            );
        } catch (_) {
            return false;
        }
    })();

    // ✅ IA VIVA (sem vidro): guardar contexto do último render para decidir se o overlay deve aparecer
    let iaBootstrapLastEntriesCount = 0;
    let iaBootstrapLastPendingIndicatorHtml = '';

    // ✅ UX (pedido atual):
    // - Ao clicar em "Limpar" na IA, deve voltar a bolinha/CTA.
    // - Ela deve PERMANECER mesmo após F5, até o usuário clicar em "Analisar histórico".
    // - Após analisar, o CTA some (porque já há histórico visível).
    const IA_BOOTSTRAP_HOLD_KEY_PREFIX = 'daIABootstrapHold_';
    function getIABootstrapHoldKey(mode) {
        const mk = String(mode || '').toLowerCase().trim() === 'diamond' ? 'diamond' : 'standard';
        return `${IA_BOOTSTRAP_HOLD_KEY_PREFIX}${mk}`;
    }
    function isIABootstrapHoldActive(mode) {
        try {
            return localStorage.getItem(getIABootstrapHoldKey(mode)) === '1';
        } catch (_) {
            return false;
        }
    }
    function setIABootstrapHoldActive(mode, active) {
        try {
            const key = getIABootstrapHoldKey(mode);
            if (active) localStorage.setItem(key, '1');
            else localStorage.removeItem(key);
        } catch (_) {}
    }

    function setIABootstrapGlassVisible(visible) {
        const glass = document.getElementById('iaBootstrapGlass');
        if (!glass) return;
        glass.style.display = visible ? 'block' : 'none';
    }

    function setIABootstrapOverlayVisible(visible) {
        const overlay = document.getElementById('iaBootstrapOverlay');
        if (!overlay) return;
        overlay.style.display = visible ? 'flex' : 'none';
    }

    function setIABootstrapState(state, text) {
        const orb = document.getElementById('iaBootstrapOrb');
        const label = document.getElementById('iaBootstrapText');
        const nextState = state || 'idle';
        if (orb) orb.setAttribute('data-state', nextState);
        if (label && typeof text === 'string') {
            let nextText = text;
            // ✅ UX: em loading, sempre mostrar feedback ("Buscando...") mesmo se outro render setar ''.
            if (nextState === 'loading' && !String(nextText).trim()) {
                nextText = 'Buscando';
            }
            label.textContent = nextText;
        }
    }

    function setIABootstrapHasHistory(hasHistory) {
        const orb = document.getElementById('iaBootstrapOrb');
        if (!orb) return;
        orb.setAttribute('data-has-history', hasHistory ? 'true' : 'false');
    }

    function applyIAGlassMode(active) {
        const wrap = document.getElementById('entriesListWrap');
        const list = document.getElementById('entriesList');
        const enabled = !!active;
        if (wrap) wrap.classList.toggle('ia-glass-active', enabled);
        // bloquear interação da LISTA (não das abas)
        if (list) list.style.pointerEvents = enabled ? 'none' : '';
        // fallback de blur é feito via CSS @supports quando backdrop-filter não existir
        void iaBackdropSupported;
    }

    function dockIATestsToggleToEntriesHeader() {
        try {
            if (!isDesktop()) return;
            const container = document.getElementById('blaze-double-analyzer');
            if (!container || !container.classList.contains('da-desktop-dashboard')) return;
            const toggle = document.getElementById('iaTestsToggle');
            const header = document.querySelector('#entriesPanel .entries-header');
            if (!toggle || !header) return;
            if (toggle.parentNode !== header) {
                header.appendChild(toggle);
            }
        } catch (_) {}
    }

    function setIATestsToggleVisible(visible) {
        const wrap = document.getElementById('iaTestsToggle');
        if (!wrap) return;
        wrap.style.display = visible ? 'block' : 'none';
    }

    function isIAFullscreenActive() {
        try {
            return !!document.getElementById(IA_FULLSCREEN_OVERLAY_ID);
        } catch (_) {
            return false;
        }
    }

    function openIAFullscreenOverlay() {
        if (isIAFullscreenActive()) return;

        // Garantir que estamos na aba IA antes de abrir a tela cheia
        try {
            if (activeEntriesTab !== 'entries') {
                setEntriesTab('entries');
            }
        } catch (_) {}

        const entriesPanel = document.getElementById('entriesPanel');
        if (!entriesPanel) return;
        const parent = entriesPanel.parentNode;
        if (!parent) return;

        // Placeholder para restaurar o painel ao fechar (robusto, mesmo se UI re-renderizar)
        const placeholder = document.createElement('div');
        placeholder.id = IA_FULLSCREEN_PLACEHOLDER_ID;
        placeholder.style.display = 'none';
        parent.insertBefore(placeholder, entriesPanel);

        const overlay = document.createElement('div');
        overlay.id = IA_FULLSCREEN_OVERLAY_ID;
        overlay.className = 'da-ia-fullscreen-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-label', 'Histórico em tela cheia');
        try {
            overlay.dataset.prevHtmlOverflow = document.documentElement.style.overflow || '';
        } catch (_) {
            overlay.dataset.prevHtmlOverflow = '';
        }
        try {
            overlay.dataset.prevBodyOverflow = document.body ? (document.body.style.overflow || '') : '';
        } catch (_) {
            overlay.dataset.prevBodyOverflow = '';
        }

        const host = document.createElement('div');
        host.className = 'da-ia-fullscreen-host';
        overlay.appendChild(host);

        // Montar overlay no DOM
        try {
            const container = document.getElementById('blaze-double-analyzer');
            const dashboardHost = (isDesktop() && container && container.classList.contains('da-desktop-dashboard'))
                ? (container.querySelector('.da-desktop-main') || container)
                : (document.body || document.documentElement);
            dashboardHost.appendChild(overlay);
        } catch (_) {
            // noop
        }

        // Mover o painel para dentro do overlay (mantém UI viva e atualizando)
        host.appendChild(entriesPanel);

        // Bloquear scroll do site por trás
        try { document.documentElement.style.overflow = 'hidden'; } catch (_) {}
        try { if (document.body) document.body.style.overflow = 'hidden'; } catch (_) {}
        try { document.documentElement.classList.add('da-ia-fullscreen-active'); } catch (_) {}

        // ESC fecha
        if (!iaFullscreenKeyHandler) {
            iaFullscreenKeyHandler = (event) => {
                try {
                    if (!event) return;
                    if (event.key !== 'Escape') return;
                    if (!isIAFullscreenActive()) return;
                    event.preventDefault();
                    closeIAFullscreenOverlay();
                } catch (_) {}
            };
        }
        try {
            document.addEventListener('keydown', iaFullscreenKeyHandler, true);
        } catch (_) {}

        // Atualizar overlays/ícone (esconde bolinha/vidro em fullscreen)
        try { applyIAVisibilityState(); } catch (_) {}
    }

    function closeIAFullscreenOverlay() {
        const overlay = document.getElementById(IA_FULLSCREEN_OVERLAY_ID);
        if (!overlay) return;

        const entriesPanel = overlay.querySelector('#entriesPanel');
        const placeholder = document.getElementById(IA_FULLSCREEN_PLACEHOLDER_ID);

        // Restaurar painel
        try {
            if (entriesPanel && placeholder) {
                placeholder.replaceWith(entriesPanel);
            }
        } catch (_) {}

        // Restaurar scroll
        try {
            document.documentElement.style.overflow = overlay.dataset.prevHtmlOverflow || '';
        } catch (_) {}
        try {
            if (document.body) {
                document.body.style.overflow = overlay.dataset.prevBodyOverflow || '';
            }
        } catch (_) {}
        try { document.documentElement.classList.remove('da-ia-fullscreen-active'); } catch (_) {}

        // Remover overlay
        try { overlay.remove(); } catch (_) {}

        // Remover handler de ESC
        try {
            if (iaFullscreenKeyHandler) {
                document.removeEventListener('keydown', iaFullscreenKeyHandler, true);
            }
        } catch (_) {}

        // Voltar sempre para a aba IA (modo original com bolinha/vidro)
        try {
            setEntriesTab('entries');
        } catch (_) {
            try { applyIAVisibilityState(); } catch (_) {}
        }
    }

    function updateIATestsToggleLabel() {
        const btn = document.getElementById('iaTestsToggleBtn');
        if (!btn) return;
        const expanded = isIAFullscreenActive();
        btn.innerHTML = expanded ? IA_FULLSCREEN_EXIT_ICON : IA_FULLSCREEN_ICON;
        const label = expanded ? 'Sair da tela cheia' : 'Expandir histórico (tela cheia)';
        btn.setAttribute('aria-label', label);
        btn.setAttribute('title', label);
        btn.classList.toggle('is-expanded', expanded);
    }

    function applyIAVisibilityState(entriesCount, pendingIndicatorHtml) {
        // Atualizar contexto (quando chamado a partir do render)
        try {
            const n = Number(entriesCount);
            if (Number.isFinite(n)) iaBootstrapLastEntriesCount = n;
        } catch (_) {}
        try {
            if (typeof pendingIndicatorHtml === 'string') {
                iaBootstrapLastPendingIndicatorHtml = pendingIndicatorHtml;
            }
        } catch (_) {}

        const isIA = (activeEntriesTab === 'entries');
        const expanded = isIAFullscreenActive();
        // ✅ Desktop: colocar o ícone de tela cheia na linha do WIN/LOSS/Ciclos/Limpar
        try { dockIATestsToggleToEntriesHeader(); } catch (_) {}
        // Manter o ícone DENTRO da aba (sem botão extra fora do painel).
        // Em tela cheia ele continua servindo para "minimizar" (toggle do ícone).
        setIATestsToggleVisible(isIA);
        updateIATestsToggleLabel();

        // ✅ Pedido do usuário: remover “vidro/ofuscado” do modo IA.
        // Portanto: nunca mostrar o glass e nunca aplicar blur/filtro na lista.
        const shouldGlass = false;

        // Overlay (bolinha) só faz sentido quando a IA está vazia e NÃO há pendência.
        // (Se já tem histórico, não deve ficar cobrindo o conteúdo.)
        const shouldHideOverlay = !isIA || expanded || !shouldShowIABootstrapOverlay(
            iaBootstrapLastEntriesCount,
            iaBootstrapLastPendingIndicatorHtml
        );

        try { setIABootstrapGlassVisible(false); } catch (_) {}
        try { applyIAGlassMode(false); } catch (_) {}
        try { setIABootstrapOverlayVisible(!shouldHideOverlay); } catch (_) {}
    }

    function bindIATestsToggle() {
        if (iaTestsBound) return;
        const btn = document.getElementById('iaTestsToggleBtn');
        if (!btn) return;
        btn.addEventListener('click', () => {
            if (isIAFullscreenActive()) {
                closeIAFullscreenOverlay();
            } else {
                openIAFullscreenOverlay();
            }
        });
        iaTestsBound = true;
    }

    function shouldShowIABootstrapOverlay(filteredEntriesCount, pendingIndicatorHtml) {
        // Só faz sentido na aba IA (entries)
        if (activeEntriesTab !== 'entries') return false;
        const mode = document.querySelector('.ai-mode-toggle.active') ? 'diamond' : 'standard';
        // Se está rodando, manter overlay visível (para animação), mesmo que a lista atualize por trás
        if (iaBootstrapBusy) return true;
        // ✅ Se existe placeholder pendente no topo, nunca sobrepor (mesmo se HOLD estiver ativo)
        if (pendingIndicatorHtml && String(pendingIndicatorHtml).trim()) return false;
        // Se há itens, não mostrar
        if ((Number(filteredEntriesCount) || 0) > 0) return false;
        // ✅ Se a IA foi "limpa", manter a bolinha até o usuário clicar em Analisar histórico
        if (isIABootstrapHoldActive(mode)) return true;
        return true;
    }

    // IA Viva: o “vidro” fica SEMPRE por cima da aba IA.
    // Não devemos “simular” sinais falsos por trás; o vidro desfoca o conteúdo real (quando existir).

    function bindIABootstrapButton() {
        if (iaBootstrapBound) return;
        const btn = document.getElementById('iaBootstrapBtn');
        if (!btn) return;
        btn.addEventListener('click', async () => {
            if (iaBootstrapBusy) return;
            iaBootstrapBusy = true;
            try { btn.disabled = true; } catch (_) {}
            try { btn.setAttribute('aria-busy', 'true'); } catch (_) {}
            // ✅ Feedback visual: manter texto visível com "Buscando..." (pontinhos via CSS)
            setIABootstrapState('loading', 'Buscando');

            const mode = document.querySelector('.ai-mode-toggle.active') ? 'diamond' : 'standard';
            try {
                chrome.runtime.sendMessage({
                    action: 'IA_BOOTSTRAP_HISTORY',
                    mode,
                    // ✅ Novo pedido: bootstrap inicial = 20 ciclos mais recentes
                    targetCycles: 20
                }, async (response) => {
                    const err = chrome.runtime.lastError;
                    if (err) {
                        iaBootstrapBusy = false;
                        try { btn.disabled = false; } catch (_) {}
                        try { btn.removeAttribute('aria-busy'); } catch (_) {}
                        setIABootstrapState('idle', 'Analisar histórico');
                        showToast(`❌ Falha ao analisar histórico: ${err.message || err}`, 3200);
                        return;
                    }
                    if (!response || response.status !== 'success') {
                        iaBootstrapBusy = false;
                        try { btn.disabled = false; } catch (_) {}
                        try { btn.removeAttribute('aria-busy'); } catch (_) {}
                        setIABootstrapState('idle', 'Analisar histórico');
                        const msg = response && response.error ? response.error : 'resposta inválida';
                        showToast(`❌ Falha ao analisar histórico: ${msg}`, 3200);
                        return;
                    }

                    // ✅ Animação de concluído e sumir
                    setIABootstrapState('done', '');
                    setTimeout(() => {
                        // ✅ Bootstrap concluído: liberar render normal (bolinha some quando houver histórico visível)
                        setIABootstrapHoldActive(mode, false);
                        iaBootstrapBusy = false;
                        try { btn.disabled = false; } catch (_) {}
                        try { btn.removeAttribute('aria-busy'); } catch (_) {}
                        // Após concluir, manter apenas a bolinha (CTA some quando houver histórico visível)
                        setIABootstrapState('idle', '');
                        // ✅ Importante: forçar re-render imediatamente após liberar o HOLD,
                        // porque o ENTRIES_UPDATE pode ter chegado antes (evita precisar dar F5).
                        try {
                            storageCompat.get(['entriesHistory']).then((res = {}) => {
                                const entries = Array.isArray(res.entriesHistory) ? res.entriesHistory : [];
                                renderEntriesPanel(entries);
                            }).catch(() => {});
                        } catch (_) {}
                        // Forçar reavaliação do overlay (some imediatamente após o 1º carregamento)
                        try { applyIAVisibilityState(iaBootstrapLastEntriesCount, iaBootstrapLastPendingIndicatorHtml); } catch (_) {}
                    }, 850);
                });
            } catch (e) {
                iaBootstrapBusy = false;
                try { btn.disabled = false; } catch (_) {}
                try { btn.removeAttribute('aria-busy'); } catch (_) {}
                setIABootstrapState('idle', 'Analisar histórico');
                showToast(`❌ Falha ao analisar histórico: ${e.message || e}`, 3200);
            }
        });
        iaBootstrapBound = true;
    }

    // Função para atualizar UI do observador
    function updateObserverUI(stats) {
        const observerStats = document.getElementById('observerStats');
        if (!observerStats) return;
        // Manter controles híbridos sincronizados (apenas quando a UI existir; no desktop dashboard fica oculto)
        try {
            const hybrid = document.getElementById('observerHybrid');
            if (hybrid && hybrid.offsetParent !== null) {
                initEntryGateHybridControls();
            }
        } catch (_) {}
        
        // Limpar loading
        observerStats.innerHTML = '';

        const safe = stats && typeof stats === 'object' ? stats : {};
        const totalCycles = Number.isFinite(Number(safe.totalCycles)) ? Number(safe.totalCycles) : 0;
        const wins = Number.isFinite(Number(safe.wins)) ? Number(safe.wins) : 0;
        const rets = Number.isFinite(Number(safe.rets)) ? Number(safe.rets) : 0;
        const cycleWinRate = Number.isFinite(Number(safe.cycleWinRate)) ? Number(safe.cycleWinRate) : 0;
        const minCycles = Number.isFinite(Number(safe.minCycles)) ? Number(safe.minCycles) : 10;
        const nextIsMaster = !!safe.nextIsMaster;
        const hasCurrentSignal = !!safe.hasCurrentSignal;
        const decisionWindowCycles = Number.isFinite(Number(safe.decisionWindowCycles)) ? Number(safe.decisionWindowCycles) : null;
        const entryTargets = Array.isArray(safe.entryTargets) ? safe.entryTargets.map(Number).filter(n => Number.isFinite(n) && n > 0) : [];
        const g1Targets = Array.isArray(safe.g1Targets) ? safe.g1Targets.map(Number).filter(n => Number.isFinite(n) && n > 0) : [];
        const g2Targets = Array.isArray(safe.g2Targets) ? safe.g2Targets.map(Number).filter(n => Number.isFinite(n) && n > 0) : [];
        const retTargets = Array.isArray(safe.retTargets) ? safe.retTargets.map(Number).filter(n => Number.isFinite(n) && n > 0) : [];
        const entryTargetWindow = Number.isFinite(Number(safe.entryTargetWindow)) ? Number(safe.entryTargetWindow) : 0;
        const sinceEntrada = Number.isFinite(Number(safe.sinceEntrada)) ? Number(safe.sinceEntrada) : null;
        const sinceRet = Number.isFinite(Number(safe.sinceRet)) ? Number(safe.sinceRet) : null;
        const neededToStart = Number.isFinite(Number(safe.neededToStart)) ? Number(safe.neededToStart) : Math.max(0, minCycles - totalCycles);
        const distanceSinceLastRet = Number.isFinite(Number(safe.distanceSinceLastRet)) ? Number(safe.distanceSinceLastRet) : null;
        const modeLabel = safe.mode === 'diamond' ? 'Diamante' : 'Premium';
        const diamondSrc = safe && safe.diamondCurrentSourceLevel ? safe.diamondCurrentSourceLevel : null;
        const diamondSrcId = diamondSrc && diamondSrc.id ? String(diamondSrc.id) : '';
        const diamondSrcStats = safe && safe.diamondCurrentSourceStats ? safe.diamondCurrentSourceStats : null;
        const diamondSrcPct = (diamondSrcStats && typeof diamondSrcStats.hitRate === 'number')
            ? (Number(diamondSrcStats.hitRate) * 100).toFixed(1)
            : '';
        const diamondSignalsByLevel = safe && safe.diamondSignalsByLevel ? safe.diamondSignalsByLevel : null;

        const isCollecting = totalCycles < minCycles;

        // Recuperação segura (gate + contador)
        const recoveryEnabled = !!safe.recoveryEnabled;
        const recoveryGate = safe && safe.recoveryGate && typeof safe.recoveryGate === 'object' ? safe.recoveryGate : null;
        const recoveryGateStats = recoveryGate && recoveryGate.stats && typeof recoveryGate.stats === 'object' ? recoveryGate.stats : null;
        const gateSinceLoss = Number.isFinite(Number(recoveryGateStats && recoveryGateStats.sinceLoss)) ? Number(recoveryGateStats.sinceLoss) : null;
        const gateSafeDistance = Number.isFinite(Number(recoveryGateStats && recoveryGateStats.safeDistance)) ? Number(recoveryGateStats.safeDistance) : null;
        const gateSignalsUntilSafe = Number.isFinite(Number(recoveryGateStats && recoveryGateStats.signalsUntilSafe)) ? Number(recoveryGateStats.signalsUntilSafe) : null;

        // Bloco informativo (motivo + distância)
        const reasonText = (recoveryEnabled && recoveryGate && recoveryGate.reason)
            ? String(recoveryGate.reason)
            : (safe.reason ? String(safe.reason) : (isCollecting ? 'Coletando dados...' : '—'));
        const distText = gateSinceLoss != null
            ? String(gateSinceLoss)
            : (distanceSinceLastRet === null ? 'n/d' : String(distanceSinceLastRet));
        const fmtList = (arr) => (Array.isArray(arr) && arr.length ? arr.join(',') : '—');
        const windowText = decisionWindowCycles != null ? ` (janela=${decisionWindowCycles} • prioriza recente)` : '';
        const streaks = safe.streaks && typeof safe.streaks === 'object' ? safe.streaks : null;
        const streakText = (() => {
            if (!streaks) return '';
            const minSamples = Number.isFinite(Number(streaks.minSamples)) ? Number(streaks.minSamples) : 0;
            const parts = [];
            const red = streaks.red || null;
            if (red && Number.isFinite(Number(red.samples)) && red.samples >= minSamples && red.continueProb != null) {
                const p = Math.max(0, Math.min(1, Number(red.continueProb))) * 100;
                parts.push(`REDx${Number(red.current) || 0} → P(próx RED|≥${Number(red.k) || 1}RED)=${p.toFixed(0)}% (${Number(red.hits) || 0}/${Number(red.samples) || 0})`);
            }
            const g1 = streaks.g1 || null;
            if (g1 && Number.isFinite(Number(g1.samples)) && g1.samples >= minSamples && g1.nextWinProb != null) {
                const p = Math.max(0, Math.min(1, Number(g1.nextWinProb))) * 100;
                parts.push(`G1x${Number(g1.current) || 0} → P(WIN|≥${Number(g1.k) || 1}xG1)=${p.toFixed(0)}% (${Number(g1.hits) || 0}/${Number(g1.samples) || 0})`);
            }
            const g2 = streaks.g2 || null;
            if (g2 && Number.isFinite(Number(g2.samples)) && g2.samples >= minSamples && g2.nextWinProb != null) {
                const p = Math.max(0, Math.min(1, Number(g2.nextWinProb))) * 100;
                parts.push(`G2+x${Number(g2.current) || 0} → P(WIN|≥${Number(g2.k) || 1}xG2+)=${p.toFixed(0)}% (${Number(g2.hits) || 0}/${Number(g2.samples) || 0})`);
            }
            if (!parts.length) return '';
            return parts.join(' • ');
        })();
        const diamondLevelText = (() => {
            if (safe.mode !== 'diamond') return '';
            if (!diamondSrcId) return '<div><b>Nível (origem do sinal):</b> —</div>';
            const extra = diamondSrcPct ? ` (${diamondSrcPct}%)` : '';
            return `<div><b>Nível (origem do sinal):</b> ${diamondSrcId}${extra}</div>`;
        })();

        const diamondRankText = (() => {
            if (safe.mode !== 'diamond') return '';
            const total = Number(diamondSignalsByLevel && diamondSignalsByLevel.totalMasterCycles) || 0;
            const levels = diamondSignalsByLevel && Array.isArray(diamondSignalsByLevel.levels) ? diamondSignalsByLevel.levels : [];
            if (!total || !levels.length) return '<div><b>Por nível (sinais):</b> —</div>';
            const fmt = (x) => {
                const id = x && x.id ? String(x.id) : '—';
                const pct = x && typeof x.pct === 'number' ? (x.pct * 100).toFixed(0) : '0';
                const cnt = Number(x && x.count) || 0;
                return `${id} ${pct}% (${cnt})`;
            };
            // Mostrar top 5 para não poluir
            const top = levels.slice(0, 5).map(fmt).join(' • ');
            return `<div><b>Por nível (sinais):</b> ${top}</div>`;
        })();
        observerStats.innerHTML = `
            <div class="observer-loading" style="padding:0; text-align:left;">
                <div><b>Modo:</b> ${modeLabel}</div>
                ${diamondLevelText}
                ${diamondRankText}
                <div><b>Distância do último LOSS:</b> ${distText}</div>
                <div><b>WIN (ciclo):</b> ${totalCycles > 0 ? `${cycleWinRate.toFixed(1)}% (${wins}/${totalCycles})` : '—'}</div>
                <div><b>LOSS (RED):</b> ${totalCycles > 0 ? `${rets}/${totalCycles}` : '—'}</div>
                <div><b>Distâncias (gaps reais)</b>${windowText}: ENTR [${fmtList(entryTargets)}] • G1 [${fmtList(g1Targets)}] • G2 [${fmtList(g2Targets)}] • RED [${fmtList(retTargets)}]</div>
                ${streakText ? `<div><b>Sequências (streaks):</b> ${streakText}</div>` : ''}
                <div><b>Status:</b> ${reasonText}</div>
            </div>
        `;

        // Atualizar "Próximo sinal" (contador da Recuperação segura)
        const calibrationFactor = document.getElementById('calibrationFactor');
        if (calibrationFactor) {
            if (isCollecting) {
                calibrationFactor.textContent = `Coletando ${totalCycles}/${minCycles}`;
                calibrationFactor.style.color = '#ffa500'; // Laranja
            } else {
                if (recoveryEnabled) {
                    const isRecoveryPending = !!safe.currentSignalRecovery;
                    if (isRecoveryPending) {
                        calibrationFactor.textContent = 'Aguardando resultado';
                        calibrationFactor.style.color = '#cdd6e8';
                    } else if (recoveryGate && recoveryGate.ok === true) {
                        calibrationFactor.textContent = 'Sinal seguro liberado';
                        calibrationFactor.style.color = '#00ff88';
                    } else if (gateSignalsUntilSafe != null && gateSignalsUntilSafe > 0) {
                        calibrationFactor.textContent = `Faltam ${gateSignalsUntilSafe}`;
                        calibrationFactor.style.color = '#ffa500';
                    } else {
                        calibrationFactor.textContent = 'Aguardando';
                        calibrationFactor.style.color = '#cdd6e8';
                    }
                } else {
                    if (!hasCurrentSignal) {
                        calibrationFactor.textContent = 'Aguardando';
                        calibrationFactor.style.color = '#cdd6e8';
                    } else {
                        calibrationFactor.textContent = nextIsMaster ? 'Sinal liberado' : 'Normal';
                        calibrationFactor.style.color = nextIsMaster ? '#00ff88' : '#ef5350';
                    }
                }
            }
        }
        
        // Atualizar totais
        const observerTotal = document.getElementById('observerTotal');
        if (observerTotal) {
            if (isCollecting) {
                observerTotal.textContent = `${totalCycles}/${minCycles}`;
                observerTotal.style.color = '#ffa500'; // Laranja
            } else {
                observerTotal.textContent = String(totalCycles);
                observerTotal.style.color = ''; // Cor padrão
            }
        }
        
        const observerWinRate = document.getElementById('observerWinRate');
        if (observerWinRate) {
            if (isCollecting) {
                observerWinRate.textContent = `${neededToStart} sinal(is) p/ iniciar`;
                observerWinRate.style.color = '#ffa500';
            } else {
                if (recoveryEnabled && gateSinceLoss != null) {
                    const lossPart = `LOSS atual=${gateSinceLoss}${gateSafeDistance != null ? ` seguro≥${gateSafeDistance}` : ''}${gateSignalsUntilSafe != null ? ` faltam=${gateSignalsUntilSafe}` : ''}`;
                    const avoidPart = `evitar=${fmtList(retTargets)}`;
                    observerWinRate.textContent = `${lossPart} • ${avoidPart}`;
                } else {
                    const entPart = (sinceEntrada != null) ? `ENTR atual=${sinceEntrada} alvo(s)=${fmtList(entryTargets)}${entryTargetWindow ? `±${entryTargetWindow}` : ''}` : 'ENTR —';
                    const retPart = (sinceRet != null) ? `RED atual=${sinceRet} evitar=${fmtList(retTargets)}` : 'RED —';
                    observerWinRate.textContent = `${entPart} • ${retPart}`;
                }
                observerWinRate.style.color = '#cdd6e8';
            }
        }
        
        // Atualizar probabilidades por estágio (ciclo)
        const obsHigh = document.getElementById('obsHigh');
        if (obsHigh) {
            const pct = Number.isFinite(Number(safe.entryWinPct)) ? Number(safe.entryWinPct) : 0;
            const count = Number.isFinite(Number(safe.entryWinCount)) ? Number(safe.entryWinCount) : 0;
            obsHigh.textContent = totalCycles > 0
                ? `${pct.toFixed(1)}% (${count}/${totalCycles}) • Δ ${fmtList(entryTargets)}`
                : '—';
        }
        
        const obsMedium = document.getElementById('obsMedium');
        if (obsMedium) {
            const pct = Number.isFinite(Number(safe.g1WinPct)) ? Number(safe.g1WinPct) : 0;
            const count = Number.isFinite(Number(safe.g1WinCount)) ? Number(safe.g1WinCount) : 0;
            obsMedium.textContent = totalCycles > 0
                ? `${pct.toFixed(1)}% (${count}/${totalCycles}) • Δ ${fmtList(g1Targets)}`
                : '—';
        }
        
        const obsLow = document.getElementById('obsLow');
        if (obsLow) {
            const pct = Number.isFinite(Number(safe.g2WinPct)) ? Number(safe.g2WinPct) : 0;
            const count = Number.isFinite(Number(safe.g2WinCount)) ? Number(safe.g2WinCount) : 0;
            obsLow.textContent = totalCycles > 0
                ? `${pct.toFixed(1)}% (${count}/${totalCycles}) • Δ ${fmtList(g2Targets)}`
                : '—';
        }
    }
    
    // Função para carregar dados do observador
    function loadObserverStats() {
        const currentMode = document.querySelector('.ai-mode-toggle.active') ? 'diamond' : 'standard';
        console.log('📡 Enviando mensagem: getMasterSignalStats...', currentMode);
        chrome.runtime.sendMessage({ action: 'getMasterSignalStats', mode: currentMode }, function(response) {
            console.log('📡 Resposta recebida:', response);
            if (response && response.status === 'success') {
                console.log('✅ Stats do observador recebidas:', response.stats);
                updateObserverUI(response.stats);
            } else {
                console.error('❌ Erro ao carregar stats do observador:', response);
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // 👑 SINAL DE ENTRADA - Refresh com debounce (não spammar runtime)
    // ═══════════════════════════════════════════════════════════════
    // ⚠️ Usar var para evitar TDZ caso mensagens cheguem antes do fim do carregamento do content.js
    var masterStatsRefreshTimer = null;
    function scheduleMasterSignalStatsRefresh(delayMs = 250) {
        try {
            if (masterStatsRefreshTimer) {
                clearTimeout(masterStatsRefreshTimer);
            }
            masterStatsRefreshTimer = setTimeout(() => {
                masterStatsRefreshTimer = null;
                loadObserverStats();
            }, Math.max(0, Number(delayMs) || 0));
        } catch (_) {}
    }
    
    // Event listener para botão de atualizar
    document.addEventListener('click', function(e) {
        if (e.target && e.target.id === 'diamondLevelsBtn') {
            e.preventDefault();
            openDiamondLevelsModal();
        }

        if (e.target && e.target.id === 'standardSimulationBtn') {
            e.preventDefault();
            openStandardSimulationModal();
        }

        if (e.target && e.target.id === 'diamondLevelsSaveBtn') {
            e.preventDefault();
            saveDiamondLevels();
        }

        if (e.target && e.target.id === 'diamondLevelsRestoreBtn') {
            e.preventDefault();
            if (!diamondLevelsRestoreSnapshot) {
                showCenteredNotice('Não há configurações anteriores para restaurar.', { title: 'Restaurar', autoHide: 3000 });
                return;
            }
            populateDiamondLevelsForm(diamondLevelsRestoreSnapshot);
            refreshDiamondLevelToggleStates();
            showCenteredNotice('Configurações restauradas.', { title: 'Restaurar', autoHide: 2000 });
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

    // ═══════════════════════════════════════════════════════════════════════════════
    // ATUALIZAÇÃO AUTOMÁTICA DO HISTÓRICO DE GIROS DO SERVIDOR
    // ═══════════════════════════════════════════════════════════════════════════════
    
    const API_URL = 'https://blaze-giros-api-v2-1.onrender.com';
    const GIROS_HISTORY_LIMIT = 10000; // ✅ buffer para análise (mantém 500 visíveis via currentHistoryDisplayLimit)
    let isUpdatingHistory = false;
    let lastHistoryUpdate = null;
    let isWebSocketConnected = true; // Assume conectado inicialmente
    let historyPollingInterval = null; // Intervalo de polling para histórico
    
    // ✅ Fallback LEVE (anti-travamento):
    // Quando o WebSocket cai, NÃO puxar 10k giros em loop (isso congela o navegador).
    // Em vez disso, usamos /api/giros/latest (payload mínimo) apenas como redundância.
    let isPollingLatestSpin = false;
    let lastPolledSpinKey = null;
    
    // Buscar giros do servidor (até 10.000 para análise)
    async function fetchHistoryFromServer() {
        if (isUpdatingHistory) return;
        
        let startTime = Date.now();
        try {
            isUpdatingHistory = true;
            
            startTime = Date.now();
            console.log('⏱️ [TIMING] Iniciando fetch em:', new Date().toLocaleTimeString());

            // ✅ Robustez: 10k giros pode estourar o timeout em conexão/servidor lento.
            // Tentar 10k com timeout maior e fazer fallback automático (mantém o app vivo e mostra giros).
            const attempts = [
                { limit: GIROS_HISTORY_LIMIT, timeoutMs: 30000 },
                { limit: 5000, timeoutMs: 22000 },
                { limit: 2000, timeoutMs: 16000 },
                { limit: 500, timeoutMs: 12000 }
            ];

            const fetchWithTimeout = async (url, timeoutMs) => {
                // AbortSignal.timeout existe no Chrome moderno; fallback para AbortController.
                try {
                    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
                        return await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
                    }
                } catch (_) {}
                const controller = new AbortController();
                const t = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 12000));
                try {
                    return await fetch(url, { signal: controller.signal });
                } finally {
                    clearTimeout(t);
                }
            };

            for (let i = 0; i < attempts.length; i++) {
                const { limit, timeoutMs } = attempts[i];
                const attemptStart = Date.now();
                const label = `${limit}giros/${timeoutMs}ms`;
                try {
                    const response = await fetchWithTimeout(`${API_URL}/api/giros?limit=${limit}`, timeoutMs);
                    const fetchTime = Date.now() - attemptStart;
                    console.log(`⏱️ [TIMING] Fetch (${label}) completou em ${fetchTime}ms`);

                    if (!response.ok) {
                        throw new Error(`Servidor offline - Status ${response.status}`);
                    }

                    const data = await response.json();
                    const totalTime = Date.now() - attemptStart;
                    console.log(`⏱️ [TIMING] JSON (${label}) parseado em ${totalTime}ms total`);

                    if (data && data.success && Array.isArray(data.data) && data.data.length) {
                        if (limit !== GIROS_HISTORY_LIMIT) {
                            console.warn(`⚠️ Histórico parcial carregado (${data.data.length}). Tentativa anterior demorou/abortou.`);
                        } else {
                            console.log(`✅ ${data.data.length} giros carregados em ${totalTime}ms`);
                        }
                        lastHistoryUpdate = new Date();
                        return data.data;
                    }
                } catch (err) {
                    const msg = (err && err.message) ? err.message : String(err);
                    console.warn(`⚠️ [TIMING] Falha no fetch (${label}):`, msg);
                }
            }

            return []; // todas tentativas falharam
        } catch (error) {
            const totalTime = Date.now() - startTime;
            console.error(`❌ [TIMING] Erro ao buscar giros (${totalTime}ms):`, error && error.message ? error.message : error);
            return [];
        } finally {
            isUpdatingHistory = false;
        }
    }
    
    // Buscar APENAS o último giro do servidor (fallback leve)
    async function fetchLatestSpinFromServer() {
        try {
            const response = await fetch(`${API_URL}/api/giros/latest`, {
                signal: AbortSignal.timeout(5000)
            });
            
            if (!response.ok) {
                throw new Error(`Servidor offline - Status ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data && data.success && data.data) {
                return data.data;
            }
            
            return null;
        } catch (error) {
            // Silencioso (não spammar o console a cada tick)
            return null;
        }
    }
    
    function normalizeSpinFromServer(rawSpin) {
        if (!rawSpin || typeof rawSpin !== 'object') return null;
        
        const number = (rawSpin.number !== undefined && rawSpin.number !== null) ? rawSpin.number : rawSpin.roll;
        const color = rawSpin.color || rawSpin.rollColor || rawSpin.roll_color || rawSpin.colour || null;
        const timestamp = rawSpin.timestamp || rawSpin.created_at || rawSpin.createdAt || rawSpin.time || null;
        
        if (number === undefined || number === null) return null;
        if (!color) return null;
        if (!timestamp) return null;
        
        return { number, color, timestamp };
    }
    
    async function pollLatestSpinAndUpdateUI() {
        if (isPollingLatestSpin) return;
        isPollingLatestSpin = true;
        
        try {
            const raw = await fetchLatestSpinFromServer();
            const latestSpin = normalizeSpinFromServer(raw);
            if (!latestSpin) return;
            
            const key = latestSpin.timestamp || `${latestSpin.number}-${latestSpin.color}`;
            if (lastPolledSpinKey && key === lastPolledSpinKey) return;
            lastPolledSpinKey = key;
            
            // Atualizar UI incrementalmente (sem re-render pesado do histórico completo)
            try {
                updateSidebar({ lastSpin: latestSpin });
            } catch (_) {}
            
            requestAnimationFrame(() => {
                try {
                    updateHistoryUIInstant(latestSpin);
                } catch (_) {}
            });
        } finally {
            isPollingLatestSpin = false;
        }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // 🚀 ATUALIZAÇÃO INSTANTÂNEA DO HISTÓRICO (SEM REQUISIÇÃO HTTP)
    // ═══════════════════════════════════════════════════════════════
    function updateHistoryUIInstant(newSpin) {
        // ⚠️ Importante: o número pode ser 0 (BRANCO). Não usar checagem "falsy".
        if (!newSpin || newSpin.number === undefined || newSpin.number === null) return;

        // ✅ Manter o card "Padrão" (Últimos X giros) sempre sincronizado com o buffer local,
        // mesmo quando o giro for duplicado e a UI do histórico não precisar re-renderizar.
        const syncPatternLastSpinsUI = () => {
            try {
                const patternInfoEl = document.getElementById('patternInfo');
                if (patternInfoEl) {
                    refreshPatternLastSpins(patternInfoEl, PATTERN_LAST_SPINS_LIMIT);
                }
            } catch (_) {}
        };
        
        // ✅ ADICIONAR NOVO GIRO NO INÍCIO DO HISTÓRICO LOCAL
        if (currentHistoryData.length > 0) {
            // Verificar duplicata apenas na "janela recente" (novo giro sempre entra no topo)
            const maxCheck = Math.min(currentHistoryData.length, 60);
            const newTs = newSpin.timestamp;
            const newNum = newSpin.number;
            const newTime = newTs ? new Date(newTs).getTime() : NaN;
            
            let exists = false;
            for (let i = 0; i < maxCheck; i++) {
                const spin = currentHistoryData[i];
                if (!spin) continue;
                
                if (spin.timestamp === newTs) {
                    exists = true;
                    break;
                }
                
                if (spin.number === newNum) {
                    const spinTime = spin.timestamp ? new Date(spin.timestamp).getTime() : NaN;
                    if (Number.isFinite(spinTime) && Number.isFinite(newTime) && Math.abs(spinTime - newTime) < 2000) {
                        exists = true;
                        break;
                    }
                }
            }
            
            // Se já existe, NÃO re-renderizar (evita custo alto em duplicatas/loops)
            if (exists) {
                // Ainda assim, manter o card "Padrão" sincronizado (evita ficar 1 giro atrasado)
                syncPatternLastSpinsUI();
                return;
            }
            
            currentHistoryData.unshift(newSpin);
            // ✅ [OTIMIZAÇÃO] Manter no máximo 10.000 giros - remover apenas o último (mais eficiente que slice)
            if (currentHistoryData.length > GIROS_HISTORY_LIMIT) {
                currentHistoryData.pop(); // Remove apenas o último (O(1) vs O(n) do slice)
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

                // Dashboard desktop: botão do topo (+ no servidor) + preenchimento automático no fullscreen
                try { bindHistoryLoadMoreIndicator(); } catch (_) {}
                try { ensureHistoryFullscreenFillsSpace(); } catch (_) {}
                
                // 🆕 Adicionar event listener para o botão "Carregar Mais" (criação inicial - otimizado)
                const loadMoreBtn = document.getElementById('loadMoreHistoryBtn');
                if (loadMoreBtn) {
                    loadMoreBtn.onclick = function handleLoadMore() {
                        const remaining = currentHistoryData.length - currentHistoryDisplayLimit;
                        const increment = 500;
                        const addAmount = remaining > increment ? increment : remaining;
                        
                        currentHistoryDisplayLimit += addAmount;
                        console.log(`📊 Carregando mais ${addAmount} giros. Total exibido: ${currentHistoryDisplayLimit}`);
                        
                        const container = document.getElementById('spin-history-bar-ext');
                        if (container) {
                            container.innerHTML = renderSpinHistory(currentHistoryData);
                        }
                        
                        // Re-adicionar event listener (onclick substitui automaticamente)
                        const newLoadMoreBtn = document.getElementById('loadMoreHistoryBtn');
                        if (newLoadMoreBtn) {
                            newLoadMoreBtn.onclick = handleLoadMore;
                        }
                    };
                }
                // Também sincronizar o bloco de "Últimos giros" no card Padrão.
                syncPatternLastSpinsUI();
                return; // Container criado com sucesso!
            }
            // Mesmo sem container, tentar sincronizar o bloco de "Últimos giros" no card Padrão.
            syncPatternLastSpinsUI();
            return;
        }
        
        // Container já existe - apenas atualizar
        if (currentHistoryData.length > 0) {
            // SALVAR posição do scroll (sempre no topo para novos giros)
            historyContainer.innerHTML = renderSpinHistory(currentHistoryData);
            historyContainer.style.display = 'block';

            // Dashboard desktop: botão do topo (+ no servidor) + preenchimento automático no fullscreen
            try { bindHistoryLoadMoreIndicator(); } catch (_) {}
            try { ensureHistoryFullscreenFillsSpace(); } catch (_) {}
            
            // ✅ Re-adicionar event listener para o botão "Carregar Mais" (otimizado)
            const loadMoreBtn = document.getElementById('loadMoreHistoryBtn');
            if (loadMoreBtn) {
                loadMoreBtn.onclick = function handleLoadMore() {
                    const remaining = currentHistoryData.length - currentHistoryDisplayLimit;
                    const increment = 500;
                    const addAmount = remaining > increment ? increment : remaining;
                    
                    currentHistoryDisplayLimit += addAmount;
                    console.log(`📊 Carregando mais ${addAmount} giros. Total exibido: ${currentHistoryDisplayLimit}`);
                    
                    historyContainer.innerHTML = renderSpinHistory(currentHistoryData);
                    
                    // Re-adicionar event listener (onclick substitui automaticamente)
                    const newLoadMoreBtn = document.getElementById('loadMoreHistoryBtn');
                    if (newLoadMoreBtn) {
                        newLoadMoreBtn.onclick = handleLoadMore;
                    }
                };
            }
        }
        
        // ✅ ATUALIZAR TOTAL DE GIROS
        const totalSpins = document.getElementById('totalSpins');
        if (totalSpins) {
            totalSpins.textContent = currentHistoryData.length;
        }

        // ✅ Sempre sincronizar o bloco de "Últimos giros" no card Padrão após atualizar o buffer/local UI.
        syncPatternLastSpinsUI();
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

                // Dashboard desktop: botão do topo (+ no servidor) + preenchimento automático no fullscreen
                try { bindHistoryLoadMoreIndicator(); } catch (_) {}
                try { ensureHistoryFullscreenFillsSpace(); } catch (_) {}
                
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
                
                // ✅ Adicionar event listener para o botão "Carregar Mais" (otimizado - sem duplicação)
                const loadMoreBtn = document.getElementById('loadMoreHistoryBtn');
                if (loadMoreBtn) {
                    // ✅ Usar onclick para substituir automaticamente (evita acúmulo de listeners)
                    loadMoreBtn.onclick = function() {
                        const remaining = spins.length - currentHistoryDisplayLimit;
                        const increment = 500;
                        const addAmount = remaining > increment ? increment : remaining;
                        
                        currentHistoryDisplayLimit += addAmount;
                        console.log(`📊 Carregando mais ${addAmount} giros. Total exibido agora: ${currentHistoryDisplayLimit}`);
                        
                        // Re-renderizar com novo limite
                        historyContainer.innerHTML = renderSpinHistory(currentHistoryData);
                        
                        // Re-anexar handler automaticamente (onclick substitui, não acumula)
                        const newLoadMoreBtn = document.getElementById('loadMoreHistoryBtn');
                        if (newLoadMoreBtn) {
                            newLoadMoreBtn.onclick = arguments.callee;
                        }
                    };
                }
            } else {
                // Se container não existe, criar
                const statsSection = document.querySelector('.stats-section');
                if (statsSection) {
                    const wrap = document.createElement('div');
                    wrap.id = 'spin-history-bar-ext';
                    wrap.innerHTML = renderSpinHistory(spins);
                    statsSection.appendChild(wrap);

                    // Dashboard desktop: botão do topo (+ no servidor) + preenchimento automático no fullscreen
                    try { bindHistoryLoadMoreIndicator(); } catch (_) {}
                    try { ensureHistoryFullscreenFillsSpace(); } catch (_) {}
                    
                    // ✅ Adicionar event listener para o botão "Carregar Mais" (criação inicial - otimizado)
                    const loadMoreBtn = document.getElementById('loadMoreHistoryBtn');
                    if (loadMoreBtn) {
                        // ✅ Usar onclick para substituir automaticamente (evita acúmulo de listeners)
                        loadMoreBtn.onclick = function() {
                            const remaining = spins.length - currentHistoryDisplayLimit;
                            const increment = 500;
                            const addAmount = remaining > increment ? increment : remaining;
                            
                            currentHistoryDisplayLimit += addAmount;
                            console.log(`📊 Carregando mais ${addAmount} giros. Total exibido agora: ${currentHistoryDisplayLimit}`);
                            
                            // Re-renderizar com novo limite
                            wrap.innerHTML = renderSpinHistory(currentHistoryData);
                            
                            // Re-anexar handler automaticamente (onclick substitui, não acumula)
                            const newLoadMoreBtn = document.getElementById('loadMoreHistoryBtn');
                            if (newLoadMoreBtn) {
                                newLoadMoreBtn.onclick = arguments.callee;
                            }
                        };
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
        console.log('%c║  🔄 POLLING DE HISTÓRICO (LEVE) ATIVADO                  ║', 'color: #FF6B00; font-weight: bold;');
        console.log('%c║  WebSocket desconectado - fallback via /latest          ║', 'color: #FF6B00; font-weight: bold;');
        console.log('%c║  Frequência: a cada 5 segundos                          ║', 'color: #FF6B00; font-weight: bold;');
        console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #FF6B00; font-weight: bold;');
        console.log('');
        
        // ✅ Fallback leve: polling do /latest (payload mínimo) – sem puxar 10k em loop
        // Rodar uma vez imediatamente e depois em intervalo
        pollLatestSpinAndUpdateUI();
        historyPollingInterval = setInterval(() => {
            pollLatestSpinAndUpdateUI();
        }, 5000);
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
