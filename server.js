import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";

// Existing route imports here...
import authRoutes from "./routes/auth.js";
import approvalsRoutes from "./routes/approvals.js";
import clientsRoutes from "./routes/clients.js";
import reportsRoutes from "./routes/reports.js";
import mandatesRoutes from "./routes/mandates.js";
import dashboardRoutes from "./routes/dashboard.js";
import marketRoutes from "./routes/market.js";
import adminRoutes from "./routes/admin.js";
import rfpsRoutes from "./routes/rfps.js";
import usersRoutes from "./routes/users.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

// CORS
const allow = process.env.ALLOW_ORIGIN || "*";
app.use(cors({ origin: allow, credentials: true }));

// 1. Serve static files from /public exactly like Canvas
app.use(express.static(path.join(__dirname, "public")));

// 2. Inject a CSS reset (optional but keeps layout consistent)
app.get("/reset.css", (req, res) => {
  res.type("text/css").send(`
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; background: #f9f9f9; }
  `);
});

// API routes
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "jpmam-sim-api", time: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/approvals", approvalsRoutes);
app.use("/api/clients", clientsRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/mandates", mandatesRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/market", marketRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/rfps", rfpsRoutes);
app.use("/api/users", usersRoutes);

// 3. Always serve index.html for unknown frontend routes (SPA fallback)
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 404 for unmatched API routes
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API + frontend running on http://localhost:${port}`));