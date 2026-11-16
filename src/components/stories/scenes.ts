import type { Scene } from "../../../convex/storyStyles";

const COMMON = [
  "uniform float2 res;",
  "uniform float time;",
  "uniform float bpm;",
  "uniform float phase;",
  "uniform float dim;",
  "uniform float3 c0;",
  "uniform float3 c1;",
  "uniform float3 c2;",
  "float hash(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }",
  "float pulse() { return exp(-fract(time * bpm / 60.0) * 5.0); }",
  "float sdBox(float2 p, float2 b, float r) { float2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }",
  "",
].join("\n");

const parkour = `
half4 main(float2 xy) {
  float2 uv = xy / res;
  float hz = 0.4;
  if (uv.y < hz) {
    float3 sky = mix(c0 * 0.75, c0 * 1.1, uv.y / hz);
    float2 g = floor(float2(uv.x * 10.0 + time * 0.25, uv.y * 26.0));
    float cloud = step(0.86, hash(float2(g.x, floor(g.y / 2.0)))) * step(uv.y, hz * 0.55);
    return half4(half3(mix(sky, float3(1.0), cloud * 0.85)), 1.0);
  }
  float d = max(uv.y - hz, 0.001);
  float z = 0.32 / d;
  float x = (uv.x - 0.5) * z * 2.4;
  float zz = z + time * 3.2;
  float2 cell = floor(float2(x, zz));
  float lane = floor(sin(cell.y * 0.55) * 1.6);
  float solid = step(abs(cell.x - lane), 1.0) * step(0.22, hash(float2(cell.y, 5.0)));
  float2 f = fract(float2(x, zz));
  float edge = step(0.05, f.x) * step(0.05, f.y) * step(f.x, 0.95) * step(f.y, 0.95);
  float top = step(0.5, hash(cell + 3.0));
  float3 block = mix(c2, c1, 0.6 + 0.4 * top) * (0.8 + 0.25 * hash(cell)) * (0.7 + 0.3 * edge);
  float3 col = mix(c0 * 0.18, block, solid);
  col = mix(col, c0 * 0.85, clamp(z / 16.0, 0.0, 1.0));
  return half4(half3(col), 1.0);
}
`;

const rapStage = `
half4 main(float2 xy) {
  float2 uv = xy / res;
  float2 p = (xy - res * float2(0.5, 0.42)) / res.x;
  float r = length(p);
  float a = atan(p.y, p.x);
  float pl = pulse();
  float swirl = sin(a * 3.0 + r * 28.0 - time * 5.0) * 0.5 + 0.5;
  float portal = smoothstep(0.42, 0.18, r) * (0.35 + 0.65 * swirl);
  float3 col = c0 + c1 * portal * (0.7 + 0.5 * pl);
  col += c2 * smoothstep(0.03, 0.0, abs(r - 0.4)) * (0.6 + pl);
  float beam = smoothstep(0.08, 0.0, abs(uv.x - 0.5 - 0.3 * sin(time * 0.9) * (1.0 - uv.y))) * (1.0 - uv.y) * 0.25;
  col += c2 * beam;
  return half4(half3(col + hash(xy + time) * 0.05), 1.0);
}
`;

const rave = `
half4 main(float2 xy) {
  float2 uv = xy / res;
  float pl = pulse();
  float3 col = c0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float ang = sin(time * (0.5 + fi * 0.21) + fi * 1.7) * 0.6;
    float2 d = uv - float2(0.2 + fi * 0.2, 0.0);
    float along = d.x * sin(ang) + d.y * cos(ang);
    float across = d.x * cos(ang) - d.y * sin(ang);
    col += c1 * smoothstep(0.03 + along * 0.08, 0.0, abs(across)) * 0.35 * step(0.0, along);
  }
  col += c1 * step(0.82, pl) * 0.35;
  float crowdY = 0.78 + 0.03 * sin(uv.x * 40.0 + floor(time * bpm / 60.0) * 2.0) + 0.02 * sin(uv.x * 13.0 - time * 3.0);
  col = mix(col, c0 * 0.5, step(crowdY, uv.y));
  float eyeX = fract(floor(time * bpm / 240.0) * 0.37 + 0.2);
  float2 e = (xy - res * float2(eyeX, 0.775)) / res.x;
  float eye = smoothstep(0.012, 0.0, length(e - float2(0.012, 0.0))) + smoothstep(0.012, 0.0, length(e + float2(0.012, 0.0)));
  col += c2 * eye * pl * 2.0;
  return half4(half3(col), 1.0);
}
`;

const disco = `
half4 main(float2 xy) {
  float2 uv = xy / res;
  float hz = 0.62;
  float pl = pulse();
  float3 col = c0;
  float2 b = (xy - res * float2(0.5, 0.13)) / res.x;
  float2 tile = floor(b * 60.0 + float2(time * 3.0, 0.0));
  col = mix(col, float3(0.75) + 0.25 * hash(tile) + c2 * 0.15 * pl, smoothstep(0.085, 0.08, length(b)));
  col = mix(col, float3(0.4), smoothstep(0.004, 0.0, abs(b.x)) * step(b.y, -0.08));
  float2 sg = floor(uv * float2(18.0, 30.0));
  col += float3(1.0) * step(0.985, hash(sg + floor(time * 4.0))) * 0.6 * (1.0 - step(hz, uv.y));
  if (uv.y > hz) {
    float d = uv.y - hz + 0.001;
    float z = 0.18 / d;
    float x = (uv.x - 0.5) * z * 3.0;
    float2 cell = floor(float2(x, z));
    float h = hash(cell + floor(time * bpm / 60.0));
    float3 tileCol = h < 0.33 ? c1 : (h < 0.66 ? c2 : float3(1.0, 0.85, 0.3));
    float2 f = fract(float2(x, z));
    col = mix(float3(0.1), tileCol * (0.65 + 0.5 * pl), step(0.06, f.x) * step(0.06, f.y));
  }
  return half4(half3(col), 1.0);
}
`;

const dogs = `
half4 main(float2 xy) {
  float2 uv = xy / res;
  float pl = pulse();
  float bt = time * bpm / 60.0;
  float3 col = mix(c0, c1 * 0.9, uv.y);
  col = mix(col, c2 * 0.8, step(0.8, uv.y));
  float2 p = (xy - res * float2(0.5, 0.62)) / res.x;
  float sway = sin(bt * 3.14159) * 0.04;
  float woman = min(length(p - float2(sway, -0.3)) - 0.06, sdBox(p - float2(sway * 0.6, -0.08), float2(0.07, 0.16), 0.05));
  woman = min(woman, sdBox(p - float2(sway * 1.4, -0.2), float2(0.16 + 0.04 * sin(bt * 6.283), 0.015), 0.015));
  float hop1 = abs(sin(bt * 3.14159)) * 0.06;
  float hop2 = abs(cos(bt * 3.14159)) * 0.06;
  float dog1 = min(sdBox(p - float2(-0.28, 0.22 - hop1), float2(0.09, 0.045), 0.04), length(p - float2(-0.2, 0.15 - hop1)) - 0.045);
  float dog2 = min(sdBox(p - float2(0.28, 0.22 - hop2), float2(0.08, 0.04), 0.04), length(p - float2(0.2, 0.15 - hop2)) - 0.04);
  col = mix(col, float3(0.16, 0.1, 0.08), smoothstep(0.004, 0.0, woman));
  col = mix(col, float3(0.95, 0.85, 0.65), smoothstep(0.004, 0.0, dog1));
  col = mix(col, float3(0.35, 0.22, 0.12), smoothstep(0.004, 0.0, dog2));
  return half4(half3(col * (0.9 + 0.1 * pl)), 1.0);
}
`;

const cow = `
half4 main(float2 xy) {
  float2 uv = xy / res;
  float3 col = mix(c0, float3(1.0), uv.y * 0.8);
  if (uv.y > 0.68) col = float3(0.5 + 0.08 * hash(floor(xy / 6.0)));
  float2 p = (xy - res * float2(0.5, 0.62)) / res.x;
  float spin = time * (phase > 0.5 ? 9.0 : 1.5);
  float sx = abs(cos(spin)) * 0.85 + 0.15;
  float2 q = float2(p.x / sx, p.y);
  float body = sdBox(q, float2(0.17, 0.08), 0.07);
  float head = length(q - float2(0.21 * sign(cos(spin)), -0.06)) - 0.065;
  float spots = step(0.55, hash(floor(q * 18.0 + 3.0))) * step(body, 0.0);
  col = mix(col, mix(float3(0.97), float3(0.08), spots), smoothstep(0.004, 0.0, min(body, head)));
  float2 g = (xy - res * float2(0.5, 0.71)) / res.x;
  float rr = length(g * float2(1.0, 3.0));
  float rings = smoothstep(0.012, 0.0, abs(rr - 0.22 - 0.03 * sin(time * 6.0))) + smoothstep(0.012, 0.0, abs(rr - 0.3 - 0.03 * cos(time * 6.0)));
  col += mix(c1, float3(0.3, 0.9, 1.0), 0.5) * rings * 0.9;
  float shock = fract(time * 0.5);
  col += c2 * smoothstep(0.02, 0.0, abs(length(p) - shock * 0.9)) * (1.0 - shock) * phase;
  col += c2 * step(0.992, hash(floor(uv * float2(30.0, 50.0)) + floor(time * 8.0))) * phase;
  return half4(half3(col), 1.0);
}
`;

const water = `
half4 main(float2 xy) {
  float bob = sin(time * 1.7) * 6.0;
  float2 uv = (xy + float2(sin(time * 0.9) * 4.0, bob)) / res;
  float3 col = mix(float3(0.82, 0.93, 1.0), c0, uv.y * 2.0);
  float shore = 0.34 + 0.01 * sin(uv.x * 9.0);
  if (uv.y > shore) col = float3(0.35, 0.5, 0.3);
  if (uv.y > shore + 0.05) {
    float w = sin(uv.x * 40.0 + time * 2.0 + uv.y * 30.0) * 0.5 + 0.5;
    col = mix(c1 * 0.85, c0, w * 0.35 + (uv.y - shore) * 0.6);
  }
  float2 p = (xy - res * float2(0.5, 0.66) + float2(0.0, bob)) / res.x;
  float capy = min(min(sdBox(p, float2(0.2, 0.15), 0.14), sdBox(p - float2(0.0, 0.08), float2(0.13, 0.07), 0.07)), min(length(p - float2(-0.17, -0.15)) - 0.035, length(p - float2(0.17, -0.15)) - 0.035));
  col = mix(col, float3(0.62, 0.43, 0.27) * (0.9 + 0.1 * hash(floor(xy / 3.0))), smoothstep(0.004, 0.0, capy) * step(p.y, 0.17));
  col = mix(col, float3(0.05), smoothstep(0.004, 0.0, min(length(p - float2(-0.09, -0.04)), length(p - float2(0.09, -0.04))) - 0.018));
  col = mix(col, float3(0.15, 0.1, 0.08), smoothstep(0.004, 0.0, min(length(p - float2(-0.04, 0.07)), length(p - float2(0.04, 0.07))) - 0.012));
  return half4(half3(col), 1.0);
}
`;

const meme = `
half4 main(float2 xy) {
  float2 uv = xy / res;
  float3 col = mix(mix(c0, c1, uv.x), c2, uv.y * 0.7);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float2 c = res * float2(fract(0.17 + fi * 0.29 + sin(time * 0.2 + fi) * 0.05), fract(0.1 + fi * 0.37 + time * 0.02 * (1.0 + fi * 0.3)));
    float2 p = (xy - c) / res.x;
    float ang = time * (0.3 + fi * 0.1);
    p = float2(p.x * cos(ang) - p.y * sin(ang), p.x * sin(ang) + p.y * cos(ang));
    float s = fi < 3.0 ? sdBox(p, float2(0.05, 0.05), 0.02) : length(p) - 0.055;
    float3 tint = fi < 2.0 ? c2 : (fi < 4.0 ? c1 : c0);
    col = mix(col, tint * 0.8 + 0.12, smoothstep(0.004, 0.0, s));
    float eyes = min(length(p - float2(-0.018, -0.01)), length(p - float2(0.018, -0.01))) - 0.006;
    col = mix(col, float3(0.1), smoothstep(0.003, 0.0, eyes) * step(s, 0.0));
  }
  return half4(half3(col), 1.0);
}
`;

const room = `
half4 main(float2 xy) {
  float2 uv = (xy + float2(sin(time * 0.7) * 5.0, cos(time * 0.5) * 4.0)) / res;
  float3 col = mix(c0, c1, smoothstep(1.0, 0.0, length(uv - float2(0.7, 0.3))));
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float2 c = float2(fract(fi * 0.31 + 0.1), fract(fi * 0.53 + 0.2 + time * 0.01));
    float r = 0.06 + 0.05 * hash(float2(fi, 1.0));
    col += c2 * 0.12 * smoothstep(r, r * 0.6, length((uv - c) * float2(1.0, res.y / res.x)));
  }
  col *= smoothstep(1.1, 0.3, length(uv - 0.5)) * dim;
  col += (hash(xy + floor(time * 24.0)) - 0.5) * 0.04;
  return half4(half3(col), 1.0);
}
`;

const eyeRoll = `
half4 main(float2 xy) {
  float2 uv = xy / res;
  float3 col = mix(c0, c0 * 0.8, uv.y);
  float t = fract(time / 6.0) * 6.0;
  float zoom = t > 3.0 ? 1.0 + (t - 3.0) * 0.08 : 1.0;
  float2 p = (xy - res * float2(0.5, 0.58)) / res.x / zoom;
  float turn = (t > 1.0 && t < 3.0) ? 0.08 : 0.0;
  col = mix(col, float3(0.93, 0.76, 0.62), smoothstep(0.004, 0.0, length(p * float2(1.0, 0.85) - float2(turn * 0.5, 0.0)) - 0.3));
  float2 look = t < 1.0 ? float2(sin(t * 3.14159) * 0.02, -0.03 * sin(t * 3.14159)) : (t < 3.0 ? float2(0.03, 0.0) : float2(0.0));
  for (int i = 0; i < 2; i++) {
    float2 e = p - float2((float(i) * 2.0 - 1.0) * 0.1 + turn * 0.6, -0.06);
    float eye = length(e * float2(1.0, 1.3)) - 0.055;
    col = mix(col, float3(1.0), smoothstep(0.004, 0.0, eye));
    col = mix(col, float3(0.08), smoothstep(0.004, 0.0, length(e - look) - 0.022) * step(eye, 0.0));
  }
  col = mix(col, float3(0.4, 0.2, 0.2), smoothstep(0.004, 0.0, sdBox(p - float2(turn * 0.6, 0.14), float2(0.07, 0.008), 0.008)));
  return half4(half3(col * dim), 1.0);
}
`;

const photo = `
half4 main(float2 xy) {
  float2 uv = xy / res;
  float3 col = mix(c0, c2, smoothstep(0.0, 1.2, uv.y + 0.2 * sin(time * 0.3 + uv.x * 2.0)));
  col = mix(col, float3(1.0), smoothstep(0.5, 0.0, length(uv - float2(0.25, 0.15))) * 0.4);
  col += (hash(xy + floor(time * 24.0)) - 0.5) * 0.05;
  return half4(half3(col), 1.0);
}
`;

const launch = `
half4 main(float2 xy) {
  float2 uv = xy / res;
  float3 col = c0;
  float2 g = abs(fract(xy / 28.0) - 0.5);
  col += float3(1.0) * 0.035 * step(0.47, max(g.x, g.y));
  float2 gc = float2(0.5 + 0.25 * sin(time * 0.25), 0.35 + 0.1 * cos(time * 0.2));
  col += c2 * 0.45 * smoothstep(0.7, 0.0, length((uv - gc) * float2(1.0, res.y / res.x)));
  return half4(half3(col), 1.0);
}
`;

const laptop = `
half4 main(float2 xy) {
  float2 uv = xy / res;
  float grain = sin(uv.y * 120.0 + sin(uv.x * 8.0) * 3.0) * 0.5 + 0.5;
  float3 col = mix(float3(0.42, 0.28, 0.18), float3(0.55, 0.38, 0.24), grain * 0.5);
  col += float3(1.0, 0.95, 0.85) * smoothstep(0.9, 0.0, length(uv - float2(0.8, 0.0))) * 0.25;
  return half4(half3(col), 1.0);
}
`;

const BODIES: Record<Exclude<Scene, "brand">, string> = {
  parkour,
  "nether-run": parkour,
  "rap-stage": rapStage,
  rave,
  "disco-cat": disco,
  dogs,
  "cow-spin": cow,
  "water-selfie": water,
  "meme-world": meme,
  "dark-room": room,
  kitchen: room,
  laptop,
  "eye-roll": eyeRoll,
  photo,
  launch,
};

export const DIM: Partial<Record<Scene, number>> = { "dark-room": 0.55, kitchen: 0.72, "eye-roll": 0.62 };

export function sceneSource(scene: Exclude<Scene, "brand">) {
  return COMMON + BODIES[scene];
}
