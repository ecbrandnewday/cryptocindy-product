(() => {
  const storageKey = 'rabbitSaleOrders';
  const DEFAULT_MAX_PER_ITEM = 2;
  const REDUCED_MAX_PER_ITEM = 1;
  const LIMIT_REDUCTION_THRESHOLDS = {
    plush: 60,
    keychain: 120,
  };
  const PRODUCTS = {
    plush: { id: 'plush', name: '比特兔娃娃', price: 25 },
    keychain: { id: 'keychain', name: '比特兔鑰匙圈', price: 10 },
  };
  const BINANCE_UID = '533493959';
  const BSC_WALLET_ADDRESS = '0xf64251593fd34e292435dad80bcb620fa564963f';
  const WEBHOOK_URL = 'https://cryptocindyrabbit.app.n8n.cloud/webhook/order';
  const INVENTORY_URL = 'https://docs.google.com/spreadsheets/d/1-UShfw3ta6F1ANFK6IG1-PEGrKyyGda6H-kQ4CVxgSo/gviz/tq?tqx=out:json&gid=0';
  const SALE_LIMITS = {
    plush: 85,
    keychain: 135,
  };

  const form = document.getElementById('orderForm');
  const productCards = Array.from(document.querySelectorAll('.product__card'));
  const orderSummaryList = document.getElementById('summaryList');
  const summaryEmpty = document.getElementById('summaryEmpty');
  const orderTotalEl = document.getElementById('orderTotal');
  const paymentSelect = form.querySelector('select[name="paymentMethod"]');
  const paymentHint = document.getElementById('paymentHint');
  const binanceUidField = document.getElementById('binanceUidField');
  const walletField = document.getElementById('walletField');
  const binanceUidInput = binanceUidField.querySelector('input');
  const walletInput = walletField.querySelector('input');
  const galleries = Array.from(document.querySelectorAll('.product__gallery'));
  const yearSpan = document.getElementById('year');
  const confirmModal = document.getElementById('orderConfirmModal');
  const modalPanel = confirmModal?.querySelector('.modal__panel');
  const modalBody = confirmModal?.querySelector('.modal__body');
  const modalBackdrop = confirmModal?.querySelector('.modal__backdrop');
  const modalCancelBtn = confirmModal?.querySelector('[data-action="cancel"]');
  const modalConfirmBtn = confirmModal?.querySelector('[data-action="confirm"]');

  const state = {
    orders: [],
    cart: {},
    soldOut: {
      plush: false,
      keychain: false,
    },
    maxPerItem: {
      plush: DEFAULT_MAX_PER_ITEM,
      keychain: DEFAULT_MAX_PER_ITEM,
    },
  };

  let pendingOrderData = null;

  function getMaxPerItem(productId) {
    return state.maxPerItem?.[productId] ?? DEFAULT_MAX_PER_ITEM;
  }

  function formatPhone(phone) {
    const digits = phone.replace(/\D/g, '').slice(0, 10);
    if (digits.length !== 10) {
      return phone;
    }
    return `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  function showGalleryImage(galleryEl, targetIndex) {
    const images = galleryEl.querySelectorAll('img');
    const dots = galleryEl.querySelectorAll('.product__gallery-dot');
    images.forEach((img, index) => {
      if (index === targetIndex) {
        img.classList.add('is-active');
      } else {
        img.classList.remove('is-active');
      }
    });
    dots.forEach((dot, index) => {
      const isActive = index === targetIndex;
      dot.classList.toggle('is-active', isActive);
      dot.setAttribute('aria-pressed', String(isActive));
    });
  }

  function getActiveGalleryIndex(galleryEl) {
    const dots = Array.from(galleryEl.querySelectorAll('.product__gallery-dot'));
    const activeDotIndex = dots.findIndex((dot) => dot.classList.contains('is-active'));
    if (activeDotIndex >= 0) {
      return activeDotIndex;
    }
    const images = Array.from(galleryEl.querySelectorAll('img'));
    const activeImageIndex = images.findIndex((img) => img.classList.contains('is-active'));
    return activeImageIndex >= 0 ? activeImageIndex : 0;
  }

  function moveGalleryBy(galleryEl, step) {
    const images = galleryEl.querySelectorAll('img');
    const total = images.length;
    if (!total) {
      return;
    }
    const nextIndex = (getActiveGalleryIndex(galleryEl) + step + total) % total;
    showGalleryImage(galleryEl, nextIndex);
  }

  function setupGallerySwipe(galleryEl) {
    const SWIPE_THRESHOLD = 35;
    const SWIPE_LOCK_THRESHOLD = 10;
    const state = {
      pointerId: null,
      startX: 0,
      startY: 0,
      isTouch: false,
      lockedAxis: false,
    };

    const resetState = () => {
      state.pointerId = null;
      state.startX = 0;
      state.startY = 0;
      state.isTouch = false;
      state.lockedAxis = false;
      galleryEl.classList.remove('is-dragging');
    };

    const onStart = (clientX, clientY, pointerId = null, isTouch = false) => {
      if (state.pointerId !== null) {
        return;
      }
      state.pointerId = pointerId;
      state.startX = clientX;
      state.startY = clientY;
      state.isTouch = isTouch;
      state.lockedAxis = false;
      galleryEl.classList.add('is-dragging');
    };

    const onMove = (clientX, clientY, event) => {
      if (state.pointerId === null) {
        return;
      }
      const deltaX = clientX - state.startX;
      const deltaY = clientY - state.startY;

      if (!state.lockedAxis) {
        if (Math.abs(deltaX) > SWIPE_LOCK_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY)) {
          state.lockedAxis = true;
        } else if (Math.abs(deltaY) > SWIPE_LOCK_THRESHOLD) {
          resetState();
          return;
        }
      }

      if (state.lockedAxis && state.isTouch && event?.cancelable) {
        event.preventDefault();
      }
    };

    const onEnd = (clientX) => {
      if (state.pointerId === null) {
        return;
      }
      const deltaX = clientX - state.startX;
      const shouldMove = Math.abs(deltaX) >= SWIPE_THRESHOLD;
      resetState();
      if (shouldMove) {
        moveGalleryBy(galleryEl, deltaX < 0 ? 1 : -1);
      }
    };

    const onCancel = () => {
      if (state.pointerId === null) {
        return;
      }
      resetState();
    };

    if (window.PointerEvent) {
      galleryEl.addEventListener(
        'pointerdown',
        (event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
          }
          if (event.target.closest('.product__gallery-dot')) {
            return;
          }
          onStart(event.clientX, event.clientY, event.pointerId, event.pointerType === 'touch');
          try {
            galleryEl.setPointerCapture(event.pointerId);
          } catch (error) {
            // ignore capture errors
          }
        },
        { passive: true },
      );

      galleryEl.addEventListener(
        'pointermove',
        (event) => {
          if (state.pointerId !== event.pointerId) {
            return;
          }
          onMove(event.clientX, event.clientY, event);
        },
        { passive: false },
      );

      galleryEl.addEventListener('pointerup', (event) => {
        if (state.pointerId !== event.pointerId) {
          return;
        }
        try {
          galleryEl.releasePointerCapture(event.pointerId);
        } catch (error) {
          // ignore release errors
        }
        onEnd(event.clientX);
      });

      galleryEl.addEventListener('pointercancel', (event) => {
        if (state.pointerId !== event.pointerId) {
          return;
        }
        onCancel();
      });
    } else {
      galleryEl.addEventListener(
        'touchstart',
        (event) => {
          if (event.touches.length !== 1) {
            return;
          }
          if (event.target.closest('.product__gallery-dot')) {
            return;
          }
          const touch = event.touches[0];
          onStart(touch.clientX, touch.clientY, touch.identifier, true);
        },
        { passive: true },
      );

      galleryEl.addEventListener(
        'touchmove',
        (event) => {
          if (state.pointerId === null) {
            return;
          }
          const touch = Array.from(event.changedTouches).find((t) => t.identifier === state.pointerId);
          if (!touch) {
            return;
          }
          onMove(touch.clientX, touch.clientY, event);
        },
        { passive: false },
      );

      galleryEl.addEventListener('touchend', (event) => {
        if (state.pointerId === null) {
          return;
        }
        const touch = Array.from(event.changedTouches).find((t) => t.identifier === state.pointerId);
        if (!touch) {
          return;
        }
        onEnd(touch.clientX);
      });

      galleryEl.addEventListener('touchcancel', () => {
        onCancel();
      });

      const handleMouseMove = (event) => {
        if (state.pointerId !== 'mouse') {
          return;
        }
        onMove(event.clientX, event.clientY, event);
      };

      const handleMouseUp = (event) => {
        if (state.pointerId !== 'mouse') {
          return;
        }
        onEnd(event.clientX);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      galleryEl.addEventListener('mousedown', (event) => {
        if (event.button !== 0 || event.target.closest('.product__gallery-dot')) {
          return;
        }
        onStart(event.clientX, event.clientY, 'mouse', false);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
      });
    }
  }

  function setupGalleries() {
    galleries.forEach((galleryEl) => {
      const dots = galleryEl.querySelectorAll('.product__gallery-dot');
      dots.forEach((dot) => {
        dot.addEventListener('click', () => {
          const index = Number.parseInt(dot.dataset.imageIndex, 10) || 0;
          showGalleryImage(galleryEl, index);
        });
      });
      setupGallerySwipe(galleryEl);
    });
  }

  function parseGvizResponse(text) {
    const match = text.match(/google\.visualization\.Query\.setResponse\((.*)\);?$/s);
    if (!match) {
      throw new Error('Invalid Google Sheets response');
    }
    return JSON.parse(match[1]);
  }

  async function fetchInventoryTotals() {
    const response = await fetch(INVENTORY_URL);
    if (!response.ok) {
      throw new Error(`Inventory endpoint responded with status ${response.status}`);
    }
    const text = await response.text();
    const payload = parseGvizResponse(text);
    const rows = payload?.table?.rows ?? [];

    let plushTotal = 0;
    let keychainTotal = 0;
    rows.forEach((row) => {
      const cells = row?.c || [];
      const plushValue = Number(cells[11]?.v) || 0;
      const keychainValue = Number(cells[12]?.v) || 0;
      plushTotal += plushValue;
      keychainTotal += keychainValue;
    });

    return { plushTotal, keychainTotal };
  }

  function setMaxPerItemFromTotals(totals) {
    const nextPlushMax =
      totals.plushTotal >= LIMIT_REDUCTION_THRESHOLDS.plush ? REDUCED_MAX_PER_ITEM : DEFAULT_MAX_PER_ITEM;
    const nextKeychainMax =
      totals.keychainTotal >= LIMIT_REDUCTION_THRESHOLDS.keychain ? REDUCED_MAX_PER_ITEM : DEFAULT_MAX_PER_ITEM;

    state.maxPerItem.plush = nextPlushMax;
    state.maxPerItem.keychain = nextKeychainMax;
  }

  function ensureSoldOutNotice(card) {
    let notice = card.querySelector('.product__soldout');
    if (!notice) {
      notice = document.createElement('p');
      notice.className = 'product__soldout';
      notice.setAttribute('aria-live', 'polite');
      notice.hidden = true;
      card.querySelector('.product__details')?.appendChild(notice);
    }
    return notice;
  }

  function applySoldOutState() {
    let cartChanged = false;
    productCards.forEach((card) => {
      const productId = card.dataset.productId;
      const isSoldOut = Boolean(state.soldOut[productId]);
      const actions = card.querySelector('.product__actions');
      const notice = ensureSoldOutNotice(card);

      if (isSoldOut && state.cart[productId]) {
        delete state.cart[productId];
        cartChanged = true;
      }

      notice.hidden = !isSoldOut;
      if (isSoldOut) {
        notice.textContent = '已售完';
        actions?.setAttribute('aria-hidden', 'true');
      } else {
        notice.textContent = '';
        actions?.removeAttribute('aria-hidden');
      }

      card.classList.toggle('is-sold-out', isSoldOut);
    });
    return cartChanged;
  }

  function enforceCartLimits() {
    let cartChanged = false;
    Object.entries(state.cart).forEach(([productId, quantity]) => {
      if (!PRODUCTS[productId]) {
        return;
      }
      const maxQuantity = getMaxPerItem(productId);
      if (quantity > maxQuantity) {
        if (maxQuantity <= 0) {
          delete state.cart[productId];
        } else {
          state.cart[productId] = maxQuantity;
        }
        cartChanged = true;
      }
    });
    return cartChanged;
  }

  async function loadSaleStatus() {
    try {
      const totals = await fetchInventoryTotals();
      state.soldOut.plush = totals.plushTotal >= SALE_LIMITS.plush;
      state.soldOut.keychain = totals.keychainTotal >= SALE_LIMITS.keychain;
      const cartChanged = applySoldOutState();
      setMaxPerItemFromTotals(totals);
      const cartAdjustedByLimit = enforceCartLimits();
      if (cartChanged || cartAdjustedByLimit) {
        recalc();
      } else {
        updateProductControls();
      }
    } catch (error) {
      console.warn('無法載入商品銷售狀態：', error);
    }
  }

  function isProductSoldOut(productId) {
    return Boolean(state.soldOut[productId]);
  }

  function loadOrders() {
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          state.orders = parsed;
        }
      }
    } catch (error) {
      console.warn('無法讀取訂單快取：', error);
    }
  }

  function saveOrders() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state.orders));
    } catch (error) {
      console.warn('無法儲存訂單：', error);
    }
  }

  function formatAmount(amount) {
    if (!Number.isFinite(amount) || amount <= 0) {
      return '0';
    }
    return amount % 1 === 0 ? `${amount}` : amount.toFixed(2);
  }

  function getCartItems() {
    return Object.entries(state.cart)
      .filter(([, quantity]) => quantity > 0)
      .map(([productId, quantity]) => {
        const product = PRODUCTS[productId];
        const unitPrice = product?.price ?? 0;
        return {
          id: productId,
          name: product?.name ?? productId,
          quantity,
          unitPrice,
          subtotal: unitPrice * quantity,
        };
      });
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();

    let succeeded = false;
    try {
      succeeded = document.execCommand('copy');
    } catch (error) {
      console.warn('無法透過 execCommand 複製文字：', error);
    }

    document.body.removeChild(textarea);
    if (!succeeded) {
      throw new Error('copy-failed');
    }
    return true;
  }

  function createCopyButton(text, ariaLabel = '複製資訊') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'payment-hint__copy-btn';
    button.setAttribute('aria-label', ariaLabel);
    const idleText = '複製';
    const successText = '已複製';
    const failureText = '複製失敗';
    button.textContent = idleText;

    let resetTimer;
    button.addEventListener('click', async () => {
      clearTimeout(resetTimer);
      try {
        await copyTextToClipboard(text);
        button.textContent = successText;
      } catch (error) {
        button.textContent = failureText;
        console.warn('複製資訊時發生錯誤：', error);
      }
      resetTimer = window.setTimeout(() => {
        button.textContent = idleText;
      }, 2000);
    });

    return button;
  }

  function handleModalKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeConfirmModal();
    }
  }

  function openConfirmModal() {
    if (!confirmModal) {
      finalizeOrderSubmission();
      return;
    }

    confirmModal.hidden = false;
    modalBody?.scrollTo({ top: 0 });
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleModalKeydown);
    window.setTimeout(() => {
      modalPanel?.focus();
    }, 0);
  }

  function closeConfirmModal(resetPending = true) {
    if (!confirmModal) {
      if (resetPending) {
        pendingOrderData = null;
      }
      return;
    }

    if (confirmModal.hidden) {
      if (resetPending) {
        pendingOrderData = null;
      }
      return;
    }

    confirmModal.hidden = true;
    document.body.style.overflow = '';
    document.removeEventListener('keydown', handleModalKeydown);
    if (resetPending) {
      pendingOrderData = null;
    }
  }

  async function finalizeOrderSubmission() {
    if (!pendingOrderData) {
      closeConfirmModal();
      return;
    }

    const validationErrors = validate(pendingOrderData);
    if (validationErrors.length) {
      alert(validationErrors.join('\n'));
      closeConfirmModal();
      return;
    }

    const order = createOrder(pendingOrderData);
    let webhookError = null;
    try {
      await sendOrderWebhook(order);
    } catch (error) {
      webhookError = error;
    }

    state.orders.unshift(order);
    saveOrders();
    closeConfirmModal();
    resetForm();
    await loadSaleStatus();
    if (webhookError) {
      alert('訂單已存檔，但通知後端工作流時發生問題，請稍後再試或聯絡我們。');
    } else {
      alert('訂單已送出！感謝你的支持，我們會盡快處理。');
    }
  }

  function togglePaymentFields() {
    const method = paymentSelect.value;
    if (method === '幣安交易所') {
      binanceUidField.style.display = 'flex';
      walletField.style.display = 'none';
      binanceUidInput.required = true;
      walletInput.required = false;
      walletInput.value = '';
    } else if (method === 'BSC') {
      walletField.style.display = 'flex';
      binanceUidField.style.display = 'none';
      walletInput.required = true;
      binanceUidInput.required = false;
      binanceUidInput.value = '';
    } else {
      binanceUidField.style.display = 'none';
      walletField.style.display = 'none';
      binanceUidInput.required = false;
      walletInput.required = false;
    }
  }

  function updatePaymentHint(total) {
    if (!Number.isFinite(total) || total <= 0) {
      paymentHint.textContent = '';
      return;
    }
    const formatted = formatAmount(total);
    paymentHint.textContent = '';

    if (paymentSelect.value === '幣安交易所') {
      const emphasis = document.createElement('strong');
      emphasis.className = 'payment-hint__emphasis';

      const prefix = document.createTextNode(`請打款 ${formatted} USDT 到 幣安 UID： `);
      const wrapper = document.createElement('span');
      wrapper.className = 'payment-hint__address';

      const code = document.createElement('code');
      code.className = 'hint-code';
      code.textContent = BINANCE_UID;

      const copyBtn = createCopyButton(BINANCE_UID, '複製幣安 UID');

      wrapper.append(code, copyBtn);
      emphasis.append(prefix, wrapper);
      paymentHint.appendChild(emphasis);
    } else if (paymentSelect.value === 'BSC') {
      const emphasis = document.createElement('strong');
      emphasis.className = 'payment-hint__emphasis';

      const prefix = document.createTextNode(`請打款 ${formatted} USDT 到 BSC 地址： `);
      const wrapper = document.createElement('span');
      wrapper.className = 'payment-hint__address';

      const code = document.createElement('code');
      code.className = 'hint-code';
      code.textContent = BSC_WALLET_ADDRESS;

      const copyBtn = createCopyButton(BSC_WALLET_ADDRESS, '複製 BSC 地址');

      wrapper.append(code, copyBtn);
      emphasis.append(prefix, wrapper);
      paymentHint.appendChild(emphasis);
    } else {
      paymentHint.textContent = '';
    }
  }

  function updateProductControls() {
    productCards.forEach((card) => {
      const productId = card.dataset.productId;
      const quantity = state.cart[productId] || 0;
      const soldOut = isProductSoldOut(productId);
      const maxPerItem = getMaxPerItem(productId);
      const qtyEl = card.querySelector('[data-role="quantity"]');
      const decreaseBtn = card.querySelector('[data-action="decrease"]');
      const increaseBtn = card.querySelector('[data-action="increase"]');

      if (qtyEl) {
        qtyEl.textContent = soldOut ? '已售完' : quantity;
      }
      if (decreaseBtn) {
        const disabled = soldOut || quantity <= 0;
        decreaseBtn.disabled = disabled;
        decreaseBtn.setAttribute('aria-disabled', String(disabled));
      }
      if (increaseBtn) {
        const disabled = soldOut || quantity >= maxPerItem;
        increaseBtn.disabled = disabled;
        increaseBtn.setAttribute('aria-disabled', String(disabled));
      }
    });
  }

  function renderSummary(items, total) {
    orderSummaryList.innerHTML = '';

    if (!items.length) {
      summaryEmpty.hidden = false;
      orderSummaryList.hidden = true;
    } else {
      summaryEmpty.hidden = true;
      orderSummaryList.hidden = false;
      items.forEach((item) => {
        const li = document.createElement('li');
        li.className = 'order__summary-item';

        const name = document.createElement('span');
        name.textContent = `${item.name} × ${item.quantity}`;

        const price = document.createElement('span');
        price.textContent = `${formatAmount(item.subtotal)} USDT`;

        li.append(name, price);
        orderSummaryList.appendChild(li);
      });
    }

    orderTotalEl.textContent = formatAmount(total);
    updatePaymentHint(total);
  }

  function recalc() {
    const items = getCartItems();
    const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);

    updateProductControls();
    renderSummary(items, total);

    return { items, totalQty, total };
  }

  function changeQuantity(productId, delta) {
    if (!PRODUCTS[productId]) {
      return;
    }
    if (isProductSoldOut(productId) && delta > 0) {
      const productName = PRODUCTS[productId]?.name ?? '該商品';
      alert(`${productName}已售完，暫時無法下單。`);
      return;
    }
    const maxPerItem = getMaxPerItem(productId);
    const current = state.cart[productId] || 0;

    if (delta > 0) {
      if (current >= maxPerItem) {
        alert(`每樣商品最多 ${maxPerItem} 件，請調整後再新增。`);
        return;
      }
      state.cart[productId] = current + 1;
    } else if (delta < 0) {
      if (current <= 0) {
        return;
      }
      const next = current - 1;
      if (next <= 0) {
        delete state.cart[productId];
      } else {
        state.cart[productId] = next;
      }
    }

    recalc();
  }

  function handleProductControls() {
    productCards.forEach((card) => {
      const productId = card.dataset.productId;
      card.addEventListener('click', (event) => {
        const control = event.target.closest('[data-action]');
        if (!control) {
          return;
        }
        event.preventDefault();
        const action = control.dataset.action;
        changeQuantity(productId, action === 'increase' ? 1 : -1);
      });
    });
  }

  function collectFormData() {
    const summary = recalc();
    const formData = new FormData(form);
    const itemQuantityMap = summary.items.reduce((acc, item) => {
      acc[item.id] = item.quantity;
      return acc;
    }, {});

    return {
      items: summary.items,
      totalPrice: summary.total,
      totalQuantity: summary.totalQty,
      customerName: formData.get('customerName')?.trim() || '',
      email: formData.get('email')?.trim() || '',
      phone: formData.get('phone')?.trim() || '',
      store: formData.get('store')?.trim() || '',
      paymentMethod: formData.get('paymentMethod') || '',
      binanceUid: formData.get('binanceUid')?.trim() || '',
      walletAddress: formData.get('walletAddress')?.trim() || '',
      plushQty: itemQuantityMap.plush || 0,
      keychainQty: itemQuantityMap.keychain || 0,
    };
  }

  function validate(data) {
    const errors = [];
    if (!data.items.length) {
      errors.push('請先選擇商品');
    }
    const overLimit = data.items.find((item) => {
      const maxAllowed = getMaxPerItem(item.id);
      return item.quantity > maxAllowed;
    });
    if (overLimit) {
      const maxAllowed = getMaxPerItem(overLimit.id);
      errors.push(`「${overLimit.name}」最多只能購買 ${maxAllowed} 件`);
    }
    if (!data.customerName) {
      errors.push('請輸入姓名');
    }
    if (!data.email) {
      errors.push('請輸入電子信箱');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.push('請輸入正確的電子信箱');
    }
    if (!/^09\d{2}-?\d{3}-?\d{3}$/.test(data.phone)) {
      errors.push('請輸入正確手機號碼（09xx-xxx-xxx）');
    }
    if (!data.store) {
      errors.push('請輸入 7-11 店名');
    }
    if (data.paymentMethod === '幣安交易所') {
      if (!/^\d{8,12}$/.test(data.binanceUid)) {
        errors.push('請輸入正確的幣安 UID（8-12 位數字）');
      }
    } else if (data.paymentMethod === 'BSC') {
      if (!/^0x[a-fA-F0-9]{40}$/.test(data.walletAddress)) {
        errors.push('請輸入正確的 BSC 地址（0x 開頭共 42 字元）');
      }
    }
    if (!data.paymentMethod) {
      errors.push('請選擇付款方式');
    }
    if (state.soldOut.plush && data.plushQty > 0) {
      errors.push('比特兔娃娃已售完，請移除該商品後再下單');
    }
    if (state.soldOut.keychain && data.keychainQty > 0) {
      errors.push('比特兔鑰匙圈已售完，請移除該商品後再下單');
    }
    return errors;
  }

  function createOrder(data) {
    const now = new Date();
    return {
      ...data,
      phone: formatPhone(data.phone),
      createdAt: now.toLocaleString('zh-TW', { hour12: false }),
      id: `${now.getTime()}-${Math.random().toString(16).slice(2)}`,
    };
  }

  function buildWebhookPayload(order) {
    const {
      id,
      createdAt,
      customerName,
      email,
      phone,
      store,
      paymentMethod,
      binanceUid,
      walletAddress,
      totalQuantity,
      totalPrice,
      plushQty,
      keychainQty,
    } = order;
    return {
      id,
      createdAt,
      customerName,
      email,
      phone,
      store,
      paymentMethod,
      binanceUid,
      walletAddress,
      totalQuantity,
      totalPrice,
      plushQty,
      keychainQty,
    };
  }

  async function sendOrderWebhook(order) {
    try {
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildWebhookPayload(order)),
      });
      if (!response.ok) {
        throw new Error(`Webhook responded with status ${response.status}`);
      }
    } catch (error) {
      console.warn('Webhook 傳送失敗：', error);
      throw error;
    }
  }

  function resetCart() {
    state.cart = {};
  }

  function resetForm() {
    form.reset();
    paymentSelect.value = '幣安交易所';
    togglePaymentFields();
    resetCart();
    recalc();
  }

  async function init() {
    loadOrders();
    togglePaymentFields();
    resetCart();
    recalc();
    if (yearSpan) {
      yearSpan.textContent = new Date().getFullYear();
    }
    await loadSaleStatus();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = collectFormData();
    const errors = validate(data);

    if (errors.length) {
      alert(errors.join('\n'));
      return;
    }

    pendingOrderData = data;
    openConfirmModal();
  });

  paymentSelect.addEventListener('change', () => {
    togglePaymentFields();
    recalc();
  });

  modalCancelBtn?.addEventListener('click', () => {
    closeConfirmModal();
  });

  modalConfirmBtn?.addEventListener('click', () => {
    finalizeOrderSubmission();
  });

  modalBackdrop?.addEventListener('click', () => {
    closeConfirmModal();
  });

  handleProductControls();
  setupGalleries();
  document.addEventListener('DOMContentLoaded', init);
})();
