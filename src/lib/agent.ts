import { useMutation } from "convex/react";
import type { ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useSession } from "./session";

export type AgentAction = { type: string; payload: any };
type FollowUp = { actions: AgentAction[]; error: string | null; done: boolean };

export function useInstruct() {
  const instruct = useMutation(api.agent.instruct);
  const { userKey } = useSession();
  return (args: { text?: string; action?: AgentAction }) => instruct({ userKey, ...args });
}

export function followUp(convex: ConvexReactClient, userKey: string, messageId: Id<"agentMessages">, timeoutMs = 45000): Promise<FollowUp | null> {
  return new Promise((resolve) => {
    const watch = convex.watchQuery(api.agent.followUp, { userKey, messageId });
    let stop = () => {};
    const read = () => {
      try {
        return watch.localQueryResult() ?? null;
      } catch {
        return null;
      }
    };
    const finish = (value: FollowUp | null) => {
      clearTimeout(timer);
      stop();
      resolve(value);
    };
    const timer = setTimeout(() => finish(read()), timeoutMs);
    const check = () => {
      const r = read();
      if (r && (r.done || r.actions.some((a) => a.type === "open_url"))) finish(r);
    };
    stop = watch.onUpdate(check);
    check();
  });
}
