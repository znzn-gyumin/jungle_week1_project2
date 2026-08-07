(function () {
  const themePool = [
    { slug: 'early-summer-night', title: '초여름 밤, 괜히 천천히 걷고 싶어지는 인디음악 플레이리스트', description: '선선한 초여름 밤공기와 느린 걸음에 어울리는 인디 음악.', query: 'Korean indie summer night', tags: ['#초여름', '#산책', '#인디'] },
    { slug: 'hangang-breeze', title: '한강에서 듣고 싶은 노래 | 산뜻한 인디음악 플레이리스트', description: '강바람을 맞으며 가볍게 듣기 좋은 산뜻한 노래.', query: 'Korean indie fresh acoustic', tags: ['#한강', '#피크닉', '#산뜻함'] },
    { slug: 'rainy-window', title: '비 오는 창가, 커피가 식는 줄도 모르고 듣는 노래', description: '빗소리와 조용한 창가에 자연스럽게 스며드는 음악.', query: 'Korean indie rainy day', tags: ['#비오는날', '#카페', '#감성'] },
    { slug: 'midnight-room', title: '새벽 두 시, 방 안의 불을 낮추고 듣는 알앤비', description: '하루가 끝난 뒤 혼자 남은 시간에 어울리는 부드러운 R&B.', query: 'Korean R&B midnight chill', tags: ['#새벽', '#R&B', '#혼자'] },
    { slug: 'weekend-drive', title: '창문 열고 달리는 주말 오후 드라이브 플레이리스트', description: '막히지 않는 도로와 맑은 하늘을 닮은 경쾌한 음악.', query: 'city pop weekend drive', tags: ['#드라이브', '#주말', '#시티팝'] },
    { slug: 'slow-sunday', title: '아무 약속 없는 일요일, 느긋하게 시작하는 음악', description: '늦잠과 브런치 사이를 편안하게 채워 주는 노래.', query: 'indie sunday morning chill', tags: ['#일요일', '#브런치', '#휴식'] },
    { slug: 'sunset-rooftop', title: '노을 지는 옥상, 하루를 천천히 정리하는 플레이리스트', description: '붉어진 하늘 아래에서 차분하게 하루를 마무리하는 음악.', query: 'indie sunset rooftop chill', tags: ['#노을', '#옥상', '#저녁'] },
    { slug: 'first-train', title: '첫차가 다니기 시작할 때 듣는 몽환적인 노래', description: '아직 잠들지 못한 새벽과 텅 빈 거리의 분위기를 담은 음악.', query: 'dream pop dawn night', tags: ['#첫차', '#몽환', '#새벽'] },
    { slug: 'forest-camping', title: '숲속 캠핑장에서 불멍하며 듣고 싶은 어쿠스틱', description: '장작 타는 소리와 풀벌레 소리에 잘 어울리는 편안한 노래.', query: 'acoustic folk campfire indie', tags: ['#캠핑', '#불멍', '#어쿠스틱'] },
    { slug: 'city-night-bus', title: '늦은 밤 버스 창가에 기대어 듣는 시티팝', description: '도시의 불빛이 길게 흘러가는 밤 버스 안의 음악.', query: 'city pop night bus', tags: ['#밤버스', '#도시', '#시티팝'] },
    { slug: 'spring-bicycle', title: '봄바람 맞으며 자전거 탈 때 듣는 기분 좋은 노래', description: '가벼운 페달과 따뜻한 바람을 닮은 밝은 음악.', query: 'indie pop spring bicycle happy', tags: ['#봄', '#자전거', '#기분전환'] },
    { slug: 'quiet-bookstore', title: '조용한 서점 구석에서 오래 머물고 싶은 음악', description: '책장을 넘기는 작은 소리 사이로 흐르는 잔잔한 음악.', query: 'quiet indie bookstore acoustic', tags: ['#서점', '#독서', '#차분함'] },
  ];

  const cacheKey = (slug) => `flowbee:recommended:${slug}`;
  const sourceKey = (slug) => `flowbee:recommended:source:${slug}`;
  const selectionKey = 'flowbee:recommended:selection';
  const generationKey = 'flowbee:recommended:generation';

  const randomSelection = (excludedSlugs = []) => themePool
    .filter((item) => !excludedSlugs.includes(item.slug))
    .sort(() => Math.random() - .5)
    .slice(0, 6);
  let savedSlugs = null;
  try { savedSlugs = JSON.parse(sessionStorage.getItem(selectionKey) || 'null'); } catch { sessionStorage.removeItem(selectionKey); }
  let definitions = Array.isArray(savedSlugs)
    ? savedSlugs.map((slug) => themePool.find((item) => item.slug === slug)).filter(Boolean).slice(0, 6)
    : randomSelection();
  if (definitions.length !== 6) definitions = randomSelection();
  sessionStorage.setItem(selectionKey, JSON.stringify(definitions.map((item) => item.slug)));
  if (!sessionStorage.getItem(generationKey)) sessionStorage.setItem(generationKey, String(Date.now()));

  const seededShuffle = (items, seedText) => {
    let seed = [...seedText].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 2166136261);
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const target = seed % (index + 1);
      [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
    }
    return shuffled;
  };

  const load = async (definition) => {
    const cached = sessionStorage.getItem(cacheKey(definition.slug));
    if (cached) {
      try { return JSON.parse(cached); } catch { sessionStorage.removeItem(cacheKey(definition.slug)); }
    }
    let sourceTracks = null;
    try { sourceTracks = JSON.parse(sessionStorage.getItem(sourceKey(definition.slug)) || 'null'); } catch { sessionStorage.removeItem(sourceKey(definition.slug)); }
    if (!Array.isArray(sourceTracks) || !sourceTracks.length) {
      const params = new URLSearchParams({ q: definition.query, type: 'track', source: 'itunes', limit: '40' });
      const response = await fetch(`/api/search?${params}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '추천곡을 불러오지 못했습니다.');
      sourceTracks = data.tracks || [];
      sessionStorage.setItem(sourceKey(definition.slug), JSON.stringify(sourceTracks));
    }
    const generation = sessionStorage.getItem(generationKey) || '';
    const tracks = seededShuffle(sourceTracks, `${definition.slug}:${generation}`).slice(0, 15);
    const playlist = { ...definition, tracks, coverUrl: tracks[0]?.thumbnailUrl || '' };
    sessionStorage.setItem(cacheKey(definition.slug), JSON.stringify(playlist));
    return playlist;
  };

  const reroll = () => {
    themePool.forEach((definition) => sessionStorage.removeItem(cacheKey(definition.slug)));
    const currentSlugs = definitions.map((item) => item.slug);
    definitions = randomSelection(currentSlugs);
    if (definitions.length !== 6) definitions = randomSelection();
    sessionStorage.setItem(selectionKey, JSON.stringify(definitions.map((item) => item.slug)));
    sessionStorage.setItem(generationKey, String(Date.now()));
    return definitions;
  };

  window.FlowbeePlaylists = {
    get definitions() { return definitions; },
    find: (slug) => themePool.find((item) => item.slug === slug),
    load,
    reroll,
  };
}());
