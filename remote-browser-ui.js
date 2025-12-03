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
        this.fps = 0;
    }
    
    // Criar interface visual
    createUI() {
        // Substituir o formulário de login pelo canvas
        const loginCard = document.querySelector('.blaze-login-card');
        if (!loginCard) {
            console.error('[RemoteBrowser] ❌ Login card não encontrado');
            return false;
        }
        
        // Criar container do Remote Browser
        this.container = document.createElement('div');
        this.container.id = 'remoteBrowserContainer';
        this.container.style.cssText = `
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: 12px;
        `;
        
        // Header com título e status
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: rgba(255,255,255,0.05);
            border-radius: 8px;
        `;
        header.innerHTML = `
            <div>
                <div style="font-size: 16px; font-weight: bold; color: #fff; margin-bottom: 4px;">
                    🖥️ Navegador Remoto Blaze
                </div>
                <div id="remoteBrowserStatus" style="font-size: 12px; color: #888;">
                    Desconectado
                </div>
            </div>
            <button id="remoteBrowserClose" style="
                padding: 8px 16px;
                background: #ef4444;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-weight: bold;
            ">✖ Fechar</button>
        `;
        
        // Canvas para exibir frames
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'remoteBrowserCanvas';
        this.canvas.width = 1024;
        this.canvas.height = 768;
        this.canvas.style.cssText = `
            width: 100%;
            max-height: 600px;
            border-radius: 8px;
            background: #000;
            cursor: crosshair;
            object-fit: contain;
            border: 2px solid #333;
        `;
        
        this.ctx = this.canvas.getContext('2d');
        
        // Dica de uso
        const hint = document.createElement('div');
        hint.style.cssText = `
            padding: 8px 12px;
            background: rgba(59, 130, 246, 0.1);
            border: 1px solid rgba(59, 130, 246, 0.3);
            border-radius: 6px;
            font-size: 12px;
            color: #60a5fa;
            text-align: center;
        `;
        hint.innerHTML = '💡 <strong>Dica:</strong> Clique na tela para interagir. Você pode clicar em botões, digitar em campos, etc.';
        
        // Logs
        const logsContainer = document.createElement('div');
        logsContainer.id = 'remoteBrowserLogs';
        logsContainer.style.cssText = `
            padding: 12px;
            background: rgba(0,0,0,0.7);
            border-radius: 8px;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            color: #0f0;
            max-height: 120px;
            overflow-y: auto;
            border: 1px solid #333;
        `;
        logsContainer.innerHTML = '<div>🔄 Aguardando conexão...</div>';
        
        this.container.appendChild(header);
        this.container.appendChild(this.canvas);
        this.container.appendChild(hint);
        this.container.appendChild(logsContainer);
        
        // Substituir o conteúdo do login card
        loginCard.innerHTML = '';
        loginCard.appendChild(this.container);
        
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
        
        // Movimento do mouse (hover) - enviar apenas a cada 100ms
        let lastMouseMove = 0;
        this.canvas.addEventListener('mousemove', (e) => {
            const now = Date.now();
            if (now - lastMouseMove < 100) return;  // Throttle
            lastMouseMove = now;
            
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;
            
            this.sendMouseMove(x, y);
        });
        
        // Focus no canvas para capturar teclado
        this.canvas.addEventListener('click', () => {
            this.canvas.focus();
        });
        
        // Digitação (quando o canvas está em foco)
        this.canvas.addEventListener('keypress', (e) => {
            e.preventDefault();
            if (e.key.length === 1) {
                this.sendKeyboardType(e.key);
            }
        });
        
        this.canvas.addEventListener('keydown', (e) => {
            // Teclas especiais (Enter, Backspace, Tab, etc)
            const specialKeys = ['Enter', 'Backspace', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
            if (specialKeys.includes(e.key)) {
                e.preventDefault();
                this.sendKeyboardPress(e.key);
            }
        });
        
        // Tornar canvas focável
        this.canvas.tabIndex = 1;
        
        // Botão de fechar
        const closeBtn = document.getElementById('remoteBrowserClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.stop();
            });
        }
    }
    
    // Conectar ao WebSocket
    async connect(email, password) {
        return new Promise((resolve, reject) => {
            this.log('🔗 Conectando ao servidor BR...');
            this.updateStatus('Conectando...');
            
            this.ws = new WebSocket(this.wsUrl);
            
            this.ws.onopen = () => {
                this.log('✅ WebSocket conectado!');
                this.updateStatus('Conectado - Iniciando navegador...');
                
                // Enviar comando para iniciar navegador remoto
                this.ws.send(JSON.stringify({
                    type: 'start-remote-browser',
                    email,
                    password
                }));
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                    
                    if (data.type === 'browser-started') {
                        this.isConnected = true;
                        resolve(true);
                    } else if (data.type === 'error') {
                        reject(new Error(data.message));
                    }
                } catch (error) {
                    console.error('[RemoteBrowser] ❌ Erro ao processar mensagem:', error);
                }
            };
            
            this.ws.onerror = (error) => {
                const msg = 'Erro de conexão com o servidor';
                this.log('❌ ' + msg);
                this.updateStatus('Erro');
                reject(new Error(msg));
            };
            
            this.ws.onclose = () => {
                this.log('🔌 Conexão fechada');
                this.updateStatus('Desconectado');
                this.isConnected = false;
            };
            
            // Timeout de 30s
            setTimeout(() => {
                if (!this.isConnected) {
                    reject(new Error('Timeout ao conectar (30s)'));
                }
            }, 30000);
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
                this.log('✅ Navegador iniciado! Você pode interagir agora.');
                this.updateStatus('🟢 Online - Clique para interagir');
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
        const img = new Image();
        img.onload = () => {
            // Limpar canvas
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            
            // Desenhar imagem ajustada ao canvas
            this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
            
            // Calcular FPS
            const now = Date.now();
            if (this.lastFrameTime > 0) {
                const delta = now - this.lastFrameTime;
                this.fps = Math.round(1000 / delta);
                this.updateStatus(`🟢 Online - ${this.fps} FPS`);
            }
            this.lastFrameTime = now;
        };
        img.onerror = () => {
            console.error('[RemoteBrowser] ❌ Erro ao carregar frame');
        };
        img.src = 'data:image/jpeg;base64,' + frameData.image;
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
    
    // Enviar movimento do mouse
    sendMouseMove(x, y) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        
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
    
    // Atualizar status
    updateStatus(text) {
        const statusEl = document.getElementById('remoteBrowserStatus');
        if (statusEl) {
            statusEl.textContent = text;
        }
    }
    
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
    
    // Parar e fechar
    async stop() {
        this.log('🛑 Encerrando Remote Browser...');
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'stop-remote-browser' }));
            this.ws.close();
        }
        
        // Aguardar um pouco e recarregar
        setTimeout(() => {
            location.reload();
        }, 1000);
    }
}

// Exportar para uso global
window.RemoteBrowser = RemoteBrowser;

