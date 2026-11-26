(() => {
  const publicWorkspace = document.currentScript.hasAttribute('data-public-workspace');
  let revision;

  async function request(url, options) {
    const response = await fetch(url, {cache: 'no-store', ...options});
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const error = new Error(payload.error || 'Server belum bisa dihubungi.');
      error.status = response.status;
      throw error;
    }
    return response;
  }

  async function sendJson(url, method, data) {
    const response = await request(url, {
      method,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data)
    });
    return response.json();
  }

  async function readWorkspace() {
    const snapshot = await (await request('/api/workspace')).json();
    revision = snapshot.revision;
    return snapshot.data;
  }

  function signIn() {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal';
    dialog.setAttribute('aria-labelledby', 'teamLoginTitle');
    dialog.innerHTML = `
      <form>
        <h3 id="teamLoginTitle">Masuk ke Smart Audit</h3>
        <p class="cap">Gunakan kode tim untuk membuka data audit bersama.</p>
        <div class="field">
          <label for="teamCode">Kode Tim</label>
          <input type="password" id="teamCode" autocomplete="current-password" required autofocus>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn">Masuk</button>
          <p class="form-status error" role="status"></p>
        </div>
      </form>`;
    document.body.append(dialog);
    dialog.addEventListener('cancel', event => event.preventDefault());
    dialog.showModal();
    const form = dialog.querySelector('form');
    const submit = form.querySelector('button');
    const field = form.querySelector('input');
    const status = form.querySelector('.form-status');
    return new Promise(resolve => {
      form.onsubmit = async event => {
        event.preventDefault();
        submit.disabled = true;
        status.textContent = '';
        try {
          await sendJson('/api/login', 'POST', {code: field.value});
          const data = await readWorkspace();
          dialog.close();
          dialog.remove();
          resolve(data);
        } catch (error) {
          status.textContent = error.message;
          field.select();
        } finally {
          submit.disabled = false;
        }
      };
    });
  }

  function addWorkspaceControls() {
    const reload = document.createElement('button');
    reload.className = 'btn sec sm';
    reload.textContent = 'Muat Ulang';
    reload.type = 'button';
    reload.onclick = () => location.reload();
    document.getElementById('btnAdd').after(reload);
    if (publicWorkspace) return;
    const logout = reload.cloneNode(false);
    logout.textContent = 'Keluar';
    logout.onclick = async () => {
      logout.disabled = true;
      try {
        await request('/api/logout', {method: 'POST'});
      } catch (error) {
        if (error.status !== 401) {
          alert(error.message);
          return;
        }
      } finally {
        logout.disabled = false;
      }
      location.reload();
    };
    reload.after(logout);
  }

  window.smartAuditCloud = {
    isNewWorkspace() {
      return revision === 0;
    },
    async open() {
      let data;
      try {
        data = await readWorkspace();
      } catch (error) {
        if (publicWorkspace || error.status !== 401) throw error;
        data = await signIn();
      }
      addWorkspaceControls();
      return data;
    },
    async save(state) {
      const result = await sendJson('/api/workspace', 'PUT', {
        revision,
        data: {companies: state.companies, regs: state.regs}
      });
      revision = result.revision;
    },
    async putFile(id, file) {
      const path = `/api/files/${encodeURIComponent(id)}`;
      if (window.smartAuditDirectUpload) {
        if (file.size > 10 * 1024 * 1024) throw new Error('Ukuran berkas maksimal 10 MB.');
        const ticket = await sendJson(path + '/upload-token', 'POST', {});
        await window.smartAuditDirectUpload(ticket, file);
      } else {
        await request(path, {method: 'POST', body: file});
      }
    },
    async getFile(id) {
      return (await request(`/api/files/${encodeURIComponent(id)}`)).blob();
    },
    async removeFile(id) {
      await request(`/api/files/${encodeURIComponent(id)}`, {method: 'DELETE'});
    }
  };
})();
