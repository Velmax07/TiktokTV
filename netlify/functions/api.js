const http = require('http');

const USERNAME = 'f498c3d8e591bfcf632385adb022e6cb';
const PASSWORD = '35fadad7f6af80b732c2';
const BASE_URL = 'http://bluebox.click/player_api.php';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const action = params.action || 'get_live_streams';
  const stream_id = params.stream_id || '';
  const limit = params.limit || '5';

  let url = `${BASE_URL}?username=${USERNAME}&password=${PASSWORD}&action=${action}`;
  if (stream_id) url += `&stream_id=${stream_id}`;
  if (action === 'get_short_epg') url += `&limit=${limit}`;

  try {
    const data = await fetchUrl(url);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: data,
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
