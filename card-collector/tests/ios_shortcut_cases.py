"""Windows system ICU used to exercise native Shortcuts regular expressions."""

import ctypes as c


class IcuRegex:
    def __init__(self, pattern):
        self.icu = c.CDLL("icu.dll")
        status = c.POINTER(c.c_int32)
        for name, args, result in (
            ("uregex_open", [c.c_void_p, c.c_int32, c.c_uint32, c.c_void_p, status], c.c_void_p),
            ("uregex_setText", [c.c_void_p, c.c_void_p, c.c_int32, status], None),
            ("uregex_find", [c.c_void_p, c.c_int32, status], c.c_int8),
            ("uregex_groupCount", [c.c_void_p, status], c.c_int32),
            ("uregex_start", [c.c_void_p, c.c_int32, status], c.c_int32),
            ("uregex_end", [c.c_void_p, c.c_int32, status], c.c_int32),
            ("uregex_close", [c.c_void_p], None),
        ):
            fn = getattr(self.icu, name)
            fn.argtypes = args
            fn.restype = result
        p = pattern.encode("utf-16-le")
        self.expr = self.call("uregex_open", p, len(p) // 2, 0, None)

    def call(self, name, *args):
        err = c.c_int32()
        value = getattr(self.icu, name)(*args, c.byref(err))
        if err.value > 0:
            raise ValueError(f"{name} returned ICU error {err.value}")
        return value

    def match(self, text):
        data = text.encode("utf-16-le")
        self.call("uregex_setText", self.expr, data, len(data) // 2)
        if not self.call("uregex_find", self.expr, 0):
            return []
        groups = []
        for index in range(self.call("uregex_groupCount", self.expr) + 1):
            lo = self.call("uregex_start", self.expr, index)
            hi = self.call("uregex_end", self.expr, index)
            groups.append(data[lo * 2 : hi * 2].decode("utf-16-le"))
        return groups

    def close(self):
        self.icu.uregex_close(self.expr)
