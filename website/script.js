const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Mobile menu
const toggle = document.querySelector('.nav-toggle');
const links = document.getElementById('nav-links');
toggle.addEventListener('click', () => {
  const open = links.classList.toggle('open');
  toggle.setAttribute('aria-expanded', open);
});
links.addEventListener('click', (e) => {
  if (e.target.closest('a')) {
    links.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }
});

document.getElementById('year').textContent = new Date().getFullYear();

// Header shadow and back-to-top button
const header = document.querySelector('.site-header');
const toTop = document.querySelector('.to-top');
const onScroll = () => {
  header.classList.toggle('scrolled', window.scrollY > 10);
  toTop.classList.toggle('show', window.scrollY > 700);
};
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();
toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }));

// Reveal elements as they scroll into view
const revealTargets = document.querySelectorAll('.reveal, .reveal-group');
if ('IntersectionObserver' in window && !reduceMotion) {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  revealTargets.forEach((el) => io.observe(el));
} else {
  revealTargets.forEach((el) => el.classList.add('in'));
}

// Highlight the nav link for the section on screen
const navMap = new Map([...links.querySelectorAll('a[href^="#"]:not(.btn)')].map((a) => [a.getAttribute('href').slice(1), a]));
if ('IntersectionObserver' in window) {
  const spy = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const link = navMap.get(entry.target.id);
      if (link && entry.isIntersecting) {
        navMap.forEach((a) => a.classList.remove('active'));
        link.classList.add('active');
      }
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  navMap.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
}

// Count-up numbers in the sample screen
function countUp(el, to, ms = 1200) {
  if (reduceMotion) { el.textContent = to; return; }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min((now - start) / ms, 1);
    el.textContent = Math.round(to * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
document.querySelectorAll('[data-count]').forEach((el) => setTimeout(() => countUp(el, +el.dataset.count), 700));

// Sample live queue: patients move from waiting to called to consulting
const queueEl = document.getElementById('queue');
const toast = document.getElementById('toast');
const statToday = document.getElementById('stat-today');
const statRx = document.getElementById('stat-rx');
const names = ['N. Perera', 'S. Fernando', 'K. Silva', 'R. Jayasuriya', 'M. Bandara', 'A. Wickramasinghe', 'D. Rajapaksha', 'T. Gunawardena', 'P. Herath', 'L. Dissanayake'];
let nextNo = 7;
let nameIdx = 0;
const statuses = ['Consulting', 'Called', 'Waiting', 'Waiting'];
let queue = statuses.map((s) => ({ no: nextNo++, name: names[nameIdx++], status: s }));

function rowHTML(p) {
  return `<span class="tok">A-${String(p.no).padStart(2, '0')}</span><span>${p.name}</span><span class="pill ${p.status}">${p.status}</span>`;
}
function render(enteringLast) {
  queueEl.innerHTML = '';
  queue.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'mock-row' + (enteringLast && i === queue.length - 1 ? ' entering' : '');
    row.innerHTML = rowHTML(p);
    queueEl.appendChild(row);
  });
}
function bump(el, value) {
  el.textContent = value;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}
function tick() {
  const done = queue[0];
  queueEl.firstElementChild.classList.add('leaving');
  toast.classList.add('hide');
  setTimeout(() => {
    queue.shift();
    queue[0].status = 'Consulting';
    queue[1].status = 'Called';
    queue.push({ no: nextNo++, name: names[nameIdx++ % names.length], status: 'Waiting' });
    render(true);
    toast.querySelector('span').textContent = `Prescription for ${done.name} sent to the pharmacy.`;
    toast.classList.remove('hide');
    bump(statToday, +statToday.textContent + 1);
    bump(statRx, +statRx.textContent + 1);
  }, 420);
}
render(false);
if (!reduceMotion) {
  let timer = setInterval(tick, 3200);
  document.addEventListener('visibilitychange', () => {
    clearInterval(timer);
    if (!document.hidden) timer = setInterval(tick, 3200);
  });
}

// Contact form: a static site has no server, so open the visitor's email app with the message filled in.
const form = document.getElementById('contact-form');
const note = document.getElementById('form-note');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  let ok = true;
  for (const name of ['name', 'phone']) {
    const field = form.elements[name];
    const empty = !data[name].trim();
    field.classList.remove('invalid');
    void field.offsetWidth;
    field.classList.toggle('invalid', empty);
    if (empty) ok = false;
  }
  if (!ok) {
    note.textContent = 'Please enter your name and phone number.';
    return;
  }
  const subject = `Demo request: ${data.clinic || data.name}`;
  const body = [
    `Name: ${data.name}`,
    `Clinic: ${data.clinic}`,
    `Phone: ${data.phone}`,
    `Email: ${data.email}`,
    '',
    data.message,
  ].join('\n');
  window.location.href = `mailto:${form.dataset.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  note.textContent = 'Your email app should open now. If it doesn\'t, call or WhatsApp us.';
});
