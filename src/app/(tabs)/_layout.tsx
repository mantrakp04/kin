import { Redirect, Tabs } from "expo-router";
import { Dock } from "../../components/Dock";
import { useSession } from "../../lib/session";

export default function TabsLayout() {
  const { onboarded } = useSession();
  if (!onboarded) return <Redirect href="/onboarding" />;
  return (
    <Tabs tabBar={(props) => <Dock {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "transparent" } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="people" />
      <Tabs.Screen name="map" />
    </Tabs>
  );
}
