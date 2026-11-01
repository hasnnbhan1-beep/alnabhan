/* خادم السحابة (Supabase Edge) */
const API_BASE = 'https://kpzjtykobrdskomwwocv.supabase.co/functions/v1/nabhan';
/* =========================================================
   النبهان — لوحة تحكم المالك
   ========================================================= */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  let TOKEN = null;
  try {
    TOKEN = localStorage.getItem('nabhan_admin_token');
  } catch {
    TOKEN = null;
  }

  const state = {
    products: [],
    categories: [],
    settings: null,
    editing: null,
    images: [],
    colors: [],
    video: '',
    videoUrl: '',
    tab: 'products',
  };

  /* ----------------------- أدوات ----------------------- */
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  const catName = (id) => (state.categories.find((c) => c.id === id) || {}).name || '—';
  const PLACEHOLDER =
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100"><rect width="80" height="100" fill="#ece2d2"/><text x="40" y="54" font-size="10" fill="#b0a189" text-anchor="middle" font-family="sans-serif">لا صورة</text></svg>`
    );

  function money(v) {
    const c = (state.settings && state.settings.currency) || { symbol: '$', position: 'before' };
    const n = Number(v || 0).toLocaleString('en-US');
    return c.position === 'after' ? `${n} ${c.symbol}` : `${c.symbol}${n}`;
  }

  function toast(msg, bad) {
    const el = $('#toast');
    el.textContent = msg;
    el.style.background = bad ? '#b23b3b' : '';
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.hidden = true), 3000);
  }

  function setToken(t) {
    TOKEN = t;
    try {
      if (t) localStorage.setItem('nabhan_admin_token', t);
      else localStorage.removeItem('nabhan_admin_token');
    } catch {}
  }

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(API_BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try {
      data = await res.json();
    } catch {}
    if (res.status === 401 && path !== '/api/admin/login') {
      setToken(null);
      showLogin();
      throw new Error('انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى.');
    }
    if (!res.ok) throw new Error(data.error || 'حدث خطأ في الطلب');
    return data;
  }

  /* ----------------------- تسجيل الدخول ----------------------- */
  function showLogin() {
    $('#loginScreen').hidden = false;
    $('#app').hidden = true;
  }
  function showApp() {
    $('#loginScreen').hidden = true;
    $('#app').hidden = false;
  }

  $('#togglePass').addEventListener('click', () => {
    const inp = $('#password');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#loginBtn');
    const err = $('#loginError');
    err.hidden = true;
    btn.classList.add('busy');
    btn.textContent = 'جارٍ الدخول…';
    try {
      const data = await api('/api/admin/login', {
        method: 'POST',
        body: { password: $('#password').value },
      });
      setToken(data.token);
      showApp();
      await loadAll();
      initShareBox();
      switchTab('dashboard');
      if (data.mustChangePassword)
        setTimeout(() => toast('تنبيه: ما زلت تستخدم كلمة المرور الافتراضية — غيّرها من تبويب «الأمان».'), 900);
    } catch (e2) {
      err.textContent = e2.message;
      err.hidden = false;
    } finally {
      btn.classList.remove('busy');
      btn.textContent = 'دخول';
    }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    try {
      await api('/api/admin/logout', { method: 'POST' });
    } catch {}
    setToken(null);
    $('#password').value = '';
    showLogin();
  });

  /* ----------------------- تبويبات ----------------------- */
  const TAB_META = {
    dashboard: ['النظرة العامة', 'ملخّص متجرك بنظرة واحدة'],
    products: ['المنتجات', 'أضف وعدّل منتجاتك بصور وفيديو وسعر'],
    categories: ['الأقسام', 'نظّم منتجاتك ضمن أقسام واضحة'],
    settings: ['إعدادات المتجر', 'الهوية، واتساب، العملة، والواجهة'],
    security: ['الأمان', 'كلمة مرور المالك'],
  };

  $$('.side-link').forEach((btn) =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab))
  );

  function switchTab(tab) {
    state.tab = tab;
    $$('.side-link').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $$('.tab-panel').forEach((p) => (p.hidden = p.id !== 'tab-' + tab));
    const [title, sub] = TAB_META[tab];
    $('#pageTitle').textContent = title;
    $('#pageSub').textContent = sub;
    if (tab === 'settings') fillSettings();
    if (tab === 'categories') renderCats();
    if (tab === 'dashboard') renderDashboard();
  }

  /* ----------------------- تحميل البيانات ----------------------- */
  async function loadAll() {
    const data = await api('/api/admin/data');
    state.settings = data.settings;
    state.categories = data.categories || [];
    state.products = data.products || [];
    $('#navProdCount').textContent = state.products.length;
    $('#waChip').textContent = 'واتساب: ' + (state.settings.phoneDisplay || state.settings.whatsapp);
    buildCategorySelects();
    renderProducts();
    renderCats();
    fillSettings();
    renderDashboard();
    initShareBox();
  }

  function buildCategorySelects() {
    const opts = state.categories
      .map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`)
      .join('');
    $('#adminCatFilter').innerHTML = `<option value="all">كل الأقسام</option>` + opts;
    $('#prodCategory').innerHTML = opts;
  }

  /* ----------------------- النظرة العامة ----------------------- */
  function renderDashboard() {
    const ps = state.products;
    const total = ps.length;
    const out = ps.filter((p) => p.inStock === false).length;
    const featured = ps.filter((p) => p.featured).length;
    const noMedia = ps.filter((p) => !(p.images && p.images.length) && !p.video).length;
    const withVideo = ps.filter((p) => p.video || p.videoUrl).length;
    const avg = total ? Math.round(ps.reduce((s2, p) => s2 + Number(p.price || 0), 0) / total) : 0;

    const stats = [
      { label: 'إجمالي المنتجات', value: total, note: `${state.categories.length} أقسام` },
      { label: 'منتجات مميزة', value: featured, note: 'تظهر في المقدمة' },
      { label: 'نفدت الكمية', value: out, note: out ? 'تحتاج تحديثاً' : 'كل شيء متوفر' },
      { label: 'متوسط السعر', value: money(avg), note: 'حسب الأسعار الحالية' },
    ];
    $('#statsGrid').innerHTML = stats
      .map(
        (s2) => `<div class="stat">
          <p class="stat-label">${esc(s2.label)}</p>
          <p class="stat-value">${esc(String(s2.value))}</p>
          <p class="stat-note">${esc(s2.note)}</p>
        </div>`
      )
      .join('');

    const recent = ps.slice(0, 4);
    $('#recentProducts').innerHTML = recent.length
      ? recent
          .map(
            (p) => `<div class="recent-item">
              <img src="${esc((p.images && p.images[0]) || PLACEHOLDER)}" alt="" />
              <div>
                <div class="recent-name">${esc(p.name)}</div>
                <div class="recent-meta">${esc(catName(p.category))}${p.code ? ' • ' + esc(p.code) : ''}</div>
              </div>
              <div class="recent-price">${money(p.price)}</div>
            </div>`
          )
          .join('')
      : '<p class="table-empty">لا منتجات بعد</p>';

    const st = state.settings || {};
    const rows = [
      ['رقم واتساب', `<b dir="ltr">+${esc(st.whatsapp || '')}</b>`],
      ['العملة', `<b>${esc((st.currency || {}).symbol || '')}</b>`],
      ['منتجات بدون صور', noMedia ? `<b class="badge-warn">${noMedia}</b>` : '<b class="badge-ok">0 ✓</b>'],
      ['منتجات مع فيديو', `<b>${withVideo}</b>`],
      ['كلمة المرور', st.passwordChanged ? '<b class="badge-ok">مخصّصة ✓</b>' : '<b class="badge-warn">افتراضية</b>'],
      ['حالة المتجر', '<b class="badge-ok">يعمل ✓</b>'],
    ];
    $('#statusList').innerHTML = rows
      .map(([k, v]) => `<li><span>${k}</span><span>${v}</span></li>`)
      .join('');
  }

  function initShareBox() {
    const input = $('#storeUrl');
    if (!input) return;
    input.value = location.origin + location.pathname.replace(/admin(\.html)?$/, '');
    const btn = $('#copyUrl');
    btn?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(input.value);
        toast('تم نسخ رابط المتجر ✓');
      } catch {
        input.select();
        document.execCommand('copy');
        toast('تم نسخ الرابط ✓');
      }
    });
  }

  /* ----------------------- جدول المنتجات ----------------------- */
  function filteredProducts() {
    const q = $('#adminSearch').value.trim().toLowerCase();
    const cat = $('#adminCatFilter').value;
    return state.products.filter((p) => {
      if (cat !== 'all' && p.category !== cat) return false;
      if (!q) return true;
      return (
        (p.name || '').toLowerCase().includes(q) ||
        (p.code || '').toLowerCase().includes(q)
      );
    });
  }

  function renderProducts() {
    const list = filteredProducts();
    $('#productsEmpty').hidden = list.length > 0;
    $('#navProdCount').textContent = state.products.length;

    $('#productsBody').innerHTML = list
      .map((p) => {
        const img = (p.images && p.images[0]) || PLACEHOLDER;
        const media = [];
        if (p.images && p.images.length) media.push(`<span class="icon-tag">🖼 ${p.images.length}</span>`);
        if (p.video || p.videoUrl) media.push(`<span class="icon-tag">▶ فيديو</span>`);
        return `<tr data-id="${esc(p.id)}">
          <td>
            <div class="prod-cell">
              <img src="${esc(img)}" alt="" />
              <div>
                <div class="prod-name">${esc(p.name)}${p.badge ? `<span class="mini-tag">${esc(p.badge)}</span>` : ''}</div>
                <div class="prod-code">${esc(p.code || '—')}</div>
              </div>
            </div>
          </td>
          <td>${esc(catName(p.category))}</td>
          <td>
            <b>${money(p.price)}</b>
            ${p.oldPrice > p.price ? `<div class="prod-code"><s>${money(p.oldPrice)}</s></div>` : ''}
          </td>
          <td><div class="media-icons">${media.join('') || '<span class="prod-code">—</span>'}</div></td>
          <td>
            <label class="switch">
              <input type="checkbox" data-toggle="stock" ${p.inStock !== false ? 'checked' : ''} />
              <span></span>
            </label>
          </td>
          <td>
            <label class="switch">
              <input type="checkbox" data-toggle="featured" ${p.featured ? 'checked' : ''} />
              <span></span>
            </label>
          </td>
          <td>
            <div class="row-actions">
              <button class="icon-action" data-edit="${esc(p.id)}" title="تعديل">✎</button>
              <button class="icon-action del" data-del="${esc(p.id)}" title="حذف">🗑</button>
            </div>
          </td>
        </tr>`;
      })
      .join('');

    $$('[data-edit]').forEach((b) => b.addEventListener('click', () => openEditor(b.dataset.edit)));
    $$('[data-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        const p = state.products.find((x) => x.id === b.dataset.del);
        if (!p) return;
        if (!confirm(`حذف المنتج «${p.name}» نهائياً؟`)) return;
        try {
          await api('/api/admin/products/' + p.id, { method: 'DELETE' });
          state.products = state.products.filter((x) => x.id !== p.id);
          renderProducts();
          toast('تم حذف المنتج');
        } catch (e) {
          toast(e.message, true);
        }
      })
    );
    $$('[data-toggle]').forEach((chk) =>
      chk.addEventListener('change', async () => {
        const row = chk.closest('tr');
        const id = row.dataset.id;
        const field = chk.dataset.toggle === 'stock' ? 'inStock' : 'featured';
        try {
          const { product } = await api('/api/admin/products/' + id, {
            method: 'PUT',
            body: { [field]: chk.checked },
          });
          const idx = state.products.findIndex((p) => p.id === id);
          if (idx > -1) state.products[idx] = product;
          toast('تم التحديث');
        } catch (e) {
          chk.checked = !chk.checked;
          toast(e.message, true);
        }
      })
    );
  }

  $('#adminSearch').addEventListener('input', renderProducts);
  $('#adminCatFilter').addEventListener('change', renderProducts);
  $('#newProductBtn').addEventListener('click', () => openEditor(null));
  $('#dashAddProduct')?.addEventListener('click', () => openEditor(null));

  /* ----------------------- محرّر المنتج ----------------------- */
  function openEditor(id) {
    const p = id ? state.products.find((x) => x.id === id) : null;
    state.editing = p;
    state.images = p ? (p.images || []).slice() : [];
    state.colors = p ? (p.colors || []).map((c) => ({ ...c })) : [];
    state.video = p ? p.video || '' : '';
    state.videoUrl = p ? p.videoUrl || '' : '';

    const f = $('#productForm');
    f.reset();
    $('#editorTitle').textContent = p ? 'تعديل المنتج' : 'منتج جديد';
    f.id.value = p ? p.id : '';
    if (p) {
      f.name.value = p.name || '';
      f.category.value = p.category || (state.categories[0] || {}).id || '';
      f.code.value = p.code || '';
      f.price.value = p.price ?? '';
      f.oldPrice.value = p.oldPrice || '';
      f.badge.value = p.badge || '';
      f.description.value = p.description || '';
      f.sizes.value = (p.sizes || []).join(', ');
      f.inStock.checked = p.inStock !== false;
      f.featured.checked = !!p.featured;
    } else {
      f.category.value = (state.categories[0] || {}).id || '';
      f.inStock.checked = true;
    }
    renderImages();
    renderColors();
    renderVideo();
    $('#editor').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeEditor() {
    $('#editor').hidden = true;
    document.body.style.overflow = '';
  }
  $('#editorClose').addEventListener('click', closeEditor);
  $('#cancelEdit').addEventListener('click', closeEditor);
  $('#editor').addEventListener('click', (e) => {
    if (e.target.dataset.close !== undefined) closeEditor();
  });

  function renderImages() {
    $('#imagesGrid').innerHTML = state.images
      .map(
        (src, i) => `<div class="media-thumb">
          <img src="${esc(src)}" alt="" />
          ${i === 0 ? '<span class="main-tag">رئيسية</span>' : ''}
          <button type="button" class="rm" data-rmimg="${i}" title="حذف">✕</button>
        </div>`
      )
      .join('');
    $$('[data-rmimg]').forEach((b) =>
      b.addEventListener('click', () => {
        state.images.splice(Number(b.dataset.rmimg), 1);
        renderImages();
      })
    );
  }

  function renderColors() {
    $('#colorsList').innerHTML = state.colors
      .map(
        (c, i) => `<span class="color-chip">
          <i style="background:${esc(c.hex)}"></i>${esc(c.name)}
          <button type="button" data-rmcolor="${i}">✕</button>
        </span>`
      )
      .join('');
    $$('[data-rmcolor]').forEach((b) =>
      b.addEventListener('click', () => {
        state.colors.splice(Number(b.dataset.rmcolor), 1);
        renderColors();
      })
    );
  }

  $('#addColorBtn').addEventListener('click', () => {
    const name = $('#colorName').value.trim();
    if (!name) return toast('أدخل اسم اللون', true);
    state.colors.push({ name, hex: $('#colorHex').value });
    $('#colorName').value = '';
    renderColors();
  });

  function renderVideo() {
    const parts = [];
    if (state.video)
      parts.push(`<span class="video-chip">
        <video src="${esc(state.video)}" class="video-preview" muted></video>
        فيديو مرفوع
        <button type="button" id="rmVideo">حذف</button>
      </span>`);
    if (state.videoUrl)
      parts.push(`<span class="video-chip">🔗 ${esc(state.videoUrl.slice(0, 40))}…
        <button type="button" id="rmVideoUrl">حذف</button></span>`);
    if (!parts.length) parts.push('<span class="field-hint">لا يوجد فيديو بعد — يمكنك رفع ملف MP4 أو إضافة رابط.</span>');
    $('#videoRow').innerHTML = parts.join('');
    const a = $('#rmVideo');
    if (a) a.addEventListener('click', () => { state.video = ''; renderVideo(); });
    const b = $('#rmVideoUrl');
    if (b) b.addEventListener('click', () => { state.videoUrl = ''; renderVideo(); });
  }

  $('#addVideoUrl').addEventListener('click', () => {
    const v = $('#videoUrlInput').value.trim();
    if (!v) return;
    state.videoUrl = v;
    $('#videoUrlInput').value = '';
    renderVideo();
  });

  $('#addImageUrl').addEventListener('click', () => {
    const v = $('#imageUrlInput').value.trim();
    if (!v) return;
    state.images.push(v);
    $('#imageUrlInput').value = '';
    renderImages();
  });

  /* ---------- ضغط الصور ورفعها ---------- */
  function compressImage(file, maxSide = 1600, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width: w, height: h } = img;
          const scale = Math.min(1, maxSide / Math.max(w, h));
          w = Math.round(w * scale);
          h = Math.round(h * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => reject(new Error('صورة غير صالحة'));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error('تعذّر قراءة الملف'));
      reader.readAsDataURL(file);
    });
  }

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('تعذّر قراءة الملف'));
      r.readAsDataURL(file);
    });
  }

  $('#imagesInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const btn = $('#imagesInput').closest('.upload-btn');
    btn.classList.add('busy');
    toast(`جارٍ رفع ${files.length} صورة…`);
    try {
      for (const file of files) {
        const dataUrl = await compressImage(file);
        const { urls } = await api('/api/admin/upload', {
          method: 'POST',
          body: { dataUrl, name: file.name },
        });
        state.images.push(urls[0]);
        renderImages();
      }
      toast('تم رفع الصور ✓');
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.classList.remove('busy');
    }
  });

  $('#videoInput').addEventListener('change', async (e) => {
    const file = (e.target.files || [])[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 60 * 1024 * 1024) return toast('حجم الفيديو أكبر من 60 ميغابايت', true);
    const btn = $('#videoInput').closest('.upload-btn');
    btn.classList.add('busy');
    toast('جارٍ رفع الفيديو… قد يستغرق قليلاً');
    try {
      const dataUrl = await readAsDataURL(file);
      const { urls } = await api('/api/admin/upload', {
        method: 'POST',
        body: { dataUrl, name: file.name },
      });
      state.video = urls[0];
      renderVideo();
      toast('تم رفع الفيديو ✓');
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.classList.remove('busy');
    }
  });

  /* ---------- حفظ المنتج ---------- */
  $('#saveProduct').addEventListener('click', async () => {
    const f = $('#productForm');
    if (!f.name.value.trim()) return toast('اسم المنتج مطلوب', true);
    if (f.price.value === '') return toast('السعر مطلوب', true);
    if (!f.category.value) return toast('اختر القسم', true);
    if (!state.images.length && !state.video) {
      if (!confirm('لم تضف أي صورة أو فيديو لهذا المنتج. المتابعة بدون وسائط؟')) return;
    }

    const payload = {
      name: f.name.value.trim(),
      category: f.category.value,
      code: f.code.value.trim(),
      price: Number(f.price.value),
      oldPrice: Number(f.oldPrice.value || 0),
      badge: f.badge.value.trim(),
      description: f.description.value.trim(),
      images: state.images,
      video: state.video,
      videoUrl: state.videoUrl,
      sizes: f.sizes.value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      colors: state.colors,
      inStock: f.inStock.checked,
      featured: f.featured.checked,
    };

    const btn = $('#saveProduct');
    btn.classList.add('busy');
    try {
      if (state.editing) {
        const { product } = await api('/api/admin/products/' + state.editing.id, {
          method: 'PUT',
          body: payload,
        });
        const idx = state.products.findIndex((p) => p.id === product.id);
        if (idx > -1) state.products[idx] = product;
      } else {
        const { product } = await api('/api/admin/products', { method: 'POST', body: payload });
        state.products.unshift(product);
      }
      renderProducts();
      closeEditor();
      toast('تم حفظ المنتج ✓');
    } catch (e) {
      toast(e.message, true);
    } finally {
      btn.classList.remove('busy');
    }
  });

  /* ----------------------- الأقسام ----------------------- */
  function renderCats() {
    $('#catsBody').innerHTML = state.categories
      .map((c) => {
        const count = state.products.filter((p) => p.category === c.id).length;
        return `<tr data-id="${esc(c.id)}">
          <td><b>${esc(c.name)}</b></td>
          <td>${count}</td>
          <td>${c.order || 0}</td>
          <td>
            <div class="row-actions">
              <button class="icon-action" data-rename="${esc(c.id)}" title="تعديل الاسم">✎</button>
              <button class="icon-action del" data-delcat="${esc(c.id)}" title="حذف">🗑</button>
            </div>
          </td>
        </tr>`;
      })
      .join('');

    $$('[data-rename]').forEach((b) =>
      b.addEventListener('click', async () => {
        const c = state.categories.find((x) => x.id === b.dataset.rename);
        const name = prompt('اسم القسم:', c.name);
        if (!name || !name.trim()) return;
        try {
          const { category } = await api('/api/admin/categories/' + c.id, {
            method: 'PUT',
            body: { name: name.trim() },
          });
          Object.assign(c, category);
          renderCats();
          buildCategorySelects();
          toast('تم التحديث');
        } catch (e) {
          toast(e.message, true);
        }
      })
    );
    $$('[data-delcat]').forEach((b) =>
      b.addEventListener('click', async () => {
        const c = state.categories.find((x) => x.id === b.dataset.delcat);
        if (!confirm(`حذف قسم «${c.name}»؟`)) return;
        try {
          await api('/api/admin/categories/' + c.id, { method: 'DELETE' });
          state.categories = state.categories.filter((x) => x.id !== c.id);
          renderCats();
          buildCategorySelects();
          toast('تم حذف القسم');
        } catch (e) {
          toast(e.message, true);
        }
      })
    );
  }

  $('#addCatBtn').addEventListener('click', async () => {
    const name = $('#newCatName').value.trim();
    if (!name) return toast('أدخل اسم القسم', true);
    try {
      const { category } = await api('/api/admin/categories', {
        method: 'POST',
        body: { name },
      });
      state.categories.push(category);
      $('#newCatName').value = '';
      renderCats();
      buildCategorySelects();
      toast('تمت إضافة القسم ✓');
    } catch (e) {
      toast(e.message, true);
    }
  });

  /* ----------------------- الإعدادات ----------------------- */
  function fillSettings() {
    const s = state.settings;
    if (!s) return;
    const f = $('#settingsForm');
    const set = (name, val) => {
      const el = f.elements[name];
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!val;
      else el.value = val == null ? '' : val;
    };
    set('brandName', s.brandName);
    set('brandLatin', s.brandLatin);
    set('tagline', s.tagline);
    set('whatsapp', s.whatsapp);
    set('phoneDisplay', s.phoneDisplay);
    set('workingHours', s.workingHours);
    set('ownerName', s.ownerName);
    set('announcement', s.announcement);
    set('currencySymbol', s.currency.symbol);
    set('currencyCode', s.currency.code);
    set('currencyPosition', s.currency.position);
    set('secondaryEnabled', s.secondary.enabled);
    set('secondarySymbol', s.secondary.symbol);
    set('secondaryRate', s.secondary.rate);
    set('heroKicker', s.hero.kicker);
    set('heroTitle', s.hero.title);
    set('heroTitleAccent', s.hero.titleAccent);
    set('heroSubtitle', s.hero.subtitle);
    set('heroCta', s.hero.cta);
    set('about', s.about);
    set('deliveryNote', s.deliveryNote);
    set('instagram', (s.social || {}).instagram);
    set('facebook', (s.social || {}).facebook);
    set('tiktok', (s.social || {}).tiktok);
    $('#heroPreview').src = s.hero.image || '';

    $('#featuresEditor').innerHTML = [0, 1, 2, 3]
      .map((i) => {
        const ftr = (s.features || [])[i] || { title: '', text: '' };
        return `<div class="feature-row">
          <input data-feat-title="${i}" placeholder="عنوان الميزة" value="${esc(ftr.title)}" />
          <input data-feat-text="${i}" placeholder="وصف قصير" value="${esc(ftr.text)}" />
        </div>`;
      })
      .join('');
  }

  $('#settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const g = (n) => f.elements[n].value.trim();
    const features = [0, 1, 2, 3]
      .map((i) => ({
        title: ($(`[data-feat-title="${i}"]`).value || '').trim(),
        text: ($(`[data-feat-text="${i}"]`).value || '').trim(),
      }))
      .filter((x) => x.title);

    const payload = {
      brandName: g('brandName'),
      brandLatin: g('brandLatin'),
      tagline: g('tagline'),
      whatsapp: g('whatsapp'),
      phoneDisplay: g('phoneDisplay'),
      workingHours: g('workingHours'),
      ownerName: g('ownerName'),
      announcement: g('announcement'),
      currency: {
        symbol: g('currencySymbol'),
        code: g('currencyCode'),
        position: f.elements['currencyPosition'].value,
      },
      secondary: {
        enabled: f.elements['secondaryEnabled'].checked,
        symbol: g('secondarySymbol'),
        rate: Number(g('secondaryRate') || 0),
      },
      hero: {
        image: $('#heroPreview').getAttribute('src') || '',
        kicker: g('heroKicker'),
        title: g('heroTitle'),
        titleAccent: g('heroTitleAccent'),
        subtitle: g('heroSubtitle'),
        cta: g('heroCta'),
      },
      about: g('about'),
      deliveryNote: g('deliveryNote'),
      social: { instagram: g('instagram'), facebook: g('facebook'), tiktok: g('tiktok') },
      features,
    };

    const btn = f.querySelector('button[type=submit]');
    btn.classList.add('busy');
    try {
      const res = await api('/api/admin/settings', { method: 'PUT', body: payload });
      state.settings = res.settings;
      $('#waChip').textContent = 'واتساب: ' + (res.settings.phoneDisplay || res.settings.whatsapp);
      $('#saveState').textContent = '✓ تم الحفظ ' + new Date().toLocaleTimeString('ar-EG');
      renderProducts();
      toast('تم حفظ الإعدادات ✓');
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.classList.remove('busy');
    }
  });

  $('#heroUpload').addEventListener('change', async (e) => {
    const file = (e.target.files || [])[0];
    e.target.value = '';
    if (!file) return;
    try {
      toast('جارٍ رفع صورة الواجهة…');
      const dataUrl = await compressImage(file, 2000, 0.86);
      const { urls } = await api('/api/admin/upload', { method: 'POST', body: { dataUrl, name: file.name } });
      $('#heroPreview').src = urls[0];
      toast('تم رفع الصورة — اضغط «حفظ الإعدادات» لتثبيتها');
    } catch (err) {
      toast(err.message, true);
    }
  });

  /* ----------------------- كلمة المرور ----------------------- */
  $('#passForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.next.value !== f.confirm.value) return toast('كلمتا المرور غير متطابقتين', true);
    try {
      await api('/api/admin/password', {
        method: 'POST',
        body: { current: f.current.value, next: f.next.value },
      });
      f.reset();
      toast('تم تحديث كلمة المرور — يرجى تسجيل الدخول من جديد');
      setToken(null);
      setTimeout(showLogin, 1200);
    } catch (err) {
      toast(err.message, true);
    }
  });

  /* ----------------------- البدء ----------------------- */
  (async function init() {
    if (!TOKEN) return showLogin();
    try {
      const s = await api('/api/admin/session');
      if (!s.ok) return showLogin();
      showApp();
      await loadAll();
      initShareBox();
      switchTab('dashboard');
    } catch {
      showLogin();
    }
  })();
})();
