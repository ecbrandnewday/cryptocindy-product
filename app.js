(() => {
  const storageKey = 'rabbitSaleOrders';
  const MAX_PER_ITEM = 2;
  const PRODUCTS = {
    plush: { id: 'plush', name: '比特兔娃娃', price: 25 },
    keychain: { id: 'keychain', name: '比特兔鑰匙圈', price: 10 },
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

  const state = {
    orders: [],
    cart: {},
  };

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
    if (paymentSelect.value === '幣安交易所') {
      paymentHint.innerHTML = `<strong class="payment-hint__emphasis">請打款 ${formatted} USDT 到 幣安 UID：12345654</strong>`;
    } else if (paymentSelect.value === 'BSC 鏈') {
      paymentHint.innerHTML = `請打款 ${formatted} USDT 到 BSC 鏈地址：<code class="hint-code">0xacb7d515bfe4812805dad5f28ba742a38a36c015</code>`;
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
    yearSpan.textContent = new Date().getFullYear();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = collectFormData();
    const errors = validate(data);

    if (errors.length) {
      alert(errors.join('\n'));
      return;
    }

    const order = createOrder(data);
    state.orders.unshift(order);
    saveOrders();
    resetForm();
    alert('訂單已送出！感謝你的支持，我們會盡快處理。');
  });

  paymentSelect.addEventListener('change', () => {
    togglePaymentFields();
    recalc();
  });

  handleProductControls();
  setupGalleries();
  document.addEventListener('DOMContentLoaded', init);
})();
