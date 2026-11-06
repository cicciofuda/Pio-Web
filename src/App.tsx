import { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  updateDoc,
  deleteDoc, 
  onSnapshot, 
  collection 
} from 'firebase/firestore';

// --- INTERFACCE TYPESCRIPT ---
interface AppUser {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  approved?: boolean;
  isAdmin?: boolean;
  createdAt?: number;
}

interface MensaItem {
  id: string;
  userId?: string;
  name?: string;
  time?: string;
  timestamp?: number;
}

interface WorkLog {
  id: string;
  userId?: string;
  name?: string;
  date?: string;
  endTime?: string;
  breakStart?: string;
  breakEnd?: string;
  note?: string;
  timestamp?: number;
}

interface BroadcastMessage {
  id: string;
  text?: string;
  author?: string;
  time?: string;
  timestamp?: number;
}

// CONFIGURAZIONE FIREBASE - Legge FIREBASE_API_TOKEN impostato su Vercel
const firebaseConfig = {
  apiKey: (import.meta.env as any).FIREBASE_API_TOKEN || (import.meta.env as any).VITE_FIREBASE_API_TOKEN || "AIzaSyC8uXfyLicFBZWP4KlAvUUsnVe14CVioko",
  authDomain: "pio-web-f402c.firebaseapp.com",
  projectId: "pio-web-f402c",
  storageBucket: "pio-web-f402c.firebasestorage.app",
  messagingSenderId: "382376455522",
  appId: "1:382376455522:web:d9bc8f8a40943b4c1b903b",
  measurementId: "G-XBPMLBFX7J"
};

// Inizializzazione Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "pio-web-app";

// 5 Preset Vocali ufficiali di Pio aggiornati
const PIO_VOICE_PRESETS = [
  { id: 'normale', name: 'Pio Classico', desc: 'Naturale e bilanciato', pitch: 1.0, rate: 1.05, emoji: '🐥', customText: 'Pio!' },
  { id: 'profondo', name: 'Pio Baritono', desc: 'Bassissimo, profondo e cavernoso', pitch: 0.05, rate: 0.4, emoji: '🐻', customText: 'PIOOOOOO' },
  { id: 'addormentato', name: 'Pio Sonnolento', desc: 'Sembra uno sbadiglio profondo', pitch: 0.25, rate: 0.35, emoji: '🥱', customText: 'piiiiiioooo... uuuuh...' },
  { id: 'turbo', name: 'Pio Turbo', desc: 'Velocissimo e scattante', pitch: 1.4, rate: 2.0, emoji: '⚡', customText: 'Pio!' },
  { id: 'super', name: 'Super Pio', desc: 'Ripete la parola 5 volte di fila!', pitch: 1.2, rate: 1.3, emoji: '⭐', customText: 'Pio! Pio! Pio! Pio! Pio!' }
];

export default function App() {
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);

  const [mensaList, setMensaList] = useState<MensaItem[]>([]);
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [broadcastMessage, setBroadcastMessage] = useState<BroadcastMessage | null>(null);
  const [dismissedBroadcastId, setDismissedBroadcastId] = useState<string | null>(() => {
    return localStorage.getItem('pio_last_dismissed_broadcast') || null;
  });
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [newBroadcastText, setNewBroadcastText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authRole, setAuthRole] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);

  const [editingTurno, setEditingTurno] = useState<WorkLog | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editHasBreak, setEditHasBreak] = useState(false);
  const [editBreakStart, setEditBreakStart] = useState('');
  const [editBreakEnd, setEditBreakEnd] = useState('');
  const [editLogNote, setEditLogNote] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authUser) return;

    const usersCol = collection(db, 'artifacts', appId, 'public', 'data', 'users');
    const mensaCol = collection(db, 'artifacts', appId, 'public', 'data', 'mensa');
    const logsCol = collection(db, 'artifacts', appId, 'public', 'data', 'work_logs');
    const broadcastCol = collection(db, 'artifacts', appId, 'public', 'data', 'broadcast');

    const unsubUsers = onSnapshot(usersCol, (snapshot) => {
      if (snapshot.empty) {
        const defaultAdminRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', authUser.uid);
        setDoc(defaultAdminRef, {
          name: authUser.email || 'Admin',
          role: 'Responsabile (Admin)',
          approved: true,
          isAdmin: true,
          createdAt: Date.now()
        }).catch(console.error);
        return;
      }

      const list: AppUser[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AppUser));
      setUsers(list);

      const myProfile = list.find(u => u.id === authUser.uid);
      if (myProfile) {
        setCurrentUser(myProfile);
      } else {
        setCurrentUser({ id: authUser.uid, name: authUser.email || '', role: 'Collaboratore', approved: false, isAdmin: false });
      }
    }, (error) => console.error("Errore sync utenti:", error));

    const unsubMensa = onSnapshot(mensaCol, (snapshot) => {
      const list: MensaItem[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as MensaItem));
      setMensaList(list);
    }, (error) => console.error("Errore sync mensa:", error));

    const unsubLogs = onSnapshot(logsCol, (snapshot) => {
      const list: WorkLog[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as WorkLog));
      list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setWorkLogs(list);
    }, (error) => console.error("Errore sync straordinari:", error));

    const unsubBroadcast = onSnapshot(broadcastCol, (snapshot) => {
      const docs: BroadcastMessage[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as BroadcastMessage));
      if (docs.length > 0) {
        docs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
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
  }, [authUser]);

  const [activePreset, setActivePreset] = useState(() => {
    return localStorage.getItem('pio_active_preset') || 'normale';
  });
  
  const [isPioPressed, setIsPioPressed] = useState(false);
  const [mensaSuccessAlert, setMensaSuccessAlert] = useState(false);
  
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

  const speakPio = (presetId = activePreset) => {
    setIsPioPressed(true);
    setTimeout(() => setIsPioPressed(false), 300);

    const preset = PIO_VOICE_PRESETS.find(p => p.id === presetId) || PIO_VOICE_PRESETS[0];
    const textToSpeak = (preset as any).customText || "Pio!";

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = "it-IT";
      utterance.pitch = preset.pitch;
      utterance.rate = preset.rate;
      
      const voices = window.speechSynthesis.getVoices();
      const naturalVoice = voices.find(v => 
        v.lang.toLowerCase().startsWith('it') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Alice'))
      ) || voices.find(v => v.lang.toLowerCase().startsWith('it'));

      if (naturalVoice) utterance.voice = naturalVoice;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, authEmail, authPassword);
      showToast('✅ Accesso effettuato!');
    } catch {
      showToast('❌ Email o password non valide.');
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authName.trim()) {
      showToast('Inserisci il tuo nome e cognome.');
      return;
    }
    try {
      const creds = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      const userDoc = doc(db, 'artifacts', appId, 'public', 'data', 'users', creds.user.uid);
      await setDoc(userDoc, {
        name: authName.trim(),
        role: authRole.trim() || 'Collaboratore',
        approved: false,
        isAdmin: false,
        createdAt: Date.now()
      });
      showToast('🐣 Registrazione completata! In attesa di autorizzazione.');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Errore sconosciuto';
      showToast('❌ Errore durante la registrazione: ' + errorMessage);
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setCurrentUser(null);
  };

  const isUserInMensa = useMemo(() => {
    if (!currentUser) return false;
    return mensaList.some(item => item.userId === currentUser.id);
  }, [mensaList, currentUser]);

  const handleRegisterMensa = async () => {
    if (!authUser || !currentUser) return;
    if (!currentUser.approved) {
      showToast('⚠️ Il tuo account deve prima essere autorizzato per segnarti alla mensa!');
      return;
    }

    speakPio('turbo');
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
    } catch {
      showToast('Errore durante la registrazione a mensa.');
    }
  };

  const handleRevokeMensa = async () => {
    if (!authUser || !currentUser) return;
    try {
      const mensaDoc = doc(db, 'artifacts', appId, 'public', 'data', 'mensa', currentUser.id);
      await deleteDoc(mensaDoc);
      setMensaSuccessAlert(false);
      showToast('Hai revocato la tua presenza alla mensa.');
    } catch {
      showToast('Errore durante la revoca.');
    }
  };

  const handleAddWorkLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser || !currentUser) return;
    if (!currentUser.approved) {
      showToast('⚠️ Account in attesa di approvazione.');
      return;
    }
    if (!formEndTime) {
      showToast('Inserisci un orario di fine turno valido.');
      return;
    }

    setIsSubmitting(true);
    const logId = `log_${currentUser.id}_${Date.now()}`;
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
      showToast('✅ Straordinario registrato nel cloud!');
      setFormLogNote('');
    } catch {
      showToast('Errore durante il salvataggio.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateWorkLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTurno) return;

    if (editingTurno.userId !== currentUser?.id && !currentUser?.isAdmin) {
      showToast('❌ Non puoi modificare il turno di un altro utente.');
      return;
    }

    try {
      const logDoc = doc(db, 'artifacts', appId, 'public', 'data', 'work_logs', editingTurno.id);
      await updateDoc(logDoc, {
        date: editDate,
        endTime: editEndTime,
        breakStart: editHasBreak ? editBreakStart : '',
        breakEnd: editHasBreak ? editBreakEnd : '',
        note: editLogNote.trim()
      });
      setEditingTurno(null);
      showToast('✏️ Turno modificato con successo!');
    } catch {
      showToast('Errore durante la modifica.');
    }
  };

  const handleDeleteWorkLog = async (log: WorkLog) => {
    if (log.userId !== currentUser?.id && !currentUser?.isAdmin) {
      showToast('❌ Non puoi eliminare il turno di un altro utente.');
      return;
    }

    if (!window.confirm("Sei sicuro di voler eliminare questo turno/stacco?")) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'work_logs', log.id));
      showToast('🗑️ Turno eliminato con successo.');
    } catch {
      showToast('Errore durante l\'eliminazione.');
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser || !currentUser?.isAdmin) return;
    if (!newBroadcastText.trim()) return;

    try {
      const bcId = 'bc_' + Date.now();
      const bcDoc = doc(db, 'artifacts', appId, 'public', 'data', 'broadcast', 'active_broadcast');
      await setDoc(bcDoc, {
        id: bcId,
        text: newBroadcastText.trim(),
        author: currentUser.name,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now()
      });

      setDismissedBroadcastId(null);
      localStorage.removeItem('pio_last_dismissed_broadcast');
      setShowBroadcastModal(false);
      setNewBroadcastText('');
      showToast('📢 Notifica flash inviata a tutti!');
    } catch {
      showToast('Errore durante l\'invio dell\'avviso.');
    }
  };

  const handleClearAllLogs = async () => {
    if (!authUser || !currentUser?.isAdmin) {
      showToast('❌ Azione non consentita: solo l\'amministratore può pulire l\'intero registro.');
      setShowClearConfirmModal(false);
      return;
    }
    try {
      const deletePromises = workLogs.map(log => 
        deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'work_logs', log.id))
      );
      await Promise.all(deletePromises);
      setShowClearConfirmModal(false);
      showToast('🧹 Registro ripulito per tutti!');
    } catch {
      showToast('Errore durante la pulizia.');
    }
  };

  const handleToggleAuthorization = async (userId: string, newStatus: boolean) => {
    if (!authUser || !currentUser?.isAdmin) return;
    try {
      const userDoc = doc(db, 'artifacts', appId, 'public', 'data', 'users', userId);
      await setDoc(userDoc, { approved: newStatus }, { merge: true });
      showToast(newStatus ? '✅ Utente autorizzato!' : '❌ Autorizzazione revocata.');
    } catch {
      showToast('Errore durante la modifica permessi.');
    }
  };

  const handleDismissBroadcast = (id: string) => {
    setDismissedBroadcastId(id);
    localStorage.setItem('pio_last_dismissed_broadcast', id);
  };

  if (!authUser) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-100 via-yellow-50 to-orange-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border-4 border-amber-400 shadow-2xl text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto text-4xl shadow-md border-2 border-amber-500 mb-3 animate-bounce">
            🐥
          </div>
          <h1 className="text-2xl font-black text-amber-950">PIO WEB <span className="text-xs bg-amber-900 text-yellow-300 px-2 py-0.5 rounded-full">v2.1</span></h1>
          <p className="text-xs font-semibold text-amber-900 mb-6">Accedi o registrati per continuare</p>

          <form onSubmit={isRegisterMode ? handleRegisterSubmit : handleLoginSubmit} className="space-y-4 text-left">
            {isRegisterMode && (
              <>
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1">Nome e Cognome:</label>
                  <input
                    type="text"
                    required
                    placeholder="Es. Mario Rossi"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    className="w-full bg-slate-50 px-3 py-2 rounded-xl border-2 border-slate-200 font-bold text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1">Reparto / Ruolo:</label>
                  <input
                    type="text"
                    placeholder="Es. Ufficio, Magazzino"
                    value={authRole}
                    onChange={(e) => setAuthRole(e.target.value)}
                    className="w-full bg-slate-50 px-3 py-2 rounded-xl border-2 border-slate-200 font-bold text-sm focus:outline-none focus:border-amber-500"
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
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full bg-slate-50 px-3 py-2 rounded-xl border-2 border-slate-200 font-bold text-sm focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 uppercase mb-1">Password:</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full bg-slate-50 px-3 py-2 rounded-xl border-2 border-slate-200 font-bold text-sm focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-amber-500 hover:bg-amber-600 text-amber-950 font-black py-3 rounded-xl shadow-md border-b-2 border-amber-700 text-sm transition-all"
            >
              {isRegisterMode ? 'Crea Account 🐥' : 'Accedi a Pio Web 🔐'}
            </button>
          </form>

          <button
            onClick={() => setIsRegisterMode(!isRegisterMode)}
            className="mt-4 text-xs font-bold text-amber-900 underline hover:text-amber-950"
          >
            {isRegisterMode ? 'Hai già un account? Accedi qui' : 'Non hai un account? Registrati ora'}
          </button>
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

      <header className="bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 shadow-lg border-b-4 border-amber-500 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full bg-white flex items-center justify-center text-3xl shadow-md border-2 border-amber-600 transition-transform ${isPioPressed ? 'scale-125 rotate-12' : 'animate-bounce'}`}>
              🐥
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-amber-950 tracking-tight flex items-center gap-2">
                PIO WEB <span className="text-xs bg-amber-900 text-yellow-300 font-bold px-2 py-0.5 rounded-full">v2.1</span>
              </h1>
              <p className="text-xs font-semibold text-amber-900">Il portale per la facile gestione delle attività di Pio</p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-amber-300/80 p-2 rounded-2xl border border-amber-500/50">
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-sm font-black text-amber-950">{currentUser?.name || authUser.email}</span>
                {currentUser?.approved ? (
                  <span className="text-[10px] bg-green-600 text-white font-bold px-1.5 py-0.2 rounded-full">Autorizzato ✓</span>
                ) : (
                  <span className="text-[10px] bg-orange-600 text-white font-bold px-1.5 py-0.2 rounded-full animate-pulse">In Attesa ⏳</span>
                )}
              </div>
              <span className="text-xs text-amber-900 font-medium">{currentUser?.role || 'Collaboratore'}</span>
            </div>

            <button onClick={handleLogout} className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-black px-3 py-1.5 rounded-xl shadow transition-colors">
              Esci 🚪
            </button>

            {currentUser?.isAdmin && (
              <>
                <button onClick={() => setShowBroadcastModal(true)} className="bg-rose-500 hover:bg-rose-600 text-white text-xs font-black px-2.5 py-1.5 rounded-xl shadow transition-all animate-pulse">
                  📢 Avviso
                </button>
                <button onClick={() => setShowAdminPanel(!showAdminPanel)} className={`text-xs font-black px-2.5 py-1.5 rounded-xl shadow transition-all border ${showAdminPanel ? 'bg-purple-700 text-white border-purple-900' : 'bg-purple-100 text-purple-900 border-purple-400'}`}>
                  ⚙️ Admin
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {broadcastMessage && dismissedBroadcastId !== broadcastMessage.id && (
        <div onClick={() => handleDismissBroadcast(broadcastMessage.id)} className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer select-none">
          <div className="bg-gradient-to-br from-amber-300 via-yellow-200 to-amber-400 border-4 border-amber-600 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl text-center pointer-events-none">
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
              <p className="text-xs text-amber-900 font-medium">Un amministratore deve autorizzarti prima che tu possa segnarti alla mensa o registrare le tue ore.</p>
            </div>
          </div>
        </div>
      )}

      {showAdminPanel && currentUser?.isAdmin && (
        <section className="max-w-4xl mx-auto mt-4 px-4">
          <div className="bg-white rounded-3xl p-5 border-4 border-purple-400 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-purple-100 mb-4">
              <h2 className="text-lg font-black text-purple-900 flex items-center gap-2">⚙️ Gestione Autorizzazioni Nuovi Utenti</h2>
              <span className="text-xs bg-purple-100 text-purple-800 font-bold px-2 py-1 rounded-full">Area Riservata</span>
            </div>

            <div className="space-y-2">
              {users.map(u => (
                <div key={u.id} className="flex items-center justify-between p-3 bg-slate-50 hover:bg-purple-50/50 rounded-xl border border-slate-200">
                  <div>
                    <span className="font-bold text-slate-800">{u.name}</span>
                    <span className="text-xs text-slate-500 ml-2">({u.role})</span>
                    {u.isAdmin && <span className="ml-2 text-xs bg-amber-400 text-amber-950 px-2 py-0.5 rounded font-black">Admin</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {u.approved ? (
                      <span className="text-xs font-bold text-green-700 bg-green-100 px-2.5 py-1 rounded-full">Autorizzato ✓</span>
                    ) : (
                      <span className="text-xs font-bold text-orange-700 bg-orange-100 px-2.5 py-1 rounded-full">In attesa</span>
                    )}
                    {!u.isAdmin && (
                      <button onClick={() => handleToggleAuthorization(u.id, !u.approved)} className={`text-xs font-bold px-3 py-1 rounded-lg transition-colors ${u.approved ? 'bg-rose-100 text-rose-700 border border-rose-300' : 'bg-green-600 text-white shadow'}`}>
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

      <main className="max-w-6xl mx-auto px-4 mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-gradient-to-br from-yellow-300 via-amber-300 to-yellow-400 rounded-3xl p-6 border-4 border-amber-400 shadow-xl text-center flex flex-col items-center justify-between relative overflow-hidden">
            <div className="w-full">
              <span className="inline-block bg-amber-900 text-yellow-200 text-xs font-black uppercase px-3 py-1 rounded-full tracking-wider mb-2">Effetto Vocale</span>
              <h2 className="text-2xl md:text-3xl font-black text-amber-950">Il Bottone di Pio</h2>
              <p className="text-amber-900 text-xs font-medium mt-1">premi per chiamare pio con il tono che preferisci</p>
            </div>

            <div className="my-8">
              <button onClick={() => speakPio(activePreset)} className={`relative group inline-flex flex-col items-center justify-center w-52 h-52 md:w-60 md:h-60 rounded-full bg-gradient-to-b from-yellow-300 to-amber-500 border-8 border-amber-600 shadow-[0_16px_0_0_#b45309] active:shadow-[0_4px_0_0_#b45309] active:translate-y-3 transition-all cursor-pointer ${isPioPressed ? 'scale-95' : 'hover:scale-105'}`}>
                <span className="text-7xl md:text-8xl select-none filter drop-shadow">🐥</span>
                <span className="font-black text-2xl md:text-3xl text-amber-950 tracking-wider mt-1 drop-shadow-sm">PIOOOOOO!</span>
                <span className="text-xs font-bold text-amber-900 bg-yellow-200/90 px-3 py-0.5 rounded-full mt-1">Toccami! 🔊</span>
              </button>
            </div>

            <div className="w-full bg-white/60 backdrop-blur-md rounded-2xl p-4 border border-amber-400/60">
              <label className="block text-xs font-black text-amber-950 uppercase tracking-wider mb-2 text-left">Scegli il tipo di voce:</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PIO_VOICE_PRESETS.map((preset) => {
                  const isSelected = activePreset === preset.id;
                  return (
                    <button 
                      key={preset.id} 
                      onClick={() => { 
                        setActivePreset(preset.id); 
                        localStorage.setItem('pio_active_preset', preset.id);
                        speakPio(preset.id); 
                      }} 
                      className={`flex items-center gap-2 p-2.5 rounded-xl text-left border-2 transition-all ${isSelected ? 'bg-amber-500 text-white border-amber-700 shadow font-black' : 'bg-white hover:bg-amber-100 text-amber-950 border-amber-300 font-bold'}`}
                    >
                      <span className="text-2xl">{preset.emoji}</span>
                      <div className="flex-1 min-w-0 leading-tight">
                        <div className="text-xs truncate">{preset.name}</div>
                        <div className={`text-[10px] ${isSelected ? 'text-amber-100' : 'text-amber-700'} truncate font-normal`}>{preset.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-5 border-2 border-amber-200 shadow-md flex items-center gap-4">
            <span className="text-4xl animate-bounce">🌙</span>
            <div>
              <h3 className="font-black text-amber-950 text-sm">Pio-Timer Pause & Chiusura</h3>
              <p className="text-xs text-slate-600 mt-0.5 font-medium">
                {(() => {
                  const now = new Date();
                  const totalMins = now.getHours() * 60 + now.getMinutes();
                  const dayOfWeek = now.getDay(); // 0 = Domenica, 6 = Sabato
                  const closingTime = 18 * 60; // 18:00

                  if (totalMins >= closingTime) {
                    if (dayOfWeek === 6) {
                      return `✨ È sabato sera! Buona fine settimana da Pio, ci rivediamo direttamente lunedì! 🐥🎉`;
                    } else if (dayOfWeek === 0) {
                      return `🌙 Buona domenica sera! Domani pronti per una nuova settimana insieme! 🐥✨`;
                    } else {
                      return `🌙 Buona serata! L'ufficio ha chiuso, ci vediamo domani con i nuovi turni! ✨`;
                    }
                  } else if (totalMins < 660) {
                    return `☕ Manca poco alla Pausa Caffè delle 11:00!`;
                  } else if (totalMins <= 690) {
                    return `✨ È ora della Pausa Caffè! ☕`;
                  } else if (totalMins < 765) {
                    return `🍽️ Manca poco alla Pausa Pranzo delle 13:00!`;
                  } else if (totalMins <= 780) {
                    return `🚨 Mancano meno di 15 minuti alle 13:00! 🍽️`;
                  } else if (totalMins <= 840) {
                    return `🍲 Pausa Pranzo in corso! Buon appetito!`;
                  } else {
                    return `🌟 Turno pomeridiano in corso. Verso le 18:00 tutti a casa!`;
                  }
                })()}
              </p>
            </div>
          </div>
        </section>

        <div className="lg:col-span-7 flex flex-col gap-6">
          <section className="bg-white rounded-3xl p-6 border-4 border-amber-300 shadow-xl relative overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <span className="text-xs font-black bg-amber-100 text-amber-800 px-3 py-1 rounded-full uppercase">Pausa Pranzo</span>
                <h2 className="text-2xl font-black text-amber-950 mt-1 flex items-center gap-2">🍽️ Prenotazione Mensa</h2>
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
                <p className="text-sm font-black text-slate-800">{isUserInMensa ? '✅ Sei già registrato per il pranzo!' : '❌ Non ti sei ancora segnato'}</p>
              </div>
              <div>
                {!isUserInMensa ? (
                  <button onClick={handleRegisterMensa} className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 text-white font-black text-sm px-6 py-3 rounded-2xl shadow-lg border-b-4 border-orange-700 transition-all flex items-center gap-2">
                    <span>Segnati a Mensa!</span><span>🍽️</span>
                  </button>
                ) : (
                  <button onClick={handleRevokeMensa} className="bg-rose-50 hover:bg-rose-100 text-rose-700 border-2 border-rose-300 font-black text-xs px-4 py-2.5 rounded-xl transition-all">
                    Revoca Presenza ✖
                  </button>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Chi si è già segnato oggi:</h3>
              {mensaList.length === 0 ? (
                <div className="text-center py-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 text-xs font-bold">Nessun pulcino si è ancora registrato a mensa per oggi. Sii il primo!</div>
              ) : (
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
                  {mensaList.map(person => (
                    <div key={person.id} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-black border ${person.userId === currentUser?.id ? 'bg-amber-200 text-amber-950 border-amber-400 ring-2 ring-amber-400/50' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                      <span>🐥</span><span>{person.name}</span><span className="text-[10px] text-slate-400 font-semibold">{person.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="bg-white rounded-3xl p-6 border-4 border-yellow-300 shadow-xl flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div>
                <span className="text-xs font-black bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full uppercase">Turni & Presenze</span>
                <h2 className="text-2xl font-black text-amber-950 mt-1 flex items-center gap-2">⏰ Registro Lavoro & Stacco</h2>
              </div>

              {currentUser?.isAdmin && (
                <button onClick={() => setShowClearConfirmModal(true)} className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 text-xs font-bold px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 shadow-sm">
                  <span>🗑️</span><span>Cancella Tutto (Admin)</span>
                </button>
              )}
            </div>

            <form onSubmit={handleAddWorkLog} className="bg-yellow-50/70 p-4 rounded-2xl border-2 border-yellow-200 flex flex-col gap-3">
              <div className="text-xs font-bold text-amber-900">Registra la tua presenza per: <strong className="text-slate-900">{currentUser?.name}</strong></div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1">Giorno Straordinario:</label>
                  <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} required className="w-full bg-white px-3 py-2 rounded-xl border-2 border-amber-300 font-bold text-xs text-slate-800" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1">Fino a che ora?</label>
                  <input type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} required className="w-full bg-white px-3 py-2 rounded-xl border-2 border-amber-300 font-black text-slate-800" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1">Motivo / Nota (Opzionale)</label>
                  <input type="text" placeholder="Es. Inventario" value={formLogNote} onChange={(e) => setFormLogNote(e.target.value)} className="w-full bg-white px-3 py-2 rounded-xl border-2 border-amber-300 text-xs font-semibold text-slate-800" />
                </div>
              </div>

              <div className="bg-white p-3 rounded-xl border border-amber-200">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={hasBreak} onChange={(e) => setHasBreak(e.target.checked)} className="w-4 h-4 text-amber-600 rounded" />
                  <span className="text-xs font-black text-slate-800">Hai fatto uno stacco durante il turno?</span>
                </label>

                {hasBreak && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3">
                    <div className="flex-1">
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">Dalle ore:</span>
                      <input type="time" value={formBreakStart} onChange={(e) => setFormBreakStart(e.target.value)} className="w-full bg-amber-50 px-2 py-1.5 rounded-lg border border-amber-300 font-bold text-xs" />
                    </div>
                    <span className="text-slate-400 font-black mt-4">➜</span>
                    <div className="flex-1">
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">Alle ore:</span>
                      <input type="time" value={formBreakEnd} onChange={(e) => setFormBreakEnd(e.target.value)} className="w-full bg-amber-50 px-2 py-1.5 rounded-lg border border-amber-300 font-bold text-xs" />
                    </div>
                  </div>
                )}
              </div>

              <button type="submit" disabled={isSubmitting} className="w-full bg-amber-500 hover:bg-amber-600 text-amber-950 font-black py-2.5 rounded-xl shadow-md border-b-2 border-amber-700 transition-all text-sm disabled:opacity-50">
                {isSubmitting ? 'Salvataggio in corso...' : '💾 Salva nel Registro Condiviso'}
              </button>
            </form>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-black text-slate-600 uppercase tracking-wider">Riepilogo Straordinari</h3>
                <span className="text-xs font-bold text-amber-800">{workLogs.length} Registrati</span>
              </div>

              <div className="bg-slate-50 rounded-2xl border-2 border-slate-200 overflow-hidden shadow-inner">
                <div className="grid grid-cols-12 bg-slate-200/85 px-3 py-2.5 text-xs font-black text-slate-700 uppercase">
                  <div className="col-span-3">Collaboratore</div>
                  <div className="col-span-3 text-center">Giorno</div>
                  <div className="col-span-2 text-center">Fermo alle</div>
                  <div className="col-span-2 text-center">Stacco</div>
                  <div className="col-span-2 text-center">Azioni</div>
                </div>

                <div className="divide-y divide-slate-200 max-h-60 overflow-y-auto">
                  {workLogs.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs font-bold">Nessun orario presente nel registro.</div>
                  ) : (
                    workLogs.map(log => {
                      const breakTaken = log.breakStart && log.breakEnd;
                      const isOwner = currentUser && log.userId === currentUser.id;
                      return (
                        <div key={log.id} className="grid grid-cols-12 px-3 py-3 text-xs items-center hover:bg-white transition-colors">
                          <div className="col-span-3 font-bold text-slate-800 truncate pr-2">
                            <span>{log.name}</span>
                            {log.note && <span className="block text-[10px] text-slate-400 font-normal truncate">📝 {log.note}</span>}
                          </div>
                          <div className="col-span-3 text-center font-semibold text-slate-600 text-[11px]">📅 {log.date || 'Oggi'}</div>
                          <div className="col-span-2 text-center">
                            <span className="inline-block bg-amber-200 text-amber-950 font-black px-2 py-1 rounded-lg border border-amber-300">{log.endTime}</span>
                          </div>
                          <div className="col-span-2 text-center">
                            {breakTaken ? (
                              <span className="inline-block bg-orange-100 text-orange-900 font-bold px-1.5 py-0.5 rounded-lg border border-orange-300 text-[10px]">{log.breakStart}-{log.breakEnd}</span>
                            ) : (
                              <span className="inline-block bg-slate-200 text-slate-500 font-semibold px-1.5 py-0.5 rounded-md text-[10px]">No</span>
                            )}
                          </div>
                          <div className="col-span-2 flex items-center justify-center gap-1">
                            {(isOwner || currentUser?.isAdmin) && (
                              <>
                                <button onClick={() => { setEditingTurno(log); setEditDate(log.date || new Date().toISOString().split('T')[0]); setEditEndTime(log.endTime || '18:00'); setEditHasBreak(!!(log.breakStart && log.breakEnd)); setEditBreakStart(log.breakStart || '13:00'); setEditBreakEnd(log.breakEnd || '14:00'); setEditLogNote(log.note || ''); }} className="p-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded font-bold text-xs" title="Modifica">✏️</button>
                                <button onClick={() => handleDeleteWorkLog(log)} className="p-1 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded font-bold text-xs" title="Elimina">🗑️</button>
                              </>
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

      {editingTurno && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border-4 border-amber-400 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-black text-xl text-amber-950 flex items-center gap-2">✏️ Modifica Turno</h3>
              <button onClick={() => setEditingTurno(null)} className="text-slate-400 font-black text-lg">✕</button>
            </div>

            <form onSubmit={handleUpdateWorkLog} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-700 uppercase mb-1">Giorno:</label>
                <input type="date" required value={editDate} onChange={(e) => setEditDate(e.target.value)} className="w-full bg-slate-50 px-3 py-2.5 rounded-xl border-2 border-slate-200 font-bold text-sm" />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-700 uppercase mb-1">Fine Turno:</label>
                <input type="time" required value={editEndTime} onChange={(e) => setEditEndTime(e.target.value)} className="w-full bg-slate-50 px-3 py-2.5 rounded-xl border-2 border-slate-200 font-bold text-sm" />
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input type="checkbox" checked={editHasBreak} onChange={(e) => setEditHasBreak(e.target.checked)} className="w-4 h-4 text-amber-600 rounded" />
                  <span className="text-xs font-black text-slate-800">Includi stacco / pausa</span>
                </label>
                {editHasBreak && (
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                    <input type="time" value={editBreakStart} onChange={(e) => setEditBreakStart(e.target.value)} className="w-full bg-white px-2 py-1 rounded border border-slate-300 text-xs font-bold" />
                    <span>➜</span>
                    <input type="time" value={editBreakEnd} onChange={(e) => setEditBreakEnd(e.target.value)} className="w-full bg-white px-2 py-1 rounded border border-slate-300 text-xs font-bold" />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-black text-slate-700 uppercase mb-1">Nota:</label>
                <input type="text" value={editLogNote} onChange={(e) => setEditLogNote(e.target.value)} className="w-full bg-slate-50 px-3 py-2.5 rounded-xl border-2 border-slate-200 font-semibold text-sm" />
              </div>
              <div className="pt-2 flex gap-2">
                <button type="button" onClick={() => setEditingTurno(null)} className="flex-1 bg-slate-100 text-slate-700 font-bold py-2 rounded-xl text-xs">Annulla</button>
                <button type="submit" className="flex-1 bg-amber-500 hover:bg-amber-600 text-amber-950 font-black py-2 rounded-xl text-xs shadow">Salva 💾</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBroadcastModal && currentUser?.isAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border-4 border-rose-400 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-black text-xl text-rose-950 flex items-center gap-2">📢 Invia Avviso Flash</h3>
              <button onClick={() => setShowBroadcastModal(false)} className="text-slate-400 font-black text-lg">✕</button>
            </div>
            <form onSubmit={handleSendBroadcast} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-700 uppercase mb-1">Testo del messaggio:</label>
                <textarea required rows={3} placeholder="Es. Oggi la mensa chiude alle 13:00!" value={newBroadcastText} onChange={(e) => setNewBroadcastText(e.target.value)} className="w-full bg-slate-50 p-3 rounded-xl border-2 border-slate-200 font-semibold text-sm" />
              </div>
              <div className="pt-2 flex gap-2">
                <button type="button" onClick={() => setShowBroadcastModal(false)} className="flex-1 bg-slate-100 text-slate-700 font-bold py-2 rounded-xl text-xs">Annulla</button>
                <button type="submit" className="flex-1 bg-rose-600 text-white font-black py-2 rounded-xl text-xs shadow-md">Invia 📢</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showClearConfirmModal && currentUser?.isAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border-4 border-rose-400 shadow-2xl text-center">
            <span className="text-4xl block mb-2">🗑️</span>
            <h3 className="font-black text-lg text-slate-900">Cancellare tutto il registro?</h3>
            <p className="text-xs text-slate-600 mt-2">Questa azione eliminerà permanentemente tutte le ore segnate per tutti.</p>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setShowClearConfirmModal(false)} className="flex-1 bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl text-xs">Annulla</button>
              <button onClick={handleClearAllLogs} className="flex-1 bg-rose-600 text-white font-black py-2.5 rounded-xl text-xs shadow-md">Sì, Cancella</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
