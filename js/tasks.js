"use strict";
(function () {
  if (document.body.dataset.page !== "tasks") return;
  const VIEW_KEY = "kridiya_operations_saved_views_v1";
  let sb, user, isAdmin = false, tasks = [], staff = [], selected = new Set();
  const esc = (v) => KridiyaAuth.escapeHTML(String(v == null ? "" : v));
  const label = (v) => KridiyaAuth.statusLabel(v || "Not set");
  const fmt = (v) => v ? new Date(v).toLocaleString("en-GB", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }) : "No due date";
  const filters = () => ({ queue:document.getElementById("task-queue").value, entity:document.getElementById("task-entity").value, priority:document.getElementById("task-priority").value, search:document.getElementById("task-search").value.trim() });
  function visibleTasks() {
    const f=filters(), q=f.search.toLowerCase();
    return tasks.filter((t) => {
      if (f.queue === "active" && (["done","cancelled","snoozed"].includes(t.status) || t.due_bucket === "snoozed")) return false;
      if (f.queue === "mine" && t.assigned_to !== user.id) return false;
      if (f.queue === "unassigned" && t.assigned_to) return false;
      if (["overdue","today","snoozed"].includes(f.queue) && t.due_bucket !== f.queue) return false;
      if (f.queue === "done" && t.status !== "done") return false;
      if (f.entity && t.entity_type !== f.entity) return false;
      if (f.priority && t.priority !== f.priority) return false;
      return !q || [t.title,t.entity_reference,t.entity_title,t.assigned_to_name,t.notes].join(" ").toLowerCase().includes(q);
    });
  }
  function renderSummary() {
    const active=tasks.filter(t=>!["done","cancelled","snoozed"].includes(t.status)&&t.due_bucket!=="snoozed");
    const data=[[active.length,"Active"],[active.filter(t=>t.due_bucket==="overdue").length,"Overdue"],[active.filter(t=>t.due_bucket==="today").length,"Due today"],[active.filter(t=>!t.assigned_to).length,"Unassigned"],[active.filter(t=>t.escalated_at).length,"Escalated"]];
    document.getElementById("tasks-summary").innerHTML=data.map(x=>'<div class="stat-tile"><div class="num">'+x[0]+'</div><div class="label">'+x[1]+'</div></div>').join("");
  }
  function render() {
    renderSummary(); const rows=visibleTasks(); document.getElementById("task-count").textContent=rows.length+" task(s)";
    document.getElementById("tasks-list").innerHTML=rows.length ? rows.map((t)=>{
      const checked=selected.has(t.id)?" checked":"", overdue=t.due_bucket==="overdue"?" is-overdue":"", escalated=t.escalated_at?" is-escalated":"";
      return '<article class="task-card'+overdue+escalated+'"><label class="task-check"><input type="checkbox" data-task-id="'+esc(t.id)+'"'+checked+'><span></span></label><div class="task-card-main"><div class="task-title"><b>'+esc(t.title)+'</b><span class="task-priority priority-'+esc(t.priority)+'">'+esc(label(t.priority))+'</span>'+(t.escalated_at?'<span class="task-escalated">Escalated</span>':'')+'</div><p>'+esc(t.entity_reference||label(t.entity_type))+' · '+esc(t.entity_title||"")+'</p><div class="task-meta"><span>'+esc(label(t.entity_type))+'</span><span>'+esc(label(t.task_type))+'</span><span>'+esc(t.assigned_to_name||"Unassigned")+'</span><span class="due-'+esc(t.due_bucket)+'">'+esc(label(t.due_bucket))+': '+esc(fmt(t.due_at))+'</span></div>'+(t.notes?'<small>'+esc(t.notes)+'</small>':'')+'</div><div class="task-actions"><a class="btn btn-outline" href="'+esc(t.action_url)+'">Open</a>'+(t.status!=="done"?'<button class="btn btn-outline" data-task-done="'+esc(t.id)+'" type="button">Done</button>':'<button class="btn btn-outline" data-task-reopen="'+esc(t.id)+'" type="button">Reopen</button>')+'</div></article>';
    }).join(""):'<div class="account-main empty-state"><p>No tasks match this view.</p></div>';
    updateBulk();
  }
  function updateBulk(){const bar=document.getElementById("task-bulkbar");bar.hidden=!selected.size;document.getElementById("task-selected-count").textContent=selected.size;document.getElementById("task-select-all").checked=visibleTasks().length>0&&visibleTasks().every(t=>selected.has(t.id));}
  function getSaved(){try{return JSON.parse(localStorage.getItem(VIEW_KEY)||"[]");}catch(e){return [];}}
  function renderViews(){const box=document.getElementById("task-saved-views"), views=getSaved();box.innerHTML='<button class="saved-view active" data-view-index="default" type="button">Default</button>'+views.map((v,i)=>'<button class="saved-view" data-view-index="'+i+'" type="button">'+esc(v.name)+'</button>').join("");}
  function applyView(v){document.getElementById("task-queue").value=v.queue||"active";document.getElementById("task-entity").value=v.entity||"";document.getElementById("task-priority").value=v.priority||"";document.getElementById("task-search").value=v.search||"";selected.clear();render();}
  async function bulk(action, ids, extra={}){if(!ids.length)return;const result=await sb.rpc("bulk_update_operations_tasks",{p_task_ids:ids,p_action:action,p_assigned_to:extra.assigned||null,p_snoozed_until:extra.until||null,p_reason:extra.reason||null});if(result.error){toast("Could not update tasks: "+result.error.message);return;}selected.clear();await load();toast(result.data+" task(s) updated.");}
  function tomorrowAtNine() {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    if (date.getDay() === 0) date.setDate(date.getDate() + 1);
    date.setHours(9, 0, 0, 0);
    return date;
  }
  function openSnoozeDialog(ids) {
    const dialog = document.getElementById("task-snooze-dialog");
    const input = document.getElementById("task-snooze-until");
    dialog.dataset.taskIds = JSON.stringify(ids);
    input.value = "";
    dialog.querySelectorAll(".task-snooze-choice").forEach((choice) => choice.classList.remove("selected"));
    dialog.showModal();
  }
  function selectSnoozeUntil(button) {
    const dialog = document.getElementById("task-snooze-dialog");
    const input = document.getElementById("task-snooze-until");
    const date = button.hasAttribute("data-snooze-tomorrow")
      ? tomorrowAtNine()
      : new Date(Date.now() + Number(button.dataset.snoozeMinutes) * 60000);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    input.value = local;
    dialog.querySelectorAll(".task-snooze-choice").forEach((choice) => choice.classList.toggle("selected", choice === button));
  }
  async function confirmSnooze() {
    const dialog = document.getElementById("task-snooze-dialog");
    const input = document.getElementById("task-snooze-until");
    const until = new Date(input.value);
    if (!input.value || Number.isNaN(until.getTime()) || until <= new Date()) return toast("Choose a future snooze time.");
    const ids = JSON.parse(dialog.dataset.taskIds || "[]");
    dialog.close();
    await bulk("snooze", ids, { until: until.toISOString() });
  }
  async function load(){const result=await sb.rpc("list_operations_tasks",{p_limit:600});if(result.error)throw result.error;tasks=result.data||[];render();}
  function wire(){["task-queue","task-entity","task-priority"].forEach(id=>document.getElementById(id).addEventListener("change",()=>{selected.clear();render();}));document.getElementById("task-search").addEventListener("input",()=>{selected.clear();render();});
    document.getElementById("task-select-all").addEventListener("change",e=>{visibleTasks().forEach(t=>e.target.checked?selected.add(t.id):selected.delete(t.id));render();});
    document.getElementById("tasks-list").addEventListener("change",e=>{const cb=e.target.closest("[data-task-id]");if(!cb)return;cb.checked?selected.add(cb.dataset.taskId):selected.delete(cb.dataset.taskId);updateBulk();});
    document.getElementById("tasks-list").addEventListener("click",e=>{const done=e.target.closest("[data-task-done]"),reopen=e.target.closest("[data-task-reopen]");if(done)bulk("done",[done.dataset.taskDone]);if(reopen)bulk("reopen",[reopen.dataset.taskReopen]);});
    document.getElementById("task-bulkbar").addEventListener("click",async e=>{const b=e.target.closest("[data-bulk]");if(!b)return;const ids=Array.from(selected),a=b.dataset.bulk;if(a==="done")return bulk(a,ids);if(a==="snooze")return openSnoozeDialog(ids);if(a==="reassign"){if(!isAdmin)return toast("Owner/admin access required.");const names=staff.map((s,i)=>(i+1)+". "+(s.full_name||s.email)).join("\n"),choice=prompt("Assign to:\n0. Unassigned\n"+names,"0");if(choice===null)return;const n=Number(choice),assigned=n>0&&staff[n-1]?staff[n-1].user_id:null;return bulk(a,ids,{assigned});}if(a==="escalate"){const reason=prompt("Escalation reason:","Owner review required");if(!reason)return;return bulk(a,ids,{reason});}});
    document.getElementById("task-snooze-dialog").addEventListener("click",e=>{const choice=e.target.closest(".task-snooze-choice");if(choice)selectSnoozeUntil(choice);});
    document.getElementById("task-snooze-confirm").addEventListener("click",confirmSnooze);
    document.getElementById("task-save-view").addEventListener("click",()=>{const name=prompt("Name this view:");if(!name)return;const views=getSaved();views.push(Object.assign({name:name.trim()},filters()));localStorage.setItem(VIEW_KEY,JSON.stringify(views.slice(-8)));renderViews();});
    document.getElementById("task-saved-views").addEventListener("click",e=>{const b=e.target.closest("[data-view-index]");if(!b)return;applyView(b.dataset.viewIndex==="default"?{queue:"active"}:getSaved()[Number(b.dataset.viewIndex)]||{});});
  }
  async function boot(){const gate=document.getElementById("tasks-gate"),app=document.getElementById("tasks-app");user=await KridiyaAuth.currentUser();if(!user){renderLoginForm(gate,boot);return;}sb=await KridiyaAuth.client();const [staffCheck,adminCheck,staffList]=await Promise.all([sb.rpc("is_staff"),sb.rpc("is_admin"),sb.rpc("list_staff")]);if(staffCheck.error||staffCheck.data!==true){gate.innerHTML='<div class="account-main empty-state"><p>Staff access required.</p></div>';return;}isAdmin=adminCheck.data===true;staff=(staffList.data||[]).filter(s=>s.active!==false);showStaffNav();gate.hidden=true;app.hidden=false;renderViews();wire();try{await load();}catch(err){gate.hidden=false;app.hidden=true;gate.innerHTML='<div class="account-main empty-state"><p>'+esc(err.message)+'</p></div>';}}
  document.addEventListener("DOMContentLoaded",boot);
})();
