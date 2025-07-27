#!/bin/bash

# Simulate CI Environment - Fixed Build Order
set -e

echo "🧪 Simulating CI Environment (Fixed)..."
echo "========================================"

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

# Test builds in correct dependency order (Parser first, then Core)
echo "🏗️ Building packages in correct dependency order..."

echo "→ Building @ic-reactor/parser (no dependencies)..."
cd packages/parser  
bun run build
cd ../..

echo "→ Building @ic-reactor/core (depends on parser)..."
cd packages/core
bun run build
cd ../..

echo "→ Building @ic-reactor/visitor (depends on core)..."
cd packages/visitor
bun run build
cd ../..

echo "→ Building @ic-reactor/react (depends on core)..."
cd packages/react
echo "🔍 First checking with strict TypeScript (like CI)..."
bunx tsc --noEmit --strict --noImplicitReturns
if [ $? -eq 0 ]; then
    echo "✅ TypeScript strict check passed"
    bun run build
else
    echo "❌ TypeScript strict check failed - this is the CI issue!"
    echo "💡 The errors shown above are what's causing CI failures"
    cd ../..
    exit 1
fi
cd ../..

echo "🎯 Testing full Lerna build with proper ordering..."
bun run build

echo "✅ CI simulation completed successfully!"

# Restore original node_modules if backup exists
if [ -d "node_modules.backup" ]; then
    echo "🔄 Restoring original node_modules..."
    rm -rf node_modules
    mv node_modules.backup node_modules
fi
