## TODO

- [ ] Add unit tests
- [ ] Verify data and config, throw errors when data is invalid to prevent miscalculations
- [ ] ETL copiers, and add a filter for that

## 0.2.0 - next version (in development)

- Added `minAUM` filter (minimum assets under management to included)
- Added `minRebalanceCount` filter (minimum number of monthly rebalanced to be included)
- Added `diversify` configuration with `maxWeigh` to prevent an unbalanced portfolio. 
  - The algorithm will rebalance weights in such way that no single asset exceeds the `maxWeight`, even when the cumulative score indicates otherwise (e.g. when everybody buys $LUNA, you can cap this at a `maxWeight` of say 40%)
- Added `rebalance` configuration for dynamic rebalancing: It will only trigger a rebalance when the differece between calculated strategy and actual strategy exceeds a certain threshold. In addition, there are minimum and maximum durations for safety. The minimum duration ensures no excessive rebalancing, and the maximum duration ensures rebalancing isn't forgotten.
- Fixed a rounding bug in rebalancing (throws a 400 Bad Request from Iconomi).

## 0.1.x

- Implemented Stephen Reid's metastrategy algorithm, with parameters:
  - weights (for strategy returns)
  - multiplier (to boost/reduce/ignore strategies)
  - verified (manually verify strategies before inclusion)
- In addition, there is also an `assetMultiplier` that allows you to boost/reduce/ignore certain assets (e.g. coins, tokens)