BEGIN;

-- Clearing a personal inbox must preserve invoice dispatches and their send-once
-- keys, timestamps, actors and append-only financial events.
ALTER TABLE public."DeliveryInvoiceDispatch"
  ALTER COLUMN "notificationId" DROP NOT NULL,
  DROP CONSTRAINT "DeliveryInvoiceDispatch_notificationId_fkey",
  ADD CONSTRAINT "DeliveryInvoiceDispatch_notificationId_fkey"
    FOREIGN KEY ("notificationId") REFERENCES public."DeliveryNotification"(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE public."DeliveryPaidInvoiceDispatch"
  ALTER COLUMN "notificationId" DROP NOT NULL,
  DROP CONSTRAINT "DeliveryPaidInvoiceDispatch_notificationId_fkey",
  ADD CONSTRAINT "DeliveryPaidInvoiceDispatch_notificationId_fkey"
    FOREIGN KEY ("notificationId") REFERENCES public."DeliveryNotification"(id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION public.igo_notification_dispatch_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  -- Only the FK cleanup after a notification disappears can detach the pointer.
  -- Direct detaches while its message still exists, edits and reattachment fail.
  IF TG_OP='UPDATE' AND OLD."notificationId" IS NOT NULL AND NEW."notificationId" IS NULL
     AND (to_jsonb(NEW)-'notificationId')=(to_jsonb(OLD)-'notificationId')
     AND NOT EXISTS (SELECT 1 FROM public."DeliveryNotification" WHERE id=OLD."notificationId")
  THEN RETURN NEW; END IF;
  IF TG_OP='DELETE' AND public.igo_deletion_allows(TG_TABLE_NAME,to_jsonb(OLD)) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Invoice dispatch history is append-only';
END $$;
REVOKE ALL ON FUNCTION public.igo_notification_dispatch_immutable() FROM PUBLIC,anon,authenticated;
DROP TRIGGER delivery_invoice_dispatch_immutable ON public."DeliveryInvoiceDispatch";
CREATE TRIGGER delivery_invoice_dispatch_immutable BEFORE UPDATE OR DELETE ON public."DeliveryInvoiceDispatch"
  FOR EACH ROW EXECUTE FUNCTION public.igo_notification_dispatch_immutable();
DROP TRIGGER delivery_paid_dispatch_immutable ON public."DeliveryPaidInvoiceDispatch";
CREATE TRIGGER delivery_paid_dispatch_immutable BEFORE UPDATE OR DELETE ON public."DeliveryPaidInvoiceDispatch"
  FOR EACH ROW EXECUTE FUNCTION public.igo_notification_dispatch_immutable();

COMMIT;
