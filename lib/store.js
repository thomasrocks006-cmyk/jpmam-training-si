import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "..", "data");

export function readJson(name) {
  const p = path.join(dataDir, name);
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

export function writeJson(name, data) {
  const p = path.join(dataDir, name);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}
