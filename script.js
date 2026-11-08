import {createPdfReader} from './pdf-viewer.js';

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

const issues = Array.isArray(window.PUBLICATIONS) ? window.PUBLICATIONS : [];
const issueButtons = document.querySelector('.month-list');
const selectedIssue = document.querySelector('#selected-issue');
const issuePdfReader = createPdfReader(document.querySelector('#issue-pdf-reader'));
const advancePdfReader = createPdfReader(document.querySelector('#advance-pdf-reader'));

function selectIssue(issue) {
  document.querySelectorAll('.month-button').forEach(button => button.classList.toggle('active', button.dataset.issue === issue.id));
  selectedIssue.querySelector('.cover img').src = issue.cover;
  selectedIssue.querySelector('.cover img').alt = `${issue.title} 표지`;
  document.querySelector('#selected-issue-title').textContent = issue.title;
  const viewLink = document.querySelector('#selected-issue-view');
  viewLink.href = issue.pdf;
  issuePdfReader.load(issue.pdf, issue.title, issue.downloadName);
  document.querySelector('#download-formats').innerHTML = issue.formats.map(file => `<a class="button" href="${file.href}" download="${file.download}">${file.label} 다운로드</a>`).join('');
}

issueButtons.innerHTML = issues.map((issue, index) => `<button class="month-button${index === 0 ? ' active' : ''}" type="button" data-issue="${issue.id}">${issue.title}</button>`).join('');
issueButtons.addEventListener('click', event => {
  const button = event.target.closest('[data-issue]');
  if (button) selectIssue(issues.find(issue => issue.id === button.dataset.issue));
});
if (issues.length) {
  const latestIssue = issues[0];
  selectIssue(latestIssue);
  document.querySelector('#advance-button').textContent = `${latestIssue.title} 보기`;
  document.querySelector('#advance-title').textContent = latestIssue.title;
  advancePdfReader.load(latestIssue.pdf, latestIssue.title, latestIssue.downloadName);
}
