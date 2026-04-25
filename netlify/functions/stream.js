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
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' }
    };
    const req = lib.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ data: Buffer.concat(chunks), headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(9000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function rewriteM3u8ToHttps(content, originalUrl) {
  // Converte URLs relativas para absolutas e http:// para https://
  const parsed = url.parse(originalUrl);
  const base = `${parsed.protocol}//${parsed.host}${parsed.pathname.substring(0, parsed.pathname.lastIndexOf('/') + 1)}`;

  return content.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    // URL relativa → absoluta
    const absUrl = trimmed.startsWith('http') ? trimmed : base + trimmed;
    // Se for outro m3u8 (playlist de variantes), ainda proxeia
    if (absUrl.includes('.m3u8')) {
      return `/.netlify/functions/stream?url=${encodeURIComponent(absUrl)}`;
    }
    // Segmento (.ts, etc.) → só converte http para https para o browser buscar direto
    return absUrl.replace(/^http:\/\//, 'https://');
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
    const { data, headers } = await fetchUrl(targetUrl);
    const contentType = headers['content-type'] || '';
    const text = data.toString('utf8');
    const isM3u8 = contentType.includes('mpegurl') ||
                   targetUrl.includes('.m3u8') ||
                   text.startsWith('#EXTM3U');

    if (isM3u8) {
      const rewritten = rewriteM3u8ToHttps(text, targetUrl);
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/vnd.apple.mpegurl' },
        body: rewritten,
      };
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': contentType || 'video/MP2T' },
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
