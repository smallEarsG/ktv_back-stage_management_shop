// Local merchant build preview, connected to the isolated loopback backend.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path')
const port = Number(process.env.PREVIEW_PORT || 8081), apiPort = Number(process.env.API_PORT || 8080)
for (const value of [port, apiPort]) if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error('Invalid local preview port')
const root = path.resolve(__dirname, '../dist')
if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('Build the merchant frontend first')
http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    const upstream = http.request({ hostname: '127.0.0.1', port: apiPort, path: req.url, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${apiPort}` } }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res) })
    upstream.on('error', () => { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ code: 502, message: '本地演练后端尚未启动' })) })
    req.pipe(upstream); return
  }
  let file
  try { file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname)) } catch { res.writeHead(400); res.end(); return }
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(root, 'index.html')
  res.setHeader('Content-Type', { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }[path.extname(file)] || 'application/octet-stream')
  fs.createReadStream(file).pipe(res)
}).listen(port, '127.0.0.1', () => console.log(`Merchant rehearsal preview: http://127.0.0.1:${port}/group-buy/demo`))
