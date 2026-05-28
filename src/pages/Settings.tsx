import { useState, useEffect, useRef } from "react";
import { auth, db } from "../lib/firebase";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { motion } from "motion/react";
import { User, Mail, Camera, Check, ChevronLeft, Shield, Bell, Database, LogOut, Calendar, Tag, Trash2, X, Lock, Eye, EyeOff, BookOpen, Sparkles } from "lucide-react";

export default function SettingsPage({ onBack, noteCount, onShowTrash, onShowJournalAnalytics }: { onBack: () => void, noteCount: number, onShowTrash: () => void, onShowJournalAnalytics: () => void }) {
  const user = auth.currentUser;
  const [profileData, setProfileData] = useState<any>(null);
  const [name, setName] = useState(user?.displayName || "");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [email] = useState(user?.email || "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  
  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [passLoading, setPassLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    const docRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setProfileData(data);
        // We only initialize local states once or when they are empty
        setName(prev => prev || data.name || user.displayName || "");
        setPhone(prev => prev || data.phone || "");
        setDob(prev => prev || data.dob || "");
      }
    });
    return () => unsubscribe();
  }, [user]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setMessage("");
    try {
      await updateProfile(user, { displayName: name });
      const userDocRef = doc(db, "users", user.uid);
      await setDoc(userDocRef, { 
        name,
        phone,
        dob,
        email: user.email,
        updatedAt: serverTimestamp() 
      }, { merge: true });
      setMessage("Profile details saved successfully!");
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 500 * 1024) {
      alert("Photo must be under 500KB");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      try {
        const userDocRef = doc(db, 'users', user.uid);
        await setDoc(userDocRef, {
          customAvatar: base64,
          updatedAt: serverTimestamp()
        }, { merge: true });
        setMessage("Profile photo updated!");
      } catch (err) {
        console.error("Error updating photo:", err);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = async () => {
    if (!user) return;
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, {
        customAvatar: null,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setMessage("Profile photo removed.");
    } catch (err) {
      console.error("Error removing photo:", err);
    }
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
    } catch (error: any) {
      console.error("Logout error:", error);
      setMessage("Failed to log out: " + error.message);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) return;
    if (newPassword !== confirmPassword) {
      setMessage("Passwords do not match!");
      return;
    }
    if (newPassword.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }
    if (!currentPassword) {
      setMessage("Please enter your current password.");
      return;
    }

    setPassLoading(true);
    setMessage("");

    try {
      // Re-authenticate user first
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      try {
        await reauthenticateWithCredential(user, credential);
      } catch (authErr: any) {
        if (authErr.code === 'auth/wrong-password' || authErr.code === 'auth/invalid-credential') {
          throw new Error("Invalid current password. Please try again.");
        }
        throw authErr;
      }

      // Update password
      await updatePassword(user, newPassword);
      setMessage("Password updated successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setPassLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-red-500 hover:text-brand mb-10 transition-colors font-bold uppercase tracking-widest text-[10px]"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to Dashboard
      </button>

      <div className="flex flex-col lg:flex-row gap-12">
        <div className="flex-1 space-y-8">
          <header className="mb-4">
            <h2 className="font-serif text-5xl text-gray-900 mb-3 tracking-tight">Account & Profile</h2>
            <p className="text-gray-400 font-medium font-sans">Manage your identity and preferences</p>
          </header>

          <section className="bg-white rounded-[40px] p-8 shadow-sm border border-gray-50">
            <div className="flex items-center gap-6 mb-10">
              <div className="relative group/avatar">
                <div 
                  className="w-24 h-24 rounded-full bg-gray-50 flex items-center justify-center overflow-hidden border-4 border-white shadow-xl cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {profileData?.customAvatar ? (
                    <img src={profileData.customAvatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : user?.photoURL ? (
                    <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-10 h-10 text-gray-300" />
                  )}
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/avatar:opacity-100 flex items-center justify-center transition-opacity">
                    <Camera className="text-white w-6 h-6" />
                  </div>
                </div>
                
                {profileData?.customAvatar && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleRemovePhoto(); }}
                    className="absolute -top-1 -right-1 p-1.5 bg-white text-red-500 rounded-full shadow-md border border-red-50 hover:bg-red-50 transition-all z-10"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  onChange={handlePhotoUpload} 
                />
              </div>
              <div>
                <h3 className="font-bold text-2xl text-gray-900 leading-tight">{name || user?.displayName || "Scholar Identity"}</h3>
                <p className="text-gray-400 text-sm font-medium flex items-center gap-2 mt-1 font-sans">
                  <Shield className="w-3 h-3 text-brand" />
                  Personalized Account
                </p>
              </div>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 font-sans text-[10px]">Display Name</label>
                  <div className="group">
                    <input 
                      type="text" 
                      className="input-field px-6 focus:ring-4 focus:ring-brand/5 border-gray-100" 
                      placeholder="e.g. John Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 font-sans text-[10px]">Phone Number</label>
                  <div className="group">
                    <input 
                      type="tel"
                      className="input-field px-6 focus:ring-4 focus:ring-brand/5 border-gray-100" 
                      placeholder="e.g. +1234567890"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 font-sans text-[10px]">Date of Birth</label>
                  <div className="group">
                    <input 
                      type="text" 
                      className="input-field px-6 focus:ring-4 focus:ring-brand/5 border-gray-100 bg-white" 
                      placeholder="DD-MM-YYYY"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1 font-sans text-[10px]">Primary Email</label>
                  <div>
                    <input 
                      type="email" 
                      className="input-field px-6 bg-gray-50 cursor-not-allowed opacity-60 border-gray-100" 
                      value={email}
                      disabled
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 flex flex-col md:flex-row gap-4">
                <button 
                  type="submit" 
                  disabled={loading}
                  className="px-10 py-4 bg-brand text-white rounded-[24px] font-bold shadow-lg shadow-brand/20 hover:scale-[1.02] active:scale-95 transition-all font-sans"
                >
                  {loading ? "Saving..." : "Save Profile Details"}
                </button>
              </div>
            </form>
          </section>

          <section className="bg-white rounded-[40px] p-8 shadow-sm border border-gray-50 mt-8">
            <header className="mb-8">
              <h3 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                <Lock className="w-5 h-5 text-gray-400" />
                Security & Access
              </h3>
            </header>

            <form onSubmit={handleUpdatePassword} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 font-sans">Current Password</label>
                <div className="relative group/pass">
                  <input 
                    type={showCurrentPass ? "text" : "password"}
                    className="input-field px-6 pr-12 focus:ring-4 focus:ring-brand/5 border-gray-100 bg-white" 
                    placeholder="Enter your current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                  <button 
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-400"
                  >
                    {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 font-sans">New Password</label>
                  <div className="relative group/pass">
                    <input 
                      type={showNewPass ? "text" : "password"}
                      className="input-field px-6 pr-12 focus:ring-4 focus:ring-brand/5 border-gray-100 bg-white" 
                      placeholder="Min 6 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <button 
                      type="button"
                      onClick={() => setShowNewPass(!showNewPass)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-400"
                    >
                      {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 font-sans">Confirm New Password</label>
                  <div className="group">
                    <input 
                      type={showNewPass ? "text" : "password"}
                      className="input-field px-6 focus:ring-4 focus:ring-brand/5 border-gray-100 bg-white" 
                      placeholder="Repeat new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button 
                  type="submit" 
                  disabled={passLoading || !newPassword}
                  className="px-8 py-3 bg-gray-900 text-white rounded-2xl font-bold shadow-lg hover:scale-[1.02] active:scale-95 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {passLoading ? "Updating..." : "Secure My Password"}
                </button>
              </div>
            </form>
          </section>

          {message && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-5 bg-green-50 text-green-600 text-sm font-bold rounded-3xl border border-green-100 flex items-center gap-3 font-sans"
            >
              <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white">
                <Check className="w-4 h-4" />
              </div>
              {message}
            </motion.div>
          )}
        </div>

        <aside className="w-full lg:w-80 space-y-6">
          <div className="bg-gray-950 rounded-[40px] p-8 text-white shadow-2xl">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-6 font-sans tracking-tight">System Status</h4>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Database className="w-5 h-5 text-brand" />
                  <span className="text-sm font-medium font-sans">Active Subject Notes</span>
                </div>
                <span className="text-3xl font-serif">{noteCount}</span>
              </div>
              <div className="h-2 bg-gray-900 rounded-full overflow-hidden">
                <div className="h-full bg-brand" style={{ width: `${Math.min((noteCount/1000)*100, 100)}%` }} />
              </div>
              
              <button 
                onClick={onShowTrash}
                className="w-full py-4 px-6 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between hover:bg-white/10 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <Trash2 className="w-4 h-4 text-gray-400 group-hover:text-red-400 transition-colors" />
                  <span className="text-xs font-bold uppercase tracking-widest">History</span>
                </div>
                <div className="w-6 h-6 bg-white/5 rounded-lg flex items-center justify-center">
                  <div className="w-1 h-1 bg-gray-500 rounded-full" />
                </div>
              </button>

              <button 
                onClick={onShowJournalAnalytics}
                className="w-full py-4 px-6 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between hover:bg-emerald-500/10 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <BookOpen className="w-4 h-4 text-gray-400 group-hover:text-emerald-400 transition-colors" />
                  <span className="text-xs font-bold uppercase tracking-widest">Journal Analytics</span>
                </div>
                <div className="w-6 h-6 bg-white/5 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-3 h-3 text-emerald-500 opacity-40 group-hover:opacity-100 transition-opacity" />
                </div>
              </button>

              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest font-sans">Cloud Archive Active</p>
            </div>
          </div>

          <div className="flex justify-center mt-6">
            <button 
              type="button"
              onClick={handleLogout}
              className="flex items-center justify-center gap-2 px-10 py-3.5 bg-red-50 text-red-500 rounded-full font-bold hover:bg-red-100 active:scale-95 transition-all font-sans border border-red-100"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
