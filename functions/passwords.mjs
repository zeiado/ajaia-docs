// PBKDF2-HMAC-SHA256 password verification via WebCrypto.
// Only salt/derived hash/iterations are stored; plaintext is never persisted or logged.

export const PBKDF2_ITERATIONS = 600000;
const KEY_BITS = 256;
const encoder = new TextEncoder();

const DUMMY_SALT = new Uint8Array(16);
const DUMMY_EXPECTED = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

function toBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derive(password, salt, iterations) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, material, KEY_BITS);
  return new Uint8Array(bits);
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password, record) {
  const iterations = Number.isSafeInteger(record?.iterations) ? record.iterations : PBKDF2_ITERATIONS;
  if (typeof record?.salt !== 'string' || typeof record?.hash !== 'string') return false;
  let salt;
  try { salt = fromBase64(record.salt); } catch { return false; }
  const derived = await derive(password, salt, iterations);
  return timingSafeEqual(toBase64(derived), record.hash);
}

// Equal-cost path for unknown usernames so response time does not reveal account existence.
export async function verifyPasswordAgainstDummy(password) {
  const derived = await derive(password, DUMMY_SALT, PBKDF2_ITERATIONS);
  return timingSafeEqual(toBase64(derived), DUMMY_EXPECTED);
}