#!/bin/bash

echo "🔍 ESLint CI Issue Detection Demo"
echo "================================="
echo ""

echo "📋 Running ESLint to check for the exact same issues that caused CI failures:"
echo ""

# Check specifically for consistent-return issues
echo "🎯 Checking for 'consistent-return' issues (the main CI problem):"
bunx eslint packages/react/src/hooks/useActor.ts 2>/dev/null | grep -E "consistent-return|expected no return value" || echo "✅ No consistent-return issues found!"

echo ""
echo "📊 Summary:"
echo "• ESLint rule '@typescript-eslint/consistent-return' catches the exact same"
echo "  'not all code paths return a value' issues that TypeScript strict mode finds in CI"
echo ""
echo "• This means you can now catch CI failures locally by running 'bun run lint'"
echo "  before pushing to GitHub!"
echo ""
echo "🚀 To fix these issues automatically, run:"
echo "   bun run lint:fix"
echo ""
echo "🧪 To run only critical CI checks, run:"
echo "   bun run lint:ci-check"
