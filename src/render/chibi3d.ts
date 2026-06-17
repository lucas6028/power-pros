import * as THREE from "three";
import type { ChibiColors } from "./chibi";

/** True-3D chibi figures built from primitives, honouring the Power Pros style:
 * oversized head (~half the total height), dot eyes, no nose, bold dark outline,
 * flat toon shading. Figures stand with their origin at the feet (y = 0).
 *
 * Sub-groups are named to mirror the 2D Pixi labels so the GameScene animation
 * code can grab them with getObjectByName: "arm" (pitcher) holding "armBall",
 * and "bat" (batter). */

const SKIN = 0xfbd7a0;
const SKIN_SHADE = 0xf0b97a;
const OUTLINE = 0x3a2620;
const PANTS = 0xffffff;

const HEAD_R = 0.42;
const HEAD_Y = 1.18;

function toon(color: number): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color });
}

/** A mesh wrapped with a cheap inverted-hull dark outline (bold chibi look). */
function outlined(geo: THREE.BufferGeometry, color: number, outline = 1.09): THREE.Group {
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(geo, toon(color)));
  const shell = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: OUTLINE, side: THREE.BackSide }),
  );
  shell.scale.setScalar(outline);
  grp.add(shell);
  return grp;
}

/** Head with cap; `facing` is +1 to face +Z (camera) or −1 to face −Z (pitcher).
 * `helmet` draws a fuller batting helmet instead of a ball cap. */
function headWithCap(colors: ChibiColors, facing: 1 | -1, helmet: boolean): THREE.Group {
  const g = new THREE.Group();

  const head = outlined(new THREE.SphereGeometry(HEAD_R, 24, 20), helmet ? SKIN_SHADE : SKIN);
  head.position.set(0, HEAD_Y, 0);
  g.add(head);

  // ears
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), toon(SKIN));
    ear.position.set(sx * HEAD_R * 0.96, HEAD_Y - 0.02, 0);
    g.add(ear);
  }

  // cap / helmet dome over the top hemisphere of the head
  const domeR = HEAD_R * (helmet ? 1.06 : 1.02);
  const domeTheta = helmet ? Math.PI * 0.72 : Math.PI * 0.5;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(domeR, 24, 18, 0, Math.PI * 2, 0, domeTheta),
    toon(colors.cap),
  );
  dome.position.set(0, HEAD_Y, helmet ? 0 : 0.02);
  g.add(dome);

  if (!helmet) {
    // ball-cap brim jutting toward the face side
    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 0.04, 20, 1, false, 0, Math.PI),
      toon(colors.cap),
    );
    brim.position.set(0, HEAD_Y + 0.06, facing * (HEAD_R + 0.04));
    brim.rotation.x = Math.PI / 2;
    brim.rotation.z = facing > 0 ? 0 : Math.PI;
    g.add(brim);
    // button
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), toon(colors.cap));
    btn.position.set(0, HEAD_Y + domeR, 0);
    g.add(btn);
  }

  // face: dot eyes + blush, only on the camera-facing side (pitcher / menus)
  if (facing > 0) {
    for (const sx of [-1, 1]) {
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 12), toon(0xffffff));
      white.position.set(sx * 0.16, HEAD_Y + 0.02, HEAD_R * 0.86);
      white.scale.set(0.8, 1.1, 0.5);
      g.add(white);
      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0x4a3aa8 }),
      );
      pupil.position.set(sx * 0.16, HEAD_Y + 0.01, HEAD_R * 0.92);
      pupil.scale.set(0.8, 1.1, 0.5);
      g.add(pupil);
      const blush = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xf5a8a0 }),
      );
      blush.position.set(sx * 0.27, HEAD_Y - 0.14, HEAD_R * 0.82);
      blush.scale.set(1.1, 0.5, 0.4);
      g.add(blush);
    }
  }

  return g;
}

/** Hip height of both rigs: the legs pivot here and the upper body pivots here so
 * the GameScene can drive a real delivery / swing (leg lift, stride, trunk
 * rotation, arm whip or bat sweep). */
const HIP_Y = 0.42;

/** One jointed leg: a thigh on a hip pivot and a shin/foot on a knee pivot. The
 * returned shin group is named so the knee can be bent independently. Shared by
 * the pitcher (delivery) and the batter (stride / leg lift). */
function jointedLeg(shinName: string): THREE.Group {
  const leg = new THREE.Group(); // pivot at the hip
  const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.18, 6, 12), toon(PANTS));
  thigh.position.y = -0.12;
  leg.add(thigh);

  const shin = new THREE.Group(); // pivot at the knee
  shin.name = shinName;
  shin.position.y = -0.24;
  const calf = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.16, 6, 12), toon(PANTS));
  calf.position.y = -0.1;
  shin.add(calf);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.07, 0.24), toon(OUTLINE));
  foot.position.set(0, -0.21, 0.05);
  shin.add(foot);
  leg.add(shin);

  return leg;
}

/** Pitcher: faces +Z (toward the batter/camera). A small rig the GameScene
 * animates into a full delivery — named pivots: "frontLeg"/"backLeg" (with
 * "frontShin"/"backShin" knees), "body" (trunk lean + twist), and "arm" (the
 * throwing arm at the shoulder) holding "armBall" (hidden by default). */
export function makeChibiPitcher(colors: ChibiColors): THREE.Group {
  const g = new THREE.Group();
  const hip = HIP_Y;

  // legs (hip pivots), planted at rest
  const backLeg = jointedLeg("backShin");
  backLeg.name = "backLeg";
  backLeg.position.set(-0.17, hip, -0.04);
  g.add(backLeg);

  const frontLeg = jointedLeg("frontShin");
  frontLeg.name = "frontLeg";
  frontLeg.position.set(0.17, hip, 0.04);
  g.add(frontLeg);

  // upper body pivots at the hips so it can lean and twist over the legs
  const body = new THREE.Group();
  body.name = "body";
  body.position.set(0, hip, 0);

  const torso = outlined(new THREE.BoxGeometry(0.64, 0.58, 0.38), colors.jersey);
  torso.position.set(0, 0.66 - hip, 0);
  body.add(torso);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.1, 0.4), toon(colors.trim));
  belt.position.set(0, 0.4 - hip, 0);
  body.add(belt);

  const head = headWithCap(colors, 1, false);
  head.position.y = -hip; // re-base absolute head positions onto the hip pivot
  body.add(head);

  // glove arm (static), on the figure's right
  const glove = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.34, 6, 12), toon(SKIN));
  glove.position.set(0.4, 0.7 - hip, 0.04);
  glove.rotation.z = -0.5;
  body.add(glove);

  // throwing arm (left-handed): pivot at the left shoulder, hangs down at rest
  const arm = new THREE.Group();
  arm.name = "arm";
  arm.position.set(-0.38, 0.92 - hip, 0);
  const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.34, 6, 12), toon(SKIN));
  upper.position.set(0, -0.22, 0);
  arm.add(upper);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 12), toon(SKIN));
  hand.position.set(0, -0.44, 0);
  arm.add(hand);
  const armBall = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 12), toon(0xffffff));
  armBall.name = "armBall";
  armBall.position.set(0, -0.5, 0.06);
  armBall.visible = false;
  arm.add(armBall);
  body.add(arm);

  g.add(body);
  return g;
}

/** A bold, clearly readable bat: dark handle + knob and a light wood barrel with
 * an inverted-hull outline. Pivot is at the hands (y = 0); the barrel points up.
 * Rest pose cocks it up and back over the shoulder. */
function makeBat(dir: number): THREE.Group {
  const bat = new THREE.Group();
  bat.name = "bat";

  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), toon(0x8a5a2b));
  bat.add(knob);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.34, 12), toon(0x8a5a2b));
  handle.position.y = 0.18;
  bat.add(handle);
  const barrel = outlined(new THREE.CapsuleGeometry(0.085, 0.66, 8, 14), 0xe7b277, 1.12);
  barrel.position.y = 0.74;
  bat.add(barrel);

  bat.rotation.z = dir * 0.5;
  bat.rotation.x = 0.35;
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

  // jointed legs: the front (stride) leg lifts before the swing fires
  const backLeg = jointedLeg("backShin");
  backLeg.name = "backLeg";
  backLeg.position.set(dir * 0.18, hip, 0.05);
  g.add(backLeg);

  const frontLeg = jointedLeg("frontShin");
  frontLeg.name = "frontLeg";
  frontLeg.position.set(-dir * 0.18, hip, -0.05);
  g.add(frontLeg);

  // upper body pivots at the hips so the swing rotates the whole trunk (轉身)
  const body = new THREE.Group();
  body.name = "body";
  body.position.set(0, hip, 0);

  const torso = outlined(new THREE.BoxGeometry(0.64, 0.58, 0.38), colors.jersey);
  torso.position.set(0, 0.66 - hip, 0);
  body.add(torso);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.1, 0.4), toon(colors.trim));
  belt.position.set(0, 0.4 - hip, 0);
  body.add(belt);

  const head = headWithCap(colors, -1, true);
  head.position.y = -hip; // re-base absolute head positions onto the hip pivot
  body.add(head);

  // jersey number plate on the back (faces the camera, +Z)
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.04), toon(0xffffff));
  plate.position.set(0, 0.72 - hip, 0.2);
  body.add(plate);

  // both hands grip near the back shoulder
  const grip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 12), toon(SKIN));
  grip.position.set(dir * 0.34, 0.9 - hip, 0.08);
  body.add(grip);

  const bat = makeBat(dir);
  bat.position.set(dir * 0.34, 0.9 - hip, 0.08);
  body.add(bat);

  g.add(body);
  return g;
}
