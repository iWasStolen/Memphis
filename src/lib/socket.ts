"use client";

/* ============================================================
   Chat socket singleton + auth state
   ============================================================ */

import { io, Socket } from "socket.io-client";
import { create } from "zustand";
import { getToken, setToken } from "./store";
import { SessionUser } from "./types";

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  if (typeof window === "undefined") return null;
  if (socket && socket.connected) return socket;
  if (socket) return socket;
  const token = getToken();
  socket = io("/?XTransformPort=3003", {
    transports: ["websocket", "polling"],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 1000,
    timeout: 10000,
  });
  return socket;
}

export function destroySocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

interface AuthState {
  user: SessionUser | null;
  ready: boolean;
  setUser: (u: SessionUser | null) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()((set) => ({
  user: null,
  ready: false,
  setUser: (u) => set({ user: u, ready: true }),
  logout: () => {
    setToken(null);
    destroySocket();
    set({ user: null });
  },
}));

/* emit with ack as a promise */
export function emitAck<T>(event: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve) => {
    const s = getSocket();
    if (!s) return resolve({ error: "not connected" } as T);
    const timer = setTimeout(() => resolve({ error: "timeout" } as T), 10000);
    s.emit(event, ...args, (res: T) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}
