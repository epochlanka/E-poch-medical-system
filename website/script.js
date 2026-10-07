// Mobile menu
const toggle = document.querySelector('.nav-toggle');
const links = document.getElementById('nav-links');
toggle.addEventListener('click', () => {
  const open = links.classList.toggle('open');
  toggle.setAttribute('aria-expanded', open);
});
links.addEventListener('click', (e) => {
  if (e.target.tagName === 'A') {
    links.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }
});

document.getElementById('year').textContent = new Date().getFullYear();

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
