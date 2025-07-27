#!/bin/bash

# Smarter TypeScript Check with Build Dependencies
set -e

echo "🔍 Running TypeScript checks with dependency awareness..."
echo "========================================================"

# Set CI-like environment
export CI=true
export NODE_ENV=production

echo "🏗️ Building dependencies first (like CI would)..."

echo "→ Building @ic-reactor/parser (no TypeScript dependencies)..."
cd packages/parser  
bun run build
cd ../..

echo "→ Now checking @ic-reactor/core (parser is available)..."
cd packages/core
bunx tsc --noEmit --strict --noImplicitReturns --pretty
if [ $? -eq 0 ]; then
    echo "✅ Core TypeScript check passed"
else
    echo "❌ Core TypeScript check failed"
    cd ../..
    exit 1
fi
cd ../..

echo "→ Checking @ic-reactor/visitor..."
cd packages/visitor
bunx tsc --noEmit --strict --noImplicitReturns --pretty
if [ $? -eq 0 ]; then
    echo "✅ Visitor TypeScript check passed"
else
    echo "❌ Visitor TypeScript check failed"
    cd ../..
    exit 1
fi
cd ../..

echo "→ Checking @ic-reactor/react..."
cd packages/react
bunx tsc --noEmit --strict --noImplicitReturns --pretty
if [ $? -eq 0 ]; then
    echo "✅ React TypeScript check passed"
else
    echo "❌ React TypeScript check failed"
    cd ../..
    exit 1
fi
cd ../..

echo ""
echo "✅ All packages passed strict TypeScript checks with proper dependencies!"
