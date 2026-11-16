import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Backdrop } from "./Backdrop";
import { backdrops, space, type BackdropColors } from "../theme/tokens";
import { useDockHeight } from "./Dock";

export function Screen({ children, colors = backdrops.app, scroll = true, dock = true }: { children: ReactNode; colors?: BackdropColors; scroll?: boolean; dock?: boolean }) {
  const insets = useSafeAreaInsets();
  const dockH = useDockHeight();
  const pad = { paddingTop: insets.top + 12, paddingHorizontal: space.page, paddingBottom: dock ? dockH + 12 : insets.bottom + 24 };
  return (
    <View style={{ flex: 1 }}>
      <Backdrop colors={colors} />
      {scroll ? (
        <ScrollView contentContainerStyle={pad} showsVerticalScrollIndicator={false} keyboardDismissMode="on-drag">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad]}>{children}</View>
      )}
    </View>
  );
}
