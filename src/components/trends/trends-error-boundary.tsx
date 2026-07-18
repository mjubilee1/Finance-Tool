"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  lane: "tech" | "dmv";
  children: ReactNode;
};

type State = {
  error: Error | null;
};

/**
 * Keeps a Trends tab crash from blanking the whole dashboard shell.
 */
export class TrendsErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Trends ${this.props.lane} view crashed:`, error, info.componentStack);
  }

  private retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      const label = this.props.lane === "tech" ? "tech" : "DMV";
      return (
        <div className="app-card p-8 text-center space-y-3">
          <p className="text-slate-700">Couldn&apos;t load {label} trends.</p>
          <p className="text-xs text-slate-500">
            {this.state.error.message || "Something went wrong rendering this view."}
          </p>
          <button type="button" onClick={this.retry} className="app-btn-primary px-4 py-2 text-sm">
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
