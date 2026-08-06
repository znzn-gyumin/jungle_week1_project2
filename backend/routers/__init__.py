from backend.routers.likes import router as likes_router
from backend.routers.playlists import router as playlists_router
from backend.routers.users import router as users_router

__all__ = ["users_router", "playlists_router", "likes_router"]
