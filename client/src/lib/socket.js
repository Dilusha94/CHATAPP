import { io } from 'socket.io-client';

export const socket = io(import.meta.env.VITE_SERVER_URL || 'http://localhost:3000', {
  transports: ['websocket', 'polling'],
  autoConnect: false,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

/** emit with acknowledgement as a promise (8s timeout) */
export const call = (event, payload) =>
  new Promise(resolve => {
    socket.timeout(8000).emit(event, payload, (err, res) => resolve(err ? { ok: false, error: 'Connection problem, try again' } : res));
  });

export function getDeviceId() {
  let id = localStorage.getItem('deviceId');
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    localStorage.setItem('deviceId', id);
  }
  return id;
}

export const session = {
  get: () => { try { return JSON.parse(localStorage.getItem('session')); } catch { return null; } },
  set: s => localStorage.setItem('session', JSON.stringify(s)),
  clear: () => localStorage.removeItem('session'),
};
