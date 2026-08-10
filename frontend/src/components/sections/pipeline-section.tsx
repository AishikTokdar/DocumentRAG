import {
  Download,
  Filter,
  Sparkles,
  SlidersHorizontal,
  Brain,
  ShieldCheck,
  Package,
} from "lucide-react";
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { SectionWrapper } from "@/components/layout/page-wrapper";
import { StaggerReveal } from "@/components/ui/scroll-reveal";

const pipelineSteps = [
  { name: "Extractor", description: "Retrieves document chunks from FAISS vector store using similarity search.", icon: Download, badge: "Retrieval" },
  { name: "Analyzer", description: "Filters low-quality chunks and scores remaining context for relevance.", icon: Filter, badge: "Quality" },
  { name: "Preprocessor", description: "Normalizes unicode, collapses whitespace, and cleans text structure.", icon: Sparkles, badge: "Clean" },
  { name: "Optimizer", description: "Reorders chunks by similarity score to maximize context window utility.", icon: SlidersHorizontal, badge: "Optimize" },
  { name: "Synthesizer", description: "Generates grounded response using LLM based on context and query.", icon: Brain, badge: "Generate" },
  { name: "Validator", description: "Quality-checks generated output for coherence and uncertainty markers.", icon: ShieldCheck, badge: "Verify" },
  { name: "Assembler", description: "Packages final response with source citations, page numbers, and model metadata.", icon: Package, badge: "Output" },
];

export function PipelineSection() {
  return (
    <SectionWrapper id="pipeline">
      <div className="mb-12 text-center">
        <h2 className="text-3xl font-extrabold text-stone-900 dark:text-stone-100 tracking-tight mb-3">
          7-Agent RAG Pipeline Architecture
        </h2>
        <p className="text-sm sm:text-base text-stone-600 dark:text-stone-400 max-w-2xl mx-auto">
          Every query passes through seven specialized background stages for factual accuracy.
        </p>
      </div>

      <div className="max-w-4xl mx-auto relative">
        {/* Progress Line */}
        <div className="absolute left-8 sm:left-1/2 top-4 bottom-4 w-px bg-stone-200 dark:bg-stone-800 -translate-x-1/2" />
        
        <StaggerReveal baseDelay={0.1} staggerDelay={0.1} direction="up" className="space-y-4">
          {pipelineSteps.map((step, index) => {
            const Icon = step.icon;
            const isEven = index % 2 === 0;
            return (
              <div key={step.name} className={`relative flex items-center gap-6 sm:gap-8 ${isEven ? "sm:flex-row-reverse" : ""}`}>
                {/* Step Connector */}
                <div className="absolute left-8 sm:left-1/2 w-3 h-3 bg-white dark:bg-stone-950 border-2 border-amber-500 rounded-full -translate-x-1/2 z-10" />
                
                {/* Mobile Spacing */}
                <div className="w-10 sm:hidden shrink-0" />
                
                {/* Content Card */}
                <div className={`flex-1 ${isEven ? "sm:text-right" : "text-left"}`}>
                  <GlassCard variant="hover" padding="sm" className="border-stone-200 dark:border-stone-800 shadow-warm-sm group hover:border-amber-300 dark:hover:border-amber-700/50">
                    <GlassCardContent className={`flex items-center gap-4 ${isEven ? "sm:flex-row-reverse" : ""}`}>
                      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-stone-100 dark:bg-stone-800/80 text-stone-700 dark:text-stone-300 group-hover:text-amber-600 dark:group-hover:text-amber-500 group-hover:bg-amber-50 dark:group-hover:bg-amber-950/30 transition-colors shrink-0">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`flex items-center gap-2 mb-1 ${isEven ? "sm:justify-end" : ""}`}>
                          <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                            {step.name}
                          </h3>
                          <Badge variant="secondary" size="sm">
                            {step.badge}
                          </Badge>
                        </div>
                        <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400">
                          {step.description}
                        </p>
                      </div>
                    </GlassCardContent>
                  </GlassCard>
                </div>
                
                {/* Empty Half for Desktop Layout */}
                <div className="hidden sm:block flex-1" />
              </div>
            );
          })}
        </StaggerReveal>
      </div>
    </SectionWrapper>
  );
}
