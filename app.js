(function () {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
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

  async function addFiles(fileList) {
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
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
  dropzone.addEventListener('drop', e => addFiles(e.dataTransfer.files));
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => addFiles(fileInput.files));

  // Allow dropping more images directly onto the viewer too
  viewer.addEventListener('dragover', e => e.preventDefault());
  viewer.addEventListener('drop', e => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  });

  btnAdd.addEventListener('click', () => fileInput.click());
  btnPrev.addEventListener('click', () => showItem(current - 1));
  btnNext.addEventListener('click', () => showItem(current + 1));
  btnClose.addEventListener('click', closeAll);

  document.addEventListener('keydown', e => {
    if (viewer.hidden) return;
    if (e.key === 'ArrowLeft') showItem(current - 1);
    if (e.key === 'ArrowRight') showItem(current + 1);
  });
})();
