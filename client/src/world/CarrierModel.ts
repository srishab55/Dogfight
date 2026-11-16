import type { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import type { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import type { CarrierDefinition } from '@dogfight/shared';
import { CARRIER_VISUAL_CONFIG } from '../config/graphics';
import { TEAM_PAINT } from '../config/aircraftVisuals';
import { degreesToRadians } from '../math/orientation';
import { createQuadMesh } from '../rendering/geometry';
import { createPbrSurface } from '../rendering/materials';

/**
 * An anchored aircraft carrier, built from its gameplay definition
 * (shared/src/config/world.ts), so the deck you see is exactly the deck the
 * flight model lands on, and the island is where the physics' solid block is.
 *
 * Local frame: origin at the centre of the flight deck at deck height, +Z
 * towards the bow, +X to starboard (right). Five merged meshes: hull, deck,
 * island and fittings, dark details, team colours.
 */
export function createCarrierModel(scene: Scene, carrier: CarrierDefinition): TransformNode {
  const config = CARRIER_VISUAL_CONFIG;
  const name = carrier.id;
  const root = new TransformNode(name, scene);
  root.position.set(carrier.center.x, carrier.center.y, carrier.center.z);
  root.rotation.y = degreesToRadians(carrier.headingDegrees);

  const hullMaterial = createPbrSurface(scene, `${name}-hull`, { color: config.hullColor, roughness: 0.7 });
  const islandMaterial = createPbrSurface(scene, `${name}-island`, { color: config.islandColor, roughness: 0.65 });
  const darkMaterial = createPbrSurface(scene, `${name}-dark`, { color: config.darkColor, roughness: 0.6 });
  const teamMaterial = createPbrSurface(scene, `${name}-team`, { color: TEAM_PAINT[carrier.team].accent, roughness: 0.5 });

  const hull = merge(`${name}-hull`, [buildHull(scene, carrier), buildDeckSlab(scene, carrier)], hullMaterial);
  const deck = buildDeckSurface(scene, carrier);
  const island = merge(`${name}-island`, buildIsland(scene, carrier), islandMaterial);
  const dark = merge(`${name}-fittings`, [...buildWires(scene, carrier), ...buildGunTubs(scene, carrier), ...buildIslandDetails(scene, carrier), buildCatapultTrack(scene, carrier)], darkMaterial);
  const team = merge(`${name}-team-colours`, buildTeamMarkings(scene, carrier), teamMaterial);

  for (const mesh of [hull, deck, island, dark, team]) {
    mesh.parent = root;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
  }
  root.getChildMeshes().forEach((mesh) => mesh.freezeWorldMatrix());
  return root;
}

function merge(name: string, parts: Mesh[], material: Material): Mesh {
  const merged = Mesh.MergeMeshes(parts, true, true);
  if (!merged) throw new Error(`Failed to merge carrier parts for "${name}"`);
  merged.name = name;
  merged.material = material;
  return merged;
}

/** Distance from the stern (m) to the model's local Z. */
const alongDeck = (carrier: CarrierDefinition, fromStern: number) => fromStern - carrier.deckLength / 2;

/**
 * The hull: stations from the stern transom to a pointed bow, each a
 * trapezoid that narrows towards the keel. The flight deck overhangs it, as
 * on real carriers. It runs below the waterline (the sea hides that part).
 */
function buildHull(scene: Scene, carrier: CarrierDefinition): Mesh {
  const config = CARRIER_VISUAL_CONFIG;
  const halfBeam = carrier.deckWidth * 0.4;
  const top = -config.deckThickness;
  const bottom = -(carrier.freeboard + config.draft);
  // [fraction from stern to bow, beam fraction at the top, beam fraction at the keel]
  const stations: ReadonlyArray<readonly [number, number, number]> = [
    [0, 0.78, 0.55],
    [0.12, 0.98, 0.78],
    [0.6, 1, 0.8],
    [0.82, 0.72, 0.45],
    [0.95, 0.28, 0.12],
    [1.04, 0.03, 0.02],
  ];
  const rings = stations.map(([s, topBeam, keelBeam]) => {
    const z = alongDeck(carrier, s * carrier.deckLength);
    return [new Vector3(-halfBeam * topBeam, top, z), new Vector3(halfBeam * topBeam, top, z), new Vector3(halfBeam * keelBeam, bottom, z), new Vector3(-halfBeam * keelBeam, bottom, z)];
  });
  const quads: Vector3[][] = [];
  for (let i = 1; i < rings.length; i++) {
    const a = rings[i - 1] as Vector3[];
    const b = rings[i] as Vector3[];
    for (let k = 0; k < 4; k++) quads.push([a[k] as Vector3, a[(k + 1) % 4] as Vector3, b[(k + 1) % 4] as Vector3, b[k] as Vector3]);
  }
  quads.push(rings[0] as Vector3[]); // stern transom
  quads.push(rings[rings.length - 1] as Vector3[]); // bow tip
  return createQuadMesh(`${carrier.id}-hull`, scene, quads, new Vector3(0, (top + bottom) / 2, 0));
}

/** The flight deck's thickness: a slab just under the painted deck surface (a few cm lower, so the two never flicker). */
function buildDeckSlab(scene: Scene, carrier: CarrierDefinition): Mesh {
  const thickness = CARRIER_VISUAL_CONFIG.deckThickness;
  const slab = CreateBox(`${carrier.id}-deck-slab`, { width: carrier.deckWidth, height: thickness, depth: carrier.deckLength }, scene);
  slab.position.y = -thickness / 2 - 0.03;
  return slab;
}

/**
 * The flight deck's surface: a plane with a painted texture (planking,
 * centreline, edge lines, wire zone, hull number). On a ground plane the
 * canvas's x runs across the deck (port at the left) and its top is the bow.
 */
function buildDeckSurface(scene: Scene, carrier: CarrierDefinition): Mesh {
  const deck = CreateGround(`${carrier.id}-deck`, { width: carrier.deckWidth, height: carrier.deckLength, subdivisions: 1 }, scene);
  const material = new PBRMaterial(`${carrier.id}-deck-material`, scene);
  material.albedoTexture = createDeckTexture(scene, carrier);
  material.roughness = 0.85;
  material.metallic = 0;
  deck.material = material;
  return deck;
}

/** Deck markings, drawn on a canvas: x across the deck from port to starboard, y from the bow (top) to the stern. */
function createDeckTexture(scene: Scene, carrier: CarrierDefinition): DynamicTexture {
  const config = CARRIER_VISUAL_CONFIG;
  const scale = config.deckTexturePixelsPerMetre;
  const width = Math.round(carrier.deckWidth * scale);
  const height = Math.round(carrier.deckLength * scale);
  const texture = new DynamicTexture(`${carrier.id}-deck-texture`, { width, height }, scene, true);
  // In the browser this is a real 2D canvas context; Babylon's own interface omits text alignment.
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  /** Canvas y for a distance from the stern (the canvas runs bow at the top). */
  const yAt = (fromStern: number) => (carrier.deckLength - fromStern) * scale;

  ctx.fillStyle = config.deckColor;
  ctx.fillRect(0, 0, width, height);
  // Planks run fore and aft: alternate strakes slightly darker, with staggered butt joints.
  ctx.fillStyle = config.deckPlankColor;
  const strake = Math.max(2, Math.round(0.6 * scale));
  for (let x = 0, i = 0; x < width; x += strake, i++) {
    if (i % 2 === 0) ctx.fillRect(x, 0, strake, height);
    for (let y = ((i * 37) % 23) * scale; y < height; y += 23 * scale) ctx.fillRect(x, y, strake, 1);
  }
  ctx.fillStyle = config.deckMarkingColor;
  // Dashed centreline, and edge lines along both sides.
  for (let y = 0; y < height; y += 10 * scale) ctx.fillRect(width / 2 - 0.4 * scale, y, 0.8 * scale, 5 * scale);
  ctx.fillRect(1 * scale, 0, 0.5 * scale, height);
  ctx.fillRect(width - 1.5 * scale, 0, 0.5 * scale, height);
  // Stern "round-down" stripes, and a line across the deck at each end of the wire zone.
  for (let i = 0; i < 4; i++) ctx.fillRect(0, yAt(1 + i * 2), width, 0.6 * scale);
  ctx.fillRect(0, yAt(carrier.wires.from), width, 0.4 * scale);
  ctx.fillRect(0, yAt(carrier.wires.to), width, 0.4 * scale);
  // Hull number near the bow. Its top faces the bow, so it reads upright on approach from astern.
  ctx.save();
  ctx.translate(width / 2, yAt(carrier.deckLength - config.deckNumberFromBow));
  ctx.font = `bold ${Math.round(14 * scale)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(carrier.team === 'blue' ? '7' : '3', 0, 0);
  ctx.restore();
  texture.update(false);
  return texture;
}

/** The arrestor wires: dark cables a few centimetres above the deck, evenly spread across the wire zone. */
function buildWires(scene: Scene, carrier: CarrierDefinition): Mesh[] {
  const { from, to, count } = carrier.wires;
  return Array.from({ length: count }, (_, i) => {
    const wire = CreateCylinder(`wire-${i}`, { height: carrier.deckWidth * 0.8, diameter: 0.08, tessellation: 4 }, scene);
    wire.rotation.z = Math.PI / 2; // lie across the deck
    wire.position.set(0, 0.06, alongDeck(carrier, from + ((to - from) * i) / Math.max(1, count - 1)));
    return wire;
  });
}

/** The catapult: a dark slot along the deck centreline at the bow. */
function buildCatapultTrack(scene: Scene, carrier: CarrierDefinition): Mesh {
  const { from, to } = carrier.catapult;
  const track = CreateBox('catapult', { width: 0.5, height: 0.04, depth: to - from }, scene);
  track.position.set(0, 0.02, alongDeck(carrier, (from + to) / 2));
  return track;
}

/** The island: bridge block, a taller superstructure, and a raked funnel, on the starboard side. */
function buildIsland(scene: Scene, carrier: CarrierDefinition): Mesh[] {
  const island = carrier.island;
  const z = alongDeck(carrier, island.along);
  const base = CreateBox('island-base', { width: island.width, height: island.height * 0.45, depth: island.length }, scene);
  base.position.set(island.across, (island.height * 0.45) / 2, z);
  const bridge = CreateBox('island-bridge', { width: island.width * 0.9, height: island.height * 0.3, depth: island.length * 0.45 }, scene);
  bridge.position.set(island.across, island.height * 0.6, z + island.length * 0.22);
  const funnel = CreateBox('island-funnel', { width: island.width * 0.75, height: island.height * 0.4, depth: island.length * 0.32 }, scene);
  funnel.position.set(island.across, island.height * 0.62, z - island.length * 0.15);
  funnel.rotation.x = degreesToRadians(-10); // raked aft
  return [base, bridge, funnel];
}

/** Mast, radar and the funnel cap. */
function buildIslandDetails(scene: Scene, carrier: CarrierDefinition): Mesh[] {
  const island = carrier.island;
  const z = alongDeck(carrier, island.along);
  const mast = CreateCylinder('mast', { height: island.height * 0.55, diameterTop: 0.25, diameterBottom: 0.5, tessellation: 6 }, scene);
  mast.position.set(island.across, island.height * 0.75 + island.height * 0.27, z + island.length * 0.08);
  const radar = CreateBox('radar', { width: 4, height: 1.6, depth: 0.3 }, scene);
  radar.position.set(island.across, island.height * 1.15, z + island.length * 0.08);
  const cap = CreateBox('funnel-cap', { width: island.width * 0.7, height: 0.4, depth: island.length * 0.28 }, scene);
  cap.position.set(island.across, island.height * 0.83, z - island.length * 0.2);
  return [mast, radar, cap];
}

/** Anti-aircraft gun tubs along both deck edges. */
function buildGunTubs(scene: Scene, carrier: CarrierDefinition): Mesh[] {
  const tubs: Mesh[] = [];
  for (const side of [1, -1]) {
    for (const fromStern of [20, 60, 110, 190, 235]) {
      const tub = CreateCylinder(`gun-tub-${side}-${fromStern}`, { height: 1.4, diameter: 3.2, tessellation: 10 }, scene);
      tub.position.set(side * (carrier.deckWidth / 2 + 1.2), -1.4, alongDeck(carrier, fromStern));
      tubs.push(tub);
    }
  }
  return tubs;
}

/** A team-coloured band round the funnel, so you can tell friend from foe at a glance. */
function buildTeamMarkings(scene: Scene, carrier: CarrierDefinition): Mesh[] {
  const island = carrier.island;
  const z = alongDeck(carrier, island.along);
  const band = CreateBox('funnel-band', { width: island.width * 0.78, height: 1.4, depth: island.length * 0.35 }, scene);
  band.position.set(island.across, island.height * 0.72, z - island.length * 0.17);
  band.rotation.x = degreesToRadians(-10);
  return [band];
}
