
// lib/mandatesStore.js
// Single source of truth for mandates + breaches (in-memory demo)

const MANDATES = [
  {
    id: "M-AUS-EQ-SS-001",
    client: "SunSuper",
    strategy: "Australian Equity Core",
    benchmark: "S&P/ASX 200 (TR)",
    bands: { trackingErrorBps: [0, 250] },
    kpis: { ytdReturnPct: 4.7, trackingErrorBps: 310 },
    breaches: [
      {
        id: "BR-SS-001",
        type: "Tracking Error",
        severity: "Critical",
        status: "Open",
        opened: new Date(Date.now() - 2*24*60*60*1000).toISOString(), // 2 days ago
        note: "TE exceeded +200 bps band vs benchmark."
      }
    ]
  },
  {
    id: "M-AU-BOND-QBE-001",
    client: "QBE Insurance",
    strategy: "AU Core Bond",
    benchmark: "Bloomberg AusBond Composite",
    bands: { issuerConcentrationPct: 8 },
    kpis: { ytdReturnPct: 2.3 },
    breaches: [
      {
        id: "BR-QBE-002",
        type: "Concentration",
        severity: "Medium",
        status: "Open",
        opened: new Date(Date.now() - 6*24*60*60*1000).toISOString(), // 6 days ago
        note: "Single issuer exposure reached alert level."
      },
      {
        id: "BR-QBE-001",
        type: "Liquidity",
        severity: "Low",
        status: "Resolved",
        opened: new Date(Date.now() - 18*24*60*60*1000).toISOString(),
        resolved: new Date(Date.now() - 15*24*60*60*1000).toISOString(),
        note: "Small off-benchmark line hit liquidity tripwire."
      }
    ]
  }
];

export function getMandates() {
  return MANDATES;
}

export function findMandateById(id) {
  return MANDATES.find(m => m.id === id) || null;
}

export function getBreaches({ status } = {}) {
  // Flatten breaches with mandate context
  const flat = [];
  for (const m of MANDATES) {
    for (const b of (m.breaches || [])) {
      if (status && b.status !== status) continue;
      flat.push({
        id: b.id,
        mandateId: m.id,
        client: m.client,
        type: b.type,
        severity: b.severity,
        status: b.status,
        opened: b.opened,
        resolved: b.resolved || null,
        note: b.note || ""
      });
    }
  }
  // newest first
  flat.sort((a,b) => new Date(b.opened) - new Date(a.opened));
  return flat;
}
