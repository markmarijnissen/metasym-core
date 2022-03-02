import path from "path";
import {  access } from "fs/promises";
import { ensureDefaultConfig } from "../core/metasym.mjs";
import db from "./db.mjs";

// Load the metasym-config.mjs file.
// 
// This should return a configuration, and optionally, you can change the database adapter.

const exists = filename => access(filename).then(() => true, () => false)
const configFilename = path.resolve(process.cwd(), 'metasym-config.mjs');
let config = {};
if (await exists(configFilename)) {
    const module = (await import('file://' + configFilename)).default;
    if (typeof module === "function") {
        config = await module(db);
    } else {
        config = module;
    }
}
ensureDefaultConfig(config);
export default config;