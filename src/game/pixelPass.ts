import * as THREE from "three";
import { PALETTE_RGB } from "./palette";

// Pixel-perfect upscale + depth outline + OKLab palette quantization + Bayer dithering.
export function createPixelPassMaterial() {
  const paletteCount = PALETTE_RGB.length / 3;
  const paletteVec = [];
  for (let i = 0; i < paletteCount; i++) {
    paletteVec.push(
      new THREE.Vector3(PALETTE_RGB[i * 3], PALETTE_RGB[i * 3 + 1], PALETTE_RGB[i * 3 + 2])
    );
  }

  const material = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: null },
      tDepth: { value: null },
      resolution: { value: new THREE.Vector2(1, 1) },
      cameraNear: { value: 0.1 },
      cameraFar: { value: 200 },
      outlineEnabled: { value: 1 },
      paletteEnabled: { value: 1 },
      ditherEnabled: { value: 1 },
      paletteColors: { value: paletteVec },
      paletteCount: { value: paletteCount },
      lightnessWeight: { value: 1.35 },
      time: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D tColor;
      uniform sampler2D tDepth;
      uniform vec2 resolution;
      uniform float cameraNear;
      uniform float cameraFar;
      uniform int outlineEnabled;
      uniform int paletteEnabled;
      uniform int ditherEnabled;
      uniform vec3 paletteColors[64];
      uniform int paletteCount;
      uniform float lightnessWeight;
      uniform float time;

      // Orthographic camera depth is already linear in NDC space, so we only
      // need to remap it into view-space distance (unlike perspective cameras).
      float linearizeDepth(float d) {
        return cameraNear + d * (cameraFar - cameraNear);
      }

      vec3 srgbToLinear(vec3 c) {
        return pow(max(c, 0.0), vec3(2.2));
      }
      vec3 linearToSrgb(vec3 c) {
        return pow(max(c, 0.0), vec3(1.0/2.2));
      }

      vec3 linearToOklab(vec3 c) {
        float l = 0.4122214708*c.r + 0.5363325363*c.g + 0.0514459929*c.b;
        float m = 0.2119034982*c.r + 0.6806995451*c.g + 0.1073969566*c.b;
        float s = 0.0883024619*c.r + 0.2817188376*c.g + 0.6299787005*c.b;
        float l_ = sign(l)*pow(abs(l), 1.0/3.0);
        float m_ = sign(m)*pow(abs(m), 1.0/3.0);
        float s_ = sign(s)*pow(abs(s), 1.0/3.0);
        return vec3(
          0.2104542553*l_ + 0.793617785*m_ - 0.0040720468*s_,
          1.9779984951*l_ - 2.428592205*m_ + 0.4505937099*s_,
          0.0259040371*l_ + 0.7827717662*m_ - 0.808675766*s_
        );
      }

      vec3 quantize(vec3 srgbColor) {
        vec3 lab = linearToOklab(srgbToLinear(srgbColor));
        float bestDist = 1e9;
        vec3 best = srgbColor;
        for (int i = 0; i < 64; i++) {
          if (i >= paletteCount) break;
          vec3 pLab = linearToOklab(srgbToLinear(paletteColors[i]));
          float dl = (lab.x - pLab.x) * lightnessWeight;
          float da = lab.y - pLab.y;
          float db = lab.z - pLab.z;
          float dist = dl*dl + da*da + db*db;
          if (dist < bestDist) {
            bestDist = dist;
            best = paletteColors[i];
          }
        }
        return best;
      }

      float bayer4x4(vec2 p) {
        int x = int(mod(p.x, 4.0));
        int y = int(mod(p.y, 4.0));
        float m[16];
        m[0]=0.0;  m[1]=8.0;  m[2]=2.0;  m[3]=10.0;
        m[4]=12.0; m[5]=4.0;  m[6]=14.0; m[7]=6.0;
        m[8]=3.0;  m[9]=11.0; m[10]=1.0; m[11]=9.0;
        m[12]=15.0;m[13]=7.0; m[14]=13.0;m[15]=5.0;
        int idx = y*4 + x;
        for (int i = 0; i < 16; i++) {
          if (i == idx) return m[i] / 16.0;
        }
        return 0.0;
      }

      void main() {
        vec2 texel = 1.0 / resolution;
        vec3 color = texture2D(tColor, vUv).rgb;

        if (outlineEnabled == 1) {
          float d = texture2D(tDepth, vUv).r;
          float dCenter = linearizeDepth(d);
          float maxDiff = 0.0;
          vec2 offsets[4];
          offsets[0] = vec2(texel.x, 0.0);
          offsets[1] = vec2(-texel.x, 0.0);
          offsets[2] = vec2(0.0, texel.y);
          offsets[3] = vec2(0.0, -texel.y);
          for (int i = 0; i < 4; i++) {
            float dn = linearizeDepth(texture2D(tDepth, vUv + offsets[i]).r);
            maxDiff = max(maxDiff, abs(dCenter - dn));
          }
          float outline = smoothstep(0.08, 0.5, maxDiff / max(dCenter, 1.0) * 6.0);
          color = mix(color, color * 0.25, clamp(outline, 0.0, 0.85));
        }

        if (ditherEnabled == 1) {
          vec2 pixelCoord = floor(vUv * resolution);
          float threshold = (bayer4x4(pixelCoord) - 0.5) * 0.045;
          color += vec3(threshold);
        }

        if (paletteEnabled == 1) {
          color = quantize(clamp(color, 0.0, 1.0));
        }

        gl_FragColor = vec4(color, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

  return material;
}
