const themeToggle = document.getElementById('themeToggle');
const body = document.body;
const contactForm = document.getElementById('contactForm');
const formStatus = document.getElementById('formStatus');
const userGreeting = document.getElementById('userGreeting');
const logoutBtnHeader = document.getElementById('logoutBtnHeader');

function updateThemeText() {
  themeToggle.textContent = body.classList.contains('light-theme') ? 'Dark Mode' : 'Light Mode';
}

function checkUserLogin() {
  const token = localStorage.getItem('token');
  const userName = localStorage.getItem('userName');
  
  if (token && userName) {
    userGreeting.textContent = `Welcome, ${userName}!`;
    document.querySelector('a[href="/signup.html"]').style.display = 'none';
    document.querySelector('a[href="/login.html"]').style.display = 'none';
    logoutBtnHeader.style.display = 'inline-block';
  } else {
    userGreeting.textContent = '';
    logoutBtnHeader.style.display = 'none';
  }
}

logoutBtnHeader.addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('userName');
  checkUserLogin();
  window.location.href = '/';
});

themeToggle.addEventListener('click', () => {
  body.classList.toggle('light-theme');
  if (body.classList.contains('light-theme')) {
    body.style.setProperty('--bg', '#f8f8fc');
    body.style.setProperty('--bg-alt', '#edf0f9');
    body.style.setProperty('--text', '#111827');
    body.style.setProperty('--muted', '#6b7280');
    body.style.setProperty('--card', 'rgba(255,255,255,0.8)');
    body.style.setProperty('--accent-soft', 'rgba(226,49,49,0.14)');
    themeToggle.textContent = 'Dark Mode';
  } else {
    body.style.removeProperty('--bg');
    body.style.removeProperty('--bg-alt');
    body.style.removeProperty('--text');
    body.style.removeProperty('--muted');
    body.style.removeProperty('--card');
    body.style.removeProperty('--accent-soft');
    themeToggle.textContent = 'Light Mode';
  }
});

async function submitPatrolForm(event) {
  event.preventDefault();

  const name = contactForm.elements.name.value.trim();
  const email = contactForm.elements.email.value.trim();
  const message = contactForm.elements.message.value.trim();

  if (!name || !email || !message) {
    formStatus.textContent = 'Please fill in all fields.';
    formStatus.className = 'form-status error';
    return;
  }

  formStatus.textContent = 'Enrolling you into the City Patrol...';
  formStatus.className = 'form-status';

  try {
    const response = await fetch('/api/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, email, message }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Unable to join the patrol.');
    }

    const data = await response.json();
    formStatus.textContent = data.message || 'Welcome to the City Patrol!';
    formStatus.className = 'form-status success';
    contactForm.reset();
  } catch (error) {
    formStatus.textContent = error.message;
    formStatus.className = 'form-status error';
  }
}

contactForm.addEventListener('submit', submitPatrolForm);
updateThemeText();
checkUserLogin();
