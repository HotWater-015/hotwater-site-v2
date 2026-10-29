import * as THREE from 'three';
/** Original exploded polyhedral trust boundary, with individually separated metal facets. */
export function mountAboutScene(host, progress) {
 const canvas = document.createElement('canvas');
 const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'low-power' });
 if (!gl) { host.dataset.scene = 'fallback'; return () => {}; }
 const renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, antialias: true });
 renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 600 ? 1 : 1.5));
 renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.6;
 host.append(canvas);
 const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(36, 1, .1, 40);
 camera.position.set(0, .2, 8.3);
 const sculpture = new THREE.Group(); sculpture.rotation.set(.22, -.35, -.28); scene.add(sculpture);
 const metal = new THREE.MeshStandardMaterial({ color: 0x36363d, metalness: .78, roughness: .28, flatShading: true, side: THREE.DoubleSide });
 const source = new THREE.IcosahedronGeometry(1.63, 1); const points = source.attributes.position;
 const facets = [];
 for (let i = 0; i < points.count; i += 3) {
   const center = new THREE.Vector3(); const vertices = [];
   for (let j = 0; j < 3; j++) { const v = new THREE.Vector3().fromBufferAttribute(points, i + j); vertices.push(v); center.add(v); }
   center.divideScalar(3); const normal = center.clone().normalize();
   const geometry = new THREE.BufferGeometry(); const data = [];
   vertices.forEach(v => { v.sub(center).multiplyScalar(.94); data.push(v.x, v.y, v.z); });
   geometry.setAttribute('position', new THREE.Float32BufferAttribute(data, 3)); geometry.computeVertexNormals();
   const face = new THREE.Mesh(geometry, metal); face.position.copy(center).addScaledVector(normal, .1); sculpture.add(face);
   const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: 0xab3039, transparent: true, opacity: .65 })); face.add(edge);
   facets.push({ face, center, normal });
 }
 source.dispose();
 const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.28, 0), new THREE.MeshStandardMaterial({ color: 0x6e0b15, emissive: 0xd41e32, emissiveIntensity: .45, roughness: .4, metalness: .6 })); sculpture.add(core);
 const belt = new THREE.Group(); sculpture.add(belt); belt.rotation.set(.45, -.35, .6);
 const slatGeo = new THREE.BoxGeometry(.045, .12, .035), slatMat = new THREE.MeshStandardMaterial({ color: 0xd8444b, emissive: 0x99152a, emissiveIntensity: .7, metalness: .5, roughness: .3 });
 for (let i = 0; i < 90; i++) { const a = i / 90 * Math.PI * 2; const slat = new THREE.Mesh(slatGeo, slatMat); slat.position.set(Math.cos(a) * 2.15, Math.sin(a) * 2.15, 0); slat.rotation.z = a; belt.add(slat); }
 const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, .008, 4, 120), new THREE.MeshBasicMaterial({ color: 0xb92f3b })); belt.add(ring);
 scene.add(new THREE.HemisphereLight(0xbcc4d7, 0x120306, 2.3));
 const key = new THREE.DirectionalLight(0xf2f0ff, 7); key.position.set(-3, 5, 4); scene.add(key);
 const rim = new THREE.DirectionalLight(0xff283c, 11); rim.position.set(3, 1, -2); scene.add(rim);
 const fill = new THREE.PointLight(0xff273f, 35, 15); fill.position.set(1, -2, 3); scene.add(fill);
 let frame = 0, last = 0, visible = true, disposed = false, px = 0, py = 0, pointerBounds;
 function resize() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); pointerBounds = null; }
 function draw(time) {
   if (disposed || !visible || document.hidden) { frame = 0; return; }
   if (time - last > 1000 / 30) {
     last = time; const p = progress();
     sculpture.rotation.y = -.35 + time * .00004 + p * 1.3 + px;
     sculpture.rotation.x += (.22 + py + p * .3 - sculpture.rotation.x) * .06;
     facets.forEach(({ face, center, normal }) => face.position.copy(center).addScaledVector(normal, .12 + p * .22));
     belt.rotation.z = .6 - p * .8; renderer.render(scene, camera); host.dataset.scene = 'ready';
   }
   frame = requestAnimationFrame(draw);
 }
 function start() { if (!frame && !disposed && visible && !document.hidden) frame = requestAnimationFrame(draw); }
 function stop() { cancelAnimationFrame(frame); frame = 0; }
 function visibility() { document.hidden ? stop() : start(); }
 function move(e) { if (e.pointerType === 'touch') return; pointerBounds ||= host.getBoundingClientRect(); px = (e.clientX - pointerBounds.left - pointerBounds.width / 2) / pointerBounds.width * .12; py = (e.clientY - pointerBounds.top - pointerBounds.height / 2) / pointerBounds.height * .1; }
 function invalidate() { pointerBounds = null; }
 function lost(e) { e.preventDefault(); stop(); host.dataset.scene = 'fallback'; }
 const ro = new ResizeObserver(resize); ro.observe(host);
 const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); }); io.observe(host);
 host.closest('.av-stage').addEventListener('pointermove', move, { passive: true });
 addEventListener('scroll', invalidate, { passive: true }); document.addEventListener('visibilitychange', visibility); canvas.addEventListener('webglcontextlost', lost);
 resize(); start();
 return () => {
   disposed = true; stop(); ro.disconnect(); io.disconnect(); host.closest('.av-stage').removeEventListener('pointermove', move);
   removeEventListener('scroll', invalidate); document.removeEventListener('visibilitychange', visibility); canvas.removeEventListener('webglcontextlost', lost);
   const geometries = new Set(), materials = new Set(); scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material); });
   geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); renderer.dispose(); renderer.forceContextLoss(); canvas.remove(); host.dataset.scene = 'fallback';
 };
}
