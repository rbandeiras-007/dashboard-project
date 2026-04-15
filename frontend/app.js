
const API_BASE = 'https://dashboard-backend.onrender.com/api';
Chart.register(ChartDataLabels);

const state = {
  charts: {},
  currentTab: 'executive',
  alertSoundEnabled: false,
  lastCriticalCount: 0,
  manualTechnicalRefresh: false
};

const formatCurrency = (value) => new Intl.NumberFormat('pt-PT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0
}).format(Number(value || 0));

const formatCompactCurrency = (value) => new Intl.NumberFormat('pt-PT', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  maximumFractionDigits: 1
}).format(Number(value || 0));

const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;

function formatDatePT(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return value;
  return d.toLocaleDateString('pt-PT');
}

function getStatusBadgeClass(status) {
  const s = String(status || '').toLowerCase();

  if (s.includes('nova')) return 'primary';
  if (s.includes('prepara')) return 'warning';
  if (s.includes('curso')) return 'warning';
  if (s.includes('exped')) return 'danger';
  if (s.includes('conclu')) return 'info';
  if (s.includes('fatur')) return 'success';
  if (s.includes('atras')) return 'danger';

  return 'neutral';
}

function getStatusColor(status) {
  const s = String(status || '').toLowerCase().trim();

  // Executivo
  if (s.includes('nova')) return '#3b82f6';         // azul
  if (s.includes('prepara')) return '#f59e0b';      // laranja
  if (s.includes('exped')) return '#ef4444';        // vermelho
  if (s.includes('concluída') || s.includes('concluida')) return '#8b5cf6'; // roxo
  if (s.includes('fatur')) return '#10b981';        // verde

  // Técnico
  if (s.includes('planeado')) return '#3b82f6';     // azul
  if (s.includes('em curso')) return '#10b981';     // verde
  if (s.includes('em risco')) return '#f59e0b';     // laranja
  if (s.includes('atrasado')) return '#ef4444';     // vermelho
  if (s.includes('concluído') || s.includes('concluido')) return '#8b5cf6'; // roxo

  return '#94a3b8'; // neutro
}

function showLoading() {
  document.getElementById('loadingOverlay')?.classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loadingOverlay')?.classList.add('hidden');
}

function playAlertBeep() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);

    gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.35);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.35);
  } catch (error) {
    console.error('Erro ao reproduzir som de alerta:', error);
  }
}

function playAlertBeep() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);

    gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.35);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.35);
  } catch (error) {
    console.error('Erro ao reproduzir som de alerta:', error);
  }
}

function getFilters() {
  return {
    client_id: document.getElementById('clientFilter').value || '',
    order_status: document.getElementById('orderStatusFilter').value || '',
    project_status: document.getElementById('projectStatusFilter').value || '',
    technician_id: document.getElementById('technicianFilter').value || '',
    date_from: document.getElementById('dateFrom').value || '',
    date_to: document.getElementById('dateTo').value || '',
  };
}

function toQuery(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) search.append(key, value);
  });
  return search.toString() ? `?${search.toString()}` : '';
}

async function fetchJson(path, params = {}) {
  const res = await fetch(`${API_BASE}${path}${toQuery(params)}`, {
    credentials: 'include'
  });
  if (!res.ok) throw new Error(`Erro API: ${res.status}`);
  return res.json();
}

function fillSelect(selectId, items, valueKey, labelKey) {
  const select = document.getElementById(selectId);
  select.innerHTML = '<option value="">Todos</option>';
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item[valueKey];
    opt.textContent = item[labelKey];
    select.appendChild(opt);
  });
}

async function loadFilters() {
  const data = await fetchJson('/filters');
  fillSelect('clientFilter', data.clients, 'client_id', 'client_name');
  fillSelect('technicianFilter', data.technicians, 'technician_id', 'technician_name');

  const orderStatus = document.getElementById('orderStatusFilter');
  orderStatus.innerHTML = '<option value="">Todos</option>';
  data.order_statuses.forEach(status => {
    const opt = document.createElement('option');
    opt.value = status;
    opt.textContent = status;
    orderStatus.appendChild(opt);
  });

  const projectStatus = document.getElementById('projectStatusFilter');
  projectStatus.innerHTML = '<option value="">Todos</option>';
  data.project_statuses.forEach(status => {
    const opt = document.createElement('option');
    opt.value = status;
    opt.textContent = status;
    projectStatus.appendChild(opt);
  });
}

function destroyChart(id) {
  if (state.charts[id]) {
    state.charts[id].destroy();
  }
}

function createBarChart(id, labels, data, horizontal = false, format = 'number', colors = 'primary') {
  destroyChart(id);
  const ctx = document.getElementById(id);

  const statusPalette = labels.map(label => getStatusColor(label));
  const categoricalPalette = [
    'rgba(59,130,246,.85)',
    'rgba(16,185,129,.85)',
    'rgba(245,158,11,.85)',
    'rgba(139,92,246,.85)',
    'rgba(239,68,68,.85)',
    'rgba(14,165,233,.85)',
    'rgba(234,88,12,.85)',
    'rgba(99,102,241,.85)',
    'rgba(236,72,153,.85)',
    'rgba(34,197,94,.85)'
  ];

  let palette;
  if (colors === 'danger') {
    palette = labels.map(() => 'rgba(239,68,68,.75)');
  } else if (colors === 'status') {
    palette = statusPalette;
  } else {
    palette = labels.map((_, i) => categoricalPalette[i % categoricalPalette.length]);
  }

  const valueTickFormatter = (value) => {
    if (format === 'currency') return formatCompactCurrency(value);
    return value;
  };

  const scales = horizontal
    ? {
        x: {
          ticks: {
            callback: valueTickFormatter,
            color: '#5b708b',
            font: {
              family: 'Inter',
              size: 11,
              weight: '600'
            }
          },
          grid: { color: '#eaf0f7' }
        },
        y: {
          grid: { display: false },
          ticks: {
            color: '#5b708b',
            font: {
              family: 'Inter',
              size: 11,
              weight: '600'
            }
          }
        }
      }
    : {
        x: {
          grid: { display: false },
          ticks: {
            color: '#5b708b',
            font: {
              family: 'Inter',
              size: 11,
              weight: '600'
            }
          }
        },
        y: {
          ticks: {
            callback: valueTickFormatter,
            color: '#5b708b',
            font: {
              family: 'Inter',
              size: 11,
              weight: '600'
            }
          },
          grid: { color: '#eaf0f7' }
        },
      };

  state.charts[id] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '',
        data,
        backgroundColor: palette,
        borderRadius: 8
      }]
    },
    options: {
      indexAxis: horizontal ? 'y' : 'x',
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { left: 10, right: 60, top: 10, bottom: 0 }
      },
      plugins: {
        legend: { display: false },
        datalabels: {
          color: '#17324f',
          anchor: horizontal ? 'end' : 'end',
          align: horizontal ? 'right' : 'top',
          offset: horizontal ? 8 : 4,
          clamp: true,
          clip: false,
          formatter: (v) => format === 'currency' ? formatCompactCurrency(v) : v,
          font: {
            family: 'Inter',
            size: 11,
            weight: '700'
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => format === 'currency' ? formatCurrency(ctx.raw) : ctx.raw
          }
        }
      },
      scales
    }
  });
}

function createLineChart(id, labels, data) {
  destroyChart(id);

  const ctx = document.getElementById(id);

  const maxPoints = 30;
  const step = Math.ceil(labels.length / maxPoints) || 1;

  const filteredLabels = labels
    .filter((_, i) => i % step === 0)
    .map(label => {
      const d = new Date(label);
      return isNaN(d) ? label : d.toLocaleDateString('pt-PT');
    });

  const filteredData = data.filter((_, i) => i % step === 0);

  state.charts[id] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: filteredLabels,
      datasets: [{
        label: 'Valor €',
        data: filteredData,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,.14)',
        fill: true,
        tension: 0.32,
        pointRadius: 3,
        pointHoverRadius: 4,
        pointBackgroundColor: '#2563eb',
        borderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { left: 10, right: 12, top: 10, bottom: 0 }
      },
      plugins: {
        legend: {
          position: 'top',
          align: 'start',
          labels: {
            color: '#17324f',
            font: {
              family: 'Inter',
              size: 12,
              weight: '600'
            }
          }
        },
        datalabels: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: (ctx) => formatCurrency(ctx.raw)
          }
        }
      },
      scales: {
        y: {
          ticks: {
            callback: (value) => formatCompactCurrency(value),
            color: '#5b708b',
            font: {
              family: 'Inter',
              size: 11,
              weight: '600'
            }
          },
          grid: { color: '#eaf0f7' }
        },
        x: {
          grid: { display: false },
          ticks: {
            maxTicksLimit: 6,
            autoSkip: true,
            maxRotation: 0,
            minRotation: 0,
            color: '#5b708b',
            font: {
              family: 'Inter',
              size: 11,
              weight: '600'
            }
          }
        }
      }
    }
  });
}

function createDoughnutChart(id, labels, data, colors = 'categorical') {
  destroyChart(id);
  const ctx = document.getElementById(id);

  const categoricalPalette = [
    '#3b82f6',
    '#10b981',
    '#f59e0b',
    '#8b5cf6',
    '#ef4444',
    '#0ea5e9',
    '#f97316',
    '#6366f1',
    '#ec4899',
    '#22c55e'
  ];

  const palette = colors === 'status'
    ? labels.map(label => getStatusColor(label))
    : labels.map((_, i) => categoricalPalette[i % categoricalPalette.length]);

  state.charts[id] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: palette,
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        datalabels: {
          color: '#fff',
          formatter: (v) => v
        },
        legend: { position: 'bottom' }
      }
    }
  });
}

function fillExceptionsTable(rows) {
  const tbody = document.querySelector('#exceptionsTable tbody');
  tbody.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>#${r.order_id}</td>
      <td>${r.client_name}</td>
      <td><span class="badge ${getStatusBadgeClass(r.status)}">${r.status}</span></td>
      <td>${formatCurrency(r.order_value)}</td>
      <td>${formatDatePT(r.expected_date)}</td>
      <td>${r.days_late}</td>
    `;
    tbody.appendChild(tr);
  });
}

function fillRiskProjectsTable(rows) {
  const tbody = document.querySelector('#riskProjectsTable tbody');
  tbody.innerHTML = '';

  rows.forEach(r => {
    const riskClass =
      r.risk_level === 'Crítico'
        ? 'danger'
        : (r.risk_level === 'Alto' ? 'warning' : 'info');

    let alertClass = '';

    if (r.risk_level === 'Crítico') {
      alertClass = 'alert-critical';
    } else if (r.risk_level === 'Alto') {
      alertClass = 'alert-high';
    }

    const tr = document.createElement('tr');
    tr.className = alertClass;

    tr.innerHTML = `
      <td>#${r.project_id}</td>
      <td>${r.project_name}</td>
      <td>${r.client_name}</td>
      <td>${r.technician_name}</td>
      <td>${r.status}</td>
      <td><span class="badge ${riskClass}">${r.risk_level}</span></td>
      <td>${r.progress_pct}%</td>
      <td>${r.days_late}</td>
      <td>${r.delay_reason || '—'}</td>
    `;

    tbody.appendChild(tr);
  });
}

async function loadExecutive() {
  showLoading();
  try {
    const auth = await fetchMe();
    if (!auth.authenticated || !['admin', 'gestao'].includes(auth.user.role)) {
      throw new Error('Sem permissão para o dashboard executivo.');
    }

    const f = getFilters();

    const summary = await fetchJson('/orders/summary', f);

    const totalValue = Number(summary.total_value ?? summary.total_order_value ?? 0);
    const totalOrders = Number(summary.total_orders ?? 0);
    const totalClients = Number(summary.total_clients ?? 0);
    const lateOrders = Number(summary.delayed_orders ?? summary.late_orders ?? 0);

    const billingRate = summary.billing_rate != null
      ? Number(summary.billing_rate)
      : (totalOrders > 0 ? ((totalOrders - lateOrders) / totalOrders) * 100 : 0);

    document.getElementById('kpiRevenue').textContent = formatCurrency(totalValue);
    document.getElementById('kpiOrders').textContent = totalOrders.toLocaleString('pt-PT');
    document.getElementById('kpiBillingRate').textContent = `${billingRate.toFixed(1)}%`;
    document.getElementById('kpiLateOrders').textContent = lateOrders.toLocaleString('pt-PT');
    document.getElementById('kpiClients').textContent = totalClients.toLocaleString('pt-PT');

    const [trend, byStatus, topClients, funnel, exceptions] = await Promise.all([
      fetchJson('/executive/revenue-trend', f),
      fetchJson('/executive/orders-by-status', f),
      fetchJson('/executive/top-clients', f),
      fetchJson('/executive/funnel', f),
      fetchJson('/executive/exceptions', f),
    ]);

    createLineChart('revenueTrendChart', trend.map(x => x.day), trend.map(x => Number(x.value)));

    createBarChart(
      'revenueByStatusChart',
      byStatus.map(x => x.status),
      byStatus.map(x => Number(x.value)),
      true,
      'currency',
      'status'
    );

    createBarChart(
      'topClientsChart',
      topClients.map(x => x.client_name),
      topClients.map(x => Number(x.value)),
      true,
      'currency',
      'categorical'
    );

    createDoughnutChart(
      'funnelChart',
      funnel.map(x => x.status),
      funnel.map(x => Number(x.qty)),
      'status'
    );

    fillExceptionsTable(exceptions);

  } finally {
    hideLoading();
  }
}

async function loadTechnical() {
  showLoading();
  try {
    const auth = await fetchMe();
    if (!auth.authenticated || !['admin', 'tecnico'].includes(auth.user.role)) {
      throw new Error('Sem permissão para o dashboard técnico.');
    }

    const f = getFilters();

    const [summary, byStatus, plannedActual, workload, reasons, riskProjects] = await Promise.all([
      fetchJson('/technical/summary', f),
      fetchJson('/technical/projects-by-status', f),
      fetchJson('/technical/planned-vs-actual', f),
      fetchJson('/technical/workload-by-technician', f),
      fetchJson('/technical/delay-reasons', f),
      fetchJson('/technical/at-risk-projects', f),
    ]);

    document.getElementById('kpiActiveProjects').textContent = summary.active_projects;
    document.getElementById('kpiAtRiskProjects').textContent = summary.at_risk_projects;
    document.getElementById('kpiSlaRate').textContent = formatPercent(summary.sla_rate);
    document.getElementById('kpiBacklog').textContent = `${Number(summary.total_backlog_hours || 0).toFixed(0)} h`;

    createBarChart(
      'projectsByStatusChart',
      byStatus.map(x => x.status),
      byStatus.map(x => Number(x.qty)),
      false,
      'number',
      'status'
    );

    destroyChart('plannedVsActualChart');
const ctx = document.getElementById('plannedVsActualChart');

// mais espaço visual
document.getElementById('plannedVsActualChart').parentElement.style.height = '460px';

// limitar para melhor leitura
const plannedActualTop = [...plannedActual].slice(0, 7);

const plannedActualLabels = plannedActualTop.map((x) => {
  const rawName = String(x.project_name || '').trim();
  const cleanName = rawName.replace(/\s*#\d+\s*$/g, '').trim();
  return cleanName.length > 26 ? cleanName.slice(0, 26) + '…' : cleanName;
});

const plannedActualFullLabels = plannedActualTop.map((x) =>
  String(x.project_name || '').trim()
);

state.charts['plannedVsActualChart'] = new Chart(ctx, {
  type: 'bar',
  data: {
    labels: plannedActualLabels,
    datasets: [
      {
        label: 'Planeado',
        data: plannedActualTop.map(x => Number(x.planned_hours)),
        backgroundColor: 'rgba(59,130,246,.88)',
        borderRadius: 8,
        maxBarThickness: 18,
        categoryPercentage: 0.72,
        barPercentage: 0.9
      },
      {
        label: 'Real',
        data: plannedActualTop.map(x => Number(x.actual_hours)),
        backgroundColor: 'rgba(239,68,68,.82)',
        borderRadius: 8,
        maxBarThickness: 18,
        categoryPercentage: 0.72,
        barPercentage: 0.9
      }
    ]
  },
  options: {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: { left: 8, right: 20, top: 8, bottom: 0 }
    },
    plugins: {
      legend: {
        position: 'top',
        align: 'start',
        labels: {
          boxWidth: 14,
          boxHeight: 14,
          color: '#17324f',
          font: {
            family: 'Inter',
            size: 12,
            weight: '700'
          }
        }
      },
      datalabels: {
        display: false
      },
      tooltip: {
        callbacks: {
          title: (items) => plannedActualFullLabels[items[0].dataIndex],
          label: (ctx) => `${ctx.dataset.label}: ${Number(ctx.raw).toFixed(0)} h`
        }
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        suggestedMax: Math.max(
          ...plannedActualTop.map(x => Number(x.planned_hours)),
          ...plannedActualTop.map(x => Number(x.actual_hours))
        ) + 20,
        ticks: {
          color: '#52667f',
          callback: (value) => `${value} h`,
          font: {
            family: 'Inter',
            size: 11,
            weight: '700'
          }
        },
        grid: { color: '#eaf0f7' }
      },
      y: {
        grid: { display: false },
        ticks: {
          color: '#17324f',
          font: {
            family: 'Inter',
            size: 12,
            weight: '700'
          }
        }
      }
    }
  }
});

    createBarChart(
      'workloadChart',
      workload.map(x => x.technician_name),
      workload.map(x => Number(x.backlog_hours)),
      true,
      'number',
      'danger'
    );

    createDoughnutChart(
      'delayReasonsChart',
      reasons.map(x => x.delay_reason),
      reasons.map(x => Number(x.qty)),
      'categorical'
    );

    fillRiskProjectsTable(riskProjects);
const criticalCount = riskProjects.filter(p => p.risk_level === 'Crítico').length;
const highCount = riskProjects.filter(p => p.risk_level === 'Alto').length;

if (
  state.alertSoundEnabled &&
  criticalCount > 0 &&
  (
    criticalCount !== state.lastCriticalCount ||
    state.manualTechnicalRefresh
  )
) {
  playAlertBeep();
}

state.lastCriticalCount = criticalCount;
state.manualTechnicalRefresh = false;

if (
  state.alertSoundEnabled &&
  criticalCount > 0 &&
  criticalCount !== state.lastCriticalCount
) {
  playAlertBeep();
}

state.lastCriticalCount = criticalCount;

document.getElementById('kpiCriticalAlerts').textContent = criticalCount;
document.getElementById('kpiHighAlerts').textContent = highCount;

const banner = document.getElementById('technicalAlertsBanner');
const bannerText = document.getElementById('technicalAlertsBannerText');

if (banner && bannerText) {
  banner.classList.remove('hidden', 'critical', 'high', 'ok');

  if (criticalCount > 0) {
    banner.classList.add('critical');
    bannerText.textContent = `Atenção: existem ${criticalCount} alertas críticos e ${highCount} alertas altos a requerer atenção imediata.`;
  } else if (highCount > 0) {
    banner.classList.add('high');
    bannerText.textContent = `Existem ${highCount} alertas altos a requerer acompanhamento prioritário.`;
  } else {
    banner.classList.add('hidden');
    bannerText.textContent = '';
  }
}

const criticalCard = document.getElementById('criticalAlertsCard');
const highCard = document.getElementById('highAlertsCard');

if (criticalCard) {
  criticalCard.style.border = criticalCount > 0 ? '2px solid #ef4444' : '1px solid var(--border)';
  criticalCard.style.boxShadow = criticalCount > 0
    ? '0 0 0 3px rgba(239,68,68,.12)'
    : 'var(--shadow)';
}

if (highCard) {
  highCard.style.border = highCount > 0 ? '2px solid #f59e0b' : '1px solid var(--border)';
  highCard.style.boxShadow = highCount > 0
    ? '0 0 0 3px rgba(245,158,11,.12)'
    : 'var(--shadow)';
}

  } finally {
    hideLoading();
  }
}

function setTab(tab) {
  state.currentTab = tab;

  const executiveView = document.getElementById('executiveView');
  const technicalView = document.getElementById('technicalView');

  if (executiveView) {
    executiveView.classList.toggle('hidden', tab !== 'executive');
  }

  if (technicalView) {
    technicalView.classList.toggle('hidden', tab !== 'technical');
  }

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    setTab(btn.dataset.tab);
    if (btn.dataset.tab === 'executive') await loadExecutive();
    if (btn.dataset.tab === 'technical') await loadTechnical();
  });
});

document.getElementById('applyFilters').addEventListener('click', async () => {
  const auth = await fetchMe();
  if (!auth.authenticated) return;

  if (auth.user.role === 'admin') {
    state.manualTechnicalRefresh = true;
    await loadExecutive();
    await loadTechnical();
  } else if (auth.user.role === 'gestao') {
    await loadExecutive();
  } else if (auth.user.role === 'tecnico') {
    state.manualTechnicalRefresh = true;
    await loadTechnical();
  }
});

document.getElementById('resetFilters').addEventListener('click', async () => {
  ['clientFilter', 'orderStatusFilter', 'projectStatusFilter', 'technicianFilter', 'dateFrom', 'dateTo']
    .forEach(id => document.getElementById(id).value = '');

  const auth = await fetchMe();
  if (!auth.authenticated) return;

  if (auth.user.role === 'admin') {
    state.manualTechnicalRefresh = true;
    await loadExecutive();
    await loadTechnical();
  } else if (auth.user.role === 'gestao') {
    await loadExecutive();
  } else if (auth.user.role === 'tecnico') {
    state.manualTechnicalRefresh = true;
    await loadTechnical();
  }
});

async function loginRequest(email, password) {
  const res = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password })
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Erro no login');
  }

  return data;
}

async function fetchMe() {
  const res = await fetch(`${API_BASE}/me`, {
    credentials: 'include'
  });

  const data = await res.json();

  if (!res.ok) {
    return { authenticated: false };
  }

  return data;
}

async function logoutRequest() {
  await fetch(`${API_BASE}/logout`, {
    method: 'POST',
    credentials: 'include'
  });
}

function applyRolePermissions(user) {
  const loginScreen = document.getElementById('loginScreen');
  const appContainer = document.getElementById('appContainer');
  const tabExecutive = document.getElementById('tabExecutive');
  const tabTechnical = document.getElementById('tabTechnical');
  const logoutBtn = document.getElementById('logoutBtn');
  const exportActions = document.querySelector('.export-actions');

  if (loginScreen) loginScreen.classList.add('hidden');
  if (appContainer) appContainer.classList.remove('hidden');
  if (logoutBtn) logoutBtn.classList.remove('hidden');

  if (user.role === 'admin') {
    if (tabExecutive) tabExecutive.classList.remove('hidden');
    if (tabTechnical) tabTechnical.classList.remove('hidden');
    if (exportActions) exportActions.classList.remove('hidden');
    setTab('executive');
  } else if (user.role === 'gestao') {
    if (tabExecutive) tabExecutive.classList.remove('hidden');
    if (tabTechnical) tabTechnical.classList.add('hidden');
    if (exportActions) exportActions.classList.remove('hidden');
    setTab('executive');
  } else if (user.role === 'tecnico') {
    if (tabExecutive) tabExecutive.classList.add('hidden');
    if (tabTechnical) tabTechnical.classList.remove('hidden');
    if (exportActions) exportActions.classList.add('hidden');
    setTab('technical');
  }
}

function showLoginScreen() {
  const loginScreen = document.getElementById('loginScreen');
  const appContainer = document.getElementById('appContainer');
  const logoutBtn = document.getElementById('logoutBtn');

  if (loginScreen) loginScreen.classList.remove('hidden');
  if (appContainer) appContainer.classList.add('hidden');
  if (logoutBtn) logoutBtn.classList.add('hidden');
}

document.getElementById('loginBtn')?.addEventListener('click', async () => {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorBox = document.getElementById('loginError');

  errorBox.textContent = '';
  errorBox.classList.add('hidden');

  try {
    showLoading();
    const result = await loginRequest(email, password);

    applyRolePermissions(result.user);
    await loadFilters();

    if (result.user.role === 'admin') {
      await loadExecutive();
      await loadTechnical();
    } else if (result.user.role === 'gestao') {
      await loadExecutive();
    } else if (result.user.role === 'tecnico') {
      await loadTechnical();
    }
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.classList.remove('hidden');
  } finally {
    hideLoading();
  }
});

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  try {
    showLoading();
    await logoutRequest();
    window.location.reload();
  } finally {
    hideLoading();
  }
});

document.getElementById('btnExportExcel')?.addEventListener('click', () => {
  window.open('http://127.0.0.1:5000/api/export/executive-excel', '_blank');
});

document.getElementById('btnExportPdf')?.addEventListener('click', () => {
  window.print();
});

document.getElementById('toggleAlertSound')?.addEventListener('click', () => {
  state.alertSoundEnabled = !state.alertSoundEnabled;

  const btn = document.getElementById('toggleAlertSound');
  if (!btn) return;

  if (state.alertSoundEnabled) {
    btn.textContent = '🔕 Desativar som de alerta';

    // beep de teste ao ativar
    playAlertBeep();

    // força novo beep se existirem críticos na próxima atualização
    state.lastCriticalCount = -1;
  } else {
    btn.textContent = '🔔 Ativar som de alerta';
  }
});

async function init() {
  try {
    showLoading();

    const auth = await fetchMe();

    if (auth.authenticated) {
      applyRolePermissions(auth.user);
      await loadFilters();

      if (auth.user.role === 'admin') {
        await loadExecutive();
        await loadTechnical();
      } else if (auth.user.role === 'gestao') {
        await loadExecutive();
      } else if (auth.user.role === 'tecnico') {
        await loadTechnical();
      }
    } else {
      showLoginScreen();
    }
  } catch (err) {
    console.error(err);
    showLoginScreen();
  } finally {
    hideLoading();
  }
}

init();