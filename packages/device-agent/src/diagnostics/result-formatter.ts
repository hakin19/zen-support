import type { DiagnosticResult } from '../types';

interface PingMetrics {
  target: string;
  packetsTransmitted: number;
  packetsReceived: number;
  packetLoss: number;
  minRtt?: number;
  avgRtt?: number;
  maxRtt?: number;
  stddev?: number;
  rawOutput: string;
}

interface TracerouteHop {
  hop: number;
  ip: string | null;
  hostname: string | null;
  times: number[];
  avgTime: number | null;
}

interface TracerouteMetrics {
  target: string;
  totalHops: number;
  reachedDestination: boolean;
  hops: TracerouteHop[];
  rawOutput: string;
}

interface DnsMetrics {
  recordType: string;
  domain: string;
  addresses?: string[];
  records?: any[];
  servers?: string[];
  cname?: string;
  resolutionTime: number;
  summary: string;
}

interface ConnectivityMetrics {
  url?: string;
  host?: string;
  port?: number;
  reachable: boolean;
  statusCode?: number;
  responseTime?: number | null;
  tlsVersion?: string;
  certificate?: {
    valid: boolean;
    issuer?: string;
    subject?: string;
    expiresAt?: string;
    error?: string;
  };
  error?: string;
  summary: string;
}

export class ResultFormatter {
  /**
   * Format a complete diagnostic result
   */
  format(result: DiagnosticResult): any {
    return {
      ...result,
      formattedDuration: this.formatDuration(result.duration),
    };
  }

  /**
   * Format ping results
   */
  formatPing(rawOutput: string): PingMetrics {
    const isWindows =
      rawOutput.includes('Pinging') ||
      rawOutput.includes('Ping statistics for');
    const metrics: Partial<PingMetrics> = { rawOutput };

    // Extract target
    const targetMatch = isWindows
      ? rawOutput.match(/Pinging ([\d.]+|[\da-f:]+|\S+)/)
      : rawOutput.match(/PING (?:\S+\s+\()?([\d.]+|[\da-f:]+|\S+)/);

    if (targetMatch) {
      metrics.target = targetMatch[1];
    }

    if (isWindows) {
      // Windows format
      const statsMatch = rawOutput.match(
        /Packets: Sent = (\d+), Received = (\d+), Lost = (\d+)/
      );
      if (statsMatch?.[1] && statsMatch[2] && statsMatch[3]) {
        metrics.packetsTransmitted = parseInt(statsMatch[1]);
        metrics.packetsReceived = parseInt(statsMatch[2]);
        const lost = parseInt(statsMatch[3]);
        metrics.packetLoss =
          metrics.packetsTransmitted > 0
            ? Math.round((lost / metrics.packetsTransmitted) * 100)
            : 0;
      }

      const timesMatch = rawOutput.match(
        /Minimum = (\d+)ms, Maximum = (\d+)ms, Average = (\d+)ms/
      );
      if (timesMatch?.[1] && timesMatch[2] && timesMatch[3]) {
        metrics.minRtt = parseInt(timesMatch[1]);
        metrics.maxRtt = parseInt(timesMatch[2]);
        metrics.avgRtt = parseInt(timesMatch[3]);
      }
    } else {
      // Unix/Linux format
      const statsMatch = rawOutput.match(
        /(\d+) packets transmitted, (\d+) (?:packets )?received, ([\d.]+)% packet loss/
      );
      if (statsMatch?.[1] && statsMatch[2] && statsMatch[3]) {
        metrics.packetsTransmitted = parseInt(statsMatch[1]);
        metrics.packetsReceived = parseInt(statsMatch[2]);
        metrics.packetLoss = parseFloat(statsMatch[3]);
      }

      const timesMatch = rawOutput.match(
        /min\/avg\/max\/(?:mdev|stddev|std-dev) = ([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)/
      );
      if (timesMatch?.[1] && timesMatch[2] && timesMatch[3] && timesMatch[4]) {
        metrics.minRtt = parseFloat(timesMatch[1]);
        metrics.avgRtt = parseFloat(timesMatch[2]);
        metrics.maxRtt = parseFloat(timesMatch[3]);
        metrics.stddev = parseFloat(timesMatch[4]);
      }
    }

    return metrics as PingMetrics;
  }

  /**
   * Format traceroute results
   */
  formatTraceroute(rawOutput: string): TracerouteMetrics {
    const isWindows =
      rawOutput.includes('Tracing route') ||
      rawOutput.includes('Trace complete');
    const hops: TracerouteHop[] = [];
    let target = '';
    let reachedDestination = false;

    // Extract target
    const targetMatch = isWindows
      ? rawOutput.match(/Tracing route to ([\d.]+|[\da-f:]+|\S+)/)
      : rawOutput.match(/traceroute to ([\d.]+|[\da-f:]+|\S+)/);

    if (targetMatch?.[1]) {
      target = targetMatch[1];
    }

    const lines = rawOutput.split('\n');

    if (isWindows) {
      // Windows tracert format
      const hopRegex = /^\s*(\d+)\s+(.+)$/;

      for (const line of lines) {
        const match = line.match(hopRegex);
        if (match?.[1] && match[2]) {
          const hopNum = parseInt(match[1]);
          const rest = match[2].trim();

          if (rest.includes('Request timed out') || rest.includes('*')) {
            const times: number[] = [];
            const timeMatches = rest.match(/(\d+)\s*ms/g);
            if (timeMatches) {
              timeMatches.forEach(t =>
                times.push(parseInt(t.replace(/\s*ms/, '')))
              );
            }

            hops.push({
              hop: hopNum,
              ip: null,
              hostname: null,
              times,
              avgTime:
                times.length > 0
                  ? times.reduce((a, b) => a + b, 0) / times.length
                  : null,
            });
          } else {
            const times: number[] = [];
            const timeMatches = rest.match(/(\d+)\s*ms/g);
            if (timeMatches) {
              timeMatches.forEach(t =>
                times.push(parseInt(t.replace(/\s*ms/, '')))
              );
            }

            const hostMatch = rest.match(/([^\s]+)$/);
            const host = hostMatch ? hostMatch[1] : null;

            hops.push({
              hop: hopNum,
              ip: host ?? null,
              hostname: host ?? null,
              times,
              avgTime:
                times.length > 0
                  ? times.reduce((a, b) => a + b, 0) / times.length
                  : null,
            });

            if (host === target || host?.includes(target)) {
              reachedDestination = true;
            }
          }
        }
      }
    } else {
      // Unix/Linux traceroute format
      const hopRegex = /^\s*(\d+)\s+(.+)$/;

      for (const line of lines) {
        const match = line.match(hopRegex);
        if (match?.[1] && match[2]) {
          const hopNum = parseInt(match[1]);
          const rest = match[2].trim();

          if (rest === '* * *') {
            hops.push({
              hop: hopNum,
              ip: null,
              hostname: null,
              times: [],
              avgTime: null,
            });
          } else {
            // Parse format like: "192.168.1.1 (192.168.1.1)  1.234 ms  1.456 ms  1.678 ms"
            const ipHostMatch = rest.match(
              /^([\d.]+|[\da-f:]+|\S+)\s+\(([\d.]+|[\da-f:]+)\)/
            );
            const timesMatch = rest.match(/([\d.]+)\s*ms/g);

            let ip: string | null = null;
            let hostname: string | null = null;

            if (ipHostMatch?.[1] && ipHostMatch[2]) {
              hostname = ipHostMatch[1];
              ip = ipHostMatch[2];
            } else {
              // Simple IP without parentheses
              const simpleMatch = rest.match(/^([\d.]+|[\da-f:]+|\S+)/);
              if (simpleMatch?.[1]) {
                ip = simpleMatch[1];
                hostname = simpleMatch[1];
              }
            }

            const times = timesMatch
              ? timesMatch.map(t => parseFloat(t.replace(/\s*ms/, '')))
              : [];

            hops.push({
              hop: hopNum,
              ip,
              hostname,
              times,
              avgTime:
                times.length > 0
                  ? times.reduce((a, b) => a + b, 0) / times.length
                  : null,
            });

            if (ip === target || hostname === target) {
              reachedDestination = true;
            }
          }
        }
      }
    }

    return {
      target,
      totalHops: hops.length,
      reachedDestination,
      hops,
      rawOutput,
    };
  }

  /**
   * Format DNS results
   */
  formatDns(dnsResult: any): DnsMetrics {
    const { recordType, domain } = dnsResult;
    let summary = '';

    switch (recordType) {
      case 'A':
      case 'AAAA':
        const ipType = recordType === 'A' ? 'IPv4' : 'IPv6';
        summary = `Resolved ${domain} to ${dnsResult.addresses.length} ${ipType} address${dnsResult.addresses.length !== 1 ? 'es' : ''}`;
        break;
      case 'MX':
        summary = `Found ${dnsResult.records.length} MX record${dnsResult.records.length !== 1 ? 's' : ''} for ${domain}`;
        break;
      case 'TXT':
        summary = `Found ${dnsResult.records.length} TXT record${dnsResult.records.length !== 1 ? 's' : ''} for ${domain}`;
        break;
      case 'NS':
        summary = `Found ${dnsResult.servers.length} name server${dnsResult.servers.length !== 1 ? 's' : ''} for ${domain}`;
        break;
      case 'CNAME':
        summary = `${domain} points to ${dnsResult.cname}`;
        break;
      default:
        summary = `DNS lookup completed for ${domain}`;
    }

    return {
      ...dnsResult,
      summary,
    };
  }

  /**
   * Format connectivity results
   */
  formatConnectivity(connResult: any): ConnectivityMetrics {
    let summary = '';

    if (connResult.url) {
      // HTTP/HTTPS connectivity
      if (connResult.reachable) {
        if (connResult.certificate && !connResult.certificate.valid) {
          summary = `HTTPS connection succeeded but certificate is invalid`;
        } else {
          summary = `${connResult.url.startsWith('https') ? 'HTTPS' : 'HTTP'} connection successful (${connResult.statusCode} ${this.getStatusText(connResult.statusCode)}) in ${connResult.responseTime}ms`;
        }
      } else {
        summary = `Failed to connect to ${connResult.url}`;
      }
    } else if (connResult.host && connResult.port !== undefined) {
      // Port connectivity
      if (connResult.reachable) {
        summary = `Port ${connResult.port} on ${connResult.host} is open (${connResult.responseTime}ms)`;
      } else {
        summary = `Port ${connResult.port} on ${connResult.host} is unreachable`;
      }
    }

    return {
      ...connResult,
      summary,
    };
  }

  /**
   * Sanitize sensitive information from output
   */
  sanitize(output: string): string {
    let sanitized = output;

    // Email addresses
    sanitized = sanitized.replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      '[REDACTED]'
    );

    // API keys and tokens
    sanitized = sanitized.replace(
      /(?:api[_-]?key|token|secret|password)[\s:=]+[\S]+/gi,
      match => {
        const parts = match.split(/[\s:=]+/);
        return `${parts[0]}: [REDACTED]`;
      }
    );

    // JWT tokens
    sanitized = sanitized.replace(
      /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
      '[REDACTED]'
    );

    // Bearer tokens
    sanitized = sanitized.replace(/Bearer\s+[\S]+/gi, 'Bearer [REDACTED]');

    // Authorization headers
    sanitized = sanitized.replace(
      /Authorization:\s*[\S]+/gi,
      'Authorization: [REDACTED]'
    );

    // Cookie headers
    sanitized = sanitized.replace(/Cookie:\s*[^\n\r]+/gi, 'Cookie: [REDACTED]');

    // AWS keys
    sanitized = sanitized.replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED]');

    // Generic secrets (sk- prefix)
    sanitized = sanitized.replace(/sk-[a-zA-Z0-9]+/g, '[REDACTED]');

    return sanitized;
  }

  /**
   * Format duration in a human-readable format
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
  }

  /**
   * Get HTTP status text
   */
  private getStatusText(code: number): string {
    const statusTexts: Record<number, string> = {
      200: 'OK',
      201: 'Created',
      204: 'No Content',
      301: 'Moved Permanently',
      302: 'Found',
      304: 'Not Modified',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
    };
    return statusTexts[code] || '';
  }
}
