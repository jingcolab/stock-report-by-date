# 切换到 CNINFO/每日行情

本目录的 `Code.gs` 是“指定日期报告”专用上传服务，兼容当前仓库，无需修改工作流或 Python 上传代码。默认路径：

```text
CNINFO/每日行情/runs/YYYY/YYYY-MM/YYYYMMDD-stock-report/YYYY-MM-DD.pdf
```

原有上传服务被机构调研等任务共用；修改其 `BASE_PATH` 会影响那些任务的后续归档。因此请在同一个 Google 账号中新建独立项目，不要覆盖原项目。

## 一次性部署

1. 用保存报告的 Google 账号打开 <https://script.google.com/home>，点击“新建项目”，命名为“每日行情上传”。
2. 清空新项目默认 `Code.gs`，完整复制本目录 [Code.gs](Code.gs) 的内容进去，保存。
3. 顶部函数下拉框选择 `initialize`，点击“运行”，完成 Google 的 Drive 授权。首次运行会创建本项目独立的 `UPLOAD_TOKEN`、`BASE_PATH=CNINFO/每日行情` 和 `MAX_BYTES`。重复运行不会覆盖现有配置。
4. 左侧“项目设置 → 脚本属性”，复制新项目的 `UPLOAD_TOKEN` 值。不要把密钥贴到仓库或聊天中。
5. 右上角“部署 → 新建部署”，类型选择“网页应用”：执行身份选“我”，访问权限选“任何人（Anyone）”，点击“部署”。上传请求仍须通过 `UPLOAD_TOKEN` 验证。复制以 `/exec` 结尾的部署网址。
6. 打开[新仓库 Secrets](https://github.com/jingcolab/stock-report-by-date/settings/secrets/actions)，替换以下两项，务必来自同一个新项目：

   | Secret | 值 |
   | --- | --- |
   | `GDRIVE_APPS_SCRIPT_URL` | 新部署的 `/exec` 网址 |
   | `GDRIVE_APPS_SCRIPT_TOKEN` | 新项目的 `UPLOAD_TOKEN` 值 |

7. 打开[手动工作流](https://github.com/jingcolab/stock-report-by-date/actions/workflows/report-by-date.yml)，Run workflow，`main`，日期 `2026-09-18`，勾选 `upload_drive`。任务日志中的 `drive_path` 应为：

   ```text
   CNINFO/每日行情/runs/2026/2026-09/20260918-stock-report/2026-09-18.pdf
   ```

两项 Secrets 更新后，每日自动任务也会使用这个新服务。仅向 GitHub 提交 `Code.gs` 不会自动在 Google 部署或改变当前归档路径。

如原项目设置过 `ROOT_FOLDER_ID`，且希望仍存放在该父文件夹中，在新项目的脚本属性中复制同一个 `ROOT_FOLDER_ID`；没有设置时默认使用“我的云端硬盘”根目录。

## 已生成的文件

切换服务只影响后续上传，不会搬动旧文件。需要迁移现有报告时，可在 Drive 中新建“CNINFO/每日行情”，再把原“CNINFO/机构调研/runs”下对应的 `YYYYMMDD-stock-report` 文件夹移动到新目录相同的年/月层级。仅移动行情报告文件夹，保留原机构调研内容。也可补跑对应日期，在新目录重新生成。

## 以后更改目录

在这个独立项目的“项目设置 → 脚本属性”中修改 `BASE_PATH` 后保存即可；它由上传服务在每次请求时读取，不需重新部署，也不需更改 Token。`BASE_PATH` 只填父目录，例如 `CNINFO/每日行情`，不要把 `runs`、年份、月份或文件名填进去。

如果修改的是 `Code.gs` 代码，则须“部署 → 管理部署 → 编辑 → 新版本 → 部署”，已有 `/exec` 网址可以保留。

参考：[Google 网页应用部署说明](https://developers.google.com/apps-script/guides/web#deploy_a_script_as_a_web_app)、[脚本属性设置说明](https://developers.google.com/apps-script/guides/properties#manage_script_properties_manually)。

本地可运行 `node --test tests/test_apps_script_gateway.cjs` 检查目录、鉴权、重复上传与内容校验。测试使用模拟 Drive；真实部署和上传仍需执行上述第 7 步。
