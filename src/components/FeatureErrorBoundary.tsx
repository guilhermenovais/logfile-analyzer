import { Component, type ErrorInfo, type ReactNode } from "react";

interface FeatureErrorBoundaryProps {
  /** Short, human-readable name of the wrapped feature (e.g. "Log viewer"). */
  label: string;
  children: ReactNode;
}

interface FeatureErrorBoundaryState {
  error: Error | null;
}

/**
 * Feature-level error boundary (Principle V): isolates render errors to a
 * single panel (`LogViewer`, `SearchBar`, `HighlightPanel`) so a problem with
 * one feature doesn't crash the rest of the workspace view.
 */
export class FeatureErrorBoundary extends Component<
  FeatureErrorBoundaryProps,
  FeatureErrorBoundaryState
> {
  state: FeatureErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): FeatureErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `Unhandled error in ${this.props.label}:`,
      error,
      info.componentStack,
    );
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 p-4 text-center text-sm">
          <p className="text-destructive">
            {this.props.label} encountered an error: {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="rounded-md border px-3 py-1 text-xs font-medium"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
