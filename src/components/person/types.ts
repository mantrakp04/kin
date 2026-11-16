import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

export type PersonDetail = NonNullable<FunctionReturnType<typeof api.people.get>>;
