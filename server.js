const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  transports: ['websocket', 'polling'],
  pingInterval: 20000,
  pingTimeout: 60000,
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

/* =======================
   MongoDB
======================= */
mongoose.connect(
  'mongodb+srv://ultimatefutservice:7KLKDc0fqYKYAlZc@cluster0.shrqoco.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0',
  { useNewUrlParser: true, useUnifiedTopology: true }
)
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error('❌ Mongo error:', err));

const messageSchema = new mongoose.Schema({
  chatId: String,
  author: String,
  text: String,
  time: Date,
});
const Message = mongoose.model('Message', messageSchema);

app.use(express.static(__dirname + '/public'));

/* =======================
   HTTP ROUTES
======================= */

// historial normal
app.get('/chat/:chatId', async (req, res) => {
  try {
    const messages = await Message.find({ chatId: req.params.chatId }).sort({ time: 1 });
    res.json(messages);
  } catch {
    res.status(500).json({ error: 'Error fetching messages' });
  }
});

// lista de chats (ADMIN)
app.get('/api/admin/chats', async (req, res) => {
  try {
    const chats = await Message.aggregate([
      { $group: { _id: "$chatId", lastMessage: { $max: "$time" } } },
      { $sort: { lastMessage: -1 } }
    ]);
    res.json(chats.map(c => c._id));
  } catch {
    res.status(500).json({ error: 'Error loading chats' });
  }
});

/* =======================
   AUTH
======================= */
const passwords = {
  player: 'JAHEUhdjjdbc234hd',
  admin: 'somoslosputosamos23dhf1A',
};

/* =======================
   SOCKET.IO
======================= */
io.on('connection', (socket) => {
  console.log('🔌 Connected:', socket.id);

  socket.on('joinChat', ({ type, id, password }) => {
    if (!type) {
      socket.emit('errorMsg', 'Missing user type');
      return;
    }

    if ((type === 'player' || type === 'admin') && passwords[type] !== password) {
      socket.emit('errorMsg', 'Incorrect password');
      return;
    }

    // admin SIN chat → solo panel
    if (type === 'admin' && !id) {
      socket.userType = 'admin';
      socket.chatId = null;
      socket.emit('joined', { success: true, adminPanel: true });
      return;
    }

    if (!id) {
      socket.emit('errorMsg', 'Missing chatId');
      return;
    }

    socket.userType = type;
    socket.chatId = id;
    socket.join(id);

    console.log(`➡ ${type} joined chat ${id}`);
    socket.emit('joined', { success: true });
  });

  socket.on('sendMessage', async (text) => {
    if (!socket.chatId || !socket.userType) return;

    const author =
      socket.userType === 'client' ? 'Client' :
      socket.userType === 'player' ? 'Player' :
      'Admin';

    const message = {
      chatId: socket.chatId,
      author,
      text,
      time: new Date(),
    };

    try {
      await new Message(message).save();
      io.to(socket.chatId).emit('receiveMessage', message);
    } catch (e) {
      console.error('❌ Save message error', e);
    }
  });

  socket.on('clearChat', async () => {
    if (socket.userType !== 'admin' || !socket.chatId) return;
    await Message.deleteMany({ chatId: socket.chatId });
    io.to(socket.chatId).emit('chatCleared');
  });

  socket.on('disconnect', () => {
    console.log('❌ Disconnected:', socket.id);
  });
});

server.listen(3000, '0.0.0.0', () => {
  console.log('🚀 Server running on port 3000');
});
