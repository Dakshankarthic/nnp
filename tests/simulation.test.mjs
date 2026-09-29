import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { Drone } from '../js/drone.js';
import { seededRandom, noise2, angleDelta, brakingSpeed } from '../js/simulation-math.js';
import { getTerrainHeight } from '../js/scene.js';
function drone() {
  const d = Object.create(Drone.prototype);
  Object.assign(d, { position: new THREE.Vector3(0,14,0), velocity: new THREE.Vector3(), simTime:0, yaw:0, pitch:0, keys:{w:true}, waypoints:[{x:12,z:-12}], waypointIndex:0 });
  return d;
}
test('seeded scenario generation repeats', () => {
  const a=seededRandom(25084),b=seededRandom(25084);
  for(let i=0;i<100;i++) assert.equal(a(),b());
});
test('terrain remains finite throughout the flight envelope', () => {
  for(let x=-55;x<=55;x++) for(let z=-55;z<=55;z++) assert.ok(Number.isFinite(getTerrainHeight(x,z)));
  assert.ok(Math.abs(noise2(3-1e-6,2.3)-noise2(3+1e-6,2.3))<1e-4);
});
test('heading takes shortest path across north', () => {
  assert.ok(Math.abs(angleDelta(Math.PI-.01,-Math.PI+.01)-.02)<1e-10);
});
test('braking speed drops smoothly to zero', () => {
  assert.equal(brakingSpeed(0),0); assert.equal(brakingSpeed(100),4.5);
  assert.ok(brakingSpeed(.1)<brakingSpeed(1));
});
test('manual flight converges at 30 and 120 Hz', () => {
  const run=hz=>{const d=drone();for(let i=0;i<hz*10;i++){d.simTime+=1/hz;d._updateManual(1/hz);d.position.addScaledVector(d.velocity,1/hz);}return d;};
  const a=run(30),b=run(120);
  assert.ok(a.position.distanceTo(b.position)<.2);
  assert.ok(a.velocity.distanceTo(b.velocity)<.02);
});
test('autonomous controller approaches a waypoint and maintains clearance', () => {
  const d=drone();let closest=100;
  for(let i=0;i<1200;i++){d.simTime+=1/60;d._updateAutonomous(1/60);d.position.addScaledVector(d.velocity,1/60);closest=Math.min(closest,Math.hypot(d.position.x-12,d.position.z+12));assert.ok(d.position.y-getTerrainHeight(d.position.x,d.position.z)>2);}
  assert.ok(closest<.8);assert.ok(d.velocity.length()<1);
});
