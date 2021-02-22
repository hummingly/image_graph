import { prng_alea as Random } from "esm-seedrandom";
import { Queue } from "./collection";

export class ImageGraph {
    // Extern geladene Bilder von Pixabay
    imageData: ImageData[];

    // Image ID -> Index
    index: Map<number, number> = new Map();
    nodes: ImageNode[];
    subGraph: number[];
    edges: Edge[];
    adjacencyList: Array<Set<number>>;

    constructor(nodes: ImageNode[], adjacencyList: Array<Set<number>>, subGraph: number[], images: ImageData[]) {
        for (let i = 0; i < nodes.length; i++) {
            this.index.set(nodes[i].id, i);
        }
        this.nodes = nodes;
        this.imageData = images;
        this.adjacencyList = adjacencyList;
        this.subGraph = subGraph;
        this.edges = [];

        const sub = subGraph.map((id) => this.index.get(id)!);
        const visibleNodes = new Set(sub);
        const edgeExists = new Set();

        for (const v of visibleNodes) {
            edgeExists.add(v);
            for (const u of this.adjacencyList[v]) {
                if (!visibleNodes.has(u) || edgeExists.has(u)) {
                    continue;
                }
                edgeExists.add(u);
                this.edges.push(new Edge(v, u));
            }
        }
    }

    sendGraphData(): IGraphData {
        return {
            index: this.index,
            nodeCount: this.nodes.length,
            adjacencyList: this.adjacencyList,
            subGraph: this.subGraph,
        }
    }
}

export class Edge {
    u: number;
    v: number;

    constructor(u: number, v: number) {
        this.u = u;
        this.v = v;
    }
}

export interface IGraphData {
    index: Map<number, number>;
    nodeCount: number;
    subGraph: number[];
    adjacencyList: Array<Set<number>>;
}

class ImageNode {
    id: number;
    imageData: ImageData;
    state: number = 0;

    constructor(id: number, imageData: ImageData) {
        this.id = id;
        this.imageData = imageData;
    }
}

export async function createGraph(graphSize: number, subGraphSize: number) {
    const imageData: ImageData[] = await fetchImages(Math.min(graphSize, 800));
    const maxNeigbourCount = Math.min(graphSize - 2, 3)

    const rng = Random("graph");
    function randomInt(end: number): number {
        return Math.min(Math.round(rng.quick() * end), end - 1);
    }
    const nodes = new Array<ImageNode>(graphSize);
    const adjacencyList = new Array<Set<number>>(graphSize);
    for (let i = 0; i < graphSize; i++) {
        adjacencyList[i] = new Set();
        nodes[i] = new ImageNode(i, imageData[randomInt(imageData.length)]);
    }

    for (let i = 0; i < graphSize; i++) {
        const neighbours = adjacencyList[i];

        let neighbourCount = Math.round(rng.quick() * maxNeigbourCount) + 1;
        while (neighbours.size < neighbourCount) {
            const randomNeighbourIndex = randomInt(graphSize);
            if (randomNeighbourIndex !== i) {
                neighbours.add(randomNeighbourIndex);
                adjacencyList[randomNeighbourIndex].add(i);
            }
        }
    }

    const start = randomInt(graphSize);
    const subGraph: number[] = [];
    const queue = new Queue(graphSize);
    let set = new Set(adjacencyList.map((_, i) => i));
    set.delete(start);
    let u: number | undefined = start;
    do {
        subGraph.push(u);
        for (const neighbour of adjacencyList[u]) {
            if (set.has(neighbour)) {
                set.delete(neighbour);
                queue.enqueue(neighbour);
            }
        }
        u = queue.dequeue();
    } while (u !== undefined);

    for (const disconnectedVertex of set) {
        const randomNeighbour = subGraph[randomInt(subGraph.length)];
        subGraph.push(disconnectedVertex);
        set.delete(disconnectedVertex);
        for (const neighbour of adjacencyList[disconnectedVertex]) {
            subGraph.push(neighbour);
            set.delete(neighbour);
        }
        adjacencyList[disconnectedVertex].add(randomNeighbour);
        adjacencyList[randomNeighbour].add(disconnectedVertex);
    }

    queue.clear();
    set.clear();
    set.add(start);
    u = start;
    subGraph.splice(0, subGraph.length);
    do {
        subGraph.push(u);
        for (const neighbour of adjacencyList[u]) {
            if (!set.has(neighbour)) {
                set.add(neighbour);
                queue.enqueue(neighbour);
            }
        }
        u = queue.dequeue();
    } while (u !== undefined && subGraph.length < subGraphSize);

    return new ImageGraph(nodes, adjacencyList, subGraph, imageData)
}

interface APIPayload {
    hits: ImageData[];
}

interface ImageData {
    largeImageURL: string;
    webformatURL: string;
    webformatWidth: number;
    webformatHeight: number;
}

async function fetchImages(count: number): Promise<ImageData[]> {
    const promises: Promise<Response>[] = [];

    const pages = Math.trunc(count / 200)
    for (let i = 1; i < pages; i++) {
        promises.push(fetchAPI(i, 200));
    }

    const rest = Math.trunc(count % 200);
    if (rest > 0) {
        promises.push(fetchAPI(pages, rest));
    }

    const responses = await Promise.all(promises);
    const payloads: APIPayload[] = await Promise.all(responses.map((response) => response.json()));
    const results: ImageData[] = [];
    for (const payload of payloads) {
        for (const hit of payload.hits) {
            results.push({
                largeImageURL: hit.largeImageURL,
                webformatWidth: hit.webformatWidth,
                webformatHeight: hit.webformatHeight,
                webformatURL: hit.webformatURL,
            });
        }
    }
    return results;
}


function fetchAPI(page: number, limit: number): Promise<Response> {
    // TODO: Farben zufällig wählen
    return fetch(
        `https://pixabay.com/api/?key=20367113-a073301e7fe873963664d26f9&category=nature&image_type=photo&page=${page}$&per_page=${limit}`
    );
}