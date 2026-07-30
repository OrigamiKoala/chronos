var VERCEL_BASE = 'https://chronos-bot.vercel.app';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Chronos Bot')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Called from the client via google.script.run (see src/apiShim.js).
// Forwards to the Vercel deployment server-to-server, so the student's
// browser never has to reach chronos-bot.vercel.app directly.
function apiProxy(path, method, body) {
  var options = {
    method: (method || 'GET').toLowerCase(),
    contentType: 'application/json',
    muteHttpExceptions: true,
  };
  if (body) {
    options.payload = body;
  }

  var response = UrlFetchApp.fetch(VERCEL_BASE + path, options);

  return {
    status: response.getResponseCode(),
    body: response.getContentText(),
    contentType: 'application/json',
  };
}
