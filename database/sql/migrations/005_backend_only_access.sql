-- Browser/mobile clients reach these tables through Flask's member checks.
-- Run from the Supabase SQL editor (database owner). Flask uses the server secret.
BEGIN;
DO $$
DECLARE
    rel text;
    public_role text;
    seq regclass;
BEGIN
    FOREACH rel IN ARRAY ARRAY['users', 'trips', 'trip_members', 'expenses', 'expense_splits',
                               'currency_exchanges', 'card_events', 'settlements',
                               'web_sessions', 'web_guest_members']
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rel);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', rel);
        FOREACH public_role IN ARRAY ARRAY['anon','authenticated']
        LOOP
            IF EXISTS (SELECT FROM pg_roles WHERE rolname = public_role) THEN
                EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', rel, public_role);
            END IF;
        END LOOP;
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', rel);
            IF rel NOT IN ('card_events', 'web_sessions', 'web_guest_members') THEN
                seq := pg_get_serial_sequence(format('public.%I',rel), 'id');
                IF seq IS NOT NULL THEN
                    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO service_role', seq);
                END IF;
            END IF;
        END IF;
    END LOOP;
END $$;
COMMIT;
