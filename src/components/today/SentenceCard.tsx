import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Card } from "../ui";
import { color, font, space, type } from "../../theme/tokens";

export function SentenceCard({ children, note, actions, kin, testID }: { children: ReactNode; note?: string; actions?: ReactNode; kin?: boolean; testID?: string }) {
  return (
    <Card style={{ padding: space.lg, paddingTop: kin ? space.md : space.lg, gap: space.lg }}>
      <View testID={testID} style={{ gap: space.sm }}>
        {kin && <Text style={{ fontFamily: font.mono, fontSize: 9.5, letterSpacing: 1.6, fontWeight: "600", color: color.ai }}>KIN</Text>}
        <Text style={[type.body, { fontSize: 16.5, lineHeight: 27 }]}>{children}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Text style={[type.quiet, { flex: 1 }]} numberOfLines={1}>
          {note}
        </Text>
        {actions}
      </View>
    </Card>
  );
}
