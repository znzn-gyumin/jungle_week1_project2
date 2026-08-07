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

    const melonChart = [
        { title: 'LOVE ATTACK', artist: 'RESCENE (리센느)', album: 'SCENEDROME' },
        { title: '숨쉬기', artist: '아이오아이 (I.O.I)', album: 'I.O.I 3rd MINI ALBUM' },
        { title: 'REDDER', artist: 'CORTIS (코르티스)', album: 'GREEN:GREEN' },
        { title: 'LEMONADE', artist: 'aespa', album: 'LEMONADE : The 2nd Album' },
        { title: "It's Me", artist: '마미손', album: 'MAMIHLAPINATAPAI' },
        { title: 'Pretty Girl', artist: 'RESCENE (리센느)', album: 'Pretty Girl - Special Single' },
        { title: '만찬가', artist: '태연 (TAEYEON)', album: 'I-POP REMAKE Vol.1' },
        { title: '캐치 캐치', artist: 'YENA (최예나)', album: 'LOVE CATCHER' },
        { title: 'Deja Vu', artist: 'RESCENE (리센느)', album: 'Dearest' },
        { title: 'Drowning', artist: 'WOODZ', album: 'OO-LI' },
        { title: 'RUDE!', artist: 'Hearts2Hearts (하츠투하츠)', album: 'RUDE!' },
        { title: 'BAD', artist: '김태연', album: 'GOLDEN HOUR : Part.5' },
        { title: '소문의 너와', artist: 'ASHU (애슈)', album: '계화' },
        { title: '사랑하게 될 거야', artist: '한로로', album: '이상비행' },
        { title: '여름아 부탁해', artist: '볼빨간사춘기', album: '여름아 부탁해' },
        { title: 'Lemon Tang', artist: 'Hearts2Hearts (하츠투하츠)', album: 'Lemon Tang : The 2nd Album' },
        { title: 'Good Goodbye', artist: '화사 (HWASA)', album: 'Good Goodbye' },
        { title: 'ㅇㅁㅇ', artist: '문초은', album: '자몽청구존립' },
        { title: '기쁨, 슬픔, 아름다운 마음', artist: 'ASHU (애슈)', album: '계화' },
        { title: '타임캡슐', artist: '다비치', album: '타임캡슐' },
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

    const loadLatestAlbums = () => Promise.all(latestAlbums.map(async (fixed, index) => {
        const found = await searchOne(fixed.query, 'album').catch(() => null);
        return { ...found, ...fixed, id: found?.id || `fixed-${index}`, thumbnailUrl: found?.thumbnailUrl || '' };
    }));

    const loadMelonChart = () => Promise.all(melonChart.map(async (fixed, index) => {
        const found = await searchOne(`${fixed.title} ${fixed.artist}`, 'track').catch(() => null);
        return { ...found, ...fixed, id: found?.id || `melon-${index + 1}`, thumbnailUrl: found?.thumbnailUrl || '', playUrl: found?.playUrl || '', source: found?.source || 'itunes' };
    }));

    const loadLatestMusic = () => Promise.all(latestMusic.map(async (fixed, index) => {
        const found = await searchOne(`${fixed.title} ${fixed.artist}`, 'track').catch(() => null);
        return { ...found, ...fixed, id: found?.id || `latest-${index + 1}`, thumbnailUrl: found?.thumbnailUrl || '', playUrl: found?.playUrl || '', source: found?.source || 'itunes' };
    }));

    window.FlowbeeFixedCatalog = { latestAlbums, latestMusic, melonChart, loadLatestAlbums, loadLatestMusic, loadMelonChart };
}());
