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

/* ================== MODELOS ================== */

const messageSchema = new mongoose.Schema({
  chatId:String,
  author:String,
  text:String,
  time:Date,
});
const Message = mongoose.model('Message', messageSchema);

const counterSchema = new mongoose.Schema({
  chatId: { type:String, unique:true },
  wins: { type:Number, default:0 },
  losses: { type:Number, default:0 }
});
const MatchCounter = mongoose.model('MatchCounter', counterSchema);

app.use(express.static(__dirname + '/public'));

/* ================== HISTORIAL CHAT ================== */
app.get('/chat/:chatId', async (req,res)=>{
  try{
    const messages = await Message.find({ chatId:req.params.chatId }).sort({ time:1 });
    res.json(messages);
  }catch(e){
    res.status(500).json({ error:'Error fetching messages' });
  }
});

/* ================== ADMIN: LISTA DE CHATS ================== */
app.get('/api/admin/chats', async (req,res)=>{
  try{
    const chats = await Message.aggregate([
      { $sort:{ time:-1 } },
      {
        $group:{
          _id:'$chatId',
          lastMessage:{ $first:'$text' },
          lastAuthor:{ $first:'$author' },
          lastTime:{ $first:'$time' }
        }
      },
      { $sort:{ lastTime:-1 } }
    ]);

    res.json(chats.map(c=>({
      chatId:c._id,
      lastMessage:c.lastMessage,
      lastAuthor:c.lastAuthor,
      lastTime:c.lastTime
    })));
  }catch(e){
    res.status(500).json({ error:'Error loading chats' });
  }
});

/* ================== PASSWORDS ================== */
const passwords = {
  player:'JAHEUhdjjdbc234hd',
  admin:'somoslosputosamos23dhf1A'
};

/* ================== SOCKET ================== */
io.on('connection', socket => {

  socket.on('joinChat', async ({ type,id,password })=>{
    if(!type || !id) return socket.emit('errorMsg','Missing data');

    if((type==='player'||type==='admin') && passwords[type]!==password){
      return socket.emit('errorMsg','Incorrect password');
    }

    socket.userType = type;
    socket.chatId = id;
    socket.join(id);

    // crear contador si no existe
    await MatchCounter.findOneAndUpdate(
      { chatId:id },
      { $setOnInsert:{ wins:0, losses:0 } },
      { upsert:true }
    );

    socket.emit('joined',{ success:true });
  });

  socket.on('sendMessage', async text=>{
    if(!socket.chatId || !socket.userType) return;

    const author =
      socket.userType==='client' ? 'Client' :
      socket.userType==='player' ? 'Player' : 'Admin';

    const msg = {
      chatId:socket.chatId,
      author,
      text,
      time:new Date()
    };

    await new Message(msg).save();
    io.to(socket.chatId).emit('receiveMessage', msg);
  });

  /* ===== CONTADOR FUT CHAMPIONS ===== */

  socket.on('getCounter', async ()=>{
    if(!socket.chatId) return;
    const counter = await MatchCounter.findOne({ chatId:socket.chatId });
    socket.emit('counterUpdated', counter);
  });

  socket.on('updateCounter', async ({ wins, losses })=>{
    if(socket.userType !== 'player') return;

    const w = Math.max(0, Math.min(15, wins));
    const l = Math.max(0, Math.min(15, losses));

    const counter = await MatchCounter.findOneAndUpdate(
      { chatId:socket.chatId },
      { wins:w, losses:l },
      { new:true }
    );

    io.to(socket.chatId).emit('counterUpdated', counter);
  });

  /* ===== CLEAR CHAT ===== */
  socket.on('clearChat', async ()=>{
    if(socket.userType!=='admin') return;
    await Message.deleteMany({ chatId:socket.chatId });
    io.to(socket.chatId).emit('chatCleared');
  });
});

server.listen(3000,'0.0.0.0',()=>{
  console.log('🚀 Server running on port 3000');
});
