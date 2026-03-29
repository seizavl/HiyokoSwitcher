#!/bin/bash
# TypeScript compilation script for Electron main process

echo "Compiling Electron main process..."
npx tsc -p electron/tsconfig.json

if [ $? -eq 0 ]; then
  echo "✅ Electron compilation successful"
else
  echo "❌ Electron compilation failed"
  exit 1
fi
