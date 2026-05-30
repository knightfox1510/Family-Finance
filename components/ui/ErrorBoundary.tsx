// components/ui/ErrorBoundary.tsx
// Top-level React error boundary.
// Catches any unhandled error in its subtree and shows a recovery screen
// instead of a white blank page.
//
// Usage (in app/page.tsx):
//   <ErrorBoundary>
//     <App />
//   </ErrorBoundary>

'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
  /** Optional custom fallback. Receives the error and a reset function. */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to console in dev; swap for Sentry/LogRocket here in prod
    console.error('[ErrorBoundary] Caught error:', error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;

    if (error) {
      if (this.props.fallback) {
        return this.props.fallback(error, this.reset);
      }
      return <DefaultFallback error={error} reset={this.reset} />;
    }

    return this.props.children;
  }
}

// ── Default fallback UI ───────────────────────────────────────────────────────

function DefaultFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{
      minHeight:       '100vh',
      background:      '#0b0f1a',
      display:         'flex',
      flexDirection:   'column',
      alignItems:      'center',
      justifyContent:  'center',
      padding:         '24px',
      fontFamily:      "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      textAlign:       'center',
      gap:             20,
    }}>
      {/* Icon */}
      <div style={{
        width:          64,
        height:         64,
        borderRadius:   '50%',
        background:     'rgba(239,68,68,0.15)',
        border:         '1.5px solid rgba(239,68,68,0.35)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        fontSize:       28,
      }}>
        ⚠️
      </div>

      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#e8eaf0', marginBottom: 8, letterSpacing: '-0.02em' }}>
          Something went wrong
        </div>
        <div style={{ fontSize: 13, color: '#9ba3b8', lineHeight: 1.6, maxWidth: 320 }}>
          The app hit an unexpected error. Your data is safe — tap Retry to reload.
        </div>
      </div>

      {/* Error message — shown in dev only */}
      {process.env.NODE_ENV === 'development' && (
        <div style={{
          background:   'rgba(239,68,68,0.08)',
          border:       '1px solid rgba(239,68,68,0.25)',
          borderRadius: 10,
          padding:      '10px 14px',
          fontSize:     11,
          color:        '#ef4444',
          maxWidth:     400,
          textAlign:    'left',
          fontFamily:   'monospace',
          wordBreak:    'break-word',
        }}>
          {error.message}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={reset}
          style={{
            background:   '#f0b429',
            color:        '#0a0a0a',
            border:       'none',
            borderRadius: 99,
            padding:      '12px 28px',
            fontSize:     14,
            fontWeight:   800,
            cursor:       'pointer',
            fontFamily:   'inherit',
          }}
        >
          Retry
        </button>
        <button
          onClick={() => window.location.reload()}
          style={{
            background:   'transparent',
            color:        '#9ba3b8',
            border:       '1px solid rgba(255,255,255,0.12)',
            borderRadius: 99,
            padding:      '12px 24px',
            fontSize:     14,
            fontWeight:   600,
            cursor:       'pointer',
            fontFamily:   'inherit',
          }}
        >
          Full reload
        </button>
      </div>
    </div>
  );
}
