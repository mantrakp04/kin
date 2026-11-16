import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, radius, shadow } from "../theme/tokens";
import { springs } from "../theme/motion";

const Ctx = createContext<(text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const show = useCallback((t: string) => {
    setText(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(null), 2600);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <View pointerEvents="none" style={{ position: "absolute", top: insets.top + 6, left: 0, right: 0, alignItems: "center" }}>
        {text && (
          <Animated.View
            key={text}
            entering={FadeInUp.springify().stiffness(springs.bouncy.stiffness).damping(springs.bouncy.damping)}
            exiting={FadeOutUp.duration(200)}
            style={{ backgroundColor: color.ink, paddingHorizontal: 18, height: 40, borderRadius: radius.capsule, justifyContent: "center", boxShadow: shadow.dock }}
          >
            <Text testID="toast" style={{ color: color.white, fontSize: 14.5, fontWeight: "600" }}>{text}</Text>
          </Animated.View>
        )}
      </View>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
