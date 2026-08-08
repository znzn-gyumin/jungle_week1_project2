from backend.services.search import SEARCH_POOL

DEFAULT_LIMIT = 25

# 요청 상한은 캐시 풀 크기다. 풀보다 큰 limit 을 허용하면 캐시에 없는 몫이 잘려
# 조용히 모자란 응답이 나간다. 늘리려면 SEARCH_POOL 을 먼저 봐야 한다 - 거기
# 주석에 풀 크기와 캐시 미스 지연의 실측 관계가 있다.
MAX_LIMIT = SEARCH_POOL
