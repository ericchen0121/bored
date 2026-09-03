import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "../../.env") });
config();

import {
  cacheIgCreatorProfilePicture,
  listActiveIgCreators,
  lookupIgCreator,
} from "../igCreators.js";

async function main() {
  const accounts = await listActiveIgCreators();
  console.log(`Refreshing avatars for ${accounts.length} creators…`);
  let ok = 0;
  let fail = 0;
  for (const a of accounts) {
    const r = await lookupIgCreator(a.handle);
    if (!r.ok) {
      fail += 1;
      console.log(`  FAIL @${a.handle}: ${r.error}`);
      continue;
    }
    await cacheIgCreatorProfilePicture(a.handle, r.profile.profilePictureUrl);
    ok += 1;
    console.log(
      `  OK @${r.profile.handle} (${r.profile.followersCount ?? "?"} followers)`,
    );
    await new Promise((res) => setTimeout(res, 200));
  }
  console.log(`Done: ${ok} ok, ${fail} fail`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
