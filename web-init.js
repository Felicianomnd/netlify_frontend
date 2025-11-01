// ═══════════════════════════════════════════════════════════════════════════════
// WEB INITIALIZATION - GARANTE QUE TUDO DO BACKGROUND.JS SEJA INICIALIZADO
// ═══════════════════════════════════════════════════════════════════════════════

(function() {
    'use strict';

    console.log('%c🚀 INICIALIZANDO BACKGROUND.JS PARA VERSÃO WEB...', 'color: #FFD700; font-weight: bold; font-size: 14px;');

    // ═══════════════════════════════════════════════════════════════════════════════
    // FORÇAR INICIALIZAÇÃO DO BACKGROUND.JS
    // ═══════════════════════════════════════════════════════════════════════════════
    
    // Aguardar 2 segundos para garantir que tudo carregou
    setTimeout(async () => {
        console.log('%c🔍 Verificando funções do background.js...', 'color: #00AAFF; font-weight: bold;');
        
        // Verificar chrome.tabs.query (deve retornar URL da Blaze FAKE)
        if (chrome && chrome.tabs && chrome.tabs.query) {
            try {
                const tabs = await chrome.tabs.query({});
                console.log('%c✅ chrome.tabs.query funcionando:', 'color: #00FF88;', tabs[0].url);
                if (tabs[0].url.includes('blaze')) {
                    console.log('%c✅ URL da Blaze detectada (FAKE) - hasBlazeTabOpen() vai passar!', 'color: #00FF88; font-weight: bold;');
                }
            } catch (e) {
                console.error('%c❌ Erro ao testar chrome.tabs.query:', 'color: #FF0000;', e);
            }
        }
        
        // Verificar listener
        if (chrome && chrome.runtime && chrome.runtime.onMessage) {
            console.log('%c✅ chrome.runtime.onMessage disponível', 'color: #00FF88;');
        } else {
            console.error('%c❌ chrome.runtime.onMessage NÃO disponível!', 'color: #FF0000;');
        }
        
        // Verificar runAnalysisController
        if (typeof runAnalysisController === 'function') {
            console.log('%c✅ runAnalysisController encontrado!', 'color: #00FF88;');
        } else {
            console.error('%c❌ runAnalysisController NÃO encontrado!', 'color: #FF0000;');
        }
        
        // Verificar e INICIAR startDataCollection
        if (typeof startDataCollection === 'function') {
            console.log('%c✅ startDataCollection encontrado!', 'color: #00FF88;');
            
            console.log('');
            console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00FF88; font-weight: bold;');
            console.log('%c║  🚀 INICIANDO COLETA DE DADOS DO SERVIDOR...             ║', 'color: #00FF88; font-weight: bold;');
            console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00FF88; font-weight: bold;');
            console.log('');
            
            try {
                // ⚠️ CRÍTICO: Chamar startDataCollection() que vai iniciar o setInterval(2000ms)
                await startDataCollection();
                
                console.log('');
                console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00FF88; font-weight: bold;');
                console.log('%c║  ✅ BACKGROUND.JS TOTALMENTE INICIALIZADO!                ║', 'color: #00FF88; font-weight: bold; font-size: 14px;');
                console.log('%c║  ⚡ Giros recebidos em TEMPO REAL via WebSocket           ║', 'color: #00AAFF;');
                console.log('%c║  🔄 Análise automática quando modo IA estiver ativo       ║', 'color: #00AAFF;');
                console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00FF88; font-weight: bold;');
                console.log('');
                
            } catch (error) {
                console.error('%c❌ ERRO ao iniciar startDataCollection:', 'color: #FF0000; font-weight: bold;', error);
            }
            
        } else {
            console.error('%c❌ startDataCollection NÃO encontrado!', 'color: #FF0000; font-weight: bold;');
        }
        
    }, 2000);

})();

