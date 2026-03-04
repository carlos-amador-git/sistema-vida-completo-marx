// src/common/services/socket-manager.ts
// Singleton para Socket.io — elimina dependencia circular con main.ts
import { Server as SocketIOServer } from 'socket.io';

let _io: SocketIOServer | null = null;

export function setSocketServer(io: SocketIOServer): void {
  _io = io;
}

export function getSocketServer(): SocketIOServer {
  if (!_io) {
    throw new Error('Socket.io server not initialized. Call setSocketServer() first.');
  }
  return _io;
}
