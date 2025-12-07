# Blaze Double Analyzer (Atualizado p/ servidor BR 45.231.133.221:3000)

Extensão de navegador para análise de padrões e sugestões de apostas no jogo Double da Blaze.

## Funcionalidades

- 🎯 **Análise em Tempo Real**: Monitora as rodadas do Double automaticamente
- 📊 **Algoritmo Inteligente**: Identifica padrões com alta precisão (>60% de confiabilidade)
- 💾 **Cache Local**: Armazena as últimas 224 rodadas (2 horas de dados)
- 🎨 **Interface Moderna**: Sidebar integrada com design limpo e responsivo
- ⚡ **Atualização Automática**: Dados atualizados a cada 2 segundos

## Instalação

1. Baixe todos os arquivos da extensão
2. Abra o Chrome/Edge e vá para `chrome://extensions/` ou `edge://extensions/`
3. Ative o "Modo do desenvolvedor"
4. Clique em "Carregar sem compactação" e selecione a pasta da extensão
5. Acesse o painel web hospedado (endereço atual do projeto)
6. A sidebar aparecerá automaticamente no lado esquerdo

## Como Usar

### Interface da Sidebar

- **Status**: Mostra o estado atual da análise
- **Último Giro**: Exibe o número e cor da última rodada
- **Análise Atual**: 
  - Barra de confiança (0-100%)
  - Sugestão de aposta
  - Cor recomendada
- **Padrão Identificado**: Descrição do padrão detectado
- **Estatísticas**: Total de giros e última atualização

### Botões do Popup

- **🔄 Último Giro**: Mostra detalhes da última rodada
- **📊 Análise Atual**: Exibe análise completa com confiança

## Algoritmos de Análise

A extensão utiliza múltiplos algoritmos para identificar padrões:

1. **Análise de Sequências**: Detecta sequências de cores consecutivas
2. **Distribuição de Números**: Identifica números que não apareceram recentemente
3. **Padrões Alternados**: Reconhece padrões de alternância de cores
4. **Números Quentes/Frios**: Analisa frequência de aparição dos números

## Configurações

- **Coleta de Dados**: Automática a cada 2 segundos
- **Histórico**: Mantém últimas 224 rodadas
- **Confiança Mínima**: Sugestões apenas com >60% de confiabilidade
- **Atualização**: Interface atualizada a cada 5 segundos

## Compatibilidade

- ✅ Google Chrome (Manifest V3)
- ✅ Microsoft Edge (Manifest V3)
- ✅ Sites: (endereço atual do projeto)

## Estrutura dos Arquivos

```
blaze-double-analyzer/
├── manifest.json          # Configuração da extensão
├── popup.html             # Interface do popup
├── popup.js               # Lógica do popup
├── background.js          # Service worker (coleta de dados)
├── content.js             # Script de conteúdo (sidebar)
├── styles.css             # Estilos da sidebar
└── icons/                 # Ícones da extensão
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## API Utilizada

A extensão utiliza a API oficial da Blaze:
- **Endpoint**: `https://blaze.com/api/games/double`
- **Frequência**: A cada 2 segundos
- **Dados**: Número, cor e timestamp de cada rodada

## Aviso Legal

Esta extensão é apenas para fins educacionais e de análise. O jogo Double é baseado em sorte e não há garantia de lucros. Use com responsabilidade e dentro dos seus limites financeiros.

## Suporte

Para problemas ou sugestões, verifique:
1. Se está no site correto da Blaze
2. Se a extensão está ativa
3. Se há conexão com a internet
4. Console do navegador para erros

---

**Desenvolvido com ❤️ para análise inteligente do Double da Blaze**

<!-- Versão atualizada do backup -->