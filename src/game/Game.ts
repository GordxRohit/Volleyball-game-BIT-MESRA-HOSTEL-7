import * as THREE from "three";
import { Rng } from "./rng";
import { COURT, PHYSICS, MAX_TOUCHES, POINTS_TO_WIN_SET, MIN_WIN_MARGIN, SETS_TO_WIN_MATCH } from "./constants";
import type { TeamId, TimeOfDay, Season } from "./constants";
import { buildCampusWorld, WorldRefs } from "./world";
import { buildCharacter, CharacterAnimator } from "./character";
import { Ball } from "./ball";
import { AudioSystem } from "./audio";
import { createPixelPassMaterial } from "./pixelPass";
import { clampToCourtSide, pickAttackTarget, formationPositions, servePositions } from "./ai";

export interface GameUIState {
  scoreRed: number;
  scoreBlue: number;
  setsRed: number;
  setsBlue: number;
  setNumber: number;
  serverTeam: TeamId;
  message: string;
  messageKey: number;
  selectedPlayerNumber: number;
  contextHint: string;
  matchPhase: string;
  paused: boolean;
  matchStarted: boolean;
  winner: TeamId | null;
}

interface PlayerEntity {
  team: TeamId;
  index: number;
  number: number;
  isHuman: boolean;
  group: THREE.Group;
  animator: CharacterAnimator;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  facing: number;
  jumpVel: number;
  grounded: boolean;
  moveTarget: THREE.Vector2 | null;
  actionCooldown: number;
  reach: number;
  sideSign: 1 | -1;
  diveTimer: number;
}

type MatchPhase =
  | "intro"
  | "serve-wait"
  | "rally"
  | "point-pause"
  | "set-celebration"
  | "match-over"
  | "paused";

const CAMERA_FRUSTUM = 11;

export class Game {
  container: HTMLDivElement;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;
  world!: WorldRefs;
  ball = new Ball();
  players: PlayerEntity[] = [];
  rng = new Rng(20240717);
  audio = new AudioSystem();
  clock = new THREE.Clock();

  // rendering / pixel pipeline
  lowResTarget: THREE.WebGLRenderTarget;
  postScene = new THREE.Scene();
  postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  postMaterial = createPixelPassMaterial();
  pixelSize = 3;
  paletteEnabled = true;
  outlineEnabled = true;
  ditherEnabled = true;
  raw3D = false;

  // camera control
  azimuth = Math.PI / 4;
  azimuthTarget = Math.PI / 4;
  elevation = THREE.MathUtils.degToRad(31);
  zoomLevel = 1;
  zoomTarget = 1;
  camTarget = new THREE.Vector3(0, 1, -1);

  // lighting
  hemi!: THREE.HemisphereLight;
  sun!: THREE.DirectionalLight;
  ambient!: THREE.AmbientLight;
  timeOfDay: TimeOfDay = "sunset";
  season: Season = "summer";
  lightBlend = 1;
  lightFrom: TimeOfDay = "sunset";
  lightTo: TimeOfDay = "sunset";

  // input
  keys = new Set<string>();
  keysPressed = new Set<string>();
  mobileMoveVec = new THREE.Vector2();
  mobileSprint = false;
  pointerDown = false;
  pointerStart = new THREE.Vector2();
  pointerLast = new THREE.Vector2();
  pointerMovedFar = false;
  pinchDist: number | null = null;
  markerPos: THREE.Vector2 | null = null;
  markerMesh: THREE.Mesh;

  // game/match state
  selectedIndex = 0; // index within human team's controllable list (0..2) -> maps to RED players
  phase: MatchPhase = "intro";
  phaseTimer = 0;
  serverTeam: TeamId = "RED";
  score = { RED: 0, BLUE: 0 };
  sets = { RED: 0, BLUE: 0 };
  setNumber = 1;
  winner: TeamId | null = null;
  message = "WELCOME TO HOSTEL 7 VOLLEYBALL";
  messageTimer = 2.5;
  messageKey = 0;
  contextHint = "";

  rallyTouches = { RED: 0, BLUE: 0 };
  rallyCurrentSide: TeamId | null = null;
  rallyTouchedByReceiver = false;
  rallyActive = false;

  paused = false;
  running = false;
  disposed = false;

  uiCallback: ((s: GameUIState) => void) | null = null;
  uiTimer = 0;

  constructor(container: HTMLDivElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setPixelRatio(1);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.OrthographicCamera(-CAMERA_FRUSTUM, CAMERA_FRUSTUM, CAMERA_FRUSTUM, -CAMERA_FRUSTUM, 0.1, 100);
    this.updateCameraTransform();

    this.lowResTarget = new THREE.WebGLRenderTarget(320, 180, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.lowResTarget.depthTexture = new THREE.DepthTexture(320, 180);
    this.lowResTarget.depthTexture.type = THREE.UnsignedShortType;

    this.postMaterial.uniforms.tColor.value = this.lowResTarget.texture;
    this.postMaterial.uniforms.tDepth.value = this.lowResTarget.depthTexture;
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial);
    this.postScene.add(quad);

    this.setupLighting();
    this.world = buildCampusWorld(this.scene, this.rng, this.season);
    this.scene.add(this.ball.mesh);

    this.markerMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.32, 16),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85 })
    );
    this.markerMesh.rotation.x = -Math.PI / 2;
    this.markerMesh.visible = false;
    this.scene.add(this.markerMesh);

    this.createPlayers();
    this.applyLighting(1);
    this.world.setNight(this.timeOfDay === "night");

    this.setupInput();
    this.handleResize();
    window.addEventListener("resize", this.handleResize);
  }

  // ---------------------------------------------------------------- lights
  private setupLighting() {
    this.hemi = new THREE.HemisphereLight(0xaecbe0, 0x3a3226, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff3d6, 1.1);
    this.sun.position.set(10, 16, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -18;
    this.sun.shadow.camera.right = 18;
    this.sun.shadow.camera.top = 18;
    this.sun.shadow.camera.bottom = -18;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 50;
    this.sun.shadow.bias = -0.0025;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(this.ambient);
  }

  private lightPreset(t: TimeOfDay) {
    switch (t) {
      case "day":
        return { sky: 0x8fd0ef, ground: 0x4f9a52, sun: 0xfff6e0, sunI: 1.25, hemiI: 1.0, ambI: 0.35, sunPos: [10, 18, 10], bg: 0x8fd0ef, fog: 0xbfe3f2 };
      case "sunset":
        return { sky: 0x7a4a8a, ground: 0x4a3222, sun: 0xffb870, sunI: 1.1, hemiI: 0.75, ambI: 0.3, sunPos: [-14, 9, 10], bg: 0xe0793f, fog: 0xe0a06a };
      case "night":
        return { sky: 0x0c1430, ground: 0x0a0f22, sun: 0x3a4a8a, sunI: 0.25, hemiI: 0.4, ambI: 0.22, sunPos: [6, 14, -6], bg: 0x0a1328, fog: 0x0a1328 };
    }
  }

  setTimeOfDay(t: TimeOfDay) {
    if (t === this.timeOfDay) return;
    this.lightFrom = this.timeOfDay;
    this.lightTo = t;
    this.timeOfDay = t;
    this.lightBlend = 0;
    this.world.setNight(t === "night");
  }

  private applyLighting(blend: number) {
    const a = this.lightPreset(this.lightFrom)!;
    const b = this.lightPreset(this.lightTo)!;
    const lerp = (x: number, y: number) => THREE.MathUtils.lerp(x, y, blend);
    const colA = new THREE.Color(a.sky);
    const colB = new THREE.Color(b.sky);
    this.hemi.color.copy(colA).lerp(colB, blend);
    this.hemi.groundColor.set(lerp(a.ground as number, b.ground as number));
    this.hemi.intensity = lerp(a.hemiI, b.hemiI);
    const sunColA = new THREE.Color(a.sun);
    const sunColB = new THREE.Color(b.sun);
    this.sun.color.copy(sunColA).lerp(sunColB, blend);
    this.sun.intensity = lerp(a.sunI, b.sunI);
    this.sun.position.set(
      lerp(a.sunPos[0], b.sunPos[0]),
      lerp(a.sunPos[1], b.sunPos[1]),
      lerp(a.sunPos[2], b.sunPos[2])
    );
    this.ambient.intensity = lerp(a.ambI, b.ambI);
    const bgA = new THREE.Color(a.bg);
    const bgB = new THREE.Color(b.bg);
    const bg = bgA.clone().lerp(bgB, blend);
    this.scene.background = bg;
    const fogA = new THREE.Color(a.fog);
    const fogB = new THREE.Color(b.fog);
    this.scene.fog = new THREE.Fog(fogA.clone().lerp(fogB, blend), 20, 70);
  }

  setSeason(s: Season) {
    this.season = s;
    // live re-tint of foliage without full rebuild
    const colorSets: Record<Season, number[]> = {
      summer: [0x3c7a42, 0x4f9a52, 0x2e5e36],
      autumn: [0xb3792a, 0xd4972f, 0xe9b94a],
      winter: [0x587a3a, 0x3a5a2a, 0x4f6a3f],
    };
    const cols = colorSets[s];
    this.world.foliageMeshes.forEach((m, i) => {
      (m.material as THREE.MeshLambertMaterial).color.set(cols[i % cols.length]);
    });
  }

  // --------------------------------------------------------------- players
  private createPlayers() {
    const redSkins = [0xf2c49b, 0xdba06f, 0xb87b4d];
    const blueSkins = [0xe8b78a, 0x8c5a35, 0xf2c49b];
    const hair = [0x201c14, 0x3a2a1a, 0x1a1a1a];

    for (let i = 0; i < 3; i++) {
      const { group, parts } = buildCharacter({
        skin: redSkins[i],
        hair: hair[i % hair.length],
        jersey: 0xc0362c,
        shorts: 0xe8e4d8,
        sock: 0xc0362c,
        headband: i === 1,
        wristband: true,
        kneepad: i === 2,
        number: i + 1,
      });
      this.scene.add(group);
      const animator = new CharacterAnimator(parts);
      const p: PlayerEntity = {
        team: "RED",
        index: i,
        number: i + 1,
        isHuman: i === 0,
        group,
        animator,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        facing: 0,
        jumpVel: 0,
        grounded: true,
        moveTarget: null,
        actionCooldown: 0,
        reach: 1.1,
        sideSign: -1,
        diveTimer: 0,
      };
      this.players.push(p);
    }
    for (let i = 0; i < 3; i++) {
      const { group, parts } = buildCharacter({
        skin: blueSkins[i],
        hair: hair[i % hair.length],
        jersey: 0x2f5fb0,
        shorts: 0xe8e4d8,
        sock: 0x2f5fb0,
        headband: i === 2,
        wristband: true,
        kneepad: i === 1,
        number: i + 1,
      });
      this.scene.add(group);
      const animator = new CharacterAnimator(parts);
      const p: PlayerEntity = {
        team: "BLUE",
        index: i,
        number: i + 1,
        isHuman: false,
        group,
        animator,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        facing: Math.PI,
        jumpVel: 0,
        grounded: true,
        moveTarget: null,
        actionCooldown: 0,
        reach: 1.1,
        sideSign: 1,
        diveTimer: 0,
      };
      this.players.push(p);
    }
    this.resetFormation();
  }

  private teamPlayers(team: TeamId) {
    return this.players.filter((p) => p.team === team);
  }
  private humanPlayer() {
    return this.players.find((p) => p.team === "RED" && p.isHuman)!;
  }

  resetFormation() {
    const redForm = formationPositions(-1);
    const blueForm = formationPositions(1);
    this.teamPlayers("RED").forEach((p, i) => {
      p.pos.set(redForm[i].x, 0, redForm[i].z);
      p.vel.set(0, 0, 0);
      p.facing = 0;
      p.animator.setState("ready");
    });
    this.teamPlayers("BLUE").forEach((p, i) => {
      p.pos.set(blueForm[i].x, 0, blueForm[i].z);
      p.vel.set(0, 0, 0);
      p.facing = Math.PI;
      p.animator.setState("ready");
    });
    this.syncGroups();
  }

  private setServePositions() {
    const sign = this.serverTeam === "RED" ? -1 : 1;
    const serving = servePositions(sign as 1 | -1);
    const receivingSign = sign === -1 ? 1 : -1;
    const receiving = formationPositions(receivingSign as 1 | -1);
    this.teamPlayers(this.serverTeam).forEach((p, i) => {
      p.pos.set(serving[i].x, 0, serving[i].z);
      p.animator.setState("ready");
    });
    const otherTeam: TeamId = this.serverTeam === "RED" ? "BLUE" : "RED";
    this.teamPlayers(otherTeam).forEach((p, i) => {
      p.pos.set(receiving[i].x, 0, receiving[i].z);
      p.animator.setState("ready");
    });
    this.syncGroups();
  }

  private syncGroups() {
    for (const p of this.players) {
      p.group.position.set(p.pos.x, p.pos.y, p.pos.z);
      p.group.rotation.y = p.facing;
    }
  }

  // --------------------------------------------------------------- input
  private setupInput() {
    window.addEventListener("keydown", (e) => {
      if (!this.keys.has(e.code)) this.keysPressed.add(e.code);
      this.keys.add(e.code);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));

    const dom = this.renderer.domElement;
    dom.style.touchAction = "none";

    dom.addEventListener("pointerdown", (e) => {
      this.audio.start();
      this.pointerDown = true;
      this.pointerMovedFar = false;
      this.pointerStart.set(e.clientX, e.clientY);
      this.pointerLast.set(e.clientX, e.clientY);
    });
    window.addEventListener("pointermove", (e) => {
      if (!this.pointerDown) return;
      const dx = e.clientX - this.pointerLast.x;
      if (Math.abs(e.clientX - this.pointerStart.x) + Math.abs(e.clientY - this.pointerStart.y) > 8) {
        this.pointerMovedFar = true;
        this.azimuth += dx * 0.008;
        this.azimuthTarget = this.azimuth;
      }
      this.pointerLast.set(e.clientX, e.clientY);
    });
    window.addEventListener("pointerup", (e) => {
      if (this.pointerDown && !this.pointerMovedFar) {
        this.handleTap(e.clientX, e.clientY);
      }
      this.pointerDown = false;
    });
    dom.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoomTarget = THREE.MathUtils.clamp(this.zoomTarget + e.deltaY * 0.001, 0.55, 1.8);
      },
      { passive: false }
    );

    // pinch zoom
    const touches = new Map<number, THREE.Vector2>();
    dom.addEventListener("touchstart", (e) => {
      for (const t of Array.from(e.touches)) touches.set(t.identifier, new THREE.Vector2(t.clientX, t.clientY));
    });
    dom.addEventListener(
      "touchmove",
      (e) => {
        for (const t of Array.from(e.touches)) touches.set(t.identifier, new THREE.Vector2(t.clientX, t.clientY));
        if (e.touches.length === 2) {
          e.preventDefault();
          const pts = Array.from(e.touches);
          const d = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
          if (this.pinchDist != null) {
            const delta = this.pinchDist - d;
            this.zoomTarget = THREE.MathUtils.clamp(this.zoomTarget + delta * 0.003, 0.55, 1.8);
          }
          this.pinchDist = d;
        }
      },
      { passive: false }
    );
    dom.addEventListener("touchend", (e) => {
      if (e.touches.length < 2) this.pinchDist = null;
    });
  }

  private handleTap(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (ray.ray.intersectPlane(plane, hit)) {
      this.markerPos = new THREE.Vector2(
        THREE.MathUtils.clamp(hit.x, -COURT.halfWidth - 2, COURT.halfWidth + 2),
        THREE.MathUtils.clamp(hit.z, -COURT.halfLength - 2, COURT.halfLength + 2)
      );
      const human = this.humanPlayer();
      human.moveTarget = this.markerPos.clone();
    }
  }

  rotateCamera(dir: -1 | 1) {
    this.azimuthTarget += (Math.PI / 2) * dir;
  }
  zoomBy(delta: number) {
    this.zoomTarget = THREE.MathUtils.clamp(this.zoomTarget + delta, 0.55, 1.8);
  }

  switchPlayer(dir: -1 | 1) {
    const redTeam = this.teamPlayers("RED");
    const cur = redTeam.findIndex((p) => p.isHuman);
    redTeam[cur].isHuman = false;
    let next = (cur + dir + redTeam.length) % redTeam.length;
    redTeam[next].isHuman = true;
    this.selectedIndex = next;
  }

  mobileAction(action: "jump" | "bump" | "set" | "spike" | "serve") {
    const human = this.humanPlayer();
    if (action === "jump") {
      this.queueMobileJump();
      return;
    }
    this.tryAction(human, action === "serve" ? "spike" : action, false);
  }
  setMobileMove(x: number, z: number) {
    this.mobileMoveVec.set(x, z);
  }
  setMobileSprint(v: boolean) {
    this.mobileSprint = v;
  }

  // --------------------------------------------------------------- camera
  private updateCameraTransform() {
    const dist = 24 * this.zoomLevel;
    const x = Math.sin(this.azimuth) * Math.cos(this.elevation) * dist;
    const y = Math.sin(this.elevation) * dist;
    const z = Math.cos(this.azimuth) * Math.cos(this.elevation) * dist;
    this.camera.position.set(this.camTarget.x + x, this.camTarget.y + y, this.camTarget.z + z);
    this.camera.lookAt(this.camTarget);
    const s = CAMERA_FRUSTUM * this.zoomLevel;
    this.camera.left = -s;
    this.camera.right = s;
    this.camera.top = s * (this.container.clientHeight / Math.max(1, this.container.clientWidth)) * (this.container.clientWidth / this.container.clientHeight);
    this.camera.top = s;
    this.camera.bottom = -s;
    this.camera.updateProjectionMatrix();
  }

  // --------------------------------------------------------------- resize
  handleResize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, true);
    const lw = Math.max(64, Math.floor(w / this.pixelSize));
    const lh = Math.max(64, Math.floor(h / this.pixelSize));
    this.lowResTarget.setSize(lw, lh);
    this.postMaterial.uniforms.resolution.value.set(lw, lh);
    const aspect = w / h;
    const s = CAMERA_FRUSTUM * this.zoomLevel;
    this.camera.left = -s * aspect;
    this.camera.right = s * aspect;
    this.camera.top = s;
    this.camera.bottom = -s;
    this.camera.updateProjectionMatrix();
  };

  setPixelSize(n: number) {
    this.pixelSize = THREE.MathUtils.clamp(n, 2, 6);
    this.handleResize();
  }
  setPaletteEnabled(b: boolean) {
    this.paletteEnabled = b;
  }
  setOutlineEnabled(b: boolean) {
    this.outlineEnabled = b;
  }
  setDitherEnabled(b: boolean) {
    this.ditherEnabled = b;
  }
  setRaw3D(b: boolean) {
    this.raw3D = b;
  }
  setSfxEnabled(b: boolean) {
    this.audio.sfxEnabled = b;
    this.audio.updateSfxGain();
  }
  setAmbientEnabled(b: boolean) {
    this.audio.ambientEnabled = b;
    this.audio.updateAmbientGain();
  }

  // --------------------------------------------------------------- messages
  showMessage(text: string, duration = 1.8) {
    this.message = text;
    this.messageTimer = duration;
    this.messageKey++;
  }

  // --------------------------------------------------------------- match flow
  startMatch() {
    this.score.RED = 0;
    this.score.BLUE = 0;
    this.sets.RED = 0;
    this.sets.BLUE = 0;
    this.setNumber = 1;
    this.winner = null;
    this.serverTeam = "RED";
    this.running = true;
    this.paused = false;
    this.beginServePhase();
    this.audio.start();
  }

  restartMatch() {
    this.startMatch();
    this.showMessage("NEW MATCH! SERVE!", 2);
  }

  togglePause() {
    if (!this.running) return;
    this.paused = !this.paused;
  }

  private beginServePhase() {
    this.phase = "serve-wait";
    this.phaseTimer = 0;
    this.rallyActive = false;
    this.rallyTouches.RED = 0;
    this.rallyTouches.BLUE = 0;
    this.rallyTouchedByReceiver = false;
    this.rallyCurrentSide = this.serverTeam;
    this.setServePositions();
    const sign = this.serverTeam === "RED" ? -1 : 1;
    const server = this.teamPlayers(this.serverTeam)[0];
    this.ball.setPosition(server.pos.x, 1.1, server.pos.z + sign * 0.6);
    this.ball.held = true;
    const isMatchPoint =
      Math.max(this.score.RED, this.score.BLUE) >= POINTS_TO_WIN_SET - 1 &&
      Math.abs(this.score.RED - this.score.BLUE) >= MIN_WIN_MARGIN - 1;
    this.showMessage(isMatchPoint ? "MATCH POINT! SERVE!" : "SERVE!", 1.6);
  }

  private endRally(winner: TeamId, reasonMsg?: string) {
    if (!this.rallyActive && this.phase !== "rally") return;
    this.rallyActive = false;
    this.score[winner]++;
    if (reasonMsg) this.showMessage(reasonMsg, 1.5);
    this.audio.point();
    const prevServer = this.serverTeam;
    this.serverTeam = winner;

    // check set win
    const r = this.score.RED;
    const b = this.score.BLUE;
    const leader = r > b ? "RED" : b > r ? "BLUE" : null;
    const diff = Math.abs(r - b);
    if (leader && Math.max(r, b) >= POINTS_TO_WIN_SET && diff >= MIN_WIN_MARGIN) {
      this.sets[leader]++;
      this.phase = "set-celebration";
      this.phaseTimer = 0;
      const champion = this.sets[leader] >= SETS_TO_WIN_MATCH;
      this.showMessage(champion ? "VICTORY!" : "SET WON!", 2.6);
      this.triggerCelebration(leader);
      if (champion) {
        this.winner = leader;
        this.audio.victory();
      } else {
        this.audio.victory();
      }
      return;
    }

    this.phase = "point-pause";
    this.phaseTimer = 0;
    void prevServer;
  }

  private triggerCelebration(team: TeamId) {
    this.teamPlayers(team).forEach((p) => p.animator.setState("celebrate"));
    const other: TeamId = team === "RED" ? "BLUE" : "RED";
    this.teamPlayers(other).forEach((p) => p.animator.setState("kneel"));
  }

  private nextSetOrFinish() {
    if (this.winner) {
      this.phase = "match-over";
      return;
    }
    this.setNumber++;
    this.score.RED = 0;
    this.score.BLUE = 0;
    this.beginServePhase();
  }

  // --------------------------------------------------------------- update
  update(dt: number) {
    dt = Math.min(dt, 1 / 20);
    if (this.paused || !this.running) {
      this.renderFrame();
      return;
    }

    this.lightBlend = Math.min(1, this.lightBlend + dt / 1.6);
    this.applyLighting(this.lightBlend);

    this.azimuth = THREE.MathUtils.damp(this.azimuth, this.azimuthTarget, 8, dt);
    this.zoomLevel = THREE.MathUtils.damp(this.zoomLevel, this.zoomTarget, 8, dt);
    this.updateCameraTransform();

    this.world.update(dt, this.clock.elapsedTime);

    if (this.messageTimer > 0) this.messageTimer -= dt;

    switch (this.phase) {
      case "serve-wait":
        this.updateServeWait(dt);
        break;
      case "rally":
        this.updateRally(dt);
        break;
      case "point-pause":
        this.phaseTimer += dt;
        this.updateIdlePlayers(dt);
        if (this.phaseTimer > 1.3) this.beginServePhase();
        break;
      case "set-celebration":
        this.phaseTimer += dt;
        this.updateCelebrationAnim(dt);
        if (this.phaseTimer > 2.4) this.nextSetOrFinish();
        break;
      case "match-over":
        this.updateCelebrationAnim(dt);
        break;
    }

    this.markerMesh.visible = !!this.markerPos && this.phase !== "match-over";
    if (this.markerPos) {
      this.markerMesh.position.set(this.markerPos.x, 0.03, this.markerPos.y);
    }

    this.keysPressed.clear();
    this.pushUiState(dt);
    this.renderFrame();
  }

  private updateIdlePlayers(dt: number) {
    for (const p of this.players) {
      this.moveTowardsFormation(p, dt);
      p.animator.update(dt, 0);
    }
  }

  private updateCelebrationAnim(dt: number) {
    for (const p of this.players) {
      p.animator.update(dt, 0);
    }
  }

  private moveTowardsFormation(p: PlayerEntity, dt: number) {
    const form = formationPositions(p.sideSign)[p.index];
    const dx = form.x - p.pos.x;
    const dz = form.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.05) {
      const speed = 2.2;
      p.pos.x += (dx / d) * Math.min(speed * dt, d);
      p.pos.z += (dz / d) * Math.min(speed * dt, d);
      p.facing = Math.atan2(dx, dz);
    }
    this.syncOne(p);
  }

  private syncOne(p: PlayerEntity) {
    p.group.position.set(p.pos.x, p.pos.y, p.pos.z);
    p.group.rotation.y = p.facing;
  }

  private updateServeWait(dt: number) {
    this.phaseTimer += dt;
    const server = this.teamPlayers(this.serverTeam)[0];
    for (const p of this.players) {
      if (p !== server) this.moveTowardsFormation(p, dt);
    }
    // keep ball glued to server hand
    const sign = server.sideSign;
    this.ball.setPosition(server.pos.x, 1.1, server.pos.z + sign * 0.55);

    if (server.isHuman) {
      this.handleHumanMovement(server, dt, true);
      server.animator.update(dt, 0);
      this.contextHint = "PRESS L TO SERVE";
      if (this.keysPressed.has("KeyL") || this.consumeMobileServe) {
        this.consumeMobileServe = false;
        this.performServe(server);
      }
    } else {
      server.animator.update(dt, 0);
      if (this.phaseTimer > 0.9) {
        this.performServe(server);
      }
    }
  }

  consumeMobileServe = false;

  private performServe(server: PlayerEntity) {
    const jump = this.rng.next() > 0.5;
    server.animator.setState(jump ? "serveJump" : "serveUnder");
    this.audio.serve();
    const sign = server.sideSign;
    const targetSign = -sign;
    const aim =
      this.markerPos && Math.sign(this.markerPos.y) === targetSign
        ? new THREE.Vector3(this.markerPos.x, 0, this.markerPos.y)
        : pickAttackTarget(targetSign as 1 | -1, this.rng, 0.3);
    this.markerPos = null;
    const from = new THREE.Vector3(server.pos.x, 1.3, server.pos.z);
    this.ball.setPosition(from.x, from.y, from.z);
    this.ball.launch(aim, 3.4, from);
    this.ball.lastToucherTeam = server.team;
    this.ball.lastToucherSide = sign;
    this.phase = "rally";
    this.rallyActive = true;
    this.rallyCurrentSide = server.team;
    this.rallyTouches[server.team] = 1;
    this.rallyTouchedByReceiver = false;
  }

  private updateRally(dt: number) {
    // physics substeps are internal to ball.step
    const prevZSign = Math.sign(this.ball.mesh.position.z || 0.0001);
    const events = this.ball.step(dt, COURT.poleX - 0.25);
    const newZSign = Math.sign(this.ball.mesh.position.z || 0.0001);

    if (newZSign !== prevZSign && this.rallyCurrentSide) {
      const newSideTeam: TeamId = newZSign < 0 ? "RED" : "BLUE";
      if (newSideTeam !== this.rallyCurrentSide) {
        this.rallyCurrentSide = newSideTeam;
        this.rallyTouches[newSideTeam] = 0;
        if (newSideTeam !== this.serverTeam) {
          // ball has reached the receiving team's side for the first time check handled by touches
        }
      }
    }

    for (const ev of events) {
      if (ev.type === "net") {
        this.showMessage("NET TOUCH!", 1.3);
        this.audio.net();
      } else if (ev.type === "ground") {
        this.audio.floor();
        const sideTeam: TeamId = ev.z < 0 ? "RED" : "BLUE";
        if (ev.inBounds) {
          const winner: TeamId = sideTeam === "RED" ? "BLUE" : "RED";
          const ace =
            !this.rallyTouchedByReceiver &&
            this.ball.lastToucherTeam === this.serverTeam &&
            winner === this.serverTeam;
          this.endRally(winner, ace ? "ACE!" : "NICE RALLY!");
        } else {
          const winner: TeamId = this.ball.lastToucherTeam === "RED" ? "BLUE" : "RED";
          this.endRally(winner, "OUT!");
        }
        return;
      }
    }

    // touches by receiving team tracking for ace detection
    if (this.ball.lastToucherTeam && this.ball.lastToucherTeam !== this.serverTeam) {
      this.rallyTouchedByReceiver = true;
    }

    // player control + AI
    const human = this.humanPlayer();
    this.handleHumanMovement(human, dt, false);
    for (const p of this.players) {
      if (p === human) continue;
      this.updateAIPlayer(p, dt);
    }
    this.handleHumanActions(human, dt);
    this.checkContacts(dt);

    for (const p of this.players) {
      const moving = p.vel.lengthSq() > 0.001;
      if (!["bump", "set", "spike", "serveJump", "serveUnder", "block", "dive", "kneel", "getup", "celebrate"].includes(p.animator.state)) {
        p.animator.setState(moving ? (p.isHuman && this.mobileSprint ? "run" : "walk") : "ready");
      }
      p.animator.update(dt, Math.min(1, p.vel.length() / 3));
      this.syncOne(p);
    }
  }

  // ------------------------------------------------------------- movement
  private handleHumanMovement(p: PlayerEntity, dt: number, lockToServe: boolean) {
    let mx = 0,
      mz = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) mz -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) mz += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) mx -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) mx += 1;
    mx += this.mobileMoveVec.x;
    mz += this.mobileMoveVec.y;
    const len = Math.hypot(mx, mz);
    const sprint = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.mobileSprint;
    const speed = sprint ? 4.6 : 3.0;

    if (len > 0.05) {
      p.moveTarget = null;
      mx /= len;
      mz /= len;
      p.vel.set(mx * speed, 0, mz * speed);
      p.facing = Math.atan2(mx, mz);
    } else if (p.moveTarget) {
      const dx = p.moveTarget.x - p.pos.x;
      const dz = p.moveTarget.y - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.15) {
        p.vel.set((dx / d) * speed, 0, (dz / d) * speed);
        p.facing = Math.atan2(dx, dz);
      } else {
        p.vel.set(0, 0, 0);
        p.moveTarget = null;
      }
    } else {
      p.vel.set(0, 0, 0);
    }

    let nx = p.pos.x + p.vel.x * dt;
    let nz = p.pos.z + p.vel.z * dt;
    if (lockToServe) {
      // stay behind own baseline during serve wait
      const sign = p.sideSign;
      const limit = COURT.halfLength + 2.2;
      const baseline = COURT.halfLength + 0.15;
      nz = sign < 0 ? THREE.MathUtils.clamp(nz, -limit, -baseline) : THREE.MathUtils.clamp(nz, baseline, limit);
    } else {
      nz = p.sideSign < 0 ? Math.min(nz, -0.15) : Math.max(nz, 0.15);
    }
    nx = THREE.MathUtils.clamp(nx, -COURT.halfWidth - 1.6, COURT.halfWidth + 1.6);
    nz = THREE.MathUtils.clamp(nz, -COURT.halfLength - 2.2, COURT.halfLength + 2.2);
    p.pos.x = nx;
    p.pos.z = nz;

    // jump
    if ((this.keysPressed.has("Space") || this.mobileJumpQueued) && p.grounded) {
      p.jumpVel = 5.6;
      p.grounded = false;
      this.mobileJumpQueued = false;
    }
    this.integrateVertical(p, dt);
  }

  mobileJumpQueued = false;
  queueMobileJump() {
    this.mobileJumpQueued = true;
  }

  private integrateVertical(p: PlayerEntity, dt: number) {
    if (!p.grounded) {
      p.jumpVel += PHYSICS.gravity * dt * 0.65;
      p.pos.y += p.jumpVel * dt;
      if (p.pos.y <= 0) {
        p.pos.y = 0;
        p.grounded = true;
        p.jumpVel = 0;
      }
    }
  }

  private handleHumanActions(p: PlayerEntity, _dt: number) {
    if (this.keysPressed.has("KeyJ")) this.tryAction(p, "bump", false);
    if (this.keysPressed.has("KeyK")) this.tryAction(p, "set", false);
    if (this.keysPressed.has("KeyL")) this.tryAction(p, "spike", false);
    if (this.mobileActionQueue) {
      const act = this.mobileActionQueue;
      this.mobileActionQueue = null;
      this.tryAction(p, act, false);
    }
  }

  mobileActionQueue: "bump" | "set" | "spike" | null = null;
  queueMobileAction(a: "bump" | "set" | "spike" | "serve") {
    if (this.phase === "serve-wait") {
      this.consumeMobileServe = true;
    } else {
      this.mobileActionQueue = a === "serve" ? "spike" : a;
    }
  }

  // Determine the human player's contextual action hint.
  private computeContextHint(human: PlayerEntity) {
    if (this.phase === "serve-wait" && human.team === this.serverTeam) return "L: SERVE";
    const dist = human.pos.distanceTo(this.ball.mesh.position);
    if (dist < 2.6 && this.ball.mesh.position.y < 2.2 && this.sameSide(human)) {
      if (this.ball.mesh.position.y < 1.2) return "J: BUMP";
      if (Math.abs(human.pos.z) < COURT.attackLineDist + 0.5) return "K: SET";
      return "L: SPIKE";
    }
    return "MOVE WITH WASD";
  }

  private sameSide(p: PlayerEntity) {
    return Math.sign(this.ball.mesh.position.z || 0.0001) === p.sideSign;
  }

  // ---------------------------------------------------------------- AI
  private updateAIPlayer(p: PlayerEntity, dt: number) {
    const ballPos = this.ball.mesh.position;
    const ballOnMySide = Math.sign(ballPos.z || 0.0001) === p.sideSign;
    const teammates = this.teamPlayers(p.team).filter((t) => t !== p);
    let target: THREE.Vector3;

    if (ballOnMySide && this.rallyTouches[p.team] < MAX_TOUCHES) {
      const landing = this.ball.predictLanding(2.5);
      const clamped = clampToCourtSide(landing.x, landing.z, p.sideSign, 0.4);
      // find the closest eligible player on the team to the predicted spot to avoid stacking
      const myDist = Math.hypot(clamped.x - p.pos.x, clamped.y - p.pos.z);
      const otherCloser = teammates.some((t) => {
        const d = Math.hypot(clamped.x - t.pos.x, clamped.y - t.pos.z);
        return d < myDist - 0.3;
      });
      if (!otherCloser && ballPos.y < 5) {
        target = new THREE.Vector3(clamped.x, 0, clamped.y);
      } else {
        const form = formationPositions(p.sideSign)[p.index];
        target = form.clone();
      }
    } else {
      const form = formationPositions(p.sideSign)[p.index];
      target = form.clone();
      // front row players near net shift toward ball x for blocking shape
      if (!ballOnMySide && Math.abs(ballPos.z) < COURT.attackLineDist + 1.5) {
        target.x = THREE.MathUtils.clamp(ballPos.x, -COURT.halfWidth + 0.6, COURT.halfWidth - 0.6);
      }
    }

    const dx = target.x - p.pos.x;
    const dz = target.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    const speed = 2.6;
    if (d > 0.1) {
      const step = Math.min(speed * dt, d);
      p.pos.x += (dx / d) * step;
      p.pos.z += (dz / d) * step;
      p.facing = Math.atan2(dx, dz);
      p.vel.set((dx / d) * speed, 0, (dz / d) * speed);
    } else {
      p.vel.set(0, 0, 0);
    }
    p.pos.z = p.sideSign < 0 ? Math.min(p.pos.z, -0.15) : Math.max(p.pos.z, 0.15);
    p.pos.x = THREE.MathUtils.clamp(p.pos.x, -COURT.halfWidth - 1.2, COURT.halfWidth + 1.2);

    this.integrateVertical(p, dt);

    // AI jump for block/spike
    if (p.grounded) {
      const distBall = p.pos.distanceTo(ballPos);
      const nearNet = Math.abs(p.pos.z) < COURT.attackLineDist;
      if (!ballOnMySide && nearNet && ballPos.y > COURT.netHeight - 0.3 && distBall < 1.6 && ballPos.y < COURT.netHeight + 1.3) {
        if (this.rng.next() < 0.06) {
          p.jumpVel = 5.2;
          p.grounded = false;
          p.animator.setState("block");
        }
      }
    }
  }

  // ------------------------------------------------------------ contacts
  private tryAction(p: PlayerEntity, action: "bump" | "set" | "spike", wantJump: boolean) {
    if (p.actionCooldown > 0) return;
    const ballPos = this.ball.mesh.position;
    const dist = p.pos.distanceTo(ballPos);
    if (dist > p.reach + 0.5 || !this.sameSide(p) || this.rallyTouches[p.team] >= MAX_TOUCHES) return;
    if (wantJump && p.grounded) {
      p.jumpVel = 5.4;
      p.grounded = false;
    }
    this.resolveContact(p, action);
  }

  private checkContacts(_dt: number) {
    const ballPos = this.ball.mesh.position;
    for (const p of this.players) {
      if (p.isHuman) continue; // human handled via explicit key actions
      if (p.actionCooldown > 0) continue;
      if (this.rallyTouches[p.team] >= MAX_TOUCHES) continue;
      if (!this.sameSide(p)) continue;
      const dist = p.pos.distanceTo(ballPos);
      const heightOk = ballPos.y < 2.9 && ballPos.y > 0.15;
      if (dist < p.reach && heightOk && this.ball.velocity.y < 6) {
        const touches = this.rallyTouches[p.team];
        let action: "bump" | "set" | "spike" = "bump";
        if (touches === 0) action = ballPos.y < 1.3 ? "bump" : "set";
        else if (touches === 1) action = "set";
        else action = "spike";
        if (ballPos.y > COURT.netHeight - 0.2 && Math.abs(p.pos.z) < COURT.attackLineDist + 0.6 && touches >= 1) {
          action = "spike";
          if (p.grounded) {
            p.jumpVel = 5.6;
            p.grounded = false;
          }
        }
        this.resolveContact(p, action);
      }
    }
  }

  private resolveContact(p: PlayerEntity, action: "bump" | "set" | "spike") {
    const touches = this.rallyTouches[p.team];
    if (touches >= MAX_TOUCHES) return;
    this.rallyTouches[p.team] = touches + 1;
    this.ball.lastToucherTeam = p.team;
    this.ball.lastToucherSide = p.sideSign;
    p.actionCooldown = 0.35;

    const teammates = this.teamPlayers(p.team).filter((t) => t !== p);
    const contactPos = new THREE.Vector3(p.pos.x, Math.max(ball_y(p), 0.9), p.pos.z);

    if (action === "bump") {
      p.animator.setState("bump");
      this.audio.bump();
      const setter = teammates.reduce((a, b) =>
        Math.abs(a.pos.x) < Math.abs(b.pos.x) ? a : b
      , teammates[0]);
      const target = setter
        ? new THREE.Vector3(setter.pos.x + p.sideSign * -0.4, 0, setter.pos.z)
        : new THREE.Vector3(0, 0, (COURT.attackLineDist - 0.5) * p.sideSign);
      const clamped = clampToCourtSide(target.x, target.z, p.sideSign, 0.5);
      this.ball.launch(new THREE.Vector3(clamped.x, 0.1, clamped.y), 3.0, contactPos);
      this.showMessage("NICE RECEIVE!", 1.1);
      this.messagePendingAttack = false;
    } else if (action === "set") {
      p.animator.setState("set");
      this.audio.set();
      const hitter = teammates.find((t) => t.index === 2) || teammates[0];
      const target = hitter
        ? new THREE.Vector3(hitter.pos.x, 0, (COURT.attackLineDist - 1.2) * p.sideSign)
        : new THREE.Vector3(1.5 * p.sideSign, 0, (COURT.attackLineDist - 1.2) * p.sideSign);
      const clamped = clampToCourtSide(target.x, target.z, p.sideSign, 0.5);
      this.ball.launch(new THREE.Vector3(clamped.x, 0.15, clamped.y), 3.6, contactPos);
      this.showMessage("SET!", 1.0);
    } else {
      const isJump = !p.grounded || p.animator.state === "spike";
      p.animator.setState("spike");
      this.audio.spike();
      const pressure = this.rng.next();
      const aimTarget =
        this.markerPos && Math.sign(this.markerPos.y) === -p.sideSign
          ? new THREE.Vector3(this.markerPos.x, 0, this.markerPos.y)
          : pickAttackTarget(-p.sideSign as 1 | -1, this.rng, pressure);
      this.markerPos = null;
      const apex = contactPos.y + (isJump ? 0.25 : 0.6);
      this.ball.launch(aimTarget, apex, contactPos);
      this.showMessage(isJump ? "SPIKE!" : "ATTACK!", 1.1);
    }
  }

  messagePendingAttack = false;

  // ---------------------------------------------------------------- UI
  private pushUiState(dt: number) {
    this.uiTimer += dt;
    const human = this.humanPlayer();
    this.contextHint = this.computeContextHint(human);
    if (this.uiTimer < 0.08 && this.messageTimer > 0.01) return;
    this.uiTimer = 0;
    if (!this.uiCallback) return;
    this.uiCallback({
      scoreRed: this.score.RED,
      scoreBlue: this.score.BLUE,
      setsRed: this.sets.RED,
      setsBlue: this.sets.BLUE,
      setNumber: this.setNumber,
      serverTeam: this.serverTeam,
      message: this.messageTimer > 0 ? this.message : "",
      messageKey: this.messageKey,
      selectedPlayerNumber: human.number,
      contextHint: this.contextHint,
      matchPhase: this.phase,
      paused: this.paused,
      matchStarted: this.running,
      winner: this.winner,
    });
  }

  // ---------------------------------------------------------------- render
  renderFrame() {
    if (this.raw3D) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.postMaterial.uniforms.paletteEnabled.value = this.paletteEnabled ? 1 : 0;
    this.postMaterial.uniforms.outlineEnabled.value = this.outlineEnabled ? 1 : 0;
    this.postMaterial.uniforms.ditherEnabled.value = this.ditherEnabled ? 1 : 0;
    this.postMaterial.uniforms.cameraNear.value = this.camera.near;
    this.postMaterial.uniforms.cameraFar.value = this.camera.far;
    this.renderer.setRenderTarget(this.lowResTarget);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCamera);
  }

  // ---------------------------------------------------------------- loop
  private rafId = 0;
  start() {
    const loop = () => {
      if (this.disposed) return;
      const dt = this.clock.getDelta();
      this.update(dt);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener("resize", this.handleResize);
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

function ball_y(_p: PlayerEntity) {
  return 1.2;
}
