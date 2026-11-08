import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const toolDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(toolDir, '..');

function appleString(value) {
  return `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function runApple(script) {
  const result = spawnSync('osascript', ['-e', script], {encoding: 'utf8'});
  if (result.status !== 0) process.exit(0);
  return result.stdout.trim();
}

function showError(message) {
  runApple(`display alert ${appleString('업로드할 수 없습니다')} message ${appleString(message)} as critical`);
  process.exit(1);
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {cwd: projectRoot, encoding: 'utf8', ...options});
}

const dirty = run('git', ['status', '--porcelain']).stdout.trim();
if (dirty) showError('저장되지 않은 사이트 변경이 있습니다. 먼저 Codex에서 변경 내용을 정리해 주세요.');

const sourcePdf = runApple('POSIX path of (choose file with prompt "추가할 월간이호수 PDF를 선택하세요" of type {"com.adobe.pdf"})');
if (!sourcePdf.toLowerCase().endsWith('.pdf')) showError('PDF 파일만 추가할 수 있습니다.');

const issueMonth = runApple('text returned of (display dialog "발행월을 입력하세요. 예: 2026-12" default answer "2026-12" with title "월간이호수 간행본 추가")');
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(issueMonth)) showError('발행월은 2026-12처럼 입력해 주세요.');

const [year, month] = issueMonth.split('-');
const defaultTitle = `${year}년 ${Number(month)}월호`;
const title = runApple(`text returned of (display dialog "사이트에 표시할 제목을 입력하세요" default answer ${appleString(defaultTitle)} with title "월간이호수 간행본 추가")`);
if (!title) showError('제목을 입력해 주세요.');

const confirmation = runApple(`button returned of (display dialog ${appleString(`${title}를 사이트에 추가하고 GitHub에 업로드할까요?`)} buttons {"취소", "업로드"} default button "업로드" with title "최종 확인")`);
if (confirmation !== '업로드') process.exit(0);

const relativeDir = `assets/issues/${issueMonth}`;
const destinationDir = join(projectRoot, relativeDir);
if (existsSync(destinationDir)) showError(`${issueMonth} 간행본이 이미 있습니다.`);

mkdirSync(destinationDir, {recursive: true});
const pdfPath = join(destinationDir, 'issue.pdf');
const coverPath = join(destinationDir, 'cover.png');
copyFileSync(sourcePdf, pdfPath);

const coverResult = run('sips', ['-s', 'format', 'png', sourcePdf, '--out', coverPath]);
if (coverResult.status !== 0 || !existsSync(coverPath)) showError('PDF 표지 이미지를 만들지 못했습니다.');

const publicationsPath = join(projectRoot, 'publications.js');
const source = readFileSync(publicationsPath, 'utf8');
const jsonText = source.replace(/^window\.PUBLICATIONS\s*=\s*/, '').replace(/;\s*$/, '');
const publications = JSON.parse(jsonText);
const id = `issue-${issueMonth}`;
if (publications.some(issue => issue.id === id)) showError(`${issueMonth} 간행본이 목록에 이미 있습니다.`);

const pdfUrl = `${relativeDir}/issue.pdf`;
const coverUrl = `${relativeDir}/cover.png`;
const downloadName = `월간이호수-${issueMonth}.pdf`;
publications.unshift({
  id,
  title,
  pdf: pdfUrl,
  cover: coverUrl,
  downloadName,
  formats: [{label: 'PDF', href: pdfUrl, download: downloadName}]
});
writeFileSync(publicationsPath, `window.PUBLICATIONS = ${JSON.stringify(publications, null, 2)};\n`, 'utf8');

const addResult = run('git', ['add', 'publications.js', relativeDir]);
if (addResult.status !== 0) showError('Git에 새 간행본을 추가하지 못했습니다.');
const commitResult = run('git', ['commit', '-m', `Add ${title}`]);
if (commitResult.status !== 0) showError('간행본 파일은 추가했지만 커밋하지 못했습니다. Codex에게 문의해 주세요.');
const pushResult = run('git', ['push', 'origin', 'main']);
if (pushResult.status !== 0) showError('간행본은 저장했지만 GitHub 업로드에 실패했습니다. Codex에게 문의해 주세요.');

runApple(`display dialog ${appleString(`${title} 업로드가 완료되었습니다. GitHub Pages 반영에는 잠시 시간이 걸릴 수 있습니다.`)} buttons {"확인"} default button "확인" with title "업로드 완료"`);
