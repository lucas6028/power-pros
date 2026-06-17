/** HTML/CSS HUD overlay for the 3D game scene. Authored in the fixed
 * GAME_W×GAME_H (960×540) coordinate space — the overlay element is CSS-scaled to
 * the letterboxed canvas by main's fit(), so px positions here line up with the
 * 3D view. zh-TW text is rendered directly by the browser (no WebGL font work). */

const FONT = '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif';

export interface HudData {
  scoreLine: string;
  inning: string;
  batter: string;
  balls: number;
  strikes: number;
  outs: number;
  bases: [boolean, boolean, boolean];
  message: string;
  speed: string;
  hint: string;
  /** Pitch picker, shown only while the player is pitching. */
  pitchList: { names: string[]; selected: number } | null;
}

const LAMP_OFF = "#3c3c50";

function el(tag: string, style: Partial<CSSStyleDeclaration>): HTMLElement {
  const e = document.createElement(tag);
  Object.assign(e.style, style);
  return e;
}

export class Hud {
  private root: HTMLElement;
  private scoreEl: HTMLElement;
  private inningEl: HTMLElement;
  private batterEl: HTMLElement;
  private lamps: Record<"B" | "S" | "O", HTMLElement[]> = { B: [], S: [], O: [] };
  private baseEls: HTMLElement[] = [];
  private msgEl: HTMLElement;
  private speedEl: HTMLElement;
  private hintEl: HTMLElement;
  private pitchListEl: HTMLElement;

  constructor(overlay: HTMLElement) {
    this.root = el("div", {
      position: "absolute",
      inset: "0",
      fontFamily: FONT,
      color: "#fff",
      userSelect: "none",
    });

    // top-left info panel
    const left = el("div", {
      position: "absolute",
      left: "12px",
      top: "10px",
      width: "250px",
      padding: "8px 12px",
      boxSizing: "border-box",
      background: "rgba(26,26,46,0.82)",
      borderRadius: "10px",
    });
    this.scoreEl = el("div", { fontSize: "24px", fontWeight: "900" });
    this.inningEl = el("div", {
      fontSize: "18px",
      fontWeight: "900",
      color: "#9adcf0",
      marginTop: "4px",
    });
    this.batterEl = el("div", { fontSize: "18px", fontWeight: "900", marginTop: "4px" });
    left.append(this.scoreEl, this.inningEl, this.batterEl, this.buildLamps());
    this.root.append(left);

    // top-right bases diamond
    this.root.append(this.buildBases());

    // centred message (play result / ball / strike)
    this.msgEl = el("div", {
      position: "absolute",
      left: "0",
      top: "150px",
      width: "100%",
      textAlign: "center",
      fontSize: "44px",
      fontWeight: "900",
      color: "#ffe14d",
      textShadow: "0 0 6px #2b2b3a, 2px 2px 0 #2b2b3a",
    });

    // pitch speed readout
    this.speedEl = el("div", {
      position: "absolute",
      left: "560px",
      top: "315px",
      width: "220px",
      textAlign: "center",
      fontSize: "22px",
      fontWeight: "900",
      textShadow: "1px 1px 0 #2b2b3a",
    });

    // bottom hint
    this.hintEl = el("div", {
      position: "absolute",
      left: "0",
      bottom: "6px",
      width: "100%",
      textAlign: "center",
      fontSize: "14px",
      textShadow: "1px 1px 0 #2b2b3a",
    });

    // pitch picker (player pitching)
    this.pitchListEl = el("div", {
      position: "absolute",
      left: "20px",
      bottom: "30px",
      minWidth: "150px",
      padding: "8px",
      background: "rgba(26,26,46,0.82)",
      borderRadius: "8px",
      fontSize: "20px",
      fontWeight: "900",
      display: "none",
    });

    this.root.append(this.msgEl, this.speedEl, this.hintEl, this.pitchListEl);
    overlay.append(this.root);
  }

  private buildLamps(): HTMLElement {
    const wrap = el("div", { marginTop: "8px" });
    (["B", "S", "O"] as const).forEach((label) => {
      const count = label === "B" ? 3 : 2;
      const color = label === "B" ? "#4caf50" : label === "S" ? "#ffc107" : "#f44336";
      const line = el("div", { display: "flex", alignItems: "center", gap: "6px", height: "22px" });
      const lab = el("div", {
        width: "16px",
        fontSize: "14px",
        fontWeight: "900",
        color: "#9a9ab8",
      });
      lab.textContent = label;
      line.append(lab);
      for (let i = 0; i < count; i++) {
        const dot = el("div", {
          width: "14px",
          height: "14px",
          borderRadius: "50%",
          background: LAMP_OFF,
          border: "2px solid #10101c",
        });
        dot.dataset.color = color;
        this.lamps[label].push(dot);
        line.append(dot);
      }
      wrap.append(line);
    });
    return wrap;
  }

  private buildBases(): HTMLElement {
    const wrap = el("div", {
      position: "absolute",
      right: "24px",
      top: "30px",
      width: "100px",
      height: "100px",
    });
    // 2nd (top), 3rd (left), 1st (right)
    const spots: [string, string][] = [
      ["28px", "0px"], // 2nd: top-centre
      ["0px", "40px"], // 3rd: left
      ["56px", "40px"], // 1st: right
    ];
    for (const [left, top] of spots) {
      const d = el("div", {
        position: "absolute",
        left,
        top,
        width: "26px",
        height: "26px",
        background: LAMP_OFF,
        border: "3px solid #fff",
        transform: "rotate(45deg)",
      });
      this.baseEls.push(d);
      wrap.append(d);
    }
    return wrap;
  }

  update(d: HudData): void {
    this.scoreEl.textContent = d.scoreLine;
    this.inningEl.textContent = d.inning;
    this.batterEl.textContent = d.batter;

    const setLamps = (arr: HTMLElement[], lit: number): void => {
      arr.forEach((dot, i) => {
        dot.style.background = i < lit ? (dot.dataset.color as string) : LAMP_OFF;
      });
    };
    setLamps(this.lamps.B, d.balls);
    setLamps(this.lamps.S, d.strikes);
    setLamps(this.lamps.O, d.outs);

    this.baseEls.forEach((b, i) => {
      b.style.background = d.bases[i] ? "#ffe14d" : LAMP_OFF;
    });

    this.msgEl.textContent = d.message;
    this.speedEl.textContent = d.speed;
    this.hintEl.textContent = d.hint;

    if (d.pitchList) {
      this.pitchListEl.style.display = "block";
      this.pitchListEl.replaceChildren(
        ...d.pitchList.names.map((name, i) => {
          const sel = i === d.pitchList!.selected;
          const row = el("div", { color: sel ? "#ffe14d" : "#fff", padding: "1px 0" });
          row.textContent = `${sel ? "▶ " : "　"}${name}`;
          return row;
        }),
      );
    } else {
      this.pitchListEl.style.display = "none";
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
