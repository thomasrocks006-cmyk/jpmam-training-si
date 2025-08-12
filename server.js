
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";

import authRoutes from "./routes/auth.js";
import approvalsRoutes from "./routes/approvals.js";
import clientsRoutes from "./routes/clients.js";
import reportsRoutes from "./routes/reports.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

const allow = process.env.ALLOW_ORIGIN || "*";
app.use(cors({ origin: allow, credentials: true }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "jpmam-training-sim", time: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/approvals", approvalsRoutes);
app.use("/api/clients", clientsRoutes);
app.use("/api/reports", reportsRoutes);

// Serve static frontend
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
