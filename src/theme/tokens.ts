export const ink = "#1B1A22";

export const color = {
  ink,
  inkSecondary: "rgba(27,26,34,0.66)",
  inkQuiet: "rgba(27,26,34,0.46)",
  hairline: "rgba(27,26,34,0.08)",
  edge: "rgba(27,26,34,0.14)",
  cardEdge: "rgba(27,26,34,0.07)",
  card: "rgba(255,255,255,0.62)",
  cardSolid: "#FCFCFC",
  accent: "#3139FB",
  success: "#12884A",
  ai: "#8B5CF6",
  aiSubtle: "rgba(139,92,246,0.10)",
  white: "#FFFFFF",
  sheetDark: "#0E0D12",
  gray: ["#fcfcfc", "#f9f9f9", "#f0f0f0", "#e8e8e8", "#e0e0e0", "#d9d9d9", "#cecece", "#bbbbbb", "#8d8d8d", "#838383", "#646464", "#202020"],
} as const;

export const backdrops = {
  app: { tl: "#E4E2F7", tr: "#F8EDF5", bl: "#FDE6E9", br: "#EAE9F9", mid: "#EFEEFC" },
  onboarding: { tl: "#090092", tr: "#3413AF", bl: "#6E38B1", br: "#FF5686", mid: "#3413AF" },
  share: { tl: "#0E0D12", tr: "#15131D", bl: "#121019", br: "#1B1626", mid: "#13111A" },
} as const;

export type BackdropColors = { tl: string; tr: string; bl: string; br: string; mid: string };

export function hsl(h: number, s: number, l: number) {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function personBackdrop(hue: number): BackdropColors {
  return {
    tl: hsl(hue, 0.7, 0.9),
    tr: hsl((hue + 24) % 360, 0.65, 0.92),
    bl: hsl(hue, 0.3, 0.98),
    br: hsl((hue + 12) % 360, 0.25, 0.985),
    mid: hsl(hue, 0.55, 0.94),
  };
}

export function avatarColors(hue: number): [string, string] {
  return [hsl(hue, 0.75, 0.86), hsl((hue + 30) % 360, 0.7, 0.74)];
}

export const radius = { card: 24, field: 16, sheet: 32, chip: 9, capsule: 999, row: 14 } as const;

export const shadow = {
  xs: "0 1px 1px 0 rgba(0,0,0,0.1)",
  sm: "0 1px 2px 0 rgba(0,0,0,0.04)",
  lg: "0 1px 1px 0 rgba(0,0,0,0.02), 0 4px 8px 0 rgba(0,0,0,0.04)",
  xl: "0 1px 1px 0 rgba(0,0,0,0.02), 0 4px 8px -4px rgba(0,0,0,0.04), 0 16px 24px -8px rgba(0,0,0,0.06)",
  card: "0 12px 26px -16px rgba(27,22,64,0.3), 0 1px 1px 0 rgba(0,0,0,0.02)",
  dock: "0 1px 1px 0 rgba(0,0,0,0.02), 0 8px 16px -4px rgba(0,0,0,0.06), 0 24px 32px -8px rgba(27,22,64,0.18)",
  inset: "inset 0 2px 1px 0 rgba(0,0,0,0.1)",
  insetStrong: "inset 0 2px 1px 0 rgba(0,0,0,0.5)",
} as const;

export const font = {
  serif: "ui-serif",
  mono: "ui-monospace",
} as const;

export const type = {
  title: { fontFamily: font.serif, fontSize: 42, letterSpacing: -0.8, color: ink, fontWeight: "400" as const },
  name: { fontFamily: font.serif, fontSize: 40, letterSpacing: -0.7, color: ink, fontWeight: "400" as const },
  label: { fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.4, textTransform: "uppercase" as const, color: color.inkQuiet },
  body: { fontSize: 16, lineHeight: 23, color: ink },
  bodySmall: { fontSize: 15, lineHeight: 21, color: ink },
  rowName: { fontSize: 15.5, fontWeight: "600" as const, color: ink },
  quiet: { fontSize: 13, color: color.inkQuiet },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, page: 20 } as const;
