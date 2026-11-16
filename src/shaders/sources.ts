export const backdropSource = `
uniform float2 size;
uniform float3 tl;
uniform float3 tr;
uniform float3 bl;
uniform float3 br;
uniform float3 mid;
uniform float time;
uniform float grain;

float3 oklabToSRGB(float3 lab) {
  float3 lms = float3(dot(lab, float3(1.0, 0.3963377774, 0.2158037573)),
                      dot(lab, float3(1.0, -0.1055613458, -0.0638541728)),
                      dot(lab, float3(1.0, -0.0894841775, -1.2914855480)));
  lms = lms * lms * lms;
  float3 lin = float3(dot(lms, float3(4.0767416621, -3.3077115913, 0.2309699292)),
                      dot(lms, float3(-1.2684380046, 2.6097574011, -0.3413193965)),
                      dot(lms, float3(-0.0041960863, -0.7034186147, 1.7076147010)));
  float3 a = abs(lin);
  float3 enc = sign(lin) * (1.055 * pow(a, float3(1.0 / 2.4)) - 0.055);
  return mix(enc, lin * 12.92, step(a, float3(0.0031308)));
}

float grainHash(float2 p) {
  float3 p3 = fract(float3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

half4 main(float2 xy) {
  float2 uv = xy / size;
  float wobble = sin(time * 0.15) * 0.06;
  float u = clamp(uv.x + wobble * (uv.y - 0.5), 0.0, 1.0);
  float v = clamp(uv.y - wobble * (uv.x - 0.5), 0.0, 1.0);
  float3 top = mix(tl, tr, u);
  float3 bottom = mix(bl, br, u);
  float3 lab = mix(top, bottom, smoothstep(0.0, 1.0, v));
  float2 c = float2(0.5 + 0.18 * sin(time * 0.11), 0.42 + 0.12 * cos(time * 0.09));
  float d = length((uv - c) * float2(1.0, size.y / size.x));
  lab = mix(mid, lab, smoothstep(0.0, 0.55, d));
  float3 rgb = oklabToSRGB(lab);
  float g = grainHash(floor(xy));
  rgb = rgb * (1.0 - grain * (1.0 - g));
  return half4(half3(clamp(rgb, 0.0, 1.0)), 1.0);
}
`;

export const haloSource = `
uniform float2 resolution;
uniform float3 colorA;
uniform float3 colorB;
uniform float time;
uniform float speed;
uniform float delay;
uniform float inset;
uniform float cornerRadius;
uniform float loop;

float3 haloHash33(float3 p) {
  float3 p3 = fract(p * float3(0.1031, 0.11369, 0.13787));
  p3 += dot(p3, p3.yxz + 19.19);
  return -1.0 + 2.0 * fract((p3.xxy + p3.yzz) * p3.zyx);
}

float haloNoise(float3 p) {
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
  float4 d = float4(dot(x, haloHash33(s)), dot(x1, haloHash33(s + i1)), dot(x2, haloHash33(s + i2)), dot(x3, haloHash33(s + 1.0)));
  return dot(float4(31.316), d * w);
}

half4 main(float2 xy) {
  float2 uv = xy / resolution;
  float aspect = resolution.x / resolution.y;
  float2 p = (uv - 0.5) * 2.0;
  p.x *= aspect;
  float inset2 = inset * 2.0;
  float hx = 1.0 - inset2 / resolution.x;
  float hy = 1.0 - inset2 / resolution.y;
  float2 halfSize = aspect > 1.0 ? float2(hx * aspect, hy) : float2(hx, hy / aspect);
  float r = cornerRadius / min(resolution.x - inset2, resolution.y - inset2);
  float dist = abs(length(max(abs(p) - halfSize + r, 0.0)) - r);
  float lt = loop > 0.5 ? mod(time, 3.2) : time;
  float t = speed * 0.8 * lt - delay;
  float sweep = (1.0 - pow(2.0, -10.0 * max(t, 0.0))) * 1.25;
  float2 n = p / halfSize;
  float angle = atan(n.y, n.x);
  if (angle < 0.0) angle += 6.28318548;
  float around = mod(1.25 - mod(angle, 6.28318548) * 0.159154937, 1.0);
  if (around > 0.5) around = 1.0 - around;
  around *= 2.0;
  float arc = smoothstep(0.0, 1.0, clamp((abs(around - sweep) - 0.22) * -4.5454545, 0.0, 1.0));
  float line = smoothstep(0.0, 1.0, clamp((dist - 0.025) * -40.0, 0.0, 1.0)) * arc;
  float nz = haloNoise(float3(p * 0.5, lt)) + 0.5;
  float glowWidth = mix(0.1, 0.2, nz);
  float shrink = (1.0 - clamp(t, 0.0, 1.0)) * 0.95;
  float g1 = shrink == 0.0 ? 0.0 : clamp((dist - shrink) / -shrink, 0.0, 1.0);
  float g2 = clamp((dist - glowWidth) / -glowWidth, 0.0, 1.0);
  float g = g1 * g2;
  float glow = g * g * 0.12 * arc * (3.0 - 2.0 * g1) * (3.0 - 2.0 * g2);
  float alpha = clamp(glow + line, 0.0, 1.0);
  float fade = 1.0 - clamp((t - 1.0) / 0.35, 0.0, 1.0);
  alpha *= fade;
  float3 rgb = clamp(mix(colorA, colorB, nz) + line * 0.4, 0.0, 1.0);
  return half4(half3(rgb * alpha), alpha);
}
`;
