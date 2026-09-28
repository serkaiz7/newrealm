// GLSL Shaders & Atlas Generator
const vsSource = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = vec2((a_position.x + 1.0) * 0.5, (1.0 - a_position.y) * 0.5);
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fsSource = `
  precision mediump float;
  varying vec2 v_uv;

  uniform sampler2D u_screenTex;
  uniform sampler2D u_fontTex;
  uniform vec2 u_gridSize;
  uniform vec2 u_resolution;
  uniform float u_dayFactor; // 0.0 = Night, 1.0 = Day

  void main() {
    vec2 cellCoord = floor(v_uv * u_gridSize);
    vec2 charUV    = fract(v_uv * u_gridSize);

    vec2 screenCoord = (cellCoord + 0.5) / u_gridSize;
    vec4 charData = texture2D(u_screenTex, screenCoord);

    float charCode = floor(charData.r * 255.0 + 0.5);
    vec3 fgColor   = charData.gba;

    // Locate glyph in 16x16 font atlas
    float gx = mod(charCode, 16.0);
    float gy = floor(charCode / 16.0);
    vec2 fontUV = (vec2(gx, gy) + charUV) / 16.0;

    float glyphMask = texture2D(u_fontTex, fontUV).r;

    // CRT phosphor lines and screen vignette
    float scanline = 0.93 + 0.07 * sin(v_uv.y * u_resolution.y * 3.14159);
    vec2 vigUV = v_uv * (1.0 - v_uv.yx);
    float vignette = clamp(vigUV.x * vigUV.y * 32.0, 0.0, 1.0);
    vignette = pow(vignette, 0.2);

    // Day vs Night terminal ambient base tone
    vec3 nightBlack = vec3(0.012, 0.025, 0.05);
    vec3 dayBlack   = vec3(0.03, 0.045, 0.065);
    vec3 terminalBlack = mix(nightBlack, dayBlack, u_dayFactor);

    vec3 finalColor = mix(terminalBlack, fgColor, glyphMask) * scanline * vignette;
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

function createFontAtlasTexture(gl) {
  const fontCanvas = document.createElement('canvas');
  fontCanvas.width = 256;
  fontCanvas.height = 256;
  const ctx = fontCanvas.getContext('2d');

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const cellW = 16, cellH = 16;
  for (let i = 0; i < 256; i++) {
    const cx = (i % 16) * cellW + cellW * 0.5;
    const cy = Math.floor(i / 16) * cellH + cellH * 0.5;
    if (i >= 32 && i <= 126) {
      ctx.fillText(String.fromCharCode(i), cx, cy);
    }
  }

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fontCanvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function createScreenTexture(gl, cols, rows) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}
