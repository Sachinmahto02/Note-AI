import { useState, useEffect } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./lib/firebase";
import AuthPage from "./pages/AuthPage";
import Dashboard from "./pages/Dashboard";
import IntroScreen from "./components/IntroScreen";
import { AnimatePresence, motion } from "motion/react";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (showIntro) {
    return <IntroScreen onFinish={() => setShowIntro(false)} />;
  }

  return (
    <div className="min-h-screen selection:bg-brand/20 relative overflow-hidden bg-[#F3F4FF]">
     {/* Global Background */}
<div className="absolute inset-0 z-0 flex flex-col pointer-events-none overflow-hidden select-none">

  {/* TOP IMAGE */}
  <div className="w-full shrink-0">
    <img
      src="image1.png"
      alt="Top background"
      className="w-full object-cover"
    />
  </div>

  {/* BOTTOM IMAGE */}
  <div className="flex-1 w-full">
    <img
      src="image10.webp"
      alt="Bottom background"
      className="w-full h-full object-cover"
    />
  </div>

</div>

      <div className="relative z-10 min-h-screen">
        <AnimatePresence mode="wait">
        {loading ? (
          <div key="loading" className="min-h-screen flex items-center justify-center">
            <motion.div 
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="w-12 h-12 bg-brand rounded-2xl"
            />
          </div>
        ) : !user ? (
          <motion.div
            key="auth"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <AuthPage />
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Dashboard user={user} />
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}

