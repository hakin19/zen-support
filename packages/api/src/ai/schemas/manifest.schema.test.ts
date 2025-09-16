import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import {
  scriptManifestSchema,
  validateManifest,
  safeParseManifest,
} from './manifest.schema';

describe('Script Manifest Validation', () => {
  describe('scriptManifestSchema', () => {
    it('should validate a valid manifest', () => {
      const validManifest = {
        interpreter: 'bash',
        timeout: 60,
        requiredCapabilities: ['NET_ADMIN'],
        environmentVariables: {
          DEBUG: 'true',
        },
      };

      const result = scriptManifestSchema.parse(validManifest);
      expect(result).toMatchObject(validManifest);
    });

    it('should reject invalid interpreter', () => {
      const invalidManifest = {
        interpreter: 'malicious-binary',
        timeout: 60,
      };

      expect(() => scriptManifestSchema.parse(invalidManifest)).toThrow(
        z.ZodError
      );
    });

    it('should reject timeout out of range', () => {
      const tooLongTimeout = {
        interpreter: 'bash',
        timeout: 3601, // Max is 3600
      };

      expect(() => scriptManifestSchema.parse(tooLongTimeout)).toThrow(
        z.ZodError
      );
    });

    it('should apply defaults for optional fields', () => {
      const minimalManifest = {
        interpreter: 'bash',
        timeout: 30,
      };

      const result = scriptManifestSchema.parse(minimalManifest);
      expect(result).toMatchObject({
        interpreter: 'bash',
        timeout: 30,
        requiredCapabilities: [],
        environmentVariables: {},
        workingDirectory: '/tmp',
        maxRetries: 0,
        retryDelay: 5,
      });
    });
  });

  describe('validateManifest', () => {
    it('should sanitize dangerous environment variables', () => {
      const manifestWithDangerousVars = {
        interpreter: 'bash',
        timeout: 60,
        environmentVariables: {
          SAFE_VAR: 'value',
          LD_PRELOAD: 'malicious.so',
          PATH: '/malicious/path',
        },
      };

      const result = validateManifest(manifestWithDangerousVars);
      expect(result.environmentVariables).toEqual({
        SAFE_VAR: 'value',
      });
      expect(result.environmentVariables?.LD_PRELOAD).toBeUndefined();
      expect(result.environmentVariables?.PATH).toBeUndefined();
    });

    it('should throw on completely invalid manifest', () => {
      const invalidManifest = {
        notAnInterpreter: 'test',
      };

      expect(() => validateManifest(invalidManifest)).toThrow(z.ZodError);
    });
  });

  describe('safeParseManifest', () => {
    it('should return valid manifest for valid input', () => {
      const validManifest = {
        interpreter: 'python3',
        timeout: 120,
      };

      const result = safeParseManifest(validManifest);
      expect(result.interpreter).toBe('python3');
      expect(result.timeout).toBe(120);
    });

    it('should return safe defaults for invalid input', () => {
      const invalidManifest = {
        interpreter: 'invalid',
        timeout: 'not-a-number',
      };

      const result = safeParseManifest(invalidManifest);
      expect(result).toEqual({
        interpreter: 'bash',
        timeout: 60,
        requiredCapabilities: [],
        environmentVariables: {},
        workingDirectory: '/tmp',
        maxRetries: 0,
        retryDelay: 5,
      });
    });

    it('should return safe defaults for null/undefined', () => {
      const result1 = safeParseManifest(null);
      const result2 = safeParseManifest(undefined);
      const result3 = safeParseManifest({});

      const expectedDefaults = {
        interpreter: 'bash',
        timeout: 60,
        requiredCapabilities: [],
        environmentVariables: {},
        workingDirectory: '/tmp',
        maxRetries: 0,
        retryDelay: 5,
      };

      expect(result1).toEqual(expectedDefaults);
      expect(result2).toEqual(expectedDefaults);
      expect(result3).toEqual(expectedDefaults);
    });
  });
});
