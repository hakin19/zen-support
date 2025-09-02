import { describe, it, expect } from 'vitest';
import { ResultFormatter } from './result-formatter';
import type { DiagnosticResult } from '../types';

describe('ResultFormatter', () => {
  let formatter: ResultFormatter;

  beforeEach(() => {
    formatter = new ResultFormatter();
  });

  describe('ping result formatting', () => {
    it('should format successful ping results', () => {
      const rawOutput = `PING 8.8.8.8 (8.8.8.8): 56 data bytes
64 bytes from 8.8.8.8: icmp_seq=0 ttl=117 time=14.852 ms
64 bytes from 8.8.8.8: icmp_seq=1 ttl=117 time=15.234 ms
64 bytes from 8.8.8.8: icmp_seq=2 ttl=117 time=14.567 ms
64 bytes from 8.8.8.8: icmp_seq=3 ttl=117 time=15.123 ms

--- 8.8.8.8 ping statistics ---
4 packets transmitted, 4 packets received, 0.0% packet loss
round-trip min/avg/max/stddev = 14.567/14.944/15.234/0.258 ms`;

      const formatted = formatter.formatPing(rawOutput);

      expect(formatted).toEqual({
        target: '8.8.8.8',
        packetsTransmitted: 4,
        packetsReceived: 4,
        packetLoss: 0,
        minRtt: 14.567,
        avgRtt: 14.944,
        maxRtt: 15.234,
        stddev: 0.258,
        rawOutput,
      });
    });

    it('should format ping results with packet loss', () => {
      const rawOutput = `PING 192.168.1.100 (192.168.1.100): 56 data bytes
64 bytes from 192.168.1.100: icmp_seq=0 ttl=64 time=1.234 ms
Request timeout for icmp_seq 1
64 bytes from 192.168.1.100: icmp_seq=2 ttl=64 time=1.456 ms
Request timeout for icmp_seq 3

--- 192.168.1.100 ping statistics ---
4 packets transmitted, 2 packets received, 50.0% packet loss
round-trip min/avg/max/stddev = 1.234/1.345/1.456/0.111 ms`;

      const formatted = formatter.formatPing(rawOutput);

      expect(formatted.packetLoss).toBe(50);
      expect(formatted.packetsReceived).toBe(2);
      expect(formatted.packetsTransmitted).toBe(4);
    });

    it('should handle Windows ping format', () => {
      const rawOutput = `Pinging 8.8.8.8 with 32 bytes of data:
Reply from 8.8.8.8: bytes=32 time=14ms TTL=117
Reply from 8.8.8.8: bytes=32 time=15ms TTL=117
Reply from 8.8.8.8: bytes=32 time=14ms TTL=117
Reply from 8.8.8.8: bytes=32 time=15ms TTL=117

Ping statistics for 8.8.8.8:
    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),
Approximate round trip times in milli-seconds:
    Minimum = 14ms, Maximum = 15ms, Average = 14ms`;

      const formatted = formatter.formatPing(rawOutput);

      expect(formatted).toMatchObject({
        target: '8.8.8.8',
        packetsTransmitted: 4,
        packetsReceived: 4,
        packetLoss: 0,
        minRtt: 14,
        maxRtt: 15,
        avgRtt: 14,
      });
    });
  });

  describe('traceroute result formatting', () => {
    it('should format traceroute results', () => {
      const rawOutput = `traceroute to 8.8.8.8 (8.8.8.8), 30 hops max, 60 byte packets
 1  192.168.1.1 (192.168.1.1)  1.234 ms  1.456 ms  1.678 ms
 2  10.0.0.1 (10.0.0.1)  8.234 ms  8.456 ms  8.678 ms
 3  172.16.0.1 (172.16.0.1)  12.234 ms  12.456 ms  12.678 ms
 4  * * *
 5  8.8.8.8 (8.8.8.8)  14.234 ms  14.456 ms  14.678 ms`;

      const formatted = formatter.formatTraceroute(rawOutput);

      expect(formatted).toEqual({
        target: '8.8.8.8',
        totalHops: 5,
        reachedDestination: true,
        hops: [
          {
            hop: 1,
            ip: '192.168.1.1',
            hostname: '192.168.1.1',
            times: [1.234, 1.456, 1.678],
            avgTime: expect.closeTo(1.456, 2),
          },
          {
            hop: 2,
            ip: '10.0.0.1',
            hostname: '10.0.0.1',
            times: [8.234, 8.456, 8.678],
            avgTime: expect.closeTo(8.456, 2),
          },
          {
            hop: 3,
            ip: '172.16.0.1',
            hostname: '172.16.0.1',
            times: [12.234, 12.456, 12.678],
            avgTime: expect.closeTo(12.456, 2),
          },
          {
            hop: 4,
            ip: null,
            hostname: null,
            times: [],
            avgTime: null,
          },
          {
            hop: 5,
            ip: '8.8.8.8',
            hostname: '8.8.8.8',
            times: [14.234, 14.456, 14.678],
            avgTime: expect.closeTo(14.456, 2),
          },
        ],
        rawOutput,
      });
    });

    it('should format Windows tracert results', () => {
      const rawOutput = `Tracing route to 8.8.8.8 over a maximum of 30 hops:

  1     1 ms     1 ms     1 ms  192.168.1.1
  2     8 ms     8 ms     9 ms  10.0.0.1
  3    12 ms    12 ms    13 ms  172.16.0.1
  4     *        *        *     Request timed out.
  5    14 ms    14 ms    15 ms  8.8.8.8

Trace complete.`;

      const formatted = formatter.formatTraceroute(rawOutput);

      expect(formatted.totalHops).toBe(5);
      expect(formatted.reachedDestination).toBe(true);
      expect(formatted.hops[0]).toMatchObject({
        hop: 1,
        ip: '192.168.1.1',
        times: [1, 1, 1],
      });
    });

    it('should handle incomplete routes', () => {
      const rawOutput = `traceroute to 192.168.99.99 (192.168.99.99), 30 hops max, 60 byte packets
 1  192.168.1.1 (192.168.1.1)  1.234 ms  1.456 ms  1.678 ms
 2  * * *
 3  * * *
 4  * * *
 5  * * *`;

      const formatted = formatter.formatTraceroute(rawOutput);

      expect(formatted.reachedDestination).toBe(false);
      expect(formatted.totalHops).toBe(5);
      expect(formatted.hops.filter(h => h.ip !== null)).toHaveLength(1);
    });
  });

  describe('DNS result formatting', () => {
    it('should format A record results', () => {
      const dnsResult = {
        recordType: 'A',
        domain: 'google.com',
        addresses: ['142.250.80.46', '142.250.80.14'],
        resolutionTime: 25,
      };

      const formatted = formatter.formatDns(dnsResult);

      expect(formatted).toEqual({
        recordType: 'A',
        domain: 'google.com',
        addresses: ['142.250.80.46', '142.250.80.14'],
        resolutionTime: 25,
        summary: 'Resolved google.com to 2 IPv4 addresses',
      });
    });

    it('should format MX record results', () => {
      const dnsResult = {
        recordType: 'MX',
        domain: 'google.com',
        records: [
          { priority: 10, exchange: 'smtp.google.com' },
          { priority: 20, exchange: 'alt-smtp.google.com' },
        ],
        resolutionTime: 30,
      };

      const formatted = formatter.formatDns(dnsResult);

      expect(formatted).toMatchObject({
        recordType: 'MX',
        domain: 'google.com',
        records: [
          { priority: 10, exchange: 'smtp.google.com' },
          { priority: 20, exchange: 'alt-smtp.google.com' },
        ],
        summary: 'Found 2 MX records for google.com',
      });
    });

    it('should format TXT record results', () => {
      const dnsResult = {
        recordType: 'TXT',
        domain: 'google.com',
        records: [
          ['v=spf1 include:_spf.google.com ~all'],
          ['google-site-verification=abc123'],
        ],
        resolutionTime: 20,
      };

      const formatted = formatter.formatDns(dnsResult);

      expect(formatted).toMatchObject({
        recordType: 'TXT',
        records: [
          ['v=spf1 include:_spf.google.com ~all'],
          ['google-site-verification=abc123'],
        ],
        summary: 'Found 2 TXT records for google.com',
      });
    });

    it('should format CNAME record results', () => {
      const dnsResult = {
        recordType: 'CNAME',
        domain: 'www.google.com',
        cname: 'forcesafesearch.google.com',
        resolutionTime: 15,
      };

      const formatted = formatter.formatDns(dnsResult);

      expect(formatted).toMatchObject({
        recordType: 'CNAME',
        cname: 'forcesafesearch.google.com',
        summary: 'www.google.com points to forcesafesearch.google.com',
      });
    });
  });

  describe('connectivity result formatting', () => {
    it('should format HTTPS connectivity results', () => {
      const connResult = {
        url: 'https://google.com',
        reachable: true,
        statusCode: 200,
        responseTime: 234,
        tlsVersion: 'TLSv1.3',
        certificate: {
          valid: true,
          issuer: 'Google Trust Services',
          subject: '*.google.com',
          expiresAt: '2025-01-15T00:00:00Z',
        },
      };

      const formatted = formatter.formatConnectivity(connResult);

      expect(formatted).toMatchObject({
        url: 'https://google.com',
        reachable: true,
        statusCode: 200,
        responseTime: 234,
        tlsVersion: 'TLSv1.3',
        certificate: {
          valid: true,
          issuer: 'Google Trust Services',
          subject: '*.google.com',
          expiresAt: '2025-01-15T00:00:00Z',
        },
        summary: 'HTTPS connection successful (200 OK) in 234ms',
      });
    });

    it('should format port connectivity results', () => {
      const connResult = {
        host: '8.8.8.8',
        port: 53,
        reachable: true,
        responseTime: 12,
      };

      const formatted = formatter.formatConnectivity(connResult);

      expect(formatted).toMatchObject({
        host: '8.8.8.8',
        port: 53,
        reachable: true,
        responseTime: 12,
        summary: 'Port 53 on 8.8.8.8 is open (12ms)',
      });
    });

    it('should format unreachable results', () => {
      const connResult = {
        host: '192.168.99.99',
        port: 12345,
        reachable: false,
        responseTime: null,
        error: 'Connection timeout',
      };

      const formatted = formatter.formatConnectivity(connResult);

      expect(formatted).toMatchObject({
        host: '192.168.99.99',
        port: 12345,
        reachable: false,
        error: 'Connection timeout',
        summary: 'Port 12345 on 192.168.99.99 is unreachable',
      });
    });

    it('should format certificate error results', () => {
      const connResult = {
        url: 'https://expired.badssl.com',
        reachable: true,
        statusCode: 200,
        responseTime: 456,
        certificate: {
          valid: false,
          error: 'Certificate has expired',
          issuer: 'Bad SSL',
          subject: 'expired.badssl.com',
          expiresAt: '2020-01-01T00:00:00Z',
        },
      };

      const formatted = formatter.formatConnectivity(connResult);

      expect(formatted).toMatchObject({
        certificate: {
          valid: false,
          error: 'Certificate has expired',
        },
        summary: 'HTTPS connection succeeded but certificate is invalid',
      });
    });
  });

  describe('aggregated result formatting', () => {
    it('should format complete diagnostic result', () => {
      const result: DiagnosticResult = {
        commandId: 'cmd-123',
        deviceId: 'device-001',
        status: 'completed',
        results: {
          output: 'Raw command output',
          metrics: {
            packetsTransmitted: 4,
            packetsReceived: 4,
            packetLoss: 0,
            minRtt: 14,
            avgRtt: 15,
            maxRtt: 16,
          },
        },
        executedAt: new Date().toISOString(),
        duration: 4234,
      };

      const formatted = formatter.format(result);

      expect(formatted).toMatchObject({
        commandId: 'cmd-123',
        deviceId: 'device-001',
        status: 'completed',
        executedAt: expect.any(String),
        duration: 4234,
        formattedDuration: '4.23s',
        results: {
          output: 'Raw command output',
          metrics: expect.any(Object),
        },
      });
    });

    it('should format failed diagnostic result', () => {
      const result: DiagnosticResult = {
        commandId: 'cmd-456',
        deviceId: 'device-001',
        status: 'failed',
        results: {
          error: 'Command execution failed: Unknown host',
        },
        executedAt: new Date().toISOString(),
        duration: 100,
      };

      const formatted = formatter.format(result);

      expect(formatted).toMatchObject({
        status: 'failed',
        formattedDuration: '100ms',
        results: {
          error: 'Command execution failed: Unknown host',
        },
      });
    });

    it('should format timeout diagnostic result', () => {
      const result: DiagnosticResult = {
        commandId: 'cmd-789',
        deviceId: 'device-001',
        status: 'timeout',
        results: {
          error: 'Command timed out after 30000ms',
        },
        executedAt: new Date().toISOString(),
        duration: 30000,
      };

      const formatted = formatter.format(result);

      expect(formatted).toMatchObject({
        status: 'timeout',
        formattedDuration: '30.00s',
        results: {
          error: 'Command timed out after 30000ms',
        },
      });
    });
  });

  describe('sanitization', () => {
    it('should sanitize sensitive information from output', () => {
      const rawOutput = `Connected to server at 192.168.1.100
Username: admin@company.com
Password: secretpass123
API Key: sk-1234567890abcdef
Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0`;

      const sanitized = formatter.sanitize(rawOutput);

      expect(sanitized).not.toContain('admin@company.com');
      expect(sanitized).not.toContain('secretpass123');
      expect(sanitized).not.toContain('sk-1234567890abcdef');
      expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should preserve structure while sanitizing', () => {
      const rawOutput = `Host: example.com
Authorization: Bearer token123
Cookie: session=abc123; user=john@example.com
Response: Success`;

      const sanitized = formatter.sanitize(rawOutput);

      expect(sanitized).toContain('Host: example.com');
      expect(sanitized).toContain('Response: Success');
      expect(sanitized).toContain('Authorization: [REDACTED]');
      expect(sanitized).toContain('Cookie: [REDACTED]');
    });
  });
});
