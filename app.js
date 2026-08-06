const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3001;

app.use(express.static(path.join(__dirname, 'static')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'index.html')));
app.get(['/album', '/album.html'], (req, res) => res.sendFile(path.join(__dirname, 'templates', 'album.html')));
app.get(['/playlist', '/playlist.html'], (req, res) => res.sendFile(path.join(__dirname, 'templates', 'playlist.html')));
app.listen(port, () => console.log(`Flowbee is running at http://localhost:${port}`));
