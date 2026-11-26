import { Component, type ErrorInfo, type ReactNode } from 'react';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Doria interface crashed', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-crash-screen" role="alert">
          <section className="app-crash-card">
            <span>DORIA · RECOVERY</span>
            <h1>Something went wrong.</h1>
            <p>The app hit an unexpected error. Reload Doria to try again.</p>
            <button type="button" onClick={() => window.location.reload()}>
              Reload Doria
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
