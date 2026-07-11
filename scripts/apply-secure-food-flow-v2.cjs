const fs = require("fs");
const path = require("path");

const sourcePath = path.join(__dirname, "apply-secure-food-flow.cjs");
const tempPath = path.join(__dirname, ".apply-secure-food-flow-v2.runtime.cjs");

const source = fs
  .readFileSync(sourcePath, "utf8")
  .replace('const path = "app/checkout.tsx";', 'const path = "app/(student)/checkout.tsx";');

fs.writeFileSync(tempPath, source);
try {
  require(tempPath);
} finally {
  fs.rmSync(tempPath, { force: true });
}
