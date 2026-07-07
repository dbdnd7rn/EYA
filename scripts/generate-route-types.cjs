const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const outputDir = path.join(projectRoot, ".expo", "types");

process.env.EXPO_ROUTER_APP_ROOT = path.join(projectRoot, "app");
fs.mkdirSync(outputDir, { recursive: true });

require("expo-router/build/typed-routes").regenerateDeclarations(outputDir);

// Expo Router debounces this generator, so keep Node alive until it writes.
setTimeout(() => {}, 1300);
