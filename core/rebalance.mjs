import _ from "lodash";
import iconomi from "./iconomi.mjs";
import { metasymFromStrategies } from "./metasym.mjs";
import db from "../utils/db.mjs";

const structureToMap = structure => {
    const result = {};
    structure.values.forEach(v => {
        result[v.assetTicker || v.ticker] = v.targetWeight || v.rebalancedWeight;
    });
    return result;
}

const calculateDiff = (a, b) => {
    const amap = structureToMap(a);
    const bmap = structureToMap(b);
    const diffmap = {};
    _.map(amap, (val, ticker) => {
        diffmap[ticker] = Math.abs(val - (bmap[ticker] || 0));
    });
    _.map(bmap, (val, ticker) => {
        diffmap[ticker] = Math.abs((amap[ticker] || 0) - val);
    });
    return _.sum(Object.values(diffmap));
}

// Uses the metasym.mjs module to calculate the METASYM strategy, and rebalance it on ICONOMI.
const rebalance = async ({ save, strategy, force }) => {
    const ticker = strategy || process.env.STRATEGY;
    if (!ticker) {
        console.error("STRATEGY not set.");
        throw new Error("STRATEGY not set.");
    }
    console.log(`Rebalance using METASYM strategy. Target=${ticker}`);
    const [strategies, config, previousTimestamp] = await Promise.all([
        db.get("strategies/current"),
        db.get("config"),
        db.get("rebalance/timestamp")
    ]);

    // Part 1 - Calculate new structure
    const newStructure = {
        ticker,
        values: metasymFromStrategies(strategies, config).map(i => ({
            assetTicker: i.ticker,
            rebalancedWeight: Number(i.weight)
        })),
        speedType: "SLOW"
    }

    // Part 2 - Diff against current structure, to check if new structure exceeds the rebalance threshold
    const currentStructure = await iconomi.get(`/v1/strategies/${ticker}/structure`, true);
    const diff = calculateDiff(currentStructure, newStructure);

    // Part 3 - Calculate whether rebalance is too quick (< min) or too long (> max)
    const timestamp = Date.now();
    const tooQuick = timestamp < previousTimestamp + (config.rebalance.min * 60000);
    const tooLong = timestamp > previousTimestamp + (config.rebalance.max * 60000);

    // Part 4 - Perform the actual rebalance call -- if needed
    let didRebalance = false;
    const shouldRebalance = force || (diff > config.rebalance.threshold && !tooQuick) || tooLong;
    // log rebalance for debugging and auditing the script
    const logData = {
        shouldRebalance,
        save: save === true,
        force: force === true,
        diff,
        ok: false,
        t: Math.round((timestamp - (previousTimestamp || 0))/60000),
        config: config.rebalance,
        current: structureToMap(currentStructure),
        new: structureToMap(newStructure),
    };
    await db.set('rebalance/logs/' + timestamp, logData);
    _.forEach(logData.new, (w, t) => {
        const diff = w - (logData.current[t] || 0)
        console.log(`${t}: ${(100 * w).toFixed(2)} (${(100 * diff).toFixed(2)})`);
    });
    console.log("---");
    console.log('sum', _.sumBy(newStructure.values, "rebalancedWeight"));
    console.log("diff", (100 * diff).toFixed(2));
    ["shouldRebalance", "save", "force", "t", "config"].forEach(key => console.log(key, logData[key]));

    if (save === true && shouldRebalance) {
        await iconomi.post(`/v1/strategies/${ticker}/structure`, newStructure, true);
        didRebalance = true;
        console.log("rebalanced strategy");
        await db.set(`rebalance/logs/${timestamp}/ok`, true);
        await db.set(`rebalance/timestamp`, timestamp); // log timestamp for min/max calculations
    } else if(shouldRebalance) {
        console.log('dry-run, use --save to rebalance strategy');
    } else {
        console.log('rebalancing not needed, use --force to force rebalancing');
    }
    // printStructure(newStructure)
    return didRebalance;
}

export default rebalance;