import { Upload, Cpu, MessageCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card";
import { SectionWrapper } from "@/components/layout/page-wrapper";
import { HOW_IT_WORKS_STEPS } from "@/lib/constants";
import { StaggerReveal } from "@/components/ui/scroll-reveal";

const stepIcons: LucideIcon[] = [Upload, Cpu, MessageCircle];

export function HowItWorksSection() {
  return (
    <SectionWrapper id="how-it-works" className="relative">
      <div className="mb-12 text-center">
        <h2 className="text-3xl font-extrabold text-stone-900 dark:text-stone-100 tracking-tight mb-3">
          How It Works
        </h2>
        <p className="text-sm sm:text-base text-stone-600 dark:text-stone-400 max-w-2xl mx-auto">
          Three steps to process documents and generate grounded responses.
        </p>
      </div>

      <div className="relative max-w-5xl mx-auto">
        {/* Connecting line for desktop */}
        <div className="hidden lg:block absolute top-[50px] left-[10%] right-[10%] h-[2px] bg-gradient-to-r from-stone-200 via-amber-200 to-stone-200 dark:from-stone-800 dark:via-amber-900/40 dark:to-stone-800 z-0" />

        <StaggerReveal baseDelay={0.1} staggerDelay={0.2} direction="up" className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10">
          {HOW_IT_WORKS_STEPS.map((step, index) => {
            const Icon = stepIcons[index];
            return (
              <GlassCard key={step.step} variant="hover" padding="default" className="border-stone-200/80 dark:border-stone-800/80 shadow-warm-md">
                <GlassCardContent className="space-y-4">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center text-amber-600 dark:text-amber-500 shadow-sm border border-amber-100 dark:border-amber-900/50">
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
                      Step 0{step.step}
                    </span>
                    <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
                      {step.title}
                    </h3>
                    <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed max-w-[250px]">
                      {step.description}
                    </p>
                  </div>
                </GlassCardContent>
              </GlassCard>
            );
          })}
        </StaggerReveal>
      </div>
    </SectionWrapper>
  );
}
