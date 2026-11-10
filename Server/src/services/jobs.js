// Lightweight periodic jobs (single instance). Each run is guarded so overlapping
// ticks never stack up.
const orderService = require("./orderService");
const metaService = require("./metaService");

const EVERY_TEN_MINUTES = 10 * 60 * 1000;
let timer = null;
let running = false;

const tick = async () => {
  if (running) return;
  running = true;
  try {
    const { expired } = await orderService.expireStalePendingOrders();
    if (expired) console.log(`[jobs] cancelled ${expired} stale unpaid order(s) and returned their stock.`);
    await metaService.pruneEventLog();
  } catch (error) {
    console.error("[jobs] tick failed:", error.message);
  } finally {
    running = false;
  }
};

const start = () => {
  if (timer) return;
  timer = setInterval(tick, EVERY_TEN_MINUTES);
  timer.unref();
  setTimeout(tick, 30 * 1000).unref();
};

const stop = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

module.exports = { start, stop, tick };
