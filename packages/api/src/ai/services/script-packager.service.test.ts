import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'crypto';

import { ScriptPackagerService } from './script-packager.service';
import { KeyManagerService } from './key-manager.service';

import type { ScriptManifest } from '../schemas/manifest.schema';
import type { ExecutionResult } from './script-packager.service';

describe('ScriptPackagerService', () => {
  let service: ScriptPackagerService;

  beforeEach(() => {
    service = new ScriptPackagerService();
  });

  describe('packageScript', () => {
    it('should package a script with manifest', () => {
      // Arrange
      const script = '#!/bin/bash\necho "Hello World"';
      const manifest: ScriptManifest = {
        interpreter: 'bash',
        timeout: 30,
        requiredCapabilities: [],
        environmentVariables: {},
        workingDirectory: '/tmp',
        maxRetries: 0,
        retryDelay: 5,
      };
      const approvalId = 'approval-123';

      // Act
      const result = service.packageScript(script, manifest, approvalId);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toMatch(/^pkg_[a-f0-9]{32}$/);
      expect(result.script).toBe(Buffer.from(script).toString('base64'));
      expect(result.manifest).toEqual(manifest);
      expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(result.signature).toBeDefined();
      expect(result.approvalId).toBe(approvalId);
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should generate unique package IDs', () => {
      // Arrange
      const script = 'echo "test"';
      const manifest: ScriptManifest = {
        interpreter: 'bash',
        timeout: 10,
        requiredCapabilities: [],
        environmentVariables: {},
        workingDirectory: '/tmp',
        maxRetries: 0,
        retryDelay: 5,
      };

      // Act
      const package1 = service.packageScript(script, manifest);
      const package2 = service.packageScript(script, manifest);

      // Assert
      expect(package1.id).not.toBe(package2.id);
    });

    it('should calculate consistent checksums', () => {
      // Arrange
      const script = 'echo "consistent"';
      const manifest: ScriptManifest = {
        interpreter: 'sh',
        timeout: 60,
        requiredCapabilities: [],
        environmentVariables: {},
        workingDirectory: '/tmp',
        maxRetries: 1,
        retryDelay: 10,
      };

      // Act
      const package1 = service.packageScript(script, manifest);
      const package2 = service.packageScript(script, manifest);

      // Assert
      expect(package1.checksum).toBe(package2.checksum);
    });
  });

  describe('verifyPackage', () => {
    it('should verify a valid package signature', () => {
      // Arrange
      const script = 'echo "verify me"';
      const manifest: ScriptManifest = {
        interpreter: 'bash',
        timeout: 30,
        requiredCapabilities: [],
        environmentVariables: {},
        workingDirectory: '/tmp',
        maxRetries: 0,
        retryDelay: 5,
      };

      // Act
      const scriptPackage = service.packageScript(script, manifest);
      const isValid = service.verifyPackage(scriptPackage);

      // Assert
      expect(isValid).toBe(true);
    });

    it('should reject package with tampered signature', () => {
      // Arrange
      const script = 'echo "tampered"';
      const manifest: ScriptManifest = {
        interpreter: 'bash',
        timeout: 30,
        requiredCapabilities: [],
        environmentVariables: {},
        workingDirectory: '/tmp',
        maxRetries: 0,
        retryDelay: 5,
      };

      // Act
      const scriptPackage = service.packageScript(script, manifest);
      // Tamper with signature
      if (scriptPackage.signature) {
        scriptPackage.signature = scriptPackage.signature.slice(0, -2) + 'XX';
      }
      const isValid = service.verifyPackage(scriptPackage);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should return false for package without signature', () => {
      // Arrange
      const scriptPackage = {
        id: 'pkg_test',
        script: Buffer.from('echo test').toString('base64'),
        manifest: {
          interpreter: 'bash' as const,
          timeout: 30,
          requiredCapabilities: [],
          environmentVariables: {},
          workingDirectory: '/tmp',
          maxRetries: 0,
          retryDelay: 5,
        },
        checksum: 'abc123',
        createdAt: new Date(),
      };

      // Act
      const isValid = service.verifyPackage(scriptPackage);

      // Assert
      expect(isValid).toBe(false);
    });
  });

  describe('validateChecksum', () => {
    it('should validate correct checksum', () => {
      // Arrange
      const script = 'echo "checksum test"';
      const manifest: ScriptManifest = {
        interpreter: 'bash',
        timeout: 30,
        requiredCapabilities: [],
        environmentVariables: {},
        workingDirectory: '/tmp',
        maxRetries: 0,
        retryDelay: 5,
      };

      // Act
      const scriptPackage = service.packageScript(script, manifest);
      const isValid = service.validateChecksum(scriptPackage);

      // Assert
      expect(isValid).toBe(true);
    });

    it('should reject package with invalid checksum', async () => {
      // Arrange
      const script = 'echo "invalid checksum"';
      const manifest: ScriptManifest = {
        interpreter: 'bash',
        timeout: 30,
        requiredCapabilities: [],
        environmentVariables: {},
        workingDirectory: '/tmp',
        maxRetries: 0,
        retryDelay: 5,
      };

      // Act
      const scriptPackage = service.packageScript(script, manifest);
      scriptPackage.checksum = 'invalid-checksum';
      const isValid = service.validateChecksum(scriptPackage);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should detect tampered script content', async () => {
      // Arrange
      const script = 'echo "original"';
      const manifest: ScriptManifest = {
        interpreter: 'bash',
        timeout: 30,
        requiredCapabilities: [],
        environmentVariables: {},
        workingDirectory: '/tmp',
        maxRetries: 0,
        retryDelay: 5,
      };

      // Act
      const scriptPackage = service.packageScript(script, manifest);
      // Tamper with script
      scriptPackage.script = Buffer.from('echo "tampered"').toString('base64');
      const isValid = service.validateChecksum(scriptPackage);

      // Assert
      expect(isValid).toBe(false);
    });
  });

  describe('processExecutionResult', () => {
    it('should process valid execution result', async () => {
      // Arrange
      const result: ExecutionResult = {
        packageId: 'pkg_123',
        deviceId: 'device_456',
        exitCode: 0,
        stdout: 'Success output',
        stderr: '',
        executionTime: 1500,
        completedAt: new Date(),
      };

      // Act
      const processed = service.processExecutionResult(result);

      // Assert
      expect(processed).toEqual(result);
    });

    it('should sanitize sensitive information from output', async () => {
      // Arrange
      const result: ExecutionResult = {
        packageId: 'pkg_123',
        deviceId: 'device_456',
        exitCode: 0,
        stdout:
          'API_KEY=sk-proj-abcd1234567890ABCDEFGHIJ1234567890 email@example.com 192.168.1.1 10.0.0.1',
        stderr:
          'token=ghp_1234567890abcdefghij1234567890abcdef AKIA1234567890ABCDEF',
        executionTime: 1500,
        completedAt: new Date(),
      };

      // Act
      const processed = service.processExecutionResult(result);

      // Assert
      // Comprehensive sanitizer replaces various PII patterns
      expect(processed.stdout).toContain('<API_KEY_REDACTED>');
      expect(processed.stdout).toContain('<EMAIL_REDACTED>');
      expect(processed.stdout).toContain('192.168.*.*'); // Private IP partially visible
      expect(processed.stdout).toContain('10.0.*.*'); // Private IP partially visible
      expect(processed.stderr).toContain('<API_KEY_REDACTED>');
      expect(processed.stderr).toContain('<AWS_KEY_REDACTED>');
    });

    it('should handle empty output gracefully', async () => {
      // Arrange
      const result: ExecutionResult = {
        packageId: 'pkg_123',
        deviceId: 'device_456',
        exitCode: 0,
        stdout: '',
        stderr: '',
        executionTime: 100,
        completedAt: new Date(),
      };

      // Act
      const processed = service.processExecutionResult(result);

      // Assert
      expect(processed.stdout).toBe('');
      expect(processed.stderr).toBe('');
    });

    it('should throw error for invalid result', () => {
      // Arrange
      const invalidResult = {
        deviceId: 'device_456',
        stdout: 'output',
      } as ExecutionResult;

      // Act & Assert
      expect(() => service.processExecutionResult(invalidResult)).toThrow(
        'Invalid execution result'
      );
    });
  });

  describe('getPublicKey', () => {
    it('should return base64 encoded public key', () => {
      // Act
      const publicKey = service.getPublicKey();

      // Assert
      expect(publicKey).toBeDefined();
      expect(publicKey).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });
  });

  describe('Cross-Instance Signature Verification (P0 Fix)', () => {
    it('should verify signatures created by different service instances', () => {
      // This is the CRITICAL test that would have failed before the fix
      // It simulates the real-world scenario where one API handler creates
      // a package and another handler verifies it later

      // First service instance (e.g., during script creation)
      const packager1 = new ScriptPackagerService();
      const script = 'echo "cross-instance test"';
      const manifest: ScriptManifest = {
        interpreter: 'bash',
        timeout: 30,
        requiredCapabilities: [],
        environmentVariables: {},
        workingDirectory: '/tmp',
        maxRetries: 0,
        retryDelay: 5,
      };
      const scriptPackage = packager1.packageScript(script, manifest);

      // Second service instance (e.g., when device fetches the package)
      const packager2 = new ScriptPackagerService();

      // This should succeed with persistent keys
      const isChecksumValid = packager2.validateChecksum(scriptPackage);
      expect(isChecksumValid).toBe(true);

      // This is the critical verification that was failing before
      const isSignatureValid = packager2.verifyPackage(scriptPackage);
      expect(isSignatureValid).toBe(true);
    });

    it('should verify packages after service restart simulation', () => {
      // Create and sign package
      const originalPackager = new ScriptPackagerService();
      const script = 'echo "restart test"';
      const manifest: ScriptManifest = {
        interpreter: 'bash',
        timeout: 30,
        requiredCapabilities: [],
        environmentVariables: {},
        workingDirectory: '/tmp',
        maxRetries: 0,
        retryDelay: 5,
      };
      const scriptPackage = originalPackager.packageScript(script, manifest);

      // Reset KeyManagerService singleton to simulate service restart
      // @ts-expect-error - accessing private static member for testing
      KeyManagerService.instance = undefined;

      // Create new packager after "restart"
      const newPackager = new ScriptPackagerService();

      // Verification should still work
      const isValid = newPackager.verifyPackage(scriptPackage);
      expect(isValid).toBe(true);
    });

    it('should maintain signature verification across multiple packages', () => {
      const packager1 = new ScriptPackagerService();
      const packager2 = new ScriptPackagerService();

      const manifest: ScriptManifest = {
        interpreter: 'bash',
        timeout: 30,
        requiredCapabilities: [],
        environmentVariables: {},
        workingDirectory: '/tmp',
        maxRetries: 0,
        retryDelay: 5,
      };

      // Create multiple packages with first instance
      const packages = [
        packager1.packageScript('echo "script1"', manifest),
        packager1.packageScript('echo "script2"', manifest),
        packager1.packageScript('echo "script3"', manifest),
      ];

      // Verify all packages with second instance
      packages.forEach((pkg, index) => {
        const isValid = packager2.verifyPackage(pkg);
        expect(isValid).toBe(true);
      });
    });

    it('should provide consistent public key across instances', () => {
      const packager1 = new ScriptPackagerService();
      const packager2 = new ScriptPackagerService();

      const publicKey1 = packager1.getPublicKey();
      const publicKey2 = packager2.getPublicKey();

      expect(publicKey1).toBe(publicKey2);
      expect(publicKey1).toBeTruthy();
    });
  });
});
