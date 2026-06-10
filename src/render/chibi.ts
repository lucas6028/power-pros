import { Container, Graphics } from "pixi.js";

/** Power Pros chibi proportions: head ≈ half of total height, dot-pupil eyes,
 * no nose, blush marks, bold dark outlines, flat colors. */

const OUTLINE = 0x3a2620;
const SKIN = 0xfbd7a0;
const SKIN_SHADE = 0xf0b97a;

export interface ChibiColors {
  jersey: number;
  cap: number;
  trim: number;
}

function line(width = 4): { width: number; color: number; join: "round"; cap: "round" } {
  return { width, color: OUTLINE, join: "round", cap: "round" };
}

/** Front-facing chibi (used for pitcher facing the batter, menus). ~150px tall at scale 1. */
export function chibiFront(colors: ChibiColors): Container {
  const c = new Container();
  const g = new Graphics();

  // legs
  g.ellipse(-16, 64, 13, 9).fill(0xffffff).stroke(line());
  g.ellipse(16, 64, 13, 9).fill(0xffffff).stroke(line());
  // body (jersey)
  g.roundRect(-26, 8, 52, 52, 14).fill(colors.jersey).stroke(line());
  // arms
  g.circle(-33, 38, 10).fill(SKIN).stroke(line());
  g.circle(33, 38, 10).fill(SKIN).stroke(line());
  // belt
  g.rect(-24, 52, 48, 8).fill(colors.trim);

  // head
  g.ellipse(0, -32, 52, 46).fill(SKIN).stroke(line(5));
  // ears
  g.circle(-48, -24, 7).fill(SKIN).stroke(line());
  g.circle(48, -24, 7).fill(SKIN).stroke(line());

  // cap dome
  g.moveTo(-50, -44).arc(0, -44, 50, Math.PI, 0).closePath().fill(0xffffff).stroke(line(5));
  // cap brim
  g.ellipse(0, -42, 54, 12).fill(colors.cap).stroke(line(4));
  // cap button
  g.circle(0, -92, 5).fill(colors.cap).stroke(line(3));

  // eyes: big white ovals with dark pupils + highlight
  g.ellipse(-20, -22, 9, 13).fill(0xffffff).stroke(line(3));
  g.ellipse(20, -22, 9, 13).fill(0xffffff).stroke(line(3));
  g.ellipse(-20, -20, 5, 8).fill(0x4a3aa8);
  g.ellipse(20, -20, 5, 8).fill(0x4a3aa8);
  g.circle(-22, -24, 2).fill(0xffffff);
  g.circle(18, -24, 2).fill(0xffffff);
  // blush
  g.ellipse(-38, -8, 7, 4).fill(0xf5a8a0);
  g.ellipse(38, -8, 7, 4).fill(0xf5a8a0);
  // mouth
  g.moveTo(-5, -4).quadraticCurveTo(0, 0, 5, -4).stroke(line(3));

  c.addChild(g);
  return c;
}

/** Back view chibi holding a bat (the batter in the foreground). */
export function chibiBatterBack(colors: ChibiColors, batsLeft: boolean): Container {
  const c = new Container();
  const g = new Graphics();
  const flip = batsLeft ? -1 : 1;

  // legs
  g.ellipse(-18, 70, 15, 10).fill(0xffffff).stroke(line());
  g.ellipse(18, 70, 15, 10).fill(0xffffff).stroke(line());
  // body
  g.roundRect(-30, 6, 60, 60, 14).fill(colors.jersey).stroke(line());
  // number plate on back
  g.roundRect(-14, 18, 28, 30, 8).fill(0xffffff).stroke(line(3));

  // bat (angled up behind shoulder)
  g.moveTo(34 * flip, 6)
    .lineTo(80 * flip, -98)
    .stroke({ width: 18, color: OUTLINE, cap: "round" });
  g.moveTo(34 * flip, 6)
    .lineTo(80 * flip, -98)
    .stroke({ width: 12, color: 0xd9a05b, cap: "round" });
  // hands gripping
  g.circle(36 * flip, 2, 10)
    .fill(SKIN)
    .stroke(line());
  g.circle(42 * flip, -10, 10)
    .fill(SKIN)
    .stroke(line());

  // head (back of head: skin + helmet)
  g.ellipse(0, -36, 54, 48).fill(SKIN_SHADE).stroke(line(5));
  // helmet covering most of the back of the head
  g.moveTo(-52, -30)
    .arc(0, -38, 52, Math.PI * 0.94, Math.PI * 0.06, false)
    .closePath()
    .fill(colors.cap)
    .stroke(line(5));
  // ears
  g.circle(-50, -26, 8).fill(SKIN).stroke(line());
  g.circle(50, -26, 8).fill(SKIN).stroke(line());

  c.addChild(g);
  return c;
}
