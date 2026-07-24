// Centralized API fetch wrapper
async function apiFetch(endpoint, options = {}) {
  const headers = {
    'Authorization': token,
    ...(options.headers || {})
  };

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const response = await fetch(endpoint, {
    ...options,
    headers
  });

  if (response.status === 401) {
    localStorage.removeItem('maya_passcode');
    const loginOverlay = document.getElementById('login-overlay');
    const appContainer = document.getElementById('app-container');
    if (loginOverlay) loginOverlay.classList.remove('hidden', 'opacity-0');
    if (appContainer) appContainer.classList.add('hidden');
    showToast('Sesi Berakhir', 'Silakan masukkan passcode kembali.', 'error');
    throw new Error('401 Unauthorized');
  }

  return response;
}
