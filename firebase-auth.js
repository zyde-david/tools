// Firebase Auth Module v1.0 — Shared across all tools
// Auto-loads Firebase SDK + provides signIn/signOut/data sync for Google Accounts
(function() {
  'use strict';

  const CONFIG = typeof __TOOLS_FIREBASE_CONFIG !== 'undefined'
    ? __TOOLS_FIREBASE_CONFIG
    : (function(){
        // fallback — read from global injected by the build
        console.warn('[FirebaseAuth] No config found, using default');
        return {};
      })();

  const COLLECTIONS = {
    'gps-location-tracker':  'gps_tracker',
    'health-gis-app':        'health_gis',
    'vhv-quick-report':      'vhv_reports',
    'inventory-analytics':   'inventory',
    'ink-planner':           'ink_planner',
    'yarang-pcc-audit':      'yarang_pcc',
    'map-epidemic':          'epidemiology',
    'interactive-certificate-builder': 'certificates',
    'envelope-printer':      'envelopes',
    'autocorrect':           'ahk_scripts',
    'base64-decoder':        'base64',
    'thai-recovery':         'thai_recovery',
    'mypcu-sql-simulator':   'mypcu_sql',
    'mypcu-sql-cheatsheet-ai': 'mypcu_ai_sql',
    'index':                 'tools'
  };

  function getAppName() {
    const p = window.location.pathname.split('/').pop();
    return p || 'index';
  }

  function getCollectionName() {
    const app = getAppName();
    return COLLECTIONS[app] || 'unknown';
  }

  let initialized = false;
  let auth = null;
  let db = null;
  let currentUser = null;
  const listeners = [];

  const api = {};

  // Init: load Firebase compat SDK then init
  api.init = function() {
    if (initialized) return Promise.resolve();
    if (!CONFIG.apiKey || !CONFIG.projectId) {
      return Promise.reject(new Error('[FirebaseAuth] No config'));
    }
    return new Promise(function(resolve, reject) {
      loadScript('https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js', function() {
        loadScript('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth-compat.js', function() {
          loadScript('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore-compat.js', function() {
            try {
              var app = firebase.initializeApp(CONFIG);
              auth = firebase.auth();
              db = firebase.firestore();
              if (db.settings) db.settings({ merge: true });

              // Firestore offline persistence
              try {
                firebase.firestore().enablePersistence()
                  .catch(function(err) {
                    if (err.code !== 'failed-precondition') console.warn('[FirebaseAuth] Persistence:', err);
                  });
              } catch(e) {}

              auth.onAuthStateChanged(function(user) {
                currentUser = user;
                listeners.forEach(function(fn) { fn(user); });
                window.dispatchEvent(new CustomEvent('tools-auth-changed', { detail: { user: user } }));
              });

              initialized = true;
              resolve();
            } catch(e) {
              reject(e);
            }
          });
        });
      });
    });
  };

  function loadScript(src, cb) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = cb;
    s.onerror = function() { console.error('[FirebaseAuth] Failed to load:', src); };
    document.body.appendChild(s);
  }

  // Auth state
  api.getUser = function() { return currentUser; };
  api.isSignedIn = function() { return !!currentUser; };
  api.getUid = function() { return currentUser ? currentUser.uid : null; };

  // Sign In with Google — popup
  api.signInWithGoogle = function() {
    if (!auth) return Promise.reject(new Error('[FirebaseAuth] Not initialized'));
    var provider = new firebase.auth.GoogleAuthProvider();
    // Request these scopes so we can identify the user across devices
    provider.addScope('profile');
    provider.addScope('email');
    return auth.signInWithPopup(provider);
  };

  // Sign Out
  api.signOut = function() {
    if (!auth) return Promise.resolve();
    return auth.signOut().then(function() {
      currentUser = null;
    });
  };

  // Listen auth changes
  api.onAuthChanged = function(fn) {
    listeners.push(fn);
    if (currentUser) fn(currentUser);
    return function() {
      var idx = listeners.indexOf(fn);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  };

  // ====== FIRESTORE HELPERS ======

  // Get scoped collection reference: /<app_collection>/<user_uid>/data
  api.getUserCollection = function() {
    if (!currentUser || !db) return null;
    return db.collection(getCollectionName()).doc(currentUser.uid).collection('data');
  };

  // Save data (merge). If docId omitted, auto-generate.
  api.saveData = function(data, docId) {
    var col = api.getUserCollection();
    if (!col) return Promise.reject(new Error('[FirebaseAuth] Not signed in'));
    var ref = docId ? col.doc(docId) : col.doc();
    return ref.set(data, { merge: true }).then(function() { return ref.id; });
  };

  // Load all user data for this app
  api.loadAllData = function() {
    var col = api.getUserCollection();
    if (!col) return Promise.resolve([]);
    return col.get().then(function(snap) {
      var results = [];
      snap.forEach(function(d) {
        var item = d.data();
        item.id = d.id;
        results.push(item);
      });
      return results;
    });
  };

  // Load single doc
  api.loadDoc = function(docId) {
    var col = api.getUserCollection();
    if (!col) return Promise.resolve(null);
    return col.doc(docId).get().then(function(d) {
      if (!d.exists) return null;
      var item = d.data();
      item.id = d.id;
      return item;
    });
  };

  // Delete data
  api.deleteData = function(docId) {
    var col = api.getUserCollection();
    if (!col) return Promise.reject(new Error('[FirebaseAuth] Not signed in'));
    return col.doc(docId).delete();
  };

  // ====== AUTH UI HELPER ======

  // Inject auth button into any container
  // containerEl: DOM element to put the button
  // options: { onSignIn, onSignOut, compact }
  api.injectAuthButton = function(containerEl, options) {
    options = options || {};
    var self = this;
    var wrapper = document.createElement('div');
    wrapper.className = 'tools-auth-widget';
    wrapper.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:13px;';

    var avatar = document.createElement('img');
    avatar.style.cssText = 'width:32px;height:32px;border-radius:50%;object-fit:cover;display:none;';

    var info = document.createElement('span');
    info.style.cssText = 'font-size:12px;color:#475569;';

    var btn = document.createElement('button');
    btn.style.cssText = 'padding:6px 14px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;font-size:12px;font-weight:600;color:#1e293b;transition:all 0.15s;';
    btn.onmouseover = function() { btn.style.background = '#f1f5f9'; };
    btn.onmouseout = function() { btn.style.background = '#fff'; };

    function render(user) {
      if (user) {
        avatar.src = user.photoURL || '';
        avatar.style.display = user.photoURL ? 'inline' : 'none';
        info.textContent = user.displayName || user.email || 'User';
        btn.textContent = 'ออกจากระบบ';
        btn.onclick = function() {
          api.signOut().then(function() {
            if (options.onSignOut) options.onSignOut();
          });
        };
      } else {
        avatar.style.display = 'none';
        info.textContent = 'ยังไม่เข้าสู่ระบบ';
        btn.textContent = 'เข้าสู่ระบบ Google';
        btn.onclick = function() {
          api.signInWithGoogle().then(function(result) {
            if (options.onSignIn) options.onSignIn(result.user);
          }).catch(function(err) {
            console.warn('[FirebaseAuth] Sign-in failed:', err);
            alert('ไม่สามารถเข้าสู่ระบบได้: ' + err.message);
          });
        };
      }
    }

    wrapper.appendChild(avatar);
    wrapper.appendChild(info);
    wrapper.appendChild(btn);

    if (options.compact) {
      wrapper.style.gap = '4px';
      btn.style.padding = '4px 10px';
      btn.style.fontSize = '11px';
      avatar.style.width = '24px';
      avatar.style.height = '24px';
    }

    // Initial render
    render(currentUser);
    // Listen for changes
    api.onAuthChanged(render);

    containerEl.appendChild(wrapper);
  };

  // Expose
  window.TOOLS_FIREBASE = api;

  // Auto-init if not suppressed
  if (!window.__TOOLS_FIREBASE_SKIP_AUTOINIT) {
    api.init().catch(function(e) {
      if (e.message === '[FirebaseAuth] No config') {
        console.warn('[FirebaseAuth] No Firebase config — auth disabled');
      } else {
        console.error('[FirebaseAuth] Init failed:', e);
      }
    });
  }
})();
