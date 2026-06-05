const themeToggle = document.getElementById('themeToggle');
const body = document.body;
const contactForm = document.getElementById('contactForm');
const formStatus = document.getElementById('formStatus');
const userGreeting = document.getElementById('userGreeting');
const logoutBtnHeader = document.getElementById('logoutBtnHeader');
const adminLink = document.getElementById('adminLink');

function updateThemeText() {
  themeToggle.textContent = body.classList.contains('light-theme') ? 'Dark Mode' : 'Light Mode';
}

function checkUserLogin() {
  const token = localStorage.getItem('token');
  const userName = localStorage.getItem('userName');
  const userRole = localStorage.getItem('userRole');

  if (token && userName) {
    userGreeting.textContent = `Welcome, ${userName}!`;
    document.querySelector('a[href="/signup.html"]').style.display = 'none';
    document.querySelector('a[href="/login.html"]').style.display = 'none';
    logoutBtnHeader.style.display = 'inline-block';

    if (userRole === 'admin') {
      adminLink.style.display = 'inline-block';
      adminLink.href = `/admin.html?token=${encodeURIComponent(token)}`;
    } else {
      adminLink.style.display = 'none';
      adminLink.removeAttribute('href');
    }
  } else {
    userGreeting.textContent = '';
    logoutBtnHeader.style.display = 'none';
    adminLink.style.display = 'none';
    document.querySelector('a[href="/signup.html"]').style.display = 'inline-block';
    document.querySelector('a[href="/login.html"]').style.display = 'inline-block';
  }
}

logoutBtnHeader.addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('userName');
  localStorage.removeItem('userRole');
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

// Community posts script
const postForm = document.getElementById('postForm');
const postStatus = document.getElementById('postStatus');
const postsFeed = document.getElementById('postsFeed');

async function loadPosts() {
  try {
    const resp = await fetch('/api/posts');
    if (!resp.ok) throw new Error('Failed to load posts');
    const posts = await resp.json();
    renderPosts(posts);
  } catch (err) {
    console.error('Load posts error:', err);
    if (postsFeed) postsFeed.innerHTML = '<p style="color:var(--muted)">Unable to load posts.</p>';
  }
}

function timeAgo(dateString) {
  const d = new Date(dateString);
  return d.toLocaleString();
}

function renderPosts(posts) {
  if (!postsFeed) return;
  if (!posts || posts.length === 0) {
    postsFeed.innerHTML = '<p style="color:var(--muted)">No posts yet.</p>';
    return;
  }

  postsFeed.innerHTML = '';
  posts.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.marginBottom = '1rem';
    card.innerHTML = `
      <h4 style="margin:0 0 0.25rem 0">${escapeHtml(p.title)}</h4>
      <div style="color:var(--muted); font-size:0.9rem; margin-bottom:0.5rem">by ${escapeHtml(p.user_name)} • ${timeAgo(p.created_at)}</div>
      <p style="margin:0 0 0.5rem 0">${escapeHtml(p.body)}</p>
      <div style="display:flex; gap:0.5rem; align-items:center;">
        <button class="like-btn" data-post-id="${p.id}">Like (${p.like_count || 0})</button>
        <button class="comments-btn" data-post-id="${p.id}">Comments (${p.comment_count || 0})</button>
      </div>
      <div class="comments-container" id="comments-${p.id}" style="margin-top:0.75rem"></div>
    `;
    postsFeed.appendChild(card);

    const likeBtn = card.querySelector('.like-btn');
    const commentsBtn = card.querySelector('.comments-btn');
    const commentsContainer = card.querySelector('.comments-container');

    likeBtn.addEventListener('click', async () => {
      const token = localStorage.getItem('token');
      if (!token) { alert('Log in to like posts.'); return; }
      likeBtn.disabled = true;
      try {
        const r = await fetch(`/api/posts/${p.id}/like`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) { alert('Unable to toggle like'); return; }
        await loadPosts();
      } catch (err) {
        console.error('Like error:', err);
        alert('Error toggling like');
      } finally { likeBtn.disabled = false; }
    });

    commentsBtn.addEventListener('click', async () => {
      if (commentsContainer.innerHTML.trim() !== '') { commentsContainer.innerHTML = ''; return; }
      commentsContainer.innerHTML = '<p style="color:var(--muted)">Loading comments...</p>';
      try {
        const resp = await fetch(`/api/posts/${p.id}/comments`);
        if (!resp.ok) throw new Error('Failed to load comments');
        const comments = await resp.json();
        commentsContainer.innerHTML = '';
        const list = document.createElement('div');
        comments.forEach((c) => {
          const el = document.createElement('div');
          el.style.padding = '0.5rem 0';
          el.innerHTML = `<strong>${escapeHtml(c.user_name)}</strong> <span style="color:var(--muted); font-size:0.85rem">${timeAgo(c.created_at)}</span><div>${escapeHtml(c.body)}</div>`;
          list.appendChild(el);
        });
        commentsContainer.appendChild(list);

        const token = localStorage.getItem('token');
        if (token) {
          const form = document.createElement('form');
          form.style.marginTop = '0.5rem';
          form.innerHTML = `<input type="text" name="comment" placeholder="Write a comment..." style="width:70%; padding:0.5rem" required /> <button type="submit">Comment</button>`;
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const body = form.elements.comment.value.trim();
            if (!body) return;
            try {
              const r = await fetch(`/api/posts/${p.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ body }) });
              if (!r.ok) { alert('Unable to post comment'); return; }
              form.elements.comment.value = '';
              // refresh comments
              commentsContainer.innerHTML = '';
              commentsContainer.innerHTML = '<p style="color:var(--muted)">Loading comments...</p>';
              const resp2 = await fetch(`/api/posts/${p.id}/comments`);
              const comments2 = await resp2.json();
              commentsContainer.innerHTML = '';
              const list2 = document.createElement('div');
              comments2.forEach((c) => {
                const el = document.createElement('div');
                el.style.padding = '0.5rem 0';
                el.innerHTML = `<strong>${escapeHtml(c.user_name)}</strong> <span style="color:var(--muted); font-size:0.85rem">${timeAgo(c.created_at)}</span><div>${escapeHtml(c.body)}</div>`;
                list2.appendChild(el);
              });
              commentsContainer.appendChild(list2);
            } catch (err) { console.error('Comment error:', err); alert('Error posting comment'); }
          });
          commentsContainer.appendChild(form);
        }
      } catch (err) { console.error('Comments load error:', err); commentsContainer.innerHTML = '<p style="color:var(--muted)">Could not load comments.</p>'; }
    });
  });
}

if (postForm) {
  postForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('postTitle').value.trim();
    const bodyText = document.getElementById('postBody').value.trim();
    if (!title || !bodyText) { postStatus.textContent = 'Please add title and content.'; postStatus.className = 'form-status error'; return; }
    const token = localStorage.getItem('token');
    if (!token) { postStatus.textContent = 'Log in to post.'; postStatus.className = 'form-status error'; return; }
    postStatus.textContent = 'Posting...';
    try {
      const resp = await fetch('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ title, body: bodyText }) });
      if (!resp.ok) { const d = await resp.json().catch(()=>({})); throw new Error(d.error || 'Post failed'); }
      postStatus.textContent = 'Post created.'; postStatus.className = 'form-status success';
      postForm.reset();
      await loadPosts();
    } catch (err) { postStatus.textContent = err.message; postStatus.className = 'form-status error'; }
  });
}

// Initial load
loadPosts();

updateThemeText();
checkUserLogin();
