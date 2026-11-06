import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  getAuth,
  type User as FirebaseUser,
} from "firebase/auth";
import { initializeApp } from "firebase/app";
import {
  collection,
  getFirestore,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  getDoc,
} from "firebase/firestore";

// CONFIGURAZIONE FIREBASE - PIO WEB
const firebaseConfig = {
  apiKey: "AIzaSyDahGjnl8LvyjRKBHui5Lj530Z_Wun07u4",
  authDomain: "pio-web-f402c.firebaseapp.com",
  projectId: "pio-web-f402c",
  storageBucket: "pio-web-f402c.firebasestorage.app",
  messagingSenderId: "382376455522",
  appId: "1:382376455522:web:d9bc8f8a40943b4c1b903b",
  measurementId: "G-XBPMLBFX7J"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "pio-web-app";

// 5 Preset Vocali ufficiali di Pio
const PIO_VOICE_PRESETS = [
  { id: 'normale', name: 'Pio Classico', desc: 'Squillante e naturale', pitch: 1.0, rate: 1.0, emoji: '🐥' },
  { id: 'profondo', name: 'Pio Profondo', desc: 'Basso e cupo come un orso', pitch: 0.3, rate: 0.75, emoji: '🐻' },
  { id: 'acuto', name: 'Pio Acuto', desc: 'Altissimo da mini-pulcino', pitch: 2.0, rate: 1.35, emoji: '🐣' },
  { id: 'addormentato', name: 'Pio Addormentato', desc: 'Lento, pigro e assonnato', pitch: 0.7, rate: 0.5, emoji: '🥱' },
  { id: 'frenetico', name: 'Pio Frenetico', desc: 'Iperattivo e velocissimo', pitch: 1.6, rate: 1.9, emoji: '⚡' }
];

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);

  // Stati per Autenticazione (Login / Registrazione)
  const [isRegistering, setIsRegistering] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [roleInput, setRoleInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Dati sincronizzati in tempo reale
  const [mensaList, setMensaList] = useState<any[]>([]);
  const [workLogs, setWorkLogs] = useState<any[]>([]);
  const [broadcastMessage, setBroadcastMessage] = useState<any>(null);
  const [dismissedBroadcastId, setDismissedBroadcastId] = useState<string | null>(null);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [newBroadcastText, setNewBroadcastText] = useState('');

  // UI States
  const [activePreset, setActivePreset] = useState('normale');
  const [isPioPressed, setIsPioPressed] = useState(false);
  const [mensaSuccessAlert, setMensaSuccessAlert] = useState(false);
  
  // Form Registro Ore & Straordinario
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formEndTime, setFormEndTime] = useState('18:00');
  const [hasBreak, setHasBreak] = useState(false);
  const [formBreakStart, setFormBreakStart] = useState('13:00');
  const [formBreakEnd, setFormBreakEnd] = useState('14:00');
  const [formLogNote, setFormLogNote] = useState('');

  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (text: string) => {
    setToastMessage(text);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. Auth State Observer basato su UID reale
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', firebaseUser.uid);
          const userSnap = await getDoc(userDocRef);
          if (userSnap.exists()) {
            setCurrentUser({ id: userSnap.id, ...userSnap.data() });
          } else {
            const defaultProfile = {
              name: firebaseUser.email?.split('@')[0] || 'Utente',
              role: 'Collaboratore',
              approved: false,
              isAdmin: false,
              createdAt: Date.now()
            };
            await setDoc(userDocRef, defaultProfile);
            setCurrentUser({ id: firebaseUser.uid, ...defaultProfile });
          }
        } catch (e) {
          console.error("Errore caricamento profilo utente:", e);
        }
      } else {
        setCurrentUser(null);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Sync dati cloud in tempo reale
  useEffect(() => {
    if (!user) return;

    const usersCol = collection(db, 'artifacts', appId, 'public', 'data', 'users');
    const mensaCol = collection(db, 'artifacts', appId, 'public', 'data', 'mensa');
    const logsCol = collection(db, 'artifacts', appId, 'public', 'data', 'work_logs');
    const broadcastCol = collection(db, 'artifacts', appId, 'public', 'data', 'broadcast');

    const unsubUsers = onSnapshot(usersCol, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setUsers(list);
      const current = list.find((u: any) => u.id === user.uid);
      if (current) {
        setCurrentUser(current);
      }
    }, (error) => console.error("Errore sync utenti:", error));

    const unsubMensa = onSnapshot(mensaCol, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setMensaList(list);
    }, (error) => console.error("Errore sync mensa:", error));

    const unsubLogs = onSnapshot(logsCol, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
      setWorkLogs(list);
    }, (error) => console.error("Errore sync straordinari:", error));

    const unsubBroadcast = onSnapshot(broadcastCol, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      if (docs.length > 0) {
        docs.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
        setBroadcastMessage(docs[0]);
      } else {
        setBroadcastMessage(null);
      }
    }, (error) => console.error("Errore sync avvisi:", error));

    return () => {
      unsubUsers();
      unsubMensa();
      unsubLogs();
      unsubBroadcast();
    };
  }, [user]);

  // Gestione Login
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, emailInput, passwordInput);
      showToast('Accesso effettuato con successo!');
    } catch (err: any) {
      setAuthError(err.message || 'Errore durante l\'accesso.');
    }
  };

  // Gestione Registrazione
  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!nameInput.trim()) {
      setAuthError('Inserisci nome e cognome.');
      return;
    }
    try {
      const cred = await createUserWithEmailAndPassword(auth, emailInput, passwordInput);
      const newUid = cred.user.uid;
      
      const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', newUid);
      await setDoc(userDocRef, {
        name: nameInput.trim(),
        role: roleInput.trim() || 'Collaboratore',
        approved: false,
        isAdmin: false,
        createdAt: Date.now()
      });
      showToast('Registrazione completata! In attesa di approvazione.');
    } catch (err: any) {
      setAuthError(err.message || 'Errore durante la registrazione.');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      showToast('Disconnesso con successo.');
    } catch (e) {
      console.error(e);
    }
  };

  // --- MOTORE AUDIO: "PIOOOOOO" ---
  const speakPio = (presetId = activePreset) => {
    setIsPioPressed(true);
    setTimeout(() => setIsPioPressed(false), 300);

    const preset = PIO_VOICE_PRESETS.find(p => p.id === presetId) || PIO_VOICE_PRESETS[0];

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance("PIOOOOOO");
      utterance.lang = "it-IT";
      utterance.pitch = preset.pitch;
      utterance.rate = preset.rate;
      
      const voices = window.speechSynthesis.getVoices();
      const itVoice = voices.find(v => v.lang.toLowerCase().includes('it'));
      if (itVoice) {
        utterance.voice = itVoice;
      }
      window.speechSynthesis.speak(utterance);
    }

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const baseFreq = 520 * (preset.pitch || 1);
        osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, ctx.currentTime + 0.18);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      }
    } catch (e) {
      // Audio contestuale protetto
    }
  };

  const isUserInMensa = useMemo(() => {
    if (!currentUser) return false;
    return mensaList.some(item => item.userId === currentUser.id);
  }, [mensaList, currentUser]);

  const handleRegisterMensa = async () => {
    if (!user || !currentUser) return;
    if (!currentUser.approved) {
      showToast('⚠️ Il tuo account deve prima essere autorizzato per segnarti alla mensa!');
      return;
    }

    speakPio('acuto');
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    try {
      const mensaDoc = doc(db, 'artifacts', appId, 'public', 'data', 'mensa', currentUser.id);
      await setDoc(mensaDoc, {
        userId: currentUser.id,
        name: currentUser.name,
        time: timeStr,
        timestamp: Date.now()
      });
      setMensaSuccessAlert(true);
      setTimeout(() => setMensaSuccessAlert(false), 5000);
    } catch (e) {
      showToast('Errore durante la registrazione a mensa.');
    }
  };

  const handleRevokeMensa = async () => {
    if (!user || !currentUser) return;
    try {
      const mensaDoc = doc(db, 'artifacts', appId, 'public', 'data', 'mensa', currentUser.id);
      await deleteDoc(mensaDoc);
      setMensaSuccessAlert(false);
      showToast('Hai revocato la tua presenza alla mensa.');
    } catch (e) {
      showToast('Errore durante la revoca.');
    }
  };

  const handleAddWorkLog = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !currentUser) return;
    if (!currentUser.approved) {
      showToast('⚠️ Account in attesa di approvazione. Non puoi ancora registrare le ore.');
      return;
    }
    if (!formEndTime) {
      showToast('Inserisci un orario di fine turno valido.');
      return;
    }

    const logId = `log_${currentUser.id}_${formDate.replace(/-/g, '')}`;
    try {
      const logDoc = doc(db, 'artifacts', appId, 'public', 'data', 'work_logs', logId);
      await setDoc(logDoc, {
        userId: currentUser.id,
        name: currentUser.name,
        date: formDate,
        endTime: formEndTime,
        breakStart: hasBreak ? formBreakStart : '',
        breakEnd: hasBreak ? formBreakEnd : '',
        note: formLogNote.trim(),
        timestamp: Date.now()
      });
      showToast('✅ Straordinario e orario registrati nel cloud condiviso!');
    } catch (err) {
      showToast('Errore durante il salvataggio.');
    }
  };

  const handleSendBroadcast = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !currentUser?.isAdmin) return;
    if (!newBroadcastText.trim()) return;

    try {
      const bcDoc = doc(db, 'artifacts', appId, 'public', 'data', 'broadcast', 'active_broadcast');
      await setDoc(bcDoc, {
        id: 'bc_' + Date.now(),
        text: newBroadcastText.trim(),
        author: currentUser.name,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now()
      });

      setDismissedBroadcastId(null);
      setShowBroadcastModal(false);
      setNewBroadcastText('');
      showToast('📢 Notifica flash inviata istantaneamente a tutti!');
    } catch (err) {
      showToast('Errore durante l\'invio dell\'avviso.');
    }
  };

  const handleClearAllLogs = async () => {
    if (!user) return;
    try {
      const deletePromises = workLogs.map(log => 
        deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'work_logs', log.id))
      );
      await Promise.all(deletePromises);
      setShowClearConfirmModal(false);
      showToast('🧹 Tutte le registrazioni del registro sono state eliminate per tutti!');
    } catch (e) {
      showToast('Errore durante la pulizia del registro.');
    }
  };

  const handleToggleAuthorization = async (userId: string, newStatus: boolean) => {
    if (!user || !currentUser?.isAdmin) return;
    try {
      const userDoc = doc(db, 'artifacts', appId, 'public', 'data', 'users', userId);
      await setDoc(userDoc, { approved: newStatus }, { merge: true });
      showToast(newStatus ? '✅ Utente autorizzato con successo!' : '❌ Autorizzazione revocata.');
    } catch (err) {
      showToast('Errore durante la modifica dei permessi.');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-100 to-orange-100 flex items-center justify-center">
        <div className="text-2xl font-black text-amber-950 animate-bounce">🐥 Caricamento Pio Web...</div>
      </div>
    );
  }

  // SCHERMATA DI ACCESSO / REGISTRAZIONE
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-100 via-yellow-50 to-orange-100 flex items-center justify-center p-4">
        {toastMessage && (
          <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-slate-950 text-white font-bold px-6 py-3 rounded-full shadow-2xl border-2 border-yellow-400">
            {toastMessage}
          </div>
        )}
        <div className="bg-white rounded-3xl p-8 max-w-md w-full border-4 border-amber-400 shadow-2xl">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-amber-300 flex items-center justify-center text-4xl mx-auto mb-3 shadow border-2 border-amber-500 animate-bounce">
              🐥
            </div>
            <h1 className="text-3xl font-black text-amber-950">PIO WEB</h1>
            <p className="text-xs text-amber-900 font-semibold mt-1">
              {isRegistering ? 'Crea il tuo account' : 'Accedi con le tue credenziali'}
            </p>
          </div>

          {authError && (
            <div className="mb-4 p-3 bg-rose-100 border-2 border-rose-300 text-rose-800 text-xs font-bold rounded-xl">
              {authError}
            </div>
          )}

          <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-4">
            {isRegistering && (
              <>
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1">Nome e Cognome:</label>
                  <input
                    type="text"
                    required
                    placeholder="Es. Mario Rossi"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="w-full bg-slate-50 px-3 py-2.5 rounded-xl border-2 border-slate-200 font-bold text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1">Ruolo / Reparto:</label>
                  <input
                    type="text"
                    placeholder="Es. Magazzino, Ufficio"
                    value={roleInput}
                    onChange={(e) => setRoleInput(e.target.value)}
                    className="w-full bg-slate-50 px-3 py-2.5 rounded-xl border-2 border-slate-200 font-bold text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-black text-slate-700 uppercase mb-1">Email:</label>
              <input
                type="email"
                required
                placeholder="nome@azienda.it"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full bg-slate-50 px-3 py-2.5 rounded-xl border-2 border-slate-200 font-bold text-sm focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 uppercase mb-1">Password:</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full bg-slate-50 px-3 py-2.5 rounded-xl border-2 border-slate-200 font-bold text-sm focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-amber-500 hover:bg-amber-600 text-amber-950 font-black py-3 rounded-xl shadow-lg border-b-4 border-amber-700 active:border-b-0 active:translate-y-1 transition-all text-sm mt-2"
            >
              {isRegistering ? 'Registrati 🐥' : 'Accedi 🚀'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => { setIsRegistering(!isRegistering); setAuthError(null); }}
              className="text-xs font-bold text-amber-800 hover:underline"
            >
              {isRegistering ? 'Hai già un account? Accedi' : 'Non hai un account? Registrati'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-100 via-yellow-50 to-orange-100 text-slate-800 font-sans pb-16">
      
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 text-white font-bold px-6 py-3 rounded-full shadow-2xl border-2 border-yellow-400 backdrop-blur transition-all flex items-center gap-2">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* HEADER PRINCIPALE */}
      <header className="bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 shadow-lg border-b-4 border-amber-500 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-3xl shadow-md border-2 border-amber-600 animate-bounce">
              🐥
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-amber-950 tracking-tight flex items-center gap-2">
                PIO WEB <span className="text-xs bg-amber-900 text-yellow-300 font-bold px-2 py-0.5 rounded-full">v2.0</span>
              </h1>
              <p className="text-xs font-semibold text-amber-900">Il portale allegro della mensa e dei turni</p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-amber-300/80 p-2 rounded-2xl border border-amber-500/50">
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-sm font-black text-amber-950">{currentUser?.name || user.email}</span>
                {currentUser?.approved ? (
                  <span className="text-[10px] bg-green-600 text-white font-bold px-1.5 py-0.2 rounded-full" title="Account Autorizzato">
                    Autorizzato ✓
                  </span>
                ) : (
                  <span className="text-[10px] bg-orange-600 text-white font-bold px-1.5 py-0.2 rounded-full animate-pulse" title="In attesa di approvazione">
                    In Attesa ⏳
                  </span>
                )}
              </div>
              <span className="text-xs text-amber-900 font-medium">{currentUser?.role || 'Collaboratore'}</span>
            </div>

            {currentUser?.isAdmin && (
              <button
                onClick={() => setShowBroadcastModal(true)}
                className="bg-rose-500 hover:bg-rose-600 text-white text-xs font-black px-2.5 py-1.5 rounded-xl shadow transition-all animate-pulse"
                title="Invia una notifica a comparsa a tutti"
              >
                📢 Avviso
              </button>
            )}

            {currentUser?.isAdmin && (
              <button
                onClick={() => setShowAdminPanel(!showAdminPanel)}
                className={`text-xs font-black px-2.5 py-1.5 rounded-xl shadow transition-all border ${
                  showAdminPanel ? 'bg-purple-700 text-white border-purple-900' : 'bg-purple-100 text-purple-900 border-purple-400 hover:bg-purple-200'
                }`}
              >
                ⚙️ Admin
              </button>
            )}

            <button
              onClick={handleLogout}
              className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow transition-colors"
            >
              Esci
            </button>
          </div>
        </div>
      </header>

      {/* NOTIFICA FLASH */}
      {broadcastMessage && dismissedBroadcastId !== broadcastMessage.id && (
        <div 
          onClick={() => setDismissedBroadcastId(broadcastMessage.id)}
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer select-none transition-opacity"
        >
          <div className="bg-gradient-to-br from-amber-300 via-yellow-200 to-amber-400 border-4 border-amber-600 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl text-center pointer-events-none transform animate-in fade-in zoom-in duration-200">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto text-3xl shadow-lg border-2 border-amber-500 mb-3 animate-bounce">
              📢
            </div>
            <span className="text-[11px] bg-amber-950 text-yellow-300 font-black px-3 py-1 rounded-full uppercase tracking-wider">
              Messaggio di Pio da {broadcastMessage.author} • {broadcastMessage.time}
            </span>
            <p className="mt-4 text-xl sm:text-2xl font-black text-amber-950 leading-snug">
              "{broadcastMessage.text}"
            </p>
            <div className="mt-6 pt-3 border-t-2 border-amber-400/60 flex items-center justify-center gap-1.5 text-xs font-black text-amber-900">
              <span>👆 Tocca un punto qualsiasi dello schermo per chiudere</span>
            </div>
          </div>
        </div>
      )}

      {currentUser && !currentUser.approved && (
        <div className="max-w-4xl mx-auto mt-4 px-4">
          <div className="bg-amber-200 border-2 border-amber-500 text-amber-950 p-4 rounded-2xl flex items-center gap-3 shadow-md">
            <span className="text-3xl">🐥⏳</span>
            <div>
              <p className="font-black text-sm md:text-base">Ciao {currentUser.name}! Il tuo profilo è in attesa di approvazione.</p>
              <p className="text-xs text-amber-900 font-medium">
                Un amministratore deve autorizzarti prima che tu possa segnarti alla mensa o registrare le tue ore.
              </p>
            </div>
          </div>
        </div>
      )}

      {showAdminPanel && currentUser?.isAdmin && (
        <section className="max-w-4xl mx-auto mt-4 px-4">
          <div className="bg-white rounded-3xl p-5 border-4 border-purple-400 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-purple-100 mb-4">
              <h2 className="text-lg font-black text-purple-900 flex items-center gap-2">
                ⚙️ Gestione Autorizzazioni Nuovi Utenti
              </h2>
              <span className="text-xs bg-purple-100 text-purple-800 font-bold px-2 py-1 rounded-full">
                Area Riservata
              </span>
            </div>

            <div className="space-y-2">
              {users.map((u: any) => (
                <div key={u.id} className="flex items-center justify-between p-3 bg-slate-50 hover:bg-purple-50/50 rounded-xl border border-slate-200">
                  <div>
                    <span className="font-bold text-slate-800">{u.name}</span>
                    <span className="text-xs text-slate-500 ml-2">({u.role})</span>
                    {u.isAdmin && <span className="ml-2 text-xs bg-amber-400 text-amber-950 px-2 py-0.5 rounded font-black">Admin</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {u.approved ? (
                      <span className="text-xs font-bold text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
                        Autorizzato ✓
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-orange-700 bg-orange-100 px-2.5 py-1 rounded-full">
                        In attesa
                      </span>
                    )}

                    {!u.isAdmin && (
                      <button
                        onClick={() => handleToggleAuthorization(u.id, !u.approved)}
                        className={`text-xs font-bold px-3 py-1 rounded-lg transition-colors ${
                          u.approved 
                            ? 'bg-rose-100 text-rose-700 hover:bg-rose-200 border border-rose-300' 
                            : 'bg-green-600 text-white hover:bg-green-700 shadow'
                        }`}
                      >
                        {u.approved ? 'Revoca' : 'Autorizza Ora'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CONTENUTO PRINCIPALE */}
      <main className="max-w-6xl mx-auto px-4 mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* COLONNA SINISTRA: IL BOTTONE DI PIO (5 VOCI) */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-gradient-to-br from-yellow-300 via-amber-300 to-yellow-400 rounded-3xl p-6 border-4 border-amber-400 shadow-xl text-center flex flex-col items-center justify-between relative overflow-hidden">
            
            <div className="w-full">
              <span className="inline-block bg-amber-900 text-yellow-200 text-xs font-black uppercase px-3 py-1 rounded-full tracking-wider mb-2">
                Effetto Vocale
              </span>
              <h2 className="text-2xl md:text-3xl font-black text-amber-950">Il Bottone di Pio</h2>
              <p className="text-amber-900 text-xs font-medium mt-1">
                Premi per far cantare il pulcino con la voce che preferisci!
              </p>
            </div>

            <div className="my-8">
              <button
                onClick={() => speakPio(activePreset)}
                className={`relative group inline-flex flex-col items-center justify-center w-52 h-52 md:w-60 md:h-60 rounded-full bg-gradient-to-b from-yellow-300 to-amber-500 border-8 border-amber-600 shadow-[0_16px_0_0_#b45309] active:shadow-[0_4px_0_0_#b45309] active:translate-y-3 transition-all cursor-pointer ${
                  isPioPressed ? 'scale-95' : 'hover:scale-105'
                }`}
              >
                <span className="text-7xl md:text-8xl select-none filter drop-shadow">🐥</span>
                <span className="font-black text-2xl md:text-3xl text-amber-950 tracking-wider mt-1 drop-shadow-sm">
                  PIOOOOOO!
                </span>
                <span className="text-xs font-bold text-amber-900 bg-yellow-200/90 px-3 py-0.5 rounded-full mt-1">
                  Toccami! 🔊
                </span>
              </button>
            </div>

            <div className="w-full bg-white/60 backdrop-blur-md rounded-2xl p-4 border border-amber-400/60">
              <label className="block text-xs font-black text-amber-950 uppercase tracking-wider mb-2 text-left">
                Scegli il tipo di voce (Massimo 5):
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PIO_VOICE_PRESETS.map((preset) => {
                  const isSelected = activePreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => {
                        setActivePreset(preset.id);
                        speakPio(preset.id);
                      }}
                      className={`flex items-center gap-2 p-2.5 rounded-xl text-left border-2 transition-all ${
                        isSelected 
                          ? 'bg-amber-500 text-white border-amber-700 shadow font-black' 
                          : 'bg-white hover:bg-amber-100 text-amber-950 border-amber-300 font-bold'
                      }`}
                    >
                      <span className="text-2xl">{preset.emoji}</span>
                      <div className="flex-1 min-w-0 leading-tight">
                        <div className="text-xs truncate">{preset.name}</div>
                        <div className={`text-[10px] ${isSelected ? 'text-amber-100' : 'text-amber-700'} truncate font-normal`}>
                          {preset.desc}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          <div className="bg-white rounded-3xl p-5 border-2 border-amber-200 shadow-md">
            <h3 className="font-black text-amber-950 text-sm flex items-center gap-1.5 mb-2">
              💡 Consigli per Pio Web:
            </h3>
            <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 font-medium">
              <li><strong>Notifica orario mensa:</strong> Imposta un avviso sonoro alle ore 12:00 per ricordare a chi non si è ancora segnato di farlo.</li>
              <li><strong>Esportazione Excel/CSV:</strong> Scarica il registro ore con un clic a fine mese prima di cancellare le righe.</li>
              <li><strong>Menu del giorno:</strong> Aggiungi una casella dove chi cucina o ordina scrive cosa c'è per pranzo!</li>
            </ul>
          </div>
        </section>

        {/* COLONNA DESTRA: MENSA E REGISTRO LAVORO */}
        <div className="lg:col-span-7 flex flex-col gap-6">

          {/* SEZIONE 1: MENSA AZIENDALE */}
          <section className="bg-white rounded-3xl p-6 border-4 border-amber-300 shadow-xl relative overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <span className="text-xs font-black bg-amber-100 text-amber-800 px-3 py-1 rounded-full uppercase">
                  Pausa Pranzo
                </span>
                <h2 className="text-2xl font-black text-amber-950 mt-1 flex items-center gap-2">
                  🍽️ Prenotazione Mensa
                </h2>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-amber-600">{mensaList.length}</span>
                <span className="text-xs text-slate-500 font-bold block">Prenotati Oggi</span>
              </div>
            </div>

            {mensaSuccessAlert && (
              <div className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-green-400 to-emerald-500 text-white font-black text-center shadow-lg border-2 border-green-600 flex items-center justify-center gap-3 animate-pulse">
                <span className="text-3xl">🐥🎉</span>
                <div>
                  <div className="text-base md:text-lg">Complimenti ti sei segnato per la mensa!</div>
                  <div className="text-xs font-medium text-green-100">Buon appetito dal pulcino Pio!</div>
                </div>
              </div>
            )}

            <div className="bg-amber-50 p-4 rounded-2xl border-2 border-amber-200 mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-amber-900">Il tuo stato oggi:</p>
                <p className="text-sm font-black text-slate-800">
                  {isUserInMensa ? '✅ Sei già registrato per il pranzo!' : '❌ Non ti sei ancora segnato'}
                </p>
              </div>

              <div className="flex gap-2">
                {!isUserInMensa ? (
                  <button
                    onClick={handleRegisterMensa}
                    className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-black text-sm px-6 py-3 rounded-2xl shadow-lg border-b-4 border-orange-700 active:border-b-0 active:translate-y-1 transition-all flex items-center gap-2"
                  >
                    <span>Segnati a Mensa!</span>
                    <span className="text-lg">🍽️</span>
                  </button>
                ) : (
                  <button
                    onClick={handleRevokeMensa}
                    className="bg-rose-50 hover:bg-rose-100 text-rose-700 border-2 border-rose-300 font-black text-xs px-4 py-2.5 rounded-xl transition-all"
                  >
                    Revoca Presenza ✖
                  </button>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">
                Chi si è già segnato oggi:
              </h3>
              {mensaList.length === 0 ? (
                <div className="text-center py-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 text-xs font-bold">
                  Nessun pulcino si è ancora registrato a mensa per oggi. Sii il primo!
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
                  {mensaList.map((person: any) => (
                    <div 
                      key={person.id} 
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-black border ${
                        person.userId === currentUser?.id 
                          ? 'bg-amber-200 text-amber-950 border-amber-400 ring-2 ring-amber-400/50' 
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      <span>🐥</span>
                      <span>{person.name}</span>
                      <span className="text-[10px] text-slate-400 font-semibold">{person.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* SEZIONE 2: REGISTRO ORE E STACCO */}
          <section className="bg-white rounded-3xl p-6 border-4 border-yellow-300 shadow-xl flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div>
                <span className="text-xs font-black bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full uppercase">
                  Turni & Presenze
                </span>
                <h2 className="text-2xl font-black text-amber-950 mt-1 flex items-center gap-2">
                  ⏰ Registro Lavoro & Stacco
                </h2>
              </div>

              <button
                onClick={() => setShowClearConfirmModal(true)}
                className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 text-xs font-bold px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
                title="Cancella tutto il registro in una volta"
              >
                <span>🗑️</span>
                <span>Cancella Tutto</span>
              </button>
            </div>

            <form onSubmit={handleAddWorkLog} className="bg-yellow-50/70 p-4 rounded-2xl border-2 border-yellow-200 flex flex-col gap-3">
              <div className="text-xs font-bold text-amber-900">
                Registra la tua presenza per: <strong className="text-slate-900">{currentUser?.name}</strong>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                    Giorno Straordinario:
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                    className="w-full bg-white px-3 py-2 rounded-xl border-2 border-amber-300 font-bold text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                    Fino a che ora ti sei fermato?
                  </label>
                  <input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    required
                    className="w-full bg-white px-3 py-2 rounded-xl border-2 border-amber-300 font-black text-slate-800 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                    Motivo / Nota (Opzionale)
                  </label>
                  <input
                    type="text"
                    placeholder="Es. Straordinario inventario"
                    value={formLogNote}
                    onChange={(e) => setFormLogNote(e.target.value)}
                    className="w-full bg-white px-3 py-2 rounded-xl border-2 border-amber-300 text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="bg-white p-3 rounded-xl border border-amber-200">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasBreak}
                      onChange={(e) => setHasBreak(e.target.checked)}
                      className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
                    />
                    <span className="text-xs font-black text-slate-800">
                      Hai fatto uno stacco durante il turno? (es. uscita o permesso)
                    </span>
                  </label>
                </div>

                {hasBreak && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3">
                    <div className="flex-1">
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">Dalle ore:</span>
                      <input
                        type="time"
                        value={formBreakStart}
                        onChange={(e) => setFormBreakStart(e.target.value)}
                        className="w-full bg-amber-50 px-2 py-1.5 rounded-lg border border-amber-300 font-bold text-xs"
                      />
                    </div>
                    <span className="text-slate-400 font-black mt-4">➜</span>
                    <div className="flex-1">
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">Alle ore:</span>
                      <input
                        type="time"
                        value={formBreakEnd}
                        onChange={(e) => setFormBreakEnd(e.target.value)}
                        className="w-full bg-amber-50 px-2 py-1.5 rounded-lg border border-amber-300 font-bold text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="w-full bg-amber-500 hover:bg-amber-600 text-amber-950 font-black py-2.5 rounded-xl shadow-md border-b-2 border-amber-700 active:border-b-0 active:translate-y-0.5 transition-all text-sm"
              >
                💾 Salva nel Registro Condiviso
              </button>
            </form>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-black text-slate-600 uppercase tracking-wider">
                  Riepilogo Straordinari (Visibile a tutti i partecipanti)
                </h3>
                <span className="text-xs font-bold text-amber-800">{workLogs.length} Registrati</span>
              </div>

              <div className="bg-slate-50 rounded-2xl border-2 border-slate-200 overflow-hidden shadow-inner">
                <div className="grid grid-cols-12 bg-slate-200/80 px-3 py-2.5 text-xs font-black text-slate-700 uppercase">
                  <div className="col-span-4">Collaboratore</div>
                  <div className="col-span-3 text-center">Giorno</div>
                  <div className="col-span-2 text-center">Fermato alle</div>
                  <div className="col-span-3 text-center">Stacco</div>
                </div>

                <div className="divide-y divide-slate-200 max-h-60 overflow-y-auto">
                  {workLogs.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs font-bold">
                      Nessun orario presente nel registro.
                    </div>
                  ) : (
                    workLogs.map((log: any) => {
                      const breakTaken = log.breakStart && log.breakEnd;
                      return (
                        <div key={log.id} className="grid grid-cols-12 px-3 py-3 text-xs items-center hover:bg-white transition-colors">
                          <div className="col-span-4 font-bold text-slate-800 truncate pr-2">
                            <span>{log.name}</span>
                            {log.note && (
                              <span className="block text-[10px] text-slate-400 font-normal truncate">
                                📝 {log.note}
                              </span>
                            )}
                          </div>

                          <div className="col-span-3 text-center font-semibold text-slate-600 text-[11px]">
                            📅 {log.date || 'Oggi'}
                          </div>
                          
                          <div className="col-span-2 text-center">
                            <span className="inline-block bg-amber-200 text-amber-950 font-black px-2 py-1 rounded-lg border border-amber-300">
                              {log.endTime}
                            </span>
                          </div>

                          <div className="col-span-3 text-center">
                            {breakTaken ? (
                              <span className="inline-block bg-orange-100 text-orange-900 font-bold px-2 py-0.5 rounded-lg border border-orange-300 text-[11px]">
                                {log.breakStart} - {log.breakEnd}
                              </span>
                            ) : (
                              <span className="inline-block bg-slate-200 text-slate-500 font-semibold px-2 py-0.5 rounded-md text-[10px]">
                                Nessuno
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

          </section>

        </div>

      </main>

      {/* MODALE INVIO NOTIFICA FLASH */}
      {showBroadcastModal && currentUser?.isAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border-4 border-rose-400 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-black text-xl text-rose-950 flex items-center gap-2">
                📢 Invia Avviso Flash a Tutti
              </h3>
              <button 
                onClick={() => setShowBroadcastModal(false)}
                className="text-slate-400 hover:text-slate-600 font-black text-lg"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 mt-2">
              Questo messaggio comparirà all'istante sullo schermo di tutti i partecipanti.
            </p>

            <form onSubmit={handleSendBroadcast} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                  Testo del messaggio:
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Es. Attenzione: oggi la mensa chiude alle 13:00!"
                  value={newBroadcastText}
                  onChange={(e) => setNewBroadcastText(e.target.value)}
                  className="w-full bg-slate-50 p-3 rounded-xl border-2 border-slate-200 font-semibold text-sm focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowBroadcastModal(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-xl text-xs"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-black py-2 rounded-xl text-xs shadow-md"
                >
                  Invia a Schermo Intero 📢
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODALE DI CONFERMA CANCELLAZIONE */}
      {showClearConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border-4 border-rose-400 shadow-2xl text-center">
            <span className="text-4xl block mb-2">🗑️</span>
            <h3 className="font-black text-lg text-slate-900">Cancellare tutto il registro?</h3>
            <p className="text-xs text-slate-600 mt-2">
              Questa azione eliminerà tutte le ore e gli stacchi segnati fino ad ora per tutti i collaboratori.
            </p>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setShowClearConfirmModal(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs"
              >
                No, Annulla
              </button>
              <button
                onClick={handleClearAllLogs}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-black py-2.5 rounded-xl text-xs shadow-md"
              >
                Sì, Cancella Tutto
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}