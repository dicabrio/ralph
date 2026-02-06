const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 3032;

// MIME types
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

// Create HTTP server
const server = http.createServer((req, res) => {
    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Parse URL and remove query string
    const url = new URL(req.url, `http://${req.headers.host}`);
    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    filePath = path.join(__dirname, filePath);

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error: ' + err.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Store connected clients
const clients = new Set();

function broadcast(message) {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('Client connected. Total clients:', clients.size);

    ws.on('message', (message) => {
        console.log('Received:', message.toString());

        // Broadcast to all clients
        broadcast(message.toString());
    });

    ws.on('close', () => {
        clients.delete(ws);
        console.log('Client disconnected. Total clients:', clients.size);
    });
});

// Watch prd.json for changes and notify clients
const prdPath = path.join(__dirname, 'prd.json');
let debounceTimer = null;
let prdWatcher = null;

function schedulePrdUpdate() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        fs.readFile(prdPath, 'utf8', (err, content) => {
            if (err) {
                console.error('Failed to read prd.json:', err);
                broadcast({ type: 'reload' });
                return;
            }

            try {
                const data = JSON.parse(content);
                console.log('prd.json changed, sending update...');
                broadcast({ type: 'prd-update', data });
            } catch (parseError) {
                console.error('Failed to parse prd.json:', parseError);
                broadcast({ type: 'reload' });
            }
        });
    }, 100);
}

function watchPrdFile() {
    if (prdWatcher) prdWatcher.close();
    try {
        prdWatcher = fs.watch(prdPath, (eventType) => {
            if (eventType === 'change') {
                schedulePrdUpdate();
                return;
            }

            if (eventType === 'rename') {
                schedulePrdUpdate();
                watchPrdFile();
            }
        });
        prdWatcher.on('error', (err) => {
            console.error('prd.json watch error:', err);
        });
    } catch (err) {
        console.error('prd.json watch setup failed:', err);
        setTimeout(watchPrdFile, 1000);
    }
}

watchPrdFile();

// Start server
server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════╗
║   PRD Dashboard Server                     ║
╠════════════════════════════════════════════╣
║   HTTP:      http://localhost:${PORT}         ║
║   WebSocket: ws://localhost:${PORT}           ║
╠════════════════════════════════════════════╣
║   Watching prd.json for changes...         ║
╚════════════════════════════════════════════╝
`);
});
