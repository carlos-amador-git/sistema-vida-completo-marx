// src/hooks/useWebSocket.ts
import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface PanicAlert {
  type: 'PANIC_ALERT';
  alertId: string;
  patientName: string;
  patientId: string;
  location: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
  nearbyHospitals: any[];
  message?: string;
  timestamp: Date;
}

interface QRAccessAlert {
  type: 'QR_ACCESS_ALERT';
  patientName: string;
  patientId: string;
  accessorName: string;
  location: string;
  nearestHospital?: string;
  timestamp: Date;
}

type AlertEvent = PanicAlert | QRAccessAlert;

interface UseWebSocketOptions {
  userId?: string;
  autoConnect?: boolean;
  onPanicAlert?: (alert: PanicAlert) => void;
  onQRAccessAlert?: (alert: QRAccessAlert) => void;
  onPanicCancelled?: (data: { alertId: string }) => void;
}

// Singleton socket instance to prevent multiple connections
let globalSocket: Socket | null = null;
let connectionCount = 0;

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { userId, autoConnect = true, onPanicAlert, onQRAccessAlert, onPanicCancelled } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [lastAlert, setLastAlert] = useState<AlertEvent | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    // Use global socket if already exists
    if (globalSocket?.connected) {
      socketRef.current = globalSocket;
      setIsConnected(true);
      return;
    }

    if (globalSocket && !globalSocket.connected) {
      globalSocket.connect();
      socketRef.current = globalSocket;
      return;
    }

    const wsUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const socket = io(wsUrl, {
      auth: {
        token: localStorage.getItem('accessToken'),
      },
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('WebSocket conectado:', socket.id);
      if (mountedRef.current) {
        setIsConnected(true);
      }
    });

    socket.on('disconnect', () => {
      console.log('WebSocket desconectado');
      if (mountedRef.current) {
        setIsConnected(false);
      }
    });

    socket.on('connect_error', (err) => {
      console.warn('WebSocket error de conexion:', err.message);
      // If the error is auth-related, try to reconnect with a fresh token from localStorage.
      // The token may have been refreshed by the HTTP auth interceptor between attempts.
      const authErrors = ['Authentication required', 'Invalid or expired token', 'Invalid token type'];
      if (authErrors.some((msg) => err.message.includes(msg))) {
        console.warn('WebSocket auth fallida — reintentando con token actualizado');
        // Update auth token for the next reconnection attempt
        socket.auth = { token: localStorage.getItem('accessToken') };
      }
    });

    // Eventos de alerta de panico
    socket.on('panic-alert', (data: PanicAlert) => {
      console.log('Alerta de panico recibida:', data);
      if (mountedRef.current) {
        setLastAlert(data);
        onPanicAlert?.(data);
      }
    });

    socket.on('panic-alert-sent', (data: PanicAlert) => {
      console.log('Alerta de panico enviada:', data);
      if (mountedRef.current) {
        setLastAlert(data);
      }
    });

    socket.on('panic-cancelled', (data: { alertId: string }) => {
      console.log('Alerta de panico cancelada:', data);
      onPanicCancelled?.(data);
    });

    // Eventos de acceso QR
    socket.on('qr-access-alert', (data: QRAccessAlert) => {
      console.log('Alerta de acceso QR recibida:', data);
      if (mountedRef.current) {
        setLastAlert(data);
        onQRAccessAlert?.(data);
      }
    });

    socket.on('qr-access-notification', (data: QRAccessAlert) => {
      console.log('Notificacion de acceso QR:', data);
      if (mountedRef.current) {
        setLastAlert(data);
      }
    });

    globalSocket = socket;
    socketRef.current = socket;
  }, [onPanicAlert, onQRAccessAlert, onPanicCancelled]);

  const disconnect = useCallback(() => {
    connectionCount--;
    // Only disconnect if no more components are using it
    if (connectionCount <= 0 && globalSocket) {
      globalSocket.disconnect();
      globalSocket = null;
      socketRef.current = null;
      setIsConnected(false);
      connectionCount = 0;
    }
  }, []);

  const joinUserRoom = useCallback((roomUserId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('join-user', roomUserId);
      socketRef.current.emit('join-representative', roomUserId);
    }
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    mountedRef.current = true;
    connectionCount++;

    if (autoConnect) {
      connect();
    }

    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [autoConnect]);

  // Join room when userId changes
  useEffect(() => {
    if (userId && isConnected) {
      joinUserRoom(userId);
    }
  }, [userId, isConnected, joinUserRoom]);

  return {
    isConnected,
    lastAlert,
    connect,
    disconnect,
    joinUserRoom,
    socket: socketRef.current,
  };
}

export default useWebSocket;
