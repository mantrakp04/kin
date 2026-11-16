import { Text, View } from "react-native";
import { Chip } from "../ui";
import { color } from "../../theme/tokens";

export function ProductChip({ name }: { name: string }) {
  return (
    <Chip style={{ transform: [{ translateY: 4 }] }}>
      <View style={{ width: 14, height: 14, borderRadius: 4, borderCurve: "continuous", backgroundColor: color.aiSubtle, borderWidth: 1, borderColor: color.cardEdge }} />
      <Text testID="gift-product" style={{ fontSize: 15.5, fontWeight: "600", color: color.ink }}>
        {name}
      </Text>
    </Chip>
  );
}
