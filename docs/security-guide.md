# Security Guide

## Overview

This document outlines security practices for the Aizen vNE project to prevent credential leaks and maintain secure development practices.

## Credential Management

### Environment Variables

All sensitive credentials are stored in environment variables and never committed to git:

- **Production credentials**: Stored in `.env` (gitignored)
- **Development credentials**: Use `.env.example` as template
- **Test credentials**: Use `.env.test` for local testing

### Required Credentials

```bash
# Supabase Configuration
SUPABASE_PROJECT_ID=your-project-id
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=eyJ...  # Public key, safe to expose to frontend
SUPABASE_SERVICE_KEY=eyJ... # SECRET - Backend only, never expose
SUPABASE_ACCESS_TOKEN=sbp_... # SECRET - For Supabase API/CLI access
DATABASE_URL=postgresql://postgres:password@db.your-project-id.supabase.co:5432/postgres

# External API Keys
CLAUDE_API_KEY=your-claude-api-key
EXA_API_KEY=your-exa-api-key  # UUID format
```

## Git Security

### Git-Secrets Protection

The repository is protected by git-secrets which prevents committing sensitive data:

```bash
# Install git-secrets (already done)
brew install git-secrets

# Install hooks (already done)
git secrets --install

# Register AWS patterns (already done)
git secrets --register-aws

# Custom patterns for this project (already configured):
# - JWT tokens: eyJ[A-Za-z0-9_/+=.-]*
# - Supabase tokens: sbp_[A-Za-z0-9]{40}
# - API keys: UUID format
# - Project IDs: cgesudxbpqocqwixecdx
```

### Testing Git-Secrets

```bash
# Scan repository for secrets
git secrets --scan

# Scan specific file
git secrets --scan filename

# Scan entire history (takes time)
git secrets --scan-history
```

## Protected File Patterns

### Always in .gitignore

```
.env
.env.local
.env.*.local
*.key
*.pem
secrets/
```

### Safe to Commit

- `.env.example` - Template with placeholder values
- `.env.test.example` - Test template
- Documentation with `your-key-here` placeholders

### Never Commit

- `.env` - Production credentials
- `.env.test` - Test credentials with real values
- API keys, tokens, passwords in any form
- Database connection strings with real credentials

## MCP Configuration Security

The `.mcp.json` file uses environment variable substitution:

```json
{
  "supabase": {
    "args": ["--project-ref=${SUPABASE_PROJECT_ID}"],
    "env": {
      "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}"
    }
  },
  "exa": {
    "env": {
      "EXA_API_KEY": "${EXA_API_KEY}"
    }
  }
}
```

## Incident Response

### If Credentials Are Exposed

1. **Immediate Actions**:

   ```bash
   # Remove from git history if committed
   git filter-branch --force --index-filter \
     'git rm --cached --ignore-unmatch .env' HEAD

   # Force push (DANGEROUS - coordinate with team)
   git push --force-with-lease
   ```

2. **Rotate All Exposed Credentials**:
   - Supabase: Generate new service keys in dashboard
   - API Keys: Regenerate in respective services
   - Database: Change passwords

3. **Update Environment Variables**:
   - Update `.env` with new credentials
   - Update production deployment configs
   - Notify team members

4. **Verify Security**:
   ```bash
   # Scan for any remaining secrets
   git secrets --scan-history
   ```

## Pre-commit Hooks

Git-secrets runs automatically on commit, but you can also run manually:

```bash
# Test before committing
git secrets --scan

# Add allowed patterns if needed (be very careful!)
git secrets --add --allowed 'pattern-that-should-be-allowed'
```

## Code Review Checklist

### Before Committing

- [ ] No `.env` files with real credentials
- [ ] No hardcoded API keys or tokens
- [ ] Environment variables used for all secrets
- [ ] `.env.example` updated with new variables
- [ ] Git-secrets passes without errors

### Before Merging PR

- [ ] No credentials in diff
- [ ] Documentation uses placeholder values
- [ ] Environment variable references are correct
- [ ] Test credentials don't leak to production

## Development Workflow

### Setting Up New Environment

1. **Copy environment template**:

   ```bash
   cp .env.example .env
   ```

2. **Fill in real credentials**:
   - Get Supabase keys from dashboard
   - Generate API keys from services
   - Never share these files

3. **Verify security**:
   ```bash
   git status  # Ensure .env is not tracked
   git secrets --scan  # Check for leaks
   ```

### Adding New Secrets

1. **Add to .env**:

   ```bash
   echo "NEW_API_KEY=your-actual-key" >> .env
   ```

2. **Add to .env.example**:

   ```bash
   echo "NEW_API_KEY=your-api-key-here" >> .env.example
   ```

3. **Add protection pattern**:

   ```bash
   git secrets --add 'pattern-for-new-key'
   ```

4. **Test protection**:
   ```bash
   git secrets --scan
   ```

## Monitoring and Alerts

### Regular Security Audits

- Monthly scan of git history: `git secrets --scan-history`
- Review .gitignore patterns
- Check for new credential types
- Update git-secrets patterns

### Team Education

- All developers must understand this guide
- Regular security training on credential handling
- Code review focuses on security

## Emergency Contacts

If you discover a security issue:

1. **Do NOT commit or push** anything that might make it worse
2. **Immediately notify** the security team
3. **Document** what was exposed and when
4. **Follow** the incident response process above

## Additional Resources

- [Git-secrets Documentation](https://github.com/awslabs/git-secrets)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/auth/security)
- [Environment Variable Security](https://12factor.net/config)

---

**Remember**: When in doubt, don't commit. It's easier to prevent exposure than to clean up after it.
