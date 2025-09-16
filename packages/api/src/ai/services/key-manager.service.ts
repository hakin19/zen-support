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
        if (process.env.NODE_ENV === 'production') {
          throw new Error(
            'Invalid SCRIPT_SIGNING_KEY format. Expected base64-encoded 32-byte key.'
          );
        } else {
          console.warn(
            'Invalid SCRIPT_SIGNING_KEY format. Falling back to development seed (NOT FOR PRODUCTION).'
          );
        }
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

    // In production, fail fast if no key is provided
    // NEVER log private keys to console or logs
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CRITICAL: No SCRIPT_SIGNING_KEY environment variable found. ' +
          'Production requires a pre-configured signing key. ' +
          'Generate a key securely offline and store it in your secrets manager:\n' +
          '  openssl rand -base64 32\n' +
          'Then set SCRIPT_SIGNING_KEY environment variable with the value.'
      );
    }

    // Only for local development if somehow neither test nor development env is set
    const newKey = randomBytes(32);
    console.warn(
      'WARNING: Generated ephemeral signing key for non-production use. ' +
        'Set SCRIPT_SIGNING_KEY environment variable to persist signing capabilities.'
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
