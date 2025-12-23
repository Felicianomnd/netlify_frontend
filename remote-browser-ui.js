// ═══════════════════════════════════════════════════════════════
// 🖥️ REMOTE BROWSER UI - Controle remoto do navegador Blaze
// Permite visualizar e interagir com o navegador do servidor em tempo real
// ═══════════════════════════════════════════════════════════════

class RemoteBrowser {
    constructor(wsUrl) {
        // Forçar WSS se estiver em HTTPS
        if (window.location.protocol === 'https:' && wsUrl.startsWith('ws:')) {
            wsUrl = wsUrl.replace('ws:', 'wss:');
        }
        this.wsUrl = wsUrl;
        this.ws = null;
        this.canvas = null;
        this.ctx = null;
        this.container = null;
        this.isConnected = false;
        this.lastFrameTime = 0;
        this.lastMouseMoveTime = 0;  // Para throttle do mouse
        this.fps = 0;
        // Posição do cursor remoto (para desenhar)
        this.remoteCursorX = 0;
        this.remoteCursorY = 0;
        this.lastFrameImage = null;  // Guardar último frame
        this.keepaliveInterval = null;  // 🔥 NOVO: Intervalo para keepalive
    }
    
    // 🔥 NOVO: Criar interface em MODAL FULLSCREEN SEPARADO
    createUI() {
        console.log('[RemoteBrowser] 🎨 Criando interface fullscreen...');
        
        // ✅ Desktop (Dashboard novo): anexar no workspace (lado direito) e não cobrir a coluna de configurações
        const dash = document.getElementById('blaze-double-analyzer');
        const dashMain = dash && dash.classList && dash.classList.contains('da-desktop-dashboard')
            ? dash.querySelector('.da-desktop-main')
            : null;
        const host = dashMain || document.body;

        // Criar modal fullscreen
        this.modalOverlay = document.createElement('div');
        this.modalOverlay.id = 'remoteBrowserModal';
        const isDocked = !!dashMain;
        this.modalOverlay.style.cssText = isDocked
            ? `
                position: absolute;
                inset: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.92);
                z-index: 80;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 20px;
              `
            : `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.95);
            z-index: 999999;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
        `;
        
        // Criar container do Remote Browser
        this.container = document.createElement('div');
        this.container.id = 'remoteBrowserContainer';
        this.container.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 12px;
            align-items: center;
            max-width: 100%;
            max-height: 100%;
        `;
        
        // Canvas para exibir frames (PROPORÇÃO IPHONE 12: 390x844)
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'remoteBrowserCanvas';
        this.canvas.width = 390;  // iPhone 12 width (resolução interna)
        this.canvas.height = 844; // iPhone 12 height (resolução interna)
        this.canvas.style.cssText = `
            width: auto;
            height: 80vh;
            max-height: 700px;
            background: #000;
            cursor: default;
            display: block;
            border: none;
            border-radius: 15px;
            box-shadow: 0 0 30px rgba(0, 0, 0, 0.5);
        `;
        
        this.ctx = this.canvas.getContext('2d');
        
        // Desenhar fundo inicial (preto com texto "Carregando...")
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '20px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Carregando...', this.canvas.width / 2, this.canvas.height / 2);
        
        console.log('[RemoteBrowser] ✅ Canvas criado:', this.canvas.width, 'x', this.canvas.height);
        
        // Botão Fechar
        const closeBtn = document.createElement('button');
        closeBtn.id = 'remoteBrowserClose';
        closeBtn.style.cssText = `
            padding: 12px 32px;
            background: #ef4444;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            transition: all 0.2s;
        `;
        closeBtn.textContent = '✕ Fechar';
        closeBtn.onmouseenter = () => closeBtn.style.background = '#dc2626';
        closeBtn.onmouseleave = () => closeBtn.style.background = '#ef4444';
        
        this.container.appendChild(this.canvas);
        this.container.appendChild(closeBtn);
        
        // Adicionar modal ao host (body ou workspace do dashboard)
        this.modalOverlay.appendChild(this.container);
        host.appendChild(this.modalOverlay);
        
        // Event listeners
        this.setupEventListeners();
        
        return true;
    }
    
    setupEventListeners() {
        // Clique no canvas
        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;
            
            this.sendMouseClick(x, y);
        });
        
        // ═══════════════════════════════════════════════════════════════
        // 🖱️ MOVIMENTO DO MOUSE - Para cursor visual remoto (AnyDesk style)
        // ═══════════════════════════════════════════════════════════════
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;
            
            // Atualizar posição do cursor remoto
            this.remoteCursorX = x;
            this.remoteCursorY = y;
            
            // Redesenhar o frame com o cursor
            this.redrawWithCursor();
            
            this.sendMouseMove(x, y);
        });
        
        // ═══════════════════════════════════════════════════════════════
        // ⌨️ TECLADO - Capturar TODAS as teclas (document, não canvas)
        // ═══════════════════════════════════════════════════════════════
        
        // Capturar keypress no DOCUMENT (sempre funciona)
        document.addEventListener('keypress', (e) => {
            // Se canvas está visível, capturar teclado
            if (this.container && this.container.offsetParent !== null) {
                if (e.key.length === 1) {
                    console.log('[RemoteBrowser] ⌨️ Tecla pressionada:', e.key);
                    this.sendKeyboardType(e.key);
                    e.preventDefault();
                }
            }
        });
        
        // Capturar keydown para teclas especiais
        document.addEventListener('keydown', (e) => {
            // Se canvas está visível, capturar teclado
            if (this.container && this.container.offsetParent !== null) {
                const specialKeys = ['Enter', 'Backspace', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
                if (specialKeys.includes(e.key)) {
                    console.log('[RemoteBrowser] ⌨️ Tecla especial:', e.key);
                    this.sendKeyboardPress(e.key);
                    e.preventDefault();
                }
            }
        });
        
        // Botão de fechar
        const closeBtn = document.getElementById('remoteBrowserClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.stop();
            });
        }
    }
    
        // Conectar ao WebSocket (SEM email/senha - usuário digita manualmente)
    async connect() {
        return new Promise((resolve, reject) => {
            this.log('🔗 Conectando ao servidor...');
            
            this.ws = new WebSocket(this.wsUrl);
            
            this.ws.onopen = () => {
                this.connectedAt = Date.now(); // 🔥 NOVO: Timestamp de conexão
                console.log('[RemoteBrowser] ✅ WebSocket conectado em:', new Date().toISOString());
                this.log('✅ WebSocket conectado!');
                this.updateStatus('Iniciando navegador...');
                
                console.log('[RemoteBrowser] 🚀 Enviando comando start-remote-browser-manual...');
                
                // 🔥 NOVO: Iniciar keepalive (enviar ping a cada 10s para manter conexão através do proxy Render)
                this.startKeepalive();
                
                // Aguardar um pouco antes de enviar (garantir que conexão estabilize)
                setTimeout(() => {
                    const cmd = JSON.stringify({
                        type: 'start-remote-browser-manual'
                    });
                    console.log('[RemoteBrowser] 📤 Enviando:', cmd);
                    this.ws.send(cmd);
                }, 100);
            };
            
            this.ws.onmessage = async (event) => {
                try {
                    // IMPORTANTE: Converter Blob para texto se necessário
                    let textData = event.data;
                    
                    if (event.data instanceof Blob) {
                        console.log('[RemoteBrowser] 📦 Recebido Blob, convertendo para texto...');
                        textData = await event.data.text();
                    }
                    
                    const data = JSON.parse(textData);
                    
                    // LOG: Ver o tipo de mensagem
                    if (data.type === 'frame') {
                        console.log('[RemoteBrowser] 📥 Frame recebido do servidor');
                    } else {
                        console.log('[RemoteBrowser] 📥 Mensagem recebida:', data.type);
                    }
                    
                    this.handleMessage(data);
                    
                    if (data.type === 'browser-started') {
                        this.isConnected = true;
                        resolve(true);
                    } else if (data.type === 'error') {
                        reject(new Error(data.message));
                    }
                } catch (error) {
                    console.error('[RemoteBrowser] ❌ Erro ao processar mensagem:', error);
                    console.error('[RemoteBrowser] ❌ Tipo de data:', typeof event.data, event.data instanceof Blob ? 'É um Blob!' : 'Não é Blob');
                }
            };
            
            this.ws.onerror = (error) => {
                const msg = 'Erro de conexão com o servidor';
                this.log('❌ ' + msg);
                this.updateStatus('Erro');
                reject(new Error(msg));
            };
            
            this.ws.onclose = (event) => {
                const uptime = this.connectedAt ? Math.round((Date.now() - this.connectedAt) / 1000) : 0;
                console.log(`[RemoteBrowser] 🔌 Conexão fechada após ${uptime}s`);
                console.log(`[RemoteBrowser] 📋 Código: ${event.code}, Razão: ${event.reason || 'N/A'}`);
                console.log(`[RemoteBrowser] 🔍 wasClean: ${event.wasClean}`);
                
                this.log(`🔌 Conexão fechada (código: ${event.code}, razão: ${event.reason || 'N/A'})`);
                this.updateStatus('Desconectado');
                this.isConnected = false;
                this.stopKeepalive(); // 🔥 NOVO: Parar keepalive
            };
            
            // Timeout reduzido: se não vier frame em 25s, avisar
            setTimeout(() => {
                if (!this.isConnected) {
                    reject(new Error('Timeout ao conectar (90s). Verifique sua conexão e tente novamente.'));
                }
            }, 90000);
        });
    }
    
    // Processar mensagens do servidor
    handleMessage(data) {
        switch (data.type) {
            case 'connected':
                this.log(`✅ Sessão iniciada (ID: ${data.sessionId.substr(0, 8)}...)`);
                break;
                
            case 'frame':
                // Renderizar frame no canvas
                this.renderFrame(data.data);
                break;
                
            case 'log':
                this.log(data.message);
                break;
                
            case 'browser-started':
                this.log('✅ Navegador iniciado! Faça login na Blaze.');
                this.updateStatus('Online');
                // Focar no canvas
                this.canvas.focus();
                break;
                
            case 'browser-stopped':
                this.log('🛑 Navegador encerrado');
                this.updateStatus('Encerrado');
                break;
                
            case 'click-success':
                // Clique executado com sucesso (feedback silencioso)
                break;
                
            case 'type-success':
                // Digitação executada com sucesso (feedback silencioso)
                break;
                
            case 'error':
                this.log('❌ Erro: ' + data.message);
                this.updateStatus('Erro');
                alert('Erro no Remote Browser: ' + data.message);
                break;
                
            default:
                console.log('[RemoteBrowser] Mensagem desconhecida:', data.type);
        }
    }
    
    // Renderizar frame no canvas
    renderFrame(frameData) {
        // LOG: Verificar se o frame chegou
        if (!frameData || !frameData.image) {
            console.error('[RemoteBrowser] ❌ Frame inválido:', frameData);
            return;
        }
        
        const imageData = frameData.image;
        console.log(`[RemoteBrowser] 🖼️ Frame recebido (${imageData.length} chars)`);
        
        const img = new Image();
        
        img.onload = () => {
            console.log('[RemoteBrowser] ✅ Imagem carregada! Desenhando no canvas...');
            
            // Guardar imagem para redesenhar com cursor
            this.lastFrameImage = img;
            
            // Limpar canvas
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            
            // Desenhar imagem ajustada ao canvas
            this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
            
            // Desenhar cursor por cima
            this.drawCursor();
            
            // Calcular FPS
            const now = Date.now();
            if (this.lastFrameTime > 0) {
                const delta = now - this.lastFrameTime;
                this.fps = Math.round(1000 / delta);
                this.updateFPS(this.fps); // Atualizar FPS separadamente
            }
            this.lastFrameTime = now;
        };
        
        img.onerror = (error) => {
            console.error('[RemoteBrowser] ❌ Erro ao carregar imagem:', error);
            console.error('[RemoteBrowser] ❌ Primeiros 100 chars:', imageData.substring(0, 100));
        };
        
        // Construir data URL
        const dataUrl = 'data:image/jpeg;base64,' + imageData;
        img.src = dataUrl;
    }
    
    // Redesenhar frame com cursor
    redrawWithCursor() {
        if (!this.lastFrameImage) return;
        
        // Redesenhar imagem
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.lastFrameImage, 0, 0, this.canvas.width, this.canvas.height);
        
        // Desenhar cursor
        this.drawCursor();
    }
    
    // Desenhar cursor no canvas (seta preta igual mouse normal)
    drawCursor() {
        if (this.remoteCursorX === 0 && this.remoteCursorY === 0) return;
        
        const x = this.remoteCursorX;
        const y = this.remoteCursorY;
        
        // Desenhar seta do cursor (branca com borda preta)
        this.ctx.save();
        
        // Sombra/borda preta
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;
        this.ctx.fillStyle = '#fff';
        
        // Desenhar seta (triângulo + cauda)
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.ctx.lineTo(x, y + 16);
        this.ctx.lineTo(x + 5, y + 12);
        this.ctx.lineTo(x + 8, y + 20);
        this.ctx.lineTo(x + 10, y + 19);
        this.ctx.lineTo(x + 7, y + 11);
        this.ctx.lineTo(x + 12, y + 11);
        this.ctx.closePath();
        
        this.ctx.fill();
        this.ctx.stroke();
        
        this.ctx.restore();
    }
    
    // Enviar clique
    sendMouseClick(x, y, button = 'left') {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.log('⚠️ WebSocket não conectado');
            return;
        }
        
        this.ws.send(JSON.stringify({
            type: 'mouse-click',
            x: Math.round(x),
            y: Math.round(y),
            button
        }));
        
        this.log(`🖱️ Clique em (${Math.round(x)}, ${Math.round(y)})`);
    }
    
    // Enviar movimento do mouse (THROTTLED - não spammar)
    sendMouseMove(x, y) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }
        
        // Throttle: Enviar apenas 1 a cada 50ms (20 FPS)
        const now = Date.now();
        if (now - this.lastMouseMoveTime < 50) {
            return;
        }
        this.lastMouseMoveTime = now;
        
        this.ws.send(JSON.stringify({
            type: 'mouse-move',
            x: Math.round(x),
            y: Math.round(y)
        }));
    }
    
    // Enviar digitação
    sendKeyboardType(text) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.log('⚠️ WebSocket não conectado');
            return;
        }
        
        this.ws.send(JSON.stringify({
            type: 'keyboard-type',
            text
        }));
        
        this.log(`⌨️ Digitou: "${text}"`);
    }
    
    // Enviar tecla especial
    sendKeyboardPress(key) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.log('⚠️ WebSocket não conectado');
            return;
        }
        
        this.ws.send(JSON.stringify({
            type: 'keyboard-press',
            key
        }));
        
        this.log(`⌨️ Pressionou: ${key}`);
    }
    
    // Atualizar status (removido da UI)
    updateStatus(_text) {}
    
    // Atualizar FPS (removido da UI)
    updateFPS(_fps) {}
    
    // Adicionar log
    log(message) {
        console.log('[RemoteBrowser]', message);
        const logsEl = document.getElementById('remoteBrowserLogs');
        if (logsEl) {
            const line = document.createElement('div');
            const timestamp = new Date().toLocaleTimeString('pt-BR');
            line.textContent = `[${timestamp}] ${message}`;
            line.style.marginBottom = '2px';
            logsEl.appendChild(line);
            logsEl.scrollTop = logsEl.scrollHeight;
            
            // Limitar a 50 linhas
            while (logsEl.children.length > 50) {
                logsEl.removeChild(logsEl.firstChild);
            }
        }
    }
    
    // Confirmar login (botão "Logado")
    async confirmLogin() {
        this.log('✅ Confirmando login...');
        this.updateStatus('Salvando sessão...');
        
        // Solicitar cookies/token do servidor
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ 
                type: 'get-session-data'
            }));
        }
        
        // Aguardar resposta e fechar
        setTimeout(() => {
            this.stop();
        }, 2000);
    }
    
    // 🔥 NOVO: Iniciar keepalive para manter conexão através do proxy
    startKeepalive() {
        console.log('[RemoteBrowser] 💓 Iniciando keepalive (10s)...');
        this.stopKeepalive(); // Limpar qualquer intervalo anterior
        
        this.keepaliveInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                try {
                    this.ws.send(JSON.stringify({ type: 'keepalive' }));
                    console.log('[RemoteBrowser] 💓 Keepalive enviado');
                } catch (error) {
                    console.error('[RemoteBrowser] ❌ Erro ao enviar keepalive:', error);
                }
            } else {
                console.warn('[RemoteBrowser] ⚠️ WebSocket não está OPEN, parando keepalive');
                this.stopKeepalive();
            }
        }, 10000); // A cada 10 segundos
    }
    
    // 🔥 NOVO: Parar keepalive
    stopKeepalive() {
        if (this.keepaliveInterval) {
            console.log('[RemoteBrowser] 💤 Parando keepalive');
            clearInterval(this.keepaliveInterval);
            this.keepaliveInterval = null;
        }
    }
    
    // Parar e fechar
    async stop() {
        this.log('🛑 Encerrando Remote Browser...');
        
        this.stopKeepalive(); // Parar keepalive
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'stop-remote-browser' }));
            this.ws.close();
        }
        
        // 🔥 NOVO: Remover modal e reabrir Autoaposta
        if (this.modalOverlay && this.modalOverlay.parentNode) {
            this.modalOverlay.remove();
        }
        
        // Reabrir modal de Autoaposta
        const autoBetModal = document.getElementById('autoBetSettingsModal');
        if (autoBetModal) {
            autoBetModal.style.display = 'block';
            console.log('✅ Modal de Autoaposta reaberto');
        }
    }
}

// Exportar para uso global
window.RemoteBrowser = RemoteBrowser;

