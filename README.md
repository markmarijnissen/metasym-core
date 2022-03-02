# METASYM

METASYM, short for META SYMBIOSIS, is a meta strategy for ICONOMI.

This is an alternative implemantation of [Stephen Reid](https://stephenreid.net/metastrategy), in which you can set your parameters. You can also fork this repository and write your own smart meta strategy.

## Disclaimer: USE AT YOUR OWN RISK

This code has **no unit tests** and has **not been audited**. As such, it may throw errors and exit. It may have errors in the calculation and provide inaccurate results, which might not be obvious at first glance. For use in production, there might be security issues (e.g. from third party libraries included). Furthermore, bugs in the ICONOMI api might skew the results or lead to unexpected outcomes. Finally, there might be issues, bugs and considerations that I have not considered. I advice you to extensively test and carefully verify both algorithm and results. This tool is not investment advice and offered for educational purposes only. Therefore, none of the authors, contributors or anyone else connected with this repository, in any way whatsoever, can be responsible for your use of the code contained in this repository. 

## Configuration (Hyperparameters)

When using this tool, a `metasym-config.mjs` file will be created, containinig all parameters you can change:

```js
export default {
    "weights": [ // calculate a weighted average of returns
        0,  // DAY
        0,  // WEEK
        4,  // 1 MONTH
        3,  // 3 MONTHS
        2,  // 6 MONTHS
        1   // 1 YEAR
    ],
    "filters": {
        "positive": false, // only include strategies with a positive score
        "mature": false    // only include strategies with a 3 MONTH return (e.g. existing longer than 3 months)
    },
    "multiplier": {
        "DECENTCOOP": 2.0       // You can boost, reduce or ignore strategies by setting a multiplier
    },
    "verified": {
        "DECENTCOOP": true     // You must manually verify a strategy before it is included
    },
    "minStrategies": 10,         // the mininum number of strategies required
    "assetMultiplier": {
        "BNB": 0                 // individual assets (e.g. coins) can also be boosted, reduced or ignored.
    }
}
```

## Installation

```bash
npm install https://github.com/markmarijnissen/metasym-core -g
```

## Usage

Run `metasym` in your terminal.

```
A metastrategy for iconomi

Options:
  -V, --version                   output the version number
  -h, --help                      display help for command

Commands:
  config                          show the config
  etl                             download strategies to database
  rebalance [options] <strategy>  download strategies and rebalance METASYM strategy
  verify <ticker>                 verify a strategy, so it is included in METASYM
  list [options]                  list all strategies
  help [command]                  display help for comman
```

## Using a different database

This tool comes with a simple file-based database. You can provide your own backend by using the `metasym-config.mjs` file to change the database adapter. See ./src/db.mjs for more information.