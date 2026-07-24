// Toast notification alert helper
function showToast(title, message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  
  const bgColor = type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30';
  const icon = type === 'success' ? 'fa-check-circle text-emerald-400' : 'fa-exclamation-circle text-red-400';
  
  toast.className = `glass-panel flex gap-3 p-4 rounded-xl border max-w-sm fade-in ${bgColor}`;
  toast.innerHTML = `
    <i class="fa-solid ${icon} text-lg shrink-0 mt-0.5"></i>
    <div>
      <h4 class="font-semibold text-sm text-white">${title}</h4>
      <p class="text-xs text-gray-400 mt-0.5">${message}</p>
    </div>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.4s ease';
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

// Escape HTML utility to prevent XSS
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
