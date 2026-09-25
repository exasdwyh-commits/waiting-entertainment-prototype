/** One visual identity per seat. Production GLBs can replace the soft-plush previews one at a time. */
export type CharacterSpecies = "wombat" | "axolotl" | "pangolin" | "capybara" |
  "duck" | "red-panda" | "tapir" | "gecko" | "otter" | "hedgehog";

export interface TableCharacter {
  id: string;
  name: string;
  species: CharacterSpecies;
  role: string;
  body: "heavy" | "medium" | "light";
  color: number;
  accent: number;
  /** A runtime GLB path. Preview meshes may be static until rigged production delivery. */
  modelUrl: string | null;
}

export const TABLE_CHARACTERS: readonly TableCharacter[] = [
  { id: "CH01", name: "团团", species: "wombat", role: "袋熊服务生", body: "heavy", color: 0x91654f, accent: 0xc66d52, modelUrl: "/characters/CH01.glb" },
  { id: "CH02", name: "泡泡", species: "axolotl", role: "六角恐龙帮厨", body: "light", color: 0xf7a9b9, accent: 0x69d1c5, modelUrl: "/characters/CH02.glb" },
  { id: "CH03", name: "甲甲", species: "pangolin", role: "穿山甲烤台", body: "heavy", color: 0x9e7051, accent: 0xe4a64b, modelUrl: null },
  { id: "CH04", name: "慢慢", species: "capybara", role: "水豚领班", body: "heavy", color: 0xc59b68, accent: 0x48836d, modelUrl: null },
  { id: "CH05", name: "啵啵", species: "duck", role: "鸭子点心师", body: "medium", color: 0xf4eee0, accent: 0xf3a747, modelUrl: null },
  { id: "CH06", name: "尾尾", species: "red-panda", role: "小熊猫调酒师", body: "medium", color: 0xc66a3d, accent: 0x3e695d, modelUrl: null },
  { id: "CH07", name: "鼻仔", species: "tapir", role: "貘甜品师", body: "heavy", color: 0x494348, accent: 0xe8d8bc, modelUrl: null },
  { id: "CH08", name: "椒椒", species: "gecko", role: "壁虎备菜", body: "light", color: 0x88bd57, accent: 0x4169a7, modelUrl: null },
  // CH09–10 are visual candidates until their canonical reference sheets are approved.
  { id: "CH09", name: "滑滑", species: "otter", role: "水獭传菜员", body: "light", color: 0x916d58, accent: 0x76b3b2, modelUrl: null },
  { id: "CH10", name: "栗栗", species: "hedgehog", role: "刺猬收银员", body: "medium", color: 0xb58d6c, accent: 0xb36e7d, modelUrl: null },
] as const;

export function characterForSeat(index: number) {
  const seat = Number.isFinite(index) ? Math.abs(Math.trunc(index)) : 0;
  return TABLE_CHARACTERS[seat % TABLE_CHARACTERS.length];
}
