import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const KEIKI_BASE_URL = process.env.KEIKI_BASE_URL ?? "https://onkeiki.com";
const apiKey = process.env.KEIKI_API_KEY;
const site = process.env.CONVEX_SITE_URL?.replace(/\/$/, "");
const rotate = process.argv.includes("--rotate-secret");
const convexArgs = process.argv.includes("--") ? process.argv.slice(process.argv.indexOf("--") + 1) : [];

if (!apiKey || !site?.startsWith("https://")) {
  console.error("Set KEIKI_API_KEY (org-wide, deployments:write) and CONVEX_SITE_URL (public https://<name>.convex.site).");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
const systemPrompt = readFileSync(new URL("../../prompts/kin-agent.md", import.meta.url), "utf8");

const res = await fetch(`${KEIKI_BASE_URL}/api/v1/developer/deployments`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    external_ref: "kin",
    agent: {
      name: "Kin",
      system_prompt: systemPrompt,
      harness: "external",
      harness_config: { mode: "push", dispatchUrl: `${site}/keiki/turn`, timeoutMs: 120000 },
    },
  }),
});
const result = (await res.json().catch(() => null)) as { deployment?: { agent?: { id?: string; harness?: string; dispatch?: unknown } } } | null;
if (!res.ok) {
  console.error(`Keiki deploy failed: ${res.status}`, JSON.stringify(result, null, 2));
  process.exit(1);
}
const agent = result?.deployment?.agent;
console.log(JSON.stringify({ agentId: agent?.id, harness: agent?.harness, dispatch: agent?.dispatch }, null, 2));

if (!agent?.id) process.exit(0);
if (!rotate) {
  console.log("Harness signing secret unchanged. Pass --rotate-secret to mint one and store it as KEIKI_HARNESS_SECRET in Convex.");
  process.exit(0);
}

const secretRes = await fetch(`${KEIKI_BASE_URL}/api/v1/developer/agents/${agent.id}/harness/signing-secret`, { method: "POST", headers });
const secretBody = (await secretRes.json().catch(() => null)) as Record<string, unknown> | null;
const secret = [secretBody?.secret, secretBody?.signingSecret, secretBody?.signing_secret].find((s): s is string => typeof s === "string" && s.length > 0);
if (!secretRes.ok || !secret) {
  console.error(`Could not mint the harness signing secret: ${secretRes.status}. Keys returned: ${Object.keys(secretBody ?? {}).join(", ")}`);
  process.exit(1);
}
execFileSync("npx", ["convex", "env", "set", ...convexArgs, "KEIKI_HARNESS_SECRET", secret], { stdio: ["ignore", "ignore", "inherit"] });
console.log("Stored the new harness signing secret as KEIKI_HARNESS_SECRET in Convex (not printed).");
