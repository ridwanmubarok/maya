// AI Memory & History Logic

async function loadAiHistory() {
  const historyList = document.getElementById('ai-history-list');
  if (!historyList) return;
  if (!selectedGuildId) {
    historyList.innerHTML = `<div class="p-6 text-center text-amber-400/90 text-xs italic bg-amber-500/5 rounded-xl border border-amber-500/10"><i class="fa-solid fa-hand-pointer mr-1.5"></i> Silakan pilih server di sidebar sebelah kiri terlebih dahulu.</div>`;
    return;
  }

  try {
    const response = await apiFetch(`/api/ai/${selectedGuildId}/history`);
    if (!response.ok) throw new Error();
    const data = await response.json();
    const history = data.history || [];

    if (history.length === 0) {
      historyList.innerHTML = `<div class="text-center py-6 text-gray-500 text-xs italic">Belum ada memori percakapan AI di server ini. Ucapkan salam ke Maya dengan perintah /ask!</div>`;
      return;
    }

    historyList.innerHTML = history.map(item => {
      const isUser = item.role === 'user';
      const badgeColor = isUser ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      const icon = isUser ? 'fa-user' : 'fa-robot';
      const name = isUser ? `@${escapeHtml(item.username)}` : 'Maya (AI)';
      const time = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const safeContent = escapeHtml(item.content);

      return `
        <div class="flex flex-col gap-1 p-3 rounded-xl ${isUser ? 'bg-white/[0.02]' : 'bg-discord-blurple/10'} border border-white/5 text-xs">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${badgeColor} flex items-center gap-1">
                <i class="fa-solid ${icon}"></i> ${name}
              </span>
              <span class="text-[10px] text-gray-500">${time}</span>
            </div>
          </div>
          <div class="text-gray-200 mt-1 whitespace-pre-wrap leading-relaxed">${safeContent}</div>
        </div>
      `;
    }).join('');
    
    // Auto scroll to bottom
    historyList.scrollTop = historyList.scrollHeight;
  } catch (error) {
    if (error.message !== '401 Unauthorized') {
      historyList.innerHTML = `<div class="text-center py-6 text-red-400 text-xs">Gagal mengambil memori percakapan AI.</div>`;
    }
  }
}

async function clearAiMemory() {
  if (!selectedGuildId) {
    showToast('Error', 'Silakan pilih server terlebih dahulu.', 'error');
    return;
  }
  if (!confirm('Apakah Anda yakin ingin menghapus seluruh memori percakapan AI Maya untuk server ini?')) return;

  try {
    const response = await apiFetch(`/api/ai/${selectedGuildId}/history/reset`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error();
    showToast('Memori AI Dibersihkan', 'Seluruh konteks riwayat percakapan Maya di server ini berhasil di-reset.', 'success');
    loadAiHistory();
  } catch (error) {
    if (error.message !== '401 Unauthorized') {
      showToast('Gagal Reset Memori', 'Terjadi kesalahan saat menghapus memori AI.', 'error');
    }
  }
}
