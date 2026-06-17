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

/** Legs + torso shared by both poses. */
function lowerBody(colors: ChibiColors): THREE.Group {
  const g = new THREE.Group();

  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.36, 16), toon(PANTS));
    leg.position.set(sx * 0.16, 0.18, 0);
    g.add(leg);
  }

  const torso = outlined(new THREE.BoxGeometry(0.64, 0.58, 0.38), colors.jersey);
  torso.position.set(0, 0.66, 0);
  g.add(torso);

  // belt
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.1, 0.4), toon(colors.trim));
  belt.position.set(0, 0.4, 0);
  g.add(belt);

  return g;
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

/** Pitcher: faces +Z (toward the batter/camera). The throwing arm is a named
 * pivot ("arm") at the shoulder, holding a ball ("armBall", hidden by default). */
export function makeChibiPitcher(colors: ChibiColors): THREE.Group {
  const g = new THREE.Group();
  g.add(lowerBody(colors));
  g.add(headWithCap(colors, 1, false));

  // glove arm (static), on the figure's left
  const glove = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.34, 6, 12), toon(SKIN));
  glove.position.set(-0.4, 0.7, 0.04);
  glove.rotation.z = 0.5;
  g.add(glove);

  // throwing arm: pivot at the right shoulder, hangs down at rest
  const arm = new THREE.Group();
  arm.name = "arm";
  arm.position.set(0.38, 0.92, 0);
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
  g.add(arm);

  return g;
}

/** Batter: back to the camera (faces −Z toward the pitcher), wears a helmet, and
 * holds a bat on a named pivot ("bat") at the hands so the swing can rotate it. */
export function makeChibiBatter(colors: ChibiColors, batsLeft: boolean): THREE.Group {
  const g = new THREE.Group();
  g.add(lowerBody(colors));
  g.add(headWithCap(colors, -1, true));

  // jersey number plate on the back (faces the camera, +Z)
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.04), toon(0xffffff));
  plate.position.set(0, 0.72, 0.2);
  g.add(plate);

  const dir = batsLeft ? -1 : 1;

  // both hands grip near the back shoulder
  const grip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 12), toon(SKIN));
  grip.position.set(dir * 0.34, 0.9, 0.08);
  g.add(grip);

  // bat: pivot at the hands; at rest it points up and slightly back over the shoulder
  const bat = new THREE.Group();
  bat.name = "bat";
  bat.position.set(dir * 0.34, 0.9, 0.08);
  const barrel = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.95, 6, 12), toon(0xd9a05b));
  barrel.position.set(0, 0.5, 0);
  bat.add(barrel);
  // rest pose: cocked up and back over the shoulder
  bat.rotation.z = dir * 0.5;
  bat.rotation.x = 0.35;
  g.add(bat);

  return g;
}
