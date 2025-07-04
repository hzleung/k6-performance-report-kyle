import fs from 'fs';
import readline from 'readline';

const logFile = 'results.json';
const outputHtml = 'report.html';

const apiRecords = [];
const scenarioRecords = [];
const pageRecords = [];
const timeSeries = [];

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
        if (tags.scenarioName === 'setup') continue; // 过滤 setup 请求

        const record = {
          name: tags.name || 'unknown',
          method: tags.method || 'GET',
          url: tags.url || 'unknown',
          status: tags.status || 'unknown',
          duration: json.data.value,
          timestamp: json.data.time,
          vu: parseInt(tags.vu) || 0,
          scenario: tags.scenarioName || 'unknown',
          page: tags.pageName || 'unknown',
          error: tags.error || null
        };
        apiRecords.push(record);
        scenarioRecords.push({
          scenario: record.scenario,
          duration: record.duration,
          status: record.status,
          error: record.error
        });
        pageRecords.push({
          page: record.page,
          duration: record.duration,
          status: record.status,
          error: record.error
        });
        timeSeries.push({
          time: record.timestamp,
          duration: record.duration
        });
      }
    } catch (e) {
      console.warn('JSON parse error:', e.message);
    }
  }
}

function groupByField(records, field) {
  const grouped = {};
  for (const rec of records) {
    const key = rec[field];
    if (!grouped[key]) {
      grouped[key] = {
        count: 0,
        durations: [],
        errors: []
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
        errors: []
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

function formatTimestamp(ts) {
  const date = new Date(ts);
  return date.toISOString().split('T')[1].slice(0, 8); // HH:mm:ss
}

function generateHtml(apiGrouped, scenarioGrouped, pageGrouped, trendData) {
  const chartJsCdn = `<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>`;

  function makeTable(title, grouped, fieldName, chartPrefix) {
    if (fieldName === "API") {

    }
    return `
      <h2>${title}</h2>
      <table>
        <thead>
          <tr>
            ${fieldName === "API"
        ? <>
          <th>API Name</th>
          <th>Method</th>
          <th>URL</th>
        </>
        : <>
          <th>{fieldName}</th>
          <th>Count</th>
        </>}
            
            <th>Avg Duration (ms)</th>
            <th>Error Count</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(grouped).map(([name, data], i) => {
          const avg = (data.durations.reduce((a, b) => a + b, 0) / data.durations.length).toFixed(2);
          return `
              <tr class="toggle-chart" data-target="${chartPrefix}_${i}">
                <td>${name}</td>
                <td>${data.count}</td>
                <td>${avg}</td>
                <td>${data.errors.length}</td>
              </tr>
              <tr id="${chartPrefix}_${i}" class="chart-row">
                <td colspan="4">
                  <canvas id="chart_${chartPrefix}_${i}" height="100"></canvas>
                </td>
              </tr>
            `;
        }).join('\n')}
        </tbody>
      </table>
    `;
  }

  function makeChartScripts(grouped, chartPrefix, color, labelText) {
    return Object.entries(grouped).map(([name, data], i) => `
      new Chart(document.getElementById("chart_${chartPrefix}_${i}"), {
        type: 'line',
        data: {
          labels: [...Array(${data.durations.length}).keys()],
          datasets: [{
            label: '${labelText}',
            data: ${JSON.stringify(data.durations)},
            borderColor: '${color}',
            tension: 0.3,
            fill: false
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: true }
          },
          scales: {
            x: { title: { display: true, text: 'Request Index' }},
            y: { title: { display: true, text: 'Duration (ms)' }}
          }
        }
      });
    `).join('\n');
  }

  const trendLabels = trendData.map(d => formatTimestamp(d.time));
  const trendDurations = trendData.map(d => d.duration);

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>K6 Performance Report</title>
    ${chartJsCdn}
    <style>
      body { font-family: sans-serif; padding: 2rem; background: #fafafa; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
      th, td { padding: 10px; border-bottom: 1px solid #ddd; }
      th { background: #f2f2f2; }
      tr.chart-row { display: none; }
      tr.toggle-chart:hover { background: #f9f9f9; cursor: pointer; }
      canvas { background: #fff; border-radius: 4px; margin: 1rem 0; }
    </style>
  </head>
  <body>
    <h1>🚀 K6 Performance Report</h1>

    ${makeTable("📊 Scenario Summary", scenarioGrouped, "Scenario", "scenario")}
    ${makeTable("📄 Page Summary", pageGrouped, "Page", "page")}
    ${makeTable("🔍 API Summary", apiGrouped, "API", "api")}

    <h2>⏱️ API Trend Over Time</h2>
    <canvas id="trendChart" height="120"></canvas>

    <script>
      ${makeChartScripts(scenarioGrouped, "scenario", 'rgba(255, 99, 132, 1)', 'Scenario Duration (ms)')}
      ${makeChartScripts(pageGrouped, "page", 'rgba(255, 159, 64, 1)', 'Page Duration (ms)')}
      ${makeChartScripts(apiGrouped, "api", 'rgba(54, 162, 235, 1)', 'API Duration (ms)')}

      new Chart(document.getElementById("trendChart"), {
        type: 'line',
        data: {
          labels: ${JSON.stringify(trendLabels)},
          datasets: [{
            label: 'API Response Time (ms)',
            data: ${JSON.stringify(trendDurations)},
            borderColor: 'rgba(75, 192, 192, 1)',
            tension: 0.3,
            fill: false
          }]
        },
        options: {
          responsive: true,
          scales: {
            x: { title: { display: true, text: 'Time (HH:mm:ss)' }},
            y: { title: { display: true, text: 'Duration (ms)' }}
          }
        }
      });

      document.querySelectorAll('.toggle-chart').forEach(row => {
        row.addEventListener('click', () => {
          const target = row.dataset.target;
          const chartRow = document.getElementById(target);
          chartRow.style.display = chartRow.style.display === 'table-row' ? 'none' : 'table-row';
        });
      });
    </script>
  </body>
  </html>
  `;
}

// 主执行逻辑
(async () => {
  await parseJsonLines();
  const scenarioGrouped = groupByField(scenarioRecords, 'scenario');
  const pageGrouped = groupByField(pageRecords, 'page');
  const apiGrouped = groupByApi(apiRecords);
  const html = generateHtml(apiGrouped, scenarioGrouped, pageGrouped, timeSeries);
  fs.writeFileSync(outputHtml, html, 'utf-8');
  console.log(`✅ Report generated: ${outputHtml}`);
})();
