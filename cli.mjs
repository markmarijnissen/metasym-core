#!/usr/bin/env node
import _ from "lodash";
import { readFile } from "fs/promises";
import { program } from "commander";
import dotenv from "dotenv";

import etl, { etlMAReturns, etlPriceHistories } from "./core/etl.mjs";
import rebalance from "./core/rebalance.mjs";
import list from "./utils/list.mjs";
import db from "./utils/db.mjs";
import fileAdapter from "./utils/db-file.mjs";
db.setAdapter(fileAdapter);
import "./utils/loadConfigFromFile.mjs";
import { ensureDefaultConfig } from "./core/metasym.mjs";

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
        ensureDefaultConfig(config, await db.get("strategies/current"));
        console.log('config:', config);
        await db.commit();
        process.exit(0);
    });

program
    .command("etl")
    .description("download strategies to database")
    .option("--force", "force")
    .option("--skip-prices", "skip downloading price history and calculating Moving Average")
    .action(async (opts) => {
        await etl(opts);
        process.exit(0);
    });

program
    .command("etl-prices")
    .description("download pricing to database")
    .option("--force", "force")
    .action(async (opts) => {
        await etlPriceHistories(opts);
        await etlMAReturns(opts);
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
        await list({ verified: true });
        process.exit(0);
    })

program
    .command("list")
    .description("list all strategies")
    .option("-v --verified","list only verified strategies")
    .action(async opts => {
        await list(opts);
        process.exit(0);
    })

program.parse();