import path from "path";
import {  access } from "fs/promises";
import { ensureDefaultConfig } from "./metasym.mjs";

// Load the metasym-config.mjs file.
// 
// This should return a configuration, and optionally, you can change the database adapter.

const exists = filename => access(filename).then(() => true, () => false)
const configFilename = path.resolve(process.cwd(), 'metasym-config.mjs');
let config = {};
if (await exists(configFilename)) {
    config = (await import('file://' + configFilename)).default;
}
ensureDefaultConfig(config);
export default config;