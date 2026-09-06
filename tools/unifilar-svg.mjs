#!/usr/bin/env node
// unifilar-svg.mjs — REBT-style single-line diagram (esquema unifilar) of a PV self-consumption
// installation, drawn from a JSON spec. Writes an SVG (A4 landscape, mm units) and, optionally, a PNG
// (via @resvg/resvg-js when installed, else ImageMagick `convert`).
//
//   node unifilar-svg.mjs spec.json unifilar.svg [unifilar.png]
//
// Layout: one row per inverter (strings → caja CC → inversor → protecciones CA), a common AC bus, then
// the head chain (antivertido, contador de generación, CGMP with IGA/ICP, contador bidireccional, red).
// Symbol geometry follows IEC 60617 as drawn by Suntropy's diagram module (feature/single-line-diagram).
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const spec = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const outSvg = process.argv[3] || "unifilar.svg";
const outPng = process.argv[4];

// ---------------------------------------------------------------- constants (mm)
const PAGE = { w: 297, h: 210, margin: 10 };
const TITLE_BLOCK = { w: 95, h: 50 };
const STROKE = 0.25, BOLD = 0.5, STUB = 1.5;
const FONT = "DejaVu Sans, Helvetica, Arial, sans-serif";
const F = { title: 4.2, sub: 2.6, label: 2.4, small: 2.1, tiny: 1.8 };
const STRING_PITCH = 13;

// ---------------------------------------------------------------- primitives (content layer)
const out = [];
const num = (n) => Number(n.toFixed(3));
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const line = (x1, y1, x2, y2, w = STROKE, extra = "") =>
  out.push(`<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="#000" stroke-width="${w}" ${extra}/>`);
const rect = (x, y, w, h, extra = "") => // `extra` may carry its own stroke colour (enclosures)
  out.push(`<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" fill="none"${extra.includes('stroke="') ? "" : ' stroke="#000"'} stroke-width="${STROKE}" ${extra}/>`);
const circle = (cx, cy, r, fill = "none") =>
  out.push(`<circle cx="${num(cx)}" cy="${num(cy)}" r="${r}" fill="${fill}" stroke="${fill === "none" ? "#000" : "none"}" stroke-width="${STROKE}"/>`);
const dot = (x, y) => circle(x, y, 0.5, "#000");
const text = (x, y, s, size = F.label, o = {}) => {
  if (s == null || s === "") return;
  out.push(`<text x="${num(x)}" y="${num(y)}" font-family="${FONT}" font-size="${size}"${o.bold ? ' font-weight="700"' : ""} text-anchor="${o.anchor || "start"}" fill="${o.color || "#000"}">${esc(s)}</text>`);
};
const textLines = (x, y, lines, size = F.label, o = {}) =>
  lines.filter((l) => l != null && l !== "").forEach((l, i) => text(x, y + i * size * 1.3, l, size, o));
// Word-wrap long labels so they stay under their symbol (n ≈ characters per line).
const wrap = (s, n = 26) => {
  if (s == null) return [];
  const words = String(s).split(/\s+/), lines = [];
  let cur = "";
  words.forEach((w) => { if ((cur + " " + w).trim().length > n && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim(); });
  if (cur) lines.push(cur);
  return lines;
};
const enclosure = (x, y, w, h, title) => {
  rect(x, y, w, h, 'stroke="#333" stroke-dasharray="1.4,0.9"');
  if (title) text(x + 1.5, y + 3.2, title, F.small, { bold: true, color: "#333" });
};

// ---------------------------------------------------------------- symbols (IEC 60617 style, centred at cx,cy)
const G = {
  panelString(cx, cy) {
    const w = 16, h = 9, l = cx - w / 2, r = cx + w / 2, t = cy - h / 2, b = cy + h / 2;
    rect(l, t, w, h);
    const tl = l + 0.6, tp = l + w * 0.45;
    line(tl, t + 0.6, tl, b - 0.6); line(tl, t + 0.6, tp, cy); line(tl, b - 0.6, tp, cy); line(tp, cy, r, cy);
    line(r, cy, r + STUB, cy);
    return { out: [r + STUB, cy], w, h };
  },
  fuse(cx, cy) {
    const w = 6, h = 3;
    rect(cx - w / 2, cy - h / 2, w, h); line(cx, cy - h / 2, cx, cy + h / 2);
    line(cx - w / 2 - STUB, cy, cx - w / 2, cy); line(cx + w / 2, cy, cx + w / 2 + STUB, cy);
    return { in: [cx - w / 2 - STUB, cy], out: [cx + w / 2 + STUB, cy] };
  },
  contact(cx, cy) {
    const w = 11, bl = cx - w / 2 + 1, br = cx + w / 2 - 1, tx = br - 0.4, ty = cy - 3;
    dot(bl, cy); dot(br, cy); line(bl, cy, tx, ty);
    line(cx - w / 2 - STUB, cy, cx - w / 2, cy); line(cx + w / 2, cy, cx + w / 2 + STUB, cy);
    return { in: [cx - w / 2 - STUB, cy], out: [cx + w / 2 + STUB, cy], tip: [tx, ty] };
  },
  breaker(cx, cy) { // automatic circuit breaker: contact with the IEC "x" at the moving tip
    const p = G.contact(cx, cy); const [tx, ty] = p.tip;
    line(tx - 0.8, ty - 0.8, tx + 0.8, ty + 0.8); line(tx - 0.8, ty + 0.8, tx + 0.8, ty - 0.8);
    return p;
  },
  disconnect(cx, cy) { // disconnector: contact with the bar across the moving tip
    const p = G.contact(cx, cy); const [tx, ty] = p.tip;
    line(tx - 0.35, ty - 1, tx + 0.35, ty + 1);
    return p;
  },
  differential(cx, cy) { const p = G.breaker(cx, cy); circle(cx, cy + 3, 1.6); return p; },
  iga(cx, cy) { const p = G.breaker(cx, cy); line(cx - 4.5, cy + 1.6, cx + 4.5, cy + 1.6, STROKE, 'stroke-dasharray="0.5,0.4"'); return p; },
  icp(cx, cy) { const p = G.contact(cx, cy); rect(cx - 6.5, cy - 6, 13, 12, 'stroke-dasharray="0.5,0.4"'); return p; },
  dps(cx, cy, lab, compact = false) { // surge protective device, vertical (top = live conductor, bottom = PE)
    const w = 4.5, h = 5, topStub = compact ? 1.5 : 4, botStub = compact ? 1.5 : 3, topY = cy - h / 2 - topStub;
    line(cx, topY, cx, cy - h / 2); rect(cx - w / 2, cy - h / 2, w, h);
    const x0 = cx - w / 2 + 0.7, y0 = cy + h / 2 - 0.7, x1 = cx + w / 2 - 0.7, y1 = cy - h / 2 + 0.7;
    line(x0, y0, x1, y1); line(x1, y1, x1 - 1.2, y1 + 0.2); line(x1, y1, x1 - 0.2, y1 + 1.2);
    text(cx + w / 2 + 0.8, cy + 0.8, lab, F.small, { bold: true });
    line(cx, cy + h / 2, cx, cy + h / 2 + botStub);
    return { in: [cx, topY], out: [cx, cy + h / 2 + botStub] };
  },
  meter(cx, cy, lab = "kWh") {
    const r = 4; circle(cx, cy, r); text(cx, cy + 0.9, lab, F.small, { anchor: "middle", bold: true });
    line(cx - r - STUB, cy, cx - r, cy); line(cx + r, cy, cx + r + STUB, cy);
    return { in: [cx - r - STUB, cy], out: [cx + r + STUB, cy] };
  },
  inverter(cx, cy, mppts = 1) {
    const vis = Math.max(1, mppts), w = 22, h = Math.max(16, 8 + vis * 4.4);
    const l = cx - w / 2, r = cx + w / 2, t = cy - h / 2, b = cy + h / 2;
    rect(l, t, w, h); line(l, b, r, t);
    text(l + 1.4, b - 1.2, "CC", F.small, { bold: true }); text(r - 4.8, t + 3.2, "CA", F.small, { bold: true });
    const ins = [];
    for (let i = 0; i < vis; i++) {
      const ty = t + 3.6 + i * 4;
      line(l - STUB, ty, l, ty); text(l + 0.9, ty + 0.7, `MPPT ${i + 1}`, F.tiny, { bold: true });
      ins.push([l - STUB, ty]);
    }
    line(r, cy, r + STUB, cy);
    return { ins, out: [r + STUB, cy], bottom: [cx, b], top: [cx, t], w, h };
  },
  inverterSmall(cx, cy) { rect(cx - 5, cy - 3, 10, 6); line(cx - 5, cy + 3, cx + 5, cy - 3); },
  battery(cx, cy) {
    line(cx - 7, cy, cx - 3, cy); line(cx - 3, cy - 2.5, cx - 3, cy + 2.5); line(cx - 2, cy - 1.2, cx - 2, cy + 1.2);
    line(cx, cy - 2.5, cx, cy + 2.5); line(cx + 1, cy - 1.2, cx + 1, cy + 1.2); line(cx + 1, cy, cx + 5, cy);
    return { in: [cx - 7, cy], out: [cx + 5, cy] };
  },
  relay(cx, cy) {
    const s = 7; rect(cx - s / 2, cy - s / 2, s, s); text(cx, cy + 1.4, "K", F.label, { anchor: "middle", bold: true });
    line(cx - s / 2 - STUB, cy, cx - s / 2, cy); line(cx + s / 2, cy, cx + s / 2 + STUB, cy);
    return { in: [cx - s / 2 - STUB, cy], out: [cx + s / 2 + STUB, cy] };
  },
  sensor(cx, cy) { circle(cx, cy, 2.4); return { in: [cx - 2.4, cy], out: [cx + 2.4, cy] }; }, // current transformer of the anti-injection relay
  grid(cx, cy) { line(cx - 7, cy, cx + 1, cy); line(cx + 1, cy - 3.5, cx + 1, cy + 3.5, BOLD); return { in: [cx - 7, cy] }; },
  ground(cx, cy) { // vertical earth, fed from the top
    line(cx, cy - 3, cx, cy); line(cx - 2, cy, cx + 2, cy); line(cx - 1.2, cy + 1.1, cx + 1.2, cy + 1.1); line(cx - 0.5, cy + 2.2, cx + 0.5, cy + 2.2);
    return { in: [cx, cy - 3] };
  },
};

// ---------------------------------------------------------------- label helpers
const ACTIVE = { "1F+N+PE": 2, "2F+N+PE": 3, "3F+N+PE": 4, "3F+PE": 3, "2P+PE": 2, "2P": 2 };
// Spanish plan notation "(activos)X(sección)+(PE) mm²" → two lines: "L2 · RZ1-K 0,6/1 kV" / "4X6+6 mm² · 12 m"
const fmtTramo = (t) => {
  if (!t) return [];
  if (typeof t === "string") return wrap(t, 24);
  const n = ACTIVE[t.conductores] ?? (t.fases === 3 ? 4 : 2);
  const pe = t.conductores === undefined || String(t.conductores).includes("PE");
  const sec = t.seccion != null ? `${n}X${t.seccion}${pe ? `+${t.pe ?? t.seccion}` : ""} mm²` : "";
  const l1 = [t.id, t.cable].filter(Boolean).join(" · ");
  const l2 = [sec, t.longitud != null ? `${t.longitud} m` : "", t.nota].filter(Boolean).join(" · ");
  return [l1, l2].filter(Boolean);
};
const used = new Set(); // symbol kinds that appear → legend
const use = (k) => { used.add(k); return k; };

// ---------------------------------------------------------------- layout
const inversores = spec.inversores && spec.inversores.length ? spec.inversores : [{ id: "INV1", strings: [{ id: "S1", n: 0 }] }];
const red = spec.red || {};
const cab = spec.cabecera || {};
const cuadro = spec.cuadro_ca || {};
const contentTop = PAGE.margin + 14;

// Shared column positions so the enclosures line up across rows.
const hasCaja = inversores.some((inv) => inv.caja_cc);
const X = { s: 8 };
X.cajaL = X.s + 36; X.cajaW = 48; X.cajaR = X.cajaL + X.cajaW;
X.invL = hasCaja ? X.cajaR + 22 : X.s + 36;
X.invC = X.invL + 11; X.invR = X.invL + 22 + STUB;
X.brk = X.invR + 36; X.dif = X.brk + 30; X.bus = X.dif + 16;
X.cuadroL = X.brk - 11; X.cuadroR = X.bus + 8;

const rows = [];
let y = contentTop;
inversores.forEach((inv) => {
  const strings = inv.strings && inv.strings.length ? inv.strings : [{ id: "S1", n: 0 }];
  const nS = strings.length;
  const rowTop = y;
  const firstY = rowTop + 8;
  const yC = firstY + ((nS - 1) * STRING_PITCH) / 2;
  const lastY = firstY + (nS - 1) * STRING_PITCH;
  const invH = Math.max(16, 8 + Math.max(1, inv.mppts || 1) * 4.4);
  let bottom = Math.max(lastY + 14, yC + invH / 2 + 12);
  if (inv.bateria) bottom = Math.max(bottom, yC + invH / 2 + 24);
  if (inv.caja_cc) bottom = Math.max(bottom, lastY + 34);
  rows.push({ inv, strings, rowTop, firstY, yC, lastY, bottom });
  y = bottom + 4;
});
const yHead = rows[0].yC; // head chain sits on the first row's centre line
const yBusBottom = rows[rows.length - 1].yC;

// ---------------------------------------------------------------- rows
rows.forEach(({ inv, strings, rowTop, firstY, yC, lastY }, i) => {
  const mppts = Math.max(1, inv.mppts || 1);
  const stringPorts = strings.map((s, k) => {
    const sy = firstY + k * STRING_PITCH;
    const p = G.panelString(X.s, sy); use("panelString");
    const lab = [s.id, s.n ? `${s.n} × ${s.modulo || spec.modulo?.modelo || "módulo"}` : null, s.mppt ? `MPPT ${s.mppt}` : null].filter(Boolean).join(" · ");
    text(X.s - 8, sy + 8.2, lab, F.small);
    return { y: sy, x: p.out[0], mppt: Math.min(s.mppt || Math.min(k + 1, mppts), mppts) };
  });
  // DC line description under the last string label
  textLines(X.s - 8, lastY + 8.2 + 3, fmtTramo(inv.tramo_cc), F.small);

  const invP = G.inverter(X.invC, yC, mppts); use("inverter");
  textLines(X.invL - 1, yC + invP.h / 2 + 3.6, [
    ...wrap(inv.id ? `${inv.id} · ${inv.modelo || "inversor"}` : inv.modelo, 30),
    [inv.p_kw ? `${inv.p_kw} kW` : null, inv.fases ? `${inv.fases}F` : null, inv.mppts ? `${inv.mppts} MPPT` : null].filter(Boolean).join(" · "),
    ...wrap(inv.integra, 30),
  ], F.small);

  // strings grouped by MPPT input
  const byMppt = new Map();
  stringPorts.forEach((sp) => { (byMppt.get(sp.mppt) || byMppt.set(sp.mppt, []).get(sp.mppt)).push(sp); });
  const groups = [...byMppt.entries()].sort((a, b) => a[0] - b[0]);

  if (inv.caja_cc) {
    // Caja CC: a gPV fuse per string, a DC bus and a disconnector per MPPT output, one SPD to PE.
    const c = inv.caja_cc;
    const boxTop = rowTop + 1, boxBottom = lastY + 22;
    enclosure(X.cajaL, boxTop, X.cajaW, boxBottom - boxTop, c.nombre || (inversores.length > 1 ? `Caja CC ${i + 1}` : "Caja CC"));
    const xFuse = X.cajaL + 9, xBus = X.cajaL + 19, xDisc = X.cajaL + 33;
    let lastOutY = yC;
    groups.forEach(([m, list]) => {
      list.forEach((sp) => {
        line(sp.x, sp.y, xFuse - 3 - STUB, sp.y);
        if (c.fusibles) { G.fuse(xFuse, sp.y); use("fuse"); line(xFuse + 3 + STUB, sp.y, xBus, sp.y); }
        else line(xFuse - 3 - STUB, sp.y, xBus, sp.y);
        if (list.length > 1) dot(xBus, sp.y);
      });
      const yOut = list.length > 1 ? (list[0].y + list[list.length - 1].y) / 2 : list[0].y;
      if (list.length > 1) { line(xBus, list[0].y, xBus, list[list.length - 1].y, BOLD); dot(xBus, yOut); }
      line(xBus, yOut, xDisc - 5.5 - STUB, yOut);
      if (c.seccionador) { G.disconnect(xDisc, yOut); use("disconnect"); } else line(xDisc - 5.5 - STUB, yOut, xDisc + 5.5 + STUB, yOut);
      line(xDisc + 5.5 + STUB, yOut, X.cajaR, yOut);
      // caja output → MPPT tick
      const tick = invP.ins[m - 1] || invP.ins[0];
      const xj = X.cajaR + 6 + (m - 1) * 3;
      line(X.cajaR, yOut, xj, yOut); line(xj, yOut, xj, tick[1]); line(xj, tick[1], tick[0], tick[1]);
      lastOutY = yOut;
    });
    if (c.dps) { // SPD hangs from the last DC output, inside the box
      const xD = X.cajaR - 5, yD = lastY + 12;
      dot(xD, lastOutY); line(xD, lastOutY, xD, yD - 6.5);
      G.dps(xD, yD, "CC"); use("dps"); text(xD - 4.2, yD + 5.4, "PE", F.tiny, { bold: true });
    }
    textLines(X.cajaL, boxBottom + 3.4, [c.fusibles ? `Fusibles ${c.fusibles}` : null, c.seccionador ? `Seccionador ${c.seccionador}` : null, c.dps ? `DPS ${c.dps}` : null].filter(Boolean), F.small);
    textLines(X.cajaR + 1.5, rowTop + 3.2, fmtTramo(inv.tramo_cc_inv), F.small);
  } else {
    // strings straight into the MPPT inputs (inverter integrates DC switch/SPD; ≤ 2 strings per MPPT → no fuses)
    const xJ = X.invL - 9;
    groups.forEach(([m, list]) => {
      const tick = invP.ins[m - 1] || invP.ins[0];
      list.forEach((sp) => { line(sp.x, sp.y, xJ, sp.y); if (list.length > 1) dot(xJ, sp.y); });
      const yj = list.length > 1 ? (list[0].y + list[list.length - 1].y) / 2 : list[0].y;
      if (list.length > 1) { line(xJ, list[0].y, xJ, list[list.length - 1].y, BOLD); dot(xJ, yj); }
      line(xJ, yj, xJ + 4, yj); line(xJ + 4, yj, xJ + 4, tick[1]); line(xJ + 4, tick[1], tick[0], tick[1]);
    });
  }
  // battery under the inverter
  if (inv.bateria) {
    const b = inv.bateria, yB = yC + invP.h / 2 + 14, xB = X.invC - 14;
    G.battery(xB, yB); use("battery");
    line(xB + 5, yB, X.invC, yB); line(X.invC, yB, X.invC, invP.bottom[1]);
    textLines(xB - 8, yB + 5.4, [...wrap(b.modelo || "Batería", 22), [b.kwh ? `${b.kwh} kWh` : null, b.kw ? `${b.kw} kW` : null].filter(Boolean).join(" · ")], F.small);
  }
  // AC protections of this inverter line
  const pr = inv.proteccion_ca || {};
  line(invP.out[0], yC, X.brk - 5.5 - STUB, yC);
  textLines(X.invR + 1.5, yC - 5.4, fmtTramo(inv.tramo_ca), F.small);
  const first = pr.seccionador ? ["disconnect", "Seccionador", pr.seccionador] : ["breaker", "Magnetotérmico", pr.magnetotermico || ""];
  const second = pr.seccionador && pr.magnetotermico ? ["breaker", "Magnetotérmico", pr.magnetotermico] : ["differential", "Diferencial", pr.diferencial || ""];
  const slots = [ [X.brk, first], [X.dif, second] ];
  slots.forEach(([cx, [kind, name, rating] ]) => {
    G[kind](cx, yC); use(kind);
    text(cx, yC - 5.4, name, F.tiny, { anchor: "middle" });
    textLines(cx, yC + (kind === "differential" ? 7.6 : 6.4), wrap(rating, 24), F.small, { anchor: "middle" });
  });
  line(X.brk + 5.5 + STUB, yC, X.dif - 5.5 - STUB, yC);
  line(X.dif + 5.5 + STUB, yC, X.bus, yC);
  if (rows.length > 1) dot(X.bus, yC);
});

// ---------------------------------------------------------------- cuadro CA enclosure, bus, SPD and PE
const lastRow = rows[rows.length - 1];
const cuadroTop = rows[0].rowTop + 1;
const cuadroBottom = lastRow.bottom + (cuadro.dps ? 18 : 4);
enclosure(X.cuadroL, cuadroTop, X.cuadroR - X.cuadroL, cuadroBottom - cuadroTop, cuadro.nombre || "Cuadro CA FV");
if (rows.length > 1) line(X.bus, yHead, X.bus, yBusBottom, BOLD);
if (cuadro.dps) {
  const yD = lastRow.bottom + 6;
  if (rows.length === 1) dot(X.bus, yBusBottom);
  line(X.bus, yBusBottom, X.bus, yD - 6.5, rows.length > 1 ? BOLD : STROKE);
  G.dps(X.bus, yD, "CA"); use("dps");
  G.ground(X.bus, yD + 8.5); use("ground");
  // labels to the left of the bus so they never cross the enclosure border
  textLines(X.bus - 2.5, yD - 1, wrap(`DPS ${cuadro.dps}`, 30), F.small, { anchor: "end" });
  textLines(X.bus - 2.5, yD + 7.2, wrap(`PE${cuadro.tierra ? " · " + cuadro.tierra : ""}`, 30), F.tiny, { anchor: "end" });
}

// ---------------------------------------------------------------- head chain: bus → antivertido → contador gen → CGMP → contador → red
const tramoCgmp = fmtTramo(spec.tramo_cgmp);
let tramoDrawn = false;
const drawTramoCgmp = (fromX) => { if (!tramoDrawn) { textLines(fromX + 1.5, yHead - 5.4, tramoCgmp, F.small); tramoDrawn = true; } };
const gap = () => (tramoDrawn || tramoCgmp.length === 0 ? 14 : 30);
let prevX = X.bus;
let x = X.bus;
let cgmpR = X.bus;
const chain = [];
if (spec.antivertido) chain.push({ kind: "antivertido", data: spec.antivertido });
if (spec.contador_generacion) chain.push({ kind: "contador_gen", data: spec.contador_generacion });
chain.push({ kind: "cgmp" }, { kind: "contador" }, { kind: "red" });
chain.forEach((item) => {
  if (item.kind === "antivertido") {
    x = prevX + gap() + 5;
    line(prevX, yHead, x - 3.5 - STUB, yHead); drawTramoCgmp(prevX);
    G.relay(x, yHead); use("relay");
    const xS = x + 10; G.sensor(xS, yHead); use("sensor"); // measurement toroid downstream + dashed control link
    line(x + 3.5 + STUB, yHead, xS - 2.4, yHead); line(xS + 2.4, yHead, xS + 4, yHead);
    const d = 'stroke-dasharray="0.8,0.6"';
    line(xS, yHead - 2.4, xS, yHead - 6, STROKE, d); line(xS, yHead - 6, x, yHead - 6, STROKE, d); line(x, yHead - 6, x, yHead - 3.5, STROKE, d);
    textLines(x - 6, yHead + 7.4, ["Antivertido", ...wrap(item.data.modelo, 24), ...wrap(item.data.nota, 24)], F.small);
    prevX = xS + 4; x = xS;
  } else if (item.kind === "contador_gen") {
    x = prevX + gap() + 6;
    line(prevX, yHead, x - 4 - STUB, yHead); drawTramoCgmp(prevX);
    G.meter(x, yHead, "kWh"); use("meter");
    textLines(x - 9, yHead + 7.6, ["Contador generación", ...wrap(item.data.texto || item.data.modelo, 22)], F.small);
    prevX = x + 4 + STUB;
  } else if (item.kind === "cgmp") {
    const items = [{ k: "iga", lab: cab.iga || "" }];
    if (cab.icp) items.push({ k: "icp", lab: cab.icp });
    const boxL = prevX + gap() + 2, boxW = items.length * 26 + 4;
    enclosure(boxL, yHead - 14, boxW, 30, cab.nombre || "CGMP");
    let cx = boxL + 2 + 5.5 + STUB + 3;
    line(prevX, yHead, cx - 5.5 - STUB, yHead); drawTramoCgmp(prevX);
    items.forEach((it, k) => {
      if (k > 0) line(cx - 26 + 5.5 + STUB, yHead, cx - 5.5 - STUB, yHead);
      G[it.k](cx, yHead); use(it.k);
      text(cx, yHead - (it.k === "icp" ? 7.6 : 5.4), it.k.toUpperCase(), F.tiny, { anchor: "middle" });
      textLines(cx, yHead + 8.4, wrap(it.lab, 24), F.small, { anchor: "middle" });
      cx += 26;
    });
    prevX = cx - 26 + 5.5 + STUB;
    cgmpR = boxL + boxW;
    if (cab.nota) textLines(boxL, yHead + 19.5, wrap(cab.nota, 34), F.tiny);
  } else if (item.kind === "contador") {
    x = Math.max(prevX, cgmpR) + 12;
    line(prevX, yHead, x - 4 - STUB, yHead);
    G.meter(x, yHead, "kWh"); use("meter");
    textLines(x - 10, yHead + 7.6, [...wrap(cab.contador || "Contador bidireccional", 24), ...wrap(cab.contador_nota, 24)], F.small);
    prevX = x + 4 + STUB;
  } else if (item.kind === "red") {
    x = prevX + 26;
    line(prevX, yHead, x - 7, yHead);
    G.grid(x, yHead); use("grid");
    textLines(x - 6, yHead + 7.2, [...wrap(cab.red || `Red BT ${red.tension || ""} V`, 22), red.icc_ka ? `Icc cabecera ${red.icc_ka} kA` : null], F.small);
    x += 6;
  }
});
const xMax = Math.max(x + 16, X.cuadroR + 4);
const yMaxContent = Math.max(cuadroBottom, yHead + 26) + 4;

// ---------------------------------------------------------------- page chrome (page space, not scaled)
const chrome = [];
const ch = (s) => chrome.push(s);
const chText = (x, y, s, size, o = {}) => { if (s == null || s === "") return; ch(`<text x="${num(x)}" y="${num(y)}" font-family="${FONT}" font-size="${size}"${o.bold ? ' font-weight="700"' : ""} text-anchor="${o.anchor || "start"}" fill="#000">${esc(s)}</text>`); };
const cj = spec.cajetin || {};
const cut = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));

// title + subtitle
chText(PAGE.margin, PAGE.margin + 4.5, `ESQUEMA UNIFILAR — ${cj.titulo || "Instalación fotovoltaica de autoconsumo"}`, F.title, { bold: true });
const sub = [red.tension ? `${red.tension} V` : null, red.fases ? `${red.fases}F+N` : null, "50 Hz", red.neutro ? `esquema ${red.neutro}` : null, red.modalidad, red.icc_ka ? `Icc cabecera ${red.icc_ka} kA` : null].filter(Boolean).join(" · ");
chText(PAGE.margin, PAGE.margin + 9, sub, F.sub);
// frame
ch(`<rect x="${PAGE.margin / 2}" y="${PAGE.margin / 2}" width="${PAGE.w - PAGE.margin}" height="${PAGE.h - PAGE.margin}" fill="none" stroke="#000" stroke-width="0.35"/>`);
// title block (cajetín)
const tb = { x: PAGE.w - PAGE.margin - TITLE_BLOCK.w, y: PAGE.h - PAGE.margin - TITLE_BLOCK.h };
ch(`<rect x="${tb.x}" y="${tb.y}" width="${TITLE_BLOCK.w}" height="${TITLE_BLOCK.h}" fill="none" stroke="#000" stroke-width="0.35"/>`);
ch(`<line x1="${tb.x}" y1="${tb.y + 8}" x2="${tb.x + TITLE_BLOCK.w}" y2="${tb.y + 8}" stroke="#000" stroke-width="0.25"/>`);
chText(tb.x + 2, tb.y + 5.5, cut(cj.empresa || "Suntropy", 40), F.sub, { bold: true });
chText(tb.x + TITLE_BLOCK.w - 2, tb.y + 5.5, "Esquema unifilar", F.small, { anchor: "end" });
[ ["Proyecto", cj.proyecto], ["Técnico", cj.tecnico], ["Emplazamiento", cj.emplazamiento], ["Municipio", cj.municipio], ["Titular", cj.titular] ]
  .filter(([, v]) => v).forEach(([k, v], i) => { chText(tb.x + 2, tb.y + 13 + i * 5, k, F.tiny, { bold: true }); chText(tb.x + 24, tb.y + 13 + i * 5, cut(v, 52), F.small); });
const footY = tb.y + TITLE_BLOCK.h - 3;
ch(`<line x1="${tb.x}" y1="${footY - 5}" x2="${tb.x + TITLE_BLOCK.w}" y2="${footY - 5}" stroke="#000" stroke-width="0.25"/>`);
[ ["FECHA", cj.fecha || new Date().toISOString().slice(0, 10)], ["ESCALA", cj.escala || "S/E"], ["Nº PLANO", cj.plano || "01"] ].forEach(([k, v], i) => {
  const cx = tb.x + 2 + i * 31; chText(cx, footY - 1.6, k, F.tiny, { bold: true }); chText(cx + 15, footY - 1.6, String(v), F.small);
});
// legend: only the symbols used, three columns
const LEGEND = {
  panelString: "String fotovoltaico (módulos en serie)", fuse: "Fusible gPV", disconnect: "Seccionador / corte en carga", breaker: "Interruptor automático magnetotérmico",
  differential: "Interruptor diferencial", iga: "Interruptor general automático (IGA)", icp: "ICP (control de potencia)", dps: "Protección contra sobretensiones (DPS)",
  inverter: "Inversor CC/CA", battery: "Batería", meter: "Contador de energía", relay: "Relé de vertido cero (antivertido)", sensor: "Transformador de intensidad", grid: "Red de distribución BT", ground: "Puesta a tierra (PE)",
};
const legendKinds = Object.keys(LEGEND).filter((k) => used.has(k));
const legX = PAGE.margin, legW = tb.x - PAGE.margin - 6, cols = legendKinds.length > 9 ? 4 : 3, perCol = Math.ceil(legendKinds.length / cols), pitch = 10;
const legH = perCol * pitch + 7, legY = PAGE.h - PAGE.margin - legH;
ch(`<rect x="${legX}" y="${legY}" width="${legW}" height="${legH}" fill="none" stroke="#000" stroke-width="0.25"/>`);
chText(legX + 2, legY + 3.8, "LEYENDA", F.small, { bold: true });
const saved = out.length;
legendKinds.forEach((k, i) => {
  const col = Math.floor(i / perCol), row = i % perCol;
  const cx = legX + 11 + col * (legW / cols), cy = legY + 11 + row * pitch;
  if (k === "dps") G.dps(cx, cy, "", true); else if (k === "ground") G.ground(cx, cy - 1); else if (k === "inverter") G.inverterSmall(cx, cy); else G[k](cx, cy);
  chText(cx + 12, cy + 0.7, LEGEND[k], F.tiny);
});
chrome.push(...out.splice(saved)); // legend glyphs belong to the page layer
chText(legX, legY - 2, spec.nota || "Borrador preparado por Alexandria (Suntropy) a partir del estudio. Pendiente de revisión, cálculo definitivo y firma por técnico competente / empresa instaladora habilitada.", F.tiny);

// ---------------------------------------------------------------- assemble: content scaled to the free area above legend/title block
const availW = PAGE.w - 2 * PAGE.margin;
const availH = Math.min(legY, tb.y) - 5 - contentTop;
const scale = Math.min(1, availW / xMax, availH / (yMaxContent - contentTop));
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.w}mm" height="${PAGE.h}mm" viewBox="0 0 ${PAGE.w} ${PAGE.h}">
<rect width="${PAGE.w}" height="${PAGE.h}" fill="#fff"/>
${chrome.join("\n")}
<g transform="translate(${PAGE.margin} ${num(contentTop)}) scale(${num(scale)}) translate(0 ${num(-contentTop)})">
${out.join("\n")}
</g>
</svg>
`;
fs.writeFileSync(outSvg, svg);
console.log(`svg: ${outSvg} (${(svg.length / 1024).toFixed(1)} kB, escala ${scale.toFixed(2)}, símbolos: ${legendKinds.join(", ")})`);

if (outPng) {
  let done = false;
  try {
    const { Resvg } = await import("@resvg/resvg-js");
    const r = new Resvg(svg, { fitTo: { mode: "width", value: 3508 }, background: "#ffffff", font: { loadSystemFonts: true, defaultFontFamily: "DejaVu Sans" } });
    fs.writeFileSync(outPng, r.render().asPng());
    done = true;
  } catch (e) {
    console.error(`@resvg/resvg-js no disponible (${e.message}); probando ImageMagick`);
  }
  if (!done) execFileSync("convert", ["-density", "300", "-background", "white", outSvg, outPng], { stdio: "inherit" });
  console.log(`png: ${outPng} (${(fs.statSync(outPng).size / 1024).toFixed(0)} kB, 3508 px de ancho = A4 apaisado a 300 dpi)`);
}
