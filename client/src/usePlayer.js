import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api.js'

function sdkReady() {
  return new Promise((resolve) => {
    if (window.Spotify) return resolve(window.Spotify)
    window.onSpotifyWebPlaybackSDKReady = () => resolve(window.Spotify)
  })
}

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

  const [tick, setTick] = useState(0)
  useEffect(() => {
    setTick(0)
    if (!state || state.paused) return
    const id = setInterval(() => setTick((t) => t + 1), 500)
    return () => clearInterval(id)
  }, [state])

  const position = state
    ? Math.min(state.position + (state.paused ? 0 : tick * 500), state.duration)
    : 0

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
