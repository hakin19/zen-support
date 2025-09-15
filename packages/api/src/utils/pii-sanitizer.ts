/**
 * PII Sanitization utilities for SDK messages before broadcasting or persistence
 */

// Regex patterns for PII detection
const PII_PATTERNS = {
  // IP addresses (IPv4 and IPv6)
  ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  ipv6: /\b(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}\b/g,

  // MAC addresses
  macAddress: /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g,

  // Email addresses
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

  // Phone numbers (various formats)
  phone: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,

  // SSN patterns
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,

  // Credit card patterns (basic)
  creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,

  // API keys and tokens (common patterns)
  apiKey:
    /\b(?:api[_-]?key|token|secret|password|auth)[_\s]*[:=]\s*['"]?[\w-]{20,}['"]?/gi,

  // AWS keys
  awsKey: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,

  // Private keys
  privateKey:
    /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC )?PRIVATE KEY-----/g,
};

// Known safe IPs that shouldn't be redacted (localhost, private ranges)
const SAFE_IPS = ['127.0.0.1', 'localhost', '0.0.0.0', '::1'];

/**
 * Check if an IP is in private range
 */
function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;

  const first = parseInt(parts[0]);
  const second = parseInt(parts[1]);

  // 10.0.0.0/8
  if (first === 10) return true;
  // 172.16.0.0/12
  if (first === 172 && second >= 16 && second <= 31) return true;
  // 192.168.0.0/16
  if (first === 192 && second === 168) return true;

  return false;
}

/**
 * Sanitize a string value for PII
 */
function sanitizeString(value: string): string {
  let sanitized = value;

  // Replace IPs (but keep private ones partially visible)
  sanitized = sanitized.replace(PII_PATTERNS.ipv4, match => {
    if (SAFE_IPS.includes(match) || isPrivateIP(match)) {
      const parts = match.split('.');
      return `${parts[0]}.${parts[1]}.*.*`;
    }
    return '<IP_REDACTED>';
  });

  // Replace other PII patterns
  sanitized = sanitized.replace(PII_PATTERNS.ipv6, '<IPv6_REDACTED>');
  sanitized = sanitized.replace(PII_PATTERNS.macAddress, '<MAC_REDACTED>');
  sanitized = sanitized.replace(PII_PATTERNS.email, '<EMAIL_REDACTED>');
  sanitized = sanitized.replace(PII_PATTERNS.phone, '<PHONE_REDACTED>');
  sanitized = sanitized.replace(PII_PATTERNS.ssn, '<SSN_REDACTED>');
  sanitized = sanitized.replace(PII_PATTERNS.creditCard, '<CC_REDACTED>');
  sanitized = sanitized.replace(PII_PATTERNS.apiKey, '<API_KEY_REDACTED>');
  sanitized = sanitized.replace(PII_PATTERNS.awsKey, '<AWS_KEY_REDACTED>');
  sanitized = sanitized.replace(
    PII_PATTERNS.privateKey,
    '<PRIVATE_KEY_REDACTED>'
  );

  return sanitized;
}

/**
 * Recursively sanitize an object for PII
 */
export function sanitizeObject(obj: any, depth = 0): any {
  // Prevent infinite recursion
  if (depth > 10) return '<DEPTH_LIMIT>';

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      // Skip certain sensitive keys entirely
      if (
        ['password', 'secret', 'token', 'apiKey', 'privateKey'].includes(key)
      ) {
        sanitized[key] = '<REDACTED>';
        continue;
      }

      // Recursively sanitize nested objects
      sanitized[key] = sanitizeObject(obj[key], depth + 1);
    }
    return sanitized;
  }

  return obj;
}

/**
 * Create a minimal broadcast payload for SDK messages
 * Only includes necessary fields for monitoring
 */
export function createMinimalBroadcastPayload(message: any): any {
  return {
    type: message.type,
    sessionId: message.sessionId,
    timestamp: message.timestamp,
    // Only include minimal metadata
    metadata: {
      messageType: message.type,
      hasContent: !!message.content,
      hasError: message.type === 'error' || message.is_error,
    },
    // Sanitized summary only if error
    ...(message.type === 'error' && {
      error: sanitizeString(
        message.error || message.message || 'Unknown error'
      ),
    }),
    // Tool usage notification (name only, no inputs)
    ...(message.type === 'assistant' &&
      message.content?.content && {
        toolsUsed: message.content.content
          .filter((c: any) => c.type === 'tool_use')
          .map((c: any) => c.name),
      }),
  };
}

/**
 * Sanitize SDK message before database persistence
 */
export function sanitizeForDatabase(message: any): any {
  // Create a deep copy to avoid mutating original
  const copy = JSON.parse(JSON.stringify(message));
  return sanitizeObject(copy);
}
