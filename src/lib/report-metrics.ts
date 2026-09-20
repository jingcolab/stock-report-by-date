/** 指定日期报告的价格、换手率与机构资金计算；金额统一为元。 */
export const EM_KLINE_FIELDS = "f51,f52,f53,f54,f55,f56,f57,f59,f61";
export type KlineSource = "tx" | "em";

export function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function dailyBar(row: unknown[], source: KlineSource) {
  const positive = (v: unknown) => { const n = finiteNumber(v); return n !== null && n > 0 ? n : null; };
  const amount = finiteNumber(row[source === "tx" ? 8 : 6]);
  return {
    open: positive(row[1]), close: positive(row[2]),
    high: positive(row[3]), low: positive(row[4]),
    volume: finiteNumber(row[5]),
    amount: amount === null ? null : amount * (source === "tx" ? 10000 : 1),
    turn: finiteNumber(row[source === "tx" ? 7 : 8]),
    pct: source === "em" ? finiteNumber(row[7]) : null,
  };
}

export interface TurnoverWindow { values: (number | null)[]; estimated: boolean }

export function turnoverWindow(rows: unknown[][], source: KlineSource, date: string, floatShares: number): TurnoverWindow {
  let estimated = false;
  const values = rows.filter(r => String(r[0]) <= date)
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .slice(-5).map(row => {
      const bar = dailyBar(row, source);
      if (bar.turn !== null && bar.turn >= 0) return bar.turn;
      if (source === "tx" && bar.volume !== null && bar.volume >= 0 && Number.isFinite(floatShares) && floatShares > 0) {
        estimated = true;
        return bar.volume * 100 / floatShares * 100;
      }
      return null;
    });
  return { values, estimated };
}

export function formatTurnover(window: TurnoverWindow, average = false): string {
  const { values, estimated } = window;
  if (!values.length) return "—（无换手数据）";
  const missing = values.filter(v => v === null).length;
  if (missing) return `—（近${values.length}日缺${missing}日换手数据）`;
  const sum = values.reduce<number>((a, b) => a + (b ?? 0), 0);
  const note = values.length < 5 ? `（仅${values.length}日记录${average ? "，按实际天数平均" : ""}）` : "";
  return (average ? sum / values.length : sum).toFixed(2) + "%" + (estimated ? "*" : "") + note;
}

export interface InstitutionTotals {
  explanation: string;
  buy: number | null;
  sell: number | null;
  netBuy: number | null;
  netSell: number | null;
}

export function institutionTotals(row: Record<string, unknown>): InstitutionTotals {
  const nonnegative = (v: unknown) => { const n = finiteNumber(v); return n !== null && n >= 0 ? n : null; };
  const buy = nonnegative(row.BUY_AMT), sell = nonnegative(row.SELL_AMT);
  // 按分计算，避免浮点尾差；缺失值不当成零，也不混用全榜净额。
  const net = buy === null || sell === null ? null : (Math.round(buy * 100) - Math.round(sell * 100)) / 100;
  return {
    explanation: String(row.EXPLANATION ?? ""), buy, sell,
    netBuy: net === null ? null : Math.max(net, 0),
    netSell: net === null ? null : Math.max(-net, 0),
  };
}
