const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);

// ✅ Socket.IO configurado para móviles e iPhone
const io = socketIo(server, {
  transports: ['websocket', 'polling'],
  pingInterval: 20000,
  pingTimeout: 60000,
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ✅ Conexión a MongoDB Atlas
mongoose.connect('mongodb+srv://ultimatefutservice:7KLKDc0fqYKYAlZc@cluster0.shrqoco.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB Atlas'))
.catch(err => console.error('❌ Error connecting to MongoDB:', err));

// ✅ Esquema de mensajes
const messageSchema = new mongoose.Schema({
  chatId: String,
  author: String,
  text: String,
  time: Date,
});
const Message = mongoose.model('Message', messageSchema);

app.use(express.static(__dirname + '/public'));

// ✅ Ruta para obtener historial del chat
app.get('/chat/:chatId', async (req, res) => {
  try {
    const messages = await Message.find({ chatId: req.params.chatId }).sort({ time: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching messages' });
  }
});

// ✅ Ruta para admin (JSON)
app.get('/api/messages', async (req, res) => {
  const chatId = req.query.chatId;
  if (!chatId) return res.status(400).send({ error: 'Missing chatId' });

  try {
    const messages = await Message.find({ chatId }).sort({ time: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).send({ error: 'Error fetching messages' });
  }
});

// ✅ Contraseñas
const passwords = {
  player: 'JAHEUhdjjdbc234hd',
  admin: 'somoslosputosamos23dhf1A',
};

// ✅ SOCKET.IO - lógica principal
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  // Cuando alguien entra al chat
  socket.on('joinChat', ({ type, id, password }) => {
    if (!type || !id) {
      socket.emit('errorMsg', 'Missing user type or chatId');
      return;
    }

    // Validar contraseñas
    if ((type === 'player' || type === 'admin') && passwords[type] !== password) {
      socket.emit('errorMsg', 'Incorrect password');
      return;
    }

    // ✅ Guardar info en el socket (persistente)
    socket.userType = type;
    socket.chatId = id;

    socket.join(socket.chatId);
    console.log(`➡ User joined: type=${socket.userType}, chatId=${socket.chatId}`);

    socket.emit('joined', { success: true });
  });

  // Cuando alguien envía un mensaje
  socket.on('sendMessage', async (msg) => {
    if (!socket.chatId || !socket.userType) {
      console.warn('⚠️ Message ignored: missing chatId or userType');
      return;
    }

    const alias =
      socket.userType === 'client' ? 'Client' :
      socket.userType === 'player' ? 'Player' :
      'Admin';

    const message = {
      chatId: socket.chatId,
      author: alias,
      text: msg,
      time: new Date(),
    };

    try {
      const newMessage = new Message(message);
      await newMessage.save();
      console.log(`💾 [${socket.chatId}] ${alias}: ${msg}`);
    } catch (err) {
      console.error('❌ Error saving message:', err);
    }

    io.to(socket.chatId).emit('receiveMessage', message);
  });

  // Cuando se desconecta
  socket.on('disconnect', (reason) => {
    console.log('❌ Client disconnected:', socket.id, 'reason:', reason);
  });

  // Intentos de reconexión (para debug)
  socket.on('reconnect_attempt', (attempt) => {
    console.log(`🔁 Reconnect attempt #${attempt} for socket ${socket.id}`);
  });
});

// ✅ Iniciar servidor
server.listen(3000, '0.0.0.0', () => {
  console.log('🚀 Server running at http://localhost:3000');
});
