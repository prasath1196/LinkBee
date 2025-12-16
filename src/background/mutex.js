
export class Mutex {
    constructor() { this._queue = []; this._locked = false; }
    lock() { return new Promise(r => { this._locked ? this._queue.push(r) : (this._locked = true, r()); }); }
    unlock() { this._queue.length > 0 ? this._queue.shift()() : this._locked = false; }
}

export const storageMutex = new Mutex();
