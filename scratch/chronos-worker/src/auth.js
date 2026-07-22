/**
 * GCP Service Account → OAuth2 access token
 * Caches the token module-level (Workers reuse isolates within a region).
 */

let cachedToken = null;
let tokenExpiry = 0;

function base64url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlUint8(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && tokenExpiry - now > 60) return cachedToken;

  if (!env || !env.GCP_SA_KEY) {
    throw new Error('GCP_SA_KEY environment variable is missing');
  }

  const sa = typeof env.GCP_SA_KEY === 'string' ? JSON.parse(env.GCP_SA_KEY) : env.GCP_SA_KEY;

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const iat = now;
  const exp = now + 3600;
  const claimsObj = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/bigquery',
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp,
  };
  const payload = base64url(JSON.stringify(claimsObj));
  const signingInput = `${header}.${payload}`;

  // Strip PEM headers and decode the private key
  const pemContents = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const keyBytes = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const encoder = new TextEncoder();
  const sigBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signingInput)
  );

  const jwt = `${signingInput}.${base64urlUint8(new Uint8Array(sigBytes))}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`GCP token exchange failed ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  cachedToken = data.access_token;
  tokenExpiry = now + (data.expires_in || 3600);
  return cachedToken;
}
