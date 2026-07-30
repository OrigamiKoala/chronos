// Reroutes relative /api/* fetch() calls through Code.gs (google.script.run -> UrlFetchApp)
// so the browser never talks to chronos-bot.vercel.app directly. Every existing
// fetch('/api/...') call site is left untouched; only window.fetch itself is patched.

export function runGoogleScript(fn, ...args) {
  return new Promise((resolve, reject) => {
    if (typeof google === 'undefined' || !google.script || !google.script.run) {
      reject(new Error('google.script.run is unavailable (not running inside Apps Script)'));
      return;
    }
    google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler((err) => reject(new Error(err && err.message ? err.message : String(err))))
      [fn](...args);
  });
}

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
