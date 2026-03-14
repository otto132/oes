import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey(version: number = 1): Buffer {
  const envKey = version === 1
    ? process.env.TOKEN_ENCRYPTION_KEY
    : process.env[`TOKEN_ENCRYPTION_KEY_V${version}`];
  if (!envKey) {
    throw new Error(`TOKEN_ENCRYPTION_KEY${version > 1 ? `_V${version}` : ''} not set`);
  }
  return Buffer.from(envKey, 'base64');
}

export function encrypt(plaintext: string, version: number = 1): string {
  const key = getKey(version);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v${version}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decrypt(encrypted: string): string {
  if (!encrypted.match(/^v\d+:/)) {
    return encrypted;
  }

  const [versionStr, ivB64, authTagB64, ciphertextB64] = encrypted.split(':');
  const version = parseInt(versionStr.slice(1), 10);

  const key = getKey(version);
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
