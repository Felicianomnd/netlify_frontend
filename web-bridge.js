// ═══════════════════════════════════════════════════════════════════════════════
// WEB BRIDGE - Funções de Debug para versão web
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ IMPORTANTE: O background.js JÁ MONITORA NOVOS GIROS automaticamente via
// startDataCollection() que roda collectDoubleData() a cada 2 segundos!
//
// Este arquivo apenas expõe funções de debug para testes manuais no console
// ═══════════════════════════════════════════════════════════════════════════════

(function() {
    'use strict';

    console.log('%c🌐 Web Bridge - Modo DEBUG', 'color: #00AAFF; font-weight: bold;');
    console.log('%c💡 background.js está monitorando giros automaticamente (a cada 2s)', 'color: #00AAFF;');
    console.log('%c💡 Análise ocorre automaticamente quando: NOVO GIRO + MODO IA ATIVO', 'color: #00AAFF;');
    console.log('');
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // FUNÇÕES DE DEBUG (Expor no window para uso manual)
    // ═══════════════════════════════════════════════════════════════════════════════
    
    /**
     * Força uma análise imediata com o histórico atual
     * Uso: window.forceAnalysis()
     */
    window.forceAnalysis = async function() {
        console.log('%c🔧 FORÇANDO ANÁLISE MANUAL...', 'color: #FFD700; font-weight: bold;');
        
        const data = await chrome.storage.local.get(['doubleHistory', 'analyzerConfig']);
        const history = data.doubleHistory || [];
        const config = data.analyzerConfig || {};
        
        console.log(`%c📊 Histórico: ${history.length} giros`, 'color: #00AAFF;');
        console.log(`%c🔧 Modo IA: ${config.aiMode ? 'ATIVO ✅' : 'DESATIVADO ❌'}`, 'color: #00AAFF;');
        
        if (history.length === 0) {
            console.error('%c❌ Sem histórico para analisar!', 'color: #FF0000;');
            return;
        }
        
        if (typeof runAnalysisController === 'function') {
            console.log('%c🚀 Chamando runAnalysisController...', 'color: #00FF88;');
            await runAnalysisController(history);
        } else {
            console.error('%c❌ runAnalysisController não encontrado!', 'color: #FF0000;');
        }
    };
    
    /**
     * Verifica o estado atual do modo IA
     * Uso: window.checkAIMode()
     */
    window.checkAIMode = async function() {
        console.log('%c🔍 VERIFICANDO MODO IA...', 'color: #00AAFF; font-weight: bold;');
        
        const data = await chrome.storage.local.get(['analyzerConfig']);
        const config = data.analyzerConfig || {};
        
        console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00AAFF;');
        console.log(`%c║  Modo IA: ${config.aiMode ? 'ATIVO ✅' : 'DESATIVADO ❌'}                              ║`, 'color: #00AAFF;');
        console.log(`%c║  API Key: ${config.aiApiKey ? 'Configurada ✅' : 'NÃO configurada ❌'}                    ║`, 'color: #00AAFF;');
        console.log(`%c║  Histórico IA: ${config.aiHistorySize || 50} giros                              ║`, 'color: #00AAFF;');
        console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00AAFF;');
        
        return config;
    };
    
    /**
     * Ativa o modo IA manualmente
     * Uso: window.enableAIMode()
     */
    window.enableAIMode = async function() {
        console.log('%c🤖 ATIVANDO MODO IA...', 'color: #00FF88; font-weight: bold;');
        
        const data = await chrome.storage.local.get(['analyzerConfig']);
        const config = data.analyzerConfig || {};
        
        config.aiMode = true;
        
        await chrome.storage.local.set({ analyzerConfig: config });
        
        console.log('%c✅ Modo IA ATIVADO!', 'color: #00FF88; font-weight: bold;');
        console.log('%c⏳ Aguarde o próximo giro para análise automática', 'color: #FFD700;');
        
        // Enviar mensagem para background.js processar mudança
        chrome.runtime.sendMessage({ action: 'aiModeChanged', aiMode: true });
    };
    
    /**
     * Desativa o modo IA manualmente
     * Uso: window.disableAIMode()
     */
    window.disableAIMode = async function() {
        console.log('%c⏸️ DESATIVANDO MODO IA...', 'color: #FFA500; font-weight: bold;');
        
        const data = await chrome.storage.local.get(['analyzerConfig']);
        const config = data.analyzerConfig || {};
        
        config.aiMode = false;
        
        await chrome.storage.local.set({ analyzerConfig: config });
        
        console.log('%c✅ Modo IA DESATIVADO!', 'color: #FFA500; font-weight: bold;');
        
        // Enviar mensagem para background.js processar mudança
        chrome.runtime.sendMessage({ action: 'aiModeChanged', aiMode: false });
    };
    
    /**
     * Mostra estatísticas do histórico atual
     * Uso: window.showHistoryStats()
     */
    window.showHistoryStats = async function() {
        console.log('%c📊 ESTATÍSTICAS DO HISTÓRICO', 'color: #00AAFF; font-weight: bold;');
        
        const data = await chrome.storage.local.get(['doubleHistory']);
        const history = data.doubleHistory || [];
        
        if (history.length === 0) {
            console.log('%c⚠️ Sem histórico disponível', 'color: #FFA500;');
            return;
        }
        
        const last = history[0];
        const colors = history.map(h => h.color);
        const redCount = colors.filter(c => c === 'red').length;
        const blackCount = colors.filter(c => c === 'black').length;
        const whiteCount = colors.filter(c => c === 'white').length;
        
        console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00AAFF;');
        console.log(`%c║  Total de giros: ${history.length}                                     ║`, 'color: #00AAFF;');
        console.log(`%c║  Último giro: ${last.color} (${last.number})                                ║`, 'color: #00AAFF;');
        console.log(`%c║  🔴 Vermelho: ${redCount} (${((redCount/history.length)*100).toFixed(1)}%)                        ║`, 'color: #00AAFF;');
        console.log(`%c║  ⚫ Preto: ${blackCount} (${((blackCount/history.length)*100).toFixed(1)}%)                           ║`, 'color: #00AAFF;');
        console.log(`%c║  ⚪ Branco: ${whiteCount} (${((whiteCount/history.length)*100).toFixed(1)}%)                            ║`, 'color: #00AAFF;');
        console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00AAFF;');
    };
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // LOG DE FUNÇÕES DISPONÍVEIS
    // ═══════════════════════════════════════════════════════════════════════════════
    
    console.log('');
    console.log('%c📌 FUNÇÕES DE DEBUG DISPONÍVEIS:', 'color: #FFD700; font-weight: bold;');
    console.log('%c   window.forceAnalysis()     - Força análise imediata', 'color: #00AAFF;');
    console.log('%c   window.checkAIMode()       - Verifica estado do modo IA', 'color: #00AAFF;');
    console.log('%c   window.enableAIMode()      - Ativa modo IA', 'color: #00AAFF;');
    console.log('%c   window.disableAIMode()     - Desativa modo IA', 'color: #00AAFF;');
    console.log('%c   window.showHistoryStats()  - Mostra estatísticas do histórico', 'color: #00AAFF;');
    console.log('');
    console.log('%c✅ Web Bridge configurado com sucesso!', 'color: #00FF88; font-weight: bold;');
    console.log('');

})();
