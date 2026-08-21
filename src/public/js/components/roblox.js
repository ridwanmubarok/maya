// Roblox Photo Snap Configuration & Live Gallery Component

let currentRobloxApiKey = '';
let robloxGalleryInterval = null;

function populateRobloxChannels(channels, selectedChannelId) {
  const select = document.getElementById('roblox-channel');
  if (!select) return;

  select.innerHTML = `<option value="">Pilih Channel Target (Contoh: #roblox-snaps / #gallery)</option>` +
    channels.map(c => `
      <option value="${c.id}" ${c.id === selectedChannelId ? 'selected' : ''}>#${escapeHtml(c.name)}</option>
    `).join('');
}

async function loadRobloxConfig(config, channels) {
  const enabledCheckbox = document.getElementById('roblox-enabled');
  if (enabledCheckbox) {
    enabledCheckbox.checked = config.robloxEnabled !== false;
  }

  populateRobloxChannels(channels, config.robloxChannelId);
  await fetchRobloxData();

  if (robloxGalleryInterval) clearInterval(robloxGalleryInterval);
  robloxGalleryInterval = setInterval(fetchRobloxData, 10000);
}

async function fetchRobloxData() {
  if (!selectedGuildId) return;

  try {
    const res = await apiFetch(`/api/configs/${selectedGuildId}/roblox`);
    if (!res.ok) return;

    const data = await res.json();
    currentRobloxApiKey = data.apiKey || '';

    // Update API Key Input
    const keyInput = document.getElementById('roblox-api-key');
    if (keyInput) {
      keyInput.value = currentRobloxApiKey || 'Klik tombol Generate untuk membuat API Key';
    }

    // Update Code Snippet for Roblox Studio
    updateRobloxCodeSnippet(currentRobloxApiKey);

    // Render Photo Gallery
    renderRobloxGallery(data.photos || []);

  } catch (err) {
    console.error("Error loading Roblox data:", err);
  }
}

function updateRobloxCodeSnippet(apiKey) {
  const codeBlock = document.getElementById('roblox-luau-code');
  if (!codeBlock) return;

  const currentHost = window.location.origin;
  const snippet = `-- [[ ROBLOX PHOTO SNAP - SERVER SCRIPT ]]
-- Letakkan script ini di ServerScriptService atau panggil dari RemoteFunction

local HttpService = game:GetService("HttpService")

local MAYA_ENDPOINT = "${currentHost}/api/roblox/photo"
local API_KEY = "${apiKey || "PASTE_YOUR_API_KEY_HERE"}"

local function sendPhotoToDiscord(player, imageBase64OrUrl, caption, gameName)
    local payload = {
        playerName = player.Name,
        playerUserId = tostring(player.UserId),
        caption = caption or "Foto seru dari in-game!",
        gameName = gameName or game.Name,
        placeId = tostring(game.PlaceId)
    }
    
    -- Jika formatnya URL gambar atau Base64:
    if string.sub(imageBase64OrUrl, 1, 4) == "http" then
        payload.imageUrl = imageBase64OrUrl
    else
        payload.imageBase64 = imageBase64OrUrl
    end

    local jsonPayload = HttpService:JSONEncode(payload)

    local success, response = pcall(function()
        return HttpService:RequestAsync({
            Url = MAYA_ENDPOINT,
            Method = "POST",
            Headers = {
                ["Content-Type"] = "application/json",
                ["x-api-key"] = API_KEY
            },
            Body = jsonPayload
        })
    end)

    if success and response.Success then
        print("[Maya Snap] Foto berhasil dikirim ke Discord! Response: " .. response.Body)
        return true
    else
        warn("[Maya Snap] Gagal mengirim foto ke Discord:", response)
        return false
    end
end

-- Contoh Event: Sambungkan dengan RemoteEvent dari kamera UI player
-- game.ReplicatedStorage.TakeSnapshotEvent.OnServerEvent:Connect(function(player, imageData, caption)
--     sendPhotoToDiscord(player, imageData, caption)
-- end)`;

  codeBlock.textContent = snippet;
}

function renderRobloxGallery(photos) {
  const gallery = document.getElementById('roblox-photo-gallery');
  const countBadge = document.getElementById('roblox-photo-count');

  if (countBadge) {
    countBadge.textContent = `${photos.length} Foto Tersimpan`;
  }

  if (!gallery) return;

  if (photos.length === 0) {
    gallery.innerHTML = `
      <div class="col-span-full py-12 text-center text-gray-500 italic bg-white/2 rounded-2xl border border-white/5">
        <i class="fa-solid fa-camera-retro text-3xl text-gray-600 mb-2 block"></i>
        Belum ada foto yang dikirim dari game Roblox. Klik tombol 'Tes Kirim Foto' atau ambil foto di game Anda!
      </div>
    `;
    return;
  }

  gallery.innerHTML = photos.map(p => {
    const timeStr = p.createdAt ? new Date(p.createdAt).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }) : '-';

    return `
      <div class="glass-panel rounded-2xl overflow-hidden border border-white/10 group hover:border-sky-500/50 transition-all shadow-lg flex flex-col">
        <div class="aspect-video w-full bg-black/40 overflow-hidden relative">
          <img src="${escapeHtml(p.imageUrl)}" alt="Roblox Snapshot" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
          <div class="absolute bottom-2 left-2 right-2 flex justify-between items-center text-[10px] bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-lg text-white">
            <span class="font-semibold truncate max-w-[120px]">👤 ${escapeHtml(p.playerName)}</span>
            <span class="font-mono text-gray-300 text-[9px]">${timeStr}</span>
          </div>
        </div>
        <div class="p-3.5 space-y-2 bg-discord-dark/80 flex-1 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between text-xs font-semibold text-white">
              <span class="truncate">${escapeHtml(p.gameName || 'Roblox Experience')}</span>
              ${p.playerUserId ? `<span class="text-[10px] text-gray-500 font-mono">UID: ${p.playerUserId}</span>` : ''}
            </div>
            <div class="text-[11px] text-gray-300 italic line-clamp-2 mt-1">"${escapeHtml(p.caption || 'Foto in-game Roblox')}"</div>
          </div>
          <div class="pt-2 flex justify-between items-center border-t border-white/5 text-[10px]">
            <a href="${escapeHtml(p.imageUrl)}" target="_blank" class="text-sky-400 hover:text-sky-300 flex items-center gap-1 font-semibold">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Buka HD (S3)
            </a>
            ${p.placeId ? `
              <a href="https://www.roblox.com/games/${p.placeId}" target="_blank" class="text-gray-400 hover:text-white flex items-center gap-1">
                <i class="fa-solid fa-gamepad"></i> Place Link
              </a>
            ` : `<span class="font-mono text-gray-500 text-[9px]">ID: #${p.id}</span>`}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function saveRobloxConfig() {
  if (!selectedGuildId) {
    showToast('Pilih Server', 'Silakan pilih server terlebih dahulu.', 'error');
    return;
  }

  const enabled = document.getElementById('roblox-enabled')?.checked ?? true;
  const channelId = document.getElementById('roblox-channel')?.value || null;

  try {
    const response = await apiFetch(`/api/configs/${selectedGuildId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        robloxEnabled: enabled,
        robloxChannelId: channelId
      })
    });

    if (response.ok) {
      showToast('Berhasil Disimpan', 'Konfigurasi Roblox Photo Snap berhasil diperbarui.', 'success');
      fetchRobloxData();
    } else {
      showToast('Gagal Menyimpan', 'Terjadi kesalahan saat menyimpan pengaturan Roblox.', 'error');
    }
  } catch (error) {
    showToast('Gagal Menyimpan', 'Terjadi kesalahan koneksi.', 'error');
  }
}

async function testRobloxPhotoBroadcast() {
  if (!selectedGuildId) {
    showToast('Pilih Server', 'Silakan pilih server terlebih dahulu.', 'error');
    return;
  }

  const btn = document.getElementById('btn-test-roblox');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Mengirim Tes...`;
  }

  try {
    const res = await apiFetch(`/api/configs/${selectedGuildId}/test-roblox-photo`, {
      method: 'POST'
    });

    if (res.ok) {
      const data = await res.json();
      showToast('Tes Terkirim', data.message || 'Foto tes berhasil diposting ke channel Discord!', 'success');
      setTimeout(fetchRobloxData, 1000);
    } else {
      const err = await res.json().catch(() => ({}));
      showToast('Gagal Tes', err.message || err.error || 'Pastikan channel target sudah diatur dan disimpan.', 'error');
    }
  } catch (err) {
    showToast('Error', err.message || 'Terjadi kesalahan jaringan.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Tes Kirim Snapshot`;
    }
  }
}

async function generateNewRobloxKey() {
  if (!selectedGuildId) {
    showToast('Pilih Server', 'Silakan pilih server terlebih dahulu.', 'error');
    return;
  }

  if (!confirm('Apakah Anda yakin ingin membuat API Key baru? API Key lama tidak akan bisa digunakan lagi oleh game Roblox.')) {
    return;
  }

  try {
    const res = await apiFetch(`/api/configs/${selectedGuildId}/roblox-key`, {
      method: 'POST'
    });

    if (res.ok) {
      const data = await res.json();
      currentRobloxApiKey = data.apiKey;
      const keyInput = document.getElementById('roblox-api-key');
      if (keyInput) keyInput.value = data.apiKey;
      updateRobloxCodeSnippet(data.apiKey);
      showToast('API Key Baru Dibuat', 'API Key Roblox berhasil di-generate!', 'success');
    } else {
      showToast('Gagal Generate', 'Gagal membuat API Key baru.', 'error');
    }
  } catch (err) {
    showToast('Error', 'Terjadi kesalahan koneksi.', 'error');
  }
}

function copyRobloxApiKey() {
  const keyInput = document.getElementById('roblox-api-key');
  if (!keyInput || !keyInput.value || keyInput.value.includes('Klik tombol')) {
    showToast('Key Kosong', 'Silakan klik Generate API Key terlebih dahulu.', 'error');
    return;
  }

  navigator.clipboard.writeText(keyInput.value).then(() => {
    showToast('Tersalin', 'Roblox API Key berhasil disalin ke clipboard!', 'success');
  }).catch(() => {
    showToast('Error', 'Gagal menyalin ke clipboard.', 'error');
  });
}

function copyRobloxScript() {
  const codeBlock = document.getElementById('roblox-luau-code');
  if (!codeBlock) return;

  navigator.clipboard.writeText(codeBlock.textContent).then(() => {
    showToast('Script Tersalin', 'Contoh script Luau Roblox berhasil disalin!', 'success');
  }).catch(() => {
    showToast('Error', 'Gagal menyalin script.', 'error');
  });
}
