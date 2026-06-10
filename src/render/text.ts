import { Text, TextStyle, type TextStyleOptions } from "pixi.js";

const FONT_STACK = '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif';

export function makeText(content: string, opts: Partial<TextStyleOptions> = {}): Text {
  const style = new TextStyle({
    fontFamily: FONT_STACK,
    fontSize: 24,
    fill: 0xffffff,
    stroke: { color: 0x2b2b3a, width: 4, join: "round" },
    fontWeight: "900",
    ...opts,
  });
  return new Text({ text: content, style });
}
