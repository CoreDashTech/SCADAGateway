"""ตัวอย่างดึงข้อมูลจาก REST API ของสถานีสูบน้ำ (CoreDash HydroLink) ด้วย Python
   pip install requests cryptography
   ตั้งค่า:  export HYDROLINK_URL=https://scada.example.com  HYDROLINK_KEY=cdk_...
   ถ้าใช้การเข้ารหัส: export CD_AES_KEY=...  แล้วรัน  python client.py aes-256-gcm
"""
import base64, hashlib, hmac, json, os, sys
import requests
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding

URL = os.environ.get("HYDROLINK_URL", "http://localhost:8080")
KEY = os.environ.get("HYDROLINK_KEY", "demo-key")
b64 = base64.b64decode

def decrypt(env):
    iv, data = b64(env["iv"]), b64(env["data"])
    if env["enc"] == "aes-256-gcm":
        key = bytes.fromhex(os.environ["CD_AES_KEY"])
        return json.loads(AESGCM(key).decrypt(iv, data + b64(env["tag"]), None))
    if env["enc"] == "3des-cbc-hmac-sha256":
        mac = hmac.new(bytes.fromhex(os.environ["CD_MAC_KEY"]), iv + data, hashlib.sha256).digest()
        if not hmac.compare_digest(mac, b64(env["mac"])):
            raise ValueError("MAC ไม่ตรง: ข้อมูลถูกแก้ไขหรือกุญแจผิด")
        # 3DES อยู่ใน cryptography.hazmat.decrepit ตั้งแต่ v43 (ยังใช้ได้แต่ถือว่าเลิกแนะนำ)
        try:
            from cryptography.hazmat.decrepit.ciphers.algorithms import TripleDES
        except ImportError:
            TripleDES = algorithms.TripleDES
        d = Cipher(TripleDES(bytes.fromhex(os.environ["CD_3DES_KEY"])), modes.CBC(iv)).decryptor()
        raw = d.update(data) + d.finalize()
        u = padding.PKCS7(64).unpadder()
        return json.loads(u.update(raw) + u.finalize())
    return env

def get(path, encrypt=None, **params):
    h = {"X-API-Key": KEY}
    if encrypt:
        h["X-CD-Encrypt"] = encrypt          # "aes-256-gcm"
    r = requests.get(URL + path, headers=h, params=params, timeout=10)
    r.raise_for_status()
    body = r.json()
    return decrypt(body) if "enc" in body else body

if __name__ == "__main__":
    enc = sys.argv[1] if len(sys.argv) > 1 else None
    latest = get("/api/v1/latest", enc, points="system.pressure,FT-01.flow,PM-01.kw,P-01.run,P-02.run")
    for p in latest["data"]:
        print(f'{p["point"]:<18} {p["value"]!s:>10} {p["unit"]:<5} {p["quality"]}')
