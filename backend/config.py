import os

from dotenv import load_dotenv

load_dotenv()

REQUIRED = ("SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET")

CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET", "")
REDIRECT_URI = os.getenv("SPOTIFY_REDIRECT_URI", "http://127.0.0.1:8000/api/auth/callback")
CLIENT_ORIGIN = os.getenv("CLIENT_ORIGIN", "http://127.0.0.1:5173")
SERVER_PORT = int(os.getenv("SERVER_PORT", "8000"))

# Web Playback SDK 는 streaming + user-read-email + user-read-private 가 반드시 필요하다.
SCOPES = " ".join(
    (
        "streaming",
        "user-read-email",
        "user-read-private",
        "user-read-playback-state",
        "user-modify-playback-state",
    )
)


def missing_config() -> list[str]:
    return [key for key in REQUIRED if not os.getenv(key)]
