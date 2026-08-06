import { useEffect, useRef } from 'react'

export function PlayerBar({ track, onClose }) {
  const audioRef = useRef(null)

  useEffect(() => {
    if (track.source === 'itunes' && audioRef.current) {
      audioRef.current.play().catch(() => {})
    }
  }, [track])

  return (
    <div className="playerBar">
      <div className="nowPlaying">
        <strong>{track.title}</strong>
        <span className="muted">{track.artist}</span>
      </div>

      {track.source === 'itunes' ? (
        track.playUrl ? (
          <>
            <audio ref={audioRef} src={track.playUrl} controls autoPlay />
            <span className="muted hint">30초 미리듣기</span>
          </>
        ) : (
          <p className="muted">미리듣기를 제공하지 않는 곡입니다.</p>
        )
      ) : (
        <iframe
          title={track.title}
          src={`${track.playUrl}?autoplay=1`}
          allow="autoplay; encrypted-media"
          frameBorder="0"
        />
      )}

      <button className="close" onClick={onClose} aria-label="닫기">
        ×
      </button>
    </div>
  )
}
