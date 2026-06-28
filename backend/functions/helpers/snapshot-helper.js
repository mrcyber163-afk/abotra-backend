// Helper to convert REST API data to Admin SDK-like snapshot
class Snapshot {
    constructor(data) {
        this._data = data;
        this.key = null;
        this.ref = null;
    }
    
    exists() {
        return this._data !== null && this._data !== undefined;
    }
    
    val() {
        return this._data;
    }
    
    forEach(callback) {
        if (this._data && typeof this._data === 'object') {
            for (const key of Object.keys(this._data)) {
                const childSnapshot = new Snapshot(this._data[key]);
                childSnapshot.key = key;
                callback(childSnapshot);
            }
        }
    }
    
    numChildren() {
        if (this._data && typeof this._data === 'object') {
            return Object.keys(this._data).length;
        }
        return 0;
    }
    
    child() {
        // Simple child support
        return this;
    }
    
    toJSON() {
        return this._data;
    }
}

module.exports = { Snapshot };
