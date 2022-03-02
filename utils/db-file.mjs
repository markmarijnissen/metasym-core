import _ from "lodash";
import path from "path";
import { writeFile, readFile, access } from "fs/promises";
import JSONB from "json-buffer"; // Regular JSON had issues
import config from "./loadConfigFromFile.mjs";

const exists = filename => access(filename).then(() => true, () => false)

const load = async data => {
    const dataFilename = path.resolve(process.cwd(), 'metasym-data.json');
    if (await exists(dataFilename)) {
        const txt = await readFile(dataFilename, "utf8");
        if (txt) {
            Object.assign(data, JSONB.parse(txt));
        }
    }
    data.config = config;
    return data;
}


/**
 * The fileAdapter is a simple file adapter  
 */
export default function fileAdapter() {
    const data = {};
    let loaded = load(data);

    return {
        async set(path, val) {
            _.set(data, path.replace(/\//g, '.'), val);
            return true;
        },
        async get(path) {
            await loaded;
            return _.get(data, path.replace(/\//g, '.'));
        },
        async commit() {
            const dataWithoutConfig = Object.assign({}, data);
            delete dataWithoutConfig.config;
            await writeFile(path.resolve(process.cwd(),"metasym-data.json"), JSONB.stringify(dataWithoutConfig));
            await writeFile(path.resolve(process.cwd(),"metasym-config.mjs"), `export default ${JSON.stringify(data.config, null, 4)}`);
        }
    }
}