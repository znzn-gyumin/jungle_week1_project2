(function () {
    const latestAlbums = [
        { name: 'THIS & THAT', artist: 'Stray Kids', query: 'Stray Kids THIS & THAT' },
        { name: 'bad pieces', artist: 'wave to earth', query: 'wave to earth bad pieces' },
        { name: '<Hyper-Ego>', artist: 'ARTMS', query: 'ARTMS Hyper Ego' },
        { name: 'WAYF BOYS DO', artist: 'WAYF BOYS', query: 'WAYF BOYS DO' },
        { name: 'Too Much', artist: '던 (DAWN)', query: 'DAWN Too Much' },
        { name: 'Someday', artist: '에릭남 (Eric Nam)', query: 'Eric Nam Someday' },
        { name: '예쁘다 <산울림 50주년 기념 프로젝트>', artist: '맥거핀 (MGFF)', query: '맥거핀 예쁘다 산울림' },
        { name: '미스트롯 : 포유 PART13', artist: '허찬미, 김나희', query: '미스트롯 포유 PART13 허찬미 김나희' },
    ];

    const latestMusic = [
        { title: 'This & That', artist: 'Stray Kids (스트레이 키즈)', album: 'THIS & THAT' },
        { title: 'courage', artist: 'wave to earth', album: 'bad pieces' },
        { title: 'Blue Blood', artist: 'ARTMS (아르테미스)', album: '<Hyper-Ego>' },
        { title: 'WAYF BOYS DO', artist: 'WAYF BOYS', album: 'WAYF BOYS DO' },
        { title: 'Too Much', artist: '던 (DAWN)', album: 'Too Much' },
        { title: 'Someday', artist: '에릭남 (Eric Nam)', album: 'Someday' },
        { title: '예쁘다', artist: '맥거핀 (MGFF)', album: '예쁘다 <산울림 50주년 기념 프로젝트>' },
        { title: '꽃나비', artist: '허찬미, 김나희', album: '미스트롯 : 포유 PART13' },
        { title: 'LA LA LA LUNE', artist: 'JUNHEE', album: 'LOVE METHOD' },
        { title: 'not my spotify', artist: '다비 (DAVII)', album: 'not my spotify' },
        { title: 'Imagine', artist: '아거 (AGER)', album: 'Imagine' },
        { title: '미쳤다고 (Feat. V.E.T, TaeB2)', artist: 'TmIm', album: '미쳤다고' },
        { title: 'palm tree (feat. Summer Soul)', artist: '언텔 (untell)', album: 'palm tree / a major' },
        { title: 'Feel Alive (Feat. 프로미)', artist: '세은하', album: 'OUR YOUTH' },
        { title: '만약에', artist: '한태 (브라더스)', album: '만약에' },
        { title: '차마 하지 못한 말', artist: '재경', album: '차마 하지 못한 말' },
        { title: '완벽한 청춘은 없다', artist: '다인 (DAIN)', album: '완벽한 청춘은 없다' },
        { title: 'Watermelon Days', artist: 'J.Fla', album: 'Watermelon Days' },
        { title: '항상성 붕괴', artist: 'dam, 전예찬', album: '애니메이션 OST' },
        { title: '아름다운 사랑 속에', artist: '리아 (Lydia)', album: '아름다운 사랑 속에' },
    ];

    const searchOne = async (query, type) => {
        const params = new URLSearchParams({ q: query, type, source: 'itunes', limit: '8' });
        const response = await fetch(`/api/search?${params}`);
        if (!response.ok) return null;
        const data = await response.json();
        return type === 'album' ? data.albums?.[0] : data.tracks?.[0];
    };

    // 검색이 빗나간 항목은 진짜 id 가 없어서 담기도 앨범 이동도 안 되는 껍데기다. 가짜 id 를 붙이지 말고 뺀다.
    const resolveAll = async (items, resolve) => {
        const resolved = (await Promise.all(items.map(resolve))).filter(Boolean);
        if (!resolved.length) throw new Error('음원 정보를 불러오지 못했어요.');
        return resolved;
    };

    const findFixedAlbum = async (fixed) => {
        const found = await searchOne(fixed.query, 'album').catch(() => null);
        return found && { ...found, ...fixed };
    };

    const findFixedTrack = async (fixed) => {
        const found = await searchOne(`${fixed.title} ${fixed.artist}`, 'track').catch(() => null);
        return found && { ...found, ...fixed };
    };

    // 목록이 고정이라 결과도 고정이다. 캐시하지 않으면 화면에 들어올 때마다
    // /api/search 를 항목 수만큼(20/20/8회) 다시 쏜다. withCache 는 3일 뒤 만료된다.
    const loadLatestAlbums = () => withCache('flowbee_fixed_albums_v1', () => resolveAll(latestAlbums, findFixedAlbum));
    const loadLatestMusic = () => withCache('flowbee_fixed_latest_v1', () => resolveAll(latestMusic, findFixedTrack));

    window.FlowbeeFixedCatalog = { latestAlbums, latestMusic, loadLatestAlbums, loadLatestMusic };
}());
