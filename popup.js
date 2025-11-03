// Popup script for Blaze Double Analyzer
document.addEventListener('DOMContentLoaded', function() {
    const statusDiv = document.getElementById('status');
    const lastSpinBtn = document.getElementById('lastSpinBtn');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const infoBox = document.getElementById('infoBox');
    const lastSpinInfo = document.getElementById('lastSpinInfo');
    const analysisInfo = document.getElementById('analysisInfo');
    const patternInfo = document.getElementById('patternInfo');

    // Check if we're on Blaze site
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const currentTab = tabs[0];
        if (currentTab.url.includes('blaze.bet.br') || currentTab.url.includes('blaze.com')) {
            statusDiv.textContent = '✅ Conectado à Blaze';
            statusDiv.style.background = 'rgba(76, 175, 80, 0.3)';
        } else {
            statusDiv.textContent = '❌ Acesse o site da Blaze';
            statusDiv.style.background = 'rgba(244, 67, 54, 0.3)';
        }
    });

    // Last spin button
    lastSpinBtn.addEventListener('click', function() {
        chrome.storage.local.get(['lastSpin'], function(result) {
            if (result.lastSpin) {
                const spin = result.lastSpin;
                lastSpinInfo.innerHTML = `
                    <strong>Último Giro:</strong><br>
                    Número: <span style="color: ${spin.color === 'red' ? '#F44336' : spin.color === 'black' ? '#000' : '#4CAF50'}">${spin.number}</span><br>
                    Cor: ${spin.color === 'red' ? '🔴 Vermelho' : spin.color === 'black' ? '⚫ Preto' : '⚪ Branco'}<br>
                    Timestamp: ${new Date(spin.timestamp).toLocaleString()}
                `;
                infoBox.style.display = 'block';
            } else {
                lastSpinInfo.innerHTML = '<strong>Nenhum giro encontrado</strong>';
                infoBox.style.display = 'block';
            }
        });
    });

    // Analyze button
    analyzeBtn.addEventListener('click', function() {
        chrome.storage.local.get(['analysis', 'pattern'], function(result) {
            if (result.analysis) {
                const analysis = result.analysis;
                const confidence = analysis.confidence;
                
                let confidenceClass = 'low';
                if (confidence >= 60) confidenceClass = 'high';
                else if (confidence >= 40) confidenceClass = 'medium';
                
                analysisInfo.innerHTML = `
                    <div class="confidence ${confidenceClass}">
                        Confiança: ${confidence.toFixed(1)}%
                    </div>
                    <strong>Sugestão:</strong> ${analysis.suggestion}<br>
                    <strong>Cor recomendada:</strong> ${analysis.color === 'red' ? '🔴 Vermelho' : analysis.color === 'black' ? '⚫ Preto' : '⚪ Branco'}<br>
                    <strong>Probabilidade:</strong> ${analysis.probability.toFixed(1)}%
                `;
                
                if (result.pattern) {
                    patternInfo.innerHTML = `
                        <strong>Padrão identificado:</strong><br>
                        ${result.pattern.description}
                    `;
                }
                
                infoBox.style.display = 'block';
            } else {
                analysisInfo.innerHTML = '<strong>Análise não disponível</strong>';
                infoBox.style.display = 'block';
            }
        });
    });
});
