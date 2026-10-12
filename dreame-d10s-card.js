/*
 * Dreame D10S Card
 * A Lovelace card for the Tasshack dreame_vacuum integration, tuned for the Dreame D10S.
 * Independent implementation; not affiliated with the official Dreame Vacuum Card.
 */

const CARD_VERSION = "1.2.1";

const SUCTION_LEVELS = [
  { value: "quiet", label: "Quiet", icon: "mdi:fan-speed-1", code: 0 },
  { value: "standard", label: "Standard", icon: "mdi:fan-speed-2", code: 1 },
  { value: "strong", label: "Strong", icon: "mdi:fan-speed-3", code: 2 },
  { value: "turbo", label: "Turbo", icon: "mdi:fan-plus", code: 3 },
];

const WATER_VOLUMES = [
  { value: "low", label: "Low", icon: "mdi:water-outline", code: 1 },
  { value: "medium", label: "Medium", icon: "mdi:water", code: 2 },
  { value: "high", label: "High", icon: "mdi:water-plus", code: 3 },
];

const CLEANING_MODES = [
  { value: "sweeping", label: "Sweep", icon: "mdi:broom", code: 0 },
  { value: "mopping", label: "Mop", icon: "mdi:water-outline", code: 1 },
  { value: "sweeping_and_mopping", label: "Sweep & Mop", icon: "mdi:robot-vacuum", code: 2 },
];

// D10S consumables: [sensor key suffix, reset service value, label, icon]
const CONSUMABLES = [
  ["main_brush_left", "main_brush", "Main brush", "mdi:brush"],
  ["side_brush_left", "side_brush", "Side brush", "mdi:pinwheel-outline"],
  ["filter_left", "filter", "Filter", "mdi:air-filter"],
  ["sensor_dirty_left", "sensor", "Sensors", "mdi:radar"],
  ["mop_pad_left", "mop_pad", "Mop pad", "mdi:square-rounded-outline"],
];

const SWITCHES = [
  ["carpet_boost", "Carpet boost", "mdi:rug"],
  ["resume_cleaning", "Resume after charging", "mdi:play-circle-outline"],
  ["obstacle_avoidance", "Obstacle avoidance", "mdi:sign-caution"],
  ["customized_cleaning", "Customized room cleaning", "mdi:home-edit-outline"],
  ["child_lock", "Child lock", "mdi:lock-outline"],
];

const MODES = [
  { id: "spot", icon: "mdi:map-marker-outline", label: "Spot" },
  { id: "room", icon: "mdi:floor-plan", label: "Room" },
  { id: "all", icon: "mdi:home-outline", label: "All" },
  { id: "zone", icon: "mdi:selection-drag", label: "Zone" },
];

const EDITOR_TOOLS = [
  { id: "rooms", icon: "mdi:floor-plan", label: "Rooms" },
  { id: "nogo", icon: "mdi:cancel", label: "No-go zones" },
  { id: "nomop", icon: "mdi:water-off-outline", label: "No-mop zones" },
  { id: "wall", icon: "mdi:wall", label: "Virtual walls" },
  { id: "order", icon: "mdi:order-numeric-ascending", label: "Cleaning order" },
];

// Shape kinds drawn on the map. Lines have two endpoints, rects have four corners.
const SHAPES = {
  zone: { line: false, max: 5, color: "30,160,215" },
  nogo: { line: false, max: 10, color: "230,60,60" },
  nomop: { line: false, max: 10, color: "70,120,255" },
  wall: { line: true, max: 10, color: "230,60,60" },
  split: { line: true, max: 1, color: "255,255,255" },
};

// Room types understood by vacuum_set_segment_type (integration's segment type codes)
const ROOM_TYPES = [
  [0, "Room", "mdi:home-outline"],
  [1, "Living Room", "mdi:sofa-outline"],
  [2, "Primary Bedroom", "mdi:bed-king-outline"],
  [15, "Secondary Bedroom", "mdi:bed-single-outline"],
  [3, "Study", "mdi:bookshelf"],
  [4, "Kitchen", "mdi:chef-hat"],
  [5, "Dining Hall", "mdi:room-service-outline"],
  [6, "Bathroom", "mdi:toilet"],
  [7, "Balcony", "mdi:flower-outline"],
  [8, "Corridor", "mdi:foot-print"],
  [9, "Utility Room", "mdi:archive-outline"],
  [10, "Closet", "mdi:hanger"],
  [11, "Meeting Room", "mdi:presentation"],
  [12, "Office", "mdi:monitor-shimmer"],
  [13, "Fitness Area", "mdi:dumbbell"],
  [14, "Recreation Area", "mdi:gamepad-variant-outline"],
];

// Side panel / sheet sections reachable from the panel tabs
const SECTIONS = [
  { id: "settings", icon: "mdi:tune-variant", label: "Cleaning settings" },
  { id: "consumables", icon: "mdi:wrench-outline", label: "Maintenance" },
  { id: "history", icon: "mdi:history", label: "Cleaning history" },
  { id: "maps", icon: "mdi:layers-outline", label: "Maps" },
  { id: "device", icon: "mdi:cog-outline", label: "All settings" },
];

const MAX_SPOTS = 5;
const TAP_SLOP = 6;
const WIDE_BREAKPOINT = 820;

/* ---------------- floor plan (raw map data) ---------------- */

const FP_ROOM_COLORS = ["#3b77c4", "#4fa3d9", "#6f9442", "#b09a3c", "#8c6bb8", "#3d9c8f"];
const FP_COLORS = { 255: "#6b7480", 254: "#7d8792", 253: "#8a929b", 252: "#5d636b", 251: "#555b62" };

// Renders the integration's map-data JSON (camera.*_map_data) to a canvas.
// Returns an image URL, a vacuum<->image transform and exact per-room pixel masks.
function renderFloorPlan(json, opts = {}) {
  const size = json?.size;
  if (!json || json.empty_map || !size || !json.data) return null;
  const [left, top, , , w, h, grid, rotation = 0, crop = [0, 0, 0, 0]] = size;
  const cw = w - crop[0] - crop[2];
  const ch = h - crop[1] - crop[3];
  if (cw <= 0 || ch <= 0) return null;
  const s = Math.max(2, Math.min(6, Math.round(900 / Math.max(cw, ch))));
  const steps = (((rotation || 0) / 90) % 4 + 4) % 4;
  const W0 = cw * s;
  const H0 = ch * s;

  // un-rotated image px for a vacuum point
  const base = (vx, vy) => ({
    x: ((vx - left) / grid - crop[0]) * s,
    y: ((h * grid - 1 - (vy - top)) / grid - crop[1]) * s,
  });
  const rot = (p) => {
    let { x, y } = p;
    let ww = W0;
    let hh = H0;
    for (let i = 0; i < steps; i++) {
      const t = y;
      y = ww - x;
      x = t;
      [ww, hh] = [hh, ww];
    }
    return { x, y };
  };
  const unrot = (p) => {
    let { x, y } = p;
    // inverse of `steps` quarter turns
    const dims = [];
    let ww = W0;
    let hh = H0;
    for (let i = 0; i < steps; i++) {
      dims.push(ww);
      [ww, hh] = [hh, ww];
    }
    for (let i = steps - 1; i >= 0; i--) {
      const t = x;
      x = dims[i] - y;
      y = t;
    }
    return { x, y };
  };
  const transform = {
    toMap: (vx, vy) => rot(base(vx, vy)),
    toVacuum: (px, py) => {
      const p = unrot({ x: px, y: py });
      return { x: left + (p.x / s + crop[0]) * grid, y: top + h * grid - 1 - (p.y / s + crop[1]) * grid };
    },
  };

  const segs = {};
  (json.segments || []).forEach((sg) => (segs[sg[0]] = { colorIndex: sg[6] }));
  const hidden = new Set(json.hidden_segments || []);

  const c = document.createElement("canvas");
  c.width = W0;
  c.height = H0;
  const g = c.getContext("2d");
  const runs = (layer, fn) => {
    const d = json.data[layer];
    if (!d) return;
    for (let i = 0; i + 2 < d.length; i += 3) fn(d[i] - crop[0], h - 1 - d[i + 1] - crop[1], d[i + 2]);
  };
  const fill = (layer, color) => {
    g.fillStyle = color;
    runs(layer, (x, y, n) => g.fillRect(x * s, y * s, n * s, s));
  };

  const masks = {};
  const layers = Object.keys(json.data).map(Number);
  [254, 253, 252].forEach((l) => fill(l, FP_COLORS[l]));
  for (const l of layers) {
    if (l < 1 || l > 199) continue;
    const id = l > 100 ? l - 100 : l;
    if (hidden.has(id)) continue;
    const ci = segs[id]?.colorIndex ?? id;
    fill(l, FP_ROOM_COLORS[Math.abs(ci) % FP_ROOM_COLORS.length]);
    if (l > 100) fill(l, "rgba(255,255,255,0.12)");
  }
  [251, 255].forEach((l) => fill(l, FP_COLORS[l]));
  if (json.data[512]) {
    g.fillStyle = "rgba(255,255,255,0.18)";
    runs(512, (x, y, n) => {
      for (let i = 0; i < n; i++) if ((x + i + y) % 2 === 0) g.fillRect((x + i) * s, y * s, s, s);
    });
  }

  // apply rotation into the output canvas
  let out = c;
  if (steps) {
    out = document.createElement("canvas");
    out.width = steps % 2 ? H0 : W0;
    out.height = steps % 2 ? W0 : H0;
    const o = out.getContext("2d");
    o.translate(out.width / 2, out.height / 2);
    o.rotate((-Math.PI / 2) * steps);
    o.drawImage(c, -W0 / 2, -H0 / 2);
  }
  const og = out.getContext("2d");

  // room masks from the actual pixels, in output space
  const mW = out.width;
  const mH = out.height;
  // a grid cell's top-left corner, once rotated, becomes a different corner of the cell
  const dx = steps === 2 || steps === 3 ? -s : 0;
  const dy = steps === 1 || steps === 2 ? -s : 0;
  const cells = {};
  for (const l of layers) {
    if (l < 1 || l > 199) continue;
    const id = l > 100 ? l - 100 : l;
    const list = (cells[id] = cells[id] || []);
    runs(l, (x, y, n) => {
      for (let i = 0; i < n; i++) {
        const p = rot({ x: (x + i) * s, y: y * s });
        list.push(Math.round(p.x) + dx, Math.round(p.y) + dy);
      }
    });
  }
  for (const [id, list] of Object.entries(cells)) {
    if (!list.length) continue;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < list.length; i += 2) {
      x0 = Math.min(x0, list[i]);
      y0 = Math.min(y0, list[i + 1]);
      x1 = Math.max(x1, list[i] + s);
      y1 = Math.max(y1, list[i + 1] + s);
    }
    const box = { x0: Math.max(0, x0), y0: Math.max(0, y0), x1: Math.min(mW, x1), y1: Math.min(mH, y1) };
    const bw = box.x1 - box.x0;
    const bh = box.y1 - box.y0;
    if (bw <= 0 || bh <= 0) continue;
    const bits = new Uint8Array(bw * bh);
    for (let i = 0; i < list.length; i += 2)
      for (let yy = 0; yy < s; yy++)
        for (let xx = 0; xx < s; xx++) {
          const X = list[i] + xx - box.x0;
          const Y = list[i + 1] + yy - box.y0;
          if (X >= 0 && Y >= 0 && X < bw && Y < bh) bits[Y * bw + X] = 1;
        }
    masks[id] = { box, bw, bh, bits };
  }

  // path, charger, robot
  const T = transform.toMap;
  if (Array.isArray(json.path) && opts.path !== false) {
    og.lineWidth = Math.max(1, s / 2);
    og.lineJoin = "round";
    for (const p of json.path) {
      if (!Array.isArray(p) || p.length < 5) continue;
      og.strokeStyle = p[0] === 2 ? "rgba(120,200,255,0.55)" : "rgba(255,255,255,0.55)";
      og.beginPath();
      for (let i = 1; i + 1 < p.length; i += 2) {
        const q = T(p[i], p[i + 1]);
        if (i === 1) og.moveTo(q.x, q.y);
        else og.lineTo(q.x, q.y);
      }
      og.stroke();
    }
  }
  if (json.charger_position) {
    const q = T(json.charger_position[0], json.charger_position[1]);
    og.fillStyle = "#35c46f";
    og.beginPath();
    og.arc(q.x, q.y, s * 2.4, 0, Math.PI * 2);
    og.fill();
    og.fillStyle = "#fff";
    og.fillRect(q.x - s * 0.5, q.y - s * 1.2, s, s * 2.4);
  }
  if (json.robot_position) {
    const q = T(json.robot_position[0], json.robot_position[1]);
    const a = (((json.robot_position[2] || 0) + (rotation || 0)) * Math.PI) / 180;
    og.fillStyle = "#fff";
    og.strokeStyle = "#3a3a3a";
    og.lineWidth = Math.max(1, s / 2);
    og.beginPath();
    og.arc(q.x, q.y, s * 3, 0, Math.PI * 2);
    og.fill();
    og.stroke();
    og.strokeStyle = "#1ea0d7";
    og.beginPath();
    og.moveTo(q.x, q.y);
    og.lineTo(q.x + Math.cos(a) * s * 2.6, q.y - Math.sin(a) * s * 2.6);
    og.stroke();
  }

  return { url: out.toDataURL(), width: out.width, height: out.height, transform, masks };
}

const isIgnored = (o) => /ignored/i.test(o?.ignore_status || "") && !/^not/i.test(o.ignore_status);

const titleCase = (s) =>
  String(s ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* ---------------- geometry ---------------- */

// Affine transform from three calibration pairs (vacuum mm -> image px).
function buildTransform(points) {
  if (!Array.isArray(points) || points.length < 3) return null;
  const [p0, p1, p2] = points;
  const v = [p0.vacuum, p1.vacuum, p2.vacuum];
  const m = [p0.map, p1.map, p2.map];
  const det = (a) =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const A = v.map((p) => [p.x, p.y, 1]);
  const D = det(A);
  if (!D) return null;
  const solve = (rhs) =>
    [0, 1, 2].map((col) => det(A.map((row, i) => row.map((val, j) => (j === col ? rhs[i] : val)))) / D);
  const [a, b, c] = solve(m.map((p) => p.x));
  const [d, e, f] = solve(m.map((p) => p.y));
  const inv = a * e - b * d;
  if (!inv) return null;
  return {
    toMap: (x, y) => ({ x: a * x + b * y + c, y: d * x + e * y + f }),
    toVacuum: (px, py) => {
      const X = px - c;
      const Y = py - f;
      return { x: (e * X - b * Y) / inv, y: (-d * X + a * Y) / inv };
    },
  };
}

const normRect = (z) => ({
  ...z,
  x0: Math.min(z.x0, z.x1),
  y0: Math.min(z.y0, z.y1),
  x1: Math.max(z.x0, z.x1),
  y1: Math.max(z.y0, z.y1),
});

/* ---------------- styles ---------------- */

const STYLE = `
:host {
  /* follow the active theme; --dreame-accent-color still overrides */
  --dvc-accent: var(--dreame-accent-color, var(--primary-color, #1ea0d7));
  --dvc-accent-text: var(--dreame-accent-text-color, #fff);
  /* solid surface for menus and dropdowns (glass themes keep this opaque) */
  --dvc-menu: var(--md-menu-container-color, var(--card-background-color, #1c1c1c));
  /* sheets use the dialog surface, so glass themes give them their frosted look */
  --dvc-popup: var(--ha-dialog-surface-background, var(--dvc-menu));
  --dvc-popup-filter: var(--ha-dialog-surface-backdrop-filter, none);
  --dvc-radius: var(--ha-card-border-radius, 12px);
  --dvc-surface-2: var(--frosted-glass-control-surface, rgba(127,127,127,0.14));
  --dvc-surface-3: rgba(127,127,127,0.24);
  --dvc-warn: var(--warning-color, #e0a000);
  --dvc-text: var(--primary-text-color, #e1e1e1);
  --dvc-text-2: var(--secondary-text-color, #9b9b9b);
  --dvc-danger: var(--error-color, #db4437);
  display: block;
}
ha-card { overflow: hidden; position: relative; color: var(--dvc-text); }
.header { display: grid; grid-template-columns: 40px 1fr 40px; align-items: center; padding: 12px 8px 4px; }
.titles { text-align: center; min-width: 0; }
.title { font-size: 16px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.subtitle { font-size: 12px; color: var(--dvc-text-2); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.subtitle.error { color: var(--dvc-danger); }
.icon-btn { width: 40px; height: 40px; border: 0; border-radius: 50%; background: none; color: inherit; cursor: pointer; display: grid; place-items: center; padding: 0; }
.icon-btn:hover { background: var(--dvc-surface-2); }
.icon-btn[disabled] { opacity: .35; cursor: default; }
.icon-btn.accent { color: var(--dvc-accent); }
.stats { display: flex; justify-content: center; gap: 28px; padding: 6px 12px 10px; font-size: 13px; }
.stat { display: flex; align-items: center; gap: 6px; font-weight: 600; cursor: pointer; }
.stat ha-icon { --mdc-icon-size: 18px; color: var(--dvc-text); }
.stat small { font-weight: 400; font-size: 10px; color: var(--dvc-text-2); margin-left: 1px; }

.map { position: relative; margin: 0 12px; border-radius: 12px; overflow: hidden; background: rgba(0,0,0,0.25);
  touch-action: none; user-select: none; -webkit-user-select: none; min-height: 220px; }
.editing .map { margin-top: 8px; box-shadow: 0 0 0 2px var(--dvc-accent); }
.map.no-map { display: grid; place-items: center; color: var(--dvc-text-2); font-size: 13px; }
.viewport { position: relative; transform-origin: 0 0; will-change: transform; --inv: 1; }
.viewport img, .viewport canvas { display: block; width: 100%; height: auto; pointer-events: none; -webkit-user-drag: none; }
.viewport canvas { position: absolute; inset: 0; height: 100%; }
.layer { position: absolute; inset: 0; }
svg.lines { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
svg.lines .hit { pointer-events: stroke; cursor: move; stroke: transparent; }
svg.lines .inactive .hit { pointer-events: none; }

.room { position: absolute; transform: translate(-50%, -50%) scale(var(--inv)); display: flex; align-items: center; gap: 4px;
  background: rgba(30,30,30,0.82); color: #fff; border-radius: 999px; padding: 4px; cursor: pointer;
  transition: background .15s; box-shadow: 0 1px 4px rgba(0,0,0,.35); white-space: nowrap; }
.room ha-icon { --mdc-icon-size: 18px; width: 22px; height: 22px; display: grid; place-items: center; }
.room .name { display: none; font-size: 12px; padding-right: 6px; }
.room.selected, .room.named { z-index: 1; }
.room.selected { background: var(--dvc-accent); padding-left: 4px; }
.room.selected .name, .room.named .name { display: inline; }
.room .order { font-size: 11px; background: #fff; color: var(--dvc-accent); border-radius: 50%; width: 18px; height: 18px; display: grid; place-items: center; font-weight: 700; }
.room .order.ghost { background: rgba(255,255,255,.25); color: #fff; }
.room.passive { pointer-events: none; opacity: .5; }
.room.static { pointer-events: none; opacity: .85; }

.shape { position: absolute; border: 2px solid rgb(var(--c)); background: rgba(var(--c), 0.28); box-shadow: 0 0 0 1px rgba(0,0,0,.3); cursor: move; box-sizing: border-box; }
.shape.zone { border-color: #fff; }
.shape.inactive, .handle.inactive { pointer-events: none; opacity: .55; }
.handle { position: absolute; width: 14px; height: 14px; border-radius: 50%; background: #fff; transform: translate(-50%,-50%) scale(var(--inv));
  box-shadow: 0 1px 3px rgba(0,0,0,.4); cursor: grab; }
.shape .handle.br { left: 100%; top: 100%; cursor: nwse-resize; }
.shape .handle.tl { left: 0; top: 0; cursor: nwse-resize; }
.shape .handle.tr { left: 100%; top: 0; cursor: nesw-resize; }
.shape .handle.bl { left: 0; top: 100%; cursor: nesw-resize; }
.del { position: absolute; width: 22px; height: 22px; border-radius: 50%; background: rgba(30,30,30,.9); color: #fff; display: grid; place-items: center; cursor: pointer; }
.shape .del { left: 50%; top: 100%; transform: translate(-50%, 8px) scale(var(--inv)); transform-origin: top center; }
.del.free { transform: translate(-50%, -50%) scale(var(--inv)); }
.del ha-icon, .spot .del ha-icon { --mdc-icon-size: 14px; }
.shape .dim { position: absolute; left: 50%; top: 0; transform: translate(-50%, -120%) scale(var(--inv)); transform-origin: bottom center;
  font-size: 10px; color: #fff; background: rgba(0,0,0,.55); border-radius: 4px; padding: 1px 4px; white-space: nowrap; pointer-events: none; }
.spot { position: absolute; transform: translate(-50%, -100%) scale(var(--inv)); transform-origin: bottom center; color: var(--dvc-accent); cursor: pointer; }
.spot ha-icon { --mdc-icon-size: 34px; filter: drop-shadow(0 1px 2px rgba(0,0,0,.5)); }
.spot .ring { position: absolute; left: 50%; bottom: -10px; width: 46px; height: 46px; transform: translate(-50%, 50%);
  border: 2px dashed rgba(255,255,255,.8); border-radius: 6px; background: rgba(30,160,215,.25); pointer-events: none; }

.hint { position: absolute; left: 50%; top: 10px; transform: translateX(-50%); background: rgba(0,0,0,.6); color: #fff;
  font-size: 12px; padding: 4px 10px; border-radius: 999px; pointer-events: none; white-space: nowrap; max-width: 90%; overflow: hidden; text-overflow: ellipsis; }

.fab-col { position: absolute; right: 10px; bottom: 10px; display: flex; flex-direction: column; gap: 8px; }
.fab { width: 34px; height: 34px; border-radius: 50%; border: 0; background: var(--dvc-accent); color: var(--dvc-accent-text);
  display: grid; place-items: center; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,.35); padding: 0; }
.fab ha-icon { --mdc-icon-size: 18px; }
.fab.ghost { background: rgba(30,30,30,.85); color: #fff; }

.modebar { display: flex; justify-content: center; margin: 12px auto 0; background: var(--dvc-surface-2); border-radius: 999px; padding: 3px; width: max-content; max-width: calc(100% - 24px); }
.modebar button { border: 0; background: none; color: var(--dvc-text); border-radius: 999px; width: 54px; height: 28px; cursor: pointer; display: grid; place-items: center; padding: 0; }
.modebar button ha-icon { --mdc-icon-size: 18px; }
.modebar button.active { background: var(--dvc-accent); color: var(--dvc-accent-text); }
.modebar button[disabled] { opacity: .35; cursor: default; }

.actions { display: flex; justify-content: center; gap: 8px; padding: 10px 12px 14px; flex-wrap: wrap; }
.pill { border: 0; border-radius: 999px; background: var(--dvc-accent); color: var(--dvc-accent-text); height: 32px; min-width: 128px;
  padding: 0 18px; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.pill.small { min-width: 0; padding: 0 14px; }
.pill ha-icon { --mdc-icon-size: 16px; }
.pill.secondary { background: var(--dvc-surface-3); color: var(--dvc-text); }
.pill.danger { background: var(--dvc-danger); }
.pill[disabled] { opacity: .45; cursor: default; }

.menu { position: absolute; right: 10px; top: 46px; z-index: 5; background: var(--dvc-menu); border-radius: 12px;
  box-shadow: 0 6px 24px rgba(0,0,0,.4); padding: 6px 0; min-width: 190px; border: 1px solid var(--dvc-surface-3); }
.menu button { display: flex; align-items: center; gap: 12px; width: 100%; border: 0; background: none; color: var(--dvc-text); padding: 10px 16px; font-size: 14px; cursor: pointer; text-align: left; }
.menu button:hover { background: var(--dvc-surface-2); }
.menu button[disabled] { opacity: .4; cursor: default; }
.menu ha-icon { --mdc-icon-size: 20px; color: var(--dvc-text-2); }

.scrim { position: absolute; inset: 0; background: rgba(0,0,0,.45); z-index: 6; display: flex; align-items: flex-end; }
.sheet { width: 100%; max-height: 92%; overflow: auto; background: var(--dvc-popup); backdrop-filter: var(--dvc-popup-filter);
  -webkit-backdrop-filter: var(--dvc-popup-filter); border-radius: var(--dvc-radius) var(--dvc-radius) 0 0; padding: 6px 16px 18px; box-sizing: border-box;
  box-shadow: 0 -4px 20px rgba(0,0,0,.35); animation: up .18s ease-out; }
@keyframes up { from { transform: translateY(30px); opacity: 0; } }
.sheet-head { display: grid; grid-template-columns: 40px 1fr 40px; align-items: center; margin-bottom: 4px; }
.sheet-head .t { text-align: center; font-weight: 500; }
.section { margin-top: 14px; }
.section-label { font-size: 12px; color: var(--dvc-text-2); margin-bottom: 8px; display: flex; justify-content: space-between; }
.seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 6px; }
.seg button { border: 0; border-radius: 10px; background: var(--dvc-surface-2); color: var(--dvc-text); padding: 10px 4px; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 11px; }
.seg button ha-icon { --mdc-icon-size: 22px; }
.seg button.active { background: var(--dvc-accent); color: var(--dvc-accent-text); }
.seg button[disabled] { opacity: .4; cursor: default; }
.row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--dvc-surface-2); }
.row:last-child { border-bottom: 0; }
.row ha-icon { --mdc-icon-size: 22px; color: var(--dvc-text-2); }
.row .grow { flex: 1; min-width: 0; }
.row .sub { font-size: 11px; color: var(--dvc-text-2); }
.bar { height: 4px; border-radius: 2px; background: var(--dvc-surface-3); margin-top: 6px; overflow: hidden; }
.bar > div { height: 100%; background: var(--dvc-accent); }
.bar.low > div { background: var(--dvc-danger); }
.toggle { width: 38px; height: 22px; border-radius: 11px; background: var(--dvc-surface-3); position: relative; border: 0; cursor: pointer; padding: 0; flex: none; }
.toggle::after { content: ""; position: absolute; left: 3px; top: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left .15s; }
.toggle.on { background: var(--dvc-accent); }
.toggle.on::after { left: 19px; }
.link-btn { border: 0; background: var(--dvc-surface-2); color: var(--dvc-text); border-radius: 999px; padding: 6px 12px; font-size: 12px; cursor: pointer; }
.note { font-size: 11px; color: var(--dvc-text-2); margin-top: 6px; line-height: 1.4; }
.legend { display: flex; justify-content: center; gap: 14px; font-size: 11px; color: var(--dvc-text-2); padding-top: 8px; flex-wrap: wrap; }
.legend span::before { content: ""; display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; background: rgb(var(--c)); }
input.text { width: 100%; box-sizing: border-box; background: var(--dvc-surface-2); color: var(--dvc-text); border: 1px solid var(--dvc-surface-3);
  border-radius: 10px; padding: 10px 12px; font-size: 14px; outline: none; }
input.text:focus { border-color: var(--dvc-accent); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.chips button { border: 0; border-radius: 999px; background: var(--dvc-surface-2); color: var(--dvc-text); padding: 6px 10px; font-size: 12px; cursor: pointer; }
.chips button.active { background: var(--dvc-accent); color: var(--dvc-accent-text); }
.chips button ha-icon { --mdc-icon-size: 16px; vertical-align: -3px; margin-right: 4px; }

.banner { display: flex; align-items: center; gap: 10px; margin: 4px 12px 8px; padding: 8px 12px; border-radius: 10px; font-size: 13px; cursor: pointer; }
.banner ha-icon { --mdc-icon-size: 20px; flex: none; }
.banner .grow { flex: 1; min-width: 0; }
.banner.error { background: color-mix(in srgb, var(--dvc-danger) 16%, transparent); color: var(--dvc-danger); }
.banner.warn { background: color-mix(in srgb, var(--dvc-warn) 16%, transparent); color: var(--dvc-warn); }
.banner.info { background: var(--dvc-surface-2); color: var(--dvc-text-2); }

.obstacle { position: absolute; transform: translate(-50%, -50%) scale(var(--inv)); width: 22px; height: 22px; border-radius: 50%;
  background: rgba(30,30,30,.85); color: #ffb020; display: grid; place-items: center; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,.4); z-index: 2; }
.obstacle.ignored { color: #9b9b9b; }
.obstacle ha-icon { --mdc-icon-size: 15px; }
.furniture { position: absolute; transform: translate(-50%, -50%) rotate(var(--a)); cursor: pointer; border-radius: 3px; }
.furniture:hover { outline: 2px dashed rgba(255,255,255,.7); }
.mode-zone .obstacle, .mode-spot .obstacle, .mode-zone .furniture, .mode-spot .furniture { pointer-events: none; opacity: .5; }

.photo { width: 100%; border-radius: 10px; display: block; background: rgba(0,0,0,.3); min-height: 120px; object-fit: contain; }
.kv { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; font-size: 13px; margin-top: 12px; }
.kv div:nth-child(odd) { color: var(--dvc-text-2); }
.list-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--dvc-surface-2); cursor: pointer; }
.list-row:last-child { border-bottom: 0; }
.list-row .grow { flex: 1; min-width: 0; }
.list-row .t { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.list-row .sub { font-size: 11px; color: var(--dvc-text-2); }
.list-row ha-icon { --mdc-icon-size: 20px; color: var(--dvc-text-2); }
.list-row.active .t { color: var(--dvc-accent); font-weight: 600; }
.btns { display: flex; gap: 6px; flex-wrap: wrap; }
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 8px; }
.stat-box { background: var(--dvc-surface-2); border-radius: 10px; padding: 10px; text-align: center; }
.stat-box b { display: block; font-size: 18px; }
.stat-box span { font-size: 11px; color: var(--dvc-text-2); }
select.text, input.text[type=time] { appearance: auto; }
.ctl option { background: var(--dvc-menu); color: var(--dvc-text); }
.ctl { flex: none; max-width: 48%; }
.ctl input[type=range] { width: 120px; accent-color: var(--dvc-accent); vertical-align: middle; }
.ctl .v { font-size: 12px; color: var(--dvc-text-2); min-width: 34px; display: inline-block; text-align: right; }
.ctl select, .ctl input[type=time] { background: var(--dvc-surface-2); color: var(--dvc-text); border: 1px solid var(--dvc-surface-3); border-radius: 8px; padding: 6px 8px; font-size: 12px; max-width: 160px; }
.group-label { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--dvc-text-2); margin: 16px 0 2px; }
.search { margin-top: 8px; }

/* panel mode: map on the left, controls in a side column */
ha-card.wide .layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 360px); }
ha-card.wide .side { border-left: 1px solid var(--dvc-surface-2); display: flex; flex-direction: column; min-height: 0; max-height: 100%; }
ha-card.wide .side-tabs { display: flex; justify-content: space-around; padding: 8px 6px; border-bottom: 1px solid var(--dvc-surface-2); }
ha-card.wide .side-tabs button { border: 0; background: none; color: var(--dvc-text-2); width: 44px; height: 36px; border-radius: 10px; cursor: pointer; display: grid; place-items: center; }
ha-card.wide .side-tabs button.active { color: var(--dvc-accent); background: var(--dvc-surface-2); }
ha-card.wide .side-body { overflow: auto; padding: 0 16px 16px; flex: 1; max-height: 720px; }
ha-card.wide .side-body .sheet-head .icon-btn[data-act=close-sheet] { visibility: hidden; }
ha-card.wide .map { margin-bottom: 0; }
`;

/* ---------------- card ---------------- */

class DreameD10sCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._mode = "all";
    this._selectedRooms = [];
    this._zones = [];
    this._spots = [];
    this._repeats = 1;
    this._sheet = null;
    this._menu = false;
    this._editor = null;
    this._view = { s: 1, x: 0, y: 0 };
    this._pointers = new Map();
    this._gesture = null;
    this._imgData = null;
    this._roomMasks = {};
    this._lastImgSrc = null;
    this._renderKey = null;
    this._wide = false;
    this._fp = null;
    this._historyOpen = null;
    this._deviceFilter = "";
  }

  connectedCallback() {
    if (!this._ro && window.ResizeObserver) {
      this._ro = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect?.width || 0;
        const layout = this._config?.layout || "auto";
        const wide = layout === "panel" || (layout === "auto" && w >= WIDE_BREAKPOINT);
        if (wide !== this._wide) {
          this._wide = wide;
          if (wide && !this._sheet) this._sheet = "settings";
          this._render(true);
        }
      });
    }
    this._ro?.observe(this);
  }

  disconnectedCallback() {
    this._ro?.disconnect();
  }

  static getStubConfig(hass) {
    const vac = Object.keys(hass?.states || {}).find((e) => e.startsWith("vacuum."));
    return { entity: vac || "vacuum.dreame_d10s" };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: { domain: "vacuum" } } },
        { name: "map_entity", selector: { entity: { domain: "camera" } } },
        { name: "title", selector: { text: {} } },
        {
          name: "layout",
          default: "auto",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "auto", label: "Automatic" },
                { value: "compact", label: "Compact" },
                { value: "panel", label: "Panel (tablet / wall display)" },
              ],
            },
          },
        },
        { name: "floor_plan", default: false, selector: { boolean: {} } },
        { name: "show_stats", default: true, selector: { boolean: {} } },
        { name: "show_obstacles", default: true, selector: { boolean: {} } },
      ],
      computeLabel: (s) =>
        ({
          entity: "Vacuum",
          map_entity: "Map camera (optional)",
          title: "Title (optional)",
          layout: "Layout",
          floor_plan: "Floor plan view (needs the Map Data camera enabled)",
          show_stats: "Show stats",
          show_obstacles: "Show obstacles and furniture",
        })[s.name],
    };
  }

  setConfig(config) {
    if (!config || !config.entity) throw new Error("Please define a vacuum entity");
    this._config = { show_stats: true, show_obstacles: true, layout: "auto", ...config };
    this._base = config.entity.split(".")[1];
    this._renderKey = null;
    if (this._config.layout === "panel") this._wide = true;
    if (this._config.layout === "compact") this._wide = false;
    try {
      const stored = localStorage.getItem(`dreame-d10s-card:fp:${config.entity}`);
      this._fpOn = stored == null ? !!this._config.floor_plan : stored === "1";
    } catch (e) {
      this._fpOn = !!this._config.floor_plan;
    }
    if (this._hass) this._render();
  }

  getCardSize() {
    return 8;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }

  set hass(hass) {
    this._hass = hass;
    const key = this._stateKey();
    if (key === this._renderKey) return;
    this._renderKey = key;
    // don't rebuild the DOM under a finger or while typing
    if (this._gesture || this._pointers.size || this.shadowRoot.activeElement?.tagName === "INPUT") {
      this._pendingRender = true;
      return;
    }
    this._render();
  }

  /* ----- entity helpers ----- */

  _id(domain, suffix) {
    const override = this._config?.entities?.[suffix];
    return override || `${domain}.${this._base}_${suffix}`;
  }
  _st(id) {
    return this._hass?.states?.[id];
  }
  get _vac() {
    return this._st(this._config.entity);
  }
  get _mapEntity() {
    if (this._config.map_entity) return this._st(this._config.map_entity);
    return this._st(`camera.${this._base}_map`) || this._st(`camera.${this._base}_map_1`);
  }
  get _mapDataEntity() {
    return this._st(this._config.map_data_entity || `camera.${this._base}_map_data`);
  }
  get _deviceId() {
    return this._hass?.entities?.[this._config.entity]?.device_id;
  }
  // every entity on the vacuum's device (excluding the per-room ones)
  _deviceEntities() {
    const dev = this._deviceId;
    const reg = this._hass?.entities;
    if (!dev || !reg) return [];
    return Object.values(reg)
      .filter((e) => e.device_id === dev && !e.hidden && !e.entity_id.includes("_room_") && this._hass.states[e.entity_id])
      .map((e) => ({ ...e, stateObj: this._hass.states[e.entity_id] }));
  }
  _shortName(stateObj) {
    if (!stateObj.attributes.friendly_name)
      return titleCase(stateObj.entity_id.split(".")[1].replace(new RegExp(`^${this._base}_`), ""));
    const full = stateObj.attributes.friendly_name;
    const dev = this._vac?.attributes?.friendly_name;
    return dev && full.startsWith(dev) ? full.slice(dev.length).trim() || full : full;
  }

  /* ----- what this robot supports (everything else stays hidden) ----- */

  get _hasCustomCleaning() {
    return !!this._st(this._id("switch", "customized_cleaning"));
  }
  _editorTools() {
    return EDITOR_TOOLS.filter((t) => {
      if (t.id === "order") return this._hasCustomCleaning;
      if (t.id === "nomop") return !!this._st(this._id("select", "water_volume")) || !!this._st(this._id("sensor", "water_tank"));
      return true;
    });
  }
  _sections() {
    const cam = this._mapEntity?.attributes || {};
    const vac = this._vac?.attributes || {};
    return SECTIONS.filter((s) => {
      if (s.id === "consumables") return CONSUMABLES.some(([key]) => this._st(this._id("sensor", key)));
      if (s.id === "history")
        return !!(Object.keys(cam.cleaning_history_picture || {}).length || this._st(this._id("sensor", "cleaning_count")));
      if (s.id === "maps") return !!((vac.maps || []).length || Object.keys(cam.recovery_map_picture || {}).length);
      if (s.id === "device") return this._deviceEntities().length > 0;
      return true;
    });
  }

  /* ----- floor plan ----- */

  get _fpActive() {
    return !!(this._fpOn && this._mapDataEntity && this._fp);
  }

  _maybeFetchFloorPlan() {
    const cam = this._mapDataEntity;
    if (!this._fpOn || !cam?.attributes?.entity_picture) return;
    const key = `${cam.last_updated}|${cam.attributes.entity_picture}|${this._editor ? 1 : 0}`;
    if (key === this._fpKey || this._fpBusy) return;
    const since = Date.now() - (this._fpAt || 0);
    if (since < 1500) {
      clearTimeout(this._fpTimer);
      this._fpTimer = setTimeout(() => this._maybeFetchFloorPlan(), 1600 - since);
      return;
    }
    this._fpKey = key;
    this._fpBusy = true;
    this._fpAt = Date.now();
    const url = cam.attributes.entity_picture.replace("/api/camera_proxy/", "/api/camera_map_data_proxy/");
    fetch(url, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        const fp = renderFloorPlan(json);
        if (fp) {
          this._fp = fp;
          this._fpError = null;
        }
      })
      .catch((e) => {
        this._fpError = e.message;
      })
      .finally(() => {
        this._fpBusy = false;
        if (!this._gesture && !this._pointers.size) this._render(true);
        else this._pendingRender = true;
      });
  }

  _setFloorPlan(on) {
    this._fpOn = on;
    this._fpKey = null;
    this._imgData = null;
    try {
      localStorage.setItem(`dreame-d10s-card:fp:${this._config.entity}`, on ? "1" : "0");
    } catch (e) {
      /* private mode */
    }
    if (on && !this._mapDataEntity) this._toast("Enable the “Map Data” camera entity of your vacuum to use the floor plan view");
    this._render(true);
  }

  _fmt(stateObj, value) {
    if (!stateObj) return "";
    if (this._hass.formatEntityState) {
      try {
        return value === undefined ? this._hass.formatEntityState(stateObj) : this._hass.formatEntityState(stateObj, value);
      } catch (e) {
        /* fall through */
      }
    }
    return titleCase(value === undefined ? stateObj.state : value);
  }
  _stateKey() {
    if (!this._hass || !this._config) return null;
    const ids = [
      this._config.entity,
      this._mapEntity?.entity_id,
      this._id("sensor", "status"),
      this._id("sensor", "error"),
      this._id("sensor", "battery_level"),
      this._id("sensor", "cleaned_area"),
      this._id("sensor", "cleaning_time"),
      this._id("sensor", "water_tank"),
      this._id("select", "suction_level"),
      this._id("select", "water_volume"),
      this._id("select", "cleaning_mode"),
      this._id("select", "selected_map"),
      this._fpOn ? this._mapDataEntity?.entity_id : null,
      ...CONSUMABLES.map((c) => this._id("sensor", c[0])),
      ...SWITCHES.map((s) => this._id("switch", s[0])),
    ];
    // the settings sheet shows every device entity, so watch them while it's open
    if (["device", "history", "maps"].includes(this._sheet)) ids.push(...this._deviceEntities().map((e) => e.entity_id));
    return ids.map((id) => this._hass.states[id]?.last_updated + (this._hass.states[id]?.state ?? "")).join("|");
  }

  /* ----- derived state ----- */

  get _state() {
    return this._vac?.state || "unavailable";
  }
  get _isActive() {
    return ["cleaning", "returning"].includes(this._state);
  }
  get _transform() {
    if (this._fpActive) return this._fp.transform;
    return buildTransform(this._mapEntity?.attributes?.calibration_points);
  }
  get _mapSrc() {
    if (this._fpActive) return this._fp.url;
    return this._mapEntity?.attributes?.entity_picture;
  }
  get _rooms() {
    const rooms = this._mapEntity?.attributes?.rooms;
    if (!rooms) return [];
    return Object.entries(rooms)
      .map(([id, r]) => ({ ...r, id: Number(r.room_id ?? id) }))
      .filter((r) => r.visibility !== "Hidden");
  }
  _room(id) {
    return this._rooms.find((r) => r.id === id);
  }
  get _mapId() {
    return this._mapEntity?.attributes?.map_id;
  }

  _callService(domain, service, data = {}) {
    return Promise.resolve(this._hass.callService(domain, service, data)).catch((e) => {
      this._toast(e?.message || `${domain}.${service} failed`);
      throw e;
    });
  }
  _vacService(service, data = {}) {
    return this._callService("vacuum", service, { entity_id: this._config.entity, ...data }).catch(() => {});
  }
  _dreameService(service, data = {}) {
    return this._callService("dreame_vacuum", service, { entity_id: this._config.entity, ...data });
  }
  _toast(message) {
    this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message }, bubbles: true, composed: true }));
  }
  _moreInfo(entityId) {
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }

  _vacPoint(t, x, y) {
    const v = t.toVacuum(x, y);
    return [Math.round(v.x), Math.round(v.y)];
  }
  _rectToVacuum(z, t) {
    const [ax, ay] = this._vacPoint(t, z.x0, z.y0);
    const [bx, by] = this._vacPoint(t, z.x1, z.y1);
    return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
  }
  _lineToVacuum(l, t) {
    return [...this._vacPoint(t, l.x0, l.y0), ...this._vacPoint(t, l.x1, l.y1)];
  }

  /* ----- cleaning actions ----- */

  _start() {
    const repeats = this._repeats;
    if (this._state === "paused") return this._vacService("start");
    const t = this._transform;
    let call;
    if (this._mode === "room") {
      if (!this._selectedRooms.length) return this._toast("Select at least one room");
      const segs = [...this._selectedRooms];
      call = this._dreameService("vacuum_clean_segment", { segments: segs.length === 1 ? segs[0] : segs, repeats });
    } else if (this._mode === "zone") {
      if (!this._zones.length) return this._toast("Draw at least one zone");
      const zones = this._zones.map((z) => this._rectToVacuum(z, t));
      call = this._dreameService("vacuum_clean_zone", { zone: zones.length === 1 ? zones[0] : zones, repeats });
    } else if (this._mode === "spot") {
      if (!this._spots.length) return this._toast("Tap the map to place a spot");
      const pts = this._spots.map((p) => this._vacPoint(t, p.x, p.y));
      call = this._dreameService("vacuum_clean_spot", { points: pts.length === 1 ? pts[0] : pts, repeats });
    } else return this._vacService("start");
    call.catch(() => {});
  }

  _setMode(mode) {
    if (this._isActive) return;
    this._mode = mode;
    this._render(true);
  }

  _toggleRoom(id) {
    const list = this._selectedRooms;
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    else list.push(id);
    this._render(true);
  }

  /* ----- map editor ----- */

  _openEditor(tool = "rooms") {
    if (this._isActive) return this._toast("Map editing is unavailable while cleaning");
    if (!this._transform || !this._rooms.length) return this._toast("Map editing needs a saved map");
    this._editor = { tool, rooms: [], order: [], split: [], shapes: this._loadRestricted(), dirty: false, splitting: false };
    this._menu = false;
    this._sheet = null;
    this._view = { s: 1, x: 0, y: 0 };
    this._render(true);
  }

  _closeEditor(force) {
    const ed = this._editor;
    if (!force && ed && (ed.dirty || ed.order.length) && !confirm("Discard unsaved map changes?")) return;
    this._editor = null;
    this._render(true);
  }

  // Existing restricted areas from the camera, converted to image px
  _loadRestricted() {
    const a = this._mapEntity?.attributes || {};
    const t = this._transform;
    if (!t) return [];
    const toPx = (x, y) => t.toMap(x, y);
    const areaRect = (ar, kind) => {
      const xs = [ar.x0, ar.x1, ar.x2, ar.x3].filter((v) => v != null);
      const ys = [ar.y0, ar.y1, ar.y2, ar.y3].filter((v) => v != null);
      const p = toPx(Math.min(...xs), Math.min(...ys));
      const q = toPx(Math.max(...xs), Math.max(...ys));
      return normRect({ kind, x0: p.x, y0: p.y, x1: q.x, y1: q.y });
    };
    const shapes = [];
    (a.no_go_areas || []).forEach((ar) => shapes.push(areaRect(ar, "nogo")));
    (a.no_mopping_areas || []).forEach((ar) => shapes.push(areaRect(ar, "nomop")));
    (a.virtual_walls || []).forEach((w) => {
      const p = toPx(w.x0, w.y0);
      const q = toPx(w.x1, w.y1);
      shapes.push({ kind: "wall", x0: p.x, y0: p.y, x1: q.x, y1: q.y });
    });
    return shapes;
  }

  async _saveRestricted() {
    const t = this._transform;
    const s = this._editor.shapes;
    const data = {
      walls: s.filter((x) => x.kind === "wall").map((x) => this._lineToVacuum(x, t)),
      zones: s.filter((x) => x.kind === "nogo").map((x) => this._rectToVacuum(x, t)),
      no_mops: s.filter((x) => x.kind === "nomop").map((x) => this._rectToVacuum(x, t)),
    };
    try {
      await this._dreameService("vacuum_set_restricted_zone", data);
      this._editor.dirty = false;
      this._toast("Restricted areas saved");
      this._render(true);
    } catch (e) {
      /* toast already shown */
    }
  }

  async _saveOrder() {
    const order = [...this._editor.order];
    const rest = this._rooms
      .filter((r) => !order.includes(r.id))
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.id - b.id)
      .map((r) => r.id);
    try {
      await this._dreameService("vacuum_set_cleaning_sequence", { cleaning_sequence: [...order, ...rest] });
      this._editor.order = [];
      this._toast("Cleaning order saved");
      this._render(true);
    } catch (e) {
      /* toast already shown */
    }
  }

  async _mergeRooms() {
    const [a, b] = this._editor.rooms;
    const ra = this._room(a);
    const rb = this._room(b);
    if (!confirm(`Merge "${ra?.name}" and "${rb?.name}"?`)) return;
    const data = { segments: [a, b] };
    if (this._mapId) data.map_id = this._mapId;
    try {
      await this._dreameService("vacuum_merge_segments", data);
      this._editor.rooms = [];
      this._toast("Rooms merged — the map will refresh shortly");
      this._render(true);
    } catch (e) {
      /* toast already shown */
    }
  }

  async _applySplit() {
    const line = this._editor.split[0];
    const seg = this._editor.rooms[0];
    if (!line || !seg) return;
    const data = { segment: seg, line: this._lineToVacuum(line, this._transform) };
    if (this._mapId) data.map_id = this._mapId;
    try {
      await this._dreameService("vacuum_split_segments", data);
      this._editor.split = [];
      this._editor.splitting = false;
      this._editor.rooms = [];
      this._toast("Room split — the map will refresh shortly");
      this._render(true);
    } catch (e) {
      /* toast already shown */
    }
  }

  async _renameRoom(id, name) {
    name = (name || "").trim();
    if (!name) return this._toast("Enter a room name");
    try {
      await this._dreameService("vacuum_rename_segment", { segment_id: id, segment_name: name });
      this._sheet = null;
      this._render(true);
    } catch (e) {
      /* toast already shown */
    }
  }

  // set_custom_cleaning takes parallel lists for every room on the map
  async _setRoomSetting(id, key, value) {
    const rooms = this._rooms;
    const val = (r, k, def) => (r.id === id && k === key ? value : (r[k] ?? def));
    const data = {
      segment_id: rooms.map((r) => r.id),
      suction_level: rooms.map((r) => val(r, "suction_level", 1)),
      water_volume: rooms.map((r) => val(r, "water_volume", 2)),
      repeats: rooms.map((r) => val(r, "cleaning_times", 1)),
    };
    if (key === "cleaning_mode" || rooms.some((r) => r.cleaning_mode != null))
      data.cleaning_mode = rooms.map((r) => val(r, "cleaning_mode", 2));
    try {
      await this._dreameService("vacuum_set_custom_cleaning", data);
    } catch (e) {
      /* toast already shown */
    }
  }

  _editorTap(p) {
    const ed = this._editor;
    const room = this._roomAt(p.x, p.y);
    if (ed.tool === "rooms" && !ed.splitting) {
      if (room) this._editorToggleRoom(room.id);
    } else if (ed.tool === "order") {
      if (room) this._editorOrderRoom(room.id);
    }
  }

  _editorToggleRoom(id) {
    const list = this._editor.rooms;
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    else {
      list.push(id);
      if (list.length > 2) list.shift();
    }
    this._render(true);
  }

  _editorOrderRoom(id) {
    const list = this._editor.order;
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i);
    else list.push(id);
    this._render(true);
  }

  /* ----- shapes (cleaning zones, restricted areas, split line) ----- */

  // Which shape kind is editable right now, and the list it lives in
  _shapeCtx() {
    const ed = this._editor;
    if (!ed) return this._mode === "zone" && !this._isActive ? { kind: "zone", list: this._zones } : null;
    if (["nogo", "nomop", "wall"].includes(ed.tool)) return { kind: ed.tool, list: ed.shapes };
    if (ed.tool === "rooms" && ed.splitting) return { kind: "split", list: ed.split };
    return null;
  }

  _countKind(ctx) {
    return ctx.list.filter((s) => (s.kind || "zone") === ctx.kind).length;
  }

  _addDefaultShape(ctx, p) {
    const t = this._transform;
    if (!t || this._countKind(ctx) >= SHAPES[ctx.kind].max) return;
    const v = t.toVacuum(p.x, p.y);
    if (SHAPES[ctx.kind].line) {
      const a = t.toMap(v.x - 1000, v.y);
      const b = t.toMap(v.x + 1000, v.y);
      ctx.list.push({ kind: ctx.kind, x0: a.x, y0: a.y, x1: b.x, y1: b.y });
    } else {
      const a = t.toMap(v.x - 750, v.y - 750);
      const b = t.toMap(v.x + 750, v.y + 750);
      ctx.list.push(normRect({ kind: ctx.kind, x0: a.x, y0: a.y, x1: b.x, y1: b.y }));
    }
    this._markDirty(ctx);
  }

  _markDirty(ctx) {
    if (this._editor && ctx.kind !== "split") this._editor.dirty = true;
  }

  /* ----- map image analysis (room highlight masks) ----- */

  _analyzeImage(img) {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return;
    try {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      this._imgData = ctx.getImageData(0, 0, w, h);
    } catch (e) {
      this._imgData = null;
    }
    this._roomMasks = {};
    this._drawHighlight();
  }

  _roomBoxPx(room, t) {
    const corners = [
      t.toMap(room.x0, room.y0),
      t.toMap(room.x1, room.y0),
      t.toMap(room.x0, room.y1),
      t.toMap(room.x1, room.y1),
    ];
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    return {
      x0: Math.max(0, Math.floor(Math.min(...xs))),
      y0: Math.max(0, Math.floor(Math.min(...ys))),
      x1: Math.ceil(Math.max(...xs)),
      y1: Math.ceil(Math.max(...ys)),
    };
  }

  // Pixels inside the room's bounding box that share the room's dominant color.
  _roomMask(room, t) {
    if (this._fpActive) return this._fp.masks[room.id] || null;
    const key =`${room.id}:${room.x0},${room.y0},${room.x1},${room.y1}`;
    if (this._roomMasks[key] !== undefined) return this._roomMasks[key];
    const d = this._imgData;
    let mask = null;
    if (d && room.x0 != null) {
      const box = this._roomBoxPx(room, t);
      box.x1 = Math.min(d.width, box.x1);
      box.y1 = Math.min(d.height, box.y1);
      const bw = box.x1 - box.x0;
      const bh = box.y1 - box.y0;
      if (bw > 2 && bh > 2) {
        const hist = new Map();
        const step = Math.max(1, Math.floor(Math.sqrt((bw * bh) / 4000)));
        for (let y = box.y0; y < box.y1; y += step)
          for (let x = box.x0; x < box.x1; x += step) {
            const i = (y * d.width + x) * 4;
            if (d.data[i + 3] < 200) continue;
            const k = ((d.data[i] >> 3) << 10) | ((d.data[i + 1] >> 3) << 5) | (d.data[i + 2] >> 3);
            hist.set(k, (hist.get(k) || 0) + 1);
          }
        let best = -1;
        let bestN = 0;
        hist.forEach((n, k) => {
          if (n > bestN) {
            bestN = n;
            best = k;
          }
        });
        if (best >= 0) {
          const r = ((best >> 10) & 31) * 8 + 4;
          const g = ((best >> 5) & 31) * 8 + 4;
          const b = (best & 31) * 8 + 4;
          const bits = new Uint8Array(bw * bh);
          let count = 0;
          for (let y = 0; y < bh; y++)
            for (let x = 0; x < bw; x++) {
              const i = ((y + box.y0) * d.width + x + box.x0) * 4;
              const dr = d.data[i] - r;
              const dg = d.data[i + 1] - g;
              const db = d.data[i + 2] - b;
              if (d.data[i + 3] > 200 && dr * dr + dg * dg + db * db < 1600) {
                bits[y * bw + x] = 1;
                count++;
              }
            }
          if (count > bw * bh * 0.15) mask = { box, bw, bh, bits };
        }
      }
    }
    this._roomMasks[key] = mask;
    return mask;
  }

  _highlightIds() {
    const ed = this._editor;
    if (ed) return ed.tool === "rooms" ? ed.rooms : ed.tool === "order" ? ed.order : [];
    return this._mode === "room" ? this._selectedRooms : [];
  }

  _drawHighlight() {
    const canvas = this.shadowRoot.querySelector("canvas.hl");
    const img = this.shadowRoot.querySelector(".viewport img");
    const t = this._transform;
    if (!canvas || !img || !img.naturalWidth || !t) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    const ids = this._highlightIds();
    if (!ids.length) return;
    const rooms = this._rooms.filter((r) => ids.includes(r.id));
    // dim everything, then cut out & brighten selected rooms
    const out = ctx.createImageData(w, h);
    const o = out.data;
    for (let i = 3; i < o.length; i += 4) o[i] = 110;
    rooms.forEach((room) => {
      const m = this._roomMask(room, t);
      if (m) {
        for (let y = 0; y < m.bh; y++)
          for (let x = 0; x < m.bw; x++)
            if (m.bits[y * m.bw + x]) {
              const i = ((y + m.box.y0) * w + x + m.box.x0) * 4;
              o[i] = o[i + 1] = o[i + 2] = 255;
              o[i + 3] = 46;
            }
      } else if (room.x0 != null) {
        const b = this._roomBoxPx(room, t);
        for (let y = b.y0; y < Math.min(h, b.y1); y++)
          for (let x = b.x0; x < Math.min(w, b.x1); x++) {
            const i = (y * w + x) * 4;
            o[i] = o[i + 1] = o[i + 2] = 255;
            o[i + 3] = 40;
          }
      }
    });
    ctx.putImageData(out, 0, 0);
  }

  _roomAt(px, py) {
    const t = this._transform;
    if (!t) return null;
    const v = t.toVacuum(px, py);
    const candidates = this._rooms.filter(
      (r) =>
        r.x0 != null &&
        v.x >= Math.min(r.x0, r.x1) &&
        v.x <= Math.max(r.x0, r.x1) &&
        v.y >= Math.min(r.y0, r.y1) &&
        v.y <= Math.max(r.y0, r.y1)
    );
    if (!candidates.length) return null;
    const ix = Math.round(px);
    const iy = Math.round(py);
    const byMask = candidates.find((r) => {
      const m = this._roomMask(r, t);
      if (!m) return false;
      const x = ix - m.box.x0;
      const y = iy - m.box.y0;
      return x >= 0 && y >= 0 && x < m.bw && y < m.bh && m.bits[y * m.bw + x];
    });
    if (byMask) return byMask;
    const area = (r) => Math.abs((r.x1 - r.x0) * (r.y1 - r.y0));
    return candidates.sort((a, b) => area(a) - area(b))[0];
  }

  /* ----- pointer / zoom ----- */

  _imgPoint(ev) {
    const img = this.shadowRoot.querySelector(".viewport img");
    const r = img.getBoundingClientRect();
    return {
      x: ((ev.clientX - r.left) / r.width) * img.naturalWidth,
      y: ((ev.clientY - r.top) / r.height) * img.naturalHeight,
    };
  }

  _applyView() {
    const vp = this.shadowRoot.querySelector(".viewport");
    if (!vp) return;
    const { s, x, y } = this._view;
    vp.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    vp.style.setProperty("--inv", String(1 / s));
  }

  _clampView() {
    const map = this.shadowRoot.querySelector(".map");
    if (!map) return;
    const W = map.clientWidth;
    const H = map.clientHeight;
    const v = this._view;
    v.s = Math.min(5, Math.max(1, v.s));
    v.x = Math.min(0, Math.max(W - W * v.s, v.x));
    v.y = Math.min(0, Math.max(H - H * v.s, v.y));
  }

  _zoomAt(clientX, clientY, factor) {
    const map = this.shadowRoot.querySelector(".map");
    const r = map.getBoundingClientRect();
    const mx = clientX - r.left;
    const my = clientY - r.top;
    const v = this._view;
    const ns = Math.min(5, Math.max(1, v.s * factor));
    v.x = mx - ((mx - v.x) * ns) / v.s;
    v.y = my - ((my - v.y) * ns) / v.s;
    v.s = ns;
    this._clampView();
    this._applyView();
  }

  _onWheel(ev) {
    ev.preventDefault();
    this._zoomAt(ev.clientX, ev.clientY, ev.deltaY < 0 ? 1.15 : 1 / 1.15);
  }

  _onPointerDown(ev) {
    const map = this.shadowRoot.querySelector(".map");
    map.setPointerCapture(ev.pointerId);
    this._pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (this._pointers.size === 2) {
      const [a, b] = [...this._pointers.values()];
      this._gesture = { type: "pinch", dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      return;
    }
    if (this._pointers.size > 2) return;
    const target = ev.composedPath()[0];
    const p = this._imgPoint(ev);
    const start = { cx: ev.clientX, cy: ev.clientY, p, vx: this._view.x, vy: this._view.y };
    const ctx = this._shapeCtx();

    const shapeEl = target.closest?.("[data-shape]");
    if (ctx && shapeEl) {
      const idx = Number(shapeEl.dataset.shape);
      if (target.closest(".del")) {
        this._gesture = { type: "tap-del", idx, ctx, ...start };
        return;
      }
      const handle = target.closest(".handle");
      this._gesture = { type: handle ? "resize" : "move", corner: handle?.dataset.c, idx, ctx, orig: { ...ctx.list[idx] }, ...start };
      return;
    }
    if (!this._editor && this._mode === "spot" && target.closest?.(".spot") && !this._isActive) {
      this._gesture = { type: "tap-spot", idx: Number(target.closest(".spot").dataset.i), ...start };
      return;
    }
    const objEl = target.closest?.("[data-obstacle],[data-furniture]");
    if (objEl && !this._editor) {
      this._gesture = { type: "tap-obj", obstacle: objEl.dataset.obstacle, furniture: objEl.dataset.furniture, ...start };
      return;
    }
    const roomEl = target.closest?.(".room");
    if (roomEl) {
      this._gesture = { type: "tap-room", id: Number(roomEl.dataset.id), ...start };
      return;
    }
    if (ctx && this._countKind(ctx) < SHAPES[ctx.kind].max) {
      this._gesture = { type: "draw", ctx, ...start };
      return;
    }
    this._gesture = { type: "pan", ...start };
  }

  _onPointerMove(ev) {
    if (!this._pointers.has(ev.pointerId)) return;
    this._pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const g = this._gesture;
    if (!g) return;
    if (g.type === "pinch" && this._pointers.size >= 2) {
      const [a, b] = [...this._pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      this._view.x += cx - g.cx;
      this._view.y += cy - g.cy;
      this._zoomAt(cx, cy, dist / g.dist);
      Object.assign(g, { dist, cx, cy });
      return;
    }
    if (g.cx === undefined) return;
    const dx = ev.clientX - g.cx;
    const dy = ev.clientY - g.cy;
    if (!g.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
    g.moved = true;
    const p = this._imgPoint(ev);
    if (g.type === "pan" || g.type === "tap-room" || g.type === "tap-spot" || g.type === "tap-obj") {
      g.type = "pan";
      this._view.x = g.vx + dx;
      this._view.y = g.vy + dy;
      this._clampView();
      this._applyView();
      return;
    }
    const list = g.ctx?.list;
    if (!list) return;
    if (g.type === "draw") {
      if (g.idx === undefined) {
        list.push({ kind: g.ctx.kind, x0: g.p.x, y0: g.p.y, x1: p.x, y1: p.y });
        g.idx = list.length - 1;
      }
      Object.assign(list[g.idx], { x1: p.x, y1: p.y });
    } else if (g.type === "move") {
      const ddx = p.x - g.p.x;
      const ddy = p.y - g.p.y;
      const o = g.orig;
      Object.assign(list[g.idx], { x0: o.x0 + ddx, x1: o.x1 + ddx, y0: o.y0 + ddy, y1: o.y1 + ddy });
    } else if (g.type === "resize") {
      const s = list[g.idx];
      const c = g.corner;
      if (c === "p0") Object.assign(s, { x0: p.x, y0: p.y });
      else if (c === "p1") Object.assign(s, { x1: p.x, y1: p.y });
      else {
        const n = normRect(g.orig);
        Object.assign(s, {
          x0: c.includes("l") ? p.x : n.x0,
          x1: c.includes("r") ? p.x : n.x1,
          y0: c.includes("t") ? p.y : n.y0,
          y1: c.includes("b") ? p.y : n.y1,
        });
      }
    }
    this._renderOverlay();
  }

  _onPointerUp(ev) {
    if (!this._pointers.has(ev.pointerId)) return;
    this._handlePointerUp(ev);
    if (this._pendingRender && !this._pointers.size) {
      this._pendingRender = false;
      this._render(true);
    }
  }

  _handlePointerUp(ev) {
    this._pointers.delete(ev.pointerId);
    const g = this._gesture;
    if (this._pointers.size) {
      if (g?.type === "pinch") this._gesture = { type: "pan-wait" };
      return;
    }
    this._gesture = null;
    if (!g) return;
    const list = g.ctx?.list;
    if (list && ["draw", "move", "resize"].includes(g.type) && g.idx !== undefined) {
      const s = list[g.idx];
      if (SHAPES[s.kind || "zone"].line) {
        if (g.type === "draw" && Math.hypot(s.x1 - s.x0, s.y1 - s.y0) < 10) list.splice(g.idx, 1);
      } else {
        const n = normRect(s);
        if (n.x1 - n.x0 < 8 || n.y1 - n.y0 < 8) list.splice(g.idx, 1);
        else list[g.idx] = n;
      }
      if (g.moved) this._markDirty(g.ctx);
      return this._render(true);
    }
    if (g.moved) return;
    if (g.type === "tap-del") {
      list.splice(g.idx, 1);
      this._markDirty(g.ctx);
      return this._render(true);
    }
    if (g.type === "tap-spot") {
      this._spots.splice(g.idx, 1);
      return this._render(true);
    }
    if (g.type === "tap-obj") {
      if (g.obstacle !== undefined) {
        this._sheetObstacle = g.obstacle;
        this._sheet = "obstacle";
        return this._render(true);
      }
      const f = (this._mapEntity?.attributes?.furnitures || [])[Number(g.furniture)];
      if (f) this._toast(`${f.type} · ${(f.width / 1000).toFixed(1)} × ${(f.height / 1000).toFixed(1)} m`);
      return;
    }
    if (this._editor) {
      if (g.type === "tap-room") {
        if (this._editor.tool === "order") return this._editorOrderRoom(g.id);
        if (this._editor.tool === "rooms" && !this._editor.splitting) return this._editorToggleRoom(g.id);
      }
      const ctx = this._shapeCtx();
      if (ctx && g.type === "draw") {
        this._addDefaultShape(ctx, g.p);
        return this._render(true);
      }
      return this._editorTap(g.p);
    }
    if (g.type === "tap-room") return this._mode === "room" && this._toggleRoom(g.id);
    if (this._isActive) return;
    if (this._mode === "room") {
      const room = this._roomAt(g.p.x, g.p.y);
      if (room) this._toggleRoom(room.id);
    } else if (this._mode === "spot") {
      if (this._spots.length >= MAX_SPOTS) this._spots.shift();
      this._spots.push({ x: g.p.x, y: g.p.y });
      this._render(true);
    } else if (this._mode === "zone" && g.type === "draw") {
      this._addDefaultShape(this._shapeCtx(), g.p);
      this._render(true);
    }
  }

  /* ----- rendering ----- */

  _render() {
    if (!this._hass || !this._config) return;
    if (!this.shadowRoot.querySelector("ha-card")) {
      this.shadowRoot.innerHTML = `<style>${STYLE}</style><ha-card></ha-card>`;
      this._bindStatic();
    }
    const card = this.shadowRoot.querySelector("ha-card");
    const vac = this._vac;
    if (!vac) {
      card.innerHTML = `<div style="padding:16px">Entity not found: ${esc(this._config.entity)}</div>`;
      return;
    }
    const oldImg = card.querySelector(".viewport img");
    const focused = this.shadowRoot.activeElement;
    const focusId = focused?.tagName === "INPUT" ? focused.id : null;
    this._maybeFetchFloorPlan();
    card.classList.toggle("editing", !!this._editor);
    card.classList.toggle("wide", this._wide);
    const main = this._editor
      ? `
      ${this._editorHeaderHtml()}
      ${this._mapHtml()}
      ${this._editorToolbarHtml()}
      ${this._editorActionsHtml()}`
      : `
      ${this._headerHtml()}
      ${this._bannersHtml()}
      ${this._config.show_stats !== false ? this._statsHtml() : ""}
      ${this._mapHtml()}
      ${this._modebarHtml()}
      ${this._actionsHtml()}
      ${this._menu ? this._menuHtml() : ""}`;
    const sheetBody = this._sheet ? this._sheetHtml() : "";
    if (this._wide) {
      // panel mode: sheets live in the side column instead of popping up
      const sec = this._sheet || "settings";
      const side = `
        <div class="side">
          <div class="side-tabs">${this._sections().map(
            (s) =>
              `<button class="${sec === s.id ? "active" : ""}" data-act="sheet" data-sheet="${s.id}" title="${s.label}">${this._icon(s.icon)}</button>`
          ).join("")}</div>
          <div class="side-body">${sheetBody || this._sheetHtml("settings")}</div>
        </div>`;
      card.innerHTML = `<div class="layout"><div class="main">${main}</div>${side}</div>`;
    } else {
      card.innerHTML = `${main}${sheetBody ? `<div class="scrim" data-act="close-sheet"><div class="sheet">${sheetBody}</div></div>` : ""}`;
    }
    let img = card.querySelector(".viewport img");
    if (img && oldImg) {
      // reuse the existing element so the map doesn't flash while a new frame loads
      const src = img.getAttribute("src");
      img.replaceWith(oldImg);
      if (oldImg.getAttribute("src") !== src) oldImg.setAttribute("src", src);
      img = oldImg;
    }
    if (img) {
      const onLoad = () => {
        if (img.src !== this._lastImgSrc || !this._imgData) {
          this._lastImgSrc = img.src;
          this._analyzeImage(img);
        } else this._drawHighlight();
      };
      if (img.complete && img.naturalWidth) onLoad();
      else img.addEventListener("load", onLoad, { once: true });
    }
    this._renderOverlay();
    this._applyView();
    if (focusId) {
      const el = this.shadowRoot.getElementById(focusId);
      if (el) {
        el.focus();
        el.setSelectionRange?.(el.value.length, el.value.length);
      }
    } else {
      const auto = card.querySelector("input[autofocus]");
      if (auto) auto.focus();
    }
  }

  _bindStatic() {
    const root = this.shadowRoot;
    root.addEventListener("click", (ev) => this._onClick(ev));
    root.addEventListener("pointerdown", (ev) => {
      const t = ev.composedPath()[0];
      if (t.closest?.(".map:not(.no-map)") && !t.closest(".fab-col")) this._onPointerDown(ev);
    });
    root.addEventListener("pointermove", (ev) => this._onPointerMove(ev));
    root.addEventListener("pointerup", (ev) => this._onPointerUp(ev));
    root.addEventListener("pointercancel", (ev) => {
      this._pointers.delete(ev.pointerId);
      this._gesture = null;
    });
    root.addEventListener(
      "wheel",
      (ev) => {
        if (ev.composedPath()[0].closest?.(".map:not(.no-map)")) this._onWheel(ev);
      },
      { passive: false }
    );
    root.addEventListener("keydown", (ev) => {
      const t = ev.composedPath()[0];
      if (ev.key !== "Enter") return;
      if (t.id === "rename") this._renameRoom(this._sheetRoom, t.value);
      if (t.id === "rename-map") this._renameMap(this._sheetMap, t.value);
    });
    root.addEventListener("change", (ev) => this._onChange(ev));
    root.addEventListener("input", (ev) => {
      const t = ev.composedPath()[0];
      if (t.id === "device-filter") {
        this._deviceFilter = t.value;
        this._render(true);
      } else if (t.type === "range" && t.nextElementSibling) {
        t.nextElementSibling.textContent = t.value;
      }
    });
    root.addEventListener(
      "blur",
      () => {
        if (this._pendingRender) {
          setTimeout(() => {
            if (this.shadowRoot.activeElement?.tagName === "INPUT") return;
            this._pendingRender = false;
            this._render(true);
          }, 0);
        }
      },
      true
    );
  }

  _icon(icon) {
    return `<ha-icon icon="${esc(icon)}"></ha-icon>`;
  }

  _headerHtml() {
    const vac = this._vac;
    const name = this._config.title || vac.attributes.friendly_name || "Dreame D10S";
    const err = this._st(this._id("sensor", "error"));
    const hasErr = err && !["no_error", "unavailable", "unknown"].includes(err.state);
    const status = this._st(this._id("sensor", "status"));
    let sub = status ? this._fmt(status) : this._fmt(vac);
    if (hasErr) sub = this._fmt(err);
    else if (this._state === "cleaning" && vac.attributes.current_segment) {
      const r = this._room(vac.attributes.current_segment);
      if (r) sub += ` · ${r.name}`;
    }
    return `
      <div class="header">
        <span></span>
        <div class="titles">
          <div class="title">${esc(name)}</div>
          <div class="subtitle ${hasErr ? "error" : ""}">${esc(sub)}</div>
        </div>
        <button class="icon-btn" data-act="menu" title="More">${this._icon("mdi:dots-vertical")}</button>
      </div>`;
  }

  _editorHeaderHtml() {
    const ed = this._editor;
    const tool = EDITOR_TOOLS.find((t) => t.id === ed.tool);
    const canSave = ed.tool === "order" ? ed.order.length > 0 : ed.dirty && ["nogo", "nomop", "wall"].includes(ed.tool);
    return `
      <div class="header">
        <button class="icon-btn" data-act="editor-close" title="Close editor">${this._icon("mdi:arrow-left")}</button>
        <div class="titles">
          <div class="title">${esc(tool.label)}</div>
          <div class="subtitle">Map editor${ed.dirty || ed.order.length ? " · unsaved changes" : ""}</div>
        </div>
        ${
          ed.tool === "rooms"
            ? "<span></span>"
            : `<button class="icon-btn accent" data-act="editor-save" title="Save" ${canSave ? "" : "disabled"}>${this._icon("mdi:check")}</button>`
        }
      </div>`;
  }

  _statsHtml() {
    const area = this._st(this._id("sensor", "cleaned_area"));
    const time = this._st(this._id("sensor", "cleaning_time"));
    const bat = this._st(this._id("sensor", "battery_level"));
    const batVal = bat?.state ?? this._vac.attributes.battery_level;
    const batIcon = bat?.attributes?.icon || this._vac.attributes.battery_icon || "mdi:battery";
    const num = (s) => (s && !isNaN(parseFloat(s.state)) ? Math.round(parseFloat(s.state)) : "–");
    return `
      <div class="stats">
        <div class="stat" data-more="${area?.entity_id || ""}">${this._icon("mdi:texture-box")}${num(area)}<small>m²</small></div>
        <div class="stat" data-more="${time?.entity_id || ""}">${this._icon("mdi:timer-outline")}${num(time)}<small>min</small></div>
        <div class="stat" data-more="${bat?.entity_id || ""}">${this._icon(batIcon)}${esc(batVal ?? "–")}<small>%</small></div>
      </div>`;
  }

  _bannersHtml() {
    const out = [];
    const vac = this._vac;
    if (this._state === "unavailable")
      out.push(["error", "mdi:wifi-off", "The vacuum is offline", "Check its Wi-Fi connection and the integration", this._config.entity]);
    const err = this._st(this._id("sensor", "error"));
    if (err && !["no_error", "unavailable", "unknown"].includes(err.state)) {
      const desc = err.attributes.description || err.attributes.faults || "";
      out.push(["error", "mdi:alert-circle-outline", this._fmt(err), typeof desc === "string" ? desc : "", err.entity_id]);
    }
    const tank = this._st(this._id("sensor", "water_tank"));
    const mode = this._st(this._id("select", "cleaning_mode"))?.state;
    if (tank && tank.state !== "installed" && mode && mode !== "sweeping")
      out.push(["warn", "mdi:cup-water", "Water tank is not installed", "Mopping is skipped until it's fitted", tank.entity_id]);
    for (const [key, , label] of CONSUMABLES) {
      const s = this._st(this._id("sensor", key));
      const v = parseFloat(s?.state);
      if (!isNaN(v) && v <= 5) out.push(["warn", "mdi:wrench-clock", `${label} needs replacing`, `${Math.round(v)}% left`, "sheet:consumables"]);
    }
    const bat = parseFloat(this._st(this._id("sensor", "battery_level"))?.state ?? vac.attributes.battery_level);
    if (!isNaN(bat) && bat < 15 && this._state !== "docked")
      out.push(["warn", "mdi:battery-alert-variant-outline", "Battery low", `${bat}%`, this._id("sensor", "battery_level")]);
    if (this._fpOn && !this._mapDataEntity)
      out.push(["info", "mdi:floor-plan", "Floor plan view needs the Map Data camera", "Enable camera …_map_data in the device page", "fp-off"]);
    else if (this._fpOn && this._fpError && !this._fp)
      out.push(["info", "mdi:floor-plan", "Couldn't load the floor plan", this._fpError, "fp-off"]);
    return out
      .slice(0, 3)
      .map(
        ([cls, icon, title, sub, target]) => `
        <div class="banner ${cls}" data-act="banner" data-target="${esc(target)}">
          ${this._icon(icon)}<div class="grow"><div>${esc(title)}</div>${sub ? `<div class="sub" style="font-size:11px;opacity:.8">${esc(sub)}</div>` : ""}</div>
          ${this._icon("mdi:chevron-right")}
        </div>`
      )
      .join("");
  }

  _mapHtml() {
    const cam = this._mapEntity;
    const src = this._mapSrc;
    const fabs = this._editor
      ? `<div class="fab-col"><button class="fab ghost" data-act="recenter" title="Fit map">${this._icon("mdi:fit-to-screen-outline")}</button></div>`
      : `
      <div class="fab-col">
        <button class="fab ghost" data-act="recenter" title="Fit map">${this._icon("mdi:fit-to-screen-outline")}</button>
        <button class="fab" data-act="editor-open" title="Edit map">${this._icon("mdi:map-marker-path")}</button>
        ${
          this._wide
            ? ""
            : `<button class="fab" data-act="sheet" data-sheet="consumables" title="Maintenance">${this._icon("mdi:wrench-outline")}</button>
        <button class="fab" data-act="sheet" data-sheet="settings" title="Cleaning settings">${this._icon("mdi:tune-variant")}</button>`
        }
      </div>`;
    if (!src) {
      return `<div class="map no-map">${cam ? "Map not available yet" : "No map camera found"}${fabs}</div>`;
    }
    return `
      <div class="map ${this._editor ? "" : `mode-${this._mode}`}">
        <div class="viewport">
          <img src="${esc(src)}" alt="" draggable="false" crossorigin="anonymous">
          <canvas class="hl"></canvas>
          <div class="layer"></div>
        </div>
        ${this._hintHtml()}
        ${fabs}
      </div>`;
  }

  _hintHtml() {
    const ed = this._editor;
    let text = "";
    if (ed) {
      const n = (k) => ed.shapes.filter((s) => s.kind === k).length;
      text = {
        rooms: ed.splitting
          ? ed.split.length
            ? "Drag the line ends across the room, then Apply"
            : "Draw a line across the room to split it"
          : ed.rooms.length
            ? ""
            : "Tap a room to edit it, or two rooms to merge",
        nogo: n("nogo") ? "" : "Drag on the map to add a no-go zone",
        nomop: n("nomop") ? "" : "Drag on the map to add a no-mop zone",
        wall: n("wall") ? "" : "Drag on the map to draw a virtual wall",
        order: ed.order.length ? "" : "Tap rooms in the order they should be cleaned",
      }[ed.tool];
    } else if (!this._isActive) {
      const n = { room: this._selectedRooms.length, zone: this._zones.length, spot: this._spots.length }[this._mode];
      text = {
        room: n ? "" : "Tap rooms to select them",
        zone: n ? (n >= SHAPES.zone.max ? `Maximum ${SHAPES.zone.max} zones` : "") : "Drag on the map to draw a zone",
        spot: n ? "" : "Tap the map to place a spot",
      }[this._mode];
    }
    return text ? `<div class="hint">${esc(text)}</div>` : "";
  }

  _roomBadgesHtml(t, pct) {
    const ed = this._editor;
    let html = "";
    // current saved cleaning sequence (room.order) for display in the order tool
    for (const r of this._rooms) {
      if (r.x == null || r.y == null) continue;
      const p = t.toMap(r.x, r.y);
      let cls = "";
      let prefix = "";
      if (ed) {
        if (ed.tool === "rooms" && !ed.splitting) {
          const i = ed.rooms.indexOf(r.id);
          cls = i >= 0 ? "selected" : "named";
        } else if (ed.tool === "order") {
          const i = ed.order.indexOf(r.id);
          if (i >= 0) {
            cls = "selected";
            prefix = `<span class="order">${i + 1}</span>`;
          } else {
            cls = "named";
            if (!ed.order.length && r.order) prefix = `<span class="order ghost">${r.order}</span>`;
          }
        } else cls = "passive";
      } else if (this._mode === "room") {
        const i = this._selectedRooms.indexOf(r.id);
        if (i >= 0) {
          cls = "selected";
          prefix =
            this._selectedRooms.length > 1 ? `<span class="order">${i + 1}</span>` : this._icon("mdi:check-circle");
        }
      } else cls = this._mode === "all" ? "static" : "passive";
      html += `
        <div class="room ${cls}" data-id="${r.id}" style="${pct(p.x, p.y)}" title="${esc(r.name)}">
          ${prefix}${this._icon(r.icon || "mdi:home-outline")}<span class="name">${esc(r.name)}</span>
        </div>`;
    }
    return html;
  }

  _shapesHtml(list, activeKind, W, H, pct, t) {
    let html = "";
    let lines = "";
    list.forEach((s0, i) => {
      const kind = s0.kind || "zone";
      const def = SHAPES[kind];
      const active = kind === activeKind;
      const inactive = active ? "" : "inactive";
      if (def.line) {
        lines += `<g class="${inactive}" data-shape="${i}">
          <line x1="${s0.x0}" y1="${s0.y0}" x2="${s0.x1}" y2="${s0.y1}" stroke="rgb(${def.color})" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke" ${kind === "split" ? 'stroke-dasharray="6 4"' : ""}/>
          <line class="hit" x1="${s0.x0}" y1="${s0.y0}" x2="${s0.x1}" y2="${s0.y1}" stroke-width="18" vector-effect="non-scaling-stroke"/>
        </g>`;
        if (active) {
          html += `<div class="handle" data-shape="${i}" data-c="p0" style="${pct(s0.x0, s0.y0)}"></div>
            <div class="handle" data-shape="${i}" data-c="p1" style="${pct(s0.x1, s0.y1)}"></div>
            <div class="del free" data-shape="${i}" style="${pct((s0.x0 + s0.x1) / 2, (s0.y0 + s0.y1) / 2)}">${this._icon("mdi:close")}</div>`;
        }
        return;
      }
      const z = normRect(s0);
      const a = t.toVacuum(z.x0, z.y0);
      const b = t.toVacuum(z.x1, z.y1);
      const dim = `${(Math.abs(b.x - a.x) / 1000).toFixed(1)} × ${(Math.abs(b.y - a.y) / 1000).toFixed(1)} m`;
      html += `
        <div class="shape ${kind} ${inactive}" data-shape="${i}" style="--c:${def.color};${pct(z.x0, z.y0)};width:${((z.x1 - z.x0) / W) * 100}%;height:${((z.y1 - z.y0) / H) * 100}%">
          ${
            active
              ? `<div class="dim">${dim}</div>
            <div class="handle tl" data-c="tl"></div><div class="handle tr" data-c="tr"></div>
            <div class="handle bl" data-c="bl"></div><div class="handle br" data-c="br"></div>
            <div class="del">${this._icon("mdi:close")}</div>`
              : ""
          }
        </div>`;
    });
    if (lines) html += `<svg class="lines" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${lines}</svg>`;
    return html;
  }

  _renderOverlay() {
    const layer = this.shadowRoot.querySelector(".layer");
    const img = this.shadowRoot.querySelector(".viewport img");
    const t = this._transform;
    if (!layer || !img) return;
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    if (!W || !t) {
      if (!img.complete) img.addEventListener("load", () => this._renderOverlay(), { once: true });
      return;
    }
    const pct = (x, y) => `left:${(x / W) * 100}%;top:${(y / H) * 100}%`;
    const ed = this._editor;
    let html = this._roomBadgesHtml(t, pct);

    if (ed) {
      const ctx = this._shapeCtx();
      const showRestricted = ["nogo", "nomop", "wall"].includes(ed.tool);
      if (showRestricted) html += this._shapesHtml(ed.shapes, ctx?.kind, W, H, pct, t);
      if (ed.tool === "rooms" && ed.splitting) html += this._shapesHtml(ed.split, "split", W, H, pct, t);
    } else if (this._mode === "zone") {
      html += this._shapesHtml(this._zones, this._isActive ? null : "zone", W, H, pct, t);
    } else if (this._mode === "spot") {
      this._spots.forEach((s, i) => {
        html += `<div class="spot" data-i="${i}" style="${pct(s.x, s.y)}"><div class="ring"></div>${this._icon("mdi:map-marker")}</div>`;
      });
    }
    if (!ed && this._config.show_obstacles !== false) html += this._objectsHtml(t, pct, W, H);
    layer.innerHTML = html;
    this._drawHighlight();
  }

  // furniture hit areas and obstacle markers from the map camera
  _objectsHtml(t, pct, W, H) {
    const a = this._mapEntity?.attributes || {};
    let html = "";
    (a.furnitures || []).forEach((f, i) => {
      if (f.x == null || f.y == null || !f.width || !f.height) return;
      // size in image px, measured along the furniture's own axes
      const o = t.toMap(0, 0);
      const ax = t.toMap(f.width, 0);
      const ay = t.toMap(0, f.height);
      const len = (p) => Math.hypot(p.x - o.x, p.y - o.y);
      const swap = Math.abs(ax.x - o.x) < Math.abs(ax.y - o.y); // map rotated 90°/270°
      const w = swap ? len(ay) : len(ax);
      const h = swap ? len(ax) : len(ay);
      const cx = f.x0 != null ? f.x0 + f.width / 2 : f.x;
      const cy = f.y0 != null ? f.y0 + f.height / 2 : f.y;
      const c = t.toMap(cx, cy);
      html += `<div class="furniture" data-furniture="${i}" title="${esc(f.type)}"
        style="${pct(c.x, c.y)};width:${(w / W) * 100}%;height:${(h / H) * 100}%;--a:${-(f.angle || 0)}deg"></div>`;
    });
    Object.entries(a.obstacles || {}).forEach(([k, o]) => {
      if (o.x == null || o.y == null) return;
      const p = t.toMap(o.x, o.y);
      const ignored = isIgnored(o);
      html += `<div class="obstacle ${ignored ? "ignored" : ""}" data-obstacle="${esc(k)}" style="${pct(p.x, p.y)}" title="${esc(o.type)}">
        ${this._icon(this._obstacleIcon(o.type))}</div>`;
    });
    return html;
  }

  _obstacleIcon(type = "") {
    const t = type.toLowerCase();
    if (/cable|wire|cord/.test(t)) return "mdi:power-plug-outline";
    if (/shoe|slipper/.test(t)) return "mdi:shoe-sneaker";
    if (/sock|cloth|towel/.test(t)) return "mdi:tshirt-crew-outline";
    if (/pet|poop|excrement|feces/.test(t)) return "mdi:paw";
    if (/weigh|scale/.test(t)) return "mdi:scale-bathroom";
    if (/liquid|stain|fluid/.test(t)) return "mdi:water-alert-outline";
    if (/base|seat|chair/.test(t)) return "mdi:chair-rolling";
    return "mdi:alert-circle-outline";
  }

  _obstaclePhoto(k) {
    const pics = this._mapEntity?.attributes?.obstacle_picture || {};
    const re = new RegExp(`[?&]index=${k}(&|$)`);
    return Object.values(pics).find((u) => re.test(u));
  }

  _modebarHtml() {
    const disabled = this._isActive ? "disabled" : "";
    return `
      <div class="modebar">
        ${MODES.map(
          (m) =>
            `<button class="${this._mode === m.id ? "active" : ""}" data-act="mode" data-mode="${m.id}" title="${m.label}" ${disabled}>${this._icon(m.icon)}</button>`
        ).join("")}
      </div>`;
  }

  _editorToolbarHtml() {
    return `
      <div class="modebar">
        ${this._editorTools().map(
          (m) =>
            `<button class="${this._editor.tool === m.id ? "active" : ""}" data-act="tool" data-tool="${m.id}" title="${m.label}">${this._icon(m.icon)}</button>`
        ).join("")}
      </div>`;
  }

  _editorActionsHtml() {
    const ed = this._editor;
    const pill = (act, icon, label, cls = "", disabled = false) =>
      `<button class="pill small ${cls}" data-act="${act}" ${disabled ? "disabled" : ""}>${this._icon(icon)}${label}</button>`;
    let html = "";
    if (ed.tool === "rooms") {
      if (ed.splitting) {
        html = pill("split-cancel", "mdi:close", "Cancel", "secondary") + pill("split-apply", "mdi:call-split", "Apply split", "", !ed.split.length);
      } else {
        const n = ed.rooms.length;
        html =
          pill("room-rename", "mdi:form-textbox", "Rename", "secondary", n !== 1) +
          (this._hasCustomCleaning ? pill("room-settings", "mdi:tune-variant", "Settings", "secondary", n !== 1) : "") +
          pill("split-start", "mdi:call-split", "Split", "secondary", n !== 1) +
          pill("room-merge", "mdi:call-merge", "Merge", "secondary", n !== 2);
      }
    } else if (ed.tool === "order") {
      html = pill("order-reset", "mdi:restore", "Reset", "secondary", !ed.order.length) + pill("editor-save", "mdi:check", "Save order", "", !ed.order.length);
    } else {
      const kind = ed.tool;
      const count = ed.shapes.filter((s) => s.kind === kind).length;
      html =
        pill("shape-add", "mdi:plus", "Add", "secondary", count >= SHAPES[kind].max) +
        pill("shape-clear", "mdi:delete-outline", "Clear", "secondary", !count) +
        pill("editor-save", "mdi:content-save-outline", "Save", "", !ed.dirty);
    }
    const legend = ["nogo", "nomop", "wall"].includes(ed.tool)
      ? `<div class="legend"><span style="--c:${SHAPES.nogo.color}">No-go</span><span style="--c:${SHAPES.nomop.color}">No-mop</span><span style="--c:${SHAPES.wall.color}">Wall</span></div>`
      : "";
    return `${legend}<div class="actions">${html}</div>`;
  }

  _actionsHtml() {
    const s = this._state;
    const unavailable = s === "unavailable";
    let primary;
    if (s === "cleaning") primary = `<button class="pill" data-act="pause">${this._icon("mdi:pause")}Pause</button>`;
    else if (s === "paused") primary = `<button class="pill" data-act="start">${this._icon("mdi:play")}Resume</button>`;
    else {
      const n =
        this._mode === "room" ? this._selectedRooms.length : this._mode === "zone" ? this._zones.length : this._mode === "spot" ? this._spots.length : 1;
      const label =
        this._mode === "room" && n
          ? `Clean ${n} room${n > 1 ? "s" : ""}`
          : this._mode === "zone" && n
            ? `Clean ${n} zone${n > 1 ? "s" : ""}`
            : this._mode === "spot" && n
              ? `Clean spot${n > 1 ? "s" : ""}`
              : "Clean";
      primary = `<button class="pill" data-act="start" ${unavailable || !n ? "disabled" : ""}>${this._icon("mdi:play")}${label}</button>`;
    }
    const stop =
      s === "paused" || s === "returning"
        ? `<button class="pill secondary" data-act="stop">${this._icon("mdi:stop")}Stop</button>`
        : "";
    const dock =
      s === "returning"
        ? ""
        : `<button class="pill" data-act="dock" ${unavailable || s === "docked" ? "disabled" : ""}>${this._icon("mdi:home-import-outline")}Dock</button>`;
    return `<div class="actions">${primary}${stop}${dock}</div>`;
  }

  _menuHtml() {
    const items = [
      ["locate", "mdi:map-marker-radius-outline", "Locate robot"],
      ["clear", "mdi:selection-remove", "Clear selection"],
      ["editor", "mdi:map-marker-path", "Edit map"],
      ...this._sections().map((s) => [`sheet:${s.id}`, s.icon, s.label]),
      ["floorplan", "mdi:floor-plan", this._fpOn ? "Camera map view" : "Floor plan view"],
      ["more", "mdi:information-outline", "Device details"],
    ];
    if (this._mapEntity) items.splice(2, 0, ["refresh", "mdi:refresh", "Refresh map"]);
    return `<div class="menu">${items
      .map(([act, icon, label]) => `<button data-act="menu-item" data-item="${act}">${this._icon(icon)}${label}</button>`)
      .join("")}</div>`;
  }

  _segHtml(entityId, options) {
    const st = this._st(entityId);
    if (!st) return "";
    const avail = st.attributes.options || options.map((o) => o.value);
    const off = st.state === "unavailable";
    return `<div class="seg">${options
      .filter((o) => avail.includes(o.value))
      .map(
        (o) =>
          `<button class="${st.state === o.value ? "active" : ""}" data-act="select" data-entity="${entityId}" data-value="${o.value}" ${off ? "disabled" : ""}>${this._icon(o.icon)}${esc(this._fmt(st, o.value) || o.label)}</button>`
      )
      .join("")}</div>`;
  }

  // segmented control for a per-room custom cleaning value
  _roomSegHtml(room, key, options, def) {
    const cur = room[key] ?? def;
    return `<div class="seg">${options
      .map(
        (o) =>
          `<button class="${cur === o.code ? "active" : ""}" data-act="room-set" data-key="${key}" data-value="${o.code}">${this._icon(o.icon)}${esc(o.label)}</button>`
      )
      .join("")}</div>`;
  }

  _sheetHtml(which = this._sheet) {
    const head = (title, back) => `
      <div class="sheet-head">
        ${back ? `<button class="icon-btn" data-act="sheet" data-sheet="${back}">${this._icon("mdi:arrow-left")}</button>` : "<span></span>"}
        <div class="t">${esc(title)}</div>
        <button class="icon-btn" data-act="close-sheet">${this._icon("mdi:close")}</button>
      </div>`;
    const extra = this._extraSheetHtml(which, head);
    if (extra != null) return extra;

    if (which === "settings") {
      const modeId = this._id("select", "cleaning_mode");
      const suctionId = this._id("select", "suction_level");
      const waterId = this._id("select", "water_volume");
      const mapId = this._id("select", "selected_map");
      const mode = this._st(modeId)?.state;
      const mapSel = this._st(mapId);
      const tank = this._st(this._id("sensor", "water_tank"));
      const tankOk = !tank || tank.state === "installed";
      const switches = SWITCHES.map(([key, label, icon]) => {
        const s = this._st(this._id("switch", key));
        if (!s) return "";
        return `<div class="row">${this._icon(icon)}<div class="grow">${label}</div>
          <button class="toggle ${s.state === "on" ? "on" : ""}" data-act="toggle" data-entity="${s.entity_id}" ${s.state === "unavailable" ? "disabled" : ""}></button></div>`;
      }).join("");
      return `
        ${head("Cleaning settings")}
        ${this._st(modeId) ? `<div class="section"><div class="section-label">Cleaning mode</div>${this._segHtml(modeId, CLEANING_MODES)}
          ${!tankOk ? `<div class="note">Water tank / mop not installed — mopping modes are unavailable.</div>` : ""}</div>` : ""}
        ${mode !== "mopping" ? `<div class="section"><div class="section-label">Suction power</div>${this._segHtml(suctionId, SUCTION_LEVELS)}</div>` : ""}
        ${mode !== "sweeping" && this._st(waterId) ? `<div class="section"><div class="section-label">Water volume</div>${this._segHtml(waterId, WATER_VOLUMES)}</div>` : ""}
        <div class="section"><div class="section-label">Cleaning times <span>room / zone / spot</span></div>
          <div class="seg">${[1, 2, 3]
            .map((n) => `<button class="${this._repeats === n ? "active" : ""}" data-act="repeats" data-value="${n}">${this._icon(`mdi:numeric-${n}-circle-outline`)}${n}×</button>`)
            .join("")}</div></div>
        ${mapSel && (mapSel.attributes.options || []).length > 1 ? `<div class="section"><div class="section-label">Map</div>
          <div class="seg">${mapSel.attributes.options
            .map((o) => `<button class="${mapSel.state === o ? "active" : ""}" data-act="select" data-entity="${mapId}" data-value="${esc(o)}">${this._icon("mdi:layers-outline")}${esc(o)}</button>`)
            .join("")}</div></div>` : ""}
        ${switches ? `<div class="section"><div class="section-label">Options</div>${switches}</div>` : ""}`;
    }

    if (which === "consumables") {
      const rows = CONSUMABLES.map(([key, reset, label, icon]) => {
        const s = this._st(this._id("sensor", key));
        if (!s) return "";
        const pct = Math.max(0, Math.min(100, parseFloat(s.state) || 0));
        const hours = this._st(this._id("sensor", key.replace("_left", "_time_left")));
        const sub = hours && !isNaN(parseFloat(hours.state)) ? `${Math.round(parseFloat(hours.state))} h left` : "";
        return `<div class="row">${this._icon(icon)}
          <div class="grow"><div>${label} <span class="sub">${sub}</span></div>
            <div class="bar ${pct < 10 ? "low" : ""}"><div style="width:${pct}%"></div></div></div>
          <div style="width:40px;text-align:right">${Math.round(pct)}%</div>
          <button class="link-btn" data-act="reset" data-value="${reset}" data-label="${label}">Reset</button></div>`;
      }).join("");
      return `${head("Maintenance")}<div class="section">${rows || `<div class="note">No consumable sensors found.</div>`}</div>`;
    }

    const room = this._room(this._sheetRoom);
    if (which === "rename" && room) {
      return `
        ${head(`Rename ${room.name}`)}
        <div class="section">
          <div class="section-label">Room type</div>
          <div class="chips">${ROOM_TYPES.map(
            ([code, label, icon]) =>
              `<button class="${room.type === code ? "active" : ""}" data-act="room-type" data-value="${code}">${this._icon(icon)}${esc(label)}</button>`
          ).join("")}</div>
          <div class="note">Choosing a type names the room and sets its icon.</div>
        </div>
        <div class="section">
          <div class="section-label">Custom name</div>
          <input class="text" id="rename" maxlength="24" value="${esc(room.custom_name || room.name)}" autofocus>
        </div>
        <div class="actions"><button class="pill" data-act="rename-save">${this._icon("mdi:check")}Save name</button></div>`;
    }

    if (which === "room-settings" && room) {
      const custom = this._st(this._id("switch", "customized_cleaning"));
      const mode = room.cleaning_mode ?? 2;
      return `
        ${head(room.name)}
        ${
          custom
            ? `<div class="row">${this._icon("mdi:home-edit-outline")}<div class="grow">Customized room cleaning
                <div class="sub">Per-room settings are only used while this is on</div></div>
                <button class="toggle ${custom.state === "on" ? "on" : ""}" data-act="toggle" data-entity="${custom.entity_id}"></button></div>`
            : ""
        }
        ${room.cleaning_mode != null ? `<div class="section"><div class="section-label">Cleaning mode</div>${this._roomSegHtml(room, "cleaning_mode", CLEANING_MODES, 2)}</div>` : ""}
        ${mode !== 1 ? `<div class="section"><div class="section-label">Suction power</div>${this._roomSegHtml(room, "suction_level", SUCTION_LEVELS, 1)}</div>` : ""}
        ${mode !== 0 ? `<div class="section"><div class="section-label">Water volume</div>${this._roomSegHtml(room, "water_volume", WATER_VOLUMES, 2)}</div>` : ""}
        <div class="section"><div class="section-label">Cleaning times</div>${this._roomSegHtml(
          room,
          "cleaning_times",
          [1, 2, 3].map((n) => ({ code: n, label: `${n}×`, icon: `mdi:numeric-${n}-circle-outline` })),
          1
        )}</div>`;
    }
    return "";
  }

  /* ----- obstacle, maps, history and device-settings sheets ----- */

  _extraSheetHtml(which, head) {
    const cam = this._mapEntity?.attributes || {};
    const vac = this._vac.attributes;

    if (which === "obstacle") {
      const o = (cam.obstacles || {})[this._sheetObstacle];
      if (!o) return `${head("Obstacle")}<div class="note">This obstacle is no longer on the map.</div>`;
      const photo = this._obstaclePhoto(this._sheetObstacle);
      const ignored = isIgnored(o);
      const room = o.room_id ? this._room(o.room_id)?.name : o.room;
      return `
        ${head(o.type || "Obstacle")}
        ${photo ? `<img class="photo" src="${esc(photo)}" alt="Obstacle photo" loading="lazy">` : ""}
        <div class="kv">
          <div>Type</div><div>${esc(o.type)}</div>
          ${o.possibility != null ? `<div>Confidence</div><div>${esc(o.possibility)}%</div>` : ""}
          ${room ? `<div>Room</div><div>${esc(room)}</div>` : ""}
          ${o.ignore_status ? `<div>Status</div><div>${esc(o.ignore_status)}</div>` : ""}
          ${o.reason ? `<div>Reason</div><div>${esc(o.reason)}</div>` : ""}
        </div>
        ${
          photo
            ? `<div class="actions">
          <button class="pill ${ignored ? "" : "secondary"}" data-act="obstacle-ignore" data-value="${ignored ? 0 : 1}">
            ${this._icon(ignored ? "mdi:eye-outline" : "mdi:eye-off-outline")}${ignored ? "Avoid again" : "Ignore — it's not an obstacle"}</button>
        </div>`
            : ""
        }`;
    }

    if (which === "maps") {
      const maps = vac.maps || [];
      const selected = vac.selected_map_id;
      const rows = maps
        .map((m) => {
          const name = m.custom_name || m.name || `Map ${m.index}`;
          const date = m.date ? new Date(m.date).toLocaleString() : "";
          const isSel = m.id === selected;
          return `
            <div class="list-row ${isSel ? "active" : ""}">
              ${this._icon(isSel ? "mdi:layers" : "mdi:layers-outline")}
              <div class="grow"><div class="t">${esc(name)}</div><div class="sub">${esc(date)}${isSel ? " · in use" : ""}</div></div>
              <div class="btns">
                ${isSel ? "" : `<button class="link-btn" data-act="map-select" data-id="${m.id}">Use</button>`}
                <button class="link-btn" data-act="map-rename" data-id="${m.id}">Rename</button>
                <button class="link-btn" data-act="map-backup" data-id="${m.id}">Backup</button>
                <button class="link-btn" data-act="map-delete" data-id="${m.id}" data-name="${esc(name)}">${this._icon("mdi:delete-outline")}</button>
              </div>
            </div>`;
        })
        .join("");
      const recovery = Object.entries(cam.recovery_map_picture || {});
      const recRows = recovery
        .map(([label, url]) => {
          const idx = (url.match(/[?&]index=(\d+)/) || [])[1];
          const open = this._historyOpen === `r:${label}`;
          return `
            <div class="list-row" data-act="history-toggle" data-key="r:${esc(label)}">
              ${this._icon("mdi:backup-restore")}
              <div class="grow"><div class="t">${esc(label)}</div></div>
              <button class="link-btn" data-act="map-restore" data-index="${idx}" data-label="${esc(label)}">Restore</button>
            </div>
            ${open ? `<img class="photo" src="${esc(url)}" alt="" loading="lazy">` : ""}`;
        })
        .join("");
      const mapping = this._st(this._id("button", "start_fast_mapping"));
      return `
        ${head("Maps")}
        <div class="section">${rows || `<div class="note">No saved maps yet.</div>`}</div>
        ${mapping ? `<div class="actions"><button class="pill secondary" data-act="press" data-entity="${mapping.entity_id}" data-confirm="Start fast mapping? The robot will explore without cleaning.">${this._icon("mdi:map-plus")}New map (fast mapping)</button></div>` : ""}
        ${recRows ? `<div class="group-label">Recovery points for the current map</div><div>${recRows}</div>
          <div class="note">Restoring replaces the current map with this earlier version.</div>` : ""}`;
    }

    if (which === "map-rename") {
      const m = (vac.maps || []).find((x) => x.id === this._sheetMap);
      return `
        ${head("Rename map", "maps")}
        <div class="section"><input class="text" id="rename-map" maxlength="24" value="${esc(m?.custom_name || m?.name || "")}" autofocus></div>
        <div class="actions"><button class="pill" data-act="map-rename-save">${this._icon("mdi:check")}Save</button></div>`;
    }

    if (which === "history") {
      const stat = (key, label, unit, fmt = (v) => Math.round(v)) => {
        const s = this._st(this._id("sensor", key));
        const v = parseFloat(s?.state);
        return s && !isNaN(v) ? `<div class="stat-box" data-more="${s.entity_id}"><b>${fmt(v)}</b><span>${label}${unit ? ` (${unit})` : ""}</span></div>` : "";
      };
      const totals = [
        stat("cleaning_count", "Cleans", ""),
        stat("total_cleaned_area", "Total area", "m²"),
        stat("total_cleaning_time", "Total time", "h", (v) => (v / 60).toFixed(1)),
      ].join("");
      const first = this._st(this._id("sensor", "first_cleaning_date"));
      const entries = Object.entries(cam.cleaning_history_picture || {});
      const rows = entries
        .map(([label, url]) => {
          const m = label.match(/^\d+:\s*([^-]+?)\s+-\s+(.*)$/);
          const when = m ? m[1] : label;
          const what = m ? m[2] : "";
          const ok = /\(Completed\)/.test(what);
          const open = this._historyOpen === label;
          return `
            <div class="list-row" data-act="history-toggle" data-key="${esc(label)}">
              ${this._icon(ok ? "mdi:check-circle-outline" : "mdi:alert-circle-outline")}
              <div class="grow"><div class="t">${esc(what.replace(/\s*\((Completed|Interrupted)\)/, "") || label)}</div>
                <div class="sub">${esc(when)} · ${ok ? "Completed" : "Interrupted"}</div></div>
              ${this._icon(open ? "mdi:chevron-up" : "mdi:chevron-down")}
            </div>
            ${open ? `<img class="photo" src="${esc(url)}" alt="Cleaning map" loading="lazy">` : ""}`;
        })
        .join("");
      return `
        ${head("Cleaning history")}
        ${totals ? `<div class="section"><div class="stat-grid">${totals}</div>
          ${first ? `<div class="note">Cleaning since ${esc(this._fmt(first))}</div>` : ""}</div>` : ""}
        <div class="section">${rows || `<div class="note">No cleaning history yet.</div>`}</div>`;
    }

    if (which === "device") {
      const ents = this._deviceEntities();
      if (!ents.length)
        return `${head("All settings")}<div class="note">Couldn't find the vacuum's device entities.</div>`;
      const f = this._deviceFilter.toLowerCase();
      const groups = [
        ["Controls", (e) => !e.entity_category && ["switch", "select", "number", "time", "button"].includes(e.entity_id.split(".")[0])],
        ["Configuration", (e) => e.entity_category === "config"],
        ["Status", (e) => !e.entity_category && ["sensor", "binary_sensor"].includes(e.entity_id.split(".")[0])],
        ["Diagnostics", (e) => e.entity_category === "diagnostic"],
      ];
      const seen = new Set();
      let html = "";
      for (const [label, test] of groups) {
        const list = ents
          .filter((e) => !seen.has(e.entity_id) && test(e))
          .filter((e) => !f || this._shortName(e.stateObj).toLowerCase().includes(f) || e.entity_id.includes(f))
          .sort((a, b) => this._shortName(a.stateObj).localeCompare(this._shortName(b.stateObj)));
        list.forEach((e) => seen.add(e.entity_id));
        if (!list.length) continue;
        html += `<div class="group-label">${label}</div>${list.map((e) => this._entityRowHtml(e.stateObj)).join("")}`;
      }
      return `
        ${head("All settings")}
        <div class="search"><input class="text" id="device-filter" placeholder="Search settings" value="${esc(this._deviceFilter)}"></div>
        ${html || `<div class="note">Nothing matches.</div>`}`;
    }
    return null;
  }

  _entityRowHtml(s) {
    const id = s.entity_id;
    const domain = id.split(".")[0];
    const off = s.state === "unavailable";
    const name = esc(this._shortName(s));
    const icon = s.attributes.icon || { switch: "mdi:toggle-switch-outline", select: "mdi:format-list-bulleted", number: "mdi:numeric", time: "mdi:clock-outline", button: "mdi:gesture-tap-button", binary_sensor: "mdi:checkbox-blank-circle-outline" }[domain] || "mdi:information-outline";
    let ctl = "";
    if (domain === "switch")
      ctl = `<button class="toggle ${s.state === "on" ? "on" : ""}" data-act="toggle" data-entity="${id}" ${off ? "disabled" : ""}></button>`;
    else if (domain === "select")
      ctl = `<select data-set="select" data-entity="${id}" ${off ? "disabled" : ""}>${(s.attributes.options || [])
        .map((o) => `<option value="${esc(o)}" ${o === s.state ? "selected" : ""}>${esc(this._fmt(s, o))}</option>`)
        .join("")}</select>`;
    else if (domain === "number") {
      const { min = 0, max = 100, step = 1, unit_of_measurement: u = "" } = s.attributes;
      ctl = `<input type="range" min="${min}" max="${max}" step="${step}" value="${esc(s.state)}" data-set="number" data-entity="${id}" ${off ? "disabled" : ""}><span class="v">${esc(s.state)}</span>${u ? `<span class="v" style="min-width:0">${esc(u)}</span>` : ""}`;
    } else if (domain === "time")
      ctl = `<input type="time" step="60" value="${esc(String(s.state).slice(0, 5))}" data-set="time" data-entity="${id}" ${off ? "disabled" : ""}>`;
    else if (domain === "button")
      ctl = `<button class="link-btn" data-act="press" data-entity="${id}" data-confirm="${name}?" ${off ? "disabled" : ""}>Run</button>`;
    else ctl = `<span class="v" style="min-width:0;text-align:right">${esc(this._fmt(s))}</span>`;
    return `<div class="row">${this._icon(icon)}<div class="grow" data-more="${id}" style="cursor:pointer">${name}</div><div class="ctl">${ctl}</div></div>`;
  }

  _onChange(ev) {
    const t = ev.composedPath()[0];
    const kind = t.dataset?.set;
    if (!kind) return;
    const entity_id = t.dataset.entity;
    if (kind === "select") this._callService("select", "select_option", { entity_id, option: t.value }).catch(() => {});
    if (kind === "number") this._callService("number", "set_value", { entity_id, value: Number(t.value) }).catch(() => {});
    if (kind === "time" && t.value) this._callService("time", "set_value", { entity_id, time: `${t.value}:00` }).catch(() => {});
    t.blur();
  }

  async _setRoomType(id, code) {
    const room = this._room(id);
    // [type, index, custom name]; a plain "Room" keeps its current name
    const data = { type: { [String(id)]: [code, 0, code === 0 ? room?.custom_name || room?.name || "Room" : ""] } };
    if (this._mapId) data.map_id = this._mapId;
    try {
      await this._dreameService("vacuum_set_segment_type", data);
      this._sheet = null;
      this._render(true);
    } catch (e) {
      /* toast already shown */
    }
  }

  async _renameMap(id, name) {
    name = (name || "").trim();
    if (!name) return this._toast("Enter a map name");
    try {
      await this._dreameService("vacuum_rename_map", { map_id: id, map_name: name });
      this._sheet = "maps";
      this._render(true);
    } catch (e) {
      /* toast already shown */
    }
  }

  _onClick(ev) {
    const path = ev.composedPath();
    const el = path.find((n) => n.dataset?.act || n.dataset?.more !== undefined);
    if (this._menu && !(el && (el.dataset.act === "menu-item" || el.dataset.act === "menu"))) {
      this._menu = false;
      this._render(true);
      if (!el) return;
    }
    if (!el) return;
    if (el.dataset.more !== undefined && !el.dataset.act) {
      if (el.dataset.more) this._moreInfo(el.dataset.more);
      return;
    }
    const act = el.dataset.act;
    if (act === "close-sheet" && el.classList.contains("scrim") && path[0] !== el) return;
    const ed = this._editor;
    switch (act) {
      case "menu":
        this._menu = !this._menu;
        return this._render(true);
      case "menu-item": {
        this._menu = false;
        const item = el.dataset.item;
        if (item === "locate") this._vacService("locate");
        else if (item === "clear") {
          this._selectedRooms = [];
          this._zones = [];
          this._spots = [];
        } else if (item === "refresh") this._dreameService("vacuum_request_map").catch(() => {});
        else if (item === "more") this._moreInfo(this._config.entity);
        else if (item === "editor") return this._openEditor();
        else if (item === "floorplan") return this._setFloorPlan(!this._fpOn);
        else if (item.startsWith("sheet:")) this._sheet = item.slice(6);
        return this._render(true);
      }
      case "mode":
        return this._setMode(el.dataset.mode);
      case "start":
        return this._start();
      case "pause":
        return this._vacService("pause");
      case "stop":
        return this._vacService("stop");
      case "dock":
        return this._vacService("return_to_base");
      case "recenter":
        this._view = { s: 1, x: 0, y: 0 };
        return this._applyView();
      case "sheet":
        this._sheet = el.dataset.sheet;
        return this._render(true);
      case "close-sheet":
        this._sheet = this._wide ? "settings" : null;
        return this._render(true);
      case "banner": {
        const target = el.dataset.target;
        if (target === "fp-off") return this._setFloorPlan(false);
        if (target.startsWith("sheet:")) {
          this._sheet = target.slice(6);
          return this._render(true);
        }
        return this._moreInfo(target);
      }
      case "press":
        if (el.dataset.confirm && !confirm(el.dataset.confirm)) return;
        return this._callService("button", "press", { entity_id: el.dataset.entity }).catch(() => {});
      case "room-type":
        return this._setRoomType(this._sheetRoom, Number(el.dataset.value));
      case "obstacle-ignore": {
        const o = (this._mapEntity?.attributes?.obstacles || {})[this._sheetObstacle];
        if (!o) return;
        return this._dreameService("vacuum_set_obstacle_ignore", { x: o.x, y: o.y, obstacle_ignored: el.dataset.value === "1" })
          .then(() => this._toast(el.dataset.value === "1" ? "The robot will clean over this spot" : "The robot will avoid this obstacle"))
          .catch(() => {});
      }
      case "history-toggle":
        this._historyOpen = this._historyOpen === el.dataset.key ? null : el.dataset.key;
        return this._render(true);
      case "map-select":
        return this._dreameService("vacuum_select_map", { map_id: Number(el.dataset.id) }).catch(() => {});
      case "map-rename":
        this._sheetMap = Number(el.dataset.id);
        this._sheet = "map-rename";
        return this._render(true);
      case "map-rename-save":
        return this._renameMap(this._sheetMap, this.shadowRoot.getElementById("rename-map")?.value);
      case "map-backup":
        return this._dreameService("vacuum_backup_map", { map_id: Number(el.dataset.id) })
          .then(() => this._toast("Map backup saved"))
          .catch(() => {});
      case "map-delete":
        if (!confirm(`Delete map "${el.dataset.name}"? This can't be undone.`)) return;
        return this._dreameService("vacuum_delete_map", { map_id: Number(el.dataset.id) }).catch(() => {});
      case "map-restore": {
        ev.stopPropagation();
        if (!confirm(`Restore "${el.dataset.label}"? The current map will be replaced.`)) return;
        const data = { recovery_map_index: Number(el.dataset.index) };
        const mapId = this._vac.attributes.selected_map_id ?? this._mapId;
        if (mapId) data.map_id = mapId;
        return this._dreameService("vacuum_restore_map", data)
          .then(() => this._toast("Map restored — it will refresh shortly"))
          .catch(() => {});
      }
      case "select":
        return this._callService("select", "select_option", { entity_id: el.dataset.entity, option: el.dataset.value }).catch(() => {});
      case "toggle":
        return this._callService("switch", "toggle", { entity_id: el.dataset.entity }).catch(() => {});
      case "repeats":
        this._repeats = Number(el.dataset.value);
        return this._render(true);
      case "reset":
        if (confirm(`Reset ${el.dataset.label}?`))
          this._dreameService("vacuum_reset_consumable", { consumable: el.dataset.value }).catch(() => {});
        return;

      /* editor */
      case "editor-open":
        return this._openEditor();
      case "editor-close":
        return this._closeEditor();
      case "editor-save":
        if (!ed) return;
        return ed.tool === "order" ? this._saveOrder() : this._saveRestricted();
      case "tool":
        if (ed.tool === "order" && el.dataset.tool !== "order") {
          if (ed.order.length && !confirm("Discard the new cleaning order?")) return;
          ed.order = [];
        }
        ed.tool = el.dataset.tool;
        ed.splitting = false;
        ed.split = [];
        return this._render(true);
      case "shape-add": {
        const img = this.shadowRoot.querySelector(".viewport img");
        // drop it in the middle of what's currently visible
        const map = this.shadowRoot.querySelector(".map").getBoundingClientRect();
        const p = this._imgPoint({ clientX: map.left + map.width / 2, clientY: map.top + map.height / 2 });
        if (img) this._addDefaultShape(this._shapeCtx(), p);
        return this._render(true);
      }
      case "shape-clear":
        if (!confirm("Remove all of these on the map?")) return;
        ed.shapes = ed.shapes.filter((s) => s.kind !== ed.tool);
        ed.dirty = true;
        return this._render(true);
      case "order-reset":
        ed.order = [];
        return this._render(true);
      case "room-rename":
        this._sheetRoom = ed.rooms[0];
        this._sheet = "rename";
        return this._render(true);
      case "rename-pick": {
        const input = this.shadowRoot.getElementById("rename");
        if (input) input.value = el.dataset.value;
        return;
      }
      case "rename-save":
        return this._renameRoom(this._sheetRoom, this.shadowRoot.getElementById("rename")?.value);
      case "room-settings":
        this._sheetRoom = ed.rooms[0];
        this._sheet = "room-settings";
        return this._render(true);
      case "room-set":
        return this._setRoomSetting(this._sheetRoom, el.dataset.key, Number(el.dataset.value));
      case "room-merge":
        return this._mergeRooms();
      case "split-start":
        ed.splitting = true;
        ed.split = [];
        ed.rooms = ed.rooms.slice(0, 1);
        return this._render(true);
      case "split-cancel":
        ed.splitting = false;
        ed.split = [];
        return this._render(true);
      case "split-apply":
        return this._applySplit();
    }
  }
}

customElements.define("dreame-d10s-card", DreameD10sCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "dreame-d10s-card",
  name: "Dreame D10S Card",
  description: "Map, room/zone/spot cleaning, map editor and settings for the Dreame D10S (dreame_vacuum integration).",
  preview: false,
});

console.info(`%c DREAME-D10S-CARD %c v${CARD_VERSION} `, "background:#1ea0d7;color:#fff;font-weight:700", "background:#333;color:#fff");
