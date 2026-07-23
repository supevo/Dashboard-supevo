/**
 * Standard result shape for form-driven server actions consumed by
 * `useActionState`. Keeps success/error handling uniform across features.
 */
export type ActionResult =
  | { status: 'idle' }
  | { status: 'success'; message?: string; data?: Record<string, unknown> }
  | {
      status: 'error';
      message: string;
      fieldErrors?: Record<string, string[]>;
    };

export const idleResult: ActionResult = { status: 'idle' };

export function errorResult(
  message: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult {
  return { status: 'error', message, fieldErrors };
}

export function successResult(
  message?: string,
  data?: Record<string, unknown>,
): ActionResult {
  return { status: 'success', message, data };
}
