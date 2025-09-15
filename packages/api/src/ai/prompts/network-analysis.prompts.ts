/**
 * Network Analysis Prompt Templates
 * These templates are used by the AI Orchestrator for network diagnostics and analysis
 */

/**
 * Base interface for all prompt templates
 */
export interface BasePromptTemplate {
  id: string;
  name: string;
  description: string;
  version: string;
  category:
    | 'diagnostics'
    | 'remediation'
    | 'monitoring'
    | 'security'
    | 'performance';
  riskLevel: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
}

/**
 * Network diagnostic analysis prompt
 */
export interface NetworkDiagnosticPrompt extends BasePromptTemplate {
  type: 'network-diagnostic';
  input: {
    deviceId: string;
    deviceType: string;
    symptoms: string[];
    diagnosticData: {
      pingTests?: PingTestResult[];
      traceroute?: TracerouteResult[];
      interfaceStatus?: InterfaceStatus[];
      arpTable?: ArpEntry[];
      routingTable?: RouteEntry[];
      dnsQueries?: DnsQueryResult[];
    };
    historicalData?: {
      previousIncidents?: string[];
      recentChanges?: string[];
      performanceMetrics?: PerformanceMetric[];
    };
  };
  context?: {
    customerProfile?: string;
    networkTopology?: string;
    criticalServices?: string[];
  };
}

/**
 * Script generation prompt for remediation
 */
export interface RemediationScriptPrompt extends BasePromptTemplate {
  type: 'remediation-script';
  input: {
    issue: string;
    rootCause: string;
    targetDevice: {
      id: string;
      type: string;
      osVersion: string;
      capabilities: string[];
    };
    proposedActions: RemediationAction[];
    constraints: {
      maxExecutionTime: number;
      rollbackRequired: boolean;
      maintenanceWindow?: {
        start: string;
        end: string;
      };
    };
  };
  safetyChecks: {
    preConditions: string[];
    postConditions: string[];
    rollbackScript?: string;
  };
}

/**
 * Performance analysis prompt
 */
export interface PerformanceAnalysisPrompt extends BasePromptTemplate {
  type: 'performance-analysis';
  input: {
    metrics: {
      bandwidth: BandwidthMetric[];
      latency: LatencyMetric[];
      packetLoss: PacketLossMetric[];
      jitter?: JitterMetric[];
    };
    baseline?: {
      expectedBandwidth: number;
      acceptableLatency: number;
      maxPacketLoss: number;
    };
    timeRange: {
      start: string;
      end: string;
    };
  };
  analysisType: 'real-time' | 'historical' | 'predictive';
}

/**
 * Security assessment prompt
 */
export interface SecurityAssessmentPrompt extends BasePromptTemplate {
  type: 'security-assessment';
  input: {
    scanResults: {
      openPorts: PortScanResult[];
      vulnerabilities?: VulnerabilityResult[];
      configurationIssues?: ConfigIssue[];
    };
    complianceRequirements?: string[];
    threatIntelligence?: {
      knownThreats: string[];
      recentAttacks: string[];
    };
  };
  assessmentScope: 'quick' | 'standard' | 'comprehensive';
}

// Supporting type definitions

export interface PingTestResult {
  target: string;
  packetsTransmitted: number;
  packetsReceived: number;
  packetLoss: number;
  minRtt: number;
  avgRtt: number;
  maxRtt: number;
  timestamp: string;
}

export interface TracerouteResult {
  target: string;
  hops: Array<{
    hopNumber: number;
    address: string;
    hostname?: string;
    rtt: number[];
  }>;
  timestamp: string;
}

export interface InterfaceStatus {
  name: string;
  status: 'up' | 'down';
  ipAddress?: string;
  macAddress: string;
  speed?: number;
  duplex?: 'full' | 'half';
  errors: {
    rx: number;
    tx: number;
  };
}

export interface ArpEntry {
  ipAddress: string;
  macAddress: string;
  interface: string;
  state: string;
}

export interface RouteEntry {
  destination: string;
  gateway: string;
  interface: string;
  metric: number;
  flags: string[];
}

export interface DnsQueryResult {
  domain: string;
  queryType: string;
  response?: string[];
  responseTime: number;
  success: boolean;
}

export interface PerformanceMetric {
  metric: string;
  value: number;
  unit: string;
  timestamp: string;
}

export interface RemediationAction {
  id: string;
  description: string;
  command: string;
  expectedOutcome: string;
  riskLevel: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
}

export interface BandwidthMetric {
  interface: string;
  inbound: number;
  outbound: number;
  timestamp: string;
}

export interface LatencyMetric {
  source: string;
  destination: string;
  latency: number;
  timestamp: string;
}

export interface PacketLossMetric {
  interface: string;
  lossPercentage: number;
  timestamp: string;
}

export interface JitterMetric {
  source: string;
  destination: string;
  jitter: number;
  timestamp: string;
}

export interface PortScanResult {
  port: number;
  protocol: 'tcp' | 'udp';
  state: 'open' | 'closed' | 'filtered';
  service?: string;
  version?: string;
}

export interface VulnerabilityResult {
  cveId?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedComponent: string;
  remediation?: string;
}

export interface ConfigIssue {
  type: string;
  description: string;
  recommendation: string;
  severity: 'low' | 'medium' | 'high';
}

/**
 * Prompt template factory
 */
export class PromptTemplateFactory {
  /**
   * Create a network diagnostic prompt
   */
  static createDiagnosticPrompt(
    input: NetworkDiagnosticPrompt['input']
  ): NetworkDiagnosticPrompt {
    return {
      id: `diag-${Date.now()}`,
      name: 'Network Diagnostic Analysis',
      description: 'Analyze network issues and identify root causes',
      version: '1.0.0',
      category: 'diagnostics',
      type: 'network-diagnostic',
      riskLevel: 'low',
      requiresApproval: false,
      input,
    };
  }

  /**
   * Create a remediation script prompt
   */
  static createRemediationPrompt(
    input: RemediationScriptPrompt['input'],
    safetyChecks: RemediationScriptPrompt['safetyChecks']
  ): RemediationScriptPrompt {
    return {
      id: `remed-${Date.now()}`,
      name: 'Remediation Script Generation',
      description: 'Generate safe remediation scripts for network issues',
      version: '1.0.0',
      category: 'remediation',
      type: 'remediation-script',
      riskLevel: 'high',
      requiresApproval: true,
      input,
      safetyChecks,
    };
  }

  /**
   * Create a performance analysis prompt
   */
  static createPerformancePrompt(
    input: PerformanceAnalysisPrompt['input'],
    analysisType: PerformanceAnalysisPrompt['analysisType'] = 'real-time'
  ): PerformanceAnalysisPrompt {
    return {
      id: `perf-${Date.now()}`,
      name: 'Performance Analysis',
      description: 'Analyze network performance metrics',
      version: '1.0.0',
      category: 'performance',
      type: 'performance-analysis',
      riskLevel: 'low',
      requiresApproval: false,
      input,
      analysisType,
    };
  }

  /**
   * Create a security assessment prompt
   */
  static createSecurityPrompt(
    input: SecurityAssessmentPrompt['input'],
    scope: SecurityAssessmentPrompt['assessmentScope'] = 'standard'
  ): SecurityAssessmentPrompt {
    return {
      id: `sec-${Date.now()}`,
      name: 'Security Assessment',
      description: 'Assess network security posture',
      version: '1.0.0',
      category: 'security',
      type: 'security-assessment',
      riskLevel: 'medium',
      requiresApproval: false,
      input,
      assessmentScope: scope,
    };
  }
}

/**
 * Prompt validation utilities
 */
export class PromptValidator {
  /**
   * Validate diagnostic data completeness
   */
  static validateDiagnosticData(
    data: NetworkDiagnosticPrompt['input']['diagnosticData']
  ): { valid: boolean; missing: string[] } {
    const missing: string[] = [];

    if (!data.pingTests || data.pingTests.length === 0) {
      missing.push('pingTests');
    }
    if (!data.interfaceStatus || data.interfaceStatus.length === 0) {
      missing.push('interfaceStatus');
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Validate remediation safety checks
   */
  static validateSafetyChecks(
    checks: RemediationScriptPrompt['safetyChecks']
  ): boolean {
    return checks.preConditions.length > 0 && checks.postConditions.length > 0;
  }
}
