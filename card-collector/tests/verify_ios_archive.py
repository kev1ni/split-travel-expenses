"""Verify our single-segment Shortcuts AEA1 distribution. Requires cryptography and lzfse."""

from datetime import datetime, timezone
import hashlib
import hmac
from pathlib import Path
import plistlib
import struct

import lzfse
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


# SHA-256 of https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
APPLE_ROOT_G3 = "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179"


def require(test, message):
    if not test:
        raise ValueError(message)


def derive(key, label, salt=None):
    return HKDF(hashes.SHA256(), 32, salt, label).derive(key)


def verify_mac(key, data, associated, expected):
    authenticated = associated + data + struct.pack("<Q", len(associated))
    require(hmac.compare_digest(hmac.digest(key, authenticated, "sha256"), expected), "Invalid AEA HMAC")


def workflow_from_aa(raw):
    # The writer creates one directory record (empty path) and one regular file.
    require(raw[:6] == b"AA01\x27\x00" and raw[6:17] == b"TYP1DPATP\x00\x00",
            "Unexpected Apple Archive directory record")
    offset = struct.unpack_from("<H", raw, 4)[0]
    require(raw[offset:offset+4] == b"AA01", "Missing file header")
    header_size = struct.unpack_from("<H", raw, offset+4)[0]
    require(raw[offset+6:offset+31] == b"TYP1FPATP\x0e\x00Shortcut.wflow", "Unexpected filename")
    start = offset + header_size
    require(raw[start-6:start-2] == b"DATA", "Missing workflow size")
    file_size = struct.unpack_from("<H", raw, start-2)[0]
    require(start + file_size == len(raw) and raw[start:start+8] == b"bplist00",
            "Unexpected workflow bounds")
    return plistlib.loads(raw[start:])


def load_signed_workflow(path: Path) -> dict:
    archive = path.read_bytes()
    magic, profile, auth_size = struct.unpack_from("<4sII", archive)
    require((magic, profile) == (b"AEA1", 0), "Expected a public signed archive")
    start = 12 + auth_size
    auth = archive[12:start]
    chain = [x509.load_der_x509_certificate(d) for d in plistlib.loads(auth)["SigningCertificateChain"]]
    require(len(chain) == 3 and chain[-1].fingerprint(hashes.SHA256()).hex() == APPLE_ROOT_G3,
            "Unexpected Apple certificate chain")
    now = datetime.now(timezone.utc)
    for cert, issuer in zip(chain, chain[1:] + chain[-1:]):
        cert.verify_directly_issued_by(issuer)
        require(cert.not_valid_before_utc <= now <= cert.not_valid_after_utc, "Certificate outside validity")
    leaf = chain[0]
    leaf.extensions.get_extension_for_oid(x509.ObjectIdentifier("1.2.840.113635.100.18.1"))
    require(leaf.extensions.get_extension_for_class(x509.KeyUsage).value.digital_signature,
            "Leaf cannot sign")
    public_key = leaf.public_key()
    require(isinstance(public_key.curve, ec.SECP256R1), "Unexpected signing curve")

    signature_slot = archive[start:start+128]
    signature_len = 2 + signature_slot[1]
    require(signature_slot[0] == 0x30 and signature_len <= 72 and not any(signature_slot[signature_len:]),
            "Invalid ECDSA signature field")
    prologue_end = start + 304
    prologue = archive[:start] + bytes(128) + archive[start+128:prologue_end]
    public_key.verify(signature_slot[:signature_len], prologue, ec.ECDSA(hashes.SHA256()))
    ec_point = public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    master = derive(archive[start+128:start+160], b"AEA_AMK" + bytes(4) + ec_point,
                    archive[start+160:start+192])
    root_header = archive[start+224:start+272]
    cluster_mac = archive[start+272:prologue_end]
    verify_mac(derive(master, b"AEA_RHEK"), root_header, cluster_mac + auth, archive[start+192:start+224])
    raw_size, container_size, segment_size, segments, codec, checksum = struct.unpack_from("<QQIIBB", root_header)
    require(container_size == len(archive) and 0 < raw_size <= segment_size <= 1 << 20 and
            segments == 256 and codec == ord("e") and checksum == 2, "Unexpected single-segment layout")
    infos_end = prologue_end + 40 * segments
    infos = archive[prologue_end:infos_end]
    payload_start = infos_end + 32 + 32 * segments
    hmac_table = archive[infos_end:payload_start]
    cluster_key = derive(master, b"AEA_CK" + bytes(4))
    verify_mac(derive(cluster_key, b"AEA_CHEK"), infos, hmac_table, cluster_mac)
    size, packed_size = struct.unpack_from("<II", infos)
    require(size == raw_size and not any(infos[40:]), "Unexpected segment count or size")
    end = payload_start + packed_size
    # The signing service emits one segment and no bytes of trailing AEA padding.
    require(end == len(archive), "Truncated segment or unexpected trailing padding")
    packed = archive[payload_start:end]
    verify_mac(derive(cluster_key, b"AEA_SK" + bytes(4)), packed, b"", hmac_table[32:64])
    raw = lzfse.decompress(packed)
    require(len(raw) == size and hashlib.sha256(raw).digest() == infos[8:40], "Invalid decoded checksum")
    return workflow_from_aa(raw)


if __name__ == "__main__":
    import argparse

    args = argparse.ArgumentParser(description="Compare a single-segment Apple-signed shortcut with its source.")
    args.add_argument("signed", type=Path)
    args.add_argument("source", type=Path)
    options = args.parse_args()
    signed = load_signed_workflow(options.signed)
    original = plistlib.loads(options.source.read_bytes())
    for field in ("WFWorkflowActions", "WFWorkflowImportQuestions", "WFWorkflowTypes", "WFWorkflowInputContentItemClasses"):
        require(signed[field] == original[field], f"{field} differs")
    print(f"PASS: Apple certificate chain, ECDSA, archive/segment integrity, {len(signed['WFWorkflowActions'])} actions")
