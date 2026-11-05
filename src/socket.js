import { io } from "socket.io-client";

export const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:8000' 
  : window.location.origin;

export const SOCKET_URL = API_BASE_URL;

// Set both on window for legacy component references
window.API_BASE_URL = API_BASE_URL;
window.SOCKET_URL = SOCKET_URL;

export const socket = io(SOCKET_URL, {
  transports: ["polling", "websocket"],
  reconnectionAttempts: 5,
  reconnectionDelay: 2000,
  timeout: 20000,
});