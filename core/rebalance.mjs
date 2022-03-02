import _ from "lodash";
import iconomi from "./iconomi.mjs";
import { metasymFromStrategies } from "./metasym.mjs";
import db from "../utils/db.mjs";
import { printStructure } from "../utils/utils.mjs";

// Uses the metasym.mjs module to calculate the METASYM strategy, and rebalance it on ICONOMI.
const rebalance = async ({ save, strategy }) => {
    const ticker = strategy || process.env.STRATEGY;
    if (!ticker) {
        console.error("STRATEGY not set.");
        throw new Error("STRATEGY not set.");
    }
    console.log(`Rebalance using METASYM strategy. Target=${ticker}`);
    const [strategies, config] = await Promise.all([
        db.get("strategies/current"),
        db.get("config")
    ]);
    const newStructure = {
        ticker,
        values: metasymFromStrategies(strategies, config).map(i => ({
            assetTicker: i.ticker,
            rebalancedWeight: Number(i.weight)
        })),
        speedType: "SLOW"
    }

    console.log('sum:', _.sumBy(newStructure.values, "rebalancedWeight"));
    if (save === true) {
        await iconomi.post(`/v1/strategies/${ticker}/structure`, newStructure, true);
        console.log("rebalanced strategy");
    } else {
        console.log('dry-run, use --save to rebalance strategy');
    }
    printStructure(newStructure)
    return true;
}

export default rebalance;