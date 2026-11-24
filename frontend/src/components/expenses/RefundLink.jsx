import { useEffect, useState } from 'react';
import { expenseService } from '../../services/expenseService';
import { cardEventService } from '../../services/cardEventService';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';

export function RefundLink({ tripId, event, onClose, onLinked }) {
  const [choices, setChoices] = useState(null);
  const [originalId, setOriginalId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    expenseService.getTripExpenses(tripId, controller.signal).then(({ expenses }) => {
      if (!controller.signal.aborted) setChoices(expenses.filter(expense =>
        expense.payerMemberId === String(event.payer_member_id) && expense.currency === event.currency &&
        expense.paymentMethod === 'CARD' && expense.eventType === 'PURCHASE'
      ));
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [tripId, event.payer_member_id, event.currency]);

  async function link(e) {
    e.preventDefault();
    if (!originalId || saving) return;
    setSaving(true);
    setError('');
    try {
      await cardEventService.confirm(tripId, {
        card_event_id: event.event_id, payer_member_id: event.payer_member_id, original_expense_id: Number(originalId),
      });
      onLinked();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }
  return (
    <Modal isOpen title="취소할 원거래 연결" onClose={() => { if (!saving) onClose(); }}>
      <form onSubmit={link} className="space-y-4">
        <p className="text-sm text-ink-secondary">{event.merchant || '카드'} 취소 {event.amount} {event.currency}를 반영할 원래 지출을 선택해 주세요.</p>
        <label className="block space-y-2 text-sm font-semibold">원래 카드 지출
          <select className="w-full rounded-[16px] border border-surface-border p-3" required
            value={originalId} onChange={e => setOriginalId(e.target.value)}>
            <option value="">{choices?.length === 0 ? '연결할 수 있는 카드 지출이 없어요.' : '원래 결제 선택'}</option>
            {choices?.map(expense => <option key={expense.id} value={expense.id}>
              {expense.title} · {expense.amount} {expense.currency} · {expense.expenseDate}
            </option>)}
          </select>
        </label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={!originalId} loading={saving}>원거래에 취소 반영</Button>
      </form>
    </Modal>
  );
}
