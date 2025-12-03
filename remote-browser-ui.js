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
    
    // Criar interface visual (SIMPLIFICADA - só canvas)
    createUI() {
        console.log('[RemoteBrowser] 🎨 Criando interface...');
        
        // Substituir o formulário de login pelo canvas
        const loginCard = document.querySelector('.blaze-login-card');
        if (!loginCard) {
            console.error('[RemoteBrowser] ❌ Login card não encontrado');
            return false;
        }
        
        console.log('[RemoteBrowser] ✅ Login card encontrado:', loginCard);
        
        // Criar container do Remote Browser
        this.container = document.createElement('div');
        this.container.id = 'remoteBrowserContainer';
        this.container.style.cssText = `
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: 8px;
            position: relative;
        `;
        
        // Canvas para exibir frames (MODO MOBILE 412x915)
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'remoteBrowserCanvas';
        this.canvas.width = 412;  // Largura mobile
        this.canvas.height = 915; // Altura mobile
        this.canvas.style.cssText = `
            width: 100%;
            max-width: 412px;
            margin: 0 auto;
            border-radius: 8px;
            background: #000;
            cursor: pointer;
            display: block;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
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
        
        // Botão "Logado" (inicialmente oculto)
        const confirmBtn = document.createElement('button');
        confirmBtn.id = 'remoteBrowserConfirm';
        confirmBtn.style.cssText = `
            padding: 12px 24px;
            background: #10b981;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            font-weight: bold;
            display: none;
            margin: 0 auto;
        `;
        confirmBtn.textContent = '✓ Logado';
        
        // Botão Fechar
        const closeBtn = document.createElement('button');
        closeBtn.id = 'remoteBrowserClose';
        closeBtn.style.cssText = `
            padding: 8px 16px;
            background: #ef4444;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            margin: 0 auto;
            display: block;
        `;
        closeBtn.textContent = '✖ Fechar';
        
        // Status (pequeno, discreto)
        const statusDiv = document.createElement('div');
        statusDiv.id = 'remoteBrowserStatus';
        statusDiv.style.cssText = `
            text-align: center;
            font-size: 11px;
            color: #888;
            padding: 4px;
        `;
        statusDiv.textContent = 'Conectando...';
        
        this.container.appendChild(this.canvas);
        this.container.appendChild(statusDiv);
        this.container.appendChild(confirmBtn);
        this.container.appendChild(closeBtn);
        
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
        
        // Movimento do mouse (DESABILITADO - desempenho)
        // Não enviar mouse-move para não causar spam
        
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
    
    // Conectar ao WebSocket (SEM email/senha - usuário digita manualmente)
    async connect() {
        return new Promise((resolve, reject) => {
            this.log('🔗 Conectando ao servidor...');
            this.updateStatus('Conectando...');
            
            this.ws = new WebSocket(this.wsUrl);
            
            this.ws.onopen = () => {
                this.log('✅ WebSocket conectado!');
                this.updateStatus('Iniciando navegador...');
                
                console.log('[RemoteBrowser] 🚀 Enviando comando start-remote-browser-manual...');
                
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
            
            this.ws.onclose = () => {
                this.log('🔌 Conexão fechada');
                this.updateStatus('Desconectado');
                this.isConnected = false;
            };
            
            // Timeout de 15s
            setTimeout(() => {
                if (!this.isConnected) {
                    reject(new Error('Timeout ao conectar (15s). Tente novamente.'));
                }
            }, 15000);
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
                this.updateStatus('🟢 Online - Faça login e clique em "Logado"');
                // Focar no canvas
                this.canvas.focus();
                // Mostrar botão "Logado"
                const confirmBtn = document.getElementById('remoteBrowserConfirm');
                if (confirmBtn) {
                    confirmBtn.style.display = 'block';
                    confirmBtn.onclick = () => this.confirmLogin();
                }
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
        
        img.onerror = (error) => {
            console.error('[RemoteBrowser] ❌ Erro ao carregar imagem:', error);
            console.error('[RemoteBrowser] ❌ Primeiros 100 chars:', imageData.substring(0, 100));
        };
        
        // Construir data URL
        const dataUrl = 'data:image/jpeg;base64,' + imageData;
        img.src = dataUrl;
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
    
    // Enviar movimento do mouse (DESABILITADO - muito spam)
    sendMouseMove(x, y) {
        // Desabilitado para reduzir tráfego
        return;
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

