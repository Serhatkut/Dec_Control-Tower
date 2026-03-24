// Constants & Logic for V7
const HUBS = ['BCN', 'MAD', 'FRA', 'CDG', 'LHR', 'AMS', 'IST', 'JFK', 'DEL', 'KUL', 'BKK', 'SYD'];
const EU_HUBS = ['BCN', 'MAD', 'FRA', 'CDG', 'AMS'];
const PHASES = ['Manifested', 'Pick Up', 'Origin SC', 'Origin Hub', 'Export Customs', 'Linehaul', 'Import Customs', 'Dest Hub', 'Dest SC', 'Out for Delivery', 'Delivered', 'Exception'];
const TIMELINE_PHASES = ['Manifested', 'Pick Up', 'Origin SC', 'Origin Hub', 'Export Customs', 'Linehaul', 'Import Customs', 'Dest Hub', 'Dest SC', 'Out for Delivery', 'Delivered'];
const PRODUCT_TYPES = ['Next Day', 'Standard', 'Economy', 'Returns'];
const CUSTOMERS = ['Amazon', 'Zalando', 'Asos', 'Inditex', 'H&M', 'Nike', 'Adidas', 'Shein'];
const EXCEPTION_CAUSES = ['Bad Address', 'Bad Address', 'Customer Not Home', 'Customer Refused', 'Customer Not Home', 'Access Restricted', 'Force Majeure', 'Weather Delay', 'Customs Hold', 'Damaged in Transit', 'Pick up not successful', 'Network Delay'];
const PHASE_ICONS = { 
    'Manifested': 'assets/icons/document.png', 
    'Pick Up': 'assets/icons/service_point.png', 
    'Origin SC': 'assets/icons/post.png', 
    'Origin Hub': 'assets/icons/hub_main.png', 
    'Export Customs': 'assets/icons/globe.png', 
    'Linehaul': 'assets/icons/route.png', 
    'Import Customs': 'assets/icons/globe.png', 
    'Dest Hub': 'assets/icons/hub_main.png', 
    'Dest SC': 'assets/icons/city.png', 
    'Out for Delivery': 'assets/icons/delivery.png', 
    'Delivered': 'assets/icons/store.png', 
    'Exception': '⚠️' 
};
const EDD_BUCKETS_ORDER = ["s4+ or more", "-3", "-2", "Yesterday", "Today", "Tomorrow", "+2", "+3", "4+ or more"];
const SCAN_AGING_ORDER_DAYS = ["Today", "Yesterday", "D-2", "D-3", "D-4", "D-5+"]; 

const START_PARCEL_COUNT = 8000;
let shipments = [];
let state = { filterScope: 'All', filters: {}, timer: 120, lastUpdated: new Date(), role: 'admin', roleEntity: null, roleDirection: 'both' };

function randomChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function getMidnight(date) { const d = new Date(date); d.setHours(0,0,0,0); return d.getTime(); }

function getEDDBucket(timestamp) {
    const dayOffset = Math.ceil((getMidnight(timestamp) - getMidnight(Date.now())) / 86400000);
    if (dayOffset <= -4) return "s4+ or more"; if (dayOffset === -3) return "-3";
    if (dayOffset === -2) return "-2"; if (dayOffset === -1) return "Yesterday";
    if (dayOffset === 0) return "Today"; if (dayOffset === 1) return "Tomorrow";
    if (dayOffset === 2) return "+2"; if (dayOffset === 3) return "+3";
    return "4+ or more";
}
function getScanAgingBucket(timestamp) {
    return Math.ceil((getMidnight(Date.now()) - getMidnight(timestamp)) / 86400000);
}
function getStatusForAge(ageStr) {
    if (ageStr === "D-5+" || ageStr === "D-4") return "Critical";
    if (ageStr === "D-3" || ageStr === "D-2") return "Warning";
    return "Normal";
}
function getScanGroupDay(dayOffset) {
    if (dayOffset >= 5) return "D-5+"; if (dayOffset === 4) return "D-4";
    if (dayOffset === 3) return "D-3"; if (dayOffset === 2) return "D-2";
    if (dayOffset === 1) return "Yesterday";
    return "Today";
}
function generateShipment() {
    const origin_hub = randomChoice(HUBS); const dest_hub = randomChoice(HUBS);
    const origin_sc = origin_hub + '-SC' + randomInt(1, 3); const dest_sc = dest_hub + '-SC' + randomInt(1, 3);
    const is_domestic = origin_hub === dest_hub;
    const is_inner_eu = !is_domestic && EU_HUBS.includes(origin_hub) && EU_HUBS.includes(dest_hub);
    const is_cross_border = !is_domestic && !is_inner_eu; 

    let sla_hours, ctd_hours;
    if (is_domestic) {
        sla_hours = randomChoice([24, 48]);
        ctd_hours = randomChoice([32, 35, 38, 40]);
    } else if (is_inner_eu) {
        sla_hours = randomChoice([48, 72]);
        ctd_hours = randomChoice([50, 55, 60, 65]);
    } else {
        sla_hours = randomChoice([96, 120, 144, 168]);
        ctd_hours = randomChoice([80, 100, 120, 150]);
    }

    // Force global KPIs dynamically (Target ~ 95% OTD)
    const failsOtd = Math.random() > 0.99;
    if (failsOtd) {
        if (ctd_hours <= sla_hours) ctd_hours = sla_hours + randomInt(12, 48);
    } else {
        if (ctd_hours > sla_hours) ctd_hours = sla_hours - randomInt(2, 24);
    }

    const now = Date.now();
    const isPending = Math.random() < 0.40; 
    const isException = Math.random() < 0.05; // 5% of Pending
    
    let manifested_time, edd_timestamp, current_phase;
    let computedEddOffsetDays = 0;

    if (!isPending) {
        let delivered_time = now - (Math.random() * 14 * 86400000);
        manifested_time = delivered_time - (ctd_hours * 3600000);
        edd_timestamp = manifested_time + (sla_hours * 3600000);
    } else {
        let pt = Math.random(); 
        if (pt < 0.45) computedEddOffsetDays = 0; 
        else if (pt < 0.70) computedEddOffsetDays = 1; 
        else if (pt < 0.90) computedEddOffsetDays = 2; 
        else if (pt < 0.98) computedEddOffsetDays = randomInt(3, 8); // Future volume
        else computedEddOffsetDays = randomInt(-3, -1); // Past volume (Only 2% of Pending)
        
        const todayMidnight = getMidnight(now);
        // Anchor EDD strictly between 8 AM and 8 PM of the targeted day to prevent midnight spillover
        let eddH = randomInt(8, 20);
        edd_timestamp = todayMidnight + (computedEddOffsetDays * 86400000) + eddH*3600000;
        
        // Subdue massive artificial backlog spikes by shifting today's past-due SLA targets out into the remaining shift
        if (computedEddOffsetDays === 0 && edd_timestamp < now) {
            if (Math.random() < 0.85) { // 85% of early EDDs get pushed out, leaving ~15% to accumulate organically as backlog
                edd_timestamp = now + randomInt(1, 6) * 3600000;
            }
        }
        
        manifested_time = edd_timestamp - (sla_hours * 3600000);
        if (manifested_time > now) {
            let diff = manifested_time - now + randomInt(3600000, 10800000);
            manifested_time -= diff; // Only shift manifestation early, preserve structural EDD bucket
        }
    }

    let p_off = {};
    if (is_domestic || is_inner_eu) {
        p_off = { 'Manifested':0, 'Pick Up':0.10, 'Origin SC':0.15, 'Origin Hub':0.18, 'Linehaul':0.20, 'Dest Hub':0.80, 'Dest SC':0.85, 'Out for Delivery':0.90, 'Delivered':1.0 };
    } else {
        p_off = { 'Manifested':0, 'Pick Up':0.05, 'Origin SC':0.08, 'Origin Hub':0.12, 'Export Customs':0.15, 'Linehaul':0.20, 'Import Customs':0.75, 'Dest Hub':0.85, 'Dest SC':0.88, 'Out for Delivery':0.92, 'Delivered':1.0 };
    }

    let progress = (now - manifested_time) / (ctd_hours * 3600000);
    if (!isPending) progress = 1.0;
    
    if (isPending) {
        progress += (Math.random() * 0.50 - 0.25); // Organic +/- 25% momentum drift
        
        if (computedEddOffsetDays < 0) { // Delayed (Past Due) Volumes
            if (Math.random() < 0.60) {
                progress = Math.random() * 0.85; // 60% chance of being stranded upstream (e.g., stuck in Origin, Customs, Linehaul)
            }
        } else if (computedEddOffsetDays >= 1) { // Future SLA Deliveries
            if (Math.random() < 0.35) {
                progress = Math.random() * 0.15; // 35% chance a future EDD parcel was freshly manifested regardless of SLA duration
            }
        }
        if (progress < 0) progress = 0.01;
        if (progress >= 1.0) progress = 0.99;
    }

    const active_phases = TIMELINE_PHASES.filter(p => p_off[p] !== undefined);
    current_phase = active_phases[0];
    for (let p of active_phases) { if (progress >= p_off[p]) current_phase = p; }

    let exception_cause = null; let failed_phase = null;
    if (isException && isPending) {
        current_phase = 'Exception';
        exception_cause = randomChoice(EXCEPTION_CAUSES);
        if (['Customer Not Home', 'Bad Address'].includes(exception_cause)) failed_phase = 'Out for Delivery';
        else if (exception_cause === 'Pick up not successful') failed_phase = 'Manifested';
        else if (['Weather Delay', 'Network Delay'].includes(exception_cause)) failed_phase = randomChoice(['Pick Up', 'Origin Hub', 'Linehaul', 'Dest Hub']);
        else if (['Customs Hold'].includes(exception_cause)) failed_phase = is_cross_border ? randomChoice(['Export Customs', 'Import Customs']) : 'Linehaul';
        else failed_phase = 'Linehaul';
    }

    let targetPhase = current_phase === 'Exception' ? failed_phase : current_phase;
    let targetIdx = active_phases.indexOf(targetPhase);
    if (targetIdx === -1) targetIdx = active_phases.length - 1;

    let scan_history = {};
    let last_scan_time = manifested_time;
    
    for (let i = 0; i <= targetIdx; i++) {
        const p = active_phases[i];
        let loc = '';
        if (p === 'Manifested' || p === 'Pick Up' || p === 'Origin SC') loc = origin_sc;
        else if (p === 'Origin Hub' || p === 'Export Customs' || p === 'Linehaul') loc = origin_hub;
        else if (p === 'Import Customs' || p === 'Dest Hub') loc = dest_hub;
        else loc = dest_sc;
        
        let baseline = manifested_time + (p_off[p] * ctd_hours * 3600000);
        let variance = i === 0 ? 0 : randomInt(-1800000, 1800000);
        let sim_time = baseline + variance;
        if (sim_time > now && isPending) sim_time = now; 
        
        scan_history[p] = { time: sim_time, location: loc };
        last_scan_time = sim_time;
    }

    // Force Exception for > 2 days physical stagnation
    if (isPending && current_phase !== 'Exception' && current_phase !== 'Linehaul') {
        const hoursStagnant = (now - last_scan_time) / 3600000;
        if (hoursStagnant > 48) {
            failed_phase = current_phase;
            current_phase = 'Exception';
            if (failed_phase === 'Out for Delivery') exception_cause = randomChoice(['Bad Address', 'Customer Refused', 'Damaged / Repacked']);
            else if (failed_phase === 'Dest SC' || failed_phase === 'Origin SC') exception_cause = randomChoice(['Pick up not successful', 'Volume Lost', 'Damaged in Node']);
            else if (failed_phase === 'Import Customs' || failed_phase === 'Export Customs') exception_cause = 'Customs Hold';
            else exception_cause = randomChoice(['Damaged in Hub', 'Routing Error - Mis-sort']);
        }
    }

    return {
        shipment_id: crypto.randomUUID(), customer_name: randomChoice(CUSTOMERS), product_type: randomChoice(PRODUCT_TYPES),
        origin_hub: origin_hub, dest_hub: dest_hub, origin_sc: origin_sc, dest_sc: dest_sc,
        current_phase: current_phase, edd_timestamp: edd_timestamp, last_scan_timestamp: last_scan_time, is_cross_border: is_cross_border,
        exception_cause: exception_cause, failed_phase: failed_phase, scan_history: scan_history
    };
}
function initData() { 
    shipments = Array.from({length: START_PARCEL_COUNT}, generateShipment); 
    document.getElementById('lastUpdated').innerText = `Last Updated: ${state.lastUpdated.toLocaleTimeString()}`;
}

function showToast(html) {
    const t = document.getElementById('toast-alert');
    if(!t) return;
    t.innerHTML = html;
    t.classList.add('show');
    if(window.toastTimeout) clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => { t.classList.remove('show'); }, 6000);
}

window.alertHighlightTarget = null;

function applyRedFilter(element, filterJsonStr) {
    const filters = JSON.parse(filterJsonStr.replace(/&quot;/g, '"'));
    
    if (filters.customer_name) window.alertHighlightTarget = { type: 'customer_name', value: filters.customer_name };
    else if (filters.edd_bucket && filters.current_phase) window.alertHighlightTarget = { type: 'matrix', value: `${filters.edd_bucket}-${filters.current_phase}` };
    else if (filters.origin_sc) window.alertHighlightTarget = { type: 'origin_sc', value: filters.origin_sc };
    else if (filters.dest_sc) window.alertHighlightTarget = { type: 'dest_sc', value: filters.dest_sc };
    else if (filters.dest_hub && !filters.origin_hub) window.alertHighlightTarget = { type: 'dest_hub', value: filters.dest_hub };

    state.filters = {}; state.filterScope = 'All';
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-filter="All"]').classList.add('active');
    
    state.filters = filters; renderAll();
    closeRedsModal();
    if (typeof closeTicketModal === 'function') closeTicketModal();
    const fStr = Object.values(filters).join(' & ');
    showToast(`<div style="font-size:16px; margin-bottom:8px; font-weight:bold; color:var(--dhl-yellow);">🚨 Critical Bottleneck Isolated</div>Filters Applied: <strong>${fStr}</strong>`);
}

function triggerAlertFlash(target) {
    setTimeout(() => {
        const selector = `[data-flash-type="${target.type}"][data-flash-value="${target.value}"]`;
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (el.tagName.toLowerCase() === 'tr' || el.tagName.toLowerCase() === 'td') {
                el.classList.add('flash-html');
                setTimeout(() => el.classList.remove('flash-html'), 4000);
            } else {
                el.classList.add('flash-svg');
                setTimeout(() => el.classList.remove('flash-svg'), 4000);
            }
        });
    }, 100);
}
function closeRedsModal() { document.getElementById('reds-modal').style.display = 'none'; }
function showHelpModal() { document.getElementById('help-modal').style.display = 'flex'; }
function closeHelpModal() { document.getElementById('help-modal').style.display = 'none'; }

const RESOLUTION_ACTIONS = {
    'Customer': [{text: 'Proactive Alert', icon: '<img src="assets/icons/mail_rgb_red.png" style="height:28px;">'}, {text: 'SLA Waiver', icon: '<img src="assets/icons/receipt_rgb_red.png" style="height:28px;">'}, {text: 'Split Volume', icon: '<img src="assets/icons/redirect_labeling_rgb_red.png" style="height:28px;">'}, {text: 'Escalate Dir.', icon: '<img src="assets/icons/general_warning_rgb_red.png" style="height:28px;">'}],
    'FirstMile': [{text: 'Ad-Hoc Sweepers', icon: '<img src="assets/icons/delivery_van_rgb_red.png" style="height:28px;">'}, {text: 'Relocate Volume', icon: '<img src="assets/icons/redirect_rgb_red.png" style="height:28px;">'}, {text: 'Extend Hours', icon: '<img src="assets/icons/live_tracking_rgb_red.png" style="height:28px;">'}],
    'MidMile': [{text: 'Ad-Hoc Linehaul', icon: '<img src="assets/icons/truck_road_freight_rgb_red.png" style="height:28px;">'}, {text: 'Upgrade Air', icon: '<img src="assets/icons/plane_take_off_rgb_red.png" style="height:28px;">'}, {text: 'Alternate Hub', icon: '<img src="assets/icons/location_rgb_red.png" style="height:28px;">'}],
    'LastMile': [{text: 'Ad-Hoc Couriers', icon: '<img src="assets/icons/e-trike_rgb_red.png" style="height:28px;">'}, {text: 'Weekend Delivery', icon: '<img src="assets/icons/home_delivery_rgb_red.png" style="height:28px;">'}, {text: '3rd Party Partner', icon: '<img src="assets/icons/handshake.png" style="height:28px;">'}],
    'System': [{text: 'Origin Bypass', icon: '<img src="assets/icons/general_warning_rgb_red.png" style="height:28px;">'}, {text: 'Temp Staff', icon: '<img src="assets/icons/contact.png" style="height:28px;">'}, {text: 'Emergency Repack', icon: '<img src="assets/icons/primary_secondary_packaging_rgb_red.png" style="height:28px;">'}]
};

let SYSTEM_TICKETS = [];
let ticketIdCounter = 1000;

function createTicket(type, title, desc, filter, role, entity, auto=false) {
    const existing = SYSTEM_TICKETS.find(t => t.title === title);
    if(existing) return; // Prevent duplicates in active session
    
    SYSTEM_TICKETS.push({
        id: `TKT-${ticketIdCounter++}`,
        type, title, desc, filter, role, entity,
        status: 'OPEN',
        autoGenerated: auto,
        timestamp: new Date()
    });
    showToast(`<div style="font-size:16px; margin-bottom:8px; font-weight:bold; color:var(--dhl-yellow);">🎫 Ticket Dispatched</div>${title} assigned to ${role.replace('_', ' ').toUpperCase()}`);
}

function manualTicket(idx, type, title, desc, filterJson, role, entity) {
    createTicket(type, title, desc, JSON.parse(filterJson), role, entity, false);
    document.getElementById(`ticket-btn-${idx}`).outerHTML = `<span style="color:var(--dhl-yellow); font-size:11px; font-weight:bold;">🎫 Ticket Created</span>`;
    updateInboxCount();
}

function updateInboxCount() {
    const role = document.getElementById('roleSelect').value;
    const entity = document.getElementById('entitySelect').value;
    
    let visible = SYSTEM_TICKETS;
    if(role !== 'admin') {
        visible = visible.filter(t => t.role === role);
        if(document.getElementById('entityWrapper').style.display !== 'none' && entity && entity !== 'All') {
            visible = visible.filter(t => t.entity === entity);
        }
    }
    const openCount = visible.filter(t => t.status === 'OPEN').length;
    const btn = document.getElementById('inboxBtn');
    if(btn) btn.innerHTML = `<img src="assets/icons/ticket_rgb_red.png" style="height:16px; filter:brightness(0);"> Inbox (${openCount})`;
}

function showTicketInbox() {
    const role = document.getElementById('roleSelect').value;
    const entity = document.getElementById('entitySelect').value;
    
    let visible = SYSTEM_TICKETS;
    if(role !== 'admin') {
        visible = visible.filter(t => t.role === role);
        if(document.getElementById('entityWrapper').style.display !== 'none' && entity && entity !== 'All') {
            visible = visible.filter(t => t.entity === entity);
        }
    }

    const list = document.getElementById('ticket-list');
    if(visible.length === 0) {
        list.innerHTML = '<div style="color:#666; font-style:italic;">Inbox empty. No tickets assigned to your role/entity.</div>';
    } else {
        list.innerHTML = visible.reverse().map(t => {
            const isAutoStr = t.autoGenerated ? `<span style="background:var(--dhl-red); color:#fff; padding:2px 6px; border-radius:4px; font-size:10px;">AUTO-GENERATED</span>` : `<span style="background:var(--dhl-yellow); color:#000; padding:2px 6px; border-radius:4px; font-size:10px;">MANUAL</span>`;
            const statusColor = t.status === 'OPEN' ? 'var(--dhl-red)' : '#00cc66';
            const filterStr = JSON.stringify(t.filter).replace(/"/g, '&quot;');
            
            let actionHtml = '';
            if (t.status === 'OPEN') {
                const acts = RESOLUTION_ACTIONS[t.type] || [{text: 'Investigate', icon: '🔍'}];
                const cardsHtml = acts.map((a, i) => `
                    <div id="card-${t.id}-${i}" onclick="selectResolution('${t.id}', '${a.text}', 'card-${t.id}-${i}')"
                         style="border: 1px solid #ccc; border-radius: 6px; padding: 6px; cursor: pointer; text-align: center; width: calc(50% - 4px); background:#fff; transition:0.2s;">
                        <div style="font-size: 16px; margin-bottom: 2px;">${a.icon}</div>
                        <div style="font-size: 9px; line-height:1.1; font-weight: bold; color:#555;">${a.text}</div>
                    </div>`).join('');
                
                actionHtml = `
                    <div style="font-size:10px; font-weight:bold; color:#666; margin-bottom:4px; margin-top:4px;">Select Resolution Strategy:</div>
                    <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;" id="grid-${t.id}">
                        ${cardsHtml}
                    </div>
                    <input type="hidden" id="resolve-action-${t.id}" value=""/>
                    <button class="red-action-btn" style="background:#00cc66; border:none; color:#fff; width:100%; padding: 8px; font-size:13px;" onclick="resolveTicket('${t.id}')">Resolve & Close Ticket</button>`;
            } else {
                actionHtml = `<div style="font-size:11px; color:#00cc66; font-weight:bold; text-align:center; padding:8px; border:2px solid #00cc66; border-radius:6px; background:rgba(0,204,102,0.1); margin-top:8px;">✅ Resolved via:<br><span style="color:#333; font-size:13px;">${t.resolution_action}</span></div>`;
            }

            return `<div class="red-item" style="border-left: 4px solid ${statusColor}; margin-bottom: 8px;">
                        <div class="red-content" style="flex:1;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                <div style="font-weight:bold; font-size:12px; color:#aaa;">${t.id} - ${isAutoStr}</div>
                                <div style="font-weight:bold; font-size:12px; color:${statusColor};">${t.status}</div>
                            </div>
                            <div class="red-title">${t.title}</div>
                            <div class="red-desc" style="color:#aaa;">${t.desc} | Entity: ${t.entity}</div>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:4px; margin-left:16px; min-width: 220px; justify-content:flex-start;">
                            <button class="red-action-btn" onclick="applyRedFilter(this, '${filterStr}')" style="width:100%; border:1px solid var(--dhl-red); color:var(--dhl-red); background:#fff;">Isolate Root Cause</button>
                            ${actionHtml}
                        </div>
                    </div>`;
        }).join('');
    }
    document.getElementById('ticket-modal').style.display = 'flex';
}

function selectResolution(tId, val, cardId) {
    document.getElementById(`resolve-action-${tId}`).value = val;
    const grid = document.getElementById(`grid-${tId}`);
    if(grid) Array.from(grid.children).forEach(c => c.style.border = '1px solid #ccc');
    const sel = document.getElementById(cardId);
    if(sel) sel.style.border = '2px solid #00cc66';
}

function resolveTicket(tId) {
    const actionSelect = document.getElementById(`resolve-action-${tId}`);
    if (actionSelect && !actionSelect.value) {
        showToast(`<div style="font-size:16px; margin-bottom:8px; font-weight:bold; color:var(--dhl-red);">⚠️ Action Required</div>Please select a valid Resolution Action before closing!`);
        return;
    }
    const t = SYSTEM_TICKETS.find(x => x.id === tId);
    if(t) { 
        t.status = 'RESOLVED'; 
        t.resolution_action = actionSelect ? actionSelect.value : 'System Default';
        updateInboxCount(); 
        showTicketInbox(); 
        showToast(`<div style="font-size:16px; margin-bottom:8px; font-weight:bold; color:#00cc66;">✅ Ticket Closed</div><b>${t.id}</b> resolved via:<br><i>${t.resolution_action}</i>`);
    }
}
function closeTicketModal() { document.getElementById('ticket-modal').style.display = 'none'; }

function autoFilterWorst() {
    let cust = {}; let fm = {}; let mm = {}; let lm = {}; let exc = {};
    
    shipments.forEach(s => {
        if (!cust[s.customer_name]) cust[s.customer_name] = {e:0, s:0};
        const otd = getShipmentOTDStats(s);
        if(otd.isEligible) { cust[s.customer_name].e++; if(otd.isOtdSuccess) cust[s.customer_name].s++; }
        
        if (!fm[s.origin_sc]) fm[s.origin_sc] = {e:0, s:0};
        const otp = getShipmentOTPStats(s);
        if(otp.isEligible) { fm[s.origin_sc].e++; if(otp.isOtpSuccess) fm[s.origin_sc].s++; }
        
        const r = s.origin_hub+'➔'+s.dest_hub;
        if (!mm[r]) mm[r] = {e:0, s:0, oh: s.origin_hub, dh: s.dest_hub};
        const nop = getShipmentNOPStats(s);
        if(nop.isEligible) { mm[r].e++; if(nop.isNopSuccess) mm[r].s++; }
        
        if (!lm[s.dest_sc]) lm[s.dest_sc] = {e:0, s:0};
        if(otd.isEligible) { lm[s.dest_sc].e++; if(otd.isOtdSuccess) lm[s.dest_sc].s++; }
        
        if (s.current_phase === 'Exception') {
            if (!exc[s.dest_hub]) exc[s.dest_hub] = 0;
            exc[s.dest_hub]++;
        }
    });

    const getWorstCollection = (obj, minV) => Object.entries(obj).filter(x=>x[1].e >= minV).map(x=>({k:x[0], fails:x[1].e - x[1].s, score:x[1].s/x[1].e, ...x[1]})).sort((a,b)=>b.fails - a.fails);
    
    let allIssues = [];
    getWorstCollection(cust, 5).slice(0, 3).forEach(c => allIssues.push({type:'Customer', title:`Customer: ${c.k}`, desc:'Severe End-to-End OTD underperformance', score:c.score, fails:c.fails, filter:{customer_name: c.k}, role:'keyaccount', entity: c.k}));
    getWorstCollection(fm, 5).slice(0, 3).forEach(f => allIssues.push({type:'FirstMile', title:`Origin SC: ${f.k}`, desc:'First Mile Pickup Bottleneck', score:f.score, fails:f.fails, filter:{origin_sc: f.k}, role:'sc_manager', entity: f.k}));
    getWorstCollection(mm, 5).slice(0, 3).forEach(m => allIssues.push({type:'MidMile', title:`Route: ${m.k}`, desc:'Linehaul Network Delay', score:m.score, fails:m.fails, filter:{origin_hub: m.oh, dest_hub: m.dh}, role:'network_manager', entity: m.k}));
    getWorstCollection(lm, 5).slice(0, 3).forEach(l => allIssues.push({type:'LastMile', title:`Dest SC: ${l.k}`, desc:'Last Mile Delivery Risk', score:l.score, fails:l.fails, filter:{dest_sc: l.k}, role:'sc_manager', entity: l.k}));
    
    Object.entries(exc).sort((a,b)=>b[1]-a[1]).slice(0, 3).forEach(e => allIssues.push({type:'System', title:`Dest Hub: ${e[0]}`, desc:`Concentration of ${e[1]} Exceptions`, score:0, fails:e[1], filter:{dest_hub: e[0], current_phase: 'Exception'}, isCount:true, count:e[1], role:'hub_manager', entity: e[0]}));

    // Sort absolutely everything by raw fail volume and take top 10
    allIssues.sort((a,b) => b.fails - a.fails);
    const topIssues = allIssues.slice(0, 10);

    // Auto-ticket top 3
    topIssues.slice(0, 3).forEach(iss => createTicket(iss.type, iss.title, iss.desc, iss.filter, iss.role, iss.entity, true));

    const list = document.getElementById('reds-list');
    if (topIssues.length === 0) list.innerHTML = '<div style="color:#666; font-style:italic;">No critical bottlenecks found.</div>';
    else {
        list.innerHTML = topIssues.map((iss, idx) => {
            let icon = '🚨';
            if(iss.type==='FirstMile') icon='📍'; else if(iss.type==='MidMile') icon='🚛'; else if(iss.type==='LastMile') icon='🚚'; else if(iss.type==='Customer') icon='🏢';
            let scoreStr = iss.isCount ? `${iss.count} Cases` : formatPercent(iss.score);
            
            const isAuto = idx < 3;
            const filterStr = JSON.stringify(iss.filter).replace(/"/g, '&quot;');
            
            let ticketAction = isAuto 
                ? `<span style="color:var(--dhl-red); font-size:11px; font-weight:bold; margin-right:8px;">[Auto-Ticketed]</span>`
                : `<button class="red-action-btn" id="ticket-btn-${idx}" onclick="manualTicket(${idx}, '${iss.type}', '${iss.title}', '${iss.desc}', '${filterStr}', '${iss.role}', '${iss.entity}')" style="background:transparent; border:1px solid var(--dhl-yellow); color:var(--dhl-yellow); margin-right:8px;">🎫 Create Ticket</button>`;
            
            return `<div class="red-item">
                        <div class="red-icon">${icon}</div>
                        <div class="red-content">
                            <div class="red-title">${iss.title}</div>
                            <div class="red-desc">${iss.desc} - Map to: ${iss.role.toUpperCase()}</div>
                        </div>
                        <div class="red-score" style="color:var(--dhl-red); padding-right:16px;">${scoreStr}</div>
                        <div style="display:flex; align-items:center;">
                            ${ticketAction}
                            <button class="red-action-btn" id="isolate-btn-${idx}" data-filter="${filterStr}">Isolate</button>
                        </div>
                    </div>`;
        }).join('');
        setTimeout(() => {
            topIssues.forEach((iss, idx) => {
                const btn = document.getElementById(`isolate-btn-${idx}`);
                if(btn) btn.onclick = function() { applyRedFilter(this, this.getAttribute('data-filter')); };
            });
        }, 10);
    }
    document.getElementById('reds-modal').style.display = 'flex';
}

function drawSparkline(id, targetVal, color) {
    const canvas = document.getElementById(id); if(!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return; // Prevent JSDOM headless crash
    const w = canvas.width = canvas.parentElement.clientWidth || 80; const h = canvas.height = 30;
    ctx.clearRect(0,0,w,h);
    const pts = []; let cur = targetVal * 0.8;
    for(let i=0; i<14; i++) { cur += (Math.random()-0.5)*(targetVal*0.1); if(i===13) cur = targetVal; pts.push(cur); }
    const min = Math.min(...pts); const max = Math.max(...pts); const range = (max-min)||1;

    pts.forEach((v,i) => {
        const x = i*(w/13); const y = h - ((v-min)/range)*h*0.8 - h*0.1;
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    const grad = ctx.createLinearGradient(0,0,0,h);
    grad.addColorStop(0, color.replace('1)', '0.15)')); grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad; ctx.fill();
}
// --- Helpers ---
function formatNumber(num) { 
    return (num || 0).toLocaleString('en-US'); 
}

function formatPercent(num) {
    if (num === null || num === undefined) return '-';
    return (num * 100).toFixed(1) + "%";
}

function formatEventTime(timestamp) {
    if (!timestamp) return '-';
    const d = new Date(timestamp);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const hrs = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month} ${hrs}:${mins}`;
}

function getKPIColor(val) { if(val===null) return ''; if(val>=0.98) return 'background-color:#E6F4EA; color:#1E8E3E; font-weight:bold; box-shadow:inset 0 0 0 1px #1E8E3E;'; if(val>=0.95) return 'background-color:#FFF3E0; color:#E65100; font-weight:bold; box-shadow:inset 0 0 0 1px #E65100;'; return 'background-color:#FCE8E6; color:#D40511; font-weight:bold; box-shadow:inset 0 0 0 1px #D40511;'; }

function getHeatmapBg(val, maxVal) {
    if (val === 0) return 'background-color: transparent;';
    const intensity = Math.max(0.05, val / maxVal);
    if (intensity < 0.2) return `background-color: rgba(255, 204, 0, ${intensity.toFixed(2)}); color: #000;`;
    return `background-color: rgba(212, 5, 17, ${intensity.toFixed(2)}); color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.5); font-weight: bold;`;
}

function showSankeyHover(e, src, dst, vol, perfStr) {
    const tooltip = document.getElementById('custom-tooltip');
    if (!tooltip) return;
    
    tooltip.innerHTML = `<strong>Route:</strong> ${src} ➔ ${dst}<br/><strong>Volume:</strong> ${vol.toLocaleString()}<br/><strong>Performance:</strong> ${perfStr}`;
    tooltip.style.display = 'block';
    const limitX = Math.min(e.pageX + 15, window.innerWidth - 200);
    tooltip.style.left = limitX + 'px';
    tooltip.style.top = (e.pageY + 15) + 'px';
}
function showNodeHover(e, nodeName, vol) {
    const tooltip = document.getElementById('custom-tooltip');
    if (!tooltip) return;
    tooltip.innerHTML = `<strong>Node:</strong> ${nodeName}<br/><strong>Total Volume:</strong> ${vol.toLocaleString()}`;
    tooltip.style.display = 'block';
    const limitX = Math.min(e.pageX + 15, window.innerWidth - 200);
    tooltip.style.left = limitX + 'px';
    tooltip.style.top = (e.pageY + 15) + 'px';
}
function hideTooltip() {
    const tooltip = document.getElementById('custom-tooltip');
    if (tooltip) tooltip.style.display = 'none';
}
function showTooltip(e, src, dest, vol, nop) {
    const t = document.getElementById('custom-tooltip');
    if (!src) { t.style.opacity = 0; t.style.display = 'none'; return; }
    t.innerHTML = `<strong>Route:</strong> ${src} ➔ ${dest}<br><strong>Active Undelivered Vol:</strong> ${formatNumber(vol)}<br><strong>4-Wk Hist. Perf:</strong> ${formatPercent(nop)}`;
    t.style.left = e.pageX + 15 + 'px';
    t.style.top = e.pageY + 15 + 'px';
    t.style.display = 'block';
    t.style.opacity = 1;
}

// Analytics Helpers for Tables
function getShipmentKPIs(s) {
    const eddMid = getMidnight(s.edd_timestamp);
    const nowMid = getMidnight(Date.now());
    const dayOffset = Math.ceil((nowMid - eddMid) / 86400000);
    const isEligible = dayOffset >= 1 && dayOffset <= 56;
    
    let stats = { isEligible, expOtdScore: 1, sd: true, nop: true, otd: true, otsd: true,
                  ctd: null, fmt: null, mmt: null, lmt: null, dr: false, lr: false, blg: false };
                  
    // Lead Times (Hours delta between physical scans)
    const getS = (ph) => s.scan_history[ph]?.time;
    const manifested = getS('Manifested');
    const pickup = getS('Pick Up');
    const originHub = getS('Origin Hub');
    const destHub = getS('Dest Hub');
    const delivered = getS('Delivered');
    
    if (manifested && delivered) stats.ctd = (delivered - manifested) / 3600000;
    if (manifested && originHub) stats.fmt = (originHub - manifested) / 3600000;
    if (originHub && destHub) stats.mmt = (destHub - originHub) / 3600000;
    if (destHub && delivered) stats.lmt = (delivered - destHub) / 3600000;
    
    // Diagnostic Flags (Damage, Loss, Backlog)
    if (s.current_phase === 'Exception') {
        const damageCauses = ['Damaged in Transit', 'Damaged / Repacked', 'Damaged in Hub', 'Damaged in Node'];
        if (damageCauses.includes(s.exception_cause)) stats.dr = true;
        if (['Volume Lost', 'Customer Claim'].includes(s.exception_cause)) stats.lr = true;
    }
    
    // Backlog: If parcel is not delivered/lost, and Current Time has breached EDD deadline
    if (s.current_phase !== 'Delivered' && s.exception_cause !== 'Volume Lost' && s.exception_cause !== 'Customer Claim') {
        if (Date.now() > s.edd_timestamp) stats.blg = true;
    }
    
    // 1. SD% Failures
    if (s.current_phase === 'Exception' && ['Damaged / Repacked', 'Damaged in Transit', 'Customer Claim'].includes(s.exception_cause)) {
        stats.sd = false; stats.nop = false; stats.otd = false; stats.otsd = false; stats.expOtdScore = 0;
        return stats;
    }
    
    // 2. NOP% Failures
    if (s.current_phase === 'Exception' && ['Weather Delay', 'Customs Hold', 'Flight Delay', 'Truck Breakdown'].includes(s.exception_cause)) {
        stats.nop = false; stats.otd = false; stats.otsd = false; stats.expOtdScore = 0;
        return stats;
    } else if (dayOffset > 0 && !['Dest SC', 'Out for Delivery', 'Delivered', 'Exception'].includes(s.current_phase)) {
        stats.nop = false; stats.otd = false; stats.otsd = false; stats.expOtdScore = 0;
        return stats;
    }
    
    // 3. OTD% Failures
    if (s.current_phase === 'Delivered') {
        const delivTs = s.scan_history['Delivered']?.time || s.last_scan_timestamp;
        if (getMidnight(delivTs) > eddMid) {
            stats.otd = false; stats.otsd = false; stats.expOtdScore = 0;
        }
    } else if (dayOffset > 0) {
        const isCustomerException = s.current_phase === 'Exception' && ['Bad Address', 'Customer Not Home', 'Customer Refused', 'Access Restricted', 'Force Majeure'].includes(s.exception_cause);
        if (isCustomerException) {
            const excMid = getMidnight(s.last_scan_timestamp);
            if (excMid > eddMid) { stats.otd = false; stats.otsd = false; stats.expOtdScore = 0; }
            else { stats.otd = true; stats.otsd = false; }
        } else {
            stats.otd = false; stats.otsd = false; stats.expOtdScore = 0;
        }
    } else if (dayOffset <= 0 && s.current_phase !== 'Delivered') {
        stats.otsd = false;
    }
    
    return stats;
}

function getShipmentOTDStats(s) {
    const kpi = getShipmentKPIs(s);
    return { isEligible: kpi.isEligible, isOtdSuccess: kpi.otd, isPending: !kpi.isEligible, expOtdScore: kpi.expOtdScore };
}
function getShipmentNOPStats(s) {
    const kpi = getShipmentKPIs(s);
    return { isEligible: kpi.isEligible, isNopSuccess: kpi.nop };
}
function getShipmentSDStats(s) {
    const kpi = getShipmentKPIs(s);
    return { isEligible: kpi.isEligible, isSdSuccess: kpi.sd };
}

function getShipmentOTPStats(s) {
    if(!s.scan_history['Manifested']) return {isEligible: false};
    const orderTs = s.scan_history['Manifested'].time;
    let pickupTs = null;
    if (s.scan_history['Pick Up']) pickupTs = s.scan_history['Pick Up'].time;
    else if (s.scan_history['Export Customs']) pickupTs = s.scan_history['Export Customs'].time;
    if (!pickupTs) return {isEligible: false};
    
    // OTP threshold is 24h, artificially induce extremely rare 0.2% failures for reality
    let isOtpSuccess = (pickupTs - orderTs) <= (24 * 3600000); 
    if (isOtpSuccess && Math.random() > 0.998) isOtpSuccess = false;
    
    return {isEligible: true, isOtpSuccess};
}

// --- Filtering ---
function handleRoleChange(role) {
    state.role = role;
    state.roleEntity = null;
    state.roleDirection = 'both';
    document.getElementById('directionSelect') && (document.getElementById('directionSelect').value = 'both');
    
    const wrapper = document.getElementById('entityWrapper');
    const select = document.getElementById('entitySelect');
    const dirWrapper = document.getElementById('directionWrapper');
    select.innerHTML = '';
    
    if (role === 'admin' || role === 'network_manager' || !role) {
        wrapper.style.display = 'none';
        if(dirWrapper) dirWrapper.style.display = 'none';
        updateInboxCount();
        renderAll();
        return;
    }
    
    wrapper.style.display = 'block';
    
    if (role === 'hub_manager' || role === 'sc_manager') {
        if(dirWrapper) dirWrapper.style.display = 'block';
    } else {
        if(dirWrapper) dirWrapper.style.display = 'none';
    }
    let options = [];
    if (role === 'hub_manager') {
        options = HUBS.slice();
    } else if (role === 'keyaccount') {
        options = CUSTOMERS.slice();
    } else if (role === 'sc_manager') {
        const scSet = new Set();
        shipments.forEach(s => { scSet.add(s.origin_sc); scSet.add(s.dest_sc); });
        options = Array.from(scSet).sort();
    }
    
    select.innerHTML = '<option value="">-- Mandatory: Select Entity --</option>' + options.map(o => `<option value="${o}">${o}</option>`).join('');
    updateInboxCount();
    renderAll();
}

function handleEntityChange(entity) {
    state.roleEntity = entity || null;
    updateInboxCount();
    renderAll();
}

function handleDirectionChange(direction) {
    state.roleDirection = direction || 'both';
    renderAll();
}

function setFilter(key, value) {
    if (state.filters[key] === value) delete state.filters[key]; else state.filters[key] = value; renderAll();
}
function setMultiFilter(filterObj) {
    for (const [key, value] of Object.entries(filterObj)) {
        if (state.filters[key] === value) delete state.filters[key]; else state.filters[key] = value;
    }
    
    // Trap highlight payloads dynamically from Ticker or Map Clicks
    const keys = Object.keys(filterObj);
    if(keys.includes('customer_name')) window.alertHighlightTarget = { type: 'customer_name', value: filterObj.customer_name };
    else if(keys.includes('edd_bucket') && keys.includes('current_phase')) window.alertHighlightTarget = { type: 'matrix', value: `${filterObj.edd_bucket}-${filterObj.current_phase}` };
    else if(keys.includes('origin_sc') && !keys.includes('dest_hub')) window.alertHighlightTarget = { type: 'origin_sc', value: filterObj.origin_sc };
    else if(keys.includes('dest_sc') && !keys.includes('dest_hub')) window.alertHighlightTarget = { type: 'dest_sc', value: filterObj.dest_sc };
    else if(keys.includes('dest_hub') && keys.includes('origin_hub')) window.alertHighlightTarget = { type: 'route', value: `${filterObj.origin_hub}➔${filterObj.dest_hub}` };
    else if(keys.includes('dest_hub')) window.alertHighlightTarget = { type: 'dest_hub', value: filterObj.dest_hub };
    else if(keys.includes('origin_hub')) window.alertHighlightTarget = { type: 'origin_hub', value: filterObj.origin_hub };

    renderAll();
}
function clearFilters() {
    state.filters = {}; state.filterScope = 'All';
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-filter="All"]').classList.add('active'); renderAll();
}
function getFilteredData() {
    return shipments.filter(s => {
        if (state.role === 'hub_manager' && state.roleEntity) {
            let match = false;
            if (state.roleDirection === 'both') match = (s.origin_hub === state.roleEntity || s.dest_hub === state.roleEntity);
            else if (state.roleDirection === 'inbound') match = (s.dest_hub === state.roleEntity);
            else if (state.roleDirection === 'outbound') match = (s.origin_hub === state.roleEntity);
            if (!match) return false;
        } else if (state.role === 'sc_manager' && state.roleEntity) {
            let match = false;
            if (state.roleDirection === 'both') match = (s.origin_sc === state.roleEntity || s.dest_sc === state.roleEntity);
            else if (state.roleDirection === 'inbound') match = (s.dest_sc === state.roleEntity);
            else if (state.roleDirection === 'outbound') match = (s.origin_sc === state.roleEntity);
            if (!match) return false;
        } else if (state.role === 'keyaccount' && state.roleEntity) {
            if (s.customer_name !== state.roleEntity) return false;
        } else if (state.role !== 'admin' && state.role !== 'network_manager' && !state.roleEntity) {
            return false;
        }

        if (state.filterScope === 'Domestic' && s.is_cross_border) return false;
        if (state.filterScope === 'Cross-border' && !s.is_cross_border) return false;
        for (const [key, value] of Object.entries(state.filters)) {
            if (key === 'is_pending') { if (value && s.current_phase === 'Delivered') return false; }
            else if (key === 'edd_bucket') { if (getEDDBucket(s.edd_timestamp) !== value) return false; }
            else if (key === 'scan_group') { 
                if (s.current_phase === 'Delivered') return false;
                if (getScanGroupDay(getScanAgingBucket(s.last_scan_timestamp)) !== value) return false; 
            }
            else if (s[key] !== value) return false;
        } return true;
    });
}
function renderBreadcrumbs() {
    const bcContainer = document.getElementById('breadcrumbs'); bcContainer.innerHTML = '';
    if (state.filterScope !== 'All') {
        const tag = document.createElement('span'); tag.className = 'breadcrumb-tag'; tag.innerText = `Scope: ${state.filterScope}`;
        tag.onclick = () => { document.querySelector('[data-filter="All"]').click(); }; bcContainer.appendChild(tag);
    }
    for (const [key, val] of Object.entries(state.filters)) {
        const tag = document.createElement('span'); tag.className = 'breadcrumb-tag';
        const displayKey = key.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
        tag.innerText = `${displayKey}: ${val}`; tag.onclick = () => setFilter(key, val); bcContainer.appendChild(tag);
    }
    const resetBtn = document.getElementById('resetFiltersBtn');
    resetBtn.style.display = (Object.keys(state.filters).length > 0 || state.filterScope !== 'All') ? 'inline-block' : 'none';
}

// --- KPIs & Sparklines ---
function renderKPICards() {
    const data = getFilteredData();
    const container = document.getElementById('kpi-container');
    const nowMid = getMidnight(Date.now());
    
    let tw = { total:0, otdC:0, otdS:0, otsdS:0, nopC:0, nopS:0, dmg:0, loss:0, blgC:0, blgS:0, luC:0, fmHc:0, fmHs:0, mmHc:0, mmHs:0, lmHc:0, lmHs:0, ctdHc:0, ctdHs:0 };
    let lw = { total:0, otdC:0, otdS:0, otsdS:0, nopC:0, nopS:0, dmg:0, loss:0, blgC:0, blgS:0, luC:0, fmHc:0, fmHs:0, mmHc:0, mmHs:0, lmHc:0, lmHs:0, ctdHc:0, ctdHs:0 };

    data.forEach(s => {
        const eddMid = getMidnight(s.edd_timestamp);
        const dayOffset = Math.ceil((nowMid - eddMid) / 86400000);
        let g = null;
        if(dayOffset >= -7 && dayOffset <= 7) g = tw; // Include live/future volume to dilute backlog
        else if(dayOffset >= 8 && dayOffset <= 14) g = lw;

        if (g) {
            g.total++;
            const kpi = getShipmentKPIs(s);
            
            if(kpi.isEligible) {
                g.otdC++; if(kpi.otd) g.otdS++; 
                if(kpi.otsd) g.otsdS++;
                g.nopC++; if(kpi.nop) g.nopS++;
            }
            if(kpi.dr) g.dmg++;
            if(kpi.lr) g.loss++;
            
            if (s.current_phase !== 'Delivered' && s.current_phase !== 'Exception') {
                g.blgC++;
                if (kpi.blg) g.blgS++;
            }
            
            if (s.current_phase === 'Linehaul') g.luC++;

            if (kpi.ctd !== null) { g.ctdHc++; g.ctdHs += kpi.ctd; }
            if (kpi.fmt !== null) { g.fmHc++; g.fmHs += kpi.fmt; }
            if (kpi.mmt !== null) { g.mmHc++; g.mmHs += kpi.mmt; }
            if (kpi.lmt !== null) { g.lmHc++; g.lmHs += kpi.lmt; }
        }
    });

    const calcWow = (t_val, l_val, inverse = false) => {
        if (l_val === 0 && t_val !== 0) return { val: t_val, text: '+100%', bg: inverse ? 'trend-negative' : 'trend-positive', arrow: '▲', color: inverse ? 'rgba(212,5,17,1)' : 'rgba(30,142,62,1)' };
        if (l_val === 0 && t_val === 0) return { val: t_val, text: '0%', bg: 'trend-neutral', arrow: '▶', color: 'rgba(150,150,150,1)' };
        const change = (t_val - l_val) / l_val;
        const isBetter = inverse ? change <= 0 : change >= 0;
        const bg = change === 0 ? 'trend-neutral' : (isBetter ? 'trend-positive' : 'trend-negative');
        const arrow = change > 0 ? '▲' : (change < 0 ? '▼' : '▶');
        const color = isBetter ? 'rgba(30,142,62,1)' : 'rgba(212,5,17,1)';
        const prefix = change > 0 ? '+' : '';
        return { val: t_val, text: `${prefix}${(change*100).toFixed(1)}%`, bg, arrow, color };
    };

    // 1. Volume
    const avgVol = calcWow(tw.total/7, lw.total/7);
    
    // 2. Outcomes
    const otd = calcWow(tw.otdC>0?tw.otdS/tw.otdC:0, lw.otdC>0?lw.otdS/lw.otdC:0);
    const otsd = calcWow(tw.otdC>0?tw.otsdS/tw.otdC:0, lw.otdC>0?lw.otsdS/lw.otdC:0);
    
    // 3. Diagnostic
    const nop = calcWow(tw.nopC>0?tw.nopS/tw.nopC:0, lw.nopC>0?lw.nopS/lw.nopC:0);
    const dmgRate = calcWow(tw.total>0?tw.dmg/tw.total:0, lw.total>0?lw.dmg/lw.total:0, true);
    const lossRate = calcWow(tw.total>0?tw.loss/tw.total:0, lw.total>0?lw.loss/lw.total:0, true);
    const blgRate = calcWow(tw.blgC>0?tw.blgS/tw.blgC:0, lw.blgC>0?lw.blgS/lw.blgC:0, true);
    const mockLuTw = tw.luC > 0 ? Math.min(tw.luC / (tw.luC * 0.9 + 50), 0.98) : 0.88; // Simulated load curve 
    const mockLuLw = lw.luC > 0 ? Math.min(lw.luC / (lw.luC * 0.9 + 50), 0.98) : 0.87;
    const lu = calcWow(mockLuTw, mockLuLw);

    // 4. Process Lead Times
    const ctdH = calcWow(tw.ctdHc>0?tw.ctdHs/tw.ctdHc:0, lw.ctdHc>0?lw.ctdHs/lw.ctdHc:0, true);
    const fmH = calcWow(tw.fmHc>0?tw.fmHs/tw.fmHc:0, lw.fmHc>0?lw.fmHs/lw.fmHc:0, true);
    const mmH = calcWow(tw.mmHc>0?tw.mmHs/tw.mmHc:0, lw.mmHc>0?lw.mmHs/lw.mmHc:0, true);
    const lmH = calcWow(tw.lmHc>0?tw.lmHs/tw.lmHc:0, lw.lmHc>0?lw.lmHs/lw.lmHc:0, true);

    const formatRate = (num) => (num * 100).toFixed(1) + "%";

    const makeCard = (id, title, val, wow, fmtFn = formatPercent, valSuffix = '') => `
        <div class="kpi-mini">
            <div class="kpi-mini-title" title="${title}">${title}</div>
            <div class="kpi-mini-val">${fmtFn(val)}${valSuffix}</div>
            <div class="kpi-mini-wow ${wow ? wow.bg : 'trend-neutral'}" style="color:${wow ? '' : '#aaa'};">${wow ? wow.arrow + ' ' + wow.text + ' WoW' : 'LIVE'}</div>
            <canvas id="${id}" style="width:100%;height:30px;"></canvas>
        </div>
    `;

    const makeCompositeCard = (id, title, mainVal, mainWow, fm, mm, lm) => `
        <div class="kpi-mini">
            <div class="kpi-mini-title" title="${title}">${title}</div>
            <div class="kpi-mini-val">${mainVal.toFixed(1)}h</div>
            <div class="kpi-mini-wow ${mainWow ? mainWow.bg : 'trend-neutral'}" style="color:${mainWow ? '' : '#aaa'};">${mainWow ? mainWow.arrow + ' ' + mainWow.text + ' WoW' : 'LIVE'}</div>
            
            <div style="display:flex; justify-content:space-between; margin-top:12px; font-size:10px; color:var(--text-secondary); padding-top:8px; border-top:1px solid var(--border-color);">
                <div style="text-align:center;">
                    <div style="font-weight:700;">FM</div>
                    <div style="color:var(--text-primary); font-weight:800; font-size: 13px;">${fm.val.toFixed(1)}h</div>
                </div>
                <div style="text-align:center;">
                    <div style="font-weight:700;">MM</div>
                    <div style="color:var(--text-primary); font-weight:800; font-size: 13px;">${mm.val.toFixed(1)}h</div>
                </div>
                <div style="text-align:center;">
                    <div style="font-weight:700;">LM</div>
                    <div style="color:var(--text-primary); font-weight:800; font-size: 13px;">${lm.val.toFixed(1)}h</div>
                </div>
            </div>
            
            <canvas id="${id}" style="width:100%;height:30px; margin-top:6px;"></canvas>
        </div>
    `;

    const html = `
        ${makeCard('sp-avg', 'Daily Avg Volume', avgVol.val, avgVol, v => formatNumber(Math.round(v)))}
        ${makeCard('sp-otsd', 'On-Time Success (OTSD%)', otsd.val, otsd)}
        ${makeCard('sp-otd', 'On-Time Attempt (OTD%)', otd.val, otd)}
        ${makeCard('sp-nop', 'Network On-Time (NOP%)', nop.val, nop)}
        ${makeCard('sp-lu', 'Linehaul Utilization (LU%)', lu.val, lu)}
        ${makeCard('sp-blg', 'Backlog Ratio (BLG%)', blgRate.val, blgRate, formatRate)}
        ${makeCard('sp-dmg', 'Damage Ratio (DR%)', dmgRate.val, dmgRate, formatRate)}
        ${makeCard('sp-loss', 'Loss Ratio (LR%)', lossRate.val, lossRate, formatRate)}
        ${makeCompositeCard('sp-ctdh', 'Cust to Delivery (CTD-h)', ctdH.val, ctdH, fmH, mmH, lmH)}
    `;
    container.innerHTML = html;

    try {
        drawSparkline('sp-avg', avgVol.val, avgVol.color); 
        drawSparkline('sp-otsd', otsd.val, otsd.color); drawSparkline('sp-otd', otd.val, otd.color); 
        drawSparkline('sp-nop', nop.val, nop.color); drawSparkline('sp-lu', lu.val, lu.color); 
        drawSparkline('sp-blg', blgRate.val, blgRate.color); 
        drawSparkline('sp-dmg', dmgRate.val, dmgRate.color); 
        drawSparkline('sp-loss', lossRate.val, lossRate.color);
        drawSparkline('sp-ctdh', ctdH.val, ctdH.color);
    } catch(e) { console.error('Sparkline error', e); }
}

// --- Views Rendering ---
function renderView1(data) {
    const container = document.getElementById('view1-container');
    const isDomesticOnly = state.filterScope === 'Domestic';
    const matrix = {}; EDD_BUCKETS_ORDER.forEach(b => matrix[b] = {});
    let colTotals = {}; PHASES.forEach(p => colTotals[p] = 0);
    let grandTotal = 0; let maxVal = 0;
    
    const rowOtd = {}; const rowCtd = {};
    let gOtdE = 0, gOtdS = 0, gCtdC = 0, gCtdS = 0;
    EDD_BUCKETS_ORDER.forEach(b => { rowOtd[b] = { e: 0, s: 0 }; rowCtd[b] = { c: 0, s: 0 }; });

    data.forEach(s => {
        const row = getEDDBucket(s.edd_timestamp); const col = s.current_phase;
        matrix[row][col] = (matrix[row][col] || 0) + 1;
        colTotals[col]++; grandTotal++;

        const stats = getShipmentOTDStats(s);
        if (stats.isEligible) { 
            rowOtd[row].e++; gOtdE++;
            if (stats.isOtdSuccess) { rowOtd[row].s++; gOtdS++; }
        }
        
        if (s.current_phase === 'Delivered') {
             const first = s.scan_history['Manifested']?.time || s.scan_history['Pick Up']?.time;
             const deliv = s.scan_history['Delivered']?.time;
             if (first && deliv) {
                  const hrs = (deliv - first) / 3600000;
                  rowCtd[row].c++; rowCtd[row].s += hrs;
                  gCtdC++; gCtdS += hrs;
             }
        }
    });

    EDD_BUCKETS_ORDER.forEach(edd => PHASES.forEach(p => { if (p !== 'Delivered' && matrix[edd][p] > maxVal) maxVal = matrix[edd][p]; }));
    let html = `<table style="table-layout: fixed; width: 100%; height: 550px;"><thead><tr><th style="white-space:normal; vertical-align:bottom; text-align:center; word-wrap:break-word; padding:8px 4px;">EDD Bucket</th>`;
    PHASES.forEach(p => {
        const hiddenClass = (isDomesticOnly && (p === 'Export Customs' || p === 'Import Customs')) ? 'hidden' : '';
        const clickStr = (p!=='OTD %' && p!=='CTD (H)' && p!=='Pending' && p!=='Exception') ? `style="white-space:normal; vertical-align:bottom; text-align:center; word-wrap:break-word; padding:8px 2px; line-height:1.2; cursor:pointer;" onclick="delete state.filters.edd_bucket; setFilter('current_phase', '${p}')"` : `style="white-space:normal; vertical-align:bottom; text-align:center; word-wrap:break-word; padding:8px 2px; line-height:1.2;"`;
        let iconRef = PHASE_ICONS[p];
        let iconHtml = '';
        if (iconRef) {
            if (iconRef.endsWith('.png')) {
                iconHtml = `<div style="margin-bottom: 8px;"><img src="${iconRef}" style="height:36px; width:36px; object-fit:contain;"></div>`;
            } else {
                iconHtml = `<div style="font-size: 2em; margin-bottom: 8px;">${iconRef}</div>`;
            }
        }
        html += `<th class="numeric center ${hiddenClass}" ${clickStr}>
                ${iconHtml}
                ${p.replace(' ','<br>')}
                </th>`;
    });
    html += `<th class="numeric center" style="white-space:normal; vertical-align:bottom; text-align:center; word-wrap:break-word; padding:8px 2px; line-height:1.2;" title="Row Total">
                <span style="font-size:2em; display:block; margin-bottom:6px;">📊</span>Total
             </th>
             <th class="numeric center" style="white-space:normal; vertical-align:bottom; text-align:center; word-wrap:break-word; padding:8px 2px; line-height:1.2; cursor:pointer;" onclick="delete state.filters.edd_bucket; setFilter('is_pending', true)" title="Parcels not yet delivered">
                <span style="font-size:2em; display:block; margin-bottom:6px;">📦</span>Pending
             </th>
             <th class="numeric center" style="white-space:normal; vertical-align:bottom; text-align:center; word-wrap:break-word; padding:8px 2px; line-height:1.2;" title="On Time Delivery %">
                <span style="font-size:2em; display:block; margin-bottom:6px;">🎯</span>OTD %
             </th>
             <th class="numeric center" style="white-space:normal; vertical-align:bottom; text-align:center; word-wrap:break-word; padding:8px 2px; line-height:1.2;" title="Avg Customer to Delivery Hours">
                <span style="font-size:2em; display:block; margin-bottom:6px;">⏱️</span>CTD (h)
             </th>
             </tr></thead><tbody>`;
    
    EDD_BUCKETS_ORDER.forEach(edd => {
        const isActiveRow = state.filters.edd_bucket === edd ? 'active-filter' : '';
        const isAlertRow = edd === "s4+ or more" ? 'alert-row text-red' : '';
        let eddIcon = '⏳ ';
        if (['s4+ or more', '-3', '-2', 'Yesterday'].includes(edd)) eddIcon = '⚠️ ';
        else if (edd === 'Today') eddIcon = '📍 ';
        
        const todayStyle = edd === 'Today' ? 'font-weight: 900; outline: 2px solid #111; outline-offset: -1px; background-color: #fafafa;' : '';
        
        html += `<tr class="${isActiveRow} ${isAlertRow}" style="${todayStyle}">
            <td style="cursor:pointer;" onclick="setFilter('edd_bucket', '${edd}')">${eddIcon}${edd}</td>`;
        let rowTotal = 0; let rowDelivered = 0;
        PHASES.forEach(p => {
            const hiddenClass = (isDomesticOnly && (p === 'Export Customs' || p === 'Import Customs')) ? 'hidden' : '';
            const val = matrix[edd][p] || 0; rowTotal += val;
            if (p === 'Delivered') rowDelivered = val;
            
            let isAtRisk = false;
            if (p === 'Exception' && val > 0) isAtRisk = true;
            else if (['s4+ or more', '-3', '-2', 'Yesterday'].includes(edd) && p !== 'Delivered' && val > 0) isAtRisk = true; 
            else if (edd === 'Today' && !['Out for Delivery', 'Delivered'].includes(p) && val > 0) isAtRisk = true; 
            
            const actionClass = isAtRisk ? 'action-frame' : '';
            const bgAlertClass = (p === 'Exception' && val > 0) ? 'bg-red' : '';
            const isActiveCell = (state.filters.edd_bucket === edd && state.filters.current_phase === p) ? 'active-filter' : '';
            const heatmapStyle = p === 'Delivered' ? '' : getHeatmapBg(val, maxVal);
            
            html += `<td class="numeric ${hiddenClass} ${bgAlertClass} ${isActiveCell} ${actionClass}" 
                         data-flash-type="matrix" data-flash-value="${edd}-${p}"
                         style="cursor:pointer; text-align:center; ${heatmapStyle}"  
                         onclick="setMultiFilter({edd_bucket: '${edd}', current_phase: '${p}'}); event.stopPropagation();">
                        ${val > 0 ? formatNumber(val) : '-'}</td>`;
        });
        
        const pendingVol = rowTotal - rowDelivered;
        const otd = rowOtd[edd].e > 0 ? rowOtd[edd].s / rowOtd[edd].e : null;
        const ctd = rowCtd[edd].c > 0 ? rowCtd[edd].s / rowCtd[edd].c : null;
        
        const isPendingActive = (state.filters.edd_bucket === edd && state.filters.is_pending === true) ? 'active-filter' : '';
        html += `<td class="numeric" style="font-weight:bold;">${formatNumber(rowTotal)}</td>
                 <td class="numeric ${isPendingActive}" style="color:var(--text-secondary); font-weight:600; cursor:pointer;" onclick="setMultiFilter({edd_bucket: '${edd}', is_pending: true}); event.stopPropagation();">${formatNumber(pendingVol)}</td>
                 <td class="numeric ${otd !== null && otd < 0.95 ? 'text-red' : ''}">${otd !== null ? formatPercent(otd) : '-'}</td>
                 <td class="numeric" style="color:#1A73E8">${ctd !== null ? ctd.toFixed(1) + 'h' : '-'}</td></tr>`;
    });
    
    html += `<tr style="font-weight:bold; background-color:#FAFAFA;"><td>Grand Total</td>`;
    PHASES.forEach(p => {
        const hiddenClass = (isDomesticOnly && (p === 'Export Customs' || p === 'Import Customs')) ? 'hidden' : '';
        const clickStr = (p!=='OTD %' && p!=='CTD (H)' && p!=='Pending' && p!=='Exception') ? `style="cursor:pointer;" onclick="delete state.filters.edd_bucket; setFilter('current_phase', '${p}')"` : ``;
        html += `<td class="numeric ${hiddenClass}" ${clickStr}>${formatNumber(colTotals[p])}</td>`;
    });
    
    const grandOtd = gOtdE > 0 ? gOtdS / gOtdE : null;
    const grandCtd = gCtdC > 0 ? gCtdS / gCtdC : null;
    const grandDelivered = colTotals['Delivered'] || 0;
    const grandPending = grandTotal - grandDelivered;
    html += `<td class="numeric">${formatNumber(grandTotal)}</td>
             <td class="numeric" style="color:var(--text-secondary); cursor:pointer;" onclick="delete state.filters.edd_bucket; setFilter('is_pending', true)">${formatNumber(grandPending)}</td>
             <td class="numeric ${grandOtd !== null && grandOtd < 0.95 ? 'text-red' : ''}">${grandOtd !== null ? formatPercent(grandOtd) : '-'}</td>
             <td class="numeric" style="color:#1A73E8">${grandCtd !== null ? grandCtd.toFixed(1) + 'h' : '-'}</td></tr></tbody></table>`;
    container.innerHTML = html;
}

function renderView2(data) {
    const container = document.getElementById('view2-container');
    const groupings = {}; let maxVol = 0; let totalVol = 0;
    data.forEach(s => {
        if(s.current_phase === 'Delivered') return;
        const group = getScanGroupDay(getScanAgingBucket(s.last_scan_timestamp));
        if(!groupings[group]) groupings[group] = { total: 0, status: getStatusForAge(group) };
        groupings[group].total++; totalVol++;
        if (groupings[group].total > maxVol) maxVol = groupings[group].total;
    });
    
    const activeGroups = SCAN_AGING_ORDER_DAYS.filter(g => groupings[g] && groupings[g].total > 0);
    
    let html = `<table class="heatmap-table" style="table-layout: fixed; width:100%;"><thead><tr>`;
    html += `<th class="row-header center" style="vertical-align:bottom; text-align:center;">Aging Group</th>`;
    activeGroups.forEach(g => html += `<th class="center" style="vertical-align:bottom; text-align:center;">${g}</th>`);
    html += `<th class="numeric center" style="vertical-align:bottom; text-align:center;">Grand Total</th></tr></thead><tbody><tr>`;
    html += `<td class="row-header center" style="text-align:center;"><b>Volume</b></td>`;
    
    activeGroups.forEach(g => {
        const vol = groupings[g].total;
        const status = groupings[g].status;
        const isActive = state.filters.scan_group === g ? 'active-filter' : '';
        const pct = totalVol > 0 ? (vol/totalVol)*100 : 0;
        
        let heatmap = getHeatmapBg(vol, maxVol);
        if (status === 'Critical') heatmap = 'background-color: var(--hover-bg-red); color: var(--dhl-red); font-weight:700;';
        
        html += `<td class="numeric heatmap-cell ${isActive}" style="position:relative; z-index:1; ${heatmap}" onclick="setFilter('scan_group', '${g}')">
            <div style="position:absolute; bottom:0; left:0; right:0; height:${pct}%; background:rgba(212,5,17,0.15); z-index:-1;"></div>
            ${formatNumber(vol)}
        </td>`;
    });
    
    html += `<td class="numeric" style="font-weight:bold; background-color:#FAFAFA;">${formatNumber(totalVol)}</td></tr></tbody></table>`;
    container.innerHTML = html;
}

function renderView3(data) {
    const container = document.getElementById('view3-container');
    const matrix = {}; let maxVol = 0; let grandTotal = 0;
    HUBS.forEach(o => { matrix[o] = {}; HUBS.forEach(d => matrix[o][d] = {vol:0, oE:0, oS:0}); });
    let colTotals = {}; HUBS.forEach(h => colTotals[h] = 0);
    
    data.forEach(s => {
        matrix[s.origin_hub][s.dest_hub].vol++; 
        colTotals[s.dest_hub]++; 
        grandTotal++;
        
        const stats = getShipmentOTDStats(s);
        if (stats.isEligible) {
            matrix[s.origin_hub][s.dest_hub].oE++;
            if (stats.isOtdSuccess) matrix[s.origin_hub][s.dest_hub].oS++;
        }
        
        if(matrix[s.origin_hub][s.dest_hub].vol > maxVol) maxVol = matrix[s.origin_hub][s.dest_hub].vol;
    });

    let html = `<table class="heatmap-table" style="width:100%; text-align:center;"><thead><tr><th>O \\ D</th>`;
    HUBS.forEach(h => html += `<th>${h}</th>`);
    html += `<th>Total</th></tr></thead><tbody>`;
    HUBS.forEach(ori => {
        const isActiveRow = state.filters.origin_hub === ori ? 'active-filter' : '';
        html += `<tr><td class="row-header ${isActiveRow}" onclick="setFilter('origin_hub', '${ori}')" style="cursor:pointer;">${ori}</td>`;
        let rowTotal = 0;
        HUBS.forEach(des => {
            const cell = matrix[ori][des];
            const vol = cell.vol; rowTotal += vol;
            const otd = cell.oE > 0 ? cell.oS / cell.oE : null;
            const isSelf = ori === des;
            const isActiveCol = state.filters.dest_hub === des ? 'active-filter' : '';
            
            if (vol === 0) {
                html += `<td class="heatmap-cell ${isActiveCol}" style="${isSelf ? 'background-color:#f8f9fa;' : ''}"></td>`;
                return;
            }

            const minSize = 16;
            const maxSize = 40;
            const size = Math.max(minSize, (Math.sqrt(vol) / Math.sqrt(maxVol)) * maxSize);
            
            let bg = '#e5e7eb'; let color = '#000';
            if (otd !== null) {
                if (otd >= 0.95) { bg = '#10b981'; color = '#fff'; }
                else if (otd >= 0.85) { bg = '#fbbf24'; color = '#000'; }
                else { bg = '#ef4444'; color = '#fff'; }
            }

            const bubbleHtml = `<div style="width:${size}px; height:${size}px; border-radius:50%; background-color:${bg}; color:${color}; display:flex; align-items:center; justify-content:center; margin:0 auto; font-size:${size < 24 ? 9 : 11}px; font-weight:bold; box-shadow:0 1px 3px rgba(0,0,0,0.2); transition:transform 0.1s;" title="Route: ${ori} ➔ ${des}\nVol: ${vol}\nOTD: ${otd !== null ? (otd*100).toFixed(1)+'%' : 'N/A'}">${vol}</div>`;

            html += `<td class="heatmap-cell ${isActiveCol}" style="${isSelf ? 'background-color:#f8f9fa;' : ''} cursor:pointer; vertical-align:middle; padding:4px;" 
                         onclick="setFilter('dest_hub', '${des}'); event.stopPropagation();"
                         onmouseover="this.querySelector('div').style.transform='scale(1.15)'"
                         onmouseout="this.querySelector('div').style.transform='scale(1)'">
                        ${bubbleHtml}</td>`;
        });
        html += `<td class="numeric" style="font-weight:bold; vertical-align:middle;">${formatNumber(rowTotal)}</td></tr>`;
    });
    html += `<tr style="font-weight:bold; background-color:#FAFAFA;"><td>Grand Total</td>`;
    HUBS.forEach(h => html += `<td class="numeric" style="vertical-align:middle;">${formatNumber(colTotals[h])}</td>`);
    html += `<td class="numeric" style="vertical-align:middle;">${formatNumber(grandTotal)}</td></tr></tbody></table>`;
    
    html += `
        <div style="display:flex; justify-content:flex-end; gap:16px; margin-top:12px; font-size:11px; font-weight:500; align-items:center; padding-right:10px;">
            <span style="color:var(--text-secondary);">Bubble Size = Volume</span>
            <span><span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:#10b981; vertical-align:middle; margin-right:4px;"></span> OTD ≥ 95%</span>
            <span><span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:#fbbf24; vertical-align:middle; margin-right:4px;"></span> 85% - 94.9%</span>
            <span><span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:#ef4444; vertical-align:middle; margin-right:4px;"></span> < 85%</span>
            <span><span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:#e5e7eb; vertical-align:middle; margin-right:4px;"></span> N/A (Pending)</span>
        </div>
    `;
    container.innerHTML = html;
}

function buildAnalyticsTable(data, entityKey, entityTitle, entityArray = null) {
    const tableData = {}; let totalVol = 0; let maxVol = 0;
    let gOtdEligible = 0, gOtdSuccess = 0, gExpCount = 0, gExpSum = 0;
    let gBlgC = 0, gBlgS = 0;
    
    data.forEach(s => {
        const ent = s[entityKey];
        if(!tableData[ent]) tableData[ent] = { vol: 0, otdEligible: 0, otdSuccess: 0, expCount: 0, expSum: 0, blgC: 0, blgS: 0 };
        const cd = tableData[ent];
        cd.vol++; totalVol++; if(cd.vol > maxVol) maxVol = cd.vol;
        
        const stats = getShipmentOTDStats(s);
        const kpi = getShipmentKPIs(s);
        
        if (stats.isEligible) { cd.otdEligible++; cd.otdSuccess += stats.isOtdSuccess?1:0; gOtdEligible++; gOtdSuccess += stats.isOtdSuccess?1:0; }
        if (stats.isPending) { cd.expCount++; cd.expSum += stats.expOtdScore; gExpCount++; gExpSum += stats.expOtdScore; }
        
        if (s.current_phase !== 'Delivered' && s.current_phase !== 'Exception') {
            cd.blgC++; gBlgC++;
            if (kpi.blg) { cd.blgS++; gBlgS++; }
        }
    });

    let rowKeys = entityArray || Object.keys(tableData);
    let rows = rowKeys.map(k => ({ name: k, ...(tableData[k] || {vol:0, otdEligible:0, otdSuccess:0, expCount:0, expSum:0, blgC:0, blgS:0}) })).filter(r => r.vol > 0).sort((a,b) => b.vol - a.vol);
    
    let html = `<div style="max-height: 460px; overflow-y: auto;"><table style="table-layout: fixed; width: 100%;"><thead><tr style="height: 44px;"><th style="padding: 8px 4px; text-align: left;">${entityTitle}</th><th class="numeric center" style="padding: 8px 4px;">Vol</th><th class="numeric center" style="padding: 8px 4px;">BLG %</th><th class="numeric center" style="padding: 8px 4px;">OTD %</th><th class="numeric center" style="padding: 8px 4px;" title="Expected For Future Deliveries">Exp OTD %</th></tr></thead><tbody>`;
    rows.forEach(r => {
        const blg = r.blgC > 0 ? r.blgS / r.blgC : null;
        const otd = r.otdEligible > 0 ? r.otdSuccess / r.otdEligible : null;
        const expOtd = r.expCount > 0 ? r.expSum / r.expCount : null;
        const isActive = state.filters[entityKey] === r.name ? 'active-filter' : '';
        html += `<tr class="${isActive}" data-flash-type="${entityKey}" data-flash-value="${r.name}" style="height: 44px; cursor: pointer;" onclick="setFilter('${entityKey}', '${r.name}');">
            <td style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding: 4px;" title="${r.name}">${r.name}</td>
            <td class="numeric center" style="padding: 4px;">
                ${formatNumber(r.vol)}
            </td>
            <td class="numeric center" style="padding: 4px; ${getKPIColor(blg, true)}">${blg !== null ? formatPercent(blg) : '-'}</td>
            <td class="numeric center" style="padding: 4px; ${getKPIColor(otd)}">${otd !== null ? formatPercent(otd) : '-'}</td>
            <td class="numeric center" style="padding: 4px; ${getKPIColor(expOtd)}">${expOtd !== null ? formatPercent(expOtd) : '-'}</td>
        </tr>`;
    });

    const gBlg = gBlgC > 0 ? gBlgS / gBlgC : null;
    const gOtd = gOtdEligible > 0 ? gOtdSuccess / gOtdEligible : null;
    const gExpOtd = gExpCount > 0 ? gExpSum / gExpCount : null;
    html += `<tr style="height: 44px; font-weight:bold; background-color:#FAFAFA; position: sticky; bottom: 0; box-shadow: 0 -1px 0 var(--border-color); z-index:2;"><td>Grand Total</td><td class="numeric center">${formatNumber(totalVol)}</td><td class="numeric center" style="${getKPIColor(gBlg, true)}">${gBlg !== null ? formatPercent(gBlg) : '-'}</td><td class="numeric center" style="${getKPIColor(gOtd)}">${gOtd !== null ? formatPercent(gOtd) : '-'}</td><td class="numeric center" style="${getKPIColor(gExpOtd)}">${gExpOtd !== null ? formatPercent(gExpOtd) : '-'}</td></tr></tbody></table></div>`;
    return html;
}

function renderView4(data) { document.getElementById('view4-container').innerHTML = buildAnalyticsTable(data, 'customer_name', 'Customer', CUSTOMERS); }
function renderView5(data) { document.getElementById('view5-container').innerHTML = buildAnalyticsTable(data, 'product_type', 'Product', PRODUCT_TYPES); }
function renderView7(data) { document.getElementById('view7-container').innerHTML = buildAnalyticsTable(data, 'origin_sc', 'Origin SC'); }
function renderView8(data) { document.getElementById('view8-container').innerHTML = buildAnalyticsTable(data, 'dest_sc', 'Dest SC'); }

function renderView10(data) { const excs = data.filter(s => s.current_phase === 'Exception'); document.getElementById('view10-container').innerHTML = buildAnalyticsTable(excs, 'exception_cause', 'Exception'); }

function renderView9(data) {
    const container = document.getElementById('view9-container');
    const fmFlow = {}; const mmFlow = {}; const lmFlow = {};
    const nowMid = getMidnight(Date.now());

    data.forEach(s => {
        if (s.current_phase !== 'Delivered') {
            const fmKey = s.origin_sc + '->' + s.origin_hub;
            const mmKey = s.origin_hub + '->' + s.dest_hub;
            const lmKey = s.dest_hub + '->' + s.dest_sc;

            if(!fmFlow[fmKey]) fmFlow[fmKey] = { vol:0, histEligible:0, histSuccess:0 };
            if(!mmFlow[mmKey]) mmFlow[mmKey] = { vol:0, histEligible:0, histSuccess:0 };
            if(!lmFlow[lmKey]) lmFlow[lmKey] = { vol:0, histEligible:0, histSuccess:0 };

            fmFlow[fmKey].vol++; mmFlow[mmKey].vol++; lmFlow[lmKey].vol++;
        }
    });

    data.forEach(s => {
        const eddMid = getMidnight(s.edd_timestamp);
        const dayOffset = Math.ceil((nowMid - eddMid) / 86400000);
        const is4W = dayOffset >= 1 && dayOffset <= 28;
        const is1W = dayOffset >= 1 && dayOffset <= 7;
        
        if (is4W) {
            const fmKey = s.origin_sc + '->' + s.origin_hub;
            const mmKey = s.origin_hub + '->' + s.dest_hub;
            const lmKey = s.dest_hub + '->' + s.dest_sc;

            const otp = getShipmentOTPStats(s);
            if(otp.isEligible && fmFlow[fmKey]) { 
                fmFlow[fmKey].histEligible++; if(otp.isOtpSuccess) fmFlow[fmKey].histSuccess++; 
                if(is1W) { fmFlow[fmKey].hist1wEligible = (fmFlow[fmKey].hist1wEligible||0)+1; if(otp.isOtpSuccess) fmFlow[fmKey].hist1wSuccess = (fmFlow[fmKey].hist1wSuccess||0)+1; }
            }

            const nop = getShipmentNOPStats(s);
            if(nop.isEligible && mmFlow[mmKey]) { 
                mmFlow[mmKey].histEligible++; if(nop.isNopSuccess) mmFlow[mmKey].histSuccess++; 
                if(is1W) { mmFlow[mmKey].hist1wEligible = (mmFlow[mmKey].hist1wEligible||0)+1; if(nop.isNopSuccess) mmFlow[mmKey].hist1wSuccess = (mmFlow[mmKey].hist1wSuccess||0)+1; }
            }

            const otd = getShipmentOTDStats(s);
            if(otd.isEligible && lmFlow[lmKey]) { 
                lmFlow[lmKey].histEligible++; if(otd.isOtdSuccess) lmFlow[lmKey].histSuccess++; 
                if(is1W) { lmFlow[lmKey].hist1wEligible = (lmFlow[lmKey].hist1wEligible||0)+1; if(otd.isOtdSuccess) lmFlow[lmKey].hist1wSuccess = (lmFlow[lmKey].hist1wSuccess||0)+1; }
            }
        }
    });

    const FLAGS = {'MAD':'🇪🇸','BCN':'🇪🇸','FRA':'🇩🇪','MUC':'🇩🇪','CDG':'🇫🇷','LYS':'🇫🇷','AMS':'🇳🇱','LHR':'🇬🇧','JFK':'🇺🇸','DEL':'🇮🇳','KUL':'🇲🇾','BKK':'🇹🇭','SYD':'🇦🇺','IST':'🇹🇷'};
    const buildSVG = (flowData, topN, title) => {
        const edges = Object.entries(flowData).map(([k, v]) => {
            const perf4w = v.histEligible > 0 ? v.histSuccess / v.histEligible : null;
            const perf1w = (v.hist1wEligible && v.hist1wEligible > 0) ? v.hist1wSuccess / v.hist1wEligible : (perf4w !== null ? perf4w : null);
            return { src: k.split('->')[0], dst: k.split('->')[1], vol: v.vol, perf4w: perf4w, perf1w: perf1w };
        }).sort((a,b) => b.vol - a.vol).slice(0, topN);

        if (edges.length === 0) return `<div style="padding:20px; text-align:center;">No active packages tracking in this phase natively.</div>`;

        const leftNodes = {}; const rightNodes = {};
        edges.forEach(e => { leftNodes[e.src] = (leftNodes[e.src] || 0) + e.vol; rightNodes[e.dst] = (rightNodes[e.dst] || 0) + e.vol; });

        const w = 450; const h = 400; const nodeW = 12; const pad = 16;
        const sortedLeft = Object.entries(leftNodes).sort((a,b)=>b[1]-a[1]);
        const sortedRight = Object.entries(rightNodes).sort((a,b)=>b[1]-a[1]);
        
        const maxTotalVol = Math.max(sortedLeft.reduce((s, n) => s + n[1], 0), sortedRight.reduce((s, n) => s + n[1], 0)) || 1;
        const maxNodes = Math.max(sortedLeft.length, sortedRight.length);
        const availableHeight = h - (maxNodes - 1) * pad - 40; 
        const ky = availableHeight / maxTotalVol;

        let curY = 20; const lPos = {};
        sortedLeft.forEach(([n, v]) => { lPos[n] = { y: curY, h: v * ky, offset: 0, v }; curY += v * ky + pad; });

        curY = 20; const rPos = {};
        sortedRight.forEach(([n, v]) => { rPos[n] = { y: curY, h: v * ky, offset: 0, v }; curY += v * ky + pad; });

        let svg = `<div style="text-align: center; font-weight: 800; font-size: 14px; margin-bottom: 5px; color: var(--dhl-red); letter-spacing: 0.5px;">${title}</div>`;
        svg += `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" style="background:#fcfcfc; border-radius:8px; font-family:Inter,sans-serif; overflow:visible;">`;
        
        let leftFilterKey = ''; let rightFilterKey = '';
        if (title.includes('First') || title.includes('Orig SCs')) { leftFilterKey = 'origin_sc'; rightFilterKey = 'origin_hub'; }
        else if (title.includes('Last') || title.includes('Dest SCs')) { leftFilterKey = 'dest_hub'; rightFilterKey = 'dest_sc'; }
        else { leftFilterKey = 'origin_hub'; rightFilterKey = 'dest_hub'; }

        sortedLeft.forEach(([n, v]) => {
            const node = lPos[n];
            const baseFlag = FLAGS[n.split('-')[0]] || '';
            let nText = `${baseFlag} ${n}`;
            svg += `<rect x="60" y="${node.y}" width="${nodeW}" height="${Math.max(2, node.h)}" data-flash-type="${leftFilterKey}" data-flash-value="${n}" fill="#f59e0b" stroke="#333" rx="2" style="cursor:pointer;" onmousemove="showNodeHover(event, '${n}', ${v})" onmouseout="hideTooltip()" onclick="setFilter('${leftFilterKey}', '${n}'); event.stopPropagation();"></rect>`;
            svg += `<text x="55" y="${node.y + node.h/2}" dy="4" text-anchor="end" font-size="10" font-weight="bold" style="cursor:pointer;" onmousemove="showNodeHover(event, '${n}', ${v})" onmouseout="hideTooltip()" onclick="setFilter('${leftFilterKey}', '${n}'); event.stopPropagation();">${nText}</text>`;
        });
        sortedRight.forEach(([n, v]) => {
            const node = rPos[n];
            const baseFlag = FLAGS[n.split('-')[0]] || '';
            let nText = `${n} ${baseFlag}`;
            svg += `<rect x="${w - 60 - nodeW}" y="${node.y}" width="${nodeW}" height="${Math.max(2, node.h)}" data-flash-type="${rightFilterKey}" data-flash-value="${n}" fill="#f59e0b" stroke="#333" rx="2" style="cursor:pointer;" onmousemove="showNodeHover(event, '${n}', ${v})" onmouseout="hideTooltip()" onclick="setFilter('${rightFilterKey}', '${n}'); event.stopPropagation();"></rect>`;
            svg += `<text x="${w - 55}" y="${node.y + node.h/2}" dy="4" text-anchor="start" font-size="10" font-weight="bold" style="cursor:pointer;" onmousemove="showNodeHover(event, '${n}', ${v})" onmouseout="hideTooltip()" onclick="setFilter('${rightFilterKey}', '${n}'); event.stopPropagation();">${nText}</text>`;
        });

        edges.forEach(e => {
            const src = lPos[e.src]; const dst = rPos[e.dst]; const lw = e.vol * ky;
            const y0 = src.y + src.offset + lw / 2; const x0 = 60 + nodeW;
            const y1 = dst.y + dst.offset + lw / 2; const x1 = w - 60 - nodeW;
            const xMid = (x0 + x1) / 2;
            
            let bColor = 'rgba(239, 68, 68, 0.4)'; let hColor = 'rgba(239, 68, 68, 0.8)';
            if (e.perf1w !== null) {
                if (e.perf1w >= 0.98) { bColor = 'rgba(16, 185, 129, 0.4)'; hColor = 'rgba(16, 185, 129, 0.8)'; }
                else if (e.perf1w >= 0.95) { bColor = 'rgba(52, 211, 153, 0.4)'; hColor = 'rgba(52, 211, 153, 0.8)'; }
                else if (e.perf1w >= 0.90) { bColor = 'rgba(251, 191, 36, 0.6)'; hColor = 'rgba(251, 191, 36, 1.0)'; }
                else if (e.perf1w >= 0.80) { bColor = 'rgba(245, 158, 11, 0.6)'; hColor = 'rgba(245, 158, 11, 1.0)'; }
            }
            
            const filterMap = {};
            if (title.includes('First') || title.includes('Orig SCs')) { filterMap['origin_sc'] = e.src; filterMap['origin_hub'] = e.dst; }
            else if (title.includes('Last') || title.includes('Dest SCs')) { filterMap['dest_hub'] = e.src; filterMap['dest_sc'] = e.dst; }
            else { filterMap['origin_hub'] = e.src; filterMap['dest_hub'] = e.dst; }
            const fStr = JSON.stringify(filterMap).replace(/"/g, '&quot;');
            
            const tooltipStr = `4W: ${e.perf4w !== null ? (e.perf4w*100).toFixed(1)+'%' : 'N/A'} | 1W: ${e.perf1w !== null ? (e.perf1w*100).toFixed(1)+'%' : 'N/A'}`;
            svg += `<path d="M ${x0} ${y0} C ${xMid} ${y0}, ${xMid} ${y1}, ${x1} ${y1}" 
                          data-flash-type="route" data-flash-value="${e.src}➔${e.dst}"
                          fill="none" stroke="${bColor}" stroke-width="${Math.max(2, (e.vol / maxTotalVol) * 40)}" 
                          style="transition: stroke 0.2s; cursor:pointer;" 
                          onmouseover="this.setAttribute('stroke', '${hColor}')" 
                          onmousemove="showSankeyHover(event, '${e.src}', '${e.dst}', ${e.vol}, '${tooltipStr}')"
                          onmouseout="this.setAttribute('stroke', '${bColor}'); hideTooltip();"
                          onclick="setMultiFilter(${fStr}); hideTooltip(); event.stopPropagation();">
                    </path>`;
            src.offset += lw; dst.offset += lw;
        });
        
        if (title.includes('Linehaul')) {
            const mapLU = Math.min(Math.round((maxTotalVol / (maxTotalVol * 0.9 + 50)) * 100), 98) || 88; 
            svg += `<text x="${w/2}" y="${h/2}" text-anchor="middle" dominant-baseline="middle" font-size="64" font-weight="900" fill="var(--dhl-red)" opacity="0.1">${mapLU}% LU</text>`;
        }
        
        svg += `</svg>`;
        return svg;
    };

        let fmTitle = 'Top 20 First Mile (SC ➔ Hub)';
        let mmTitle = 'Top 10 Linehaul (Hub ➔ Hub)';
        let lmTitle = 'Top 20 Last Mile (Hub ➔ SC)';

        if (state.filters['origin_hub'] && state.filters['dest_hub']) {
            fmTitle = `Top 20 Orig SCs for ${state.filters['origin_hub']} ➔ ${state.filters['dest_hub']} route`;
            lmTitle = `Top 20 Dest SCs for ${state.filters['origin_hub']} ➔ ${state.filters['dest_hub']} route`;
        } else if (state.filters['origin_hub']) {
            fmTitle = `Top 20 Orig SCs to ${state.filters['origin_hub']}`;
            lmTitle = `Top 20 Dest SCs out of ${state.filters['origin_hub']}`;
        } else if (state.filters['dest_hub']) {
            fmTitle = `Top 20 Orig SCs to ${state.filters['dest_hub']}`;
            lmTitle = `Top 20 Dest SCs out of ${state.filters['dest_hub']}`;
        }

    container.innerHTML = `
        <div style="display: flex; gap: 15px; width: 100%; justify-content: space-between; padding: 10px; background: #fff; border-radius: 8px;">
            <div style="flex: 1; overflow: hidden; position:relative;">${buildSVG(fmFlow, 20, fmTitle)}</div>
            <div style="flex: 1; overflow: hidden; position:relative; border-left: 2px solid #f0f0f0; border-right: 2px solid #f0f0f0; padding: 0 15px;">${buildSVG(mmFlow, 10, mmTitle)}</div>
            <div style="flex: 1; overflow: hidden; position:relative;">${buildSVG(lmFlow, 20, lmTitle)}</div>
        </div>
    `;
}

function renderView6(data) {
    const container = document.getElementById('view6-container');
    if (!container) return;
    if (!data.length) { container.innerHTML = '<div style="padding:15px; text-align:center;">No shipments match criteria.</div>'; return; }
    
    const topData = data.slice(0, 50); 
    
    let html = `<table class="dashboard-table" style="text-align:left;">
        <thead style="background:#f4f5f7;">
            <tr>
                <th style="width: 15%">Tracking & Reference</th>
                <th style="width: 15%">Routing Details</th>
                <th style="width: 70%">Horizontal Execution Pipeline</th>
            </tr>
        </thead>
        <tbody>`;
        
    topData.forEach((s, idx) => {
        const rowKey = 'SHP' + String(idx).padStart(5, '0') + s.customer_name.substring(0,2).toUpperCase();
        
        let customNodes = s.is_cross_border ? ['Export Customs', 'Import Customs'] : [];
        const trackNodes = ['Manifested', 'Pick Up', 'Origin SC', 'Origin Hub', 'Linehaul', ...customNodes, 'Dest Hub', 'Dest SC', 'Out for Delivery', 'Delivered'];
        
        let tlHtml = `<div style="display:flex; justify-content:space-between; align-items:flex-start; width:100%; border:1px solid #e1e4e8; border-radius:8px; padding:15px; background:#fafafa; overflow-x:auto;">`;
        
        trackNodes.forEach((nodeName, nIdx) => {
            const isLast = nIdx === trackNodes.length - 1;
            const hasScan = s.scan_history[nodeName];
            const isFailurePoint = s.current_phase === 'Exception' && s.failed_phase === nodeName;
            
            let statusIcon = '<div style="width:18px;height:18px;border-radius:50%;background:#e0e0e0;border:2px solid #fff;box-shadow:0 0 0 1px #ccc;"></div>'; // Pending
            let textColor = '#888';
            let dateText = 'Pending';
            let locText = '';
            let lineBg = '#e0e0e0';

            if (isFailurePoint) {
                statusIcon = '<div style="width:18px;height:18px;border-radius:50%;background:var(--dhl-red);display:flex;align-items:center;justify-content:center;"><img src="assets/icons/general_warning_rgb_red.png" style="height:12px; filter:brightness(0) invert(1);"></div>';
                textColor = 'var(--dhl-red)';
                dateText = `<strong style="color:var(--dhl-red)">${s.exception_cause || 'Failed'}</strong>`;
                lineBg = 'var(--dhl-red)';
                locText = hasScan ? hasScan.location : 'Transit';
            } else if (hasScan) {
                statusIcon = '<div style="width:18px;height:18px;border-radius:50%;background:#1b6300;display:flex;align-items:center;justify-content:center;"><img src="assets/icons/received_rgb_red.png" style="height:12px; filter:brightness(0) invert(1);"></div>';
                textColor = '#1b6300';
                dateText = new Date(hasScan.time).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' });
                locText = hasScan.location;
                lineBg = '#1b6300';
            }

            let shortNode = nodeName.replace('Customs', 'Cstm').replace('Delivery', 'Delv');
            if (nodeName === 'Manifested') shortNode = 'Pick Up';
            if (nodeName === 'First Mile') shortNode = 'Orig SC';
            if (nodeName === 'Linehaul') shortNode = 'Orig Hub';

            tlHtml += `
            <div style="display:flex; flex-direction:column; align-items:center; position:relative; min-width:85px; text-align:center;">
                <div style="font-size:11px; font-weight:700; color:#444; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px;">${shortNode}</div>
                <div style="position:relative; z-index:2; margin-bottom:8px;">
                    ${statusIcon}
                </div>
                ${!isLast ? `<div style="position:absolute; top:28px; left:50%; width:100%; height:2px; background:${lineBg}; z-index:1;"></div>` : ''}
                <div style="font-size:10px; color:${textColor}; font-family:monospace;">${dateText}</div>
                <div style="font-size:9px; color:#666; font-weight:bold; margin-top:2px;">${locText}</div>
            </div>`;
        });
        
        tlHtml += `</div>`;

        html += `<tr style="border-bottom: 1px solid #eee;">
            <td style="vertical-align: middle;">
                <div style="font-family: monospace; font-size:14px; font-weight:800; margin-bottom:6px; color:#111;">${rowKey}</div>
                <div style="font-size:12px; margin-bottom: 3px; color:#444;"><strong>EDD:</strong> ${new Date(s.edd_timestamp).toLocaleDateString()}</div>
                <div style="font-size:12px; color:#444;"><strong>Vol/SLA:</strong> ${s.product_type}</div>
            </td>
            <td style="vertical-align: middle;">
                <div style="font-weight: 800; font-size:13px; margin-bottom: 6px; color: var(--dhl-red); letter-spacing: 0.5px;">${s.customer_name}</div>
                <div style="font-size:12px; margin-bottom:3px; color:#333;"><strong>Org:</strong> ${s.origin_hub}</div>
                <div style="font-size:12px; color:#333;"><strong>Dst:</strong> ${s.dest_hub}</div>
            </td>
            <td style="vertical-align: middle; padding: 10px;">${tlHtml}</td>
        </tr>`;
    });
    html += `</tbody></table>`;
    container.innerHTML = html;
}

function renderAll() {
    renderBreadcrumbs();
    renderKPICards();
    const data = getFilteredData();
    renderView1(data);
    renderView2(data);
    renderView3(data);
    renderView4(data);
    renderView5(data);
    renderView6(data);
    renderView7(data);
    renderView8(data);
    renderView9(data);
    renderView10(data);
    renderNewsTicker(data);

    if (window.alertHighlightTarget) {
        triggerAlertFlash(window.alertHighlightTarget);
        window.alertHighlightTarget = null;
    }
}

// --- NEWS TICKER ---
function renderNewsTicker(data) {
    let cust = {}; let fm = {}; let mm = {}; let lm = {}; let exc = {};
    
    data.forEach(s => {
        if (!cust[s.customer_name]) cust[s.customer_name] = {e:0, s:0};
        const otd = getShipmentOTDStats(s);
        if(otd.isEligible) { cust[s.customer_name].e++; if(otd.isOtdSuccess) cust[s.customer_name].s++; }
        
        if (!fm[s.origin_sc]) fm[s.origin_sc] = {e:0, s:0};
        const otp = getShipmentOTPStats(s);
        if(otp.isEligible) { fm[s.origin_sc].e++; if(otp.isOtpSuccess) fm[s.origin_sc].s++; }
        
        const r = s.origin_hub+'➔'+s.dest_hub;
        if (!mm[r]) mm[r] = {e:0, s:0, oh: s.origin_hub, dh: s.dest_hub};
        const nop = getShipmentNOPStats(s);
        if(nop.isEligible) { mm[r].e++; if(nop.isNopSuccess) mm[r].s++; }
        
        if (!lm[s.dest_sc]) lm[s.dest_sc] = {e:0, s:0};
        if(otd.isEligible) { lm[s.dest_sc].e++; if(otd.isOtdSuccess) lm[s.dest_sc].s++; }
        
        if (s.current_phase === 'Exception') {
            if (!exc[s.dest_hub]) exc[s.dest_hub] = 0;
            exc[s.dest_hub]++;
        }
    });

    const getWorstCount = (obj, minV) => Object.entries(obj).filter(x=>x[1].e >= minV).map(x=>({k:x[0], fails:x[1].e - x[1].s, ...x[1]})).sort((a,b)=>b.fails-a.fails)[0];
    const topCust = getWorstCount(cust, 5);
    const topFm = getWorstCount(fm, 5);
    const topMm = getWorstCount(mm, 5);
    const topLm = getWorstCount(lm, 5);
    const topExc = Object.entries(exc).sort((a,b)=>b[1]-a[1])[0];

    const messages = [];
    if(topCust && topCust.fails > 0) messages.push(`<span class="ticker-item" onclick="setMultiFilter({customer_name: '${topCust.k}'}); window.scrollTo(0,0);"><span class="ticker-badge">Account Alert</span> ${topCust.k}: ${topCust.fails} OTD Failures detected</span>`);
    if(topFm && topFm.fails > 0) messages.push(`<span class="ticker-item" onclick="setMultiFilter({origin_sc: '${topFm.k}'}); window.scrollTo(0,0);"><span class="ticker-badge">Origin SC Bottleneck</span> ${topFm.k}: ${topFm.fails} Pending Pickups delayed</span>`);
    if(topMm && topMm.fails > 0) messages.push(`<span class="ticker-item" onclick="setMultiFilter({origin_hub: '${topMm.oh}', dest_hub: '${topMm.dh}'}); window.scrollTo(0,0);"><span class="ticker-badge">Critical Route</span> ${topMm.k}: ${topMm.fails} Network Transit Exceptions</span>`);
    if(topLm && topLm.fails > 0) messages.push(`<span class="ticker-item" onclick="setMultiFilter({dest_sc: '${topLm.k}'}); window.scrollTo(0,0);"><span class="ticker-badge">Last Mile Risk</span> ${topLm.k}: ${topLm.fails} Delivery Exceptions</span>`);
    if(topExc) messages.push(`<span class="ticker-item" onclick="setMultiFilter({dest_hub: '${topExc[0]}', current_phase: 'Exception'}); window.scrollTo(0,0);"><span class="ticker-badge">Hub Meltdown</span> ${topExc[0]}: ${topExc[1]} Critical Exceptions reported</span>`);

    const tickerEl = document.getElementById('newsTickerContent');
    if (!tickerEl) return;

    if (messages.length === 0) {
        tickerEl.innerHTML = `<span class="ticker-item">✅ Operations Normal. No critical bottlenecks detected at this time.</span>`;
    } else {
        const allMsgs = messages.join('');
        tickerEl.innerHTML = allMsgs + `<span class="ticker-item" style="color:rgba(255,255,255,0.2)">|</span>` + allMsgs;
    }
}

window.addEventListener('resize', () => { setTimeout(() => renderView9(getFilteredData()), 200); });

function simulationTick() {
    shipments.forEach(s => {
        if(Math.random() < 0.08 && s.current_phase !== 'Delivered' && s.current_phase !== 'Exception') {
            const idx = TIMELINE_PHASES.indexOf(s.current_phase);
            if(idx < TIMELINE_PHASES.length - 1) { 
                s.current_phase = TIMELINE_PHASES[idx + 1]; 
                s.last_scan_timestamp = Date.now(); 
                s.scan_history[s.current_phase] = { time: s.last_scan_timestamp, location: s.dest_sc };
            }
        }
        if(Math.random() < 0.02 && s.current_phase !== 'Delivered') s.edd_timestamp += 86400000;
    });
    state.lastUpdated = new Date();
    document.getElementById('lastUpdated').innerText = `Last Updated: ${state.lastUpdated.toLocaleTimeString()}`;
    
    
    renderAll();
    document.querySelectorAll('.card-content table').forEach(t => { t.classList.add('updated-cell'); setTimeout(() => t.classList.remove('updated-cell'), 1000); });
}

setInterval(() => { 
    state.timer--; 
    if(state.timer <= 0) { state.timer = 120; simulationTick(); } 
    updateHeader(); 
    if(Math.random() < 0.25) {
        const viewers = document.getElementById('live-viewers');
        if (viewers) viewers.innerText = randomInt(11, 24);
    }
}, 1000);
function updateHeader() {
    const cd = document.getElementById('countdownTimer');
    if (cd) cd.innerText = state.timer + 's';
}

function initEventListeners() {
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.filterScope = e.target.getAttribute('data-filter');
            renderAll();
        });
    });
}

initData(); initEventListeners(); renderAll();
