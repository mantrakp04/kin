import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

export type GraphData = FunctionReturnType<typeof api.graph.get>;
export type GraphNode = GraphData["nodes"][number];
export type Tier = GraphNode["tier"];

export const TIER_ORDER: Tier[] = ["inner", "close", "catching_up", "dormant"];
export const TIER_LABEL: Record<Tier, string> = { inner: "Inner circle", close: "Close", catching_up: "Catching up", dormant: "Dormant" };
const NODE_R: Record<Tier, number> = { inner: 15, close: 13, catching_up: 11, dormant: 9 };

export type Layout = {
  n: number;
  sx: number[];
  sy: number[];
  ex: number[];
  ey: number[];
  r: number[];
  rings: number[];
  extent: number;
  edges: { a: number[]; b: number[]; w: number[]; you: number[] };
  halos: { x: number; y: number; r: number; name: string; index: number }[];
  clusterOf: number[];
  priority: number[];
};

function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function computeLayout(data: GraphData): Layout {
  const { nodes, edges, clusters } = data;
  const n = nodes.length;
  const unit = 70 * Math.max(1, Math.sqrt(n / 50));
  const rings = [1.25, 2.2, 3.2, 4.2].map((m) => m * unit);
  const ringOf = (t: Tier) => rings[TIER_ORDER.indexOf(t)];
  const r = nodes.map((nd, i) => (i === 0 ? 22 : NODE_R[nd.tier]));
  const clusterIndex = new Map(clusters.map((c, i) => [c.id, i]));
  const clusterOf = nodes.map((nd, i) => (i === 0 || nd.cluster === null ? -1 : (clusterIndex.get(nd.cluster) ?? -1)));

  const groups: number[][] = [...clusters.map(() => [] as number[]), []];
  for (let i = 1; i < n; i++) groups[clusterOf[i] === -1 ? clusters.length : clusterOf[i]].push(i);
  const rnd = rand(n * 7919 + edges.length);
  const x = new Array<number>(n).fill(0);
  const y = new Array<number>(n).fill(0);
  let angle = -Math.PI / 2;
  const centerAngle: number[] = [];
  for (const g of groups) {
    const width = (g.length / Math.max(1, n - 1)) * Math.PI * 2;
    centerAngle.push(angle + width / 2);
    g.forEach((i, k) => {
      const a = angle + ((k + 0.5) / g.length) * width;
      const rr = ringOf(nodes[i].tier) + (rnd() - 0.5) * unit * 0.4;
      x[i] = Math.cos(a) * rr;
      y[i] = Math.sin(a) * rr;
    });
    angle += width;
  }
  const sx = x.map((v) => v * 0.3);
  const sy = y.map((v) => v * 0.3);

  const links = edges.filter((e) => e.a !== 0);
  const vx = new Array<number>(n).fill(0);
  const vy = new Array<number>(n).fill(0);
  const cell = 48;
  const ITER = n > 200 ? 110 : 160;
  for (let it = 0; it < ITER; it++) {
    const alpha = 1 - it / ITER;
    const grid = new Map<string, number[]>();
    for (let i = 1; i < n; i++) {
      const key = Math.floor(x[i] / cell) + ":" + Math.floor(y[i] / cell);
      const c = grid.get(key);
      if (c) c.push(i);
      else grid.set(key, [i]);
    }
    for (let i = 1; i < n; i++) {
      const gx = Math.floor(x[i] / cell);
      const gy = Math.floor(y[i] / cell);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const c = grid.get(gx + dx + ":" + (gy + dy));
          if (!c) continue;
          for (const j of c) {
            if (j <= i) continue;
            let ddx = x[j] - x[i];
            let ddy = y[j] - y[i];
            let d = Math.hypot(ddx, ddy);
            const min = (r[i] + r[j]) * 1.35 + 6;
            if (d >= min) continue;
            if (d < 0.01) {
              ddx = rnd() - 0.5;
              ddy = rnd() - 0.5;
              d = Math.hypot(ddx, ddy);
            }
            const push = ((min - d) / d) * 0.5;
            vx[i] -= ddx * push;
            vy[i] -= ddy * push;
            vx[j] += ddx * push;
            vy[j] += ddy * push;
          }
        }
    }
    for (const e of links) {
      const ddx = x[e.b] - x[e.a];
      const ddy = y[e.b] - y[e.a];
      const d = Math.hypot(ddx, ddy) || 1;
      const f = ((d - unit * 0.9) / d) * 0.03 * e.weight * alpha;
      vx[e.a] += ddx * f;
      vy[e.a] += ddy * f;
      vx[e.b] -= ddx * f;
      vy[e.b] -= ddy * f;
    }
    for (let i = 1; i < n; i++) {
      const d = Math.hypot(x[i], y[i]) || 1;
      const f = ((ringOf(nodes[i].tier) - d) / d) * 0.06;
      vx[i] += x[i] * f;
      vy[i] += y[i] * f;
      const g = clusterOf[i] === -1 ? clusters.length : clusterOf[i];
      const ca = centerAngle[g];
      const a = Math.atan2(y[i], x[i]);
      let da = ca - a;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const pull = da * 0.012 * alpha * (clusterOf[i] === -1 ? 0.3 : 1);
      vx[i] += -Math.sin(a) * d * pull;
      vy[i] += Math.cos(a) * d * pull;
    }
    for (let i = 1; i < n; i++) {
      vx[i] *= 0.55;
      vy[i] *= 0.55;
      x[i] += vx[i];
      y[i] += vy[i];
    }
  }

  const halos = clusters.map((c, ci) => {
    const members = groups[ci];
    const cx = members.reduce((s, i) => s + x[i], 0) / members.length;
    const cy = members.reduce((s, i) => s + y[i], 0) / members.length;
    const d = members.map((i) => Math.hypot(x[i] - cx, y[i] - cy) + r[i]);
    const rms = Math.sqrt(d.reduce((s, v) => s + v * v, 0) / d.length);
    return { x: cx, y: cy, r: Math.max(40, Math.min(Math.max(...d), rms * 1.15) + 14), name: c.name, index: ci };
  });

  const priority = nodes
    .map((nd, i) => ({ i, p: i === 0 ? 99 : nd.closeness + nd.degree * 0.04 }))
    .sort((a, b) => b.p - a.p)
    .map((e) => e.i);
  const extent = Math.max(rings[3], ...x.map((v, i) => Math.hypot(v, y[i]) + r[i]));
  return {
    n,
    sx,
    sy,
    ex: x,
    ey: y,
    r,
    rings,
    extent,
    edges: { a: edges.map((e) => e.a), b: edges.map((e) => e.b), w: edges.map((e) => e.weight), you: edges.map((e) => (e.a === 0 ? 1 : 0)) },
    halos,
    clusterOf,
    priority,
  };
}

export function neighbors(data: GraphData, i: number) {
  const out: number[] = [];
  for (const e of data.edges) {
    if (e.a === 0 || e.b === 0) continue;
    if (e.a === i) out.push(e.b);
    else if (e.b === i) out.push(e.a);
  }
  return out;
}

export function introPath(data: GraphData, target: number): number[] | null {
  const n = data.nodes.length;
  const adj: Array<Array<[number, number]>> = data.nodes.map(() => []);
  for (const e of data.edges) {
    if (e.a === 0) {
      const t = data.nodes[e.b].tier;
      if (e.b !== target && (t === "inner" || t === "close")) adj[0].push([e.b, 1 + (1 - e.weight)]);
      continue;
    }
    adj[e.a].push([e.b, 1 + (1 - e.weight)]);
    adj[e.b].push([e.a, 1 + (1 - e.weight)]);
  }
  const dist = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  dist[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u === -1 || dist[i] < dist[u])) u = i;
    if (u === -1 || u === target) break;
    done[u] = true;
    for (const [v, w] of adj[u])
      if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        prev[v] = u;
      }
  }
  if (dist[target] === Infinity) return null;
  const path = [target];
  while (path[0] !== 0) path.unshift(prev[path[0]]);
  return path;
}
