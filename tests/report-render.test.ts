import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
for (const source of ["tx", "em"]) {
  test(`完整报告：${source} 数据源正确展示最高/最低、五日均值及机构净额`, () => {
    const cwd = mkdtempSync(join(tmpdir(), "report-fields-"));
    try {
      const result = spawnSync(process.execPath, ["--import", resolve(root, "tests/fixtures/report-fetch.mjs"), resolve(root, "src/report-by-date.ts"), "2026-09-18"], {
        cwd, encoding: "utf8", timeout: 30000, env: {...process.env, REPORT_TEST_SOURCE: source, REPORT_DATE: "", DATE: ""},
      });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const file = join(cwd, "reports/2026-09-18.html");
      const html = readFileSync(file, "utf8");
      assert.equal((html.match(/<td>当日最高价<\/td><td>12.34 元/g) ?? []).length, 200);
      assert.equal((html.match(/<td>当日最低价<\/td><td>9.87 元/g) ?? []).length, 200);
      assert.equal((html.match(/<td>5日换手率<\/td><td>15.00%/g) ?? []).length, 200);
      assert.equal((html.match(/<td>5日平均换手率<\/td><td>3.00%/g) ?? []).length, 200);
      assert.match(html, /机构净买入/); assert.match(html, /400.00 万元/);
      assert.match(html, /机构净卖出/); assert.match(html, /500.00 万元/);
      assert.match(html, /连续三个交易日累计测试榜/);
      assert.match(html, /Noto Sans CJK SC/);
      if (process.env.REPORT_TEST_OUTPUT_DIR) {
        mkdirSync(process.env.REPORT_TEST_OUTPUT_DIR, {recursive: true});
        copyFileSync(file, join(process.env.REPORT_TEST_OUTPUT_DIR, `${source}-sample.html`));
      }
    } finally {
      rmSync(cwd, {recursive: true, force: true});
    }
  });
}
