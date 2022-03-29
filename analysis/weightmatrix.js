import db from "../utils/db.mjs";
import _ from "lodash";

export const weightmatrix = async opts => {
    const strategies = await db.get("strategies/current");
    const structures = Object.values(strategies).map(s => s.structure.values);
    const assetIndex = _(structures).map(values => values.map(v => v.ticker)).flatten().uniq().sort().value();
    return {
        strategies: Object.keys(strategies),
        matrix: structures.map(values => {
            const row = _.fill(new Array(assetIndex.length), 0);
            values.forEach(v => {
                row[assetIndex.indexOf(v.ticker)] = v.rebalancedWeight;
            });
            return row;
        })
     };
}