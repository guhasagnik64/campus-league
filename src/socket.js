import { io } from "socket.io-client";

export const SOCKET_URL =
  import.meta.env.VITE_API_BASE_URL || "https://campus-league-7sf1.onrender.com";

export const socket = io(SOCKET_URL, {
  transports: ["polling", "websocket"],
  reconnectionAttempts: 5,
  reconnectionDelay: 2000,
  timeout: 20000,
});