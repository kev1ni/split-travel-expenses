-- Atomically apply a refund and its share adjustments against a locked original purchase.
-- Execute once after schema.sql (new database) or on the existing team schema.
CREATE OR REPLACE FUNCTION public.confirm_card_refund(
    p_event_id text, p_original_id integer, p_refund jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
    original public.expenses%ROWTYPE;
    event public.card_events%ROWTYPE;
    saved public.expenses%ROWTYPE;
    credited numeric;
    refund_amount numeric := (p_refund->>'amount')::numeric;
    refund_krw integer := (p_refund->>'krw_amount')::integer;
BEGIN
    SELECT * INTO STRICT original FROM public.expenses WHERE id = p_original_id FOR UPDATE;
    SELECT * INTO STRICT event FROM public.card_events WHERE event_id = p_event_id FOR UPDATE;
    IF event.expense_id IS NOT NULL OR original.entry_type <> 'auto_card'
        OR original.trip_id IS DISTINCT FROM event.trip_id OR original.payer_member_id IS DISTINCT FROM event.payer_member_id
        OR original.currency IS DISTINCT FROM event.currency OR event.event_type NOT IN ('cancel','cancellation','partial_cancellation')
        OR refund_amount >= 0 OR refund_amount <> -event.amount::numeric OR refund_krw > 0 THEN
        RAISE EXCEPTION 'Invalid or already linked card refund';
    END IF;
    SELECT COALESCE(-SUM(amount),0) INTO credited FROM public.expenses
        WHERE original_expense_id = p_original_id AND entry_type = 'cancellation';
    IF credited <> (p_refund->>'seen_amount')::numeric OR credited - refund_amount > original.amount THEN
        RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Refund balance changed';
    END IF;
    INSERT INTO public.expenses(trip_id, payer_member_id, entry_type, original_expense_id, title, category,
                                amount, currency, exchange_rate, rate_date, krw_amount, payment_method, split_type, spent_at)
    VALUES(original.trip_id, original.payer_member_id, 'cancellation', original.id, p_refund->>'title', original.category,
           refund_amount, original.currency, original.exchange_rate, original.rate_date, refund_krw, 'card', 'exact',
           (p_refund->>'spent_at')::timestamptz)
    RETURNING * INTO saved;
    INSERT INTO public.expense_splits(trip_id,expense_id,member_id,split_krw_amount,percentage_bp)
        SELECT original.trip_id, saved.id, s.member_id, s.split_krw_amount, 0
        FROM jsonb_to_recordset(p_refund->'splits') AS s(member_id integer, split_krw_amount integer);
    UPDATE public.card_events SET expense_id = saved.id
        WHERE event_id = p_event_id OR (
            expense_id IS NULL AND event.occurred_at IS NOT NULL AND event.approval_ref IS NOT NULL
            AND trip_id = event.trip_id AND payer_member_id = event.payer_member_id
            AND issuer = event.issuer AND approval_ref = event.approval_ref AND event_type = event.event_type
            AND amount = event.amount AND currency = event.currency AND occurred_at = event.occurred_at);
    RETURN to_jsonb(saved);
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_card_refund(text, integer, jsonb) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS(SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION public.confirm_card_refund(text, integer, jsonb) FROM anon;
    END IF;
    IF EXISTS(SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON FUNCTION public.confirm_card_refund(text, integer, jsonb) FROM authenticated;
    END IF;
    IF EXISTS(SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.confirm_card_refund(text, integer, jsonb) TO service_role;
    END IF;
END;
$$;
