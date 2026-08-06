import hashlib
import hmac
import secrets

SCHEME = "scrypt"
N = 2**14
R = 8
P = 1
DKLEN = 32
SALT_BYTES = 16


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(SALT_BYTES)
    dk = hashlib.scrypt(password.encode(), salt=salt, n=N, r=R, p=P, dklen=DKLEN)
    return f"{SCHEME}${N}${R}${P}${salt.hex()}${dk.hex()}"


def dummy_hash() -> str:
    """존재하지 않는 계정에도 같은 비용의 검증을 돌리기 위한 가짜 해시.

    유저를 못 찾았다고 verify_password 를 건너뛰면 응답 시간(scrypt 수십 ms)만
    보고 이메일 가입 여부를 알아낼 수 있다.
    """
    return _DUMMY


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt_hex, hash_hex = stored.split("$")
        if scheme != SCHEME:
            return False
        expected = bytes.fromhex(hash_hex)
        dk = hashlib.scrypt(
            password.encode(),
            salt=bytes.fromhex(salt_hex),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(expected),
        )
    except ValueError:
        return False
    return hmac.compare_digest(dk, expected)


# import 시점에 한 번만 계산한다. 아무도 모르는 비밀번호라 절대 맞지 않는다.
_DUMMY = hash_password(secrets.token_hex(32))
