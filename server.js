// Requiere Node.js instalado
// Ejecuta: npm install express socket.io fs

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(__dirname + '/public'));

const chatLogs = {};

io.on('connection', (socket) => {
  let userType = null;
  let chatId = null;

  socket.on('joinChat', ({ type, id }) => {
    userType = type; // "cliente", "jugador" o "admin"
    chatId = id;
    socket.join(chatId);
    if (!chatLogs[chatId]) chatLogs[chatId] = [];
  });

  socket.on('sendMessage', (msg) => {
    if (!chatId || !userType) return;
    const alias = userType === 'cliente' ? 'Cliente A' : userType === 'jugador' ? 'Jugador 1' : 'Admin';
    const message = { autor: alias, texto: msg, hora: new Date().toISOString() };
    chatLogs[chatId].push(message);
    io.to(chatId).emit('receiveMessage', message);
    fs.writeFileSync(`./chats/${chatId}.json`, JSON.stringify(chatLogs[chatId], null, 2));
  });
});

server.listen(3000, () => console.log('Servidor en http://localhost:3000'));

// Crea un directorio "public" con un HTML que conecte al socket y envíe/reciba mensajes.
// Crea también un directorio "chats" para guardar los JSON.
