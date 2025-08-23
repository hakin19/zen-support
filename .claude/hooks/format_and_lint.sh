#!/bin/bash
# PostToolUse hook for auto-formatting and linting files after Claude edits them

# Read JSON input from stdin
INPUT=$(cat)

# Extract tool name and file path using jq
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

# Only process Edit, MultiEdit, and Write tools
if [[ ! "$TOOL_NAME" =~ ^(Edit|MultiEdit|Write)$ ]]; then
    exit 0
fi

# Check if file path exists and is a TypeScript/JavaScript file
if [[ -z "$FILE_PATH" ]] || [[ ! -f "$FILE_PATH" ]]; then
    exit 0
fi

# Check if file is a TypeScript/JavaScript file
if [[ ! "$FILE_PATH" =~ \.(ts|tsx|js|jsx)$ ]]; then
    exit 0
fi

echo "🔧 Auto-formatting and linting: $FILE_PATH"

# Change to project root (assuming hook runs from project root)
cd "$(dirname "$0")/../.." || exit 1

# Run Prettier to format the file
if command -v npx &> /dev/null; then
    echo "  📝 Running Prettier..."
    npx prettier --write "$FILE_PATH" 2>/dev/null || true
fi

# Run ESLint with auto-fix
if command -v npx &> /dev/null && [ -f "eslint.config.js" ]; then
    echo "  🔍 Running ESLint with auto-fix..."
    npx eslint "$FILE_PATH" --fix 2>/dev/null || true
fi

# Determine which package the file belongs to
PACKAGE_DIR=""
if [[ "$FILE_PATH" =~ packages/api/ ]]; then
    PACKAGE_DIR="packages/api"
elif [[ "$FILE_PATH" =~ packages/web/ ]]; then
    PACKAGE_DIR="packages/web"
elif [[ "$FILE_PATH" =~ packages/device-agent/ ]]; then
    PACKAGE_DIR="packages/device-agent"
elif [[ "$FILE_PATH" =~ packages/shared/ ]]; then
    PACKAGE_DIR="packages/shared"
fi

# Run TypeScript type checking for the affected package
if [[ -n "$PACKAGE_DIR" ]] && [[ -f "$PACKAGE_DIR/tsconfig.json" ]]; then
    echo "  ✅ Type-checking $PACKAGE_DIR..."
    cd "$PACKAGE_DIR" || exit 0
    npx tsc --noEmit 2>&1 | head -20 || {
        # If type checking fails, show error but don't block
        echo "  ⚠️  Type checking found issues (non-blocking)"
    }
fi

echo "✨ Formatting and linting complete for $FILE_PATH"
exit 0