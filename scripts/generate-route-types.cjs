const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const outputDir = path.join(projectRoot, ".expo", "types");

process.env.EXPO_ROUTER_APP_ROOT = path.join(projectRoot, "app");
fs.mkdirSync(outputDir, { recursive: true });

const expoCliPath = require.resolve("@expo/cli/package.json", {
  paths: [path.dirname(require.resolve("expo/package.json"))],
});
const routerServerPath = require.resolve("@expo/router-server/build/typed-routes", {
  paths: [path.dirname(expoCliPath)],
});
require(routerServerPath).regenerateDeclarations(outputDir);

// Expo Router debounces this generator, so keep Node alive until it writes.
setTimeout(() => {}, 1300);
