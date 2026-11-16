import { Canvas, Group, Path } from "@shopify/react-native-skia";
import type { ReactNode } from "react";

const INK = "#1E1A1A";
const W = 200;
const H = 240;

const circ = (cx: number, cy: number, r: number) => ell(cx, cy, r, r);
function ell(cx: number, cy: number, rx: number, ry: number) {
  return "M " + (cx - rx) + " " + cy + " a " + rx + " " + ry + " 0 1 0 " + 2 * rx + " 0 a " + rx + " " + ry + " 0 1 0 " + -2 * rx + " 0 Z";
}
function rect(x: number, y: number, w: number, h: number, r: number) {
  return "M " + (x + r) + " " + y + " H " + (x + w - r) + " Q " + (x + w) + " " + y + " " + (x + w) + " " + (y + r) + " V " + (y + h - r) + " Q " + (x + w) + " " + (y + h) + " " + (x + w - r) + " " + (y + h) + " H " + (x + r) + " Q " + x + " " + (y + h) + " " + x + " " + (y + h - r) + " V " + (y + r) + " Q " + x + " " + y + " " + (x + r) + " " + y + " Z";
}

function S({ d, fill, line = 3.5 }: { d: string; fill?: string; line?: number }) {
  return (
    <>
      {fill && <Path path={d} color={fill} />}
      {line > 0 && <Path path={d} color={INK} style="stroke" strokeWidth={line} strokeJoin="round" strokeCap="round" />}
    </>
  );
}

function Eye({ x, y, r, look = 3, pupil = 0.42 }: { x: number; y: number; r: number; look?: number; pupil?: number }) {
  return (
    <>
      <S d={circ(x, y, r)} fill="#FFFFFF" line={2.5} />
      <Path path={circ(x + look, y + 1, r * pupil)} color={INK} />
    </>
  );
}

function Mouth({ x, y, w, talk, fill = "#7A1F2B" }: { x: number; y: number; w: number; talk: number; fill?: string }) {
  const open = 1.5 + talk * w * 0.7;
  return talk > 0.05 ? <S d={ell(x, y + open / 2, w / 2, open)} fill={fill} line={2.5} /> : <Path path={"M " + (x - w / 2) + " " + y + " Q " + x + " " + (y + 5) + " " + (x + w / 2) + " " + y} color={INK} style="stroke" strokeWidth={3} strokeCap="round" />;
}

function Peter({ talk }: { talk: number }) {
  return (
    <>
      <S d={ell(100, 205, 78, 58)} fill="#F6F4EE" />
      <S d={rect(38, 222, 124, 30, 10)} fill="#3F6D3A" />
      <S d={ell(112, 140, 36, 18)} fill="#F2C9A0" />
      <S d={circ(104, 96, 54)} fill="#F2C9A0" />
      <S d={"M 54 86 Q 60 36 108 40 Q 150 42 156 82 Q 132 60 104 62 Q 74 62 54 86 Z"} fill="#5A3A1E" />
      <Eye x={98} y={92} r={11} look={3} />
      <Eye x={130} y={92} r={11} look={3} />
      <S d={circ(98, 92, 15)} line={4} />
      <S d={circ(130, 92, 15)} line={4} />
      <Path path="M 113 91 L 115 91" color={INK} style="stroke" strokeWidth={4} />
      <S d={ell(140, 108, 7, 6)} fill="#E9B88E" line={2.5} />
      <Mouth x={124} y={124} w={26} talk={talk} />
    </>
  );
}

function Stewie({ talk }: { talk: number }) {
  return (
    <>
      <S d={rect(66, 150, 76, 60, 18)} fill="#F4D03F" />
      <S d={rect(60, 178, 88, 70, 14)} fill="#D7352B" />
      <Path path="M 74 178 L 80 152 M 134 178 L 128 152" color={INK} style="stroke" strokeWidth={4} />
      <S d={"M 18 92 Q 100 18 184 92 Q 100 168 18 92 Z"} fill="#F4D4B4" />
      <Path path="M 70 58 Q 100 46 132 56" color="#7A5534" style="stroke" strokeWidth={3} />
      <Path path="M 104 70 L 124 66 M 138 66 L 158 72" color={INK} style="stroke" strokeWidth={4} strokeCap="round" />
      <Eye x={116} y={84} r={8} look={2.5} pupil={0.5} />
      <Eye x={148} y={84} r={8} look={2.5} pupil={0.5} />
      <Mouth x={140} y={112} w={18} talk={talk} />
    </>
  );
}

function Rick({ talk }: { talk: number }) {
  return (
    <>
      <S d={"M 30 248 L 70 150 L 130 150 L 170 248 Z"} fill="#F4F6F8" />
      <S d={"M 82 150 L 100 200 L 118 150 Z"} fill="#9EC9E2" />
      <S d={"M 46 90 L 30 54 L 62 64 L 60 26 L 88 50 L 100 14 L 116 48 L 142 24 L 140 62 L 172 52 L 156 92 Z"} fill="#B8D8E8" />
      <S d={ell(104, 100, 42, 54)} fill="#E8D7C8" />
      <Path path="M 74 78 Q 108 66 140 78" color={INK} style="stroke" strokeWidth={6} strokeCap="round" />
      <Eye x={94} y={92} r={10} look={3} pupil={0.3} />
      <Eye x={124} y={92} r={10} look={3} pupil={0.3} />
      <Path path="M 82 124 Q 92 120 100 126 M 112 126 Q 120 120 132 124" color="#B9A796" style="stroke" strokeWidth={2.5} />
      <Mouth x={112} y={134} w={30} talk={talk} fill="#4A2A2A" />
    </>
  );
}

function Morty({ talk }: { talk: number }) {
  return (
    <>
      <S d={ell(100, 222, 62, 44)} fill="#F2D13C" />
      <S d={circ(102, 104, 50)} fill="#F4D4B4" />
      <S d={"M 52 102 Q 46 48 102 46 Q 156 48 152 100 Q 142 70 104 68 Q 66 70 52 102 Z"} fill="#6E4524" />
      <Eye x={92} y={104} r={14} look={2} pupil={0.22} />
      <Eye x={124} y={104} r={14} look={2} pupil={0.22} />
      <S d={"M 160 70 Q 168 84 160 90 Q 152 84 160 70 Z"} fill="#9ED8F5" line={2} />
      <Mouth x={112} y={134} w={20} talk={talk} />
    </>
  );
}

function Phone({ talk }: { talk: number }) {
  return (
    <>
      <S d={"M 40 70 Q 100 6 160 70"} line={8} />
      <S d={rect(26, 60, 26, 44, 10)} fill="#2F2F38" />
      <S d={rect(54, 40, 92, 196, 24)} fill="#1C1B22" />
      <Path path={rect(64, 56, 72, 160, 14)} color="#3139FB" />
      <Path path={rect(64, 56, 72, 70, 14)} color="#5A61FF" />
      <Path path={ell(86, 112, 8, 11)} color="#FFFFFF" />
      <Path path={ell(116, 112, 8, 11)} color="#FFFFFF" />
      <Path path={circ(88, 114, 4)} color={INK} />
      <Path path={circ(118, 114, 4)} color={INK} />
      <Mouth x={101} y={146} w={22} talk={talk} fill="#FF8FB1" />
      <S d={"M 52 96 Q 30 130 64 150"} line={4} />
    </>
  );
}

function Mug({ talk }: { talk: number }) {
  return (
    <>
      <S d={"M 140 120 Q 186 120 184 160 Q 182 196 140 192"} line={12} />
      <S d={rect(44, 90, 104, 140, 22)} fill="#FF9F68" />
      <S d={ell(96, 92, 52, 12)} fill="#6B3E22" />
      <Eye x={80} y={150} r={10} look={3} />
      <Eye x={112} y={150} r={10} look={3} />
      <Mouth x={98} y={180} w={24} talk={talk} />
    </>
  );
}

function Plant({ talk }: { talk: number }) {
  return (
    <>
      <S d={"M 56 160 L 144 160 L 132 236 L 68 236 Z"} fill="#C8693F" />
      <S d={"M 100 160 Q 30 130 50 70 Q 90 90 100 160 Z"} fill="#5FBF7A" />
      <S d={"M 100 160 Q 170 130 150 70 Q 110 90 100 160 Z"} fill="#4FAF6A" />
      <S d={"M 100 160 Q 76 80 100 30 Q 124 80 100 160 Z"} fill="#6FD08A" />
      <Eye x={86} y={196} r={9} look={3} />
      <Eye x={114} y={196} r={9} look={3} />
      <Mouth x={100} y={220} w={18} talk={talk} />
    </>
  );
}

const DRAW: Record<string, (p: { talk: number }) => ReactNode> = { peter: Peter, stewie: Stewie, rick: Rick, morty: Morty, narrator: Phone, a: Mug, b: Plant };

export const hasCharacter = (id: string) => id in DRAW;

export function Character({ id, talk, height, mirror }: { id: string; talk: number; height: number; mirror: boolean }) {
  const Draw = DRAW[id];
  const scale = height / H;
  const width = W * scale;
  return (
    <Canvas style={{ width, height }}>
      <Group transform={mirror ? [{ translateX: width }, { scaleX: -scale }, { scaleY: scale }] : [{ scale }]}>
        <Draw talk={talk} />
      </Group>
    </Canvas>
  );
}
