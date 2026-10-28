/**
 * Networking helpers for the service worker: a small concurrency limiter and
 * JSON/bytes fetchers with timeouts.
 */

/** Runs at most `max` tasks at once; extra tasks queue in FIFO order. */
export function createLimiter(max) {
    let active = 0;
    const queue = [];
    const next = () => {
        if (active >= max || queue.length === 0) return;
        active++;
        const { task, resolve, reject } = queue.shift();
        task()
            .then(resolve, reject)
            .finally(() => {
                active--;
                next();
            });
    };
    return (task) =>
        new Promise((resolve, reject) => {
            queue.push({ task, resolve, reject });
            next();
        });
}

async function fetchWithTimeout(url, { timeout = 10000, ...init } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        return await fetch(url, { credentials: 'include', ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

export async function fetchJson(url, init) {
    const res = await fetchWithTimeout(url, init);
    if (!res.ok) {
        const err = new Error(`HTTP ${res.status} for ${url}`);
        err.status = res.status;
        throw err;
    }
    return res.json();
}

export async function fetchBytes(url, init) {
    const res = await fetchWithTimeout(url, init);
    if (!res.ok) {
        const err = new Error(`HTTP ${res.status} for ${url}`);
        err.status = res.status;
        throw err;
    }
    return new Uint8Array(await res.arrayBuffer());
}

export async function fetchText(url, init) {
    const res = await fetchWithTimeout(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.text();
}
