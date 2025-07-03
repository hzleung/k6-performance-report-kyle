import fs from 'fs';

const lines = fs.readFileSync('./result.jsonl', 'utf-8').trim().split('\n');
const records = lines.map(line => JSON.parse(line));

const apiStats = {};
const errors = [];

for (const record of records) {
  const key = record.apiName;

  if (!apiStats[key]) {
    apiStats[key] = {
      name: key,
      method: record.method,
      url: record.url,
      durations: [],
      vus: [],
      statuses: [],
    };
  }

  apiStats[key].durations.push(record.duration);
  apiStats[key].vus.push(record.vu);
  apiStats[key].statuses.push(record.status);

  if (record.error) {
    errors.push({
      ...record,
      errorCode: record.error.code,
      errorMessage: record.error.message,
    });
  }
}

const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>K6 Performance Report</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { font-family: sans-serif; padding: 20px; }
    .chart-container { width: 100%; max-width: 800px; margin: 30px auto; }
    table { border-collapse: collapse; width: 100%; margin-top: 40px; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
    th { background: #f0f0f0; }
  </style>
</head>
<body>
  <h1>K6 Performance Report</h1>
  ${Object.values(apiStats).map(api => `
    <div class="chart-container">
      <h2>${api.name} (${api.method})</h2>
      <p><strong>URL:</strong> ${api.url}</p>
      <canvas id="chart-${api.name}-duration"></canvas>
      <canvas id="chart-${api.name}-vu"></canvas>
    </div>
  `).join('')}

  <h2>❌ Error List</h2>
  <table>
    <thead>
      <tr>
        <th>VU</th><th>Scenario</th><th>Page</th><th>API</th><th>Status</th><th>URL</th><th>Code</th><th>Message</th>
      </tr>
    </thead>
    <tbody>
      ${errors.map(e => `
        <tr>
          <td>${e.vu}</td>
          <td>${e.scenario}</td>
          <td>${e.page}</td>
          <td>${e.apiName}</td>
          <td>${e.status}</td>
          <td>${e.url}</td>
          <td>${e.errorCode}</td>
          <td>${e.errorMessage}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <script>
    ${Object.values(apiStats).map(api => `
      new Chart(document.getElementById("chart-${api.name}-duration"), {
        type: 'line',
        data: {
          labels: [...Array(${api.durations.length}).keys()],
          datasets: [{
            label: 'Duration (ms)',
            data: ${JSON.stringify(api.durations)},
            borderColor: 'blue',
            fill: false
          }]
        },
        options: {
          responsive: true,
          plugins: { title: { display: true, text: '${api.name} - Duration' } }
        }
      });

      new Chart(document.getElementById("chart-${api.name}-vu"), {
        type: 'scatter',
        data: {
          datasets: [{
            label: 'VU vs Duration',
            data: ${JSON.stringify(api.vus.map((vu, i) => ({ x: vu, y: api.durations[i] })))},
            backgroundColor: 'orange'
          }]
        },
        options: {
          scales: {
            x: { title: { display: true, text: 'VU' } },
            y: { title: { display: true, text: 'Duration (ms)' } }
          },
          plugins: { title: { display: true, text: '${api.name} - VU vs Duration' } }
        }
      });
    `).join('')}
  </script>
</body>
</html>
`;

fs.writeFileSync('./report.html', html, 'utf-8');
console.log('✅ Report generated: report.html');