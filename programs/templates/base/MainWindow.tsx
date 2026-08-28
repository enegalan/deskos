import type { ProgramContext } from '@core/context';

interface MainWindowProps {
  ctx: ProgramContext;
}

export function MainWindow({ ctx: _ctx }: MainWindowProps) {
  return (
    <div style={{ padding: 'var(--space-lg)' }}>
      <h1 style={{ marginBottom: 'var(--space-md)' }}>__PROGRAM_NAME__</h1>
      <p style={{ color: 'var(--color-text-secondary)' }}>
        Welcome to your new program! Edit this file to build something amazing.
      </p>
    </div>
  );
}
