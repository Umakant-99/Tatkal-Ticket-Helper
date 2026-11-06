document.addEventListener('DOMContentLoaded', () => {
  const fields = [
    'targetTime', 'username', 'password', 'fromStn', 'toStn',
    'journeyDate', 'trainNo', 'coachClass', 'quota', 'mobileNo'
  ];

  const MAX_PASSENGERS = 6;
  const GENDERS = [['M', 'Male'], ['F', 'Female'], ['T', 'Transgender']];
  const BERTHS = [
    ['', 'No Pref'], ['LB', 'Lower'], ['MB', 'Middle'], ['UB', 'Upper'],
    ['SL', 'Side Lower'], ['SU', 'Side Upper'], ['WS', 'Window Side']
  ];

  const quotaEl = document.getElementById('quota');
  const enableTimerEl = document.getElementById('enableTimer');
  const timerBoxEl = document.getElementById('timerBox');
  const passengerListEl = document.getElementById('passengerList');
  const addPassengerBtn = document.getElementById('addPassengerBtn');

  function syncTimerVisibility() {
    if (quotaEl.value === 'GENERAL') {
      enableTimerEl.checked = false;
      timerBoxEl.style.opacity = '0.5';
    } else {
      timerBoxEl.style.opacity = '1';
    }
  }

  quotaEl.addEventListener('change', syncTimerVisibility);

  function buildOptions(pairs, selected) {
    const current = selected || '';
    return pairs
      .map(([value, label]) => `<option value="${value}"${value === current ? ' selected' : ''}>${label}</option>`)
      .join('');
  }

  function renumberPassengers() {
    const cards = passengerListEl.querySelectorAll('.psgn-card');
    cards.forEach((card, i) => {
      card.querySelector('.psgn-title').innerText = `Passenger ${i + 1}`;
      card.querySelector('.psgn-remove').hidden = cards.length === 1;
    });
    const full = cards.length >= MAX_PASSENGERS;
    addPassengerBtn.disabled = full;
    addPassengerBtn.innerText = full ? `Max ${MAX_PASSENGERS} passengers per booking` : '+ Add Passenger';
  }

  function addPassengerCard(p = {}) {
    const card = document.createElement('div');
    card.className = 'psgn-card';
    card.innerHTML = `
      <div class="psgn-head"><span class="psgn-title"></span><button type="button" class="psgn-remove">Remove</button></div>
      <input type="text" class="pName" placeholder="Passenger Full Name" autocomplete="off">
      <div class="row">
        <input type="number" class="pAge" placeholder="Age" min="1" max="120">
        <select class="pGender">${buildOptions(GENDERS, p.gender)}</select>
        <select class="pBerth">${buildOptions(BERTHS, p.berth)}</select>
      </div>`;
    card.querySelector('.pName').value = p.name || '';
    card.querySelector('.pAge').value = p.age || '';
    card.querySelector('.psgn-remove').addEventListener('click', () => {
      card.remove();
      renumberPassengers();
    });
    passengerListEl.appendChild(card);
    renumberPassengers();
    return card;
  }

  addPassengerBtn.addEventListener('click', () => {
    if (passengerListEl.querySelectorAll('.psgn-card').length < MAX_PASSENGERS) addPassengerCard();
  });

  function collectPassengers() {
    return Array.from(passengerListEl.querySelectorAll('.psgn-card'))
      .map(card => ({
        name: card.querySelector('.pName').value.trim(),
        age: card.querySelector('.pAge').value.trim(),
        gender: card.querySelector('.pGender').value,
        berth: card.querySelector('.pBerth').value
      }))
      .filter(p => p.name);
  }

  function isoDate(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function todayIso() {
    return isoDate(new Date());
  }

  function tomorrowIso() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return isoDate(d);
  }

  // Older builds stored free text ("07/11/2026", "7 Nov 2026"); a date input
  // silently drops anything it cannot parse, so convert before assigning.
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  function toIsoDate(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m) {
      let y = +m[3];
      if (y < 100) y += 2000;
      return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    }

    m = s.replace(/^[A-Za-z]{3,10}\s*,?\s+/, '').match(/^(\d{1,2})[\s\-/]([A-Za-z]{3,})[\s\-,/](\d{2,4})$/);
    if (m) {
      const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
      if (mi !== -1) {
        let y = +m[3];
        if (y < 100) y += 2000;
        return `${y}-${String(mi + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
      }
    }

    return '';
  }

  document.getElementById('setGenNow').addEventListener('click', () => {
    quotaEl.value = 'GENERAL';
    enableTimerEl.checked = false;
    syncTimerVisibility();
  });

  document.getElementById('setAC').addEventListener('click', () => {
    document.getElementById('targetTime').value = '10:00:01';
    document.getElementById('coachClass').value = '3A';
    quotaEl.value = 'TATKAL';
    // Tatkal AC opens 10:00:01 for tomorrow's journey.
    document.getElementById('journeyDate').value = tomorrowIso();
    enableTimerEl.checked = true;
    syncTimerVisibility();
  });

  document.getElementById('setSL').addEventListener('click', () => {
    document.getElementById('targetTime').value = '11:00:01';
    document.getElementById('coachClass').value = 'SL';
    quotaEl.value = 'TATKAL';
    // Tatkal sleeper opens 11:00:01 for tomorrow's journey.
    document.getElementById('journeyDate').value = tomorrowIso();
    enableTimerEl.checked = true;
    syncTimerVisibility();
  });

  chrome.storage.local.get(
    [...fields, 'enableTimer', 'passengers', 'pName', 'pAge', 'pGender', 'pBerth'],
    (data) => {
      fields.forEach(f => {
        if (data[f]) document.getElementById(f).value = data[f];
      });
      if (typeof data.enableTimer === 'boolean') {
        enableTimerEl.checked = data.enableTimer;
      }

      const journeyDateEl = document.getElementById('journeyDate');
      journeyDateEl.min = todayIso();
      journeyDateEl.value = toIsoDate(data.journeyDate) || tomorrowIso();

      const stored = Array.isArray(data.passengers)
        ? data.passengers.filter(p => p && (p.name || '').trim()).slice(0, MAX_PASSENGERS)
        : [];
      if (stored.length) {
        stored.forEach(p => addPassengerCard(p));
      } else {
        addPassengerCard({
          name: data.pName || '',
          age: data.pAge || '',
          gender: data.pGender || 'M',
          berth: data.pBerth || ''
        });
      }

      syncTimerVisibility();
    }
  );

  document.getElementById('saveBtn').addEventListener('click', () => {
    const passengers = collectPassengers();
    const status = document.getElementById('status');

    if (!passengers.length) {
      status.innerText = 'Add at least one passenger name';
      status.style.color = '#b3261e';
      status.style.display = 'block';
      return;
    }

    const journeyDateEl = document.getElementById('journeyDate');
    if (!journeyDateEl.value) {
      status.innerText = 'Select the journey date';
      status.style.color = '#b3261e';
      status.style.display = 'block';
      return;
    }

    const isGeneral = quotaEl.value === 'GENERAL';
    const payload = {
      enableTimer: isGeneral ? false : enableTimerEl.checked,
      runTimestamp: Date.now(),
      passengers
    };
    fields.forEach(f => payload[f] = document.getElementById(f).value.trim());

    // Legacy single-passenger keys mirror passenger 1 for anything still reading them.
    payload.pName = passengers[0].name;
    payload.pAge = passengers[0].age;
    payload.pGender = passengers[0].gender;
    payload.pBerth = passengers[0].berth;

    status.style.color = 'green';
    chrome.storage.local.set(payload, () => {
      status.innerText = `⚡ ${passengers.length} passenger${passengers.length > 1 ? 's' : ''}, ${journeyDateEl.value} — running on IRCTC tab...`;
      status.style.display = 'block';

      // Find any already-open IRCTC tab in the current window
      chrome.tabs.query({ currentWindow: true }, (tabs) => {
        const irctcTab = tabs.find(t => t.url && t.url.includes('irctc.co.in'));
        if (irctcTab) {
          // Focus existing IRCTC tab and trigger automation without reloading
          chrome.tabs.update(irctcTab.id, { active: true });
          chrome.tabs.sendMessage(irctcTab.id, { action: 'START_NOW', config: payload }).catch(() => {});
        } else {
          // Only open a new tab if IRCTC is not open anywhere
          chrome.tabs.create({ url: 'https://www.irctc.co.in/nget/train-search' });
        }
      });

      setTimeout(() => window.close(), 600);
    });
  });

  document.getElementById('clearCredsBtn').addEventListener('click', () => {
    chrome.storage.local.remove(['username', 'password'], () => {
      document.getElementById('username').value = '';
      document.getElementById('password').value = '';
      const status = document.getElementById('status');
      status.innerText = 'Credentials wiped from storage!';
      status.style.display = 'block';
      setTimeout(() => status.style.display = 'none', 2000);
    });
  });
});