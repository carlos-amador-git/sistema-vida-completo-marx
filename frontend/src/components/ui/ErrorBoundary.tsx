// src/components/ui/ErrorBoundary.tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// ─── ErrorFallback ────────────────────────────────────────────────────────────

interface ErrorFallbackProps {
  /** The caught error — pass null/undefined to show a generic message */
  error?: Error | null;
  /** Callback to reset error state / trigger a retry */
  onRetry?: () => void;
  /** Override the default title */
  title?: string;
  /** Override the default description */
  description?: string;
}

/**
 * Standalone functional component for rendering an error message.
 * Can be used with react-error-boundary's `fallbackRender` prop or on its own.
 */
export function ErrorFallback({
  error,
  onRetry,
  title = 'Algo salió mal',
  description = 'Ocurrió un error inesperado. Por favor intenta de nuevo.',
}: ErrorFallbackProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-16 px-6 text-center"
      role="alert"
      aria-live="assertive"
    >
      <div className="mb-4 flex items-center justify-center w-16 h-16 rounded-full bg-red-100">
        <AlertTriangle className="w-8 h-8 text-red-500" aria-hidden="true" />
      </div>

      <h3 className="text-lg font-medium text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 max-w-sm mb-6">{description}</p>

      {error?.message && (
        <p className="text-xs text-red-400 font-mono bg-red-50 rounded-lg px-3 py-2 mb-6 max-w-sm break-words">
          {error.message}
        </p>
      )}

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn-secondary inline-flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Reintentar
        </button>
      )}
    </div>
  );
}

// ─── ErrorBoundary (class component) ─────────────────────────────────────────

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback node — completely replaces default ErrorFallback */
  fallback?: ReactNode;
  /** Optional title override forwarded to ErrorFallback */
  title?: string;
  /** Optional description override forwarded to ErrorFallback */
  description?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Class-based error boundary.
 * Catches errors in its subtree and renders a friendly error UI with a retry button.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomeComponent />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={this.handleRetry}
          title={this.props.title}
          description={this.props.description}
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
