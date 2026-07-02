'use strict';

/* ---------- Elements ---------- */
const fileInput   = document.getElementById('fileInput');
const dropzone    = document.getElementById('dropzone');
const uploadCard  = document.getElementById('uploadCard');
const editCard    = document.getElementById('editCard');
const resultCard  = document.getElementById('resultCard');

const stage       = document.getElementById('stage');
const canvas      = document.getElementById('cropCanvas');
const ctx         = canvas.getContext('2d');
const zoomRange   = document.getElementById('zoomRange');
const bgSelect    = document.getElementById('bgSelect');
const sizePreset  = document.getElementById('sizePreset');

const changePhotoBtn = document.getElementById('changePhotoBtn');
const processBtn     = document.getElementById('processBtn');
const retryBtn       = document.getElementById('retryBtn');
const downloadBtn    = document.getElementById('downloadBtn');

const resultImg   = document.getElementById('resultImg');
const statSize    = document.getElementById('statSize');
const statDim     = document.getElementById('statDim');
const statQuality = document.getElementById('statQuality');
const statusMsg   = document.getElementById('statusMsg');
const pwaStatus   = document.getElementById('pwaStatus');

/* ---------- Target size constraints ---------- */
const MIN_BYTES = 10 * 1024;
const MAX_BYTES = 25 * 1024;

/* ---------- State ---------- */
let img = null;          // loaded HTMLImageElement
let scale = 1;            // zoom factor on top of "cover" fit
let offsetX = 0, offsetY = 0; // pan offset in canvas px
let dragging = false;
let lastPointer = null;
let baseFit = 1;          // scale that makes image "cover" the canvas at zoom=1

function currentAspect() {
  const v = sizePreset.value; // "600x800" | "413x531" | "600x600"
  const [w, h] = v.split('x').map(Number);
  return { w, h, ratio: w / h };
}

function setStageAspect() {
  const { ratio } = currentAspect();
  stage.style.aspectRatio = ratio;
  // Keep the drawing canvas resolution proportional for crisp rendering
  const targetW = 360;
  canvas.width = targetW;
  canvas.height = Math.round(targetW / ratio);
}

/* ---------- File loading ---------- */
function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const image = new Image();
    image.onload = () => {
      img = image;
      scale = 1;
      offsetX = 0;
      offsetY = 0;
      setStageAspect();
      fitImageToCanvas();
      drawCanvas();
      uploadCard.classList.add('hidden');
      resultCard.classList.add('hidden');
      editCard.classList.remove('hidden');
    };
    image.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function fitImageToCanvas() {
  // "cover" fit: image fills the whole canvas, cropping overflow
  const canvasRatio = canvas.width / canvas.height;
  const imgRatio = img.width / img.height;
  if (imgRatio > canvasRatio) {
    baseFit = canvas.height / img.height;
  } else {
    baseFit = canvas.width / img.width;
  }
}

/* ---------- Drawing ---------- */
function drawCanvas() {
  if (!img) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const bg = bgSelect.value;
  if (bg !== 'none') {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const s = baseFit * scale;
  const drawW = img.width * s;
  const drawH = img.height * s;
  const cx = canvas.width / 2 + offsetX;
  const cy = canvas.height / 2 + offsetY;

  ctx.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
}

/* ---------- Pan (drag) handling ---------- */
function getPoint(e) {
  if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

function clampOffsets() {
  const s = baseFit * scale;
  const drawW = img.width * s;
  const drawH = img.height * s;
  const maxOffX = Math.max(0, (drawW - canvas.width) / 2);
  const maxOffY = Math.max(0, (drawH - canvas.height) / 2);
  offsetX = Math.min(maxOffX, Math.max(-maxOffX, offsetX));
  offsetY = Math.min(maxOffY, Math.max(-maxOffY, offsetY));
}

function startDrag(e) {
  if (!img) return;
  dragging = true;
  lastPointer = getPoint(e);
}
function moveDrag(e) {
  if (!dragging || !img) return;
  const p = getPoint(e);
  const rect = canvas.getBoundingClientRect();
  const scaleFactor = canvas.width / rect.width;
  offsetX += (p.x - lastPointer.x) * scaleFactor;
  offsetY += (p.y - lastPointer.y) * scaleFactor;
  lastPointer = p;
  clampOffsets();
  drawCanvas();
  e.preventDefault();
}
function endDrag() { dragging = false; lastPointer = null; }

stage.addEventListener('mousedown', startDrag);
window.addEventListener('mousemove', moveDrag);
window.addEventListener('mouseup', endDrag);
stage.addEventListener('touchstart', startDrag, { passive: true });
window.addEventListener('touchmove', moveDrag, { passive: false });
window.addEventListener('touchend', endDrag);

zoomRange.addEventListener('input', () => {
  scale = Number(zoomRange.value) / 100;
  clampOffsets();
  drawCanvas();
});
bgSelect.addEventListener('change', drawCanvas);
sizePreset.addEventListener('change', () => {
  setStageAspect();
  fitImageToCanvas();
  offsetX = 0; offsetY = 0;
  clampOffsets();
  drawCanvas();
});

/* ---------- Upload triggers ---------- */
fileInput.addEventListener('change', (e) => loadFile(e.target.files[0]));
['dragover'].forEach(evt => dropzone.addEventListener(evt, (e) => {
  e.preventDefault(); dropzone.classList.add('drag');
}));
['dragleave', 'drop'].forEach(evt => dropzone.addEventListener(evt, (e) => {
  e.preventDefault(); dropzone.classList.remove('drag');
}));
dropzone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  loadFile(file);
});

changePhotoBtn.addEventListener('click', () => {
  editCard.classList.add('hidden');
  uploadCard.classList.remove('hidden');
  fileInput.value = '';
});

retryBtn.addEventListener('click', () => {
  resultCard.classList.add('hidden');
  editCard.classList.remove('hidden');
});

/* ---------- Render final high-res crop ---------- */
function renderFinal(targetW, targetH) {
  const out = document.createElement('canvas');
  out.width = targetW;
  out.height = targetH;
  const octx = out.getContext('2d');

  const bg = bgSelect.value;
  if (bg !== 'none') {
    octx.fillStyle = bg;
    octx.fillRect(0, 0, targetW, targetH);
  }

  // Recompute the same fit/pan/zoom math at full output resolution
  const canvasRatio = targetW / targetH;
  const imgRatio = img.width / img.height;
  const fullBaseFit = imgRatio > canvasRatio ? targetH / img.height : targetW / img.width;
  const s = fullBaseFit * scale;
  const drawW = img.width * s;
  const drawH = img.height * s;

  // offsetX/offsetY were tracked in the 360-wide preview canvas space; scale them up
  const factor = targetW / canvas.width;
  const cx = targetW / 2 + offsetX * factor;
  const cy = targetH / 2 + offsetY * factor;

  octx.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
  return out;
}

/* ---------- Compress to 10–25 KB target ---------- */
function canvasToBlob(cnv, quality) {
  return new Promise((resolve) => cnv.toBlob(resolve, 'image/jpeg', quality));
}

async function compressToTarget(cnv) {
  let bestBlob = null;
  let bestQuality = 0.92;
  let quality = 0.92;
  const steps = [0.92, 0.85, 0.78, 0.7, 0.62, 0.55, 0.48, 0.4, 0.32, 0.25, 0.18, 0.12, 0.08, 0.05];

  for (const q of steps) {
    const blob = await canvasToBlob(cnv, q);
    quality = q;
    if (blob.size <= MAX_BYTES) {
      bestBlob = blob;
      bestQuality = q;
      if (blob.size >= MIN_BYTES) {
        return { blob, quality: q, status: 'ok' };
      }
      // under MIN_BYTES: keep this as fallback but try to find something closer to the band
      break;
    }
    bestBlob = blob; // keep the smallest-so-far in case nothing fits
    bestQuality = q;
  }

  if (bestBlob && bestBlob.size <= MAX_BYTES) {
    return { blob: bestBlob, quality: bestQuality, status: bestBlob.size < MIN_BYTES ? 'under' : 'ok' };
  }

  // Still too large at lowest quality: shrink pixel dimensions and retry once
  const shrink = document.createElement('canvas');
  shrink.width = Math.round(cnv.width * 0.85);
  shrink.height = Math.round(cnv.height * 0.85);
  shrink.getContext('2d').drawImage(cnv, 0, 0, shrink.width, shrink.height);
  const blob = await canvasToBlob(shrink, 0.6);
  return { blob, quality: 0.6, status: 'resized', width: shrink.width, height: shrink.height };
}

/* ---------- Process button ---------- */
processBtn.addEventListener('click', async () => {
  if (!img) return;
  processBtn.disabled = true;
  processBtn.textContent = 'Processing…';

  const { w, h } = currentAspect();
  const finalCanvas = renderFinal(w, h);
  const result = await compressToTarget(finalCanvas);

  const url = URL.createObjectURL(result.blob);
  resultImg.src = url;
  downloadBtn.href = url;

  const kb = (result.blob.size / 1024).toFixed(1);
  statSize.textContent = `${kb} KB`;
  statDim.textContent = result.width ? `${result.width}×${result.height}` : `${w}×${h}`;
  statQuality.textContent = `${Math.round(result.quality * 100)}%`;

  if (result.status === 'ok') {
    statusMsg.textContent = 'Photo ready hai — size 10–25 KB range mein hai.';
    statusMsg.classList.remove('warn');
  } else if (result.status === 'under') {
    statusMsg.textContent = `Photo bohot simple/compress-friendly hai, size ${kb} KB bana (target se thoda kam). Filhaal yeh best available quality hai.`;
    statusMsg.classList.add('warn');
  } else {
    statusMsg.textContent = `Photo detail zyada thi, isliye dimensions thora resize kiye takay size 25 KB range mein rahe.`;
    statusMsg.classList.add('warn');
  }

  editCard.classList.add('hidden');
  resultCard.classList.remove('hidden');
  processBtn.disabled = false;
  processBtn.textContent = 'Process & Compress';
});

/* ---------- Service worker registration ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(() => { pwaStatus.textContent = 'Offline Ready'; })
      .catch(() => { pwaStatus.textContent = 'Ready'; });
  });
} else {
  pwaStatus.textContent = 'Ready';
}

setStageAspect();
