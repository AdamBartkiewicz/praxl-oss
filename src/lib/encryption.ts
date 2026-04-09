import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY = process.env.ENCRYPTION_KEY || "";

function getKey(): Buffer {
  if (!KEY) throw new Error("ENCRYPTION_KEY not configured");
  // Derive 32-byte key from env var (may be any length)
  return crypto.createHash("sha256").update(KEY).digest();
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  // Format: iv:tag:ciphertext
  return `${iv.toString("hex")}:${tag}:${encrypted}`;
}

export function decrypt(encryptedStr: string): string {
  const key = getKey();
  const [ivHex, tagHex, ciphertext] = encryptedStr.split(":");
  if (!ivHex || !tagHex || !ciphertext) {
    // Not encrypted (legacy plaintext value) - return as-is
    return encryptedStr;
  }
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function isEncrypted(value: string): boolean {
  // Encrypted values have format: 24hex:32hex:hex
  return /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/.test(value);
}
