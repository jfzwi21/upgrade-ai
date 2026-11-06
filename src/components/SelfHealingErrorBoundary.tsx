import React, { ErrorInfo, ReactNode } from "react";
import ErrorBoundary, {
  ErrorFallbackProps,
  RootErrorFallback,
} from "@/components/ErrorBoundary";

type Props = {
  children: ReactNode;
  onReset?: () => void;
  onError?: (error: Error, info: ErrorInfo) => void;
  fallback?: (props: ErrorFallbackProps) => ReactNode;
};

/**
 * A root-level soft-recovery boundary. Resetting clears the failed React subtree
 * and remounts it in the same native Activity; it never clears app databases.
 */
export default function SelfHealingErrorBoundary({
  children,
  onReset,
  onError,
  fallback = props => <RootErrorFallback {...props} />,
}: Props) {
  return (
    <ErrorBoundary
      name="self-healing-root"
      fallback={fallback}
      onReset={onReset}
      onError={onError}>
      {children}
    </ErrorBoundary>
  );
}
