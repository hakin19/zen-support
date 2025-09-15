# Safety Policy Specification

This document defines the safety policies for the Claude Code SDK integration in the Zen & Zen Network Support system.

## Operation Modes

The system operates in two distinct modes based on the type of request:

### 1. Analysis Mode (Read-Only)

Used for diagnostic analysis without any remediation actions.

**Configuration:**

- `permissionMode: 'plan'` - Planning mode ensures no execution
- `allowedTools: []` - No tools allowed
- `maxTurns: 1` - Single response only
- `canUseTool`: Not applicable (no tools)

**Use Cases:**

- Initial network diagnostics
- Issue identification
- Root cause analysis
- Performance assessment

**Example:**

```typescript
const analysisOptions = {
  permissionMode: 'plan',
  allowedTools: [],
  maxTurns: 1,
  includePartialMessages: true,
};
```

### 2. Script Generation Mode (With HITL)

Used when remediation actions are required.

**Configuration:**

- `permissionMode: 'default'` - Standard permission behavior
- `allowedTools`: Server-filtered intersection of requested and policy-allowed tools
- `canUseTool`: Required - implements HITL approval workflow
- `maxTurns`: Configurable based on complexity

**Use Cases:**

- Generating remediation scripts
- Creating configuration changes
- Implementing fixes
- Recovery procedures

**Example:**

```typescript
const generationOptions = {
  permissionMode: 'default',
  allowedTools: ['network_diagnostic', 'script_generator'], // Filtered by server
  maxTurns: 3,
  canUseTool: this.createPermissionHandler(), // HITL approval
  includePartialMessages: true,
};
```

## Security Enforcement

### Tool Filtering

All client-requested tools are filtered through server-side policy:

```typescript
effectiveTools = requestedTools ∩ serverPolicyAllowedTools
```

### Permission Mode Restrictions

- Only `'plan'` and `'default'` modes are accepted from clients
- `'bypassPermissions'` and `'acceptEdits'` are never allowed
- Server automatically selects appropriate mode based on operation type

### Human-in-the-Loop (HITL)

All tool usage in generation mode requires explicit approval:

1. Tool request triggers `canUseTool` callback
2. WebSocket notification sent to web portal
3. User reviews and approves/denies
4. Approval logged in audit trail
5. Tool execution proceeds only with approval

## Risk Classification

### Low Risk (Analysis Only)

- Read-only operations
- No system changes
- No tool execution
- Uses `'plan'` mode

### Medium Risk (Approved Remediation)

- Requires HITL approval
- Limited tool set
- Constrained execution environment
- Full audit logging

### High Risk (Future)

- Requires secondary approval
- Enhanced isolation (Podman/nsjail)
- Restricted capabilities
- Time-boxed execution

## Audit Requirements

All operations must log:

1. **Request Details**
   - Session ID
   - User identity
   - Request type (analysis/generation)
   - Requested tools

2. **Policy Application**
   - Applied permission mode
   - Filtered tool list
   - Security constraints

3. **Execution**
   - Tool invocations
   - Approval decisions
   - Execution results
   - Any denials or errors

## Implementation Checklist

- [ ] Implement mode detection logic (analysis vs generation)
- [ ] Configure server-side tool policy allowlist
- [ ] Build HITL approval workflow via WebSocket
- [ ] Add audit logging for all operations
- [ ] Validate permission mode restrictions
- [ ] Test tool filtering logic
- [ ] Verify `'plan'` mode prevents execution
- [ ] Ensure approval persistence in database
- [ ] Add metrics for approval rates
- [ ] Document policy exceptions

## Policy Updates

This policy should be reviewed and updated:

- After security incidents
- When adding new tools
- Before expanding to high-risk operations
- Quarterly security review cycle
