-- Atomic writes for the v1 settlement endpoints. Both operations lock the same trip row.
CREATE OR REPLACE FUNCTION public.confirm_trip_settlements(p_trip_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE plan jsonb; imbalance numeric;
BEGIN
    PERFORM id FROM public.trips WHERE id = p_trip_id FOR UPDATE;
    IF NOT FOUND THEN RAISE NO_DATA_FOUND; END IF;

    -- Each debt/credit occupies an interval on the same cumulative KRW axis.
    -- Overlap pairs them in the same order as the read-only greedy preview.
    WITH movements AS (
        SELECT payer_member_id AS mid, krw_amount::bigint AS delta FROM public.expenses WHERE trip_id = p_trip_id
        UNION ALL SELECT member_id, -split_krw_amount::bigint FROM public.expense_splits WHERE trip_id = p_trip_id
        UNION ALL SELECT sender_member_id, amount FROM public.settlements WHERE trip_id = p_trip_id AND status = 'completed'
        UNION ALL SELECT receiver_member_id, -amount::bigint FROM public.settlements WHERE trip_id = p_trip_id AND status = 'completed'
    ), balances AS (
        SELECT mid, sum(delta) AS balance FROM movements GROUP BY mid
    ), spans AS (
        SELECT mid, balance, sum(abs(balance)) OVER (
            PARTITION BY sign(balance) ORDER BY abs(balance) DESC, mid
        ) AS upto FROM balances WHERE balance <> 0
    ), matches AS (
        SELECT d.mid AS sender_member_id, c.mid AS receiver_member_id,
               least(d.upto,c.upto) - greatest(d.upto + d.balance,c.upto - c.balance) AS amount
        FROM spans d JOIN spans c ON d.balance < 0 AND c.balance > 0
                AND d.upto > c.upto - c.balance AND c.upto > d.upto + d.balance
    )
    SELECT coalesce(jsonb_agg(to_jsonb(matches) ORDER BY sender_member_id,receiver_member_id), '[]'::jsonb),
           (SELECT coalesce(sum(balance), 0) FROM balances)
        INTO plan, imbalance FROM matches;
    IF imbalance <> 0 THEN
        RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Expense/split write in progress';
    END IF;

    DELETE FROM public.settlements s WHERE s.trip_id = p_trip_id AND s.status = 'pending' AND (
        NOT EXISTS (SELECT FROM jsonb_to_recordset(plan) p(sender_member_id integer, receiver_member_id integer, amount bigint)
            WHERE (p.sender_member_id,p.receiver_member_id,p.amount) = (s.sender_member_id,s.receiver_member_id,s.amount))
        OR EXISTS (SELECT FROM public.settlements earlier WHERE earlier.trip_id = s.trip_id AND earlier.status = 'pending'
            AND (earlier.sender_member_id,earlier.receiver_member_id,earlier.amount) = (s.sender_member_id,s.receiver_member_id,s.amount)
            AND earlier.id < s.id)
    );
    INSERT INTO public.settlements(trip_id,sender_member_id,receiver_member_id,amount,status)
        SELECT p_trip_id, p.sender_member_id, p.receiver_member_id, p.amount, 'pending'
        FROM jsonb_to_recordset(plan) p(sender_member_id integer, receiver_member_id integer, amount bigint)
        WHERE NOT EXISTS (SELECT FROM public.settlements s WHERE s.trip_id = p_trip_id AND s.status = 'pending'
            AND (p.sender_member_id,p.receiver_member_id,p.amount) = (s.sender_member_id,s.receiver_member_id,s.amount));
    RETURN (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY id),'[]'::jsonb)
            FROM public.settlements s WHERE trip_id = p_trip_id AND status = 'pending');
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_trip_settlement(p_trip_id integer, p_settlement_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE transfer public.settlements%ROWTYPE;
BEGIN
    PERFORM id FROM public.trips WHERE id = p_trip_id FOR UPDATE;
    SELECT * INTO STRICT transfer FROM public.settlements WHERE trip_id = p_trip_id AND id = p_settlement_id FOR UPDATE;
    IF transfer.status = 'pending' THEN
        UPDATE public.settlements SET status = 'completed', completed_at = now() WHERE id = p_settlement_id
            RETURNING * INTO transfer;
    END IF;
    RETURN to_jsonb(transfer);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_trip_settlements(integer), public.complete_trip_settlement(integer,integer) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS(SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION public.confirm_trip_settlements(integer), public.complete_trip_settlement(integer,integer) FROM anon;
    END IF;
    IF EXISTS(SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON FUNCTION public.confirm_trip_settlements(integer), public.complete_trip_settlement(integer,integer) FROM authenticated;
    END IF;
    IF EXISTS(SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.confirm_trip_settlements(integer), public.complete_trip_settlement(integer,integer) TO service_role;
    END IF;
END;
$$;
