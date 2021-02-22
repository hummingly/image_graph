import { createGraph, ImageGraph } from "./data";
import type { LayoutEngine } from "./layout";
import { wrap } from "comlink";

const LayoutWorker = wrap<typeof LayoutEngine>(new Worker(new URL("layout.ts", import.meta.url)));

async function main() {
    const IMAGE_DIMENSION = 200;

    let counter = 0;
    let animationId: number | undefined = undefined;
    let isSimulating = false;
    const container = document.querySelector("#container") as HTMLDivElement;
    const canvasPos = [container.clientWidth / 2, container.clientHeight / 2];

    let isMouseDown = false;

    const canvas = document.querySelector("#canvas") as HTMLDivElement;
    canvas.style.transform = `translate(${canvasPos[0]}px,${canvasPos[1]}px)`;
    const vertices = document.querySelector("#vertices") as HTMLDivElement;
    const viewer = document.querySelector("#viewer") as HTMLDivElement;
    const viewerCloseButton = document.querySelector("#viewer button") as HTMLButtonElement;
    const edges = document.querySelector("svg") as SVGElement;

    const graph = await createGraph(100, 100);

    const layoutEngine = await new LayoutWorker(graph.sendGraphData());
    await layoutEngine.buildGraph(graph.subGraph, IMAGE_DIMENSION * 2);
    await layoutEngine.initLayout();

    vertices.appendChild(createImages(graph.nodes.length, IMAGE_DIMENSION));
    edges.appendChild(createConnections(graph.edges.length));

    async function layoutImages() {
        const pos = await layoutEngine.pos;
        const subGraph = graph.subGraph.map((id) => graph.index.get(id)!);
        const offset = IMAGE_DIMENSION / 2;
        for (let i = 0; i < subGraph.length; i++) {
            const index = subGraph[i];
            const posIndex = index * 2;
            const x = pos[posIndex] - offset;
            const y = -pos[posIndex + 1] - offset;

            const { id, imageData } = graph.nodes[index];
            const image = vertices.children[i] as HTMLImageElement;
            image.id = id + '';
            image.src = imageData.webformatURL;
            image.style.transform = `translate(${x}px,${y}px)`;
        }

        for (let i = 0; i < graph.edges.length; i++) {
            const path = edges.children[i] as SVGElement;
            path.style.display = 'block';
            const { u, v } = graph.edges[i];
            console.log(graph.edges[i])
            const x0 = pos[u * 2];
            const y0 = -pos[u * 2 + 1];
            const x1 = pos[v * 2];
            const y1 = -pos[v * 2 + 1];
            path.setAttribute("d", `M${x0},${y0} L${x1},${y1}`);
        }
    }

    await layoutImages();

    /** Event Listener */

    vertices.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;
        if (target.tagName !== 'IMG') {
            return;
        }
        const index = parseInt(target.id);
        viewer.style.display = 'flex';
        const image = viewer.lastElementChild as HTMLImageElement;
        image.src = graph.nodes[graph.index.get(index)!].imageData.largeImageURL;
    });

    viewerCloseButton.addEventListener('click', () => {
        viewer.style.display = 'none';
        const image = viewer.lastElementChild as HTMLImageElement;
        image.src = '';
    });


    container.addEventListener('mousedown', (event: MouseEvent) => {
        if (event.target === event.currentTarget) {
            isMouseDown = true;
        }
    });

    container.addEventListener('mousemove', (event: MouseEvent) => {
        if (isMouseDown) {
            canvasPos[0] += event.movementX;
            canvasPos[1] += event.movementY;
            const [x, y] = canvasPos;
            canvas.style.transform = `translate(${x}px,${y}px)`;
        }
    });

    container.addEventListener('mouseup', () => {
        isMouseDown = false;
    });
}

window.onload = main;

function createImages(count: number, dimension: number) {
    const fragment = new DocumentFragment();
    for (let i = 0; i < count; i++) {
        const image = new Image(dimension, dimension);
        image.classList.add("vertex");
        image.loading = "lazy";
        fragment.appendChild(image);
    }
    return fragment;
}

function createConnections(count: number) {
    const fragment = new DocumentFragment();
    for (let i = 0; i < count; i++) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.classList.add("edge");
        fragment.appendChild(path);
    }
    return fragment;
}
