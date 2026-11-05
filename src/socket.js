import { io } from "socket.io-client";

// Set both exported variable and window global variable
export const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:8000' 
  : window.location.origin;

window.API_BASE_URL = API_BASE_URL;

export const SOCKET_URL = API_BASE_URL;

export const socket = io(SOCKET_URL, {
  transports: ["polling", "websocket"],
  reconnectionAttempts: 5,
  reconnectionDelay: 2000,
  timeout: 20000,
});