import { Canvas, Path, Skia } from "@shopify/react-native-skia";
import qrcode from "qrcode-generator";
import { useMemo } from "react";
import { View } from "react-native";
import { color } from "../../theme/tokens";

export function QrCode({ value, size = 200, testID }: { value: string; size?: number; testID?: string }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { path: Skia.Path.MakeFromSVGString(d), count: n };
  }, [value]);
  const scale = size / count;
  return (
    <View testID={testID} accessibilityRole="image" accessibilityLabel="QR code for your agent link" style={{ width: size, height: size }}>
      <Canvas style={{ width: size, height: size }}>
        {path && <Path path={path} color={color.ink} transform={[{ scale }]} />}
      </Canvas>
    </View>
  );
}
