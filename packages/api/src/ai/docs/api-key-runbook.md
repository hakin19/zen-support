# ANTHROPIC_API_KEY Management Runbook

## Overview

This runbook provides operational procedures for managing Anthropic API keys in the Zen & Zen Support system, including secure storage, rotation, monitoring, and incident response.

## Table of Contents

1. [Key Management Overview](#key-management-overview)
2. [Initial Setup](#initial-setup)
3. [Key Rotation Procedure](#key-rotation-procedure)
4. [Monitoring and Alerts](#monitoring-and-alerts)
5. [Incident Response](#incident-response)
6. [Security Best Practices](#security-best-practices)
7. [Troubleshooting](#troubleshooting)
8. [Emergency Procedures](#emergency-procedures)

## Key Management Overview

### Key Types

| Key Type | Purpose | Rotation Schedule | Risk Level |
|----------|---------|-------------------|------------|
| Production Primary | Main production API key | 90 days | Critical |
| Production Secondary | Backup/failover key | 90 days | Critical |
| Staging | Staging environment | 180 days | High |
| Development | Local development | 365 days | Medium |

### Responsible Teams

- **Security Team**: Key generation, rotation policy
- **DevOps Team**: Key deployment, monitoring
- **Development Team**: Key usage, error handling
- **Incident Response**: Key compromise handling

## Initial Setup

### Step 1: Generate API Keys

1. **Access Anthropic Console**
   ```
   URL: https://console.anthropic.com
   Required: Admin access
   ```

2. **Generate New Key**
   ```
   Console > API Keys > Create Key
   Name: zen-support-prod-primary-YYYYMMDD
   Permissions: Standard
   ```

3. **Document Key Metadata**
   ```yaml
   key_id: sk-ant-api03-xxx...
   created_date: 2024-01-15
   created_by: admin@zensupport.com
   purpose: production_primary
   rotation_date: 2024-04-15
   ```

### Step 2: Secure Storage Setup

#### AWS Secrets Manager (Recommended)

```bash
# Create secret
aws secretsmanager create-secret \
  --name "zen-support/anthropic/api-key" \
  --description "Anthropic API key for Zen Support production" \
  --secret-string '{"api_key":"sk-ant-api03-...", "created":"2024-01-15"}'

# Set rotation
aws secretsmanager put-secret-version-rotation \
  --secret-id "zen-support/anthropic/api-key" \
  --rotation-rules '{"AutomaticallyAfterDays": 90}'
```

#### Environment Variable Configuration

```bash
# Never store directly in code or .env files committed to git
# Use secret management service or CI/CD injection

# Local development only (.env.local - gitignored)
ANTHROPIC_API_KEY=sk-ant-api03-test-key

# Production (injected at runtime)
export ANTHROPIC_API_KEY=$(aws secretsmanager get-secret-value \
  --secret-id zen-support/anthropic/api-key \
  --query SecretString \
  --output text | jq -r .api_key)
```

### Step 3: Application Configuration

```typescript
// key-manager.service.ts
import { SecretsManager } from '@aws-sdk/client-secrets-manager'

export class KeyManager {
  private secretsManager = new SecretsManager({ region: 'us-east-1' })
  private cachedKey: string | null = null
  private cacheExpiry: Date | null = null

  async getApiKey(): Promise<string> {
    // Check cache
    if (this.cachedKey && this.cacheExpiry && this.cacheExpiry > new Date()) {
      return this.cachedKey
    }

    try {
      // Fetch from Secrets Manager
      const secret = await this.secretsManager.getSecretValue({
        SecretId: 'zen-support/anthropic/api-key'
      })

      const { api_key } = JSON.parse(secret.SecretString || '{}')

      // Cache for 1 hour
      this.cachedKey = api_key
      this.cacheExpiry = new Date(Date.now() + 3600000)

      return api_key
    } catch (error) {
      // Fallback to environment variable (development only)
      if (process.env.NODE_ENV === 'development') {
        return process.env.ANTHROPIC_API_KEY || ''
      }
      throw new Error('Failed to retrieve API key')
    }
  }

  async rotateKey(newKey: string): Promise<void> {
    // Update in Secrets Manager
    await this.secretsManager.putSecretValue({
      SecretId: 'zen-support/anthropic/api-key',
      SecretString: JSON.stringify({
        api_key: newKey,
        created: new Date().toISOString(),
        rotated_from: this.cachedKey
      })
    })

    // Clear cache
    this.cachedKey = null
    this.cacheExpiry = null
  }
}
```

## Key Rotation Procedure

### Scheduled Rotation (Every 90 Days)

#### Pre-Rotation Checklist

- [ ] Verify new key generation window with Anthropic
- [ ] Ensure staging environment is ready for testing
- [ ] Confirm rollback procedure is documented
- [ ] Alert on-call team of rotation window

#### Rotation Steps

1. **Generate New Key**
   ```bash
   # Script: rotate-anthropic-key.sh
   #!/bin/bash

   # Generate new key in Anthropic Console
   echo "1. Generate new key in Anthropic Console"
   echo "   Name: zen-support-prod-primary-$(date +%Y%m%d)"

   # Store new key
   read -s -p "Enter new API key: " NEW_KEY
   echo

   # Validate key format
   if [[ ! $NEW_KEY =~ ^sk-ant-api[0-9]{2}- ]]; then
     echo "Error: Invalid key format"
     exit 1
   fi

   # Update staging first
   aws secretsmanager put-secret-value \
     --secret-id "zen-support/anthropic/api-key-staging" \
     --secret-string "{\"api_key\":\"$NEW_KEY\", \"created\":\"$(date -I)\"}"

   echo "2. New key deployed to staging"
   ```

2. **Test in Staging**
   ```typescript
   // test-key-rotation.ts
   async function testNewKey(key: string): Promise<boolean> {
     const testOrchestrator = new AIOrchestrator()

     try {
       // Simple test query
       const response = await testOrchestrator.testConnection(key)
       console.log('✓ Key validation successful')

       // Test actual functionality
       const diagnosticTest = await testOrchestrator.analyzeDiagnostics(
         testPrompt,
         'test-session',
         'test-correlation'
       )

       console.log('✓ Diagnostic test successful')
       return true
     } catch (error) {
       console.error('✗ Key test failed:', error)
       return false
     }
   }
   ```

3. **Deploy to Production**
   ```bash
   # Deploy new key to production
   aws secretsmanager put-secret-value \
     --secret-id "zen-support/anthropic/api-key" \
     --secret-string "{\"api_key\":\"$NEW_KEY\", \"created\":\"$(date -I)\"}" \
     --version-stage AWSPENDING

   # Wait for health checks
   sleep 30

   # Promote to current
   aws secretsmanager update-secret-version-stage \
     --secret-id "zen-support/anthropic/api-key" \
     --version-stage AWSCURRENT \
     --move-to-version-id $(aws secretsmanager get-secret-value \
       --secret-id "zen-support/anthropic/api-key" \
       --version-stage AWSPENDING \
       --query VersionId --output text)
   ```

4. **Verify Production Deployment**
   ```bash
   # Check metrics
   curl -X GET https://api.zensupport.com/v1/ai/metrics/health \
     -H "X-Internal-Auth: $INTERNAL_TOKEN"

   # Monitor error rate
   aws cloudwatch get-metric-statistics \
     --namespace "ZenSupport/AI" \
     --metric-name "APIKeyErrors" \
     --start-time $(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%S) \
     --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
     --period 60 \
     --statistics Average
   ```

5. **Deactivate Old Key**
   ```bash
   # Keep old key active for 24 hours (graceful transition)
   echo "Old key will be deactivated at: $(date -d '+24 hours')"

   # Schedule deactivation
   at now + 24 hours <<EOF
   # Mark old key as inactive in Anthropic Console
   echo "Deactivate old key in Anthropic Console"
   EOF
   ```

### Emergency Rotation (Key Compromise)

#### Immediate Actions (< 5 minutes)

1. **Revoke Compromised Key**
   ```bash
   # Immediately remove from production
   aws secretsmanager put-secret-value \
     --secret-id "zen-support/anthropic/api-key" \
     --secret-string "{\"api_key\":\"REVOKED\", \"revoked\":\"$(date -I)\"}"

   # Trigger service restart to clear caches
   aws ecs update-service \
     --cluster zen-support-prod \
     --service ai-orchestrator \
     --force-new-deployment
   ```

2. **Deploy Backup Key**
   ```bash
   # Switch to secondary key
   aws secretsmanager restore-secret \
     --secret-id "zen-support/anthropic/api-key-secondary"
   ```

3. **Alert Team**
   ```bash
   # Send alerts
   ./scripts/send-alert.sh "CRITICAL: API Key Compromised - Rotation In Progress"
   ```

## Monitoring and Alerts

### Key Usage Metrics

```typescript
// Monitor key usage patterns
const keyUsageMonitor = {
  metrics: [
    {
      name: 'api_key_requests_per_minute',
      threshold: 100,
      action: 'alert'
    },
    {
      name: 'api_key_error_rate',
      threshold: 0.05, // 5% error rate
      action: 'page'
    },
    {
      name: 'api_key_latency_ms',
      threshold: 5000,
      action: 'warn'
    }
  ],

  checkMetrics(): void {
    const metrics = metricsService.collectCurrentMetrics('minute')

    // Check for anomalies
    if (metrics.errors.total > 10) {
      this.alert('High error rate detected')
    }

    if (metrics.cost.totalCostUsd > 100) {
      this.alert('Unusual cost spike detected')
    }
  }
}
```

### CloudWatch Alarms

```yaml
# cloudwatch-alarms.yml
APIKeyErrorAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: ZenSupport-APIKey-Errors
    MetricName: APIKeyErrors
    Namespace: ZenSupport/AI
    Statistic: Sum
    Period: 300
    EvaluationPeriods: 1
    Threshold: 10
    ComparisonOperator: GreaterThanThreshold
    AlarmActions:
      - !Ref SNSAlertTopic

APIKeyRateLimitAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: ZenSupport-APIKey-RateLimit
    MetricName: RateLimitErrors
    Namespace: ZenSupport/AI
    Statistic: Sum
    Period: 60
    EvaluationPeriods: 2
    Threshold: 5
    ComparisonOperator: GreaterThanThreshold
```

## Incident Response

### Scenario 1: Key Exposed in Code

**Detection**: GitHub secret scanning alert

**Response**:
1. Immediately rotate key (see Emergency Rotation)
2. Audit git history for exposure duration
3. Review access logs in Anthropic Console
4. Document incident for compliance

### Scenario 2: Rate Limit Exceeded

**Detection**: 429 errors in logs

**Response**:
```typescript
// Implement backoff strategy
class RateLimitHandler {
  async handleRateLimit(error: any): Promise<void> {
    const retryAfter = error.headers?.['retry-after'] || 60

    // Log incident
    console.error('Rate limit hit', {
      timestamp: new Date(),
      retryAfter,
    })

    // Switch to backup key if available
    if (this.hasBackupKey()) {
      await this.switchToBackupKey()
    } else {
      // Implement exponential backoff
      await this.sleep(retryAfter * 1000)
    }
  }
}
```

### Scenario 3: Key Authentication Failure

**Detection**: 401 errors

**Response**:
1. Verify key hasn't expired
2. Check key permissions in Anthropic Console
3. Verify secret storage integrity
4. Failover to backup key

## Security Best Practices

### Do's ✅

1. **Rotate keys regularly** (90 days maximum)
2. **Use separate keys** for production/staging/development
3. **Monitor usage patterns** for anomalies
4. **Encrypt keys at rest** using AWS KMS or similar
5. **Audit key access** through CloudTrail
6. **Implement key escrow** for emergency access
7. **Use short-lived tokens** where possible
8. **Test rotation procedures** quarterly

### Don'ts ❌

1. **Never commit keys** to version control
2. **Never share keys** via email/Slack/tickets
3. **Never use the same key** across environments
4. **Never log API keys** even partially
5. **Never store keys** in application memory longer than needed
6. **Never skip rotation** schedules
7. **Never use personal keys** for production

## Troubleshooting

### Common Issues and Solutions

| Issue | Symptoms | Solution |
|-------|----------|----------|
| Key Not Found | `Error: Failed to retrieve API key` | Check Secrets Manager permissions, verify secret name |
| Invalid Key Format | `Error: Invalid API key format` | Verify key starts with `sk-ant-api`, check for whitespace |
| Rate Limited | `429 Too Many Requests` | Implement backoff, check usage metrics, contact Anthropic |
| Permission Denied | `403 Forbidden` | Verify key permissions in Console, check IP allowlist |
| Key Expired | `401 Unauthorized` | Rotate key immediately, check rotation schedule |
| Cache Stale | Old key still being used | Clear application cache, restart services |

### Debug Commands

```bash
# Check current key (masked)
aws secretsmanager get-secret-value \
  --secret-id "zen-support/anthropic/api-key" \
  --query SecretString \
  --output text | jq -r '.api_key' | sed 's/\(.......\).*/\1***/'

# Verify key rotation schedule
aws secretsmanager describe-secret \
  --secret-id "zen-support/anthropic/api-key" \
  --query 'RotationRules'

# Check key usage metrics
aws cloudwatch get-metric-statistics \
  --namespace "ZenSupport/AI" \
  --metric-name "APIKeyUsage" \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum

# Test key validity
curl -X POST https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2024-01-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3.5-sonnet","messages":[{"role":"user","content":"test"}],"max_tokens":10}'
```

## Emergency Procedures

### Total Key Failure

**When all keys are compromised or failing:**

1. **Activate Incident Response**
   ```bash
   ./scripts/incident-response.sh "CRITICAL" "Total API Key Failure"
   ```

2. **Enable Degraded Mode**
   ```typescript
   // Enable circuit breaker
   await aiOrchestrator.enableDegradedMode({
     queueRequests: true,
     notifyUsers: true,
     fallbackToCache: true
   })
   ```

3. **Generate Emergency Keys**
   - Contact Anthropic support for emergency key generation
   - Use break-glass procedure for console access
   - Document all actions for audit

4. **Gradual Service Restoration**
   ```bash
   # Test new key with limited traffic
   ./scripts/canary-deployment.sh 10  # 10% traffic

   # Monitor for 5 minutes
   sleep 300

   # Increase if successful
   ./scripts/canary-deployment.sh 50  # 50% traffic
   ./scripts/canary-deployment.sh 100 # Full traffic
   ```

### Rollback Procedure

```bash
#!/bin/bash
# rollback-key.sh

# Restore previous key version
aws secretsmanager update-secret-version-stage \
  --secret-id "zen-support/anthropic/api-key" \
  --version-stage AWSCURRENT \
  --move-to-version-id $(aws secretsmanager get-secret-value \
    --secret-id "zen-support/anthropic/api-key" \
    --version-stage AWSPREVIOUS \
    --query VersionId --output text)

# Force service refresh
aws ecs update-service \
  --cluster zen-support-prod \
  --service ai-orchestrator \
  --force-new-deployment

echo "Rollback completed. Previous key restored."
```

## Compliance and Audit

### Quarterly Review Checklist

- [ ] Review key rotation history
- [ ] Audit access logs from Anthropic Console
- [ ] Verify backup key validity
- [ ] Test emergency procedures
- [ ] Update contact list
- [ ] Review and update this runbook

### Audit Log Requirements

```typescript
// Log all key operations
interface KeyAuditLog {
  timestamp: Date
  action: 'create' | 'rotate' | 'revoke' | 'access'
  performedBy: string
  keyId: string // First 7 chars only
  environment: 'production' | 'staging' | 'development'
  result: 'success' | 'failure'
  metadata?: Record<string, any>
}
```

## Contact Information

| Role | Name | Contact | Escalation |
|------|------|---------|------------|
| Security Lead | [Name] | [Email] | Primary |
| DevOps Lead | [Name] | [Email] | Primary |
| On-Call Engineer | Rotation | [PagerDuty] | 24/7 |
| Anthropic Support | Support Team | support@anthropic.com | Vendor |

## Appendix

### Scripts Location
- Rotation: `/scripts/security/rotate-anthropic-key.sh`
- Monitoring: `/scripts/monitoring/check-api-key-health.sh`
- Emergency: `/scripts/incident/api-key-emergency.sh`

### Related Documentation
- [SDK Integration Guide](./sdk-integration-guide.md)
- [Security Policies](../security/policies.md)
- [Incident Response Plan](../incident/response-plan.md)

---

**Last Updated**: 2024-01-15
**Next Review**: 2024-04-15
**Version**: 1.0.0