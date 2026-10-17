// 壓縮空氣噴出時的白霧：高壓空氣從噴嘴噴出、急速膨脹變冷，空氣裡的水氣凝結成白霧。
// 用粒子（每顆是一團會慢慢變大、變淡的霧）畫出來；往下噴碰到地面時，霧會沿著地面往四周散開。
import * as THREE from '../lib/three.module.min.js';

export class Mist {
  constructor(scene, max = 900) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.age = new Float32Array(max); this.life = new Float32Array(max); this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.a0 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { scale: { value: 600 }, fogColor: { value: new THREE.Color(0xd5d9d8) }, fogNear: { value: 260 }, fogFar: { value: 1050 } },
      vertexShader: `attribute float size; attribute float alpha; uniform float scale; varying float vA; varying float vDepth;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; vA = alpha;
          gl_PointSize = clamp(size * scale / max(0.5, -mv.z), 0.0, 900.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; varying float vA; varying float vDepth;
        void main() { vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard;
          float a = vA * (1.0 - smoothstep(0.25, 1.0, r)) * smoothstep(1.5, 6.0, vDepth);   // 貼近鏡頭的霧淡掉，不會整個畫面一片白
          vec3 c = mix(vec3(0.93, 0.95, 0.97), fogColor, smoothstep(fogNear, fogFar, vDepth));
          gl_FragColor = vec4(c, a); }`,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 4;
    scene.add(this.points);
    this.g = g;
  }

  /** 噴出 n 團霧：位置、噴出方向（單位向量）× 速度，再加上車子本身的速度。 */
  emit(x, y, z, dx, dy, dz, n, o = {}) {
    const sp = o.speed || 10, spread = o.spread || 0.25, life = o.life || 1.2, s0 = o.s0 || 0.35, s1 = o.s1 || 2.6, a0 = o.alpha || 0.55;
    for (let k = 0; k < n; k++) {
      let i = this.n < this.max ? this.n++ : Math.floor(Math.random() * this.max);
      const j = i * 3, r = () => (Math.random() - 0.5) * 2 * spread;
      this.pos[j] = x + (Math.random() - 0.5) * 0.1; this.pos[j + 1] = y + (Math.random() - 0.5) * 0.1; this.pos[j + 2] = z + (Math.random() - 0.5) * 0.1;
      const v = sp * (0.6 + Math.random() * 0.6);
      this.vel[j] = (dx + r()) * v + (o.vx || 0); this.vel[j + 1] = (dy + r()) * v + (o.vy || 0); this.vel[j + 2] = (dz + r()) * v + (o.vz || 0);
      this.age[i] = 0; this.life[i] = life * (0.7 + Math.random() * 0.6); this.s0[i] = s0; this.s1[i] = s1 * (0.8 + Math.random() * 0.4); this.a0[i] = a0;
    }
  }

  /** groundAt(x,z,y) 給地面高度：往下噴的霧碰到地面就往四周散開。 */
  update(dt, camera, height, groundAt) {
    const p = this.pos, v = this.vel;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      const u = this.age[i] / this.life[i];
      if (u >= 1) {   // 用最後一顆補這個位置
        const last = --this.n;
        if (i !== last) {
          for (let k = 0; k < 3; k++) { p[i * 3 + k] = p[last * 3 + k]; v[i * 3 + k] = v[last * 3 + k]; }
          this.age[i] = this.age[last]; this.life[i] = this.life[last]; this.s0[i] = this.s0[last]; this.s1[i] = this.s1[last]; this.a0[i] = this.a0[last];
          i--;
        }
        continue;
      }
      const j = i * 3, drag = Math.exp(-dt * 3.2);
      v[j] *= drag; v[j + 1] = v[j + 1] * drag + 0.6 * dt; v[j + 2] *= drag;   // 空氣阻力很快讓霧停下來，稍微往上飄
      p[j] += v[j] * dt; p[j + 1] += v[j + 1] * dt; p[j + 2] += v[j + 2] * dt;
      if (groundAt && v[j + 1] < 0) {
        const gy = groundAt(p[j], p[j + 2], p[j + 1]) + 0.15;
        if (p[j + 1] < gy) {   // 撞到地面：往外散
          p[j + 1] = gy; const h = Math.hypot(v[j], v[j + 2]) || 0.001, s = -v[j + 1] * 0.8;
          v[j] += v[j] / h * s + (Math.random() - 0.5) * s; v[j + 2] += v[j + 2] / h * s + (Math.random() - 0.5) * s; v[j + 1] = 0;
        }
      }
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(u);
      this.alpha[i] = this.a0[i] * (u < 0.1 ? u / 0.1 : 1 - (u - 0.1) / 0.9);
    }
    this.g.setDrawRange(0, this.n);
    this.g.attributes.position.needsUpdate = true; this.g.attributes.size.needsUpdate = true; this.g.attributes.alpha.needsUpdate = true;
    if (camera) this.mat.uniforms.scale.value = height / (2 * Math.tan(camera.fov * Math.PI / 360));
  }
}
