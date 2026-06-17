import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { ChibiColors } from "./chibi";

/** True-3D chibi figures built from primitives, honouring the Power Pros style:
 * oversized head (~half the total height), big dot-pupil eyes, no nose, blush,
 * bold dark outlines, flat toon shading. Figures stand with their origin at the
 * feet (y = 0).
 *
 * Detail comes from four cheap tricks layered on the primitives: an even
 * inverted-hull outline on every part (vertices pushed along their normals so the
 * stroke stays a constant width on thin limbs and the big torso alike), a crisp
 * cel ramp shared by all toon materials, rounded-box bodies/plates instead of hard
 * boxes, and a soft blob shadow on the ground.
 *
 * Sub-groups are named to mirror the 2D Pixi labels so the GameScene animation
 * code can grab them with getObjectByName: "arm" (pitcher) holding "armBall",
 * and "bat" (batter) holding "batTip", plus the shared rig pivots "body",
 * "frontLeg"/"backLeg" and their "frontShin"/"backShin" knees. */

const SKIN = 0xfbd7a0;
const SKIN_SHADE = 0xf0b97a;
const OUTLINE = 0x3a2620;
const PANTS = 0xf6f3ea;
const SOLE = 0x2c2723;
const WOOD = 0xe7b277;
const WOOD_DARK = 0x9a6a3a;
const GRIP_TAPE = 0x33271c;
const EYE_IRIS = 0x5a3ac8;
const BLUSH = 0xf5a8a0;
const MOUTH = 0x6b4a3a;

const HEAD_R = 0.42;
const HEAD_Y = 1.18;

/** A crisp 2–3 tone toon ramp shared by every material, so the rounded forms read
 * with a clean cel shadow instead of the muddy smooth gradient the default ramp
 * gives. Nearest filtering keeps the bands hard. Textures aren't freed by the
 * scene's geometry/material disposal, so this singleton survives scene swaps. */
const TOON_RAMP: THREE.DataTexture = (() => {
  // floor at ~0.6 so dark team colours (navy caps) keep their hue in shadow
  // instead of crushing to near-black, while light parts still read a clean band
  const steps = new Uint8Array([152, 194, 226, 255]);
  const tex = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();

/** A soft round drop shadow (radial alpha falloff) reused under every figure. */
const SHADOW_TEX: THREE.DataTexture = (() => {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      const d = Math.min(1, Math.hypot(dx, dy));
      const a = (1 - d) * (1 - d); // smooth fade to nothing at the rim
      const i = (y * size + x) * 4;
      data[i + 3] = Math.round(255 * a * 0.5);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
})();

function toon(color: number): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: TOON_RAMP });
}

function flat(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color });
}

/** Clone a geometry and push every vertex out along its normal — an even-width
 * skin for the inverted-hull outline. (Uniform scaling would over-thicken long
 * limbs and offset their caps; a normal push keeps the stroke constant.) */
function inflate(geo: THREE.BufferGeometry, amount: number): THREE.BufferGeometry {
  const g = geo.clone();
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const nor = g.getAttribute("normal") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) + nor.getX(i) * amount,
      pos.getY(i) + nor.getY(i) * amount,
      pos.getZ(i) + nor.getZ(i) * amount,
    );
  }
  pos.needsUpdate = true;
  return g;
}

/** A toon-shaded mesh wrapped in an even dark outline shell (the bold chibi look).
 * Used for every solid body part so the whole figure carries a consistent stroke. */
function outlined(geo: THREE.BufferGeometry, color: number, grow = 0.022): THREE.Group {
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(geo, toon(color)));
  const shell = new THREE.Mesh(
    inflate(geo, grow),
    new THREE.MeshBasicMaterial({ color: OUTLINE, side: THREE.BackSide }),
  );
  grp.add(shell);
  return grp;
}

/** A flat disc facing the camera (+Z), for the eyes/blush/mouth decals. */
function decal(radius: number, color: number, sx = 1, sy = 1, segs = 20): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, segs), flat(color));
  m.scale.set(sx, sy, 1);
  return m;
}

/** Soft blob shadow on the ground plane, parented to the figure root so it tracks
 * the feet (but not the spinning trunk). */
function groundShadow(): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1.05, 0.78),
    new THREE.MeshBasicMaterial({
      map: SHADOW_TEX,
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  m.renderOrder = 1;
  return m;
}

/** A chunky two-tone cleat: white rounded boot, team-accent toe, dark sole. */
function shoe(accent: number): THREE.Group {
  const g = new THREE.Group();
  const boot = outlined(new RoundedBoxGeometry(0.18, 0.13, 0.3, 4, 0.06), 0xffffff, 0.016);
  boot.position.set(0, -0.18, 0.04);
  g.add(boot);
  const toe = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.12, 0.12, 3, 0.05), toon(accent));
  toe.position.set(0, -0.18, 0.17);
  g.add(toe);
  const sole = outlined(new RoundedBoxGeometry(0.19, 0.05, 0.32, 3, 0.024), SOLE, 0.01);
  sole.position.set(0, -0.245, 0.05);
  g.add(sole);
  return g;
}

/** Head hip height: both rigs pivot the legs and upper body here so the GameScene
 * can drive a real delivery / swing (leg lift, stride, trunk rotation, arm whip or
 * bat sweep). */
const HIP_Y = 0.42;

/** One jointed leg: a pinstriped thigh on a hip pivot and a shin + two-tone cleat
 * on a knee pivot. The shin group is named so the knee can bend independently.
 * Shared by the pitcher (delivery) and the batter (stride / leg lift). */
function jointedLeg(shinName: string, accent: number): THREE.Group {
  const leg = new THREE.Group(); // pivot at the hip
  const thigh = outlined(new THREE.CapsuleGeometry(0.11, 0.18, 8, 16), PANTS, 0.02);
  thigh.position.y = -0.12;
  leg.add(thigh);

  const shin = new THREE.Group(); // pivot at the knee
  shin.name = shinName;
  shin.position.y = -0.24;
  const calf = outlined(new THREE.CapsuleGeometry(0.1, 0.16, 8, 16), PANTS, 0.02);
  calf.position.y = -0.1;
  shin.add(calf);
  shin.add(shoe(accent));
  leg.add(shin);

  return leg;
}

/** Build the jersey trunk on a body pivot: rounded torso, belt, and either a front
 * placket + chest patch (facing the camera) or a back number plate. */
function buildTorso(body: THREE.Group, colors: ChibiColors, hip: number, facing: 1 | -1): void {
  const torso = outlined(new RoundedBoxGeometry(0.66, 0.6, 0.42, 4, 0.13), colors.jersey, 0.024);
  torso.position.set(0, 0.66 - hip, 0);
  body.add(torso);

  const belt = outlined(new RoundedBoxGeometry(0.7, 0.13, 0.46, 3, 0.05), colors.trim, 0.014);
  belt.position.set(0, 0.4 - hip, 0);
  body.add(belt);

  // Jersey FRONT (placket stripe + buttons down the chest, plus a white team
  // patch) goes on the `facing` side; the number plate goes on the opposite back.
  // The chest faces +Z for the pitcher and −Z for the batter — whose bladed stance
  // then turns it toward home plate — so anchoring to `facing` keeps the buttons on
  // the plate side and the number behind for both.
  const placket = new THREE.Mesh(
    new RoundedBoxGeometry(0.07, 0.46, 0.04, 2, 0.02),
    toon(colors.trim),
  );
  placket.position.set(0, 0.66 - hip, facing * 0.212);
  body.add(placket);
  const patch = outlined(new RoundedBoxGeometry(0.2, 0.2, 0.04, 3, 0.05), 0xffffff, 0.01);
  patch.position.set(0, 0.7 - hip, facing * 0.206);
  body.add(patch);

  const plate = outlined(new RoundedBoxGeometry(0.32, 0.36, 0.05, 3, 0.04), 0xffffff, 0.01);
  plate.position.set(0, 0.72 - hip, facing * -0.21);
  body.add(plate);
}

/** Head with cap; `facing` is +1 to face +Z (camera) or −1 to face −Z (pitcher).
 * `helmet` draws a fuller batting helmet (ear flaps + ridge) instead of a ball cap
 * (curved brim + button + trim band), and the face decals are drawn only on the
 * camera-facing side. */
function headWithCap(colors: ChibiColors, facing: 1 | -1, helmet: boolean): THREE.Group {
  const g = new THREE.Group();

  const head = outlined(
    new THREE.SphereGeometry(HEAD_R, 32, 24),
    helmet ? SKIN_SHADE : SKIN,
    0.022,
  );
  head.position.set(0, HEAD_Y, 0);
  g.add(head);

  // ears
  for (const sx of [-1, 1]) {
    const ear = outlined(new THREE.SphereGeometry(0.085, 14, 12), SKIN, 0.014);
    ear.scale.set(0.7, 1, 0.7);
    ear.position.set(sx * HEAD_R * 0.98, HEAD_Y - 0.05, 0.02);
    g.add(ear);
  }

  // cap / helmet dome over the crown — the cap covers the top ~40% so its brim
  // sits clearly ABOVE the eyes (eyes are placed in the lower-front of the face)
  const domeR = HEAD_R * (helmet ? 1.07 : 1.05);
  const domeTheta = helmet ? Math.PI * 0.74 : Math.PI * 0.47;
  const dome = outlined(
    new THREE.SphereGeometry(domeR, 28, 20, 0, Math.PI * 2, 0, domeTheta),
    colors.cap,
    0.02,
  );
  dome.position.set(0, HEAD_Y, helmet ? 0 : 0.02);
  g.add(dome);

  // button on the crown
  const btn = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), toon(colors.trim));
  btn.position.set(0, HEAD_Y + domeR - 0.03, helmet ? 0 : 0.02);
  g.add(btn);

  if (!helmet) {
    // flat ball-cap brim: a thin half-disc lying horizontal (thickness along Y),
    // its curved edge jutting FORWARD the way the face looks and dipped slightly
    // down, the straight edge hidden inside the crown above the eyes. The half-
    // disc is cut so it natively bulges toward the facing side (theta swept
    // symmetrically about ±Z) — no upright rotation, which is what put the old
    // brim across the face.
    const start = facing > 0 ? -Math.PI / 2 : Math.PI / 2;
    const brim = outlined(
      new THREE.CylinderGeometry(0.24, 0.24, 0.05, 24, 1, false, start, Math.PI),
      colors.cap,
      0.012,
    );
    brim.rotation.x = facing * 0.22; // dip the leading edge down a touch
    brim.position.set(0, HEAD_Y + 0.06, facing * 0.3);
    g.add(brim);
  } else {
    // batting-helmet ear flaps + a front-to-back ridge
    for (const sx of [-1, 1]) {
      const flap = outlined(new RoundedBoxGeometry(0.1, 0.17, 0.2, 3, 0.05), colors.cap, 0.014);
      flap.position.set(sx * (HEAD_R + 0.02), HEAD_Y - 0.07, 0);
      g.add(flap);
    }
    const ridge = new THREE.Mesh(
      new THREE.TorusGeometry(domeR, 0.024, 8, 24, Math.PI),
      toon(colors.trim),
    );
    ridge.position.set(0, HEAD_Y, 0);
    ridge.rotation.y = Math.PI / 2; // arc over the top, front-to-back
    g.add(ridge);
  }

  // face: big eyes (dark ring + white + iris + catchlight), blush and a small
  // mouth — drawn on the head's FRONT (the brim/look direction): +Z for the
  // pitcher/menus, −Z for the batter, who looks up the line toward the pitcher.
  // Decals are flat discs that paint toward +Z, so the batter's are spun to face
  // −Z and pushed to the −Z side of the head.
  const z = facing * HEAD_R * 0.92;
  const faceYaw = facing < 0 ? Math.PI : 0; // turn the discs to look along the brim
  const eyeY = HEAD_Y - 0.04; // lower-front of the face, below the cap brim
  const place = (d: THREE.Mesh, x: number, y: number, zz: number): void => {
    d.position.set(x, y, zz);
    d.rotation.y = faceYaw;
    g.add(d);
  };
  for (const sx of [-1, 1]) {
    place(decal(0.105, OUTLINE, 0.8, 1.12), sx * 0.17, eyeY, z);
    place(decal(0.088, 0xffffff, 0.8, 1.12), sx * 0.17, eyeY, z + facing * 0.004);
    place(decal(0.055, EYE_IRIS, 0.92, 1.05, 18), sx * 0.17, eyeY - 0.018, z + facing * 0.008);
    place(decal(0.02, 0xffffff, 1, 1, 10), sx * 0.17 - 0.022, eyeY + 0.022, z + facing * 0.012);
    place(decal(0.05, BLUSH, 1.2, 0.7, 14), sx * 0.27, eyeY - 0.13, z - facing * 0.04);
  }
  place(decal(0.032, MOUTH, 1.5, 0.7, 12), 0, eyeY - 0.15, facing * HEAD_R * 0.88);

  return g;
}

/** A short jersey sleeve cap (a rounded deltoid) for a shoulder. */
function sleeve(colors: ChibiColors): THREE.Group {
  return outlined(new THREE.SphereGeometry(0.14, 16, 12), colors.jersey, 0.016);
}

/** Pitcher: faces +Z (toward the batter/camera). A small rig the GameScene
 * animates into a full delivery — named pivots: "frontLeg"/"backLeg" (with
 * "frontShin"/"backShin" knees), "body" (trunk lean + twist), and "arm" (the
 * throwing arm at the shoulder) holding "armBall" (hidden by default). */
export function makeChibiPitcher(colors: ChibiColors): THREE.Group {
  const g = new THREE.Group();
  const hip = HIP_Y;

  g.add(groundShadow());

  // legs (hip pivots), planted at rest
  const backLeg = jointedLeg("backShin", colors.trim);
  backLeg.name = "backLeg";
  backLeg.position.set(-0.17, hip, -0.04);
  g.add(backLeg);

  const frontLeg = jointedLeg("frontShin", colors.trim);
  frontLeg.name = "frontLeg";
  frontLeg.position.set(0.17, hip, 0.04);
  g.add(frontLeg);

  // upper body pivots at the hips so it can lean and twist over the legs
  const body = new THREE.Group();
  body.name = "body";
  body.position.set(0, hip, 0);

  buildTorso(body, colors, hip, 1);

  const head = headWithCap(colors, 1, false);
  head.position.y = -hip; // re-base absolute head positions onto the hip pivot
  body.add(head);

  // glove arm (static), on the figure's right: sleeve, forearm and a fielding mitt
  const gloveSleeve = sleeve(colors);
  gloveSleeve.position.set(0.34, 0.86 - hip, 0.04);
  body.add(gloveSleeve);
  const gloveArm = outlined(new THREE.CapsuleGeometry(0.085, 0.3, 6, 12), SKIN, 0.018);
  gloveArm.position.set(0.42, 0.66 - hip, 0.06);
  gloveArm.rotation.z = -0.5;
  body.add(gloveArm);
  const mitt = outlined(new RoundedBoxGeometry(0.22, 0.24, 0.13, 4, 0.08), colors.trim, 0.016);
  mitt.position.set(0.54, 0.48 - hip, 0.12);
  body.add(mitt);

  // throwing arm (left-handed): pivot at the left shoulder, hangs down at rest
  const arm = new THREE.Group();
  arm.name = "arm";
  arm.position.set(-0.38, 0.92 - hip, 0);
  const armSleeve = sleeve(colors);
  armSleeve.position.set(0, -0.02, 0);
  arm.add(armSleeve);
  const upper = outlined(new THREE.CapsuleGeometry(0.085, 0.34, 6, 12), SKIN, 0.018);
  upper.position.set(0, -0.22, 0);
  arm.add(upper);
  const hand = outlined(new THREE.SphereGeometry(0.1, 14, 12), SKIN, 0.016);
  hand.position.set(0, -0.44, 0);
  arm.add(hand);
  const armBall = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), toon(0xffffff));
  armBall.name = "armBall";
  armBall.position.set(0, -0.5, 0.06);
  armBall.visible = false;
  arm.add(armBall);
  body.add(arm);

  g.add(body);
  return g;
}

/** A bold, clearly readable bat: dark knob, a wood handle wrapped in grip tape, and
 * a light wood barrel — every solid piece outlined. Pivot is at the hands (y = 0);
 * the barrel points up. Rest pose cocks it up and back over the shoulder. */
function makeBat(dir: number): THREE.Group {
  const bat = new THREE.Group();
  bat.name = "bat";

  const knob = outlined(new THREE.SphereGeometry(0.062, 14, 12), WOOD_DARK, 0.012);
  bat.add(knob);
  const handle = outlined(new THREE.CylinderGeometry(0.05, 0.055, 0.36, 14), WOOD_DARK, 0.012);
  handle.position.y = 0.2;
  bat.add(handle);
  // grip tape over the lower handle (sits inside the handle's outline)
  const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.058, 0.2, 14), toon(GRIP_TAPE));
  tape.position.y = 0.12;
  bat.add(tape);
  const barrel = outlined(new THREE.CapsuleGeometry(0.088, 0.66, 8, 16), WOOD, 0.016);
  barrel.position.y = 0.74;
  bat.add(barrel);

  // marker at the end of the barrel so the GameScene can trace the swing arc
  const tip = new THREE.Object3D();
  tip.name = "batTip";
  tip.position.y = 1.14;
  bat.add(tip);

  // Stood up off the back shoulder and canted toward the camera so the whole shaft
  // clears the oversized chibi head (otherwise the head occludes the bat's middle
  // from the behind-the-plate view, splitting it into a floating barrel + handle).
  // Matches the swing's t=0 rest pose so the bat doesn't pop when a swing starts
  // (see SWING in GameScene).
  bat.rotation.z = dir * -0.55;
  bat.rotation.x = 0.3;
  return bat;
}

/** Batter: back to the camera (faces −Z toward the pitcher), wears a helmet, and
 * is fully rigged like the pitcher — named pivots "frontLeg"/"backLeg" (with
 * "frontShin"/"backShin" knees) for the stride/leg-lift, "body" (trunk rotation
 * and lean) holding the head/torso, and "bat" (pivot at the hands) for the load
 * and swing arc. */
export function makeChibiBatter(colors: ChibiColors, batsLeft: boolean): THREE.Group {
  const g = new THREE.Group();
  const hip = HIP_Y;
  const dir = batsLeft ? -1 : 1;

  g.add(groundShadow());

  // jointed legs: the front (stride) leg lifts before the swing fires
  const backLeg = jointedLeg("backShin", colors.trim);
  backLeg.name = "backLeg";
  backLeg.position.set(dir * 0.18, hip, 0.05);
  g.add(backLeg);

  const frontLeg = jointedLeg("frontShin", colors.trim);
  frontLeg.name = "frontLeg";
  frontLeg.position.set(-dir * 0.18, hip, -0.05);
  g.add(frontLeg);

  // upper body pivots at the hips so the swing rotates the whole trunk (轉身)
  const body = new THREE.Group();
  body.name = "body";
  body.position.set(0, hip, 0);

  buildTorso(body, colors, hip, -1);

  const head = headWithCap(colors, -1, true);
  head.position.y = -hip; // re-base absolute head positions onto the hip pivot
  // The body is bladed toward the plate (see the group turn below); swivel the
  // head most of the way back off the chest so the batter watches the pitcher up
  // the line. From the behind-the-plate camera that shows the back/side of the
  // helmet with the face only peeking in profile. Sign follows the bat hand.
  head.rotation.y = dir * 1.1;
  body.add(head);

  // short jersey sleeves at both shoulders
  for (const sx of [-1, 1]) {
    const s = sleeve(colors);
    s.position.set(sx * 0.32, 0.88 - hip, 0);
    body.add(s);
  }

  // both fists grip near the back shoulder
  const topFist = outlined(new THREE.SphereGeometry(0.1, 14, 12), SKIN, 0.016);
  topFist.position.set(dir * 0.34, 0.9 - hip, 0.08);
  body.add(topFist);
  const bottomFist = outlined(new THREE.SphereGeometry(0.1, 14, 12), SKIN, 0.016);
  bottomFist.position.set(dir * 0.42, 0.78 - hip, 0.06);
  body.add(bottomFist);

  const bat = makeBat(dir);
  bat.position.set(dir * 0.34, 0.9 - hip, 0.08);
  body.add(bat);

  g.add(body);

  // Turn the whole figure side-on so it takes a real batting stance: chest facing
  // the plate (the +X plate side for a RH batter at −X, −X for a LH batter at +X)
  // rather than squared chest-on to the pitcher. This also lays the two feet along
  // the Z axis — parallel to the long axis of the batter's box — with the front
  // leg toward the pitcher (−Z) and the bat cocked back over the rear shoulder
  // (toward +Z / the camera). The swing's trunk + bat rotations compose on top of
  // this base turn, so the cut still opens out through the ball.
  g.rotation.y = -dir * (Math.PI / 2);
  return g;
}
