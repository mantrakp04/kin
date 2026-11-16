import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily("birthday gift check", { hourUTC: 15, minuteUTC: 0 }, internal.demo.birthdayCheck);
crons.interval("reminders dispatch", { minutes: 5 }, internal.notify.dispatch);
crons.interval("kin agent feed refresh", { hours: 6 }, internal.agent.refreshAll);
crons.daily("social sync", { hourUTC: 11, minuteUTC: 0 }, internal.social.syncAll);
crons.daily("enrich contacts", { hourUTC: 11, minuteUTC: 0 }, internal.enrich.daily);
crons.hourly("stories at 7am local", { minuteUTC: 0 }, internal.stories.dailyTick);

export default crons;
