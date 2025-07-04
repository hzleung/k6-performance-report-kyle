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
        if (tags.scenarioName === 'setup') continue;

        const record = {
          name: tags.apiName || 'unknown',
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

function makeTable(title, grouped, fieldName, chartPrefix) {
  return `
    <h2>${title}</h2>
    <table>
      <thead>
        <tr>
          <th>${fieldName}</th>
          <th>Count</th>
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

function makeApiTable(apiGrouped) {
  return `
    <h2>🔍 API Summary</h2>
    <table>
      <thead>
        <tr>
          <th>API Name</th>
          <th>Method</th>
          <th>URL</th>
          <th>Count</th>
          <th>Avg Duration (ms)</th>
          <th>Error Count</th>
        </tr>
      </thead>
      <tbody>
        ${Object.entries(apiGrouped).map(([key, data], i) => {
    const avg = (data.durations.reduce((a, b) => a + b, 0) / data.durations.length).toFixed(2);
    return `
            <tr class="toggle-chart" data-target="api_${i}">
              <td>${data.name}</td>
              <td>${data.method}</td>
              <td>${data.url}</td>
              <td>${data.count}</td>
              <td>${avg}</td>
              <td>${data.errors.length}</td>
            </tr>
            <tr id="api_${i}" class="chart-row">
              <td colspan="6">
                <canvas id="chart_api_${i}" height="100"></canvas>
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

function groupByVuOverTime(records) {
  const grouped = {};
  for (const rec of records) {
    const vu = rec.vu || 0;
    const timeKey = Math.floor(rec.timestamp / 1000);
    if (!grouped[vu]) grouped[vu] = {};
    if (!grouped[vu][timeKey]) {
      grouped[vu][timeKey] = { durations: [], count: 0 };
    }
    grouped[vu][timeKey].durations.push(rec.duration);
    grouped[vu][timeKey].count++;
  }

  const vuTrend = {};
  for (const vu in grouped) {
    const timePoints = Object.keys(grouped[vu]).sort((a, b) => a - b);
    vuTrend[vu] = timePoints.map(tp => {
      const data = grouped[vu][tp];
      const avg = data.durations.reduce((a, b) => a + b, 0) / data.count;
      return { time: parseInt(tp) * 1000, avgDuration: avg };
    });
  }
  return vuTrend;
}

function prepareVuTrendChartData(vuTrend) {
  const allTimesSet = new Set();
  for (const vu in vuTrend) {
    vuTrend[vu].forEach(point => allTimesSet.add(point.time));
  }
  const allTimes = Array.from(allTimesSet).sort((a, b) => a - b);
  const labels = allTimes.map(ts => {
    const d = new Date(ts);
    return d.toISOString().split('T')[1].slice(0, 8);
  });

  const colors = ['red', 'blue', 'green', 'orange', 'purple', 'brown'];

  const datasets = Object.entries(vuTrend).map(([vu, points], i) => {
    const map = {};
    points.forEach(p => { map[p.time] = p.avgDuration; });
    const data = allTimes.map(t => map[t] ?? null);
    return {
      label: `VU ${vu}`,
      data,
      borderColor: colors[i % colors.length],
      tension: 0.3,
      fill: false,
      spanGaps: true
    };
  });

  return { labels, datasets };
}

function generateHtml(apiGrouped, scenarioGrouped, pageGrouped, trendData, vuTrend) {
  const trendLabels = trendData.map(d => formatTimestamp(d.time));
  const trendDurations = trendData.map(d => d.duration);
  const vuTrendData = prepareVuTrendChartData(vuTrend);

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>K6 Performance Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
      body { font-family: sans-serif; padding: 2rem; background: #fafafa; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
      th, td { padding: 10px; border-bottom: 1px solid #ddd; vertical-align: top; }
      th { background: #f2f2f2; }
      tr.chart-row { display: none; }
      tr.toggle-chart:hover { background: #f9f9f9; cursor: pointer; }
      canvas { background: #fff; border-radius: 4px; margin: 1rem 0; }
      td:nth-child(3) { word-break: break-word; }
    </style>
  </head>
  <body>
    <h1>🚀 K6 Performance Report</h1>

    ${makeTable("📊 Scenario Summary", scenarioGrouped, "Scenario", "scenario")}
    ${makeTable("📄 Page Summary", pageGrouped, "Page", "page")}
    ${makeApiTable(apiGrouped)}

    <h2>⏱️ API Trend Over Time</h2>
    <canvas id="trendChart" height="120"></canvas>

    <h2>👥 VU Response Time Comparison</h2>
    <canvas id="vuTrendChart" height="120"></canvas>

    <script>
      document.querySelectorAll('tr.toggle-chart').forEach(tr => {
        tr.addEventListener('click', () => {
          const targetId = tr.getAttribute('data-target');
          const chartRow = document.getElementById(targetId);
          if (!chartRow) return;
          if (chartRow.style.display === 'table-row') {
            chartRow.style.display = 'none';
          } else {
            chartRow.style.display = 'table-row';
          }
        });
      });

      ${makeChartScripts(scenarioGrouped, 'scenario', 'blue', 'Duration (ms)')}
      ${makeChartScripts(pageGrouped, 'page', 'green', 'Duration (ms)')}
      ${makeChartScripts(apiGrouped, 'api', 'red', 'Duration (ms)')}

      new Chart(document.getElementById('trendChart'), {
        type: 'line',
        data: {
          labels: ${JSON.stringify(trendLabels)},
          datasets: [{
            label: 'API Duration',
            data: ${JSON.stringify(trendDurations)},
            borderColor: 'purple',
            fill: false,
            tension: 0.3,
            spanGaps: true
          }]
        },
        options: {
          responsive: true,
          scales: {
            x: { title: { display: true, text: 'Time (HH:mm:ss)' } },
            y: { title: { display: true, text: 'Duration (ms)' } }
          }
        }
      });

      new Chart(document.getElementById('vuTrendChart'), {
        type: 'line',
        data: {
          labels: ${JSON.stringify(vuTrendData.labels)},
          datasets: ${JSON.stringify(vuTrendData.datasets)}
        },
        options: {
          responsive: true,
          plugins: { legend: { display: true } },
          scales: {
            x: { title: { display: true, text: 'Time (HH:mm:ss)' }},
            y: { title: { display: true, text: 'Duration (ms)' }}
          }
        }
      });
    </script>
  </body>
  </html>
  `;
}

(async () => {
  console.log('Parsing JSON lines...');
  await parseJsonLines();

  const scenarioGrouped = groupByField(scenarioRecords, 'scenario');
  const pageGrouped = groupByField(pageRecords, 'page');
  const apiGrouped = groupByApi(apiRecords);
  const vuTrend = groupByVuOverTime(apiRecords);

  const timeSeriesSorted = apiRecords
    .map(r => ({ time: r.timestamp, duration: r.duration }))
    .sort((a, b) => a.time - b.time);

  const html = generateHtml(apiGrouped, scenarioGrouped, pageGrouped, timeSeriesSorted, vuTrend);
  fs.writeFileSync(outputHtml, html, 'utf-8');
  console.log(`✅ Report generated: ${outputHtml}`);
})();
