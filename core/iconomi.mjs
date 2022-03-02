import got from 'got';
import crypto from 'crypto';
import queue from 'async/queue.js';
import dayjs from "dayjs";
import { sleep } from "../utils/utils.mjs";

/**
 * This file handles all API calls to ICONOMI.
 * 
 * To avoid rate-limits, it is implemented as a queue with a little delay (50ms) for every request.
 */

const API_URL = 'https://api.iconomi.com'

function generateSignature(payload, requestType, requestPath, timestamp) {
  const index = requestPath.indexOf('?')
  if (index != -1) {
    requestPath = requestPath.substring(0, index)
  }
  const textToSign = timestamp + requestType + requestPath + payload;
  if (!process.env.ICN_SECRET) {
    throw new Error("Missing ICN_SECRET");
  }
  return crypto.createHmac('sha512', process.env.ICN_SECRET).update(textToSign).digest("base64");
}

async function apiWorker({ method, api, payload = '', signed = false }) {
  await sleep(50);
  // console.log(`${method} ${api}`);
  if (method === 'POST') payload = JSON.stringify(payload);
  const request = {
    'method': method,
    'headers': {
      'Content-Type': 'application/json'
    },
    retry: {
      limit: 3
    }
  }
  if (signed) {
    const timestamp = new Date().getTime();
    const hashSign = generateSignature(payload, method, api, timestamp)
    Object.assign(request.headers, {
      'ICN-API-KEY': process.env.ICN_API_KEY,
      'ICN-SIGN': hashSign,
      'ICN-TIMESTAMP': timestamp,
    });
  }
  if (method === 'POST') {
    request.body = payload;
  }
  const res = await got(API_URL + api, request);
  // console.log(api, res.statusCode, res.statusMessage, res.body);
  return JSON.parse(res.body);
}

const q = queue(apiWorker, 5);
function api(method, api, payload = '', signed = false) {
  return new Promise(async (resolve, reject) => {
    q.push({ method, api, payload, signed }, (err, res) => {
      if (err) { reject(err) }
      else { resolve(res) }
    });
  });
};
api.get = (url, signed = false) => api('GET', url, '', signed);
api.post = (url, payload, signed = true) => api('POST', url, payload, signed);

const createPriceHistory = path => {
  const pricehistory = function (ticker, {
    currency = "EUR",
    granulation = "DAILY",
    from,
    to
  }) {
    if (!from) from = Math.floor(new Date(2000, 1, 1).getTime() / 1000);
    if (!to) to = Math.floor(Date.now() / 1000);
    return api.get(`${path}/${ticker}/pricehistory?currency=${currency}&granulation=${granulation}&from=${from}&to=${to}`)
  };
  pricehistory.day = function (ticker, date) {
    return pricehistory(ticker, {
      currency: "EUR",
      granulation: "FIVE_MINUTE",
      from: dayjs(date).unix(),
      to: dayjs(date).add(1, "day").unix()
    })
  }
  pricehistory.from = async function (ticker, from) {
    const now = dayjs();
    const queue = [];
    for (let i = dayjs(from); i.isBefore(now); i = i.add(1, "day")){
      queue.push(pricehistory.day(ticker, i));
    }
    const results = await Promise.all(queue);
    const result = results[0];
    result.to = results[results.length - 1].to;
    result.values = results.map(r => r.values).flat();
    return result;
  }
  return pricehistory;
}

// Asset
api.assets = ticker => api.get(ticker ? '/v1/assets' : `/v1/assets/${ticker}`);
api.assets.statistics = ticker => api.get(`/v1/assets/${ticker}/statistics`);
api.assets.pricehistory = createPriceHistory('/v1/assets');

// Strategies
api.strategies = function (ticker) { return api.get(ticker ? `/v1/strategies/${ticker}` : '/v1/strategies') };
api.strategies.statistics = async function (ticker) {
  return await api.get(`/v1/strategies/${ticker}/statistics`);
};
api.strategies.price = async function (ticker) {
  return await api.get(`/v1/strategies/${ticker}/price`);
};
api.strategies.structure = async function (ticker) {
  return await api.get(`/v1/strategies/${ticker}/structure`);
};
api.strategies.full = async function(ticker) {
  if (ticker) {
    const [price, statistics, structure] = await Promise.all([
      api.strategies.price(ticker),
      api.strategies.statistics(ticker),
      api.strategies.structure(ticker)
    ]);
    return { price, statistics, structure };

  }
  const strategies = await api.get(`/v1/strategies`);
  await Promise.all(strategies.map(async s => {
    Object.assign(s, await api.strategies.full(s.ticker));
    return s;
  }));
  const result = {};
  strategies.forEach(s => result[s.ticker] = s);
  return result;
};
api.strategies.pricehistory = createPriceHistory('/v1/strategies');

export default api;