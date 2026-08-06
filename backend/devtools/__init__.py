"""
배포 전 삭제 대상. 제품 코드는 이 패키지를 임포트하지 않으므로 통째로 지워도 된다.

남은 것은 `integration_test.py` 하나이고, `backend/schema.sql` 을 검증하는 유일한
수단이다. 이 디렉터리를 지우기 전에 그 파일을 옮길 곳을 먼저 정할 것.
자세한 내용은 `docs/junho_dev/05-verification.md`.

앱에 라우터를 꽂던 `install_devtools` 와 `DEV_TOOLS` 설정은 사라졌다. 곡·앨범을
공급하던 `/api/catalog/*` 를 제품 코드의 `/api/search`, `/api/albums`,
`/api/tracks` 가 대체했기 때문에 켜고 끌 dev 전용 라우트가 없다.
"""
