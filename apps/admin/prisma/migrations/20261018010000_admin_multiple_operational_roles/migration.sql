BEGIN;
ALTER TABLE public."DeliveryAccount" ADD COLUMN "primary" boolean NOT NULL DEFAULT true;
DROP INDEX public."DeliveryAccount_clerkUserId_key";
CREATE UNIQUE INDEX "DeliveryAccount_clerkUserId_role_key" ON public."DeliveryAccount"("clerkUserId",role);
CREATE UNIQUE INDEX delivery_one_primary_role ON public."DeliveryAccount"("clerkUserId") WHERE "primary";

-- Browser roles still cannot read/write these tables directly. Extra profiles
-- require an active private admin grant, or a server-authorized root permit.
CREATE FUNCTION public.igo_account_roles_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE allowed boolean; additional boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('admin-access:'||NEW."clerkUserId",0));
 IF TG_OP='UPDATE' AND (NEW.id,NEW."clerkUserId",NEW.role,NEW."createdAt") IS DISTINCT FROM (OLD.id,OLD."clerkUserId",OLD.role,OLD."createdAt") THEN
  RAISE EXCEPTION 'Account identity and operational role are immutable';
 END IF;
 allowed:=coalesce(current_setting('igo.role_identity',true),'')=NEW."clerkUserId" OR EXISTS(SELECT 1 FROM public."DeliveryAdminGrant" g WHERE g."clerkUserId"=NEW."clerkUserId" AND g.active);
 SELECT EXISTS(SELECT 1 FROM public."DeliveryAccount" a WHERE a."clerkUserId"=NEW."clerkUserId" AND a.id<>NEW.id) INTO additional;
 IF TG_OP='INSERT' AND additional AND NOT allowed THEN RAISE EXCEPTION 'Only approved administrators may create an additional operational role'; END IF;
 IF TG_OP='INSERT' AND NOT additional AND NOT NEW."primary" THEN RAISE EXCEPTION 'The first operational account must be primary'; END IF;
 IF TG_OP='UPDATE' AND NEW."primary" IS DISTINCT FROM OLD."primary" AND NOT allowed THEN RAISE EXCEPTION 'Changing the retained role requires administrator authorization'; END IF;
 IF NOT NEW."primary" AND additional AND NEW.status='APPROVED' AND NOT allowed THEN RAISE EXCEPTION 'Additional operational roles require current administrator access'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER delivery_account_roles_guard BEFORE INSERT OR UPDATE ON public."DeliveryAccount" FOR EACH ROW EXECUTE FUNCTION public.igo_account_roles_guard();
REVOKE ALL ON FUNCTION public.igo_account_roles_guard() FROM PUBLIC,anon,authenticated;
-- Existing notices predate users owning both operational roles. Preserve the
-- messages while classifying them so they do not leak into the other inbox.
UPDATE public."DeliveryNotification" SET workspace='PARTNER' WHERE workspace='ACCOUNT' AND title IN ('Delivery invoice received','Paid invoice received','Rider assigned','Package picked up','Package delivered','Bank transfer reviewed','Operating location updated','Welcome to your partner workspace');
UPDATE public."DeliveryNotification" SET workspace='DRIVER' WHERE workspace='ACCOUNT' AND title IN ('Collection assigned','Delivery added to your collections');
UPDATE public."DeliveryNotification" SET workspace=CASE WHEN message LIKE 'Your driver account%' THEN 'DRIVER' ELSE 'PARTNER' END WHERE workspace='ACCOUNT' AND title='Application update';
UPDATE public."DeliveryNotification" SET workspace='ADMIN' WHERE workspace='ACCOUNT' AND title='Administrator access granted';
COMMIT;
