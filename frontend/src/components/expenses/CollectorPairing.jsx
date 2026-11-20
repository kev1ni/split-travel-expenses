import { useState } from 'react';
import { Link2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { cardEventService } from '../../services/cardEventService';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { InputField } from '../common/InputField';

export function CollectorPairing({ trip }) {
  const { user } = useAuth();
  const own = trip.members.find((m) => user?.id != null && String(m.userId) === String(user.id));
  const choices = own?.role === 'OWNER' ? trip.members : own ? [own] : [];
  const [payer, setPayer] = useState(own?.id || '');
  const [password, setPassword] = useState('');
  const [pair, setPair] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  if (!choices.length || !user?.username) return null;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setPair(await cardEventService.pair(trip.id, payer, user.username, password));
    } catch (err) {
      setError(err.message);
    } finally {
      setPassword('');
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <button type="button" aria-expanded={open} aria-controls="collector-pair-form" disabled={busy}
        className="flex w-full items-center gap-2 text-left font-bold"
        onClick={() => { setOpen(!open); setPair(null); setPassword(''); setError(''); }}>
        <Link2 className="w-5 h-5 text-primary-dark" aria-hidden="true" /> 휴대폰 수집기 연결
        <span className="ml-auto text-sm text-primary-dark">{open ? '닫기' : '설정'}</span>
      </button>
      {open && <div id="collector-pair-form">
        {pair ? <div className="space-y-3">
          {pair.url ? (
            <InputField id="pair-url" label="휴대폰에 입력할 HTTPS 서버 주소" readOnly value={pair.url}
              onFocus={(e) => e.target.select()} />
          ) : (
            <p className="text-sm text-ink-secondary">휴대폰에서 접속할 수 있는 HTTPS 서버 주소 뒤에
              {' '}<code>{pair.path}</code>를 붙여 주세요.</p>
          )}
          <InputField id="pair-token" label="이 결제자의 Bearer 토큰" readOnly value={pair.token}
            autoComplete="off" onFocus={(e) => e.target.select()}
            helperText="선택한 결제자의 수집기에만 복사해 주세요." />
          <Button variant="secondary" size="sm" onClick={() => { setPair(null); setOpen(false); }}>완료</Button>
        </div> : (
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-sm font-semibold" htmlFor="pair-payer">연결할 결제자</label>
            <select id="pair-payer" value={payer} required disabled={busy} onChange={(e) => setPayer(e.target.value)}
              className="w-full rounded-[16px] border border-surface-border bg-surface-card p-3">
              {choices.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <InputField id="pair-password" label={`${user.username} 계정 비밀번호`} required type="password"
              autoComplete="current-password" value={password} disabled={busy} onChange={(e) => setPassword(e.target.value)} />
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <Button type="submit" loading={busy}>연결 정보 발급</Button>
          </form>
        )}
      </div>}
    </Card>
  );
}
