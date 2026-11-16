type Kind = "job" | "move" | "trip" | "milestone" | "event" | "post";

export type SeedCity = { name: string; country: string; lat: number; lon: number };

export type SeedUser = {
  key: string;
  name: string;
  city: string;
  role: string;
  hue: number;
  phone: string;
  keikiOptIn: boolean;
  budget: number;
  visibility: { city: boolean; birthday: boolean; jobChanges: boolean; trips: boolean };
};

export type SeedPerson = {
  key: string;
  name: string;
  hue: number;
  city: string;
  role: string;
  birthday: string;
  pronoun: string;
  handles: { linkedin?: string; x?: string; instagram?: string; strava?: string };
  interests: string[];
  lastContactDays: number;
  phone: string;
  email: string;
  close: boolean;
  linkedUser?: string;
  note?: string;
};

export type SeedUpdate = {
  person: string;
  kind: Kind;
  text: string;
  source: "LinkedIn" | "X" | "Instagram" | "Strava" | "Kin";
  hoursAgo: number;
  city?: string;
  until?: number;
  eventAt?: number;
  place?: string;
};

export type SeedProduct = { key: string; name: string; price: number; deliveryDays: number; tags: string[] };

export const cities: SeedCity[] = [
  { name: "New York", country: "United States", lat: 40.71, lon: -74.01 },
  { name: "Philadelphia", country: "United States", lat: 39.95, lon: -75.17 },
  { name: "Boston", country: "United States", lat: 42.36, lon: -71.06 },
  { name: "Princeton", country: "United States", lat: 40.36, lon: -74.67 },
  { name: "New Haven", country: "United States", lat: 41.31, lon: -72.92 },
  { name: "Providence", country: "United States", lat: 41.82, lon: -71.41 },
  { name: "San Francisco", country: "United States", lat: 37.77, lon: -122.42 },
  { name: "Austin", country: "United States", lat: 30.27, lon: -97.74 },
  { name: "Chicago", country: "United States", lat: 41.88, lon: -87.63 },
  { name: "Mexico City", country: "Mexico", lat: 19.43, lon: -99.13 },
  { name: "London", country: "United Kingdom", lat: 51.51, lon: -0.13 },
  { name: "Lisbon", country: "Portugal", lat: 38.72, lon: -9.14 },
  { name: "Berlin", country: "Germany", lat: 52.52, lon: 13.4 },
  { name: "Bangalore", country: "India", lat: 12.97, lon: 77.59 },
  { name: "Kyoto", country: "Japan", lat: 35.01, lon: 135.77 },
  { name: "Sydney", country: "Australia", lat: -33.87, lon: 151.21 },
];

const allVisible = { city: true, birthday: true, jobChanges: true, trips: true };

export const users: SeedUser[] = [
  { key: "alex", name: "Alex Rivera", city: "New York", role: "Product manager", hue: 250, phone: "+15555550100", keikiOptIn: false, budget: 60, visibility: allVisible },
  { key: "maya", name: "Maya Chen", city: "San Francisco", role: "Product designer at Figma", hue: 336, phone: "+15555550116", keikiOptIn: false, budget: 60, visibility: allVisible },
];

export const alexPeople: SeedPerson[] = [
  { key: "maya", name: "Maya Chen", hue: 336, city: "San Francisco", role: "Product designer at Figma", birthday: "11-16-1999", pronoun: "she", handles: { linkedin: "mayachen", instagram: "maya.shoots.film", strava: "mayachen" }, interests: ["Film photography", "Bouldering", "Matcha", "Sally Rooney"], lastContactDays: 9, phone: "+15555550116", email: "maya@mayachen.studio", close: true, linkedUser: "maya", note: "Met at the Config afterparty in 2023." },
  { key: "arjun", name: "Arjun Mehta", hue: 24, city: "New York", role: "Design lead at Stripe", birthday: "03-08-1994", pronoun: "he", handles: { linkedin: "arjunmehta", x: "arjunmakes" }, interests: ["Design systems", "Typography", "Pour-over coffee", "Cricket"], lastContactDays: 12, phone: "+15555550121", email: "arjun@mehta.design", close: true },
  { key: "sofia", name: "Sofia Ruiz", hue: 12, city: "New York", role: "Photographer", birthday: "07-22-1996", pronoun: "she", handles: { instagram: "sofiaruiz.photo", x: "sofiaruiz" }, interests: ["Portrait photography", "Natural wine", "Ceramics", "Travel"], lastContactDays: 21, phone: "+15555550122", email: "hello@sofiaruiz.photo", close: true, note: "Lives in Brooklyn." },
  { key: "leo", name: "Leo Park", hue: 200, city: "New York", role: "Founder of Tiny Labs", birthday: "05-30-1993", pronoun: "he", handles: { linkedin: "leopark", x: "leopark" }, interests: ["Hardware startups", "Synthesizers", "Cycling", "Korean barbecue"], lastContactDays: 6, phone: "+15555550123", email: "leo@tinylabs.dev", close: true },
  { key: "priya", name: "Priya Nair", hue: 300, city: "Austin", role: "Battery engineer at Tesla", birthday: "09-14-1995", pronoun: "she", handles: { linkedin: "priyanair", instagram: "priya.n", strava: "priyanair" }, interests: ["Trail running", "Indian cooking", "Electric vehicles", "Podcasts"], lastContactDays: 34, phone: "+15555550124", email: "priya.nair@fastmail.net", close: true },
  { key: "sam", name: "Sam Okafor", hue: 140, city: "Chicago", role: "High school history teacher", birthday: "02-11-1992", pronoun: "he", handles: { strava: "samokafor", x: "mrokafor" }, interests: ["Marathon running", "History podcasts", "Jazz", "Chess"], lastContactDays: 45, phone: "+15555550125", email: "sam.okafor@hey.com", close: true },
  { key: "nina", name: "Nina Volkova", hue: 180, city: "Berlin", role: "Architect", birthday: "12-03-1991", pronoun: "she", handles: { instagram: "nina.volkova", linkedin: "ninavolkova" }, interests: ["Japanese architecture", "Sketching", "Tea ceremony", "Brutalism"], lastContactDays: 60, phone: "+15555550126", email: "nina@volkova-studio.de", close: true },
  { key: "daniel", name: "Daniel Brooks", hue: 96, city: "New York", role: "Software engineer at Datadog", birthday: "11-21-1993", pronoun: "he", handles: { strava: "dbrooks", x: "danbrooks" }, interests: ["Road cycling", "Espresso", "Sci-fi novels", "Jazz"], lastContactDays: 4, phone: "+15555550127", email: "daniel@brooks.dev", close: true },
  { key: "hannah", name: "Hannah Lee", hue: 348, city: "New York", role: "Editor at Penguin Random House", birthday: "04-17-1994", pronoun: "she", handles: { x: "hannahreads", instagram: "hannah.lee.reads" }, interests: ["Literary fiction", "Book clubs", "Crosswords", "Poetry"], lastContactDays: 18, phone: "+15555550128", email: "hannah.lee@inkmail.com", close: false },
  { key: "marcus", name: "Marcus Bell", hue: 36, city: "New York", role: "Sous chef at Lilia", birthday: "08-05-1990", pronoun: "he", handles: { instagram: "marcuscooks" }, interests: ["Fresh pasta", "Knives", "Natural wine", "Fermentation"], lastContactDays: 27, phone: "+15555550129", email: "marcus@bellkitchen.co", close: false },
  { key: "olivia", name: "Olivia Grant", hue: 276, city: "New York", role: "Senior product manager at Spotify", birthday: "06-12-1995", pronoun: "she", handles: { linkedin: "oliviagrant", x: "livgrant", instagram: "liv.grant" }, interests: ["Vinyl records", "City pop", "Pilates", "Product strategy"], lastContactDays: 8, phone: "+15555550130", email: "olivia@grant.fm", close: true },
  { key: "ben", name: "Ben Torres", hue: 120, city: "New York", role: "Running coach", birthday: "01-25-1991", pronoun: "he", handles: { strava: "bentorres", instagram: "bentorres.runs" }, interests: ["Half marathons", "Run clubs", "Sports science", "Tacos"], lastContactDays: 3, phone: "+15555550131", email: "coach@bentorres.run", close: true },
  { key: "julia", name: "Julia Novak", hue: 60, city: "New York", role: "Architect at SOM", birthday: "10-02-1992", pronoun: "she", handles: { instagram: "julia.novak", x: "julianovak" }, interests: ["Mid-century furniture", "Japanese houses", "Drawing", "Plants"], lastContactDays: 40, phone: "+15555550132", email: "julia@novak.studio", close: false },
  { key: "ethan", name: "Ethan Cole", hue: 228, city: "Philadelphia", role: "Resident physician at Penn Medicine", birthday: "03-29-1993", pronoun: "he", handles: { linkedin: "ethancolemd", instagram: "ethan.brews" }, interests: ["Pour-over coffee", "Cardiology", "Rowing", "Board games"], lastContactDays: 72, phone: "+15555550133", email: "ethan.cole@medmail.org", close: false },
  { key: "grace", name: "Grace Kim", hue: 312, city: "Boston", role: "PhD student at MIT", birthday: "02-28-1997", pronoun: "she", handles: { strava: "gracekim", linkedin: "gracekim" }, interests: ["Sport climbing", "Robotics", "Baking", "Indie games"], lastContactDays: 15, phone: "+15555550134", email: "grace.kim@labmail.org", close: true },
  { key: "tom", name: "Tom Walsh", hue: 156, city: "Boston", role: "Analyst at Fidelity", birthday: "07-07-1990", pronoun: "he", handles: {}, interests: ["Red Sox", "Golf", "Craft beer"], lastContactDays: 120, phone: "+15555550135", email: "tom.walsh@mailbox.org", close: false },
  { key: "isabel", name: "Isabel Duarte", hue: 264, city: "Princeton", role: "Postdoc in astrophysics", birthday: "05-09-1993", pronoun: "she", handles: { x: "isaduarte", instagram: "isabel.tea" }, interests: ["Oolong tea", "Astrophysics", "Stargazing", "Bossa nova"], lastContactDays: 55, phone: "+15555550136", email: "isabel@duarte.science", close: false },
  { key: "will", name: "Will Harper", hue: 84, city: "New Haven", role: "Law student at Yale", birthday: "09-30-1998", pronoun: "he", handles: { linkedin: "willharper" }, interests: ["Debate", "Squash", "Political history"], lastContactDays: 90, phone: "+15555550137", email: "will.harper@lawmail.org", close: false },
  { key: "chloe", name: "Chloe Martin", hue: 324, city: "Providence", role: "Exhibition designer at RISD Museum", birthday: "12-19-1996", pronoun: "she", handles: { instagram: "chloe.prints" }, interests: ["Risograph printing", "Ceramics", "Zines", "Thrifting"], lastContactDays: 38, phone: "+15555550138", email: "chloe@martinprints.art", close: false },
  { key: "diego", name: "Diego Hernández", hue: 48, city: "Mexico City", role: "Coffee roaster at Café Tormenta", birthday: "04-03-1992", pronoun: "he", handles: { instagram: "diego.tueste", x: "diegohdz" }, interests: ["Specialty coffee", "Mezcal", "Street photography", "Football"], lastContactDays: 25, phone: "+15555550139", email: "diego@cafetormenta.mx", close: true },
  { key: "emma", name: "Emma Clarke", hue: 0, city: "London", role: "Head of Strategy at Monzo", birthday: "08-24-1994", pronoun: "she", handles: { linkedin: "emmaclarke", x: "emmaclarke" }, interests: ["Travel", "Fintech", "Open water swimming", "Theatre"], lastContactDays: 30, phone: "+15555550140", email: "emma@clarke.uk", close: true },
  { key: "james", name: "James Whitfield", hue: 216, city: "London", role: "Music producer", birthday: "06-01-1991", pronoun: "he", handles: { x: "jwhitfield", instagram: "james.whitfield" }, interests: ["Electronic music", "Synthesizers", "Vinyl records", "Running"], lastContactDays: 80, phone: "+15555550141", email: "james@whitfield.audio", close: false },
  { key: "ines", name: "Inês Costa", hue: 168, city: "Lisbon", role: "UX researcher at Farfetch", birthday: "03-15-1995", pronoun: "she", handles: { linkedin: "inescosta", instagram: "ines.costa" }, interests: ["Bookshops", "Surfing", "Research methods", "Fado"], lastContactDays: 50, phone: "+15555550142", email: "ines@costa.pt", close: false },
  { key: "lukas", name: "Lukas Weber", hue: 108, city: "Berlin", role: "Staff engineer at N26", birthday: "10-20-1990", pronoun: "he", handles: { strava: "lukasweber", linkedin: "lukasweber" }, interests: ["Bikepacking", "Techno", "Rust", "Bread baking"], lastContactDays: 100, phone: "+15555550143", email: "lukas@weber.berlin", close: false },
  { key: "rohan", name: "Rohan Iyer", hue: 72, city: "Bangalore", role: "Engineer at Flipkart", birthday: "01-09-1994", pronoun: "he", handles: { x: "rohaniyer", strava: "rohaniyer" }, interests: ["South Indian cooking", "10K races", "Carnatic music", "Cricket"], lastContactDays: 22, phone: "+15555550144", email: "rohan@iyer.in", close: true },
  { key: "kenji", name: "Kenji Tanaka", hue: 192, city: "Kyoto", role: "Ceramicist", birthday: "08-16-1988", pronoun: "he", handles: { instagram: "kenji.tanaka.ceramics" }, interests: ["Tea bowls", "Wood firing", "Gardens", "Hiking"], lastContactDays: 150, phone: "+15555550145", email: "kenji@tanaka-kiln.jp", close: false },
  { key: "zoe", name: "Zoe Mitchell", hue: 240, city: "Sydney", role: "Marine biologist", birthday: "11-28-1995", pronoun: "she", handles: {}, interests: ["Scuba diving", "Coral reefs", "Surfing"], lastContactDays: 200, phone: "+15555550146", email: "zoe.mitchell@oceanmail.au", close: false },
  { key: "noah", name: "Noah Fischer", hue: 288, city: "San Francisco", role: "Engineer at Airbnb", birthday: "02-04-1993", pronoun: "he", handles: { x: "noahfischer", instagram: "noah.f" }, interests: ["Travel", "Mechanical keyboards", "Hiking", "Ramen"], lastContactDays: 14, phone: "+15555550147", email: "noah@fischer.io", close: false },
  { key: "ava", name: "Ava Patel", hue: 354, city: "New York", role: "Pediatric nurse at NYU Langone", birthday: "05-21-1996", pronoun: "she", handles: {}, interests: ["Yoga", "Musicals", "Baking"], lastContactDays: 33, phone: "+15555550148", email: "ava.patel@carenet.org", close: false },
  { key: "chris", name: "Chris Nguyen", hue: 132, city: "New York", role: "Bartender at Attaboy", birthday: "09-08-1992", pronoun: "he", handles: {}, interests: ["Cocktails", "Basketball", "Vietnamese food"], lastContactDays: 65, phone: "+15555550149", email: "chris@nguyen.bar", close: false },
];

export const mayaPeople: SeedPerson[] = [
  { key: "alex", name: "Alex Rivera", hue: 250, city: "New York", role: "Product manager", birthday: "06-18-1994", pronoun: "they", handles: { linkedin: "alexrivera", x: "alexrivera" }, interests: ["Product strategy", "Running", "Jazz", "Pour-over coffee"], lastContactDays: 9, phone: "+15555550100", email: "alex@rivera.work", close: true, linkedUser: "alex" },
  { key: "noah", name: "Noah Fischer", hue: 288, city: "San Francisco", role: "Engineer at Airbnb", birthday: "02-04-1993", pronoun: "he", handles: { x: "noahfischer" }, interests: ["Travel", "Mechanical keyboards", "Ramen"], lastContactDays: 2, phone: "+15555550147", email: "noah@fischer.io", close: true },
  { key: "lena", name: "Lena Ortiz", hue: 20, city: "San Francisco", role: "Illustrator", birthday: "04-11-1998", pronoun: "she", handles: { instagram: "lena.draws" }, interests: ["Watercolor", "Bouldering", "Comics"], lastContactDays: 5, phone: "+15555550160", email: "lena@ortiz.art", close: true },
  { key: "kai", name: "Kai Yamamoto", hue: 170, city: "San Francisco", role: "Barista at Sightglass", birthday: "07-30-1997", pronoun: "he", handles: { instagram: "kai.pours" }, interests: ["Latte art", "Film photography", "Skateboarding"], lastContactDays: 11, phone: "+15555550161", email: "kai@yamamoto.cafe", close: false },
  { key: "priya", name: "Priya Nair", hue: 300, city: "Austin", role: "Battery engineer at Tesla", birthday: "09-14-1995", pronoun: "she", handles: { linkedin: "priyanair" }, interests: ["Trail running", "Indian cooking"], lastContactDays: 40, phone: "+15555550124", email: "priya.nair@fastmail.net", close: false },
  { key: "jordan", name: "Jordan Blake", hue: 210, city: "Chicago", role: "Product designer at Duolingo", birthday: "12-12-1996", pronoun: "they", handles: { x: "jordanblake" }, interests: ["Type design", "Board games", "Pottery"], lastContactDays: 28, phone: "+15555550162", email: "jordan@blake.design", close: false },
];

const H = 1;
const D = 24;
const LISBON_UNTIL = Date.UTC(2026, 10, 28, 23, 0);
const KYOTO_UNTIL = Date.UTC(2026, 11, 6, 14, 0);
const NOAH_NY_UNTIL = Date.UTC(2026, 10, 18, 23, 0);
const LEO_LAUNCH = Date.UTC(2026, 10, 21, 0, 0);

export const alexUpdates: SeedUpdate[] = [
  { person: "arjun", kind: "job", text: "Started a new job as Design Lead at Stripe.", source: "LinkedIn", hoursAgo: 2 * H },
  { person: "sofia", kind: "trip", text: "In Lisbon until November 28.", source: "Instagram", hoursAgo: 4 * H, city: "Lisbon", until: LISBON_UNTIL },
  { person: "leo", kind: "event", text: "Hosting launch drinks for Tiny Labs.", source: "Kin", hoursAgo: 7 * H, eventAt: LEO_LAUNCH, place: "Brooklyn" },
  { person: "priya", kind: "move", text: "Moved to Austin, Texas.", source: "LinkedIn", hoursAgo: 1 * D, city: "Austin" },
  { person: "ben", kind: "milestone", text: "Ran a 1:24 half marathon in Prospect Park.", source: "Strava", hoursAgo: 1 * D + 5, city: "New York" },
  { person: "noah", kind: "trip", text: "Visiting New York until November 18.", source: "Instagram", hoursAgo: 1 * D + 9, city: "New York", until: NOAH_NY_UNTIL },
  { person: "sam", kind: "milestone", text: "Finished the Chicago Marathon in 3:41.", source: "Strava", hoursAgo: 2 * D, city: "Chicago" },
  { person: "marcus", kind: "post", text: "Posted a recipe for brown butter cacio e pepe.", source: "Instagram", hoursAgo: 2 * D + 6 },
  { person: "diego", kind: "post", text: "Launched a new single-origin roast from Oaxaca.", source: "Instagram", hoursAgo: 2 * D + 11 },
  { person: "nina", kind: "trip", text: "Posted 12 photos from Kyoto.", source: "Instagram", hoursAgo: 3 * D, city: "Kyoto", until: KYOTO_UNTIL },
  { person: "grace", kind: "milestone", text: "Sent her first 5.11 at Rumney.", source: "Strava", hoursAgo: 3 * D + 4 },
  { person: "hannah", kind: "post", text: "Shared her favorite debut novels of the year.", source: "X", hoursAgo: 3 * D + 8 },
  { person: "rohan", kind: "post", text: "Shared a recipe for his grandmother's sambar.", source: "X", hoursAgo: 3 * D + 15 },
  { person: "olivia", kind: "post", text: "Shared a playlist of Japanese city pop.", source: "X", hoursAgo: 4 * D },
  { person: "james", kind: "milestone", text: "Released a four-track EP on Bandcamp.", source: "X", hoursAgo: 4 * D + 6 },
  { person: "sofia", kind: "post", text: "Posted a portrait series from Alfama.", source: "Instagram", hoursAgo: 4 * D + 20 },
  { person: "daniel", kind: "milestone", text: "Rode 100 miles from Brooklyn to Montauk.", source: "Strava", hoursAgo: 5 * D },
  { person: "chloe", kind: "post", text: "Opened a risograph print show in Providence.", source: "Instagram", hoursAgo: 5 * D + 3 },
  { person: "kenji", kind: "post", text: "Fired a new batch of tea bowls.", source: "Instagram", hoursAgo: 5 * D + 10 },
  { person: "nina", kind: "post", text: "Toured the gardens at Katsura Imperial Villa.", source: "Instagram", hoursAgo: 5 * D + 16 },
  { person: "maya", kind: "post", text: "Saved a post comparing half-frame film cameras.", source: "Instagram", hoursAgo: 6 * D },
  { person: "julia", kind: "post", text: "Posted photos of a restored Eames lounge chair.", source: "Instagram", hoursAgo: 6 * D + 7 },
  { person: "emma", kind: "post", text: "Booked a month in Japan for next spring.", source: "X", hoursAgo: 6 * D + 13 },
  { person: "noah", kind: "post", text: "Shipped a redesign of Airbnb Experiences search.", source: "X", hoursAgo: 6 * D + 20 },
  { person: "priya", kind: "job", text: "Started as a battery engineer at Giga Texas.", source: "LinkedIn", hoursAgo: 7 * D },
  { person: "ethan", kind: "post", text: "Posted a pour-over setup with a new gooseneck kettle.", source: "Instagram", hoursAgo: 7 * D + 5 },
  { person: "lukas", kind: "milestone", text: "Rode from Berlin to Copenhagen in three days.", source: "Strava", hoursAgo: 7 * D + 12 },
  { person: "isabel", kind: "post", text: "Shared notes from a gongfu oolong tasting.", source: "Instagram", hoursAgo: 8 * D },
  { person: "leo", kind: "milestone", text: "Raised a seed round for Tiny Labs.", source: "LinkedIn", hoursAgo: 8 * D + 6 },
  { person: "ines", kind: "post", text: "Posted a guide to Lisbon's best bookshops.", source: "Instagram", hoursAgo: 9 * D },
  { person: "arjun", kind: "post", text: "Gave a talk on design systems at Config.", source: "X", hoursAgo: 9 * D + 8 },
  { person: "hannah", kind: "post", text: "Started a newsletter about debut fiction.", source: "X", hoursAgo: 9 * D + 18 },
  { person: "olivia", kind: "job", text: "Promoted to senior product manager at Spotify.", source: "LinkedIn", hoursAgo: 10 * D },
  { person: "james", kind: "post", text: "Played a DJ set at Phonox in Brixton.", source: "Instagram", hoursAgo: 10 * D + 9 },
  { person: "ben", kind: "post", text: "Started coaching a beginners run club in Brooklyn.", source: "Instagram", hoursAgo: 11 * D },
  { person: "maya", kind: "post", text: "Saved a review of the Kodak Ektar H35.", source: "Instagram", hoursAgo: 12 * D },
  { person: "grace", kind: "milestone", text: "Defended her thesis proposal at MIT.", source: "LinkedIn", hoursAgo: 12 * D + 5 },
  { person: "rohan", kind: "milestone", text: "Ran the Bengaluru 10K in 44 minutes.", source: "Strava", hoursAgo: 12 * D + 14 },
  { person: "chloe", kind: "post", text: "Posted new risograph prints from the studio.", source: "Instagram", hoursAgo: 13 * D },
  { person: "maya", kind: "milestone", text: "Sent her first V5 at Mission Cliffs.", source: "Strava", hoursAgo: 14 * D },
  { person: "marcus", kind: "post", text: "Started a Sunday pasta supper club in Greenpoint.", source: "Instagram", hoursAgo: 14 * D + 6 },
  { person: "diego", kind: "milestone", text: "Opened a second café in Roma Norte.", source: "Instagram", hoursAgo: 15 * D, city: "Mexico City" },
  { person: "sofia", kind: "post", text: "Shot an editorial for Kinfolk in Brooklyn.", source: "Instagram", hoursAgo: 16 * D },
  { person: "julia", kind: "post", text: "Shared a reading list on Japanese residential architecture.", source: "X", hoursAgo: 16 * D + 10 },
  { person: "ines", kind: "post", text: "Spoke at a UX research conference in Porto.", source: "LinkedIn", hoursAgo: 17 * D },
  { person: "daniel", kind: "post", text: "Joined a gravel ride through the Hudson Valley.", source: "Strava", hoursAgo: 18 * D },
  { person: "emma", kind: "job", text: "Started a new job as Head of Strategy at Monzo.", source: "LinkedIn", hoursAgo: 19 * D },
  { person: "olivia", kind: "post", text: "Bought a turntable and started collecting records.", source: "Instagram", hoursAgo: 20 * D },
  { person: "kenji", kind: "post", text: "Opened his kiln for a weekend open studio.", source: "Instagram", hoursAgo: 20 * D + 8 },
  { person: "hannah", kind: "post", text: "Hosted a book club on Intermezzo.", source: "Instagram", hoursAgo: 21 * D },
  { person: "maya", kind: "post", text: "Saved a roll shot on a half-frame camera.", source: "Instagram", hoursAgo: 21 * D + 6 },
  { person: "isabel", kind: "milestone", text: "Published a paper on dark matter halos.", source: "X", hoursAgo: 22 * D },
  { person: "sam", kind: "post", text: "Logged a 20-mile long run along the lakefront.", source: "Strava", hoursAgo: 23 * D },
  { person: "lukas", kind: "job", text: "Joined N26 as a staff engineer.", source: "LinkedIn", hoursAgo: 23 * D + 9 },
  { person: "daniel", kind: "milestone", text: "Logged 3,000 miles of bike commuting this year.", source: "Strava", hoursAgo: 25 * D },
  { person: "ethan", kind: "milestone", text: "Matched into a cardiology fellowship at Penn.", source: "LinkedIn", hoursAgo: 25 * D + 12 },
  { person: "ben", kind: "milestone", text: "Paced a client to a Boston qualifier.", source: "Strava", hoursAgo: 27 * D },
  { person: "diego", kind: "post", text: "Roasted beans for a public cupping in Condesa.", source: "Instagram", hoursAgo: 28 * D },
  { person: "kenji", kind: "post", text: "Shared a short film about wood firing.", source: "Instagram", hoursAgo: 29 * D },
];

export const mayaUpdates: SeedUpdate[] = [
  { person: "lena", kind: "post", text: "Posted a new zine about Bay Area climbing gyms.", source: "Instagram", hoursAgo: 5 * H },
  { person: "priya", kind: "move", text: "Moved to Austin, Texas.", source: "LinkedIn", hoursAgo: 1 * D, city: "Austin" },
  { person: "noah", kind: "trip", text: "Visiting New York until November 18.", source: "Instagram", hoursAgo: 1 * D + 9, city: "New York", until: NOAH_NY_UNTIL },
  { person: "kai", kind: "post", text: "Shot a roll of Portra 400 at Ocean Beach.", source: "Instagram", hoursAgo: 2 * D },
  { person: "jordan", kind: "job", text: "Started a new job as Product Designer at Duolingo.", source: "LinkedIn", hoursAgo: 6 * D },
];

export const products: SeedProduct[] = [
  { key: "kodak-ektar-h35", name: "Kodak Ektar H35", price: 54, deliveryDays: 3, tags: ["film photography", "half-frame", "camera", "analog", "travel"] },
  { key: "kodak-portra-400-3pack", name: "Kodak Portra 400, 3 rolls", price: 48, deliveryDays: 2, tags: ["film photography", "film roll", "analog", "portrait", "35mm"] },
  { key: "ilford-hp5-3pack", name: "Ilford HP5 Plus 400, 3 rolls", price: 29, deliveryDays: 3, tags: ["film photography", "black and white", "film roll", "analog", "35mm"] },
  { key: "instax-mini-12", name: "Fujifilm Instax Mini 12", price: 80, deliveryDays: 4, tags: ["photography", "instant camera", "party", "gift", "analog"] },
  { key: "lomography-simple-use", name: "Lomography Simple Use Camera", price: 25, deliveryDays: 4, tags: ["film photography", "camera", "analog", "travel", "fun"] },
  { key: "garmin-hrm-dual", name: "Garmin HRM-Dual Heart Rate Monitor", price: 70, deliveryDays: 3, tags: ["running", "training", "cycling", "fitness", "tech"] },
  { key: "balega-hidden-comfort-3pack", name: "Balega Hidden Comfort Running Socks, 3 pairs", price: 45, deliveryDays: 2, tags: ["running", "marathon", "apparel", "comfort", "everyday"] },
  { key: "salomon-pulse-belt", name: "Salomon Pulse Running Belt", price: 35, deliveryDays: 4, tags: ["running", "trail running", "marathon", "gear", "outdoors"] },
  { key: "petzl-bindi", name: "Petzl Bindi Headlamp", price: 50, deliveryDays: 3, tags: ["running", "climbing", "outdoors", "camping", "gear"] },
  { key: "born-to-run", name: "Born to Run by Christopher McDougall", price: 17, deliveryDays: 2, tags: ["books", "running", "nonfiction", "adventure", "marathon"] },
  { key: "bd-mojo-chalk-bag", name: "Black Diamond Mojo Chalk Bag", price: 25, deliveryDays: 3, tags: ["climbing", "bouldering", "chalk", "gear", "outdoors"] },
  { key: "friction-labs-unicorn-dust", name: "Friction Labs Unicorn Dust Chalk", price: 20, deliveryDays: 3, tags: ["climbing", "bouldering", "chalk", "gear", "gym"] },
  { key: "hario-v60-kit", name: "Hario V60 Pour-Over Kit", price: 40, deliveryDays: 3, tags: ["coffee", "pour-over", "kitchen", "morning", "brewing"] },
  { key: "aeropress-original", name: "AeroPress Original Coffee Maker", price: 40, deliveryDays: 2, tags: ["coffee", "travel", "espresso", "brewing", "kitchen"] },
  { key: "timemore-c2-grinder", name: "Timemore Chestnut C2 Hand Grinder", price: 69, deliveryDays: 5, tags: ["coffee", "grinder", "pour-over", "travel", "brewing"] },
  { key: "jade-leaf-matcha-kit", name: "Jade Leaf Matcha Starter Kit", price: 49, deliveryDays: 4, tags: ["matcha", "tea", "japanese", "morning", "kitchen"] },
  { key: "ippodo-sayaka-matcha", name: "Ippodo Sayaka Matcha, 40g", price: 36, deliveryDays: 5, tags: ["matcha", "tea", "japanese", "ceremony", "kyoto"] },
  { key: "hario-glass-teapot", name: "Hario Glass Teapot, 700ml", price: 28, deliveryDays: 3, tags: ["tea", "oolong", "kitchen", "glass", "brewing"] },
  { key: "lodge-cast-iron-10", name: "Lodge 10.25-inch Cast Iron Skillet", price: 30, deliveryDays: 3, tags: ["cooking", "kitchen", "cast iron", "home", "essentials"] },
  { key: "microplane-zester", name: "Microplane Premium Classic Zester", price: 16, deliveryDays: 2, tags: ["cooking", "kitchen", "pasta", "baking", "tools"] },
  { key: "salt-fat-acid-heat", name: "Salt Fat Acid Heat by Samin Nosrat", price: 24, deliveryDays: 2, tags: ["books", "cooking", "recipes", "kitchen", "food"] },
  { key: "opinel-no8", name: "Opinel No. 8 Folding Knife", price: 22, deliveryDays: 3, tags: ["cooking", "outdoors", "travel", "camping", "knives"] },
  { key: "intermezzo-rooney", name: "Intermezzo by Sally Rooney", price: 20, deliveryDays: 2, tags: ["books", "fiction", "sally rooney", "literary", "novel"] },
  { key: "tomorrow-and-tomorrow", name: "Tomorrow, and Tomorrow, and Tomorrow by Gabrielle Zevin", price: 18, deliveryDays: 2, tags: ["books", "fiction", "games", "literary", "novel"] },
  { key: "design-of-everyday-things", name: "The Design of Everyday Things by Don Norman", price: 20, deliveryDays: 2, tags: ["books", "design", "product", "ux", "nonfiction"] },
  { key: "sony-mdr-7506", name: "Sony MDR-7506 Headphones", price: 99, deliveryDays: 3, tags: ["music", "headphones", "studio", "audio", "production"] },
  { key: "at-record-care-kit", name: "Audio-Technica AT6012 Record Care Kit", price: 25, deliveryDays: 4, tags: ["music", "vinyl", "records", "turntable", "home"] },
  { key: "jbl-clip-5", name: "JBL Clip 5 Portable Speaker", price: 80, deliveryDays: 3, tags: ["music", "speaker", "travel", "outdoors", "audio"] },
  { key: "rapha-cycling-cap", name: "Rapha Cycling Cap", price: 45, deliveryDays: 5, tags: ["cycling", "apparel", "road cycling", "gear", "riding"] },
  { key: "knog-blinder-mini", name: "Knog Blinder Mini Bike Light Set", price: 60, deliveryDays: 4, tags: ["cycling", "commuting", "safety", "gear", "lights"] },
  { key: "topeak-mini-20-pro", name: "Topeak Mini 20 Pro Multi-Tool", price: 35, deliveryDays: 3, tags: ["cycling", "tools", "bikepacking", "gear", "repair"] },
  { key: "peak-design-packing-cube", name: "Peak Design Packing Cube, Medium", price: 40, deliveryDays: 4, tags: ["travel", "packing", "organization", "design", "luggage"] },
  { key: "bellroy-travel-wallet", name: "Bellroy Travel Wallet", price: 99, deliveryDays: 5, tags: ["travel", "wallet", "leather", "design", "passport"] },
  { key: "cabeau-evolution-s3", name: "Cabeau Evolution S3 Travel Pillow", price: 40, deliveryDays: 3, tags: ["travel", "flights", "sleep", "comfort", "accessories"] },
  { key: "lamy-safari", name: "Lamy Safari Fountain Pen", price: 35, deliveryDays: 3, tags: ["design", "writing", "stationery", "drawing", "office"] },
  { key: "moleskine-classic", name: "Moleskine Classic Notebook, Large", price: 25, deliveryDays: 2, tags: ["design", "stationery", "sketching", "writing", "travel"] },
  { key: "field-notes-3pack", name: "Field Notes Original Kraft, 3-pack", price: 15, deliveryDays: 3, tags: ["design", "stationery", "notebook", "pocket", "writing"] },
  { key: "aesop-resurrection-balm", name: "Aesop Resurrection Aromatique Hand Balm", price: 35, deliveryDays: 3, tags: ["home", "self-care", "skincare", "gift", "design"] },
  { key: "diptyque-baies-candle", name: "Diptyque Baies Candle", price: 78, deliveryDays: 4, tags: ["home", "candle", "fragrance", "gift", "cozy"] },
  { key: "hay-kaleido-tray", name: "HAY Kaleido Tray, Medium", price: 30, deliveryDays: 6, tags: ["home", "design", "decor", "scandinavian", "organization"] },
];

export const mayaGift = {
  occasion: "27th birthday",
  person: "maya",
  product: "kodak-ektar-h35",
  reason: "She saved three posts about half-frame cameras this month.",
  alternatives: [
    { product: "kodak-portra-400-3pack", reason: "Three rolls of the film she shoots most." },
    { product: "jade-leaf-matcha-kit", reason: "Matcha is part of her morning routine." },
    { product: "bd-mojo-chalk-bag", reason: "She just sent her first V5 at Mission Cliffs." },
  ],
};
