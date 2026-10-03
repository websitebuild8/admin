-- Business data is accessed only by the trusted Prisma backend, which checks
-- Clerk identities and ownership. Do not expose these tables via the Data API.
-- No client policies are deliberately created; future direct access needs a
-- separate, reviewed policy design, especially for private rider coordinates.
DO $$
DECLARE
  table_name text;
  client_role text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'Profile', 'RoleApplication', 'Restaurant', 'Rider', 'Order',
    'RefundReview', 'SupportCase', 'AuditEvent', 'ServiceSettings', 'Notification'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', table_name);
    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      -- Conditional so the same migration also works on plain development Postgres.
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', table_name, client_role);
      END IF;
    END LOOP;
  END LOOP;
END $$;
