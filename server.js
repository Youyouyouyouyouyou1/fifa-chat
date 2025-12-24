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

mongoose.connect(
  'mongodb+srv://ultimatefutservice:7KLKDc0fqYKYAlZc@cluster0.shrqoco.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0',
  { useNewUrlParser:true, useUnifiedTopology:true }
)
.then(()=>console.log('✅ MongoDB connected'))
.catch(err=>console.error(err));

// ===== SCHEMAS =====
const messageSchema = new mongoose.Schema({
  chatId:String,
  author:String,
  text:String,
  time:Date,
});
const Message = mongoose.model('Message', messageSchema);

const chatSchema = new mongoose.Schema({
  chatId:{ type:String, unique:true },
  victorias:{ type:Number, default:0 },
  derrotas:{ type:Number, default:0 }
});
const Chat = mongoose.model('Chat', chatSchema);

app.use(express.static(__dirname + '/public'));

// ===== HISTORIAL CHAT =====
app.get('/chat/:chatId', async (req,res)=>{
  const messages = await Message
    .find({ chatId:req.params.chatId })
    .sort({ time:1 });
  res.json(messages);
});

// ===== ADMIN LIST =====
app.get('/api/admin/chats', async (req,res)=>{
  const chats = await Message.aggregate([
    { $sort:{ time:-1 } },
    {
      $group:{
        _id:'$chatId',
        lastMessage:{ $first:'$text' },
        lastAuthor:{ $first:'$author' },
        lastTime:{ $first:'$time' }
      }
    }
  ]);

  res.json(chats.map(c=>({
    chatId:c._id,
    lastMessage:c.lastMessage,
    lastAuthor:c.lastAuthor,
    lastTime:c.lastTime
  })));
});

// ===== PASSWORDS =====
const passwords = {
  player:'JAHEUhdjjdbc234hd',
  admin:'somoslosputosamos23dhf1A'
};

// ===== SOCKET =====
io.on('connection', socket => {

  socket.on('joinChat', async ({ type,id,password })=>{
    if(!type || !id) return;

    if((type==='player'||type==='admin') && passwords[type]!==password) return;

    socket.userType = type;
    socket.chatId = id;
    socket.join(id);

    let chat = await Chat.findOne({ chatId:id });
    if(!chat){
      chat = await Chat.create({ chatId:id });
    }

    socket.emit('counterInit',{
      victorias:chat.victorias,
      derrotas:chat.derrotas
    });

    socket.emit('joined',{ success:true });
  });

  socket.on('sendMessage', async text=>{
    if(!socket.chatId) return;

    const author =
      socket.userType==='client'?'Client':
      socket.userType==='player'?'Player':'Admin';

    const msg = {
      chatId:socket.chatId,
      author,
      text,
      time:new Date()
    };

    await new Message(msg).save();
    io.to(socket.chatId).emit('receiveMessage', msg);
  });

  socket.on('updateCounter', async ({ field, delta })=>{
    if(socket.userType!=='player') return;
    if(!['victorias','derrotas'].includes(field)) return;

    const chat = await Chat.findOne({ chatId:socket.chatId });
    if(!chat) return;

    chat[field] = Math.max(0, chat[field] + delta);
    await chat.save();

    io.to(socket.chatId).emit('counterUpdate',{
      victorias:chat.victorias,
      derrotas:chat.derrotas
    });
  });

  socket.on('clearChat', async ()=>{
    if(socket.userType!=='admin') return;
    await Message.deleteMany({ chatId:socket.chatId });
    io.to(socket.chatId).emit('chatCleared');
  });
});

server.listen(3000,'0.0.0.0',()=>{
  console.log('🚀 Server running on port 3000');
});

