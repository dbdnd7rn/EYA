import { requireCoreConfig } from "./config.js";
import { createCanonicalApp } from "./server-v2.js";

// Vercel's Express preset may auto-detect src/server.js as the application
// entrypoint. Keep this file as a thin compatibility export so both Vercel's
// detected entry and the repository-root index.js use the exact same canonical
// provider-neutral EYA application.
requireCoreConfig();

const app = createCanonicalApp();

export default app;
