// Requiere Node.js instalado
// Ejecuta: npm install express socket.io

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Servir archivos estáticos desde la carpeta "public"
app.use(express.static(__dirname + '/public'));

// Asegura que la carpeta "chats" exista
const chatsDir = path.join(__dirname, 'chats');
if (!fs.existsSync(chatsDir)) {
  fs.mkdirSync(chatsDir, { recursive: true });
  console.log('📁 Carpeta "chats" creada automáticamente.');
}

io.on('connection', (socket) => {
  let userType = null;
  let chatId = null;

  socket.on('joinChat', ({ type, id }) => {
    userType = type; // "cliente", "jugador" o "admin"
    chatId = id;
    socket.join(chatId);
  });

  socket.on('sendMessage', (msg) => {
    if (!chatId || !userType) return;

    const alias =
      userType === 'cliente' ? 'Cliente A' :
      userType === 'jugador' ? 'Jugador 1' :
      'Admin';

    const message = {
      autor: alias,
      texto: msg,
      hora: new Date().toISOString()
    };

    // Enviar mensaje al chat correspondiente
    io.to(chatId).emit('receiveMessage', message);

    // Guardar el mensaje en el archivo JSON correspondiente, sin sobrescribir
    const filePath = path.join(chatsDir, `${chatId}.json`);
    try {
      let messages = [];
      if (fs.existsSync(filePath)) {
        messages = JSON.parse(fs.readFileSync(filePath));
      }
      messages.push(message);
      fs.writeFileSync(filePath, JSON.stringify(messages, null, 2));
      console.log(`💾 Mensaje agregado a ${filePath}`);
    } catch (err) {
      console.error('❌ Error al guardar mensaje en el chat:', err);
    }
  });
});

// Iniciar el servidor
server.listen(3000, () => {
  console.log('🚀 Servidor en http://localhost:3000');
});


