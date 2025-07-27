#!/bin/bash

# Strict TypeScript Check (CI-like)
set -e

echo "🔍 Running strict TypeScript checks (CI simulation)..."
echo "======================================================"

# Set CI-like environment
export CI=true
export NODE_ENV=production

# Check each package with strict TypeScript settings
packages=("core" "parser" "visitor" "react")

for pkg in "${packages[@]}"; do
    echo ""
    echo "🔍 Checking @ic-reactor/$pkg..."
    echo "--------------------------------"
    
    cd "packages/$pkg"
    
    # Run TypeScript with strict checking
    echo "Running: bunx tsc --noEmit --strict --noImplicitAny --strictNullChecks --strictFunctionTypes --strictBindCallApply --strictPropertyInitialization --noImplicitReturns --noImplicitThis --alwaysStrict"
    
    bunx tsc \
        --noEmit \
        --strict \
        --noImplicitAny \
        --strictNullChecks \
        --strictFunctionTypes \
        --strictBindCallApply \
        --strictPropertyInitialization \
        --noImplicitReturns \
        --noImplicitThis \
        --alwaysStrict \
        --pretty
    
    if [ $? -eq 0 ]; then
        echo "✅ $pkg passed strict TypeScript check"
    else
        echo "❌ $pkg failed strict TypeScript check"
        cd ../..
        exit 1
    fi
    
    cd ../..
done

echo ""
echo "✅ All packages passed strict TypeScript checks!"
