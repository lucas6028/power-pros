import * as THREE from "three";
import { GAME_W, GAME_H } from "../scenes/scene";

/** Shared world coordinate system for the 3D game (arcade units ≈ metres).
 * Home plate is the origin, the pitcher is toward −Z, +Y is up, and the camera
 * sits behind the batter looking down −Z — the "camera behind the batter" pillar. */
export const WORLD = {
  /** Strike-zone plane sits over the plate. */
  zoneZ: 0,
  zoneCenterY: 1.05,
  /** World half-extent per strike-zone unit (zone box is ±1 unit). */
  zoneUnit: 0.34,
  /** Ball release point near the pitcher's hand. */
  release: new THREE.Vector3(0.18, 1.95, -15.2),
  moundZ: -16,
  batterZ: 0.75,
  batterX: 0.9,
  plateY: 0.02,
} as const;

const COLORS = {
  grass: 0x57b368,
  grassStripe: 0x4ea65e,
  dirt: 0xd9a36b,
  dirtDark: 0xc89058,
  wall: 0x2e6b46,
  wallLine: 0xf2e94e,
  white: 0xffffff,
};

/** A flat XZ surface (lies in the ground plane). */
function ground(geo: THREE.BufferGeometry, color: number, y: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  return m;
}

/** Build the perspective camera framed behind the batter. */
export function makeCamera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(50, GAME_W / GAME_H, 0.1, 400);
  cam.position.set(0, 2.5, 4.6);
  cam.lookAt(0, 1.05, -8);
  return cam;
}

/** Behind-the-batter ballpark: grass, infield dirt, mound, plate, batter's boxes,
 * outfield wall, plus ambient + directional lighting. */
export function buildField(): THREE.Group {
  const g = new THREE.Group();

  // outfield grass
  const grass = ground(new THREE.PlaneGeometry(160, 180), COLORS.grass, 0);
  grass.position.z = -45;
  g.add(grass);
  // mowing stripes running across the outfield
  for (let i = 0; i < 7; i++) {
    const stripe = ground(new THREE.PlaneGeometry(160, 6), COLORS.grassStripe, 0.005);
    stripe.position.z = -20 - i * 9;
    g.add(stripe);
  }

  // Infield skin shaped as a dirt diamond so the mound reads as the *centre* of
  // the infield with second base behind the pitcher — not at the back edge where
  // it used to look like the pitcher was standing on second. Base positions are
  // an arcade-compressed real diamond: home at the origin, the mound at
  // WORLD.moundZ (~−16), second base well beyond it. A Shape point (sx, sy) maps
  // to world (sx, 0, −sy) after the −90° lay-flat rotation.
  const skin = new THREE.Shape();
  skin.moveTo(0, -2.5); // home-plate corner (world z = +2.5)
  skin.lineTo(16, 13); // first-base corner (world 16, −13)
  skin.lineTo(0, 29.5); // second-base corner (world 0, −29.5)
  skin.lineTo(-16, 13); // third-base corner (world −16, −13)
  skin.closePath();
  const infield = new THREE.Mesh(
    new THREE.ShapeGeometry(skin),
    new THREE.MeshLambertMaterial({ color: COLORS.dirt }),
  );
  infield.rotation.x = -Math.PI / 2;
  infield.position.y = 0.01;
  g.add(infield);
  // dirt circle around home so the batter's/catcher's area stays skinned
  const homeDirt = ground(new THREE.CircleGeometry(5, 32), COLORS.dirt, 0.011);
  g.add(homeDirt);

  // foul lines: chalk running from home out past first and third base
  const chalk = new THREE.LineBasicMaterial({ color: COLORS.white });
  for (const sx of [-1, 1]) {
    const pts = [new THREE.Vector3(0, 0.04, 0), new THREE.Vector3(sx * 30, 0.04, -30)];
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), chalk));
  }

  // bases: white bags at first / second / third (second sits behind the mound)
  const baseMat = new THREE.MeshLambertMaterial({ color: COLORS.white });
  const baseSpots: Array<[number, number]> = [
    [13, -13],
    [0, -26],
    [-13, -13],
  ];
  for (const [bx, bz] of baseSpots) {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.6), baseMat);
    bag.rotation.y = Math.PI / 4; // diamond-oriented bag
    bag.position.set(bx, 0.05, bz);
    g.add(bag);
  }

  // pitcher's mound — centred in the infield, second base visible behind it
  const mound = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 2.8, 0.3, 32),
    new THREE.MeshLambertMaterial({ color: COLORS.dirtDark }),
  );
  mound.position.set(0, 0.15, WORLD.moundZ);
  g.add(mound);
  const rubber = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.06, 0.15),
    new THREE.MeshLambertMaterial({ color: COLORS.white }),
  );
  rubber.position.set(0, 0.32, WORLD.moundZ + 0.3);
  g.add(rubber);

  // home plate (pentagon, point toward the catcher/camera)
  const h = 0.22;
  const plateShape = new THREE.Shape();
  plateShape.moveTo(-h, -h);
  plateShape.lineTo(h, -h);
  plateShape.lineTo(h, h * 0.3);
  plateShape.lineTo(0, h);
  plateShape.lineTo(-h, h * 0.3);
  plateShape.closePath();
  const plate = new THREE.Mesh(
    new THREE.ShapeGeometry(plateShape),
    new THREE.MeshLambertMaterial({ color: COLORS.white }),
  );
  plate.rotation.x = -Math.PI / 2;
  plate.position.y = WORLD.plateY;
  g.add(plate);

  // batter's boxes: thin white outlines flanking the plate
  const boxMat = new THREE.LineBasicMaterial({ color: COLORS.white });
  for (const sx of [-1, 1]) {
    const bw = 0.7;
    const bd = 1.4;
    const cx = sx * 1.0;
    const pts = [
      new THREE.Vector3(cx - bw / 2, 0.03, -bd / 2),
      new THREE.Vector3(cx + bw / 2, 0.03, -bd / 2),
      new THREE.Vector3(cx + bw / 2, 0.03, bd / 2),
      new THREE.Vector3(cx - bw / 2, 0.03, bd / 2),
      new THREE.Vector3(cx - bw / 2, 0.03, -bd / 2),
    ];
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), boxMat));
  }

  // outfield wall + yellow top line
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(150, 4, 0.6),
    new THREE.MeshLambertMaterial({ color: COLORS.wall }),
  );
  wall.position.set(0, 2, -62);
  g.add(wall);
  const topLine = new THREE.Mesh(
    new THREE.BoxGeometry(150, 0.4, 0.7),
    new THREE.MeshLambertMaterial({ color: COLORS.wallLine }),
  );
  topLine.position.set(0, 4, -62);
  g.add(topLine);

  // lighting: a softer ambient floor (down from a flat 1.35) lets the key light
  // carve a clean cel shadow on the toon-shaded chibis, while a cool rim from
  // behind home keeps the shadow side from going dead and lifts the figures off
  // the field.
  g.add(new THREE.AmbientLight(0xffffff, 0.8));
  const sun = new THREE.DirectionalLight(0xfff4e2, 1.35);
  sun.position.set(-8, 20, 6);
  g.add(sun);
  const rim = new THREE.DirectionalLight(0xcfe8ff, 0.4);
  rim.position.set(7, 9, 10);
  g.add(rim);

  return g;
}
