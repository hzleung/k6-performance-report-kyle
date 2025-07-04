import fs from 'fs';
import readline from 'readline';

const logFile = 'results.json';
const outputHtml = 'report.html';

const apiRecords = [];
const scenarioRecords = [];
const pageRecords = [];

async function parseJsonLines() {
  const rl = readline.createInterface({
    input: fs.createReadStream(logFile),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const json = JSON.parse(line);
      if (json.type === 'Point' && json.metric === 'http_req_duration') {
        const tags = json.data.tags;
        if (tags.scenario === 'setup') continue;

        const record = {
          name: tags.apiName || 'unknown',
          method: tags.method || 'GET',
          url: tags.url || 'unknown',
          status: tags.status || 'unknown',
          duration: json.data.value,
          vu: parseInt(tags.vu) || 0,
          scenario: tags.scenario || 'unknown',
          page: tags.page || 'unknown',
          error: tags.error || null,
          timestamp: json.data.time || null
        };

        apiRecords.push(record);
        scenarioRecords.push({
          scenario: record.scenario,
          duration: record.duration,
          status: record.status,
          error: record.error,
          timestamp: record.timestamp
        });
        pageRecords.push({
          page: record.page,
          duration: record.duration,
          status: record.status,
          error: record.error,
          timestamp: record.timestamp
        });
      }
    } catch (e) {
      console.warn('JSON parse error:', e.message);
    }
  }
}

function groupByScenario(records) {
  const grouped = {};
  for (const rec of records) {
    if (!grouped[rec.scenario]) {
      grouped[rec.scenario] = { count: 0, durations: [], errors: [], timestamps: [] };
    }
    grouped[rec.scenario].count++;
    grouped[rec.scenario].durations.push(rec.duration);
    grouped[rec.scenario].timestamps.push(rec.timestamp);
    if (rec.status !== '200') {
      grouped[rec.scenario].errors.push({
        status: rec.status,
        error: rec.error || 'Unknown error',
        duration: rec.duration
      });
    }
  }
  return grouped;
}

function groupByApi(records) {
  const grouped = {};
  for (const rec of records) {
    const key = `${rec.method} ${rec.url}`;
    if (!grouped[key]) {
      grouped[key] = {
        name: rec.name,
        method: rec.method,
        url: rec.url,
        count: 0,
        durations: [],
        errors: [],
        timestamps: []
      };
    }
    grouped[key].count++;
    grouped[key].durations.push(rec.duration);
    grouped[key].timestamps.push(rec.timestamp);
    if (rec.status !== '200') {
      grouped[key].errors.push({
        status: rec.status,
        error: rec.error || 'Unknown error',
        duration: rec.duration
      });
    }
  }
  return grouped;
}

function groupByPage(records) {
  const grouped = {};
  for (const rec of records) {
    if (!grouped[rec.page]) {
      grouped[rec.page] = { count: 0, durations: [], errors: [], timestamps: [] };
    }
    grouped[rec.page].count++;
    grouped[rec.page].durations.push(rec.duration);
    grouped[rec.page].timestamps.push(rec.timestamp);
    if (rec.status !== '200') {
      grouped[rec.page].errors.push({
        status: rec.status,
        error: rec.error || 'Unknown error',
        duration: rec.duration
      });
    }
  }
  return grouped;
}

function generateHtml(apiGrouped, scenarioGrouped, pageGrouped) {
  const chartJsCdn = `<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>`;

  const scenarioTableRows = Object.entries(scenarioGrouped).map(([name, data], index) => {
    const avg = (data.durations.reduce((a, b) => a + b, 0) / data.durations.length).toFixed(2);
    return `
      <tr class="scenario-row" data-chart-id="scenario_chart_${index}">
        <td>${name}</td>
        <td>${data.count}</td>
        <td>${avg} ms</td>
        <td>${data.errors.length}</td>
      </tr>
      <tr class="chart-row" id="scenario_chart_row_${index}" style="display:none;">
        <td colspan="4">
          <canvas id="scenario_chart_${index}" height="120"></canvas>
        </td>
      </tr>
    `;
  }).join('\n');

  const apiTableRows = Object.entries(apiGrouped).map(([key, data], index) => {
    const avg = (data.durations.reduce((a, b) => a + b, 0) / data.durations.length).toFixed(2);
    const errorBlock = data.errors.length
      ? `<details><summary>${data.errors.length} error(s)</summary><pre>${data.errors.map(e => JSON.stringify(e, null, 2)).join('\n\n')}</pre></details>`
      : '✅ No errors';

    return `
      <tr class="api-row" data-chart-id="api_chart_${index}">
        <td>${data.name}</td>
        <td>${data.method}</td>
        <td>${data.url}</td>
        <td>${data.count}</td>
        <td>${avg} ms</td>
        <td>${errorBlock}</td>
      </tr>
      <tr class="chart-row" id="api_chart_row_${index}" style="display:none;">
        <td colspan="6">
          <canvas id="api_chart_${index}" height="120"></canvas>
        </td>
      </tr>
    `;
  }).join('\n');

  const pageTableRows = Object.entries(pageGrouped).map(([page, data], index) => {
    const avg = (data.durations.reduce((a, b) => a + b, 0) / data.durations.length).toFixed(2);
    return `
      <tr class="page-row" data-chart-id="page_chart_${index}">
        <td>${page}</td>
        <td>${data.count}</td>
        <td>${avg} ms</td>
        <td>${data.errors.length}</td>
      </tr>
      <tr class="chart-row" id="page_chart_row_${index}" style="display:none;">
        <td colspan="4">
          <canvas id="page_chart_${index}" height="120"></canvas>
        </td>
      </tr>
    `;
  }).join('\n');

  const scenarioCharts = Object.entries(scenarioGrouped).map(([name, data], index) => `
    new Chart(document.getElementById('scenario_chart_${index}'), {
      type: 'line',
      data: {
        labels: [...Array(${data.durations.length}).keys()],
        datasets: [{
          label: 'Duration (ms)',
          data: ${JSON.stringify(data.durations)},
          borderColor: 'rgba(153, 102, 255, 1)',
          backgroundColor: 'rgba(153, 102, 255, 0.3)',
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: 'Request Index' } },
          y: { title: { display: true, text: 'Duration (ms)' } }
        }
      }
    });
  `).join('\n');

  const apiCharts = Object.entries(apiGrouped).map(([key, data], index) => `
    new Chart(document.getElementById('api_chart_${index}'), {
      type: 'line',
      data: {
        labels: [...Array(${data.durations.length}).keys()],
        datasets: [{
          label: 'Duration (ms)',
          data: ${JSON.stringify(data.durations)},
          borderColor: 'rgba(54, 162, 235, 1)',
          backgroundColor: 'rgba(54, 162, 235, 0.3)',
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: 'Request Index' } },
          y: { title: { display: true, text: 'Duration (ms)' } }
        }
      }
    });
  `).join('\n');

  const pageCharts = Object.entries(pageGrouped).map(([page, data], index) => `
    new Chart(document.getElementById('page_chart_${index}'), {
      type: 'line',
      data: {
        labels: [...Array(${data.durations.length}).keys()],
        datasets: [{
          label: 'Duration (ms)',
          data: ${JSON.stringify(data.durations)},
          borderColor: 'rgba(255, 159, 64, 1)',
          backgroundColor: 'rgba(255, 159, 64, 0.3)',
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: 'Request Index' } },
          y: { title: { display: true, text: 'Duration (ms)' } }
        }
      }
    });
  `).join('\n');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>k6 Performance Report</title>
  ${chartJsCdn}
  <style>
    body { font-family: "Segoe UI", sans-serif; padding: 2rem; background: #f9f9f9; color: #333; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.05); }
    th, td { padding: 12px; border-bottom: 1px solid #eee; text-align: left; }
    th { background: #f4f4f4; font-weight: 600; }
    tr.chart-row { background: #fff7fc; }
    details { background: #fef4f4; border: 1px solid #f9c6c9; border-radius: 4px; padding: 8px; }
    canvas { background: #fff; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.05); }
    h1, h2 { margin-top: 2rem; }
    tr.scenario-row:hover, tr.api-row:hover, tr.page-row:hover { cursor: pointer; background: #f0f8ff; }
  </style>
</head>
<body>
  <h1>🚀 K6 Performance Report</h1>

  <h2>📊 Scenario Summary</h2>
  <table>
    <thead>
      <tr><th>Scenario</th><th>Count</th><th>Avg Duration</th><th>Errors</th></tr>
    </thead>
    <tbody>${scenarioTableRows}</tbody>
  </table>

  <h2>🔍 API Summary</h2>
  <table>
    <thead>
      <tr><th>API Name</th><th>Method</th><th>URL</th><th>Count</th><th>Avg Duration</th><th>Errors</th></tr>
    </thead>
    <tbody>${apiTableRows}</tbody>
  </table>

  <h2>🌐 Page Summary</h2>
  <table>
    <thead>
      <tr><th>Page</th><th>Count</th><th>Avg Duration</th><th>Errors</th></tr>
    </thead>
    <tbody>${pageTableRows}</tbody>
  </table>

  <script>
    // 绑定点击事件展开/收起图表
    function toggleChart(rowClass) {
      document.querySelectorAll(rowClass).forEach(row => {
        row.addEventListener('click', () => {
          const chartId = row.dataset.chartId;
          const chartRow = document.getElementById(chartId + '_row');
          chartRow.style.display = chartRow.style.display === 'none' ? 'table-row' : 'none';
        });
      });
    }

    toggleChart('.api-row');
    toggleChart('.scenario-row');
    toggleChart('.page-row');

    ${apiCharts}
    ${scenarioCharts}
    ${pageCharts}
  </script>
</body>
</html>
`;
}

(async () => {
  await parseJsonLines();
  const scenarioGrouped = groupByScenario(scenarioRecords);
  const apiGrouped = groupByApi(apiRecords);
  const pageGrouped = groupByPage(pageRecords);
  const html = generateHtml(apiGrouped, scenarioGrouped, pageGrouped);
  fs.writeFileSync(outputHtml, html, 'utf-8');
  console.log(`✅ Report generated: ${outputHtml}`);
})();
