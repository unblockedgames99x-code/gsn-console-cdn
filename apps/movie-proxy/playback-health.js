// A page load is not proof of playback. Observe actual media in rewritten frames.
export function createPlaybackHealth({ now = () => performance.now(), startupMs = 60000, stallMs = 40000 } = {}) {
  let started = now(), lastProgress = started, previous = null, failed = false;
  return {
    reset() { started = lastProgress = now(); previous = null; failed = false; },
    sample(media, suspended = false) {
      if (failed) return null;
      const time = now();
      if (suspended) { started = lastProgress = time; return null; }
      if (media?.error) { failed = true; return { type: 'error', message: 'The source reported a playback error.' }; }
      if (media && media.readyState >= 2) {
        if (media.paused || media.ended || media.seeking || previous === null || Math.abs(media.currentTime - previous) > .15) {
          lastProgress = time;
        }
        previous = media.currentTime;
        if (!media.paused && !media.ended && time - lastProgress > stallMs) {
          failed = true; return { type: 'error', message: 'Playback stopped buffering. Trying another source.' };
        }
        return { type: 'progress', time: media.currentTime, duration: media.duration, paused: media.paused };
      }
      // Preserve a user's pause even if the browser has evicted buffered video.
      if (previous !== null && media?.paused) { lastProgress = time; return null; }
      const elapsed = time - (previous === null ? started : lastProgress);
      if (elapsed > (previous === null ? startupMs : stallMs)) {
        failed = true; return { type: 'error', message: previous === null ? 'This source did not start in time.' : 'The stream stopped responding.' };
      }
      return null;
    }
  };
}
