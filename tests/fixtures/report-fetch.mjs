// 完整报表回归用固定数据；未匹配的请求立即失败，绝不访问外部网络。
const date = "2026-09-18";
const days = ["2026-09-11", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", date];
const delay = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...args) => delay(fn, 0, ...args);
const stock = i => ({f12: String(600000 + i), f14: `测试股票${i}`, f38: 200000000, f39: 100000000});
const result = data => ({success: true, result: {pages: 1, data}});
globalThis.fetch = async input => {
  const u = new URL(String(input)), q = u.searchParams;
  let data;
  if (u.pathname.endsWith("newfqkline/get")) {
    const sym = q.get("param").split(",")[0];
    const rows = days.map((d, i) => [d, "10", i === 5 ? "11" : "10", "12.34", "9.87", "100", {}, String(i), "250"]);
    data = process.env.REPORT_TEST_SOURCE === "em" ? {} : {data: {[sym]: {day: rows, qfqday: rows}}};
  } else if (u.pathname.endsWith("stock/kline/get")) {
    if (q.get("fields2") !== "f51,f52,f53,f54,f55,f56,f57,f59,f61") throw new Error("Unexpected Eastmoney column mapping");
    data = {data: {klines: days.map((d, i) => [d, 10, 11, 12.34, 9.87, 100, 2500000, 10, i].join(","))}};
  } else if (u.pathname.endsWith("clist/get")) {
    data = q.get("fs").replace(/ /g, "+") === "m:90+t:3" ? {data: {diff: [], total: 0}} : {data: {diff: Array.from({length: 100}, (_, i) => stock(i)), total: 100}};
  } else if (q.get("reportName") === "RPT_F10_EH_FREEHOLDERS") {
    data = result([{END_DATE: "2026-06-30", HOLDER_NAME: "测试股东", HOLDER_RANK: 1, FREE_HOLDNUM_RATIO: 10}]);
  } else if (q.get("reportName") === "RPT_DAILYBILLBOARD_DETAILSNEW") {
    data = result([{SECURITY_CODE: "600000", SECURITY_NAME_ABBR: "测试股票0", EXPLANATION: "单日测试榜", BILLBOARD_NET_AMT: 999999, BILLBOARD_DEAL_AMT: 2000000}]);
  } else if (q.get("reportName") === "RPT_ORGANIZATION_TRADE_DETAILSNEW") {
    data = result([
      {SECURITY_CODE: "600000", TRADE_DATE: date, EXPLANATION: "单日测试榜", BUY_AMT: 12000000, SELL_AMT: 8000000},
      {SECURITY_CODE: "600000", TRADE_DATE: date, EXPLANATION: "连续三个交易日累计测试榜", BUY_AMT: 4000000, SELL_AMT: 9000000},
    ]);
  } else if (/RPT_BILLBOARD_DAILYDETAILS(BUY|SELL)/.test(q.get("reportName"))) {
    data = result([{OPERATEDEPT_NAME: "机构专用", BUY: 12000000, SELL: 8000000, NET: 4000000}]);
  } else {
    throw new Error(`Unexpected fixture request: ${u.pathname} ${q.get("reportName")}`);
  }
  return new Response(JSON.stringify(data));
};
