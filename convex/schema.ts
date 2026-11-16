import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const updateKind = v.union(
  v.literal("job"),
  v.literal("move"),
  v.literal("trip"),
  v.literal("milestone"),
  v.literal("event"),
  v.literal("birthday"),
  v.literal("post"),
);

export const cardSpec = v.object({
  template: v.union(
    v.literal("job"),
    v.literal("trip"),
    v.literal("move"),
    v.literal("stat"),
    v.literal("event"),
    v.literal("quote"),
    v.literal("place"),
    v.literal("plain"),
  ),
  kicker: v.string(),
  headline: v.string(),
  detail: v.string(),
  stat: v.optional(v.object({ value: v.string(), unit: v.string() })),
  from: v.optional(v.string()),
  to: v.optional(v.string()),
  dateRange: v.optional(v.object({ start: v.optional(v.number()), end: v.optional(v.number()) })),
  hue: v.number(),
  size: v.union(v.literal("wide"), v.literal("half")),
  by: v.optional(v.union(v.literal("ai"), v.literal("rules"))),
});

export const audience = v.union(v.literal("close"), v.literal("everyone"), v.literal("city"));

export const giftStatus = v.union(v.literal("suggested"), v.literal("paid"), v.literal("ordered"), v.literal("dismissed"));

export const reminderKind = v.union(v.literal("birthday"), v.literal("event"), v.literal("reconnect"), v.literal("trip"), v.literal("custom"));
export const reminderStatus = v.union(v.literal("scheduled"), v.literal("sent"), v.literal("done"), v.literal("snoozed"), v.literal("dismissed"));
export const socialToolkit = v.union(v.literal("twitter"), v.literal("instagram"), v.literal("linkedin"));

export const reminderChannel = v.union(v.literal("push"), v.literal("imessage"), v.literal("both"));

export const chatSource = v.union(v.literal("whatsapp"), v.literal("imessage"));
export const chatParticipant = v.object({
  id: v.string(),
  name: v.optional(v.string()),
  phone: v.optional(v.string()),
  personId: v.optional(v.id("people")),
  count: v.optional(v.number()),
  lastAt: v.optional(v.number()),
});
export const relationshipTier = v.union(v.literal("inner"), v.literal("close"), v.literal("catching_up"), v.literal("dormant"));

export default defineSchema({
  chatThreads: defineTable({
    ownerId: v.id("users"),
    source: chatSource,
    via: v.string(),
    externalId: v.string(),
    title: v.string(),
    isGroup: v.boolean(),
    participants: v.array(chatParticipant),
    personId: v.optional(v.id("people")),
    messageCount: v.number(),
    lastAt: v.number(),
    at: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_ext", ["ownerId", "externalId"])
    .index("by_person", ["personId"]),

  chatMessages: defineTable({
    threadId: v.id("chatThreads"),
    key: v.string(),
    at: v.number(),
    fromMe: v.boolean(),
    sender: v.optional(v.string()),
    text: v.string(),
  })
    .index("by_thread_at", ["threadId", "at"])
    .index("by_thread_key", ["threadId", "key"]),

  relationshipStats: defineTable({
    ownerId: v.id("users"),
    personId: v.id("people"),
    sources: v.array(v.string()),
    messageCount: v.number(),
    sentByMe: v.number(),
    groupMessages: v.number(),
    groupsTogether: v.number(),
    firstAt: v.optional(v.number()),
    lastAt: v.optional(v.number()),
    last30: v.number(),
    prev60: v.number(),
    activeDays90: v.number(),
    startsByMe: v.number(),
    startsByThem: v.number(),
    myReplyMs: v.optional(v.number()),
    theirReplyMs: v.optional(v.number()),
    tier: relationshipTier,
    trend: v.union(v.literal("warming"), v.literal("cooling"), v.literal("steady")),
    extractedAt: v.optional(v.number()),
    extractedLastAt: v.optional(v.number()),
    at: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_person", ["personId"]),

  chatEdges: defineTable({
    ownerId: v.id("users"),
    personId: v.id("people"),
    otherPersonId: v.id("people"),
    groups: v.number(),
    groupTitles: v.array(v.string()),
    at: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_person", ["personId"])
    .index("by_other", ["otherPersonId"]),

  users: defineTable({
    key: v.string(),
    name: v.string(),
    city: v.string(),
    cityId: v.optional(v.id("cities")),
    role: v.string(),
    hue: v.number(),
    phone: v.string(),
    keikiOptIn: v.boolean(),
    budget: v.number(),
    visibility: v.object({ city: v.boolean(), birthday: v.boolean(), jobChanges: v.boolean(), trips: v.boolean() }),
    tz: v.optional(v.string()),
  })
    .index("by_key", ["key"])
    .index("by_phone", ["phone"]),

  people: defineTable({
    ownerId: v.id("users"),
    key: v.string(),
    name: v.string(),
    hue: v.number(),
    city: v.string(),
    cityId: v.optional(v.id("cities")),
    role: v.string(),
    birthday: v.optional(v.string()),
    pronoun: v.optional(v.string()),
    handles: v.object({
      linkedin: v.optional(v.string()),
      x: v.optional(v.string()),
      instagram: v.optional(v.string()),
      strava: v.optional(v.string()),
    }),
    interests: v.array(v.string()),
    lastContactAt: v.optional(v.number()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    close: v.boolean(),
    linkedUserId: v.optional(v.id("users")),
    note: v.optional(v.string()),
    handlesVerified: v.optional(v.array(v.string())),
    socialIds: v.optional(v.record(v.string(), v.string())),
    enrichedAt: v.optional(v.number()),
    sources: v.optional(v.array(v.object({ url: v.string(), title: v.string(), kind: v.string() }))),
    photoUrl: v.optional(v.string()),
    source: v.optional(v.string()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_key", ["ownerId", "key"])
    .index("by_linked_user", ["linkedUserId"]),

  updates: defineTable({
    personId: v.id("people"),
    ownerId: v.id("users"),
    kind: updateKind,
    text: v.string(),
    source: v.string(),
    cityId: v.optional(v.id("cities")),
    until: v.optional(v.number()),
    eventAt: v.optional(v.number()),
    place: v.optional(v.string()),
    at: v.number(),
    card: v.optional(cardSpec),
    url: v.optional(v.string()),
  })
    .index("by_owner_at", ["ownerId", "at"])
    .index("by_person_at", ["personId", "at"]),

  cities: defineTable({
    name: v.string(),
    country: v.string(),
    lat: v.number(),
    lon: v.number(),
  }).index("by_name", ["name"]),

  shares: defineTable({
    authorId: v.id("users"),
    text: v.string(),
    audience,
    cityId: v.optional(v.id("cities")),
    reach: v.number(),
    at: v.number(),
  }).index("by_author", ["authorId"]),

  products: defineTable({
    key: v.string(),
    name: v.string(),
    price: v.number(),
    deliveryDays: v.number(),
    tags: v.array(v.string()),
    imageUrl: v.optional(v.string()),
  }).index("by_key", ["key"]),

  gifts: defineTable({
    ownerId: v.id("users"),
    personId: v.id("people"),
    occasion: v.string(),
    productId: v.id("products"),
    reason: v.string(),
    alternatives: v.array(v.object({ productId: v.id("products"), reason: v.string() })),
    arriveBy: v.number(),
    status: giftStatus,
    via: v.optional(v.union(v.literal("app"), v.literal("imessage"))),
    checkoutId: v.optional(v.string()),
    paymentId: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_person", ["personId"])
    .index("by_checkout", ["checkoutId"]),

  rsvps: defineTable({
    ownerId: v.id("users"),
    updateId: v.id("updates"),
    going: v.boolean(),
  }).index("by_owner_update", ["ownerId", "updateId"]),

  reminders: defineTable({
    ownerId: v.id("users"),
    personId: v.optional(v.id("people")),
    kind: reminderKind,
    title: v.string(),
    body: v.string(),
    fireAt: v.number(),
    status: reminderStatus,
    channel: reminderChannel,
    sourceId: v.optional(v.string()),
    createdBy: v.union(v.literal("kin"), v.literal("user")),
    at: v.number(),
  })
    .index("by_owner_fireAt", ["ownerId", "fireAt"])
    .index("by_status_fireAt", ["status", "fireAt"])
    .index("by_owner_sourceId", ["ownerId", "sourceId"]),

  socialAccounts: defineTable({
    ownerId: v.id("users"),
    toolkit: socialToolkit,
    connectedAccountId: v.string(),
    status: v.string(),
    handle: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_toolkit", ["ownerId", "toolkit"]),

  socialEdges: defineTable({
    ownerId: v.id("users"),
    personId: v.id("people"),
    otherPersonId: v.optional(v.id("people")),
    otherHandle: v.string(),
    toolkit: socialToolkit,
    relation: v.union(v.literal("follows"), v.literal("followed_by"), v.literal("mutual"), v.literal("connection")),
    demo: v.optional(v.boolean()),
    at: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_person", ["personId"])
    .index("by_other", ["otherPersonId"]),

  agentThreads: defineTable({
    ownerId: v.id("users"),
    at: v.number(),
    status: v.optional(v.union(v.literal("idle"), v.literal("running"))),
    runAt: v.optional(v.number()),
    feedSignature: v.optional(v.string()),
  }).index("by_owner", ["ownerId"]),

  agentMessages: defineTable({
    threadId: v.id("agentThreads"),
    ownerId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("tool"), v.literal("event")),
    text: v.string(),
    action: v.optional(v.object({ type: v.string(), payload: v.any() })),
    toolName: v.optional(v.string()),
    toolInput: v.optional(v.any()),
    toolResult: v.optional(v.any()),
    toolUseId: v.optional(v.string()),
    status: v.optional(v.union(v.literal("pending"), v.literal("running"), v.literal("done"), v.literal("error"))),
    channel: v.optional(v.union(v.literal("app"), v.literal("imessage"))),
    at: v.number(),
  }).index("by_thread_at", ["threadId", "at"]),

  pushTokens: defineTable({
    userId: v.id("users"),
    token: v.string(),
    platform: v.string(),
    at: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_token", ["token"]),

  stories: defineTable({
    ownerId: v.id("users"),
    day: v.string(),
    status: v.union(v.literal("generating"), v.literal("ready"), v.literal("empty"), v.literal("error")),
    items: v.optional(
      v.array(
        v.object({
          personId: v.id("people"),
          updateId: v.optional(v.id("updates")),
          name: v.string(),
          hue: v.number(),
          photoUrl: v.optional(v.string()),
          kind: v.string(),
          text: v.string(),
          source: v.string(),
          upcoming: v.boolean(),
          at: v.optional(v.number()),
        }),
      ),
    ),
    seenAt: v.optional(v.number()),
    at: v.number(),
  }).index("by_owner_day", ["ownerId", "day"]),

  reels: defineTable({
    storyId: v.id("stories"),
    ownerId: v.id("users"),
    style: v.string(),
    order: v.number(),
    script: v.optional(v.any()),
    audioStorageId: v.optional(v.id("_storage")),
    audioProvider: v.optional(v.string()),
    videoStorageId: v.optional(v.id("_storage")),
    wordTimings: v.optional(v.array(v.object({ w: v.string(), s: v.number(), e: v.number(), t: v.number() }))),
    visuals: v.any(),
    status: v.union(v.literal("pending"), v.literal("scripting"), v.literal("voicing"), v.literal("ready"), v.literal("error")),
    error: v.optional(v.string()),
    at: v.number(),
  }).index("by_story", ["storyId"]),

  storySounds: defineTable({
    key: v.string(),
    storageId: v.id("_storage"),
    prompt: v.string(),
    credits: v.number(),
    at: v.number(),
  }).index("by_key", ["key"]),

  graphClusterNames: defineTable({
    ownerId: v.id("users"),
    signature: v.string(),
    names: v.array(v.object({ id: v.string(), name: v.string() })),
    at: v.number(),
  }).index("by_owner_signature", ["ownerId", "signature"]),

  updatePhotos: defineTable({
    updateId: v.id("updates"),
    storageId: v.id("_storage"),
    prompt: v.string(),
    credit: v.string(),
    at: v.number(),
  }).index("by_update", ["updateId"]),

  personas: defineTable({
    ownerId: v.id("users"),
    headline: v.string(),
    bio: v.string(),
    workingOn: v.string(),
    interests: v.array(v.string()),
    voice: v.string(),
    reach: v.string(),
    mayShare: v.string(),
    shareCity: v.boolean(),
    styleSource: v.optional(v.string()),
    builtAt: v.optional(v.number()),
    at: v.number(),
  }).index("by_owner", ["ownerId"]),

  agentConnections: defineTable({
    ownerId: v.id("users"),
    toolkit: v.string(),
    connectedAccountId: v.string(),
    status: v.string(),
    enabled: v.boolean(),
    at: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_toolkit", ["ownerId", "toolkit"]),

  agentShares: defineTable({
    ownerId: v.id("users"),
    token: v.string(),
    label: v.string(),
    scopes: v.array(v.union(v.literal("chat"), v.literal("book"))),
    expiresAt: v.optional(v.number()),
    revoked: v.boolean(),
    lastUsedAt: v.optional(v.number()),
    at: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_owner", ["ownerId"]),

  guestThreads: defineTable({
    ownerId: v.id("users"),
    shareId: v.id("agentShares"),
    guestName: v.optional(v.string()),
    kind: v.union(v.literal("human"), v.literal("agent")),
    summary: v.optional(v.string()),
    messageCount: v.number(),
    lastAt: v.number(),
    at: v.number(),
  })
    .index("by_share", ["shareId"])
    .index("by_owner_lastAt", ["ownerId", "lastAt"]),

  guestMessages: defineTable({
    threadId: v.id("guestThreads"),
    shareId: v.id("agentShares"),
    role: v.union(v.literal("guest"), v.literal("agent")),
    text: v.string(),
    slots: v.optional(v.array(v.object({ start: v.string(), label: v.string() }))),
    at: v.number(),
  })
    .index("by_thread_at", ["threadId", "at"])
    .index("by_share_at", ["shareId", "at"]),

  ownerInbox: defineTable({
    ownerId: v.id("users"),
    threadId: v.optional(v.id("guestThreads")),
    kind: v.union(v.literal("summary"), v.literal("meeting"), v.literal("message"), v.literal("booked")),
    text: v.string(),
    guestName: v.optional(v.string()),
    detail: v.optional(v.any()),
    status: v.union(v.literal("new"), v.literal("seen"), v.literal("done")),
    at: v.number(),
  })
    .index("by_owner_at", ["ownerId", "at"])
    .index("by_thread", ["threadId"]),

  giftOrders: defineTable({
    giftId: v.id("gifts"),
    ownerId: v.id("users"),
    mode: v.union(v.literal("live"), v.literal("demo")),
    payment: v.string(),
    token: v.string(),
    current: v.string(),
    steps: v.array(v.object({ key: v.string(), label: v.string(), detail: v.optional(v.string()), at: v.optional(v.number()) })),
    note: v.string(),
    cardId: v.optional(v.string()),
    cardLast4: v.optional(v.string()),
    cardLimitCents: v.optional(v.number()),
    address: v.optional(v.object({ name: v.string(), line1: v.string(), line2: v.optional(v.string()), city: v.string(), region: v.string(), postal: v.string(), notes: v.optional(v.string()) })),
    bountyId: v.optional(v.string()),
    humanName: v.optional(v.string()),
    humanCity: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    polls: v.optional(v.number()),
    at: v.number(),
  })
    .index("by_gift", ["giftId"])
    .index("by_token", ["token"]),
});
