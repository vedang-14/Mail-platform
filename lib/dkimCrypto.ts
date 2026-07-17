import crypto from "crypto";

/**
 * DKIM key encryption — frontend copy.
 *
 * MUST stay identical to smtp-server/src/crypto/dkimCrypto.ts. The frontend
 * ENCRYPTS (when a domain is added and its keypair is generated); the worker
 * DECRYPTS (when signing outbound mail). Both use the same DKIM_ENCRYPTION_KEY.
 *
 * If these two files ever diverge, the worker won't be able to decrypt keys the
 * frontend wrote — mail would silently go out unsigned.
 *
 * SERVER-ONLY. Never import this into a client component: it reads a secret.
 */

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
    const raw = process.env.DKIM_ENCRYPTION_KEY;
    if (!raw) {
        throw new Error("DKIM_ENCRYPTION_KEY is not set");
    }
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) {
        throw new Error(
            `DKIM_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length})`
        );
    }
    return key;
}

export function encryptPrivateKey(pem: string): string {
    const key = getKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, key, iv);

    const ciphertext = Buffer.concat([
        cipher.update(pem, "utf8"),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
        "v1",
        iv.toString("base64"),
        authTag.toString("base64"),
        ciphertext.toString("base64"),
    ].join(":");
}

export function decryptPrivateKey(blob: string): string {
    const key = getKey();
    const parts = blob.split(":");
    if (parts.length !== 4 || parts[0] !== "v1") {
        throw new Error("Malformed encrypted DKIM key");
    }
    const iv = Buffer.from(parts[1], "base64");
    const authTag = Buffer.from(parts[2], "base64");
    const ciphertext = Buffer.from(parts[3], "base64");

    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
    ]).toString("utf8");
}

/**
 * Generate a DKIM keypair.
 * Returns the private key as PEM (to be encrypted) and the public key as the
 * bare base64 body that goes in the DNS TXT record (headers/newlines stripped).
 */
export function generateDkimKeypair(): {
    privateKeyPem: string;
    publicKeyForDns: string;
} {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    // DNS wants just the base64 body — no PEM header/footer, no line breaks.
    const publicKeyForDns = publicKey
        .replace(/-----BEGIN PUBLIC KEY-----/, "")
        .replace(/-----END PUBLIC KEY-----/, "")
        .replace(/\s+/g, "");

    return { privateKeyPem: privateKey, publicKeyForDns };
}