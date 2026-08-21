import { useEffect, useRef, useState } from "react";

interface AudioButtonProps {
  src: string;
}

export function AudioButton({ src }: AudioButtonProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setIsPlaying(false);
    setFailed(false);
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, [src]);

  const togglePlayback = async () => {
    if (failed) return;

    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      return;
    }

    const audio = new Audio(src);
    audio.preload = "none";
    audio.onended = () => setIsPlaying(false);
    audio.onerror = () => {
      setIsPlaying(false);
      setFailed(true);
    };
    audioRef.current = audio;

    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
      setFailed(true);
    }
  };

  const label = failed ? "재생할 수 없어요" : isPlaying ? "재생 중" : "듣기";

  return (
    <button
      className={`audio-button${isPlaying ? " is-playing" : ""}`}
      type="button"
      disabled={failed}
      aria-label={failed ? label : isPlaying ? "일본어 음성 정지" : "일본어 음성 재생"}
      onClick={togglePlayback}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 10v4h3l4 3V7l-4 3H5Z" />
        <path className="audio-wave audio-wave-one" d="M15 9.2a4 4 0 0 1 0 5.6" />
        <path className="audio-wave audio-wave-two" d="M17.7 6.7a7.5 7.5 0 0 1 0 10.6" />
      </svg>
      <span>{label}</span>
    </button>
  );
}

