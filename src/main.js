import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { signIn, confirmSignIn, signOut, getCurrentUser } from 'aws-amplify/auth';
import { uploadData, getUrl, remove } from 'aws-amplify/storage';
import outputs from '../amplify_outputs.json';

Amplify.configure(outputs);
const client = generateClient();

const $ = (id) => document.getElementById(id);
const fleetEl = $('fleetGrid');
const emptyEl = $('fleetEmpty');
let isOwner = false;
let cars = [];
let editing = null;
const slideIdx = {};
const urlCache = new Map();
const TURO_URL = 'https://turo.com/host/55884456?utm_source=website';

const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : null; };
const int = (n) => (n == null ? '' : Math.round(n).toLocaleString('en-US'));
const money = (n) => (n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US'));
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const carName = (c) => [c.year, c.make, c.model].filter(Boolean).join(' ');
const ownerMode = () => (isOwner ? 'userPool' : 'identityPool');

async function photoUrl(path) {
  const hit = urlCache.get(path);
  if (hit && hit.expires > Date.now() + 60_000) return hit.url;
  const { url, expiresAt } = await getUrl({ path, options: { expiresIn: 3600 } });
  urlCache.set(path, { url: url.toString(), expires: expiresAt ? expiresAt.getTime() : Date.now() + 3_600_000 });
  return url.toString();
}

// Built-in photos (public/cars/) shown when a car has no uploaded photos yet.
const BUILTIN_PHOTOS = [
  [/camry/i, ['/cars/camry-1.jpg']],
  [/altima/i, ['/cars/altima-1.jpg']],
  // [/hr-?v/i, ['/cars/hrv-1.jpg']],  add once the photo arrives
];
function builtinPhotos(c) {
  const name = [c.make, c.model].join(' ');
  const hit = BUILTIN_PHOTOS.find(([re]) => re.test(name));
  return hit ? hit[1] : [];
}

function setImg(img, path) {
  if (path.startsWith('/')) { img.src = path; return; }
  photoUrl(path).then((u) => { img.src = u; }).catch(() => { img.alt = 'Photo unavailable'; });
}

// ---------- Inventory ----------
async function loadCars() {
  try {
    const all = [];
    let nextToken = null;
    do {
      const res = await client.models.Car.list({ authMode: ownerMode(), limit: 100, nextToken });
      if (res.errors?.length) throw new Error(res.errors[0].message);
      all.push(...res.data);
      nextToken = res.nextToken;
    } while (nextToken);
    cars = all.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
    renderFleet();
  } catch (e) {
    console.error(e);
    emptyEl.hidden = false;
    emptyEl.querySelector('b').textContent = 'The fleet couldn’t load. Refresh to try again.';
  }
}

// Fleet cars not yet saved on the site still show, with prices left to Turo.
function builtinCars() {
  return missingStarters().map((s) => ({
    ...s, id: 'builtin-' + s.sortOrder, builtin: true,
    dailyRate: null, multiDayRate: null, weeklyRate: null, monthlyRate: null, deposit: null, milesPerDay: null, milesPerMonth: null,
  }));
}
const listedCars = () => [...cars, ...builtinCars()].sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));

function renderFleet() {
  const shown = listedCars().filter((c) => isOwner || c.status !== 'hidden');
  fleetEl.replaceChildren();
  emptyEl.querySelector('button')?.remove();
  emptyEl.hidden = shown.length > 0;
  if (!shown.length) {
    emptyEl.querySelector('b').textContent = 'No cars listed yet';
    emptyEl.querySelector('span').textContent = isOwner
      ? 'Use "Add a car" to list your first car with photos and prices.'
      : 'Call or text (619) 310-7759 to ask what’s available.';
  }

  if (isOwner) {
    const missing = missingStarters();
    if (missing.length) {
      const b = el('button', 'btn ink small', 'Add to site: ' + missing.map((m) => m.make + ' ' + m.model).join(', '));
      b.type = 'button';
      b.style.marginTop = '12px';
      b.onclick = () => addStarterCars(b, missing);
      emptyEl.append(b);
      emptyEl.hidden = false;
      if (shown.length) {
        emptyEl.querySelector('b').textContent = 'More cars ready to add';
        emptyEl.querySelector('span').textContent = 'One click lists them with example prices. Edit each one afterward.';
      }
    }
  }

  for (const c of shown) {
    const card = el('article', 'sticker' + (c.status === 'hidden' ? ' hidden-car' : ''));
    const top = el('div', 'band-top');
    top.append(el('span', null, c.tag || c.category || 'Window sticker'));
    const st = c.status === 'rented' ? 'Currently rented' : c.status === 'hidden' ? 'Hidden' : 'Available';
    top.append(el('span', 'st' + (c.status === 'rented' || c.status === 'hidden' ? ' rented' : ''), st));
    card.append(top);

    const uploaded = (c.photos || []).filter(Boolean);
    const photos = uploaded.length ? uploaded : builtinPhotos(c);
    const ph = el('div', 'photo');
    if (photos.length) {
      const i = Math.min(slideIdx[c.id] || 0, photos.length - 1);
      const img = el('img');
      img.alt = carName(c) + ' photo ' + (i + 1);
      img.loading = 'lazy';
      setImg(img, photos[i]);
      ph.append(img);
      if (photos.length > 1) {
        const prev = el('button', 'nav prev', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', 'Previous photo');
        const next = el('button', 'nav next', '›'); next.type = 'button'; next.setAttribute('aria-label', 'Next photo');
        prev.onclick = () => { slideIdx[c.id] = (i - 1 + photos.length) % photos.length; renderFleet(); };
        next.onclick = () => { slideIdx[c.id] = (i + 1) % photos.length; renderFleet(); };
        ph.append(prev, next, el('span', 'count', `${i + 1} / ${photos.length}`));
      }
    } else {
      ph.append(el('div', 'nophoto', isOwner ? 'No photos yet. Edit this car to add some.' : 'Photos coming soon'));
    }
    card.append(ph);

    const t = el('div', 'title');
    t.append(el('small', null, [c.year, c.category].filter(Boolean).join(' · ')));
    t.append(el('h3', null, [c.make, c.model].filter(Boolean).join(' ')));
    if (c.description) t.append(el('p', null, c.description));
    card.append(t);

    const specs = el('dl', 'specs');
    const add = (k, v) => { if (!v) return; const d = el('div'); d.append(el('dt', null, k), el('dd', null, v)); specs.append(d); };
    add('Seats', c.seats ? String(c.seats) : '');
    add('Odometer', c.odometer ? int(c.odometer) + ' mi' : '');
    add('Included miles', c.milesPerDay ? int(c.milesPerDay) + ' / day' : '');
    add('Deposit', c.deposit ? money(c.deposit) + ' hold' : '');
    add('Minimum age', c.minAge ? String(c.minAge) : '');
    add('Fuel', c.fuel || '');
    if (specs.children.length) card.append(specs);

    const rates = el('div', 'rates');
    if (c.builtin) {
      rates.classList.add('rates-turo');
      const d = el('div'); d.append(el('span', null, 'Price'), el('b', null, 'See current price on Turo'));
      rates.append(d);
    } else [['Daily', c.dailyRate, '/ day'], ['3+ days', c.multiDayRate, '/ day'], ['Weekly', c.weeklyRate, '/ week'],
      ['Monthly', c.monthlyRate, c.milesPerMonth ? int(c.milesPerMonth) + ' mi' : '/ month']]
      .forEach(([k, v, unit]) => { const d = el('div'); d.append(el('span', null, k), el('b', null, money(v)), el('em', null, unit)); rates.append(d); });
    card.append(rates);

    const more = el('details', 'car-more');
    more.append(el('summary', null, 'See details'));
    const turo = el('div', 'turo-box');
    const qrLink = el('a'); qrLink.href = TURO_URL; qrLink.target = '_blank'; qrLink.rel = 'noopener';
    const qr = el('img'); qr.src = '/turo-qr.png'; qr.width = 120; qr.height = 120; qr.loading = 'lazy';
    qr.alt = 'QR code for our Turo profile';
    qrLink.append(qr);
    const tt = el('div');
    tt.append(el('b', null, 'Rent this car on Turo'),
      el('p', null, 'Scan the code or tap below to book ' + carName(c) + ' through our Turo profile.'));
    const tb = el('a', 'btn gold small', 'Book on Turo'); tb.href = TURO_URL; tb.target = '_blank'; tb.rel = 'noopener';
    tt.append(tb);
    turo.append(qrLink, tt);
    more.append(turo);
    card.append(more);

    const act = el('div', 'card-actions');
    const req = el('a', 'btn ink', c.status === 'rented' ? 'Ask when it’s free' : 'Request this car');
    req.href = '#book';
    req.onclick = () => { $('rq-car').value = carName(c); };
    act.append(req);
    if (isOwner && !c.builtin) { const ed = el('button', 'btn line', 'Edit'); ed.type = 'button'; ed.onclick = () => openEditor(c); act.append(ed); }
    card.append(act);
    fleetEl.append(card);
  }

  const sel = $('rq-car');
  const keep = sel.value;
  sel.replaceChildren(el('option', null, 'Any available car'));
  listedCars().filter((c) => c.status !== 'hidden').forEach((c) => sel.append(el('option', null, carName(c))));
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
}

// ---------- Owner editor ----------
const dlg = $('editor');
let photoList = [];
let uploadedThisSession = [];
let removedThisSession = [];
const TEXT = ['make', 'model', 'category', 'status', 'tag', 'description', 'fuel'];
const NUMS = ['year', 'seats', 'odometer', 'minAge', 'deposit', 'milesPerDay', 'milesPerMonth'];
const RATE_FIELDS = { daily: 'dailyRate', multiday: 'multiDayRate', weekly: 'weeklyRate', monthly: 'monthlyRate' };

function openEditor(c) {
  editing = c || null;
  $('ed-title').textContent = c ? 'Edit ' + carName(c) : 'Add a car';
  $('ed-delete').hidden = !c;
  $('ed-msg').textContent = '';
  $('ed-msg').className = 'msg';
  for (const f of TEXT) $('f-' + f).value = c?.[f] ?? (f === 'status' ? 'available' : '');
  for (const f of NUMS) $('f-' + f).value = c?.[f] == null ? '' : (f === 'year' ? String(c[f]) : int(c[f]));
  for (const [id, f] of Object.entries(RATE_FIELDS)) $('f-' + id).value = c?.[f] ?? '';
  $('f-order').value = c?.sortOrder ?? String(cars.length + 1);
  photoList = [...(c?.photos || [])].filter(Boolean);
  uploadedThisSession = [];
  removedThisSession = [];
  renderThumbs();
  dlg.showModal();
}

function renderThumbs() {
  const box = $('thumbs');
  box.replaceChildren();
  photoList.forEach((path, i) => {
    const t = el('div', 'thumb');
    const img = el('img'); img.alt = 'Photo ' + (i + 1); setImg(img, path); t.append(img);
    if (i === 0) t.append(el('span', 'cover', 'Cover'));
    const tools = el('div', 'tools');
    if (i > 0) {
      const cover = el('button', null, 'Make cover'); cover.type = 'button';
      cover.onclick = () => { photoList.unshift(photoList.splice(i, 1)[0]); renderThumbs(); };
      tools.append(cover);
    } else tools.append(el('span'));
    const rm = el('button', null, 'Remove'); rm.type = 'button';
    rm.onclick = () => { removedThisSession.push(photoList.splice(i, 1)[0]); renderThumbs(); };
    tools.append(rm);
    t.append(tools);
    box.append(t);
  });
  const up = el('label', 'upload');
  up.append(el('span', null, 'Add photos'));
  const inp = el('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true; inp.id = 'f-photos';
  inp.onchange = () => handleFiles([...inp.files]);
  up.append(inp);
  box.append(up);
}

async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * scale);
  cv.height = Math.round(bmp.height * scale);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', 0.85));
}

async function handleFiles(files) {
  const msg = $('photoMsg');
  for (const [n, f] of files.entries()) {
    msg.className = 'msg ok';
    msg.textContent = `Uploading photo ${n + 1} of ${files.length}...`;
    let blob;
    try { blob = await shrink(f); } catch {
      msg.className = 'msg'; msg.textContent = `Couldn’t read "${f.name}". Try a JPG or PNG.`; continue;
    }
    try {
      const path = `car-photos/${crypto.randomUUID()}.jpg`;
      await uploadData({ path, data: blob, options: { contentType: 'image/jpeg' } }).result;
      photoList.push(path);
      uploadedThisSession.push(path);
      renderThumbs();
    } catch (e) {
      console.error(e);
      msg.className = 'msg'; msg.textContent = 'That photo didn’t upload. Check your connection and try again.';
      return;
    }
  }
  msg.className = 'msg ok';
  msg.textContent = 'Photos added. Save the car to keep them.';
}

async function removePaths(paths) {
  for (const path of paths) { try { await remove({ path }); } catch (e) { console.warn('remove failed', path, e); } }
}

async function closeEditor() {
  dlg.close();
  const orphans = uploadedThisSession; uploadedThisSession = [];
  await removePaths(orphans);
}
$('ed-close').onclick = closeEditor;
$('ed-cancel').onclick = closeEditor;
dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeEditor(); });

$('carForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('ed-msg');
  if (!$('f-make').value.trim() || !$('f-model').value.trim()) { msg.className = 'msg'; msg.textContent = 'Add the make and model.'; return; }
  const data = {};
  for (const f of TEXT) data[f] = $('f-' + f).value.trim() || null;
  for (const f of NUMS) { const v = num($('f-' + f).value); data[f] = v == null ? null : (f === 'deposit' ? v : Math.round(v)); }
  for (const [id, f] of Object.entries(RATE_FIELDS)) data[f] = num($('f-' + id).value);
  data.sortOrder = Math.round(num($('f-order').value) ?? cars.length + 1);
  data.photos = photoList;
  $('ed-save').disabled = true;
  msg.className = 'msg ok'; msg.textContent = 'Saving...';
  try {
    const res = editing
      ? await client.models.Car.update({ id: editing.id, ...data }, { authMode: 'userPool' })
      : await client.models.Car.create(data, { authMode: 'userPool' });
    if (res.errors?.length) throw new Error(res.errors[0].message);
    uploadedThisSession = [];
    const gone = removedThisSession; removedThisSession = [];
    dlg.close();
    await removePaths(gone);
    await loadCars();
  } catch (err) {
    console.error(err);
    msg.className = 'msg'; msg.textContent = 'Couldn’t save. Check your connection and try again.';
  } finally { $('ed-save').disabled = false; }
});

let confirmDelete = false;
$('ed-delete').onclick = async () => {
  const msg = $('ed-msg');
  if (!confirmDelete) {
    confirmDelete = true;
    $('ed-delete').textContent = 'Click again to delete';
    setTimeout(() => { confirmDelete = false; $('ed-delete').textContent = 'Delete car'; }, 4000);
    return;
  }
  confirmDelete = false;
  $('ed-delete').textContent = 'Delete car';
  try {
    const res = await client.models.Car.delete({ id: editing.id }, { authMode: 'userPool' });
    if (res.errors?.length) throw new Error(res.errors[0].message);
    const paths = [...photoList, ...removedThisSession];
    uploadedThisSession = []; removedThisSession = [];
    dlg.close();
    await removePaths(paths);
    await loadCars();
  } catch (err) { console.error(err); msg.className = 'msg'; msg.textContent = 'Couldn’t delete. Try again.'; }
};
$('addCar').onclick = () => openEditor(null);

// One-click starter inventory (example prices; edit after adding)
const STARTER_CARS = [
  { year: 2025, make: 'Mercedes-Benz', model: 'C300', category: 'Luxury sedan', tag: 'Weekend pick', status: 'available',
    description: 'For date nights, weddings and business trips.', seats: 5, odometer: 25900, fuel: 'Premium gas',
    minAge: 25, deposit: 750, milesPerDay: 150, dailyRate: 95, multiDayRate: 85, weeklyRate: 525, monthlyRate: 1700, photos: [], sortOrder: 1 },
  { year: 2024, make: 'Nissan', model: 'Altima S', category: 'Commuter sedan', tag: 'Best for monthly', status: 'available',
    description: 'Comfortable and easy on gas. Good for commuting, travel nursing, or the weeks your own car is in the shop.',
    seats: 5, odometer: 43000, fuel: 'Regular gas', minAge: 21, deposit: 300, milesPerDay: 200, milesPerMonth: 2500,
    dailyRate: 49, multiDayRate: 45, weeklyRate: 275, monthlyRate: 1150, photos: [], sortOrder: 2 },
  { year: 2025, make: 'Toyota', model: 'Camry XLE Hybrid', category: 'Hybrid sedan', tag: 'Great on gas', status: 'available',
    description: 'The all-new 2025 Camry XLE Hybrid. Leather, roomy and quiet, and easy on gas for road trips or everyday driving.',
    seats: 5, fuel: 'Hybrid (regular gas)', minAge: 21, deposit: 350, milesPerDay: 200, milesPerMonth: 2500,
    dailyRate: 59, multiDayRate: 54, weeklyRate: 330, monthlyRate: 1300, photos: [], sortOrder: 3 },
  { year: 2024, make: 'Honda', model: 'HR-V Sport', category: 'Compact SUV', tag: 'Room for gear', status: 'available',
    description: 'A comfortable compact SUV with plenty of cargo room. Good for weekend trips, moving day or the whole family.',
    seats: 5, fuel: 'Regular gas', minAge: 21, deposit: 350, milesPerDay: 200, milesPerMonth: 2500,
    dailyRate: 55, multiDayRate: 50, weeklyRate: 310, monthlyRate: 1250, photos: [], sortOrder: 4 },
];

function missingStarters() {
  const names = cars.map((c) => [c.make, c.model].join(' ').toLowerCase());
  return STARTER_CARS.filter((s) => {
    const key = s.model.split(' ')[0].toLowerCase();
    return !names.some((n) => n.includes(key));
  });
}

async function addStarterCars(btn, list) {
  btn.disabled = true;
  btn.textContent = 'Adding...';
  try {
    for (const c of list) {
      const res = await client.models.Car.create(c, { authMode: 'userPool' });
      if (res.errors?.length) throw new Error(res.errors[0].message);
    }
    await loadCars();
  } catch (e) {
    console.error(e);
    btn.disabled = false;
    btn.textContent = 'Couldn’t add them. Try again.';
  }
}

// ---------- Owner login ----------
const loginDlg = $('login');
let awaitingNewPassword = false;

function setOwner(on) {
  isOwner = on;
  $('ownerbar').hidden = !on;
  $('ownerLogin').textContent = on ? 'Signed in' : 'Owner login';
  loadCars();
}

$('ownerLogin').onclick = () => {
  if (isOwner) { $('fleet').scrollIntoView(); return; }
  awaitingNewPassword = false;
  $('lg-new-wrap').hidden = true; $('lg-email-wrap').hidden = false; $('lg-pass-wrap').hidden = false;
  $('lg-msg').textContent = ''; $('lg-submit').textContent = 'Sign in';
  loginDlg.showModal();
};
$('lg-close').onclick = () => loginDlg.close();

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('lg-msg');
  msg.className = 'msg'; msg.textContent = '';
  $('lg-submit').disabled = true;
  try {
    const out = awaitingNewPassword
      ? await confirmSignIn({ challengeResponse: $('lg-new').value })
      : await signIn({ username: $('lg-email').value.trim(), password: $('lg-pass').value });
    if (out.nextStep?.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
      awaitingNewPassword = true;
      $('lg-email-wrap').hidden = true; $('lg-pass-wrap').hidden = true; $('lg-new-wrap').hidden = false;
      $('lg-submit').textContent = 'Set password';
      msg.className = 'msg ok'; msg.textContent = 'First sign-in: choose your own password.';
    } else if (out.isSignedIn) {
      loginDlg.close();
      setOwner(true);
    } else {
      msg.textContent = 'Sign-in needs another step that this page doesn’t support yet.';
    }
  } catch (err) {
    msg.textContent = err?.name === 'NotAuthorizedException' ? 'Wrong email or password.'
      : err?.name === 'InvalidPasswordException' ? 'That password is too simple. Use 8+ characters with upper and lower case, a number and a symbol.'
      : 'Couldn’t sign in. Try again.';
  } finally { $('lg-submit').disabled = false; }
});

$('signOut').onclick = async () => { await signOut(); setOwner(false); };

// ---------- Booking request ----------
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = new Date();
$('rq-pickup').min = $('rq-return').min = iso(today);

function quote(c, days) {
  if (days >= 28 && c.monthlyRate) return c.monthlyRate * (days / 30);
  if (days >= 7 && c.weeklyRate) return c.weeklyRate * (days / 7);
  if (days >= 3 && c.multiDayRate) return c.multiDayRate * days;
  return c.dailyRate ? c.dailyRate * days : null;
}

$('request').addEventListener('submit', async (e) => {
  e.preventDefault();
  const out = $('rq-result');
  out.hidden = false; out.classList.remove('ok-result');
  const name = $('rq-name').value.trim();
  const phone = $('rq-phone').value.trim();
  if (!name || !phone) { out.textContent = 'Add your name and mobile phone so we can text you back.'; return; }
  if (!$('rq-pickup').value || !$('rq-return').value) { out.textContent = 'Pick your pickup and return dates.'; return; }
  const a = new Date($('rq-pickup').value);
  const b = new Date($('rq-return').value);
  if (!(b > a)) { out.textContent = 'The return date needs to be after the pickup date.'; return; }
  const btn = e.submitter || $('request').querySelector('button[type=submit]');
  btn.disabled = true;
  out.textContent = 'Sending...';
  try {
    const res = await client.mutations.requestBooking({
      name, phone,
      email: $('rq-email').value.trim(),
      car: $('rq-car').value,
      pickupDate: $('rq-pickup').value,
      returnDate: $('rq-return').value,
      notes: $('rq-notes').value,
      website: $('rq-website').value,
    }, { authMode: ownerMode() });
    const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    if (res.errors?.length || !body?.ok) throw new Error(res.errors?.[0]?.message || 'not ok');
    const days = Math.round((b - a) / 86400000);
    const car = cars.find((c) => carName(c) === $('rq-car').value);
    const q = car ? quote(car, days) : null;
    out.classList.add('ok-result');
    out.textContent = `Thanks, ${name.split(' ')[0]}. We got your request for ${days} day${days === 1 ? '' : 's'}` +
      (q ? `, estimated at ${money(q)} before taxes and fees` : '') + '. We’ll text you at ' + phone + ' soon.';
    $('request').reset();
  } catch (err) {
    console.error(err);
    out.textContent = 'Your request didn’t go through. Please call or text (619) 310-7759.';
  } finally { btn.disabled = false; }
});

// ---------- Start ----------
getCurrentUser().then(() => setOwner(true)).catch(() => setOwner(false));
