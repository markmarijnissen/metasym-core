import _ from "lodash";
import db from "./db.mjs";
import { ensureDefaultConfig } from "../core/metasym.mjs";

export default async opts => {
    const strategies = await db.get("strategies/current");
    const config = await db.get("config");
    ensureDefaultConfig(config, strategies);
    _(strategies)
        .map((s, ticker) => {
            s.ticker = ticker
            return s;
        })
        .filter(s => !opts.verified || config.verified[s.ticker] === true)
        .forEach(s => {
            console.log(`${config.verified[s.ticker] ? '✅' : '❌'} ${s.ticker} (${config.multiplier[s.ticker] || config.defaultMultiplier}) ${s.name} @${s.manager}`);
        });
}