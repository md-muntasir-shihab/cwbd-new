import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Newspaper } from 'lucide-react';
import type { ApiNews } from '../../../services/api';
import { buildMediaUrl } from '../../../utils/mediaUrl';

interface NewsCardProps {
  item: ApiNews;
}

export default function NewsCard({ item }: NewsCardProps) {
  const imageCandidate = item.featuredImage || item.coverImage || item.coverImageUrl || item.thumbnailImage;
  const img = imageCandidate ? buildMediaUrl(imageCandidate) : '';
  const sourceIcon = buildMediaUrl(item.sourceIconUrl || '/logo.svg');

  return (
    <motion.div
      whileHover={{ y: -4, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
      className="snap-start shrink-0 w-[280px] sm:w-[300px] md:w-[320px]"
    >
      <Link
        to={`/news/${item.slug}`}
        className="block rounded-[1.5rem] overflow-hidden bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700/60 shadow-[0_8px_30px_rgba(15,23,42,0.08)] hover:shadow-[0_20px_50px_rgba(15,23,42,0.14)] dark:shadow-[0_8px_30px_rgba(4,12,24,0.2)] dark:hover:shadow-[0_20px_50px_rgba(4,12,24,0.3)] transition-all duration-500 group h-full flex flex-col"
      >
        {/* Cover image */}
        <div className="h-40 bg-gray-100 dark:bg-gray-800 overflow-hidden relative">
          {imageCandidate ? (
            <img
              src={img}
              alt={item.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
              onError={(event) => {
                const target = event.currentTarget;
                const fallback = buildMediaUrl('/logo.svg');
                if (target.src !== fallback) {
                  target.src = fallback;
                  return;
                }
                target.style.display = 'none';
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Newspaper className="w-10 h-10 text-gray-300 dark:text-gray-600" />
            </div>
          )}
          {/* Category badge */}
          {item.category && (
            <span className="absolute top-3 left-3 px-2.5 py-0.5 rounded-full bg-white/90 dark:bg-gray-900/90 text-[11px] font-semibold text-primary-600 dark:text-primary-400 backdrop-blur-sm shadow-sm">
              {item.category}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="p-4 flex-1 flex flex-col">
          <h3 className="font-semibold text-sm text-gray-900 dark:text-white line-clamp-2 leading-snug mb-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
            {item.title}
          </h3>
          {item.shortSummary && (
            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-3 flex-1">
              {item.shortSummary}
            </p>
          )}

          {/* Source + date */}
          <div className="flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500 mt-auto">
            {item.sourceIconUrl && (
              <img
                src={sourceIcon}
                alt=""
                className="w-4 h-4 rounded-full"
                onError={(event) => {
                  const target = event.currentTarget;
                  const fallback = buildMediaUrl('/logo.svg');
                  if (target.src !== fallback) target.src = fallback;
                }}
              />
            )}
            {item.sourceName && <span className="font-medium">{item.sourceName}</span>}
            {item.publishDate && (
              <span className="ml-auto">
                {new Date(item.publishDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
