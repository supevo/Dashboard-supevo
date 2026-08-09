'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { uploadReceiptAction } from '@/features/accounting/receipt-upload-actions';
import { idleResult } from '@/lib/action-result';
import { DropZone } from '@/components/ui/drop-zone';
import { Alert } from '@/components/ui/alert';

/**
 * Beleg-Dropzone: drag a file (or click) to upload it into the company's
 * OneDrive folder; the KI reads it right away. Mirrors Buchfink's drop area.
 */
export function ReceiptDropzone({ billingEntityId }: { billingEntityId: string }) {
  const [state, formAction, pending] = useActionState(
    uploadReceiptAction,
    idleResult,
  );
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'success') {
      router.refresh();
      formRef.current?.reset();
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={formAction}>
      <input type="hidden" name="billingEntityId" value={billingEntityId} />
      <input type="hidden" name="kind" value="ausgabe" />
      <DropZone overlayLabel="Beleg hier ablegen">
        <label
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center hover:bg-muted/40 ${
            pending ? 'opacity-60' : ''
          }`}
        >
          <span className="text-sm font-medium">
            {pending ? 'Lade hoch …' : 'Beleg hierher ziehen oder klicken'}
          </span>
          <span className="mt-1 text-xs text-muted-foreground">
            JPG, PNG oder PDF · wird in OneDrive abgelegt und von der KI gelesen.
          </span>
          <input
            type="file"
            name="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf"
            className="hidden"
            disabled={pending}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                formRef.current?.requestSubmit();
              }
            }}
          />
        </label>
      </DropZone>
      {state.status === 'error' && (
        <Alert variant="destructive" className="mt-2">
          {state.message}
        </Alert>
      )}
      {state.status === 'success' && (
        <Alert className="mt-2">{state.message}</Alert>
      )}
    </form>
  );
}
