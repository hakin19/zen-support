# Environment Variables to SDK Options Mapping

This document defines the standard mapping between environment variables and the Claude Code SDK `Options` interface.

## Naming Convention

Environment variables follow the pattern `CLAUDE_<OPTION_NAME>` where `<OPTION_NAME>` is the snake_case version of the camelCase SDK option.

## Complete Mapping

| Environment Variable              | SDK Option Field             | Type           | Default                | Description                                        |
| --------------------------------- | ---------------------------- | -------------- | ---------------------- | -------------------------------------------------- |
| `ANTHROPIC_API_KEY`               | `apiKey`                     | string         | -                      | API key for authentication (required)              |
| `CLAUDE_MODEL`                    | `model`                      | string         | claude-3-opus-20240229 | Model to use                                       |
| `CLAUDE_MAX_TURNS`                | `maxTurns`                   | number         | undefined              | Maximum conversation turns                         |
| `CLAUDE_MAX_THINKING_TOKENS`      | `maxThinkingTokens`          | number         | undefined              | Maximum tokens for thinking process                |
| `CLAUDE_PERMISSION_MODE`          | `permissionMode`             | PermissionMode | 'default'              | Permission mode ('default' or 'plan' only for API) |
| `CLAUDE_ALLOWED_TOOLS`            | `allowedTools`               | string[]       | []                     | JSON array of allowed tool names                   |
| `CLAUDE_DISALLOWED_TOOLS`         | `disallowedTools`            | string[]       | []                     | JSON array of disallowed tool names                |
| `CLAUDE_CWD`                      | `cwd`                        | string         | process.cwd()          | Current working directory                          |
| `CLAUDE_ABORT_CONTROLLER`         | -                            | -              | -                      | Not configurable via env (runtime only)            |
| `CLAUDE_ADDITIONAL_DIRECTORIES`   | `additionalDirectories`      | string[]       | []                     | JSON array of additional directories               |
| `CLAUDE_APPEND_SYSTEM_PROMPT`     | `appendSystemPrompt`         | string         | undefined              | Text to append to system prompt                    |
| `CLAUDE_CUSTOM_SYSTEM_PROMPT`     | `customSystemPrompt`         | string         | undefined              | Replace default system prompt                      |
| `CLAUDE_FALLBACK_MODEL`           | `fallbackModel`              | string         | undefined              | Model to use if primary fails                      |
| `CLAUDE_INCLUDE_PARTIAL_MESSAGES` | `includePartialMessages`     | boolean        | false                  | Include partial message events                     |
| `CLAUDE_CODE_EXECUTABLE`          | `pathToClaudeCodeExecutable` | string         | auto-detected          | Path to Claude Code CLI                            |

## Type Conversion

```typescript
// Helper to parse environment variables to SDK Options
export function parseEnvToOptions(): Partial<Options> {
  const options: Partial<Options> = {};

  // String values
  if (process.env.ANTHROPIC_API_KEY) options.apiKey = process.env.ANTHROPIC_API_KEY;
  if (process.env.CLAUDE_MODEL) options.model = process.env.CLAUDE_MODEL;
  if (process.env.CLAUDE_CWD) options.cwd = process.env.CLAUDE_CWD;
  if (process.env.CLAUDE_FALLBACK_MODEL) options.fallbackModel = process.env.CLAUDE_FALLBACK_MODEL;
  if (process.env.CLAUDE_APPEND_SYSTEM_PROMPT)
    options.appendSystemPrompt = process.env.CLAUDE_APPEND_SYSTEM_PROMPT;
  if (process.env.CLAUDE_CUSTOM_SYSTEM_PROMPT)
    options.customSystemPrompt = process.env.CLAUDE_CUSTOM_SYSTEM_PROMPT;
  if (process.env.CLAUDE_CODE_EXECUTABLE)
    options.pathToClaudeCodeExecutable = process.env.CLAUDE_CODE_EXECUTABLE;

  // Number values
  if (process.env.CLAUDE_MAX_TURNS) options.maxTurns = parseInt(process.env.CLAUDE_MAX_TURNS, 10);
  if (process.env.CLAUDE_MAX_THINKING_TOKENS)
    options.maxThinkingTokens = parseInt(process.env.CLAUDE_MAX_THINKING_TOKENS, 10);

  // Boolean values
  if (process.env.CLAUDE_INCLUDE_PARTIAL_MESSAGES) {
    options.includePartialMessages = process.env.CLAUDE_INCLUDE_PARTIAL_MESSAGES === 'true';
  }

  // JSON array values
  if (process.env.CLAUDE_ALLOWED_TOOLS) {
    options.allowedTools = JSON.parse(process.env.CLAUDE_ALLOWED_TOOLS);
  }
  if (process.env.CLAUDE_DISALLOWED_TOOLS) {
    options.disallowedTools = JSON.parse(process.env.CLAUDE_DISALLOWED_TOOLS);
  }
  if (process.env.CLAUDE_ADDITIONAL_DIRECTORIES) {
    options.additionalDirectories = JSON.parse(process.env.CLAUDE_ADDITIONAL_DIRECTORIES);
  }

  // Enum values with validation
  if (process.env.CLAUDE_PERMISSION_MODE) {
    const mode = process.env.CLAUDE_PERMISSION_MODE as PermissionMode;
    // Server-side restriction: only allow 'default' or 'plan'
    if (['default', 'plan'].includes(mode)) {
      options.permissionMode = mode;
    }
  }

  return options;
}
```

## Security Considerations

1. **Permission Mode**: Server-side code should restrict `permissionMode` to safe values ('default' or 'plan')
2. **Tool Lists**: `allowedTools` from environment should be intersected with server policy
3. **Directories**: `additionalDirectories` should be validated against allowed paths
4. **API Key**: Should be stored securely and never logged

## Example .env File

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-api03-...

# Model Configuration
CLAUDE_MODEL=claude-3-opus-20240229
CLAUDE_MAX_TURNS=3
CLAUDE_MAX_THINKING_TOKENS=10000

# Permissions
CLAUDE_PERMISSION_MODE=default
CLAUDE_ALLOWED_TOOLS=["network_diagnostic","script_generator"]
CLAUDE_DISALLOWED_TOOLS=["file_write","bash"]

# Optional
CLAUDE_INCLUDE_PARTIAL_MESSAGES=true
CLAUDE_CWD=/app/workspace
```
