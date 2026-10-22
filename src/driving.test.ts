import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advance, MAX_SPEED, SPACING, lampZ } from './driving.ts';
test('steady throttle approaches 100 km/h and release decelerates', () => {
  const state = { speed: 0, distance: 0, x: 0, steering: 0 };
  for (let i=0;i<3600;i++) advance(state,true,0,1/60);
  assert.ok(Math.abs(state.speed-MAX_SPEED)<0.01);
  for (let i=0;i<1800;i++) advance(state,false,0,1/60);
  assert.ok(state.speed<0.05);
});
test('steering stays within the road at different frame rates', () => {
  for (const fps of [30,60,120]) {
    const state = { speed: MAX_SPEED, distance: 0, x: 0, steering: 0 };
    for(let i=0;i<fps*20;i++) advance(state,true,1,1/fps);
    assert.equal(state.x,4.3);
    assert.ok(Math.abs(state.distance-MAX_SPEED*20)<0.001);
  }
});
test('recycled lights preserve the same spatial phase', () => {
  assert.equal(lampZ(4,SPACING),lampZ(4,0));
  assert.ok(Math.abs(lampZ(4,SPACING-0.001)-lampZ(3,0))<0.002);
});
