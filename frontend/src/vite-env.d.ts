/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_GOOGLE_MAPS_API_KEY: string;
  readonly VITE_STRIPE_PUBLIC_KEY: string;
  readonly VITE_WS_URL: string;
  readonly VITE_ENABLE_DEMO_MODE?: string; // 'true' | 'false' - controla visibilidad de credenciales demo
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __DEMO_ENABLED__: boolean;
