import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  props!: ErrorBoundaryProps;
  state!: ErrorBoundaryState;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-red-100 text-red-900 border-4 border-red-500 m-4 shadow-[8px_8px_0px_0px_rgba(220,38,38,1)]">
          <h1 className="text-2xl font-black mb-4 uppercase">App Crashed</h1>
          <p className="font-bold mb-4">Please screenshot this and send it to the developer:</p>
          <pre className="whitespace-pre-wrap font-mono text-sm bg-white p-4 border-2 border-red-200">
            {this.state.error?.stack || this.state.error?.message || 'Unknown Error'}
          </pre>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-6 bg-red-600 text-white px-6 py-3 font-bold uppercase hover:-translate-y-1 transition-transform shadow-[4px_4px_0px_0px_rgba(153,27,27,1)] border-2 border-transparent"
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
