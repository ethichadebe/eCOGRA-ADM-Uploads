// src/index.js
import "dotenv/config";
import express from "express";
import { createRunDir } from "./utils/artifacts.js";
import { probeRun } from "./automation/probe.js";
import { loginProbe } from "./automation/loginProbe.js";
import { navToUploadPage } from "./automation/navToUploadPage.js";


const log = (...a) => console.log(new Date().toISOString(), ...a);

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV || "development", time: new Date().toISOString() });
});

// Existing M2 probe
app.post("/api/probe", async (req, res, next) => {
  try {
    const { url, waitFor } = req.body || {};
    if (!url) throw Object.assign(new Error("url is required"), { status: 400 });
    const runDir = createRunDir();
    const result = await probeRun({ url, waitFor }, runDir);
    res.json({ runDir, ...result });
  } catch (err) { next(err); }
});

// NEW: M3 login probe — body only has username/password
app.post("/api/login-probe", async (req, res, next) => {
    console.log("HIT /api/login-probe");            // <— add
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      throw Object.assign(new Error("username and password are required"), { status: 400 });
    }
    const runDir = createRunDir();
    const result = await loginProbe({ username, password }, runDir);
    res.json({ runDir, ...result });
  } catch (err) { next(err); }
});

// NEW: Login → close cookies → SSO jump → upload page
app.post("/api/nav/upload", async (req, res, next) => {
    console.log("HIT /api/nav/upload");             // <— add

    try {
      const { username, password } = req.body || {};
      if (!username || !password) {
        throw Object.assign(new Error("username and password are required"), { status: 400 });
      }
      const runDir = createRunDir();
      const result = await navToUploadPage({ username, password }, runDir);
      res.json({ runDir, ...result });
    } catch (err) { next(err); }
  });

// Central error handler
app.use((err, req, res, next) => {
  log("ERR", err?.message);
  res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
});

const port = Number(process.env.PORT || 5000);
app.listen(port, () => log(`API listening on http://localhost:${port}`));
