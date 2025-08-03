const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

mongoose.connect('mongodb+srv://ultimatefutservice:7KLKDc0fqYKYAlZc@cluster0.shrqoco.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Conectado a MongoDB Atlas'))
.catch(err => console.error('❌ Error al conectar a MongoDB:', err));

const mensajeSchema = new mongoose.Schema({
  chatId: String,
  autor: String,
  texto: String,
  hora: Date,
});
const Mensaje = mongoose.model('Mensaje', mensajeSchema);

app.use(express.static(__dirname + '/public'));

// Obtener historial de mensajes por chatId
app.get('/chat/:chatId', async (req, res) => {
  try {
    const mensajes = await Mensaje.find({ chatId: req.params.chatId }).sort({ hora: 1 });
    res.json(mensajes);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener mensajes' });
  }
});

// API para admin.html
app.get('/api/mensajes', async (req, res) => {
  const chatId = req.query.chatId;
  if (!chatId) return res.status(400).send({ error: 'Falta chatId' });

  try {
    const mensajes = await Mensaje.find({ chatId }).sort({ hora: 1 });
    res.json(mensajes);
  } catch (err) {
    res.status(500).send({ error: 'Error al obtener mensajes' });
  }
});

io.on('connection', (socket) => {
  console.log('🔌 Nuevo cliente conectado:', socket.id);

  let userType = null;
  let chatId = null;

  socket.on('joinChat', ({ type, id }) => {
    console.log(`➡️ Usuario se une: tipo=${type}, chatId=${id}`);
    userType = type;
    chatId = id;
    socket.join(chatId);
  });

  socket.on('sendMessage', async (msg) => {
    console.log(`💬 Mensaje recibido de chatId=${chatId}, tipo=${userType}:`, msg);
    if (!chatId || !userType) return;

    const alias =
      userType === 'cliente' ? 'Cliente A' :
      userType === 'jugador' ? 'Jugador 1' :
      'Admin';

    const message = {
      chatId,
      autor: alias,
      texto: msg,
      hora: new Date(),
    };

    try {
      const nuevoMensaje = new Mensaje(message);
      await nuevoMensaje.save();
      console.log('💾 Mensaje guardado en MongoDB');
    } catch (err) {
      console.error('❌ Error guardando mensaje:', err);
    }

    io.to(chatId).emit('receiveMessage', message);
  });
});

server.listen(3000, '0.0.0.0', () => {
  console.log('🚀 Servidor en http://localhost:3000');
});

