export class Queue {
    private items: Uint32Array;

    private size: number = 0;

    private front: number = 0;
    private rear: number;

    constructor(capacity: number) {
        this.items = new Uint32Array(capacity);
        this.rear = capacity - 1;
    }

    enqueue(item: number) {
        this.rear = (this.rear + 1) % this.items.length;
        this.items[this.rear] = item;
        this.size += 1;
    }

    dequeue(): number | undefined {
        if (this.size === 0) {
            return undefined;
        }
        const item = this.items[this.front];
        this.front = (this.front + 1) % this.items.length;
        this.size -= 1;
        return item;
    }

    clear() {
        this.size = 0;
        this.front = 0;
        this.rear = this.items.length - 1;
    }
}

export class PriorityQueue {
    private items: Uint32Array;
    private score: Map<number, number> = new Map();

    private size: number = 0;

    constructor(capacity: number) {
        this.items = new Uint32Array(capacity);
    }

    push(item: number, priority: number) {
        this.score.set(item, priority);
        let index = this.size;
        this.items[index] = item;
        this.size += 1;

        let parentIndex = parent(index);
        while (parentIndex !== undefined && this.cmp(parentIndex, index) === Ordering.Greater) {
            swap(this.items, index, parentIndex);
            index = parentIndex;
            parentIndex = parent(index);
        }
    }

    pop(): number | undefined {
        if (this.size === 0) {
            return undefined;
        }

        this.size -= 1;
        const last = this.items[this.size];
        if (this.size === 0) {
            return last;
        }
        const first = this.items[0];
        this.items[0] = last;
        this.minHeapify(0);
        return first;
    }

    setPriority(item: number, priority: number) {
        this.score.set(item, priority);
    }

    getPriority(item: number): number | undefined {
        return this.score.get(item);
    }

    clear() {
        this.size = 0;
        this.score.clear();
    }

    private minHeapify(parent: number) {
        const l = left(parent);
        const r = right(parent);
        let smallest = parent;

        if (l < this.size && this.cmp(l, parent) === Ordering.Less) {
            smallest = l;
        }
        if (r < this.size && this.cmp(r, parent) === Ordering.Less) {
            smallest = r;
        }

        if (smallest !== parent) {
            swap(this.items, parent, smallest);
            this.minHeapify(smallest);
        }
    }

    private cmp(item: number, other: number) {
        const itemDistance = this.score.get(this.items[item])!;
        const otherDistance = this.score.get(this.items[other])!;

        if (itemDistance > otherDistance) {
            return Ordering.Greater;
        } else if (itemDistance === otherDistance) {
            return Ordering.Equal;
        } else {
            return Ordering.Less;
        }
    }
}

const enum Ordering {
    Less = -1,
    Equal = 0,
    Greater = 1,
}

export function swap(array: Uint32Array, x: number, y: number) {
    [array[x], array[y]] = [array[y], array[x]];
}

function parent(index: number): number | undefined {
    if (index === 0) {
        return undefined;
    }
    return (index - 1) / 2;
}

function left(index: number) {
    return 2 * index + 1;
}

function right(index: number) {
    return 2 * index + 2;
}
