import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// Isolate the playback controller from rendering; UI flows are covered by Playwright.
const hooks = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
}));
vi.mock("react", () => ({
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => {
    const setter = vi.fn();
    hooks.setters.push(setter);
    return [initial, setter];
  },
  useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
}));

import { useAudioPlayback } from "./AudioButton";

class FakeAudio {
  static instances: FakeAudio[] = [];
  preload = "";
  loop = true;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  constructor(public src: string) { FakeAudio.instances.push(this); }
}

beforeEach(() => {
  hooks.effects.length = 0;
  hooks.setters.length = 0;
  FakeAudio.instances = [];
  vi.stubGlobal("Audio", FakeAudio);
});
afterEach(() => vi.unstubAllGlobals());

describe("answer audio playback", () => {
  it("does not play on mount or when no audio exists", async () => {
    const playback = useAudioPlayback(undefined, "question-1");
    hooks.effects[0]();
    await playback.play();
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it("starts the matching audio synchronously, once, without looping", async () => {
    const playback = useAudioPlayback("/answer.mp3", "question-1");
    hooks.effects[0]();
    expect(FakeAudio.instances).toHaveLength(0);
    const pending = playback.play();
    expect(FakeAudio.instances[0].play).toHaveBeenCalledTimes(1);
    await playback.play();
    await pending;
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0]).toMatchObject({ src: "/answer.mp3", loop: false });
  });

  it("keeps manual stop and replay available", async () => {
    const playback = useAudioPlayback("/answer.mp3");
    await playback.play();
    playback.togglePlayback();
    expect(FakeAudio.instances[0].pause).toHaveBeenCalledOnce();
    playback.togglePlayback();
    expect(FakeAudio.instances).toHaveLength(2);
    expect(FakeAudio.instances[1].play).toHaveBeenCalledOnce();
  });

  it("returns to listening state at the end, without starting another playback", async () => {
    const playback = useAudioPlayback("/answer.mp3");
    await playback.play();
    FakeAudio.instances[0].onended?.();
    expect(hooks.setters[0]).toHaveBeenLastCalledWith(false);
    expect(FakeAudio.instances).toHaveLength(1);
    playback.togglePlayback();
    expect(FakeAudio.instances).toHaveLength(2);
  });

  it("allows manual retry after autoplay is blocked", async () => {
    const playback = useAudioPlayback("/answer.mp3");
    vi.stubGlobal("Audio", class extends FakeAudio {
      constructor(src: string) {
        super(src);
        this.play.mockRejectedValueOnce(new DOMException("Blocked", "NotAllowedError"));
      }
    });
    await playback.play();
    expect(hooks.setters[0]).toHaveBeenLastCalledWith(false);
    expect(hooks.setters[1]).not.toHaveBeenCalledWith(true);
    vi.stubGlobal("Audio", FakeAudio);
    await playback.play();
    expect(FakeAudio.instances.at(-1)?.play).toHaveBeenCalledOnce();
  });

  it("stops and detaches callbacks when navigating away or unmounting", async () => {
    const playback = useAudioPlayback("/answer.mp3", "question-1");
    const cleanup = hooks.effects[0]();
    await playback.play();
    if (cleanup) cleanup();
    expect(FakeAudio.instances[0].pause).toHaveBeenCalledOnce();
    expect(FakeAudio.instances[0].onended).toBeNull();
    expect(FakeAudio.instances[0].onerror).toBeNull();
  });
});
