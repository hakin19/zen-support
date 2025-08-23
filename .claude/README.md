# Claude Code Hooks Configuration

This directory contains Claude Code hooks that automatically format, lint, and enhance code quality during Claude Code sessions.

## Overview

We use a **hybrid approach** combining:

1. **Git pre-commit hooks** (via Husky) - Catches issues before commits
2. **Claude Code hooks** - Provides real-time formatting and linting during Claude sessions

## Installed Hooks

### 1. PostToolUse Hook (`format_and_lint.sh`)

**Triggers:** After Claude edits/creates files (Edit, MultiEdit, Write tools)
**Actions:**

- Runs Prettier to format TypeScript/JavaScript files
- Runs ESLint with auto-fix for correctable issues
- Runs TypeScript type checking for the affected package
- Non-blocking: Shows warnings but doesn't prevent Claude from continuing

### 2. UserPromptSubmit Hook (`inject_standards.py`)

**Triggers:** When you submit a prompt to Claude
**Actions:**

- Detects coding-related requests
- Injects project context and coding standards
- Logs prompts to `.claude/logs/prompts.jsonl` for audit trail

## How It Works

1. When Claude edits a TypeScript/JavaScript file, the PostToolUse hook automatically:
   - Formats it with Prettier
   - Fixes ESLint issues where possible
   - Runs type checking to catch errors early

2. When you ask Claude to write code, the UserPromptSubmit hook:
   - Reminds Claude about project standards
   - Ensures consistent code style across the session

## Benefits

- **Real-time quality**: Code is formatted immediately as Claude works
- **Consistency**: Same formatting rules applied automatically
- **Audit trail**: All prompts are logged for review
- **Non-intrusive**: Hooks don't block Claude's workflow
- **Complementary**: Works alongside existing git hooks

## Configuration

The hooks are configured in `.claude/settings.json`. Claude Code automatically loads this configuration when you start a session in this project.

## Testing Hooks Manually

Test PostToolUse hook:

```bash
echo '{"tool_name": "Write", "tool_input": {"file_path": "path/to/file.ts"}}' | .claude/hooks/format_and_lint.sh
```

Test UserPromptSubmit hook:

```bash
echo '{"prompt": "write a function", "session_id": "test"}' | python3 .claude/hooks/inject_standards.py
```

## Logs

Prompt logs are stored in `.claude/logs/prompts.jsonl` (gitignored).

## Disabling Hooks

To temporarily disable hooks, rename or remove `.claude/settings.json`.

## Requirements

- Node.js and npm (for Prettier, ESLint, TypeScript)
- Python 3 (for inject_standards.py)
- jq (for JSON parsing in bash scripts)

## Troubleshooting

If hooks aren't working:

1. Check if scripts are executable: `chmod +x .claude/hooks/*.sh .claude/hooks/*.py`
2. Verify jq is installed: `which jq`
3. Check Claude Code recognizes the settings: Use `/hooks` command in Claude Code
4. Run Claude with debug flag: `claude --debug`

## Integration with Existing Tools

These Claude hooks complement but don't replace:

- **Husky pre-commit hooks**: Still run before git commits
- **VS Code formatting**: Still formats on save in VS Code
- **CI/CD checks**: Still validate in GitHub Actions

The goal is defense in depth - multiple layers of code quality enforcement.
