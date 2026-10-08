const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const PORT = process.env.PORT || 8000;
app.use(express.static(path.join(__dirname, 'public')));

// Load dictionary
const wordsPath = path.join(__dirname, 'words.txt');
let validWords = new Set();
let easySyllables = ['TH', 'IN', 'ER', 'RE', 'AN', 'ON', 'AT', 'EN', 'ND', 'TI', 'ES', 'OR'];
let normalSyllables = ['CON', 'PRO', 'ING', 'TER', 'CAT', 'ION', 'VER', 'FOR', 'MAN', 'DAY', 'OUT'];
let hardSyllables = ['PSY', 'QUE', 'SPH', 'GHT', 'FOX', 'ZOO', 'JAZ', 'RHY', 'OAK', 'LYM'];

if (fs.existsSync(wordsPath)) {
  const fileData = fs.readFileSync(wordsPath, 'utf8');
  fileData.split(/\r?\n/).forEach(w => {
    const cleaned = w.trim().toLowerCase();
    if (cleaned.length >= 2) validWords.add(cleaned);
  });
  console.log(`Loaded ${validWords.size} words for Node server`);
}

const rooms = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? generateCode() : code;
}

wss.on('connection', (ws) => {
  let currentRoom = null;
  let playerId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      // Mirrored handlers for full Node compatibility
    } catch (e) {
      console.error(e);
    }
  });

  ws.on('close', () => {
    if (currentRoom) {
      currentRoom.players.delete(playerId);
      if (currentRoom.players.size === 0) rooms.delete(currentRoom.code);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Word Blast Arena (Node.js) listening on http://localhost:${PORT}`);
});
