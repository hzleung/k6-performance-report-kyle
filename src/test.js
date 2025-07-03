import http from 'k6/http';
import { sleep, check } from 'k6';
import { scenarioConfig } from './src/config/scenarioConfig.js';

const { userDistribution, scenarios, pages, thresholds } = scenarioConfig;

export let options = {
  vus: userDistribution.totalUVS,
  duration: '30s',
  thresholds
};

function generateCaseId() {
  return Math.floor(Math.random() * 10000).toString();
}

function replaceCaseId(obj, caseId) {
  if (typeof obj === 'string') {
    return obj.replaceAll('{caseId}', caseId);
  }
  if (typeof obj === 'object') {
    const newObj = {};
    for (const k in obj) {
      newObj[k] = replaceCaseId(obj[k], caseId);
    }
    return newObj;
  }
  return obj;
}

export default function () {
  const scenario = pickScenarioByWeight();
  const caseId = generateCaseId();

  scenario.pages.forEach((pageName) => {
    const page = pages[pageName];
    if (!page) return;

    page.apis.forEach((api) => {
      const url = replaceCaseId(api.url, caseId);
      const body = api.body ? JSON.stringify(replaceCaseId(api.body, caseId)) : null;
      const params = {
        headers: { 'Content-Type': 'application/json' },
      };

      let res;
      const start = Date.now();
      try {
        res =
          api.method === 'GET'
            ? http.get(url, params)
            : http.request(api.method, url, body, params);

        const duration = Date.now() - start;

        const result = {
          vu: __VU,
          scenario: scenario.name,
          page: pageName,
          apiName: api.name,
          url,
          method: api.method,
          status: res.status,
          duration,
          error: null,
        };

        const ok = check(res, {
          'status is 2xx': (r) => r.status >= 200 && r.status < 300,
        });

        if (!ok) {
          result.error = {
            code: res.status,
            message: res.body?.substring(0, 100) || 'Unknown error',
          };
        }

        console.log(JSON.stringify(result));
      } catch (err) {
        const duration = Date.now() - start;
        console.log(
          JSON.stringify({
            vu: __VU,
            scenario: scenario.name,
            page: pageName,
            apiName: api.name,
            url,
            method: api.method,
            status: 0,
            duration,
            error: {
              code: 'NETWORK',
              message: err.message,
            },
          })
        );
      }

      sleep(1);
    });
  });
}

// 加权随机选择场景
function pickScenarioByWeight() {
  const total = scenarios.reduce((sum, s) => sum + s.weight, 0);
  const r = Math.random() * total;
  let acc = 0;
  for (let s of scenarios) {
    acc += s.weight;
    if (r <= acc) return s;
  }
  return scenarios[0];
}
