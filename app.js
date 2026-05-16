'use strict';

// ─── App State ───────────────────────────────────
// This object keeps the selected time for each calculator mode.
// wake = user knows the wake-up time and wants bedtimes.
// bed  = user knows the bedtime and wants wake-up times.
const state = {
  wake: { h: 7, m: 0, ampm: 'AM' },
  bed:  { h: 11, m: 0, ampm: 'PM' },
};

// Sleep science approximation used by most sleep calculators.
// One full sleep cycle takes about 90 minutes, and most people need
// a few minutes before they actually fall asleep.
const CYCLE_MIN  = 90;
const ONSET_MIN  = 15;

// The calculator shows the most useful bedtime suggestions first.
// For a 7:00 AM wake-up, 6 cycles gives 9:45 PM, which is the practical "around 10" result.
const SUGGESTED_CYCLES = [6, 5, 4];

// ─── Spinner Logic ───────────────────────────────
// Called when the user presses the up/down controls.
// id example: "wake-h" means "wake mode, hour field".
function spin(id, dir) {
  const [mode, field] = id.split('-'); // 'wake-h' → mode='wake', field='h'
  const s = state[mode];

  if (field === 'h') {
    // Hours loop from 1 to 12, like a normal AM/PM clock.
    s.h = dir === 'up'
      ? (s.h % 12) + 1
      : s.h === 1 ? 12 : s.h - 1;
  } else {
    // Minutes move one by one for exact control.
    s.m = dir === 'up'
      ? (s.m + 1) % 60
      : (s.m - 1 + 60) % 60;
  }

  updateDisplay(mode);
  clearResults();
}

// Updates the visible numbers after state changes.
function updateDisplay(mode) {
  const s = state[mode];
  const prevHour = s.h === 1 ? 12 : s.h - 1;
  const nextHour = (s.h % 12) + 1;
  const prevMinute = (s.m - 1 + 60) % 60;
  const nextMinute = (s.m + 1) % 60;

  document.getElementById(`${mode}-h-prev`).textContent = String(prevHour).padStart(2, '0');
  document.getElementById(`${mode}-h-display`).textContent = String(s.h).padStart(2, '0');
  document.getElementById(`${mode}-h-next`).textContent = String(nextHour).padStart(2, '0');

  document.getElementById(`${mode}-m-prev`).textContent = String(prevMinute).padStart(2, '0');
  document.getElementById(`${mode}-m-display`).textContent = String(s.m).padStart(2, '0');

  document.querySelector(`[data-mode="${mode}"][data-field="h"]`).setAttribute('aria-valuenow', s.h);
  document.querySelector(`[data-mode="${mode}"][data-field="m"]`).setAttribute('aria-valuenow', s.m);
}

// Stores AM/PM and updates the active button style.
function setAmPm(mode, val) {
  state[mode].ampm = val;
  document.getElementById(`${mode}-am`).classList.toggle('active', val === 'AM');
  document.getElementById(`${mode}-pm`).classList.toggle('active', val === 'PM');
}

// Switches between the two calculator panels.
function switchMode(mode) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });

  document.getElementById(`panel-${mode}`).classList.add('active');
  document.getElementById(`btn-${mode}`).classList.add('active');
  document.getElementById(`btn-${mode}`).setAttribute('aria-selected', 'true');

  clearResults();
}

// Convenience feature for bedtime mode: fill the bedtime picker with the current time.
function sleepNow() {
  const now = new Date();
  let h = now.getHours();
  const m = now.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;

  state.bed.h = h;
  state.bed.m = m;
  state.bed.ampm = ampm;

  updateDisplay('bed');
  setAmPm('bed', ampm);

  calculate('bed');
}

// ─── Core Sleep Math ─────────────────────────────
// Converts 12-hour clock input into minutes from midnight.
// Example: 7:30 AM => 450, 7:30 PM => 1170.
function toMinutes(h, m, ampm) {
  let total = (h % 12) * 60 + m;
  if (ampm === 'PM') total += 12 * 60;
  return total;
}

// Converts any minute value back into a readable 12-hour time.
// The wrapping keeps times valid even when math goes before/after midnight.
function minutesToDisplay(totalMin) {
  const wrapped = ((totalMin % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh24 = Math.floor(wrapped / 60);
  const mm   = wrapped % 60;
  const ampm = hh24 >= 12 ? 'PM' : 'AM';
  const hh12 = hh24 % 12 || 12;
  return `${String(hh12).padStart(2,'0')}:${String(mm).padStart(2,'0')} ${ampm}`;
}

// Turns cycle count into an easy-to-read duration label.
function cyclesToHours(n) {
  const total = n * CYCLE_MIN;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// Each cycle count gets a quick visual signal instead of a text badge.
function getBadge(cycles) {
  if (cycles === 6) return { icon: '☺', label: 'Best option', cls: 'badge-green' };
  if (cycles === 5) return { icon: '🙂', label: 'Good option', cls: 'badge-yellow' };
  return { icon: '☹', label: 'Short sleep', cls: 'badge-red' };
}

// Gives each result card a visual accent that matches the badge.
function getAccentColor(cycles) {
  if (cycles === 6) return 'var(--good)';
  if (cycles === 5) return 'var(--great)';
  return 'var(--warn)';
}

// ─── Calculate ───────────────────────────────────
// Main calculation function:
// - wake mode works backwards from wake-up time.
// - bed mode works forwards from bedtime.
function calculate(mode) {
  const s = state[mode];
  const anchorMin = toMinutes(s.h, s.m, s.ampm);

  const cards = [];

  // Start with 6 cycles because it is usually the practical full-night suggestion.
  SUGGESTED_CYCLES.forEach((cycles, index) => {
    let resultMin;

    if (mode === 'wake') {
      // Work backwards: wake time - onset - cycles
      resultMin = anchorMin - ONSET_MIN - cycles * CYCLE_MIN;
    } else {
      // Work forwards: sleep time + onset + cycles
      resultMin = anchorMin + ONSET_MIN + cycles * CYCLE_MIN;
    }

    const badge = getBadge(cycles);
    const accent = getAccentColor(cycles);
    const time = minutesToDisplay(resultMin);
    const hoursStr = cyclesToHours(cycles);

    cards.push({
      time,
      cycles,
      hoursStr,
      badge,
      accent,
      delay: index * 60,
    });
  });

  renderResults(mode, cards);
}

// ─── Render ──────────────────────────────────────
// Builds the result cards and places them inside the results section.
function renderResults(mode, cards) {
  const container = document.getElementById('results-inner');
  const header = mode === 'wake'
    ? 'Go to sleep at…'
    : 'Wake-up time';

  let html = `<p class="results-header">${header}</p>`;

  cards.forEach(c => {
    html += `
      <div class="result-card" style="--card-accent:${c.accent}; animation-delay:${c.delay}ms">
        <div class="card-left">
          <div class="card-time">${c.time}</div>
          <div class="card-cycles">${c.cycles} cycles</div>
        </div>
        <div class="card-right">
          <span class="card-badge ${c.badge.cls}" title="${c.badge.label}" aria-label="${c.badge.label}">${c.badge.icon}</span>
          <span class="card-hours">${c.hoursStr} of sleep</span>
        </div>
      </div>`;
  });

  if (mode === 'bed') {
    html += `
      <div class="results-note">
        <p class="results-note-title">Wake-up time</p>
        <p>The average human takes 15 minutes to fall asleep.</p>
        <p>If you go to sleep right now, you should try to wake up at one of the following times:</p>
        <p>If you wake up at one of these times, you’ll rise in between 90-minute sleep cycles. A good night’s sleep consists of 5-6 complete sleep cycles.</p>
      </div>`;
  }

  container.innerHTML = html;
}

// Clear old results when switching modes.
function clearResults() {
  document.getElementById('results-inner').innerHTML = '';
}

// ─── Init ────────────────────────────────────────
// Sync the default state with the numbers shown in the UI.
updateDisplay('wake');
updateDisplay('bed');

initWheelPickers();

// ─── PWA Service Worker ──────────────────────────
// The service worker caches project files so the app can open offline later.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// The wheel picker works by dragging up/down on the numbers or using mouse wheel.
function initWheelPickers() {
  document.querySelectorAll('.wheel-column').forEach(column => {
    let startY = 0;
    let accumulated = 0;

    const changeValue = direction => {
      spin(`${column.dataset.mode}-${column.dataset.field}`, direction);
    };

    column.addEventListener('wheel', event => {
      event.preventDefault();
      changeValue(event.deltaY > 0 ? 'up' : 'down');
    }, { passive: false });

    column.addEventListener('pointerdown', event => {
      startY = event.clientY;
      accumulated = 0;
      column.setPointerCapture(event.pointerId);
      column.classList.add('dragging');
    });

    column.addEventListener('pointermove', event => {
      if (!column.classList.contains('dragging')) return;
      accumulated += event.clientY - startY;
      startY = event.clientY;

      if (Math.abs(accumulated) >= 18) {
        changeValue(accumulated < 0 ? 'up' : 'down');
        accumulated = 0;
      }
    });

    column.addEventListener('pointerup', () => {
      column.classList.remove('dragging');
    });

    column.addEventListener('pointercancel', () => {
      column.classList.remove('dragging');
    });

    column.addEventListener('keydown', event => {
      if (event.key === 'ArrowUp') changeValue('up');
      if (event.key === 'ArrowDown') changeValue('down');
    });
  });
}
