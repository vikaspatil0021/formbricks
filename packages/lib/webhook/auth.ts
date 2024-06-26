import { unstable_cache } from "next/cache";

import { ZId } from "@formbricks/types/environment";

import { SERVICES_REVALIDATION_INTERVAL } from "../constants";
import { hasUserEnvironmentAccess } from "../environment/auth";
import { validateInputs } from "../utils/validate";
import { webhookCache } from "./cache";
import { getWebhook } from "./service";

export const canUserAccessWebhook = async (userId: string, webhookId: string): Promise<boolean> =>
  await unstable_cache(
    async () => {
      validateInputs([userId, ZId], [webhookId, ZId]);

      try {
        const webhook = await getWebhook(webhookId);
        if (!webhook) return false;

        const hasAccessToEnvironment = await hasUserEnvironmentAccess(userId, webhook.environmentId);
        if (!hasAccessToEnvironment) return false;

        return true;
      } catch (error) {
        throw error;
      }
    },
    [`canUserAccessWebhook-${userId}-${webhookId}`],
    {
      tags: [webhookCache.tag.byId(webhookId)],
      revalidate: SERVICES_REVALIDATION_INTERVAL,
    }
  )();
