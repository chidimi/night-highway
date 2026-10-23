export const SPACING = 36;
export const MAX_SPEED = 100 / 3.6;
export interface Driving {
  speed: number;
  distance: number;
  x: number;
  steering: number;
}
export function advance(state: Driving, gas: boolean, direction: number, dt: number): void {
  const target = gas ? MAX_SPEED : 0;
  state.speed += (target - state.speed) * (1 - Math.exp(-dt * (gas ? 0.32 : 0.22)));
  if (state.speed < 0.02) state.speed = 0;
  state.distance = (state.distance + state.speed * dt) % (SPACING * 1000);
  state.steering += (direction - state.steering) * (1 - Math.exp(-dt * 5));
  state.x = Math.max(
    -4.3,
    Math.min(4.3, state.x + state.steering * (state.speed / MAX_SPEED) * 2.6 * dt),
  );
}
export function lampZ(index: number, distance: number): number {
  return 36 - index * SPACING + (distance % SPACING);
}
