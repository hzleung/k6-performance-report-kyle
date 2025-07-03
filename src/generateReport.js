import fs from 'fs';

const logFilePath = 'result.jsonl';
const rawData = fs.readFileSync(logFilePath, 'utf-8');
const lines = rawData.trim().split('\n');

const apiData = [];
const scenarioStats = {};

for (const line of lines) {
  const entry = JSON.parse(line);
  if (entry.type !== 'Point' || entry.metric !== 'http_req_duration') continue;

  const tags = entry.tags;
  const value = entry.value;

  const record = {
    scenario: tags.scenario,
    apiName: tags.name,
    url: tags.url,
    method: tags.method || '',
    status: tags.status || '',
    duration: value,
    error_code: tags['error_code'] || null,
    error_message: tags['error_message'] || null,
    vu: tags.vu
  };

  apiData.push(record);

  if (!scenarioStats[record.scenario]) {
    scenarioStats[record.scenario] = {
      scenario: record.scenario,
      durations: [],
      count: 0,
      failed: 0
    };
  }

  scenarioStats[record.scenario].durations.push(value);
  scenarioStats[record.scenario].count++;

  if (record.status !== '200') {
    scenarioStats[record.scenario].failed++;
  }
}

const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>K6 Performance Report</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 20px;
      background: #f9f9f9;
    }
    h2 { color: #2c3e50; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 30px;
    }
    th, td {
      border: 1px solid #ccc;
      padding: 6px 10px;
      font-size: 14px;
    }
    th {
      background-color: #f0f0f0;
    }
    .chart-container {
      margin: 40px 0;
    }
  </style>
</head>
<body>
  <h1>K6 Performance Testing Report</h1>

  <h2>📊 Scenario Overview</h2>
  <table>
    <thead>
      <tr>
        <th>Scenario</th>
        <th>Requests</th>
        <th>Failures</th>
        <th>Failure Rate</th>
        <th>Avg Duration (ms)</th>
      </tr>
    </thead>
    <tbody>
      ${Object.values(scenarioStats).map(s => {
  const avg = (s.durations.reduce((a, b) => a + b, 0) / s.durations.length).toFixed(2);
  const failRate = ((s.failed / s.count) * 100).toFixed(2);
  return `<tr>
          <td>${s.scenario}</td>
          <td>${s.count}</td>
          <td>${s.failed}</td>
          <td>${failRate}%</td>
          <td>${avg}</td>
        </tr>`;
}).join('')}
    </tbody>
  </table>

  <h2>📋 API Call Details</h2>
  <table>
    <thead>
      <tr>
        <th>Scenario</th>
        <th>API Name</th>
        <th>Method</th>
        <th>URL</th>
        <th>Status</th>
        <th>Duration (ms)</th>
        <th>Error Code</th>
        <th>Error Message</th>
      </tr>
    </thead>
    <tbody>
      ${apiData.map(d => `
        <tr>
          <td>${d.scenario}</td>
          <td>${d.apiName}</td>
          <td>${d.method}</td>
          <td>${d.url}</td>
          <td>${d.status}</td>
          <td>${d.duration}</td>
          <td>${d.error_code || ''}</td>
          <td>${d.error_message || ''}</td>
        </tr>`).join('')}
    </tbody>
  </table>

  <h2>📈 UVs vs Avg Duration per Scenario</h2>
  <div class="chart-container">
    <canvas id="uvTrendChart"></canvas>
  </div>

  <script>
    const chartData = ${JSON.stringify(apiData)};

    const trendMap = {};
    chartData.forEach(row => {
      const key = row.scenario + '-' + row.vu;
      if (!trendMap[key]) trendMap[key] = [];
      trendMap[key].push(row.duration);
    });

    const trendLabels = [];
    const trendDatasets = {};
    for (const key in trendMap) {
      const [scenario, vu] = key.split('-');
      if (!trendDatasets[scenario]) trendDatasets[scenario] = {};
      if (!trendDatasets[scenario][vu]) trendDatasets[scenario][vu] = [];

      trendDatasets[scenario][vu].push(...trendMap[key]);
      if (!trendLabels.includes(vu)) trendLabels.push(vu);
    }

    const trendChartDatasets = Object.entries(trendDatasets).map(([scenario, vus]) => {
      const data = trendLabels.map(vu => {
        const durations = vus[vu] || [];
        const avg = durations.reduce((a, b) => a + b, 0) / (durations.length || 1);
        return avg.toFixed(2);
      });
      return {
        label: scenario,
        data,
        borderWidth: 2,
        fill: false,
        tension: 0.3
      };
    });

    new Chart(document.getElementById('uvTrendChart'), {
      type: 'line',
      data: {
        labels: trendLabels,
        datasets: trendChartDatasets
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Average Duration per Scenario under Different VU (UV) Values'
          }
        }
      }
    });
  </script>
</body>
</html>
`;

fs.writeFileSync('report.html', html);
console.log('✅ Report generated: report.html');
