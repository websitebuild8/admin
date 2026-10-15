-- Supabase default privileges may grant EXECUTE directly to anon/authenticated.
-- Revoking PUBLIC alone does not remove those direct grants.
DO $$ DECLARE client_role text; fn record; seq text;
BEGIN
 FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
   FOR fn IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('igo_invoice_due','igo_parcel_guard','igo_append_only','igo_invoice_line_guard','igo_payment_guard','igo_allocation_guard','igo_invoice_reconcile','igo_payment_reconcile','igo_cash_reconcile','igo_invoice_header_guard') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',fn.signature,client_role);
   END LOOP;
   FOREACH seq IN ARRAY ARRAY['igo_delivery_parcel_number','igo_delivery_invoice_number'] LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM %I',seq,client_role);
   END LOOP;
  END IF;
 END LOOP;
END $$;
