import * as THREE from 'three';

export class MeleeTrail {
  constructor(scene, baseOffset, tipOffset, maxPoints = 16, color = 0x00ff88) {
    this.scene = scene;
    this.baseOffset = baseOffset;
    this.tipOffset = tipOffset;
    this.maxPoints = Math.max(2, maxPoints);

    this.points = [];
    this.isActive = false;

    this.geometry = new THREE.BufferGeometry();
    const vertCount = (this.maxPoints - 1) * 6;
    this.positions = new Float32Array(vertCount * 3);
    this.uvs = new Float32Array(vertCount * 2);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));

    this.material = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    this.mesh.visible = false;
  }

  start() {
    this.isActive = true;
    this.points = [];
    this.mesh.visible = true;
  }

  stop() {
    this.isActive = false;
    this.points = [];
    this.mesh.visible = false;
    this.geometry.setDrawRange(0, 0);
  }

  update(weaponMesh, colorHex = null) {
    if (colorHex) this.material.color.setHex(colorHex);

    if (!this.isActive) return;

    const currentBase = this.baseOffset.clone().applyMatrix4(weaponMesh.matrixWorld);
    const currentTip = this.tipOffset.clone().applyMatrix4(weaponMesh.matrixWorld);

    this.points.unshift({ base: currentBase, tip: currentTip });

    if (this.points.length > this.maxPoints) {
      this.points.pop();
    }

    if (this.points.length < 2) return;

    let posIdx = 0;
    let uvIdx = 0;

    for (let i = 0; i < this.points.length - 1; i++) {
      const p0 = this.points[i];
      const p1 = this.points[i + 1];

      const u0 = 1 - (i / (this.maxPoints - 1));
      const u1 = 1 - ((i + 1) / (this.maxPoints - 1));

      this.positions[posIdx++] = p0.base.x; this.positions[posIdx++] = p0.base.y; this.positions[posIdx++] = p0.base.z;
      this.positions[posIdx++] = p0.tip.x; this.positions[posIdx++] = p0.tip.y; this.positions[posIdx++] = p0.tip.z;
      this.positions[posIdx++] = p1.base.x; this.positions[posIdx++] = p1.base.y; this.positions[posIdx++] = p1.base.z;

      this.positions[posIdx++] = p0.tip.x; this.positions[posIdx++] = p0.tip.y; this.positions[posIdx++] = p0.tip.z;
      this.positions[posIdx++] = p1.tip.x; this.positions[posIdx++] = p1.tip.y; this.positions[posIdx++] = p1.tip.z;
      this.positions[posIdx++] = p1.base.x; this.positions[posIdx++] = p1.base.y; this.positions[posIdx++] = p1.base.z;

      this.uvs[uvIdx++] = u0; this.uvs[uvIdx++] = 0;
      this.uvs[uvIdx++] = u0; this.uvs[uvIdx++] = 1;
      this.uvs[uvIdx++] = u1; this.uvs[uvIdx++] = 0;

      this.uvs[uvIdx++] = u0; this.uvs[uvIdx++] = 1;
      this.uvs[uvIdx++] = u1; this.uvs[uvIdx++] = 1;
      this.uvs[uvIdx++] = u1; this.uvs[uvIdx++] = 0;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.uv.needsUpdate = true;
    this.geometry.setDrawRange(0, (this.points.length - 1) * 6);
  }
}
