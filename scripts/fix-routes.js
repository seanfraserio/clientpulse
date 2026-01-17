#!/usr/bin/env node
// Post-build script to:
// 1. Fix _routes.json - exclude /api/* from Astro's SSR worker
// 2. Copy functions/ directory to dist/ for Pages Functions

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// 1. Fix _routes.json
const routesPath = path.join(projectRoot, 'dist', '_routes.json');

if (!fs.existsSync(routesPath)) {
  console.error('Error: dist/_routes.json not found. Run build first.');
  process.exit(1);
}

const routes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));

if (!routes.exclude.includes('/api/*')) {
  routes.exclude.push('/api/*');
  fs.writeFileSync(routesPath, JSON.stringify(routes, null, 2));
  console.log('✅ Added /api/* to _routes.json exclude list');
} else {
  console.log('ℹ️  /api/* already in exclude list');
}

console.log('Final _routes.json:');
console.log(JSON.stringify(routes, null, 2));

// 2. Copy functions/ directory to dist/
function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const functionsSource = path.join(projectRoot, 'functions');
const functionsDest = path.join(projectRoot, 'dist', 'functions');

if (fs.existsSync(functionsSource)) {
  copyDirSync(functionsSource, functionsDest);
  console.log('✅ Copied functions/ to dist/functions/');
} else {
  console.log('⚠️  No functions/ directory found');
}
