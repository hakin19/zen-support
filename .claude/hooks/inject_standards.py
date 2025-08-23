#!/usr/bin/env python3
"""
UserPromptSubmit hook to inject coding standards and project context.
Also logs prompts for audit trail.
"""
import json
import sys
import os
from datetime import datetime
from pathlib import Path

def main():
    try:
        # Read input from stdin
        input_data = json.loads(sys.stdin.read())
        prompt = input_data.get('prompt', '')
        session_id = input_data.get('session_id', 'unknown')
        
        # Log the prompt for audit trail
        log_prompt(session_id, prompt, input_data.get('timestamp'))
        
        # Check if prompt relates to coding
        coding_keywords = [
            'code', 'implement', 'function', 'class', 'component',
            'fix', 'debug', 'refactor', 'test', 'api', 'endpoint',
            'typescript', 'javascript', 'react', 'node'
        ]
        
        is_coding_request = any(keyword in prompt.lower() for keyword in coding_keywords)
        
        if is_coding_request:
            # Inject coding standards and context
            print("📋 Project: Aizen vNE - AI-powered Virtual Network Engineer")
            print("🎯 Architecture: Monorepo with Nx, TypeScript 5.9.2, Node.js 20 LTS")
            print("✅ Standards:")
            print("  - TypeScript strict mode is enabled")
            print("  - Use ES2022 features (Node.js 20 compatible)")
            print("  - Follow existing patterns in the codebase")
            print("  - All code is auto-formatted with Prettier on save")
            print("  - ESLint rules are enforced (including import ordering)")
            print("  - Packages: @aizen/api, @aizen/web, @aizen/device-agent, @aizen/shared")
            print("---")
        
        # Exit successfully (allow prompt to proceed)
        sys.exit(0)
        
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON input: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}", file=sys.stderr)
        sys.exit(1)

def log_prompt(session_id, prompt, timestamp):
    """Log prompts for audit trail."""
    try:
        # Create logs directory if it doesn't exist
        log_dir = Path('.claude/logs')
        log_dir.mkdir(parents=True, exist_ok=True)
        
        # Create or append to prompts log
        log_file = log_dir / 'prompts.jsonl'
        
        log_entry = {
            'timestamp': timestamp or datetime.now().isoformat(),
            'session_id': session_id,
            'prompt': prompt[:500]  # Truncate very long prompts
        }
        
        with open(log_file, 'a') as f:
            f.write(json.dumps(log_entry) + '\n')
            
    except Exception as e:
        # Don't fail the hook if logging fails
        print(f"Warning: Could not log prompt: {e}", file=sys.stderr)

if __name__ == '__main__':
    main()