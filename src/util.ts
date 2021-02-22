import type { Vec2 } from "./math/vec2";

export function getDelta(pos: Float32Array, u: number, v: number, buffer: Vec2) {
    const offset0 = u * 2;
    const offset1 = v * 2;
    buffer[0] = pos[offset0] - pos[offset1];
    buffer[1] = pos[offset0 + 1] - pos[offset1 + 1];
}

export function copyFrom(array: Float32Array, v: number, buffer: Vec2) {
    const offset = v * 2;
    buffer[0] = array[offset];
    buffer[1] = array[offset + 1];
}

export function get(array: Float32Array, id: number): Vec2 {
    const offset = id * 2;
    return array.slice(offset, offset + 2);
}

export function set(array: Float32Array, id: number, x: number, y: number) {
    const offset = id * 2;
    array[offset] = x;
    array[offset + 1] = y;
}

export function setVector2(array: Float32Array, id: number, [x, y]: Vec2) {
    const offset = id * 2;
    array[offset] = x;
    array[offset + 1] = y;
}

export function addAssignArray(array: Float32Array, id: number, [x, y]: Vec2) {
    const offset = id * 2;
    array[offset] += x;
    array[offset + 1] += y;
}

export function subAssignArray(array: Float32Array, id: number, [x, y]: Vec2) {
    const offset = id * 2;
    array[offset] -= x;
    array[offset + 1] -= y;
}
