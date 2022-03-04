import db from "../utils/db.mjs";
import iconomi from "./iconomi.mjs";
import _ from "lodash";
import ora from "ora";
import { ensureDefaultConfig } from "./metasym.mjs";

/**
 * This file handles ETL (Extract-Transform-Load) of the data from ICONOMI to a database.
 * 
 * Using a database prevents abusing the ICONOMI api and increases speed for subsequent calculations.
 */

const transformStrategy = s => { 
    const result = Object.assign({}, s);
    delete result.ticker;
    delete result.managementType;
    result.structure = transformStructure(result.structure);
    return result;
}

const transformStructure = s => {
    const result = Object.assign({}, s);
    delete result.numberOfAssets;
    delete result.ticker;
    result.values = result.values.map(v => ({
        ticker: v.assetTicker || null,
        name: v.assetName,
        profit: v.estimatedProfit,
        rebalancedWeight: v.rebalancedWeight,
        targetWeight: v.targetWeight
    }));
    return result;
}


const EXPIRATION_TIME = 2/*h*/ * 60/*min*/ * 60/*sec*/ * 1000/*ms*/;

export const etlStrategies = async function (opts) {
    const now = Date.now();
    const spinner = ora("retrieving a list of strategies...").start();
    const strategies = await iconomi.strategies();
    
    const retrieval = await db.get("strategies/retrieval") || {};
    strategies.forEach(s => {
        if (!retrieval[s.ticker]) {
            retrieval[s.ticker] = 0;
        }
    });
    await db.set("strategies/retrieval", retrieval);
    
    let n = Object.values(retrieval).filter(t => t > now - EXPIRATION_TIME).length;
    for (let s of strategies) {
        const ticker = s.ticker;
        if (retrieval[ticker] > now - EXPIRATION_TIME) {
            continue;
        }
        spinner.text = `${n + 1}/${strategies.length} ${ticker}`;
        Object.assign(s, await iconomi.strategies.full(ticker));
        s = transformStrategy(s);
        await Promise.all([
            db.set(`strategies/history/${ticker}/${s.structure.lastRebalanced}`, s.structure),
            db.set(`strategies/current/${ticker}`, s)
        ]);
        await db.set(`strategies/retrieval/${ticker}`, Date.now());
        n++;
        if (n % 10 === 0) {
            await db.commit();
        }
    }
    spinner.succeed(`ETL ${n} strategies`);
    await db.commit(); 
    spinner.stopAndPersist();
    return n;
}

export const etlConfig = async () => {
    const config = await db.get("config") || {};
    ensureDefaultConfig(config);
    await db.set("config", config);
}

export const isEtlExpired = async () => {
    const now = Date.now();
    const retrievedAt = await db.get("etl") || 0;
    return now > retrievedAt + EXPIRATION_TIME;
}

export const setEtl = async () => {
    await db.set("etl", Date.now());
}

export const etl = async () => {
    if (await isEtlExpired()) {
        await etlStrategies();
        await etlConfig();
        await setEtl();
    }
}

export default etl;