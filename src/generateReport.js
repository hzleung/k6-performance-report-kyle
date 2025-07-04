import fs from 'fs';
import readline from 'readline';

const logFile = '../results/results.json';
const outputHtml = 'report.html';

const apiRecords = [];
const scenarioRecords = [];

async function parseJsonLines() {
  const rl = readline.createInterface({
    input: fs.createReadStream(logFile),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const json = JSON.parse(line);
      if (
        json.type === 'Point' &&
        json.metric === 'http_req_duration' &&
        json.data.tags.scenarioName !== 'setup'
      ) {
        const tags = json.data.tags;
        const record = {
          name: tags.apiName || 'unknown',
          method: tags.method || 'GET',
          url: tags.url || 'unknown',
          status: tags.status || 'unknown',
          duration: json.data.value,
          vu: parseInt(tags.vu) || 0,
          scenario: tags.scenarioName || 'unknown',
          page: tags.pageName || 'unknown',
          error: tags.error || null,
        };
        apiRecords.push(record);
        scenarioRecords.push({
          scenario: record.scenario,
          duration: record.duration,
          status: record.status,
          error: record.error,
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
      grouped[rec.scenario] = {
        count: 0,
        durations: [],
        errors: [],
      };
    }
    grouped[rec.scenario].count += 1;
    grouped[rec.scenario].durations.push(rec.duration);
    if (rec.status !== '200') {
      grouped[rec.scenario].errors.push({
        status: rec.status,
        error: rec.error || 'Unknown error',
        duration: rec.duration,
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
      };
    }
    grouped[key].count += 1;
    grouped[key].durations.push(rec.duration);
    if (rec.status !== '200') {
      grouped[key].errors.push({
        status: rec.status,
        error: rec.error || 'Unknown error',
        duration: rec.duration,
      });
    }
  }
  return grouped;
}

function generateHtml(apiGrouped, scenarioGrouped) {
  const chartJsCdn = `<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>`;
  const chartBoxplotCdn = `<script src="https://cdn.jsdelivr.net/npm/chartjs-chart-box-and-violin-plot@4.3.0/build/Chart.BoxPlot.min.js"></script>`;

  const scenarioTable = Object.entries(scenarioGrouped)
    .map(([name, data], index) => {
      const avg = (
        data.durations.reduce((a, b) => a + b, 0) / data.durations.length
      ).toFixed(2);
      return `
        <tr onclick="toggleChart('scenario_chart_${index}')">
          <td>${name}</td>
          <td>${data.count}</td>
          <td>${avg} ms</td>
          <td>${data.errors.length}</td>
        </tr>
        <tr id="scenario_chart_${index}" class="chart-row">
          <td colspan="4"><canvas id="scenario_canvas_${index}" height="100"></canvas></td>
        </tr>
      `;
    })
    .join('\n');

  const apiTable = Object.entries(apiGrouped)
    .map(([key, data], index) => {
      const avg = (
        data.durations.reduce((a, b) => a + b, 0) / data.durations.length
      ).toFixed(2);
      const errorBlock = data.errors.length
        ? `<details><summary>${data.errors.length} error(s)</summary><pre>${data.errors
          .map((e) => JSON.stringify(e, null, 2))
          .join('\n\n')}</pre></details>`
        : '✅ No errors';
      return `
        <tr onclick="toggleChart('api_chart_${index}')">
          <td>${data.name}</td>
          <td>${data.method}</td>
          <td>${data.url}</td>
          <td>${data.count}</td>
          <td>${avg} ms</td>
          <td>${errorBlock}</td>
        </tr>
        <tr id="api_chart_${index}" class="chart-row">
          <td colspan="6"><canvas id="api_canvas_${index}" height="100"></canvas></td>
        </tr>
      `;
    })
    .join('\n');

  const apiCharts = Object.entries(apiGrouped)
    .map(([key, data], index) => {
      return `
      new Chart(document.getElementById('api_canvas_${index}'), {
        type: 'boxplot',
        data: {
          labels: ['${key}'],
          datasets: [{
            label: 'Response Time Distribution (ms)',
            data: [${JSON.stringify(data.durations)}],
            backgroundColor: 'rgba(255, 99, 132, 0.5)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: true } },
          scales: {
            y: {
              title: { display: true, text: 'Duration (ms)' }
            }
          }
        }
      });
    `;
    })
    .join('\n');

  const scenarioCharts = Object.entries(scenarioGrouped)
    .map(([name, data], index) => {
      return `
      new Chart(document.getElementById('scenario_canvas_${index}'), {
        type: 'heatmap',
        data: {
          labels: [...Array(${data.durations.length}).keys()],
          datasets: [{
            label: 'Request Index',
            data: ${JSON.stringify(data.durations)},
            backgroundColor: (ctx) => {
              const v = ctx.raw || 0;
              const intensity = Math.min(1, v / 1000);
              return \`rgba(0, 150, 255, \${intensity})\`;
            }
          }]
        },
        options: {
          responsive: true,
          scales: {
            x: {
              title: { display: true, text: 'Request Index' }
            },
            y: {
              title: { display: true, text: 'Duration (ms)' },
              beginAtZero: true
            }
          }
        }
      });
    `;
    })
    .join('\n');

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>K6 Performance Report</title>
    ${chartJsCdn}
    ${chartBoxplotCdn}
    <style>
      body { font-family: "Segoe UI", sans-serif; padding: 2rem; background: #f9f9f9; color: #333; }
      h1, h2, h3 { color: #222; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.05); }
      th, td { padding: 12px; border-bottom: 1px solid #eee; text-align: left; }
      th { background: #f4f4f4; font-weight: 600; }
      details { background: #fef4f4; border: 1px solid #f9c6c9; border-radius: 4px; padding: 8px; }
      canvas { background: #fff; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.05); margin-top: 20px; }
      .chart-row { display: none; }
    </style>
    <script>
      function toggleChart(id) {
        const row = document.getElementById(id);
        if (row.style.display === 'table-row') {
          row.style.display = 'none';
        } else {
          row.style.display = 'table-row';
        }
      }
      window.onload = function() {
        ${apiCharts}
        ${scenarioCharts}
      }
    </script>
  </head>
  <body>
    <h1>🚀 K6 Performance Report</h1>

    <h2>📊 Scenario Statistics</h2>
    <table>
      <thead>
        <tr>
          <th>Scenario</th>
          <th>Request Count</th>
          <th>Avg Duration</th>
          <th>Error Count</th>
        </tr>
      </thead>
      <tbody>${scenarioTable}</tbody>
    </table>

    <h2>🔍 API Statistics</h2>
    <table>
      <thead>
        <tr>
          <th>API Name</th>
          <th>Method</th>
          <th>URL</th>
          <th>Count</th>
          <th>Avg Duration</th>
          <th>Errors</th>
        </tr>
      </thead>
      <tbody>${apiTable}</tbody>
    </table>
  </body>
  </html>
  `;
}

(async () => {
  await parseJsonLines();
  const scenarioGrouped = groupByScenario(scenarioRecords);
  const apiGrouped = groupByApi(apiRecords);
  const html = generateHtml(apiGrouped, scenarioGrouped);
  fs.writeFileSync(outputHtml, html, 'utf-8');
  console.log(`✅ report generated: ${outputHtml}`);
})();
