import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Backdrop } from "../components/Backdrop";
import { IntroStep } from "../components/onboarding/IntroStep";
import { SOURCES } from "../components/onboarding/light";
import { ConnectStep } from "../components/onboarding/ConnectStep";
import { SyncStep } from "../components/onboarding/SyncStep";
import { WelcomeStep } from "../components/onboarding/WelcomeStep";
import { useSession } from "../lib/session";
import { backdrops, type BackdropColors } from "../theme/tokens";

type Step = "intro" | "welcome" | "sync" | "connect";

export default function OnboardingPage() {
  const { onboarded, setOnboarded } = useSession();
  const [step, setStep] = useState<Step>("intro");
  const [colors, setColors] = useState<BackdropColors>(backdrops.onboarding);
  const [leaving, setLeaving] = useState(false);

  const go = (next: Step) => setStep((s) => (s === next ? s : next));

  const [then, setThen] = useState<string | null>(null);

  const finish = (next?: string) => {
    setThen(next ?? null);
    setOnboarded(true);
    setLeaving(true);
  };

  useEffect(() => {
    if (!leaving || !onboarded) return;
    if (router.canDismiss()) router.dismissAll();
    else router.replace("/(tabs)");
    if (then) router.push(then as "/import");
  }, [leaving, onboarded]);

  const onSyncStep = (i: number) => setColors({ ...backdrops.onboarding, ...SOURCES[i].hues });

  return (
    <View style={{ flex: 1, backgroundColor: backdrops.onboarding.tl }}>
      <StatusBar style="light" />
      <Backdrop colors={colors} />
      <Animated.View key={step} entering={FadeIn.duration(420)} exiting={FadeOut.duration(200)} style={{ flex: 1 }}>
        {step === "intro" && <IntroStep onDone={() => go("welcome")} />}
        {step === "welcome" && <WelcomeStep onSync={() => go("sync")} onSkip={() => go("connect")} />}
        {step === "sync" && <SyncStep onStep={onSyncStep} onDone={() => go("connect")} />}
        {step === "connect" && <ConnectStep onDone={() => finish()} onImport={() => finish("/import")} />}
      </Animated.View>
    </View>
  );
}
