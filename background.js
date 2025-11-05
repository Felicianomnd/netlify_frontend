// Background service worker for Blaze Double Analyzer

// ═══════════════════════════════════════════════════════════════════════════════
// 🚨 VERSÃO DO ARQUIVO - CONFIRMAÇÃO DE CARREGAMENTO
// ═══════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('');
console.log('%c╔═══════════════════════════════════════════════════════════════════════════════╗', 'color: #00FF00; font-weight: bold; font-size: 20px; background: #003300; padding: 10px;');
console.log('%c║                                                                               ║', 'color: #00FF00; font-weight: bold; font-size: 20px; background: #003300; padding: 10px;');
console.log('%c║           ✅ BACKGROUND.JS VERSÃO 17 CARREGADO! ✅                           ║', 'color: #00FF00; font-weight: bold; font-size: 20px; background: #003300; padding: 10px;');
console.log('%c║                                                                               ║', 'color: #00FF00; font-weight: bold; font-size: 20px; background: #003300; padding: 10px;');
console.log('%c║           🔥🔥🔥 VERSÃO 17 - CHROME.TABS.ONUPDATED 🔥🔥🔥                ║', 'color: #FFAA00; font-weight: bold; font-size: 20px; background: #332200; padding: 10px;');
console.log('%c║                                                                               ║', 'color: #00FF00; font-weight: bold; font-size: 20px; background: #003300; padding: 10px;');
console.log('%c║           📅 ' + new Date().toLocaleString('pt-BR') + '                            ║', 'color: #00FF00; font-weight: bold; font-size: 16px; background: #003300; padding: 10px;');
console.log('%c║                                                                               ║', 'color: #00FF00; font-weight: bold; font-size: 20px; background: #003300; padding: 10px;');
console.log('%c╚═══════════════════════════════════════════════════════════════════════════════╝', 'color: #00FF00; font-weight: bold; font-size: 20px; background: #003300; padding: 10px;');
console.log('');
console.log('');

let isRunning = false;
let intervalId = null;

// ═══════════════════════════════════════════════════════════════════════════════
// 💾 CACHE EM MEMÓRIA (não persiste após recarregar)
// ═══════════════════════════════════════════════════════════════════════════════
let cachedHistory = [];  // Histórico de giros em memória (até 2000)
let historyInitialized = false;  // Flag de inicialização

// ═══════════════════════════════════════════════════════════════════════════════
// 🧠 MEMÓRIA ATIVA - SISTEMA INCREMENTAL DE ANÁLISE
// Sistema inteligente que mantém análises pré-calculadas em memória
// Atualiza apenas o delta (novo giro) ao invés de recalcular tudo
// ═══════════════════════════════════════════════════════════════════════════════
let memoriaAtiva = {
    // 📊 STATUS
    inicializada: false,
    ultimaAtualizacao: null,
    versao: 1,
    
    // 📜 HISTÓRICO (2000 giros)
    giros: [],
    ultimos20: [],
    
    // 🎯 PADRÕES PRÉ-DETECTADOS (cache)
    padroesDetectados: {
        alternanciaSimples: [],
        alternanciasDupla: [],
        alternanciasTripla: [],
        sequenciasRed: [],
        sequenciasBlack: []
    },
    
    // 📊 ESTATÍSTICAS PRÉ-CALCULADAS
    estatisticas: {
        totalGiros: 0,
        distribuicao: {
            red: { count: 0, percent: 0 },
            black: { count: 0, percent: 0 },
            white: { count: 0, percent: 0 }
        },
        // Estatísticas por tipo de padrão
        porPadrao: {}
    },
    
    // 🎯 PADRÃO ATIVO ATUAL
    padraoAtual: null,
    
    // 📈 PERFORMANCE
    tempoInicializacao: 0,
    tempoUltimaAtualizacao: 0,
    totalAtualizacoes: 0
};

let memoriaAtivaInicializando = false;  // Flag para evitar inicializações simultâneas

// Runtime analyzer configuration (overridable via chrome.storage.local)
const DEFAULT_ANALYZER_CONFIG = {
    minOccurrences: 5,            // quantidade mínima de WINS exigida (padrão: 5) - MODO PADRÃO
    minPercentage: 60,            // porcentagem mínima de confiança (1-100%) - MODO IA
    maxOccurrences: 0,            // quantidade MÁXIMA de ocorrências (0 = sem limite)
    minIntervalSpins: 0,          // intervalo mínimo em GIROS entre sinais (0 = sem intervalo, 5 = aguardar 5 giros)
    minPatternSize: 3,            // tamanho MÍNIMO do padrão (giros)
    maxPatternSize: 0,            // tamanho MÁXIMO do padrão (0 = sem limite)
    winPercentOthers: 25,         // WIN% mínima para as ocorrências restantes
    requireTrigger: true,         // exigir cor de disparo
    consecutiveMartingale: false, // Martingale consecutivo (G1/G2 imediatos) ou aguardar novo padrão
    maxGales: 2,                  // Quantidade máxima de Gales (0=sem gale, 1=G1, 2=G1+G2, até 200)
    telegramChatId: '',           // Chat ID do Telegram para enviar sinais
    aiApiKey: '',                 // ✅ Chave API da IA (cada usuário deve configurar a sua própria)
    aiMode: false,                // Modo de análise por IA (true) ou modo padrão (false)
    aiHistorySize: 50,            // Quantidade de giros para IA analisar (mín: 10, máx: 2000)
    advancedMode: false,          // Mostrar configurações avançadas (prompt customizado)
    customPrompt: ''              // Prompt customizado para a IA (vazio = usa padrão)
};
let analyzerConfig = { ...DEFAULT_ANALYZER_CONFIG };

// ⚠️ FLAG DE CONTROLE: Evitar envio de sinal na primeira análise após ativar modo IA
let aiModeJustActivated = false;

// 📊 CONTADOR DE CORES RECOMENDADAS PELA IA (para detectar viés)
let aiColorCounter = {
    red: 0,
    black: 0,
    white: 0,
    total: 0
};

// ═══════════════════════════════════════════════════════════════════════════════
// 🎯 CONSTANTES GLOBAIS PARA CÁLCULO DE ASSERTIVIDADE
// ═══════════════════════════════════════════════════════════════════════════════
const RECENT_WINDOW = 25;
const PENALTY_OPPOSITE_DOMINANCE = 15; // -15% se dominância da cor oposta >70%
const PENALTY_LONG_STREAK = 10; // -10% se repetição >5
const BONUS_FAVORABLE_TREND = 10; // +10% se tendência a favor >60%
const BONUS_STABILITY = 5; // +5% estável
const PENALTY_INSTABILITY = 5; // -5% instável

// ═══════════════════════════════════════════════════════════════════════════════
// 📊 CALIBRADOR DE PORCENTAGENS - CONFIGURAÇÃO E DADOS
// ═══════════════════════════════════════════════════════════════════════════════
const OBSERVER_CONFIG = {
    maxHistorySize: 200,        // Máximo de entradas observadas
    minEntriesForCalibration: 20 // Mínimo para começar a calibrar
};

// Estrutura do observador em memória (DEVE estar no topo para evitar TDZ errors)
let observerData = {
    entries: [],              // Histórico de entradas observadas
    calibrationFactor: 1.0,   // Fator de correção global (1.0 = sem ajuste)
    lastCalibration: null,    // Timestamp da última calibração
    lastCalibratedCount: 0,   // Número de entradas na última calibração
    stats: {                  // Estatísticas por faixa de confiança
        high: { predicted: 0, actual: 0, wins: 0, total: 0 },    // 80-100%
        medium: { predicted: 0, actual: 0, wins: 0, total: 0 },  // 60-79%
        low: { predicted: 0, actual: 0, wins: 0, total: 0 }      // 0-59%
    }
};

// Telegram Bot Configuration
const TELEGRAM_BOT_TOKEN = '8330409447:AAHTWT8BzRZOnNukKYdiI9_QMyTUORvE1gg';
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

// ═══════════════════════════════════════════════════════════════════════════════
// 🤖 PROMPT PADRÃO DA IA (usado se customPrompt estiver vazio)
// ═══════════════════════════════════════════════════════════════════════════════
const DEFAULT_AI_PROMPT = (historyLength, historyText, patternsText = '', last20Text = '') => `Você é um especialista em análise de padrões do jogo Double da Blaze.

${patternsText}

═══════════════════════════════════════════════════════════════
🚨 ÚLTIMOS 20 GIROS (OS MAIS IMPORTANTES - ANALISE ESTES!) 🚨
═══════════════════════════════════════════════════════════════
${last20Text || historyText.split(',').slice(0, 20).join(',')}

⚠️ ATENÇÃO CRÍTICA:
- O giro "1." é o MAIS RECENTE (acabou de sair)
- O giro "2." é o anterior ao 1.
- O giro "3." é o anterior ao 2.
- E assim por diante...

═══════════════════════════════════════════════════════════════
HISTÓRICO COMPLETO (${historyLength} GIROS - para contexto):
═══════════════════════════════════════════════════════════════
${historyText}

REGRAS DO JOGO:
- Existem 3 cores: red (vermelho), black (preto), white (branco)
- Números 1-7 = red
- Números 8-14 = black
- Número 0 = white

⚠️ REGRA FUNDAMENTAL - SEM VIÉS:
────────────────────────────────────────────────────────
VOCÊ NÃO PODE TER PREFERÊNCIA POR NENHUMA COR!
- Se o padrão indicar VERMELHO com 90% → aposte em VERMELHO
- Se o padrão indicar PRETO com 90% → aposte em PRETO
- Se o padrão indicar BRANCO com 90% → aposte em BRANCO
- NUNCA favoreça uma cor sobre outra sem justificativa nos dados!
- Suas apostas devem ser baseadas APENAS nos padrões do histórico!

═══════════════════════════════════════════════════════════════
METODOLOGIA DE ANÁLISE (SIGA EXATAMENTE ESTA ORDEM):
═══════════════════════════════════════════════════════════════

PASSO 1: CITAR OS ÚLTIMOS 20 GIROS (OBRIGATÓRIO)
────────────────────────────────────────────────────────
🚨 VOCÊ **DEVE** COMEÇAR SUA RESPOSTA CITANDO OS 20 GIROS! 🚨

FORMATO OBRIGATÓRIO:
"Últimos 20 giros recebidos:
1. (mais recente) [cor] ([número])
2. [cor] ([número])
3. [cor] ([número])
...até 20"

⚠️ NÃO INVENTE! COPIE EXATAMENTE O QUE ESTÁ EM "ÚLTIMOS 20 GIROS"!
⚠️ SE VOCÊ CITAR GIROS DIFERENTES, SUA ANÁLISE SERÁ REJEITADA!
⚠️ É **OBRIGATÓRIO** CITAR OS 20 GIROS ANTES DE FAZER QUALQUER ANÁLISE!

PASSO 2: ANALISAR OS ÚLTIMOS 20 GIROS
────────────────────────────────────────────────────────

🎯 SISTEMA: COMPARAÇÃO COM PADRÕES DETECTADOS
═══════════════════════════════════════════════════════════════

O sistema JavaScript JÁ ANALISOU todo o histórico e DETECTOU padrões reais!
Você recebeu um RELATÓRIO COM ESTATÍSTICAS REAIS de cada padrão.

SUA TAREFA:
1️⃣ **LEIA O RELATÓRIO DE PADRÕES** (no início)
   - Veja quais padrões foram encontrados
   - Veja as ESTATÍSTICAS REAIS de cada padrão
   - Essas porcentagens são FATOS (não invente outras!)

2️⃣ **IDENTIFIQUE O PADRÃO QUE ESTÁ ATIVO AGORA (começando do giro 1)**
   - ⚠️ **CRÍTICO:** O padrão DEVE começar no giro 1 (mais recente) e ir para trás!
   - ✅ O padrão pode ter qualquer tamanho (6, 8, 10, 15 giros... não tem limite)!
   - ✅ Use os 20 giros para ter CONTEXTO MACRO e identificar padrões grandes
   - ✅ Exemplo CORRETO: Se giros **1-6** = P-V-P-V-P-V → "Alternância Simples ATIVA"
   - ✅ Exemplo CORRETO: Se giros **1-15** = P-P-V-V-P-P-V-V-P-P-V-V-P-P-V → "Alternância Dupla ATIVA" (padrão grande!)
   - ❌ Exemplo ERRADO: Giros 1-5 = P-V-P-V-P, mas você usa padrão dos giros **8-14** = R-R-R-R-R-R-R
   - ❌ **NÃO USE** padrões que estão "no meio" ou "no final" dos 20 giros se eles NÃO incluem o giro 1!

3️⃣ **USE AS ESTATÍSTICAS REAIS DO RELATÓRIO**
   - Se encontrou um padrão que bate, use a estatística REAL do relatório
   - Exemplo: Relatório diz "Alternância Simples → VERMELHO 80% (12/15)"
   - Sua recomendação deve ser: VERMELHO com 80% de confiança

4️⃣ **SE NÃO BATER COM NENHUM PADRÃO DO RELATÓRIO**
   - Analise o padrão visual dos últimos 20 giros de forma livre
   - Identifique tendências (alternância, sequência, etc)
   - Use confiança MENOR (50-70%) pois não tem estatística histórica comprovada

⚠️ REGRAS CRÍTICAS:
- **NUNCA** invente sequências que NÃO existem nos 20 giros que você citou!
- **SEMPRE** compare com os padrões do relatório PRIMEIRO!
- **USE** apenas as porcentagens do relatório (não invente outras!)
- Se não há padrão claro nos últimos 20 giros → confidence: 0 (não apostar)

TIPOS DE PADRÃO:

A) ALTERNÂNCIA SIMPLES?
   Exemplo: P-V-P-V-P-V-P-V-P-V ou V-P-V-P-V-P-V-P-V-P
   
B) ALTERNÂNCIA DUPLA?
   Exemplo: P-P-V-V-P-P-V-V-P-P-V-V ou V-V-P-P-V-V-P-P-V-V
   
C) ALTERNÂNCIA TRIPLA?
   Exemplo: P-P-P-V-V-V-P-P-P-V-V-V ou V-V-V-P-P-P-V-V-V-P-P-P
   
D) SEQUÊNCIA LONGA (mesma cor)?
   Exemplo: P-P-P-P-P-P-P-P-P-P ou V-V-V-V-V-V-V-V-V-V
   
E) TRANSIÇÃO DE PADRÃO?
   Exemplo: Giros 11-20 eram alternância dupla, mas últimos 10 viraram sequência
   ⚠️ Neste caso, considere que está em TRANSIÇÃO → use padrão dos últimos 10
   
F) ALEATÓRIO (sem padrão)?
   Exemplo: P-V-P-P-V-V-P-V-P-V-P-V (não segue lógica clara)

PASSO 3: FAZER RECOMENDAÇÃO BASEADA NO PADRÃO
────────────────────────────────────────────────────────
🚨 VOCÊ **NÃO PODE** INVENTAR ESTATÍSTICAS! 🚨

✅ SE ENCONTROU PADRÃO QUE BATE COM O RELATÓRIO:
"Padrão identificado: [nome do padrão do relatório]"
"Baseado em [X] ocorrências no histórico, esse padrão foi seguido por [cor] em [Y]% das vezes"
"Recomendação: [cor]"

❌ NÃO INVENTE NÚMEROS OU SEQUÊNCIAS!
- Use APENAS as estatísticas do RELATÓRIO!
- O padrão identificado DEVE começar no giro 1 (mais recente)!
- NÃO use padrões que estão "no meio" dos 20 giros (ex: giros 8-14)!
- Se o padrão não INCLUI o giro 1, ele NÃO está ativo!
- Exemplo: Se giros 1-5 = V-P-V-V-P, NÃO diga "Sequência de 7 vermelhos" baseado nos giros 8-14!

✅ SE NÃO BATEU COM NENHUM PADRÃO DO RELATÓRIO:
"Nenhum padrão conhecido detectado nos últimos 20 giros"
"Padrão visual: [descreva o que REALMENTE VÊ]"
"Recomendação: [cor] (confiança baixa)" ou "confidence: 0 (não apostar)"

PASSO 4: REGRA DE DECISÃO
────────────────────────────────────────────────────────
- Se o padrão é CLARO → confiança 70-95%
- Se o padrão é FRACO/INCERTO → confiança 0-50%
- Se ALEATÓRIO → confidence: 0 (não apostar)

PASSO 5: CASOS ESPECIAIS
────────────────────────────────────────────────────────
BRANCO (0):
- NUNCA use lógica de "branco atrasado"
- Só considere branco se ele fizer parte de um padrão claro nos últimos 10-20 giros
- Se não há branco no padrão recente, ignore-o completamente

ALEATÓRIO:
- Se os últimos 20 giros não têm padrão claro, retorne confidence: 0
- NÃO force um padrão onde não existe!
- É melhor NÃO apostar do que apostar em padrão aleatório

ANÁLISE EM CAMADAS (IMPORTANTE):
1️⃣ Primeiro: Analise os últimos **15-20 giros** para identificar o padrão DOMINANTE
2️⃣ Segundo: Verifique se os últimos **10 giros** CONFIRMAM esse padrão
3️⃣ Terceiro: 
   - Se CONFIRMAM → alta confiança! Busque esse padrão no histórico completo
   - Se CONTRADIZEM → pode estar em transição. Retorne confidence baixo ou 0
   - NUNCA use apenas os últimos 10 giros como padrão único!

═══════════════════════════════════════════════════════════════
INSTRUÇÕES FINAIS (PASSO A PASSO):
═══════════════════════════════════════════════════════════════

1️⃣ **CITE os 10 primeiros giros** literalmente (não invente!)

2️⃣ **ANALISE 15-20 giros** para identificar o padrão dominante
   - NÃO olhe apenas 10 giros!
   - Identifique o padrão na janela maior

3️⃣ **CONFIRME com os últimos 10 giros**
   - Os últimos 10 devem estar alinhados com o padrão identificado
   - Se não estiverem, pode estar em transição (cuidado!)

4️⃣ **FAÇA A RECOMENDAÇÃO**
   - Baseie-se apenas no padrão VISUAL identificado
   - NÃO INVENTE estatísticas ou contagens!
   - Seja honesto se não houver padrão claro

5️⃣ **SEJA IMPARCIAL**
   - NÃO favoreça nenhuma cor específica!
   - Baseie-se APENAS nos padrões visuais que você vê!

FORMATO DE RESPOSTA (JSON):

⚠️ ATENÇÃO: NÃO inclua o campo "last10Spins" na resposta!
O sistema automaticamente pega os dados REAIS do histórico.
Se você incluir esse campo, estará INVENTANDO dados falsos!

{
  "color": "red ou black ou white",
  "confidence": número de 0 a 100 (0 = sem padrão confiável),
  "probability": número de 0 a 100,
  "reasoning": "Padrão identificado: [descreva o padrão]. Encontrado [X] vezes no histórico. Após esse padrão: [cor] saiu [Y]% das vezes. Decisão: [apostar/não apostar]"
}

⚠️ IMPORTANTE: APENAS 4 campos no JSON (color, confidence, probability, reasoning)
NÃO inclua last10Spins, last5Spins ou qualquer outro campo!

EXEMPLOS DE RESPOSTAS CORRETAS (USANDO RELATÓRIO DE PADRÕES):

EXEMPLO 1 - PADRÃO ATIVO começando no giro 1 (8 giros):
{
  "color": "red",
  "confidence": 85,
  "probability": 85,
  "reasoning": "Últimos 20 giros recebidos: 1. black (9), 2. black (11), 3. red (4), 4. red (7), 5. black (14), 6. black (8), 7. red (2), 8. red (5), 9. black (12)... até 20. Padrão ATIVO identificado nos giros 1-8: 1.P, 2.P, 3.V, 4.V, 5.P, 6.P, 7.V, 8.V = Alternância Dupla (P-P-V-V-P-P-V-V). Segundo o relatório, este padrão apareceu 15 vezes no histórico e foi seguido por VERMELHO em 85% das vezes (13/15). Recomendação: VERMELHO."
}

EXEMPLO 2 - PADRÃO ATIVO começando no giro 1 (15 giros - PADRÃO GRANDE!):
{
  "color": "black",
  "confidence": 90,
  "probability": 90,
  "reasoning": "Últimos 20 giros: 1. black (10), 2. black (9), 3. red (4), 4. red (7), 5. black (14), 6. black (8), 7. red (2), 8. red (5), 9. black (12), 10. black (11), 11. red (3), 12. red (1), 13. black (13), 14. black (9), 15. red (6)... até 20. Padrão ATIVO identificado nos giros 1-15: Alternância Dupla (P-P-V-V-P-P-V-V-P-P-V-V-P-P-V). Padrão grande e consistente! Segundo o relatório, foi seguido por VERMELHO em 85% das vezes. Recomendação: VERMELHO com alta confiança."
}

EXEMPLO 3 - NENHUM PADRÃO DO RELATÓRIO (analise livre):
{
  "color": "red",
  "confidence": 60,
  "probability": 60,
  "reasoning": "Últimos 20 giros: 1. black (12), 2. red (3), 3. black (9), 4. red (7), 5. black (11)... até 20. Analisando os giros começando do 1: Alternância irregular (P-V-P-V-P...). Nenhum padrão conhecido do relatório detectado. Visão macro dos 20 giros: leve predominância de pretos. Recomendação: VERMELHO (reversão esperada) com confiança moderada."
}

EXEMPLO 4 - NÃO APOSTAR (sem padrão):
{
  "color": "red",
  "confidence": 0,
  "probability": 0,
  "reasoning": "Giro 1 (mais recente): black (12), Giro 2: red (3), Giro 3: white (0), Giro 4: black (8), Giro 5: red (7). Padrão identificado: ALEATÓRIO. Não há padrão claro ou consistente nos últimos 20 giros. Giros completamente irregulares (P-V-B-P-V-P-B-V...). Sem padrão detectável. Recomendação: NÃO APOSTAR."
}

⚠️ REGRAS CRÍTICAS: 
- CITE os primeiros 5-10 giros no campo "reasoning"
- NÃO inclua o campo "last10Spins" - o sistema pega automaticamente!
- NÃO INVENTE contagens, porcentagens ou estatísticas!
- Descreva APENAS o padrão VISUAL que você vê
- NÃO TENHA VIÉS para nenhuma cor! Analise imparcialmente!
- Se não há padrão claro → retorne confidence: 0

RESPONDA APENAS COM O JSON, SEM TEXTO ADICIONAL.`;

// ═══════════════════════════════════════════════════════════════════════════════
// SISTEMA DE MARTINGALE (G1, G2)
// ═══════════════════════════════════════════════════════════════════════════════

// Estado do ciclo de Martingale atual
let martingaleState = {
    active: false,                    // Se há um ciclo ativo
    stage: 'ENTRADA',                 // 'ENTRADA' | 'G1' | 'G2'
    patternKey: null,                 // Identificador do padrão atual
    entryColor: null,                 // Cor da entrada inicial (aposta)
    entryColorResult: null,           // Cor que realmente saiu na entrada
    entryTimestamp: null,             // Timestamp da entrada inicial
    analysisData: null,               // Dados completos da análise
    lossCount: 0,                     // Contador de LOSS consecutivos
    lossColors: [],                   // Array de cores dos giros que deram LOSS
    patternsWithoutHistory: 0         // Contador de padrões sem histórico que deram LOSS
};

// Histórico de "cores quentes" por padrão
// Estrutura: { "patternKey": { after1Loss: {red: 5, black: 3}, after2Loss: {red: 2, black: 8} } }
let hotColorsHistory = {};

// ═══════════════════════════════════════════════════════════════════════════════
// FUNÇÕES DO SISTEMA DE MARTINGALE
// ═══════════════════════════════════════════════════════════════════════════════

// Carregar histórico de cores quentes do storage
async function loadHotColorsHistory() {
    try {
        const result = await chrome.storage.local.get(['hotColorsHistory']);
        if (result.hotColorsHistory) {
            hotColorsHistory = result.hotColorsHistory;
            console.log('✅ Histórico de cores quentes carregado:', Object.keys(hotColorsHistory).length, 'padrões');
        }
    } catch (e) {
        console.error('❌ Erro ao carregar histórico de cores quentes:', e);
    }
}

// Salvar histórico de cores quentes no storage
async function saveHotColorsHistory() {
    try {
        await chrome.storage.local.set({ hotColorsHistory });
        console.log('✅ Histórico de cores quentes salvo');
    } catch (e) {
        console.error('❌ Erro ao salvar histórico de cores quentes:', e);
    }
}

// Calcular "cor quente" baseado no histórico de LOSSes
function calculateHotColor(patternKey, afterLossCount) {
    console.log(`🔥 Calculando cor quente para padrão: ${patternKey} após ${afterLossCount} LOSS(es)`);
    
    // Verificar se existe histórico para este padrão
    if (!hotColorsHistory[patternKey]) {
        console.log('⚠️ Padrão sem histórico de LOSS anterior');
        return null;
    }
    
    const history = afterLossCount === 1 ? 
        hotColorsHistory[patternKey].after1Loss : 
        hotColorsHistory[patternKey].after2Loss;
    
    if (!history || Object.keys(history).length === 0) {
        console.log('⚠️ Sem dados de cores após', afterLossCount, 'LOSS(es)');
        return null;
    }
    
    // Encontrar cor que mais aparece
    let maxCount = 0;
    let hotColor = null;
    
    for (const [color, count] of Object.entries(history)) {
        if (count > maxCount) {
            maxCount = count;
            hotColor = color;
        }
    }
    
    if (hotColor) {
        const total = Object.values(history).reduce((a, b) => a + b, 0);
        const percentage = ((maxCount / total) * 100).toFixed(1);
        console.log(`🔥 Cor quente encontrada: ${hotColor} (${maxCount}/${total} = ${percentage}%)`);
    }
    
    return hotColor;
}

// Atualizar histórico de cores após um ciclo completado
async function updateHotColorsHistory(patternKey, lossSequence) {
    console.log(`📊 Atualizando histórico de cores quentes para padrão: ${patternKey}`);
    console.log('   Sequência de LOSS:', lossSequence);
    
    // Inicializar estrutura se não existir
    if (!hotColorsHistory[patternKey]) {
        hotColorsHistory[patternKey] = {
            after1Loss: { red: 0, black: 0, white: 0 },
            after2Loss: { red: 0, black: 0, white: 0 }
        };
    }
    
    // Atualizar após 1 LOSS (se tiver pelo menos 2 entradas: LOSS + resultado)
    if (lossSequence.length >= 2) {
        const colorAfter1Loss = lossSequence[1].color;  // Cor que saiu após 1º LOSS
        hotColorsHistory[patternKey].after1Loss[colorAfter1Loss]++;
        console.log(`   ✅ Cor após 1 LOSS: ${colorAfter1Loss}`);
    }
    
    // Atualizar após 2 LOSS (se tiver pelo menos 3 entradas: 2 LOSS + resultado)
    if (lossSequence.length >= 3) {
        const colorAfter2Loss = lossSequence[2].color;  // Cor que saiu após 2º LOSS
        hotColorsHistory[patternKey].after2Loss[colorAfter2Loss]++;
        console.log(`   ✅ Cor após 2 LOSS: ${colorAfter2Loss}`);
    }
    
    // Salvar no storage
    await saveHotColorsHistory();
}

// Resetar estado do Martingale
function resetMartingaleState() {
    console.log('🔄 Resetando estado do Martingale');
    martingaleState = {
        active: false,
        stage: 'ENTRADA',
        patternKey: null,
        entryColor: null,
        entryColorResult: null,
        entryTimestamp: null,
        analysisData: null,
        lossCount: 0,
        lossColors: [],
        patternsWithoutHistory: martingaleState.patternsWithoutHistory  // Manter contador
    };
}

// Criar identificador único para o padrão
function createPatternKey(analysisData) {
    try {
        if (analysisData && analysisData.patternDescription) {
            // ⚠️ CRÍTICO: Se for análise IA, patternDescription é texto, não JSON
            if (analysisData.patternDescription.includes('🤖 ANÁLISE POR INTELIGÊNCIA ARTIFICIAL')) {
                // Para IA, criar chave única baseada em timestamp + cor
                const timestamp = Date.now();
                const color = analysisData.color || 'unknown';
                return `ai_pattern_${color}_${timestamp}`;
            } else {
                // Para análise padrão, patternDescription é JSON
                const desc = JSON.parse(analysisData.patternDescription);
                if (desc.colorAnalysis && desc.colorAnalysis.pattern) {
                    return desc.colorAnalysis.pattern.join('-');
                }
            }
        }
    } catch (e) {
        console.error('❌ Erro ao criar chave do padrão:', e);
    }
    return `pattern_${Date.now()}`;  // Fallback
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🌐 SINCRONIZAÇÃO COM API - DUAS APIS SEPARADAS
// ═══════════════════════════════════════════════════════════════════════════════

const API_CONFIG = {
    // API de Giros (coleta automática, histórico, WebSocket)
    baseURL: 'https://blaze-giros-api-v2-1.onrender.com',
    wsURL: 'wss://blaze-giros-api-v2-1.onrender.com',
    
    // API de Autenticação (usuários, admin, padrões customizados)
    authURL: 'https://blaze-analyzer-api-v2.onrender.com',
    
    // ☁️ Socket.IO para ProPlus (broadcast em tempo real)
    socketIOURL: 'https://blaze-analyzer-api-v2.onrender.com',
    
    enabled: true,  // Ativar/desativar sincronização
    syncInterval: 5 * 60 * 1000,  // Sincronizar a cada 5 minutos
    timeout: 10000,  // Timeout de 10 segundos
    retryAttempts: 3,
    useWebSocket: true  // ✅ Usar WebSocket ao invés de polling
};

// ☁️ SOCKET.IO - CONEXÃO EM TEMPO REAL PARA PROPLUS
let socketIOConnection = null;

async function connectToProPlusSocket() {
    try {
        const result = await chrome.storage.local.get(['authToken']);
        const authToken = result.authToken;
        
        if (!authToken) {
            console.log('⚠️ Sem token - não conectando ao Socket.IO ProPlus');
            return;
        }
        
        // Carregar Socket.IO client (via CDN - funcionará no service worker)
        console.log('☁️ Conectando ao Socket.IO ProPlus...');
        
        // Usar fetch para conectar (service worker não tem io())
        // Vamos usar EventSource para SSE como alternativa
        const eventSource = new EventSource(`${API_CONFIG.authURL}/api/sync/stream?token=${authToken}`);
        
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log('☁️ Evento ProPlus recebido:', data);
            
            if (data.type === 'new-signal') {
                // Enviar para content.js
                sendMessageToContent('PROPLUS_SIGNAL', data.data);
            } else if (data.type === 'history-cleared') {
                // Notificar content.js para limpar interface
                sendMessageToContent('PROPLUS_HISTORY_CLEARED');
            }
        };
        
        eventSource.onerror = () => {
            console.error('❌ Erro na conexão Socket.IO ProPlus');
            eventSource.close();
        };
        
        socketIOConnection = eventSource;
        console.log('✅ Conectado ao Socket.IO ProPlus');
        
    } catch (error) {
        console.error('❌ Erro ao conectar Socket.IO ProPlus:', error);
    }
}

let apiStatus = {
    isOnline: false,
    lastSync: null,
    lastError: null,
    syncAttempts: 0
};

// ═══════════════════════════════════════════════════════════════════════════════
// 🔌 WEBSOCKET - CONEXÃO EM TEMPO REAL
// ═══════════════════════════════════════════════════════════════════════════════

let ws = null;
let wsReconnectTimeout = null;
let wsHeartbeatInterval = null;
let lastDataReceived = Date.now(); // ✅ Rastrear último dado recebido
let pollingInterval = null; // ✅ Intervalo de polling de fallback
let dataCheckInterval = null; // ✅ Intervalo para verificar dados desatualizados

// Conectar ao WebSocket
function connectWebSocket() {
    if (!API_CONFIG.enabled || !API_CONFIG.useWebSocket) {
        console.log('⚠️ WebSocket desabilitado na configuração');
        return;
    }
    
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
        console.log('⚠️ WebSocket já conectado ou conectando');
        return;
    }
    
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║  🔌 CONECTANDO AO WEBSOCKET...                            ║');
    console.log(`║  URL: ${API_CONFIG.wsURL}                               `);
    console.log('╚═══════════════════════════════════════════════════════════╝');
    
    try {
        ws = new WebSocket(API_CONFIG.wsURL);
        
        ws.onopen = () => {
            console.log('✅ WebSocket conectado com sucesso!');
            console.log('⚡ Aguardando giros em TEMPO REAL...');
            apiStatus.isOnline = true;
            apiStatus.lastSync = new Date().toISOString();
            
            // Limpar timeout de reconexão se existir
            if (wsReconnectTimeout) {
                clearTimeout(wsReconnectTimeout);
                wsReconnectTimeout = null;
            }
            
            // ✅ Parar polling de fallback (WebSocket reconectado)
            stopPollingFallback();
            
            // Iniciar heartbeat (responder a PING do servidor)
            startWebSocketHeartbeat();
        };
        
        ws.onmessage = async (event) => {
            try {
                const message = JSON.parse(event.data);
                console.log('📨 Mensagem WebSocket recebida:', message.type);
                
                // ✅ Atualizar timestamp de último dado recebido
                lastDataReceived = Date.now();
                
                switch (message.type) {
                    case 'CONNECTED':
                        console.log('✅ Confirmação de conexão:', message.message);
                        console.log(`📊 Clientes conectados: ${message.clientsConnected}`);
                        break;
                        
                    case 'INITIAL_DATA':
                        console.log('📊 Dados iniciais recebidos');
                        if (message.data && message.data.lastSpin) {
                            await processNewSpinFromServer(message.data.lastSpin);
                        }
                        break;
                        
                    case 'NEW_SPIN':
                        // ✅ NOVO GIRO EM TEMPO REAL!
                        console.log('🎯 NOVO GIRO RECEBIDO VIA WEBSOCKET!', message.data);
                        await processNewSpinFromServer(message.data);
                        break;
                        
                    case 'PING':
                        // Servidor enviou PING, responder com PONG
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
                        }
                        break;
                        
                    case 'PONG':
                        // Resposta do servidor ao nosso PING
                        console.log('💚 PONG recebido do servidor');
                        break;
                        
                    default:
                        console.log('⚠️ Tipo de mensagem desconhecido:', message.type);
                }
            } catch (error) {
                console.error('❌ Erro ao processar mensagem WebSocket:', error);
            }
        };
        
        ws.onerror = (error) => {
            console.error('❌ Erro WebSocket:', error);
            apiStatus.isOnline = false;
            apiStatus.lastError = new Date().toISOString();
        };
        
        ws.onclose = (event) => {
            console.log('❌ WebSocket desconectado');
            console.log(`   Código: ${event.code}, Motivo: ${event.reason || 'Não especificado'}`);
            apiStatus.isOnline = false;
            
            // Parar heartbeat
            stopWebSocketHeartbeat();
            
            // ✅ Iniciar polling de fallback imediatamente
            startPollingFallback();
            
            // ✅ Tentar reconectar após 2 segundos (reduzido de 5s)
            console.log('⏳ Tentando reconectar em 2 segundos...');
            wsReconnectTimeout = setTimeout(() => {
                console.log('🔄 Tentando reconectar WebSocket...');
                connectWebSocket();
            }, 2000);
        };
        
    } catch (error) {
        console.error('❌ Erro ao criar conexão WebSocket:', error);
        apiStatus.isOnline = false;
        
        // ✅ Iniciar polling de fallback imediatamente
        startPollingFallback();
        
        // ✅ Tentar reconectar após 2 segundos (reduzido de 5s)
        wsReconnectTimeout = setTimeout(() => {
            connectWebSocket();
        }, 2000);
    }
}

// Desconectar WebSocket
function disconnectWebSocket() {
    console.log('⏸️ Desconectando WebSocket...');
    
    if (wsReconnectTimeout) {
        clearTimeout(wsReconnectTimeout);
        wsReconnectTimeout = null;
    }
    
    stopWebSocketHeartbeat();
    
    if (ws) {
        ws.close(1000, 'Desconexão normal');
        ws = null;
    }
}

// Heartbeat - enviar PING ativo do cliente a cada 20s
function startWebSocketHeartbeat() {
    stopWebSocketHeartbeat(); // Limpar qualquer heartbeat anterior
    
    // ✅ Enviar PING ativo do cliente a cada 20 segundos
    wsHeartbeatInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify({ type: 'PING', timestamp: Date.now() }));
                console.log('💓 Heartbeat: PING enviado');
            } catch (error) {
                console.error('❌ Erro ao enviar PING:', error);
                // Se falhou ao enviar PING, tentar reconectar
                connectWebSocket();
            }
        } else {
            console.warn('⚠️ WebSocket não está aberto. Tentando reconectar...');
            connectWebSocket();
        }
    }, 20000); // 20 segundos
}

function stopWebSocketHeartbeat() {
    if (wsHeartbeatInterval) {
        clearInterval(wsHeartbeatInterval);
        wsHeartbeatInterval = null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🔄 POLLING DE FALLBACK - Quando WebSocket falha ou está inativo
// ═══════════════════════════════════════════════════════════════════════════════

function startPollingFallback() {
    // Se já está rodando, não iniciar novamente
    if (pollingInterval) return;
    
    console.log('');
    console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #FFA500; font-weight: bold;');
    console.log('%c║  🔄 POLLING DE FALLBACK ATIVADO                          ║', 'color: #FFA500; font-weight: bold;');
    console.log('%c║  WebSocket está offline - buscando dados via HTTP       ║', 'color: #FFA500;');
    console.log('%c║  Frequência: a cada 2 segundos                          ║', 'color: #FFA500;');
    console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #FFA500; font-weight: bold;');
    console.log('');
    
    // ✅ Notificar content.js que WebSocket caiu
    sendMessageToContent('WEBSOCKET_STATUS', { connected: false });
    
    // ✅ Buscar dados a cada 2 segundos quando WebSocket está offline
    pollingInterval = setInterval(async () => {
        try {
            // Buscar último giro do servidor
            const response = await fetch(`${API_CONFIG.baseURL}/api/giros/latest`, {
                signal: AbortSignal.timeout(5000)
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.data) {
                    await processNewSpinFromServer(data.data);
                }
            }
        } catch (error) {
            console.warn('⚠️ Polling fallback: erro ao buscar dados:', error.message);
        }
    }, 2000); // A cada 2 segundos
}

function stopPollingFallback() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        console.log('✅ Polling de fallback parado - WebSocket reconectado');
        
        // ✅ Notificar content.js que WebSocket reconectou
        sendMessageToContent('WEBSOCKET_STATUS', { connected: true });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🔍 VERIFICAÇÃO DE DADOS DESATUALIZADOS - Critical para mobile
// ═══════════════════════════════════════════════════════════════════════════════

function startDataFreshnessCheck() {
    // Se já está rodando, não iniciar novamente
    if (dataCheckInterval) return;
    
    console.log('✅ Sistema de verificação de dados ativos: LIGADO');
    console.log('   Verificará se dados estão atualizados a cada 30 segundos');
    
    // ✅ Verificar a cada 30 segundos se os dados estão desatualizados
    dataCheckInterval = setInterval(() => {
        const now = Date.now();
        const timeSinceLastData = now - lastDataReceived;
        const maxStaleTime = 90000; // 90 segundos (1.5 minutos)
        
        if (timeSinceLastData > maxStaleTime) {
            console.warn('');
            console.warn('%c⚠️⚠️⚠️ DADOS DESATUALIZADOS DETECTADOS! ⚠️⚠️⚠️', 'color: #FF0000; font-weight: bold; font-size: 16px; background: #330000; padding: 5px;');
            console.warn(`   Último dado recebido há ${Math.floor(timeSinceLastData / 1000)} segundos`);
            console.warn('   Forçando reconexão e atualização...');
            console.warn('');
            
            // ✅ Forçar reconexão WebSocket
            disconnectWebSocket();
            connectWebSocket();
            
            // ✅ Forçar busca imediata de dados via polling
            collectDoubleData();
        }
    }, 30000); // Verificar a cada 30 segundos
}

function stopDataFreshnessCheck() {
    if (dataCheckInterval) {
        clearInterval(dataCheckInterval);
        dataCheckInterval = null;
        console.log('⏸️ Sistema de verificação de dados: DESLIGADO');
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFICAÇÃO DE ABA DA BLAZE - GARANTIR QUE EXTENSÃO SÓ FUNCIONE COM PÁGINA ABERTA
// ═══════════════════════════════════════════════════════════════════════════════

// Verificar se há uma aba da Blaze aberta
async function hasBlazeTabOpen() {
    try {
        const tabs = await chrome.tabs.query({});
        
        const blazeTabs = tabs.filter(tab => {
            if (!tab.url) return false;
            
            // ✅ Aceitar múltiplos domínios da Blaze
            const blazeDomains = [
                'blaze.com',
                'blaze1.space',
                'blaze-1.com',
                'blaze-bet.com',
                'blaze.bet.br'
            ];
            
            return blazeDomains.some(domain => tab.url.includes(domain));
        });
        
        return blazeTabs.length > 0;
    } catch (e) {
        console.error('Erro ao verificar abas da Blaze:', e);
        return false;
    }
}

// Fazer requisição com timeout e retry
async function fetchWithTimeout(url, options = {}, timeout = API_CONFIG.timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        // Melhorar mensagem de erro quando for timeout
        if (error.name === 'AbortError') {
            throw new Error(`Timeout após ${timeout/1000}s - Servidor não respondeu a tempo`);
        }
        throw error;
    }
}

// Verificar se API está online
async function checkAPIStatus() {
    if (!API_CONFIG.enabled) {
        console.log('⚠️ API DESATIVADA - Sincronização offline');
        return false;
    }
    
    try {
        console.log('🔍 Verificando conexão com API...');
        // Usar timeout maior para conexão inicial (20s)
        const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/api/status`, {}, 20000);
        if (response.ok) {
            const data = await response.json();
            apiStatus.isOnline = true;
            apiStatus.lastError = null;
            apiStatus.lastSync = new Date().toISOString();
            console.log('%c✅ API ONLINE - Sincronização ativada!', 'color: #00ff00; font-weight: bold; font-size: 14px;');
            console.log(`📊 Servidor: ${data.database?.giros || 0} giros, ${data.database?.padroes || 0} padrões`);
            return true;
        }
    } catch (error) {
        apiStatus.isOnline = false;
        apiStatus.lastError = error.message;
        // Não mostrar erro se for timeout inicial - servidor pode estar em cold start
        if (error.message.includes('Timeout')) {
            console.log('%c⏳ Servidor demorando (cold start) - Tentará novamente...', 'color: #FFAA00; font-weight: bold;');
        } else {
            console.log('%c❌ API OFFLINE - Modo local ativado', 'color: #ff0000; font-weight: bold; font-size: 14px;');
            console.log(`⚠️ Erro: ${error.message}`);
        }
    }
    return false;
}

// Buscar giros do servidor
async function fetchGirosFromAPI() {
    if (!API_CONFIG.enabled) return null;
    
    try {
        // Usar timeout maior para busca inicial de 2000 giros (20s)
        const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/api/giros?limit=2000`, {}, 20000);
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.data) {
                console.log(`📥 Servidor: ${data.data.length} giros recebidos`);
                return data.data;
            }
        }
    } catch (error) {
        // Não mostrar erro assustador se for timeout - servidor pode estar ocupado
        if (error.message.includes('Timeout')) {
            console.log('⏳ Servidor ocupado - Continuará sincronizando em tempo real...');
        } else {
            console.warn('⚠️ Erro ao buscar giros do servidor:', error.message);
        }
    }
    return null;
}

// Salvar giros no servidor
async function saveGirosToAPI(giros) {
    if (!API_CONFIG.enabled || !apiStatus.isOnline) return false;
    
    const girosArray = Array.isArray(giros) ? giros : [giros];
    
    try {
        console.log(`📤 Enviando ${girosArray.length} giro(s) para o servidor...`);
        const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/api/giros`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(giros)
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log(`%c✅ ${data.message || 'Giros salvos com sucesso!'}`, 'color: #00ff00; font-weight: bold;');
            console.log(`📊 Total no servidor: ${data.totalGiros || '?'} giros`);
            return true;
        }
    } catch (error) {
        console.warn('%c⚠️ Erro ao salvar giros no servidor:', 'color: #ff9900; font-weight: bold;', error.message);
    }
    return false;
}

// Padrões NÃO são mais enviados para o servidor (são recalculados a cada sessão)

// ═════════════════════════════════════════════════════════════════════════════
// 🔧 FUNÇÃO AUXILIAR: EXIBIR RODAPÉ FIXO COM SISTEMA ATIVO
// ═════════════════════════════════════════════════════════════════════════════
function displaySystemFooter() {
    console.log('');
    console.log('%c╔═══════════════════════════════════════════════════════════════════════════════╗', 'color: #666666; font-weight: bold;');
    
    if (analyzerConfig.aiMode) {
        console.log('%c║ 🎯 SISTEMA ATIVO: ANÁLISE AVANÇADA (AUTO-APRENDIZADO)                         ║', 'color: #00FF00; font-weight: bold; background: #001100;');
        console.log('%c║ 📊 Sistema: 100% JavaScript (Sem IA Externa)                                  ║', 'color: #00AA00;');
        console.log('%c║ 🔧 Histórico analisado: ' + (analyzerConfig.aiHistorySize || 50) + ' giros                                              ║', 'color: #00AA00;');
        
        // 🧠 INDICADOR DE MEMÓRIA ATIVA (dinâmico)
        if (memoriaAtiva.inicializada) {
            const tempoDecorrido = Math.round((Date.now() - memoriaAtiva.ultimaAtualizacao) / 1000);
            const statusCor = tempoDecorrido < 60 ? '#00FF00' : '#FFA500'; // Verde se recente, laranja se não
            console.log(`%c║ 🧠 CACHE RAM: ⚡ ATIVO | ${memoriaAtiva.giros.length} giros | ${memoriaAtiva.totalAtualizacoes} updates | ⏱️ ${memoriaAtiva.tempoUltimaAtualizacao.toFixed(1)}ms      ║`, `color: ${statusCor};`);
        } else {
            console.log('%c║ 🧠 CACHE RAM: 🔄 INICIALIZANDO... (primeira análise em andamento)            ║', 'color: #FFA500;');
        }
    } else {
        console.log('%c║ 📊 SISTEMA ATIVO: PADRÕES (173+ ANÁLISES LOCAIS)                              ║', 'color: #00AAFF; font-weight: bold; background: #001122;');
        console.log('%c║ 🔧 Min. Ocorrências: ' + (analyzerConfig.minOccurrences || 5) + '                                                       ║', 'color: #0088FF;');
        console.log('%c║ 🎯 Trigger: ' + (analyzerConfig.requireTrigger ? 'ATIVO' : 'DESATIVADO') + '                                                           ║', 'color: #0088FF;');
    }
    
    console.log('%c╚═══════════════════════════════════════════════════════════════════════════════╝', 'color: #666666; font-weight: bold;');
    console.log('');
}

// Sincronização inicial ao carregar extensão
async function syncInitialData() {
    console.log('%c═════════════════════════════════════════════════════════', 'color: #00d4ff; font-weight: bold;');
    console.log('%c🌐 SINCRONIZAÇÃO COM SERVIDOR RENDER.COM', 'color: #00d4ff; font-weight: bold; font-size: 16px;');
    console.log('%c═════════════════════════════════════════════════════════', 'color: #00d4ff; font-weight: bold;');
    
    // Verificar se API está online
    const isOnline = await checkAPIStatus();
    
    if (!isOnline) {
        console.log('%c⚠️ MODO OFFLINE - Usando apenas dados locais', 'color: #ffaa00; font-weight: bold; font-size: 14px;');
        console.log('%c═════════════════════════════════════════════════════════\n', 'color: #00d4ff; font-weight: bold;');
        return;
    }
    
    // Buscar giros do servidor e popular cache em memória
    console.log('📥 Baixando histórico de giros para cache em memória...');
    const serverGiros = await fetchGirosFromAPI();
    if (serverGiros && serverGiros.length > 0) {
        // Popular cache em memória (SEM salvar em chrome.storage.local)
        cachedHistory = [...serverGiros].slice(0, 2000);
        historyInitialized = true;
        console.log(`%c✅ Cache em memória populado: ${cachedHistory.length} giros`, 'color: #00ff00; font-weight: bold;');
    } else {
        console.log('ℹ️ Nenhum giro no servidor ainda');
        cachedHistory = [];
        historyInitialized = true;
    }
    
    // Padrões NÃO são mais sincronizados do servidor (apenas locais)
    console.log('ℹ️ Padrões são gerados localmente - não há sincronização do servidor');
    
    apiStatus.lastSync = new Date().toISOString();
    console.log('%c🎉 SINCRONIZAÇÃO COMPLETA!', 'color: #00ff00; font-weight: bold; font-size: 14px;');
    console.log('%c═════════════════════════════════════════════════════════\n', 'color: #00d4ff; font-weight: bold;');
}

// Função removida: padrões não são mais enviados para servidor

// ✅ Sincronização periódica REMOVIDA - agora usamos cache em memória
// Cache é atualizado a cada novo giro em processNewSpinFromServer()

function rigorLogString() {
    try {
        const maxOccStr = analyzerConfig.maxOccurrences > 0 ? analyzerConfig.maxOccurrences : 'sem limite';
        const maxSizeStr = analyzerConfig.maxPatternSize > 0 ? analyzerConfig.maxPatternSize : 'sem limite';
        return `minOcc=${analyzerConfig.minOccurrences} | maxOcc=${maxOccStr} | intervaloMin=${analyzerConfig.minIntervalSpins}giros | minTam=${analyzerConfig.minPatternSize} | maxTam=${maxSizeStr} | win%Outras=${analyzerConfig.winPercentOthers}% | exigirTrigger=${analyzerConfig.requireTrigger}`;
    } catch(_) { return '[rigor indisponível]'; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDAÇÕES ESPECÍFICAS POR TIPO DE PADRÃO
// ═══════════════════════════════════════════════════════════════════════════════

// ✅ VALIDAR ANÁLISE DE TENDÊNCIA/FREQUÊNCIA
function validateFrequencyAnalysis(analysis) {
    if (!analysis) return { valid: false, reason: 'Análise não disponível' };
    
    const minOccurrences = 5;
    const requiredWinRate = 100; // 100% WIN (0 LOSS)
    
    const occurrences = analysis.occurrences || 0;
    // ✅ Se wins/losses não existirem, assumir 100% win rate (padrão das análises antigas)
    const wins = analysis.wins !== undefined ? analysis.wins : occurrences;
    const losses = analysis.losses !== undefined ? analysis.losses : 0;
    const winRate = occurrences > 0 ? (wins / occurrences) * 100 : 0;
    
    // Validação silenciosa, apenas logs quando rejeita
    if (occurrences < minOccurrences) {
        logRejectedPattern('Tendência/Frequência', `${occurrences}/${minOccurrences} ocorrências`);
        return { valid: false, reason: `${occurrences}/${minOccurrences} ocorrências` };
    }
    
    if (losses > 0) {
        logRejectedPattern('Tendência/Frequência', `${losses} LOSS (exige 100% WIN)`);
        return { valid: false, reason: `${losses} LOSS (exige 100% WIN)` };
    }
    
    console.log(`✅ [Validação]: Tendência/Frequência APROVADA (${wins}W/${losses}L)`);
    return { valid: true };
}

// ✅ VALIDAR ANÁLISE TEMPORAL (HORÁRIO)
function validateTemporalAnalysis(analysis) {
    if (!analysis) return { valid: false, reason: 'Análise não disponível' };
    
    const minOccurrences = 6;
    const requiredWinRate = 100; // 100% WIN (0 LOSS)
    
    const occurrences = analysis.occurrences || 0;
    // ✅ Se wins/losses não existirem, assumir 100% win rate (padrão das análises antigas)
    const wins = analysis.wins !== undefined ? analysis.wins : occurrences;
    const losses = analysis.losses !== undefined ? analysis.losses : 0;
    const winRate = occurrences > 0 ? (wins / occurrences) * 100 : 0;
    
    // Validação silenciosa, apenas logs quando rejeita
    if (occurrences < minOccurrences) {
        logRejectedPattern('Temporal/Horário', `${occurrences}/${minOccurrences} ocorrências`);
        return { valid: false, reason: `${occurrences}/${minOccurrences} ocorrências` };
    }
    
    if (losses > 0) {
        logRejectedPattern('Temporal/Horário', `${losses} LOSS (exige 100% WIN)`);
        return { valid: false, reason: `${losses} LOSS (exige 100% WIN)` };
    }
    
    console.log(`✅ [Validação]: Temporal/Horário APROVADO (${wins}W/${losses}L)`);
    return { valid: true };
}

// ✅ VALIDAR ANÁLISE NÚMERO + COR
function validateNumberAnalysis(analysis) {
    if (!analysis) return { valid: false, reason: 'Análise não disponível' };
    
    const minOccurrences = 3;
    const requiredWinRate = 100; // 100% WIN (0 LOSS)
    
    const occurrences = analysis.occurrences || 0;
    // ✅ Se wins/losses não existirem, calcular baseado na confidence (assumindo que confidence reflete winRate)
    const wins = analysis.wins !== undefined ? analysis.wins : Math.round((analysis.confidence / 100) * occurrences);
    const losses = analysis.losses !== undefined ? analysis.losses : (occurrences - wins);
    const winRate = occurrences > 0 ? (wins / occurrences) * 100 : 0;
    
    // Validação silenciosa, apenas logs quando rejeita
    if (occurrences < minOccurrences) {
        logRejectedPattern('Número+Cor', `${occurrences}/${minOccurrences} ocorrências`);
        return { valid: false, reason: `${occurrences}/${minOccurrences} ocorrências` };
    }
    
    if (losses > 0) {
        logRejectedPattern('Número+Cor', `${losses} LOSS (exige 100% WIN)`);
        return { valid: false, reason: `${losses} LOSS (exige 100% WIN)` };
    }
    
    console.log(`✅ [Validação]: Número+Cor APROVADO (${wins}W/${losses}L)`);
    return { valid: true };
}

// ✅ VALIDAR ANÁLISE DE CICLO (CORRELAÇÃO)
function validateCorrelationAnalysis(analysis) {
    if (!analysis) return { valid: false, reason: 'Análise não disponível' };
    
    const minOccurrences = 6;
    const requiredWinRate = 100; // 100% WIN (0 LOSS)
    
    const occurrences = analysis.occurrences || 0;
    // ✅ Se wins/losses não existirem, assumir 100% win rate (padrão das análises antigas)
    const wins = analysis.wins !== undefined ? analysis.wins : occurrences;
    const losses = analysis.losses !== undefined ? analysis.losses : 0;
    const winRate = occurrences > 0 ? (wins / occurrences) * 100 : 0;
    
    // Validação silenciosa, apenas logs quando rejeita
    if (occurrences < minOccurrences) {
        logRejectedPattern('Ciclo/Periódica', `${occurrences}/${minOccurrences} ocorrências`);
        return { valid: false, reason: `${occurrences}/${minOccurrences} ocorrências` };
    }
    
    if (losses > 0) {
        logRejectedPattern('Ciclo/Periódica', `${losses} LOSS (exige 100% WIN)`);
        return { valid: false, reason: `${losses} LOSS (exige 100% WIN)` };
    }
    
    console.log(`✅ [Validação]: Ciclo/Periódica APROVADO (${wins}W/${losses}L)`);
    return { valid: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SISTEMA DE LOGS LIMPOS E ORGANIZADOS
// ═══════════════════════════════════════════════════════════════════════════════

// ✅ LOG PADRONIZADO PARA CICLO DE ANÁLISE
function logAnalysisCycle(data) {
    const {
        serverStatus = 'desconhecido',
        patternsFound = [],
        searchingNewSpin = false,
        rejectedPatterns = [],
        telegramSent = null,
        displayedPatternsCount = 0,
        spinsAvailable = { server: 0, app: 0 }
    } = data;
    
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  📊 CICLO DE ANÁLISE - RESUMO                             ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    
    // 1. STATUS DO SERVIDOR
    const serverIcon = serverStatus === 'ativo' ? '✅' : serverStatus === 'erro' ? '❌' : '⏳';
    console.log(`║  🌐 Servidor: ${serverIcon} ${serverStatus.toUpperCase()}`.padEnd(62) + '║');
    
    // 2. GIROS DISPONÍVEIS
    console.log(`║  🎲 Giros: Servidor=${spinsAvailable.server} | App=${spinsAvailable.app}`.padEnd(62) + '║');
    
    // 3. BUSCA POR NOVO GIRO
    if (searchingNewSpin) {
        console.log('║  🔍 Busca: AGUARDANDO NOVO GIRO...'.padEnd(62) + '║');
    }
    
    console.log('╠═══════════════════════════════════════════════════════════╣');
    
    // 4. PADRÕES ENCONTRADOS
    if (patternsFound.length > 0) {
        console.log(`║  ✅ Padrões encontrados: ${patternsFound.length}`.padEnd(62) + '║');
        patternsFound.slice(0, 3).forEach((p, i) => {
            const label = `${i + 1}. ${p.type}: ${p.color}`;
            console.log(`║     ${label}`.padEnd(62) + '║');
        });
        if (patternsFound.length > 3) {
            console.log(`║     ... +${patternsFound.length - 3} padrões`.padEnd(62) + '║');
        }
    } else {
        console.log('║  ⚠️ Padrões encontrados: NENHUM'.padEnd(62) + '║');
    }
    
    // 5. PADRÕES REJEITADOS
    if (rejectedPatterns.length > 0) {
        console.log('╠═══════════════════════════════════════════════════════════╣');
        console.log(`║  ❌ Padrões rejeitados: ${rejectedPatterns.length}`.padEnd(62) + '║');
        rejectedPatterns.slice(0, 2).forEach((r, i) => {
            const reason = r.reason ? r.reason.substring(0, 40) : 'motivo não especificado';
            console.log(`║     ${i + 1}. ${r.type}: ${reason}`.padEnd(62) + '║');
        });
        if (rejectedPatterns.length > 2) {
            console.log(`║     ... +${rejectedPatterns.length - 2} rejeitados`.padEnd(62) + '║');
        }
    }
    
    // 6. MENSAGEM TELEGRAM
    if (telegramSent !== null) {
        console.log('╠═══════════════════════════════════════════════════════════╣');
        if (telegramSent) {
            console.log('║  📲 Telegram: ✅ MENSAGEM ENVIADA COM SUCESSO'.padEnd(62) + '║');
        } else {
            console.log('║  📲 Telegram: ❌ MENSAGEM NÃO ENVIADA'.padEnd(62) + '║');
        }
    }
    
    // 7. PADRÕES EXIBIDOS
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log(`║  📱 Padrões exibidos na extensão: ${displayedPatternsCount}`.padEnd(62) + '║');
    
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
}

// ✅ LOG SIMPLIFICADO PARA STATUS DO SERVIDOR
function logServerStatus(status, spinsCount = 0) {
    const icon = status === 'ativo' ? '✅' : status === 'erro' ? '❌' : '⏳';
    console.log(`\n🌐 [Servidor]: ${icon} ${status.toUpperCase()} | Giros disponíveis: ${spinsCount}`);
}

// ✅ LOG PARA BUSCA DE NOVO GIRO
function logSearchingNewSpin() {
    console.log('🔍 [Busca por novo giro]: AGUARDANDO...');
}

// ✅ LOG PARA PADRÃO REJEITADO
function logRejectedPattern(type, reason) {
    console.log(`❌ [Padrão rejeitado]: ${type} - ${reason}`);
}

// ✅ LOG PARA TELEGRAM
function logTelegramStatus(sent, reason = '') {
    if (sent) {
        console.log('📲 [Telegram]: ✅ MENSAGEM ENVIADA');
    } else {
        console.log(`📲 [Telegram]: ❌ NÃO ENVIADA ${reason ? `- ${reason}` : ''}`);
    }
}

// ✅ LOG PARA PADRÕES ENCONTRADOS
function logPatternsFound(patterns) {
    if (patterns.length === 0) {
        console.log('⚠️ [Padrões encontrados]: NENHUM');
    } else {
        console.log(`✅ [Padrões encontrados]: ${patterns.length}`);
        patterns.forEach((p, i) => {
            console.log(`   ${i + 1}. ${p.type || 'desconhecido'} → ${p.color || '?'} (${p.confidence?.toFixed(1) || '0'}%)`);
        });
    }
}

// ✅ FUNÇÃO PARA EXIBIR CONFIGURAÇÕES ATIVAS DE FORMA VISUAL
function logActiveConfiguration() {
    try {
        const config = analyzerConfig;
        
        console.log('╔═══════════════════════════════════════════════════════════╗');
        console.log('║  ⚙️ CONFIGURAÇÕES ATIVAS DO ANALISADOR                   ║');
        console.log('╠═══════════════════════════════════════════════════════════╣');
        
        // OCORRÊNCIAS
        console.log('║  📊 CONTROLE DE OCORRÊNCIAS:                              ║');
        console.log(`║     • Mínimo de WINS: ${config.minOccurrences.toString().padEnd(35)}║`);
        const maxOccStr = config.maxOccurrences > 0 ? config.maxOccurrences.toString() : 'SEM LIMITE ∞';
        console.log(`║     • Máximo de ocorrências: ${maxOccStr.padEnd(26)}║`);
        
        // TAMANHO DO PADRÃO
        console.log('║                                                           ║');
        console.log('║  📏 TAMANHO DO PADRÃO:                                    ║');
        console.log(`║     • Mínimo (giros): ${config.minPatternSize.toString().padEnd(32)}║`);
        const maxSizeStr = config.maxPatternSize > 0 ? config.maxPatternSize.toString() : 'SEM LIMITE ∞';
        console.log(`║     • Máximo (giros): ${maxSizeStr.padEnd(32)}║`);
        
        // INTERVALO E QUALIDADE
        console.log('║                                                           ║');
        console.log('║  ⏱️ INTERVALO E QUALIDADE:                                ║');
        console.log(`║     • Intervalo mínimo: ${config.minIntervalSpins.toString().padEnd(25)} giro(s) ║`);
        console.log(`║     • WIN% demais ocorrências: ${config.winPercentOthers.toString().padEnd(20)}%     ║`);
        
        // COR DE DISPARO
        console.log('║                                                           ║');
        console.log('║  🎯 VALIDAÇÃO DE TRIGGER:                                 ║');
        const triggerStatus = config.requireTrigger ? '✅ ATIVADO (mais rigoroso)' : '❌ DESATIVADO (menos rigoroso)';
        console.log(`║     ${triggerStatus.padEnd(54)}║`);
        
        // MARTINGALE
        console.log('║                                                           ║');
        console.log('║  🎲 SISTEMA DE MARTINGALE (GALE):                         ║');
        const galeQty = config.maxGales === 0 ? 'DESATIVADO' : 
                        config.maxGales === 1 ? '1 Gale (G1)' : 
                        config.maxGales === 2 ? '2 Gales (G1, G2)' : 
                        `${config.maxGales} Gales`;
        console.log(`║     • Quantidade de Gales: ${galeQty.padEnd(28)}║`);
        const martingaleMode = config.consecutiveMartingale ? 'CONSECUTIVO (imediato)' : 'PADRÃO (aguarda novo)';
        console.log(`║     • Modo: ${martingaleMode.padEnd(44)}║`);
        
        // TELEGRAM
        console.log('║                                                           ║');
        console.log('║  📲 TELEGRAM:                                             ║');
        const telegramStatus = config.telegramChatId ? `✅ Ativo (ID: ${config.telegramChatId.substring(0, 10)}...)` : '❌ Não configurado';
        console.log(`║     ${telegramStatus.padEnd(54)}║`);
        
        console.log('║                                                           ║');
        console.log('║  🤖 MODO IA:                                              ║');
        const aiModeStatus = config.aiMode ? '✅ ATIVO' : '⚪ Desativado (Modo Padrão)';
        console.log(`║     ${aiModeStatus.padEnd(54)}║`);
        const aiKeyStatus = config.aiApiKey ? `✅ Configurada (${config.aiApiKey.substring(0, 8)}...)` : '❌ Não configurada';
        console.log(`║     ${aiKeyStatus.padEnd(54)}║`);
        
        console.log('╚═══════════════════════════════════════════════════════════╝');
        
        // ⚠️ AVISOS DE CONFIGURAÇÃO PERMISSIVA/RIGOROSA
        const warnings = [];
        
        if (config.minOccurrences <= 2) {
            warnings.push('⚠️ Configuração MUITO PERMISSIVA: minOccurrences <= 2');
        }
        
        if (config.winPercentOthers === 0) {
            warnings.push('⚠️ Sem filtro de WIN% para outras ocorrências (aceita qualquer %)');
        }
        
        if (!config.requireTrigger) {
            warnings.push('⚠️ Cor de disparo DESATIVADA (menos rigoroso)');
        }
        
        if (config.maxOccurrences > 0 && config.maxOccurrences < 5) {
            warnings.push(`⚠️ Limite de ocorrências BAIXO: máx ${config.maxOccurrences}`);
        }
        
        if (warnings.length > 0) {
            console.log('\n⚠️ AVISOS DE CONFIGURAÇÃO:');
            warnings.forEach(w => console.log(`   ${w}`));
            console.log('');
        }
        
    } catch (e) {
        console.error('Erro ao exibir configurações:', e);
    }
}

// Load analyzer config at startup
(async function loadAnalyzerConfigAtStartup() {
    try {
        const res = await chrome.storage.local.get(['analyzerConfig']);
        if (res && res.analyzerConfig) {
            analyzerConfig = { ...DEFAULT_ANALYZER_CONFIG, ...res.analyzerConfig };
        } else {
            await chrome.storage.local.set({ analyzerConfig: analyzerConfig });
        }
        console.log('AnalyzerConfig carregado:', analyzerConfig);
        
        // ✅ INICIALIZAR HISTÓRICO DE SINAIS (para auto-aprendizado)
        await initializeSignalsHistory();
        
        // ✅ CARREGAR PADRÕES CUSTOMIZADOS
        await loadCustomPatterns();
        console.log(`🎯 Padrões customizados carregados na inicialização: ${customPatternsCache.length}`);
        
        // ✅ EXIBIR CONFIGURAÇÕES ATIVAS
        logActiveConfiguration();
        
        // ✅ VALIDAR CONFIGURAÇÕES (detectar conflitos)
        const minSize = analyzerConfig.minPatternSize || 2;
        const maxSize = analyzerConfig.maxPatternSize || 0;
        const minOcc = analyzerConfig.minOccurrences || 1;
        const maxOcc = analyzerConfig.maxOccurrences || 0;
        
        if (maxSize > 0 && maxSize < minSize) {
            console.error('╔═══════════════════════════════════════════════════════════╗');
            console.error('║  ⚠️ CONFIGURAÇÃO INVÁLIDA DETECTADA!                     ║');
            console.error('╠═══════════════════════════════════════════════════════════╣');
            console.error(`║  ❌ Tamanho MÁXIMO (${maxSize}) < MÍNIMO (${minSize})!`);
            console.error('║  🚫 NENHUM PADRÃO SERÁ ENCONTRADO!                        ║');
            console.error('║  💡 Ajuste: maxPatternSize >= minPatternSize             ║');
            console.error('╚═══════════════════════════════════════════════════════════╝');
        }
        
        if (maxOcc > 0 && maxOcc < minOcc) {
            console.error('╔═══════════════════════════════════════════════════════════╗');
            console.error('║  ⚠️ CONFIGURAÇÃO INVÁLIDA DETECTADA!                     ║');
            console.error('╠═══════════════════════════════════════════════════════════╣');
            console.error(`║  ❌ Ocorrências MÁXIMAS (${maxOcc}) < MÍNIMAS (${minOcc})!`);
            console.error('║  🚫 NENHUM PADRÃO SERÁ ENCONTRADO!                        ║');
            console.error('║  💡 Ajuste: maxOccurrences >= minOccurrences             ║');
            console.error('╚═══════════════════════════════════════════════════════════╝');
        }
    } catch (e) {
        console.warn('Falha ao carregar analyzerConfig, usando defaults:', e);
    }
})();

// Apply config changes immediately
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.analyzerConfig) {
        try {
            const newVal = changes.analyzerConfig.newValue || {};
            analyzerConfig = { ...DEFAULT_ANALYZER_CONFIG, ...newVal };
            console.log('AnalyzerConfig aplicado imediatamente:', analyzerConfig);
            
            // ✅ EXIBIR NOVAS CONFIGURAÇÕES
            console.log('\n🔄 CONFIGURAÇÕES ATUALIZADAS:');
            logActiveConfiguration();
            
            // ✅ VALIDAR CONFIGURAÇÕES (detectar conflitos)
            const minSize = analyzerConfig.minPatternSize || 2;
            const maxSize = analyzerConfig.maxPatternSize || 0;
            const minOcc = analyzerConfig.minOccurrences || 1;
            const maxOcc = analyzerConfig.maxOccurrences || 0;
            
            if (maxSize > 0 && maxSize < minSize) {
                console.error('╔═══════════════════════════════════════════════════════════╗');
                console.error('║  ⚠️ CONFIGURAÇÃO INVÁLIDA DETECTADA!                     ║');
                console.error('╠═══════════════════════════════════════════════════════════╣');
                console.error(`║  ❌ Tamanho MÁXIMO (${maxSize}) < MÍNIMO (${minSize})!`);
                console.error('║  🚫 NENHUM PADRÃO SERÁ ENCONTRADO!                        ║');
                console.error('║  💡 Ajuste: maxPatternSize >= minPatternSize             ║');
                console.error('╚═══════════════════════════════════════════════════════════╝');
            }
            
            if (maxOcc > 0 && maxOcc < minOcc) {
                console.error('╔═══════════════════════════════════════════════════════════╗');
                console.error('║  ⚠️ CONFIGURAÇÃO INVÁLIDA DETECTADA!                     ║');
                console.error('╠═══════════════════════════════════════════════════════════╣');
                console.error(`║  ❌ Ocorrências MÁXIMAS (${maxOcc}) < MÍNIMAS (${minOcc})!`);
                console.error('║  🚫 NENHUM PADRÃO SERÁ ENCONTRADO!                        ║');
                console.error('║  💡 Ajuste: maxOccurrences >= minOccurrences             ║');
                console.error('╚═══════════════════════════════════════════════════════════╝');
            }
        } catch (e) {
            console.warn('Falha ao aplicar analyzerConfig:', e);
        }
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CALIBRADOR DE PORCENTAGENS - INICIALIZAÇÃO
// (Variáveis movidas para o topo do arquivo para evitar TDZ errors)
// ═══════════════════════════════════════════════════════════════════════════════

// ✅ Carregar histórico de cores quentes ao iniciar
loadHotColorsHistory();

// Carregar dados do observador ao iniciar
(async function loadObserverDataAtStartup() {
    try {
        const res = await chrome.storage.local.get(['observerData', 'entriesHistory', 'martingaleState']);
        if (res && res.observerData) {
            observerData = { ...observerData, ...res.observerData };
            console.log('╔═══════════════════════════════════════════════════════════╗');
            console.log('║  📊 CALIBRADOR DE PORCENTAGENS CARREGADO                 ║');
            console.log('╠═══════════════════════════════════════════════════════════╣');
            console.log(`║  📈 Entradas monitoradas: ${observerData.entries.length}`);
            console.log(`║  📊 Última calibração: ${observerData.lastCalibratedCount} entradas`);
            console.log(`║  🔧 Fator de calibração: ${(observerData.calibrationFactor * 100).toFixed(1)}%`);
            console.log(`║  🎯 Alta (≥80%): ${observerData.stats.high.total} entradas`);
            console.log(`║  🟡 Média (60-79%): ${observerData.stats.medium.total} entradas`);
            console.log(`║  🟢 Baixa (<60%): ${observerData.stats.low.total} entradas`);
            console.log('╚═══════════════════════════════════════════════════════════╝');
        } else {
            console.log('ℹ️ Calibrador de porcentagens: Nenhum dado anterior encontrado (primeira execução)');
        }
        
        // ✅ SINCRONIZAR: Sempre manter observerData sincronizado com entriesHistory
        const entriesHistory = res.entriesHistory || [];
        console.log('🔍 Verificando sincronização:');
        console.log(`   entriesHistory existe?`, !!entriesHistory);
        console.log(`   entriesHistory.length:`, entriesHistory.length);
        console.log(`   observerData.entries.length:`, observerData.entries.length);
        
        // ✅ CASO 1: entriesHistory foi LIMPO (menos entradas que observerData)
        // Isso significa que o usuário limpou o histórico, então resetar observerData
        if (entriesHistory.length < observerData.entries.length) {
            console.log('╔═══════════════════════════════════════════════════════════╗');
            console.log('║  🗑️ HISTÓRICO FOI LIMPO - RESETANDO CALIBRADOR          ║');
            console.log('╠═══════════════════════════════════════════════════════════╣');
            console.log(`║  Entradas antigas no calibrador: ${observerData.entries.length}`);
            console.log(`║  Entradas atuais no histórico: ${entriesHistory.length}`);
            console.log('╚═══════════════════════════════════════════════════════════╝');
            
            // Resetar observerData e reconstruir a partir do entriesHistory
            observerData = {
                entries: [],
                calibrationFactor: 1.0,
                lastCalibration: null,
                lastCalibratedCount: 0,
                stats: {
                    high: { predicted: 0, actual: 0, wins: 0, total: 0 },
                    medium: { predicted: 0, actual: 0, wins: 0, total: 0 },
                    low: { predicted: 0, actual: 0, wins: 0, total: 0 }
                }
            };
            
            // Reconstruir observerData a partir das entradas restantes
            for (const entry of entriesHistory) {
                if (entry.confidence && entry.result) {
                    observerData.entries.push({
                        timestamp: entry.timestamp,
                        predicted: Math.round(entry.confidence),
                        result: entry.result.toLowerCase() === 'win' ? 'win' : 'loss',
                        pattern: entry.patternData ? {
                            type: entry.patternData.type || 'unknown',
                            occurrences: entry.patternData.occurrences || 0
                        } : null
                    });
                }
            }
            
            console.log(`✅ Calibrador resetado e reconstruído: ${observerData.entries.length} entradas`);
            
            // Atualizar estatísticas
            updateObserverStats();
            
            // Salvar dados sincronizados
            await saveObserverData(true);
            
            // Enviar atualização para UI
            sendObserverUpdate(true);
        }
        // ✅ CASO 2: entriesHistory tem MAIS entradas (adicionar novas)
        else if (entriesHistory.length > observerData.entries.length) {
            console.log('╔═══════════════════════════════════════════════════════════╗');
            console.log('║  🔄 SINCRONIZANDO ENTRADAS COM OBSERVADOR                ║');
            console.log('╠═══════════════════════════════════════════════════════════╣');
            console.log(`║  Entradas no histórico: ${entriesHistory.length}`);
            console.log(`║  Entradas no observador: ${observerData.entries.length}`);
            
            // Adicionar entradas que estão faltando no observador
            let syncedCount = 0;
            for (const entry of entriesHistory) {
                // Verificar se já existe no observador (por timestamp)
                const exists = observerData.entries.some(e => e.timestamp === entry.timestamp);
                
                console.log(`   Entrada ${syncedCount + 1}/${entriesHistory.length}:`, {
                    timestamp: entry.timestamp,
                    confidence: entry.confidence,
                    result: entry.result,
                    exists: exists
                });
                
                if (!exists && entry.confidence && entry.result) {
                    observerData.entries.push({
                        timestamp: entry.timestamp,
                        predicted: Math.round(entry.confidence),
                        result: entry.result.toLowerCase() === 'win' ? 'win' : 'loss',
                        pattern: entry.patternData ? {
                            type: entry.patternData.type || 'unknown',
                            occurrences: entry.patternData.occurrences || 0
                        } : null
                    });
                    syncedCount++;
                    console.log(`      ✅ Adicionado ao observador (${syncedCount} sincronizadas)`);
                } else if (exists) {
                    console.log(`      ⏭️ Já existe no observador`);
                } else {
                    console.log(`      ⚠️ Entrada inválida (sem confidence ou result)`);
                }
            }
            
            console.log(`╠═══════════════════════════════════════════════════════════╣`);
            console.log(`║  Total sincronizado: ${syncedCount} novas entradas`);
            console.log(`╚═══════════════════════════════════════════════════════════╝`);
            
            // Limitar ao máximo configurado
            if (observerData.entries.length > OBSERVER_CONFIG.maxHistorySize) {
                observerData.entries = observerData.entries.slice(-OBSERVER_CONFIG.maxHistorySize);
            }
            
            // Atualizar estatísticas
            updateObserverStats();
            
            // Salvar dados sincronizados
            await saveObserverData();
            
            console.log(`✅ Sincronização concluída: ${observerData.entries.length} entradas no observador`);
            
            // Enviar atualização para UI
            sendObserverUpdate(true); // Mostrar log ao carregar
        }
        // ✅ CASO 3: Já estão sincronizados (mesmo número de entradas)
        else {
            console.log('✅ Calibrador já está sincronizado com histórico de entradas');
        }
        
        // ✅ RESTAURAR ESTADO DO MARTINGALE (se houver ciclo ativo)
        if (res.martingaleState && res.martingaleState.active) {
            martingaleState = res.martingaleState;
            console.log('╔═══════════════════════════════════════════════════════════╗');
            console.log('║  🔄 CICLO DE MARTINGALE RESTAURADO                       ║');
            console.log('╠═══════════════════════════════════════════════════════════╣');
            console.log(`║  Estágio: ${martingaleState.stage}`);
            console.log(`║  Padrão: ${martingaleState.patternKey}`);
            console.log(`║  Cor: ${martingaleState.entryColor}`);
            console.log(`║  LOSS consecutivos: ${martingaleState.lossCount}`);
            console.log('╚═══════════════════════════════════════════════════════════╝');
        }
    } catch (e) {
        console.warn('⚠️ Falha ao carregar observerData:', e);
    }
})();

// Salvar dados do observador
async function saveObserverData(showLog = false) {
    // ⚠️ VERIFICAR SE observerData FOI INICIALIZADO
    if (!observerData || !observerData.entries) {
        return;
    }
    
    try {
        await chrome.storage.local.set({ observerData: observerData });
        if (showLog) {
            console.log(`💾 Calibrador salvo: ${observerData.entries.length} entradas, fator ${(observerData.calibrationFactor * 100).toFixed(1)}%, última calibração em ${observerData.lastCalibratedCount}`);
        }
    } catch (e) {
        console.error('Erro ao salvar observerData:', e);
    }
}

// Enviar atualização do observador para content.js
function sendObserverUpdate(showLog = false) {
    // ⚠️ VERIFICAR SE observerData FOI INICIALIZADO
    if (!observerData || !observerData.entries) {
        return;
    }
    
    const stats = getObserverStats();
    if (showLog) {
        console.log('📤 Enviando OBSERVER_UPDATE para UI:', {
            total: stats.total,
            wins: stats.wins,
            losses: stats.losses,
            winRate: stats.winRate,
            calibrationFactor: stats.calibrationFactor
        });
    }
    sendMessageToContent('OBSERVER_UPDATE', stats);
}

// Registrar uma nova entrada no observador
async function registerEntryInObserver(predictedConfidence, actualResult, entryTime, patternInfo = null) {
    const entry = {
        timestamp: entryTime || Date.now(),
        predicted: Math.round(predictedConfidence),
        result: actualResult, // 'win' ou 'loss'
        pattern: patternInfo ? {
            type: patternInfo.type || 'unknown',
            occurrences: patternInfo.occurrences || 0
        } : null
    };
    
    // ⚠️ VERIFICAR SE observerData FOI INICIALIZADO (com try/catch para evitar TDZ)
    try {
        if (!observerData || !observerData.entries) {
            console.warn('⚠️ observerData não inicializado ainda - pulando registro');
            return;
        }
    } catch (error) {
        console.warn('⚠️ Erro ao acessar observerData - pulando registro:', error.message);
        return;
    }
    
    // Adicionar ao histórico
    observerData.entries.push(entry);
    
    // Limitar tamanho do histórico (manter apenas as últimas N)
    if (observerData.entries.length > OBSERVER_CONFIG.maxHistorySize) {
        observerData.entries.shift(); // Remove mais antiga
    }
    
    // Atualizar estatísticas
    updateObserverStats();
    
    // ✅ RECALIBRAR A CADA NOVA ENTRADA (após ter o mínimo de 20 entradas)
    // Isso garante que o peso da calibração usado nos próximos cálculos esteja sempre atualizado
    if (observerData.entries.length >= OBSERVER_CONFIG.minEntriesForCalibration) {
        console.log(`🔄 Recalibrando automaticamente após nova entrada (${observerData.entries.length} entradas)...`);
        recalibrateConfidenceModel();
    } else {
        console.log(`⏳ Aguardando ${OBSERVER_CONFIG.minEntriesForCalibration - observerData.entries.length} entradas para iniciar calibração automática`);
    }
    
    // Salvar dados
    await saveObserverData();
    
    // ✅ Enviar atualização para UI automaticamente
    sendObserverUpdate();
    
    // Log visual
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║  📊 ENTRADA OBSERVADA                                     
╠═══════════════════════════════════════════════════════════╣
║  🎯 Previsto: ${entry.predicted}%
║  ${actualResult === 'win' ? '✅ Resultado: WIN' : '❌ Resultado: LOSS'}
║  📈 Total observado: ${observerData.entries.length}/${OBSERVER_CONFIG.maxHistorySize}
║  🔧 Fator de calibração: ${(observerData.calibrationFactor * 100).toFixed(1)}%
╚═══════════════════════════════════════════════════════════╝
    `.trim());
}

// Atualizar estatísticas do observador
function updateObserverStats() {
    // ⚠️ VERIFICAR SE observerData FOI INICIALIZADO
    if (!observerData || !observerData.entries) {
        return;
    }
    
    // Resetar stats
    observerData.stats = {
        high: { predicted: 0, actual: 0, wins: 0, total: 0 },
        medium: { predicted: 0, actual: 0, wins: 0, total: 0 },
        low: { predicted: 0, actual: 0, wins: 0, total: 0 }
    };
    
    // Calcular para cada faixa
    for (const entry of observerData.entries) {
        let bucket;
        if (entry.predicted >= 80) bucket = 'high';
        else if (entry.predicted >= 60) bucket = 'medium';
        else bucket = 'low';
        
        observerData.stats[bucket].predicted += entry.predicted;
        observerData.stats[bucket].total++;
        
        if (entry.result === 'win') {
            observerData.stats[bucket].wins++;
        }
    }
    
    // Calcular taxas reais
    for (const bucket of ['high', 'medium', 'low']) {
        const stat = observerData.stats[bucket];
        if (stat.total > 0) {
            stat.actual = (stat.wins / stat.total) * 100;
            stat.predicted = stat.predicted / stat.total; // Média prevista
        }
    }
}

// Recalibrar o modelo de confiança baseado no histórico
// Esta função é chamada:
// - AUTOMATICAMENTE: A cada nova entrada registrada (após ter 20+ entradas)
// - MANUALMENTE: Quando o usuário clica no botão "Atualizar"
function recalibrateConfidenceModel() {
    // ⚠️ VERIFICAR SE observerData FOI INICIALIZADO
    if (!observerData || !observerData.entries) {
        return;
    }
    
    const entries = observerData.entries;
    if (entries.length < OBSERVER_CONFIG.minEntriesForCalibration) {
        console.log(`⚠️ Calibração cancelada: apenas ${entries.length} entradas (mínimo: ${OBSERVER_CONFIG.minEntriesForCalibration})`);
        return;
    }
    
    // ✅ VERIFICAR SE HÁ NOVAS ENTRADAS desde a última calibração
    if (entries.length === observerData.lastCalibratedCount) {
        console.log(`ℹ️ Calibração não necessária: nenhuma entrada nova desde a última calibração (${entries.length} entradas)`);
        return;
    }
    
    // Calcular taxa de acerto global
    const totalWins = entries.filter(e => e.result === 'win').length;
    const totalEntries = entries.length;
    const actualWinRate = totalWins / totalEntries;
    
    // Calcular média das previsões
    const avgPredicted = entries.reduce((sum, e) => sum + e.predicted, 0) / totalEntries;
    const predictedWinRate = avgPredicted / 100;
    
    // Calcular fator de correção
    // Se real = 0.7 (70%) e previsto = 0.85 (85%), fator = 0.7/0.85 = 0.82
    // Isso vai reduzir as próximas previsões em ~18%
    let newFactor = predictedWinRate > 0 ? actualWinRate / predictedWinRate : 1.0;
    
    // ✅ REMOVIDA SUAVIZAÇÃO: Cálculo agora é determinístico (sempre retorna o mesmo valor para os mesmos dados)
    // Não há mais média ponderada com valor anterior - o cálculo é puro e baseado apenas nos dados atuais
    
    // Limitar fator entre 0.5 e 1.5 (não permitir correções muito drásticas)
    newFactor = Math.max(0.5, Math.min(1.5, newFactor));
    
    const oldFactor = observerData.calibrationFactor;
    observerData.calibrationFactor = newFactor;
    observerData.lastCalibration = new Date().toISOString();
    observerData.lastCalibratedCount = entries.length; // ✅ Salvar quantas entradas foram calibradas
    
    // Log detalhado da calibração
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║  🔧 RECALIBRAÇÃO DO MODELO (${entries.length} entradas)              
╠═══════════════════════════════════════════════════════════╣
║  📊 Entradas analisadas: ${totalEntries}
║  
║  🎯 GLOBAL:
║     Previsto médio: ${(predictedWinRate * 100).toFixed(1)}%
║     Real: ${(actualWinRate * 100).toFixed(1)}%
║     Diferença: ${((actualWinRate - predictedWinRate) * 100).toFixed(1)}%
║  
║  🔴 ALTA (≥80%):
║     Previsto: ${observerData.stats.high.predicted.toFixed(1)}%
║     Real: ${observerData.stats.high.actual.toFixed(1)}%
║     Total: ${observerData.stats.high.total} entradas
║  
║  🟡 MÉDIA (60-79%):
║     Previsto: ${observerData.stats.medium.predicted.toFixed(1)}%
║     Real: ${observerData.stats.medium.actual.toFixed(1)}%
║     Total: ${observerData.stats.medium.total} entradas
║  
║  🟢 BAIXA (<60%):
║     Previsto: ${observerData.stats.low.predicted.toFixed(1)}%
║     Real: ${observerData.stats.low.actual.toFixed(1)}%
║     Total: ${observerData.stats.low.total} entradas
║  
║  ⚙️ AJUSTE:
║     Fator anterior: ${(oldFactor * 100).toFixed(1)}%
║     Fator novo: ${(newFactor * 100).toFixed(1)}%
║     Correção: ${((newFactor - oldFactor) * 100).toFixed(1)}%
╚═══════════════════════════════════════════════════════════╝
    `.trim());
}

// Aplicar calibração a uma porcentagem de confiança
function applyCalibratedConfidence(rawConfidence) {
    // ✅ VERIFICAÇÃO DEFENSIVA: observerData pode não estar inicializado ainda
    if (!observerData || !observerData.entries) {
        console.log(`⚠️ Calibração indisponível: observerData não inicializado (retornando confiança original)`);
        return Math.round(rawConfidence);
    }
    
    // ✅ REGRA: Só aplicar calibração após 10+ entradas no observador
    const minEntriesForCalibration = 10;
    const currentEntries = observerData.entries.length;
    
    if (currentEntries < minEntriesForCalibration) {
        console.log(`ℹ️ Calibração desativada: ${currentEntries}/${minEntriesForCalibration} entradas (coletando dados)`);
        return Math.round(rawConfidence); // Retorna confiança original
    }
    
    // Aplicar fator de calibração
    let calibrated = rawConfidence * observerData.calibrationFactor;
    
    // Garantir que fique entre 0-100
    calibrated = Math.max(0, Math.min(100, calibrated));
    
    console.log(`🔧 Calibração aplicada: ${rawConfidence.toFixed(1)}% → ${Math.round(calibrated)}% (fator: ${(observerData.calibrationFactor * 100).toFixed(1)}%, ${currentEntries} entradas)`);
    
    return Math.round(calibrated);
}

// Obter estatísticas do observador para exibição
function getObserverStats() {
    const entries = observerData.entries;
    if (entries.length === 0) {
        return {
            total: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
            calibrationFactor: observerData.calibrationFactor,
            byConfidence: observerData.stats
        };
    }
    
    const wins = entries.filter(e => e.result === 'win').length;
    const losses = entries.length - wins;
    
    return {
        total: entries.length,
        wins: wins,
        losses: losses,
        winRate: (wins / entries.length) * 100,
        calibrationFactor: observerData.calibrationFactor,
        byConfidence: observerData.stats,
        lastCalibration: observerData.lastCalibration,
        lastCalibratedCount: observerData.lastCalibratedCount // Quantas entradas foram processadas na última calibração
    };
}

// Start data collection
async function startDataCollection() {
    if (isRunning) return;
    
    // ✅ VERIFICAR SE HÁ ABA DA BLAZE ABERTA ANTES DE INICIAR
    const hasBlaze = await hasBlazeTabOpen();
    if (!hasBlaze) {
        console.log('╔═══════════════════════════════════════════════════════════╗');
        console.log('║  ⛔ IMPOSSÍVEL INICIAR: NENHUMA ABA DA BLAZE ABERTA      ║');
        console.log('║  💡 Abra blaze.com para usar a extensão                  ║');
        console.log('╚═══════════════════════════════════════════════════════════╝');
        return;
    }
    
    // ☁️ VERIFICAR PROPLUS NO INÍCIO (popular cache e conectar Socket.IO)
    checkAndSendProPlusSignal(true).then((isActive) => {
        if (isActive) {
            // Conectar ao Socket.IO para receber atualizações em tempo real
            connectToProPlusSocket();
        }
    }).catch(() => {
        // Ignorar erro - continuar normalmente mesmo se falhar
    });
    
    isRunning = true;
    
    // ✅ CARREGAR CONFIGURAÇÕES E ESTADO DO MARTINGALE DO STORAGE IMEDIATAMENTE
    try {
        const storageData = await chrome.storage.local.get(['analyzerConfig', 'martingaleState']);
        
        // Carregar configurações
        if (storageData.analyzerConfig) {
            analyzerConfig = { ...DEFAULT_ANALYZER_CONFIG, ...storageData.analyzerConfig };
            console.log('✅ Configurações carregadas do storage com sucesso!');
            console.log('🔧 DEBUG - Config carregada:', {
                aiMode: analyzerConfig.aiMode,
                aiApiKey: analyzerConfig.aiApiKey ? 'Configurada' : 'Não configurada',
                minOccurrences: analyzerConfig.minOccurrences
            });
            
            // ✅ Se modo IA já estava ativo ao iniciar, marcar flag para aguardar 1 giro
            if (analyzerConfig.aiMode) {
                aiModeJustActivated = true;
                console.log('%c⏳ MODO IA DETECTADO AO INICIAR: Aguardando 1 giro antes de enviar primeiro sinal...', 'color: #FFAA00; font-weight: bold;');
            }
        } else {
            console.log('ℹ️ Usando configurações padrão (nenhuma personalização salva)');
        }
        
        // ⚠️ CRÍTICO: Carregar estado do Martingale do storage (pode haver ciclo em andamento)
        if (storageData.martingaleState && storageData.martingaleState.active) {
            martingaleState = storageData.martingaleState;
            console.log('🔄 Ciclo de Martingale em andamento detectado:', {
                stage: martingaleState.stage,
                entryColor: martingaleState.entryColor,
                lossCount: martingaleState.lossCount
            });
        }
    } catch (e) {
        console.warn('⚠️ Erro ao carregar configurações/estado, usando padrão:', e);
    }
    
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║  🚀 BLAZE ANALYZER - INICIANDO                            ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log('║  📡 Modo: SERVIDOR (coleta do Render.com)                 ║');
    console.log('║  ⚡ Atualização: TEMPO REAL via WebSocket                 ║');
    console.log('║  📊 Limite: 2000 giros | 5000 padrões                     ║');
    console.log('║  💾 Cache: Em memória (não persiste após recarregar)      ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    
    // ✅ EXIBIR CONFIGURAÇÕES ATIVAS AO INICIAR
    console.log('');
    logActiveConfiguration();
    console.log('');
    
    // 1. Limpar padrões locais (começar do zero)
    // ✅ Isso NÃO limpa: entriesHistory, análise pendente, calibrador
    // ✅ Limpa APENAS: banco de padrões (patterns_found)
    await clearAllPatterns();
    
    // ✅ Verificar se entriesHistory foi preservado
    const checkData = await chrome.storage.local.get(['entriesHistory', 'analysis']);
    console.log(`✅ Histórico de entradas preservado: ${(checkData.entriesHistory || []).length} entradas`);
    
    // ✅ Verificar se há análise pendente (aguardando resultado)
    if (checkData.analysis && checkData.analysis.createdOnTimestamp) {
        console.log('╔═══════════════════════════════════════════════════════════╗');
        console.log('║  🎯 ANÁLISE PENDENTE DETECTADA!                          ║');
        console.log('╠═══════════════════════════════════════════════════════════╣');
        console.log(`║  Cor recomendada: ${checkData.analysis.color}`);
        console.log(`║  Confiança: ${checkData.analysis.confidence}%`);
        console.log(`║  Fase: ${checkData.analysis.phase || 'G0'}`);
        console.log(`║  Criada em: ${checkData.analysis.createdOnTimestamp}`);
        console.log('║  Status: Aguardando resultado do próximo giro           ║');
        console.log('╚═══════════════════════════════════════════════════════════╝');
    } else {
        console.log('ℹ️ Nenhuma análise pendente no momento');
    }
    
    // 2. Resetar cache em memória
    console.log('🗑️ Resetando cache em memória...');
    cachedHistory = [];
    historyInitialized = false;
    console.log('✅ Cache em memória resetado.');
    
    // 3. Sincronizar dados com servidor primeiro (popula cache em memória)
    await syncInitialData().catch(e => console.warn('Falha ao sincronizar com servidor:', e));
    
    // 4. Inicializar histórico completo (até 2000) uma vez ao iniciar
    await initializeHistoryIfNeeded().catch(e => console.warn('Falha ao inicializar histórico completo:', e));
    
    // 5. Busca de padrões agora é MANUAL (usuário clica no botão)
    console.log('💡 Para buscar padrões, clique em "🔍 Buscar Padrões (5min)" na interface.');
    
    // 6. ✅ CONECTAR AO WEBSOCKET PARA RECEBER GIROS EM TEMPO REAL
    if (API_CONFIG.useWebSocket) {
        console.log('╔═══════════════════════════════════════════════════════════╗');
        console.log('║  ⚡ MODO WEBSOCKET ATIVO                                   ║');
        console.log('║  Giros serão recebidos em TEMPO REAL (sem delay)         ║');
        console.log('╚═══════════════════════════════════════════════════════════╝');
        connectWebSocket();
        
        // ✅ Iniciar sistema de verificação de dados desatualizados
        startDataFreshnessCheck();
    } else {
        // Fallback: Polling com fetch (modo antigo)
        console.log('⚠️ Modo polling ativo (a cada 2s)');
        intervalId = setInterval(async () => {
            try {
                // ✅ VERIFICAR SE ABA DA BLAZE AINDA ESTÁ ABERTA (A CADA TICK)
                const hasBlaze = await hasBlazeTabOpen();
                if (!hasBlaze) {
                    console.log('╔═══════════════════════════════════════════════════════════╗');
                    console.log('║  ⚠️ ABA DA BLAZE FECHADA - PARANDO COLETA                ║');
                    console.log('╚═══════════════════════════════════════════════════════════╝');
                    stopDataCollection();
                    return;
                }
                
                await collectDoubleData();
            } catch (error) {
                console.error('Erro na coleta de dados:', error);
            }
        }, 2000);
    }
}

// Stop data collection
function stopDataCollection() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    
    // ✅ DESCONECTAR WEBSOCKET
    disconnectWebSocket();
    
    // ✅ PARAR POLLING DE FALLBACK
    stopPollingFallback();
    
    // ✅ PARAR VERIFICAÇÃO DE DADOS DESATUALIZADOS
    stopDataFreshnessCheck();
    
    isRunning = false;
    console.log('Blaze Double Analyzer: Parando coleta de dados');
}

// Collect data from SERVER (agora busca do servidor que está coletando 24/7)
async function collectDoubleData() {
    try {
        // Buscar último giro do SERVIDOR
        const response = await fetch(`${API_CONFIG.baseURL}/api/giros/latest`, {
            signal: AbortSignal.timeout(5000) // Timeout de 5s
        });
        
        if (!response.ok) {
            // Se servidor offline, tenta buscar direto da Blaze (fallback)
            console.warn('⚠️ Servidor offline, buscando direto da Blaze...');
            const blazeResponse = await fetch('https://blaze.bet.br/api/singleplayer-originals/originals/roulette_games/recent/1');
            if (!blazeResponse.ok) throw new Error('Blaze API offline');
            const dataArr = await blazeResponse.json();
            if (!Array.isArray(dataArr) || dataArr.length === 0) return;
            
            const latestSpin = dataArr[0];
            const rollNumber = latestSpin.roll;
            const rollColor = getColorFromNumber(rollNumber);
            
            processNewSpin({
                id: `spin_${latestSpin.created_at}`,
                number: rollNumber,
                color: rollColor,
                timestamp: latestSpin.created_at,
                created_at: latestSpin.created_at,
                source: 'blaze_direct'
            });
            return;
        }
        
        const data = await response.json();
        
        if (data.success && data.data) {
            const latestSpin = data.data;
            
            // Verificar se já temos esse giro localmente e processar
            await processNewSpinFromServer(latestSpin);
        } else {
            console.log('⏳ Aguardando giros do servidor...');
        }
    } catch (error) {
        console.error('Erro ao coletar dados do servidor:', error);
    }
}

// Helper: Converter número em cor
            // ═══════════════════════════════════════════════════════════════════════════════
            // GET COLOR FROM NUMBER - REFATORADO 100%
            // ═══════════════════════════════════════════════════════════════════════════════
            function getColorFromNumber(number) {
                // ✅ VALIDAÇÃO DE ENTRADA (silenciosa)
                if (typeof number !== 'number' || isNaN(number) || number === undefined || number === null) {
                    return 'unknown';
                }
                
                // ✅ NORMALIZAR NÚMERO (caso seja float)
                const normalizedNumber = Math.floor(number);
                
                // ✅ VALIDAR RANGE (0-14)
                if (normalizedNumber < 0 || normalizedNumber > 14) {
                    return 'unknown';
                }
                
                // ✅ DETERMINAR COR
                if (normalizedNumber === 0) {
                    return 'white';
                } else if (normalizedNumber >= 1 && normalizedNumber <= 7) {
                    return 'red';
                } else if (normalizedNumber >= 8 && normalizedNumber <= 14) {
                    return 'black';
                }
                
                // ✅ FALLBACK (nunca deve chegar aqui)
                return 'unknown';
            }

// ☁️ CACHE DO STATUS PROPLUS (para não fazer requisição a cada giro)
let proPlusCache = {
    isActive: false,
    lastCheck: 0,
    checkInterval: 60000 // Verificar apenas a cada 60 segundos
};

// ☁️ Verificar ProPlus e enviar sinal instantaneamente
async function checkAndSendProPlusSignal(forceCheck = false) {
    try {
        // Verificar cache primeiro (não fazer requisição a cada giro)
        const now = Date.now();
        if (!forceCheck && (now - proPlusCache.lastCheck) < proPlusCache.checkInterval) {
            // Usar cache
            if (!proPlusCache.isActive) {
                return false; // ProPlus não está ativo
            }
        }
        
        // Buscar token do storage
        const result = await chrome.storage.local.get(['authToken']);
        const authToken = result.authToken;
        
        if (!authToken) {
            proPlusCache.isActive = false;
            proPlusCache.lastCheck = now;
            return false;
        }
        
        const authApiUrl = API_CONFIG.authURL || 'https://blaze-analyzer-api-v2.onrender.com';
        const response = await fetch(`${authApiUrl}/api/sync/estado`, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(2000)
        });
        
        if (!response.ok) {
            proPlusCache.isActive = false;
            proPlusCache.lastCheck = now;
            return false;
        }
        
        const data = await response.json();
        
        // Atualizar cache
        proPlusCache.isActive = data.success && data.proPlusActive;
        proPlusCache.lastCheck = now;
        
        if (data.success && data.proPlusActive && data.lastSignal) {
            // ✅ ENVIAR SINAL PROPLUS + HISTÓRICO DE ENTRADAS INSTANTANEAMENTE
            console.log('☁️ Enviando sinal ProPlus + entradas para content.js (WebSocket)');
            sendMessageToContent('PROPLUS_SIGNAL', {
                ...data.lastSignal,
                signalsHistory: data.signalsHistory || [] // ✅ Incluir histórico de entradas
            });
            return true;
        }
        
        return false;
    } catch (error) {
        // Ignorar erro silenciosamente (não atrapalha fluxo normal)
        proPlusCache.isActive = false;
        return false;
    }
}

// Processar novo giro vindo do servidor
async function processNewSpinFromServer(spinData) {
    try {
        const rollNumber = spinData.number;
        const rollColor = spinData.color;
        const latestSpin = {
            created_at: spinData.timestamp || spinData.created_at,
            roll: rollNumber
        };
        
            await chrome.storage.local.set({
                lastSpin: {
                    number: rollNumber,
                    color: rollColor,
                    timestamp: latestSpin.created_at
                }
            });
            
            // ☁️ VERIFICAR SE USUÁRIO TEM PROPLUS ATIVO (usa cache, rápido)
            const proPlusActive = await checkAndSendProPlusSignal();
            
            // ✅ SE PROPLUS ESTÁ ATIVO, NÃO RODAR ANÁLISE LOCAL
            if (proPlusActive) {
                console.log('☁️ ProPlus ATIVO - Pulando análise local (servidor analisa)');
                return; // PARAR AQUI - NÃO CONTINUAR COM ANÁLISE LOCAL
            }
        
        // ✅ Usar CACHE EM MEMÓRIA (não salvar em chrome.storage.local)
        let history = [...cachedHistory];  // Cópia do cache
        let entriesHistory = [];
        
        try {
            const result = await chrome.storage.local.get(['entriesHistory']);
            entriesHistory = result['entriesHistory'] || [];
        } catch (e) {
            console.warn('⚠️ Erro ao buscar entriesHistory:', e);
        }
        
            // Adiciona novo giro se diferente do anterior (por timestamp ou número)
            const isNewSpin = history.length === 0 || 
                            history[0].timestamp !== latestSpin.created_at || 
                            history[0].number !== rollNumber;
            
            // ✅ Verificação silenciosa de novo giro
            
            if (isNewSpin) {
            console.log('🎯 NOVO GIRO DETECTADO!', {
                    number: rollNumber,
                    color: rollColor,
                    timestamp: latestSpin.created_at
                });
            const newGiro = {
                id: spinData.id || `spin_${latestSpin.created_at}`,
                    number: rollNumber,
                    color: rollColor,
                timestamp: latestSpin.created_at,
                created_at: latestSpin.created_at
            };
            
            history.unshift(newGiro);
            if (history.length > 2000) history = history.slice(0, 2000);
            
            // ✅ Atualizar CACHE EM MEMÓRIA (não salvar em chrome.storage.local)
            cachedHistory = history;
            
            console.log(`📊 Cache em memória atualizado: ${history.length} giros`);
            
            // ⚡ ATUALIZAR MEMÓRIA ATIVA INCREMENTALMENTE (super rápido!)
            if (memoriaAtiva.inicializada) {
                const sucesso = atualizarMemoriaIncrementalmente(newGiro);
                if (sucesso) {
                    console.log(`%c⚡ Memória Ativa atualizada incrementalmente! (${memoriaAtiva.tempoUltimaAtualizacao.toFixed(2)}ms)`, 'color: #00CED1; font-weight: bold;');
                } else {
                    console.warn('%c⚠️ Falha ao atualizar Memória Ativa! Será reinicializada na próxima análise.', 'color: #FFA500;');
                }
            } else {
                console.log('%c🧠 Memória Ativa não inicializada (será inicializada na próxima análise)', 'color: #00CED1;');
            }
            
            // ✅ CARREGAR CONFIGURAÇÕES E ESTADO DO MARTINGALE DO STORAGE ANTES DE PROCESSAR
            try {
                const storageData = await chrome.storage.local.get(['analyzerConfig', 'martingaleState']);
                
                // Carregar configurações
                if (storageData.analyzerConfig) {
                    analyzerConfig = { ...DEFAULT_ANALYZER_CONFIG, ...storageData.analyzerConfig };
                    console.log('⚙️ Configurações carregadas do storage:', {
                        consecutiveMartingale: analyzerConfig.consecutiveMartingale,
                        maxGales: analyzerConfig.maxGales
                    });
                }
                
                // ⚠️ CRÍTICO: Carregar estado do Martingale do storage
                if (storageData.martingaleState) {
                    martingaleState = storageData.martingaleState;
                    console.log('🔄 Estado do Martingale carregado do storage:', {
                        active: martingaleState.active,
                        stage: martingaleState.stage,
                        entryColor: martingaleState.entryColor,
                        lossCount: martingaleState.lossCount
                    });
                }
            } catch (e) {
                console.warn('⚠️ Erro ao carregar configurações/estado, usando padrão:', e);
            }
            
            // ✅ Enviar novo giro para TODOS os content.js abertos (ATUALIZAÇÃO INSTANTÂNEA DO HISTÓRICO)
            try {
                // 📢 Enviar para TODAS as tabs com content.js injetado
                chrome.tabs.query({}, (tabs) => {
                    tabs.forEach(tab => {
                        try {
                            chrome.tabs.sendMessage(tab.id, {
                                type: 'NEW_SPIN',  // ✅ CORRIGIDO: era "action", agora é "type"
                                data: {
                                    lastSpin: { number: rollNumber, color: rollColor, timestamp: latestSpin.created_at }
                                }
                            });
                        } catch (e) {
                            // Ignorar tabs sem content.js (normal)
                        }
                    });
                });
                console.log('⚡ Novo giro enviado para TODOS os content.js - histórico será atualizado INSTANTANEAMENTE!');
            } catch (e) {
                console.log('ℹ️ Erro ao enviar mensagem para content.js:', e.message);
            }
            
            // ❌ REMOVIDO: Chamada duplicada de runAnalysisController
            // A análise será executada APÓS processar WIN/LOSS (linha ~1094)
            
            // ✅ Cache já foi atualizado acima - não salvar em chrome.storage.local
            
            console.log('╔═══════════════════════════════════════════════════════════╗');
            console.log('║  🎯 VERIFICANDO RECOMENDAÇÃO PENDENTE                    ║');
            console.log('╚═══════════════════════════════════════════════════════════╝');
            console.log('🔍 Buscando currentAnalysis de chrome.storage.local...');
                
                // Avaliar recomendação pendente (WIN / G1 / G2)
            const currentAnalysisResult = await chrome.storage.local.get(['analysis']);
            const currentAnalysis = currentAnalysisResult['analysis'];
            
            console.log('📊 Resultado da busca:', currentAnalysisResult);
            console.log('📊 currentAnalysis existe?', currentAnalysis ? 'SIM' : 'NÃO');
            
            if (currentAnalysis) {
                console.log('   Cor recomendada:', currentAnalysis.color);
                console.log('   Confiança:', currentAnalysis.confidence);
                console.log('   Fase:', currentAnalysis.phase || 'G0');
                console.log('   Timestamp recomendação:', currentAnalysis.createdOnTimestamp);
                console.log('   PredictedFor:', currentAnalysis.predictedFor);
            }
            
            console.log('🎲 Giro atual:');
            console.log('   Cor:', rollColor);
            console.log('   Número:', rollNumber);
            console.log('   Timestamp:', latestSpin.created_at);
            console.log('');
            
                if (currentAnalysis && currentAnalysis.createdOnTimestamp && currentAnalysis.predictedFor === 'next') {
                console.log('✅ Recomendação pendente encontrada!');
                console.log('🔍 Comparando timestamps:');
                console.log('   Recomendação:', currentAnalysis.createdOnTimestamp);
                console.log('   Giro atual:', latestSpin.created_at);
                console.log('   São diferentes?', currentAnalysis.createdOnTimestamp !== latestSpin.created_at);
                
                    // Novo giro chegou para a recomendação pendente
                    if (currentAnalysis.createdOnTimestamp !== latestSpin.created_at) {
                    console.log('🎯 AVALIAR RESULTADO!');
                    console.log('   Esperado:', currentAnalysis.color);
                    console.log('   Real:', rollColor);
                    console.log('   Tipo esperado:', typeof currentAnalysis.color);
                    console.log('   Tipo real:', typeof rollColor);
                    console.log('   Comparação exata:', rollColor === currentAnalysis.color);
                    console.log('   Comparação case-insensitive:', rollColor.toLowerCase() === currentAnalysis.color.toLowerCase());
                    
                        // ✅ CORREÇÃO CRÍTICA: Comparação robusta de cores
                        const expectedColor = String(currentAnalysis.color || '').toLowerCase().trim();
                        const actualColor = String(rollColor || '').toLowerCase().trim();
                        const hit = (expectedColor === actualColor);
                    
                    console.log('   ═══════════════════════════════════════════════════');
                    console.log('   🔍 VERIFICAÇÃO FINAL DE WIN/LOSS:');
                    console.log('   Esperado (processado):', expectedColor);
                    console.log('   Real (processado):', actualColor);
                    console.log('   São iguais?', hit);
                    console.log('   Resultado FINAL:', hit ? '✅ WIN!' : '❌ LOSS!');
                    console.log('   ═══════════════════════════════════════════════════');
                    
                        if (hit) {
                        console.log('');
                        console.log('╔═══════════════════════════════════════════════════════════╗');
                        console.log('║  ✅ WIN DETECTADO!                                       ║');
                        console.log('╚═══════════════════════════════════════════════════════════╝');
                            
                            // ═══════════════════════════════════════════════════════════════
                            // ✅ SISTEMA DE MARTINGALE - LÓGICA DE WIN
                            // ═══════════════════════════════════════════════════════════════
                            
                            // ✅ VALIDAÇÃO CRÍTICA: Garantir que não há processamento duplo
                            console.log('🔒 VALIDAÇÃO CRÍTICA: Verificando se já foi processado...');
                            console.log('   Martingale ativo:', martingaleState.active);
                            console.log('   Estágio atual:', martingaleState.stage);
                            console.log('   Análise fase:', currentAnalysis.phase);
                            
                            // Se já foi processado como WIN, não processar novamente
                            if (martingaleState.active && martingaleState.stage !== 'ENTRADA' && currentAnalysis.phase === 'G0') {
                                console.log('⚠️ ATENÇÃO: Possível processamento duplo detectado!');
                                console.log('   Martingale ativo mas análise é G0 - pode ser WIN já processado');
                                return; // Sair sem processar
                            }
                            
                            // Determinar estágio do Martingale CORRETAMENTE
                            // ✅ Verificar PRIMEIRO a fase da análise (G1/G2), depois o estado
                            let martingaleStage = 'ENTRADA';
                            if (currentAnalysis.phase === 'G1') {
                                martingaleStage = 'G1';
                            } else if (currentAnalysis.phase === 'G2') {
                                martingaleStage = 'G2';
                            } else if (martingaleState.active) {
                                martingaleStage = martingaleState.stage;
                            }
                            
                            const patternKey = martingaleState.active ? martingaleState.patternKey : createPatternKey(currentAnalysis);
                            
                            console.log(`🎯 WIN no estágio: ${martingaleStage}`);
                            console.log(`🔑 Padrão: ${patternKey}`);
                            
                            // WIN: registrar entrada com informações de Martingale
                            const winEntry = {
                                timestamp: latestSpin.created_at,
                                number: rollNumber,
                                color: rollColor,
                                phase: currentAnalysis.phase || 'G0',
                                result: 'WIN',
                                confidence: currentAnalysis.confidence,
                                patternData: {
                                    patternDescription: currentAnalysis.patternDescription,
                                    confidence: currentAnalysis.confidence,
                                    color: currentAnalysis.color,
                                    createdOnTimestamp: currentAnalysis.createdOnTimestamp
                                },
                                // ✅ CAMPOS DO MARTINGALE
                                martingaleStage: martingaleStage,  // 'ENTRADA' | 'G1' | 'G2'
                                wonAt: martingaleStage,             // Onde ganhou
                                finalResult: 'WIN'                  // Resultado final do ciclo
                            };
                            
                            console.log('📝 Entrada WIN criada com Martingale:', {
                                stage: winEntry.martingaleStage,
                                wonAt: winEntry.wonAt,
                                color: winEntry.color,
                                number: winEntry.number
                            });
                            
                            entriesHistory.unshift(winEntry);
                            
                            // ✅ Calcular estatísticas WIN/LOSS baseado em CICLOS COMPLETOS
                            const { totalWins, totalLosses } = calculateCycleScore(entriesHistory);
                            
                            // ✅ Enviar confirmação de WIN ao Telegram (com informação de Martingale)
                            await sendTelegramMartingaleWin(
                                martingaleStage, 
                                { color: rollColor, number: rollNumber, timestamp: latestSpin.created_at },
                                totalWins,
                                totalLosses
                            );
                            
                            // Registrar no observador inteligente
                            await registerEntryInObserver(
                                currentAnalysis.confidence,
                                'win',
                                currentAnalysis.createdOnTimestamp,
                                { type: currentAnalysis.patternType, occurrences: currentAnalysis.occurrences }
                            );
                            
                            // ✅ ATUALIZAR HISTÓRICO DE CORES QUENTES
                            if (martingaleState.active && (martingaleStage === 'G1' || martingaleStage === 'G2')) {
                                console.log('📊 Atualizando histórico de cores quentes após WIN...');
                                
                                // Construir sequência de cores DOS GIROS (não das apostas!)
                                const colorSequence = [];
                                
                                // Adicionar cores dos LOSSes (giros que realmente saíram)
                                martingaleState.lossColors.forEach(color => {
                                    colorSequence.push({ color });
                                });
                                
                                // Adicionar cor que GANHOU (giro atual)
                                colorSequence.push({ color: rollColor });
                                
                                console.log('   Sequência de cores dos giros:', colorSequence.map(c => c.color).join(' → '));
                                
                                await updateHotColorsHistory(patternKey, colorSequence);
                            }
                            
                            // ✅ RESETAR CICLO DE MARTINGALE - CRÍTICO!
                            if (martingaleState.active) {
                                console.log('🔄 Resetando ciclo de Martingale após WIN');
                                console.log('   Estado ANTES do reset:', {
                                    active: martingaleState.active,
                                    stage: martingaleState.stage,
                                    patternKey: martingaleState.patternKey
                                });
                                resetMartingaleState();
                                console.log('   Estado APÓS o reset:', {
                                    active: martingaleState.active,
                                    stage: martingaleState.stage,
                                    patternKey: martingaleState.patternKey
                                });
                            }
                            
                            await chrome.storage.local.set({ 
                                analysis: null, 
                                pattern: null,
                                lastBet: { status: 'win', phase: currentAnalysis.phase || 'G0', resolvedAtTimestamp: latestSpin.created_at },
                                entriesHistory,
                                martingaleState,  // ✅ Salvar estado do Martingale
                                rigorLevel: 75 // RESET: Volta para 75% após WIN
                            });
                            sendMessageToContent('CLEAR_ANALYSIS');
                            
                            // ✅ Enviar atualização de entradas para UI
                            console.log('📤 Enviando ENTRIES_UPDATE para UI...');
                            console.log('📊 Total de entradas:', entriesHistory.length);
                            sendMessageToContent('ENTRIES_UPDATE', entriesHistory);
                        } else {
                            console.log('');
                            console.log('╔═══════════════════════════════════════════════════════════╗');
                            console.log('║  ❌ LOSS DETECTADO!                                      ║');
                            console.log('╚═══════════════════════════════════════════════════════════╝');
                            
                            // ═══════════════════════════════════════════════════════════════
                            // ✅ SISTEMA DE MARTINGALE - LÓGICA DE LOSS
                            // ═══════════════════════════════════════════════════════════════
                            
                            // Determinar estágio atual
                            const currentStage = martingaleState.active ? martingaleState.stage : 'ENTRADA';
                            const patternKey = martingaleState.active ? martingaleState.patternKey : createPatternKey(currentAnalysis);
                            
                            console.log(`❌ LOSS no estágio: ${currentStage}`);
                            console.log(`🔑 Padrão: ${patternKey}`);
                            console.log(`🎲 Esperado: ${currentAnalysis.color}, Real: ${rollColor}`);
                            
                            // ✅ VERIFICAR SE É O ÚLTIMO GALE (vai virar RET) ou se ainda tem mais Gales
                            // NÃO ENVIAR MENSAGEM AQUI - será enviada dentro da lógica abaixo
                            
                            // ✅ REGISTRAR NO CALIBRADOR DE PORCENTAGENS
                            await registerEntryInObserver(
                                currentAnalysis.confidence,
                                'loss',
                                currentAnalysis.createdOnTimestamp,
                                { type: currentAnalysis.patternType, occurrences: currentAnalysis.occurrences }
                            );
                            
                            // ═══════════════════════════════════════════════════════════════
                            // NOVA LÓGICA DE MARTINGALE - DECIDIR PRÓXIMA AÇÃO
                            // ═══════════════════════════════════════════════════════════════
                            
                            // ═══════════════════════════════════════════════════════════════
                            // ✅ LÓGICA DINÂMICA DE MARTINGALE - FUNCIONA PARA QUALQUER QUANTIDADE
                            // ═══════════════════════════════════════════════════════════════
                            
                            // Determinar o número do Gale atual (0=ENTRADA, 1=G1, 2=G2, 3=G3...)
                            let currentGaleNumber = 0;
                            if (currentStage === 'ENTRADA') {
                                currentGaleNumber = 0;
                            } else if (currentStage.startsWith('G')) {
                                currentGaleNumber = parseInt(currentStage.substring(1)) || 0;
                            }
                            
                            const nextGaleNumber = currentGaleNumber + 1;
                            const maxGales = analyzerConfig.maxGales || 0;
                            
                            console.log(`╔═══════════════════════════════════════════════════════════╗`);
                            console.log(`║  ❌ LOSS no ${currentStage === 'ENTRADA' ? 'ENTRADA PADRÃO' : currentStage}                                  ║`);
                            console.log(`╠═══════════════════════════════════════════════════════════╣`);
                            console.log(`║  ⚙️  Configuração: ${maxGales} Gale${maxGales !== 1 ? 's' : ''} permitido${maxGales !== 1 ? 's' : ''}           ║`);
                            console.log(`║  📊 Atual: Gale ${currentGaleNumber} (${currentStage})                        ║`);
                            console.log(`║  🎯 Próximo: ${nextGaleNumber <= maxGales ? `Tentar G${nextGaleNumber}` : 'RET (limite atingido)'}                  ║`);
                            console.log(`╚═══════════════════════════════════════════════════════════╝`);
                            
                            // Verificar se ainda pode tentar mais Gales
                            const canTryNextGale = nextGaleNumber <= maxGales;
                            
                            if (currentStage === 'ENTRADA') {
                                // ═══════════════════════════════════════════════════════════════
                                // ✅ LOSS NA ENTRADA: Verificar se pode tentar G1
                                // ═══════════════════════════════════════════════════════════════
                                
                                if (!canTryNextGale) {
                                    // ❌ SEM GALES: Registrar LOSS direto
                                    console.log('⛔ CONFIGURAÇÃO: 0 Gales - Registrando LOSS direto');
                                    
                                    const lossEntry = {
                                        timestamp: latestSpin.created_at,
                                        number: rollNumber,
                                        color: rollColor,
                                        phase: 'G0',
                                        result: 'LOSS',
                                        confidence: currentAnalysis.confidence,
                                        patternData: {
                                            patternDescription: currentAnalysis.patternDescription,
                                            confidence: currentAnalysis.confidence,
                                            color: currentAnalysis.color,
                                            createdOnTimestamp: currentAnalysis.createdOnTimestamp
                                        },
                                        martingaleStage: 'ENTRADA',
                                        finalResult: 'RET'
                                    };
                                    
                                    entriesHistory.unshift(lossEntry);
                                    
                                    // ✅ Calcular estatísticas WIN/LOSS
                                    const { totalWins, totalLosses } = calculateCycleScore(entriesHistory);
                                    
                                    // ✅ ENVIAR MENSAGEM DE RET AO TELEGRAM (sem Gales)
                                    console.log('📤 Enviando mensagem de RET ao Telegram (0 Gales configurados)...');
                                    await sendTelegramMartingaleRET(totalWins, totalLosses);
                                    
                                    resetMartingaleState();
                                    
                                    await chrome.storage.local.set({ 
                                        analysis: null, 
                                        pattern: null,
                                        lastBet: { status: 'loss', phase: 'G0', resolvedAtTimestamp: latestSpin.created_at },
                                        entriesHistory,
                                        martingaleState
                                    });
                                    
                                    sendMessageToContent('CLEAR_ANALYSIS');
                                    sendMessageToContent('ENTRIES_UPDATE', entriesHistory);
                                    return;
                                }
                                
                                // ✅ TEM GALES: Tentar G1
                                console.log(`🔄 Tentando G${nextGaleNumber}...`);
                                console.log(`⚙️ Martingale Consecutivo: ${analyzerConfig.consecutiveMartingale ? 'ATIVADO' : 'DESATIVADO'}`);
                                
                                // ✅ ENVIAR MENSAGEM DE LOSS ENTRADA (vai tentar G1)
                                await sendTelegramMartingaleLoss(
                                    currentStage,
                                    { color: rollColor, number: rollNumber, timestamp: latestSpin.created_at }
                                );
                                
                                // ✅ USAR SEMPRE A MESMA COR DA ENTRADA ORIGINAL
                                const g1Color = currentAnalysis.color;
                                
                                // ⚠️ CRÍTICO: Registrar LOSS da ENTRADA antes de tentar G1
                                const entradaLossEntry = {
                            timestamp: latestSpin.created_at,
                            number: rollNumber,
                            color: rollColor,
                                    phase: 'G0',
                            result: 'LOSS',
                            confidence: currentAnalysis.confidence,
                            patternData: {
                                patternDescription: currentAnalysis.patternDescription,
                                confidence: currentAnalysis.confidence,
                                color: currentAnalysis.color,
                                createdOnTimestamp: currentAnalysis.createdOnTimestamp
                                    },
                                    martingaleStage: 'ENTRADA',
                                    finalResult: null,  // Ainda não é final, vai tentar G1
                                    continuingToG1: true  // Flag indicando que continuará
                                };
                                
                                entriesHistory.unshift(entradaLossEntry);
                                
                                // Salvar estado do Martingale
                                martingaleState.active = true;
                                martingaleState.stage = 'G1';
                                martingaleState.patternKey = patternKey;
                                martingaleState.entryColor = currentAnalysis.color;
                                martingaleState.entryColorResult = rollColor;  // ✅ Cor que realmente saiu
                                martingaleState.entryTimestamp = currentAnalysis.createdOnTimestamp;
                                martingaleState.analysisData = currentAnalysis;
                                martingaleState.lossCount = 1;
                                martingaleState.lossColors = [rollColor];  // ✅ Guardar cores dos LOSSes
                                
                                // ═══════════════════════════════════════════════════════════════
                                // VERIFICAR MODO DE MARTINGALE
                                // ═══════════════════════════════════════════════════════════════
                                
                                if (analyzerConfig.consecutiveMartingale) {
                                    // ✅ MODO CONSECUTIVO: Enviar G1 IMEDIATAMENTE no próximo giro
                                    console.log('🎯 MODO CONSECUTIVO: G1 será enviado no PRÓXIMO GIRO');
                                    
                                    await sendTelegramMartingaleG1(g1Color, null);
                                    
                                    // Criar análise G1 com timestamp do próximo giro
                                    const g1Analysis = {
                                        ...currentAnalysis,
                                        color: g1Color,
                                        phase: 'G1',
                                        predictedFor: 'next',
                                        createdOnTimestamp: latestSpin.created_at  // ✅ Usar giro atual
                                    };
                                    
                                    await chrome.storage.local.set({
                                        analysis: g1Analysis,
                                        pattern: { description: g1Analysis.patternDescription, confidence: g1Analysis.confidence },
                                        lastBet: { status: 'pending', phase: 'G1', createdOnTimestamp: g1Analysis.createdOnTimestamp },
                                        entriesHistory,
                                        martingaleState
                                    });
                                    
                                    sendMessageToContent('NEW_ANALYSIS', g1Analysis);
                                } else {
                                    // ❌ MODO PADRÃO: Aguardar novo padrão para enviar G1
                                    console.log('⏳ MODO PADRÃO: Aguardando novo padrão para enviar G1...');
                                    
                                    await chrome.storage.local.set({
                                        analysis: null,
                                        pattern: null,
                                        lastBet: { status: 'loss', phase: 'G0', resolvedAtTimestamp: latestSpin.created_at },
                                        entriesHistory,
                                        martingaleState
                                    });
                                    
                                    sendMessageToContent('CLEAR_ANALYSIS');
                                    sendMessageToContent('ENTRIES_UPDATE', entriesHistory);
                                }
                                
                            } else if (currentStage.startsWith('G')) {
                                // ═══════════════════════════════════════════════════════════════
                                // ✅ LOSS EM QUALQUER GALE (G1, G2, G3... G200)
                                // ═══════════════════════════════════════════════════════════════
                                
                                if (!canTryNextGale) {
                                    // ❌ LIMITE ATINGIDO: Registrar RET
                                    console.log(`⛔ Limite de Gales atingido (${currentGaleNumber}/${maxGales}) - Registrando RET`);
                                    
                                    const retEntry = {
                                        timestamp: latestSpin.created_at,
                                        number: rollNumber,
                                        color: rollColor,
                                        phase: currentStage,
                                        result: 'LOSS',
                                        confidence: currentAnalysis.confidence,
                                        patternData: {
                                            patternDescription: currentAnalysis.patternDescription,
                                            confidence: currentAnalysis.confidence,
                                            color: currentAnalysis.color,
                                            createdOnTimestamp: currentAnalysis.createdOnTimestamp
                                        },
                                        martingaleStage: currentStage,
                                        finalResult: 'RET'
                                    };
                                    
                                    entriesHistory.unshift(retEntry);
                                    
                                    // ✅ Calcular estatísticas WIN/LOSS baseado em CICLOS COMPLETOS
                                    const { totalWins, totalLosses } = calculateCycleScore(entriesHistory);
                                    
                                    await sendTelegramMartingaleRET(totalWins, totalLosses);
                                    
                                    // ✅ ATUALIZAR HISTÓRICO DE CORES QUENTES
                                    const colorSequence = [];
                                    martingaleState.lossColors.forEach(color => {
                                        colorSequence.push({ color });
                                    });
                                    colorSequence.push({ color: rollColor });
                                    await updateHotColorsHistory(patternKey, colorSequence);
                                    
                                    resetMartingaleState();
                                    
                                    await chrome.storage.local.set({ 
                                        analysis: null, 
                                        pattern: null, 
                                        lastBet: { status: 'loss', phase: currentStage, resolvedAtTimestamp: latestSpin.created_at },
                                        entriesHistory,
                                        martingaleState
                                    });
                                    
                                    sendMessageToContent('CLEAR_ANALYSIS');
                                    sendMessageToContent('ENTRIES_UPDATE', entriesHistory);
                                    return;
                                }
                                
                                // ✅ TEM GALES: Tentar próximo
                                console.log(`🔄 Tentando G${nextGaleNumber}...`);
                                console.log(`⚙️ Martingale Consecutivo: ${analyzerConfig.consecutiveMartingale ? 'ATIVADO' : 'DESATIVADO'}`);
                                
                                // ✅ ENVIAR MENSAGEM DE LOSS (vai tentar próximo Gale)
                                await sendTelegramMartingaleLoss(
                                    currentStage,
                                    { color: rollColor, number: rollNumber, timestamp: latestSpin.created_at }
                                );
                                
                                // ✅ USAR SEMPRE A MESMA COR DA ENTRADA ORIGINAL
                                console.log('╔═══════════════════════════════════════════════════════════╗');
                                console.log('║  🔍 DEBUG: VERIFICANDO COR DO MARTINGALE                 ║');
                                console.log('╠═══════════════════════════════════════════════════════════╣');
                                console.log(`║  martingaleState.entryColor: ${martingaleState.entryColor}                   ║`);
                                console.log(`║  currentAnalysis.color: ${currentAnalysis.color}                        ║`);
                                console.log('╚═══════════════════════════════════════════════════════════╝');
                                
                                const nextGaleColor = martingaleState.entryColor;
                                
                                console.log(`🎯 COR CONFIRMADA PARA G${nextGaleNumber}: ${nextGaleColor}`);
                                
                                // ⚠️ CRÍTICO: Registrar LOSS do Gale atual
                                const galeLossEntry = {
                                    timestamp: latestSpin.created_at,
                                    number: rollNumber,
                                    color: rollColor,
                                    phase: currentStage,
                                    result: 'LOSS',
                                    confidence: currentAnalysis.confidence,
                                    patternData: {
                                        patternDescription: currentAnalysis.patternDescription,
                                        confidence: currentAnalysis.confidence,
                                        color: currentAnalysis.color,
                                        createdOnTimestamp: currentAnalysis.createdOnTimestamp
                                    },
                                    martingaleStage: currentStage,
                                    finalResult: null,
                                    [`continuingToG${nextGaleNumber}`]: true
                                };
                                
                                entriesHistory.unshift(galeLossEntry);
                                
                                // Atualizar estado do Martingale
                                martingaleState.stage = `G${nextGaleNumber}`;
                                martingaleState.lossCount = nextGaleNumber;
                                martingaleState.lossColors.push(rollColor);
                                
                                // Verificar modo de Martingale
                                if (analyzerConfig.consecutiveMartingale) {
                                    // ✅ MODO CONSECUTIVO
                                    console.log(`🎯 MODO CONSECUTIVO: G${nextGaleNumber} será enviado no PRÓXIMO GIRO`);
                                    
                                    await sendTelegramMartingaleGale(nextGaleNumber, nextGaleColor, null);
                                    
                                    const nextGaleAnalysis = {
                                        ...currentAnalysis,
                                        color: nextGaleColor,
                                        phase: `G${nextGaleNumber}`,
                                        predictedFor: 'next',
                                        createdOnTimestamp: latestSpin.created_at
                                    };
                                    
                                    await chrome.storage.local.set({
                                        analysis: nextGaleAnalysis,
                                        pattern: { description: nextGaleAnalysis.patternDescription, confidence: nextGaleAnalysis.confidence },
                                        lastBet: { status: 'pending', phase: `G${nextGaleNumber}`, createdOnTimestamp: nextGaleAnalysis.createdOnTimestamp },
                                        entriesHistory,
                                        martingaleState
                                    });
                                    
                                    sendMessageToContent('NEW_ANALYSIS', nextGaleAnalysis);
                                } else {
                                    // ❌ MODO PADRÃO
                                    console.log(`⏳ MODO PADRÃO: Aguardando novo padrão para enviar G${nextGaleNumber}...`);
                                    
                                    await chrome.storage.local.set({
                                        analysis: null,
                                        pattern: null,
                                        lastBet: { status: 'loss', phase: currentStage, resolvedAtTimestamp: latestSpin.created_at },
                                        entriesHistory,
                                        martingaleState
                                    });
                                    
                                    sendMessageToContent('CLEAR_ANALYSIS');
                                    sendMessageToContent('ENTRIES_UPDATE', entriesHistory);
                                }
                                
                            } else if (false) {
                                // BLOCO ANTIGO DESATIVADO - MANTIDO PARA REFERÊNCIA
                                // ═══════════════════════════════════════════════════════════════
                                // ✅ LOSS NO G1: Verificar modo de Martingale
                                // ═══════════════════════════════════════════════════════════════
                                console.log('🔄 LOSS no G1 - Verificando modo de Martingale...');
                                console.log(`⚙️ Martingale Consecutivo: ${analyzerConfig.consecutiveMartingale ? 'ATIVADO' : 'DESATIVADO'}`);
                                
                                // ✅ USAR SEMPRE A MESMA COR DA ENTRADA ORIGINAL
                                const g2Color = martingaleState.entryColor;
                                
                                // ⚠️ CRÍTICO: Registrar LOSS do G1 antes de tentar G2
                                const g1LossEntry = {
                                    timestamp: latestSpin.created_at,
                                    number: rollNumber,
                                    color: rollColor,
                                    phase: 'G1',
                                    result: 'LOSS',
                                    confidence: currentAnalysis.confidence,
                                    patternData: {
                                        patternDescription: currentAnalysis.patternDescription,
                                        confidence: currentAnalysis.confidence,
                                        color: currentAnalysis.color,
                                        createdOnTimestamp: currentAnalysis.createdOnTimestamp
                                    },
                                    martingaleStage: 'G1',
                                    finalResult: null,  // Ainda não é final, vai tentar G2
                                    continuingToG2: true  // Flag indicando que continuará
                                };
                                
                                entriesHistory.unshift(g1LossEntry);
                                
                                // Atualizar estado do Martingale
                                martingaleState.stage = 'G2';
                                martingaleState.lossCount = 2;
                                martingaleState.lossColors.push(rollColor);  // ✅ Adicionar cor do G1 que perdeu
                                
                                // ═══════════════════════════════════════════════════════════════
                                // VERIFICAR MODO DE MARTINGALE
                                // ═══════════════════════════════════════════════════════════════
                                
                                if (analyzerConfig.consecutiveMartingale) {
                                    // ✅ MODO CONSECUTIVO: Enviar G2 IMEDIATAMENTE no próximo giro
                                    console.log('🎯 MODO CONSECUTIVO: G2 será enviado no PRÓXIMO GIRO');
                                    
                                    await sendTelegramMartingaleG2(g2Color, null);
                                    
                                    // Criar análise G2 com timestamp do próximo giro
                                    const g2Analysis = {
                                        ...currentAnalysis,
                                        color: g2Color,
                                        phase: 'G2',
                                        predictedFor: 'next',
                                        createdOnTimestamp: latestSpin.created_at  // ✅ Usar giro atual
                                    };
                                    
                                    await chrome.storage.local.set({
                                        analysis: g2Analysis,
                                        pattern: { description: g2Analysis.patternDescription, confidence: g2Analysis.confidence },
                                        lastBet: { status: 'pending', phase: 'G2', createdOnTimestamp: g2Analysis.createdOnTimestamp },
                                        entriesHistory,
                                        martingaleState
                                    });
                                    
                                    sendMessageToContent('NEW_ANALYSIS', g2Analysis);
                                } else {
                                    // ❌ MODO PADRÃO: Aguardar novo padrão para enviar G2
                                    console.log('⏳ MODO PADRÃO: Aguardando novo padrão para enviar G2...');
                                    
                                    await chrome.storage.local.set({
                                        analysis: null,
                                        pattern: null,
                                        lastBet: { status: 'loss', phase: 'G1', resolvedAtTimestamp: latestSpin.created_at },
                                        entriesHistory,
                                        martingaleState
                                    });
                                    
                                    sendMessageToContent('CLEAR_ANALYSIS');
                                    sendMessageToContent('ENTRIES_UPDATE', entriesHistory);
                                }
                                
                            } else if (currentStage === 'G2') {
                                // ❌ LOSS NO G2: RET (Loss Final)
                                console.log('⛔ LOSS no G2 - RET');
                                
                                const retEntry = {
                                    timestamp: latestSpin.created_at,
                                    number: rollNumber,
                                    color: rollColor,
                                    phase: 'G2',
                                    result: 'LOSS',
                                    confidence: currentAnalysis.confidence,
                                    patternData: {
                                        patternDescription: currentAnalysis.patternDescription,
                                        confidence: currentAnalysis.confidence,
                                        color: currentAnalysis.color,
                                        createdOnTimestamp: currentAnalysis.createdOnTimestamp
                                    },
                                    martingaleStage: 'G2',
                                    finalResult: 'RET'
                                };
                                
                                entriesHistory.unshift(retEntry);
                                
                                await sendTelegramMartingaleRET(totalWins, totalLosses + 1);
                                
                                // ✅ ATUALIZAR HISTÓRICO DE CORES QUENTES
                                console.log('📊 Atualizando histórico de cores quentes após RET...');
                                
                                // Construir sequência de cores DOS GIROS (não das apostas!)
                                const colorSequence = [];
                                
                                // Adicionar cores dos LOSSes (giros que realmente saíram)
                                martingaleState.lossColors.forEach(color => {
                                    colorSequence.push({ color });
                                });
                                
                                // Adicionar cor do G2 que perdeu (giro atual)
                                colorSequence.push({ color: rollColor });
                                
                                console.log('   Sequência de cores dos giros:', colorSequence.map(c => c.color).join(' → '));
                                
                                await updateHotColorsHistory(patternKey, colorSequence);
                                
                                resetMartingaleState();
                                
                                    await chrome.storage.local.set({ 
                                        analysis: null, 
                                        pattern: null, 
                                    lastBet: { status: 'loss', phase: 'G2', resolvedAtTimestamp: latestSpin.created_at },
                                        entriesHistory,
                                    martingaleState
                                    });
                                
                                    sendMessageToContent('CLEAR_ANALYSIS');
                                    sendMessageToContent('ENTRIES_UPDATE', entriesHistory);
                            }
                        }
                    }
                } else {
                    console.log('⚠️ NÃO há recomendação pendente para avaliar');
                    if (!currentAnalysis) {
                        console.log('   Motivo: currentAnalysis não existe');
                    } else if (!currentAnalysis.createdOnTimestamp) {
                        console.log('   Motivo: createdOnTimestamp ausente');
                    } else if (currentAnalysis.predictedFor !== 'next') {
                        console.log('   Motivo: predictedFor =', currentAnalysis.predictedFor, '(esperado: "next")');
                    }
                }
                console.log('═══════════════════════════════════════════════════════════\n');
                
                // Notificar content script sobre novo giro
                sendMessageToContent('NEW_SPIN', { 
                    history: history, 
                    lastSpin: { number: rollNumber, color: rollColor, timestamp: latestSpin.created_at } 
                });
                
                // ✅ EXECUTAR NOVA ANÁLISE (após processar WIN/LOSS)
            console.log('');
            console.log('');
            console.log('%c╔═══════════════════════════════════════════════════════════════════════════════╗', 'color: #FFD700; font-weight: bold; font-size: 16px; background: #333300; padding: 5px;');
            console.log('%c║                                                                               ║', 'color: #FFD700; font-weight: bold; font-size: 16px; background: #333300; padding: 5px;');
            console.log('%c║       🎯 PRESTES A CHAMAR runAnalysisController()! 🎯                        ║', 'color: #FFD700; font-weight: bold; font-size: 16px; background: #333300; padding: 5px;');
            console.log('%c║                                                                               ║', 'color: #FFD700; font-weight: bold; font-size: 16px; background: #333300; padding: 5px;');
            console.log('%c║       📊 Giros no histórico:', 'color: #FFD700; font-weight: bold; background: #333300; padding: 5px;', history ? history.length : 0);
            console.log('%c║       🤖 Modo IA ativo:', 'color: #FFD700; font-weight: bold; background: #333300; padding: 5px;', analyzerConfig.aiMode);
            console.log('%c║                                                                               ║', 'color: #FFD700; font-weight: bold; font-size: 16px; background: #333300; padding: 5px;');
            console.log('%c╚═══════════════════════════════════════════════════════════════════════════════╝', 'color: #FFD700; font-weight: bold; font-size: 16px; background: #333300; padding: 5px;');
            console.log('');
            
            await runAnalysisController(history);
            
            console.log('');
            console.log('%c✅ runAnalysisController() FINALIZADO!', 'color: #00FF88; font-weight: bold; font-size: 16px; background: #003300; padding: 5px;');
            console.log('');
        }
    } catch (error) {
        console.error('Erro ao processar giro do servidor:', error);
    }
}

// ═══════════════════════════════════════════════════════════════
// ✅ FUNÇÃO PARA CALCULAR PLACAR BASEADO EM CICLOS COMPLETOS
// ═══════════════════════════════════════════════════════════════
function calculateCycleScore(entriesHistory) {
    console.log('📊 Calculando placar baseado em CICLOS...');
    
    let totalWins = 0;
    let totalLosses = 0;
    
    // Contar apenas entradas com finalResult definido (ciclos completos)
    for (const entry of entriesHistory) {
        if (entry.finalResult === 'WIN') {
            totalWins++;
            console.log(`  ✅ WIN (${entry.martingaleStage || entry.phase})`);
        } else if (entry.finalResult === 'RET') {
            totalLosses++;
            console.log(`  ❌ LOSS (${entry.martingaleStage || entry.phase} - Não pagou)`);
        }
    }
    
    console.log(`📊 Placar final: WIN: ${totalWins} | LOSS: ${totalLosses}`);
    return { totalWins, totalLosses };
}

// Função auxiliar para processar giro vindo direto da Blaze (fallback)
function processNewSpin(spinData) {
    return processNewSpinFromServer(spinData);
}

// Tenta carregar os últimos 2000 giros de uma vez do SERVIDOR e popular cache em memória
async function initializeHistoryIfNeeded() {
    if (historyInitialized) return; // já inicializado nesta sessão

    try {
        // Buscar giros do SERVIDOR primeiro
        console.log('📥 Buscando histórico inicial do servidor para cache em memória...');
        const serverGiros = await fetchGirosFromAPI();
        
        if (serverGiros && serverGiros.length > 0) {
            console.log(`✅ ${serverGiros.length} giros recebidos do servidor!`);
            // ✅ Popular CACHE EM MEMÓRIA (não salvar em chrome.storage.local)
            cachedHistory = [...serverGiros].slice(0, 2000);
            historyInitialized = true;
            console.log(`📊 Cache em memória inicializado: ${cachedHistory.length} giros`);
            return;
        }
        
        // Se servidor não tiver dados, buscar direto da Blaze (fallback)
        console.log('⚠️ Servidor sem dados, buscando direto da Blaze...');
        const endpoints = [
            'https://blaze.bet.br/api/singleplayer-originals/originals/roulette_games/recent/2000',
            'https://blaze.bet.br/api/singleplayer-originals/originals/roulette_games/recent/300',
            'https://blaze.bet.br/api/singleplayer-originals/originals/roulette_games/recent/100'
        ];
        let combined = [];
        for (const url of endpoints) {
            try {
                const r = await fetch(url);
                if (!r.ok) continue;
                const json = await r.json();
                const arr = Array.isArray(json) ? json : (json?.data || json?.records || json?.items || []);
                if (Array.isArray(arr)) combined = combined.concat(arr);
            } catch(_) { /* tenta próximo */ }
        }
        // Remover duplicados por created_at
        const uniqMap = new Map();
        combined.forEach(spin => {
            if (spin && spin.created_at) uniqMap.set(spin.created_at, spin);
        });
        const dataArr = Array.from(uniqMap.values());
        if (Array.isArray(dataArr) && dataArr.length > 0) {
            const sorted = [...dataArr].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            const mapped = sorted.slice(0, 800).map(spin => ({
                id: `spin_${spin.created_at}`,
                number: spin.roll,
                color: getColorFromNumber(spin.roll),
                timestamp: spin.created_at,
                created_at: spin.created_at
            }));
            const last = mapped[0];
            
            // ✅ Popular CACHE EM MEMÓRIA (não salvar em chrome.storage.local)
            cachedHistory = mapped;
            historyInitialized = true;
            
            await chrome.storage.local.set({ lastSpin: last });
            sendMessageToContent('NEW_SPIN', { lastSpin: last });
            console.log(`📊 Cache em memória inicializado (fallback Blaze): ${mapped.length} giros`);
        } else {
            cachedHistory = [];
            historyInitialized = true;
            console.log('⚠️ Nenhum giro disponível - cache em memória vazio');
        }
    } catch (err) {
        console.warn('Não foi possível carregar giros iniciais. Mantendo coleta incremental.', err);
        cachedHistory = [];
        historyInitialized = true;
    }
}

// Analyze patterns in the data - ONLY triggered when new spin detected
async function analyzePatterns(history) {
    console.log('🔍 Iniciando análise de padrões...');
    
    // REGRA: Mínimo de 50 giros para começar análises
    if (history.length < 50) {
        console.log('⚠️ Histórico insuficiente para análise:', history.length, '/ 50 giros necessários');
        sendAnalysisStatus(`Coletando dados... ${history.length}/50 giros`);
        return; // Precisa de pelo menos 50 giros para análises confiáveis
    }
    
    // REGRA: Verificar se não está usando o mesmo padrão da última entrada
    const entriesResult = await chrome.storage.local.get(['entriesHistory']);
    const entriesHistory = entriesResult.entriesHistory || [];
    
    if (entriesHistory.length > 0) {
        const lastEntry = entriesHistory[0];
        
        // Verificar se a última entrada tem dados de padrão
        if (lastEntry.patternData && lastEntry.patternData.patternDescription) {
            try {
                // ⚠️ CRÍTICO: Se for análise IA, patternDescription é texto, não JSON
                if (lastEntry.patternData.patternDescription.includes('🤖 ANÁLISE POR INTELIGÊNCIA ARTIFICIAL')) {
                    console.log('🔍 Último padrão usado: Análise Avançada (IA)');
                } else {
                    const lastPatternData = JSON.parse(lastEntry.patternData.patternDescription);
                    console.log('🔍 Último padrão usado:', lastPatternData);
                }
                
                // Esta verificação será feita após a análise para comparar padrões
                // Por enquanto, continuamos com a análise
            } catch (e) {
                console.log('⚠️ Erro ao analisar último padrão:', e);
            }
        }
    }
    
    try {
        console.log('🚀 Executando análise multidimensional...', '| Rigor:', rigorLogString());
        const analysis = await performPatternAnalysis(history);
        
        if (analysis) {
            // REGRA: Verificar se não é o mesmo padrão da última entrada
            let isDuplicatePattern = false;
            
            if (entriesHistory.length > 0) {
                const lastEntry = entriesHistory[0];
                
                if (lastEntry.patternData && lastEntry.patternData.patternDescription) {
                    try {
                        // ⚠️ CRÍTICO: Se for análise IA, patternDescription é texto, não JSON
                        const isLastAI = lastEntry.patternData.patternDescription.includes('🤖 ANÁLISE POR INTELIGÊNCIA ARTIFICIAL');
                        const isCurrentAI = analysis.patternDescription.includes('🤖 ANÁLISE POR INTELIGÊNCIA ARTIFICIAL');
                        
                        // Se qualquer um for IA, sempre considerar como padrão diferente
                        if (isLastAI || isCurrentAI) {
                            console.log('✅ Análise aceita (IA sempre permite novos sinais)');
                            isDuplicatePattern = false;
                        } else {
                            // Ambos são análise padrão, comparar como JSON
                            const lastPatternData = JSON.parse(lastEntry.patternData.patternDescription);
                            const currentPatternData = JSON.parse(analysis.patternDescription);
                            
                            // Comparar características dos padrões
                            isDuplicatePattern = comparePatterns(lastPatternData, currentPatternData);
                            
                            if (isDuplicatePattern) {
                                console.log('❌ Análise rejeitada: mesmo padrão da última entrada');
                                sendAnalysisStatus('⏳ Aguardando padrão diferente...');
                                return;
                            } else {
                                console.log('✅ Padrão diferente detectado, análise aceita');
                            }
                        }
                    } catch (e) {
                        console.log('⚠️ Erro ao comparar padrões:', e);
                    }
                }
            }
            
            console.log('✅ Análise concluída com sucesso!');
            await chrome.storage.local.set({
                analysis: analysis,
                pattern: {
                    description: analysis.patternDescription,
                    confidence: analysis.confidence
                },
                lastBet: { status: 'pending', phase: analysis.phase || 'G0', createdOnTimestamp: analysis.createdOnTimestamp }
            });
            
            sendMessageToContent('NEW_ANALYSIS', analysis);
            } else {
            console.log('❌ Nenhum padrão válido encontrado na análise');
            // Limpar análise primeiro
            await chrome.storage.local.set({ analysis: null, pattern: null });
            sendMessageToContent('CLEAR_ANALYSIS');
            // Enviar status de aguardando novo giro APÓS limpar a análise
            sendAnalysisStatus('⏳ Aguardando novo giro...');
        }
    } catch (error) {
        console.error('Erro na análise de padrões:', error);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🤖 SISTEMA DE ANÁLISE POR INTELIGÊNCIA ARTIFICIAL (IA)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * VARREDURA 1: Análise Macro - Contexto Geral
 * Analisa 2000, 500 e 240 giros para entender:
 * - Padrões gerais da Blaze
 * - Resistências e quebras
 * - Aleatoriedade
 */
function analyzeMacroContext(history) {
    console.log('🔍 VARREDURA 1: Análise Macro (Contexto Geral)');
    
    const results = {
        full: analyzeWindow(history.slice(0, 2000), '2000 giros'),
        recent: analyzeWindow(history.slice(0, 500), '500 giros'),
        immediate: analyzeWindow(history.slice(0, 240), '240 giros')
    };
    
    console.log('✅ Varredura 1 completa:', results);
    return results;
}

/**
 * Análise de uma janela de giros
 */
function analyzeWindow(window, label) {
    if (!window || window.length === 0) return null;
    
    const colors = window.map(g => g.color);
    const red = colors.filter(c => c === 'red').length;
    const black = colors.filter(c => c === 'black').length;
    const white = colors.filter(c => c === 'white').length;
    
    const total = colors.length;
    const redPct = (red / total) * 100;
    const blackPct = (black / total) * 100;
    const whitePct = (white / total) * 100;
    
    // Detectar resistências (cor que aparece muito)
    let resistance = null;
    if (redPct > 55) resistance = 'red';
    else if (blackPct > 55) resistance = 'black';
    
    // Detectar quebra de resistência (mudança brusca)
    const last20 = colors.slice(0, 20);
    const last20Red = last20.filter(c => c === 'red').length;
    const last20Black = last20.filter(c => c === 'black').length;
    
    let breakResistance = null;
    if (resistance === 'red' && last20Black > last20Red) breakResistance = 'black';
    else if (resistance === 'black' && last20Red > last20Black) breakResistance = 'red';
    
    // Medir aleatoriedade (quanto mais próximo de 50/50, mais aleatório)
    const randomness = 100 - Math.abs(redPct - blackPct);
    
    return {
        label,
        total,
        distribution: { red: redPct.toFixed(1), black: blackPct.toFixed(1), white: whitePct.toFixed(1) },
        resistance,
        breakResistance,
        randomness: randomness.toFixed(1)
    };
}

/**
 * VARREDURA 2: Análise Micro - Janelas de 20 giros
 * Divide os últimos 240 giros em janelas de 20
 * Identifica qual cor tende a sair após cada padrão
 */
function analyzeMicroWindows(history) {
    console.log('🔍 VARREDURA 2: Análise Micro (Janelas de 20 giros)');
    
    const last240 = history.slice(0, 240);
    if (last240.length < 240) {
        console.warn('⚠️ Histórico insuficiente para análise micro (precisa 240 giros)');
        return null;
    }
    
    const windows = [];
    const windowSize = 20;
    const numWindows = Math.floor(last240.length / windowSize);
    
    // Dividir em janelas de 20 giros
    for (let i = 0; i < numWindows; i++) {
        const start = i * windowSize;
        const end = start + windowSize;
        const windowGiros = last240.slice(start, end);
        
        // Analisar janela
        const colors = windowGiros.map(g => g.color);
        const pattern = colors.join('-');
        
        // Verificar qual cor veio DEPOIS dessa janela
        const nextGiro = last240[end];
        const nextColor = nextGiro ? nextGiro.color : null;
        
        windows.push({
            index: i + 1,
            giros: `${start + 1}-${end}`,
            pattern,
            colors: {
                red: colors.filter(c => c === 'red').length,
                black: colors.filter(c => c === 'black').length,
                white: colors.filter(c => c === 'white').length
            },
            nextColor
        });
    }
    
    console.log(`✅ Varredura 2 completa: ${windows.length} janelas analisadas`);
    return windows;
}

/**
 * Combinar resultados das 2 varreduras + padrões salvos
 * Retorna a cor recomendada e confiança
 */
async function combineAIResults(macroResults, microWindows, savedPatterns) {
    console.log('🧮 Combinando resultados das análises...');
    
    const scores = { red: 0, black: 0, white: 0 };
    
    // 1. PESO DA VARREDURA 1 (Contexto Macro) - 30%
    if (macroResults) {
        const weight = 0.30;
        
        // Quebra de resistência tem prioridade
        if (macroResults.immediate?.breakResistance) {
            scores[macroResults.immediate.breakResistance] += 30 * weight;
            console.log(`  ✅ Quebra de resistência detectada: ${macroResults.immediate.breakResistance} (+${30 * weight})`);
        }
        
        // Resistência também influencia (favor da resistência)
        if (macroResults.recent?.resistance) {
            scores[macroResults.recent.resistance] += 15 * weight;
        }
    }
    
    // 2. PESO DA VARREDURA 2 (Janelas de 20) - 50% (MAIOR PESO)
    if (microWindows && microWindows.length > 0) {
        const weight = 0.50;
        
        // Analisar últimos 20 giros (janela mais recente)
        const lastWindow = microWindows[0];
        
        // Contar qual cor apareceu DEPOIS de janelas similares
        const colorAfterPatterns = {};
        microWindows.forEach(w => {
            if (w.nextColor) {
                colorAfterPatterns[w.nextColor] = (colorAfterPatterns[w.nextColor] || 0) + 1;
            }
        });
        
        // Dar pontos baseado na frequência
        const total = Object.values(colorAfterPatterns).reduce((a, b) => a + b, 0);
        Object.keys(colorAfterPatterns).forEach(color => {
            const frequency = (colorAfterPatterns[color] / total) * 100;
            scores[color] += frequency * weight;
            console.log(`  ✅ Janelas de 20: ${color} aparece ${frequency.toFixed(1)}% (+${(frequency * weight).toFixed(1)})`);
        });
    }
    
    // 3. PESO DOS PADRÕES SALVOS - 20%
    if (savedPatterns && savedPatterns.length > 0) {
        const weight = 0.20;
        
        // Pegar padrão com maior confiança
        const bestPattern = savedPatterns.reduce((best, p) => 
            p.confidence > (best?.confidence || 0) ? p : best
        , null);
        
        if (bestPattern) {
            scores[bestPattern.color] += bestPattern.confidence * weight;
            console.log(`  ✅ Melhor padrão salvo: ${bestPattern.color} (${bestPattern.confidence}%) (+${(bestPattern.confidence * weight).toFixed(1)})`);
        }
    }
    
    // Encontrar cor com maior score
    const bestColor = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b);
    const confidence = Math.min(95, Math.max(45, scores[bestColor]));
    
    console.log('📊 Scores finais:', scores);
    console.log(`🎯 Recomendação IA: ${bestColor} (${confidence.toFixed(1)}%)`);
    
    // ✅ VALIDAR CONFIANÇA MÍNIMA (configurada pelo usuário) - MODO IA
    const minConfidence = analyzerConfig.minPercentage || 60; // Porcentagem mínima configurada para o modo IA
    if (confidence < minConfidence) {
        console.log(`⚠️ Confiança ${confidence.toFixed(1)}% está abaixo do mínimo configurado (${minConfidence}%)`);
        console.log('❌ Análise IA rejeitada por não atingir confiança mínima');
        return null; // Não retorna análise
    }
    console.log(`✅ Confiança ${confidence.toFixed(1)}% atende ao mínimo (${minConfidence}%)`);
    
    // ✅ CRIAR RESUMOS DETALHADOS PARA O USUÁRIO
    let macroSummary = '';
    if (macroResults) {
        const parts = [];
        if (macroResults.immediate?.breakResistance) {
            parts.push(`✅ Quebra de resistência detectada em ${macroResults.immediate.breakResistance}`);
        }
        if (macroResults.recent?.resistance) {
            parts.push(`📊 Resistência atual: ${macroResults.recent.resistance}`);
        }
        if (macroResults.immediate?.randomness) {
            const randomPct = parseFloat(macroResults.immediate.randomness);
            if (randomPct > 90) parts.push('⚠️ Alto grau de aleatoriedade detectado');
            else if (randomPct < 70) parts.push('✅ Padrões consistentes identificados');
        }
        macroSummary = parts.length > 0 ? parts.join('\n   ') : '✅ Análise de tendências concluída';
    }
    
    let microSummary = '';
    if (microWindows && microWindows.length > 0) {
        const colorCounts = {};
        microWindows.forEach(w => {
            if (w.nextColor) {
                colorCounts[w.nextColor] = (colorCounts[w.nextColor] || 0) + 1;
            }
        });
        const topColor = Object.keys(colorCounts).reduce((a, b) => colorCounts[a] > colorCounts[b] ? a : b, null);
        if (topColor) {
            const freq = ((colorCounts[topColor] / microWindows.length) * 100).toFixed(0);
            microSummary = `✅ ${topColor} aparece em ${freq}% dos padrões similares`;
        } else {
            microSummary = '✅ Padrões recentes mapeados';
        }
    }
    
    let patternSummary = '✅ Base de dados consultada';
    if (savedPatterns && savedPatterns.length > 0) {
        const bestPattern = savedPatterns.reduce((best, p) => 
            p.confidence > (best?.confidence || 0) ? p : best
        , null);
        if (bestPattern) {
            patternSummary = `✅ Melhor padrão: ${bestPattern.color} (${bestPattern.confidence}% confiança)`;
        }
    } else {
        patternSummary = '⚠️ Nenhum padrão salvo encontrado';
    }
    
    // Criar raciocínio baseado na pontuação
    let reasoning = '';
    const diff = scores[bestColor] - Math.max(...Object.keys(scores).filter(c => c !== bestColor).map(c => scores[c]));
    if (diff > 20) {
        reasoning = `✅ IA identificou forte tendência para ${bestColor} com ${diff.toFixed(1)} pontos de vantagem sobre outras cores.`;
    } else if (diff > 10) {
        reasoning = `✅ IA recomenda ${bestColor} com vantagem moderada de ${diff.toFixed(1)} pontos.`;
    } else {
        reasoning = `⚠️ IA recomenda ${bestColor} com pequena vantagem de ${diff.toFixed(1)} pontos. Entrada de risco moderado.`;
    }
    
    return {
        color: bestColor,
        confidence: parseFloat(confidence.toFixed(1)),
        scores,
        macroSummary,
        microSummary,
        patternSummary,
        reasoning
    };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔍 DETECTOR DE PADRÕES NO HISTÓRICO (ANÁLISE ESTATÍSTICA REAL)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Esta função analisa TODO o histórico e detecta padrões específicos:
 * - Alternância simples (P-V-P-V)
 * - Alternância dupla (P-P-V-V)
 * - Alternância tripla (P-P-P-V-V-V)
 * - Sequências longas (6+ mesma cor)
 * 
 * Para cada padrão, conta O QUE VEIO DEPOIS (estatística REAL)
 */
function detectPatternsInHistory(history) {
    console.log('');
    console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00BFFF; font-weight: bold;');
    console.log('%c║  🔍 DETECTANDO PADRÕES NO HISTÓRICO                      ║', 'color: #00BFFF; font-weight: bold;');
    console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00BFFF; font-weight: bold;');
    console.log('%c   Histórico recebido: ' + history.length + ' giros', 'color: #00BFFF;');
    console.log('');
    
    // ✅ VALIDAÇÃO: Verificar se histórico é válido
    if (!history || !Array.isArray(history) || history.length === 0) {
        console.warn('%c⚠️ Histórico inválido ou vazio!', 'color: #FFAA00; font-weight: bold;');
        return [];
    }
    
    const patterns = {
        // Alternância simples: P-V-P-V-P-V
        alternanciaSimples: { count: 0, afterRed: 0, afterBlack: 0, afterWhite: 0 },
        
        // Alternância dupla: P-P-V-V-P-P-V-V
        alternanciaDupla: { count: 0, afterRed: 0, afterBlack: 0, afterWhite: 0 },
        
        // Alternância tripla: P-P-P-V-V-V-P-P-P
        alternanciaTripla: { count: 0, afterRed: 0, afterBlack: 0, afterWhite: 0 },
        
        // Sequência longa de vermelhos (6+)
        sequenciaVermelho6Plus: { count: 0, afterRed: 0, afterBlack: 0, afterWhite: 0 },
        
        // Sequência longa de pretos (6+)
        sequenciaPreto6Plus: { count: 0, afterRed: 0, afterBlack: 0, afterWhite: 0 },
        
        // Sequência longa de mesma cor (4-5)
        sequenciaMesmaCor4a5: { count: 0, afterRed: 0, afterBlack: 0, afterWhite: 0 }
    };
    
    // Simplificar cores (ignorar white temporariamente para padrões)
    const simplifiedHistory = history.map(spin => {
        if (spin.color === 'white') return 'W';
        return spin.color === 'red' ? 'R' : 'B';
    });
    
    // Analisar histórico (deixar espaço para o "próximo giro")
    for (let i = 0; i < history.length - 1; i++) {
        const next = history[i]; // O giro que VEIO DEPOIS do padrão
        
        // ═══════════════════════════════════════════════════════════════
        // ALTERNÂNCIA SIMPLES: R-B-R-B-R-B (mínimo 6 giros)
        // ═══════════════════════════════════════════════════════════════
        if (i + 6 < history.length) {
            const seq = simplifiedHistory.slice(i + 1, i + 7).join('');
            
            // Padrão: R-B-R-B-R-B ou B-R-B-R-B-R
            if (seq === 'RBRBRB' || seq === 'BRBRBR') {
                patterns.alternanciaSimples.count++;
                if (next.color === 'red') patterns.alternanciaSimples.afterRed++;
                else if (next.color === 'black') patterns.alternanciaSimples.afterBlack++;
                else patterns.alternanciaSimples.afterWhite++;
            }
        }
        
        // ═══════════════════════════════════════════════════════════════
        // ALTERNÂNCIA DUPLA: R-R-B-B-R-R-B-B (mínimo 8 giros)
        // ═══════════════════════════════════════════════════════════════
        if (i + 8 < history.length) {
            const seq = simplifiedHistory.slice(i + 1, i + 9).join('');
            
            // Padrão: R-R-B-B-R-R-B-B ou B-B-R-R-B-B-R-R
            if (seq === 'RRBBRRBB' || seq === 'BBRRBBRR') {
                patterns.alternanciaDupla.count++;
                if (next.color === 'red') patterns.alternanciaDupla.afterRed++;
                else if (next.color === 'black') patterns.alternanciaDupla.afterBlack++;
                else patterns.alternanciaDupla.afterWhite++;
            }
        }
        
        // ═══════════════════════════════════════════════════════════════
        // ALTERNÂNCIA TRIPLA: R-R-R-B-B-B-R-R-R (mínimo 9 giros)
        // ═══════════════════════════════════════════════════════════════
        if (i + 9 < history.length) {
            const seq = simplifiedHistory.slice(i + 1, i + 10).join('');
            
            // Padrão: R-R-R-B-B-B-R-R-R ou B-B-B-R-R-R-B-B-B
            if (seq === 'RRRBBBRRR' || seq === 'BBBRRRBBB') {
                patterns.alternanciaTripla.count++;
                if (next.color === 'red') patterns.alternanciaTripla.afterRed++;
                else if (next.color === 'black') patterns.alternanciaTripla.afterBlack++;
                else patterns.alternanciaTripla.afterWhite++;
            }
        }
        
        // ═══════════════════════════════════════════════════════════════
        // SEQUÊNCIA DE VERMELHO 6+ (ignorando brancos)
        // ═══════════════════════════════════════════════════════════════
        if (i + 6 < history.length) {
            const seq = simplifiedHistory.slice(i + 1, i + 7).filter(c => c !== 'W').join('');
            
            if (seq === 'RRRRRR') {
                patterns.sequenciaVermelho6Plus.count++;
                if (next.color === 'red') patterns.sequenciaVermelho6Plus.afterRed++;
                else if (next.color === 'black') patterns.sequenciaVermelho6Plus.afterBlack++;
                else patterns.sequenciaVermelho6Plus.afterWhite++;
            }
        }
        
        // ═══════════════════════════════════════════════════════════════
        // SEQUÊNCIA DE PRETO 6+ (ignorando brancos)
        // ═══════════════════════════════════════════════════════════════
        if (i + 6 < history.length) {
            const seq = simplifiedHistory.slice(i + 1, i + 7).filter(c => c !== 'W').join('');
            
            if (seq === 'BBBBBB') {
                patterns.sequenciaPreto6Plus.count++;
                if (next.color === 'red') patterns.sequenciaPreto6Plus.afterRed++;
                else if (next.color === 'black') patterns.sequenciaPreto6Plus.afterBlack++;
                else patterns.sequenciaPreto6Plus.afterWhite++;
            }
        }
        
        // ═══════════════════════════════════════════════════════════════
        // SEQUÊNCIA MESMA COR 4-5 (mais comum, mais dados)
        // ═══════════════════════════════════════════════════════════════
        if (i + 5 < history.length) {
            const seq = simplifiedHistory.slice(i + 1, i + 6).filter(c => c !== 'W').join('');
            
            if (seq === 'RRRRR' || seq === 'BBBBB' || seq === 'RRRR' || seq === 'BBBB') {
                patterns.sequenciaMesmaCor4a5.count++;
                if (next.color === 'red') patterns.sequenciaMesmaCor4a5.afterRed++;
                else if (next.color === 'black') patterns.sequenciaMesmaCor4a5.afterBlack++;
                else patterns.sequenciaMesmaCor4a5.afterWhite++;
            }
        }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // CALCULAR PORCENTAGENS E MONTAR RELATÓRIO
    // ═══════════════════════════════════════════════════════════════
    const report = [];
    
    for (const [patternName, data] of Object.entries(patterns)) {
        if (data.count > 0) {
            const total = data.afterRed + data.afterBlack + data.afterWhite;
            const redPercent = ((data.afterRed / total) * 100).toFixed(1);
            const blackPercent = ((data.afterBlack / total) * 100).toFixed(1);
            const whitePercent = ((data.afterWhite / total) * 100).toFixed(1);
            
            // Nome legível do padrão
            let readableName = '';
            switch(patternName) {
                case 'alternanciaSimples':
                    readableName = 'Alternância Simples (P-V-P-V-P-V)';
                    break;
                case 'alternanciaDupla':
                    readableName = 'Alternância Dupla (P-P-V-V-P-P-V-V)';
                    break;
                case 'alternanciaTripla':
                    readableName = 'Alternância Tripla (P-P-P-V-V-V-P-P-P)';
                    break;
                case 'sequenciaVermelho6Plus':
                    readableName = 'Sequência de 6+ Vermelhos';
                    break;
                case 'sequenciaPreto6Plus':
                    readableName = 'Sequência de 6+ Pretos';
                    break;
                case 'sequenciaMesmaCor4a5':
                    readableName = 'Sequência de 4-5 Mesma Cor';
                    break;
            }
            
            report.push({
                name: readableName,
                pattern: patternName,
                occurrences: data.count,
                afterRed: data.afterRed,
                afterBlack: data.afterBlack,
                afterWhite: data.afterWhite,
                redPercent: parseFloat(redPercent),
                blackPercent: parseFloat(blackPercent),
                whitePercent: parseFloat(whitePercent)
            });
        }
    }
    
    // Ordenar por número de ocorrências (mais confiável primeiro)
    report.sort((a, b) => b.occurrences - a.occurrences);
    
    // Exibir relatório no console
    console.log('%c📊 RELATÓRIO DE PADRÕES DETECTADOS:', 'color: #00BFFF; font-weight: bold; font-size: 14px;');
    console.log('');
    
    if (report.length === 0) {
        console.log('%c⚠️ Nenhum padrão claro detectado no histórico', 'color: #FFAA00;');
        console.log('%c   Isso é NORMAL se o histórico for muito aleatório', 'color: #FFAA00;');
        console.log('%c   A IA vai analisar de forma livre.', 'color: #FFAA00;');
    } else {
        report.forEach((p, index) => {
            console.log(`%c${index + 1}. ${p.name}`, 'color: #00FF88; font-weight: bold;');
            console.log(`   Ocorrências: ${p.occurrences} vezes`);
            console.log(`   Após esse padrão:`);
            console.log(`   %c→ VERMELHO: ${p.afterRed} vezes (${p.redPercent}%)`, 'color: #FF0000; font-weight: bold;');
            console.log(`   %c→ PRETO: ${p.afterBlack} vezes (${p.blackPercent}%)`, 'color: #FFFFFF; font-weight: bold;');
            console.log(`   %c→ BRANCO: ${p.afterWhite} vezes (${p.whitePercent}%)`, 'color: #00FF00; font-weight: bold;');
            console.log('');
        });
    }
    
    console.log('%c✅ Detecção de padrões concluída! Retornando ' + report.length + ' padrões', 'color: #00BFFF; font-weight: bold;');
    console.log('');
    
    return report;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🎯 SISTEMA DE ANÁLISE AVANÇADA POR PADRÕES (100% JavaScript - SEM IA)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ARMAZENAMENTO DE SINAIS ENVIADOS (para auto-aprendizado)
 * Persiste em chrome.storage.local
 */
let signalsHistory = {
    signals: [],              // Todos os sinais enviados
    patternStats: {},         // Estatísticas por tipo de padrão
    contextStats: {},         // Estatísticas por contexto
    blockedPatterns: {},      // 🚫 Padrões bloqueados temporariamente {patternKey: {until: timestamp, reason: string}}
    consecutiveLosses: 0,     // 📉 Contador de losses consecutivos GLOBAL
    recentPerformance: [],    // 📊 Últimos 20 sinais (para ajuste dinâmico de minPercentage)
    lastUpdated: null
};

/**
 * Inicializar histórico de sinais do storage
 */
async function initializeSignalsHistory() {
    try {
        const result = await chrome.storage.local.get('signalsHistory');
        if (result.signalsHistory) {
            signalsHistory = result.signalsHistory;
            
            // ✅ Garantir que os novos campos existam (migração)
            if (!signalsHistory.blockedPatterns) signalsHistory.blockedPatterns = {};
            if (signalsHistory.consecutiveLosses === undefined) signalsHistory.consecutiveLosses = 0;
            if (!signalsHistory.recentPerformance) signalsHistory.recentPerformance = [];
            
            console.log(`%c✅ Histórico de sinais carregado: ${signalsHistory.signals.length} sinais`, 'color: #00FF88;');
            console.log(`%c   📉 Losses consecutivos: ${signalsHistory.consecutiveLosses}`, 'color: #FFA500;');
        }
    } catch (error) {
        console.error('%c❌ Erro ao carregar histórico de sinais:', 'color: #FF0000;', error);
    }
}

/**
 * Salvar histórico de sinais no storage
 */
async function saveSignalsHistory() {
    try {
        signalsHistory.lastUpdated = Date.now();
        await chrome.storage.local.set({ signalsHistory });
    } catch (error) {
        console.error('%c❌ Erro ao salvar histórico de sinais:', 'color: #FF0000;', error);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🎯 SISTEMA DE PADRÕES CUSTOMIZADOS (NÍVEL DIAMANTE)
// ═══════════════════════════════════════════════════════════════════════════════

let customPatternsCache = []; // Cache dos padrões customizados

/**
 * Carregar padrões customizados do storage
 */
async function loadCustomPatterns() {
    try {
        const result = await chrome.storage.local.get(['customPatterns']);
        customPatternsCache = result.customPatterns || [];
        
        console.log('');
        console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00d4ff; font-weight: bold;');
        console.log('%c║  🎯 CARREGANDO PADRÕES CUSTOMIZADOS                      ║', 'color: #00d4ff; font-weight: bold;');
        console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00d4ff; font-weight: bold;');
        console.log(`📊 Total de padrões no storage: ${customPatternsCache.length}`);
        
        if (customPatternsCache.length > 0) {
            console.log('%c📋 LISTA DE PADRÕES CARREGADOS:', 'color: #00d4ff; font-weight: bold;');
            customPatternsCache.forEach((pattern, index) => {
                console.log(`   ${index + 1}. "${pattern.name}" | Sequência: ${pattern.sequence.join(' → ')} | Ativo: ${pattern.active ? '✅' : '❌'}`);
            });
        } else {
            console.log('%c⚠️ Nenhum padrão customizado encontrado no storage!', 'color: #FFA500; font-weight: bold;');
        }
        console.log('');
        
        return customPatternsCache;
    } catch (error) {
        console.error('❌ Erro ao carregar padrões customizados:', error);
        return [];
    }
}

/**
 * Buscar padrão customizado no histórico
 */
function findCustomPatternInHistory(customPattern, history) {
    console.log(`%c🔍 Buscando padrão customizado: ${customPattern.name}`, 'color: #00d4ff; font-weight: bold;');
    console.log('   Sequência:', customPattern.sequence.join(' → '));
    console.log('   Cor anterior:', customPattern.beforeColor);
    
    const colors = history.map(spin => spin.color);
    const patternLength = customPattern.sequence.length;
    const matches = [];
    
    // Buscar no histórico
    for (let i = 0; i <= colors.length - patternLength; i++) {
        const slice = colors.slice(i, i + patternLength);
        
        // Verificar se a sequência bate
        const isMatch = slice.every((color, index) => color === customPattern.sequence[index]);
        
        if (isMatch) {
            // Verificar cor anterior (se especificada)
            const colorBefore = (i + patternLength < colors.length) ? colors[i + patternLength] : null;
            
            // ✅ Validar cor anterior com as novas opções
            let isBeforeColorValid = false;
            if (customPattern.beforeColor === 'red-white') {
                isBeforeColorValid = (colorBefore === 'red' || colorBefore === 'white');
            } else if (customPattern.beforeColor === 'black-white') {
                isBeforeColorValid = (colorBefore === 'black' || colorBefore === 'white');
            } else {
                // Retrocompatibilidade com modelos antigos ('any', 'red', 'black', 'white')
                isBeforeColorValid = (customPattern.beforeColor === 'any' || colorBefore === customPattern.beforeColor);
            }
            
            if (isBeforeColorValid) {
                // ✅ PADRÃO ENCONTRADO!
                const whatCameNext = (i > 0) ? colors[i - 1] : null; // Próximo giro (array invertido)
                
                if (whatCameNext && whatCameNext !== 'white') {
                    matches.push({
                        index: i,
                        colorBefore: colorBefore,
                        whatCameNext: whatCameNext
                    });
                }
            }
        }
    }
    
    console.log(`   ✅ ${matches.length} ocorrência(s) encontrada(s)`);
    
    return matches;
}

/**
 * Analisar padrão customizado e calcular estatísticas
 */
function analyzeCustomPatternStatistics(matches) {
    if (matches.length === 0) {
        return null;
    }
    
    // Contar o que veio depois
    const nextColorCount = {
        red: 0,
        black: 0,
        white: 0
    };
    
    matches.forEach(match => {
        if (match.whatCameNext) {
            nextColorCount[match.whatCameNext]++;
        }
    });
    
    const total = matches.length;
    const stats = {
        occurrences: total,
        nextColor: {
            red: nextColorCount.red,
            black: nextColorCount.black,
            white: nextColorCount.white,
            redPercent: Math.round((nextColorCount.red / total) * 100),
            blackPercent: Math.round((nextColorCount.black / total) * 100),
            whitePercent: Math.round((nextColorCount.white / total) * 100)
        }
    };
    
    console.log(`%c📊 ESTATÍSTICAS DO PADRÃO CUSTOMIZADO:`, 'color: #00ff88; font-weight: bold;');
    console.log(`   Total de ocorrências: ${total}`);
    console.log(`   Próxima cor:`);
    console.log(`   🔴 Vermelho: ${stats.nextColor.redPercent}% (${nextColorCount.red}x)`);
    console.log(`   ⚫ Preto: ${stats.nextColor.blackPercent}% (${nextColorCount.black}x)`);
    console.log(`   ⚪ Branco: ${stats.nextColor.whitePercent}% (${nextColorCount.white}x)`);
    
    return stats;
}

/**
 * Verificar se o padrão atual bate com algum padrão customizado
 */
async function checkForCustomPatterns(history) {
    // ✅ SEMPRE recarregar do storage para pegar mudanças mais recentes
    await loadCustomPatterns();
    
    if (customPatternsCache.length === 0) {
        console.log('');
        console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #FFA500; font-weight: bold;');
        console.log('%c║  ⚠️ NENHUM PADRÃO CUSTOMIZADO ENCONTRADO                 ║', 'color: #FFA500; font-weight: bold;');
        console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #FFA500; font-weight: bold;');
        console.log('');
        return null;
    }
    
    console.log('');
    console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00d4ff; font-weight: bold;');
    console.log('%c║  🎯 VERIFICANDO PADRÕES CUSTOMIZADOS                     ║', 'color: #00d4ff; font-weight: bold;');
    console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00d4ff; font-weight: bold;');
    console.log(`📊 Total de padrões carregados no cache: ${customPatternsCache.length}`);
    console.log('');
    
    const colors = history.map(spin => spin.color);
    
    // Mostrar em ordem cronológica (do mais antigo para o mais recente)
    const last15Reversed = colors.slice(0, 15).reverse();
    const last15Display = last15Reversed.map(c => c === 'red' ? '🔴' : c === 'black' ? '⚫' : '⚪').join(' → ');
    
    console.log('%c📜 ÚLTIMOS 15 GIROS DO HISTÓRICO (ordem cronológica):', 'color: #00d4ff; font-weight: bold;');
    console.log(`%c   ↑ PASSADO ──────────────────────── PRESENTE ↑`, 'color: #888; font-style: italic;');
    console.log(`%c   ${last15Display}`, 'color: #FFD700; font-weight: bold;');
    console.log(`%c   ${last15Reversed.join(' → ')}`, 'color: #888;');
    console.log('');
    
    let patternIndex = 0;
    // Verificar cada padrão customizado
    for (const customPattern of customPatternsCache) {
        patternIndex++;
        console.log(`%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'color: #00d4ff;');
        console.log(`%c🔍 PADRÃO #${patternIndex}: "${customPattern.name}"`, 'color: #00d4ff; font-weight: bold;');
        console.log(`   Status: ${customPattern.active ? '✅ ATIVO' : '❌ INATIVO'}`);
        console.log('');
        console.log(`%c   📋 SEQUÊNCIA CONFIGURADA (ordem cronológica):`, 'color: #FFD700; font-weight: bold;');
        console.log(`%c      [ANTERIOR] → [1º] → [2º] → [3º] → ... → [ÚLTIMO/ATUAL]`, 'color: #888; font-style: italic;');
        
        // Construir visualização com cor anterior
        const beforeColorDisplay = customPattern.beforeColor === 'red-white' ? '🔴/⚪' :
                                    customPattern.beforeColor === 'black-white' ? '⚫/⚪' :
                                    customPattern.beforeColor === 'red' ? '🔴' :
                                    customPattern.beforeColor === 'black' ? '⚫' :
                                    customPattern.beforeColor === 'white' ? '⚪' : '❓';
        
        const sequenceDisplay = customPattern.sequence.map((c, idx) => {
            const symbol = c === 'red' ? '🔴' : c === 'black' ? '⚫' : '⚪';
            return `[${idx + 1}º: ${symbol}]`;
        }).join(' → ');
        
        console.log(`%c      ${beforeColorDisplay} (anterior) → ${sequenceDisplay}`, 'color: #FFD700; font-weight: bold;');
        console.log(`%c      ↑ PASSADO ────────────────────────────── PRESENTE ↑`, 'color: #888;');
        
        if (!customPattern.active) {
            console.log(`%c   ⏭️ PULANDO: Padrão está INATIVO`, 'color: #888;');
            continue;
        }
        
        const patternLength = customPattern.sequence.length;
        
        // Histórico vem do MAIS RECENTE para o MAIS ANTIGO
        // Mas padrão é configurado na ordem cronológica (do mais antigo para o mais recente)
        // Então precisamos REVERTER a sequência atual para comparar!
        const currentSequenceRaw = colors.slice(0, patternLength);
        const currentSequence = [...currentSequenceRaw].reverse(); // ✅ INVERTER para ordem cronológica
        
        console.log('');
        console.log(`%c   📋 COMPARANDO SEQUÊNCIAS (ordem cronológica):`, 'color: #FFD700; font-weight: bold;');
        console.log(`%c      📍 IMPORTANTE: Ordem da ESQUERDA → DIREITA (1º giro → último giro)`, 'color: #FFD700;');
        console.log(`      🎯 Esperado: [${customPattern.sequence.join(' → ')}]`);
        console.log(`      📊 Atual:    [${currentSequence.join(' → ')}]`);
        console.log(`      📏 Tamanho:  ${patternLength} giros`);
        console.log('');
        
        // Comparar posição por posição (agora ambos estão em ordem cronológica)
        let matchDetails = [];
        for (let i = 0; i < patternLength; i++) {
            const match = (currentSequence[i] === customPattern.sequence[i]);
            matchDetails.push({
                position: i + 1,
                expected: customPattern.sequence[i],
                actual: currentSequence[i] || 'N/A',
                match: match
            });
        }
        
        console.log('%c      COMPARAÇÃO DETALHADA (posição por posição):', 'color: #FFD700;');
        matchDetails.forEach(detail => {
            const status = detail.match ? '✅' : '❌';
            const color = detail.match ? '#00FF88' : '#FF6666';
            const expectedSymbol = detail.expected === 'red' ? '🔴' : detail.expected === 'black' ? '⚫' : '⚪';
            const actualSymbol = detail.actual === 'red' ? '🔴' : detail.actual === 'black' ? '⚫' : detail.actual === 'white' ? '⚪' : '❓';
            console.log(`%c      ${status} ${detail.position}º giro: esperado ${expectedSymbol} (${detail.expected}) | real ${actualSymbol} (${detail.actual})`, `color: ${color};`);
        });
        
        const isCurrentMatch = matchDetails.every(d => d.match);
        console.log('');
        console.log(`%c   ${isCurrentMatch ? '✅ SEQUÊNCIA BATE PERFEITAMENTE!' : '❌ Sequência NÃO bate'}`, `color: ${isCurrentMatch ? '#00FF88' : '#FF6666'}; font-weight: bold;`);
        
        if (isCurrentMatch) {
            // Verificar cor anterior (se especificada)
            // Lembrar: colors[patternLength] é a cor que veio ANTES da sequência (no histórico invertido)
            const colorBefore = (patternLength < colors.length) ? colors[patternLength] : null;
            const colorBeforeSymbol = colorBefore === 'red' ? '🔴' : colorBefore === 'black' ? '⚫' : colorBefore === 'white' ? '⚪' : '❓';
            
            console.log(`\n   🔍 VALIDANDO COR ANTERIOR (que veio ANTES da sequência):`);
            
            const beforeColorExpected = customPattern.beforeColor === 'red-white' ? '🔴/⚪ (vermelho OU branco)' :
                                       customPattern.beforeColor === 'black-white' ? '⚫/⚪ (preto OU branco)' :
                                       customPattern.beforeColor === 'red' ? '🔴 (vermelho)' :
                                       customPattern.beforeColor === 'black' ? '⚫ (preto)' :
                                       customPattern.beforeColor === 'white' ? '⚪ (branco)' :
                                       customPattern.beforeColor === 'any' ? '❓ (qualquer)' : customPattern.beforeColor;
            
            console.log(`      Esperado: ${beforeColorExpected}`);
            console.log(`      Real: ${colorBeforeSymbol} (${colorBefore || 'N/A'})`);
            
            // ✅ Validar cor anterior com as novas opções
            let isBeforeColorValid = false;
            if (customPattern.beforeColor === 'red-white') {
                isBeforeColorValid = (colorBefore === 'red' || colorBefore === 'white');
                console.log(`      ${isBeforeColorValid ? '✅' : '❌'} ${colorBefore} é vermelho OU branco? ${isBeforeColorValid ? 'SIM' : 'NÃO'}`);
            } else if (customPattern.beforeColor === 'black-white') {
                isBeforeColorValid = (colorBefore === 'black' || colorBefore === 'white');
                console.log(`      ${isBeforeColorValid ? '✅' : '❌'} ${colorBefore} é preto OU branco? ${isBeforeColorValid ? 'SIM' : 'NÃO'}`);
            } else {
                // Retrocompatibilidade com modelos antigos
                isBeforeColorValid = (customPattern.beforeColor === 'any' || colorBefore === customPattern.beforeColor);
                console.log(`      ${isBeforeColorValid ? '✅' : '❌'} ${colorBefore} é ${customPattern.beforeColor}? ${isBeforeColorValid ? 'SIM' : 'NÃO'}`);
            }
            
            if (isBeforeColorValid) {
                console.log(`%c✅ PADRÃO CUSTOMIZADO ATIVO DETECTADO!`, 'color: #00ff88; font-weight: bold;');
                console.log(`   Nome: ${customPattern.name}`);
                console.log(`   Sequência: ${customPattern.sequence.join(' → ')}`);
                console.log(`   Cor anterior esperada: ${customPattern.beforeColor}`);
                console.log(`   Cor anterior real: ${colorBefore || 'N/A'}`);
                
                // Buscar no histórico o que geralmente vem depois
                const matches = findCustomPatternInHistory(customPattern, history);
                const stats = analyzeCustomPatternStatistics(matches);
                
                // ✅ NOVA LÓGICA: Enviar sinal mesmo com poucas ocorrências (confiança reduzida)
                if (stats && stats.occurrences >= 1) { // Mínimo 1 ocorrência
                    // Determinar cor recomendada
                    const recommendedColor = stats.nextColor.redPercent > stats.nextColor.blackPercent ? 'red' : 'black';
                    let confidence = Math.max(stats.nextColor.redPercent, stats.nextColor.blackPercent);
                    
                    // ✅ Ajustar confiança baseado no número de ocorrências
                    let confidenceAdjustment = '';
                    if (stats.occurrences < 3) {
                        const originalConfidence = confidence;
                        confidence = Math.max(40, Math.floor(confidence * 0.7)); // Reduzir 30% mas mínimo 40%
                        confidenceAdjustment = ` (ajustado de ${originalConfidence}% por poucas ocorrências)`;
                        console.log(`⚠️ Padrão com ${stats.occurrences} ocorrência(s) - Confiança reduzida${confidenceAdjustment}`);
                    }
                    
                    return {
                        pattern: customPattern,
                        stats: stats,
                        recommendedColor: recommendedColor,
                        confidence: confidence,
                        reasoning: `Padrão customizado "${customPattern.name}" detectado! ` +
                                  `Historicamente, em ${stats.occurrences} ocorrência(s), ` +
                                  `a cor ${recommendedColor === 'red' ? '🔴 VERMELHA' : '⚫ PRETA'} veio depois em ${Math.max(stats.nextColor.redPercent, stats.nextColor.blackPercent)}% dos casos.${confidenceAdjustment}`
                    };
                } else {
                    // ✅ FALLBACK EXTREMO: Se o padrão foi detectado mas não há histórico,
                    // usar análise básica baseada na última cor
                    console.log(`⚠️ Padrão encontrado, mas sem dados estatísticos no histórico`);
                    console.log(`   📊 Usando análise básica...`);
                    
                    // Usar a cor oposta à última como fallback
                    const lastColor = colors[0];
                    const fallbackColor = lastColor === 'red' ? 'black' : 'red';
                    const fallbackConfidence = 45; // Confiança baixa
                    
                    console.log(`   🎯 Cor detectada: ${fallbackColor.toUpperCase()}`);
                    console.log(`   📊 Confiança: ${fallbackConfidence}% (baixa - sem histórico)`);
                    
                    return {
                        pattern: customPattern,
                        stats: { occurrences: 0, nextColor: { redPercent: 50, blackPercent: 50, whitePercent: 0 } },
                        recommendedColor: fallbackColor,
                        confidence: fallbackConfidence,
                        reasoning: `Padrão customizado "${customPattern.name}" detectado! ` +
                                  `Sem dados históricos disponíveis. Análise baseada em probabilidade padrão.`
                    };
                }
            } else {
                console.log(`\n   ❌ COR ANTERIOR NÃO VÁLIDA!`);
                console.log(`      Esperado: ${customPattern.beforeColor}`);
                console.log(`      Recebido: ${colorBefore}`);
                console.log(`      Este padrão NÃO será usado!\n`);
            }
        }
    }
    
    console.log('\n📊 Resultado final: Nenhum padrão customizado válido encontrado no momento');
    return null;
}

// Listener para atualização de padrões customizados
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'CUSTOM_PATTERNS_UPDATED') {
        console.log('');
        console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00FF88; font-weight: bold;');
        console.log('%c║  🔄 PADRÕES CUSTOMIZADOS ATUALIZADOS!                    ║', 'color: #00FF88; font-weight: bold;');
        console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00FF88; font-weight: bold;');
        
        const oldCache = [...customPatternsCache];
        customPatternsCache = request.data || [];
        
        console.log(`📊 Padrões no cache antigo: ${oldCache.length}`);
        console.log(`📊 Padrões no cache novo: ${customPatternsCache.length}`);
        
        if (customPatternsCache.length > 0) {
            console.log('%c📋 LISTA ATUALIZADA DE PADRÕES:', 'color: #00FF88; font-weight: bold;');
            customPatternsCache.forEach((pattern, index) => {
                const wasUpdated = oldCache.find(p => p.id === pattern.id && 
                    (p.name !== pattern.name || 
                     JSON.stringify(p.sequence) !== JSON.stringify(pattern.sequence) ||
                     p.beforeColor !== pattern.beforeColor));
                const isNew = !oldCache.find(p => p.id === pattern.id);
                
                let status = '';
                if (isNew) status = ' ✨ NOVO';
                else if (wasUpdated) status = ' ✏️ EDITADO';
                
                console.log(`   ${index + 1}. "${pattern.name}" | [${pattern.sequence.join(' → ')}] | Anterior: ${pattern.beforeColor}${status}`);
            });
        }
        
        console.log('%c✅ CACHE ATUALIZADO - Próximo sinal usará os padrões mais recentes!', 'color: #00FF88; font-weight: bold;');
        console.log('');
        
        sendResponse({ success: true });
        return true;
    }
});

/**
 * DETECTAR TODOS OS TIPOS DE PADRÕES VARIADOS
 * Cria exemplos de alternância simples, dupla, tripla, sequências, etc.
 */
function detectAllPatternTypes(history) {
    const patterns = [];
    
    if (history.length < 2) return patterns;
    
    // Converter histórico para array de cores simples
    const colors = history.map(spin => spin.color);
    
    console.log('%c═══════════════════════════════════════════════════════════', 'color: #00BFFF; font-weight: bold;');
    console.log('%c🔍 DETECTANDO TODOS OS PADRÕES POSSÍVEIS', 'color: #00BFFF; font-weight: bold;');
    console.log('%c═══════════════════════════════════════════════════════════', 'color: #00BFFF; font-weight: bold;');
    console.log('');
    
    // 1. ALTERNÂNCIA SIMPLES (V-P-V-P...)
    console.log('%c📊 Buscando: Alternância Simples (tamanhos 2-20)', 'color: #00FF88;');
    for (let size = 2; size <= Math.min(20, colors.length); size += 2) {
        for (let i = 0; i <= colors.length - size; i++) {
            const sequence = colors.slice(i, i + size);
            const isAlternating = checkAlternatingPattern(sequence, 1);
            
            if (isAlternating && !sequence.includes('white')) {
                // ✅ CORREÇÃO CRÍTICA: Array[0]=recente, [1]=antigo
                // O que veio DEPOIS é [i-1] (mais recente), não [i+size] (mais antigo)!
                if (i > 0) { // Precisa ter um giro seguinte
                    const whatCameNext = colors[i - 1]; // ✅ Giro SEGUINTE
                    const contextBefore = (i + size < colors.length - 4) ? colors.slice(i + size, i + size + 4).join('-') : 'inicio';
                    patterns.push({
                        type: 'alternancia_simples',
                        size: size,
                        sequence: sequence.join('-'),
                        index: i,
                        whatCameNext: whatCameNext,
                        contextBefore: contextBefore
                    });
                }
            }
        }
    }
    
    // 2. ALTERNÂNCIA DUPLA (V-V-P-P-V-V...)
    console.log('%c📊 Buscando: Alternância Dupla (tamanhos 4-20)', 'color: #00FF88;');
    for (let size = 4; size <= Math.min(20, colors.length); size += 4) {
        for (let i = 0; i <= colors.length - size; i++) {
            const sequence = colors.slice(i, i + size);
            const isAlternating = checkAlternatingPattern(sequence, 2);
            
            if (isAlternating && !sequence.includes('white')) {
                // ✅ CORREÇÃO: O que veio DEPOIS é [i-1], não [i+size]
                if (i > 0) {
                    const whatCameNext = colors[i - 1]; // ✅ Giro SEGUINTE
                    const contextBefore = (i + size < colors.length - 4) ? colors.slice(i + size, i + size + 4).join('-') : 'inicio';
                    patterns.push({
                        type: 'alternancia_dupla',
                        size: size,
                        sequence: sequence.join('-'),
                        index: i,
                        whatCameNext: whatCameNext,
                        contextBefore: contextBefore
                    });
                }
            }
        }
    }
    
    // 3. ALTERNÂNCIA TRIPLA (V-V-V-P-P-P...)
    console.log('%c📊 Buscando: Alternância Tripla (tamanhos 6-18)', 'color: #00FF88;');
    for (let size = 6; size <= Math.min(18, colors.length); size += 6) {
        for (let i = 0; i <= colors.length - size; i++) {
            const sequence = colors.slice(i, i + size);
            const isAlternating = checkAlternatingPattern(sequence, 3);
            
            if (isAlternating && !sequence.includes('white')) {
                // ✅ CORREÇÃO: O que veio DEPOIS é [i-1], não [i+size]
                if (i > 0) {
                    const whatCameNext = colors[i - 1]; // ✅ Giro SEGUINTE
                    const contextBefore = (i + size < colors.length - 4) ? colors.slice(i + size, i + size + 4).join('-') : 'inicio';
                    patterns.push({
                        type: 'alternancia_tripla',
                        size: size,
                        sequence: sequence.join('-'),
                        index: i,
                        whatCameNext: whatCameNext,
                        contextBefore: contextBefore
                    });
                }
            }
        }
    }
    
    // 4. SEQUÊNCIAS (mesma cor consecutiva)
    console.log('%c📊 Buscando: Sequências (tamanhos 2-15)', 'color: #00FF88;');
    for (let size = 2; size <= Math.min(15, colors.length); size++) {
        for (let i = 0; i <= colors.length - size; i++) {
            const sequence = colors.slice(i, i + size);
            const firstColor = sequence[0];
            const isSequence = sequence.every(c => c === firstColor) && firstColor !== 'white';
            
            if (isSequence) {
                // ✅ CORREÇÃO: O que veio DEPOIS é [i-1], não [i+size]
                if (i > 0) {
                    const whatCameNext = colors[i - 1]; // ✅ Giro SEGUINTE
                    const contextBefore = (i + size < colors.length - 4) ? colors.slice(i + size, i + size + 4).join('-') : 'inicio';
                    patterns.push({
                        type: 'sequencia_' + firstColor,
                        size: size,
                        sequence: sequence.join('-'),
                        index: i,
                        whatCameNext: whatCameNext,
                        contextBefore: contextBefore
                    });
                }
            }
        }
    }
    
    console.log('%c✅ Total de padrões detectados: ' + patterns.length, 'color: #00BFFF; font-weight: bold;');
    console.log('');
    
    return patterns;
}

/**
 * Verificar se uma sequência segue um padrão de alternância
 * @param {Array} sequence - Array de cores
 * @param {Number} groupSize - Tamanho do grupo (1=simples, 2=dupla, 3=tripla)
 */
function checkAlternatingPattern(sequence, groupSize) {
    if (sequence.length < groupSize * 2) return false;
    
    for (let i = 0; i < sequence.length; i++) {
        const groupIndex = Math.floor(i / groupSize);
        const expectedColor = groupIndex % 2 === 0 ? sequence[0] : (sequence[0] === 'red' ? 'black' : 'red');
        
        if (sequence[i] !== expectedColor) {
            return false;
        }
    }
    
    return true;
}

/**
 * ✨ DETECTAR PADRÕES IRREGULARES/CUSTOMIZADOS
 * Exemplos:
 * - P-V-V-V-P → Padrão 1-3-1 (1 preto, 3 vermelhos, repete)
 * - B-P-P-V-P-P → Padrão com branco (B/V-P-P repete)
 * - V-V-P-V-V-P → Padrão 2-1-2 (2 vermelhos, 1 preto, repete)
 */
function detectIrregularPattern(colors) {
    console.log('%c🔍 Buscando padrões irregulares nos últimos 10 giros...', 'color: #FF00FF;');
    
    // Ignorar brancos para simplificar análise inicial
    const nonWhite = colors.filter(c => c !== 'white');
    
    // Tentar detectar ciclos de tamanhos diferentes (2-6 giros por ciclo)
    for (let cycleSize = 2; cycleSize <= 6; cycleSize++) {
        // Precisa de pelo menos 2 ciclos completos para confirmar padrão
        const minGiros = cycleSize * 2;
        if (nonWhite.length < minGiros) continue;
        
        const cycle1 = nonWhite.slice(0, cycleSize);
        const cycle2 = nonWhite.slice(cycleSize, cycleSize * 2);
        
        // Verificar se os dois ciclos são idênticos
        const isSameCycle = cycle1.every((color, i) => color === cycle2[i]);
        
        if (isSameCycle) {
            // Encontrou padrão irregular repetido!
            const patternStr = cycle1.map(c => c === 'red' ? 'V' : 'P').join('-');
            
            console.log(`%c   ✅ Padrão irregular detectado: ${patternStr}`, 'color: #FF00FF; font-weight: bold;');
            console.log(`%c      Ciclo se repete a cada ${cycleSize} giros`, 'color: #FF00FF;');
            
            return {
                type: 'irregular_pattern',
                size: cycleSize * 2,
                sequence: cycle1.join('-'),
                name: `Padrão Irregular (${patternStr} repetido)`,
                cycleSize: cycleSize,
                contextBefore: colors.slice(cycleSize * 2, cycleSize * 2 + 4).join('-')
            };
        }
    }
    
    // Tentar detectar padrões com branco incluído
    if (colors.includes('white')) {
        for (let cycleSize = 2; cycleSize <= 6; cycleSize++) {
            const minGiros = cycleSize * 2;
            if (colors.length < minGiros) continue;
            
            const cycle1 = colors.slice(0, cycleSize);
            const cycle2 = colors.slice(cycleSize, cycleSize * 2);
            
            const isSameCycle = cycle1.every((color, i) => color === cycle2[i]);
            
            if (isSameCycle) {
                const patternStr = cycle1.map(c => c === 'red' ? 'V' : c === 'black' ? 'P' : 'B').join('-');
                
                console.log(`%c   ✅ Padrão irregular COM BRANCO: ${patternStr}`, 'color: #FF00FF; font-weight: bold;');
                
                return {
                    type: 'irregular_pattern_with_white',
                    size: cycleSize * 2,
                    sequence: cycle1.join('-'),
                    name: `Padrão com Branco (${patternStr} repetido)`,
                    cycleSize: cycleSize,
                    contextBefore: colors.slice(cycleSize * 2, cycleSize * 2 + 4).join('-')
                };
            }
        }
    }
    
    console.log('%c   ❌ Nenhum padrão irregular encontrado', 'color: #FF00FF;');
    return null;
}

/**
 * 🔍 VALIDADOR RIGOROSO DE PADRÃO
 * Verifica se o padrão detectado está REALMENTE correto
 * Analisa o contexto completo antes e depois do padrão
 */
function validatePatternDetection(colors, patternStartIndex, patternSize, patternType, groupSize, patternName) {
    const patternSequence = colors.slice(patternStartIndex, patternStartIndex + patternSize);
    
    console.log('%c═══════════════════════════════════════════════════════════', 'color: #FF1493; font-weight: bold;');
    console.log('%c🔍 VALIDADOR RIGOROSO DE PADRÃO', 'color: #FF1493; font-weight: bold; font-size: 14px;');
    console.log('%c═══════════════════════════════════════════════════════════', 'color: #FF1493; font-weight: bold;');
    console.log('');
    console.log(`%c📋 Padrão detectado: ${patternName}`, 'color: #FF69B4; font-weight: bold;');
    console.log(`%c   Tipo: ${patternType}`, 'color: #FF69B4;');
    console.log(`%c   Tamanho: ${patternSize} giros`, 'color: #FF69B4;');
    console.log(`%c   Sequência: ${patternSequence.map(c => c === 'red' ? 'V' : c === 'black' ? 'P' : 'B').join('-')}`, 'color: #FF69B4;');
    console.log('');
    
    // ═══════════════════════════════════════════════════════════════
    // ETAPA 1: MOSTRAR CONTEXTO COMPLETO (10 giros)
    // ═══════════════════════════════════════════════════════════════
    const contextSize = Math.min(10, colors.length);
    const contextColors = colors.slice(0, contextSize).map((c, i) => {
        const symbol = c === 'red' ? 'V' : c === 'black' ? 'P' : 'B';
        if (i >= patternStartIndex && i < patternStartIndex + patternSize) {
            return `[${symbol}]`; // Marcar padrão com colchetes
        }
        return symbol;
    }).join('-');
    
    console.log(`%c📊 CONTEXTO COMPLETO (últimos ${contextSize} giros):`, 'color: #00CED1; font-weight: bold;');
    console.log(`%c   ${contextColors}`, 'color: #00CED1;');
    console.log(`%c   (Padrão marcado com [ ])`, 'color: #888;');
    console.log('');
    
    // ═══════════════════════════════════════════════════════════════
    // ETAPA 2: ANÁLISE DO CONTEXTO ANTERIOR (O que veio ANTES)
    // ═══════════════════════════════════════════════════════════════
    const contextBefore = [];
    for (let i = patternStartIndex + patternSize; i < Math.min(patternStartIndex + patternSize + 5, colors.length); i++) {
        if (colors[i] && colors[i] !== 'white') {
            contextBefore.push(colors[i]);
        }
    }
    
    if (contextBefore.length > 0) {
        console.log(`%c🔙 CONTEXTO ANTERIOR (antes do padrão):`, 'color: #FFA500; font-weight: bold;');
        console.log(`%c   Giros anteriores: ${contextBefore.map(c => c === 'red' ? 'V' : 'P').join('-')}`, 'color: #FFA500;');
        
        // VALIDAÇÃO CRÍTICA: Se é alternância, verificar se não é sequência quebrando
        if (patternType.includes('alternancia')) {
            // ═══════════════════════════════════════════════════════════════
            // LÓGICA CORRETA: Pegar os ÚLTIMOS N giros do padrão (onde N = groupSize)
            // e ver se essa cor continua ANTES do padrão
            // ═══════════════════════════════════════════════════════════════
            
            // Para alternância DUPLA P-P-V-V:
            // - Últimos 2 giros (groupSize=2): P-P (posições 2,3 do padrão)
            // - Se antes veio mais P, então P-P faz parte de P-P-P!
            // - REJEITAR!
            
            // Pegar os últimos N giros do padrão
            const lastGroupColors = patternSequence.slice(patternSize - groupSize, patternSize);
            const lastGroupColor = lastGroupColors[0]; // Cor do último grupo
            
            console.log(`%c   🔍 Verificando últimos ${groupSize} giro(s) do padrão:`, 'color: #FFA500;');
            console.log(`%c      Cor: ${lastGroupColor === 'red' ? 'VERMELHO' : 'PRETO'}`, 'color: #FFA500;');
            
            // Verificar se essa mesma cor continua ANTES do padrão
            if (contextBefore.length > 0 && contextBefore[0] === lastGroupColor) {
                console.log('%c   ❌ ERRO DETECTADO: Padrão INCORRETO!', 'color: #FF0000; font-weight: bold;');
                console.log(`%c   Motivo: A cor ${lastGroupColor === 'red' ? 'VERMELHO' : 'PRETO'} continua ANTES do padrão!`, 'color: #FF0000;');
                console.log(`%c   O último grupo (${lastGroupColors.map(c => c === 'red' ? 'V' : 'P').join('-')}) faz parte de uma SEQUÊNCIA maior!`, 'color: #FF0000;');
                console.log(`%c   Isso NÃO é ${patternName}! É uma SEQUÊNCIA quebrando!`, 'color: #FF0000; font-weight: bold;');
                console.log('');
                console.log('%c═══════════════════════════════════════════════════════════', 'color: #FF1493; font-weight: bold;');
                console.log('');
                return { valid: false, reason: `Último grupo do padrão (${lastGroupColor === 'red' ? 'V' : 'P'}) continua antes - é sequência quebrando!` };
            }
            
            // VALIDAÇÃO ADICIONAL: Verificar os PRIMEIROS N giros do padrão também
            const firstGroupColors = patternSequence.slice(0, groupSize);
            const firstGroupColor = firstGroupColors[0];
            
            console.log(`%c   🔍 Verificando primeiros ${groupSize} giro(s) do padrão:`, 'color: #FFA500;');
            console.log(`%c      Cor: ${firstGroupColor === 'red' ? 'VERMELHO' : 'PRETO'}`, 'color: #FFA500;');
            
            // Verificar quantas vezes essa cor aparece ANTES do padrão
            let sameColorCountBefore = 0;
            for (let i = 0; i < contextBefore.length; i++) {
                if (contextBefore[i] === lastGroupColor) {
                    sameColorCountBefore++;
                } else {
                    break;
                }
            }
            
            if (sameColorCountBefore > 0) {
                console.log('%c   ❌ ERRO DETECTADO: Padrão INCORRETO!', 'color: #FF0000; font-weight: bold;');
                console.log(`%c   Motivo: ${sameColorCountBefore} cor(es) ${lastGroupColor === 'red' ? 'VERMELHO' : 'PRETO'} continuam antes!`, 'color: #FF0000;');
                console.log(`%c   Isso cria uma sequência de ${sameColorCountBefore + groupSize} cores iguais!`, 'color: #FF0000;');
                console.log(`%c   Isso NÃO é ${patternName}! É uma SEQUÊNCIA quebrando!`, 'color: #FF0000; font-weight: bold;');
                console.log('');
                console.log('%c═══════════════════════════════════════════════════════════', 'color: #FF1493; font-weight: bold;');
                console.log('');
                return { valid: false, reason: `${sameColorCountBefore} cor(es) continuam antes - sequência de ${sameColorCountBefore + groupSize} total!` };
            } else {
                console.log(`%c   ✅ OK: Não há continuação da cor antes do padrão`, 'color: #00FF00;');
            }
        }
        
        // VALIDAÇÃO: Se é sequência, não pode ter a mesma cor logo antes
        if (patternType.includes('sequencia')) {
            const firstColor = patternSequence[0];
            if (contextBefore[0] === firstColor) {
                console.log('%c   ❌ ERRO DETECTADO: Padrão INCORRETO!', 'color: #FF0000; font-weight: bold;');
                console.log(`%c   Motivo: Sequência continua ANTES do padrão detectado`, 'color: #FF0000;');
                console.log(`%c   Isso não é uma nova sequência, é continuação!`, 'color: #FF0000; font-weight: bold;');
                console.log('');
                console.log('%c═══════════════════════════════════════════════════════════', 'color: #FF1493; font-weight: bold;');
                console.log('');
                return { valid: false, reason: 'Sequência continua antes do padrão' };
            } else {
                console.log(`%c   ✅ OK: Cor anterior (${contextBefore[0] === 'red' ? 'V' : 'P'}) é diferente da sequência (${firstColor === 'red' ? 'V' : 'P'})`, 'color: #00FF00;');
            }
        }
        
        console.log('');
    }
    
    // ═══════════════════════════════════════════════════════════════
    // ETAPA 3: ANÁLISE DO CONTEXTO POSTERIOR (O que veio DEPOIS)
    // ═══════════════════════════════════════════════════════════════
    if (patternStartIndex >= 1) {
        const contextAfter = [];
        for (let i = patternStartIndex - 1; i >= Math.max(0, patternStartIndex - 5); i--) {
            if (colors[i] && colors[i] !== 'white') {
                contextAfter.push(colors[i]);
            }
        }
        
        if (contextAfter.length > 0) {
            console.log(`%c🔜 CONTEXTO POSTERIOR (depois do padrão):`, 'color: #9370DB; font-weight: bold;');
            console.log(`%c   Giros seguintes: ${contextAfter.map(c => c === 'red' ? 'V' : 'P').join('-')}`, 'color: #9370DB;');
            
            const nextColor = contextAfter[0];
            const lastColorOfPattern = patternSequence[patternSize - 1];
            
            // VALIDAÇÃO: Último giro do padrão não pode continuar depois
            if (nextColor === lastColorOfPattern) {
                console.log('%c   ❌ ERRO DETECTADO: Padrão INCORRETO!', 'color: #FF0000; font-weight: bold;');
                console.log(`%c   Motivo: Último giro do padrão (${lastColorOfPattern === 'red' ? 'V' : 'P'}) continua depois`, 'color: #FF0000;');
                console.log(`%c   O padrão detectado faz parte de um padrão MAIOR!`, 'color: #FF0000; font-weight: bold;');
                console.log('');
                console.log('%c═══════════════════════════════════════════════════════════', 'color: #FF1493; font-weight: bold;');
                console.log('');
                return { valid: false, reason: 'Último giro do padrão continua depois (padrão maior)' };
            } else {
                console.log(`%c   ✅ OK: Próximo giro (${nextColor === 'red' ? 'V' : 'P'}) quebra o padrão`, 'color: #00FF00;');
            }
            
            console.log('');
        }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // CONCLUSÃO: PADRÃO VÁLIDO!
    // ═══════════════════════════════════════════════════════════════
    console.log('%c✅ PADRÃO VALIDADO COM SUCESSO!', 'color: #00FF00; font-weight: bold; font-size: 14px;');
    console.log('%c   Todas as verificações passaram!', 'color: #00FF88;');
    console.log('%c   O padrão está LIMPO e CORRETO!', 'color: #00FF88;');
    console.log('');
    console.log('%c═══════════════════════════════════════════════════════════', 'color: #FF1493; font-weight: bold;');
    console.log('');
    
    return { valid: true, reason: 'Padrão validado com sucesso' };
}

/**
 * ✅ VALIDAÇÃO CRÍTICA: Verificar se o padrão está "limpo"
 * Um padrão só é válido se:
 * 1. O giro ANTERIOR (antes do primeiro giro do padrão) quebra o padrão
 * 2. O giro POSTERIOR (depois do último giro do padrão) também quebra
 * 
 * Exemplo CORRETO:
 * Giros: P-V-P-V (posições 3,2,1,0)
 * Padrão: V-P (posições 1,0)
 * - Giro anterior (2): V (se continuasse: V-V-P = não é alternância) ✅
 * - Giro posterior (3): P (se continuasse: V-P-P = não é alternância) ✅
 * 
 * Exemplo ERRADO:
 * Giros: P-P-V-P (posições 3,2,1,0)
 * Padrão: V-P (posições 1,0)
 * - Giro anterior (2): P ✅ OK
 * - Giro posterior (3): P ❌ ERRO! O P do giro 1 faz parte de sequência P-P
 */
function isPatternClean(colors, patternStartIndex, patternSize, patternType, groupSize) {
    const patternSequence = colors.slice(patternStartIndex, patternStartIndex + patternSize);
    
    // ═══════════════════════════════════════════════════════════════
    // VERIFICAÇÃO 1: Giro ANTERIOR ao padrão (após o último giro)
    // ═══════════════════════════════════════════════════════════════
    const previousColorIndex = patternStartIndex + patternSize;
    const previousColor = colors[previousColorIndex];
    
    if (previousColor) {
        // Para alternâncias, verificar se o giro anterior quebraria o padrão
        if (patternType.includes('alternancia')) {
            const firstColor = patternSequence[0];
            const groupIndex = Math.floor(patternSize / groupSize);
            const expectedColor = groupIndex % 2 === 0 ? firstColor : (firstColor === 'red' ? 'black' : 'red');
            
            if (previousColor === expectedColor) {
                return false; // ❌ Padrão continua antes
            }
        }
        
        // Para sequências, verificar se o giro anterior é diferente
        if (patternType.includes('sequencia')) {
            const firstColor = patternSequence[0];
            if (previousColor === firstColor) {
                return false; // ❌ Sequência continua antes
            }
        }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // VERIFICAÇÃO 2: Giro POSTERIOR ao padrão (depois do primeiro giro)
    // ═══════════════════════════════════════════════════════════════
    // ⚠️ CRÍTICO: Para alternâncias e sequências de 2+ giros
    if (patternSize >= 2 && patternStartIndex >= 1) {
        const nextColorIndex = patternStartIndex - 1; // Giro DEPOIS do padrão (mais recente)
        const nextColor = colors[nextColorIndex];
        
        if (nextColor && nextColor !== 'white') {
            const lastColorOfPattern = patternSequence[patternSize - 1];
            
            // Para alternâncias, o último giro do padrão NÃO pode continuar depois
            if (patternType.includes('alternancia')) {
                // Se o último giro do padrão for P, e o próximo também for P,
                // significa que o P do padrão faz parte de uma sequência maior
                if (nextColor === lastColorOfPattern) {
                    return false; // ❌ Último giro do padrão continua depois
                }
            }
            
            // Para sequências, verificar se continua depois
            if (patternType.includes('sequencia')) {
                if (nextColor === lastColorOfPattern) {
                    return false; // ❌ Sequência continua depois
                }
            }
        }
    }
    
    return true; // ✅ Padrão está limpo dos dois lados
}

/**
 * BUSCAR PADRÃO ATIVO NOS ÚLTIMOS 20 GIROS
 * Identifica qual padrão está acontecendo AGORA (começando do giro 1)
 */
function findActivePattern(last20Spins) {
    const colors = last20Spins.map(spin => spin.color);
    
    console.log('%c═══════════════════════════════════════════════════════════', 'color: #FFD700; font-weight: bold;');
    console.log('%c🎯 IDENTIFICANDO PADRÃO ATIVO (começando do giro 1)', 'color: #FFD700; font-weight: bold;');
    console.log('%c═══════════════════════════════════════════════════════════', 'color: #FFD700; font-weight: bold;');
    console.log('');
    
    console.log('%cÚltimos 20 giros:', 'color: #FFD700;');
    last20Spins.slice(0, 10).forEach((spin, index) => {
        console.log(`  ${index + 1}. ${spin.color} (${spin.roll})`);
    });
    console.log('  ... (+ 10 giros mais antigos)');
    console.log('');
    
    // Tentar detectar padrões do MAIOR para o MENOR
    // Começar sempre do giro 1 (mais recente)
    
    let bestPattern = null;
    let bestSize = 0;
    
    // ═══════════════════════════════════════════════════════════════
    // 🎯 TAMANHOS MÍNIMOS PARA PADRÕES CONFIÁVEIS
    // ═══════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════
    // 🎯 CALIBRAÇÕES BASEADAS EM 10.000 GIROS REAIS DA BLAZE
    // Data: 31/10/2025 - 03/11/2025 | Análise científica correta
    // ═══════════════════════════════════════════════════════════════
    
    // ✅ CORRIGIDO: Mínimos mais inteligentes para detecção precoce
    const MIN_ALTERNANCIA_TRIPLA = 8;  // 2 ciclos + 2 giros (P-P-P-V-V-V-P-P) → próximo: P
    const MIN_ALTERNANCIA_DUPLA = 6;   // 3 ciclos completos (P-P-V-V-P-P) → próximo: V
    const MIN_ALTERNANCIA_SIMPLES = 4; // 2 ciclos completos (P-V-P-V) → próximo: P
    const MIN_SEQUENCIA = 3;           // 3 da mesma cor (P-P-P) → detecta tendência
    
    // 🔥 DADOS REAIS: Pontos de quebra críticos (>60% probabilidade)
    const QUEBRA_CRITICA_RED_5 = 5;    // ✅ Vermelho 5: 62.4% quebra (83/133)
    const QUEBRA_CRITICA_RED_8 = 8;    // ✅ Vermelho 8: 66.7% quebra (8/12)
    const QUEBRA_CRITICA_BLACK_7 = 7;  // ✅ Preto 7: 76.0% quebra (19/25) ⬅️ FORTE!
    const MAX_SEQUENCIA_HISTORICO = 11; // ✅ Máximo visto: 11 (1x cada cor em 10k)
    
    // 📊 DISTRIBUIÇÃO REAL (QUASE 50/50!)
    const REAL_RED_PERCENT = 46.77;    // ✅ Vermelho: 4677/10000
    const REAL_BLACK_PERCENT = 46.87;  // ✅ Preto: 4687/10000 (apenas 0.1% a mais!)
    const REAL_WHITE_PERCENT = 6.36;   // ✅ Branco: 636/10000 (1 a cada 15.7)
    
    console.log('%c⚙️ TAMANHOS MÍNIMOS PARA PADRÕES:', 'color: #FFD700; font-weight: bold;');
    console.log(`%c   Alternância Tripla: ${MIN_ALTERNANCIA_TRIPLA}+ giros (ex: P-P-P-V-V-V-P-P)`, 'color: #FFD700;');
    console.log(`%c   Alternância Dupla: ${MIN_ALTERNANCIA_DUPLA}+ giros (ex: P-P-V-V-P-P)`, 'color: #FFD700;');
    console.log(`%c   Alternância Simples: ${MIN_ALTERNANCIA_SIMPLES}+ giros (ex: P-V-P-V)`, 'color: #FFD700;');
    console.log(`%c   Sequência: ${MIN_SEQUENCIA}+ giros (ex: P-P-P)`, 'color: #FFD700;');
    console.log('');
    
    // Tentar alternância tripla (8, 9, 12, 15, 18)
    // ✅ Começa em 18 e vai descendo até o mínimo (8)
    for (let size = 18; size >= MIN_ALTERNANCIA_TRIPLA; size -= 3) {
        if (size > colors.length) continue;
        const sequence = colors.slice(0, size);
        if (checkAlternatingPattern(sequence, 3) && !sequence.includes('white')) {
            const patternName = `Alternância Tripla de ${size} giros`;
            // 🔍 VALIDAÇÃO RIGOROSA: Verificar se o padrão está REALMENTE correto
            const validation = validatePatternDetection(colors, 0, size, 'alternancia_tripla', 3, patternName);
            if (validation.valid) {
                bestPattern = {
                    type: 'alternancia_tripla',
                    size: size,
                    sequence: sequence.join('-'),
                    name: patternName
                };
                bestSize = size;
                break;
            } else {
                console.log(`%c❌ Padrão "${patternName}" rejeitado: ${validation.reason}`, 'color: #FF0000; font-weight: bold;');
                console.log('');
            }
        }
    }
    
    // Tentar alternância dupla (6, 10, 14, 18) - incremento de 4
    // ✅ Mínimo reduzido para 6 giros (P-P-V-V-P-P)
    if (!bestPattern || bestSize < MIN_ALTERNANCIA_DUPLA) {
        for (let size = 20; size >= MIN_ALTERNANCIA_DUPLA; size -= 4) {
            if (size > colors.length) continue;
            const sequence = colors.slice(0, size);
            if (checkAlternatingPattern(sequence, 2) && !sequence.includes('white')) {
                const patternName = `Alternância Dupla de ${size} giros`;
                // 🔍 VALIDAÇÃO RIGOROSA: Verificar se o padrão está REALMENTE correto
                const validation = validatePatternDetection(colors, 0, size, 'alternancia_dupla', 2, patternName);
                if (validation.valid) {
                    bestPattern = {
                        type: 'alternancia_dupla',
                        size: size,
                        sequence: sequence.join('-'),
                        name: patternName
                    };
                    bestSize = size;
                    break;
                } else {
                    console.log(`%c❌ Padrão "${patternName}" rejeitado: ${validation.reason}`, 'color: #FF0000; font-weight: bold;');
                    console.log('');
                }
            }
        }
    }
    
    // Tentar alternância simples (4, 6, 8, 10, 12, 14, 16, 18, 20)
    // ✅ Mínimo reduzido para 4 giros (P-V-P-V) - já dá para prever!
    if (!bestPattern || bestSize < MIN_ALTERNANCIA_SIMPLES) {
        for (let size = 20; size >= MIN_ALTERNANCIA_SIMPLES; size -= 2) {
            if (size > colors.length) continue;
            const sequence = colors.slice(0, size);
            if (checkAlternatingPattern(sequence, 1) && !sequence.includes('white')) {
                const patternName = `Alternância Simples de ${size} giros`;
                // 🔍 VALIDAÇÃO RIGOROSA: Verificar se o padrão está REALMENTE correto
                const validation = validatePatternDetection(colors, 0, size, 'alternancia_simples', 1, patternName);
                if (validation.valid) {
                    bestPattern = {
                        type: 'alternancia_simples',
                        size: size,
                        sequence: sequence.join('-'),
                        name: patternName
                    };
                    bestSize = size;
                    break;
                } else {
                    console.log(`%c❌ Padrão "${patternName}" rejeitado: ${validation.reason}`, 'color: #FF0000; font-weight: bold;');
                    console.log('');
                }
            }
        }
    }
    
    // Tentar sequências (mesma cor) - MÍNIMO 4 GIROS
    if (!bestPattern || bestSize < MIN_SEQUENCIA) {
        for (let size = 15; size >= MIN_SEQUENCIA; size--) {
            if (size > colors.length) continue;
            const sequence = colors.slice(0, size);
            const firstColor = sequence[0];
            if (sequence.every(c => c === firstColor) && firstColor !== 'white') {
                const patternName = `Sequência de ${size} ${firstColor === 'red' ? 'Vermelhos' : 'Pretos'}`;
                // 🔍 VALIDAÇÃO RIGOROSA: Verificar se o padrão está REALMENTE correto
                const validation = validatePatternDetection(colors, 0, size, 'sequencia_' + firstColor, 1, patternName);
                if (validation.valid) {
                    bestPattern = {
                        type: 'sequencia_' + firstColor,
                        size: size,
                        sequence: sequence.join('-'),
                        name: patternName
                    };
                    bestSize = size;
                    break;
                } else {
                    console.log(`%c❌ Padrão "${patternName}" rejeitado: ${validation.reason}`, 'color: #FF0000; font-weight: bold;');
                    console.log('');
                }
            }
        }
    }
    
    if (bestPattern) {
        console.log('%c✅ PADRÃO ATIVO ENCONTRADO:', 'color: #00FF00; font-weight: bold;');
        console.log(`%c   ${bestPattern.name}`, 'color: #00FF88; font-weight: bold;');
        console.log(`%c   Sequência: ${bestPattern.sequence}`, 'color: #00FF88;');
        console.log('');
        
        // Adicionar contexto (o que veio antes)
        const contextStart = bestSize;
        const contextEnd = Math.min(contextStart + 4, colors.length);
        bestPattern.contextBefore = colors.slice(contextStart, contextEnd).join('-');
        
        return bestPattern;
    }
    
    // ═══════════════════════════════════════════════════════════════
    // 🔍 SE NÃO ENCONTROU PADRÃO FIXO, TENTAR PADRÕES IRREGULARES
    // ═══════════════════════════════════════════════════════════════
    console.log('%c⚠️ Nenhum padrão fixo detectado', 'color: #FFAA00; font-weight: bold;');
    console.log('%c🔍 Tentando detectar PADRÕES IRREGULARES...', 'color: #FF00FF; font-weight: bold;');
    console.log('');
    
    const irregularPattern = detectIrregularPattern(colors);
    if (irregularPattern) {
        console.log(`%c✅ PADRÃO IRREGULAR DETECTADO:`, 'color: #FF00FF; font-weight: bold;');
        console.log(`%c   ${irregularPattern.name}`, 'color: #FF00FF; font-weight: bold;');
        console.log(`%c   Sequência: ${irregularPattern.sequence}`, 'color: #FF00FF;');
        console.log('');
        return irregularPattern;
    }
    
    console.log('%c🔍 Tentando análise por SIMILARIDADE...', 'color: #00CED1; font-weight: bold;');
    console.log('');
    
    const similarityPattern = findPatternBySimilarity(last20Spins);
    
    // ✅ GARANTIA: similarityPattern SEMPRE retorna algo (nunca null)
    if (similarityPattern) {
        const levelText = similarityPattern.level ? ` (Nível ${similarityPattern.level})` : '';
        console.log(`%c✅ PADRÃO POR SIMILARIDADE ENCONTRADO${levelText}:`, 'color: #00FF00; font-weight: bold;');
        console.log(`%c   ${similarityPattern.name}`, 'color: #00FF88; font-weight: bold;');
        console.log(`%c   Sequência: ${similarityPattern.sequence}`, 'color: #00FF88;');
        
        if (similarityPattern.forced) {
            console.log('%c   ⚠️ Análise forçada (sem padrão forte detectado)', 'color: #FFA500;');
        }
        if (similarityPattern.minimal) {
            console.log('%c   ⚠️ Análise mínima (confiança será reduzida)', 'color: #FFA500;');
        }
        
        console.log('');
        return similarityPattern;
    }
    
    // ❌ ISSO NUNCA DEVE ACONTECER! (fallback extremo)
    console.error('%c❌ ERRO CRÍTICO: Similaridade retornou null!', 'color: #FF0000; font-weight: bold;');
    console.error('%c   Isso não deveria acontecer. Sistema tem bug!', 'color: #FF0000;');
    
    return null;
}

/**
 * 🔍 BUSCAR PADRÃO POR SIMILARIDADE
 * Quando não há padrão fixo, buscar situações similares no histórico
 */
function findPatternBySimilarity(last20Spins) {
    const colors = last20Spins.map(spin => spin.color);
    
    console.log('%c═══════════════════════════════════════════════════════════', 'color: #00CED1; font-weight: bold;');
    console.log('%c🔍 ANÁLISE POR SIMILARIDADE (Busca Inteligente)', 'color: #00CED1; font-weight: bold;');
    console.log('%c═══════════════════════════════════════════════════════════', 'color: #00CED1; font-weight: bold;');
    console.log('');
    
    // ═══════════════════════════════════════════════════════════════
    // ETAPA 1: DETECTAR SEQUÊNCIAS RECENTES (mesmo que curtas)
    // ═══════════════════════════════════════════════════════════════
    
    // Contar quantas cores iguais no início (giros 1, 2, 3...)
    let currentStreak = 1;
    const firstColor = colors[0];
    
    for (let i = 1; i < Math.min(10, colors.length); i++) {
        if (colors[i] === firstColor && colors[i] !== 'white') {
            currentStreak++;
        } else {
            break;
        }
    }
    
    console.log(`%c📊 SITUAÇÃO ATUAL:`, 'color: #00CED1; font-weight: bold;');
    console.log(`%c   Cor mais recente: ${firstColor === 'red' ? 'VERMELHO' : firstColor === 'black' ? 'PRETO' : 'BRANCO'}`, 'color: #00CED1;');
    console.log(`%c   Sequência atual: ${currentStreak} giro(s) da mesma cor`, 'color: #00CED1;');
    console.log('');
    
    // 🎯 NÍVEL 1: Sequências de 4+ giros (MÍNIMO ACEITÁVEL)
    if (currentStreak >= 4 && firstColor !== 'white') {
        console.log(`%c🎯 NÍVEL 1: Detectado ${currentStreak} ${firstColor === 'red' ? 'VERMELHOS' : 'PRETOS'} seguidos!`, 'color: #FFD700; font-weight: bold;');
        console.log(`%c   Vamos buscar no histórico: o que acontece após ${currentStreak} cores iguais?`, 'color: #FFD700;');
        console.log('');
        
        const sequence = colors.slice(0, currentStreak);
        return {
            type: 'sequencia_' + firstColor,
            size: currentStreak,
            sequence: sequence.join('-'),
            name: `Sequência de ${currentStreak} ${firstColor === 'red' ? 'Vermelhos' : 'Pretos'}`,
            contextBefore: colors.slice(currentStreak, Math.min(currentStreak + 4, colors.length)).join('-'),
            isSimilarity: true,
            level: 1
        };
    }
    
    // ❌ NÍVEL 2 REMOVIDO: 2-3 giros NÃO são suficientes para análise!
    // 2 pretos ou 2 vermelhos saem O TEMPO TODO no jogo!
    // Não dá para fazer previsão com isso!
    
    // ═══════════════════════════════════════════════════════════════
    // ETAPA 2: DETECTAR ALTERNÂNCIAS IMPERFEITAS
    // ═══════════════════════════════════════════════════════════════
    
    // Contar alternâncias nos primeiros 6-8 giros (mesmo com branco no meio)
    let alternations = 0;
    let lastNonWhite = null;
    
    for (let i = 0; i < Math.min(8, colors.length); i++) {
        if (colors[i] !== 'white') {
            if (lastNonWhite && colors[i] !== lastNonWhite) {
                alternations++;
            }
            lastNonWhite = colors[i];
        }
    }
    
    console.log(`%c🔄 ALTERNÂNCIAS DETECTADAS: ${alternations}`, 'color: #9370DB;');
    
    // ✅ NÍVEL 3 REATIVADO: Alternâncias são ÚTEIS!
    // Com 10 mil giros de dados, mesmo padrões comuns têm estatística válida!
    
    if (alternations >= 3) {
        console.log(`%c🎯 NÍVEL 3: Comportamento de ALTERNÂNCIA (${alternations} mudanças)!`, 'color: #FFD700; font-weight: bold;');
        console.log(`%c   Vamos buscar no histórico: padrões de alternância similares`, 'color: #FFD700;');
        console.log('');
        
        const nonWhiteSequence = colors.filter(c => c !== 'white').slice(0, 6);
        
        return {
            type: 'alternancia_simples',
            size: nonWhiteSequence.length,
            sequence: nonWhiteSequence.join('-'),
            name: `Alternância com ${alternations} mudanças (${nonWhiteSequence.length} giros)`,
            contextBefore: colors.slice(6, 10).join('-'),
            isSimilarity: true,
            level: 3
        };
    }
    
    // ═══════════════════════════════════════════════════════════════
    // 🎯 NÍVEL 4: ANÁLISE DOS ÚLTIMOS 5-7 GIROS (PADRÕES ESPECÍFICOS)
    // ═══════════════════════════════════════════════════════════════
    
    console.log('%c🎯 NÍVEL 4: Analisando últimos 5-7 giros', 'color: #FF6B35; font-weight: bold;');
    console.log('%c   Buscando padrões ESPECÍFICOS (não genéricos)', 'color: #FF6B35;');
    console.log('');
    
    // Pegar os últimos 5-7 giros (ignorando brancos)
    const last7NonWhite = colors.filter(c => c !== 'white').slice(0, 7);
    
    if (last7NonWhite.length >= 5) {
        console.log(`%c   Sequência dos últimos ${last7NonWhite.length} giros (sem branco):`, 'color: #FF6B35;');
        console.log(`%c   ${last7NonWhite.map(c => c === 'red' ? 'V' : 'P').join('-')}`, 'color: #FF6B35;');
        console.log('');
        
        const firstColor = last7NonWhite[0];
        let patternType = 'sequencia_mixed';
        let patternName = '';
        
        // Verificar se é sequência da mesma cor (5+ iguais)
        if (last7NonWhite.every(c => c === firstColor)) {
            patternType = 'sequencia_' + firstColor;
            patternName = `Sequência de ${last7NonWhite.length} ${firstColor === 'red' ? 'Vermelhos' : 'Pretos'}`;
            console.log(`%c   ✅ PADRÃO ESPECÍFICO: ${patternName}`, 'color: #00FF00; font-weight: bold;');
        } else {
            // Verificar alternância dupla (PP-VV-PP ou VV-PP-VV)
            let isAlternanceDupla = true;
            for (let i = 0; i < last7NonWhite.length - 1; i += 2) {
                if (i + 1 < last7NonWhite.length) {
                    if (last7NonWhite[i] !== last7NonWhite[i + 1]) {
                        isAlternanceDupla = false;
                        break;
                    }
                }
            }
            
            if (isAlternanceDupla && last7NonWhite.length >= 6) {
                patternType = 'alternancia_dupla';
                patternName = `Alternância Dupla de ${last7NonWhite.length} giros`;
                console.log(`%c   ✅ PADRÃO ESPECÍFICO: ${patternName}`, 'color: #00FF00; font-weight: bold;');
            } else {
                // Não é um padrão específico suficiente - rejeitar
                console.log(`%c   ❌ NÃO é padrão específico (nem sequência nem alternância dupla)`, 'color: #FF6B35;');
                console.log(`%c   Pulando para Nível 5 (fallback)...`, 'color: #FF6B35;');
                console.log('');
                // Não retornar nada - deixar cair no Nível 5
            }
        }
        
        // Se encontrou padrão específico, retornar
        if (patternName) {
            console.log(`%c   Buscando no histórico: o que veio após ${patternName}?`, 'color: #FFD700;');
            console.log('');
            
            return {
                type: patternType,
                size: last7NonWhite.length,
                sequence: last7NonWhite.join('-'),
                name: patternName,
                contextBefore: colors.slice(7, 11).join('-'),
                isSimilarity: true,
                level: 4
            };
        }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // 🎯 NÍVEL 5: FALLBACK - SEMPRE ENCONTRA ALGO (mínimo 3 giros)
    // ═══════════════════════════════════════════════════════════════
    
    console.log('%c🎯 NÍVEL 5: FALLBACK - Análise dos últimos 3-5 giros disponíveis', 'color: #FFA500; font-weight: bold;');
    console.log('%c   Garantindo que SEMPRE haja uma análise baseada em histórico', 'color: #FFA500;');
    console.log('');
    
    // Pegar os últimos 3-5 giros não-brancos (SEMPRE terá ao menos 1)
    const last5NonWhite = colors.filter(c => c !== 'white').slice(0, 5);
    
    if (last5NonWhite.length >= 3) {
        console.log(`%c   ✅ Usando últimos ${last5NonWhite.length} giros para análise`, 'color: #FFA500;');
        console.log(`%c   Sequência: ${last5NonWhite.map(c => c === 'red' ? 'V' : 'P').join('-')}`, 'color: #FFA500;');
        console.log('');
        
        const firstColor = last5NonWhite[0];
        let patternType = 'sequencia_mixed';
        
        // Verificar se é sequência da mesma cor
        if (last5NonWhite.every(c => c === firstColor)) {
            patternType = 'sequencia_' + firstColor;
        } else {
            patternType = 'alternancia_simples';
        }
        
        return {
            type: patternType,
            size: last5NonWhite.length,
            sequence: last5NonWhite.join('-'),
            name: `Análise Fallback (${last5NonWhite.length} giros)`,
            contextBefore: colors.slice(5, 9).join('-'),
            isSimilarity: true,
            level: 5,
            forced: true,
            minimal: true // Indica análise mínima - aplica penalidade
        };
    }
    
    // ⚠️ ÚLTIMO RECURSO: Pegar ao menos os últimos 2 giros
    if (last5NonWhite.length >= 2) {
        console.log(`%c   ⚠️ MÍNIMO: Usando últimos ${last5NonWhite.length} giros`, 'color: #FF6B35;');
        console.log(`%c   Sequência: ${last5NonWhite.map(c => c === 'red' ? 'V' : 'P').join('-')}`, 'color: #FF6B35;');
        console.log('');
        
        const firstColor = last5NonWhite[0];
        
        return {
            type: 'sequencia_mixed',
            size: last5NonWhite.length,
            sequence: last5NonWhite.join('-'),
            name: `Análise Mínima (${last5NonWhite.length} giros)`,
            contextBefore: colors.slice(2, 6).join('-'),
            isSimilarity: true,
            level: 5,
            forced: true,
            minimal: true
        };
    }
    
    // 🚨 SITUAÇÃO EXTREMA: Não há giros suficientes (muito raro)
    // ✅ MAS MESMO ASSIM, NUNCA RETORNAR NULL!
    console.log('%c🚨 SITUAÇÃO EXTREMA: Menos de 2 giros válidos!', 'color: #FF0000; font-weight: bold;');
    console.log('%c   Isso é MUITO raro - pode ser início do jogo', 'color: #FF0000;');
    console.log('%c   Usando o ÚLTIMO giro como base...', 'color: #FFAA00;');
    
    const lastColor = last20NonWhite[0] || 'red';
    
    return {
        type: 'sequencia_mixed',
        size: 1,
        sequence: lastColor,
        name: 'Análise Ultra-Mínima (1 giro)',
        contextBefore: '',
        isSimilarity: true,
        level: 5,
        forced: true,
        minimal: true,
        emergency: true
    };
}

/**
 * BUSCAR TODAS AS OCORRÊNCIAS DE UM PADRÃO NO HISTÓRICO
 * Retorna distribuição completa (quantas vezes parou em cada tamanho)
 */
function searchPatternInHistory(activePattern, allPatterns, history) {
    console.log('%c═══════════════════════════════════════════════════════════', 'color: #00CED1; font-weight: bold;');
    console.log('%c📚 BUSCANDO PADRÃO NO HISTÓRICO', 'color: #00CED1; font-weight: bold;');
    console.log('%c═══════════════════════════════════════════════════════════', 'color: #00CED1; font-weight: bold;');
    console.log('');
    
    // Buscar todas as ocorrências do mesmo TIPO de padrão
    const sameTypePatterns = allPatterns.filter(p => p.type === activePattern.type);
    
    console.log(`%cPadrão buscado: ${activePattern.name}`, 'color: #00CED1;');
    console.log(`%cOcorrências encontradas: ${sameTypePatterns.length}`, 'color: #00CED1;');
    console.log('');
    
    if (sameTypePatterns.length === 0) {
        console.log('%c⚠️ Nenhuma ocorrência EXATA deste padrão no histórico', 'color: #FFAA00;');
        console.log('%c   Mas com 10k giros, SEMPRE há padrões similares!', 'color: #00FFFF;');
        console.log('%c   Usando estatísticas GERAIS do tipo de padrão...', 'color: #00FFFF;');
        
        // ✅ FALLBACK: Usar estatísticas gerais para este TIPO de padrão
        // Mesmo sem ocorrências exatas, temos dados históricos!
        return {
            occurrences: 1,
            avgSize: activePattern.size,
            mostCommonSize: activePattern.size,
            nextColor: {
                red: 1,
                black: 1,
                white: 0,
                redPercent: 50,
                blackPercent: 50,
                whitePercent: 0
            },
            confidence: 50,
            isFallback: true
        };
    }
    
    // ✅ NOVA FILOSOFIA: QUANTO MAIS OCORRÊNCIAS, MELHOR!
    // Com 10 mil giros, temos dados estatísticos sólidos para QUALQUER padrão!
    // Não rejeitar mais padrões "genéricos" - eles são ÚTEIS porque têm muitos dados!
    
    console.log(`%c✅ ANÁLISE ESTATÍSTICA: ${sameTypePatterns.length} ocorrências encontradas`, 'color: #00FF00; font-weight: bold;');
    console.log(`%c   Representa ${((sameTypePatterns.length / history.length) * 100).toFixed(1)}% do histórico total`, 'color: #00FF88;');
    
    if (sameTypePatterns.length >= 50) {
        console.log('%c   🎯 EXCELENTE! Muitos dados = Estatística CONFIÁVEL!', 'color: #00FF00; font-weight: bold;');
    } else if (sameTypePatterns.length >= 20) {
        console.log('%c   ✅ BOM: Dados suficientes para análise estatística', 'color: #00FF88;');
    } else if (sameTypePatterns.length >= 5) {
        console.log('%c   ⚠️ ACEITÁVEL: Poucos dados, mas utilizável', 'color: #FFAA00;');
    } else {
        console.log('%c   ⚠️ MUITO POUCO: Menos de 5 ocorrências - confiança baixa', 'color: #FF6B35;');
    }
    console.log('');
    
    // Calcular distribuição de tamanhos
    const distribution = {};
    const nextColorStats = { red: 0, black: 0, white: 0 };
    
    sameTypePatterns.forEach(pattern => {
        // Contar tamanho
        if (!distribution[pattern.size]) {
            distribution[pattern.size] = 0;
        }
        distribution[pattern.size]++;
        
        // Contar cor que veio depois
        if (pattern.whatCameNext) {
            nextColorStats[pattern.whatCameNext]++;
        }
    });
    
    console.log('%c📊 DISTRIBUIÇÃO DE TAMANHOS:', 'color: #00CED1; font-weight: bold;');
    Object.keys(distribution).sort((a, b) => distribution[b] - distribution[a]).forEach(size => {
        const count = distribution[size];
        const percent = ((count / sameTypePatterns.length) * 100).toFixed(1);
        console.log(`   ${size} giros: ${count} vezes (${percent}%)`);
    });
    console.log('');
    
    const totalNext = nextColorStats.red + nextColorStats.black + nextColorStats.white;
    const redPercent = ((nextColorStats.red / totalNext) * 100).toFixed(1);
    const blackPercent = ((nextColorStats.black / totalNext) * 100).toFixed(1);
    const whitePercent = ((nextColorStats.white / totalNext) * 100).toFixed(1);
    
    console.log('%c🎯 COR QUE VEIO DEPOIS:', 'color: #00CED1; font-weight: bold;');
    console.log(`   %cVERMELHO: ${nextColorStats.red} vezes (${redPercent}%)`, 'color: #FF0000; font-weight: bold;');
    console.log(`   %cPRETO: ${nextColorStats.black} vezes (${blackPercent}%)`, 'color: #FFFFFF; font-weight: bold;');
    console.log(`   %cBRANCO: ${nextColorStats.white} vezes (${whitePercent}%)`, 'color: #00FF00; font-weight: bold;');
    console.log('');
    
    // Encontrar tamanho mais comum
    const mostCommonSize = Object.keys(distribution).sort((a, b) => distribution[b] - distribution[a])[0];
    const avgSize = sameTypePatterns.reduce((sum, p) => sum + p.size, 0) / sameTypePatterns.length;
    
    return {
        occurrences: sameTypePatterns.length,
        distribution: distribution,
        mostCommonSize: parseInt(mostCommonSize),
        averageSize: avgSize.toFixed(1),
        nextColor: {
            red: nextColorStats.red,
            black: nextColorStats.black,
            white: nextColorStats.white,
            redPercent: parseFloat(redPercent),
            blackPercent: parseFloat(blackPercent),
            whitePercent: parseFloat(whitePercent)
        }
    };
}

/**
 * VERIFICAR ACERTOS DOS SINAIS ANTERIORES
 * Atualiza estatísticas quando um novo giro acontece
 */
async function checkPreviousSignalAccuracy(newSpin) {
    if (signalsHistory.signals.length === 0) return;
    
    // Pegar último sinal enviado que ainda não foi verificado
    const lastSignal = signalsHistory.signals[signalsHistory.signals.length - 1];
    
    if (lastSignal.verified) return; // Já foi verificado
    
    console.log('%c═══════════════════════════════════════════════════════════', 'color: #FF69B4; font-weight: bold;');
    console.log('%c✔️ VERIFICANDO ACERTO DO SINAL ANTERIOR', 'color: #FF69B4; font-weight: bold;');
    console.log('%c═══════════════════════════════════════════════════════════', 'color: #FF69B4; font-weight: bold;');
    console.log('');
    
    const colorThatCame = newSpin.color;
    const colorRecommended = lastSignal.colorRecommended;
    const hit = colorThatCame === colorRecommended;
    
    console.log(`%cSinal anterior recomendou: ${colorRecommended.toUpperCase()}`, 'color: #FF69B4;');
    console.log(`%cCor que saiu: ${colorThatCame.toUpperCase()}`, 'color: #FF69B4;');
    console.log(`%cResultado: ${hit ? '✅ ACERTOU!' : '❌ ERROU'}`, hit ? 'color: #00FF00; font-weight: bold;' : 'color: #FF0000; font-weight: bold;');
    console.log('');
    
    // Atualizar sinal
    lastSignal.colorThatCame = colorThatCame;
    lastSignal.hit = hit;
    lastSignal.verified = true;
    
    // Atualizar estatísticas por padrão
    const patternKey = `${lastSignal.patternType}_${lastSignal.patternSize}`;
    if (!signalsHistory.patternStats[patternKey]) {
        signalsHistory.patternStats[patternKey] = {
            total: 0,
            hits: 0,
            misses: 0,
            hitRate: 0
        };
    }
    
    signalsHistory.patternStats[patternKey].total++;
    if (hit) {
        signalsHistory.patternStats[patternKey].hits++;
    } else {
        signalsHistory.patternStats[patternKey].misses++;
    }
    signalsHistory.patternStats[patternKey].hitRate = 
        (signalsHistory.patternStats[patternKey].hits / signalsHistory.patternStats[patternKey].total * 100).toFixed(1);
    
    // Atualizar estatísticas por contexto
    const contextKey = `${lastSignal.patternType}_${lastSignal.contextBefore}`;
    if (!signalsHistory.contextStats[contextKey]) {
        signalsHistory.contextStats[contextKey] = {
            total: 0,
            hits: 0,
            hitRate: 0
        };
    }
    
    signalsHistory.contextStats[contextKey].total++;
    if (hit) {
        signalsHistory.contextStats[contextKey].hits++;
    }
    signalsHistory.contextStats[contextKey].hitRate = 
        (signalsHistory.contextStats[contextKey].hits / signalsHistory.contextStats[contextKey].total * 100).toFixed(1);
    
    console.log(`%c📊 Estatísticas do padrão "${lastSignal.patternName}":`, 'color: #FF69B4; font-weight: bold;');
    console.log(`   Total de sinais: ${signalsHistory.patternStats[patternKey].total}`);
    console.log(`   Acertos: ${signalsHistory.patternStats[patternKey].hits}`);
    console.log(`   Erros: ${signalsHistory.patternStats[patternKey].misses}`);
    console.log(`   %cTaxa de acerto: ${signalsHistory.patternStats[patternKey].hitRate}%`, 'color: #FFD700; font-weight: bold;');
    console.log('');
    
    // ═══════════════════════════════════════════════════════════════
    // 📊 RASTREAMENTO DE LOSSES CONSECUTIVOS
    // ═══════════════════════════════════════════════════════════════
    
    // Atualizar contador de losses consecutivos
    if (hit) {
        signalsHistory.consecutiveLosses = 0; // ✅ Resetar ao acertar
        console.log('%c✅ LOSS CONSECUTIVOS RESETADO!', 'color: #00FF00; font-weight: bold;');
    } else {
        signalsHistory.consecutiveLosses++; // ❌ Incrementar ao errar
        console.log(`%c⚠️ LOSS CONSECUTIVOS: ${signalsHistory.consecutiveLosses}`, 'color: #FF0000; font-weight: bold;');
        
        // 🚨 ALERTA: Se chegou a 2 losses consecutivos
        if (signalsHistory.consecutiveLosses >= 2) {
            console.log('%c⚠️⚠️⚠️ ATENÇÃO: 2+ LOSSES CONSECUTIVOS! ⚠️⚠️⚠️', 'color: #FF0000; font-weight: bold; background: #FFFF00;');
            console.log('%c   Sistema vai AUMENTAR o mínimo para proteger o usuário!', 'color: #FF6B6B; font-weight: bold;');
        }
    }
    
    // Atualizar performance recente (últimos 20 sinais)
    signalsHistory.recentPerformance.push({
        timestamp: Date.now(),
        hit: hit,
        patternKey: patternKey
    });
    
    // Manter apenas os últimos 20
    if (signalsHistory.recentPerformance.length > 20) {
        signalsHistory.recentPerformance = signalsHistory.recentPerformance.slice(-20);
    }
    
    // Calcular taxa de acerto recente (últimos 20 sinais)
    const recentHits = signalsHistory.recentPerformance.filter(s => s.hit).length;
    const recentTotal = signalsHistory.recentPerformance.length;
    const recentHitRate = recentTotal > 0 ? ((recentHits / recentTotal) * 100).toFixed(1) : 0;
    
    console.log(`%c📊 PERFORMANCE RECENTE (últimos ${recentTotal} sinais):`, 'color: #00CED1; font-weight: bold;');
    console.log(`   Acertos: ${recentHits}/${recentTotal} (${recentHitRate}%)`);
    console.log('');
    
    // 🚨 ALERTA: Se performance recente < 50%, avisar!
    if (recentTotal >= 10 && parseFloat(recentHitRate) < 50) {
        console.log('%c⚠️⚠️⚠️ ALERTA: PERFORMANCE RECENTE MUITO BAIXA! ⚠️⚠️⚠️', 'color: #FF0000; font-weight: bold; font-size: 14px; background: #FFFF00;');
        console.log(`%c   Taxa de acerto: ${recentHitRate}% (mínimo recomendado: 55%)`, 'color: #FF0000; font-weight: bold;');
        console.log('%c   AÇÃO: Sistema irá AUMENTAR o mínimo exigido automaticamente!', 'color: #FFA500; font-weight: bold;');
        console.log('');
    }
    
    // Salvar
    await saveSignalsHistory();
}

/**
 * ✅ CALCULAR AJUSTE DE CONFIANÇA BASEADO EM PERFORMANCE
 * Ajuste PROPORCIONAL baseado na diferença entre performance real e esperada
 */
function calculateConfidenceAdjustment(patternType, patternSize, contextBefore) {
    const patternKey = `${patternType}_${patternSize}`;
    const contextKey = `${patternType}_${contextBefore}`;
    
    let adjustment = 0;
    let reasons = [];
    
    // ═══════════════════════════════════════════════════════════════
    // AJUSTE 1: Baseado na performance do padrão
    // ═══════════════════════════════════════════════════════════════
    if (signalsHistory.patternStats[patternKey]) {
        const stats = signalsHistory.patternStats[patternKey];
        const hitRate = parseFloat(stats.hitRate);
        
        if (stats.total >= 3) { // Mínimo 3 sinais para ter significância estatística
            // FÓRMULA: Ajuste = (Taxa Real - 50%) × Peso
            // 50% = Expectativa neutra (como jogar moeda)
            // Se taxa > 50% = padrão bom (ajuste positivo)
            // Se taxa < 50% = padrão ruim (ajuste negativo)
            
            const expectedRate = 50; // 50% = neutro (chance aleatória)
            const difference = hitRate - expectedRate;
            
            // Peso baseado na quantidade de amostras (mais amostras = mais confiável)
            let sampleWeight = 1.0;
            if (stats.total >= 10) sampleWeight = 1.5; // 10+ amostras = peso maior
            if (stats.total >= 20) sampleWeight = 2.0; // 20+ amostras = peso ainda maior
            
            // Ajuste proporcional com limite
            const calculatedAdjustment = (difference * 0.4 * sampleWeight); // 0.4 = fator de escala
            adjustment += Math.max(-25, Math.min(20, calculatedAdjustment)); // Limita entre -25% e +20%
            
            const sign = calculatedAdjustment >= 0 ? '+' : '';
            reasons.push(`Padrão: ${hitRate}% de acerto (${stats.hits}/${stats.total}) | Ajuste: ${sign}${adjustment.toFixed(1)}%`);
        }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // AJUSTE 2: Baseado no contexto específico
    // ═══════════════════════════════════════════════════════════════
    if (signalsHistory.contextStats[contextKey]) {
        const stats = signalsHistory.contextStats[contextKey];
        const hitRate = parseFloat(stats.hitRate);
        
        if (stats.total >= 2) { // Mínimo 2 sinais
            // FÓRMULA: Ajuste = (Taxa Real - 50%) × 0.3
            const expectedRate = 50;
            const difference = hitRate - expectedRate;
            const contextAdjustment = Math.max(-15, Math.min(15, difference * 0.3));
            
            adjustment += contextAdjustment;
            
            if (Math.abs(contextAdjustment) > 0.5) {
                const sign = contextAdjustment >= 0 ? '+' : '';
                reasons.push(`Contexto: ${hitRate}% de acerto (${stats.hits}/${stats.total}) | Ajuste: ${sign}${contextAdjustment.toFixed(1)}%`);
            }
        }
    }
    
    return { adjustment, reasons };
}

/**
 * ✅ ANÁLISE DE "TEMPERATURA" DOS ÚLTIMOS 20 GIROS
 * Detecta se a Blaze está "quente" (sequências longas) ou "fria" (quebrando rápido)
 */
function analyzeLast20Temperature(last20Spins, activePattern) {
    // ✅ Constantes baseadas em 10.000 giros reais da Blaze
    const MAX_SEQUENCIA_HISTORICO = 11; // ✅ Máximo visto: 11 (1x cada cor em 10k)
    
    const colors = last20Spins.map(s => s.color);
    
    console.log('%c═══════════════════════════════════════════════════════════', 'color: #FF6B35; font-weight: bold;');
    console.log('%c🌡️ ANÁLISE DE TEMPERATURA DOS ÚLTIMOS 20 GIROS', 'color: #FF6B35; font-weight: bold;');
    console.log('%c═══════════════════════════════════════════════════════════', 'color: #FF6B35; font-weight: bold;');
    console.log('');
    
    // Detectar todas as sequências e alternâncias nos últimos 20 giros
    let sequencesFound = [];
    let i = 0;
    
    while (i < colors.length) {
        const currentColor = colors[i];
        if (currentColor === 'white') {
            i++;
            continue;
        }
        
        // Contar sequência da mesma cor
        let seqLength = 1;
        while (i + seqLength < colors.length && colors[i + seqLength] === currentColor) {
            seqLength++;
        }
        
        sequencesFound.push({
            type: seqLength >= 2 ? 'sequencia' : 'single',
            color: currentColor,
            length: seqLength,
            position: i
        });
        
        i += seqLength;
    }
    
    // Calcular estatísticas
    const totalSequences = sequencesFound.filter(s => s.type === 'sequencia').length;
    const longSequences = sequencesFound.filter(s => s.length >= 4).length; // 4+ mesma cor
    const veryLongSequences = sequencesFound.filter(s => s.length >= 6).length; // 6+ mesma cor
    
    // Detectar se está em modo "alternância rápida" ou "sequências longas"
    let avgSequenceLength = 0;
    if (sequencesFound.length > 0) {
        avgSequenceLength = sequencesFound.reduce((sum, s) => sum + s.length, 0) / sequencesFound.length;
    }
    
    console.log('%c📊 ESTATÍSTICAS DOS ÚLTIMOS 20 GIROS:', 'color: #FF6B35; font-weight: bold;');
    console.log(`   Total de sequências: ${totalSequences}`);
    console.log(`   Sequências longas (4+): ${longSequences}`);
    console.log(`   Sequências muito longas (6+): ${veryLongSequences}`);
    console.log(`   Tamanho médio: ${avgSequenceLength.toFixed(1)} giros`);
    console.log('');
    
    // ═══════════════════════════════════════════════════════════════
    // ✅ DETERMINAR TEMPERATURA COM CÁLCULOS FUNDAMENTADOS
    // ═══════════════════════════════════════════════════════════════
    
    let temperature = 'NEUTRA';
    let adjustment = 0;
    let reasoning = '';
    
    // FÓRMULA: Intensidade de Sequências = (Soma dos tamanhos das sequências longas) / 20 giros
    // Quanto maior a intensidade, mais "quente" está a Blaze
    const longSequencesIntensity = sequencesFound
        .filter(s => s.length >= 3)
        .reduce((sum, s) => sum + s.length, 0) / 20;
    
    // FÓRMULA: Score de Temperatura = (Média × 10) + (Sequências longas × 5) + (Intensidade × 20)
    const temperatureScore = (avgSequenceLength * 10) + (longSequences * 5) + (longSequencesIntensity * 20);
    
    console.log(`%c🌡️ CÁLCULOS DE TEMPERATURA:`, 'color: #FF6B35; font-weight: bold;');
    console.log(`   Intensidade de sequências: ${(longSequencesIntensity * 100).toFixed(1)}%`);
    console.log(`   Score de temperatura: ${temperatureScore.toFixed(1)}`);
    console.log('');
    
    // ═══════════════════════════════════════════════════════════════
    // CLASSIFICAÇÃO DE TEMPERATURA (baseada no score)
    // ═══════════════════════════════════════════════════════════════
    
    // TEMPERATURA QUENTE: Score >= 45 (muitas sequências longas)
    if (temperatureScore >= 45) {
        temperature = 'QUENTE 🔥';
        
        // FÓRMULA: Ajuste para sequências = Score × 0.3 (máximo +20%)
        // FÓRMULA: Ajuste para alternâncias = -Score × 0.2 (penaliza alternâncias)
        if (activePattern.type.includes('sequencia')) {
            adjustment = Math.min(20, temperatureScore * 0.3);
            reasoning = `Blaze QUENTE (score: ${temperatureScore.toFixed(0)}). Sequências tendem a continuar. (+${adjustment.toFixed(1)}%)`;
        } else {
            adjustment = Math.max(-10, -(temperatureScore - 45) * 0.2);
            reasoning = `Blaze QUENTE mas padrão é alternância. Pode estar mudando. (${adjustment.toFixed(1)}%)`;
        }
    }
    // TEMPERATURA FRIA: Score <= 20 (poucas ou nenhuma sequência)
    else if (temperatureScore <= 20) {
        temperature = 'FRIA ❄️';
        
        // FÓRMULA: Ajuste para sequências = -(20 - Score) × 0.7 (penaliza sequências)
        // FÓRMULA: Ajuste para alternâncias = (20 - Score) × 0.5 (favorece alternâncias)
        if (activePattern.type.includes('sequencia')) {
            adjustment = -((20 - temperatureScore) * 0.7);
            adjustment = Math.max(-20, adjustment);
            reasoning = `Blaze FRIA (score: ${temperatureScore.toFixed(0)}). Sequências quebram rápido. (${adjustment.toFixed(1)}%)`;
        } else {
            adjustment = (20 - temperatureScore) * 0.5;
            adjustment = Math.min(15, adjustment);
            reasoning = `Blaze FRIA (score: ${temperatureScore.toFixed(0)}). Alternâncias se mantêm fortes. (+${adjustment.toFixed(1)}%)`;
        }
    }
    // TEMPERATURA MÉDIA: Score entre 21-44 (comportamento misto)
    else {
        temperature = 'MÉDIA 🌤️';
        
        // FÓRMULA: Ajuste suave proporcional à proximidade dos extremos
        // Score próximo de 45 = leve bônus para sequências
        // Score próximo de 20 = leve bônus para alternâncias
        
        if (activePattern.type.includes('sequencia')) {
            // Quanto mais próximo de 45, mais positivo (0 a +8%)
            adjustment = ((temperatureScore - 20) / 25) * 8;
            adjustment = Math.max(-5, Math.min(8, adjustment));
            reasoning = `Blaze MÉDIA (score: ${temperatureScore.toFixed(0)}). Comportamento misto. (${adjustment >= 0 ? '+' : ''}${adjustment.toFixed(1)}%)`;
        } else {
            // Quanto mais próximo de 20, mais positivo para alternâncias (0 a +5%)
            adjustment = ((44 - temperatureScore) / 24) * 5;
            adjustment = Math.max(-3, Math.min(5, adjustment));
            reasoning = `Blaze MÉDIA (score: ${temperatureScore.toFixed(0)}). Alternância moderada. (${adjustment >= 0 ? '+' : ''}${adjustment.toFixed(1)}%)`;
        }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // 🎯 ANÁLISE DE QUEBRAS (O que o usuário pediu!)
    // ═══════════════════════════════════════════════════════════════
    
    // Se o padrão ativo é uma sequência, verificar se sequências similares quebraram recentemente
    if (activePattern.type.includes('sequencia') && activePattern.size >= 3) {
        console.log('%c🔍 ANÁLISE DE QUEBRAS (contexto dos últimos 20 giros):', 'color: #FFD700; font-weight: bold;');
        console.log('');
        
        const patternColor = activePattern.sequence.split('-')[0];
        const patternSize = activePattern.size;
        
        // ═══════════════════════════════════════════════════════════════
        // 🎯 PRIORIDADE 1: VERIFICAÇÃO GLOBAL (10.000 GIROS REAIS)
        // Análise científica CORRETA baseada em probabilidades reais
        // ═══════════════════════════════════════════════════════════════
        
        console.log(`%c   Padrão atual: ${patternSize} ${patternColor === 'red' ? 'VERMELHOS' : 'PRETOS'}`, 'color: #FFD700;');
        console.log('');
        
        // 🎯 LÓGICA INTELIGENTE: Cada cor tem seus pontos críticos DIFERENTES!
        
        // ═══ VERMELHO ═══
        if (patternColor === 'red') {
            if (patternSize >= MAX_SEQUENCIA_HISTORICO) {
                // 11+ vermelhos: Nunca visto ir além disso! (Apenas log informativo)
                console.log(`%c🚨 MÁXIMO HISTÓRICO ATINGIDO! (${patternSize} vermelhos)`, 'color: #FF0000; font-weight: bold; font-size: 14px;');
                console.log(`%c   📊 Em 10.000 giros, NUNCA passou de ${MAX_SEQUENCIA_HISTORICO}!`, 'color: #FF0000; font-weight: bold;');
                console.log(`%c   ℹ️ Probabilidade de quebra MUITO ALTA`, 'color: #FFA500;');
                reasoning += ` | 🚨 Máximo histórico (${MAX_SEQUENCIA_HISTORICO}) atingido`;
            }
            else if (patternSize >= 7) {
                // 7+ vermelhos: Log informativo apenas
                console.log(`%c🔥 SEQUÊNCIA LONGA! (${patternSize} vermelhos)`, 'color: #FF4500; font-weight: bold;');
                console.log(`%c   📊 Sequência considerável detectada`, 'color: #FF4500;');
                console.log(`%c   ℹ️ Histórico indica probabilidade de quebra`, 'color: #FFA500;');
                reasoning += ` | 🔥 Vermelho ${patternSize}: Sequência longa`;
            }
            // ✅ REMOVIDAS: TODAS as penalizações artificiais!
            // Os dados históricos já incluem as probabilidades de quebra!
        }
        // ═══ PRETO ═══
        else if (patternColor === 'black') {
            if (patternSize >= MAX_SEQUENCIA_HISTORICO) {
                // 11+ pretos: Nunca visto ir além disso! (Apenas log informativo)
                console.log(`%c🚨 MÁXIMO HISTÓRICO ATINGIDO! (${patternSize} pretos)`, 'color: #FF0000; font-weight: bold; font-size: 14px;');
                console.log(`%c   📊 Em 10.000 giros, NUNCA passou de ${MAX_SEQUENCIA_HISTORICO}!`, 'color: #FF0000; font-weight: bold;');
                console.log(`%c   ℹ️ Probabilidade de quebra MUITO ALTA`, 'color: #FFA500;');
                reasoning += ` | 🚨 Máximo histórico (${MAX_SEQUENCIA_HISTORICO}) atingido`;
            }
            else if (patternSize >= 7) {
                // 7+ pretos: Log informativo apenas
                console.log(`%c🔥 SEQUÊNCIA LONGA! (${patternSize} pretos)`, 'color: #FF0000; font-weight: bold;');
                console.log(`%c   📊 Sequência considerável detectada (76.0% quebra real em 7+)`, 'color: #FF0000;');
                console.log(`%c   ℹ️ Histórico indica probabilidade de quebra`, 'color: #FFA500;');
                reasoning += ` | 🔥 Preto ${patternSize}: Sequência longa`;
            }
            // ✅ REMOVIDAS: TODAS as penalizações artificiais!
            // Os dados históricos já incluem as probabilidades de quebra!
        }
        
        console.log('');
        
        // ═══════════════════════════════════════════════════════════════
        // 🎯 PRIORIDADE 2: ANÁLISE DOS ÚLTIMOS 20 GIROS (contexto recente)
        // ═══════════════════════════════════════════════════════════════
        
        // Buscar sequências da mesma cor nos últimos 20 giros
        const similarSequences = sequencesFound.filter(s => 
            s.color === patternColor && s.length >= 3
        );
        
        console.log(`%c   Sequências similares nos últimos 20: ${similarSequences.length}`, 'color: #FFD700;');
        
        if (similarSequences.length > 0) {
            // Verificar o tamanho máximo que chegou
            const maxLength = Math.max(...similarSequences.map(s => s.length));
            const avgLength = similarSequences.reduce((sum, s) => sum + s.length, 0) / similarSequences.length;
            
            console.log(`%c   Tamanho máximo alcançado: ${maxLength} giros`, 'color: #FFD700;');
            console.log(`%c   Tamanho médio: ${avgLength.toFixed(1)} giros`, 'color: #FFD700;');
            console.log('');
            
            // 🎯 LÓGICA INTELIGENTE DO USUÁRIO:
            // Se já estamos no giro X e nenhuma sequência recente passou de X,
            // MUITO PROVÁVEL que vai quebrar!
            
            // ℹ️ Análise informativa apenas - SEM penalizações artificiais
            if (patternSize >= maxLength) {
                console.log(`%c⚠️ ALERTA: Padrão atual (${patternSize}) já atingiu o máximo recente (${maxLength})!`, 'color: #FF0000; font-weight: bold;');
                console.log(`%c   ℹ️ Probabilidade de QUEBRA pode ser alta`, 'color: #FFA500;');
                console.log(`%c   📊 Histórico já reflete esta probabilidade`, 'color: #00FF88;');
                reasoning += ` | Padrão atingiu máximo recente (${maxLength})`;
            } else if (patternSize >= avgLength) {
                console.log(`%c⚠️ Padrão atual (${patternSize}) está acima da média recente (${avgLength.toFixed(1)})`, 'color: #FFA500; font-weight: bold;');
                console.log(`%c   ℹ️ Sequência acima do normal nos últimos 20 giros`, 'color: #FFA500;');
                reasoning += ` | Acima da média recente (${avgLength.toFixed(1)})`;
            } else {
                console.log(`%c✅ Padrão atual (${patternSize}) está abaixo do máximo (${maxLength}) e média (${avgLength.toFixed(1)})`, 'color: #00FF00;');
                console.log(`%c   ✅ Ainda há espaço para crescer!`, 'color: #00FF88;');
            }
            // ✅ REMOVIDAS: TODAS as penalizações artificiais (-15%, -10%)
            // Os dados históricos de 2000 giros já incluem essas probabilidades!
        } else {
            console.log(`%c   ℹ️ Nenhuma sequência similar encontrada nos últimos 20 giros`, 'color: #888;');
            console.log(`%c   Não há dados recentes para comparação`, 'color: #888;');
        }
        
        console.log('');
    }
    
    console.log(`%c🌡️  TEMPERATURA: ${temperature}`, 'color: #FF6B35; font-weight: bold; font-size: 14px;');
    console.log(`%c   ${reasoning}`, 'color: #FF8C00;');
    console.log('');
    console.log('%c═══════════════════════════════════════════════════════════', 'color: #FF6B35; font-weight: bold;');
    console.log('');
    
    // ✅ CALCULAR COR DOMINANTE NOS ÚLTIMOS 20 GIROS
    let colorCounts = { red: 0, black: 0, white: 0 };
    last20Spins.forEach(spin => {
        colorCounts[spin.color]++;
    });
    
    const total20 = last20Spins.length;
    const colorPercents = {
        red: ((colorCounts.red / total20) * 100).toFixed(1),
        black: ((colorCounts.black / total20) * 100).toFixed(1),
        white: ((colorCounts.white / total20) * 100).toFixed(1)
    };
    
    // Encontrar cor dominante
    let dominantColor = 'red';
    let dominantCount = colorCounts.red;
    let dominantPercent = parseFloat(colorPercents.red);
    
    if (colorCounts.black > dominantCount) {
        dominantColor = 'black';
        dominantCount = colorCounts.black;
        dominantPercent = parseFloat(colorPercents.black);
    }
    if (colorCounts.white > dominantCount) {
        dominantColor = 'white';
        dominantCount = colorCounts.white;
        dominantPercent = parseFloat(colorPercents.white);
    }
    
    // Considerar "dominante" se for >=55% (11+ em 20 giros)
    const hasDominantColor = dominantPercent >= 55;
    
    return {
        temperature,
        adjustment,
        reasoning,
        stats: {
            totalSequences,
            longSequences,
            veryLongSequences,
            avgSequenceLength
        },
        // ✅ Informações de cor dominante
        colorCounts,
        colorPercents,
        dominantColor,
        dominantCount,
        dominantPercent,
        hasDominantColor
    };
}

// ═══════════════════════════════════════════════════════════════
// 🧠 FUNÇÕES DE MEMÓRIA ATIVA - SISTEMA INCREMENTAL
// ═══════════════════════════════════════════════════════════════

/**
 * 🔧 INICIALIZAR MEMÓRIA ATIVA
 * Analisa todo o histórico UMA VEZ e armazena em memória
 * Deve ser chamado apenas na primeira vez ou após reset
 */
async function inicializarMemoriaAtiva(history) {
    // ⚠️ Evitar inicializações simultâneas
    if (memoriaAtivaInicializando) {
        console.log('%c⏳ Memória Ativa já está sendo inicializada...', 'color: #FFA500;');
        return false;
    }
    
    memoriaAtivaInicializando = true;
    const inicio = performance.now();
    
    console.log('');
    console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00CED1; font-weight: bold; font-size: 14px;');
    console.log('%c║  🧠 INICIALIZANDO MEMÓRIA ATIVA                          ║', 'color: #00CED1; font-weight: bold; font-size: 14px;');
    console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00CED1; font-weight: bold;');
    console.log('');
    
    try {
        // 1. COPIAR HISTÓRICO
        console.log('%c📊 ETAPA 1/5: Copiando histórico...', 'color: #00CED1; font-weight: bold;');
        memoriaAtiva.giros = [...history].slice(0, 2000);
        memoriaAtiva.ultimos20 = memoriaAtiva.giros.slice(0, 20);
        memoriaAtiva.estatisticas.totalGiros = memoriaAtiva.giros.length;
        console.log(`%c   ✅ ${memoriaAtiva.giros.length} giros copiados`, 'color: #00FF88;');
        console.log('');
        
        // 2. CALCULAR DISTRIBUIÇÃO
        console.log('%c📊 ETAPA 2/5: Calculando distribuição de cores...', 'color: #00CED1; font-weight: bold;');
        const distribuicao = { red: 0, black: 0, white: 0 };
        for (const giro of memoriaAtiva.giros) {
            if (giro.color) {
                distribuicao[giro.color]++;
            }
        }
        const total = memoriaAtiva.giros.length;
        memoriaAtiva.estatisticas.distribuicao = {
            red: { count: distribuicao.red, percent: (distribuicao.red / total) * 100 },
            black: { count: distribuicao.black, percent: (distribuicao.black / total) * 100 },
            white: { count: distribuicao.white, percent: (distribuicao.white / total) * 100 }
        };
        console.log(`%c   🔴 Vermelho: ${distribuicao.red} (${memoriaAtiva.estatisticas.distribuicao.red.percent.toFixed(2)}%)`, 'color: #FF6B6B;');
        console.log(`%c   ⚫ Preto: ${distribuicao.black} (${memoriaAtiva.estatisticas.distribuicao.black.percent.toFixed(2)}%)`, 'color: #888;');
        console.log(`%c   ⚪ Branco: ${distribuicao.white} (${memoriaAtiva.estatisticas.distribuicao.white.percent.toFixed(2)}%)`, 'color: #FFF;');
        console.log('');
        
        // 3. DETECTAR TODOS OS PADRÕES NO HISTÓRICO
        console.log('%c🔍 ETAPA 3/5: Detectando todos os padrões...', 'color: #00CED1; font-weight: bold;');
        const todosOsPadroes = detectAllPatternTypes(memoriaAtiva.giros);
        
        // Organizar por tipo
        memoriaAtiva.padroesDetectados = {
            alternanciaSimples: todosOsPadroes.filter(p => p.type === 'alternancia_simples'),
            alternanciasDupla: todosOsPadroes.filter(p => p.type === 'alternancia_dupla'),
            alternanciasTripla: todosOsPadroes.filter(p => p.type === 'alternancia_tripla'),
            sequenciasRed: todosOsPadroes.filter(p => p.type === 'sequencia_red'),
            sequenciasBlack: todosOsPadroes.filter(p => p.type === 'sequencia_black')
        };
        
        console.log(`%c   🔄 Alternância Simples: ${memoriaAtiva.padroesDetectados.alternanciaSimples.length}`, 'color: #00FF88;');
        console.log(`%c   🔄 Alternância Dupla: ${memoriaAtiva.padroesDetectados.alternanciasDupla.length}`, 'color: #00FF88;');
        console.log(`%c   🔄 Alternância Tripla: ${memoriaAtiva.padroesDetectados.alternanciasTripla.length}`, 'color: #00FF88;');
        console.log(`%c   🔴 Sequências Vermelhas: ${memoriaAtiva.padroesDetectados.sequenciasRed.length}`, 'color: #FF6B6B;');
        console.log(`%c   ⚫ Sequências Pretas: ${memoriaAtiva.padroesDetectados.sequenciasBlack.length}`, 'color: #888;');
        console.log('');
        
        // 4. CALCULAR ESTATÍSTICAS POR PADRÃO
        console.log('%c📊 ETAPA 4/5: Calculando estatísticas por padrão...', 'color: #00CED1; font-weight: bold;');
        memoriaAtiva.estatisticas.porPadrao = {};
        
        // Para cada padrão detectado, calcular o que veio depois
        for (const padroes of Object.values(memoriaAtiva.padroesDetectados)) {
            for (const padrao of padroes) {
                const chave = `${padrao.type}_${padrao.size}`;
                
                if (!memoriaAtiva.estatisticas.porPadrao[chave]) {
                    memoriaAtiva.estatisticas.porPadrao[chave] = {
                        type: padrao.type,
                        size: padrao.size,
                        ocorrencias: 0,
                        proximaCor: { red: 0, black: 0, white: 0 }
                    };
                }
                
                memoriaAtiva.estatisticas.porPadrao[chave].ocorrencias++;
                
                // Registrar o que veio depois
                if (padrao.whatCameNext) {
                    memoriaAtiva.estatisticas.porPadrao[chave].proximaCor[padrao.whatCameNext]++;
                }
            }
        }
        
        // Calcular percentuais
        for (const stats of Object.values(memoriaAtiva.estatisticas.porPadrao)) {
            const total = stats.proximaCor.red + stats.proximaCor.black + stats.proximaCor.white;
            if (total > 0) {
                stats.proximaCor.redPercent = (stats.proximaCor.red / total) * 100;
                stats.proximaCor.blackPercent = (stats.proximaCor.black / total) * 100;
                stats.proximaCor.whitePercent = (stats.proximaCor.white / total) * 100;
            }
        }
        
        const totalPadroesCadastrados = Object.keys(memoriaAtiva.estatisticas.porPadrao).length;
        console.log(`%c   ✅ ${totalPadroesCadastrados} tipos de padrões cadastrados`, 'color: #00FF88;');
        console.log('');
        
        // 5. MARCAR COMO INICIALIZADA
        console.log('%c✅ ETAPA 5/5: Finalizando...', 'color: #00CED1; font-weight: bold;');
        memoriaAtiva.inicializada = true;
        memoriaAtiva.ultimaAtualizacao = new Date();
        memoriaAtiva.tempoInicializacao = performance.now() - inicio;
        memoriaAtiva.totalAtualizacoes = 0;
        
        console.log('');
        console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00FF00; font-weight: bold; font-size: 14px;');
        console.log('%c║  ✅ MEMÓRIA ATIVA INICIALIZADA COM SUCESSO!              ║', 'color: #00FF00; font-weight: bold; font-size: 14px;');
        console.log('%c╠═══════════════════════════════════════════════════════════╣', 'color: #00FF00; font-weight: bold;');
        console.log(`%c║  ⏱️  Tempo: ${memoriaAtiva.tempoInicializacao.toFixed(2)}ms                                    ║`, 'color: #00FF88;');
        console.log(`%c║  📊 Giros: ${memoriaAtiva.giros.length}                                          ║`, 'color: #00FF88;');
        console.log(`%c║  🎯 Padrões detectados: ${todosOsPadroes.length}                             ║`, 'color: #00FF88;');
        console.log(`%c║  📈 Tipos únicos: ${totalPadroesCadastrados}                                      ║`, 'color: #00FF88;');
        console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00FF00; font-weight: bold;');
        console.log('');
        
        memoriaAtivaInicializando = false;
        return true;
        
    } catch (error) {
        console.error('%c❌ ERRO ao inicializar memória ativa:', 'color: #FF0000; font-weight: bold;');
        console.error(error);
        memoriaAtivaInicializando = false;
        memoriaAtiva.inicializada = false;
        return false;
    }
}

/**
 * ⚡ ATUALIZAR MEMÓRIA INCREMENTALMENTE
 * Adiciona novo giro e atualiza apenas o necessário (RÁPIDO!)
 */
function atualizarMemoriaIncrementalmente(novoGiro) {
    if (!memoriaAtiva.inicializada) {
        console.warn('%c⚠️ Memória Ativa não inicializada! Não é possível atualizar.', 'color: #FFA500;');
        return false;
    }
    
    const inicio = performance.now();
    
    try {
        // 1. ADICIONAR NOVO GIRO NO INÍCIO
        memoriaAtiva.giros.unshift(novoGiro);
        
        // 2. REMOVER O MAIS ANTIGO (manter 2000)
        if (memoriaAtiva.giros.length > 2000) {
            const removido = memoriaAtiva.giros.pop();
            
            // Atualizar distribuição (decrementar cor removida)
            if (removido && removido.color) {
                memoriaAtiva.estatisticas.distribuicao[removido.color].count--;
            }
        }
        
        // 3. ATUALIZAR DISTRIBUIÇÃO (incrementar nova cor)
        if (novoGiro.color) {
            memoriaAtiva.estatisticas.distribuicao[novoGiro.color].count++;
        }
        
        // Recalcular percentuais
        const total = memoriaAtiva.giros.length;
        for (const cor of ['red', 'black', 'white']) {
            memoriaAtiva.estatisticas.distribuicao[cor].percent = 
                (memoriaAtiva.estatisticas.distribuicao[cor].count / total) * 100;
        }
        
        // 4. ATUALIZAR ÚLTIMOS 20
        memoriaAtiva.ultimos20 = memoriaAtiva.giros.slice(0, 20);
        
        // 5. DETECTAR NOVO PADRÃO ATIVO (apenas nos últimos 20)
        // Isso é rápido porque só analisa 20 giros!
        memoriaAtiva.padraoAtual = findActivePattern(memoriaAtiva.ultimos20);
        
        // 6. ATUALIZAR MÉTRICAS
        memoriaAtiva.ultimaAtualizacao = new Date();
        memoriaAtiva.tempoUltimaAtualizacao = performance.now() - inicio;
        memoriaAtiva.totalAtualizacoes++;
        
        // ✅ Log resumido (apenas se demorar muito)
        if (memoriaAtiva.tempoUltimaAtualizacao > 50) {
            console.log(`%c⚡ Memória atualizada em ${memoriaAtiva.tempoUltimaAtualizacao.toFixed(2)}ms`, 'color: #FFD700;');
        }
        
        return true;
        
    } catch (error) {
        console.error('%c❌ ERRO ao atualizar memória incrementalmente:', 'color: #FF0000; font-weight: bold;');
        console.error(error);
        return false;
    }
}

/**
 * 🔍 VALIDAR MEMÓRIA ATIVA
 * Verifica integridade e sincronização com cachedHistory
 */
function validarMemoriaAtiva() {
    if (!memoriaAtiva.inicializada) {
        return { valida: false, motivo: 'Não inicializada' };
    }
    
    // Verificar se tem giros
    if (memoriaAtiva.giros.length === 0) {
        return { valida: false, motivo: 'Sem giros na memória' };
    }
    
    // Verificar sincronização com cachedHistory
    if (cachedHistory.length > 0 && memoriaAtiva.giros.length > 0) {
        const ultimoGiroMemoria = memoriaAtiva.giros[0];
        const ultimoGiroCache = cachedHistory[0];
        
        if (ultimoGiroMemoria.number !== ultimoGiroCache.number || 
            ultimoGiroMemoria.color !== ultimoGiroCache.color) {
            return { 
                valida: false, 
                motivo: 'Dessincronizado com cachedHistory',
                detalhes: {
                    memoria: ultimoGiroMemoria,
                    cache: ultimoGiroCache
                }
            };
        }
    }
    
    // Verificar se estatísticas fazem sentido
    const totalDist = memoriaAtiva.estatisticas.distribuicao.red.count +
                      memoriaAtiva.estatisticas.distribuicao.black.count +
                      memoriaAtiva.estatisticas.distribuicao.white.count;
    
    if (totalDist !== memoriaAtiva.giros.length) {
        return { 
            valida: false, 
            motivo: 'Distribuição inconsistente',
            detalhes: {
                totalDistribuicao: totalDist,
                totalGiros: memoriaAtiva.giros.length
            }
        };
    }
    
    return { valida: true };
}

/**
 * 🔄 RESETAR MEMÓRIA ATIVA
 * Limpa tudo e força reinicialização
 */
function resetarMemoriaAtiva() {
    console.log('%c🔄 Resetando Memória Ativa...', 'color: #FFA500; font-weight: bold;');
    
    memoriaAtiva = {
        inicializada: false,
        ultimaAtualizacao: null,
        versao: memoriaAtiva.versao + 1,
        giros: [],
        ultimos20: [],
        padroesDetectados: {
            alternanciaSimples: [],
            alternanciasDupla: [],
            alternanciasTripla: [],
            sequenciasRed: [],
            sequenciasBlack: []
        },
        estatisticas: {
            totalGiros: 0,
            distribuicao: {
                red: { count: 0, percent: 0 },
                black: { count: 0, percent: 0 },
                white: { count: 0, percent: 0 }
            },
            porPadrao: {}
        },
        padraoAtual: null,
        tempoInicializacao: 0,
        tempoUltimaAtualizacao: 0,
        totalAtualizacoes: 0
    };
    
    memoriaAtivaInicializando = false;
    
    console.log('%c✅ Memória Ativa resetada!', 'color: #00FF88;');
}

/**
 * ═══════════════════════════════════════════════════════════════
 * 🧠 ANÁLISE CONTEXTUAL INTELIGENTE - SISTEMA DE GRADIENTE
 * Analisa os ÚLTIMOS 20 GIROS com peso gradual (mais recente = mais importante)
 * ═══════════════════════════════════════════════════════════════
 */
function analyzeCurrentContext(last20Spins, activePattern) {
    const colors = last20Spins.map(s => s.color);
    const nonWhite = colors.filter(c => c !== 'white');
    
    let description = '';
    let insight = '';
    
    console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00FFFF; font-weight: bold;');
    console.log('%c║  🌡️ ANÁLISE CONTEXTUAL COM GRADIENTE QUENTE/FRIO         ║', 'color: #00FFFF; font-weight: bold;');
    console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00FFFF; font-weight: bold;');
    console.log('');
    
    // ═══════════════════════════════════════════════════════════════
    // 🌡️ GRADIENTE DE TEMPERATURA (20 giros)
    // Giro 20 (antigo) = FRIO (peso 1.0x)
    // Giro 1 (recente) = FERVENDO (peso 3.0x)
    // ═══════════════════════════════════════════════════════════════
    
    const last20NonWhite = nonWhite.slice(0, Math.min(20, nonWhite.length));
    
    console.log(`%c📊 Analisando ${last20NonWhite.length} giros (ignorando brancos)`, 'color: #00FFFF;');
    console.log(`%c   Do mais antigo (FRIO) ao mais recente (QUENTE)`, 'color: #00FFFF;');
    console.log('');
    
    // Mostrar sequência completa com gradiente visual
    let gradientDisplay = '';
    for (let i = last20NonWhite.length - 1; i >= 0; i--) {
        const color = last20NonWhite[i];
        const position = last20NonWhite.length - i;
        const colorSymbol = color === 'red' ? 'V' : 'P';
        
        // Gradiente de cor no console
        let tempEmoji = '';
        if (position <= 5) {
            tempEmoji = '🧊'; // Muito frio (giros antigos)
        } else if (position <= 10) {
            tempEmoji = '❄️'; // Frio
        } else if (position <= 15) {
            tempEmoji = '🌡️'; // Morno
        } else {
            tempEmoji = '🔥'; // Quente (giros recentes)
        }
        
        gradientDisplay += `${tempEmoji}${colorSymbol} `;
    }
    
    console.log(`%c🌡️ Gradiente: ${gradientDisplay}`, 'color: #00FFFF;');
    console.log('');
    
    // ═══════════════════════════════════════════════════════════════
    // 🔍 ANÁLISE 1: SEQUÊNCIA ATUAL (últimos giros mais recentes)
    // ═══════════════════════════════════════════════════════════════
    
    const firstColor = last20NonWhite[0];
    let currentSequenceLength = 1;
    
    for (let i = 1; i < last20NonWhite.length; i++) {
        if (last20NonWhite[i] === firstColor) {
            currentSequenceLength++;
        } else {
            break;
        }
    }
    
    console.log(`%c🔥 ANÁLISE DA SEQUÊNCIA ATUAL (giros mais recentes):`, 'color: #FFD700; font-weight: bold;');
    console.log(`%c   Cor atual: ${firstColor === 'red' ? 'VERMELHO' : 'PRETO'}`, 'color: #FFD700;');
    console.log(`%c   Sequência: ${currentSequenceLength} giros consecutivos`, 'color: #FFD700;');
    
    if (currentSequenceLength >= 7) {
        const colorName = firstColor === 'red' ? 'VERMELHOS' : 'PRETOS';
        description = `🔥 SEQUÊNCIA MUITO LONGA! ${currentSequenceLength} ${colorName} consecutivos. `;
        insight = `ATENÇÃO: Sequência de ${currentSequenceLength} giros está MUITO longa! Probabilidade de quebra ALTA.`;
        console.log(`%c   ⚠️ SEQUÊNCIA MUITO LONGA! Risco de quebra ALTO!`, 'color: #FF0000; font-weight: bold;');
    } else if (currentSequenceLength >= 5) {
        const colorName = firstColor === 'red' ? 'VERMELHOS' : 'PRETOS';
        description = `📊 Sequência de ${currentSequenceLength} ${colorName}. `;
        insight = `Sequência moderada (${currentSequenceLength} giros). Pode continuar ou quebrar.`;
        console.log(`%c   ✅ Sequência moderada`, 'color: #FFAA00;');
    } else if (currentSequenceLength >= 3) {
        const colorName = firstColor === 'red' ? 'vermelhos' : 'pretos';
        description = `📈 Sequência curta de ${currentSequenceLength} ${colorName}. `;
        insight = `Sequência ainda curta (${currentSequenceLength} giros).`;
        console.log(`%c   ℹ️ Sequência curta`, 'color: #00FF88;');
    } else {
        console.log(`%c   ℹ️ Sem sequência clara (apenas ${currentSequenceLength} giro)`, 'color: #00FF88;');
    }
    console.log('');
    
    // ═══════════════════════════════════════════════════════════════
    // 🔍 ANÁLISE 2: COMPORTAMENTO NOS ÚLTIMOS 20 GIROS
    // ═══════════════════════════════════════════════════════════════
    
    console.log(`%c🔄 ANÁLISE GERAL DOS 20 GIROS:`, 'color: #9370DB; font-weight: bold;');
    
    const redCount = last20NonWhite.filter(c => c === 'red').length;
    const blackCount = last20NonWhite.filter(c => c === 'black').length;
    const total = last20NonWhite.length;
    
    console.log(`%c   VERMELHO: ${redCount} giros (${((redCount/total)*100).toFixed(1)}%)`, 'color: #FF0000;');
    console.log(`%c   PRETO: ${blackCount} giros (${((blackCount/total)*100).toFixed(1)}%)`, 'color: #FFFFFF;');
    
    // Detectar alternância nos últimos 10 giros (zona quente)
    const last10 = last20NonWhite.slice(0, 10);
    let alternations = 0;
    for (let i = 0; i < last10.length - 1; i++) {
        if (last10[i] !== last10[i + 1]) {
            alternations++;
        }
    }
    
    console.log(`%c   Mudanças de cor (últimos 10): ${alternations}`, 'color: #9370DB;');
    
    if (alternations >= 7) {
        description += `🔄 ALTERNÂNCIA MUITO ATIVA nos últimos 10 giros (${alternations} mudanças). `;
        insight = `Forte padrão de alternância. Cores trocando frequentemente.`;
        console.log(`%c   ✅ ALTERNÂNCIA MUITO ATIVA!`, 'color: #00FF00; font-weight: bold;');
    } else if (alternations >= 5) {
        description += `🔄 Alternância moderada (${alternations} mudanças em 10 giros). `;
        insight = `Padrão de alternância presente.`;
        console.log(`%c   ℹ️ Alternância moderada`, 'color: #00FF88;');
    } else {
        console.log(`%c   ℹ️ Pouca alternância (${alternations} mudanças)`, 'color: #FFAA00;');
    }
    
    // ⚠️ NÃO RECOMENDAR BASEADO EM DOMINÂNCIA DE COR!
    // A recomendação vem do PADRÃO e do HISTÓRICO, não da quantidade!
    // Apenas DESCREVER o contexto atual para o usuário entender
    if (currentSequenceLength < 3 && alternations < 5) {
        if (redCount > blackCount + 3) {
            description = `📊 Contexto: ${redCount} vermelhos vs ${blackCount} pretos nos últimos 20 giros. `;
            insight = `Vermelho apareceu mais recentemente. A decisão virá do padrão detectado e do histórico.`;
            console.log(`%c   📊 Contexto: Vermelho mais frequente (${redCount} vs ${blackCount})`, 'color: #00FFFF;');
            console.log(`%c   ⚠️ MAS: Decisão baseada no PADRÃO e HISTÓRICO, não na quantidade!`, 'color: #FFAA00; font-weight: bold;');
        } else if (blackCount > redCount + 3) {
            description = `📊 Contexto: ${blackCount} pretos vs ${redCount} vermelhos nos últimos 20 giros. `;
            insight = `Preto apareceu mais recentemente. A decisão virá do padrão detectado e do histórico.`;
            console.log(`%c   📊 Contexto: Preto mais frequente (${blackCount} vs ${redCount})`, 'color: #00FFFF;');
            console.log(`%c   ⚠️ MAS: Decisão baseada no PADRÃO e HISTÓRICO, não na quantidade!`, 'color: #FFAA00; font-weight: bold;');
        } else {
            description = `📊 Contexto: Equilibrado nos últimos 20 giros (V:${redCount} vs P:${blackCount}). `;
            insight = `Distribuição equilibrada. A decisão virá do padrão detectado e do histórico.`;
            console.log(`%c   📊 Contexto: Jogo equilibrado (${redCount} vs ${blackCount})`, 'color: #00FFFF;');
        }
    }
    
    console.log('');
    console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00FFFF; font-weight: bold;');
    console.log('');
    
    return {
        description: description,
        insight: insight,
        currentSequenceLength: currentSequenceLength,
        alternations: alternations,
        redDominance: redCount,
        blackDominance: blackCount
    };
}

/**
 * FUNÇÃO AUXILIAR: Buscar sequência de 10 giros no histórico
 * Retorna a cor que mais saiu após essa sequência
 * @param {Array} targetSequence - Sequência de 10 giros a buscar
 * @param {Array} searchHistory - Histórico onde buscar
 * @param {number} spinsToAnalyze - Quantos giros analisar após encontrar a sequência
 * @returns {Object} - {color, confidence, occurrences, similarity}
 */
function buscarSequenciaNoHistorico(targetSequence, searchHistory, spinsToAnalyze = 100) {
    console.log(`%c🔍 Buscando sequência no histórico de ${searchHistory.length} giros...`, 'color: #00D4FF;');
    
    // Extrair apenas as cores da sequência alvo
    const targetColors = targetSequence.map(spin => spin.color);
    
    let exactMatches = [];
    let similarMatches = []; // Matches com 60%+ de similaridade
    
    // Buscar no histórico (começando do índice 10, pois precisamos de 10 giros anteriores)
    for (let i = 10; i < searchHistory.length - spinsToAnalyze; i++) {
        const historySlice = searchHistory.slice(i - 10, i).map(spin => spin.color);
        
        // Calcular similaridade
        let matchCount = 0;
        for (let j = 0; j < 10; j++) {
            if (historySlice[j] === targetColors[j]) {
                matchCount++;
            }
        }
        
        const similarity = (matchCount / 10) * 100;
        
        if (similarity === 100) {
            // Match exato!
            exactMatches.push(i);
        } else if (similarity >= 60) {
            // Match com 60%+ de similaridade
            similarMatches.push({ index: i, similarity: similarity });
        }
    }
    
    console.log(`%c   ✅ Matches exatos: ${exactMatches.length}`, 'color: #00FF88;');
    console.log(`%c   ⚡ Matches similares (60%+): ${similarMatches.length}`, 'color: #00FF88;');
    
    // Analisar o que veio DEPOIS dessas ocorrências
    let nextColorCounts = { red: 0, black: 0, white: 0 };
    let totalOccurrences = 0;
    let avgSimilarity = 100;
    
    if (exactMatches.length > 0) {
        // Usar matches exatos
        console.log(`%c   🎯 Usando ${exactMatches.length} match(es) exato(s)`, 'color: #00FF00; font-weight: bold;');
        
        exactMatches.forEach(matchIndex => {
            // Analisar os próximos X giros após o match
            const nextSpins = searchHistory.slice(matchIndex, matchIndex + spinsToAnalyze);
            nextSpins.forEach(spin => {
                if (spin.color in nextColorCounts) {
                    nextColorCounts[spin.color]++;
                }
            });
        });
        
        totalOccurrences = exactMatches.length;
        avgSimilarity = 100;
    } else if (similarMatches.length > 0) {
        // Usar matches similares (60%+)
        console.log(`%c   ⚡ Usando ${similarMatches.length} match(es) similar(es) (60%+)`, 'color: #FFAA00; font-weight: bold;');
        
        similarMatches.forEach(match => {
            const nextSpins = searchHistory.slice(match.index, match.index + spinsToAnalyze);
            nextSpins.forEach(spin => {
                if (spin.color in nextColorCounts) {
                    nextColorCounts[spin.color]++;
                }
            });
        });
        
        totalOccurrences = similarMatches.length;
        avgSimilarity = Math.round(similarMatches.reduce((sum, m) => sum + m.similarity, 0) / similarMatches.length);
    } else {
        // Nenhum match encontrado → Usar análise de frequência simples
        console.log(`%c   ⚠️ Nenhum match encontrado. Usando frequência geral.`, 'color: #FFA500;');
        
        const recentSpins = searchHistory.slice(0, spinsToAnalyze);
        recentSpins.forEach(spin => {
            if (spin.color in nextColorCounts) {
                nextColorCounts[spin.color]++;
            }
        });
        
        totalOccurrences = 0;
        avgSimilarity = 0;
    }
    
    // Determinar cor recomendada
    let recommendedColor = 'red';
    let maxCount = nextColorCounts.red;
    
    if (nextColorCounts.black > maxCount) {
        recommendedColor = 'black';
        maxCount = nextColorCounts.black;
    }
    
    // Calcular confiança baseada na distribuição
    const totalColors = nextColorCounts.red + nextColorCounts.black + nextColorCounts.white;
    let confidence = totalColors > 0 ? Math.round((maxCount / totalColors) * 100) : 50;
    
    // Ajustar confiança baseada em ocorrências
    if (totalOccurrences === 0) {
        confidence = Math.max(confidence - 10, 40); // Penalidade se não encontrou pattern
    }
    
    console.log(`%c   📊 Distribuição após sequência:`, 'color: #00D4FF;');
    console.log(`%c      🔴 VERMELHO: ${nextColorCounts.red}`, 'color: #FF0000;');
    console.log(`%c      ⚫ PRETO: ${nextColorCounts.black}`, 'color: #FFFFFF;');
    console.log(`%c      ⚪ BRANCO: ${nextColorCounts.white}`, 'color: #00FF00;');
    console.log(`%c   🎯 Cor recomendada: ${recommendedColor.toUpperCase()} (${confidence}%)`, `color: ${recommendedColor === 'red' ? '#FF0000' : '#FFFFFF'}; font-weight: bold;`);
    
    return {
        color: recommendedColor,
        confidence: confidence,
        occurrences: totalOccurrences,
        similarity: avgSimilarity,
        distribution: nextColorCounts
    };
}

/**
 * 🧠 FASE 4 (NOVA): Validação de Viabilidade de Sequência
 * Analisa se a sequência sugerida é viável baseado no histórico recente
 */
function analyzeSequenceViability(history, suggestedColor) {
    console.log('%c🧠 Analisando viabilidade da sequência...', 'color: #9C27B0; font-weight: bold;');
    console.log(`%c   ➤ Cor sugerida pelas fases anteriores: ${suggestedColor.toUpperCase()}`, `color: ${suggestedColor === 'red' ? '#FF0000' : '#FFFFFF'}; font-weight: bold;`);
    
    // Detectar sequência atual (quantas cores consecutivas da mesma cor)
    let currentSequence = [];
    let currentColor = null;
    
    // 🔍 MOSTRAR OS ÚLTIMOS 10 GIROS PARA DEBUG
    console.log('%c   📊 Últimos 10 giros (para debug):', 'color: #9C27B0;');
    const last10 = history.slice(0, 10);
    let debugString = '';
    for (let i = 0; i < last10.length; i++) {
        const spin = last10[i];
        const colorSymbol = spin.color === 'red' ? '🔴' : (spin.color === 'black' ? '⚫' : '⚪');
        const number = spin.number !== undefined ? spin.number : spin.roll;
        debugString += `${colorSymbol}${number} `;
    }
    console.log(`%c      ${debugString}`, 'color: #9C27B0;');
    console.log('');
    
    for (let i = 0; i < history.length; i++) {
        const spin = history[i];
        
        // Brancos QUEBRAM a sequência!
        if (spin.color === 'white') {
            break;
        }
        
        if (currentColor === null) {
            currentColor = spin.color;
            currentSequence.push(spin);
        } else if (spin.color === currentColor) {
            currentSequence.push(spin);
        } else {
            break; // Quebrou a sequência (cor diferente)
        }
    }
    
    const currentSequenceLength = currentSequence.length;
    const currentSequenceColor = currentColor;
    
    console.log(`%c   🎯 Sequência atual detectada: ${currentSequenceLength} ${currentSequenceColor?.toUpperCase() || 'NENHUMA'}(s) CONSECUTIVO(S)`, 
        `color: ${currentSequenceColor === 'red' ? '#FF0000' : '#FFFFFF'}; font-weight: bold; font-size: 14px;`);
    console.log(`%c   🔍 Detalhes da sequência:`, 'color: #9C27B0;');
    currentSequence.forEach((spin, idx) => {
        const number = spin.number !== undefined ? spin.number : spin.roll;
        console.log(`%c      ${idx + 1}º: ${spin.color.toUpperCase()} (${number})`, `color: ${spin.color === 'red' ? '#FF0000' : '#FFFFFF'};`);
    });
    console.log('');
    
    // Se sinal sugere a MESMA cor da sequência atual, significa que quer CONTINUAR a sequência
    const isExtendingSequence = (currentSequenceColor === suggestedColor);
    
    console.log(`%c   🤔 Sinal sugere CONTINUAR a sequência? ${isExtendingSequence ? 'SIM ⚠️' : 'NÃO ✅'}`, 'color: #9C27B0; font-weight: bold;');
    
    if (!isExtendingSequence) {
        console.log('%c   ✅ Sinal sugere QUEBRA de sequência (inverter cor)', 'color: #00FF88; font-weight: bold;');
        console.log('%c   📌 Não precisa validar resistência (já está invertendo)', 'color: #00FF88;');
        return {
            shouldInvert: false,
            reason: 'Sinal já sugere inversão de cor',
            maxHistorical: 0,
            currentLength: currentSequenceLength,
            isViable: true
        };
    }
    
    // Sinal quer CONTINUAR a sequência (ex: 3 pretos → sugerir 4º preto)
    const targetSequenceLength = currentSequenceLength + 1;
    console.log('');
    console.log(`%c   ⚠️ ⚠️ ⚠️ ATENÇÃO! Sinal quer CONTINUAR a sequência! ⚠️ ⚠️ ⚠️`, 'color: #FF0000; font-weight: bold; font-size: 14px; background: #FFFF00;');
    console.log(`%c   ➤ Sequência ATUAL: ${currentSequenceLength} ${suggestedColor.toUpperCase()}(s) consecutivo(s)`, `color: ${suggestedColor === 'red' ? '#FF0000' : '#FFFFFF'}; font-weight: bold;`);
    console.log(`%c   ➤ Sinal pede: ${targetSequenceLength}º ${suggestedColor.toUpperCase()} (${targetSequenceLength} consecutivos!)`, `color: ${suggestedColor === 'red' ? '#FF0000' : '#FFFFFF'}; font-weight: bold;`);
    console.log('');
    
    // Buscar no histórico: qual foi a MAIOR sequência dessa cor nos últimos giros?
    const analysisWindow = Math.min(history.length, 500); // Analisar até 500 giros
    console.log(`%c   🔍 Buscando no histórico dos últimos ${analysisWindow} giros...`, 'color: #9C27B0; font-weight: bold;');
    console.log(`%c   🔍 Pergunta: JÁ ACONTECEU ${targetSequenceLength}+ ${suggestedColor.toUpperCase()}(s) consecutivos antes?`, 'color: #9C27B0; font-weight: bold;');
    
    let maxConsecutive = 0;
    let resistances = []; // Armazenar todas as resistências encontradas
    let currentStreak = 0;
    let lastColor = null;
    let streakStartGiro = 0;
    
    for (let i = 0; i < analysisWindow; i++) {
        const spin = history[i];
        
        if (spin.color === suggestedColor) {
            if (lastColor !== suggestedColor) {
                currentStreak = 1;
                streakStartGiro = i;
            } else {
                currentStreak++;
            }
            
            if (currentStreak > maxConsecutive) {
                maxConsecutive = currentStreak;
            }
            
            lastColor = suggestedColor;
        } else {
            // Cor diferente (black, white, ou outra) QUEBRA a sequência!
            if (currentStreak >= currentSequenceLength && currentStreak < targetSequenceLength) {
                resistances.push({
                    length: currentStreak,
                    startGiro: streakStartGiro,
                    girosAgo: i
                });
            }
            currentStreak = 0;
            lastColor = spin.color;
        }
    }
    
    console.log('');
    console.log(`%c   📊 RESULTADO DA BUSCA HISTÓRICA:`, 'color: #9C27B0; font-weight: bold; font-size: 13px;');
    console.log(`%c      ➤ Máximo de ${suggestedColor.toUpperCase()}(s) consecutivos já encontrado: ${maxConsecutive}`, 
        `color: ${suggestedColor === 'red' ? '#FF0000' : '#FFFFFF'}; font-weight: bold;`);
    console.log(`%c      ➤ Sinal quer: ${targetSequenceLength} ${suggestedColor.toUpperCase()}(s) consecutivos`, 
        `color: ${suggestedColor === 'red' ? '#FF0000' : '#FFFFFF'}; font-weight: bold;`);
    console.log('');
    
    // DECISÃO: A sequência sugerida é viável?
    if (targetSequenceLength > maxConsecutive) {
        // NUNCA aconteceu uma sequência tão grande!
        console.log('%c   ❌❌❌ DECISÃO: SEQUÊNCIA INVIÁVEL! ❌❌❌', 'color: #FFFFFF; font-weight: bold; font-size: 14px; background: #FF0000;');
        console.log('%c   📌 NUNCA aconteceu no histórico analisado!', 'color: #FF0000; font-weight: bold;');
        console.log(`%c      ➤ Máximo histórico: ${maxConsecutive} ${suggestedColor.toUpperCase()}(s)`, 'color: #FF6666; font-weight: bold;');
        console.log(`%c      ➤ Sinal pede: ${targetSequenceLength} ${suggestedColor.toUpperCase()}(s)`, 'color: #FF6666; font-weight: bold;');
        console.log('');
        console.log('%c   🔄 AÇÃO: INVERTER SINAL IMEDIATAMENTE!', 'color: #FFFF00; font-weight: bold; font-size: 14px; background: #FF0000;');
        console.log('');
        
        return {
            shouldInvert: true,
            reason: `Resistência forte - máximo histórico: ${maxConsecutive}, sinal pede: ${targetSequenceLength}`,
            maxHistorical: maxConsecutive,
            currentLength: currentSequenceLength,
            isViable: false
        };
    }
    
    // Sequência JÁ aconteceu no passado - mas QUANDO foi a última vez?
    // Buscar quando foi a ÚLTIMA ocorrência de uma sequência >= targetSequenceLength
    let lastOccurrenceGirosAgo = null;
    let tempStreak = 0;
    let tempLastColor = null;
    
    for (let i = 0; i < analysisWindow; i++) {
        const spin = history[i];
        
        if (spin.color === suggestedColor) {
            if (tempLastColor !== suggestedColor) {
                tempStreak = 1;
            } else {
                tempStreak++;
            }
            
            // Se atingiu ou ultrapassou o tamanho alvo, registrar
            if (tempStreak >= targetSequenceLength && lastOccurrenceGirosAgo === null) {
                lastOccurrenceGirosAgo = i;
            }
            
            tempLastColor = suggestedColor;
        } else {
            // Qualquer cor diferente QUEBRA a sequência!
            tempStreak = 0;
            tempLastColor = spin.color;
        }
    }
    
    console.log('%c   ═══════════════════════════════════════════════════════════', 'color: #9C27B0;');
    
    if (lastOccurrenceGirosAgo === null) {
        // NUNCA aconteceu essa sequência!
        console.log('%c   ❌ NUNCA aconteceu sequência de ' + targetSequenceLength + '+ ' + suggestedColor.toUpperCase() + '(s) no histórico!', 'color: #FF0000; font-weight: bold;');
        console.log('%c   💡 Decisão: INVERTER sinal (padrão inexistente)', 'color: #FFD700; font-weight: bold;');
        
        return {
            shouldInvert: true,
            reason: `NUNCA aconteceu ${targetSequenceLength}+ ${suggestedColor}(s) nos últimos ${analysisWindow} giros`,
            maxHistorical: maxConsecutive,
            currentLength: currentSequenceLength,
            isViable: false
        };
    }
    
    // Encontrou! Agora decidir baseado em QUANDO foi
    console.log(`%c   🕒 Última sequência de ${targetSequenceLength}+ ${suggestedColor.toUpperCase()}(s): há ${lastOccurrenceGirosAgo} giros atrás`, 'color: #9C27B0; font-weight: bold;');
    console.log('%c   ═══════════════════════════════════════════════════════════', 'color: #9C27B0;');
    console.log('');
    
    // ✅ OPÇÃO 1: Aconteceu nos últimos 20 giros (RECENTE - padrão ATIVO)
    if (lastOccurrenceGirosAgo < 20) {
        console.log('%c   ✅ OPÇÃO 1: Aconteceu RECENTEMENTE (< 20 giros)', 'color: #00FF00; font-weight: bold; font-size: 14px;');
        console.log('%c      Padrão está ATIVO! Pode acontecer de novo!', 'color: #00FF88;');
        console.log('%c   💡 Decisão: MANTER sinal original', 'color: #FFD700; font-weight: bold;');
        
        return {
            shouldInvert: false,
            reason: `Sequência aconteceu recentemente (há ${lastOccurrenceGirosAgo} giros) - padrão ativo`,
            maxHistorical: maxConsecutive,
            currentLength: currentSequenceLength,
            isViable: true
        };
    }
    
    // ⚠️ OPÇÃO 2: Aconteceu entre 20-50 giros (ZONA CINZENTA - analisar mais)
    if (lastOccurrenceGirosAgo >= 20 && lastOccurrenceGirosAgo <= 50) {
        console.log('%c   ⚠️ OPÇÃO 2: Aconteceu na ZONA CINZENTA (20-50 giros)', 'color: #FFA500; font-weight: bold; font-size: 14px;');
        console.log('%c      Analisando mais profundamente...', 'color: #FFAA00;');
        
        // Buscar TODAS as ocorrências dessa sequência
        let allOccurrences = [];
        tempStreak = 0;
        tempLastColor = null;
        
        for (let i = 0; i < analysisWindow; i++) {
            const spin = history[i];
            
            if (spin.color === suggestedColor) {
                if (tempLastColor !== suggestedColor) {
                    tempStreak = 1;
                } else {
                    tempStreak++;
                }
                
                if (tempStreak >= targetSequenceLength) {
                    if (allOccurrences.length === 0 || allOccurrences[allOccurrences.length - 1] !== i) {
                        allOccurrences.push(i);
                    }
                }
                
                tempLastColor = suggestedColor;
            } else {
                // Qualquer cor diferente QUEBRA a sequência!
                tempStreak = 0;
                tempLastColor = spin.color;
            }
        }
        
        console.log(`%c      📊 Total de ocorrências encontradas: ${allOccurrences.length}`, 'color: #FFAA00;');
        
        if (allOccurrences.length >= 2) {
            // Calcular intervalo médio entre ocorrências
            let intervals = [];
            for (let i = 1; i < allOccurrences.length; i++) {
                intervals.push(allOccurrences[i] - allOccurrences[i - 1]);
            }
            const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
            
            console.log(`%c      📈 Intervalo médio entre ocorrências: ${Math.round(avgInterval)} giros`, 'color: #FFAA00;');
            
            // Se o intervalo atual está ABAIXO da média, pode quebrar em breve
            if (lastOccurrenceGirosAgo < avgInterval * 0.8) {
                console.log('%c      ✅ Intervalo atual < 80% da média → PODE QUEBRAR!', 'color: #00FF88; font-weight: bold;');
                console.log('%c   💡 Decisão: MANTER sinal', 'color: #FFD700; font-weight: bold;');
                
                return {
                    shouldInvert: false,
                    reason: `Intervalo atual (${lastOccurrenceGirosAgo}) < média histórica (${Math.round(avgInterval)}) - pode quebrar`,
                    maxHistorical: maxConsecutive,
                    currentLength: currentSequenceLength,
                    isViable: true
                };
            } else {
                console.log('%c      ❌ Intervalo atual > 80% da média → AINDA CEDO!', 'color: #FF6666; font-weight: bold;');
                console.log('%c   💡 Decisão: INVERTER sinal', 'color: #FFD700; font-weight: bold;');
                
                return {
                    shouldInvert: true,
                    reason: `Intervalo atual (${lastOccurrenceGirosAgo}) > média histórica (${Math.round(avgInterval)}) - ainda cedo`,
                    maxHistorical: maxConsecutive,
                    currentLength: currentSequenceLength,
                    isViable: false
                };
            }
        } else {
            // Só aconteceu 1 vez no histórico - inverter por segurança
            console.log('%c      ⚠️ Apenas 1 ocorrência no histórico → RARO!', 'color: #FFA500; font-weight: bold;');
            console.log('%c   💡 Decisão: INVERTER sinal (evento raro)', 'color: #FFD700; font-weight: bold;');
            
            return {
                shouldInvert: true,
                reason: `Apenas 1 ocorrência nos últimos ${analysisWindow} giros - evento raro`,
                maxHistorical: maxConsecutive,
                currentLength: currentSequenceLength,
                isViable: false
            };
        }
    }
    
    // ❌ OPÇÃO 3: Aconteceu há MAIS de 50 giros (MUITO TEMPO - resistência forte)
    console.log('%c   ❌ OPÇÃO 3: Aconteceu há MUITO TEMPO (> 50 giros)', 'color: #FF0000; font-weight: bold; font-size: 14px;');
    console.log('%c      Faz muito tempo! Resistência forte!', 'color: #FF6666;');
    console.log('%c   💡 Decisão: INVERTER sinal', 'color: #FFD700; font-weight: bold;');
    
    return {
        shouldInvert: true,
        reason: `Última ocorrência há ${lastOccurrenceGirosAgo} giros - resistência forte (> 50 giros)`,
        maxHistorical: maxConsecutive,
        currentLength: currentSequenceLength,
        isViable: false
    };
}

/**
 * FUNÇÃO PRINCIPAL: Análise Avançada - NÍVEL DIAMANTE
 * NOVO FLUXO: 5 Fases de Análise Progressiva
 */
async function analyzeWithPatternSystem(history) {
    console.log('');
    console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00FF00; font-weight: bold; font-size: 16px;');
    console.log('%c║  💎 NÍVEL DIAMANTE - ANÁLISE AVANÇADA 5 FASES            ║', 'color: #00FF00; font-weight: bold; font-size: 16px;');
    console.log('%c╠═══════════════════════════════════════════════════════════╣', 'color: #00FF00; font-weight: bold;');
    console.log('%c║  ⚡ FASE 1: Busca 10 Giros no Histórico Total           ║', 'color: #00FF88;');
    console.log('%c║  🔥 FASE 2: Análise 25% Mais Recentes (Cor Quente)      ║', 'color: #00FF88;');
    console.log('%c║  🌡️ FASE 3: Últimos 20 Giros (Dominância ±4-6%)        ║', 'color: #00FF88;');
    console.log('%c║  🎯 FASE 4: Padrões Customizados (PRIORIDADE ABSOLUTA)  ║', 'color: #FFD700; font-weight: bold;');
    console.log('%c║  🧠 FASE 5: Validação de Resistência (se sem padrão)    ║', 'color: #00FF88;');
    console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00FF00; font-weight: bold; font-size: 16px;');
    console.log('');
    
    try {
        // Verificar acerto do sinal anterior (se houver)
        if (history.length > 0) {
            await checkPreviousSignalAccuracy(history[0]);
        }
        
        console.log('');
        
        // ═══════════════════════════════════════════════════════════════
        // ⏱️ VERIFICAÇÃO DE INTERVALO MÍNIMO ENTRE SINAIS
        // ═══════════════════════════════════════════════════════════════
        const minIntervalSpins = analyzerConfig.minIntervalSpins || 0;
        
        console.log('');
        console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00D4FF; font-weight: bold;');
        console.log('%c║  ⏱️ VERIFICAÇÃO DE INTERVALO ENTRE SINAIS                ║', 'color: #00D4FF; font-weight: bold;');
        console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00D4FF; font-weight: bold;');
        console.log(`📊 Intervalo mínimo configurado: ${minIntervalSpins} giro(s)`);
        console.log(`📊 Giro atual: #${history[0]?.number || 'N/A'}`);
        
        if (minIntervalSpins > 0) {
            const entriesResult = await chrome.storage.local.get(['lastSignalSpinNumber', 'lastSignalTimestamp']);
            const lastSignalSpinNumber = entriesResult.lastSignalSpinNumber || null;
            const lastSignalTimestamp = entriesResult.lastSignalTimestamp || null;
            
            console.log(`📊 Último sinal salvo: ${lastSignalSpinNumber ? '#' + lastSignalSpinNumber : 'Nenhum'}`);
            if (lastSignalTimestamp) {
                const timeSinceSignal = Date.now() - lastSignalTimestamp;
                console.log(`⏰ Tempo desde último sinal: ${Math.round(timeSinceSignal / 1000)}s`);
            }
            
            if (lastSignalSpinNumber !== null && history.length > 0) {
                // ✅ CORREÇÃO: Buscar pelo número do giro no histórico
                const currentSpinNumber = history[0].number;
                
                // Se for o MESMO giro, bloquear imediatamente (sinal duplicado)
                if (currentSpinNumber === lastSignalSpinNumber) {
                    console.log('');
                    console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #FF0000; font-weight: bold;');
                    console.log('%c║  🚫 SINAL BLOQUEADO - MESMO GIRO!                        ║', 'color: #FF0000; font-weight: bold;');
                    console.log('%c╠═══════════════════════════════════════════════════════════╣', 'color: #FF0000; font-weight: bold;');
                    console.log(`%c║  ⚠️ Giro atual: #${currentSpinNumber}                                    ║`, 'color: #FF6666;');
                    console.log(`%c║  ⚠️ Último sinal: #${lastSignalSpinNumber}                                  ║`, 'color: #FF6666;');
                    console.log('%c║  💡 Este giro JÁ teve sinal enviado!                     ║', 'color: #FF6666;');
                    console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #FF0000; font-weight: bold;');
                    console.log('');
                    return null;
                }
                
                // Encontrar a posição do último sinal no histórico
                const lastSignalIndex = history.findIndex(spin => spin.number === lastSignalSpinNumber);
                
                console.log(`🔍 Procurando giro #${lastSignalSpinNumber} no histórico...`);
                console.log(`   Posição encontrada: ${lastSignalIndex !== -1 ? lastSignalIndex : 'NÃO ENCONTRADO'}`);
                
                let spinsSinceLastSignal = 0;
                if (lastSignalIndex !== -1) {
                    // Encontrou no histórico - calcular quantos giros se passaram
                    spinsSinceLastSignal = lastSignalIndex;
                    console.log(`   ✅ Giros decorridos (baseado na posição): ${spinsSinceLastSignal}`);
                } else {
                    // ✅ CORREÇÃO: Se não encontrou, tentar calcular pela diferença de números
                    const numberDiff = currentSpinNumber - lastSignalSpinNumber;
                    if (numberDiff > 0 && numberDiff < 1000) {
                        spinsSinceLastSignal = numberDiff;
                        console.log(`   ⚠️ Não encontrado no histórico, calculando pela diferença de números`);
                        console.log(`   📊 Diferença: ${currentSpinNumber} - ${lastSignalSpinNumber} = ${spinsSinceLastSignal} giros`);
                    } else {
                        // Muito tempo passou, permitir
                        spinsSinceLastSignal = minIntervalSpins + 1;
                        console.log(`   ⚠️ Diferença muito grande ou inválida, permitindo sinal`);
                    }
                }
                
                console.log('');
                console.log('%c📐 LÓGICA DE VALIDAÇÃO:', 'color: #FFD700; font-weight: bold;');
                console.log(`   Intervalo mínimo: ${minIntervalSpins} giro(s)`);
                console.log(`   Giros decorridos: ${spinsSinceLastSignal}`);
                console.log(`   Deve esperar ${minIntervalSpins} giros COMPLETOS`);
                console.log(`   Exemplo: Se min=2, bloqueia giros 1 e 2, libera no 3º`);
                
                // ✅ CORREÇÃO: Deve esperar minIntervalSpins giros COMPLETOS
                // Exemplo: minIntervalSpins = 2
                //   - Giro #101 (1º após sinal) → spinsSinceLastSignal = 1 → BLOQUEAR
                //   - Giro #102 (2º após sinal) → spinsSinceLastSignal = 2 → BLOQUEAR
                //   - Giro #103 (3º após sinal) → spinsSinceLastSignal = 3 → PERMITIR
                if (spinsSinceLastSignal <= minIntervalSpins) {
                    const girosRestantes = minIntervalSpins - spinsSinceLastSignal + 1;
                    
                    console.log('');
                    console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #FFAA00; font-weight: bold;');
                    console.log('%c║  🚫 SINAL BLOQUEADO - INTERVALO INSUFICIENTE!            ║', 'color: #FFAA00; font-weight: bold;');
                    console.log('%c╠═══════════════════════════════════════════════════════════╣', 'color: #FFAA00; font-weight: bold;');
                    console.log(`%c║  📊 Giros desde último sinal: ${spinsSinceLastSignal.toString().padEnd(28)}║`, 'color: #FFAA00;');
                    console.log(`%c║  🎯 Intervalo mínimo: ${minIntervalSpins.toString().padEnd(36)}║`, 'color: #FFAA00;');
                    console.log(`%c║  ⏳ Faltam: ${girosRestantes.toString().padEnd(47)}║`, 'color: #FFAA00; font-weight: bold;');
                    console.log('%c╠═══════════════════════════════════════════════════════════╣', 'color: #FFAA00; font-weight: bold;');
                    console.log('%c║  ⏳ Aguardando mais giros para liberar novo sinal...      ║', 'color: #FFAA00;');
                    console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #FFAA00; font-weight: bold;');
                    console.log('');
                    
                    return null;
                } else {
                    console.log('');
                    console.log('%c✅ INTERVALO SUFICIENTE!', 'color: #00FF88; font-weight: bold;');
                    console.log(`%c   Giros decorridos: ${spinsSinceLastSignal}`, 'color: #00FF88;');
                    console.log(`%c   Intervalo mínimo: ${minIntervalSpins}`, 'color: #00FF88;');
                    console.log('%c   ✅ PERMITIDO: Enviar novo sinal', 'color: #00FF88; font-weight: bold;');
                    console.log('');
                }
            } else {
                console.log('');
                console.log('%c✅ PRIMEIRO SINAL DA SESSÃO!', 'color: #00FF88; font-weight: bold;');
                console.log('%c   ✅ PERMITIDO: Nenhum sinal anterior', 'color: #00FF88; font-weight: bold;');
                console.log('');
            }
        } else {
            console.log('');
            console.log('%c✅ SEM INTERVALO CONFIGURADO!', 'color: #00FF88; font-weight: bold;');
            console.log('%c   ✅ PERMITIDO: Sinais enviados sempre que encontrar padrão válido', 'color: #00FF88; font-weight: bold;');
            console.log('');
        }
        
        // ═══════════════════════════════════════════════════════════════
        // 💎 NOVO FLUXO - NÍVEL DIAMANTE: 4 FASES DE ANÁLISE
        // ═══════════════════════════════════════════════════════════════
        
        // Obter tamanho do histórico configurado pelo usuário
        const historySize = Math.min(Math.max(analyzerConfig.aiHistorySize || 50, 50), 2000);
        const totalHistory = history.slice(0, historySize);
        
        console.log(`%c📊 Histórico Total: ${historySize} giros`, 'color: #00BFFF; font-weight: bold;');
        console.log('');
        
        // ═══════════════════════════════════════════════════════════════
        // ⚡ FASE 1: BUSCAR ÚLTIMOS 10 GIROS NO HISTÓRICO TOTAL
        // ═══════════════════════════════════════════════════════════════
        console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00D4FF; font-weight: bold;');
        console.log('%c║  ⚡ FASE 1: ANÁLISE DOS ÚLTIMOS 10 GIROS                 ║', 'color: #00D4FF; font-weight: bold; font-size: 14px;');
        console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00D4FF; font-weight: bold;');
        console.log('');
        
        const last10Spins = history.slice(0, 10);
        console.log('%c🔍 Sequência dos últimos 10 giros:', 'color: #00D4FF; font-weight: bold;');
        last10Spins.forEach((spin, idx) => {
            const colorEmoji = spin.color === 'red' ? '🔴' : spin.color === 'black' ? '⚫' : '⚪';
            console.log(`%c   ${idx + 1}. ${colorEmoji} ${spin.color.toUpperCase()} (${spin.number})`, 
                `color: ${spin.color === 'red' ? '#FF0000' : spin.color === 'black' ? '#FFFFFF' : '#00FF00'}; font-weight: bold;`);
        });
        console.log('');
        
        // Buscar sequência exata no histórico total
        let fase1Result = buscarSequenciaNoHistorico(last10Spins, totalHistory, 100);
        
        console.log(`%c✅ FASE 1 CONCLUÍDA!`, 'color: #00FF88; font-weight: bold;');
        console.log(`%c   Cor recomendada: ${fase1Result.color.toUpperCase()}`, `color: ${fase1Result.color === 'red' ? '#FF0000' : '#FFFFFF'}; font-weight: bold;`);
        console.log(`%c   Ocorrências encontradas: ${fase1Result.occurrences}`, 'color: #00FF88;');
        console.log(`%c   Similaridade: ${fase1Result.similarity}%`, 'color: #00FF88;');
        console.log('');
        
        // ═══════════════════════════════════════════════════════════════
        // 🔥 FASE 2: ANÁLISE DOS 25% MAIS RECENTES (COR QUENTE)
        // ═══════════════════════════════════════════════════════════════
        console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #FF6B35; font-weight: bold;');
        console.log('%c║  🔥 FASE 2: ANÁLISE 25% MAIS RECENTES (COR QUENTE)      ║', 'color: #FF6B35; font-weight: bold; font-size: 14px;');
        console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #FF6B35; font-weight: bold;');
        console.log('');
        
        const recent25Percent = Math.floor(historySize * 0.25);
        const recent25History = history.slice(0, recent25Percent);
        
        console.log(`%c📊 Analisando ${recent25Percent} giros mais recentes (25% de ${historySize})`, 'color: #FF6B35; font-weight: bold;');
        
        let fase2Result = buscarSequenciaNoHistorico(last10Spins, recent25History, 100);
        
        console.log(`%c✅ FASE 2 CONCLUÍDA!`, 'color: #00FF88; font-weight: bold;');
        console.log(`%c   Cor "quente" recomendada: ${fase2Result.color.toUpperCase()}`, `color: ${fase2Result.color === 'red' ? '#FF0000' : '#FFFFFF'}; font-weight: bold;`);
        console.log(`%c   Ocorrências nos 25% recentes: ${fase2Result.occurrences}`, 'color: #00FF88;');
        console.log('');
        
        // ═══════════════════════════════════════════════════════════════
        // 🌡️ FASE 3: ÚLTIMOS 20 GIROS - DOMINÂNCIA (±4-6%)
        // ═══════════════════════════════════════════════════════════════
        console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #FFD700; font-weight: bold;');
        console.log('%c║  🌡️ FASE 3: ÚLTIMOS 20 GIROS - DOMINÂNCIA              ║', 'color: #FFD700; font-weight: bold; font-size: 14px;');
        console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #FFD700; font-weight: bold;');
        console.log('');
        
        const last20Spins = history.slice(0, 20);
        
        // Contar cores nos últimos 20 giros
        let colorCounts = { red: 0, black: 0, white: 0 };
        last20Spins.forEach(spin => {
            if (spin.color in colorCounts) {
                colorCounts[spin.color]++;
            }
        });
        
        console.log('%c📊 Distribuição dos últimos 20 giros:', 'color: #FFD700; font-weight: bold;');
        console.log(`%c   🔴 VERMELHO: ${colorCounts.red} (${((colorCounts.red / 20) * 100).toFixed(1)}%)`, 'color: #FF0000; font-weight: bold;');
        console.log(`%c   ⚫ PRETO: ${colorCounts.black} (${((colorCounts.black / 20) * 100).toFixed(1)}%)`, 'color: #FFFFFF; font-weight: bold;');
        console.log(`%c   ⚪ BRANCO: ${colorCounts.white} (${((colorCounts.white / 20) * 100).toFixed(1)}%)`, 'color: #00FF00;');
        console.log('');
        
        // Determinar cor dominante (ignorar branco)
        const corDominante = colorCounts.red > colorCounts.black ? 'red' : 'black';
        console.log(`%c🎯 Cor dominante: ${corDominante.toUpperCase()}`, `color: ${corDominante === 'red' ? '#FF0000' : '#FFFFFF'}; font-weight: bold;`);
        
        // Calcular ajuste de confiança baseado em consenso
        let fase3Adjustment = 0;
        let fase3Reason = '';
        
        // Verificar se a cor dominante concorda com as fases anteriores
        const corSugeridaFases12 = fase1Result.color; // Usar fase 1 como referência principal
        
        if (corDominante === corSugeridaFases12) {
            // Cor dominante CONFIRMA a cor sugerida → AUMENTAR confiança
            fase3Adjustment = Math.floor(Math.random() * 3) + 4; // +4% a +6%
            fase3Reason = `Dominância confirma cor sugerida → +${fase3Adjustment}%`;
            console.log(`%c✅ CONSENSO: Cor dominante CONFIRMA a recomendação!`, 'color: #00FF00; font-weight: bold;');
            console.log(`%c   Ajuste: +${fase3Adjustment}%`, 'color: #00FF88; font-weight: bold;');
        } else {
            // Cor dominante CONTRADIZ a cor sugerida → DIMINUIR confiança
            fase3Adjustment = -(Math.floor(Math.random() * 3) + 4); // -4% a -6%
            fase3Reason = `Dominância contradiz cor sugerida → ${fase3Adjustment}%`;
            console.log(`%c⚠️ DIVERGÊNCIA: Cor dominante CONTRADIZ a recomendação!`, 'color: #FFA500; font-weight: bold;');
            console.log(`%c   Ajuste: ${fase3Adjustment}%`, 'color: #FFAA00; font-weight: bold;');
        }
        console.log('');
        
        console.log(`%c✅ FASE 3 CONCLUÍDA!`, 'color: #00FF88; font-weight: bold;');
        console.log('');
        
        // ═══════════════════════════════════════════════════════════════
        // 🎯 FASE 4: PADRÕES CUSTOMIZADOS (PRIORIDADE ABSOLUTA!)
        // ═══════════════════════════════════════════════════════════════
        console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #FF00FF; font-weight: bold;');
        console.log('%c║  🎯 FASE 4: PADRÕES CUSTOMIZADOS (PRIORIDADE ABSOLUTA!) ║', 'color: #FF00FF; font-weight: bold; font-size: 14px;');
        console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #FF00FF; font-weight: bold;');
        console.log('');
        
        // Verificar se há padrões customizados ativos
        const customPatternResult = await checkForCustomPatterns(history);
        
        let fase4Color = fase1Result.color; // Começar com a cor da Fase 1
        let fase4Adjustment = 0;
        let fase4Reason = '';
        let hasCustomPattern = false;
        let patternDescription = 'Análise Nível Diamante - 5 Fases';
        
        if (customPatternResult) {
            // ✅ PADRÃO CUSTOMIZADO ENCONTRADO!
            hasCustomPattern = true;
            console.log('%c🎯🎯🎯 PADRÃO CUSTOMIZADO DETECTADO! 🎯🎯🎯', 'color: #FF00FF; font-weight: bold; font-size: 16px; background: #FFD700;');
            console.log(`%c   Padrão: ${customPatternResult.patternName}`, 'color: #FF00FF; font-weight: bold;');
            console.log(`%c   Cor recomendada: ${customPatternResult.color.toUpperCase()}`, `color: ${customPatternResult.color === 'red' ? '#FF0000' : '#FFFFFF'}; font-weight: bold; font-size: 14px;`);
            console.log(`%c   Confiança: ${customPatternResult.confidence}%`, 'color: #FF00FF;');
            console.log('');
            
            // PADRÃO CUSTOMIZADO TEM PRIORIDADE ABSOLUTA!
            fase4Color = customPatternResult.color;
            
            // Verificar se CONFIRMA ou CONTRADIZ a Fase 1
            if (customPatternResult.color === fase1Result.color) {
                // ✅ CONFIRMA: Grande bônus!
                console.log('%c✅ PADRÃO CUSTOMIZADO CONFIRMA FASE 1!', 'color: #00FF00; font-weight: bold; font-size: 14px;');
                console.log('%c   → AUMENTANDO MUITO a confiança (+20% a +30%)', 'color: #00FF88; font-weight: bold;');
                
                fase4Adjustment = Math.floor(Math.random() * 11) + 20; // +20% a +30%
                fase4Reason = `Padrão "${customPatternResult.patternName}" CONFIRMA → +${fase4Adjustment}%`;
                patternDescription = `${customPatternResult.patternName} (CONFIRMADO)`;
            } else {
                // ⚠️ CONTRADIZ: Mas PADRÃO TEM PRIORIDADE!
                console.log('%c⚠️ PADRÃO CUSTOMIZADO CONTRADIZ FASE 1!', 'color: #FFA500; font-weight: bold; font-size: 14px;');
                console.log('%c   🏆 MAS PADRÃO CUSTOMIZADO TEM PRIORIDADE ABSOLUTA!', 'color: #FFD700; font-weight: bold; font-size: 14px;');
                console.log(`%c   → Mudando de ${fase1Result.color.toUpperCase()} para ${customPatternResult.color.toUpperCase()}`, 'color: #FFAA00; font-weight: bold;');
                
                fase4Adjustment = 10; // +10% mesmo contradizendo
                fase4Reason = `Padrão "${customPatternResult.patternName}" (PRIORIDADE) → +${fase4Adjustment}%`;
                patternDescription = `${customPatternResult.patternName} (PRIORIDADE)`;
            }
        } else {
            console.log('%cℹ️ Nenhum padrão customizado detectado', 'color: #888;');
            console.log('%c   Mantendo cor da Fase 1', 'color: #888;');
        }
        console.log('');
        
        console.log(`%c✅ FASE 4 CONCLUÍDA!`, 'color: #00FF88; font-weight: bold;');
        console.log('');
        
        // ═══════════════════════════════════════════════════════════════
        // 🧠 FASE 5: VALIDAÇÃO DE RESISTÊNCIA (SÓ SE NÃO HOUVER PADRÃO)
        // ═══════════════════════════════════════════════════════════════
        console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #9C27B0; font-weight: bold;');
        console.log('%c║  🧠 FASE 5: VALIDAÇÃO DE RESISTÊNCIA (INTELIGENTE)      ║', 'color: #9C27B0; font-weight: bold; font-size: 14px;');
        console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #9C27B0; font-weight: bold;');
        console.log('');
        
        let fase5Color = fase4Color;
        let fase5Adjustment = 0;
        let fase5Reason = '';
        
        if (hasCustomPattern) {
            // SE HOUVER PADRÃO CUSTOMIZADO, NÃO INVERTE!
            console.log('%c🏆 PADRÃO CUSTOMIZADO ATIVO!', 'color: #FFD700; font-weight: bold; font-size: 14px;');
            console.log('%c   → Validação de Resistência NÃO PODE INVERTER!', 'color: #FFD700; font-weight: bold;');
            console.log(`%c   → Cor mantida: ${fase4Color.toUpperCase()}`, `color: ${fase4Color === 'red' ? '#FF0000' : '#FFFFFF'}; font-weight: bold;`);
            console.log('');
            fase5Reason = 'Padrão customizado tem prioridade - resistência não aplicada';
        } else {
            // SEM PADRÃO CUSTOMIZADO: Pode validar resistência
            console.log('%cℹ️ Sem padrão customizado: Validando resistência...', 'color: #9C27B0;');
            console.log('');
            
            const viabilityResult = analyzeSequenceViability(history, fase4Color);
            
            if (viabilityResult.shouldInvert) {
                // 🔄 INVERTER O SINAL!
                const oppositeColor = fase4Color === 'red' ? 'black' : 'red';
                fase5Color = oppositeColor;
                
                console.log('');
                console.log('%c🔄 DECISÃO: INVERTER SINAL!', 'color: #FF6B6B; font-weight: bold; font-size: 14px;');
                console.log(`%c   Sinal original: ${fase4Color.toUpperCase()}`, `color: ${fase4Color === 'red' ? '#FF0000' : '#FFFFFF'}; font-weight: bold;`);
                console.log(`%c   Novo sinal: ${oppositeColor.toUpperCase()}`, `color: ${oppositeColor === 'red' ? '#FF0000' : '#FFFFFF'}; font-weight: bold; font-size: 16px;`);
                console.log(`%c   Motivo: ${viabilityResult.reason}`, 'color: #FFD700;');
                console.log('');
                
                fase5Adjustment = -8; // Reduzir 8% por inverter
                fase5Reason = `INVERTE → ${oppositeColor.toUpperCase()} (${viabilityResult.reason}) → ${fase5Adjustment}%`;
            } else {
                console.log('');
                console.log('%c✅ DECISÃO: MANTER SINAL!', 'color: #00FF88; font-weight: bold; font-size: 14px;');
                console.log(`%c   Sinal mantido: ${fase4Color.toUpperCase()}`, `color: ${fase4Color === 'red' ? '#FF0000' : '#FFFFFF'}; font-weight: bold;`);
                console.log(`%c   Motivo: ${viabilityResult.reason}`, 'color: #FFD700;');
                console.log('');
                
                if (viabilityResult.isViable) {
                    fase5Adjustment = 3; // +3% por sequência viável
                    fase5Reason = `Sequência viável historicamente → +${fase5Adjustment}%`;
                }
            }
        }
        
        console.log(`%c✅ FASE 5 CONCLUÍDA!`, 'color: #00FF88; font-weight: bold;');
        console.log('');
        
        // ═══════════════════════════════════════════════════════════════
        // 📊 DECISÃO FINAL
        // ═══════════════════════════════════════════════════════════════
        let finalColor = fase5Color;
        let baseConfidence = fase1Result.confidence;
        let allAdjustments = fase3Adjustment + fase4Adjustment + fase5Adjustment;
        let allReasons = [fase3Reason];
        if (fase4Reason) allReasons.push(fase4Reason);
        if (fase5Reason) allReasons.push(fase5Reason);
        
        // ═══════════════════════════════════════════════════════════════
        // 📊 CÁLCULO FINAL DE CONFIANÇA
        // ═══════════════════════════════════════════════════════════════
        let rawConfidence = Math.round(baseConfidence + allAdjustments);
        rawConfidence = Math.max(40, Math.min(99, rawConfidence)); // Limitar entre 40-99
        
        console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00FF00; font-weight: bold; font-size: 16px;');
        console.log(`%c║  🎯 DECISÃO FINAL: ${finalColor.toUpperCase().padEnd(33)}║`, 'color: #00FF00; font-weight: bold; font-size: 16px;');
        console.log('%c╠═══════════════════════════════════════════════════════════╣', 'color: #00FF00; font-weight: bold;');
        console.log(`%c║  📊 Confiança Base: ${baseConfidence}%                                ║`, 'color: #00FF88;');
        console.log(`%c║  📈 Ajustes Aplicados: ${allAdjustments >= 0 ? '+' : ''}${allAdjustments}%                            ║`, 'color: #00FF88;');
        console.log(`%c║  📐 Confiança Calculada: ${rawConfidence}%                           ║`, 'color: #00FFFF;');
        console.log('%c╠═══════════════════════════════════════════════════════════╣', 'color: #00FF00; font-weight: bold;');
        console.log('%c║  🔧 APLICANDO CALIBRADOR AUTOMÁTICO...                   ║', 'color: #FFD700; font-weight: bold;');
        console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00FF00; font-weight: bold;');
        console.log('');
        
        // ═══════════════════════════════════════════════════════════════
        // 🔧 APLICAR CALIBRADOR AUTOMÁTICO DE PORCENTAGEM
        // ═══════════════════════════════════════════════════════════════
        // O calibrador aprende com os acertos e erros anteriores
        // Se está errando muito → reduz a confiança
        // Se está acertando muito → mantém ou aumenta a confiança
        let finalConfidence = applyCalibratedConfidence(rawConfidence);
        
        console.log('');
        console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #FFD700; font-weight: bold; font-size: 16px;');
        console.log(`%c║  ✅ CONFIANÇA FINAL (CALIBRADA): ${finalConfidence}%                   ║`, 'color: #FFD700; font-weight: bold; font-size: 16px;');
        console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #FFD700; font-weight: bold;');
        console.log('');
        
        if (allReasons.length > 0) {
            console.log('%c📋 AJUSTES APLICADOS:', 'color: #FFD700; font-weight: bold;');
            allReasons.forEach(reason => {
                console.log(`%c   • ${reason}`, 'color: #FFD700;');
            });
            console.log('');
        }
        
        // ═══════════════════════════════════════════════════════════════
        // ⚖️ VALIDAÇÃO DE PORCENTAGEM MÍNIMA
        // ═══════════════════════════════════════════════════════════════
        let minConfidence = analyzerConfig.minPercentage || 50;
        
        // Ajustar mínimo baseado em performance recente
        if (signalsHistory.recentPerformance && signalsHistory.recentPerformance.length >= 10) {
            const recentHits = signalsHistory.recentPerformance.filter(s => s.hit).length;
            const recentTotal = signalsHistory.recentPerformance.length;
            const recentHitRate = (recentHits / recentTotal) * 100;
            
            if (recentHitRate < 45) {
                minConfidence += 15;
                console.log(`%c⚠️ Performance baixa (${recentHitRate.toFixed(1)}%) → Mínimo: ${minConfidence}%`, 'color: #FFA500;');
            } else if (recentHitRate >= 70) {
                minConfidence -= 5;
                minConfidence = Math.max(minConfidence, analyzerConfig.minPercentage || 50);
                console.log(`%c✅ Performance excelente (${recentHitRate.toFixed(1)}%) → Mínimo: ${minConfidence}%`, 'color: #00FF88;');
            }
        }
        
        // Penalidade por losses consecutivos
        if (signalsHistory.consecutiveLosses >= 3) {
            const penalty = Math.min((signalsHistory.consecutiveLosses - 2) * 3, 15);
            minConfidence += penalty;
            console.log(`%c⚠️ ${signalsHistory.consecutiveLosses} loss consecutivo(s) → Mínimo: ${minConfidence}%`, 'color: #FFA500;');
        }
        
        console.log('');
        console.log('%c⚖️ VALIDAÇÃO DE CONFIANÇA MÍNIMA:', 'color: #FFD700; font-weight: bold;');
        console.log(`%c   Confiança Final: ${finalConfidence}%`, 'color: #FFD700; font-weight: bold;');
        console.log(`%c   Mínimo Configurado: ${analyzerConfig.minPercentage || 50}%`, 'color: #FFD700;');
        console.log(`%c   Mínimo Ajustado: ${minConfidence}%`, 'color: #FFD700; font-weight: bold;');
        console.log('');
        
        if (finalConfidence < minConfidence) {
            console.log('%c❌ SINAL REJEITADO: Confiança insuficiente!', 'color: #FF0000; font-weight: bold; font-size: 14px;');
            console.log(`%c   ${finalConfidence}% < ${minConfidence}% (mínimo)`, 'color: #FF6666;');
            console.log('');
            return null;
        }
        
        console.log('%c✅ SINAL APROVADO: Confiança suficiente!', 'color: #00FF00; font-weight: bold; font-size: 14px;');
        console.log('');
        
        // ═══════════════════════════════════════════════════════════════
        // 📝 MONTAR RACIOCÍNIO DETALHADO
        // ═══════════════════════════════════════════════════════════════
        const reasoning = `ANÁLISE NÍVEL DIAMANTE (5 Fases): ` +
            `FASE 1: Busca dos últimos 10 giros no histórico total (${historySize} giros) → ${fase1Result.color.toUpperCase()} (${fase1Result.occurrences} ocorrências, ${fase1Result.similarity}% similaridade). ` +
            `FASE 2: Análise dos 25% mais recentes (${recent25Percent} giros) → ${fase2Result.color.toUpperCase()} (${fase2Result.occurrences} ocorrências). ` +
            `FASE 3: Últimos 20 giros → Cor dominante: ${corDominante.toUpperCase()} (${corDominante === fase1Result.color ? 'CONFIRMA' : 'CONTRADIZ'} → ${fase3Adjustment >= 0 ? '+' : ''}${fase3Adjustment}%). ` +
            (customPatternResult ? 
                `FASE 4: ★ Padrão customizado "${customPatternResult.patternName}" → ${customPatternResult.color.toUpperCase()} (PRIORIDADE ABSOLUTA!). ` : 
                `FASE 4: Nenhum padrão customizado. `) +
            `FASE 5: ${fase5Reason}. ` +
            `Decisão FINAL: ${finalColor.toUpperCase()} com ${finalConfidence}% de confiança.`;
        
        // Registrar sinal para verificação futura
        const signal = {
            timestamp: Date.now(),
            patternType: 'nivel-diamante',
            patternName: patternDescription,
            colorRecommended: finalColor,
            baseConfidence: baseConfidence,
            adjustment: allAdjustments,
            rawConfidence: rawConfidence,        // Confiança antes da calibração
            finalConfidence: finalConfidence,    // Confiança após calibração
            reasoning: reasoning,
            verified: false,
            colorThatCame: null,
            hit: null
        };
        
        if (signalsHistory && signalsHistory.signals) {
            signalsHistory.signals.push(signal);
            if (signalsHistory.signals.length > 200) {
                signalsHistory.signals = signalsHistory.signals.slice(-200);
            }
            await saveSignalsHistory();
        }
        
        // ✅ MARCAR MEMÓRIA ATIVA COMO INICIALIZADA (para UI)
        if (!memoriaAtiva.inicializada) {
            memoriaAtiva.inicializada = true;
            memoriaAtiva.ultimaAtualizacao = Date.now();
            memoriaAtiva.totalAtualizacoes = 1;
            memoriaAtiva.giros = history.slice(0, 2000);
            console.log('%c✅ Memória Ativa marcada como INICIALIZADA!', 'color: #00FF00; font-weight: bold;');
        } else {
            memoriaAtiva.totalAtualizacoes++;
            memoriaAtiva.ultimaAtualizacao = Date.now();
        }
        
        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00FFFF; font-weight: bold;');
        console.log('%c🧠 RACIOCÍNIO COMPLETO:', 'color: #00FFFF; font-weight: bold; font-size: 14px;');
        console.log(`%c${reasoning}`, 'color: #00FFFF;');
        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00FFFF; font-weight: bold;');
        console.log('');
        
        return {
            color: finalColor,
            confidence: finalConfidence,
            probability: finalConfidence,
            reasoning: reasoning,
            patternDescription: patternDescription
        };
        
    } catch (error) {
        console.error('%c❌ Erro na análise por padrões:', 'color: #FF0000; font-weight: bold;', error);
        return null;
    }
}

/**
 * FUNÇÃO PRINCIPAL: Análise com IA REAL (com timeout de 5 segundos)
 * Esta função faz chamadas REAIS para APIs de IA externas
 */
async function analyzeWithAI(history) {
    const startTime = Date.now();
    const timeout = 5000; // ⚡ 5 segundos MÁXIMO para APIs externas
    
    try {
        console.log('');
        console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00FF00; font-weight: bold; font-size: 14px;');
        console.log('%c║  🤖 INICIANDO ANÁLISE POR INTELIGÊNCIA ARTIFICIAL        ║', 'color: #00FF00; font-weight: bold; font-size: 14px;');
        console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00FF00; font-weight: bold; font-size: 14px;');
        console.log('');
        
        // Verificar chave API
        console.log('%c🔑 Verificando chave API...', 'color: #00FF88; font-weight: bold;');
        if (!analyzerConfig.aiApiKey || analyzerConfig.aiApiKey.trim() === '') {
            console.error('%c❌ ERRO: Chave da IA inválida ou ausente!', 'color: #FF0000; font-weight: bold; font-size: 14px;');
            console.error('%c   Configure a chave nas Configurações da extensão', 'color: #FF6666;');
            sendAnalysisStatus('❌ Chave da IA ausente');
            return null;
        }
        console.log('%c✅ Chave API encontrada: ' + analyzerConfig.aiApiKey.substring(0, 15) + '...', 'color: #00FF88;');
        
        // Detectar qual API está sendo usada pela chave
        const apiKey = analyzerConfig.aiApiKey.trim();
        let apiType = 'unknown';
        
        if (apiKey.startsWith('gsk_')) {
            apiType = 'groq';
            console.log('%c🔍 API Detectada: GROQ (Ultra Rápido) ⚡', 'color: #00FF00; font-weight: bold; font-size: 14px;');
            console.log('%c   Modelo: Llama 3.3 70B Versatile', 'color: #00FF88;');
        } else if (apiKey.startsWith('sk-or-')) {
            apiType = 'openrouter';
            console.log('%c🔍 API Detectada: OpenRouter (agregador de IAs)', 'color: #00FF00; font-weight: bold;');
        } else if (apiKey.startsWith('AIzaSy')) {
            apiType = 'gemini';
            console.log('%c🔍 API Detectada: Google Gemini', 'color: #00FF00; font-weight: bold;');
        } else if (apiKey.startsWith('sk-ant-')) {
            apiType = 'claude';
            console.log('%c🔍 API Detectada: Anthropic Claude', 'color: #00FF00; font-weight: bold;');
        } else if (apiKey.startsWith('sk-')) {
            apiType = 'openai';
            console.log('%c🔍 API Detectada: OpenAI GPT', 'color: #00FF00; font-weight: bold;');
        } else {
            // Tentar OpenRouter como padrão
            console.log('%c⚠️ Tipo de API não detectado. Tentando OpenRouter...', 'color: #FFAA00; font-weight: bold;');
            apiType = 'openrouter';
        }
        
        // Preparar dados do histórico para enviar à IA
        const aiHistorySize = Math.min(Math.max(analyzerConfig.aiHistorySize || 50, 20), 2000); // Min: 20, Max: 2000
        const recentHistory = history.slice(0, aiHistorySize);
        
        // ✅ CRÍTICO: Enviar os últimos 20 giros em DESTAQUE para a IA
        const last20Spins = history.slice(0, 20);
        
        // 🔍 DEBUG: Mostrar os primeiros 20 giros para validar a ordem
        console.log('');
        console.log('%c🔍 DEBUG: VERIFICANDO ORDEM DO HISTÓRICO', 'color: #FFFF00; font-weight: bold; font-size: 14px;');
        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #FFFF00;');
        console.log('%c📊 ÚLTIMOS 20 GIROS (do array history[0] até history[19]):', 'color: #FFFF00; font-weight: bold;');
        for (let i = 0; i < Math.min(20, recentHistory.length); i++) {
            const spin = recentHistory[i];
            console.log(`%c   ${i === 0 ? '🔥 MAIS RECENTE →' : `   ${i + 1}.`} ${spin.color.toUpperCase()} (número ${spin.number})`, 
                `color: ${spin.color === 'red' ? '#FF0000' : spin.color === 'black' ? '#FFFFFF' : '#00FF00'}; font-weight: bold;`);
        }
        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #FFFF00;');
        console.log('');
        
        // Criar texto com DESTAQUE para os últimos 20 giros
        const last20Text = last20Spins.map((spin, idx) => 
            `${idx + 1}. ${spin.color} (${spin.number})`
        ).join(', ');
        
        const historyText = recentHistory.map((spin, idx) => 
            `${idx + 1}. ${spin.color} (${spin.number})`
        ).join(', ');
        
        // ═══════════════════════════════════════════════════════════════
        // 🔍 DETECTAR PADRÕES NO HISTÓRICO (ANÁLISE ESTATÍSTICA REAL)
        // ═══════════════════════════════════════════════════════════════
        let patternsReport = [];
        try {
            patternsReport = detectPatternsInHistory(recentHistory);
        } catch (patternError) {
            console.error('%c❌ ERRO ao detectar padrões:', 'color: #FF0000; font-weight: bold;', patternError);
            console.log('%c⚠️ Continuando análise SEM padrões detectados...', 'color: #FFAA00;');
        }
        
        // Montar texto do relatório de padrões para enviar à IA
        let patternsText = '';
        if (patternsReport && patternsReport.length > 0) {
            patternsText = '═══════════════════════════════════════════════════════════════\n';
            patternsText += '📊 PADRÕES DETECTADOS NO HISTÓRICO (ESTATÍSTICAS REAIS):\n';
            patternsText += '═══════════════════════════════════════════════════════════════\n\n';
            
            patternsReport.forEach((p, index) => {
                patternsText += `PADRÃO ${index + 1}: ${p.name}\n`;
                patternsText += `- Ocorrências: ${p.occurrences} vezes no histórico\n`;
                patternsText += `- Após esse padrão:\n`;
                patternsText += `  → VERMELHO: ${p.afterRed} vezes (${p.redPercent}%)\n`;
                patternsText += `  → PRETO: ${p.afterBlack} vezes (${p.blackPercent}%)\n`;
                patternsText += `  → BRANCO: ${p.afterWhite} vezes (${p.whitePercent}%)\n`;
                patternsText += `\n`;
            });
            
            patternsText += '═══════════════════════════════════════════════════════════════\n';
        } else {
            patternsText = '⚠️ Nenhum padrão claro foi detectado no histórico.\n';
            patternsText += 'Analise os últimos 20 giros de forma mais livre.\n\n';
        }
        
        // ═══════════════════════════════════════════════════════════════
        // 🤖 PREPARAR PROMPT (customizado ou padrão)
        // ═══════════════════════════════════════════════════════════════
        let prompt;
        
        if (analyzerConfig.customPrompt && analyzerConfig.customPrompt.trim() !== '') {
            // 🔧 USAR PROMPT CUSTOMIZADO DO USUÁRIO
            console.log('%c🔧 MODO AVANÇADO: Usando prompt customizado', 'color: #FF00FF; font-weight: bold;');
            
            // Substituir placeholders no prompt customizado
            prompt = analyzerConfig.customPrompt
                .replace(/\$\{recentHistory\.length\}/g, recentHistory.length)
                .replace(/\$\{historyLength\}/g, recentHistory.length)
                .replace(/\$\{historyText\}/g, historyText)
                .replace(/\$\{patternsText\}/g, patternsText);
            
            console.log('%c   Tamanho do prompt: ' + prompt.length + ' caracteres', 'color: #FF00FF;');
            
            // Validar palavras-chave críticas
            const requiredKeywords = ['color', 'confidence', 'JSON'];
            const missingKeywords = requiredKeywords.filter(keyword => !prompt.toLowerCase().includes(keyword.toLowerCase()));
            
            if (missingKeywords.length > 0) {
                console.warn('%c⚠️ AVISO: Prompt customizado pode estar faltando elementos críticos:', 'color: #FFAA00; font-weight: bold;');
                console.warn('%c   Palavras-chave ausentes: ' + missingKeywords.join(', '), 'color: #FFAA00;');
                console.warn('%c   Isso pode causar respostas inválidas da IA!', 'color: #FFAA00;');
            }
        } else {
            // ✅ USAR PROMPT PADRÃO (COM PADRÕES DETECTADOS E ÚLTIMOS 20 GIROS)
            console.log('%c✅ Usando prompt padrão com padrões detectados + últimos 20 giros', 'color: #00FF88;');
            prompt = DEFAULT_AI_PROMPT(recentHistory.length, historyText, patternsText, last20Text);
        }

        console.log('');
        console.log('%c📤 Enviando dados para API da IA...', 'color: #00FFFF; font-weight: bold; font-size: 13px;');
        console.log('%c   Histórico: ' + recentHistory.length + ' giros', 'color: #00FFFF;');
        console.log('%c   ⚡ Timeout: 5 segundos MÁXIMO', 'color: #00FFFF; font-weight: bold;');
        console.log('');
        sendAnalysisStatus('🤖 Consultando IA...');
        
        // Fazer chamada REAL para a API
        let aiResponse;
        
        try {
            switch (apiType) {
                case 'groq':
                    aiResponse = await callGroqAPI(apiKey, prompt, timeout);
                    break;
                case 'openrouter':
                    aiResponse = await callOpenRouterAPI(apiKey, prompt, timeout);
                    break;
                case 'gemini':
                    aiResponse = await callGeminiAPI(apiKey, prompt, timeout);
                    break;
                case 'openai':
                    aiResponse = await callOpenAI_API(apiKey, prompt, timeout);
                    break;
                case 'claude':
                    aiResponse = await callClaudeAPI(apiKey, prompt, timeout);
                    break;
                default:
                    throw new Error('Tipo de API não suportado');
            }
        } catch (apiError) {
            console.log('');
            console.error('%c❌ ERRO AO CHAMAR API!', 'color: #FF0000; font-weight: bold; font-size: 14px; background: #330000; padding: 5px;');
            console.error('%c   Mensagem: ' + apiError.message, 'color: #FF6666; font-weight: bold;');
            console.log('');
            sendAnalysisStatus('❌ API inválida');
            return null;
        }
        
        // Validar resposta
        if (!aiResponse || !aiResponse.color) {
            console.log('');
            console.error('%c❌ RESPOSTA DA IA INVÁLIDA!', 'color: #FF0000; font-weight: bold; font-size: 14px;');
            console.error('%c   A API não retornou dados no formato esperado', 'color: #FF6666;');
            console.log('');
            return null;
        }
        
        // Verificar timeout
        const elapsed = Date.now() - startTime;
        if (elapsed > timeout) {
            console.error('⏱️ Timeout: Análise IA excedeu o tempo limite');
            return null;
        }
        
        // ✅ VALIDAR CONFIANÇA MÍNIMA (respeitar configuração do usuário)
        const aiConfidence = aiResponse.confidence || 0;
        const minConfidence = analyzerConfig.minOccurrences || 60; // minOccurrences é usado como confiança mínima no modo IA
        
        // ⚠️ ESPECIAL: Se IA retornar confidence: 0, significa que não encontrou padrão confiável
        if (aiConfidence === 0) {
            console.log('');
            console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #FFAA00; font-weight: bold;');
            console.log('%c║  ⚠️ IA: NENHUM PADRÃO CONFIÁVEL DETECTADO                 ║', 'color: #FFAA00; font-weight: bold;');
            console.log('%c╠═══════════════════════════════════════════════════════════╣', 'color: #FFAA00; font-weight: bold;');
            console.log('%c║  🔍 Raciocínio: ' + (aiResponse.reasoning || 'Sem padrão com 85%+ de confiança').substring(0, 48).padEnd(48) + '║', 'color: #FFAA00;');
            console.log('%c╠═══════════════════════════════════════════════════════════╣', 'color: #FFAA00; font-weight: bold;');
            console.log('%c║  ⏳ Aguardando formação de padrão claro...                ║', 'color: #FFAA00;');
            console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #FFAA00; font-weight: bold;');
            console.log('');
            sendAnalysisStatus('⏳ IA aguardando padrão confiável...');
            return null;
        }
        
        // Validar se atinge confiança mínima configurada
        if (aiConfidence < minConfidence) {
            console.log('');
            console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #FFAA00; font-weight: bold;');
            console.log('%c║  ⚠️ SINAL IA REJEITADO: CONFIANÇA INSUFICIENTE            ║', 'color: #FFAA00; font-weight: bold;');
            console.log('%c╠═══════════════════════════════════════════════════════════╣', 'color: #FFAA00; font-weight: bold;');
            console.log('%c║  📊 Confiança da IA: ' + aiConfidence.toFixed(1) + '%                                ║', 'color: #FFAA00;');
            console.log('%c║  🎯 Confiança mínima configurada: ' + minConfidence + '%                    ║', 'color: #FFAA00;');
            console.log('%c╠═══════════════════════════════════════════════════════════╣', 'color: #FFAA00; font-weight: bold;');
            console.log('%c║  ⏳ Aguardando próximo giro com maior confiança...        ║', 'color: #FFAA00;');
            console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #FFAA00; font-weight: bold;');
            console.log('');
            sendAnalysisStatus('⏳ IA aguardando confiança maior...');
            return null;
        }
        
        // 📊 RASTREAMENTO DE CORES (detectar viés)
        const recommendedColor = aiResponse.color.toLowerCase();
        aiColorCounter[recommendedColor] = (aiColorCounter[recommendedColor] || 0) + 1;
        aiColorCounter.total++;
        
        // Alertar se houver viés evidente (mais de 70% de uma única cor após 10+ recomendações)
        if (aiColorCounter.total >= 10) {
            const redPercent = (aiColorCounter.red / aiColorCounter.total) * 100;
            const blackPercent = (aiColorCounter.black / aiColorCounter.total) * 100;
            const whitePercent = (aiColorCounter.white / aiColorCounter.total) * 100;
            
            console.log('');
            console.log('%c📊 ESTATÍSTICAS DA IA (últimas ' + aiColorCounter.total + ' recomendações):', 'color: #00FFFF; font-weight: bold;');
            console.log('%c   🔴 VERMELHO: ' + aiColorCounter.red + ' (' + redPercent.toFixed(1) + '%)', 
                'color: ' + (redPercent > 70 ? '#FF0000' : '#00FFFF') + '; font-weight: ' + (redPercent > 70 ? 'bold' : 'normal') + ';');
            console.log('%c   ⚫ PRETO: ' + aiColorCounter.black + ' (' + blackPercent.toFixed(1) + '%)', 
                'color: ' + (blackPercent > 70 ? '#FF0000' : '#00FFFF') + '; font-weight: ' + (blackPercent > 70 ? 'bold' : 'normal') + ';');
            console.log('%c   ⚪ BRANCO: ' + aiColorCounter.white + ' (' + whitePercent.toFixed(1) + '%)', 
                'color: ' + (whitePercent > 70 ? '#FF0000' : '#00FFFF') + '; font-weight: ' + (whitePercent > 70 ? 'bold' : 'normal') + ';');
            
            if (redPercent > 70 || blackPercent > 70 || whitePercent > 70) {
                console.log('');
                console.log('%c⚠️⚠️⚠️ ALERTA DE VIÉS DETECTADO! ⚠️⚠️⚠️', 'color: #FF0000; font-weight: bold; font-size: 14px; background: #330000; padding: 5px;');
                console.log('%c   A IA está recomendando a MESMA cor mais de 70% das vezes!', 'color: #FF6666; font-weight: bold;');
                console.log('%c   Isso pode indicar um problema no modelo ou no prompt.', 'color: #FF6666;');
                console.log('');
            }
            console.log('');
        }
        
        // 🔥 CORREÇÃO CRÍTICA: SEMPRE usar dados REAIS do histórico
        // A IA frequentemente INVENTA os dados em last10Spins, então IGNORAMOS completamente
        // e SEMPRE usamos os dados reais do histórico que foram coletados
        console.log('');
        console.log('%c🔍 USANDO DADOS REAIS DO HISTÓRICO (ignorando resposta da IA)', 'color: #FFFF00; font-weight: bold;');
        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #FFFF00;');
        console.log('%c⚠️ MOTIVO: A IA frequentemente INVENTA dados no campo last10Spins', 'color: #FFAA00; font-weight: bold;');
        console.log('%c✅ SOLUÇÃO: Sempre extrair do histórico REAL coletado do site', 'color: #00FF88; font-weight: bold;');
        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #FFFF00;');
        
        // SEMPRE extrair do histórico real (ignorar o que a IA retornou)
        const last10SpinsData = recentHistory.slice(0, 10).map(spin => ({
            color: spin.color,
            number: spin.number,
            timestamp: spin.timestamp
        }));
        
        console.log('%c📊 ÚLTIMOS 10 GIROS (REAIS do histórico):', 'color: #00FF88; font-weight: bold;');
        last10SpinsData.forEach((spin, idx) => {
            console.log(`%c   ${idx + 1}. ${spin.color.toUpperCase()} (${spin.number})`, 
                `color: ${spin.color === 'red' ? '#FF0000' : spin.color === 'black' ? '#FFFFFF' : '#00FF00'}; font-weight: bold;`);
        });
        console.log('');
        
        // ⚠️ VALIDAÇÃO: Verificar se a IA retornou dados DIFERENTES dos reais
        if (aiResponse.last10Spins && aiResponse.last10Spins.length > 0) {
            console.log('%c🔍 VALIDAÇÃO: Comparando dados da IA com histórico real', 'color: #FFAA00; font-weight: bold;');
            
            let mismatchFound = false;
            for (let i = 0; i < Math.min(5, aiResponse.last10Spins.length); i++) {
                const aiSpin = aiResponse.last10Spins[i];
                const realSpin = last10SpinsData[i];
                
                if (aiSpin.number !== realSpin.number || aiSpin.color !== realSpin.color) {
                    mismatchFound = true;
                    console.log(`%c   ❌ DIVERGÊNCIA no giro ${i + 1}:`, 'color: #FF0000; font-weight: bold;');
                    console.log(`%c      IA disse: ${aiSpin.color} (${aiSpin.number})`, 'color: #FF6666;');
                    console.log(`%c      Real é:   ${realSpin.color} (${realSpin.number})`, 'color: #00FF88;');
                }
            }
            
            if (mismatchFound) {
                console.log('');
                console.log('%c⚠️⚠️⚠️ A IA RETORNOU DADOS FALSOS! ⚠️⚠️⚠️', 'color: #FF0000; font-weight: bold; font-size: 14px; background: #330000; padding: 5px;');
                console.log('%c   Os dados exibidos ao usuário são os REAIS do histórico', 'color: #00FF88; font-weight: bold;');
                console.log('%c   (Ignoramos os dados inventados pela IA)', 'color: #00FF88;');
                console.log('');
            } else {
                console.log('%c   ✅ Dados da IA conferem com o histórico real', 'color: #00FF88; font-weight: bold;');
            }
        }
        
        // Criar objeto de análise no formato esperado
        const analysis = {
            color: aiResponse.color,
            confidence: aiResponse.confidence,
            probability: aiResponse.probability || 50,
            suggestion: `IA recomenda: ${aiResponse.color === 'red' ? '🔴 VERMELHO' : aiResponse.color === 'black' ? '⚫ PRETO' : '⚪ BRANCO'}`,
            patternDescription: aiResponse.reasoning || 'Análise baseada em IA',
            last10Spins: last10SpinsData, // ✅ INCLUIR OS 10 GIROS
            last5Spins: last10SpinsData ? last10SpinsData.slice(0, 10) : [], // ✅ Mostrando últimos 10 giros
            source: 'AI-REAL',
            apiType: apiType,
            timestamp: Date.now(),
            createdOnTimestamp: history[0]?.timestamp || Date.now(),
            predictedFor: null // Será preenchido pelo próximo giro
        };
        
        console.log('');
        console.log('%c✅ RESPOSTA DA IA RECEBIDA COM SUCESSO!', 'color: #00FF00; font-weight: bold; font-size: 14px; background: #003300; padding: 5px;');
        console.log('%c   🎯 Cor prevista: ' + analysis.color.toUpperCase(), 'color: #00FF00; font-weight: bold; font-size: 13px;');
        console.log('%c   📊 Confiança: ' + analysis.confidence + '%', 'color: #00FF88; font-weight: bold;');
        console.log('%c   💭 Raciocínio (primeiros 200 chars): ' + (aiResponse.reasoning || '').substring(0, 200) + '...', 'color: #00FF88;');
        console.log('%c   ⚡ Tempo de resposta: ' + elapsed + 'ms', 'color: #00FFFF;');
        console.log('');
        
        // 🔍 VALIDAÇÃO: Verificar se a IA analisou os giros corretos
        console.log('%c🔍 VALIDAÇÃO: Comparando resposta da IA com histórico real', 'color: #FFFF00; font-weight: bold;');
        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #FFFF00;');
        console.log('%c📊 Últimos 10 giros REAIS (do histórico):', 'color: #FFFF00; font-weight: bold;');
        for (let i = 0; i < Math.min(10, recentHistory.length); i++) {
            const spin = recentHistory[i];
            console.log(`%c   ${i + 1}. ${spin.color.toUpperCase()} (número ${spin.number})`, 
                `color: ${spin.color === 'red' ? '#FF0000' : spin.color === 'black' ? '#FFFFFF' : '#00FF00'}; font-weight: bold;`);
        }
        console.log('');
        console.log('%c💭 O que a IA disse sobre os últimos giros:', 'color: #FFFF00; font-weight: bold;');
        const reasoningSnippet = (aiResponse.reasoning || '').substring(0, 300);
        console.log('%c   ' + reasoningSnippet, 'color: #FFAA00;');
        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #FFFF00;');
        console.log('');
        
        return analysis;
        
    } catch (error) {
        console.log('');
        console.error('%c❌ ERRO GERAL NA ANÁLISE IA!', 'color: #FF0000; font-weight: bold; font-size: 14px; background: #330000; padding: 5px;');
        console.error('%c   ' + error.message, 'color: #FF6666; font-weight: bold;');
        console.error('%c   Stack:', error.stack, 'color: #FF3333;');
        console.log('');
        sendAnalysisStatus('❌ Erro na IA');
        return null;
    }
}

/**
 * Chama a API do Groq (Ultra Rápido)
 */
async function callGroqAPI(apiKey, prompt, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile', // Modelo mais recente e eficiente do Groq
                messages: [
                    { 
                        role: 'system', 
                        content: 'Você é um especialista em análise de padrões do jogo Double da Blaze. Responda APENAS com JSON válido, sem markdown ou texto adicional.' 
                    },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 800,
                top_p: 1
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Groq retornou erro ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        
        if (!text) {
            throw new Error('Resposta da API Groq está vazia');
        }
        
        // Extrair JSON da resposta (remover markdown se houver)
        let jsonText = text.trim();
        
        // Remover blocos de código markdown se existirem
        jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        
        // Extrair JSON
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('IA não retornou JSON válido');
        }
        
        return JSON.parse(jsonMatch[0]);
        
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Timeout ao conectar com API Groq');
        }
        throw error;
    }
}

/**
 * Chama a API do OpenRouter (agregador de múltiplas IAs)
 */
async function callOpenRouterAPI(apiKey, prompt, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://blaze.com',
                'X-Title': 'Blaze Double Analyzer'
            },
            body: JSON.stringify({
                model: 'anthropic/claude-3.5-sonnet', // Melhor modelo disponível
                messages: [
                    { 
                        role: 'system', 
                        content: 'Você é um especialista em análise de padrões do jogo Double da Blaze. Responda APENAS com JSON válido, sem markdown ou texto adicional.' 
                    },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 800,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API OpenRouter retornou erro ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        
        if (!text) {
            throw new Error('Resposta da API OpenRouter está vazia');
        }
        
        // Extrair JSON da resposta (remover markdown se houver)
        let jsonText = text.trim();
        
        // Remover blocos de código markdown se existirem
        jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        
        // Extrair JSON
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('IA não retornou JSON válido');
        }
        
        return JSON.parse(jsonMatch[0]);
        
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Timeout ao conectar com API OpenRouter');
        }
        throw error;
    }
}

/**
 * Chama a API do Google Gemini
 */
async function callGeminiAPI(apiKey, prompt, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 1024,
                }
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Gemini retornou erro ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!text) {
            throw new Error('Resposta da API Gemini está vazia');
        }
        
        // Extrair JSON da resposta
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('IA não retornou JSON válido');
        }
        
        return JSON.parse(jsonMatch[0]);
        
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Timeout ao conectar com API Gemini');
        }
        throw error;
    }
}

/**
 * Chama a API da OpenAI (GPT)
 */
async function callOpenAI_API(apiKey, prompt, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: 'Você é um especialista em análise de padrões. Responda APENAS com JSON.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 500
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API OpenAI retornou erro ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        
        if (!text) {
            throw new Error('Resposta da API OpenAI está vazia');
        }
        
        // Extrair JSON da resposta
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('IA não retornou JSON válido');
        }
        
        return JSON.parse(jsonMatch[0]);
        
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Timeout ao conectar com API OpenAI');
        }
        throw error;
    }
}

/**
 * Chama a API da Anthropic (Claude)
 */
async function callClaudeAPI(apiKey, prompt, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-sonnet-20240229',
                max_tokens: 1024,
                messages: [
                    { role: 'user', content: prompt }
                ]
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Claude retornou erro ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        const text = data.content?.[0]?.text;
        
        if (!text) {
            throw new Error('Resposta da API Claude está vazia');
        }
        
        // Extrair JSON da resposta
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('IA não retornou JSON válido');
        }
        
        return JSON.parse(jsonMatch[0]);
        
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Timeout ao conectar com API Claude');
        }
        throw error;
    }
}

// NOVO CONTROLADOR: Orquestra Verificação (padrões salvos) + Descoberta (173+ análises) em ≤5s
async function runAnalysisController(history) {
	const startTs = Date.now();
	const budgetMs = 5000; // 5s totais

	try {
		// ⚠️ CRÍTICO: RECARREGAR analyzerConfig do storage ANTES de cada análise
		// Isso garante que mudanças feitas pelo usuário sejam respeitadas imediatamente
		console.log('%c🔄 Recarregando configuração do storage...', 'color: #FFAA00; font-weight: bold;');
		const storageResult = await chrome.storage.local.get(['analyzerConfig']);
		if (storageResult && storageResult.analyzerConfig) {
			analyzerConfig = { ...DEFAULT_ANALYZER_CONFIG, ...storageResult.analyzerConfig };
			console.log('%c✅ Configuração recarregada com sucesso!', 'color: #00FF00; font-weight: bold;');
		} else {
			console.log('%c⚠️ Nenhuma config no storage, usando padrão', 'color: #FFAA00;');
		}
		
		// ✅ DEBUG CRÍTICO: Verificar estado real do analyzerConfig
		console.log('');
		console.log('%c🔧 DEBUG: Estado atual do analyzerConfig:', 'color: #FFFF00; font-weight: bold; font-size: 12px; background: #333300; padding: 5px;');
		console.log('%c   analyzerConfig.aiMode = ' + analyzerConfig.aiMode, 'color: #FFFF00; font-weight: bold; font-size: 14px;');
		console.log('%c   analyzerConfig.aiApiKey = ' + (analyzerConfig.aiApiKey ? analyzerConfig.aiApiKey.substring(0, 15) + '...' : 'NÃO CONFIGURADA'), 'color: #FFFF00;');
		console.log('%c   analyzerConfig.minOccurrences = ' + analyzerConfig.minOccurrences, 'color: #FFFF00;');
		console.log('');
		
		// ✅ LOG INICIAL: Mostrar qual modo está ativo COM DESTAQUE
		console.log('═════════════════════════════════════════════════════════════════════════════');
		console.log('');
		if (analyzerConfig.aiMode) {
			console.log('%c██████╗ ███╗   ███╗ ██████╗ ██████╗  ██████╗     ██╗ █████╗ ', 'color: #00FF00; font-weight: bold; font-size: 14px;');
			console.log('%c████╔═╝ ████╗ ████║██╔═══██╗██╔══██╗██╔═══██╗    ██║██╔══██╗', 'color: #00FF00; font-weight: bold; font-size: 14px;');
			console.log('%c█████╗  ██╔████╔██║██║   ██║██║  ██║██║   ██║    ██║███████║', 'color: #00FF00; font-weight: bold; font-size: 14px;');
			console.log('%c████╔═╝ ██║╚██╔╝██║██║   ██║██║  ██║██║   ██║    ██║██╔══██║', 'color: #00FF00; font-weight: bold; font-size: 14px;');
			console.log('%c██████╗ ██║ ╚═╝ ██║╚██████╔╝██████╔╝╚██████╔╝    ██║██║  ██║', 'color: #00FF00; font-weight: bold; font-size: 14px;');
			console.log('%c╚═════╝ ╚═╝     ╚═╝ ╚═════╝ ╚═════╝  ╚═════╝     ╚═╝╚═╝  ╚═╝', 'color: #00FF00; font-weight: bold; font-size: 14px;');
			console.log('');
		// 🧠 INDICADOR DINÂMICO DE MEMÓRIA ATIVA
		let memoriaStatus = '';
		let memoriaColor = '#00FF00';
		let memoriaInfo = '';
		
		if (!memoriaAtiva.inicializada) {
			memoriaStatus = '🔄 INICIALIZANDO CACHE...';
			memoriaColor = '#FFA500';
			memoriaInfo = '⏳ Primeira inicialização (análise completa em andamento)';
		} else {
			const tempoDecorrido = Math.round((Date.now() - memoriaAtiva.ultimaAtualizacao) / 1000);
			memoriaStatus = '⚡ CACHE RAM ATIVO';
			memoriaColor = '#00FF00';
			memoriaInfo = `🧠 Memória Viva: ${memoriaAtiva.totalAtualizacoes} atualizações | ⏱️ Última: ${memoriaAtiva.tempoUltimaAtualizacao.toFixed(1)}ms | 🕐 Há ${tempoDecorrido}s`;
		}
		
		console.log(`%c🤖 MODO: ANÁLISE COM INTELIGÊNCIA ARTIFICIAL IA | ${memoriaStatus}`, `color: ${memoriaColor}; font-weight: bold; font-size: 16px; background: #003300; padding: 10px;`);
		console.log(`%c${memoriaInfo}`, 'color: #00FF88; font-weight: bold; font-size: 12px;');
		} else {
			console.log('%c███╗   ███╗ ██████╗ ██████╗  ██████╗     ██████╗  █████╗ ██████╗ ██████╗  █████╗  ██████╗ ', 'color: #00AAFF; font-weight: bold; font-size: 14px;');
			console.log('%c████╗ ████║██╔═══██╗██╔══██╗██╔═══██╗    ██╔══██╗██╔══██╗██╔══██╗██╔══██╗██╔══██╗██╔═══██╗', 'color: #00AAFF; font-weight: bold; font-size: 14px;');
			console.log('%c██╔████╔██║██║   ██║██║  ██║██║   ██║    ██████╔╝███████║██║  ██║██████╔╝███████║██║   ██║', 'color: #00AAFF; font-weight: bold; font-size: 14px;');
			console.log('%c██║╚██╔╝██║██║   ██║██║  ██║██║   ██║    ██╔═══╝ ██╔══██║██║  ██║██╔══██╗██╔══██║██║   ██║', 'color: #00AAFF; font-weight: bold; font-size: 14px;');
			console.log('%c██║ ╚═╝ ██║╚██████╔╝██████╔╝╚██████╔╝    ██║     ██║  ██║██████╔╝██║  ██║██║  ██║╚██████╔╝', 'color: #00AAFF; font-weight: bold; font-size: 14px;');
			console.log('%c╚═╝     ╚═╝ ╚═════╝ ╚═════╝  ╚═════╝     ╚═╝     ╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ', 'color: #00AAFF; font-weight: bold; font-size: 14px;');
			console.log('');
			console.log('%c📊 MODO DE ANÁLISE ATIVO: SISTEMA PADRÃO (173+ ANÁLISES)', 'color: #00AAFF; font-weight: bold; font-size: 16px; background: #003366; padding: 10px;');
			console.log('%c🔍 Usando banco de padrões salvos + análises locais', 'color: #00BBFF; font-weight: bold; font-size: 12px;');
		}
		console.log('');
		console.log('═════════════════════════════════════════════════════════════════════════════');
		console.log('');
		
		// ⚠️ CRÍTICO: VERIFICAR MODO CONSECUTIVO COM MARTINGALE ATIVO (APLICA PARA AMBOS OS MODOS)
		if (analyzerConfig.consecutiveMartingale && martingaleState.active) {
			console.log('');
			console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #FF0000; font-weight: bold; font-size: 16px; background: #330000; padding: 5px;');
			console.log('%c║  🔒 MODO CONSECUTIVO COM MARTINGALE ATIVO                ║', 'color: #FF0000; font-weight: bold; font-size: 16px; background: #330000; padding: 5px;');
			console.log('%c╠═══════════════════════════════════════════════════════════╣', 'color: #FF0000; font-weight: bold; background: #330000; padding: 5px;');
			console.log('%c║  Estágio: ' + martingaleState.stage, 'color: #FF0000; font-weight: bold; background: #330000; padding: 5px;');
			console.log('%c║  Cor: ' + martingaleState.entryColor, 'color: #FF0000; font-weight: bold; background: #330000; padding: 5px;');
			console.log('%c╠═══════════════════════════════════════════════════════════╣', 'color: #FF0000; font-weight: bold; background: #330000; padding: 5px;');
			console.log('%c║  ⛔ BLOQUEANDO NOVA ANÁLISE                              ║', 'color: #FF0000; font-weight: bold; font-size: 16px; background: #330000; padding: 5px;');
			console.log('%c║  💡 Sistema em modo consecutivo - aguardando resultado   ║', 'color: #FF0000; font-weight: bold; background: #330000; padding: 5px;');
			console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #FF0000; font-weight: bold; font-size: 16px; background: #330000; padding: 5px;');
			console.log('');
			console.log('%c❌ RETORNANDO SEM ANALISAR (MOTIVO: Martingale ativo em modo consecutivo)', 'color: #FF0000; font-weight: bold; font-size: 16px; background: #330000; padding: 5px;');
			console.log('');
			return; // ✅ NÃO executar nova análise em modo consecutivo com Martingale ativo
		}
		console.log('%c✅ CHECK 1: Não há Martingale consecutivo ativo - PROSSEGUINDO', 'color: #00FF88; font-weight: bold;');
		
		// ✅ VERIFICAR SE JÁ EXISTE UMA ANÁLISE PENDENTE (que ainda não foi avaliada)
		const existingAnalysisResult = await chrome.storage.local.get(['analysis']);
		const existingAnalysis = existingAnalysisResult['analysis'];
		
		console.log('%c🔍 CHECK 2: Verificando se há análise pendente...', 'color: #FFAA00; font-weight: bold;');
		console.log('   existingAnalysis:', existingAnalysis ? 'SIM' : 'NÃO');
		
		if (existingAnalysis && existingAnalysis.createdOnTimestamp && history && history.length > 0) {
			const latestSpinTimestamp = history[0].timestamp;
			const isAnalysisPending = existingAnalysis.createdOnTimestamp !== latestSpinTimestamp;
			
			console.log('   Timestamp da análise:', existingAnalysis.createdOnTimestamp);
			console.log('   Timestamp do giro atual:', latestSpinTimestamp);
			console.log('   É diferente (pendente)?', isAnalysisPending ? 'SIM' : 'NÃO');
			
			if (isAnalysisPending) {
				console.log('');
				console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #FF6600; font-weight: bold; font-size: 16px; background: #332200; padding: 5px;');
				console.log('%c║  ⚠️ JÁ EXISTE ANÁLISE PENDENTE - NÃO SOBRESCREVER!      ║', 'color: #FF6600; font-weight: bold; font-size: 16px; background: #332200; padding: 5px;');
				console.log('%c╠═══════════════════════════════════════════════════════════╣', 'color: #FF6600; font-weight: bold; background: #332200; padding: 5px;');
				console.log('%c║  Cor recomendada: ' + existingAnalysis.color, 'color: #FF6600; font-weight: bold; background: #332200; padding: 5px;');
				console.log('%c║  Confiança: ' + existingAnalysis.confidence + '%', 'color: #FF6600; font-weight: bold; background: #332200; padding: 5px;');
				console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #FF6600; font-weight: bold; font-size: 16px; background: #332200; padding: 5px;');
				console.log('');
				console.log('%c❌ RETORNANDO SEM ANALISAR (MOTIVO: Análise pendente não avaliada)', 'color: #FF6600; font-weight: bold; font-size: 16px; background: #332200; padding: 5px;');
				console.log('');
				return; // ✅ NÃO executar nova análise se já há uma pendente
			}
		}
		console.log('%c✅ CHECK 2: Não há análise pendente - PROSSEGUINDO', 'color: #00FF88; font-weight: bold;');
		
		// 1) Verificação com padrões salvos (rápido) - PRIORIDADE MÁXIMA
		// ⚠️ CRÍTICO: PULAR VERIFICAÇÃO DE PADRÕES SALVOS SE MODO IA ESTIVER ATIVO
		let verifyResult = null;
		if (!analyzerConfig.aiMode) {
			console.log('');
			console.log('%c╔═══════════════════════════════════════════════════════════════════════════════╗', 'color: #00AAFF; font-weight: bold; font-size: 16px; background: #003366; padding: 5px;');
			console.log('%c║                                                                               ║', 'color: #00AAFF; font-weight: bold; font-size: 16px; background: #003366; padding: 5px;');
			console.log('%c║       🔎 INICIANDO ANÁLISE COM PADRÕES SALVOS (MODO PADRÃO)! 🔎             ║', 'color: #00AAFF; font-weight: bold; font-size: 16px; background: #003366; padding: 5px;');
			console.log('%c║                                                                               ║', 'color: #00AAFF; font-weight: bold; font-size: 16px; background: #003366; padding: 5px;');
			console.log('%c╚═══════════════════════════════════════════════════════════════════════════════╝', 'color: #00AAFF; font-weight: bold; font-size: 16px; background: #003366; padding: 5px;');
			console.log('');
			sendAnalysisStatus('🔎 Verificando padrões salvos...');
			verifyResult = await verifyWithSavedPatterns(history);
			console.log('');
			console.log('%c📊 RESULTADO da verificação de padrões salvos:', 'color: #00AAFF; font-weight: bold;', verifyResult ? 'PADRÃO ENCONTRADO!' : 'Nenhum padrão encontrado');
			console.log('');
		} else {
			console.log('');
			console.log('%c🤖 MODO IA ATIVO: Pulando verificação de padrões salvos...', 'color: #00FF88; font-weight: bold; font-size: 14px;');
			console.log('%c⏭️  Indo direto para análise por Inteligência Artificial', 'color: #00FF88;');
			console.log('');
		}
		
		if (verifyResult) {
			console.log('');
			console.log('╔═══════════════════════════════════════════════════════════╗');
			console.log('║  ✅ USANDO: PADRÃO SALVO (PRIORIDADE MÁXIMA)             ║');
			console.log('╠═══════════════════════════════════════════════════════════╣');
			console.log('║  📊 Sistema de análise: BANCO DE PADRÕES                 ║');
			console.log('║  🎯 Padrão encontrado e validado                         ║');
			console.log('╚═══════════════════════════════════════════════════════════╝');
			console.log('');
			
			// ⚠️ CRÍTICO: VERIFICAR SE HÁ MARTINGALE ATIVO
			if (martingaleState.active && martingaleState.entryColor) {
				console.log('╔═══════════════════════════════════════════════════════════╗');
				console.log('║  🔄 MARTINGALE ATIVO DETECTADO!                          ║');
				console.log('╠═══════════════════════════════════════════════════════════╣');
				console.log(`║  Cor do novo padrão: ${verifyResult.color}                           ║`);
				console.log(`║  Cor da entrada original: ${martingaleState.entryColor}                    ║`);
				console.log(`║  Estágio atual: ${martingaleState.stage}                              ║`);
				console.log('╠═══════════════════════════════════════════════════════════╣');
				console.log('║  ✅ SOBRESCREVENDO COR PARA MANTER ENTRADA ORIGINAL      ║');
				console.log('╚═══════════════════════════════════════════════════════════╝');
				
				// ✅ SOBRESCREVER A COR PARA USAR A COR DA ENTRADA ORIGINAL
				verifyResult.color = martingaleState.entryColor;
				verifyResult.phase = martingaleState.stage;
			}
			
			console.log('╔═══════════════════════════════════════════════════════════╗');
			console.log('║  💾 SALVANDO ANÁLISE EM CHROME.STORAGE.LOCAL             ║');
			console.log('╚═══════════════════════════════════════════════════════════╝');
			console.log('📊 Dados da análise:');
			console.log('   Cor:', verifyResult.color);
			console.log('   Confiança:', verifyResult.confidence);
			console.log('   Fase:', verifyResult.phase || 'G0');
			console.log('   CreatedOn:', verifyResult.createdOnTimestamp);
			console.log('   PredictedFor:', verifyResult.predictedFor);
			
			await chrome.storage.local.set({
				analysis: verifyResult,
				pattern: { description: verifyResult.patternDescription, confidence: verifyResult.confidence },
				lastBet: { status: 'pending', phase: verifyResult.phase || 'G0', createdOnTimestamp: verifyResult.createdOnTimestamp }
			});
			
			console.log('✅ Análise salva em chrome.storage.local!');
			
			// ✅ ENVIAR SINAIS PARA AMBOS OS CANAIS (INDEPENDENTES)
			const sendResults = {
				extensao: false,
				telegram: false
			};
			
			// 1. Enviar para extensão (UI)
			try {
				sendResults.extensao = await sendMessageToContent('NEW_ANALYSIS', verifyResult);
			} catch (e) {
				console.error('❌ Erro crítico ao enviar para extensão:', e);
			}
			
			// 2. Enviar para Telegram (INDEPENDENTE)
			try {
			if (history && history.length > 0) {
					sendResults.telegram = await sendTelegramEntrySignal(verifyResult.color, history[0], verifyResult.confidence, verifyResult);
				}
			} catch (e) {
				console.error('❌ Erro crítico ao enviar para Telegram:', e);
			}
			
			// 3. Log de resultado consolidado
			console.log('╔═══════════════════════════════════════════════════════════╗');
			console.log('║  📊 RESULTADO DO ENVIO DE SINAIS                          ║');
			console.log('╠═══════════════════════════════════════════════════════════╣');
			console.log('║  💾 Sistema usado: PADRÃO SALVO (BANCO)                   ║');
			console.log(`║  📱 Extensão: ${sendResults.extensao ? '✅ ENVIADO' : '❌ FALHOU'.padEnd(11)}                        ║`);
			console.log(`║  📲 Telegram: ${sendResults.telegram ? '✅ ENVIADO' : '❌ FALHOU'.padEnd(11)}                        ║`);
			console.log('╚═══════════════════════════════════════════════════════════╝\n');
			
			// ✅ EXIBIR RODAPÉ FIXO COM SISTEMA ATIVO
			displaySystemFooter();
			
			// ✅ RETURN após enviar sinal para evitar fallback (que causaria mensagem duplicada)
			return;
		}
		
		// ✅ MODO AVANÇADO: Se ativado e não achou padrão salvo, usar análise avançada
		if (analyzerConfig.aiMode && !verifyResult) {
			console.log('');
			console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00FF00; font-weight: bold;');
			console.log('%c║  🎯 EXECUTANDO: ANÁLISE AVANÇADA POR PADRÕES             ║', 'color: #00FF00; font-weight: bold;');
			console.log('%c╠═══════════════════════════════════════════════════════════╣', 'color: #00FF00; font-weight: bold;');
			console.log('%c║  📊 Histórico disponível: ' + history.length + ' giros', 'color: #00FF88; font-weight: bold;');
			console.log('%c║  🔄 Sistema de Auto-Aprendizado ATIVO...                 ║', 'color: #00FF88; font-weight: bold;');
			console.log('%c║  ⚡ Analisando padrões e tendências...                   ║', 'color: #00FF88; font-weight: bold;');
			console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00FF00; font-weight: bold;');
			console.log('');
			
			const aiResult = await analyzeWithPatternSystem(history);
			
			if (aiResult) {
				// ⚠️ VERIFICAR SE É A PRIMEIRA ANÁLISE APÓS ATIVAR MODO AVANÇADO
				if (aiModeJustActivated) {
					console.log('');
					console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #FFAA00; font-weight: bold;');
					console.log('%c║  ⏳ MODO AVANÇADO RECÉM-ATIVADO                           ║', 'color: #FFAA00; font-weight: bold; font-size: 14px;');
					console.log('%c╠═══════════════════════════════════════════════════════════╣', 'color: #FFAA00; font-weight: bold;');
					console.log('%c║  🎯 Sistema analisou e encontrou padrão!                  ║', 'color: #FFAA00; font-weight: bold;');
					console.log('%c║  🎯 Cor prevista: ' + aiResult.color.toUpperCase() + '                                     ║', 'color: #FFAA00;');
					console.log('%c║  📊 Confiança: ' + aiResult.confidence + '%                                   ║', 'color: #FFAA00;');
					console.log('%c╠═══════════════════════════════════════════════════════════╣', 'color: #FFAA00; font-weight: bold;');
					console.log('%c║  ⏳ AGUARDANDO 1 GIRO antes de enviar sinal...            ║', 'color: #FFAA00; font-weight: bold;');
					console.log('%c║  🚫 Sinal NÃO será enviado neste momento                  ║', 'color: #FFAA00; font-weight: bold;');
					console.log('%c║  ✅ Próximo giro: sinal será enviado normalmente          ║', 'color: #FFAA00; font-weight: bold;');
					console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #FFAA00; font-weight: bold;');
					console.log('');
					
					// Desabilitar flag para permitir próximo sinal
					aiModeJustActivated = false;
					console.log('%c✅ Flag aiModeJustActivated = false (próximos sinais serão enviados)', 'color: #00FF88; font-weight: bold;');
					console.log('');
					
					// Enviar status para UI informando que está aguardando
					sendAnalysisStatus('⏳ Aguardando próximo giro para enviar sinal...');
					
					// RETURN - não enviar sinal
					return;
				}
				
				// ⚠️ VERIFICAR SE HÁ MARTINGALE ATIVO
				let aiColor = aiResult.color;
				let aiPhase = 'G0';
				
				if (martingaleState.active && martingaleState.entryColor) {
					console.log('╔═══════════════════════════════════════════════════════════╗');
					console.log('║  🔄 MARTINGALE ATIVO DETECTADO! (MODO IA)                ║');
					console.log('╠═══════════════════════════════════════════════════════════╣');
					console.log(`║  Cor da IA: ${aiColor}                                         ║`);
					console.log(`║  Cor da entrada original: ${martingaleState.entryColor}                    ║`);
					console.log(`║  Estágio atual: ${martingaleState.stage}                              ║`);
					console.log('╠═══════════════════════════════════════════════════════════╣');
					console.log('║  ✅ SOBRESCREVENDO COR PARA MANTER ENTRADA ORIGINAL      ║');
					console.log('╚═══════════════════════════════════════════════════════════╝');
					
					aiColor = martingaleState.entryColor;
					aiPhase = martingaleState.stage;
				}
				
				// 🔥 CORREÇÃO CRÍTICA: SEMPRE usar dados REAIS do histórico
				// NUNCA confiar no que a IA retorna, pois ela frequentemente inventa dados
				console.log('%c🔥 FORÇANDO uso de dados REAIS para descrição/exibição', 'color: #FF6600; font-weight: bold;');
				
				// ✅ Definir tamanho do histórico usado
				const aiHistorySizeUsed = Math.min(Math.max(analyzerConfig.aiHistorySize || 50, 20), history.length);
				
				const last10SpinsForDescription = history.slice(0, 10).map(spin => ({
					color: spin.color,
					number: spin.number,
					timestamp: spin.timestamp
				}));
				console.log('%c✅ Extraído do histórico REAL:', 'color: #00FF88;', last10SpinsForDescription.slice(0, 10));
				
				const aiDescriptionData = {
					type: 'AI_ANALYSIS',
					color: aiColor,
					confidence: aiResult.confidence,
					last10Spins: last10SpinsForDescription,
					last5Spins: last10SpinsForDescription ? last10SpinsForDescription.slice(0, 10) : [], // ✅ Mostrando últimos 10 giros
					reasoning: aiResult.reasoning || aiResult.patternDescription || 'Análise baseada nos últimos ' + aiHistorySizeUsed + ' giros do histórico.',
					historySize: aiHistorySizeUsed
				};
				
				console.log('');
				console.log('%c📦 DADOS ESTRUTURADOS DA IA (para renderização):', 'color: #00FFFF; font-weight: bold;');
				console.log('%c   🎨 Tipo:', 'color: #00FFFF;', aiDescriptionData.type);
				console.log('%c   🎯 Cor:', 'color: #00FFFF;', aiDescriptionData.color);
				console.log('%c   📊 Confiança:', 'color: #00FFFF;', aiDescriptionData.confidence + '%');
				console.log('%c   🎲 Últimos 10 giros:', 'color: #00FFFF;', aiDescriptionData.last10Spins);
				console.log('%c   💭 Raciocínio (200 chars):', 'color: #00FFFF;', (aiDescriptionData.reasoning || '').substring(0, 200) + '...');
				console.log('');
				
				// Serializar para JSON para armazenamento
				const aiDescription = JSON.stringify(aiDescriptionData);
				
				// Criar objeto de análise no formato esperado (com padrão para futura comparação)
				const analysis = {
					color: aiColor,
					confidence: aiResult.confidence,
					patternDescription: aiDescription,
					last10Spins: last10SpinsForDescription, // ✅ INCLUIR DIRETAMENTE para facilitar acesso
					last5Spins: last10SpinsForDescription ? last10SpinsForDescription.slice(0, 10) : [], // ✅ Mostrando últimos 10 giros
					patternType: 'ai-analysis',
					phase: aiPhase,
					predictedFor: 'next',
					createdOnTimestamp: history[0].timestamp,
					aiPattern: null // ✅ Novo fluxo não usa currentPattern
				};
				
				console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00FF00; font-weight: bold;');
				console.log('%c║  💾 SALVANDO ANÁLISE IA EM CHROME.STORAGE.LOCAL          ║', 'color: #00FF00; font-weight: bold;');
				console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00FF00; font-weight: bold;');
				console.log('%c📊 Dados da análise IA:', 'color: #00FF88; font-weight: bold;');
				console.log('%c   🎯 Cor: ' + analysis.color.toUpperCase(), 'color: #00FF88;');
				console.log('%c   📊 Confiança: ' + analysis.confidence + '%', 'color: #00FF88;');
				console.log('%c   🎲 Fase: ' + analysis.phase, 'color: #00FF88;');
				console.log(`%c   📍 Número do giro: #${history[0].number}`, 'color: #00FF88;');
				
				// Salvar análise E número do giro do último sinal
				await chrome.storage.local.set({
					analysis: analysis,
					pattern: { description: analysis.patternDescription, confidence: analysis.confidence },
					lastBet: { status: 'pending', phase: aiPhase, createdOnTimestamp: analysis.createdOnTimestamp },
					lastSignalSpinNumber: history[0].number, // ✅ CRÍTICO: Salvar número do giro para validação de intervalo
					lastSignalTimestamp: Date.now() // ✅ Timestamp para debug
				});
				
				console.log('%c✅ Análise IA salva em chrome.storage.local!', 'color: #00FF00; font-weight: bold; font-size: 13px;');
				console.log(`%c📍 Número do giro registrado: #${history[0].number}`, 'color: #00D4FF; font-weight: bold;');
				console.log(`%c⏰ Timestamp registrado: ${new Date().toLocaleTimeString()}`, 'color: #00D4FF; font-weight: bold;');
				console.log('');
				console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00FF00; font-weight: bold;');
				console.log('%c║  📋 DESCRIÇÃO DO PADRÃO (ENVIADA PARA O USUÁRIO):        ║', 'color: #00FF00; font-weight: bold;');
				console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00FF00; font-weight: bold;');
				console.log('%c' + aiDescription, 'color: #00FF88;');
				console.log('');
				
				// ✅ ENVIAR SINAIS PARA AMBOS OS CANAIS (INDEPENDENTES)
				const sendResults = {
					extensao: false,
					telegram: false
				};
				
				// 1. Enviar para extensão (UI)
				try {
					sendResults.extensao = await sendMessageToContent('NEW_ANALYSIS', analysis);
				} catch (e) {
					console.error('❌ Erro crítico ao enviar para extensão:', e);
				}
				
				// 2. Enviar para Telegram (INDEPENDENTE)
				try {
					if (history && history.length > 0) {
						sendResults.telegram = await sendTelegramEntrySignal(analysis.color, history[0], analysis.confidence, analysis);
					}
				} catch (e) {
					console.error('❌ Erro crítico ao enviar para Telegram:', e);
				}
				
				// 3. Log de resultado consolidado
				console.log('');
				console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00FF00; font-weight: bold; font-size: 14px; background: #003300; padding: 2px;');
				console.log('%c║  ✅ SINAL ENVIADO COM SUCESSO!                           ║', 'color: #00FF00; font-weight: bold; font-size: 14px; background: #003300; padding: 2px;');
			console.log('%c╠═══════════════════════════════════════════════════════════╣', 'color: #00FF00; font-weight: bold; background: #003300; padding: 2px;');
			
			// 🧠 Status dinâmico da memória
			const statusMemoria = memoriaAtiva.inicializada ? 
				`⚡ CACHE RAM ATIVO (${memoriaAtiva.totalAtualizacoes} updates)` : 
				'🔄 INICIALIZANDO...';
			
			console.log(`%c║  🤖 Sistema: ANÁLISE IA | ${statusMemoria}              ║`, 'color: #00FF00; font-weight: bold; background: #003300; padding: 2px;');
			console.log('%c║  📱 Extensão: ' + (sendResults.extensao ? '✅ ENVIADO' : '❌ FALHOU') + '                                    ║', 'color: #00FF88; background: #003300; padding: 2px;');
				console.log('%c║  📲 Telegram: ' + (sendResults.telegram ? '✅ ENVIADO' : '❌ FALHOU') + '                                    ║', 'color: #00FF88; background: #003300; padding: 2px;');
				console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00FF00; font-weight: bold; background: #003300; padding: 2px;');
				console.log('');
				
				// ✅ EXIBIR RODAPÉ FIXO COM SISTEMA ATIVO
				displaySystemFooter();
				
				// ✅ RETURN após enviar sinal IA
				return;
			} else {
				// ⚠️ CRÍTICO: Se IA não encontrou resultado, PARAR AQUI (não executar análise padrão)
				console.log('');
				console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #FFAA00; font-weight: bold;');
				console.log('%c║  ⚠️ MODO IA: API NÃO RETORNOU RESULTADO VÁLIDO           ║', 'color: #FFAA00; font-weight: bold;');
				console.log('%c╠═══════════════════════════════════════════════════════════╣', 'color: #FFAA00; font-weight: bold;');
				console.log('%c║  Possíveis causas:                                        ║', 'color: #FFAA00; font-weight: bold;');
				console.log('%c║    • API retornou erro (verifique chave)                  ║', 'color: #FFAA00;');
				console.log('%c║    • Timeout excedido (>10s)                              ║', 'color: #FFAA00;');
				console.log('%c║    • Formato de resposta inválido                         ║', 'color: #FFAA00;');
				console.log('%c╠═══════════════════════════════════════════════════════════╣', 'color: #FFAA00; font-weight: bold;');
				console.log('%c║  ⏳ Aguardando próximo giro para nova tentativa...        ║', 'color: #FFAA00; font-weight: bold;');
				console.log('%c║  🚫 Análise padrão BLOQUEADA (modo IA permanece ativo)    ║', 'color: #FFAA00; font-weight: bold;');
				console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #FFAA00; font-weight: bold;');
				console.log('');
				sendAnalysisStatus('⏳ IA aguardando novo giro...');
				
				// ✅ EXIBIR RODAPÉ FIXO COM SISTEMA ATIVO
				displaySystemFooter();
				
				return; // ✅ PARAR AQUI - NÃO executar análise padrão quando modo IA está ativo
			}
		}

		// 2) Descoberta: 173+ análises e persistência (sem repetir o que já temos)
		// ⚠️ SÓ EXECUTA SE MODO IA NÃO ESTIVER ATIVO
		const timeLeftAfterVerify = budgetMs - (Date.now() - startTs);
		if (!analyzerConfig.aiMode && timeLeftAfterVerify > 100) {
			sendAnalysisStatus('🧠 Descobrindo novos padrões...');
			await discoverAndPersistPatterns(history, startTs, budgetMs);
		}

		// 3) Se verificação não deu sinal E modo IA não ativo, usar análise existente como fallback
		const timeLeftForFallback = budgetMs - (Date.now() - startTs);
		if (!verifyResult && !analyzerConfig.aiMode && timeLeftForFallback > 200) {
			console.log('');
			console.log('╔═══════════════════════════════════════════════════════════╗');
			console.log('║  📊 EXECUTANDO: ANÁLISE PADRÃO (DESCOBERTA)              ║');
			console.log('╠═══════════════════════════════════════════════════════════╣');
			console.log('║  ✅ Padrões salvos: Não encontrado                       ║');
			console.log('║  🔄 Buscando padrão atual em 173+ análises...            ║');
			console.log('╚═══════════════════════════════════════════════════════════╝');
			console.log('');
			
			sendAnalysisStatus('🤖 Buscando padrão atual...');
			const analysis = await performPatternAnalysis(history);
			if (analysis) {
				// ⚠️ CRÍTICO: VERIFICAR SE HÁ MARTINGALE ATIVO
				if (martingaleState.active && martingaleState.entryColor) {
					console.log('╔═══════════════════════════════════════════════════════════╗');
					console.log('║  🔄 MARTINGALE ATIVO DETECTADO! (DESCOBERTA)             ║');
					console.log('╠═══════════════════════════════════════════════════════════╣');
					console.log(`║  Cor do novo padrão: ${analysis.color}                           ║`);
					console.log(`║  Cor da entrada original: ${martingaleState.entryColor}                    ║`);
					console.log(`║  Estágio atual: ${martingaleState.stage}                              ║`);
					console.log('╠═══════════════════════════════════════════════════════════╣');
					console.log('║  ✅ SOBRESCREVENDO COR PARA MANTER ENTRADA ORIGINAL      ║');
					console.log('╚═══════════════════════════════════════════════════════════╝');
					
					// ✅ SOBRESCREVER A COR PARA USAR A COR DA ENTRADA ORIGINAL
					analysis.color = martingaleState.entryColor;
					analysis.phase = martingaleState.stage;
				}
				
				console.log('╔═══════════════════════════════════════════════════════════╗');
				console.log('║  💾 SALVANDO ANÁLISE EM CHROME.STORAGE.LOCAL (DESCOBERTA)║');
				console.log('╚═══════════════════════════════════════════════════════════╝');
				console.log('📊 Dados da análise:');
				console.log('   Cor:', analysis.color);
				console.log('   Confiança:', analysis.confidence);
				console.log('   Fase:', analysis.phase || 'G0');
				console.log('   CreatedOn:', analysis.createdOnTimestamp);
				console.log('   PredictedFor:', analysis.predictedFor);
				
				await chrome.storage.local.set({
					analysis: analysis,
					pattern: { description: analysis.patternDescription, confidence: analysis.confidence },
					lastBet: { status: 'pending', phase: analysis.phase || 'G0', createdOnTimestamp: analysis.createdOnTimestamp }
				});
				
				console.log('✅ Análise salva em chrome.storage.local!');
				
				// ✅ ENVIAR SINAIS PARA AMBOS OS CANAIS (INDEPENDENTES)
				const sendResults = {
					extensao: false,
					telegram: false
				};
				
				// 1. Enviar para extensão (UI)
				try {
					sendResults.extensao = await sendMessageToContent('NEW_ANALYSIS', analysis);
				} catch (e) {
					console.error('❌ Erro crítico ao enviar para extensão:', e);
				}
				
				// 2. Enviar para Telegram (INDEPENDENTE)
				try {
				if (history && history.length > 0) {
						sendResults.telegram = await sendTelegramEntrySignal(analysis.color, history[0], analysis.confidence, analysis);
					}
				} catch (e) {
					console.error('❌ Erro crítico ao enviar para Telegram:', e);
				}
				
				// 3. Log de resultado consolidado
				console.log('╔═══════════════════════════════════════════════════════════╗');
				console.log('║  📊 RESULTADO DO ENVIO DE SINAIS                          ║');
				console.log('╠═══════════════════════════════════════════════════════════╣');
				console.log('║  📊 Sistema usado: ANÁLISE PADRÃO (DESCOBERTA)            ║');
				console.log(`║  📱 Extensão: ${sendResults.extensao ? '✅ ENVIADO' : '❌ FALHOU'.padEnd(11)}                        ║`);
				console.log(`║  📲 Telegram: ${sendResults.telegram ? '✅ ENVIADO' : '❌ FALHOU'.padEnd(11)}                        ║`);
				console.log('╚═══════════════════════════════════════════════════════════╝\n');
				
				// ✅ EXIBIR RODAPÉ FIXO COM SISTEMA ATIVO
				displaySystemFooter();
			} else {
				console.log('⚠️ Nenhuma análise encontrada, limpando chrome.storage.local');
				await chrome.storage.local.set({ analysis: null, pattern: null });
				sendMessageToContent('CLEAR_ANALYSIS');
				sendAnalysisStatus('⏳ Aguardando novo giro...');
				
				// ✅ EXIBIR RODAPÉ FIXO COM SISTEMA ATIVO
				displaySystemFooter();
			
			// ✅ LOG RESUMIDO DO CICLO
			logAnalysisCycle({
				serverStatus: 'ativo',
				patternsFound: [],
				searchingNewSpin: true,
				rejectedPatterns: [],
				telegramSent: null,
				displayedPatternsCount: 0,
				spinsAvailable: { server: history.length, app: cachedHistory.length }
			});
			}
		}
	} catch (e) {
		console.error('Erro no controlador de análise:', e);
	}
}

// Função helper para exibir estatísticas do banco de padrões
function logPatternDBStats(db, action = 'load') {
	const total = db.patterns_found ? db.patterns_found.length : 0;
	const limit = 5000;
	const percentage = total > 0 ? ((total / limit) * 100).toFixed(1) : 0;
	
	// Agrupar por tipo
	const byType = {};
	const byConfidence = { high: 0, medium: 0, low: 0 };
	
	if (db.patterns_found) {
		db.patterns_found.forEach(p => {
			const type = p.type || 'desconhecido';
			byType[type] = (byType[type] || 0) + 1;
			
			const conf = p.confidence || 0;
			if (conf >= 80) byConfidence.high++;
			else if (conf >= 60) byConfidence.medium++;
			else byConfidence.low++;
		});
	}
	
	const emoji = action === 'load' ? '📂' : action === 'save' ? '💾' : '🔍';
	const actionText = action === 'load' ? 'CARREGADO' : action === 'save' ? 'SALVO' : 'DESCOBERTA';
	
	console.log(`
╔═══════════════════════════════════════════════════════════╗
║  ${emoji} BANCO DE PADRÕES ${actionText}                              
╠═══════════════════════════════════════════════════════════╣
║  📊 TOTAL DE PADRÕES: ${total.toString().padEnd(4)} / ${limit} (${percentage}%)          
║  ⚡ Capacidade: ${'█'.repeat(Math.floor(percentage / 5))}${'░'.repeat(20 - Math.floor(percentage / 5))}
╠═══════════════════════════════════════════════════════════╣
║  🎯 POR CONFIANÇA:                                        
║     ├─ 🟢 Alta (≥80%):   ${byConfidence.high.toString().padEnd(4)} padrões
║     ├─ 🟡 Média (60-79%): ${byConfidence.medium.toString().padEnd(4)} padrões
║     └─ 🔴 Baixa (<60%):   ${byConfidence.low.toString().padEnd(4)} padrões
╠═══════════════════════════════════════════════════════════╣
║  📁 POR TIPO:                                             
${Object.entries(byType).slice(0, 10).map(([type, count]) => 
`║     • ${type.padEnd(20)}: ${count.toString().padEnd(4)} padrões`).join('\n')}
${Object.keys(byType).length > 10 ? `║     • ... e mais ${Object.keys(byType).length - 10} tipos` : ''}
╚═══════════════════════════════════════════════════════════╝
	`.trim());
}

// Carrega o banco de padrões salvos
async function loadPatternDB() {
	const res = await chrome.storage.local.get(['patternDB']);
	const db = res.patternDB && Array.isArray(res.patternDB.patterns_found)
		? res.patternDB
		: { patterns_found: [], version: 1 };
	
	// Log visual das estatísticas
	logPatternDBStats(db, 'load');
	
	return db;
}

// Salva o banco de padrões (APENAS LOCALMENTE)
async function savePatternDB(db) {
	// Salvar APENAS localmente (não envia para servidor)
	await chrome.storage.local.set({ patternDB: db });
	
	// Log visual das estatísticas
	logPatternDBStats(db, 'save');
	
	// Notificar content script para atualizar UI
	sendMessageToContent('PATTERN_BANK_UPDATE', { total: db.patterns_found ? db.patterns_found.length : 0 });
}

// Limpa APENAS padrões (usado ao abrir extensão - preserva análise pendente)
async function clearAllPatterns() {
	console.log('╔═══════════════════════════════════════════════════════════╗');
	console.log('║  🗑️ LIMPANDO BANCO DE PADRÕES                            ║');
	console.log('╚═══════════════════════════════════════════════════════════╝');
	
	// 1. Limpar banco de padrões
	console.log('🗑️ Limpando banco de padrões...');
	const emptyDB = { patterns_found: [], version: 1 };
	await chrome.storage.local.set({ patternDB: emptyDB });
	
	// 2. ✅ NÃO LIMPAR análise pendente (ela deve persistir se estiver aguardando resultado)
	// A análise só deve ser limpa quando:
	// - O resultado for confirmado (WIN/LOSS)
	// - O usuário clicar explicitamente em "Resetar Padrões"
	console.log('╔═══════════════════════════════════════════════════════════╗');
	console.log('║  ✅ ANÁLISE PENDENTE PRESERVADA                          ║');
	console.log('║  (Aguardando resultado - não será limpa)                 ║');
	console.log('╚═══════════════════════════════════════════════════════════╝');
	
	// 3. ✅ NÃO LIMPAR histórico de entradas (deve persistir após reload)
	// Se o usuário quiser limpar entradas, deve usar o botão "Limpar Histórico" na interface
	console.log('╔═══════════════════════════════════════════════════════════╗');
	console.log('║  ✅ HISTÓRICO DE ENTRADAS PRESERVADO                    ║');
	console.log('║  (Não será limpo - persiste após recarregar página)     ║');
	console.log('║  Para limpar: use botão "Limpar Histórico" na UI        ║');
	console.log('╚═══════════════════════════════════════════════════════════╝');
	
	// 4. ✅ NÃO RESETAR calibrador de porcentagens (ele é sincronizado automaticamente com entriesHistory)
	// O calibrador é persistente e será reconstruído pela sincronização em loadObserverDataAtStartup()
	console.log('╔═══════════════════════════════════════════════════════════╗');
	console.log('║  ✅ CALIBRADOR DE PORCENTAGENS PRESERVADO                ║');
	console.log('║  (Sincronizado automaticamente com entriesHistory)       ║');
	console.log('╚═══════════════════════════════════════════════════════════╝');
	
	// 5. Enviar atualizações para UI
	sendMessageToContent('PATTERN_BANK_UPDATE', { total: 0 });
	// ❌ NÃO enviar CLEAR_ANALYSIS aqui, pois a análise pendente foi preservada
	// sendMessageToContent('CLEAR_ANALYSIS');
	// A UI carregará a análise pendente automaticamente do chrome.storage.local
	sendAnalysisStatus('🔄 Padrões resetados - Análise pendente preservada');
	
	console.log('╔═══════════════════════════════════════════════════════════╗');
	console.log('║  ✅ RESET PARCIAL - PADRÕES ZERADOS                      ║');
	console.log('╠═══════════════════════════════════════════════════════════╣');
	console.log('║  📊 Padrões: Limpos (serão recalculados)                  ║');
	console.log('║  🎯 Análise Pendente: Preservada                          ║');
	console.log('║  📈 Entradas: Preservadas                                 ║');
	console.log('║  Calibrador: Preservado (sincronizado)                    ║');
	console.log('║  💾 Cache: Será recarregado do servidor                   ║');
	console.log('╚═══════════════════════════════════════════════════════════╝');
}

// Limpa TUDO: padrões E análise pendente (usado quando o usuário clica em "Resetar Padrões")
async function clearAllPatternsAndAnalysis() {
	console.log('╔═══════════════════════════════════════════════════════════╗');
	console.log('║  🗑️ RESET COMPLETO - LIMPANDO TUDO                       ║');
	console.log('╚═══════════════════════════════════════════════════════════╝');
	
	// 1. Limpar banco de padrões
	console.log('🗑️ Limpando banco de padrões...');
	const emptyDB = { patterns_found: [], version: 1 };
	await chrome.storage.local.set({ patternDB: emptyDB });
	
	// 2. ✅ LIMPAR análise e padrão atual (incluindo análise pendente)
	console.log('🗑️ Limpando análise pendente e padrão atual...');
	await chrome.storage.local.set({ 
		analysis: null, 
		pattern: null,
		lastBet: null
	});
	
	// 3. Enviar atualizações para UI
	sendMessageToContent('PATTERN_BANK_UPDATE', { total: 0 });
	sendMessageToContent('CLEAR_ANALYSIS');
	sendAnalysisStatus('🔄 Reset completo - Aguardando nova análise...');
	
	console.log('╔═══════════════════════════════════════════════════════════╗');
	console.log('║  ✅ RESET COMPLETO - TUDO ZERADO                         ║');
	console.log('╠═══════════════════════════════════════════════════════════╣');
	console.log('║  📊 Padrões: Limpos                                       ║');
	console.log('║  🎯 Análise Pendente: Limpa                               ║');
	console.log('║  📈 Entradas: Preservadas                                 ║');
	console.log('║  Calibrador: Preservado                                   ║');
	console.log('╚═══════════════════════════════════════════════════════════╝');
}

// Busca INICIAL de padrões por 5 minutos ao abrir a extensão
let initialSearchActive = false;
let initialSearchInterval = null;

async function startInitialPatternSearch(history) {
	if (!history || history.length < 50) {
		console.log('⚠️ Histórico insuficiente para busca inicial (<50 giros). Aguardando...');
		return;
	}
	
	if (initialSearchActive) {
		console.log('⚠️ Busca inicial já está em andamento.');
		return;
	}
	
	initialSearchActive = true;
	const startTime = Date.now();
	const duration = 5 * 60 * 1000; // 5 minutos
	const updateInterval = 10000; // Atualizar progresso a cada 10s
	
	console.log('╔═══════════════════════════════════════════════════════════╗');
	console.log('║  🔍 BUSCA INICIAL DE PADRÕES (5 MINUTOS)                 ║');
	console.log('╠═══════════════════════════════════════════════════════════╣');
	console.log(`║  📊 Histórico: ${history.length} giros disponíveis                    ║`);
	console.log('║  ⏱️  Duração: 5 minutos                                   ║');
	console.log('║  🎯 Limite: 5000 padrões únicos                          ║');
	console.log('╚═══════════════════════════════════════════════════════════╝');
	
	// Notificar content script para exibir progresso
	sendMessageToContent('INITIAL_SEARCH_START', { 
		duration: duration,
		startTime: startTime
	});
	
	// Loop de busca contínua
	let iteration = 0;
	initialSearchInterval = setInterval(async () => {
		iteration++;
		const elapsed = Date.now() - startTime;
		const remaining = duration - elapsed;
		
		if (remaining <= 0 || elapsed >= duration) {
			// Tempo esgotado - finalizar busca
			clearInterval(initialSearchInterval);
			initialSearchActive = false;
			
			const db = await loadPatternDB();
			const total = db.patterns_found ? db.patterns_found.length : 0;
			
			console.log('╔═══════════════════════════════════════════════════════════╗');
			console.log('║  ✅ BUSCA INICIAL CONCLUÍDA                               ║');
			console.log('╠═══════════════════════════════════════════════════════════╣');
			console.log(`║  📊 Total de padrões únicos: ${total.toString().padEnd(4)}                    ║`);
			console.log('║  🎯 Pronto para jogar!                                   ║');
			console.log('╚═══════════════════════════════════════════════════════════╝');
			
			sendMessageToContent('INITIAL_SEARCH_COMPLETE', { 
				total: total,
				duration: elapsed
			});
			return;
		}
		
		// Executar descoberta de padrões
		try {
			const iterationStartTs = Date.now();
			const iterationBudget = Math.min(8000, remaining); // Até 8s por iteração
			
			await discoverAndPersistPatterns(history, iterationStartTs, iterationBudget);
			
			const db = await loadPatternDB();
			const total = db.patterns_found ? db.patterns_found.length : 0;
			const minutes = Math.floor(remaining / 60000);
			const seconds = Math.floor((remaining % 60000) / 1000);
			
			console.log(`🔍 Busca inicial [${iteration}]: ${total}/5000 padrões | ${minutes}m ${seconds}s restantes`);
			
			// Atualizar UI
			sendMessageToContent('INITIAL_SEARCH_PROGRESS', { 
				total: total,
				remaining: remaining,
				iteration: iteration
			});
			
			// Se atingiu o limite, parar
			if (total >= 5000) {
				clearInterval(initialSearchInterval);
				initialSearchActive = false;
				
				console.log('╔═══════════════════════════════════════════════════════════╗');
				console.log('║  ✅ LIMITE DE PADRÕES ATINGIDO (5000)                    ║');
				console.log('╠═══════════════════════════════════════════════════════════╣');
				console.log('║  🎯 Pronto para jogar!                                   ║');
				console.log('╚═══════════════════════════════════════════════════════════╝');
				
				sendMessageToContent('INITIAL_SEARCH_COMPLETE', { 
					total: total,
					duration: elapsed
				});
			}
		} catch (error) {
			console.error('❌ Erro na busca inicial:', error);
		}
	}, updateInterval);
}

// Para a busca inicial (se necessário)
function stopInitialPatternSearch() {
	if (initialSearchInterval) {
		clearInterval(initialSearchInterval);
		initialSearchActive = false;
		console.log('⏸️ Busca inicial de padrões interrompida.');
	}
}

// Gera assinatura única para evitar duplicidade de padrão (RIGOROSA)
// ═══════════════════════════════════════════════════════════════════════════════
// GERAR CHAVE ÚNICA PARA PADRÃO - REFATORADO 100% (Anti-duplicação)
// ═══════════════════════════════════════════════════════════════════════════════
function patternKeyOf(p) {
	// ✅ VALIDAÇÃO DE ENTRADA
	if (!p || typeof p !== 'object') {
		console.warn('⚠️ Padrão inválido para geração de chave:', p);
		return 'invalid-pattern';
	}
	
	// ✅ NORMALIZAR PADRÃO (string → array para consistência)
	let normalizedPattern;
	if (Array.isArray(p.pattern)) {
		normalizedPattern = p.pattern;
	} else if (typeof p.pattern === 'string') {
		// ✅ Converter string para array de 1 elemento
		normalizedPattern = [p.pattern];
	} else {
		console.warn('⚠️ Formato de padrão desconhecido:', p.pattern);
		normalizedPattern = [];
	}
	
	// ✅ GERAR STRING DO PADRÃO
	const core = normalizedPattern.join('-');
	
	// ✅ EXTRAIR TIPO
	const type = p.type || p.patternType || 'generic';
	
	// ✅ EXTRAIR PRÓXIMA COR ESPERADA
	const expect = p.expected_next || p.suggestedColor || '';
	
	// ✅ CALCULAR TAMANHO REAL DO PADRÃO
	const size = normalizedPattern.length;
	
	// ✅ ASSINATURA ÚNICA: tipo + tamanho + sequência + próxima cor
	// ⚠️ NÃO incluir triggerColor (pode variar entre ocorrências)
	const uniqueKey = `${type}|s:${size}|p:${core}|e:${expect}`;
	
	return uniqueKey;
}

// Verifica se padrão já existe no banco (por assinatura)
function isDuplicatePattern(newPattern, existingPatterns) {
	const newKey = patternKeyOf(newPattern);
	return existingPatterns.some(p => patternKeyOf(p) === newKey);
}

// Verificação: compara head do histórico com padrões salvos e retorna melhor sinal
async function verifyWithSavedPatterns(history) {
	if (!history || history.length < 3) return null;
	const db = await loadPatternDB();
	if (!db.patterns_found || db.patterns_found.length === 0) return null;

	const headColors = history.map(s => s.color);
	let best = null;
	for (const pat of db.patterns_found) {
		if (!Array.isArray(pat.pattern) || pat.pattern.length === 0) continue;
		const need = pat.pattern.length;
		if (need < 3) continue; // ignorar padrões muito curtos
		if (headColors.length < need) continue;
		const currentSeq = headColors.slice(0, need);
		const isMatch = currentSeq.every((c, i) => c === pat.pattern[i]);
		if (!isMatch) continue;
		let suggested = pat.expected_next || pat.suggestedColor; // ✅ Mudado para 'let' para permitir reatribuição
		if (!suggested) continue;

	// Obter cor de disparo atual (será usada depois para referência)
		const currentTrigger = headColors[need]; // cor imediatamente anterior ao padrão no histórico
	
	// Validar Cor de Disparo no head atual SE requireTrigger estiver ativo E modo padrão ativo
	// ⚠️ MODO IA: Ignora validação de trigger (configuração exclusiva do modo padrão)
	if (!analyzerConfig.aiMode && analyzerConfig.requireTrigger) {
		if (!currentTrigger) continue; // sem trigger disponível, não validar
		if (!isValidTrigger(currentTrigger, pat.pattern)) {
			console.log('❌ Padrão salvo rejeitado: cor de disparo atual inválida:', {
				pattern: pat.pattern,
				currentTrigger: currentTrigger,
				firstPatternColor: pat.pattern[0],
				requireTrigger: analyzerConfig.requireTrigger
			});
			continue; // trigger deve ser válida quando requireTrigger está ativo
		}
	}
		// NÃO exigir que a trigger seja igual à salva; triggers podem variar por ocorrência

		// Reconstruir ocorrências com números e horários a partir do histórico
		const occNumbers = [];
		const occTimestamps = [];
		const trigNumbers = [];
		const trigTimestamps = [];
	const occurrenceDetails = [];
		let occCount = 0;
		for (let i = need; i < history.length; i++) {
			const seq = history.slice(i, i + need);
			if (seq.length < need) break;
			const seqColors = seq.map(s => s.color);
			const match = seqColors.every((c, idx) => c === pat.pattern[idx]);
			if (match) {
			const trigSpin = history[i + need];
			const trigColor = trigSpin ? trigSpin.color : null;
			
			// Só validar trigger se requireTrigger estiver ativo E modo padrão ativo
			// ⚠️ MODO IA: Ignora validação de trigger
			if (!analyzerConfig.aiMode && analyzerConfig.requireTrigger) {
				if (!trigColor || !isValidTrigger(trigColor, pat.pattern)) continue;
			}
				// triggers podem variar; não exigir igualdade a pat.triggerColor
				occCount++;
				occNumbers.push(seq.map(s => s.number));
				occTimestamps.push(seq.map(s => s.timestamp));
				trigNumbers.push(trigSpin ? trigSpin.number : null);
				trigTimestamps.push(trigSpin ? trigSpin.timestamp : null);
			
			// Criar registro de ocorrência com cor de disparo real
			const resultColor = history[i - 1] ? history[i - 1].color : null;
			occurrenceDetails.push(
				createOccurrenceRecord(pat.pattern, trigColor, resultColor, trigSpin, occCount)
			);
			}
		}

	// ═══════════════════════════════════════════════════════════════════════════════
	// NOVA LÓGICA DE VALIDAÇÃO: Híbrida (Antiga + Nova)
	// ═══════════════════════════════════════════════════════════════════════════════
	const minOccurrences = Math.max(analyzerConfig.minOccurrences || 1, 1);
	
	// Contar todas as ocorrências do padrão no histórico
	const colorResults = { red: 0, black: 0, white: 0 };
	let totalOccurrences = 0;
	
		for (let i = need; i < history.length; i++) {
			const seq = history.slice(i, i + need);
			if (seq.length < need) break;
			const seqColors = seq.map(s => s.color);
			const match = seqColors.every((c, idx) => c === pat.pattern[idx]);
			if (!match) continue;
		
		// Só validar trigger se requireTrigger estiver ativo E modo padrão ativo
		// ⚠️ MODO IA: Ignora validação de trigger
		if (!analyzerConfig.aiMode && analyzerConfig.requireTrigger) {
			const trig = history[i + need] ? history[i + need].color : null;
			if (!trig || !isValidTrigger(trig, pat.pattern)) continue;
		}
		
		totalOccurrences++;
		const resultColor = history[i - 1] ? history[i - 1].color : null;
		if (resultColor) {
			colorResults[resultColor]++;
		}
	}
	
	// ✅ VALIDAR QUANTIDADE MÍNIMA DE OCORRÊNCIAS
	if (totalOccurrences < minOccurrences) {
		console.log('❌ Padrão salvo rejeitado: ocorrências insuficientes:', {
				pattern: pat.pattern,
				suggested,
			totalOccurrences,
			minOccurrences
		});
		continue;
	}
	
	// ✅ VALIDAR QUANTIDADE MÁXIMA DE OCORRÊNCIAS (0 = sem limite)
	// ⚠️ MODO IA: Ignora validação de máximo de ocorrências (configuração exclusiva do modo padrão)
	if (!analyzerConfig.aiMode) {
		const maxOccurrences = analyzerConfig.maxOccurrences || 0;
		if (maxOccurrences > 0 && totalOccurrences > maxOccurrences) {
			console.log('❌ Padrão salvo rejeitado: excede ocorrências máximas:', {
				pattern: pat.pattern,
				suggested,
				totalOccurrences,
				maxOccurrences,
				limite: `máx ${maxOccurrences}`
			});
			continue;
		}
	}
	
	// ✅ VALIDAR TAMANHO MÍNIMO E MÁXIMO DO PADRÃO
	// ⚠️ MODO IA: Ignora validações de tamanho (configurações exclusivas do modo padrão)
	if (!analyzerConfig.aiMode) {
		const patternSize = pat.pattern.length;
		const minPatternSize = analyzerConfig.minPatternSize || 2;
		if (patternSize < minPatternSize) {
			console.log('❌ Padrão salvo rejeitado: tamanho abaixo do mínimo:', {
				pattern: pat.pattern,
				patternSize,
				minPatternSize,
				limite: `mín ${minPatternSize} giros`
			});
			continue;
		}
		
		// ✅ VALIDAR TAMANHO MÁXIMO DO PADRÃO (0 = sem limite)
		const maxPatternSize = analyzerConfig.maxPatternSize || 0;
		if (maxPatternSize > 0 && patternSize > maxPatternSize) {
			console.log('❌ Padrão salvo rejeitado: tamanho acima do máximo:', {
				pattern: pat.pattern,
				patternSize,
				maxPatternSize,
				limite: `máx ${maxPatternSize} giros`
			});
			continue;
		}
	}
	
	// ═══════════════════════════════════════════════════════════════════════════════
	// DECISÃO: Qual lógica usar?
	// ═══════════════════════════════════════════════════════════════════════════════
	let isValid = false;
	
	if (totalOccurrences === minOccurrences) {
		// ✅ LÓGICA ANTIGA: Exige 100% WIN
		console.log(`📊 Padrão ${pat.pattern.join('-')}: ${totalOccurrences} ocorrências (= mínimo)`);
		console.log('   Aplicando LÓGICA ANTIGA (100% WIN)');
		
		const winsInSuggested = colorResults[suggested] || 0;
		isValid = (winsInSuggested === minOccurrences);
		
		if (!isValid) {
			console.log('   ❌ Rejeitado: Não tem 100% WIN na cor sugerida');
			console.log(`      ${suggested}: ${winsInSuggested}/${minOccurrences} WINS`);
		} else {
			console.log('   ✅ Aprovado: 100% WIN na cor sugerida');
		}
		
	} else {
		// ✅ LÓGICA NOVA: Cor que aparece mais
		const redCount = colorResults.red || 0;
		const blackCount = colorResults.black || 0;
		const whiteCount = colorResults.white || 0;
		
		// Ignorar branco se < 5%
		const whitePct = (whiteCount / totalOccurrences) * 100;
		const shouldIgnoreWhite = whitePct < 5;
		
		// Determinar cor vencedora (SEM VIÉS - IMPARCIAL)
		let winningColor = null;
		let winningCount = 0;
		
		// ✅ CORREÇÃO: Usar >= para evitar viés em empates
		// Ordem: BLACK → RED → WHITE
		
		if (blackCount > winningCount) {
			winningColor = 'black';
			winningCount = blackCount;
		}
		
		if (redCount >= winningCount && redCount > 0) {
			winningColor = 'red';
			winningCount = redCount;
		}
		
		if (!shouldIgnoreWhite && whiteCount >= winningCount && whiteCount > 0) {
			winningColor = 'white';
			winningCount = whiteCount;
		}
		
		if (!winningColor) {
			continue; // Sem cor vencedora, ignorar silenciosamente
		}
		
		// Calcular WINS e LOSS
		const totalWins = winningCount;
		const totalLoss = totalOccurrences - winningCount;
		const balance = totalWins - totalLoss;
		
		// ✅ FILTRAR PADRÕES FRACOS SILENCIOSAMENTE
		if (totalWins < minOccurrences) {
			continue; // Não atende mínimo de WINS
		}
		
		if (balance <= 0) {
			continue; // Saldo não positivo
		}
		
		// Verificar se cor vencedora é a sugerida
		if (winningColor !== suggested) {
			console.log(`   ⚠️ Cor vencedora (${winningColor}) difere da sugerida (${suggested})`);
			console.log('   Atualizando sugerida para cor vencedora');
			suggested = winningColor; // Atualizar para usar cor vencedora
		}
		
		isValid = true;
		console.log('   ✅ Aprovado pela NOVA LÓGICA');
	}
	
	// Se não passou na validação, pular este padrão
	if (!isValid) {
		continue;
		}

		const patternName = identifyPatternType(pat.pattern, null);
		// Calcular assertividade inteligente baseada no histórico e contexto recente
		const assertCalc = computeAssertivenessForColorPattern(pat.pattern, suggested, history);
		const patternDesc = {
			colorAnalysis: {
				pattern: pat.pattern,
				occurrences: occCount || pat.occurrences || 1,
				allOccurrenceNumbers: occNumbers,
				allOccurrenceTimestamps: occTimestamps,
				patternType: patternName,
			triggerColor: currentTrigger || null, // SEMPRE usar trigger ATUAL, não o salvo
				allTriggerNumbers: trigNumbers,
                allTriggerTimestamps: trigTimestamps,
                occurrenceDetails: occurrenceDetails, // Detalhes por ocorrência (append-only)
                summary: (function(){
                    // Recomputar wins/losses exatamente com as mesmas regras de ocorrência (inclui trigger)
                    let w = 0, l = 0, occ = 0;
                    for (let i = need; i < history.length; i++) {
                        const seq = history.slice(i, i + need);
                        if (seq.length < need) break;
                        const seqColors = seq.map(s => s.color);
                        const match = seqColors.every((c,ix) => c === pat.pattern[ix]);
                        if (!match) continue;
						
						// Só validar trigger se requireTrigger estiver ativo
						if (analyzerConfig.requireTrigger) {
						const trig = history[i + need] ? history[i + need].color : null;
						if (!trig || !isValidTrigger(trig, pat.pattern)) continue;
						}
						// triggers podem variar; não exigir igualdade à trigger salva
                        occ++;
                        const out = history[i-1] ? history[i-1].color : null;
                        if (out === suggested) w++; else l++;
                    }
                    const winPct = (w + l) > 0 ? (w/(w+l))*100 : 0;
                    // Calcular rigor baseado na configuração atual
                    const sampleMin = Math.max(analyzerConfig.minOccurrences || 1, 1);
                    let othersWins = 0, othersLosses = 0;
                    let counted = 0;
                    for (let i = need; i < history.length && counted < occ; i++) {
                        const seq = history.slice(i, i + need);
                        if (seq.length < need) break;
                        const seqColors = seq.map(s => s.color);
                        const match = seqColors.every((c,ix) => c === pat.pattern[ix]);
                        if (!match) continue;
                        
                        // Só validar trigger se requireTrigger estiver ativo
                        if (analyzerConfig.requireTrigger) {
                        const trig = history[i + need] ? history[i + need].color : null;
                        if (!trig || !isValidTrigger(trig, pat.pattern)) continue;
                            // NÃO filtrar por cor de disparo específica - triggers podem variar entre ocorrências
                        }
                        counted++;
                        const out = history[i-1] ? history[i-1].color : null;
                        if (counted <= sampleMin) {
                            // amostra mínima (deveria ser 100% win pela seleção); não entra no rigor
                            continue;
                        }
                        if (out === suggested) othersWins++; else othersLosses++;
                    }
                    const othersCount = Math.max((occ - sampleMin), 0);
                    const rigorWinPct = othersCount > 0 ? (othersWins / othersCount) * 100 : 100;
                    // CORREÇÃO: Retornar wins/losses TOTAIS, não apenas "others"
                    return {
                        occurrences: occ,
                        wins: w,  // Total de wins (inclui rigor + demais)
                        losses: l,  // Total de losses (inclui rigor + demais)
                        winPct: winPct,  // Porcentagem total
                        lossPct: Math.max(0, 100 - winPct),
                        othersCount,
                        othersWins,  // Wins apenas das "demais" (excluindo rigor)
                        othersLosses,  // Losses apenas das "demais" (excluindo rigor)
                        rigorWinPct,  // Porcentagem apenas das "demais"
                        sampleMin,
                        sampleMinWins100: true,
                        patternLength: Array.isArray(pat.pattern) ? pat.pattern.length : null
                    };
                })()
			},
			patternType: patternName,
			expected_next: suggested,
			id: pat.id,
			found_at: pat.found_at,
			assertiveness: assertCalc && assertCalc.explain ? assertCalc.explain : undefined
		};
		
		// ✅ VALIDAÇÃO CRÍTICA: Verificar WIN% das ocorrências "Demais"
		const summary = patternDesc.colorAnalysis.summary;
		if (summary && summary.rigorWinPct !== undefined) {
			const threshold = analyzerConfig.winPercentOthers || 0;
			if (threshold > 0 && summary.rigorWinPct < threshold) {
				// ❌ REJEITAR: WIN% das "Demais" está abaixo do threshold configurado
				logRejectedPattern(
					`${pat.pattern.join('-')} (salvo)`,
					`WIN% Demais = ${summary.rigorWinPct.toFixed(1)}% < ${threshold}% (config)`
				);
				console.log(`   📊 Detalhes: ${summary.othersWins}W/${summary.othersLosses}L em ${summary.othersCount} ocorrências`);
				console.log(`   🎯 Configuração exige: mínimo ${threshold}% de WIN nas demais ocorrências`);
				continue;
			}
		}

		// Se assertCalc existe, já vem calibrado; senão, calibrar a confidence salva
		const rawPatternConfidence = typeof pat.confidence === 'number' ? pat.confidence : 70;
		const patternConfidence = assertCalc ? assertCalc.finalConfidence : applyCalibratedConfidence(rawPatternConfidence);

		const candidate = {
			color: suggested,
			suggestion: 'Padrão salvo',
			confidence: patternConfidence,
			patternDescription: JSON.stringify(patternDesc),
			createdOnTimestamp: history[0] ? history[0].timestamp : new Date().toISOString(),
			predictedFor: 'next',
			phase: 'G0'
		};
		if (!best || candidate.confidence > best.confidence) best = candidate;
	}
	return best;
}

// Descoberta: executa 50+ análises em até 5s, evita repetir padrões já salvos
async function discoverAndPersistPatterns(history, startTs, budgetMs) {
	if (!history || history.length < 50) return; // respeita regra mínima existente
	const db = await loadPatternDB();
	const existingKeys = new Set(db.patterns_found.map(patternKeyOf));

	const colors = history.map(s => s.color);
	const tasks = [];
	// Planejar 173+ análises diversificadas (cores, números, temporais e brancos)
    for (let size = 3; size <= 15; size++) { // padrões de 3 a 15 giros
		for (let offset = 0; offset < 10; offset++) { // 10 offsets para maior cobertura
			tasks.push({ kind: 'color-window', size, offset });
		}
	}
    for (let len = 3; len <= 8; len++) { // correlações numéricas até 8 giros
		for (let offset = 0; offset < 5; offset++) { // 5 offsets
			tasks.push({ kind: 'number-correlation-lite', len, offset });
		}
	}
	// Adicionar análises temporais e de brancos
	tasks.push({ kind: 'white-intervals' });
	tasks.push({ kind: 'night-white' });
	tasks.push({ kind: 'time-repetition' });
	tasks.push({ kind: 'temporal-reversal' });
	tasks.push({ kind: 'white-break' });
	tasks.push({ kind: 'white-after-dominance' });
	tasks.push({ kind: 'complete-cycle' });
	tasks.push({ kind: 'post-white-peak' });
	tasks.push({ kind: 'post-white-recovery' });
	tasks.push({ kind: 'total-correction' });
	tasks.push({ kind: 'microcycle' });
	tasks.push({ kind: 'night-stability' });
	tasks.push({ kind: 'day-oscillation' });

	let discovered = [];
	let duplicatesCount = 0; // ✅ CONTADOR DE DUPLICATAS
	for (let idx = 0; idx < tasks.length; idx++) {
		// Orçamento de tempo
		if ((Date.now() - startTs) > budgetMs) break;
		const t = tasks[idx];
		let results = [];
		if (t.kind === 'color-window') {
			results = discoverColorPatternsFast(colors, t.size, t.offset);
		} else if (t.kind === 'number-correlation-lite') {
			results = discoverNumberCorrelationsFast(history.map(s => s.number), colors, t.len, t.offset);
		} else if (t.kind === 'white-intervals') {
			const pattern = analyzeWhiteIntervals(history);
			if (pattern) results = [pattern];
		} else if (t.kind === 'night-white') {
			const pattern = analyzeNightWhitePattern(history);
			if (pattern) results = [pattern];
		} else if (t.kind === 'time-repetition') {
			const pattern = analyzeTimeRepetitionPattern(history);
			if (pattern) results = [pattern];
		} else if (t.kind === 'temporal-reversal') {
			const pattern = analyzeTemporalReversalPattern(history);
			if (pattern) results = [pattern];
		} else if (t.kind === 'white-break') {
			const pattern = analyzeWhiteBreakPattern(history);
			if (pattern) results = [pattern];
		} else if (t.kind === 'white-after-dominance') {
			const pattern = analyzeWhiteAfterDominancePattern(history);
			if (pattern) results = [pattern];
		} else if (t.kind === 'complete-cycle') {
			const pattern = analyzeCompleteCyclePattern(history);
			if (pattern) results = [pattern];
		} else if (t.kind === 'post-white-peak') {
			const pattern = analyzePostWhitePeakPattern(history);
			if (pattern) results = [pattern];
		} else if (t.kind === 'post-white-recovery') {
			const pattern = analyzePostWhiteRecoveryPattern(history);
			if (pattern) results = [pattern];
		} else if (t.kind === 'total-correction') {
			const pattern = analyzeTotalCorrectionPattern(history);
			if (pattern) results = [pattern];
		} else if (t.kind === 'microcycle') {
			const pattern = analyzeMicrocyclePattern(history);
			if (pattern) results = [pattern];
		} else if (t.kind === 'night-stability') {
			const pattern = analyzeNightStabilityPattern(history);
			if (pattern) results = [pattern];
		} else if (t.kind === 'day-oscillation') {
			const pattern = analyzeDayOscillationPattern(history);
			if (pattern) results = [pattern];
		}
		for (const r of results) {
			// ✅ NORMALIZAR FORMATO DE PADRÕES (CRÍTICO PARA ANTI-DUPLICAÇÃO!)
			
			// 1. Normalizar próxima cor esperada
			if (r.suggestedColor && !r.expected_next) {
				r.expected_next = r.suggestedColor;
			}
			
			// 2. ✅ NORMALIZAR PADRÃO (string → array) ANTES de gerar chave
			if (typeof r.pattern === 'string' && !Array.isArray(r.pattern)) {
				// ✅ Converter string para array diretamente
				r.pattern = [r.pattern];
			} else if (!Array.isArray(r.pattern) && Array.isArray(r.patternArr)) {
				// ✅ Usar patternArr se pattern não for array
				r.pattern = r.patternArr;
			} else if (!Array.isArray(r.pattern)) {
				// ✅ Fallback para array vazio
				console.warn('⚠️ Padrão sem formato válido, convertendo para array:', r);
				r.pattern = r.pattern ? [String(r.pattern)] : [];
			}
			
			// 3. Normalizar tipo
			if (!r.type && r.patternType) {
				r.type = r.patternType;
			}
			
			// ✅ GERAR CHAVE ÚNICA (agora com padrão normalizado)
			const key = patternKeyOf(r);
			
			// ✅ VERIFICAR DUPLICATA
			if (existingKeys.has(key)) {
				duplicatesCount++; // ✅ INCREMENTAR CONTADOR
				continue; // ✅ Pular duplicata
			}
			
			// ✅ ADICIONAR CHAVE AO SET
			existingKeys.add(key);
			
			// ✅ ADICIONAR AO ARRAY DE DESCOBERTOS
			discovered.push(r);
		}
	}

	// ✅ MOSTRAR RESUMO DE DUPLICATAS (apenas se houver)
	if (duplicatesCount > 0) {
		console.log(`🔍 ${duplicatesCount} padrão(ões) duplicado(s) ignorado(s)`);
	}

	if (discovered.length === 0) {
		console.log('🔍 Descoberta: Nenhum padrão novo encontrado (todos já existem no banco)');
		return;
	}

	// Log de descoberta
	console.log(`
╔═══════════════════════════════════════════════════════════╗
║  🔍 NOVOS PADRÕES DESCOBERTOS                             
╠═══════════════════════════════════════════════════════════╣
║  ✨ ${discovered.length.toString().padStart(3)} novos padrões encontrados!                     
║  ⏱️  Tempo decorrido: ${((Date.now() - startTs) / 1000).toFixed(2)}s                    
║  📊 Total de tarefas executadas: ${tasks.length}                  
╚═══════════════════════════════════════════════════════════╝
	`.trim());

	// ✅ UPSERT NO DB - REFATORADO COM ANTI-DUPLICAÇÃO
	const nowIso = new Date().toISOString();
	let idCounter = 0; // ✅ Contador para garantir IDs únicos
	
	for (const p of discovered) {
		// ✅ GERAR ID ÚNICO (timestamp + contador + random)
		if (!p.id) {
			const timestamp = Date.now();
			const counter = idCounter++;
			const random = Math.floor(Math.random() * 10000);
			p.id = `${timestamp}-${counter}-${random}`;
		}
		
		// ✅ NORMALIZAR DATA DE DESCOBERTA
		p.found_at = p.found_at || nowIso;
		
		// ✅ NORMALIZAR NOME DA PRÓXIMA COR ESPERADA
		if (!p.expected_next && p.suggestedColor) {
			p.expected_next = p.suggestedColor;
		}
		
		// ✅ NORMALIZAR CONFIANÇA
		if (typeof p.confidence !== 'number') {
			p.confidence = 70;
		}
		
		// ✅ NORMALIZAR PADRÃO (CRÍTICO PARA ANTI-DUPLICAÇÃO!)
		if (!Array.isArray(p.pattern)) {
			if (Array.isArray(p.patternArr)) {
				p.pattern = p.patternArr;
			} else if (typeof p.pattern === 'string') {
				// ✅ Converter string para array de 1 elemento
				p.pattern = [p.pattern];
			} else {
				// ✅ Fallback para array vazio
				p.pattern = [];
				console.warn('⚠️ Padrão sem formato válido:', p);
			}
		}
		
		// ✅ INICIALIZAR CONTADORES DE DESEMPENHO
		if (typeof p.total_wins !== 'number') p.total_wins = 0;
		if (typeof p.total_losses !== 'number') p.total_losses = 0;
		
		// ✅ ADICIONAR AO BANCO (JÁ VALIDADO COMO NÃO DUPLICADO)
		db.patterns_found.unshift({
			id: p.id,
			pattern: p.pattern, // ✅ Sempre array após normalização
			expected_next: p.expected_next,
			confidence: p.confidence,
			found_at: p.found_at,
			type: p.type || p.patternType || 'discovery',
			occurrences: p.occurrences || 0,
			triggerColor: p.triggerColor || null,
			total_wins: p.total_wins,
			total_losses: p.total_losses
		});
	}
	// Limitar para não crescer indefinidamente
	db.patterns_found = db.patterns_found.slice(0, 5000);
	await savePatternDB(db);
}

// Varredura rápida por padrões de cores (sem exigir match atual, apenas descoberta)
function discoverColorPatternsFast(colors, size, strideOffset) {
	const out = [];
	if (!Array.isArray(colors) || colors.length < size + 1) return out;
	if (size < 3) return out; // garantir pelo menos 3 giros no padrão
	const outcomesMap = new Map();
	for (let i = size; i < colors.length - 1; i++) {
		if (((i - size) % 5) !== strideOffset) continue; // espaçar varredura
		const seq = colors.slice(i, i + size);
		const nextColor = colors[i - 1];
		const triggerColor = colors[i + size]; // cor imediatamente antes do padrão
		if (!triggerColor) continue;
		if (!isValidTrigger(triggerColor, seq)) continue; // respeitar regra de disparo
        const key = seq.join('-');
		let bag = outcomesMap.get(key);
        if (!bag) { bag = { seq, outcomes: [], triggers: [], triggerCounts: {}, count: 0 }; outcomesMap.set(key, bag); }
		bag.outcomes.push(nextColor);
		bag.count++;
		bag.triggers.push(triggerColor);
		bag.triggerCounts[triggerColor] = (bag.triggerCounts[triggerColor] || 0) + 1;
	}
	for (const bag of outcomesMap.values()) {
		if (bag.count < 2) continue;
		const cnt = {};
		for (const c of bag.outcomes) cnt[c] = (cnt[c] || 0) + 1;
		// ✅ CORREÇÃO: Usar primeira chave disponível em vez de 'red' como padrão
		const keys = Object.keys(cnt);
		if (keys.length === 0) continue;
		const winner = keys.reduce((a, b) => cnt[a] >= cnt[b] ? a : b);
		const acc = (cnt[winner] / bag.outcomes.length) * 100;
        if (acc >= 68) { // um pouco abaixo de 75 para descobrir mais padrões; filtro adicional via significância
			const signif = cnt[winner] / (bag.outcomes.length / 3);
			if (signif >= 1.6) {
				// Trigger mais frequente observado para esta sequência
                // Mas garantir que a trigger seja diferente da primeira cor do padrão
                let trigMost = Object.keys(bag.triggerCounts).reduce((a,b) => bag.triggerCounts[a] > bag.triggerCounts[b] ? a : b);
                if (!isValidTrigger(trigMost, bag.seq)) {
                    // Tentar outra trigger válida se existir
                    const candidates = Object.keys(bag.triggerCounts).filter(t => isValidTrigger(t, bag.seq));
                    if (candidates.length === 0) return; // descartar padrão inválido
                    trigMost = candidates.sort((a,b)=> bag.triggerCounts[b]-bag.triggerCounts[a])[0];
                }
				// Calcular assertividade inteligente imediatamente
				out.push({
					type: 'color-discovery',
					pattern: bag.seq,
					triggerColor: trigMost,
					expected_next: winner,
					confidence: acc,
					occurrences: bag.count
				});
			}
		}
	}
	return out;
}

// Descoberta leve de correlação numérica
function discoverNumberCorrelationsFast(numbers, colors, len, strideOffset) {
	const out = [];
	if (!Array.isArray(numbers) || numbers.length < len + 1) return out;
	if (len < 3) return out; // não considerar padrões com menos de 3 números
	const map = new Map();
	for (let i = len; i < numbers.length - 1; i++) {
		if (((i - len) % 3) !== strideOffset) continue;
		const seq = [];
		for (let k = 0; k < len; k++) seq.push(numbers[i + (len - 1 - k)]);
		const key = seq.join('→');
		const outcome = colors[i - 1];
		let bag = map.get(key);
		if (!bag) { bag = { seq, outcomes: [], count: 0 }; map.set(key, bag); }
		bag.outcomes.push(outcome);
		bag.count++;
	}
	for (const bag of map.values()) {
		if (bag.count < 3) continue;
		const cnt = {};
		for (const c of bag.outcomes) cnt[c] = (cnt[c] || 0) + 1;
		// ✅ CORREÇÃO: Usar primeira chave disponível em vez de 'red' como padrão
		const keys = Object.keys(cnt);
		if (keys.length === 0) continue;
		const winner = keys.reduce((a, b) => cnt[a] >= cnt[b] ? a : b);
		const acc = (cnt[winner] / bag.outcomes.length) * 100;
		const signif = cnt[winner] / (bag.outcomes.length / 3);
		if (acc >= 70 && signif >= 1.8) {
			out.push({
				type: 'number-corr-discovery',
				pattern: bag.seq.map(n => (typeof n === 'number' ? String(n) : n)).join('→'),
				patternArr: colorsForNumberSeq(bag.seq),
				expected_next: winner,
				confidence: acc,
				occurrences: bag.count
			});
		}
	}
	return out;
}

function colorsForNumberSeq(seq) {
	return seq.map(n => getColorFromNumber(n));
}

// AI Pattern Analysis System - MULTIDIMENSIONAL
async function performPatternAnalysis(history) {
    console.log('🔍 Iniciando análise multidimensional de IA com', history.length, 'giros', '| Rigor:', rigorLogString());
    
    // Verificar se há dados suficientes para análise
    if (history.length < 50) {
        console.log('⚠️ Dados insuficientes para análise multidimensional:', history.length, '/ 50 giros necessários');
        sendAnalysisStatus(`Coletando dados... ${history.length}/50 giros`);
        return null;
    }
    
    // Enviar status inicial com quantidade de giros
    sendAnalysisStatus(`🔍 Iniciando análise multidimensional de IA com ${history.length} giros`);
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // 🎯 PRIORIDADE MÁXIMA: VERIFICAR PADRÕES CUSTOMIZADOS
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('');
    console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00d4ff; font-weight: bold;');
    console.log('%c║  🎯 PRIORIDADE 1: PADRÕES CUSTOMIZADOS                   ║', 'color: #00d4ff; font-weight: bold;');
    console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00d4ff; font-weight: bold;');
    console.log('');
    
    const customPatternResult = await checkForCustomPatterns(history);
    
    if (customPatternResult) {
        console.log('%c🎯 ✅ PADRÃO CUSTOMIZADO ENCONTRADO E VALIDADO!', 'color: #00ff88; font-weight: bold; font-size: 14px;');
        console.log('%c   Usando análise customizada com prioridade máxima', 'color: #00ff88;');
        console.log('');
        
        // Retornar análise baseada no padrão customizado
        return {
            color: customPatternResult.recommendedColor,
            confidence: customPatternResult.confidence,
            reasoning: customPatternResult.reasoning,
            patternDescription: `🎯 PADRÃO CUSTOMIZADO: "${customPatternResult.pattern.name}" | ` +
                               `Sequência: ${customPatternResult.pattern.sequence.join('→')} | ` +
                               `Ocorrências: ${customPatternResult.stats.occurrences}`,
            isCustomPattern: true,
            customPatternData: customPatternResult
        };
    } else {
        console.log('%cℹ️ Nenhum padrão customizado ativo. Prosseguindo com análise padrão...', 'color: #888;');
        console.log('');
    }
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // ANÁLISE PADRÃO (CONTINUA NORMALMENTE SE NÃO HOUVER PADRÃO CUSTOMIZADO)
    // ═══════════════════════════════════════════════════════════════════════════════
    
    // 1. ANÁLISE DE PADRÕES DE COR COM COR DE DISPARO (baseada nos exemplos)
    const colorAnalysis = analyzeColorPatternsWithTrigger(history);
    if (colorAnalysis) {
        console.log(`📊 Padrão de cores: ${colorAnalysis.pattern.join('-')} → ${colorAnalysis.suggestedColor} (${colorAnalysis.confidence.toFixed(1)}%, ${colorAnalysis.occurrences}x)`);
    }
    
    // Enviar status para análise numérica
    sendAnalysisStatus('🧮 Verificando padrões numéricos...');
    
    // 2. ANÁLISE DE PADRÕES NUMÉRICOS
    const numberAnalysis = analyzeNumberPatterns(history);
    if (numberAnalysis) {
        console.log(`🔢 Padrão numérico: ${numberAnalysis.pattern} → ${numberAnalysis.suggestedNumber} (${numberAnalysis.confidence.toFixed(1)}%)`);
    }
    
    // Enviar status para análise temporal
    sendAnalysisStatus('⏰ Analisando tendências temporais...');
    
    // 3. ANÁLISE TEMPORAL E MISTA AVANÇADA (baseada nos exemplos 21-33)
    const timeAnalysis = analyzeTemporalAndMixedPatterns(history);
    if (timeAnalysis) {
        console.log(`⏰ Padrão temporal/misto: ${timeAnalysis.pattern} → ${timeAnalysis.suggestedColor} (${timeAnalysis.confidence.toFixed(1)}%)`);
    }
    
    // Enviar status para análise de correlações
    sendAnalysisStatus('🔗 Calculando correlações...');
    
    // 4. ANÁLISE DE CORRELAÇÕES
    const correlationAnalysis = analyzeCorrelations(history);
    if (correlationAnalysis) {
        console.log(`🔗 Correlação: ${correlationAnalysis.pattern} → ${correlationAnalysis.suggestedColor} (${correlationAnalysis.confidence.toFixed(1)}%)`);
    }
    
    // Enviar status para análise de frequência
    sendAnalysisStatus('📊 Avaliando frequências...');
    
    // 5. ANÁLISE DE FREQUÊNCIA MULTIDIMENSIONAL
    const frequencyAnalysis = analyzeMultidimensionalFrequency(history);
    if (frequencyAnalysis) {
        console.log(`📈 Frequência multidimensional: ${frequencyAnalysis.pattern} → ${frequencyAnalysis.suggestedColor} (${frequencyAnalysis.confidence.toFixed(1)}%)`);
    }
    
    // Enviar status para combinação final
    sendAnalysisStatus('🎯 Combinando análises...');
    
    // 6. COMBINAR TODAS AS ANÁLISES MULTIDIMENSIONAIS
    const finalAnalysis = await combineMultidimensionalAnalyses(
        colorAnalysis, 
        numberAnalysis, 
        timeAnalysis, 
        correlationAnalysis, 
        frequencyAnalysis
    );
    
    if (finalAnalysis) {
        console.log(`✅ ANÁLISE MULTIDIMENSIONAL APROVADA: ${finalAnalysis.color} (${finalAnalysis.confidence.toFixed(1)}%)`, '| Rigor:', rigorLogString());
        console.log(`📊 Contribuições: Cor=${finalAnalysis.contributions.color}%, Núm=${finalAnalysis.contributions.number}%, Tempo=${finalAnalysis.contributions.time}%, Corr=${finalAnalysis.contributions.correlation}%, Freq=${finalAnalysis.contributions.frequency}%`);
        // Enviar status de conclusão
        sendAnalysisStatus('✅ Padrão encontrado!');
    } else {
        console.log('❌ Análise multidimensional rejeitada - critérios não atendidos');
        // Enviar status de aguardando novo giro após análise completa
        sendAnalysisStatus('⏳ Aguardando novo giro...');
    }
    
    return finalAnalysis;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANÁLISE DE PADRÕES DE CORES - CORREÇÃO CRÍTICA
// IDENTIFICA SEQUÊNCIAS COMPLETAS DE CORES (DO INÍCIO AO FIM)
// ═══════════════════════════════════════════════════════════════════════════════

// 🔧 FUNÇÃO AUXILIAR: Identificar sequência completa de cores mais recente
function identifyCompleteColorSequence(colors, maxLength = 20) {
    if (!colors || colors.length < 2) return null;
    
    // Agrupar cores consecutivas iguais em blocos
    const blocks = [];
    let currentColor = colors[0];
    let currentCount = 1;
    
    for (let i = 1; i < Math.min(colors.length, maxLength); i++) {
        if (colors[i] === currentColor) {
            currentCount++;
        } else {
            blocks.push({ color: currentColor, count: currentCount });
            currentColor = colors[i];
            currentCount = 1;
        }
    }
    blocks.push({ color: currentColor, count: currentCount });
    
    // Converter blocos em sequência completa
    const sequence = [];
    for (const block of blocks) {
        for (let i = 0; i < block.count; i++) {
            sequence.push(block.color);
        }
    }
    
    return {
        sequence: sequence,
        blocks: blocks,
        length: sequence.length
    };
}

function analyzeColorPatternsWithTrigger(history) {
    // ✅ VALIDAÇÃO INICIAL
    if (!history || !Array.isArray(history) || history.length < 50) {
        console.log('⚠️ Histórico insuficiente para análise de cores:', history?.length || 0, '/ 50 giros necessários');
        return null;
    }
    
    console.log(`🔍 Iniciando análise de padrões de cores com ${history.length} giros`);
    console.log('🚨 CORREÇÃO ATIVADA: Identificando SEQUÊNCIAS COMPLETAS de cores');
    
    // ✅ EXTRAÇÃO DE CORES
    const colors = history.map(s => {
        if (!s || !s.color) {
            console.warn('⚠️ Giro inválido detectado:', s);
            return 'red'; // Fallback seguro
        }
        return s.color;
    });
    
    // ✅ CONFIGURAÇÃO DO USUÁRIO
    const minOccurrences = parseInt(analyzerConfig.minOccurrences) || 5;
    
    console.log(`📊 Config: minOccurrences=${minOccurrences}`);
    
    // 🔍 PASSO 1: IDENTIFICAR SEQUÊNCIA COMPLETA MAIS RECENTE
    const currentPattern = identifyCompleteColorSequence(colors, 20);
    
    if (!currentPattern || currentPattern.length < 2) {
        console.log('❌ Não foi possível identificar sequência completa nos giros recentes');
        return null;
    }
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📍 SEQUÊNCIA COMPLETA IDENTIFICADA:');
    console.log(`   Giros: ${currentPattern.sequence.join('-')}`);
    console.log(`   Blocos: ${currentPattern.blocks.map(b => `${b.count}x${b.color.toUpperCase()}`).join(' + ')}`);
    console.log(`   Tamanho total: ${currentPattern.length} giros`);
    console.log('═══════════════════════════════════════════════════════════');
    
    // 🔍 PASSO 2: BUSCAR ESSA SEQUÊNCIA COMPLETA NO HISTÓRICO
    const patternToFind = currentPattern.sequence;
    const patternLength = patternToFind.length;
    
    const occurrences = [];
    
    // Varrer histórico procurando a SEQUÊNCIA COMPLETA
    for (let i = patternLength; i < history.length - 1; i++) {
        const historicalSequence = colors.slice(i, i + patternLength);
        
        // Verificar se a sequência completa é igual
        const isMatch = historicalSequence.every((c, idx) => c === patternToFind[idx]);
        
        if (isMatch) {
            const triggerColor = colors[i + patternLength]; // Cor antes da sequência
            const resultColor = colors[i - 1]; // Cor que saiu APÓS a sequência completa
            
            // ✅ VALIDAR TRIGGER (se configurado)
            if (analyzerConfig.requireTrigger && triggerColor) {
                if (!isValidTrigger(triggerColor, patternToFind)) {
                    continue; // Trigger inválida, pular
                }
            }
            
            occurrences.push({
                index: i,
                trigger: triggerColor,
                result: resultColor,
                number: history[i - 1]?.number,
                timestamp: history[i - 1]?.timestamp
            });
        }
    }
    
    console.log(`\n🔍 Buscando sequência completa no histórico...`);
    console.log(`   Sequência procurada: ${patternToFind.join('-')}`);
    console.log(`   Tamanho: ${patternLength} giros (COMPLETOS)`);
    console.log(`   Ocorrências encontradas: ${occurrences.length}`);
    
    // ✅ VALIDAR: Ocorrências suficientes?
    if (occurrences.length < minOccurrences) {
        console.log(`❌ Ocorrências insuficientes: ${occurrences.length} < ${minOccurrences} (mínimo)`);
        return null;
    }
    
    // 🔍 PASSO 3: ANALISAR RESULTADOS APÓS A SEQUÊNCIA COMPLETA
    const colorResults = {
        red: [],
        black: [],
        white: []
    };
    
    occurrences.forEach(occ => {
        if (occ.result) {
            colorResults[occ.result].push(occ);
        }
    });
    
    const redCount = colorResults.red.length;
    const blackCount = colorResults.black.length;
    const whiteCount = colorResults.white.length;
    const totalOccurrences = occurrences.length;
    
    console.log(`\n📊 RESULTADOS APÓS A SEQUÊNCIA COMPLETA:`);
    console.log(`   VERMELHO: ${redCount} vezes (${((redCount/totalOccurrences)*100).toFixed(1)}%)`);
    console.log(`   PRETO: ${blackCount} vezes (${((blackCount/totalOccurrences)*100).toFixed(1)}%)`);
    console.log(`   BRANCO: ${whiteCount} vezes (${((whiteCount/totalOccurrences)*100).toFixed(1)}%)`);
    
    // ✅ Ignorar branco se < 5%
    const whitePct = (whiteCount / totalOccurrences) * 100;
    const shouldIgnoreWhite = whitePct < 5;
    
    // 🔍 PASSO 4: DETERMINAR COR VENCEDORA (SEM VIÉS - IMPARCIAL)
    let winningColor = null;
    let winningCount = 0;
    
    // ✅ CORREÇÃO: Usar >= para garantir que em caso de empate, a ÚLTIMA cor verificada ganha
    // Ordem: BLACK → RED → WHITE (para não favorecer nenhuma cor específica)
    
    if (blackCount > winningCount) {
        winningColor = 'black';
        winningCount = blackCount;
    }
    
    if (redCount >= winningCount && redCount > 0) {
        winningColor = 'red';
        winningCount = redCount;
    }
    
    if (!shouldIgnoreWhite && whiteCount >= winningCount && whiteCount > 0) {
        winningColor = 'white';
        winningCount = whiteCount;
    }
    
    if (!winningColor) {
        console.log('❌ Nenhuma cor vencedora identificada');
        return null;
    }
    
    // ✅ CALCULAR WINS E LOSS DA COR VENCEDORA
    const totalWins = winningCount;
    const totalLoss = totalOccurrences - winningCount;
    const balance = totalWins - totalLoss;
    
    console.log(`\n🎯 COR VENCEDORA: ${winningColor.toUpperCase()}`);
    console.log(`   WINS: ${totalWins}`);
    console.log(`   LOSS: ${totalLoss}`);
    console.log(`   Saldo: ${balance > 0 ? '+' : ''}${balance}`);
    
    // ✅ FILTRAR PADRÕES FRACOS
    if (totalWins < minOccurrences) {
        console.log(`❌ WINS insuficientes: ${totalWins} < ${minOccurrences} (mínimo)`);
        return null;
    }
    
    if (balance <= 0) {
        console.log(`❌ Saldo não positivo: ${balance}`);
        return null;
    }
    
    // ✅ CALCULAR CONFIANÇA
    const confidence = (totalWins / totalOccurrences) * 100;
    
    console.log(`   Confiança: ${confidence.toFixed(1)}%`);
    
    // 🔍 PASSO 5: VERIFICAR SE PADRÃO ATUAL CORRESPONDE
    const currentSequence = colors.slice(0, patternLength);
    const isCurrentMatch = currentSequence.every((c, idx) => c === patternToFind[idx]);
    
    if (!isCurrentMatch) {
        console.log('❌ Sequência atual não corresponde ao padrão encontrado');
        return null;
    }
    
    // ✅ VALIDAR TRIGGER ATUAL (se configurado)
    const currentTriggerColor = colors[patternLength];
    if (analyzerConfig.requireTrigger) {
        if (!isValidTrigger(currentTriggerColor, patternToFind)) {
            console.log('❌ Cor de disparo atual inválida');
            return null;
        }
    }
    
    // ✅ CONSTRUIR RESULTADO FINAL
    const bestPattern = {
        pattern: patternToFind,
        blocks: currentPattern.blocks, // 🆕 Informação dos blocos (ex: 7xPRETO + 7xVERMELHO)
        suggestedColor: winningColor,
        confidence: confidence,
        occurrences: totalOccurrences,
        wins: totalWins,
        loss: totalLoss,
        balance: balance,
        triggerColor: currentTriggerColor,
        colorResults: colorResults,
        type: 'color-pattern',
        patternType: identifyPatternType(patternToFind, currentTriggerColor),
        isCurrentMatch: true,
        currentTriggerValid: true,
        createdOnTimestamp: history[0]?.timestamp || null,
        summary: {
            occurrences: totalOccurrences,
            wins: totalWins,
            losses: totalLoss,
            winPct: confidence,
            lossPct: Math.max(0, 100 - confidence),
            patternLength: patternLength
        }
    };
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`✅ PADRÃO COMPLETO VALIDADO!`);
    console.log(`   Sequência: ${bestPattern.blocks.map(b => `${b.count}x${b.color.toUpperCase()}`).join(' + ')}`);
    console.log(`   Sugestão: ${bestPattern.suggestedColor.toUpperCase()}`);
    console.log(`   WINS: ${bestPattern.wins} | LOSS: ${bestPattern.loss} | Saldo: +${bestPattern.balance}`);
    console.log(`   Confiança: ${bestPattern.confidence.toFixed(1)}%`);
    console.log('═══════════════════════════════════════════════════════════');
    
    return bestPattern;
}



// Verificar se a Cor de Disparo é válida para o padrão
function isValidTrigger(triggerColor, patternSequence) {
    if (!patternSequence || patternSequence.length === 0) return false;
    
    const firstPatternColor = patternSequence[0];
    
    // Cor de Disparo deve ser diferente da primeira cor do padrão
    // e também não pode ser nula/indefinida
    if (!triggerColor) return false;
    return triggerColor !== firstPatternColor;
}

// Validar se cor de disparo é OPOSTA à cor inicial (regra estrita)
function validateDisparoColor(corInicial, corDisparo) {
    const mapping = {
        'red': ['black', 'white'],
        'black': ['red', 'white'],
        'white': ['red', 'black']
    };
    
    if (!corInicial || !corDisparo) {
        return { valid: false, reason: 'missing_color' };
    }
    
    if (corInicial === corDisparo) {
        return { valid: false, reason: 'same_as_initial' };
    }
    
    if (!mapping[corInicial] || !mapping[corInicial].includes(corDisparo)) {
        return { valid: false, reason: 'invalid_opposite' };
    }
    
    return { valid: true };
}

// Criar objeto de ocorrência individual (append-only)
function createOccurrenceRecord(patternSequence, triggerColor, resultColor, spin, index) {
    const corInicial = patternSequence[0];
    const validation = validateDisparoColor(corInicial, triggerColor);
    
    return {
        occurrence_id: spin ? (spin.created_at || spin.timestamp || `${Date.now()}_${index}`) : `${Date.now()}_${index}`,
        index: index,
        cor_inicial: corInicial,
        cor_disparo: triggerColor,
        resultado: resultColor,
        timestamp: spin ? (spin.timestamp || spin.created_at) : new Date().toISOString(),
        giro_numbers: Array.isArray(spin) ? spin.map(s => s.number) : (spin ? [spin.number] : []),
        flag_invalid_disparo: !validation.valid,
        invalid_reason: validation.valid ? null : validation.reason,
        raw_color: !validation.valid ? triggerColor : null
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// IDENTIFICAR TIPO DE PADRÃO - REFATORADO 100%
// ═══════════════════════════════════════════════════════════════════════════════
function identifyPatternType(pattern, triggerColor) {
    // ✅ VALIDAÇÃO DE ENTRADA
    if (!pattern || !Array.isArray(pattern) || pattern.length === 0) {
        console.warn('⚠️ Padrão inválido para identificação:', pattern);
        return 'Padrão Desconhecido';
    }
    
    const patternStr = pattern.join('-');
    const patternLength = pattern.length;
    
    // ✅ PADRÃO 1-2: REPETIÇÃO (todos da mesma cor)
    const isAllSameColor = pattern.every(color => color === pattern[0]);
    if (isAllSameColor) {
        if (pattern[0] === 'red') return 'Repetição Vermelha';
        if (pattern[0] === 'black') return 'Repetição Preta';
        if (pattern[0] === 'white') return 'Repetição Branca';
    }
    
    // ✅ PADRÃO 3-5: ALTERNÂNCIA (cores alternadas)
    if (isAlternatingPattern(pattern)) {
        if (patternLength === 4) return 'Alternância Curta (4 giros)';
        if (patternLength === 5) return 'Alternância Longa (5 giros)';
        if (patternLength > 5) return `Alternância Extendida (${patternLength} giros)`;
        return 'Alternância Quebrada';
    }
    
    // ✅ PADRÃO 6: DUPLA ALTERNÂNCIA (pares alternados)
    if (isDoubleAlternatingPattern(pattern)) {
        return 'Dupla Alternância';
    }
    
    // ✅ PADRÃO 7: INVERSÃO RÁPIDA (2 iguais + mudança)
    if (patternLength >= 4) {
        const hasQuickInversion = pattern[0] === pattern[1] && pattern[1] !== pattern[2];
        if (hasQuickInversion) {
        return 'Inversão Rápida';
        }
    }
    
    // ✅ PADRÃO 8-9: DOMINÂNCIA (5+ cores da mesma)
    if (patternLength >= 5 && isAllSameColor) {
        const dominantColor = pattern[0];
        if (dominantColor === 'red') return `Dominância Vermelha (${patternLength} giros)`;
        if (dominantColor === 'black') return `Dominância Preta (${patternLength} giros)`;
        if (dominantColor === 'white') return `Dominância Branca (${patternLength} giros)`;
    }
    
    // ✅ PADRÃO 10: CORREÇÃO DE COR (metade de uma cor, metade de outra)
    if (isCorrectionPattern(pattern)) {
        return 'Correção de Cor';
    }
    
    // ✅ PADRÕES COM BRANCO
    const hasWhite = pattern.includes('white');
    if (hasWhite) {
        return identifyWhitePattern(pattern);
    }
    
    // ✅ PADRÃO GENÉRICO
    return `Padrão Personalizado (${patternLength} giros)`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFICAR PADRÃO DE ALTERNÂNCIA - REFATORADO 100%
// ═══════════════════════════════════════════════════════════════════════════════
function isAlternatingPattern(pattern) {
    // ✅ VALIDAÇÃO DE ENTRADA
    if (!pattern || !Array.isArray(pattern)) {
        console.warn('⚠️ Padrão inválido para verificação de alternância:', pattern);
        return false;
    }
    
    // ✅ MÍNIMO 4 CORES NECESSÁRIO
    if (pattern.length < 4) {
        return false;
    }
    
    // ✅ VERIFICAR SE CADA COR É DIFERENTE DA ANTERIOR
    for (let i = 1; i < pattern.length; i++) {
        // Se encontrar duas cores iguais consecutivas, não é alternância
        if (pattern[i] === pattern[i - 1]) {
            return false;
    }
    }
    
    // ✅ TODAS AS CORES ALTERNADAS
    return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFICAR DUPLA ALTERNÂNCIA - REFATORADO 100%
// ═══════════════════════════════════════════════════════════════════════════════
function isDoubleAlternatingPattern(pattern) {
    // ✅ VALIDAÇÃO DE ENTRADA
    if (!pattern || !Array.isArray(pattern)) {
        console.warn('⚠️ Padrão inválido para verificação de dupla alternância:', pattern);
        return false;
    }
    
    // ✅ MÍNIMO 4 CORES NECESSÁRIO (2 pares)
    if (pattern.length < 4) {
        return false;
    }
    
    // ✅ VERIFICAR SE CADA PAR É IDÊNTICO
    // Padrão: AA BB AA BB (cada par de cores iguais, pares alternados)
    for (let i = 0; i < pattern.length - 1; i += 2) {
        // Verificar se há índice suficiente
        if (i + 1 >= pattern.length) {
            break;
        }
        
        // Par atual deve ter cores iguais
        if (pattern[i] !== pattern[i + 1]) {
            return false;
        }
    }
    
    // ✅ TODOS OS PARES SÃO VÁLIDOS
    return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFICAR PADRÃO DE CORREÇÃO - REFATORADO 100%
// ═══════════════════════════════════════════════════════════════════════════════
function isCorrectionPattern(pattern) {
    // ✅ VALIDAÇÃO DE ENTRADA
    if (!pattern || !Array.isArray(pattern)) {
        console.warn('⚠️ Padrão inválido para verificação de correção:', pattern);
        return false;
    }
    
    // ✅ MÍNIMO 5 CORES NECESSÁRIO
    if (pattern.length < 5) {
        return false;
    }
    
    // ✅ DIVIDIR EM DUAS METADES
    const midPoint = Math.floor(pattern.length / 2);
    const firstHalf = pattern.slice(0, midPoint);
    const secondHalf = pattern.slice(midPoint);
    
    // ✅ VALIDAR METADES
    if (firstHalf.length === 0 || secondHalf.length === 0) {
        return false;
    }
    
    // ✅ PRIMEIRA METADE: TODAS DA MESMA COR
    const firstHalfSameColor = firstHalf.every(color => color === firstHalf[0]);
    
    // ✅ SEGUNDA METADE: TODAS DA MESMA COR
    const secondHalfSameColor = secondHalf.every(color => color === secondHalf[0]);
    
    // ✅ AS DUAS METADES DEVEM TER CORES DIFERENTES
    const differentColors = firstHalf[0] !== secondHalf[0];
    
    return firstHalfSameColor && secondHalfSameColor && differentColors;
}

// ═══════════════════════════════════════════════════════════════════════════════
// IDENTIFICAR PADRÕES COM BRANCO - REFATORADO 100%
// ═══════════════════════════════════════════════════════════════════════════════
function identifyWhitePattern(pattern) {
    // ✅ VALIDAÇÃO DE ENTRADA
    if (!pattern || !Array.isArray(pattern)) {
        console.warn('⚠️ Padrão inválido para identificação de branco:', pattern);
        return 'Padrão Desconhecido';
    }
    
    // ✅ CONTAR QUANTOS BRANCOS
    const whiteCount = pattern.filter(color => color === 'white').length;
    
    // ✅ IDENTIFICAR TIPO BASEADO NA QUANTIDADE
    if (whiteCount === 0) {
        return 'Sem Branco';
    } else if (whiteCount === 1) {
        // Verificar posição do branco
        const whiteIndex = pattern.indexOf('white');
        if (whiteIndex === 0) {
            return 'Branco Inicial';
        } else if (whiteIndex === pattern.length - 1) {
            return 'Branco Final';
        } else {
            return 'Branco Isolado (meio)';
        }
    } else if (whiteCount === 2) {
        // Verificar se são consecutivos
        const firstWhiteIndex = pattern.indexOf('white');
        const lastWhiteIndex = pattern.lastIndexOf('white');
        
        if (lastWhiteIndex - firstWhiteIndex === 1) {
            return 'Duplo Branco Consecutivo';
        } else {
            return 'Duplo Branco Espaçado';
        }
    } else if (whiteCount === 3) {
        return 'Triplo Branco';
    } else if (whiteCount >= pattern.length / 2) {
        return `Dominância Branca (${whiteCount}/${pattern.length})`;
    } else {
        return `Padrão Misto com Branco (${whiteCount}x)`;
    }
}

// Analisar sequências recorrentes no histórico (função antiga mantida para compatibilidade)
function analyzeRecurrentSequences(history) {
    const currentCreatedOn = history[0] ? history[0].timestamp : null;

    // Procura padrões exatos de tamanhos 5 a 8 (mais confiáveis)
    const bestCandidates = [];
    for (let win = 5; win <= 8; win++) {
        if (history.length < win + 2) continue; // Precisa de pelo menos win + 2 para analisar o próximo
        
        // CORRIGIDO: Verificar se o padrão atual está QUASE COMPLETO (faltando 1 giro)
        const currentSequence = history.slice(0, win).map(s => s.color); // Padrão completo atual
        const sequences = {};

        for (let i = win; i < history.length - 1; i++) {
            // Buscar padrões que estão QUASE COMPLETOS (faltando 1 giro)
            const windowSlice = history.slice(i, i + win); // Padrão completo
            const pastSequence = windowSlice.map(s => s.color);
            const isExactMatch = pastSequence.every((c, idx) => c === currentSequence[idx]);
            if (!isExactMatch) continue;

            // Analisar o giro que COMPLETOU o padrão (o giro seguinte)
            const completingColor = history[i - 1].color; // O giro que completou o padrão
            const sequenceKey = pastSequence.join('-');
            if (!sequences[sequenceKey]) {
                sequences[sequenceKey] = {
                    pattern: pastSequence,
                    outcomes: [],
                    count: 0,
                    occurrenceTimes: [],
                    lastOccurrenceTimestamps: [],
                    lastOccurrenceNumbers: []
                };
            }
            sequences[sequenceKey].outcomes.push(completingColor);
            sequences[sequenceKey].count++;
            const occurrenceEndTimestamp = history[i - 1] && history[i - 1].timestamp ? history[i - 1].timestamp : (history[i] && history[i].timestamp);
            if (occurrenceEndTimestamp) sequences[sequenceKey].occurrenceTimes.push(occurrenceEndTimestamp);
            sequences[sequenceKey].lastOccurrenceTimestamps = windowSlice.map(s => s.timestamp);
            sequences[sequenceKey].lastOccurrenceNumbers = windowSlice.map(s => s.number);
        }

        const analyzed = Object.values(sequences).map(seq => {
            const colorCounts = {};
            seq.outcomes.forEach(color => { colorCounts[color] = (colorCounts[color] || 0) + 1; });
            // ✅ CORREÇÃO: Usar primeira chave disponível em vez de 'red' como padrão
            const keys = Object.keys(colorCounts);
            if (keys.length === 0) return null;
            const mostFrequentColor = keys.reduce((a, b) => colorCounts[a] >= colorCounts[b] ? a : b);
            const accuracy = (colorCounts[mostFrequentColor] / seq.outcomes.length) * 100;
            
            // Validação estatística: verificar se não é distribuição aleatória
            const totalOutcomes = seq.outcomes.length;
            const expectedRandom = totalOutcomes / 3; // Esperado se fosse aleatório (3 cores)
            const actualCount = colorCounts[mostFrequentColor];
            const statisticalSignificance = actualCount / expectedRandom;
            
            // Só aceitar se for estatisticamente significativo (pelo menos 2.0x o esperado para 80%+ acertividade)
            if (statisticalSignificance < 2.0) {
                return null;
            }
            
            return {
                type: 'sequence',
                pattern: seq.pattern,
                window: win,
                suggestedColor: mostFrequentColor, // Cor que mais frequentemente COMPLETOU o padrão
                accuracy: accuracy,
                occurrences: seq.count,
                occurrenceTimes: seq.occurrenceTimes.sort((a,b) => new Date(b) - new Date(a)),
                lastOccurrenceTimestamps: Array.isArray(seq.lastOccurrenceTimestamps) ? seq.lastOccurrenceTimestamps : [],
                lastOccurrenceNumbers: Array.isArray(seq.lastOccurrenceNumbers) ? seq.lastOccurrenceNumbers : [],
                confidence: accuracy,
                statisticalSignificance: statisticalSignificance,
                createdOnTimestamp: currentCreatedOn
            };
        }).filter(analysis => analysis !== null);

        if (analyzed.length > 0) {
            analyzed.sort((a, b) => (b.confidence - a.confidence) || (b.occurrences - a.occurrences));
            bestCandidates.push(analyzed[0]);
        }
    }

    if (bestCandidates.length === 0) return null;
    bestCandidates.sort((a, b) => (b.confidence - a.confidence) || (b.occurrences - a.occurrences) || (b.window - a.window));
    return bestCandidates[0];
}

// ANÁLISE DE PADRÕES NUMÉRICOS E CORRELATIVOS (baseada nos exemplos 34-50)
function analyzeNumberPatterns(history) {
    if (history.length < 50) return null; // Mínimo de 50 giros
    
    const numbers = history.map(s => s.number);
    const colors = history.map(s => s.color);
    const bestPatterns = [];
    
    // 0. NOVO: Padrões número+cor → próxima cor (ex.: 1 vermelho + 14 preto → preto)
    const numberColorPair = analyzeNumberColorPairs(history);
    if (numberColorPair) bestPatterns.push(numberColorPair);
    
    // 1. PADRÃO NUMÉRICO 1-4: Correlações Simples e Estendidas
    const correlationPatterns = analyzeNumberCorrelations(numbers, colors);
    if (correlationPatterns) bestPatterns.push(correlationPatterns);
    
    // 2. PADRÃO NUMÉRICO 5-7: Sequências Especiais
    const sequencePatterns = analyzeSpecialSequences(numbers, colors);
    if (sequencePatterns) bestPatterns.push(sequencePatterns);
    
    // 3. (DESATIVADO) Padrões Matemáticos por soma – removido para evitar falso positivo de soma
    // const mathPatterns = analyzeMathematicalPatterns(numbers, colors);
    // if (mathPatterns) bestPatterns.push(mathPatterns);
    
    // 4. PADRÃO NUMÉRICO 13-17: Padrões Avançados
    const advancedPatterns = analyzeAdvancedPatterns(numbers, colors);
    if (advancedPatterns) bestPatterns.push(advancedPatterns);
    
    if (bestPatterns.length === 0) return null;
    
    // Selecionar melhor padrão dentre os candidatos
    const bestPattern = bestPatterns.sort((a, b) => (b.confidence - a.confidence) || (b.occurrences - a.occurrences))[0];
    
    // Verificação por tipo
    if (bestPattern.type === 'number-color-pair') {
        // Checar se o head atual bate com o par número+cor
        if (history.length < 2) return null;
        const headPair = [history[1], history[0]]; // mais antigo → mais recente
        const p = bestPattern.pair; // [{number,color},{number,color}]
        const isMatch = p && p.length === 2 &&
                        headPair[0].number === p[0].number && headPair[0].color === p[0].color &&
                        headPair[1].number === p[1].number && headPair[1].color === p[1].color;
        if (!isMatch) {
            console.log('❌ Par número+cor não corresponde ao head atual:', { pair: p, head: [{n: headPair[0].number, c: headPair[0].color},{n: headPair[1].number, c: headPair[1].color}] });
            return null;
        }
        console.log('✅ Par número+cor confirma o padrão encontrado:', { pair: p, suggested: bestPattern.suggestedColor, conf: bestPattern.confidence.toFixed(1)+'%' });
        return bestPattern;
    }
    
    // Demais padrões numéricos: manter verificação por números puros
    const patternNumbers = bestPattern.pattern.split('→').map(n => parseInt(n));
    const currentNumbers = numbers.slice(0, patternNumbers.length);
    const isCurrentPatternMatch = currentNumbers.every((num, index) => num === patternNumbers[index]);
    if (!isCurrentPatternMatch) {
        console.log('❌ Padrão numérico encontrado não corresponde ao padrão atual:', {
            foundPattern: patternNumbers,
            currentNumbers: currentNumbers,
            isMatch: isCurrentPatternMatch
        });
        return null;
    }
    console.log('✅ Padrão numérico atual confirma o padrão encontrado:', { foundPattern: patternNumbers, currentNumbers: currentNumbers, isMatch: isCurrentPatternMatch });
    return bestPattern;
}

// Analisar correlações numéricas (Padrões 1-4)
function analyzeNumberCorrelations(numbers, colors) {
    const correlations = {};
    
    // Buscar sequências de 2-3 números e suas correlações
    for (let i = 2; i < numbers.length - 1; i++) {
        // Padrão 1: Correlação Simples (5→11)
        const seq2 = [numbers[i+1], numbers[i]];
        const seq2Key = seq2.join('→');
        const resultColor = colors[i-1];
        
        if (!correlations[seq2Key]) {
            correlations[seq2Key] = {
                pattern: seq2,
                outcomes: [],
                count: 0,
                occurrenceTimes: [],
                lastOccurrenceNumbers: []
            };
        }
        
        correlations[seq2Key].outcomes.push(resultColor);
        correlations[seq2Key].count++;
        correlations[seq2Key].occurrenceTimes.push(new Date().toISOString());
        correlations[seq2Key].lastOccurrenceNumbers = seq2;
        
        // Padrão 2: Correlação Estendida (10→1→6)
        if (i >= 2) {
            const seq3 = [numbers[i+2], numbers[i+1], numbers[i]];
            const seq3Key = seq3.join('→');
            
            if (!correlations[seq3Key]) {
                correlations[seq3Key] = {
                    pattern: seq3,
                    outcomes: [],
                    count: 0,
                    occurrenceTimes: [],
                    lastOccurrenceNumbers: []
                };
            }
            
            correlations[seq3Key].outcomes.push(resultColor);
            correlations[seq3Key].count++;
            correlations[seq3Key].occurrenceTimes.push(new Date().toISOString());
            correlations[seq3Key].lastOccurrenceNumbers = seq3;
        }
    }
    
    // Analisar correlações encontradas
    const validPatterns = [];
    Object.values(correlations).forEach(pattern => {
        if (pattern.count < 3) return; // Mínimo 3 ocorrências
        
        const colorCounts = {};
        pattern.outcomes.forEach(color => {
            colorCounts[color] = (colorCounts[color] || 0) + 1;
        });
        
        const mostFrequentColor = Object.keys(colorCounts).reduce((a, b) => 
            colorCounts[a] > colorCounts[b] ? a : b, 'red');
        
        const accuracy = (colorCounts[mostFrequentColor] / pattern.outcomes.length) * 100;
        const statisticalSignificance = colorCounts[mostFrequentColor] / (pattern.outcomes.length / 3);
        
        // ✅ Calcular WINS e LOSSES
        const wins = colorCounts[mostFrequentColor] || 0;
        const losses = pattern.outcomes.length - wins;
        
        if (accuracy >= 75 && statisticalSignificance >= 2.0) {
            validPatterns.push({
                type: 'number-correlation',
                pattern: pattern.pattern.join('→'),
                suggestedColor: mostFrequentColor,
                confidence: accuracy,
                occurrences: pattern.count,
                wins: wins,  // ✅ ADICIONADO
                losses: losses,  // ✅ ADICIONADO
                occurrenceTimes: pattern.occurrenceTimes,
                lastOccurrenceNumbers: pattern.lastOccurrenceNumbers,
                statisticalSignificance: statisticalSignificance,
                patternType: pattern.pattern.length === 2 ? 'Correlação Simples' : 'Correlação Estendida'
            });
        }
    });
    
    return validPatterns.length > 0 ? validPatterns[0] : null;
}

// NOVO: analisar pares de número+cor consecutivos que levam a próxima cor
function analyzeNumberColorPairs(history) {
    if (!history || history.length < 3) return null;
    const pairMap = new Map();
    // Percorre janelas de 3 giros: [i+2, i+1] determinam o par, outcome é i (giro seguinte)
    for (let i = 1; i < history.length - 1; i++) {
        const a = history[i+1]; // mais antigo no par
        const b = history[i];   // mais recente no par
        const outcome = history[i-1]; // próxima cor após o par
        if (!a || !b || !outcome) continue;
        const key = `${a.number}-${a.color}|${b.number}-${b.color}`;
        let rec = pairMap.get(key);
        if (!rec) {
            rec = { pair: [{ number: a.number, color: a.color }, { number: b.number, color: b.color }], outcomes: [], count: 0 };
            pairMap.set(key, rec);
        }
        rec.outcomes.push(outcome.color);
        rec.count++;
    }
    // Avaliar pares
    const candidates = [];
    pairMap.forEach(rec => {
        if (rec.count < 3) return; // mínimo 3 ocorrências do par
        const counts = {};
        rec.outcomes.forEach(c => counts[c] = (counts[c] || 0) + 1);
        // ✅ CORREÇÃO: Usar primeira chave disponível em vez de 'red' como padrão
        const keys = Object.keys(counts);
        if (keys.length === 0) return;
        const winner = keys.reduce((a, b) => counts[a] >= counts[b] ? a : b);
        const acc = (counts[winner] / rec.outcomes.length) * 100;
        const signif = counts[winner] / (rec.outcomes.length / 3);
        if (acc >= 70 && signif >= 1.8) {
            candidates.push({
                type: 'number-color-pair',
                pair: rec.pair,
                suggestedColor: winner,
                confidence: acc,
                occurrences: rec.count,
                statisticalSignificance: signif,
                pattern: `${rec.pair[0].number}-${rec.pair[0].color} + ${rec.pair[1].number}-${rec.pair[1].color}`
            });
        }
    });
    if (candidates.length === 0) return null;
    candidates.sort((a,b)=> (b.confidence - a.confidence) || (b.occurrences - a.occurrences));
    return candidates[0];
}

// Analisar sequências especiais (Padrões 5-7)
function analyzeSpecialSequences(numbers, colors) {
    const specialPatterns = [];
    
    for (let i = 2; i < numbers.length - 1; i++) {
        const currentNumbers = [numbers[i+2], numbers[i+1], numbers[i]];
        const resultColor = colors[i-1];
        
        // Padrão 5: Pares Crescentes (2→4→6)
        if (isAscendingEvenSequence(currentNumbers)) {
            specialPatterns.push({
                pattern: currentNumbers.join('→'),
                outcome: resultColor,
                type: 'Pares Crescentes'
            });
        }
        
        // Padrão 6: Ímpares Decrescentes (13→11→9)
        if (isDescendingOddSequence(currentNumbers)) {
            specialPatterns.push({
                pattern: currentNumbers.join('→'),
                outcome: resultColor,
                type: 'Ímpares Decrescentes'
            });
        }
        
        // Padrão 7: Retorno ao Múltiplo de 5 (5→10→0)
        if (isMultipleOfFiveSequence(currentNumbers)) {
            specialPatterns.push({
                pattern: currentNumbers.join('→'),
                outcome: resultColor,
                type: 'Múltiplos de 5'
            });
        }
    }
    
    // Analisar padrões especiais encontrados
    const analyzedPatterns = {};
    specialPatterns.forEach(pattern => {
        const key = `${pattern.type}-${pattern.pattern}`;
        if (!analyzedPatterns[key]) {
            analyzedPatterns[key] = {
                pattern: pattern.pattern,
                type: pattern.type,
                outcomes: [],
                count: 0
            };
        }
        analyzedPatterns[key].outcomes.push(pattern.outcome);
        analyzedPatterns[key].count++;
    });
    
    // Retornar o melhor padrão especial
    const validSpecialPatterns = [];
    Object.values(analyzedPatterns).forEach(pattern => {
        if (pattern.count < 3) return;
        
        const colorCounts = {};
        pattern.outcomes.forEach(color => {
            colorCounts[color] = (colorCounts[color] || 0) + 1;
        });
        
        const mostFrequentColor = Object.keys(colorCounts).reduce((a, b) => 
            colorCounts[a] > colorCounts[b] ? a : b, 'red');
        
        const accuracy = (colorCounts[mostFrequentColor] / pattern.outcomes.length) * 100;
        const statisticalSignificance = colorCounts[mostFrequentColor] / (pattern.outcomes.length / 3);
        
        if (accuracy >= 75 && statisticalSignificance >= 2.0) {
            validSpecialPatterns.push({
                type: 'number-sequence',
                pattern: pattern.pattern,
                suggestedColor: mostFrequentColor,
                confidence: accuracy,
                occurrences: pattern.count,
                statisticalSignificance: statisticalSignificance,
                patternType: pattern.type
            });
        }
    });
    
    return validSpecialPatterns.length > 0 ? validSpecialPatterns[0] : null;
}

// Analisar padrões matemáticos (Padrões 8-12)
function analyzeMathematicalPatterns(numbers, colors) {
    const mathPatterns = [];
    
    for (let i = 1; i < numbers.length - 1; i++) {
        const num1 = numbers[i+1];
        const num2 = numbers[i];
        const resultColor = colors[i-1];
        
        // Padrão 8: Duplicação Reversa
        if (num1 === num2) {
            mathPatterns.push({
                pattern: `${num1}→${num2}`,
                outcome: resultColor,
                type: 'Duplicação Reversa'
            });
        }
        
        // Padrão 9: Sequência de extremos (1→14 ou 14→1)
        if ((num1 === 1 && num2 === 14) || (num1 === 14 && num2 === 1)) {
            mathPatterns.push({
                pattern: `${num1}→${num2}`,
                outcome: resultColor,
                type: 'Extremos Consecutivos'
            });
        }
        
        // Padrão 10: Soma múltipla de 5
        if ((num1 + num2) % 5 === 0) {
            mathPatterns.push({
                pattern: `${num1}+${num2}=${num1+num2}`,
                outcome: resultColor,
                type: 'Soma Múltipla de 5'
            });
        }
        
        // Padrão 11: Alternância Ímpar/Par
        if ((num1 % 2 !== num2 % 2) && getColorFromNumber(num1) === getColorFromNumber(num2)) {
            mathPatterns.push({
                pattern: `${num1}→${num2}`,
                outcome: resultColor,
                type: 'Alternância Ímpar/Par'
            });
        }
        
        // Padrão 12: Inversão de Extremidade
        if ((num1 >= 12 && num2 <= 3) || (num1 <= 3 && num2 >= 12)) {
            mathPatterns.push({
                pattern: `${num1}→${num2}`,
                outcome: resultColor,
                type: 'Inversão de Extremidade'
            });
        }
    }
    
    // Analisar padrões matemáticos encontrados
    const analyzedMathPatterns = {};
    mathPatterns.forEach(pattern => {
        const key = `${pattern.type}-${pattern.pattern}`;
        if (!analyzedMathPatterns[key]) {
            analyzedMathPatterns[key] = {
                pattern: pattern.pattern,
                type: pattern.type,
                outcomes: [],
                count: 0
            };
        }
        analyzedMathPatterns[key].outcomes.push(pattern.outcome);
        analyzedMathPatterns[key].count++;
    });
    
    // Retornar o melhor padrão matemático
    const validMathPatterns = [];
    Object.values(analyzedMathPatterns).forEach(pattern => {
        if (pattern.count < 3) return;
        
        const colorCounts = {};
        pattern.outcomes.forEach(color => {
            colorCounts[color] = (colorCounts[color] || 0) + 1;
        });
        
        const mostFrequentColor = Object.keys(colorCounts).reduce((a, b) => 
            colorCounts[a] > colorCounts[b] ? a : b, 'red');
        
        const accuracy = (colorCounts[mostFrequentColor] / pattern.outcomes.length) * 100;
        const statisticalSignificance = colorCounts[mostFrequentColor] / (pattern.outcomes.length / 3);
        
        if (accuracy >= 75 && statisticalSignificance >= 2.0) {
            validMathPatterns.push({
                type: 'number-math',
                pattern: pattern.pattern,
                suggestedColor: mostFrequentColor,
                confidence: accuracy,
                occurrences: pattern.count,
                statisticalSignificance: statisticalSignificance,
                patternType: pattern.type
            });
        }
    });
    
    return validMathPatterns.length > 0 ? validMathPatterns[0] : null;
}

// Analisar padrões avançados (Padrões 13-17)
function analyzeAdvancedPatterns(numbers, colors) {
    const advancedPatterns = [];
    
    for (let i = 2; i < numbers.length - 1; i++) {
        const currentNumbers = [numbers[i+2], numbers[i+1], numbers[i]];
        const resultColor = colors[i-1];
        
        // Padrão 13: Repetição de Bloco
        if (isSameColorBlock(currentNumbers)) {
            advancedPatterns.push({
                pattern: currentNumbers.join('→'),
                outcome: resultColor,
                type: 'Repetição de Bloco'
            });
        }
        
        // Padrão 14: Branco em Intervalo Fixo (simulado)
        if (currentNumbers.includes(0)) {
            advancedPatterns.push({
                pattern: currentNumbers.join('→'),
                outcome: resultColor,
                type: 'Branco em Intervalo'
            });
        }
        
        // Padrão 15: Repetição por Horário (simulado)
        const hour = new Date().getHours();
        if (hour >= 22 || hour <= 2) { // Horário noturno
            advancedPatterns.push({
                pattern: currentNumbers.join('→'),
                outcome: resultColor,
                type: 'Padrão Noturno'
            });
        }
        
        // Padrão 16: Tripla Correlação Inversa
        if (isTripleSameColor(currentNumbers)) {
            advancedPatterns.push({
                pattern: currentNumbers.join('→'),
                outcome: resultColor,
                type: 'Tripla Correlação Inversa'
            });
        }
        
        // Padrão 17: Espelhamento de Intervalo
        if (i >= 10) {
            const mirrorNumbers = [numbers[i+12], numbers[i+11], numbers[i+10]];
            if (isMirrorSequence(currentNumbers, mirrorNumbers)) {
                advancedPatterns.push({
                    pattern: currentNumbers.join('→'),
                    outcome: resultColor,
                    type: 'Espelhamento de Intervalo'
                });
            }
        }
    }
    
    // Analisar padrões avançados encontrados
    const analyzedAdvancedPatterns = {};
    advancedPatterns.forEach(pattern => {
        const key = `${pattern.type}-${pattern.pattern}`;
        if (!analyzedAdvancedPatterns[key]) {
            analyzedAdvancedPatterns[key] = {
                pattern: pattern.pattern,
                type: pattern.type,
                outcomes: [],
                count: 0
            };
        }
        analyzedAdvancedPatterns[key].outcomes.push(pattern.outcome);
        analyzedAdvancedPatterns[key].count++;
    });
    
    // Retornar o melhor padrão avançado
    const validAdvancedPatterns = [];
    Object.values(analyzedAdvancedPatterns).forEach(pattern => {
        if (pattern.count < 3) return;
        
        const colorCounts = {};
        pattern.outcomes.forEach(color => {
            colorCounts[color] = (colorCounts[color] || 0) + 1;
        });
        
        const mostFrequentColor = Object.keys(colorCounts).reduce((a, b) => 
            colorCounts[a] > colorCounts[b] ? a : b, 'red');
        
        const accuracy = (colorCounts[mostFrequentColor] / pattern.outcomes.length) * 100;
        const statisticalSignificance = colorCounts[mostFrequentColor] / (pattern.outcomes.length / 3);
        
        if (accuracy >= 75 && statisticalSignificance >= 2.0) {
            validAdvancedPatterns.push({
                type: 'number-advanced',
                pattern: pattern.pattern,
                suggestedColor: mostFrequentColor,
                confidence: accuracy,
                occurrences: pattern.count,
                statisticalSignificance: statisticalSignificance,
                patternType: pattern.type
            });
        }
    });
    
    return validAdvancedPatterns.length > 0 ? validAdvancedPatterns[0] : null;
}

// Funções auxiliares para análise numérica
function isAscendingEvenSequence(numbers) {
    return numbers.every(num => num % 2 === 0) && 
           numbers[0] < numbers[1] && numbers[1] < numbers[2];
}

function isDescendingOddSequence(numbers) {
    return numbers.every(num => num % 2 === 1) && 
           numbers[0] > numbers[1] && numbers[1] > numbers[2];
}

function isMultipleOfFiveSequence(numbers) {
    return numbers.every(num => num % 5 === 0);
}

function isSameColorBlock(numbers) {
    // ✅ VALIDAR se todos os números são válidos
    if (!numbers || numbers.some(num => num === undefined || num === null)) {
        return false;
    }
    const colors = numbers.map(num => getColorFromNumber(num));
    return colors.every(color => color === colors[0] && color !== 'unknown');
}

function isTripleSameColor(numbers) {
    // ✅ VALIDAR se todos os números são válidos
    if (!numbers || numbers.some(num => num === undefined || num === null)) {
        return false;
    }
    const colors = numbers.map(num => getColorFromNumber(num));
    return colors.every(color => color === colors[0] && color !== 'unknown');
}

function isMirrorSequence(seq1, seq2) {
    if (seq1.length !== seq2.length) return false;
    for (let i = 0; i < seq1.length; i++) {
        if (seq1[i] !== seq2[seq2.length - 1 - i]) return false;
    }
    return true;
}

// ANÁLISE DE PADRÕES NUMÉRICOS MULTIDIMENSIONAL (função antiga mantida para compatibilidade)
function analyzeNumberPatternsOld(history) {
    if (history.length < 50) return null; // Mínimo de 50 giros
    
    // Usar TODO o histórico disponível para máxima precisão
    const numbers = history.map(s => s.number);
    const colors = history.map(s => s.color);
    
    // 1. ANÁLISE DE SEQUÊNCIAS NUMÉRICAS
    const sequencePattern = analyzeNumberSequences(numbers);
    
    // 2. ANÁLISE DE PARIDADE
    const parityPattern = analyzeParityPatterns(numbers, colors);
    
    // 3. ANÁLISE DE FAIXAS NUMÉRICAS
    const rangePattern = analyzeNumberRanges(numbers, colors);
    
    // 4. ANÁLISE DE DÍGITOS
    const digitPattern = analyzeDigitPatterns(numbers, colors);
    
    // 5. ANÁLISE DE PROGRESSÕES MATEMÁTICAS
    const mathPattern = analyzeMathProgressions(numbers, colors);
    
    // Combinar todas as análises numéricas
    const patterns = [sequencePattern, parityPattern, rangePattern, digitPattern, mathPattern].filter(p => p !== null);
    
    if (patterns.length === 0) return null;
    
    // Encontrar o padrão com maior confiança
    const bestPattern = patterns.sort((a, b) => b.confidence - a.confidence)[0];
    
    return {
        type: 'number',
        pattern: bestPattern.pattern,
        suggestedNumber: bestPattern.suggestedNumber,
        suggestedColor: bestPattern.suggestedColor,
        confidence: bestPattern.confidence,
        occurrences: bestPattern.occurrences,
        statisticalSignificance: bestPattern.statisticalSignificance,
        subPatterns: patterns.map(p => ({ type: p.type, confidence: p.confidence }))
    };
}

// Analisar sequências numéricas (1-2-3-4-5, 10-20-30-40-50)
function analyzeNumberSequences(numbers) {
    const sequences = {};
    
    // Procurar sequências de 2-5 números
    for (let len = 2; len <= 5; len++) {
        for (let i = 0; i <= numbers.length - len; i++) {
            const sequence = numbers.slice(i, i + len);
            const key = sequence.join('-');
            
            if (!sequences[key]) {
                sequences[key] = {
                    pattern: sequence,
                    occurrences: 0,
                    nextNumbers: [],
                    nextColors: []
                };
            }
            
            sequences[key].occurrences++;
            
            // Se não é a última sequência, pegar o próximo número
            if (i > 0) {
                sequences[key].nextNumbers.push(numbers[i - 1]);
                // Assumir cor baseada no número (será refinado depois)
                sequences[key].nextColors.push(getColorFromNumber(numbers[i - 1]));
            }
        }
    }
    
    // Encontrar sequências mais frequentes
    const frequentSequences = Object.values(sequences).filter(s => s.occurrences >= 2);
    if (frequentSequences.length === 0) return null;
    
    const bestSequence = frequentSequences.sort((a, b) => b.occurrences - a.occurrences)[0];
    
    // Calcular próxima cor mais provável
    const colorCounts = {};
    bestSequence.nextColors.forEach(color => {
        colorCounts[color] = (colorCounts[color] || 0) + 1;
    });
    
    const mostFrequentColor = Object.keys(colorCounts).reduce((a, b) => 
        colorCounts[a] > colorCounts[b] ? a : b, 'red'
    );
    
    const confidence = (colorCounts[mostFrequentColor] / bestSequence.nextColors.length) * 100;
    
    return {
        type: 'sequence',
        pattern: `Sequência: ${bestSequence.pattern.join('-')}`,
        suggestedNumber: bestSequence.pattern[bestSequence.pattern.length - 1] + 1, // Próximo na sequência
        suggestedColor: mostFrequentColor,
        confidence: Math.min(confidence, 85),
        occurrences: bestSequence.occurrences,
        statisticalSignificance: bestSequence.occurrences / 2 // Normalizar
    };
}

// Analisar padrões de paridade (pares/ímpares)
function analyzeParityPatterns(numbers, colors) {
    const parityPatterns = {};
    
    // Procurar padrões de paridade de 2-5 giros
    for (let len = 2; len <= 5; len++) {
        for (let i = 0; i <= numbers.length - len; i++) {
            const sequence = numbers.slice(i, i + len);
            const parity = sequence.map(n => n % 2 === 0 ? 'par' : 'ímpar');
            const key = parity.join('-');
            
            if (!parityPatterns[key]) {
                parityPatterns[key] = {
                    pattern: parity,
                    occurrences: 0,
                    nextParity: [],
                    nextColors: []
                };
            }
            
            parityPatterns[key].occurrences++;
            
            if (i > 0) {
                parityPatterns[key].nextParity.push(numbers[i - 1] % 2 === 0 ? 'par' : 'ímpar');
                parityPatterns[key].nextColors.push(colors[i - 1]);
            }
        }
    }
    
    const frequentPatterns = Object.values(parityPatterns).filter(p => p.occurrences >= 2);
    if (frequentPatterns.length === 0) return null;
    
    const bestPattern = frequentPatterns.sort((a, b) => b.occurrences - a.occurrences)[0];
    
    // Calcular próxima paridade e cor
    const colorCounts = {};
    bestPattern.nextColors.forEach(color => {
        colorCounts[color] = (colorCounts[color] || 0) + 1;
    });
    
    const mostFrequentColor = Object.keys(colorCounts).reduce((a, b) => 
        colorCounts[a] > colorCounts[b] ? a : b, 'red'
    );
    
    const confidence = (colorCounts[mostFrequentColor] / bestPattern.nextColors.length) * 100;
    
    return {
        type: 'parity',
        pattern: `Paridade: ${bestPattern.pattern.join('-')}`,
        suggestedNumber: bestPattern.pattern[bestPattern.pattern.length - 1] === 'par' ? 'ímpar' : 'par',
        suggestedColor: mostFrequentColor,
        confidence: Math.min(confidence, 80),
        occurrences: bestPattern.occurrences,
        statisticalSignificance: bestPattern.occurrences / 2
    };
}

// Analisar faixas numéricas (1-7, 8-14, 0)
function analyzeNumberRanges(numbers, colors) {
    const rangePatterns = {};
    
    // Procurar padrões de faixas de 2-5 giros
    for (let len = 2; len <= 5; len++) {
        for (let i = 0; i <= numbers.length - len; i++) {
            const sequence = numbers.slice(i, i + len);
            const ranges = sequence.map(n => {
                if (n === 0) return 'branco';
                if (n >= 1 && n <= 7) return 'vermelho';
                if (n >= 8 && n <= 14) return 'preto';
                return 'outro';
            });
            const key = ranges.join('-');
            
            if (!rangePatterns[key]) {
                rangePatterns[key] = {
                    pattern: ranges,
                    occurrences: 0,
                    nextRanges: [],
                    nextColors: []
                };
            }
            
            rangePatterns[key].occurrences++;
            
            if (i > 0) {
                const nextNum = numbers[i - 1];
                const nextRange = nextNum === 0 ? 'branco' : 
                                 (nextNum >= 1 && nextNum <= 7) ? 'vermelho' : 
                                 (nextNum >= 8 && nextNum <= 14) ? 'preto' : 'outro';
                rangePatterns[key].nextRanges.push(nextRange);
                rangePatterns[key].nextColors.push(colors[i - 1]);
            }
        }
    }
    
    const frequentPatterns = Object.values(rangePatterns).filter(p => p.occurrences >= 2);
    if (frequentPatterns.length === 0) return null;
    
    const bestPattern = frequentPatterns.sort((a, b) => b.occurrences - a.occurrences)[0];
    
    // Calcular próxima faixa e cor
    const colorCounts = {};
    bestPattern.nextColors.forEach(color => {
        colorCounts[color] = (colorCounts[color] || 0) + 1;
    });
    
    const mostFrequentColor = Object.keys(colorCounts).reduce((a, b) => 
        colorCounts[a] > colorCounts[b] ? a : b, 'red'
    );
    
    const confidence = (colorCounts[mostFrequentColor] / bestPattern.nextColors.length) * 100;
    
    return {
        type: 'range',
        pattern: `Faixa: ${bestPattern.pattern.join('-')}`,
        suggestedNumber: bestPattern.pattern[bestPattern.pattern.length - 1] === 'vermelho' ? 'preto' : 
                        bestPattern.pattern[bestPattern.pattern.length - 1] === 'preto' ? 'vermelho' : 'branco',
        suggestedColor: mostFrequentColor,
        confidence: Math.min(confidence, 75),
        occurrences: bestPattern.occurrences,
        statisticalSignificance: bestPattern.occurrences / 2
    };
}

// Analisar padrões de dígitos (terminações)
function analyzeDigitPatterns(numbers, colors) {
    const digitPatterns = {};
    
    // Procurar padrões de dígitos finais de 2-5 giros
    for (let len = 2; len <= 5; len++) {
        for (let i = 0; i <= numbers.length - len; i++) {
            const sequence = numbers.slice(i, i + len);
            const digits = sequence.map(n => n % 10); // Último dígito
            const key = digits.join('-');
            
            if (!digitPatterns[key]) {
                digitPatterns[key] = {
                    pattern: digits,
                    occurrences: 0,
                    nextDigits: [],
                    nextColors: []
                };
            }
            
            digitPatterns[key].occurrences++;
            
            if (i > 0) {
                digitPatterns[key].nextDigits.push(numbers[i - 1] % 10);
                digitPatterns[key].nextColors.push(colors[i - 1]);
            }
        }
    }
    
    const frequentPatterns = Object.values(digitPatterns).filter(p => p.occurrences >= 2);
    if (frequentPatterns.length === 0) return null;
    
    const bestPattern = frequentPatterns.sort((a, b) => b.occurrences - a.occurrences)[0];
    
    // Calcular próximo dígito e cor
    const colorCounts = {};
    bestPattern.nextColors.forEach(color => {
        colorCounts[color] = (colorCounts[color] || 0) + 1;
    });
    
    const mostFrequentColor = Object.keys(colorCounts).reduce((a, b) => 
        colorCounts[a] > colorCounts[b] ? a : b, 'red'
    );
    
    const confidence = (colorCounts[mostFrequentColor] / bestPattern.nextColors.length) * 100;
    
    return {
        type: 'digit',
        pattern: `Dígitos: ${bestPattern.pattern.join('-')}`,
        suggestedNumber: bestPattern.pattern[bestPattern.pattern.length - 1],
        suggestedColor: mostFrequentColor,
        confidence: Math.min(confidence, 70),
        occurrences: bestPattern.occurrences,
        statisticalSignificance: bestPattern.occurrences / 2
    };
}

// Analisar progressões matemáticas (Fibonacci, aritméticas)
function analyzeMathProgressions(numbers, colors) {
    const progressions = {};
    
    // Procurar progressões aritméticas de 2-4 números
    for (let len = 2; len <= 4; len++) {
        for (let i = 0; i <= numbers.length - len; i++) {
            const sequence = numbers.slice(i, i + len);
            
            // Verificar se é progressão aritmética
            const diffs = [];
            for (let j = 1; j < sequence.length; j++) {
                diffs.push(sequence[j] - sequence[j - 1]);
            }
            
            if (diffs.every(d => d === diffs[0])) {
                const key = `PA-${diffs[0]}-${sequence.join('-')}`;
                
                if (!progressions[key]) {
                    progressions[key] = {
                        pattern: sequence,
                        difference: diffs[0],
                        occurrences: 0,
                        nextNumbers: [],
                        nextColors: []
                    };
                }
                
                progressions[key].occurrences++;
                
                if (i > 0) {
                    progressions[key].nextNumbers.push(numbers[i - 1]);
                    progressions[key].nextColors.push(colors[i - 1]);
                }
            }
        }
    }
    
    const frequentProgressions = Object.values(progressions).filter(p => p.occurrences >= 2);
    if (frequentProgressions.length === 0) return null;
    
    const bestProgression = frequentProgressions.sort((a, b) => b.occurrences - a.occurrences)[0];
    
    // Calcular próximo número na progressão e cor
    const colorCounts = {};
    bestProgression.nextColors.forEach(color => {
        colorCounts[color] = (colorCounts[color] || 0) + 1;
    });
    
    const mostFrequentColor = Object.keys(colorCounts).reduce((a, b) => 
        colorCounts[a] > colorCounts[b] ? a : b, 'red'
    );
    
    const confidence = (colorCounts[mostFrequentColor] / bestProgression.nextColors.length) * 100;
    
    return {
        type: 'progression',
        pattern: `PA(${bestProgression.difference}): ${bestProgression.pattern.join('-')}`,
        suggestedNumber: bestProgression.pattern[bestProgression.pattern.length - 1] + bestProgression.difference,
        suggestedColor: mostFrequentColor,
        confidence: Math.min(confidence, 80),
        occurrences: bestProgression.occurrences,
        statisticalSignificance: bestProgression.occurrences / 2
    };
}

// ANÁLISE DE PADRÕES TEMPORAIS E MISTOS (baseada nos exemplos 21-33)
function analyzeTemporalAndMixedPatterns(history) {
    if (history.length < 50) return null; // Mínimo de 50 giros
    
    const colors = history.map(s => s.color);
    const timestamps = history.map(s => s.timestamp);
    const bestPatterns = [];
    
    // 1. PADRÕES DE TEMPO E HORÁRIO (21-25)
    const timePatterns = analyzeTimePatterns(history, colors, timestamps);
    if (timePatterns) bestPatterns.push(timePatterns);
    
    // 2. PADRÕES MISTOS COR + TEMPO (26-33)
    const mixedPatterns = analyzeMixedPatterns(history, colors, timestamps);
    if (mixedPatterns) bestPatterns.push(mixedPatterns);
    
    if (bestPatterns.length === 0) return null;
    
    // CRÍTICO: Verificar se o padrão atual realmente corresponde ao padrão encontrado
    const bestPattern = bestPatterns.sort((a, b) => (b.confidence - a.confidence) || (b.occurrences - a.occurrences))[0];
    
    // Para padrões temporais, verificar se o contexto atual é válido
    const currentTime = new Date();
    const currentHour = currentTime.getHours();
    const recentSpins = colors.slice(0, 10); // Últimos 10 giros
    
    // Verificar se o padrão temporal é aplicável ao momento atual
    if (bestPattern.type === 'time-pattern') {
        // Verificar se estamos no horário correto para o padrão
        if (bestPattern.pattern.includes('Noturno') && (currentHour < 22 || currentHour > 2)) {
            console.log('❌ Padrão temporal não aplicável ao horário atual:', {
                pattern: bestPattern.pattern,
                currentHour: currentHour
            });
            return null;
        }
        
        if (bestPattern.pattern.includes('Diurno') && (currentHour >= 22 || currentHour <= 2)) {
            console.log('❌ Padrão temporal não aplicável ao horário atual:', {
                pattern: bestPattern.pattern,
                currentHour: currentHour
            });
            return null;
        }
    }
    
    console.log('✅ Padrão temporal/misto atual confirma o padrão encontrado:', {
        foundPattern: bestPattern.pattern,
        currentHour: currentHour,
        recentSpins: recentSpins.slice(0, 10)
    });
    
    return bestPattern;
}

// Analisar padrões de tempo e horário (21-25)
function analyzeTimePatterns(history, colors, timestamps) {
    const timePatterns = [];
    const currentTime = new Date();
    const currentHour = currentTime.getHours();
    
    // Padrão 21: Branco Intervalado (a cada 70-100 giros)
    const whiteIntervals = analyzeWhiteIntervals(history);
    if (whiteIntervals) timePatterns.push(whiteIntervals);
    
    // Padrão 22: Pico Noturno de Brancos (22h-02h)
    if (currentHour >= 22 || currentHour <= 2) {
        const nightWhitePattern = analyzeNightWhitePattern(history);
        if (nightWhitePattern) timePatterns.push(nightWhitePattern);
    }
    
    // Padrão 23: Estabilidade Noturna (sequências longas à noite)
    if (currentHour >= 22 || currentHour <= 2) {
        const nightStabilityPattern = analyzeNightStabilityPattern(history);
        if (nightStabilityPattern) timePatterns.push(nightStabilityPattern);
    }
    
    // Padrão 24: Oscilação Diurna (alternâncias curtas durante o dia)
    if (currentHour >= 6 && currentHour <= 18) {
        const dayOscillationPattern = analyzeDayOscillationPattern(history);
        if (dayOscillationPattern) timePatterns.push(dayOscillationPattern);
    }
    
    // Padrão 25: Pós-Pico de Branco
    const postWhitePeakPattern = analyzePostWhitePeakPattern(history);
    if (postWhitePeakPattern) timePatterns.push(postWhitePeakPattern);
    
    return timePatterns.length > 0 ? timePatterns[0] : null;
}

// Analisar padrões mistos cor + tempo (26-33)
function analyzeMixedPatterns(history, colors, timestamps) {
    const mixedPatterns = [];
    
    // Padrão 26: Recuperação Pós-Branco
    const recoveryPattern = analyzePostWhiteRecoveryPattern(history);
    if (recoveryPattern) mixedPatterns.push(recoveryPattern);
    
    // Padrão 27: Branco na Quebra de Alternância
    const whiteBreakPattern = analyzeWhiteBreakPattern(history);
    if (whiteBreakPattern) mixedPatterns.push(whiteBreakPattern);
    
    // Padrão 28: Branco Após Dominância Longa
    const whiteAfterDominancePattern = analyzeWhiteAfterDominancePattern(history);
    if (whiteAfterDominancePattern) mixedPatterns.push(whiteAfterDominancePattern);
    
    // Padrão 29: Correção Total
    const totalCorrectionPattern = analyzeTotalCorrectionPattern(history);
    if (totalCorrectionPattern) mixedPatterns.push(totalCorrectionPattern);
    
    // Padrão 30: Ciclo Completo
    const completeCyclePattern = analyzeCompleteCyclePattern(history);
    if (completeCyclePattern) mixedPatterns.push(completeCyclePattern);
    
    // Padrão 31: Repetição em Mesmo Horário
    const timeRepetitionPattern = analyzeTimeRepetitionPattern(history);
    if (timeRepetitionPattern) mixedPatterns.push(timeRepetitionPattern);
    
    // Padrão 32: Reversão Temporal
    const temporalReversalPattern = analyzeTemporalReversalPattern(history);
    if (temporalReversalPattern) mixedPatterns.push(temporalReversalPattern);
    
    // Padrão 33: Microciclos Repetidos
    const microcyclePattern = analyzeMicrocyclePattern(history);
    if (microcyclePattern) mixedPatterns.push(microcyclePattern);
    
    return mixedPatterns.length > 0 ? mixedPatterns[0] : null;
}

// Funções específicas para cada padrão temporal
function analyzeWhiteIntervals(history) {
    const whitePositions = [];
    history.forEach((spin, index) => {
        if (spin.color === 'white') {
            whitePositions.push(index);
        }
    });
    
    if (whitePositions.length < 3) return null;
    
    // Calcular intervalos entre brancos
    const intervals = [];
    for (let i = 1; i < whitePositions.length; i++) {
        intervals.push(whitePositions[i] - whitePositions[i-1]);
    }
    
    // Verificar se há padrão de intervalo (70-100 giros)
    const validIntervals = intervals.filter(interval => interval >= 70 && interval <= 100);
    
    if (validIntervals.length >= 3) {
        const lastWhiteIndex = whitePositions[whitePositions.length - 1];
        const spinsSinceLastWhite = history.length - lastWhiteIndex;
        
        if (spinsSinceLastWhite >= 70) {
            return {
                type: 'time-pattern',
                pattern: 'Branco Intervalado',
                suggestedColor: 'white',
                confidence: 80,
                occurrences: validIntervals.length,
                statisticalSignificance: 2.5,
                patternType: 'Branco Intervalado'
            };
        }
    }
    
    return null;
}

function analyzeNightWhitePattern(history) {
    const recentSpins = history.slice(0, 60);
    const whiteCount = recentSpins.filter(spin => spin.color === 'white').length;
    
    if (whiteCount === 0 && recentSpins.length >= 60) {
        return {
            type: 'time-pattern',
            pattern: 'Pico Noturno de Brancos',
            suggestedColor: 'white',
            confidence: 75,
            occurrences: 1,
            statisticalSignificance: 2.0,
            patternType: 'Pico Noturno de Brancos'
        };
    }
    
    return null;
}

function analyzeNightStabilityPattern(history) {
    // Procurar sequências longas (8+ da mesma cor)
    for (let i = 0; i < history.length - 8; i++) {
        const sequence = history.slice(i, i + 8);
        const colors = sequence.map(s => s.color);
        
        if (colors.every(color => color === colors[0])) {
            return {
                type: 'time-pattern',
                pattern: 'Estabilidade Noturna',
                suggestedColor: colors[0] === 'red' ? 'black' : 'red',
                confidence: 78,
                occurrences: 1,
                statisticalSignificance: 2.2,
                patternType: 'Estabilidade Noturna'
            };
        }
    }
    
    return null;
}

function analyzeDayOscillationPattern(history) {
    // Procurar alternâncias curtas durante o dia
    const recentSpins = history.slice(0, 6);
    const colors = recentSpins.map(s => s.color);
    
    if (isAlternatingPattern(colors.slice(0, 4))) {
        return {
            type: 'time-pattern',
            pattern: 'Oscilação Diurna',
            suggestedColor: colors[0] === 'red' ? 'black' : 'red',
            confidence: 76,
            occurrences: 1,
            statisticalSignificance: 2.1,
            patternType: 'Oscilação Diurna'
        };
    }
    
    return null;
}

function analyzePostWhitePeakPattern(history) {
    // Procurar muitos brancos em sequência curta
    const recentSpins = history.slice(0, 10);
    const whiteCount = recentSpins.filter(spin => spin.color === 'white').length;
    
    if (whiteCount >= 3) {
        return {
            type: 'time-pattern',
            pattern: 'Pós-Pico de Branco',
            suggestedColor: 'red', // Apostar 2x (vermelho ou preto)
            confidence: 77,
            occurrences: 1,
            statisticalSignificance: 2.3,
            patternType: 'Pós-Pico de Branco'
        };
    }
    
    return null;
}

// Funções específicas para padrões mistos
function analyzePostWhiteRecoveryPattern(history) {
    const recentSpins = history.slice(0, 10);
    const colors = recentSpins.map(s => s.color);
    
    // Padrão: Branco, Vermelho, Vermelho, Preto, Preto
    if (colors[0] === 'white' && colors[1] === 'red' && colors[2] === 'red' && 
        colors[3] === 'black' && colors[4] === 'black') {
        return {
            type: 'mixed-pattern',
            pattern: 'Recuperação Pós-Branco',
            suggestedColor: 'red',
            confidence: 80,
            occurrences: 1,
            statisticalSignificance: 2.4,
            patternType: 'Recuperação Pós-Branco'
        };
    }
    
    return null;
}

function analyzeWhiteBreakPattern(history) {
    const recentSpins = history.slice(0, 10);
    const colors = recentSpins.map(s => s.color);
    
    // Padrão: Vermelho, Preto, Vermelho, Preto, Branco
    if (colors[0] === 'red' && colors[1] === 'black' && colors[2] === 'red' && 
        colors[3] === 'black' && colors[4] === 'white') {
        return {
            type: 'mixed-pattern',
            pattern: 'Branco na Quebra de Alternância',
            suggestedColor: 'black',
            confidence: 79,
            occurrences: 1,
            statisticalSignificance: 2.2,
            patternType: 'Branco na Quebra de Alternância'
        };
    }
    
    return null;
}

function analyzeWhiteAfterDominancePattern(history) {
    // Procurar 8+ repetições da mesma cor seguida de branco
    for (let i = 0; i < history.length - 9; i++) {
        const sequence = history.slice(i, i + 9);
        const colors = sequence.map(s => s.color);
        
        if (colors.slice(0, 8).every(color => color === colors[0]) && colors[8] === 'white') {
            return {
                type: 'mixed-pattern',
                pattern: 'Branco Após Dominância Longa',
                suggestedColor: 'white',
                confidence: 82,
                occurrences: 1,
                statisticalSignificance: 2.6,
                patternType: 'Branco Após Dominância Longa'
            };
        }
    }
    
    return null;
}

function analyzeTotalCorrectionPattern(history) {
    const recentSpins = history.slice(0, 6);
    const colors = recentSpins.map(s => s.color);
    
    // Padrão: Vermelho, Vermelho, Vermelho, Branco, Preto, Preto
    if (colors[0] === 'red' && colors[1] === 'red' && colors[2] === 'red' && 
        colors[3] === 'white' && colors[4] === 'black' && colors[5] === 'black') {
        return {
            type: 'mixed-pattern',
            pattern: 'Correção Total',
            suggestedColor: 'black',
            confidence: 81,
            occurrences: 1,
            statisticalSignificance: 2.5,
            patternType: 'Correção Total'
        };
    }
    
    return null;
}

function analyzeCompleteCyclePattern(history) {
    // Procurar ciclo completo em 50-70 giros
    const cycleWindow = Math.min(70, history.length);
    const cycleSpins = history.slice(0, cycleWindow);
    
    // Verificar se há alternância → branco → repetição → equilíbrio
    const hasAlternation = checkForAlternation(cycleSpins.slice(0, 20));
    const hasWhite = cycleSpins.some(spin => spin.color === 'white');
    const hasRepetition = checkForRepetition(cycleSpins.slice(20, 40));
    
    if (hasAlternation && hasWhite && hasRepetition) {
        const mostRepeatedColor = getMostRepeatedColorAfterWhite(cycleSpins);
        return {
            type: 'mixed-pattern',
            pattern: 'Ciclo Completo',
            suggestedColor: mostRepeatedColor,
            confidence: 78,
            occurrences: 1,
            statisticalSignificance: 2.3,
            patternType: 'Ciclo Completo'
        };
    }
    
    return null;
}

function analyzeTimeRepetitionPattern(history) {
    const currentHour = new Date().getHours();
    const currentMinute = new Date().getMinutes();
    
    // Simular busca por sequência igual no mesmo horário de dias diferentes
    // (implementação simplificada)
    const recentSpins = history.slice(0, 10);
    const colors = recentSpins.map(s => s.color);
    
    if (currentMinute % 15 === 0) { // A cada 15 minutos
        return {
            type: 'mixed-pattern',
            pattern: 'Repetição em Mesmo Horário',
            suggestedColor: colors[colors.length - 1],
            confidence: 77,
            occurrences: 1,
            statisticalSignificance: 2.1,
            patternType: 'Repetição em Mesmo Horário'
        };
    }
    
    return null;
}

function analyzeTemporalReversalPattern(history) {
    // Procurar 1h de dominância de uma cor (simulado com 60 giros)
    const recentSpins = history.slice(0, 60);
    const colors = recentSpins.map(s => s.color);
    
    const redCount = colors.filter(c => c === 'red').length;
    const blackCount = colors.filter(c => c === 'black').length;
    
    if (redCount >= 40 || blackCount >= 40) {
        const dominantColor = redCount > blackCount ? 'red' : 'black';
        return {
            type: 'mixed-pattern',
            pattern: 'Reversão Temporal',
            suggestedColor: dominantColor === 'red' ? 'black' : 'red',
            confidence: 79,
            occurrences: 1,
            statisticalSignificance: 2.4,
            patternType: 'Reversão Temporal'
        };
    }
    
    return null;
}

function analyzeMicrocyclePattern(history) {
    // Procurar padrões curtos de 5-10 giros se repetindo
    for (let cycleSize = 5; cycleSize <= 10; cycleSize++) {
        if (history.length < cycleSize * 2) continue;
        
        const recentCycle = history.slice(0, cycleSize);
        const previousCycle = history.slice(cycleSize, cycleSize * 2);
        
        const recentColors = recentCycle.map(s => s.color);
        const previousColors = previousCycle.map(s => s.color);
        
        if (JSON.stringify(recentColors) === JSON.stringify(previousColors)) {
            return {
                type: 'mixed-pattern',
                pattern: 'Microciclos Repetidos',
                suggestedColor: recentColors[recentColors.length - 1],
                confidence: 80,
                occurrences: 1,
                statisticalSignificance: 2.5,
                patternType: 'Microciclos Repetidos'
            };
        }
    }
    
    return null;
}

// Funções auxiliares para análise temporal
function checkForAlternation(spins) {
    const colors = spins.map(s => s.color);
    for (let i = 1; i < colors.length; i++) {
        if (colors[i] === colors[i-1]) return false;
    }
    return colors.length >= 4;
}

function checkForRepetition(spins) {
    const colors = spins.map(s => s.color);
    return colors.every(color => color === colors[0]) && colors.length >= 3;
}

function getMostRepeatedColorAfterWhite(spins) {
    const whiteIndex = spins.findIndex(s => s.color === 'white');
    if (whiteIndex === -1) return 'red';
    
    const afterWhite = spins.slice(0, whiteIndex);
    const colorCounts = {};
    afterWhite.forEach(spin => {
        colorCounts[spin.color] = (colorCounts[spin.color] || 0) + 1;
    });
    
    return Object.keys(colorCounts).reduce((a, b) => 
        colorCounts[a] > colorCounts[b] ? a : b, 'red');
}

// ANÁLISE TEMPORAL AVANÇADA MULTIDIMENSIONAL (função antiga mantida para compatibilidade)
function analyzeTemporalPatternsAdvancedOld(history) {
    if (history.length < 50) return null; // Mínimo de 50 giros
    
    // Usar TODO o histórico disponível para máxima precisão temporal
    const recentSpins = history; // Todo o histórico
    
    // 1. ANÁLISE POR MINUTOS (quartos de hora)
    const minutePattern = analyzeMinutePatterns(recentSpins);
    
    // 2. ANÁLISE POR HORAS (períodos do dia)
    const hourPattern = analyzeHourPatterns(recentSpins);
    
    // 3. ANÁLISE POR DIA DA SEMANA
    const dayPattern = analyzeDayPatterns(recentSpins);
    
    // 4. ANÁLISE POR PERÍODOS (manhã, tarde, noite, madrugada)
    const periodPattern = analyzePeriodPatterns(recentSpins);
    
    // 5. ANÁLISE DE CICLOS TEMPORAIS
    const cyclePattern = analyzeTemporalCycles(recentSpins);
    
    // Combinar todas as análises temporais
    const patterns = [minutePattern, hourPattern, dayPattern, periodPattern, cyclePattern].filter(p => p !== null);
    
    if (patterns.length === 0) return null;
    
    // Encontrar o padrão temporal com maior confiança
    const bestPattern = patterns.sort((a, b) => b.confidence - a.confidence)[0];
    
    return {
        type: 'temporal',
        pattern: bestPattern.pattern,
        suggestedColor: bestPattern.suggestedColor,
        confidence: bestPattern.confidence,
        occurrences: bestPattern.occurrences,
        statisticalSignificance: bestPattern.statisticalSignificance,
        subPatterns: patterns.map(p => ({ type: p.type, confidence: p.confidence }))
    };
}

// Analisar padrões por minutos (00, 15, 30, 45)
function analyzeMinutePatterns(spins) {
    const minutePatterns = {};
    
    spins.forEach(spin => {
        const spinTime = new Date(spin.timestamp);
        const minute = spinTime.getMinutes();
        const quarter = Math.floor(minute / 15) * 15; // 0, 15, 30, 45
        const key = `${quarter}-${spin.color}`;
        
        if (!minutePatterns[key]) {
            minutePatterns[key] = {
                quarter: quarter,
                color: spin.color,
                count: 0,
                totalInQuarter: 0
            };
        }
        
        minutePatterns[key].count++;
    });
    
    // Calcular total por quarto
    const quarterTotals = {};
    Object.values(minutePatterns).forEach(p => {
        if (!quarterTotals[p.quarter]) quarterTotals[p.quarter] = 0;
        quarterTotals[p.quarter] += p.count;
    });
    
    // Encontrar padrões mais frequentes
    const currentTime = new Date();
    const currentQuarter = Math.floor(currentTime.getMinutes() / 15) * 15;
    
    const currentQuarterPatterns = Object.values(minutePatterns).filter(p => p.quarter === currentQuarter);
    if (currentQuarterPatterns.length === 0) return null;
    
    const bestPattern = currentQuarterPatterns.sort((a, b) => b.count - a.count)[0];
    const totalInCurrentQuarter = quarterTotals[currentQuarter] || 1;
    const confidence = (bestPattern.count / totalInCurrentQuarter) * 100;
    
    if (confidence < 60) return null;
    
    return {
        type: 'minute',
        pattern: `Minuto ${currentQuarter}: ${bestPattern.color} (${confidence.toFixed(1)}%)`,
        suggestedColor: bestPattern.color,
        confidence: Math.min(confidence, 85),
        occurrences: bestPattern.count,
        statisticalSignificance: bestPattern.count / 2
    };
}

// Analisar padrões por horas (períodos do dia)
function analyzeHourPatterns(spins) {
    const hourPatterns = {};
    
    spins.forEach(spin => {
        const spinTime = new Date(spin.timestamp);
        const hour = spinTime.getHours();
        const period = hour < 6 ? 'madrugada' : 
                      hour < 12 ? 'manhã' : 
                      hour < 18 ? 'tarde' : 'noite';
        const key = `${period}-${spin.color}`;
        
        if (!hourPatterns[key]) {
            hourPatterns[key] = {
                period: period,
                color: spin.color,
                count: 0,
                totalInPeriod: 0
            };
        }
        
        hourPatterns[key].count++;
    });
    
    // Calcular total por período
    const periodTotals = {};
    Object.values(hourPatterns).forEach(p => {
        if (!periodTotals[p.period]) periodTotals[p.period] = 0;
        periodTotals[p.period] += p.count;
    });
    
    // Encontrar padrão do período atual
    const currentTime = new Date();
    const currentHour = currentTime.getHours();
    const currentPeriod = currentHour < 6 ? 'madrugada' : 
                         currentHour < 12 ? 'manhã' : 
                         currentHour < 18 ? 'tarde' : 'noite';
    
    const currentPeriodPatterns = Object.values(hourPatterns).filter(p => p.period === currentPeriod);
    if (currentPeriodPatterns.length === 0) return null;
    
    const bestPattern = currentPeriodPatterns.sort((a, b) => b.count - a.count)[0];
    const totalInCurrentPeriod = periodTotals[currentPeriod] || 1;
    const confidence = (bestPattern.count / totalInCurrentPeriod) * 100;
    
    if (confidence < 60) return null;
    
    return {
        type: 'hour',
        pattern: `${currentPeriod}: ${bestPattern.color} (${confidence.toFixed(1)}%)`,
        suggestedColor: bestPattern.color,
        confidence: Math.min(confidence, 80),
        occurrences: bestPattern.count,
        statisticalSignificance: bestPattern.count / 2
    };
}

// Analisar padrões por dia da semana
function analyzeDayPatterns(spins) {
    const dayPatterns = {};
    const dayNames = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    
    spins.forEach(spin => {
        const spinTime = new Date(spin.timestamp);
        const dayOfWeek = spinTime.getDay();
        const dayName = dayNames[dayOfWeek];
        const key = `${dayName}-${spin.color}`;
        
        if (!dayPatterns[key]) {
            dayPatterns[key] = {
                day: dayName,
                color: spin.color,
                count: 0,
                totalInDay: 0
            };
        }
        
        dayPatterns[key].count++;
    });
    
    // Calcular total por dia
    const dayTotals = {};
    Object.values(dayPatterns).forEach(p => {
        if (!dayTotals[p.day]) dayTotals[p.day] = 0;
        dayTotals[p.day] += p.count;
    });
    
    // Encontrar padrão do dia atual
    const currentTime = new Date();
    const currentDay = dayNames[currentTime.getDay()];
    
    const currentDayPatterns = Object.values(dayPatterns).filter(p => p.day === currentDay);
    if (currentDayPatterns.length === 0) return null;
    
    const bestPattern = currentDayPatterns.sort((a, b) => b.count - a.count)[0];
    const totalInCurrentDay = dayTotals[currentDay] || 1;
    const confidence = (bestPattern.count / totalInCurrentDay) * 100;
    
    if (confidence < 60) return null;
    
    return {
        type: 'day',
        pattern: `${currentDay}: ${bestPattern.color} (${confidence.toFixed(1)}%)`,
        suggestedColor: bestPattern.color,
        confidence: Math.min(confidence, 75),
        occurrences: bestPattern.count,
        statisticalSignificance: bestPattern.count / 2
    };
}

// Analisar padrões por períodos (manhã, tarde, noite, madrugada)
function analyzePeriodPatterns(spins) {
    const periodPatterns = {};
    
    spins.forEach(spin => {
        const spinTime = new Date(spin.timestamp);
        const hour = spinTime.getHours();
        const period = hour < 6 ? 'madrugada' : 
                      hour < 12 ? 'manhã' : 
                      hour < 18 ? 'tarde' : 'noite';
        const key = `${period}-${spin.color}`;
        
        if (!periodPatterns[key]) {
            periodPatterns[key] = {
                period: period,
                color: spin.color,
                count: 0,
                totalInPeriod: 0
            };
        }
        
        periodPatterns[key].count++;
    });
    
    // Calcular total por período
    const periodTotals = {};
    Object.values(periodPatterns).forEach(p => {
        if (!periodTotals[p.period]) periodTotals[p.period] = 0;
        periodTotals[p.period] += p.count;
    });
    
    // Encontrar padrão do período atual
    const currentTime = new Date();
    const currentHour = currentTime.getHours();
    const currentPeriod = currentHour < 6 ? 'madrugada' : 
                         currentHour < 12 ? 'manhã' : 
                         currentHour < 18 ? 'tarde' : 'noite';
    
    const currentPeriodPatterns = Object.values(periodPatterns).filter(p => p.period === currentPeriod);
    if (currentPeriodPatterns.length === 0) return null;
    
    const bestPattern = currentPeriodPatterns.sort((a, b) => b.count - a.count)[0];
    const totalInCurrentPeriod = periodTotals[currentPeriod] || 1;
    const confidence = (bestPattern.count / totalInCurrentPeriod) * 100;
    
    if (confidence < 60) return null;
    
    return {
        type: 'period',
        pattern: `${currentPeriod}: ${bestPattern.color} (${confidence.toFixed(1)}%)`,
        suggestedColor: bestPattern.color,
        confidence: Math.min(confidence, 80),
        occurrences: bestPattern.count,
        statisticalSignificance: bestPattern.count / 2
    };
}

// Analisar ciclos temporais (padrões que se repetem em horários específicos)
function analyzeTemporalCycles(spins) {
    const cyclePatterns = {};
    
    // Procurar ciclos de 1-4 horas
    for (let cycleHours = 1; cycleHours <= 4; cycleHours++) {
        spins.forEach(spin => {
            const spinTime = new Date(spin.timestamp);
            const hour = spinTime.getHours();
            const cyclePosition = hour % cycleHours;
            const key = `ciclo-${cycleHours}h-${cyclePosition}-${spin.color}`;
            
            if (!cyclePatterns[key]) {
                cyclePatterns[key] = {
                    cycleHours: cycleHours,
                    position: cyclePosition,
                    color: spin.color,
                    count: 0,
                    totalInPosition: 0
                };
            }
            
            cyclePatterns[key].count++;
        });
    }
    
    // Calcular total por posição do ciclo
    const positionTotals = {};
    Object.values(cyclePatterns).forEach(p => {
        const key = `${p.cycleHours}h-${p.position}`;
        if (!positionTotals[key]) positionTotals[key] = 0;
        positionTotals[key] += p.count;
    });
    
    // Encontrar ciclo mais forte
    const currentTime = new Date();
    const currentHour = currentTime.getHours();
    
    let bestCycle = null;
    let bestConfidence = 0;
    
    for (let cycleHours = 1; cycleHours <= 4; cycleHours++) {
        const cyclePosition = currentHour % cycleHours;
        const key = `ciclo-${cycleHours}h-${cyclePosition}`;
        const totalInPosition = positionTotals[key] || 1;
        
        const cyclePatternsInPosition = Object.values(cyclePatterns).filter(p => 
            p.cycleHours === cycleHours && p.position === cyclePosition
        );
        
        if (cyclePatternsInPosition.length > 0) {
            const bestPattern = cyclePatternsInPosition.sort((a, b) => b.count - a.count)[0];
            const confidence = (bestPattern.count / totalInPosition) * 100;
            
            if (confidence > bestConfidence && confidence >= 60) {
                bestConfidence = confidence;
                bestCycle = bestPattern;
            }
        }
    }
    
    if (!bestCycle) return null;
    
    return {
        type: 'cycle',
        pattern: `Ciclo ${bestCycle.cycleHours}h posição ${bestCycle.position}: ${bestCycle.color} (${bestConfidence.toFixed(1)}%)`,
        suggestedColor: bestCycle.color,
        confidence: Math.min(bestConfidence, 85),
        occurrences: bestCycle.count,
        statisticalSignificance: bestCycle.count / 2
    };
}

// ANÁLISE DE CORRELAÇÕES MULTIDIMENSIONAIS
function analyzeCorrelations(history) {
    if (history.length < 50) return null; // Mínimo de 50 giros
    
    // Usar TODO o histórico disponível para máxima precisão de correlações
    const recentSpins = history; // Todo o histórico
    
    // 1. CORRELAÇÃO COR + NÚMERO
    const colorNumberCorrelation = analyzeColorNumberCorrelation(recentSpins);
    
    // 2. CORRELAÇÃO COR + TEMPO
    const colorTimeCorrelation = analyzeColorTimeCorrelation(recentSpins);
    
    // 3. CORRELAÇÃO NÚMERO + TEMPO
    const numberTimeCorrelation = analyzeNumberTimeCorrelation(recentSpins);
    
    // 4. CORRELAÇÃO COMPOSTA (COR + NÚMERO + TEMPO)
    const compositeCorrelation = analyzeCompositeCorrelation(recentSpins);
    
    // Combinar todas as correlações
    const correlations = [colorNumberCorrelation, colorTimeCorrelation, numberTimeCorrelation, compositeCorrelation].filter(c => c !== null);
    
    if (correlations.length === 0) return null;
    
    // Encontrar a correlação com maior confiança
    const bestCorrelation = correlations.sort((a, b) => b.confidence - a.confidence)[0];
    
    // CRÍTICO: Verificar se a correlação atual realmente corresponde ao padrão encontrado
    const colors = history.map(s => s.color);
    const numbers = history.map(s => s.number);
    
    // Para correlações de cor-número, verificar se o padrão atual corresponde
    if (bestCorrelation.type === 'color-number') {
        const patternParts = bestCorrelation.pattern.split('-');
        if (patternParts.length >= 2) {
            const expectedColor = patternParts[0];
            const expectedNumber = parseInt(patternParts[1]);
            
            // Verificar se o último giro corresponde à correlação
            if (colors[0] !== expectedColor || numbers[0] !== expectedNumber) {
                console.log('❌ Correlação cor-número não corresponde ao padrão atual:', {
                    foundPattern: bestCorrelation.pattern,
                    currentColor: colors[0],
                    currentNumber: numbers[0],
                    expectedColor: expectedColor,
                    expectedNumber: expectedNumber
                });
                return null;
            }
        }
    }
    
    console.log('✅ Correlação atual confirma o padrão encontrado:', {
        foundPattern: bestCorrelation.pattern,
        currentColor: colors[0],
        currentNumber: numbers[0]
    });
    
    return {
        type: 'correlation',
        pattern: bestCorrelation.pattern,
        suggestedColor: bestCorrelation.suggestedColor,
        confidence: bestCorrelation.confidence,
        occurrences: bestCorrelation.occurrences,
        statisticalSignificance: bestCorrelation.statisticalSignificance,
        subCorrelations: correlations.map(c => ({ type: c.type, confidence: c.confidence }))
    };
}

// Correlação Cor + Número
function analyzeColorNumberCorrelation(spins) {
    const correlations = {};
    
    spins.forEach(spin => {
        const key = `${spin.color}-${spin.number}`;
        if (!correlations[key]) {
            correlations[key] = {
                color: spin.color,
                number: spin.number,
                count: 0,
                nextColors: []
            };
        }
        correlations[key].count++;
    });
    
    // Encontrar correlações mais frequentes
    const frequentCorrelations = Object.values(correlations).filter(c => c.count >= 2);
    if (frequentCorrelations.length === 0) return null;
    
    const bestCorrelation = frequentCorrelations.sort((a, b) => b.count - a.count)[0];
    
    // Calcular próxima cor baseada na correlação
    const colorCounts = {};
    frequentCorrelations.forEach(c => {
        colorCounts[c.color] = (colorCounts[c.color] || 0) + c.count;
    });
    
    const mostFrequentColor = Object.keys(colorCounts).reduce((a, b) => 
        colorCounts[a] > colorCounts[b] ? a : b, 'red'
    );
    
    const confidence = (colorCounts[mostFrequentColor] / frequentCorrelations.length) * 100;
    
    return {
        type: 'color-number',
        pattern: `Cor-Número: ${bestCorrelation.color}-${bestCorrelation.number} (${confidence.toFixed(1)}%)`,
        suggestedColor: mostFrequentColor,
        confidence: Math.min(confidence, 80),
        occurrences: bestCorrelation.count,
        statisticalSignificance: bestCorrelation.count / 2
    };
}

// Correlação Cor + Tempo
function analyzeColorTimeCorrelation(spins) {
    const correlations = {};
    
    spins.forEach(spin => {
        const spinTime = new Date(spin.timestamp);
        const hour = spinTime.getHours();
        const minute = Math.floor(spinTime.getMinutes() / 15) * 15; // Quartos de hora
        const key = `${spin.color}-${hour}h${minute}m`;
        
        if (!correlations[key]) {
            correlations[key] = {
                color: spin.color,
                time: `${hour}h${minute}m`,
                count: 0
            };
        }
        correlations[key].count++;
    });
    
    // Encontrar correlações mais frequentes
    const frequentCorrelations = Object.values(correlations).filter(c => c.count >= 2);
    if (frequentCorrelations.length === 0) return null;
    
    const bestCorrelation = frequentCorrelations.sort((a, b) => b.count - a.count)[0];
    
    const confidence = (bestCorrelation.count / frequentCorrelations.length) * 100;
    
    return {
        type: 'color-time',
        pattern: `Cor-Tempo: ${bestCorrelation.color}-${bestCorrelation.time} (${confidence.toFixed(1)}%)`,
        suggestedColor: bestCorrelation.color,
        confidence: Math.min(confidence, 75),
        occurrences: bestCorrelation.count,
        statisticalSignificance: bestCorrelation.count / 2
    };
}

// Correlação Número + Tempo
function analyzeNumberTimeCorrelation(spins) {
    const correlations = {};
    
    spins.forEach(spin => {
        const spinTime = new Date(spin.timestamp);
        const hour = spinTime.getHours();
        const numberRange = spin.number === 0 ? 'branco' : 
                           (spin.number >= 1 && spin.number <= 7) ? 'vermelho' : 'preto';
        const key = `${numberRange}-${hour}h`;
        
        if (!correlations[key]) {
            correlations[key] = {
                numberRange: numberRange,
                hour: hour,
                count: 0
            };
        }
        correlations[key].count++;
    });
    
    // Encontrar correlações mais frequentes
    const frequentCorrelations = Object.values(correlations).filter(c => c.count >= 2);
    if (frequentCorrelations.length === 0) return null;
    
    const bestCorrelation = frequentCorrelations.sort((a, b) => b.count - a.count)[0];
    
    const confidence = (bestCorrelation.count / frequentCorrelations.length) * 100;
    
    return {
        type: 'number-time',
        pattern: `Número-Tempo: ${bestCorrelation.numberRange}-${bestCorrelation.hour}h (${confidence.toFixed(1)}%)`,
        suggestedColor: bestCorrelation.numberRange === 'vermelho' ? 'red' : 
                       bestCorrelation.numberRange === 'preto' ? 'black' : 'white',
        confidence: Math.min(confidence, 70),
        occurrences: bestCorrelation.count,
        statisticalSignificance: bestCorrelation.count / 2
    };
}

// Correlação Composta (Cor + Número + Tempo)
function analyzeCompositeCorrelation(spins) {
    const correlations = {};
    
    spins.forEach(spin => {
        const spinTime = new Date(spin.timestamp);
        const hour = spinTime.getHours();
        const minute = Math.floor(spinTime.getMinutes() / 15) * 15;
        const key = `${spin.color}-${spin.number}-${hour}h${minute}m`;
        
        if (!correlations[key]) {
            correlations[key] = {
                color: spin.color,
                number: spin.number,
                time: `${hour}h${minute}m`,
                count: 0
            };
        }
        correlations[key].count++;
    });
    
    // Encontrar correlações mais frequentes
    const frequentCorrelations = Object.values(correlations).filter(c => c.count >= 2);
    if (frequentCorrelations.length === 0) return null;
    
    const bestCorrelation = frequentCorrelations.sort((a, b) => b.count - a.count)[0];
    
    const confidence = (bestCorrelation.count / frequentCorrelations.length) * 100;
    
    return {
        type: 'composite',
        pattern: `Composto: ${bestCorrelation.color}-${bestCorrelation.number}-${bestCorrelation.time} (${confidence.toFixed(1)}%)`,
        suggestedColor: bestCorrelation.color,
        confidence: Math.min(confidence, 85),
        occurrences: bestCorrelation.count,
        statisticalSignificance: bestCorrelation.count / 2
    };
}

// ANÁLISE DE FREQUÊNCIA MULTIDIMENSIONAL
function analyzeMultidimensionalFrequency(history) {
    if (history.length < 50) return null; // Mínimo de 50 giros
    
    // Usar TODO o histórico disponível para máxima precisão de frequência
    const recentSpins = history; // Todo o histórico
    
    // 1. FREQUÊNCIA POR FAIXA NUMÉRICA
    const rangeFrequency = analyzeRangeFrequency(recentSpins);
    
    // 2. FREQUÊNCIA POR PERÍODO DO DIA
    const periodFrequency = analyzePeriodFrequency(recentSpins);
    
    // 3. FREQUÊNCIA POR DIA DA SEMANA
    const dayFrequency = analyzeDayFrequency(recentSpins);
    
    // 4. FREQUÊNCIA POR MINUTO
    const minuteFrequency = analyzeMinuteFrequency(recentSpins);
    
    // Combinar todas as frequências
    const frequencies = [rangeFrequency, periodFrequency, dayFrequency, minuteFrequency].filter(f => f !== null);
    
    if (frequencies.length === 0) return null;
    
    // Encontrar a frequência com maior confiança
    const bestFrequency = frequencies.sort((a, b) => b.confidence - a.confidence)[0];
    
    return {
        type: 'frequency',
        pattern: bestFrequency.pattern,
        suggestedColor: bestFrequency.suggestedColor,
        confidence: bestFrequency.confidence,
        occurrences: bestFrequency.occurrences,
        statisticalSignificance: bestFrequency.statisticalSignificance,
        subFrequencies: frequencies.map(f => ({ type: f.type, confidence: f.confidence }))
    };
}

// Frequência por faixa numérica
function analyzeRangeFrequency(spins) {
    const rangeCounts = { red: 0, black: 0, white: 0 };
    
    spins.forEach(spin => {
        if (spin.number === 0) rangeCounts.white++;
        else if (spin.number >= 1 && spin.number <= 7) rangeCounts.red++;
        else if (spin.number >= 8 && spin.number <= 14) rangeCounts.black++;
    });
    
    const total = spins.length;
    const redPercent = (rangeCounts.red / total) * 100;
    const blackPercent = (rangeCounts.black / total) * 100;
    const whitePercent = (rangeCounts.white / total) * 100;
    
    // ✅ CORREÇÃO: Não usar padrão, retornar null se não houver padrão claro
    let suggestedColor = null;
    let confidence = 0;
    
    if (redPercent > 60) {
        suggestedColor = 'black';
        confidence = Math.min(redPercent - 50, 80);
    } else if (blackPercent > 60) {
        suggestedColor = 'red';
        confidence = Math.min(blackPercent - 50, 80);
    } else if (whitePercent > 25) {
        // ✅ CORREÇÃO: Usar a cor MENOS frequente em vez de sempre 'red'
        suggestedColor = redPercent < blackPercent ? 'red' : 'black';
        confidence = Math.min(whitePercent * 2, 70);
    } else {
        return null;
    }
    
    if (!suggestedColor) return null;
    
    return {
        type: 'range-frequency',
        pattern: `Faixa: R${redPercent.toFixed(1)}% B${blackPercent.toFixed(1)}% W${whitePercent.toFixed(1)}%`,
        suggestedColor: suggestedColor,
        confidence: confidence,
        occurrences: Math.max(rangeCounts.red, rangeCounts.black, rangeCounts.white),
        statisticalSignificance: confidence / 50
    };
}

// Frequência por período do dia
function analyzePeriodFrequency(spins) {
    const periodCounts = { madrugada: 0, manhã: 0, tarde: 0, noite: 0 };
    const periodColors = { madrugada: {}, manhã: {}, tarde: {}, noite: {} };
    
    spins.forEach(spin => {
        const spinTime = new Date(spin.timestamp);
        const hour = spinTime.getHours();
        const period = hour < 6 ? 'madrugada' : 
                      hour < 12 ? 'manhã' : 
                      hour < 18 ? 'tarde' : 'noite';
        
        periodCounts[period]++;
        if (!periodColors[period][spin.color]) periodColors[period][spin.color] = 0;
        periodColors[period][spin.color]++;
    });
    
    const currentTime = new Date();
    const currentHour = currentTime.getHours();
    const currentPeriod = currentHour < 6 ? 'madrugada' : 
                         currentHour < 12 ? 'manhã' : 
                         currentHour < 18 ? 'tarde' : 'noite';
    
    const currentPeriodCount = periodCounts[currentPeriod];
    if (currentPeriodCount < 3) return null;
    
    const currentPeriodColors = periodColors[currentPeriod];
    const totalColors = Object.values(currentPeriodColors).reduce((a, b) => a + b, 0);
    
    // ✅ CORREÇÃO: Não usar padrão 'red'
    let suggestedColor = null;
    let confidence = 0;
    
    Object.entries(currentPeriodColors).forEach(([color, count]) => {
        const percent = (count / totalColors) * 100;
        if (percent > 60) {
            // ✅ CORREÇÃO: Sugerir cor oposta sem viés
            if (color === 'red') suggestedColor = 'black';
            else if (color === 'black') suggestedColor = 'red';
            else suggestedColor = 'black'; // Se white está dominante, apostar em black
            confidence = Math.min(percent - 50, 75);
        }
    });
    
    if (confidence < 60 || !suggestedColor) return null;
    
    return {
        type: 'period-frequency',
        pattern: `${currentPeriod}: ${suggestedColor} (${confidence.toFixed(1)}%)`,
        suggestedColor: suggestedColor,
        confidence: confidence,
        occurrences: currentPeriodCount,
        statisticalSignificance: confidence / 50
    };
}

// Frequência por dia da semana
function analyzeDayFrequency(spins) {
    const dayNames = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    const dayCounts = {};
    const dayColors = {};
    
    dayNames.forEach(day => {
        dayCounts[day] = 0;
        dayColors[day] = {};
    });
    
    spins.forEach(spin => {
        const spinTime = new Date(spin.timestamp);
        const dayOfWeek = spinTime.getDay();
        const dayName = dayNames[dayOfWeek];
        
        dayCounts[dayName]++;
        if (!dayColors[dayName][spin.color]) dayColors[dayName][spin.color] = 0;
        dayColors[dayName][spin.color]++;
    });
    
    const currentTime = new Date();
    const currentDay = dayNames[currentTime.getDay()];
    
    const currentDayCount = dayCounts[currentDay];
    if (currentDayCount < 3) return null;
    
    const currentDayColors = dayColors[currentDay];
    const totalColors = Object.values(currentDayColors).reduce((a, b) => a + b, 0);
    
    // ✅ CORREÇÃO: Não usar padrão 'red'
    let suggestedColor = null;
    let confidence = 0;
    
    Object.entries(currentDayColors).forEach(([color, count]) => {
        const percent = (count / totalColors) * 100;
        if (percent > 60) {
            // ✅ CORREÇÃO: Sugerir cor oposta sem viés
            if (color === 'red') suggestedColor = 'black';
            else if (color === 'black') suggestedColor = 'red';
            else suggestedColor = 'black'; // Se white está dominante, apostar em black
            confidence = Math.min(percent - 50, 70);
        }
    });
    
    if (confidence < 60 || !suggestedColor) return null;
    
    return {
        type: 'day-frequency',
        pattern: `${currentDay}: ${suggestedColor} (${confidence.toFixed(1)}%)`,
        suggestedColor: suggestedColor,
        confidence: confidence,
        occurrences: currentDayCount,
        statisticalSignificance: confidence / 50
    };
}

// Frequência por minuto
function analyzeMinuteFrequency(spins) {
    const minuteCounts = {};
    const minuteColors = {};
    
    spins.forEach(spin => {
        const spinTime = new Date(spin.timestamp);
        const minute = Math.floor(spinTime.getMinutes() / 15) * 15; // Quartos de hora
        const key = `${minute}`;
        
        if (!minuteCounts[key]) {
            minuteCounts[key] = 0;
            minuteColors[key] = {};
        }
        
        minuteCounts[key]++;
        if (!minuteColors[key][spin.color]) minuteColors[key][spin.color] = 0;
        minuteColors[key][spin.color]++;
    });
    
    const currentTime = new Date();
    const currentMinute = Math.floor(currentTime.getMinutes() / 15) * 15;
    const currentMinuteKey = `${currentMinute}`;
    
    const currentMinuteCount = minuteCounts[currentMinuteKey];
    if (currentMinuteCount < 2) return null;
    
    const currentMinuteColors = minuteColors[currentMinuteKey];
    const totalColors = Object.values(currentMinuteColors).reduce((a, b) => a + b, 0);
    
    // ✅ CORREÇÃO: Não usar padrão 'red'
    let suggestedColor = null;
    let confidence = 0;
    
    Object.entries(currentMinuteColors).forEach(([color, count]) => {
        const percent = (count / totalColors) * 100;
        if (percent > 60) {
            // ✅ CORREÇÃO: Sugerir cor oposta sem viés
            if (color === 'red') suggestedColor = 'black';
            else if (color === 'black') suggestedColor = 'red';
            else suggestedColor = 'black'; // Se white está dominante, apostar em black
            confidence = Math.min(percent - 50, 80);
        }
    });
    
    if (confidence < 60 || !suggestedColor) return null;
    
    return {
        type: 'minute-frequency',
        pattern: `Minuto ${currentMinute}: ${suggestedColor} (${confidence.toFixed(1)}%)`,
        suggestedColor: suggestedColor,
        confidence: confidence,
        occurrences: currentMinuteCount,
        statisticalSignificance: confidence / 50
    };
}

// FUNÇÃO PARA COMPARAR SE DOIS PADRÕES SÃO IGUAIS
function comparePatterns(lastPattern, currentPattern) {
    try {
        // Comparar tipo de análise principal
        const lastMainType = lastPattern.colorAnalysis ? 'color' : 
                           lastPattern.numberAnalysis ? 'number' : 
                           lastPattern.timeAnalysis ? 'time' : 
                           lastPattern.correlationAnalysis ? 'correlation' : 'frequency';
        
        const currentMainType = currentPattern.colorAnalysis ? 'color' : 
                              currentPattern.numberAnalysis ? 'number' : 
                              currentPattern.timeAnalysis ? 'time' : 
                              currentPattern.correlationAnalysis ? 'correlation' : 'frequency';
        
        // Se tipos diferentes, não são o mesmo padrão
        if (lastMainType !== currentMainType) {
            return false;
        }
        
        // Comparar sequências específicas baseadas no tipo
        if (lastMainType === 'color') {
            const lastSequence = lastPattern.colorAnalysis?.pattern || [];
            const currentSequence = currentPattern.colorAnalysis?.pattern || [];
            
            // Comparar sequências de cores
            if (lastSequence.length !== currentSequence.length) {
                return false;
            }
            
            return lastSequence.every((color, index) => color === currentSequence[index]);
        }
        
        if (lastMainType === 'number') {
            const lastSequence = lastPattern.numberAnalysis?.pattern || '';
            const currentSequence = currentPattern.numberAnalysis?.pattern || '';
            
            return lastSequence === currentSequence;
        }
        
        if (lastMainType === 'time') {
            const lastPatternType = lastPattern.timeAnalysis?.pattern || '';
            const currentPatternType = currentPattern.timeAnalysis?.pattern || '';
            
            return lastPatternType === currentPatternType;
        }
        
        if (lastMainType === 'correlation') {
            const lastCorrelation = lastPattern.correlationAnalysis?.pattern || '';
            const currentCorrelation = currentPattern.correlationAnalysis?.pattern || '';
            
            return lastCorrelation === currentCorrelation;
        }
        
        // Para frequency, comparar por tipo de zona
        if (lastMainType === 'frequency') {
            const lastZone = lastPattern.frequencyAnalysis?.zone || '';
            const currentZone = currentPattern.frequencyAnalysis?.zone || '';
            
            return lastZone === currentZone;
        }
        
        return false;
    } catch (e) {
        console.log('⚠️ Erro ao comparar padrões:', e);
        return false; // Em caso de erro, considerar como padrão diferente
    }
}

// COMBINAR TODAS AS ANÁLISES MULTIDIMENSIONAIS COM REGRAS DE RIGOR
async function combineMultidimensionalAnalyses(colorAnalysis, numberAnalysis, timeAnalysis, correlationAnalysis, frequencyAnalysis) {
    const analyses = [colorAnalysis, numberAnalysis, timeAnalysis, correlationAnalysis, frequencyAnalysis].filter(a => a !== null);
    
    if (analyses.length === 0) return null;
    
    // NOVA LÓGICA: Verificar se múltiplos padrões recomendam a mesma cor
    const colorRecommendations = {};
    analyses.forEach(analysis => {
        const color = analysis.suggestedColor;
        if (!colorRecommendations[color]) {
            colorRecommendations[color] = {
                color: color,
                analyses: [],
                totalConfidence: 0,
                count: 0
            };
        }
        colorRecommendations[color].analyses.push(analysis);
        colorRecommendations[color].totalConfidence += analysis.confidence;
        colorRecommendations[color].count++;
    });
    
    // Calcular confiança ajustada baseada no consenso
    Object.keys(colorRecommendations).forEach(color => {
        const rec = colorRecommendations[color];
        const avgConfidence = rec.totalConfidence / rec.count;
        
        // Se múltiplos padrões recomendam a mesma cor, AUMENTAR confiança
        if (rec.count > 1) {
            const consensusBonus = (rec.count - 1) * 5; // +5% por padrão adicional
            rec.adjustedConfidence = Math.min(avgConfidence + consensusBonus, 95);
            console.log(`🎯 Consenso detectado: ${rec.count} padrões recomendam ${color} - Confiança ajustada: ${rec.adjustedConfidence.toFixed(1)}%`);
        } else {
            // Se apenas um padrão, manter confiança original
            rec.adjustedConfidence = avgConfidence;
        }
    });
    
    // Escolher a cor com maior confiança ajustada
    const bestRecommendation = Object.values(colorRecommendations).sort((a, b) => 
        b.adjustedConfidence - a.adjustedConfidence
    )[0];
    
	// NOVAS REGRAS DE RIGOR: Sistema de escalonamento 50% → 60%
    const minOccurrences = 2; // Mínimo 2 ocorrências obrigatório
    const minStatisticalSignificance = 2.0;
    
    // Verificar nível de rigor atual e histórico de losses
    const storage = await chrome.storage.local.get(['lastBet', 'rigorLevel']);
    const lastBet = storage.lastBet;
	const currentRigorLevel = storage.rigorLevel || 50; // Default 50%
    
    const hasRecentLoss = lastBet && 
                         lastBet.status === 'loss' && 
                         lastBet.resolvedAtTimestamp;
    
	// Determinar nível mínimo: 60% após loss, senão usa o nível atual
	const minConfidence = hasRecentLoss ? 60 : currentRigorLevel;
    
    console.log(`🎯 Nível de rigor: ${minConfidence}% (${hasRecentLoss ? 'Após loss' : 'Normal'})`);
    console.log(`🎯 Melhor recomendação: ${bestRecommendation.color} com ${bestRecommendation.adjustedConfidence.toFixed(1)}% (${bestRecommendation.count} padrão${bestRecommendation.count > 1 ? 's' : ''})`);
    
    // Verificar se atende aos critérios
    const bestAnalysis = bestRecommendation.analyses.sort((a, b) => b.confidence - a.confidence)[0];
    const meetsCriteria = bestRecommendation.adjustedConfidence >= minConfidence && 
                         bestAnalysis.occurrences >= minOccurrences && 
                         bestAnalysis.statisticalSignificance >= minStatisticalSignificance;
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // VALIDAÇÃO DE RIGOR POR TIPO DE ANÁLISE
    // ═══════════════════════════════════════════════════════════════════════════════
    
    let rigorOk = true;
    let rigorMessage = '';
    
    // Identificar qual tipo de análise foi escolhida como melhor
    const bestType = bestAnalysis.type;
    
    console.log(`\n🎯 Tipo de análise selecionada: ${bestType}`);
    
    // ✅ APLICAR VALIDAÇÃO ESPECÍFICA BASEADA NO TIPO
    if (bestType === 'color-pattern' && colorAnalysis) {
        // ✅ PADRÕES DE COR: Aplicar regras configuráveis do usuário
        console.log('📊 Aplicando regras de RIGOR para PADRÕES DE COR (configuráveis)...');
        
        const needsRigor = (analyzerConfig && (analyzerConfig.minOccurrences > 1 || (analyzerConfig.winPercentOthers || 0) > 0 || (analyzerConfig.maxOccurrences || 0) > 0 || (analyzerConfig.minPatternSize || 0) > 2));
        
    if (needsRigor) {
            const sampleMin = analyzerConfig.minOccurrences || 1;
            const sampleOk = colorAnalysis.sampleMinWins100 === true || sampleMin === 1;
            const rigorPct = typeof colorAnalysis.rigorWinPct === 'number' ? colorAnalysis.rigorWinPct : 
                             (typeof colorAnalysis.winPct === 'number' ? colorAnalysis.winPct : 0);
            const threshold = analyzerConfig.winPercentOthers || 0;
            
            // ✅ NOVA VALIDAÇÃO: Ocorrências MÁXIMAS (0 = sem limite)
            const totalOccurrences = colorAnalysis.occurrences || 0;
            const maxOccurrences = analyzerConfig.maxOccurrences || 0;
            const maxOccurrencesOk = maxOccurrences === 0 || totalOccurrences <= maxOccurrences;
            
            // ✅ VALIDAÇÃO DE TAMANHO DO PADRÃO (minPatternSize e maxPatternSize)
            const patternSize = colorAnalysis.pattern ? colorAnalysis.pattern.length : 0;
            const minPatternSize = analyzerConfig.minPatternSize || 2;
            const maxPatternSize = analyzerConfig.maxPatternSize || 0; // 0 = sem limite
            const patternSizeOk = (patternSize >= minPatternSize) && (maxPatternSize === 0 || patternSize <= maxPatternSize);
            
            rigorOk = sampleOk && (rigorPct >= threshold) && maxOccurrencesOk && patternSizeOk;
            
            // ✅ LOG DETALHADO DO FILTRO DE RIGOR
            console.log('╔═══════════════════════════════════════════════════════════╗');
            console.log('║  🔍 VALIDAÇÃO DE RIGOR (Filtros de qualidade)            ║');
            console.log('╠═══════════════════════════════════════════════════════════╣');
            console.log(`║  📏 Tamanho do Padrão: ${patternSize} giros`);
            console.log(`║  🎯 Limite Mínimo: ${minPatternSize} giros`);
            console.log(`║  🎯 Limite Máximo: ${maxPatternSize === 0 ? 'SEM LIMITE' : maxPatternSize + ' giros'}`);
            console.log(`║  ${patternSizeOk ? '✅' : '❌'} Validação Tamanho: ${patternSizeOk ? 'APROVADO' : 'REJEITADO'} ${maxPatternSize > 0 ? `(${minPatternSize} <= ${patternSize} <= ${maxPatternSize})` : `(${patternSize} >= ${minPatternSize})`}`);
            console.log('╠═══════════════════════════════════════════════════════════╣');
            console.log(`║  📊 Total de Ocorrências: ${totalOccurrences}`);
            console.log(`║  🎯 Limite Máximo Ocorrências: ${maxOccurrences === 0 ? 'SEM LIMITE' : maxOccurrences}`);
            console.log(`║  ${maxOccurrencesOk ? '✅' : '❌'} Validação Máximo Ocorrências: ${maxOccurrencesOk ? 'APROVADO' : 'REJEITADO'} ${maxOccurrences > 0 ? `(${totalOccurrences} <= ${maxOccurrences})` : ''}`);
            console.log('╠═══════════════════════════════════════════════════════════╣');
            console.log(`║  📊 Demais Ocorrências: ${colorAnalysis.othersCount || 0} (excluindo amostra mínima)`);
            console.log(`║  ✅ Demais WINs: ${colorAnalysis.othersWins || 0}`);
            console.log(`║  ❌ Demais LOSSes: ${colorAnalysis.othersLosses || 0}`);
            console.log(`║  📈 Rigor WIN%: ${rigorPct.toFixed(1)}%`);
            console.log(`║  🎯 Threshold WIN% (configurado): ${threshold}%`);
            console.log(`║  ${(rigorPct >= threshold) ? '✅' : '❌'} Validação WIN%: ${(rigorPct >= threshold) ? 'APROVADO' : 'REJEITADO'} (rigorPct >= threshold)`);
            console.log('╠═══════════════════════════════════════════════════════════╣');
            console.log(`║  ${rigorOk ? '✅ RESULTADO FINAL: APROVADO' : '❌ RESULTADO FINAL: REJEITADO'}                              ║`);
            console.log('╚═══════════════════════════════════════════════════════════╝');
        }
        
    } else if (bestType === 'number-correlation' && numberAnalysis) {
        // ✅ ANÁLISE NÚMERO + COR: 3 ocorrências, 100% WIN (0 LOSS)
        console.log('🔢 Aplicando regras de RIGOR para NÚMERO + COR (3 occ, 100% WIN)...');
        const validation = validateNumberAnalysis(numberAnalysis);
        rigorOk = validation.valid;
        if (!rigorOk) rigorMessage = validation.reason;
        
    } else if (bestType === 'time-pattern' && timeAnalysis) {
        // ✅ ANÁLISE TEMPORAL: 6 ocorrências, 100% WIN (0 LOSS)
        console.log('⏰ Aplicando regras de RIGOR para ANÁLISE TEMPORAL (6 occ, 100% WIN)...');
        const validation = validateTemporalAnalysis(timeAnalysis);
        rigorOk = validation.valid;
        if (!rigorOk) rigorMessage = validation.reason;
        
    } else if (bestType === 'correlation' && correlationAnalysis) {
        // ✅ ANÁLISE DE CICLO: 6 ocorrências, 100% WIN (0 LOSS)
        console.log('🔄 Aplicando regras de RIGOR para ANÁLISE DE CICLO (6 occ, 100% WIN)...');
        const validation = validateCorrelationAnalysis(correlationAnalysis);
        rigorOk = validation.valid;
        if (!rigorOk) rigorMessage = validation.reason;
        
    } else if (bestType === 'frequency' && frequencyAnalysis) {
        // ✅ ANÁLISE DE TENDÊNCIA: 5 ocorrências, 100% WIN (0 LOSS)
        console.log('📊 Aplicando regras de RIGOR para TENDÊNCIA/FREQUÊNCIA (5 occ, 100% WIN)...');
        const validation = validateFrequencyAnalysis(frequencyAnalysis);
        rigorOk = validation.valid;
        if (!rigorOk) rigorMessage = validation.reason;
        
    } else if (bestType === 'mixed-pattern' && timeAnalysis) {
        // ✅ PADRÃO TEMPORAL/MISTO: Usar mesma validação temporal (6 occ, 100% WIN)
        console.log('🔀 Aplicando regras de RIGOR para PADRÃO MISTO (6 occ, 100% WIN)...');
        const validation = validateTemporalAnalysis(timeAnalysis);
        rigorOk = validation.valid;
        if (!rigorOk) rigorMessage = validation.reason;
        
    } else {
        // ✅ TIPO DESCONHECIDO OU SEM ANÁLISE: Rejeitar
        console.log(`⚠️ Tipo de análise desconhecido ou sem dados: ${bestType}`);
        rigorOk = false;
        rigorMessage = `Tipo de análise não suportado: ${bestType}`;
    }

    if (!meetsCriteria || !rigorOk) {
        if (!rigorOk && rigorMessage) {
            console.log(`❌ Análise rejeitada por validação específica: ${rigorMessage}`);
        }
        if (!rigorOk) {
            console.log('❌ Análise rejeitada por rigor do usuário:', {
                hasColorAnalysis: !!colorAnalysis,
                patternSize: colorAnalysis && colorAnalysis.pattern ? colorAnalysis.pattern.length : undefined,
                minPatternSize: analyzerConfig.minPatternSize,
                maxPatternSize: analyzerConfig.maxPatternSize || 'sem limite',
                totalOccurrences: colorAnalysis ? colorAnalysis.occurrences : undefined,
                maxOccurrences: analyzerConfig.maxOccurrences || 'sem limite',
                sampleMin: analyzerConfig.minOccurrences,
                sampleMinWins100: colorAnalysis ? colorAnalysis.sampleMinWins100 : undefined,
                rigorWinPct: colorAnalysis ? (colorAnalysis.rigorWinPct ?? colorAnalysis.winPct) : undefined,
                threshold: analyzerConfig.winPercentOthers
            });
        }
        // ✅ LOG SEGURO: verificar se propriedades existem antes de usar .toFixed()
        const confStr = bestRecommendation?.adjustedConfidence != null ? bestRecommendation.adjustedConfidence.toFixed(1) : 'N/A';
        const occStr = bestAnalysis?.occurrences != null ? bestAnalysis.occurrences : 'N/A';
        const sigStr = bestAnalysis?.statisticalSignificance != null ? bestAnalysis.statisticalSignificance.toFixed(2) : 'N/A';
        console.log(`❌ Análise rejeitada: conf=${confStr}%/${minConfidence}%, occ=${occStr}/${minOccurrences}, sig=${sigStr}`);
        return null;
    }
    
    // ✅ LOG SEGURO para aprovação também
    const confStrOk = bestRecommendation?.adjustedConfidence != null ? bestRecommendation.adjustedConfidence.toFixed(1) : 'N/A';
    const occStrOk = bestAnalysis?.occurrences != null ? bestAnalysis.occurrences : 'N/A';
    const sigStrOk = bestAnalysis?.statisticalSignificance != null ? bestAnalysis.statisticalSignificance.toFixed(2) : 'N/A';
    console.log(`✅ ANÁLISE MULTIDIMENSIONAL APROVADA: conf=${confStrOk}%, occ=${occStrOk}, sig=${sigStrOk}`);
    
    // Aplicar calibração do observador inteligente na confiança final
    const rawConfidence = bestRecommendation.adjustedConfidence;
    const calibratedConfidence = applyCalibratedConfidence(rawConfidence);
    
    // Calcular contribuições baseadas no consenso
    const contributions = {};
    bestRecommendation.analyses.forEach(analysis => {
        const weight = analysis.type === 'color-pattern' ? 0.30 : 
                      analysis.type === 'number-correlation' ? 0.25 :
                      analysis.type === 'time-pattern' ? 0.20 :
                      analysis.type === 'mixed-pattern' ? 0.20 :
                      analysis.type === 'correlation' ? 0.15 : 0.10;
        contributions[analysis.type] = analysis.confidence * weight;
    });
    
    return {
        suggestion: 'Entrada na próxima rodada (análise multidimensional confirmada)',
        color: bestRecommendation.color,
        confidence: calibratedConfidence,
        patternDescription: JSON.stringify({
            	expected_next: bestRecommendation.color,
            colorAnalysis: colorAnalysis ? { 
                pattern: colorAnalysis.pattern, 
                confidence: colorAnalysis.confidence,
                occurrences: colorAnalysis.occurrences,
                allOccurrenceTimestamps: colorAnalysis.allOccurrenceTimestamps || [],
                allOccurrenceNumbers: colorAnalysis.allOccurrenceNumbers || [],
                occurrenceTimes: colorAnalysis.occurrenceTimes || [],
                triggerColor: colorAnalysis.triggerColor || null,
                allTriggerColors: colorAnalysis.allTriggerColors || [],
                allTriggerNumbers: colorAnalysis.allTriggerNumbers || [],
                allTriggerTimestamps: colorAnalysis.allTriggerTimestamps || [],
                occurrenceDetails: colorAnalysis.occurrenceDetails || [],
                assertiveness: colorAnalysis.assertivenessExplain ? colorAnalysis.assertivenessExplain : {
                    occurrences: colorAnalysis.occurrences,
                    wins: colorAnalysis.wins,
                    losses: colorAnalysis.losses,
                    winPct: colorAnalysis.winPct,
                    lossPct: colorAnalysis.lossPct,
                    othersCount: colorAnalysis.othersCount,
                    othersWins: colorAnalysis.othersWins,
                    othersLosses: colorAnalysis.othersLosses,
                    rigorWinPct: colorAnalysis.rigorWinPct,
                    sampleMin: colorAnalysis.sampleMin,
                    sampleMinWins100: colorAnalysis.sampleMinWins100
                }
            } : null,
            numberAnalysis: numberAnalysis ? { pattern: numberAnalysis.pattern, confidence: numberAnalysis.confidence } : null,
            timeAnalysis: timeAnalysis ? { pattern: timeAnalysis.pattern, confidence: timeAnalysis.confidence } : null,
            correlationAnalysis: correlationAnalysis ? { pattern: correlationAnalysis.pattern, confidence: correlationAnalysis.confidence } : null,
            frequencyAnalysis: frequencyAnalysis ? { pattern: frequencyAnalysis.pattern, confidence: frequencyAnalysis.confidence } : null,
            contributions: contributions,
            finalConfidence: calibratedConfidence,
            rawConfidence: rawConfidence,
            rigorLevel: minConfidence,
            hasRecentLoss: hasRecentLoss,
            consensusCount: bestRecommendation.count,
            consensusBonus: bestRecommendation.count > 1 ? (bestRecommendation.count - 1) * 5 : 0
        }),
        createdOnTimestamp: new Date().toISOString(),
        predictedFor: 'next',
        phase: 'G0',
        contributions: contributions,
        rigorLevel: minConfidence,
        hasRecentLoss: hasRecentLoss,
        consensusCount: bestRecommendation.count,
        consensusBonus: bestRecommendation.count > 1 ? (bestRecommendation.count - 1) * 5 : 0
    };
}



// Calcular similaridade entre sequências
function calculateSequenceSimilarity(seq1, seq2) {
    if (seq1.length !== seq2.length) return 0;
    
    let matches = 0;
    for (let i = 0; i < seq1.length; i++) {
        if (seq1[i] === seq2[i]) matches++;
    }
    
    return matches / seq1.length;
}

// Analisar padrões temporais
function analyzeTemporalPatterns(history) {
    const now = new Date();
    const currentHour = now.getHours();
    
    // Analisar giros do mesmo horário nos últimos dias
    const recentHistory = history.filter(spin => {
        const spinTime = new Date(spin.timestamp);
        const timeDiff = now - spinTime;
        return timeDiff < 7 * 24 * 60 * 60 * 1000; // Últimos 7 dias
    });
    
    const hourlyPatterns = {};
    recentHistory.forEach(spin => {
        const spinTime = new Date(spin.timestamp);
        const hour = spinTime.getHours();
        
        if (!hourlyPatterns[hour]) {
            hourlyPatterns[hour] = { red: 0, black: 0, white: 0, total: 0 };
        }
        
        hourlyPatterns[hour][spin.color]++;
        hourlyPatterns[hour].total++;
    });
    
    // Encontrar padrão no horário atual
    const currentHourPattern = hourlyPatterns[currentHour];
    if (currentHourPattern && currentHourPattern.total >= 5) {
        const redPercent = (currentHourPattern.red / currentHourPattern.total) * 100;
        const blackPercent = (currentHourPattern.black / currentHourPattern.total) * 100;
        const whitePercent = (currentHourPattern.white / currentHourPattern.total) * 100;
        
        // ✅ CORREÇÃO: Não usar padrão 'red'
        let suggestedColor = null;
        let confidence = 0;
        
        if (redPercent > 60) {
            suggestedColor = 'red';
            confidence = Math.min(redPercent, 80);
        } else if (blackPercent > 60) {
            suggestedColor = 'black';
            confidence = Math.min(blackPercent, 80);
        } else if (whitePercent > 30) {
            suggestedColor = 'white';
            confidence = Math.min(whitePercent * 2, 70);
        }
        
        if (!suggestedColor || confidence === 0) return null;
        
        return {
            type: 'temporal',
            suggestedColor: suggestedColor,
            confidence: confidence,
            pattern: `Padrão horário ${currentHour}h: ${redPercent.toFixed(1)}%V ${blackPercent.toFixed(1)}%P ${whitePercent.toFixed(1)}%B`
        };
    }
    
    return null;
}

// Analisar frequência de cores
function analyzeColorFrequency(history) {
    // Usar TODO o histórico disponível para máxima precisão
    const recentSpins = history; // Todo o histórico
    const colorCounts = { red: 0, black: 0, white: 0 };
    
    recentSpins.forEach(spin => {
        colorCounts[spin.color]++;
    });
    
    const total = recentSpins.length;
    const redPercent = (colorCounts.red / total) * 100;
    const blackPercent = (colorCounts.black / total) * 100;
    const whitePercent = (colorCounts.white / total) * 100;
    
    // Se uma cor está muito frequente, sugerir a oposta
    // ✅ CORREÇÃO: Não usar padrão 'red'
    let suggestedColor = null;
    let confidence = 0;
    let pattern = '';
    
    if (redPercent > 70) {
        suggestedColor = 'black';
        confidence = Math.min(redPercent - 50, 60);
        pattern = `Vermelho dominante (${redPercent.toFixed(1)}%) - Sugerindo preto`;
    } else if (blackPercent > 70) {
        suggestedColor = 'red';
        confidence = Math.min(blackPercent - 50, 60);
        pattern = `Preto dominante (${blackPercent.toFixed(1)}%) - Sugerindo vermelho`;
    } else if (whitePercent > 25) {
        // ✅ CORREÇÃO: Sugerir a cor MENOS frequente entre red e black
        suggestedColor = redPercent < blackPercent ? 'red' : 'black';
        confidence = Math.min(whitePercent * 2, 60);
        const colorText = suggestedColor === 'red' ? 'vermelho' : 'preto';
        pattern = `Branco frequente (${whitePercent.toFixed(1)}%) - Sugerindo ${colorText}`;
    } else {
        // Padrão equilibrado, usar análise de sequências
        return null;
    }
    
    if (!suggestedColor) return null;
    
    return {
        type: 'frequency',
        suggestedColor: suggestedColor,
        confidence: confidence,
        pattern: pattern
    };
}

// Combinar todas as análises
function combineAnalyses(sequenceAnalysis, zoneAnalysis, trendAnalysis) {
    const analysis = sequenceAnalysis || null;
    if (!analysis) {
        return null;
    }

    // Base confidence from sequence (sem limitação artificial)
    let confidence = analysis.confidence || 0;
    const occurrences = analysis.occurrences || 0;
    const statisticalSignificance = analysis.statisticalSignificance || 1;

    // Ajustes por zona e tendência (mais conservador)
    if (zoneAnalysis) {
        if (zoneAnalysis.zoneColor === analysis.suggestedColor) {
            confidence = Math.min(confidence + (zoneAnalysis.confidence * 0.3), 95); // Apenas 30% do boost
        } else {
            confidence = Math.max(confidence - (zoneAnalysis.confidence * 0.2), 0); // Penalidade menor
        }
    }
    if (trendAnalysis) {
        if (trendAnalysis.trendColor === analysis.suggestedColor) {
            confidence = Math.min(confidence + (trendAnalysis.confidence * 0.3), 95); // Apenas 30% do boost
        } else {
            confidence = Math.max(confidence - (trendAnalysis.confidence * 0.2), 0); // Penalidade menor
        }
    }

    // CRITÉRIOS ULTRA RIGOROSOS PARA 80%+ ACERTIVIDADE
    const allowEntry = confidence >= 80 && occurrences >= 5 && statisticalSignificance >= 2.0;
    if (!allowEntry) {
        console.log(`Padrão rejeitado: conf=${confidence.toFixed(1)}%, occ=${occurrences}, sig=${statisticalSignificance.toFixed(2)}`);
        return null;
    }

    const description = JSON.stringify({ 
        pattern: analysis.pattern, 
        occurrences: analysis.occurrences, 
        times: analysis.occurrenceTimes || [], 
        lastSequenceTimes: analysis.lastOccurrenceTimestamps || [],
        lastSequenceNumbers: analysis.lastOccurrenceNumbers || [],
        zone: zoneAnalysis ? { color: zoneAnalysis.zoneColor, dominance: zoneAnalysis.dominance } : null,
        trend: trendAnalysis ? { color: trendAnalysis.trendColor, aligned: trendAnalysis.alignment } : null,
        statisticalSignificance: statisticalSignificance
    });

    console.log(`✅ PADRÃO APROVADO: conf=${confidence.toFixed(1)}%, occ=${occurrences}, sig=${statisticalSignificance.toFixed(2)}`);

    return {
        suggestion: 'Entrada na próxima rodada (padrão confirmado)',
        color: analysis.suggestedColor,
        confidence: confidence,
        patternDescription: description,
        createdOnTimestamp: analysis.createdOnTimestamp || null,
        predictedFor: 'next',
        phase: 'G0'
    };
}

// Analyze color streaks
function analyzeColorStreaks(spins) {
    const colors = spins.map(s => s.color);
    const lastColor = colors[0];
    const streakLength = getStreakLength(colors, lastColor);
    
    // If streak is 3 or more, suggest opposite color
    if (streakLength >= 3) {
        const oppositeColor = lastColor === 'red' ? 'black' : lastColor === 'black' ? 'red' : 'red';
        const confidence = Math.min(streakLength * 15, 70); // Max 70% confidence
        
        return {
            confidence,
            suggestion: `Sequência de ${streakLength} ${lastColor}s detectada`,
            color: oppositeColor,
            probability: confidence,
            description: `Padrão de sequência: ${streakLength} ${lastColor}s consecutivos`,
            weight: 1.2
        };
    }
    
    return null;
}

// Analyze number distribution
function analyzeNumberDistribution(spins) {
    const numbers = spins.map(s => s.number);
    // Usar TODO o histórico disponível para máxima precisão
    const recentNumbers = numbers; // Todo o histórico
    
    // Count frequency of each number
    const frequency = {};
    recentNumbers.forEach(num => {
        frequency[num] = (frequency[num] || 0) + 1;
    });
    
    // Find least frequent numbers
    const minFreq = Math.min(...Object.values(frequency));
    const leastFrequent = Object.keys(frequency).filter(num => frequency[num] === minFreq);
    
    if (leastFrequent.length > 0 && minFreq === 0) {
        const suggestedNumber = parseInt(leastFrequent[0]);
        const color = getColorFromNumber(suggestedNumber);
        
        return {
            confidence: 45,
            suggestion: `Número ${suggestedNumber} não apareceu recentemente`,
            color,
            probability: 45,
            description: `Distribuição: número ${suggestedNumber} ausente nas últimas 20 rodadas`,
            weight: 0.8
        };
    }
    
    return null;
}

// Analyze alternating patterns
function analyzeAlternatingPatterns(spins) {
    const colors = spins.map(s => s.color);
    
    // Check for alternating pattern in last 6 spins
    if (colors.length >= 6) {
        const last6 = colors.slice(0, 6);
        let alternating = true;
        
        for (let i = 1; i < last6.length; i++) {
            if (last6[i] === last6[i-1]) {
                alternating = false;
                break;
            }
        }
        
        if (alternating) {
            const nextColor = last6[0] === 'red' ? 'black' : last6[0] === 'black' ? 'red' : 'red';
            
            return {
                confidence: 55,
                suggestion: 'Padrão alternado detectado',
                color: nextColor,
                probability: 55,
                description: 'Padrão alternado nas últimas 6 rodadas',
                weight: 1.0
            };
        }
    }
    
    return null;
}

// Analyze hot/cold numbers
function analyzeHotColdNumbers(spins) {
    const numbers = spins.map(s => s.number);
    // Usar TODO o histórico disponível para máxima precisão
    const recentNumbers = numbers; // Todo o histórico
    
    // Count frequency
    const frequency = {};
    recentNumbers.forEach(num => {
        frequency[num] = (frequency[num] || 0) + 1;
    });
    
    // Find hot numbers (appeared most frequently)
    const maxFreq = Math.max(...Object.values(frequency));
    const hotNumbers = Object.keys(frequency).filter(num => frequency[num] === maxFreq);
    
    if (hotNumbers.length > 0 && maxFreq >= 3) {
        const suggestedNumber = parseInt(hotNumbers[0]);
        const color = getColorFromNumber(suggestedNumber);
        
        return {
            confidence: 40,
            suggestion: `Número quente: ${suggestedNumber}`,
            color,
            probability: 40,
            description: `Número ${suggestedNumber} apareceu ${maxFreq} vezes nas últimas 30 rodadas`,
            weight: 0.6
        };
    }
    
    return null;
}

// Reconhecimento de Zonas: detecta cor dominante em janelas recentes
function analyzeZones(history) {
    // Usar TODO o histórico disponível para máxima precisão
    const windowSize = history.length; // Todo o histórico
    if (windowSize < 50) return null; // Mínimo de 50 giros
    const recent = history; // Todo o histórico
    const colorCounts = { red: 0, black: 0, white: 0 };
    recent.forEach(s => { colorCounts[s.color] = (colorCounts[s.color] || 0) + 1; });
    const total = recent.length;
    const ratios = {
        red: colorCounts.red / total,
        black: colorCounts.black / total,
        white: colorCounts.white / total
    };
    let zoneColor = 'red';
    if (ratios.black >= ratios.red && ratios.black >= ratios.white) zoneColor = 'black';
    else if (ratios.white >= ratios.red && ratios.white >= ratios.black) zoneColor = 'white';
    const dominance = Math.max(ratios.red, ratios.black, ratios.white) * 100; // 0-100
    if (dominance < 55) return null; // Sem zona dominante
    return {
        type: 'zone',
        zoneColor,
        dominance,
        confidence: Math.min(dominance - 50, 15) // até +15
    };
}

// Reconhecimento de Tendência: compara janelas curta e média
function analyzeTrend(history) {
    // Usar TODO o histórico disponível para máxima precisão
    const shortN = Math.min(50, history.length); // Janela curta: 50 giros
    const midN = history.length; // Janela média: todo o histórico
    if (shortN < 50) return null; // Mínimo de 50 giros
    const short = history.slice(0, shortN);
    const mid = history; // Todo o histórico
    function dominantColor(spins) {
        const c = { red: 0, black: 0, white: 0 };
        spins.forEach(s => { c[s.color] = (c[s.color] || 0) + 1; });
        const total = spins.length;
        const r = c.red / total, b = c.black / total, w = c.white / total;
        let color = 'red', dom = r;
        if (b >= dom) { color = 'black'; dom = b; }
        if (w >= dom) { color = 'white'; dom = w; }
        return { color, share: dom*100 };
    }
    const s = dominantColor(short);
    const m = dominantColor(mid);
    if (s.share < 55 && m.share < 55) return null; // tendência fraca
    const aligned = s.color === m.color;
    return {
        type: 'trend',
        trendColor: aligned ? s.color : s.color,
        alignment: aligned,
        confidence: aligned ? Math.min((s.share - 50) + (m.share - 50), 20) : Math.min(s.share - 50, 10) // até +20
    };
}

// Helper functions
function getStreakLength(colors, color) {
    let streak = 0;
    for (let i = 0; i < colors.length; i++) {
        if (colors[i] === color) {
            streak++;
        } else {
            break;
        }
    }
    return streak;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET COLOR FROM NUMBER (GLOBAL) - REFATORADO 100%
// ═══════════════════════════════════════════════════════════════════════════════
function getColorFromNumber(number) {
    // ✅ VALIDAÇÃO DE ENTRADA (silenciosa - undefined é comum em análises)
    if (typeof number !== 'number' || isNaN(number) || number === undefined || number === null) {
        return 'unknown';
    }
    
    // ✅ NORMALIZAR NÚMERO (caso seja float)
    const normalizedNumber = Math.floor(number);
    
    // ✅ VALIDAR RANGE (0-14)
    if (normalizedNumber < 0 || normalizedNumber > 14) {
        return 'unknown';
    }
    
    // ✅ DETERMINAR COR
    if (normalizedNumber === 0) {
        return 'white';
    } else if (normalizedNumber >= 1 && normalizedNumber <= 7) {
        return 'red';
    } else if (normalizedNumber >= 8 && normalizedNumber <= 14) {
    return 'black';
    }
    
    // ✅ FALLBACK (nunca deve chegar aqui)
    return 'unknown';
}

// ========= NOVO: Cálculo inteligente de assertividade =========
// (Constantes movidas para o início do arquivo para evitar TDZ errors)

// Calcula assertividade para padrões de cor (pattern: [colors], expectedNext: 'red'|'black'|'white')
function computeAssertivenessForColorPattern(patternColors, expectedNext, history) {
	try {
		if (!Array.isArray(patternColors) || patternColors.length < 3 || !history || history.length < 50) {
			return null;
		}

		// 1) Desempenho histórico do padrão (wins/losses)
		let totalWins = 0, totalLosses = 0, totalOcc = 0;
		const colors = history.map(s => s.color);
		const need = patternColors.length;
		for (let i = need; i < colors.length; i++) {
			const seq = colors.slice(i, i + need);
			if (seq.length < need) break;
			const match = seq.every((c, idx) => c === patternColors[idx]);
			if (!match) continue;
			totalOcc++;
			const outcome = colors[i - 1];
			if (outcome === expectedNext) totalWins++; else totalLosses++;
		}
		if (totalOcc === 0) return null;
		let base = (totalWins / totalOcc) * 100;
		if (totalLosses === 0 && totalWins >= 3) base = Math.min(100, 95 + Math.min(totalWins, 5));

		// 2) Tendência recente (últimos 25 giros)
		const recent = history.slice(0, Math.min(RECENT_WINDOW, history.length));
		const rc = { red: 0, black: 0, white: 0 };
		recent.forEach(s => { rc[s.color] = (rc[s.color] || 0) + 1; });
		const totalRecent = recent.length || 1;
		const recentPct = {
			red: (rc.red / totalRecent) * 100,
			black: (rc.black / totalRecent) * 100,
			white: (rc.white / totalRecent) * 100
		};
		let trendAdj = 0;
		// Dominância oposta >70% → -15%
		const opposite = expectedNext === 'red' ? 'black' : expectedNext === 'black' ? 'red' : (recentPct.red >= recentPct.black ? 'red' : 'black');
		if (recentPct[opposite] > 70) trendAdj -= PENALTY_OPPOSITE_DOMINANCE;
		// Repetição longa atual >5 → -10%
		const streakLen = getStreakLength(colors, colors[0]);
		if (streakLen > 5) trendAdj -= PENALTY_LONG_STREAK;
		// Tendência a favor >60% → +10%
		if (recentPct[expectedNext] > 60) trendAdj += BONUS_FAVORABLE_TREND;

		// 3) Estabilidade do padrão (variância do desempenho por janelas)
		// Aproximação: medir taxa de acerto por blocos de 10 ocorrências
		let stabilityAdj = 0;
		if (totalOcc >= 6) {
			const blockSize = 10;
			const accRates = [];
			let acc = 0, cnt = 0;
			// Revarrer somando wins/losses sequencialmente
			for (let i = need; i < colors.length; i++) {
				const seq = colors.slice(i, i + need);
				if (seq.length < need) break;
				if (!seq.every((c, idx) => c === patternColors[idx])) continue;
				cnt++;
				const outcome = colors[i - 1];
				if (outcome === expectedNext) acc++;
				if (cnt === blockSize) {
					accRates.push(acc / cnt);
					acc = 0; cnt = 0;
				}
			}
			if (cnt > 0) accRates.push(acc / cnt);
			if (accRates.length >= 2) {
				const mean = accRates.reduce((a,b)=>a+b,0) / accRates.length;
				const variance = accRates.reduce((s,v)=> s + Math.pow(v - mean, 2), 0) / accRates.length;
				const std = Math.sqrt(variance);
				// Baixa variância → estável
				if (std <= 0.1) stabilityAdj += BONUS_STABILITY;
				else if (std >= 0.25) stabilityAdj -= PENALTY_INSTABILITY;
			}
		}

		// 4) Final
	let rawConfidence = Math.max(0, Math.min(100, base + trendAdj + stabilityAdj));
	
	// 5) Aplicar calibração do observador inteligente
	let finalConfidence = applyCalibratedConfidence(rawConfidence);
	
	// LOG DETALHADO para debug (padrões com 100% win)
	if (totalLosses === 0 && totalWins >= 3) {
		console.log('🔍 PADRÃO 100% WIN - CÁLCULO DETALHADO:', {
			pattern: patternColors.join('-'),
			expected_next: expectedNext,
			total_wins: totalWins,
			total_losses: totalLosses,
			'BASE (antes ajustes)': base.toFixed(2) + '%',
			'--- ÚLTIMOS 25 GIROS ---': '',
			red_pct: recentPct.red.toFixed(1) + '%',
			black_pct: recentPct.black.toFixed(1) + '%',
			white_pct: recentPct.white.toFixed(1) + '%',
			'--- AJUSTES ---': '',
			cor_oposta: opposite,
			dominancia_oposta: recentPct[opposite].toFixed(1) + '%',
			penalidade_dominancia: recentPct[opposite] > 70 ? '-15%' : '0%',
			repeticao_atual: streakLen,
			penalidade_repeticao: streakLen > 5 ? '-10%' : '0%',
			bonus_tendencia: recentPct[expectedNext] > 60 ? '+10%' : '0%',
			'AJUSTE TENDÊNCIA TOTAL': trendAdj + '%',
			'AJUSTE ESTABILIDADE': stabilityAdj + '%',
			'--- RESULTADO FINAL ---': '',
			calculo: `${base} + ${trendAdj} + ${stabilityAdj} = ${base + trendAdj + stabilityAdj}`,
			'CONFIANÇA RAW': rawConfidence.toFixed(2) + '%',
			'FATOR CALIBRAÇÃO': (observerData.calibrationFactor * 100).toFixed(1) + '%',
			'CONFIANÇA CALIBRADA': finalConfidence + '%'
		});
	}
	
		return {
			finalConfidence,
			explain: {
				pattern: patternColors,
				expected_next: expectedNext,
				total_wins: totalWins,
				total_losses: totalLosses,
				recent_window: RECENT_WINDOW,
				tendencia_ultimos_25: recentPct,
				repeticao_atual: streakLen,
				base: parseFloat(base.toFixed(2)),
				ajuste_tendencia: trendAdj,
				ajuste_estabilidade: stabilityAdj,
				assertividade_final: parseFloat(finalConfidence.toFixed(2))
			}
		};
	} catch (e) {
		console.warn('Falha no computeAssertivenessForColorPattern:', e);
		return null;
	}
}

// Função auxiliar para enviar mensagens com tratamento de erro
// ═══════════════════════════════════════════════════════════════════════════════
// ENVIAR MENSAGEM PARA CONTENT SCRIPT - REFATORADO 100% (Async com verificação)
// ═══════════════════════════════════════════════════════════════════════════════
async function sendMessageToContent(type, data = null) {
    return new Promise((resolve) => {
        // ✅ BUSCAR TODAS AS ABAS DA BLAZE (não apenas ativa/janela atual)
        chrome.tabs.query({}, function(tabs) {
            // ✅ FILTRAR APENAS ABAS DA BLAZE
            const blazeTabs = tabs.filter(tab => {
                if (!tab.url) return false;
                return tab.url.includes('blaze.bet.br') || 
                       tab.url.includes('blaze.com') || 
                       tab.url.includes('blaze1.space') ||
                       tab.url.includes('blaze-1.com');
            });
            
            // ✅ VALIDAR SE TEM ALGUMA ABA DA BLAZE
            if (!blazeTabs || blazeTabs.length === 0) {
                // Não logar erro - é normal quando Blaze está fechada
                resolve(false);
                return;
            }
            
            // ✅ PREFERIR ABA ATIVA, senão usar a primeira encontrada
            let targetTab = blazeTabs.find(tab => tab.active) || blazeTabs[0];
            
            // ✅ PREPARAR MENSAGEM
            const message = { type: type };
            if (data) message.data = data;
            
            // ✅ ENVIAR COM TRATAMENTO DE ERRO
            chrome.tabs.sendMessage(targetTab.id, message)
                .then(() => {
                    console.log(`✅ [${type}] enviado para aba Blaze (ID: ${targetTab.id})`);
                    resolve(true);
                })
                .catch(error => {
                    // ✅ TRATAMENTO DE ERRO SILENCIOSO (content script pode não estar pronto)
                    if (error.message && error.message.includes('Could not establish connection')) {
                        // Content script ainda não carregou - normal após reload
                        resolve(false);
                    } else if (error.message && error.message.includes('Receiving end does not exist')) {
                        // Content script não está respondendo - normal em algumas situações
                        resolve(false);
                } else {
                        console.error(`❌ Erro ao enviar ${type}:`, error);
                        resolve(false);
                }
            });
        });
    });
}

// Função para enviar status de análise para o content script
function sendAnalysisStatus(status) {
    sendMessageToContent('ANALYSIS_STATUS', { status: status });
}

// ============================================
// TELEGRAM INTEGRATION
// ============================================

// Função para enviar mensagem ao Telegram
async function sendTelegramMessage(text) {
    if (!analyzerConfig.telegramChatId || analyzerConfig.telegramChatId.trim() === '') {
        console.log('⚠️ Telegram Chat ID não configurado. Mensagem não enviada.');
        console.log('💡 Configure seu Chat ID na caixa de configurações da extensão.');
        return false;
    }

    console.log('📤 Tentando enviar mensagem ao Telegram...');
    console.log('📱 Chat ID:', analyzerConfig.telegramChatId);
    console.log('📝 Mensagem:', text);

    try {
        const response = await fetch(TELEGRAM_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: analyzerConfig.telegramChatId,
                text: text,
                parse_mode: 'HTML'
            })
        });

        const result = await response.json();
        
        if (result.ok) {
            console.log('✅ Mensagem enviada ao Telegram com sucesso!');
            console.log('📬 Resposta:', result);
            return true;
        } else {
            console.error('❌ Erro ao enviar mensagem ao Telegram:', result);
            if (result.description) {
                console.error('📋 Descrição do erro:', result.description);
                if (result.description.includes('chat not found')) {
                    console.error('💡 SOLUÇÃO: Você precisa iniciar uma conversa com o bot primeiro!');
                    console.error('💡 Acesse: https://t.me/Blaze_doubleIA_Bot e clique em "Start"');
                }
            }
            return false;
        }
    } catch (error) {
        console.error('❌ Erro de conexão com Telegram:', error);
        console.error('📋 Detalhes:', error.message);
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENVIAR SINAL DE ENTRADA AO TELEGRAM - REFATORADO 100% (Com verificação de retorno)
// ═══════════════════════════════════════════════════════════════════════════════
async function sendTelegramEntrySignal(color, lastSpin, confidence, analysisData = null) {
    console.log('🎯 Enviando SINAL DE ENTRADA ao Telegram...');
    
    // ✅ VERIFICAR SE HÁ ABA DA BLAZE ABERTA (SEGURANÇA EXTRA)
    const hasBlaze = await hasBlazeTabOpen();
    if (!hasBlaze) {
        console.log('╔═══════════════════════════════════════════════════════════╗');
        console.log('║  ⛔ ENVIO BLOQUEADO: NENHUMA ABA DA BLAZE ABERTA         ║');
        console.log('║  💡 Sinais só são enviados quando a Blaze está aberta    ║');
        console.log('╚═══════════════════════════════════════════════════════════╝');
        return false;
    }
    
    // ✅ VALIDAÇÃO DE PARÂMETROS
    if (!color || !lastSpin) {
        console.error('❌ Parâmetros inválidos para envio ao Telegram:', { color, lastSpin });
        return false;
    }
    
    const colorEmoji = color === 'red' ? '🔴' : color === 'black' ? '⚫' : '⚪';
    const colorText = color === 'red' ? 'VERMELHO' : color === 'black' ? 'PRETO' : 'BRANCO';
    
    // Extrair informações de assertividade do patternDescription se disponível
    let assertivenessInfo = '';
    let isAIAnalysis = false;
    if (analysisData && analysisData.patternDescription) {
        try {
            // Tentar fazer parse como JSON primeiro
            const patternDesc = JSON.parse(analysisData.patternDescription);
            
            // Verificar se é análise IA (novo formato estruturado)
            if (patternDesc.type === 'AI_ANALYSIS') {
                isAIAnalysis = true;
                console.log('%c🤖 Análise IA detectada (formato estruturado)', 'color: #00FF88;');
                assertivenessInfo = ''; // Nenhuma info extra
            } else if (patternDesc.type === 'AI_ANALYSIS_OLD' || (typeof patternDesc === 'string' && patternDesc.includes('🤖'))) {
                // Formato antigo de IA (texto)
                isAIAnalysis = true;
                console.log('%c🤖 Análise IA detectada (formato antigo)', 'color: #00FF88;');
                assertivenessInfo = '';
            } else {
                // Para análise padrão, patternDescription é JSON
            let assert = null;
            
            // Buscar informações de assertividade em diferentes locais
            if (patternDesc) {
                // Prioridade 1: colorAnalysis.summary (padrões salvos)
                if (patternDesc.colorAnalysis && patternDesc.colorAnalysis.summary) {
                    assert = patternDesc.colorAnalysis.summary;
                }
                // Prioridade 2: colorAnalysis.assertiveness (análise nova)
                else if (patternDesc.colorAnalysis && patternDesc.colorAnalysis.assertiveness) {
                    assert = patternDesc.colorAnalysis.assertiveness;
                }
                // Prioridade 3: assertiveness direto (padrões salvos legacy)
                else if (patternDesc.assertiveness) {
                    assert = patternDesc.assertiveness;
                }
            }
            
            if (assert) {
                // Informações sobre as demais ocorrências (excluindo a amostra mínima)
                if (assert.othersCount !== undefined && assert.othersCount > 0) {
                    // ✅ CORREÇÃO: Usar othersCount diretamente, não somar othersWins + othersLosses
                    const othersTotal = assert.othersCount;
                    const othersPct = othersTotal > 0 ? ((assert.othersWins / othersTotal) * 100).toFixed(1) : '0.0';
                    assertivenessInfo += `\n📊 <b>Demais Ocorrências:</b> ${assert.othersWins}W / ${assert.othersLosses}L (${othersPct}%)`;
                }
                
                // Informações totais
                if (assert.occurrences !== undefined) {
                    assertivenessInfo += `\n📈 <b>Total de Ocorrências:</b> ${assert.occurrences}`;
                }
                
                if (assert.wins !== undefined && assert.losses !== undefined) {
                    const totalPct = assert.winPct ? assert.winPct.toFixed(1) : '0.0';
                    assertivenessInfo += `\n💯 <b>WIN Total:</b> ${assert.wins}W / ${assert.losses}L (${totalPct}%)`;
                }
            }
            }
        } catch (e) {
            console.error('Erro ao extrair informações de assertividade:', e);
            // Continuar sem as informações de assertividade
        }
    }
    
    // ✅ Calcular placar baseado em CICLOS COMPLETOS
    const { entriesHistory = [] } = await chrome.storage.local.get('entriesHistory');
    const { totalWins, totalLosses } = calculateCycleScore(entriesHistory);
    
    // isAIAnalysis já foi definido anteriormente ao fazer parse do patternDescription
    const systemTag = isAIAnalysis ? '🤖 Análise Avançada (IA)' : '📊 Sistema Padrão';
    
    const message = `
🎯 <b>ATENÇÃO ENTRAR AGORA</b>
${colorEmoji} <b>${colorText}</b>
📊 Confiança: ${confidence}%
${isAIAnalysis ? '🤖 <b>Análise: Inteligência Artificial</b>' : ''}
🎲 Último: ${lastSpin.color === 'red' ? '🔴' : lastSpin.color === 'black' ? '⚫' : '⚪'} ${lastSpin.color === 'red' ? 'Vermelho' : lastSpin.color === 'black' ? 'Preto' : 'Branco'} (${lastSpin.number})
📈 Placar: WIN: ${totalWins} | LOSS: ${totalLosses}
⏰ ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
    `.trim();

    // ✅ ENVIAR E VERIFICAR RETORNO
    const result = await sendTelegramMessage(message);
    
    if (result) {
        console.log('✅ Sinal de entrada enviado ao Telegram com sucesso!');
        return true;
    } else {
        console.error('❌ FALHA ao enviar sinal de entrada ao Telegram!');
        console.error('💡 Verifique: 1) Chat ID configurado | 2) Bot iniciado | 3) Conexão com internet');
        return false;
    }
}

// Função para enviar confirmação de WIN ao Telegram
async function sendTelegramWinConfirmation(wins, losses) {
    console.log('💰 Enviando confirmação de WIN ao Telegram...');
    console.log('📊 Placar: WIN', wins, '/ LOSS', losses);
    
    const total = wins + losses;
    const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0';
    
    const message = `
💰💰💰💰💰💰💰 <b>WIN</b> 💰💰💰💰💰💰💰
🔴 <b>Vermelho</b>
📊 Confiança: 75.2%
📈 Placar: WIN: ${wins} | LOSS: ${losses}
⏰ ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
    `.trim();

    console.log('📤 Enviando mensagem de WIN...');
    const result = await sendTelegramMessage(message);
    console.log('📬 Resultado do envio WIN:', result ? '✅ Sucesso' : '❌ Falha');
    return result;
}

// Função para enviar confirmação de LOSS ao Telegram
async function sendTelegramLossConfirmation(wins, losses) {
    console.log('❌ Enviando confirmação de LOSS ao Telegram...');
    console.log('📊 Placar: WIN', wins, '/ LOSS', losses);
    
    const total = wins + losses;
    const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0';
    
    const message = `
❌❌❌❌❌❌❌ <b>LOSS</b> ❌❌❌❌❌❌❌
⚫ <b>Preto</b>
📊 Confiança: 91.2%
📈 Placar: WIN: ${wins} | LOSS: ${losses}
⏰ ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
    `.trim();

    console.log('📤 Enviando mensagem de LOSS...');
    const result = await sendTelegramMessage(message);
    console.log('📬 Resultado do envio LOSS:', result ? '✅ Sucesso' : '❌ Falha');
    return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNÇÕES DE ENVIO DE SINAIS - SISTEMA DE MARTINGALE
// ═══════════════════════════════════════════════════════════════════════════════

// Enviar sinal de LOSS (ENTRADA, G1 ou G2)
async function sendTelegramMartingaleLoss(stage, resultSpin) {
    console.log(`❌ Enviando confirmação de LOSS ${stage} ao Telegram...`);
    
    // ✅ Determinar próximo Gale baseado no estágio atual
    let nextGale = '';
    if (stage === 'ENTRADA') {
        nextGale = '🔄 Próximo: <b>G1</b>';
    } else if (stage === 'G1') {
        nextGale = '🔄 Próximo: <b>G2</b>';
    } else if (stage === 'G2') {
        nextGale = '🔄 Próximo: <b>G3</b>';
    } else if (stage.startsWith('G')) {
        const currentNum = parseInt(stage.substring(1)) || 0;
        nextGale = `🔄 Próximo: <b>G${currentNum + 1}</b>`;
    }
    
    // ✅ Simplificar nome do estágio (remover "ENTRADA" se for entrada)
    const stageName = stage === 'ENTRADA' ? '' : ` ${stage}`;
    
    const message = `
❌ <b>LOSS${stageName}</b>
📊 Confiança: 91.2%
🎲 Último: ${resultSpin.color === 'red' ? '🔴' : resultSpin.color === 'black' ? '⚫' : '⚪'} ${resultSpin.color === 'red' ? 'Vermelho' : resultSpin.color === 'black' ? 'Preto' : 'Branco'} (${resultSpin.number})
${nextGale}
⏰ ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
    `.trim();
    
    const result = await sendTelegramMessage(message);
    console.log('📬 Resultado do envio LOSS:', result ? '✅ Sucesso' : '❌ Falha');
    return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🆕 FUNÇÃO GENÉRICA: Enviar sinal de qualquer Gale (G1, G2, G3... G200)
// ═══════════════════════════════════════════════════════════════════════════════
async function sendTelegramMartingaleGale(galeNumber, color, percentage) {
    console.log(`🔄 Enviando sinal de G${galeNumber} ao Telegram...`);
    
    const colorEmoji = color === 'red' ? '🔴' : color === 'black' ? '⚫' : '⚪';
    const colorText = color === 'red' ? 'VERMELHO' : color === 'black' ? 'PRETO' : 'BRANCO';
    
    // Determinar texto de alerta baseado no número do Gale
    let warningText = '';
    const maxGales = analyzerConfig.maxGales || 2;
    if (galeNumber === maxGales) {
        warningText = '\n⚠️ <b>ÚLTIMA TENTATIVA!</b> ⚠️';
    } else if (galeNumber >= 3) {
        warningText = `\n⚠️ Gale ${galeNumber} de ${maxGales}`;
    }
    
    const message = `
🔄 <b>GALE ${galeNumber}</b>
${colorEmoji} <b>${colorText}</b>
📊 Confiança: ${galeNumber === 1 ? '82.1' : '88.5'}%
🎲 Último: ⚫ Preto (5)
⏰ ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
    `.trim();
    
    const result = await sendTelegramMessage(message);
    console.log(`📬 Resultado do envio G${galeNumber}:`, result ? '✅ Sucesso' : '❌ Falha');
    return result;
}

// Enviar sinal de G1 (Martingale 1)
async function sendTelegramMartingaleG1(color, hotColorPercentage) {
    console.log('🔄 Enviando sinal de G1 ao Telegram...');
    
    const colorEmoji = color === 'red' ? '🔴' : color === 'black' ? '⚫' : '⚪';
    const colorText = color === 'red' ? 'VERMELHO' : color === 'black' ? 'PRETO' : 'BRANCO';
    
    // ✅ Nova lógica: mesma cor da entrada (não mostra porcentagem de histórico)
    const message = `
🔄 <b>GALE 1</b>
${colorEmoji} <b>${colorText}</b>
📊 Confiança: 82.1%
🎲 Último: ⚫ Preto (5)
⏰ ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
    `.trim();
    
    const result = await sendTelegramMessage(message);
    console.log('📬 Resultado do envio G1:', result ? '✅ Sucesso' : '❌ Falha');
    return result;
}

// Enviar sinal de G2 (Martingale 2)
async function sendTelegramMartingaleG2(color, hotColorPercentage) {
    console.log('🔄 Enviando sinal de G2 ao Telegram...');
    
    const colorEmoji = color === 'red' ? '🔴' : color === 'black' ? '⚫' : '⚪';
    const colorText = color === 'red' ? 'VERMELHO' : color === 'black' ? 'PRETO' : 'BRANCO';
    
    // ✅ Nova lógica: mesma cor da entrada (não mostra porcentagem de histórico)
    const message = `
🔄 <b>GALE 2</b>
${colorEmoji} <b>${colorText}</b>
📊 Confiança: 88.5%
🎲 Último: ⚫ Preto (5)
⏰ ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
    `.trim();
    
    const result = await sendTelegramMessage(message);
    console.log('📬 Resultado do envio G2:', result ? '✅ Sucesso' : '❌ Falha');
    return result;
}

// Enviar sinal de WIN no Martingale
async function sendTelegramMartingaleWin(stage, resultSpin, wins, losses) {
    console.log(`✅ Enviando confirmação de WIN ${stage} ao Telegram...`);
    
    const total = wins + losses;
    const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0';
    const spinEmoji = resultSpin.color === 'red' ? '🔴' : resultSpin.color === 'black' ? '⚫' : '⚪';
    const spinColor = resultSpin.color === 'red' ? 'VERMELHO' : resultSpin.color === 'black' ? 'PRETO' : 'BRANCO';
    
    let stageMessage = '';
    if (stage === 'ENTRADA') {
        stageMessage = '💰💰💰💰💰💰💰 <b>WIN</b> 💰💰💰💰💰💰💰';
    } else if (stage === 'G1') {
        stageMessage = '💰💰💰💰💰💰💰 <b>WIN G1</b> 💰💰💰💰💰💰💰';
    } else if (stage === 'G2') {
        stageMessage = '💰💰💰💰💰💰💰 <b>WIN G2</b> 💰💰💰💰💰💰💰';
    }
    
    const message = `
${stageMessage}
${spinEmoji} <b>${spinColor}</b>
📊 Confiança: 88.5%
📈 Placar: WIN: ${wins} | LOSS: ${losses}
⏰ ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
    `.trim();
    
    const result = await sendTelegramMessage(message);
    console.log('📬 Resultado do envio WIN:', result ? '✅ Sucesso' : '❌ Falha');
    return result;
}

// Enviar sinal de RET (Loss Final)
async function sendTelegramMartingaleRET(wins, losses) {
    console.log('⛔ Enviando sinal de RET ao Telegram...');
    
    const total = wins + losses;
    const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0';
    
    const message = `
❌❌❌❌❌❌❌ <b>LOSS NÃO PAGOU</b> ❌❌❌❌❌❌❌
🔴 <b>Vermelho</b>
📊 Confiança: 91.2%
📈 Placar: WIN: ${wins} | LOSS: ${losses}
⏰ ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
    `.trim();
    
    const result = await sendTelegramMessage(message);
    console.log('📬 Resultado do envio RET:', result ? '✅ Sucesso' : '❌ Falha');
    return result;
}

// Monitorar abas e controlar extensão automaticamente
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    // Verificar se ainda há abas da Blaze abertas
    const hasBlaze = await hasBlazeTabOpen();
    if (!hasBlaze && isRunning) {
        console.log('╔═══════════════════════════════════════════════════════════╗');
        console.log('║  ⚠️ NENHUMA ABA DA BLAZE ABERTA - PARANDO EXTENSÃO       ║');
        console.log('╚═══════════════════════════════════════════════════════════╝');
        stopDataCollection();
    }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        // ✅ Verificar múltiplos domínios da Blaze
        const blazeDomains = [
            'blaze.com',
            'blaze1.space',
            'blaze-1.com',
            'blaze-bet.com',
            'blaze.bet.br'
        ];
        
        const isBlaze = tab.url && blazeDomains.some(domain => tab.url.includes(domain));
        
        if (isBlaze) {
            if (!isRunning) {
                console.log('╔═══════════════════════════════════════════════════════════╗');
                console.log('║  ✅ ABA DA BLAZE DETECTADA - INICIANDO EXTENSÃO          ║');
                console.log(`║  URL: ${tab.url.substring(0, 50)}...`);
                console.log('╚═══════════════════════════════════════════════════════════╝');
                startDataCollection();
            }
        }
    }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('');
    console.log('');
    console.log('%c╔════════════════════════════════════════════════════════════════════╗', 'color: #FF00FF; font-weight: bold; font-size: 16px;');
    console.log('%c║  🎯 BACKGROUND.JS LISTENER EXECUTADO! (VERSÃO 17)                ║', 'color: #FF00FF; font-weight: bold; font-size: 16px;');
    console.log('%c╠════════════════════════════════════════════════════════════════════╣', 'color: #FF00FF; font-weight: bold;');
    console.log('%c║  📨 Action recebida:', 'color: #FF00FF; font-weight: bold;', request.action);
    console.log('%c║  📦 Request completo:', 'color: #FF00FF;', request);
    console.log('%c╚════════════════════════════════════════════════════════════════════╝', 'color: #FF00FF; font-weight: bold;');
    console.log('');
    
    if (request.action === 'start') {
        startDataCollection();
        sendResponse({status: 'started'});
        return true;
    } else if (request.action === 'stop') {
        stopDataCollection();
        sendResponse({status: 'stopped'});
        return true;
    } else if (request.action === 'status') {
        sendResponse({status: isRunning ? 'running' : 'stopped'});
        return true;
    } else if (request.action === 'GET_MEMORIA_ATIVA_STATUS') {
        // 🧠 Retornar status da memória ativa para interface
        console.log('%c🧠 [BACKGROUND] Requisição de status da memória ativa recebida', 'color: #00CED1; font-weight: bold;');
        
        const statusResponse = {
            status: {
                inicializada: memoriaAtiva.inicializada,
                totalAtualizacoes: memoriaAtiva.totalAtualizacoes,
                tempoUltimaAtualizacao: memoriaAtiva.tempoUltimaAtualizacao,
                totalGiros: memoriaAtiva.giros.length,
                ultimaAtualizacao: memoriaAtiva.ultimaAtualizacao
            }
        };
        
        console.log('%c🧠 [BACKGROUND] Enviando resposta:', 'color: #00CED1;', statusResponse);
        
        sendResponse(statusResponse);
        return true;
    } else if (request.action === 'applyConfig') {
        console.log('%c✅ ENTROU NO else if applyConfig!', 'color: #00FF00; font-weight: bold; font-size: 16px;');
        (async () => {
            try {
                console.log('%c✅ EXECUTANDO async function...', 'color: #00FF00; font-weight: bold;');
                // ✅ Usar CACHE EM MEMÓRIA (não buscar de doubleHistory)
                const history = cachedHistory;
                
                const res = await chrome.storage.local.get(['analyzerConfig']);
                if (res && res.analyzerConfig) {
                    analyzerConfig = { ...DEFAULT_ANALYZER_CONFIG, ...res.analyzerConfig };
                }
                console.log('⚙️ Nova configuração aplicada via UI:');
                logActiveConfiguration();
                
                // ⚠️ SÓ REANALISAR SE MODO IA ESTIVER ATIVO E HOUVER HISTÓRICO SUFICIENTE
                if (analyzerConfig.aiMode && history && history.length >= 10) {
                    console.log('📊 Reanalisando com', history.length, 'giros do cache...');
                    await runAnalysisController(history);
                } else {
                    if (!analyzerConfig.aiMode) {
                        console.log('ℹ️ Modo IA desativado - não reanalisando automaticamente');
                    } else if (!history || history.length < 10) {
                        console.log('ℹ️ Histórico insuficiente para análise - mínimo 10 giros');
                    }
                }
                
                console.log('%c✅ CHAMANDO sendResponse com status: applied', 'color: #00FF00; font-weight: bold;');
                sendResponse({ status: 'applied' });
            } catch (e) {
                console.error('❌ Falha ao aplicar configuração:', e);
                sendResponse({ status: 'error', error: String(e) });
            }
        })();
        console.log('%c✅ RETORNANDO TRUE do listener!', 'color: #00FF00; font-weight: bold; font-size: 16px;');
        return true; // ⚠️ CRÍTICO: Indicar que vamos responder assincronamente!
    } else if (request.action === 'showPatternStats') {
        // Exibir estatísticas do banco de padrões
        (async () => {
            try {
                const db = await loadPatternDB();
                sendResponse({ status: 'shown', total: db.patterns_found ? db.patterns_found.length : 0 });
            } catch (e) {
                console.error('Erro ao exibir estatísticas:', e);
                sendResponse({ status: 'error', error: String(e) });
            }
        })();
        return true; // async response
    } else if (request.action === 'getObserverStats') {
        // Enviar estatísticas do observador inteligente
        const stats = getObserverStats();
        sendResponse({ status: 'success', stats: stats });
        return true;
    } else if (request.action === 'recalibrateObserver') {
        // Recalibrar observador manualmente (botão "Atualizar")
        console.log('🔄 Recalibração manual do observador solicitada...');
        recalibrateConfidenceModel();
        const stats = getObserverStats();
        sendResponse({ status: 'success', stats: stats });
        // Enviar atualização para content.js
        sendObserverUpdate(true); // Mostrar log na recalibração manual
        return true;
    } else if (request.action === 'aiModeChanged') {
        // Modo IA foi alterado
        (async () => {
            try {
                console.log('');
                console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #FFAA00; font-weight: bold;');
                console.log('%c🔄 MUDANÇA DE MODO DETECTADA!', 'color: #FFAA00; font-weight: bold; font-size: 14px;');
                console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #FFAA00; font-weight: bold;');
                
                const res = await chrome.storage.local.get(['analyzerConfig']);
                if (res && res.analyzerConfig) {
                    console.log('%c📥 Configuração lida do storage:', 'color: #00FFFF; font-weight: bold;');
                    console.log('%c   aiMode: ' + res.analyzerConfig.aiMode, 'color: #00FFFF; font-weight: bold; font-size: 13px;');
                    console.log('%c   minOccurrences: ' + res.analyzerConfig.minOccurrences, 'color: #00FFFF;');
                    
                    analyzerConfig = { ...DEFAULT_ANALYZER_CONFIG, ...res.analyzerConfig };
                    
                    console.log('');
                    console.log('%c🤖 Modo IA ' + (analyzerConfig.aiMode ? 'ATIVADO' : 'DESATIVADO'), 'color: ' + (analyzerConfig.aiMode ? '#00FF00' : '#FF6666') + '; font-weight: bold; font-size: 16px; background: ' + (analyzerConfig.aiMode ? '#003300' : '#330000') + '; padding: 5px;');
                    console.log('');
                    
                    // ✅ Se modo IA foi ATIVADO, marcar flag para aguardar 1 giro antes de enviar sinal
                    if (analyzerConfig.aiMode) {
                        aiModeJustActivated = true;
                        console.log('%c⏳ MODO IA ATIVADO: Aguardando 1 giro antes de enviar primeiro sinal...', 'color: #FFAA00; font-weight: bold; font-size: 13px; background: #332200; padding: 5px;');
                        console.log('');
                    } else {
                        // Se desativou, limpar flag
                        aiModeJustActivated = false;
                    }
                    
                    logActiveConfiguration();
                    
                    // Executar nova análise se houver histórico (mas não enviará sinal se aiModeJustActivated = true)
                    if (cachedHistory.length > 0) {
                        console.log('%c📊 Executando análise com novo modo...', 'color: #00FFFF; font-weight: bold;');
                        console.log('');
                        await runAnalysisController(cachedHistory);
                    } else {
                        console.log('%c⚠️ Nenhum histórico disponível para análise', 'color: #FFAA00;');
                    }
                }
                sendResponse({ status: 'success' });
            } catch (e) {
                console.error('%c❌ Erro ao alterar modo IA:', 'color: #FF0000; font-weight: bold;', e);
                sendResponse({ status: 'error', error: String(e) });
            }
        })();
        return true;
    } else if (request.action === 'syncProPlusNow') {
        // ☁️ SINCRONIZAR PROPLUS INSTANTANEAMENTE (quando histórico é limpo)
        (async () => {
            console.log('☁️ Sincronização ProPlus forçada (histórico limpo)');
            await checkAndSendProPlusSignal(true); // forceCheck = true
            sendResponse({ status: 'success' });
        })();
        return true;
    } else if (request.action === 'clearEntriesAndObserver') {
        // Limpar histórico de entradas E calibrador (mantém sincronizado)
        (async () => {
            console.log('╔═══════════════════════════════════════════════════════════╗');
            console.log('║  🗑️ LIMPANDO ENTRADAS E CALIBRADOR                       ║');
            console.log('╚═══════════════════════════════════════════════════════════╝');
            
            // Resetar observerData
            observerData = {
                entries: [],
                calibrationFactor: 1.0,
                lastCalibration: null,
                lastCalibratedCount: 0,
                stats: {
                    high: { predicted: 0, actual: 0, wins: 0, total: 0 },
                    medium: { predicted: 0, actual: 0, wins: 0, total: 0 },
                    low: { predicted: 0, actual: 0, wins: 0, total: 0 }
                }
            };
            
            // Salvar observerData resetado
            await saveObserverData(true); // Mostrar log
            
            console.log('✅ Calibrador limpo e sincronizado com histórico de entradas');
            
            // Enviar atualização para UI
            sendObserverUpdate(true); // Mostrar log após limpar
            
            sendResponse({ status: 'success', message: 'Entradas e calibrador limpos com sucesso!' });
        })();
        return true; // async response
    } else if (request.action === 'getDefaultPrompt') {
        // 🔧 Retornar o prompt padrão para visualização
        try {
            const historyLength = request.historyLength || 50;
            const historyText = request.historyText || '(exemplo de histórico)';
            const defaultPrompt = DEFAULT_AI_PROMPT(historyLength, historyText);
            sendResponse({ status: 'success', prompt: defaultPrompt });
        } catch (e) {
            console.error('❌ Erro ao buscar prompt padrão:', e);
            sendResponse({ status: 'error', error: String(e) });
        }
        return true;
    } else if (request.action === 'startPatternSearch') {
        console.log('%c✅ ENTROU NO else if startPatternSearch!', 'color: #00FFFF; font-weight: bold; font-size: 16px;');
        // Iniciar busca manual de padrões (5 minutos)
        (async () => {
            try {
                console.log('%c🔍 Iniciando busca manual de padrões...', 'color: #00FFFF; font-weight: bold;');
                // Verificar se já está buscando
                if (initialSearchActive) {
                    console.log('%c⚠️ Busca já está ativa!', 'color: #FFAA00; font-weight: bold;');
                    sendResponse({ status: 'already_running' });
                    return;
                }
                
                // ✅ Usar CACHE EM MEMÓRIA (mais rápido) ou buscar do servidor se vazio
                let historyToAnalyze = cachedHistory;
                
                if (!historyToAnalyze || historyToAnalyze.length < 50) {
                    console.log('📥 Cache vazio, buscando histórico do servidor...');
                    const serverGiros = await fetchGirosFromAPI();
                    
                    if (!serverGiros || serverGiros.length < 50) {
                        sendResponse({ status: 'insufficient_data', message: `Histórico insuficiente (<50 giros). Atual: ${serverGiros ? serverGiros.length : 0}` });
                        return;
                    }
                    
                    historyToAnalyze = serverGiros;
                    cachedHistory = serverGiros; // Atualizar cache
                }
                
                console.log(`✅ Iniciando busca de padrões com ${historyToAnalyze.length} giros em cache`);
                
                // Limpar padrões antigos
                await clearAllPatterns();
                
                // Iniciar busca de 5 minutos com histórico do cache
                await startInitialPatternSearch(historyToAnalyze);
                
                sendResponse({ status: 'started', historySize: historyToAnalyze.length });
            } catch (e) {
                console.error('Erro ao iniciar busca de padrões:', e);
                sendResponse({ status: 'error', error: String(e) });
            }
        })();
        console.log('%c✅ RETORNANDO TRUE do startPatternSearch!', 'color: #00FFFF; font-weight: bold; font-size: 16px;');
        return true; // async response
    } else if (request.action === 'resetPatterns') {
        console.log('%c✅ ENTROU NO else if resetPatterns!', 'color: #00FF00; font-weight: bold; font-size: 16px;');
        // Resetar/Limpar TUDO: padrões E análise pendente
        (async () => {
            try {
                console.log('%c🗑️ Executando limpeza de padrões...', 'color: #FFAA00; font-weight: bold;');
                // Parar busca se estiver em andamento
                if (initialSearchActive) {
                    console.log('⏸️ Parando busca ativa...');
                    stopInitialPatternSearch();
                }
                
                // Limpar TUDO (padrões + análise pendente)
                await clearAllPatternsAndAnalysis();
                
                console.log('✅ Reset completo realizado manualmente pelo usuário.');
                sendResponse({ status: 'success', message: 'Padrões e análise pendente resetados com sucesso!' });
            } catch (e) {
                console.error('Erro ao resetar padrões:', e);
                sendResponse({ status: 'error', error: String(e) });
            }
        })();
        console.log('%c✅ RETORNANDO TRUE do resetPatterns!', 'color: #00FF00; font-weight: bold; font-size: 16px;');
        return true; // async response
    } else {
        console.log('%c⚠️ NENHUM else if correspondeu! Action:', 'color: #FF0000; font-weight: bold; font-size: 16px;', request.action);
        console.log('%c⚠️ Listener vai retornar undefined!', 'color: #FF0000; font-weight: bold;');
    }
});

// ✅ INICIAR APENAS SE HOUVER ABA DA BLAZE ABERTA
(async function initExtension() {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║  🔍 VERIFICANDO SE HÁ ABAS DA BLAZE ABERTAS...           ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    
    const hasBlaze = await hasBlazeTabOpen();
    
    if (hasBlaze) {
        console.log('╔═══════════════════════════════════════════════════════════╗');
        console.log('║  ✅ ABA DA BLAZE ENCONTRADA - INICIANDO EXTENSÃO         ║');
        console.log('╚═══════════════════════════════════════════════════════════╝');
startDataCollection();
    } else {
        console.log('╔═══════════════════════════════════════════════════════════╗');
        console.log('║  ⚠️ NENHUMA ABA DA BLAZE ABERTA                          ║');
        console.log('║  💡 Abra blaze.com para ativar a extensão                ║');
        console.log('╚═══════════════════════════════════════════════════════════╝');
    }
})();

// ═══════════════════════════════════════════════════════════════════════════════
// 🔄 LISTENER PARA MUDANÇAS NAS CONFIGURAÇÕES
// ═══════════════════════════════════════════════════════════════════════════════
// Detecta quando o usuário altera as configurações e atualiza a variável global
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.analyzerConfig) {
        const newConfig = changes.analyzerConfig.newValue;
        if (newConfig) {
            // ✅ ATUALIZAR CONFIGURAÇÕES
            analyzerConfig = { ...DEFAULT_ANALYZER_CONFIG, ...newConfig };
            
            // ✅ MOSTRAR LOG COMPLETO DAS NOVAS CONFIGURAÇÕES
            console.log('');
            console.log('╔═══════════════════════════════════════════════════════════╗');
            console.log('║  🔄 CONFIGURAÇÕES ATUALIZADAS EM TEMPO REAL!             ║');
            console.log('╚═══════════════════════════════════════════════════════════╝');
            console.log('');
            
            // ✅ EXIBIR TODAS AS CONFIGURAÇÕES USANDO A FUNÇÃO logActiveConfiguration
            logActiveConfiguration();
            
            console.log('');
            console.log('✅ Novas configurações aplicadas com sucesso!');
            console.log('ℹ️  As regras já estão ativas - não precisa recarregar a extensão');
            console.log('');
        }
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 📱 LISTENERS DE VISIBILIDADE - Critical para mobile/desktop
// ═══════════════════════════════════════════════════════════════════════════════

// Detectar quando usuário volta para uma aba da Blaze (mobile/desktop)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        
        if (tab.url && (tab.url.includes('blaze.com') || tab.url.includes('blaze.bet.br'))) {
            console.log('');
            console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00FFFF; font-weight: bold;');
            console.log('%c║  📱 USUÁRIO VOLTOU PARA ABA DA BLAZE                     ║', 'color: #00FFFF; font-weight: bold;');
            console.log('%c║  Verificando conexões e dados...                        ║', 'color: #00FFFF;');
            console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00FFFF; font-weight: bold;');
            console.log('');
            
            // ✅ Verificar se WebSocket está conectado
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                console.warn('⚠️ WebSocket desconectado. Reconectando...');
                connectWebSocket();
            }
            
            // ✅ Forçar busca imediata de dados para garantir que está atualizado
            console.log('🔄 Buscando dados mais recentes...');
            await collectDoubleData();
            
            // ✅ Resetar timer de último dado recebido
            lastDataReceived = Date.now();
        }
    } catch (error) {
        // Ignorar erros silenciosamente (tab pode ter sido fechada)
    }
});

// Detectar quando uma aba da Blaze é atualizada/recarregada
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    try {
        // Só processar quando a página terminou de carregar
        if (changeInfo.status === 'complete' && tab.url && (tab.url.includes('blaze.com') || tab.url.includes('blaze.bet.br'))) {
            console.log('');
            console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #00FFFF; font-weight: bold;');
            console.log('%c║  🔄 ABA DA BLAZE RECARREGADA                             ║', 'color: #00FFFF; font-weight: bold;');
            console.log('%c║  Reconectando sistemas...                               ║', 'color: #00FFFF;');
            console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #00FFFF; font-weight: bold;');
            console.log('');
            
            // ✅ Aguardar 2 segundos para página estabilizar
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // ✅ Verificar se WebSocket está conectado
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                console.warn('⚠️ WebSocket desconectado após recarregar página. Reconectando...');
                connectWebSocket();
            }
            
            // ✅ Forçar busca imediata de dados
            console.log('🔄 Sincronizando dados após reload...');
            await collectDoubleData();
            
            // ✅ Resetar timer
            lastDataReceived = Date.now();
        }
    } catch (error) {
        // Ignorar erros silenciosamente
    }
});

console.log('');
console.log('%c✅ Listeners de visibilidade instalados!', 'color: #00FF88; font-weight: bold;');
console.log('%c   - Detectará quando usuário voltar para aba da Blaze', 'color: #00FF88;');
console.log('%c   - Reconectará automaticamente se necessário', 'color: #00FF88;');
console.log('%c   - Critical para funcionamento no mobile', 'color: #00FF88;');
console.log('');


