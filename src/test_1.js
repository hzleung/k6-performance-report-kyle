import http from 'k6/http';
import { sleep, check, group } from 'k6';
import { scenarioConfig } from './src/config/scenarioConfig.js';

let scenarioFunction = {};

const getAmToken = (staffId) => {
  const url = "https://anycan-staff-dsp/dsp/root/authenticate";
  const params = {
    header: {
      "K-Client-Id": "ANYCAN",
      "K-Client-Secret": "anycan@123",
      "K-Open-Username": staffId,
    },
    withCredentials: true,
    credentials: "include"
  }
  const res = http.post(url, null, params);
  if (res.status !== 200) {
    console.error("Fetch Error token.");
    throw new Error("Failed to fetch token.")
  }
  try {
    const tokenValue = JSON.parse(res.body).tokenId;
    if (!tokenValue) {
      throw new Error("tokenId is missing in the response.")
    }
    return tokenValue;
  } catch (error) {
    console.error(`Error parsing token response: ${error.message}`);
    throw error;
  }
}

export function setup() {
  const token = getAmToken("123456789");
  return { token }
}

export const options = {
  scenarios: generateScenarios(
    scenarioConfig.scenarios,
    scenarioConfig.userDistribution.totalWeight,
    scenarioConfig.userDistribution.totalUVS,
  ),
  thresholds: scenarioConfig.thresholds || {}
};

function generateScenarios(scenarios, totalWeight, totalUVS) {
  let result = {};
  scenarios.forEach((scenario) => {
    const scenarioWeight = scenario.weight || 1;
    const scenarioUVS = Math.round((scenarioWeight / totalWeight) * totalUVS);
    result[scenario.name] = {
      executor: 'per-vu-iterations',
      vus: scenarioUVS,
      iterations: 1,
      maxDuration: "10m",
      exec: scenario.name,
    }
  });
  return result;
}

function executePage(pageName, context, scenarioName) {
  const pageConfig = scenarioConfig.pages[pageName];
  if (!pageConfig) {
    console.error(`Page config for ${pageName} not found`);
    return;
  }
  group(pageName, () => {
    pageConfig.apis.forEach((api) => {
      let url = api.url;
      let body = api.body ? JSON.stringify(api.body) : null;

      url = url.replace(/{(\w+)}/g, (_, key) => context[key] || `{${key}}`);
      if (body) {
        body = body.replace(/{(\w+)}/g, (_, key) => context[key] || `{${key}}`);
      }

      const params = {
        headers: { 'Content-Type': 'application/json' },
      };

      let res;
      const start = Date.now();

      try {
        res = http.request(api.method, url, body, params);
        const duration = Date.now() - start;

        check(res, {
          [`${api.name || 'API'}`]: (r) => r.status === 200,
        });

        console.log(JSON.stringify({
          scenario: scenarioName,
          page: pageName,
          apiName: api.name,
          url,
          method: api.method,
          status: res.status,
          duration,
          error: res.status >= 400 ? { code: res.status, message: res.body } : null,
          vu: __VU,
          iteration: __ITER,
        }));

        if (api.name === 'getADGroup' && res.status === 200) {
          context.caseId = JSON.parse(res.body).caseId;
        }

      } catch (err) {
        const duration = Date.now() - start;
        console.log(JSON.stringify({
          scenario: scenarioName,
          page: pageName,
          apiName: api.name,
          url,
          method: api.method,
          status: 'ERROR',
          duration,
          error: { code: 'EXCEPTION', message: err.message },
          vu: __VU,
          iteration: __ITER,
        }));
      }
    });
  });
}

scenarioConfig.scenarios.forEach((scenario) => {
  const scenarioName = scenario.name;
  scenarioFunction[scenarioName] = function (sharedData) {
    let context = { ...sharedData };
    scenario.pages.forEach((pageName) => {
      executePage(pageName, context, scenarioName);
    });
    sleep(5);
  };
});

export const { create_Case, cancel_Case, complete_Case, incomplete_Case } = scenarioFunction;
