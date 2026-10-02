const tabs = [...document.querySelectorAll('[data-tab]')];
const panels = [...document.querySelectorAll('.panel')];

function openTab(name) {
  const selected = name === 'issues' ? 'issues' : 'intro';
  tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.tab === selected));
  panels.forEach(panel => panel.classList.toggle('active', panel.id === selected));
}

tabs.forEach(tab => tab.addEventListener('click', event => {
  event.preventDefault();
  history.pushState({}, '', `#${tab.dataset.tab}`);
  openTab(tab.dataset.tab);
}));

document.querySelector('[data-open-tab]').addEventListener('click', event => {
  event.preventDefault();
  history.pushState({}, '', '#issues');
  openTab('issues');
  window.scrollTo(0, 0);
});

window.addEventListener('popstate', () => openTab(location.hash.slice(1)));
openTab(location.hash.slice(1));

// 월별 간행본 목록에 항목을 추가할 때 이 배열에 월과 PDF 경로를 등록합니다.
const issues = [
  {id:'issue-1', title:'2026년 9월호', pdf:'assets/issue-1/issue.pdf', cover:'assets/issue-1/1.png', downloadName:'월간이호수.pdf', formats:[
    {label:'PDF', href:'assets/issue-1/issue.pdf', download:'월간이호수-2026-09.pdf'},
    {label:'JPG', href:'assets/issue-1/1.jpg', download:'월간이호수-2026-09-1.jpg'},
    {label:'JPG', href:'assets/issue-1/2.jpg', download:'월간이호수-2026-09-2.jpg'},
    {label:'JPG', href:'assets/issue-1/3.jpg', download:'월간이호수-2026-09-3.jpg'},
    {label:'PNG', href:'assets/issue-1/1.png', download:'월간이호수-2026-09-1.png'},
    {label:'PNG', href:'assets/issue-1/2.png', download:'월간이호수-2026-09-2.png'},
    {label:'PNG', href:'assets/issue-1/3.png', download:'월간이호수-2026-09-3.png'}
  ]}
];
const issueButtons = document.querySelector('.month-list');
const selectedIssue = document.querySelector('#selected-issue');

function selectIssue(issue) {
  document.querySelectorAll('.month-button').forEach(button => button.classList.toggle('active', button.dataset.issue === issue.id));
  selectedIssue.querySelector('.cover img').src = issue.cover;
  selectedIssue.querySelector('.cover img').alt = `${issue.title} 표지`;
  document.querySelector('#selected-issue-title').textContent = issue.title;
  const viewLink = document.querySelector('#selected-issue-view');
  viewLink.href = issue.pdf;
  const pdfViewer = document.querySelector('#issue-pdf-viewer');
  pdfViewer.src = issue.pdf;
  pdfViewer.title = `${issue.title} PDF 읽기`;
  document.querySelector('#download-formats').innerHTML = issue.formats.map(file => `<a class="button" href="${file.href}" download="${file.download}">${file.label} 다운로드</a>`).join('');
}

issueButtons.innerHTML = issues.map((issue, index) => `<button class="month-button${index === 0 ? ' active' : ''}" type="button" data-issue="${issue.id}">${issue.title}</button>`).join('');
issueButtons.addEventListener('click', event => {
  const button = event.target.closest('[data-issue]');
  if (button) selectIssue(issues.find(issue => issue.id === button.dataset.issue));
});
if (issues.length) selectIssue(issues[0]);
