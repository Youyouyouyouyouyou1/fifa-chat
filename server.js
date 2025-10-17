const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);

// Socket.IO options to improve mobile reliability
const io = socketIo(server, {
  transports: ['websocket', 'polling'],
  // tune ping/pong to be more tolerant with slow mobile networks
  pingInterval: 20000,
  pingTimeout: 60000,
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Connect to MongoDB Atlas (put your URI here)
mongoose.connect('mongodb+srv://ultimatefutservice:7KLKDc0fqYKYAlZc@cluster0.shrqoco.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB Atlas'))
.catch(err => console.error('❌ Error connecting to MongoDB:', err));

// Schema and model for messages
const messageSchema = new mongoose.Schema({
  chatId: String,
  author: String,
  text: String,
  time: Date,
});
const Message = mongoose.model('Message', messageSchema);

app.use(express.static(__dirname + '/public'));

// Old route to get chat history
app.get('/chat/:chatId', async (req, res) => {
  try {
    const messages = await Message.find({ chatId: req.params.chatId }).sort({ time: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching messages' });
  }
});

// New route for admin.html: get messages in JSON format with ?chatId=
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

// Passwords for roles that require them
const passwords = {
  player: 'JAHEUhdjjdbc234hd',
  admin: 'somoslosputosamos23dhf1A',
};

io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  let userType = null;
  let chatId = null;

  socket.on('joinChat', ({ type, id, password }) => {
    if (!type || !id) {
      socket.emit('errorMsg', 'Missing user type or chatId');
      return;
    }

    // Validate password for player and admin
    if ((type === 'player' || type === 'admin') && passwords[type] !== password) {
      socket.emit('errorMsg', 'Incorrect password');
      return;
    }

    userType = type;
    chatId = id;
    socket.join(chatId);

    console.log(`➡ User joined: type=${userType}, chatId=${chatId}`);
    socket.emit('joined', { success: true });
  });

  socket.on('sendMessage', async (msg) => {
    if (!chatId || !userType) return;

    const alias =
      userType === 'client' ? 'Client' :
      userType === 'player' ? 'Player' :
      'Admin';

    const message = {
      chatId,
      author: alias,
      text: msg,
      time: new Date(),
    };

    try {
      const newMessage = new Message(message);
      await newMessage.save();
      console.log('💾 Message saved in MongoDB');
    } catch (err) {
      console.error('❌ Error saving message:', err);
    }

    io.to(chatId).emit('receiveMessage', message);
  });

  socket.on('disconnect', (reason) => {
    console.log('❌ Client disconnected:', socket.id, 'reason:', reason);
  });

  socket.on('reconnect_attempt', (attempt) => {
    console.log(`🔁 Reconnect attempt #${attempt} for socket ${socket.id}`);
  });
});

server.listen(3000, '0.0.0.0', () => {
  console.log('🚀 Server running at http://localhost:3000');
});
