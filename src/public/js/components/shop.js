// FRONTEND COMPONENT: SHOP & CATALOG MANAGEMENT

let loadedShopItemsMap = {};
let editingProductId = null;

async function loadShopData() {
  if (!selectedGuildId) return;
  await Promise.all([loadShopProducts(), loadShopOrders()]);
}

async function loadShopProducts() {
  const container = document.getElementById('shop-products-container');
  if (!container) return;

  try {
    const res = await apiFetch(`/api/shop/items/${selectedGuildId}`);
    if (!res.ok) throw new Error('Gagal memuat katalog produk.');

    const { items } = await res.json();
    loadedShopItemsMap = {};

    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="col-span-full text-center py-8 text-gray-500 text-xs">
          Belum ada produk di katalog toko. Tambahkan produk pertama di atas!
        </div>
      `;
      return;
    }

    items.forEach(item => {
      loadedShopItemsMap[item.id] = item;
    });

    container.innerHTML = items.map(item => `
      <div class="glass-panel rounded-2xl overflow-hidden border border-white/5 flex flex-col justify-between p-4 space-y-3">
        <div class="space-y-2">
          ${item.imageUrl && item.imageUrl.trim().startsWith('http')
            ? `<img src="${escapeHtml(item.imageUrl)}" class="w-full h-32 object-cover rounded-xl border border-white/10 mb-2">`
            : `<div class="w-full h-24 bg-white/5 rounded-xl border border-white/10 flex items-center justify-center text-gray-500 text-xs font-mono mb-2"><i class="fa-solid fa-store text-xl mr-2"></i> No Image</div>`
          }
          <div class="flex justify-between items-start">
            <h4 class="font-bold text-sm text-white font-outfit">${escapeHtml(item.title)}</h4>
            <span class="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 font-bold text-xs font-mono whitespace-nowrap">${item.priceRtk.toLocaleString('id-ID')} RTK</span>
          </div>
          <p class="text-xs text-gray-400 line-clamp-2">${escapeHtml(item.description || 'Tidak ada deskripsi.')}</p>
        </div>
        <div class="flex items-center gap-2 pt-2 border-t border-white/5">
          <button onclick="openEditProductModal(${item.id})" class="flex-1 py-2 bg-discord-blurple/20 hover:bg-discord-blurple/30 text-discord-blurple border border-discord-blurple/30 rounded-xl text-xs font-semibold transition-all">
            <i class="fa-solid fa-pen-to-square mr-1"></i> Edit
          </button>
          <button onclick="deleteProduct(${item.id})" class="py-2 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-semibold transition-all">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    showToast('Shop Error', error.message || 'Gagal memuat produk.', 'error');
  }
}

function openEditProductModal(id) {
  const item = loadedShopItemsMap[id];
  if (!item) return;

  editingProductId = id;

  const titleInput = document.getElementById('new-shop-title');
  const priceInput = document.getElementById('new-shop-price');
  const categorySelect = document.getElementById('new-shop-category');
  const imageInput = document.getElementById('new-shop-image');
  const descInput = document.getElementById('new-shop-desc');
  const formHeader = document.getElementById('shop-form-header');
  const submitBtn = document.getElementById('shop-submit-btn');
  const cancelBtn = document.getElementById('shop-cancel-edit-btn');

  if (titleInput) titleInput.value = item.title;
  if (priceInput) priceInput.value = item.priceRtk;
  if (categorySelect) categorySelect.value = item.category || 'GAME';
  if (imageInput) imageInput.value = item.imageUrl || '';
  if (descInput) descInput.value = item.description || '';

  if (formHeader) formHeader.innerHTML = `<i class="fa-solid fa-pen-to-square text-amber-400 mr-2"></i> Edit Produk: "${escapeHtml(item.title)}"`;
  if (submitBtn) submitBtn.innerHTML = `<i class="fa-solid fa-floppy-disk mr-1"></i> Simpan Perubahan Produk`;
  if (cancelBtn) cancelBtn.classList.remove('hidden');

  // Scroll to form smoothly
  document.getElementById('shop-product-form')?.scrollIntoView({ behavior: 'smooth' });
}

function cancelEditProduct() {
  editingProductId = null;

  const titleInput = document.getElementById('new-shop-title');
  const priceInput = document.getElementById('new-shop-price');
  const imageInput = document.getElementById('new-shop-image');
  const descInput = document.getElementById('new-shop-desc');
  const formHeader = document.getElementById('shop-form-header');
  const submitBtn = document.getElementById('shop-submit-btn');
  const cancelBtn = document.getElementById('shop-cancel-edit-btn');

  if (titleInput) titleInput.value = '';
  if (priceInput) priceInput.value = '';
  if (imageInput) imageInput.value = '';
  if (descInput) descInput.value = '';

  if (formHeader) formHeader.innerHTML = `<i class="fa-solid fa-plus text-discord-blurple mr-2"></i> Tambah Produk Baru Ke Katalog`;
  if (submitBtn) submitBtn.innerHTML = `<i class="fa-solid fa-cart-plus mr-1"></i> Tambah Ke Katalog Toko`;
  if (cancelBtn) cancelBtn.classList.add('hidden');
}

async function addShopProduct() {
  if (!selectedGuildId) return;

  const titleInput = document.getElementById('new-shop-title');
  const priceInput = document.getElementById('new-shop-price');
  const categorySelect = document.getElementById('new-shop-category');
  const imageInput = document.getElementById('new-shop-image');
  const descInput = document.getElementById('new-shop-desc');

  const title = titleInput?.value.trim();
  const priceRtk = parseInt(priceInput?.value || '0', 10);
  const category = categorySelect?.value || 'GAME';
  const imageUrl = imageInput?.value.trim();
  const description = descInput?.value.trim();

  if (!title || priceRtk <= 0) {
    showToast('Input Tidak Valid', 'Judul produk dan harga RTK harus diisi dengan benar.', 'error');
    return;
  }

  try {
    let res;
    if (editingProductId) {
      // UPDATE existing product
      res = await apiFetch(`/api/shop/items/${editingProductId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: selectedGuildId, title, description, priceRtk, category, imageUrl })
      });
    } else {
      // CREATE new product
      res = await apiFetch(`/api/shop/items/${selectedGuildId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, priceRtk, category, imageUrl })
      });
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal menyimpan produk toko.');
    }

    const actionText = editingProductId ? 'diperbarui' : 'ditambahkan ke katalog toko';
    showToast('Berhasil Tersimpan', `Produk "${title}" telah berhasil ${actionText}! 🛒`, 'success');
    
    cancelEditProduct();
    await loadShopProducts();
  } catch (error) {
    showToast('Gagal Menyimpan', error.message, 'error');
  }
}

async function deleteProduct(id) {
  if (!confirm('Apakah kamu yakin ingin menghapus produk ini dari katalog toko?')) return;

  try {
    const res = await apiFetch(`/api/shop/items/${id}?guildId=${selectedGuildId}`, {
      method: 'DELETE'
    });

    if (res.ok) {
      showToast('Produk Dihapus', 'Produk berhasil dihapus dari katalog.', 'success');
      await loadShopProducts();
    } else {
      showToast('Gagal', 'Gagal menghapus produk.', 'error');
    }
  } catch (error) {
    showToast('Error', error.message, 'error');
  }
}

async function loadShopOrders() {
  const tableBody = document.getElementById('shop-orders-table-body');
  if (!tableBody || !selectedGuildId) return;

  try {
    const res = await apiFetch(`/api/shop/orders/${selectedGuildId}`);
    if (!res.ok) throw new Error('Gagal memuat pesanan toko.');

    const { orders } = await res.json();

    if (!orders || orders.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="p-6 text-center text-gray-500 text-xs">Belum ada antrean pesanan dari member.</td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = orders.map(o => {
      const statusBadge = o.status === 'COMPLETED' 
        ? `<span class="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold text-[10px]">SUCCESS</span>`
        : o.status === 'REFUNDED'
        ? `<span class="px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 font-semibold text-[10px]">REFUNDED</span>`
        : `<span class="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 font-semibold text-[10px] animate-pulse">PENDING</span>`;

      return `
        <tr class="border-b border-white/5 hover:bg-white/2 transition-all">
          <td class="p-4 font-mono text-xs text-white font-bold">${escapeHtml(o.orderId)}</td>
          <td class="p-4 text-xs text-white">${escapeHtml(o.username)}</td>
          <td class="p-4 text-xs text-amber-400 font-bold font-outfit">${escapeHtml(o.itemTitle)} (${o.priceRtk.toLocaleString('id-ID')} RTK)</td>
          <td class="p-4 text-xs text-indigo-300 font-mono bg-white/5 rounded-lg">${escapeHtml(o.targetInput)}</td>
          <td class="p-4">${statusBadge}</td>
          <td class="p-4">
            ${o.status === 'PENDING' ? `
              <div class="flex items-center gap-2">
                <button onclick="approveOrder('${o.orderId}')" class="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-semibold transition-all">
                  <i class="fa-solid fa-check mr-1"></i> Approve
                </button>
                <button onclick="rejectOrder('${o.orderId}')" class="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-lg text-xs font-semibold transition-all">
                  <i class="fa-solid fa-xmark mr-1"></i> Refund
                </button>
              </div>
            ` : `<span class="text-xs text-gray-500 font-mono">${escapeHtml(o.notes || '-')}</span>`}
          </td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    showToast('Shop Error', error.message || 'Gagal memuat pesanan.', 'error');
  }
}

async function approveOrder(orderId) {
  const notes = prompt('Masukkan catatan transaksi (misal: SN / Voucher Code / Sukses):', 'Disetujui & Selesai');
  if (notes === null) return;

  try {
    const res = await apiFetch(`/api/shop/orders/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, notes })
    });

    if (res.ok) {
      showToast('Pesanan Selesai', `Pesanan ${orderId} telah disetujui & DM notifikasi dikirim!`, 'success');
      await loadShopOrders();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast('Gagal', err.error || 'Gagal menyetujui pesanan.', 'error');
    }
  } catch (error) {
    showToast('Error', error.message, 'error');
  }
}

async function rejectOrder(orderId) {
  const reason = prompt('Masukkan alasan penolakan (Koin RTK akan otomatis dikembalikan ke user):', 'ID Target tidak ditemukan/salah');
  if (reason === null) return;

  try {
    const res = await apiFetch(`/api/shop/orders/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, reason })
    });

    if (res.ok) {
      showToast('Pesanan Ditolak', `Pesanan ${orderId} ditolak & koin RTK telah di-refund ke user!`, 'success');
      await loadShopOrders();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast('Gagal', err.error || 'Gagal menolak pesanan.', 'error');
    }
  } catch (error) {
    showToast('Error', error.message, 'error');
  }
}
