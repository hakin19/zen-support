/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  SDKOptionsFactory,
  SAFETY_PRESETS,
  TOOL_RISK_LEVELS,
  getEnvironmentSDKOptions,
  type AizenSDKOptions,
} from './sdk-options.config';

describe('SDK Options Configuration - Tool Control', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('SDKOptionsFactory - Tool Configuration', () => {
    describe('createDefaultOptions', () => {
      it('should apply strict mode tool restrictions', () => {
        const options = SDKOptionsFactory.createDefaultOptions('strict');

        expect(options.allowedTools).toEqual(['Read', 'Glob', 'Grep']);
        expect(options.disallowedTools).toEqual([
          'Bash',
          'Write',
          'Edit',
          'MultiEdit',
          'NotebookEdit',
          'WebFetch',
          'WebSearch',
        ]);
        expect(options.permissionMode).toBe('default');
      });

      it('should apply standard mode tool restrictions', () => {
        const options = SDKOptionsFactory.createDefaultOptions('standard');

        expect(options.allowedTools).toEqual([
          'Read',
          'Glob',
          'Grep',
          'Bash',
          'Write',
          'Edit',
        ]);
        expect(options.disallowedTools).toEqual(['WebFetch', 'WebSearch']);
        expect(options.permissionMode).toBe('default');
      });

      it('should apply relaxed mode with minimal restrictions', () => {
        const options = SDKOptionsFactory.createDefaultOptions('relaxed');

        expect(options.allowedTools).toBeUndefined(); // All tools allowed
        expect(options.disallowedTools).toEqual([]);
        expect(options.permissionMode).toBe('acceptEdits');
      });
    });

    describe('createDiagnosticOptions', () => {
      it('should configure tools for read-only diagnostics', () => {
        const options = SDKOptionsFactory.createDiagnosticOptions();

        expect(options.allowedTools).toEqual(['Read', 'Glob', 'Grep', 'Bash']);
        expect(options.disallowedTools).toEqual([
          'Write',
          'Edit',
          'MultiEdit',
          'WebFetch',
          'WebSearch',
        ]);
        expect(options.appendSystemPrompt).toContain(
          'Never modify configuration files directly during diagnostics'
        );
      });
    });

    describe('createRemediationOptions', () => {
      it('should configure tools for safe remediation scripts', () => {
        const options = SDKOptionsFactory.createRemediationOptions();

        expect(options.allowedTools).toEqual(['Read', 'Write', 'Edit']);
        expect(options.disallowedTools).toEqual([
          'Bash',
          'MultiEdit',
          'NotebookEdit',
          'WebFetch',
          'WebSearch',
        ]);
        expect(options.appendSystemPrompt).toContain(
          'All scripts must include rollback procedures'
        );
      });
    });

    describe('validateOptions', () => {
      it('should detect conflicting tool configurations', () => {
        const options = {
          allowedTools: ['Read', 'Write', 'Bash'],
          disallowedTools: ['Write', 'Edit', 'Bash'], // Conflicts with allowedTools
        };

        const result = SDKOptionsFactory.validateOptions(options);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain(
          'Tools cannot be both allowed and disallowed: Write, Bash'
        );
      });

      it('should pass validation for non-conflicting configurations', () => {
        const options = {
          allowedTools: ['Read', 'Write'],
          disallowedTools: ['WebFetch', 'WebSearch'],
        };

        const result = SDKOptionsFactory.validateOptions(options);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should validate model names', () => {
        const options = {
          model: 'gpt-4', // Not a Claude model
        };

        const result = SDKOptionsFactory.validateOptions(options);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Model must be a Claude model');
      });

      it('should validate token limits', () => {
        const options = {
          maxThinkingTokens: 250000, // Exceeds safe limit
        };

        const result = SDKOptionsFactory.validateOptions(options);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain(
          'maxThinkingTokens exceeds safe limit of 200000'
        );
      });
    });
  });

  describe('Tool Risk Levels', () => {
    it('should categorize read-only tools as low risk', () => {
      expect(TOOL_RISK_LEVELS.Read.riskLevel).toBe('low');
      expect(TOOL_RISK_LEVELS.Read.alwaysAllow).toBe(true);
      expect(TOOL_RISK_LEVELS.Read.requireApproval).toBe(false);

      expect(TOOL_RISK_LEVELS.Grep.riskLevel).toBe('low');
      expect(TOOL_RISK_LEVELS.Grep.alwaysAllow).toBe(true);
    });

    it('should categorize diagnostic tools as medium risk', () => {
      expect(TOOL_RISK_LEVELS.Bash.riskLevel).toBe('medium');
      expect(TOOL_RISK_LEVELS.Bash.requireApproval).toBe(true);
      expect(TOOL_RISK_LEVELS.Bash.auditLog).toBe(true);
    });

    it('should categorize modification tools as high risk', () => {
      expect(TOOL_RISK_LEVELS.Write.riskLevel).toBe('high');
      expect(TOOL_RISK_LEVELS.Write.requireApproval).toBe(true);
      expect(TOOL_RISK_LEVELS.Write.auditLog).toBe(true);

      expect(TOOL_RISK_LEVELS.Edit.riskLevel).toBe('high');
      expect(TOOL_RISK_LEVELS.Edit.requireApproval).toBe(true);
    });

    it('should deny external access tools by default', () => {
      expect(TOOL_RISK_LEVELS.WebFetch.alwaysDeny).toBe(true);
      expect(TOOL_RISK_LEVELS.WebFetch.riskLevel).toBe('high');

      expect(TOOL_RISK_LEVELS.WebSearch.alwaysDeny).toBe(true);
      expect(TOOL_RISK_LEVELS.WebSearch.riskLevel).toBe('high');
    });
  });

  describe('Dynamic Tool Configuration', () => {
    it('should filter client-requested tools against server policy', () => {
      const serverPolicy = SDKOptionsFactory.createDefaultOptions('strict');
      const clientRequested = ['Read', 'Write', 'Bash', 'WebFetch'];

      // Simulate intersection of client requested and server allowed
      const actualAllowed = clientRequested.filter(tool =>
        serverPolicy.allowedTools?.includes(tool)
      );

      expect(actualAllowed).toEqual(['Read']); // Only Read is allowed in strict mode
    });

    it('should respect server disallowed tools regardless of client request', () => {
      const serverPolicy = SDKOptionsFactory.createDefaultOptions('standard');
      const clientRequested = ['Read', 'WebFetch', 'WebSearch'];

      // Check which tools would be denied
      const denied = clientRequested.filter(tool =>
        serverPolicy.disallowedTools?.includes(tool)
      );

      expect(denied).toEqual(['WebFetch', 'WebSearch']);
    });

    it('should merge tool configurations with environment-based defaults', () => {
      process.env.NODE_ENV = 'production';
      const options = getEnvironmentSDKOptions();

      expect(options.allowedTools).toEqual(SAFETY_PRESETS.strict.allowedTools);
      expect(options.disallowedTools).toEqual(
        SAFETY_PRESETS.strict.disallowedTools
      );
    });

    it('should apply development settings in dev environment', () => {
      process.env.NODE_ENV = 'development';
      const options = getEnvironmentSDKOptions();

      expect(options.allowedTools).toBeUndefined(); // Relaxed mode
      expect(options.disallowedTools).toEqual([]);
      expect(options.permissionMode).toBe('acceptEdits');
    });
  });

  describe('Tool Configuration Validation', () => {
    it('should validate all tool configurations at startup', () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      SDKOptionsFactory.validateAllToolConfigs();

      // All current tools should be properly configured
      expect(consoleErrorSpy).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should detect invalid tool configurations', () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Create a mock invalid tool config
      const invalidConfig = {
        toolName: 'InvalidTool',
        alwaysAllow: false,
        alwaysDeny: false,
        requireApproval: false, // No flags set to true
        approvalTimeout: 30000,
        riskLevel: 'high' as const,
        auditLog: true,
      };

      const isValid = (SDKOptionsFactory as any).validateToolConfig(
        'InvalidTool',
        invalidConfig
      );

      expect(isValid).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[SECURITY] Tool InvalidTool has invalid configuration - no permission flags set',
        invalidConfig
      );

      consoleErrorSpy.mockRestore();
    });

    it('should validate tools with at least one permission flag', () => {
      const validConfigs = [
        { alwaysAllow: true, alwaysDeny: false, requireApproval: false },
        { alwaysAllow: false, alwaysDeny: true, requireApproval: false },
        { alwaysAllow: false, alwaysDeny: false, requireApproval: true },
      ];

      validConfigs.forEach(flags => {
        const config = {
          toolName: 'TestTool',
          ...flags,
          approvalTimeout: 30000,
          riskLevel: 'medium' as const,
          auditLog: true,
        };

        const isValid = (SDKOptionsFactory as any).validateToolConfig(
          'TestTool',
          config
        );
        expect(isValid).toBe(true);
      });
    });
  });

  describe('Permission Handler with Tool Control', () => {
    it('should allow low-risk tools without approval', async () => {
      const approvalCallback = vi.fn();
      const handler =
        SDKOptionsFactory.createPermissionHandler(approvalCallback);

      const result = await handler('Read', { file: 'test.txt' }, {
        signal: new AbortController().signal,
      } as any);

      expect(result.behavior).toBe('allow');
      expect(approvalCallback).not.toHaveBeenCalled();
    });

    it('should deny always-denied tools', async () => {
      const approvalCallback = vi.fn();
      const handler =
        SDKOptionsFactory.createPermissionHandler(approvalCallback);

      const result = await handler('WebFetch', { url: 'http://example.com' }, {
        signal: new AbortController().signal,
      } as any);

      expect(result.behavior).toBe('deny');
      expect((result as any).message).toContain(
        'not allowed in the current safety mode'
      );
      expect(approvalCallback).not.toHaveBeenCalled();
    });

    it('should request approval for medium-risk tools', async () => {
      const approvalCallback = vi.fn().mockResolvedValue(true);
      const handler =
        SDKOptionsFactory.createPermissionHandler(approvalCallback);

      const result = await handler('Bash', { command: 'ls' }, {
        signal: new AbortController().signal,
      } as any);

      expect(approvalCallback).toHaveBeenCalledWith(
        'Bash',
        { command: 'ls' },
        expect.any(AbortSignal)
      );
      expect(result.behavior).toBe('allow');
    });

    it('should deny tools when approval is rejected', async () => {
      const approvalCallback = vi.fn().mockResolvedValue(false);
      const handler =
        SDKOptionsFactory.createPermissionHandler(approvalCallback);

      const result = await handler('Write', { file: 'config.txt' }, {
        signal: new AbortController().signal,
      } as any);

      expect(approvalCallback).toHaveBeenCalled();
      expect(result.behavior).toBe('deny');
      expect((result as any).message).toContain('User denied permission');
    });

    it('should deny unknown tools by default', async () => {
      const approvalCallback = vi.fn();
      const handler =
        SDKOptionsFactory.createPermissionHandler(approvalCallback);

      const result = await handler('UnknownTool', {}, {
        signal: new AbortController().signal,
      } as any);

      expect(result.behavior).toBe('deny');
      expect((result as any).message).toContain('Unknown tool');
      expect(approvalCallback).not.toHaveBeenCalled();
    });

    it('should handle approval timeout', async () => {
      const approvalCallback = vi.fn().mockRejectedValue(new Error('Timeout'));
      const handler =
        SDKOptionsFactory.createPermissionHandler(approvalCallback);

      const result = await handler('Edit', { file: 'test.txt' }, {
        signal: new AbortController().signal,
      } as any);

      expect(result.behavior).toBe('deny');
      expect((result as any).message).toContain('Approval timeout or error');
    });

    it('should require approval for tools with invalid configuration', async () => {
      const approvalCallback = vi.fn().mockResolvedValue(true);
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      // Temporarily add an invalid tool config for testing
      const originalConfig = TOOL_RISK_LEVELS.TestInvalidTool;
      TOOL_RISK_LEVELS.TestInvalidTool = {
        toolName: 'TestInvalidTool',
        alwaysAllow: false,
        alwaysDeny: false,
        requireApproval: false, // Invalid - no flags set
        approvalTimeout: 30000,
        riskLevel: 'high' as const,
        auditLog: true,
      };

      const handler =
        SDKOptionsFactory.createPermissionHandler(approvalCallback);

      const result = await handler('TestInvalidTool', { test: 'data' }, {
        signal: new AbortController().signal,
      } as any);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Tool TestInvalidTool configuration is incomplete'
        ),
        expect.any(Object)
      );
      expect(approvalCallback).toHaveBeenCalledWith(
        'TestInvalidTool',
        { test: 'data' },
        expect.any(AbortSignal)
      );
      expect(result.behavior).toBe('allow');

      // Cleanup
      if (originalConfig) {
        TOOL_RISK_LEVELS.TestInvalidTool = originalConfig;
      } else {
        delete TOOL_RISK_LEVELS.TestInvalidTool;
      }
      consoleWarnSpy.mockRestore();
    });

    it('should deny invalid tool configuration when approval is rejected', async () => {
      const approvalCallback = vi.fn().mockResolvedValue(false);

      // Temporarily add an invalid tool config for testing
      const originalConfig = TOOL_RISK_LEVELS.TestInvalidTool2;
      TOOL_RISK_LEVELS.TestInvalidTool2 = {
        toolName: 'TestInvalidTool2',
        alwaysAllow: false,
        alwaysDeny: false,
        requireApproval: false, // Invalid - no flags set
        approvalTimeout: 30000,
        riskLevel: 'high' as const,
        auditLog: true,
      };

      const handler =
        SDKOptionsFactory.createPermissionHandler(approvalCallback);

      const result = await handler('TestInvalidTool2', { test: 'data' }, {
        signal: new AbortController().signal,
      } as any);

      expect(result.behavior).toBe('deny');
      expect((result as any).message).toContain('User denied permission');
      expect((result as any).message).toContain('default safety check');

      // Cleanup
      if (originalConfig) {
        TOOL_RISK_LEVELS.TestInvalidTool2 = originalConfig;
      } else {
        delete TOOL_RISK_LEVELS.TestInvalidTool2;
      }
    });
  });

  describe('Custom Safety Policies', () => {
    it('should support custom tool allowlists per customer tier', () => {
      const trialOptions: Partial<AizenSDKOptions> = {
        ...SDKOptionsFactory.createDefaultOptions('strict'),
        networkContext: {
          deviceId: 'device-123',
          deviceType: 'router',
          customerTier: 'trial',
          allowedOperations: ['read-only', 'diagnostic'],
        },
        safetyMode: 'strict',
        requireHITL: true,
      };

      expect(trialOptions.allowedTools).toEqual(['Read', 'Glob', 'Grep']);
      expect(trialOptions.networkContext?.customerTier).toBe('trial');
    });

    it('should support premium tier with more tools', () => {
      const premiumOptions: Partial<AizenSDKOptions> = {
        ...SDKOptionsFactory.createDefaultOptions('standard'),
        networkContext: {
          deviceId: 'device-456',
          deviceType: 'switch',
          customerTier: 'premium',
          allowedOperations: [
            'read-only',
            'diagnostic',
            'configuration-read',
            'configuration-write',
            'restart-service',
          ],
        },
        safetyMode: 'standard',
        requireHITL: true,
      };

      expect(premiumOptions.allowedTools).toContain('Write');
      expect(premiumOptions.allowedTools).toContain('Edit');
      expect(premiumOptions.networkContext?.customerTier).toBe('premium');
    });
  });
});
