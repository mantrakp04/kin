import { useQuery } from "convex/react";
import { router } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../../convex/_generated/api";
import { Backdrop } from "../../components/Backdrop";
import { useDockHeight } from "../../components/Dock";
import { Enter } from "../../components/Enter";
import { Press } from "../../components/Press";
import { Avatar, Card, SearchField, SectionLabel } from "../../components/ui";
import { LETTERS, LetterIndex } from "../../components/people/LetterIndex";
import { HEADER_H, LetterHeader, PersonRow, ROW_H } from "../../components/people/PersonRow";
import { PeopleGraph } from "../../components/people/PeopleGraph";
import { Segmented } from "../../components/map/Segmented";
import { useSession } from "../../lib/session";
import { backdrops, space, type } from "../../theme/tokens";

type Item =
  | { kind: "header"; key: string; letter: string }
  | { kind: "person"; key: string; _id: string; name: string; hue: number; city: string; last: boolean };

export default function People() {
  const { userKey } = useSession();
  const groups = useQuery(api.people.list, { userKey });
  const me = useQuery(api.users.me, { userKey });
  const insets = useSafeAreaInsets();
  const dockH = useDockHeight();
  const list = useRef<FlatList<Item>>(null);
  const [headerH, setHeaderH] = useState(0);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"list" | "graph">("list");

  const { items, offsets, letters } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const items: Item[] = [];
    const offsets: number[] = [];
    const letters = new Map<string, number>();
    let y = 0;
    for (const g of groups ?? []) {
      const people = needle ? g.people.filter((p) => p.name.toLowerCase().includes(needle) || p.city.toLowerCase().includes(needle)) : g.people;
      if (!people.length) continue;
      letters.set(g.letter, y);
      items.push({ kind: "header", key: "h-" + g.letter, letter: g.letter });
      offsets.push(y);
      y += HEADER_H;
      people.forEach((p, i) => {
        items.push({ kind: "person", key: p._id, ...p, last: i === people.length - 1 });
        offsets.push(y);
        y += ROW_H;
      });
    }
    return { items, offsets, letters };
  }, [groups, q]);

  const jump = (letter: string) => {
    const start = LETTERS.indexOf(letter);
    const target = LETTERS.slice(start).find((l) => letters.has(l)) ?? [...letters.keys()].pop();
    if (target === undefined) return;
    list.current?.scrollToOffset({ offset: headerH + letters.get(target)!, animated: false });
  };

  const header = (
    <View onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)} style={{ paddingTop: insets.top + 12 }}>
      <Enter index={0} style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        <View>
          <SectionLabel>{me ? `${me.contactCount} people · ${me.linkedCount} linked` : " "}</SectionLabel>
          <Text style={[type.title, { marginTop: 6 }]}>People</Text>
        </View>
        {me && (
          <Press testID="people-you" accessibilityRole="button" accessibilityLabel="You" haptic scale={0.96} onPress={() => router.push("/you")}>
            <Avatar name={me.name} hue={me.hue} size={36} />
          </Press>
        )}
      </Enter>
      <Enter index={1} style={{ marginTop: space.lg }}>
        <Segmented
          options={[
            { value: "list", label: "List", testID: "people-mode-list" },
            { value: "graph", label: "Graph", testID: "people-mode-graph" },
          ]}
          value={mode}
          onChange={setMode}
        />
      </Enter>
      <Enter index={1} style={{ marginTop: space.md }}>
        <SearchField placeholder="Search by name or city" value={q} onChangeText={setQ} />
      </Enter>
      {me && mode === "list" && (
        <Enter index={2} style={{ marginTop: space.md, marginBottom: space.sm }}>
          <Press testID="my-card" accessibilityRole="button" accessibilityLabel="My card" onPress={() => router.push("/you")}>
            <Card style={{ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md }}>
              <Avatar name={me.name} hue={me.hue} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={type.rowName}>{me.name}</Text>
                <Text style={[type.quiet, { marginTop: 1 }]}>My card</Text>
              </View>
            </Card>
          </Press>
        </Enter>
      )}
    </View>
  );

  if (mode === "graph")
    return (
      <View style={{ flex: 1 }}>
        <Backdrop colors={backdrops.app} />
        <PeopleGraph q={q} top={headerH} bottom={dockH} />
        <View pointerEvents="box-none" style={{ position: "absolute", left: space.page, right: space.page, top: 0 }}>
          {header}
        </View>
      </View>
    );

  return (
    <View style={{ flex: 1 }}>
      <Backdrop colors={backdrops.app} />
      <FlatList
        ref={list}
        data={items}
        keyExtractor={(it) => it.key}
        ListHeaderComponent={header}
        ListEmptyComponent={groups && q ? <Text style={[type.quiet, { marginTop: space.xl }]}>No one matches "{q}"</Text> : undefined}
        getItemLayout={(_, i) => ({ length: items[i]?.kind === "header" ? HEADER_H : ROW_H, offset: headerH + (offsets[i] ?? 0), index: i })}
        renderItem={({ item }) =>
          item.kind === "header" ? (
            <LetterHeader letter={item.letter} />
          ) : (
            <PersonRow name={item.name} hue={item.hue} city={item.city} last={item.last} onPress={() => router.push(`/person/${item._id}?from=People`)} />
          )
        }
        contentContainerStyle={{ paddingLeft: space.page, paddingRight: space.page + 14, paddingBottom: dockH + 12 }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        initialNumToRender={30}
      />
      {items.length > 0 && (
        <View pointerEvents="box-none" style={{ position: "absolute", right: 0, top: insets.top, bottom: dockH, justifyContent: "center" }}>
          <LetterIndex available={new Set(letters.keys())} onLetter={jump} />
        </View>
      )}
    </View>
  );
}
