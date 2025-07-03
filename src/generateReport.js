import fs from 'fs';
import path from 'path';

const INPUT_FILE = './results.json';
const OUTPUT_FILE = './report.html';

const raw = fs.readFileSync(INPUT_FILE, 'utf8');
const entries = JSON.parse(raw);

const apiData = [];

const scenarioStats = {};

entries.forEach(entry => {
  if (entry.type !== 'Point' || entry.metric !== 'http_req_duration') return;

  const { tags = {}, value, time } = entry;
  const {
    name = '',
    url = '',
    method = '',
    status = '',
    scenario = 'unknown',
    group = ''
  } = tags;

  if (scenario === 'setup') return;

  const apiName = name || url;
  const duration = value;

  apiData.push({
    scenario,
    page: group || 'unknown',
    name: apiName,
    url,
    method,
    status,
    duration: duration.toFixed(2),
    timestamp: new Date(time * 1000).toLocaleString(),
    error: status >= 400 ? `Status: ${status}` : ''
  });

  if (!scenarioStats[scenario]) {
    scenarioStats[scenario] = [];
  }
  scenarioStats[scenario].push(duration);
});

const html = generateHTML(apiData, scenarioStats);
fs.writeFileSync(OUTPUT_FILE, html, 'utf8');
console.log('✅ Report saved to', OUTPUT_FILE);

function generateHTML(apiData, scenarioStats) {
  const scenarioLabels = Object.keys(scenarioStats);
  const scenarioDurations = scenarioLabels.map(s => {
    const durations = scenarioStats[s];
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    return avg.toFixed(2);
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Performance Report</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 30px;
      background: #f9f9f9;
    }
    h1, h2 {
      text-align: center;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #fff;
      margin-top: 30px;
    }
    th, td {
      border: 1px solid #ccc;
      padding: 8px 10px;
      font-size: 14px;
    }
    th {
      background: #eee;
    }
    .chart-container {
      width: 80%;
      margin: 40px auto;
    }
    .error {
      color: red;
    }
  </style>
</head>
<body>
  <h1>Performance Test Report</h1>

  <div class="chart-container">
    <canvas id="scenarioChart"></canvas>
  </div>

  <h2>API Request Details</h2>
  <table>
    <thead>
      <tr>
        <th>Scenario</th>
        <th>Page</th>
        <th>API Name</th>
        <th>URL</th>
        <th>Method</th>
        <th>Status</th>
        <th>Duration (ms)</th>
        <th>Time</th>
        <th>Error</th>
      </tr>
    </thead>
    <tbody>
      ${apiData.map(d => `
        <tr>
          <td>${d.scenario}</td>
          <td>${d.page}</td>
          <td>${d.name}</td>
          <td>${d.url}</td>
          <td>${d.method}</td>
          <td>${d.status}</td>
          <td>${d.duration}</td>
          <td>${d.timestamp}</td>
          <td class="error">${d.error}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <script>
    const ctx = document.getElementById('scenarioChart').getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(scenarioLabels)},
        datasets: [{
          label: 'Average Response Time (ms)',
          data: ${JSON.stringify(scenarioDurations)},
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  </script>
</body>
</html>
  `;
}
