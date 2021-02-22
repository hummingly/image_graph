import { squared } from "./util";

export type Vec2 = Float32Array;

export function vec2(x: number, y: number): Vec2 {
    const vec = new Float32Array(2);
    vec[0] = x;
    vec[1] = y;
    return vec;
}

export function add([x0, y0]: Vec2, [x1, y1]: Vec2): Vec2 {
    return vec2(x0 + x1, y0 + y1);
}

export function addAssign(self: Vec2, [x, y]: Vec2) {
    self[0] += x;
    self[1] += y;
}

export function sub([x0, y0]: Vec2, [x1, y1]: Vec2): Vec2 {
    return vec2(x0 - x1, y0 - y1);
}

export function subAssign(self: Vec2, [x, y]: Vec2) {
    self[0] -= x;
    self[1] -= y;
}

export function mul([x, y]: Vec2, scalar: number): Vec2 {
    return vec2(x * scalar, y * scalar);
}

export function mulAssign(self: Vec2, scalar: number) {
    self[0] *= scalar;
    self[1] *= scalar;
}

export function div([x, y]: Vec2, scalar: number): Vec2 {
    return vec2(x / scalar, y / scalar);
}

export function divAssign(self: Vec2, scalar: number) {
    self[0] /= scalar;
    self[1] /= scalar;
}

export function magnitudeSquared([x, y]: Vec2): number {
    return squared(x) + squared(y);
}

export function magnitude(v: Vec2) {
    return Math.sqrt(magnitudeSquared(v));
}

export function dot([x0, y0]: Vec2, [x1, y1]: Vec2): number {
    return x0 * x1 + y0 * y1;
}

export function normalized(self: Vec2): Vec2 {
    const distanceSquared = magnitudeSquared(self);
    if (distanceSquared === 0) {
        return self;
    }
    return div(self, Math.sqrt(distanceSquared));
}

export function normalize(self: Vec2) {
    const distanceSquared = magnitudeSquared(self);
    if (distanceSquared !== 0) {
        divAssign(self, Math.sqrt(distanceSquared))
    }
}