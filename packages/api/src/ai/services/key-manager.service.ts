import { randomBytes } from 'crypto';

import { ed25519 } from '@noble/curves/ed25519';

/**
 * Singleton service for managing persistent Ed25519 key pairs
 * Ensures consistent signing and verification across service instances
 */
export class KeyManagerService {
  private static instance: KeyManagerService;
  private privateKey: Uint8Array;
  private publicKey: Uint8Array;

  private constructor() {
    this.privateKey = this.loadOrGeneratePrivateKey();
    this.publicKey = ed25519.getPublicKey(this.privateKey);
  }

  /**
   * Get the singleton instance of KeyManagerService
   */
  static getInstance(): KeyManagerService {
    if (!KeyManagerService.instance) {
      KeyManagerService.instance = new KeyManagerService();
    }
    return KeyManagerService.instance;
  }

  /**
   * Load private key from environment or generate a persistent one
   * In production, this should be loaded from secure storage (e.g., AWS KMS, HashiCorp Vault)
   */
  private loadOrGeneratePrivateKey(): Uint8Array {
    // Try to load from environment variable
    const envKey = process.env.SCRIPT_SIGNING_KEY;
    if (envKey) {
      try {
        const keyBuffer = Buffer.from(envKey, 'base64');
        if (keyBuffer.length === 32) {
          return new Uint8Array(keyBuffer);
        }
      } catch (error) {
        console.error(
          'Invalid SCRIPT_SIGNING_KEY format, generating new key:',
          error
        );
      }
    }

    // Generate a deterministic key based on a stable seed for development
    // This ensures consistency across service restarts in development
    if (
      process.env.NODE_ENV === 'development' ||
      process.env.NODE_ENV === 'test'
    ) {
      // Use a fixed seed for development/test environments
      // This is NOT secure and should NEVER be used in production
      const seed = Buffer.from('dev-seed-do-not-use-in-production!!').subarray(
        0,
        32
      );
      console.warn('Using development key seed - NOT FOR PRODUCTION USE');
      return new Uint8Array(seed);
    }

    // In production, if no key is provided, generate one and log it
    // This should be stored securely and reused
    const newKey = randomBytes(32);
    const base64Key = Buffer.from(newKey).toString('base64');
    console.error(
      'CRITICAL: No signing key found. Generated new key (store this securely):\n' +
        `SCRIPT_SIGNING_KEY="${base64Key}"\n` +
        'Add this to your environment variables to persist signing capabilities'
    );
    return new Uint8Array(newKey);
  }

  /**
   * Get the private key for signing
   */
  getPrivateKey(): Uint8Array {
    return this.privateKey;
  }

  /**
   * Get the public key for verification
   */
  getPublicKey(): Uint8Array {
    return this.publicKey;
  }

  /**
   * Get base64-encoded public key
   */
  getPublicKeyBase64(): string {
    return Buffer.from(this.publicKey).toString('base64');
  }

  /**
   * Sign a message with the private key
   */
  sign(message: Buffer | Uint8Array): Uint8Array {
    return ed25519.sign(message, this.privateKey);
  }

  /**
   * Verify a signature with the public key
   */
  verify(signature: Uint8Array, message: Buffer | Uint8Array): boolean {
    return ed25519.verify(signature, message, this.publicKey);
  }
}
