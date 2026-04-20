import { Schema, model } from "mongoose";

const newsSettingsSchema = new Schema(
  {
    newsPageTitle: { type: String, default: "CampusWay News" },
    newsPageSubtitle: { type: String, default: "Latest updates" },
    defaultBannerUrl: { type: String, default: "" },
    defaultThumbUrl: { type: String, default: "" },
    defaultSourceIconUrl: { type: String, default: "" },
    fetchFullArticleEnabled: { type: Boolean, default: true },
    fullArticleFetchMode: {
      type: String,
      enum: ["rss_content", "readability_scrape", "both"],
      default: "both"
    },
    aiExtractionFallback: { type: Boolean, default: false },
    appearance: {
      layoutMode: { type: String, default: "rss_reader" },
      density: { type: String, default: "comfortable" },
      showWidgets: {
        trending: { type: Boolean, default: true },
        latest: { type: Boolean, default: true },
        sourceSidebar: { type: Boolean, default: true },
        tagChips: { type: Boolean, default: true },
        previewPanel: { type: Boolean, default: true },
        breakingTicker: { type: Boolean, default: false }
      },
      animationLevel: { type: String, default: "normal" },
      paginationMode: { type: String, default: "pages" }
    },
    shareTemplates: {
      whatsapp: { type: String, default: "{title} {url}" },
      facebook: { type: String, default: "{url}" },
      messenger: { type: String, default: "{url}" },
      telegram: { type: String, default: "{title} {url}" }
    },
    aiSettings: {
      enabled: { type: Boolean, default: false },
      language: { type: String, enum: ["bn", "en", "mixed"], default: "en" },
      stylePreset: { type: String, enum: ["short", "standard", "detailed"], default: "standard" },
      apiProviderUrl: { type: String, default: "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent" },
      apiKey: { type: String, default: "" },
      customPrompt: { type: String, default: "" },
      strictNoHallucination: { type: Boolean, default: true },
      maxLength: { type: Number, default: 1200 },
      duplicateSensitivity: { type: String, enum: ["strict", "medium", "loose"], default: "medium" }
    },
    workflow: {
      defaultIncomingStatus: { type: String, default: "pending_review" },
      allowScheduling: { type: Boolean, default: true },
      autoExpireDays: { type: Number, default: null }
    }
  },
  { timestamps: true }
);

export const NewsSettingsModel = model("news_settings", newsSettingsSchema);
