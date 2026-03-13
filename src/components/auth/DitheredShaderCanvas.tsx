'use client';

import { useRef, useEffect, useCallback } from 'react';

// ── Trail config ────────────────────────────────────────────────
const TRAIL_LENGTH = 48;   // number of trail points stored
const TRAIL_INTERVAL = 30; // ms between trail samples

// ── Shader sources ──────────────────────────────────────────────

const VERT = `#version 300 es
precision mediump float;
layout(location = 0) in vec4 a_position;
void main() { gl_Position = a_position; }`;

const FRAG = `#version 300 es
precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform vec4 u_colorBack;
uniform vec4 u_colorFront;
uniform vec2 u_mouse;

// Trail: positions + ages (0 = fresh, 1 = expired)
uniform vec2 u_trail[${TRAIL_LENGTH}];
uniform float u_trailAge[${TRAIL_LENGTH}];
uniform int u_trailCount;

out vec4 fragColor;

#define TWO_PI 6.28318530718
#define PI 3.14159265358979323846

float hash11(float p) {
  p = fract(p * 0.3183099) + 0.1;
  p *= p + 19.19;
  return fract(p * p);
}

const int bayer8x8[64] = int[64](
   0, 32,  8, 40,  2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44,  4, 36, 14, 46,  6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
   3, 35, 11, 43,  1, 33,  9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47,  7, 39, 13, 45,  5, 37,
  63, 31, 55, 23, 61, 29, 53, 21
);

float getBayerValue(vec2 uv) {
  ivec2 pos = ivec2(mod(uv, 8.0));
  int index = pos.y * 8 + pos.x;
  return float(bayer8x8[index]) / 64.0;
}

void main() {
  float t = .5 * u_time;
  vec2 rawUv = gl_FragCoord.xy / u_resolution.xy;
  vec2 uv = rawUv;

  // Pixelization
  float pxSize = 3.50 * u_pixelRatio;
  vec2 pxSizeUv = gl_FragCoord.xy;
  pxSizeUv -= .5 * u_resolution;
  pxSizeUv /= pxSize;
  uv = floor(pxSizeUv) * pxSize / u_resolution.xy + .5 - .5;

  // Pattern UV
  float r = 0.00 * PI / 180.;
  mat2 rot = mat2(cos(r), sin(r), -sin(r), cos(r));
  vec2 shape_uv = uv + vec2(0.05, 0.00);
  shape_uv *= u_resolution.xy / u_pixelRatio / 0.30;
  shape_uv = rot * shape_uv + .5;

  // Cursor parallax — subtle offset toward mouse position
  shape_uv += (u_mouse - 0.5) * 0.3;

  vec2 ditheringNoise_uv = uv * u_resolution;

  // Dots
  shape_uv *= .05;
  float stripeIdx = floor(2. * shape_uv.x / TWO_PI);
  float rand = hash11(stripeIdx * 10.);
  rand = sign(rand - .5) * pow(.1 + abs(rand), .4);
  float shape = sin(shape_uv.x) * cos(shape_uv.y - 5. * rand * t);
  shape = pow(abs(shape), 6.);

  float dithering = getBayerValue(pxSizeUv) - 0.5;
  float res = step(.5, shape + dithering);

  // Trail influence — check proximity to each trail point
  // Use raw UV (not pixelized) for accurate cursor distance
  vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
  float trailInfluence = 0.0;
  float dotRadius = 0.04; // small radius — reveals individual dots

  for (int i = 0; i < ${TRAIL_LENGTH}; i++) {
    if (i >= u_trailCount) break;
    float age = u_trailAge[i];
    if (age >= 1.0) continue;
    float dist = length((rawUv - u_trail[i]) * aspect);
    float fade = 1.0 - age; // newest = 1, oldest = 0
    trailInfluence = max(trailInfluence, smoothstep(dotRadius, dotRadius * 0.2, dist) * fade);
  }

  float fgAlpha = u_colorFront.a * trailInfluence;

  vec3 fgColor = u_colorFront.rgb * fgAlpha;
  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  vec3 color = fgColor * res + bgColor * (1. - fgAlpha * res);
  float opacity = fgAlpha * res + u_colorBack.a * (1. - fgAlpha * res);

  fragColor = vec4(color, opacity);
}`;

// ── Helpers ─────────────────────────────────────────────────────

function compileShader(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function createProgram(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader) {
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(p));
    gl.deleteProgram(p);
    return null;
  }
  return p;
}

// ── Trail point ─────────────────────────────────────────────────
interface TrailPoint {
  x: number;
  y: number;
  time: number; // timestamp when recorded
}

const TRAIL_LIFETIME = 2.0; // seconds before a trail point fully fades

// ── Component ───────────────────────────────────────────────────

export function DitheredShaderCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1, y: -1 }); // -1 = offscreen
  const isHoveringRef = useRef(false);
  const trailRef = useRef<TrailPoint[]>([]);
  const lastTrailTimeRef = useRef(0);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mouseRef.current = {
      x: (e.clientX - rect.left) / rect.width,
      y: 1.0 - (e.clientY - rect.top) / rect.height,
    };
    isHoveringRef.current = true;
  }, []);

  const handleMouseEnter = useCallback(() => {
    isHoveringRef.current = true;
  }, []);

  const handleMouseLeave = useCallback(() => {
    isHoveringRef.current = false;
    mouseRef.current = { x: -1, y: -1 };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) return;

    // Compile shaders + link program
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = createProgram(gl, vs, fs);
    if (!prog) return;

    // Fullscreen triangle (covers clip space without a quad)
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Uniform locations
    gl.useProgram(prog);
    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uRes = gl.getUniformLocation(prog, 'u_resolution');
    const uPR = gl.getUniformLocation(prog, 'u_pixelRatio');
    const uBack = gl.getUniformLocation(prog, 'u_colorBack');
    const uFront = gl.getUniformLocation(prog, 'u_colorFront');
    const uMouse = gl.getUniformLocation(prog, 'u_mouse');
    const uTrailCount = gl.getUniformLocation(prog, 'u_trailCount');

    // Trail uniform locations (arrays)
    const uTrail: WebGLUniformLocation[] = [];
    const uTrailAge: WebGLUniformLocation[] = [];
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      uTrail.push(gl.getUniformLocation(prog, `u_trail[${i}]`)!);
      uTrailAge.push(gl.getUniformLocation(prog, `u_trailAge[${i}]`)!);
    }

    // Static uniforms
    const dpr = window.devicePixelRatio || 1;
    gl.uniform1f(uPR, dpr);
    gl.uniform4f(uBack, 0.0, 0.0, 0.0, 1.0);
    gl.uniform4f(uFront, 0.431, 0.906, 0.718, 0.35);

    // Resize handler
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = canvas;
      const pw = w * dpr;
      const ph = h * dpr;
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
        gl.viewport(0, 0, pw, ph);
        gl.uniform2f(uRes, pw, ph);
      }
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    // Mouse events — directly on canvas only
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseenter', handleMouseEnter);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    // Animation loop
    const start = performance.now();
    let raf = 0;

    const loop = () => {
      const now = performance.now();
      const elapsed = (now - start) / 1000;

      // Record trail point if hovering and enough time has passed
      if (isHoveringRef.current && mouseRef.current.x >= 0) {
        if (now - lastTrailTimeRef.current > TRAIL_INTERVAL) {
          trailRef.current.push({
            x: mouseRef.current.x,
            y: mouseRef.current.y,
            time: elapsed,
          });
          lastTrailTimeRef.current = now;
          // Cap trail length
          if (trailRef.current.length > TRAIL_LENGTH) {
            trailRef.current.shift();
          }
        }
      }

      // Prune expired trail points
      trailRef.current = trailRef.current.filter(
        p => (elapsed - p.time) < TRAIL_LIFETIME
      );

      // Upload trail data to uniforms
      const trail = trailRef.current;
      gl.uniform1i(uTrailCount, trail.length);
      for (let i = 0; i < trail.length; i++) {
        const age = (elapsed - trail[i].time) / TRAIL_LIFETIME; // 0 = fresh, 1 = expired
        gl.uniform2f(uTrail[i], trail[i].x, trail[i].y);
        gl.uniform1f(uTrailAge[i], age);
      }

      // Current mouse for parallax (use center if not hovering)
      const mx = isHoveringRef.current && mouseRef.current.x >= 0 ? mouseRef.current.x : 0.5;
      const my = isHoveringRef.current && mouseRef.current.y >= 0 ? mouseRef.current.y : 0.5;

      gl.uniform1f(uTime, elapsed);
      gl.uniform2f(uMouse, mx, my);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseenter', handleMouseEnter);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
      gl.deleteVertexArray(vao);
    };
  }, [handleMouseMove, handleMouseEnter, handleMouseLeave]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}
