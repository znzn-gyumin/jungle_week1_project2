#!/bin/sh
# 이 파일은 반드시 LF 줄바꿈이어야 한다. 윈도우에서 CRLF 로 체크아웃되면
# 컨테이너가 "exec /usr/local/bin/docker-entrypoint.sh: no such file or directory"
# 로 죽는다. 루트의 .gitattributes 가 이걸 강제한다.
set -e

# .env 는 호스트 기준으로 쓰여 있다. 컨테이너 안에서 localhost 는 컨테이너 자신이라
# compose 의 postgres 서비스로 돌려준다. 포트도 컨테이너 내부 포트(5432)로 맞춘다 -
# .env 의 POSTGRES_PORT 는 호스트에 공개하는 포트라 다를 수 있다.
LOCAL_DB=0
case "${POSTGRES_HOST:-localhost}" in
  localhost | 127.0.0.1 | ::1 | "" | postgres)
    POSTGRES_HOST=postgres
    POSTGRES_PORT=5432
    export POSTGRES_HOST POSTGRES_PORT
    LOCAL_DB=1
    ;;
esac

# 마이그레이션은 compose 가 소유한 로컬 DB 에만 건다. 공유 개발 DB 를 가리키고 있으면
# 팀 전체가 쓰는 스키마라 컨테이너가 멋대로 올리면 안 된다.
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  if [ "$LOCAL_DB" = "1" ]; then
    echo "alembic upgrade head -> $POSTGRES_HOST:$POSTGRES_PORT/${POSTGRES_DB:-flowbee}"
    alembic -c backend/alembic.ini upgrade head
  else
    echo "POSTGRES_HOST=$POSTGRES_HOST 는 원격 DB - 마이그레이션 건너뜀"
  fi
fi

exec "$@"
