import express from "express";
import { requireCoreConfig } from "./config.js";
import { createCanonicalApp } from "./server-v2.js";

// Vercel's Express preset statically looks for an entrypoint that imports
// Express directly. Keep that explicit import here while delegating all route
// construction to the canonical provider-neutral EYA application.
void express;

requireCoreConfig();

const app = createCanonicalApp();

export default app;
