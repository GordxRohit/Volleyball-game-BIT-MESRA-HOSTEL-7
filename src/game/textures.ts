import * as THREE from "three";
import { Rng } from "./rng";
import { COURT } from "./constants";

function mkCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, rng: Rng, amount: number, baseAlpha = 0.06) {
  for (let i = 0; i < amount; i++) {
    const x = rng.range(0, w);
    const y = rng.range(0, h);
    const r = rng.range(0.5, 2.2);
    const shade = rng.next() > 0.5 ? "255,255,255" : "0,0,0";
    ctx.fillStyle = `rgba(${shade},${baseAlpha + rng.next() * 0.05})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function makeCourtTexture(rng: Rng): THREE.CanvasTexture {
  const scale = 48;
  const w = Math.round(COURT.halfWidth * 2 * scale) + 80;
  const h = Math.round(COURT.halfLength * 2 * scale) + 80;
  const canvas = mkCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  // base surface (worn reddish-brown court)
  ctx.fillStyle = "#9a5a3e";
  ctx.fillRect(0, 0, w, h);
  // concrete surround
  ctx.fillStyle = "#8f897c";
  const margin = 40;
  ctx.fillRect(0, 0, w, margin);
  ctx.fillRect(0, h - margin, w, margin);
  ctx.fillRect(0, 0, margin, h);
  ctx.fillRect(w - margin, 0, margin, h);
  // playing surface rect
  ctx.fillStyle = "#a9623f";
  ctx.fillRect(margin, margin, w - margin * 2, h - margin * 2);
  // worn patches
  for (let i = 0; i < 140; i++) {
    const x = rng.range(margin, w - margin);
    const y = rng.range(margin, h - margin);
    const r = rng.range(6, 26);
    ctx.fillStyle = `rgba(60,30,20,${rng.range(0.03, 0.09)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  noise(ctx, w, h, rng, 1800, 0.04);

  // lines
  ctx.strokeStyle = "#f4f0e2";
  ctx.lineWidth = 5;
  const cx0 = margin,
    cy0 = margin,
    cx1 = w - margin,
    cy1 = h - margin;
  ctx.strokeRect(cx0, cy0, cx1 - cx0, cy1 - cy0);
  // center line
  const midY = h / 2;
  ctx.beginPath();
  ctx.moveTo(cx0, midY);
  ctx.lineTo(cx1, midY);
  ctx.stroke();
  // attack lines
  const attackPx = COURT.attackLineDist * scale;
  ctx.beginPath();
  ctx.moveTo(cx0, midY - attackPx);
  ctx.lineTo(cx1, midY - attackPx);
  ctx.moveTo(cx0, midY + attackPx);
  ctx.lineTo(cx1, midY + attackPx);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeWallTexture(rng: Rng): THREE.CanvasTexture {
  const w = 512;
  const h = 512;
  const canvas = mkCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#cfc3a8";
  ctx.fillRect(0, 0, w, h);
  // weathering streaks
  for (let i = 0; i < 40; i++) {
    const x = rng.range(0, w);
    ctx.fillStyle = `rgba(90,80,60,${rng.range(0.02, 0.08)})`;
    ctx.fillRect(x, 0, rng.range(2, 10), h);
  }
  noise(ctx, w, h, rng, 2000, 0.035);
  ctx.strokeStyle = "rgba(90,80,60,0.25)";
  ctx.lineWidth = 2;
  for (let y = 0; y < h; y += 26) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeWindowTexture(lit: boolean): THREE.CanvasTexture {
  const canvas = mkCanvas(64, 64);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#3a3a38";
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = lit ? "#ffdf8a" : "#8fb3c8";
  ctx.fillRect(6, 6, 52, 52);
  ctx.strokeStyle = "#2a2a28";
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 52, 52);
  ctx.beginPath();
  ctx.moveTo(32, 6);
  ctx.lineTo(32, 58);
  ctx.moveTo(6, 32);
  ctx.lineTo(58, 32);
  ctx.stroke();
  if (lit) {
    ctx.fillStyle = "rgba(255,223,138,0.25)";
    ctx.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeBallTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = mkCanvas(size, size);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f4efe0";
  ctx.fillRect(0, 0, size, size);
  const cols = ["#e8482f", "#f4efe0", "#2f6fe0"];
  const cell = size / 4;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      ctx.fillStyle = cols[(x + y) % 3];
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  ctx.strokeStyle = "#20201c";
  ctx.lineWidth = 6;
  for (let y = 0; y <= 4; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * cell);
    ctx.lineTo(size, y * cell);
    ctx.stroke();
  }
  for (let x = 0; x <= 4; x++) {
    ctx.beginPath();
    ctx.moveTo(x * cell, 0);
    ctx.lineTo(x * cell, size);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeNetTexture(): THREE.CanvasTexture {
  const w = 256,
    h = 128;
  const canvas = mkCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 1.4;
  const step = 10;
  for (let x = -h; x < w + h; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + h, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + h, 0);
    ctx.stroke();
  }
  // top tape
  ctx.fillStyle = "#f4f0e2";
  ctx.fillRect(0, 0, w, 14);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeGrassTexture(rng: Rng, season: "summer" | "autumn" | "winter"): THREE.CanvasTexture {
  const w = 256,
    h = 256;
  const canvas = mkCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  const base =
    season === "summer" ? "#4f9a52" : season === "autumn" ? "#8a8a3f" : "#8fa385";
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const blade =
    season === "summer" ? "#3c7a42" : season === "autumn" ? "#b3792a" : "#7a8f72";
  for (let i = 0; i < 900; i++) {
    const x = rng.range(0, w);
    const y = rng.range(0, h);
    ctx.fillStyle = blade;
    ctx.fillRect(x, y, 2, rng.range(3, 7));
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeNoticeboardTexture(): THREE.CanvasTexture {
  const canvas = mkCanvas(128, 96);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#5a4328";
  ctx.fillRect(0, 0, 128, 96);
  ctx.fillStyle = "#efe6cf";
  ctx.fillRect(8, 8, 112, 80);
  ctx.strokeStyle = "#8c7a52";
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const y = 16 + i * 14;
    ctx.beginPath();
    ctx.moveTo(16, y);
    ctx.lineTo(112, y);
    ctx.stroke();
  }
  ctx.fillStyle = "#2a2a28";
  ctx.font = "bold 12px sans-serif";
  ctx.fillText("HOSTEL 7", 24, 28);
  ctx.font = "9px sans-serif";
  ctx.fillText("VOLLEYBALL MATCH TODAY", 16, 46);
  ctx.fillText("EVENING 6 PM - COURT", 18, 60);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
