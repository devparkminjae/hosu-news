import * as pdfjs from './vendor/pdfjs/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

export function createPdfReader(root) {
  root.innerHTML = `
    <div class="pdf-toolbar">
      <div class="pdf-controls" aria-label="페이지 이동">
        <button type="button" data-pdf-action="previous">이전</button>
        <span class="pdf-page-number"><strong data-pdf-page>1</strong> / <span data-pdf-pages>1</span></span>
        <button type="button" data-pdf-action="next">다음</button>
      </div>
      <div class="pdf-controls" aria-label="보기 설정">
        <button type="button" data-pdf-action="zoom-out">축소</button>
        <button type="button" data-pdf-action="zoom-in">확대</button>
        <a data-pdf-download href="#" download>PDF 다운로드</a>
      </div>
    </div>
    <div class="pdf-stage" data-pdf-stage tabindex="0">
      <canvas data-pdf-canvas aria-label="PDF 페이지"></canvas>
      <p class="pdf-status" data-pdf-status role="status" aria-live="polite">PDF를 불러오는 중입니다.</p>
    </div>`;

  const stage = root.querySelector('[data-pdf-stage]');
  const canvas = root.querySelector('[data-pdf-canvas]');
  const status = root.querySelector('[data-pdf-status]');
  const pageNumber = root.querySelector('[data-pdf-page]');
  const pageCount = root.querySelector('[data-pdf-pages]');
  const previousButton = root.querySelector('[data-pdf-action="previous"]');
  const nextButton = root.querySelector('[data-pdf-action="next"]');
  const zoomOutButton = root.querySelector('[data-pdf-action="zoom-out"]');
  const zoomInButton = root.querySelector('[data-pdf-action="zoom-in"]');
  const downloadLink = root.querySelector('[data-pdf-download]');
  const context = canvas.getContext('2d');

  let documentTask;
  let pdfDocument;
  let renderTask;
  let currentPage = 1;
  let zoom = 1;
  let loadSequence = 0;
  let swipeStart = null;

  function updateControls() {
    const total = pdfDocument?.numPages || 1;
    pageNumber.textContent = currentPage;
    pageCount.textContent = total;
    previousButton.disabled = !pdfDocument || currentPage <= 1;
    nextButton.disabled = !pdfDocument || currentPage >= total;
    zoomOutButton.disabled = !pdfDocument || zoom <= 0.75;
    zoomInButton.disabled = !pdfDocument || zoom >= 2;
  }

  async function renderPage() {
    if (!pdfDocument) return;
    renderTask?.cancel();
    status.hidden = false;
    status.textContent = `${currentPage}쪽을 불러오는 중입니다.`;
    canvas.hidden = true;

    try {
      const page = await pdfDocument.getPage(currentPage);
      const baseViewport = page.getViewport({scale: 1});
      const availableWidth = Math.max(260, stage.clientWidth - 48);
      const fitScale = Math.min(1.4, availableWidth / baseViewport.width);
      const viewport = page.getViewport({scale: fitScale * zoom});
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      renderTask = page.render({
        canvasContext: context,
        viewport,
        transform: pixelRatio === 1 ? null : [pixelRatio, 0, 0, pixelRatio, 0, 0]
      });
      await renderTask.promise;
      canvas.hidden = false;
      status.hidden = true;
      updateControls();
    } catch (error) {
      if (error?.name === 'RenderingCancelledException') return;
      status.hidden = false;
      status.textContent = '이 페이지를 표시하지 못했습니다. PDF 다운로드를 이용해 주세요.';
    }
  }

  async function load(url, title, downloadName) {
    const sequence = ++loadSequence;
    documentTask?.destroy();
    pdfDocument = null;
    currentPage = 1;
    zoom = 1;
    canvas.hidden = true;
    status.hidden = false;
    status.textContent = 'PDF를 불러오는 중입니다.';
    downloadLink.href = url;
    downloadLink.download = downloadName || '';
    root.setAttribute('aria-label', `${title} PDF 읽기`);
    updateControls();

    try {
      documentTask = pdfjs.getDocument({url});
      const loadedDocument = await documentTask.promise;
      if (sequence !== loadSequence) return;
      pdfDocument = loadedDocument;
      await renderPage();
    } catch (error) {
      if (sequence !== loadSequence) return;
      console.error('PDF를 불러오지 못했습니다.', error);
      status.textContent = 'PDF를 불러오지 못했습니다. PDF 다운로드를 이용해 주세요.';
    }
  }

  root.addEventListener('click', event => {
    const action = event.target.closest('[data-pdf-action]')?.dataset.pdfAction;
    if (!action || !pdfDocument) return;
    if (action === 'previous' && currentPage > 1) currentPage -= 1;
    if (action === 'next' && currentPage < pdfDocument.numPages) currentPage += 1;
    if (action === 'zoom-out' && zoom > 0.75) zoom = Math.max(0.75, zoom - 0.25);
    if (action === 'zoom-in' && zoom < 2) zoom = Math.min(2, zoom + 0.25);
    renderPage();
  });

  stage.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' && currentPage > 1) {
      currentPage -= 1;
      renderPage();
    }
    if (event.key === 'ArrowRight' && pdfDocument && currentPage < pdfDocument.numPages) {
      currentPage += 1;
      renderPage();
    }
  });

  stage.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || zoom > 1) return;
    swipeStart = {x: event.clientX, y: event.clientY, pointerId: event.pointerId};
  });

  stage.addEventListener('pointerup', event => {
    if (!swipeStart || swipeStart.pointerId !== event.pointerId || !pdfDocument) return;
    const distanceX = event.clientX - swipeStart.x;
    const distanceY = event.clientY - swipeStart.y;
    swipeStart = null;
    if (Math.abs(distanceX) < 55 || Math.abs(distanceX) < Math.abs(distanceY) * 1.25) return;
    if (distanceX < 0 && currentPage < pdfDocument.numPages) currentPage += 1;
    else if (distanceX > 0 && currentPage > 1) currentPage -= 1;
    else return;
    renderPage();
  });

  stage.addEventListener('pointercancel', () => {
    swipeStart = null;
  });

  updateControls();
  return {load};
}
