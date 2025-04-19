
const slotTableBody = document.getElementById('slotTableBody');
const ticketTableBody = document.getElementById('ticketTableBody');
const baseURL = 'https://smart-parking-backend-tbs9.onrender.com';
let ticketData = [];
let sortKey = null;
let sortDirection = { slot: 'asc', duration: 'desc', entry_time: 'desc' }; // default directions

function toggleTheme() {
  document.body.classList.toggle('dark-mode');
  document.body.classList.toggle('light-mode');
}

function showView(view) {
  document.getElementById('dataView').style.display = view === 'data' ? 'block' : 'none';
  document.getElementById('statsView').style.display = view === 'stats' ? 'block' : 'none';
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString();
}

function sortTickets(key) {
  // Toggle direction if key is the same, otherwise use default
  if (sortKey === key) {
    sortDirection[key] = sortDirection[key] === 'asc' ? 'desc' : 'asc';
  } else {
    // Set to default direction for new key
    if (key === 'slot') sortDirection[key] = 'asc';
    else sortDirection[key] = 'desc';
  }
  sortKey = key;
  loadDashboard();
}

let paidChartInstance = null;

function drawChart(data) {
  const ctx = document.getElementById('paidChart').getContext('2d');
  // Destroy previous chart instance if it exists
  if (paidChartInstance) {
    paidChartInstance.destroy();
  }
  paidChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Paid', 'Unpaid'],
      datasets: [{
        data: [data.yes || 0, data.no || 0],
        backgroundColor: ['#fca311', '#14213d']
      }]
    }
  });
}

async function loadDashboard() {
  try {
  const filterPaid = document.getElementById('filterPaid').value;

  const [slotRes, ticketRes] = await Promise.all([
    fetch(`${baseURL}/api/slots`),
    fetch(`${baseURL}/api/tickets`)
  ]);

  if (!slotRes.ok || !ticketRes.ok) {
    throw new Error('Failed to fetch slots or tickets');
  }

  const slots = await slotRes.json();
  ticketData = await ticketRes.json();

  if (sortKey) {
    ticketData.sort((a, b) => {
      if (sortKey === 'slot') {
        return sortDirection.slot === 'asc' ? a.slot - b.slot : b.slot - a.slot;
      }
      if (sortKey === 'duration') {
        return sortDirection.duration === 'asc' ? a.duration_hours - b.duration_hours : b.duration_hours - a.duration_hours;
      }
      if (sortKey === 'entry_time') {
        const aTime = new Date(a.entry_time).getTime();
        const bTime = new Date(b.entry_time).getTime();
        return sortDirection.entry_time === 'asc' ? aTime - bTime : bTime - aTime;
      }
      return 0;
    });
  }

  let filtered = ticketData;
  if (filterPaid) {
    filtered = ticketData.filter(t => t.paid === filterPaid);
  }

  slotTableBody.innerHTML = slots.map(s => `
    <tr>
      <td>${s.slot}</td>
      <td class="${s.status === 'occupied' ? 'status-occupied' : 'status-free'}">${s.status}</td>
      <td>${formatDate(s.last_updated)}</td>
    </tr>
  `).join('');

  ticketTableBody.innerHTML = filtered.map(t => `
    <tr>
      <td>${t.slot}</td>
      <td>${formatDate(t.entry_time)}</td>
      <td>${formatDate(t.exit_time)}</td>
      <td>${t.duration_hours.toFixed(2)}</td>
      <td>${t.paid || 'no'}</td>
    </tr>
  `).join('');

  const counts = ticketData.reduce((acc, t) => {
    acc[t.paid] = (acc[t.paid] || 0) + 1;
    return acc;
  }, {});

  drawChart(counts);

  // --- Scatterplot: Duration vs Entry Time ---
  const scatterCanvas = document.getElementById('scatterChart');
  if (scatterCanvas && ticketData.length > 0) {
    const scatterCtx = scatterCanvas.getContext('2d');
    if (window.scatterChartInstance) window.scatterChartInstance.destroy();
    window.scatterChartInstance = new Chart(scatterCtx, {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Ticket Duration vs Entry Time',
          data: ticketData.map(t => ({
            x: new Date(t.entry_time).getTime(),
            y: t.duration_hours
          })),
          backgroundColor: '#fca311',
        }]
      },
      options: {
        scales: {
          x: {
            type: 'time',
            time: { unit: 'day' },
            title: { display: true, text: 'Entry Time' }
          },
          y: {
            title: { display: true, text: 'Duration (hours)' }
          }
        }
      }
    });
  } else {
    if (!scatterCanvas) console.warn('scatterChart canvas not found.');
    if (!ticketData.length) console.warn('No ticket data for scatterplot.');
  }

  // --- Bar Chart: Tickets per Slot ---
  const barCanvas = document.getElementById('barChart');
  if (barCanvas && ticketData.length > 0) {
    const barCtx = barCanvas.getContext('2d');
    if (window.barChartInstance) window.barChartInstance.destroy();
    // Count tickets per slot
    const slotCounts = ticketData.reduce((acc, t) => {
      acc[t.slot] = (acc[t.slot] || 0) + 1;
      return acc;
    }, {});
    window.barChartInstance = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: Object.keys(slotCounts),
        datasets: [{
          label: 'Tickets per Slot',
          data: Object.values(slotCounts),
          backgroundColor: '#14213d',
        }]
      },
      options: {
        scales: {
          x: { title: { display: true, text: 'Slot' } },
          y: { title: { display: true, text: 'Tickets' }, beginAtZero: true }
        }
      }
    });
  } else {
    if (!barCanvas) console.warn('barChart canvas not found.');
    if (!ticketData.length) console.warn('No ticket data for bar chart.');
  }

  document.getElementById("loader").style.display = "none";
  document.querySelector(".app").style.display = "flex";
  } catch (err) {
    console.error('Dashboard load error:', err);
    document.getElementById("loader").textContent = "Failed to load dashboard. Check console for errors.";
    document.getElementById("loader").style.display = "block";
    document.querySelector(".app").style.display = "none";
  }
}

setTimeout(loadDashboard, 1000);

function downloadTicketsCSV() {
  if (!ticketData.length) {
    alert('No ticket data to download.');
    return;
  }
  const csvRows = [
    ['Slot', 'Entry Time', 'Exit Time', 'Duration (hours)', 'Paid'],
    ...ticketData.map(t => [
      t.slot,
      new Date(t.entry_time).toLocaleString(),
      new Date(t.exit_time).toLocaleString(),
      t.duration_hours.toFixed(2),
      t.paid || 'no'
    ])
  ];
  const csvContent = csvRows.map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tickets.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
