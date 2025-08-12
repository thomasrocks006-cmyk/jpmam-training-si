
// lib/events.js
import { EventEmitter } from "events";
export const bus = new EventEmitter();

// Helper to emit dashboard events consistently
export function emitDash(type, payload = {}) {
  bus.emit("dashboard:event", { type, ts: new Date().toISOString(), payload });
}
