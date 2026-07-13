(function () {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const folderInput = document.getElementById('folderInput');
  const btnPickFiles = document.getElementById('btnPickFiles');
  const btnPickFolder = document.getElementById('btnPickFolder');
  const btnAddFolder = document.getElementById('btnAddFolder');
  const viewer = document.getElementById('viewer');
  const previewImg = document.getElementById('previewImg');
  const filenameEl = document.getElementById('filename');
  const iptcTable = document.querySelector('#iptcTable tbody');
  const noIptc = document.getElementById('noIptc');
  const counter = document.getElementById('counter');
  const filmstrip = document.getElementById('filmstrip');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const btnClose = document.getElementById('btnClose');
  const btnAdd = document.getElementById('btnAdd');

  // Each item: { file, url, iptc, thumbEl }
  let items = [];
  let current = -1;

  const IPTC_LABELS = {
    ObjectName: 'Titre',
    Headline: 'Titre accrocheur',
    Caption: 'Légende',
    CaptionWriter: 'Auteur de la légende',
    Keywords: 'Mots-clés',
    Category: 'Catégorie',
    SupplementalCategories: 'Catégories complémentaires',
    Byline: 'Auteur',
    BylineTitle: 'Fonction de l\'auteur',
    Credit: 'Crédit',
    Source: 'Source',
    CopyrightNotice: 'Copyright',
    City: 'Ville',
    Sublocation: 'Lieu précis',
    ProvinceState: 'Région / État',
    CountryName: 'Pays',
    Country: 'Pays',
    CountryCode: 'Code pays',
    DateCreated: 'Date de création',
    TimeCreated: 'Heure de création',
    SpecialInstructions: 'Instructions spéciales',
    Urgency: 'Urgence',
  };

  function humanKey(key) {
    return IPTC_LABELS[key] || key;
  }

  function formatValue(val) {
    if (Array.isArray(val)) return val.join(', ');
    if (val instanceof Date) return val.toLocaleString();
    if (val && typeof val === 'object') return JSON.stringify(val);
    return String(val);
  }

  const IMAGE_EXT_RE = /\.(jpe?g|png|tiff?|heic|heif|webp|bmp|gif)$/i;

  function isImageFile(file) {
    return file.type.startsWith('image/') || IMAGE_EXT_RE.test(file.name);
  }

  // Recursively reads a dropped FileSystemDirectoryEntry, batching readEntries()
  // calls since the browser only returns a limited chunk per call.
  function readDirectoryEntries(dirEntry) {
    return new Promise((resolve, reject) => {
      const reader = dirEntry.createReader();
      let all = [];
      function readBatch() {
        reader.readEntries(entries => {
          if (!entries.length) {
            resolve(all);
          } else {
            all = all.concat(entries);
            readBatch();
          }
        }, reject);
      }
      readBatch();
    });
  }

  async function traverseEntry(entry) {
    if (!entry) return [];
    try {
      if (entry.isFile) {
        return await new Promise((resolve, reject) => entry.file(f => resolve([f]), reject));
      }
      if (entry.isDirectory) {
        const children = await readDirectoryEntries(entry);
        const nested = await Promise.all(children.map(traverseEntry));
        return nested.flat();
      }
    } catch (e) {
      console.warn('Erreur de lecture d\'un élément déposé', e);
    }
    return [];
  }

  // Extracts files from a drop event, walking any dropped folders recursively.
  // Falls back to the flat file list whenever the filesystem-entry API is
  // unavailable or fails to yield anything, so a drop is never silently lost.
  async function getFilesFromDataTransfer(dataTransfer) {
    const items = dataTransfer.items;
    if (items && items.length && typeof items[0].webkitGetAsEntry === 'function') {
      const entries = Array.from(items)
        .map(item => item.webkitGetAsEntry())
        .filter(Boolean);
      if (entries.length) {
        const results = await Promise.all(entries.map(traverseEntry));
        const files = results.flat();
        if (files.length) return files;
      }
    }
    return Array.from(dataTransfer.files);
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList)
      .filter(isImageFile)
      .sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name));
    if (!files.length) return;

    for (const file of files) {
      const url = URL.createObjectURL(file);
      const item = { file, url, iptc: null };
      items.push(item);

      const thumb = document.createElement('img');
      thumb.src = url;
      thumb.title = file.name;
      const idx = items.length - 1;
      thumb.addEventListener('click', () => showItem(idx));
      filmstrip.appendChild(thumb);
      item.thumbEl = thumb;

      try {
        const output = await exifr.parse(file, {
          iptc: true,
          tiff: false,
          exif: false,
          gps: false,
          xmp: false,
          jfif: false,
          ihdr: false,
          icc: false,
          mergeOutput: false,
        });
        item.iptc = (output && output.iptc) || null;
      } catch (e) {
        console.warn('Erreur de lecture IPTC pour', file.name, e);
        item.iptc = null;
      }

      if (idx === current) renderMeta(item);
    }

    dropzone.hidden = true;
    viewer.hidden = false;

    if (current === -1) showItem(0);
    updateCounter();
  }

  function showItem(idx) {
    if (idx < 0 || idx >= items.length) return;
    current = idx;
    const item = items[idx];
    previewImg.src = item.url;
    filenameEl.textContent = item.file.name;
    renderMeta(item);
    updateCounter();

    Array.from(filmstrip.children).forEach((el, i) => {
      el.classList.toggle('active', i === idx);
    });
    const activeThumb = filmstrip.children[idx];
    if (activeThumb) activeThumb.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }

  function renderMeta(item) {
    iptcTable.innerHTML = '';
    const iptc = item.iptc;
    const HIDDEN_KEYS = new Set(['ApplicationRecordVersion']);
    const keys = iptc
      ? Object.keys(iptc).filter(k => !HIDDEN_KEYS.has(k) && iptc[k] !== undefined && iptc[k] !== null && iptc[k] !== '')
      : [];

    if (!keys.length) {
      noIptc.hidden = false;
      return;
    }
    noIptc.hidden = true;

    keys.sort().forEach(key => {
      const tr = document.createElement('tr');
      const tdKey = document.createElement('td');
      tdKey.className = 'key';
      tdKey.textContent = humanKey(key);
      const tdVal = document.createElement('td');
      tdVal.className = 'val';
      tdVal.textContent = formatValue(iptc[key]);
      tr.appendChild(tdKey);
      tr.appendChild(tdVal);
      iptcTable.appendChild(tr);
    });
  }

  function updateCounter() {
    counter.textContent = items.length ? `${current + 1} / ${items.length}` : '';
    btnPrev.disabled = current <= 0;
    btnNext.disabled = current >= items.length - 1;
  }

  function closeAll() {
    items.forEach(it => URL.revokeObjectURL(it.url));
    items = [];
    current = -1;
    filmstrip.innerHTML = '';
    iptcTable.innerHTML = '';
    previewImg.src = '';
    filenameEl.textContent = '';
    viewer.hidden = true;
    dropzone.hidden = false;
    fileInput.value = '';
    folderInput.value = '';
  }

  // Drag & drop
  ['dragenter', 'dragover'].forEach(evt =>
    dropzone.addEventListener(evt, e => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    })
  );
  ['dragleave', 'drop'].forEach(evt =>
    dropzone.addEventListener(evt, e => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    })
  );
  dropzone.addEventListener('drop', async e => {
    const files = await getFilesFromDataTransfer(e.dataTransfer);
    addFiles(files);
  });
  btnPickFiles.addEventListener('click', () => fileInput.click());
  btnPickFolder.addEventListener('click', () => folderInput.click());
  fileInput.addEventListener('change', () => addFiles(fileInput.files));
  folderInput.addEventListener('change', () => addFiles(folderInput.files));

  // Allow dropping more images (or folders) directly onto the viewer too,
  // with the same visual feedback as the initial dropzone. A counter tracks
  // nested dragenter/dragleave pairs (which fire per child element) so the
  // highlight doesn't flicker while the pointer moves over the viewer's
  // internal elements (preview, filmstrip thumbnails, etc.).
  let viewerDragDepth = 0;
  viewer.addEventListener('dragenter', e => {
    e.preventDefault();
    viewerDragDepth++;
    viewer.classList.add('dragover');
  });
  viewer.addEventListener('dragover', e => e.preventDefault());
  viewer.addEventListener('dragleave', e => {
    e.preventDefault();
    viewerDragDepth = Math.max(0, viewerDragDepth - 1);
    if (viewerDragDepth === 0) viewer.classList.remove('dragover');
  });
  viewer.addEventListener('drop', async e => {
    e.preventDefault();
    viewerDragDepth = 0;
    viewer.classList.remove('dragover');
    const files = await getFilesFromDataTransfer(e.dataTransfer);
    addFiles(files);
  });

  btnAdd.addEventListener('click', () => fileInput.click());
  btnAddFolder.addEventListener('click', () => folderInput.click());
  btnPrev.addEventListener('click', () => showItem(current - 1));
  btnNext.addEventListener('click', () => showItem(current + 1));
  btnClose.addEventListener('click', closeAll);

  document.addEventListener('keydown', e => {
    if (viewer.hidden) return;
    if (e.key === 'ArrowLeft') showItem(current - 1);
    if (e.key === 'ArrowRight') showItem(current + 1);
  });
})();
