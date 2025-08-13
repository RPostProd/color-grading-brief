// app.js
// ---- Image upload + descriptions + PDF export ----

let uploadedImages = [];

// Bind after DOM is ready (defer script in HTML)
(function init() {
  const fileInput = document.getElementById('fileInput');
  const uploadArea = document.getElementById('imageUpload');

  if (!fileInput || !uploadArea) {
    console.error('Upload elements not found. Check IDs: #fileInput and #imageUpload.');
    return;
  }

  // File input
  fileInput.addEventListener('change', handleFiles);

  // Drag & drop
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    handleFiles({ target: { files: e.dataTransfer.files } });
  });

  // Expose exportToPDF globally for the button onclick
  window.exportToPDF = exportToPDF;
})();

function handleFiles(event) {
  const files = Array.from(event.target.files || []);
  files.forEach((file) => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target.result;

        // Read natural size so we can keep aspect ratio in PDF
        const tempImg = new Image();
        tempImg.onload = () => {
          const imageData = {
            id: Date.now() + Math.random(),
            src,
            name: file.name,
            description: '',
            naturalWidth: tempImg.naturalWidth,
            naturalHeight: tempImg.naturalHeight,
          };
          uploadedImages.push(imageData);
          displayUploadedImages();
        };
        tempImg.src = src;
      };
      reader.readAsDataURL(file);
    }
  });

  // Allow selecting same file again
  if (event.target && event.target.id === 'fileInput') event.target.value = '';
}

function displayUploadedImages() {
  const container = document.getElementById('uploadedImages');
  if (!container) return;
  container.innerHTML = '';

  uploadedImages.forEach((image) => {
    const imageDiv = document.createElement('div');
    imageDiv.className = 'image-reference';
    imageDiv.innerHTML = `
      <img src="${image.src}" alt="${image.name}">
      <label for="desc-${image.id}">Image notes:</label>
      <textarea id="desc-${image.id}" placeholder="What component of this image do you like or not like?">${image.description}</textarea>
      <button class="remove-image" data-id="${image.id}">Remove Image</button>
    `;
    container.appendChild(imageDiv);

    // Bind description change
    const ta = imageDiv.querySelector(`#desc-${CSS.escape(String(image.id))}`);
    ta.addEventListener('input', (e) => {
      const img = uploadedImages.find((i) => i.id == image.id);
      if (img) img.description = e.target.value;
    });

    // Bind remove
    imageDiv.querySelector('.remove-image').addEventListener('click', () => {
      removeImage(image.id);
    });
  });
}

function removeImage(imageId) {
  uploadedImages = uploadedImages.filter((i) => i.id != imageId);
  displayUploadedImages();
}

// ---------------- PDF Export ----------------
async function exportToPDF() {
  // jsPDF import (matches the CDN you load in HTML)
  const { jsPDF } = window.jspdf;
  if (!jsPDF) {
    alert('Failed to load jsPDF. Check the <script> tag for jsPDF in your HTML.');
    return;
  }

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 40;
  const maxWidth = doc.internal.pageSize.getWidth() - marginX * 2;
  const pageHeight = doc.internal.pageSize.getHeight();

  function ensureSpace(y, needed) {
    if (y + needed > pageHeight - 40) {
      doc.addPage();
      return 40;
    }
    return y;
  }

  let y = 60;

  // Title
  doc.setFontSize(20);
  doc.setTextColor(44, 62, 80);
  doc.text('Color Grading Brief', marginX, y);
  y += 18;
  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, marginX, y);
  y += 24;

  function addSection(title) {
    y = ensureSpace(y, 26);
    doc.setFontSize(14);
    doc.setTextColor(44, 62, 80);
    doc.text(title, marginX, y);
    y += 14;
  }

  function addField(label, value) {
    if (!value) return;
    const v = String(value).trim();
    if (!v) return;
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    y = ensureSpace(y, 30);
    doc.text(`${label}:`, marginX, y);
    const lines = doc.splitTextToSize(v, maxWidth);
    y += 14;
    doc.text(lines, marginX, y);
    y += lines.length * 14 + 8;
  }

  async function addImageBlock(image) {
    // Keep aspect ratio, target width 240pt
    const targetW = 240;
    const iw = image.naturalWidth || 240;
    const ih = image.naturalHeight || 160;
    const ratio = ih / iw;
    const targetH = Math.round(targetW * ratio);

    y = ensureSpace(y, targetH + 80);

    // Detect image format from dataURL
    let format = 'JPEG';
    if (image.src.startsWith('data:image/png')) format = 'PNG';
    if (image.src.startsWith('data:image/webp')) format = 'WEBP';

    doc.addImage(image.src, format, marginX, y, targetW, targetH);
    y += targetH + 12;

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(image.name, marginX, y);
    y += 14;

    if (image.description && image.description.trim()) {
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      const lines = doc.splitTextToSize(image.description.trim(), maxWidth);
      doc.text(lines, marginX, y);
      y += lines.length * 12 + 8;
    }
  }

  // --------- Gather fields from your existing HTML IDs ----------
  // Step 1
  addSection('Step 1: Scope of Adjustment');
  const scopeValue = document.querySelector('input[name="scope"]:checked')?.value || '';
  const scopeLabels = {
    timeline: 'Timeline Level (Global Look)',
    group: 'Group Level (Scene/Camera Consistency)',
    clip: 'Clip Level (Shot-Specific Look)',
  };
  addField('Adjustment Level', scopeLabels[scopeValue] || '');
  addField('Scope Description', byIdVal('scope-description'));

  // Step 2
  addSection('Step 2: Image Components');
  // Exposure
  addField('Exposure Preference', document.querySelector('input[name="exposure"]:checked')?.value || '');
  addField('Exposure Notes', byIdVal('exposure-notes'));
  // Tonal contrast
  addField('Tonal Contrast Preference', document.querySelector('input[name="tonal-contrast"]:checked')?.value || '');
  addField('Tonal Notes', byIdVal('tonal-notes'));
  // Color contrast
  addField('Color Contrast Style', byIdVal('color-contrast-style'));
  addField('Color Variety', byIdVal('color-variety'));
  // Color ba
