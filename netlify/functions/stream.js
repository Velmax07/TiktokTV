const http = require('http');
const https = require('https');
const url = require('url');

function fetchUrl(targetUrl) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(targetUrl);
    const lib = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.path,
      method: 'GET',
      rejectUnauthorized: false, // ignora erros de SSL
    };
    const req = lib.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ data: Buffer.concat(chunks), headers: res.headers, status: res.statusCode }));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function rewriteM3u8(content, originalUrl, proxyBase) {
  const base = originalUrl.substring(0, originalUrl.lastIndexOf('/') + 1);
  return content
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;
      const absUrl = trimmed.startsWith('http') ? trimmed : base + trimmed;
      return `${proxyBase}${encodeURIComponent(absUrl)}`;
    })
    .join('\n');
}

exports.handler = async (event) => {
  const targetUrl = decodeURIComponent(event.queryStringParameters?.url || '');
  if (!targetUrl) {
    return { statusCode: 400, body: 'Missing url parameter' };
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Cache-Control': 'no-cache',
  };

  try {
    const { data, headers, status } = await fetchUrl(targetUrl);
    const contentType = headers['content-type'] || '';
    const isM3u8 = contentType.includes('mpegurl') || targetUrl.includes('.m3u8');

    if (isM3u8) {
      const proxyBase = `/.netlify/functions/stream?url=`;
      const rewritten = rewriteM3u8(data.toString(), targetUrl, proxyBase);
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/vnd.apple.mpegurl' },
        body: rewritten,
      };
    }

    return {
      statusCode: status || 200,
      headers: { ...corsHeaders, 'Content-Type': contentType || 'application/octet-stream' },
      body: data.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
