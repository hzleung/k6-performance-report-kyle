import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  vus: 5,
  duration: '10s',
};

export default function () {
  const url = 'https://httpbin.test.k6.io/delay/1'; // 模拟1秒延迟
  const method = 'GET';
  const response = http.get(url);
  const duration = response.timings.duration;

  const apiInfo = {
    name: 'Test API',
    url,
    status: response.status,
    method,
    duration,
    vu: __VU,
    error: null,
  };

  const success = check(response, {
    'status is 200': (r) => r.status === 200,
  });

  if (!success) {
    apiInfo.error = {
      code: response.status,
      message: response.body?.substring(0, 100) || 'Unknown error',
    };
  }

  console.log(JSON.stringify(apiInfo));
  sleep(1);
}
