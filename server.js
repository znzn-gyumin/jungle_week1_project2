const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = process.env.PORT || 3001;
const pages = {
  '/': 'templates/index.html',
  '/index.html': 'templates/index.html',
  '/album': 'templates/album.html',
  '/album.html': 'templates/album.html',
  '/playlist': 'templates/playlist.html',
  '/playlist.html': 'templates/playlist.html'
};

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function sendFile(response, relativePath) {
  const filePath = path.resolve(root, relativePath);
  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500);
      response.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, { 'Content-Type': mimeTypes[extension] || 'application/octet-stream' });
    response.end(content);
  });
}

http.createServer((request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  if (pages[pathname]) {
    sendFile(response, pages[pathname]);
    return;
  }

  if (pathname.startsWith('/static/')) {
    sendFile(response, pathname.slice(1));
    return;
  }

  response.writeHead(404);
  response.end('Not found');
}).listen(port, () => {
  console.log(`플로비 is running at http://localhost:${port}`);
});
