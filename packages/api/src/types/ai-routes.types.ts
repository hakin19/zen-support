/**
 * Type definitions for AI route request/response bodies
 */

// Diagnostic Analysis Types
export interface DiagnosticAnalysisRequest {
  sessionId: string;
  deviceId: string;
  diagnosticData: {
    networkInfo: {
      ipAddress?: string;
      gateway?: string;
      dns?: string[];
      interfaces?: Array<{
        name: string;
        status: string;
        ipAddress?: string;
      }>;
    };
    performanceMetrics?: {
      latency: number;
      packetLoss: number;
      bandwidth: number;
    };
    errors?: string[];
    logs?: string[];
  };
  analysisType: 'connectivity' | 'performance' | 'security' | 'comprehensive';
}

// Script Generation Types
export interface ScriptGenerationRequest {
  sessionId: string;
  deviceId: string;
  issue: string;
  proposedFix: {
    type: string;
    description: string;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    estimatedDuration: number;
  };
  constraints: {
    maxExecutionTime: number;
    allowNetworkChanges?: boolean;
    requireRollback?: boolean;
  };
}

// Script Validation Types
export interface ScriptValidationRequest {
  sessionId: string;
  script: string;
  manifest: {
    interpreter: 'bash' | 'python' | 'node';
    timeout: number;
    requiredCapabilities?: string[];
  };
  policyChecks: Array<
    | 'pii'
    | 'network_safety'
    | 'command_injection'
    | 'resource_limits'
    | 'file_access'
  >;
}

export interface ScriptValidationResponse {
  valid: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    message?: string;
    violations?: string[];
  }>;
  riskScore?: number;
  recommendations?: string[];
}

// Approval Types
export interface ScriptApprovalRequest {
  sessionId: string;
  scriptId: string;
  script: string;
  manifest: {
    interpreter: 'bash' | 'python' | 'node';
    timeout: number;
    requiredCapabilities?: string[];
  };
  riskAssessment: {
    level: 'low' | 'medium' | 'high' | 'critical';
    factors: string[];
    mitigations?: string[];
  };
  requesterId: string;
  requireSecondApproval?: boolean;
}

export interface ScriptApprovalResponse {
  approvalId: string;
  status: 'pending' | 'approved' | 'denied';
  requireSecondApproval: boolean;
  approvers?: string[];
  expiresAt?: string;
}

// Performance Analysis Types
export interface PerformanceAnalysisRequest {
  sessionId: string;
  deviceId: string;
  metrics: {
    latency: Array<{ timestamp: string; value: number }>;
    throughput: Array<{ timestamp: string; value: number }>;
    packetLoss: Array<{ timestamp: string; value: number }>;
    utilization: Array<{ timestamp: string; value: number }>;
  };
  timeRange: {
    start: string;
    end: string;
  };
  thresholds?: {
    latencyMs?: number;
    packetLossPercent?: number;
    utilizationPercent?: number;
  };
}

// Security Assessment Types
export interface SecurityAssessmentRequest {
  sessionId: string;
  deviceId: string;
  scanResults: {
    openPorts?: Array<{
      port: number;
      service?: string;
      version?: string;
    }>;
    vulnerabilities?: Array<{
      id: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      description: string;
    }>;
    certificates?: Array<{
      domain: string;
      issuer: string;
      expiresAt: string;
      valid: boolean;
    }>;
  };
  complianceRequirements?: string[];
}

// MCP Tools Response
export interface MCPToolsResponse {
  tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    requiresApproval: boolean;
    category: string;
  }>;
  categories: Record<string, number>;
  totalTools: number;
}

// SSE Message Types
export interface SSEMessage {
  type?: string;
  data: unknown;
  event?: string;
  id?: string;
  retry?: number;
}

// Approval Response
export interface ApprovalActionRequest {
  approvalId: string;
  action: 'approve' | 'deny';
  approverId: string;
  reason?: string;
}
