import { Component, type ReactNode } from 'react';
import { btnPrimary } from './ui';

interface Props {
  title: string;
  body: string;
  reload: string;
  children: ReactNode;
}

/** If a page crashes, show a friendly message instead of a blank screen. Saved progress is not affected. */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('WelcomeRO page error', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-24 max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center">
        <h1 className="text-xl font-bold text-brand-900">{this.props.title}</h1>
        <p className="mt-2 text-muted">{this.props.body}</p>
        <button type="button" className={`${btnPrimary} mt-4`} onClick={() => window.location.reload()}>
          {this.props.reload}
        </button>
      </div>
    );
  }
}
