#!/usr/bin/env node
import _ from "lodash";
import dotenv from "dotenv";

import etl from "./core/etl.mjs";
import rebalance from "./core/rebalance.mjs";
import iconomi from "./core/iconomi.mjs";

import db from "./utils/db.mjs";
import fileAdapter from "./utils/db-file.mjs";

db.setAdapter(fileAdapter);
dotenv.config();

export default { etl, rebalance, iconomi };

