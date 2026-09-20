const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(resolve(__dirname, '../apps-script/Code.gs'), 'utf8');
const token = 'test-token-for-local-gateway-only';

function gateway(properties = {}) {
  const props = { UPLOAD_TOKEN: token, ...properties };
  const files = [];
  const folders = [];
  let releases = 0;
  const iterator = (items) => {
    let position = 0;
    return { hasNext: () => position < items.length, next: () => items[position++] };
  };
  function folder(path) {
    const children = new Map();
    return {
      getName: () => path,
      getFoldersByName: (name) => iterator(children.has(name) ? [children.get(name)] : []),
      createFolder: (name) => {
        const child = folder(path ? `${path}/${name}` : name);
        children.set(name, child);
        folders.push(child.getName());
        return child;
      },
      getFiles: () => iterator(files.filter((f) => f.path === path && !f.trashed)),
      createFile: (blob) => {
        const id = String(files.length + 1);
        const file = {
          path, blob, description: '', trashed: false,
          getId: () => id,
          getUrl: () => `https://drive.google.com/file/d/${id}/view`,
          getDescription() { return this.description; },
          setDescription(value) { this.description = value; },
          setTrashed(value) { this.trashed = value; },
        };
        files.push(file);
        return file;
      },
    };
  }
  const root = folder('');
  const context = vm.createContext({
    console: { log() {} },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key) => props[key] || null,
      setProperty: (key, value) => { props[key] = value; },
    }) },
    DriveApp: { getRootFolder: () => root },
    Utilities: {
      getUuid: () => '11111111-1111-1111-1111-111111111111',
      base64Decode: (value) => [...Buffer.from(value, 'base64')],
      newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (algorithm, bytes) => [...createHash(algorithm).update(Buffer.from(bytes)).digest()],
    },
    LockService: { getScriptLock: () => ({
      tryLock: () => true,
      releaseLock: () => { releases++; },
    }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({ setMimeType: () => JSON.parse(text) }),
    },
  });
  vm.runInContext(source, context);
  return {
    props, files, folders, context,
    post: (body) => context.doPost({ postData: { contents: JSON.stringify({ token, ...body }) } }),
    releaseCount: () => releases,
  };
}

function report(contents = '%PDF-1.4\nreport') {
  return {
    operation: 'run_file', run_id: '20260918-stock-report', file_name: '2026-09-18.pdf',
    mime_type: 'application/pdf', content_base64: Buffer.from(contents).toString('base64'),
    sha256: createHash('sha256').update(contents).digest('hex'),
  };
}

test('current Python upload payload creates the requested path; retries do not duplicate files', () => {
  const g = gateway();
  const created = g.post(report());
  assert.equal(created.ok, true);
  assert.equal(created.result.drive_path, 'CNINFO/每日行情/runs/2026/2026-09/20260918-stock-report/2026-09-18.pdf');
  assert.equal(created.result.status, 'created');
  assert.equal(g.post(report()).result.status, 'skipped');
  assert.equal(g.files.length, 1);
  const changed = g.post(report('%PDF-1.4\nupdated report'));
  assert.equal(changed.result.status, 'updated');
  assert.equal(changed.result.version, 2);
  assert.equal(g.files[0].trashed, true);
  assert.equal(g.files[1].trashed, false);
  assert.equal(g.releaseCount(), 3);
  assert.equal(g.folders.some((p) => p.includes('机构调研')), false);
});

test('invalid credentials and unsupported business operations cannot write to Drive', () => {
  const g = gateway();
  assert.equal(g.post({ ...report(), token: 'wrong-token' }).ok, false);
  assert.equal(g.post({ operation: 'upsert' }).ok, false);
  assert.equal(g.post({ operation: 'dataset_file' }).ok, false);
  assert.equal(g.files.length, 0);
  assert.equal(g.folders.length, 0);
});

test('bad dates, filenames, hashes and oversized files fail before creating folders', () => {
  const g = gateway();
  const cases = [
    { run_id: '20260230-stock-report' },
    { file_name: '../2026-09-18.pdf' },
    { sha256: '0'.repeat(64) },
  ];
  for (const change of cases) assert.equal(g.post({ ...report(), ...change }).ok, false);
  g.props.MAX_BYTES = '1';
  assert.equal(g.post(report()).ok, false);
  assert.equal(g.files.length, 0);
  assert.equal(g.folders.length, 0);
  assert.equal(g.releaseCount(), 4);
});

test('initialization preserves a configured token and path; ping never returns the token', () => {
  const g = gateway();
  g.context.initialize();
  assert.equal(g.props.BASE_PATH, 'CNINFO/每日行情');
  assert.equal(g.props.UPLOAD_TOKEN, token);
  g.props.BASE_PATH = 'CNINFO/每日行情归档';
  g.context.initialize();
  assert.equal(g.props.BASE_PATH, 'CNINFO/每日行情归档');
  const ping = g.post({ operation: 'ping' });
  assert.equal(ping.result.base_path, 'CNINFO/每日行情归档');
  assert.equal(JSON.stringify(ping).includes(token), false);
  assert.equal(g.post(report()).result.drive_path.startsWith('CNINFO/每日行情归档/runs/'), true);
});
