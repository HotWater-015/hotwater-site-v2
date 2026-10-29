import * as THREE from 'three';
/** Original cipher-core sculpture: separated metallic facets, emissive cage and orbital bands. */
export function mountScene(host){
 const canvas=document.createElement('canvas');
 const gl=canvas.getContext('webgl2',{alpha:true,antialias:true,powerPreference:'low-power'});
 if(!gl){host.dataset.scene='fallback';return()=>{}};
 const renderer=new THREE.WebGLRenderer({canvas,context:gl,alpha:true,antialias:true});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0x000000,0);
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.55;
 host.append(canvas);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1,.1,50);camera.position.set(0,.25,7.8);
 const artifact=new THREE.Group();scene.add(artifact);artifact.rotation.z=-.22;
 const geometry=new THREE.IcosahedronGeometry(1.45,1);const pos=geometry.attributes.position;
 for(let i=0;i<pos.count;i+=3){const center=new THREE.Vector3();for(let j=0;j<3;j++)center.add(new THREE.Vector3().fromBufferAttribute(pos,i+j));center.normalize().multiplyScalar(.085);for(let j=0;j<3;j++)pos.setXYZ(i+j,pos.getX(i+j)+center.x,pos.getY(i+j)+center.y,pos.getZ(i+j)+center.z)}
 geometry.computeVertexNormals();
 const metal=new THREE.MeshStandardMaterial({color:0x27242d,metalness:.72,roughness:.3,flatShading:true});
 const shell=new THREE.Mesh(geometry,metal);artifact.add(shell);
 const cage=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:0xd43845,transparent:true,opacity:.58}));artifact.add(cage);
 const core=new THREE.Mesh(new THREE.IcosahedronGeometry(.82,0),new THREE.MeshStandardMaterial({color:0xdb1634,emissive:0x9f1023,emissiveIntensity:2,metalness:.4,roughness:.25}));artifact.add(core);
 const orbitMaterial=new THREE.MeshStandardMaterial({color:0xca283b,emissive:0x8c1020,emissiveIntensity:.4,metalness:.7,roughness:.3});
 const rings=[];
 for(let i=0;i<3;i++){
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1.93+i*.17,.012,6,140),orbitMaterial);ring.rotation.set(.7+i*.62,.3+i*.45,i*.7);artifact.add(ring);rings.push(ring);
 }
 const nodes=new THREE.Group();artifact.add(nodes);
 const nodeGeometry=new THREE.IcosahedronGeometry(.045,0),nodeMaterial=new THREE.MeshBasicMaterial({color:0xff5f6f});
 for(let i=0;i<24;i++){const a=i*Math.PI*2/24;const node=new THREE.Mesh(nodeGeometry,nodeMaterial);node.position.set(Math.cos(a)*2.2,Math.sin(a)*1.9,Math.sin(a*3)*.35);nodes.add(node)}
 scene.add(new THREE.HemisphereLight(0xd3d1ec,0x1d0710,2.6));
 const key=new THREE.DirectionalLight(0xffeef2,6);key.position.set(-3,4,4);scene.add(key);
 const rim=new THREE.DirectionalLight(0xff1f3d,9);rim.position.set(3,1,-2);scene.add(rim);
 const fill=new THREE.PointLight(0xf1324f,35,10);fill.position.set(1,-2,3);scene.add(fill);
 let frame=0,visible=true,last=0,disposed=false,rx=0,ry=0;
 const region=host.closest('.cinematic-hero');
 let bounds=region.getBoundingClientRect();
 function resize(){const r=host.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();bounds=region.getBoundingClientRect()}
 function move(e){if(!bounds)bounds=region.getBoundingClientRect();rx=((e.clientY-bounds.top)/bounds.height-.5)*.22;ry=((e.clientX-bounds.left)/bounds.width-.5)*.38}
 function leave(){rx=0;ry=0}
 function invalidateBounds(){bounds=null}
 function stop(){cancelAnimationFrame(frame);frame=0;host.dataset.animating='false'}
 function start(){if(!disposed&&visible&&!document.hidden&&!frame){frame=requestAnimationFrame(draw);host.dataset.animating='true'}}
 function draw(time){if(disposed||!visible||document.hidden){stop();return}if(time-last>1000/30){last=time;artifact.rotation.y+=(ry+time*.000055-artifact.rotation.y)*.025;artifact.rotation.x+=(rx+.12-artifact.rotation.x)*.04;artifact.position.y=Math.sin(time*.00035)*.055;rings[1].rotation.z=time*.00007;renderer.render(scene,camera);host.dataset.scene='ready'}frame=requestAnimationFrame(draw)}
 const ro=new ResizeObserver(resize);ro.observe(host);
 const io=new IntersectionObserver(([e])=>{visible=e.isIntersecting;visible?start():stop()});io.observe(host);
 const visibility=()=>document.hidden?stop():start();
 const lost=e=>{e.preventDefault();stop();host.dataset.scene='fallback'};
 region.addEventListener('pointermove',move,{passive:true});region.addEventListener('pointerleave',leave);window.addEventListener('scroll',invalidateBounds,{passive:true});document.addEventListener('visibilitychange',visibility);canvas.addEventListener('webglcontextlost',lost);
 resize();start();
 return()=>{disposed=true;stop();ro.disconnect();io.disconnect();region.removeEventListener('pointermove',move);region.removeEventListener('pointerleave',leave);window.removeEventListener('scroll',invalidateBounds);document.removeEventListener('visibilitychange',visibility);canvas.removeEventListener('webglcontextlost',lost);const geometries=new Set(),materials=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material)});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();canvas.remove();host.dataset.scene='fallback'};
}
