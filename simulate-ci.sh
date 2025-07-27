#!/bin/bash

# Simulate CI Environment - Clean Build Test
set -e

echo "🧪 Simulating CI Environment..."
echo "=================================="

# Save current state
echo "📦 Backing up current node_modules..."
if [ -d "node_modules" ]; then
    mv node_modules node_modules.backup
fi

# Clean all build artifacts
echo "🧹 Cleaning all build artifacts..."
bun run clean || true
find . -name "dist" -type d -exec rm -rf {} + 2>/dev/null || true

# Set CI environment variables
export CI=true
export NODE_ENV=production

echo "🔧 Setting CI environment variables:"
echo "CI=$CI"
echo "NODE_ENV=$NODE_ENV"

# Fresh install like CI
echo "📥 Fresh dependency installation (like CI)..."
bun install --frozen-lockfile

# Check TypeScript version and config
echo "🔍 TypeScript version and config:"
echo "TypeScript version: $(bunx tsc --version)"
echo "Node version: $(node --version)"
echo "Bun version: $(bun --version)"

# Test individual package builds in dependency order
echo "🏗️ Building packages in dependency order..."

echo "→ Building @ic-reactor/core..."
cd packages/core
bun run build
cd ../..

echo "→ Building @ic-reactor/parser..."
cd packages/parser  
bun run build
cd ../..

echo "→ Building @ic-reactor/visitor..."
cd packages/visitor
echo "🔍 Checking visitor dependencies..."
bunx tsc --noEmit --pretty --strict
if [ $? -eq 0 ]; then
    echo "✅ TypeScript check passed"
    bun run build
else
    echo "❌ TypeScript check failed"
    exit 1
fi
cd ../..

echo "→ Building @ic-reactor/react..."
cd packages/react
bun run build
cd ../..

echo "🎯 Running full Lerna build..."
bun run build

echo "✅ CI simulation completed successfully!"

# Restore original node_modules if backup exists
if [ -d "node_modules.backup" ]; then
    echo "🔄 Restoring original node_modules..."
    rm -rf node_modules
    mv node_modules.backup node_modules
fi
