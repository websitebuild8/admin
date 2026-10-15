CREATE FUNCTION public.igo_payment_reconcile() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE allocated bigint;
BEGIN
 SELECT coalesce(sum(amount),0) INTO allocated FROM public."DeliveryPaymentAllocation" WHERE "paymentId"=NEW.id;
 IF allocated<>NEW."confirmedAmount" THEN RAISE EXCEPTION 'Verified payment and allocation must reconcile'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER delivery_payment_reconciled AFTER INSERT OR UPDATE ON public."DeliveryPayment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.igo_payment_reconcile();

CREATE FUNCTION public.igo_cash_reconcile() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE handover uuid; remittance uuid; expected integer; actual bigint;
BEGIN
 IF TG_TABLE_NAME='DeliveryCashHandover' THEN handover:=NEW.id;
 ELSIF TG_TABLE_NAME='DeliveryCodRemittance' THEN remittance:=NEW.id;
 ELSE handover:=NEW."handoverId"; remittance:=NEW."remittanceId"; END IF;
 IF handover IS NOT NULL THEN
  SELECT amount INTO expected FROM public."DeliveryCashHandover" WHERE id=handover;
  SELECT coalesce(sum("codAmount"),0) INTO actual FROM public."DeliveryParcel" WHERE "handoverId"=handover;
  IF expected IS DISTINCT FROM actual OR expected<=0 THEN RAISE EXCEPTION 'Driver cash handover must reconcile to collected parcels'; END IF;
 END IF;
 IF remittance IS NOT NULL THEN
  SELECT amount INTO expected FROM public."DeliveryCodRemittance" WHERE id=remittance;
  SELECT coalesce(sum("codAmount"),0) INTO actual FROM public."DeliveryParcel" WHERE "remittanceId"=remittance;
  IF expected IS DISTINCT FROM actual OR expected<=0 THEN RAISE EXCEPTION 'COD payout must reconcile to received parcels'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER delivery_handover_reconciled AFTER INSERT ON public."DeliveryCashHandover" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.igo_cash_reconcile();
CREATE CONSTRAINT TRIGGER delivery_remittance_reconciled AFTER INSERT ON public."DeliveryCodRemittance" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.igo_cash_reconcile();
CREATE CONSTRAINT TRIGGER delivery_cash_parcels_reconciled AFTER UPDATE ON public."DeliveryParcel" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.igo_cash_reconcile();
CREATE TRIGGER delivery_payment_no_delete BEFORE DELETE ON public."DeliveryPayment" FOR EACH ROW EXECUTE FUNCTION public.igo_append_only();
CREATE TRIGGER delivery_invoice_no_delete BEFORE DELETE ON public."DeliveryInvoice" FOR EACH ROW EXECUTE FUNCTION public.igo_append_only();
CREATE TRIGGER delivery_cycle_immutable BEFORE UPDATE OR DELETE ON public."DeliveryBillingCycle" FOR EACH ROW EXECUTE FUNCTION public.igo_append_only();
REVOKE ALL ON FUNCTION public.igo_parcel_guard(), public.igo_append_only(), public.igo_invoice_line_guard(), public.igo_payment_guard(), public.igo_allocation_guard(), public.igo_invoice_reconcile(), public.igo_payment_reconcile(), public.igo_cash_reconcile() FROM PUBLIC;
