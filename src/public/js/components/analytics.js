// FRONTEND COMPONENT: SERVER ANALYTICS DASHBOARD

let chartMemberGrowth = null;
let chartTopCommands = null;
let chartHourlyActivity = null;
let chartFeatureBreakdown = null;

async function loadAnalytics() {
  if (!selectedGuildId) return;

  const container = document.getElementById('analytics-loading');
  if (container) container.classList.remove('hidden');

  try {
    const res = await apiFetch(`/api/analytics/${selectedGuildId}`);
    if (!res.ok) {
      throw new Error('Gagal mengambil data statistik server.');
    }

    const { analytics } = await res.json();
    renderAnalyticsSummary(analytics.summary);
    renderMemberGrowthChart(analytics.dailyJoins);
    renderTopCommandsChart(analytics.topCommands);
    renderHourlyActivityChart(analytics.hourlyActivity);
    renderFeatureBreakdownChart(analytics.featureBreakdown);
  } catch (error) {
    showToast('Analytics Error', error.message || 'Gagal memuat statistik.', 'error');
  } finally {
    if (container) container.classList.add('hidden');
  }
}

function renderAnalyticsSummary(summary) {
  if (!summary) return;

  const elemJoins = document.getElementById('stat-joins-7d');
  const elemCmds = document.getElementById('stat-commands-7d');
  const elemPeak = document.getElementById('stat-peak-hour');
  const elemMenfess = document.getElementById('stat-menfess-total');

  if (elemJoins) elemJoins.innerText = summary.memberJoins7d ?? 0;
  if (elemCmds) elemCmds.innerText = summary.totalCommands7d ?? 0;
  if (elemPeak) elemPeak.innerText = summary.peakHourWib || '20:00 WIB';
  if (elemMenfess) elemMenfess.innerText = summary.totalMenfess ?? 0;
}

function renderMemberGrowthChart(dailyJoins) {
  const ctx = document.getElementById('chart-member-growth');
  if (!ctx) return;

  if (chartMemberGrowth) chartMemberGrowth.destroy();

  const labels = dailyJoins.map(d => d.date);
  const data = dailyJoins.map(d => d.count);

  chartMemberGrowth = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Member Baru',
        data,
        borderColor: '#5865F2',
        backgroundColor: 'rgba(88, 101, 242, 0.15)',
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#5865F2',
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9CA3AF' } },
        y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9CA3AF', stepSize: 1 }, beginAtZero: true }
      }
    }
  });
}

function renderTopCommandsChart(topCommands) {
  const ctx = document.getElementById('chart-top-commands');
  if (!ctx) return;

  if (chartTopCommands) chartTopCommands.destroy();

  const labels = topCommands.map(c => c.command);
  const data = topCommands.map(c => c.count);

  chartTopCommands = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Jumlah Penggunaan',
        data,
        backgroundColor: ['#EC4899', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6'],
        borderRadius: 8
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9CA3AF', stepSize: 1 }, beginAtZero: true },
        y: { grid: { display: false }, ticks: { color: '#9CA3AF' } }
      }
    }
  });
}

function renderHourlyActivityChart(hourlyActivity) {
  const ctx = document.getElementById('chart-hourly-activity');
  if (!ctx) return;

  if (chartHourlyActivity) chartHourlyActivity.destroy();

  const labels = hourlyActivity.map(h => h.hour);
  const data = hourlyActivity.map(h => h.count);

  chartHourlyActivity = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Aktivitas Event',
        data,
        backgroundColor: '#10B981',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#9CA3AF', font: { size: 10 } } },
        y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9CA3AF', stepSize: 1 }, beginAtZero: true }
      }
    }
  });
}

function renderFeatureBreakdownChart(featureBreakdown) {
  const ctx = document.getElementById('chart-feature-breakdown');
  if (!ctx) return;

  if (chartFeatureBreakdown) chartFeatureBreakdown.destroy();

  const labels = featureBreakdown.map(f => f.feature);
  const data = featureBreakdown.map(f => f.count);

  chartFeatureBreakdown = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: ['#F59E0B', '#EC4899', '#8B5CF6', '#EF4444', '#6B7280'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#9CA3AF', padding: 15, font: { size: 11 } }
        }
      },
      cutout: '70%'
    }
  });
}
