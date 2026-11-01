/* خادم السحابة (Supabase Edge) */
const API_BASE = 'https://kpzjtykobrdskomwwocv.supabase.co/functions/v1/nabhan';
/* =========================================================
   النبهان — منطق واجهة المتجر
   ========================================================= */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const PLACEHOLDER =
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><rect width="300" height="400" fill="#ece2d2"/><g fill="none" stroke="#c4b49a" stroke-width="1"><circle cx="150" cy="170" r="46"/><path d="M104 170h92M150 124v92"/></g><text x="150" y="270" font-family="sans-serif" font-size="13" fill="#a99a82" text-anchor="middle">النبهان</text></svg>`
    );

  const state = {
    settings: null,
    categories: [],
    products: [],
    filter: 'all',
    search: '',
    sort: 'new',
    cart: loadCart(),
    current: null,
    selected: { size: null, color: null, qty: 1, media: 0 },
  };

  /* ----------------------- التخزين المحلي ----------------------- */
  function loadCart() {
    try {
      return JSON.parse(localStorage.getItem('nabhan_cart') || '[]');
    } catch {
      return [];
    }
  }
  function saveCart() {
    try {
      localStorage.setItem('nabhan_cart', JSON.stringify(state.cart));
    } catch {
      /* الوضع المحمي */
    }
  }

  /* ----------------------- أدوات ----------------------- */
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );

  function money(v) {
    const s = state.settings || {};
    const cur = s.currency || { symbol: '$', position: 'before' };
    const num = Number(v || 0);
    const numStr = num % 1 === 0 ? num.toLocaleString('en-US') : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const main = cur.position === 'after' ? `${numStr} ${cur.symbol}` : `${cur.symbol}${numStr}`;
    const sec = s.secondary;
    if (sec && sec.enabled && sec.rate > 0) {
      const conv = Math.round(num * sec.rate).toLocaleString('en-US');
      return `${main} <span class="price-sub">≈ ${conv} ${esc(sec.symbol)}</span>`;
    }
    return main;
  }

  const plainMoney = (v) => {
    const s = state.settings || {};
    const cur = s.currency || { symbol: '$', position: 'before' };
    const numStr = Number(v || 0).toLocaleString('en-US');
    return cur.position === 'after' ? `${numStr} ${cur.symbol}` : `${cur.symbol}${numStr}`;
  };

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.hidden = true), 2600);
  }

  const catName = (id) => (state.categories.find((c) => c.id === id) || {}).name || 'منتجات';
  const productById = (id) => state.products.find((p) => p.id === id);
  const firstImage = (p) => (p.images && p.images[0]) || (p.video ? null : PLACEHOLDER);

  function waLink(text) {
    const num = (state.settings && state.settings.whatsapp) || '';
    return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
  }
  function waBase() {
    const s = state.settings;
    return `https://wa.me/${s.whatsapp}?text=${encodeURIComponent(
      'مرحباً متجر النبهان 👋\nأرغب بالاستفسار عن منتجاتكم.'
    )}`;
  }

  /* ----------------------- جلب البيانات ----------------------- */
  async function boot() {
    try {
      const [storeRes, prodRes] = await Promise.all([fetch(API_BASE + '/api/store'), fetch(API_BASE + '/api/products')]);
      const storeData = await storeRes.json();
      const prodData = await prodRes.json();
      state.settings = storeData.settings;
      state.categories = storeData.categories || [];
      state.products = prodData.products || [];
    } catch (e) {
      console.error(e);
      toast('تعذّر تحميل بيانات المتجر');
      document.body.insertAdjacentHTML(
        'afterbegin',
        '<div style="padding:1rem;background:#b23b3b;color:#fff;text-align:center;font-size:.9rem">تعذّر الاتصال بالخادم. تأكد من تشغيل <b>node server.js</b>.</div>'
      );
      return;
    }
    applySettings();
    renderCategories();
    renderChips();
    renderGrid();
    renderCart();
    bindStaticLinks();
    initEffects();
    initPWA();
    initShare();
    handleDeepLink();
    setTimeout(finishBoot, 400);
  }

  /* ----------------------- تطبيق الإعدادات ----------------------- */
  function applySettings() {
    const s = state.settings;
    document.title = `${s.brandName} للألبسة الأوروبية | ${s.tagline}`;
    $('#brandName').textContent = s.brandName;
    $('#brandLatin').textContent = s.brandLatin || '';
    $('#announceText').textContent = s.announcement || '';
    $('#announce').hidden = !s.announcement;
    $('#heroKicker').textContent = s.hero.kicker || '';
    $('#heroTitle').textContent = s.hero.title || '';
    $('#heroAccent').textContent = s.hero.titleAccent || '';
    $('#heroSub').textContent = s.hero.subtitle || '';
    $('#heroCta').textContent = s.hero.cta || 'تسوّق الآن';
    $('#heroImg').src = s.hero.image || '/uploads/hero.jpg';
    $('#aboutText').textContent = s.about || '';
    $('#footerTag').textContent = s.tagline || '';
    $('#footHours').textContent = s.workingHours || '';
    const ownerTxt = s.ownerName || '';
    ['ownerLine', 'ownerLine2'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = ownerTxt;
    });
    const numEl = document.getElementById('footNumber');
    if (numEl) numEl.textContent = s.phoneDisplay || s.whatsapp || '';
    $('#cartNote').textContent = s.deliveryNote || '';
    $('#year').textContent = new Date().getFullYear();

    // شريط الثقة
    $('#featuresGrid').innerHTML = (s.features || [])
      .map((f) => `<div class="feature"><h4>${esc(f.title)}</h4><p>${esc(f.text)}</p></div>`)
      .join('');

    // روابط واتساب
    ['heroWhats', 'aboutWhats', 'bandWhats', 'footWhats', 'waFloat'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.href = waBase();
        el.target = '_blank';
        el.rel = 'noopener';
      }
    });

    // الشبكات الاجتماعية
    const social = s.social || {};
    const links = [
      ['instagram', 'IG', 'إنستغرام'],
      ['facebook', 'FB', 'فيسبوك'],
      ['tiktok', 'TT', 'تيك توك'],
    ].filter(([k]) => social[k]);
    $('#socialLinks').innerHTML = links
      .map(
        ([k, short, label]) =>
          `<a href="${esc(social[k])}" target="_blank" rel="noopener" title="${label}">${short}</a>`
      )
      .join('');
  }

  /* ----------------------- الأقسام ----------------------- */
  function catImage(catId) {
    const p = state.products.find((x) => x.category === catId && x.images && x.images.length);
    return p ? p.images[0] : PLACEHOLDER;
  }

  function renderCategories() {
    // روابط الترويسة
    const nav = $('#mainNav');
    nav.innerHTML =
      `<a href="#products" class="nav-link active" data-cat="all">كل المنتجات</a>` +
      state.categories
        .map((c) => `<a href="#products" class="nav-link" data-cat="${esc(c.id)}">${esc(c.name)}</a>`)
        .join('');

    $('#mobileCats').innerHTML = state.categories
      .map((c) => `<a href="#products" data-cat="${esc(c.id)}">${esc(c.name)}</a>`)
      .join('');

    // بطاقات الأقسام
    $('#catGrid').innerHTML = state.categories
      .slice(0, 4)
      .map((c) => {
        const count = state.products.filter((p) => p.category === c.id).length;
        return `<a href="#products" class="cat-card" data-cat="${esc(c.id)}">
          <img src="${esc(catImage(c.id))}" alt="${esc(c.name)}" loading="lazy" />
          <div class="cat-label"><strong>${esc(c.name)}</strong><span>${count} قطعة</span></div>
        </a>`;
      })
      .join('');

    // تذييل
    $('#footerCats').innerHTML = state.categories
      .map((c) => `<li><a href="#products" data-cat="${esc(c.id)}">${esc(c.name)}</a></li>`)
      .join('');

    // ربط أحداث الأقسام
    $$('[data-cat]').forEach((el) => {
      el.addEventListener('click', (e) => {
        state.filter = el.dataset.cat;
        updateChips();
        renderGrid();
        closeMobileMenu();
        $('#products').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function renderChips() {
    const all = [{ id: 'all', name: 'الكل' }, ...state.categories];
    $('#filterChips').innerHTML = all
      .map(
        (c) => `<button class="chip ${state.filter === c.id ? 'active' : ''}" data-chip="${esc(c.id)}">${esc(c.name)}</button>`
      )
      .join('');
    $$('[data-chip]').forEach((b) =>
      b.addEventListener('click', () => {
        state.filter = b.dataset.chip;
        updateChips();
        renderGrid();
      })
    );
  }

  function updateChips() {
    $$('[data-chip]').forEach((b) => b.classList.toggle('active', b.dataset.chip === state.filter));
    $$('.nav-link').forEach((a) => a.classList.toggle('active', a.dataset.cat === state.filter));
  }

  /* ----------------------- شبكة المنتجات ----------------------- */
  function visibleProducts() {
    let list = state.products.slice();
    if (state.filter !== 'all') list = list.filter((p) => p.category === state.filter);
    if (state.search.trim()) {
      const q = state.search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          (p.name || '').toLowerCase().includes(q) ||
          (p.code || '').toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q) ||
          catName(p.category).toLowerCase().includes(q)
      );
    }
    switch (state.sort) {
      case 'price-asc':
        list.sort((a, b) => a.price - b.price);
        break;
      case 'price-desc':
        list.sort((a, b) => b.price - a.price);
        break;
      case 'name':
        list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar'));
        break;
      default:
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
    return list;
  }

  function renderGrid() {
    const list = visibleProducts();
    $('#emptyState').hidden = list.length > 0;
    $('#productGrid').innerHTML = list
      .map((p, i) => {
        const hasImg = !!(p.images && p.images[0]);
        const img = hasImg ? p.images[0] : PLACEHOLDER;
        const off = p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
        const soldOut = p.inStock === false;
        const media = hasImg
          ? `<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy" />`
          : p.video
          ? `<video src="${esc(p.video)}" muted playsinline preload="metadata"></video>`
          : `<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy" />`;
        return `<article class="pcard reveal" style="transition-delay:${(i % 8) * 60}ms">
          <div class="pcard-inner">
            <div class="pcard-media" data-open="${esc(p.id)}">
              ${p.badge ? `<span class="pcard-badge ${off ? 'sale' : ''}">${esc(p.badge)}</span>` : ''}
              ${off ? `<span class="pcard-off">-${off}%</span>` : ''}
              ${media}
              ${soldOut ? `<span class="pcard-sold">نفدت الكمية</span>` : ''}
              <button class="pcard-share" data-share="${esc(p.id)}" type="button" aria-label="مشاركة ${esc(p.name)}" title="شارك هذا المنتج">
                <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.3 10.8 15.7 6.3M8.3 13.2l7.4 4.5"/></svg>
              </button>
              <span class="pcard-shine"></span>
            </div>
            <div class="pcard-body">
              <p class="pcard-cat">${esc(catName(p.category))}</p>
              <h3 class="pcard-title" data-open="${esc(p.id)}">${esc(p.name)}</h3>
              <div class="pcard-prices">
                <span class="price">${money(p.price)}</span>
                ${p.oldPrice > p.price ? `<span class="price-old">${plainMoney(p.oldPrice)}</span>` : ''}
              </div>
              <button class="pcard-cta" data-quick="${esc(p.id)}" ${soldOut ? 'disabled' : ''}>
                <svg viewBox="0 0 32 32" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M16 3C8.8 3 3 8.8 3 16c0 2.3.6 4.5 1.7 6.4L3 29l6.8-1.8A13 13 0 0 0 16 29c7.2 0 13-5.8 13-13S23.2 3 16 3Zm0 23.6c-2 0-3.9-.5-5.5-1.5l-.4-.2-4 1 1.1-3.9-.3-.4A10.6 10.6 0 1 1 16 26.6Zm5.9-7.9c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.1-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.3-.5-2.5-1.6-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.6c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.2-.7-1.7-.9-2.3-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.3 5.1 4.5 2.5 1 3 .8 3.6.7.5-.1 1.7-.7 1.9-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4Z"/></svg>
                ${soldOut ? 'غير متوفر حالياً' : 'اطلب عبر واتساب'}
              </button>
            </div>
          </div>
        </article>`;
      })
      .join('');

    $$('[data-open]').forEach((el) =>
      el.addEventListener('click', () => openProduct(el.dataset.open))
    );
    // زر المشاركة على البطاقة — يمنع فتح صفحة المنتج
    $$('[data-share]').forEach((el) =>
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const sp = productById(el.dataset.share);
        if (sp) openShare('product', sp);
      })
    );
    $$('[data-quick]').forEach((el) =>
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = productById(el.dataset.quick);
        if (!p) return;
        if (p.inStock === false) return toast('هذا المنتج غير متوفر حالياً');
        directOrder(p);
      })
    );
    observeReveals();
  }

  /* ----------------------- نافذة المنتج ----------------------- */
  function openProduct(id) {
    const p = productById(id);
    if (!p) return;
    state.current = p;
    state.selected = {
      size: (p.sizes && p.sizes[0]) || null,
      color: (p.colors && p.colors[0]) || null,
      qty: 1,
      media: 0,
    };

    state.current = p;
    $('#pdpCat').textContent = catName(p.category) + (p.code ? ' • ' + p.code : '');
    $('#pdpTitle').textContent = p.name;
    $('#pdpPrice').innerHTML = money(p.price);
    $('#pdpOld').innerHTML = p.oldPrice > p.price ? plainMoney(p.oldPrice) : '';
    $('#pdpBadge').hidden = !p.badge;
    $('#pdpBadge').textContent = p.badge || '';
    $('#pdpDesc').textContent = p.description || '';
    $('#pdpQty').value = 1;
    $('#colorName').textContent = state.selected.color ? state.selected.color.name : '';
    $('#sizeBlock').hidden = !(p.sizes && p.sizes.length);
    $('#colorBlock').hidden = !(p.colors && p.colors.length);
    const waLabel = $('#pdpWhatsLabel') || $('#pdpWhats');
    waLabel.textContent = p.inStock === false ? 'اسأل عن التوفر' : 'اطلب الآن عبر واتساب';

    $('#pdpSizes').innerHTML = (p.sizes || [])
      .map(
        (s, i) => `<button class="opt ${i === 0 ? 'active' : ''}" data-size="${esc(s)}">${esc(s)}</button>`
      )
      .join('');
    $$('[data-size]').forEach((b) =>
      b.addEventListener('click', () => {
        state.selected.size = b.dataset.size;
        $$('[data-size]').forEach((x) => x.classList.toggle('active', x === b));
        refreshPdpWhats();
      })
    );

    $('#pdpColors').innerHTML = (p.colors || [])
      .map(
        (c, i) =>
          `<button class="swatch ${i === 0 ? 'active' : ''}" data-color="${esc(c.name)}" style="background:${esc(
            c.hex
          )}" title="${esc(c.name)}" aria-label="${esc(c.name)}"></button>`
      )
      .join('');
    $$('[data-color]').forEach((b) =>
      b.addEventListener('click', () => {
        state.selected.color = p.colors.find((c) => c.name === b.dataset.color);
        $$('[data-color]').forEach((x) => x.classList.toggle('active', x === b));
        refreshPdpWhats();
        $('#colorName').textContent = state.selected.color ? state.selected.color.name : '';
      })
    );

    renderMedia(p, 0);
    refreshPdpWhats();          // رابط واتساب جاهز فوراً (قابل للنسخ)
    show('#productModal');
    try {
      history.replaceState(null, '', '#p/' + p.id);
    } catch {}
  }

  function renderMedia(p, index) {
    const media = [];
    (p.images || []).forEach((src) => media.push({ type: 'img', src }));
    if (p.video) media.push({ type: 'video', src: p.video });
    if (!media.length) media.push({ type: 'img', src: PLACEHOLDER });

    const item = media[index] || media[0];
    const main = $('#pdpMain');
    main.innerHTML =
      item.type === 'video'
        ? `<video src="${esc(item.src)}" controls playsinline preload="metadata"></video>`
        : `<img src="${esc(item.src)}" alt="${esc(p.name)}" />`;

    const thumbs = media
      .map((m, i) => {
        if (m.type === 'video')
          return `<button class="pdp-thumb vid ${i === index ? 'active' : ''}" data-media="${i}">▶ فيديو</button>`;
        return `<button class="pdp-thumb ${i === index ? 'active' : ''}" data-media="${i}"><img src="${esc(
          m.src
        )}" alt="" /></button>`;
      })
      .join('');
    const extLink = p.videoUrl
      ? `<a class="link-btn" href="${esc(p.videoUrl)}" target="_blank" rel="noopener">شاهد الفيديو ↗</a>`
      : '';
    $('#pdpThumbs').innerHTML = thumbs + extLink;
    $$('[data-media]').forEach((b) =>
      b.addEventListener('click', () => renderMedia(p, Number(b.dataset.media)))
    );
  }

  /* ----------------------- رسائل واتساب ----------------------- */
  function line(items) {
    return items.filter((x) => x !== undefined && x !== null).join('\n');
  }

  function orderMessageSingle(p, sel) {
    const s = state.settings;
    const unit = Number(p.price || 0);
    return line([
      'مرحباً متجر النبهان 👋',
      'أرغب بطلب المنتج التالي:',
      '',
      `🛍️ المنتج: ${p.name}`,
      p.code ? `🔖 الرمز: ${p.code}` : '',
      sel.color ? `🎨 اللون: ${sel.color.name}` : '',
      sel.size ? `📏 المقاس: ${sel.size}` : '',
      `🔢 الكمية: ${sel.qty}`,
      `💰 السعر: ${plainMoney(unit)}${sel.qty > 1 ? ` × ${sel.qty} = ${plainMoney(unit * sel.qty)}` : ''}`,
      '',
      p.inStock === false ? '⚠️ ملاحظة: المنتج يظهر غير متوفر — أرجو تأكيد التوفر.' : '',
      `📞 رقم المتجر: ${s.phoneDisplay || ''}`,
    ]);
  }

  function orderMessageCart(items, customer) {
    const s = state.settings;
    const total = items.reduce((sum, it) => sum + it.price * it.qty, 0);
    const rows = items.map(
      (it, i) =>
        `${i + 1}) ${it.name}${it.size ? ` — مقاس ${it.size}` : ''}${it.color ? ` — ${it.color}` : ''} × ${it.qty} = ${plainMoney(
          it.price * it.qty
        )}`
    );
    return line([
      'مرحباً متجر النبهان 👋',
      'أرغب بتأكيد الطلب التالي:',
      '',
      ...rows,
      '',
      `🧾 الإجمالي التقديري: ${plainMoney(total)}`,
      s.deliveryNote ? `🚚 ${s.deliveryNote}` : '',
      '',
      customer && customer.name ? '📋 معلومات التوصيل:' : '',
      customer && customer.name ? `الاسم: ${customer.name}` : '',
      customer && customer.city ? `المدينة: ${customer.city}` : '',
      customer && customer.phone ? `الهاتف: ${customer.phone}` : '',
      customer && customer.address ? `العنوان: ${customer.address}` : '',
      customer && customer.notes ? `ملاحظات: ${customer.notes}` : '',
    ]);
  }

  // رابط واتساب حقيقي (قابل للنسخ والمشاركة) داخل نافذة المنتج
  function refreshPdpWhats() {
    const p = state.current;
    const el = $('#pdpWhats');
    if (!p || !el) return;
    const sel = {
      size: state.selected.size,
      color: state.selected.color,
      qty: Math.max(1, Number($('#pdpQty')?.value || 1)),
    };
    el.href = waLink(orderMessageSingle(p, sel));
  }

  function openWA(url) {
    window.open(url, '_blank', 'noopener');
  }

  function directOrder(p) {
    openWA(waLink(orderMessageSingle(p, { size: (p.sizes || [])[0], color: (p.colors || [])[0], qty: 1 })));
  }

  /* ----------------------- السلة ----------------------- */
  function addToCart(p, sel) {
    const key = [p.id, sel.size, sel.color && sel.color.name].join('|');
    const found = state.cart.find((x) => x.key === key);
    if (found) found.qty = Math.min(20, found.qty + sel.qty);
    else
      state.cart.push({
        key,
        id: p.id,
        name: p.name,
        code: p.code || '',
        price: Number(p.price || 0),
        image: (p.images && p.images[0]) || PLACEHOLDER,
        size: sel.size || '',
        color: sel.color ? sel.color.name : '',
        qty: sel.qty,
      });
    saveCart();
    renderCart();
    toast('تمت الإضافة إلى السلة ✓');
  }

  function renderCart() {
    const items = state.cart;
    const count = items.reduce((s, i) => s + i.qty, 0);
    const badge = $('#cartCount');
    badge.hidden = count === 0;
    badge.textContent = count;
    const dot = $('#appCartDot');
    if (dot) dot.hidden = count === 0;
    const etc = $('.appbar-wa');
    if (etc) setAppbarActive(count ? '' : '');
    $('#cartHeadCount').textContent = count ? `(${count})` : '';
    $('#cartFoot').hidden = count === 0;

    if (!items.length) {
      $('#cartItems').innerHTML = `<div class="cart-empty">
        <svg viewBox="0 0 24 24" width="42" height="42"><path d="M6 7h12l-1.2 12.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 7Z" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M9 7V5.6A3 3 0 0 1 12 2.6a3 3 0 0 1 3 3V7" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>
        سلتك فارغة حالياً.<br />ابدأ بتصفح المنتجات وأضف ما يعجبك.
      </div>`;
      return;
    }

    $('#cartItems').innerHTML = items
      .map(
        (it, idx) => `<div class="cart-item">
          <img src="${esc(it.image)}" alt="${esc(it.name)}" />
          <div>
            <p class="cart-item-name">${esc(it.name)}</p>
            <p class="cart-item-meta">${[it.size && 'مقاس ' + it.size, it.color].filter(Boolean).map(esc).join(' • ') || '—'}</p>
            <div class="qty-mini">
              <button data-dec="${idx}" aria-label="تقليل">−</button>
              <span>${it.qty}</span>
              <button data-inc="${idx}" aria-label="زيادة">+</button>
            </div>
          </div>
          <div style="text-align:end">
            <div class="cart-item-price">${money(it.price * it.qty)}</div>
            <button class="cart-remove" data-del="${idx}">إزالة</button>
          </div>
        </div>`
      )
      .join('');

    const total = items.reduce((s, it) => s + it.price * it.qty, 0);
    $('#cartTotal').innerHTML = money(total);

    $$('[data-inc]').forEach((b) =>
      b.addEventListener('click', () => {
        const it = state.cart[Number(b.dataset.inc)];
        it.qty = Math.min(20, it.qty + 1);
        saveCart();
        renderCart();
      })
    );
    $$('[data-dec]').forEach((b) =>
      b.addEventListener('click', () => {
        const it = state.cart[Number(b.dataset.dec)];
        it.qty -= 1;
        if (it.qty <= 0) state.cart.splice(Number(b.dataset.dec), 1);
        saveCart();
        renderCart();
      })
    );
    $$('[data-del]').forEach((b) =>
      b.addEventListener('click', () => {
        state.cart.splice(Number(b.dataset.del), 1);
        saveCart();
        renderCart();
      })
    );
  }


  /* ----------------------- مؤثرات 3D ----------------------- */
  let revealObserver = null;

  function observeReveals() {
    if (!('IntersectionObserver' in window)) {
      $$('.reveal').forEach((el) => el.classList.add('in'));
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((en) => {
            if (en.isIntersecting) {
              en.target.classList.add('in');
              revealObserver.unobserve(en.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
      );
    }
    $$('.reveal:not(.in)').forEach((el) => revealObserver.observe(el));
  }

  function finishBoot() {
    const pre = $('#preloader');
    if (pre) pre.classList.add('done');
    document.body.classList.remove('loading');
    observeReveals();
  }

  function initEffects() {
    observeReveals();

    // توهج يتبع المؤشر
    const glow = $('#cursorGlow');
    if (glow && window.matchMedia('(pointer:fine)').matches) {
      let raf = null;
      window.addEventListener('pointermove', (e) => {
        document.body.classList.add('has-cursor');
        if (raf) return;
        raf = requestAnimationFrame(() => {
          glow.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%,-50%)`;
          raf = null;
        });
      });
    }

    // ميلان بطاقات المنتجات + لمعة تتبع المؤشر
    const grid = $('#productGrid');
    if (grid && window.matchMedia('(pointer:fine)').matches) {
      grid.addEventListener('pointermove', (e) => {
        const card = e.target.closest('.pcard');
        if (!card) return;
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        const ry = (px - 0.5) * 14;
        const rx = (0.5 - py) * 12;
        card.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(
          2
        )}deg) translateY(-6px) scale(1.015)`;
        const shine = card.querySelector('.pcard-shine');
        if (shine) {
          shine.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
          shine.style.setProperty('--my', (py * 100).toFixed(1) + '%');
        }
      });
      grid.addEventListener('pointerleave', () => {
        $$('.pcard', grid).forEach((c) => (c.style.transform = ''));
      });
      grid.addEventListener('pointerout', (e) => {
        const card = e.target.closest('.pcard');
        if (card && !card.contains(e.relatedTarget)) card.style.transform = '';
      });
    }

    // شريط التطبيق السفلي
    const goTop = () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setAppbarActive('#appHome');
    };
    const goProducts = () => {
      $('#products').scrollIntoView({ behavior: 'smooth', block: 'start' });
      setAppbarActive('#appProducts');
    };
    $('#appHome')?.addEventListener('click', goTop);
    $('#appProducts')?.addEventListener('click', goProducts);
    $('#appWa')?.addEventListener('click', () => openWA(waBase()));
    $('#appCart')?.addEventListener('click', () => {
      show('#cartDrawer');
      $('#drawerScrim').hidden = false;
    });

    // صورة المشهد ثلاثي الأبعاد = أول منتج مميز
    const first = state.products.find((p) => p.featured && p.images && p.images[0]) || state.products.find((p) => p.images && p.images[0]);
    if (first) $('#stageImg').src = first.images[0];

    // إخفاء توهج المؤشر عند الخروج
    document.addEventListener('pointerleave', () => document.body.classList.remove('has-cursor'));
  }

  function setAppbarActive(sel) {
    $$('.appbar-item').forEach((b) => b.classList.toggle('active', '#' + b.id === sel));
  }

  /* ----------------------- الإظهار والإخفاء ----------------------- */
  function show(sel) {
    const el = $(sel);
    el.hidden = false;
    document.body.classList.add('locked');
  }
  function hide(sel) {
    const el = $(sel);
    el.hidden = true;
    if ($$('.modal:not([hidden]), .drawer:not([hidden]), .mobile-menu:not([hidden])').length === 0)
      document.body.classList.remove('locked');
    if (sel === '#productModal') {
      try {
        history.replaceState(null, '', location.pathname + location.search);
      } catch {}
    }
  }
  function closeMobileMenu() {
    $('#mobileMenu').hidden = true;
  }

  /* ----------------------- الأحداث ----------------------- */
  function bindStaticLinks() {
    $('#sizes')?.addEventListener('click', () => {});
    $('#searchBtn').addEventListener('click', () => {
      const bar = $('#searchBar');
      bar.hidden = !bar.hidden;
      if (!bar.hidden) $('#searchInput').focus();
    });
    $('#searchClose').addEventListener('click', () => {
      const bar = $('#searchBar');
      bar.hidden = true;
      $('#searchInput').value = '';
      if (state.search) { state.search = ''; renderGrid(); }
    });
    $('#searchInput').addEventListener('input', (e) => {
      state.search = e.target.value;
      renderGrid();
      if (state.search.trim()) {
        const sec = $('#products');
        if (sec.getBoundingClientRect().top > window.innerHeight) sec.scrollIntoView({ behavior: 'smooth' });
      }
    });
    $('#sortSelect').addEventListener('change', (e) => {
      state.sort = e.target.value;
      renderGrid();
    });
    $('#cartBtn').addEventListener('click', () => {
      show('#cartDrawer');
      $('#drawerScrim').hidden = false;
    });
    const closeCart = () => {
      hide('#cartDrawer');
      $('#drawerScrim').hidden = true;
    };
    $('#cartClose').addEventListener('click', closeCart);
    $('#drawerScrim').addEventListener('click', closeCart);
    $('#clearCart').addEventListener('click', () => {
      state.cart = [];
      saveCart();
      renderCart();
      toast('تم تفريغ السلة');
    });
    $('#checkoutBtn').addEventListener('click', () => {
      if (!state.cart.length) return;
      closeCart();
      show('#checkoutModal');
    });
    $('#checkoutClose').addEventListener('click', () => hide('#checkoutModal'));
    $('#productModal').addEventListener('click', (e) => {
      if (e.target.dataset.close !== undefined || e.target.id === 'modalClose') hide('#productModal');
    });
    $('#modalClose').addEventListener('click', () => hide('#productModal'));
    $('#checkoutModal').addEventListener('click', (e) => {
      if (e.target.dataset.close !== undefined) hide('#checkoutModal');
    });
    $('#infoModal').addEventListener('click', (e) => {
      if (e.target.dataset.close !== undefined || e.target.id === 'infoClose') hide('#infoModal');
    });
    $('#infoClose').addEventListener('click', () => hide('#infoModal'));

    $('#menuBtn').addEventListener('click', () => ($('#mobileMenu').hidden = false));
    $('#mobileMenuClose').addEventListener('click', closeMobileMenu);
    $('#mobileMenu').addEventListener('click', (e) => {
      if (e.target.id === 'mobileMenu') closeMobileMenu();
    });

    // الكمية في نافذة المنتج
    $('#qtyPlus').addEventListener('click', () => {
      const v = Math.min(20, Number($('#pdpQty').value || 1) + 1);
      $('#pdpQty').value = v; refreshPdpWhats();
    });
    $('#qtyMinus').addEventListener('click', () => {
      const v = Math.max(1, Number($('#pdpQty').value || 1) - 1);
      $('#pdpQty').value = v; refreshPdpWhats();
    });

    // الرابط نفسه هو wa.me — يعمل حتى مع فتحه في تبويب جديد أو نسخه
    refreshPdpWhats();

    $('#pdpAdd').addEventListener('click', () => {
      const p = state.current;
      if (!p) return;
      addToCart(p, {
        size: state.selected.size,
        color: state.selected.color,
        qty: Math.max(1, Number($('#pdpQty').value || 1)),
      });
    });

    // إتمام الطلب
    $('#checkoutForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      openWA(waLink(orderMessageCart(state.cart, data)));
      hide('#checkoutModal');
      toast('تم تجهيز رسالة الطلب على واتساب');
    });

    // نوافذ المعلومات
    const INFO = {
      delivery: {
        title: 'التوصيل والأجور',
        body: () =>
          `نوصّل الطلبات إلى جميع المحافظات السورية.\n\n• مدة التوصيل: 2–4 أيام عمل.\n• أجور التوصيل تُحدد حسب المنطقة ويؤكدها فريقنا على واتساب قبل الإرسال.\n• ${
            state.settings.deliveryNote || ''
          }`,
      },
      exchange: {
        title: 'الاستبدال والإرجاع',
        body: () =>
          `يمكنك استبدال المنتج خلال 3 أيام من الاستلام بشرط أن يكون بحالته الأصلية مع البطاقة.\n\nللاستبدال: راسلنا على واتساب مع رقم الطلب وصورة المنتج، وسنرتّب العملية فوراً.`,
      },
      sizes: {
        title: 'دليل المقاسات',
        body: () =>
          `قم بقياس محيط الصدر والخصر واختر المقاس الأنسب:\n\nنسائي: S (36) • M (38) • L (40) • XL (42)\nرجالي (بدلات): 48 • 50 • 52 • 54 • 56\nأطفال: حسب العمر 2-3 / 4-5 / 6-7 سنوات\n\nإذا كنت بين مقاسين، اختر الأكبر. أو راسلنا على واتساب وسنساعدك في الاختيار.`,
      },
    };
    document.addEventListener('click', (e) => {
      const key = e.target.closest('[data-help]')?.dataset.help;
      if (!key || !INFO[key]) return;
      e.preventDefault();
      $('#infoTitle').textContent = INFO[key].title;
      $('#infoBody').textContent = INFO[key].body();
      show('#infoModal');
    });

    // ESC
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      ['#productModal', '#checkoutModal', '#infoModal'].forEach((s) => {
        if (!$(s).hidden) hide(s);
      });
      if (!$('#cartDrawer').hidden) {
        hide('#cartDrawer');
        $('#drawerScrim').hidden = true;
      }
      closeMobileMenu();
    });

    // تمرير الترويسة
    window.addEventListener('scroll', () => {
      $('#header').classList.toggle('scrolled', window.scrollY > 12);
    });

    window.addEventListener('hashchange', handleDeepLink);
  }

  /* ----------------------- التثبيت والسرعة ----------------------- */
  function initPWA() {
    if ('serviceWorker' in navigator) {
      const reg = () => navigator.serviceWorker.register('sw.js').catch(() => {});
      if (document.readyState === 'complete') reg();
      else window.addEventListener('load', reg, { once: true });
    }

    let deferred = null;
    const btn = document.getElementById('installBtn');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e;
      if (btn) btn.hidden = false;
    });

    if (btn) {
      btn.addEventListener('click', async () => {
        if (!deferred) {
          toast('لتثبيت التطبيق: افتح قائمة المتصفح ثم «إضافة إلى الشاشة الرئيسية»');
          return;
        }
        deferred.prompt();
        const choice = await deferred.userChoice.catch(() => null);
        if (choice && choice.outcome === 'accepted') toast('تم تثبيت تطبيق النبهان ✓');
        deferred = null;
        btn.hidden = true;
      });
    }

    window.addEventListener('appinstalled', () => {
      if (btn) btn.hidden = true;
      toast('تم تثبيت التطبيق على جهازك ✓');
    });

    // إخفاء الزر إذا كان التطبيق مثبتاً أصلاً
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (standalone && btn) btn.hidden = true;

    // آيفون وبعض المتصفحات لا تدعم beforeinstallprompt → نظهر الزر مع تعليمات
    if (btn && !standalone) {
      setTimeout(() => {
        if (btn.hidden) btn.hidden = false;
      }, 4200);
    }
  }


  /* ======================= المشاركة ======================= */
  function shareBase() {
    // رابط نظيف يعمل على الأجهزة الأخرى (بدون أي بارامترات)
    return location.origin + location.pathname;
  }

  function productShareUrl(p) {
    return shareBase() + '#p/' + p.id;
  }

  function productShareText(p) {
    const off = p.oldPrice && p.oldPrice > p.price ? ` (بدل ${plainMoney(p.oldPrice)})` : '';
    return [
      'شوفوا هذا المنتج من النبهان للألبسة الأوروبية 🛍️',
      '',
      `👗 ${p.name}${p.code ? ` — ${p.code}` : ''}`,
      `💰 السعر: ${plainMoney(p.price)}${off}`,
      '',
      productShareUrl(p),
    ].join('\n');
  }

  function storeShareText() {
    const s = state.settings || {};
    return [
      `متجر ${s.brandName || 'النبهان للألبسة الأوروبية'} 🛍️`,
      s.tagline || 'أزياء أوروبية أصيلة — مختارة بعناية.',
      'توصيل لجميع المحافظات • الدفع عند الاستلام',
      '',
      shareBase(),
    ].join('\n');
  }

  let shareState = { kind: 'store', p: null };

  function openShare(kind, p) {
    shareState = { kind, p: p || null };
    const isP = kind === 'product' && p;
    const url = isP ? productShareUrl(p) : shareBase();
    const text = isP ? productShareText(p) : storeShareText();
    const title = isP ? p.name : (state.settings.brandName || 'النبهان للألبسة الأوروبية');

    $('#shareTitle').textContent = isP ? 'شارك المنتج مع من تحب' : 'شارك المتجر مع من تحب';
    $('#shareHint').textContent = isP
      ? 'أرسل الرابط لأي شخص — يفتح المنتج مباشرة على جهازه أو داخل تطبيق النبهان.'
      : 'أرسل رابط المتجر لأي شخص — يفتح التطبيق ويمكنه التثبيت على جهازه.';

    const prev = $('#sharePreview');
    if (isP) {
      const thumb = (p.images && p.images[0]) || p.video || PLACEHOLDER;
      $('#shareThumb').src = thumb;
      $('#shareName').textContent = p.name;
      $('#sharePrice').innerHTML = money(p.price);
      prev.hidden = false;
    } else {
      prev.hidden = true;
    }

    $('#shareLink').value = url;
    $('#shareWa').href = 'https://wa.me/?text=' + encodeURIComponent(text);
    $('#shareTg').href = 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(isP ? p.name : title);
    $('#shareFb').href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);
    $('#shareX').href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(isP ? `شوفوا: ${p.name}` : title) + '&url=' + encodeURIComponent(url);
    $('#shareSms').href = 'sms:?&body=' + encodeURIComponent(text);

    // زر المشاركة الأصلية للجهاز (يعمل على الجوال وأغلب المتصفحات الحديثة)
    const native = $('#shareNative');
    native.hidden = !(navigator.share);
    native.dataset.title = title;
    native.dataset.text = isP ? `شوفوا هذا المنتج من النبهان: ${p.name}\n${plainMoney(p.price)}` : storeShareText();

    $('#shareModal').hidden = false;
    document.body.classList.add('share-open');
    setTimeout(() => {
      const first = $('#shareNative').hidden ? $('#shareWa') : $('#shareNative');
      if (first && first.focus) first.focus();
    }, 60);
  }

  function closeShare() {
    $('#shareModal').hidden = true;
    document.body.classList.remove('share-open');
  }

  async function copyText(txt) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(txt);
        return true;
      }
    } catch {}
    try {
      const ta = document.createElement('textarea');
      ta.value = txt;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  async function doCopy(text, label) {
    const ok = await copyText(text);
    toast(ok ? (label || 'تم نسخ الرابط ✓') : 'تعذّر النسخ — يمكنك تحديد الرابط ونسخه يدوياً');
    return ok;
  }

  document.addEventListener('click', (e) => {
    const sh = e.target.closest('[data-share]');
    if (sh) {
      e.preventDefault();
      e.stopPropagation();
      const p = productById(sh.dataset.share);
      if (p) openShare('product', p);
      return;
    }
    if (e.target.closest('[data-share-close]')) {
      e.preventDefault();
      closeShare();
      return;
    }
    const shareOpenBtn = e.target.closest('#footShare');
    if (shareOpenBtn) {
      e.preventDefault();
      openShare('store');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#shareModal').hidden) closeShare();
  });

  function initShare() {
    const pdpShare = $('#pdpShare');
    if (pdpShare)
      pdpShare.addEventListener('click', () => {
        const p = state.current || state.selected.product;
        if (p) openShare('product', p);
      });

    $('#shareNative').addEventListener('click', async () => {
      const b = $('#shareNative');
      try {
        await navigator.share({
          title: b.dataset.title || 'النبهان',
          text: b.dataset.text || '',
          url: $('#shareLink').value,
        });
        closeShare();
      } catch (err) {
        if (!err || err.name !== 'AbortError') toast('تعذّرت المشاركة — استخدم أحد الخيارات أدناه');
      }
    });

    $('#shareCopy').addEventListener('click', () => doCopy($('#shareLink').value));
    $('#shareLinkCopy').addEventListener('click', () => doCopy($('#shareLink').value));

    ['#shareWa', '#shareTg', '#shareFb', '#shareX', '#shareSms'].forEach((sel) => {
      const el = $(sel);
      if (el) el.addEventListener('click', () => setTimeout(closeShare, 400));
    });
    // نسخ نص الرسالة كاملاً عند الضغط الطويل على واتساب
    $('#shareWa').addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const p = shareState.p;
      doCopy(p ? productShareText(p) : storeShareText(), 'تم نسخ الرسالة كاملة ✓');
    });
  }

  function handleDeepLink() {
    const m = /^#p\/([\w-]+)$/.exec(location.hash);
    if (!m) return;
    const p = productById(m[1]);
    if (p) openProduct(p.id);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
