/* -------------------------------------------------------------
 * AURA TIME SYSTEM - APPLICATION LOGIC (script.js)
 * ------------------------------------------------------------- */

// Configuration and State
const ZONES = [
  { id: 'card-eastern', name: 'Eastern', timeZone: 'America/New_York' },
  { id: 'card-central', name: 'Central', timeZone: 'America/Chicago' },
  { id: 'card-mountain', name: 'Mountain', timeZone: 'America/Denver' },
  { id: 'card-pacific', name: 'Pacific', timeZone: 'America/Los_Angeles' }
];

let is24Hour = false;
let isScrubbing = false;
let scrubbedNYDate = null; // Tracks New York baseline date during scrubbing

// DOM Elements
const timeFormatToggle = document.getElementById('time-format-toggle');
const themeSelect = document.getElementById('theme-select');
const liveIndicator = document.getElementById('live-indicator');
const liveStatusText = document.getElementById('live-status-text');
const resetTimeBtn = document.getElementById('reset-time-btn');
const timeScrubber = document.getElementById('time-scrubber');
const scrubDisplayVal = document.getElementById('scrub-display-val');

// Initialize Icons
lucide.createIcons();

/* -------------------------------------------------------------
 * Theme Selector
 * ------------------------------------------------------------- */
themeSelect.addEventListener('change', (e) => {
  const selectedTheme = e.target.value;
  // Reset existing theme classes
  document.body.className = '';
  document.body.classList.add(`theme-${selectedTheme}`);
});

/* -------------------------------------------------------------
 * Time Format Toggle
 * ------------------------------------------------------------- */
timeFormatToggle.addEventListener('change', (e) => {
  is24Hour = e.target.checked;
  updateAllClocks();
});

/* -------------------------------------------------------------
 * Helper Timezone Math Functions
 * ------------------------------------------------------------- */

/**
 * Returns year, month, day, hour, minute, second, dayPeriod, timeZoneName, and shortOffset
 * for a specific date and timezone target.
 */
function getTZDetails(date, timeZone) {
  // Use formatToParts to parse exact numbers to avoid browser timezone bugs
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: true
  });
  
  const parts = formatter.formatToParts(date);
  const timeParts = {};
  parts.forEach(p => timeParts[p.type] = p.value);
  
  // Also get the timezone abbreviation (e.g. "EDT", "EST")
  const abbrFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short'
  });
  const abbrParts = abbrFormatter.formatToParts(date);
  const tzAbbr = abbrParts.find(p => p.type === 'timeZoneName')?.value || '';

  // Get the numerical offset (e.g. "GMT-4" -> "UTC-4")
  const offsetFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset'
  });
  const offsetParts = offsetFormatter.formatToParts(date);
  let tzOffset = offsetParts.find(p => p.type === 'timeZoneName')?.value || '';
  tzOffset = tzOffset.replace('GMT', 'UTC');
  if (tzOffset === 'UTC') tzOffset = 'UTC+0';

  // Get weekday and month name
  const nameFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  });
  const dateFormattedString = nameFormatter.format(date);

  // Convert hour string to actual 24-hour integer
  let hour24 = parseInt(timeParts.hour, 10);
  const dayPeriod = timeParts.dayPeriod; // "AM" or "PM"
  if (dayPeriod === 'PM' && hour24 < 12) hour24 += 12;
  if (dayPeriod === 'AM' && hour24 === 12) hour24 = 0;

  return {
    year: parseInt(timeParts.year, 10),
    month: parseInt(timeParts.month, 10),
    day: parseInt(timeParts.day, 10),
    hour24,
    minute: parseInt(timeParts.minute, 10),
    second: parseInt(timeParts.second, 10),
    dayPeriod,
    abbr: tzAbbr,
    offset: tzOffset,
    dateString: dateFormattedString
  };
}

/**
 * Calculates the Day Phase (Daylight, Twilight, Night) based on the local hour
 */
function getDayPhase(hour24) {
  if (hour24 >= 6 && hour24 < 17) {
    return { name: 'Daylight', icon: 'sun', class: 'day' };
  } else if (hour24 >= 17 && hour24 < 20) {
    return { name: 'Twilight', icon: 'sunset', class: 'twilight' };
  } else {
    return { name: 'Night', icon: 'moon', class: 'night' };
  }
}

/**
 * Construct an absolute Date object representing a targeted hour and minute in NY (EST/EDT).
 * This dynamically figures out the offsets of America/New_York relative to UTC for the current day.
 */
function getNYTargetDate(targetHours, targetMinutes) {
  const tempDate = new Date();
  tempDate.setSeconds(0);
  tempDate.setMilliseconds(0);

  // Determine America/New_York offset vs UTC face time
  const utcString = tempDate.toLocaleString('en-US', { timeZone: 'UTC' });
  const nyString = tempDate.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const diffMs = Date.parse(nyString) - Date.parse(utcString);

  // Set the target hour/min in a local equivalent container
  const targetLocal = new Date(tempDate.getFullYear(), tempDate.getMonth(), tempDate.getDate(), targetHours, targetMinutes, 0);
  
  // Subtract the difference to get standard epoch milliseconds
  const absoluteMs = targetLocal.getTime() - diffMs;
  return new Date(absoluteMs);
}

/* -------------------------------------------------------------
 * Clock Render Logic
 * ------------------------------------------------------------- */

function updateTZCard(zone, date) {
  const cardEl = document.getElementById(zone.id);
  if (!cardEl) return;

  const details = getTZDetails(date, zone.timeZone);

  // Update Headers & Offset Abbr
  cardEl.querySelector('.zone-abbr').textContent = details.abbr;
  cardEl.querySelector('.zone-offset-badge').textContent = details.offset;

  // Update Analog Clock Hands Rotation
  const hrHand = cardEl.querySelector('.hour-hand');
  const minHand = cardEl.querySelector('.minute-hand');
  const secHand = cardEl.querySelector('.second-hand');

  // smooth hands: add fractions
  const hrDeg = (details.hour24 * 30) + (details.minute / 2);
  const minDeg = (details.minute * 6) + (details.second / 10);
  const secDeg = details.second * 6;

  hrHand.style.transform = `translateX(-50%) rotate(${hrDeg}deg)`;
  minHand.style.transform = `translateX(-50%) rotate(${minDeg}deg)`;
  
  // Only rotate second hand if we are not scrubbing or if seconds are active
  if (isScrubbing) {
    secHand.style.display = 'none'; // hide seconds in scrubbing planner mode
  } else {
    secHand.style.display = 'block';
    secHand.style.transform = `translateX(-50%) rotate(${secDeg}deg)`;
  }

  // Update Digital Clock Display
  let displayHr = details.hour24;
  let ampmStr = '';
  
  if (is24Hour) {
    displayHr = String(displayHr).padStart(2, '0');
  } else {
    ampmStr = displayHr >= 12 ? 'PM' : 'AM';
    displayHr = displayHr % 12;
    if (displayHr === 0) displayHr = 12;
    displayHr = String(displayHr).padStart(2, '0');
  }

  const displayMin = String(details.minute).padStart(2, '0');
  const displaySec = String(details.second).padStart(2, '0');

  const digitalTimeEl = cardEl.querySelector('.digital-time');
  const digitalAmpmEl = cardEl.querySelector('.digital-ampm');

  if (isScrubbing) {
    digitalTimeEl.textContent = `${displayHr}:${displayMin}`;
    digitalAmpmEl.textContent = ampmStr;
  } else {
    digitalTimeEl.textContent = `${displayHr}:${displayMin}:${displaySec}`;
    digitalAmpmEl.textContent = ampmStr;
  }

  if (is24Hour) {
    digitalAmpmEl.style.display = 'none';
  } else {
    digitalAmpmEl.style.display = 'inline';
  }

  // Update Date Display
  cardEl.querySelector('.date-display').textContent = details.dateString;

  // Update Day Phase / Badge (Avoid redraws if identical)
  const phase = getDayPhase(details.hour24);
  const footerEl = cardEl.querySelector('.card-footer');
  const currentBadge = footerEl.querySelector('.phase-badge');
  
  // Set theme card classes dynamically (state-day, state-sunset, state-night)
  cardEl.classList.remove('state-day', 'state-twilight', 'state-night');
  cardEl.classList.add(`state-${phase.class}`);

  if (!currentBadge || !currentBadge.classList.contains(phase.class)) {
    // Redraw badge
    const badgeHTML = `
      <div class="phase-badge ${phase.class}">
        <i data-lucide="${phase.icon}"></i>
        <span>${phase.name}</span>
      </div>
    `;
    const oldBadge = cardEl.querySelector('.phase-badge');
    if (oldBadge) oldBadge.remove();
    footerEl.appendChild(document.createRange().createContextualFragment(badgeHTML));
    lucide.createIcons(); // refresh SVG inside badge
  }
}

function updateAllClocks() {
  const activeDate = isScrubbing ? scrubbedNYDate : new Date();
  ZONES.forEach(zone => {
    updateTZCard(zone, activeDate);
  });
}

/* -------------------------------------------------------------
 * Meeting Scrubber Slider Logic
 * ------------------------------------------------------------- */

function formatSliderTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  let formattedHr = hours;
  let ampm = 'AM';
  if (formattedHr >= 12) {
    ampm = 'PM';
    if (formattedHr > 12) formattedHr -= 12;
  }
  if (formattedHr === 0) formattedHr = 12;
  
  const formattedMin = String(minutes).padStart(2, '0');
  
  if (is24Hour) {
    const hr24 = String(hours).padStart(2, '0');
    return `${hr24}:${formattedMin} New York Base`;
  } else {
    return `${formattedHr}:${formattedMin} ${ampm} Eastern Time (NY Base)`;
  }
}

function syncSliderToRealTime() {
  if (isScrubbing) return;
  const now = new Date();
  const nyDetails = getTZDetails(now, 'America/New_York');
  const totalMinutes = (nyDetails.hour24 * 60) + nyDetails.minute;
  timeScrubber.value = totalMinutes;
  scrubDisplayVal.textContent = formatSliderTime(totalMinutes);
}

// Scrubber events
timeScrubber.addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  
  // Transition to Scrub mode
  if (!isScrubbing) {
    isScrubbing = true;
    liveIndicator.className = 'status-badge scrubbing';
    liveStatusText.textContent = 'PLANNER';
    resetTimeBtn.classList.remove('disabled');
  }

  // Calculate target date corresponding to Eastern Time hours/mins
  const hours = Math.floor(val / 60);
  const minutes = val % 60;
  scrubbedNYDate = getNYTargetDate(hours, minutes);

  // Update label
  scrubDisplayVal.textContent = formatSliderTime(val);

  // Re-draw cards
  updateAllClocks();
});

// Reset live time button
resetTimeBtn.addEventListener('click', () => {
  if (!isScrubbing) return;

  isScrubbing = false;
  liveIndicator.className = 'status-badge live';
  liveStatusText.textContent = 'LIVE';
  resetTimeBtn.classList.add('disabled');

  // Instantly sync & loop back
  updateAllClocks();
  syncSliderToRealTime();
});

/* -------------------------------------------------------------
 * Main Animation Loop
 * ------------------------------------------------------------- */
function tick() {
  if (!isScrubbing) {
    updateAllClocks();
    syncSliderToRealTime();
  }
  // Schedule next frame
  requestAnimationFrame(tick);
}

// Kickstart Dashboard
updateAllClocks();
syncSliderToRealTime();
tick();
