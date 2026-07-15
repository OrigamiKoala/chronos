// Google Apps Script Webhook — Retry proxy for Cloudflare Worker
// Receives homework/exam payloads from the worker and re-invokes the worker,
// giving it a fresh 50-subrequest budget per invocation.
// Deploy this script as a Web App in Google Apps Script.

const WORKER_URL = 'https://chronos-worker.jiayou-carl-liu.workers.dev/';

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    console.log(`Forwarding action "${action}" to worker`);

    const response = UrlFetchApp.fetch(WORKER_URL, {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      timeout: 300000
    });

    const status = response.getResponseCode();
    const body = response.getContentText();
    console.log(`Worker responded with status ${status}: ${body.substring(0, 200)}`);

    return ContentService.createTextOutput(JSON.stringify({ success: true, workerStatus: status }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    console.error('Proxy error:', err);
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON)
      .setStatusCode(500);
  }
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}
