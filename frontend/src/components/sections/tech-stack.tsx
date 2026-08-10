import { TECH_STACK } from "@/lib/constants";
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card";
import { SectionWrapper } from "@/components/layout/page-wrapper";
import { StaggerReveal } from "@/components/ui/scroll-reveal";

export function TechStackSection() {
  return (
    <SectionWrapper id="tech-stack">
      <div className="mb-12 text-center">
        <h2 className="text-3xl font-extrabold text-stone-900 dark:text-stone-100 tracking-tight mb-3">
          Modern Technology Stack
        </h2>
        <p className="text-sm sm:text-base text-stone-600 dark:text-stone-400 max-w-2xl mx-auto">
          Built with cutting edge tools for high performance, type safety, and real-time streaming.
        </p>
      </div>

      <StaggerReveal baseDelay={0.1} staggerDelay={0.08} direction="up" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {TECH_STACK.map((tech) => (
          <GlassCard
            key={tech.name}
            variant="hover"
            padding="sm"
            className="flex flex-col items-center justify-center py-6 text-center group border-stone-200/80 dark:border-stone-800/80 shadow-warm-sm hover:border-amber-200 dark:hover:border-amber-800/50"
          >
            <GlassCardContent className="flex flex-col items-center">
              <span className="text-sm font-bold text-stone-800 dark:text-stone-200 group-hover:text-amber-600 dark:group-hover:text-amber-500 transition-colors">
                {tech.name}
              </span>
              <span className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                {tech.category}
              </span>
            </GlassCardContent>
          </GlassCard>
        ))}
      </StaggerReveal>
    </SectionWrapper>
  );
}
