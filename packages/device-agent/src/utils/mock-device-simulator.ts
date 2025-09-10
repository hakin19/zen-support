import { EventEmitter } from 'events';

import type { DiagnosticCommand, DiagnosticResult } from '../types.js';

/**
 * Mock Device Simulator for testing device behavior without real hardware
 * Simulates network diagnostics, system metrics, and command execution
 */
export class MockDeviceSimulator extends EventEmitter {
  private cpuUsage = 20; // Starting CPU usage
  private memoryUsage = 512; // MB
  private uptime = 0; // seconds
  private deviceId: string;
  private commandHistory: DiagnosticCommand[] = [];
  private networkLatency = 50; // ms
  private packetLoss = 0; // percentage
  private intervalIds: NodeJS.Timeout[] = [];

  constructor(deviceId: string) {
    super();
    this.deviceId = deviceId;
    this.startSimulation();
  }

  private startSimulation(): void {
    // Simulate changing metrics every 5 seconds
    this.intervalIds.push(
      setInterval(() => {
        this.updateMetrics();
      }, 5000)
    );

    // Simulate uptime counter
    this.intervalIds.push(
      setInterval(() => {
        this.uptime++;
      }, 1000)
    );
  }

  private updateMetrics(): void {
    // Simulate CPU usage fluctuation (15-35%)
    this.cpuUsage = 15 + Math.random() * 20;

    // Simulate memory usage fluctuation (450-650 MB)
    this.memoryUsage = 450 + Math.random() * 200;

    // Simulate network latency variation (20-100ms)
    this.networkLatency = 20 + Math.random() * 80;

    // Simulate occasional packet loss (0-2%)
    this.packetLoss = Math.random() < 0.9 ? 0 : Math.random() * 2;

    this.emit('metrics:updated', this.getMetrics());
  }

  getMetrics(): {
    cpu: number;
    memory: number;
    uptime: number;
    network: {
      latency: number;
      packetLoss: number;
    };
  } {
    return {
      cpu: Math.round(this.cpuUsage * 100) / 100,
      memory: Math.round(this.memoryUsage),
      uptime: this.uptime,
      network: {
        latency: Math.round(this.networkLatency),
        packetLoss: Math.round(this.packetLoss * 100) / 100,
      },
    };
  }

  async executeCommand(command: DiagnosticCommand): Promise<DiagnosticResult> {
    this.commandHistory.push(command);
    this.emit('command:executing', command);

    // Simulate command execution delay (100-500ms)
    const executionTime = 100 + Math.random() * 400;
    await this.delay(executionTime);

    const result = this.generateMockResult(command, executionTime);
    this.emit('command:completed', result);
    return result;
  }

  private generateMockResult(
    command: DiagnosticCommand,
    executionTime: number
  ): DiagnosticResult {
    const mockResults: Record<string, unknown> = {};

    switch (command.type) {
      case 'ping':
        mockResults.output = this.generatePingOutput(
          command.payload?.target ?? '8.8.8.8'
        );
        break;

      case 'traceroute':
        mockResults.output = this.generateTracerouteOutput(
          command.payload?.target ?? '8.8.8.8'
        );
        break;

      case 'dns':
        mockResults.output = this.generateDnsOutput(
          command.payload?.domain ?? 'example.com'
        );
        break;

      case 'port_check':
        mockResults.output = this.generatePortCheckOutput(
          command.payload?.host ?? 'localhost',
          command.payload?.port ?? 80
        );
        break;

      case 'network_scan':
        mockResults.output = this.generateNetworkScanOutput();
        break;

      case 'bandwidth_test':
        mockResults.output = this.generateBandwidthTestOutput();
        break;

      default:
        mockResults.output = `Mock execution of command: ${command.type}`;
        mockResults.data = {
          message: 'This is a simulated result',
          timestamp: new Date().toISOString(),
        };
    }

    return {
      commandId: command.id,
      deviceId: this.deviceId,
      status: Math.random() > 0.9 ? 'failed' : 'completed',
      results: mockResults,
      executedAt: new Date().toISOString(),
      duration: Math.round(executionTime),
    };
  }

  private generatePingOutput(target: string): string {
    const loss = this.packetLoss;
    const latency = this.networkLatency;
    const jitter = Math.random() * 5;

    return `PING ${target} (${this.generateMockIP()}): 56 data bytes
64 bytes from ${target}: icmp_seq=0 ttl=64 time=${(latency + jitter).toFixed(1)} ms
64 bytes from ${target}: icmp_seq=1 ttl=64 time=${(latency - jitter).toFixed(1)} ms
64 bytes from ${target}: icmp_seq=2 ttl=64 time=${(latency + jitter * 0.5).toFixed(1)} ms
64 bytes from ${target}: icmp_seq=3 ttl=64 time=${(latency - jitter * 0.5).toFixed(1)} ms

--- ${target} ping statistics ---
4 packets transmitted, ${loss > 0 ? 3 : 4} packets received, ${loss.toFixed(1)}% packet loss
round-trip min/avg/max/stddev = ${(latency - jitter).toFixed(1)}/${latency.toFixed(1)}/${(latency + jitter).toFixed(1)}/${jitter.toFixed(1)} ms`;
  }

  private generateTracerouteOutput(target: string): string {
    const hops = Math.floor(8 + Math.random() * 7); // 8-15 hops
    let output = `traceroute to ${target} (${this.generateMockIP()}), 30 hops max, 60 byte packets\n`;

    for (let i = 1; i <= hops; i++) {
      const hopLatency = (i * 10 + Math.random() * 20).toFixed(1);
      if (Math.random() > 0.1) {
        // 90% chance of successful hop
        output += ` ${i}  ${this.generateMockHostname(i)} (${this.generateMockIP()})  ${hopLatency} ms\n`;
      } else {
        // 10% chance of timeout
        output += ` ${i}  * * *\n`;
      }
    }

    return output;
  }

  private generateDnsOutput(domain: string): string {
    const ips = [
      this.generateMockIP(),
      this.generateMockIP(),
      this.generateMockIP(),
    ];

    return `; <<>> DiG 9.16.1 <<>> ${domain}
;; global options: +cmd
;; Got answer:
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 12345
;; flags: qr rd ra; QUERY: 1, ANSWER: ${ips.length}, AUTHORITY: 0, ADDITIONAL: 1

;; QUESTION SECTION:
;${domain}.			IN	A

;; ANSWER SECTION:
${ips.map(ip => `${domain}.		300	IN	A	${ip}`).join('\n')}

;; Query time: ${Math.round(this.networkLatency)} msec
;; SERVER: 8.8.8.8#53(8.8.8.8)
;; WHEN: ${new Date().toUTCString()}
;; MSG SIZE  rcvd: ${60 + ips.length * 16}`;
  }

  private generatePortCheckOutput(host: string, port: number): string {
    const isOpen = Math.random() > 0.2; // 80% chance port is open
    if (isOpen) {
      return `Port ${port} on ${host} is OPEN
Connection successful in ${this.networkLatency}ms`;
    } else {
      return `Port ${port} on ${host} is CLOSED or FILTERED
Connection failed: Connection refused`;
    }
  }

  private generateNetworkScanOutput(): string {
    const devices = Math.floor(3 + Math.random() * 5); // 3-8 devices
    let output = 'Network Scan Results:\n';
    output += `${'='.repeat(40)}\n`;

    for (let i = 0; i < devices; i++) {
      const ip = `192.168.1.${100 + i}`;
      const mac = this.generateMockMAC();
      const hostname = `device-${i + 1}.local`;
      output += `\nHost: ${ip}\n`;
      output += `  MAC: ${mac}\n`;
      output += `  Hostname: ${hostname}\n`;
      output += `  Status: UP\n`;
      output += `  Latency: ${(Math.random() * 10).toFixed(1)}ms\n`;
    }

    return output;
  }

  private generateBandwidthTestOutput(): string {
    const downloadSpeed = 50 + Math.random() * 450; // 50-500 Mbps
    const uploadSpeed = 10 + Math.random() * 90; // 10-100 Mbps
    const jitter = Math.random() * 5;

    return `Bandwidth Test Results:
======================
Server: speedtest.net
Location: Nearby City

Download: ${downloadSpeed.toFixed(2)} Mbps
Upload: ${uploadSpeed.toFixed(2)} Mbps
Ping: ${this.networkLatency.toFixed(1)} ms
Jitter: ${jitter.toFixed(1)} ms
Packet Loss: ${this.packetLoss.toFixed(2)}%

Test completed successfully`;
  }

  private generateMockIP(): string {
    return `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
  }

  private generateMockMAC(): string {
    const hex = '0123456789ABCDEF';
    let mac = '';
    for (let i = 0; i < 6; i++) {
      if (i > 0) mac += ':';
      mac += hex[Math.floor(Math.random() * 16)];
      mac += hex[Math.floor(Math.random() * 16)];
    }
    return mac;
  }

  private generateMockHostname(hop: number): string {
    const providers = ['router', 'gateway', 'core', 'edge', 'isp'];
    const domains = ['local', 'net', 'com', 'provider.net'];
    return `${providers[Math.floor(Math.random() * providers.length)]}-${hop}.${domains[Math.floor(Math.random() * domains.length)]}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getCommandHistory(): DiagnosticCommand[] {
    return [...this.commandHistory];
  }

  reset(): void {
    this.commandHistory = [];
    this.cpuUsage = 20;
    this.memoryUsage = 512;
    this.uptime = 0;
    this.networkLatency = 50;
    this.packetLoss = 0;
    this.emit('simulator:reset');
  }

  /**
   * Cleanup method to clear all intervals and remove listeners
   * Should be called when the simulator is no longer needed
   */
  destroy(): void {
    // Clear all intervals
    this.intervalIds.forEach(id => clearInterval(id));
    this.intervalIds = [];

    // Remove all event listeners
    this.removeAllListeners();

    // Reset state
    this.reset();
  }
}
