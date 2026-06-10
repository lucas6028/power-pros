import { z } from "zod";
import type { Team } from "../game/types";

const grade = z.number().int().min(1).max(8);

const breakingBall = z.object({
  type: z.enum(["slider", "curve", "fork", "sinker", "changeup"]),
  level: z.number().int().min(1).max(7),
});

const batterStats = z.object({
  trajectory: z.number().int().min(1).max(4),
  contact: grade,
  power: grade,
  run: grade,
  arm: grade,
  field: grade,
});

const pitcherStats = z.object({
  velocity: z.number().int().min(125).max(165),
  control: grade,
  stamina: grade,
  breakingBalls: z.array(breakingBall).min(1).max(4),
});

const player = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nameEn: z.string().optional(),
  position: z.enum(["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"]),
  bats: z.enum(["L", "R", "S"]),
  throws: z.enum(["L", "R"]),
  batting: batterStats,
  pitching: pitcherStats.optional(),
});

const team = z
  .object({
    id: z.enum(["brothers", "lions", "monkeys", "guardians", "dragons", "hawks"]),
    name: z.string().min(1),
    nameEn: z.string().min(1),
    abbr: z.string().min(1).max(3),
    colors: z.object({
      primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      secondary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      cap: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    }),
    lineup: z.array(z.string()).length(9),
    pitchers: z.array(z.string()).min(1),
    players: z.array(player).min(10),
  })
  .superRefine((t, ctx) => {
    const ids = new Set(t.players.map((p) => p.id));
    if (ids.size !== t.players.length) {
      ctx.addIssue({ code: "custom", message: `duplicate player ids on ${t.id}` });
    }
    for (const id of [...t.lineup, ...t.pitchers]) {
      if (!ids.has(id)) {
        ctx.addIssue({
          code: "custom",
          message: `${t.id}: lineup/pitcher id "${id}" not in players`,
        });
      }
    }
    for (const pid of t.pitchers) {
      const p = t.players.find((pl) => pl.id === pid);
      if (p && !p.pitching) {
        ctx.addIssue({
          code: "custom",
          message: `${t.id}: pitcher "${pid}" has no pitching stats`,
        });
      }
    }
  });

export const teamsSchema = z.array(team).length(6);

/** Validate raw JSON into typed Teams. Throws (loudly) on bad data. */
export function loadTeams(raw: unknown): Team[] {
  return teamsSchema.parse(raw) as Team[];
}
