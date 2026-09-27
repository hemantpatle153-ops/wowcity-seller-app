// Learn more https://docs.expo.dev/guides/customizing-metro/
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// The in-app fake backend (src/mock) is only for demo builds (EXPO_PUBLIC_MOCK=1). Everywhere else
// "@/mock/server" resolves to a stub, so no fixtures or demo sign-ins end up in a shop's app.
const mock = process.env.EXPO_PUBLIC_MOCK === "1" || process.env.EXPO_PUBLIC_MOCK === "true";
const stub = path.join(__dirname, "src/mock/disabled.ts");
const defaultResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (!mock && (moduleName === "@/mock/server" || /(^|\/)mock\/server$/.test(moduleName))) {
    return { type: "sourceFile", filePath: stub };
  }
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
