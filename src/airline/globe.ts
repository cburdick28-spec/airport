// Airline CEO mode: the 3D globe. Draws the earth, cities, your routes and planes in flight.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { AIRCRAFT_BY_ID, CITIES, CITY, LAND, WATER } from "./data";
import { distanceKm, stormAt, type AirlineState } from "./engine";

const R = 1;

export function toVec(lat: number, lon: number, r = R): THREE.Vector3 {
  const la = (lat * Math.PI) / 180;
  const ph = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(-Math.cos(ph) * Math.cos(la) * r, Math.sin(la) * r, Math.sin(ph) * Math.cos(la) * r);
}

/** points along the great circle from a to b, lifted into an arc */
function arcPoints(a: string, b: string, n = 64): THREE.Vector3[] {
  const p = toVec(CITY[a].lat, CITY[a].lon).normalize();
  const q = toVec(CITY[b].lat, CITY[b].lon).normalize();
  const angle = p.angleTo(q);
  const lift = 0.02 + angle * 0.08;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const v =
      angle < 1e-6
        ? p.clone()
        : p
            .clone()
            .multiplyScalar(Math.sin((1 - t) * angle) / Math.sin(angle))
            .add(q.clone().multiplyScalar(Math.sin(t * angle) / Math.sin(angle)));
    v.normalize().multiplyScalar(R + 0.004 + lift * Math.sin(Math.PI * t));
    pts.push(v);
  }
  return pts;
}

function earthTexture(): THREE.CanvasTexture {
  const W = 2048;
  const H = 1024;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const sea = g.createLinearGradient(0, 0, 0, H);
  sea.addColorStop(0, "#0b2a4a");
  sea.addColorStop(0.5, "#0f4c81");
  sea.addColorStop(1, "#0b2a4a");
  g.fillStyle = sea;
  g.fillRect(0, 0, W, H);
  const xy = ([lon, lat]: [number, number]) => [((lon + 180) / 360) * W, ((90 - lat) / 180) * H] as const;
  const poly = (pts: [number, number][]) => {
    g.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = xy(p);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.closePath();
  };
  // shallow-water glow around coasts
  g.lineJoin = "round";
  g.strokeStyle = "rgba(56,189,248,0.35)";
  g.lineWidth = 10;
  for (const l of LAND) {
    poly(l);
    g.stroke();
  }
  for (const l of LAND) {
    const avgLat = l.reduce((a, p) => a + p[1], 0) / l.length;
    const ice = Math.abs(avgLat) > 62;
    const dry = Math.abs(avgLat) < 32 && Math.abs(avgLat) > 12;
    const land = g.createLinearGradient(0, 0, W, H);
    land.addColorStop(0, ice ? "#e2e8f0" : dry ? "#a8925a" : "#3f7d3a");
    land.addColorStop(1, ice ? "#cbd5e1" : dry ? "#8a7a46" : "#2f6b34");
    g.fillStyle = land;
    poly(l);
    g.fill();
    g.strokeStyle = "rgba(15,23,42,0.5)";
    g.lineWidth = 1.5;
    g.stroke();
  }
  g.fillStyle = "#0f4c81";
  for (const w of WATER) {
    poly(w);
    g.fill();
  }
  // graticule
  g.strokeStyle = "rgba(255,255,255,0.06)";
  g.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 30) {
    const [x] = xy([lon, 0]);
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H);
    g.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const [, y] = xy([0, lat]);
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function labelSprite(text: string, color = "#e2e8f0"): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 48;
  const g = c.getContext("2d")!;
  g.font = "bold 30px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 6;
  g.strokeStyle = "rgba(2,6,23,0.85)";
  g.strokeText(text, 64, 24);
  g.fillStyle = color;
  g.fillText(text, 64, 24);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  s.scale.set(0.08, 0.03, 1);
  return s;
}

function stormTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  for (let i = 0; i < 4; i++) {
    g.strokeStyle = `rgba(226,232,240,${0.7 - i * 0.12})`;
    g.lineWidth = 9 - i * 1.5;
    g.beginPath();
    g.arc(64, 64, 14 + i * 12, i * 1.6, i * 1.6 + 4.2);
    g.stroke();
  }
  g.fillStyle = "rgba(248,250,252,0.9)";
  g.beginPath();
  g.arc(64, 64, 8, 0, Math.PI * 2);
  g.fill();
  return new THREE.CanvasTexture(c);
}

function planeGeometry(): THREE.BufferGeometry {
  // a little jet pointing along +Z, wings along X, built from two triangles-ish shapes
  const shape = new THREE.Shape();
  shape.moveTo(0, 1);
  shape.lineTo(0.12, 0.3);
  shape.lineTo(0.9, -0.1);
  shape.lineTo(0.9, -0.25);
  shape.lineTo(0.12, -0.15);
  shape.lineTo(0.1, -0.7);
  shape.lineTo(0.35, -0.9);
  shape.lineTo(0.35, -1);
  shape.lineTo(0, -0.92);
  shape.lineTo(-0.35, -1);
  shape.lineTo(-0.35, -0.9);
  shape.lineTo(-0.1, -0.7);
  shape.lineTo(-0.12, -0.15);
  shape.lineTo(-0.9, -0.25);
  shape.lineTo(-0.9, -0.1);
  shape.lineTo(-0.12, 0.3);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  // lie flat: shape is in XY, rotate so Y becomes +Z (forward) and the plane faces +Y (up)
  geo.rotateX(Math.PI / 2);
  geo.scale(1, 1, -1);
  return geo;
}

interface RouteDraw {
  key: string;
  line: THREE.Mesh;
  curve: THREE.CatmullRomCurve3;
  /** minutes for one leg */
  leg: number;
  planes: { mesh: THREE.Mesh; offset: number; size: number }[];
}

export class Globe {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private earth: THREE.Mesh;
  private sun = new THREE.DirectionalLight(0xffffff, 2.4);
  private markers = new Map<string, THREE.Mesh>();
  private labels = new Map<string, THREE.Sprite>();
  private hubRings = new Map<string, THREE.Mesh>();
  private routes = new Map<number, RouteDraw>();
  private storms = new Map<string, THREE.Sprite>();
  private stormTex = stormTexture();
  private planeGeo = planeGeometry();
  private selRing: THREE.Mesh;
  private preview: THREE.Mesh | null = null;
  private previewKey = "";
  private raycaster = new THREE.Raycaster();
  private ro: ResizeObserver;
  private downAt: { x: number; y: number } | null = null;
  private hovered: string | null = null;
  private color = "";

  onPick: (code: string | null) => void = () => {};
  onHover: (code: string | null, x: number, y: number) => void = () => {};

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    this.camera.position.copy(toVec(30, -40, 3.4));
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minDistance = 1.35;
    this.controls.maxDistance = 6;
    this.controls.rotateSpeed = 0.5;
    this.controls.zoomSpeed = 0.8;

    this.scene.background = new THREE.Color("#020617");
    this.scene.add(new THREE.AmbientLight(0x8fa8c8, 0.55));
    this.scene.add(this.sun);

    this.earth = new THREE.Mesh(
      new THREE.SphereGeometry(R, 96, 64),
      new THREE.MeshStandardMaterial({ map: earthTexture(), roughness: 0.85, metalness: 0 }),
    );
    this.scene.add(this.earth);

    // atmosphere glow
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.12, 64, 48),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying vec3 vN; void main(){ float i = pow(0.72 - dot(vN, vec3(0.0,0.0,1.0)), 3.0); gl_FragColor = vec4(0.35,0.65,1.0,1.0) * i * 1.6; }`,
      }),
    );
    this.scene.add(atmo);

    // stars
    const starPos: number[] = [];
    for (let i = 0; i < 1800; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(30 + Math.random() * 20);
      starPos.push(v.x, v.y, v.z);
    }
    const stars = new THREE.BufferGeometry();
    stars.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
    this.scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xcbd5e1, size: 0.08, sizeAttenuation: true })));

    // cities
    for (const c of CITIES) {
      const pos = toVec(c.lat, c.lon, R + 0.003);
      const r = 0.006 + Math.sqrt(c.market) * 0.0012;
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
      m.position.copy(pos);
      m.userData.code = c.code;
      this.scene.add(m);
      this.markers.set(c.code, m);
      const l = labelSprite(c.code);
      l.position.copy(toVec(c.lat, c.lon, R + 0.035));
      this.scene.add(l);
      this.labels.set(c.code, l);
    }

    this.selRing = new THREE.Mesh(
      new THREE.RingGeometry(0.022, 0.03, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, depthWrite: false }),
    );
    this.selRing.visible = false;
    this.scene.add(this.selRing);

    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointermove", this.onMove);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  private resize() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private pick(e: PointerEvent): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    // hit the nearest city within a few pixels of the cursor, but never one behind the earth
    const earthHit = this.raycaster.intersectObject(this.earth)[0];
    const maxDist = earthHit ? earthHit.distance + 0.05 : Infinity;
    let best: string | null = null;
    let bestScore = Infinity;
    const thresh = 14 / rect.height; // ~14px in NDC units*2
    for (const [code, m] of this.markers) {
      const p = m.position.clone().project(this.camera);
      const d = Math.hypot(p.x - ndc.x, (p.y - ndc.y) * (rect.height / rect.width)) ;
      if (d > thresh * 2) continue;
      if (m.position.distanceTo(this.camera.position) > maxDist) continue;
      if (d < bestScore) {
        bestScore = d;
        best = code;
      }
    }
    return best;
  }

  private onDown = (e: PointerEvent) => {
    this.downAt = { x: e.clientX, y: e.clientY };
  };
  private onUp = (e: PointerEvent) => {
    if (!this.downAt) return;
    const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y);
    this.downAt = null;
    if (moved > 5) return;
    this.onPick(this.pick(e));
  };
  private onMove = (e: PointerEvent) => {
    const code = this.pick(e);
    this.hovered = code;
    this.renderer.domElement.style.cursor = code ? "pointer" : "grab";
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.onHover(code, e.clientX - rect.left, e.clientY - rect.top);
  };

  /** spin the camera to look at a city */
  focus(code: string) {
    const c = CITY[code];
    const dist = this.camera.position.length();
    this.camera.position.copy(toVec(c.lat - 8, c.lon, Math.min(dist, 2.6)));
  }

  private syncRoutes(s: AirlineState) {
    const seen = new Set<number>();
    for (const r of s.routes) {
      seen.add(r.id);
      const planeKey = Object.entries(r.planes)
        .map(([k, n]) => `${k}${n}`)
        .join(",");
      const key = `${r.a}-${r.b}-${planeKey}-${s.color}`;
      const old = this.routes.get(r.id);
      if (old && old.key === key) continue;
      if (old) this.removeRoute(r.id);
      const pts = arcPoints(r.a, r.b);
      const curve = new THREE.CatmullRomCurve3(pts);
      const line = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 64, 0.0025, 6, false),
        new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.85 }),
      );
      this.scene.add(line);
      const km = distanceKm(r.a, r.b);
      const planes: RouteDraw["planes"] = [];
      let i = 0;
      const total = Object.values(r.planes).reduce((a, n) => a + n, 0);
      for (const [id, n] of Object.entries(r.planes)) {
        const t = AIRCRAFT_BY_ID[id];
        for (let k = 0; k < Math.min(n, 8); k++) {
          const mesh = new THREE.Mesh(this.planeGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
          this.scene.add(mesh);
          planes.push({ mesh, offset: (i++ / Math.max(1, Math.min(total, 8))) * 2, size: t.size * 0.016 });
        }
      }
      const speed = AIRCRAFT_BY_ID[Object.keys(r.planes)[0]]?.speed ?? 830;
      this.routes.set(r.id, { key, line, curve, leg: (km / speed + 0.5) * 60 + 50, planes });
    }
    for (const id of [...this.routes.keys()]) if (!seen.has(id)) this.removeRoute(id);
  }

  private removeRoute(id: number) {
    const d = this.routes.get(id);
    if (!d) return;
    this.scene.remove(d.line);
    d.line.geometry.dispose();
    (d.line.material as THREE.Material).dispose();
    for (const p of d.planes) {
      this.scene.remove(p.mesh);
      (p.mesh.material as THREE.Material).dispose();
    }
    this.routes.delete(id);
  }

  /** draw a frame */
  update(s: AirlineState, sel: { city: string | null; route: number | null; preview: [string, string] | null }) {
    if (this.color !== s.color) this.color = s.color;
    this.syncRoutes(s);

    // sun follows the clock (game time is UTC)
    const minute = s.time % 1440;
    const subLon = 180 - (minute / 1440) * 360;
    const season = 18 * Math.sin(((s.time / 1440) % 365) / 365 * Math.PI * 2);
    this.sun.position.copy(toVec(season, subLon, 10));

    const hubs = new Set(s.hubs);
    const served = new Set<string>();
    for (const r of s.routes) {
      served.add(r.a);
      served.add(r.b);
    }
    const camDist = this.camera.position.length();
    const labelScale = Math.min(1.6, Math.max(0.45, (camDist - 1) / 1.6));
    for (const [code, m] of this.markers) {
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.set(hubs.has(code) ? s.color : served.has(code) ? "#f8fafc" : "#fbbf24");
      m.scale.setScalar(hubs.has(code) ? 1.8 : code === this.hovered ? 1.5 : 1);
      const l = this.labels.get(code)!;
      l.scale.set(0.08 * labelScale, 0.03 * labelScale, 1);
      // fade labels on the far side
      const facing = m.position.clone().normalize().dot(this.camera.position.clone().normalize());
      (l.material as THREE.SpriteMaterial).opacity = facing > 0.15 ? 1 : 0;
      // hub rings
      let ring = this.hubRings.get(code);
      if (hubs.has(code) && !ring) {
        ring = new THREE.Mesh(
          new THREE.RingGeometry(0.016, 0.02, 32),
          new THREE.MeshBasicMaterial({ color: s.color, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }),
        );
        ring.position.copy(m.position);
        ring.lookAt(m.position.clone().multiplyScalar(2));
        this.scene.add(ring);
        this.hubRings.set(code, ring);
      }
      if (ring) {
        (ring.material as THREE.MeshBasicMaterial).color.set(s.color);
        ring.visible = hubs.has(code);
        const pulse = 1 + 0.25 * Math.sin(performance.now() / 300);
        ring.scale.setScalar(pulse);
      }
    }

    // storms
    for (const c of CITIES) {
      const on = stormAt(s, c.code);
      let sp = this.storms.get(c.code);
      if (on && !sp) {
        sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.stormTex, transparent: true, depthWrite: false, opacity: 0.9 }));
        sp.position.copy(toVec(c.lat, c.lon, R + 0.02));
        sp.scale.setScalar(0.09);
        this.scene.add(sp);
        this.storms.set(c.code, sp);
      }
      if (sp) {
        sp.visible = on;
        (sp.material as THREE.SpriteMaterial).rotation = -performance.now() / 600;
      }
    }

    // routes and planes
    for (const r of s.routes) {
      const d = this.routes.get(r.id);
      if (!d) continue;
      const grounded = r.refitUntil > s.time || stormAt(s, r.a) || stormAt(s, r.b);
      const lineMat = d.line.material as THREE.MeshBasicMaterial;
      lineMat.color.set(grounded ? "#ef4444" : s.color);
      lineMat.opacity = sel.route === null || sel.route === r.id ? 0.9 : 0.25;
      d.line.scale.setScalar(sel.route === r.id ? 1.002 : 1);
      for (const p of d.planes) {
        p.mesh.visible = !grounded;
        if (grounded) continue;
        // ping-pong along the arc: out and back
        const ph = (s.time / d.leg + p.offset) % 2;
        const t = ph < 1 ? ph : 2 - ph;
        const tt = Math.min(0.995, Math.max(0.005, t));
        const pos = d.curve.getPointAt(tt);
        const tan = d.curve.getTangentAt(tt);
        if (ph >= 1) tan.negate();
        p.mesh.position.copy(pos);
        const up = pos.clone().normalize();
        const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), tan, up);
        p.mesh.quaternion.setFromRotationMatrix(m);
        p.mesh.rotateY(Math.PI);
        p.mesh.scale.setScalar(p.size * Math.min(1.4, Math.max(0.6, camDist / 2.4)));
        (p.mesh.material as THREE.MeshBasicMaterial).color.set(sel.route === r.id ? "#fde047" : "#ffffff");
      }
    }

    // selection ring
    if (sel.city) {
      const c = CITY[sel.city];
      this.selRing.visible = true;
      this.selRing.position.copy(toVec(c.lat, c.lon, R + 0.004));
      this.selRing.lookAt(this.selRing.position.clone().multiplyScalar(2));
      this.selRing.scale.setScalar(1 + 0.15 * Math.sin(performance.now() / 200));
    } else this.selRing.visible = false;

    // dashed preview of a route you're planning
    const pk = sel.preview ? sel.preview.join("-") : "";
    if (pk !== this.previewKey) {
      this.previewKey = pk;
      if (this.preview) {
        this.scene.remove(this.preview);
        this.preview.geometry.dispose();
        this.preview = null;
      }
      if (sel.preview) {
        const curve = new THREE.CatmullRomCurve3(arcPoints(sel.preview[0], sel.preview[1]));
        this.preview = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 64, 0.003, 6, false),
          new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.7 }),
        );
        this.scene.add(this.preview);
      }
    }
    if (this.preview) (this.preview.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.35 * Math.sin(performance.now() / 180);

    this.controls.rotateSpeed = 0.25 + 0.25 * (camDist - 1);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.ro.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointerup", this.onUp);
    el.removeEventListener("pointermove", this.onMove);
    this.controls.dispose();
    this.renderer.dispose();
    el.remove();
  }
}
