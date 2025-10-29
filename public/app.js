(() => {
  const storageKey = 'rabbitSaleOrders';
  const MAX_PER_ITEM = 2;
  const PRODUCTS = {
    plush: { id: 'plush', name: '比特兔娃娃', price: 25 },
    keychain: { id: 'keychain', name: '比特兔鑰匙圈', price: 10 },
  };
  const BINANCE_UID = '12345654';
  const BSC_WALLET_ADDRESS = '0xacb7d515bfe4812805dad5f28ba742a38a36c015';

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
  };

  let pendingOrderData = null;

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

  function setupGalleries() {
    galleries.forEach((galleryEl) => {
      const dots = galleryEl.querySelectorAll('.product__gallery-dot');
      dots.forEach((dot) => {
        dot.addEventListener('click', () => {
          const index = Number.parseInt(dot.dataset.imageIndex, 10) || 0;
          showGalleryImage(galleryEl, index);
        });
      });
    });
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

  function finalizeOrderSubmission() {
    if (!pendingOrderData) {
      closeConfirmModal();
      return;
    }

    const order = createOrder(pendingOrderData);
    state.orders.unshift(order);
    saveOrders();
    closeConfirmModal();
    resetForm();
    alert('訂單已送出！感謝你的支持，我們會盡快處理。');
  }

  function togglePaymentFields() {
    const method = paymentSelect.value;
    if (method === '幣安交易所') {
      binanceUidField.style.display = 'flex';
      walletField.style.display = 'none';
      binanceUidInput.required = true;
      walletInput.required = false;
      walletInput.value = '';
    } else if (method === 'BSC 鏈') {
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
    } else if (paymentSelect.value === 'BSC 鏈') {
      const prefix = document.createTextNode(`請打款 ${formatted} USDT 到 BSC 鏈地址： `);
      const wrapper = document.createElement('span');
      wrapper.className = 'payment-hint__address';

      const code = document.createElement('code');
      code.className = 'hint-code';
      code.textContent = BSC_WALLET_ADDRESS;

      const copyBtn = createCopyButton(BSC_WALLET_ADDRESS, '複製 BSC 鏈地址');

      wrapper.append(code, copyBtn);
      paymentHint.append(prefix, wrapper);
    } else {
      paymentHint.textContent = '';
    }
  }

  function updateProductControls(totalQty) {
    productCards.forEach((card) => {
      const productId = card.dataset.productId;
      const quantity = state.cart[productId] || 0;
      const qtyEl = card.querySelector('[data-role="quantity"]');
      const decreaseBtn = card.querySelector('[data-action="decrease"]');
      const increaseBtn = card.querySelector('[data-action="increase"]');

      if (qtyEl) {
        qtyEl.textContent = quantity;
      }
      if (decreaseBtn) {
        decreaseBtn.disabled = quantity <= 0;
      }
      if (increaseBtn) {
        increaseBtn.disabled = quantity >= MAX_PER_ITEM;
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

    updateProductControls(totalQty);
    renderSummary(items, total);

    return { items, totalQty, total };
  }

  function changeQuantity(productId, delta) {
    if (!PRODUCTS[productId]) {
      return;
    }
    const current = state.cart[productId] || 0;

    if (delta > 0) {
      if (current >= MAX_PER_ITEM) {
        alert(`每樣商品最多 ${MAX_PER_ITEM} 件，請調整後再新增。`);
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
    };
  }

  function validate(data) {
    const errors = [];
    if (!data.items.length) {
      errors.push('請先選擇商品');
    }
    const overLimit = data.items.find((item) => item.quantity > MAX_PER_ITEM);
    if (overLimit) {
      errors.push(`「${overLimit.name}」最多只能購買 ${MAX_PER_ITEM} 件`);
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
    } else if (data.paymentMethod === 'BSC 鏈') {
      if (!/^0x[a-fA-F0-9]{40}$/.test(data.walletAddress)) {
        errors.push('請輸入正確的 BSC 鏈地址（0x 開頭共 42 字元）');
      }
    }
    if (!data.paymentMethod) {
      errors.push('請選擇付款方式');
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

  function init() {
    loadOrders();
    togglePaymentFields();
    resetCart();
    recalc();
    if (yearSpan) {
      yearSpan.textContent = new Date().getFullYear();
    }
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
