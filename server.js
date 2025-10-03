const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Conecta a MongoDB Atlas (pon tu URI aquí)
mongoose.connect('mongodb+srv://ultimatefutservice:7KLKDc0fqYKYAlZc@cluster0.shrqoco.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Conectado a MongoDB Atlas'))
.catch(err => console.error('❌ Error al conectar a MongoDB:', err));

// Esquema y modelo de mensajes
const mensajeSchema = new mongoose.Schema({
  chatId: String,
  autor: String,
  texto: String,
  hora: Date,
});
const Mensaje = mongoose.model('Mensaje', mensajeSchema);

app.use(express.static(__dirname + '/public'));

// Endpoint para obtener historial de chat (ruta antigua)
app.get('/chat/:chatId', async (req, res) => {
  try {
    const mensajes = await Mensaje.find({ chatId: req.params.chatId }).sort({ hora: 1 });
    res.json(mensajes);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener mensajes' });
  }
});

// Nueva ruta para admin.html: Obtener mensajes en formato JSON mediante query ?chatId=
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

// Contraseñas para roles que las requieren
const passwords = {
  jugador: 'JAHEUhdjjdbc234hd',
  admin: 'somoslosputosamos23dhf1A',
};

io.on('connection', (socket) => {
  console.log('🔌 Cliente conectado:', socket.id);

  let userType = null;
  let chatId = null;

  socket.on('joinChat', ({ type, id, password }) => {
    if (!type || !id) {
      socket.emit('errorMsg', 'Falta tipo de usuario o chatId');
      return;
    }

    // Validar contraseña para jugador y admin
    if ((type === 'jugador' || type === 'admin') && passwords[type] !== password) {
      socket.emit('errorMsg', 'Contraseña incorrecta');
      return;
    }

    userType = type;
    chatId = id;
    socket.join(chatId);

    console.log(➡ Usuario se une: tipo=${userType}, chatId=${chatId});
    socket.emit('joined', { success: true });
  });

  socket.on('sendMessage', async (msg) => {
    if (!chatId || !userType) return;

    const alias =
      userType === 'cliente' ? 'Cliente' :
      userType === 'jugador' ? 'Jugador' :
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

  socket.on('disconnect', () => {
    console.log('❌ Cliente desconectado:', socket.id);
  });
});

server.listen(3000, '0.0.0.0', () => {
  console.log('🚀 Servidor en http://localhost:3000');
});
