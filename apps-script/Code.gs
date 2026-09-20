/** 每日行情专用上传服务。请部署到独立的 Apps Script 项目。 */
const DEFAULT_BASE_PATH = 'CNINFO/每日行情';
const DEFAULT_MAX_BYTES = 35 * 1024 * 1024;

function initialize() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('UPLOAD_TOKEN')) {
    p.setProperty('UPLOAD_TOKEN', (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''));
  }
  if (!p.getProperty('BASE_PATH')) p.setProperty('BASE_PATH', DEFAULT_BASE_PATH);
  if (!p.getProperty('MAX_BYTES')) p.setProperty('MAX_BYTES', String(DEFAULT_MAX_BYTES));
  rootFolder_().getName(); // 首次运行时请求 Drive 授权。
  console.log('初始化完成，归档目录：' + basePath_().join('/'));
  console.log('请从项目设置 → 脚本属性复制 UPLOAD_TOKEN；此处不输出密钥。');
}

function doGet() {
  return jsonOutput_({
    ok: true,
    service: 'Daily Market Report Drive Gateway',
    configured: Boolean(PropertiesService.getScriptProperties().getProperty('UPLOAD_TOKEN')),
    base_path: basePath_().join('/')
  });
}

function doPost(event) {
  try {
    const text = event && event.postData ? event.postData.contents : '';
    if (!text) throw new Error('请求正文为空');
    const payload = JSON.parse(text);
    const expected = PropertiesService.getScriptProperties().getProperty('UPLOAD_TOKEN');
    if (!expected) throw new Error('请先运行 initialize()');
    if (!payload.token || String(payload.token) !== expected) throw new Error('上传令牌无效');
    if (payload.operation === 'ping') {
      return jsonOutput_({ok: true, result: {base_path: basePath_().join('/')}});
    }
    if (payload.operation !== 'run_file') throw new Error('仅支持每日行情 run_file 上传');
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      return jsonOutput_({ok: false, code: 'busy', error: '另一个上传任务正在运行，请稍后重试'});
    }
    try {
      return jsonOutput_({ok: true, result: upsertRunFile_(payload)});
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return jsonOutput_({ok: false, code: 'request_failed', error: String(error.message || error)});
  }
}

function upsertRunFile_(p) {
  ['run_id', 'sha256', 'file_name', 'mime_type', 'content_base64'].forEach(function (key) {
    if (!p[key]) throw new Error('缺少字段：' + key);
  });
  const runId = String(p.run_id);
  if (!/^\d{8}-stock-report$/.test(runId)) throw new Error('run_id 必须是 YYYYMMDD-stock-report');
  const date = runId.slice(0, 4) + '-' + runId.slice(4, 6) + '-' + runId.slice(6, 8);
  const parsed = new Date(date + 'T00:00:00Z');
  if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('run_id 日期无效');
  }
  const name = String(p.file_name);
  if (name !== date + '.pdf' || p.mime_type !== 'application/pdf') {
    throw new Error('仅接受对应日期的 YYYY-MM-DD.pdf 报告');
  }
  const bytes = Utilities.base64Decode(String(p.content_base64));
  const max = Number(PropertiesService.getScriptProperties().getProperty('MAX_BYTES') || DEFAULT_MAX_BYTES);
  if (!(max > 0) || !isFinite(max)) throw new Error('MAX_BYTES 配置无效');
  if (!bytes.length || bytes.length > max) throw new Error('文件为空或超过 Apps Script 上限');
  const sha256 = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
  if (sha256 !== String(p.sha256).toLowerCase()) throw new Error('文件 SHA256 校验失败');

  const segments = basePath_().concat(['runs', date.slice(0, 4), date.slice(0, 7), runId]);
  const folder = ensurePath_(rootFolder_(), segments);
  const identity = 'run:' + runId + ':' + name;
  const existing = findByAnnouncementId_(folder, identity);
  const old = existing ? readMetadata_(existing) : {};
  const oldVersion = Number(old.cninfo_version || 0);
  const drivePath = segments.concat([name]).join('/');
  if (existing && old.cninfo_sha256 === sha256) {
    return fileResult_(existing, 'skipped', drivePath, oldVersion || 1);
  }
  const version = oldVersion + 1;
  const created = folder.createFile(Utilities.newBlob(bytes, 'application/pdf', name));
  created.setDescription(JSON.stringify({
    cninfo_announcement_id: identity,
    cninfo_sha256: sha256,
    cninfo_run_id: runId,
    cninfo_format: 'pdf',
    cninfo_version: String(version)
  }));
  if (existing) existing.setTrashed(true);
  return fileResult_(created, existing ? 'updated' : 'created', drivePath, version);
}

function fileResult_(file, status, path, version) {
  return {status: status, file_id: file.getId(), drive_path: path, version: version, web_view_link: file.getUrl()};
}

function rootFolder_() {
  const id = PropertiesService.getScriptProperties().getProperty('ROOT_FOLDER_ID');
  return id ? DriveApp.getFolderById(id) : DriveApp.getRootFolder();
}

function basePath_() {
  const path = PropertiesService.getScriptProperties().getProperty('BASE_PATH') || DEFAULT_BASE_PATH;
  const segments = String(path).split('/').map(function (part) { return part.trim(); }).filter(Boolean);
  if (!segments.length || segments.some(function (part) { return part === '.' || part === '..'; })) {
    throw new Error('BASE_PATH 无效');
  }
  return segments;
}

function ensurePath_(root, segments) {
  let folder = root;
  segments.forEach(function (name) {
    const found = folder.getFoldersByName(name);
    folder = found.hasNext() ? found.next() : folder.createFolder(name);
  });
  return folder;
}

function findByAnnouncementId_(folder, id) {
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (readMetadata_(file).cninfo_announcement_id === id) return file;
  }
  return null;
}

function readMetadata_(file) {
  try { return JSON.parse(file.getDescription() || '{}'); }
  catch (error) { return {}; }
}

function jsonOutput_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
