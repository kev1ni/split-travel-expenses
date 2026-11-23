import { EXPENSE_CATEGORIES } from '../constants/categories';
import { TRAVEL_COUNTRIES } from '../constants/countries';

export function memberView(row, ownerId) {
  return {id: String(row.id), userId: row.user_id == null ? null : String(row.user_id),
    name: row.nickname, memberType: row.user_id == null ? 'GUEST' : 'ACCOUNT',
    role: row.user_id != null && row.user_id === ownerId ? 'OWNER' : 'MEMBER'};
}

export function expenseView(row) {
  const stamp = row.occurred_at || row.spent_at || '';
  const date = stamp ? new Date(stamp) : null;
  const local = date && Number.isFinite(date.getTime());
  const pad = (n) => String(n).padStart(2, '0');
  const category = EXPENSE_CATEGORIES.find((c) => c.id === row.category?.toUpperCase() || c.label === row.category);
  return {
    id: String(row.id), tripId: String(row.trip_id), title: row.title, merchantName: row.merchant || row.title,
    amount: Number(row.amount), amountKrw: Number(row.krw_amount), currency: row.currency,
    exchangeRate: row.exchange_rate == null ? null : Number(row.exchange_rate), exchangeRateDate: row.rate_date,
    expenseDate: local ? `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}` : '',
    expenseTime: local ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : '',
    category: category?.id || 'ETC', payerMemberId: String(row.payer_member_id), payerName: row.payer_nickname,
    paymentMethod: row.payment_method?.toUpperCase(), eventType: row.entry_type === 'cancellation' ? 'CANCELLED' : 'PURCHASE',
    splitType: row.split_type === 'equal' ? 'EQUAL' : 'CUSTOM', memo: row.memo,
    splits: (row.splits || []).map((s) => ({
      memberId: String(s.member_id), memberName: s.member_nickname || s.nickname,
      amount: row.currency === 'KRW' ? Number(s.split_krw_amount ?? s.krw_amount) : null,
      amountKrw: Number(s.split_krw_amount ?? s.krw_amount),
    })),
  };
}

export function tripView(row) {
  const members = (row.members || []).map((m) => memberView(m, row.created_by));
  const myId = String(row.my_member_id);
  const memberSettlementSummary = (row.balances || []).map((b) => ({
    memberId: String(b.member_id), memberName: b.nickname, memberType: members.find(m => m.id === String(b.member_id))?.memberType,
    paidAmountKrw: b.total_paid, shareAmountKrw: b.total_owed,
    netAmountKrw: b.net_balance, outstandingKrw: b.outstanding_balance,
  }));
  const settlements = (row.settlements || []).map((s) => ({
    id: String(s.id), tripId: String(row.id), fromMemberId: String(s.sender_member_id),
    toMemberId: String(s.receiver_member_id), fromName: s.sender_nickname, toName: s.receiver_nickname,
    counterpartyName: String(s.sender_member_id) === myId ? s.receiver_nickname : s.sender_nickname,
    direction: String(s.sender_member_id) === myId ? 'SEND' : String(s.receiver_member_id) === myId ? 'RECEIVE' : 'OTHER',
    amount: Number(s.amount), currency: 'KRW', status: s.status.toUpperCase(), completedAt: s.completed_at,
  }));
  const country = TRAVEL_COUNTRIES.find(c => c.code === row.destination_country
    || row.destination_country === c.name || row.destination_country?.startsWith(c.name + ' '));
  const myBalance = Number(row.my_unsettled_krw_amount || 0);
  const outstanding = row.has_unsettled_balance ?? memberSettlementSummary.some(b => b.outstandingKrw !== 0);
  return {
    id: String(row.id), title: row.title, location: row.destination_country === country?.code ? country?.name : row.destination_country,
    countryCode: country?.code || 'OTHER', countryName: country?.name || row.destination_country || '',
    baseCurrency: row.destination_currency, description: row.description || '', startDate: row.start_date || '', endDate: row.end_date || '',
    inviteCode: row.share_code, members, memberCount: row.member_count ?? members.length, myMemberId: myId,
    isOwner: members.some(m => m.id === myId && m.role === 'OWNER'), expenses: (row.expenses || []).map(expenseView),
    expenseCount: row.expense_count ?? row.expenses?.length ?? 0, totalAmountKrw: Number(row.total_krw_amount || 0),
    memberSettlementSummary, settlements, myPendingSendKrw: Math.max(0, -myBalance), myPendingReceiveKrw: Math.max(0, myBalance),
    myNetSettlementKrw: myBalance, settlementStatus: outstanding ? 'IN_PROGRESS' : 'SETTLED',
    settlementStatusLabel: outstanding ? '정산 진행 중' : '정산 완료',
  };
}
