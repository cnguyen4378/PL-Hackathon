import { io } from 'socket.io-client';

// Single shared socket. Server defaults to :3001 (see server/config.js);
// override with VITE_SOCKET_URL in a .env file when deployed.
export const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001', {
  autoConnect: true,
  transports: ['websocket', 'polling'],
});

/** Emit with ack, rejecting on { ok:false } so callers can try/catch. */
export function emitAck(event, payload) {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (res) => {
      if (!res?.ok) reject(new Error(res?.error || 'Request failed'));
      else resolve(res);
    });
  });
}
