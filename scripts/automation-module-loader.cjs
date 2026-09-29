// Local operational verification: load server TypeScript without starting Next.js.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
require('@next/env').loadEnvConfig(path.resolve(__dirname, '..'));
const original = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...rest) {
  if (name === 'server-only') return require.resolve('./automation-server-only.cjs');
  if (name.startsWith('@/')) name = path.resolve(__dirname, '../src', name.slice(2));
  return original.call(this, name, parent, ...rest);
};
require.extensions['.ts'] = function(module, filename) {
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  }}).outputText;
  module._compile(code, filename);
};
