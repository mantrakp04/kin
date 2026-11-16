import { Canvas, Circle, PaintStyle, Picture, Shader, Skia, createPicture, matchFont, useClock, type SkFont } from "@shopify/react-native-skia";
import { useAction, useQuery } from "convex/react";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { GestureDetector, useCompetingGestures, useLongPressGesture, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useDerivedValue, useReducedMotion, useSharedValue, withSpring, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { api } from "../../../convex/_generated/api";
import { useSession } from "../../lib/session";
import { hexToRgb } from "../../shaders/oklab";
import { spring, springs } from "../../theme/motion";
import { color, hsl, type } from "../../theme/tokens";
import { GraphFocusCard } from "./GraphFocusCard";
import { TIER_LABEL, TIER_ORDER, computeLayout, introPath, neighbors, type GraphData, type Layout } from "./graphLayout";

const glowSource = String.raw`
uniform float2 center;
uniform float radius;
uniform float3 colorA;
uniform float3 colorB;
uniform float time;
uniform float strength;

float3 glowHash(float3 p) {
  float3 p3 = fract(p * float3(0.1031, 0.11369, 0.13787));
  p3 += dot(p3, p3.yxz + 19.19);
  return -1.0 + 2.0 * fract((p3.xxy + p3.yzz) * p3.zyx);
}

float glowNoise(float3 p) {
  const float F3 = 0.333333343;
  const float G3 = 0.166666672;
  float3 s = floor(p + (p.x + p.y + p.z) * F3);
  float3 x = p - s + (s.x + s.y + s.z) * G3;
  float3 e = step(float3(0.0), x - x.yzx);
  float3 i1 = e * (1.0 - e.zxy);
  float3 i2 = 1.0 - e.zxy * (1.0 - e);
  float3 x1 = x - i1 + G3;
  float3 x2 = x - i2 + 2.0 * G3;
  float3 x3 = x - 0.5;
  float4 w = max(0.6 - float4(dot(x, x), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  w = w * w * w * w;
  float4 d = float4(dot(x, glowHash(s)), dot(x1, glowHash(s + i1)), dot(x2, glowHash(s + i2)), dot(x3, glowHash(s + 1.0)));
  return dot(float4(31.316), d * w);
}

half4 main(float2 xy) {
  float2 p = (xy - center) / radius;
  float d = length(p);
  float nz = glowNoise(float3(p * 1.4, time * 0.22)) + 0.5;
  float edge = 0.84 + 0.12 * (nz - 0.5);
  float body = 1.0 - smoothstep(0.0, edge, d);
  float rim = exp(-pow((d - edge) * 8.0, 2.0));
  float angle = atan(p.y, p.x);
  float sweep = 0.5 + 0.5 * sin(angle - time * 0.5);
  float3 rgb = mix(colorA, colorB, clamp(nz * 0.6 + 0.4 * sweep, 0.0, 1.0));
  float a = clamp(body * body * 0.11 + rim * (0.1 + 0.26 * sweep), 0.0, 1.0) * strength;
  return half4(half3(rgb * a), a);
}
`;

const glow = Skia.RuntimeEffect.Make(glowSource)!;
const HALO_COLORS: Array<[string, string]> = [
  ["#FF844F", "#F773A5"],
  ["#F773A5", "#A78BFA"],
  ["#7C83FD", "#5EC8F2"],
  ["#4FD1A5", "#5EC8F2"],
  ["#FFB547", "#FF844F"],
  ["#C084FC", "#F773A5"],
];
const INITIAL_SIZES = [9, 11, 13.5];
const initialFonts = INITIAL_SIZES.map((fontSize) => matchFont({ fontFamily: "Helvetica Neue", fontSize, fontWeight: "600" }));
const nameFont = matchFont({ fontFamily: "Helvetica Neue", fontSize: 11.5, fontWeight: "500" });
const monoFont = matchFont({ fontFamily: "Menlo", fontSize: 9 });
const INK = 0xff1b1a22;
const ACCENT = 0xff3139fb;
const WHITE = 0xffffffff;

type Scene = {
  layout: Layout;
  fill: number[];
  initials: string[];
  initialW: number[][];
  name: string[];
  nameW: number[];
  first: string[];
  firstW: number[];
  ringText: string[];
  ringW: number[];
  haloText: string[];
  haloW: number[];
};

type Marks = { active: boolean; focus: number; lit: number[]; match: number[]; path: number[]; cluster: number };
const NO_MARKS: Marks = { active: false, focus: -1, lit: [], match: [], path: [], cluster: -1 };

const width = (font: SkFont, s: string) => font.measureText(s).width;
const argb = (hex: string) => (0xff000000 | parseInt(hex.slice(1), 16)) >>> 0;

export function PeopleGraph({ q, top, bottom }: { q: string; top: number; bottom: number }) {
  const { userKey } = useSession();
  const data = useQuery(api.graph.get, { userKey });
  const nameClusters = useAction(api.graph.nameClusters);
  const still = useReducedMotion();
  const clock = useClock();
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [focus, setFocus] = useState(-1);
  const [path, setPath] = useState<{ target: number; nodes: number[] | null } | null>(null);
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (!data || data.named || !data.clusters.length || asked.current === data.signature) return;
    asked.current = data.signature;
    nameClusters({ userKey }).catch(() => {});
  }, [data?.signature, data?.named]);

  const structure = data ? data.signature + data.nodes.map((n) => n.key + n.tier).join() + data.edges.map((e) => e.a + "-" + e.b).join() : "";
  const layout = useMemo(() => (data ? computeLayout(data) : null), [structure]);
  const scene = useMemo<Scene | null>(() => {
    if (!data || !layout) return null;
    const names = new Map(data.clusters.map((c) => [c.id, c.name]));
    const nodes = data.nodes;
    const ringText = TIER_ORDER.map((t) => TIER_LABEL[t].toUpperCase());
    const haloText = layout.halos.map((h) => (names.get(data.clusters[h.index].id) ?? h.name).toUpperCase());
    return {
      layout,
      fill: nodes.map((n, i) => (i === 0 ? INK : argb(hsl(n.hue, 0.72, 0.8)))),
      initials: nodes.map((n) => n.initials),
      initialW: initialFonts.map((f) => nodes.map((n) => width(f, n.initials))),
      name: nodes.map((n, i) => (i === 0 ? "You" : n.name)),
      nameW: nodes.map((n, i) => width(nameFont, i === 0 ? "You" : n.name)),
      first: nodes.map((n, i) => (i === 0 ? "You" : n.name.split(" ")[0])),
      firstW: nodes.map((n, i) => width(nameFont, i === 0 ? "You" : n.name.split(" ")[0])),
      ringText,
      ringW: ringText.map((s) => width(monoFont, s)),
      haloText,
      haloW: haloText.map((s) => width(monoFont, s)),
    };
  }, [layout, data]);

  const sceneSV = useSharedValue<Scene | null>(null);
  const marks = useSharedValue<Marks>(NO_MARKS);
  const ox = useSharedValue(0);
  const oy = useSharedValue(0);
  const k = useSharedValue(1);
  const kMin = useSharedValue(0.1);
  const progress = useSharedValue(0);
  const W = useSharedValue(0);
  const H = useSharedValue(0);

  const area = { top, height: Math.max(1, box.height - top - bottom) };
  const fit = layout && box.width ? Math.min(2, Math.min(box.width, area.height) / 2 / (layout.extent + 34)) : 1;

  useEffect(() => {
    sceneSV.value = scene;
  }, [scene]);

  useEffect(() => {
    if (!layout || !box.width) return;
    W.value = box.width;
    H.value = box.height;
    k.value = fit;
    kMin.value = fit * 0.6;
    ox.value = box.width / 2;
    oy.value = top + area.height / 2;
    progress.value = 0;
    progress.value = still ? 1 : withSpring(1, spring({ response: 1.1, damping: 0.78 }));
  }, [layout, box.width, box.height, top, bottom]);

  const needle = q.trim().toLowerCase();
  useEffect(() => {
    if (!data) return;
    const n = data.nodes.length;
    const match = new Array<number>(n).fill(0);
    if (needle) data.nodes.forEach((nd, i) => i > 0 && (nd.name.toLowerCase().includes(needle) || nd.city.toLowerCase().includes(needle) || nd.role.toLowerCase().includes(needle)) && (match[i] = 1));
    const lit = new Array<number>(n).fill(0);
    if (focus > 0) {
      lit[0] = 1;
      lit[focus] = 1;
      for (const j of neighbors(data, focus)) lit[j] = 1;
    }
    for (const i of path?.nodes ?? []) lit[i] = 1;
    if (focus <= 0) match.forEach((m, i) => m && (lit[i] = 1));
    marks.value = {
      active: focus > 0 || !!needle,
      focus,
      lit,
      match,
      path: path?.nodes ?? [],
      cluster: focus > 0 && layout ? layout.clusterOf[focus] : -1,
    };
  }, [data, focus, path, needle, layout]);

  const center = (i: number) => {
    if (!layout || i <= 0) return;
    const tx = box.width / 2 - layout.ex[i] * k.value;
    const ty = top + (box.height - top - bottom) * 0.3 - layout.ey[i] * k.value;
    ox.value = still ? tx : withSpring(tx, springs.smooth);
    oy.value = still ? ty : withSpring(ty, springs.smooth);
  };
  const onTap = (i: number) => {
    if (i <= 0) {
      setFocus(-1);
      setPath(null);
      return;
    }
    Haptics.selectionAsync();
    setFocus(i);
    setPath(null);
    center(i);
  };
  const onHold = (i: number) => {
    if (!data || i <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setFocus(i);
    setPath({ target: i, nodes: introPath(data, i) });
    center(i);
  };

  const hit = (x: number, y: number) => {
    "worklet";
    const s = sceneSV.value;
    if (!s) return -1;
    const L = s.layout;
    const kk = k.value;
    const scale = Math.sqrt(kk);
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < L.n; i++) {
      const d = Math.hypot(ox.value + L.ex[i] * kk - x, oy.value + L.ey[i] * kk - y);
      if (d < Math.max(L.r[i] * scale + 6, 18) && d < bestD) {
        best = i;
        bestD = d;
      }
    }
    return best;
  };

  const pan = usePanGesture({
    onUpdate: (e) => {
      ox.value += e.changeX;
      oy.value += e.changeY;
    },
  });
  const pinch = usePinchGesture({
    onUpdate: (e) => {
      const next = Math.min(4, Math.max(kMin.value, k.value * e.scaleChange));
      const f = next / k.value;
      ox.value = e.focalX - (e.focalX - ox.value) * f;
      oy.value = e.focalY - (e.focalY - oy.value) * f;
      k.value = next;
    },
  });
  const tap = useTapGesture({
    onActivate: (e) => {
      scheduleOnRN(onTap, hit(e.x, e.y));
    },
  });
  const hold = useLongPressGesture({
    minDuration: 380,
    onActivate: (e) => {
      scheduleOnRN(onHold, hit(e.x, e.y));
    },
  });
  const gesture = useCompetingGestures(useSimultaneousGestures(pan, pinch), hold, tap);

  const picture = useDerivedValue(() => {
    const s = sceneSV.value;
    const M = marks.value;
    const kk = k.value;
    const X = ox.value;
    const Y = oy.value;
    const t = progress.value;
    const w = W.value;
    const h = H.value;
    return createPicture(
      (canvas) => {
        if (!s || !w) return;
        const L = s.layout;
        const paint = Skia.Paint();
        paint.setAntiAlias(true);
        const stroke = Skia.Paint();
        stroke.setAntiAlias(true);
        stroke.setStyle(PaintStyle.Stroke);
        const px: number[] = new Array(L.n);
        const py: number[] = new Array(L.n);
        for (let i = 0; i < L.n; i++) {
          px[i] = X + (L.sx[i] + (L.ex[i] - L.sx[i]) * t) * kk;
          py[i] = Y + (L.sy[i] + (L.ey[i] - L.sy[i]) * t) * kk;
        }
        const on = (i: number, pad: number) => px[i] > -pad && px[i] < w + pad && py[i] > -pad && py[i] < h + pad;

        stroke.setPathEffect(Skia.PathEffect.MakeDash([3, 6], 0));
        stroke.setStrokeWidth(1);
        stroke.setColor(Skia.Color(INK));
        for (let j = 0; j < L.rings.length; j++) {
          const R = L.rings[j] * kk * Math.min(1, 0.3 + 0.7 * t);
          stroke.setAlphaf(0.09);
          canvas.drawCircle(X, Y, R, stroke);
          if (R > 50) {
            paint.setColor(Skia.Color(INK));
            paint.setAlphaf(0.34 * Math.min(1, t));
            canvas.drawText(s.ringText[j], X - s.ringW[j] / 2, Y - R + 13, paint, monoFont);
          }
        }
        stroke.setPathEffect(null);

        const thr = kk < 0.35 ? 0.6 : kk < 0.6 ? 0.45 : kk < 1 ? 0.3 : kk < 1.6 ? 0.12 : 0;
        const widthScale = Math.min(1.5, Math.max(0.6, Math.sqrt(kk)));
        const ea = L.edges.a;
        const eb = L.edges.b;
        for (let e = 0; e < ea.length; e++) {
          const a = ea[e];
          const b = eb[e];
          const weight = L.edges.w[e];
          const lit = M.focus > 0 && (a === M.focus || b === M.focus);
          if (!lit && weight < thr) continue;
          if (!on(a, 0) && !on(b, 0)) continue;
          const you = L.edges.you[e] === 1;
          if (lit) {
            stroke.setColor(Skia.Color(ACCENT));
            stroke.setAlphaf(0.75);
            stroke.setStrokeWidth((1.4 + 1.6 * weight) * widthScale);
          } else {
            stroke.setColor(Skia.Color(INK));
            stroke.setAlphaf((you ? 0.04 + 0.16 * weight : 0.1 + 0.36 * weight) * (M.active ? 0.35 : 1) * Math.min(1, t));
            stroke.setStrokeWidth((0.5 + 1.6 * weight) * widthScale);
          }
          canvas.drawLine(px[a], py[a], px[b], py[b], stroke);
        }
        if (M.path.length > 1) {
          stroke.setColor(Skia.Color(ACCENT));
          stroke.setAlphaf(0.95);
          stroke.setStrokeWidth(3);
          for (let j = 1; j < M.path.length; j++) canvas.drawLine(px[M.path[j - 1]], py[M.path[j - 1]], px[M.path[j]], py[M.path[j]], stroke);
        }

        const scale = Math.sqrt(kk);
        for (let p = L.n - 1; p >= 0; p--) {
          const i = L.priority[p];
          const rr = Math.max(i === 0 ? 9 : 2.5, L.r[i] * scale);
          if (!on(i, rr + 4)) continue;
          const dim = M.active && M.lit[i] !== 1 && i !== 0 ? 0.22 : 1;
          paint.setColor(Skia.Color(s.fill[i]));
          paint.setAlphaf(dim);
          canvas.drawCircle(px[i], py[i], rr, paint);
          stroke.setColor(Skia.Color(i === 0 ? INK : WHITE));
          stroke.setAlphaf(0.9 * dim);
          stroke.setStrokeWidth(i === 0 ? 0 : 1.4);
          if (i !== 0) canvas.drawCircle(px[i], py[i], rr, stroke);
          if (M.match[i] === 1) {
            stroke.setColor(Skia.Color(ACCENT));
            stroke.setAlphaf(1);
            stroke.setStrokeWidth(2);
            canvas.drawCircle(px[i], py[i], rr + 3, stroke);
          }
          if (i === M.focus) {
            stroke.setColor(Skia.Color(INK));
            stroke.setAlphaf(1);
            stroke.setStrokeWidth(2);
            canvas.drawCircle(px[i], py[i], rr + 4, stroke);
          }
          if (rr >= 8) {
            const f = rr < 11 ? 0 : rr < 15 ? 1 : 2;
            paint.setColor(Skia.Color(i === 0 ? WHITE : INK));
            paint.setAlphaf((i === 0 ? 1 : 0.72) * dim);
            canvas.drawText(s.initials[i], px[i] - s.initialW[f][i] / 2, py[i] + INITIAL_SIZES[f] * 0.36, paint, initialFonts[f]);
          }
        }

        const budget = kk < 0.4 ? 8 : kk < 0.7 ? 16 : kk < 1.1 ? 32 : kk < 1.8 ? 80 : 400;
        const full = kk >= 1.1;
        let shown = 0;
        stroke.setColor(Skia.Color(WHITE));
        stroke.setAlphaf(0.85);
        stroke.setStrokeWidth(3);
        paint.setColor(Skia.Color(INK));
        for (let p = 0; p < L.n; p++) {
          const i = L.priority[p];
          const lit = M.active && M.lit[i] === 1;
          if (!on(i, 0)) continue;
          if (!lit && (shown >= budget || M.active)) continue;
          if (!lit) shown++;
          const text = full || lit ? s.name[i] : s.first[i];
          const tw = full || lit ? s.nameW[i] : s.firstW[i];
          const rr = Math.max(i === 0 ? 9 : 2.5, L.r[i] * scale);
          const ty = py[i] + rr + 13;
          canvas.drawText(text, px[i] - tw / 2, ty, stroke, nameFont);
          paint.setAlphaf((lit ? 0.92 : 0.7) * Math.min(1, t));
          canvas.drawText(text, px[i] - tw / 2, ty, paint, nameFont);
        }

        if (t > 0.5) {
          for (let c = 0; c < L.halos.length; c++) {
            const halo = L.halos[c];
            const R = halo.r * kk;
            if (R < 34) continue;
            const hx = X + halo.x * kk;
            const hy = Y + halo.y * kk - R - 4;
            paint.setColor(Skia.Color(INK));
            paint.setAlphaf((M.cluster >= 0 && M.cluster !== c ? 0.2 : 0.55) * Math.min(1, (t - 0.5) * 2));
            canvas.drawText(s.haloText[c], hx - s.haloW[c] / 2, hy, paint, monoFont);
          }
        }
      },
      { width: w, height: h },
    );
  });

  const overlay = useAnimatedStyle(() => ({ transform: [{ translateX: ox.value }, { translateY: oy.value }, { scale: k.value }] }));
  const onLayout = (e: LayoutChangeEvent) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });
  const focused = data && focus > 0 ? data.nodes[focus] : null;

  return (
    <View testID="people-graph" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill}>
          {box.width > 0 && (
            <Canvas style={StyleSheet.absoluteFill}>
              {layout?.halos.map((h) => (
                <ClusterHalo key={h.index} halo={h} ox={ox} oy={oy} k={k} progress={progress} marks={marks} clock={clock} still={still} />
              ))}
              <Picture picture={picture} />
            </Canvas>
          )}
          {data && layout && (
            <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0, width: 0, height: 0 }, overlay]}>
              {data.nodes.map((n, i) =>
                i === 0 ? null : (
                  <View
                    key={n.id}
                    testID={"graph-node-" + n.key}
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={n.name + ", " + TIER_LABEL[n.tier]}
                    onAccessibilityTap={() => onTap(i)}
                    style={{ position: "absolute", left: layout.ex[i] - layout.r[i], top: layout.ey[i] - layout.r[i], width: layout.r[i] * 2, height: layout.r[i] * 2 }}
                  />
                ),
              )}
            </Animated.View>
          )}
        </View>
      </GestureDetector>
      {data === undefined && <Text style={[type.quiet, { position: "absolute", top: top + 40, alignSelf: "center" }]}>Drawing your people</Text>}
      {data && data.nodes.length <= 1 && <Text style={[type.quiet, { position: "absolute", top: top + 40, alignSelf: "center" }]}>Add people to see your graph</Text>}
      {data && focused && (
        <GraphFocusCard
          key={focused.id}
          data={data}
          index={focus}
          path={path?.target === focus ? path.nodes : undefined}
          bottom={bottom}
          onClose={() => onTap(-1)}
        />
      )}
    </View>
  );
}

function ClusterHalo({
  halo,
  ox,
  oy,
  k,
  progress,
  marks,
  clock,
  still,
}: {
  halo: Layout["halos"][number];
  ox: SharedValue<number>;
  oy: SharedValue<number>;
  k: SharedValue<number>;
  progress: SharedValue<number>;
  marks: SharedValue<Marks>;
  clock: SharedValue<number>;
  still: boolean;
}) {
  const [a, b] = HALO_COLORS[halo.index % HALO_COLORS.length];
  const colorA = hexToRgb(a);
  const colorB = hexToRgb(b);
  const cx = useDerivedValue(() => ox.value + halo.x * k.value);
  const cy = useDerivedValue(() => oy.value + halo.y * k.value);
  const r = useDerivedValue(() => halo.r * k.value * 1.3);
  const uniforms = useDerivedValue(() => {
    const m = marks.value;
    const dim = m.cluster >= 0 && m.cluster !== halo.index ? 0.3 : m.active && m.cluster < 0 ? 0.5 : 1;
    return {
      center: [cx.value, cy.value],
      radius: halo.r * k.value,
      colorA,
      colorB,
      time: still ? halo.index * 1.7 : clock.value / 1000 + halo.index * 1.7,
      strength: Math.min(1, progress.value) * dim,
    };
  });
  return (
    <Circle cx={cx} cy={cy} r={r}>
      <Shader source={glow} uniforms={uniforms} />
    </Circle>
  );
}
