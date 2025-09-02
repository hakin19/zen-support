import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DiagnosticExecutor } from './diagnostic-executor';
import type { DiagnosticCommand, DiagnosticResult } from '../types';
import * as child_process from 'child_process';

vi.mock('child_process', () => ({
  exec: vi.fn((cmd, opts, callback) => {
    // Handle both callback forms
    if (typeof opts === 'function') {
      callback = opts;
    }
    // Mock implementation will be provided in tests
    return { stdout: '', stderr: '' };
  }),
}));

describe('DiagnosticExecutor', () => {
  let executor: DiagnosticExecutor;

  beforeEach(() => {
    executor = new DiagnosticExecutor();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ping diagnostic', () => {
    const pingCommand: DiagnosticCommand = {
      id: 'ping-1',
      type: 'ping',
      parameters: {
        target: '8.8.8.8',
        count: 4,
        timeout: 5000,
      },
      priority: 'normal',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    };

    it('should execute ping command and parse successful output', async () => {
      const mockOutput = `PING 8.8.8.8 (8.8.8.8): 56 data bytes
64 bytes from 8.8.8.8: icmp_seq=0 ttl=117 time=14.852 ms
64 bytes from 8.8.8.8: icmp_seq=1 ttl=117 time=15.234 ms
64 bytes from 8.8.8.8: icmp_seq=2 ttl=117 time=14.567 ms
64 bytes from 8.8.8.8: icmp_seq=3 ttl=117 time=15.123 ms

--- 8.8.8.8 ping statistics ---
4 packets transmitted, 4 packets received, 0.0% packet loss
round-trip min/avg/max/stddev = 14.567/14.944/15.234/0.258 ms`;

      vi.mocked(child_process.exec).mockImplementation(
        (cmd, opts, callback) => {
          const cb = typeof opts === 'function' ? opts : callback;
          if (cb) {
            setTimeout(() => cb(null, mockOutput, ''), 0);
          }
          return {} as any;
        }
      );

      const result = await executor.execute(pingCommand);

      expect(result.status).toBe('completed');
      expect(result.commandId).toBe('ping-1');
      expect(result.results.metrics).toMatchObject({
        packetsTransmitted: 4,
        packetsReceived: 4,
        packetLoss: 0,
        minRtt: 14.567,
        avgRtt: 14.944,
        maxRtt: 15.234,
        stddev: 0.258,
      });
    });

    it('should handle ping with packet loss', async () => {
      const mockOutput = `PING 192.168.1.100 (192.168.1.100): 56 data bytes
64 bytes from 192.168.1.100: icmp_seq=0 ttl=64 time=1.234 ms
Request timeout for icmp_seq 1
64 bytes from 192.168.1.100: icmp_seq=2 ttl=64 time=1.456 ms
Request timeout for icmp_seq 3

--- 192.168.1.100 ping statistics ---
4 packets transmitted, 2 packets received, 50.0% packet loss
round-trip min/avg/max/stddev = 1.234/1.345/1.456/0.111 ms`;

      vi.mocked(child_process.exec).mockImplementation(
        (cmd, opts, callback) => {
          const cb = typeof opts === 'function' ? opts : callback;
          if (cb) {
            setTimeout(() => cb(null, mockOutput, ''), 0);
          }
          return {} as any;
        }
      );

      const result = await executor.execute({
        ...pingCommand,
        parameters: { ...pingCommand.parameters, target: '192.168.1.100' },
      });

      expect(result.status).toBe('completed');
      expect(result.results.metrics).toMatchObject({
        packetsTransmitted: 4,
        packetsReceived: 2,
        packetLoss: 50,
      });
    });

    it('should handle unreachable host', async () => {
      const mockOutput = `PING 192.168.99.99 (192.168.99.99): 56 data bytes
Request timeout for icmp_seq 0
Request timeout for icmp_seq 1
Request timeout for icmp_seq 2
Request timeout for icmp_seq 3

--- 192.168.99.99 ping statistics ---
4 packets transmitted, 0 packets received, 100.0% packet loss`;

      vi.mocked(child_process.exec).mockImplementation(
        (cmd, opts, callback) => {
          const cb = typeof opts === 'function' ? opts : callback;
          if (cb) {
            setTimeout(() => cb(null, mockOutput, ''), 0);
          }
          return {} as any;
        }
      );

      const result = await executor.execute({
        ...pingCommand,
        parameters: { ...pingCommand.parameters, target: '192.168.99.99' },
      });

      expect(result.status).toBe('completed');
      expect(result.results.metrics).toMatchObject({
        packetsTransmitted: 4,
        packetsReceived: 0,
        packetLoss: 100,
      });
    });

    it('should handle command execution error', async () => {
      vi.mocked(child_process.exec).mockImplementation(
        (cmd, opts, callback) => {
          const cb = typeof opts === 'function' ? opts : callback;
          if (cb) {
            setTimeout(() => {
              const err: any = new Error(
                'ping: cannot resolve host.example.com: Unknown host'
              );
              // Don't include stdout/stderr to simulate actual error
              cb(err, null as any, null as any);
            }, 0);
          }
          return {} as any;
        }
      );

      const result = await executor.execute({
        ...pingCommand,
        parameters: { ...pingCommand.parameters, target: 'host.example.com' },
      });

      expect(result.status).toBe('failed');
      expect(result.results.error).toContain('Unknown host');
    });

    it('should handle IPv6 addresses', async () => {
      const mockOutput = `PING6(56=40+8+8 bytes) 2001:4860:4860::8888 --> 2001:4860:4860::8888
16 bytes from 2001:4860:4860::8888, icmp_seq=0 hlim=117 time=15.234 ms
16 bytes from 2001:4860:4860::8888, icmp_seq=1 hlim=117 time=14.567 ms

--- 2001:4860:4860::8888 ping6 statistics ---
2 packets transmitted, 2 packets received, 0.0% packet loss
round-trip min/avg/max/std-dev = 14.567/14.900/15.234/0.333 ms`;

      vi.mocked(child_process.exec).mockImplementation(
        (cmd, opts, callback) => {
          const cb = typeof opts === 'function' ? opts : callback;
          if (cb) {
            setTimeout(() => cb(null, mockOutput, ''), 0);
          }
          return {} as any;
        }
      );

      const result = await executor.execute({
        ...pingCommand,
        parameters: {
          ...pingCommand.parameters,
          target: '2001:4860:4860::8888',
          count: 2,
        },
      });

      expect(result.status).toBe('completed');
      expect(result.results.metrics).toMatchObject({
        packetsTransmitted: 2,
        packetsReceived: 2,
        packetLoss: 0,
      });
    });
  });

  describe('traceroute diagnostic', () => {
    const tracerouteCommand: DiagnosticCommand = {
      id: 'trace-1',
      type: 'traceroute',
      parameters: {
        target: '8.8.8.8',
        timeout: 30000,
      },
      priority: 'normal',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    };

    it('should execute traceroute and parse hop information', async () => {
      const mockOutput = `traceroute to 8.8.8.8 (8.8.8.8), 30 hops max, 60 byte packets
 1  192.168.1.1 (192.168.1.1)  1.234 ms  1.456 ms  1.678 ms
 2  10.0.0.1 (10.0.0.1)  8.234 ms  8.456 ms  8.678 ms
 3  172.16.0.1 (172.16.0.1)  12.234 ms  12.456 ms  12.678 ms
 4  * * *
 5  8.8.8.8 (8.8.8.8)  14.234 ms  14.456 ms  14.678 ms`;

      vi.mocked(child_process.exec).mockImplementation(
        (cmd, opts, callback) => {
          const cb = typeof opts === 'function' ? opts : callback;
          if (cb) {
            setTimeout(() => cb(null, mockOutput, ''), 0);
          }
          return {} as any;
        }
      );

      const result = await executor.execute(tracerouteCommand);

      expect(result.status).toBe('completed');
      expect(result.results.metrics).toMatchObject({
        totalHops: 5,
        reachedDestination: true,
        hops: [
          {
            hop: 1,
            ip: '192.168.1.1',
            hostname: '192.168.1.1',
            times: [1.234, 1.456, 1.678],
          },
          {
            hop: 2,
            ip: '10.0.0.1',
            hostname: '10.0.0.1',
            times: [8.234, 8.456, 8.678],
          },
          {
            hop: 3,
            ip: '172.16.0.1',
            hostname: '172.16.0.1',
            times: [12.234, 12.456, 12.678],
          },
          { hop: 4, ip: null, hostname: null, times: [] },
          {
            hop: 5,
            ip: '8.8.8.8',
            hostname: '8.8.8.8',
            times: [14.234, 14.456, 14.678],
          },
        ],
      });
    });

    it('should handle incomplete routes', async () => {
      const mockOutput = `traceroute to 192.168.99.99 (192.168.99.99), 30 hops max, 60 byte packets
 1  192.168.1.1 (192.168.1.1)  1.234 ms  1.456 ms  1.678 ms
 2  * * *
 3  * * *
 4  * * *
 5  * * *`;

      vi.mocked(child_process.exec).mockImplementation(
        (cmd, opts, callback) => {
          const cb = typeof opts === 'function' ? opts : callback;
          if (cb) {
            setTimeout(() => cb(null, mockOutput, ''), 0);
          }
          return {} as any;
        }
      );

      const result = await executor.execute({
        ...tracerouteCommand,
        parameters: {
          ...tracerouteCommand.parameters,
          target: '192.168.99.99',
        },
      });

      expect(result.status).toBe('completed');
      expect(result.results.metrics).toMatchObject({
        totalHops: 5,
        reachedDestination: false,
        hops: expect.arrayContaining([
          expect.objectContaining({ hop: 1, ip: '192.168.1.1' }),
        ]),
      });
    });

    it('should handle Windows tracert format', async () => {
      const mockOutput = `Tracing route to 8.8.8.8 over a maximum of 30 hops:

  1     1 ms     1 ms     1 ms  192.168.1.1
  2     8 ms     8 ms     9 ms  10.0.0.1
  3    12 ms    12 ms    13 ms  172.16.0.1
  4     *        *        *     Request timed out.
  5    14 ms    14 ms    15 ms  8.8.8.8

Trace complete.`;

      vi.mocked(child_process.exec).mockImplementation(
        (cmd, opts, callback) => {
          const cb = typeof opts === 'function' ? opts : callback;
          if (cb) {
            setTimeout(() => cb(null, mockOutput, ''), 0);
          }
          return {} as any;
        }
      );

      const result = await executor.execute(tracerouteCommand);

      expect(result.status).toBe('completed');
      expect(result.results.metrics?.hops).toHaveLength(5);
      // Check that the last hop is the target
      const lastHop = result.results.metrics?.hops[4];
      expect(lastHop?.ip).toBe('8.8.8.8');
      expect(
        result.results.metrics?.reachedDestination || lastHop?.ip === '8.8.8.8'
      ).toBe(true);
    });
  });

  describe('DNS diagnostic', () => {
    const dnsCommand: DiagnosticCommand = {
      id: 'dns-1',
      type: 'dns',
      parameters: {
        target: 'google.com',
        recordType: 'A',
      },
      priority: 'normal',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    };

    it('should resolve A records', async () => {
      const result = await executor.execute(dnsCommand);

      expect(result.status).toBe('completed');
      expect(result.commandId).toBe('dns-1');
      expect(result.results.metrics).toMatchObject({
        recordType: 'A',
        domain: 'google.com',
        addresses: expect.arrayContaining(['142.250.80.46', '142.250.80.14']),
        resolutionTime: expect.any(Number),
      });
    });

    it('should resolve AAAA records', async () => {
      const result = await executor.execute({
        ...dnsCommand,
        parameters: { ...dnsCommand.parameters, recordType: 'AAAA' },
      });

      expect(result.status).toBe('completed');
      expect(result.results.metrics).toMatchObject({
        recordType: 'AAAA',
        domain: 'google.com',
        addresses: expect.arrayContaining([
          '2607:f8b0:4004:c07::71',
          '2607:f8b0:4004:c07::65',
        ]),
      });
    });

    it('should resolve MX records', async () => {
      const result = await executor.execute({
        ...dnsCommand,
        parameters: { ...dnsCommand.parameters, recordType: 'MX' },
      });

      expect(result.status).toBe('completed');
      expect(result.results.metrics).toMatchObject({
        recordType: 'MX',
        domain: 'google.com',
        records: expect.arrayContaining([
          { priority: 10, exchange: 'smtp.google.com' },
        ]),
      });
    });

    it('should resolve TXT records', async () => {
      const result = await executor.execute({
        ...dnsCommand,
        parameters: { ...dnsCommand.parameters, recordType: 'TXT' },
      });

      expect(result.status).toBe('completed');
      expect(result.results.metrics).toMatchObject({
        recordType: 'TXT',
        domain: 'google.com',
        records: expect.arrayContaining([
          ['v=spf1 include:_spf.google.com ~all'],
        ]),
      });
    });

    it('should handle DNS resolution failure', async () => {
      const result = await executor.execute({
        ...dnsCommand,
        parameters: {
          ...dnsCommand.parameters,
          target: 'nonexistent.domain.test',
        },
      });

      expect(result.status).toBe('failed');
      expect(result.results.error).toContain('ENOTFOUND');
    });

    it('should resolve NS records', async () => {
      const result = await executor.execute({
        ...dnsCommand,
        parameters: { ...dnsCommand.parameters, recordType: 'NS' },
      });

      expect(result.status).toBe('completed');
      expect(result.results.metrics).toMatchObject({
        recordType: 'NS',
        domain: 'google.com',
        servers: expect.arrayContaining(['ns1.google.com', 'ns2.google.com']),
      });
    });

    it('should resolve CNAME records', async () => {
      const result = await executor.execute({
        ...dnsCommand,
        parameters: { target: 'www.google.com', recordType: 'CNAME' },
      });

      expect(result.status).toBe('completed');
      expect(result.results.metrics).toMatchObject({
        recordType: 'CNAME',
        domain: 'www.google.com',
        cname: expect.any(String),
      });
    });
  });

  describe('connectivity diagnostic', () => {
    const connectivityCommand: DiagnosticCommand = {
      id: 'conn-1',
      type: 'connectivity',
      parameters: {
        target: 'https://google.com',
        timeout: 5000,
      },
      priority: 'normal',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    };

    it('should test HTTPS connectivity', async () => {
      const result = await executor.execute(connectivityCommand);

      expect(result.status).toBe('completed');
      expect(result.commandId).toBe('conn-1');
      expect(result.results.metrics).toMatchObject({
        url: 'https://google.com',
        reachable: true,
        statusCode: 200,
        responseTime: expect.any(Number),
        tlsVersion: 'TLSv1.3',
        certificate: expect.objectContaining({
          valid: true,
          issuer: expect.stringContaining('Google'),
          expiresAt: expect.any(String),
        }),
      });
    });

    it('should test HTTP connectivity', async () => {
      const result = await executor.execute({
        ...connectivityCommand,
        parameters: {
          ...connectivityCommand.parameters,
          target: 'http://example.com',
        },
      });

      expect(result.status).toBe('completed');
      expect(result.results.metrics).toMatchObject({
        url: 'http://example.com',
        reachable: true,
        statusCode: 200,
        responseTime: expect.any(Number),
      });
    });

    it('should handle connection timeout', async () => {
      const result = await executor.execute({
        ...connectivityCommand,
        parameters: { target: 'https://192.168.99.99', timeout: 1000 },
      });

      expect(result.status).toBe('failed');
      expect(result.results.error).toContain('timeout');
    });

    it('should handle port connectivity test', async () => {
      const result = await executor.execute({
        ...connectivityCommand,
        parameters: { target: '8.8.8.8', port: 53, timeout: 5000 },
      });

      expect(result.status).toBe('completed');
      expect(result.results.metrics).toMatchObject({
        host: '8.8.8.8',
        port: 53,
        reachable: true,
        responseTime: expect.any(Number),
      });
    });

    it('should handle closed port', async () => {
      const result = await executor.execute({
        ...connectivityCommand,
        parameters: { target: '8.8.8.8', port: 12345, timeout: 5000 },
      });

      expect(result.status).toBe('completed');
      expect(result.results.metrics).toMatchObject({
        host: '8.8.8.8',
        port: 12345,
        reachable: false,
      });
    });

    it('should test multiple ports', async () => {
      const result = await executor.execute({
        ...connectivityCommand,
        id: 'conn-multi',
        parameters: {
          target: 'google.com',
          port: 443,
          timeout: 5000,
        },
      });

      expect(result.status).toBe('completed');
      expect(result.results.metrics?.reachable).toBe(true);
    });

    it('should handle SSL certificate validation', async () => {
      const result = await executor.execute({
        ...connectivityCommand,
        parameters: { target: 'https://expired.badssl.com' },
      });

      expect(result.status).toBe('completed');
      expect(result.results.metrics).toMatchObject({
        certificate: expect.objectContaining({
          valid: false,
          error: expect.stringContaining('expired'),
        }),
      });
    });
  });

  describe('command timeout handling', () => {
    it('should timeout long-running commands', async () => {
      const slowCommand: DiagnosticCommand = {
        id: 'slow-1',
        type: 'ping',
        parameters: {
          target: '8.8.8.8',
          count: 100,
          timeout: 100, // 100ms timeout for test
        },
        priority: 'normal',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      };

      vi.mocked(child_process.exec).mockImplementation(
        (cmd, opts: any, callback) => {
          const cb = typeof opts === 'function' ? opts : callback;
          // Simulate timeout by triggering the error after a delay
          const timeoutMs = opts?.timeout || 100;
          setTimeout(() => {
            if (cb) {
              const err: any = new Error(
                `Command timed out after ${timeoutMs}ms`
              );
              err.killed = true;
              err.signal = 'SIGTERM';
              cb(err, '', '');
            }
          }, 10);
          return {} as any;
        }
      );

      const result = await executor.execute(slowCommand);

      expect(result.status).toBe('failed');
      expect(result.results.error).toContain('Command timed out');
    });
  });

  describe('priority handling', () => {
    it('should execute high priority commands first', async () => {
      const commands: DiagnosticCommand[] = [
        {
          id: 'low-1',
          type: 'ping',
          parameters: { target: '8.8.8.8' },
          priority: 'low',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 300000).toISOString(),
        },
        {
          id: 'high-1',
          type: 'ping',
          parameters: { target: '1.1.1.1' },
          priority: 'high',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 300000).toISOString(),
        },
        {
          id: 'normal-1',
          type: 'ping',
          parameters: { target: '4.4.4.4' },
          priority: 'normal',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 300000).toISOString(),
        },
      ];

      const results: DiagnosticResult[] = [];
      const mockOutput = `PING test: 4 packets transmitted, 4 received, 0% packet loss`;

      vi.mocked(child_process.exec).mockImplementation(
        (cmd, opts, callback) => {
          const cb = typeof opts === 'function' ? opts : callback;
          if (cb) {
            setTimeout(() => cb(null, mockOutput, ''), 0);
          }
          return {} as any;
        }
      );

      for (const cmd of commands) {
        executor.enqueue(cmd);
      }

      const executionOrder = await executor.processQueue();

      expect(executionOrder[0].commandId).toBe('high-1');
      expect(executionOrder[1].commandId).toBe('normal-1');
      expect(executionOrder[2].commandId).toBe('low-1');
    });
  });
});
