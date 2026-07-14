/**
 * Pure-JS MD5 — replaces Utilities.computeDigest(DigestAlgorithm.MD5, ...)
 * Keeps question IDs backward-compatible with existing BigQuery data.
 * Source: https://github.com/pvorb/node-md5 (public domain)
 */

function safeAdd(x, y) {
  const lsw = (x & 0xffff) + (y & 0xffff);
  const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xffff);
}
function bitRotateLeft(num, cnt) {
  return (num << cnt) | (num >>> (32 - cnt));
}
function md5cmn(q, a, b, x, s, t) {
  return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
}
function md5ff(a, b, c, d, x, s, t) { return md5cmn((b & c) | (~b & d), a, b, x, s, t); }
function md5gg(a, b, c, d, x, s, t) { return md5cmn((b & d) | (c & ~d), a, b, x, s, t); }
function md5hh(a, b, c, d, x, s, t) { return md5cmn(b ^ c ^ d, a, b, x, s, t); }
function md5ii(a, b, c, d, x, s, t) { return md5cmn(c ^ (b | ~d), a, b, x, s, t); }

function md5cycle(x, k) {
  let [a, b, c, d] = x;
  a = md5ff(a, b, c, d, k[0], 7, -680876936);   b = md5ff(d, a, b, c, k[1], 12, -389564586);
  c = md5ff(c, d, a, b, k[2], 17, 606105819);    d = md5ff(b, c, d, a, k[3], 22, -1044525330);
  a = md5ff(a, b, c, d, k[4], 7, -176418897);    b = md5ff(d, a, b, c, k[5], 12, 1200080426);
  c = md5ff(c, d, a, b, k[6], 17, -1473231341);  d = md5ff(b, c, d, a, k[7], 22, -45705983);
  a = md5ff(a, b, c, d, k[8], 7, 1770035416);    b = md5ff(d, a, b, c, k[9], 12, -1958414417);
  c = md5ff(c, d, a, b, k[10], 17, -42063);       d = md5ff(b, c, d, a, k[11], 22, -1990404162);
  a = md5ff(a, b, c, d, k[12], 7, 1804603682);   b = md5ff(d, a, b, c, k[13], 12, -40341101);
  c = md5ff(c, d, a, b, k[14], 17, -1502002290); d = md5ff(b, c, d, a, k[15], 22, 1236535329);
  a = md5gg(a, b, c, d, k[1], 5, -165796510);    b = md5gg(d, a, b, c, k[6], 9, -1069501632);
  c = md5gg(c, d, a, b, k[11], 14, 643717713);   d = md5gg(b, c, d, a, k[0], 20, -373897302);
  a = md5gg(a, b, c, d, k[5], 5, -701558691);    b = md5gg(d, a, b, c, k[10], 9, 38016083);
  c = md5gg(c, d, a, b, k[15], 14, -660478335);  d = md5gg(b, c, d, a, k[4], 20, -405537848);
  a = md5gg(a, b, c, d, k[9], 5, 568446438);     b = md5gg(d, a, b, c, k[14], 9, -1019803690);
  c = md5gg(c, d, a, b, k[3], 14, -187363961);   d = md5gg(b, c, d, a, k[8], 20, 1163531501);
  a = md5gg(a, b, c, d, k[13], 5, -1444681467);  b = md5gg(d, a, b, c, k[2], 9, -51403784);
  c = md5gg(c, d, a, b, k[7], 14, 1735328473);   d = md5gg(b, c, d, a, k[12], 20, -1926607734);
  a = md5hh(a, b, c, d, k[5], 4, -378558);       b = md5hh(d, a, b, c, k[8], 11, -2022574463);
  c = md5hh(c, d, a, b, k[11], 16, 1839030562);  d = md5hh(b, c, d, a, k[14], 23, -35309556);
  a = md5hh(a, b, c, d, k[1], 4, -1530992060);   b = md5hh(d, a, b, c, k[4], 11, 1272893353);
  c = md5hh(c, d, a, b, k[7], 16, -155497632);   d = md5hh(b, c, d, a, k[10], 23, -1094730640);
  a = md5hh(a, b, c, d, k[13], 4, 681279174);    b = md5hh(d, a, b, c, k[0], 11, -358537222);
  c = md5hh(c, d, a, b, k[3], 16, -722521979);   d = md5hh(b, c, d, a, k[6], 23, 76029189);
  a = md5hh(a, b, c, d, k[9], 4, -640364487);    b = md5hh(d, a, b, c, k[12], 11, -421815835);
  c = md5hh(c, d, a, b, k[15], 16, 530742520);   d = md5hh(b, c, d, a, k[2], 23, -995338651);
  a = md5ii(a, b, c, d, k[0], 6, -198630844);    b = md5ii(d, a, b, c, k[7], 10, 1126891415);
  c = md5ii(c, d, a, b, k[14], 15, -1416354905); d = md5ii(b, c, d, a, k[5], 21, -57434055);
  a = md5ii(a, b, c, d, k[12], 6, 1700485571);   b = md5ii(d, a, b, c, k[3], 10, -1894986606);
  c = md5ii(c, d, a, b, k[10], 15, -1051523);    d = md5ii(b, c, d, a, k[1], 21, -2054922799);
  a = md5ii(a, b, c, d, k[8], 6, 1873313359);    b = md5ii(d, a, b, c, k[15], 10, -30611744);
  c = md5ii(c, d, a, b, k[6], 15, -1560198380);  d = md5ii(b, c, d, a, k[13], 21, 1309151649);
  a = md5ii(a, b, c, d, k[4], 6, -145523070);    b = md5ii(d, a, b, c, k[11], 10, -1120210379);
  c = md5ii(c, d, a, b, k[2], 15, 718787259);    d = md5ii(b, c, d, a, k[9], 21, -343485551);
  x[0] = safeAdd(a, x[0]); x[1] = safeAdd(b, x[1]);
  x[2] = safeAdd(c, x[2]); x[3] = safeAdd(d, x[3]);
  return x;
}

function md5blks(str) {
  const nblk = ((str.length + 8) >> 6) + 1;
  const blks = new Array(nblk * 16).fill(0);
  let i;
  for (i = 0; i < str.length; i++) blks[i >> 2] |= str.charCodeAt(i) << ((i % 4) * 8);
  blks[i >> 2] |= 0x80 << ((i % 4) * 8);
  blks[nblk * 16 - 2] = str.length * 8;
  return blks;
}

function rhex(n) {
  let s = '';
  for (let j = 0; j < 4; j++) s += ('0' + ((n >> (j * 8 + 4)) & 0x0f).toString(16)).slice(-1)
    + ('0' + ((n >> (j * 8)) & 0x0f).toString(16)).slice(-1);
  return s;
}

export function md5(str) {
  // Encode to UTF-8 bytes first (matching Apps Script UTF-8 digest behavior)
  const utf8 = unescape(encodeURIComponent(str));
  const blks = md5blks(utf8);
  let state = [1732584193, -271733879, -1732584194, 271733878];
  for (let i = 0; i < blks.length; i += 16) {
    state = md5cycle(state, blks.slice(i, i + 16));
  }
  return state.map(rhex).join('');
}
