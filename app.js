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
  const btnCompare = document.getElementById('btnCompare');

  // Comparison view
  const compareView = document.getElementById('compareView');
  const btnCloseCompare = document.getElementById('btnCloseCompare');
  const selectA = document.getElementById('selectA');
  const selectB = document.getElementById('selectB');
  const thumbA = document.getElementById('thumbA');
  const thumbB = document.getElementById('thumbB');
  const headA = document.getElementById('headA');
  const headB = document.getElementById('headB');
  const compareTableBody = document.querySelector('#compareTable tbody');
  const compareEmpty = document.getElementById('compareEmpty');
  const onlyDiff = document.getElementById('onlyDiff');

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

  // Internal IPTC fields that carry no user-facing meaning.
  const HIDDEN_KEYS = new Set(['ApplicationRecordVersion']);

  function humanKey(key) {
    return IPTC_LABELS[key] || key;
  }

  function formatValue(val) {
    if (Array.isArray(val)) return val.join(', ');
    if (val instanceof Date) return val.toLocaleString();
    if (val && typeof val === 'object') return JSON.stringify(val);
    return String(val);
  }

  // exifr decodes IPTC strings as Latin-1, so UTF-8 bytes come through as
  // mojibake (e.g. "©" -> "Â©"). Re-interpret each Latin-1 string as UTF-8
  // when its bytes form a valid UTF-8 sequence; otherwise leave it untouched
  // so genuine Latin-1 text is preserved.
  const utf8Decoder = typeof TextDecoder !== 'undefined'
    ? new TextDecoder('utf-8', { fatal: true })
    : null;

  function fixUtf8(str) {
    if (typeof str !== 'string' || !utf8Decoder) return str;
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code > 255) return str; // already proper Unicode, not a byte-string
      bytes[i] = code;
    }
    try {
      return utf8Decoder.decode(bytes);
    } catch (e) {
      return str; // invalid UTF-8 -> genuine Latin-1, keep as-is
    }
  }

  function fixIptcEncoding(iptc) {
    if (!iptc || typeof iptc !== 'object') return iptc;
    const out = {};
    for (const key of Object.keys(iptc)) {
      const val = iptc[key];
      if (Array.isArray(val)) {
        out[key] = val.map(v => (typeof v === 'string' ? fixUtf8(v) : v));
      } else if (typeof val === 'string') {
        out[key] = fixUtf8(val);
      } else {
        out[key] = val;
      }
    }
    return out;
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
        item.iptc = fixIptcEncoding((output && output.iptc) || null);
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
    if (!compareView.hidden) refreshCompareSelectors();
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
    btnCompare.disabled = items.length < 2;
  }

  function closeAll() {
    items.forEach(it => URL.revokeObjectURL(it.url));
    items = [];
    current = -1;
    filmstrip.innerHTML = '';
    iptcTable.innerHTML = '';
    previewImg.src = '';
    filenameEl.textContent = '';
    compareView.hidden = true;
    viewer.hidden = true;
    dropzone.hidden = false;
    fileInput.value = '';
    folderInput.value = '';
  }

  /* ---------- Comparison ---------- */

  function iptcKeysOf(item) {
    const iptc = item && item.iptc;
    if (!iptc) return [];
    return Object.keys(iptc).filter(k =>
      !HIDDEN_KEYS.has(k) && iptc[k] !== undefined && iptc[k] !== null && iptc[k] !== ''
    );
  }

  function populateSelect(select, selectedIdx) {
    select.innerHTML = '';
    items.forEach((item, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = `${i + 1}. ${item.file.name}`;
      if (i === selectedIdx) opt.selected = true;
      select.appendChild(opt);
    });
  }

  // Rebuilds both selectors while preserving the current choices (used when
  // images are added while the comparison view is open).
  function refreshCompareSelectors() {
    if (items.length < 2) {
      closeCompare();
      return;
    }
    const a = Math.min(parseInt(selectA.value, 10) || 0, items.length - 1);
    let b = Math.min(parseInt(selectB.value, 10) || 1, items.length - 1);
    if (b === a) b = a === 0 ? 1 : 0;
    populateSelect(selectA, a);
    populateSelect(selectB, b);
    renderComparison();
  }

  function openCompare() {
    if (items.length < 2) return;
    const a = current >= 0 ? current : 0;
    let b = a + 1 < items.length ? a + 1 : 0;
    if (b === a) b = a === 0 ? 1 : 0;
    populateSelect(selectA, a);
    populateSelect(selectB, b);
    viewer.hidden = true;
    compareView.hidden = false;
    renderComparison();
  }

  function closeCompare() {
    compareView.hidden = true;
    viewer.hidden = false;
  }

  function renderComparison() {
    const ia = parseInt(selectA.value, 10);
    const ib = parseInt(selectB.value, 10);
    const itemA = items[ia];
    const itemB = items[ib];
    if (!itemA || !itemB) return;

    thumbA.src = itemA.url;
    thumbB.src = itemB.url;
    headA.textContent = itemA.file.name;
    headB.textContent = itemB.file.name;

    const iptcA = itemA.iptc || {};
    const iptcB = itemB.iptc || {};
    const keysA = new Set(iptcKeysOf(itemA));
    const keysB = new Set(iptcKeysOf(itemB));
    const keys = Array.from(new Set([...keysA, ...keysB])).sort();

    compareTableBody.innerHTML = '';

    if (!keys.length) {
      compareEmpty.hidden = false;
      compareEmpty.textContent = 'Aucune donnée IPTC dans ces deux photos.';
      return;
    }
    compareEmpty.hidden = true;

    const showOnlyDiff = onlyDiff.checked;
    let shownRows = 0;

    keys.forEach(key => {
      const hasA = keysA.has(key);
      const hasB = keysB.has(key);
      const valA = hasA ? formatValue(iptcA[key]) : null;
      const valB = hasB ? formatValue(iptcB[key]) : null;

      let cls;
      if (!hasA || !hasB) cls = 'only';
      else if (valA !== valB) cls = 'diff';
      else cls = 'same';

      if (showOnlyDiff && cls === 'same') return;
      shownRows++;

      const tr = document.createElement('tr');
      tr.className = cls;

      const tdField = document.createElement('td');
      tdField.className = 'field';
      tdField.textContent = humanKey(key);

      const tdA = document.createElement('td');
      if (valA === null) { tdA.className = 'absent'; tdA.textContent = '— absent —'; }
      else tdA.textContent = valA;

      const tdB = document.createElement('td');
      if (valB === null) { tdB.className = 'absent'; tdB.textContent = '— absent —'; }
      else tdB.textContent = valB;

      tr.appendChild(tdField);
      tr.appendChild(tdA);
      tr.appendChild(tdB);
      compareTableBody.appendChild(tr);
    });

    if (showOnlyDiff && shownRows === 0) {
      compareEmpty.hidden = false;
      compareEmpty.textContent = 'Aucune différence : les champs IPTC de ces deux photos sont identiques.';
    }
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

  // Comparison view wiring
  btnCompare.addEventListener('click', openCompare);
  btnCloseCompare.addEventListener('click', closeCompare);
  selectA.addEventListener('change', renderComparison);
  selectB.addEventListener('change', renderComparison);
  onlyDiff.addEventListener('change', renderComparison);

  document.addEventListener('keydown', e => {
    if (!compareView.hidden && e.key === 'Escape') { closeCompare(); return; }
    if (viewer.hidden) return;
    if (e.key === 'ArrowLeft') showItem(current - 1);
    if (e.key === 'ArrowRight') showItem(current + 1);
  });
})();
