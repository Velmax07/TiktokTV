const http = require('http');
const https = require('https');
const url = require('url');

function fetchUrl(targetUrl) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(targetUrl);
    const lib = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.path,
      method: 'GET',
      rejectUnauthorized: false,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': '*/*',
      }
    };
    const req = lib.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Segue redirect
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        data: Buffer.concat(chunks),
        headers: res.headers,
        status: res.statusCode
      }));
    });
    req.on('error', reject);
    req.setTimeout(9000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function rewriteM3u8(content, originalUrl, proxyBase) {
  const parsed = url.parse(originalUrl);
  const base = `${parsed.protocol}//${parsed.host}${parsed.pathname.substring(0, parsed.pathname.lastIndexOf('/') + 1)}`;
  
  return content.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    // URL absoluta ou relativa - sempre proxear
    const absUrl = trimmed.startsWith('http') ? trimmed : base + trimmed;
    return proxyBase + encodeURIComponent(absUrl);
  }).join('\n');
}

exports.handler = async (event) => {
  const targetUrl = decodeURIComponent(event.queryStringParameters?.url || '');
  if (!targetUrl) return { statusCode: 400, body: 'Missing url' };

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Cache-Control': 'no-cache',
  };

  try {
    const { data, headers, status } = await fetchUrl(targetUrl);
    const contentType = headers['content-type'] || '';
    const isM3u8 = contentType.includes('mpegurl') || 
                   targetUrl.includes('.m3u8') || 
                   data.toString().startsWith('#EXTM3U');

    if (isM3u8) {
      const proxyBase = `/.netlify/functions/stream?url=`;
      const rewritten = rewriteM3u8(data.toString('utf8'), targetUrl, proxyBase);
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/vnd.apple.mpegurl' },
        body: rewritten,
      };
    }

    // Segmento binário (.ts, etc)
    return {
      statusCode: status || 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType || 'video/MP2T',
      },
      body: data.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message })
    };
  }
};
