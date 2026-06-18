/**
 * Cloudflare Worker Template with Cryptographic JWT Verification (Web Crypto API)
 * Place this inside your Cloudflare Worker script.
 */

export default {
  async fetch(request, env) {
    // 1. Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // 2. Validate Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing or invalid token format' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const token = authHeader.substring(7); // Extract "Bearer <token>"
    const secret = env.JWT_SECRET; // Bound environment variable in wrangler/dashboard

    if (!secret) {
      return new Response(JSON.stringify({ error: 'Internal Server Error: JWT_SECRET binding is missing' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Cryptographic signature check
    const jwtPayload = await verifyJWT(token, secret);
    if (!jwtPayload) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Cryptographic verification failed' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // 3. Process Request
    try {
      const body = await request.json();

      // Extra security: ensure the body teacherId matches the verified JWT teacherId
      if (body.teacherId !== jwtPayload.teacherId) {
        return new Response(JSON.stringify({ error: 'Forbidden: teacherId mismatch' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      // --- YOUR EXISTING WORKER OR BIGQUERY LOGIC HERE ---
      // E.g., Call Gemini or query BigQuery using verified payload.teacherId
      
      const dummyResponse = {
        response: `Hello teacher "${jwtPayload.teacherId}", I successfully verified your cryptographically signed token! Here is your student analysis.`
      };

      return new Response(JSON.stringify(dummyResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: 'Bad Request: ' + err.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  }
};

/**
 * Verifies HS256 JWT using Web Crypto API.
 * Returns decoded payload if valid, false otherwise.
 */
async function verifyJWT(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const [headerB64, payloadB64, signatureB64] = parts;

    // 1. Parse header and check alg
    const headerStr = atob(headerB64.replace(/-/g, '+').replace(/_/g, '/'));
    const header = JSON.parse(headerStr);
    if (header.alg !== 'HS256') return false;

    // 2. Parse payload and check exp
    const payloadStr = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadStr);
    if (payload.exp && (Date.now() / 1000) > payload.exp) {
      return false; // Token expired
    }

    // 3. Crypto subtle HMAC signature verification
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(`${headerB64}.${payloadB64}`);
    const secretBytes = encoder.encode(secret);

    // Import secret raw bytes
    const key = await crypto.subtle.importKey(
      'raw',
      secretBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Convert signature from Base64Url to Uint8Array buffer
    const sigBytes = base64UrlToArrayBuffer(signatureB64);

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      dataBytes
    );

    return isValid ? payload : false;
  } catch (err) {
    console.error('verifyJWT error:', err);
    return false;
  }
}

/**
 * Decodes Base64URL to Uint8Array buffer.
 */
function base64UrlToArrayBuffer(base64Url) {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
