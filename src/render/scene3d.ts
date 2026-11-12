// three.js renderer. Everything is built from primitives at runtime (boxes, cylinders,
// cones, capsules), so the game still ships zero image or model assets.
//
// World mapping: tile (x, y) sits at world (x, 0, y). One tile = one world unit.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { getAnalysis } from "@/game/analysis";
import { PLANES } from "@/game/constants";
import { buildBlocker } from "@/game/simulation";
import type { Analysis, Flight, GameState, TileType } from "@/game/types";
import type { Tool } from "./renderer";

export interface View3D {
  hover: number;
  tool: Tool;
}

const INDOOR: Partial<Record<TileType, boolean>> = { floor: true, checkin: true, tsa: true, customs: true, gate: true };
const OUTDOOR_WALK: Partial<Record<TileType, boolean>> = { sidewalk: true, shuttle: true, parking: true };
const GATE_COLORS = ["", "#16a34a", "#d97706", "#dc2626"];
const GATE_LETTER = ["", "S", "M", "L"];
const TAIL_COLORS = ["#16a34a", "#2563eb", "#b91c1c"];
const CAR_COLORS = ["#ef4444", "#3b82f6", "#f8fafc", "#111827", "#f59e0b", "#10b981"];
const MAX_PAX = 3000;
/** planes are drawn a bit larger than their 2D footprint so they read well in 3D */
const PLANE_SCALE = 1.3;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smooth(e0: number, e1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** collects primitives by (geometry, material) and turns each bucket into one InstancedMesh */
class Batcher {
  private buckets = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material; cast: boolean; list: THREE.Matrix4[] }>();
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);

  add(
    geoKey: string,
    geo: THREE.BufferGeometry,
    matKey: string,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    rotY = 0,
    cast = sy > 0.12,
  ) {
    const key = geoKey + "|" + matKey + "|" + (cast ? 1 : 0);
    let b = this.buckets.get(key);
    if (!b) {
      b = { geo, mat, cast, list: [] };
      this.buckets.set(key, b);
    }
    this.q.setFromAxisAngle(this.up, rotY);
    b.list.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(sx, sy, sz)));
  }

  build(group: THREE.Group) {
    for (const b of this.buckets.values()) {
      const mesh = new THREE.InstancedMesh(b.geo, b.mat, b.list.length);
      b.list.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = b.cast;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      group.add(mesh);
    }
  }
}

export class Scene3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.5, 400);
  private controls: OrbitControls;
  private sun = new THREE.DirectionalLight("#fff3e0", 2.6);
  private hemi = new THREE.HemisphereLight("#cfe8ff", "#6b8f5a", 1);

  private box = new THREE.BoxGeometry(1, 1, 1);
  private cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
  private cone = new THREE.ConeGeometry(0.5, 1, 9);
  private ball = new THREE.SphereGeometry(0.5, 10, 8);
  private mats: Record<string, THREE.MeshStandardMaterial> = {};

  private staticGroup = new THREE.Group();
  private labelGroup = new THREE.Group();
  private staticVersion = -1;
  private routeLine: THREE.Line | null = null;

  private paxBody: THREE.InstancedMesh;
  private paxHead: THREE.InstancedMesh;
  private planes = new Map<number, { group: THREE.Group; park: number }>();
  private buses: THREE.Group[] = [];
  private badges: THREE.Sprite[] = [];
  private textures = new Map<string, THREE.CanvasTexture>();

  private hoverMesh: THREE.Mesh;
  private standMesh: THREE.Mesh;
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.08);
  private tmpM = new THREE.Matrix4();
  private tmpV = new THREE.Vector3();
  private tmpC = new THREE.Color();
  private skyDay = new THREE.Color("#a9d9ff");
  private skyNight = new THREE.Color("#0b1026");
  private skyDusk = new THREE.Color("#f4a26b");
  private sunWarm = new THREE.Color("#ff9d5c");
  private sunWhite = new THREE.Color("#fff3e0");
  private moon = new THREE.Color("#8fa8ff");
  private colDep = new THREE.Color("#2563eb");
  private colArr = new THREE.Color("#f97316");
  private colMiss = new THREE.Color("#dc2626");

  /** keys currently held for camera panning (w/a/s/d/arrows), lowercase */
  keys = new Set<string>();

  constructor(
    canvas: HTMLCanvasElement,
    private gw: number,
    private gh: number,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    const cx = (gw - 1) / 2;
    const cz = (gh - 1) / 2;
    this.scene.background = this.skyDay.clone();
    this.scene.fog = new THREE.Fog(this.skyDay.clone(), 70, 190);

    // start framed on the tutorial terminal, looking across the apron to the runway
    this.camera.position.set(15.5, 10.5, 21.5);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(15.5, 0, 8.5);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = false;
    this.controls.zoomToCursor = true;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 95;
    this.controls.maxPolarAngle = 1.38;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.update();

    // lights
    this.scene.add(this.hemi);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -34;
    sc.right = 34;
    sc.top = 30;
    sc.bottom = -30;
    sc.near = 1;
    sc.far = 180;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.target.position.set(cx, 0, cz);
    this.scene.add(this.sun, this.sun.target);

    this.makeMaterials();
    this.buildWorld(cx, cz);
    this.scene.add(this.staticGroup, this.labelGroup);

    // passengers
    const bodyGeo = new THREE.CapsuleGeometry(0.085, 0.16, 3, 8);
    this.paxBody = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.7 }), MAX_PAX);
    this.paxHead = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.062, 8, 6),
      new THREE.MeshStandardMaterial({ color: "#f1c9a5", roughness: 0.8 }),
      MAX_PAX,
    );
    for (const m of [this.paxBody, this.paxHead]) {
      m.count = 0;
      m.castShadow = true;
      m.frustumCulled = false;
      this.scene.add(m);
    }
    this.paxBody.setColorAt(0, this.colDep);

    // hover + stand markers
    this.hoverMesh = new THREE.Mesh(
      this.box,
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.hoverMesh.scale.set(1.02, 0.08, 1.02);
    this.hoverMesh.renderOrder = 5;
    this.hoverMesh.visible = false;
    this.standMesh = new THREE.Mesh(
      this.box,
      new THREE.MeshBasicMaterial({ color: "#0ea5e9", transparent: true, opacity: 0.4, depthWrite: false }),
    );
    this.standMesh.scale.set(0.9, 0.06, 0.9);
    this.standMesh.visible = false;
    this.scene.add(this.hoverMesh, this.standMesh);
  }

  // -------------------------------------------------------------------------
  // setup
  // -------------------------------------------------------------------------

  private mat(key: string, color: string, opts: THREE.MeshStandardMaterialParameters = {}) {
    this.mats[key] = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });
  }

  private makeMaterials() {
    this.mat("grass", "#86b86b", { roughness: 1 });
    this.mat("pad", "#9bc77d", { roughness: 1 });
    this.mat("runway", "#3a4150", { roughness: 0.95 });
    this.mat("taxi", "#8a93a1", { roughness: 0.95 });
    this.mat("white", "#f8fafc");
    this.mat("yellow", "#f2c94c");
    this.mat("sidewalk", "#cbc5b8");
    this.mat("asphalt", "#5f6877", { roughness: 0.95 });
    this.mat("floor", "#f3efe6", { roughness: 0.6 });
    this.mat("wallbase", "#dcd7cb");
    this.mat("rail", "#8a97a8", { metalness: 0.5, roughness: 0.4 });
    this.mat("glass", "#bfe3ff", {
      transparent: true,
      opacity: 0.32,
      roughness: 0.08,
      metalness: 0.1,
      depthWrite: false,
      emissive: "#ffd28a",
      emissiveIntensity: 0,
    });
    this.mat("checkin", "#2f6fed", { roughness: 0.5 });
    this.mat("tsa", "#7c3aed", { roughness: 0.5 });
    this.mat("customs", "#0d9488", { roughness: 0.5 });
    this.mat("metal", "#aab3bf", { metalness: 0.6, roughness: 0.35 });
    this.mat("dark", "#1f2937", { roughness: 0.4 });
    this.mat("screen", "#0ea5e9", { emissive: "#38bdf8", emissiveIntensity: 0.8 });
    this.mat("gate1", GATE_COLORS[1], { roughness: 0.5 });
    this.mat("gate2", GATE_COLORS[2], { roughness: 0.5 });
    this.mat("gate3", GATE_COLORS[3], { roughness: 0.5 });
    this.mat("bridge", "#e5e7eb", { roughness: 0.5 });
    this.mat("shuttle", "#f2b705", { roughness: 0.5 });
    this.mat("trunk", "#7a5a3a");
    this.mat("tree1", "#4f9d57", { roughness: 1 });
    this.mat("tree2", "#3d8650", { roughness: 1 });
    this.mat("rwlight", "#ffffff", { emissive: "#fff6d5", emissiveIntensity: 0.5 });
    this.mat("txlight", "#60a5fa", { emissive: "#3b82f6", emissiveIntensity: 0.5 });
    this.mat("plane", "#f8fafc", { roughness: 0.32, metalness: 0.15 });
    this.mat("engine", "#94a3b8", { roughness: 0.4, metalness: 0.5 });
    this.mat("tire", "#111827");
    CAR_COLORS.forEach((c, i) => this.mat("car" + i, c, { roughness: 0.35, metalness: 0.3 }));
    TAIL_COLORS.forEach((c, i) => this.mat("tail" + i, c, { roughness: 0.4 }));
  }

  /** ground, the buildable pad and a ring of scenery trees. Built once. */
  private buildWorld(cx: number, cz: number) {
    const far = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), this.mats.grass);
    far.rotation.x = -Math.PI / 2;
    far.position.set(cx, -0.02, cz);
    far.receiveShadow = true;
    this.scene.add(far);

    const pad = new THREE.Mesh(new THREE.PlaneGeometry(this.gw, this.gh), this.mats.pad);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(cx, 0, cz);
    pad.receiveShadow = true;
    this.scene.add(pad);

    // faint build grid
    const pts: number[] = [];
    for (let x = 0; x <= this.gw; x++) pts.push(x - 0.5, 0.012, -0.5, x - 0.5, 0.012, this.gh - 0.5);
    for (let z = 0; z <= this.gh; z++) pts.push(-0.5, 0.012, z - 0.5, this.gw - 0.5, 0.012, z - 0.5);
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    this.scene.add(
      new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: "#3f6b35", transparent: true, opacity: 0.16 })),
    );

    // scenery trees outside the buildable area
    const b = new Batcher();
    const r = rng(1234);
    for (let i = 0; i < 420; i++) {
      const x = -30 + r() * (this.gw + 60);
      const z = -26 + r() * (this.gh + 52);
      if (x > -2 && x < this.gw + 1 && z > -2 && z < this.gh + 1) continue;
      this.addTree(b, x, z, 0.9 + r() * 1.1, r() < 0.5);
    }
    const g = new THREE.Group();
    b.build(g);
    this.scene.add(g);
  }

  private addTree(b: Batcher, x: number, z: number, k: number, alt: boolean) {
    const leaf = alt ? "tree1" : "tree2";
    b.add("cyl", this.cyl, "trunk", this.mats.trunk, x, 0.14 * k, z, 0.09 * k, 0.28 * k, 0.09 * k);
    b.add("cone", this.cone, leaf, this.mats[leaf], x, 0.55 * k, z, 0.5 * k, 0.7 * k, 0.5 * k);
    b.add("cone", this.cone, leaf, this.mats[leaf], x, 0.88 * k, z, 0.34 * k, 0.5 * k, 0.34 * k);
  }

  // -------------------------------------------------------------------------
  // static layout (rebuilt when the player builds or demolishes)
  // -------------------------------------------------------------------------

  private clearGroup(g: THREE.Group) {
    for (const child of [...g.children]) {
      g.remove(child);
      if (child instanceof THREE.InstancedMesh) child.dispose();
      if (child instanceof THREE.Sprite) child.material.dispose();
    }
  }

  private rebuildStatic(s: GameState, a: Analysis) {
    this.clearGroup(this.staticGroup);
    this.clearGroup(this.labelGroup);
    const b = new Batcher();
    const M = this.mats;
    const w = s.w;
    const type = (x: number, z: number): TileType =>
      x < 0 || z < 0 || x >= s.w || z >= s.h ? "empty" : s.tiles[z * w + x].type;
    const box = (mk: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, cast?: boolean) =>
      b.add("box", this.box, mk, M[mk], x, y, z, sx, sy, sz, ry, cast);
    const SIDES: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    for (let z = 0; z < s.h; z++) {
      for (let x = 0; x < s.w; x++) {
        const idx = z * w + x;
        const t = s.tiles[idx];
        const r = rng(idx * 7919 + 17);

        if (t.type === "empty") {
          // sprinkle trees on untouched land, but keep them away from aircraft
          if (r() < 0.065) {
            let clear = true;
            for (let dz = -2; dz <= 2 && clear; dz++)
              for (let dx = -2; dx <= 2; dx++) {
                const n = type(x + dx, z + dz);
                const near = Math.abs(dx) <= 1 && Math.abs(dz) <= 1;
                if (n === "runway" || n === "taxiway" || n === "gate" || (near && n !== "empty")) {
                  clear = false;
                  break;
                }
              }
            if (clear) this.addTree(b, x + (r() - 0.5) * 0.5, z + (r() - 0.5) * 0.5, 0.7 + r() * 0.6, r() < 0.5);
          }
          continue;
        }

        switch (t.type) {
          case "runway": {
            box("runway", x, 0.03, z, 1, 0.06, 1);
            const left = type(x - 1, z) === "runway";
            const right = type(x + 1, z) === "runway";
            if (left && right) box("white", x, 0.064, z, 0.5, 0.01, 0.07, 0, false);
            else for (let i = 0; i < 4; i++) box("white", x, 0.064, z - 0.3 + i * 0.2, 0.45, 0.01, 0.09, 0, false);
            for (const side of [-0.46, 0.46])
              b.add("ball", this.ball, "rwlight", M.rwlight, x, 0.08, z + side, 0.09, 0.09, 0.09, 0, false);
            break;
          }
          case "taxiway": {
            box("taxi", x, 0.025, z, 1, 0.05, 1);
            for (const [dx, dz] of SIDES) {
              const n = type(x + dx, z + dz);
              if (n === "taxiway" || n === "runway" || n === "gate")
                box("yellow", x + dx * 0.25, 0.054, z + dz * 0.25, dx ? 0.5 : 0.06, 0.01, dz ? 0.5 : 0.06, 0, false);
              else
                b.add("ball", this.ball, "txlight", M.txlight, x + dx * 0.46, 0.07, z + dz * 0.46, 0.07, 0.07, 0.07, 0, false);
            }
            break;
          }
          case "sidewalk":
            box("sidewalk", x, 0.04, z, 1, 0.08, 1);
            break;
          case "parking": {
            box("asphalt", x, 0.025, z, 1, 0.05, 1);
            for (let i = 0; i < 5; i++) box("white", x - 0.5 + i * 0.25, 0.054, z, 0.02, 0.01, 0.8, 0, false);
            for (let slot = 0; slot < 4; slot++) {
              if (r() > 0.3 + t.level * 0.2) continue;
              const cxp = x - 0.375 + slot * 0.25;
              const czp = z + (r() - 0.5) * 0.2;
              const car = "car" + Math.floor(r() * CAR_COLORS.length);
              box(car, cxp, 0.12, czp, 0.17, 0.1, 0.4, 0, true);
              box("dark", cxp, 0.2, czp - 0.02, 0.15, 0.08, 0.2, 0, true);
            }
            break;
          }
          case "shuttle": {
            box("sidewalk", x, 0.04, z, 1, 0.08, 1);
            for (const [px, pz] of [
              [-0.4, -0.25],
              [0.4, -0.25],
              [-0.4, 0.25],
              [0.4, 0.25],
            ])
              box("rail", x + px, 0.42, z + pz, 0.05, 0.7, 0.05);
            box("shuttle", x, 0.8, z, 0.95, 0.07, 0.66);
            box("glass", x, 0.42, z - 0.27, 0.8, 0.6, 0.02, 0, false);
            box("metal", x, 0.2, z - 0.15, 0.6, 0.05, 0.16, 0, false);
            break;
          }
          default: {
            // ---- indoor tiles: floor slab + glass walls on exposed edges ----
            box("floor", x, 0.05, z, 1, 0.1, 1);
            const info = t.type === "gate" ? a.gateByIdx.get(idx) : undefined;
            for (const [dx, dz] of SIDES) {
              const n = type(x + dx, z + dz);
              if (INDOOR[n]) continue;
              const ex = x + dx * 0.48;
              const ez = z + dz * 0.48;
              const sx = dx ? 0.04 : 1;
              const sz = dz ? 0.04 : 1;
              const isBridgeSide = info && info.stand === (z + dz) * w + (x + dx);
              if (OUTDOOR_WALK[n] || isBridgeSide) {
                // doorway: two posts and a header
                const ox = dx ? 0 : 0.46;
                const oz = dz ? 0 : 0.46;
                box("rail", ex - ox, 0.5, ez - oz, 0.07, 0.8, 0.07);
                box("rail", ex + ox, 0.5, ez + oz, 0.07, 0.8, 0.07);
                box("rail", ex, 0.9, ez, dx ? 0.07 : 1, 0.07, dz ? 0.07 : 1);
              } else {
                box("wallbase", ex, 0.17, ez, dx ? 0.07 : 1, 0.14, dz ? 0.07 : 1, 0, true);
                box("glass", ex, 0.5, ez, sx, 0.52, sz, 0, false);
                box("rail", ex, 0.78, ez, dx ? 0.08 : 1, 0.05, dz ? 0.08 : 1, 0, true);
              }
            }

            if (t.type === "checkin") {
              box("checkin", x, 0.28, z - 0.1, 0.82, 0.36, 0.3);
              box("white", x, 0.47, z - 0.1, 0.86, 0.03, 0.34);
              for (let l = 0; l < t.level; l++) box("screen", x - 0.25 + l * 0.25, 0.6, z - 0.2, 0.18, 0.16, 0.03);
            } else if (t.type === "tsa" || t.type === "customs") {
              const mk = t.type;
              box(mk, x - 0.36, 0.48, z, 0.1, 0.76, 0.5);
              box(mk, x + 0.36, 0.48, z, 0.1, 0.76, 0.5);
              box(mk, x, 0.9, z, 0.82, 0.1, 0.5);
              for (let l = 0; l < t.level; l++) box("screen", x - 0.2 + l * 0.2, 0.9, z + 0.26, 0.12, 0.06, 0.02, 0, false);
              if (t.type === "tsa") box("metal", x + 0.2, 0.2, z, 0.16, 0.2, 0.9);
              else box("glass", x, 0.45, z - 0.26, 0.6, 0.5, 0.03, 0, false);
            } else if (t.type === "gate") {
              const gm = "gate" + t.level;
              let dx = 0;
              let dz = -1;
              if (info && info.stand >= 0) {
                dx = (info.stand % w) - x;
                dz = Math.floor(info.stand / w) - z;
                // jet bridge reaching out to the aircraft stand
                box("bridge", x + dx * 0.72, 0.52, z + dz * 0.72, dx ? 0.62 : 0.3, 0.26, dz ? 0.62 : 0.3);
                box(gm, x + dx * 0.72, 0.67, z + dz * 0.72, dx ? 0.62 : 0.32, 0.04, dz ? 0.62 : 0.32, 0, false);
                box("bridge", x + dx * 1.04, 0.52, z + dz * 1.04, 0.36, 0.3, 0.36);
                box("rail", x + dx * 1.04, 0.2, z + dz * 1.04, 0.08, 0.4, 0.08);
              }
              // gate pylon + floating label
              box("rail", x - dx * 0.34, 0.5, z - dz * 0.34, 0.05, 0.8, 0.05);
              box(gm, x - dx * 0.34, 1.0, z - dz * 0.34, 0.26, 0.26, 0.26);
              const label = this.sprite(`${info ? info.name : "G"} ${GATE_LETTER[t.level]}`, GATE_COLORS[t.level]);
              label.position.set(x - dx * 0.34, 1.42, z - dz * 0.34);
              label.scale.set(0.8, 0.4, 1);
              this.labelGroup.add(label);
            }
          }
        }
      }
    }
    b.build(this.staticGroup);

    // shuttle route
    if (this.routeLine) {
      this.scene.remove(this.routeLine);
      this.routeLine.geometry.dispose();
      this.routeLine = null;
    }
    if (a.shuttleActive) {
      const pts = [...a.stops, a.stops[0]].map((i) => new THREE.Vector3(i % w, 0.1, Math.floor(i / w)));
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineDashedMaterial({ color: "#b8860b", dashSize: 0.35, gapSize: 0.3, transparent: true, opacity: 0.7 }),
      );
      line.computeLineDistances();
      this.routeLine = line;
      this.scene.add(line);
    }
  }

  // -------------------------------------------------------------------------
  // sprites
  // -------------------------------------------------------------------------

  private texture(text: string, bg: string): THREE.CanvasTexture {
    const key = text + "|" + bg;
    let tex = this.textures.get(key);
    if (tex) return tex;
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 64;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect(4, 8, 120, 48, 18);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 32px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 64, 34);
    }
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textures.set(key, tex);
    return tex;
  }

  private sprite(text: string, bg: string): THREE.Sprite {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.texture(text, bg), depthTest: false, transparent: true, toneMapped: false }),
    );
    sp.renderOrder = 10;
    return sp;
  }

  // -------------------------------------------------------------------------
  // dynamic objects
  // -------------------------------------------------------------------------

  private makePlane(cls: number): THREE.Group {
    const g = new THREE.Group();
    const M = this.mats;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.rotation.set(0, ry, rz);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    const fus = new THREE.CapsuleGeometry(0.06, 0.82, 6, 14);
    fus.rotateZ(Math.PI / 2);
    const body = new THREE.Mesh(fus, M.plane);
    body.castShadow = true;
    body.position.y = 0.1;
    g.add(body);
    add(this.box, M.dark, 0.4, 0.125, 0, 0.07, 0.035, 0.09); // cockpit glass
    add(this.box, M["tail" + cls], 0, 0.1, 0, 0.7, 0.018, 0.123); // cheatline
    // wings (swept back)
    add(this.box, M.plane, -0.07, 0.085, 0.26, 0.17, 0.014, 0.5, -0.34);
    add(this.box, M.plane, -0.07, 0.085, -0.26, 0.17, 0.014, 0.5, 0.34);
    // tailplane + fin
    add(this.box, M.plane, -0.43, 0.11, 0.1, 0.09, 0.012, 0.19, -0.3);
    add(this.box, M.plane, -0.43, 0.11, -0.1, 0.09, 0.012, 0.19, 0.3);
    add(this.box, M["tail" + cls], -0.42, 0.21, 0, 0.14, 0.17, 0.016, 0, 0.3);
    // engines
    const eng = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
    eng.rotateZ(Math.PI / 2);
    const spots = cls === 2 ? [0.16, 0.32] : [0.18];
    for (const zz of spots)
      for (const sgn of [1, -1]) {
        add(eng, M.engine, -0.02 - zz * 0.25, 0.055, zz * sgn, 0.13, 0.058, 0.058);
        if (cls === 0) add(this.box, M.dark, 0.05 - zz * 0.25, 0.055, zz * sgn, 0.008, 0.16, 0.02); // propeller
      }
    // landing gear
    add(this.box, M.tire, 0.3, 0.02, 0, 0.03, 0.04, 0.03);
    add(this.box, M.tire, -0.08, 0.02, 0.08, 0.04, 0.04, 0.03);
    add(this.box, M.tire, -0.08, 0.02, -0.08, 0.04, 0.04, 0.03);
    const L = PLANES[cls].size * PLANE_SCALE;
    g.scale.setScalar(L);
    return g;
  }

  private makeBus(): THREE.Group {
    const g = new THREE.Group();
    const M = this.mats;
    const part = (mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      const m = new THREE.Mesh(this.box, mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.castShadow = true;
      g.add(m);
    };
    part(M.shuttle, 0, 0.3, 0, 1.0, 0.34, 0.42);
    part(M.dark, 0, 0.36, 0, 0.86, 0.13, 0.44);
    part(M.dark, 0.47, 0.34, 0, 0.08, 0.16, 0.36);
    part(M.white, 0, 0.485, 0, 0.9, 0.03, 0.36);
    for (const wx of [-0.3, 0.3]) for (const wz of [-0.2, 0.2]) part(M.tire, wx, 0.11, wz, 0.16, 0.16, 0.06);
    return g;
  }

  private updatePlanes(s: GameState, dt: number) {
    const seen = new Set<number>();
    for (const f of s.flights) {
      if (f.state === "scheduled") continue;
      seen.add(f.id);
      let p = this.planes.get(f.id);
      if (!p) {
        p = { group: this.makePlane(f.cls), park: 0 };
        this.planes.set(f.id, p);
        this.scene.add(p.group);
      }
      this.placePlane(s, f, p, dt);
    }
    for (const [id, p] of this.planes) {
      if (seen.has(id)) continue;
      this.scene.remove(p.group);
      this.planes.delete(id);
    }
  }

  private placePlane(s: GameState, f: Flight, p: { group: THREE.Group; park: number }, dt: number) {
    const L = PLANES[f.cls].size * PLANE_SCALE;
    let alt = 0;
    let pitch = 0;
    if (f.state === "landing" && f.x < f.runwayX0) {
      alt = Math.min(1, (f.runwayX0 - f.x) / 12);
      pitch = 0.05 + alt * 0.04;
    } else if (f.state === "takeoff") {
      alt = Math.max(0, (f.speed - 9) / 8);
      alt = alt * alt;
      pitch = Math.min(0.28, (f.speed - 7) / 12);
      if (pitch < 0) pitch = 0;
    }
    // while parked, slide back so the nose (not the wing) meets the jet bridge
    const parked = f.state === "deboarding" || f.state === "boarding";
    p.park += ((parked ? 1 : 0) - p.park) * Math.min(1, dt * 3);
    let x = f.x;
    let z = f.y;
    if (p.park > 0.001) {
      const gx = f.gate % s.w;
      const gz = Math.floor(f.gate / s.w);
      const sx = f.stand % s.w;
      const sz = Math.floor(f.stand / s.w);
      const back = (L / 2 - 0.3) * p.park;
      x -= (gx - sx) * back;
      z -= (gz - sz) * back;
    }
    p.group.position.set(x, 0.05 + alt * 4.2, z);
    p.group.rotation.set(0, -f.heading, pitch);
  }

  private updateBuses(s: GameState) {
    while (this.buses.length < s.buses.length) {
      const g = this.makeBus();
      this.buses.push(g);
      this.scene.add(g);
    }
    this.buses.forEach((g, i) => {
      const b = s.buses[i];
      g.visible = !!b;
      if (!b) return;
      g.position.set(b.x, 0.03, b.y);
      const tx = b.target % s.w;
      const tz = Math.floor(b.target / s.w);
      if (Math.abs(tx - b.x) + Math.abs(tz - b.y) > 0.05) g.rotation.y = -Math.atan2(tz - b.y, tx - b.x);
    });
  }

  private updatePassengers(s: GameState) {
    let n = 0;
    const m = this.tmpM;
    for (const p of s.passengers) {
      if (p.state === "onBus" || n >= MAX_PAX) continue;
      let x = p.x + p.ox;
      let z = p.y + p.oy;
      if (p.state === "queue") {
        const i = Math.min(p.queueIndex, 17);
        x = p.x - 0.28 + (i % 3) * 0.28;
        z = p.y + 0.45 + Math.floor(i / 3) * 0.26;
      } else if (p.state === "atGate") {
        x = p.x + p.ox * 1.7;
        z = p.y + p.oy * 1.7;
      }
      m.makeTranslation(x, 0.27, z);
      this.paxBody.setMatrixAt(n, m);
      this.paxBody.setColorAt(n, p.missed ? this.colMiss : p.kind === "dep" ? this.colDep : this.colArr);
      m.makeTranslation(x, 0.5, z);
      this.paxHead.setMatrixAt(n, m);
      n++;
    }
    this.paxBody.count = n;
    this.paxHead.count = n;
    this.paxBody.instanceMatrix.needsUpdate = true;
    this.paxHead.instanceMatrix.needsUpdate = true;
    if (this.paxBody.instanceColor) this.paxBody.instanceColor.needsUpdate = true;
  }

  private updateBadges(s: GameState, a: Analysis) {
    const want: { x: number; y: number; z: number; text: string; bg: string }[] = [];
    for (const key of Object.keys(s.facilities)) {
      const idx = Number(key);
      const q = s.facilities[idx].queue.length;
      if (q >= 4) want.push({ x: idx % s.w, y: 1.45, z: Math.floor(idx / s.w), text: String(q), bg: q >= 12 ? "#dc2626" : "#f59e0b" });
    }
    for (const g of a.gates)
      if (!g.functional) want.push({ x: (g.idx % s.w) + 0.3, y: 2.3, z: Math.floor(g.idx / s.w), text: "!", bg: "#dc2626" });

    while (this.badges.length < want.length) {
      const sp = this.sprite("0", "#f59e0b");
      sp.scale.set(0.9, 0.45, 1);
      this.badges.push(sp);
      this.scene.add(sp);
    }
    this.badges.forEach((sp, i) => {
      const wnt = want[i];
      sp.visible = !!wnt;
      if (!wnt) return;
      sp.position.set(wnt.x, wnt.y, wnt.z);
      const tex = this.texture(wnt.text, wnt.bg);
      if (sp.material.map !== tex) {
        sp.material.map = tex;
        sp.material.needsUpdate = true;
      }
    });
  }

  private updateSky(s: GameState) {
    const hour = (s.time / 60) % 24;
    const arc = Math.max(0, Math.min(1, (hour - 5.5) / 15)) * Math.PI;
    const elev = Math.sin(arc);
    const day = smooth(0, 0.22, elev);
    const cx = (this.gw - 1) / 2;
    const cz = (this.gh - 1) / 2;

    if (day > 0.02) {
      this.sun.position.set(cx - Math.cos(arc) * 55, 10 + elev * 55, cz + 26);
      this.sun.color.copy(this.sunWarm).lerp(this.sunWhite, smooth(0.1, 0.6, elev));
      this.sun.intensity = 0.25 + 2.7 * day;
    } else {
      this.sun.position.set(cx - 25, 50, cz + 15);
      this.sun.color.copy(this.moon);
      this.sun.intensity = 0.8;
    }
    this.hemi.intensity = 0.5 + 0.6 * day;

    const sky = this.tmpC.copy(this.skyNight).lerp(this.skyDay, day);
    const warm = Math.max(0, Math.min(1, 1 - elev / 0.45)) * day;
    sky.lerp(this.skyDusk, warm * 0.65);
    (this.scene.background as THREE.Color).copy(sky);
    (this.scene.fog as THREE.Fog).color.copy(sky);

    const night = 1 - day;
    this.mats.glass.emissiveIntensity = night * 0.55;
    this.mats.rwlight.emissiveIntensity = 0.5 + night * 3;
    this.mats.txlight.emissiveIntensity = 0.5 + night * 2.5;
    this.mats.screen.emissiveIntensity = 0.8 + night * 1.2;
  }

  private updateCameraKeys(dt: number) {
    if (this.keys.size === 0) return;
    let fx = 0;
    let fz = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) fz += 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) fz -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) fx += 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) fx -= 1;
    if (!fx && !fz) return;
    const fwd = this.tmpV.subVectors(this.controls.target, this.camera.position);
    fwd.y = 0;
    const dist = Math.max(8, this.camera.position.distanceTo(this.controls.target));
    fwd.normalize();
    const speed = dist * 0.8 * dt;
    const mx = (fwd.x * fz - fwd.z * fx) * speed;
    const mz = (fwd.z * fz + fwd.x * fx) * speed;
    this.camera.position.x += mx;
    this.camera.position.z += mz;
    this.controls.target.x += mx;
    this.controls.target.z += mz;
  }

  // -------------------------------------------------------------------------
  // public api
  // -------------------------------------------------------------------------

  resize(w: number, h: number) {
    if (w < 2 || h < 2) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** tile index under a screen point, or -1 */
  pick(clientX: number, clientY: number): number {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.ground, this.tmpV);
    if (!hit) return -1;
    const x = Math.round(hit.x);
    const z = Math.round(hit.z);
    if (x < 0 || z < 0 || x >= this.gw || z >= this.gh) return -1;
    return z * this.gw + x;
  }

  render(s: GameState, view: View3D, dt: number) {
    const a = getAnalysis(s);
    if (this.staticVersion !== s.version) {
      this.staticVersion = s.version;
      this.rebuildStatic(s, a);
    }

    // left mouse builds when a tool is active, otherwise it drags the camera
    this.controls.mouseButtons.LEFT = view.tool ? null : THREE.MOUSE.PAN;
    this.updateCameraKeys(dt);
    this.controls.target.x = Math.max(-6, Math.min(this.gw + 6, this.controls.target.x));
    this.controls.target.z = Math.max(-6, Math.min(this.gh + 6, this.controls.target.z));
    this.controls.target.y = 0;
    this.controls.update();

    this.updateSky(s);
    this.updatePlanes(s, dt);
    this.updateBuses(s);
    this.updatePassengers(s);
    this.updateBadges(s, a);

    // hover + tool preview
    const hm = this.hoverMesh.material as THREE.MeshBasicMaterial;
    if (view.hover >= 0) {
      this.hoverMesh.visible = true;
      this.hoverMesh.position.set(view.hover % s.w, 0.16, Math.floor(view.hover / s.w));
      let color = "#ffffff";
      if (view.tool?.kind === "build") color = buildBlocker(s, view.hover, view.tool.type) ? "#ef4444" : "#22c55e";
      else if (view.tool?.kind === "bulldoze") color = "#ef4444";
      else if (view.tool?.kind === "upgrade") color = "#a855f7";
      hm.color.set(color);
      const g = a.gateByIdx.get(view.hover);
      this.standMesh.visible = !!g && g.stand >= 0;
      if (g && g.stand >= 0) this.standMesh.position.set(g.stand % s.w, 0.1, Math.floor(g.stand / s.w));
    } else {
      this.hoverMesh.visible = false;
      this.standMesh.visible = false;
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.controls.dispose();
    this.clearGroup(this.staticGroup);
    this.clearGroup(this.labelGroup);
    for (const t of this.textures.values()) t.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
    this.renderer.dispose();
  }
}
