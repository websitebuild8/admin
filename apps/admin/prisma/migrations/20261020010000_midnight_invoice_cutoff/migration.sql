BEGIN;

ALTER TABLE public."DeliveryPartner" ALTER COLUMN "cutoffMinutes" SET DEFAULT 0;

-- Serialize with scheduler/partner edits. Only move the former default; keep
-- custom cutoffs, immutable billing history and unbilled package fees intact.
WITH previous AS MATERIALIZED (
  SELECT id,"cutoffMinutes","nextInvoiceAt"
  FROM public."DeliveryPartner" WHERE "cutoffMinutes"=1080 FOR UPDATE
), updated AS (
  UPDATE public."DeliveryPartner" p SET "cutoffMinutes"=0,
    "nextInvoiceAt"=(date_trunc('day',statement_timestamp() AT TIME ZONE 'Indian/Maldives')
      + interval '1 day') AT TIME ZONE 'Indian/Maldives'
  FROM previous old WHERE p.id=old.id
  RETURNING p.id,p."nextInvoiceAt",old."cutoffMinutes" AS "previousMinutes",
    old."nextInvoiceAt" AS "previousNextInvoiceAt"
)
INSERT INTO public."DeliveryActivity" (id,actor,role,kind,"partnerId","entityId",detail)
SELECT gen_random_uuid(),'system:midnight-invoice-cutoff','SYSTEM','INVOICE_CUTOFF_CHANGED',id,id::text,
  jsonb_build_object('previousMinutes',"previousMinutes",'minutes',0,'timezone','Indian/Maldives',
    'previousNextInvoiceAt',"previousNextInvoiceAt",'nextInvoiceAt',"nextInvoiceAt")
FROM updated;

COMMIT;
