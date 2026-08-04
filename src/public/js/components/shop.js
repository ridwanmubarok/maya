// FRONTEND COMPONENT: SHOP & CATALOG MANAGEMENT

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

    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="col-span-full text-center py-8 text-gray-500 text-xs">
          Belum ada produk di katalog toko. Tambahkan produk pertama di atas!
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(item => `
      <div class="glass-panel rounded-2xl overflow-hidden border border-white/5 flex flex-col justify-between p-4 space-y-3">
        <div class="space-y-2">
          ${item.imageUrl && item.imageUrl.trim().startsWith('http')
            ? `<img src="${escapeHtml(item.imageUrl)}" class="w-full h-32 object-cover rounded-xl border border-white/10 mb-2">`
            : `<div class="w-full h-24 bg-white/5 rounded-xl border border-white/10 flex items-center justify-center text-gray-500 text-xs font-mono mb-2"><i class="fa-solid fa-store text-xl mr-2"></i> No Image</div>`
          }
          <div class="flex justify-between items-start">
            <h4 class="font-bold text-sm text-white font-outfit">${escapeHtml(item.title)}</h4>
            <span class="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 font-bold text-xs font-mono whitespace-nowrap">${item.priceRtk} RTK</span>
          </div>
          <p class="text-xs text-gray-400 line-clamp-2">${escapeHtml(item.description || 'Tidak ada deskripsi.')}</p>
        </div>
        <button onclick="deleteProduct(${item.id})" class="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-semibold transition-all">
          <i class="fa-solid fa-trash mr-1"></i> Hapus Produk
        </button>
      </div>
    `).join('');
  } catch (error) {
    showToast('Shop Error', error.message || 'Gagal memuat produk.', 'error');
  }
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
    const res = await apiFetch(`/api/shop/items/${selectedGuildId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, priceRtk, category, imageUrl })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal menambah produk toko.');
    }

    showToast('Berhasil Ditambahkan', `Produk "${title}" telah ditambahkan ke katalog toko! 🛒`, 'success');
    
    // Clear inputs
    if (titleInput) titleInput.value = '';
    if (priceInput) priceInput.value = '';
    if (imageInput) imageInput.value = '';
    if (descInput) descInput.value = '';

    await loadShopProducts();
  } catch (error) {
    showToast('Gagal Menambah Produk', error.message, 'error');
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
          <td class="p-4 text-xs text-amber-400 font-bold font-outfit">${escapeHtml(o.itemTitle)} (${o.priceRtk} RTK)</td>
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
