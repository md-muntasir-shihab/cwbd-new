import { Link } from 'react-router-dom';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  icon?: LucideIcon;
}

export default function SectionHeader({
  title,
  subtitle,
  viewAllHref,
  viewAllLabel = 'View all',
  icon: Icon,
}: SectionHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6 md:mb-8">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          {Icon && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative p-2.5 rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-200 dark:ring-gray-700 overflow-hidden group"
            >
              {/* Subtle background gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--primary)]/10 to-indigo-500/5 dark:from-[var(--primary)]/20 dark:to-indigo-500/10" />
              
              <Icon className="relative z-10 w-5 h-5 text-[var(--primary)] dark:text-[var(--primary)]" />
              
              {/* Inner glow effect */}
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[var(--primary)]/5 to-transparent blur-sm pointer-events-none" />
            </motion.div>
          )}
          <div>
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold font-heading text-gray-900 dark:text-white leading-tight tracking-tight">
              {title}
            </h2>
            {subtitle && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {/* Accent gradient line */}
        <div className="mt-3 h-[2px] w-16 rounded-full bg-gradient-to-r from-[var(--primary)] via-purple-500 to-transparent opacity-60" />
      </div>
      {viewAllHref && (
        <Link
          to={viewAllHref}
          className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-[var(--primary)] dark:text-[var(--primary)] bg-[var(--primary)]/5 dark:bg-[var(--primary)]/10 hover:bg-[var(--primary)]/10 dark:hover:bg-[var(--primary)]/20 border border-[var(--primary)]/10 dark:border-[var(--primary)]/20 transition-all duration-300 group hover:shadow-sm"
        >
          {viewAllLabel}
          <ArrowRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-1" />
        </Link>
      )}
    </div>
  );
}
