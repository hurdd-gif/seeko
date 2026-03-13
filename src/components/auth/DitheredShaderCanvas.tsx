'use client';

import { useRef, useEffect, useCallback } from 'react';

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
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;

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

  vec3 fgColor = u_colorFront.rgb * u_colorFront.a;
  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  vec3 color = fgColor * res + bgColor * (1. - u_colorFront.a * res);
  float opacity = u_colorFront.a * res + u_colorBack.a * (1. - u_colorFront.a * res);

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

// ── Component ───────────────────────────────────────────────────

export function DitheredShaderCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const smoothMouseRef = useRef({ x: 0.5, y: 0.5 });

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mouseRef.current = {
      x: (e.clientX - rect.left) / rect.width,
      y: 1.0 - (e.clientY - rect.top) / rect.height,
    };
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current = { x: 0.5, y: 0.5 };
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

    // Static uniforms
    const dpr = window.devicePixelRatio || 1;
    gl.uniform1f(uPR, dpr);
    // Background: #1a1a1a
    gl.uniform4f(uBack, 0.102, 0.102, 0.102, 1.0);
    // Foreground: seeko-accent #6ee7b7 at 35% opacity
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

    // Mouse events
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    // Animation loop
    const start = performance.now();
    let raf = 0;
    const LERP = 0.05;

    const loop = () => {
      // Smooth mouse
      smoothMouseRef.current.x += (mouseRef.current.x - smoothMouseRef.current.x) * LERP;
      smoothMouseRef.current.y += (mouseRef.current.y - smoothMouseRef.current.y) * LERP;

      gl.uniform1f(uTime, (performance.now() - start) / 1000);
      gl.uniform2f(uMouse, smoothMouseRef.current.x, smoothMouseRef.current.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
      gl.deleteVertexArray(vao);
    };
  }, [handleMouseMove, handleMouseLeave]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}
