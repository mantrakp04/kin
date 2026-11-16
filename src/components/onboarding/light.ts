export const light = {
  text: "#FFFFFF",
  secondary: "rgba(255,255,255,0.74)",
  quiet: "rgba(255,255,255,0.52)",
  faint: "rgba(255,255,255,0.22)",
  glow: "0 0 18px 6px rgba(255,255,255,0.65), 0 0 60px 26px rgba(255,255,255,0.28), 0 0 120px 48px rgba(255,180,220,0.18)",
} as const;

export const SOURCES = [
  { key: "contacts", label: "Contacts", status: "Reading 412 contacts on this phone", color: "#A7B0FF", hues: { tl: "#090092", mid: "#3413AF" } },
  { key: "linkedin", label: "LinkedIn", status: "Matching public work profiles", color: "#3D8BFF", hues: { tl: "#04157A", mid: "#1D3FB8" } },
  { key: "x", label: "X", status: "Checking public posts", color: "#E4E6F2", hues: { tl: "#0B0A3A", mid: "#2B2A74" } },
  { key: "instagram", label: "Instagram", status: "Looking at public Instagram profiles", color: "#FF5FA2", hues: { tl: "#3A007A", mid: "#8E1FA8" } },
  { key: "web", label: "Public web", status: "Reading personal sites and news", color: "#9A7BFF", hues: { tl: "#160072", mid: "#4A22B8" } },
] as const;
