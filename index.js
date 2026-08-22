import { requireCoreConfig } from "./src/config.js";
import { createCanonicalApp } from "./src/server-v2.js";

// Vercel's Express runtime invokes the exported application directly; it must
// not call app.listen(). Local development can continue to use the explicit
// start scripts while production exports the same canonical application.
requireCoreConfig();

const app = createCanonicalApp();

export default app;
