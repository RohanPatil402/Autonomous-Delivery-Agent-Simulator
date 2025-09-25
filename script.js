const TILE_TYPE = {
    EMPTY: 0,
    WALL: 1,
    START: 2,
    END: 3,
};

const TERRAIN_COST = {
    ROAD: 1,
    GRASS: 3,
    WATER: 5,
};

const TILE_STYLES = {
    BASE: 'transition-colors duration-500',
    [TILE_TYPE.START]: 'bg-green-500',
    [TILE_TYPE.END]: 'bg-red-500',
    [TILE_TYPE.WALL]: 'bg-gray-500',
    PATH: 'bg-blue-500',
    VISITED: 'bg-sky-700/80',
    AGENT: 'bg-yellow-400',
    DYNAMIC_OBSTACLE: 'bg-purple-600',
};

const TERRAIN_STYLES = {
    ROAD: 'bg-slate-400',
    GRASS: 'bg-green-800/60',
    WATER: 'bg-blue-800/60',
};

const ALGORITHMS = {
    BFS: 'Breadth-First Search (Uninformed)',
    UCS: 'Uniform-Cost Search (Uninformed)',
    A_STAR: 'A* Search (Informed)',
    A_STAR_REPLAN: 'A* with Replanning',
};

const ANIMATION_SPEEDS = {
    VISITED: 15,
    AGENT: 100,
};

// --- MAP DEFINITIONS ---
function defineMaps() {
    const maps = {
        small: {
            name: "Small Office",
            grid: [
                [2, 0, 0, 0, 1, 0, 0, 0, 0, 0],
                [0, 1, 1, 0, 1, 0, 1, 1, 1, 0],
                [0, 1, 0, 0, 0, 0, 0, 0, 1, 0],
                [0, 1, 0, 1, 1, 1, 1, 0, 1, 0],
                [0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
                [1, 1, 1, 1, 1, 0, 1, 1, 1, 0],
                [0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
                [0, 1, 1, 0, 1, 1, 1, 1, 1, 0],
                [0, 0, 0, 0, 0, 0, 0, 0, 1, 3],
            ],
            terrain: null,
        },
        medium: {
            name: "Medium Warehouse (with Terrain)",
            grid: Array.from({ length: 15 }, () => Array(25).fill(TILE_TYPE.EMPTY)),
            terrain: Array.from({ length: 15 }, () => Array(25).fill('ROAD')),
        },
        large: {
            name: "Large City Block",
            grid: Array.from({ length: 25 }, () => Array(40).fill(TILE_TYPE.EMPTY)),
            terrain: Array.from({ length: 25 }, () => Array(40).fill('ROAD')),
        },
        dynamic: {
            name: "Dynamic Highway",
            grid: Array.from({ length: 15 }, () => Array(25).fill(TILE_TYPE.EMPTY)),
            terrain: Array.from({ length: 15 }, () => Array(25).fill('ROAD')),
            dynamicObstacles: [
                { id: 1, path: Array.from({ length: 20 }, (_, i) => ({ y: 3, x: 2 + i })) },
                { id: 2, path: Array.from({ length: 20 }, (_, i) => ({ y: 11, x: 22 - i })) },
            ],
        },
    };

    // Procedurally generate medium map
    const medGrid = maps.medium.grid;
    const medTerrain = maps.medium.terrain;
    medGrid[2][2] = TILE_TYPE.START;
    medGrid[12][22] = TILE_TYPE.END;
    for (let i = 0; i < medGrid.length; i++) {
        for (let j = 0; j < medGrid[0].length; j++) {
            if (medGrid[i][j] === TILE_TYPE.EMPTY && Math.random() > 0.8) medGrid[i][j] = TILE_TYPE.WALL;
            if (j > 5 && j < 19) medTerrain[i][j] = 'GRASS';
            if ((i > 4 && i < 10) && (j > 8 && j < 16)) medTerrain[i][j] = 'WATER';
        }
    }

    // Procedurally generate large map
    const largeGrid = maps.large.grid;
    for (let i = 0; i < largeGrid.length; i++) {
        if (i % 4 === 0 || i % 4 === 1) continue;
        for (let j = 0; j < largeGrid[0].length; j++) {
            if (j % 5 !== 0 && Math.random() > 0.1) largeGrid[i][j] = TILE_TYPE.WALL;
        }
    }
    largeGrid[2][2] = TILE_TYPE.START;
    largeGrid[22][37] = TILE_TYPE.END;

    // Setup dynamic map
    const dynGrid = maps.dynamic.grid;
    dynGrid[7][2] = TILE_TYPE.START;
    dynGrid[7][22] = TILE_TYPE.END;
    for (let x = 0; x < 25; x++) {
        if (x % 6 !== 0) {
            dynGrid[2][x] = TILE_TYPE.WALL;
            dynGrid[4][x] = TILE_TYPE.WALL;
            dynGrid[10][x] = TILE_TYPE.WALL;
            dynGrid[12][x] = TILE_TYPE.WALL;
        }
    }

    return maps;
}

const MAPS = defineMaps();

// --- HELPER CLASSES & FUNCTIONS ---
class PriorityQueue {
    constructor() { this.elements = []; }
    enqueue(element, priority) {
        this.elements.push({ element, priority });
        this.elements.sort((a, b) => a.priority - b.priority);
    }
    dequeue() { return this.elements.shift().element; }
    isEmpty() { return this.elements.length === 0; }
}

function manhattanDistance(a, b) {
    return Math.abs(a.y - b.y) + Math.abs(a.x - b.x);
}

function findStartEnd(grid) {
    let start = null, end = null;
    for (let y = 0; y < grid.length; y++) {
        for (let x = 0; x < grid[y].length; x++) {
            if (grid[y][x] === TILE_TYPE.START) start = { y, x };
            if (grid[y][x] === TILE_TYPE.END) end = { y, x };
        }
    }
    return { start, end };
}

// --- CORE PATHFINDING ALGORITHM ---
function solve(algorithm, grid, start, end, terrain) {
    if (!start || !end) {
        console.error("Solve function called with null start or end point.");
        return { path: [], visitedOrder: [], totalCost: 0, time: '0.00' };
    }
    const startTime = performance.now();
    const rows = grid.length;
    const cols = grid[0].length;

    const getCost = (y, x) => {
        if (!terrain) return TERRAIN_COST.ROAD;
        const t = terrain[y][x];
        return t === 'GRASS' ? TERRAIN_COST.GRASS : (t === 'WATER' ? TERRAIN_COST.WATER : TERRAIN_COST.ROAD);
    };

    let queue;
    if (algorithm === ALGORITHMS.BFS) {
        queue = [{ y: start.y, x: start.x }]; // FIFO
    } else {
        queue = new PriorityQueue();
        queue.enqueue({ y: start.y, x: start.x }, 0);
    }

    const startKey = `${start.y}-${start.x}`;
    const cameFrom = { [startKey]: null };
    const costSoFar = { [startKey]: 0 };
    const visitedOrder = [];

    while ((algorithm === ALGORITHMS.BFS) ? queue.length > 0 : !queue.isEmpty()) {
        const current = (algorithm === ALGORITHMS.BFS) ? queue.shift() : queue.dequeue();

        // avoid pushing duplicate visited entries for the same position
        const currentKey = `${current.y}-${current.x}`;
        visitedOrder.push(current);

        if (current.y === end.y && current.x === end.x) break;

        const neighbors = [
            { y: current.y - 1, x: current.x }, { y: current.y + 1, x: current.x },
            { y: current.y, x: current.x - 1 }, { y: current.y, x: current.x + 1 },
        ];

        for (const next of neighbors) {
            if (next.y >= 0 && next.y < rows && next.x >= 0 && next.x < cols && grid[next.y][next.x] !== TILE_TYPE.WALL) {
                const nextKey = `${next.y}-${next.x}`;
                const newCost = costSoFar[currentKey] + getCost(next.y, next.x);

                if (costSoFar[nextKey] === undefined || newCost < costSoFar[nextKey]) {
                    costSoFar[nextKey] = newCost;

                    let priority = 0;
                    if (algorithm === ALGORITHMS.UCS || algorithm === ALGORITHMS.A_STAR || algorithm === ALGORITHMS.A_STAR_REPLAN) {
                        priority = newCost;
                    }
                    if (algorithm === ALGORITHMS.A_STAR || algorithm === ALGORITHMS.A_STAR_REPLAN) {
                        priority += manhattanDistance(next, end);
                    }

                    if (algorithm === ALGORITHMS.BFS) queue.push(next);
                    else queue.enqueue(next, priority);

                    cameFrom[nextKey] = { y: current.y, x: current.x };
                }
            }
        }
    }

    // Reconstruct path and calculate total cost
    let path = [];
    const endKey = `${end.y}-${end.x}`;
    let totalCost = 0;

    if (cameFrom[endKey] !== undefined) {
        // walk backwards
        let curKey = endKey;
        while (curKey) {
            const [cy, cx] = curKey.split('-').map(Number);
            path.unshift({ y: cy, x: cx });
            const prev = cameFrom[curKey];
            if (prev) {
                totalCost += getCost(cy, cx);
                curKey = `${prev.y}-${prev.x}`;
            } else {
                curKey = null;
            }
        }
    }

    const endTime = performance.now();

    const pathFound = path.length > 1 && path[0].y === start.y && path[0].x === start.x;

    return {
        path: pathFound ? path : [],
        visitedOrder,
        totalCost,
        time: (endTime - startTime).toFixed(2),
    };
}

// --- DOM & UI LOGIC ---
document.addEventListener('DOMContentLoaded', () => {
    const gridContainer = document.getElementById('grid-container');
    const mapSelect = document.getElementById('map-select');
    const algoSelect = document.getElementById('algo-select');
    const startBtn = document.getElementById('start-btn');
    const resetBtn = document.getElementById('reset-btn');
    const statsContainer = document.getElementById('stats-container');
    const logContainer = document.getElementById('log-container');

    let state = {
        grid: null,
        terrain: null,
        dynamicObstacles: [],
        isRunning: false,
        currentAnimation: null,
    };

    function addLog(message) {
        const p = document.createElement('p');
        p.textContent = `${message}`;
        p.className = 'log-entry';
        logContainer.appendChild(p);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    function updateStats({ cost, nodes, time, replans }) {
        let html = `<p><strong class="text-green-400">Path Cost:</strong> ${cost}</p>`;
        html += `<p><strong class="text-green-400">Nodes Expanded:</strong> ${nodes}</p>`;
        html += `<p><strong class="text-green-400">Time Taken:</strong> ${time} ms</p>`;
        if (replans) html += `<p><strong class="text-yellow-400">Replans:</strong> ${replans}</p>`;
        statsContainer.innerHTML = html;
    }

    function renderGrid() {
        gridContainer.innerHTML = '';
        gridContainer.style.display = 'grid';
        gridContainer.style.gridTemplateColumns = `repeat(${state.grid[0].length}, 1fr)`;
        gridContainer.style.gridTemplateRows = `repeat(${state.grid.length}, 1fr)`;
        gridContainer.style.gap = '1px';

        for (let y = 0; y < state.grid.length; y++) {
            for (let x = 0; x < state.grid[y].length; x++) {
                const cell = document.createElement('div');
                cell.id = `cell-${y}-${x}`;
                cell.className = 'grid-cell';
                gridContainer.appendChild(cell);
                updateCell(y, x);
            }
        }
    }

    function updateCell(y, x, ...extraClasses) {
        const cell = document.getElementById(`cell-${y}-${x}`);
        if (!cell) return;

        const type = state.grid[y][x];
        let baseStyle = TILE_STYLES[type];

        if (!baseStyle) {
            // Not a special tile like wall, start, end
            baseStyle = state.terrain ? TERRAIN_STYLES[state.terrain[y][x]] : 'bg-slate-100';
        }

        const classes = ['grid-cell', TILE_STYLES.BASE, baseStyle, ...extraClasses].join(' ');
        cell.className = classes;
    }

    function resetSimulation(mapKey) {
        if (state.currentAnimation) {
            clearInterval(state.currentAnimation);
            state.currentAnimation = null;
        }

        const map = MAPS[mapKey];
        state.grid = map.grid.map(row => [...row]);
        state.terrain = map.terrain ? map.terrain.map(row => [...row]) : null;
        state.dynamicObstacles = (map.dynamicObstacles || []).map(obs => ({ ...obs, step: 0 }));

        renderGrid();

        statsContainer.innerHTML = `<p class="text-slate-600">Run a simulation to see results.</p>`;
        logContainer.innerHTML = '';
        addLog('System ready. Select an algorithm and start delivery.');
        setControlsEnabled(true);
    }

    function setControlsEnabled(enabled) {
        state.isRunning = !enabled;
        startBtn.disabled = !enabled;
        mapSelect.disabled = !enabled;
        algoSelect.disabled = !enabled;
        startBtn.textContent = enabled ? 'Start Delivery' : 'Running...';
    }

    function animate(actions) {
        return new Promise(resolve => {
            if (!actions || actions.length === 0) {
                resolve();
                return;
            }
            let i = 0;
            const tickSpeed = actions[0].speed || ANIMATION_SPEEDS.VISITED;
            state.currentAnimation = setInterval(() => {
                if (i >= actions.length) {
                    clearInterval(state.currentAnimation);
                    state.currentAnimation = null;
                    resolve();
                    return;
                }
                const { y, x, style } = actions[i];
                updateCell(y, x, style);
                i++;
            }, tickSpeed);
        });
    }

    async function handleStart() {
        setControlsEnabled(false);
        const mapKey = mapSelect.value;
        const algo = algoSelect.value;
        const { start, end } = findStartEnd(state.grid);

        if (!start || !end) {
            addLog("Error: Start or End point not found on the selected map!");
            statsContainer.innerHTML = `<p class="text-red-400">Execution failed.</p>`;
            setControlsEnabled(true);
            return;
        }

        renderGrid();
        logContainer.innerHTML = '';
        statsContainer.innerHTML = `<p class="text-slate-600">Running simulation...</p>`;

        addLog(`Starting ${algo} on '${MAPS[mapKey].name}'.`);

        if (algo === ALGORITHMS.A_STAR_REPLAN) {
            addLog("1. Calculating initial route...");
            const initialResult = solve(ALGORITHMS.A_STAR, state.grid, start, end, state.terrain);
            if (initialResult.path.length === 0) {
                addLog("No initial path found! Halting.");
                setControlsEnabled(true);
                return;
            }

            await animate(initialResult.visitedOrder.map(n => ({ y: n.y, x: n.x, style: TILE_STYLES.VISITED, speed: ANIMATION_SPEEDS.VISITED })));

            const blockIndex = Math.floor(initialResult.path.length / 1.5);
            const blockPos = initialResult.path[Math.max(0, Math.min(initialResult.path.length - 1, blockIndex))];
            state.grid[blockPos.y][blockPos.x] = TILE_TYPE.WALL;
            updateCell(blockPos.y, blockPos.x);
            addLog(`2. [EVENT] Obstacle appeared at (${blockPos.y}, ${blockPos.x})!`);

            const pathBeforeBlock = initialResult.path.slice(0, blockIndex);
            await animate(pathBeforeBlock.map(n => ({ y: n.y, x: n.x, style: TILE_STYLES.PATH, speed: ANIMATION_SPEEDS.AGENT })));

            const agentCurrentPos = pathBeforeBlock[pathBeforeBlock.length - 1];
            if (agentCurrentPos) updateCell(agentCurrentPos.y, agentCurrentPos.x, TILE_STYLES.AGENT);

            addLog(`3. Agent stopped. Replanning from (${agentCurrentPos.y}, ${agentCurrentPos.x})...`);
            const replanResult = solve(ALGORITHMS.A_STAR, state.grid, agentCurrentPos, end, state.terrain);

            if (replanResult.path.length === 0) {
                addLog("Failed to find a new path! Agent is stuck.");
                setControlsEnabled(true);
                return;
            }

            await animate(replanResult.visitedOrder.map(n => ({ y: n.y, x: n.x, style: TILE_STYLES.VISITED, speed: ANIMATION_SPEEDS.VISITED })));

            const finalFullPath = [...pathBeforeBlock, ...replanResult.path.slice(1)];
            await animate(finalFullPath.map(n => ({ y: n.y, x: n.x, style: TILE_STYLES.PATH, speed: ANIMATION_SPEEDS.AGENT })));

            updateStats({
                cost: 'N/A (Replanned)',
                nodes: initialResult.visitedOrder.length + replanResult.visitedOrder.length,
                time: (parseFloat(initialResult.time) + parseFloat(replanResult.time)).toFixed(2),
                replans: 1,
            });

        } else {
            const { path, visitedOrder, totalCost, time } = solve(algo, state.grid, start, end, state.terrain);

            await animate(visitedOrder.map(n => ({ y: n.y, x: n.x, style: TILE_STYLES.VISITED, speed: ANIMATION_SPEEDS.VISITED })));

            if (path.length > 0) {
                await animate(path.map(n => ({ y: n.y, x: n.x, style: TILE_STYLES.PATH, speed: ANIMATION_SPEEDS.AGENT })));
                updateStats({ cost: totalCost, nodes: visitedOrder.length, time });
            } else {
                addLog("No path could be found.");
                statsContainer.innerHTML = `<p class="text-red-400">No path found!</p>`;
            }
        }

        addLog("Delivery complete.");
        setControlsEnabled(true);
    }

    function init() {
        Object.keys(MAPS).forEach(key => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = MAPS[key].name;
            mapSelect.appendChild(option);
        });
        Object.values(ALGORITHMS).forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            algoSelect.appendChild(option);
        });

        mapSelect.value = 'medium';
        algoSelect.value = ALGORITHMS.A_STAR;

        mapSelect.addEventListener('change', (e) => resetSimulation(e.target.value));
        startBtn.addEventListener('click', handleStart);
        resetBtn.addEventListener('click', () => resetSimulation(mapSelect.value));

        resetSimulation('medium');
    }

    init();
});
