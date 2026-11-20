"""
테스트용 가짜(in-memory) Supabase 클라이언트.
실제 DB 없이 API 전체 흐름을 검증할 때 사용합니다. (supabase-py의 table().select().eq()... 형태 일부만 흉내)
"""
import copy, itertools
class Res:
    def __init__(self, data, count=None): self.data=data; self.count=count

class Query:
    def __init__(self, db, table):
        self.db=db; self.table=table; self.op='select'; self.filters=[]; self.payload=None
        self._order=None; self._limit=None; self._range=None; self._neg=False; self._count=None
    def select(self, cols="*", count=None): self.op='select'; self._count=count; return self
    def insert(self, payload): self.op='insert'; self.payload=payload; return self
    def update(self, payload): self.op='update'; self.payload=payload; return self
    def delete(self): self.op='delete'; return self
    @property
    def not_(self): self._neg=True; return self
    def _add(self, f):
        if self._neg:
            g=f; f=lambda r: not g(r); self._neg=False
        self.filters.append(f); return self
    def eq(self,c,v): return self._add(lambda r: r.get(c)==v)
    def in_(self,c,vs): vs=list(vs); return self._add(lambda r: r.get(c) in vs)
    def is_(self,c,v): assert v=="null"; return self._add(lambda r: r.get(c) is None)
    def gte(self,c,v): return self._add(lambda r: r.get(c) is not None and str(r.get(c))>=v)
    def lte(self,c,v): return self._add(lambda r: r.get(c) is not None and str(r.get(c))<=v)
    def or_(self, expr):
        conds=[]
        for part in expr.split(","):
            col,op,val=part.split(".",2)
            if op=="eq": conds.append(lambda r,col=col,val=val: str(r.get(col))==val)
            elif op=="is": conds.append(lambda r,col=col: r.get(col) is None)
        return self._add(lambda r: any(c(r) for c in conds))
    def order(self,c,desc=False): self._order=(c,desc); return self
    def limit(self,n): self._limit=n; return self
    def range(self,a,b): self._range=(a,b); return self
    def _rows(self):
        return [r for r in self.db.tables.setdefault(self.table,[]) if all(f(r) for f in self.filters)]
    def execute(self):
        t=self.db.tables.setdefault(self.table,[])
        if self.op=='select':
            rows=[copy.deepcopy(r) for r in self._rows()]
            if self._order:
                c,d=self._order; rows.sort(key=lambda r:(r.get(c) is None, str(r.get(c)) if not isinstance(r.get(c),(int,float)) else r.get(c)), reverse=d)
            if self._range: rows=rows[self._range[0]:self._range[1]+1]
            if self._limit is not None: rows=rows[:self._limit]
            return Res(rows, len(rows) if self._count else None)
        if self.op=='insert':
            items=self.payload if isinstance(self.payload,list) else [self.payload]
            out=[]
            for it in items:
                row=dict(it)
                self.db.check(self.table,row)
                if self.table!='card_events': row['id']=next(self.db.seq[self.table])
                t.append(row); out.append(copy.deepcopy(row))
            return Res(out)
        if self.op=='update':
            rows=self._rows()
            for r in rows: r.update(self.payload)
            return Res([copy.deepcopy(r) for r in rows])
        if self.op=='delete':
            rows=self._rows()
            for r in rows: t.remove(r)
            if self.table=='expenses':
                ids={r['id'] for r in rows}
                self.db.tables['expense_splits']=[s for s in self.db.tables.get('expense_splits',[]) if s['expense_id'] not in ids]
            if self.table=='trips':
                ids={r['id'] for r in rows}
                self.db.tables['trip_members']=[s for s in self.db.tables.get('trip_members',[]) if s['trip_id'] not in ids]
            return Res([copy.deepcopy(r) for r in rows])

class FakeClient:
    def __init__(self):
        self.tables={}; self.seq={}
        self.fail_next=set()
    def check(self, table, row):
        self.seq.setdefault(table, itertools.count(1))
        if table in self.fail_next:
            self.fail_next.discard(table); raise RuntimeError("simulated DB failure")
        if table=='settlements':
            assert row['status'] in ('pending','completed'); assert row['amount']>0
        if table=='expenses':
            assert row['entry_type'] in ('manual','auto_card','correction','cancellation')
            assert row['split_type'] in ('equal','exact','percentage')
    def table(self, name):
        self.seq.setdefault(name, itertools.count(1))
        return Query(self, name)
