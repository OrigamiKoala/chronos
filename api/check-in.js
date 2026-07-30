const PUBLIC_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwvP1A_NnGe2NT-XhLrMO-6VDYbGcIhytNigzMQRnZEV4Sb0Hmm06-A25XWasFYylTR8w/exec';
const DOMAIN_SCRIPT_URL = 'https://script.google.com/a/macros/iusd.org/s/AKfycbwvP1A_NnGe2NT-XhLrMO-6VDYbGcIhytNigzMQRnZEV4Sb0Hmm06-A25XWasFYylTR8w/exec';

function parseJsonResponse(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (trimmed.startsWith('<') || trimmed.startsWith('<!DOCTYPE')) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    return null;
  }
}

async function fetchFromScript(url, options) {
  try {
    const res = await fetch(url, { ...options, redirect: 'follow' });
    const text = await res.text();
    const parsed = parseJsonResponse(text);
    return { ok: !!parsed, data: parsed, raw: text };
  } catch (err) {
    return { ok: false, data: null, raw: String(err) };
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const queryParams = new URLSearchParams(req.query).toString();
      const urlsToTry = [
        queryParams ? `${PUBLIC_SCRIPT_URL}?${queryParams}` : PUBLIC_SCRIPT_URL,
        queryParams ? `${DOMAIN_SCRIPT_URL}?${queryParams}` : DOMAIN_SCRIPT_URL
      ];

      for (const targetUrl of urlsToTry) {
        const result = await fetchFromScript(targetUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });

        if (result.ok && result.data) {
          return res.status(200).json(result.data);
        }
      }

      return res.status(200).json({
        information: '',
        error: 'Google Apps Script endpoint returned an HTML authorization page instead of JSON. Please verify deployment access settings.'
      });
    }

    if (req.method === 'POST') {
      const payload = req.body || {};
      const queryParams = new URLSearchParams({
        action: 'query',
        id: payload.id || '',
        yap: payload.yap || '',
        leavingText: payload.leavingText || ''
      }).toString();

      // Attempt 1: GET query on public URL
      let result = await fetchFromScript(`${PUBLIC_SCRIPT_URL}?${queryParams}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      // Attempt 2: GET query on domain URL
      if (!result.ok) {
        result = await fetchFromScript(`${DOMAIN_SCRIPT_URL}?${queryParams}`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
      }

      // Attempt 3: POST on public URL
      if (!result.ok) {
        result = await fetchFromScript(PUBLIC_SCRIPT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
            'Accept': 'application/json'
          },
          body: typeof payload === 'string' ? payload : JSON.stringify(payload)
        });
      }

      // Attempt 4: POST on domain URL
      if (!result.ok) {
        result = await fetchFromScript(DOMAIN_SCRIPT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
            'Accept': 'application/json'
          },
          body: typeof payload === 'string' ? payload : JSON.stringify(payload)
        });
      }

      if (result.ok && result.data) {
        return res.status(200).json(result.data);
      }

      return res.status(200).json({
        yes: false,
        name: '',
        message: 'Google Apps Script endpoint returned an HTML page. Please ensure the Web App is deployed with "Who has access: Anyone".'
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Error in /api/check-in proxy:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
