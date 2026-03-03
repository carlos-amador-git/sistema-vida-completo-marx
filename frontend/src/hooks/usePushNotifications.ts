// src/hooks/usePushNotifications.ts
import { useState, useEffect, useCallback, useRef } from 'react';

export interface VidaNotification {
  id: string;
  type: 'PANIC_ALERT' | 'QR_ACCESS' | 'SYSTEM' | 'REPRESENTATIVE' | 'DOCUMENT';
  title: string;
  body: string;
  data?: Record<string, any>;
  read: boolean;
  createdAt: Date;
}

interface NotificationState {
  permission: NotificationPermission;
  supported: boolean;
  serviceWorkerReady: boolean;
  notifications: VidaNotification[];
  unreadCount: number;
}

interface UsePushNotificationsReturn extends NotificationState {
  requestPermission: () => Promise<NotificationPermission>;
  showNotification: (title: string, options?: NotificationOptions & { type?: string; data?: Record<string, any> }) => void;
  addNotification: (notification: Omit<VidaNotification, 'id' | 'read' | 'createdAt'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotification: (id: string) => void;
  clearAllNotifications: () => void;
}

const STORAGE_KEY = 'vida_notifications';
const MAX_NOTIFICATIONS = 20;
const NOTIFICATION_TTL_MS = 60 * 60 * 1000; // 1 hour

// Generar ID único
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Cargar notificaciones del sessionStorage (con TTL filter)
const loadNotifications = (): VidaNotification[] => {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const now = Date.now();
      return parsed
        .map((n: { id: string; type: string; title: string; body: string; data?: Record<string, unknown>; read: boolean; createdAt: string }) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          data: n.data,
          read: n.read,
          createdAt: new Date(n.createdAt),
        }))
        .filter((n: VidaNotification) => now - n.createdAt.getTime() < NOTIFICATION_TTL_MS);
    }
  } catch (e) {
    console.error('Error loading notifications:', e);
  }
  return [];
};

// Guardar notificaciones en sessionStorage
const saveNotifications = (notifications: VidaNotification[]) => {
  try {
    const now = Date.now();
    const toSave = notifications
      .filter(n => now - n.createdAt.getTime() < NOTIFICATION_TTL_MS)
      .slice(0, MAX_NOTIFICATIONS);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.error('Error saving notifications:', e);
  }
};

export function usePushNotifications(): UsePushNotificationsReturn {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [supported, setSupported] = useState(false);
  const [serviceWorkerReady, setServiceWorkerReady] = useState(false);
  const [notifications, setNotifications] = useState<VidaNotification[]>([]);
  const swRegistration = useRef<ServiceWorkerRegistration | null>(null);

  // Inicialización
  useEffect(() => {
    // Verificar soporte de notificaciones
    const isSupported = 'Notification' in window && 'serviceWorker' in navigator;
    setSupported(isSupported);

    if (isSupported) {
      setPermission(Notification.permission);
    }

    // Cargar notificaciones guardadas
    setNotifications(loadNotifications());

    // Registrar Service Worker
    if ('serviceWorker' in navigator) {
      registerServiceWorker();
    }

    // Escuchar mensajes del Service Worker
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    }

    return () => {
      if (navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      }
    };
  }, []);

  // Guardar notificaciones cuando cambien
  useEffect(() => {
    saveNotifications(notifications);
  }, [notifications]);

  const registerServiceWorker = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js', {
        scope: '/'
      });

      swRegistration.current = registration;
      console.log('Service Worker registrado:', registration.scope);

      // Esperar a que esté activo
      if (registration.active) {
        setServiceWorkerReady(true);
      } else {
        registration.addEventListener('activate', () => {
          setServiceWorkerReady(true);
        });
      }

      // Manejar actualizaciones
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('Nueva versión disponible del Service Worker');
            }
          });
        }
      });
    } catch (error) {
      console.error('Error registrando Service Worker:', error);
    }
  };

  const handleServiceWorkerMessage = (event: MessageEvent) => {
    const { type, data } = event.data;

    if (type === 'NOTIFICATION_CLICKED') {
      // Marcar como leída la notificación clickeada
      if (data?.notificationId) {
        markAsRead(data.notificationId);
      }
    }

    if (type === 'NOTIFICATION_CLOSED') {
      // Manejar cierre de notificación si es necesario
      console.log('Notificación cerrada:', data);
    }
  };

  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (!supported) {
      console.warn('Notificaciones no soportadas en este navegador');
      return 'denied';
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === 'granted') {
        console.log('Permisos de notificación concedidos');
      }

      return result;
    } catch (error) {
      console.error('Error solicitando permisos:', error);
      return 'denied';
    }
  }, [supported]);

  const showNotification = useCallback((
    title: string,
    options?: NotificationOptions & { type?: string; data?: Record<string, any> }
  ) => {
    if (permission !== 'granted') {
      console.warn('No hay permiso para mostrar notificaciones');
      return;
    }

    const notificationOptions: NotificationOptions = {
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: options?.tag || `vida-${Date.now()}`,
      requireInteraction: options?.type === 'PANIC_ALERT',
      ...options,
      data: {
        ...options?.data,
        type: options?.type,
        notificationId: generateId(),
        timestamp: Date.now()
      }
    };

    // Intentar mostrar via Service Worker primero (funciona en background)
    if (swRegistration.current?.active) {
      swRegistration.current.active.postMessage({
        type: 'SHOW_NOTIFICATION',
        title,
        options: notificationOptions
      });
    } else if (Notification.permission === 'granted') {
      // Fallback a notificación directa
      new Notification(title, notificationOptions);
    }

    // Agregar a lista interna
    addNotification({
      type: (options?.type as VidaNotification['type']) || 'SYSTEM',
      title,
      body: options?.body || '',
      data: options?.data
    });
  }, [permission]);

  const addNotification = useCallback((
    notification: Omit<VidaNotification, 'id' | 'read' | 'createdAt'>
  ) => {
    const newNotification: VidaNotification = {
      ...notification,
      id: generateId(),
      read: false,
      createdAt: new Date()
    };

    setNotifications(prev => [newNotification, ...prev]);
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev =>
      prev.map(n => ({ ...n, read: true }))
    );
  }, []);

  const clearNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return {
    permission,
    supported,
    serviceWorkerReady,
    notifications,
    unreadCount,
    requestPermission,
    showNotification,
    addNotification,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAllNotifications
  };
}

export default usePushNotifications;
