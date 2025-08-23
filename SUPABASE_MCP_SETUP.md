# Supabase MCP Server Configuration Guide

## Overview

The Supabase MCP server has been added to your `.mcp.json` configuration. This enables Claude to interact with your Supabase project directly.

## Configuration Steps

### 1. Get Your Supabase Project Reference

1. Log in to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to Settings → General
4. Copy your **Reference ID** (looks like: `abcdefghijklmnop`)

### 2. Generate a Personal Access Token

1. Go to [Supabase Account Settings](https://supabase.com/dashboard/account/tokens)
2. Click "Generate New Token"
3. Give it a descriptive name (e.g., "MCP Server Access")
4. Copy the token immediately (you won't see it again)

### 3. Update the Configuration

Edit `.mcp.json` and replace the placeholder values:

- Replace `YOUR_PROJECT_REF` with your actual project reference ID
- Replace `YOUR_PERSONAL_ACCESS_TOKEN` with your generated token

## Features Available

The configured server provides access to:

### Database Tools

- `list_tables`: Lists all tables within specified schemas
- `list_extensions`: Lists all extensions in the database
- `list_migrations`: Lists all migrations in the database
- `apply_migration`: Applies SQL migrations (disabled in read-only mode)
- `execute_sql`: Executes SQL queries (read-only queries only)
- `generate_typescript_types`: Generates TypeScript types from database schema

### Documentation Tools

- `search_docs`: Searches Supabase documentation

### Project Management Tools

- `get_project_url`: Gets the API URL for your project
- `get_anon_key`: Gets the anonymous API key
- `get_logs`: Gets logs by service type (api, postgres, edge functions, auth, storage, realtime)

### Optional Features (Currently Disabled)

To enable additional features, modify the args in `.mcp.json`:

#### Remove Read-Only Mode

Remove `"--read-only"` to enable write operations

#### Enable Specific Feature Groups

Add `"--features=database,docs,storage,functions"` to enable specific tools

#### Enable Branching (Paid Plans)

Remove `--read-only` and add `"--features=branching"` for database branching

## Security Notes

1. **Keep your access token secure** - Never commit it to version control
2. **Read-only mode is enabled by default** for safety
3. **Project-scoped mode** limits access to only the specified project
4. Consider using environment variables for tokens in production

## Testing the Connection

After configuration, restart Claude and test with:
"Can you list the tables in my Supabase database?"

## Troubleshooting

If the server doesn't work:

1. Verify your project reference and token are correct
2. Check that Node.js is installed: `node --version`
3. Test the server directly: `npx -y @supabase/mcp-server-supabase@latest --help`

## Additional Resources

- [Supabase MCP Server Documentation](https://github.com/supabase-community/supabase-mcp)
- [Supabase Dashboard](https://supabase.com/dashboard)
- [MCP Protocol Documentation](https://modelcontextprotocol.io)
