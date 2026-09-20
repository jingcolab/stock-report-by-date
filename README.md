# A 股指定日期报告

独立生成指定交易日的沪深 A 股涨跌幅前 100 / 后 100 报告，保留原版图表和增强数据，输出 HTML、PDF，并支持归档到 Google Drive。

| 工作流 | 用途 |
| --- | --- |
| [A股指定日期报告（手动）](https://github.com/jingcolab/stock-report-by-date/actions/workflows/report-by-date.yml) | 输入交易日期，手动生成或补跑报告 |
| [A股指定日期报告（每日自动）](https://github.com/jingcolab/stock-report-by-date/actions/workflows/report-by-date-daily.yml) | 每天北京时间 19:30 调度，非交易日跳过；也支持手动补跑 |

## 首次配置 Google Drive

打开 [Settings → Secrets and variables → Actions](https://github.com/jingcolab/stock-report-by-date/settings/secrets/actions)，使用 New repository secret 添加：

| Name | 值 |
| --- | --- |
| `GDRIVE_APPS_SCRIPT_URL` | 现有 Google Apps Script Web App 的 `/exec` 部署地址 |
| `GDRIVE_APPS_SCRIPT_TOKEN` | 该 Apps Script 项目的 `UPLOAD_TOKEN` 值 |

可继续使用原有 Google 账号、Apps Script 服务及 Drive 文件夹。代码中没有密钥，原仓库的 Secrets 不会随代码复制，也不能从 GitHub 页面读回原值。

部署地址可从原 Apps Script 项目的“部署 → 管理部署”取得；令牌可从“项目设置 → 脚本属性 → UPLOAD_TOKEN”取得。无需修改原令牌。

可选变量 `GDRIVE_APPS_SCRIPT_MAX_BYTES` 默认为 `36700160`（35 MiB）。GitHub 自带的 `GITHUB_TOKEN` 自动提供，不用手动配置。

## 手动生成报告

1. 打开上面的手动工作流，点击 Run workflow。
2. 分支选 `main`，`date` 填已收盘交易日，例如 `2026-09-18`。
3. 配好云盘密钥后，勾选 `upload_drive`。
4. `upload_artifact` 默认不勾选，避免积累 GitHub PDF 附件存储。

HTML 会提交到本仓库 `reports/YYYY-MM-DD.html`。PDF 上传到现有 Drive 服务的归档路径，具体位置见任务日志。

如果暂时没有配置 Drive，可取消 `upload_drive` 并勾选 `upload_artifact`，运行成功后从任务底部 Artifacts 下载 PDF，附件保留 7 天。两项都不勾选时仅 HTML 持久保存，runner 上的 PDF 随任务环境释放。

## 每日自动运行

默认分支 `main` 的工作流按 UTC 11:30（北京时间 19:30）调度。GitHub 可能延迟启动，日期脚本已保留跨午夜延迟修复。每日自动任务默认上传 Drive，因此需要先填写上面的两项 Secrets。

上传代码会触发日期回归检查，不会直接启动行情采集。当前账户或 runner 限制、市场接口限流、云盘服务异常仍可能影响实际运行。

## 本地运行

需要 Bun、Python 3.11+；PDF 需要 Chrome / Chromium。

```bash
python -m pip install -r requirements.txt
bun run src/report-by-date.ts 2026-09-18
python scripts/pdf_drive.py report --html reports/2026-09-18.html --pdf reports/2026-09-18.pdf --date 2026-09-18
```

Chrome 未自动找到时设置 `CHROME_BIN`。上传 Drive 时在环境变量中填写两项凭证，并为 PDF 命令添加 `--upload-drive`。

```bash
python -m pip install -r requirements-dev.txt
python -m pytest tests -q
```

## 来源与验证

提取自 `zencolab/stock` 的 `ef37b849330d393d098b83f92b7c2f401e9c9609` 提交，仅部署指定日期报告。未包含其他业务的工作流或采集脚本；共享 Drive 客户端保留兼容接口。

迁移包已通过 17 项本地回归测试、TypeScript/Python 语法及工作流 shell 语法检查。目标账号下的完整行情采集、PDF 和 Drive 归档需要首次实际运行验证。

报告保持原数据口径：当前沪深股票名单、历史价格数据、部分股本类指标使用当前股本推算；历史退市股票不在当前名单内。详细迁移说明见 [MIGRATION.md](MIGRATION.md)。
