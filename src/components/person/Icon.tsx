import { Canvas, Circle, Group, Path, Skia } from "@shopify/react-native-skia";
import { color as tokens } from "../../theme/tokens";

const paths = {
  phone: Skia.Path.MakeFromSVGString(
    "M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25c1.1.37 2.33.57 3.6.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z",
  )!,
  back: Skia.Path.MakeFromSVGString("M15 5l-7 7 7 7")!,
};

export function Icon({ name, size = 18, color = tokens.ink }: { name: keyof typeof paths; size?: number; color?: string }) {
  const stroke = name === "back";
  return (
    <Canvas style={{ width: size, height: size }}>
      <Group transform={[{ scale: size / 24 }]}>
        <Path path={paths[name]} color={color} style={stroke ? "stroke" : "fill"} strokeWidth={2.2} strokeCap="round" strokeJoin="round" />
      </Group>
    </Canvas>
  );
}

export function MoreDots({ color = tokens.ink }: { color?: string }) {
  return (
    <Canvas style={{ width: 18, height: 18 }}>
      {[3.5, 9, 14.5].map((x) => (
        <Circle key={x} cx={x} cy={9} r={1.6} color={color} />
      ))}
    </Canvas>
  );
}
