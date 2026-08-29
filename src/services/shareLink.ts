/**
 * Cloudflare Worker Zero-Knowledge Share & Pairing Link Generator
 * Default Endpoint: https://trans.themitta.com
 */

const WORKER_HOST = 'https://trans.themitta.com';

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Generate a Zero-Knowledge Secret URL (burned after reading or expiring)
 * AES-256-GCM encrypted in browser/client, key appended to URL Hash (#k=...)
 */
export async function createZeroKnowledgeShareLink(
  plaintext: string,
  burnAfterReading = true,
  ttlSeconds = 3600
): Promise<{ shareUrl: string; id: string; expiresAt: number }> {
  // 1. Generate 256-bit AES key locally
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  // 2. Encrypt locally
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  const rawKey = await crypto.subtle.exportKey('raw', key);
  const ciphertextB64 = bytesToBase64(combined);
  const keyB64 = bytesToBase64(new Uint8Array(rawKey));

  // 3. Post ONLY the ciphertext to Cloudflare Worker KV
  const response = await fetch(`${WORKER_HOST}/api/secret`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ciphertext: ciphertextB64,
      burnAfterReading,
      ttlSeconds,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Network error' }));
    throw new Error(err.error || 'Failed to upload encrypted payload to Cloudflare');
  }

  const data = (await response.json()) as { id: string; expiresAt: number };
  const shareUrl = `${WORKER_HOST}/s/${data.id}#k=${keyB64}`;

  return {
    shareUrl,
    id: data.id,
    expiresAt: data.expiresAt,
  };
}

/**
 * Generate an instant Contact Pairing Link without manual copy-paste
 * https://trans.themitta.com/pair#name=Alice&pub=PUBKEY::...
 */
export function createPairingLink(name: string, publicKey: string): string {
  const cleanKey = publicKey.startsWith('PUBKEY::') ? publicKey : `PUBKEY::${publicKey}`;
  return `${WORKER_HOST}/pair#name=${encodeURIComponent(name)}&pub=${encodeURIComponent(cleanKey)}`;
}
