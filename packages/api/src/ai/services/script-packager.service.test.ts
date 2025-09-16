import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'crypto';

import { ScriptPackagerService } from './script-packager.service';

import type { ScriptManifest } from '../schemas/manifest.schema';
import type { ExecutionResult } from './script-packager.service';

describe('ScriptPackagerService', () => {
  let service: ScriptPackagerService;

  beforeEach(() => {
    service = new ScriptPackagerService();
  });

  describe('packageScript', () => {
    it('should package a script with manifest', async () => {
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
      const result = await service.packageScript(script, manifest, approvalId);

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

    it('should generate unique package IDs', async () => {
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
      const package1 = await service.packageScript(script, manifest);
      const package2 = await service.packageScript(script, manifest);

      // Assert
      expect(package1.id).not.toBe(package2.id);
    });

    it('should calculate consistent checksums', async () => {
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
      const package1 = await service.packageScript(script, manifest);
      const package2 = await service.packageScript(script, manifest);

      // Assert
      expect(package1.checksum).toBe(package2.checksum);
    });
  });

  describe('verifyPackage', () => {
    it('should verify a valid package signature', async () => {
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
      const scriptPackage = await service.packageScript(script, manifest);
      const isValid = await service.verifyPackage(scriptPackage);

      // Assert
      expect(isValid).toBe(true);
    });

    it('should reject package with tampered signature', async () => {
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
      const scriptPackage = await service.packageScript(script, manifest);
      // Tamper with signature
      if (scriptPackage.signature) {
        scriptPackage.signature = scriptPackage.signature.slice(0, -2) + 'XX';
      }
      const isValid = await service.verifyPackage(scriptPackage);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should return false for package without signature', async () => {
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
      const isValid = await service.verifyPackage(scriptPackage);

      // Assert
      expect(isValid).toBe(false);
    });
  });

  describe('validateChecksum', () => {
    it('should validate correct checksum', async () => {
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
      const scriptPackage = await service.packageScript(script, manifest);
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
      const scriptPackage = await service.packageScript(script, manifest);
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
      const scriptPackage = await service.packageScript(script, manifest);
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
      const processed = await service.processExecutionResult(result);

      // Assert
      expect(processed).toEqual(result);
    });

    it('should sanitize sensitive information from output', async () => {
      // Arrange
      const result: ExecutionResult = {
        packageId: 'pkg_123',
        deviceId: 'device_456',
        exitCode: 0,
        stdout: 'API_KEY=secret123 password=hunter2',
        stderr: 'token=abc123def',
        executionTime: 1500,
        completedAt: new Date(),
      };

      // Act
      const processed = await service.processExecutionResult(result);

      // Assert
      expect(processed.stdout).toBe('api_key=*** password=***');
      expect(processed.stderr).toBe('token=***');
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
      const processed = await service.processExecutionResult(result);

      // Assert
      expect(processed.stdout).toBe('');
      expect(processed.stderr).toBe('');
    });

    it('should throw error for invalid result', async () => {
      // Arrange
      const invalidResult = {
        deviceId: 'device_456',
        stdout: 'output',
      } as ExecutionResult;

      // Act & Assert
      await expect(
        service.processExecutionResult(invalidResult)
      ).rejects.toThrow('Invalid execution result');
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
});
