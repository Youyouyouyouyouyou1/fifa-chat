const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// CONTRASEÑAS
const passwords = {
  admin: 'admin123',
  jugadores: {
    jugador1: 'clave123',
    jugador2: 'clave456',
    // agrega más jugadores aquí si querés
  }
};

// Conecta a MongoDB Atlas
mongoose.connect('mongodb+srv://ultimatefutservice:7KLKDc0fqYKYAlZc@cluster0.shrqoco.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Conectado a MongoDB Atlas'))
.catch(err => console.error('❌ Error al conectar a MongoDB:', err));

// Modelo de mensajes
const mensajeSchema = new mongoose.Schema({
  chatId: String,
  autor: String,
  texto: String,
  hora: Date,
});
const Mensaje = mongoose.model('Mensaje', mensajeSchema);

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Ruta para obtener mensajes por chatId (admin)
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

// Ruta para historial de mensajes para el público
app.get('/chat/:chatId', async (req, res) => {
  try {
    const mensajes = await Mensaje.find({ chatId: req.params.chatId }).sort({ hora: 1 });
    res.json(mensajes);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener mensajes' });
  }
});

io.on('connection', (socket) => {
  let userType = null;
  let chatId = null;

  socket.on('joinChat', ({ type, id, user, password }) => {
    // Autenticación
    if (type === 'admin' && password !== passwords.admin) {
      socket.emit('authError', 'Contraseña incorrecta para administrador');
      return;
    }

    if (type === 'jugador') {
      const claveCorrecta = passwords.jugadores[user];
      if (!claveCorrecta || claveCorrecta !== password) {
        socket.emit('authError', 'Contraseña incorrecta para jugador');
        return;
      }
    }

    userType = type;
    chatId = id;
    socket.join(chatId);
  });

  socket.on('sendMessage', async (msg) => {
    if (!chatId || !userType) return;

    const alias =
      userType === 'cliente' ? 'Cliente A' :
      userType === 'jugador' ? 'Jugador 1' : // si querés usar más nombres, adaptá aquí
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
    } catch (err) {
      console.error('❌ Error guardando mensaje:', err);
    }

    io.to(chatId).emit('receiveMessage', message);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
