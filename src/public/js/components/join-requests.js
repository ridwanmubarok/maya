// FRONTEND COMPONENT: MEMBER APPROVAL & GUILD JOIN REQUESTS

let currentJoinRequestsFilter = 'SUBMITTED';
let pendingRejectRequestId = null;
let pendingRejectApplicantName = '';
let pendingRejectIsScreening = false;
let pendingRejectUserId = null;

/**
 * Main entry point for loading Join Requests & Approvals
 */
async function loadJoinRequestsData() {
  if (!selectedGuildId) return;

  const container = document.getElementById('join-requests-list-container');
  if (!container) return;

  // Show loading spinner
  container.innerHTML = `
    <div class="col-span-full text-center py-12 text-gray-500 text-sm">
      <i class="fa-solid fa-circle-notch fa-spin text-2xl mb-3 text-discord-blurple"></i>
      <p>Memuat data permohonan anggota...</p>
    </div>
  `;

  if (currentJoinRequestsFilter === 'PENDING_MEMBERS') {
    await loadPendingScreeningMembers();
    return;
  }

  try {
    const res = await apiFetch(`/api/join-requests/${selectedGuildId}?status=${currentJoinRequestsFilter}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal memuat daftar permohonan.');
    }

    const data = await res.json();
    renderJoinRequests(data.requests || [], data.hasFeature, data.error, data.total);
    updatePendingBadge();
  } catch (error) {
    container.innerHTML = `
      <div class="col-span-full p-6 glass-panel rounded-2xl border border-red-500/20 text-center space-y-3">
        <i class="fa-solid fa-triangle-exclamation text-3xl text-red-400"></i>
        <h4 class="font-outfit font-bold text-white text-base">Gagal Mengambil Data</h4>
        <p class="text-xs text-gray-400 max-w-md mx-auto">${escapeHtml(error.message || 'Terjadi kesalahan saat memuat data.')}</p>
        <button onclick="loadJoinRequestsData()" class="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs text-white border border-white/10 transition-all">
          <i class="fa-solid fa-rotate-right mr-1"></i> Coba Lagi
        </button>
      </div>
    `;
  }
}

/**
 * Switch filter tabs (SUBMITTED, APPROVED, REJECTED, PENDING_MEMBERS)
 */
function setJoinRequestsFilter(filter) {
  currentJoinRequestsFilter = filter;

  // Update button active states
  const buttons = ['SUBMITTED', 'APPROVED', 'REJECTED', 'PENDING_MEMBERS'];
  buttons.forEach(b => {
    const btn = document.getElementById(`filter-btn-jr-${b}`);
    if (btn) {
      if (b === filter) {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-discord-blurple text-white shadow-lg shadow-discord-blurple/20 transition-all flex items-center gap-1.5';
      } else {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/5 transition-all flex items-center gap-1.5';
      }
    }
  });

  loadJoinRequestsData();
}

/**
 * Render Join Requests list
 */
function renderJoinRequests(requests, hasFeature, errorMessage, total) {
  const container = document.getElementById('join-requests-list-container');
  if (!container) return;

  // If server does not have Apply to Join or bot lacks permission
  if (!hasFeature && errorMessage) {
    container.innerHTML = `
      <div class="col-span-full p-6 glass-panel rounded-2xl border border-amber-500/20 bg-amber-500/5 space-y-4">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-circle-info text-lg"></i>
          </div>
          <div class="space-y-1">
            <h4 class="font-outfit font-bold text-white text-base">Fitur Server Member Applications Belum Aktif</h4>
            <p class="text-xs text-gray-300 leading-relaxed">${escapeHtml(errorMessage)}</p>
          </div>
        </div>
        <div class="p-4 bg-black/20 rounded-xl border border-white/5 text-xs text-gray-400 space-y-2">
          <p class="font-semibold text-white"><i class="fa-solid fa-list-check text-discord-blurple mr-1.5"></i> Cara Mengaktifkan di Discord:</p>
          <ol class="list-decimal list-inside space-y-1 pl-1">
            <li>Buka <strong>Server Settings</strong> &gt; <strong>Safety Setup</strong> di Discord server Anda.</li>
            <li>Di bagian <strong>Member Verification</strong>, aktifkan opsi <strong>Require manual approval (Apply to Join)</strong>.</li>
            <li>Pastikan role bot Maya memiliki izin <strong>Kick Members</strong> (Keluarkan Anggota) untuk menyetujui pemohon.</li>
          </ol>
        </div>
        <div class="pt-2 flex items-center justify-between">
          <span class="text-xs text-gray-400">Atau lihat member yang tertahan di Membership Screening:</span>
          <button onclick="setJoinRequestsFilter('PENDING_MEMBERS')" class="px-3.5 py-2 bg-discord-blurple/20 hover:bg-discord-blurple/30 border border-discord-blurple/30 text-discord-blurple text-xs font-semibold rounded-xl transition-all">
            <i class="fa-solid fa-users-viewfinder mr-1.5"></i> Cek Member Pending di Server
          </button>
        </div>
      </div>
    `;
    return;
  }

  if (!requests || requests.length === 0) {
    let emptyMsg = "Tidak ada permohonan yang sedang menunggu persetujuan saat ini.";
    if (currentJoinRequestsFilter === 'APPROVED') emptyMsg = "Belum ada riwayat permohonan yang disetujui.";
    if (currentJoinRequestsFilter === 'REJECTED') emptyMsg = "Belum ada riwayat permohonan yang ditolak.";

    container.innerHTML = `
      <div class="col-span-full text-center py-12 text-gray-500 text-xs glass-panel rounded-2xl border border-white/5 space-y-2">
        <i class="fa-solid fa-inbox text-3xl mb-1 text-gray-600 block"></i>
        <p class="text-gray-400 text-sm font-medium font-outfit">Kotak Permohonan Kosong</p>
        <p>${emptyMsg}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = requests.map(req => {
    const user = req.user || {};
    const avatarUrl = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
      : 'https://cdn.discordapp.com/embed/avatars/0.png';

    const displayName = user.global_name || user.username || 'Pengguna Tidak Dikenal';
    const tag = user.discriminator && user.discriminator !== '0' ? `#${user.discriminator}` : '';
    const formattedDate = req.created_at ? formatDateTime(req.created_at) : '-';

    // Status badge
    let statusBadge = '';
    if (req.application_status === 'SUBMITTED') {
      statusBadge = `<span class="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[11px] font-semibold flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span> Menunggu</span>`;
    } else if (req.application_status === 'APPROVED') {
      statusBadge = `<span class="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold flex items-center gap-1.5"><i class="fa-solid fa-check text-xs"></i> Disetujui</span>`;
    } else if (req.application_status === 'REJECTED') {
      statusBadge = `<span class="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[11px] font-semibold flex items-center gap-1.5"><i class="fa-solid fa-xmark text-xs"></i> Ditolak</span>`;
    }

    // Render questions/form answers
    let formResponsesHtml = '';
    if (req.form_responses && req.form_responses.length > 0) {
      formResponsesHtml = `
        <div class="mt-3 pt-3 border-t border-white/5 space-y-2">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <i class="fa-solid fa-clipboard-question text-discord-blurple"></i> Jawaban Formulir Masuk:
          </p>
          <div class="space-y-2">
            ${req.form_responses.map(field => {
              let answerDisplay = '';
              if (field.field_type === 'TERMS') {
                answerDisplay = field.response === true 
                  ? `<span class="text-emerald-400 font-semibold text-xs"><i class="fa-solid fa-circle-check mr-1"></i> Menyetujui semua peraturan server</span>`
                  : `<span class="text-rose-400 text-xs">Belum menyetujui aturan</span>`;
              } else if (field.field_type === 'MULTIPLE_CHOICE') {
                const choiceText = (field.choices && field.choices[field.response]) ? field.choices[field.response] : String(field.response);
                answerDisplay = `<span class="text-white text-xs bg-white/5 px-2 py-0.5 rounded border border-white/10">${escapeHtml(choiceText)}</span>`;
              } else {
                answerDisplay = `<p class="text-xs text-gray-200 bg-black/20 p-2.5 rounded-lg border border-white/5 whitespace-pre-wrap">${escapeHtml(String(field.response || '-'))}</p>`;
              }

              return `
                <div class="text-xs space-y-1">
                  <div class="font-medium text-gray-400">${escapeHtml(field.label || 'Pertanyaan')}</div>
                  <div>${answerDisplay}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    // Rejection reason if any
    let rejectionReasonHtml = '';
    if (req.rejection_reason) {
      rejectionReasonHtml = `
        <div class="mt-2 p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300">
          <span class="font-semibold">Alasan Penolakan:</span> ${escapeHtml(req.rejection_reason)}
        </div>
      `;
    }

    // Action buttons
    let actionButtonsHtml = '';
    if (req.application_status === 'SUBMITTED') {
      actionButtonsHtml = `
        <div class="flex items-center gap-2 pt-3 border-t border-white/5">
          <button 
            onclick="approveJoinRequest('${req.id}', '${escapeHtml(displayName)}')" 
            class="flex-1 py-2 px-3 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm"
          >
            <i class="fa-solid fa-check"></i> Terima Member
          </button>
          <button 
            onclick="openRejectModal('${req.id}', '${escapeHtml(displayName)}', false)" 
            class="py-2 px-3.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
          >
            <i class="fa-solid fa-xmark"></i> Tolak
          </button>
        </div>
      `;
    }

    return `
      <div class="glass-panel rounded-2xl p-5 border border-white/5 flex flex-col justify-between space-y-3 hover:border-white/10 transition-all">
        <div class="space-y-3">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <img src="${avatarUrl}" class="w-12 h-12 rounded-2xl object-cover border border-white/10 shrink-0" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
              <div class="min-w-0">
                <h4 class="font-outfit font-bold text-white text-sm truncate flex items-center gap-1.5">
                  ${escapeHtml(displayName)}
                  ${tag ? `<span class="text-xs text-gray-500 font-normal font-mono">${escapeHtml(tag)}</span>` : ''}
                </h4>
                <p class="text-[11px] text-gray-400 font-mono">ID: ${escapeHtml(req.user_id || user.id)}</p>
              </div>
            </div>
            ${statusBadge}
          </div>

          <div class="flex items-center gap-1.5 text-[11px] text-gray-400">
            <i class="fa-regular fa-clock text-discord-blurple"></i> Diajukan: <span class="text-gray-300">${formattedDate}</span>
          </div>

          ${formResponsesHtml}
          ${rejectionReasonHtml}
        </div>

        ${actionButtonsHtml}
      </div>
    `;
  }).join('');
}

/**
 * Load members currently pending in guild (Membership screening)
 */
async function loadPendingScreeningMembers() {
  const container = document.getElementById('join-requests-list-container');
  if (!container) return;

  try {
    const res = await apiFetch(`/api/join-requests/${selectedGuildId}/pending-members`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal memuat pending members.');
    }

    const { total, members } = await res.json();

    if (!members || members.length === 0) {
      container.innerHTML = `
        <div class="col-span-full text-center py-12 text-gray-500 text-xs glass-panel rounded-2xl border border-white/5 space-y-2">
          <i class="fa-solid fa-user-check text-3xl mb-1 text-emerald-500/50 block"></i>
          <p class="text-white text-sm font-medium font-outfit">Semua Anggota Sudah Terverifikasi</p>
          <p>Tidak ada member di server yang berstatus pending (tertahan di Membership Screening).</p>
        </div>
      `;
      return;
    }

    container.innerHTML = members.map(m => {
      const formattedJoin = m.joinedAt ? formatDateTime(m.joinedAt) : '-';
      const formattedCreated = m.createdAt ? formatDateTime(m.createdAt) : '-';

      return `
        <div class="glass-panel rounded-2xl p-5 border border-white/5 flex flex-col justify-between space-y-4 hover:border-white/10 transition-all">
          <div class="space-y-3">
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-3 min-w-0">
                <img src="${m.avatar}" class="w-12 h-12 rounded-2xl object-cover border border-white/10 shrink-0">
                <div class="min-w-0">
                  <h4 class="font-outfit font-bold text-white text-sm truncate">${escapeHtml(m.displayName)}</h4>
                  <p class="text-[11px] text-gray-400 font-mono">${escapeHtml(m.tag)}</p>
                </div>
              </div>
              <span class="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[11px] font-semibold flex items-center gap-1.5">
                <i class="fa-solid fa-hourglass-half text-xs"></i> Pending Screening
              </span>
            </div>

            <div class="grid grid-cols-2 gap-2 p-3 bg-black/20 rounded-xl border border-white/5 text-[11px]">
              <div>
                <span class="text-gray-500 block">Bergabung Pada:</span>
                <span class="text-gray-300 font-medium">${formattedJoin}</span>
              </div>
              <div>
                <span class="text-gray-500 block">Akun Dibuat:</span>
                <span class="text-gray-300 font-medium">${formattedCreated}</span>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2 pt-2 border-t border-white/5">
            <button 
              onclick="approvePendingMemberAction('${m.id}', '${escapeHtml(m.displayName)}')" 
              class="flex-1 py-2 px-3 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
            >
              <i class="fa-solid fa-shield-check"></i> Beri Akses Role
            </button>
            <button 
              onclick="openRejectModal(null, '${escapeHtml(m.displayName)}', true, '${m.id}')" 
              class="py-2 px-3.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
            >
              <i class="fa-solid fa-user-xmark"></i> Kick
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    container.innerHTML = `
      <div class="col-span-full p-6 glass-panel rounded-2xl border border-red-500/20 text-center space-y-2">
        <i class="fa-solid fa-triangle-exclamation text-2xl text-red-400"></i>
        <p class="text-xs text-gray-400">${escapeHtml(error.message || 'Gagal memuat pending members.')}</p>
      </div>
    `;
  }
}

/**
 * Approve a join request
 */
async function approveJoinRequest(requestId, applicantName) {
  if (!confirm(`Apakah Anda yakin ingin menyetujui permohonan masuk dari "${applicantName}"?`)) {
    return;
  }

  try {
    const res = await apiFetch(`/api/join-requests/${selectedGuildId}/${requestId}/action`, {
      method: 'POST',
      body: { action: 'APPROVED' }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal menyetujui permohonan.');
    }

    showToast('Member Diterima', `Permohonan masuk ${applicantName} berhasil disetujui!`, 'success');
    loadJoinRequestsData();
  } catch (error) {
    showToast('Gagal Menyetujui', error.message || 'Terjadi kesalahan.', 'error');
  }
}

/**
 * Open reject modal
 */
function openRejectModal(requestId, applicantName, isScreening = false, userId = null) {
  pendingRejectRequestId = requestId;
  pendingRejectApplicantName = applicantName;
  pendingRejectIsScreening = isScreening;
  pendingRejectUserId = userId;

  const modal = document.getElementById('join-request-reject-modal');
  const nameEl = document.getElementById('reject-applicant-name');
  const reasonInput = document.getElementById('reject-reason-input');

  if (nameEl) nameEl.innerText = applicantName;
  if (reasonInput) reasonInput.value = '';

  if (modal) modal.classList.remove('hidden');
}

/**
 * Close reject modal
 */
function closeRejectModal() {
  const modal = document.getElementById('join-request-reject-modal');
  if (modal) modal.classList.add('hidden');
  pendingRejectRequestId = null;
  pendingRejectApplicantName = '';
  pendingRejectIsScreening = false;
  pendingRejectUserId = null;
}

/**
 * Confirm rejection from modal
 */
async function confirmRejectRequest() {
  const reasonInput = document.getElementById('reject-reason-input');
  const reason = reasonInput ? reasonInput.value.trim() : '';

  try {
    if (pendingRejectIsScreening && pendingRejectUserId) {
      // Reject / kick pending screening member
      const res = await apiFetch(`/api/join-requests/${selectedGuildId}/pending-members/${pendingRejectUserId}/reject`, {
        method: 'POST',
        body: { reason: reason || 'Ditolak via Maya Web Dashboard' }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Gagal mengeluarkan member.');
      }
      showToast('Member Dikeluarkan', `${pendingRejectApplicantName} berhasil dikeluarkan dari server.`, 'success');
    } else if (pendingRejectRequestId) {
      // Reject Guild Join Request
      const res = await apiFetch(`/api/join-requests/${selectedGuildId}/${pendingRejectRequestId}/action`, {
        method: 'POST',
        body: { 
          action: 'REJECTED',
          rejectionReason: reason || undefined
        }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Gagal menolak permohonan.');
      }
      showToast('Permohonan Ditolak', `Permohonan masuk ${pendingRejectApplicantName} telah ditolak.`, 'info');
    }

    closeRejectModal();
    loadJoinRequestsData();
  } catch (error) {
    showToast('Gagal Menolak', error.message || 'Terjadi kesalahan.', 'error');
  }
}

/**
 * Approve pending member in server by giving role
 */
async function approvePendingMemberAction(userId, username) {
  try {
    const res = await apiFetch(`/api/join-requests/${selectedGuildId}/pending-members/${userId}/approve`, {
      method: 'POST',
      body: {}
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal memberikan role akses.');
    }

    const data = await res.json();
    showToast('Akses Diberikan', data.message || `Member ${username} berhasil disetujui!`, 'success');
    loadPendingScreeningMembers();
  } catch (error) {
    showToast('Gagal Menyetujui', error.message || 'Terjadi kesalahan.', 'error');
  }
}

/**
 * Update badge counter on the sidebar or tab
 */
async function updatePendingBadge() {
  const badge = document.getElementById('pending-requests-count-badge');
  if (!badge || !selectedGuildId) return;

  try {
    const res = await apiFetch(`/api/join-requests/${selectedGuildId}?status=SUBMITTED&limit=1`);
    if (res.ok) {
      const data = await res.json();
      const count = data.total || 0;
      if (count > 0) {
        badge.innerText = count > 99 ? '99+' : String(count);
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  } catch (_) {}
}

/**
 * Date formatting helper
 */
function formatDateTime(isoString) {
  try {
    const d = new Date(isoString);
    return d.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (_) {
    return isoString;
  }
}
