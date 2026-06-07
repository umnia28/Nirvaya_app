import { io } from "socket.io-client";
import { SOCKET_URL } from "../config";

let socket = null;

export const getSocket = () => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ["websocket"],
    });
  }

  return socket;
};

export const joinTrackingRoom = (publicToken) => {
  const socketInstance = getSocket();
  socketInstance.emit("join_tracking_room", publicToken);
};

export const leaveTrackingRoom = (publicToken) => {
  const socketInstance = getSocket();
  socketInstance.emit("leave_tracking_room", publicToken);
};