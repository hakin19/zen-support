import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KeyManagerService } from './key-manager.service';

describe('KeyManagerService', () => {
  beforeEach(() => {
    // Reset singleton instance for clean test environment
    // @ts-expect-error - accessing private static member for testing
    KeyManagerService.instance = undefined;
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance across multiple calls', () => {
      const instance1 = KeyManagerService.getInstance();
      const instance2 = KeyManagerService.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(KeyManagerService);
    });

    it('should maintain the same keys across getInstance calls', () => {
      const instance1 = KeyManagerService.getInstance();
      const publicKey1 = instance1.getPublicKeyBase64();

      const instance2 = KeyManagerService.getInstance();
      const publicKey2 = instance2.getPublicKeyBase64();

      expect(publicKey1).toBe(publicKey2);
    });
  });

  describe('Key Generation', () => {
    it('should generate consistent keys in test environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      const instance1 = KeyManagerService.getInstance();
      const publicKey1 = instance1.getPublicKeyBase64();

      // Reset and create new instance
      // @ts-expect-error - accessing private static member for testing
      KeyManagerService.instance = undefined;

      const instance2 = KeyManagerService.getInstance();
      const publicKey2 = instance2.getPublicKeyBase64();

      // Should be same because of deterministic seed in test mode
      expect(publicKey1).toBe(publicKey2);

      process.env.NODE_ENV = originalEnv;
    });

    it('should load key from environment variable when provided', () => {
      const originalEnv = process.env.SCRIPT_SIGNING_KEY;
      // Valid 32-byte key in base64
      const testKey = Buffer.from(new Uint8Array(32).fill(42)).toString(
        'base64'
      );
      process.env.SCRIPT_SIGNING_KEY = testKey;

      const instance = KeyManagerService.getInstance();
      const publicKey = instance.getPublicKeyBase64();

      expect(publicKey).toBeDefined();
      expect(publicKey.length).toBeGreaterThan(0);

      // Cleanup
      if (originalEnv !== undefined) {
        process.env.SCRIPT_SIGNING_KEY = originalEnv;
      } else {
        delete process.env.SCRIPT_SIGNING_KEY;
      }
    });
  });

  describe('Signing and Verification', () => {
    it('should sign and verify messages correctly', () => {
      const instance = KeyManagerService.getInstance();
      const message = Buffer.from('test message');

      const signature = instance.sign(message);
      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature.length).toBe(64); // Ed25519 signature size

      const isValid = instance.verify(signature, message);
      expect(isValid).toBe(true);
    });

    it('should fail verification with wrong message', () => {
      const instance = KeyManagerService.getInstance();
      const message = Buffer.from('test message');
      const wrongMessage = Buffer.from('wrong message');

      const signature = instance.sign(message);
      const isValid = instance.verify(signature, wrongMessage);

      expect(isValid).toBe(false);
    });

    it('should fail verification with wrong signature', () => {
      const instance = KeyManagerService.getInstance();
      const message = Buffer.from('test message');

      const wrongSignature = new Uint8Array(64).fill(0);
      const isValid = instance.verify(wrongSignature, message);

      expect(isValid).toBe(false);
    });
  });

  describe('Cross-Instance Verification', () => {
    it('should verify signatures across different service instances', () => {
      // This test simulates the real-world scenario where one API request
      // creates and signs a package, and a different API request verifies it

      // First "request" - create and sign
      const signingInstance = KeyManagerService.getInstance();
      const message = Buffer.from('script:checksum123');
      const signature = signingInstance.sign(message);

      // Simulate new request by resetting singleton
      // @ts-expect-error - accessing private static member for testing
      KeyManagerService.instance = undefined;

      // Second "request" - verify
      const verifyingInstance = KeyManagerService.getInstance();
      const isValid = verifyingInstance.verify(signature, message);

      expect(isValid).toBe(true);
    });
  });
});
