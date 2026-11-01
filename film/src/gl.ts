// One shared WebGL2 context per tab; each frame it draws and is copied straight onto the film's canvas.
import { W, H } from './core'

const VERT = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`

let gl: WebGL2RenderingContext | null = null
let canvas: HTMLCanvasElement | null = null
const programs = new Map<string, { prog: WebGLProgram; loc: Map<string, WebGLUniformLocation | null> }>()

export function drawShader(ctx: CanvasRenderingContext2D, name: string, frag: string, uniforms: Record<string, number | number[]>) {
  if (!gl) {
    canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
    if (!gl) throw new Error('No WebGL2: render with --gl=vulkan')
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  }
  let entry = programs.get(name)
  if (!entry) {
    const compile = (type: number, src: string) => {
      const s = gl!.createShader(type)!
      gl!.shaderSource(s, src); gl!.compileShader(s)
      if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) throw new Error(`${name}: ${gl!.getShaderInfoLog(s)}`)
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag))
    gl.bindAttribLocation(prog, 0, 'p')
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`${name}: ${gl.getProgramInfoLog(prog)}`)
    entry = { prog, loc: new Map() }
    programs.set(name, entry)
  }
  gl.useProgram(entry.prog)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.viewport(0, 0, W, H)
  for (const [k, v] of Object.entries({ u_res: [W, H], ...uniforms })) {
    if (!entry.loc.has(k)) entry.loc.set(k, gl.getUniformLocation(entry.prog, k))
    const l = entry.loc.get(k)
    if (!l) continue
    if (typeof v === 'number') gl.uniform1f(l, v)
    else if (v.length === 2) gl.uniform2fv(l, v)
    else if (v.length === 3) gl.uniform3fv(l, v)
    else gl.uniform4fv(l, v)
  }
  gl.drawArrays(gl.TRIANGLES, 0, 3)
  gl.finish()
  ctx.drawImage(canvas!, 0, 0)
}
