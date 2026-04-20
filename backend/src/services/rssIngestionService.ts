import Parser from "rss-parser";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { NewsItemModel } from "../models/newsItem.model";
import { NewsSettingsModel } from "../models/newsSettings.model";
import { RssSourceModel } from "../models/rssSource.model";
import { sanitizeNewsHtml, slugify, hashKey, normalizeTitle } from "../utils/content";
import { buildDuplicateKeyHash, findDuplicate } from "./duplicateService";
import { generateAiDraftFromRss, extractFullArticleWithAi } from "./aiDraftService";

const parser = new Parser({
  customFields: {
    item: ["content:encoded", "media:content", "description"]
  }
});

const scrapeReadableContent = async (url: string) => {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      }
    });

    if (!response.ok) {
      console.warn(`[RSS Scrape] Failed to fetch ${url} (status: ${response.status})`);
      return "";
    }

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    return article?.content ?? "";
  } catch (err) {
    console.error(`[RSS Scrape Error] ${url}:`, err);
    return "";
  }
};

const getFullContent = async (
  mode: "rss_content" | "readability_scrape" | "both",
  rssContent: string,
  articleUrl: string
) => {
  if (mode === "rss_content") return rssContent;
  if (mode === "readability_scrape") return scrapeReadableContent(articleUrl);
  return rssContent || (await scrapeReadableContent(articleUrl));
};

function extractRssImage(item: Record<string, unknown>): string | null {
  // Try enclosure
  const enclosure = item.enclosure as Record<string, unknown> | undefined;
  if (enclosure?.url && String(enclosure.type || '').startsWith('image/')) {
    return String(enclosure.url);
  }
  // Try media:content
  const media = item['media:content'] as Record<string, unknown> | undefined;
  if (media?.$ && typeof media.$ === 'object') {
    const attrs = media.$ as Record<string, unknown>;
    if (attrs.url) return String(attrs.url);
  }
  if (media?.url) return String(media.url);
  // Try itunes:image or image
  if (item['itunes:image']) {
    const img = item['itunes:image'] as Record<string, unknown>;
    if (img?.href) return String(img.href);
  }

  // Try extracting first image from content (fallback)
  const contentStr = String(item['content:encoded'] || item.content || item.description || "");
  const imgMatch = contentStr.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch && imgMatch[1]) {
    return imgMatch[1];
  }

  return null;
}

export const runRssIngestion = async () => {
  const settings = await NewsSettingsModel.findOne();
  const sources = await RssSourceModel.find({ enabled: true }).sort({ priority: 1 });

  for (const source of sources) {
    try {
      const feed = await parser.parseURL(source.rssUrl);

      for (const item of feed.items) {
        try {
          const originalArticleUrl = item.link || "";
          if (!originalArticleUrl) continue;

          const rssRawTitle = item.title || "Untitled";
          const rssRawDescription = item.contentSnippet || item.summary || item.description || "";
          const rssRawContent = (item["content:encoded"] as string) || item.content || "";

          const duplicateProbe = await findDuplicate({
            originalArticleUrl,
            rssGuid: item.guid || null,
            title: rssRawTitle
          });

          let fullContent = sanitizeNewsHtml(rssRawDescription);
          let fetchedFullText = false;
          if (settings?.fetchFullArticleEnabled) {
            try {
              const fullText = await getFullContent(settings.fullArticleFetchMode, rssRawContent, originalArticleUrl);
              fullContent = sanitizeNewsHtml(fullText || rssRawDescription);
              fetchedFullText = Boolean(fullText);
            } catch {
              fetchedFullText = false;
            }

            // AI extraction fallback: if standard extraction failed or returned
            // very little content, try AI-powered extraction
            if (
              (!fetchedFullText || fullContent.length < 200) &&
              (settings as any).aiExtractionFallback &&
              settings.aiSettings?.enabled &&
              settings.aiSettings?.apiKey
            ) {
              try {
                const aiExtracted = await extractFullArticleWithAi(
                  originalArticleUrl,
                  source.name,
                  settings.aiSettings.apiProviderUrl,
                  settings.aiSettings.apiKey,
                );
                if (aiExtracted && aiExtracted.length > fullContent.length) {
                  fullContent = aiExtracted;
                  fetchedFullText = true;
                }
              } catch {
                // AI extraction failed, keep whatever we had
              }
            }
          }

          // Extract cover image from RSS feed
          const rssImage = extractRssImage(item as unknown as Record<string, unknown>);

          const baseDoc = {
            title: rssRawTitle,
            slug: `${slugify(rssRawTitle)}-${hashKey(originalArticleUrl).slice(0, 8)}`,
            shortSummary: rssRawDescription.slice(0, 280),
            fullContent,
            coverImageUrl: rssImage || null,
            coverSource: rssImage ? ("rss" as const) : ("default" as const),
            tags: source.categoryTags,
            category: source.categoryTags[0] || "news",
            sourceId: source._id,
            sourceName: source.name,
            sourceUrl: source.siteUrl,
            originalArticleUrl,
            rssGuid: item.guid || null,
            rssPublishedAt: item.isoDate ? new Date(item.isoDate) : null,
            rssRawTitle,
            rssRawDescription,
            rssRawContent,
            fetchedFullText,
            fetchedFullTextAt: fetchedFullText ? new Date() : null,
            duplicateKeyHash: buildDuplicateKeyHash({ originalArticleUrl, rssGuid: item.guid, title: rssRawTitle }),
            duplicateOfNewsId: duplicateProbe.duplicateOfNewsId,
            duplicateReasons: duplicateProbe.duplicateReasons,
            status: duplicateProbe.duplicate ? "duplicate_review" : "pending_review"
          };

          if (settings?.aiSettings?.enabled) {
            const ai = await generateAiDraftFromRss({
              rawTitle: rssRawTitle,
              rawDescription: rssRawDescription,
              rawContent: rssRawContent,
              sourceName: source.name,
              originalArticleUrl
            });

            await NewsItemModel.create({
              ...baseDoc,
              title: ai.title,
              shortSummary: ai.shortSummary,
              fullContent: ai.fullContent,
              tags: ai.tags,
              category: ai.category,
              isAiGenerated: true,
              aiNotes: ai.aiNotes
            });
          } else {
            await NewsItemModel.create({ ...baseDoc, isAiGenerated: false });
          }
        } catch (itemErr) {
          console.error(`[RSS] Failed to process item from ${source.name}:`, (itemErr as Error).message);
        }
      }

      source.lastFetchedAt = new Date();
      await source.save();
    } catch (sourceErr) {
      console.error(`[RSS] Failed to fetch source ${source.name}:`, (sourceErr as Error).message);
      source.lastError = (sourceErr as Error).message;
      await source.save().catch(() => { });
    }
  }
};
