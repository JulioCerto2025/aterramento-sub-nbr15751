import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-lg shadow-xl max-w-2xl w-full border-l-4 border-red-500">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
              <h1 className="text-2xl font-bold text-gray-900">Algo deu errado</h1>
            </div>
            
            <p className="text-gray-600 mb-6">
              Ocorreu um erro inesperado na aplicação. Tente recarregar a página.
            </p>

            {this.state.error && (
              <div className="bg-gray-100 p-4 rounded overflow-auto max-h-60 text-sm font-mono text-red-800 mb-4">
                <strong>{this.state.error.toString()}</strong>
              </div>
            )}
            
            {this.state.errorInfo && (
              <details className="text-xs text-gray-500">
                <summary className="cursor-pointer hover:text-gray-700 mb-2">Ver detalhes da stack trace</summary>
                <pre className="whitespace-pre-wrap overflow-auto max-h-60 p-2 bg-gray-50 rounded">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}

            <button 
              onClick={() => window.location.reload()}
              className="mt-6 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-semibold"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
