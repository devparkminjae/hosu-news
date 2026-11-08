import {createServer} from 'node:http';
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, extname, join, normalize, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';

const toolDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(toolDir, '..');
const publicationsPath = join(projectRoot, 'publications.js');
const managerPath = join(toolDir, 'manager.html');
const token = randomBytes(24).toString('hex');
const host = '127.0.0.1';
const port = 4321;
const maxBodySize = 120 * 1024 * 1024;

function run(command, args) {
  return spawnSync(command, args, {cwd: projectRoot, encoding: 'utf8'});
}

function readPublications() {
  const source = readFileSync(publicationsPath, 'utf8');
  const json = source.replace(/^window\.PUBLICATIONS\s*=\s*/, '').replace(/;\s*$/, '');
  return JSON.parse(json);
}

function writePublications(publications) {
  writeFileSync(publicationsPath, `window.PUBLICATIONS = ${JSON.stringify(publications, null, 2)};\n`, 'utf8');
}

function send(response, status, body, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(body);
}

function sendJson(response, status, data) {
  send(response, status, JSON.stringify(data), 'application/json; charset=utf-8');
}

function safeProjectPath(relativePath) {
  const clean = normalize(String(relativePath || '')).replace(/^([/\\])+/, '');
  const absolute = resolve(projectRoot, clean);
  if (absolute !== projectRoot && !absolute.startsWith(`${projectRoot}/`)) return null;
  return absolute;
}

function inferMonth(issue) {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(issue.month || '')) return issue.month;
  const match = `${issue.id || ''} ${issue.title || ''} ${issue.downloadName || ''}`.match(/(20\d{2})[^0-9]?(0?[1-9]|1[0-2])/);
  return match ? `${match[1]}-${String(Number(match[2])).padStart(2, '0')}` : '';
}

function readRequestBody(request) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', chunk => {
      size += chunk.length;
      if (size > maxBodySize) {
        reject(new Error('한 번에 올릴 수 있는 파일 크기를 초과했습니다. PDF와 표지를 합쳐 120MB 이하로 준비해 주세요.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function validateUpload(upload, type) {
  if (!upload) return null;
  if (typeof upload.name !== 'string' || typeof upload.data !== 'string') throw new Error('선택한 파일을 읽지 못했습니다. 다시 선택해 주세요.');
  const extension = extname(upload.name).toLowerCase();
  if (type === 'pdf' && extension !== '.pdf') throw new Error('간행본 파일은 PDF만 선택할 수 있습니다.');
  if (type === 'cover' && !['.jpg', '.jpeg', '.png'].includes(extension)) throw new Error('표지는 JPG 또는 PNG 파일만 선택할 수 있습니다.');
  return Buffer.from(upload.data, 'base64');
}

function createCover(inputPath, outputPath) {
  const result = run('sips', ['-s', 'format', 'png', inputPath, '--out', outputPath]);
  if (result.status !== 0 || !existsSync(outputPath)) throw new Error('표지 이미지를 만들지 못했습니다. 다른 이미지나 PDF로 다시 시도해 주세요.');
}

function relativeUrl(absolutePath) {
  return relative(projectRoot, absolutePath).split('\\').join('/');
}

function formatIssue(raw, existingIssues, changedPaths, usedMonths) {
  const title = String(raw.title || '').trim();
  const month = String(raw.month || '').trim();
  if (!title) throw new Error('모든 간행본의 제목을 입력해 주세요.');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`${title}의 발행월을 2026-11 형식으로 입력해 주세요.`);
  if (usedMonths.has(month)) throw new Error(`${month} 발행월이 두 번 들어 있습니다.`);
  usedMonths.add(month);

  const existing = existingIssues.find(issue => issue.id === raw.id);
  const isNew = !existing;
  const id = existing?.id || `issue-${month}`;
  const pdfBuffer = validateUpload(raw.pdfUpload, 'pdf');
  const coverBuffer = validateUpload(raw.coverUpload, 'cover');

  if (isNew && !pdfBuffer) throw new Error(`${title}의 PDF를 선택해 주세요.`);

  let pdf = existing?.pdf || '';
  let cover = existing?.cover || '';
  let formats = Array.isArray(existing?.formats) ? existing.formats : [];
  const issueDirectory = isNew
    ? join(projectRoot, 'assets', 'issues', month)
    : dirname(safeProjectPath(existing.pdf));

  if (isNew && existsSync(issueDirectory)) throw new Error(`${month} 간행본 폴더가 이미 있습니다. 기존 간행본을 수정하거나 다른 발행월을 선택해 주세요.`);
  mkdirSync(issueDirectory, {recursive: true});

  if (pdfBuffer) {
    const pdfPath = isNew ? join(issueDirectory, 'issue.pdf') : safeProjectPath(existing.pdf);
    if (!pdfPath) throw new Error(`${title}의 기존 PDF 경로가 올바르지 않습니다.`);
    writeFileSync(pdfPath, pdfBuffer);
    pdf = relativeUrl(pdfPath);
    changedPaths.add(pdf);
  }

  if (coverBuffer) {
    const temporaryPath = join(issueDirectory, `.cover-upload${extname(raw.coverUpload.name).toLowerCase()}`);
    const coverPath = join(issueDirectory, 'cover.png');
    writeFileSync(temporaryPath, coverBuffer);
    try {
      createCover(temporaryPath, coverPath);
    } finally {
      rmSync(temporaryPath, {force: true});
    }
    cover = relativeUrl(coverPath);
    changedPaths.add(cover);
  } else if ((isNew || pdfBuffer) && pdf) {
    const coverPath = join(issueDirectory, 'cover.png');
    createCover(safeProjectPath(pdf), coverPath);
    cover = relativeUrl(coverPath);
    changedPaths.add(cover);
  }

  if (!pdf || !safeProjectPath(pdf) || !existsSync(safeProjectPath(pdf))) throw new Error(`${title}의 PDF 파일을 찾을 수 없습니다.`);
  if (!cover || !safeProjectPath(cover) || !existsSync(safeProjectPath(cover))) throw new Error(`${title}의 표지 파일을 찾을 수 없습니다.`);

  const downloadName = `월간이호수-${month}.pdf`;
  if (isNew || pdfBuffer) formats = [{label: 'PDF', href: pdf, download: downloadName}];
  else formats = formats.map(item => item.label === 'PDF' ? {...item, href: pdf, download: downloadName} : item);

  return {id, month, title, pdf, cover, downloadName, formats};
}

async function publish(request, response) {
  if (request.headers['x-manager-token'] !== token) return sendJson(response, 403, {error: '관리 화면을 다시 열어 주세요.'});
  const dirty = run('git', ['status', '--porcelain']).stdout.trim();
  if (dirty) return sendJson(response, 409, {error: '사이트 폴더에 저장되지 않은 변경이 있습니다. Codex에서 먼저 변경 내용을 정리해 주세요.'});

  try {
    const payload = JSON.parse(await readRequestBody(request));
    if (!Array.isArray(payload.publications) || payload.publications.length === 0) throw new Error('간행본을 한 개 이상 남겨 주세요.');
    const existingIssues = readPublications();
    const changedPaths = new Set(['publications.js']);
    const usedMonths = new Set();
    const publications = payload.publications.map(issue => formatIssue(issue, existingIssues, changedPaths, usedMonths));
    writePublications(publications);

    const add = run('git', ['add', ...changedPaths]);
    if (add.status !== 0) throw new Error(`Git에 변경사항을 추가하지 못했습니다. ${add.stderr.trim()}`);
    if (run('git', ['diff', '--cached', '--quiet']).status === 0) return sendJson(response, 200, {message: '변경된 내용이 없습니다.'});

    const commit = run('git', ['commit', '-m', 'Update publications']);
    if (commit.status !== 0) throw new Error(`변경사항은 저장했지만 커밋하지 못했습니다. ${commit.stderr.trim()}`);
    const push = run('git', ['push', 'origin', 'main']);
    if (push.status !== 0) throw new Error(`컴퓨터에는 저장했지만 GitHub 업로드에 실패했습니다. ${push.stderr.trim()}`);
    sendJson(response, 200, {message: '저장과 GitHub 업로드가 완료되었습니다.', publications});
  } catch (error) {
    sendJson(response, 400, {error: error.message || '저장 중 오류가 발생했습니다.'});
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${host}:${port}`);
  if (request.method === 'GET' && url.pathname === '/') {
    const html = readFileSync(managerPath, 'utf8').replaceAll('__MANAGER_TOKEN__', token);
    return send(response, 200, html, 'text/html; charset=utf-8');
  }
  if (request.method === 'GET' && url.pathname === '/api/publications') {
    const publications = readPublications().map(issue => ({...issue, month: inferMonth(issue)}));
    return sendJson(response, 200, {publications});
  }
  if (request.method === 'GET' && url.pathname.startsWith('/asset/')) {
    const assetPath = safeProjectPath(decodeURIComponent(url.pathname.slice('/asset/'.length)));
    if (!assetPath || !existsSync(assetPath)) return send(response, 404, '파일을 찾을 수 없습니다.');
    const extension = extname(assetPath).toLowerCase();
    const contentType = extension === '.png' ? 'image/png' : extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 'application/octet-stream';
    return send(response, 200, readFileSync(assetPath), contentType);
  }
  if (request.method === 'POST' && url.pathname === '/api/publish') return publish(request, response);
  if (request.method === 'POST' && url.pathname === '/api/close') {
    sendJson(response, 200, {message: '관리 화면을 닫았습니다.'});
    setTimeout(() => server.close(() => process.exit(0)), 100);
    return;
  }
  send(response, 404, '페이지를 찾을 수 없습니다.');
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    spawn('open', [`http://${host}:${port}`], {detached: true, stdio: 'ignore'}).unref();
    process.exit(0);
  }
  throw error;
});

server.listen(port, host, () => {
  spawn('open', [`http://${host}:${port}`], {detached: true, stdio: 'ignore'}).unref();
  console.log(`월간이호수 간행본 관리: http://${host}:${port}`);
});
