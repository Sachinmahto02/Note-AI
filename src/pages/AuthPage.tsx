import { useState } from "react";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider,
  sendPasswordResetEmail
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { motion, AnimatePresence } from "motion/react";
import { Eye, EyeOff } from "lucide-react";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [identifier, setIdentifier] = useState(""); // Email or Phone
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const isEmail = (val: string) => val.includes('@');
  const isPhone = (val: string) => /^\+?[0-9]{10,15}$/.test(val.replace(/[\s-]/g, ''));

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      if (isEmail(identifier)) {
        provider.setCustomParameters({
          login_hint: identifier,
          prompt: 'select_account'
        });
      }
      
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          name: user.displayName,
          email: user.email,
          avatarUrl: user.photoURL,
          provider: 'google',
          createdAt: serverTimestamp()
        });
      }
      setSuccess("Logged in successfully!");
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        setError("Sign-in cancelled.");
      } else if (err.code === 'auth/operation-not-allowed') {
        setError("Google login is not enabled in Firebase Console.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    
    if (!identifier) {
      setError("Please enter your email or phone number");
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password should be at least 6 characters");
      return;
    }

    setLoading(true);
    
    try {
      let finalEmail = identifier.trim();
      
      if (isPhone(identifier)) {
        finalEmail = `${identifier.replace(/\D/g, '')}@phone.internal`;
      } else if (!isEmail(identifier)) {
        setError("Please enter a valid email or phone number.");
        setLoading(false);
        return;
      }

      if (isLogin) {
        await signInWithEmailAndPassword(auth, finalEmail, password);
        setSuccess("Welcome back!");
      } else {
        const result = await createUserWithEmailAndPassword(auth, finalEmail, password);
        const user = result.user;
        await setDoc(doc(db, "users", user.uid), {
          name: name.trim() || (isEmail(identifier) ? identifier.split("@")[0] : identifier),
          email: isEmail(identifier) ? identifier : null,
          phone: isPhone(identifier) ? identifier : null,
          provider: 'password',
          createdAt: serverTimestamp()
        });
        setSuccess("Account created successfully!");
      }
    } catch (err: any) {
      console.error("Auth Error:", err.code, err.message);
      if (err.code === 'auth/operation-not-allowed') {
        setError("Sign-in method is not enabled. Please enable it in Firebase Console -> Authentication -> Sign-in Method.");
      } else if (err.code === 'auth/user-not-found') {
        setError("Account not found. Please create an account first.");
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError("Incorrect email/phone or password. Please try again.");
      } else if (err.code === 'auth/email-already-in-use') {
        setError("This account already exists. Please login instead.");
      } else if (err.code === 'auth/too-many-requests') {
        setError("Too many failed attempts. Please try again later.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!identifier || !isEmail(identifier)) {
      setError("Please enter your email address to reset password.");
      return;
    }
    
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, identifier);
      setSuccess("Check your email for password reset link!");
      setError("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Sparkle background animation components
  const sparkles = Array.from({ length: 20 }).map((_, i) => ({
    id: i,
    size: Math.random() * 4 + 2,
    x: Math.random() * 100,
    y: Math.random() * 100,
    delay: Math.random() * 5,
    duration: Math.random() * 10 + 10
  }));

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden bg-transparent">

      {/* Animated Background Sparkles */}
      <div className="absolute inset-0 pointer-events-none">
        {sparkles.map((s) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0.1, y: s.y + "%" }}
            animate={{ 
              opacity: [0.1, 0.4, 0.1],
              y: [s.y + "%", (s.y - 10) + "%", s.y + "%"]
            }}
            transition={{
              duration: s.duration,
              repeat: Infinity,
              delay: s.delay,
              ease: "easeInOut"
            }}
            style={{
              position: "absolute",
              left: s.x + "%",
              width: s.size + "px",
              height: s.size + "px",
              backgroundColor: "#ffffff",
              borderRadius: "50%",
              filter: "blur(0.5px)"
            }}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white/10 backdrop-blur-2xl rounded-[40px] shadow-2xl p-6 md:p-8 max-w-[400px] w-full relative border border-white/20"
      >
        <div className="absolute -top-12 left-1/2 -translate-x-1/2">
          <div className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-white/20 backdrop-blur-md border-8 border-white/30 overflow-hidden shadow-lg flex items-center justify-center p-2">
            <img 
              src="https://api.dicebear.com/7.x/bottts/svg?seed=journal_buddy&backgroundColor=transparent" 
              alt="Avatar"
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>

        <div className="text-center mt-12 mb-5">
          <h1 className="text-2xl md:text-[28px] font-serif font-bold text-white tracking-tight leading-tight">
            Meet Your Future Self
          </h1>
          <p className="text-white/60 font-medium mt-1 text-sm md:text-base">
            Login or create a new account
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <AnimatePresence mode="popLayout">
            {!isLogin && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2 overflow-hidden"
              >
                <label className="text-sm font-bold text-white/80 ml-1">Full Name</label>
                <input 
                  type="text" 
                  placeholder="Enter your name"
                  className="w-full px-5 py-3 rounded-xl border border-white/10 bg-white/5 focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30 transition-all placeholder:text-white/20 font-medium text-white"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={!isLogin}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-2">
            <label className="text-sm font-bold text-white/80 ml-1">Email or Phone</label>
            <input 
              type="text" 
              placeholder="Enter email or phone number"
              className="w-full px-5 py-3 rounded-xl border border-white/10 bg-white/5 focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30 transition-all placeholder:text-white/20 font-medium text-white"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-white/80 ml-1">Password</label>
            <div className="relative">
              <input 
                type={isPasswordVisible ? "text" : "password"} 
                placeholder="Enter password"
                className="w-full px-5 py-3 rounded-xl border border-white/10 bg-white/5 focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30 transition-all placeholder:text-white/20 font-medium text-white pr-12"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button 
                type="button"
                onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors"
                tabIndex={-1}
              >
                {isPasswordVisible ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <AnimatePresence mode="popLayout">
            {!isLogin && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2 overflow-hidden"
              >
                <label className="text-sm font-bold text-white/80 ml-1">Confirm Password</label>
                <input 
                  type="password" 
                  placeholder="Confirm your password"
                  className="w-full px-5 py-3 rounded-xl border border-white/10 bg-white/5 focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30 transition-all placeholder:text-white/20 font-medium text-white"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required={!isLogin}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {isLogin && (
            <div className="flex justify-end -mt-2">
              <button 
                type="button" 
                onClick={handleForgotPassword}
                className="text-white font-bold text-sm hover:underline tracking-tight"
              >
                Forgot password?
              </button>
            </div>
          )}

          <div className="pt-1">
            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-white text-gray-900 font-bold text-base hover:bg-white/90 active:scale-[0.98] transition-all shadow-xl disabled:opacity-50 uppercase tracking-widest"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-gray-900/30 border-t-gray-900 rounded-full animate-spin" />
                  <span>Processing...</span>
                </div>
              ) : isLogin ? "LOGIN" : "CREATE ACCOUNT"}
            </button>
          </div>
        </form>

        <div className="mt-5">
          <button 
            type="button" 
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-3.5 rounded-xl border border-white/10 bg-white/5 text-white font-bold flex items-center justify-center gap-3 hover:bg-white/10 active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm h-12"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="G" />
            <span className="font-bold text-white">Sign in with Google</span>
          </button>
        </div>

        <div className="mt-4 text-center font-bold text-xs md:text-sm text-white">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button 
            onClick={() => {
              setIsLogin(!isLogin);
              setError("");
              setSuccess("");
            }}
            className="text-white font-bold underline"
            disabled={loading}
          >
            {isLogin ? "Create new account" : "Back to login"}
          </button>
        </div>

        <AnimatePresence>
          {(error || success) && (
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`mt-6 p-4 rounded-2xl text-center text-[10px] font-black uppercase tracking-widest border ${error ? 'bg-red-500/20 text-red-200 border-red-500/30' : 'bg-green-500/20 text-green-200 border-green-500/30'}`}
            >
              {error || success}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
