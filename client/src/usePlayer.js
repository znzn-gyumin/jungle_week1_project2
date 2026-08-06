import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api.js'

/** SDK 스크립트는 index.html 에서 로드된다. 이미 준비됐으면 즉시 resolve. */
function sdkReady() {
  return new Promise((resolve) => {
    if (window.Spotify) return resolve(window.Spotify)
    window.onSpotifyWebPlaybackSDKReady = () => resolve(window.Spotify)
  })
}

/**
 * Player 인스턴스는 앱 전체에서 하나여야 한다.
 * StrictMode 가 effect 를 두 번 실행해도 중복 연결되지 않도록 모듈 스코프에 둔다.
 */
let singleton = null

function connectPlayer(handlers) {
  if (singleton) {
    singleton.then((p) => handlers.rebind(p))
    return singleton
  }

  singleton = sdkReady().then(async (Spotify) => {
    const player = new Spotify.Player({
      name: 'Jungle Spotify Clone',
      volume: 0.5,
      getOAuthToken: (cb) => {
        api.token()
          .then(({ accessToken }) => cb(accessToken))
          .catch((err) => handlers.onError(`토큰 발급 실패: ${err.message}`))
      },
    })

    handlers.rebind(player)
    const connected = await player.connect()
    if (!connected) handlers.onError('플레이어 연결 실패 (브라우저가 EME/DRM 미지원일 수 있음)')
    return player
  })

  return singleton
}

export function usePlayer(enabled) {
  const [deviceId, setDeviceId] = useState(null)
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)
  const playerRef = useRef(null)

  useEffect(() => {
    if (!enabled) return
    let alive = true

    connectPlayer({
      onError: (msg) => alive && setError(msg),
      rebind: (player) => {
        playerRef.current = player
        // 같은 이벤트에 리스너가 중복 등록되지 않도록 먼저 해제한다.
        for (const ev of ['ready', 'not_ready', 'player_state_changed']) player.removeListener(ev)

        player.addListener('ready', ({ device_id }) => alive && setDeviceId(device_id))
        player.addListener('not_ready', () => alive && setDeviceId(null))
        player.addListener('player_state_changed', (s) => alive && setState(s))

        for (const ev of ['initialization_error', 'authentication_error', 'account_error', 'playback_error']) {
          player.removeListener(ev)
          player.addListener(ev, ({ message }) => {
            if (!alive) return
            setError(
              ev === 'account_error'
                ? 'Spotify Premium 계정이 아닙니다. Web Playback SDK 재생은 Premium 전용입니다.'
                : `${ev}: ${message}`,
            )
          })
        }
      },
    })

    return () => {
      alive = false
    }
  }, [enabled])

  /** SDK 는 position 을 이벤트로만 준다. 재생 중에는 로컬에서 보간한다. */
  const [tick, setTick] = useState(0)
  useEffect(() => {
    // 새 state 이벤트가 곧 새 기준점이다. 보간 카운터를 리셋한다.
    setTick(0)
    if (!state || state.paused) return
    const id = setInterval(() => setTick((t) => t + 1), 500)
    return () => clearInterval(id)
  }, [state])

  const position = state
    ? Math.min(state.position + (state.paused ? 0 : tick * 500), state.duration)
    : 0

  /**
   * 재생 명령은 서버(REST API)에서 나가므로 브라우저에는 사용자 제스처가 없다.
   * 그러면 autoplay 정책이 SDK 의 audio 엘리먼트를 막아 소리가 안 난다.
   * 클릭 핸들러 안에서 이걸 먼저 불러 오디오를 해제해야 한다.
   */
  const activate = useCallback(async () => {
    const player = playerRef.current
    if (!player?.activateElement) return
    try {
      await player.activateElement()
    } catch (err) {
      setError(`오디오 활성화 실패: ${err.message}`)
    }
  }, [])

  return {
    deviceId,
    state,
    position,
    error,
    activate,
    clearError: () => setError(null),
    player: playerRef.current,
  }
}
