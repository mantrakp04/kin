export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (/^file:\/\//i.test(path) || /\.(zip|txt|db)$/i.test(path.split("?")[0])) return `/import?file=${encodeURIComponent(path)}`;
    return path;
  } catch {
    return "/";
  }
}
