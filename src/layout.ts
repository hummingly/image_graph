import { expose } from "comlink";
import { squared } from "./math/util";
import {
    mulAssign,
    magnitude,
    magnitudeSquared,
    dot,
    Vec2,
    addAssign,
    normalize,
    vec2,
} from "./math/vec2";
import { prng_alea as Random } from "esm-seedrandom";
import { PriorityQueue, Queue, swap } from "./collection";
import { set, addAssignArray, setVector2, get, getDelta, copyFrom } from "./util";
import { IGraphData } from "./data";

/** Eine Entität ist der Index für die Komponenten eines Knoten. */
type Entity = number;
type AdjacencyList = Array<Set<Entity>>;

export class LayoutEngine {
    // Id -> index
    private index: Map<Entity, number> = new Map();
    private edgeUnitLength: number = 200;
    private subGraphCount: number = 0;

    // Iterationsschritte
    private rounds: number = 5;
    private iteration: number = 0;

    // Vertex-Komponenten
    pos: Float32Array = new Float32Array(0);
    private disp: Float32Array = new Float32Array(0);
    private heat: Float32Array = new Float32Array(0);
    private cos: Float32Array = new Float32Array(0);

    // Nachbarschaften
    private adjacencyList: AdjacencyList = [];
    private neighbourHoods: Map<Entity, Array<Entity>> = new Map();
    private neighbourHoodSize: number = 0;

    // MIS-Filtrierung
    filtration: Uint32Array = new Uint32Array(0);
    private offsets: number[] = [];

    // Wiederverwendbare Datenstrukturen
    private queue: Queue = new Queue(0);
    private priorityQueue: PriorityQueue = new PriorityQueue(0);
    private placedVertices: Set<Entity> = new Set();
    private tempDisp: Float32Array = new Float32Array(2);
    private tempDelta: Float32Array = new Float32Array(2);
    private oldDisp: Float32Array = new Float32Array(2);

    constructor(graphData: IGraphData) {
        const capacity = graphData.nodeCount;
        // Speicher alloziieren
        this.filtration = new Uint32Array(capacity);
        this.pos = new Float32Array(capacity * 2);
        this.disp = new Float32Array(capacity * 2);
        this.heat = new Float32Array(capacity);
        this.cos = new Float32Array(capacity);
        this.cos.fill(1);
        this.priorityQueue = new PriorityQueue(capacity);
        this.queue = new Queue(capacity);

        this.adjacencyList = graphData.adjacencyList;
        this.index = graphData.index;
    }

    get edgeLength() {
        return this.edgeUnitLength;
    }

    /**
     * Die Knoten enthalten nur IDs damit die Komponenten zugeordnet werden können.
     *
     * Die übergebenen Kanten müssen einzigartig sein! Der Algorithmus beachtet
     * nicht die Richtung der Kanten, sondern nur die Verbindungen. D.h. wenn man
     * zwei Vektoren a und b hat, dann darf nur E(a,b) oder E(b,a) existieren,
     * aber nicht beide oder mehrmals.
     */
    buildGraph(subGraph: number[], edgeUnitLength: number) {
        this.edgeUnitLength = edgeUnitLength * 2;

        for (let i = 0; i < subGraph.length; i++) {
            const id = subGraph[i];
            const entity = this.index.get(id)!;
            this.filtration[i] = entity;
        }

        this.offsets = applyMISFiltration(this.adjacencyList, this.filtration, subGraph.length);
        console.debug(this.filtration, this.offsets);

        let averageDegree = 0;
        for (const neighbours of this.adjacencyList) {
            averageDegree += neighbours.size;
        }
        averageDegree /= subGraph.length;
        this.neighbourHoodSize = averageDegree * this.offsets.length;
        this.heat.fill(this.edgeLength / 6);
        this.subGraphCount = subGraph.length;
    }

    /**
     * Erster Layout-Pass
     */
    initLayout() {
        const [u, v, w] = this.filtration.slice(0, 3);
        const edgeLength = this.edgeLength;
        const a = graphDistance(this.priorityQueue, this.adjacencyList, u, v) * edgeLength;
        const b = graphDistance(this.priorityQueue, this.adjacencyList, v, w) * edgeLength;
        const c = graphDistance(this.priorityQueue, this.adjacencyList, w, u) * edgeLength;

        const [x, y] = getOffset(a, b, c);

        set(this.pos, w, 0, 0);
        set(this.pos, v, x, y);
        set(this.pos, u, c, 0);

        this.placedVertices.add(u);
        this.placedVertices.add(v);
        this.placedVertices.add(w);

        const neighbourHoodSize = this.neighbourHoodSize;
        const nU = findNeighbourHood(this.adjacencyList, this.queue, neighbourHoodSize, u);
        const nV = findNeighbourHood(this.adjacencyList, this.queue, neighbourHoodSize, v);
        const nW = findNeighbourHood(this.adjacencyList, this.queue, neighbourHoodSize, w);

        // Die Graphdistanzen zwischen u, v, w sind nicht unbedingt gleich.
        // Daher muss gecheckt werden, ob diese existieren und hinzugefügt
        // werden, wenn das nicht der Fall ist.
        function insert(neighbourHood: Array<Entity>, value: Entity) {
            for (let i = neighbourHood.length - 1; i >= 0; i--) {
                if (neighbourHood[i] === value) {
                    return;
                }
            }
            neighbourHood.push(value);
        }

        insert(nU, v);
        insert(nU, w);
        insert(nV, u);
        insert(nV, w);
        insert(nW, u);
        insert(nW, v);

        this.neighbourHoods.set(u, nU);
        this.neighbourHoods.set(v, nV);
        this.neighbourHoods.set(w, nW);

        this.rounds = 5;

        const k = this.offsets.length - 1;
        this.refineLayout(k);
        this.iteration = k - 1;

        for (let i = 0; i < 30; i++) {
            this.tick();
            this.centerGraph();
        }
        this.scaleHeat(0.5);
    }

    tick() {
        const i = this.iteration;
        if (i > -1) {
            for (let j = this.offsets[i + 1]; j < this.offsets[i]; j++) {
                const vertex = this.filtration[j];
                this.neighbourHoods.set(
                    vertex,
                    findNeighbourHood(
                        this.adjacencyList,
                        this.queue,
                        this.neighbourHoodSize,
                        vertex
                    )
                );
                const triangle = getTriangle(
                    this.adjacencyList,
                    this.queue,
                    this.placedVertices,
                    vertex
                );
                const baryCenter = findBaryCenter(
                    this.priorityQueue,
                    this.adjacencyList,
                    this.pos,
                    this.edgeLength,
                    triangle,
                    vertex
                );
                setVector2(this.pos, vertex, baryCenter);
                this.placedVertices.add(vertex);
            }
            this.iteration -= 1;
        }
        this.refineLayout(Math.max(i, 0));
    }

    centerGraph() {
        for (let i = 0; i < this.subGraphCount; i++) {
            const posIndex = this.filtration[i] * 2;
            this.pos[posIndex] *= 0.75;
            this.pos[posIndex + 1] *= 0.75;
        }
    }

    private refineLayout(iteration: number) {
        const computeForce =
            iteration > 0 ? computeKamadaKawaiForce : computeFruchtermanReingoldForce;
        const end = this.offsets[iteration];
        this.rounds = Math.min(30, end);
        const delta = this.tempDelta;
        const disp = this.tempDisp;
        const oldDisp = this.oldDisp;
        const edgeLengthSquared = squared(this.edgeLength);
        for (let i = 0; i < this.rounds; i++) {
            for (let j = 0; j < end; j++) {
                const v = this.filtration[j];
                const neighbourHood = this.neighbourHoods.get(v);
                if (neighbourHood === undefined) {
                    continue;
                }
                copyFrom(this.disp, v, oldDisp);
                disp[0] = 0;
                disp[1] = 0;
                computeForce(
                    v,
                    disp,
                    delta,
                    neighbourHood,
                    this.adjacencyList,
                    this.pos,
                    edgeLengthSquared,
                    this.placedVertices,
                    this.priorityQueue
                );
                const heat = updateLocalTemp(disp, oldDisp, this.cos, this.heat, v);
                normalize(disp);
                mulAssign(disp, heat);
                setVector2(this.disp, v, disp);
            }

            for (let j = 0; j < end; j++) {
                const v = this.filtration[j];
                copyFrom(this.disp, v, disp);
                addAssignArray(this.pos, v, disp);
            }
        }
    }

    private scaleHeat(factor: number) {
        for (let i = 0; i < this.heat.length; i++) {
            this.heat[i] *= factor;
        }
    }
}

export class Vertex {
    id: number;

    constructor(id = 0) {
        this.id = id;
    }
}

function computeKamadaKawaiForce(
    v: Entity,
    disp: Vec2,
    delta: Vec2,
    neighbourHood: Entity[],
    adjacencyList: AdjacencyList,
    pos: Float32Array,
    edgeLengthSquared: number,
    placedVertices: Set<number>,
    priorityQueue: PriorityQueue
) {
    const s = 0.5;
    for (const u of neighbourHood) {
        if (!placedVertices.has(u)) {
            continue;
        }
        getDelta(pos, u, v, delta);
        const distance = magnitude(delta);
        const idealDistance = graphDistance(priorityQueue, adjacencyList, u, v) * edgeLengthSquared;
        const energy = distance / idealDistance - 1;
        mulAssign(delta, energy * s);
        addAssign(disp, delta);
    }
}

function computeFruchtermanReingoldForce(
    v: Entity,
    disp: Vec2,
    delta: Vec2,
    neighbourHood: Entity[],
    adjacencyList: AdjacencyList,
    pos: Float32Array,
    edgeLengthSquared: number,
    placedVertices: Set<number>,
    _priorityQueue: PriorityQueue
) {
    const s = 0.05;

    for (const u of adjacencyList[v]) {
        if (!placedVertices.has(u)) {
            continue;
        }
        getDelta(pos, u, v, delta);
        const attraction = magnitudeSquared(delta) / edgeLengthSquared;
        mulAssign(delta, attraction);
        addAssign(disp, delta);
    }

    for (const u of neighbourHood) {
        if (!placedVertices.has(u)) {
            continue;
        }
        getDelta(pos, v, u, delta);
        const distanceSquared = magnitudeSquared(delta);
        if (distanceSquared === 0) {
            continue;
        }
        const repulsion = s * (edgeLengthSquared / distanceSquared);
        mulAssign(delta, repulsion);
        addAssign(disp, delta);
    }
}

function getTriangle(
    adjacencyList: AdjacencyList,
    queue: Queue,
    placedVertices: Set<Entity>,
    v: Entity
): [Entity, Entity, Entity] {
    const triple: Entity[] = [];
    const removed = new Set([v]);
    let u: number | undefined = v;
    loop: do {
        for (const v of adjacencyList[u]) {
            if (!removed.has(v)) {
                if (placedVertices.has(v)) {
                    triple.push(v);
                    if (triple.length === 3) {
                        break loop;
                    }
                }

                removed.add(v);
                queue.enqueue(v);
            }
        }
        u = queue.dequeue();
    } while (u !== undefined);
    queue.clear();
    return triple as [Entity, Entity, Entity];
}

function updateLocalTemp(
    disp: Vec2,
    oldDisp: Vec2,
    cos: Float32Array,
    heat: Float32Array,
    v: number
): number {
    const dispDistSquared = magnitudeSquared(disp);
    const oldDispSquared = magnitudeSquared(oldDisp);
    const oldHeat = heat[v];
    if (dispDistSquared == 0 || oldDispSquared === 0) {
        return oldHeat;
    }
    const oldCos = cos[v];
    const newCos = dot(disp, oldDisp) / Math.sqrt(dispDistSquared * oldDispSquared);
    // s = oldCos * newCos > 0 ? 3 : 1
    const s = 3 >> +(oldCos * newCos <= 0); // +(oldCos * newCos > 0) = Number(oldCos * newCos > 0)
    const r = 0.15;
    const newHeat = oldHeat * (1 + newCos * r * s);
    cos[v] = newCos;
    heat[v] = newHeat;
    return newHeat;
}

/**
 * Graph in Cluster unterteilen :)
 */
function applyMISFiltration(adjacencyList: AdjacencyList, vertices: Uint32Array, count: number) {
    const rng = Random("mis_filtration");
    function randomInt(end: number): number {
        return Math.trunc(Math.min(rng.quick() * end, end - 1));
    }

    const removed = new Set();

    function depthSearch(vertex: number, depth: number, maxGraphDistance: number) {
        if (depth === maxGraphDistance) {
            return;
        }
        for (const neighbour of adjacencyList[vertex]) {
            if (!removed.has(neighbour)) {
                removed.add(neighbour);
                depthSearch(neighbour, depth + 1, maxGraphDistance);
            }
        }
    }

    const offsets = [count];

    let level = 0;
    let maxGraphDistance = 0;
    let back = count;
    while (maxGraphDistance < count && offsets[level] > 3) {
        maxGraphDistance = Math.pow(2, level);
        let front = 0;
        while (front < back) {
            const randomIndex = randomInt(back - front);
            swap(vertices, front, front + randomIndex);
            const v0 = vertices[front];
            removed.add(v0);

            depthSearch(v0, 0, maxGraphDistance);

            front += 1;
            for (let i = front; i < back; i++) {
                if (removed.has(vertices[i])) {
                    back -= 1;
                    if (i !== back && removed.has(vertices[back])) {
                        back -= 1;
                    }
                    swap(vertices, back, i);
                }
            }
            removed.clear();
        }
        if (offsets[level] === front) {
            break;
        }

        offsets.push(front);
        level += 1;
    }
    offsets[level] = 3;
    return offsets;
}

function findNeighbourHood(
    adjacencyList: AdjacencyList,
    queue: Queue,
    size: number,
    v: Entity
): Array<Entity> {
    const removed = new Set();
    removed.add(v);
    const neighbourHood: number[] = [];
    let u: number | undefined = v;
    while (u !== undefined && neighbourHood.length <= size) {
        neighbourHood.push(u);
        for (const neighbour of adjacencyList[u]) {
            if (!removed.has(neighbour)) {
                removed.add(neighbour);
                queue.enqueue(neighbour);
            }
        }
        u = queue.dequeue();
    }
    queue.clear();
    neighbourHood.shift();
    return neighbourHood;
}

function findBaryCenter(
    priorityQueue: PriorityQueue,
    adjacencyList: AdjacencyList,
    pos: Float32Array,
    edgeLength: number,
    triangle: [u: Entity, v: Entity, w: Entity],
    t: Entity
): Vec2 {
    const [u, v, w] = triangle;
    const distUT = graphDistance(priorityQueue, adjacencyList, u, t) * edgeLength;
    const distVT = graphDistance(priorityQueue, adjacencyList, v, t) * edgeLength;
    const distWT = graphDistance(priorityQueue, adjacencyList, w, t) * edgeLength;

    const distUV = graphDistance(priorityQueue, adjacencyList, u, v) * edgeLength;
    const distVW = graphDistance(priorityQueue, adjacencyList, v, w) * edgeLength;
    const distWU = graphDistance(priorityQueue, adjacencyList, w, u) * edgeLength;

    const uPos = get(pos, u);
    const vPos = get(pos, v);
    const wPos = get(pos, w);

    const pos0 = getOffset(distUT, distVT, distUV);
    const pos1 = getOffset(distVT, distWT, distVW);
    const pos2 = getOffset(distWT, distUT, distWU);

    const [tx0, ty0] = findClosestPosition(uPos, vPos, wPos, pos0);
    const [tx1, ty1] = findClosestPosition(vPos, wPos, uPos, pos1);
    const [tx2, ty2] = findClosestPosition(wPos, uPos, vPos, pos2);
    return vec2((tx0 + tx1 + tx2) / 3, (ty0 + ty1 + ty2) / 3);
}

function findClosestPosition(u: Vec2, v: Vec2, [wx, wy]: Vec2, [tx, ty]: Vec2): Vec2 {
    let dx = u[0] - v[0];
    let dy = u[1] - v[1];
    const distanceSquared = squared(dx) + squared(dy);
    if (distanceSquared === 0) {
        return v;
    }
    const distance = Math.sqrt(distanceSquared);
    dx /= distance;
    dy /= distance;
    const mirrorX = v[0] + dx * tx;
    const mirrorY = v[1] + dy * tx;
    const rotatedX = dx * ty;
    const rotatedY = -dy * ty;
    const t0X = mirrorX - rotatedX;
    const t0Y = mirrorY - rotatedY;
    const t1X = mirrorX + rotatedX;
    const t1Y = mirrorY + rotatedY;
    const distance0 = squared(wx - t0X) + squared(wy - t0Y);
    const distance1 = squared(wx - t1X) + squared(wy - t1Y);

    if (distance0 < distance1) {
        return vec2(t0X, t0Y);
    } else {
        return vec2(t1X, t1Y);
    }
}

function graphDistance(
    priorityQueue: PriorityQueue,
    adjacencyList: AdjacencyList,
    start: number,
    end: number
) {
    let currentDistance = 0;
    let u: number | undefined = start;
    priorityQueue.setPriority(start, 0);
    loop: do {
        currentDistance = priorityQueue.getPriority(u)!;

        for (const v of adjacencyList[u]) {
            if (v == end) {
                currentDistance += 1;
                break loop;
            }

            const distance = priorityQueue.getPriority(v);
            if (distance === undefined) {
                priorityQueue.push(v, currentDistance + 1);
            } else if (distance > currentDistance) {
                priorityQueue.setPriority(v, currentDistance + 1);
            }
        }
        u = priorityQueue.pop();
    } while (u !== undefined);
    priorityQueue.clear();
    return currentDistance;
}

function getOffset(a: number, b: number, c: number): Vec2 {
    const cosAlpha = (-squared(a) + squared(b) + squared(c)) / (2 * b * c);
    const x = cosAlpha * b;
    const y = Math.sin(Math.acos(cosAlpha)) * b;
    return vec2(x, y);
}

expose(LayoutEngine)