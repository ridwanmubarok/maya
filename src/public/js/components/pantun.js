// Maya Lanjutkan Pantun Configuration & Live Showcase Component

let pantunPollInterval = null;

function populatePantunChannels(channels, selectedChannelId) {
  const select = document.getElementById('pantun-channel');
  if (!select) return;

  select.innerHTML = `<option value="">Pilih Channel Target (Contoh: #pantun / #berbalas-pantun)</option>` +
    channels.map(c => `
      <option value="${c.id}" ${c.id === selectedChannelId ? 'selected' : ''}>#${escapeHtml(c.name)}</option>
    `).join('');
}

async function loadPantunConfig(config, channels) {
  const enabledCheckbox = document.getElementById('pantun-enabled');
  if (enabledCheckbox) {
    enabledCheckbox.checked = config.pantunEnabled !== false;
  }

  const startHourInput = document.getElementById('pantun-start-hour');
  if (startHourInput) {
    startHourInput.value = config.pantunStartHour ?? 9;
  }

  const closeHourInput = document.getElementById('pantun-close-hour');
  if (closeHourInput) {
    closeHourInput.value = config.pantunCloseHour ?? 23;
  }

  const rewardInput = document.getElementById('pantun-reward-amount');
  if (rewardInput) {
    rewardInput.value = config.pantunRewardAmount ?? 15;
  }

  const mvpRewardInput = document.getElementById('pantun-mvp-reward');
  if (mvpRewardInput) {
    mvpRewardInput.value = config.pantunMvpReward ?? 150;
  }

  populatePantunChannels(channels, config.pantunChannelId);
  await fetchPantunData();

  if (pantunPollInterval) clearInterval(pantunPollInterval);
  pantunPollInterval = setInterval(fetchPantunData, 10000);
}

async function fetchPantunData() {
  if (!selectedGuildId) return;

  try {
    const res = await apiFetch(`/api/configs/${selectedGuildId}/pantun`);
    if (!res.ok) return;

    const data = await res.json();
    renderPantunShowcase(data.todayPantun);
  } catch (err) {
    console.error("Error loading Pantun data:", err);
  }
}

function renderPantunShowcase(pantun) {
  const showcaseContainer = document.getElementById('pantun-today-showcase');
  const feedContainer = document.getElementById('pantun-submissions-feed');
  const countBadge = document.getElementById('pantun-submission-count');

  if (!showcaseContainer || !feedContainer) return;

  if (!pantun) {
    showcaseContainer.innerHTML = `
      <div class="glass-panel p-6 rounded-2xl border border-white/5 text-center space-y-2">
        <i class="fa-solid fa-scroll text-3xl text-amber-400/60 block mb-2"></i>
        <h4 class="text-sm font-semibold text-white">Sesi Pantun Hari Ini Belum Dimulai</h4>
        <p class="text-xs text-gray-400">Sesi akan otomatis dibuka jam 09:00 WIB atau klik tombol 'Buka Sesi Sekarang'.</p>
      </div>
    `;
    feedContainer.innerHTML = `
      <div class="py-8 text-center text-gray-500 text-xs italic">Belum ada kiriman pantun hari ini.</div>
    `;
    if (countBadge) countBadge.textContent = '0 Pantun';
    return;
  }

  const isSessionOpen = pantun.isActive;
  const submissions = pantun.submissions || [];

  if (countBadge) {
    countBadge.textContent = `${submissions.length} Pantun Dikirim`;
  }

  // Render Starter Showcase Card
  const starterHtml = `
    <div class="glass-panel p-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-3 relative overflow-hidden">
      <div class="flex justify-between items-center">
        <span class="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
          <i class="fa-solid fa-masks-theater"></i> ${escapeHtml(pantun.theme || 'Pantun Hari Ini')}
        </span>
        <span class="text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${isSessionOpen ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-gray-700 text-gray-300'}">
          ${isSessionOpen ? '🟢 Sesi Aktif (09:00 - 23:00 WIB)' : '🔴 Sesi Ditutup (MVP Selesai)'}
        </span>
      </div>

      <div class="bg-black/40 p-4 rounded-xl border border-white/10 font-mono text-sm text-gray-200 leading-relaxed whitespace-pre-line">
        ${escapeHtml(pantun.starterLines)}
      </div>

      ${pantun.mvpUserId && pantun.mvpPantun ? `
        <div class="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1.5">
          <div class="flex items-center gap-2 text-emerald-400 text-xs font-bold">
            <i class="fa-solid fa-crown"></i> Juara MVP Pantun: @${escapeHtml(pantun.mvpUsername || 'Member')}
          </div>
          <div class="text-xs font-mono text-white italic whitespace-pre-line">"${escapeHtml(pantun.mvpPantun)}"</div>
          <div class="text-[11px] text-gray-400 mt-1">💬 <em>${escapeHtml(pantun.mvpReason || 'Pantun paling berima & kreatif!')}</em></div>
        </div>
      ` : ''}
    </div>
  `;
  showcaseContainer.innerHTML = starterHtml;

  // Render Submissions Feed
  if (submissions.length === 0) {
    feedContainer.innerHTML = `
      <div class="py-8 text-center text-gray-500 text-xs italic bg-white/2 rounded-xl border border-white/5">
        Belum ada member yang mengirim pantun lanjutan hari ini. Jadilah yang pertama di channel pantun!
      </div>
    `;
    return;
  }

  feedContainer.innerHTML = submissions.map((sub, idx) => {
    const timeStr = sub.createdAt ? new Date(sub.createdAt).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit'
    }) : '-';

    const isMvp = pantun.mvpUserId && pantun.mvpUserId === sub.userId;

    return `
      <div class="p-3.5 rounded-xl border ${isMvp ? 'border-amber-400/50 bg-amber-500/10' : 'border-white/5 bg-white/2'} space-y-1.5 transition-all hover:bg-white/5">
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-2">
            ${sub.userAvatar ? `<img src="${sub.userAvatar}" class="w-5 h-5 rounded-full object-cover" />` : `<div class="w-5 h-5 rounded-full bg-discord-blurple/50 flex items-center justify-center text-[10px] text-white font-bold">#</div>`}
            <span class="text-xs font-semibold text-white">@${escapeHtml(sub.username)}</span>
            ${isMvp ? `<span class="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded font-bold">👑 MVP</span>` : ''}
          </div>
          <span class="text-[10px] font-mono text-gray-500">${timeStr} WIB</span>
        </div>
        <div class="text-xs font-mono text-gray-200 whitespace-pre-line pl-7">
          "${escapeHtml(sub.content)}"
        </div>
      </div>
    `;
  }).join('');
}

async function savePantunConfig() {
  if (!selectedGuildId) {
    showToast('Pilih Server', 'Silakan pilih server terlebih dahulu.', 'error');
    return;
  }

  const enabled = document.getElementById('pantun-enabled')?.checked ?? true;
  const channelId = document.getElementById('pantun-channel')?.value || null;
  const startHour = parseInt(document.getElementById('pantun-start-hour')?.value || '9', 10);
  const closeHour = parseInt(document.getElementById('pantun-close-hour')?.value || '23', 10);
  const rewardAmount = parseInt(document.getElementById('pantun-reward-amount')?.value || '15', 10);
  const mvpReward = parseInt(document.getElementById('pantun-mvp-reward')?.value || '150', 10);

  try {
    const response = await apiFetch(`/api/configs/${selectedGuildId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pantunEnabled: enabled,
        pantunChannelId: channelId,
        pantunStartHour: startHour,
        pantunCloseHour: closeHour,
        pantunRewardAmount: rewardAmount,
        pantunMvpReward: mvpReward
      })
    });

    if (response.ok) {
      showToast('Berhasil Disimpan', 'Pengaturan Maya Lanjutkan Pantun berhasil diperbarui.', 'success');
      fetchPantunData();
    } else {
      showToast('Gagal Menyimpan', 'Terjadi kesalahan saat menyimpan pengaturan.', 'error');
    }
  } catch (error) {
    showToast('Gagal Menyimpan', 'Terjadi kesalahan koneksi.', 'error');
  }
}

async function triggerStartPantun() {
  if (!selectedGuildId) {
    showToast('Pilih Server', 'Silakan pilih server terlebih dahulu.', 'error');
    return;
  }

  const btn = document.getElementById('btn-trigger-start-pantun');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Membuka Sesi...`;
  }

  try {
    const res = await apiFetch(`/api/configs/${selectedGuildId}/pantun/start`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      showToast('Sesi Dibuka', data.message || 'Sesi pantun berhasil dibuka di Discord!', 'success');
      setTimeout(fetchPantunData, 1000);
    } else {
      showToast('Gagal Membuka Sesi', data.error || 'Pastikan channel target pantun sudah diatur.', 'error');
    }
  } catch (err) {
    showToast('Error', 'Terjadi kesalahan jaringan.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-play mr-1.5"></i> Buka Sesi Hari Ini`;
    }
  }
}

async function triggerClosePantun() {
  if (!selectedGuildId) {
    showToast('Pilih Server', 'Silakan pilih server terlebih dahulu.', 'error');
    return;
  }

  if (!confirm('Apakah Anda yakin ingin menutup sesi pantun dan menilai MVP sekarang?')) {
    return;
  }

  const btn = document.getElementById('btn-trigger-close-pantun');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menilai MVP...`;
  }

  try {
    const res = await apiFetch(`/api/configs/${selectedGuildId}/pantun/close`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      showToast('Sesi Ditutup & Dinilai', data.message || 'Sesi pantun berhasil dinilai oleh Maya AI!', 'success');
      setTimeout(fetchPantunData, 1000);
    } else {
      showToast('Gagal Menutup Sesi', data.error || 'Gagal menutup sesi pantun.', 'error');
    }
  } catch (err) {
    showToast('Error', 'Terjadi kesalahan jaringan.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-crown mr-1.5"></i> Tutup & Nilai MVP`;
    }
  }
}
