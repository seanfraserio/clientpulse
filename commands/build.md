# Build Command

## Purpose
Compile and build the ClientPulse project for development or production.

## Prerequisites
- Node.js v18+ installed
- Dependencies installed (`npm install`)

## Usage

### Development Build
```bash
npm run dev
```

### Production Build
```bash
npm run build
```

### Build with Type Checking
```bash
npm run build:check
```

## Build Steps

1. **Clean**: Remove previous build artifacts
2. **Compile**: Transpile TypeScript to JavaScript
3. **Bundle**: Bundle assets and dependencies
4. **Optimize**: Minify and compress for production

## Common Issues

### Out of Memory
```bash
# Increase Node memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

### Type Errors
```bash
# Run type check separately to see all errors
npx tsc --noEmit
```

## Output
- Development: `dist/` directory with source maps
- Production: `dist/` directory, minified, no source maps
