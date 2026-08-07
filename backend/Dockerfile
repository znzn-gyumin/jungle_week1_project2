# 빌드 컨텍스트는 저장소 루트다 - requirements.txt 가 루트에 있다.
#   docker build -f backend/Dockerfile .
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# requirements 만 먼저 복사한다. 코드가 바뀌어도 이 레이어는 캐시에 남는다.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

COPY backend ./backend

# 컨테이너 안에서 root 로 돌 이유가 없다. 코드는 읽기만 하고
# PYTHONDONTWRITEBYTECODE 라 __pycache__ 도 안 쓴다.
RUN useradd --create-home --uid 10001 flowbee
USER flowbee

EXPOSE 8000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["python", "-m", "backend"]
