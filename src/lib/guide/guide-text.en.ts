import type { GuideText } from "./guide-structure";

const text: GuideText = {
  title: "AURA Guide",
  intro: "How to use every part of the app, step by step. Next to each step you see the button to tap, as it looks in the app; “Open” takes you straight there.",
  searchPlaceholder: "Search the guide…",
  noResults: "No topic found. Try another word.",
  open: "Open",
  replayTour: "Replay the app tour",
  chapters: {
    start: "First steps",
    wardrobe: "Your closet",
    outfits: "Outfits and Stylist",
    calendar: "Calendar and trips",
    avatar: "Avatar and virtual try-on",
    "colors-shopping": "Colours, shopping and insights",
    community: "Community",
    account: "Account and settings",
  },
  articles: {
    about: {
      title: "How AURA is organised",
      intro: "AURA is your digital closet: you photograph your pieces and the app suggests what to wear, every day. Five sections are always at the bottom.",
      steps: [
        "Home: today's look, chosen for the weather, plus shortcuts.",
        "Closet: all your pieces, and the + button to add more.",
        "Stylist: create outfits, ask for advice and find your looks.",
        "Calendar: what to wear day by day, your plans and trips.",
        "You: profile, avatar, colour analysis, insights and Settings.",
      ],
    },
    "first-pieces": {
      title: "Adding your first pieces",
      intro: "The fastest way is to upload several photos at once. Start with the pieces you wear most.",
      steps: [
        "On Home, in the First steps card, tap “Several photos”.",
        "Tap “Choose photos” and pick up to 50 photos from your gallery, one per piece.",
        "AURA removes the backgrounds and recognises the pieces in the background: you can keep using the app or close it.",
        "When the batch is ready, tap “Review”, check the pieces and add them to your closet.",
      ],
      tip: "Photos of the whole piece on a plain background give the best results.",
    },
    "first-look": {
      title: "Your first look",
      steps: [
        "With at least 3 pieces, Today's edit appears on Home: your look of the day.",
        "Tap “Style a look” to have another one created in the Stylist section.",
        "With 10 pieces or more you also get outfits for the week and for trips.",
      ],
    },
    "add-one": {
      title: "Adding a piece",
      steps: [
        "Open Closet.",
        "Tap the + button at the top.",
        "Choose “Add one piece”.",
        "Take a photo or pick one from your gallery.",
        "AURA removes the background and fills in type, colours, materials and season: check and correct if needed.",
        "Tap “Save to closet”.",
      ],
      tip: "Price and purchase date are optional, but they power cost per wear in your insights.",
    },
    "add-link": {
      title: "Adding a piece from a link",
      intro: "Bought it online? You can use the product page instead of a photo.",
      steps: [
        "In Closet tap + and then “Add one piece”.",
        "Tap “Paste product link”.",
        "Paste the link in the field (press and hold, then Paste) or tap “Paste from clipboard”.",
        "Tap “Import product”: AURA takes the photo, brand and price from the page. Check and save.",
      ],
    },
    batch: {
      title: "Adding many pieces at once",
      steps: [
        "In Closet tap +.",
        "Choose “Batch scan photos”.",
        "Pick up to 50 photos from your gallery, or paste product links.",
        "The photos are processed in the background: you can close the app, and you'll find a notice in your notifications when it's ready.",
        "Tap “Review”, choose the pieces to keep and add them to your closet.",
      ],
      tip: "If the service is unavailable, AURA tells you under the batch: try again later.",
    },
    "outfit-scan": {
      title: "Photographing a whole outfit",
      intro: "One photo of you dressed: AURA recognises all the pieces together.",
      steps: [
        "In Closet tap +.",
        "Choose “Scan one outfit” and take or pick a full-length photo.",
        "Check the pieces found: those already in your closet are matched, new ones you can add.",
        "If you wore it today, tap “Yes, log as worn”.",
      ],
    },
    find: {
      title: "Finding a piece",
      steps: [
        "Open Closet.",
        "Choose whether to see only this season's pieces or all seasons.",
        "Use search and the categories at the top to narrow the list.",
      ],
    },
    "item-card": {
      title: "A piece's card",
      steps: [
        "In Closet tap a piece to open its card.",
        "From here you can edit the details, remove the background or adjust the photo crop.",
        "“Create outfit from this” suggests looks built around that piece.",
        "You can mark it as lent, archive it if you no longer wear it, or delete it.",
      ],
    },
    locations: {
      title: "Several closets (home, seaside, city…)",
      intro: "If you keep clothes in different places, AURA can suggest only what you have at hand.",
      steps: [
        "Open You.",
        "Tap the gear to open Settings.",
        "Tap “Wardrobe locations” and create your places.",
      ],
    },
    today: {
      title: "Today's look",
      steps: [
        "On Home you'll find Today's edit, chosen from your pieces.",
        "Tap “Use location” or type your city: the look takes the weather into account.",
        "Looks also take your plans into account if you connect your calendar.",
      ],
    },
    canvas: {
      title: "Building an outfit yourself",
      steps: [
        "Open Stylist.",
        "Tap “Build manually”: the canvas opens.",
        "Tap “Add from closet” and choose the pieces.",
        "Move, resize and layer the pieces with your fingers.",
        "Tap “Save outfit”. You can also share it or put it in your calendar.",
      ],
    },
    "ask-stylist": {
      title: "Asking the stylist",
      intro: "Write or speak as you would to a person: “what should I wear to a garden wedding in June?”.",
      steps: [
        "Open Stylist.",
        "Tap “Ask your stylist”.",
        "Type your question, or tap the microphone, speak, and tap it again to finish.",
        "The suggested look uses your pieces: you can save it to the canvas or add it to your calendar.",
      ],
    },
    "ai-suggest": {
      title: "An outfit for an occasion",
      steps: [
        "Open Stylist and scroll to “More options”.",
        "Choose the occasion.",
        "Tap “AI suggest”: AURA puts together an outfit from your pieces.",
      ],
    },
    "work-week": {
      title: "Work outfits for the week",
      steps: [
        "Open Stylist.",
        "Tap “Create work outfits”.",
        "Choose the period and the closet to use, then tap “Generate”.",
        "Work days and dress code are set in Settings › Style preferences.",
      ],
    },
    "my-outfits": {
      title: "Your outfits",
      steps: [
        "Open Stylist and scroll to My Outfits.",
        "Upcoming: planned looks. Worn: what you've worn. My Outfit: your photos. Saved and Archive: the looks you kept.",
        "On each outfit you can share, duplicate, archive or delete it.",
      ],
    },
    worn: {
      title: "Logging what you wore",
      intro: "This way AURA knows what you really wear: suggestions improve and cost per wear is calculated.",
      steps: [
        "When AURA asks “Did you wear this?”, tap “Yes, this is what I wore”.",
        "Or in Calendar open the day and tap “Mark as worn”.",
        "Or take a photo of yourself with “Scan one outfit”.",
      ],
    },
    "plan-day": {
      title: "Planning a day",
      steps: [
        "Open Calendar.",
        "Tap a day in the week or month view.",
        "Plan an outfit, ask the stylist or pick the pieces yourself.",
        "At the end of the day you can mark it as worn.",
      ],
    },
    "connect-calendar": {
      title: "Connecting your calendar",
      intro: "With your plans, AURA suggests the right outfit for each appointment.",
      steps: [
        "Open You.",
        "Tap the gear to open Settings.",
        "Tap “Calendar”.",
        "Connect Google, Outlook or iCloud. iCloud needs an app-specific password, created at appleid.apple.com.",
      ],
      tip: "AURA only reads your events and never changes them. Credentials are stored encrypted.",
    },
    trips: {
      title: "Getting ready for a trip",
      steps: [
        "Open Calendar.",
        "Tap the suitcase at the top.",
        "Tap “Plan a trip”.",
        "Enter the destination (you can add stops), the dates, the kind of trip and which closet to pack from.",
        "AURA prepares the packing list and the outfits for each day, based on the forecast.",
      ],
    },
    "create-avatar": {
      title: "Creating your avatar",
      intro: "Your avatar is a full-length photo of you: it lets you see outfits worn by you.",
      steps: [
        "Open You.",
        "Tap “My Avatar”.",
        "Tap “Add your photo”: standing, facing the camera, full length, good light.",
        "Read and accept how the photo is used. You can then zoom and centre it, change it or delete it at any time.",
      ],
    },
    "try-on": {
      title: "Trying an outfit on your avatar",
      steps: [
        "On an outfit tap “Try on my avatar”, or choose the pieces yourself.",
        "Tap “Generate” and wait a few seconds.",
        "Save the result to your outfits or generate it again.",
        "How many try-ons you have depends on your plan: see Settings › Plan and usage.",
      ],
    },
    "color-analysis": {
      title: "Colour analysis",
      steps: [
        "Open You.",
        "Tap “Color analysis”.",
        "Take a photo of your face in natural light. It is analysed on your phone and never saved.",
        "Tap “Save to profile”: AURA will use your palette when matching pieces.",
      ],
    },
    "color-lab": {
      title: "Colour harmony",
      steps: [
        "Open Home.",
        "Tap Color Lab.",
        "Choose a piece and see which colours in your closet go with it.",
      ],
    },
    shop: {
      title: "What to buy (and what not to)",
      steps: [
        "Open Home.",
        "Tap “Shop your gaps”: AURA tells you which pieces you're really missing and how many of yours they'd go with.",
        "About to buy something? Tap “Should I buy it?” and paste the link or upload a photo: AURA compares it with what you already own.",
      ],
    },
    insights: {
      title: "Closet insights",
      steps: [
        "Open You.",
        "Tap “Wardrobe insights”.",
        "See your closet's value, cost per wear and pieces never worn. You can also get there from the wear rate on Home.",
      ],
    },
    friends: {
      title: "Friends and sharing",
      steps: [
        "Open You.",
        "Tap “Community” and choose your username.",
        "Show your QR code so friends can add you.",
        "Share an outfit with the share button: send it in a chat or post it to the Feed.",
        "“Invite friends” sends the link to get AURA.",
      ],
    },
    "profile-settings": {
      title: "Profile, sizes and preferences",
      intro: "The more AURA knows about you, the better the suggestions.",
      steps: [
        "From You, tap the gear to open Settings.",
        "Personal info: name, date of birth, work.",
        "My sizes: your clothing and shoe sizes.",
        "Style preferences: dress code at work, formality and work days.",
        "Dress preferences: what you'd rather avoid (bare shoulders, short skirts, high heels…).",
        "Language: Italian, English, Spanish or French.",
      ],
    },
    "notifications-privacy": {
      title: "Notifications and privacy",
      steps: [
        "Notifications: choose which alerts you get, for example when the weather changes for a planned outfit.",
        "Privacy: decide whether to share your pieces in the common library, anonymously.",
      ],
    },
    plan: {
      title: "Plan and usage",
      steps: [
        "In Settings tap “Plan and usage”.",
        "See your plan and how much of each limited feature you've used today and this month.",
      ],
    },
    problem: {
      title: "Reporting a problem",
      steps: [
        "In Settings tap “Report a problem”.",
        "Describe what happened and where: we read it and fix it.",
      ],
    },
    "delete-account": {
      title: "Deleting your account",
      steps: [
        "At the bottom of Settings tap “Delete account”.",
        "Confirm: your account, pieces, outfits, photos and avatar are deleted for good.",
      ],
    },
  },
};

export default text;
