#!/usr/bin/env node
import _ from "lodash";
import { readFile } from "fs/promises";
import { program } from "commander";
import dotenv from "dotenv";

import etl from "./core/etl.mjs";
import rebalance from "./core/rebalance.mjs";
import db from "./utils/db.mjs";
import fileAdapter from "./utils/db-file.mjs";
db.setAdapter(fileAdapter);
import "./utils/loadConfigFromFile.mjs";

dotenv.config();

program
    .name("metasym")
    .description("A metastrategy for iconomi")
    .version(JSON.parse(
        await readFile(
            new URL('./package.json', import.meta.url)
        )
    ).version);

program
    .command("config")
    .description("show the config")
    .action(async () => {
        const config = await db.get("config");
        console.log('config:', config);
        process.exit(0);
    });

program
    .command("etl")
    .description("download strategies to database")
    .action(async () => {
        await etl();
        process.exit(0);
    });

program
    .command("rebalance <strategy>")
    .description("download strategies and rebalance METASYM strategy")
    .option("--save", "save strategy to ICONOMI")
    .action(async (strategy, { save }) => {
        await etl();
        await rebalance(({ strategy, save }));
        process.exit(0);
    })

program
    .command("verify <ticker>")
    .description("verify a strategy, so it is included in METASYM")
    .action(async ticker => {
        const strategies = await db.get("strategies/current");
        if (Object.keys(strategies).indexOf(ticker) < 0) {
            throw new Error("Not a valid strategy");
        }
        const config = await db.get("config");
        _.set(config, `verified[${ticker}]`, true);
        await db.set("config", config, true);
        console.log(config.verified);
        process.exit(0);
    })

program
    .command("list")
    .description("list all strategies")
    .option("-v --verified","list only verified strategies")
    .action(async opts => {
        const strategies = await db.get("strategies/current");
        const config = await db.get("config");
        _(strategies)
            .map((s, ticker) => {
                s.ticker = ticker
                return s;
            })
            .filter(s => !opts.verified || config.verified[s.ticker] === true)
            .forEach(s => {
                console.log(`${config.verified[s.ticker] ? '✅' : '❌'} ${s.ticker} (${config.multiplier[s.ticker] || config.defaultMultiplier}) ${s.name} @${s.manager}`);
            });
        process.exit(0);
    })

program.parse();