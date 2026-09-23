const globalMusicKey = 'birthdayMusicState';
const musicAudio = document.getElementById('backgroundMusic');
const musicToggle = document.getElementById('musicToggle');

if (!musicAudio) {
  console.warn('Background music element not found on this page.');
} else {
  musicAudio.volume = 0.22;
  musicAudio.loop = true;

  const updateToggleState = () => {
    if (!musicToggle) return;

    const isPlaying = !musicAudio.paused;
    musicToggle.textContent = isPlaying ? '♫' : '▶';
    musicToggle.setAttribute('aria-label', isPlaying ? 'Pause background music' : 'Play background music');
    musicToggle.title = isPlaying ? 'Pause background music' : 'Play background music';
  };

  const saveMusicState = () => {
    try {
      localStorage.setItem(globalMusicKey, JSON.stringify({
        isPlaying: !musicAudio.paused,
        currentTime: Number.isFinite(musicAudio.currentTime) ? musicAudio.currentTime : 0,
      }));
    } catch {
      // ignore storage errors to keep page usable
    }
  };

  const readMusicState = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(globalMusicKey) || '{}');
      return {
        isPlaying: saved.isPlaying === true,
        currentTime: Number.isFinite(saved.currentTime) ? Number(saved.currentTime) : 0,
      };
    } catch {
      return { isPlaying: true, currentTime: 0 };
    }
  };

  const startMusic = async () => {
    const state = readMusicState();
    if (state.currentTime > 0) {
      musicAudio.currentTime = state.currentTime;
    }

    try {
      await musicAudio.play();
      saveMusicState();
      updateToggleState();
    } catch {
      musicAudio.pause();
      saveMusicState();
      updateToggleState();
    }
  };

  const stopMusic = () => {
    musicAudio.pause();
    saveMusicState();
    updateToggleState();
  };

  const toggleMusic = async () => {
    if (musicAudio.paused) {
      await startMusic();
      return;
    }

    stopMusic();
  };

  if (musicToggle) {
    musicToggle.addEventListener('click', toggleMusic);
  }

  musicAudio.addEventListener('timeupdate', saveMusicState);
  musicAudio.addEventListener('play', () => {
    saveMusicState();
    updateToggleState();
  });
  musicAudio.addEventListener('pause', () => {
    saveMusicState();
    updateToggleState();
  });

  document.addEventListener('pointerdown', () => {
    if (musicAudio.paused) {
      startMusic();
    }
  }, { once: true });

  document.addEventListener('keydown', () => {
    if (musicAudio.paused) {
      startMusic();
    }
  }, { once: true });

  window.addEventListener('load', () => {
    const state = readMusicState();
    if (state.currentTime > 0) {
      musicAudio.currentTime = state.currentTime;
    }

    if (state.isPlaying) {
      startMusic();
    } else {
      musicAudio.pause();
      updateToggleState();
    }
  }, { once: true });
}
