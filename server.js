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
  cors: { origin: '*', methods: ['GET','POST'] }
});

/* =======================
   DATABASE
======================= */

mongoose.connect(
  'mongodb+srv://ultimatefutservice:7KLKDc0fqYKYAlZc@cluster0.shrqoco.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0',
  { useNewUrlParser:true, useUnifiedTopology:true }
)
.then(()=>console.log('✅ MongoDB connected'))
.catch(err=>console.error(err));

const messageSchema = new mongoose.Schema({
  chatId: String,
  author: String,
  text: String,
  time: Date,
  readByAdmin: { type:Boolean, default:false }
});

const Message = mongoose.model('Message', messageSchema);

app.use(express.static(__dirname + '/public'));

/* =======================
   ROUTES
======================= */

app.get('/chat/:chatId', async (req,res)=>{
  const msgs = await Message.find({ chatId:req.params.chatId }).sort({ time:1 });
  res.json(msgs);
});

/* =======================
   AUTH
======================= */

const passwords = {
  player: 'JAHEUhdjjdbc234hd',
  admin: 'somoslosputosamos23dhf1A'
};

/* =======================
   SOCKET.IO
======================= */

io.on('connection', socket => {

  console.log('🔌 Connected:', socket.id);

  /* ===== ADMIN LOGIN ===== */
  socket.on('adminLogin', async ({ password }) => {
    if (password !== passwords.admin) {
      socket.emit('errorMsg','Wrong admin password');
      return;
    }

    socket.userType = 'admin';

    const chats = await Message.aggregate([
      { $sort: { time:-1 } },
      { $group: {
        _id:'$chatId',
        lastText:{ $first:'$text' },
        time:{ $first:'$time' },
        unread:{ $sum:{ $cond:[ { $eq:['$readByAdmin',false] },1,0 ] } }
      }},
      { $sort:{ time:-1 } }
    ]);

    socket.emit('adminChats', chats.map(c=>({
      chatId:c._id,
      lastText:c.lastText,
      time:new Date(c.time).toLocaleString(),
      unread:c.unread
    })));
  });

  /* ===== JOIN CHAT ===== */
  socket.on('joinChat', ({ type, id, password }) => {

    if (type !== 'client' && type !== 'player' && type !== 'admin') return;

    if ((type === 'player' || type === 'admin') && passwords[type] !== password) {
      socket.emit('errorMsg','Incorrect password');
      return;
    }

    socket.userType = type;
    socket.chatId = id;

    socket.join(id);
    socket.emit('joined', { success:true });

    if (type === 'admin') {
      Message.updateMany(
        { chatId:id },
        { $set:{ readByAdmin:true } }
      ).exec();
    }

    console.log(`➡ ${type} joined chat ${id}`);
  });

  /* ===== SEND MESSAGE ===== */
  socket.on('sendMessage', async text => {
    if (!socket.chatId) return;

    const author =
      socket.userType === 'client' ? 'Client' :
      socket.userType === 'player' ? 'Player' :
      'Admin';

    const msg = new Message({
      chatId: socket.chatId,
      author,
      text,
      time: new Date(),
      readByAdmin: socket.userType === 'admin'
    });

    await msg.save();

    io.to(socket.chatId).emit('receiveMessage', msg);
  });

  /* ===== CLEAR CHAT ===== */
  socket.on('clearChat', async () => {
    if (socket.userType !== 'admin') return;
    await Message.deleteMany({ chatId:socket.chatId });
    io.to(socket.chatId).emit('chatCleared');
    console.log(`🗑 Chat ${socket.chatId} cleared`);
  });

  socket.on('disconnect', reason => {
    console.log('❌ Disconnected:', socket.id, reason);
  });
});

/* =======================
   START
======================= */

server.listen(3000,'0.0.0.0',()=>{
  console.log('🚀 Server running on port 3000');
});
