import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { EXPENSE_CATEGORIES } from '../../constants/categories';
import { CURRENCIES } from '../../constants/currencies';
import { cardEventService } from '../../services/cardEventService';
import { exchangeRateService } from '../../services/exchangeRateService';
import { convertToKrwExact } from '../../utils/currencyMath';
import { formatKrw } from '../../utils/formatters';
import { validateCustomSplits } from '../../utils/splitCalculator';
import { SplitMemberSelector } from './SplitMemberSelector';
import { Button } from '../common/Button';
import { InputField } from '../common/InputField';
import { Modal } from '../common/Modal';

const selectStyle = 'w-full rounded-[16px] border border-surface-border bg-surface-card p-3 text-base font-normal';

function localDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function CollectorExpenseReview({ trip, event, manual = false, onClose, onRegistered }) {
  const { user } = useAuth();
  const members = trip.members;
  const own = members.find((m) => user?.id != null && String(m.userId) === String(user.id));
  const [payer, setPayer] = useState(String(event.payer_member_id || own?.id || members[0]?.id || ''));
  const [title, setTitle] = useState(event.merchant || '');
  const [amount, setAmount] = useState(event.amount ?? '');
  const [currency, setCurrency] = useState(event.currency || '');
  const [type, setType] = useState(event.event_type === 'cancel' ? 'cancellation' : event.event_type || '');
  const [category, setCategory] = useState('ETC');
  const [spentAt, setSpentAt] = useState(localDateTime(event.occurred_at || event.received_at));
  const [rate, setRate] = useState('');
  const [rateDate, setRateDate] = useState('');
  const [memberIds, setMemberIds] = useState(members.map((m) => m.id));
  const [splitType, setSplitType] = useState('EQUAL');
  const [shares, setShares] = useState({});
  const [original, setOriginal] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const day = spentAt.slice(0, 10);
  const refund = type === 'cancellation' || type === 'partial_cancellation';
  const externalRate = !!currency && currency !== 'KRW' && !refund;
  const total = convertToKrwExact(amount, externalRate ? rate : 1);
  const originals = (trip.expenses || []).filter((row) =>
    String(row.payerMemberId) === payer && row.currency === currency && row.paymentMethod === 'CARD'
    && row.eventType === 'PURCHASE'
  );

  useEffect(() => {
    let current = true;
    setRate('');
    setRateDate(day);
    if (externalRate && day) {
      exchangeRateService.getExchangeRate({ base: currency, target: 'KRW', date: day, tripId: trip.id })
        .then((res) => {
          if (current && !res.isMockRate && Number(res.rate) > 0) {
            setRate((value) => value || String(res.rate));
          }
        }).catch(() => { /* 적용할 수 있는 기록이 없으면 사용자가 환율을 입력한다. */ });
    }
    return () => { current = false; };
  }, [currency, day, externalRate, trip.id]);

  async function confirm(e) {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (!title.trim() || !(Number(amount) > 0) || !['approval', 'cancellation', 'partial_cancellation'].includes(type)) {
      setError('가맹점, 결제 금액과 거래 종류를 확인해 주세요.');
      return;
    }
    if (refund && !original && !event.approval_ref) {
      setError('취소 금액을 반영할 원래 카드 지출을 선택해 주세요.');
      return;
    }
    if (!refund && (!memberIds.length || !(total > 0))) {
      setError('분담 멤버와 원화 환산액을 확인해 주세요.');
      return;
    }
    if (!refund && splitType === 'CUSTOM') {
      const valid = validateCustomSplits(total, memberIds, shares);
      if (!valid.isValid || memberIds.some((id) => !Number.isInteger(Number(shares[id])))) {
        setError(valid.error || '분담액은 1원 단위로 입력해 주세요.');
        return;
      }
    }
    const payload = {
      [manual ? 'event_id' : 'card_event_id']: event.event_id,
      issuer: event.issuer, approval_ref: event.approval_ref, event_type: type,
      merchant: title.trim(), amount: String(amount), currency, category,
      payer_member_id: Number(payer), occurred_at: new Date(spentAt).toISOString(),
    };
    if (refund) {
      if (original) payload.original_expense_id = Number(original);
    } else {
      if (externalRate) Object.assign(payload, { exchange_rate: rate, rate_date: rateDate });
      payload.split_type = splitType === 'EQUAL' ? 'equal' : 'exact';
      payload.splits = memberIds.map((id) => splitType === 'EQUAL' ? { member_id: Number(id) } :
        { member_id: Number(id), split_krw_amount: Number(shares[id]) });
    }
    setBusy(true);
    try {
      await cardEventService.confirm(trip.id, payload);
      onRegistered(title.trim(), refund);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal isOpen title="카드 내역 검토" maxWidth="max-w-xl" onClose={() => { if (!busy) onClose(); }}>
      <form onSubmit={confirm} className="space-y-4">
        {!!event.warnings?.length && <p className="text-sm text-ink-secondary">{event.warnings.join(' ')}</p>}
        <InputField id="review-title" required maxLength={100} label="가맹점 또는 지출명"
          value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <InputField id="review-amount" label="원래 결제 금액" type="number" min="0.01" step="0.01"
            required readOnly={!manual} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <label className="space-y-1 text-sm font-semibold">통화
            <select className={selectStyle} value={currency} required disabled={!manual} onChange={(e) => setCurrency(e.target.value)}>
              <option value="">통화 선택</option>
              {[...new Set([...CURRENCIES.map((item) => item.code), event.currency].filter(Boolean))].map((code) =>
                <option key={code}>{code}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold">거래 종류
            <select className={selectStyle} value={type} required disabled={!manual} onChange={(e) => setType(e.target.value)}>
              <option value="">종류 선택</option>
              <option value="approval">승인</option><option value="cancellation">취소</option>
              <option value="partial_cancellation">부분 취소</option>
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold">결제자
            <select className={selectStyle} value={payer} disabled={!manual} required onChange={(e) => { setPayer(e.target.value); setOriginal(''); }}>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        </div>
        <InputField id="review-time" label="거래 시각" type="datetime-local" value={spentAt} required
          helperText={!event.occurred_at && event.received_at ? '알림 수신 시각을 표시했어요. 실제 거래 시각과 다르면 수정해 주세요.' : undefined}
          onChange={(e) => setSpentAt(e.target.value)} />
        {refund ? (
          <label className="block space-y-2 text-sm font-semibold">취소할 원래 카드 지출
            <select className={selectStyle} value={original} onChange={(e) => setOriginal(e.target.value)} required={!event.approval_ref}>
              <option value="">{event.approval_ref ? '승인번호로 원거래 찾기' : '원거래 선택'}</option>
              {originals.map((row) => <option key={row.id} value={row.id}>{row.title} · {row.amount} {row.currency} · {row.expenseDate}</option>)}
            </select>
            <span className="block font-normal text-ink-secondary">원래 지출의 환율과 분담 비율로 취소 금액을 차감해요.</span>
          </label>
        ) : <>
          <label className="block space-y-1 text-sm font-semibold">분류
            <select className={selectStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          {externalRate && <div className="grid gap-3 sm:grid-cols-2">
            <InputField id="review-rate" label={`1 ${currency}당 원화 환율`} type="number" step="0.000001" min="0.000001"
              required value={rate} onChange={(e) => setRate(e.target.value)} />
            <InputField id="review-rate-date" label="환율 기준일" type="date" required value={rateDate}
              onChange={(e) => setRateDate(e.target.value)} />
          </div>}
          <p className="font-semibold">원화 분담 총액 {total > 0 ? formatKrw(total) : '—'}</p>
          <SplitMemberSelector members={members} totalAmount={total} currency="KRW"
            selectedMemberIds={memberIds} onSelectedMemberIdsChange={setMemberIds}
            splitType={splitType} onSplitTypeChange={setSplitType}
            customShares={shares} onCustomSharesChange={setShares} />
        </>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button type="submit" loading={busy} fullWidth>{refund ? '원거래에 취소 반영' : '카드 지출 등록'}</Button>
      </form>
    </Modal>
  );
}
