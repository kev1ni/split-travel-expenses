"""
API 통합 테스트 (실제 Supabase 없이 가짜 DB로 전체 흐름 검증)

실행:  python tests/test_api.py      또는   pytest tests
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fake_supabase import FakeClient  # noqa: E402

from config import settings  # noqa: E402
from core import db  # noqa: E402


def test_full_flow():
    fc = FakeClient()
    db.set_supabase_client(fc)
    settings.parser_api_key = None
    from app import create_app

    c = create_app(legacy_test=True).test_client()

    def call(m, url, body=None, expect=None, headers=None):
        fn = getattr(c, m)
        r = fn(url, json=body, headers=headers) if body is not None else fn(url, headers=headers)
        j = r.get_json()
        if expect is not None and r.status_code != expect:
            raise AssertionError(f"{m.upper()} {url} -> {r.status_code} (expected {expect}): {j}")
        return r.status_code, j


    # users
    call('post','/api/register',{"login_id":"hong","password":"password1","name":"홍","email":"Hong@x.com"},201)
    s,j=call('post','/api/register',{"login_id":"hong","password":"password1","name":"홍","email":"a@x.com"},409)
    call('post','/api/register',{"login_id":"x","password":"short","name":"a","email":"b@x.com"},400)
    call('post','/api/register',{"login_id":"x","password":"password1","name":"a","email":"bad"},400)
    call('post','/api/register',{"login_id":"kim","password_hash":"password2","name":"김","email":"kim@x.com"},201)
    s,j=call('post','/api/login',{"login_id":"hong","password":"password1"},200); assert 'password_hash' not in j['user']
    call('post','/api/login',{"login_id":"hong","password":"nope"},401)
    r=c.post('/api/login',data="notjson",content_type="text/plain"); assert r.status_code==400, r.get_json()

    # trips
    s,j=call('post','/api/trips',{"title":"도쿄","destination_currency":"jpy","start_date":"2026-11-25","end_date":"2026-11-29","created_by":"hong","creator_nickname":"길동"},201)
    trip=j['trip']; tid=trip['id']; owner=j['owner_member']; assert trip['destination_currency']=='JPY' and len(trip['share_code'])==6
    call('post','/api/trips',{"title":"x","start_date":"2026-11-25","end_date":"2026-11-20","created_by":1},400)
    call('post','/api/trips',{"title":"x","created_by":"nobody"},404)
    s,j=call('get',f"/api/trips/share/{trip['share_code'].lower()}",expect=200); assert j['trip']['member_count']==1
    call('post','/api/trips/join',{"share_code":trip['share_code'],"user_id":2,"nickname":"철수"},201)
    call('post','/api/trips/join',{"share_code":trip['share_code'],"user_id":2,"nickname":"철수2"},409)
    call('post','/api/trips/join',{"share_code":"ZZZZZZ","nickname":"a"},404)
    call('post','/api/trips/join',{"nickname":"a"},400)
    s,j=call('post',f'/api/trips/{tid}/members',{"nickname":"영희"},201); assert j['member']['user_id'] is None
    call('post',f'/api/trips/{tid}/members',{"nickname":"영희"},409)
    call('post','/api/trips/999/members',{"nickname":"a"},404)
    s,j=call('get',f'/api/trips/{tid}/members',expect=200); m=[x['id'] for x in j['members']]; assert len(m)==3 and j['members'][2]['is_guest']
    s,j=call('get',f'/api/trips/{tid}',expect=200); assert j['trip']['member_count']==3
    call('get','/api/trips/999',expect=404)
    s,j=call('get','/api/users/1/trips',expect=200); assert j['trips'][0]['my_member_id']==owner['id']

    # expenses
    e1={"expense":{"payer_member_id":m[0],"title":"라멘","category":"식비","amount":3960,"currency":"JPY","exchange_rate":"9.1","payment_method":"card","spent_at":"2026-11-25 12:30:00"},"split":{"split_type":"equal","member_ids":m}}
    s,j=call('post',f'/api/trips/{tid}/expenses',e1,201)
    assert j['expense']['krw_amount']==36036 and j['expense']['spent_at'].endswith('+09:00'), j['expense']
    assert sorted(x['split_krw_amount'] for x in j['splits'])==[12012]*3 and sum(x['percentage_bp'] for x in j['splits'])==10000
    # default split = all members, USD decimal amount
    s,j=call('post',f'/api/trips/{tid}/expenses',{"expense":{"payer_member_id":m[1],"title":"택시","amount":"12.50","currency":"USD","exchange_rate":1400,"payment_method":"CASH"}},201)
    assert j['expense']['krw_amount']==17500 and j['expense']['amount']=="12.5" and j['expense']['payment_method']=='cash'
    eid2=j['expense']['id']
    # exact mismatch -> 400 and no orphan expense
    before=len(fc.tables['expenses'])
    call('post',f'/api/trips/{tid}/expenses',{"expense":{"payer_member_id":m[0],"title":"x","amount":10000},"split":{"split_type":"exact","splits":[{"member_id":m[0],"split_krw_amount":5000}]}},400)
    assert len(fc.tables['expenses'])==before
    # percentage
    s,j=call('post',f'/api/trips/{tid}/expenses',{"expense":{"payer_member_id":m[2],"title":"숙소","amount":10001,"currency":"KRW"},"split":{"split_type":"percentage","splits":[{"member_id":m[0],"percentage_bp":3333},{"member_id":m[1],"percentage_bp":3333},{"member_id":m[2],"percentage_bp":3334}]}},201)
    assert sum(x['split_krw_amount'] for x in j['splits'])==10001, j['splits']
    eid3=j['expense']['id']
    call('post',f'/api/trips/{tid}/expenses',{"expense":{"payer_member_id":999,"title":"x","amount":1}},400)
    call('post',f'/api/trips/{tid}/expenses',{"expense":{"payer_member_id":m[0],"title":"x","amount":1,"currency":"JPY"}},400)
    call('post',f'/api/trips/{tid}/expenses',{"expense":{"payer_member_id":m[0],"title":"x","amount":3},"split":{"member_ids":[m[0],m[0]]}},400)
    # split insert failure -> compensating delete
    before=len(fc.tables['expenses']); fc.fail_next.add('expense_splits')
    call('post',f'/api/trips/{tid}/expenses',{"expense":{"payer_member_id":m[0],"title":"x","amount":3000}},500)
    assert len(fc.tables['expenses'])==before
    # filters
    s,j=call('get',f'/api/trips/{tid}/expenses?category=식비',expect=200); assert len(j['expenses'])==1
    s,j=call('get',f'/api/trips/{tid}/expenses?limit=1',expect=200); assert len(j['expenses'])==1
    call('get',f'/api/trips/{tid}/expenses?limit=abc',expect=400)
    # update: amount change on equal -> resplit
    s,j=call('patch',f'/api/trips/{tid}/expenses/{eid2}',{"expense":{"amount":"15"}},200)
    assert j['expense']['krw_amount']==21000 and sum(x['split_krw_amount'] for x in j['splits'])==21000
    call('patch',f'/api/trips/{tid}/expenses/{eid3}',{"expense":{"amount":20000}},400)
    s,j=call('patch',f'/api/trips/{tid}/expenses/{eid3}',{"expense":{"amount":20000},"split":{"split_type":"equal","member_ids":[m[0],m[2]]}},200)
    assert [x['split_krw_amount'] for x in j['splits']]==[10000,10000]
    s,j=call('get',f'/api/trips/{tid}/expenses/{eid3}',expect=200)

    # exchanges
    s,j=call('post',f'/api/trips/{tid}/exchanges',{"member_id":m[0],"currency":"jpy","original_krw_amount":91000,"exchanged_amount":10000},201)
    assert j['exchange']['exchange_rate']=="9.1" and j['exchange']['exchange_date']
    call('post',f'/api/trips/{tid}/exchanges',{"member_id":m[0],"currency":"JP","original_krw_amount":1,"exchanged_amount":1},400)
    s,j=call('get',f'/api/trips/{tid}/summary',expect=200); sm=j['summary']

    # settlements
    s,j=call('post',f'/api/trips/{tid}/settle',expect=200); n1=len(j['settlements'])
    s,j=call('post',f'/api/trips/{tid}/settle',expect=200); assert len(fc.tables['settlements'])==n1  # no dup
    s,j=call('get',f'/api/trips/{tid}/balances',expect=200); bal=j['balances']; assert sum(b['net_balance'] for b in bal)==0
    sid=fc.tables['settlements'][0]['id']
    call('patch',f'/api/settlements/{sid}/complete',expect=200)
    call('patch',f'/api/settlements/{sid}/complete',expect=409)
    call('patch','/api/settlements/999/complete',expect=404)
    s,j=call('post',f'/api/trips/{tid}/settle',expect=200)
    assert all(x['status']=='pending' for x in j['settlements']) and len([x for x in fc.tables['settlements'] if x['status']=='completed'])==1
    s,j=call('get',f'/api/trips/{tid}/balances',expect=200); total_out=sum(b['outstanding_balance'] for b in j['balances']); assert total_out==0
    # after completing all pending, re-settle should yield []
    for x in list(fc.tables['settlements']):
        if x['status']=='pending': call('patch',f"/api/settlements/{x['id']}/complete",expect=200)
    s,j=call('post',f'/api/trips/{tid}/settle',expect=200); assert j['settlements']==[]
    call('patch',f'/api/settlements/{sid}/cancel',expect=200)
    s,j=call('get',f'/api/trips/{tid}/settlements?status=completed',expect=200)

    # card events
    ev={"event_id":"e1","source":"rcs","issuer":"현대카드","event_type":"approval","amount":"1,400","merchant":"마트","approval_ref":"A1","received_at":"2026-11-17T10:00:00+09:00"}
    call('post','/api/card-events',ev,201)
    s,j=call('post','/api/card-events',ev,200); assert j['duplicate']
    call('post','/api/card-events',{**ev,"event_id":"e2","source":"push"},201)
    s,j=call('get','/api/card-events/unassigned',expect=200); assert len(j['unassigned_cards'])==1 and j['unassigned_cards'][0]['duplicate_event_ids'], j
    s,j=call('get',f'/api/card-events/unassigned?trip_id={tid}',expect=200); assert len(j['unassigned_cards'])==1
    s,j=call('post',f'/api/trips/{tid}/expenses',{"expense":{"payer_member_id":m[0],"title":"마트","amount":1400},"card_event_id":"e2"},201)
    assert sorted(j['linked_card_event_ids'])==['e1','e2'] and j['expense']['entry_type']=='auto_card'
    ceid=j['expense']['id']
    call('post',f'/api/trips/{tid}/expenses',{"expense":{"payer_member_id":m[0],"title":"마트","amount":1400},"card_event_id":"e1"},409)
    # third channel arrives later -> auto-link
    s,j=call('post','/api/card-events',{**ev,"event_id":"e3","source":"sms"},201); assert j['card_event']['expense_id']==ceid
    s,j=call('get','/api/card-events/unassigned',expect=200); assert j['unassigned_cards']==[]
    call('delete',f'/api/trips/{tid}/expenses/{ceid}',expect=200)
    s,j=call('get','/api/card-events/unassigned',expect=200); assert len(j['unassigned_cards'])==1
    call('delete',f'/api/trips/{tid}/expenses/{ceid}',expect=404)
    call('get','/api/nope',expect=404)
    call('get','/api/health',expect=200)

    # v3: 메타/404/파서 키
    s,j=call('get','/api/meta',expect=200); assert 'equal' in j['meta']['split_types']
    call('get','/api/trips/999/summary',expect=404)
    call('get','/api/trips/999/balances',expect=404)
    settings.parser_api_key = "secret-key"
    call('post','/api/card-events',{"event_id":"k1"},401)
    call('post','/api/card-events',{"event_id":"k1"},401,headers={"X-API-Key":"wrong"})
    call('post','/api/card-events',{"event_id":"k1"},201,headers={"X-API-Key":"secret-key"})
    settings.parser_api_key = None
    s,j=call('post',f'/api/trips/{tid}/settle',expect=200)
    assert all('sender_nickname' in x for x in j['settlements'])


if __name__ == "__main__":
    test_full_flow()
    print("ALL TESTS PASSED")
