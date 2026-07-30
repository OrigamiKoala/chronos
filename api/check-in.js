const SCRIPT_URL = 'https://script.google.com/a/macros/iusd.org/s/AKfycbwvP1A_NnGe2NT-XhLrMO-6VDYbGcIhytNigzMQRnZEV4Sb0Hmm06-A25XWasFYylTR8w/exec';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const queryParams = new URLSearchParams(req.query).toString();
      const targetUrl = queryParams ? `${SCRIPT_URL}?${queryParams}` : SCRIPT_URL;

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        redirect: 'follow'
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = { information: '', raw: text };
      }
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const payload = req.body || {};
      const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
          'Accept': 'application/json'
        },
        body: typeof payload === 'string' ? payload : JSON.stringify(payload),
        redirect: 'follow'
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        // Fallback if GET is required or string response returned
        const queryParams = new URLSearchParams({
          action: 'query',
          id: payload.id || '',
          yap: payload.yap || '',
          leavingText: payload.leavingText || ''
        }).toString();
        const getFallbackRes = await fetch(`${SCRIPT_URL}?${queryParams}`, { redirect: 'follow' });
        const fallbackText = await getFallbackRes.text();
        data = JSON.parse(fallbackText);
      }
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Error in /api/check-in proxy:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
