# HITL Permission Handler Deployment Guide

## Critical Migration Requirement

**IMPORTANT**: Migration `2025091500003_fix_approval_policies_schema.sql` MUST be applied before deploying the updated HITL permission handler code.

## Pre-Deployment Checklist

### 1. Verify Migration Status

```bash
# Check local environment
npx supabase db push --local

# Check staging/production (dry run first)
npx supabase db push --dry-run
npx supabase db push
```

### 2. Verify Schema Changes

Run this SQL to confirm all required columns exist:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'approval_policies'
AND column_name IN ('tool_name', 'auto_approve', 'requires_approval', 'risk_threshold')
ORDER BY column_name;
```

Expected result:
- `auto_approve` - boolean
- `requires_approval` - boolean
- `risk_threshold` - text
- `tool_name` - text

### 3. Check Unique Constraint

```sql
SELECT conname
FROM pg_constraint
WHERE conrelid = 'approval_policies'::regclass
AND contype = 'u';
```

Should include: `approval_policies_customer_tool_unique`

## Deployment Steps

### Step 1: Apply Database Migration

```bash
# For production
npx supabase db push --linked
```

### Step 2: Deploy Updated Code

The following files contain critical fixes:

1. **packages/api/src/ai/services/hitl-permission-handler.service.ts**
   - Fixed schema alignment with `tool_name`, `auto_approve`, `requires_approval`, `risk_threshold`
   - Fixed status mapping: 'deny' → 'denied' for database constraint
   - Enhanced `getPendingApprovals()` to return actual risk levels and ISO timestamps
   - Added proper timestamp consistency

2. **packages/api/src/ai/tools/network-mcp-tools.ts**
   - Added `isReadOnlyTool()` instance method for compatibility

3. **packages/api/src/routes/ai.ts**
   - Uses TypeScript interfaces from `ai-routes.types.ts`
   - Removed manual CORS headers (now centralized)

4. **packages/api/src/server.ts**
   - Centralized CORS configuration with environment-based allowlists

### Step 3: Post-Deployment Verification

```bash
# Test policy creation
curl -X POST ${API_URL}/api/v1/approval-policies \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "test-customer-id",
    "toolName": "test_tool",
    "autoApprove": false,
    "requiresApproval": true,
    "riskThreshold": "high"
  }'

# Test policy retrieval
curl ${API_URL}/api/v1/approval-policies/test-customer-id
```

## Rollback Plan

If issues occur after deployment:

1. **The migration is safe** - old columns (`tool_pattern`, `action`) are preserved
2. **Revert code deployment** to previous version
3. **No database rollback needed** - migration is backward compatible

## Fixed Issues Summary

1. ✅ **Schema Mismatch**: Code now uses columns added by migration 2025091500003
2. ✅ **Status Constraint Violation**: 'deny' properly mapped to 'denied'
3. ✅ **Incomplete Data**: `getPendingApprovals()` returns actual risk levels and ISO timestamps
4. ✅ **Missing Method**: Added `isReadOnlyTool()` to NetworkMCPTools
5. ✅ **CORS Headers**: Centralized configuration in server.ts
6. ✅ **Type Safety**: All AI routes use proper TypeScript interfaces

## Testing

Run tests after deployment:

```bash
# Run HITL service tests
npm test packages/api/src/ai/services/hitl-permission-handler.service.ts

# Run integration tests
npm test packages/api/src/integration-tests/
```

## Monitoring

Watch for these errors in logs:

- `column "tool_name" does not exist` - Migration not applied
- `invalid input value for enum` - Status mapping issue (should be fixed)
- `duplicate key value violates unique constraint` - Expected for duplicate policies

## Contact

For issues during deployment, check:
- Migration status: `supabase migration list`
- Database logs: `supabase db logs`
- Application logs for HITL-prefixed messages