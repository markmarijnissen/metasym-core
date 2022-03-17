import db from "../utils/db.mjs";
import iconomi from "./iconomi.mjs";
import _ from "lodash";
import { ensureDefaultConfig } from "./metasym.mjs";
import dayjs from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter.js";
import ta from "./ta.mjs";
dayjs.extend(isSameOrAfter)

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

export const transformAndInterpolatePriceHistory = history => {
    const result = {};
    const now = dayjs();
    let start = now, end = now.subtract(10,"year"); // find earliest and latest date
    (history.values || []).forEach(i => {
        const date = dayjs(i.x * 1000); // parse unix to dayjs
        if (date.isAfter(end)) end = date; // find the latest date
        if (date.isBefore(start)) start = date; // find the earliest date
        result[date.format("YYYY-MM-DD")] = Number(i.y); // map [ { x, y } ] to { "YYYY-MM-DD": y }
    });
    // Fill missing dates with 'null' 
    for (let i = start; i.isBefore(end); i = i.add(1, 'day')) {
        const date = i.format("YYYY-MM-DD");
        if (!result[date]) result[date] = null;
    }
    // Interpolate the 'null'
    interpolate(Object.values(result));
    return result;
}

export const interpolate = list => list.forEach((v, i, vs) => {
    if (v === null && i > 0 && i < vs.length - 1) {
        // the start value is the value before the null
        const s = vs[i - 1];
        // find the index of the next non-null value
        let j;
        for (j = i; j < vs.length && vs[j] === null; j++) { }
        // find the end value (e)
        const e = vs[j];
        // calculate the increment per day (end - start) / number-of-days
        const inc = (e - s) / (1 + j - i);
        // iterate again to the next non-null value, but this time, fill the value
        for (j = i; i < vs.length && vs[j] === null; j++) {
            vs[j] = s + (1 + j - i) * inc;
        };
    }
})

export const etlStrategies = async function (opts = {}) {
    const now = Date.now();
    const strategies = await iconomi.strategies();
    
    const etlExpiration = (await db.get("config/etlExpiration") || 45) * 60000
    const retrieval = await db.get("strategies/retrieval") || {};
    strategies.forEach(s => {
        if (!retrieval[s.ticker] || opts.force) {
            retrieval[s.ticker] = 0;
        }
    });
    await db.set("strategies/retrieval", retrieval);
    
    // let n = Object.values(retrieval).filter(t => !opts.force && t > now - etlExpiration).length;
    await Promise.all(strategies.map(async (s,n) => {
        const ticker = s.ticker;
        if (retrieval[ticker] > now - etlExpiration) {
            return;
        }
        const [price, statistics, structure] = await Promise.all([
            iconomi.strategies.price(ticker),
            iconomi.strategies.statistics(ticker),
            iconomi.strategies.structure(ticker)
        ]);
        s.price = price;
        s.statistics = statistics;
        s.structure = structure;
        s = transformStrategy(s);
        await Promise.all([
            db.set(`strategies/current/${ticker}/manager`, s.manager),
            db.set(`strategies/current/${ticker}/name`, s.name),
            db.set(`strategies/current/${ticker}/price`, s.price),
            db.set(`strategies/current/${ticker}/statistics`, s.statistics),
            db.set(`strategies/current/${ticker}/structure`, s.structure),
            db.set(`strategies/history/${ticker}/${s.structure.lastRebalanced}`, s.structure),
        ]);
        await db.set(`strategies/retrieval/${ticker}`, Date.now());
        console.log(`etlStrategies: ${n + 1}/${strategies.length} ${ticker}`);
        if (n % 10 === 0) {
            await db.commit();
        }
    }));
    console.log(`✅ ETL ${strategies.length} strategies`);
    await db.commit(); 
    return strategies.length;
}

export const etlPriceHistory = async (ticker, opts = {}) => {
    const type = opts.type || "strategies";
    if(type !== "strategies" && type !== "assets") throw new Error("type should be 'assets' or 'strategies'")
    const now = dayjs();
    const yesterday = now.subtract(1, "day").format("YYYY-MM-DD");
    const dbkey = `${type}/pricehistory/${ticker}/daily`;
    const result = await db.get(dbkey) || {};
    const dates = Object.keys(result).sort();
    if (!opts.force && dates.length > 0) {
        const lastResult = dayjs(dates[dates.length - 1]);
        if (lastResult.isSameOrAfter(yesterday, 'day')) {
            return result;
        }
    }
    if (opts.force) {
        await db.set("strategies/pricehistory", null);
        await db.set("assets/pricehistory", null);
    }
    const from = !opts.force && Object.values(result).length > 0 ? dayjs().year() : 2017;
    const history = await iconomi[type].pricehistory(ticker, from);
    Object.assign(result, transformAndInterpolatePriceHistory(history));
    await db.set(dbkey, result);
    return result;
}

export const etlPriceHistories = async (opts = {}) => {
    const strategies = await iconomi.strategies();
    // let n = 0;
    // for (let s of strategies) {
    await Promise.all(strategies.map(async (s,n) => {
        const ticker = s.ticker;
        await etlPriceHistory(ticker, opts);
        console.log(`etlPriceHistories: ${n + 1}/${strategies.length} ${ticker}`);
        // n++;
    }));
    await etlPriceHistory("etlPriceHistories: BTC", { type: "assets", force: opts.force });
    await db.commit();
    console.log(`✅ ETL prices`);
}

export const etlMAReturns = async () => {
    const data = await db.get(`strategies/pricehistory`);
    const { method, n } = await db.get(`config/maReturns`);
    const fields = ["DAY", "WEEK", "MONTH", "THREE_MONTH", "SIX_MONTH", "YEAR"];
    const days = [1, 7, 30, 90, 180, 365];
    await Promise.all(Object.keys(data).map(async (ticker,i,ds) => {
        const xy = data[ticker].daily;
        const y = Object.values(xy);
        const returns = {};
        fields.forEach((key, i) => {
            const y_avg = n[i] === 0 ? y : ta[method](y, n[i]);
            const result = (y_avg[y_avg.length - 1] / y_avg[y_avg.length - days[i] - 1]) - 1;
            returns[key] = isNaN(result) ? null : result;
        });
        await db.set(`strategies/current/${ticker}/ma`, returns);
        console.log(`${i + 1}/${ds.length} ${ticker} 1M ${returns.MONTH} 1Y ${returns.YEAR}`);
    }))
    console.log(`✅ ETL Moving Average (${method}: ${n})`);
}

export const etlConfig = async () => {
    const config = await db.get("config") || {};
    ensureDefaultConfig(config);
    await db.set("config", config);
}

export const isEtlExpired = async () => {
    const now = Date.now();
    const etlExpiration = (await db.get("config/etlExpiration") || 45) * 60000;
    const retrievedAt = await db.get("etl") || 0;
    return now > retrievedAt + etlExpiration;
}

export const setEtl = async () => {
    await db.set("etl", Date.now());
}

export const etl = async (opts = {}) => {
    if (opts.force || await isEtlExpired()) {
        await etlConfig();
        await etlStrategies(opts);
        if (!opts.skipPrice) {
            await etlPriceHistories(opts);
            await etlMAReturns(opts);
        }
        await setEtl();
    }
}

export default etl;