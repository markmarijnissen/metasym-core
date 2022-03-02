import _ from "lodash";
import fileAdapter from "./db-file.mjs";

/**
 * Simple key/value database with support for nested objects.
 * 
 * You can provide your own adapter for persistance to a proper database.
 * The adapter should be an function that returns an object with three methods:
 * 
 * async get(path): value
 * async set(path, value, commit)
 * async commit()
 * 
 * commit indicates whether the adapter should write changes to disk
 * (or database). This is used to optimize performance for bulk writes
 * when performing the ETL (Extract-Transform-Load)
 */
const db = {
    adapter: fileAdapter,  // factory function to return instance
    instance: null,        // actual database instance.
    init() {
        if (!db.instance) {
            db.instance = db.adapter();
            console.log("using database:", db.adapter.name);
        }
    },
    async setAdapter(adapter, opts) {
        db.adapter = adapter;
        db.opts = opts;
    },
    async set(path, val, commit) {
        db.init();
        await db.instance.set(path, val);
        if (commit) {
            db.commit()
        }
    },
    async get(path) {
        db.init();
        return await db.instance.get(path);
    },
    // Commit data to disk (or database). Useful for bulk writes in ETL.
    async commit() {
        if (db.instance.commit) {
            db.init();
            await db.instance.commit();
        }
    }
}

export const memoryAdapter = {
    data: {},
    async set(path, val) { _.set(memoryAdapter.data, path, val) },
    async get(path) { _.get(memoryAdapter.data, path) }
}

export default db;