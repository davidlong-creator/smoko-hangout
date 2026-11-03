'use strict';
/* Party: room chat, private DMs/groups, uploaded avatars, and Jitsi voice/screen. */
(function () {
  const $ = id => document.getElementById(id);
  let socket = null, onlineState = null, partyState = null;
  let currentRoom = '', myId = '', myName = 'Player';
  let currentConversation = 'all', chatStore = [], members = [], groups = [];
  let unread = 0, meetApi = null, jitsiPromise = null, activeMediaRoom = '';

  const css = `
    .online-pfp{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;object-fit:cover;background:#3a2024;color:#fff;vertical-align:middle;flex:0 0 auto;}
    .online-pfp-preview{width:48px;height:48px;background-size:cover;background-position:center;font-size:25px;}
    #gpToggle{position:fixed;right:14px;bottom:14px;z-index:9000;display:none;align-items:center;gap:7px;border:0;border-radius:999px;background:#d5a72d;color:#211508;padding:12px 17px;font:800 15px Arial,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.45);cursor:pointer;}
    #gpUnread{display:none;background:#a83232;color:#fff;border-radius:999px;min-width:21px;height:21px;line-height:21px;text-align:center;font-size:12px;}
    #gpPanel{position:fixed;right:14px;bottom:70px;z-index:8999;width:min(400px,calc(100vw - 28px));height:min(680px,78vh);display:none;flex-direction:column;background:#1c0d10;color:#fff4ee;border-radius:18px;box-shadow:0 18px 60px rgba(0,0,0,.65);overflow:hidden;font-family:Inter,"Google Sans",Roboto,Arial,sans-serif;}
    .gp-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#2a1418;}
    .gp-head strong{font-size:18px;}.gp-head small{display:block;color:#c4a3a8;margin-top:2px;}
    .gp-head-actions{display:flex;gap:7px;}.gp-icon{border:0;background:#3a2024;color:#fff;border-radius:9px;width:34px;height:34px;font-size:18px;cursor:pointer;}
    .gp-tabs{display:flex;gap:6px;padding:9px 10px;background:#241013;}.gp-tab{flex:1;border:0;border-radius:9px;padding:9px 5px;background:transparent;color:#d5b7bb;font-weight:800;cursor:pointer;}.gp-tab.active{background:#65303a;color:#fff;}
    .gp-view{flex:1;min-height:0;display:none;flex-direction:column;} .gp-view.active{display:flex;}
    .gp-chat-tools{display:flex;gap:7px;padding:8px 10px;background:#1c0d10;}.gp-chat-tools select{flex:1;min-width:0;}
    #gpConversation,#gpGroupName,#gpInput{background:#12090b;color:#fff;border:0;outline:0;border-radius:9px;padding:10px;}
    #gpNewGroup{border:0;border-radius:9px;background:#3a2024;color:#ffe28a;font-weight:800;cursor:pointer;padding:0 11px;}
    #gpGroupForm{display:none;padding:9px 11px;background:#2a1418;max-height:190px;overflow-y:auto;}
    #gpGroupForm label{display:flex;align-items:center;gap:7px;padding:4px 0;font-size:13px;}#gpGroupName{width:calc(100% - 20px);margin-bottom:7px;}
    .gp-group-actions{display:flex;gap:7px;margin-top:8px;}.gp-group-actions button{flex:1;}
    #gpMessages{flex:1;min-height:0;overflow-y:auto;padding:10px;}
    .gp-empty{color:#b9959b;text-align:center;padding:30px 12px;line-height:1.5;}
    .gp-msg{display:flex;gap:8px;margin:0 0 12px;align-items:flex-start;}.gp-msg.own{flex-direction:row-reverse;}.gp-msg-avatar{width:32px;height:32px;font-size:20px;}
    .gp-bubble{max-width:78%;background:#342027;border-radius:12px;padding:8px 10px;overflow-wrap:anywhere;}.gp-msg.own .gp-bubble{background:#5b2b35;}
    .gp-msg-name{font-size:11px;color:#d6afb5;margin-bottom:3px;}.gp-msg-text{font-size:14px;line-height:1.45;white-space:pre-wrap;}
    .gp-msg-text a{color:#ffe07a;text-decoration:underline;}
    .gp-chat-bottom{padding:9px 10px;background:#241013;}.gp-hint{font-size:11px;color:#b9959b;line-height:1.4;margin-bottom:7px;}
    .gp-input-row{display:flex;gap:7px;}#gpInput{flex:1;min-width:0;}#gpSend{border:0;border-radius:9px;background:#197149;color:#fff;font-weight:900;padding:0 15px;cursor:pointer;}
    .gp-btn{border:0;border-radius:10px;background:#3a2024;color:#fff;font-weight:800;padding:10px 13px;cursor:pointer;}.gp-btn.green{background:#197149;}.gp-btn.gold{background:#d5a72d;color:#211508;}.gp-btn.red{background:#a83232;}.gp-btn:disabled{opacity:.45;}
    #gpMediaView{padding:12px;overflow-y:auto;}#gpMediaView p{color:#d5b7bb;font-size:13px;line-height:1.5;margin:0 0 10px;}
    .gp-media-buttons{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px;}#gpMediaStatus{color:#ffe28a;font-size:12px;line-height:1.5;margin:8px 0;}
    #gpMeet{width:100%;min-height:0;}#gpMeet iframe{width:100%!important;height:460px!important;border:0;border-radius:12px;}
    @media(max-width:520px){#gpPanel{right:7px;bottom:64px;width:calc(100vw - 14px);height:82vh;}#gpToggle{right:9px;bottom:9px;}}
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  const toggle = document.createElement('button'); toggle.id = 'gpToggle'; toggle.type = 'button';
  toggle.innerHTML = '🎉 Party <span id="gpUnread"></span>';
  document.body.appendChild(toggle);
  const panel = document.createElement('aside'); panel.id = 'gpPanel';
  panel.innerHTML = `
    <div class="gp-head"><div><strong>🎉 Party</strong><small id="gpRoom">Room chat</small></div><div class="gp-head-actions"><button class="gp-icon" id="gpPfp" title="Change profile picture">📷</button><button class="gp-icon" id="gpClose" title="Close">×</button></div></div>
    <div class="gp-tabs"><button class="gp-tab active" id="gpChatTab">💬 Text & links</button><button class="gp-tab" id="gpMediaTab">🎙️ Voice & screen</button></div>
    <section class="gp-view active" id="gpChatView">
      <div class="gp-chat-tools"><select id="gpConversation" aria-label="Conversation"><option value="all">🌐 Everyone</option></select><button id="gpNewGroup" title="Create private group">＋ Group</button></div>
      <div id="gpGroupForm"><input id="gpGroupName" placeholder="Group name" maxlength="24"><div id="gpGroupMembers"></div><div class="gp-group-actions"><button class="gp-btn green" id="gpCreateGroup">Create group</button><button class="gp-btn" id="gpCancelGroup">Cancel</button></div><div id="gpGroupError" class="gp-hint"></div></div>
      <div id="gpMessages"></div>
      <div class="gp-chat-bottom"><div class="gp-hint">Paste a file or download link (https://…) and it becomes clickable. Only people in the selected conversation receive it.</div><div class="gp-input-row"><input id="gpInput" maxlength="1000" placeholder="Message or file link…" autocomplete="off"><button id="gpSend">Send</button></div></div>
    </section>
    <section class="gp-view" id="gpMediaView">
      <p>Talk and share your screen with everyone in this game room — from any location. Voice/screen is provided by Jitsi Meet; your browser will ask for microphone permission.</p>
      <div class="gp-media-buttons"><button class="gp-btn green" id="gpJoinMeet">🎙️ Join voice & screen</button><button class="gp-btn gold" id="gpOpenMeet">↗ Open in new tab</button><button class="gp-btn red" id="gpLeaveMeet">Leave</button></div>
      <div class="gp-media-buttons" id="gpMeetControls" style="display:none;"><button class="gp-btn" id="gpMute">🎤 Mute / unmute</button><button class="gp-btn" id="gpScreen">🖥️ Share / stop screen</button></div>
      <div id="gpMediaStatus">Not connected yet.</div><div id="gpMeet"></div>
    </section>`;
  document.body.appendChild(panel);

  function dmKey(a, b) { return `dm:${[a, b].sort().join('-')}`; }
  function updateUnread() { const b = $('gpUnread'); b.style.display = unread ? 'inline-block' : 'none'; b.textContent = unread > 99 ? '99+' : unread; }
  function isChatVisible(conversation) { return panel.style.display === 'flex' && $('gpChatView').classList.contains('active') && currentConversation === conversation; }
  function showTab(name) {
    const chat = name === 'chat';
    $('gpChatView').classList.toggle('active', chat); $('gpMediaView').classList.toggle('active', !chat);
    $('gpChatTab').classList.toggle('active', chat); $('gpMediaTab').classList.toggle('active', !chat);
    if (chat) { unread = 0; updateUnread(); renderMessages(); }
  }
  function avatarNode(person, fallback) {
    const img = person && person.avatarImage;
    if (img) { const el = document.createElement('img'); el.className = 'online-pfp gp-msg-avatar'; el.src = img; el.alt = ''; return el; }
    const el = document.createElement('span'); el.className = 'online-pfp gp-msg-avatar'; el.textContent = (person && person.avatar) || fallback || '🧑'; return el;
  }
  function appendLinkedText(container, text) {
    const parts = String(text).split(/(https?:\/\/[^\s]+)/gi);
    for (const part of parts) {
      if (/^https?:\/\//i.test(part)) {
        const a = document.createElement('a'); a.href = part; a.textContent = part; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow'; container.appendChild(a);
      } else container.appendChild(document.createTextNode(part));
    }
  }
  function renderMessages() {
    const box = $('gpMessages'); if (!box) return;
    const messages = chatStore.filter(m => m.conversation === currentConversation);
    box.innerHTML = '';
    if (!messages.length) {
      const empty = document.createElement('div'); empty.className = 'gp-empty';
      empty.textContent = currentConversation === 'all' ? 'No messages yet. Say hello to everyone!' : 'No messages in this private conversation yet.';
      box.appendChild(empty); return;
    }
    for (const msg of messages) {
      const person = members.find(m => m.id === msg.fromId);
      const row = document.createElement('div'); row.className = 'gp-msg' + (msg.fromId === myId ? ' own' : '');
      row.appendChild(avatarNode(person, '🧑'));
      const bubble = document.createElement('div'); bubble.className = 'gp-bubble';
      const name = document.createElement('div'); name.className = 'gp-msg-name'; name.textContent = msg.from + (msg.fromId === myId ? ' (you)' : ''); bubble.appendChild(name);
      const text = document.createElement('div'); text.className = 'gp-msg-text'; appendLinkedText(text, msg.text); bubble.appendChild(text);
      row.appendChild(bubble); box.appendChild(row);
    }
    box.scrollTop = box.scrollHeight;
  }
  function renderConversationOptions() {
    const select = $('gpConversation'); select.innerHTML = '';
    const valid = new Set(['all']);
    const everyone = document.createElement('option'); everyone.value = 'all'; everyone.textContent = '🌐 Everyone'; select.appendChild(everyone);
    const others = members.filter(m => m.id !== myId);
    if (others.length) {
      const dmGroup = document.createElement('optgroup'); dmGroup.label = 'Private messages';
      for (const person of others) { const key = dmKey(myId, person.id); valid.add(key); const option = document.createElement('option'); option.value = key; option.textContent = `👤 ${person.name}`; dmGroup.appendChild(option); }
      select.appendChild(dmGroup);
    }
    if (groups.length) {
      const groupGroup = document.createElement('optgroup'); groupGroup.label = 'Private groups';
      for (const group of groups) { const key = `group:${group.id}`; valid.add(key); const option = document.createElement('option'); option.value = key; option.textContent = `👥 ${group.name}`; groupGroup.appendChild(option); }
      select.appendChild(groupGroup);
    }
    if (!valid.has(currentConversation)) currentConversation = 'all';
    select.value = currentConversation;
    $('gpNewGroup').style.display = others.length ? 'block' : 'none';
    renderGroupMembers();
  }
  function renderGroupMembers() {
    const box = $('gpGroupMembers'); box.innerHTML = '';
    for (const person of members.filter(m => m.id !== myId)) {
      const label = document.createElement('label');
      const check = document.createElement('input'); check.type = 'checkbox'; check.value = person.id;
      label.appendChild(check); label.appendChild(avatarNode(person, '🧑'));
      const name = document.createElement('span'); name.textContent = person.name; label.appendChild(name); box.appendChild(label);
    }
  }
  function onPartyState(s) {
    if (!s || s.code !== currentRoom) return;
    partyState = s; members = s.members || []; groups = s.groups || []; chatStore = s.chat || [];
    renderConversationOptions(); renderMessages();
    if (meetApi && activeMediaRoom && activeMediaRoom !== s.mediaRoom) leaveMeeting();
  }
  function onPartyMessage(msg) {
    if (!msg) return;
    if (!chatStore.some(m => m.id === msg.id)) chatStore.push(msg);
    if (isChatVisible(msg.conversation)) renderMessages();
    else { unread++; updateUnread(); }
  }
  function leaveMeeting() {
    if (meetApi) { try { meetApi.dispose(); } catch (_) {} }
    meetApi = null; activeMediaRoom = ''; $('gpMeet').innerHTML = '';
    $('gpMeetControls').style.display = 'none'; $('gpMediaStatus').textContent = 'Not connected yet.'; $('gpJoinMeet').disabled = false;
  }
  function loadJitsi() {
    if (window.JitsiMeetExternalAPI) return Promise.resolve();
    if (jitsiPromise) return jitsiPromise;
    jitsiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = 'https://meet.jit.si/external_api.js';
      script.onload = () => resolve();
      script.onerror = () => { jitsiPromise = null; script.remove(); reject(new Error('Could not load the voice service.')); };
      document.head.appendChild(script);
    });
    return jitsiPromise;
  }
  async function joinMeeting() {
    if (meetApi) return;
    if (!partyState || !partyState.mediaRoom) { $('gpMediaStatus').textContent = 'The room is still loading — try again in a moment.'; return; }
    $('gpJoinMeet').disabled = true; $('gpMediaStatus').textContent = 'Loading the private meeting room…';
    try {
      await loadJitsi();
      activeMediaRoom = partyState.mediaRoom;
      meetApi = new window.JitsiMeetExternalAPI('meet.jit.si', {
        roomName: activeMediaRoom, parentNode: $('gpMeet'), width: '100%', height: 460,
        userInfo: { displayName: myName },
        configOverwrite: { startWithVideoMuted: true, prejoinPageEnabled: true },
      });
      meetApi.addListener('videoConferenceJoined', () => { $('gpMediaStatus').textContent = 'Connected. Use the buttons above or the meeting controls.'; $('gpMeetControls').style.display = 'flex'; });
      meetApi.addListener('readyToClose', leaveMeeting);
      $('gpMediaStatus').textContent = 'Meeting loaded — allow microphone access when asked.';
    } catch (err) { $('gpMediaStatus').textContent = `${err.message} Try “Open in new tab” instead.`; leaveMeeting(); }
    $('gpJoinMeet').disabled = false;
  }

  toggle.onclick = () => { const open = panel.style.display === 'flex'; panel.style.display = open ? 'none' : 'flex'; if (!open) showTab('chat'); };
  $('gpClose').onclick = () => { panel.style.display = 'none'; };
  $('gpChatTab').onclick = () => showTab('chat'); $('gpMediaTab').onclick = () => showTab('media');
  $('gpPfp').onclick = () => { const input = $('onlinePfpInput'); if (input) input.click(); };
  $('gpConversation').onchange = e => { currentConversation = e.target.value; unread = 0; updateUnread(); renderMessages(); };
  $('gpNewGroup').onclick = () => { $('gpGroupForm').style.display = 'block'; renderGroupMembers(); };
  $('gpCancelGroup').onclick = () => { $('gpGroupForm').style.display = 'none'; };
  $('gpCreateGroup').onclick = () => {
    if (!socket) return;
    const memberIds = [...$('gpGroupMembers').querySelectorAll('input:checked')].map(x => x.value);
    if (!memberIds.length) { $('gpGroupError').textContent = 'Choose at least one other player.'; return; }
    socket.emit('partyCreateGroup', { name: $('gpGroupName').value, memberIds }, res => {
      if (!res || !res.ok) { $('gpGroupError').textContent = (res && res.error) || 'Could not create the group.'; return; }
      $('gpGroupError').textContent = ''; $('gpGroupName').value = ''; $('gpGroupForm').style.display = 'none';
      currentConversation = `group:${res.group.id}`; renderConversationOptions(); renderMessages();
    });
  };
  function sendChat() { const input = $('gpInput'), text = input.value.trim(); if (!text || !socket) return; socket.emit('partyChat', { conversation: currentConversation, text }); input.value = ''; input.focus(); }
  $('gpSend').onclick = sendChat; $('gpInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
  $('gpJoinMeet').onclick = joinMeeting; $('gpLeaveMeet').onclick = leaveMeeting;
  $('gpOpenMeet').onclick = () => {
    if (!partyState || !partyState.mediaRoom) { $('gpMediaStatus').textContent = 'The room is still loading.'; return; }
    const a = document.createElement('a'); a.href = `https://meet.jit.si/${encodeURIComponent(partyState.mediaRoom)}`; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.click();
  };
  $('gpMute').onclick = () => { if (meetApi) meetApi.executeCommand('toggleAudio'); };
  $('gpScreen').onclick = () => { if (meetApi) meetApi.executeCommand('toggleShareScreen'); };
  window.addEventListener('beforeunload', leaveMeeting);

  window.GameParty = {
    connect(s) { if (!s || socket === s) return; socket = s; socket.on('partyState', onPartyState); socket.on('partyMessage', onPartyMessage); },
    onlineState(s) {
      if (!s || !s.code) { panel.style.display = 'none'; toggle.style.display = 'none'; leaveMeeting(); return; }
      if (currentRoom && currentRoom !== s.code) { leaveMeeting(); chatStore = []; currentConversation = 'all'; }
      currentRoom = s.code; onlineState = s; myId = s.meId;
      const me = (s.lobbyPlayers || []).find(p => p.id === myId); myName = me ? me.name : 'Player';
      $('gpRoom').textContent = `Room ${s.code}`; toggle.style.display = 'inline-flex';
    },
  };
})();
