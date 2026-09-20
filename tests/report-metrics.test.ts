import test from "node:test";
import assert from "node:assert/strict";
import { dailyBar, turnoverWindow, formatTurnover, institutionTotals } from "../src/lib/report-metrics.ts";
import { fetchLhbInstitutions } from "../src/lib/enrich.ts";
import { institutionHtml } from "../src/lib/enrich-run.ts";

const date = "2026-09-18";
const tx = (day: string, turn: unknown, volume: unknown = "100") => [day, "10", "11", "12.34", "9.87", volume, {}, turn, "250"];
const row = (buy: unknown, sell: unknown, reason = "日涨幅偏离值达到7%") => ({
  TRADE_DATE: date + " 00:00:00", SECURITY_CODE: "000002", BUY_AMT: buy, SELL_AMT: sell, EXPLANATION: reason,
});

test("腾讯与东财不复权最高/最低/成交额/涨跌幅列位正确", () => {
  const a = dailyBar(tx(date, "3"), "tx");
  assert.deepEqual([a.high, a.low, a.amount, a.turn], [12.34, 9.87, 2500000, 3]);
  const b = dailyBar([date, "10", "11", "12.34", "9.87", "100", "2500000", "10", "3"], "em");
  assert.deepEqual([b.open, b.close, b.high, b.low, b.amount, b.pct, b.turn], [10, 11, 12.34, 9.87, 2500000, 10, 3]);
  assert.equal(dailyBar([date, "", "-", null, "0"], "tx").high, null);
});

test("五日累计/平均包含报告日，排除未来数据并按日期排序", () => {
  const rows = [tx("2026-09-21", 999), tx(date, 5), tx("2026-09-17", 4), tx("2026-09-16", 3), tx("2026-09-15", 2), tx("2026-09-14", 1), tx("2026-09-11", 999)];
  const w = turnoverWindow(rows, "tx", date, 1000000);
  assert.equal(formatTurnover(w), "15.00%");
  assert.equal(formatTurnover(w, true), "3.00%");
});

test("不足五日按实际天数平均；缺失值不补零、不误称上市不足五日", () => {
  const short = turnoverWindow([tx("2026-09-17", 10), tx(date, 20)], "tx", date, 0);
  assert.equal(formatTurnover(short, true), "15.00%（仅2日记录，按实际天数平均）");
  const missing = turnoverWindow([tx("2026-09-17", 10), tx(date, null, null)], "tx", date, 0);
  assert.equal(formatTurnover(missing, true), "—（近2日缺1日换手数据）");
  assert.equal(formatTurnover({values: [0, 0, 0, 0, 0], estimated: false}, true), "0.00%");
});

test("窗口内任一天换手率推算都会标星，东财兜底按新列位读换手率", () => {
  const w = turnoverWindow([tx("2026-09-17", null, 100), tx(date, 3)], "tx", date, 1000000);
  assert.equal(formatTurnover(w, true), "2.00%*（仅2日记录，按实际天数平均）");
  const em = turnoverWindow([[date, 10, 11, 12, 9, 100, 200000, 10, 7]], "em", date, 0);
  assert.deepEqual(em.values, [7]);
});

test("机构净买入/净卖出由机构总买卖计算，不能使用全榜净额", () => {
  const buy = institutionTotals({...row(93862091, 3654860), NET_BUY_AMT: 123, BILLBOARD_NET_AMT: 999});
  assert.equal(buy.netBuy, 90207231); assert.equal(buy.netSell, 0);
  const sell = institutionTotals(row(16405712.94, 20274413));
  assert.equal(sell.netBuy, 0); assert.equal(sell.netSell, 3868700.06);
  assert.equal(institutionTotals(row(10, 10)).netSell, 0);
  for (const missing of [null, undefined, "", "-", "bad", -1]) {
    assert.equal(institutionTotals(row(missing, 10)).netBuy, null);
    assert.equal(institutionTotals(row(10, missing)).netSell, null);
  }
});

test("机构接口翻页、重复原因去重，单日榜/三日榜分开保留", async t => {
  const requests: URL[] = [];
  t.mock.method(globalThis, "fetch", async input => {
    const u = new URL(String(input)); requests.push(u);
    const rows = u.searchParams.get("pageNumber") === "1" ? [row(100, 20), row(100, 20)] : [row(500, 900, "连续三个交易日累计")];
    return new Response(JSON.stringify({success: true, result: {pages: 2, data: rows}}));
  });
  const entries = (await fetchLhbInstitutions(date)).get("000002")!;
  assert.equal(entries.length, 2);
  assert.equal(entries[0].netBuy, 80); assert.equal(entries[1].netSell, 400);
  assert.match(requests[0].searchParams.get("filter")!, /2026-09-18/);
  const html = institutionHtml(entries);
  assert.match(html, /机构净买入/); assert.match(html, /机构净卖出/);
  assert.match(html, /连续三个交易日累计/); assert.match(html, /不跨榜相加/);
});

test("机构接口错误、日期错位不会显示为零；正常无记录独立提示", async t => {
  const mock = t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({success: false, message: "接口错误"})));
  await assert.rejects(fetchLhbInstitutions(date), /返回异常/);
  mock.mock.mockImplementation(async () => new Response(JSON.stringify({success: true, result: {data: [{...row(10, 5), TRADE_DATE: "2026-09-17"}]}})));
  await assert.rejects(fetchLhbInstitutions(date), /日期不匹配/);
  mock.mock.mockImplementation(async () => new Response(JSON.stringify({success: false, message: "返回数据为空"})));
  assert.equal((await fetchLhbInstitutions(date)).size, 0);
  assert.match(institutionHtml([], "接口失败"), /—（接口失败）/);
  assert.match(institutionHtml([]), /未披露机构买卖记录/);
  assert.doesNotMatch(institutionHtml([]), /0\.00/);
});
