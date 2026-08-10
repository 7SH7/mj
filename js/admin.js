'use strict';

const byId = id => document.getElementById(id);
const login = byId('adminLogin'), panel = byId('adminPanel'), list = byId('adminMapList'), errorBox = byId('adminLoginError');
const escapeText = value => { const span = document.createElement('span'); span.textContent = String(value); return span.innerHTML; };

async function request(options = {}) {
  const response = await fetch('/api/admin', { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || '요청 실패'), { status: response.status });
  return data;
}

async function loadMaps() {
  const data = await request();
  login.classList.add('is-hidden'); panel.classList.remove('is-hidden');
  list.innerHTML = data.maps.length ? data.maps.map(map => `<article class="admin-map-row"><div><b>${escapeText(map.name)}</b><small>${map.communityCode} · 난이도 ${map.difficulty} · 별점 ${map.rating.average || 0} (${map.rating.count})</small></div><strong class="${map.reportCount >= 10 ? 'is-actionable' : ''}">신고 ${map.reportCount}</strong><button type="button" data-admin-delete="${map.communityCode}" ${map.reportCount < 10 ? 'disabled' : ''}>영구 삭제</button></article>`).join('') : '<p class="empty-room-list">등록된 공유 맵이 없습니다.</p>';
  list.querySelectorAll('[data-admin-delete]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('이 커스텀 맵을 영구 삭제할까요? 되돌릴 수 없습니다.')) return;
    button.disabled = true;
    try { await request({ method: 'DELETE', body: JSON.stringify({ code: button.dataset.adminDelete }) }); await loadMaps(); }
    catch (error) { alert(error.message); button.disabled = false; }
  }));
}

byId('adminLoginForm').addEventListener('submit', async event => {
  event.preventDefault(); errorBox.textContent = '';
  try { await request({ method: 'POST', body: JSON.stringify({ action: 'login', id: byId('adminId').value, password: byId('adminPassword').value }) }); byId('adminPassword').value = ''; await loadMaps(); }
  catch (error) { errorBox.textContent = error.message; }
});
byId('adminRefresh').addEventListener('click', () => loadMaps().catch(error => alert(error.message)));
byId('adminLogout').addEventListener('click', async () => { await request({ method: 'POST', body: JSON.stringify({ action: 'logout' }) }); location.reload(); });
loadMaps().catch(error => { if (error.status !== 401) errorBox.textContent = error.message; });
