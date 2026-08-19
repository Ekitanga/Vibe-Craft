const { GoogleGenAI } = require("@google/genai");
const env = require("../config/env");
const HttpError = require("../utils/httpError");
const productService = require("./productService");

const MAX_MESSAGE_LENGTH = 800;
// Keep the request small enough for the free-tier input-token limit. The
// catalog is included on every request, so long histories can exhaust TPM fast.
const MAX_HISTORY_TURNS = 6;

const STORE_INFORMATION = {
  location: "Rasumal House, 4th floor, Shop 14, opposite Imenti House, Tom Mboya Street, Nairobi CBD, Kenya.",
  phone: "0707 472897",
  whatsapp: "0707 472897",
  email: "hello@vibecraft.local",
  delivery: "Same-day delivery in Nairobi to the customer's doorstep and next-day delivery countrywide.",
  collection: "Shop collection is available at checkout and can reduce the wait time to about 30 minutes.",
  payment: "Pay on delivery is available only in Nairobi and immediate environs. Upfront payment applies outside Nairobi.",
  mpesa: "M-Pesa Paybill 522533, Account 8055906.",
  pricing: "All prices are VAT exclusive.",
};

let client = null;

const getClient = () => {
  if (!env.geminiApiKey) {
    return null;
  }

  if (!client) {
    client = new GoogleGenAI({ apiKey: env.geminiApiKey });
  }

  return client;
};

const formatCatalogForPrompt = (products, detailedProductIds = new Set()) =>
  products.map((product) => {
    const includeDetails = detailedProductIds.has(product.id);
    const catalogProduct = {
    name: product.name,
    brand: product.brand || undefined,
    category: product.categoryId,
    price_kes: product.price,
    compare_at_price_kes: product.compareAtPrice || undefined,
    in_stock: product.stock > 0,
    stock_count: product.stock,
    resolution: product.resolution || undefined,
    brightness: product.brightness || undefined,
    ansi_lumens: product.ansiLumens || undefined,
    projector_type: product.projectorType || undefined,
    smart_os: product.smartOS,
    wifi: product.wifi,
    bluetooth: product.bluetooth,
    summary: product.shortSummary || undefined,
    product_url: "/product.html?id=" + product.id,
    };

    if (includeDetails) {
      catalogProduct.description = product.description || undefined;
      catalogProduct.specs = product.specs && Object.keys(product.specs).length ? product.specs : undefined;
      catalogProduct.ideal_use_cases = product.idealUseCases && product.idealUseCases.length ? product.idealUseCases : undefined;
      catalogProduct.whats_in_box = product.whatsInBox && product.whatsInBox.length ? product.whatsInBox : undefined;
    }

    return catalogProduct;
  });

const PRODUCT_NAME_STOP_WORDS = new Set([
  "android", "anti", "blue", "curtain", "foldable", "folding", "game", "gimbal", "grey", "hd",
  "mini", "portable", "projector", "screen", "smart", "stand", "thin", "universal", "white",
]);

const findDetailedProductIds = (products, queryText) => {
  const normalizedQuery = String(queryText || "").toLowerCase();
  const detailedIds = new Set();

  products.forEach((product) => {
    const normalizedName = String(product.name || "").toLowerCase();
    const nameTokens = normalizedName.split(/[^a-z0-9]+/).filter((token) =>
      token.length >= 4 && !PRODUCT_NAME_STOP_WORDS.has(token)
    );

    if (
      normalizedName && normalizedQuery.includes(normalizedName) ||
      nameTokens.some((token) => normalizedQuery.includes(token))
    ) {
      detailedIds.add(product.id);
    }
  });

  return detailedIds;
};

const buildSystemInstruction = (catalogJson) =>
  [
    "You are the Vibecraft254 shopping assistant, helping customers pick the right projector setup.",
    "Vibecraft254 is a Kenyan electronics retailer selling projectors and related gear. All prices are in Kenyan Shillings (KES).",
    "Use the STORE INFORMATION for questions about the shop location, contact details, delivery, collection, payment, and pricing. Use the CATALOG for product facts. Never invent products, prices, specs, stock levels, opening hours, return policies, or warranty terms.",
    "If something isn't in the catalog, say Vibecraft254 doesn't currently carry that, rather than guessing.",
    "For questions about ambient light or bright rooms: as a rule of thumb, under ~1500 ANSI lumens is best in a dark room, 1500-2500 is fine for dim or evening light, and above 2500 ANSI lumens holds up in moderate daylight. Reason from each product's ansi_lumens/brightness field, and say plainly if a product isn't ideal for a bright room.",
    "For 'cheapest' or 'lowest price' questions, compare the price_kes field directly across the relevant products.",
    "For comparison questions, compare only the products the customer named, using exact catalog facts. State which product is better for each relevant use case (such as bright rooms, image quality, features, portability, and value), then give a clear overall recommendation with the tradeoffs. Do not claim one product is universally best, and do not compare a screen or accessory as if it were a projector.",
    "Keep answers short, conversational, and lightly playful, like a knowledgeable friend who loves a great screen. Use a few sentences, not an essay. Never use asterisks, Markdown bold markers, or bullet characters. When listing options or comparing products, use numbered lines beginning with 1., 2., 3. Keep the wording easy to scan.",
    "When you recommend a specific product, say its exact name so the customer can find it.",
    "If a product is out of stock (in_stock: false), mention that.",
    "Never invent a discount, promotion, or delivery time that isn't in the data.",
    "If asked for store hours, returns, refunds, or warranty details and they are not in the STORE INFORMATION or CATALOG, say that the details are not currently listed and direct the customer to contact Vibecraft on 0707 472897.",
    "",
    "STORE INFORMATION (JSON):",
    JSON.stringify(STORE_INFORMATION, null, 2),
    "",
    "CATALOG (JSON):",
    catalogJson,
  ].join("\n");

const classifyGeminiError = (error) => {
  const status = error && error.status;

  if (status === 404) {
    return new HttpError(500, "The AI assistant's model is misconfigured (model not found). This needs a developer to fix GEMINI_MODEL.");
  }

  if (status === 401 || status === 403) {
    return new HttpError(500, "The AI assistant's API key is invalid or doesn't have permission. Check GEMINI_API_KEY.");
  }

  if (status === 400) {
    return new HttpError(502, "The AI assistant rejected that request. Try rephrasing your question.");
  }

  if (status === 429) {
    return new HttpError(503, "The AI assistant has hit its usage limit for now. Please try again in a few minutes.");
  }

  if (typeof status === "number" && status >= 500) {
    return new HttpError(503, "The AI service is temporarily overloaded. Please try again shortly.");
  }

  return new HttpError(502, "Could not reach the AI assistant right now. Please try again in a moment.");
};

const chat = async ({ message, history }) => {
  const trimmedMessage = String(message || "").trim();

  if (!trimmedMessage) {
    throw new HttpError(400, "Message is required.");
  }

  if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
    throw new HttpError(400, "Message is too long (max " + MAX_MESSAGE_LENGTH + " characters).");
  }

  const genAI = getClient();

  if (!genAI) {
    throw new HttpError(500, "The AI assistant is not configured yet.");
  }

  const safeHistory = Array.isArray(history) ? history.slice(-MAX_HISTORY_TURNS) : [];
  const contents = safeHistory
    .filter((turn) => turn && (turn.role === "user" || turn.role === "assistant") && turn.content)
    .map((turn) => ({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text: String(turn.content).slice(0, MAX_MESSAGE_LENGTH) }],
    }));

  contents.push({ role: "user", parts: [{ text: trimmedMessage }] });

  const products = await productService.listProducts();
  const queryText = [
    ...safeHistory.map((turn) => turn && turn.content ? String(turn.content) : ""),
    trimmedMessage,
  ].join(" ");
  const detailedProductIds = findDetailedProductIds(products, queryText);
  // Whitespace has no value to the model but does consume input tokens.
  const catalogJson = JSON.stringify(formatCatalogForPrompt(products, detailedProductIds));

  let response;

  try {
    response = await genAI.models.generateContent({
      model: env.geminiModel,
      contents,
      config: {
        systemInstruction: buildSystemInstruction(catalogJson),
        maxOutputTokens: 768,
        temperature: 0.4,
      },
    });
  } catch (error) {
    console.error("[ai-assistant] Gemini request failed:", error && error.message ? error.message : error);
    throw classifyGeminiError(error);
  }

  const text = response && response.text ? String(response.text).trim() : "";

  if (!text) {
    const finishReason = response && response.candidates && response.candidates[0] && response.candidates[0].finishReason;

    if (finishReason === "SAFETY" || finishReason === "PROHIBITED_CONTENT") {
      throw new HttpError(502, "I can't help with that particular question — try asking about our products a different way.");
    }

    console.error("[ai-assistant] Empty response from Gemini. finishReason:", finishReason);
    throw new HttpError(502, "The AI assistant didn't return a response. Please try again.");
  }

  return { reply: text };
};

module.exports = { chat };
