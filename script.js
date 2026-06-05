const themeToggle = document.getElementById('themeToggle');
const userGreeting = document.getElementById('userGreeting');
const logoutBtnHeader = document.getElementById('logoutBtnHeader');
const signupLink = document.getElementById('signupLink');
const loginLink = document.getElementById('loginLink');
const notificationBell = document.getElementById('notificationBell');
const notificationCount = document.getElementById('notificationCount');
const notificationsPanel = document.getElementById('notificationsPanel');
const notificationsList = document.getElementById('notificationsList');
const closeNotifications = document.getElementById('closeNotifications');
const postForm = document.getElementById('postForm');
const postStatus = document.getElementById('postStatus');
const postsFeed = document.getElementById('postsFeed');
const assignedComplaintsContainer = document.getElementById('assignedComplaintsContainer');
const patrolQuickCard = document.getElementById('patrolQuickCard');
const adminQuickCard = document.getElementById('adminQuickCard');
const reportStatsCard = document.getElementById('reportStatsCard');
const recentReportsCard = document.getElementById('recentReportsCard');

let currentUser = null;
let notifications = [];

function showToast(message, type = 'info', timeout = 3800) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.position = 'fixed';
    container.style.right = '1rem';
    container.style.bottom = '1rem';
    container.style.zIndex = 9999;
    document.body.appendChild(container);
  }

  const el = document.createElement('div');
  el.textContent = message;
  el.style.marginTop = '0.5rem';
  el.style.padding = '0.75rem 1rem';
  el.style.borderRadius = '0.85rem';
  el.style.color = '#fff';
  el.style.background = type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : 'rgba(55,65,81,0.95)';
  el.style.boxShadow = '0 12px 30px rgba(0,0,0,0.2)';
  el.style.opacity = '1';
  el.style.transition = 'opacity 300ms ease';

  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, timeout);
}

function escapeHtml(text) {
  const span = document.createElement('span');
  span.textContent = text || '';
  return span.innerHTML;
}

function timeAgo(dateString) {
  const d = new Date(dateString);
  return d.toLocaleString();
}

function updateRoleVisibility(role) {
  document.querySelectorAll('.role-admin').forEach((el) => {
    el.style.display = role === 'admin' ? '' : 'none';
  });
  document.querySelectorAll('.role-patrol').forEach((el) => {
    el.style.display = role === 'patrol' ? '' : 'none';
  });
  document.querySelectorAll('.role-admin-patrol').forEach((el) => {
    el.style.display = role === 'admin' || role === 'patrol' ? '' : 'none';
  });
}

function updateHeader(user) {
  if (user) {
    userGreeting.textContent = `Welcome, ${user.name}`;
    userGreeting.style.display = 'inline-flex';
    logoutBtnHeader.style.display = 'inline-flex';
    signupLink.style.display = 'none';
    loginLink.style.display = 'none';
  } else {
    userGreeting.textContent = '';
    logoutBtnHeader.style.display = 'none';
    signupLink.style.display = 'inline-flex';
    loginLink.style.display = 'inline-flex';
  }
}

async function fetchCurrentUser() {
  try {
    const resp = await fetch('/api/me', { credentials: 'same-origin' });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.user;
  } catch (err) {
    console.error('fetchCurrentUser error', err);
    return null;
  }
}

async function initializeSession() {
  currentUser = await fetchCurrentUser();
  updateHeader(currentUser);
  updateRoleVisibility(currentUser?.role || '');
  await loadCommunityStats();
  await loadPosts();
  if (currentUser?.role === 'patrol') {
    loadAssignedComplaints();
  }
  renderNotifications();
}

function setActiveNav() {
  const hash = window.location.hash || '#home';
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.classList.toggle('active', link.getAttribute('href') === hash);
  });
}

function renderNotifications() {
  if (!notificationsList || !notificationCount) return;
  notificationCount.textContent = notifications.length ? `${notifications.length}` : '0';
  notificationsList.innerHTML = notifications.length
    ? notifications.map((note) => `<div class="notification-item"><p>${escapeHtml(note.message)}</p></div>`).join('')
    : '<p class="empty-state">No new notifications.</p>';
}

function pushNotification(message) {
  notifications.unshift({ message, date: new Date().toISOString() });
  if (notifications.length > 6) notifications.pop();
  renderNotifications();
}

function toggleNotifications() {
  if (!notificationsPanel) return;
  notificationsPanel.hidden = !notificationsPanel.hidden;
}

if (notificationBell) {
  notificationBell.addEventListener('click', toggleNotifications);
}

if (closeNotifications) {
  closeNotifications.addEventListener('click', () => {
    if (notificationsPanel) notificationsPanel.hidden = true;
  });
}

if (logoutBtnHeader) {
  logoutBtnHeader.addEventListener('click', async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (error) {
      console.error('Logout failed', error);
    }
    currentUser = null;
    updateHeader(null);
    updateRoleVisibility('');
    window.location.href = '/';
  });
}

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    themeToggle.textContent = document.body.classList.contains('light-theme') ? 'Dark Mode' : 'Light Mode';
  });
}

async function loadPosts() {
  if (!postsFeed) return;
  try {
    const resp = await fetch('/api/posts', { credentials: 'same-origin' });
    if (!resp.ok) throw new Error('Failed to load posts');
    const posts = await resp.json();
    renderPosts(posts);
  } catch (err) {
    console.error('Load posts error:', err);
    postsFeed.innerHTML = '<p class="empty-state">Unable to load posts.</p>';
  }
}

function renderPosts(posts) {
  if (!postsFeed) return;
  if (!posts || posts.length === 0) {
    postsFeed.innerHTML = '<p class="empty-state">No posts to show yet.</p>';
    return;
  }

  postsFeed.innerHTML = '';
  posts.forEach((p) => {
    const card = document.createElement('article');
    card.className = 'post-card';
    card.innerHTML = `
      <div class="post-meta">
        <div>
          <h4>${escapeHtml(p.title)}</h4>
          <span>by ${escapeHtml(p.user_name)} • ${timeAgo(p.created_at)}</span>
        </div>
      </div>
      <p>${escapeHtml(p.body)}</p>
      <div class="post-actions">
        <button class="post-button like-btn" data-post-id="${p.id}">Like (${p.like_count || 0})</button>
        <button class="post-button comments-btn" data-post-id="${p.id}">Comments (${p.comment_count || 0})</button>
      </div>
      <div class="comments-container" id="comments-${p.id}"></div>
    `;
    postsFeed.appendChild(card);

    const likeBtn = card.querySelector('.like-btn');
    const commentsBtn = card.querySelector('.comments-btn');

    likeBtn?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const resp = await fetch(`/api/posts/${p.id}/like`, {
          method: 'POST',
          credentials: 'same-origin',
        });
        if (!resp.ok) {
          showToast('Unable to toggle like.', 'error');
          return;
        }
        await loadPosts();
      } catch (error) {
        console.error('Like error:', error);
        showToast('Error toggling like.', 'error');
      } finally {
        button.disabled = false;
      }
    });

    commentsBtn?.addEventListener('click', async () => {
      const commentsContainer = card.querySelector('.comments-container');
      if (!commentsContainer) return;
      if (commentsContainer.innerHTML.trim() !== '') {
        commentsContainer.innerHTML = '';
        return;
      }
      commentsContainer.innerHTML = '<p class="empty-state">Loading comments...</p>';
      try {
        const resp = await fetch(`/api/posts/${p.id}/comments`, { credentials: 'same-origin' });
        if (!resp.ok) throw new Error('Failed to load comments');
        const comments = await resp.json();
        commentsContainer.innerHTML = '';

        const list = document.createElement('div');
        comments.forEach((c) => {
          const el = document.createElement('div');
          el.className = 'comment-item';
          el.innerHTML = `
            <strong>${escapeHtml(c.user_name)}</strong>
            <span style="color:var(--muted); font-size:0.85rem;">${timeAgo(c.created_at)}</span>
            <div>${escapeHtml(c.body)}</div>
          `;
          list.appendChild(el);
        });
        commentsContainer.appendChild(list);

        const commentForm = document.createElement('form');
        commentForm.style.marginTop = '1rem';
        commentForm.innerHTML = `
          <input type="text" name="comment" placeholder="Write a comment..." required style="width:100%; padding:0.95rem 1rem; border-radius:16px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.05); color:var(--text);" />
          <button type="submit" class="post-button" style="margin-top:0.8rem;">Comment</button>
        `;
        commentForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          const bodyText = commentForm.elements.comment.value.trim();
          if (!bodyText) return;
          try {
            const postResp = await fetch(`/api/posts/${p.id}/comments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({ body: bodyText }),
            });
            if (!postResp.ok) {
              showToast('Unable to post comment.', 'error');
              return;
            }
            commentForm.elements.comment.value = '';
            const refreshed = await fetch(`/api/posts/${p.id}/comments`, { credentials: 'same-origin' });
            const refreshedComments = await refreshed.json();
            commentsContainer.innerHTML = '';
            const updatedList = document.createElement('div');
            refreshedComments.forEach((c) => {
              const el = document.createElement('div');
              el.className = 'comment-item';
              el.innerHTML = `
                <strong>${escapeHtml(c.user_name)}</strong>
                <span style="color:var(--muted); font-size:0.85rem;">${timeAgo(c.created_at)}</span>
                <div>${escapeHtml(c.body)}</div>
              `;
              updatedList.appendChild(el);
            });
            commentsContainer.appendChild(updatedList);
            commentsContainer.appendChild(commentForm);
          } catch (error) {
            console.error('Comment error:', error);
            showToast('Error posting comment.', 'error');
          }
        });
        commentsContainer.appendChild(commentForm);
      } catch (error) {
        console.error('Comments load error:', error);
        commentsContainer.innerHTML = '<p class="empty-state">Could not load comments.</p>';
      }
    });
  });
}

if (postForm) {
  postForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('postTitle').value.trim();
    const bodyText = document.getElementById('postBody').value.trim();
    if (!title || !bodyText) {
      postStatus.textContent = 'Please add title and content.';
      postStatus.className = 'form-status error';
      return;
    }

    postStatus.textContent = 'Posting...';
    postStatus.className = 'form-status';
    try {
      const resp = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ title, body: bodyText }),
      });
      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(errorData.error || 'Post failed');
      }
      postStatus.textContent = 'Post created.';
      postStatus.className = 'form-status success';
      postForm.reset();
      await loadPosts();
    } catch (error) {
      postStatus.textContent = error.message;
      postStatus.className = 'form-status error';
    }
  });
}

async function loadCommunityStats() {
  try {
    const resp = await fetch('/api/community-stats', { credentials: 'same-origin' });
    if (!resp.ok) throw new Error('Failed to load stats');
    const stats = await resp.json();

    document.getElementById('statPosts').textContent = stats.totalPosts != null ? stats.totalPosts : '0';
    document.getElementById('statUsers').textContent = stats.totalUsers != null ? stats.totalUsers : '0';
    document.getElementById('statPatrols').textContent = stats.totalPatrolMembers != null ? stats.totalPatrolMembers : '0';
    document.getElementById('statReports').textContent = stats.totalReports != null ? stats.totalReports : '0';

    document.getElementById('recentMembers').innerHTML = stats.recentMembers && stats.recentMembers.length
      ? stats.recentMembers.map((m) => `<div>${escapeHtml(m.name)} (${escapeHtml(m.role)})</div>`).join('')
      : '<div>No recent members</div>';
    document.getElementById('recentPatrols').innerHTML = stats.recentPatrolMembers && stats.recentPatrolMembers.length
      ? stats.recentPatrolMembers.map((p) => `<div>${escapeHtml(p.name)}</div>`).join('')
      : '<div>No recent patrol members</div>';
    document.getElementById('recentReports').innerHTML = stats.recentReports && stats.recentReports.length
      ? stats.recentReports.map((r) => `<div>${escapeHtml(r.reported_email || 'Unknown')} - ${escapeHtml((r.message || '').substring(0, 60))}${(r.message || '').length > 60 ? '...' : ''}</div>`).join('')
      : '<div>No recent reports</div>';

    if (currentUser?.role === 'admin') {
      reportStatsCard.style.display = 'block';
      recentReportsCard.style.display = 'block';
      pushNotification(`Admin alert: ${stats.totalReports || 0} total reports.`);
    }

    if (currentUser?.role === 'patrol') {
      patrolQuickCard.style.display = 'block';
      pushNotification(`Patrol update: ${stats.totalReports || 0} reports to review.`);
    }
  } catch (error) {
    console.error('Stats load error:', error);
  }
}

async function loadAssignedComplaints() {
  if (!assignedComplaintsContainer) return;
  try {
    const resp = await fetch('/api/reports', { credentials: 'same-origin' });
    if (!resp.ok) throw new Error('Failed to load assigned complaints');
    const reports = await resp.json();
    if (!reports.length) {
      assignedComplaintsContainer.innerHTML = '<p class="empty-state">No complaints are currently assigned to you.</p>';
      return;
    }

    assignedComplaintsContainer.innerHTML = reports.map((r) => `
      <article class="card">
        <h4>${escapeHtml(r.reported_email || 'Unknown')}</h4>
        <p>${escapeHtml(r.message || 'No details provided.')}</p>
        <p class="empty-state">Received ${timeAgo(r.created_at)}</p>
      </article>
    `).join('');
  } catch (error) {
    console.error('Assigned complaints load error:', error);
    assignedComplaintsContainer.innerHTML = '<p class="empty-state">Unable to load assigned complaints.</p>';
  }
}

window.addEventListener('hashchange', setActiveNav);
window.addEventListener('storage', initializeSession);

initializeSession();
setActiveNav();

initializeSession();
loadPosts();
loadCommunityStats();
