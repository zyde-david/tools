// Tools Auth Injector v1.0 — Universal auth UI + Firestore sync for any tool
// Include AFTER firebase-auth.js. Auto-detects the tool and adds:
//  - Auth badge/button in the sidebar
//  - Firestore auto-sync after any save operation
(function() {
  'use strict';
  
  var CHECK_INTERVAL = 300; // ms between checks for TOOLS_FIREBASE ready
  var MAX_CHECKS = 30;      // 9 seconds max wait
  
  function waitForFirebase(cb) {
    var tries = 0;
    var iv = setInterval(function() {
      tries++;
      if (window.TOOLS_FIREBASE && window.TOOLS_FIREBASE.getUser) {
        clearInterval(iv);
        cb();
      } else if (tries >= MAX_CHECKS) {
        clearInterval(iv);
        console.warn('[AuthInjector] Firebase not ready after', tries, 'tries');
      }
    }, CHECK_INTERVAL);
  }

  function firestoreAvailable() {
    return window.TOOLS_FIREBASE && window.TOOLS_FIREBASE.isSignedIn();
  }

  // ====== Inject auth status bar into the tools sidebar ======
  function injectAuthUI() {
    // Target: tools-sidebar div
    var sidebar = document.querySelector('.tools-sidebar, .tools-drawer, nav');
    if (!sidebar) {
      // Try again later
      setTimeout(injectAuthUI, 1000);
      return;
    }

    // Don't inject twice
    if (document.getElementById('tools-auth-injector')) return;

    var container = document.createElement('div');
    container.id = 'tools-auth-injector';
    container.style.cssText = 'padding:8px 10px;border-top:1px solid rgba(255,255,255,0.1);margin-top:auto;font-size:11px;';

    var statusRow = document.createElement('div');
    statusRow.style.cssText = 'display:flex;align-items:center;gap:6px;';

    var dot = document.createElement('span');
    dot.id = 'tools-auth-dot';
    dot.style.cssText = 'width:8px;height:8px;border-radius:50%;display:inline-block;background:#94a3b8;flex-shrink:0;';

    var nameEl = document.createElement('span');
    nameEl.id = 'tools-auth-name';
    nameEl.style.cssText = 'color:#cbd5e1;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;';
    nameEl.textContent = 'Cloud Sync';

    var btn = document.createElement('button');
    btn.id = 'tools-auth-btn';
    btn.style.cssText = 'margin-left:auto;padding:2px 8px;border-radius:4px;border:none;background:#334155;color:#e2e8f0;font-size:10px;cursor:pointer;font-weight:600;white-space:nowrap;';
    btn.textContent = 'Login';

    statusRow.appendChild(dot);
    statusRow.appendChild(nameEl);
    statusRow.appendChild(btn);
    container.appendChild(statusRow);

    // Append to sidebar (last child)
    sidebar.appendChild(container);

    // ====== Auth state rendering ======
    function render(user) {
      if (user) {
        dot.style.background = '#22c55e';
        nameEl.textContent = user.displayName || user.email || user.uid.slice(0,8);
        btn.textContent = 'Logout';
        btn.onclick = function() {
          window.TOOLS_FIREBASE.signOut().then(function() {
            showToolsToast('ออกจากระบบแล้ว');
          });
        };
      } else {
        dot.style.background = '#94a3b8';
        nameEl.textContent = 'Cloud Sync';
        btn.textContent = 'Login';
        btn.onclick = function() {
          window.TOOLS_FIREBASE.signInWithGoogle().then(function(result) {
            showToolsToast('สวัสดี ' + (result.user.displayName || result.user.email));
          }).catch(function(err) {
            showToolsToast('Login failed: ' + err.message);
          });
        };
      }
    }

    // Initial render
    render(window.TOOLS_FIREBASE.getUser());
    // Listen for changes
    window.TOOLS_FIREBASE.onAuthChanged(render);
  }

  // ====== Simple toast ======
  function showToolsToast(msg, type) {
    type = type || 'info';
    // Try to use existing showToast if available
    if (window.showToast) return window.showToast(msg, type);
    // Fallback to our own
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1e293b;color:#f1f5f9;padding:8px 20px;border-radius:10px;font-size:13px;z-index:999999;box-shadow:0 4px 12px rgba(0,0,0,0.3);max-width:90%;text-align:center;opacity:0;transition:opacity 0.3s;';
    if (type === 'success') t.style.background = '#059669';
    if (type === 'error') t.style.background = '#dc2626';
    document.body.appendChild(t);
    requestAnimationFrame(function() { t.style.opacity = '1'; });
    setTimeout(function() { t.style.opacity = '0'; setTimeout(function() { t.remove(); }, 300); }, 2500);
  }

  // ====== Override fetch to auto-sync to Firestore after saves ======
  // Monitors POST requests to GAS (Google Apps Script) and also saves to Firestore
  function patchDataSavers() {
    // If there's a global save function, don't touch it
    // Instead, hook into the save button clicks
    document.addEventListener('click', function(e) {
      var target = e.target.closest('button');
      if (!target) return;
      var text = (target.textContent || '').toLowerCase();
      // Detect save/submit button clicks
      if ((text.indexOf('บันทึก') !== -1 || text.indexOf('submit') !== -1 || text.indexOf('save') !== -1 || text.indexOf('ส่ง') !== -1) &&
          firestoreAvailable()) {
        // Wait a moment for the GAS save to complete, then sync to Firestore
        var form = target.closest('form') || target.closest('[data-form]');
        setTimeout(function() {
          autoSyncToFirestore();
        }, 1500);
      }
    });
  }

  // ====== Auto-sync: Save all localStorage data to Firestore ======
  function autoSyncToFirestore() {
    if (!firestoreAvailable()) return;
    var appName = window.location.pathname.split('/').pop() || 'index';
    
    // Try to find the main data in localStorage and sync
    // Common local storage keys used by tools
    var possibleKeys = [
      'gps_tracker_houses',      // GPS Tracker
      'health_gis_houses',       // Health GIS
      'inventory_data',          // Inventory
      'ink_planner_data',        // Ink Planner
      'yarang_pcc_data',         // Yarang PCC
      'epi_map_data',            // Epidemiology Map
      'vhv_local_reports',       // VHV (already synced via its own code)
    ];

    // Auto-detect: find localStorage keys that match the app
    var detectedKey = null;
    for (var i = 0; i < possibleKeys.length; i++) {
      try {
        var val = localStorage.getItem(possibleKeys[i]);
        if (val && val.length > 10) {
          detectedKey = possibleKeys[i];
          break;
        }
      } catch(e) {}
    }

    if (detectedKey) {
      try {
        var data = JSON.parse(localStorage.getItem(detectedKey));
        var syncData = {
          key: detectedKey,
          data: data,
          timestamp: new Date().toISOString(),
          appUrl: window.location.href
        };
        // Use Firestore save
        window.TOOLS_FIREBASE.saveData(syncData, 'local_storage_sync')
          .then(function(id) {
            console.log('[AuthInjector] Synced', detectedKey, 'to Firestore:', id);
          })
          .catch(function(err) {
            console.warn('[AuthInjector] Sync failed:', err);
          });
      } catch(e) {
        console.warn('[AuthInjector] Parse error:', e);
      }
    }
  }

  // ====== Periodic auto-sync (every 5 min) ======
  function startPeriodicSync() {
    setInterval(function() {
      if (firestoreAvailable()) autoSyncToFirestore();
    }, 5 * 60 * 1000);
  }

  // ====== Init ======
  waitForFirebase(function() {
    injectAuthUI();
    patchDataSavers();
    startPeriodicSync();
    // Also sync on page load if signed in
    if (firestoreAvailable()) {
      setTimeout(autoSyncToFirestore, 2000);
    }
  });
})();
