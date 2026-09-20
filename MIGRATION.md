# A 股指定日期报告（独立版）

按交易日生成沪深 A 股涨跌幅前 100 / 后 100 报告，包含原版报告增强内容、HTML、PDF、Google Drive 归档。仅包含此功能的两个工作流：手动执行和每日自动执行。

源代码：`zencolab/stock`，提交 `ef37b849330d393d098b83f92b7c2f401e9c9609`。提取日期：2026-09-20。

保留原版行情逻辑、日期延迟修复、HTML 优先提交和可选 Artifact 备份；PDF 工具移除了机构调研附件回填入口。共享 Drive 客户端保留兼容接口，但没有其他业务的采集代码或工作流。Google Apps Script 服务继续使用原来的部署。

## 1. 用目标账号创建新仓库

登录要承接运行的 GitHub 账号，打开 https://github.com/new ，新建私有仓库 `stock-report-by-date`，勾选 Add a README file。确认目标账号仍有 Actions 运行额度。

这是独立复制，不转移原仓库所有权。历史报告、旧工作流记录、Artifacts、仓库 Secrets 均未放入此包。

## 2. 上传完整项目

解压本包，打开里面的 `report-by-date-standalone` 文件夹。在新仓库选择 Add file → Upload files，将该文件夹里面的项目内容上传到仓库根目录，提交到默认分支 `main`。不要直接上传 ZIP，也不要再套一层 `report-by-date-standalone` 目录。

上传完成后必须核对以下文件路径（尤其是 `.github` 目录）：

- `.github/workflows/report-by-date.yml`
- `.github/workflows/report-by-date-daily.yml`
- `src/report-by-date.ts`
- `src/lib/enrich.ts`
- `src/lib/enrich-run.ts`
- `src/apps_script_storage.py`
- `scripts/report_date.py`
- `scripts/pdf_drive.py`
- `tests/test_report_date.py`
- `requirements.txt`

如果网页上传遗漏工作流，可用 Add file → Create new file，填写上面的完整 `.github/workflows/...yml` 路径，粘贴包内对应文件的完整内容。测试和说明文件也可一并上传。

熟悉 Git 时，也可先克隆新仓库，将本包内容复制到克隆目录（保留 `.github`），然后执行 `git add .`、`git commit -m "Add standalone date report"`、`git push`。使用新账号的 Git 认证；不要把密码或访问令牌写入命令、代码或文档。

首次上传会触发很短的日期校验；采集任务由手动或定时事件触发。

## 3. 配置 Google Drive 归档

在新仓库打开 Settings → Secrets and variables → Actions → New repository secret，创建两项：

| Name | Secret 的内容 |
| --- | --- |
| `GDRIVE_APPS_SCRIPT_URL` | 现有 Google Apps Script Web App 的 `/exec` 部署地址 |
| `GDRIVE_APPS_SCRIPT_TOKEN` | 该 Apps Script 项目的 `UPLOAD_TOKEN` 值 |

原仓库里的 Secret 不能从 GitHub 页面读回原值，也不会随代码复制。请从自己的原始配置记录或现有 Google Apps Script 项目中取值：

1. 打开原先的 Apps Script 项目 → Deploy / 部署 → Manage deployments / 管理部署，复制 Web App URL。
2. Project Settings / 项目设置 → Script Properties / 脚本属性，查看 `UPLOAD_TOKEN`，填入新仓库对应 Secret。
3. 继续使用原 Google 账号和 Drive 文件夹即可，GitHub 账号更换不要求更换 Google 账号。

此包不包含密钥。不要为迁移而随意轮换现有 `UPLOAD_TOKEN`，否则原仓库其他上传任务也需要同步更新。若无法访问原 Apps Script 服务，可先按下面“不上传云盘”的方式验证报告；重新部署服务需要另外配置。

可选 Repository variable：`GDRIVE_APPS_SCRIPT_MAX_BYTES`，默认 `36700160`（35 MiB）；仅在现有服务也调整了上限时修改。`GITHUB_TOKEN` 由 Actions 自动提供，无需手动创建。

## 4. 手动验证

Actions → A股指定日期报告（手动）→ Run workflow：

- Branch：`main`（或实际默认分支）。
- `date`：一个已收盘的交易日，如 `2026-09-18`。
- `upload_drive`：已配置两项 Secret 时勾选。
- `upload_artifact`：默认不勾选，节省 GitHub 附件存储。

确认任务真正运行完成：生成 HTML → 提交 HTML → 生成 PDF 并上传 Drive。

HTML 保存在新仓库的 `reports/YYYY-MM-DD.html`。PDF 的根目录由 Apps Script 的 `BASE_PATH` 决定；原服务的实际路径以任务日志为准。要单独改存到 `CNINFO/每日行情/runs/YYYY/YYYY-MM/YYYYMMDD-stock-report/YYYY-MM-DD.pdf`，按[专用上传服务部署步骤](apps-script/README.md)操作，不要修改原共享服务的目录。

没有 Drive 配置时，可取消 `upload_drive`，并在新账号有 Artifact 额度时勾选 `upload_artifact`，从任务底部 Artifacts 下载 PDF。两者均不勾选时，PDF 只留在临时 runner 上，结束后不可下载；HTML 仍提交到仓库。

## 5. 切换每日自动任务

新仓库的“ A股指定日期报告（每日自动）”按 UTC 11:30，即北京时间每天 19:30 调度；非交易日跳过。GitHub 调度可能延迟，代码已保留对应日期修复。工作流需在默认分支且处于启用状态，自动任务需要上述两项 Drive Secret。

新仓库手动验证成功后，在原 `zencolab/stock` 仓库的 Actions 页面选择“ A股指定日期报告（每日自动）”→ 右上角菜单 → Disable workflow。只停这一项，原仓库其他业务继续保留。

旧账号额度以后重置时，若旧任务仍启用，它会再次调度并重复生成相同日期报告。迁移包不会自动停用原任务。

## 6. 本地运行与验证

环境：Bun、Python 3.11 或更新版本；生成 PDF 还需要 Chrome / Chromium。GitHub 工作流使用 Ubuntu 托管 runner。

```bash
python -m pip install -r requirements.txt
bun run src/report-by-date.ts 2026-09-18
python scripts/pdf_drive.py report --html reports/2026-09-18.html --pdf reports/2026-09-18.pdf --date 2026-09-18
```

Chrome 未被自动找到时，设置环境变量 `CHROME_BIN` 指向浏览器可执行文件。上传 Drive 时先在本地环境变量中设置上面的 URL 和 TOKEN，再为 PDF 命令添加 `--upload-drive`。

```bash
python -m pip install -r requirements-dev.txt
python -m pytest tests -q
```

报告保持源项目的数据口径：当前沪深股票名单、历史价格数据、部分股本类指标使用当前股本推算。历史退市股票等不在当前名单内。市场接口可用性、限流与新账号的 Actions 额度仍会影响实际执行。

## 本次交付验证

- 17 项现有回归测试通过（含 6 个子测试）。
- 3 个 TypeScript 源文件通过语法和相对导入检查；Python 文件通过语法检查。
- 两个工作流的 YAML 与全部 13 个 shell 步骤通过语法检查。
- 独立 PDF 命令仅保留 `report` 入口；其命令行帮助加载正常。
- 行情采集和报告增强源文件与上述来源提交一致。
- 尚未在目标账号进行真实行情采集、PDF 渲染或 Drive 上传；需要上传到新仓库并配置密钥后验证。

## 参考

- GitHub 新建仓库：https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository
- GitHub 上传文件：https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository
- GitHub 配置 Secrets：https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
- Apps Script 脚本属性：https://developers.google.com/apps-script/guides/properties
- Apps Script 部署管理：https://developers.google.com/apps-script/concepts/deployments
