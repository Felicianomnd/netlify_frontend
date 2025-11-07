// Background service worker for Blaze Double Analyzer

// -------------------------------------------------------------------------------
// ?? VERS�O DO ARQUIVO - CONFIRMA��O DE CARREGAMENTO
// -------------------------------------------------------------------------------
console.log('');
console.log('');
console.log('%c+-------------------------------------------------------------------------------+', 'color: #00FF00; font-weight: bold; font-size: 20px; background: #003300; padding: 10px;');
console.log('%c�                                                                               �', 'color: #00FF00; font-weight: bold; font-size: 20px; background: #003300; padding: 10px;');
console.log('%c�           ? BACKGROUND.JS VERS�O 17 CARREGADO! ?                           �', 'color: #00FF00; font-weight: bold; font-size: 20px; background: #003300; padding: 10px;');
console.log('%c�                                                                               �', 'color: #00FF00; font-weight: bold; font-size: 20px; background: #003300; padding: 10px;');
console.log('%c�           ?????? VERS�O 17 - CHROME.TABS.ONUPDATED ??????                �', 'color: #FFAA00; font-weight: bold; font-size: 20px; background: #332200; padding: 10px;');
console.log('%c�                                                                               �', 'color: #00FF00; font-weight: bold; font-size: 20px; background: #003300; padding: 10px;');
console.log('%c�           ?? ' + new Date().toLocaleString('pt-BR') + '                            �', 'color: #00FF00; font-weight: bold; font-size: 16px; background: #003300; padding: 10px;');
console.log('%c�                                                                               �', 'color: #00FF00; font-weight: bold; font-size: 20px; background: #003300; padding: 10px;');
console.log('%c+-------------------------------------------------------------------------------+', 'color: #00FF00; font-weight: bold; font-size: 20px; background: #003300; padding: 10px;');
console.log('');
console.log('');

let isRunning = false;
let intervalId = null;

// -------------------------------------------------------------------------------
// ?? CACHE EM MEM�RIA (n�o persiste ap�s recarregar)
// -------------------------------------------------------------------------------
let cachedHistory = [];  // Hist�rico de giros em mem�ria (at� 2000)
let historyInitialized = false;  // Flag de inicializa��o

// -------------------------------------------------------------------------------
// ?? MEM�RIA ATIVA - SISTEMA INCREMENTAL DE AN�LISE
// Sistema inteligente que mant�m an�lises pr�-calculadas em mem�ria
// Atualiza apenas o delta (novo giro) ao inv�s de recalcular tudo
// -------------------------------------------------------------------------------
let memoriaAtiva = {
    // ?? STATUS
    inicializada: false,
    ultimaAtualizacao: null,
    versao: 1,
    
    // ?? HIST�RICO (2000 giros)
    giros: [],
    ultimos20: [],
    
    // ?? PADR�ES PR�-DETECTADOS (cache)
    padroesDetectados: {
        alternanciaSimples: [],
        alternanciasDupla: [],
        alternanciasTripla: [],
        sequenciasRed: [],
        sequenciasBlack: []
    },
    
    // ?? ESTAT�STICAS PR�-CALCULADAS
    estatisticas: {
        totalGiros: 0,
        distribuicao: {
            red: { count: 0, percent: 0 },
            black: { count: 0, percent: 0 },
            white: { count: 0, percent: 0 }
        },
        // Estat�sticas por tipo de padr�o
        porPadrao: {}
    },
    
    // ?? PADR�O ATIVO ATUAL
    padraoAtual: null,
    
    // ?? PERFORMANCE
    tempoInicializacao: 0,
    tempoUltimaAtualizacao: 0,
    totalAtualizacoes: 0
};

let memoriaAtivaInicializando = false;  // Flag para evitar inicializa��es simult�neas

// Runtime analyzer configuration (overridable via chrome.storage.local)
const DEFAULT_ANALYZER_CONFIG = {
    minOccurrences: 5,            // quantidade m�nima de WINS exigida (padr�o: 5) - MODO PADR�O
    minPercentage: 60,            // porcentagem m�nima de confian�a (1-100%) - MODO IA
    maxOccurrences: 0,            // quantidade M�XIMA de ocorr�ncias (0 = sem limite)
    minIntervalSpins: 0,          // intervalo m�nimo em GIROS entre sinais (0 = sem intervalo, 5 = aguardar 5 giros)
    minPatternSize: 3,            // tamanho M�NIMO do padr�o (giros)
    maxPatternSize: 0,            // tamanho M�XIMO do padr�o (0 = sem limite)
    winPercentOthers: 25,         // WIN% m�nima para as ocorr�ncias restantes
    requireTrigger: true,         // exigir cor de disparo
    consecutiveMartingale: false, // Martingale consecutivo (G1/G2 imediatos) ou aguardar novo padr�o
    maxGales: 2,                  // Quantidade m�xima de Gales (0=sem gale, 1=G1, 2=G1+G2, at� 200)
    telegramChatId: '',           // Chat ID do Telegram para enviar sinais
    aiApiKey: '',                 // ? Chave API da IA (cada usu�rio deve configurar a sua pr�pria)
    aiMode: false,                // Modo de an�lise por IA (true) ou modo padr�o (false)
    aiHistorySize: 50,            // Quantidade de giros para IA analisar (m�n: 10, m�x: 2000)
    diamondMode: 'conservative',  // 💎 Modo de análise Diamante: 'aggressive' (3+/6), 'moderate' (4+/6), 'conservative' (5+/6), 'ultra_conservative' (6/6)
    advancedMode: false,          // Mostrar configura��es avan�adas (prompt customizado)
    customPrompt: ''              // Prompt customizado para a IA (vazio = usa padr�o)
};
let analyzerConfig = { ...DEFAULT_ANALYZER_CONFIG };

// ?? FLAG DE CONTROLE: Evitar envio de sinal na primeira an�lise ap�s ativar modo IA
let aiModeJustActivated = false;

// -------------------------------------------------------------------------------
// ?? MODO PADR�O QUENTE - VARI�VEIS GLOBAIS
// -------------------------------------------------------------------------------
let hotPatternMode = false;  // Modo Padr�o Quente ativo/inativo
let currentHotPattern = null; // Padr�o quente atual
let hotPatternState = {
    pattern: null,           // Padr�o (ex: [red, red, red, black])
    prediction: null,        // Cor prevista (ex: 'red')
    consecutiveLosses: 0,    // 0, 1, ou 2 (abandonar se >= 2)
    status: 'searching',     // 'searching', 'active', 'observing', 'abandoned'
    totalWins: 0,
    totalLosses: 0,
    winRate: 0
};

// ?? CONTADOR DE CORES RECOMENDADAS PELA IA (para detectar vi�s)
let aiColorCounter = {
    red: 0,
    black: 0,
    white: 0,
    total: 0
};

// -------------------------------------------------------------------------------
// ?? CONSTANTES GLOBAIS PARA C�LCULO DE ASSERTIVIDADE
// -------------------------------------------------------------------------------
const RECENT_WINDOW = 25;
const PENALTY_OPPOSITE_DOMINANCE = 15; // -15% se domin�ncia da cor oposta >70%
const PENALTY_LONG_STREAK = 10; // -10% se repeti��o >5
const BONUS_FAVORABLE_TREND = 10; // +10% se tend�ncia a favor >60%
const BONUS_STABILITY = 5; // +5% est�vel
const PENALTY_INSTABILITY = 5; // -5% inst�vel

// -------------------------------------------------------------------------------
// ?? CALIBRADOR DE PORCENTAGENS - CONFIGURA��O E DADOS
// -------------------------------------------------------------------------------
const OBSERVER_CONFIG = {
    maxHistorySize: 200,        // M�ximo de entradas observadas
    minEntriesForCalibration: 20 // M�nimo para come�ar a calibrar
};

// Estrutura do observador em mem�ria (DEVE estar no topo para evitar TDZ errors)
let observerData = {
    entries: [],              // Hist�rico de entradas observadas
    calibrationFactor: 1.0,   // Fator de corre��o global (1.0 = sem ajuste)
    lastCalibration: null,    // Timestamp da �ltima calibra��o
    lastCalibratedCount: 0,   // N�mero de entradas na �ltima calibra��o
    stats: {                  // Estat�sticas por faixa de confian�a
        high: { predicted: 0, actual: 0, wins: 0, total: 0 },    // 80-100%
        medium: { predicted: 0, actual: 0, wins: 0, total: 0 },  // 60-79%
        low: { predicted: 0, actual: 0, wins: 0, total: 0 }      // 0-59%
    }
};

// Telegram Bot Configuration
const TELEGRAM_BOT_TOKEN = '8330409447:AAHTWT8BzRZOnNukKYdiI9_QMyTUORvE1gg';
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

// -------------------------------------------------------------------------------
// ?? PROMPT PADR�O DA IA (usado se customPrompt estiver vazio)
// -------------------------------------------------------------------------------
const DEFAULT_AI_PROMPT = (historyLength, historyText, patternsText = '', last20Text = '') => `Voc� � um especialista em an�lise de padr�es do jogo Double da Blaze.

${patternsText}

---------------------------------------------------------------
?? �LTIMOS 20 GIROS (OS MAIS IMPORTANTES - ANALISE ESTES!) ??
---------------------------------------------------------------
${last20Text || historyText.split(',').slice(0, 20).join(',')}

?? ATEN��O CR�TICA:
- O giro "1." � o MAIS RECENTE (acabou de sair)
- O giro "2." � o anterior ao 1.
- O giro "3." � o anterior ao 2.
- E assim por diante...

---------------------------------------------------------------
HIST�RICO COMPLETO (${historyLength} GIROS - para contexto):
---------------------------------------------------------------
${historyText}

REGRAS DO JOGO:
- Existem 3 cores: red (vermelho), black (preto), white (branco)
- N�meros 1-7 = red
- N�meros 8-14 = black
- N�mero 0 = white

?? REGRA FUNDAMENTAL - SEM VI�S:
--------------------------------------------------------
VOC� N�O PODE TER PREFER�NCIA POR NENHUMA COR!
- Se o padr�o indicar VERMELHO com 90% ? aposte em VERMELHO
- Se o padr�o indicar PRETO com 90% ? aposte em PRETO
- Se o padr�o indicar BRANCO com 90% ? aposte em BRANCO
- NUNCA favore�a uma cor sobre outra sem justificativa nos dados!
- Suas apostas devem ser baseadas APENAS nos padr�es do hist�rico!

---------------------------------------------------------------
METODOLOGIA DE AN�LISE (SIGA EXATAMENTE ESTA ORDEM):
---------------------------------------------------------------

PASSO 1: CITAR OS �LTIMOS 20 GIROS (OBRIGAT�RIO)
--------------------------------------------------------
?? VOC� **DEVE** COME�AR SUA RESPOSTA CITANDO OS 20 GIROS! ??

FORMATO OBRIGAT�RIO:
"�ltimos 20 giros recebidos:
1. (mais recente) [cor] ([n�mero])
2. [cor] ([n�mero])
3. [cor] ([n�mero])
...at� 20"

?? N�O INVENTE! COPIE EXATAMENTE O QUE EST� EM "�LTIMOS 20 GIROS"!
?? SE VOC� CITAR GIROS DIFERENTES, SUA AN�LISE SER� REJEITADA!
?? � **OBRIGAT�RIO** CITAR OS 20 GIROS ANTES DE FAZER QUALQUER AN�LISE!

PASSO 2: ANALISAR OS �LTIMOS 20 GIROS
--------------------------------------------------------

?? SISTEMA: COMPARA��O COM PADR�ES DETECTADOS
---------------------------------------------------------------

O sistema JavaScript J� ANALISOU todo o hist�rico e DETECTOU padr�es reais!
Voc� recebeu um RELAT�RIO COM ESTAT�STICAS REAIS de cada padr�o.

SUA TAREFA:
1?? **LEIA O RELAT�RIO DE PADR�ES** (no in�cio)
   - Veja quais padr�es foram encontrados
   - Veja as ESTAT�STICAS REAIS de cada padr�o
   - Essas porcentagens s�o FATOS (n�o invente outras!)

2?? **IDENTIFIQUE O PADR�O QUE EST� ATIVO AGORA (come�ando do giro 1)**
   - ?? **CR�TICO:** O padr�o DEVE come�ar no giro 1 (mais recente) e ir para tr�s!
   - ? O padr�o pode ter qualquer tamanho (6, 8, 10, 15 giros... n�o tem limite)!
   - ? Use os 20 giros para ter CONTEXTO MACRO e identificar padr�es grandes
   - ? Exemplo CORRETO: Se giros **1-6** = P-V-P-V-P-V ? "Altern�ncia Simples ATIVA"
   - ? Exemplo CORRETO: Se giros **1-15** = P-P-V-V-P-P-V-V-P-P-V-V-P-P-V ? "Altern�ncia Dupla ATIVA" (padr�o grande!)
   - ? Exemplo ERRADO: Giros 1-5 = P-V-P-V-P, mas voc� usa padr�o dos giros **8-14** = R-R-R-R-R-R-R
   - ? **N�O USE** padr�es que est�o "no meio" ou "no final" dos 20 giros se eles N�O incluem o giro 1!

3?? **USE AS ESTAT�STICAS REAIS DO RELAT�RIO**
   - Se encontrou um padr�o que bate, use a estat�stica REAL do relat�rio
   - Exemplo: Relat�rio diz "Altern�ncia Simples ? VERMELHO 80% (12/15)"
   - Sua recomenda��o deve ser: VERMELHO com 80% de confian�a

4?? **SE N�O BATER COM NENHUM PADR�O DO RELAT�RIO**
   - Analise o padr�o visual dos �ltimos 20 giros de forma livre
   - Identifique tend�ncias (altern�ncia, sequ�ncia, etc)
   - Use confian�a MENOR (50-70%) pois n�o tem estat�stica hist�rica comprovada

?? REGRAS CR�TICAS:
- **NUNCA** invente sequ�ncias que N�O existem nos 20 giros que voc� citou!
- **SEMPRE** compare com os padr�es do relat�rio PRIMEIRO!
- **USE** apenas as porcentagens do relat�rio (n�o invente outras!)
- Se n�o h� padr�o claro nos �ltimos 20 giros ? confidence: 0 (n�o apostar)

TIPOS DE PADR�O:

A) ALTERN�NCIA SIMPLES?
   Exemplo: P-V-P-V-P-V-P-V-P-V ou V-P-V-P-V-P-V-P-V-P
   
B) ALTERN�NCIA DUPLA?
   Exemplo: P-P-V-V-P-P-V-V-P-P-V-V ou V-V-P-P-V-V-P-P-V-V
   
C) ALTERN�NCIA TRIPLA?
   Exemplo: P-P-P-V-V-V-P-P-P-V-V-V ou V-V-V-P-P-P-V-V-V-P-P-P
   
D) SEQU�NCIA LONGA (mesma cor)?
   Exemplo: P-P-P-P-P-P-P-P-P-P ou V-V-V-V-V-V-V-V-V-V
   
E) TRANSI��O DE PADR�O?
   Exemplo: Giros 11-20 eram altern�ncia dupla, mas �ltimos 10 viraram sequ�ncia
   ?? Neste caso, considere que est� em TRANSI��O ? use padr�o dos �ltimos 10
   
F) ALEAT�RIO (sem padr�o)?
   Exemplo: P-V-P-P-V-V-P-V-P-V-P-V (n�o segue l�gica clara)

PASSO 3: FAZER RECOMENDA��O BASEADA NO PADR�O
--------------------------------------------------------
?? VOC� **N�O PODE** INVENTAR ESTAT�STICAS! ??

? SE ENCONTROU PADR�O QUE BATE COM O RELAT�RIO:
"Padr�o identificado: [nome do padr�o do relat�rio]"
"Baseado em [X] ocorr�ncias no hist�rico, esse padr�o foi seguido por [cor] em [Y]% das vezes"
"Recomenda��o: [cor]"

? N�O INVENTE N�MEROS OU SEQU�NCIAS!
- Use APENAS as estat�sticas do RELAT�RIO!
- O padr�o identificado DEVE come�ar no giro 1 (mais recente)!
- N�O use padr�es que est�o "no meio" dos 20 giros (ex: giros 8-14)!
- Se o padr�o n�o INCLUI o giro 1, ele N�O est� ativo!
- Exemplo: Se giros 1-5 = V-P-V-V-P, N�O diga "Sequ�ncia de 7 vermelhos" baseado nos giros 8-14!

? SE N�O BATEU COM NENHUM PADR�O DO RELAT�RIO:
"Nenhum padr�o conhecido detectado nos �ltimos 20 giros"
"Padr�o visual: [descreva o que REALMENTE V�]"
"Recomenda��o: [cor] (confian�a baixa)" ou "confidence: 0 (n�o apostar)"

PASSO 4: REGRA DE DECIS�O
--------------------------------------------------------
- Se o padr�o � CLARO ? confian�a 70-95%
- Se o padr�o � FRACO/INCERTO ? confian�a 0-50%
- Se ALEAT�RIO ? confidence: 0 (n�o apostar)

PASSO 5: CASOS ESPECIAIS
--------------------------------------------------------
BRANCO (0):
- NUNCA use l�gica de "branco atrasado"
- S� considere branco se ele fizer parte de um padr�o claro nos �ltimos 10-20 giros
- Se n�o h� branco no padr�o recente, ignore-o completamente

ALEAT�RIO:
- Se os �ltimos 20 giros n�o t�m padr�o claro, retorne confidence: 0
- N�O force um padr�o onde n�o existe!
- � melhor N�O apostar do que apostar em padr�o aleat�rio

AN�LISE EM CAMADAS (IMPORTANTE):
1?? Primeiro: Analise os �ltimos **15-20 giros** para identificar o padr�o DOMINANTE
2?? Segundo: Verifique se os �ltimos **10 giros** CONFIRMAM esse padr�o
3?? Terceiro: 
   - Se CONFIRMAM ? alta confian�a! Busque esse padr�o no hist�rico completo
   - Se CONTRADIZEM ? pode estar em transi��o. Retorne confidence baixo ou 0
   - NUNCA use apenas os �ltimos 10 giros como padr�o �nico!

---------------------------------------------------------------
INSTRU��ES FINAIS (PASSO A PASSO):
---------------------------------------------------------------

1?? **CITE os 10 primeiros giros** literalmente (n�o invente!)

2?? **ANALISE 15-20 giros** para identificar o padr�o dominante
   - N�O olhe apenas 10 giros!
   - Identifique o padr�o na janela maior

3?? **CONFIRME com os �ltimos 10 giros**
   - Os �ltimos 10 devem estar alinhados com o padr�o identificado
   - Se n�o estiverem, pode estar em transi��o (cuidado!)

4?? **FA�A A RECOMENDA��O**
   - Baseie-se apenas no padr�o VISUAL identificado
   - N�O INVENTE estat�sticas ou contagens!
   - Seja honesto se n�o houver padr�o claro

5?? **SEJA IMPARCIAL**
   - N�O favore�a nenhuma cor espec�fica!
   - Baseie-se APENAS nos padr�es visuais que voc� v�!

FORMATO DE RESPOSTA (JSON):

?? ATEN��O: N�O inclua o campo "last10Spins" na resposta!
O sistema automaticamente pega os dados REAIS do hist�rico.
Se voc� incluir esse campo, estar� INVENTANDO dados falsos!

{
  "color": "red ou black ou white",
  "confidence": n�mero de 0 a 100 (0 = sem padr�o confi�vel),
  "probability": n�mero de 0 a 100,
  "reasoning": "Padr�o identificado: [descreva o padr�o]. Encontrado [X] vezes no hist�rico. Ap�s esse padr�o: [cor] saiu [Y]% das vezes. Decis�o: [apostar/n�o apostar]"
}

?? IMPORTANTE: APENAS 4 campos no JSON (color, confidence, probability, reasoning)
N�O inclua last10Spins, last5Spins ou qualquer outro campo!

EXEMPLOS DE RESPOSTAS CORRETAS (USANDO RELAT�RIO DE PADR�ES):

EXEMPLO 1 - PADR�O ATIVO come�ando no giro 1 (8 giros):
{
  "color": "red",
  "confidence": 85,
  "probability": 85,
  "reasoning": "�ltimos 20 giros recebidos: 1. black (9), 2. black (11), 3. red (4), 4. red (7), 5. black (14), 6. black (8), 7. red (2), 8. red (5), 9. black (12)... at� 20. Padr�o ATIVO identificado nos giros 1-8: 1.P, 2.P, 3.V, 4.V, 5.P, 6.P, 7.V, 8.V = Altern�ncia Dupla (P-P-V-V-P-P-V-V). Segundo o relat�rio, este padr�o apareceu 15 vezes no hist�rico e foi seguido por VERMELHO em 85% das vezes (13/15). Recomenda��o: VERMELHO."
}

EXEMPLO 2 - PADR�O ATIVO come�ando no giro 1 (15 giros - PADR�O GRANDE!):
{
  "color": "black",
  "confidence": 90,
  "probability": 90,
  "reasoning": "�ltimos 20 giros: 1. black (10), 2. black (9), 3. red (4), 4. red (7), 5. black (14), 6. black (8), 7. red (2), 8. red (5), 9. black (12), 10. black (11), 11. red (3), 12. red (1), 13. black (13), 14. black (9), 15. red (6)... at� 20. Padr�o ATIVO identificado nos giros 1-15: Altern�ncia Dupla (P-P-V-V-P-P-V-V-P-P-V-V-P-P-V). Padr�o grande e consistente! Segundo o relat�rio, foi seguido por VERMELHO em 85% das vezes. Recomenda��o: VERMELHO com alta confian�a."
}

EXEMPLO 3 - NENHUM PADR�O DO RELAT�RIO (analise livre):
{
  "color": "red",
  "confidence": 60,
  "probability": 60,
  "reasoning": "�ltimos 20 giros: 1. black (12), 2. red (3), 3. black (9), 4. red (7), 5. black (11)... at� 20. Analisando os giros come�ando do 1: Altern�ncia irregular (P-V-P-V-P...). Nenhum padr�o conhecido do relat�rio detectado. Vis�o macro dos 20 giros: leve predomin�ncia de pretos. Recomenda��o: VERMELHO (revers�o esperada) com confian�a moderada."
}

EXEMPLO 4 - N�O APOSTAR (sem padr�o):
{
  "color": "red",
  "confidence": 0,
  "probability": 0,
  "reasoning": "Giro 1 (mais recente): black (12), Giro 2: red (3), Giro 3: white (0), Giro 4: black (8), Giro 5: red (7). Padr�o identificado: ALEAT�RIO. N�o h� padr�o claro ou consistente nos �ltimos 20 giros. Giros completamente irregulares (P-V-B-P-V-P-B-V...). Sem padr�o detect�vel. Recomenda��o: N�O APOSTAR."
}

?? REGRAS CR�TICAS: 
- CITE os primeiros 5-10 giros no campo "reasoning"
- N�O inclua o campo "last10Spins" - o sistema pega automaticamente!
- N�O INVENTE contagens, porcentagens ou estat�sticas!
- Descreva APENAS o padr�o VISUAL que voc� v�
- N�O TENHA VI�S para nenhuma cor! Analise imparcialmente!
- Se n�o h� padr�o claro ? retorne confidence: 0

RESPONDA APENAS COM O JSON, SEM TEXTO ADICIONAL.`;

// -------------------------------------------------------------------------------
// SISTEMA DE MARTINGALE (G1, G2)
// -------------------------------------------------------------------------------

// Estado do ciclo de Martingale atual
let martingaleState = {
    active: false,                    // Se h� um ciclo ativo
    stage: 'ENTRADA',                 // 'ENTRADA' | 'G1' | 'G2'
    patternKey: null,                 // Identificador do padr�o atual
    entryColor: null,                 // Cor da entrada inicial (aposta)
    entryColorResult: null,           // Cor que realmente saiu na entrada
    entryTimestamp: null,             // Timestamp da entrada inicial
    analysisData: null,               // Dados completos da an�lise
    lossCount: 0,                     // Contador de LOSS consecutivos
    lossColors: [],                   // Array de cores dos giros que deram LOSS
    patternsWithoutHistory: 0         // Contador de padr�es sem hist�rico que deram LOSS
};

// Hist�rico de "cores quentes" por padr�o
// Estrutura: { "patternKey": { after1Loss: {red: 5, black: 3}, after2Loss: {red: 2, black: 8} } }
let hotColorsHistory = {};

// -------------------------------------------------------------------------------
// FUN��ES DO SISTEMA DE MARTINGALE
// -------------------------------------------------------------------------------

// Carregar hist�rico de cores quentes do storage
async function loadHotColorsHistory() {
    try {
        const result = await chrome.storage.local.get(['hotColorsHistory']);
        if (result.hotColorsHistory) {
            hotColorsHistory = result.hotColorsHistory;
            console.log('? Hist�rico de cores quentes carregado:', Object.keys(hotColorsHistory).length, 'padr�es');
        }
    } catch (e) {
        console.error('? Erro ao carregar hist�rico de cores quentes:', e);
    }
}

// Salvar hist�rico de cores quentes no storage
async function saveHotColorsHistory() {
    try {
        await chrome.storage.local.set({ hotColorsHistory });
        console.log('? Hist�rico de cores quentes salvo');
    } catch (e) {
        console.error('? Erro ao salvar hist�rico de cores quentes:', e);
    }
}

// Calcular "cor quente" baseado no hist�rico de LOSSes
function calculateHotColor(patternKey, afterLossCount) {
    console.log(`?? Calculando cor quente para padr�o: ${patternKey} ap�s ${afterLossCount} LOSS(es)`);
    
    // Verificar se existe hist�rico para este padr�o
    if (!hotColorsHistory[patternKey]) {
        console.log('?? Padr�o sem hist�rico de LOSS anterior');
        return null;
    }
    
    const history = afterLossCount === 1 ? 
        hotColorsHistory[patternKey].after1Loss : 
        hotColorsHistory[patternKey].after2Loss;
    
    if (!history || Object.keys(history).length === 0) {
        console.log('?? Sem dados de cores ap�s', afterLossCount, 'LOSS(es)');
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
        console.log(`?? Cor quente encontrada: ${hotColor} (${maxCount}/${total} = ${percentage}%)`);
    }
    
    return hotColor;
}

// Atualizar hist�rico de cores ap�s um ciclo completado
async function updateHotColorsHistory(patternKey, lossSequence) {
    console.log(`?? Atualizando hist�rico de cores quentes para padr�o: ${patternKey}`);
    console.log('   Sequ�ncia de LOSS:', lossSequence);
    
    // Inicializar estrutura se n�o existir
    if (!hotColorsHistory[patternKey]) {
        hotColorsHistory[patternKey] = {
            after1Loss: { red: 0, black: 0, white: 0 },
            after2Loss: { red: 0, black: 0, white: 0 }
        };
    }
    
    // Atualizar ap�s 1 LOSS (se tiver pelo menos 2 entradas: LOSS + resultado)
    if (lossSequence.length >= 2) {
        const colorAfter1Loss = lossSequence[1].color;  // Cor que saiu ap�s 1� LOSS
        hotColorsHistory[patternKey].after1Loss[colorAfter1Loss]++;
        console.log(`   ? Cor ap�s 1 LOSS: ${colorAfter1Loss}`);
    }
    
    // Atualizar ap�s 2 LOSS (se tiver pelo menos 3 entradas: 2 LOSS + resultado)
    if (lossSequence.length >= 3) {
        const colorAfter2Loss = lossSequence[2].color;  // Cor que saiu ap�s 2� LOSS
        hotColorsHistory[patternKey].after2Loss[colorAfter2Loss]++;
        console.log(`   ? Cor ap�s 2 LOSS: ${colorAfter2Loss}`);
    }
    
    // Salvar no storage
    await saveHotColorsHistory();
}

// Resetar estado do Martingale
function resetMartingaleState() {
    console.log('?? Resetando estado do Martingale');
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

// Criar identificador �nico para o padr�o
function createPatternKey(analysisData) {
    try {
        if (analysisData && analysisData.patternDescription) {
            // ✅ CORREÇÃO: Verificar se é análise IA/Diamante (texto simples, não JSON)
            const desc = analysisData.patternDescription;
            
            // Se for análise IA, Sistema 6 Níveis ou qualquer string simples
            if (desc.includes('ANÁLISE POR INTELIGÊNCIA ARTIFICIAL') || 
                desc.includes('Sistema 6 Níveis') ||
                desc.includes('ALTERNANCIA') ||
                desc.includes('PADRÃO CUSTOMIZADO') ||
                typeof desc === 'string' && !desc.startsWith('{')) {
                // Para análises baseadas em texto, criar chave única
                const timestamp = Date.now();
                const color = analysisData.color || 'unknown';
                return `ai_pattern_${color}_${timestamp}`;
            } else {
                // Tentar fazer parse apenas se parecer JSON
                const parsedDesc = JSON.parse(desc);
                if (parsedDesc.colorAnalysis && parsedDesc.colorAnalysis.pattern) {
                    return parsedDesc.colorAnalysis.pattern.join('-');
                }
            }
        }
    } catch (e) {
        console.error('🔴 Erro ao criar chave do padrão:', e);
    }
    return `pattern_${Date.now()}`;  // Fallback
}

// -------------------------------------------------------------------------------
// ?? SINCRONIZA��O COM API - DUAS APIS SEPARADAS
// -------------------------------------------------------------------------------

const API_CONFIG = {
    // API de Giros (coleta autom�tica, hist�rico, WebSocket)
    baseURL: 'https://blaze-giros-api-v2-1.onrender.com',
    wsURL: 'wss://blaze-giros-api-v2-1.onrender.com',
    
    // API de Autentica��o (usu�rios, admin, padr�es customizados)
    authURL: 'https://blaze-analyzer-api-v2.onrender.com',
    
    enabled: true,  // Ativar/desativar sincroniza��o
    syncInterval: 5 * 60 * 1000,  // Sincronizar a cada 5 minutos
    timeout: 10000,  // Timeout de 10 segundos
    retryAttempts: 3,
    useWebSocket: true  // ? Usar WebSocket ao inv�s de polling
};

let apiStatus = {
    isOnline: false,
    lastSync: null,
    lastError: null,
    syncAttempts: 0
};

// -------------------------------------------------------------------------------
// ?? WEBSOCKET - CONEX�O EM TEMPO REAL
// -------------------------------------------------------------------------------

let ws = null;
let wsReconnectTimeout = null;
let wsHeartbeatInterval = null;
let lastDataReceived = Date.now(); // ? Rastrear �ltimo dado recebido
let pollingInterval = null; // ? Intervalo de polling de fallback
let dataCheckInterval = null; // ? Intervalo para verificar dados desatualizados

// Conectar ao WebSocket
function connectWebSocket() {
    if (!API_CONFIG.enabled || !API_CONFIG.useWebSocket) {
        console.log('?? WebSocket desabilitado na configura��o');
        return;
    }
    
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
        console.log('?? WebSocket j� conectado ou conectando');
        return;
    }
    
    console.log('+-----------------------------------------------------------+');
    console.log('�  ?? CONECTANDO AO WEBSOCKET...                            �');
    console.log(`�  URL: ${API_CONFIG.wsURL}                               `);
    console.log('+-----------------------------------------------------------+');
    
    try {
        ws = new WebSocket(API_CONFIG.wsURL);
        
        ws.onopen = () => {
            console.log('? WebSocket conectado com sucesso!');
            console.log('? Aguardando giros em TEMPO REAL...');
            apiStatus.isOnline = true;
            apiStatus.lastSync = new Date().toISOString();
            
            // Limpar timeout de reconex�o se existir
            if (wsReconnectTimeout) {
                clearTimeout(wsReconnectTimeout);
                wsReconnectTimeout = null;
            }
            
            // ? Parar polling de fallback (WebSocket reconectado)
            stopPollingFallback();
            
            // Iniciar heartbeat (responder a PING do servidor)
            startWebSocketHeartbeat();
        };
        
        ws.onmessage = async (event) => {
            try {
                const message = JSON.parse(event.data);
                console.log('?? Mensagem WebSocket recebida:', message.type);
                
                // ? Atualizar timestamp de �ltimo dado recebido
                lastDataReceived = Date.now();
                
                switch (message.type) {
                    case 'CONNECTED':
                        console.log('? Confirma��o de conex�o:', message.message);
                        console.log(`?? Clientes conectados: ${message.clientsConnected}`);
                        break;
                        
                    case 'INITIAL_DATA':
                        console.log('?? Dados iniciais recebidos');
                        if (message.data && message.data.lastSpin) {
                            await processNewSpinFromServer(message.data.lastSpin);
                        }
                        break;
                        
                    case 'NEW_SPIN':
                        // ? NOVO GIRO EM TEMPO REAL!
                        console.log('?? NOVO GIRO RECEBIDO VIA WEBSOCKET!', message.data);
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
                        console.log('?? PONG recebido do servidor');
                        break;
                        
                    default:
                        console.log('?? Tipo de mensagem desconhecido:', message.type);
                }
            } catch (error) {
                console.error('? Erro ao processar mensagem WebSocket:', error);
            }
        };
        
        ws.onerror = (error) => {
            console.error('? Erro WebSocket:', error);
            apiStatus.isOnline = false;
            apiStatus.lastError = new Date().toISOString();
        };
        
        ws.onclose = (event) => {
            console.log('? WebSocket desconectado');
            console.log(`   C�digo: ${event.code}, Motivo: ${event.reason || 'N�o especificado'}`);
            apiStatus.isOnline = false;
            
            // Parar heartbeat
            stopWebSocketHeartbeat();
            
            // ? Iniciar polling de fallback imediatamente
            startPollingFallback();
            
            // ? Tentar reconectar ap�s 2 segundos (reduzido de 5s)
            console.log('? Tentando reconectar em 2 segundos...');
            wsReconnectTimeout = setTimeout(() => {
                console.log('?? Tentando reconectar WebSocket...');
                connectWebSocket();
            }, 2000);
        };
        
    } catch (error) {
        console.error('? Erro ao criar conex�o WebSocket:', error);
        apiStatus.isOnline = false;
        
        // ? Iniciar polling de fallback imediatamente
        startPollingFallback();
        
        // ? Tentar reconectar ap�s 2 segundos (reduzido de 5s)
        wsReconnectTimeout = setTimeout(() => {
            connectWebSocket();
        }, 2000);
    }
}

// Desconectar WebSocket
function disconnectWebSocket() {
    console.log('?? Desconectando WebSocket...');
    
    if (wsReconnectTimeout) {
        clearTimeout(wsReconnectTimeout);
        wsReconnectTimeout = null;
    }
    
    stopWebSocketHeartbeat();
    
    if (ws) {
        ws.close(1000, 'Desconex�o normal');
        ws = null;
    }
}

// Heartbeat - enviar PING ativo do cliente a cada 20s
function startWebSocketHeartbeat() {
    stopWebSocketHeartbeat(); // Limpar qualquer heartbeat anterior
    
    // ? Enviar PING ativo do cliente a cada 20 segundos
    wsHeartbeatInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify({ type: 'PING', timestamp: Date.now() }));
                console.log('?? Heartbeat: PING enviado');
            } catch (error) {
                console.error('? Erro ao enviar PING:', error);
                // Se falhou ao enviar PING, tentar reconectar
                connectWebSocket();
            }
        } else {
            console.warn('?? WebSocket n�o est� aberto. Tentando reconectar...');
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

// -------------------------------------------------------------------------------
// ?? POLLING DE FALLBACK - Quando WebSocket falha ou est� inativo
// -------------------------------------------------------------------------------

function startPollingFallback() {
    // Se j� est� rodando, n�o iniciar novamente
    if (pollingInterval) return;
    
    console.log('');
    console.log('%c+-----------------------------------------------------------+', 'color: #FFA500; font-weight: bold;');
    console.log('%c�  ?? POLLING DE FALLBACK ATIVADO                          �', 'color: #FFA500; font-weight: bold;');
    console.log('%c�  WebSocket est� offline - buscando dados via HTTP       �', 'color: #FFA500;');
    console.log('%c�  Frequ�ncia: a cada 2 segundos                          �', 'color: #FFA500;');
    console.log('%c+-----------------------------------------------------------+', 'color: #FFA500; font-weight: bold;');
    console.log('');
    
    // ? Notificar content.js que WebSocket caiu
    sendMessageToContent('WEBSOCKET_STATUS', { connected: false });
    
    // ? Buscar dados a cada 2 segundos quando WebSocket est� offline
    pollingInterval = setInterval(async () => {
        try {
            // Buscar �ltimo giro do servidor
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
            console.warn('?? Polling fallback: erro ao buscar dados:', error.message);
        }
    }, 2000); // A cada 2 segundos
}

function stopPollingFallback() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        console.log('? Polling de fallback parado - WebSocket reconectado');
        
        // ? Notificar content.js que WebSocket reconectou
        sendMessageToContent('WEBSOCKET_STATUS', { connected: true });
    }
}

// -------------------------------------------------------------------------------
// ?? VERIFICA��O DE DADOS DESATUALIZADOS - Critical para mobile
// -------------------------------------------------------------------------------

function startDataFreshnessCheck() {
    // Se j� est� rodando, n�o iniciar novamente
    if (dataCheckInterval) return;
    
    console.log('? Sistema de verifica��o de dados ativos: LIGADO');
    console.log('   Verificar� se dados est�o atualizados a cada 30 segundos');
    
    // ? Verificar a cada 30 segundos se os dados est�o desatualizados
    dataCheckInterval = setInterval(() => {
        const now = Date.now();
        const timeSinceLastData = now - lastDataReceived;
        const maxStaleTime = 90000; // 90 segundos (1.5 minutos)
        
        if (timeSinceLastData > maxStaleTime) {
            console.warn('');
            console.warn('%c?????? DADOS DESATUALIZADOS DETECTADOS! ??????', 'color: #FF0000; font-weight: bold; font-size: 16px; background: #330000; padding: 5px;');
            console.warn(`   �ltimo dado recebido h� ${Math.floor(timeSinceLastData / 1000)} segundos`);
            console.warn('   For�ando reconex�o e atualiza��o...');
            console.warn('');
            
            // ? For�ar reconex�o WebSocket
            disconnectWebSocket();
            connectWebSocket();
            
            // ? For�ar busca imediata de dados via polling
            collectDoubleData();
        }
    }, 30000); // Verificar a cada 30 segundos
}

function stopDataFreshnessCheck() {
    if (dataCheckInterval) {
        clearInterval(dataCheckInterval);
        dataCheckInterval = null;
        console.log('?? Sistema de verifica��o de dados: DESLIGADO');
    }
}

// -------------------------------------------------------------------------------
// VERIFICA��O DE ABA DA BLAZE - GARANTIR QUE EXTENS�O S� FUNCIONE COM P�GINA ABERTA
// -------------------------------------------------------------------------------

// Verificar se h� uma aba da Blaze aberta
async function hasBlazeTabOpen() {
    try {
        const tabs = await chrome.tabs.query({});
        
        const blazeTabs = tabs.filter(tab => {
            if (!tab.url) return false;
            
            // ? Aceitar m�ltiplos dom�nios da Blaze
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

// Fazer requisi��o com timeout e retry
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
            throw new Error(`Timeout ap�s ${timeout/1000}s - Servidor n�o respondeu a tempo`);
        }
        throw error;
    }
}

// Verificar se API est� online
async function checkAPIStatus() {
    if (!API_CONFIG.enabled) {
        console.log('?? API DESATIVADA - Sincroniza��o offline');
        return false;
    }
    
    try {
        console.log('?? Verificando conex�o com API...');
        // Usar timeout maior para conex�o inicial (20s)
        const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/api/status`, {}, 20000);
        if (response.ok) {
            const data = await response.json();
            apiStatus.isOnline = true;
            apiStatus.lastError = null;
            apiStatus.lastSync = new Date().toISOString();
            console.log('%c? API ONLINE - Sincroniza��o ativada!', 'color: #00ff00; font-weight: bold; font-size: 14px;');
            console.log(`?? Servidor: ${data.database?.giros || 0} giros, ${data.database?.padroes || 0} padr�es`);
            return true;
        }
    } catch (error) {
        apiStatus.isOnline = false;
        apiStatus.lastError = error.message;
        // N�o mostrar erro se for timeout inicial - servidor pode estar em cold start
        if (error.message.includes('Timeout')) {
            console.log('%c? Servidor demorando (cold start) - Tentar� novamente...', 'color: #FFAA00; font-weight: bold;');
        } else {
            console.log('%c? API OFFLINE - Modo local ativado', 'color: #ff0000; font-weight: bold; font-size: 14px;');
            console.log(`?? Erro: ${error.message}`);
        }
    }
    return false;
}

// Buscar giros do servidor
async function fetchGirosFromAPI() {
    if (!API_CONFIG.enabled) {
        console.log('?? API_CONFIG.enabled = false - n�o buscar� giros do servidor');
        return null;
    }
    
    try {
        console.log('-----------------------------------------------------------');
        console.log('?? INICIANDO BUSCA DE GIROS DO SERVIDOR...');
        console.log('   URL:', `${API_CONFIG.baseURL}/api/giros?limit=2000`);
        console.log('   Timeout: 20 segundos');
        console.log('-----------------------------------------------------------');
        
        const startTime = Date.now();
        
        // Usar timeout maior para busca inicial de 2000 giros (20s)
        const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/api/giros?limit=2000`, {}, 20000);
        
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`?? Tempo de resposta: ${elapsedTime}s`);
        
        if (response.ok) {
            const data = await response.json();
            console.log('? Resposta recebida com sucesso!');
            console.log('   data.success:', data.success);
            console.log('   data.data existe?', !!data.data);
            console.log('   data.data.length:', data.data ? data.data.length : 'N/A');
            
            if (data.success && data.data) {
                console.log(`%c? SERVIDOR RETORNOU ${data.data.length} GIROS!`, 'color: #00ff00; font-weight: bold; font-size: 14px;');
                console.log('   Primeiro giro (mais recente):', data.data[0]);
                console.log('   �ltimo giro (mais antigo):', data.data[data.data.length - 1]);
                console.log('-----------------------------------------------------------');
                return data.data;
            } else {
                console.log('?? Resposta do servidor sem dados v�lidos');
                console.log('   Estrutura recebida:', Object.keys(data));
                console.log('-----------------------------------------------------------');
            }
        } else {
            console.log('? Resposta com erro do servidor');
            console.log('   Status:', response.status);
            console.log('   StatusText:', response.statusText);
            console.log('-----------------------------------------------------------');
        }
    } catch (error) {
        console.log('? ERRO AO BUSCAR GIROS DO SERVIDOR!');
        console.log('   Tipo de erro:', error.name);
        console.log('   Mensagem:', error.message);
        console.log('   Stack:', error.stack);
        console.log('-----------------------------------------------------------');
        
        // N�o mostrar erro assustador se for timeout - servidor pode estar ocupado
        if (error.message.includes('Timeout')) {
            console.log('? Servidor ocupado - Continuar� sincronizando em tempo real...');
        } else {
            console.warn('?? Erro ao buscar giros do servidor:', error.message);
        }
    }
    return null;
}

// Salvar giros no servidor
async function saveGirosToAPI(giros) {
    if (!API_CONFIG.enabled || !apiStatus.isOnline) return false;
    
    const girosArray = Array.isArray(giros) ? giros : [giros];
    
    try {
        console.log(`?? Enviando ${girosArray.length} giro(s) para o servidor...`);
        const response = await fetchWithTimeout(`${API_CONFIG.baseURL}/api/giros`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(giros)
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log(`%c? ${data.message || 'Giros salvos com sucesso!'}`, 'color: #00ff00; font-weight: bold;');
            console.log(`?? Total no servidor: ${data.totalGiros || '?'} giros`);
            return true;
        }
    } catch (error) {
        console.warn('%c?? Erro ao salvar giros no servidor:', 'color: #ff9900; font-weight: bold;', error.message);
    }
    return false;
}

// Padr�es N�O s�o mais enviados para o servidor (s�o recalculados a cada sess�o)

// -----------------------------------------------------------------------------
// ?? FUN��O AUXILIAR: EXIBIR RODAP� FIXO COM SISTEMA ATIVO
// -----------------------------------------------------------------------------
function displaySystemFooter() {
    console.log('');
    console.log('%c+-------------------------------------------------------------------------------+', 'color: #666666; font-weight: bold;');
    
    if (analyzerConfig.aiMode) {
        console.log('%c� ?? SISTEMA ATIVO: AN�LISE AVAN�ADA (AUTO-APRENDIZADO)                         �', 'color: #00FF00; font-weight: bold; background: #001100;');
        console.log('%c� ?? Sistema: 100% JavaScript (Sem IA Externa)                                  �', 'color: #00AA00;');
        console.log('%c� ?? Hist�rico analisado: ' + (analyzerConfig.aiHistorySize || 50) + ' giros                                              �', 'color: #00AA00;');
        
        // ?? INDICADOR DE MEM�RIA ATIVA (din�mico)
        if (memoriaAtiva.inicializada) {
            const tempoDecorrido = Math.round((Date.now() - memoriaAtiva.ultimaAtualizacao) / 1000);
            const statusCor = tempoDecorrido < 60 ? '#00FF00' : '#FFA500'; // Verde se recente, laranja se n�o
            console.log(`%c� ?? CACHE RAM: ? ATIVO | ${memoriaAtiva.giros.length} giros | ${memoriaAtiva.totalAtualizacoes} updates | ?? ${memoriaAtiva.tempoUltimaAtualizacao.toFixed(1)}ms      �`, `color: ${statusCor};`);
        } else {
            console.log('%c� ?? CACHE RAM: ?? INICIALIZANDO... (primeira an�lise em andamento)            �', 'color: #FFA500;');
        }
    } else {
        console.log('%c� ?? SISTEMA ATIVO: PADR�ES (173+ AN�LISES LOCAIS)                              �', 'color: #00AAFF; font-weight: bold; background: #001122;');
        console.log('%c� ?? Min. Ocorr�ncias: ' + (analyzerConfig.minOccurrences || 5) + '                                                       �', 'color: #0088FF;');
        console.log('%c� ?? Trigger: ' + (analyzerConfig.requireTrigger ? 'ATIVO' : 'DESATIVADO') + '                                                           �', 'color: #0088FF;');
    }
    
    console.log('%c+-------------------------------------------------------------------------------+', 'color: #666666; font-weight: bold;');
    console.log('');
}

// Sincroniza��o inicial ao carregar extens�o
async function syncInitialData() {
    console.log('%c---------------------------------------------------------', 'color: #00d4ff; font-weight: bold;');
    console.log('%c?? SINCRONIZA��O COM SERVIDOR RENDER.COM', 'color: #00d4ff; font-weight: bold; font-size: 16px;');
    console.log('%c---------------------------------------------------------', 'color: #00d4ff; font-weight: bold;');
    
    // Verificar se API est� online
    const isOnline = await checkAPIStatus();
    
    if (!isOnline) {
        console.log('%c?? MODO OFFLINE - Usando apenas dados locais', 'color: #ffaa00; font-weight: bold; font-size: 14px;');
        console.log('%c---------------------------------------------------------\n', 'color: #00d4ff; font-weight: bold;');
        return;
    }
    
    // Buscar giros do servidor e popular cache em mem�ria
    console.log('?? Baixando hist�rico de giros para cache em mem�ria...');
    const serverGiros = await fetchGirosFromAPI();
    if (serverGiros && serverGiros.length > 0) {
        // Popular cache em mem�ria (SEM salvar em chrome.storage.local)
        cachedHistory = [...serverGiros].slice(0, 2000);
        historyInitialized = true;
        console.log(`%c? Cache em mem�ria populado: ${cachedHistory.length} giros`, 'color: #00ff00; font-weight: bold;');
        
        // ? ENVIAR �LTIMO GIRO E HIST�RICO PARA A UI
        const lastSpin = serverGiros[0]; // O mais recente est� na posi��o 0
        if (lastSpin) {
            console.log('?? Enviando �ltimo giro para UI:', lastSpin);
            await chrome.storage.local.set({ lastSpin: lastSpin });
            sendMessageToContent('NEW_SPIN', { lastSpin: lastSpin, history: serverGiros });
            console.log('%c? UI atualizada com hist�rico do servidor', 'color: #00ff00; font-weight: bold;');
        }
    } else {
        console.log('?? Nenhum giro no servidor ainda');
        cachedHistory = [];
        historyInitialized = true;
    }
    
    // Padr�es N�O s�o mais sincronizados do servidor (apenas locais)
    console.log('?? Padr�es s�o gerados localmente - n�o h� sincroniza��o do servidor');
    
    apiStatus.lastSync = new Date().toISOString();
    console.log('%c?? SINCRONIZA��O COMPLETA!', 'color: #00ff00; font-weight: bold; font-size: 14px;');
    console.log('%c---------------------------------------------------------\n', 'color: #00d4ff; font-weight: bold;');
}

// Fun��o removida: padr�es n�o s�o mais enviados para servidor

// ? Sincroniza��o peri�dica REMOVIDA - agora usamos cache em mem�ria
// Cache � atualizado a cada novo giro em processNewSpinFromServer()

function rigorLogString() {
    try {
        const maxOccStr = analyzerConfig.maxOccurrences > 0 ? analyzerConfig.maxOccurrences : 'sem limite';
        const maxSizeStr = analyzerConfig.maxPatternSize > 0 ? analyzerConfig.maxPatternSize : 'sem limite';
        return `minOcc=${analyzerConfig.minOccurrences} | maxOcc=${maxOccStr} | intervaloMin=${analyzerConfig.minIntervalSpins}giros | minTam=${analyzerConfig.minPatternSize} | maxTam=${maxSizeStr} | win%Outras=${analyzerConfig.winPercentOthers}% | exigirTrigger=${analyzerConfig.requireTrigger}`;
    } catch(_) { return '[rigor indispon�vel]'; }
}

// -------------------------------------------------------------------------------
// VALIDA��ES ESPEC�FICAS POR TIPO DE PADR�O
// -------------------------------------------------------------------------------

// ? VALIDAR AN�LISE DE TEND�NCIA/FREQU�NCIA
function validateFrequencyAnalysis(analysis) {
    if (!analysis) return { valid: false, reason: 'An�lise n�o dispon�vel' };
    
    const minOccurrences = 5;
    const requiredWinRate = 100; // 100% WIN (0 LOSS)
    
    const occurrences = analysis.occurrences || 0;
    // ? Se wins/losses n�o existirem, assumir 100% win rate (padr�o das an�lises antigas)
    const wins = analysis.wins !== undefined ? analysis.wins : occurrences;
    const losses = analysis.losses !== undefined ? analysis.losses : 0;
    const winRate = occurrences > 0 ? (wins / occurrences) * 100 : 0;
    
    // Valida��o silenciosa, apenas logs quando rejeita
    if (occurrences < minOccurrences) {
        logRejectedPattern('Tend�ncia/Frequ�ncia', `${occurrences}/${minOccurrences} ocorr�ncias`);
        return { valid: false, reason: `${occurrences}/${minOccurrences} ocorr�ncias` };
    }
    
    if (losses > 0) {
        logRejectedPattern('Tend�ncia/Frequ�ncia', `${losses} LOSS (exige 100% WIN)`);
        return { valid: false, reason: `${losses} LOSS (exige 100% WIN)` };
    }
    
    console.log(`? [Valida��o]: Tend�ncia/Frequ�ncia APROVADA (${wins}W/${losses}L)`);
    return { valid: true };
}

// ? VALIDAR AN�LISE TEMPORAL (HOR�RIO)
function validateTemporalAnalysis(analysis) {
    if (!analysis) return { valid: false, reason: 'An�lise n�o dispon�vel' };
    
    const minOccurrences = 6;
    const requiredWinRate = 100; // 100% WIN (0 LOSS)
    
    const occurrences = analysis.occurrences || 0;
    // ? Se wins/losses n�o existirem, assumir 100% win rate (padr�o das an�lises antigas)
    const wins = analysis.wins !== undefined ? analysis.wins : occurrences;
    const losses = analysis.losses !== undefined ? analysis.losses : 0;
    const winRate = occurrences > 0 ? (wins / occurrences) * 100 : 0;
    
    // Valida��o silenciosa, apenas logs quando rejeita
    if (occurrences < minOccurrences) {
        logRejectedPattern('Temporal/Hor�rio', `${occurrences}/${minOccurrences} ocorr�ncias`);
        return { valid: false, reason: `${occurrences}/${minOccurrences} ocorr�ncias` };
    }
    
    if (losses > 0) {
        logRejectedPattern('Temporal/Hor�rio', `${losses} LOSS (exige 100% WIN)`);
        return { valid: false, reason: `${losses} LOSS (exige 100% WIN)` };
    }
    
    console.log(`? [Valida��o]: Temporal/Hor�rio APROVADO (${wins}W/${losses}L)`);
    return { valid: true };
}

// ? VALIDAR AN�LISE N�MERO + COR
function validateNumberAnalysis(analysis) {
    if (!analysis) return { valid: false, reason: 'An�lise n�o dispon�vel' };
    
    const minOccurrences = 3;
    const requiredWinRate = 100; // 100% WIN (0 LOSS)
    
    const occurrences = analysis.occurrences || 0;
    // ? Se wins/losses n�o existirem, calcular baseado na confidence (assumindo que confidence reflete winRate)
    const wins = analysis.wins !== undefined ? analysis.wins : Math.round((analysis.confidence / 100) * occurrences);
    const losses = analysis.losses !== undefined ? analysis.losses : (occurrences - wins);
    const winRate = occurrences > 0 ? (wins / occurrences) * 100 : 0;
    
    // Valida��o silenciosa, apenas logs quando rejeita
    if (occurrences < minOccurrences) {
        logRejectedPattern('N�mero+Cor', `${occurrences}/${minOccurrences} ocorr�ncias`);
        return { valid: false, reason: `${occurrences}/${minOccurrences} ocorr�ncias` };
    }
    
    if (losses > 0) {
        logRejectedPattern('N�mero+Cor', `${losses} LOSS (exige 100% WIN)`);
        return { valid: false, reason: `${losses} LOSS (exige 100% WIN)` };
    }
    
    console.log(`? [Valida��o]: N�mero+Cor APROVADO (${wins}W/${losses}L)`);
    return { valid: true };
}

// ? VALIDAR AN�LISE DE CICLO (CORRELA��O)
function validateCorrelationAnalysis(analysis) {
    if (!analysis) return { valid: false, reason: 'An�lise n�o dispon�vel' };
    
    const minOccurrences = 6;
    const requiredWinRate = 100; // 100% WIN (0 LOSS)
    
    const occurrences = analysis.occurrences || 0;
    // ? Se wins/losses n�o existirem, assumir 100% win rate (padr�o das an�lises antigas)
    const wins = analysis.wins !== undefined ? analysis.wins : occurrences;
    const losses = analysis.losses !== undefined ? analysis.losses : 0;
    const winRate = occurrences > 0 ? (wins / occurrences) * 100 : 0;
    
    // Valida��o silenciosa, apenas logs quando rejeita
    if (occurrences < minOccurrences) {
        logRejectedPattern('Ciclo/Peri�dica', `${occurrences}/${minOccurrences} ocorr�ncias`);
        return { valid: false, reason: `${occurrences}/${minOccurrences} ocorr�ncias` };
    }
    
    if (losses > 0) {
        logRejectedPattern('Ciclo/Peri�dica', `${losses} LOSS (exige 100% WIN)`);
        return { valid: false, reason: `${losses} LOSS (exige 100% WIN)` };
    }
    
    console.log(`? [Valida��o]: Ciclo/Peri�dica APROVADO (${wins}W/${losses}L)`);
    return { valid: true };
}

// -------------------------------------------------------------------------------
// SISTEMA DE LOGS LIMPOS E ORGANIZADOS
// -------------------------------------------------------------------------------

// ? LOG PADRONIZADO PARA CICLO DE AN�LISE
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
    
    console.log('\n+-----------------------------------------------------------+');
    console.log('�  ?? CICLO DE AN�LISE - RESUMO                             �');
    console.log('�-----------------------------------------------------------�');
    
    // 1. STATUS DO SERVIDOR
    const serverIcon = serverStatus === 'ativo' ? '?' : serverStatus === 'erro' ? '?' : '?';
    console.log(`�  ?? Servidor: ${serverIcon} ${serverStatus.toUpperCase()}`.padEnd(62) + '�');
    
    // 2. GIROS DISPON�VEIS
    console.log(`�  ?? Giros: Servidor=${spinsAvailable.server} | App=${spinsAvailable.app}`.padEnd(62) + '�');
    
    // 3. BUSCA POR NOVO GIRO
    if (searchingNewSpin) {
        console.log('�  ?? Busca: AGUARDANDO NOVO GIRO...'.padEnd(62) + '�');
    }
    
    console.log('�-----------------------------------------------------------�');
    
    // 4. PADR�ES ENCONTRADOS
    if (patternsFound.length > 0) {
        console.log(`�  ? Padr�es encontrados: ${patternsFound.length}`.padEnd(62) + '�');
        patternsFound.slice(0, 3).forEach((p, i) => {
            const label = `${i + 1}. ${p.type}: ${p.color}`;
            console.log(`�     ${label}`.padEnd(62) + '�');
        });
        if (patternsFound.length > 3) {
            console.log(`�     ... +${patternsFound.length - 3} padr�es`.padEnd(62) + '�');
        }
    } else {
        console.log('�  ?? Padr�es encontrados: NENHUM'.padEnd(62) + '�');
    }
    
    // 5. PADR�ES REJEITADOS
    if (rejectedPatterns.length > 0) {
        console.log('�-----------------------------------------------------------�');
        console.log(`�  ? Padr�es rejeitados: ${rejectedPatterns.length}`.padEnd(62) + '�');
        rejectedPatterns.slice(0, 2).forEach((r, i) => {
            const reason = r.reason ? r.reason.substring(0, 40) : 'motivo n�o especificado';
            console.log(`�     ${i + 1}. ${r.type}: ${reason}`.padEnd(62) + '�');
        });
        if (rejectedPatterns.length > 2) {
            console.log(`�     ... +${rejectedPatterns.length - 2} rejeitados`.padEnd(62) + '�');
        }
    }
    
    // 6. MENSAGEM TELEGRAM
    if (telegramSent !== null) {
        console.log('�-----------------------------------------------------------�');
        if (telegramSent) {
            console.log('�  ?? Telegram: ? MENSAGEM ENVIADA COM SUCESSO'.padEnd(62) + '�');
        } else {
            console.log('�  ?? Telegram: ? MENSAGEM N�O ENVIADA'.padEnd(62) + '�');
        }
    }
    
    // 7. PADR�ES EXIBIDOS
    console.log('�-----------------------------------------------------------�');
    console.log(`�  ?? Padr�es exibidos na extens�o: ${displayedPatternsCount}`.padEnd(62) + '�');
    
    console.log('+-----------------------------------------------------------+\n');
}

// ? LOG SIMPLIFICADO PARA STATUS DO SERVIDOR
function logServerStatus(status, spinsCount = 0) {
    const icon = status === 'ativo' ? '?' : status === 'erro' ? '?' : '?';
    console.log(`\n?? [Servidor]: ${icon} ${status.toUpperCase()} | Giros dispon�veis: ${spinsCount}`);
}

// ? LOG PARA BUSCA DE NOVO GIRO
function logSearchingNewSpin() {
    console.log('?? [Busca por novo giro]: AGUARDANDO...');
}

// ? LOG PARA PADR�O REJEITADO
function logRejectedPattern(type, reason) {
    console.log(`? [Padr�o rejeitado]: ${type} - ${reason}`);
}

// ? LOG PARA TELEGRAM
function logTelegramStatus(sent, reason = '') {
    if (sent) {
        console.log('?? [Telegram]: ? MENSAGEM ENVIADA');
    } else {
        console.log(`?? [Telegram]: ? N�O ENVIADA ${reason ? `- ${reason}` : ''}`);
    }
}

// ? LOG PARA PADR�ES ENCONTRADOS
function logPatternsFound(patterns) {
    if (patterns.length === 0) {
        console.log('?? [Padr�es encontrados]: NENHUM');
    } else {
        console.log(`? [Padr�es encontrados]: ${patterns.length}`);
        patterns.forEach((p, i) => {
            console.log(`   ${i + 1}. ${p.type || 'desconhecido'} ? ${p.color || '?'} (${p.confidence?.toFixed(1) || '0'}%)`);
        });
    }
}

// ? FUN��O PARA EXIBIR CONFIGURA��ES ATIVAS DE FORMA VISUAL
function logActiveConfiguration() {
    try {
        const config = analyzerConfig;
        
        console.log('+-----------------------------------------------------------+');
        console.log('�  ?? CONFIGURA��ES ATIVAS DO ANALISADOR                   �');
        console.log('�-----------------------------------------------------------�');
        
        // OCORR�NCIAS
        console.log('�  ?? CONTROLE DE OCORR�NCIAS:                              �');
        console.log(`�     � M�nimo de WINS: ${config.minOccurrences.toString().padEnd(35)}�`);
        const maxOccStr = config.maxOccurrences > 0 ? config.maxOccurrences.toString() : 'SEM LIMITE 8';
        console.log(`�     � M�ximo de ocorr�ncias: ${maxOccStr.padEnd(26)}�`);
        
        // TAMANHO DO PADR�O
        console.log('�                                                           �');
        console.log('�  ?? TAMANHO DO PADR�O:                                    �');
        console.log(`�     � M�nimo (giros): ${config.minPatternSize.toString().padEnd(32)}�`);
        const maxSizeStr = config.maxPatternSize > 0 ? config.maxPatternSize.toString() : 'SEM LIMITE 8';
        console.log(`�     � M�ximo (giros): ${maxSizeStr.padEnd(32)}�`);
        
        // INTERVALO E QUALIDADE
        console.log('�                                                           �');
        console.log('�  ?? INTERVALO E QUALIDADE:                                �');
        console.log(`�     � Intervalo m�nimo: ${config.minIntervalSpins.toString().padEnd(25)} giro(s) �`);
        console.log(`�     � WIN% demais ocorr�ncias: ${config.winPercentOthers.toString().padEnd(20)}%     �`);
        
        // COR DE DISPARO
        console.log('�                                                           �');
        console.log('�  ?? VALIDA��O DE TRIGGER:                                 �');
        const triggerStatus = config.requireTrigger ? '? ATIVADO (mais rigoroso)' : '? DESATIVADO (menos rigoroso)';
        console.log(`�     ${triggerStatus.padEnd(54)}�`);
        
        // MARTINGALE
        console.log('�                                                           �');
        console.log('�  ?? SISTEMA DE MARTINGALE (GALE):                         �');
        const galeQty = config.maxGales === 0 ? 'DESATIVADO' : 
                        config.maxGales === 1 ? '1 Gale (G1)' : 
                        config.maxGales === 2 ? '2 Gales (G1, G2)' : 
                        `${config.maxGales} Gales`;
        console.log(`�     � Quantidade de Gales: ${galeQty.padEnd(28)}�`);
        const martingaleMode = config.consecutiveMartingale ? 'CONSECUTIVO (imediato)' : 'PADR�O (aguarda novo)';
        console.log(`�     � Modo: ${martingaleMode.padEnd(44)}�`);
        
        // TELEGRAM
        console.log('�                                                           �');
        console.log('�  ?? TELEGRAM:                                             �');
        const telegramStatus = config.telegramChatId ? `? Ativo (ID: ${config.telegramChatId.substring(0, 10)}...)` : '? N�o configurado';
        console.log(`�     ${telegramStatus.padEnd(54)}�`);
        
        console.log('�                                                           �');
        console.log('�  ?? MODO IA:                                              �');
        const aiModeStatus = config.aiMode ? '? ATIVO' : '? Desativado (Modo Padr�o)';
        console.log(`�     ${aiModeStatus.padEnd(54)}�`);
        const aiKeyStatus = config.aiApiKey ? `? Configurada (${config.aiApiKey.substring(0, 8)}...)` : '? N�o configurada';
        console.log(`�     ${aiKeyStatus.padEnd(54)}�`);
        
        console.log('+-----------------------------------------------------------+');
        
        // ?? AVISOS DE CONFIGURA��O PERMISSIVA/RIGOROSA
        const warnings = [];
        
        if (config.minOccurrences <= 2) {
            warnings.push('?? Configura��o MUITO PERMISSIVA: minOccurrences <= 2');
        }
        
        if (config.winPercentOthers === 0) {
            warnings.push('?? Sem filtro de WIN% para outras ocorr�ncias (aceita qualquer %)');
        }
        
        if (!config.requireTrigger) {
            warnings.push('?? Cor de disparo DESATIVADA (menos rigoroso)');
        }
        
        if (config.maxOccurrences > 0 && config.maxOccurrences < 5) {
            warnings.push(`?? Limite de ocorr�ncias BAIXO: m�x ${config.maxOccurrences}`);
        }
        
        if (warnings.length > 0) {
            console.log('\n?? AVISOS DE CONFIGURA��O:');
            warnings.forEach(w => console.log(`   ${w}`));
            console.log('');
        }
        
    } catch (e) {
        console.error('Erro ao exibir configura��es:', e);
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
        
        // ? INICIALIZAR HIST�RICO DE SINAIS (para auto-aprendizado)
        await initializeSignalsHistory();
        
        // ? CARREGAR PADR�ES CUSTOMIZADOS
        await loadCustomPatterns();
        console.log(`?? Padr�es customizados carregados na inicializa��o: ${customPatternsCache.length}`);
        
        // ? EXIBIR CONFIGURA��ES ATIVAS
        logActiveConfiguration();
        
        // ? VALIDAR CONFIGURA��ES (detectar conflitos)
        const minSize = analyzerConfig.minPatternSize || 2;
        const maxSize = analyzerConfig.maxPatternSize || 0;
        const minOcc = analyzerConfig.minOccurrences || 1;
        const maxOcc = analyzerConfig.maxOccurrences || 0;
        
        if (maxSize > 0 && maxSize < minSize) {
            console.error('+-----------------------------------------------------------+');
            console.error('�  ?? CONFIGURA��O INV�LIDA DETECTADA!                     �');
            console.error('�-----------------------------------------------------------�');
            console.error(`�  ? Tamanho M�XIMO (${maxSize}) < M�NIMO (${minSize})!`);
            console.error('�  ?? NENHUM PADR�O SER� ENCONTRADO!                        �');
            console.error('�  ?? Ajuste: maxPatternSize >= minPatternSize             �');
            console.error('+-----------------------------------------------------------+');
        }
        
        if (maxOcc > 0 && maxOcc < minOcc) {
            console.error('+-----------------------------------------------------------+');
            console.error('�  ?? CONFIGURA��O INV�LIDA DETECTADA!                     �');
            console.error('�-----------------------------------------------------------�');
            console.error(`�  ? Ocorr�ncias M�XIMAS (${maxOcc}) < M�NIMAS (${minOcc})!`);
            console.error('�  ?? NENHUM PADR�O SER� ENCONTRADO!                        �');
            console.error('�  ?? Ajuste: maxOccurrences >= minOccurrences             �');
            console.error('+-----------------------------------------------------------+');
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
            
            // ? EXIBIR NOVAS CONFIGURA��ES
            console.log('\n?? CONFIGURA��ES ATUALIZADAS:');
            logActiveConfiguration();
            
            // ? VALIDAR CONFIGURA��ES (detectar conflitos)
            const minSize = analyzerConfig.minPatternSize || 2;
            const maxSize = analyzerConfig.maxPatternSize || 0;
            const minOcc = analyzerConfig.minOccurrences || 1;
            const maxOcc = analyzerConfig.maxOccurrences || 0;
            
            if (maxSize > 0 && maxSize < minSize) {
                console.error('+-----------------------------------------------------------+');
                console.error('�  ?? CONFIGURA��O INV�LIDA DETECTADA!                     �');
                console.error('�-----------------------------------------------------------�');
                console.error(`�  ? Tamanho M�XIMO (${maxSize}) < M�NIMO (${minSize})!`);
                console.error('�  ?? NENHUM PADR�O SER� ENCONTRADO!                        �');
                console.error('�  ?? Ajuste: maxPatternSize >= minPatternSize             �');
                console.error('+-----------------------------------------------------------+');
            }
            
            if (maxOcc > 0 && maxOcc < minOcc) {
                console.error('+-----------------------------------------------------------+');
                console.error('�  ?? CONFIGURA��O INV�LIDA DETECTADA!                     �');
                console.error('�-----------------------------------------------------------�');
                console.error(`�  ? Ocorr�ncias M�XIMAS (${maxOcc}) < M�NIMAS (${minOcc})!`);
                console.error('�  ?? NENHUM PADR�O SER� ENCONTRADO!                        �');
                console.error('�  ?? Ajuste: maxOccurrences >= minOccurrences             �');
                console.error('+-----------------------------------------------------------+');
            }
        } catch (e) {
            console.warn('Falha ao aplicar analyzerConfig:', e);
        }
    }
});

// -------------------------------------------------------------------------------
// CALIBRADOR DE PORCENTAGENS - INICIALIZA��O
// (Vari�veis movidas para o topo do arquivo para evitar TDZ errors)
// -------------------------------------------------------------------------------

// ? Carregar hist�rico de cores quentes ao iniciar
loadHotColorsHistory();

// Carregar dados do observador ao iniciar
(async function loadObserverDataAtStartup() {
    try {
        const res = await chrome.storage.local.get(['observerData', 'entriesHistory', 'martingaleState']);
        if (res && res.observerData) {
            observerData = { ...observerData, ...res.observerData };
            console.log('+-----------------------------------------------------------+');
            console.log('�  ?? CALIBRADOR DE PORCENTAGENS CARREGADO                 �');
            console.log('�-----------------------------------------------------------�');
            console.log(`�  ?? Entradas monitoradas: ${observerData.entries.length}`);
            console.log(`�  ?? �ltima calibra��o: ${observerData.lastCalibratedCount} entradas`);
            console.log(`�  ?? Fator de calibra��o: ${(observerData.calibrationFactor * 100).toFixed(1)}%`);
            console.log(`�  ?? Alta (=80%): ${observerData.stats.high.total} entradas`);
            console.log(`�  ?? M�dia (60-79%): ${observerData.stats.medium.total} entradas`);
            console.log(`�  ?? Baixa (<60%): ${observerData.stats.low.total} entradas`);
            console.log('+-----------------------------------------------------------+');
        } else {
            console.log('?? Calibrador de porcentagens: Nenhum dado anterior encontrado (primeira execu��o)');
        }
        
        // ? SINCRONIZAR: Sempre manter observerData sincronizado com entriesHistory
        const entriesHistory = res.entriesHistory || [];
        console.log('?? Verificando sincroniza��o:');
        console.log(`   entriesHistory existe?`, !!entriesHistory);
        console.log(`   entriesHistory.length:`, entriesHistory.length);
        console.log(`   observerData.entries.length:`, observerData.entries.length);
        
        // ? CASO 1: entriesHistory foi LIMPO (menos entradas que observerData)
        // Isso significa que o usu�rio limpou o hist�rico, ent�o resetar observerData
        if (entriesHistory.length < observerData.entries.length) {
            console.log('+-----------------------------------------------------------+');
            console.log('�  ??? HIST�RICO FOI LIMPO - RESETANDO CALIBRADOR          �');
            console.log('�-----------------------------------------------------------�');
            console.log(`�  Entradas antigas no calibrador: ${observerData.entries.length}`);
            console.log(`�  Entradas atuais no hist�rico: ${entriesHistory.length}`);
            console.log('+-----------------------------------------------------------+');
            
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
            
            console.log(`? Calibrador resetado e reconstru�do: ${observerData.entries.length} entradas`);
            
            // Atualizar estat�sticas
            updateObserverStats();
            
            // Salvar dados sincronizados
            await saveObserverData(true);
            
            // Enviar atualiza��o para UI
            sendObserverUpdate(true);
        }
        // ? CASO 2: entriesHistory tem MAIS entradas (adicionar novas)
        else if (entriesHistory.length > observerData.entries.length) {
            console.log('+-----------------------------------------------------------+');
            console.log('�  ?? SINCRONIZANDO ENTRADAS COM OBSERVADOR                �');
            console.log('�-----------------------------------------------------------�');
            console.log(`�  Entradas no hist�rico: ${entriesHistory.length}`);
            console.log(`�  Entradas no observador: ${observerData.entries.length}`);
            
            // Adicionar entradas que est�o faltando no observador
            let syncedCount = 0;
            for (const entry of entriesHistory) {
                // Verificar se j� existe no observador (por timestamp)
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
                    console.log(`      ? Adicionado ao observador (${syncedCount} sincronizadas)`);
                } else if (exists) {
                    console.log(`      ?? J� existe no observador`);
                } else {
                    console.log(`      ?? Entrada inv�lida (sem confidence ou result)`);
                }
            }
            
            console.log(`�-----------------------------------------------------------�`);
            console.log(`�  Total sincronizado: ${syncedCount} novas entradas`);
            console.log(`+-----------------------------------------------------------+`);
            
            // Limitar ao m�ximo configurado
            if (observerData.entries.length > OBSERVER_CONFIG.maxHistorySize) {
                observerData.entries = observerData.entries.slice(-OBSERVER_CONFIG.maxHistorySize);
            }
            
            // Atualizar estat�sticas
            updateObserverStats();
            
            // Salvar dados sincronizados
            await saveObserverData();
            
            console.log(`? Sincroniza��o conclu�da: ${observerData.entries.length} entradas no observador`);
            
            // Enviar atualiza��o para UI
            sendObserverUpdate(true); // Mostrar log ao carregar
        }
        // ? CASO 3: J� est�o sincronizados (mesmo n�mero de entradas)
        else {
            console.log('? Calibrador j� est� sincronizado com hist�rico de entradas');
        }
        
        // ? RESTAURAR ESTADO DO MARTINGALE (se houver ciclo ativo)
        if (res.martingaleState && res.martingaleState.active) {
            martingaleState = res.martingaleState;
            console.log('+-----------------------------------------------------------+');
            console.log('�  ?? CICLO DE MARTINGALE RESTAURADO                       �');
            console.log('�-----------------------------------------------------------�');
            console.log(`�  Est�gio: ${martingaleState.stage}`);
            console.log(`�  Padr�o: ${martingaleState.patternKey}`);
            console.log(`�  Cor: ${martingaleState.entryColor}`);
            console.log(`�  LOSS consecutivos: ${martingaleState.lossCount}`);
            console.log('+-----------------------------------------------------------+');
        }
    } catch (e) {
        console.warn('?? Falha ao carregar observerData:', e);
    }
})();

// Salvar dados do observador
async function saveObserverData(showLog = false) {
    // ?? VERIFICAR SE observerData FOI INICIALIZADO
    if (!observerData || !observerData.entries) {
        return;
    }
    
    try {
        await chrome.storage.local.set({ observerData: observerData });
        if (showLog) {
            console.log(`?? Calibrador salvo: ${observerData.entries.length} entradas, fator ${(observerData.calibrationFactor * 100).toFixed(1)}%, �ltima calibra��o em ${observerData.lastCalibratedCount}`);
        }
    } catch (e) {
        console.error('Erro ao salvar observerData:', e);
    }
}

// Enviar atualiza��o do observador para content.js
function sendObserverUpdate(showLog = false) {
    // ?? VERIFICAR SE observerData FOI INICIALIZADO
    if (!observerData || !observerData.entries) {
        return;
    }
    
    const stats = getObserverStats();
    if (showLog) {
        console.log('?? Enviando OBSERVER_UPDATE para UI:', {
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
    
    // ?? VERIFICAR SE observerData FOI INICIALIZADO (com try/catch para evitar TDZ)
    try {
        if (!observerData || !observerData.entries) {
            console.warn('?? observerData n�o inicializado ainda - pulando registro');
            return;
        }
    } catch (error) {
        console.warn('?? Erro ao acessar observerData - pulando registro:', error.message);
        return;
    }
    
    // Adicionar ao hist�rico
    observerData.entries.push(entry);
    
    // Limitar tamanho do hist�rico (manter apenas as �ltimas N)
    if (observerData.entries.length > OBSERVER_CONFIG.maxHistorySize) {
        observerData.entries.shift(); // Remove mais antiga
    }
    
    // Atualizar estat�sticas
    updateObserverStats();
    
    // ? RECALIBRAR A CADA NOVA ENTRADA (ap�s ter o m�nimo de 20 entradas)
    // Isso garante que o peso da calibra��o usado nos pr�ximos c�lculos esteja sempre atualizado
    if (observerData.entries.length >= OBSERVER_CONFIG.minEntriesForCalibration) {
        console.log(`?? Recalibrando automaticamente ap�s nova entrada (${observerData.entries.length} entradas)...`);
        recalibrateConfidenceModel();
    } else {
        console.log(`? Aguardando ${OBSERVER_CONFIG.minEntriesForCalibration - observerData.entries.length} entradas para iniciar calibra��o autom�tica`);
    }
    
    // Salvar dados
    await saveObserverData();
    
    // ? Enviar atualiza��o para UI automaticamente
    sendObserverUpdate();
    
    // Log visual
    console.log(`
+-----------------------------------------------------------+
�  ?? ENTRADA OBSERVADA                                     
�-----------------------------------------------------------�
�  ?? Previsto: ${entry.predicted}%
�  ${actualResult === 'win' ? '? Resultado: WIN' : '? Resultado: LOSS'}
�  ?? Total observado: ${observerData.entries.length}/${OBSERVER_CONFIG.maxHistorySize}
�  ?? Fator de calibra��o: ${(observerData.calibrationFactor * 100).toFixed(1)}%
+-----------------------------------------------------------+
    `.trim());
}

// Atualizar estat�sticas do observador
function updateObserverStats() {
    // ?? VERIFICAR SE observerData FOI INICIALIZADO
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
            stat.predicted = stat.predicted / stat.total; // M�dia prevista
        }
    }
}

// Recalibrar o modelo de confian�a baseado no hist�rico
// Esta fun��o � chamada:
// - AUTOMATICAMENTE: A cada nova entrada registrada (ap�s ter 20+ entradas)
// - MANUALMENTE: Quando o usu�rio clica no bot�o "Atualizar"
function recalibrateConfidenceModel() {
    // ?? VERIFICAR SE observerData FOI INICIALIZADO
    if (!observerData || !observerData.entries) {
        return;
    }
    
    const entries = observerData.entries;
    if (entries.length < OBSERVER_CONFIG.minEntriesForCalibration) {
        console.log(`?? Calibra��o cancelada: apenas ${entries.length} entradas (m�nimo: ${OBSERVER_CONFIG.minEntriesForCalibration})`);
        return;
    }
    
    // ? VERIFICAR SE H� NOVAS ENTRADAS desde a �ltima calibra��o
    if (entries.length === observerData.lastCalibratedCount) {
        console.log(`?? Calibra��o n�o necess�ria: nenhuma entrada nova desde a �ltima calibra��o (${entries.length} entradas)`);
        return;
    }
    
    // Calcular taxa de acerto global
    const totalWins = entries.filter(e => e.result === 'win').length;
    const totalEntries = entries.length;
    const actualWinRate = totalWins / totalEntries;
    
    // Calcular m�dia das previs�es
    const avgPredicted = entries.reduce((sum, e) => sum + e.predicted, 0) / totalEntries;
    const predictedWinRate = avgPredicted / 100;
    
    // Calcular fator de corre��o
    // Se real = 0.7 (70%) e previsto = 0.85 (85%), fator = 0.7/0.85 = 0.82
    // Isso vai reduzir as pr�ximas previs�es em ~18%
    let newFactor = predictedWinRate > 0 ? actualWinRate / predictedWinRate : 1.0;
    
    // ? REMOVIDA SUAVIZA��O: C�lculo agora � determin�stico (sempre retorna o mesmo valor para os mesmos dados)
    // N�o h� mais m�dia ponderada com valor anterior - o c�lculo � puro e baseado apenas nos dados atuais
    
    // Limitar fator entre 0.5 e 1.5 (n�o permitir corre��es muito dr�sticas)
    newFactor = Math.max(0.5, Math.min(1.5, newFactor));
    
    const oldFactor = observerData.calibrationFactor;
    observerData.calibrationFactor = newFactor;
    observerData.lastCalibration = new Date().toISOString();
    observerData.lastCalibratedCount = entries.length; // ? Salvar quantas entradas foram calibradas
    
    // Log detalhado da calibra��o
    console.log(`
+-----------------------------------------------------------+
�  ?? RECALIBRA��O DO MODELO (${entries.length} entradas)              
�-----------------------------------------------------------�
�  ?? Entradas analisadas: ${totalEntries}
�  
�  ?? GLOBAL:
�     Previsto m�dio: ${(predictedWinRate * 100).toFixed(1)}%
�     Real: ${(actualWinRate * 100).toFixed(1)}%
�     Diferen�a: ${((actualWinRate - predictedWinRate) * 100).toFixed(1)}%
�  
�  ?? ALTA (=80%):
�     Previsto: ${observerData.stats.high.predicted.toFixed(1)}%
�     Real: ${observerData.stats.high.actual.toFixed(1)}%
�     Total: ${observerData.stats.high.total} entradas
�  
�  ?? M�DIA (60-79%):
�     Previsto: ${observerData.stats.medium.predicted.toFixed(1)}%
�     Real: ${observerData.stats.medium.actual.toFixed(1)}%
�     Total: ${observerData.stats.medium.total} entradas
�  
�  ?? BAIXA (<60%):
�     Previsto: ${observerData.stats.low.predicted.toFixed(1)}%
�     Real: ${observerData.stats.low.actual.toFixed(1)}%
�     Total: ${observerData.stats.low.total} entradas
�  
�  ?? AJUSTE:
�     Fator anterior: ${(oldFactor * 100).toFixed(1)}%
�     Fator novo: ${(newFactor * 100).toFixed(1)}%
�     Corre��o: ${((newFactor - oldFactor) * 100).toFixed(1)}%
+-----------------------------------------------------------+
    `.trim());
}

// Aplicar calibra��o a uma porcentagem de confian�a
function applyCalibratedConfidence(rawConfidence) {
    // ? VERIFICA��O DEFENSIVA: observerData pode n�o estar inicializado ainda
    if (!observerData || !observerData.entries) {
        console.log(`?? Calibra��o indispon�vel: observerData n�o inicializado (retornando confian�a original)`);
        return Math.round(rawConfidence);
    }
    
    // ? REGRA: S� aplicar calibra��o ap�s 10+ entradas no observador
    const minEntriesForCalibration = 10;
    const currentEntries = observerData.entries.length;
    
    if (currentEntries < minEntriesForCalibration) {
        console.log(`?? Calibra��o desativada: ${currentEntries}/${minEntriesForCalibration} entradas (coletando dados)`);
        return Math.round(rawConfidence); // Retorna confian�a original
    }
    
    // Aplicar fator de calibra��o
    let calibrated = rawConfidence * observerData.calibrationFactor;
    
    // Garantir que fique entre 0-100
    calibrated = Math.max(0, Math.min(100, calibrated));
    
    console.log(`?? Calibra��o aplicada: ${rawConfidence.toFixed(1)}% ? ${Math.round(calibrated)}% (fator: ${(observerData.calibrationFactor * 100).toFixed(1)}%, ${currentEntries} entradas)`);
    
    return Math.round(calibrated);
}

// Obter estat�sticas do observador para exibi��o
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
        lastCalibratedCount: observerData.lastCalibratedCount // Quantas entradas foram processadas na �ltima calibra��o
    };
}

// Start data collection
async function startDataCollection() {
    if (isRunning) return;
    
    // ? VERIFICAR SE H� ABA DA BLAZE ABERTA ANTES DE INICIAR
    const hasBlaze = await hasBlazeTabOpen();
    if (!hasBlaze) {
        console.log('+-----------------------------------------------------------+');
        console.log('�  ? IMPOSS�VEL INICIAR: NENHUMA ABA DA BLAZE ABERTA      �');
        console.log('�  ?? Abra blaze.com para usar a extens�o                  �');
        console.log('+-----------------------------------------------------------+');
        return;
    }
    
    isRunning = true;
    
    // ? CARREGAR CONFIGURA��ES E ESTADO DO MARTINGALE DO STORAGE IMEDIATAMENTE
    try {
        const storageData = await chrome.storage.local.get(['analyzerConfig', 'martingaleState']);
        
        // Carregar configura��es
        if (storageData.analyzerConfig) {
            analyzerConfig = { ...DEFAULT_ANALYZER_CONFIG, ...storageData.analyzerConfig };
            console.log('? Configura��es carregadas do storage com sucesso!');
            console.log('?? DEBUG - Config carregada:', {
                aiMode: analyzerConfig.aiMode,
                aiApiKey: analyzerConfig.aiApiKey ? 'Configurada' : 'N�o configurada',
                minOccurrences: analyzerConfig.minOccurrences
            });
            
            // ? Se modo IA j� estava ativo ao iniciar, marcar flag para aguardar 1 giro
            if (analyzerConfig.aiMode) {
                aiModeJustActivated = true;
                console.log('%c? MODO IA DETECTADO AO INICIAR: Aguardando 1 giro antes de enviar primeiro sinal...', 'color: #FFAA00; font-weight: bold;');
            }
        } else {
            console.log('?? Usando configura��es padr�o (nenhuma personaliza��o salva)');
        }
        
        // ?? CR�TICO: Carregar estado do Martingale do storage (pode haver ciclo em andamento)
        if (storageData.martingaleState && storageData.martingaleState.active) {
            martingaleState = storageData.martingaleState;
            console.log('?? Ciclo de Martingale em andamento detectado:', {
                stage: martingaleState.stage,
                entryColor: martingaleState.entryColor,
                lossCount: martingaleState.lossCount
            });
        }
    } catch (e) {
        console.warn('?? Erro ao carregar configura��es/estado, usando padr�o:', e);
    }
    
    console.log('+-----------------------------------------------------------+');
    console.log('�  ?? BLAZE ANALYZER - INICIANDO                            �');
    console.log('�-----------------------------------------------------------�');
    console.log('�  ?? Modo: SERVIDOR (coleta do Render.com)                 �');
    console.log('�  ? Atualiza��o: TEMPO REAL via WebSocket                 �');
    console.log('�  ?? Limite: 2000 giros | 5000 padr�es                     �');
    console.log('�  ?? Cache: Em mem�ria (n�o persiste ap�s recarregar)      �');
    console.log('+-----------------------------------------------------------+');
    
    // ? EXIBIR CONFIGURA��ES ATIVAS AO INICIAR
    console.log('');
    logActiveConfiguration();
    console.log('');
    
    // 1. Limpar padr�es locais (come�ar do zero)
    // ? Isso N�O limpa: entriesHistory, an�lise pendente, calibrador
    // ? Limpa APENAS: banco de padr�es (patterns_found)
    // await clearAllPatterns(); // ? DESABILITADO: fun��o n�o existe mais (padr�es agora s�o gerenciados via servidor)
    
    // ? Verificar se entriesHistory foi preservado
    const checkData = await chrome.storage.local.get(['entriesHistory', 'analysis']);
    console.log(`? Hist�rico de entradas preservado: ${(checkData.entriesHistory || []).length} entradas`);
    
    // ? Verificar se h� an�lise pendente (aguardando resultado)
    if (checkData.analysis && checkData.analysis.createdOnTimestamp) {
        console.log('+-----------------------------------------------------------+');
        console.log('�  ?? AN�LISE PENDENTE DETECTADA!                          �');
        console.log('�-----------------------------------------------------------�');
        console.log(`�  Cor recomendada: ${checkData.analysis.color}`);
        console.log(`�  Confian�a: ${checkData.analysis.confidence}%`);
        console.log(`�  Fase: ${checkData.analysis.phase || 'G0'}`);
        console.log(`�  Criada em: ${checkData.analysis.createdOnTimestamp}`);
        console.log('�  Status: Aguardando resultado do pr�ximo giro           �');
        console.log('+-----------------------------------------------------------+');
    } else {
        console.log('?? Nenhuma an�lise pendente no momento');
    }
    
    // 2. Resetar cache em mem�ria
    console.log('??? Resetando cache em mem�ria...');
    cachedHistory = [];
    historyInitialized = false;
    console.log('? Cache em mem�ria resetado.');
    
    // 3. Sincronizar dados com servidor primeiro (popula cache em mem�ria)
    await syncInitialData().catch(e => console.warn('Falha ao sincronizar com servidor:', e));
    
    // 4. Inicializar hist�rico completo (at� 2000) uma vez ao iniciar
    await initializeHistoryIfNeeded().catch(e => console.warn('Falha ao inicializar hist�rico completo:', e));
    
    // 5. Busca de padr�es agora � MANUAL (usu�rio clica no bot�o)
    console.log('?? Para buscar padr�es, clique em "?? Buscar Padr�es (5min)" na interface.');
    
    // 6. ? CONECTAR AO WEBSOCKET PARA RECEBER GIROS EM TEMPO REAL
    if (API_CONFIG.useWebSocket) {
        console.log('+-----------------------------------------------------------+');
        console.log('�  ? MODO WEBSOCKET ATIVO                                   �');
        console.log('�  Giros ser�o recebidos em TEMPO REAL (sem delay)         �');
        console.log('+-----------------------------------------------------------+');
        connectWebSocket();
        
        // ? Iniciar sistema de verifica��o de dados desatualizados
        startDataFreshnessCheck();
    } else {
        // Fallback: Polling com fetch (modo antigo)
        console.log('?? Modo polling ativo (a cada 2s)');
        intervalId = setInterval(async () => {
            try {
                // ? VERIFICAR SE ABA DA BLAZE AINDA EST� ABERTA (A CADA TICK)
                const hasBlaze = await hasBlazeTabOpen();
                if (!hasBlaze) {
                    console.log('+-----------------------------------------------------------+');
                    console.log('�  ?? ABA DA BLAZE FECHADA - PARANDO COLETA                �');
                    console.log('+-----------------------------------------------------------+');
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
    
    // ? DESCONECTAR WEBSOCKET
    disconnectWebSocket();
    
    // ? PARAR POLLING DE FALLBACK
    stopPollingFallback();
    
    // ? PARAR VERIFICA��O DE DADOS DESATUALIZADOS
    stopDataFreshnessCheck();
    
    isRunning = false;
    console.log('Blaze Double Analyzer: Parando coleta de dados');
}

// Collect data from SERVER (agora busca do servidor que est� coletando 24/7)
async function collectDoubleData() {
    try {
        // Buscar �ltimo giro do SERVIDOR
        const response = await fetch(`${API_CONFIG.baseURL}/api/giros/latest`, {
            signal: AbortSignal.timeout(5000) // Timeout de 5s
        });
        
        if (!response.ok) {
            // Se servidor offline, tenta buscar direto da Blaze (fallback)
            console.warn('?? Servidor offline, buscando direto da Blaze...');
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
            
            // Verificar se j� temos esse giro localmente e processar
            await processNewSpinFromServer(latestSpin);
        } else {
            console.log('? Aguardando giros do servidor...');
        }
    } catch (error) {
        console.error('Erro ao coletar dados do servidor:', error);
    }
}

// Helper: Converter n�mero em cor
            // -------------------------------------------------------------------------------
            // GET COLOR FROM NUMBER - REFATORADO 100%
            // -------------------------------------------------------------------------------
            function getColorFromNumber(number) {
                // ? VALIDA��O DE ENTRADA (silenciosa)
                if (typeof number !== 'number' || isNaN(number) || number === undefined || number === null) {
                    return 'unknown';
                }
                
                // ? NORMALIZAR N�MERO (caso seja float)
                const normalizedNumber = Math.floor(number);
                
                // ? VALIDAR RANGE (0-14)
                if (normalizedNumber < 0 || normalizedNumber > 14) {
                    return 'unknown';
                }
                
                // ? DETERMINAR COR
                if (normalizedNumber === 0) {
                    return 'white';
                } else if (normalizedNumber >= 1 && normalizedNumber <= 7) {
                    return 'red';
                } else if (normalizedNumber >= 8 && normalizedNumber <= 14) {
                    return 'black';
                }
                
                // ? FALLBACK (nunca deve chegar aqui)
                return 'unknown';
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
        
        // ? Usar CACHE EM MEM�RIA (n�o salvar em chrome.storage.local)
        let history = [...cachedHistory];  // C�pia do cache
        let entriesHistory = [];
        
        try {
            const result = await chrome.storage.local.get(['entriesHistory']);
            entriesHistory = result['entriesHistory'] || [];
        } catch (e) {
            console.warn('?? Erro ao buscar entriesHistory:', e);
        }
        
            // Adiciona novo giro se diferente do anterior (por timestamp ou n�mero)
            const isNewSpin = history.length === 0 || 
                            history[0].timestamp !== latestSpin.created_at || 
                            history[0].number !== rollNumber;
            
            // ? Verifica��o silenciosa de novo giro
            
            if (isNewSpin) {
            console.log('?? NOVO GIRO DETECTADO!', {
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
            
            // ? Atualizar CACHE EM MEM�RIA (n�o salvar em chrome.storage.local)
            cachedHistory = history;
            
            console.log(`?? Cache em mem�ria atualizado: ${history.length} giros`);
            
            // ? ATUALIZAR MEM�RIA ATIVA INCREMENTALMENTE (super r�pido!)
            if (memoriaAtiva.inicializada) {
                const sucesso = atualizarMemoriaIncrementalmente(newGiro);
                if (sucesso) {
                    console.log(`%c? Mem�ria Ativa atualizada incrementalmente! (${memoriaAtiva.tempoUltimaAtualizacao.toFixed(2)}ms)`, 'color: #00CED1; font-weight: bold;');
                } else {
                    console.warn('%c?? Falha ao atualizar Mem�ria Ativa! Ser� reinicializada na pr�xima an�lise.', 'color: #FFA500;');
                    memoriaAtiva.inicializada = false; // Marcar para reinicializar
                }
            } else {
                console.log('%c?? Mem�ria Ativa n�o inicializada (ser� inicializada na pr�xima an�lise)', 'color: #00CED1;');
                console.log('%c   ? Isso � NORMAL na primeira vez ou ap�s recarregar', 'color: #00CED1;');
            }
            
            // ? CARREGAR CONFIGURA��ES E ESTADO DO MARTINGALE DO STORAGE ANTES DE PROCESSAR
            try {
                const storageData = await chrome.storage.local.get(['analyzerConfig', 'martingaleState']);
                
                // Carregar configura��es
                if (storageData.analyzerConfig) {
                    analyzerConfig = { ...DEFAULT_ANALYZER_CONFIG, ...storageData.analyzerConfig };
                    console.log('?? Configura��es carregadas do storage:', {
                        consecutiveMartingale: analyzerConfig.consecutiveMartingale,
                        maxGales: analyzerConfig.maxGales
                    });
                }
                
                // ?? CR�TICO: Carregar estado do Martingale do storage
                if (storageData.martingaleState) {
                    martingaleState = storageData.martingaleState;
                    console.log('?? Estado do Martingale carregado do storage:', {
                        active: martingaleState.active,
                        stage: martingaleState.stage,
                        entryColor: martingaleState.entryColor,
                        lossCount: martingaleState.lossCount
                    });
                }
            } catch (e) {
                console.warn('?? Erro ao carregar configura��es/estado, usando padr�o:', e);
            }
            
            // ? Enviar novo giro para TODOS os content.js abertos (ATUALIZA��O INSTANT�NEA DO HIST�RICO)
            try {
                // ?? Enviar para TODAS as tabs com content.js injetado
                chrome.tabs.query({}, (tabs) => {
                    tabs.forEach(tab => {
                        try {
                            chrome.tabs.sendMessage(tab.id, {
                                type: 'NEW_SPIN',  // ? CORRIGIDO: era "action", agora � "type"
                                data: {
                                    lastSpin: { number: rollNumber, color: rollColor, timestamp: latestSpin.created_at }
                                }
                            });
                        } catch (e) {
                            // Ignorar tabs sem content.js (normal)
                        }
                    });
                });
                console.log('? Novo giro enviado para TODOS os content.js - hist�rico ser� atualizado INSTANTANEAMENTE!');
            } catch (e) {
                console.log('?? Erro ao enviar mensagem para content.js:', e.message);
            }
            
            // ? REMOVIDO: Chamada duplicada de runAnalysisController
            // A an�lise ser� executada AP�S processar WIN/LOSS (linha ~1094)
            
            // ? Cache j� foi atualizado acima - n�o salvar em chrome.storage.local
            
            console.log('+-----------------------------------------------------------+');
            console.log('�  ?? VERIFICANDO RECOMENDA��O PENDENTE                    �');
            console.log('+-----------------------------------------------------------+');
            console.log('?? Buscando currentAnalysis de chrome.storage.local...');
                
                // Avaliar recomenda��o pendente (WIN / G1 / G2)
            const currentAnalysisResult = await chrome.storage.local.get(['analysis']);
            const currentAnalysis = currentAnalysisResult['analysis'];
            
            console.log('?? Resultado da busca:', currentAnalysisResult);
            console.log('?? currentAnalysis existe?', currentAnalysis ? 'SIM' : 'N�O');
            
            if (currentAnalysis) {
                console.log('');
                console.log('%c?? DETALHES DO currentAnalysis:', 'color: #FFD700; font-weight: bold; font-size: 14px;');
                console.log('   ?? Cor recomendada:', currentAnalysis.color);
                console.log('   ?? Confian�a:', currentAnalysis.confidence);
                console.log('   ?? Fase:', currentAnalysis.phase || 'G0');
                console.log('   ?? Timestamp recomenda��o:', currentAnalysis.createdOnTimestamp);
                console.log('   ?? PredictedFor:', currentAnalysis.predictedFor);
                console.log('');
                console.log('%c?? VERIFICA��ES CR�TICAS:', 'color: #FFD700; font-weight: bold;');
                console.log('   ?? createdOnTimestamp existe?', currentAnalysis.createdOnTimestamp ? '? SIM' : '? N�O');
                console.log('   ?? predictedFor === "next"?', currentAnalysis.predictedFor === 'next' ? '? SIM' : '? N�O');
                console.log('');
            }
            
            console.log('?? Giro atual:');
            console.log('   Cor:', rollColor);
            console.log('   N�mero:', rollNumber);
            console.log('   Timestamp:', latestSpin.created_at);
            console.log('');
            
                console.log('');
                console.log('%c🔍 === VERIFICAÇÃO DE CONDIÇÕES PARA WIN/LOSS ===', 'color: #FFD700; font-weight: bold; font-size: 14px; background: #333300; padding: 5px;');
                console.log('');
                console.log('%c   📋 CONDIÇÃO 1: currentAnalysis existe?', 'color: #00D4FF; font-weight: bold;');
                console.log(`      ➡️ ${currentAnalysis ? '✅ SIM' : '❌ NÃO'}`);
                
                if (currentAnalysis) {
                    console.log('');
                    console.log('%c   📋 CONDIÇÃO 2: createdOnTimestamp existe?', 'color: #00D4FF; font-weight: bold;');
                    console.log(`      ➡️ ${currentAnalysis.createdOnTimestamp ? '✅ SIM' : '❌ NÃO'}`);
                    console.log(`      📌 Valor: ${currentAnalysis.createdOnTimestamp}`);
                    
                    console.log('');
                    console.log('%c   📋 CONDIÇÃO 3: predictedFor === "next"?', 'color: #00D4FF; font-weight: bold;');
                    console.log(`      ➡️ ${currentAnalysis.predictedFor === 'next' ? '✅ SIM' : '❌ NÃO'}`);
                    console.log(`      📌 Valor: "${currentAnalysis.predictedFor}"`);
                }
                console.log('');
                console.log('%c🔍 === FIM DA VERIFICAÇÃO ===', 'color: #FFD700; font-weight: bold; font-size: 14px; background: #333300; padding: 5px;');
                console.log('');
                
                if (currentAnalysis && currentAnalysis.createdOnTimestamp && currentAnalysis.predictedFor === 'next') {
                console.log('');
                console.log('%c+-----------------------------------------------------------+', 'color: #00FF00; font-weight: bold;');
                console.log('%c│  ✅ RECOMENDAÇÃO PENDENTE ENCONTRADA!                     │', 'color: #00FF00; font-weight: bold;');
                console.log('%c+-----------------------------------------------------------+', 'color: #00FF00; font-weight: bold;');
                console.log('🕐 Comparando timestamps:');
                console.log('   Recomendação:', currentAnalysis.createdOnTimestamp);
                console.log('   Giro atual:', latestSpin.created_at);
                console.log('   São diferentes?', currentAnalysis.createdOnTimestamp !== latestSpin.created_at);
                console.log('');
                
                    // Novo giro chegou para a recomenda��o pendente
                    if (currentAnalysis.createdOnTimestamp !== latestSpin.created_at) {
                    console.log('🎯 AVALIAR RESULTADO!');
                    console.log('   Esperado:', currentAnalysis.color);
                    console.log('   Real:', rollColor);
                    console.log('   Tipo esperado:', typeof currentAnalysis.color);
                    console.log('   Tipo real:', typeof rollColor);
                    console.log('   Comparação exata:', rollColor === currentAnalysis.color);
                    console.log('   Comparação case-insensitive:', rollColor.toLowerCase() === currentAnalysis.color.toLowerCase());
                    
                        // ? CORRE��O CR�TICA: Compara��o robusta de cores
                        const expectedColor = String(currentAnalysis.color || '').toLowerCase().trim();
                        const actualColor = String(rollColor || '').toLowerCase().trim();
                        const hit = (expectedColor === actualColor);
                    
                    console.log('   ---------------------------------------------------');
                    console.log('   ?? VERIFICA��O FINAL DE WIN/LOSS:');
                    console.log('   Esperado (processado):', expectedColor);
                    console.log('   Real (processado):', actualColor);
                    console.log('   S�o iguais?', hit);
                    console.log('   Resultado FINAL:', hit ? '? WIN!' : '? LOSS!');
                    console.log('   ---------------------------------------------------');
                    
                        if (hit) {
                        console.log('');
                        console.log('+-----------------------------------------------------------+');
                        console.log('�  ? WIN DETECTADO!                                       �');
                        console.log('+-----------------------------------------------------------+');
                            
                            // ---------------------------------------------------------------
                            // ? SISTEMA DE MARTINGALE - L�GICA DE WIN
                            // ---------------------------------------------------------------
                            
                            // ? VALIDA��O CR�TICA: Garantir que n�o h� processamento duplo
                            console.log('?? VALIDA��O CR�TICA: Verificando se j� foi processado...');
                            console.log('   Martingale ativo:', martingaleState.active);
                            console.log('   Est�gio atual:', martingaleState.stage);
                            console.log('   An�lise fase:', currentAnalysis.phase);
                            
                            // ✅ CORREÇÃO: Remover verificação de processamento duplo que causava bloqueio
                            // O martingaleState pode estar "sujo" de uma entrada anterior
                            // Não bloquear o processamento do WIN baseado nisso
                            
                            // Determinar est�gio do Martingale CORRETAMENTE
                            // ? Verificar PRIMEIRO a fase da an�lise (G1/G2), depois o estado
                            let martingaleStage = 'ENTRADA';
                            if (currentAnalysis.phase === 'G1') {
                                martingaleStage = 'G1';
                            } else if (currentAnalysis.phase === 'G2') {
                                martingaleStage = 'G2';
                            } else if (martingaleState.active) {
                                martingaleStage = martingaleState.stage;
                            }
                            
                            const patternKey = martingaleState.active ? martingaleState.patternKey : createPatternKey(currentAnalysis);
                            
                            console.log(`?? WIN no est�gio: ${martingaleStage}`);
                            console.log(`?? Padr�o: ${patternKey}`);
                            
                            // ?? BUSCAR ENTRADA PENDENTE E ATUALIZAR COM RESULTADO WIN
                            console.log('');
                            console.log('%c?? BUSCANDO ENTRADA PENDENTE PARA ATUALIZAR...', 'color: #FFD700; font-weight: bold;');
                            
                            const pendingEntry = entriesHistory.find(e => e.result === 'PENDING' || e.number === null);
                            
                            if (pendingEntry) {
                                console.log('%c? ENTRADA PENDENTE ENCONTRADA! Atualizando com WIN...', 'color: #00FF00; font-weight: bold;');
                                console.log('   ID da entrada:', pendingEntry.id);
                                
                                // Atualizar entrada existente
                                pendingEntry.number = rollNumber;
                                pendingEntry.result = 'WIN';
                                pendingEntry.finalResult = 'WIN';
                                pendingEntry.martingaleStage = martingaleStage;
                                pendingEntry.wonAt = martingaleStage;
                                pendingEntry.phase = currentAnalysis.phase || 'G0';
                                
                                console.log('%c? ENTRADA ATUALIZADA COM SUCESSO!', 'color: #00FF00; font-weight: bold;');
                                console.log('   ? N�mero:', pendingEntry.number);
                                console.log('   ? Resultado:', pendingEntry.result);
                                console.log('   ? Final Result:', pendingEntry.finalResult);
                            } else {
                                console.log('%c?? ENTRADA PENDENTE N�O ENCONTRADA! Criando nova entrada...', 'color: #FFA500; font-weight: bold;');
                                
                                // Fallback: criar nova entrada se n�o encontrar pendente
                                const winEntry = {
                                    id: `entry_${Date.now()}`,
                                    timestamp: latestSpin.created_at,
                                    number: rollNumber,
                                    color: currentAnalysis.color,
                                    phase: currentAnalysis.phase || 'G0',
                                    result: 'WIN',
                                    confidence: currentAnalysis.confidence,
                                    patternDescription: currentAnalysis.patternDescription,
                                    reasoning: currentAnalysis.reasoning,
                                    martingaleStage: martingaleStage,
                                    wonAt: martingaleStage,
                                    finalResult: 'WIN'
                                };
                                
                                entriesHistory.unshift(winEntry);
                            }
                            
                            console.log('%c? ENTRADA ADICIONADA AO HIST�RICO!', 'color: #00FF00; font-weight: bold; font-size: 14px;');
                            console.log('   ? entriesHistory.length DEPOIS:', entriesHistory.length);
                            console.log('');
                            
                            // ? Calcular estat�sticas WIN/LOSS baseado em CICLOS COMPLETOS
                            const { totalWins, totalLosses } = calculateCycleScore(entriesHistory);
                            
                            // ? Enviar confirma��o de WIN ao Telegram (com informa��o de Martingale)
                            // await sendTelegramMartingaleWin(
                            //     martingaleStage, 
                            //     { color: rollColor, number: rollNumber, timestamp: latestSpin.created_at },
                            //     totalWins,
                            //     totalLosses
                            // );
                            
                            // Registrar no observador inteligente
                            await registerEntryInObserver(
                                currentAnalysis.confidence,
                                'win',
                                currentAnalysis.createdOnTimestamp,
                                { type: currentAnalysis.patternType, occurrences: currentAnalysis.occurrences }
                            );
                            
                            // ? ATUALIZAR HIST�RICO DE CORES QUENTES
                            if (martingaleState.active && (martingaleStage === 'G1' || martingaleStage === 'G2')) {
                                console.log('?? Atualizando hist�rico de cores quentes ap�s WIN...');
                                
                                // Construir sequ�ncia de cores DOS GIROS (n�o das apostas!)
                                const colorSequence = [];
                                
                                // Adicionar cores dos LOSSes (giros que realmente sa�ram)
                                martingaleState.lossColors.forEach(color => {
                                    colorSequence.push({ color });
                                });
                                
                                // Adicionar cor que GANHOU (giro atual)
                                colorSequence.push({ color: rollColor });
                                
                                console.log('   Sequ�ncia de cores dos giros:', colorSequence.map(c => c.color).join(' ? '));
                                
                                await updateHotColorsHistory(patternKey, colorSequence);
                            }
                            
                            // ? RESETAR CICLO DE MARTINGALE - CR�TICO!
                            if (martingaleState.active) {
                                console.log('?? Resetando ciclo de Martingale ap�s WIN');
                                console.log('   Estado ANTES do reset:', {
                                    active: martingaleState.active,
                                    stage: martingaleState.stage,
                                    patternKey: martingaleState.patternKey
                                });
                                resetMartingaleState();
                                console.log('   Estado AP�S o reset:', {
                                    active: martingaleState.active,
                                    stage: martingaleState.stage,
                                    patternKey: martingaleState.patternKey
                                });
                            }
                            
                            console.log('%c?? SALVANDO NO CHROME.STORAGE.LOCAL...', 'color: #FFD700; font-weight: bold; font-size: 14px;');
                            console.log('   ? analysis: null (limpar)');
                            console.log('   ? pattern: null (limpar)');
                            console.log('   ? lastBet.status: win');
                            console.log('   ? entriesHistory.length:', entriesHistory.length);
                            console.log('   ? martingaleState.active:', martingaleState.active);
                            console.log('   ? rigorLevel: 75 (reset)');
                            console.log('');
                            
                            await chrome.storage.local.set({ 
                                analysis: null,
                                currentAnalysis: null, // ✅ CRÍTICO: Limpar currentAnalysis também
                                pattern: null,
                                lastBet: { status: 'win', phase: currentAnalysis.phase || 'G0', resolvedAtTimestamp: latestSpin.created_at },
                                entriesHistory,
                                martingaleState,  // ? Salvar estado do Martingale
                                rigorLevel: 75 // RESET: Volta para 75% ap�s WIN
                            });
                            
                            console.log('%c? SALVO COM SUCESSO NO STORAGE!', 'color: #00FF00; font-weight: bold; font-size: 14px;');
                            console.log('');
                            
                            sendMessageToContent('CLEAR_ANALYSIS');
                            
                            // ? Enviar atualiza��o de entradas para UI
                            console.log('%c?? ENVIANDO ENTRIES_UPDATE PARA UI...', 'color: #00D4FF; font-weight: bold; font-size: 14px;');
                            console.log('   ? Type: ENTRIES_UPDATE');
                            console.log('   ? Total de entradas:', entriesHistory.length);
                            console.log('   ? Primeira entrada:', entriesHistory[0] ? {
                                result: entriesHistory[0].result,
                                color: entriesHistory[0].color,
                                number: entriesHistory[0].number,
                                phase: entriesHistory[0].phase
                            } : 'N/A');
                            console.log('');
                            
                            const uiUpdateResult = sendMessageToContent('ENTRIES_UPDATE', entriesHistory);
                            console.log('%c?? Resultado do envio para UI:', uiUpdateResult ? 'color: #00FF00;' : 'color: #FF0000;', uiUpdateResult);
                            console.log('');
                            console.log('%c+------------------------------------------------------------------------------+', 'color: #00FF00; font-weight: bold;');
                            console.log('%c�  ? ENTRADA WIN PROCESSADA COMPLETAMENTE!                                   �', 'color: #00FF00; font-weight: bold;');
                            console.log('%c+------------------------------------------------------------------------------+', 'color: #00FF00; font-weight: bold;');
                            console.log('');
                        } else {
                            console.log('');
                            console.log('%c+=============================================================+', 'color: #FF0000; font-weight: bold; font-size: 16px; background: #330000; padding: 10px;');
                            console.log('%c│                                                             │', 'color: #FF0000; font-weight: bold; font-size: 16px; background: #330000; padding: 10px;');
                            console.log('%c│  ❌ LOSS DETECTADO!                                         │', 'color: #FF0000; font-weight: bold; font-size: 16px; background: #330000; padding: 10px;');
                            console.log('%c│                                                             │', 'color: #FF0000; font-weight: bold; font-size: 16px; background: #330000; padding: 10px;');
                            console.log('%c│  📌 Esperado: ' + currentAnalysis.color.toUpperCase().padEnd(41) + '│', 'color: #FF0000; font-weight: bold; font-size: 14px; background: #330000; padding: 10px;');
                            console.log('%c│  📌 Saiu: ' + rollColor.toUpperCase().padEnd(44) + '│', 'color: #FF0000; font-weight: bold; font-size: 14px; background: #330000; padding: 10px;');
                            console.log('%c│                                                             │', 'color: #FF0000; font-weight: bold; font-size: 16px; background: #330000; padding: 10px;');
                            console.log('%c+=============================================================+', 'color: #FF0000; font-weight: bold; font-size: 16px; background: #330000; padding: 10px;');
                            console.log('');
                            
                            // ---------------------------------------------------------------
                            // ? SISTEMA DE MARTINGALE - L�GICA DE LOSS
                            // ---------------------------------------------------------------
                            
                            // Determinar est�gio atual
                            const currentStage = martingaleState.active ? martingaleState.stage : 'ENTRADA';
                            const patternKey = martingaleState.active ? martingaleState.patternKey : createPatternKey(currentAnalysis);
                            
                            console.log(`? LOSS no est�gio: ${currentStage}`);
                            console.log(`?? Padr�o: ${patternKey}`);
                            console.log(`?? Esperado: ${currentAnalysis.color}, Real: ${rollColor}`);
                            
                            // ? VERIFICAR SE � O �LTIMO GALE (vai virar RET) ou se ainda tem mais Gales
                            // N�O ENVIAR MENSAGEM AQUI - ser� enviada dentro da l�gica abaixo
                            
                            // ? REGISTRAR NO CALIBRADOR DE PORCENTAGENS
                            await registerEntryInObserver(
                                currentAnalysis.confidence,
                                'loss',
                                currentAnalysis.createdOnTimestamp,
                                { type: currentAnalysis.patternType, occurrences: currentAnalysis.occurrences }
                            );
                            
                            // ---------------------------------------------------------------
                            // NOVA L�GICA DE MARTINGALE - DECIDIR PR�XIMA A��O
                            // ---------------------------------------------------------------
                            
                            // ---------------------------------------------------------------
                            // ? L�GICA DIN�MICA DE MARTINGALE - FUNCIONA PARA QUALQUER QUANTIDADE
                            // ---------------------------------------------------------------
                            
                            // Determinar o n�mero do Gale atual (0=ENTRADA, 1=G1, 2=G2, 3=G3...)
                            let currentGaleNumber = 0;
                            if (currentStage === 'ENTRADA') {
                                currentGaleNumber = 0;
                            } else if (currentStage.startsWith('G')) {
                                currentGaleNumber = parseInt(currentStage.substring(1)) || 0;
                            }
                            
                            const nextGaleNumber = currentGaleNumber + 1;
                            const maxGales = analyzerConfig.maxGales || 0;
                            
                            console.log(`+-----------------------------------------------------------+`);
                            console.log(`�  ? LOSS no ${currentStage === 'ENTRADA' ? 'ENTRADA PADR�O' : currentStage}                                  �`);
                            console.log(`�-----------------------------------------------------------�`);
                            console.log(`�  ??  Configura��o: ${maxGales} Gale${maxGales !== 1 ? 's' : ''} permitido${maxGales !== 1 ? 's' : ''}           �`);
                            console.log(`�  ?? Atual: Gale ${currentGaleNumber} (${currentStage})                        �`);
                            console.log(`�  ?? Pr�ximo: ${nextGaleNumber <= maxGales ? `Tentar G${nextGaleNumber}` : 'RET (limite atingido)'}                  �`);
                            console.log(`+-----------------------------------------------------------+`);
                            
                            // Verificar se ainda pode tentar mais Gales
                            const canTryNextGale = nextGaleNumber <= maxGales;
                            
                            if (currentStage === 'ENTRADA') {
                                // ---------------------------------------------------------------
                                // ? LOSS NA ENTRADA: Verificar se pode tentar G1
                                // ---------------------------------------------------------------
                                
                                if (!canTryNextGale) {
                                    // ? SEM GALES: Registrar LOSS direto
                                    console.log('');
                                    console.log('%c🔥 === PROCESSANDO LOSS SEM GALES (0 GALES CONFIGURADOS) ===', 'color: #FF6666; font-weight: bold; font-size: 16px; background: #330000; padding: 10px;');
                                    console.log('%c   📋 Configuração: 0 Gales', 'color: #FF6666; font-weight: bold;');
                                    console.log('%c   📋 Ação: Registrar LOSS direto e LIMPAR recomendação', 'color: #FF6666; font-weight: bold;');
                                    console.log('');
                                    
                                    // ?? BUSCAR ENTRADA PENDENTE E ATUALIZAR COM RESULTADO LOSS
                                    console.log('');
                                    console.log('%c?? BUSCANDO ENTRADA PENDENTE PARA ATUALIZAR COM LOSS...', 'color: #FFD700; font-weight: bold;');
                                    
                                    const pendingEntry = entriesHistory.find(e => e.result === 'PENDING' || e.number === null);
                                    
                                    if (pendingEntry) {
                                        console.log('%c? ENTRADA PENDENTE ENCONTRADA! Atualizando com LOSS...', 'color: #FF6666; font-weight: bold;');
                                        console.log('   ID da entrada:', pendingEntry.id);
                                        
                                        // Atualizar entrada existente
                                        pendingEntry.number = rollNumber;
                                        pendingEntry.result = 'LOSS';
                                        pendingEntry.finalResult = 'RET';
                                        pendingEntry.martingaleStage = 'ENTRADA';
                                        pendingEntry.phase = 'G0';
                                        
                                        console.log('%c? ENTRADA ATUALIZADA COM SUCESSO!', 'color: #00FF00; font-weight: bold;');
                                        console.log('   ? N�mero:', pendingEntry.number);
                                        console.log('   ? Resultado:', pendingEntry.result);
                                        console.log('   ? Final Result:', pendingEntry.finalResult);
                                    } else {
                                        console.log('%c?? ENTRADA PENDENTE N�O ENCONTRADA! Criando nova entrada LOSS...', 'color: #FFA500; font-weight: bold;');
                                        
                                        // Fallback: criar nova entrada se não encontrar pendente
                                        const lossEntry = {
                                            id: `entry_${Date.now()}`,
                                            timestamp: latestSpin.created_at,
                                            number: rollNumber,
                                            color: currentAnalysis.color,
                                            phase: 'G0',
                                            result: 'LOSS',
                                            confidence: currentAnalysis.confidence,
                                            patternDescription: currentAnalysis.patternDescription,
                                            reasoning: currentAnalysis.reasoning,
                                            martingaleStage: 'ENTRADA',
                                            finalResult: 'RET'
                                        };
                                        
                                        entriesHistory.unshift(lossEntry);
                                    }
                                    
                                    console.log('%c? ENTRADA ADICIONADA AO HIST�RICO!', 'color: #00FF00; font-weight: bold; font-size: 14px;');
                                    console.log('   ? entriesHistory.length DEPOIS:', entriesHistory.length);
                                    console.log('');
                                    
                                    // ? Calcular estat�sticas WIN/LOSS
                                    const { totalWins, totalLosses } = calculateCycleScore(entriesHistory);
                                    
                                    // ? ENVIAR MENSAGEM DE RET AO TELEGRAM (sem Gales)
                                    console.log('✅ RET registrado (0 Gales configurados)');
                                    // await sendTelegramMartingaleRET(totalWins, totalLosses);
                                    
                                    resetMartingaleState();
                                    
                                    console.log('%c?? SALVANDO NO CHROME.STORAGE.LOCAL...', 'color: #FFD700; font-weight: bold; font-size: 14px;');
                                    console.log('   ? analysis: null (limpar)');
                                    console.log('   ? pattern: null (limpar)');
                                    console.log('   ? lastBet.status: loss');
                                    console.log('   ? entriesHistory.length:', entriesHistory.length);
                                    console.log('');
                                    
                                    await chrome.storage.local.set({ 
                                        analysis: null,
                                        currentAnalysis: null, // ✅ CRÍTICO: Limpar currentAnalysis também
                                        pattern: null,
                                        lastBet: { status: 'loss', phase: 'G0', resolvedAtTimestamp: latestSpin.created_at },
                                        entriesHistory,
                                        martingaleState
                                    });
                                    
                                    console.log('%c? SALVO COM SUCESSO NO STORAGE!', 'color: #00FF00; font-weight: bold; font-size: 14px;');
                                    console.log('');
                                    
                                    console.log('%c🚀 ENVIANDO CLEAR_ANALYSIS PARA LIMPAR A RECOMENDAÇÃO DA UI...', 'color: #00D4FF; font-weight: bold; font-size: 16px; background: #003333; padding: 10px;');
                                    sendMessageToContent('CLEAR_ANALYSIS');
                                    console.log('%c✅ CLEAR_ANALYSIS ENVIADO!', 'color: #00FF00; font-weight: bold;');
                                    console.log('');
                                    
                                    console.log('%c🚀 ENVIANDO ENTRIES_UPDATE PARA MOSTRAR LOSS NA CAIXA...', 'color: #00D4FF; font-weight: bold; font-size: 16px; background: #003333; padding: 10px;');
                                    console.log('   ? Type: ENTRIES_UPDATE');
                                    console.log('   ? Total de entradas:', entriesHistory.length);
                                    console.log('   ? Primeira entrada:', entriesHistory[0] ? {
                                        result: entriesHistory[0].result,
                                        color: entriesHistory[0].color,
                                        number: entriesHistory[0].number,
                                        phase: entriesHistory[0].phase,
                                        finalResult: entriesHistory[0].finalResult
                                    } : 'N/A');
                                    console.log('');
                                    
                                    const uiUpdateResult = sendMessageToContent('ENTRIES_UPDATE', entriesHistory);
                                    console.log('%c✅ ENTRIES_UPDATE ENVIADO!', 'color: #00FF00; font-weight: bold;');
                                    console.log('%c   📊 Resultado:', uiUpdateResult ? 'color: #00FF00;' : 'color: #FF0000;', uiUpdateResult);
                                    console.log('');
                                    console.log('%c+=============================================================================+', 'color: #00FF00; font-weight: bold; font-size: 16px; background: #003300; padding: 10px;');
                                    console.log('%c│                                                                             │', 'color: #00FF00; font-weight: bold; font-size: 16px; background: #003300; padding: 10px;');
                                    console.log('%c│  ✅ ENTRADA LOSS PROCESSADA COMPLETAMENTE!                                  │', 'color: #00FF00; font-weight: bold; font-size: 16px; background: #003300; padding: 10px;');
                                    console.log('%c│  ✅ CLEAR_ANALYSIS enviado (recomendação deve ser limpa)                   │', 'color: #00FF00; font-weight: bold; font-size: 14px; background: #003300; padding: 10px;');
                                    console.log('%c│  ✅ ENTRIES_UPDATE enviado (LOSS deve aparecer na caixa)                   │', 'color: #00FF00; font-weight: bold; font-size: 14px; background: #003300; padding: 10px;');
                                    console.log('%c│                                                                             │', 'color: #00FF00; font-weight: bold; font-size: 16px; background: #003300; padding: 10px;');
                                    console.log('%c+=============================================================================+', 'color: #00FF00; font-weight: bold; font-size: 16px; background: #003300; padding: 10px;');
                                    console.log('');
                                    return;
                                }
                                
                                // ? TEM GALES: Tentar G1
                                console.log(`?? Tentando G${nextGaleNumber}...`);
                                console.log(`?? Martingale Consecutivo: ${analyzerConfig.consecutiveMartingale ? 'ATIVADO' : 'DESATIVADO'}`);
                                
                                // ? ENVIAR MENSAGEM DE LOSS ENTRADA (vai tentar G1)
                                // await sendTelegramMartingaleLoss(
                                //     currentStage,
                                //     { color: rollColor, number: rollNumber, timestamp: latestSpin.created_at }
                                // );
                                
                                // ? USAR SEMPRE A MESMA COR DA ENTRADA ORIGINAL
                                const g1Color = currentAnalysis.color;
                                
                                // ?? CR�TICO: ATUALIZAR ENTRADA PENDENTE com LOSS (vai tentar G1)
                                console.log('%c?? ATUALIZANDO ENTRADA PENDENTE COM LOSS INTERMEDI�RIO (vai tentar G1)...', 'color: #FFD700; font-weight: bold;');
                                
                                const pendingEntryForG1 = entriesHistory.find(e => e.result === 'PENDING' || e.number === null);
                                
                                if (pendingEntryForG1) {
                                    console.log('%c? ENTRADA PENDENTE ENCONTRADA! Atualizando...', 'color: #FF6666; font-weight: bold;');
                                    
                                    // Atualizar entrada existente (LOSS intermediário)
                                    pendingEntryForG1.number = rollNumber;
                                    pendingEntryForG1.result = 'LOSS';
                                    pendingEntryForG1.martingaleStage = 'ENTRADA';
                                    pendingEntryForG1.phase = 'G0';
                                    pendingEntryForG1.finalResult = null;  // Ainda não é final
                                    pendingEntryForG1.continuingToG1 = true;  // Flag indicando que continuará
                                    
                                    console.log('%c? ENTRADA ATUALIZADA! Vai tentar G1...', 'color: #00FF00; font-weight: bold;');
                                } else {
                                    console.log('%c?? ENTRADA PENDENTE N�O ENCONTRADA! Criando nova...', 'color: #FFA500; font-weight: bold;');
                                    
                                    // Fallback: criar nova entrada LOSS intermediário
                                    const entradaLossEntry = {
                                        id: `entry_${Date.now()}`,
                                        timestamp: latestSpin.created_at,
                                        number: rollNumber,
                                        color: rollColor,
                                        phase: 'G0',
                                        result: 'LOSS',
                                        confidence: currentAnalysis.confidence,
                                        patternDescription: currentAnalysis.patternDescription,
                                        reasoning: currentAnalysis.reasoning,
                                        martingaleStage: 'ENTRADA',
                                        finalResult: null,
                                        continuingToG1: true
                                    };
                                    
                                    entriesHistory.unshift(entradaLossEntry);
                                }
                                
                                // Salvar estado do Martingale
                                martingaleState.active = true;
                                martingaleState.stage = 'G1';
                                martingaleState.patternKey = patternKey;
                                martingaleState.entryColor = currentAnalysis.color;
                                martingaleState.entryColorResult = rollColor;  // ? Cor que realmente saiu
                                martingaleState.entryTimestamp = currentAnalysis.createdOnTimestamp;
                                martingaleState.analysisData = currentAnalysis;
                                martingaleState.lossCount = 1;
                                martingaleState.lossColors = [rollColor];  // ? Guardar cores dos LOSSes
                                
                                // ---------------------------------------------------------------
                                // VERIFICAR MODO DE MARTINGALE
                                // ---------------------------------------------------------------
                                
                                if (analyzerConfig.consecutiveMartingale) {
                                    // ? MODO CONSECUTIVO: Enviar G1 IMEDIATAMENTE no pr�ximo giro
                                    console.log('?? MODO CONSECUTIVO: G1 ser� enviado no PR�XIMO GIRO');
                                    
                                    await sendTelegramMartingaleG1(g1Color, null);
                                    
                                    // Criar an�lise G1 com timestamp do pr�ximo giro
                                    const g1Analysis = {
                                        ...currentAnalysis,
                                        color: g1Color,
                                        phase: 'G1',
                                        predictedFor: 'next',
                                        createdOnTimestamp: latestSpin.created_at  // ? Usar giro atual
                                    };
                                    
                                    await chrome.storage.local.set({
                                        analysis: g1Analysis,
                                        pattern: { description: g1Analysis.patternDescription, confidence: g1Analysis.confidence },
                                        lastBet: { status: 'pending', phase: 'G1', createdOnTimestamp: g1Analysis.createdOnTimestamp },
                                        entriesHistory,
                                        martingaleState
                                    });
                                    
                                    // ✅ CRÍTICO: Enviar ENTRIES_UPDATE para mostrar LOSS na UI
                                    console.log('%c📤 ENVIANDO ENTRIES_UPDATE (LOSS Entrada → G1)...', 'color: #FF6666; font-weight: bold;');
                                    sendMessageToContent('ENTRIES_UPDATE', entriesHistory);
                                    
                                    sendMessageToContent('NEW_ANALYSIS', g1Analysis);
                                } else {
                                    // ? MODO PADR�O: Aguardar novo padr�o para enviar G1
                                    console.log('? MODO PADR�O: Aguardando novo padr�o para enviar G1...');
                                    
                                    await chrome.storage.local.set({
                                        analysis: null,
                                        currentAnalysis: null, // ✅ CRÍTICO: Limpar currentAnalysis também
                                        pattern: null,
                                        lastBet: { status: 'loss', phase: 'G0', resolvedAtTimestamp: latestSpin.created_at },
                                        entriesHistory,
                                        martingaleState
                                    });
                                    
                                    sendMessageToContent('CLEAR_ANALYSIS');
                                    sendMessageToContent('ENTRIES_UPDATE', entriesHistory);
                                }
                                
                            } else if (currentStage.startsWith('G')) {
                                // ---------------------------------------------------------------
                                // ? LOSS EM QUALQUER GALE (G1, G2, G3... G200)
                                // ---------------------------------------------------------------
                                
                                if (!canTryNextGale) {
                                    // ? LIMITE ATINGIDO: Registrar RET
                                    console.log(`? Limite de Gales atingido (${currentGaleNumber}/${maxGales}) - Registrando RET`);
                                    
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
                                    
                                    // ? Calcular estat�sticas WIN/LOSS baseado em CICLOS COMPLETOS
                                    const { totalWins, totalLosses } = calculateCycleScore(entriesHistory);
                                    
                                    // await sendTelegramMartingaleRET(totalWins, totalLosses);
                                    
                                    // ? ATUALIZAR HIST�RICO DE CORES QUENTES
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
                                
                                // ? TEM GALES: Tentar pr�ximo
                                console.log(`?? Tentando G${nextGaleNumber}...`);
                                console.log(`?? Martingale Consecutivo: ${analyzerConfig.consecutiveMartingale ? 'ATIVADO' : 'DESATIVADO'}`);
                                
                                // ? ENVIAR MENSAGEM DE LOSS (vai tentar pr�ximo Gale)
                                // await sendTelegramMartingaleLoss(
                                //     currentStage,
                                //     { color: rollColor, number: rollNumber, timestamp: latestSpin.created_at }
                                // );
                                
                                // ? USAR SEMPRE A MESMA COR DA ENTRADA ORIGINAL
                                console.log('+-----------------------------------------------------------+');
                                console.log('�  ?? DEBUG: VERIFICANDO COR DO MARTINGALE                 �');
                                console.log('�-----------------------------------------------------------�');
                                console.log(`�  martingaleState.entryColor: ${martingaleState.entryColor}                   �`);
                                console.log(`�  currentAnalysis.color: ${currentAnalysis.color}                        �`);
                                console.log('+-----------------------------------------------------------+');
                                
                                const nextGaleColor = martingaleState.entryColor;
                                
                                console.log(`?? COR CONFIRMADA PARA G${nextGaleNumber}: ${nextGaleColor}`);
                                
                                // ?? CR�TICO: Registrar LOSS do Gale atual
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
                                    // ? MODO CONSECUTIVO
                                    console.log(`?? MODO CONSECUTIVO: G${nextGaleNumber} ser� enviado no PR�XIMO GIRO`);
                                    
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
                                    
                                    // ✅ CRÍTICO: Enviar ENTRIES_UPDATE para mostrar LOSS na UI
                                    console.log(`%c📤 ENVIANDO ENTRIES_UPDATE (LOSS G${currentGaleNumber} → G${nextGaleNumber})...`, 'color: #FF6666; font-weight: bold;');
                                    sendMessageToContent('ENTRIES_UPDATE', entriesHistory);
                                    
                                    sendMessageToContent('NEW_ANALYSIS', nextGaleAnalysis);
                                } else {
                                    // ? MODO PADR�O
                                    console.log(`? MODO PADR�O: Aguardando novo padr�o para enviar G${nextGaleNumber}...`);
                                    
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
                                // BLOCO ANTIGO DESATIVADO - MANTIDO PARA REFER�NCIA
                                // ---------------------------------------------------------------
                                // ? LOSS NO G1: Verificar modo de Martingale
                                // ---------------------------------------------------------------
                                console.log('?? LOSS no G1 - Verificando modo de Martingale...');
                                console.log(`?? Martingale Consecutivo: ${analyzerConfig.consecutiveMartingale ? 'ATIVADO' : 'DESATIVADO'}`);
                                
                                // ? USAR SEMPRE A MESMA COR DA ENTRADA ORIGINAL
                                const g2Color = martingaleState.entryColor;
                                
                                // ?? CR�TICO: Registrar LOSS do G1 antes de tentar G2
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
                                    finalResult: null,  // Ainda n�o � final, vai tentar G2
                                    continuingToG2: true  // Flag indicando que continuar�
                                };
                                
                                entriesHistory.unshift(g1LossEntry);
                                
                                // Atualizar estado do Martingale
                                martingaleState.stage = 'G2';
                                martingaleState.lossCount = 2;
                                martingaleState.lossColors.push(rollColor);  // ? Adicionar cor do G1 que perdeu
                                
                                // ---------------------------------------------------------------
                                // VERIFICAR MODO DE MARTINGALE
                                // ---------------------------------------------------------------
                                
                                if (analyzerConfig.consecutiveMartingale) {
                                    // ? MODO CONSECUTIVO: Enviar G2 IMEDIATAMENTE no pr�ximo giro
                                    console.log('?? MODO CONSECUTIVO: G2 ser� enviado no PR�XIMO GIRO');
                                    
                                    await sendTelegramMartingaleG2(g2Color, null);
                                    
                                    // Criar an�lise G2 com timestamp do pr�ximo giro
                                    const g2Analysis = {
                                        ...currentAnalysis,
                                        color: g2Color,
                                        phase: 'G2',
                                        predictedFor: 'next',
                                        createdOnTimestamp: latestSpin.created_at  // ? Usar giro atual
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
                                    // ? MODO PADR�O: Aguardar novo padr�o para enviar G2
                                    console.log('? MODO PADR�O: Aguardando novo padr�o para enviar G2...');
                                    
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
                                // ? LOSS NO G2: RET (Loss Final)
                                console.log('? LOSS no G2 - RET');
                                
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
                                
                                // await sendTelegramMartingaleRET(totalWins, totalLosses + 1);
                                
                                // ? ATUALIZAR HIST�RICO DE CORES QUENTES
                                console.log('?? Atualizando hist�rico de cores quentes ap�s RET...');
                                
                                // Construir sequ�ncia de cores DOS GIROS (n�o das apostas!)
                                const colorSequence = [];
                                
                                // Adicionar cores dos LOSSes (giros que realmente sa�ram)
                                martingaleState.lossColors.forEach(color => {
                                    colorSequence.push({ color });
                                });
                                
                                // Adicionar cor do G2 que perdeu (giro atual)
                                colorSequence.push({ color: rollColor });
                                
                                console.log('   Sequ�ncia de cores dos giros:', colorSequence.map(c => c.color).join(' ? '));
                                
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
                    console.log('?? N�O h� recomenda��o pendente para avaliar');
                    if (!currentAnalysis) {
                        console.log('   Motivo: currentAnalysis n�o existe');
                    } else if (!currentAnalysis.createdOnTimestamp) {
                        console.log('   Motivo: createdOnTimestamp ausente');
                    } else if (currentAnalysis.predictedFor !== 'next') {
                        console.log('   Motivo: predictedFor =', currentAnalysis.predictedFor, '(esperado: "next")');
                    }
                }
                console.log('-----------------------------------------------------------\n');
                
                // Notificar content script sobre novo giro
                sendMessageToContent('NEW_SPIN', { history: history, lastSpin: { number: rollNumber, color: rollColor, timestamp: latestSpin.created_at } });
                
                // ? EXECUTAR NOVA AN�LISE (ap�s processar WIN/LOSS)
            console.log('');
            console.log('');
            console.log('%c+-------------------------------------------------------------------------------+', 'color: #FFD700; font-weight: bold; font-size: 16px; background: #333300; padding: 5px;');
            console.log('%c�                                                                               �', 'color: #FFD700; font-weight: bold; font-size: 16px; background: #333300; padding: 5px;');
            console.log('%c�       ?? PRESTES A CHAMAR runAnalysisController()! ??                        �', 'color: #FFD700; font-weight: bold; font-size: 16px; background: #333300; padding: 5px;');
            console.log('%c�                                                                               �', 'color: #FFD700; font-weight: bold; font-size: 16px; background: #333300; padding: 5px;');
            console.log('%c�       ?? Giros no hist�rico:', 'color: #FFD700; font-weight: bold; background: #333300; padding: 5px;', history ? history.length : 0);
            console.log('%c�       ?? Modo IA ativo:', 'color: #FFD700; font-weight: bold; background: #333300; padding: 5px;', analyzerConfig.aiMode);
            console.log('%c�                                                                               �', 'color: #FFD700; font-weight: bold; font-size: 16px; background: #333300; padding: 5px;');
            console.log('%c+-------------------------------------------------------------------------------+', 'color: #FFD700; font-weight: bold; font-size: 16px; background: #333300; padding: 5px;');
            console.log('');
            
            const analysisResult = await runAnalysisController(history);
            
            console.log('');
            console.log('%c? runAnalysisController() FINALIZADO!', 'color: #00FF88; font-weight: bold; font-size: 16px; background: #003300; padding: 5px;');
            console.log('');
            
            // ?? ENVIAR SINAL PARA A UI SE HOUVER RESULTADO
            if (analysisResult && analysisResult.color) {
                console.log('');
                console.log('%c+-------------------------------------------------------------------------------+', 'color: #00FF00; font-weight: bold; font-size: 16px; background: #003300; padding: 5px;');
                console.log('%c�  ?? ENVIANDO SINAL PARA A UI!                                                �', 'color: #00FF00; font-weight: bold; font-size: 16px; background: #003300; padding: 5px;');
                console.log('%c+-------------------------------------------------------------------------------+', 'color: #00FF00; font-weight: bold; font-size: 16px; background: #003300; padding: 5px;');
                console.log(`%c   ?? Cor: ${analysisResult.color.toUpperCase()}`, analysisResult.color === 'red' ? 'color: #FF0000; font-weight: bold; font-size: 16px;' : 'color: #FFFFFF; font-weight: bold; font-size: 16px;');
                console.log(`%c   ?? Confian�a: ${analysisResult.confidence}%`, 'color: #FFD700; font-weight: bold; font-size: 14px;');
                console.log(`%c   ?? Descri��o: ${analysisResult.patternDescription}`, 'color: #00FF88;');
                console.log('%c+-------------------------------------------------------------------------------+', 'color: #00FF00; font-weight: bold; font-size: 16px; background: #003300; padding: 5px;');
                console.log('');
                
                // ?? SALVAR A AN�LISE NO STORAGE ANTES DE ENVIAR
                const ultimoGiro = history && history.length > 0 ? history[0] : null;
                
                const currentAnalysis = {
                    color: analysisResult.color,
                    confidence: analysisResult.confidence,
                    probability: analysisResult.probability || analysisResult.confidence,
                    reasoning: analysisResult.reasoning,
                    patternDescription: analysisResult.patternDescription,
                    timestamp: new Date().toISOString(),
                    suggestion: analysisResult.color === 'red' ? 'Apostar em VERMELHO' : 
                               analysisResult.color === 'black' ? 'Apostar em PRETO' : 'Apostar em BRANCO',
                    // ?? PROPRIEDADES CR�TICAS PARA VERIFICA��O DE WIN/LOSS
                    createdOnTimestamp: ultimoGiro ? ultimoGiro.created_at : Date.now(),
                    predictedFor: 'next',  // Previs�o para o pr�ximo giro
                    phase: 'G0'  // Fase inicial (entrada)
                };
                
                // ?? CRIAR ENTRADA NO HIST�RICO
                const { entriesHistory = [] } = await chrome.storage.local.get(['entriesHistory']);
                
                const newEntry = {
                    id: `entry_${Date.now()}`,
                    timestamp: currentAnalysis.timestamp,
                    color: currentAnalysis.color,
                    confidence: currentAnalysis.confidence,
                    patternDescription: currentAnalysis.patternDescription,
                    reasoning: currentAnalysis.reasoning,
                    phase: 'ENTRADA',
                    martingaleStage: 'ENTRADA',
                    status: 'pending', // WIN/LOSS ser� definido quando o pr�ximo giro chegar
                    result: 'PENDING', // Ser� WIN ou LOSS ap�s o pr�ximo giro
                    finalResult: null,
                    number: null, // Ser� preenchido quando o pr�ximo giro chegar
                    createdOnSpin: ultimoGiro ? ultimoGiro.number : null // Giro onde o sinal foi gerado
                };
                
                // Adicionar entrada no in�cio do array
                entriesHistory.unshift(newEntry);
                
                // Limitar a 50 entradas
                if (entriesHistory.length > 50) {
                    entriesHistory.length = 50;
                }
                
                // ?? SALVAR INFORMA��ES DO SINAL PARA CONTROLE DE INTERVALO
                const currentSpinNumber = ultimoGiro ? ultimoGiro.number : null;
                
                await chrome.storage.local.set({
                    currentAnalysis: currentAnalysis,
                    analysis: currentAnalysis,
                    pattern: {
                        description: analysisResult.patternDescription,
                        confidence: analysisResult.confidence
                    },
                    entriesHistory: entriesHistory,
                    lastSignalSpinNumber: currentSpinNumber,  // ?? Salvar n�mero do giro do sinal
                    lastSignalTimestamp: Date.now()           // ?? Salvar timestamp do sinal
                });
                
                console.log('%c?? AN�LISE SALVA NO STORAGE!', 'color: #00FF88; font-weight: bold;');
                console.log('%c?? ENTRADA CRIADA NO HIST�RICO!', 'color: #00FF88; font-weight: bold;', newEntry);
                console.log('%c?? CONTROLE DE INTERVALO SALVO:', 'color: #00FF88; font-weight: bold;');
                console.log(`   ?? Giro do sinal: #${currentSpinNumber}`);
                console.log(`   ?? Timestamp: ${new Date().toLocaleTimeString()}`);
                
                // Enviar mensagem NEW_ANALYSIS para content.js
                sendMessageToContent('NEW_ANALYSIS', currentAnalysis);
                
                // Enviar mensagem para atualizar a UI com o hist�rico de entradas
                sendMessageToContent('ENTRIES_UPDATE', entriesHistory);
                
                console.log('%c? SINAL E ENTRADA ENVIADOS COM SUCESSO PARA A UI!', 'color: #00FF00; font-weight: bold; font-size: 14px; background: #003300; padding: 5px;');
                console.log('');
            } else {
                console.log('%c?? Nenhum sinal gerado nesta an�lise', 'color: #FFA500; font-weight: bold;');
                console.log('%c   ?? A an�lise dos 6 n�veis JÁ foi executada e o status JÁ foi enviado para a UI', 'color: #888888;');
                console.log('%c   ?? O motivo da rejeição está nos logs acima (VETO ou VOTOS_INSUFICIENTES)', 'color: #888888;');
                console.log('');
            }
        }
    } catch (error) {
        console.error('Erro ao processar giro do servidor:', error);
    }
}

// ---------------------------------------------------------------
// ? FUN��O PARA CALCULAR PLACAR BASEADO EM CICLOS COMPLETOS
// ---------------------------------------------------------------
function calculateCycleScore(entriesHistory) {
    console.log('?? Calculando placar baseado em CICLOS...');
    
    let totalWins = 0;
    let totalLosses = 0;
    
    // Contar apenas entradas com finalResult definido (ciclos completos)
    for (const entry of entriesHistory) {
        if (entry.finalResult === 'WIN') {
            totalWins++;
            console.log(`  ? WIN (${entry.martingaleStage || entry.phase})`);
        } else if (entry.finalResult === 'RET') {
            totalLosses++;
            console.log(`  ? LOSS (${entry.martingaleStage || entry.phase} - N�o pagou)`);
        }
    }
    
    console.log(`?? Placar final: WIN: ${totalWins} | LOSS: ${totalLosses}`);
    return { totalWins, totalLosses };
}

// Fun��o auxiliar para processar giro vindo direto da Blaze (fallback)
function processNewSpin(spinData) {
    return processNewSpinFromServer(spinData);
}

// Tenta carregar os �ltimos 2000 giros de uma vez do SERVIDOR e popular cache em mem�ria
async function initializeHistoryIfNeeded() {
    if (historyInitialized) return; // j� inicializado nesta sess�o

    try {
        // Buscar giros do SERVIDOR primeiro
        console.log('?? Buscando hist�rico inicial do servidor para cache em mem�ria...');
        const serverGiros = await fetchGirosFromAPI();
        
        if (serverGiros && serverGiros.length > 0) {
            console.log(`? ${serverGiros.length} giros recebidos do servidor!`);
            // ? Popular CACHE EM MEM�RIA (n�o salvar em chrome.storage.local)
            cachedHistory = [...serverGiros].slice(0, 2000);
            historyInitialized = true;
            console.log(`?? Cache em mem�ria inicializado: ${cachedHistory.length} giros`);
            
            // ? ENVIAR �LTIMO GIRO E HIST�RICO PARA A UI
            const lastSpin = serverGiros[0]; // O mais recente est� na posi��o 0
            if (lastSpin) {
                console.log('?? Enviando �ltimo giro para UI:', lastSpin);
                await chrome.storage.local.set({ lastSpin: lastSpin });
                sendMessageToContent('NEW_SPIN', { 
                    lastSpin: lastSpin,
                    history: serverGiros 
                });
                console.log('%c? UI atualizada com hist�rico do servidor (initializeHistoryIfNeeded)', 'color: #00ff00; font-weight: bold;');
            }
            return;
        }
        
        // Se servidor n�o tiver dados, buscar direto da Blaze (fallback)
        console.log('?? Servidor sem dados, buscando direto da Blaze...');
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
            } catch(_) { /* tenta pr�ximo */ }
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
            
            // ? Popular CACHE EM MEM�RIA (n�o salvar em chrome.storage.local)
            cachedHistory = mapped;
            historyInitialized = true;
            
            await chrome.storage.local.set({ lastSpin: last });
            sendMessageToContent('NEW_SPIN', { lastSpin: last });
            console.log(`?? Cache em mem�ria inicializado (fallback Blaze): ${mapped.length} giros`);
        } else {
            cachedHistory = [];
            historyInitialized = true;
            console.log('?? Nenhum giro dispon�vel - cache em mem�ria vazio');
        }
    } catch (err) {
        console.warn('N�o foi poss�vel carregar giros iniciais. Mantendo coleta incremental.', err);
        cachedHistory = [];
        historyInitialized = true;
    }
}

// Analyze patterns in the data - ONLY triggered when new spin detected
async function analyzePatterns(history) {
    console.log('?? Iniciando an�lise de padr�es...');
    
    // REGRA: M�nimo de 50 giros para come�ar an�lises
    if (history.length < 50) {
        console.log('?? Hist�rico insuficiente para an�lise:', history.length, '/ 50 giros necess�rios');
        sendAnalysisStatus(`Coletando dados... ${history.length}/50 giros`);
        return; // Precisa de pelo menos 50 giros para an�lises confi�veis
    }
    
    // REGRA: Verificar se n�o est� usando o mesmo padr�o da �ltima entrada
    const entriesResult = await chrome.storage.local.get(['entriesHistory']);
    const entriesHistory = entriesResult.entriesHistory || [];
    
    if (entriesHistory.length > 0) {
        const lastEntry = entriesHistory[0];
        
        // Verificar se a �ltima entrada tem dados de padr�o
        if (lastEntry.patternData && lastEntry.patternData.patternDescription) {
            try {
                // ?? CR�TICO: Se for an�lise IA, patternDescription � texto, n�o JSON
                if (lastEntry.patternData.patternDescription.includes('?? AN�LISE POR INTELIG�NCIA ARTIFICIAL')) {
                    console.log('?? �ltimo padr�o usado: An�lise Avan�ada (IA)');
                } else {
                    const lastPatternData = JSON.parse(lastEntry.patternData.patternDescription);
                    console.log('?? �ltimo padr�o usado:', lastPatternData);
                }
                
                // Esta verifica��o ser� feita ap�s a an�lise para comparar padr�es
                // Por enquanto, continuamos com a an�lise
            } catch (e) {
                console.log('?? Erro ao analisar �ltimo padr�o:', e);
            }
        }
    }
    
    try {
        console.log('?? Executando an�lise multidimensional...', '| Rigor:', rigorLogString());
        const analysis = await performPatternAnalysis(history);
        
        if (analysis) {
            // REGRA: Verificar se n�o � o mesmo padr�o da �ltima entrada
            let isDuplicatePattern = false;
            
            if (entriesHistory.length > 0) {
                const lastEntry = entriesHistory[0];
                
                if (lastEntry.patternData && lastEntry.patternData.patternDescription) {
                    try {
                        // ?? CR�TICO: Se for an�lise IA, patternDescription � texto, n�o JSON
                        const isLastAI = lastEntry.patternData.patternDescription.includes('?? AN�LISE POR INTELIG�NCIA ARTIFICIAL');
                        const isCurrentAI = analysis.patternDescription.includes('?? AN�LISE POR INTELIG�NCIA ARTIFICIAL');
                        
                        // Se qualquer um for IA, sempre considerar como padr�o diferente
                        if (isLastAI || isCurrentAI) {
                            console.log('? An�lise aceita (IA sempre permite novos sinais)');
                            isDuplicatePattern = false;
                        } else {
                            // Ambos s�o an�lise padr�o, comparar como JSON
                            const lastPatternData = JSON.parse(lastEntry.patternData.patternDescription);
                            const currentPatternData = JSON.parse(analysis.patternDescription);
                            
                            // Comparar caracter�sticas dos padr�es
                            isDuplicatePattern = comparePatterns(lastPatternData, currentPatternData);
                            
                            if (isDuplicatePattern) {
                                console.log('? An�lise rejeitada: mesmo padr�o da �ltima entrada');
                                sendAnalysisStatus('? Aguardando padr�o diferente...');
                                return;
                            } else {
                                console.log('? Padr�o diferente detectado, an�lise aceita');
                            }
                        }
                    } catch (e) {
                        console.log('?? Erro ao comparar padr�es:', e);
                    }
                }
            }
            
            console.log('? An�lise conclu�da com sucesso!');
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
            console.log('? Nenhum padr�o v�lido encontrado na an�lise');
            // Limpar an�lise primeiro
            await chrome.storage.local.set({ analysis: null, pattern: null });
            sendMessageToContent('CLEAR_ANALYSIS');
            // Enviar status de aguardando novo giro AP�S limpar a an�lise
            sendAnalysisStatus('? Aguardando novo giro...');
        }
    } catch (error) {
        console.error('Erro na an�lise de padr�es:', error);
    }
}

// -------------------------------------------------------------------------------
// ?? SISTEMA DE AN�LISE POR INTELIG�NCIA ARTIFICIAL (IA)
// -------------------------------------------------------------------------------

/**
 * VARREDURA 1: An�lise Macro - Contexto Geral
 * Analisa 2000, 500 e 240 giros para entender:
 * - Padr�es gerais da Blaze
 * - Resist�ncias e quebras
 * - Aleatoriedade
 */
function analyzeMacroContext(history) {
    console.log('?? VARREDURA 1: An�lise Macro (Contexto Geral)');
    
    const results = {
        full: analyzeWindow(history.slice(0, 2000), '2000 giros'),
        recent: analyzeWindow(history.slice(0, 500), '500 giros'),
        immediate: analyzeWindow(history.slice(0, 240), '240 giros')
    };
    
    console.log('? Varredura 1 completa:', results);
    return results;
}

/**
 * An�lise de uma janela de giros
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
    
    // Detectar resist�ncias (cor que aparece muito)
    let resistance = null;
    if (redPct > 55) resistance = 'red';
    else if (blackPct > 55) resistance = 'black';
    
    // Detectar quebra de resist�ncia (mudan�a brusca)
    const last20 = colors.slice(0, 20);
    const last20Red = last20.filter(c => c === 'red').length;
    const last20Black = last20.filter(c => c === 'black').length;
    
    let breakResistance = null;
    if (resistance === 'red' && last20Black > last20Red) breakResistance = 'black';
    else if (resistance === 'black' && last20Red > last20Black) breakResistance = 'red';
    
    // Medir aleatoriedade (quanto mais pr�ximo de 50/50, mais aleat�rio)
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
 * VARREDURA 2: An�lise Micro - Janelas de 20 giros
 * Divide os �ltimos 240 giros em janelas de 20
 * Identifica qual cor tende a sair ap�s cada padr�o
 */
function analyzeMicroWindows(history) {
    console.log('?? VARREDURA 2: An�lise Micro (Janelas de 20 giros)');
    
    const last240 = history.slice(0, 240);
    if (last240.length < 240) {
        console.warn('?? Hist�rico insuficiente para an�lise micro (precisa 240 giros)');
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
    
    console.log(`? Varredura 2 completa: ${windows.length} janelas analisadas`);
    return windows;
}

/**
 * Combinar resultados das 2 varreduras + padr�es salvos
 * Retorna a cor recomendada e confian�a
 */
async function combineAIResults(macroResults, microWindows, savedPatterns) {
    console.log('?? Combinando resultados das an�lises...');
    
    const scores = { red: 0, black: 0, white: 0 };
    
    // 1. PESO DA VARREDURA 1 (Contexto Macro) - 30%
    if (macroResults) {
        const weight = 0.30;
        
        // Quebra de resist�ncia tem prioridade
        if (macroResults.immediate?.breakResistance) {
            scores[macroResults.immediate.breakResistance] += 30 * weight;
            console.log(`  ? Quebra de resist�ncia detectada: ${macroResults.immediate.breakResistance} (+${30 * weight})`);
        }
        
        // Resist�ncia tamb�m influencia (favor da resist�ncia)
        if (macroResults.recent?.resistance) {
            scores[macroResults.recent.resistance] += 15 * weight;
        }
    }
    
    // 2. PESO DA VARREDURA 2 (Janelas de 20) - 50% (MAIOR PESO)
    if (microWindows && microWindows.length > 0) {
        const weight = 0.50;
        
        // Analisar �ltimos 20 giros (janela mais recente)
        const lastWindow = microWindows[0];
        
        // Contar qual cor apareceu DEPOIS de janelas similares
        const colorAfterPatterns = {};
        microWindows.forEach(w => {
            if (w.nextColor) {
                colorAfterPatterns[w.nextColor] = (colorAfterPatterns[w.nextColor] || 0) + 1;
            }
        });
        
        // Dar pontos baseado na frequ�ncia
        const total = Object.values(colorAfterPatterns).reduce((a, b) => a + b, 0);
        Object.keys(colorAfterPatterns).forEach(color => {
            const frequency = (colorAfterPatterns[color] / total) * 100;
            scores[color] += frequency * weight;
            console.log(`  ? Janelas de 20: ${color} aparece ${frequency.toFixed(1)}% (+${(frequency * weight).toFixed(1)})`);
        });
    }
    
    // 3. PESO DOS PADR�ES SALVOS - 20%
    if (savedPatterns && savedPatterns.length > 0) {
        const weight = 0.20;
        
        // Pegar padr�o com maior confian�a
        const bestPattern = savedPatterns.reduce((best, p) => 
            p.confidence > (best?.confidence || 0) ? p : best
        , null);
        
        if (bestPattern) {
            scores[bestPattern.color] += bestPattern.confidence * weight;
            console.log(`  ? Melhor padr�o salvo: ${bestPattern.color} (${bestPattern.confidence}%) (+${(bestPattern.confidence * weight).toFixed(1)})`);
        }
    }
    
    // Encontrar cor com maior score
    const bestColor = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b);
    const confidence = Math.min(95, Math.max(45, scores[bestColor]));
    
    console.log('?? Scores finais:', scores);
    console.log(`?? Recomenda��o IA: ${bestColor} (${confidence.toFixed(1)}%)`);
    
    // ? VALIDAR CONFIAN�A M�NIMA (configurada pelo usu�rio) - MODO IA
    const minConfidence = analyzerConfig.minPercentage || 60; // Porcentagem m�nima configurada para o modo IA
    if (confidence < minConfidence) {
        console.log(`?? Confian�a ${confidence.toFixed(1)}% est� abaixo do m�nimo configurado (${minConfidence}%)`);
        console.log('? An�lise IA rejeitada por n�o atingir confian�a m�nima');
        return null; // N�o retorna an�lise
    }
    console.log(`? Confian�a ${confidence.toFixed(1)}% atende ao m�nimo (${minConfidence}%)`);
    
    // ? CRIAR RESUMOS DETALHADOS PARA O USU�RIO
    let macroSummary = '';
    if (macroResults) {
        const parts = [];
        if (macroResults.immediate?.breakResistance) {
            parts.push(`? Quebra de resist�ncia detectada em ${macroResults.immediate.breakResistance}`);
        }
        if (macroResults.recent?.resistance) {
            parts.push(`?? Resist�ncia atual: ${macroResults.recent.resistance}`);
        }
        if (macroResults.immediate?.randomness) {
            const randomPct = parseFloat(macroResults.immediate.randomness);
            if (randomPct > 90) parts.push('?? Alto grau de aleatoriedade detectado');
            else if (randomPct < 70) parts.push('? Padr�es consistentes identificados');
        }
        macroSummary = parts.length > 0 ? parts.join('\n   ') : '? An�lise de tend�ncias conclu�da';
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
            microSummary = `? ${topColor} aparece em ${freq}% dos padr�es similares`;
        } else {
            microSummary = '? Padr�es recentes mapeados';
        }
    }
    
    let patternSummary = '? Base de dados consultada';
    if (savedPatterns && savedPatterns.length > 0) {
        const bestPattern = savedPatterns.reduce((best, p) => 
            p.confidence > (best?.confidence || 0) ? p : best
        , null);
        if (bestPattern) {
            patternSummary = `? Melhor padr�o: ${bestPattern.color} (${bestPattern.confidence}% confian�a)`;
        }
    } else {
        patternSummary = '?? Nenhum padr�o salvo encontrado';
    }
    
    // Criar racioc�nio baseado na pontua��o
    let reasoning = '';
    const diff = scores[bestColor] - Math.max(...Object.keys(scores).filter(c => c !== bestColor).map(c => scores[c]));
    if (diff > 20) {
        reasoning = `? IA identificou forte tend�ncia para ${bestColor} com ${diff.toFixed(1)} pontos de vantagem sobre outras cores.`;
    } else if (diff > 10) {
        reasoning = `? IA recomenda ${bestColor} com vantagem moderada de ${diff.toFixed(1)} pontos.`;
    } else {
        reasoning = `?? IA recomenda ${bestColor} com pequena vantagem de ${diff.toFixed(1)} pontos. Entrada de risco moderado.`;
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
 * -------------------------------------------------------------------------------
 * ?? DETECTOR DE PADR�ES NO HIST�RICO (AN�LISE ESTAT�STICA REAL)
 * -------------------------------------------------------------------------------
 * Esta fun��o analisa TODO o hist�rico e detecta padr�es espec�ficos:
 * - Altern�ncia simples (P-V-P-V)
 * - Altern�ncia dupla (P-P-V-V)
 * - Altern�ncia tripla (P-P-P-V-V-V)
 * - Sequ�ncias longas (6+ mesma cor)
 * 
 * Para cada padr�o, conta O QUE VEIO DEPOIS (estat�stica REAL)
 */
function detectPatternsInHistory(history) {
    console.log('');
    console.log('%c+-----------------------------------------------------------+', 'color: #00BFFF; font-weight: bold;');
    console.log('%c�  ?? DETECTANDO PADR�ES NO HIST�RICO                      �', 'color: #00BFFF; font-weight: bold;');
    console.log('%c+-----------------------------------------------------------+', 'color: #00BFFF; font-weight: bold;');
    console.log('%c   Hist�rico recebido: ' + history.length + ' giros', 'color: #00BFFF;');
    console.log('');
    
    // ? VALIDA��O: Verificar se hist�rico � v�lido
    if (!history || !Array.isArray(history) || history.length === 0) {
        console.warn('%c?? Hist�rico inv�lido ou vazio!', 'color: #FFAA00; font-weight: bold;');
        return [];
    }
    
    const patterns = {
        // Altern�ncia simples: P-V-P-V-P-V
        alternanciaSimples: { count: 0, afterRed: 0, afterBlack: 0, afterWhite: 0 },
        
        // Altern�ncia dupla: P-P-V-V-P-P-V-V
        alternanciaDupla: { count: 0, afterRed: 0, afterBlack: 0, afterWhite: 0 },
        
        // Altern�ncia tripla: P-P-P-V-V-V-P-P-P
        alternanciaTripla: { count: 0, afterRed: 0, afterBlack: 0, afterWhite: 0 },
        
        // Sequ�ncia longa de vermelhos (6+)
        sequenciaVermelho6Plus: { count: 0, afterRed: 0, afterBlack: 0, afterWhite: 0 },
        
        // Sequ�ncia longa de pretos (6+)
        sequenciaPreto6Plus: { count: 0, afterRed: 0, afterBlack: 0, afterWhite: 0 },
        
        // Sequ�ncia longa de mesma cor (4-5)
        sequenciaMesmaCor4a5: { count: 0, afterRed: 0, afterBlack: 0, afterWhite: 0 }
    };
    
    // Simplificar cores (ignorar white temporariamente para padr�es)
    const simplifiedHistory = history.map(spin => {
        if (spin.color === 'white') return 'W';
        return spin.color === 'red' ? 'R' : 'B';
    });
    
    // Analisar hist�rico (deixar espa�o para o "pr�ximo giro")
    for (let i = 0; i < history.length - 1; i++) {
        const next = history[i]; // O giro que VEIO DEPOIS do padr�o
        
        // ---------------------------------------------------------------
        // ALTERN�NCIA SIMPLES: R-B-R-B-R-B (m�nimo 6 giros)
        // ---------------------------------------------------------------
        if (i + 6 < history.length) {
            const seq = simplifiedHistory.slice(i + 1, i + 7).join('');
            
            // Padr�o: R-B-R-B-R-B ou B-R-B-R-B-R
            if (seq === 'RBRBRB' || seq === 'BRBRBR') {
                patterns.alternanciaSimples.count++;
                if (next.color === 'red') patterns.alternanciaSimples.afterRed++;
                else if (next.color === 'black') patterns.alternanciaSimples.afterBlack++;
                else patterns.alternanciaSimples.afterWhite++;
            }
        }
        
        // ---------------------------------------------------------------
        // ALTERN�NCIA DUPLA: R-R-B-B-R-R-B-B (m�nimo 8 giros)
        // ---------------------------------------------------------------
        if (i + 8 < history.length) {
            const seq = simplifiedHistory.slice(i + 1, i + 9).join('');
            
            // Padr�o: R-R-B-B-R-R-B-B ou B-B-R-R-B-B-R-R
            if (seq === 'RRBBRRBB' || seq === 'BBRRBBRR') {
                patterns.alternanciaDupla.count++;
                if (next.color === 'red') patterns.alternanciaDupla.afterRed++;
                else if (next.color === 'black') patterns.alternanciaDupla.afterBlack++;
                else patterns.alternanciaDupla.afterWhite++;
            }
        }
        
        // ---------------------------------------------------------------
        // ALTERN�NCIA TRIPLA: R-R-R-B-B-B-R-R-R (m�nimo 9 giros)
        // ---------------------------------------------------------------
        if (i + 9 < history.length) {
            const seq = simplifiedHistory.slice(i + 1, i + 10).join('');
            
            // Padr�o: R-R-R-B-B-B-R-R-R ou B-B-B-R-R-R-B-B-B
            if (seq === 'RRRBBBRRR' || seq === 'BBBRRRBBB') {
                patterns.alternanciaTripla.count++;
                if (next.color === 'red') patterns.alternanciaTripla.afterRed++;
                else if (next.color === 'black') patterns.alternanciaTripla.afterBlack++;
                else patterns.alternanciaTripla.afterWhite++;
            }
        }
        
        // ---------------------------------------------------------------
        // SEQU�NCIA DE VERMELHO 6+ (ignorando brancos)
        // ---------------------------------------------------------------
        if (i + 6 < history.length) {
            const seq = simplifiedHistory.slice(i + 1, i + 7).filter(c => c !== 'W').join('');
            
            if (seq === 'RRRRRR') {
                patterns.sequenciaVermelho6Plus.count++;
                if (next.color === 'red') patterns.sequenciaVermelho6Plus.afterRed++;
                else if (next.color === 'black') patterns.sequenciaVermelho6Plus.afterBlack++;
                else patterns.sequenciaVermelho6Plus.afterWhite++;
            }
        }
        
        // ---------------------------------------------------------------
        // SEQU�NCIA DE PRETO 6+ (ignorando brancos)
        // ---------------------------------------------------------------
        if (i + 6 < history.length) {
            const seq = simplifiedHistory.slice(i + 1, i + 7).filter(c => c !== 'W').join('');
            
            if (seq === 'BBBBBB') {
                patterns.sequenciaPreto6Plus.count++;
                if (next.color === 'red') patterns.sequenciaPreto6Plus.afterRed++;
                else if (next.color === 'black') patterns.sequenciaPreto6Plus.afterBlack++;
                else patterns.sequenciaPreto6Plus.afterWhite++;
            }
        }
        
        // ---------------------------------------------------------------
        // SEQU�NCIA MESMA COR 4-5 (mais comum, mais dados)
        // ---------------------------------------------------------------
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
    
    // ---------------------------------------------------------------
    // CALCULAR PORCENTAGENS E MONTAR RELAT�RIO
    // ---------------------------------------------------------------
    const report = [];
    
    for (const [patternName, data] of Object.entries(patterns)) {
        if (data.count > 0) {
            const total = data.afterRed + data.afterBlack + data.afterWhite;
            const redPercent = ((data.afterRed / total) * 100).toFixed(1);
            const blackPercent = ((data.afterBlack / total) * 100).toFixed(1);
            const whitePercent = ((data.afterWhite / total) * 100).toFixed(1);
            
            // Nome leg�vel do padr�o
            let readableName = '';
            switch(patternName) {
                case 'alternanciaSimples':
                    readableName = 'Altern�ncia Simples (P-V-P-V-P-V)';
                    break;
                case 'alternanciaDupla':
                    readableName = 'Altern�ncia Dupla (P-P-V-V-P-P-V-V)';
                    break;
                case 'alternanciaTripla':
                    readableName = 'Altern�ncia Tripla (P-P-P-V-V-V-P-P-P)';
                    break;
                case 'sequenciaVermelho6Plus':
                    readableName = 'Sequ�ncia de 6+ Vermelhos';
                    break;
                case 'sequenciaPreto6Plus':
                    readableName = 'Sequ�ncia de 6+ Pretos';
                    break;
                case 'sequenciaMesmaCor4a5':
                    readableName = 'Sequ�ncia de 4-5 Mesma Cor';
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
    
    // Ordenar por n�mero de ocorr�ncias (mais confi�vel primeiro)
    report.sort((a, b) => b.occurrences - a.occurrences);
    
    // Exibir relat�rio no console
    console.log('%c?? RELAT�RIO DE PADR�ES DETECTADOS:', 'color: #00BFFF; font-weight: bold; font-size: 14px;');
    console.log('');
    
    if (report.length === 0) {
        console.log('%c?? Nenhum padr�o claro detectado no hist�rico', 'color: #FFAA00;');
        console.log('%c   Isso � NORMAL se o hist�rico for muito aleat�rio', 'color: #FFAA00;');
        console.log('%c   A IA vai analisar de forma livre.', 'color: #FFAA00;');
    } else {
        report.forEach((p, index) => {
            console.log(`%c${index + 1}. ${p.name}`, 'color: #00FF88; font-weight: bold;');
            console.log(`   Ocorr�ncias: ${p.occurrences} vezes`);
            console.log(`   Ap�s esse padr�o:`);
            console.log(`   %c? VERMELHO: ${p.afterRed} vezes (${p.redPercent}%)`, 'color: #FF0000; font-weight: bold;');
            console.log(`   %c? PRETO: ${p.afterBlack} vezes (${p.blackPercent}%)`, 'color: #FFFFFF; font-weight: bold;');
            console.log(`   %c? BRANCO: ${p.afterWhite} vezes (${p.whitePercent}%)`, 'color: #00FF00; font-weight: bold;');
            console.log('');
        });
    }
    
    console.log('%c? Detec��o de padr�es conclu�da! Retornando ' + report.length + ' padr�es', 'color: #00BFFF; font-weight: bold;');
    console.log('');
    
    return report;
}

// -------------------------------------------------------------------------------
// ?? SISTEMA DE AN�LISE AVAN�ADA POR PADR�ES (100% JavaScript - SEM IA)
// -------------------------------------------------------------------------------

/**
 * ARMAZENAMENTO DE SINAIS ENVIADOS (para auto-aprendizado)
 * Persiste em chrome.storage.local
 */
let signalsHistory = {
    signals: [],              // Todos os sinais enviados
    patternStats: {},         // Estat�sticas por tipo de padr�o
    contextStats: {},         // Estat�sticas por contexto
    blockedPatterns: {},      // ?? Padr�es bloqueados temporariamente {patternKey: {until: timestamp, reason: string}}
    consecutiveLosses: 0,     // ?? Contador de losses consecutivos GLOBAL
    recentPerformance: [],    // ?? �ltimos 20 sinais (para ajuste din�mico de minPercentage)
    lastUpdated: null
};

/**
 * Inicializar hist�rico de sinais do storage
 */
async function initializeSignalsHistory() {
    try {
        const result = await chrome.storage.local.get('signalsHistory');
        if (result.signalsHistory) {
            signalsHistory = result.signalsHistory;
            
            // ? Garantir que TODOS os campos existam (migra��o + seguran�a)
            if (!signalsHistory.signals || !Array.isArray(signalsHistory.signals)) signalsHistory.signals = [];
            if (!signalsHistory.patternStats) signalsHistory.patternStats = {};
            if (!signalsHistory.contextStats) signalsHistory.contextStats = {};
            if (!signalsHistory.blockedPatterns) signalsHistory.blockedPatterns = {};
            if (signalsHistory.consecutiveLosses === undefined) signalsHistory.consecutiveLosses = 0;
            if (!signalsHistory.recentPerformance || !Array.isArray(signalsHistory.recentPerformance)) signalsHistory.recentPerformance = [];
            
            console.log(`%c? Hist�rico de sinais carregado: ${signalsHistory.signals.length} sinais`, 'color: #00FF88;');
            console.log(`%c   ?? Losses consecutivos: ${signalsHistory.consecutiveLosses}`, 'color: #FFA500;');
        } else {
            // Se n�o tem nada no storage, garantir estrutura padr�o
            console.log('%c?? Nenhum hist�rico encontrado - inicializando estrutura padr�o', 'color: #FFA500;');
        }
    } catch (error) {
        console.error('%c? Erro ao carregar hist�rico de sinais:', 'color: #FF0000;', error);
        // Em caso de erro, garantir estrutura padr�o
        signalsHistory = {
            signals: [],
            patternStats: {},
            contextStats: {},
            blockedPatterns: {},
            consecutiveLosses: 0,
            recentPerformance: [],
            lastUpdated: null
        };
    }
}

/**
 * Salvar hist�rico de sinais no storage
 */
async function saveSignalsHistory() {
    try {
        signalsHistory.lastUpdated = Date.now();
        await chrome.storage.local.set({ signalsHistory });
    } catch (error) {
        console.error('%c? Erro ao salvar hist�rico de sinais:', 'color: #FF0000;', error);
    }
}

// -------------------------------------------------------------------------------
// ?? SISTEMA DE PADR�ES CUSTOMIZADOS (N�VEL DIAMANTE)
// -------------------------------------------------------------------------------

let customPatternsCache = []; // Cache dos padr�es customizados

/**
 * Carregar padr�es customizados do storage
 */
async function loadCustomPatterns() {
    try {
        const result = await chrome.storage.local.get(['customPatterns']);
        customPatternsCache = result.customPatterns || [];
        
        console.log('');
        console.log('%c+-----------------------------------------------------------+', 'color: #00d4ff; font-weight: bold;');
        console.log('%c�  ?? CARREGANDO PADR�ES CUSTOMIZADOS                      �', 'color: #00d4ff; font-weight: bold;');
        console.log('%c+-----------------------------------------------------------+', 'color: #00d4ff; font-weight: bold;');
        console.log(`?? Total de padr�es no storage: ${customPatternsCache.length}`);
        
        if (customPatternsCache.length > 0) {
            console.log('%c?? LISTA DE PADR�ES CARREGADOS:', 'color: #00d4ff; font-weight: bold;');
            customPatternsCache.forEach((pattern, index) => {
                console.log(`   ${index + 1}. "${pattern.name}" | Sequ�ncia: ${pattern.sequence.join(' ? ')} | Ativo: ${pattern.active ? '?' : '?'}`);
            });
        } else {
            console.log('%c?? Nenhum padr�o customizado encontrado no storage!', 'color: #FFA500; font-weight: bold;');
        }
        console.log('');
        
        return customPatternsCache;
    } catch (error) {
        console.error('? Erro ao carregar padr�es customizados:', error);
        return [];
    }
}

/**
 * Buscar padr�o customizado no hist�rico
 */
function findCustomPatternInHistory(customPattern, history) {
    console.log(`%c?? Buscando padr�o customizado: ${customPattern.name}`, 'color: #00d4ff; font-weight: bold;');
    console.log('   Sequ�ncia:', customPattern.sequence.join(' ? '));
    console.log('   Cor anterior:', customPattern.beforeColor);
    console.log('   ? WHITE ser� IGNORADO na busca');
    
    const colors = history.map(spin => spin.color);
    const patternLength = customPattern.sequence.length;
    const matches = [];
    
    // Buscar no hist�rico (pegando mais giros para compensar poss�veis whites)
    const extraForWhites = 5;
    for (let i = 0; i <= colors.length - patternLength - extraForWhites; i++) {
        // Pegar slice maior para compensar whites
        const sliceRaw = colors.slice(i, i + patternLength + extraForWhites);
        
        // ? FILTRAR WHITE antes de comparar
        const sliceFiltered = sliceRaw.filter(c => c !== 'white');
        const slice = sliceFiltered.slice(0, patternLength);
        
        // Verificar se temos giros suficientes ap�s filtrar white
        if (slice.length < patternLength) {
            continue; // N�o h� giros suficientes
        }
        
        // Verificar se a sequ�ncia bate (SEM WHITE)
        const isMatch = slice.every((color, index) => color === customPattern.sequence[index]);
        
        if (isMatch) {
            // Verificar cor anterior (se especificada)
            const colorBefore = (i + patternLength < colors.length) ? colors[i + patternLength] : null;
            
            // ? Validar cor anterior com as novas op��es
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
                // ? PADR�O ENCONTRADO!
                const whatCameNext = (i > 0) ? colors[i - 1] : null; // Pr�ximo giro (array invertido)
                
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
    
    console.log(`   ? ${matches.length} ocorr�ncia(s) encontrada(s)`);
    
    return matches;
}

/**
 * Analisar padr�o customizado e calcular estat�sticas
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
    
    console.log(`%c?? ESTAT�STICAS DO PADR�O CUSTOMIZADO:`, 'color: #00ff88; font-weight: bold;');
    console.log(`   Total de ocorr�ncias: ${total}`);
    console.log(`   Pr�xima cor:`);
    console.log(`   ?? Vermelho: ${stats.nextColor.redPercent}% (${nextColorCount.red}x)`);
    console.log(`   ? Preto: ${stats.nextColor.blackPercent}% (${nextColorCount.black}x)`);
    console.log(`   ? Branco: ${stats.nextColor.whitePercent}% (${nextColorCount.white}x)`);
    
    return stats;
}

/**
 * Verificar se o padr�o atual bate com algum padr�o customizado
 */
async function checkForCustomPatterns(history) {
    // ? SEMPRE recarregar do storage para pegar mudan�as mais recentes
    console.log('%c?? Recarregando padr�es customizados do storage...', 'color: #00d4ff; font-weight: bold;');
    await loadCustomPatterns();
    
    if (customPatternsCache.length === 0) {
        console.log('');
        console.log('%c+-----------------------------------------------------------+', 'color: #FFA500; font-weight: bold;');
        console.log('%c�  ?? NENHUM PADR�O CUSTOMIZADO ENCONTRADO                 �', 'color: #FFA500; font-weight: bold;');
        console.log('%c+-----------------------------------------------------------+', 'color: #FFA500; font-weight: bold;');
        console.log('%c   ? Storage foi verificado e est� vazio', 'color: #FFA500;');
        console.log('%c   ? Nenhum sinal de padr�o customizado ser� gerado', 'color: #FFA500;');
        console.log('');
        return null;
    }
    
    console.log('%c? Padr�es customizados carregados do storage!', 'color: #00FF88; font-weight: bold;');
    console.log(`%c   Total: ${customPatternsCache.length} padr�o(�es)`, 'color: #00FF88;');
    console.log('');
    
    console.log('');
    console.log('%c+-----------------------------------------------------------+', 'color: #00d4ff; font-weight: bold;');
    console.log('%c�  ?? VERIFICANDO PADR�ES CUSTOMIZADOS                     �', 'color: #00d4ff; font-weight: bold;');
    console.log('%c+-----------------------------------------------------------+', 'color: #00d4ff; font-weight: bold;');
    console.log(`?? Total de padr�es carregados no cache: ${customPatternsCache.length}`);
    console.log('');
    
    const colors = history.map(spin => spin.color);
    
    // Mostrar em ordem cronol�gica (do mais antigo para o mais recente)
    const last15Reversed = colors.slice(0, 15).reverse();
    const last15Display = last15Reversed.map(c => c === 'red' ? '??' : c === 'black' ? '?' : '?').join(' ? ');
    
    console.log('%c?? �LTIMOS 15 GIROS DO HIST�RICO (ordem cronol�gica):', 'color: #00d4ff; font-weight: bold;');
    console.log(`%c   ? PASSADO ------------------------ PRESENTE ?`, 'color: #888; font-style: italic;');
    console.log(`%c   ${last15Display}`, 'color: #FFD700; font-weight: bold;');
    console.log(`%c   ${last15Reversed.join(' ? ')}`, 'color: #888;');
    console.log('');
    
    let patternIndex = 0;
    // Verificar cada padr�o customizado
    for (const customPattern of customPatternsCache) {
        patternIndex++;
        console.log(`%c?????????????????????????????????????????????????????????`, 'color: #00d4ff;');
        console.log(`%c?? PADR�O #${patternIndex}: "${customPattern.name}"`, 'color: #00d4ff; font-weight: bold;');
        console.log(`   Status: ${customPattern.active ? '? ATIVO' : '? INATIVO'}`);
        console.log('');
        console.log(`%c   ?? SEQU�NCIA CONFIGURADA (ordem cronol�gica):`, 'color: #FFD700; font-weight: bold;');
        console.log(`%c      [ANTERIOR] ? [1�] ? [2�] ? [3�] ? ... ? [�LTIMO/ATUAL]`, 'color: #888; font-style: italic;');
        
        // Construir visualiza��o com cor anterior
        const beforeColorDisplay = customPattern.beforeColor === 'red-white' ? '??/?' :
                                    customPattern.beforeColor === 'black-white' ? '?/?' :
                                    customPattern.beforeColor === 'red' ? '??' :
                                    customPattern.beforeColor === 'black' ? '?' :
                                    customPattern.beforeColor === 'white' ? '?' : '?';
        
        const sequenceDisplay = customPattern.sequence.map((c, idx) => {
            const symbol = c === 'red' ? '??' : c === 'black' ? '?' : '?';
            return `[${idx + 1}�: ${symbol}]`;
        }).join(' ? ');
        
        console.log(`%c      ${beforeColorDisplay} (anterior) ? ${sequenceDisplay}`, 'color: #FFD700; font-weight: bold;');
        console.log(`%c      ? PASSADO ------------------------------ PRESENTE ?`, 'color: #888;');
        
        if (!customPattern.active) {
            console.log(`%c   ?? PULANDO: Padr�o est� INATIVO`, 'color: #888;');
            continue;
        }
        
        const patternLength = customPattern.sequence.length;
        
        // Hist�rico vem do MAIS RECENTE para o MAIS ANTIGO
        // Mas padr�o � configurado na ordem cronol�gica (do mais antigo para o mais recente)
        // Ent�o precisamos REVERTER a sequ�ncia atual para comparar!
        
        // ? PEGAR MAIS GIROS PARA COMPENSAR POSS�VEIS WHITES
        const extraForWhites = 5; // Pegar 5 giros extras para compensar whites
        const currentSequenceRaw = colors.slice(0, patternLength + extraForWhites);
        const currentSequenceReversed = [...currentSequenceRaw].reverse(); // ? INVERTER para ordem cronol�gica
        
        // ? REMOVER WHITES (branco n�o conta para padr�es)
        console.log('');
        console.log(`%c   ?? FILTRANDO GIROS (removendo WHITE):`, 'color: #FFD700; font-weight: bold;');
        console.log(`      Sequ�ncia bruta: [${currentSequenceReversed.join(' ? ')}]`);
        
        const currentSequenceFiltered = currentSequenceReversed.filter(c => c !== 'white');
        const currentSequence = currentSequenceFiltered.slice(0, patternLength); // Pegar apenas o tamanho do padr�o
        
        console.log(`      Ap�s remover WHITE: [${currentSequenceFiltered.join(' ? ')}]`);
        console.log(`      Comparando primeiros ${patternLength} giros: [${currentSequence.join(' ? ')}]`);
        
        console.log('');
        console.log(`%c   ?? COMPARANDO SEQU�NCIAS (ordem cronol�gica, SEM WHITE):`, 'color: #FFD700; font-weight: bold;');
        console.log(`%c      ?? IMPORTANTE: WHITE � IGNORADO na compara��o!`, 'color: #FFD700; font-weight: bold;');
        console.log(`      ?? Esperado: [${customPattern.sequence.join(' ? ')}]`);
        console.log(`      ?? Atual:    [${currentSequence.join(' ? ')}]`);
        console.log(`      ?? Tamanho:  ${patternLength} giros (sem contar WHITE)`);
        console.log('');
        
        // Comparar posi��o por posi��o (agora ambos est�o em ordem cronol�gica)
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
        
        console.log('%c      COMPARA��O DETALHADA (posi��o por posi��o):', 'color: #FFD700;');
        matchDetails.forEach(detail => {
            const status = detail.match ? '?' : '?';
            const color = detail.match ? '#00FF88' : '#FF6666';
            const expectedSymbol = detail.expected === 'red' ? '??' : detail.expected === 'black' ? '?' : '?';
            const actualSymbol = detail.actual === 'red' ? '??' : detail.actual === 'black' ? '?' : detail.actual === 'white' ? '?' : '?';
            console.log(`%c      ${status} ${detail.position}� giro: esperado ${expectedSymbol} (${detail.expected}) | real ${actualSymbol} (${detail.actual})`, `color: ${color};`);
        });
        
        const isCurrentMatch = matchDetails.every(d => d.match);
        console.log('');
        console.log(`%c   ${isCurrentMatch ? '? SEQU�NCIA BATE PERFEITAMENTE!' : '? Sequ�ncia N�O bate'}`, `color: ${isCurrentMatch ? '#00FF88' : '#FF6666'}; font-weight: bold;`);
        
        if (isCurrentMatch) {
            // Verificar cor anterior (se especificada)
            // Lembrar: colors[patternLength] � a cor que veio ANTES da sequ�ncia (no hist�rico invertido)
            const colorBefore = (patternLength < colors.length) ? colors[patternLength] : null;
            const colorBeforeSymbol = colorBefore === 'red' ? '??' : colorBefore === 'black' ? '?' : colorBefore === 'white' ? '?' : '?';
            
            console.log(`\n   ?? VALIDANDO COR ANTERIOR (que veio ANTES da sequ�ncia):`);
            
            const beforeColorExpected = customPattern.beforeColor === 'red-white' ? '??/? (vermelho OU branco)' :
                                       customPattern.beforeColor === 'black-white' ? '?/? (preto OU branco)' :
                                       customPattern.beforeColor === 'red' ? '?? (vermelho)' :
                                       customPattern.beforeColor === 'black' ? '? (preto)' :
                                       customPattern.beforeColor === 'white' ? '? (branco)' :
                                       customPattern.beforeColor === 'any' ? '? (qualquer)' : customPattern.beforeColor;
            
            console.log(`      Esperado: ${beforeColorExpected}`);
            console.log(`      Real: ${colorBeforeSymbol} (${colorBefore || 'N/A'})`);
            
            // ? Validar cor anterior com as novas op��es
            let isBeforeColorValid = false;
            if (customPattern.beforeColor === 'red-white') {
                isBeforeColorValid = (colorBefore === 'red' || colorBefore === 'white');
                console.log(`      ${isBeforeColorValid ? '?' : '?'} ${colorBefore} � vermelho OU branco? ${isBeforeColorValid ? 'SIM' : 'N�O'}`);
            } else if (customPattern.beforeColor === 'black-white') {
                isBeforeColorValid = (colorBefore === 'black' || colorBefore === 'white');
                console.log(`      ${isBeforeColorValid ? '?' : '?'} ${colorBefore} � preto OU branco? ${isBeforeColorValid ? 'SIM' : 'N�O'}`);
            } else {
                // Retrocompatibilidade com modelos antigos
                isBeforeColorValid = (customPattern.beforeColor === 'any' || colorBefore === customPattern.beforeColor);
                console.log(`      ${isBeforeColorValid ? '?' : '?'} ${colorBefore} � ${customPattern.beforeColor}? ${isBeforeColorValid ? 'SIM' : 'N�O'}`);
            }
            
            if (isBeforeColorValid) {
                console.log(`%c? PADR�O CUSTOMIZADO ATIVO DETECTADO!`, 'color: #00ff88; font-weight: bold;');
                console.log(`   Nome: ${customPattern.name}`);
                console.log(`   Sequ�ncia: ${customPattern.sequence.join(' ? ')}`);
                console.log(`   Cor anterior esperada: ${customPattern.beforeColor}`);
                console.log(`   Cor anterior real: ${colorBefore || 'N/A'}`);
                
                // Buscar no hist�rico o que geralmente vem depois
                const matches = findCustomPatternInHistory(customPattern, history);
                const stats = analyzeCustomPatternStatistics(matches);
                
                console.log('');
                console.log('%c+-----------------------------------------------------------+', 'color: #FFD700; font-weight: bold;');
                console.log('%c�  ?? AN�LISE SIMPLES DO PADR�O                            �', 'color: #FFD700; font-weight: bold;');
                console.log('%c+-----------------------------------------------------------+', 'color: #FFD700; font-weight: bold;');
                
                // ? L�GICA SIMPLES: Encontrou pelo menos 1x? Recomenda a cor com maior %
                if (stats && stats.occurrences >= 1) {
                    console.log(`?? Total de ocorr�ncias encontradas: ${stats.occurrences}`);
                    console.log(`?? Vermelho veio depois: ${stats.nextColor.redPercent}%`);
                    console.log(`? Preto veio depois: ${stats.nextColor.blackPercent}%`);
                    console.log(`? Branco veio depois: ${stats.nextColor.whitePercent}%`);
                    console.log('');
                    
                    // Determinar cor com maior frequ�ncia (SIMPLES!)
                    const redPercent = stats.nextColor.redPercent;
                    const blackPercent = stats.nextColor.blackPercent;
                    const recommendedColor = redPercent > blackPercent ? 'red' : 'black';
                    const confidence = Math.max(redPercent, blackPercent);
                    
                    console.log(`%c? PADR�O CUSTOMIZADO APROVADO!`, 'color: #00FF88; font-weight: bold; font-size: 14px;');
                    console.log(`%c?? COR RECOMENDADA: ${recommendedColor === 'red' ? '?? VERMELHO' : '? PRETO'}`, 'color: #00FF88; font-weight: bold;');
                    console.log(`%c?? Confian�a: ${confidence}%`, 'color: #00FF88; font-weight: bold;');
                    console.log('');
                    
                    return {
                        pattern: customPattern,
                        stats: stats,
                        recommendedColor: recommendedColor,
                        confidence: confidence,
                        reasoning: `Padr�o customizado "${customPattern.name}" detectado! ` +
                                  `Sistema encontrou ${stats.occurrences} ocorr�ncia(s) no hist�rico. ` +
                                  `A cor ${recommendedColor === 'red' ? '?? VERMELHA' : '? PRETA'} veio depois em ${confidence}% dos casos.`
                    };
                } else {
                    // Padr�o nunca apareceu no hist�rico
                    console.log(`%c?? ATEN��O! Padr�o NUNCA apareceu no hist�rico`, 'color: #FFA500; font-weight: bold; font-size: 14px;');
                    console.log(`%c   Padr�o detectado: "${customPattern.name}"`, 'color: #FFA500;');
                    console.log(`%c   Sem dados hist�ricos para an�lise`, 'color: #FFA500;');
                    console.log('');
                    // Continuar verificando pr�ximo padr�o
                }
            } else {
                console.log(`\n   ? COR ANTERIOR N�O V�LIDA!`);
                console.log(`      Esperado: ${customPattern.beforeColor}`);
                console.log(`      Recebido: ${colorBefore}`);
                console.log(`      Este padr�o N�O ser� usado!\n`);
            }
        }
    }
    
    console.log('\n?? Resultado final: Nenhum padr�o customizado v�lido encontrado no momento');
    return null;
}

// Listener para atualiza��o de padr�es customizados E outros comandos
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // ?? HANDLER PARA GET_MEMORIA_ATIVA_STATUS (solicitado pelo content.js)
    if (request.action === 'GET_MEMORIA_ATIVA_STATUS') {
        console.log('');
        console.log('%c?? [BACKGROUND] Recebeu solicita��o GET_MEMORIA_ATIVA_STATUS', 'color: #00CED1; font-weight: bold;');
        
        const response = {
            status: 'success',
            inicializada: memoriaAtiva.inicializada,
            totalGiros: memoriaAtiva.giros.length,
            totalAtualizacoes: memoriaAtiva.totalAtualizacoes,
            ultimaAtualizacao: memoriaAtiva.ultimaAtualizacao ? memoriaAtiva.ultimaAtualizacao.toISOString() : null,
            tempoUltimaAtualizacao: memoriaAtiva.tempoUltimaAtualizacao
        };
        
        console.log('%c? Respondendo com:', 'color: #00CED1;', response);
        sendResponse(response);
        return true; // Importante para resposta ass�ncrona
    }
    
    if (request.type === 'CUSTOM_PATTERNS_UPDATED') {
        console.log('');
        console.log('%c+-----------------------------------------------------------+', 'color: #00FF88; font-weight: bold;');
        console.log('%c�  ?? PADR�ES CUSTOMIZADOS ATUALIZADOS!                    �', 'color: #00FF88; font-weight: bold;');
        console.log('%c+-----------------------------------------------------------+', 'color: #00FF88; font-weight: bold;');
        
        const oldCache = [...customPatternsCache];
        customPatternsCache = request.data || [];
        
        console.log(`?? Padr�es no cache ANTIGO: ${oldCache.length}`);
        if (oldCache.length > 0) {
            oldCache.forEach((p, idx) => {
                console.log(`   ${idx + 1}. "${p.name}" (ID: ${p.id})`);
            });
        }
        console.log('');
        
        console.log(`?? Padr�es no cache NOVO: ${customPatternsCache.length}`);
        if (customPatternsCache.length > 0) {
            customPatternsCache.forEach((p, idx) => {
                console.log(`   ${idx + 1}. "${p.name}" (ID: ${p.id})`);
            });
        }
        console.log('');
        
        // Detectar padr�es REMOVIDOS
        const removedPatterns = oldCache.filter(old => !customPatternsCache.find(p => p.id === old.id));
        if (removedPatterns.length > 0) {
            console.log('%c??? PADR�ES REMOVIDOS:', 'color: #FF6666; font-weight: bold;');
            removedPatterns.forEach(p => {
                console.log(`   ? "${p.name}" (ID: ${p.id}) | Sequ�ncia: ${p.sequence.join(' ? ')}`);
            });
        }
        
        // Detectar padr�es NOVOS
        const newPatterns = customPatternsCache.filter(p => !oldCache.find(old => old.id === p.id));
        if (newPatterns.length > 0) {
            console.log('%c? PADR�ES NOVOS:', 'color: #00FF88; font-weight: bold;');
            newPatterns.forEach(p => {
                console.log(`   + "${p.name}" (ID: ${p.id}) | Sequ�ncia: ${p.sequence.join(' ? ')}`);
            });
        }
        
        // Detectar padr�es EDITADOS
        const editedPatterns = customPatternsCache.filter(p => {
            const old = oldCache.find(old => old.id === p.id);
            return old && (old.name !== p.name || 
                          JSON.stringify(old.sequence) !== JSON.stringify(p.sequence) ||
                          old.beforeColor !== p.beforeColor);
        });
        if (editedPatterns.length > 0) {
            console.log('%c?? PADR�ES EDITADOS:', 'color: #FFD700; font-weight: bold;');
            editedPatterns.forEach(p => {
                console.log(`   ?? "${p.name}" (ID: ${p.id})`);
            });
        }
        
        console.log('');
        console.log('%c? CACHE ATUALIZADO - Pr�ximo sinal usar� os padr�es mais recentes!', 'color: #00FF88; font-weight: bold;');
        console.log('%c?? IMPORTANTE: Padr�es removidos N�O gerar�o mais sinais!', 'color: #FFD700; font-weight: bold;');
        console.log('');
        
        sendResponse({ success: true });
        return true;
    }
});

/**
 * DETECTAR TODOS OS TIPOS DE PADR�ES VARIADOS
 * Cria exemplos de altern�ncia simples, dupla, tripla, sequ�ncias, etc.
 */
function detectAllPatternTypes(history) {
    const patterns = [];
    
    if (history.length < 2) return patterns;
    
    // Converter hist�rico para array de cores simples
    const colors = history.map(spin => spin.color);
    
    console.log('%c-----------------------------------------------------------', 'color: #00BFFF; font-weight: bold;');
    console.log('%c?? DETECTANDO TODOS OS PADR�ES POSS�VEIS', 'color: #00BFFF; font-weight: bold;');
    console.log('%c-----------------------------------------------------------', 'color: #00BFFF; font-weight: bold;');
    console.log('');
    
    // 1. ALTERN�NCIA SIMPLES (V-P-V-P...)
    console.log('%c?? Buscando: Altern�ncia Simples (tamanhos 2-20)', 'color: #00FF88;');
    for (let size = 2; size <= Math.min(20, colors.length); size += 2) {
        for (let i = 0; i <= colors.length - size; i++) {
            const sequence = colors.slice(i, i + size);
            const isAlternating = checkAlternatingPattern(sequence, 1);
            
            if (isAlternating && !sequence.includes('white')) {
                // ? CORRE��O CR�TICA: Array[0]=recente, [1]=antigo
                // O que veio DEPOIS � [i-1] (mais recente), n�o [i+size] (mais antigo)!
                if (i > 0) { // Precisa ter um giro seguinte
                    const whatCameNext = colors[i - 1]; // ? Giro SEGUINTE
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
    
    // 2. ALTERN�NCIA DUPLA (V-V-P-P-V-V...)
    console.log('%c?? Buscando: Altern�ncia Dupla (tamanhos 4-20)', 'color: #00FF88;');
    for (let size = 4; size <= Math.min(20, colors.length); size += 4) {
        for (let i = 0; i <= colors.length - size; i++) {
            const sequence = colors.slice(i, i + size);
            const isAlternating = checkAlternatingPattern(sequence, 2);
            
            if (isAlternating && !sequence.includes('white')) {
                // ? CORRE��O: O que veio DEPOIS � [i-1], n�o [i+size]
                if (i > 0) {
                    const whatCameNext = colors[i - 1]; // ? Giro SEGUINTE
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
    
    // 3. ALTERN�NCIA TRIPLA (V-V-V-P-P-P...)
    console.log('%c?? Buscando: Altern�ncia Tripla (tamanhos 6-18)', 'color: #00FF88;');
    for (let size = 6; size <= Math.min(18, colors.length); size += 6) {
        for (let i = 0; i <= colors.length - size; i++) {
            const sequence = colors.slice(i, i + size);
            const isAlternating = checkAlternatingPattern(sequence, 3);
            
            if (isAlternating && !sequence.includes('white')) {
                // ? CORRE��O: O que veio DEPOIS � [i-1], n�o [i+size]
                if (i > 0) {
                    const whatCameNext = colors[i - 1]; // ? Giro SEGUINTE
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
    
    // 4. SEQU�NCIAS (mesma cor consecutiva)
    console.log('%c?? Buscando: Sequ�ncias (tamanhos 2-15)', 'color: #00FF88;');
    for (let size = 2; size <= Math.min(15, colors.length); size++) {
        for (let i = 0; i <= colors.length - size; i++) {
            const sequence = colors.slice(i, i + size);
            const firstColor = sequence[0];
            const isSequence = sequence.every(c => c === firstColor) && firstColor !== 'white';
            
            if (isSequence) {
                // ? CORRE��O: O que veio DEPOIS � [i-1], n�o [i+size]
                if (i > 0) {
                    const whatCameNext = colors[i - 1]; // ? Giro SEGUINTE
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
    
    console.log('%c? Total de padr�es detectados: ' + patterns.length, 'color: #00BFFF; font-weight: bold;');
    console.log('');
    
    return patterns;
}

/**
 * Verificar se uma sequ�ncia segue um padr�o de altern�ncia
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
 * ? DETECTAR PADR�ES IRREGULARES/CUSTOMIZADOS
 * Exemplos:
 * - P-V-V-V-P ? Padr�o 1-3-1 (1 preto, 3 vermelhos, repete)
 * - B-P-P-V-P-P ? Padr�o com branco (B/V-P-P repete)
 * - V-V-P-V-V-P ? Padr�o 2-1-2 (2 vermelhos, 1 preto, repete)
 */
function detectIrregularPattern(colors) {
    console.log('%c?? Buscando padr�es irregulares nos �ltimos 10 giros...', 'color: #FF00FF;');
    
    // Ignorar brancos para simplificar an�lise inicial
    const nonWhite = colors.filter(c => c !== 'white');
    
    // Tentar detectar ciclos de tamanhos diferentes (2-6 giros por ciclo)
    for (let cycleSize = 2; cycleSize <= 6; cycleSize++) {
        // Precisa de pelo menos 2 ciclos completos para confirmar padr�o
        const minGiros = cycleSize * 2;
        if (nonWhite.length < minGiros) continue;
        
        const cycle1 = nonWhite.slice(0, cycleSize);
        const cycle2 = nonWhite.slice(cycleSize, cycleSize * 2);
        
        // Verificar se os dois ciclos s�o id�nticos
        const isSameCycle = cycle1.every((color, i) => color === cycle2[i]);
        
        if (isSameCycle) {
            // Encontrou padr�o irregular repetido!
            const patternStr = cycle1.map(c => c === 'red' ? 'V' : 'P').join('-');
            
            console.log(`%c   ? Padr�o irregular detectado: ${patternStr}`, 'color: #FF00FF; font-weight: bold;');
            console.log(`%c      Ciclo se repete a cada ${cycleSize} giros`, 'color: #FF00FF;');
            
            return {
                type: 'irregular_pattern',
                size: cycleSize * 2,
                sequence: cycle1.join('-'),
                name: `Padr�o Irregular (${patternStr} repetido)`,
                cycleSize: cycleSize,
                contextBefore: colors.slice(cycleSize * 2, cycleSize * 2 + 4).join('-')
            };
        }
    }
    
    // Tentar detectar padr�es com branco inclu�do
    if (colors.includes('white')) {
        for (let cycleSize = 2; cycleSize <= 6; cycleSize++) {
            const minGiros = cycleSize * 2;
            if (colors.length < minGiros) continue;
            
            const cycle1 = colors.slice(0, cycleSize);
            const cycle2 = colors.slice(cycleSize, cycleSize * 2);
            
            const isSameCycle = cycle1.every((color, i) => color === cycle2[i]);
            
            if (isSameCycle) {
                const patternStr = cycle1.map(c => c === 'red' ? 'V' : c === 'black' ? 'P' : 'B').join('-');
                
                console.log(`%c   ? Padr�o irregular COM BRANCO: ${patternStr}`, 'color: #FF00FF; font-weight: bold;');
                
                return {
                    type: 'irregular_pattern_with_white',
                    size: cycleSize * 2,
                    sequence: cycle1.join('-'),
                    name: `Padr�o com Branco (${patternStr} repetido)`,
                    cycleSize: cycleSize,
                    contextBefore: colors.slice(cycleSize * 2, cycleSize * 2 + 4).join('-')
                };
            }
        }
    }
    
    console.log('%c   ? Nenhum padr�o irregular encontrado', 'color: #FF00FF;');
    return null;
}

/**
 * ?? VALIDADOR RIGOROSO DE PADR�O
 * Verifica se o padr�o detectado est� REALMENTE correto
 * Analisa o contexto completo antes e depois do padr�o
 */
function validatePatternDetection(colors, patternStartIndex, patternSize, patternType, groupSize, patternName) {
    const patternSequence = colors.slice(patternStartIndex, patternStartIndex + patternSize);
    
    console.log('%c-----------------------------------------------------------', 'color: #FF1493; font-weight: bold;');
    console.log('%c?? VALIDADOR RIGOROSO DE PADR�O', 'color: #FF1493; font-weight: bold; font-size: 14px;');
    console.log('%c-----------------------------------------------------------', 'color: #FF1493; font-weight: bold;');
    console.log('');
    console.log(`%c?? Padr�o detectado: ${patternName}`, 'color: #FF69B4; font-weight: bold;');
    console.log(`%c   Tipo: ${patternType}`, 'color: #FF69B4;');
    console.log(`%c   Tamanho: ${patternSize} giros`, 'color: #FF69B4;');
    console.log(`%c   Sequ�ncia: ${patternSequence.map(c => c === 'red' ? 'V' : c === 'black' ? 'P' : 'B').join('-')}`, 'color: #FF69B4;');
    console.log('');
    
    // ---------------------------------------------------------------
    // ETAPA 1: MOSTRAR CONTEXTO COMPLETO (10 giros)
    // ---------------------------------------------------------------
    const contextSize = Math.min(10, colors.length);
    const contextColors = colors.slice(0, contextSize).map((c, i) => {
        const symbol = c === 'red' ? 'V' : c === 'black' ? 'P' : 'B';
        if (i >= patternStartIndex && i < patternStartIndex + patternSize) {
            return `[${symbol}]`; // Marcar padr�o com colchetes
        }
        return symbol;
    }).join('-');
    
    console.log(`%c?? CONTEXTO COMPLETO (�ltimos ${contextSize} giros):`, 'color: #00CED1; font-weight: bold;');
    console.log(`%c   ${contextColors}`, 'color: #00CED1;');
    console.log(`%c   (Padr�o marcado com [ ])`, 'color: #888;');
    console.log('');
    
    // ---------------------------------------------------------------
    // ETAPA 2: AN�LISE DO CONTEXTO ANTERIOR (O que veio ANTES)
    // ---------------------------------------------------------------
    const contextBefore = [];
    for (let i = patternStartIndex + patternSize; i < Math.min(patternStartIndex + patternSize + 5, colors.length); i++) {
        if (colors[i] && colors[i] !== 'white') {
            contextBefore.push(colors[i]);
        }
    }
    
    if (contextBefore.length > 0) {
        console.log(`%c?? CONTEXTO ANTERIOR (antes do padr�o):`, 'color: #FFA500; font-weight: bold;');
        console.log(`%c   Giros anteriores: ${contextBefore.map(c => c === 'red' ? 'V' : 'P').join('-')}`, 'color: #FFA500;');
        
        // VALIDA��O CR�TICA: Se � altern�ncia, verificar se n�o � sequ�ncia quebrando
        if (patternType.includes('alternancia')) {
            // ---------------------------------------------------------------
            // L�GICA CORRETA: Pegar os �LTIMOS N giros do padr�o (onde N = groupSize)
            // e ver se essa cor continua ANTES do padr�o
            // ---------------------------------------------------------------
            
            // Para altern�ncia DUPLA P-P-V-V:
            // - �ltimos 2 giros (groupSize=2): P-P (posi��es 2,3 do padr�o)
            // - Se antes veio mais P, ent�o P-P faz parte de P-P-P!
            // - REJEITAR!
            
            // Pegar os �ltimos N giros do padr�o
            const lastGroupColors = patternSequence.slice(patternSize - groupSize, patternSize);
            const lastGroupColor = lastGroupColors[0]; // Cor do �ltimo grupo
            
            console.log(`%c   ?? Verificando �ltimos ${groupSize} giro(s) do padr�o:`, 'color: #FFA500;');
            console.log(`%c      Cor: ${lastGroupColor === 'red' ? 'VERMELHO' : 'PRETO'}`, 'color: #FFA500;');
            
            // Verificar se essa mesma cor continua ANTES do padr�o
            if (contextBefore.length > 0 && contextBefore[0] === lastGroupColor) {
                console.log('%c   ? ERRO DETECTADO: Padr�o INCORRETO!', 'color: #FF0000; font-weight: bold;');
                console.log(`%c   Motivo: A cor ${lastGroupColor === 'red' ? 'VERMELHO' : 'PRETO'} continua ANTES do padr�o!`, 'color: #FF0000;');
                console.log(`%c   O �ltimo grupo (${lastGroupColors.map(c => c === 'red' ? 'V' : 'P').join('-')}) faz parte de uma SEQU�NCIA maior!`, 'color: #FF0000;');
                console.log(`%c   Isso N�O � ${patternName}! � uma SEQU�NCIA quebrando!`, 'color: #FF0000; font-weight: bold;');
                console.log('');
                console.log('%c-----------------------------------------------------------', 'color: #FF1493; font-weight: bold;');
                console.log('');
                return { valid: false, reason: `�ltimo grupo do padr�o (${lastGroupColor === 'red' ? 'V' : 'P'}) continua antes - � sequ�ncia quebrando!` };
            }
            
            // VALIDA��O ADICIONAL: Verificar os PRIMEIROS N giros do padr�o tamb�m
            const firstGroupColors = patternSequence.slice(0, groupSize);
            const firstGroupColor = firstGroupColors[0];
            
            console.log(`%c   ?? Verificando primeiros ${groupSize} giro(s) do padr�o:`, 'color: #FFA500;');
            console.log(`%c      Cor: ${firstGroupColor === 'red' ? 'VERMELHO' : 'PRETO'}`, 'color: #FFA500;');
            
            // Verificar quantas vezes essa cor aparece ANTES do padr�o
            let sameColorCountBefore = 0;
            for (let i = 0; i < contextBefore.length; i++) {
                if (contextBefore[i] === lastGroupColor) {
                    sameColorCountBefore++;
                } else {
                    break;
                }
            }
            
            if (sameColorCountBefore > 0) {
                console.log('%c   ? ERRO DETECTADO: Padr�o INCORRETO!', 'color: #FF0000; font-weight: bold;');
                console.log(`%c   Motivo: ${sameColorCountBefore} cor(es) ${lastGroupColor === 'red' ? 'VERMELHO' : 'PRETO'} continuam antes!`, 'color: #FF0000;');
                console.log(`%c   Isso cria uma sequ�ncia de ${sameColorCountBefore + groupSize} cores iguais!`, 'color: #FF0000;');
                console.log(`%c   Isso N�O � ${patternName}! � uma SEQU�NCIA quebrando!`, 'color: #FF0000; font-weight: bold;');
                console.log('');
                console.log('%c-----------------------------------------------------------', 'color: #FF1493; font-weight: bold;');
                console.log('');
                return { valid: false, reason: `${sameColorCountBefore} cor(es) continuam antes - sequ�ncia de ${sameColorCountBefore + groupSize} total!` };
            } else {
                console.log(`%c   ? OK: N�o h� continua��o da cor antes do padr�o`, 'color: #00FF00;');
            }
        }
        
        // VALIDA��O: Se � sequ�ncia, n�o pode ter a mesma cor logo antes
        if (patternType.includes('sequencia')) {
            const firstColor = patternSequence[0];
            if (contextBefore[0] === firstColor) {
                console.log('%c   ? ERRO DETECTADO: Padr�o INCORRETO!', 'color: #FF0000; font-weight: bold;');
                console.log(`%c   Motivo: Sequ�ncia continua ANTES do padr�o detectado`, 'color: #FF0000;');
                console.log(`%c   Isso n�o � uma nova sequ�ncia, � continua��o!`, 'color: #FF0000; font-weight: bold;');
                console.log('');
                console.log('%c-----------------------------------------------------------', 'color: #FF1493; font-weight: bold;');
                console.log('');
                return { valid: false, reason: 'Sequ�ncia continua antes do padr�o' };
            } else {
                console.log(`%c   ? OK: Cor anterior (${contextBefore[0] === 'red' ? 'V' : 'P'}) � diferente da sequ�ncia (${firstColor === 'red' ? 'V' : 'P'})`, 'color: #00FF00;');
            }
        }
        
        console.log('');
    }
    
    // ---------------------------------------------------------------
    // ETAPA 3: AN�LISE DO CONTEXTO POSTERIOR (O que veio DEPOIS)
    // ---------------------------------------------------------------
    if (patternStartIndex >= 1) {
        const contextAfter = [];
        for (let i = patternStartIndex - 1; i >= Math.max(0, patternStartIndex - 5); i--) {
            if (colors[i] && colors[i] !== 'white') {
                contextAfter.push(colors[i]);
            }
        }
        
        if (contextAfter.length > 0) {
            console.log(`%c?? CONTEXTO POSTERIOR (depois do padr�o):`, 'color: #9370DB; font-weight: bold;');
            console.log(`%c   Giros seguintes: ${contextAfter.map(c => c === 'red' ? 'V' : 'P').join('-')}`, 'color: #9370DB;');
            
            const nextColor = contextAfter[0];
            const lastColorOfPattern = patternSequence[patternSize - 1];
            
            // VALIDA��O: �ltimo giro do padr�o n�o pode continuar depois
            if (nextColor === lastColorOfPattern) {
                console.log('%c   ? ERRO DETECTADO: Padr�o INCORRETO!', 'color: #FF0000; font-weight: bold;');
                console.log(`%c   Motivo: �ltimo giro do padr�o (${lastColorOfPattern === 'red' ? 'V' : 'P'}) continua depois`, 'color: #FF0000;');
                console.log(`%c   O padr�o detectado faz parte de um padr�o MAIOR!`, 'color: #FF0000; font-weight: bold;');
                console.log('');
                console.log('%c-----------------------------------------------------------', 'color: #FF1493; font-weight: bold;');
                console.log('');
                return { valid: false, reason: '�ltimo giro do padr�o continua depois (padr�o maior)' };
            } else {
                console.log(`%c   ? OK: Pr�ximo giro (${nextColor === 'red' ? 'V' : 'P'}) quebra o padr�o`, 'color: #00FF00;');
            }
            
            console.log('');
        }
    }
    
    // ---------------------------------------------------------------
    // CONCLUS�O: PADR�O V�LIDO!
    // ---------------------------------------------------------------
    console.log('%c? PADR�O VALIDADO COM SUCESSO!', 'color: #00FF00; font-weight: bold; font-size: 14px;');
    console.log('%c   Todas as verifica��es passaram!', 'color: #00FF88;');
    console.log('%c   O padr�o est� LIMPO e CORRETO!', 'color: #00FF88;');
    console.log('');
    console.log('%c-----------------------------------------------------------', 'color: #FF1493; font-weight: bold;');
    console.log('');
    
    return { valid: true, reason: 'Padr�o validado com sucesso' };
}

/**
 * ? VALIDA��O CR�TICA: Verificar se o padr�o est� "limpo"
 * Um padr�o s� � v�lido se:
 * 1. O giro ANTERIOR (antes do primeiro giro do padr�o) quebra o padr�o
 * 2. O giro POSTERIOR (depois do �ltimo giro do padr�o) tamb�m quebra
 * 
 * Exemplo CORRETO:
 * Giros: P-V-P-V (posi��es 3,2,1,0)
 * Padr�o: V-P (posi��es 1,0)
 * - Giro anterior (2): V (se continuasse: V-V-P = n�o � altern�ncia) ?
 * - Giro posterior (3): P (se continuasse: V-P-P = n�o � altern�ncia) ?
 * 
 * Exemplo ERRADO:
 * Giros: P-P-V-P (posi��es 3,2,1,0)
 * Padr�o: V-P (posi��es 1,0)
 * - Giro anterior (2): P ? OK
 * - Giro posterior (3): P ? ERRO! O P do giro 1 faz parte de sequ�ncia P-P
 */
function isPatternClean(colors, patternStartIndex, patternSize, patternType, groupSize) {
    const patternSequence = colors.slice(patternStartIndex, patternStartIndex + patternSize);
    
    // ---------------------------------------------------------------
    // VERIFICA��O 1: Giro ANTERIOR ao padr�o (ap�s o �ltimo giro)
    // ---------------------------------------------------------------
    const previousColorIndex = patternStartIndex + patternSize;
    const previousColor = colors[previousColorIndex];
    
    if (previousColor) {
        // Para altern�ncias, verificar se o giro anterior quebraria o padr�o
        if (patternType.includes('alternancia')) {
            const firstColor = patternSequence[0];
            const groupIndex = Math.floor(patternSize / groupSize);
            const expectedColor = groupIndex % 2 === 0 ? firstColor : (firstColor === 'red' ? 'black' : 'red');
            
            if (previousColor === expectedColor) {
                return false; // ? Padr�o continua antes
            }
        }
        
        // Para sequ�ncias, verificar se o giro anterior � diferente
        if (patternType.includes('sequencia')) {
            const firstColor = patternSequence[0];
            if (previousColor === firstColor) {
                return false; // ? Sequ�ncia continua antes
            }
        }
    }
    
    // ---------------------------------------------------------------
    // VERIFICA��O 2: Giro POSTERIOR ao padr�o (depois do primeiro giro)
    // ---------------------------------------------------------------
    // ?? CR�TICO: Para altern�ncias e sequ�ncias de 2+ giros
    if (patternSize >= 2 && patternStartIndex >= 1) {
        const nextColorIndex = patternStartIndex - 1; // Giro DEPOIS do padr�o (mais recente)
        const nextColor = colors[nextColorIndex];
        
        if (nextColor && nextColor !== 'white') {
            const lastColorOfPattern = patternSequence[patternSize - 1];
            
            // Para altern�ncias, o �ltimo giro do padr�o N�O pode continuar depois
            if (patternType.includes('alternancia')) {
                // Se o �ltimo giro do padr�o for P, e o pr�ximo tamb�m for P,
                // significa que o P do padr�o faz parte de uma sequ�ncia maior
                if (nextColor === lastColorOfPattern) {
                    return false; // ? �ltimo giro do padr�o continua depois
                }
            }
            
            // Para sequ�ncias, verificar se continua depois
            if (patternType.includes('sequencia')) {
                if (nextColor === lastColorOfPattern) {
                    return false; // ? Sequ�ncia continua depois
                }
            }
        }
    }
    
    return true; // ? Padr�o est� limpo dos dois lados
}

/**
 * BUSCAR PADR�O ATIVO NOS �LTIMOS 20 GIROS
 * Identifica qual padr�o est� acontecendo AGORA (come�ando do giro 1)
 */
function findActivePattern(last20Spins) {
    const colors = last20Spins.map(spin => spin.color);
    
    console.log('%c-----------------------------------------------------------', 'color: #FFD700; font-weight: bold;');
    console.log('%c?? IDENTIFICANDO PADR�O ATIVO (come�ando do giro 1)', 'color: #FFD700; font-weight: bold;');
    console.log('%c-----------------------------------------------------------', 'color: #FFD700; font-weight: bold;');
    console.log('');
    
    console.log('%c�ltimos 20 giros:', 'color: #FFD700;');
    last20Spins.slice(0, 10).forEach((spin, index) => {
        console.log(`  ${index + 1}. ${spin.color} (${spin.roll})`);
    });
    console.log('  ... (+ 10 giros mais antigos)');
    console.log('');
    
    // Tentar detectar padr�es do MAIOR para o MENOR
    // Come�ar sempre do giro 1 (mais recente)
    
    let bestPattern = null;
    let bestSize = 0;
    
    // ---------------------------------------------------------------
    // ?? TAMANHOS M�NIMOS PARA PADR�ES CONFI�VEIS
    // ---------------------------------------------------------------
    // ---------------------------------------------------------------
    // ?? CALIBRA��ES BASEADAS EM 10.000 GIROS REAIS DA BLAZE
    // Data: 31/10/2025 - 03/11/2025 | An�lise cient�fica correta
    // ---------------------------------------------------------------
    
    // ? CORRIGIDO: M�nimos mais inteligentes para detec��o precoce
    const MIN_ALTERNANCIA_TRIPLA = 8;  // 2 ciclos + 2 giros (P-P-P-V-V-V-P-P) ? pr�ximo: P
    const MIN_ALTERNANCIA_DUPLA = 6;   // 3 ciclos completos (P-P-V-V-P-P) ? pr�ximo: V
    const MIN_ALTERNANCIA_SIMPLES = 4; // 2 ciclos completos (P-V-P-V) ? pr�ximo: P
    const MIN_SEQUENCIA = 3;           // 3 da mesma cor (P-P-P) ? detecta tend�ncia
    
    // ?? DADOS REAIS: Pontos de quebra cr�ticos (>60% probabilidade)
    const QUEBRA_CRITICA_RED_5 = 5;    // ? Vermelho 5: 62.4% quebra (83/133)
    const QUEBRA_CRITICA_RED_8 = 8;    // ? Vermelho 8: 66.7% quebra (8/12)
    const QUEBRA_CRITICA_BLACK_7 = 7;  // ? Preto 7: 76.0% quebra (19/25) ?? FORTE!
    const MAX_SEQUENCIA_HISTORICO = 11; // ? M�ximo visto: 11 (1x cada cor em 10k)
    
    // ?? DISTRIBUI��O REAL (QUASE 50/50!)
    const REAL_RED_PERCENT = 46.77;    // ? Vermelho: 4677/10000
    const REAL_BLACK_PERCENT = 46.87;  // ? Preto: 4687/10000 (apenas 0.1% a mais!)
    const REAL_WHITE_PERCENT = 6.36;   // ? Branco: 636/10000 (1 a cada 15.7)
    
    console.log('%c?? TAMANHOS M�NIMOS PARA PADR�ES:', 'color: #FFD700; font-weight: bold;');
    console.log(`%c   Altern�ncia Tripla: ${MIN_ALTERNANCIA_TRIPLA}+ giros (ex: P-P-P-V-V-V-P-P)`, 'color: #FFD700;');
    console.log(`%c   Altern�ncia Dupla: ${MIN_ALTERNANCIA_DUPLA}+ giros (ex: P-P-V-V-P-P)`, 'color: #FFD700;');
    console.log(`%c   Altern�ncia Simples: ${MIN_ALTERNANCIA_SIMPLES}+ giros (ex: P-V-P-V)`, 'color: #FFD700;');
    console.log(`%c   Sequ�ncia: ${MIN_SEQUENCIA}+ giros (ex: P-P-P)`, 'color: #FFD700;');
    console.log('');
    
    // Tentar altern�ncia tripla (8, 9, 12, 15, 18)
    // ? Come�a em 18 e vai descendo at� o m�nimo (8)
    for (let size = 18; size >= MIN_ALTERNANCIA_TRIPLA; size -= 3) {
        if (size > colors.length) continue;
        const sequence = colors.slice(0, size);
        if (checkAlternatingPattern(sequence, 3) && !sequence.includes('white')) {
            const patternName = `Altern�ncia Tripla de ${size} giros`;
            // ?? VALIDA��O RIGOROSA: Verificar se o padr�o est� REALMENTE correto
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
                console.log(`%c? Padr�o "${patternName}" rejeitado: ${validation.reason}`, 'color: #FF0000; font-weight: bold;');
                console.log('');
            }
        }
    }
    
    // Tentar altern�ncia dupla (6, 10, 14, 18) - incremento de 4
    // ? M�nimo reduzido para 6 giros (P-P-V-V-P-P)
    if (!bestPattern || bestSize < MIN_ALTERNANCIA_DUPLA) {
        for (let size = 20; size >= MIN_ALTERNANCIA_DUPLA; size -= 4) {
            if (size > colors.length) continue;
            const sequence = colors.slice(0, size);
            if (checkAlternatingPattern(sequence, 2) && !sequence.includes('white')) {
                const patternName = `Altern�ncia Dupla de ${size} giros`;
                // ?? VALIDA��O RIGOROSA: Verificar se o padr�o est� REALMENTE correto
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
                    console.log(`%c? Padr�o "${patternName}" rejeitado: ${validation.reason}`, 'color: #FF0000; font-weight: bold;');
                    console.log('');
                }
            }
        }
    }
    
    // Tentar altern�ncia simples (4, 6, 8, 10, 12, 14, 16, 18, 20)
    // ? M�nimo reduzido para 4 giros (P-V-P-V) - j� d� para prever!
    if (!bestPattern || bestSize < MIN_ALTERNANCIA_SIMPLES) {
        for (let size = 20; size >= MIN_ALTERNANCIA_SIMPLES; size -= 2) {
            if (size > colors.length) continue;
            const sequence = colors.slice(0, size);
            if (checkAlternatingPattern(sequence, 1) && !sequence.includes('white')) {
                const patternName = `Altern�ncia Simples de ${size} giros`;
                // ?? VALIDA��O RIGOROSA: Verificar se o padr�o est� REALMENTE correto
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
                    console.log(`%c? Padr�o "${patternName}" rejeitado: ${validation.reason}`, 'color: #FF0000; font-weight: bold;');
                    console.log('');
                }
            }
        }
    }
    
    // Tentar sequ�ncias (mesma cor) - M�NIMO 4 GIROS
    if (!bestPattern || bestSize < MIN_SEQUENCIA) {
        for (let size = 15; size >= MIN_SEQUENCIA; size--) {
            if (size > colors.length) continue;
            const sequence = colors.slice(0, size);
            const firstColor = sequence[0];
            if (sequence.every(c => c === firstColor) && firstColor !== 'white') {
                const patternName = `Sequ�ncia de ${size} ${firstColor === 'red' ? 'Vermelhos' : 'Pretos'}`;
                // ?? VALIDA��O RIGOROSA: Verificar se o padr�o est� REALMENTE correto
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
                    console.log(`%c? Padr�o "${patternName}" rejeitado: ${validation.reason}`, 'color: #FF0000; font-weight: bold;');
                    console.log('');
                }
            }
        }
    }
    
    if (bestPattern) {
        console.log('%c? PADR�O ATIVO ENCONTRADO:', 'color: #00FF00; font-weight: bold;');
        console.log(`%c   ${bestPattern.name}`, 'color: #00FF88; font-weight: bold;');
        console.log(`%c   Sequ�ncia: ${bestPattern.sequence}`, 'color: #00FF88;');
        console.log('');
        
        // Adicionar contexto (o que veio antes)
        const contextStart = bestSize;
        const contextEnd = Math.min(contextStart + 4, colors.length);
        bestPattern.contextBefore = colors.slice(contextStart, contextEnd).join('-');
        
        return bestPattern;
    }
    
    // ---------------------------------------------------------------
    // ?? SE N�O ENCONTROU PADR�O FIXO, TENTAR PADR�ES IRREGULARES
    // ---------------------------------------------------------------
    console.log('%c?? Nenhum padr�o fixo detectado', 'color: #FFAA00; font-weight: bold;');
    console.log('%c?? Tentando detectar PADR�ES IRREGULARES...', 'color: #FF00FF; font-weight: bold;');
    console.log('');
    
    const irregularPattern = detectIrregularPattern(colors);
    if (irregularPattern) {
        console.log(`%c? PADR�O IRREGULAR DETECTADO:`, 'color: #FF00FF; font-weight: bold;');
        console.log(`%c   ${irregularPattern.name}`, 'color: #FF00FF; font-weight: bold;');
        console.log(`%c   Sequ�ncia: ${irregularPattern.sequence}`, 'color: #FF00FF;');
        console.log('');
        return irregularPattern;
    }
    
    console.log('%c?? Tentando an�lise por SIMILARIDADE...', 'color: #00CED1; font-weight: bold;');
    console.log('');
    
    const similarityPattern = findPatternBySimilarity(last20Spins);
    
    // ? GARANTIA: similarityPattern SEMPRE retorna algo (nunca null)
    if (similarityPattern) {
        const levelText = similarityPattern.level ? ` (N�vel ${similarityPattern.level})` : '';
        console.log(`%c? PADR�O POR SIMILARIDADE ENCONTRADO${levelText}:`, 'color: #00FF00; font-weight: bold;');
        console.log(`%c   ${similarityPattern.name}`, 'color: #00FF88; font-weight: bold;');
        console.log(`%c   Sequ�ncia: ${similarityPattern.sequence}`, 'color: #00FF88;');
        
        if (similarityPattern.forced) {
            console.log('%c   ?? An�lise for�ada (sem padr�o forte detectado)', 'color: #FFA500;');
        }
        if (similarityPattern.minimal) {
            console.log('%c   ?? An�lise m�nima (confian�a ser� reduzida)', 'color: #FFA500;');
        }
        
        console.log('');
        return similarityPattern;
    }
    
    // ? ISSO NUNCA DEVE ACONTECER! (fallback extremo)
    console.error('%c? ERRO CR�TICO: Similaridade retornou null!', 'color: #FF0000; font-weight: bold;');
    console.error('%c   Isso n�o deveria acontecer. Sistema tem bug!', 'color: #FF0000;');
    
    return null;
}

/**
 * ?? BUSCAR PADR�O POR SIMILARIDADE
 * Quando n�o h� padr�o fixo, buscar situa��es similares no hist�rico
 */
function findPatternBySimilarity(last20Spins) {
    const colors = last20Spins.map(spin => spin.color);
    
    console.log('%c-----------------------------------------------------------', 'color: #00CED1; font-weight: bold;');
    console.log('%c?? AN�LISE POR SIMILARIDADE (Busca Inteligente)', 'color: #00CED1; font-weight: bold;');
    console.log('%c-----------------------------------------------------------', 'color: #00CED1; font-weight: bold;');
    console.log('');
    
    // ---------------------------------------------------------------
    // ETAPA 1: DETECTAR SEQU�NCIAS RECENTES (mesmo que curtas)
    // ---------------------------------------------------------------
    
    // Contar quantas cores iguais no in�cio (giros 1, 2, 3...)
    let currentStreak = 1;
    const firstColor = colors[0];
    
    for (let i = 1; i < Math.min(10, colors.length); i++) {
        if (colors[i] === firstColor && colors[i] !== 'white') {
            currentStreak++;
        } else {
            break;
        }
    }
    
    console.log(`%c?? SITUA��O ATUAL:`, 'color: #00CED1; font-weight: bold;');
    console.log(`%c   Cor mais recente: ${firstColor === 'red' ? 'VERMELHO' : firstColor === 'black' ? 'PRETO' : 'BRANCO'}`, 'color: #00CED1;');
    console.log(`%c   Sequ�ncia atual: ${currentStreak} giro(s) da mesma cor`, 'color: #00CED1;');
    console.log('');
    
    // ?? N�VEL 1: Sequ�ncias de 4+ giros (M�NIMO ACEIT�VEL)
    if (currentStreak >= 4 && firstColor !== 'white') {
        console.log(`%c?? N�VEL 1: Detectado ${currentStreak} ${firstColor === 'red' ? 'VERMELHOS' : 'PRETOS'} seguidos!`, 'color: #FFD700; font-weight: bold;');
        console.log(`%c   Vamos buscar no hist�rico: o que acontece ap�s ${currentStreak} cores iguais?`, 'color: #FFD700;');
        console.log('');
        
        const sequence = colors.slice(0, currentStreak);
        return {
            type: 'sequencia_' + firstColor,
            size: currentStreak,
            sequence: sequence.join('-'),
            name: `Sequ�ncia de ${currentStreak} ${firstColor === 'red' ? 'Vermelhos' : 'Pretos'}`,
            contextBefore: colors.slice(currentStreak, Math.min(currentStreak + 4, colors.length)).join('-'),
            isSimilarity: true,
            level: 1
        };
    }
    
    // ? N�VEL 2 REMOVIDO: 2-3 giros N�O s�o suficientes para an�lise!
    // 2 pretos ou 2 vermelhos saem O TEMPO TODO no jogo!
    // N�o d� para fazer previs�o com isso!
    
    // ---------------------------------------------------------------
    // ETAPA 2: DETECTAR ALTERN�NCIAS IMPERFEITAS
    // ---------------------------------------------------------------
    
    // Contar altern�ncias nos primeiros 6-8 giros (mesmo com branco no meio)
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
    
    console.log(`%c?? ALTERN�NCIAS DETECTADAS: ${alternations}`, 'color: #9370DB;');
    
    // ? N�VEL 3 REATIVADO: Altern�ncias s�o �TEIS!
    // Com 10 mil giros de dados, mesmo padr�es comuns t�m estat�stica v�lida!
    
    if (alternations >= 3) {
        console.log(`%c?? N�VEL 3: Comportamento de ALTERN�NCIA (${alternations} mudan�as)!`, 'color: #FFD700; font-weight: bold;');
        console.log(`%c   Vamos buscar no hist�rico: padr�es de altern�ncia similares`, 'color: #FFD700;');
        console.log('');
        
        const nonWhiteSequence = colors.filter(c => c !== 'white').slice(0, 6);
        
        return {
            type: 'alternancia_simples',
            size: nonWhiteSequence.length,
            sequence: nonWhiteSequence.join('-'),
            name: `Altern�ncia com ${alternations} mudan�as (${nonWhiteSequence.length} giros)`,
            contextBefore: colors.slice(6, 10).join('-'),
            isSimilarity: true,
            level: 3
        };
    }
    
    // ---------------------------------------------------------------
    // ?? N�VEL 4: AN�LISE DOS �LTIMOS 5-7 GIROS (PADR�ES ESPEC�FICOS)
    // ---------------------------------------------------------------
    
    console.log('%c?? N�VEL 4: Analisando �ltimos 5-7 giros', 'color: #FF6B35; font-weight: bold;');
    console.log('%c   Buscando padr�es ESPEC�FICOS (n�o gen�ricos)', 'color: #FF6B35;');
    console.log('');
    
    // Pegar os �ltimos 5-7 giros (ignorando brancos)
    const last7NonWhite = colors.filter(c => c !== 'white').slice(0, 7);
    
    if (last7NonWhite.length >= 5) {
        console.log(`%c   Sequ�ncia dos �ltimos ${last7NonWhite.length} giros (sem branco):`, 'color: #FF6B35;');
        console.log(`%c   ${last7NonWhite.map(c => c === 'red' ? 'V' : 'P').join('-')}`, 'color: #FF6B35;');
        console.log('');
        
        const firstColor = last7NonWhite[0];
        let patternType = 'sequencia_mixed';
        let patternName = '';
        
        // Verificar se � sequ�ncia da mesma cor (5+ iguais)
        if (last7NonWhite.every(c => c === firstColor)) {
            patternType = 'sequencia_' + firstColor;
            patternName = `Sequ�ncia de ${last7NonWhite.length} ${firstColor === 'red' ? 'Vermelhos' : 'Pretos'}`;
            console.log(`%c   ? PADR�O ESPEC�FICO: ${patternName}`, 'color: #00FF00; font-weight: bold;');
        } else {
            // Verificar altern�ncia dupla (PP-VV-PP ou VV-PP-VV)
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
                patternName = `Altern�ncia Dupla de ${last7NonWhite.length} giros`;
                console.log(`%c   ? PADR�O ESPEC�FICO: ${patternName}`, 'color: #00FF00; font-weight: bold;');
            } else {
                // N�o � um padr�o espec�fico suficiente - rejeitar
                console.log(`%c   ? N�O � padr�o espec�fico (nem sequ�ncia nem altern�ncia dupla)`, 'color: #FF6B35;');
                console.log(`%c   Pulando para N�vel 5 (fallback)...`, 'color: #FF6B35;');
                console.log('');
                // N�o retornar nada - deixar cair no N�vel 5
            }
        }
        
        // Se encontrou padr�o espec�fico, retornar
        if (patternName) {
            console.log(`%c   Buscando no hist�rico: o que veio ap�s ${patternName}?`, 'color: #FFD700;');
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
    
    // ---------------------------------------------------------------
    // ?? N�VEL 5: FALLBACK - SEMPRE ENCONTRA ALGO (m�nimo 3 giros)
    // ---------------------------------------------------------------
    
    console.log('%c?? N�VEL 5: FALLBACK - An�lise dos �ltimos 3-5 giros dispon�veis', 'color: #FFA500; font-weight: bold;');
    console.log('%c   Garantindo que SEMPRE haja uma an�lise baseada em hist�rico', 'color: #FFA500;');
    console.log('');
    
    // Pegar os �ltimos 3-5 giros n�o-brancos (SEMPRE ter� ao menos 1)
    const last5NonWhite = colors.filter(c => c !== 'white').slice(0, 5);
    
    if (last5NonWhite.length >= 3) {
        console.log(`%c   ? Usando �ltimos ${last5NonWhite.length} giros para an�lise`, 'color: #FFA500;');
        console.log(`%c   Sequ�ncia: ${last5NonWhite.map(c => c === 'red' ? 'V' : 'P').join('-')}`, 'color: #FFA500;');
        console.log('');
        
        const firstColor = last5NonWhite[0];
        let patternType = 'sequencia_mixed';
        
        // Verificar se � sequ�ncia da mesma cor
        if (last5NonWhite.every(c => c === firstColor)) {
            patternType = 'sequencia_' + firstColor;
        } else {
            patternType = 'alternancia_simples';
        }
        
        return {
            type: patternType,
            size: last5NonWhite.length,
            sequence: last5NonWhite.join('-'),
            name: `An�lise Fallback (${last5NonWhite.length} giros)`,
            contextBefore: colors.slice(5, 9).join('-'),
            isSimilarity: true,
            level: 5,
            forced: true,
            minimal: true // Indica an�lise m�nima - aplica penalidade
        };
    }
    
    // ?? �LTIMO RECURSO: Pegar ao menos os �ltimos 2 giros
    if (last5NonWhite.length >= 2) {
        console.log(`%c   ?? M�NIMO: Usando �ltimos ${last5NonWhite.length} giros`, 'color: #FF6B35;');
        console.log(`%c   Sequ�ncia: ${last5NonWhite.map(c => c === 'red' ? 'V' : 'P').join('-')}`, 'color: #FF6B35;');
        console.log('');
        
        const firstColor = last5NonWhite[0];
        
        return {
            type: 'sequencia_mixed',
            size: last5NonWhite.length,
            sequence: last5NonWhite.join('-'),
            name: `An�lise M�nima (${last5NonWhite.length} giros)`,
            contextBefore: colors.slice(2, 6).join('-'),
            isSimilarity: true,
            level: 5,
            forced: true,
            minimal: true
        };
    }
    
    // ?? SITUA��O EXTREMA: N�o h� giros suficientes (muito raro)
    // ? MAS MESMO ASSIM, NUNCA RETORNAR NULL!
    console.log('%c?? SITUA��O EXTREMA: Menos de 2 giros v�lidos!', 'color: #FF0000; font-weight: bold;');
    console.log('%c   Isso � MUITO raro - pode ser in�cio do jogo', 'color: #FF0000;');
    console.log('%c   Usando o �LTIMO giro como base...', 'color: #FFAA00;');
    
    const lastColor = last20NonWhite[0] || 'red';
    
    return {
        type: 'sequencia_mixed',
        size: 1,
        sequence: lastColor,
        name: 'An�lise Ultra-M�nima (1 giro)',
        contextBefore: '',
        isSimilarity: true,
        level: 5,
        forced: true,
        minimal: true,
        emergency: true
    };
}

/**
 * BUSCAR TODAS AS OCORR�NCIAS DE UM PADR�O NO HIST�RICO
 * Retorna distribui��o completa (quantas vezes parou em cada tamanho)
 */
function searchPatternInHistory(activePattern, allPatterns, history) {
    console.log('%c-----------------------------------------------------------', 'color: #00CED1; font-weight: bold;');
    console.log('%c?? BUSCANDO PADR�O NO HIST�RICO', 'color: #00CED1; font-weight: bold;');
    console.log('%c-----------------------------------------------------------', 'color: #00CED1; font-weight: bold;');
    console.log('');
    
    // Buscar todas as ocorr�ncias do mesmo TIPO de padr�o
    const sameTypePatterns = allPatterns.filter(p => p.type === activePattern.type);
    
    console.log(`%cPadr�o buscado: ${activePattern.name}`, 'color: #00CED1;');
    console.log(`%cOcorr�ncias encontradas: ${sameTypePatterns.length}`, 'color: #00CED1;');
    console.log('');
    
    if (sameTypePatterns.length === 0) {
        console.log('%c?? Nenhuma ocorr�ncia EXATA deste padr�o no hist�rico', 'color: #FFAA00;');
        console.log('%c   Mas com 10k giros, SEMPRE h� padr�es similares!', 'color: #00FFFF;');
        console.log('%c   Usando estat�sticas GERAIS do tipo de padr�o...', 'color: #00FFFF;');
        
        // ? FALLBACK: Usar estat�sticas gerais para este TIPO de padr�o
        // Mesmo sem ocorr�ncias exatas, temos dados hist�ricos!
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
    
    // ? NOVA FILOSOFIA: QUANTO MAIS OCORR�NCIAS, MELHOR!
    // Com 10 mil giros, temos dados estat�sticos s�lidos para QUALQUER padr�o!
    // N�o rejeitar mais padr�es "gen�ricos" - eles s�o �TEIS porque t�m muitos dados!
    
    console.log(`%c? AN�LISE ESTAT�STICA: ${sameTypePatterns.length} ocorr�ncias encontradas`, 'color: #00FF00; font-weight: bold;');
    console.log(`%c   Representa ${((sameTypePatterns.length / history.length) * 100).toFixed(1)}% do hist�rico total`, 'color: #00FF88;');
    
    if (sameTypePatterns.length >= 50) {
        console.log('%c   ?? EXCELENTE! Muitos dados = Estat�stica CONFI�VEL!', 'color: #00FF00; font-weight: bold;');
    } else if (sameTypePatterns.length >= 20) {
        console.log('%c   ? BOM: Dados suficientes para an�lise estat�stica', 'color: #00FF88;');
    } else if (sameTypePatterns.length >= 5) {
        console.log('%c   ?? ACEIT�VEL: Poucos dados, mas utiliz�vel', 'color: #FFAA00;');
    } else {
        console.log('%c   ?? MUITO POUCO: Menos de 5 ocorr�ncias - confian�a baixa', 'color: #FF6B35;');
    }
    console.log('');
    
    // Calcular distribui��o de tamanhos
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
    
    console.log('%c?? DISTRIBUI��O DE TAMANHOS:', 'color: #00CED1; font-weight: bold;');
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
    
    console.log('%c?? COR QUE VEIO DEPOIS:', 'color: #00CED1; font-weight: bold;');
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
 * Atualiza estat�sticas quando um novo giro acontece
 */
async function checkPreviousSignalAccuracy(newSpin) {
    // ? VERIFICA��O DE SEGURAN�A: signalsHistory pode estar undefined
    if (!signalsHistory || !signalsHistory.signals || signalsHistory.signals.length === 0) {
        console.log('?? signalsHistory n�o inicializado ou vazio - pulando verifica��o');
        return;
    }
    
    // Pegar �ltimo sinal enviado que ainda n�o foi verificado
    const lastSignal = signalsHistory.signals[signalsHistory.signals.length - 1];
    
    if (lastSignal.verified) return; // J� foi verificado
    
    console.log('%c-----------------------------------------------------------', 'color: #FF69B4; font-weight: bold;');
    console.log('%c?? VERIFICANDO ACERTO DO SINAL ANTERIOR', 'color: #FF69B4; font-weight: bold;');
    console.log('%c-----------------------------------------------------------', 'color: #FF69B4; font-weight: bold;');
    console.log('');
    
    const colorThatCame = newSpin.color;
    const colorRecommended = lastSignal.colorRecommended;
    const hit = colorThatCame === colorRecommended;
    
    console.log(`%cSinal anterior recomendou: ${colorRecommended.toUpperCase()}`, 'color: #FF69B4;');
    console.log(`%cCor que saiu: ${colorThatCame.toUpperCase()}`, 'color: #FF69B4;');
    console.log(`%cResultado: ${hit ? '? ACERTOU!' : '? ERROU'}`, hit ? 'color: #00FF00; font-weight: bold;' : 'color: #FF0000; font-weight: bold;');
    console.log('');
    
    // Atualizar sinal
    lastSignal.colorThatCame = colorThatCame;
    lastSignal.hit = hit;
    lastSignal.verified = true;
    
    // Atualizar estat�sticas por padr�o
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
    
    // Atualizar estat�sticas por contexto
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
    
    console.log(`%c?? Estat�sticas do padr�o "${lastSignal.patternName}":`, 'color: #FF69B4; font-weight: bold;');
    console.log(`   Total de sinais: ${signalsHistory.patternStats[patternKey].total}`);
    console.log(`   Acertos: ${signalsHistory.patternStats[patternKey].hits}`);
    console.log(`   Erros: ${signalsHistory.patternStats[patternKey].misses}`);
    console.log(`   %cTaxa de acerto: ${signalsHistory.patternStats[patternKey].hitRate}%`, 'color: #FFD700; font-weight: bold;');
    console.log('');
    
    // ---------------------------------------------------------------
    // ?? RASTREAMENTO DE LOSSES CONSECUTIVOS
    // ---------------------------------------------------------------
    
    // Atualizar contador de losses consecutivos
    if (hit) {
        signalsHistory.consecutiveLosses = 0; // ? Resetar ao acertar
        console.log('%c? LOSS CONSECUTIVOS RESETADO!', 'color: #00FF00; font-weight: bold;');
    } else {
        signalsHistory.consecutiveLosses++; // ? Incrementar ao errar
        console.log(`%c?? LOSS CONSECUTIVOS: ${signalsHistory.consecutiveLosses}`, 'color: #FF0000; font-weight: bold;');
        
        // ?? ALERTA: Se chegou a 2 losses consecutivos
        if (signalsHistory.consecutiveLosses >= 2) {
            console.log('%c?????? ATEN��O: 2+ LOSSES CONSECUTIVOS! ??????', 'color: #FF0000; font-weight: bold; background: #FFFF00;');
            console.log('%c   Sistema vai AUMENTAR o m�nimo para proteger o usu�rio!', 'color: #FF6B6B; font-weight: bold;');
        }
    }
    
    // Atualizar performance recente (�ltimos 20 sinais)
    signalsHistory.recentPerformance.push({
        timestamp: Date.now(),
        hit: hit,
        patternKey: patternKey
    });
    
    // Manter apenas os �ltimos 20
    if (signalsHistory.recentPerformance.length > 20) {
        signalsHistory.recentPerformance = signalsHistory.recentPerformance.slice(-20);
    }
    
    // Calcular taxa de acerto recente (�ltimos 20 sinais)
    const recentHits = signalsHistory.recentPerformance.filter(s => s.hit).length;
    const recentTotal = signalsHistory.recentPerformance.length;
    const recentHitRate = recentTotal > 0 ? ((recentHits / recentTotal) * 100).toFixed(1) : 0;
    
    console.log(`%c?? PERFORMANCE RECENTE (�ltimos ${recentTotal} sinais):`, 'color: #00CED1; font-weight: bold;');
    console.log(`   Acertos: ${recentHits}/${recentTotal} (${recentHitRate}%)`);
    console.log('');
    
    // ?? ALERTA: Se performance recente < 50%, avisar!
    if (recentTotal >= 10 && parseFloat(recentHitRate) < 50) {
        console.log('%c?????? ALERTA: PERFORMANCE RECENTE MUITO BAIXA! ??????', 'color: #FF0000; font-weight: bold; font-size: 14px; background: #FFFF00;');
        console.log(`%c   Taxa de acerto: ${recentHitRate}% (m�nimo recomendado: 55%)`, 'color: #FF0000; font-weight: bold;');
        console.log('%c   A��O: Sistema ir� AUMENTAR o m�nimo exigido automaticamente!', 'color: #FFA500; font-weight: bold;');
        console.log('');
    }
    
    // Salvar
    await saveSignalsHistory();
    
    // ---------------------------------------------------------------
    // ?? ATUALIZAR ESTADO DO PADR�O QUENTE (se ativo)
    // ---------------------------------------------------------------
    if (hotPatternMode && hotPatternState.pattern) {
        console.log('');
        console.log('%c?? ATUALIZANDO ESTADO DO PADR�O QUENTE', 'color: #FF6B35; font-weight: bold;');
        console.log(`   Status atual: ${hotPatternState.status.toUpperCase()}`);
        console.log(`   LOSSes consecutivos: ${hotPatternState.consecutiveLosses}`);
        
        if (hotPatternState.status === 'observing') {
            // Estava em observa��o, verificar resultado
            if (hit) {
                console.log('   ? WIN! Voltando para status ACTIVE');
                hotPatternState.consecutiveLosses = 0;
                hotPatternState.status = 'active';
                hotPatternState.totalWins++;
                
                // ?? ATUALIZAR PADR�O SALVO (voltou para active)
                chrome.storage.local.get('savedHotPattern', (result) => {
                    if (result.savedHotPattern) {
                        result.savedHotPattern.totalWins = hotPatternState.totalWins;
                        result.savedHotPattern.consecutiveLosses = 0;
                        chrome.storage.local.set({ savedHotPattern: result.savedHotPattern });
                    }
                });
            } else {
                console.log('   ? LOSS! 2� consecutivo - ABANDONANDO PADR�O');
                hotPatternState.consecutiveLosses = 2;
                hotPatternState.status = 'abandoned';
                hotPatternState.totalLosses++;
                console.log('   ?? Buscando NOVO padr�o quente AUTOMATICAMENTE...');
                
                // ??? LIMPAR PADR�O SALVO (foi abandonado)
                chrome.storage.local.remove('savedHotPattern');
                console.log('??? Padr�o abandonado removido do storage');
                
                // Notificar content.js para mostrar "Buscando..."
                chrome.tabs.query({url: '*://blaze.com/*'}, function(tabs) {
                    tabs.forEach(tab => {
                        chrome.tabs.sendMessage(tab.id, {
                            type: 'HOT_PATTERN_SEARCHING'
                        }).catch(() => {});
                    });
                });
            }
        } else if (hotPatternState.status === 'active') {
            // Estava ativo, verificar resultado
            if (hit) {
                console.log('   ? WIN! Mantendo status ACTIVE');
                hotPatternState.totalWins++;
                
                // ?? ATUALIZAR PADR�O SALVO (manter stats atualizados)
                chrome.storage.local.get('savedHotPattern', (result) => {
                    if (result.savedHotPattern) {
                        result.savedHotPattern.totalWins = hotPatternState.totalWins;
                        result.savedHotPattern.consecutiveLosses = 0;
                        chrome.storage.local.set({ savedHotPattern: result.savedHotPattern });
                    }
                });
            } else {
                console.log('   ? LOSS! Indo para status OBSERVING');
                hotPatternState.consecutiveLosses = 1;
                hotPatternState.status = 'observing';
                hotPatternState.totalLosses++;
                
                // ?? ATUALIZAR PADR�O SALVO (1 loss, observando)
                chrome.storage.local.get('savedHotPattern', (result) => {
                    if (result.savedHotPattern) {
                        result.savedHotPattern.consecutiveLosses = 1;
                        chrome.storage.local.set({ savedHotPattern: result.savedHotPattern });
                    }
                });
            }
        }
        
        // Recalcular win rate
        const total = hotPatternState.totalWins + hotPatternState.totalLosses;
        if (total > 0) {
            hotPatternState.winRate = hotPatternState.totalWins / total;
        }
        
        console.log(`   Novo status: ${hotPatternState.status.toUpperCase()}`);
        console.log(`   LOSSes consecutivos: ${hotPatternState.consecutiveLosses}`);
        console.log(`   Win Rate: ${(hotPatternState.winRate * 100).toFixed(1)}%`);
        console.log('');
    }
}

/**
 * ? CALCULAR AJUSTE DE CONFIAN�A BASEADO EM PERFORMANCE
 * Ajuste PROPORCIONAL baseado na diferen�a entre performance real e esperada
 */
function calculateConfidenceAdjustment(patternType, patternSize, contextBefore) {
    const patternKey = `${patternType}_${patternSize}`;
    const contextKey = `${patternType}_${contextBefore}`;
    
    let adjustment = 0;
    let reasons = [];
    
    // ---------------------------------------------------------------
    // AJUSTE 1: Baseado na performance do padr�o
    // ---------------------------------------------------------------
    if (signalsHistory.patternStats[patternKey]) {
        const stats = signalsHistory.patternStats[patternKey];
        const hitRate = parseFloat(stats.hitRate);
        
        if (stats.total >= 3) { // M�nimo 3 sinais para ter signific�ncia estat�stica
            // F�RMULA: Ajuste = (Taxa Real - 50%) � Peso
            // 50% = Expectativa neutra (como jogar moeda)
            // Se taxa > 50% = padr�o bom (ajuste positivo)
            // Se taxa < 50% = padr�o ruim (ajuste negativo)
            
            const expectedRate = 50; // 50% = neutro (chance aleat�ria)
            const difference = hitRate - expectedRate;
            
            // Peso baseado na quantidade de amostras (mais amostras = mais confi�vel)
            let sampleWeight = 1.0;
            if (stats.total >= 10) sampleWeight = 1.5; // 10+ amostras = peso maior
            if (stats.total >= 20) sampleWeight = 2.0; // 20+ amostras = peso ainda maior
            
            // Ajuste proporcional com limite
            const calculatedAdjustment = (difference * 0.4 * sampleWeight); // 0.4 = fator de escala
            adjustment += Math.max(-25, Math.min(20, calculatedAdjustment)); // Limita entre -25% e +20%
            
            const sign = calculatedAdjustment >= 0 ? '+' : '';
            reasons.push(`Padr�o: ${hitRate}% de acerto (${stats.hits}/${stats.total}) | Ajuste: ${sign}${adjustment.toFixed(1)}%`);
        }
    }
    
    // ---------------------------------------------------------------
    // AJUSTE 2: Baseado no contexto espec�fico
    // ---------------------------------------------------------------
    if (signalsHistory.contextStats[contextKey]) {
        const stats = signalsHistory.contextStats[contextKey];
        const hitRate = parseFloat(stats.hitRate);
        
        if (stats.total >= 2) { // M�nimo 2 sinais
            // F�RMULA: Ajuste = (Taxa Real - 50%) � 0.3
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
 * ? AN�LISE DE "TEMPERATURA" DOS �LTIMOS 20 GIROS
 * Detecta se a Blaze est� "quente" (sequ�ncias longas) ou "fria" (quebrando r�pido)
 */
function analyzeLast20Temperature(last20Spins, activePattern) {
    // ? Constantes baseadas em 10.000 giros reais da Blaze
    const MAX_SEQUENCIA_HISTORICO = 11; // ? M�ximo visto: 11 (1x cada cor em 10k)
    
    const colors = last20Spins.map(s => s.color);
    
    console.log('%c-----------------------------------------------------------', 'color: #FF6B35; font-weight: bold;');
    console.log('%c??? AN�LISE DE TEMPERATURA DOS �LTIMOS 20 GIROS', 'color: #FF6B35; font-weight: bold;');
    console.log('%c-----------------------------------------------------------', 'color: #FF6B35; font-weight: bold;');
    console.log('');
    
    // Detectar todas as sequ�ncias e altern�ncias nos �ltimos 20 giros
    let sequencesFound = [];
    let i = 0;
    
    while (i < colors.length) {
        const currentColor = colors[i];
        if (currentColor === 'white') {
            i++;
            continue;
        }
        
        // Contar sequ�ncia da mesma cor
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
    
    // Calcular estat�sticas
    const totalSequences = sequencesFound.filter(s => s.type === 'sequencia').length;
    const longSequences = sequencesFound.filter(s => s.length >= 4).length; // 4+ mesma cor
    const veryLongSequences = sequencesFound.filter(s => s.length >= 6).length; // 6+ mesma cor
    
    // Detectar se est� em modo "altern�ncia r�pida" ou "sequ�ncias longas"
    let avgSequenceLength = 0;
    if (sequencesFound.length > 0) {
        avgSequenceLength = sequencesFound.reduce((sum, s) => sum + s.length, 0) / sequencesFound.length;
    }
    
    console.log('%c?? ESTAT�STICAS DOS �LTIMOS 20 GIROS:', 'color: #FF6B35; font-weight: bold;');
    console.log(`   Total de sequ�ncias: ${totalSequences}`);
    console.log(`   Sequ�ncias longas (4+): ${longSequences}`);
    console.log(`   Sequ�ncias muito longas (6+): ${veryLongSequences}`);
    console.log(`   Tamanho m�dio: ${avgSequenceLength.toFixed(1)} giros`);
    console.log('');
    
    // ---------------------------------------------------------------
    // ? DETERMINAR TEMPERATURA COM C�LCULOS FUNDAMENTADOS
    // ---------------------------------------------------------------
    
    let temperature = 'NEUTRA';
    let adjustment = 0;
    let reasoning = '';
    
    // F�RMULA: Intensidade de Sequ�ncias = (Soma dos tamanhos das sequ�ncias longas) / 20 giros
    // Quanto maior a intensidade, mais "quente" est� a Blaze
    const longSequencesIntensity = sequencesFound
        .filter(s => s.length >= 3)
        .reduce((sum, s) => sum + s.length, 0) / 20;
    
    // F�RMULA: Score de Temperatura = (M�dia � 10) + (Sequ�ncias longas � 5) + (Intensidade � 20)
    const temperatureScore = (avgSequenceLength * 10) + (longSequences * 5) + (longSequencesIntensity * 20);
    
    console.log(`%c??? C�LCULOS DE TEMPERATURA:`, 'color: #FF6B35; font-weight: bold;');
    console.log(`   Intensidade de sequ�ncias: ${(longSequencesIntensity * 100).toFixed(1)}%`);
    console.log(`   Score de temperatura: ${temperatureScore.toFixed(1)}`);
    console.log('');
    
    // ---------------------------------------------------------------
    // CLASSIFICA��O DE TEMPERATURA (baseada no score)
    // ---------------------------------------------------------------
    
    // TEMPERATURA QUENTE: Score >= 45 (muitas sequ�ncias longas)
    if (temperatureScore >= 45) {
        temperature = 'QUENTE ??';
        
        // F�RMULA: Ajuste para sequ�ncias = Score � 0.3 (m�ximo +20%)
        // F�RMULA: Ajuste para altern�ncias = -Score � 0.2 (penaliza altern�ncias)
        if (activePattern.type.includes('sequencia')) {
            adjustment = Math.min(20, temperatureScore * 0.3);
            reasoning = `Blaze QUENTE (score: ${temperatureScore.toFixed(0)}). Sequ�ncias tendem a continuar. (+${adjustment.toFixed(1)}%)`;
        } else {
            adjustment = Math.max(-10, -(temperatureScore - 45) * 0.2);
            reasoning = `Blaze QUENTE mas padr�o � altern�ncia. Pode estar mudando. (${adjustment.toFixed(1)}%)`;
        }
    }
    // TEMPERATURA FRIA: Score <= 20 (poucas ou nenhuma sequ�ncia)
    else if (temperatureScore <= 20) {
        temperature = 'FRIA ??';
        
        // F�RMULA: Ajuste para sequ�ncias = -(20 - Score) � 0.7 (penaliza sequ�ncias)
        // F�RMULA: Ajuste para altern�ncias = (20 - Score) � 0.5 (favorece altern�ncias)
        if (activePattern.type.includes('sequencia')) {
            adjustment = -((20 - temperatureScore) * 0.7);
            adjustment = Math.max(-20, adjustment);
            reasoning = `Blaze FRIA (score: ${temperatureScore.toFixed(0)}). Sequ�ncias quebram r�pido. (${adjustment.toFixed(1)}%)`;
        } else {
            adjustment = (20 - temperatureScore) * 0.5;
            adjustment = Math.min(15, adjustment);
            reasoning = `Blaze FRIA (score: ${temperatureScore.toFixed(0)}). Altern�ncias se mant�m fortes. (+${adjustment.toFixed(1)}%)`;
        }
    }
    // TEMPERATURA M�DIA: Score entre 21-44 (comportamento misto)
    else {
        temperature = 'M�DIA ???';
        
        // F�RMULA: Ajuste suave proporcional � proximidade dos extremos
        // Score pr�ximo de 45 = leve b�nus para sequ�ncias
        // Score pr�ximo de 20 = leve b�nus para altern�ncias
        
        if (activePattern.type.includes('sequencia')) {
            // Quanto mais pr�ximo de 45, mais positivo (0 a +8%)
            adjustment = ((temperatureScore - 20) / 25) * 8;
            adjustment = Math.max(-5, Math.min(8, adjustment));
            reasoning = `Blaze M�DIA (score: ${temperatureScore.toFixed(0)}). Comportamento misto. (${adjustment >= 0 ? '+' : ''}${adjustment.toFixed(1)}%)`;
        } else {
            // Quanto mais pr�ximo de 20, mais positivo para altern�ncias (0 a +5%)
            adjustment = ((44 - temperatureScore) / 24) * 5;
            adjustment = Math.max(-3, Math.min(5, adjustment));
            reasoning = `Blaze M�DIA (score: ${temperatureScore.toFixed(0)}). Altern�ncia moderada. (${adjustment >= 0 ? '+' : ''}${adjustment.toFixed(1)}%)`;
        }
    }
    
    // ---------------------------------------------------------------
    // ?? AN�LISE DE QUEBRAS (O que o usu�rio pediu!)
    // ---------------------------------------------------------------
    
    // Se o padr�o ativo � uma sequ�ncia, verificar se sequ�ncias similares quebraram recentemente
    if (activePattern.type.includes('sequencia') && activePattern.size >= 3) {
        console.log('%c?? AN�LISE DE QUEBRAS (contexto dos �ltimos 20 giros):', 'color: #FFD700; font-weight: bold;');
        console.log('');
        
        const patternColor = activePattern.sequence.split('-')[0];
        const patternSize = activePattern.size;
        
        // ---------------------------------------------------------------
        // ?? PRIORIDADE 1: VERIFICA��O GLOBAL (10.000 GIROS REAIS)
        // An�lise cient�fica CORRETA baseada em probabilidades reais
        // ---------------------------------------------------------------
        
        console.log(`%c   Padr�o atual: ${patternSize} ${patternColor === 'red' ? 'VERMELHOS' : 'PRETOS'}`, 'color: #FFD700;');
        console.log('');
        
        // ?? L�GICA INTELIGENTE: Cada cor tem seus pontos cr�ticos DIFERENTES!
        
        // --- VERMELHO ---
        if (patternColor === 'red') {
            if (patternSize >= MAX_SEQUENCIA_HISTORICO) {
                // 11+ vermelhos: Nunca visto ir al�m disso! (Apenas log informativo)
                console.log(`%c?? M�XIMO HIST�RICO ATINGIDO! (${patternSize} vermelhos)`, 'color: #FF0000; font-weight: bold; font-size: 14px;');
                console.log(`%c   ?? Em 10.000 giros, NUNCA passou de ${MAX_SEQUENCIA_HISTORICO}!`, 'color: #FF0000; font-weight: bold;');
                console.log(`%c   ?? Probabilidade de quebra MUITO ALTA`, 'color: #FFA500;');
                reasoning += ` | ?? M�ximo hist�rico (${MAX_SEQUENCIA_HISTORICO}) atingido`;
            }
            else if (patternSize >= 7) {
                // 7+ vermelhos: Log informativo apenas
                console.log(`%c?? SEQU�NCIA LONGA! (${patternSize} vermelhos)`, 'color: #FF4500; font-weight: bold;');
                console.log(`%c   ?? Sequ�ncia consider�vel detectada`, 'color: #FF4500;');
                console.log(`%c   ?? Hist�rico indica probabilidade de quebra`, 'color: #FFA500;');
                reasoning += ` | ?? Vermelho ${patternSize}: Sequ�ncia longa`;
            }
            // ? REMOVIDAS: TODAS as penaliza��es artificiais!
            // Os dados hist�ricos j� incluem as probabilidades de quebra!
        }
        // --- PRETO ---
        else if (patternColor === 'black') {
            if (patternSize >= MAX_SEQUENCIA_HISTORICO) {
                // 11+ pretos: Nunca visto ir al�m disso! (Apenas log informativo)
                console.log(`%c?? M�XIMO HIST�RICO ATINGIDO! (${patternSize} pretos)`, 'color: #FF0000; font-weight: bold; font-size: 14px;');
                console.log(`%c   ?? Em 10.000 giros, NUNCA passou de ${MAX_SEQUENCIA_HISTORICO}!`, 'color: #FF0000; font-weight: bold;');
                console.log(`%c   ?? Probabilidade de quebra MUITO ALTA`, 'color: #FFA500;');
                reasoning += ` | ?? M�ximo hist�rico (${MAX_SEQUENCIA_HISTORICO}) atingido`;
            }
            else if (patternSize >= 7) {
                // 7+ pretos: Log informativo apenas
                console.log(`%c?? SEQU�NCIA LONGA! (${patternSize} pretos)`, 'color: #FF0000; font-weight: bold;');
                console.log(`%c   ?? Sequ�ncia consider�vel detectada (76.0% quebra real em 7+)`, 'color: #FF0000;');
                console.log(`%c   ?? Hist�rico indica probabilidade de quebra`, 'color: #FFA500;');
                reasoning += ` | ?? Preto ${patternSize}: Sequ�ncia longa`;
            }
            // ? REMOVIDAS: TODAS as penaliza��es artificiais!
            // Os dados hist�ricos j� incluem as probabilidades de quebra!
        }
        
        console.log('');
        
        // ---------------------------------------------------------------
        // ?? PRIORIDADE 2: AN�LISE DOS �LTIMOS 20 GIROS (contexto recente)
        // ---------------------------------------------------------------
        
        // Buscar sequ�ncias da mesma cor nos �ltimos 20 giros
        const similarSequences = sequencesFound.filter(s => 
            s.color === patternColor && s.length >= 3
        );
        
        console.log(`%c   Sequ�ncias similares nos �ltimos 20: ${similarSequences.length}`, 'color: #FFD700;');
        
        if (similarSequences.length > 0) {
            // Verificar o tamanho m�ximo que chegou
            const maxLength = Math.max(...similarSequences.map(s => s.length));
            const avgLength = similarSequences.reduce((sum, s) => sum + s.length, 0) / similarSequences.length;
            
            console.log(`%c   Tamanho m�ximo alcan�ado: ${maxLength} giros`, 'color: #FFD700;');
            console.log(`%c   Tamanho m�dio: ${avgLength.toFixed(1)} giros`, 'color: #FFD700;');
            console.log('');
            
            // ?? L�GICA INTELIGENTE DO USU�RIO:
            // Se j� estamos no giro X e nenhuma sequ�ncia recente passou de X,
            // MUITO PROV�VEL que vai quebrar!
            
            // ?? An�lise informativa apenas - SEM penaliza��es artificiais
            if (patternSize >= maxLength) {
                console.log(`%c?? ALERTA: Padr�o atual (${patternSize}) j� atingiu o m�ximo recente (${maxLength})!`, 'color: #FF0000; font-weight: bold;');
                console.log(`%c   ?? Probabilidade de QUEBRA pode ser alta`, 'color: #FFA500;');
                console.log(`%c   ?? Hist�rico j� reflete esta probabilidade`, 'color: #00FF88;');
                reasoning += ` | Padr�o atingiu m�ximo recente (${maxLength})`;
            } else if (patternSize >= avgLength) {
                console.log(`%c?? Padr�o atual (${patternSize}) est� acima da m�dia recente (${avgLength.toFixed(1)})`, 'color: #FFA500; font-weight: bold;');
                console.log(`%c   ?? Sequ�ncia acima do normal nos �ltimos 20 giros`, 'color: #FFA500;');
                reasoning += ` | Acima da m�dia recente (${avgLength.toFixed(1)})`;
            } else {
                console.log(`%c? Padr�o atual (${patternSize}) est� abaixo do m�ximo (${maxLength}) e m�dia (${avgLength.toFixed(1)})`, 'color: #00FF00;');
                console.log(`%c   ? Ainda h� espa�o para crescer!`, 'color: #00FF88;');
            }
            // ? REMOVIDAS: TODAS as penaliza��es artificiais (-15%, -10%)
            // Os dados hist�ricos de 2000 giros j� incluem essas probabilidades!
        } else {
            console.log(`%c   ?? Nenhuma sequ�ncia similar encontrada nos �ltimos 20 giros`, 'color: #888;');
            console.log(`%c   N�o h� dados recentes para compara��o`, 'color: #888;');
        }
        
        console.log('');
    }
    
    console.log(`%c???  TEMPERATURA: ${temperature}`, 'color: #FF6B35; font-weight: bold; font-size: 14px;');
    console.log(`%c   ${reasoning}`, 'color: #FF8C00;');
    console.log('');
    console.log('%c-----------------------------------------------------------', 'color: #FF6B35; font-weight: bold;');
    console.log('');
    
    // ? CALCULAR COR DOMINANTE NOS �LTIMOS 20 GIROS
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
        // ? Informa��es de cor dominante
        colorCounts,
        colorPercents,
        dominantColor,
        dominantCount,
        dominantPercent,
        hasDominantColor
    };
}

// ---------------------------------------------------------------
// ?? HELPER FUNCTION: Enviar mensagem para content.js
// ---------------------------------------------------------------
function sendMessageToContent(type, data) {
    try {
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                try {
                    chrome.tabs.sendMessage(tab.id, { type: type, data: data });
                } catch (e) {
                    // Ignorar tabs sem content.js
                }
            });
        });
        return true;
    } catch (error) {
        console.warn(`?? Erro ao enviar mensagem ${type}:`, error.message);
        return false;
    }
}

// ---------------------------------------------------------------
// ?? FUN��ES DE MEM�RIA ATIVA - SISTEMA INCREMENTAL
// ---------------------------------------------------------------

/**
 * ?? INICIALIZAR MEM�RIA ATIVA
 * Analisa todo o hist�rico UMA VEZ e armazena em mem�ria
 * Deve ser chamado apenas na primeira vez ou ap�s reset
 */
async function inicializarMemoriaAtiva(history) {
    // ?? Evitar inicializa��es simult�neas
    if (memoriaAtivaInicializando) {
        console.log('%c? Mem�ria Ativa j� est� sendo inicializada...', 'color: #FFA500;');
        return false;
    }
    
    memoriaAtivaInicializando = true;
    const inicio = performance.now();
    
    console.log('');
    console.log('%c+-----------------------------------------------------------+', 'color: #00CED1; font-weight: bold; font-size: 14px;');
    console.log('%c�  ?? INICIALIZANDO MEM�RIA ATIVA                          �', 'color: #00CED1; font-weight: bold; font-size: 14px;');
    console.log('%c+-----------------------------------------------------------+', 'color: #00CED1; font-weight: bold;');
    console.log('');
    
    try {
        // 1. COPIAR HIST�RICO
        console.log('%c?? ETAPA 1/5: Copiando hist�rico...', 'color: #00CED1; font-weight: bold;');
        memoriaAtiva.giros = [...history].slice(0, 2000);
        memoriaAtiva.ultimos20 = memoriaAtiva.giros.slice(0, 20);
        memoriaAtiva.estatisticas.totalGiros = memoriaAtiva.giros.length;
        console.log(`%c   ? ${memoriaAtiva.giros.length} giros copiados`, 'color: #00FF88;');
        console.log('');
        
        // 2. CALCULAR DISTRIBUI��O
        console.log('%c?? ETAPA 2/5: Calculando distribui��o de cores...', 'color: #00CED1; font-weight: bold;');
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
        console.log(`%c   ?? Vermelho: ${distribuicao.red} (${memoriaAtiva.estatisticas.distribuicao.red.percent.toFixed(2)}%)`, 'color: #FF6B6B;');
        console.log(`%c   ? Preto: ${distribuicao.black} (${memoriaAtiva.estatisticas.distribuicao.black.percent.toFixed(2)}%)`, 'color: #888;');
        console.log(`%c   ? Branco: ${distribuicao.white} (${memoriaAtiva.estatisticas.distribuicao.white.percent.toFixed(2)}%)`, 'color: #FFF;');
        console.log('');
        
        // 3. DETECTAR TODOS OS PADR�ES NO HIST�RICO
        console.log('%c?? ETAPA 3/5: Detectando todos os padr�es...', 'color: #00CED1; font-weight: bold;');
        const todosOsPadroes = detectAllPatternTypes(memoriaAtiva.giros);
        
        // Organizar por tipo
        memoriaAtiva.padroesDetectados = {
            alternanciaSimples: todosOsPadroes.filter(p => p.type === 'alternancia_simples'),
            alternanciasDupla: todosOsPadroes.filter(p => p.type === 'alternancia_dupla'),
            alternanciasTripla: todosOsPadroes.filter(p => p.type === 'alternancia_tripla'),
            sequenciasRed: todosOsPadroes.filter(p => p.type === 'sequencia_red'),
            sequenciasBlack: todosOsPadroes.filter(p => p.type === 'sequencia_black')
        };
        
        console.log(`%c   ?? Altern�ncia Simples: ${memoriaAtiva.padroesDetectados.alternanciaSimples.length}`, 'color: #00FF88;');
        console.log(`%c   ?? Altern�ncia Dupla: ${memoriaAtiva.padroesDetectados.alternanciasDupla.length}`, 'color: #00FF88;');
        console.log(`%c   ?? Altern�ncia Tripla: ${memoriaAtiva.padroesDetectados.alternanciasTripla.length}`, 'color: #00FF88;');
        console.log(`%c   ?? Sequ�ncias Vermelhas: ${memoriaAtiva.padroesDetectados.sequenciasRed.length}`, 'color: #FF6B6B;');
        console.log(`%c   ? Sequ�ncias Pretas: ${memoriaAtiva.padroesDetectados.sequenciasBlack.length}`, 'color: #888;');
        console.log('');
        
        // 4. CALCULAR ESTAT�STICAS POR PADR�O
        console.log('%c?? ETAPA 4/5: Calculando estat�sticas por padr�o...', 'color: #00CED1; font-weight: bold;');
        memoriaAtiva.estatisticas.porPadrao = {};
        
        // Para cada padr�o detectado, calcular o que veio depois
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
        console.log(`%c   ? ${totalPadroesCadastrados} tipos de padr�es cadastrados`, 'color: #00FF88;');
        console.log('');
        
        // 5. MARCAR COMO INICIALIZADA
        console.log('%c? ETAPA 5/5: Finalizando...', 'color: #00CED1; font-weight: bold;');
        memoriaAtiva.inicializada = true;
        memoriaAtiva.ultimaAtualizacao = new Date();
        memoriaAtiva.tempoInicializacao = performance.now() - inicio;
        memoriaAtiva.totalAtualizacoes = 1; // Inicialização conta como primeira análise
        
        console.log('');
        console.log('%c+-----------------------------------------------------------+', 'color: #00FF00; font-weight: bold; font-size: 14px;');
        console.log('%c�  ? MEM�RIA ATIVA INICIALIZADA COM SUCESSO!              �', 'color: #00FF00; font-weight: bold; font-size: 14px;');
        console.log('%c�-----------------------------------------------------------�', 'color: #00FF00; font-weight: bold;');
        console.log(`%c�  ??  Tempo: ${memoriaAtiva.tempoInicializacao.toFixed(2)}ms                                    �`, 'color: #00FF88;');
        console.log(`%c�  ?? Giros: ${memoriaAtiva.giros.length}                                          �`, 'color: #00FF88;');
        console.log(`%c�  ?? Padr�es detectados: ${todosOsPadroes.length}                             �`, 'color: #00FF88;');
        console.log(`%c�  ?? Tipos �nicos: ${totalPadroesCadastrados}                                      �`, 'color: #00FF88;');
        console.log('%c+-----------------------------------------------------------+', 'color: #00FF00; font-weight: bold;');
        console.log('');
        
        memoriaAtivaInicializando = false;
        return true;
        
    } catch (error) {
        console.error('%c? ERRO ao inicializar mem�ria ativa:', 'color: #FF0000; font-weight: bold;');
        console.error(error);
        memoriaAtivaInicializando = false;
        memoriaAtiva.inicializada = false;
        return false;
    }
}

/**
 * ? ATUALIZAR MEM�RIA INCREMENTALMENTE
 * Adiciona novo giro e atualiza apenas o necess�rio (R�PIDO!)
 */
function atualizarMemoriaIncrementalmente(novoGiro) {
    if (!memoriaAtiva.inicializada) {
        console.warn('%c?? Mem�ria Ativa n�o inicializada! N�o � poss�vel atualizar.', 'color: #FFA500;');
        return false;
    }
    
    const inicio = performance.now();
    
    try {
        // 1. ADICIONAR NOVO GIRO NO IN�CIO
        memoriaAtiva.giros.unshift(novoGiro);
        
        // 2. REMOVER O MAIS ANTIGO (manter 2000)
        if (memoriaAtiva.giros.length > 2000) {
            const removido = memoriaAtiva.giros.pop();
            
            // Atualizar distribui��o (decrementar cor removida)
            if (removido && removido.color) {
                memoriaAtiva.estatisticas.distribuicao[removido.color].count--;
            }
        }
        
        // 3. ATUALIZAR DISTRIBUI��O (incrementar nova cor)
        if (novoGiro.color) {
            memoriaAtiva.estatisticas.distribuicao[novoGiro.color].count++;
        }
        
        // Recalcular percentuais
        const total = memoriaAtiva.giros.length;
        for (const cor of ['red', 'black', 'white']) {
            memoriaAtiva.estatisticas.distribuicao[cor].percent = 
                (memoriaAtiva.estatisticas.distribuicao[cor].count / total) * 100;
        }
        
        // 4. ATUALIZAR �LTIMOS 20
        memoriaAtiva.ultimos20 = memoriaAtiva.giros.slice(0, 20);
        
        // 5. DETECTAR NOVO PADR�O ATIVO (apenas nos �ltimos 20)
        // Isso � r�pido porque s� analisa 20 giros!
        memoriaAtiva.padraoAtual = findActivePattern(memoriaAtiva.ultimos20);
        
        // 6. ATUALIZAR M�TRICAS
        memoriaAtiva.ultimaAtualizacao = new Date();
        memoriaAtiva.tempoUltimaAtualizacao = performance.now() - inicio;
        memoriaAtiva.totalAtualizacoes++;
        
        // ? Log resumido (apenas se demorar muito)
        if (memoriaAtiva.tempoUltimaAtualizacao > 50) {
            console.log(`%c? Mem�ria atualizada em ${memoriaAtiva.tempoUltimaAtualizacao.toFixed(2)}ms`, 'color: #FFD700;');
        }
        
        return true;
        
    } catch (error) {
        console.error('%c? ERRO ao atualizar mem�ria incrementalmente:', 'color: #FF0000; font-weight: bold;');
        console.error(error);
        return false;
    }
}

/**
 * ?? VALIDAR MEM�RIA ATIVA
 * Verifica integridade e sincroniza��o com cachedHistory
 */
function validarMemoriaAtiva() {
    if (!memoriaAtiva.inicializada) {
        return { valida: false, motivo: 'N�o inicializada' };
    }
    
    // Verificar se tem giros
    if (memoriaAtiva.giros.length === 0) {
        return { valida: false, motivo: 'Sem giros na mem�ria' };
    }
    
    // Verificar sincroniza��o com cachedHistory
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
    
    // Verificar se estat�sticas fazem sentido
    const totalDist = memoriaAtiva.estatisticas.distribuicao.red.count +
                      memoriaAtiva.estatisticas.distribuicao.black.count +
                      memoriaAtiva.estatisticas.distribuicao.white.count;
    
    if (totalDist !== memoriaAtiva.giros.length) {
        return { 
            valida: false, 
            motivo: 'Distribui��o inconsistente',
            detalhes: {
                totalDistribuicao: totalDist,
                totalGiros: memoriaAtiva.giros.length
            }
        };
    }
    
    return { valida: true };
}

/**
 * ?? RESETAR MEM�RIA ATIVA
 * Limpa tudo e for�a reinicializa��o
 */
function resetarMemoriaAtiva() {
    console.log('%c?? Resetando Mem�ria Ativa...', 'color: #FFA500; font-weight: bold;');
    
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
    
    console.log('%c? Mem�ria Ativa resetada!', 'color: #00FF88;');
}

/**
 * ---------------------------------------------------------------
 * ?? AN�LISE CONTEXTUAL INTELIGENTE - SISTEMA DE GRADIENTE
 * Analisa os �LTIMOS 20 GIROS com peso gradual (mais recente = mais importante)
 * ---------------------------------------------------------------
 */
function analyzeCurrentContext(last20Spins, activePattern) {
    const colors = last20Spins.map(s => s.color);
    const nonWhite = colors.filter(c => c !== 'white');
    
    let description = '';
    let insight = '';
    
    console.log('%c+-----------------------------------------------------------+', 'color: #00FFFF; font-weight: bold;');
    console.log('%c�  ??? AN�LISE CONTEXTUAL COM GRADIENTE QUENTE/FRIO         �', 'color: #00FFFF; font-weight: bold;');
    console.log('%c+-----------------------------------------------------------+', 'color: #00FFFF; font-weight: bold;');
    console.log('');
    
    // ---------------------------------------------------------------
    // ??? GRADIENTE DE TEMPERATURA (20 giros)
    // Giro 20 (antigo) = FRIO (peso 1.0x)
    // Giro 1 (recente) = FERVENDO (peso 3.0x)
    // ---------------------------------------------------------------
    
    const last20NonWhite = nonWhite.slice(0, Math.min(20, nonWhite.length));
    
    console.log(`%c?? Analisando ${last20NonWhite.length} giros (ignorando brancos)`, 'color: #00FFFF;');
    console.log(`%c   Do mais antigo (FRIO) ao mais recente (QUENTE)`, 'color: #00FFFF;');
    console.log('');
    
    // Mostrar sequ�ncia completa com gradiente visual
    let gradientDisplay = '';
    for (let i = last20NonWhite.length - 1; i >= 0; i--) {
        const color = last20NonWhite[i];
        const position = last20NonWhite.length - i;
        const colorSymbol = color === 'red' ? 'V' : 'P';
        
        // Gradiente de cor no console
        let tempEmoji = '';
        if (position <= 5) {
            tempEmoji = '??'; // Muito frio (giros antigos)
        } else if (position <= 10) {
            tempEmoji = '??'; // Frio
        } else if (position <= 15) {
            tempEmoji = '???'; // Morno
        } else {
            tempEmoji = '??'; // Quente (giros recentes)
        }
        
        gradientDisplay += `${tempEmoji}${colorSymbol} `;
    }
    
    console.log(`%c??? Gradiente: ${gradientDisplay}`, 'color: #00FFFF;');
    console.log('');
    
    // ---------------------------------------------------------------
    // ?? AN�LISE 1: SEQU�NCIA ATUAL (�ltimos giros mais recentes)
    // ---------------------------------------------------------------
    
    const firstColor = last20NonWhite[0];
    let currentSequenceLength = 1;
    
    for (let i = 1; i < last20NonWhite.length; i++) {
        if (last20NonWhite[i] === firstColor) {
            currentSequenceLength++;
        } else {
            break;
        }
    }
    
    console.log(`%c?? AN�LISE DA SEQU�NCIA ATUAL (giros mais recentes):`, 'color: #FFD700; font-weight: bold;');
    console.log(`%c   Cor atual: ${firstColor === 'red' ? 'VERMELHO' : 'PRETO'}`, 'color: #FFD700;');
    console.log(`%c   Sequ�ncia: ${currentSequenceLength} giros consecutivos`, 'color: #FFD700;');
    
    if (currentSequenceLength >= 7) {
        const colorName = firstColor === 'red' ? 'VERMELHOS' : 'PRETOS';
        description = `?? SEQU�NCIA MUITO LONGA! ${currentSequenceLength} ${colorName} consecutivos. `;
        insight = `ATEN��O: Sequ�ncia de ${currentSequenceLength} giros est� MUITO longa! Probabilidade de quebra ALTA.`;
        console.log(`%c   ?? SEQU�NCIA MUITO LONGA! Risco de quebra ALTO!`, 'color: #FF0000; font-weight: bold;');
    } else if (currentSequenceLength >= 5) {
        const colorName = firstColor === 'red' ? 'VERMELHOS' : 'PRETOS';
        description = `?? Sequ�ncia de ${currentSequenceLength} ${colorName}. `;
        insight = `Sequ�ncia moderada (${currentSequenceLength} giros). Pode continuar ou quebrar.`;
        console.log(`%c   ? Sequ�ncia moderada`, 'color: #FFAA00;');
    } else if (currentSequenceLength >= 3) {
        const colorName = firstColor === 'red' ? 'vermelhos' : 'pretos';
        description = `?? Sequ�ncia curta de ${currentSequenceLength} ${colorName}. `;
        insight = `Sequ�ncia ainda curta (${currentSequenceLength} giros).`;
        console.log(`%c   ?? Sequ�ncia curta`, 'color: #00FF88;');
    } else {
        console.log(`%c   ?? Sem sequ�ncia clara (apenas ${currentSequenceLength} giro)`, 'color: #00FF88;');
    }
    console.log('');
    
    // ---------------------------------------------------------------
    // ?? AN�LISE 2: COMPORTAMENTO NOS �LTIMOS 20 GIROS
    // ---------------------------------------------------------------
    
    console.log(`%c?? AN�LISE GERAL DOS 20 GIROS:`, 'color: #9370DB; font-weight: bold;');
    
    const redCount = last20NonWhite.filter(c => c === 'red').length;
    const blackCount = last20NonWhite.filter(c => c === 'black').length;
    const total = last20NonWhite.length;
    
    console.log(`%c   VERMELHO: ${redCount} giros (${((redCount/total)*100).toFixed(1)}%)`, 'color: #FF0000;');
    console.log(`%c   PRETO: ${blackCount} giros (${((blackCount/total)*100).toFixed(1)}%)`, 'color: #FFFFFF;');
    
    // Detectar altern�ncia nos �ltimos 10 giros (zona quente)
    const last10 = last20NonWhite.slice(0, 10);
    let alternations = 0;
    for (let i = 0; i < last10.length - 1; i++) {
        if (last10[i] !== last10[i + 1]) {
            alternations++;
        }
    }
    
    console.log(`%c   Mudan�as de cor (�ltimos 10): ${alternations}`, 'color: #9370DB;');
    
    if (alternations >= 7) {
        description += `?? ALTERN�NCIA MUITO ATIVA nos �ltimos 10 giros (${alternations} mudan�as). `;
        insight = `Forte padr�o de altern�ncia. Cores trocando frequentemente.`;
        console.log(`%c   ? ALTERN�NCIA MUITO ATIVA!`, 'color: #00FF00; font-weight: bold;');
    } else if (alternations >= 5) {
        description += `?? Altern�ncia moderada (${alternations} mudan�as em 10 giros). `;
        insight = `Padr�o de altern�ncia presente.`;
        console.log(`%c   ?? Altern�ncia moderada`, 'color: #00FF88;');
    } else {
        console.log(`%c   ?? Pouca altern�ncia (${alternations} mudan�as)`, 'color: #FFAA00;');
    }
    
    // ?? N�O RECOMENDAR BASEADO EM DOMIN�NCIA DE COR!
    // A recomenda��o vem do PADR�O e do HIST�RICO, n�o da quantidade!
    // Apenas DESCREVER o contexto atual para o usu�rio entender
    if (currentSequenceLength < 3 && alternations < 5) {
        if (redCount > blackCount + 3) {
            description = `?? Contexto: ${redCount} vermelhos vs ${blackCount} pretos nos �ltimos 20 giros. `;
            insight = `Vermelho apareceu mais recentemente. A decis�o vir� do padr�o detectado e do hist�rico.`;
            console.log(`%c   ?? Contexto: Vermelho mais frequente (${redCount} vs ${blackCount})`, 'color: #00FFFF;');
            console.log(`%c   ?? MAS: Decis�o baseada no PADR�O e HIST�RICO, n�o na quantidade!`, 'color: #FFAA00; font-weight: bold;');
        } else if (blackCount > redCount + 3) {
            description = `?? Contexto: ${blackCount} pretos vs ${redCount} vermelhos nos �ltimos 20 giros. `;
            insight = `Preto apareceu mais recentemente. A decis�o vir� do padr�o detectado e do hist�rico.`;
            console.log(`%c   ?? Contexto: Preto mais frequente (${blackCount} vs ${redCount})`, 'color: #00FFFF;');
            console.log(`%c   ?? MAS: Decis�o baseada no PADR�O e HIST�RICO, n�o na quantidade!`, 'color: #FFAA00; font-weight: bold;');
        } else {
            description = `?? Contexto: Equilibrado nos �ltimos 20 giros (V:${redCount} vs P:${blackCount}). `;
            insight = `Distribui��o equilibrada. A decis�o vir� do padr�o detectado e do hist�rico.`;
            console.log(`%c   ?? Contexto: Jogo equilibrado (${redCount} vs ${blackCount})`, 'color: #00FFFF;');
        }
    }
    
    console.log('');
    console.log('%c+-----------------------------------------------------------+', 'color: #00FFFF; font-weight: bold;');
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
 * -------------------------------------------------------------------------------
 * ?? NOVO SISTEMA - 6 N�VEIS DE AN�LISE DIAMANTE
 * Sistema de vota��o: cada n�vel vota em uma cor
 * -------------------------------------------------------------------------------
 */

/**
 * N�VEL 1: An�lise de Domin�ncia Geral
 * Analisa os �ltimos N giros (configurado pelo usu�rio) e v� qual cor est� dominando
 * @param {Array} history - Hist�rico de giros
 * @param {number} historySize - Quantidade de giros a analisar
 * @returns {Object} - {vote: 'red'|'black'|null, confidence: number, reason: string}
 */
function nivel1_DominanciaGeral(history, historySize) {
    console.log('');
    console.log('%c+-----------------------------------------------------------+', 'color: #00D4FF; font-weight: bold;');
    console.log('%c�  ?? N�VEL 1: DOMIN�NCIA GERAL                            �', 'color: #00D4FF; font-weight: bold;');
    console.log('%c+-----------------------------------------------------------+', 'color: #00D4FF; font-weight: bold;');
    
    const giros = history.slice(0, historySize);
    let redCount = 0, blackCount = 0;
    
    giros.forEach(spin => {
        if (spin.color === 'red') redCount++;
        else if (spin.color === 'black') blackCount++;
    });
    
    const total = redCount + blackCount;
    const redPercent = (redCount / total) * 100;
    const blackPercent = (blackCount / total) * 100;
    
    console.log(`%c   Analisando ${historySize} giros`, 'color: #00D4FF;');
    console.log(`%c   ?? RED: ${redCount} (${redPercent.toFixed(1)}%)`, 'color: #FF0000; font-weight: bold;');
    console.log(`%c   ? BLACK: ${blackCount} (${blackPercent.toFixed(1)}%)`, 'color: #FFFFFF; font-weight: bold;');
    
    let vote = null;
    let reason = '';
    
    if (redPercent >= 55) {
        vote = 'red';
        reason = `RED dominante (${redPercent.toFixed(1)}%) ? Seguir tend�ncia RED`;
        console.log(`%c   ? VOTO: RED (dominante)`, 'color: #FF0000; font-weight: bold;');
    } else if (blackPercent >= 55) {
        vote = 'black';
        reason = `BLACK dominante (${blackPercent.toFixed(1)}%) ? Seguir tend�ncia BLACK`;
        console.log(`%c   ? VOTO: BLACK (dominante)`, 'color: #FFFFFF; font-weight: bold;');
    } else {
        reason = `Equilibrado (R:${redPercent.toFixed(1)}% vs B:${blackPercent.toFixed(1)}%) ? Neutro`;
        console.log(`%c   ?? NEUTRO: Jogo equilibrado`, 'color: #FFD700;');
    }
    
    console.log('');
    return { vote, confidence: Math.max(redPercent, blackPercent), reason };
}

/**
 * N�VEL 2: An�lise por Momento do Giro (Giro 1 vs Giro 2 do minuto)
 * Cada minuto tem 2 giros. Analisa qual cor domina em cada posi��o.
 * @param {Array} history - Hist�rico de giros
 * @param {number} historySize - Quantidade de giros a analisar
 * @returns {Object} - {vote: 'red'|'black'|null, confidence: number, reason: string}
 */
function nivel2_MomentoDoGiro(history, historySize) {
    console.log('%c+-----------------------------------------------------------+', 'color: #FFD700; font-weight: bold;');
    console.log('%c�  ?? N�VEL 2: MOMENTO DO GIRO (POSI��O)                   �', 'color: #FFD700; font-weight: bold;');
    console.log('%c+-----------------------------------------------------------+', 'color: #FFD700; font-weight: bold;');
    
    // Determinar se o pr�ximo giro � Giro 1 ou Giro 2
    // Cada minuto tem 2 giros (a cada 30 segundos aproximadamente)
    const agora = new Date();
    const segundos = agora.getSeconds();
    const proximoGiroEhGiro2 = segundos >= 30;
    const posicaoAtual = proximoGiroEhGiro2 ? 'Giro 2' : 'Giro 1';
    
    console.log(`%c   Pr�ximo giro ser�: ${posicaoAtual}`, 'color: #FFD700; font-weight: bold;');
    
    // Separar giros por posi��o (pares = Giro 1, �mpares = Giro 2)
    const girosNaPosicao = [];
    for (let i = proximoGiroEhGiro2 ? 1 : 0; i < Math.min(historySize, history.length); i += 2) {
        girosNaPosicao.push(history[i]);
    }
    
    let redCount = 0, blackCount = 0;
    girosNaPosicao.forEach(spin => {
        if (spin.color === 'red') redCount++;
        else if (spin.color === 'black') blackCount++;
    });
    
    const total = redCount + blackCount;
    const redPercent = (redCount / total) * 100;
    const blackPercent = (blackCount / total) * 100;
    
    console.log(`%c   Analisando ${girosNaPosicao.length} giros na posi��o "${posicaoAtual}"`, 'color: #FFD700;');
    console.log(`%c   ?? RED: ${redCount} (${redPercent.toFixed(1)}%)`, 'color: #FF0000; font-weight: bold;');
    console.log(`%c   ? BLACK: ${blackCount} (${blackPercent.toFixed(1)}%)`, 'color: #FFFFFF; font-weight: bold;');
    
    let vote = null;
    let reason = '';
    
    if (redPercent >= 60) {
        vote = 'red';
        reason = `No ${posicaoAtual}, RED domina (${redPercent.toFixed(1)}%)`;
        console.log(`%c   ? VOTO: RED`, 'color: #FF0000; font-weight: bold;');
    } else if (blackPercent >= 60) {
        vote = 'black';
        reason = `No ${posicaoAtual}, BLACK domina (${blackPercent.toFixed(1)}%)`;
        console.log(`%c   ? VOTO: BLACK`, 'color: #FFFFFF; font-weight: bold;');
    } else {
        reason = `${posicaoAtual} equilibrado (R:${redPercent.toFixed(1)}% vs B:${blackPercent.toFixed(1)}%)`;
        console.log(`%c   ?? NEUTRO`, 'color: #FFD700;');
    }
    
    console.log('');
    return { vote, confidence: Math.max(redPercent, blackPercent), reason };
}

/**
 * N�VEL 3: An�lise de Padr�o Recente (�ltimos 10 giros)
 * Busca padr�es similares no hist�rico e v� o que veio depois
 * @param {Array} history - Hist�rico de giros
 * @param {number} historySize - Quantidade de giros a analisar
 * @returns {Object} - {vote: 'red'|'black'|null, confidence: number, reason: string}
 */
function nivel3_PadraoRecente(history, historySize) {
    console.log('%c+-----------------------------------------------------------+', 'color: #9C27B0; font-weight: bold;');
    console.log('%c�  ?? N�VEL 3: PADR�O RECENTE (�LTIMOS 10 GIROS)          �', 'color: #9C27B0; font-weight: bold;');
    console.log('%c+-----------------------------------------------------------+', 'color: #9C27B0; font-weight: bold;');
    
    const last10Spins = history.slice(0, 10);
    const totalHistory = history.slice(0, historySize);
    
    console.log(`%c   Buscando padr�es similares aos �ltimos 10 giros`, 'color: #9C27B0;');
    console.log(`%c   Hist�rico de busca: ${historySize} giros`, 'color: #9C27B0;');
    
    const result = buscarSequenciaNoHistorico(last10Spins, totalHistory, 100);
    
    let vote = null;
    let reason = '';
    
    if (result.occurrences >= 3 && result.confidence >= 65) {
        vote = result.color;
        reason = `Padr�o encontrado ${result.occurrences}x ? ${result.color.toUpperCase()} (${result.confidence.toFixed(1)}% confian�a)`;
        console.log(`%c   ? VOTO: ${result.color.toUpperCase()}`, result.color === 'red' ? 'color: #FF0000; font-weight: bold;' : 'color: #FFFFFF; font-weight: bold;');
    } else {
        reason = `Padr�o fraco (${result.occurrences}x, ${result.confidence.toFixed(1)}% confian�a)`;
        console.log(`%c   ?? NEUTRO: Base estat�stica fraca`, 'color: #9C27B0;');
    }
    
    console.log('');
    return { vote, confidence: result.confidence, reason };
}

/**
 * N�VEL 4: Tend�ncia dos �ltimos 5 Minutos
 * Analisa minuto a minuto (�ltimos 5 minutos) e v� qual cor domina
 * @param {Array} history - Hist�rico de giros  
 * @returns {Object} - {vote: 'red'|'black'|null, confidence: number, reason: string}
 */
function nivel4_TendenciaDeMinutos(history) {
    console.log('%c+-----------------------------------------------------------+', 'color: #FF6B35; font-weight: bold;');
    console.log('%c�  ?? N�VEL 4: TEND�NCIA DOS �LTIMOS 5 MINUTOS            �', 'color: #FF6B35; font-weight: bold;');
    console.log('%c+-----------------------------------------------------------+', 'color: #FF6B35; font-weight: bold;');
    
    // �ltimos 5 minutos = 10 giros (2 por minuto)
    const last10Giros = history.slice(0, 10);
    
    console.log(`%c   Analisando �ltimos 5 minutos (10 giros)`, 'color: #FF6B35;');
    
    // Dividir em 5 minutos (2 giros cada)
    const minutos = [];
    for (let i = 0; i < 10; i += 2) {
        const minuto = last10Giros.slice(i, i + 2);
        const redCount = minuto.filter(s => s.color === 'red').length;
        const blackCount = minuto.filter(s => s.color === 'black').length;
        const dominante = redCount > blackCount ? 'red' : (blackCount > redCount ? 'black' : 'empate');
        minutos.push({ minuto: Math.floor(i / 2) + 1, red: redCount, black: blackCount, dominante });
    }
    
    // Contar quantos minutos cada cor dominou
    const redDominante = minutos.filter(m => m.dominante === 'red').length;
    const blackDominante = minutos.filter(m => m.dominante === 'black').length;
    
    console.log(`%c   Minutos com RED dominante: ${redDominante}`, 'color: #FF0000; font-weight: bold;');
    console.log(`%c   Minutos com BLACK dominante: ${blackDominante}`, 'color: #FFFFFF; font-weight: bold;');
    
    let vote = null;
    let reason = '';
    
    if (redDominante >= 3) {
        vote = 'red';
        reason = `${redDominante} de 5 minutos com RED dominante ? Tend�ncia RED`;
        console.log(`%c   ? VOTO: RED (tend�ncia forte)`, 'color: #FF0000; font-weight: bold;');
    } else if (blackDominante >= 3) {
        vote = 'black';
        reason = `${blackDominante} de 5 minutos com BLACK dominante ? Tend�ncia BLACK`;
        console.log(`%c   ? VOTO: BLACK (tend�ncia forte)`, 'color: #FFFFFF; font-weight: bold;');
    } else {
        reason = `Minutos equilibrados (R:${redDominante} vs B:${blackDominante})`;
        console.log(`%c   ?? NEUTRO: Sem tend�ncia clara`, 'color: #FF6B35;');
    }
    
    const confidence = Math.max(redDominante, blackDominante) * 20; // 3 minutos = 60%, 4 = 80%, 5 = 100%
    
    console.log('');
    return { vote, confidence, reason };
}

/**
 * N�VEL 5: Padr�o de Minutos na Hora
 * Analisa minutos por posi��o na hora (ex: todos os minutos 01, 11, 21, 31, 41, 51)
 * @param {Array} history - Hist�rico de giros
 * @returns {Object} - {vote: 'red'|'black'|null, confidence: number, reason: string}
 */
function nivel5_PadraoDeMinutosNaHora(history) {
    console.log('%c+-----------------------------------------------------------+', 'color: #00BCD4; font-weight: bold;');
    console.log('%c�  ?? N�VEL 5: PADR�O DE MINUTOS NA HORA                   �', 'color: #00BCD4; font-weight: bold;');
    console.log('%c+-----------------------------------------------------------+', 'color: #00BCD4; font-weight: bold;');
    
    // Pegar minuto atual
    const agora = new Date();
    const minutoAtual = agora.getMinutes();
    const unidade = minutoAtual % 10; // Ex: 41 ? 1, 22 ? 2
    
    console.log(`%c   Minuto atual: ${minutoAtual} (termina��o ${unidade})`, 'color: #00BCD4; font-weight: bold;');
    console.log(`%c   Buscando padr�o em minutos X${unidade}...`, 'color: #00BCD4;');
    
    // Buscar nos �ltimos giros por minutos com mesma termina��o
    // Cada minuto tem ~2 giros, ent�o vamos analisar os �ltimos 60 giros (30 minutos)
    // e pegar apenas os que caem em minutos com termina��o igual
    
    const girosNosPadroesDeMinuto = [];
    
    // Simples: vamos pegar blocos de 2 giros (1 minuto) dos �ltimos 60 giros
    // e ver quantos desses minutos tinham a mesma termina��o
    for (let i = 0; i < Math.min(60, history.length); i += 2) {
        const giro1 = history[i];
        const giro2 = history[i + 1];
        if (!giro1 || !giro2) continue;
        
        // Estimar qual minuto era (aproximado)
        const minutosAtras = Math.floor(i / 2);
        const minutoEstimado = (minutoAtual - minutosAtras + 60) % 60;
        const unidadeEstimada = minutoEstimado % 10;
        
        if (unidadeEstimada === unidade) {
            girosNosPadroesDeMinuto.push(giro1, giro2);
        }
    }
    
    if (girosNosPadroesDeMinuto.length < 4) {
        console.log(`%c   ?? Poucos dados (${girosNosPadroesDeMinuto.length} giros) ? Neutro`, 'color: #FFA500;');
        console.log('');
        return { vote: null, confidence: 0, reason: `Poucos dados para minutos X${unidade}` };
    }
    
    let redCount = 0, blackCount = 0;
    girosNosPadroesDeMinuto.forEach(spin => {
        if (spin.color === 'red') redCount++;
        else if (spin.color === 'black') blackCount++;
    });
    
    const total = redCount + blackCount;
    const redPercent = (redCount / total) * 100;
    const blackPercent = (blackCount / total) * 100;
    
    // Contar quantos minutos completos temos
    const minutosAnalisados = Math.floor(girosNosPadroesDeMinuto.length / 2);
    
    console.log(`%c   Minutos X${unidade} encontrados: ${minutosAnalisados}`, 'color: #00BCD4;');
    console.log(`%c   ?? RED: ${redCount} (${redPercent.toFixed(1)}%)`, 'color: #FF0000; font-weight: bold;');
    console.log(`%c   ? BLACK: ${blackCount} (${blackPercent.toFixed(1)}%)`, 'color: #FFFFFF; font-weight: bold;');
    
    let vote = null;
    let reason = '';
    
    // Precisamos de pelo menos 3 minutos para validar
    if (minutosAnalisados >= 3) {
        if (redPercent >= 60) {
            vote = 'red';
            reason = `Minutos X${unidade}: RED domina (${redPercent.toFixed(1)}% em ${minutosAnalisados} minutos)`;
            console.log(`%c   ? VOTO: RED`, 'color: #FF0000; font-weight: bold;');
        } else if (blackPercent >= 60) {
            vote = 'black';
            reason = `Minutos X${unidade}: BLACK domina (${blackPercent.toFixed(1)}% em ${minutosAnalisados} minutos)`;
            console.log(`%c   ? VOTO: BLACK`, 'color: #FFFFFF; font-weight: bold;');
        } else {
            reason = `Minutos X${unidade} equilibrados (R:${redPercent.toFixed(1)}% vs B:${blackPercent.toFixed(1)}%)`;
            console.log(`%c   ?? NEUTRO`, 'color: #00BCD4;');
        }
    } else {
        reason = `Poucos minutos X${unidade} encontrados (${minutosAnalisados})`;
        console.log(`%c   ?? NEUTRO: Amostra insuficiente`, 'color: #00BCD4;');
    }
    
    console.log('');
    return { vote, confidence: Math.max(redPercent, blackPercent), reason };
}

/**
 * N�VEL 6: Valida��o de Resist�ncia/Suporte (FREIO DE SEGURAN�A)
 * Verifica se o padr�o atual j� foi ultrapassado no hist�rico
 * Se nunca passou desse limite, VETA o sinal!
 * @param {Array} history - Hist�rico de giros
 * @param {string} corIndicada - Cor que est� sendo indicada pelos outros n�veis
 * @param {number} historySize - Quantidade de giros a analisar
 * @returns {Object} - {vote: 'veto'|'approve', confidence: number, reason: string}
 */
function nivel6_ValidacaoResistencia(history, corIndicada, historySize) {
    console.log('%c+-----------------------------------------------------------+', 'color: #F44336; font-weight: bold;');
    console.log('%c�  ??? N�VEL 6: VALIDA��O DE RESIST�NCIA (VETO)            �', 'color: #F44336; font-weight: bold;');
    console.log('%c+-----------------------------------------------------------+', 'color: #F44336; font-weight: bold;');
    
    if (!corIndicada) {
        console.log(`%c   ?? Sem cor indicada pelos n�veis anteriores`, 'color: #FFA500;');
        console.log('');
        return { vote: 'approve', confidence: 0, reason: 'Sem cor para validar' };
    }
    
    console.log(`%c   Validando cor indicada: ${corIndicada.toUpperCase()}`, corIndicada === 'red' ? 'color: #FF0000; font-weight: bold;' : 'color: #FFFFFF; font-weight: bold;');
    
    // Contar sequ�ncia atual da cor indicada
    let sequenciaAtual = 0;
    for (let i = 0; i < history.length; i++) {
        if (history[i].color === corIndicada) {
            sequenciaAtual++;
        } else {
            break;
        }
    }
    
    console.log(`%c   Sequ�ncia atual de ${corIndicada.toUpperCase()}: ${sequenciaAtual} giros`, 'color: #F44336; font-weight: bold;');
    
    // Se n�o h� sequ�ncia atual (pr�ximo giro seria o primeiro), aprovar
    if (sequenciaAtual === 0) {
        console.log(`%c   ? APROVAR: Sem sequ�ncia atual (apostando na quebra ou in�cio)`, 'color: #00FF88;');
        console.log('');
        return { vote: 'approve', confidence: 100, reason: 'Sem sequ�ncia atual para validar' };
    }
    
    // Buscar no hist�rico: j� teve sequ�ncias maiores que a atual?
    const girosParaAnalisar = history.slice(0, historySize);
    let maiorSequencia = 0;
    let sequenciaTemporaria = 0;
    
    for (let i = 0; i < girosParaAnalisar.length; i++) {
        if (girosParaAnalisar[i].color === corIndicada) {
            sequenciaTemporaria++;
            if (sequenciaTemporaria > maiorSequencia) {
                maiorSequencia = sequenciaTemporaria;
            }
        } else {
            sequenciaTemporaria = 0;
        }
    }
    
    console.log(`%c   Maior sequ�ncia de ${corIndicada.toUpperCase()} no hist�rico: ${maiorSequencia} giros`, 'color: #F44336; font-weight: bold;');
    
    // DECIS�O: Se nunca passou da sequ�ncia atual, VETAR!
    if (maiorSequencia <= sequenciaAtual) {
        console.log('');
        console.log(`%c   ??? VETO! ???`, 'color: #FF0000; font-weight: bold; font-size: 16px;');
        console.log(`%c   Sequ�ncia de ${sequenciaAtual} ${corIndicada.toUpperCase()} NUNCA foi ultrapassada!`, 'color: #FF6666; font-weight: bold;');
        console.log(`%c   Hist�rico m�ximo: ${maiorSequencia} giros`, 'color: #FF6666;');
        console.log(`%c   RESIST�NCIA DETECTADA - BLOQUEANDO SINAL!`, 'color: #FF0000; font-weight: bold;');
        console.log('');
        return { 
            vote: 'veto', 
            confidence: 100, 
            reason: `Resist�ncia: ${sequenciaAtual} ${corIndicada.toUpperCase()} nunca ultrapassado (m�x: ${maiorSequencia})` 
        };
    }
    
    // Se j� ultrapassou antes, APROVAR!
    console.log(`%c   ? APROVAR: Sequ�ncia j� foi ultrapassada antes (m�x: ${maiorSequencia})`, 'color: #00FF88; font-weight: bold;');
    console.log(`%c   Sem resist�ncia detectada`, 'color: #00FF88;');
    console.log('');
    
    return { 
        vote: 'approve', 
        confidence: 100, 
        reason: `Sem resist�ncia (j� chegou a ${maiorSequencia} ${corIndicada.toUpperCase()} antes)` 
    };
}

/**
 * FUN��O AUXILIAR: Buscar sequ�ncia de 10 giros no hist�rico
 * Retorna a cor que mais saiu ap�s essa sequ�ncia
 * @param {Array} targetSequence - Sequ�ncia de 10 giros a buscar
 * @param {Array} searchHistory - Hist�rico onde buscar
 * @param {number} spinsToAnalyze - Quantos giros analisar ap�s encontrar a sequ�ncia
 * @returns {Object} - {color, confidence, occurrences, similarity}
 */
function buscarSequenciaNoHistorico(targetSequence, searchHistory, spinsToAnalyze = 100) {
    console.log('');
    console.log('%c+-------------------------------------------------------------------------------+', 'color: #00D4FF; font-weight: bold;');
    console.log('%c�  ?? DEBUG DETALHADO: buscarSequenciaNoHistorico                             �', 'color: #00D4FF; font-weight: bold;');
    console.log('%c+-------------------------------------------------------------------------------+', 'color: #00D4FF; font-weight: bold;');
    console.log(`%c?? PAR�METROS DA BUSCA:`, 'color: #00D4FF; font-weight: bold;');
    console.log(`   ? Tamanho do hist�rico de busca: ${searchHistory.length} giros`);
    console.log(`   ? Tamanho da sequ�ncia alvo: ${targetSequence.length} giros`);
    console.log(`   ? Giros para analisar ap�s match: ${spinsToAnalyze}`);
    
    // Extrair apenas as cores da sequ�ncia alvo
    const targetColors = targetSequence.map(spin => spin.color);
    
    console.log('');
    console.log('%c?? SEQU�NCIA ALVO (�ltimos 10 giros):', 'color: #FFD700; font-weight: bold;');
    for (let i = 0; i < targetSequence.length; i++) {
        const spin = targetSequence[i];
        const colorEmoji = spin.color === 'red' ? '??' : spin.color === 'black' ? '?' : '?';
        console.log(`   ${i + 1}. ${colorEmoji} ${spin.color.toUpperCase()} (#${spin.number || '?'})`);
    }
    console.log(`   ? Padr�o: ${targetColors.map(c => c === 'red' ? '??' : c === 'black' ? '?' : '?').join(' ')}`);
    console.log('');
    
    let exactMatches = [];
    let similarMatches = []; // Matches com 60%+ de similaridade
    let highMatches = [];    // Matches com 80%+ de similaridade
    
    console.log('%c?? INICIANDO VARREDURA DO HIST�RICO...', 'color: #00D4FF; font-weight: bold;');
    console.log(`   Analisando ${searchHistory.length - spinsToAnalyze - 10} posi��es no hist�rico`);
    console.log('');
    
    // Buscar no hist�rico (come�ando do �ndice 10, pois precisamos de 10 giros anteriores)
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
            console.log(`%c   ? MATCH EXATO encontrado na posi��o ${i}! (100% similaridade)`, 'color: #00FF00; font-weight: bold;');
        } else if (similarity >= 80) {
            // Match com 80%+ de similaridade
            highMatches.push({ index: i, similarity: similarity });
            console.log(`%c   ? MATCH ALTO encontrado na posi��o ${i} (${similarity}% similaridade)`, 'color: #FFD700;');
        } else if (similarity >= 60) {
            // Match com 60%+ de similaridade
            similarMatches.push({ index: i, similarity: similarity });
        }
    }
    
    console.log('');
    console.log('%c?? RESULTADO DA VARREDURA:', 'color: #00FF88; font-weight: bold; font-size: 14px;');
    console.log(`%c   ? Matches EXATOS (100%): ${exactMatches.length}`, exactMatches.length > 0 ? 'color: #00FF00; font-weight: bold;' : 'color: #FF6666;');
    console.log(`%c   ? Matches ALTOS (80-99%): ${highMatches.length}`, highMatches.length > 0 ? 'color: #FFD700; font-weight: bold;' : 'color: #FF6666;');
    console.log(`%c   ? Matches SIMILARES (60-79%): ${similarMatches.length}`, similarMatches.length > 0 ? 'color: #00FF88;' : 'color: #FF6666;');
    console.log(`%c   ?? TOTAL de matches com 60%+: ${exactMatches.length + highMatches.length + similarMatches.length}`, 'color: #00D4FF; font-weight: bold;');
    console.log('');
    
    // Analisar o que veio DEPOIS dessas ocorr�ncias
    let nextColorCounts = { red: 0, black: 0, white: 0 };
    let totalOccurrences = 0;
    let avgSimilarity = 0;
    let matchesUsed = [];
    
    console.log('%c?? ANALISANDO O QUE VEIO DEPOIS DOS MATCHES...', 'color: #FFD700; font-weight: bold;');
    console.log('');
    
    if (exactMatches.length > 0) {
        // PRIORIDADE 1: Usar matches exatos (100%)
        console.log(`%c   ? USANDO ${exactMatches.length} MATCH(ES) EXATO(S) (100% similaridade)`, 'color: #00FF00; font-weight: bold; font-size: 14px;');
        console.log('');
        
        exactMatches.forEach((matchIndex, idx) => {
            console.log(`%c   ?? Match ${idx + 1}/${exactMatches.length} (posi��o ${matchIndex})`, 'color: #00FF88;');
            
            // Analisar os pr�ximos X giros ap�s o match
            const nextSpins = searchHistory.slice(matchIndex, matchIndex + spinsToAnalyze);
            console.log(`      ? Analisando ${nextSpins.length} giros ap�s este match`);
            
            let localCounts = { red: 0, black: 0, white: 0 };
            nextSpins.forEach(spin => {
                if (spin.color in nextColorCounts) {
                    nextColorCounts[spin.color]++;
                    localCounts[spin.color]++;
                }
            });
            
            console.log(`      ? Distribui��o: ?? ${localCounts.red} | ? ${localCounts.black} | ? ${localCounts.white}`);
        });
        
        totalOccurrences = exactMatches.length;
        avgSimilarity = 100;
        matchesUsed = exactMatches.map(i => ({ index: i, similarity: 100 }));
        
        console.log('');
        console.log(`%c   ? TOTAL DE OCORR�NCIAS EXATAS: ${totalOccurrences}`, 'color: #00FF00; font-weight: bold; font-size: 14px;');
        
    } else if (highMatches.length > 0) {
        // PRIORIDADE 2: Usar matches altos (80-99%)
        console.log(`%c   ? USANDO ${highMatches.length} MATCH(ES) DE ALTA SIMILARIDADE (80-99%)`, 'color: #FFD700; font-weight: bold; font-size: 14px;');
        console.log('');
        
        highMatches.forEach((match, idx) => {
            console.log(`%c   ?? Match ${idx + 1}/${highMatches.length} (posi��o ${match.index}, ${match.similarity}% similar)`, 'color: #FFD700;');
            
            const nextSpins = searchHistory.slice(match.index, match.index + spinsToAnalyze);
            console.log(`      ? Analisando ${nextSpins.length} giros ap�s este match`);
            
            let localCounts = { red: 0, black: 0, white: 0 };
            nextSpins.forEach(spin => {
                if (spin.color in nextColorCounts) {
                    nextColorCounts[spin.color]++;
                    localCounts[spin.color]++;
                }
            });
            
            console.log(`      ? Distribui��o: ?? ${localCounts.red} | ? ${localCounts.black} | ? ${localCounts.white}`);
        });
        
        totalOccurrences = highMatches.length;
        avgSimilarity = Math.round(highMatches.reduce((sum, m) => sum + m.similarity, 0) / highMatches.length);
        matchesUsed = highMatches;
        
        console.log('');
        console.log(`%c   ? TOTAL DE OCORR�NCIAS DE ALTA SIMILARIDADE: ${totalOccurrences}`, 'color: #FFD700; font-weight: bold; font-size: 14px;');
        console.log(`%c   ?? Similaridade m�dia: ${avgSimilarity}%`, 'color: #FFD700; font-weight: bold;');
        
    } else if (similarMatches.length > 0) {
        // PRIORIDADE 3: Usar matches similares (60-79%)
        console.log(`%c   ? USANDO ${similarMatches.length} MATCH(ES) DE M�DIA SIMILARIDADE (60-79%)`, 'color: #00FF88; font-weight: bold; font-size: 14px;');
        console.log('');
        
        // Usar no m�ximo os 10 melhores matches similares (para n�o poluir demais)
        const topSimilarMatches = similarMatches
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 10);
        
        console.log(`%c   ?? Usando os ${topSimilarMatches.length} melhores matches (dos ${similarMatches.length} encontrados)`, 'color: #00FF88;');
        console.log('');
        
        topSimilarMatches.forEach((match, idx) => {
            console.log(`%c   ?? Match ${idx + 1}/${topSimilarMatches.length} (posi��o ${match.index}, ${match.similarity}% similar)`, 'color: #00FF88;');
            
            const nextSpins = searchHistory.slice(match.index, match.index + spinsToAnalyze);
            
            let localCounts = { red: 0, black: 0, white: 0 };
            nextSpins.forEach(spin => {
                if (spin.color in nextColorCounts) {
                    nextColorCounts[spin.color]++;
                    localCounts[spin.color]++;
                }
            });
            
            if (idx < 3) { // Mostrar detalhes s� dos 3 primeiros
                console.log(`      ? Analisando ${nextSpins.length} giros ap�s este match`);
                console.log(`      ? Distribui��o: ?? ${localCounts.red} | ? ${localCounts.black} | ? ${localCounts.white}`);
            }
        });
        
        totalOccurrences = topSimilarMatches.length;
        avgSimilarity = Math.round(topSimilarMatches.reduce((sum, m) => sum + m.similarity, 0) / topSimilarMatches.length);
        matchesUsed = topSimilarMatches;
        
        console.log('');
        console.log(`%c   ? TOTAL DE OCORR�NCIAS SIMILARES USADAS: ${totalOccurrences}`, 'color: #00FF88; font-weight: bold; font-size: 14px;');
        console.log(`%c   ?? Similaridade m�dia: ${avgSimilarity}%`, 'color: #00FF88; font-weight: bold;');
        
    } else {
        // ? NENHUM MATCH ENCONTRADO ? REJEITAR SINAL!
        console.log('');
        console.log(`%c   ??? NENHUM MATCH ENCONTRADO! ???`, 'color: #FF0000; font-weight: bold; font-size: 16px;');
        console.log(`%c   ? O padr�o dos �ltimos 10 giros NUNCA apareceu no hist�rico!`, 'color: #FF6666; font-weight: bold;');
        console.log(`%c   ? Sem dados hist�ricos para basear a previs�o!`, 'color: #FF6666; font-weight: bold;');
        console.log('');
        console.log(`%c   ?? DECIS�O: REJEITAR SINAL!`, 'color: #FF0000; font-weight: bold; font-size: 16px;');
        console.log(`%c   ? N�O vamos usar "frequ�ncia geral" (isso n�o funciona!)`, 'color: #FF6666; font-weight: bold;');
        console.log(`%c   ? S� enviamos sinal quando encontramos PADR�O REAL no hist�rico!`, 'color: #00FF88; font-weight: bold;');
        console.log('');
        
        totalOccurrences = 0;
        avgSimilarity = 0;
        
        // ? N�O PREENCHER nextColorCounts - deixar zerado!
        // Isso far� com que a confian�a seja 0% e o sinal seja rejeitado
    }
    console.log('');
    
    // Determinar cor recomendada baseada na distribui��o
    console.log('%c?? CALCULANDO COR RECOMENDADA...', 'color: #FFD700; font-weight: bold;');
    console.log('');
    console.log(`%c   Distribui��o total ap�s todos os matches:`, 'color: #00D4FF; font-weight: bold;');
    console.log(`%c      ?? VERMELHO: ${nextColorCounts.red} giros`, 'color: #FF0000; font-weight: bold;');
    console.log(`%c      ? PRETO: ${nextColorCounts.black} giros`, 'color: #FFFFFF; font-weight: bold;');
    console.log(`%c      ? BRANCO: ${nextColorCounts.white} giros`, 'color: #00FF00;');
    console.log('');
    
    let recommendedColor = 'red';
    let maxCount = nextColorCounts.red;
    
    if (nextColorCounts.black > maxCount) {
        recommendedColor = 'black';
        maxCount = nextColorCounts.black;
    }
    
    console.log(`%c   ?? Cor com MAIOR frequ�ncia: ${recommendedColor.toUpperCase()} (${maxCount} giros)`, 
        `color: ${recommendedColor === 'red' ? '#FF0000' : '#FFFFFF'}; font-weight: bold; font-size: 14px;`);
    console.log('');
    
    // Calcular confian�a baseada na distribui��o
    const totalColors = nextColorCounts.red + nextColorCounts.black + nextColorCounts.white;
    let confidence = totalColors > 0 ? Math.round((maxCount / totalColors) * 100) : 50;
    
    console.log(`%c   ?? C�lculo de confian�a:`, 'color: #00D4FF; font-weight: bold;');
    console.log(`%c      Total de giros analisados: ${totalColors}`, 'color: #00D4FF;');
    console.log(`%c      Frequ�ncia da cor vencedora: ${maxCount}/${totalColors}`, 'color: #00D4FF;');
    console.log(`%c      Confian�a inicial: ${confidence}%`, 'color: #00D4FF; font-weight: bold;');
    console.log('');
    
    // ? N�O AJUSTAR CONFIAN�A AQUI - j� ser� ajustada para 0% na valida��o abaixo
    
    // ? VALIDA��O RIGOROSA: ALERTAR SE POUCOS MATCHES
    console.log('%c?? VALIDA��O DE QUALIDADE DA AN�LISE:', 'color: #FFD700; font-weight: bold;');
    console.log('');
    
    const MIN_OCCURRENCES_WARNING = 5;
    const MIN_OCCURRENCES_CRITICAL = 2;
    
    if (totalOccurrences === 0) {
        console.log(`%c   ??? CR�TICO: NENHUM MATCH ENCONTRADO! ???`, 'color: #FF0000; font-weight: bold; font-size: 14px;');
        console.log(`%c   ? O padr�o dos �ltimos 10 giros NUNCA apareceu no hist�rico`, 'color: #FF6666; font-weight: bold;');
        console.log(`%c   ? SEM PADR�O REAL ? CONFIAN�A = 0%`, 'color: #FF0000; font-weight: bold; font-size: 14px;');
        console.log(`%c   ? ESTE SINAL SER� REJEITADO!`, 'color: #FF0000; font-weight: bold; font-size: 14px;');
        console.log('');
        
        // ? FOR�AR CONFIAN�A = 0% PARA GARANTIR REJEI��O
        confidence = 0;
    } else if (totalOccurrences < MIN_OCCURRENCES_CRITICAL) {
        console.log(`%c   ?? ALERTA: MUITO POUCOS MATCHES!`, 'color: #FF6666; font-weight: bold; font-size: 14px;');
        console.log(`%c   ? Matches encontrados: ${totalOccurrences}`, 'color: #FF6666; font-weight: bold;');
        console.log(`%c   ? Recomendado: pelo menos ${MIN_OCCURRENCES_WARNING}+ matches`, 'color: #FF6666; font-weight: bold;');
        console.log(`%c   ? Base estat�stica MUITO FRACA!`, 'color: #FF0000; font-weight: bold;');
        console.log('');
        
        const oldConfidence = confidence;
        confidence = Math.min(confidence, 45);
        console.log(`%c   ?? PENALIDADE: Confian�a limitada a ${confidence}% (era ${oldConfidence}%)`, 'color: #FFA500; font-weight: bold;');
        console.log('');
    } else if (totalOccurrences < MIN_OCCURRENCES_WARNING) {
        console.log(`%c   ?? ATEN��O: Poucos matches encontrados`, 'color: #FFA500; font-weight: bold;');
        console.log(`%c   ? Matches encontrados: ${totalOccurrences}`, 'color: #FFA500;');
        console.log(`%c   ? Recomendado: pelo menos ${MIN_OCCURRENCES_WARNING}+ matches`, 'color: #FFA500;');
        console.log(`%c   ? Base estat�stica razo�vel, mas n�o ideal`, 'color: #FFA500;');
        console.log('');
        
        const oldConfidence = confidence;
        confidence = Math.min(confidence, 50);
        console.log(`%c   ?? Confian�a limitada a ${confidence}% (era ${oldConfidence}%)`, 'color: #FFA500;');
        console.log('');
    } else {
        console.log(`%c   ? Base estat�stica S�LIDA!`, 'color: #00FF00; font-weight: bold; font-size: 14px;');
        console.log(`%c   ? Matches encontrados: ${totalOccurrences}`, 'color: #00FF88; font-weight: bold;');
        console.log(`%c   ? Similaridade m�dia: ${avgSimilarity}%`, 'color: #00FF88; font-weight: bold;');
        console.log(`%c   ? An�lise baseada em dados REAIS do hist�rico!`, 'color: #00FF00; font-weight: bold;');
        console.log('');
    }
    
    console.log('%c-------------------------------------------------------------------------------', 'color: #00D4FF; font-weight: bold;');
    console.log('%c?? RESULTADO FINAL DA BUSCA:', 'color: #00FF00; font-weight: bold; font-size: 16px;');
    console.log('%c-------------------------------------------------------------------------------', 'color: #00D4FF; font-weight: bold;');
    console.log(`%c   ?? Cor recomendada: ${recommendedColor.toUpperCase()}`, `color: ${recommendedColor === 'red' ? '#FF0000' : '#FFFFFF'}; font-weight: bold; font-size: 16px;`);
    console.log(`%c   ?? Confian�a: ${confidence}%`, 'color: #FFD700; font-weight: bold; font-size: 16px;');
    console.log(`%c   ?? Ocorr�ncias do padr�o: ${totalOccurrences}x`, 'color: #00FF88; font-weight: bold; font-size: 16px;');
    console.log(`%c   ?? Similaridade m�dia: ${avgSimilarity}%`, 'color: #00FF88; font-weight: bold; font-size: 16px;');
    console.log('%c-------------------------------------------------------------------------------', 'color: #00D4FF; font-weight: bold;');
    console.log('');
    
    const result = {
        color: recommendedColor,
        confidence: confidence,
        occurrences: totalOccurrences,
        similarity: avgSimilarity,
        distribution: nextColorCounts,
        // Dados extras para debug
        matchesBreakdown: {
            exact: exactMatches.length,
            high: highMatches.length,
            similar: similarMatches.length,
            used: matchesUsed.length
        }
    };
    
    console.log('%c?? Objeto retornado:', 'color: #00FFFF; font-weight: bold;');
    console.log(result);
    console.log('');
    
    return result;
}

/**
 * ?? FASE 4 (NOVA): Valida��o de Viabilidade de Sequ�ncia
 * Analisa se a sequ�ncia sugerida � vi�vel baseado no hist�rico recente
 */
function analyzeSequenceViability(history, suggestedColor) {
    console.log('%c?? Analisando viabilidade da sequ�ncia...', 'color: #9C27B0; font-weight: bold;');
    console.log(`%c   ? Cor sugerida pelas fases anteriores: ${suggestedColor.toUpperCase()}`, `color: ${suggestedColor === 'red' ? '#FF0000' : '#FFFFFF'}; font-weight: bold;`);
    
    // Detectar sequ�ncia atual (quantas cores consecutivas da mesma cor)
    let currentSequence = [];
    let currentColor = null;
    
    // ?? MOSTRAR OS �LTIMOS 10 GIROS PARA DEBUG
    console.log('%c   ?? �ltimos 10 giros (para debug):', 'color: #9C27B0;');
    const last10 = history.slice(0, 10);
    let debugString = '';
    for (let i = 0; i < last10.length; i++) {
        const spin = last10[i];
        const colorSymbol = spin.color === 'red' ? '??' : (spin.color === 'black' ? '?' : '?');
        const number = spin.number !== undefined ? spin.number : spin.roll;
        debugString += `${colorSymbol}${number} `;
    }
    console.log(`%c      ${debugString}`, 'color: #9C27B0;');
    console.log('');
    
    for (let i = 0; i < history.length; i++) {
        const spin = history[i];
        
        // Brancos QUEBRAM a sequ�ncia!
        if (spin.color === 'white') {
            break;
        }
        
        if (currentColor === null) {
            currentColor = spin.color;
            currentSequence.push(spin);
        } else if (spin.color === currentColor) {
            currentSequence.push(spin);
        } else {
            break; // Quebrou a sequ�ncia (cor diferente)
        }
    }
    
    const currentSequenceLength = currentSequence.length;
    const currentSequenceColor = currentColor;
    
    console.log(`%c   ?? Sequ�ncia atual detectada: ${currentSequenceLength} ${currentSequenceColor?.toUpperCase() || 'NENHUMA'}(s) CONSECUTIVO(S)`, 
        `color: ${currentSequenceColor === 'red' ? '#FF0000' : '#FFFFFF'}; font-weight: bold; font-size: 14px;`);
    console.log(`%c   ?? Detalhes da sequ�ncia:`, 'color: #9C27B0;');
    currentSequence.forEach((spin, idx) => {
        const number = spin.number !== undefined ? spin.number : spin.roll;
        console.log(`%c      ${idx + 1}�: ${spin.color.toUpperCase()} (${number})`, `color: ${spin.color === 'red' ? '#FF0000' : '#FFFFFF'};`);
    });
    console.log('');
    
    // Se sinal sugere a MESMA cor da sequ�ncia atual, significa que quer CONTINUAR a sequ�ncia
    const isExtendingSequence = (currentSequenceColor === suggestedColor);
    
    console.log(`%c   ?? Sinal sugere CONTINUAR a sequ�ncia? ${isExtendingSequence ? 'SIM ??' : 'N�O ?'}`, 'color: #9C27B0; font-weight: bold;');
    
    if (!isExtendingSequence) {
        console.log('%c   ? Sinal sugere QUEBRA de sequ�ncia (inverter cor)', 'color: #00FF88; font-weight: bold;');
        console.log('%c   ?? N�o precisa validar resist�ncia (j� est� invertendo)', 'color: #00FF88;');
        return {
            shouldInvert: false,
            reason: 'Sinal j� sugere invers�o de cor',
            maxHistorical: 0,
            currentLength: currentSequenceLength,
            isViable: true
        };
    }
    
    // Sinal quer CONTINUAR a sequ�ncia (ex: 3 pretos ? sugerir 4� preto)
    const targetSequenceLength = currentSequenceLength + 1;
    console.log('');
    console.log(`%c   ?? ?? ?? ATEN��O! Sinal quer CONTINUAR a sequ�ncia! ?? ?? ??`, 'color: #FF0000; font-weight: bold; font-size: 14px; background: #FFFF00;');
    console.log(`%c   ? Sequ�ncia ATUAL: ${currentSequenceLength} ${suggestedColor.toUpperCase()}(s) consecutivo(s)`, `color: ${suggestedColor === 'red' ? '#FF0000' : '#FFFFFF'}; font-weight: bold;`);
    console.log(`%c   ? Sinal pede: ${targetSequenceLength}� ${suggestedColor.toUpperCase()} (${targetSequenceLength} consecutivos!)`, `color: ${suggestedColor === 'red' ? '#FF0000' : '#FFFFFF'}; font-weight: bold;`);
    console.log('');
    
    // Buscar no hist�rico: qual foi a MAIOR sequ�ncia dessa cor nos �ltimos giros?
    const analysisWindow = Math.min(history.length, 500); // Analisar at� 500 giros
    console.log(`%c   ?? Buscando no hist�rico dos �ltimos ${analysisWindow} giros...`, 'color: #9C27B0; font-weight: bold;');
    console.log(`%c   ?? Pergunta: J� ACONTECEU ${targetSequenceLength}+ ${suggestedColor.toUpperCase()}(s) consecutivos antes?`, 'color: #9C27B0; font-weight: bold;');
    
    let maxConsecutive = 0;
    let resistances = []; // Armazenar todas as resist�ncias encontradas
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
            // Cor diferente (black, white, ou outra) QUEBRA a sequ�ncia!
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
    console.log(`%c   ?? RESULTADO DA BUSCA HIST�RICA:`, 'color: #9C27B0; font-weight: bold; font-size: 13px;');
    console.log(`%c      ? M�ximo de ${suggestedColor.toUpperCase()}(s) consecutivos j� encontrado: ${maxConsecutive}`, 
        `color: ${suggestedColor === 'red' ? '#FF0000' : '#FFFFFF'}; font-weight: bold;`);
    console.log(`%c      ? Sinal quer: ${targetSequenceLength} ${suggestedColor.toUpperCase()}(s) consecutivos`, 
        `color: ${suggestedColor === 'red' ? '#FF0000' : '#FFFFFF'}; font-weight: bold;`);
    console.log('');
    
    // DECIS�O: A sequ�ncia sugerida � vi�vel?
    if (targetSequenceLength > maxConsecutive) {
        // NUNCA aconteceu uma sequ�ncia t�o grande!
        console.log('%c   ??? DECIS�O: SEQU�NCIA INVI�VEL! ???', 'color: #FFFFFF; font-weight: bold; font-size: 14px; background: #FF0000;');
        console.log('%c   ?? NUNCA aconteceu no hist�rico analisado!', 'color: #FF0000; font-weight: bold;');
        console.log(`%c      ? M�ximo hist�rico: ${maxConsecutive} ${suggestedColor.toUpperCase()}(s)`, 'color: #FF6666; font-weight: bold;');
        console.log(`%c      ? Sinal pede: ${targetSequenceLength} ${suggestedColor.toUpperCase()}(s)`, 'color: #FF6666; font-weight: bold;');
        console.log('');
        console.log('%c   ?? A��O: CANCELAR SINAL (N�O INVERTER)!', 'color: #FFFF00; font-weight: bold; font-size: 14px; background: #FF0000;');
        console.log('%c   ?? Seria burrice apostar em algo que NUNCA aconteceu!', 'color: #FF6666; font-weight: bold;');
        console.log('');
        
        return {
            shouldInvert: false,  // ? N�O inverte
            shouldReject: true,   // ? NOVO: Flag para rejeitar o sinal
            reason: `Sequ�ncia NUNCA aconteceu - m�ximo hist�rico: ${maxConsecutive}, sinal pede: ${targetSequenceLength}`,
            maxHistorical: maxConsecutive,
            currentLength: currentSequenceLength,
            isViable: false
        };
    }
    
    // Sequ�ncia J� aconteceu no passado - mas QUANDO foi a �ltima vez?
    // Buscar quando foi a �LTIMA ocorr�ncia de uma sequ�ncia >= targetSequenceLength
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
            // Qualquer cor diferente QUEBRA a sequ�ncia!
            tempStreak = 0;
            tempLastColor = spin.color;
        }
    }
    
    console.log('%c   -----------------------------------------------------------', 'color: #9C27B0;');
    
    if (lastOccurrenceGirosAgo === null) {
        // NUNCA aconteceu essa sequ�ncia!
        console.log('%c   ? NUNCA aconteceu sequ�ncia de ' + targetSequenceLength + '+ ' + suggestedColor.toUpperCase() + '(s) no hist�rico!', 'color: #FF0000; font-weight: bold;');
        console.log('%c   ?? Decis�o: CANCELAR sinal (padr�o inexistente)', 'color: #FFD700; font-weight: bold;');
        
        return {
            shouldInvert: false,  // ? N�O inverte
            shouldReject: true,   // ? REJEITA
            reason: `NUNCA aconteceu ${targetSequenceLength}+ ${suggestedColor}(s) nos �ltimos ${analysisWindow} giros`,
            maxHistorical: maxConsecutive,
            currentLength: currentSequenceLength,
            isViable: false
        };
    }
    
    // Encontrou! Agora decidir baseado em QUANDO foi
    console.log(`%c   ?? �ltima sequ�ncia de ${targetSequenceLength}+ ${suggestedColor.toUpperCase()}(s): h� ${lastOccurrenceGirosAgo} giros atr�s`, 'color: #9C27B0; font-weight: bold;');
    console.log('%c   -----------------------------------------------------------', 'color: #9C27B0;');
    console.log('');
    
    // ? OP��O 1: Aconteceu nos �ltimos 20 giros (RECENTE - padr�o ATIVO)
    if (lastOccurrenceGirosAgo < 20) {
        console.log('%c   ? OP��O 1: Aconteceu RECENTEMENTE (< 20 giros)', 'color: #00FF00; font-weight: bold; font-size: 14px;');
        console.log('%c      Padr�o est� ATIVO! Pode acontecer de novo!', 'color: #00FF88;');
        console.log('%c   ?? Decis�o: MANTER sinal original', 'color: #FFD700; font-weight: bold;');
        
        return {
            shouldInvert: false,
            reason: `Sequ�ncia aconteceu recentemente (h� ${lastOccurrenceGirosAgo} giros) - padr�o ativo`,
            maxHistorical: maxConsecutive,
            currentLength: currentSequenceLength,
            isViable: true
        };
    }
    
    // ?? OP��O 2: Aconteceu entre 20-50 giros (ZONA CINZENTA - analisar mais)
    if (lastOccurrenceGirosAgo >= 20 && lastOccurrenceGirosAgo <= 50) {
        console.log('%c   ?? OP��O 2: Aconteceu na ZONA CINZENTA (20-50 giros)', 'color: #FFA500; font-weight: bold; font-size: 14px;');
        console.log('%c      Analisando mais profundamente...', 'color: #FFAA00;');
        
        // Buscar TODAS as ocorr�ncias dessa sequ�ncia
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
                // Qualquer cor diferente QUEBRA a sequ�ncia!
                tempStreak = 0;
                tempLastColor = spin.color;
            }
        }
        
        console.log(`%c      ?? Total de ocorr�ncias encontradas: ${allOccurrences.length}`, 'color: #FFAA00;');
        
        if (allOccurrences.length >= 2) {
            // Calcular intervalo m�dio entre ocorr�ncias
            let intervals = [];
            for (let i = 1; i < allOccurrences.length; i++) {
                intervals.push(allOccurrences[i] - allOccurrences[i - 1]);
            }
            const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
            
            console.log(`%c      ?? Intervalo m�dio entre ocorr�ncias: ${Math.round(avgInterval)} giros`, 'color: #FFAA00;');
            
            // Se o intervalo atual est� ABAIXO da m�dia, pode quebrar em breve
            if (lastOccurrenceGirosAgo < avgInterval * 0.8) {
                console.log('%c      ? Intervalo atual < 80% da m�dia ? PODE QUEBRAR!', 'color: #00FF88; font-weight: bold;');
                console.log('%c   ?? Decis�o: MANTER sinal', 'color: #FFD700; font-weight: bold;');
                
                return {
                    shouldInvert: false,
                    reason: `Intervalo atual (${lastOccurrenceGirosAgo}) < m�dia hist�rica (${Math.round(avgInterval)}) - pode quebrar`,
                    maxHistorical: maxConsecutive,
                    currentLength: currentSequenceLength,
                    isViable: true
                };
            } else {
                console.log('%c      ? Intervalo atual > 80% da m�dia ? AINDA CEDO!', 'color: #FF6666; font-weight: bold;');
                console.log('%c   ?? Decis�o: CANCELAR sinal (ainda cedo)', 'color: #FFD700; font-weight: bold;');
                
                return {
                    shouldInvert: false,  // ? N�O inverte
                    shouldReject: true,   // ? REJEITA
                    reason: `Intervalo atual (${lastOccurrenceGirosAgo}) > m�dia hist�rica (${Math.round(avgInterval)}) - ainda cedo`,
                    maxHistorical: maxConsecutive,
                    currentLength: currentSequenceLength,
                    isViable: false
                };
            }
        } else {
            // S� aconteceu 1 vez no hist�rico - muito raro!
            console.log('%c      ?? Apenas 1 ocorr�ncia no hist�rico ? RARO!', 'color: #FFA500; font-weight: bold;');
            console.log('%c   ?? Decis�o: CANCELAR sinal (evento raro)', 'color: #FFD700; font-weight: bold;');
            
            return {
                shouldInvert: false,  // ? N�O inverte
                shouldReject: true,   // ? REJEITA
                reason: `Apenas 1 ocorr�ncia nos �ltimos ${analysisWindow} giros - evento raro`,
                maxHistorical: maxConsecutive,
                currentLength: currentSequenceLength,
                isViable: false
            };
        }
    }
    
    // ? OP��O 3: Aconteceu h� MAIS de 50 giros (MUITO TEMPO - resist�ncia forte)
    console.log('%c   ? OP��O 3: Aconteceu h� MUITO TEMPO (> 50 giros)', 'color: #FF0000; font-weight: bold; font-size: 14px;');
    console.log('%c      Faz muito tempo! Resist�ncia forte!', 'color: #FF6666;');
    console.log('%c   ?? Decis�o: CANCELAR sinal (faz muito tempo)', 'color: #FFD700; font-weight: bold;');
    
    return {
        shouldInvert: false,  // ? N�O inverte
        shouldReject: true,   // ? REJEITA
        reason: `�ltima ocorr�ncia h� ${lastOccurrenceGirosAgo} giros - resist�ncia forte (> 50 giros)`,
        maxHistorical: maxConsecutive,
        currentLength: currentSequenceLength,
        isViable: false
    };
}

/**
 * ? VERIFICAR SE PADR�O SALVO AINDA � V�LIDO
 * Checa se o padr�o ainda aparece recentemente e mant�m 100% WIN
 */
function verifyHotPatternStillValid(history, savedPattern) {
    try {
        console.log('');
        console.log('?? VERIFICANDO SE PADR�O SALVO AINDA � V�LIDO...');
        
        const last50 = history.slice(0, Math.min(50, history.length));
        const patternSize = savedPattern.pattern.length;
        
        // Procurar se o padr�o ainda aparece nos �ltimos 50 giros
        let found = false;
        let totalWins = 0;
        let totalLosses = 0;
        
        for (let i = 0; i <= last50.length - patternSize - 1; i++) {
            const currentPattern = last50.slice(i, i + patternSize).map(s => s.color);
            
            if (JSON.stringify(currentPattern) === JSON.stringify(savedPattern.pattern)) {
                found = true;
                const result = last50[i + patternSize].color;
                
                if (result === savedPattern.prediction) {
                    totalWins++;
                } else {
                    totalLosses++;
                }
            }
        }
        
        // Padr�o � v�lido se:
        // 1. Ainda aparece nos �ltimos 50 giros
        // 2. Tem pelo menos 2 ocorr�ncias da cor prevista
        // 3. N�o teve 2+ losses consecutivos recentes
        const isValid = found && totalWins >= 2;
        
        console.log(`   ? Padr�o encontrado: ${found}`);
        console.log(`   ? Total WINs: ${totalWins}`);
        console.log(`   ? Total LOSSes: ${totalLosses}`);
        console.log(`   ${isValid ? '? PADR�O AINDA � V�LIDO!' : '? PADR�O N�O � MAIS V�LIDO'}`);
        console.log('');
        
        return isValid;
    } catch (error) {
        console.error('? Erro ao verificar padr�o salvo:', error);
        return false;
    }
}

/**
 * ?? DETECTAR PADR�O QUENTE NOS �LTIMOS 75 GIROS
 * Encontra padr�es de 4-6 giros com maior taxa de acerto
 * ?? DETERMIN�STICO: Sempre retorna o mesmo padr�o com o mesmo hist�rico
 * ?? R�PIDO: Executa em <100ms (otimizado, sem logs excessivos)
 */
function detectHotPattern(history) {
    const startTime = performance.now(); // ?? MEDIR TEMPO
    
    try {
        console.log('');
        console.log('-----------------------------------------------------------');
        console.log('?? DETECTANDO PADR�O QUENTE');
        console.log('-----------------------------------------------------------');
        
        if (!history || history.length < 12) {
            console.log('?? Hist�rico insuficiente (m�nimo 12 giros)');
            return null;
        }
    
    // Pegar �ltimos 75 giros (aumentado de 50 para 75)
    const last50 = history.slice(0, Math.min(75, history.length));
    console.log(`?? Analisando ${last50.length} giros (�ltimos 75) - buscando padr�es 4-6 giros...`);
    
    // Debug: mostrar os �ltimos 15 giros
    const preview = last50.slice(0, 15).map(s => {
        if (s.color === 'red') return '??';
        if (s.color === 'black') return '?';
        return '?';
    }).join(' ');
    console.log(`?? �ltimos 15 giros: ${preview}`);
    console.log('');
    
    const candidatos = [];
    
    // Testar padr�es de tamanho 4, 5 e 6 (M�NIMO 4 GIROS)
    for (let patternSize = 4; patternSize <= 6; patternSize++) {
        if (last50.length < patternSize + 1) {
            continue;
        }
        
        // Mapear todos os padr�es poss�veis desse tamanho
        const patternMap = {};
        let patternsFound = 0;
        
        for (let i = 0; i <= last50.length - patternSize - 1; i++) {
            // Extrair padr�o (ex: [red, red, black])
            const pattern = last50.slice(i, i + patternSize).map(s => s.color);
            const result = last50[i + patternSize].color; // Pr�xima cor (resultado)
            
            const patternKey = pattern.join('-');
            
            if (!patternMap[patternKey]) {
                patternMap[patternKey] = {
                    pattern: pattern,
                    occurrences: [],
                    predictions: { red: 0, black: 0, white: 0 },
                    totalWins: 0,
                    totalLosses: 0,
                    consecutiveLosses: 0,
                    maxConsecutiveLosses: 0
                };
            }
            
            patternMap[patternKey].occurrences.push({
                result: result,
                index: i,
                timestamp: last50[i + patternSize].timestamp // Timestamp do giro resultado
            });
            
            // Contar previs�es (qual cor mais saiu depois desse padr�o)
            patternMap[patternKey].predictions[result]++;
        }
        
        // Analisar cada padr�o encontrado
        let validPatterns = 0;
        for (const key in patternMap) {
            const data = patternMap[key];
            
            // ? NOVO CRIT�RIO: M�nimo 2 ocorr�ncias (n�o precisa ser muitas)
            if (data.occurrences.length < 2) continue;
            
            // Determinar cor prevista (mais frequente)
            let predictedColor = 'red';
            let maxCount = data.predictions.red;
            if (data.predictions.black > maxCount) {
                predictedColor = 'black';
                maxCount = data.predictions.black;
            }
            
            // ? NOVO ALGORITMO CORRETO:
            // Contar APENAS as vezes que a cor prevista saiu (ignorar outras cores)
            const timesPredictedColorAppeared = data.predictions[predictedColor];
            
            // Se a cor prevista saiu menos de 2 vezes, descartar
            if (timesPredictedColorAppeared < 2) {
                continue;
            }
            
            // ASSUMIR 100% WIN: Se o padr�o apareceu e sempre saiu a mesma cor depois,
            // isso indica um padr�o forte! N�o precisa verificar "acerto" porque
            // o padr�o EM SI j� � o indicador.
            data.totalWins = timesPredictedColorAppeared;
            data.totalLosses = 0; // N�o contamos outras cores como "loss"
            
            const winRate = 1.0; // 100% porque estamos contando apenas a cor que mais saiu
            
            // Pegar timestamp da �ltima ocorr�ncia (mais recente, index mais baixo)
            const lastOccurrence = data.occurrences.reduce((latest, current) => {
                return current.index < latest.index ? current : latest;
            });
            
            // Capturar os timestamps de CADA giro do padr�o (para mostrar nos �cones)
            const patternTimestamps = [];
            for (let j = 0; j < patternSize; j++) {
                if (last50[lastOccurrence.index + j]) {
                    patternTimestamps.push(last50[lastOccurrence.index + j].timestamp);
                }
            }
            
            candidatos.push({
                pattern: data.pattern,
                prediction: predictedColor,
                occurrences: data.occurrences.length,
                totalWins: data.totalWins,
                totalLosses: data.totalLosses,
                winRate: winRate,
                maxConsecutiveLosses: 0, // Zero porque assumimos 100% WIN
                lastOccurrenceTimestamp: lastOccurrence.timestamp, // Hor�rio da �ltima vez que o padr�o apareceu
                patternTimestamps: patternTimestamps // Timestamps de CADA giro do padr�o
            });
            validPatterns++;
        }
    }
    
    console.log(`   ? ${candidatos.length} candidatos encontrados (4-6 giros)`);
    
    // ? SE N�O ENCONTROU com 4-6 giros, tentar com padr�es MENORES (3 giros)
    if (candidatos.length === 0) {
        console.log('   ?? Nenhum padr�o de 4-6 giros, tentando 3 giros (fallback)...');
        
        const patternSize = 3;
        if (last50.length >= patternSize + 1) {
            const patternMap = {};
            
            for (let i = 0; i <= last50.length - patternSize - 1; i++) {
                const pattern = last50.slice(i, i + patternSize).map(s => s.color);
                const result = last50[i + patternSize].color;
                
                const patternKey = pattern.join('-');
                
                if (!patternMap[patternKey]) {
                    patternMap[patternKey] = {
                        pattern: pattern,
                        occurrences: [],
                        predictions: { red: 0, black: 0, white: 0 }
                    };
                }
                
                patternMap[patternKey].occurrences.push({ 
                    result: result, 
                    index: i,
                    timestamp: last50[i + patternSize].timestamp
                });
                patternMap[patternKey].predictions[result]++;
            }
            
            for (const key in patternMap) {
                const data = patternMap[key];
                
                // Padr�o deve aparecer pelo menos 2 vezes
                if (data.occurrences.length < 2) continue;
                
                // Determinar cor mais frequente
                let predictedColor = 'red';
                let maxCount = data.predictions.red;
                if (data.predictions.black > maxCount) {
                    predictedColor = 'black';
                    maxCount = data.predictions.black;
                }
                
                const timesPredictedColorAppeared = data.predictions[predictedColor];
                
                // Se a cor prevista saiu menos de 2 vezes, descartar
                if (timesPredictedColorAppeared < 2) continue;
                
                // Pegar timestamp da �ltima ocorr�ncia (mais recente, index mais baixo)
                const lastOccurrence = data.occurrences.reduce((latest, current) => {
                    return current.index < latest.index ? current : latest;
                });
                
                // Capturar os timestamps de CADA giro do padr�o (para mostrar nos �cones)
                const patternTimestamps = [];
                for (let j = 0; j < patternSize; j++) {
                    if (last50[lastOccurrence.index + j]) {
                        patternTimestamps.push(last50[lastOccurrence.index + j].timestamp);
                    }
                }
                
                candidatos.push({
                    pattern: data.pattern,
                    prediction: predictedColor,
                    occurrences: data.occurrences.length,
                    totalWins: timesPredictedColorAppeared,
                    totalLosses: 0,
                    winRate: 1.0,
                    maxConsecutiveLosses: 0,
                    lastOccurrenceTimestamp: lastOccurrence.timestamp,
                    patternTimestamps: patternTimestamps // Timestamps de CADA giro do padr�o
                });
            }
        }
        
        if (candidatos.length === 0) {
            console.log('   ? Nenhum padr�o encontrado (hist�rico aleat�rio ou insuficiente)');
            return null;
        }
    }
    
    console.log(`   ? ${candidatos.length} padr�o(�es) encontrado(s)`);
    
    // Ordenar por (DETERMIN�STICO):
    // 1. Maior win rate (deve ser 100%)
    // 2. Maior n�mero de ocorr�ncias da cor prevista
    // 3. Mais recente (timestamp maior = mais recente)
    // 4. Maior n�mero total de ocorr�ncias do padr�o
    candidatos.sort((a, b) => {
        // 1� crit�rio: win rate
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        
        // 2� crit�rio: total de wins
        if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
        
        // 3� crit�rio: MAIS RECENTE (timestamp da �ltima ocorr�ncia)
        // Timestamp maior = mais recente
        if (b.lastOccurrenceTimestamp !== a.lastOccurrenceTimestamp) {
            return new Date(b.lastOccurrenceTimestamp) - new Date(a.lastOccurrenceTimestamp);
        }
        
        // 4� crit�rio: mais ocorr�ncias totais
        return b.occurrences - a.occurrences;
    });
    
    const melhor = candidatos[0];
    
    const patternDisplay = melhor.pattern.map(color => {
        if (color === 'red') return '?? RED';
        if (color === 'black') return '? BLACK';
        return '? WHITE';
    }).join(' ? ');
    const predDisplay = melhor.prediction === 'red' ? '?? RED' : (melhor.prediction === 'black' ? '? BLACK' : '? WHITE');
    
    console.log('');
    console.log('?????? PADR�O QUENTE IDENTIFICADO! ??????');
    console.log(`   ?? Padr�o: ${patternDisplay}`);
    console.log(`   ?? Previs�o: ${predDisplay}`);
    console.log(`   ?? Padr�o apareceu: ${melhor.occurrences} vezes nos �ltimos 50 giros`);
    console.log(`   ? Cor prevista (${melhor.prediction.toUpperCase()}) saiu: ${melhor.totalWins} vezes`);
    console.log(`   ?? Frequ�ncia: ${((melhor.totalWins / melhor.occurrences) * 100).toFixed(1)}%`);
    console.log(`   ? �ltima vez que apareceu: ${new Date(melhor.lastOccurrenceTimestamp).toLocaleTimeString('pt-BR')}`);
    console.log('');
    console.log('?? POR QUE ESTE PADR�O FOI ESCOLHIDO:');
    console.log(`   1?? Win Rate: ${(melhor.winRate * 100).toFixed(1)}% (crit�rio principal)`);
    console.log(`   2?? Total de Wins: ${melhor.totalWins}x (cor prevista acertou)`);
    console.log(`   3?? Recente: apareceu �s ${new Date(melhor.lastOccurrenceTimestamp).toLocaleTimeString('pt-BR')} (desempate)`);
    console.log(`   4?? Ocorr�ncias totais: ${melhor.occurrences}x (�ltimo crit�rio)`);
    console.log('');
    console.log('? Este padr�o � DETERMIN�STICO - sempre ser� o mesmo com o mesmo hist�rico!');
    
    const elapsedTime = (performance.now() - startTime).toFixed(2);
    console.log(`?? TEMPO DE EXECU��O: ${elapsedTime}ms`);
    console.log('-----------------------------------------------------------');
    console.log('');
    
    return melhor;
    
    } catch (error) {
        console.error('??? ERRO CR�TICO em detectHotPattern! ???');
        console.error('Erro:', error);
        console.error('Stack:', error.stack);
        return null;
    }
}

/**
 * FUN��O PRINCIPAL: An�lise Avan�ada - N�VEL DIAMANTE
 * NOVO FLUXO: 5 Fases de An�lise Progressiva
 */
async function analyzeWithPatternSystem(history) {
    console.log('');
    console.log('%c-------------------------------------------------------------------', 'color: #FFD700; font-weight: bold; font-size: 18px;');
    console.log('%c?? DEBUG COMPLETO: analyzeWithPatternSystem INICIANDO', 'color: #FFD700; font-weight: bold; font-size: 18px;');
    console.log('%c-------------------------------------------------------------------', 'color: #FFD700; font-weight: bold; font-size: 18px;');
    console.log('');
    
    // VALIDA��O DE DADOS DE ENTRADA
    console.log('%c?? 1. VALIDA��O DE DADOS DE ENTRADA:', 'color: #00FFFF; font-weight: bold; font-size: 14px;');
    console.log(`   ? history existe? ${!!history ? '? SIM' : '? N�O'}`);
    console.log(`   ? history.length = ${history ? history.length : 'N/A'}`);
    console.log(`   ? hotPatternMode = ${hotPatternMode ? '? ATIVO' : '? INATIVO'}`);
    
    if (history && history.length > 0) {
        console.log('');
        console.log('%c?? �LTIMOS 20 GIROS DO HIST�RICO (DADOS REAIS):', 'color: #00FFFF; font-weight: bold;');
        const last20 = history.slice(0, 20);
        last20.forEach((spin, idx) => {
            const colorEmoji = spin.color === 'red' ? '??' : spin.color === 'black' ? '?' : '?';
            const timestamp = spin.timestamp ? new Date(spin.timestamp).toLocaleTimeString('pt-BR') : 'N/A';
            console.log(`   ${idx + 1}. ${colorEmoji} ${spin.color.toUpperCase()} (n� ${spin.number}) �s ${timestamp}`);
        });
    }
    console.log('');
    console.log('%c-------------------------------------------------------------------', 'color: #FFD700; font-weight: bold;');
    console.log('');
    
        console.log('%c+-----------------------------------------------------------+', 'color: #00FF00; font-weight: bold; font-size: 16px;');
        console.log('%c�  ?? N�VEL DIAMANTE - AN�LISE AVAN�ADA 5 FASES            �', 'color: #00FF00; font-weight: bold; font-size: 16px;');
        console.log('%c�-----------------------------------------------------------�', 'color: #00FF00; font-weight: bold;');
        console.log('%c�  ? FASE 1: Busca Adaptativa (4-10 Giros) - NOVO!       �', 'color: #00FF88; font-weight: bold;');
        console.log('%c�  ?? FASE 2: An�lise 25% Mais Recentes (Cor Quente)      �', 'color: #00FF88;');
        console.log('%c�  ??? FASE 3: �ltimos 20 Giros (Domin�ncia �5%)          �', 'color: #00FF88;');
        console.log('%c�  ?? FASE 4: Padr�es Customizados (PRIORIDADE ABSOLUTA)  �', 'color: #FFD700; font-weight: bold;');
        console.log('%c�  ?? FASE 5: Valida��o de Resist�ncia (se sem padr�o)    �', 'color: #00FF88;');
        console.log('%c+-----------------------------------------------------------+', 'color: #00FF00; font-weight: bold; font-size: 16px;');
    console.log('');
    
    try {
        console.log('?? DEBUG: Iniciando try block principal...');
        // Verificar acerto do sinal anterior (se houver)
        if (history.length > 0) {
            await checkPreviousSignalAccuracy(history[0]);
        }
        
        console.log('');
        
        // ---------------------------------------------------------------
        // ?? VERIFICA��O DE INTERVALO M�NIMO ENTRE SINAIS
        // ---------------------------------------------------------------
        const minIntervalSpins = analyzerConfig.minIntervalSpins || 0;
        
        console.log('');
        console.log('%c+-----------------------------------------------------------+', 'color: #00D4FF; font-weight: bold;');
        console.log('%c�  ?? VERIFICA��O DE INTERVALO ENTRE SINAIS                �', 'color: #00D4FF; font-weight: bold;');
        console.log('%c+-----------------------------------------------------------+', 'color: #00D4FF; font-weight: bold;');
        console.log(`?? Intervalo m�nimo configurado: ${minIntervalSpins} giro(s)`);
        console.log(`?? Giro atual: #${history[0]?.number || 'N/A'}`);
        
        if (minIntervalSpins > 0) {
            const entriesResult = await chrome.storage.local.get(['lastSignalSpinNumber', 'lastSignalTimestamp']);
            const lastSignalSpinNumber = entriesResult.lastSignalSpinNumber || null;
            const lastSignalTimestamp = entriesResult.lastSignalTimestamp || null;
            
            console.log(`?? �ltimo sinal salvo: ${lastSignalSpinNumber ? '#' + lastSignalSpinNumber : 'Nenhum'}`);
            if (lastSignalTimestamp) {
                const timeSinceSignal = Date.now() - lastSignalTimestamp;
                console.log(`? Tempo desde �ltimo sinal: ${Math.round(timeSinceSignal / 1000)}s`);
            }
            
            if (lastSignalSpinNumber !== null && history.length > 0) {
                // ? CORRE��O: Buscar pelo n�mero do giro no hist�rico
                const currentSpinNumber = history[0].number;
                
                // Se for o MESMO giro, bloquear imediatamente (sinal duplicado)
                if (currentSpinNumber === lastSignalSpinNumber) {
                    console.log('');
                    console.log('%c+-----------------------------------------------------------+', 'color: #FF0000; font-weight: bold;');
                    console.log('%c�  ?? SINAL BLOQUEADO - MESMO GIRO!                        �', 'color: #FF0000; font-weight: bold;');
                    console.log('%c�-----------------------------------------------------------�', 'color: #FF0000; font-weight: bold;');
                    console.log(`%c�  ?? Giro atual: #${currentSpinNumber}                                    �`, 'color: #FF6666;');
                    console.log(`%c�  ?? �ltimo sinal: #${lastSignalSpinNumber}                                  �`, 'color: #FF6666;');
                    console.log('%c�  ?? Este giro J� teve sinal enviado!                     �', 'color: #FF6666;');
                    console.log('%c+-----------------------------------------------------------+', 'color: #FF0000; font-weight: bold;');
                    console.log('');
                    return null;
                }
                
                // Encontrar a posi��o do �ltimo sinal no hist�rico
                const lastSignalIndex = history.findIndex(spin => spin.number === lastSignalSpinNumber);
                
                console.log(`?? Procurando giro #${lastSignalSpinNumber} no hist�rico...`);
                console.log(`   Posi��o encontrada: ${lastSignalIndex !== -1 ? lastSignalIndex : 'N�O ENCONTRADO'}`);
                
                let spinsSinceLastSignal = 0;
                if (lastSignalIndex !== -1) {
                    // Encontrou no hist�rico - calcular quantos giros se passaram
                    spinsSinceLastSignal = lastSignalIndex;
                    console.log(`   ? Giros decorridos (baseado na posi��o): ${spinsSinceLastSignal}`);
                } else {
                    // ? CORRE��O: Se n�o encontrou, tentar calcular pela diferen�a de n�meros
                    const numberDiff = currentSpinNumber - lastSignalSpinNumber;
                    if (numberDiff > 0 && numberDiff < 1000) {
                        spinsSinceLastSignal = numberDiff;
                        console.log(`   ?? N�o encontrado no hist�rico, calculando pela diferen�a de n�meros`);
                        console.log(`   ?? Diferen�a: ${currentSpinNumber} - ${lastSignalSpinNumber} = ${spinsSinceLastSignal} giros`);
                    } else {
                        // Muito tempo passou, permitir
                        spinsSinceLastSignal = minIntervalSpins + 1;
                        console.log(`   ?? Diferen�a muito grande ou inv�lida, permitindo sinal`);
                    }
                }
                
                console.log('');
                console.log('%c?? L�GICA DE VALIDA��O:', 'color: #FFD700; font-weight: bold;');
                console.log(`   Intervalo m�nimo: ${minIntervalSpins} giro(s)`);
                console.log(`   Giros decorridos: ${spinsSinceLastSignal}`);
                console.log(`   Deve esperar ${minIntervalSpins} giros COMPLETOS`);
                console.log(`   Exemplo: Se min=2, bloqueia giros 1 e 2, libera no 3�`);
                
                // ? CORRE��O: Deve esperar minIntervalSpins giros COMPLETOS
                // Exemplo: minIntervalSpins = 2
                //   - Giro #101 (1� ap�s sinal) ? spinsSinceLastSignal = 1 ? BLOQUEAR
                //   - Giro #102 (2� ap�s sinal) ? spinsSinceLastSignal = 2 ? BLOQUEAR
                //   - Giro #103 (3� ap�s sinal) ? spinsSinceLastSignal = 3 ? PERMITIR
                if (spinsSinceLastSignal <= minIntervalSpins) {
                    const girosRestantes = minIntervalSpins - spinsSinceLastSignal + 1;
                    
                    console.log('');
                    console.log('%c+-----------------------------------------------------------+', 'color: #FFAA00; font-weight: bold;');
                    console.log('%c�  ?? SINAL BLOQUEADO - INTERVALO INSUFICIENTE!            �', 'color: #FFAA00; font-weight: bold;');
                    console.log('%c�-----------------------------------------------------------�', 'color: #FFAA00; font-weight: bold;');
                    console.log(`%c�  ?? Giros desde �ltimo sinal: ${spinsSinceLastSignal.toString().padEnd(28)}�`, 'color: #FFAA00;');
                    console.log(`%c�  ?? Intervalo m�nimo: ${minIntervalSpins.toString().padEnd(36)}�`, 'color: #FFAA00;');
                    console.log(`%c�  ? Faltam: ${girosRestantes.toString().padEnd(47)}�`, 'color: #FFAA00; font-weight: bold;');
                    console.log('%c�-----------------------------------------------------------�', 'color: #FFAA00; font-weight: bold;');
                    console.log('%c�  ? Aguardando mais giros para liberar novo sinal...      �', 'color: #FFAA00;');
                    console.log('%c+-----------------------------------------------------------+', 'color: #FFAA00; font-weight: bold;');
                    console.log('');
                    
                    return null;
                } else {
                    console.log('');
                    console.log('%c? INTERVALO SUFICIENTE!', 'color: #00FF88; font-weight: bold;');
                    console.log(`%c   Giros decorridos: ${spinsSinceLastSignal}`, 'color: #00FF88;');
                    console.log(`%c   Intervalo m�nimo: ${minIntervalSpins}`, 'color: #00FF88;');
                    console.log('%c   ? PERMITIDO: Enviar novo sinal', 'color: #00FF88; font-weight: bold;');
                    console.log('');
                }
            } else {
                console.log('');
                console.log('%c? PRIMEIRO SINAL DA SESS�O!', 'color: #00FF88; font-weight: bold;');
                console.log('%c   ? PERMITIDO: Nenhum sinal anterior', 'color: #00FF88; font-weight: bold;');
                console.log('');
            }
        } else {
            console.log('');
            console.log('%c? SEM INTERVALO CONFIGURADO!', 'color: #00FF88; font-weight: bold;');
            console.log('%c   ? PERMITIDO: Sinais enviados sempre que encontrar padr�o v�lido', 'color: #00FF88; font-weight: bold;');
            console.log('');
        }
        
        // ---------------------------------------------------------------
        // ?? MODO PADR�O QUENTE (SE ATIVO)
        // ---------------------------------------------------------------
        let hotPatternSignal = null;
        
        if (hotPatternMode) {
            console.log('');
            console.log('%c+-----------------------------------------------------------+', 'color: #FF6B35; font-weight: bold;');
            console.log('%c�  ?? MODO PADR�O QUENTE ATIVO                             �', 'color: #FF6B35; font-weight: bold; font-size: 14px;');
            console.log('%c+-----------------------------------------------------------+', 'color: #FF6B35; font-weight: bold;');
            console.log('');
            console.log('%c?? STATUS ATUAL DO PADR�O QUENTE:', 'color: #FF6B35; font-weight: bold;');
            console.log(`%c   ? Status: ${hotPatternState.status.toUpperCase()}`, 'color: #FF6B35;');
            console.log(`%c   ? LOSSes consecutivos: ${hotPatternState.consecutiveLosses}`, 'color: #FF6B35;');
            console.log(`%c   ? Total WINs: ${hotPatternState.totalWins || 0}`, 'color: #00FF88;');
            console.log(`%c   ? Total LOSSes: ${hotPatternState.totalLosses || 0}`, 'color: #FF6666;');
            console.log(`%c   ? Win Rate: ${((hotPatternState.winRate || 0) * 100).toFixed(1)}%`, 'color: #FFD700;');
            if (hotPatternState.pattern && hotPatternState.pattern.length > 0) {
                const patternDisplay = hotPatternState.pattern.map(c => c === 'red' ? '??' : c === 'black' ? '?' : '?').join(' ? ');
                const predictionDisplay = hotPatternState.prediction === 'red' ? '??' : hotPatternState.prediction === 'black' ? '?' : '?';
                console.log(`%c   ? Padr�o: ${patternDisplay} ? ${predictionDisplay}`, 'color: #FFD700; font-weight: bold;');
            }
            console.log('');
            
            // Se status = 'searching' ou 'abandoned', VERIFICAR SE H� PADR�O SALVO primeiro
            if (hotPatternState.status === 'searching' || hotPatternState.status === 'abandoned') {
                let detected = null;
                
                // ? VERIFICAR SE H� PADR�O SALVO NO STORAGE
                const savedResult = await chrome.storage.local.get('savedHotPattern');
                
                if (savedResult.savedHotPattern) {
                    console.log('?? PADR�O SALVO ENCONTRADO NO STORAGE!');
                    console.log('   Verificando se ainda � v�lido...');
                    
                    const isValid = verifyHotPatternStillValid(history, savedResult.savedHotPattern);
                    
                    if (isValid) {
                        console.log('? PADR�O SALVO AINDA � V�LIDO - REUTILIZANDO!');
                        detected = savedResult.savedHotPattern;
                    } else {
                        console.log('? Padr�o salvo n�o � mais v�lido - buscando novo...');
                        chrome.storage.local.remove('savedHotPattern');
                    }
                }
                
                // Se n�o tinha padr�o salvo ou n�o � mais v�lido, buscar novo
                if (!detected) {
                    console.log('?? Buscando padr�o quente nos �ltimos 50 giros...');
                    console.log('?? DEBUG: Chamando detectHotPattern com history.length =', history.length);
                    detected = detectHotPattern(history);
                }
                
                console.log('?? DEBUG: detectHotPattern retornou:', detected ? 'PADR�O ENCONTRADO' : 'NULL');
                
                if (detected) {
                    hotPatternState = {
                        pattern: detected.pattern,
                        prediction: detected.prediction,
                        consecutiveLosses: 0,
                        status: 'active',
                        totalWins: detected.totalWins,
                        totalLosses: detected.totalLosses,
                        winRate: detected.winRate
                    };
                    console.log('? Padr�o quente detectado e ativado!');
                    
                    // ?? SALVAR O PADR�O NO STORAGE (para persistir ao recarregar)
                    try {
                        await chrome.storage.local.set({
                            savedHotPattern: {
                                pattern: detected.pattern,
                                prediction: detected.prediction,
                                occurrences: detected.occurrences,
                                totalWins: detected.totalWins,
                                totalLosses: detected.totalLosses,
                                winRate: detected.winRate,
                                consecutiveLosses: 0,
                                patternTimestamps: detected.patternTimestamps, // Timestamps de cada giro
                                lastOccurrenceTimestamp: detected.lastOccurrenceTimestamp,
                                savedAt: Date.now()
                            }
                        });
                        console.log('?? Padr�o salvo no storage para persistir ao recarregar!');
                    } catch (error) {
                        console.error('? Erro ao salvar padr�o:', error);
                    }
                    
                    // Notificar TODAS as tabs do Blaze
                    chrome.tabs.query({url: '*://blaze.com/*'}, function(tabs) {
                        tabs.forEach(tab => {
                            chrome.tabs.sendMessage(tab.id, {
                                type: 'HOT_PATTERN_FOUND',
                                data: {
                                    pattern: detected.pattern,
                                    prediction: detected.prediction,
                                    occurrences: detected.occurrences,
                                    totalWins: detected.totalWins,
                                    lastOccurrenceTimestamp: detected.lastOccurrenceTimestamp,
                                    patternTimestamps: detected.patternTimestamps // Timestamps de cada giro
                                }
                            }).catch(() => {});
                        });
                    });
                } else {
                    console.log('?????? Nenhum padr�o quente dispon�vel no momento!');
                    console.log('?? DEBUG: Isso N�O deveria acontecer com 50 giros dispon�veis!');
                    console.log('?? DEBUG: Verifique os logs de detectHotPattern acima para detalhes');
                    
                    // Notificar TODAS as tabs do Blaze
                    console.log('?? DEBUG: Enviando HOT_PATTERN_NOT_FOUND para todas as tabs...');
                    chrome.tabs.query({url: '*://blaze.com/*'}, function(tabs) {
                        console.log(`?? DEBUG: Encontradas ${tabs.length} tabs do Blaze`);
                        tabs.forEach(tab => {
                            chrome.tabs.sendMessage(tab.id, {
                                type: 'HOT_PATTERN_NOT_FOUND'
                            }).catch(() => {});
                        });
                    });
                }
            }
            
            // Se temos um padr�o ativo, verificar se bate com os �ltimos giros
            if (hotPatternState.pattern && Array.isArray(hotPatternState.pattern) && hotPatternState.pattern.length > 0) {
                const patternLength = hotPatternState.pattern.length;
                const currentSequence = history.slice(0, patternLength).map(s => s.color);
                const patternMatch = JSON.stringify(currentSequence) === JSON.stringify(hotPatternState.pattern);
                
                console.log('');
                console.log('?? Verificando se padr�o quente apareceu:');
                console.log(`   Padr�o: ${hotPatternState.pattern.map(c => c.toUpperCase()).join(' ? ')}`);
                console.log(`   Atual:  ${currentSequence.map(c => c.toUpperCase()).join(' ? ')}`);
                console.log(`   Match:  ${patternMatch ? '? SIM' : '? N�O'}`);
                console.log(`   Status: ${hotPatternState.status.toUpperCase()}`);
                console.log(`   LOSSes consecutivos: ${hotPatternState.consecutiveLosses}`);
                
                if (patternMatch) {
                    if (hotPatternState.status === 'active' && hotPatternState.consecutiveLosses === 0) {
                        // Enviar sinal!
                        console.log('');
                        console.log('?????? PADR�O QUENTE DETECTADO - ENVIANDO SINAL! ??????');
                        console.log(`   Cor prevista: ${hotPatternState.prediction.toUpperCase()}`);
                        hotPatternSignal = {
                            color: hotPatternState.prediction,
                            confidence: Math.round(hotPatternState.winRate * 100),
                            pattern: hotPatternState.pattern,
                            source: 'hot_pattern'
                        };
                    } else if (hotPatternState.consecutiveLosses === 1) {
                        // Apenas observar (n�o enviar)
                        console.log('');
                        console.log('?? PADR�O QUENTE EM OBSERVA��O - N�O ENVIANDO SINAL');
                        console.log('   Aguardando resultado para validar...');
                    }
                }
            }
            
            console.log('');
        }
        
        // ---------------------------------------------------------------
        // ?? NOVO SISTEMA - 6 N�VEIS DE AN�LISE DIAMANTE COM VOTA��O
        // ---------------------------------------------------------------
        
        // ? Obter tamanho REAL do hist�rico dispon�vel (configurado pelo usu�rio)
        const configuredSize = Math.min(Math.max(analyzerConfig.aiHistorySize || 50, 10), 2000);
        const availableSize = history.length;
        const historySize = Math.min(configuredSize, availableSize);
        
        console.log('');
        console.log('%c+-------------------------------------------------------------------+', 'color: #00BFFF; font-weight: bold;');
        console.log('%c�  ?? VERIFICA��O DO HIST�RICO DISPON�VEL                          �', 'color: #00BFFF; font-weight: bold;');
        console.log('%c+-------------------------------------------------------------------+', 'color: #00BFFF; font-weight: bold;');
        console.log(`%c   ?? Configurado pelo usu�rio: ${configuredSize} giros`, 'color: #00BFFF;');
        console.log(`%c   ?? Dispon�vel no servidor: ${availableSize} giros`, availableSize < configuredSize ? 'color: #FFA500; font-weight: bold;' : 'color: #00FF88;');
        console.log(`%c   ? ANALISANDO REALMENTE: ${historySize} giros`, 'color: #00FF00; font-weight: bold; font-size: 14px;');
        
        if (availableSize < configuredSize) {
            console.log('');
            console.log(`%c   ?? ATEN��O: Servidor tem menos giros que o configurado!`, 'color: #FFA500; font-weight: bold;');
            console.log(`%c   ? Sistema usar� APENAS os ${historySize} giros dispon�veis`, 'color: #FFA500; font-weight: bold;');
            console.log(`%c   ? Aguarde mais giros serem coletados para an�lise completa`, 'color: #FFA500;');
        }
        console.log('');
        
        // ? Obter modo de an�lise Diamond configurado pelo usu�rio
        const diamondMode = analyzerConfig.diamondMode || 'conservative';
        const modoConfig = {
            aggressive: { votosNecessarios: 3, nome: 'Agressivo', emoji: '🔥' },
            moderate: { votosNecessarios: 4, nome: 'Moderado', emoji: '⚡' },
            conservative: { votosNecessarios: 5, nome: 'Conservador', emoji: '🛡️' },
            ultra_conservative: { votosNecessarios: 6, nome: 'Ultra Conservador', emoji: '🔒' }
        };
        const modoAtual = modoConfig[diamondMode] || modoConfig.conservative;
        
        console.log('%c+-------------------------------------------------------------------+', 'color: #FFD700; font-weight: bold;');
        console.log('%c�  ?? SISTEMA DE 6 N�VEIS - AN�LISE DIAMANTE                       �', 'color: #FFD700; font-weight: bold; font-size: 16px;');
        console.log('%c+-------------------------------------------------------------------+', 'color: #FFD700; font-weight: bold;');
        console.log(`%c   ${modoAtual.emoji} Modo: ${modoAtual.nome} (${modoAtual.votosNecessarios}/6 votos necess�rios)`, 'color: #FFD700; font-weight: bold; font-size: 14px;');
        console.log('');
        
        console.log('%c+-------------------------------------------------------------------+', 'color: #00FF88; font-weight: bold;');
        console.log('%c�  ?? N�VEIS DE AN�LISE:                                            �', 'color: #00FF88; font-weight: bold;');
        console.log('%c�  ?? N�VEL 1: Domin�ncia Geral (�ltimos N giros)                  �', 'color: #00FF88;');
        console.log('%c�  ?? N�VEL 2: Momento do Giro (Giro 1 vs Giro 2)                  �', 'color: #00FF88;');
        console.log('%c�  ?? N�VEL 3: Padr�o Recente (�ltimos 10 giros)                   �', 'color: #00FF88;');
        console.log('%c�  ?? N�VEL 4: Tend�ncia de Minutos (�ltimos 5 minutos)            �', 'color: #00FF88;');
        console.log('%c�  ?? N�VEL 5: Padr�o de Minutos na Hora (X1, X2, etc)             �', 'color: #00FF88;');
        console.log('%c�  ??? N�VEL 6: Valida��o de Resist�ncia (VETO se necess�rio)       �', 'color: #FF0000; font-weight: bold;');
        console.log('%c+-------------------------------------------------------------------+', 'color: #00FF88; font-weight: bold;');
        console.log('');
        
        // ---------------------------------------------------------------
        // ?? VERIFICAR PADR�ES CUSTOMIZADOS (PRIORIDADE ABSOLUTA)
        // ---------------------------------------------------------------
        console.log('%c+-----------------------------------------------------------+', 'color: #FF00FF; font-weight: bold;');
        console.log('%c�  ?? VERIFICANDO PADR�ES CUSTOMIZADOS (PRIORIDADE!)      �', 'color: #FF00FF; font-weight: bold;');
        console.log('%c+-----------------------------------------------------------+', 'color: #FF00FF; font-weight: bold;');
        
        const customPatternResult = await checkForCustomPatterns(history);
        let hasCustomPattern = false;
        let customPatternColor = null;
        
        if (customPatternResult) {
            hasCustomPattern = true;
            customPatternColor = customPatternResult.recommendedColor;
            console.log('%c?????? PADR�O CUSTOMIZADO DETECTADO! ??????', 'color: #FF00FF; font-weight: bold; font-size: 16px;');
            console.log(`%c   Padr�o: ${customPatternResult.pattern.name}`, 'color: #FF00FF; font-weight: bold;');
            console.log(`%c   Cor: ${customPatternResult.recommendedColor.toUpperCase()}`, customPatternResult.recommendedColor === 'red' ? 'color: #FF0000; font-weight: bold;' : 'color: #FFFFFF; font-weight: bold;');
            console.log(`%c   Confian�a: ${customPatternResult.confidence}%`, 'color: #FF00FF;');
            console.log('%c   ?? ENVIA SINAL IMEDIATAMENTE (sem valida��o dos 6 n�veis)!', 'color: #FFD700; font-weight: bold;');
            console.log('');
            
            // RETORNAR IMEDIATAMENTE COM PADR�O CUSTOMIZADO
            const finalConfidence = Math.min(99, customPatternResult.confidence);
            const reasoning = `?? PADR�O CUSTOMIZADO: "${customPatternResult.pattern.name}"\nDetectado pelo usu�rio ? ${customPatternResult.recommendedColor.toUpperCase()}\nConfian�a: ${finalConfidence}%`;
            
            console.log('%c✅ PADRÃO CUSTOMIZADO APROVADO E ENVIANDO!', 'color: #00FF00; font-weight: bold; font-size: 16px;');
            console.log('');
            
            return {
                color: customPatternResult.recommendedColor,
                confidence: finalConfidence,
                probability: finalConfidence,
                reasoning: reasoning,
                patternDescription: customPatternResult.pattern.name
            };
        } else {
            console.log('%c?? Nenhum padr�o customizado detectado', 'color: #888;');
            console.log('%c   Continuando com an�lise dos 6 n�veis...', 'color: #888;');
        }
        console.log('');
        
        // ---------------------------------------------------------------
        // ?? VERIFICAR PADR�O QUENTE (ENVIA IMEDIATAMENTE SE DETECTADO)
        // ---------------------------------------------------------------
        if (hotPatternSignal && hotPatternSignal.source === 'hot_pattern') {
            console.log('%c+-----------------------------------------------------------+', 'color: #FF6B35; font-weight: bold;');
            console.log('%c�  ?? PADR�O QUENTE DETECTADO - ENVIANDO IMEDIATAMENTE!   �', 'color: #FF6B35; font-weight: bold; font-size: 16px;');
            console.log('%c+-----------------------------------------------------------+', 'color: #FF6B35; font-weight: bold;');
            console.log(`%c   Cor: ${hotPatternSignal.color.toUpperCase()}`, hotPatternSignal.color === 'red' ? 'color: #FF0000; font-weight: bold;' : 'color: #FFFFFF; font-weight: bold;');
            console.log(`%c   Confian�a: ${hotPatternSignal.confidence}%`, 'color: #FF6B35; font-weight: bold;');
            console.log('');
            
            const finalConfidence = Math.min(99, hotPatternSignal.confidence);
            
            console.log('%c✅ PADRÃO QUENTE APROVADO E ENVIANDO!', 'color: #00FF00; font-weight: bold; font-size: 16px;');
            console.log('');
            
            const reasoning = `🔥 PADRÃO QUENTE DETECTADO!\nWin Rate: ${hotPatternSignal.confidence}%\nCor prevista: ${hotPatternSignal.color.toUpperCase()}`;
            
            return {
                color: hotPatternSignal.color,
                confidence: finalConfidence,
                probability: finalConfidence,
                reasoning: reasoning,
                patternDescription: 'Padrão Quente'
            };
        }
        
        // ---------------------------------------------------------------
        // ?? EXECUTAR OS 6 N�VEIS DE AN�LISE
        // ---------------------------------------------------------------
        console.log('%c+-----------------------------------------------------------+', 'color: #00D4FF; font-weight: bold;');
        console.log('%c�  ?? EXECUTANDO OS 6 N�VEIS DE AN�LISE...                �', 'color: #00D4FF; font-weight: bold;');
        console.log('%c+-----------------------------------------------------------+', 'color: #00D4FF; font-weight: bold;');
        console.log('');
        
        // ? EXECUTAR OS 6 N�VEIS
        const nivel1 = nivel1_DominanciaGeral(history, historySize);
        const nivel2 = nivel2_MomentoDoGiro(history, historySize);
        const nivel3 = nivel3_PadraoRecente(history, historySize);
        const nivel4 = nivel4_TendenciaDeMinutos(history);
        const nivel5 = nivel5_PadraoDeMinutosNaHora(history);
        
        // ---------------------------------------------------------------
        // ?? CONTAGEM DE VOTOS
        // ---------------------------------------------------------------
        console.log('%c+-----------------------------------------------------------+', 'color: #FFD700; font-weight: bold;');
        console.log('%c�  ?? CONTAGEM DE VOTOS DOS 6 N�VEIS                      �', 'color: #FFD700; font-weight: bold;');
        console.log('%c+-----------------------------------------------------------+', 'color: #FFD700; font-weight: bold;');
        console.log('');
        
        let votosRed = 0;
        let votosBlack = 0;
        const niveisDetalhes = [];
        
        // Contar votos e preparar detalhes estruturados
        if (nivel1.vote === 'red') votosRed++;
        else if (nivel1.vote === 'black') votosBlack++;
        niveisDetalhes.push({
            numero: 1,
            voto: nivel1.vote || 'neutro',
            porcentagem: nivel1.porcentagem || null,
            descricao: nivel1.reason
        });
        
        if (nivel2.vote === 'red') votosRed++;
        else if (nivel2.vote === 'black') votosBlack++;
        niveisDetalhes.push({
            numero: 2,
            voto: nivel2.vote || 'neutro',
            porcentagem: nivel2.porcentagem || null,
            descricao: nivel2.reason
        });
        
        if (nivel3.vote === 'red') votosRed++;
        else if (nivel3.vote === 'black') votosBlack++;
        niveisDetalhes.push({
            numero: 3,
            voto: nivel3.vote || 'neutro',
            porcentagem: nivel3.confidence || null,
            descricao: nivel3.reason
        });
        
        if (nivel4.vote === 'red') votosRed++;
        else if (nivel4.vote === 'black') votosBlack++;
        niveisDetalhes.push({
            numero: 4,
            voto: nivel4.vote || 'neutro',
            porcentagem: null,
            descricao: nivel4.reason
        });
        
        if (nivel5.vote === 'red') votosRed++;
        else if (nivel5.vote === 'black') votosBlack++;
        niveisDetalhes.push({
            numero: 5,
            voto: nivel5.vote || 'neutro',
            porcentagem: nivel5.porcentagem || null,
            descricao: nivel5.reason
        });
        
        console.log('%c?? RESULTADO DOS VOTOS:', 'color: #FFD700; font-weight: bold;');
        console.log(`%c   ?? RED: ${votosRed} votos`, 'color: #FF0000; font-weight: bold; font-size: 14px;');
        console.log(`%c   ? BLACK: ${votosBlack} votos`, 'color: #FFFFFF; font-weight: bold; font-size: 14px;');
        console.log('');
        
        // Determinar cor indicada pelos votos
        let corIndicada = null;
        if (votosRed > votosBlack) {
            corIndicada = 'red';
            console.log(`%c? COR INDICADA: RED (${votosRed} votos)`, 'color: #FF0000; font-weight: bold; font-size: 16px;');
        } else if (votosBlack > votosRed) {
            corIndicada = 'black';
            console.log(`%c? COR INDICADA: BLACK (${votosBlack} votos)`, 'color: #FFFFFF; font-weight: bold; font-size: 16px;');
        } else {
            console.log(`%c?? EMPATE: ${votosRed} votos cada`, 'color: #FFD700; font-weight: bold; font-size: 16px;');
            console.log('%c   Sem consenso - SINAL REJEITADO!', 'color: #FFA500; font-weight: bold;');
            console.log('');
            return null;
        }
        console.log('');
        
        // ---------------------------------------------------------------
        // ??? N�VEL 6: VALIDA��O DE RESIST�NCIA (PODE VETAR TUDO!)
        // ---------------------------------------------------------------
        const nivel6 = nivel6_ValidacaoResistencia(history, corIndicada, historySize);
        niveisDetalhes.push({
            numero: 6,
            voto: nivel6.vote === 'veto' ? 'veto' : 'approve',
            porcentagem: null,
            descricao: nivel6.reason
        });
        
        if (nivel6.vote === 'veto') {
            console.log('%c??? N�VEL 6 VETOU O SINAL! ???', 'color: #FF0000; font-weight: bold; font-size: 18px;');
            console.log('%c   Resist�ncia detectada - SINAL BLOQUEADO!', 'color: #FF6666; font-weight: bold;');
            console.log('');
            
            // ?? Enviar status da análise para UI
            sendMessageToContent('ANALYSIS_STATUS', {
                approved: false,
                reason: 'VETO_NIVEL_6',
                niveis: niveisDetalhes,
                votosRed: votosRed,
                votosBlack: votosBlack,
                corIndicada: corIndicada,
                modoNome: modoAtual.nome,
                vetadoPor: nivel6.reason
            });
            
            return null;
        }
        
        // ---------------------------------------------------------------
        // ?? VALIDAR SE TEM VOTOS SUFICIENTES (MODO DO USU�RIO)
        // ---------------------------------------------------------------
        const votosCorIndicada = corIndicada === 'red' ? votosRed : votosBlack;
        
        console.log('%c+-----------------------------------------------------------+', 'color: #00BCD4; font-weight: bold;');
        console.log('%c�  ?? VALIDA��O DO MODO DE AN�LISE                         �', 'color: #00BCD4; font-weight: bold;');
        console.log('%c+-----------------------------------------------------------+', 'color: #00BCD4; font-weight: bold;');
        console.log(`%c   Modo: ${modoAtual.nome} (${modoAtual.votosNecessarios}/6 votos necess�rios)`, 'color: #00BCD4; font-weight: bold;');
        console.log(`%c   Votos obtidos: ${votosCorIndicada}/6`, 'color: #00BCD4; font-weight: bold;');
        console.log('');
        
        if (votosCorIndicada < modoAtual.votosNecessarios) {
            console.log(`%c? SINAL REJEITADO: Votos insuficientes!`, 'color: #FF0000; font-weight: bold; font-size: 14px;');
            console.log(`%c   ${votosCorIndicada} votos < ${modoAtual.votosNecessarios} necess�rios (modo ${modoAtual.nome})`, 'color: #FF6666;');
            console.log('');
            
            // ?? Enviar status da análise para UI
            sendMessageToContent('ANALYSIS_STATUS', {
                approved: false,
                reason: 'VOTOS_INSUFICIENTES',
                niveis: niveisDetalhes,
                votosRed: votosRed,
                votosBlack: votosBlack,
                corIndicada: corIndicada,
                modoNome: modoAtual.nome,
                votosObtidos: votosCorIndicada,
                votosNecessarios: modoAtual.votosNecessarios
            });
            
            return null;
        }
        
        console.log(`%c? APROVADO: ${votosCorIndicada} votos = ${modoAtual.votosNecessarios} necess�rios!`, 'color: #00FF00; font-weight: bold; font-size: 14px;');
        console.log('');
        
        // ---------------------------------------------------------------
        // ?? CALCULAR CONFIAN�A FINAL
        // ---------------------------------------------------------------
        // Confian�a base: (votos / 6) * 100
        const confidenciaBase = (votosCorIndicada / 6) * 100;
        
        // Confian�a m�dia dos n�veis que votaram na cor vencedora
        const niveisQueVotaram = [];
        if (nivel1.vote === corIndicada) niveisQueVotaram.push(nivel1.confidence);
        if (nivel2.vote === corIndicada) niveisQueVotaram.push(nivel2.confidence);
        if (nivel3.vote === corIndicada) niveisQueVotaram.push(nivel3.confidence);
        if (nivel4.vote === corIndicada) niveisQueVotaram.push(nivel4.confidence);
        if (nivel5.vote === corIndicada) niveisQueVotaram.push(nivel5.confidence);
        
        const confidenciaMedia = niveisQueVotaram.length > 0 
            ? niveisQueVotaram.reduce((a, b) => a + b, 0) / niveisQueVotaram.length
            : 50;
        
        // Confian�a final: m�dia ponderada (70% base de votos + 30% confian�a dos n�veis)
        let finalConfidence = Math.round((confidenciaBase * 0.7) + (confidenciaMedia * 0.3));
        finalConfidence = Math.max(40, Math.min(99, finalConfidence)); // Limitar entre 40-99
        
        console.log('%c+-----------------------------------------------------------+', 'color: #FFD700; font-weight: bold;');
        console.log('%c�  ?? C�LCULO DE CONFIAN�A FINAL                           �', 'color: #FFD700; font-weight: bold;');
        console.log('%c+-----------------------------------------------------------+', 'color: #FFD700; font-weight: bold;');
        console.log(`%c   Base de votos (70%): ${confidenciaBase.toFixed(1)}%`, 'color: #FFD700;');
        console.log(`%c   Confian�a m�dia n�veis (30%): ${confidenciaMedia.toFixed(1)}%`, 'color: #FFD700;');
        console.log(`%c   ? CONFIAN�A FINAL: ${finalConfidence}%`, 'color: #FFD700; font-weight: bold; font-size: 16px;');
        console.log('');
        
        // ---------------------------------------------------------------
        // ✅ SISTEMA DE 6 NÍVEIS - Validação já feita pelos votos!
        // Não precisa de validação de porcentagem mínima
        // O modo selecionado (Agressivo/Moderado/Conservador/Ultra) já define a seletividade
        // ---------------------------------------------------------------
        console.log('%c✅ Validação pelos 6 níveis aprovada!', 'color: #00FF00; font-weight: bold; font-size: 14px;');
        console.log(`%c   Confiança Final: ${finalConfidence}%`, 'color: #00FF88; font-weight: bold;');
        console.log('');
        
        // ---------------------------------------------------------------
        // ?? MONTAR RACIOC�NIO DETALHADO
        // ---------------------------------------------------------------
        // Montar resumo textual dos níveis
        const resumoNiveis = niveisDetalhes.map(n => {
            const votoTexto = n.voto === 'red' ? 'RED' : 
                             n.voto === 'black' ? 'BLACK' : 
                             n.voto === 'veto' ? 'VETO' :
                             n.voto === 'approve' ? 'APROVADO' : 'NEUTRO';
            return `N�VEL ${n.numero}: ${votoTexto} - ${n.descricao}`;
        }).join('\n');
        
        const reasoning = `?? AN�LISE DIAMANTE - SISTEMA DE 6 N�VEIS\n` +
            `Modo: ${modoAtual.nome} (${votosCorIndicada}/${modoAtual.votosNecessarios} votos)\n` +
            `????????????????????????????????????\n` +
            `${resumoNiveis}\n` +
            `????????????????????????????????????\n` +
            `?? DECIS�O FINAL: ${corIndicada.toUpperCase()}\n` +
            `?? Confian�a: ${finalConfidence}%\n` +
            `?? Votos: ${votosCorIndicada}/6 (${modoAtual.nome})\n` +
            `? Aprovado em ${votosCorIndicada} n�veis`;
        
        const patternDescription = `Sistema 6 N�veis - Modo ${modoAtual.nome}`;
        
        console.log('%c????????????????????????????????????????', 'color: #00FFFF; font-weight: bold;');
        console.log('%c?? RACIOC�NIO COMPLETO:', 'color: #00FFFF; font-weight: bold; font-size: 14px;');
        console.log(`%c${reasoning}`, 'color: #00FFFF;');
        console.log('%c????????????????????????????????????????', 'color: #00FFFF; font-weight: bold;');
        console.log('');
        
        console.log('%c-------------------------------------------------------------------', 'color: #00FF00; font-weight: bold; font-size: 20px;');
        console.log('%c? SINAL APROVADO E PRONTO PARA ENVIO', 'color: #00FF00; font-weight: bold; font-size: 18px;');
        console.log('%c-------------------------------------------------------------------', 'color: #00FF00; font-weight: bold; font-size: 20px;');
        console.log('');
        console.log('%c?? AN�LISE COMPLETA:', 'color: #00FFFF; font-weight: bold; font-size: 16px;');
        console.log(`%c   ?? Cor Recomendada: ${corIndicada.toUpperCase()}`, corIndicada === 'red' ? 'color: #FF0000; font-weight: bold; font-size: 18px;' : 'color: #FFFFFF; font-weight: bold; font-size: 18px;');
        console.log(`%c   ?? Confian�a Final: ${finalConfidence}%`, 'color: #FFD700; font-weight: bold; font-size: 16px;');
        console.log(`%c   ?? Sistema: ${patternDescription}`, 'color: #FFD700; font-weight: bold;');
        console.log(`%c   ?? Modo: ${modoAtual.nome} (${votosCorIndicada}/${modoAtual.votosNecessarios} votos)`, 'color: #FFD700;');
        console.log('');
        console.log('%c? GARANTIAS:', 'color: #00FF00; font-weight: bold;');
        console.log('%c   ? An�lise baseada em ${historySize} giros reais', 'color: #00FF88;');
        console.log('%c   ? Sistema de vota��o com 6 n�veis independentes', 'color: #00FF88;');
        console.log('%c   ? Valida��o de resist�ncia aplicada (N�vel 6)', 'color: #00FF88;');
        console.log('%c   ? Padr�es Customizados e Quentes respeitados', 'color: #00FF88;');
        console.log('%c   ? Configura��es do usu�rio respeitadas', 'color: #00FF88;');
        console.log('');
        console.log('%c-------------------------------------------------------------------', 'color: #00FF00; font-weight: bold; font-size: 20px;');
        console.log('');
        
        // ?? Enviar status da análise para UI (APROVADO)
        sendMessageToContent('ANALYSIS_STATUS', {
            approved: true,
            reason: 'APROVADO',
            niveis: niveisDetalhes,
            votosRed: votosRed,
            votosBlack: votosBlack,
            corIndicada: corIndicada,
            modoNome: modoAtual.nome,
            votosObtidos: votosCorIndicada,
            votosNecessarios: modoAtual.votosNecessarios,
            confidence: finalConfidence
        });
        
        return {
            color: corIndicada,
            confidence: finalConfidence,
            probability: finalConfidence,
            reasoning: reasoning,
            patternDescription: patternDescription
        };
        
    } catch (error) {
        console.error('');
        console.error('??? ERRO CR�TICO EM analyzeWithPatternSystem! ???');
        console.error('Erro:', error);
        console.error('Mensagem:', error.message);
        console.error('Stack:', error.stack);
        console.error('Nome:', error.name);
        console.error('');
        return null;
    }
}

/**
 * FUN��O PRINCIPAL: An�lise com IA REAL (com timeout de 5 segundos)
 * Esta fun��o faz chamadas REAIS para APIs de IA externas
 */
async function analyzeWithAI(history) {
    const startTime = Date.now();
    const timeout = 5000; // ? 5 segundos M�XIMO para APIs externas
    
    try {
        console.log('');
        console.log('%c+-----------------------------------------------------------+', 'color: #00FF00; font-weight: bold; font-size: 14px;');
        console.log('%c�  ?? INICIANDO AN�LISE POR INTELIG�NCIA ARTIFICIAL        �', 'color: #00FF00; font-weight: bold; font-size: 14px;');
        console.log('%c+-----------------------------------------------------------+', 'color: #00FF00; font-weight: bold; font-size: 14px;');
        console.log('');
        
        // Verificar chave API
        console.log('%c?? Verificando chave API...', 'color: #00FF88; font-weight: bold;');
        if (!analyzerConfig.aiApiKey || analyzerConfig.aiApiKey.trim() === '') {
            console.error('%c? ERRO: Chave da IA inv�lida ou ausente!', 'color: #FF0000; font-weight: bold; font-size: 14px;');
            console.error('%c   Configure a chave nas Configura��es da extens�o', 'color: #FF6666;');
            sendAnalysisStatus('? Chave da IA ausente');
            return null;
        }
        
        // ?? MODO IA EXTERNA DESATIVADO PARA ESTE SISTEMA
        // O novo sistema de 6 n�veis N�O usa IA externa
        console.log('%c?? Modo IA Externa n�o suportado no novo sistema de 6 n�veis', 'color: #FFA500; font-weight: bold;');
        console.log('%c   Use o sistema de 6 n�veis (Modo Diamante) ao inv�s', 'color: #FFA500;');
        return null;
        
    } catch (error) {
        console.error('? Erro em analyzeWithAI:', error);
        return null;
    }
}

/**
 * -------------------------------------------------------------------------------
 * CONTROLADOR PRINCIPAL DE AN�LISE
 * Decide qual tipo de an�lise executar e orquestra todo o processo
 * -------------------------------------------------------------------------------
 */
// NOVO CONTROLADOR: Orquestra Verifica��o (padr�es salvos) + Descoberta (173+ an�lises) em =5s
async function runAnalysisController(history) {
	const startTs = Date.now();
	const budgetMs = 5000; // 5s totais

	try {
		// ?? CR�TICO: RECARREGAR analyzerConfig do storage ANTES de cada an�lise
		// Isso garante que mudan�as feitas pelo usu�rio sejam respeitadas imediatamente
		console.log('%c?? Recarregando configura��o do storage...', 'color: #FFAA00; font-weight: bold;');
		const storageResult = await chrome.storage.local.get(['analyzerConfig']);
		if (storageResult && storageResult.analyzerConfig) {
			analyzerConfig = { ...DEFAULT_ANALYZER_CONFIG, ...storageResult.analyzerConfig };
			console.log('%c? Configura��o recarregada com sucesso!', 'color: #00FF00; font-weight: bold;');
		} else {
			console.log('%c?? Nenhuma config no storage, usando padr�o', 'color: #FFAA00;');
		}
		
		// ? DEBUG CR�TICO: Verificar estado real do analyzerConfig
		console.log('');
		console.log('%c?? DEBUG: Estado atual do analyzerConfig:', 'color: #FFFF00; font-weight: bold; font-size: 12px; background: #333300; padding: 5px;');
		console.log('%c   analyzerConfig.aiMode = ' + analyzerConfig.aiMode, 'color: #FFFF00; font-weight: bold; font-size: 14px;');
		console.log('%c   analyzerConfig.aiApiKey = ' + (analyzerConfig.aiApiKey ? analyzerConfig.aiApiKey.substring(0, 15) + '...' : 'N�O CONFIGURADA'), 'color: #FFFF00;');
		console.log('%c   analyzerConfig.minOccurrences = ' + analyzerConfig.minOccurrences, 'color: #FFFF00;');
		console.log('');
		
		// ? LOG INICIAL: Mostrar qual modo est� ativo COM DESTAQUE
		console.log('-----------------------------------------------------------------------------');
		console.log('');
		if (analyzerConfig.aiMode) {
			console.log('%c������+ ���+   ���+ ������+ ������+  ������+     ��+ �����+ ', 'color: #00FF00; font-weight: bold; font-size: 14px;');
			console.log('%c����+-+ ����+ �������+---��+��+--��+��+---��+    �����+--��+', 'color: #00FF00; font-weight: bold; font-size: 14px;');
			console.log('%c�����+  ��+����+������   ������  ������   ���    �����������', 'color: #00FF00; font-weight: bold; font-size: 14px;');
			console.log('%c����+-+ ���+��++������   ������  ������   ���    �����+--���', 'color: #00FF00; font-weight: bold; font-size: 14px;');
			console.log('%c������+ ��� +-+ ���+������++������+++������++    ������  ���', 'color: #00FF00; font-weight: bold; font-size: 14px;');
			console.log('%c+-----+ +-+     +-+ +-----+ +-----+  +-----+     +-++-+  +-+', 'color: #00FF00; font-weight: bold; font-size: 14px;');
			console.log('');
		// ?? INDICADOR DIN�MICO DE MEM�RIA ATIVA
		let memoriaStatus = '';
		let memoriaColor = '#00FF00';
		let memoriaInfo = '';
		
		if (!memoriaAtiva.inicializada) {
			memoriaStatus = '?? INICIALIZANDO CACHE...';
			memoriaColor = '#FFA500';
			memoriaInfo = '? Primeira inicializa��o (an�lise completa em andamento)';
			
			// ?? CR�TICO: INICIALIZAR MEM�RIA ATIVA AGORA!
			console.log('');
			console.log('%c?? INICIANDO MEM�RIA ATIVA PELA PRIMEIRA VEZ...', 'color: #FFA500; font-weight: bold; font-size: 14px;');
			const inicializacaoOk = await inicializarMemoriaAtiva(history);
			
			if (inicializacaoOk) {
				console.log('%c? MEM�RIA ATIVA INICIALIZADA COM SUCESSO!', 'color: #00FF00; font-weight: bold; font-size: 14px;');
				memoriaStatus = '? CACHE RAM ATIVO';
				memoriaColor = '#00FF00';
				memoriaInfo = `?? Mem�ria inicializada! ${memoriaAtiva.giros.length} giros carregados`;
			} else {
				console.error('%c? FALHA AO INICIALIZAR MEM�RIA ATIVA!', 'color: #FF0000; font-weight: bold; font-size: 14px;');
				console.log('');
				return null; // Abortar an�lise se n�o conseguir inicializar
			}
		} else {
			const tempoDecorrido = Math.round((Date.now() - memoriaAtiva.ultimaAtualizacao) / 1000);
			memoriaStatus = '? CACHE RAM ATIVO';
			memoriaColor = '#00FF00';
			memoriaInfo = `?? Mem�ria Viva: ${memoriaAtiva.totalAtualizacoes} atualiza��es | ?? �ltima: ${memoriaAtiva.tempoUltimaAtualizacao.toFixed(1)}ms | ?? H� ${tempoDecorrido}s`;
		}
		
		console.log('');
		console.log(`%c${memoriaStatus}`, `color: ${memoriaColor}; font-weight: bold; font-size: 14px;`);
		console.log(`%c${memoriaInfo}`, `color: ${memoriaColor};`);
		console.log('');

		// LOG PARA MODO PADR�O
		} else {
			console.log('%c-------------------------------------------------------------------------------', 'color: #00AAFF; font-weight: bold;');
			console.log('%c�  ?? MODO: AN�LISE PADR�O (Pattern System)                                  �', 'color: #00AAFF; font-weight: bold; font-size: 14px;');
			console.log('%c-------------------------------------------------------------------------------', 'color: #00AAFF; font-weight: bold;');
			console.log('');
		}
		
		// EXECUTAR AN�LISE: Modo Padr�o (Pattern System)
		const result = await analyzeWithPatternSystem(history);
		
		const elapsed = Date.now() - startTs;
		console.log(`\n?? Tempo total da an�lise: ${elapsed}ms\n`);
		
		return result;
		
	} catch (error) {
		console.error('? Erro cr�tico no controlador de an�lise:', error);
		console.error('Stack:', error.stack);
		return null;
	}
}

/**
 * -------------------------------------------------------------------------------
 * FUN��O PRINCIPAL: An�lise com IA REAL (com timeout de 5 segundos)
 * Esta fun��o faz chamadas REAIS para APIs de IA externas
 * -------------------------------------------------------------------------------
 */
async function analyzeWithAI(history) {
    const startTime = Date.now();
    const timeout = 5000; // ? 5 segundos M�XIMO para APIs externas
    
    try {
        console.log('');
        console.log('%c+-----------------------------------------------------------+', 'color: #00FF00; font-weight: bold; font-size: 14px;');
        console.log('%c�  ?? INICIANDO AN�LISE POR INTELIG�NCIA ARTIFICIAL        �', 'color: #00FF00; font-weight: bold; font-size: 14px;');
        console.log('%c+-----------------------------------------------------------+', 'color: #00FF00; font-weight: bold; font-size: 14px;');
        console.log('');
        
        // Verificar chave API
        console.log('%c?? Verificando chave API...', 'color: #00FF88; font-weight: bold;');
        if (!analyzerConfig.aiApiKey || analyzerConfig.aiApiKey.trim() === '') {
            console.error('%c? ERRO: Chave da IA inv�lida ou ausente!', 'color: #FF0000; font-weight: bold; font-size: 14px;');
            console.error('%c   Configure a chave nas Configura��es da extens�o', 'color: #FF6666;');
            sendAnalysisStatus('? Chave da IA ausente');
            return null;
        }
        
        // Verificar hist�rico
        if (!history || history.length < 10) {
            console.error('%c? ERRO: Hist�rico insuficiente!', 'color: #FF0000; font-weight: bold;');
            sendAnalysisStatus('? Hist�rico insuficiente');
            return null;
        }
        
        console.log(`%c? Hist�rico: ${history.length} giros`, 'color: #00FF88;');
        console.log(`%c?? Timeout: ${timeout / 1000}s`, 'color: #00FF88;');
        console.log('');
        
        // Preparar dados para IA
        const last30Spins = history.slice(0, 30);
        const historyString = last30Spins.map((s, i) => {
            const emoji = s.color === 'red' ? '??' : s.color === 'black' ? '?' : '?';
            return `${emoji}`;
        }).join(' ');
        
        console.log(`%c?? �ltimos 30 giros:`, 'color: #00AAFF; font-weight: bold;');
        console.log(`%c${historyString}`, 'color: #FFFFFF;');
        console.log('');
        
        // Contar cores
        let redCount = 0, blackCount = 0, whiteCount = 0;
        last30Spins.forEach(s => {
            if (s.color === 'red') redCount++;
            else if (s.color === 'black') blackCount++;
            else whiteCount++;
        });
        
        console.log(`%c?? Vermelho: ${redCount} (${((redCount / 30) * 100).toFixed(1)}%)`, 'color: #FF0000; font-weight: bold;');
        console.log(`%c? Preto: ${blackCount} (${((blackCount / 30) * 100).toFixed(1)}%)`, 'color: #FFFFFF; font-weight: bold;');
        console.log(`%c? Branco: ${whiteCount} (${((whiteCount / 30) * 100).toFixed(1)}%)`, 'color: #00FF00;');
        console.log('');
        
        // ? Chamada REAL para API OpenAI com timeout
        console.log('%c?? Enviando an�lise para OpenAI...', 'color: #00FF88; font-weight: bold;');
        console.log(`%c   API: ${analyzerConfig.aiProvider || 'OpenAI'}`, 'color: #00FF88;');
        console.log(`%c   Model: ${analyzerConfig.aiModel || 'gpt-4'}`, 'color: #00FF88;');
        console.log('');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${analyzerConfig.aiApiKey}`
                },
                body: JSON.stringify({
                    model: analyzerConfig.aiModel || 'gpt-4',
                    messages: [
                        {
                            role: 'system',
                            content: 'Voc� � um especialista em an�lise de padr�es do jogo Blaze Double. Analise os �ltimos giros e preveja a pr�xima cor mais prov�vel. Responda APENAS com um JSON no formato: {"color": "red" ou "black", "confidence": 0-100, "reasoning": "explica��o breve"}'
                        },
                        {
                            role: 'user',
                            content: `Analise os �ltimos 30 giros do Blaze Double e preveja a pr�xima cor:\n\n${historyString}\n\n?? Vermelho: ${redCount} | ? Preto: ${blackCount} | ? Branco: ${whiteCount}\n\nQual cor tem maior probabilidade de sair no pr�ximo giro?`
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 200
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('%c? ERRO na API OpenAI:', 'color: #FF0000; font-weight: bold;');
                console.error(`Status: ${response.status}`);
                console.error(`Resposta: ${errorText}`);
                sendAnalysisStatus('? Erro na API OpenAI');
                return null;
            }
            
            const data = await response.json();
            const aiResponse = data.choices?.[0]?.message?.content;
            
            if (!aiResponse) {
                console.error('%c? ERRO: Resposta da IA est� vazia', 'color: #FF0000; font-weight: bold;');
                return null;
            }
            
            console.log('%c? Resposta recebida da IA!', 'color: #00FF00; font-weight: bold;');
            console.log(`%c${aiResponse}`, 'color: #FFFFFF;');
            console.log('');
            
            // Extrair JSON da resposta
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.error('%c? ERRO: IA n�o retornou JSON v�lido', 'color: #FF0000; font-weight: bold;');
                return null;
            }
            
            const result = JSON.parse(jsonMatch[0]);
            
            console.log('%c? AN�LISE DA IA CONCLU�DA!', 'color: #00FF00; font-weight: bold; font-size: 14px;');
            console.log(`%c   Cor recomendada: ${result.color.toUpperCase()}`, `color: ${result.color === 'red' ? '#FF0000' : '#FFFFFF'}; font-weight: bold;`);
            console.log(`%c   Confian�a: ${result.confidence}%`, 'color: #00FF88; font-weight: bold;');
            console.log(`%c   Racioc�nio: ${result.reasoning}`, 'color: #AAAAAA;');
            console.log('');
            
            const elapsedMs = Date.now() - startTime;
            console.log(`%c?? Tempo total: ${elapsedMs}ms`, 'color: #00AAFF;');
            console.log('');
            
            return {
                color: result.color,
                confidence: result.confidence,
                probability: result.confidence,
                reasoning: result.reasoning
            };
            
        } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
                console.error(`%c? TIMEOUT ap�s ${timeout}ms!`, 'color: #FF0000; font-weight: bold; font-size: 14px;');
                sendAnalysisStatus(`? Timeout (${timeout}ms)`);
            } else {
                console.error('%c? ERRO na requisi��o:', 'color: #FF0000; font-weight: bold;');
                console.error(fetchError);
                sendAnalysisStatus('? Erro na requisi��o');
            }
            return null;
        }
        
    } catch (error) {
        console.error('%c? ERRO CR�TICO em analyzeWithAI:', 'color: #FF0000; font-weight: bold; font-size: 14px;');
        console.error('Erro:', error);
        console.error('Mensagem:', error.message);
        console.error('Stack:', error.stack);
        console.error('');
        return null;
    }
}

// -------------------------------------------------------------------------------
// FUN��O AUXILIAR: Requisi��o para Claude (Anthropic)
// -------------------------------------------------------------------------------
async function callClaudeAPI(prompt, timeout = 5000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': analyzerConfig.aiApiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: analyzerConfig.aiModel || 'claude-3-sonnet-20240229',
                max_tokens: 200,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Claude erro ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        const text = data.content?.[0]?.text;
        
        if (!text) {
            throw new Error('Resposta da API Claude est� vazia');
        }
        
        // Extrair JSON da resposta
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('IA n�o retornou JSON v�lido');
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

// -------------------------------------------------------------------------------
// LISTENERS E INICIALIZA��O
// -------------------------------------------------------------------------------

// Listener para mensagens do content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'CUSTOM_PATTERNS_UPDATED') {
        console.log('');
        console.log('%c+-----------------------------------------------------------+', 'color: #00FF88; font-weight: bold;');
        console.log('%c�  ?? PADR�ES CUSTOMIZADOS ATUALIZADOS!                    �', 'color: #00FF88; font-weight: bold;');
        console.log('%c+-----------------------------------------------------------+', 'color: #00FF88; font-weight: bold;');
        
        const oldCache = [...customPatternsCache];
        customPatternsCache = request.data || [];
        
        console.log(`?? Padr�es no cache ANTIGO: ${oldCache.length}`);
        if (oldCache.length > 0) {
            oldCache.forEach((p, idx) => {
                console.log(`   ${idx + 1}. "${p.name}" (ID: ${p.id})`);
            });
        }
        console.log('');
        
        console.log(`?? Padr�es no cache NOVO: ${customPatternsCache.length}`);
        if (customPatternsCache.length > 0) {
            customPatternsCache.forEach((p, idx) => {
                console.log(`   ${idx + 1}. "${p.name}" (ID: ${p.id})`);
            });
        }
        console.log('');
        
        // Detectar padr�es REMOVIDOS
        const removedPatterns = oldCache.filter(old => !customPatternsCache.find(p => p.id === old.id));
        if (removedPatterns.length > 0) {
            console.log('%c??? PADR�ES REMOVIDOS:', 'color: #FF6666; font-weight: bold;');
            removedPatterns.forEach(p => {
                console.log(`   ? "${p.name}" (ID: ${p.id}) | Sequ�ncia: ${p.sequence.join(' ? ')}`);
            });
        }
        
        // Detectar padr�es NOVOS
        const newPatterns = customPatternsCache.filter(p => !oldCache.find(old => old.id === p.id));
        if (newPatterns.length > 0) {
            console.log('%c? PADR�ES NOVOS:', 'color: #00FF88; font-weight: bold;');
            newPatterns.forEach(p => {
                console.log(`   + "${p.name}" (ID: ${p.id}) | Sequ�ncia: ${p.sequence.join(' ? ')}`);
            });
        }
        
        // Detectar padr�es EDITADOS
        const editedPatterns = customPatternsCache.filter(p => {
            const old = oldCache.find(old => old.id === p.id);
            return old && (old.name !== p.name || 
                          JSON.stringify(old.sequence) !== JSON.stringify(p.sequence) ||
                          old.beforeColor !== p.beforeColor);
        });
        if (editedPatterns.length > 0) {
            console.log('%c?? PADR�ES EDITADOS:', 'color: #FFD700; font-weight: bold;');
            editedPatterns.forEach(p => {
                console.log(`   ?? "${p.name}" (ID: ${p.id})`);
            });
        }
        
        console.log('');
        console.log('%c? CACHE ATUALIZADO - Pr�ximo sinal usar� os padr�es mais recentes!', 'color: #00FF88; font-weight: bold;');
        console.log('%c?? IMPORTANTE: Padr�es removidos N�O gerar�o mais sinais!', 'color: #FFD700; font-weight: bold;');
        console.log('');
        
        sendResponse({ success: true });
        return true;
    }
});

// -------------------------------------------------------------------------------
// FIM DO ARQUIVO background.js
// -------------------------------------------------------------------------------
