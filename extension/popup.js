// popup.js
document.addEventListener('DOMContentLoaded', () => {
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const tokenDisplay = document.getElementById('tokenDisplay');
    const cookiesDisplay = document.getElementById('cookiesDisplay');

    function updatePopupUI(status, token, cookies) {
        statusText.textContent = status;
        statusIndicator.className = `status-indicator ${status === 'Conectado' ? 'connected' : 'pending'}`;
        tokenDisplay.textContent = token || 'N/A';
        cookiesDisplay.textContent = cookies || 'N/A';
    }

    // Solicita os dados do background script ao abrir o popup
    chrome.runtime.sendMessage({ type: "GET_POPUP_DATA" }, (response) => {
        if (response) {
            updatePopupUI(response.status, response.token, response.cookies);
        }
    });

    // Ouve por atualizações do background script (ex: após o login ser enviado ao servidor)
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === "SERVER_RESPONSE") {
            if (request.payload.success) {
                // Se o servidor confirmou o login, atualiza o status
                updatePopupUI('Conectado', request.payload.data.accessToken, request.payload.data.cookieHeader);
            } else {
                // Se houve erro no servidor
                updatePopupUI('Erro', 'N/A', 'N/A');
                console.error("Erro do servidor:", request.payload.error);
            }
        }
        if (request.type === "BLAZE_LOGIN_DATA") {
            // Atualiza o popup com os dados capturados localmente
            updatePopupUI('Conectado', request.payload.token, request.payload.cookies);
        }
    });
});

