export function FieldError({ errors }: { errors?: string[] }) {
  if (!errors || errors.length === 0) return null;
  return (
    <p className="text-sm text-destructive" role="alert">
      {errors[0]}
    </p>
  );
}
