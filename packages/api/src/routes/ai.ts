//

import { z } from 'zod';

import { AIOrchestrator } from '../ai/services/ai-orchestrator.service';
import { HITLPermissionHandler } from '../ai/services/hitl-permission-handler.service';
import { MessageProcessor } from '../ai/services/message-processor.service';
import { NetworkMCPTools } from '../ai/tools/network-mcp-tools';
import { webPortalAuthHook } from '../middleware/web-portal-auth.middleware';
import { supabase } from '../services/supabase';

import { getConnectionManager } from './websocket';

import type {
  NetworkDiagnosticPrompt,
  RemediationScriptPrompt,
} from '../ai/prompts/network-analysis.prompts';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';

// Request/Response schemas
const diagnosticAnalyzeSchema = z.object({
  sessionId: z.string(),
  deviceId: z.string(),
  diagnosticData: z.object({
    networkInfo: z.object({
      ipAddress: z.string().optional(),
      gateway: z.string().optional(),
      dns: z.array(z.string()).optional(),
      interfaces: z.array(z.any()).optional(),
    }),
    performanceMetrics: z
      .object({
        latency: z.number().optional(),
        packetLoss: z.number().optional(),
        bandwidth: z.number().optional(),
      })
      .optional(),
    errors: z.array(z.string()).optional(),
    logs: z.array(z.string()).optional(),
  }),
  analysisType: z
    .enum(['connectivity', 'performance', 'security', 'general'])
    .default('general'),
});

const scriptGenerateSchema = z.object({
  sessionId: z.string(),
  deviceId: z.string(),
  issue: z.string(),
  proposedFix: z.object({
    type: z.enum(['network_config', 'firewall', 'dns', 'routing', 'other']),
    description: z.string(),
    riskLevel: z.enum(['low', 'medium', 'high']),
    estimatedDuration: z.number().optional(),
  }),
  constraints: z
    .object({
      maxExecutionTime: z.number().default(300),
      allowNetworkChanges: z.boolean().default(false),
      requireRollback: z.boolean().default(true),
    })
    .optional(),
});

const scriptValidateSchema = z.object({
  sessionId: z.string(),
  script: z.string(),
  manifest: z.object({
    interpreter: z.string(),
    timeout: z.number(),
    requiredCapabilities: z.array(z.string()).optional(),
    environmentVariables: z.record(z.string(), z.string()).optional(),
  }),
  policyChecks: z
    .array(
      z.enum(['pii', 'network_safety', 'file_access', 'command_injection'])
    )
    .optional(),
});

const scriptSubmitApprovalSchema = z.object({
  sessionId: z.string(),
  scriptId: z.string(),
  script: z.string(),
  manifest: z.any(),
  riskAssessment: z.object({
    level: z.enum(['low', 'medium', 'high']),
    factors: z.array(z.string()),
    mitigations: z.array(z.string()).optional(),
  }),
  requesterId: z.string(),
  requireSecondApproval: z.boolean().default(false),
});

export const aiRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const orchestrator = new AIOrchestrator();
  const messageProcessor = new MessageProcessor();
  const permissionHandler = new HITLPermissionHandler();

  /**
   * POST /api/v1/ai/diagnostics/analyze
   * Stream diagnostic analysis using AsyncGenerator SSE
   */
  fastify.post(
    '/api/v1/ai/diagnostics/analyze',
    {
      preHandler: webPortalAuthHook,
      schema: {
        body: diagnosticAnalyzeSchema,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = diagnosticAnalyzeSchema.parse(request.body);
      const { sessionId, deviceId, diagnosticData, analysisType } = body;

      // Set up SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      });

      try {
        // Build diagnostic prompt
        const prompt: NetworkDiagnosticPrompt = {
          id: `diag-${sessionId}`,
          name: 'Network Diagnostic Analysis',
          description: `Perform ${analysisType} analysis`,
          version: '1.0',
          category: 'diagnostics',
          riskLevel: 'low',
          requiresApproval: false,
          type: 'network-diagnostic',
          input: {
            deviceId,
            deviceType: 'raspberry-pi',
            symptoms: diagnosticData.errors || [],
            diagnosticData: {
              interfaceStatus: diagnosticData.networkInfo.interfaces as any[],
              dnsQueries: diagnosticData.networkInfo.dns?.map(dns => ({
                query: dns,
                result: 'pending',
              })) as any[],
            },
          },
        };

        // Store analysis session
        const { error: insertError } = await supabase
          .from('diagnostic_sessions')
          .insert({
            device_id: deviceId,
            session_type: 'analysis',
            status: 'in_progress',
            metadata: { analysisType, prompt },
          });

        if (insertError) {
          request.log.error(insertError, 'Failed to create diagnostic session');
        }

        // Stream analysis results
        const analysisStream = orchestrator.analyzeDiagnostics(
          prompt,
          sessionId
        );

        for await (const message of analysisStream) {
          const processedMessage = await messageProcessor.processMessage(
            message,
            sessionId
          );

          // Send SSE event
          reply.raw.write(`data: ${JSON.stringify(processedMessage)}\n\n`);

          // Store intermediate results
          if (
            processedMessage.type === 'assistant' ||
            processedMessage.type === 'result'
          ) {
            await supabase
              .from('diagnostic_sessions')
              .update({
                result: processedMessage,
                status:
                  processedMessage.type === 'result'
                    ? 'completed'
                    : 'in_progress',
              })
              .eq('device_id', deviceId)
              .eq('session_type', 'analysis');
          }
        }

        // Send completion event
        reply.raw.write(`event: complete\ndata: {"status":"completed"}\n\n`);
        reply.raw.end();
      } catch (error) {
        request.log.error(error, 'Diagnostic analysis failed');

        // Send error event
        reply.raw.write(
          `event: error\ndata: ${JSON.stringify({
            error: error instanceof Error ? error.message : 'Analysis failed',
          })}\n\n`
        );
        reply.raw.end();

        // Update session status
        await supabase
          .from('diagnostic_sessions')
          .update({ status: 'failed', error: String(error) })
          .eq('device_id', deviceId)
          .eq('session_type', 'analysis');
      }
    }
  );

  /**
   * POST /api/v1/ai/scripts/generate
   * Generate remediation scripts using MCP tools
   */
  fastify.post(
    '/api/v1/ai/scripts/generate',
    {
      preHandler: webPortalAuthHook,
      schema: {
        body: scriptGenerateSchema,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = scriptGenerateSchema.parse(request.body);
      const { sessionId, deviceId, issue, proposedFix, constraints } = body;

      // Set up SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      try {
        // Build remediation prompt
        const prompt: RemediationScriptPrompt = {
          id: `rem-${sessionId}`,
          name: 'Remediation Script Generation',
          description: proposedFix.description,
          version: '1.0',
          category: 'remediation',
          riskLevel: proposedFix.riskLevel,
          requiresApproval: true,
          type: 'remediation-script',
          input: {
            issue,
            rootCause: proposedFix.description,
            targetDevice: {
              id: deviceId,
              type: 'raspberry-pi',
              osVersion: 'Raspbian 11',
              capabilities: ['NET_RAW', 'NET_ADMIN'],
            },
            proposedActions: [
              {
                id: `action-${sessionId}-1`,
                description: proposedFix.description,
                command: '',
                expectedOutcome: 'Network issue resolved',
                riskLevel: proposedFix.riskLevel,
                requiresApproval: true,
              },
            ],
            constraints: {
              maxExecutionTime: constraints?.maxExecutionTime || 300,
              rollbackRequired: constraints?.requireRollback ?? true,
            },
          },
          safetyChecks: {
            preConditions: [
              'Network connectivity check',
              'Backup current configuration',
            ],
            postConditions: [
              'Verify network connectivity',
              'Check service status',
            ],
            rollbackScript: '#!/bin/bash\n# Rollback script will be generated',
          },
        };

        // Create permission handler for HITL
        const canUseTool = permissionHandler.createCanUseToolHandler(
          sessionId,
          deviceId
        );

        // Stream script generation
        const generationStream = orchestrator.generateRemediation(
          prompt,
          sessionId,
          canUseTool
        );

        for await (const message of generationStream) {
          const processedMessage = await messageProcessor.processMessage(
            message,
            sessionId
          );

          // Send SSE event
          reply.raw.write(`data: ${JSON.stringify(processedMessage)}\n\n`);

          // Extract generated script from assistant tool_use blocks
          if (processedMessage.type === 'assistant') {
            const blocks = (processedMessage as any)?.content?.content as
              | Array<{ type: string; name?: string; input?: any }>
              | undefined;
            if (blocks) {
              for (const block of blocks) {
                if (block.type === 'tool_use' && block.name === 'script_generator') {
                  const { data: scriptData, error } = await supabase
                    .from('remediation_scripts' as any)
                    .insert({
                      session_id: sessionId,
                      device_id: deviceId,
                      script: block.input?.script,
                      manifest: block.input?.manifest,
                      risk_level: proposedFix.riskLevel,
                      status: 'pending_validation',
                    } as any)
                    .select()
                    .single();

                  if (!error && scriptData) {
                    reply.raw.write(
                      `data: ${JSON.stringify({
                        type: 'script_generated',
                        scriptId: (scriptData as any).id,
                        script: (scriptData as any).script,
                      })}\n\n`
                    );
                  }
                }
              }
            }
          }
        }

        reply.raw.write(`event: complete\ndata: {"status":"completed"}\n\n`);
        reply.raw.end();
      } catch (error) {
        request.log.error(error, 'Script generation failed');

        reply.raw.write(
          `event: error\ndata: ${JSON.stringify({
            error: error instanceof Error ? error.message : 'Generation failed',
          })}\n\n`
        );
        reply.raw.end();
      }
    }
  );

  /**
   * POST /api/v1/ai/scripts/validate
   * Validate scripts with SDK validation
   */
  fastify.post(
    '/api/v1/ai/scripts/validate',
    {
      preHandler: webPortalAuthHook,
      schema: {
        body: scriptValidateSchema,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = scriptValidateSchema.parse(request.body);
      const {
        sessionId,
        script,
        manifest,
        policyChecks = ['pii', 'network_safety', 'command_injection'],
      } = body;

      try {
        // Perform validation checks
        const validationResults = {
          passed: true,
          checks: [] as Array<{
            name: string;
            passed: boolean;
            message?: string;
          }>,
        };

        // PII check
        if (policyChecks.includes('pii')) {
          const piiPatterns = [
            /\b(?:\d{3}-\d{2}-\d{4}|\d{9})\b/, // SSN
            /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
            /\b(?:\d{4}[-\s]?){3}\d{4}\b/, // Credit card
          ];

          const hasPII = piiPatterns.some(pattern => pattern.test(script));
          validationResults.checks.push({
            name: 'pii',
            passed: !hasPII,
            message: hasPII ? 'Script contains potential PII' : undefined,
          });
          if (hasPII) validationResults.passed = false;
        }

        // Network safety check
        if (policyChecks.includes('network_safety')) {
          const dangerousCommands = [
            'rm -rf /',
            'dd if=/dev/zero',
            'iptables -F',
            'shutdown',
            'reboot',
          ];

          const hasUnsafeCommand = dangerousCommands.some(cmd =>
            script.includes(cmd)
          );
          validationResults.checks.push({
            name: 'network_safety',
            passed: !hasUnsafeCommand,
            message: hasUnsafeCommand
              ? 'Script contains potentially dangerous commands'
              : undefined,
          });
          if (hasUnsafeCommand) validationResults.passed = false;
        }

        // Command injection check
        if (policyChecks.includes('command_injection')) {
          const injectionPatterns = [
            /\$\(.*\)/, // Command substitution
            /`.*`/, // Backticks
            /;\s*(?:rm|dd|format|del)\b/, // Chained dangerous commands
            /\|\s*(?:sh|bash|zsh|cmd)\b/, // Pipe to shell
          ];

          const hasInjection = injectionPatterns.some(pattern =>
            pattern.test(script)
          );
          validationResults.checks.push({
            name: 'command_injection',
            passed: !hasInjection,
            message: hasInjection
              ? 'Script contains potential command injection vectors'
              : undefined,
          });
          if (hasInjection) validationResults.passed = false;
        }

        // File access check
        if (policyChecks.includes('file_access')) {
          const restrictedPaths = [
            '/etc/passwd',
            '/etc/shadow',
            '/root',
            '~/.ssh',
            '/var/lib',
          ];

          const hasRestrictedAccess = restrictedPaths.some(path =>
            script.includes(path)
          );
          validationResults.checks.push({
            name: 'file_access',
            passed: !hasRestrictedAccess,
            message: hasRestrictedAccess
              ? 'Script accesses restricted file paths'
              : undefined,
          });
          if (hasRestrictedAccess) validationResults.passed = false;
        }

        // Store validation results
        await supabase.from('script_validations').insert({
          session_id: sessionId,
          script_hash: Buffer.from(script).toString('base64').substring(0, 64),
          validation_results: validationResults,
          manifest,
        });

        return reply.send({
          valid: validationResults.passed,
          checks: validationResults.checks,
          manifest,
        });
      } catch (error) {
        request.log.error(error, 'Script validation failed');
        return reply.status(500).send({
          error: 'Script validation failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /api/v1/ai/scripts/submit-for-approval
   * Submit scripts for HITL approval integrated with canUseTool
   */
  fastify.post(
    '/api/v1/ai/scripts/submit-for-approval',
    {
      preHandler: webPortalAuthHook,
      schema: {
        body: scriptSubmitApprovalSchema,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = scriptSubmitApprovalSchema.parse(request.body);
      const {
        sessionId,
        scriptId,
        script,
        manifest,
        riskAssessment,
        requesterId,
        requireSecondApproval,
      } = body;

      try {
        // Create approval request
        const { data: approvalRequest, error } = await supabase
          .from('approval_requests')
          .insert({
            session_id: sessionId,
            script_id: scriptId,
            script_content: script,
            manifest,
            risk_assessment: riskAssessment,
            requester_id: requesterId,
            status: 'pending',
            require_second_approval: requireSecondApproval,
            created_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) {
          throw error;
        }

        // Notify connected WebSocket clients for real-time approval
        const connectionManager = getConnectionManager();
        const connections = connectionManager
          .getConnectionsByType('customer')
          .filter((conn: any) => conn.metadata?.customerId === requesterId);

        for (const conn of connections) {
          conn.ws.send(
            JSON.stringify({
              type: 'approval_request',
              data: {
                approvalId: approvalRequest.id,
                sessionId,
                scriptId,
                riskLevel: riskAssessment.level,
                description: `Script requires approval (Risk: ${riskAssessment.level})`,
                factors: riskAssessment.factors,
                mitigations: riskAssessment.mitigations,
              },
            })
          );
        }

        return reply.send({
          approvalId: approvalRequest.id,
          status: 'pending',
          requireSecondApproval,
          notifiedUsers: connections.length,
        });
      } catch (error) {
        request.log.error(error, 'Failed to submit script for approval');
        return reply.status(500).send({
          error: 'Failed to submit for approval',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * WebSocket /api/v1/ai/approval-stream
   * Real-time HITL approval stream
   */
  fastify.get(
    '/api/v1/ai/approval-stream',
    {
      websocket: true,
      preHandler: webPortalAuthHook,
    },
    (connection: any, request: any) => {
      const socket = connection.socket;
      const connectionManager = getConnectionManager();
      const userId = (request as any).user?.id;

      if (!userId) {
        socket.send(
          JSON.stringify({ type: 'error', message: 'Authentication required' })
        );
        socket.close();
        return;
      }

      // Register WebSocket connection
      const connectionId = `approval-${Date.now()}`;
      connectionManager.addConnection(connectionId, socket, {
        customerId: userId,
        deviceId: null,
        type: 'approval',
      });

      socket.send(
        JSON.stringify({
          type: 'connected',
          connectionId,
          message: 'Connected to approval stream',
        })
      );

      // Handle approval responses
      socket.on('message', async (data: any) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.type === 'approval_response') {
            const { approvalId, approved, reason, modifiedInput } = message;

            // Update approval request
            await supabase
              .from('approval_requests')
              .update({
                status: approved ? 'approved' : 'denied',
                approval_reason: reason,
                approved_by: userId,
                approved_at: new Date().toISOString(),
                modified_input: modifiedInput,
              })
              .eq('id', approvalId);

            // Notify permission handler
            await permissionHandler.handleApprovalResponse(
              approvalId,
              approved ? 'approve' : 'deny',
              {
                modifiedInput,
                reason,
              }
            );

            socket.send(
              JSON.stringify({
                type: 'approval_processed',
                approvalId,
                status: approved ? 'approved' : 'denied',
              })
            );
          }
        } catch (error) {
          request.log.error(error, 'Failed to process approval response');
          socket.send(
            JSON.stringify({
              type: 'error',
              message: 'Failed to process approval',
            })
          );
        }
      });

      socket.on('close', () => {
        connectionManager.removeConnection(connectionId as string);
      });

      socket.on('error', (error: any) => {
        request.log.error(error, 'WebSocket error in approval stream');
        connectionManager.removeConnection(connectionId as string);
      });
    }
  );

  /**
   * GET /api/v1/ai/mcp-tools
   * List available SDK MCP tools
   */
  fastify.get(
    '/api/v1/ai/mcp-tools',
    {
      preHandler: webPortalAuthHook,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Get available tools from network MCP tools
        const tools = NetworkMCPTools.listTools();

        // Add metadata for each tool
        const toolsWithMetadata = tools.map((name: string) => ({
          name,
          description: '',
          inputSchema: undefined,
          riskLevel: NetworkMCPTools.getToolRiskLevel(name),
          requiresApproval: NetworkMCPTools.requiresApproval(name),
          category: 'general',
          examples: [],
        }));

        return reply.send({
          tools: toolsWithMetadata,
          categories: [
            ...new Set(
              (toolsWithMetadata as Array<{ category: string }>).map(
                (t: { category: string }) => t.category
              )
            ),
          ],
          totalTools: toolsWithMetadata.length,
        });
      } catch (error) {
        request.log.error(error, 'Failed to list MCP tools');
        return reply.status(500).send({
          error: 'Failed to list tools',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
};
