import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  /** e.g. `status` when the state reports a failure that should be announced. */
  role?: 'status' | 'alert';
  children?: ReactNode;
}

const EmptyState = ({ title, subtitle, role, children }: EmptyStateProps) => (
  <div className="bookmark-list-empty" role={role}>
    <p className="bookmark-list-empty-title">{title}</p>
    {subtitle && <p className="bookmark-list-empty-subtitle">{subtitle}</p>}
    {children}
  </div>
);

export default EmptyState;
