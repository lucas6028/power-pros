import rawTeams from "./teams.json";
import strings from "./strings.json";
import { loadTeams } from "./schema";
import type { Team } from "../game/types";

/** All six CPBL teams, zod-validated at module load — bad data fails loudly. */
export const TEAMS: Team[] = loadTeams(rawTeams);

export function teamById(id: string): Team {
  const t = TEAMS.find((t) => t.id === id);
  if (!t) throw new Error(`unknown team id: ${id}`);
  return t;
}

export const STRINGS = strings;
export type StringKey = keyof typeof strings;

export function t(key: StringKey): string {
  return STRINGS[key];
}
