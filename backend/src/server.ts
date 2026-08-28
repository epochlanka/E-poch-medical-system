import http from 'http';
import { Server } from 'socket.io';
import app from './app';
import { libreOfficeStatus } from './modules/letters/libreoffice';
import { installProcessErrorHandlers, verifyEmailTransport, emailStatus, logger } from './errors';

// Catch stray promise rejections / uncaught exceptions before anything else starts.
installProcessErrorHandlers();

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

// Setup Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173', // Default Vite port
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Join role-based or specific rooms if needed
  socket.on('join', (room) => {
    socket.join(room);
    console.log(`Socket ${socket.id} joined room ${room}`);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Attach io to app so it can be accessed in controllers
app.set('io', io);

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);

  const mail = emailStatus();
  logger.info(
    { emailConfigured: mail.configured, alertRecipient: mail.to },
    mail.configured
      ? `Error-alert email enabled -> ${mail.to}`
      : 'Error-alert email NOT configured (set SMTP_HOST / SMTP_USER / SMTP_PASS) — errors will be logged only'
  );
  void verifyEmailTransport();

  const lo = libreOfficeStatus();
  if (lo.ok) {
    console.log(`LibreOffice (letter PDF rendering) found at: ${lo.path}`);
  } else {
    console.warn(
      'WARNING: LibreOffice was not found. Letter preview/issue will fail with 503 until ' +
        'LibreOffice is installed or LIBREOFFICE_PATH is set.'
    );
  }
});
