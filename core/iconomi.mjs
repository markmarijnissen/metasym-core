import axios from 'axios';
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

export function generateSignature(payload, requestType, requestPath, timestamp) {
  const index = requestPath.indexOf('?')
  if (index != -1) {
    requestPath = requestPath.substring(0, index)
  }
  const textToSign = timestamp + requestType + requestPath + payload;
  if (!timestamp) {
    throw new Error("Missing timestamp");
  }
  if (requestType !== "POST" && requestType !== "GET") {
    throw new Error("Invalid requestType");
  }
  if (!requestPath) {
    throw new Error("Missing requestPath");
  }
  if (!process.env.ICN_API_KEY) {
    throw new Error("Missing ICN_API_KEY");
  }
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
    'url': API_URL + api,
    'method': method,
    'headers': {
      'Content-Type': 'application/json'
    },
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
    request.data = JSON.parse(payload);
  }
  const res = await axios(request);
  return res.data;
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
  const pricehistory = function pricehistory(ticker, opts = {}) {
    if (!opts.from) opts.from = Math.floor(new Date(2000, 1, 1).getTime() / 1000);
    if (!opts.to) opts.to = Math.floor(Date.now() / 1000);
    return api.get(`${path}/${ticker}/pricehistory?currency=${opts.currency || 'EUR'}&granulation=${opts.granulation || 'DAILY'}&from=${opts.from}&to=${opts.to}`)
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
api.strategies = function (ticker, signed = false) { return api.get(ticker ? `/v1/strategies/${ticker}` : '/v1/strategies', signed) };
api.strategies.statistics = async function (ticker, signed = false) {
  return await api.get(`/v1/strategies/${ticker}/statistics`, signed);
};
api.strategies.price = async function (ticker, signed = false) {
  return await api.get(`/v1/strategies/${ticker}/price`, signed);
};
api.strategies.structure = async function (ticker, signed = false) {
  return await api.get(`/v1/strategies/${ticker}/structure`, signed);
};
api.strategies.full = async function(ticker, signed = false) {
  if (ticker) {
    const [price, statistics, structure] = await Promise.all([
      api.strategies.price(ticker, signed),
      api.strategies.statistics(ticker, signed),
      api.strategies.structure(ticker, signed)
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