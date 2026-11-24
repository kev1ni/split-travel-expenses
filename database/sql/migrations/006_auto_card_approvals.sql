-- Apply as database owner. A retry reuses the UUID assigned by the phone;
-- different pushes can have the same amount and approval reference.
BEGIN;

ALTER TABLE public.card_events
    ADD COLUMN IF NOT EXISTS auto_registration_skipped boolean NOT NULL DEFAULT false;

-- Services running against the previous schema used the source to remember
-- removed phone expenses. Keep the original channel and carry that decision forward.
UPDATE public.card_events
    SET source = 'app_push', auto_registration_skipped = (expense_id IS NULL)
    WHERE source = 'deleted:app_push';

-- Both the expense API and the FK's ON DELETE SET NULL unlink card events.
-- Remember an intentional deletion so a retry cannot recreate that expense.
CREATE OR REPLACE FUNCTION public.remember_card_expense_unlink()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    NEW.auto_registration_skipped := NEW.expense_id IS NULL;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS remember_card_expense_unlink ON public.card_events;
CREATE TRIGGER remember_card_expense_unlink BEFORE UPDATE OF expense_id ON public.card_events
    FOR EACH ROW WHEN (NEW.source = 'app_push' AND OLD.expense_id IS DISTINCT FROM NEW.expense_id)
    EXECUTE FUNCTION public.remember_card_expense_unlink();

CREATE OR REPLACE FUNCTION public.auto_register_card_approval(
    p_event_id text, p_exchange_rate numeric, p_rate_date date
) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    event public.card_events%ROWTYPE;
    expense_id_to_use integer;
    members integer[];
    member_count integer;
    amount_value numeric;
    rate_value numeric(18,6);
    total_krw integer;
    spent timestamptz;
BEGIN
    SELECT * INTO STRICT event FROM public.card_events WHERE event_id = p_event_id FOR UPDATE;
    IF event.trip_id IS NULL OR event.payer_member_id IS NULL
       OR event.event_type IS DISTINCT FROM 'approval'
       OR event.source IS DISTINCT FROM 'app_push' THEN
        RAISE EXCEPTION 'Expected a card app push approval scoped to a trip member';
    END IF;
    IF event.expense_id IS NOT NULL OR event.auto_registration_skipped THEN
        RETURN event.expense_id;
    END IF;
    amount_value := event.amount::numeric;
    IF amount_value IS NULL OR amount_value <= 0 OR event.currency IS NULL THEN
        RAISE EXCEPTION 'Invalid card approval amount or currency';
    END IF;
    rate_value := CASE WHEN event.currency = 'KRW' THEN 1 ELSE p_exchange_rate END;
    IF rate_value IS NULL OR rate_value <= 0 OR (event.currency <> 'KRW' AND p_rate_date IS NULL) THEN
        RAISE EXCEPTION 'A positive exchange rate and date are required';
    END IF;
    total_krw := round(amount_value * rate_value);
    spent := coalesce(event.occurred_at, event.received_at, event.created_at);
    SELECT array_agg(m.id ORDER BY m.id) INTO members
        FROM public.trip_members m WHERE m.trip_id = event.trip_id;
    member_count := cardinality(members);
    IF member_count IS NULL OR NOT (event.payer_member_id = ANY(members)) THEN
        RAISE EXCEPTION 'Payer no longer belongs to this trip';
    END IF;
    INSERT INTO public.expenses (trip_id, payer_member_id, entry_type, title, category, amount, currency,
                                 exchange_rate, rate_date, krw_amount, payment_method, split_type, spent_at)
    VALUES (event.trip_id, event.payer_member_id, 'auto_card',
            coalesce(nullif(trim(event.merchant), ''), nullif(trim(event.issuer), ''), '카드 결제'),
            '기타', amount_value, event.currency, rate_value, coalesce(p_rate_date, spent::date),
            total_krw, 'card', 'equal', spent)
    RETURNING id INTO expense_id_to_use;
    INSERT INTO public.expense_splits (trip_id, expense_id, member_id, split_krw_amount, percentage_bp)
    SELECT event.trip_id, expense_id_to_use, m.id,
           total_krw / member_count + (m.position <= total_krw % member_count)::integer,
           10000 / member_count + (m.position <= 10000 % member_count)::integer
    FROM unnest(members) WITH ORDINALITY AS m(id, position);
    UPDATE public.card_events SET expense_id = expense_id_to_use WHERE event_id = p_event_id;
    RETURN expense_id_to_use;
END;
$$;

-- Keep the existing refund balance lock and rounding plan from migration 003.
-- Each app push claims its own UUID; historical message rows retain their link.
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
            event.source IS DISTINCT FROM 'app_push' AND source IS DISTINCT FROM 'app_push'
            AND expense_id IS NULL AND event.occurred_at IS NOT NULL AND event.approval_ref IS NOT NULL
            AND trip_id = event.trip_id AND payer_member_id = event.payer_member_id
            AND issuer = event.issuer AND approval_ref = event.approval_ref AND event_type = event.event_type
            AND amount = event.amount AND currency = event.currency AND occurred_at = event.occurred_at);
    RETURN to_jsonb(saved);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_card_refund(text, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_register_card_approval(text, numeric, date) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION public.confirm_card_refund(text, integer, jsonb) FROM anon;
        REVOKE ALL ON FUNCTION public.auto_register_card_approval(text, numeric, date) FROM anon;
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON FUNCTION public.confirm_card_refund(text, integer, jsonb) FROM authenticated;
        REVOKE ALL ON FUNCTION public.auto_register_card_approval(text, numeric, date) FROM authenticated;
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.confirm_card_refund(text, integer, jsonb) TO service_role;
        GRANT EXECUTE ON FUNCTION public.auto_register_card_approval(text, numeric, date) TO service_role;
    END IF;
END;
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
