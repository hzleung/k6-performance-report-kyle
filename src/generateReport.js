// generateReport.js
import fs from 'fs';
import readline from 'readline';
import path from 'path';

const logFile = 'results.json'; // k6 --out json=results.json
const outputHtml = 'report.html';

const records = [];

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
        records.push({
          name: tags.name || 'unknown',
          method: tags.method,
          url: tags.url,
          status: tags.status || 'unknown',
          duration: json.data.value, // in ms
          uvs: parseInt(tags.vu) || 0,
          error: tags.error || null
        });
      }
    } catch (err) {
      console.error('解析失败:', err.message);
    }
  }
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
        duration: rec.duration
      });
    }
  }

  return grouped;
}

function generateHtml(grouped) {
  const chartJsCdn = `<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>`;
  const rows = Object.entries(grouped).map(([key, data], index) => {
    const avg = (data.durations.reduce((a, b) => a + b, 0) / data.durations.length).toFixed(2);
    const errorBlock = data.errors.length
      ? `<details><summary>${data.errors.length} error(s)</summary><pre>${data.errors.map(e => JSON.stringify(e, null, 2)).join('\n\n')}</pre></details>`
      : '✅ No errors';

    return `
      <tr>
        <td>${data.name}</td>
        <td>${data.method}</td>
        <td>${data.url}</td>
        <td>${data.count}</td>
        <td>${avg} ms</td>
        <td>${errorBlock}</td>
      </tr>
    `;
  }).join('\n');

  const charts = Object.entries(grouped).map(([key, data], index) => {
    return `
    <h4>${key}</h4>
    <canvas id="chart_${index}" height="100"></canvas>
    <script>
      const ctx_${index} = document.getElementById('chart_${index}');
      new Chart(ctx_${index}, {
        type: 'line',
        data: {
          labels: [...Array(${data.durations.length}).keys()],
          datasets: [{
            label: 'Duration (ms)',
            data: ${JSON.stringify(data.durations)},
            borderColor: 'rgba(75, 192, 192, 1)',
            fill: false,
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          plugins: {
            title: {
              display: false
            }
          }
        }
      });
    </script>
    `;
  }).join('\n');

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>k6 Performance Test Report</title>
    ${chartJsCdn}
    <style>
      body { font-family: Arial; padding: 20px; }
      table { border-collapse: collapse; width: 100%; margin-bottom: 40px; }
      th, td { border: 1px solid #ccc; padding: 8px; }
      th { background-color: #f4f4f4; }
      canvas { max-width: 100%; }
    </style>
  </head>
  <body>
    <h1>Performance Test Report</h1>
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
      <tbody>
        ${rows}
      </tbody>
    </table>

    <h2>Response Time Charts</h2>
    ${charts}
  </body>
  </html>
  `;
}

(async () => {
  await parseJsonLines();
  const grouped = groupByApi(records);
  const html = generateHtml(grouped);
  fs.writeFileSync(outputHtml, html, 'utf-8');
  console.log(`✅ 报告已生成: ${outputHtml}`);
})();
