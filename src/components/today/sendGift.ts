import { useConvex } from "convex/react";
import * as WebBrowser from "expo-web-browser";
import { followUp, useInstruct } from "../../lib/agent";
import { useSession } from "../../lib/session";

export function useSendGift() {
  const instruct = useInstruct();
  const convex = useConvex();
  const { userKey } = useSession();
  return async (giftId: string, productId: string) => {
    const { messageId } = await instruct({ action: { type: "send_gift", payload: { giftId, productId } } });
    const result = await followUp(convex, userKey, messageId);
    const url = result?.actions.find((a) => a.type === "open_url")?.payload?.url;
    if (typeof url === "string") await WebBrowser.openBrowserAsync(url);
    else if (result?.error) throw new Error(result.error);
  };
}
