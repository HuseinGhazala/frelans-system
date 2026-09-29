export function FormMessage({ state }: { state?: { error?: string; success?: string } | null }) {
  if (!state?.error && !state?.success) return null;
  return (
    <p role="status" className={state.error ? "rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" : "rounded-lg bg-success-soft px-3 py-2 text-sm text-success"}>
      {state.error ?? state.success}
    </p>
  );
}
