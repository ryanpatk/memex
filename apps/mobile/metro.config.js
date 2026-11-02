// Metro for a standalone app that imports @memex/core from source
// (../../packages/core, linked by npm as a file: dependency). The web app's
// npm workspace at the repo root is deliberately not used: it pins its own
// React, so mixing the two would risk duplicate copies.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const coreRoot = path.resolve(projectRoot, '../../packages/core');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [coreRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

// Core's bare imports (supabase-js) resolve from this app's node_modules, as
// if imported here, so one copy of each dependency ends up in the bundle.
const resolveFromApp = path.join(projectRoot, 'package.json');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const fromCore = context.originModulePath.startsWith(coreRoot + path.sep);
  const bare = !moduleName.startsWith('.') && !path.isAbsolute(moduleName);
  if (fromCore && bare) {
    return context.resolveRequest({ ...context, originModulePath: resolveFromApp }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
