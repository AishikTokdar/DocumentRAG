import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, FileText, Brain, Zap } from "lucide-react";
import { Button, Badge, AnimatedGridPattern, BorderBeam, ScrambleText } from "@/components/ui";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { StaggerReveal, ScrollReveal } from "@/components/ui/scroll-reveal";

export function HeroSection() {
  const navigate = useNavigate();

  return (
    <section className="relative py-16 sm:py-24 overflow-hidden">
      <AnimatedGridPattern />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center flex flex-col items-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="flex flex-col items-center max-w-3xl"
        >
          <div className="relative inline-block mb-6">
            <Badge variant="outline" className="px-3.5 py-1 text-xs border-amber-200/50 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 text-stone-700 dark:text-stone-300">
              <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-500" />
              AI Document Intelligence &amp; Vector Search
            </Badge>
            <BorderBeam size={120} duration={8} colorFrom="#f59e0b" colorTo="#ea580c" />
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold text-stone-900 dark:text-stone-100 tracking-tight leading-[1.1] mb-6">
            Intelligent PDF Chat Powered by{" "}
            <span className="gradient-text-warm">
              <ScrambleText text="Retrieval RAG" />
            </span>
          </h1>

          <p className="text-base sm:text-lg text-stone-600 dark:text-stone-400 leading-relaxed mb-8 max-w-2xl">
            Upload documents, parse context into local FAISS vector stores, and query grounded answers with automatic multi-provider model failover.
          </p>

          <StaggerReveal baseDelay={0.1} staggerDelay={0.08} direction="up" className="flex flex-wrap justify-center gap-2 mb-10">
            {[
              { icon: FileText, text: "PDF Analysis" },
              { icon: Brain, text: "7-Agent Pipeline" },
              { icon: Zap, text: "Real-time SSE Streaming" },
            ].map((f) => (
              <span
                key={f.text}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-stone-100 dark:bg-stone-800/80 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 shadow-warm-sm"
              >
                <f.icon className="w-3.5 h-3.5 text-amber-500" />
                {f.text}
              </span>
            ))}
          </StaggerReveal>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.4 }}
            className="flex flex-col sm:flex-row items-center gap-3"
          >
            <Button size="lg" onClick={() => navigate("/chat")} className="w-full sm:w-auto relative group overflow-hidden bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 shadow-warm-md">
              Get Started - Launch Chat
              <ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => document.getElementById("pipeline")?.scrollIntoView({ behavior: "smooth" })}
              className="w-full sm:w-auto cursor-pointer border-stone-200 hover:bg-stone-100 dark:border-stone-800 dark:hover:bg-stone-900"
            >
              View Architecture
            </Button>
          </motion.div>

          <ScrollReveal delay={0.5} direction="up" className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-6 w-full pt-8 border-t border-stone-200 dark:border-stone-800">
            {[
              { value: "100", suffix: "%", label: "Open Source" },
              { value: "FAISS", label: "Vector Search" },
              { value: "50", suffix: "MB", label: "Max Cumulative Size" },
              { value: "SSE", label: "Live Streaming" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-100">
                  <AnimatedCounter value={stat.value} suffix={stat.suffix} duration={1.5} />
                </div>
                <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  {stat.label}
                </div>
              </div>
            ))}
          </ScrollReveal>
        </motion.div>
      </div>
    </section>
  );
}
