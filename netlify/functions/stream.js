const http = require('http');
const https = require('https');
const url = require('url');

function fetchUrl(targetUrl) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(targetUrl);
    const lib = parsed.protocol === 'https:' ? https : http;
    lib.get(targetUrl, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ data: Buffer.concat(chunks), headers: res.headers }));
      res.on('error', reject);
    }).on('error', reject);
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
  const targetUrl = event.queryStringParameters?.url;
  if (!targetUrl) {
    return { statusCode: 400, body: 'Missing url parameter' };
  }

  try {
    const { data, headers } = await fetchUrl(decodeURIComponent(targetUrl));
    const contentType = headers['content-type'] || '';
    const isM3u8 = contentType.includes('mpegurl') || targetUrl.includes('.m3u8');

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Cache-Control': 'no-cache',
    };

    if (isM3u8) {
      const proxyBase = `/.netlify/functions/stream?url=`;
      const rewritten = rewriteM3u8(data.toString(), decodeURIComponent(targetUrl), proxyBase);
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/vnd.apple.mpegurl' },
        body: rewritten,
      };
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': contentType || 'application/octet-stream' },
      body: data.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    return { statusCode: 500, body: err.message };
  }
};
