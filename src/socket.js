import { io } from "socket.io-client";

// Dynamically use current origin for API and socket, falling back correctly
export const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:8000' 
  : window.location.origin;

export const SOCKET_URL = API_BASE_URL;

export const socket = io(SOCKET_URL, {
  transports: ["polling", "websocket"],
  reconnectionAttempts: 5,
  reconnectionDelay: 2000,
  timeout: 20000,
});