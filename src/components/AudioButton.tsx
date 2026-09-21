import { useEffect, useRef, useState } from "react";

interface AudioButtonProps {
  src: string;
}

export function useAudioPlayback(src: string | undefined, playbackKey = src) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setIsPlaying(false);
    setFailed(false);
    return () => {
      const audio = audioRef.current;
      audioRef.current = null;
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
      }
    };
  }, [src, playbackKey]);

  const stop = () => {
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    }
    setIsPlaying(false);
  };

  const play = async () => {
    if (!src || audioRef.current) return;

    const audio = new Audio(src);
    audio.preload = "none";
    audio.loop = false;
    audio.onended = () => {
      if (audioRef.current === audio) stop();
    };
    audio.onerror = () => {
      if (audioRef.current !== audio) return;
      stop();
      setFailed(true);
    };
    audioRef.current = audio;
    setFailed(false);
    setIsPlaying(true);

    try {
      await audio.play();
    } catch {
      // Browser autoplay restrictions must not disable manual playback.
      if (audioRef.current === audio) stop();
    }
  };

  const togglePlayback = () => {
    if (audioRef.current) stop();
    else void play();
  };

  return { isPlaying, failed, play, togglePlayback };
}

export function AudioButton({ src }: AudioButtonProps) {
  const playback = useAudioPlayback(src);
  return <AudioPlaybackButton playback={playback} />;
}

export function AudioPlaybackButton({ playback }: { playback: ReturnType<typeof useAudioPlayback> }) {
  const { isPlaying, failed, togglePlayback } = playback;
  const label = failed ? "재생할 수 없어요" : isPlaying ? "재생 중" : "듣기";

  return (
    <button
      className={`audio-button${isPlaying ? " is-playing" : ""}`}
      type="button"
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
