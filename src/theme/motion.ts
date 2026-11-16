import { Easing } from "react-native-reanimated";

export type SpringSpec = { response: number; damping: number };

export function spring({ response, damping }: SpringSpec) {
  const omega = (2 * Math.PI) / response;
  return { stiffness: omega * omega, damping: 2 * damping * omega, mass: 1 };
}

export const springs = {
  snappy: spring({ response: 0.2, damping: 0.9 }),
  smooth: spring({ response: 0.4, damping: 0.85 }),
  bouncy: spring({ response: 0.3, damping: 0.6 }),
  pill: spring({ response: 0.27, damping: 0.9 }),
  peek: spring({ response: 0.18, damping: 0.8 }),
} as const;

export const ease = Easing.bezier(0.16, 1, 0.3, 1);
export const easeOutQuint = Easing.bezier(0.23, 1, 0.32, 1);

export const duration = { fast: 100, base: 150, slow: 250, long: 400, pill: 420, enter: 720 } as const;

export const enter = { rise: 18, stagger: 70 } as const;

export const press = { control: 0.97, icon: 0.96 } as const;
