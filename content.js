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
    // VARIÁVEL GLOBAL: Controle de exibição do histórico por camadas
    // ═══════════════════════════════════════════════════════════════════════════════
    let currentHistoryDisplayLimit = 500; // Começa exibindo 500, pode aumentar em camadas de 500
    let currentHistoryData = []; // Armazenar histórico atual para re-renderizar
    
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
            <h3 style="margin: 0; color: #FFD700; font-size: 18px;">Nível Diamante Bloqueado</h3>
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
            <p style="margin: 0 0 12px 0;">O <strong>Nível Diamante</strong> utiliza análise avançada por padrões com sistema de auto-aprendizado.</p>
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
        
        // ✅ LOG DE DEBUG
        console.log('🔧 Salvando aiMode no storage:', newAIMode);
        console.log('🔧 Config completa sendo salva:', config);
        chrome.storage.local.set({ analyzerConfig: config }, function() {
            console.log('✅ Configuração salva com sucesso!');
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
        
        // ✅ CAMPOS DO MODO IA: Ocultar quando modo padrão está ativo
        const aiModeFields = [
            'cfgMinPercentage',  // Porcentagem mínima (modo IA)
            'cfgAiApiKey',       // Chave API da IA
            'cfgAiHistorySize'   // Quantidade de giros para IA analisar
        ];
        
        aiModeFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                // Ocultar o elemento pai (setting-item) completamente
                const settingItem = field.closest('.setting-item');
                if (settingItem) {
                    // ✅ Não esconder se foi forçado a ser visível (botão "Configurar Chave API")
                    const isForceVisible = settingItem.getAttribute('data-force-visible') === 'true';
                    if (isForceVisible && fieldId === 'cfgAiApiKey') {
                        // Manter visível
                        settingItem.style.display = '';
                    } else {
                        settingItem.style.display = isAIMode ? '' : 'none';
                    }
                }
            }
        });
        
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
        
    }
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // FUNÇÃO: Atualizar visual do toggle de modo IA
    // ═══════════════════════════════════════════════════════════════════════════════
    function updateAIModeUI(toggleElement, isActive) {
        if (!toggleElement) return;
        
        const modeName = toggleElement.querySelector('.mode-name');
        const modeApi = toggleElement.querySelector('.mode-api');
        
        if (isActive) {
            toggleElement.classList.add('active');
            if (modeName) modeName.textContent = '💎 Nível Diamante Ativo';
            
            // 🧠 Atualizar status dinâmico da memória ativa
            if (modeApi) {
                atualizarStatusMemoriaAtiva(modeApi);
            }
        } else {
            toggleElement.classList.remove('active');
            if (modeName) modeName.textContent = 'Nível Diamante';
            if (modeApi) modeApi.textContent = 'ANÁLISE COM INTELIGÊNCIA ARTIFICIAL IA';
        }
    }

    // 🧠 Atualizar status da memória ativa na interface
    async function atualizarStatusMemoriaAtiva(elemento) {
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
                
                if (!status.inicializada) {
                    // Memória está inicializando
                    console.log('%c🟠 [UI] Atualizando para: INICIALIZANDO MEMÓRIA...', 'color: #FFA500; font-weight: bold;');
                    elemento.textContent = 'ANÁLISE IA | 🔄 INICIALIZANDO MEMÓRIA...';
                    elemento.style.color = '#FFA500'; // Laranja
                } else {
                    // Memória está ativa
                    const updates = status.totalAtualizacoes || 0;
                    
                    const textoNovo = `ANÁLISE IA | MEMÓRIA ATIVA (${updates} updates)`;
                    console.log('%c🟢 [UI] Atualizando para:', 'color: #00FF00; font-weight: bold;', textoNovo);
                    
                    elemento.textContent = textoNovo;
                    elemento.style.color = '#00FF00'; // Verde
                }
                
                console.log('%c✅ [UI] Texto do elemento após atualização:', 'color: #00FF88;', elemento.textContent);
            } else {
                // Fallback se não conseguir pegar status
                console.warn('%c⚠️ [CONTENT] Resposta inválida ou vazia!', 'color: #FFA500; font-weight: bold;');
                console.warn('%c   response:', 'color: #FFA500;', response);
                console.warn('%c   response.status:', 'color: #FFA500;', response?.status);
                elemento.textContent = 'ANÁLISE COM INTELIGÊNCIA ARTIFICIAL IA';
                elemento.style.color = '#00FF88';
            }
        } catch (error) {
            console.error('%c╔══════════════════════════════════════════════════════════╗', 'color: #FF0000; font-weight: bold;');
            console.error('%c║  ❌ [CONTENT] ERRO AO OBTER STATUS!                    ║', 'color: #FF0000; font-weight: bold;');
            console.error('%c╚══════════════════════════════════════════════════════════╝', 'color: #FF0000; font-weight: bold;');
            console.error('%c   Erro:', 'color: #FF0000;', error);
            console.error('%c   Stack:', 'color: #FF0000;', error.stack);
            elemento.textContent = 'ANÁLISE COM INTELIGÊNCIA ARTIFICIAL IA';
            elemento.style.color = '#00FF88';
        }
        
        console.log('%c═══════════════════════════════════════════════════════════', 'color: #00CED1;');
        console.log('');
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
                const result = await chrome.storage.local.get(['analyzerConfig']);
                if (result.analyzerConfig && result.analyzerConfig.aiMode) {
                    const toggleElement = document.getElementById('aiModeToggle');
                    if (toggleElement) {
                        const modeApi = toggleElement.querySelector('.mode-api');
                        if (modeApi) {
                            await atualizarStatusMemoriaAtiva(modeApi);
        }
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
    
    // Criar modal de visualização de padrões
    function createViewPatternsModal() {
        const modalHTML = `
            <div id="viewPatternsModal" class="custom-pattern-modal" style="display: none;">
                <div class="custom-pattern-modal-overlay"></div>
                <div class="custom-pattern-modal-content">
                    <div class="custom-pattern-modal-header">
                        <h3>Padrões Ativos (<span id="modalPatternsCount">0</span>)</h3>
                        <button class="custom-pattern-modal-close" id="closeViewPatternsModal">✕</button>
                    </div>
                    
                    <div class="custom-pattern-modal-body" style="max-height: 400px; overflow-y: auto;">
                        <div id="viewPatternsList"></div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Event listeners
        const modal = document.getElementById('viewPatternsModal');
        const closeBtn = document.getElementById('closeViewPatternsModal');
        const overlay = modal.querySelector('.custom-pattern-modal-overlay');
        
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        
        overlay.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        
        console.log('✅ Modal de visualização de padrões criado');
    }
    
    // Criar modal de padrões customizados
    function createCustomPatternModal() {
        const modalHTML = `
            <div id="customPatternModal" class="custom-pattern-modal" style="display: none;">
                <div class="custom-pattern-modal-overlay"></div>
                <div class="custom-pattern-modal-content">
                    <div class="custom-pattern-modal-header">
                        <h3>Criar Modelo de Análise</h3>
                        <button class="custom-pattern-modal-close" id="closeCustomPatternModal">✕</button>
                    </div>
                    
                    <div class="custom-pattern-modal-body">
                        <!-- Nome do modelo -->
                        <div class="custom-pattern-field">
                            <label class="custom-pattern-label">Nome do Modelo:</label>
                            <input type="text" id="customPatternName" class="custom-pattern-input" placeholder="Ex: Alternância Simples Custom" maxlength="50">
                        </div>
                        
                        <!-- Sequência de cores -->
                        <div class="custom-pattern-field">
                            <label class="custom-pattern-label">Sequência do Padrão:</label>
                            <div id="customPatternSequence" class="custom-pattern-sequence">
                                <!-- Será populado dinamicamente -->
                            </div>
                            <button id="addColorToSequence" class="btn-add-color">➕ Adicionar Cor</button>
                        </div>
                        
                        <!-- Cor anterior -->
                        <div class="custom-pattern-field">
                            <label class="custom-pattern-label">Qual cor deve vir ANTES deste padrão?</label>
                            <div class="custom-pattern-before-colors">
                                <label class="color-radio-label">
                                    <input type="radio" name="beforeColor" value="red-white" class="color-radio" checked>
                                    <span class="color-radio-btn red-white">
                                        <span class="color-circle red"></span>
                                        <span class="or-text">ou</span>
                                        <span class="color-circle white"></span>
                                    </span>
                                </label>
                                <label class="color-radio-label">
                                    <input type="radio" name="beforeColor" value="black-white" class="color-radio">
                                    <span class="color-radio-btn black-white">
                                        <span class="color-circle black"></span>
                                        <span class="or-text">ou</span>
                                        <span class="color-circle white"></span>
                                    </span>
                                </label>
                            </div>
                        </div>
                    </div>
                    
                    <div class="custom-pattern-modal-footer">
                        <button id="saveCustomPattern" class="btn-save-pattern">💾 Salvar Modelo</button>
                        <button id="cancelCustomPattern" class="btn-cancel-pattern">❌ Cancelar</button>
                    </div>
                </div>
            </div>
        `;
        
        // Adicionar modal ao body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Event listeners
        setupCustomPatternModalListeners();
        
        console.log('✅ Modal de padrões customizados criado');
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
                    }
                });
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
        
        console.log('🎯 Modal de padrão customizado aberto');
    }
    
    // Fechar modal
    function closeCustomPatternModal() {
        const modal = document.getElementById('customPatternModal');
        modal.style.display = 'none';
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
    
    // Sincronizar padrões com o servidor
    async function syncPatternsToServer(patterns) {
        const token = localStorage.getItem('authToken');
        if (!token) {
            console.log('⚠️ Usuário não autenticado - salvando apenas localmente');
            return false;
        }
        
        try {
            const apiUrl = getApiUrl();
            const response = await fetch(`${apiUrl}/api/user/custom-patterns`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ patterns })
            });
            
            const data = await response.json();
            
            if (data.success) {
                console.log('✅ Padrões sincronizados com o servidor:', data.message);
                return true;
            } else {
                console.error('❌ Erro ao sincronizar com servidor:', data.error);
                return false;
            }
        } catch (error) {
            console.error('❌ Erro na requisição ao servidor:', error);
            return false;
        }
    }
    
    // Carregar padrões do servidor
    async function loadPatternsFromServer() {
        const token = localStorage.getItem('authToken');
        if (!token) {
            console.log('⚠️ Usuário não autenticado - carregando apenas do localStorage');
            return null;
        }
        
        try {
            const apiUrl = getApiUrl();
            const response = await fetch(`${apiUrl}/api/user/custom-patterns`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                console.log(`✅ ${data.patterns.length} padrão(ões) carregado(s) do servidor`);
                return data.patterns;
            } else {
                console.error('❌ Erro ao carregar do servidor:', data.error);
                return null;
            }
        } catch (error) {
            console.error('❌ Erro na requisição ao servidor:', error);
            return null;
        }
    }
    
    // Salvar modelo customizado
    async function saveCustomPatternModel() {
        const name = document.getElementById('customPatternName').value.trim();
        const sequenceDiv = document.getElementById('customPatternSequence');
        const colorBadges = sequenceDiv.querySelectorAll('.sequence-color-item');
        const beforeColorRadio = document.querySelector('input[name="beforeColor"]:checked');
        
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
        
        // Criar objeto do modelo
        const newPattern = {
            id: 'custom_' + Date.now(),
            name: name,
            sequence: sequence,
            beforeColor: beforeColor,
            active: true,
            createdAt: new Date().toISOString()
        };
        
        // Salvar no storage local
        try {
            const result = await chrome.storage.local.get(['customPatterns']);
            let patterns = result.customPatterns || [];
            patterns.push(newPattern);
            
            await chrome.storage.local.set({ customPatterns: patterns });
            
            console.log('✅ Modelo customizado salvo localmente:', newPattern);
            
            // ✅ SINCRONIZAR COM O SERVIDOR
            const synced = await syncPatternsToServer(patterns);
            if (synced) {
                console.log('✅ Padrão sincronizado com a conta do usuário');
            }
            
            // Fechar modal PRIMEIRO
            closeCustomPatternModal();
            
            // Atualizar lista
            loadCustomPatternsList();
            
            // Notificar background.js
            chrome.runtime.sendMessage({ 
                type: 'CUSTOM_PATTERNS_UPDATED', 
                data: patterns 
            });
            
            // Toast simples (2 segundos)
            showToast('✓ Modelo salvo' + (synced ? ' e sincronizado' : ''));
            
        } catch (error) {
            console.error('❌ Erro ao salvar modelo:', error);
            showToast('✗ Erro ao salvar');
        }
    }
    
    // Carregar lista de modelos customizados
    async function loadCustomPatternsList() {
        try {
            // ✅ TENTAR CARREGAR DO SERVIDOR PRIMEIRO (se autenticado)
            const serverPatterns = await loadPatternsFromServer();
            let patterns = [];
            
            if (serverPatterns !== null) {
                // Carregar do servidor e atualizar localStorage
                patterns = serverPatterns;
                await chrome.storage.local.set({ customPatterns: patterns });
                console.log('✅ Padrões carregados do servidor e sincronizados localmente');
            } else {
                // Carregar do localStorage (fallback)
                const result = await chrome.storage.local.get(['customPatterns']);
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
                    viewPatternsList.innerHTML = patterns.map(pattern => {
                        const sequenceHTML = pattern.sequence.map(color => {
                            return `<span class="spin-color-circle-small ${color}"></span>`;
                        }).join(' ');
                        
                        // ✅ Cor anterior com quadradinhos visuais
                        let beforeColorHTML = '';
                        if (pattern.beforeColor === 'red-white') {
                            beforeColorHTML = '<span class="spin-color-circle-small red"></span> <span style="font-size: 9px; color: #666;">ou</span> <span class="spin-color-circle-small white"></span>';
                        } else if (pattern.beforeColor === 'black-white') {
                            beforeColorHTML = '<span class="spin-color-circle-small black"></span> <span style="font-size: 9px; color: #666;">ou</span> <span class="spin-color-circle-small white"></span>';
                        } else {
                            beforeColorHTML = '<span class="spin-color-circle-small ' + pattern.beforeColor + '"></span>';
                        }
                        
                        return `
                            <div class="view-pattern-item">
                                <div class="view-pattern-name">${pattern.name}</div>
                                <div class="view-pattern-row">
                                    <div class="view-pattern-sequence">${sequenceHTML}</div>
                                    <div class="view-pattern-before">Anterior: ${beforeColorHTML}</div>
                                </div>
                                <button class="view-pattern-remove" onclick="removeCustomPatternFromView('${pattern.id}')">✕</button>
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
    
    // Remover modelo customizado (do modal de visualização)
    window.removeCustomPatternFromView = async function(patternId) {
        try {
            const result = await chrome.storage.local.get(['customPatterns']);
            let patterns = result.customPatterns || [];
            patterns = patterns.filter(p => p.id !== patternId);
            
            await chrome.storage.local.set({ customPatterns: patterns });
            
            console.log('🗑️ Modelo removido localmente:', patternId);
            
            // ✅ SINCRONIZAR REMOÇÃO COM O SERVIDOR
            const synced = await syncPatternsToServer(patterns);
            if (synced) {
                console.log('✅ Remoção sincronizada com o servidor');
            }
            
            // Atualizar lista
            loadCustomPatternsList();
            
            // Notificar background.js
            chrome.runtime.sendMessage({ 
                type: 'CUSTOM_PATTERNS_UPDATED', 
                data: patterns 
            });
            
            // Toast
            showToast('✓ Modelo removido' + (synced ? ' e sincronizado' : ''));
            
        } catch (error) {
            console.error('❌ Erro ao remover modelo:', error);
            showToast('✗ Erro ao remover');
        }
    };
    
    // ✅ Removido: loadCustomPatternsList() agora é chamada diretamente após criar a sidebar

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
                    <h3 class="header-title">Double Analyzer</h3>
                    <div class="ai-mode-toggle" id="aiModeToggle" title="Ativar/Desativar Nível Diamante">
                        <span class="mode-name">Nível Diamante</span>
                        <span class="mode-api">ANÁLISE COM INTELIGÊNCIA ARTIFICIAL IA</span>
                    </div>
                </div>
                <button class="toggle-btn" id="toggleSidebar">−</button>
            </div>
            <div class="analyzer-content" id="analyzerContent">
                <div class="entries-panel" id="entriesPanel">
                    <div class="entries-header">
                        <span>Entradas</span>
                        <span class="entries-hit" id="entriesHit">Acertos: 0/0 (0%)</span>
                    </div>
                    <div class="clear-entries-section">
                        <span class="clear-entries-btn" id="clearEntriesBtn">Limpar histórico</span>
                    </div>
                    <div class="entries-list" id="entriesList"></div>
                </div>
                
                <div class="last-spin-section">
                    <h4>Último Giro</h4>
                    <div class="spin-display center" id="lastSpinDisplay">
                        <div class="spin-number" id="lastSpinNumber">-</div>
                        <div class="spin-meta">
                            <div class="spin-color" id="lastSpinColor">-</div>
                            <div class="spin-time" id="lastSpinTime">--:--</div>
                        </div>
                    </div>
                </div>
                
                 <div class="analysis-section">
                     <h4 id="analysisModeTitle">Aguardando Análise</h4>
                     <div class="confidence-meter">
                         <div class="confidence-bar">
                             <div class="confidence-fill" id="confidenceFill"></div>
                         </div>
                         <div class="confidence-text" id="confidenceText">0%</div>
                     </div>
                     
                     <div class="suggestion-box" id="suggestionBox">
                         <div class="suggestion-text" id="suggestionText">Aguardando análise...</div>
                         <div class="suggestion-color-wrapper">
                             <div class="suggestion-color" id="suggestionColor"></div>
                             <div class="gale-indicator-wrapper" id="galeIndicatorWrapper"></div>
                         </div>
                     </div>
                     
                     <div class="g1-status" id="g1Status" style="display:none;">
                         <div class="g1-indicator">G1: Sinal Ativo</div>
                         <div class="g1-accuracy" id="g1Accuracy">-</div>
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
                        <button id="refreshBankBtn" class="refresh-bank-btn">Buscar Padrões (5min)</button>
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
                        <div class="setting-item">
                            <span class="setting-label">Ocorrências mínima:</span>
                            <input type="number" id="cfgMinOccurrences" min="1" value="1" />
                        </div>
                        <div class="setting-item">
                            <span class="setting-label">Porcentagem mínima (%):</span>
                            <input type="number" id="cfgMinPercentage" min="1" max="100" value="60" placeholder="60" title="Porcentagem mínima de confiança para a IA enviar sinais" />
                        </div>
                        <div class="setting-item">
                            <span class="setting-label">Ocorrências MÁXIMAS (0 = sem limite):</span>
                            <input type="number" id="cfgMaxOccurrences" min="0" value="0" placeholder="0 = sem limite" />
                        </div>
                        <div class="setting-item">
                            <span class="setting-label">Intervalo mínimo (giros):</span>
                            <input type="number" id="cfgMinInterval" min="0" value="0" title="Quantidade mínima de giros entre sinais (0 = sem intervalo, envia sempre que encontrar padrão válido)" placeholder="Ex: 5 giros (0 = sem intervalo)" />
                        </div>
                        <div class="setting-item">
                            <span class="setting-label">Giros para analisar (IA):</span>
                            <input type="number" id="cfgAiHistorySize" min="10" max="2000" placeholder="50" title="Quantidade de giros que a IA vai analisar (mín: 10, máx: 2000)" />
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
                            <input type="number" id="cfgWinPercentOthers" min="0" max="100" value="25" />
                        </div>
                        <div class="setting-item setting-row">
                            <label class="checkbox-label"><input type="checkbox" id="cfgRequireTrigger" checked /> Exigir cor de disparo</label>
                        </div>
                        <div class="setting-item setting-row">
                            <label class="checkbox-label"><input type="checkbox" id="cfgConsecutiveMartingale" /> Martingale Consecutivo</label>
                        </div>
                        <div class="setting-item">
                            <span class="setting-label">Quantidade de Gales (0-200):</span>
                            <input type="number" id="cfgMaxGales" min="0" max="200" value="2" />
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
                            <div style="width: 100%;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0;">
                                    <label style="font-weight: bold; color: #00d4ff; font-size: 13px;">
                                        Modelos de Análise Customizados
                                    </label>
                                    <div style="display: flex; gap: 8px;">
                                        <button id="btnViewCustomPatterns" class="btn-view-patterns" style="display: none;">
                                            ✓ Padrões Ativos (<span id="patternsCount">0</span>)
                                        </button>
                                        <button id="btnAddCustomPattern" class="btn-add-custom-pattern">
                                            ➕ Adicionar Modelo
                                        </button>
                                    </div>
                                </div>
                            </div>
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
        `;
        
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
        
        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00FF88; font-weight: bold;');
        console.log('%c✅ SIDEBAR CRIADA COM SUCESSO!', 'color: #00FF88; font-weight: bold; font-size: 14px;');
        console.log('%c   Sidebar injetada no DOM', 'color: #00FF88;');
        console.log('%c   ID: blaze-double-analyzer', 'color: #00FF88;');
        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00FF88; font-weight: bold;');
        console.log('');
        
        // ═══════════════════════════════════════════════════════════════
        // 🎯 CRIAR MODAL DE PADRÕES CUSTOMIZADOS
        // ═══════════════════════════════════════════════════════════════
        createCustomPatternModal();
        createViewPatternsModal();
        
        // ✅ Carregar padrões customizados imediatamente após criar a sidebar
        console.log('%c🎯 Carregando padrões customizados...', 'color: #00d4ff; font-weight: bold;');
        loadCustomPatternsList();
        
        // 🧠 Iniciar atualização periódica do status da memória ativa
        console.log('%c🧠 Iniciando sistema de atualização de status da memória ativa...', 'color: #00CED1; font-weight: bold;');
        iniciarAtualizacaoMemoria();
        
        // ⚡ CARREGAR HISTÓRICO DO SERVIDOR (agora que a sidebar existe)
        console.log('%c⏱️ [TIMING] Sidebar criada! Carregando histórico...', 'color: #00FF88; font-weight: bold;');
        setTimeout(startAutoHistoryUpdate, 0);
        
        // Load saved position and size
        loadSidebarState(sidebar);
        
        // Update scaling based on initial size
        updateScaling(sidebar);
        
        // Add toggle functionality
        const toggleBtn = document.getElementById('toggleSidebar');
        const content = document.getElementById('analyzerContent');
        
        toggleBtn.addEventListener('click', function() {
            if (content.style.display === 'none') {
                content.style.display = 'block';
                toggleBtn.textContent = '−';
            } else {
                content.style.display = 'none';
                toggleBtn.textContent = '+';
            }
        });
        
        // Wire clear entries history (content-script context; inline handlers won't work)
        const clearEntriesBtn = document.getElementById('clearEntriesBtn');
        if (clearEntriesBtn) {
            clearEntriesBtn.addEventListener('click', function() {
                // Usar modal customizado em vez do confirm() nativo
                showCustomConfirm('Limpar histórico de entradas?', clearEntriesBtn).then(confirmed => {
                    if (confirmed) {
                    try {
                        chrome.storage.local.set({ entriesHistory: [] }, function() {
                            console.log('Histórico de entradas limpo');
                            renderEntriesPanel([]);
                            
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
                        });
                    } catch (e) {
                        console.error('Falha ao limpar entradas:', e);
                    }
                }
                });
            });
        }
        
        // ✅ Toggle de modo IA
        const aiModeToggle = document.getElementById('aiModeToggle');
        if (aiModeToggle) {
            // Carregar estado inicial
            chrome.storage.local.get(['analyzerConfig'], async function(result) {
                const config = result.analyzerConfig || {};
                const isAIMode = config.aiMode || false;
                updateAIModeUI(aiModeToggle, isAIMode);
                // ✅ Aplicar estado dos campos ao carregar
                toggleAIConfigFields(isAIMode);
                
                // 🧠 Se modo IA já estiver ativo, atualizar status imediatamente
                if (isAIMode) {
                    console.log('%c🧠 Modo IA já ativo! Atualizando status da memória...', 'color: #00CED1; font-weight: bold;');
                    const modeApi = aiModeToggle.querySelector('.mode-api');
                    if (modeApi) {
                        // Aguardar 1 segundo para dar tempo do background inicializar
                        setTimeout(async () => {
                            await atualizarStatusMemoriaAtiva(modeApi);
                        }, 1000);
                    }
                }
            });
            
            // Listener de clique
            aiModeToggle.addEventListener('click', function() {
                // ✅ BUSCAR CONFIGURAÇÃO MAIS RECENTE DO STORAGE (pode ter sido salva agora)
                chrome.storage.local.get(['analyzerConfig'], function(result) {
                    // ✅ IMPORTANTE: Mesclar com DEFAULT para garantir que temos todos os campos
                    const DEFAULT_CONFIG = {
                        minOccurrences: 5,
                        minPercentage: 60,
                        maxOccurrences: 0,
                        minIntervalSpins: 0,
                        minPatternSize: 3,
                        maxPatternSize: 0,
                        winPercentOthers: 25,
                        requireTrigger: true,
                        consecutiveMartingale: false,
                        maxGales: 2,
                        telegramChatId: '',
                        aiApiKey: '',
                        aiMode: false
                    };
                    
                    const config = { ...DEFAULT_CONFIG, ...(result.analyzerConfig || {}) };
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
                        <h3>🎯 Padrão da Entrada</h3>
                        <button class="pattern-modal-close">&times;</button>
                    </div>
                    <div class="pattern-modal-body">
                        <div class="entry-info">
                            <div class="entry-color-info">
                                <span class="entry-label">Cor Recomendada:</span>
                                <div class="entry-color-display ${entry.color}">
                                    ${entry.color === 'white' ? blazeWhiteSVG(24) : ''}
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
            
            // Adicionar ao body
            document.body.appendChild(modal);
            
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
                    <h3>⚠️ Padrão Não Disponível</h3>
                    <button class="pattern-modal-close">&times;</button>
                </div>
                <div class="pattern-modal-body">
                    <div class="no-pattern-info">
                        <p>Esta entrada foi registrada antes da implementação do sistema de padrões.</p>
                        <p>Não é possível mostrar o padrão que gerou esta entrada.</p>
                        <div class="entry-summary">
                            <div class="entry-summary-item">
                                <span class="summary-label">Entrada:</span>
                                <div class="entry-color-display ${entry.color}">
                                    ${entry.color === 'white' ? blazeWhiteSVG(20) : ''}
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
            background: linear-gradient(135deg, #1a0f2e 0%, #2a1f3e 100%);
            border: 2px solid rgba(138, 43, 226, 0.6);
            border-radius: 12px;
            padding: 20px;
            margin: 10px 0;
            box-shadow: 0 4px 20px rgba(138, 43, 226, 0.3);
        ">
            <div style="margin: 15px 0;">
                <div style="color: #b794f6; font-weight: bold; font-size: 16px; margin-bottom: 10px;">
                    ${aiData.color === 'red' ? '🔴 Entrar na cor VERMELHA' : aiData.color === 'black' ? '⚫ Entrar na cor PRETA' : '⚪ Entrar na cor BRANCA'}
                </div>
                <div style="color: #e8e8ff; font-size: 13px; margin-bottom: 5px;">
                    Confiança: ${aiData.confidence.toFixed(1)}%
                </div>
            </div>
            
            <div style="
                border-top: 1px solid rgba(138, 43, 226, 0.3);
                padding-top: 15px;
                margin-top: 15px;
            ">
                <div style="
                    color: #b794f6;
                    font-weight: bold;
                    font-size: 14px;
                    margin-bottom: 10px;
                ">💡 ÚLTIMOS 5 GIROS ANALISADOS:</div>
                
                <div style="
                    background: rgba(0, 0, 0, 0.3);
                    border-radius: 8px;
                    padding: 15px;
                    margin: 10px 0;
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
                border-top: 1px solid rgba(138, 43, 226, 0.3);
                padding-top: 15px;
                margin-top: 15px;
            ">
                <div style="
                    color: #b794f6;
                    font-weight: bold;
                    font-size: 14px;
                    margin-bottom: 10px;
                ">🧠 RACIOCÍNIO DA IA:</div>
                <div style="
                    white-space: pre-wrap;
                    font-family: 'Segoe UI', 'Roboto', sans-serif;
                    font-size: 13px;
                    line-height: 1.8;
                    color: #e8e8ff;
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                ">${aiData.reasoning}</div>
            </div>
        </div>`;
    }
    
    // Função auxiliar para renderizar análise IA SEM círculos (formato antigo)
    function renderAIAnalysisOldFormat(aiData) {
        return `<div style="
            background: linear-gradient(135deg, #1a0f2e 0%, #2a1f3e 100%);
            border: 2px solid rgba(138, 43, 226, 0.6);
            border-radius: 12px;
            padding: 20px;
            margin: 10px 0;
            box-shadow: 0 4px 20px rgba(138, 43, 226, 0.3);
        ">
            <pre style="
                white-space: pre-wrap;
                font-family: 'Segoe UI', 'Roboto', sans-serif;
                font-size: 13px;
                line-height: 1.8;
                color: #e8e8ff;
                margin: 0;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
            ">${aiData.reasoning || 'Análise por IA'}</pre>
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
                        background: linear-gradient(135deg, #1a0f2e 0%, #2a1f3e 100%);
                        border: 2px solid rgba(138, 43, 226, 0.6);
                        border-radius: 12px;
                        padding: 20px;
                        margin: 10px 0;
                        box-shadow: 0 4px 20px rgba(138, 43, 226, 0.3);
                    ">
                        <div style="margin: 15px 0;">
                            <div style="color: #b794f6; font-weight: bold; font-size: 16px; margin-bottom: 10px;">
                                ${aiData.color === 'red' ? '🔴 Entrar na cor VERMELHA' : aiData.color === 'black' ? '⚫ Entrar na cor PRETA' : '⚪ Entrar na cor BRANCA'}
                            </div>
                            <div style="color: #e8e8ff; font-size: 13px; margin-bottom: 5px;">
                                Confiança: ${aiData.confidence.toFixed(1)}%
                            </div>
                        </div>
                        
                        <div style="
                            border-top: 1px solid rgba(138, 43, 226, 0.3);
                            padding-top: 15px;
                            margin-top: 15px;
                        ">
                            <div style="
                                color: #b794f6;
                                font-weight: bold;
                                font-size: 14px;
                                margin-bottom: 10px;
                            ">💡 ÚLTIMOS 5 GIROS ANALISADOS:</div>
                            
                            <div style="
                                background: rgba(0, 0, 0, 0.3);
                                border-radius: 8px;
                                padding: 15px;
                                margin: 10px 0;
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
                            border-top: 1px solid rgba(138, 43, 226, 0.3);
                            padding-top: 15px;
                            margin-top: 15px;
                        ">
                            <div style="
                                color: #b794f6;
                                font-weight: bold;
                                font-size: 14px;
                                margin-bottom: 10px;
                            ">🧠 RACIOCÍNIO DA IA:</div>
                            <div style="
                                white-space: pre-wrap;
                                font-family: 'Segoe UI', 'Roboto', sans-serif;
                                font-size: 13px;
                                line-height: 1.8;
                                color: #e8e8ff;
                                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                            ">${aiData.reasoning}</div>
                        </div>
                    </div>`;
                } else {
                    // Formato antigo (texto simples)
                    console.log('%c⚠️ CAIU NO ELSE - Formato antigo (sem círculos)', 'color: #FF0000; font-weight: bold;');
                    console.log('%c   ❓ Motivo: last5Spins não encontrado ou vazio', 'color: #FF0000;');
                    console.log('%c   📦 aiData completo:', 'color: #FF0000;', aiData);
                    return `<div style="
                        background: linear-gradient(135deg, #1a0f2e 0%, #2a1f3e 100%);
                        border: 2px solid rgba(138, 43, 226, 0.6);
                        border-radius: 12px;
                        padding: 20px;
                        margin: 10px 0;
                        box-shadow: 0 4px 20px rgba(138, 43, 226, 0.3);
                    ">
                        <pre style="
                            white-space: pre-wrap;
                            font-family: 'Segoe UI', 'Roboto', sans-serif;
                            font-size: 13px;
                            line-height: 1.8;
                            color: #e8e8ff;
                            margin: 0;
                            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                        ">${aiData.text || aiData.reasoning}</pre>
                    </div>`;
                }
            }
            
            console.log('📝 Não é IA, tentando fazer JSON.parse...');
            // Tentar fazer parse JSON para outros formatos
            try {
                parsed = JSON.parse(parsed);
                console.log('✅ JSON.parse bem-sucedido:', parsed);
            } catch (e) {
                console.error('❌ ERRO no JSON.parse:', e);
                console.error('❌ Conteúdo que causou erro:', parsed);
                return `<div class="pattern-error">Erro ao processar padrão</div>`;
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
                    occurrenceNumbers = lastOccurrenceNumbers[i] || [];
                    occurrenceTimestamps = lastOccurrenceTimestamps[i] || [];
                    trigNum = occDetail.giro_numbers && occDetail.giro_numbers.length > 0 ? occDetail.giro_numbers[0] : '';
                    trigTs = occDetail.timestamp || '';
                    trigClr = occDetail.cor_disparo || null;
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
                    const expInner = expColor === 'white' ? blazeWhiteSVG(16) : `<span></span>`;
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
                    const inner = isWhite ? blazeWhiteSVG(16) : `<span>${number}</span>`;
                    
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
                    const innerTrig = isTrigWhite ? blazeWhiteSVG(16) : `<span>${trigNum}</span>`;
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
        <div style="text-align: center; margin-top: 10px;">
            <button id="loadMoreHistoryBtn" class="load-more-history-btn">
                Carregar Mais ${remainingSpins > 500 ? '(+500)' : '(+' + remainingSpins + ')'}
            </button>
        </div>
        ` : ''}`;
    }
    
    // Update sidebar with new data
    function updateSidebar(data) {
        const lastSpinNumber = document.getElementById('lastSpinNumber');
        const lastSpinColor = document.getElementById('lastSpinColor');
        const confidenceFill = document.getElementById('confidenceFill');
        const confidenceText = document.getElementById('confidenceText');
        const suggestionText = document.getElementById('suggestionText');
        const suggestionColor = document.getElementById('suggestionColor');
        const patternInfo = document.getElementById('patternInfo');
        const totalSpins = document.getElementById('totalSpins');
        const lastUpdate = document.getElementById('lastUpdate');
        // Entries panel will live at top now
        
        if (data.lastSpin) {
            const spin = data.lastSpin;
            // Número com o mesmo estilo do histórico (quadrado com anel)
            lastSpinNumber.className = `spin-number ${spin.color}`;
            if (spin.color === 'white') {
                lastSpinNumber.innerHTML = blazeWhiteSVG(20);
            } else {
                lastSpinNumber.textContent = `${spin.number}`;
            }
            // Rótulo textual da cor (mantido simples)
            lastSpinColor.textContent = spin.color === 'red' ? 'Vermelho' : spin.color === 'black' ? 'Preto' : 'Branco';
            lastSpinColor.className = `spin-color-badge ${spin.color}`;
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
                
                // Só atualiza UI se a análise mudou (evita flutuação a cada 2s)
                const analysisSig = `${analysis.suggestion}|${analysis.color}|${confidence.toFixed(2)}`;
                if (analysisSig !== lastAnalysisSignature) {
                    lastAnalysisSignature = analysisSig;
                    // Update confidence meter
                    confidenceFill.style.width = `${confidence}%`;
                    confidenceText.textContent = `${confidence.toFixed(1)}%`;
                    
                    // Update suggestion
                    suggestionText.textContent = analysis.suggestion;
                    // Cor sugerida com o mesmo estilo do histórico (quadrado com anel)
                    suggestionColor.className = `suggestion-color suggestion-color-box ${analysis.color}`;
                    
                    // ✅ LIMPAR INDICADOR DE GALE (usar o antigo que já existia)
                    const galeIndicatorWrapper = document.getElementById('galeIndicatorWrapper');
                    if (galeIndicatorWrapper) {
                        galeIndicatorWrapper.innerHTML = '';
                    }
                    
                    // Conteúdo do círculo de cor
                    if (analysis.color === 'white') {
                        suggestionColor.innerHTML = blazeWhiteSVG(20);
                    } else {
                        suggestionColor.innerHTML = ''; // Vazio para vermelho/preto (o círculo vem do CSS)
                    }
                    
                    console.log('📊 HTML FINAL do galeIndicatorWrapper:', galeIndicatorWrapper.innerHTML);
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
                            
                            // Verificar se é JSON estruturado de IA
                            if (parsed.type === 'AI_ANALYSIS') {
                                console.log('✅ DETECTADO: Análise por IA (formato JSON estruturado)');
                                console.log('🎲 last5Spins no JSON:', parsed.last5Spins);
                                isAIAnalysis = true;
                                // Passar o objeto data.pattern completo para ter acesso a last5Spins
                                patternInfo.innerHTML = renderPatternVisual(parsed, data.pattern);
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
                const g1Wrap = document.getElementById('g1Status');
                const g1Indicator = document.querySelector('.g1-indicator');
                const g1Accuracy = document.getElementById('g1Accuracy');
                
                // Verificar estado do Martingale para mostrar o indicador correto
                chrome.storage.local.get(['martingaleState'], function(result) {
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
                        
                        if (nextGale && g1Wrap && g1Indicator && g1Accuracy) {
                            g1Wrap.style.display = 'block';
                            g1Indicator.textContent = `${nextGale}: Sinal Ativo`;
                            g1Indicator.className = 'g1-indicator active';
                            
                            // ✅ CALCULAR PORCENTAGEM ESPECÍFICA PARA GALE
                            const galeConfidence = calculateGaleConfidence(martingaleState, analysis);
                            g1Accuracy.textContent = `${galeConfidence.toFixed(1)}%`;
                            
                            console.log('✅ INDICADOR ATIVADO:', nextGale, 'para', lossCount, 'LOSSes', 'Confiança:', galeConfidence.toFixed(1) + '%');
                        }
                    } else {
                        // Sem Martingale ativo, não mostrar indicador
                        if (g1Wrap) g1Wrap.style.display = 'none';
                        console.log('⚠️ Indicador desativado - Martingale não ativo');
                    }
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
                
                // ✅ LIMPAR INDICADOR DE GALE quando não há análise
                const galeIndicatorWrapper = document.getElementById('galeIndicatorWrapper');
                if (galeIndicatorWrapper) {
                    galeIndicatorWrapper.innerHTML = '';
                }
                
                // Verificar se está coletando dados ou buscando padrões
                if (currentAnalysisStatus && currentAnalysisStatus.includes('Coletando dados')) {
                    suggestionText.textContent = currentAnalysisStatus;
                    suggestionColor.className = 'suggestion-color data-collection';
                    suggestionColor.innerHTML = `
                        <div class="analysis-status">
                            <div class="analysis-icon">📊</div>
                            <div class="analysis-text">Coletando dados</div>
                            <div class="analysis-dots">
                                <span class="dot">.</span>
                                <span class="dot">.</span>
                                <span class="dot">.</span>
                            </div>
                        </div>
                    `;
                } else if (currentAnalysisStatus && currentAnalysisStatus.includes('Aguardando')) {
                    // Status de aguardando novo giro
                    suggestionText.textContent = currentAnalysisStatus;
                    suggestionColor.className = 'suggestion-color';
                    suggestionColor.innerHTML = `
                        <div class="analysis-status">
                            <div class="analysis-icon">⏳</div>
                            <div class="analysis-text">Aguardando novo giro</div>
                        </div>
                    `;
                } else {
                    // Status padrão de busca
                    suggestionText.textContent = currentAnalysisStatus || 'Aguardando análise...';
                    suggestionColor.className = 'suggestion-color loading-spinner';
                    suggestionColor.innerHTML = '<div class="spinner"></div>';
                }
                
                patternInfo.textContent = 'Nenhum padrão detectado';
                const g1Wrap = document.getElementById('g1Status');
                if (g1Wrap) g1Wrap.style.display = 'none';
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
    
    // Render de lista de entradas (WIN/LOSS)
    function renderEntriesPanel(entries) {
        const list = document.getElementById('entriesList');
        const hitEl = document.getElementById('entriesHit');
        
        if (!list || !hitEl) {
            return;
        }
        
        // ═══════════════════════════════════════════════════════════════
        // ✅ FILTRAR ENTRADAS - MOSTRAR APENAS RESULTADOS FINAIS
        // ═══════════════════════════════════════════════════════════════
        // REGRA DE EXIBIÇÃO:
        // - WIN (qualquer estágio) → SEMPRE MOSTRAR
        // - LOSS intermediário (continuando para próximo Gale) → NUNCA MOSTRAR
        // - LOSS final (RET ou fim de ciclo) → SEMPRE MOSTRAR
        
        const filteredEntries = entries.filter(e => {
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
        
        console.log(`📊 Entradas: ${entries.length} total | ${filteredEntries.length} exibidas (${entries.length - filteredEntries.length} LOSSes intermediários ocultos)`);
        
        // Renderizar apenas as entradas filtradas
        const items = filteredEntries.map((e) => {
            // Encontrar índice original para manter referência correta ao clicar
            const originalIndex = entries.indexOf(e);
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
            
            return `<div class="entry-item-wrap clickable-entry" title="${title}" data-entry-index="${originalIndex}">
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
        chrome.storage.local.get(['martingaleState', 'analysis'], function(result) {
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
            
            // Adicionar evento de clique para mostrar padrão (precisa ser aqui dentro do callback)
            const clickableEntries = list.querySelectorAll('.clickable-entry');
            clickableEntries.forEach((entryEl) => {
                entryEl.addEventListener('click', function() {
                    const entryIndex = parseInt(this.getAttribute('data-entry-index'), 10);
                    const entry = entries[entryIndex];
                    if (entry) {
                        showPatternForEntry(entry);
                    }
                });
            });
        });
        
        // ═══════════════════════════════════════════════════════════════
        // ✅ CALCULAR ESTATÍSTICAS DOS CICLOS COMPLETOS E TOTAL DE ENTRADAS
        // ═══════════════════════════════════════════════════════════════
        const totalCycles = filteredEntries.length;
        const wins = filteredEntries.filter(e => e.result === 'WIN').length;
        const losses = totalCycles - wins;
        const pct = totalCycles ? ((wins/totalCycles)*100).toFixed(1) : '0.0';
        const totalEntries = entries.length;
        
        // Mostrar placar WIN/LOSS com porcentagem, total de ciclos e total de entradas
        hitEl.innerHTML = `<span class="win-score">WIN: ${wins}</span> <span class="loss-score">LOSS: ${losses}</span> <span class="percentage">(${pct}%)</span> <span class="total-entries">• Total: ${totalCycles} ciclos • ${totalEntries} entradas</span>`;
    }
    
    // Clear entries history function
    function clearEntriesHistory() {
        chrome.storage.local.set({ entriesHistory: [] }, function() {
            console.log('Histórico de entradas limpo');
            renderEntriesPanel([]);
            
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
        let xOffset = 0;
        let yOffset = 0;
        
        header.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);
        
        function dragStart(e) {
            if (e.target.classList.contains('toggle-btn')) return;
            
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
    
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'NEW_ANALYSIS') {
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
        } else if (request.type === 'NEW_SPIN') {
            console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00ff88; font-weight: bold;');
            console.log('%c⚡ NOVO GIRO RECEBIDO! ATUALIZANDO HISTÓRICO INSTANTANEAMENTE!', 'color: #00ff88; font-weight: bold;');
            console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00ff88; font-weight: bold;');
            console.log('📊 Dados do giro:', request.data.lastSpin);
            
            // ✅ ATUALIZAR HISTÓRICO INSTANTANEAMENTE (SEM REQUISIÇÃO HTTP)
            if (request.data && request.data.lastSpin) {
                // Atualizar último giro na sidebar
                updateSidebar({ lastSpin: request.data.lastSpin });
                
                // ✅ NOVO: Atualizar histórico INSTANTANEAMENTE (sem fazer requisição HTTP)
                updateHistoryUIInstant(request.data.lastSpin);
                
                console.log('✅ Histórico atualizado com sucesso! (SEM DELAY - INSTANTÂNEO)');
            } else {
                console.error('❌ ERRO: Dados do giro inválidos!', request.data);
            }
        } else if (request.type === 'CLEAR_ANALYSIS') {
            updateSidebar({ analysis: null, pattern: null });
        } else if (request.type === 'PATTERN_BANK_UPDATE') {
            // Atualizar banco de padrões quando novos forem descobertos
            console.log('📂 Banco de padrões atualizado');
            loadPatternBank();
        } else if (request.type === 'ENTRIES_UPDATE') {
            // Atualizar histórico de entradas (WIN/LOSS)
            updateSidebar({ entriesHistory: request.data });
        } else if (request.type === 'OBSERVER_UPDATE') {
            // Atualizar Calibrador de porcentagens automaticamente
            console.log('╔═══════════════════════════════════════════════════════════╗');
            console.log('║  📊 OBSERVER_UPDATE RECEBIDO!                            ║');
            console.log('╚═══════════════════════════════════════════════════════════╝');
            console.log('📊 Dados recebidos:', request.data);
            updateObserverUI(request.data);
            console.log('✅ updateObserverUI executado!');
        } else if (request.type === 'WEBSOCKET_STATUS') {
            // ✅ GERENCIAR STATUS DO WEBSOCKET
            isWebSocketConnected = request.data.connected;
            
            if (request.data.connected) {
                console.log('');
                console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00FF00; font-weight: bold;');
                console.log('%c║  ✅ WEBSOCKET RECONECTADO!                               ║', 'color: #00FF00; font-weight: bold;');
                console.log('%c║  Histórico voltará a atualizar INSTANTANEAMENTE         ║', 'color: #00FF00;');
                console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00FF00; font-weight: bold;');
                console.log('');
                
                // Parar polling de fallback
                stopHistoryPolling();
            } else {
                console.log('');
                console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #FF0000; font-weight: bold;');
                console.log('%c║  ❌ WEBSOCKET DESCONECTADO!                              ║', 'color: #FF0000; font-weight: bold;');
                console.log('%c║  Ativando polling de fallback (a cada 2 segundos)       ║', 'color: #FF0000;');
                console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #FF0000; font-weight: bold;');
                console.log('');
                
                // Iniciar polling de fallback
                startHistoryPolling();
            }
        } else if (request.type === 'ANALYSIS_STATUS') {
            // Alinhar leitura com emissor (dados vêm em request.data.status)
            const status = request.data && request.data.status ? request.data.status : request.status;
            updateAnalysisStatus(status);
        } else if (request.type === 'INITIAL_SEARCH_START') {
            // Iniciar busca de padrões
            console.log('🔍 Busca inicial de padrões iniciada (5 minutos)');
            updateAnalysisStatus('Buscando padrões... (0/5000)');
        } else if (request.type === 'INITIAL_SEARCH_PROGRESS') {
            // Atualizar progresso da busca
            const total = request.data.total || 0;
            const remaining = request.data.remaining || 0;
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            console.log(`🔍 Busca inicial: ${total}/5000 padrões | ${minutes}m ${seconds}s restantes`);
            updateAnalysisStatus(`Buscando padrões... (${total}/5000) | ${minutes}m ${seconds}s`);
            loadPatternBank(); // Atualizar UI do banco
        } else if (request.type === 'INITIAL_SEARCH_COMPLETE') {
            // Busca concluída
            const total = request.data.total || 0;
            console.log(`✅ Busca inicial concluída: ${total} padrões únicos encontrados!`);
            updateAnalysisStatus('✅ Pronto para jogar!');
            loadPatternBank(); // Atualizar UI do banco
            
            // Reabilitar botão de busca
            const btn = document.getElementById('refreshBankBtn');
            if (btn) {
                btn.textContent = 'Buscar Padrões (5min)';
                btn.disabled = false;
            }
        }
    });
    
    // ✅ Confirmar que o listener foi registrado
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00FF88; font-weight: bold;');
    console.log('%c✅ CONTENT.JS LISTENER REGISTRADO!', 'color: #00FF88; font-weight: bold;');
    console.log('%c   chrome.runtime.onMessage.addListener → PRONTO', 'color: #00FF88;');
    console.log('%c   Aguardando mensagens: NEW_ANALYSIS, NEW_SPIN, etc', 'color: #00FF88;');
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00FF88; font-weight: bold;');
    console.log('');
    
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
                    } else {
                        console.log('📋 Nenhuma entrada no histórico ainda');
                        renderEntriesPanel([]);
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
        const suggestionText = document.getElementById('suggestionText');
        if (suggestionText && suggestionText.textContent !== 'Aguardando análise...') {
            suggestionText.textContent = status;
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
    
    function loadSettings() {
        try {
            chrome.storage.local.get(['analyzerConfig'], function(res) {
                const cfg = res && res.analyzerConfig ? res.analyzerConfig : {};
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
                const aiApiKey = document.getElementById('cfgAiApiKey');
                const minPercentage = document.getElementById('cfgMinPercentage');
                const aiHistorySize = document.getElementById('cfgAiHistorySize');
                if (minOcc) minOcc.value = cfg.minOccurrences != null ? cfg.minOccurrences : 1;
                if (minPercentage) minPercentage.value = cfg.minPercentage != null ? cfg.minPercentage : 60;
                if (maxOcc) maxOcc.value = cfg.maxOccurrences != null ? cfg.maxOccurrences : 0;
                if (minInt) minInt.value = cfg.minIntervalSpins != null ? cfg.minIntervalSpins : 0;
                if (minSize) minSize.value = cfg.minPatternSize != null ? cfg.minPatternSize : 3;
                if (maxSize) maxSize.value = cfg.maxPatternSize != null ? cfg.maxPatternSize : 0;
                if (winPct) winPct.value = cfg.winPercentOthers != null ? cfg.winPercentOthers : 25;
                if (reqTrig) reqTrig.checked = cfg.requireTrigger != null ? cfg.requireTrigger : true;
                if (consecutiveMartingale) consecutiveMartingale.checked = cfg.consecutiveMartingale != null ? cfg.consecutiveMartingale : false;
                if (maxGales) maxGales.value = cfg.maxGales != null ? cfg.maxGales : 2;
                if (tgChatId) tgChatId.value = cfg.telegramChatId || '';
                if (aiApiKey) aiApiKey.value = cfg.aiApiKey || '';
                if (aiHistorySize) aiHistorySize.value = cfg.aiHistorySize != null ? cfg.aiHistorySize : 50;
                
                // 🔧 Carregar configurações avançadas (prompt customizado)
                const advancedModeCheckbox = document.getElementById('cfgAdvancedMode');
                const customPromptTextarea = document.getElementById('cfgCustomPrompt');
                const customPromptSection = document.getElementById('customPromptSection');
                
                if (advancedModeCheckbox) {
                    advancedModeCheckbox.checked = cfg.advancedMode || false;
                    // Mostrar/ocultar seção baseado no estado
                    if (customPromptSection) {
                        customPromptSection.style.display = cfg.advancedMode ? 'block' : 'none';
                    }
                }
                
                if (customPromptTextarea) {
                    customPromptTextarea.value = cfg.customPrompt || '';
                    // Disparar evento para atualizar contador de caracteres
                    customPromptTextarea.dispatchEvent(new Event('input'));
                }
                
                // ✅ Aplicar visibilidade dos campos baseado no modo IA
                const isAIMode = cfg.aiMode || false;
                toggleAIConfigFields(isAIMode);
            });
        } catch (e) { console.error('Erro ao carregar configurações:', e); }
    }

    async function saveSettings() {
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
        chrome.storage.local.get(['analyzerConfig'], async function(result) {
            try {
                const currentConfig = result.analyzerConfig || {};
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
                
                const minOcc = Math.max(parseInt(getElementValue('cfgMinOccurrences', '1'), 10), 1);
                const minPercentage = Math.max(1, Math.min(100, parseInt(getElementValue('cfgMinPercentage', '60'), 10)));
                const maxOcc = Math.max(parseInt(getElementValue('cfgMaxOccurrences', '0'), 10), 0);
                const minInt = Math.max(parseInt(getElementValue('cfgMinInterval', '0'), 10), 0);
                let minSize = Math.max(parseInt(getElementValue('cfgMinPatternSize', '2'), 10), 2);
                let maxSize = Math.max(parseInt(getElementValue('cfgMaxPatternSize', '0'), 10), 0);
                const winPct = Math.max(0, Math.min(100, parseInt(getElementValue('cfgWinPercentOthers', '25'), 10)));
                const reqTrig = getElementValue('cfgRequireTrigger', false, true);
                const consecutiveMartingale = getElementValue('cfgConsecutiveMartingale', false, true);
                const maxGales = Math.max(0, Math.min(200, parseInt(getElementValue('cfgMaxGales', '2'), 10)));
                const tgChatId = String(getElementValue('cfgTgChatId', '')).trim();
                const aiApiKey = String(getElementValue('cfgAiApiKey', '')).trim();
                const aiHistorySize = Math.max(10, Math.min(2000, parseInt(getElementValue('cfgAiHistorySize', '50'), 10)));
                
                // 🔧 Configurações avançadas (prompt customizado)
                const advancedMode = document.getElementById('cfgAdvancedMode') ? document.getElementById('cfgAdvancedMode').checked : false;
                const customPrompt = (document.getElementById('cfgCustomPrompt') ? document.getElementById('cfgCustomPrompt').value : '').trim();
                
                // ✅ RESETAR HISTÓRICO DE SINAIS (limpar penalidades de losses consecutivos)
                console.log('%c🔄 Resetando histórico de sinais (limpar losses consecutivos)...', 'color: #00D4FF; font-weight: bold;');
                await chrome.storage.local.set({
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
                console.log('   • minPercentage:', minPercentage + '%');
                console.log('   • minOccurrences:', minOcc);
                console.log('   • maxOccurrences:', maxOcc);
                console.log('   • minIntervalSpins:', minInt);
                console.log('   • minPatternSize:', minSize);
                console.log('   • maxPatternSize:', maxSize);
                console.log('   • winPercentOthers:', winPct + '%');
                console.log('   • aiHistorySize:', aiHistorySize);
                
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
                
                // ✅ MESCLAR com configuração atual para preservar aiMode e outros estados
                const cfg = {
                    ...currentConfig, // Preservar configurações existentes (incluindo aiMode)
                    minOccurrences: minOcc,
                    minPercentage: minPercentage,
                    maxOccurrences: maxOcc,
                    minIntervalSpins: minInt,
                    minPatternSize: minSize,
                    maxPatternSize: maxSize,
                    winPercentOthers: winPct,
                    requireTrigger: reqTrig,
                    consecutiveMartingale: consecutiveMartingale,
                    maxGales: maxGales,
                    telegramChatId: tgChatId,
                    aiApiKey: aiApiKey,
                    aiHistorySize: aiHistorySize,
                    advancedMode: advancedMode,
                    customPrompt: customPrompt
                };
                
                console.log('');
                console.log('%c💾 Salvando em chrome.storage.local...', 'color: #00FF88; font-weight: bold;');
                console.log('   aiMode preservado:', cfg.aiMode);
                console.log('   Objeto completo:', cfg);
                
                chrome.storage.local.set({ analyzerConfig: cfg }, function() {
                    if (chrome.runtime.lastError) {
                        console.error('%c❌ ERRO ao salvar no storage!', 'color: #FF0000; font-weight: bold;');
                        console.error(chrome.runtime.lastError);
                        showConfigFeedback(false);
                        return;
                    }
                    
                    console.log('%c✅ SALVO NO STORAGE COM SUCESSO!', 'color: #00FF00; font-weight: bold;');
                    console.log('');
                    
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
                        });
                    } catch (e) {
                        console.error('%c❌ Exception ao enviar mensagem:', 'color: #FF0000; font-weight: bold;', e);
                        // ✅ MESMO COM ERRO, OS DADOS JÁ FORAM SALVOS!
                        console.log('%c⚠️ MAS: Configurações JÁ FORAM SALVAS no storage!', 'color: #FFA500; font-weight: bold;');
                        showConfigFeedback(true); // Mostrar sucesso porque salvou
                    }
                });
            } catch (e) {
                console.error('%c❌ ERRO CRÍTICO ao processar configurações:', 'color: #FF0000; font-weight: bold;', e);
                console.error(e.stack);
                showConfigFeedback(false);
            }
        }); // Fecha chrome.storage.local.get
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
        chrome.storage.local.get(['patternDB'], function(result) {
            const db = result.patternDB || { patterns_found: [] };
            const total = db.patterns_found ? db.patterns_found.length : 0;
            
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
        if (e.target && e.target.id === 'refreshBankBtn') {
            e.preventDefault();
            const btn = e.target;
            btn.textContent = 'Buscando padrões...';
            btn.disabled = true;
            
            // Enviar mensagem para background.js iniciar busca de 5 minutos
            chrome.runtime.sendMessage({ action: 'startPatternSearch' }, function(response) {
                if (response && response.status === 'started') {
                    console.log('✅ Busca de padrões iniciada!');
                    // O botão será reabilitado quando a busca terminar (via INITIAL_SEARCH_COMPLETE)
                } else if (response && response.status === 'already_running') {
                    btn.textContent = 'Busca em andamento...';
                    setTimeout(function() {
                        btn.textContent = 'Buscar Padrões (5min)';
                        btn.disabled = false;
                    }, 2000);
                } else if (response && response.status === 'insufficient_data') {
                    btn.textContent = 'Histórico insuficiente';
                    setTimeout(function() {
                        btn.textContent = 'Buscar Padrões (5min)';
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
                    
                    btn.textContent = 'Resetado!';
                    
                    // Atualizar UI
                    loadPatternBank();
                    
                    setTimeout(function() {
                        btn.textContent = 'Resetar Padrões';
                        btn.disabled = false;
                    }, 2000);
                } catch (error) {
                    console.error('%c❌ ERRO AO LIMPAR PADRÕES:', 'color: #FF0000; font-weight: bold;', error);
                    btn.textContent = 'Erro ao resetar';
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
    
    const API_URL = 'https://blaze-giros-api-v2-1.onrender.com';
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
        console.log('%c║  WebSocket desconectado - atualizando via HTTP          ║', 'color: #FF6B00;');
        console.log('%c║  Frequência: a cada 2 segundos                          ║', 'color: #FF6B00;');
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
    
    // ✅ FUNÇÃO PARA CALCULAR CONFIANÇA ESPECÍFICA DO GALE
    function calculateGaleConfidence(martingaleState, analysis) {
        if (!martingaleState || !analysis) return 0;
        
        const lossCount = martingaleState.lossCount || 0;
        const baseConfidence = analysis.confidence || 0;
        const targetColor = martingaleState.entryColor;
        const lossColors = martingaleState.lossColors || [];
        
        console.log('🔍 CALCULANDO CONFIANÇA DO GALE:', {
            lossCount: lossCount,
            baseConfidence: baseConfidence,
            targetColor: targetColor,
            lossColors: lossColors
        });
        
        // ✅ BASE 1: CONFIANÇA ORIGINAL DA ANÁLISE (PESO: 30%)
        const baseWeight = 0.30;
        let weightedConfidence = baseConfidence * baseWeight;
        
        // ✅ BASE 2: PROBABILIDADE ESTATÍSTICA POR LOSSES CONSECUTIVOS (PESO: 25%)
        const consecutiveWeight = 0.25;
        let consecutiveBonus = 0;
        
        if (lossCount === 1) {
            // G1: Probabilidade aumenta 8-12% após 1 LOSS
            consecutiveBonus = 10;
        } else if (lossCount === 2) {
            // G2: Probabilidade aumenta 12-18% após 2 LOSSes
            consecutiveBonus = 15;
        } else if (lossCount >= 3) {
            // G3+: Probabilidade aumenta 15-25% após 3+ LOSSes
            consecutiveBonus = 20;
        }
        
        weightedConfidence += (consecutiveBonus * consecutiveWeight);
        
        // ✅ BASE 3: ANÁLISE DE CORES QUENTES/FRIAS (PESO: 25%)
        const colorAnalysisWeight = 0.25;
        let colorBonus = 0;
        
        // Verificar se a cor alvo está "devendo" sair
        const recentColors = lossColors.slice(-5); // Últimas 5 cores
        const targetColorCount = recentColors.filter(color => color === targetColor).length;
        
        if (targetColorCount === 0) {
            // Cor não saiu nas últimas 5, bonus de 8-15%
            colorBonus = 12;
        } else if (targetColorCount === 1) {
            // Cor saiu apenas 1 vez, bonus de 3-8%
            colorBonus = 5;
        } else {
            // Cor saiu muito, pode estar "quente", bonus menor
            colorBonus = 2;
        }
        
        weightedConfidence += (colorBonus * colorAnalysisWeight);
        
        // ✅ BASE 4: ANÁLISE DE PADRÕES E TENDÊNCIAS (PESO: 20%)
        const patternWeight = 0.20;
        let patternBonus = 0;
        
        // Verificar padrões de alternância
        if (lossColors.length >= 2) {
            const lastTwoColors = lossColors.slice(-2);
            const isAlternating = lastTwoColors[0] !== lastTwoColors[1];
            
            if (isAlternating) {
                // Padrão de alternância detectado, bonus de 5-10%
                patternBonus = 7;
            } else {
                // Mesma cor consecutiva, pode quebrar, bonus de 3-8%
                patternBonus = 5;
            }
        }
        
        // Verificar se há padrão de números específicos
        if (analysis.patternDescription) {
            try {
                let pattern;
                const desc = analysis.patternDescription;
                
                // ✅ VERIFICAR SE É ANÁLISE DE IA
                if (typeof desc === 'string' && desc.trim().startsWith('🤖')) {
                    // É análise de IA - não tem campo "occurrences" no formato esperado
                    // Pular este bonus
                    pattern = null;
                } else {
                    // É análise padrão - fazer parse do JSON
                    pattern = typeof desc === 'string' ? JSON.parse(desc) : desc;
                }
                
                if (pattern && pattern.occurrences >= 3) {
                    // Padrão com muitas ocorrências, bonus adicional
                    patternBonus += 3;
                }
            } catch (e) {
                // Ignorar erro de parsing
            }
        }
        
        weightedConfidence += (patternBonus * patternWeight);
        
        // ✅ APLICAR LIMITES E AJUSTES FINAIS
        let finalConfidence = weightedConfidence;
        
        // Limite mínimo: 45%
        if (finalConfidence < 45) {
            finalConfidence = 45;
        }
        
        // Limite máximo: 95%
        if (finalConfidence > 95) {
            finalConfidence = 95;
        }
        
        // Ajuste baseado no número de Gales (Gales altos têm confiança reduzida)
        if (lossCount >= 4) {
            finalConfidence *= 0.85; // Reduzir 15% para G4+
        } else if (lossCount >= 3) {
            finalConfidence *= 0.90; // Reduzir 10% para G3
        }
        
        console.log('📊 RESULTADO DO CÁLCULO:', {
            baseConfidence: baseConfidence,
            consecutiveBonus: consecutiveBonus,
            colorBonus: colorBonus,
            patternBonus: patternBonus,
            finalConfidence: finalConfidence.toFixed(1)
        });
        
        return Math.round(finalConfidence * 10) / 10; // Arredondar para 1 casa decimal
    }
    
    // ⚠️ REMOVIDO: O histórico agora é carregado APÓS a sidebar ser criada
    // Ver createSidebar() para o novo local de inicialização
    
})();