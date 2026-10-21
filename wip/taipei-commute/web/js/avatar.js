// 主角：Quaternius「Ultimate Modular Men」西裝上班族（CC0），骨架動畫：站立、走路、跑步、互動。
import * as THREE from '../lib/three.module.min.js';
import { GLTFLoader } from '../lib/GLTFLoader.js';

export class Avatar {
  /** 載入模型；失敗時回傳 null（遊戲照樣能玩，只是看不到主角）。 */
  static async load(url) {
    try {
      // 模型是內嵌 base64 的 glTF JSON；自己解碼成 GLB 再交給 loader，
      // 不讓 loader 去抓 data: 網址（有些網頁環境的安全政策會擋）。
      const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status);
      const js = await r.json();
      const uri = js.buffers[0].uri, b64 = uri.slice(uri.indexOf(',') + 1), bin = atob(b64);
      const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      delete js.buffers[0].uri;
      const jsonBytes = new TextEncoder().encode(JSON.stringify(js));
      const jl = (jsonBytes.length + 3) & ~3, bl = (bytes.length + 3) & ~3, total = 12 + 8 + jl + 8 + bl;
      const glb = new ArrayBuffer(total), dv = new DataView(glb), u8 = new Uint8Array(glb);
      dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
      dv.setUint32(12, jl, true); dv.setUint32(16, 0x4E4F534A, true); u8.fill(0x20, 20, 20 + jl); u8.set(jsonBytes, 20);
      dv.setUint32(20 + jl, bl, true); dv.setUint32(24 + jl, 0x004E4942, true); u8.set(bytes, 28 + jl);
      const gltf = await new GLTFLoader().parseAsync(glb, '');
      return new Avatar(gltf);
    } catch (err) {
      console.warn('avatar load failed', err); Avatar.lastError = String(err && err.message || err);
      return null;
    }
  }

  constructor(gltf) {
    this.group = new THREE.Group();
    const model = gltf.scene;
    model.rotation.y = Math.PI;              // 模型臉朝 +z，遊戲裡統一臉朝 -z
    model.traverse(o => {
      if (o.name === 'Pistol') { o.visible = false; return; }   // 模型原本手上拿著一把手槍：上班族不需要，藏起來
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
        if (o.material) { o.material.roughness = 0.75; o.material.metalness = 0; }
      }
    });
    this.group.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.cur = null;
    this.play('Idle', 0);
    this.speed = 0;
  }

  attach(scene) { scene.add(this.group); }

  play(name, fade = 0.25) {
    const a = this.actions[name]; if (!a || this.cur === a) return;
    a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.play();
    if (this.cur) this.cur.crossFadeTo(a, fade, false);
    this.cur = a; this.curName = name;
  }

  /** 每幀：位置、面向、目前移動速度 (m/s)。 */
  update(dt, x, y, z, yaw, speed) {
    this.group.position.set(x, y, z);
    this.group.rotation.y = yaw;
    this.speed += (speed - this.speed) * Math.min(1, dt * 8);
    if (this.speed > 3.4) { this.play('Run'); this.cur.timeScale = this.speed / 4.6; }
    else if (this.speed > 0.25) { this.play('Walk'); this.cur.timeScale = Math.max(0.6, this.speed / 1.7); }
    else { this.play('Idle'); this.cur.timeScale = 1; }
    this.mixer.update(dt);
  }
}
