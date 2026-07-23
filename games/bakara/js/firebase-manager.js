/* ============================================
   Firebase Integration
   - Auth (Google Sign-In, Anonymous)
   - Firestore (Preset sync per user)
   ============================================ */

const firebaseConfig = {
    apiKey: "AIzaSyCc4Gjh0N3wzCxqAEEQkrsX8AlI7UNBGR0",
    authDomain: "webgames-66ccf.firebaseapp.com",
    databaseURL: "https://webgames-66ccf-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "webgames-66ccf",
    storageBucket: "webgames-66ccf.firebasestorage.app",
    messagingSenderId: "539839465670",
    appId: "1:539839465670:web:b6bdf12a8d14d067e2efc7",
    measurementId: "G-94XVFXT33H"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

class FirebaseManager {
    constructor(app) {
        this.app = app; // BaccaratApp reference
        this.user = null;
        this.unsubscribe = null;
        this.setupAuthUI();
        this.setupAuthListener();
    }

    // ============================================
    // Auth UI
    // ============================================

    setupAuthUI() {
        // Auth bar at top of page
        const authBar = document.getElementById('auth-bar');
        if (!authBar) return;

        document.getElementById('btn-google-login')?.addEventListener('click', () => this.loginWithGoogle());
        document.getElementById('btn-logout')?.addEventListener('click', () => this.logout());
    }

    setupAuthListener() {
        auth.onAuthStateChanged(async (user) => {
            this.user = user;
            this.updateAuthUI();

            if (user) {
                // Load presets from Firestore
                await this.loadPresetsFromCloud();
            }
        });
    }

    updateAuthUI() {
        const loginSection = document.getElementById('auth-login');
        const userSection = document.getElementById('auth-user');
        const userName = document.getElementById('auth-user-name');
        const userAvatar = document.getElementById('auth-user-avatar');
        const syncStatus = document.getElementById('sync-status');

        if (!loginSection || !userSection) return;

        if (this.user) {
            loginSection.classList.add('hidden');
            userSection.classList.remove('hidden');
            userName.textContent = this.user.displayName || this.user.email || '게스트';
            if (this.user.photoURL) {
                userAvatar.src = this.user.photoURL;
                userAvatar.classList.remove('hidden');
            } else {
                userAvatar.classList.add('hidden');
            }
            if (syncStatus) syncStatus.textContent = '☁️ 동기화';
        } else {
            loginSection.classList.remove('hidden');
            userSection.classList.add('hidden');
            if (syncStatus) syncStatus.textContent = '💾 로컬';
        }
    }

    // ============================================
    // Auth Methods
    // ============================================

    async loginWithGoogle() {
        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            await auth.signInWithPopup(provider);
        } catch (error) {
            console.error('Google login error:', error);
            if (error.code !== 'auth/popup-closed-by-user') {
                alert('로그인 실패: ' + error.message);
            }
        }
    }

    async logout() {
        try {
            // Save current balance to cloud before signing out
            await this.saveBalanceToCloud();
            await auth.signOut();
            // Reset to local presets
            this.app.presets = this.app.loadPresets();
            this.app.activeSetKey = '__default__';
            this.app.renderPresets();
            this.app.renderSetSelector();
        } catch (error) {
            console.error('Logout error:', error);
        }
    }

    // ============================================
    // Firestore Preset Sync
    // ============================================

    getUserDocRef() {
        if (!this.user) return null;
        return db.collection('users').doc(this.user.uid);
    }

    async loadPresetsFromCloud() {
        const docRef = this.getUserDocRef();
        if (!docRef) return;

        try {
            const doc = await docRef.get();
            if (doc.exists) {
                const data = doc.data();

                // Load active presets
                if (data.presets && Array.isArray(data.presets)) {
                    this.app.presets = data.presets;
                    localStorage.setItem('baccarat-presets', JSON.stringify(data.presets));
                }

                // Load preset sets
                if (data.presetSets) {
                    localStorage.setItem('baccarat-preset-sets', JSON.stringify(data.presetSets));
                }

                // Load active set key
                if (data.activeSetKey) {
                    this.app.activeSetKey = data.activeSetKey;
                }

                // Load saved balance
                if (typeof data.balance === 'number' && data.balance > 0) {
                    this.app.balance = data.balance;
                    this.app.initialBalance = data.initialBalance || data.balance;
                    this.app.ui.updateBalance(this.app.balance);
                    localStorage.setItem('baccarat-balance', data.balance.toString());
                    localStorage.setItem('baccarat-initial-balance', (data.initialBalance || data.balance).toString());
                    console.log(`💰 클라우드에서 잔액 복원: ₩${data.balance.toLocaleString()}`);
                }

                this.app.renderPresets();
                this.app.renderSetSelector();

                // Re-select default chip
                const defaultIndex = this.app.presets.indexOf(this.app.ui.selectedChipValue);
                if (defaultIndex >= 0) {
                    document.querySelectorAll('.preset-slot')[defaultIndex]?.classList.add('selected');
                }

                console.log('☁️ 클라우드에서 프리셋 로드 완료');
            } else {
                // First time user → save current local presets to cloud
                await this.savePresetsToCloud();
                console.log('☁️ 첫 로그인: 로컬 프리셋을 클라우드에 저장');
            }
        } catch (error) {
            console.error('Firestore load error:', error);
        }
    }

    async savePresetsToCloud() {
        const docRef = this.getUserDocRef();
        if (!docRef) return;

        try {
            const presetSets = JSON.parse(localStorage.getItem('baccarat-preset-sets') || '{}');

            await docRef.set({
                presets: this.app.presets,
                presetSets: presetSets,
                activeSetKey: this.app.activeSetKey || '__default__',
                balance: this.app.balance,
                initialBalance: this.app.initialBalance,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                displayName: this.user.displayName || '',
                email: this.user.email || ''
            }, { merge: true });

            // Flash sync indicator
            const syncStatus = document.getElementById('sync-status');
            if (syncStatus) {
                syncStatus.textContent = '✅ 저장됨';
                setTimeout(() => { syncStatus.textContent = '☁️ 동기화'; }, 1500);
            }
        } catch (error) {
            console.error('Firestore save error:', error);
        }
    }

    // Save only balance to cloud (lightweight save)
    async saveBalanceToCloud() {
        const docRef = this.getUserDocRef();
        if (!docRef) return;

        try {
            await docRef.set({
                balance: this.app.balance,
                initialBalance: this.app.initialBalance,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            console.log(`💾 잔액 클라우드 저장: ₩${this.app.balance.toLocaleString()}`);
        } catch (error) {
            console.error('Balance save error:', error);
        }
    }
}
