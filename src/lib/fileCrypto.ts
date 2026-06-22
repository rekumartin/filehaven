/**
 * Client-side file encryption / decryption using the browser's built-in
 * Web Crypto API. No external libraries are imported or needed.
 *
 * Algorithm: AES-256-GCM
 * Key derivation: PBKDF2 (SHA-256, 600 000 iterations, 16-byte random salt)
 * IV: 12-byte random per encryption
 *
 * Encrypted file format:
 *   [8 bytes  magic  "PFTENC1\0" — format identifier + version]
 *   [16 bytes salt   — random, unique per file]
 *   [12 bytes IV     — random, unique per file]
 *   [N bytes  ciphertext — AES-GCM output (plaintext + 16-byte auth tag)]
 *
 * Plaintext layout (inside the ciphertext above):
 *   [4 bytes  name length  — uint32 big-endian]
 *   [M bytes  original filename  — UTF-8]
 *   [rest     original file bytes]
 *
 * The filename is encrypted along with the file, so the encrypted blob
 * reveals nothing about the original content or filename.
 */

const MAGIC = 'PFTENC1\0'; // 8 bytes
const MAGIC_U8 = new TextEncoder().encode(MAGIC);
const SALT_LEN = 16;
const IV_LEN = 12;
const HEADER_LEN = MAGIC_U8.length + SALT_LEN + IV_LEN; // 36

const PBKDF2_ITERATIONS = 600_000;

// ── Key derivation ────────────────────────────────────────────────────────────

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface EncryptResult {
  blob: Blob;
  /** Suggested output filename: "<originalName>.enc" */
  filename: string;
}

export interface DecryptResult {
  blob: Blob;
  /** Original filename, recovered from inside the encrypted payload */
  filename: string;
}

/**
 * Encrypt any file with AES-256-GCM. The original filename is embedded
 * in the encrypted payload so it can be recovered on decryption.
 */
export async function encryptFile(file: File, password: string): Promise<EncryptResult> {
  if (!password) throw new Error('A password is required.');

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveKey(password, salt);

  // Build plaintext: [4B name-len][name UTF-8][file bytes]
  const nameBytes = new TextEncoder().encode(file.name);
  const nameLenBuf = new ArrayBuffer(4);
  new DataView(nameLenBuf).setUint32(0, nameBytes.length, false /* big-endian */);

  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const plaintext = new Uint8Array(4 + nameBytes.length + fileBytes.length);
  plaintext.set(new Uint8Array(nameLenBuf), 0);
  plaintext.set(nameBytes, 4);
  plaintext.set(fileBytes, 4 + nameBytes.length);

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext),
  );

  // Assemble output: [magic][salt][iv][ciphertext]
  const output = new Uint8Array(HEADER_LEN + ciphertext.length);
  output.set(MAGIC_U8, 0);
  output.set(salt, 8);
  output.set(iv, 8 + SALT_LEN);
  output.set(ciphertext, HEADER_LEN);

  return {
    blob: new Blob([output], { type: 'application/octet-stream' }),
    filename: `${file.name}.enc`,
  };
}

/**
 * Decrypt a file previously encrypted with encryptFile().
 * Throws with a user-friendly message if the password is wrong or the file
 * is not a valid .enc file.
 */
export async function decryptFile(encFile: File, password: string): Promise<DecryptResult> {
  if (!password) throw new Error('A password is required.');

  const data = new Uint8Array(await encFile.arrayBuffer());

  // Validate magic bytes
  if (data.length < HEADER_LEN + 4 + 16) {
    throw new Error('This file is too small to be a valid encrypted file.');
  }
  const magic = new TextDecoder().decode(data.slice(0, 8));
  if (magic !== MAGIC) {
    throw new Error(
      'This does not look like a FileHaven encrypted file.' +
        'Make sure you selected a .enc file created by this tool.',
    );
  }

  const salt = data.slice(8, 8 + SALT_LEN);
  const iv = data.slice(8 + SALT_LEN, HEADER_LEN);
  const ciphertext = data.slice(HEADER_LEN);

  const key = await deriveKey(password, salt);

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  } catch {
    // AES-GCM authentication tag mismatch → wrong password or corrupt file
    throw new Error(
      'Decryption failed — the password is incorrect or the file has been corrupted. ' +
        'If you lose the password there is no way to recover the file.',
    );
  }

  // Parse plaintext: [4B name-len][name bytes][file bytes]
  if (plaintext.byteLength < 4) {
    throw new Error('Decrypted data is invalid — file may be corrupted.');
  }
  const nameLen = new DataView(plaintext).getUint32(0, false);
  if (nameLen > plaintext.byteLength - 4) {
    throw new Error('Decrypted data is invalid — file may be corrupted.');
  }

  const filename = new TextDecoder().decode(new Uint8Array(plaintext, 4, nameLen));
  const fileBytes = new Uint8Array(plaintext, 4 + nameLen);

  return { blob: new Blob([fileBytes]), filename };
}
