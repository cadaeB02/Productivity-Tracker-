// Client-side encryption utilities for the Passwords vault
// Uses AES-GCM with a key derived from the user's vault password via PBKDF2
// The server NEVER sees the plaintext — only ciphertext is stored in Supabase

const SALT = 'holdco-os-vault-v1'; // Static salt is fine here since each user has their own password
const ITERATIONS = 100000;
const KEY_LENGTH = 256;

// Derive an AES key from a password
async function deriveKey(password) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: enc.encode(SALT),
            iterations: ITERATIONS,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: KEY_LENGTH },
        false,
        ['encrypt', 'decrypt']
    );
}

// Encrypt plaintext → returns base64 string (iv:ciphertext)
export async function encryptContent(plaintext, password) {
    const key = await deriveKey(password);
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        enc.encode(plaintext)
    );

    // Combine IV + ciphertext into a single base64 string
    const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return btoa(String.fromCharCode(...combined));
}

// Decrypt base64 string → returns plaintext
export async function decryptContent(encrypted, password) {
    try {
        const key = await deriveKey(password);
        const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));

        const iv = combined.slice(0, 12);
        const ciphertext = combined.slice(12);

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            ciphertext
        );

        return new TextDecoder().decode(decrypted);
    } catch {
        return null; // Wrong password or corrupted data
    }
}

// Quick check if a vault password is set (stored hash in localStorage)
export function hasVaultPassword() {
    return !!localStorage.getItem('holdco-vault-hash');
}

// Store a hash of the vault password for verification (NOT the password itself)
export async function setVaultPasswordHash(password) {
    const enc = new TextEncoder();
    const hash = await crypto.subtle.digest('SHA-256', enc.encode(SALT + password));
    const hashStr = btoa(String.fromCharCode(...new Uint8Array(hash)));
    localStorage.setItem('holdco-vault-hash', hashStr);
}

// Verify a vault password against stored hash
export async function verifyVaultPassword(password) {
    const stored = localStorage.getItem('holdco-vault-hash');
    if (!stored) return true; // No password set yet, first time

    const enc = new TextEncoder();
    const hash = await crypto.subtle.digest('SHA-256', enc.encode(SALT + password));
    const hashStr = btoa(String.fromCharCode(...new Uint8Array(hash)));
    return hashStr === stored;
}
