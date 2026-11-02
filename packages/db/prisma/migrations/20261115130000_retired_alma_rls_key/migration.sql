-- ALMA tables that stayed after their screens were removed still had system
-- policies with WITH CHECK, so 20261114120000_rls_bypass_key left them on the
-- old setting. They now use the same key check as every other system policy.
-- The tables and their rows stay.

DO $$
DECLARE
  policy record;
BEGIN
  FOR policy IN
    SELECT p.polname, c.relname
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relnamespace = 'public'::regnamespace
      AND pg_get_expr(p.polqual, p.polrelid) = '(current_setting(''app.rls_bypass''::text, true) = ''on''::text)'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I', policy.polname, policy.relname);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING ((SELECT app_rls_bypass()))',
      policy.polname,
      policy.relname
    );
  END LOOP;
END $$;
