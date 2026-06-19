// Helper to sign JWT using Cloudflare's built-in Web Crypto API (For BigQuery OAuth)
async function GoogleAuthToken(serviceAccount) {
  const jwtHeader = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=+$/, '');
  const now = Math.floor(Date.now() / 1000);
  const jwtClaim = btoa(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/bigquery',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  })).replace(/=+$/, '');

  const message = `${jwtHeader}.${jwtClaim}`;
  const enc = new TextEncoder();
  
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = serviceAccount.private_key
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\s+/g, "");
  
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, enc.encode(message));
  const jwtSign = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${message}.${jwtSign}`;
}

function base64UrlToArrayBuffer(base64Url) {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) { base64 += '='; }
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

async function verifyTeacherJwt(authHeader, secretString) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.split(' ')[1];
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [header, payload, signature] = parts;
  const encoder = new TextEncoder();
  const data = encoder.encode(`${header}.${payload}`);

  try {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secretString),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureBinary = base64UrlToArrayBuffer(signature);
    const isValid = await crypto.subtle.verify("HMAC", cryptoKey, signatureBinary, data);
    if (!isValid) return false;

    let payloadBase64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    while (payloadBase64.length % 4) { payloadBase64 += '='; }
    const decodedPayload = JSON.parse(atob(payloadBase64));

    if (decodedPayload.exp && Math.floor(Date.now() / 1000) > decodedPayload.exp) return false;

    return decodedPayload;
  } catch (err) {
    return false;
  }
}

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://chronos-bot.vercel.app',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    try {
      // 1. Token Check
      const authHeader = request.headers.get('Authorization');
      const tokenClaims = await verifyTeacherJwt(authHeader, env.JWT_SECRET);
      
      if (!tokenClaims) {
        return new Response(JSON.stringify({ error: 'Unauthorized token.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 2. Parse payload stream
      const { message, teacherId, studentId, sessionId } = await request.json();
      if (!message || !teacherId || !sessionId) {
        return new Response('Missing parameters', { status: 400, headers: corsHeaders });
      }

      if (tokenClaims.teacherId !== teacherId) {
        return new Response(JSON.stringify({ error: `Forbidden authorization payload mismatch.` }), { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // 4. Fetch Credentials
      const serviceAccount = await env.CHAT_KV.get('GCP_SERVICE_ACCOUNT', { type: 'json' });
      if (!serviceAccount) {
        return new Response('Missing GCP Credentials in KV', { status: 500, headers: corsHeaders });
      }

      // 5. OAuth Token Generation
      const assertionJwt = await GoogleAuthToken(serviceAccount);
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertionJwt}`
      });
      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      if (!accessToken) {
        return new Response(JSON.stringify({ 
          error: 'OAuth token generation failed',
          debug: { tokenError: tokenData.error, tokenDesc: tokenData.error_description }
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 6. Build SQL Statement Context (Using exact schema matching)
      let studentFilterClause = '';
      if (studentId) {
        const targetIds = Array.isArray(studentId) ? studentId : [studentId];
        if (targetIds.length > 0) {
          const idList = targetIds.map(id => `'${id}'`).join(',');
          studentFilterClause = `AND v.student_id IN (${idList})`;
        }
      }

      const bqQuery = `
        SELECT TO_JSON_STRING(STRUCT(
          v.student_id as user_id,
          
          (SELECT ARRAY_AGG(STRUCT(h.exam_id, h.subject, h.accuracy, h.avg_time, h.rating_change, h.new_rating, h.created_at)) 
           FROM \`${serviceAccount.project_id}.chronos_users.user_exam_history\` h
           WHERE h.user_id = v.student_id) as exams,
           
          (SELECT ARRAY_AGG(STRUCT(m.exam_id, m.subject, m.mistake_patterns)) 
           FROM \`${serviceAccount.project_id}.chronos_users.user_mistake_analysis\` m
           WHERE m.user_id = v.student_id) as mistakes,
           
          (SELECT ARRAY_AGG(STRUCT(t.subject, t.topic, t.good_at, t.not_good_at)) 
           FROM \`${serviceAccount.project_id}.chronos_users.user_topic_breakdown\` t
           WHERE t.user_id = v.student_id) as topics,
           
          (SELECT ARRAY_AGG(STRUCT(w.subject, w.detailed_analysis)) 
           FROM \`${serviceAccount.project_id}.chronos_users.user_weakness_analysis\` w
           WHERE w.user_id = v.student_id) as weaknesses,
           
          (SELECT ARRAY_AGG(STRUCT(i.lesson_id, i.summary, i.suggestions, i.progress_status)) 
           FROM \`${serviceAccount.project_id}.chronos_users.student_insights\` i
           WHERE i.student_id = v.student_id) as insights
        )) as json_row
        FROM \`${serviceAccount.project_id}.chronos_users.teacher_students\` v
        WHERE v.teacher_id = '${teacherId}' ${studentFilterClause}
      `;

      // 7. Request Execution
      const bqResponse = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${serviceAccount.project_id}/queries`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: bqQuery, useLegacySql: false })
      });
      const bqData = await bqResponse.json();

      // Surface BQ errors directly instead of burying them in LLM context
      if (bqData.error) {
        return new Response(JSON.stringify({ 
          error: 'BigQuery query failed',
          debug: { 
            bqError: bqData.error.message,
            bqStatus: bqData.error.status,
            teacherId,
            studentId,
            studentFilterClause,
            projectId: serviceAccount.project_id
          }
        }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      let contextData = '';
      if (bqData.rows && bqData.rows.length > 0) {
        const rawJsonArray = bqData.rows.map(row => JSON.parse(row.f[0].v));
        contextData = JSON.stringify(rawJsonArray);
      } else {
        contextData = "[]";
      }

      // 8. Inference Engine
      const kvKey = `chat:${teacherId}:${sessionId}`;
      let history = await env.CHAT_KV.get(kvKey, { type: 'json' }) || [];
      
      const hasData = contextData && contextData !== "[]" && contextData !== "[{}]";

      const systemPrompt = `You are a diagnostic assistant for the stress-sandbox app.
Contextual Performance Dataset: ${contextData}

ANTI-HALLUCINATION PROTOCOL:
- ${hasData ? 
    "Synthesize observations strictly from metrics populated in the JSON payload above. Do not invent missing data blocks." : 
    "CRITICAL: The context string contains no valid database entries. Explicitly notify the user that no active table records were found for this selection in BigQuery."
  }
Keep answers clear, highly metric-accurate, and under 3 sentences.`;

      if (message.toLowerCase().includes('audit') || message.toLowerCase().includes('last exam')) {
        history = [];
      }

      const messages = [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: message }];
      const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast', { 
        messages, 
        max_tokens: 256 
      });

      // 9. Synchronize Dialog Logs
      history.push({ role: 'user', content: message });
      history.push({ role: 'assistant', content: aiResponse.response });
      if (history.length > 8) history = history.slice(-8);
      await env.CHAT_KV.put(kvKey, JSON.stringify(history), { expirationTtl: 86400 });

      return new Response(JSON.stringify({ 
        response: aiResponse.response,
        _debug: { rowCount: bqData.rows?.length || 0, studentIdReceived: studentId, teacherId }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (err) {
      return new Response(JSON.stringify({ 
        error: "Worker Exception", 
        details: err.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
