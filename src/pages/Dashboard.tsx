import { jsPDF } from "jspdf";
import { motion, AnimatePresence } from "motion/react";
import {
  LogOut,
  Settings,
  Plus,
  MessageSquare,
  Sparkles,
  Trash2,
  Edit3,
  X,
  ChevronRight,
  Send,
  Download,
  Paperclip,
  FileText,
  ImageIcon,
  Loader2,
  Check,
  RotateCcw,
  Undo2,
  Redo2,
  Highlighter,
  Save,
  ListTodo,
  Calendar,
  BookOpen,
  Camera,
  User as UserIcon,
  Star,
  BarChart as BarChartIcon,
  LineChart as LineChartIcon,
  History,
  TrendingUp,
  Heart,
  Briefcase,
  Layers,
  CheckCircle2,
  Smile,
  Eye,
} from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  auth,
  db,
  storage,
  handleFirestoreError,
  OperationType,
} from "../lib/firebase";
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
  orderBy,
  setDoc,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { formatDate } from "../lib/utils";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import {
  summarizeNote,
  summarizeNoteStream,
  generateNoteFromPrompt,
} from "../lib/gemini";
import { Search } from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";

// --- Components ---

export const Navbar = ({
  user,
  onSettings,
  onSearchQuery,
}: {
  user: any;
  onSettings: () => void;
  onSearchQuery: (val: string) => void;
}) => (
  <nav className="flex items-center justify-between px-8 py-4 bg-white/80 backdrop-blur-md sticky top-0 z-30 border-b border-white/10 shadow-sm">
    <div
      className="flex items-center gap-2 cursor-pointer"
      onClick={() => (window.location.href = "/")}
    >
      <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center">
        <Sparkles className="text-white w-5 h-5 fill-white" />
      </div>
      <h1 className="font-serif text-2xl text-gray-900">My Journal</h1>
    </div>

    <div className="flex-1 max-w-md mx-8 relative group hidden md:block">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-brand transition-colors" />
      <input
        type="text"
        placeholder="Search headings or notes..."
        onChange={(e) => onSearchQuery(e.target.value)}
        className="w-full bg-gray-50 border-none rounded-2xl py-2.5 pl-11 pr-4 focus:ring-2 focus:ring-brand/20 transition-all outline-none text-sm font-semibold placeholder:text-gray-500"
      />
    </div>

    <div className="flex items-center gap-4">
      <div
        className="flex items-center gap-3 hidden sm:flex cursor-pointer hover:opacity-80 transition-opacity"
        onClick={onSettings}
      >
        <div className="text-right">
          <p className="text-sm font-bold text-gray-900 leading-none">
            Hi, {user?.name || user?.displayName || "Guest"} 👋
          </p>
        </div>

        <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-sm bg-gray-50 flex items-center justify-center">
          {user?.customAvatar ? (
            <img
              src={user.customAvatar}
              alt="Profile"
              className="w-full h-full object-cover"
            />
          ) : user?.photoURL ? (
            <img
              src={user.photoURL}
              alt="Profile"
              className="w-full h-full object-cover"
            />
          ) : (
            <UserIcon className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onSettings}
          className="p-3 hover:bg-gray-100 rounded-2xl transition-colors bg-white/50 border border-gray-100 shadow-sm"
          title="Account Settings"
        >
          <Settings className="w-5 h-5 text-gray-500" />
        </button>
      </div>
    </div>
  </nav>
);

// --- Helpers ---

const handleViewFile = (url: string) => {
  if (url.startsWith("data:")) {
    try {
      const parts = url.split(";base64,");
      if (parts.length > 1) {
        const contentType = parts[0].split(":")[1];
        const byteCharacters = atob(parts[1]);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: contentType });
        const blobUrl = URL.createObjectURL(blob);

        window.open(blobUrl, "_blank");
        return;
      }
    } catch (e) {
      console.error("Error opening file:", e);
    }
  }
  window.open(url, "_blank");
};

const linkifyText = (text: string): string => {
  if (!text) return "";

  // Matches URLs starting with http://, https://, or www.
  const urlRegex = /(https?:\/\/[^\s<]+[^.,\s<])|(www\.[^\s<]+[^.,\s<])/gi;

  return text.replace(urlRegex, (match, p1, p2, offset, fullText) => {
    // Determine target href (ensure http/https protocol is attached)
    const href = p1 ? match : `https://${match}`;

    // Check preceding characters to skip links already in markdown/HTML tags
    const beforeIdx = offset;
    const charBefore = beforeIdx > 0 ? fullText[beforeIdx - 1] : "";

    // 1. Skip if inside markdown link syntax url part, i.e., [text](url)
    if (charBefore === "(") {
      const precedingText = fullText.substring(0, beforeIdx - 1);
      if (precedingText.endsWith("]")) {
        return match;
      }
    }

    // 2. Skip if inside markdown autolink syntax, i.e., <url>
    if (charBefore === "<") {
      const matchEnd = offset + match.length;
      if (matchEnd < fullText.length && fullText[matchEnd] === ">") {
        return match;
      }
    }

    // 3. Skip if target is inside HTML context/attribute (e.g., href="...", src="...")
    const chunkBefore = fullText.substring(
      Math.max(0, beforeIdx - 15),
      beforeIdx,
    );
    if (
      /href\s*=\s*['"]$/i.test(chunkBefore) ||
      /src\s*=\s*['"]$/i.test(chunkBefore)
    ) {
      return match;
    }

    // 4. Skip if inside markdown image syntax: ![alt](url)
    if (
      charBefore === "(" &&
      fullText
        .substring(0, beforeIdx - 1)
        .trim()
        .endsWith("]")
    ) {
      return match;
    }

    // Replace plain pasted URL with markdown syntax
    return `[${match}](${href})`;
  });
};

const MarkdownComponents = {
  a: ({ node, ...props }: any) => (
    <a
      {...props}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[#5965f3] hover:underline font-bold transition-all decoration-[#7B85F9]"
      onClick={(e) => e.stopPropagation()}
    />
  ),
};

const compressImage = (
  dataUrl: string,
  maxWidth = 1000,
  quality = 0.6,
): Promise<string> => {
  return new Promise((resolve) => {
    if (!dataUrl.startsWith("data:image/")) {
      resolve(dataUrl);
      return;
    }
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0, width, height);

      const compressed = canvas.toDataURL("image/jpeg", quality);
      // Return compressed if it's actually smaller
      resolve(compressed.length < dataUrl.length ? compressed : dataUrl);
    };
    img.onerror = () => resolve(dataUrl);
  });
};

const NoteCard = ({
  note,
  onEdit,
  onDelete,
  onSummarize,
  onRead,
  onZoom,
}: {
  note: any;
  onEdit: () => void;
  onDelete: () => void;
  onSummarize: () => void;
  onRead: () => void;
  onZoom: (url: string) => void;
}) => (
  <motion.div
    layout
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    className="bg-white/15 backdrop-blur-lg rounded-[32px] p-6 shadow-2xl border border-white/30 flex flex-col h-[240px] group hover:shadow-brand/20 transition-all relative overflow-hidden cursor-default"
  >
    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand rounded-r-full shadow-[0_0_15px_rgba(123,133,249,0.5)]" />

    <div className="flex items-center justify-between mb-3">
      <h3 className="font-bold text-white text-base line-clamp-1 tracking-tight pr-2 drop-shadow-md">
        {note.title}
      </h3>
      <div className="flex-shrink-0 bg-white/20 text-white text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 uppercase tracking-widest shadow-sm backdrop-blur-md">
        {note.category || "General"}
      </div>
    </div>

    <div
      className="cursor-pointer group/content flex-1 min-h-0 overflow-hidden"
      onClick={onRead}
    >
      {/* Compact Media Preview */}
      {(note.mediaAssets?.length > 0 || note.mediaUrl) && (
        <div className="mb-2 grid grid-cols-4 gap-1.5 h-12 overflow-hidden rounded-xl relative">
          {note.mediaAssets ? (
            note.mediaAssets.slice(0, 4).map((asset: any, idx: number) => (
              <div
                key={asset.id || `thumb-${idx}`}
                className="relative bg-white/10 border border-white/10 flex items-center justify-center overflow-hidden rounded-lg h-full"
              >
                {asset.type.startsWith("image/") ? (
                  <img
                    src={asset.url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <FileText className="w-3 h-3 text-white/60" />
                )}
                {/* Overlay for "more" count on the 4th item if there are more than 4 items */}
                {idx === 3 && note.mediaAssets.length > 4 && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center text-[10px] text-white font-black">
                    +{note.mediaAssets.length - 4}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="col-span-4 h-full bg-white/10 border border-white/10 flex items-center justify-center overflow-hidden rounded-lg h-full">
              {note.mediaType?.startsWith("image/") ? (
                <img
                  src={note.mediaUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <FileText className="w-4 h-4 text-white/60" />
              )}
            </div>
          )}
        </div>
      )}

      <div className="text-white text-xs line-clamp-3 leading-relaxed font-sans mt-1">
        <ReactMarkdown
          components={MarkdownComponents}
          rehypePlugins={[rehypeRaw]}
        >
          {linkifyText(note.content || "")}
        </ReactMarkdown>
      </div>
    </div>

    <div className="mt-4 flex items-center justify-between pt-3 border-t border-white/10">
      <span className="text-white/80 text-xs font-semibold">
        {note.createdAt ? formatDate(note.createdAt.toDate()) : "Recent"}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSummarize();
          }}
          className={`p-2 rounded-xl text-white group-hover:scale-110 transition-all ${
            note.summary ? "bg-white/20" : "hover:bg-white/10"
          }`}
          title={note.summary ? "View Saved Summary" : "AI Summarize"}
        >
          <Sparkles
            className={`w-4 h-4 ${note.summary ? "fill-current" : ""}`}
          />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="px-4 py-1.5 hover:bg-white/20 rounded-xl text-white text-sm font-semibold transition-colors border border-white/10"
        >
          Edit
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
          className="p-2.5 hover:bg-red-500/30 active:scale-95 rounded-xl text-red-200 transition-all border border-white/10"
          title="Delete Note"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  </motion.div>
);

const FAB = ({ onClick }: { onClick: () => void }) => (
  <button
    onClick={onClick}
    className="fixed bottom-10 right-10 w-16 h-16 bg-brand rounded-full shadow-2xl flex items-center justify-center text-white hover:scale-110 hover:rotate-90 active:scale-95 transition-all z-40 group"
  >
    <Plus className="w-8 h-8" />
    <span className="absolute right-20 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
      New Note
    </span>
  </button>
);

const Stars = () => (
  <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
    {[...Array(50)].map((_, i) => (
      <motion.div
        key={i}
        initial={{ opacity: Math.random() * 0.5, scale: Math.random() }}
        animate={{
          opacity: [0.2, 0.8, 0.2],
          scale: [0.8, 1.2, 0.8],
        }}
        transition={{
          duration: 3 + Math.random() * 4,
          repeat: Infinity,
          ease: "easeInOut",
          delay: Math.random() * 5,
        }}
        className="absolute bg-white rounded-full"
        style={{
          top: `${Math.random() * 100}%`,
          left: `${Math.random() * 100}%`,
          width: `${Math.random() * 3}px`,
          height: `${Math.random() * 3}px`,
          boxShadow: "0 0 10px rgba(255, 255, 255, 0.4)",
        }}
      />
    ))}
  </div>
);

// --- Main Page ---

import SettingsPage from "./Settings";

export default function Dashboard({ user }: { user: any }) {
  const [view, setView] = useState<"notes" | "settings">("notes");
  const [notes, setNotes] = useState<any[]>([]);
  const [deletedNotes, setDeletedNotes] = useState<any[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [profileData, setProfileData] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    const userDocRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(userDocRef, (doc) => {
      if (doc.exists()) {
        setProfileData(doc.data());
      }
    });
    return () => unsubscribe();
  }, [user]);

  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [isReaderOpen, setIsReaderOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isJournalOpen, setIsJournalOpen] = useState(false);
  const [journalInitialTab, setJournalInitialTab] = useState<
    "today" | "history" | "analytics"
  >("today");
  const [currentNote, setCurrentNote] = useState<any>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [currentNoteForSummary, setCurrentNoteForSummary] = useState<any>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const notesPath = `users/${user.uid}/notes`;
    const q = query(collection(db, notesPath), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          ...doc.data(),
          id: doc.id,
        }));
        setNotes(data);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, notesPath);
      },
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const trashPath = `users/${user.uid}/trash`;
    const q = query(collection(db, trashPath), orderBy("updatedAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          ...doc.data(),
          id: doc.id,
        }));
        setDeletedNotes(data);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, trashPath);
      },
    );

    return () => unsubscribe();
  }, [user]);

  const [error, setError] = useState<string | null>(null);

  const handleSaveNote = async (data: any) => {
    if (!user) return;
    const notesPath = `users/${user.uid}/notes`;
    setLoading(true);
    setError(null);

    // Clean the data: remove metadata fields that shouldn't be in document fields
    const { id, isLoading, isUploading, ...cleanData } = data;

    const finalData = {
      ...cleanData,
      userId: user.uid,
      category: data.category || "General",
      mediaAssets: data.mediaAssets || [],
    };

    try {
      const targetId = id || currentNote?.id;

      if (targetId) {
        // For updates, we explicitly verify the document exists and we are the owner
        // through the rules, but we send the core fields to ensure schema validation
        await updateDoc(doc(db, notesPath, targetId), {
          ...finalData,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, notesPath), {
          ...finalData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      // Close all modals after successful save
      setIsNoteModalOpen(false);
      setIsReaderOpen(false);
      setIsChatOpen(false);
      setCurrentNote(null);
    } catch (err: any) {
      console.error("Firestore Save Error:", err);
      // More descriptive error if it's a size issue
      if (
        err.message?.includes("too large") ||
        err.code === "invalid-argument"
      ) {
        setError(
          "Note is too large. Please remove some images or reduce content.",
        );
      } else {
        setError(
          "Failed to save note. Please check your storage or permissions.",
        );
      }
      handleFirestoreError(err, OperationType.WRITE, notesPath);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteNote = async (id: string) => {
    if (!user) return;
    const notesPath = `users/${user.uid}/notes`;
    const trashPath = `users/${user.uid}/trash`;

    const noteToDelete = notes.find((n) => n.id === id);
    if (!noteToDelete) {
      console.error("Note not found in local state:", id);
      return;
    }

    // Clean up the data for storage in trash
    const { id: _, ...cleanedNote } = noteToDelete;

    try {
      // 1. Add to trash with a snapshot of the current time
      await addDoc(collection(db, trashPath), {
        ...cleanedNote,
        updatedAt: serverTimestamp(),
        deletedAt: serverTimestamp(),
      });
      // 2. Remove from active notes
      await deleteDoc(doc(db, notesPath, id));
    } catch (error) {
      console.error("Error moving note to trash:", error);
      handleFirestoreError(error, OperationType.WRITE, trashPath);
    }
  };

  const handleRestoreNote = async (note: any) => {
    if (!user) return;
    const notesPath = `users/${user.uid}/notes`;
    const trashPath = `users/${user.uid}/trash`;

    // Remove metadata fields before restoring
    const { id, deletedAt, ...restoredData } = note;

    try {
      // 1. Add back to notes
      await addDoc(collection(db, notesPath), {
        ...restoredData,
        updatedAt: serverTimestamp(),
      });
      // 2. Remove from trash
      await deleteDoc(doc(db, trashPath, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, notesPath);
    }
  };

  const handlePermanentDeleteNote = async (id: string) => {
    if (!user) return;
    if (!confirm("Are you sure? This will permanently delete the note."))
      return;

    const trashPath = `users/${user.uid}/trash`;
    try {
      await deleteDoc(doc(db, trashPath, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, trashPath);
    }
  };

  const handleSummarize = async (note: any) => {
    // If note already has a summary, just show it
    if (note.summary) {
      setSummary(note.summary);
      setCurrentNoteForSummary(note);
      return;
    }

    setIsSummarizing(true);
    setCurrentNoteForSummary(note);
    setSummary("");
    try {
      const stream = summarizeNoteStream(note.content);
      let fullSummary = "";
      for await (const chunk of stream) {
        fullSummary += chunk;
        setSummary((prev) => (prev || "") + chunk);
      }
    } catch (e) {
      console.error(e);
      setError("Failed to summarize note.");
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleSaveSummaryToNote = async () => {
    if (!user || !currentNoteForSummary || !summary) return;

    const notesPath = `users/${user.uid}/notes`;
    try {
      await updateDoc(doc(db, notesPath, currentNoteForSummary.id), {
        summary: summary,
        updatedAt: serverTimestamp(),
      });
      // Update local state if in reader
      if (isReaderOpen && currentNote?.id === currentNoteForSummary.id) {
        setCurrentNote({ ...currentNote, summary: summary });
      }
      setSummary(null);
      setCurrentNoteForSummary(null);
    } catch (err) {
      console.error(err);
      setError("Failed to save summary to note.");
    }
  };

  const handleRemoveSummaryFromNote = async () => {
    if (!user || !currentNoteForSummary) return;

    const notesPath = `users/${user.uid}/notes`;
    try {
      await updateDoc(doc(db, notesPath, currentNoteForSummary.id), {
        summary: null,
        updatedAt: serverTimestamp(),
      });
      // Update local state if in reader
      if (isReaderOpen && currentNote?.id === currentNoteForSummary.id) {
        setCurrentNote({ ...currentNote, summary: null });
      }
      setSummary(null);
      setCurrentNoteForSummary(null);
    } catch (err) {
      console.error(err);
      setError("Failed to remove summary from note.");
    }
  };

  const handleFullResetNote = async (note: any) => {
    if (
      !user ||
      !note ||
      !confirm(
        "Reset this note? This will remove all AI summaries and highlights.",
      )
    )
      return;

    const notesPath = `users/${user.uid}/notes`;
    try {
      // Stripping marks from content
      const content = note.content || "";
      const cleanedContent = content.replace(/<mark[^>]*>|<\/mark>/g, "");

      await updateDoc(doc(db, notesPath, note.id), {
        content: cleanedContent,
        summary: null,
        updatedAt: serverTimestamp(),
      });

      // Update local state for immediate feedback
      const updatedNote = {
        ...note,
        content: cleanedContent,
        summary: null,
        updatedAt: { toDate: () => new Date() }, // Mock firestore timestamp for immediate UI sync
      };

      if (isReaderOpen && currentNote?.id === note.id) {
        setCurrentNote(updatedNote);
      }

      if (currentNoteForSummary?.id === note.id) {
        setSummary(null);
        setCurrentNoteForSummary(null);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to reset note.");
    }
  };

  const handleDownload = (note: any) => {
    try {
      const dateStr = note.createdAt
        ? formatDate(note.createdAt.toDate())
        : "Recent";
      const fileName = `${note.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}`;

      const doc = new jsPDF();

      // Title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(24);
      doc.text(note.title, 20, 25);

      // Metadata
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Category: ${note.category || "General"}`, 20, 35);
      doc.text(`Date: ${dateStr}`, 20, 40);

      // Divider
      doc.setDrawColor(230);
      doc.line(20, 45, 190, 45);

      // Content
      doc.setTextColor(0);
      doc.setFontSize(12);
      const cleanContent = (note.content || "").replace(
        /<mark[^>]*>|<\/mark>/g,
        "",
      );
      const splitText = doc.splitTextToSize(cleanContent, 170);

      let yShift = 55;
      doc.text(splitText, 20, yShift);

      // Basic AI Summary inclusion if exists
      if (note.summary) {
        // Simple page break check (rough estimation)
        const contentHeight = splitText.length * 7;
        if (yShift + contentHeight > 250) {
          doc.addPage();
          yShift = 20;
        } else {
          yShift += contentHeight + 20;
        }

        doc.setFont("helvetica", "bold");
        doc.text("AI Summary", 20, yShift);
        doc.setFont("helvetica", "normal");
        const splitSummary = doc.splitTextToSize(note.summary, 170);
        doc.text(splitSummary, 20, yShift + 10);
      }

      doc.save(`${fileName}.pdf`);
    } catch (err) {
      console.error("PDF Download error:", err);
      setError("Failed to generate PDF export.");
    }
  };

  const defaultCategories = ["General", "Personal", "AI Notes"];
  const allCategories = ["All", "General", "Personal", "My Notes", "AI Notes"];

  const filteredNotes = notes.filter((note) => {
    const matchesSearch =
      note.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.category?.toLowerCase().includes(searchQuery.toLowerCase());

    let matchesCategory = false;
    if (selectedCategory === "All") {
      matchesCategory = true;
    } else if (selectedCategory === "My Notes") {
      // My Notes matches anything explicitly tagged "My Notes"
      // OR anything that is NOT one of our system defaults, but MUST have a category string
      matchesCategory =
        note.category === "My Notes" ||
        (!!note.category && !defaultCategories.includes(note.category));
    } else {
      matchesCategory = note.category === selectedCategory;
    }

    return matchesSearch && matchesCategory;
  });

  if (view === "settings") {
    return (
      <SettingsPage
        onBack={() => setView("notes")}
        onShowTrash={() => {
          setView("notes");
          setShowTrash(true);
        }}
        onShowJournalAnalytics={() => {
          setView("notes");
          setJournalInitialTab("analytics");
          setIsJournalOpen(true);
        }}
        noteCount={notes.length}
      />
    );
  }

  return (
    <div className="pb-20">
      <Navbar
        user={{ ...user, ...profileData }}
        onSettings={() => setView("settings")}
        onSearchQuery={setSearchQuery}
      />

      <main className="max-w-7xl mx-auto mt-8 space-y-10 px-4 sm:px-8">
        <AnimatePresence>
          {error && (
            <div className="px-4 sm:px-8">
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="relative z-50 mb-4 p-4 bg-red-500/20 backdrop-blur-md border border-red-500/30 text-red-100 rounded-2xl flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-red-500/40 p-2 rounded-xl">
                    <X className="w-4 h-4" />
                  </div>
                  <span className="font-semibold text-sm">{error}</span>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="p-1 hover:bg-red-500/30 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* --- Workspace Header Section --- */}
        <section className="rounded-[32px] sm:rounded-[48px] overflow-hidden relative shadow-2xl border border-white/20 min-h-[245px] sm:min-h-[300px] md:min-h-[340px] flex items-center">
          {/* Background for Workspace Section */}
          <div className="absolute inset-0 z-0">
            <motion.div
              key={
                selectedCategory === "My Notes"
                  ? "notes-header-bg"
                  : "workspace-header-bg"
              }
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-all duration-1000"
              style={{
                backgroundImage:
                  selectedCategory === "My Notes"
                    ? "url('https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=3540&auto=format&fit=crop')" // Soft mountains for Library
                    : "url('https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?q=80&w=3540&auto=format&fit=crop')", // Dark Space for Workspace
              }}
            />
            <div
              className={`absolute inset-0 transition-opacity duration-700 ${
                selectedCategory === "My Notes"
                  ? "bg-black/20 backdrop-blur-[2px]"
                  : "bg-black/40 backdrop-blur-[1px]"
              }`}
            />
            {selectedCategory !== "My Notes" && <Stars />}
          </div>

          <header className="relative z-10 w-full px-5 sm:px-10 py-6 sm:py-12 flex flex-col lg:flex-row items-center lg:items-center justify-between gap-6 sm:gap-8">
            <div className="flex-1 text-center lg:text-left">
              <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl text-white mb-2 sm:mb-4 tracking-tight leading-tight drop-shadow-xl">
                {selectedCategory === "My Notes"
                  ? "Personal Library"
                  : "My Workspace"}
              </h1>
              <p className="text-white/95 font-medium max-w-2xl mx-auto lg:mx-0 text-sm sm:text-base md:text-lg leading-relaxed drop-shadow-lg">
                {selectedCategory === "My Notes"
                  ? "Your custom categories and specialized notes collection curated for your individual needs."
                  : "Capture ideas, summarize complex insights, and organize your academic journey with integrated AI assistance."}
              </p>
            </div>

            <div className="flex flex-col items-center lg:items-end gap-3 min-w-[200px] w-full lg:w-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  y: [0, -6, 0],
                  x: [0, 4, 0, -4, 0],
                }}
                transition={{
                  opacity: { duration: 0.5 },
                  scale: { duration: 0.5 },
                  y: { duration: 4, repeat: Infinity, ease: "easeInOut" },
                  x: { duration: 7, repeat: Infinity, ease: "easeInOut" },
                }}
                className="h-24 sm:h-32 md:h-40 flex items-center justify-center relative"
              >
                <img
                  src="https://png.pngtree.com/png-clipart/20250131/original/pngtree-cartoon-boy-with-glasses-holding-book-png-image_20112721.png"
                  alt="Scholar Avatar"
                  className="h-full w-auto object-contain select-none pointer-events-none drop-shadow-xl"
                  referrerPolicy="no-referrer"
                />
              </motion.div>

              <button
                onClick={() => setIsJournalOpen(true)}
                className="flex items-center gap-2 px-6 py-2.5 bg-brand text-white border border-brand/20 rounded-2xl font-bold shadow-xl hover:scale-105 transition-all text-sm group"
              >
                <BookOpen className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                Journal History
              </button>
            </div>
          </header>
        </section>

        {/* --- Library & Filter Section --- */}
        <section className="space-y-8">
          {showTrash ? (
            <div className="px-4 sm:px-8">
              <div className="bg-white/5 backdrop-blur-xl rounded-[40px] p-10 border border-white/10 shadow-2xl transition-all">
                <div className="flex items-center justify-between mb-10">
                  <div>
                    <h2 className="text-3xl font-serif text-white mb-2">
                      Recently Deleted
                    </h2>
                    <p className="text-white/50 text-sm font-semibold tracking-wide uppercase">
                      Items will be kept here until permanently deleted.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowTrash(false)}
                    className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-sm transition-all border border-white/10"
                  >
                    Back to Workspace
                  </button>
                </div>

                {deletedNotes.length === 0 ? (
                  <div className="border-2 border-dashed border-white/10 p-24 flex flex-col items-center justify-center text-center rounded-[32px]">
                    <Trash2 className="w-16 h-16 text-white/10 mb-6" />
                    <h3 className="font-bold text-white/30 text-2xl">
                      Trash is empty
                    </h3>
                    <p className="text-white/20 font-semibold max-w-xs mt-2">
                      Notes you delete will appear here temporarily.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {deletedNotes.map((note) => (
                      <motion.div
                        layout
                        key={note.id}
                        className="bg-white/5 backdrop-blur-lg rounded-[32px] p-6 border border-white/10 flex flex-col group grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition-all shadow-xl"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-bold text-white text-lg line-clamp-1 group-hover:text-brand transition-colors">
                            {note.title}
                          </h3>
                          <span className="text-[10px] bg-white/10 text-white/60 font-black px-3 py-1 rounded-full uppercase tracking-widest">
                            {note.category}
                          </span>
                        </div>
                        <div className="text-white/40 text-sm line-clamp-2 mb-6 font-sans group-hover:text-white/70">
                          {note.content}
                        </div>
                        <div className="mt-auto flex items-center justify-between pt-4 border-t border-white/10">
                          <span className="text-white/20 text-[10px] font-bold uppercase tracking-widest">
                            {note.updatedAt
                              ? formatDate(note.updatedAt.toDate())
                              : "Recently"}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleRestoreNote(note)}
                              className="p-2.5 bg-brand/20 hover:bg-brand/30 text-brand rounded-xl transition-all"
                              title="Restore Note"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handlePermanentDeleteNote(note.id)}
                              className="p-2.5 hover:bg-red-500/20 text-red-400 rounded-xl transition-all"
                              title="Permanently Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-10">
              {/* Category Filter Container with its own Background */}
              <div className="bg-white/5 backdrop-blur-xl rounded-[24px] sm:rounded-[32px] p-5 sm:p-8 border border-white/10 shadow-xl relative overflow-hidden group">
                {/* Subtle Background Pattern for Filter Section */}
                <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-repeat" />

                <div className="relative z-10 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-brand/40 rounded-xl flex items-center justify-center shadow-lg shadow-brand/20">
                        <Layers className="w-4 h-4 text-white" />
                      </div>
                      <h3 className="text-sm font-black text-white uppercase tracking-widest px-1 drop-shadow-sm">
                        Filter by Category
                      </h3>
                    </div>
                    <div className="text-[10px] text-white/70 font-bold uppercase tracking-tighter bg-white/10 px-2 py-0.5 rounded-md">
                      {filteredNotes.length} Notes Found
                    </div>
                  </div>

                  <div className="flex items-center gap-3 overflow-x-auto pb-2 -mx-2 px-2 no-scrollbar">
                    {allCategories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-6 py-2.5 rounded-2xl text-xs font-bold transition-all uppercase tracking-widest whitespace-nowrap border shadow-sm ${
                          selectedCategory === cat
                            ? "bg-brand text-white border-brand shadow-lg shadow-brand/30 scale-105"
                            : "bg-white/20 text-white hover:text-white hover:bg-white/30 border-white/30 backdrop-blur-md"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Grid Section Container */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
                {filteredNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onEdit={() => {
                      setIsReaderOpen(false);
                      setCurrentNote(note);
                      setIsNoteModalOpen(true);
                    }}
                    onDelete={() => handleDeleteNote(note.id)}
                    onSummarize={() => handleSummarize(note)}
                    onRead={() => {
                      setCurrentNote(note);
                      setIsReaderOpen(true);
                    }}
                    onZoom={setLightboxImage}
                  />
                ))}

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setIsReaderOpen(false);
                    setCurrentNote(null);
                    setIsNoteModalOpen(true);
                  }}
                  className="rounded-[32px] border-4 border-dashed border-white/10 bg-white/5 backdrop-blur-md flex flex-col items-center justify-center p-12 text-white/20 hover:text-white/60 hover:border-white/30 transition-all h-[240px] shadow-inner group"
                >
                  <Plus className="w-12 h-12 mb-4 group-hover:scale-110 group-hover:rotate-90 transition-all" />
                  <span className="font-bold text-lg uppercase tracking-tight">
                    Add New Subject
                  </span>
                </motion.button>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Static Floating Action Buttons */}
      <div className="fixed bottom-4 right-4 sm:bottom-10 sm:right-10 flex items-center gap-2.5 sm:gap-4 z-40">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsChatOpen(true)}
          className="flex items-center gap-2 sm:gap-3 px-4 py-2.5 sm:px-8 sm:py-4 bg-brand text-white rounded-full font-bold shadow-2xl shadow-brand/40 hover:bg-brand/90 transition-all text-xs sm:text-base"
        >
          <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 fill-white/20" />
          <span>Generative AI</span>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.1, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => {
            setIsReaderOpen(false);
            setCurrentNote(null);
            setIsNoteModalOpen(true);
          }}
          className="w-11 h-11 sm:w-16 sm:h-16 bg-white text-gray-900 rounded-full shadow-2xl flex items-center justify-center hover:shadow-brand/10 transition-all border border-gray-100"
        >
          <Plus className="w-5 h-5 sm:w-8 sm:h-8" />
        </motion.button>
      </div>

      {/* --- Modals --- */}

      <AnimatePresence>
        {isReaderOpen && (
          <ReaderModal
            note={currentNote}
            onClose={() => {
              setIsReaderOpen(false);
              setCurrentNote(null);
            }}
            onEdit={() => {
              setIsNoteModalOpen(true);
            }}
            onSaveHighlight={(updatedContent) =>
              handleSaveNote({ ...currentNote, content: updatedContent })
            }
            onSummarize={handleSummarize}
            onDownload={handleDownload}
            onReset={handleFullResetNote}
            onZoom={setLightboxImage}
          />
        )}

        {isNoteModalOpen && (
          <NoteModal
            initialData={currentNote}
            isLoading={loading}
            user={user}
            onClose={() => {
              setIsNoteModalOpen(false);
              if (!isReaderOpen) setCurrentNote(null);
            }}
            onSave={handleSaveNote}
          />
        )}

        {isChatOpen && (
          <AIChat
            onClose={() => setIsChatOpen(false)}
            onSaveNote={handleSaveNote}
          />
        )}

        {isJournalOpen && (
          <JournalModal
            user={user}
            initialTab={journalInitialTab}
            onClose={() => {
              setIsJournalOpen(false);
              setJournalInitialTab("today");
            }}
          />
        )}

        <AnimatePresence>
          {lightboxImage && (
            <div
              className="fixed inset-0 bg-gray-950/90 z-[100] flex items-center justify-center p-4 md:p-10 cursor-zoom-out"
              onClick={() => setLightboxImage(null)}
            >
              <motion.button
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => setLightboxImage(null)}
                className="absolute top-10 right-10 p-4 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
              >
                <X className="w-8 h-8" />
              </motion.button>
              <motion.img
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                src={lightboxImage}
                alt="Enlarged"
                className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </AnimatePresence>

        {(summary !== null || isSummarizing) && (
          <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[40px] p-8 max-w-2xl w-full max-h-[80vh] flex flex-col relative"
            >
              <button
                onClick={() => {
                  setSummary(null);
                  setIsSummarizing(false);
                }}
                className="absolute top-6 right-6 p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-brand/10 rounded-2xl text-brand">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div className="flex flex-col">
                  <h3 className="font-serif text-2xl text-gray-900">
                    AI Summary
                  </h3>
                  {currentNoteForSummary?.summary && (
                    <span className="text-xs text-brand font-medium">
                      Saved Summary
                    </span>
                  )}
                </div>
                {isSummarizing && (
                  <Loader2 className="w-4 h-4 animate-spin text-brand" />
                )}
              </div>
              <div className="overflow-y-auto flex-1 prose prose-brand custom-scrollbar pr-2 mb-6">
                {summary ? (
                  <div className="markdown-body">
                    <ReactMarkdown components={MarkdownComponents}>
                      {linkifyText(summary || "")}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-4">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <p className="font-medium">Generating insights...</p>
                  </div>
                )}
              </div>

              {!isSummarizing && summary && (
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                  <button
                    onClick={() =>
                      handleDownload({ ...currentNoteForSummary, summary })
                    }
                    className="flex items-center gap-2 px-6 py-3 bg-white text-gray-600 rounded-2xl font-semibold hover:bg-gray-50 transition-colors border border-gray-100 shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    Download PDF
                  </button>
                  {currentNoteForSummary?.summary ? (
                    <button
                      onClick={handleRemoveSummaryFromNote}
                      className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-500 rounded-2xl font-semibold hover:bg-red-100 transition-colors border border-red-100"
                    >
                      <Trash2 className="w-4 h-4" />
                      Remove Summary
                    </button>
                  ) : (
                    <button
                      onClick={handleSaveSummaryToNote}
                      className="flex items-center gap-2 px-6 py-3 bg-brand text-white rounded-2xl font-semibold hover:bg-brand/90 transition-colors shadow-lg shadow-brand/20"
                    >
                      <Save className="w-4 h-4" />
                      Save Summary to Note
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

const ReaderModal = ({
  note,
  onClose,
  onEdit,
  onSaveHighlight,
  onSummarize,
  onReset,
  onZoom,
  onDownload,
}: {
  note: any;
  onClose: () => void;
  onEdit: () => void;
  onSaveHighlight: (content: string) => Promise<void>;
  onSummarize: (note: any) => void;
  onReset: (note: any) => void;
  onZoom: (url: string) => void;
  onDownload: (note: any) => void;
}) => {
  const [readerContent, setReaderContent] = useState(note.content);
  const [history, setHistory] = useState<string[]>([note.content]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [saveLoading, setSaveLoading] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [isHighlightPickerOpen, setIsHighlightPickerOpen] = useState(false);

  // Sync content if note changes externally (e.g. from editor)
  useEffect(() => {
    setReaderContent(note.content);
    // When syncing from editor, we might want to reset history or just add the new state
    setHistory([note.content]);
    setHistoryIndex(0);
  }, [note.id, note.updatedAt, note.content]);

  const highlightColors = [
    { name: "Yellow", class: "bg-yellow-200/80", hex: "#fef08a" },
    { name: "Green", class: "bg-green-200/80", hex: "#bbf7d0" },
    { name: "Blue", class: "bg-blue-200/80", hex: "#bfdbfe" },
    { name: "Pink", class: "bg-pink-200/80", hex: "#fbcfe8" },
    { name: "Purple", class: "bg-purple-200/80", hex: "#e9d5ff" },
  ];

  const updateContent = (newContent: string) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newContent);
    if (newHistory.length > 20) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setReaderContent(newContent);
  };

  const handleApplyHighlight = (color: string) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
      return;

    const range = selection.getRangeAt(0);
    const container = document.createElement("div");
    container.appendChild(range.cloneContents());
    const selectedHtml = container.innerHTML;

    // We inject a mark tag with the color
    // This is applied to the HTML. Since we are using ReactMarkdown with rehypeRaw,
    // we need to be careful. A better way for persistent strictly-markdown highlighting
    // is hard, so we'll use HTML marks.
    const highlightedContent = readerContent.replace(
      selectedHtml,
      `<mark style="background-color: ${color}; padding: 0 4px; border-radius: 4px;">${selectedHtml}</mark>`,
    );

    // Fallback if replace fails due to HTML differences
    if (highlightedContent === readerContent) {
      // Simple approach: append or wrap if possible, but replace is safer for existing content
      // In a real editor we'd use a virtual DOM or specific offset-based replacement
    }

    updateContent(highlightedContent);
    selection.removeAllRanges();
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setReaderContent(history[historyIndex - 1]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setReaderContent(history[historyIndex + 1]);
    }
  };

  const handleReset = () => {
    // Call parent reset logic (which updates DB and parent state)
    onReset(note);
    // Also optimistically clear local reader content
    const cleaned = readerContent.replace(/<mark[^>]*>|<\/mark>/g, "");
    setReaderContent(cleaned);
    setHistory([cleaned]);
    setHistoryIndex(0);
  };

  const handleSave = async () => {
    setSaveLoading(true);
    await onSaveHighlight(readerContent);
    setSaveLoading(false);
  };

  // Detect selection to show/hide context tools or just use the fixed header tools
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      setShowToolbar(!!selection && !selection.isCollapsed);
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  return (
    <div className="fixed inset-0 bg-gray-950/80 z-50 flex items-center justify-center p-4 md:p-10">
      <motion.div
        initial={{ y: 50, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 50, opacity: 0, scale: 0.95 }}
        className="bg-white rounded-[40px] shadow-2xl w-full max-w-5xl h-full flex flex-col overflow-hidden"
      >
        <div className="p-6 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="bg-brand/10 text-brand text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-[0.2em]">
              {note.category || "General"}
            </div>
            <span className="text-gray-500 text-xs font-bold uppercase tracking-widest hidden sm:block">
              {note.createdAt
                ? formatDate(note.createdAt.toDate())
                : "Recently Saved"}
            </span>
            <div className="h-6 w-px bg-gray-100 hidden sm:block" />
            <div className="flex items-center gap-1">
              <button
                onClick={handleUndo}
                disabled={historyIndex === 0}
                className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-20 transition-all"
                title="Undo"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                onClick={handleRedo}
                disabled={historyIndex === history.length - 1}
                className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-20 transition-all"
                title="Redo"
              >
                <Redo2 className="w-4 h-4" />
              </button>
              <button
                onClick={handleReset}
                className="p-2 hover:bg-red-50 hover:text-red-500 rounded-lg transition-all"
                title="Reset All Highlights"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <div className="w-px h-4 bg-gray-100 mx-1" />
              <button
                onClick={() => onSummarize(note)}
                className={`p-2 rounded-lg transition-all flex items-center gap-2 ${
                  note.summary
                    ? "bg-brand/10 text-brand"
                    : "hover:bg-brand/5 text-brand"
                }`}
                title={note.summary ? "View Saved Summary" : "AI Summarize"}
              >
                <Sparkles
                  className={`w-4 h-4 ${note.summary ? "fill-current" : ""}`}
                />
                {note.summary && (
                  <span className="text-[10px] font-bold uppercase tracking-wider">
                    Saved
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <button
                onClick={() => setIsHighlightPickerOpen(!isHighlightPickerOpen)}
                className={`p-2.5 rounded-2xl transition-all ${isHighlightPickerOpen ? "bg-brand text-white shadow-lg" : "hover:bg-gray-100 text-gray-900 bg-white border border-gray-100"}`}
                title="Highlight Text"
              >
                <Highlighter className="w-5 h-5" />
              </button>

              <AnimatePresence>
                {isHighlightPickerOpen && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex items-center gap-1.5 bg-white p-1 rounded-2xl border border-gray-100 shadow-xl ml-2"
                  >
                    {highlightColors.map((color) => (
                      <button
                        key={color.name}
                        onClick={() => {
                          handleApplyHighlight(color.hex);
                          setIsHighlightPickerOpen(false);
                        }}
                        className={`w-8 h-8 rounded-xl ${color.class} hover:scale-110 transition-transform active:scale-95 border border-white`}
                        title={`Highlight ${color.name}`}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="h-6 w-px bg-gray-100 mx-2" />
            <button
              onClick={() => onDownload(note)}
              className="p-2.5 hover:bg-gray-100 rounded-2xl text-gray-900 transition-all"
              title="Download PDF"
            >
              <Download className="w-5 h-5 text-gray-500 hover:text-brand" />
            </button>
            <div className="h-6 w-px bg-gray-100 mx-1" />
            <button
              onClick={handleSave}
              disabled={saveLoading || readerContent === note.content}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand text-white rounded-2xl font-bold text-sm shadow-lg shadow-brand/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
            >
              {saveLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save
            </button>
            <button
              onClick={onEdit}
              className="p-2.5 hover:bg-gray-100 rounded-2xl text-gray-900 transition-all"
              title="Edit Original Note"
            >
              <Edit3 className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2.5 hover:bg-red-50 hover:text-red-500 rounded-2xl transition-all"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 md:p-16 custom-scrollbar relative">
          <div className="max-w-3xl mx-auto">
            <h1 className="font-serif text-5xl text-gray-900 mb-10 leading-tight tracking-tight">
              {note.title}
            </h1>

            {/* Gallery Section */}
            {(note.mediaAssets?.length > 0 || note.mediaUrl) && (
              <div className="mb-12 flex flex-wrap gap-4">
                {note.mediaAssets ? (
                  note.mediaAssets.map((asset: any, idx: number) => (
                    <div
                      key={idx}
                      className="relative w-28 h-28 rounded-[20px] overflow-hidden shadow-md border-4 border-white cursor-zoom-in hover:scale-105 transition-transform"
                      onClick={() =>
                        asset.type?.startsWith("image/") && onZoom(asset.url)
                      }
                    >
                      {asset.type?.startsWith("image/") ? (
                        <img
                          src={asset.url}
                          alt="Attached"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-full h-full bg-gray-50 flex flex-col items-center justify-center gap-1.5 p-3 group/doc cursor-pointer active:scale-95 transition-all"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewFile(asset.url);
                          }}
                          title={asset.name}
                        >
                          <FileText className="w-8 h-8 text-indigo-400 group-hover/doc:text-brand transition-colors" />
                          <span className="text-[9px] font-black group-hover/doc:text-gray-700 transition-colors text-center truncate w-full px-0.5 text-gray-400">
                            {asset.name
                              ? asset.name.split(".").pop()?.toUpperCase()
                              : "FILE"}
                          </span>
                          <span className="text-[8px] font-medium text-gray-400 truncate max-w-full group-hover/doc:text-gray-600 text-center">
                            {asset.name || "document"}
                          </span>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  // Fallback for old single mediaUrl notes
                  <div
                    className="relative w-28 h-28 rounded-[20px] overflow-hidden shadow-md border-4 border-white cursor-zoom-in hover:scale-105 transition-transform"
                    onClick={() => {
                      if (note.mediaType?.startsWith("image/")) {
                        onZoom(note.mediaUrl);
                      } else {
                        handleViewFile(note.mediaUrl);
                      }
                    }}
                  >
                    {note.mediaType?.startsWith("image/") ? (
                      <img
                        src={note.mediaUrl}
                        alt="Attached"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-50 flex flex-col items-center justify-center gap-1 p-3 group/doc cursor-pointer active:scale-95 transition-all">
                        <FileText className="w-10 h-10 group-hover/doc:text-brand transition-colors text-indigo-400" />
                        <span className="text-[10px] font-black group-hover/doc:text-gray-700 transition-colors uppercase">
                          {note.mediaType?.includes("pdf")
                            ? "PDF"
                            : note.mediaType?.includes("sheet") ||
                                note.mediaType?.includes("excel")
                              ? "EXCEL"
                              : "DOCUMENT"}
                        </span>
                        <span className="text-[8px] font-medium text-gray-400 truncate max-w-full text-center group-hover/doc:text-gray-500">
                          Click to view
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="markdown-body prose prose-lg max-w-none text-gray-900 leading-[1.6] font-sans">
              <ReactMarkdown
                components={MarkdownComponents}
                rehypePlugins={[rehypeRaw]}
              >
                {linkifyText(readerContent || "")}
              </ReactMarkdown>
            </div>
          </div>

          {showToolbar && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-2 py-2 rounded-3xl shadow-2xl flex items-center gap-0 z-[60]"
            >
              <button
                onClick={() => setIsHighlightPickerOpen(!isHighlightPickerOpen)}
                className={`p-3 rounded-2xl transition-all ${isHighlightPickerOpen ? "bg-brand text-white" : "hover:bg-white/10 text-brand"}`}
                title="Toggle Highlight Picker"
              >
                <Highlighter className="w-5 h-5" />
              </button>

              {isHighlightPickerOpen && (
                <>
                  <div className="w-px h-6 bg-gray-700 mx-2" />
                  <div className="flex items-center gap-2 pr-2">
                    {highlightColors.map((color) => (
                      <button
                        key={color.name}
                        onClick={() => {
                          handleApplyHighlight(color.hex);
                          setIsHighlightPickerOpen(false);
                        }}
                        className={`w-8 h-8 rounded-xl ${color.class} hover:scale-110 transition-all border border-gray-700`}
                        title={`Highlight ${color.name}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          )}
        </div>

        <div className="p-8 border-t border-gray-50 flex items-center justify-between text-gray-400 text-[10px] font-black uppercase tracking-[0.3em] bg-gray-50/30">
          <span>© My Journal Professional Mode</span>
          <div className="flex items-center gap-6">
            <span>Select text to highlight</span>
            <Sparkles className="w-3 h-3 text-brand" />
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const NoteModal = ({ initialData, onClose, onSave, isLoading, user }: any) => {
  const [title, setTitle] = useState(initialData?.title || "");
  const [content, setContent] = useState(initialData?.content || "");
  const [category, setCategory] = useState(initialData?.category || "General");
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [mediaAssets, setMediaAssets] = useState<any[]>(
    initialData?.mediaAssets || [],
  );
  const [isUploadingAssets, setIsUploadingAssets] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadCurrent, setUploadCurrent] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [activePreview, setActivePreview] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleSave = () => {
    // Pass everything back, handleSaveNote will clean it
    onSave({ id: initialData?.id, title, content, mediaAssets, category });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) {
      return;
    }

    const filesArray = Array.from(files);
    const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
    const oversizedFiles = filesArray.filter(
      (file) => file.size > MAX_FILE_SIZE,
    );

    if (oversizedFiles.length > 0) {
      alert(
        `The following file(s) exceed the 15MB size limit:\n${oversizedFiles.map((f) => `${f.name} (${(f.size / (1024 * 1024)).toFixed(1)}MB)`).join("\n")}\nPlease upload files under 15MB.`,
      );
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsUploadingAssets(true);
    setUploadProgress(0);
    setUploadTotal(filesArray.length);
    setUploadCurrent(0);

    let completedCount = 0;

    try {
      const uploadPromises = filesArray.map(async (file) => {
        if (controller.signal.aborted) return null;

        const assetId = `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
        let fileToUpload: Blob | File = file;

        try {
          if (controller.signal.aborted) {
            throw new Error("Upload cancelled");
          }

          // Compress if it's an image and too large (say, over 3MB) to speed up transfer
          if (file.type.startsWith("image/") && file.size > 3 * 1024 * 1024) {
            try {
              const reader = new FileReader();
              const dataUrl = await new Promise<string>((resolve, reject) => {
                reader.onload = (e) => resolve(e.target?.result as string);
                reader.onerror = (err) => reject(err);
                reader.readAsDataURL(file);
              });
              if (controller.signal.aborted)
                throw new Error("Upload cancelled");

              const compressedDataUrl = await compressImage(
                dataUrl,
                1200,
                0.75,
              );
              if (controller.signal.aborted)
                throw new Error("Upload cancelled");

              const response = await fetch(compressedDataUrl, {
                signal: controller.signal,
              });
              fileToUpload = await response.blob();
            } catch (e) {
              console.warn("Compression failed, using original file", e);
            }
          }

          if (controller.signal.aborted) {
            throw new Error("Upload cancelled");
          }

          // Attempt MongoDB/Server proxy Upload
          const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = (err) => reject(err);
            reader.readAsDataURL(
              fileToUpload instanceof File
                ? fileToUpload
                : new File([fileToUpload], file.name, { type: file.type }),
            );
          });

          if (controller.signal.aborted) {
            throw new Error("Upload cancelled");
          }

          const uploadResponse = await fetch("/api/media/upload", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              fileName: `${assetId}_${sanitizedName}`,
              fileType: file.type || "application/octet-stream",
              fileData: base64Data,
              userId: user.uid,
            }),
            signal: controller.signal,
          });

          if (!uploadResponse.ok) {
            const errText = await uploadResponse.text();
            throw new Error(errText || "MongoDB/Server Upload request failed");
          }

          const uploadResult = await uploadResponse.json();

          return {
            id: assetId,
            url: uploadResult.url,
            type: file.type || "application/octet-stream",
            name: file.name,
            size: fileToUpload.size,
          };
        } catch (storageErr: any) {
          if (
            controller.signal.aborted ||
            storageErr.name === "AbortError" ||
            storageErr.message === "Upload cancelled"
          ) {
            throw new Error("Upload cancelled");
          }
          console.warn(
            "MongoDB/Server upload failed, attempting direct database fallback:",
            storageErr,
          );

          // Fallback if file is small enough to fit inside document directly (limit to 700KB)
          if (fileToUpload.size < 700 * 1024) {
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve) => {
              reader.onload = (e) => resolve(e.target?.result as string);
              reader.readAsDataURL(
                fileToUpload instanceof File
                  ? fileToUpload
                  : new File([fileToUpload], file.name, { type: file.type }),
              );
            });

            return {
              id: assetId,
              url: base64,
              type: file.type || "application/octet-stream",
              name: file.name,
              isBase64: true,
              size: fileToUpload.size,
            };
          }
          throw new Error(
            "File upload failed, and is too large for database fallback storage (>700KB).",
          );
        } finally {
          completedCount++;
          setUploadCurrent(completedCount);
          setUploadProgress(
            Math.round((completedCount / filesArray.length) * 100),
          );
        }
      });

      const results = await Promise.all(uploadPromises);
      const successfulAssets = results.filter(
        (asset): asset is any => asset !== null,
      );

      if (successfulAssets.length > 0) {
        setMediaAssets((prev) => [...prev, ...successfulAssets]);
        if (successfulAssets.length < filesArray.length) {
          alert(
            `Uploaded ${successfulAssets.length} of ${filesArray.length} files successfully.`,
          );
        }
      } else {
        if (!controller.signal.aborted) {
          alert(
            "Upload failed. Make sure files are valid and size guidelines are respected.",
          );
        }
      }
    } catch (err: any) {
      if (
        err.name === "AbortError" ||
        err.message === "Upload cancelled" ||
        controller.signal.aborted
      ) {
        console.log("Upload cancelled by user.");
      } else {
        console.error("Upload main error:", err);
        alert(
          "Failed to process uploads: " +
            (err.message || "Please check your network."),
        );
      }
    } finally {
      setIsUploadingAssets(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeAsset = (index: number) => {
    setMediaAssets((prev) => prev.filter((_, i) => i !== index));
    setActivePreview(null);
  };

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[70] flex items-center justify-center p-3 sm:p-6">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        className="bg-white rounded-[24px] sm:rounded-[40px] p-5 sm:p-8 max-w-2xl w-full flex flex-col max-h-[96vh] sm:max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <h3 className="font-serif text-2xl text-gray-900">
            {initialData ? "Edit Note" : "Create Note"}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl"
          >
            <X className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">
              Title
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="Enter note title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between ml-1">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                Subject / Category
              </label>
              <button
                onClick={() => setIsAddingNewCategory(!isAddingNewCategory)}
                className="text-xs font-bold text-brand hover:underline"
              >
                {isAddingNewCategory ? "Back to Select" : "+ Create New"}
              </button>
            </div>
            {isAddingNewCategory ? (
              <div className="relative">
                <input
                  type="text"
                  className="input-field"
                  placeholder="Enter new category name..."
                  value={newCategoryName}
                  onChange={(e) => {
                    setNewCategoryName(e.target.value);
                    setCategory(e.target.value);
                  }}
                  autoFocus
                />
                <Sparkles className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand/30" />
              </div>
            ) : (
              <div className="relative">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="input-field appearance-none cursor-pointer pr-10"
                >
                  <option value="General">General</option>
                  <option value="Personal">Personal</option>
                  <option value="My Notes">My Notes</option>
                  <option value="AI Notes">AI Notes</option>
                  {/* Show current category if it's custom */}
                  {category &&
                    !["General", "AI Notes", "Personal", "My Notes"].includes(
                      category,
                    ) && <option value={category}>{category}</option>}
                </select>
                <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 rotate-90 pointer-events-none" />
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between ml-1">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                Attachments
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              {mediaAssets.map((asset, idx) => (
                <div
                  key={asset.id || idx}
                  className={`relative w-20 h-20 rounded-2xl overflow-hidden border cursor-pointer hover:scale-105 transition-all group ${activePreview === idx ? "ring-2 ring-brand border-transparent" : "border-gray-100"}`}
                  onClick={() => setActivePreview(idx)}
                >
                  {asset.type?.startsWith("image/") ? (
                    <img
                      src={asset.url}
                      alt="Thumbnail"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full bg-gray-50 flex flex-col items-center justify-center p-2 text-gray-400 hover:bg-gray-100 transition-colors"
                      title={asset.name}
                    >
                      <FileText className="w-6 h-6 text-indigo-400" />
                      <span className="text-[8px] font-bold mt-1 uppercase text-center truncate max-w-full px-1">
                        {asset.name?.split(".").pop() || "FILE"}
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActivePreview(idx);
                      }}
                      className="p-1.5 bg-white/25 hover:bg-white/40 text-white rounded-lg transition-colors"
                      title="View Details"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeAsset(idx);
                      }}
                      className="p-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-lg transition-colors"
                      title="Delete Attachment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAssets}
                className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-100 flex flex-col items-center justify-center text-gray-300 hover:text-brand hover:border-brand/30 transition-all bg-gray-50/50 relative group/add disabled:opacity-50"
              >
                {isUploadingAssets ? (
                  <Loader2 className="w-6 h-6 animate-spin text-brand" />
                ) : (
                  <>
                    <Plus className="w-6 h-6 group-hover/add:scale-110 transition-transform" />
                    <span className="text-[10px] font-bold mt-1 opacity-0 group-hover/add:opacity-100 transition-opacity">
                      Add
                    </span>
                  </>
                )}
              </button>
            </div>

            {/* Real-time file upload progress bar */}
            {isUploadingAssets && (
              <div className="bg-gray-50/80 p-4 rounded-2xl border border-gray-100 space-y-2 mt-2">
                <div className="flex justify-between items-center text-xs font-bold text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
                    Uploading Assets ({uploadCurrent}/{uploadTotal})
                  </span>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={handleCancelUpload}
                      className="text-[10px] text-rose-600 hover:text-rose-700 font-bold px-2 py-0.5 rounded bg-rose-50 hover:bg-rose-100 transition-colors border border-rose-100"
                    >
                      Cancel
                    </button>
                    <span>{uploadProgress}%</span>
                  </div>
                </div>
                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-brand h-full rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Custom file clicked-preview section with centered Delete option directly beneath */}
            {activePreview !== null && mediaAssets[activePreview] && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-gray-50/70 border border-gray-100 rounded-[24px] space-y-4 relative mt-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                    Attachment Preview
                  </span>
                  <button
                    onClick={() => setActivePreview(null)}
                    className="p-1.5 hover:bg-gray-200/60 rounded-lg text-gray-400 hover:text-gray-600 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-col items-center justify-center min-h-[140px] bg-white rounded-2xl p-4 border border-gray-100/50">
                  {mediaAssets[activePreview].type?.startsWith("image/") ? (
                    <img
                      src={mediaAssets[activePreview].url}
                      alt="Attachment Preview"
                      className="max-h-[180px] object-contain rounded-xl shadow-sm cursor-zoom-in"
                      onClick={() =>
                        handleViewFile(mediaAssets[activePreview].url)
                      }
                    />
                  ) : mediaAssets[activePreview].type?.startsWith("video/") ? (
                    <video
                      src={mediaAssets[activePreview].url}
                      controls
                      className="max-h-[180px] rounded-xl shadow-sm"
                    />
                  ) : mediaAssets[activePreview].type?.startsWith("audio/") ? (
                    <audio
                      src={mediaAssets[activePreview].url}
                      controls
                      className="w-full"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 p-2">
                      <FileText className="w-12 h-12 text-indigo-400 animate-pulse" />
                      <div className="text-center">
                        <p className="text-xs font-black text-gray-800 truncate max-w-[260px]">
                          {mediaAssets[activePreview].name}
                        </p>
                        <p className="text-[9px] text-gray-400 uppercase font-black">
                          {mediaAssets[activePreview].size
                            ? `${(mediaAssets[activePreview].size / (1024 * 1024)).toFixed(2)} MB`
                            : "DOCUMENT FILE"}
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          handleViewFile(mediaAssets[activePreview].url)
                        }
                        className="mt-2 text-xs font-bold text-brand hover:underline px-3 py-1.5 bg-brand/5 rounded-lg border border-brand/5"
                      >
                        Open / View Document
                      </button>
                    </div>
                  )}
                </div>

                {/* Actions row just below the media */}
                <div className="flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      handleViewFile(mediaAssets[activePreview].url)
                    }
                    className="flex items-center gap-2 px-4 py-2.5 bg-brand/10 hover:bg-brand/20 text-brand rounded-xl font-bold text-xs transition-colors border border-brand/20 shadow-sm"
                  >
                    <Eye className="w-4 h-4" />
                    View Full File
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAsset(activePreview)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl font-bold text-xs transition-colors border border-rose-100 shadow-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Attachment
                  </button>
                </div>
              </motion.div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              onChange={handleFileChange}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">
              Content
            </label>
            <textarea
              rows={6}
              className="input-field resize-none py-4"
              placeholder="Start typing your note..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-6 sm:mt-10 flex gap-3 sm:gap-4">
          <button
            onClick={handleSave}
            className="flex-1 btn-primary py-3 sm:py-4 rounded-2xl sm:rounded-3xl"
            disabled={isLoading || isUploadingAssets}
          >
            {isLoading
              ? "Saving..."
              : isUploadingAssets
                ? "Uploading..."
                : "Save Note"}
          </button>
          <button
            onClick={onClose}
            className="px-5 sm:px-8 py-3 sm:py-4 rounded-2xl sm:rounded-3xl border border-gray-100 font-bold text-gray-500 hover:bg-gray-50"
            disabled={isLoading}
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const AIChat = ({ onClose, onSaveNote }: any) => {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSaveCategory, setSelectedSaveCategory] = useState("AI Notes");

  const categories = ["General", "Personal", "My Notes", "AI Notes"];

  const handleSend = async () => {
    if (!prompt.trim()) return;
    const userMsg = { role: "user", content: prompt };
    setMessages((prev) => [...prev, userMsg]);
    setPrompt("");
    setLoading(true);

    try {
      const result = await generateNoteFromPrompt(prompt);
      const aiMsg = {
        role: "ai",
        content: result.content,
        title: result.title,
        isGenerated: true,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: "Sorry, I couldn't generate that note. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        className="bg-[#F9FAFF] rounded-[24px] sm:rounded-[40px] shadow-2xl w-full max-w-4xl h-[94vh] sm:h-[80vh] flex flex-col overflow-hidden relative"
      >
        <div className="p-4 sm:p-6 bg-white border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand rounded-2xl flex items-center justify-center text-white">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-serif text-lg sm:text-xl text-gray-900">
                My Journal Assistant
              </h3>
              <p className="text-xs text-gray-400 font-medium">
                Smart AI Note Generation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-4 sm:space-y-6">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
              <Sparkles className="w-16 h-16 mb-4 text-brand" />
              <h4 className="text-xl font-serif text-gray-900">
                What should we write today?
              </h4>
              <p className="text-sm max-w-xs mt-2">
                Example: "Write a summary of the benefits of a Mediterranean
                diet."
              </p>
            </div>
          )}
          {messages.map((msg, i) => (
            <motion.div
              key={`msg-${i}-${msg.role}`}
              initial={{ opacity: 0, x: msg.role === "user" ? 20 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-[24px] p-5 shadow-sm ${
                  msg.role === "user"
                    ? "bg-brand text-white"
                    : "bg-white text-gray-800"
                }`}
              >
                {msg.title && (
                  <h4 className="font-bold text-lg mb-2">{msg.title}</h4>
                )}
                <div className="markdown-body prose prose-sm leading-relaxed">
                  <ReactMarkdown components={MarkdownComponents}>
                    {linkifyText(msg.content || "")}
                  </ReactMarkdown>
                </div>

                {msg.isGenerated && (
                  <div className="mt-6 pt-4 border-t border-gray-50 flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          setLoading(true);
                          await onSaveNote({
                            title: msg.title,
                            content: msg.content,
                            category: selectedSaveCategory,
                          });
                          setMessages((prev) =>
                            prev.map((m, idx) =>
                              idx === i
                                ? {
                                    ...m,
                                    isSaved: true,
                                    savedCategory: selectedSaveCategory,
                                  }
                                : m,
                            ),
                          );
                          setLoading(false);
                        }}
                        disabled={msg.isSaved || loading}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl text-xs font-bold transition-all shadow-lg ${
                          msg.isSaved
                            ? "bg-green-500 text-white shadow-green-200"
                            : "bg-brand text-white hover:bg-brand-hover shadow-brand/20"
                        }`}
                      >
                        {msg.isSaved ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        {msg.isSaved
                          ? `Saved to ${msg.savedCategory}`
                          : "Save Note"}
                      </button>

                      {!msg.isSaved && (
                        <div className="relative group/cat">
                          <select
                            value={selectedSaveCategory}
                            onChange={(e) =>
                              setSelectedSaveCategory(e.target.value)
                            }
                            className="appearance-none bg-white border border-gray-100 rounded-2xl px-4 py-2.5 pr-8 text-xs font-bold text-gray-500 hover:bg-gray-50 transition-all outline-none cursor-pointer"
                          >
                            {categories.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                          <ChevronRight className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 rotate-90 pointer-events-none" />
                        </div>
                      )}
                    </div>

                    {!msg.isSaved && (
                      <button
                        onClick={onClose}
                        className="text-gray-400 px-4 py-2 rounded-xl text-xs font-bold hover:bg-gray-50 transition-all ml-auto"
                      >
                        Discard
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white rounded-[24px] p-6 shadow-sm flex items-center gap-2">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity }}
                  className="w-2 h-2 bg-brand rounded-full"
                />
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, delay: 0.2 }}
                  className="w-2 h-2 bg-brand rounded-full"
                />
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, delay: 0.4 }}
                  className="w-2 h-2 bg-brand rounded-full"
                />
              </div>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-6 bg-white border-t">
          <div className="flex gap-2 sm:gap-4 p-1.5 sm:p-2 bg-[#F9FAFF] rounded-[24px] border border-gray-100 shadow-inner focus-within:border-brand/30 transition-all">
            <input
              type="text"
              className="flex-1 bg-transparent border-none outline-none px-2 sm:px-4 py-2 text-sm text-gray-800 placeholder:text-gray-400"
              placeholder="Ask AI to generate a note..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
            />
            <button
              onClick={handleSend}
              className="p-2.5 sm:p-3 bg-brand text-white rounded-2xl shadow-lg shadow-brand/20 hover:scale-105 active:scale-95 transition-all"
            >
              <Send className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const CATEGORIES = [
  {
    name: "Study",
    icon: BookOpen,
    color: "text-indigo-400",
    bg: "bg-indigo-50/50",
    border: "border-indigo-100",
    dot: "bg-indigo-500",
  },
  {
    name: "Health",
    icon: Heart,
    color: "text-teal-400",
    bg: "bg-teal-50/50",
    border: "border-teal-100",
    dot: "bg-teal-400",
  },
  {
    name: "Work",
    icon: Briefcase,
    color: "text-sky-400",
    bg: "bg-sky-50/50",
    border: "border-sky-100",
    dot: "bg-sky-400",
  },
  {
    name: "Personal",
    icon: UserIcon,
    color: "text-rose-400",
    bg: "bg-rose-50/50",
    border: "border-rose-100",
    dot: "bg-rose-400",
  },
  {
    name: "Other",
    icon: Layers,
    color: "text-amber-400",
    bg: "bg-amber-50/50",
    border: "border-amber-100",
    dot: "bg-amber-400",
  },
];

const PRIORITIES = [
  { name: "Low", color: "text-blue-500", bg: "bg-blue-50" },
  { name: "Medium", color: "text-amber-500", bg: "bg-amber-50" },
  { name: "High", color: "text-rose-500", bg: "bg-rose-50" },
];

const JournalModal = ({
  user,
  initialTab = "today",
  onClose,
}: {
  user: any;
  initialTab?: "today" | "history" | "analytics";
  onClose: () => void;
}) => {
  const [activeTab, setActiveTab] = useState<"today" | "history" | "analytics">(
    initialTab,
  );
  const [tasks, setTasks] = useState<any[]>([]);
  const [newTask, setNewTask] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Personal");
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [isLoading, setIsLoading] = useState(false);

  // Filtering & Editing
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editingCategory, setEditingCategory] = useState("Personal");
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [reflectionText, setReflectionText] = useState("");
  const [isSavingReflection, setIsSavingReflection] = useState(false);
  const [isUploadingAssets, setIsUploadingAssets] = useState(false);

  // Upload state for JournalModal
  const [mediaAssets, setMediaAssets] = useState<any[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadCurrent, setUploadCurrent] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [activePreview, setActivePreview] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reflectionFileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: "task" | "reflection",
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) {
      return;
    }

    const filesArray = Array.from(files);
    const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
    const oversizedFiles = filesArray.filter(
      (file) => file.size > MAX_FILE_SIZE,
    );

    if (oversizedFiles.length > 0) {
      alert(
        `The following file(s) exceed the 15MB size limit:\n${oversizedFiles.map((f) => `${f.name} (${(f.size / (1024 * 1024)).toFixed(1)}MB)`).join("\n")}\nPlease upload files under 15MB.`,
      );
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsUploadingAssets(true);
    setUploadProgress(0);
    setUploadTotal(filesArray.length);
    setUploadCurrent(0);

    let completedCount = 0;

    try {
      const uploadPromises = filesArray.map(async (file) => {
        if (controller.signal.aborted) return null;

        const assetId = `journal-asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
        let fileToUpload: Blob | File = file;

        try {
          if (controller.signal.aborted) {
            throw new Error("Upload cancelled");
          }

          // Compress if it's an image and too large (say over 3MB) to speed up transfer
          if (file.type.startsWith("image/") && file.size > 3 * 1024 * 1024) {
            try {
              const reader = new FileReader();
              const dataUrl = await new Promise<string>((resolve, reject) => {
                reader.onload = (e) => resolve(e.target?.result as string);
                reader.onerror = (err) => reject(err);
                reader.readAsDataURL(file);
              });
              if (controller.signal.aborted)
                throw new Error("Upload cancelled");

              const compressedDataUrl = await compressImage(
                dataUrl,
                1200,
                0.75,
              );
              if (controller.signal.aborted)
                throw new Error("Upload cancelled");

              const response = await fetch(compressedDataUrl, {
                signal: controller.signal,
              });
              fileToUpload = await response.blob();
            } catch (e) {
              console.warn(
                "Journal compression failed, using original file",
                e,
              );
            }
          }

          if (controller.signal.aborted) {
            throw new Error("Upload cancelled");
          }

          // Attempt MongoDB/Server proxy Upload
          const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = (err) => reject(err);
            reader.readAsDataURL(
              fileToUpload instanceof File
                ? fileToUpload
                : new File([fileToUpload], file.name, { type: file.type }),
            );
          });

          if (controller.signal.aborted) {
            throw new Error("Upload cancelled");
          }

          const uploadResponse = await fetch("/api/media/upload", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              fileName: `${assetId}_${sanitizedName}`,
              fileType: file.type || "application/octet-stream",
              fileData: base64Data,
              userId: user.uid,
            }),
            signal: controller.signal,
          });

          if (!uploadResponse.ok) {
            const errText = await uploadResponse.text();
            throw new Error(errText || "MongoDB Journal Upload request failed");
          }

          const uploadResult = await uploadResponse.json();

          return {
            id: assetId,
            url: uploadResult.url,
            type: file.type || "application/octet-stream",
            name: file.name,
            size: fileToUpload.size,
          };
        } catch (storageErr: any) {
          if (
            controller.signal.aborted ||
            storageErr.name === "AbortError" ||
            storageErr.message === "Upload cancelled"
          ) {
            throw new Error("Upload cancelled");
          }
          console.warn(
            "MongoDB Journal storage upload failed, attempting direct database fallback:",
            storageErr,
          );

          // Fallback if file is small enough to fit inside document directly (limit to 700KB)
          if (fileToUpload.size < 700 * 1024) {
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve) => {
              reader.onload = (e) => resolve(e.target?.result as string);
              reader.readAsDataURL(
                fileToUpload instanceof File
                  ? fileToUpload
                  : new File([fileToUpload], file.name, { type: file.type }),
              );
            });

            return {
              id: assetId,
              url: base64,
              type: file.type || "application/octet-stream",
              name: file.name,
              isBase64: true,
              size: fileToUpload.size,
            };
          }
          throw new Error(
            "File upload failed, and is too large for database fallback storage (>700KB).",
          );
        } finally {
          completedCount++;
          setUploadCurrent(completedCount);
          setUploadProgress(
            Math.round((completedCount / filesArray.length) * 100),
          );
        }
      });

      const results = await Promise.all(uploadPromises);
      const successfulAssets = results.filter(
        (asset): asset is any => asset !== null,
      );

      if (successfulAssets.length > 0) {
        setMediaAssets((prev) => [...prev, ...successfulAssets]);
        if (successfulAssets.length < filesArray.length) {
          alert(
            `Uploaded ${successfulAssets.length} of ${filesArray.length} files successfully.`,
          );
        }
      } else {
        if (!controller.signal.aborted) {
          alert(
            "Journal upload failed. Make sure files are valid and size guidelines are respected.",
          );
        }
      }
    } catch (err: any) {
      if (
        err.name === "AbortError" ||
        err.message === "Upload cancelled" ||
        controller.signal.aborted
      ) {
        console.log("Journal upload cancelled by user.");
      } else {
        console.error("Main journal upload error:", err);
        alert(
          "Failed to process journal uploads: " +
            (err.message || "Please check your network."),
        );
      }
    } finally {
      setIsUploadingAssets(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (reflectionFileInputRef.current)
        reflectionFileInputRef.current.value = "";
    }
  };

  const removeAsset = (idx: number) => {
    setMediaAssets((prev) => prev.filter((_, i) => i !== idx));
    setActivePreview(null);
  };

  const toggleDateExpansion = (date: string) => {
    setExpandedDates((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(date)) newSet.delete(date);
      else newSet.add(date);
      return newSet;
    });
  };

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!user) return;
    const journalPath = `users/${user.uid}/journal`;
    const q = query(collection(db, journalPath), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setTasks(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, journalPath);
      },
    );

    return () => unsubscribe();
  }, [user]);

  const addTask = async () => {
    if (!newTask.trim() || !user) return;
    setIsLoading(true);
    const journalPath = `users/${user.uid}/journal`;
    try {
      // Correctly parse date string as local date to avoid timezone shifts
      const [year, month, day] = selectedDate.split("-").map(Number);
      const taskDate = new Date(year, month - 1, day);

      // Set to current time for sorting within the day
      const now = new Date();
      taskDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

      await addDoc(collection(db, journalPath), {
        text: newTask,
        completed: false,
        category: selectedCategory,
        rating: 0,
        mediaAssets: mediaAssets,
        createdAt: taskDate,
        userId: user.uid,
      });
      setNewTask("");
      setMediaAssets([]);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, journalPath);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTask = async (task: any) => {
    const journalPath = `users/${user.uid}/journal`;
    try {
      await updateDoc(doc(db, journalPath, task.id), {
        completed: !task.completed,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, journalPath);
    }
  };

  const setRating = async (task: any, rating: number) => {
    const journalPath = `users/${user.uid}/journal`;
    try {
      await updateDoc(doc(db, journalPath, task.id), {
        rating: rating,
        completed: rating > 0 ? true : task.completed, // Automatically complete if rated(?) or just allow independent
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, journalPath);
    }
  };

  const saveTaskEdit = async (id: string) => {
    if (!editText.trim()) {
      setEditingTaskId(null);
      return;
    }
    const journalPath = `users/${user.uid}/journal`;
    try {
      await updateDoc(doc(db, journalPath, id), {
        text: editText,
        category: editingCategory,
      });
      setEditingTaskId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, journalPath);
    }
  };

  const deleteTask = async (id: string) => {
    const journalPath = `users/${user.uid}/journal`;
    try {
      await deleteDoc(doc(db, journalPath, id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, journalPath);
    }
  };

  const refreshReflection = () => {
    setReflectionText("");
    setMediaAssets([]);
  };

  const saveReflection = async () => {
    if (!user || !reflectionText.trim()) return;

    // Clear immediately for better UX
    const currentText = reflectionText;
    const currentAssets = [...mediaAssets];

    setReflectionText("");
    setMediaAssets([]);
    setActivePreview(null);

    setIsSavingReflection(true);
    const journalPath = `users/${user.uid}/journal`;
    try {
      const [year, month, day] = selectedDate.split("-").map(Number);
      const reflectionDate = new Date(year, month - 1, day);

      // Use current time for sorting within the day
      const now = new Date();
      reflectionDate.setHours(
        now.getHours(),
        now.getMinutes(),
        now.getSeconds(),
      );

      await addDoc(collection(db, journalPath), {
        text: currentText,
        type: "reflection",
        mediaAssets: currentAssets,
        createdAt: reflectionDate,
        userId: user.uid,
        completed: true,
        category: "Reflection",
      });

      // Automatically focus and show the saved note under specific date in history tab
      setActiveTab("history");

      // Format the date exactly how the history section groups the entries
      const dateStr = reflectionDate
        .toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
        .toUpperCase();

      // Expand that date group so the user can see their note immediately!
      setExpandedDates((prev) => {
        const nextSet = new Set(prev);
        nextSet.add(dateStr);
        return nextSet;
      });
    } catch (err) {
      // Restore on error
      setReflectionText(currentText);
      setMediaAssets(currentAssets);
      handleFirestoreError(err, OperationType.WRITE, journalPath);
    } finally {
      setIsSavingReflection(false);
    }
  };

  // --- Analytics Data Processing ---
  const analyticsData = useMemo(() => {
    const dailyData: {
      [key: string]: {
        date: string;
        completed: number;
        pending: number;
        total: number;
        timestamp: number;
      };
    } = {};

    // Last 7 days
    const last7Days = [...Array(7)]
      .map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toLocaleDateString(undefined, { weekday: "short" });
        const fullDate = d.toDateString();
        return { dateStr, fullDate, timestamp: d.getTime() };
      })
      .reverse();

    last7Days.forEach((day) => {
      dailyData[day.fullDate] = {
        date: day.dateStr,
        completed: 0,
        pending: 0,
        total: 0,
        timestamp: day.timestamp,
      };
    });

    tasks.forEach((task) => {
      if (!task.createdAt) return;
      const date = task.createdAt.toDate().toDateString();
      if (dailyData[date]) {
        dailyData[date].total += 1;
        if (task.completed) dailyData[date].completed += 1;
        else dailyData[date].pending += 1;
      }
    });

    // Category Breakdown Calculation
    const categoryStats: {
      [key: string]: { completed: number; total: number };
    } = {};
    CATEGORIES.forEach(
      (c) => (categoryStats[c.name] = { completed: 0, total: 0 }),
    );

    tasks.forEach((task) => {
      const cat = task.category || "Personal";
      if (categoryStats[cat]) {
        categoryStats[cat].total++;
        if (task.completed) categoryStats[cat].completed++;
      }
    });

    return {
      daily: Object.values(dailyData).sort((a, b) => a.timestamp - b.timestamp),
      categories: Object.entries(categoryStats).map(([name, stats]) => ({
        name,
        ...stats,
        percentage:
          stats.total > 0
            ? Math.round((stats.completed / stats.total) * 100)
            : 0,
      })),
    };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesSearch = task.text
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesCategory =
        filterCategory === "All" || task.category === filterCategory;
      const matchesStatus =
        filterStatus === "All" ||
        (filterStatus === "Done" ? task.completed : !task.completed);
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [tasks, searchQuery, filterCategory, filterStatus]);

  // --- Renderers ---
  const renderStars = (task: any) => (
    <div className="flex items-center gap-0.5 ml-auto">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => setRating(task, star)}
          className={`p-0.5 transition-all hover:scale-125 ${star <= (task.rating || 0) ? "text-yellow-400 fill-yellow-400 scale-110" : "text-gray-300 hover:text-yellow-200"}`}
        >
          <Star
            className={`w-3.5 h-3.5 ${star <= (task.rating || 0) ? "drop-shadow-[0_0_10px_rgba(250,204,21,0.6)] fill-current" : ""}`}
          />
        </button>
      ))}
    </div>
  );

  const [viewYear, viewMonth, viewDay] = selectedDate.split("-").map(Number);
  const viewingDateStr = new Date(
    viewYear,
    viewMonth - 1,
    viewDay,
  ).toDateString();
  const selectedDateTasks = filteredTasks.filter(
    (t) => t.createdAt?.toDate().toDateString() === viewingDateStr,
  );

  const otherTasks = useMemo(() => {
    return tasks.filter((t) => {
      const matchesSearch = t.text
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesCategory =
        filterCategory === "All" || t.category === filterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [tasks, searchQuery, filterCategory]);

  // Group tasks by date with robust sorting
  const historyGroups = useMemo(() => {
    const groups: {
      [key: string]: { date: string; tasks: any[]; timestamp: number };
    } = {};

    // Group all filtered tasks (including reflections) by date
    otherTasks.forEach((task) => {
      if (!task.createdAt) return;
      const dateObj = task.createdAt.toDate();
      const dateStr = dateObj
        .toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
        .toUpperCase();

      if (!groups[dateStr]) {
        // Normalize to start of day for stable sorting grouping
        const dayStart = new Date(
          dateObj.getFullYear(),
          dateObj.getMonth(),
          dateObj.getDate(),
        ).getTime();
        groups[dateStr] = { date: dateStr, tasks: [], timestamp: dayStart };
      }
      groups[dateStr].tasks.push(task);
    });

    // Sort groups by date descending, and tasks within groups by time descending
    return Object.values(groups)
      .sort((a, b) => b.timestamp - a.timestamp)
      .map((group) => ({
        ...group,
        tasks: group.tasks.sort(
          (a, b) =>
            b.createdAt.toDate().getTime() - a.createdAt.toDate().getTime(),
        ),
      }));
  }, [otherTasks]);

  const clearHistory = async () => {
    if (
      !user ||
      !window.confirm(
        "Are you sure you want to clear your entire history? This cannot be undone.",
      )
    )
      return;
    setIsLoading(true);
    const journalPath = `users/${user.uid}/journal`;
    try {
      const batchSize = 500;
      const q = query(collection(db, journalPath));
      const snapshot = await getDocs(q);

      for (let i = 0; i < snapshot.docs.length; i += batchSize) {
        const batch = writeBatch(db);
        snapshot.docs.slice(i, i + batchSize).forEach((doc) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
      }
    } catch (err) {
      console.error("Error clearing history:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const clearDayHistory = async (dateStr: string, dayTasks: any[]) => {
    if (!user || !window.confirm(`Clear all history for ${dateStr}?`)) return;
    setIsLoading(true);
    const journalPath = `users/${user.uid}/journal`;
    try {
      const batch = writeBatch(db);

      dayTasks.forEach((task) => {
        batch.delete(doc(db, journalPath, task.id));
      });

      await batch.commit();
    } catch (err) {
      console.error("Error clearing day history:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-white z-[60] flex flex-col overflow-hidden">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`flex flex-col relative w-full h-full ${activeTab === "analytics" ? "overflow-y-auto bg-gray-950" : "overflow-hidden bg-white"}`}
      >
        <div
          className={`p-4 sm:p-10 pb-4 sm:pb-6 flex flex-col gap-4 sm:gap-8 flex-shrink-0 ${activeTab === "analytics" ? "bg-gray-900 border-b border-white/5" : "bg-gradient-to-b from-emerald-50/50 to-transparent"}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-5">
              <div
                className={`w-12 h-12 sm:w-16 sm:h-16 rounded-[16px] sm:rounded-[24px] flex items-center justify-center text-white shadow-xl ${activeTab === "analytics" ? "bg-brand shadow-brand/20" : "bg-emerald-500 shadow-emerald-500/20"}`}
              >
                {activeTab === "analytics" ? (
                  <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8" />
                ) : (
                  <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8" />
                )}
              </div>
              <div>
                <h2
                  className={`font-serif text-2xl sm:text-4xl tracking-tight leading-none mb-1 sm:mb-2 ${activeTab === "analytics" ? "text-white" : "text-gray-900"}`}
                >
                  My Journal
                </h2>
                <p
                  className={`font-bold uppercase tracking-widest text-[9px] sm:text-[10px] ${activeTab === "analytics" ? "text-gray-400" : "text-gray-500"}`}
                >
                  Insights & Personal Journal
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className={`p-2 sm:p-3 rounded-2xl transition-all border ${activeTab === "analytics" ? "bg-white/5 border-white/10 text-gray-400 hover:text-white" : "bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-gray-900 border-gray-100"}`}
            >
              <X className="w-5 h-5 sm:w-7 sm:h-7" />
            </button>
          </div>

          <div
            className={`p-1 sm:p-1.5 flex items-center justify-between sm:justify-start gap-1 w-full sm:w-auto backdrop-blur-sm rounded-xl sm:rounded-3xl ${activeTab === "analytics" ? "bg-white/5" : "bg-gray-100/50"}`}
          >
            <div className="relative flex-1 sm:flex-initial">
              <button
                onClick={() => setActiveTab("today")}
                className={`w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 sm:px-6 py-2 sm:py-2.5 rounded-lg sm:rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-wider sm:tracking-widest transition-all ${
                  activeTab === "today"
                    ? "bg-white/90 text-emerald-600 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                {selectedDate === new Date().toISOString().split("T")[0]
                  ? "Today"
                  : new Date(selectedDate).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
              </button>
              {activeTab === "today" && (
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  title="Change Date"
                />
              )}
            </div>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 sm:px-6 py-2 sm:py-2.5 rounded-lg sm:rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-wider sm:tracking-widest transition-all ${
                activeTab === "history"
                  ? "bg-white/90 text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <History className="w-3.5 h-3.5" />
              History
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 sm:px-6 py-2 sm:py-2.5 rounded-lg sm:rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-wider sm:tracking-widest transition-all ${
                activeTab === "analytics"
                  ? "bg-brand text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Analytics
            </button>
          </div>
        </div>

        {/* Content Section */}
        <div
          className={`px-4 sm:px-10 pb-6 sm:pb-10 custom-scrollbar ${activeTab === "analytics" ? "" : "flex-1 overflow-y-auto"}`}
        >
          <AnimatePresence mode="wait">
            {activeTab === "today" && (
              <motion.div
                key="tab-today"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {/* Advanced Add Task Panel */}
                <div className="bg-gray-950 p-4 sm:p-5 rounded-[24px] border border-white/10 shadow-2xl space-y-3">
                  <div className="flex flex-col lg:flex-row gap-3">
                    <div className="flex-1 relative group">
                      <div className="absolute inset-y-0 left-5 flex items-center text-emerald-500">
                        <Plus className="w-5 h-5" />
                      </div>
                      <input
                        type="text"
                        placeholder="Add multiple task"
                        value={newTask}
                        onChange={(e) => setNewTask(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addTask()}
                        className="w-full bg-white/5 border border-white/10 rounded-[18px] py-3.5 pl-12 pr-4 focus:ring-4 focus:ring-emerald-500/20 focus:bg-white/10 transition-all outline-none text-sm font-medium text-white placeholder:text-gray-500"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingAssets}
                        className="p-2.5 bg-white/10 border border-white/20 rounded-[16px] text-emerald-400 hover:bg-white/20 transition-all disabled:opacity-50"
                        title="Add Attachments"
                      >
                        {isUploadingAssets ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Paperclip className="w-4 h-4" />
                        )}
                      </button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        multiple
                        onChange={(e) => handleFileChange(e, "task")}
                      />
                      <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="flex-1 lg:flex-initial bg-white/10 border border-white/20 rounded-[16px] px-4 py-2.5 text-xs font-bold text-white outline-none focus:ring-2 focus:ring-emerald-500/30 cursor-pointer appearance-none hover:bg-white/20 transition-colors"
                      >
                        {CATEGORIES.map((c) => (
                          <option
                            key={c.name}
                            value={c.name}
                            className="bg-gray-900 text-white"
                          >
                            {c.name}
                          </option>
                        ))}
                      </select>

                      <div className="relative flex-1 lg:flex-initial min-w-[100px]">
                        <input
                          type="date"
                          value={selectedDate}
                          onChange={(e) => setSelectedDate(e.target.value)}
                          className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-[16px] font-bold text-xs text-white outline-none focus:ring-2 focus:ring-emerald-500/30 cursor-pointer hover:bg-white/20 transition-colors appearance-none"
                        />
                        <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-emerald-400 pointer-events-none" />
                      </div>

                      <button
                        onClick={addTask}
                        disabled={
                          isLoading || isUploadingAssets || !newTask.trim()
                        }
                        className="w-full lg:w-auto h-[42px] px-6 bg-emerald-500 text-white rounded-[16px] font-black text-[10px] uppercase tracking-[0.15em] hover:bg-emerald-600 transition-all hover:shadow-xl hover:shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isUploadingAssets ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          "ADD TASK"
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-2">
                    <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">
                      Press <span className="text-emerald-500/80">Enter ↵</span>{" "}
                      to add
                    </p>
                    <div className="h-px flex-1 bg-white/5" />
                  </div>

                  {/* Progress bar for Journal task uploads */}
                  {isUploadingAssets && activeTab === "today" && (
                    <div className="bg-white/5 border border-white/10 p-3.5 rounded-2xl space-y-2 mx-2">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase text-emerald-300 tracking-wider">
                        <span className="flex items-center gap-1.5">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Uploading {uploadCurrent} of {uploadTotal} file(s)
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleCancelUpload}
                            className="text-[9px] bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold px-2 py-0.5 rounded border border-red-500/20 transition-colors uppercase tracking-wider"
                          >
                            Cancel
                          </button>
                          <span>{uploadProgress}%</span>
                        </div>
                      </div>
                      <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-emerald-400 h-full rounded-full transition-all duration-300 ease-out animate-pulse"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {mediaAssets.length > 0 && activeTab === "today" && (
                    <div className="space-y-3 px-2 pb-2">
                      <div className="flex flex-wrap gap-2">
                        {mediaAssets.map((asset, idx) => (
                          <div
                            key={asset.id || idx}
                            className={`relative group/asset cursor-pointer transition-all ${activePreview === idx ? "ring-2 ring-emerald-400 rounded-xl" : ""}`}
                            onClick={() => setActivePreview(idx)}
                          >
                            <div className="px-3 py-1.5 bg-white/10 border border-white/20 rounded-xl flex items-center gap-2 hover:bg-white/15 transition-all">
                              {asset.type?.startsWith("image/") ? (
                                <ImageIcon className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <FileText className="w-3 h-3 text-blue-400" />
                              )}
                              <span className="text-[10px] font-medium text-white/70 max-w-[100px] truncate">
                                {asset.name}
                              </span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeAsset(idx);
                              }}
                              className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/asset:opacity-100 transition-opacity shadow-md"
                            >
                              <X className="w-2 h-2" />
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Display asset preview right beneath the row of attachments */}
                      {activePreview !== null && mediaAssets[activePreview] && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-4 relative"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] uppercase font-bold text-emerald-400 tracking-widest">
                              Selected Media Detail
                            </span>
                            <button
                              onClick={() => setActivePreview(null)}
                              className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-all animate-fade-in"
                            >
                              <X className="w-4.5 h-4.5" />
                            </button>
                          </div>

                          <div className="flex flex-col items-center justify-center min-h-[120px] bg-black/20 rounded-xl p-4 border border-white/5">
                            {mediaAssets[activePreview].type?.startsWith(
                              "image/",
                            ) ? (
                              <img
                                src={mediaAssets[activePreview].url}
                                alt="Attachment Preview"
                                className="max-h-[160px] object-contain rounded-lg shadow-inner cursor-zoom-in"
                                onClick={() =>
                                  handleViewFile(mediaAssets[activePreview].url)
                                }
                              />
                            ) : mediaAssets[activePreview].type?.startsWith(
                                "video/",
                              ) ? (
                              <video
                                src={mediaAssets[activePreview].url}
                                controls
                                className="max-h-[160px] rounded-lg"
                              />
                            ) : mediaAssets[activePreview].type?.startsWith(
                                "audio/",
                              ) ? (
                              <audio
                                src={mediaAssets[activePreview].url}
                                controls
                                className="w-full"
                              />
                            ) : (
                              <div className="flex flex-col items-center gap-2 text-center p-1">
                                <FileText className="w-10 h-10 text-emerald-400" />
                                <div>
                                  <p className="text-[11px] font-bold text-white/90 truncate max-w-[200px]">
                                    {mediaAssets[activePreview].name}
                                  </p>
                                  <p className="text-[8px] text-white/40 uppercase font-bold">
                                    {mediaAssets[activePreview].size
                                      ? `${(mediaAssets[activePreview].size / (1024 * 1024)).toFixed(2)} MB`
                                      : "DOCUMENT FILE"}
                                  </p>
                                </div>
                                <button
                                  onClick={() =>
                                    handleViewFile(
                                      mediaAssets[activePreview].url,
                                    )
                                  }
                                  className="mt-2 text-[10px] font-black text-emerald-300 hover:underline px-2.5 py-1.5 bg-white/5 rounded-lg border border-white/5"
                                >
                                  Open File URL
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Actions row located just below */}
                          <div className="flex justify-center gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                handleViewFile(mediaAssets[activePreview].url)
                              }
                              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-colors border border-emerald-500/20 shadow-md"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View Full File
                            </button>
                            <button
                              type="button"
                              onClick={() => removeAsset(activePreview)}
                              className="flex items-center gap-1.5 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-colors border border-red-500/25 shadow-md"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Remove Media File
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  )}
                </div>

                {/* Filter Bar */}
                <div className="bg-gray-50/50 p-4 rounded-3xl border border-gray-100 flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
                  <div className="relative w-full md:w-64 group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-emerald-500 transition-colors" />
                    <input
                      type="text"
                      placeholder="Search tasks..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-white border-2 border-indigo-500 rounded-2xl py-2.5 pl-11 pr-4 text-xs font-bold text-gray-900 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 transition-all shadow-sm"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 p-1 bg-white border border-gray-100 rounded-2xl overflow-x-auto max-w-full no-scrollbar">
                    {["All", ...CATEGORIES.map((c) => c.name)].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setFilterCategory(cat)}
                        className={`shrink-0 px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                          filterCategory === cat
                            ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 scale-105"
                            : "text-gray-400 hover:bg-gray-50"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5 w-full md:w-auto md:ml-auto overflow-x-auto no-scrollbar justify-between md:justify-start">
                    {["All", "Pending", "Done"].map((status) => (
                      <button
                        key={status}
                        onClick={() => setFilterStatus(status)}
                        className={`flex-1 md:flex-none px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                          filterStatus === status
                            ? "bg-gray-900 text-white border-transparent"
                            : "bg-white border-gray-200 text-gray-400 hover:border-gray-300"
                        }`}
                      >
                        {status === "Done" && (
                          <Check className="w-3 h-3 inline mr-1" />
                        )}
                        {status}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {selectedDateTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center opacity-30">
                      <ListTodo className="w-16 h-16 mb-4 text-emerald-200" />
                      <h4 className="text-xl font-serif text-gray-900">
                        No matching tasks
                      </h4>
                    </div>
                  ) : (
                    selectedDateTasks.map((task) => {
                      const isReflection = task.type === "reflection";
                      const category = isReflection
                        ? {
                            name: "Note",
                            icon: MessageSquare,
                            color: "text-amber-500",
                            bg: "bg-amber-50",
                            border: "border-amber-100",
                          }
                        : CATEGORIES.find(
                            (c) => c.name === (task.category || "Personal"),
                          ) || CATEGORIES[3];
                      const Icon = category.icon;

                      return (
                        <motion.div
                          layout
                          key={task.id}
                          className={`group flex items-center gap-4 p-4 rounded-[24px] border transition-all ${
                            isReflection
                              ? "bg-amber-50/20 border-amber-100"
                              : task.completed
                                ? "bg-emerald-50/20 border-emerald-100 opacity-60"
                                : "bg-white border-gray-100 shadow-sm hover:shadow-lg hover:shadow-emerald-500/5"
                          }`}
                        >
                          {!isReflection && (
                            <button
                              onClick={() => toggleTask(task)}
                              className={`w-7 h-7 rounded-[10px] border-2 flex items-center justify-center transition-all ${
                                task.completed
                                  ? "bg-emerald-500 border-emerald-500 text-white scale-110"
                                  : "border-gray-200 hover:border-emerald-500 group-hover:scale-110"
                              }`}
                            >
                              {task.completed && (
                                <Check className="w-4 h-4 stroke-[3.5px]" />
                              )}
                            </button>
                          )}

                          {isReflection && (
                            <div className="w-7 h-7 rounded-[10px] bg-amber-500 flex items-center justify-center text-white scale-110 shadow-lg shadow-amber-500/20">
                              <MessageSquare className="w-4 h-4" />
                            </div>
                          )}

                          <div className="flex-1">
                            {editingTaskId === task.id ? (
                              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                                <input
                                  autoFocus
                                  value={editText}
                                  onChange={(e) => setEditText(e.target.value)}
                                  onKeyDown={(e) =>
                                    e.key === "Enter" && saveTaskEdit(task.id)
                                  }
                                  className="flex-1 text-base font-bold text-gray-900 bg-gray-50 border-2 border-emerald-100 rounded-xl px-3 py-1.5 outline-none focus:ring-2 focus:ring-emerald-500/20 w-full"
                                />
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                  <select
                                    value={editingCategory}
                                    onChange={(e) =>
                                      setEditingCategory(e.target.value)
                                    }
                                    className="bg-gray-50 border-2 border-emerald-100 rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer flex-1 sm:flex-none"
                                  >
                                    {CATEGORIES.map((c) => (
                                      <option key={c.name} value={c.name}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() => saveTaskEdit(task.id)}
                                    className="bg-emerald-500 text-white p-2 rounded-xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setEditingTaskId(null)}
                                    className="bg-gray-100 text-gray-400 p-2 rounded-xl hover:bg-gray-200 transition-all"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p
                                className={`text-base font-bold transition-all ${isReflection ? "text-amber-900 italic" : task.completed ? "text-gray-400 line-through" : "text-gray-900"}`}
                              >
                                {isReflection ? `"${task.text}"` : task.text}
                              </p>
                            )}

                            {editingTaskId !== task.id && (
                              <div className="flex flex-col gap-3 mt-1.5">
                                <div className="flex items-center gap-3">
                                  <div
                                    className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full border ${category.bg} ${category.border} ${category.color}`}
                                  >
                                    <Icon className="w-2.5 h-2.5" />
                                    <span className="text-[8px] font-black uppercase tracking-widest">
                                      {category.name}
                                    </span>
                                  </div>
                                  {!isReflection && (
                                    <>
                                      <div className="h-3 w-px bg-gray-100 mx-0.5" />
                                      {renderStars(task)}
                                    </>
                                  )}
                                </div>

                                {task.mediaAssets &&
                                  task.mediaAssets.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                      {task.mediaAssets.map(
                                        (asset: any, idx: number) => (
                                          <button
                                            key={asset.id || idx}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleViewFile(asset.url);
                                            }}
                                            className={`flex items-center gap-1.5 px-2 py-1 border rounded-lg transition-colors ${isReflection ? "bg-white border-amber-100 hover:bg-amber-50" : "bg-gray-50 border-gray-100 hover:bg-emerald-50"}`}
                                          >
                                            {asset.type?.startsWith(
                                              "image/",
                                            ) ? (
                                              <ImageIcon
                                                className={`w-3 h-3 ${isReflection ? "text-amber-500" : "text-emerald-500"}`}
                                              />
                                            ) : (
                                              <FileText className="w-3 h-3 text-blue-500" />
                                            )}
                                            <span
                                              className={`text-[9px] font-bold truncate max-w-[80px] ${isReflection ? "text-amber-800" : "text-gray-500"}`}
                                            >
                                              {asset.name}
                                            </span>
                                          </button>
                                        ),
                                      )}
                                    </div>
                                  )}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === "history" && (
              <motion.div
                key="tab-history"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-black uppercase tracking-[0.2em] text-gray-400">
                    Archived Records
                  </h3>
                  {historyGroups.length > 0 && (
                    <button
                      onClick={clearHistory}
                      className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Clear All
                    </button>
                  )}
                </div>

                {historyGroups.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center opacity-40">
                    <History className="w-20 h-20 mb-4 text-gray-200" />
                    <h4 className="text-2xl font-serif text-gray-900">
                      Archive is empty
                    </h4>
                    <p className="text-sm font-bold uppercase tracking-widest mt-2">
                      Tasks will appear here as soon as they are added
                    </p>
                  </div>
                ) : (
                  historyGroups.map(({ date, tasks: dayTasks }) => {
                    const isExpanded = expandedDates.has(date);
                    const completedCount = dayTasks.filter(
                      (t) => t.completed,
                    ).length;

                    return (
                      <div
                        key={date}
                        className="overflow-hidden border border-gray-100 rounded-[32px] bg-white transition-all group/header"
                      >
                        <button
                          onClick={() => toggleDateExpansion(date)}
                          className={`w-full flex items-center justify-between p-6 cursor-pointer transition-all ${isExpanded ? "bg-emerald-50/30" : "hover:bg-gray-50"}`}
                        >
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-3">
                              <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                              <h4 className="text-sm md:text-base font-black text-gray-400 uppercase tracking-widest">
                                {date}
                              </h4>
                            </div>
                          </div>

                          <div className="flex items-center gap-6">
                            <div className="hidden sm:flex flex-col items-end">
                              <span
                                className={`text-xs font-black uppercase tracking-widest ${completedCount === dayTasks.length ? "text-emerald-500" : "text-gray-400"}`}
                              >
                                {completedCount}/{dayTasks.length} Done
                              </span>
                              <div className="w-24 h-1 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{
                                    width: `${(completedCount / dayTasks.length) * 100}%`,
                                  }}
                                  className="h-full bg-emerald-500"
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  clearDayHistory(date, dayTasks);
                                }}
                                className="p-2 opacity-0 group-hover/header:opacity-100 hover:bg-red-100 text-red-500 rounded-xl transition-all"
                                title="Clear all for this day"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <div
                                className={`p-2 rounded-xl transition-all ${isExpanded ? "rotate-90 bg-emerald-100 text-emerald-600" : "text-gray-300"}`}
                              >
                                <ChevronRight className="w-5 h-5" />
                              </div>
                            </div>
                          </div>
                        </button>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="px-6 pb-6 pt-2">
                                <div className="h-px bg-gray-100 mb-6" />

                                <div className="grid grid-cols-1 gap-4">
                                  {dayTasks.map((task) => {
                                    const isReflection =
                                      task.type === "reflection";
                                    const category = isReflection
                                      ? {
                                          name: "Note",
                                          icon: MessageSquare,
                                          color: "text-amber-500",
                                          bg: "bg-amber-50",
                                          border: "border-amber-100",
                                        }
                                      : CATEGORIES.find(
                                          (c) =>
                                            c.name ===
                                            (task.category || "Personal"),
                                        ) || CATEGORIES[3];
                                    const CategoryIcon = category.icon;

                                    return (
                                      <div
                                        key={task.id}
                                        className={`group flex items-center justify-between p-5 rounded-[28px] border transition-all ${
                                          isReflection
                                            ? "bg-amber-50/10 border-amber-50"
                                            : task.completed
                                              ? "bg-emerald-50/10 border-emerald-50 opacity-80"
                                              : "bg-white shadow-sm hover:shadow-md"
                                        }`}
                                      >
                                        <div className="flex-1 min-w-0 pr-4 flex items-center gap-4">
                                          <div
                                            className={`w-10 h-10 rounded-2xl flex items-center justify-center ${category.bg} ${category.color} ${category.border} border`}
                                          >
                                            <CategoryIcon className="w-5 h-5" />
                                          </div>
                                          <div className="flex-1">
                                            {editingTaskId === task.id ? (
                                              <div className="flex flex-col gap-3 w-full">
                                                {isReflection ? (
                                                  <textarea
                                                    autoFocus
                                                    rows={3}
                                                    value={editText}
                                                    onChange={(e) =>
                                                      setEditText(
                                                        e.target.value,
                                                      )
                                                    }
                                                    className="w-full text-base font-medium text-gray-950 bg-gray-50 border-2 border-emerald-100 rounded-2xl p-3 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/50 transition-all resize-y font-normal"
                                                  />
                                                ) : (
                                                  <input
                                                    autoFocus
                                                    value={editText}
                                                    onChange={(e) =>
                                                      setEditText(
                                                        e.target.value,
                                                      )
                                                    }
                                                    onKeyDown={(e) =>
                                                      e.key === "Enter" &&
                                                      saveTaskEdit(task.id)
                                                    }
                                                    className="w-full text-base font-bold text-gray-900 bg-gray-50 border-2 border-emerald-100 rounded-xl px-3 py-2 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/50 transition-all"
                                                  />
                                                )}
                                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                                  {!isReflection ? (
                                                    <select
                                                      value={editingCategory}
                                                      onChange={(e) =>
                                                        setEditingCategory(
                                                          e.target.value,
                                                        )
                                                      }
                                                      className="bg-gray-50 border-2 border-emerald-100 rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer text-gray-700"
                                                    >
                                                      {CATEGORIES.map((c) => (
                                                        <option
                                                          key={c.name}
                                                          value={c.name}
                                                        >
                                                          {c.name}
                                                        </option>
                                                      ))}
                                                    </select>
                                                  ) : (
                                                    <div />
                                                  )}
                                                  <div className="flex items-center gap-2">
                                                    <button
                                                      onClick={() =>
                                                        saveTaskEdit(task.id)
                                                      }
                                                      className="bg-emerald-500 text-white px-3 py-1.5 rounded-xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center font-bold text-xs"
                                                    >
                                                      <Check className="w-4 h-4 mr-1 stroke-[3px]" />{" "}
                                                      Save
                                                    </button>
                                                    <button
                                                      onClick={() =>
                                                        setEditingTaskId(null)
                                                      }
                                                      className="px-3 py-1.5 text-gray-500 hover:text-red-500 rounded-xl hover:bg-red-50 transition-all border border-gray-100 bg-white font-bold text-xs"
                                                    >
                                                      <X className="w-4 h-4 mr-1" />{" "}
                                                      Cancel
                                                    </button>
                                                  </div>
                                                </div>
                                              </div>
                                            ) : (
                                              <>
                                                <div className="flex items-center gap-2 mb-1">
                                                  <span
                                                    className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${category.bg} ${category.border} ${category.color}`}
                                                  >
                                                    {category.name}
                                                  </span>
                                                  {!isReflection &&
                                                    renderStars(task)}
                                                </div>
                                                <p
                                                  className={`text-base font-bold leading-snug whitespace-pre-wrap ${isReflection ? "text-amber-900 font-serif font-normal italic" : task.completed ? "text-gray-400 line-through" : "text-gray-800"}`}
                                                >
                                                  {isReflection
                                                    ? `"${task.text}"`
                                                    : task.text}
                                                </p>
                                              </>
                                            )}
                                            {task.mediaAssets &&
                                              task.mediaAssets.length > 0 && (
                                                <div className="flex flex-wrap gap-2 mt-3">
                                                  {task.mediaAssets.map(
                                                    (
                                                      asset: any,
                                                      idx: number,
                                                    ) => (
                                                      <button
                                                        key={asset.id || idx}
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          handleViewFile(
                                                            asset.url,
                                                          );
                                                        }}
                                                        className={`flex items-center gap-1.5 px-2 py-1 border rounded-lg transition-colors ${isReflection ? "bg-white border-amber-100 hover:bg-amber-50" : "bg-gray-50 border-gray-100 hover:bg-emerald-50"}`}
                                                      >
                                                        {asset.type?.startsWith(
                                                          "image/",
                                                        ) ? (
                                                          <ImageIcon
                                                            className={`w-3 h-3 ${isReflection ? "text-amber-500" : "text-emerald-500"}`}
                                                          />
                                                        ) : (
                                                          <FileText className="w-3 h-3 text-blue-500" />
                                                        )}
                                                        <span
                                                          className={`text-[9px] font-bold max-w-[100px] truncate ${isReflection ? "text-amber-800" : "text-gray-500"}`}
                                                        >
                                                          {asset.name}
                                                        </span>
                                                      </button>
                                                    ),
                                                  )}
                                                </div>
                                              )}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {editingTaskId !== task.id &&
                                            isReflection && (
                                              <>
                                                <button
                                                  onClick={() => {
                                                    setEditingTaskId(task.id);
                                                    setEditText(task.text);
                                                    setEditingCategory(
                                                      task.category ||
                                                        (isReflection
                                                          ? "Reflection"
                                                          : "Personal"),
                                                    );
                                                  }}
                                                  className="p-3 text-gray-300 hover:text-emerald-500 hover:bg-emerald-50 rounded-2xl transition-all"
                                                >
                                                  <Edit3 className="w-5 h-5" />
                                                </button>
                                                <button
                                                  onClick={() =>
                                                    deleteTask(task.id)
                                                  }
                                                  className="p-3 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"
                                                >
                                                  <Trash2 className="w-5 h-5 text-gray-400" />
                                                </button>
                                              </>
                                            )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })
                )}
              </motion.div>
            )}

            {activeTab === "analytics" && (
              <motion.div
                key="tab-analytics"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="space-y-10"
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Chart 1: Bar Chart */}
                  <div className="bg-gray-900/40 p-8 rounded-[40px] border border-white/5">
                    <div className="mb-6">
                      <h3 className="text-2xl font-serif text-white">
                        Daily Volume
                      </h3>
                      <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] mt-1">
                        Tasks per Day
                      </p>
                    </div>
                    <div className="h-[360px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={analyticsData.daily}
                          margin={{ top: 10, right: 30, left: 0, bottom: 20 }}
                          barCategoryGap="20%"
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke="#ffffff08"
                          />
                          <XAxis
                            dataKey="date"
                            axisLine={false}
                            tickLine={false}
                            tick={{
                              fill: "#6B7280",
                              fontSize: 10,
                              fontWeight: 800,
                            }}
                            dy={15}
                          />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{
                              fill: "#6B7280",
                              fontSize: 10,
                              fontWeight: 800,
                            }}
                          />
                          <Tooltip
                            cursor={{ fill: "rgba(255,255,255,0.03)" }}
                            contentStyle={{
                              backgroundColor: "#1F2937",
                              border: "1px solid rgba(255,255,255,0.05)",
                              borderRadius: "16px",
                              fontSize: "11px",
                              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
                            }}
                          />
                          <Legend
                            verticalAlign="top"
                            align="right"
                            iconType="circle"
                            wrapperStyle={{
                              paddingBottom: "20px",
                              fontSize: "10px",
                            }}
                            formatter={(value) => (
                              <span className="text-[10px] font-black uppercase tracking-widest ml-1 text-gray-500">
                                {value}
                              </span>
                            )}
                          />
                          <Bar
                            dataKey="completed"
                            fill="#10B981"
                            radius={[8, 8, 0, 0]}
                            name="Completed"
                            barSize={32}
                          />
                          <Bar
                            dataKey="pending"
                            fill="#8B5CF6"
                            radius={[8, 8, 0, 0]}
                            name="Pending"
                            barSize={32}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Chart 2: Line Chart */}
                  <div className="bg-gray-900/40 p-8 rounded-[40px] border border-white/5">
                    <div className="mb-6">
                      <h3 className="text-2xl font-serif text-white">
                        Completion Flow
                      </h3>
                      <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] mt-1">
                        7-Day Trajectory
                      </p>
                    </div>
                    <div className="h-[360px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={analyticsData.daily}
                          margin={{ top: 10, right: 30, left: 0, bottom: 20 }}
                        >
                          <defs>
                            <linearGradient
                              id="colorCompleted"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="5%"
                                stopColor="#10B981"
                                stopOpacity={0.3}
                              />
                              <stop
                                offset="95%"
                                stopColor="#10B981"
                                stopOpacity={0}
                              />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke="#ffffff08"
                          />
                          <XAxis
                            dataKey="date"
                            axisLine={false}
                            tickLine={false}
                            tick={{
                              fill: "#6B7280",
                              fontSize: 10,
                              fontWeight: 800,
                            }}
                            dy={15}
                          />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{
                              fill: "#6B7280",
                              fontSize: 10,
                              fontWeight: 800,
                            }}
                          />
                          <Tooltip
                            cursor={false}
                            contentStyle={{
                              backgroundColor: "#1F2937",
                              border: "1px solid rgba(255,255,255,0.05)",
                              borderRadius: "16px",
                              fontSize: "11px",
                              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="completed"
                            stroke="#10B981"
                            strokeWidth={4}
                            fillOpacity={1}
                            fill="url(#colorCompleted)"
                            dot={{ r: 6, fill: "#10B981", strokeWidth: 0 }}
                            activeDot={{
                              r: 8,
                              fill: "#10B981",
                              strokeWidth: 4,
                              stroke: "rgba(255,255,255,0.1)",
                            }}
                            name="Completed"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                  <div className="bg-white/5 p-4 rounded-[24px] border border-white/5 flex flex-col items-center text-center backdrop-blur-md">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500 mb-1">
                      Consistency
                    </p>
                    <h5 className="text-2xl font-serif text-emerald-400">
                      {Math.round(
                        (tasks.filter((t) => t.completed).length /
                          (tasks.length || 1)) *
                          100,
                      )}
                      %
                    </h5>
                    <p className="text-[9px] text-gray-400 font-bold mt-1 uppercase tracking-tight opacity-50">
                      Avg. Check-in
                    </p>
                  </div>
                  <div className="bg-white/5 p-4 rounded-[24px] border border-white/5 flex flex-col items-center text-center backdrop-blur-md">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500 mb-1">
                      High Performers
                    </p>
                    <h5 className="text-2xl font-serif text-brand">
                      {tasks.filter((t) => (t.rating || 0) >= 4).length}
                    </h5>
                    <p className="text-[9px] text-gray-400 font-bold mt-1 uppercase tracking-tight opacity-50">
                      Excellent Reviews
                    </p>
                  </div>
                  <div className="bg-white/5 p-4 rounded-[24px] border border-white/5 flex flex-col items-center text-center backdrop-blur-md">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500 mb-1">
                      Total Output
                    </p>
                    <h5 className="text-2xl font-serif text-emerald-500">
                      {tasks.filter((t) => t.completed).length}
                    </h5>
                    <p className="text-[9px] text-gray-400 font-bold mt-1 uppercase tracking-tight opacity-50">
                      Completed Tasks
                    </p>
                  </div>
                </div>

                {/* Category Breakdown Progress Bars - More Compact and Centered */}
                <div className="bg-gray-900/60 p-8 rounded-[32px] shadow-2xl max-w-md mx-auto w-full border border-white/5 mt-4">
                  <div className="text-center mb-8">
                    <h3 className="text-xl font-serif text-white mb-1">
                      Category Statistics
                    </h3>
                    <p className="text-gray-500 text-[9px] font-black uppercase tracking-[0.2em]">
                      Mastery Distribution
                    </p>
                  </div>
                  <div className="space-y-6">
                    {analyticsData.categories.map((cat) => {
                      const category = CATEGORIES.find(
                        (c) => c.name === cat.name,
                      )!;
                      const Icon = category.icon;
                      return (
                        <div key={cat.name} className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div
                                className={`p-1.5 rounded-lg bg-white/5 border border-white/10 ${category.color}`}
                              >
                                <Icon className="w-4 h-4" />
                              </div>
                              <span className="text-sm font-bold text-white tracking-tight">
                                {cat.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[9px] font-black uppercase tracking-[0.1em]">
                              <span className="text-emerald-400/80">
                                {cat.completed} Done
                              </span>
                              <span className="text-gray-500">
                                {cat.total} Total
                              </span>
                            </div>
                          </div>
                          <div className="relative h-2 w-full bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              whileInView={{ width: `${cat.percentage}%` }}
                              transition={{ duration: 1.2, ease: "circOut" }}
                              className={`h-full ${category.dot} relative`}
                            >
                              <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-30" />
                            </motion.div>
                          </div>
                          <div className="flex justify-between items-center px-1">
                            <p
                              className={`text-[9px] font-black uppercase tracking-[0.1em] ${category.color} opacity-80`}
                            >
                              {cat.percentage}% Mastery
                            </p>
                            {cat.total - cat.completed > 0 && (
                              <span className="text-[8px] text-gray-600 font-bold uppercase tracking-widest">
                                {cat.total - cat.completed} pending
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Daily Journal / Feedback Box - Moved to Bottom */}
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-10 rounded-[48px] shadow-2xl shadow-emerald-500/20 relative overflow-hidden group mt-10">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl group-hover:scale-125 transition-transform duration-1000" />

                  <div className="relative z-10 flex flex-col md:flex-row gap-10 items-start">
                    <div className="flex-1 space-y-6">
                      <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full mb-4">
                          <Sparkles className="w-3 h-3 text-emerald-200" />
                          <span className="text-[9px] font-black uppercase tracking-widest text-white/90">
                            Personal Insights
                          </span>
                        </div>
                        <h3 className="text-4xl font-serif text-white leading-tight">
                          How was your day?
                        </h3>
                        <p className="text-emerald-100/70 text-sm font-medium mt-3 max-w-sm">
                          Capture your thoughts, mood, or a quick summary. This
                          will be saved privately in your daily history.
                        </p>
                      </div>

                      <div className="relative group/input">
                        <textarea
                          value={reflectionText}
                          onChange={(e) => setReflectionText(e.target.value)}
                          placeholder="Type everything here... Use emojis to express your mood! 🎨✨"
                          className="w-full bg-black/20 border border-white/20 rounded-[32px] p-6 text-white placeholder:text-white/30 outline-none focus:ring-4 focus:ring-white/10 transition-all min-h-[160px] resize-none font-medium text-lg leading-relaxed"
                        />
                        <div className="absolute bottom-4 right-6 flex items-center gap-3">
                          <button
                            onClick={() =>
                              reflectionFileInputRef.current?.click()
                            }
                            disabled={isUploadingAssets}
                            className="p-2 bg-white/10 rounded-full text-emerald-300 hover:bg-white/20 transition-all shadow-lg disabled:opacity-50"
                            title="Attach Media to Note"
                          >
                            {isUploadingAssets ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Paperclip className="w-4 h-4" />
                            )}
                          </button>
                          <input
                            type="file"
                            ref={reflectionFileInputRef}
                            className="hidden"
                            multiple
                            onChange={(e) => handleFileChange(e, "reflection")}
                          />
                          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                            Supports Emojis & Media
                          </span>
                          <div className="w-1 h-1 rounded-full bg-white/20" />
                        </div>
                      </div>

                      {/* Progress bar for Reflection uploads */}
                      {isUploadingAssets && activeTab === "analytics" && (
                        <div className="bg-black/15 border border-white/10 p-3.5 rounded-2xl space-y-2">
                          <div className="flex justify-between items-center text-[10px] font-black uppercase text-emerald-300 tracking-wider">
                            <span className="flex items-center gap-1.5">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Uploading {uploadCurrent} of {uploadTotal} file(s)
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={handleCancelUpload}
                                className="text-[9px] bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold px-2 py-0.5 rounded border border-red-500/20 transition-colors uppercase tracking-wider"
                              >
                                Cancel
                              </button>
                              <span>{uploadProgress}%</span>
                            </div>
                          </div>
                          <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-emerald-400 h-full rounded-full transition-all duration-300 ease-out animate-pulse"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {mediaAssets.length > 0 && activeTab === "analytics" && (
                        <div className="space-y-4">
                          <div className="flex flex-wrap gap-3 p-4 bg-black/10 rounded-[24px] border border-white/5">
                            {mediaAssets.map((asset, idx) => (
                              <div
                                key={asset.id || idx}
                                className={`relative group/ref-asset cursor-pointer transition-all ${activePreview === idx ? "ring-2 ring-emerald-400 rounded-2xl" : ""}`}
                                onClick={() => setActivePreview(idx)}
                              >
                                <div className="p-3 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-3 shadow-inner hover:bg-white/10 transition-all">
                                  {asset.type?.startsWith("image/") ? (
                                    <ImageIcon className="w-4 h-4 text-emerald-400" />
                                  ) : (
                                    <FileText className="w-4 h-4 text-blue-400" />
                                  )}
                                  <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-white/90 uppercase tracking-tighter max-w-[125px] truncate">
                                      {asset.name}
                                    </span>
                                    <span className="text-[8px] text-white/30 uppercase font-bold">
                                      Attachment
                                    </span>
                                  </div>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeAsset(idx);
                                  }}
                                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/ref-asset:opacity-100 transition-all transform scale-75 group-hover/ref-asset:scale-100 shadow-lg"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>

                          {/* Detail clicked-preview block under the assets bar */}
                          {activePreview !== null &&
                            mediaAssets[activePreview] && (
                              <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-4 bg-black/15 border border-white/10 rounded-[24px] space-y-4 relative"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] uppercase font-bold text-emerald-400 tracking-widest">
                                    Reflection Media Detail
                                  </span>
                                  <button
                                    onClick={() => setActivePreview(null)}
                                    className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-all animate-fade-in"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>

                                <div className="flex flex-col items-center justify-center min-h-[120px] bg-black/20 rounded-xl p-4 border border-white/5">
                                  {mediaAssets[activePreview].type?.startsWith(
                                    "image/",
                                  ) ? (
                                    <img
                                      src={mediaAssets[activePreview].url}
                                      alt="Attachment Preview"
                                      className="max-h-[160px] object-contain rounded-lg shadow-inner cursor-zoom-in"
                                      onClick={() =>
                                        handleViewFile(
                                          mediaAssets[activePreview].url,
                                        )
                                      }
                                    />
                                  ) : mediaAssets[
                                      activePreview
                                    ].type?.startsWith("video/") ? (
                                    <video
                                      src={mediaAssets[activePreview].url}
                                      controls
                                      className="max-h-[160px] rounded-lg"
                                    />
                                  ) : mediaAssets[
                                      activePreview
                                    ].type?.startsWith("audio/") ? (
                                    <audio
                                      src={mediaAssets[activePreview].url}
                                      controls
                                      className="w-full"
                                    />
                                  ) : (
                                    <div className="flex flex-col items-center gap-2 text-center p-1">
                                      <FileText className="w-10 h-10 text-emerald-400 animate-pulse" />
                                      <div>
                                        <p className="text-[11px] font-bold text-white/90 truncate max-w-[200px]">
                                          {mediaAssets[activePreview].name}
                                        </p>
                                        <p className="text-[8px] text-white/40 uppercase font-bold">
                                          {mediaAssets[activePreview].size
                                            ? `${(mediaAssets[activePreview].size / (1024 * 1024)).toFixed(2)} MB`
                                            : "DOCUMENT FILE"}
                                        </p>
                                      </div>
                                      <button
                                        onClick={() =>
                                          handleViewFile(
                                            mediaAssets[activePreview].url,
                                          )
                                        }
                                        className="mt-2 text-[10px] font-black text-emerald-300 hover:underline px-2.5 py-1.5 bg-white/5 rounded-lg border border-white/5"
                                      >
                                        Open File URL
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* Actions row located just below */}
                                <div className="flex justify-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleViewFile(
                                        mediaAssets[activePreview].url,
                                      )
                                    }
                                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 rounded-lg font-bold text-[10px] uppercase tracking-widest transition-colors border border-emerald-500/20 shadow-md"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    View Full File
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeAsset(activePreview)}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-red-400/10 hover:bg-red-400/20 text-red-400 rounded-lg font-bold text-[10px] uppercase tracking-widest transition-colors border border-red-500/20 shadow-md"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Remove Media File
                                  </button>
                                </div>
                              </motion.div>
                            )}
                        </div>
                      )}

                      <div className="flex items-center gap-4">
                        <button
                          onClick={saveReflection}
                          disabled={
                            isSavingReflection ||
                            isUploadingAssets ||
                            !reflectionText.trim()
                          }
                          className="px-10 py-4 bg-white text-emerald-600 rounded-full font-black text-xs uppercase tracking-[0.2em] hover:bg-emerald-50 transition-all shadow-xl hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-3"
                        >
                          <Save className="w-4 h-4" />{" "}
                          {isUploadingAssets ? "Uploading..." : "Save Note"}
                        </button>

                        <button
                          onClick={refreshReflection}
                          className="px-6 py-4 bg-emerald-400/20 text-white rounded-full font-black text-xs uppercase tracking-[0.2em] hover:bg-emerald-400/30 transition-all flex items-center gap-2 group/refresh"
                          title="Refresh Chat / Clear Text"
                        >
                          <RotateCcw className="w-4 h-4 group-hover/refresh:rotate-180 transition-transform duration-500" />{" "}
                          Refresh
                        </button>
                      </div>
                    </div>

                    <div className="hidden lg:flex flex-col gap-4 w-72">
                      <div className="p-6 bg-white/10 backdrop-blur-xl rounded-[32px] border border-white/10">
                        <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center mb-4">
                          <History className="w-5 h-5 text-white" />
                        </div>
                        <h4 className="text-white text-sm font-black uppercase tracking-widest mb-2 text-balance">
                          Track Growth
                        </h4>
                        <p className="text-white/60 text-[11px] leading-relaxed">
                          Reflecting daily increases clarity and emotional
                          regulation. Look back at these in your archive.
                        </p>
                      </div>
                      <div className="p-6 bg-black/20 backdrop-blur-xl rounded-[32px] border border-white/5">
                        <div className="w-10 h-10 bg-brand/30 rounded-2xl flex items-center justify-center mb-4">
                          <Smile className="w-5 h-5 text-white" />
                        </div>
                        <h4 className="text-white text-sm font-black uppercase tracking-widest mb-2 text-balance">
                          Express Freely
                        </h4>
                        <p className="text-white/60 text-[11px] leading-relaxed">
                          Write in any language, use unlimited emojis, and
                          structure your thoughts however you like.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Statistics */}
        <div
          className={`px-10 py-6 border-t flex items-center justify-between text-xs font-black uppercase tracking-widest ${activeTab === "analytics" ? "bg-gray-950 border-white/5 text-gray-500" : "bg-gray-50/30 border-gray-50 text-gray-400"}`}
        >
          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <div
                className={`w-1.5 h-1.5 rounded-full ${activeTab === "analytics" ? "bg-brand" : "bg-blue-500"}`}
              />
              Total Archive: {tasks.length}
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Daily Goal: {selectedDateTasks.filter((t) => t.completed).length}/
              {selectedDateTasks.length || 1}
            </div>
          </div>
          <div
            className={`flex items-center gap-3 px-5 py-2 rounded-2xl border ${activeTab === "analytics" ? "bg-white/5 border-white/10 text-white" : "bg-white border-gray-100 text-gray-900 shadow-sm"}`}
          >
            <Calendar
              className={`w-4 h-4 ${activeTab === "analytics" ? "text-brand" : "text-emerald-500"}`}
            />
            <span>
              {new Date().toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
