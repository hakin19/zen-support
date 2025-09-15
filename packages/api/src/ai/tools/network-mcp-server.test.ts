/**
 * Tests for Network MCP Server Implementation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';

import {
  createNetworkMcpServer,
  getNetworkTool,
  NETWORK_MCP_TOOLS,
} from './network-mcp-server';
import { NetworkMCPTools } from './network-mcp-tools';

describe('Network MCP Server', () => {
  describe('createNetworkMcpServer', () => {
    it('should create an MCP server with all network tools', () => {
      const server = createNetworkMcpServer();

      expect(server).toBeDefined();
      expect(server.name).toBe('aizen-network-tools');
      expect(server.version).toBe('1.0.0');
      expect(server.tools).toBeDefined();
      expect(server.tools.length).toBe(12); // Total number of tools
    });

    it('should include all diagnostic tools', () => {
      const server = createNetworkMcpServer();
      const toolNames = server.tools.map((t: any) => t.name);

      NETWORK_MCP_TOOLS.diagnostic.forEach(toolName => {
        expect(toolNames).toContain(toolName);
      });
    });

    it('should include all analysis tools', () => {
      const server = createNetworkMcpServer();
      const toolNames = server.tools.map((t: any) => t.name);

      NETWORK_MCP_TOOLS.analysis.forEach(toolName => {
        expect(toolNames).toContain(toolName);
      });
    });

    it('should include all modification tools', () => {
      const server = createNetworkMcpServer();
      const toolNames = server.tools.map((t: any) => t.name);

      NETWORK_MCP_TOOLS.modification.forEach(toolName => {
        expect(toolNames).toContain(toolName);
      });
    });
  });

  describe('Individual Tool Tests', () => {
    describe('ping_test tool', () => {
      it('should validate input correctly', async () => {
        const tool = getNetworkTool('ping_test');
        expect(tool).toBeDefined();

        const validInput = {
          deviceId: 'device123',
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          correlationId: '550e8400-e29b-41d4-a716-446655440001',
          timestamp: new Date().toISOString(),
          target: '8.8.8.8',
          count: 4,
          packetSize: 56,
          timeout: 5,
          interval: 1,
        };

        // Tool handler is the fourth parameter passed to tool()
        const handler = (tool as any).handler;
        const result = await handler(validInput);

        expect(result).toBeDefined();
        expect(result.isError).toBe(false);
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
      });

      it('should reject invalid input', async () => {
        const tool = getNetworkTool('ping_test');
        const invalidInput = {
          deviceId: 'device123',
          sessionId: 'not-a-uuid', // Invalid UUID
          correlationId: '550e8400-e29b-41d4-a716-446655440001',
          timestamp: new Date().toISOString(),
          target: 'invalid-ip', // Invalid IP/URL
        };

        const handler = (tool as any).handler;
        const result = await handler(invalidInput);

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Validation failed');
      });
    });

    describe('script_generator tool', () => {
      it('should generate scripts with safety constraints', async () => {
        const tool = getNetworkTool('script_generator');
        expect(tool).toBeDefined();

        const validInput = {
          deviceId: 'device123',
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          correlationId: '550e8400-e29b-41d4-a716-446655440001',
          timestamp: new Date().toISOString(),
          scriptType: 'remediation',
          targetPlatform: 'linux',
          actions: [
            {
              action: 'restart network service',
              parameters: { service: 'networking' },
            },
          ],
          safetyChecks: {
            preConditions: ['check service status'],
            postConditions: ['verify connectivity'],
            rollbackScript: 'systemctl restart networking',
          },
          constraints: {
            maxExecutionTime: 300,
            requireConfirmation: true,
            dryRun: false,
          },
        };

        const handler = (tool as any).handler;
        const result = await handler(validInput);

        expect(result.isError).toBe(false);
        const content = JSON.parse(result.content[0].text);
        expect(content.script).toContain('#!/bin/bash');
        expect(content.script).toContain('remediation');
        expect(content.script).toContain('Pre-flight checks');
        expect(content.script).toContain('Rollback procedure');
        expect(content.riskLevel).toBe('high');
      });
    });

    describe('script_validator tool', () => {
      it('should validate scripts for policy compliance', async () => {
        const tool = getNetworkTool('script_validator');
        expect(tool).toBeDefined();

        const validInput = {
          deviceId: 'device123',
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          correlationId: '550e8400-e29b-41d4-a716-446655440001',
          timestamp: new Date().toISOString(),
          script: '#!/bin/bash\necho "test script"',
          platform: 'linux',
          validationRules: ['syntax', 'dangerous-commands', 'security-risks'],
          riskTolerance: 'low',
        };

        const handler = (tool as any).handler;
        const result = await handler(validInput);

        expect(result.isError).toBe(false);
        const content = JSON.parse(result.content[0].text);
        expect(content.valid).toBe(true);
        expect(content.score).toBeGreaterThan(0);
        expect(content.riskAssessment).toBeDefined();
      });
    });
  });

  describe('Tool Risk Levels', () => {
    it('should correctly categorize tool risk levels', () => {
      // Low risk tools
      expect(NetworkMCPTools.getToolRiskLevel('ping_test')).toBe('low');
      expect(NetworkMCPTools.getToolRiskLevel('traceroute')).toBe('low');
      expect(NetworkMCPTools.getToolRiskLevel('dns_query')).toBe('low');
      expect(NetworkMCPTools.getToolRiskLevel('interface_status')).toBe('low');
      expect(NetworkMCPTools.getToolRiskLevel('performance_monitor')).toBe(
        'low'
      );

      // Medium risk tools
      expect(NetworkMCPTools.getToolRiskLevel('port_scan')).toBe('medium');
      expect(NetworkMCPTools.getToolRiskLevel('script_validator')).toBe(
        'medium'
      );
      expect(NetworkMCPTools.getToolRiskLevel('config_compare')).toBe('medium');

      // High risk tools
      expect(NetworkMCPTools.getToolRiskLevel('script_generator')).toBe('high');
      expect(NetworkMCPTools.getToolRiskLevel('config_backup')).toBe('high');
      expect(NetworkMCPTools.getToolRiskLevel('service_restart')).toBe('high');
      expect(NetworkMCPTools.getToolRiskLevel('firewall_rule')).toBe('high');
    });

    it('should require approval for medium and high risk tools', () => {
      // Low risk - no approval needed
      expect(NetworkMCPTools.requiresApproval('ping_test')).toBe(false);
      expect(NetworkMCPTools.requiresApproval('traceroute')).toBe(false);

      // Medium risk - approval required
      expect(NetworkMCPTools.requiresApproval('port_scan')).toBe(true);
      expect(NetworkMCPTools.requiresApproval('script_validator')).toBe(true);

      // High risk - approval required
      expect(NetworkMCPTools.requiresApproval('script_generator')).toBe(true);
      expect(NetworkMCPTools.requiresApproval('service_restart')).toBe(true);
    });
  });

  describe('Tool Metadata', () => {
    it('should export correct tool categories', () => {
      expect(NETWORK_MCP_TOOLS.diagnostic).toHaveLength(5);
      expect(NETWORK_MCP_TOOLS.analysis).toHaveLength(3);
      expect(NETWORK_MCP_TOOLS.modification).toHaveLength(4);

      // Total tools
      const totalTools =
        NETWORK_MCP_TOOLS.diagnostic.length +
        NETWORK_MCP_TOOLS.analysis.length +
        NETWORK_MCP_TOOLS.modification.length;
      expect(totalTools).toBe(12);
    });

    it('should retrieve tools by name', () => {
      const pingTool = getNetworkTool('ping_test');
      expect(pingTool).toBeDefined();
      expect((pingTool as any).name).toBe('ping_test');

      const scriptTool = getNetworkTool('script_generator');
      expect(scriptTool).toBeDefined();
      expect((scriptTool as any).name).toBe('script_generator');

      const validatorTool = getNetworkTool('script_validator');
      expect(validatorTool).toBeDefined();
      expect((validatorTool as any).name).toBe('script_validator');
    });
  });

  describe('Tool Result Creation', () => {
    it('should create successful tool results', () => {
      const result = NetworkMCPTools.createToolResult(true, {
        test: 'data',
        value: 123,
      });

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('test');
      expect(result.content[0].text).toContain('123');
    });

    it('should create error tool results', () => {
      const result = NetworkMCPTools.createToolResult(
        false,
        '',
        'Test error message'
      );

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('Test error message');
    });
  });
});
