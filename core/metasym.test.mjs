import { ensureDefaultConfig, scoreStrategies, scoreAssets, metasymFromScoredAssets, metasymFromStrategies } from "./metasym.mjs";

describe("config defaults", () => {
    const config = {};
    ensureDefaultConfig(config);

    test("An empty object defaults to a full config", () => {
        expect(config).toMatchSnapshot();
    });

    // test("config containts filters for verified, positieve, mature, minRebalanceCount and minAUM", () => {
    //     const config = {};
    //     ensureDefaultConfig(config);
    //     expect(config.filters).toHaveProperty("verified");
    //     expect(config.filters).toHaveProperty("positive");
    //     expect(config.filters).toHaveProperty("mature");
    //     expect(config.filters).toHaveProperty("minRebalanceCount");
    //     expect(config.filters).toHaveProperty("minAUM");
    // });

    test("default ETL expiration is 45 minutes", () => {
        expect(config.etlExpiration).toBe(45);
    });

    test("default minimum number of strategies to include is 10", () => {
        expect(config.minStrategies).toBe(10);
    });

    test("default dynamic rebalancing is at most every hour, at least every week, and happens for every change (> 0% diff)", () => {
        expect(config.rebalance.min).toBe(60);
        expect(config.rebalance.max).toBe(7 * 24 * 60);
        expect(config.rebalance.threshold).toBe(0.0);
    });

    test("default diversification is disabled, because maxWeight is 100%", () => {
        expect(config.diversify.maxWeight).toBe(1.0);
    });

    test("default diversification will not happen for USDT, DAI, TUSD and USDC", () => {
        expect(config.diversify.excluded).toEqual(["USDT", "DAI", "TUSD", "USDC"]);
    });

    test("default weights are 0 (day), 0 (week), 4 (1M), 3 (3M), 2 (6M) and 1 (1Y)", () => {
        expect(config.weights).toEqual([0, 0, 4, 3, 2, 1]);
    });
});

describe("config validation", () => {
    test("diversify.maxWeight must be between 0 and 1", () => {
        expect(() => ensureDefaultConfig({ diversify: { maxWeight: 2 } })).toThrow();
        expect(() => ensureDefaultConfig({ diversify: { maxWeight: 0.5 } })).not.toThrow();
        expect(() => ensureDefaultConfig({ diversify: { maxWeight: -1 } })).toThrow();
    });

    test("Size of the METASYM strategy must be between 3 and 1000", () => {
        expect(() => ensureDefaultConfig({ metasymSize: 10000 })).toThrow();
        expect(() => ensureDefaultConfig({ metasymSize: 10 })).not.toThrow();
        expect(() => ensureDefaultConfig({ metasymSize: 0 })).toThrow();
    });

    test("Minimum number of strategies to include must be between 1 and 1000", () => {
        expect(() => ensureDefaultConfig({ minStrategies: 10000 })).toThrow();
        expect(() => ensureDefaultConfig({ minStrategies: 10 })).not.toThrow();
        expect(() => ensureDefaultConfig({ minStrategies: 0 })).toThrow();
    });

    test("the minAUM filter should be 0 or more", () => {
        expect(() => ensureDefaultConfig({ filters: { minAUM: -100 } })).toThrow();
    });

    test("Minimum number of strategies to include must be between 0 and 1000", () => {
        expect(() => ensureDefaultConfig({ filters: { minRebalanceCount: 10000 } })).toThrow();
        expect(() => ensureDefaultConfig({ filters: { minRebalanceCount: 10 } })).not.toThrow();
        expect(() => ensureDefaultConfig({ filters: { minRebalanceCount: -1 } })).toThrow();
    });

    test("Weights must be more than 0, and 6 in total", () => {
        expect(ensureDefaultConfig({ weights: [1] }).weights).toEqual([1, 0, 4, 3, 2, 1]);
        expect(() => ensureDefaultConfig({ weights: [0, 0, 0, 1, 0, 0, 0, 0] })).toThrow();
        expect(() => ensureDefaultConfig({ weights: [0, 0, 0, 0, 0, 0] })).toThrow();
        expect(() => ensureDefaultConfig({ weights: [0, 0, 0, -1, 0, 0] })).toThrow();
    });

    test("Verified filter should be true or false", () => {
        expect(() => ensureDefaultConfig({ filters: { verified: "true" } })).toThrow();
    });

    test("Positive filter should be true or false", () => {
        expect(() => ensureDefaultConfig({ filters: { positive: "true" } })).toThrow();
    });

    test("Mature filter should be true or false", () => {
        expect(() => ensureDefaultConfig({ filters: { mature: "true" } })).toThrow();
    });
});

describe("score strategies", () => {
    const fakeStrategy = (ticker) => {
        return {
            "manager": `${ticker} Manager`,
            "name": `${ticker} Strategy`,
            "price": {
                "aum": 143266.80495417636,
                "change12m": 0.2207,
                "change1m": -0.1956,
                "change24h": 0.0129,
                "change3m": -0.3401,
                "change6m": -0.2593,
                "change7d": -0.0769,
                "changeAll": 8.4665,
                "currency": "USD",
                "price": 9.49733363,
                "ticker": `${ticker}`
            },
            "statistics": {
                "currency": "USD",
                "maxDrawdown": {
                    "ALL_TIME": -0.6104,
                    "MONTH": -0.2469,
                    "SIX_MONTH": -0.4712,
                    "THREE_MONTH": -0.4162,
                    "WEEK": -0.1073,
                    "YEAR": -0.5825
                },
                "returns": {
                    "ALL_TIME": 18,
                    "DAY": 0,
                    "MONTH": 1,
                    "SIX_MONTH": 6,
                    "THREE_MONTH": 3,
                    "WEEK": 0.25,
                    "YEAR": 12
                },
                "ticker": `${ticker}`,
                "volatility": {
                    "ALL_TIME": 0.0489,
                    "MONTH": 0.0409,
                    "SIX_MONTH": 0.0392,
                    "THREE_MONTH": 0.0389,
                    "WEEK": 0.0609,
                    "YEAR": 0.0488
                }
            },
            "structure": {
                "lastRebalanced": 1646425528,
                "monthlyRebalancedCount": 7,
                "values": [{
                    "name": "Tether",
                    "profit": 9.276928885790846E-5,
                    "rebalancedWeight": 0.5,
                    "targetWeight": 0.4879,
                    "ticker": "USDT"
                }, {
                    "name": "PAX Gold",
                    "profit": 0.04686694162197974,
                    "rebalancedWeight": 0.5,
                    "targetWeight": 0.5121,
                    "ticker": "PAXG"
                }]
            }
        }

    }

    test("must include a minimum number of strategies", () => {
        expect(() => scoreStrategies(null, config)).toThrow();
        expect(() => scoreStrategies({ A: fakeStrategy("A") }, ensureDefaultConfig({ minStrategies: 2, verified: { A: true } }))).toThrow();
        expect(() => scoreStrategies(
            { A: fakeStrategy("A"), B: fakeStrategy("B") },
            ensureDefaultConfig({ minStrategies: 1, verified: { A: true, B: true } }))
        ).not.toThrow();
    });

    test("must include a config", () => {
        expect(() => scoreStrategies({ A: fakeStrategy("A"), B: fakeStrategy("B") }, null)).toThrow();
    });

    test.todo("calculate a raw score based on returns and weights");
    test.todo("use the multiplier to calculate final score based on raw score");
    test.todo("calculate a normalized score [0..1]");
    test.todo("calculate a fractional score, where sum of strategy-scores and sum of all asset-scores is always 1");
    test.todo("distribute the score over the assets, based on their weight")

    test.todo("only score verified strategies when verified filter is true");
    test.todo("score all strategies when verified filter is false");

    test.todo("only score positive strategies when positive filter is true");
    test.todo("score all strategies when positive filter is false");

    test.todo("score only strategies that have a rebalance count of equal or more then filters.minRebalanceCount");
    test.todo("score only strategies that have a AUM of equal or more then filters.minAUM");

    test.todo("only score strategies with 3M returns when mature filter is true");
    test.todo("score all strategies when mature filter is false");
});