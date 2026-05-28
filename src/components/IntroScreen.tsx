import { motion } from "motion/react";
import { Sparkles } from "lucide-react";

export default function IntroScreen({ onFinish }: { onFinish: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ delay: 3, duration: 1 }}
      onAnimationComplete={onFinish}
      className="fixed inset-0 z-[100] bg-brand flex flex-col items-center justify-center text-white p-6"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="text-center"
      >
        <div className="w-24 h-24 bg-white/20 rounded-[32px] flex items-center justify-center mx-auto mb-10 shadow-2xl backdrop-blur-md border border-white/30">
          <Sparkles className="w-12 h-12 text-white fill-white" />
        </div>
        
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
        >
          <h1 className="font-serif text-3xl md:text-5xl mb-6 leading-tight">
            Welcome to <br/>
            <span className="text-white relative">
              Your Personal Sanctuary
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ delay: 1.2, duration: 1 }}
                className="absolute -bottom-2 left-0 h-1 bg-white/40 rounded-full"
              />
            </span>
          </h1>
          <p className="text-white/70 text-lg md:text-xl font-medium tracking-wide">
            A safe space for your thoughts, ideas, and reflections
          </p>
        </motion.div>
      </motion.div>
      
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8 }}
        className="absolute bottom-12 flex items-center gap-3 text-white/50 text-sm font-bold uppercase tracking-[0.2em]"
      >
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full"
        />
        Loading Experience
      </motion.div>
    </motion.div>
  );
}
