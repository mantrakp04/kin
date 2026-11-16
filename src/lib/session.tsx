import { createContext, useContext, useState, type ReactNode } from "react";

type Session = { userKey: string; setUserKey: (k: string) => void; onboarded: boolean; setOnboarded: (v: boolean) => void };

const Ctx = createContext<Session>({ userKey: "alex", setUserKey: () => {}, onboarded: false, setOnboarded: () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [userKey, setUserKey] = useState("alex");
  const [onboarded, setOnboarded] = useState(false);
  return <Ctx.Provider value={{ userKey, setUserKey, onboarded, setOnboarded }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
