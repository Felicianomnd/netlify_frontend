// popup.js
const statusEl = document.getElementById('status');
const tokenEl = document.getElementById('token');
const cookiesEl = document.getElementById('cookies');

function formatTokenDisplay(token) {
  if (!token || token === '(token não encontrado)') return 'Não obtido';
  return 'Obtido ✓';
}

function formatCookiesDisplay(cookies) {
  if (!cookies || cookies === '(sem cookies)') return 'Não extraídos';
  return 'Extraídos ✓';
}

chrome.storage.local.get(['status', 'token', 'cookies'], (data) => {
  const status = data.status || 'Aguardando Login...';
  statusEl.textContent = status;
  statusEl.className = 'item-value ' + (status === 'Conectado' ? '' : 'pending');
  
  tokenEl.textContent = formatTokenDisplay(data.token);
  tokenEl.className = 'item-value ' + (data.token && data.token !== '(token não encontrado)' ? '' : 'pending');
  
  cookiesEl.textContent = formatCookiesDisplay(data.cookies);
  cookiesEl.className = 'item-value ' + (data.cookies && data.cookies !== '(sem cookies)' ? '' : 'pending');
});

