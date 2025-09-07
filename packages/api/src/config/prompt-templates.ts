/**
 * Pre-defined prompt templates for the Claude Code SDK integration
 * These templates are used for network diagnostics and troubleshooting
 */

export interface PromptTemplateDefinition {
  name: string;
  description: string;
  template: string;
  variables: string[];
  category: string;
  examples?: Record<string, string>;
}

export const DEFAULT_PROMPT_TEMPLATES: PromptTemplateDefinition[] = [
  {
    name: 'network-diagnostics',
    description:
      'Analyze network connectivity issues and provide diagnostic steps',
    category: 'diagnostics',
    variables: ['issue', 'device', 'symptoms', 'duration'],
    template: `You are an expert network engineer analyzing a connectivity issue.

Issue Description: {{issue}}
Affected Device: {{device}}
Symptoms: {{symptoms}}
Duration: {{duration}}

Please provide:
1. Initial diagnostic steps to identify the root cause
2. Command-line tools or tests to run on the device
3. Potential causes ranked by likelihood
4. Recommended remediation steps
5. Preventive measures to avoid recurrence

Focus on practical, actionable steps that can be executed remotely through the device agent.`,
    examples: {
      issue: 'Internet connection is intermittently dropping',
      device: 'Router-01 (192.168.1.1)',
      symptoms: 'Connections drop every 10-15 minutes, affecting all users',
      duration: 'Started 2 hours ago',
    },
  },
  {
    name: 'slow-connection-analysis',
    description: 'Investigate and resolve slow network performance',
    category: 'performance',
    variables: [
      'current_speed',
      'expected_speed',
      'affected_services',
      'device',
    ],
    template: `Analyze slow network performance issue:

Current Speed: {{current_speed}}
Expected Speed: {{expected_speed}}
Affected Services: {{affected_services}}
Device: {{device}}

Provide a systematic approach to:
1. Measure and benchmark current performance
2. Identify bottlenecks (bandwidth, latency, packet loss)
3. Check for congestion or QoS issues
4. Analyze traffic patterns and top consumers
5. Suggest optimization strategies

Include specific commands for the device agent to execute.`,
  },
  {
    name: 'dns-troubleshooting',
    description: 'Diagnose and fix DNS resolution problems',
    category: 'diagnostics',
    variables: ['domain', 'error_message', 'dns_servers', 'device'],
    template: `Troubleshoot DNS resolution issue:

Domain: {{domain}}
Error Message: {{error_message}}
Configured DNS Servers: {{dns_servers}}
Device: {{device}}

Diagnostic approach:
1. Verify DNS server connectivity
2. Test resolution with different DNS servers
3. Check DNS cache and flush if needed
4. Analyze DNS query path and response times
5. Identify if issue is domain-specific or general

Provide commands for testing and resolution.`,
  },
  {
    name: 'connectivity-test-suite',
    description: 'Run comprehensive connectivity tests',
    category: 'testing',
    variables: ['target_hosts', 'test_types', 'device'],
    template: `Execute connectivity test suite:

Target Hosts: {{target_hosts}}
Test Types: {{test_types}}
Device: {{device}}

Perform the following tests:
1. ICMP ping tests with statistics
2. TCP port connectivity checks
3. Traceroute analysis
4. MTU discovery
5. Bandwidth testing if applicable

Format results in a clear, actionable report with pass/fail status and recommendations.`,
  },
  {
    name: 'device-configuration-review',
    description: 'Review and optimize device configuration',
    category: 'configuration',
    variables: ['device_type', 'device_name', 'config_areas', 'objectives'],
    template: `Review device configuration:

Device Type: {{device_type}}
Device Name: {{device_name}}
Configuration Areas: {{config_areas}}
Objectives: {{objectives}}

Analyze:
1. Current configuration against best practices
2. Security settings and vulnerabilities
3. Performance optimization opportunities
4. Redundancy and failover configuration
5. Compliance with network policies

Provide specific configuration changes with rationale.`,
  },
  {
    name: 'security-assessment',
    description: 'Perform security assessment on network device',
    category: 'security',
    variables: ['device', 'scope', 'compliance_requirements'],
    template: `Conduct security assessment:

Device: {{device}}
Assessment Scope: {{scope}}
Compliance Requirements: {{compliance_requirements}}

Evaluate:
1. Open ports and services
2. Authentication and access controls
3. Encryption and secure protocols
4. Firmware/software versions and patches
5. Security logs and monitoring

Identify vulnerabilities and provide remediation steps prioritized by risk level.`,
  },
  {
    name: 'wireless-diagnostics',
    description: 'Diagnose wireless network issues',
    category: 'wireless',
    variables: ['ssid', 'issue', 'affected_clients', 'access_point'],
    template: `Diagnose wireless network issue:

SSID: {{ssid}}
Issue: {{issue}}
Affected Clients: {{affected_clients}}
Access Point: {{access_point}}

Investigate:
1. Signal strength and quality metrics
2. Channel utilization and interference
3. Authentication and association issues
4. Roaming and handoff problems
5. Capacity and client distribution

Provide recommendations for optimal wireless performance.`,
  },
  {
    name: 'vpn-troubleshooting',
    description: 'Troubleshoot VPN connectivity issues',
    category: 'vpn',
    variables: ['vpn_type', 'error', 'client_info', 'server_endpoint'],
    template: `Troubleshoot VPN connection:

VPN Type: {{vpn_type}}
Error: {{error}}
Client Information: {{client_info}}
Server Endpoint: {{server_endpoint}}

Debug:
1. Authentication and credentials
2. Network connectivity to VPN server
3. Firewall and NAT traversal
4. Protocol-specific issues
5. Certificate validation (if applicable)

Provide step-by-step resolution with fallback options.`,
  },
  {
    name: 'bandwidth-analysis',
    description: 'Analyze bandwidth usage and patterns',
    category: 'performance',
    variables: ['interface', 'time_period', 'threshold', 'device'],
    template: `Analyze bandwidth utilization:

Interface: {{interface}}
Time Period: {{time_period}}
Alert Threshold: {{threshold}}
Device: {{device}}

Analysis tasks:
1. Current bandwidth utilization
2. Top talkers and applications
3. Traffic patterns and trends
4. Anomaly detection
5. Capacity planning recommendations

Generate actionable insights for optimization.`,
  },
  {
    name: 'incident-response',
    description: 'Respond to network incident or outage',
    category: 'incident',
    variables: ['incident_type', 'impact', 'start_time', 'affected_services'],
    template: `Respond to network incident:

Incident Type: {{incident_type}}
Impact: {{impact}}
Start Time: {{start_time}}
Affected Services: {{affected_services}}

Immediate actions:
1. Assess current status and scope
2. Identify root cause
3. Implement temporary workarounds
4. Execute permanent fix
5. Document timeline and actions

Prioritize service restoration while collecting diagnostic data.`,
  },
  {
    name: 'approval-request',
    description: 'Request approval for network changes',
    category: 'approval',
    variables: ['action', 'device', 'risk_level', 'rollback_plan'],
    template: `Request approval for network action:

Proposed Action: {{action}}
Target Device: {{device}}
Risk Level: {{risk_level}}
Rollback Plan: {{rollback_plan}}

Please review the proposed action and its potential impact. The action will:
1. Make the specified changes to the device
2. May cause temporary service disruption
3. Can be rolled back using the provided plan

Do you approve this action? Please respond with APPROVE or REJECT.`,
  },
];

/**
 * Get default templates by category
 */
export function getTemplatesByCategory(
  category: string
): PromptTemplateDefinition[] {
  return DEFAULT_PROMPT_TEMPLATES.filter(t => t.category === category);
}

/**
 * Get all unique categories
 */
export function getTemplateCategories(): string[] {
  const categories = new Set(DEFAULT_PROMPT_TEMPLATES.map(t => t.category));
  return Array.from(categories);
}

/**
 * Find template by name
 */
export function findTemplateByName(
  name: string
): PromptTemplateDefinition | undefined {
  return DEFAULT_PROMPT_TEMPLATES.find(t => t.name === name);
}
