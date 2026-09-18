// Reroutes relative /api/* fetch() calls through Code.gs (google.script.run -> UrlFetchApp)
// only when executing inside Google Apps Script. In standard browser/Vercel environments,
// native window.fetch is preserved unchanged.

export function runGoogleScript(fn, ...args) {
  return new Promise((resolve, reject) => {
    const gScript = (typeof window !== 'undefined' && window.google?.script?.run)
      ? window.google.script.run
      : (typeof window !== 'undefined' && window.parent?.google?.script?.run)
        ? window.parent.google.script.run
        : null;

    if (!gScript) {
      reject(new Error('google.script.run is unavailable (not running inside Apps Script)'));
      return;
    }
    gScript
      .withSuccessHandler(resolve)
      .withFailureHandler((err) => reject(new Error(err && err.message ? err.message : String(err))))[fn](...args);
  });
}

if (typeof window !== 'undefined' && window.google?.script?.run) {
  const realFetch = window.fetch.bind(window);

  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input && input.url;

    if (typeof url !== 'string' || !url.startsWith('/api/')) {
      return realFetch(input, init);
    }

    const method = (init.method || 'GET').toUpperCase();
    const body = typeof init.body === 'string' ? init.body : null;

    return runGoogleScript('apiProxy', url, method, body).then((result) => {
      return new Response(result.body, {
        status: result.status,
        headers: { 'Content-Type': result.contentType || 'application/json' },
      });
    });
  };
}
